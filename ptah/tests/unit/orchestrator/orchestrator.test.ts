import { describe, it, expect, beforeEach } from "vitest";
import { DefaultOrchestrator } from "../../../src/orchestrator/orchestrator.js";
import {
  FakeDiscordClient,
  FakeLogger,
  FakeRoutingEngine,
  FakeContextAssembler,
  FakeSkillInvoker,
  FakeResponsePoster,
  createThreadMessage,
  defaultTestConfig,
} from "../../fixtures/factories.js";
import { InMemoryThreadQueue } from "../../../src/orchestrator/thread-queue.js";
import { RoutingParseError } from "../../../src/orchestrator/router.js";
import { InvocationTimeoutError, InvocationError } from "../../../src/orchestrator/skill-invoker.js";
import type { PtahConfig } from "../../../src/types.js";

describe("DefaultOrchestrator", () => {
  let discord: FakeDiscordClient;
  let routingEngine: FakeRoutingEngine;
  let contextAssembler: FakeContextAssembler;
  let skillInvoker: FakeSkillInvoker;
  let responsePoster: FakeResponsePoster;
  let threadQueue: InMemoryThreadQueue;
  let logger: FakeLogger;
  let config: PtahConfig;
  let orchestrator: DefaultOrchestrator;

  beforeEach(() => {
    discord = new FakeDiscordClient();
    routingEngine = new FakeRoutingEngine();
    contextAssembler = new FakeContextAssembler();
    skillInvoker = new FakeSkillInvoker();
    responsePoster = new FakeResponsePoster();
    threadQueue = new InMemoryThreadQueue();
    logger = new FakeLogger();
    config = defaultTestConfig();

    orchestrator = new DefaultOrchestrator({
      discordClient: discord,
      routingEngine,
      contextAssembler,
      skillInvoker,
      responsePoster,
      threadQueue,
      logger,
      config,
    });
  });

  // Task 103: Bot messages ignored
  describe("bot messages ignored (AT-RP-07)", () => {
    it("does not process bot messages", async () => {
      const message = createThreadMessage({ isBot: true });

      await orchestrator.handleMessage(message);

      // Wait for queue to drain
      await waitForQueue(threadQueue, message.threadId);

      expect(routingEngine.resolveHumanCalls).toHaveLength(0);
      expect(contextAssembler.assembleCalls).toHaveLength(0);
      expect(skillInvoker.invokeCalls).toHaveLength(0);
    });
  });

  // Task 104: Human message with @mention — full happy path
  describe("human message with @mention (AT-E2E-01)", () => {
    it("resolves agent, reads history, assembles context, invokes skill, posts response", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      // Set up routing to resolve mention to dev-agent
      routingEngine.resolveHumanResult = "dev-agent";

      // Set up thread history
      discord.threadHistory.set("thread-1", []);

      // Set up context assembler result
      contextAssembler.result = {
        systemPrompt: "system prompt",
        userMessage: "user message",
        agentId: "dev-agent",
        threadId: "thread-1",
        featureName: "test-feature",
        resumePattern: "fresh",
        turnNumber: 1,
        tokenCounts: { layer1: 100, layer2: 200, layer3: 50, total: 350 },
      };

      // Set up skill invoker result
      skillInvoker.result = {
        textResponse: "I implemented the feature",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      // Set up routing engine to return terminal decision
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Verify resolveHumanMessage was called
      expect(routingEngine.resolveHumanCalls).toHaveLength(1);
      expect(routingEngine.resolveHumanCalls[0].message).toBe(message);

      // Verify thread history was read
      // (discord.readThreadHistory called — we know it returned [])

      // Verify context assembler was called with correct params
      expect(contextAssembler.assembleCalls).toHaveLength(1);
      expect(contextAssembler.assembleCalls[0].agentId).toBe("dev-agent");
      expect(contextAssembler.assembleCalls[0].threadId).toBe("thread-1");

      // Verify skill invoker was called
      expect(skillInvoker.invokeCalls).toHaveLength(1);

      // Verify response poster was called
      expect(responsePoster.postedEmbeds).toHaveLength(1);
      expect(responsePoster.postedEmbeds[0].agentId).toBe("dev-agent");
      expect(responsePoster.postedEmbeds[0].text).toBe("I implemented the feature");

      // Verify completion embed was posted (terminal signal)
      expect(responsePoster.completionEmbeds).toHaveLength(1);
    });
  });

  // Task 105: Human message with no @mention
  describe("human message with no @mention (AT-RP-09)", () => {
    it("posts system message asking user to specify target agent", async () => {
      const message = createThreadMessage({
        content: "implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = null;

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(discord.systemMessages).toHaveLength(1);
      expect(discord.systemMessages[0].threadId).toBe("thread-1");
      expect(discord.systemMessages[0].content).toContain(
        "Please @mention a role to direct your message to a specific agent."
      );

      // No further processing
      expect(contextAssembler.assembleCalls).toHaveLength(0);
      expect(skillInvoker.invokeCalls).toHaveLength(0);
    });
  });

  // Task 106: ROUTE_TO_AGENT with reply — routing loop continuation
  describe("ROUTE_TO_AGENT with reply (routing loop)", () => {
    it("loops back to context assembly with new agentId", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      // First invocation returns ROUTE_TO_AGENT reply
      skillInvoker.result = {
        textResponse: "I need PM to review",
        routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"pm-agent","thread_action":"reply"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      // Parse returns ROUTE_TO_AGENT
      routingEngine.parseResult = { type: "ROUTE_TO_AGENT", agentId: "pm-agent", threadAction: "reply" };

      // First decide returns ROUTE_TO_AGENT reply
      let decideCallCount = 0;
      routingEngine.decide = (signal, cfg) => {
        routingEngine.decideCalls.push({ signal, config: cfg });
        decideCallCount++;
        if (decideCallCount === 1) {
          return {
            signal: { type: "ROUTE_TO_AGENT", agentId: "pm-agent", threadAction: "reply" },
            targetAgentId: "pm-agent",
            isTerminal: false,
            isPaused: false,
            createNewThread: false,
          };
        }
        // Second time around: TASK_COMPLETE
        return {
          signal: { type: "TASK_COMPLETE" },
          targetAgentId: null,
          isTerminal: true,
          isPaused: false,
          createNewThread: false,
        };
      };

      // Second invocation — after re-assembly for pm-agent
      let invokeCallCount = 0;
      const originalInvoke = skillInvoker.invoke.bind(skillInvoker);
      skillInvoker.invoke = async (bundle, cfg) => {
        invokeCallCount++;
        if (invokeCallCount === 1) {
          return {
            textResponse: "I need PM to review",
            routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"pm-agent"}</routing>',
            artifactChanges: [],
            worktreePath: "/tmp/ptah-worktrees/abc",
            branch: "ptah/dev-agent/thread-1/abc",
            durationMs: 1000,
          };
        }
        // Second invocation returns TASK_COMPLETE
        routingEngine.parseResult = { type: "TASK_COMPLETE" };
        return {
          textResponse: "Review complete, LGTM",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          worktreePath: "/tmp/ptah-worktrees/def",
          branch: "ptah/pm-agent/thread-1/def",
          durationMs: 500,
        };
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Verify context was assembled twice (once for dev-agent, once for pm-agent)
      expect(contextAssembler.assembleCalls).toHaveLength(2);
      expect(contextAssembler.assembleCalls[0].agentId).toBe("dev-agent");
      expect(contextAssembler.assembleCalls[1].agentId).toBe("pm-agent");
    });
  });

  // Task 107: ROUTE_TO_AGENT with new_thread
  describe("ROUTE_TO_AGENT with new_thread", () => {
    it("creates coordination thread and enqueues processing", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "Need test-agent to create tests in a new thread",
        routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"test-agent","thread_action":"new_thread"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      routingEngine.parseResult = { type: "ROUTE_TO_AGENT", agentId: "test-agent", threadAction: "new_thread" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_AGENT", agentId: "test-agent", threadAction: "new_thread" },
        targetAgentId: "test-agent",
        isTerminal: false,
        isPaused: false,
        createNewThread: true,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Verify coordination thread was created
      expect(responsePoster.createdThreads).toHaveLength(1);
      expect(responsePoster.createdThreads[0].agentId).toBe("test-agent");
      expect(responsePoster.createdThreads[0].featureName).toBe("test-feature");
    });
  });

  // Task 108: ROUTE_TO_USER — posts system message with question
  describe("ROUTE_TO_USER (AT-RP-04)", () => {
    it("posts system message with question, thread paused", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "What framework should I use?",
        routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"What framework should I use?"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What framework should I use?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "What framework should I use?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Verify system message posted with question
      expect(discord.systemMessages).toHaveLength(1);
      expect(discord.systemMessages[0].content).toContain("What framework should I use?");
    });
  });

  // Task 109: LGTM terminal signal
  describe("LGTM terminal signal (AT-RP-03)", () => {
    it("posts completion embed, no further routing", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "Looks good to me!",
        routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      routingEngine.parseResult = { type: "LGTM" };
      routingEngine.decideResult = {
        signal: { type: "LGTM" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.completionEmbeds).toHaveLength(1);
      expect(responsePoster.completionEmbeds[0].threadId).toBe("thread-1");
      expect(responsePoster.completionEmbeds[0].agentId).toBe("dev-agent");
    });
  });

  // Task 110: TASK_COMPLETE terminal signal
  describe("TASK_COMPLETE terminal signal (AT-RP-06)", () => {
    it("posts completion embed, no further routing", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "Task is done",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.completionEmbeds).toHaveLength(1);
      expect(responsePoster.completionEmbeds[0].threadId).toBe("thread-1");
      expect(responsePoster.completionEmbeds[0].agentId).toBe("dev-agent");
    });
  });

  // Task 111: Routing parse error
  describe("routing parse error (AT-RP-02)", () => {
    it("posts error embed with routing error details", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "response with bad routing",
        routingSignalRaw: "no routing tag here",
        artifactChanges: [],
        worktreePath: "/tmp/ptah-worktrees/abc",
        branch: "ptah/dev-agent/thread-1/abc",
        durationMs: 1000,
      };

      routingEngine.parseError = new RoutingParseError("missing routing signal");

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.postedErrors).toHaveLength(1);
      expect(responsePoster.postedErrors[0].threadId).toBe("thread-1");
      expect(responsePoster.postedErrors[0].errorMessage).toContain("Routing error:");
      expect(responsePoster.postedErrors[0].errorMessage).toContain("missing routing signal");

      // Skill invoker should NOT be called again after parse error
      expect(skillInvoker.invokeCalls).toHaveLength(1);
    });
  });

  // Task 112: Skill invocation timeout
  describe("skill invocation timeout", () => {
    it("posts error embed with timeout message", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.invokeError = new InvocationTimeoutError(90_000);

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.postedErrors).toHaveLength(1);
      expect(responsePoster.postedErrors[0].errorMessage).toContain("Skill invocation timed out");
    });
  });

  // Task 113: Skill invocation API error
  describe("skill invocation API error", () => {
    it("posts error embed with error message", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.invokeError = new InvocationError(
        "Skill invocation failed: API error",
        new Error("API error"),
      );

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.postedErrors).toHaveLength(1);
      expect(responsePoster.postedErrors[0].errorMessage).toContain("Skill invocation failed:");
    });
  });

  // Task 114: Per-thread sequential processing via ThreadQueue
  describe("per-thread sequential processing (AT-RP-12, AT-RP-13)", () => {
    it("enqueues tasks via threadQueue for sequential processing", async () => {
      const message1 = createThreadMessage({
        content: "<@&111222333> first message",
        threadId: "thread-1",
        id: "msg-1",
      });
      const message2 = createThreadMessage({
        content: "<@&111222333> second message",
        threadId: "thread-1",
        id: "msg-2",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      // Enqueue two messages for same thread
      await orchestrator.handleMessage(message1);
      await orchestrator.handleMessage(message2);

      await waitForQueue(threadQueue, "thread-1");

      // Both should have been processed sequentially
      expect(skillInvoker.invokeCalls).toHaveLength(2);
    });

    it("processes messages from different threads independently", async () => {
      const message1 = createThreadMessage({
        content: "<@&111222333> message A",
        threadId: "thread-A",
        id: "msg-A",
      });
      const message2 = createThreadMessage({
        content: "<@&111222333> message B",
        threadId: "thread-B",
        id: "msg-B",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-A", []);
      discord.threadHistory.set("thread-B", []);

      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message1);
      await orchestrator.handleMessage(message2);

      await waitForQueue(threadQueue, "thread-A");
      await waitForQueue(threadQueue, "thread-B");

      expect(skillInvoker.invokeCalls).toHaveLength(2);
    });
  });

  // Task 115: startup()
  describe("startup()", () => {
    it("calls skillInvoker.pruneOrphanedWorktrees()", async () => {
      discord.channels.set("agent-debug", "debug-channel-123");

      await orchestrator.startup();

      expect(skillInvoker.pruned).toBe(true);
    });

    it("resolves debug channel via discordClient.findChannelByName()", async () => {
      discord.channels.set("agent-debug", "debug-channel-123");

      await orchestrator.startup();

      // Verify it tried to find the debug channel
      // The FakeDiscordClient.findChannelByName checks the channels map
      expect(logger.messages).toContainEqual(
        expect.objectContaining({
          level: "info",
          message: expect.stringContaining("debug"),
        }),
      );
    });

    it("pruneOrphanedWorktrees failure is best-effort — log warning, continue startup", async () => {
      discord.channels.set("agent-debug", "debug-channel-123");

      // Make pruneOrphanedWorktrees throw
      skillInvoker.pruneOrphanedWorktrees = async () => {
        throw new Error("prune failed");
      };

      // Should not throw
      await orchestrator.startup();

      // Should log a warning
      const warnLog = logger.messages.find(
        (m) => m.level === "warn" && m.message.includes("prune"),
      );
      expect(warnLog).toBeDefined();
    });
  });
});

async function waitForQueue(queue: InMemoryThreadQueue, threadId: string, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (queue.isProcessing(threadId) && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
