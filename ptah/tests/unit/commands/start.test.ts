import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StartCommand } from "../../../src/commands/start.js";
import {
  FakeConfigLoader,
  FakeDiscordClient,
  FakeLogger,
  defaultTestConfig,
} from "../../fixtures/factories.js";
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
});
