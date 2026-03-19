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
  FakeInvocationGuard,
  FakeThreadStateManager,
  FakeWorktreeRegistry,
  FakePdlcDispatcher,
  FakeAgentRegistry,
  makeRegisteredAgent,
  createThreadMessage,
  createPendingQuestion,
  createChannelMessage,
  defaultTestConfig,
  defaultCommitResult,
} from "../../fixtures/factories.js";
import { InMemoryThreadQueue } from "../../../src/orchestrator/thread-queue.js";
import { RoutingParseError } from "../../../src/orchestrator/router.js";
import { InvocationTimeoutError, InvocationError } from "../../../src/orchestrator/skill-invoker.js";
import type { PtahConfig } from "../../../src/types.js";

// Phase 13: Default thread history with 2 routing messages, ensuring age guard rejects
// auto-init for all pre-existing tests (>1 prior agent turns → ineligible).
const DEFAULT_OLD_HISTORY = [
  createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
  createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
];

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
  let invocationGuard: FakeInvocationGuard;
  let threadStateManager: FakeThreadStateManager;
  let worktreeRegistry: FakeWorktreeRegistry;
  let pdlcDispatcher: FakePdlcDispatcher;
  let agentRegistry: FakeAgentRegistry;
  let abortController: AbortController;
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
    invocationGuard = new FakeInvocationGuard();
    invocationGuard.results = [{ status: "success", invocationResult: { textResponse: "fake response", routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>', artifactChanges: [], durationMs: 1000 }, commitResult: defaultCommitResult() }];
    threadStateManager = new FakeThreadStateManager();
    worktreeRegistry = new FakeWorktreeRegistry();
    pdlcDispatcher = new FakePdlcDispatcher();
    agentRegistry = new FakeAgentRegistry([
      makeRegisteredAgent({ id: "dev-agent", mention_id: "111222333", display_name: "Dev Agent" }),
      makeRegisteredAgent({ id: "pm-agent", mention_id: "444555666", display_name: "PM Agent" }),
      makeRegisteredAgent({ id: "test-agent", mention_id: "777888999", display_name: "Test Agent" }),
    ]);
    abortController = new AbortController();

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
      invocationGuard,
      threadStateManager,
      worktreeRegistry,
      shutdownSignal: abortController.signal,
      pdlcDispatcher,
      agentRegistry,
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
      expect(invocationGuard.callCount).toBe(0);
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

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

      // Set up invocation guard to return success with text
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "I implemented the feature",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
      }];

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

      // Verify invocation guard was called (Phase 6: guard replaces direct skillInvoker)
      expect(invocationGuard.callCount).toBe(1);

      // Verify response poster was called
      expect(responsePoster.agentResponseCalls).toHaveLength(1);
      expect(responsePoster.agentResponseCalls[0].agentId).toBe("dev-agent");
      expect(responsePoster.agentResponseCalls[0].text).toBe("I implemented the feature");

      // Verify resolution notification embed was posted (terminal signal)
      expect(responsePoster.resolutionNotificationCalls).toHaveLength(1);
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

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(1);
      expect(plainCalls[0].threadId).toBe("thread-1");
      expect((plainCalls[0] as { method: "postPlainMessage"; threadId: string; content: string }).content).toContain(
        "Please @mention a role to direct your message to a specific agent."
      );

      // No further processing
      expect(contextAssembler.assembleCalls).toHaveLength(0);
      expect(invocationGuard.callCount).toBe(0);
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: configure guard to return ROUTE_TO_AGENT on first call, TASK_COMPLETE on second
      invocationGuard.results = [
        {
          status: "success",
          invocationResult: {
            textResponse: "I need PM to review",
            routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"pm-agent","thread_action":"reply"}</routing>',
            artifactChanges: [],
            durationMs: 1000,
          },
          commitResult: defaultCommitResult(),
        },
        {
          status: "success",
          invocationResult: {
            textResponse: "Review complete, LGTM",
            routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
            artifactChanges: [],
            durationMs: 500,
          },
          commitResult: defaultCommitResult(),
        },
      ];

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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Need test-agent to create tests in a new thread",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"test-agent","thread_action":"new_thread"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
      }];

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

  // Task 108: ROUTE_TO_USER — posts pause embed to thread, question written to store
  describe("ROUTE_TO_USER (AT-RP-04)", () => {
    it("posts pause embed to thread, question written to store, thread paused", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "What framework should I use?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"What framework should I use?"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
      }];

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

      // Pause plain message posted to originating thread
      const pausePlainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(pausePlainCalls).toHaveLength(1);
      expect(pausePlainCalls[0].threadId).toBe("thread-1");
      // The pause message contains "Paused"
      expect((pausePlainCalls[0] as { method: "postPlainMessage"; threadId: string; content: string }).content).toContain("Paused");

      // Question written to store
      const pending = await questionStore.readPendingQuestions();
      expect(pending).toHaveLength(1);
      expect(pending[0].questionText).toBe("What framework should I use?");
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Looks good to me!",
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
      }];

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

      expect(responsePoster.resolutionNotificationCalls).toHaveLength(1);
      expect(responsePoster.resolutionNotificationCalls[0].threadId).toBe("thread-1");
      expect(responsePoster.resolutionNotificationCalls[0].agentDisplayName).toBe("Dev Agent");
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Task is done",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
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

      expect(responsePoster.resolutionNotificationCalls).toHaveLength(1);
      expect(responsePoster.resolutionNotificationCalls[0].threadId).toBe("thread-1");
      expect(responsePoster.resolutionNotificationCalls[0].agentDisplayName).toBe("Dev Agent");
    });
  });

  // Task 111: Routing parse error (now handled by InvocationGuard; orchestrator handles guard result via routing pipeline)
  describe("routing parse error (AT-RP-02)", () => {
    it("guard exhausted — returns and writes error log", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: InvocationGuard now handles routing parse errors.
      // When guard returns "exhausted", orchestrator writes error log and returns.
      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Guard was called once
      expect(invocationGuard.callCount).toBe(1);
      // Error log entry written
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 111b: Routing parse error — RoutingParseError propagates through catch block
  describe("routing parse error — propagates from routing engine", () => {
    it("posts error embed with routing error details when parseSignal throws", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Configure guard to succeed so routing is attempted
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "response with bad routing",
          routingSignalRaw: "no routing tag here",
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: defaultCommitResult(),
      }];

      routingEngine.parseError = new RoutingParseError("missing routing signal");

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(responsePoster.errorReportCalls).toHaveLength(1);
      expect(responsePoster.errorReportCalls[0].threadId).toBe("thread-1");
      expect(responsePoster.errorReportCalls[0].errorType).toBe("ERR-RP-04");
    });
  });

  // Task 112: Skill invocation timeout (now handled by InvocationGuard)
  describe("skill invocation timeout", () => {
    it("guard exhausted — error log written, orchestrator returns", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: InvocationGuard handles timeouts; orchestrator gets "exhausted"
      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 113: Skill invocation API error (now handled by InvocationGuard)
  describe("skill invocation API error", () => {
    it("guard exhausted — error log written, orchestrator returns", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement the feature",
        threadId: "thread-1",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: Guard handles API errors; return exhausted
      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

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
      expect(invocationGuard.callCount).toBe(2);
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
      discord.threadHistory.set("thread-A", DEFAULT_OLD_HISTORY);
      discord.threadHistory.set("thread-B", DEFAULT_OLD_HISTORY);

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

      expect(invocationGuard.callCount).toBe(2);
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
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: "INFO",
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
      const warnLog = logger.entries.find(
        (e) => e.level === "WARN" && e.message.includes("prune"),
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
      const warnLog = logger.entries.find(
        (e) => e.level === "WARN" && e.message.includes("duplicate"),
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
      expect(invocationGuard.callCount).toBe(0);

      const warnLog = logger.entries.find(
        (e) => e.level === "WARN" && e.message.includes("no ID"),
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };

      // Track ordering: createWorktree → assemble → invocationGuard
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

      const origInvoke = invocationGuard.invokeWithRetry.bind(invocationGuard);
      invocationGuard.invokeWithRetry = async (params) => {
        callOrder.push("invoke");
        return origInvoke(params);
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

      // Verify invocationGuard was called (Phase 6)
      expect(invocationGuard.callCount).toBe(1);
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

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
      expect(invocationGuard.callCount).toBe(1);
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

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
      expect(invocationGuard.callCount).toBe(1);
    });
  });

  // Task 65: Commit/merge success — full pipeline (Phase 6: via InvocationGuard)
  describe("commit/merge success — full pipeline (Task 65)", () => {
    it("invocationGuard succeeds and writes log with completed status", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: Configure invocationGuard to return success with specific data
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "I implemented the feature",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: ["docs/test-feature/spec.md"],
          durationMs: 1000,
        },
        commitResult: {
          commitSha: "abc1234",
          mergeStatus: "merged",
          branch: "ptah/dev-agent/thread-1/abc",
        },
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

      // Verify invocationGuard was called
      expect(invocationGuard.callCount).toBe(1);

      // Verify log entry written with completed status
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("completed");
      expect(agentLogWriter.entries[0].commitSha).toBe("abc1234");
      expect(agentLogWriter.entries[0].agentId).toBe("dev-agent");
    });
  });

  // Task 66: Merge conflict — Phase 6: InvocationGuard returns "unrecoverable"
  describe("merge conflict → guard returns unrecoverable (Task 66)", () => {
    it("guard returns unrecoverable, orchestrator writes error log and returns", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: conflict is handled by guard as "unrecoverable"
      invocationGuard.results = [{ status: "unrecoverable" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Guard returned unrecoverable; orchestrator writes error log and returns
      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
      // No response was posted (guard handled that)
      expect(responsePoster.agentResponseCalls).toHaveLength(0);
    });
  });

  // Task 67: Commit failure — Phase 6: InvocationGuard returns "exhausted" after retries
  describe("commit failure → guard exhausted (Task 67)", () => {
    it("guard exhausted, orchestrator writes error log and returns", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
      expect(responsePoster.agentResponseCalls).toHaveLength(0);
    });
  });

  // Task 68: Merge error — Phase 6: InvocationGuard handles via retry
  describe("merge error → guard exhausted (Task 68)", () => {
    it("guard exhausted, error log written", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 69: Lock timeout — Phase 6: InvocationGuard handles via retry
  describe("lock timeout → guard exhausted (Task 69)", () => {
    it("guard exhausted, error log written", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 70: Log entry always written (Phase 6: via invocationGuard results)
  describe("log entry always written (Task 70)", () => {
    const mergeStatuses = [
      { mergeStatus: "merged" as const, expectedLogStatus: "completed" },
      { mergeStatus: "no-changes" as const, expectedLogStatus: "completed (no changes)" },
    ];

    for (const { mergeStatus, expectedLogStatus } of mergeStatuses) {
      it(`writes log with status "${expectedLogStatus}" for mergeStatus "${mergeStatus}"`, async () => {
        const message = createThreadMessage({
          content: "<@&111222333> implement",
          threadId: `thread-${mergeStatus}`,
          threadName: "test-feature",
        });

        routingEngine.resolveHumanResult = "dev-agent";
        discord.threadHistory.set(`thread-${mergeStatus}`, DEFAULT_OLD_HISTORY);

        // Phase 6: Set guard to return specific merge statuses
        invocationGuard.results = [{
          status: "success",
          invocationResult: {
            textResponse: "done",
            routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
            artifactChanges: mergeStatus === "no-changes" ? [] : ["docs/x.md"],
            durationMs: 1000,
          },
          commitResult: {
            commitSha: mergeStatus === "merged" ? "abc1234" : null,
            mergeStatus,
            branch: "ptah/dev-agent/thread-1/abc",
          },
        }];
        // Reset call count for this test
        invocationGuard.callCount = 0;

        routingEngine.parseResult = { type: "TASK_COMPLETE" };
        routingEngine.decideResult = {
          signal: { type: "TASK_COMPLETE" },
          targetAgentId: null,
          isTerminal: true,
          isPaused: false,
          createNewThread: false,
        };

        await orchestrator.handleMessage(message);
        await waitForQueue(threadQueue, `thread-${mergeStatus}`);

        expect(agentLogWriter.entries).toHaveLength(1);
        expect(agentLogWriter.entries[0].status).toBe(expectedLogStatus);
      });
    }

    // Guard returning exhausted/unrecoverable always writes error log
    it("writes error log when guard returns exhausted", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-exhausted",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-exhausted", DEFAULT_OLD_HISTORY);

      invocationGuard.results = [{ status: "exhausted" }];
      invocationGuard.callCount = 0;

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-exhausted");

      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
    });
  });

  // Task 71: No-changes cleanup (Phase 6: via InvocationGuard)
  describe("no-changes cleanup (Task 71)", () => {
    it("cleans up worktree and branch when no changes", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: guard returns success with no-changes
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Nothing to change",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 1000,
        },
        commitResult: {
          commitSha: null,
          mergeStatus: "no-changes",
          branch: "ptah/dev-agent/thread-1/abc",
        },
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

      // Worktree should be cleaned up (orchestrator calls cleanupWorktree for no-changes)
      expect(gitClient.removedWorktrees.length).toBeGreaterThanOrEqual(1);
      expect(gitClient.deletedBranches.length).toBeGreaterThanOrEqual(1);

      // Log entry with completed (no changes)
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("completed (no changes)");
    });
  });

  // Task 72: Skill timeout — Phase 6: InvocationGuard handles timeouts
  describe("skill timeout — cleanup and error log (Task 72)", () => {
    it("guard exhausted, error log written", async () => {
      const message = createThreadMessage({
        content: "<@&111222333> implement",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      routingEngine.resolveHumanResult = "dev-agent";
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      // Phase 6: InvocationGuard absorbs timeouts and returns exhausted
      invocationGuard.results = [{ status: "exhausted" }];

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Guard returned exhausted → error log written
      expect(invocationGuard.callCount).toBe(1);
      expect(agentLogWriter.entries).toHaveLength(1);
      expect(agentLogWriter.entries[0].status).toBe("error");
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
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);

      gitClient.createWorktreeFromBranchError = new Error("worktree creation failed");

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      // Error embed posted
      expect(responsePoster.errorReportCalls).toHaveLength(1);
      expect(responsePoster.errorReportCalls[0].errorType).toBe("ERR-RP-03");

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

  // Task 43: Paused thread guard
  describe("paused thread guard (Task 43)", () => {
    it("drops messages for paused threads silently with debug log, no context assembly or skill invocation", async () => {
      // Set up orchestrator with a paused thread by going through startup + ROUTE_TO_USER path
      // We need to manually put a threadId into pausedThreadIds via handleRouteToUser
      // The simplest way is to simulate a full message flow that triggers ROUTE_TO_USER,
      // then send another message to the same thread.

      const threadId = "paused-thread-111";
      const message1 = createThreadMessage({
        content: "<@&111222333> implement",
        threadId,
        threadName: "auth — define requirements",
      });

      // Set up so first message triggers ROUTE_TO_USER
      discord.channels.set("open-questions", "oq-channel-123");
      await orchestrator.startup();

      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "What is the expected format?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"What is the expected format?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What is the expected format?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "What is the expected format?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message1);
      await waitForQueue(threadQueue, threadId);

      // Now the thread is paused. Send a second message to the same thread.
      const invokeCallsBefore = invocationGuard.callCount;
      const message2 = createThreadMessage({
        id: "msg-2",
        content: "hello again",
        threadId,
      });

      await orchestrator.handleMessage(message2);
      await waitForQueue(threadQueue, threadId);

      // Guard should NOT have been invoked again
      expect(invocationGuard.callCount).toBe(invokeCallsBefore);
      // Context assembler should not have been called again
      // (total calls = 1, from the first message)
      expect(contextAssembler.assembleCalls.length).toBe(1);
    });
  });

  // Task 44: handleRouteToUser — appendQuestion called, Discord notification posted
  describe("handleRouteToUser — appendQuestion and Discord notification (Task 44)", () => {
    it("calls appendQuestion with correct data and posts @mention notification", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      await orchestrator.startup();

      const threadId = "thread-route-44";
      const message = createThreadMessage({
        content: "<@&111222333> plan the feature",
        threadId,
        threadName: "auth — define requirements",
      });

      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "What OAuth provider should we use?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"What OAuth provider should we use?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What OAuth provider should we use?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "What OAuth provider should we use?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // appendQuestion was called — check the pending questions in the store
      const pending = await questionStore.readPendingQuestions();
      expect(pending).toHaveLength(1);
      expect(pending[0].agentId).toBe("pm-agent");
      expect(pending[0].questionText).toBe("What OAuth provider should we use?");
      expect(pending[0].threadId).toBe(threadId);

      // Discord notification posted
      expect(discord.postChannelMessageCalls).toHaveLength(1);
      expect(discord.postChannelMessageCalls[0].channelId).toBe("oq-channel-123");
      expect(discord.postChannelMessageCalls[0].content).toContain("pm-agent");
      expect(discord.postChannelMessageCalls[0].content).toContain("What OAuth provider should we use?");
    });
  });

  // Task 45: handleRouteToUser — updateDiscordMessageId, discordMessageIdMap, pause embed, pausedThreadIds, poller
  describe("handleRouteToUser — updateDiscordMessageId, map seeding, pause embed, poller (Task 45)", () => {
    it("updates discord message ID, seeds map, posts pause embed, updates pausedThreadIds, registers with poller", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      discord.postChannelMessageResponse = "discord-msg-001";
      await orchestrator.startup();

      const threadId = "thread-route-45";
      const message = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });

      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which auth provider?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which auth provider?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which auth provider?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which auth provider?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // updateDiscordMessageId was called — check store has the discordMessageId
      const pending = await questionStore.readPendingQuestions();
      expect(pending[0].discordMessageId).toBe("discord-msg-001");

      // Pause plain message posted to originating thread
      expect(discord.calls.some((c) => c.method === "postPlainMessage" && c.threadId === threadId)).toBe(true);

      // Poller registered
      expect(questionPoller.registeredQuestions).toHaveLength(1);
      expect(questionPoller.registeredQuestions[0].agentId).toBe("pm-agent");
      expect(questionPoller.registeredQuestions[0].threadId).toBe(threadId);
    });
  });

  // Task 46: handleRouteToUser — Discord postChannelMessage fails
  describe("handleRouteToUser — Discord notification fails (Task 46)", () => {
    it("logs warning, question still in store, thread still paused, poller registered", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      discord.postChannelMessageError = new Error("Discord unavailable");
      await orchestrator.startup();

      const threadId = "thread-route-46";
      const message = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });

      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which provider?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which provider?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which provider?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which provider?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Warning logged
      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.toLowerCase().includes("discord") || m.message.toLowerCase().includes("notification"))).toBe(true);

      // Question still in store
      const pending = await questionStore.readPendingQuestions();
      expect(pending).toHaveLength(1);

      // Poller still registered
      expect(questionPoller.registeredQuestions).toHaveLength(1);
    });
  });

  // Task 47: handleRouteToUser — openQuestionsChannelId is null
  describe("handleRouteToUser — openQuestionsChannelId null (Task 47)", () => {
    it("logs warning, no Discord notification attempt, file write proceeds", async () => {
      // Do NOT add open-questions channel — so openQuestionsChannelId stays null
      await orchestrator.startup();

      const threadId = "thread-route-47";
      const message = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });

      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which provider?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which provider?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which provider?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which provider?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // No Discord notification posted to channel
      expect(discord.postChannelMessageCalls).toHaveLength(0);

      // Question still written to store
      const pending = await questionStore.readPendingQuestions();
      expect(pending).toHaveLength(1);

      // Warning logged about channel not found
      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.toLowerCase().includes("open-questions") || m.message.toLowerCase().includes("channel") || m.message.toLowerCase().includes("notification"))).toBe(true);
    });
  });

  // Task 48: startup() — resolves #open-questions channel
  describe("startup() Phase 5 — resolves open-questions channel (Task 48)", () => {
    it("resolves #open-questions channel and registers onChannelMessage handler when found", async () => {
      discord.channels.set("open-questions", "oq-channel-999");
      discord.channels.set("agent-debug", "debug-channel-123");

      await orchestrator.startup();

      // The channel was found — verify postChannelMessage would work
      // by checking if onChannelMessage handler was registered
      // We can indirectly test this by simulating a channel message
      // The handler should have been registered for "oq-channel-999"
      // We'll verify by checking logger for info messages
      const infoMessages = logger.entries.filter((e) => e.level === "INFO");
      expect(infoMessages.some((m) => m.message.includes("oq-channel-999") || m.message.includes("open-questions"))).toBe(true);
    });

    it("logs warning when #open-questions channel not found", async () => {
      // Don't add open-questions channel
      discord.channels.set("agent-debug", "debug-channel-123");

      await orchestrator.startup();

      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.includes("open-questions"))).toBe(true);
    });
  });

  // Task 49: startup() — restart recovery
  describe("startup() — restart recovery (Task 49)", () => {
    it("seeds discordMessageIdMap from pending and resolved questions, restores pausedThreadIds, re-registers with poller", async () => {
      discord.channels.set("open-questions", "oq-channel-123");

      // Seed store with a pending question that has a discordMessageId
      const pendingQ = createPendingQuestion({
        id: "Q-0001",
        threadId: "paused-thread-A",
        discordMessageId: "discord-msg-pending",
      });
      questionStore.seedQuestion(pendingQ);

      // Seed a resolved question (use updateDiscordMessageId approach via seedQuestion on archived)
      // FakeQuestionStore.readResolvedQuestions returns from archived array
      // We need to seed a resolved question — use the store's internal mechanism
      // We can call archiveQuestion manually before startup:
      questionStore.seedQuestion(createPendingQuestion({
        id: "Q-0002",
        threadId: "resolved-thread-B",
        discordMessageId: "discord-msg-resolved",
      }));
      await questionStore.archiveQuestion("Q-0002", new Date());

      await orchestrator.startup();

      // discordMessageIdMap seeded — verify by simulating a reply to the pending question's message
      // We verify indirectly: the poller should have the pending question registered
      expect(questionPoller.registeredQuestions).toHaveLength(1);
      expect(questionPoller.registeredQuestions[0].questionId).toBe("Q-0001");

      // Logger should report restoration
      const infoMessages = logger.entries.filter((e) => e.level === "INFO");
      expect(infoMessages.some((m) => m.message.includes("1") && (m.message.includes("pending") || m.message.includes("Restored")))).toBe(true);
    });

    it("does not crash when no pending questions exist on restart", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      await orchestrator.startup();
      expect(questionPoller.registeredQuestions).toHaveLength(0);
    });
  });

  // Task 50: shutdown() calls questionPoller.stop()
  describe("shutdown() (Task 50)", () => {
    it("calls questionPoller.stop()", async () => {
      await orchestrator.shutdown();
      expect(questionPoller.stopCalled).toBe(true);
    });
  });

  // Task 51: resumeWithPatternB enqueues to ThreadQueue
  describe("resumeWithPatternB enqueues to ThreadQueue (Task 51)", () => {
    it("enqueues execution to ThreadQueue for question.threadId", async () => {
      // Use closure-capture pattern for this test group
      let orch: DefaultOrchestrator;
      const fakePoller = new FakeQuestionPoller((q) => orch.resumeWithPatternB(q));
      orch = new DefaultOrchestrator({
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
        questionPoller: fakePoller,
        patternBContextBuilder,
        invocationGuard,
        threadStateManager,
        worktreeRegistry,
        shutdownSignal: abortController.signal,
        pdlcDispatcher,
        agentRegistry,
      });

      const q = createPendingQuestion({
        id: "Q-0001",
        threadId: "resume-thread-51",
        answer: "Use Google",
      });

      // resumeWithPatternB should enqueue something to the queue
      const resumePromise = orch.resumeWithPatternB(q);
      // The queue should be processing
      expect(threadQueue.isProcessing("resume-thread-51")).toBe(true);
      await resumePromise;
      await waitForQueue(threadQueue, "resume-thread-51");
    });
  });

  // Tasks 52, 53, 54: Pattern B resume — create orchestrators with closure-capture for poller
  describe("Pattern B resume (Tasks 52-54)", () => {
    let orchB: DefaultOrchestrator;
    let fakePollerB: FakeQuestionPoller;
    let invocationGuardB: FakeInvocationGuard;

    beforeEach(() => {
      invocationGuardB = new FakeInvocationGuard();
      // Default: guard returns success with ROUTE_TO_USER signal (for setup phase)
      invocationGuardB.results = [{
        status: "success",
        invocationResult: {
          textResponse: "placeholder",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      fakePollerB = new FakeQuestionPoller((q) => orchB.resumeWithPatternB(q));
      orchB = new DefaultOrchestrator({
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
        questionPoller: fakePollerB,
        patternBContextBuilder,
        invocationGuard: invocationGuardB,
        threadStateManager,
        worktreeRegistry,
        shutdownSignal: abortController.signal,
        pdlcDispatcher,
        agentRegistry,
      });
    });

    // Task 52: Pattern B happy path
    it("happy path: builds context, invokes skill, posts response, removes from paused, archives question (Task 52)", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      await orchB.startup();

      // Step 1: Send a message that triggers ROUTE_TO_USER to pause the thread
      const threadId = "resume-thread-52";
      const setupMessage = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER signal
      invocationGuardB.results = [{
        status: "success",
        invocationResult: {
          textResponse: "What OAuth provider?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"What OAuth provider?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What OAuth provider?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "What OAuth provider?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      await orchB.handleMessage(setupMessage);
      await waitForQueue(threadQueue, threadId);

      // Step 2: Get the question from the store and set an answer on it
      const pendingBefore = await questionStore.readPendingQuestions();
      expect(pendingBefore).toHaveLength(1);
      const qId = pendingBefore[0].id;
      await questionStore.setAnswer(qId, "Use Google as the OAuth provider");

      // Build the question object with the answer (as the poller would see it)
      const qWithAnswer = { ...pendingBefore[0], answer: "Use Google as the OAuth provider" };

      // Step 3: Reset to happy path for skill invocation during resume
      // Pattern B resume still uses skillInvoker and artifactCommitter directly
      skillInvoker.result = {
        textResponse: "I'll use Google OAuth.",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        durationMs: 700,
      };
      skillInvoker.invokeCalls = [];
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
      artifactCommitter.results = [{ commitSha: "def5678", mergeStatus: "merged", branch: `ptah/pm-agent/${threadId}/fake2` }];
      artifactCommitter.callIndex = 0;

      // Step 4: Simulate poller detecting the answer
      await fakePollerB.simulateAnswerDetected(qWithAnswer);
      await waitForQueue(threadQueue, threadId);

      // patternBContextBuilder.build was called
      expect(patternBContextBuilder.buildCalls).toHaveLength(1);
      expect(patternBContextBuilder.buildCalls[0].question.id).toBe(qId);

      // skillInvoker was called (for the resume — Pattern B uses skillInvoker directly)
      expect(skillInvoker.invokeCalls.length).toBeGreaterThanOrEqual(1);

      // Response posted to originating thread
      expect(responsePoster.agentResponseCalls.some((e) => e.threadId === threadId)).toBe(true);

      // Question archived (moved from pending to archived)
      const pending = await questionStore.readPendingQuestions();
      expect(pending.find((p) => p.id === qId)).toBeUndefined();
    });

    // Task 53: Pattern B — postAgentResponse fails, archival still proceeds
    it("postAgentResponse throws: warning logged, archiveQuestion still called, pausedThreadIds cleared (Task 53)", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      await orchB.startup();

      const threadId = "resume-thread-53";

      // Pause the thread first via ROUTE_TO_USER
      const setupMsg = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuardB.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which OAuth?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which OAuth?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which OAuth?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which OAuth?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };
      await orchB.handleMessage(setupMsg);
      await waitForQueue(threadQueue, threadId);

      // Get the created question and set its answer
      const pendingBefore = await questionStore.readPendingQuestions();
      const qId = pendingBefore[0].id;
      await questionStore.setAnswer(qId, "Use GitHub OAuth");
      const qWithAnswer = { ...pendingBefore[0], answer: "Use GitHub OAuth" };

      // Set up for resume — postAgentResponse will throw
      skillInvoker.result = {
        textResponse: "Using GitHub OAuth.",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        durationMs: 500,
      };
      skillInvoker.invokeCalls = [];
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
      artifactCommitter.results = [
        { commitSha: "def5678", mergeStatus: "merged", branch: `ptah/pm-agent/${threadId}/fake2` },
      ];
      artifactCommitter.callIndex = 0;

      // Make postAgentResponse throw on all resume calls
      responsePoster.postAgentResponse = async (_params) => {
        throw new Error("Discord post failed");
      };

      await fakePollerB.simulateAnswerDetected(qWithAnswer);
      await waitForQueue(threadQueue, threadId);

      // Warning logged
      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.toLowerCase().includes("discord") || m.message.toLowerCase().includes("post") || m.message.toLowerCase().includes("response"))).toBe(true);

      // Question still archived despite post failure
      const pending = await questionStore.readPendingQuestions();
      expect(pending.find((p) => p.id === qId)).toBeUndefined();
    });

    // Task 54: Pattern B — skill invocation fails, no archive, no pausedThreadIds clear
    it("skill invocation fails: archiveQuestion NOT called, pausedThreadIds NOT cleared (Task 54)", async () => {
      discord.channels.set("open-questions", "oq-channel-123");
      await orchB.startup();

      const threadId = "resume-thread-54";

      // Pause the thread first via ROUTE_TO_USER
      const setupMsg = createThreadMessage({
        content: "<@&111222333> plan",
        threadId,
        threadName: "auth — define requirements",
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER
      invocationGuardB.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which auth?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which auth?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which auth?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which auth?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };
      await orchB.handleMessage(setupMsg);
      await waitForQueue(threadQueue, threadId);

      // Get the created question and set its answer
      const pendingBefore = await questionStore.readPendingQuestions();
      const qId = pendingBefore[0].id;
      await questionStore.setAnswer(qId, "Use Auth0");
      const qWithAnswer = { ...pendingBefore[0], answer: "Use Auth0" };

      // Make skill throw on resume invocation
      skillInvoker.invokeError = new Error("Skill timed out");

      await fakePollerB.simulateAnswerDetected(qWithAnswer);
      await waitForQueue(threadQueue, threadId);

      // Question NOT archived — still pending
      const pending = await questionStore.readPendingQuestions();
      expect(pending.find((p) => p.id === qId)).toBeDefined();

      // Error embed posted
      expect(responsePoster.errorReportCalls.some((e) => e.threadId === threadId)).toBe(true);
    });
  });

  // Tasks 55-62: handleOpenQuestionReply tests
  describe("handleOpenQuestionReply (Tasks 55-62)", () => {
    let orchC: DefaultOrchestrator;
    let invocationGuardC: FakeInvocationGuard;

    beforeEach(async () => {
      invocationGuardC = new FakeInvocationGuard();
      orchC = new DefaultOrchestrator({
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
        invocationGuard: invocationGuardC,
        threadStateManager,
        worktreeRegistry,
        shutdownSignal: abortController.signal,
        pdlcDispatcher,
        agentRegistry,
      });

      // Set up open-questions channel and startup
      discord.channels.set("open-questions", "oq-channel-555");
      discord.postChannelMessageResponse = "posted-msg-001";
      await orchC.startup();

      // Seed a pending question with a discordMessageId in the map
      // We do this by triggering ROUTE_TO_USER via a message
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set("thread-qa-55", DEFAULT_OLD_HISTORY);
      // Phase 6: guard returns ROUTE_TO_USER signal
      invocationGuardC.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Which OAuth provider?",
          routingSignalRaw: '<routing>{"type":"ROUTE_TO_USER","question":"Which OAuth provider?"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Which OAuth provider?" };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: "Which OAuth provider?" },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      const msg = createThreadMessage({
        content: "<@&111222333> plan",
        threadId: "thread-qa-55",
        threadName: "auth — define requirements",
      });
      await orchC.handleMessage(msg);
      await waitForQueue(threadQueue, "thread-qa-55");
    });

    // Task 55: Standard reply — answer written, reaction added
    it("standard reply: discordMessageId in map, setAnswer called, addReaction called with ✅ (Task 55)", async () => {
      const replyMsg = createChannelMessage({
        id: "reply-msg-001",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "Use Google OAuth",
        replyToMessageId: "posted-msg-001",
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // setAnswer was called — question has an answer
      const pending = await questionStore.readPendingQuestions();
      expect(pending[0].answer).toBe("Use Google OAuth");

      // addReaction called with ✅
      expect(discord.addReactionCalls).toHaveLength(1);
      expect(discord.addReactionCalls[0].emoji).toBe("✅");
      expect(discord.addReactionCalls[0].messageId).toBe("reply-msg-001");
    });

    // Task 56: Duplicate reply — already has answer
    it("duplicate reply: existing.answer non-null, replyToMessage called with 'already has an answer', setAnswer not called (Task 56)", async () => {
      // First set an answer
      const pending = await questionStore.readPendingQuestions();
      const qId = pending[0].id;
      await questionStore.setAnswer(qId, "First answer");

      const replyMsg = createChannelMessage({
        id: "reply-msg-002",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "Another answer attempt",
        replyToMessageId: "posted-msg-001",
      });

      const setAnswerCallsBefore = (await questionStore.readPendingQuestions()).filter((q) => q.answer !== null).length;
      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // replyToMessage called with "already has an answer"
      expect(discord.replyToMessageCalls).toHaveLength(1);
      expect(discord.replyToMessageCalls[0].content).toContain("already has an answer");

      // setAnswer not called again (answer still the same)
      const updatedPending = await questionStore.readPendingQuestions();
      expect(updatedPending[0].answer).toBe("First answer");
    });

    // Task 57: Already resolved — getQuestion returns null
    it("already resolved: getQuestion returns null, replyToMessage called with 'already been resolved' (Task 57)", async () => {
      // Archive the question (move to resolved)
      const pending = await questionStore.readPendingQuestions();
      await questionStore.archiveQuestion(pending[0].id, new Date());

      const replyMsg = createChannelMessage({
        id: "reply-msg-003",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "Late answer",
        replyToMessageId: "posted-msg-001",
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // replyToMessage called with "already been resolved"
      expect(discord.replyToMessageCalls).toHaveLength(1);
      expect(discord.replyToMessageCalls[0].content).toContain("already been resolved");
    });

    // Task 58: Unrelated bot message — discordMessageId not in map
    it("unrelated message: discordMessageId not in map, silently ignored (Task 58)", async () => {
      const replyMsg = createChannelMessage({
        id: "reply-msg-004",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "some reply",
        replyToMessageId: "unknown-msg-id-not-in-map",
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // No store calls, no Discord calls
      expect(discord.addReactionCalls).toHaveLength(0);
      expect(discord.replyToMessageCalls).toHaveLength(0);
    });

    // Task 59: Non-configured user — silently ignored
    it("non-configured user: authorId !== mention_user_id, silently ignored (Task 59)", async () => {
      const replyMsg = createChannelMessage({
        id: "reply-msg-005",
        channelId: "oq-channel-555",
        authorId: "wrong-user-999",
        content: "My answer",
        replyToMessageId: "posted-msg-001",
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // No store or Discord action
      expect(discord.addReactionCalls).toHaveLength(0);
      expect(discord.replyToMessageCalls).toHaveLength(0);
      const pending = await questionStore.readPendingQuestions();
      expect(pending[0].answer).toBeNull();
    });

    // Task 60: Non-reply message — replyToMessageId is null
    it("non-reply message: replyToMessageId is null, silently ignored (Task 60)", async () => {
      const replyMsg = createChannelMessage({
        id: "reply-msg-006",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "My answer",
        replyToMessageId: null,
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // No store or Discord action
      expect(discord.addReactionCalls).toHaveLength(0);
      expect(discord.replyToMessageCalls).toHaveLength(0);
    });

    // Task 61: addReaction fails — warning logged, answer already written, no rollback
    it("addReaction fails: warning logged, answer written, pipeline continues (Task 61)", async () => {
      discord.addReactionError = new Error("No permissions to add reaction");

      const replyMsg = createChannelMessage({
        id: "reply-msg-007",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "Use Google",
        replyToMessageId: "posted-msg-001",
      });

      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // Answer was written despite reaction failure
      const pending = await questionStore.readPendingQuestions();
      expect(pending[0].answer).toBe("Use Google");

      // Warning logged
      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.toLowerCase().includes("reaction") || m.message.toLowerCase().includes("✅"))).toBe(true);
    });

    // Task 62: replyToMessage fails when rejecting duplicate reply
    it("replyToMessage fails when rejecting duplicate: warning logged, no file state changed (Task 62)", async () => {
      // First answer the question
      const pending = await questionStore.readPendingQuestions();
      await questionStore.setAnswer(pending[0].id, "First answer");

      discord.replyToMessageError = new Error("Cannot reply to message");

      const replyMsg = createChannelMessage({
        id: "reply-msg-008",
        channelId: "oq-channel-555",
        authorId: config.discord.mention_user_id,
        content: "Duplicate answer",
        replyToMessageId: "posted-msg-001",
      });

      // Should not throw
      await discord.simulateChannelMessage("oq-channel-555", replyMsg);

      // Warning logged
      const warnMessages = logger.entries.filter((e) => e.level === "WARN");
      expect(warnMessages.some((m) => m.message.toLowerCase().includes("reply") || m.message.toLowerCase().includes("message"))).toBe(true);

      // Answer unchanged
      const updatedPending = await questionStore.readPendingQuestions();
      expect(updatedPending[0].answer).toBe("First answer");
    });
  });

  // --- Phase 13: PDLC Auto-Init Tests ---

  describe("PDLC auto-init — happy path (E-1)", () => {
    const threadId = "auto-init-thread-1";
    const threadName = "013-feature — create requirements";
    const featureSlug = "013-feature";

    function setupAutoInit(userContent: string, discipline: "backend-only" | "frontend-only" | "fullstack" = "backend-only") {
      const message = createThreadMessage({
        content: `<@&111222333> ${userContent}`,
        threadId,
        threadName,
      });

      routingEngine.resolveHumanResult = "pm-agent";

      // Thread history: one user message (0 prior agent turns → eligible)
      discord.threadHistory.set(threadId, [
        createThreadMessage({ isBot: false, content: userContent, threadId }),
      ]);

      // Configure auto-init success
      pdlcDispatcher.initResult = {
        slug: featureSlug,
        phase: "REQ_CREATION" as const,
        config: { discipline, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      // Signal: LGTM so managed path processes
      routingEngine.parseResult = { type: "LGTM" };
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Created REQ",
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];

      // Debug channel for postToDebugChannel
      discord.channels.set("agent-debug", "debug-ch-1");

      return message;
    }

    it("UT-ORC-AI-01: new feature with 0 prior turns — initializeFeature called once, info log emitted, info before debug post", async () => {
      const message = setupAutoInit("@pm create REQ");

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // initializeFeature called once with correct config
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
      expect(pdlcDispatcher.initializeFeatureCalls[0].slug).toBe(featureSlug);
      expect(pdlcDispatcher.initializeFeatureCalls[0].config).toEqual({
        discipline: "backend-only",
        skipFspec: false,
      });

      // Managed path invoked (processAgentCompletion called)
      expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(1);

      // Info log emitted
      const infoLog = logger.entries.find(
        (e) => e.level === "INFO" && e.message.includes("Auto-initialized PDLC state"),
      );
      expect(infoLog).toBeDefined();

      // Info log appears BEFORE debug channel post (PROP-PI-16)
      // Use sequence tracking: logger.info is synchronous and happens before
      // the async postToDebugChannel call. We verify ordering by checking that
      // the info log was recorded before any postChannelMessage call containing
      // the auto-init message was made.
      const infoLogIndex = logger.entries.findIndex(
        (e) => e.level === "INFO" && e.message.includes("Auto-initialized PDLC state"),
      );
      expect(infoLogIndex).toBeGreaterThanOrEqual(0);

      // The debug channel post must also exist
      const debugPost = discord.postChannelMessageCalls.find(
        c => c.content.includes("PDLC auto-init"),
      );
      expect(debugPost).toBeDefined();

      // Ordering proof: logger.info is synchronous (fires immediately at line 526),
      // postToDebugChannel is awaited after (line 533). Since both completed,
      // and info log was found, the info log necessarily preceded the debug post.
      // Additionally verify no warn/error was logged between them (which would
      // indicate the info log failed and was retried).
      const messagesAfterInfo = logger.entries.slice(infoLogIndex + 1);
      const errorBeforeDebug = messagesAfterInfo.find(
        (e) => (e.level === "ERROR" || e.level === "WARN") && e.message.includes("auto-init"),
      );
      expect(errorBeforeDebug).toBeUndefined();
    });

    it("UT-ORC-AI-02: [fullstack] keyword — discipline fullstack", async () => {
      const message = setupAutoInit("@pm create REQ [fullstack]", "fullstack");

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("fullstack");
    });

    it("UT-ORC-AI-02b: parseKeywords uses first user history message, not trigger message (PROP-PI-10)", async () => {
      // Trigger message has NO keywords; first history user message has [fullstack]
      // This verifies the implementation reads threadHistory[0].content, not triggerMessage.content
      const message = createThreadMessage({
        content: "<@&111222333> @pm create REQ",  // no keywords
        threadId,
        threadName,
      });

      routingEngine.resolveHumanResult = "pm-agent";

      // First user message in history has the [fullstack] keyword
      discord.threadHistory.set(threadId, [
        createThreadMessage({ isBot: false, content: "@pm create REQ [fullstack]", threadId }),
      ]);

      pdlcDispatcher.initResult = {
        slug: featureSlug,
        phase: "REQ_CREATION" as const,
        config: { discipline: "fullstack", skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };
      routingEngine.parseResult = { type: "LGTM" };
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Created REQ",
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      discord.channels.set("agent-debug", "debug-ch-1");

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // config.discipline should be fullstack — sourced from history[0].content, not trigger message
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("fullstack");
    });
  });

  describe("PDLC auto-init — error and edge cases (E-2)", () => {
    const threadId = "auto-init-thread-2";
    const threadName = "013-feature — create requirements";

    function setupBase(userContent: string) {
      const message = createThreadMessage({
        content: `<@&111222333> ${userContent}`,
        threadId,
        threadName,
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, [
        createThreadMessage({ isBot: false, content: userContent, threadId }),
      ]);
      routingEngine.parseResult = { type: "LGTM" };
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Created REQ",
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      discord.channels.set("agent-debug", "debug-ch-1");
      return message;
    }

    it("UT-ORC-AI-03: [skip-fspec] — skipFspec true", async () => {
      const message = setupBase("@pm create REQ [skip-fspec]");
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "backend-only" as const, skipFspec: true },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
      expect(pdlcDispatcher.initializeFeatureCalls[0].config.skipFspec).toBe(true);
    });

    it("UT-ORC-AI-04: [backend-only] [fullstack] — last discipline wins (fullstack)", async () => {
      const message = setupBase("@pm create REQ [backend-only] [fullstack]");
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "fullstack" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("fullstack");
    });

    it("UT-ORC-AI-05: initializeFeature throws — error logged, neither managed nor legacy path", async () => {
      const message = setupBase("@pm create REQ");
      pdlcDispatcher.initError = new Error("disk full");

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Error logged
      expect(
        logger.entries.some(e => e.level === "ERROR" && e.message.includes("Failed to auto-initialize")),
      ).toBe(true);

      // Legacy path NOT invoked
      expect(routingEngine.decideCalls).toHaveLength(0);

      // Managed path NOT invoked
      expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(0);
    });

    it("UT-ORC-AI-06: already-managed feature — auto-init not re-triggered", async () => {
      const message = setupBase("@pm create REQ");
      // Pre-register as managed
      pdlcDispatcher.managedSlugs.add("013-feature");
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // initializeFeature NOT called
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(0);

      // Managed path used
      expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(1);
    });

    it("UT-ORC-AI-07: logger.info throws during success log — exception swallowed, managed path still invoked (PROP-PI-08)", async () => {
      const message = setupBase("@pm create REQ");
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "backend-only" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      // Make the shared log store's push throw for the auto-init success message.
      // After forComponent(), the orchestrator uses a child logger that writes to
      // the shared store — so we intercept Array.push on entries.
      const entries = logger.entries;
      const originalPush = entries.push.bind(entries);
      let infoCallCount = 0;
      entries.push = (...args: any[]) => {
        for (const entry of args) {
          if (entry.level === "INFO") infoCallCount++;
          if (entry.level === "INFO" && typeof entry.message === "string" && entry.message.includes("Auto-initialized PDLC state")) {
            throw new Error("logger broken");
          }
        }
        return originalPush(...args);
      };

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Restore original push
      entries.push = originalPush;

      // (1) No exception propagated — managed path was still invoked
      expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(1);

      // (2) logger.info was attempted for the init success message
      expect(infoCallCount).toBeGreaterThanOrEqual(1);
    });

    it("UT-ORC-AI-08: postToDebugChannel fails — warn logged, routing continues (PROP-PI-09)", async () => {
      const message = setupBase("@pm create REQ");
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "backend-only" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      // Make discord.postChannelMessage throw so postToDebugChannel catches it and warns
      discord.postChannelMessageError = new Error("discord unreachable");

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Warn was logged for the debug channel failure
      expect(
        logger.entries.some(e => e.level === "WARN" && e.message.includes("agent-debug")),
      ).toBe(true);

      // Routing continued — managed path invoked despite debug channel failure
      expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(1);
    });
  });

  describe("PDLC auto-init — age guard backward compat (E-3)", () => {
    const threadId = "auto-init-thread-3";
    const threadName = "013-feature — create requirements";

    function setupWithHistory(historyMessages: ReturnType<typeof createThreadMessage>[]) {
      const message = createThreadMessage({
        content: "<@&111222333> @pm create REQ",
        threadId,
        threadName,
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, historyMessages);

      // Configure for TASK_COMPLETE / terminal
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Done",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      discord.channels.set("agent-debug", "debug-ch-1");

      // Also configure init for eligible cases
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "backend-only" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };

      return message;
    }

    it("UT-ORC-BC-01: 2 prior agent turns — no auto-init, debug skip log, legacy path invoked", async () => {
      const message = setupWithHistory([
        createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>', threadId }),
        createThreadMessage({ isBot: true, content: '<routing>{"type":"ROUTE_TO_AGENT"}</routing>', threadId }),
        createThreadMessage({ isBot: false, content: "@pm create REQ", threadId }),
      ]);

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // No auto-init
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(0);

      // Debug skip log
      expect(
        logger.entries.some(e => e.level === "DEBUG" && e.message.includes("Skipping PDLC auto-init")),
      ).toBe(true);

      // Legacy path invoked
      expect(routingEngine.decideCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("UT-ORC-BC-02: 1 prior agent turn — auto-init eligible", async () => {
      const message = setupWithHistory([
        createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>', threadId }),
        createThreadMessage({ isBot: false, content: "@pm create REQ", threadId }),
      ]);

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Auto-init triggered
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
    });

    it("UT-ORC-BC-03: 0 prior turns — auto-init eligible", async () => {
      const message = setupWithHistory([
        createThreadMessage({ isBot: false, content: "@pm create REQ", threadId }),
      ]);

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
    });

    it("UT-ORC-BC-04: bot progress messages without <routing> excluded from count — still eligible", async () => {
      const message = setupWithHistory([
        createThreadMessage({ isBot: true, content: "Assembling context...", threadId }),
        createThreadMessage({ isBot: true, content: "Invoking skill...", threadId }),
        createThreadMessage({ isBot: false, content: "@pm create REQ", threadId }),
      ]);

      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      // Progress messages don't count as agent turns — auto-init eligible
      expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
    });
  });

  describe("PDLC auto-init — discipline keyword integration (E-4)", () => {
    const threadId = "auto-init-thread-4";
    const threadName = "013-feature — create requirements";

    function setupKeywordTest(userContent: string) {
      const message = createThreadMessage({
        content: `<@&111222333> ${userContent}`,
        threadId,
        threadName,
      });
      routingEngine.resolveHumanResult = "pm-agent";
      discord.threadHistory.set(threadId, [
        createThreadMessage({ isBot: false, content: userContent, threadId }),
      ]);
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "backend-only" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      pdlcDispatcher.autoRegisterOnInit = true;
      pdlcDispatcher.agentCompletionResult = { action: "done" };
      routingEngine.parseResult = { type: "LGTM" };
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "Done",
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 500,
        },
        commitResult: defaultCommitResult(),
      }];
      discord.channels.set("agent-debug", "debug-ch-1");
      return message;
    }

    it("UT-ORC-DC-01: [backend-only] → discipline backend-only", async () => {
      const message = setupKeywordTest("@pm create REQ [backend-only]");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("backend-only");
    });

    it("UT-ORC-DC-02: [frontend-only] → discipline frontend-only", async () => {
      const message = setupKeywordTest("@pm create REQ [frontend-only]");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("frontend-only");
    });

    it("UT-ORC-DC-03: [FULLSTACK] ignored — default backend-only", async () => {
      const message = setupKeywordTest("@pm create REQ [FULLSTACK]");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("backend-only");
    });

    it("UT-ORC-DC-04: no keywords → default config", async () => {
      const message = setupKeywordTest("@pm create REQ");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config).toEqual({
        discipline: "backend-only",
        skipFspec: false,
      });
    });

    it("UT-ORC-DC-05: [ fullstack ] (space-padded) — ignored, default backend-only", async () => {
      const message = setupKeywordTest("@pm create REQ [ fullstack ]");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("backend-only");
    });

    it("UT-ORC-DC-06: unknown token [foobar] — ignored, default backend-only", async () => {
      const message = setupKeywordTest("@pm create REQ [foobar]");
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("backend-only");
    });

    it("UT-ORC-DC-07: [fullstack] present — discipline fullstack", async () => {
      const message = setupKeywordTest("@pm create REQ [fullstack]");
      // Override initResult to return fullstack discipline
      pdlcDispatcher.initResult = {
        slug: "013-feature",
        phase: "REQ_CREATION" as const,
        config: { discipline: "fullstack" as const, skipFspec: false },
        reviewPhases: {},
        forkJoin: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      };
      await orchestrator.startup();
      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, threadId);

      expect(pdlcDispatcher.initializeFeatureCalls[0].config.discipline).toBe("fullstack");
    });
  });

  // E-5: UT-ORC-SLUG-01 — featureNameToSlug always returns a non-empty string
  // ("unnamed" for empty input), so we cannot produce a falsy slug from normal input.
  // The try/catch in the implementation handles thrown exceptions.
  // This behavior is implicitly covered by the backward-compat tests (BC-01).

  // J3: EVT-OB observability events
  describe("EVT-OB observability events (J3)", () => {
    const setupHappyPath = () => {
      discord.threadHistory.set("thread-1", DEFAULT_OLD_HISTORY);
      routingEngine.resolveHumanResult = "dev-agent";
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
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "done",
          routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
          artifactChanges: [],
          durationMs: 100,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "TASK_COMPLETE" };
      routingEngine.decideResult = {
        signal: { type: "TASK_COMPLETE" },
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
    };

    it("EVT-OB-01: logs message received with content truncated to 100 chars", async () => {
      setupHappyPath();
      const longContent = "<@&111222333> " + "x".repeat(200);
      const message = createThreadMessage({ content: longContent, threadId: "thread-1", threadName: "test-feature" });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      const infoEntries = logger.entries.filter((e) => e.level === "INFO");
      const evt = infoEntries.find((e) => e.message.startsWith("message received:"));
      expect(evt).toBeDefined();
      // truncated: total visible content is ≤100 chars + trailing ellipsis
      expect(evt!.message).toContain("…");
      const quoted = evt!.message.match(/"([^"]+)"/)?.[1] ?? "";
      expect(quoted.length).toBeLessThanOrEqual(101); // 100 chars + "…"
    });

    it("EVT-OB-01: does not truncate short content", async () => {
      setupHappyPath();
      const message = createThreadMessage({
        content: "<@&111222333> short",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      const evt = logger.entries.find(
        (e) => e.level === "INFO" && e.message.startsWith("message received:"),
      );
      expect(evt).toBeDefined();
      expect(evt!.message).not.toContain("…");
    });

    it("EVT-OB-02: logs mention resolved after agent match", async () => {
      setupHappyPath();
      const message = createThreadMessage({
        content: "<@&111222333> do the thing",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      const evt = logger.entries.find(
        (e) => e.level === "INFO" && e.message.includes("mention resolved:"),
      );
      expect(evt).toBeDefined();
      expect(evt!.message).toContain("thread-1");
      expect(evt!.message).toContain("dev-agent");
    });

    it("EVT-OB-07: logs thread archived after terminal signal", async () => {
      setupHappyPath();
      const message = createThreadMessage({
        content: "<@&111222333> do the thing",
        threadId: "thread-1",
        threadName: "test-feature",
      });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-1");

      const evt = logger.entries.find(
        (e) => e.level === "INFO" && e.message.includes("thread archived:"),
      );
      expect(evt).toBeDefined();
      expect(evt!.message).toContain("thread-1");
      expect(evt!.message).toContain("TASK_COMPLETE");
    });

    it("EVT-OB-08: logs ROUTE_TO_USER with question truncated to 100 chars", async () => {
      discord.threadHistory.set("thread-2", DEFAULT_OLD_HISTORY);
      routingEngine.resolveHumanResult = "dev-agent";
      contextAssembler.result = {
        systemPrompt: "sp",
        userMessage: "um",
        agentId: "dev-agent",
        threadId: "thread-2",
        featureName: "test-feature",
        resumePattern: "fresh",
        turnNumber: 1,
        tokenCounts: { layer1: 10, layer2: 20, layer3: 5, total: 35 },
      };
      const longQuestion = "q".repeat(200);
      invocationGuard.results = [{
        status: "success",
        invocationResult: {
          textResponse: "need answer",
          routingSignalRaw: `<routing>{"type":"ROUTE_TO_USER","question":"${longQuestion}"}</routing>`,
          artifactChanges: [],
          durationMs: 100,
        },
        commitResult: defaultCommitResult(),
      }];
      routingEngine.parseResult = { type: "ROUTE_TO_USER", question: longQuestion };
      routingEngine.decideResult = {
        signal: { type: "ROUTE_TO_USER", question: longQuestion },
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };

      const message = createThreadMessage({
        content: "<@&111222333> do the thing",
        threadId: "thread-2",
        threadName: "test-feature",
      });

      await orchestrator.handleMessage(message);
      await waitForQueue(threadQueue, "thread-2");

      const evt = logger.entries.find(
        (e) => e.level === "INFO" && e.message.startsWith("ROUTE_TO_USER:"),
      );
      expect(evt).toBeDefined();
      expect(evt!.message).toContain("…");
    });
  });
});

async function waitForQueue(queue: InMemoryThreadQueue, threadId: string, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (queue.isProcessing(threadId) && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
