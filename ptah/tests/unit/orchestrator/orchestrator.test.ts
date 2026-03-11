import { describe, it, expect, beforeEach } from "vitest";
import { DefaultOrchestrator } from "../../../src/orchestrator/orchestrator.js";
import {
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
  FakeQuestionStore,
  FakeQuestionPoller,
  FakePatternBContextBuilder,
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
  let gitClient: FakeGitClient;
  let artifactCommitter: FakeArtifactCommitter;
  let agentLogWriter: FakeAgentLogWriter;
  let messageDeduplicator: FakeMessageDeduplicator;
  let questionStore: FakeQuestionStore;
  let questionPoller: FakeQuestionPoller;
  let patternBContextBuilder: FakePatternBContextBuilder;
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
    gitClient = new FakeGitClient();
    artifactCommitter = new FakeArtifactCommitter();
    agentLogWriter = new FakeAgentLogWriter();
    messageDeduplicator = new FakeMessageDeduplicator();
    questionStore = new FakeQuestionStore();
    questionPoller = new FakeQuestionPoller();
    patternBContextBuilder = new FakePatternBContextBuilder();

    orchestrator = new DefaultOrchestrator({
      discordClient: discord,
      routingEngine,
      contextAssembler,
      skillInvoker,
      responsePoster,
      threadQueue,
      logger,
      config,
      gitClient,
      artifactCommitter,
      agentLogWriter,
      messageDeduplicator,
      questionStore,
      questionPoller,
      patternBContextBuilder,
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
      skillInvoker.invoke = async (bundle, cfg, worktreePath) => {
        invokeCallCount++;
        if (invokeCallCount === 1) {
          return {
            textResponse: "I need PM to review",
            routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"pm-agent"}</routing>',
            artifactChanges: [],
            durationMs: 1000,
          };
        }
        // Second invocation returns TASK_COMPLETE
        routingEngine.parseResult = { type: "TASK_COMPLETE" };
        return {
          textResponse: "Review complete, LGTM",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
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

  // =============================================
  // Phase 4 Tasks 61-74
  // =============================================

  // Task 61: Dedup — duplicate message skipped
  describe("dedup — duplicate message skipped (Task 61)", () => {
    it("skips processing when messageDeduplicator.isDuplicate returns true", async () => {
      const message = createThreadMessage({
        id: "dup-msg-1",
        content: "<@&111222333> implement",
        threadId: "thread-1",
      });

      // Mark as duplicate
      messageDeduplicator.duplicateIds.add("dup-msg-1");

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // No routing, no invocation
      expect(routingEngine.resolveHumanCalls).toHaveLength(0);
      expect(contextAssembler.assembleCalls).toHaveLength(0);
      expect(skillInvoker.invokeCalls).toHaveLength(0);

      // Warning logged
      const warnLog = logger.messages.find(
        (m) => m.level === "warn" && m.message.includes("duplicate"),
      );
      expect(warnLog).toBeDefined();
    });
  });

  // Task 62: Malformed message (no ID)
  describe("malformed message — no ID (Task 62)", () => {
    it("skips with warning when message id is empty string", async () => {
      const message = createThreadMessage({
        id: "",
        content: "<@&111222333> implement",
        threadId: "thread-1",
      });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(routingEngine.resolveHumanCalls).toHaveLength(0);
      expect(skillInvoker.invokeCalls).toHaveLength(0);

      const warnLog = logger.messages.find(
        (m) => m.level === "warn" && m.message.includes("no ID"),
      );
      expect(warnLog).toBeDefined();
    });
  });

  // Task 63: Flow reorder — worktree created before context assembly
  describe("flow reorder — worktree before context assembly (Task 63)", () => {
    it("creates worktree before assembling context, passes worktreePath to assembler and invoker", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
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

      // Track ordering
      const callOrder: string[] = [];
      const origCreateWorktree = gitClient.createWorktree.bind(gitClient);
      gitClient.createWorktree = async (branch: string, path: string) => {
        callOrder.push("createWorktree");
        return origCreateWorktree(branch, path);
      };

      const origAssemble = contextAssembler.assemble.bind(contextAssembler);
      contextAssembler.assemble = async (params: Parameters<typeof contextAssembler.assemble>[0]) => {
        callOrder.push("assemble");
        return origAssemble(params);
      };

      const origInvoke = skillInvoker.invoke.bind(skillInvoker);
      skillInvoker.invoke = async (bundle, cfg, worktreePath) => {
        callOrder.push("invoke");
        return origInvoke(bundle, cfg, worktreePath);
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Verify ordering
      expect(callOrder.indexOf("createWorktree")).toBeLessThan(callOrder.indexOf("assemble"));
      expect(callOrder.indexOf("assemble")).toBeLessThan(callOrder.indexOf("invoke"));

      // Verify worktree was created
      expect(gitClient.createdWorktrees).toHaveLength(1);

      // Verify worktreePath was passed to assembler
      expect(contextAssembler.assembleCalls).toHaveLength(1);
      const assembleCall = contextAssembler.assembleCalls[0] as { worktreePath?: string };
      expect(assembleCall.worktreePath).toBeDefined();
      expect(typeof assembleCall.worktreePath).toBe("string");

      // Verify worktreePath was passed to invoker
      expect(skillInvoker.invokeCalls).toHaveLength(1);
      const invokeCall = skillInvoker.invokeCalls[0] as { worktreePath?: string };
      expect(invokeCall.worktreePath).toBeDefined();
    });
  });

  // Task 64: Branch-already-exists guard
  describe("branch-already-exists guard (Task 64)", () => {
    it("regenerates invocationId when branch exists with unmerged commits", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
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

      // First call: branch exists with unmerged commits
      // Second call: branch doesn't exist
      let branchExistsCalls = 0;
      gitClient.branchExists = async (branch: string) => {
        branchExistsCalls++;
        return branchExistsCalls === 1;
      };
      gitClient.hasUnmergedCommitsResult = true;

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Should still succeed (with regenerated branch)
      expect(skillInvoker.invokeCalls).toHaveLength(1);
      // Branch exists was called at least once
      expect(branchExistsCalls).toBeGreaterThanOrEqual(1);
    });

    it("deletes leftover branch when branch exists with no unmerged commits", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
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

      // First branchExists call returns true, subsequent false
      let branchExistsCalls = 0;
      gitClient.branchExists = async (branch: string) => {
        branchExistsCalls++;
        return branchExistsCalls === 1;
      };
      gitClient.hasUnmergedCommitsResult = false;

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Branch should have been deleted
      expect(gitClient.deletedBranches.length).toBeGreaterThanOrEqual(1);
      expect(skillInvoker.invokeCalls).toHaveLength(1);
    });
  });

  // Task 65: Commit/merge success — full pipeline
  describe("commit/merge success — full pipeline (Task 65)", () => {
    it("calls artifactCommitter.commitAndMerge and writes log with completed status", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "I implemented the feature",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: ["docs/test-feature/spec.md"],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: "abc1234",
        mergeStatus: "merged",
        branch: "ptah/dev-agent/thread-1/abc",
      }];

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

      // Verify artifactCommitter was called
      expect(artifactCommitter.commitAndMergeCalls).toHaveLength(1);
      expect(artifactCommitter.commitAndMergeCalls[0].agentId).toBe("dev-agent");
      expect(artifactCommitter.commitAndMergeCalls[0].artifactChanges).toEqual(["docs/test-feature/spec.md"]);

      // Verify log entry written with completed status
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("completed");
      expect(agentLogWriter.entries[0].commitSha).toBe("abc1234");
      expect(agentLogWriter.entries[0].agentId).toBe("dev-agent");
    });
  });

  // Task 66: Merge conflict continues
  describe("merge conflict continues (Task 66)", () => {
    it("posts error embed but still posts response and routes", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "I made changes",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: ["docs/test-feature/spec.md"],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: "abc1234",
        mergeStatus: "conflict",
        branch: "ptah/dev-agent/thread-1/abc",
        conflictMessage: "CONFLICT in docs/test-feature/spec.md",
      }];

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

      // Error embed posted about conflict
      expect(responsePoster.postedErrors.length).toBeGreaterThanOrEqual(1);

      // Agent response still posted
      expect(responsePoster.postedEmbeds).toHaveLength(1);
      expect(responsePoster.postedEmbeds[0].text).toBe("I made changes");

      // Routing still happened
      expect(responsePoster.completionEmbeds).toHaveLength(1);

      // Log entry written with conflict status
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("conflict");
    });
  });

  // Task 67: Commit failure continues
  describe("commit failure continues (Task 67)", () => {
    it("posts error embed, cleans up worktree, still posts response and routes", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "I made changes",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: ["docs/test-feature/spec.md"],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: null,
        mergeStatus: "commit-error",
        branch: "ptah/dev-agent/thread-1/abc",
        conflictMessage: "git commit failed",
      }];

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

      // Error embed posted
      expect(responsePoster.postedErrors.length).toBeGreaterThanOrEqual(1);

      // Agent response still posted
      expect(responsePoster.postedEmbeds).toHaveLength(1);

      // Routing still happened
      expect(responsePoster.completionEmbeds).toHaveLength(1);

      // Log entry with error status
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 68: Merge error continues
  describe("merge error continues (Task 68)", () => {
    it("posts error embed, worktree retained, still posts response", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "I made changes",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: ["docs/test-feature/spec.md"],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: "abc1234",
        mergeStatus: "merge-error",
        branch: "ptah/dev-agent/thread-1/abc",
        conflictMessage: "merge failed unexpectedly",
      }];

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

      // Error embed posted
      expect(responsePoster.postedErrors.length).toBeGreaterThanOrEqual(1);

      // Agent response still posted
      expect(responsePoster.postedEmbeds).toHaveLength(1);

      // Log entry with conflict status (per FSPEC AT-AC-16)
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("conflict");
    });
  });

  // Task 69: Lock timeout
  describe("lock timeout (Task 69)", () => {
    it("posts error embed, worktree retained, writes log with error status", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "I made changes",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: ["docs/test-feature/spec.md"],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: null,
        mergeStatus: "lock-timeout",
        branch: "ptah/dev-agent/thread-1/abc",
      }];

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

      // Error embed posted
      expect(responsePoster.postedErrors.length).toBeGreaterThanOrEqual(1);
      expect(responsePoster.postedErrors[0].errorMessage).toContain("lock timeout");

      // Log entry with error status
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 70: Log entry always written
  describe("log entry always written (Task 70)", () => {
    const mergeStatuses = [
      { mergeStatus: "merged" as const, expectedLogStatus: "completed" },
      { mergeStatus: "no-changes" as const, expectedLogStatus: "completed (no changes)" },
      { mergeStatus: "conflict" as const, expectedLogStatus: "conflict" },
      { mergeStatus: "commit-error" as const, expectedLogStatus: "error" },
      { mergeStatus: "merge-error" as const, expectedLogStatus: "conflict" },
      { mergeStatus: "lock-timeout" as const, expectedLogStatus: "error" },
    ];

    for (const { mergeStatus, expectedLogStatus } of mergeStatuses) {
      it(`writes log with status "${expectedLogStatus}" for mergeStatus "${mergeStatus}"`, async () => {
        const message = createThreadMessage({
          content: "<@&111222333> implement",
          threadId: "thread-1",
          threadName: "test-feature",
        });

        routingEngine.resolveHumanResult = "dev-agent";
        discord.threadHistory.set("thread-1", []);

        skillInvoker.result = {
          textResponse: "done",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: mergeStatus === "no-changes" ? [] : ["docs/x.md"],
          durationMs: 1000,
        };

        artifactCommitter.results = [{
          commitSha: mergeStatus === "merged" ? "abc1234" : null,
          mergeStatus,
          branch: "ptah/dev-agent/thread-1/abc",
        }];

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

        expect(agentLogWriter.entries).toHaveLength(1);
        expect(agentLogWriter.entries[0].status).toBe(expectedLogStatus);
      });
    }
  });

  // Task 71: No-changes cleanup
  describe("no-changes cleanup (Task 71)", () => {
    it("cleans up worktree and branch when no changes", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.result = {
        textResponse: "Nothing to change",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        durationMs: 1000,
      };

      artifactCommitter.results = [{
        commitSha: null,
        mergeStatus: "no-changes",
        branch: "ptah/dev-agent/thread-1/abc",
      }];

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

      // Worktree should be cleaned up
      expect(gitClient.removedWorktrees.length).toBeGreaterThanOrEqual(1);
      expect(gitClient.deletedBranches.length).toBeGreaterThanOrEqual(1);

      // Log entry with completed (no changes)
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("completed (no changes)");
    });
  });

  // Task 72: Skill timeout — cleanup worktree, write error log
  describe("skill timeout — cleanup and error log (Task 72)", () => {
    it("cleans up worktree, posts error embed, writes error log on timeout", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      skillInvoker.invokeError = new InvocationTimeoutError(90_000);

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Error embed posted
      expect(responsePoster.postedErrors).toHaveLength(1);
      expect(responsePoster.postedErrors[0].errorMessage).toContain("timed out");

      // Worktree cleaned up
      expect(gitClient.removedWorktrees.length).toBeGreaterThanOrEqual(1);

      // Error log entry written
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");

      // No commit/merge
      expect(artifactCommitter.commitAndMergeCalls).toHaveLength(0);
    });
  });

  // Task 73: Worktree creation failure
  describe("worktree creation failure (Task 73)", () => {
    it("posts error embed, no cleanup needed, writes error log", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", []);

      gitClient.createWorktreeError = new Error("worktree creation failed");

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Error embed posted
      expect(responsePoster.postedErrors).toHaveLength(1);
      expect(responsePoster.postedErrors[0].errorMessage).toContain("Worktree creation failed");

      // No skill invocation
      expect(skillInvoker.invokeCalls).toHaveLength(0);

      // Error log entry written
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 74: Orphan prune updated
  describe("orphan prune (Task 74)", () => {
    it("startup delegates pruning to skillInvoker.pruneOrphanedWorktrees", async () => {
      discord.channels.set("agent-debug", "debug-channel-123");

      await orchestrator.startup();

      expect(skillInvoker.pruned).toBe(true);
    });
  });
});

async function waitForQueue(queue: InMemoryThreadQueue, threadId: string, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (queue.isProcessing(threadId) && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
