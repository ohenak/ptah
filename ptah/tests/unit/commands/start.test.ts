import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StartCommand } from "../../../src/commands/start.js";
import {
  FakeConfigLoader,
  FakeDiscordClient,
  FakeLogger,
  FakeRoutingEngine,
  FakeContextAssembler,
  FakeSkillInvoker,
  FakeResponsePoster,
  FakeGitClient,
  FakeArtifactCommitter,
  FakeAgentLogWriter,
  FakeMessageDeduplicator,
  defaultTestConfig,
  createThreadMessage,
} from "../../fixtures/factories.js";
import { DefaultOrchestrator } from "../../../src/orchestrator/orchestrator.js";
import { InMemoryThreadQueue } from "../../../src/orchestrator/thread-queue.js";
import type { ThreadMessage } from "../../../src/types.js";

describe("StartCommand", () => {
  let configLoader: FakeConfigLoader;
  let discord: FakeDiscordClient;
  let logger: FakeLogger;
  let command: StartCommand;
  let savedToken: string | undefined;

  beforeEach(() => {
    configLoader = new FakeConfigLoader();
    discord = new FakeDiscordClient();
    logger = new FakeLogger();
    command = new StartCommand(configLoader, discord, logger);

    // Save and set env var
    savedToken = process.env.DISCORD_BOT_TOKEN;
    process.env.DISCORD_BOT_TOKEN = "test-token";

    // Default: channel exists
    discord.channels.set("agent-updates", "channel-123");
  });

  afterEach(() => {
    // Restore env var
    if (savedToken === undefined) {
      delete process.env.DISCORD_BOT_TOKEN;
    } else {
      process.env.DISCORD_BOT_TOKEN = savedToken;
    }
  });

  // Task 17: Happy path
  describe("happy path", () => {
    it("orchestrates full startup sequence", async () => {
      const result = await command.execute();

      // Calls configLoader.load() - verified implicitly by not throwing
      // Calls discord.connect with the token from env
      expect(discord.connected).toBe(true);
      expect(discord.loginToken).toBe("test-token");

      // Registers a listener via onThreadMessage
      expect(discord.registeredHandlers).toHaveLength(1);
      expect(discord.registeredHandlers[0].parentChannelId).toBe("channel-123");

      // Returns StartResult with cleanup function
      expect(result).toBeDefined();
      expect(typeof result.cleanup).toBe("function");

      // O-02: Verify orchestration sequence via logger output
      expect(logger.messages).toContainEqual({ level: "info", message: "Connected to Discord server" });
      expect(logger.messages).toContainEqual({ level: "info", message: "Listening on #agent-updates" });
    });
  });

  // Task 18: Env var validation
  describe("env var validation", () => {
    it("throws when env var is not set", async () => {
      delete process.env.DISCORD_BOT_TOKEN;

      await expect(command.execute()).rejects.toThrow(
        "Environment variable DISCORD_BOT_TOKEN is not set."
      );
    });

    it("throws when env var is empty string", async () => {
      process.env.DISCORD_BOT_TOKEN = "";

      await expect(command.execute()).rejects.toThrow(
        "Environment variable DISCORD_BOT_TOKEN is not set."
      );
    });
  });

  // Task 19: Channel not found
  describe("channel not found", () => {
    it("throws when channel is not found in server", async () => {
      discord.channels.clear();

      await expect(command.execute()).rejects.toThrow(
        "Channel #agent-updates not found in server."
      );
    });
  });

  // Task 20: Discord connection failure
  describe("discord connection failure", () => {
    it("propagates error from discord.connect()", async () => {
      discord.connectError = new Error("Connection failed");

      await expect(command.execute()).rejects.toThrow("Connection failed");
    });
  });

  // Task 21: Config loader error propagation
  describe("config loader error", () => {
    it("propagates errors from configLoader.load()", async () => {
      configLoader.loadError = new Error("Config error");

      await expect(command.execute()).rejects.toThrow("Config error");
    });
  });

  // Task 22: Message detection
  describe("message detection", () => {
    it("logs message when thread message is received", async () => {
      await command.execute();

      const message: ThreadMessage = {
        id: "msg-1",
        threadId: "thread-1",
        threadName: "feature-discussion",
        parentChannelId: "channel-123",
        authorId: "user-1",
        authorName: "Alice",
        isBot: false,
        content: "Hello world",
        timestamp: new Date("2026-03-09T12:00:00Z"),
      };

      await discord.simulateMessage(message);

      const detected = logger.messages.find(
        (m) =>
          m.level === "info" &&
          m.message.includes("Message detected in thread: feature-discussion by Alice")
      );
      expect(detected).toBeDefined();
    });
  });

  // Task 23: Cleanup function
  describe("cleanup", () => {
    it("disconnects and logs shutdown message", async () => {
      const result = await command.execute();

      await result.cleanup();

      expect(discord.disconnected).toBe(true);

      const shutdownLog = logger.messages.find(
        (m) => m.level === "info" && m.message === "Disconnected from Discord."
      );
      expect(shutdownLog).toBeDefined();
    });
  });

  // Task 24: Startup logging
  describe("startup logging", () => {
    it("logs connection and channel resolution messages", async () => {
      await command.execute();

      const connectedLog = logger.messages.find(
        (m) => m.level === "info" && m.message === "Connected to Discord server"
      );
      expect(connectedLog).toBeDefined();

      const listeningLog = logger.messages.find(
        (m) => m.level === "info" && m.message === "Listening on #agent-updates"
      );
      expect(listeningLog).toBeDefined();
    });
  });

  // Task 136: Orchestrator integration
  describe("orchestrator integration", () => {
    let orchestratorLogger: FakeLogger;
    let skillInvoker: FakeSkillInvoker;
    let routingEngine: FakeRoutingEngine;
    let orchestrator: DefaultOrchestrator;

    beforeEach(() => {
      orchestratorLogger = new FakeLogger();
      skillInvoker = new FakeSkillInvoker();
      routingEngine = new FakeRoutingEngine();

      orchestrator = new DefaultOrchestrator({
        discordClient: discord,
        routingEngine,
        contextAssembler: new FakeContextAssembler(),
        skillInvoker,
        responsePoster: new FakeResponsePoster(),
        threadQueue: new InMemoryThreadQueue(),
        logger: orchestratorLogger,
        config: defaultTestConfig(),
        gitClient: new FakeGitClient(),
        artifactCommitter: new FakeArtifactCommitter(),
        agentLogWriter: new FakeAgentLogWriter(),
        messageDeduplicator: new FakeMessageDeduplicator(),
      });

      command = new StartCommand(configLoader, discord, logger, {
        orchestrator,
        checkClaudeCode: async () => {}, // Skip check in tests
      });

      // Debug channel for orchestrator.startup()
      discord.channels.set("agent-debug", "debug-channel-id");
    });

    it("calls orchestrator.startup() before accepting messages", async () => {
      await command.execute();

      // Verify pruneOrphanedWorktrees was called (via startup)
      expect(skillInvoker.pruned).toBe(true);
    });

    it("uses orchestrator.handleMessage() as the thread message handler", async () => {
      routingEngine.resolveHumanResult = "dev-agent";
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
      discord.threadHistory.set("thread-1", []);

      await command.execute();

      const message = createThreadMessage({
        parentChannelId: "channel-123",
        threadId: "thread-1",
        content: "<@&111222333> implement feature",
      });

      await discord.simulateMessage(message);

      // Wait briefly for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The message should have been processed by orchestrator, not just logged
      expect(routingEngine.resolveHumanCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Task 63: Cleanup ordering — shutdown before disconnect
  describe("cleanup ordering — shutdown before disconnect (Task 63)", () => {
    it("calls orchestrator.shutdown() before discord.disconnect()", async () => {
      const callOrder: string[] = [];

      const fakeOrchestrator = {
        handleMessage: async () => {},
        startup: async () => {},
        shutdown: async () => { callOrder.push("shutdown"); },
        resumeWithPatternB: async () => {},
      };

      const origDisconnect = discord.disconnect.bind(discord);
      discord.disconnect = async () => {
        callOrder.push("disconnect");
        return origDisconnect();
      };

      discord.channels.set("agent-debug", "debug-channel-id");

      const cmd = new StartCommand(configLoader, discord, logger, {
        orchestrator: fakeOrchestrator,
        checkClaudeCode: async () => {},
      });

      const result = await cmd.execute();
      await result.cleanup();

      expect(callOrder).toEqual(["shutdown", "disconnect"]);
    });
  });

  // Task 137: Claude Code availability check
  describe("claude code validation", () => {
    it("throws with guidance when Claude Code SDK is not available", async () => {
      const orchestrator = new DefaultOrchestrator({
        discordClient: discord,
        routingEngine: new FakeRoutingEngine(),
        contextAssembler: new FakeContextAssembler(),
        skillInvoker: new FakeSkillInvoker(),
        responsePoster: new FakeResponsePoster(),
        threadQueue: new InMemoryThreadQueue(),
        logger: new FakeLogger(),
        config: defaultTestConfig(),
        gitClient: new FakeGitClient(),
        artifactCommitter: new FakeArtifactCommitter(),
        agentLogWriter: new FakeAgentLogWriter(),
        messageDeduplicator: new FakeMessageDeduplicator(),
      });

      const cmdWithCheck = new StartCommand(configLoader, discord, logger, {
        orchestrator,
        checkClaudeCode: async () => {
          throw new Error(
            "Claude Code SDK not available. Install it with: npm install @anthropic-ai/claude-code",
          );
        },
      });

      await expect(cmdWithCheck.execute()).rejects.toThrow(
        "Claude Code SDK not available",
      );
    });

    it("succeeds when Claude Code SDK is available", async () => {
      const orchestrator = new DefaultOrchestrator({
        discordClient: discord,
        routingEngine: new FakeRoutingEngine(),
        contextAssembler: new FakeContextAssembler(),
        skillInvoker: new FakeSkillInvoker(),
        responsePoster: new FakeResponsePoster(),
        threadQueue: new InMemoryThreadQueue(),
        logger: new FakeLogger(),
        config: defaultTestConfig(),
        gitClient: new FakeGitClient(),
        artifactCommitter: new FakeArtifactCommitter(),
        agentLogWriter: new FakeAgentLogWriter(),
        messageDeduplicator: new FakeMessageDeduplicator(),
      });

      discord.channels.set("agent-debug", "debug-channel-id");

      const cmdWithCheck = new StartCommand(configLoader, discord, logger, {
        orchestrator,
        checkClaudeCode: async () => {
          // SDK available — no-op
        },
      });

      const result = await cmdWithCheck.execute();
      expect(result).toBeDefined();
      expect(typeof result.cleanup).toBe("function");
    });
  });
});
