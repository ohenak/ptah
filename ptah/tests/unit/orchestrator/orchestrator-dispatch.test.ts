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
  defaultTestConfig,
  defaultCommitResult,
} from "../../fixtures/factories.js";
import { InMemoryThreadQueue } from "../../../src/orchestrator/thread-queue.js";
import type { PtahConfig } from "../../../src/types.js";
import type { FeatureState } from "../../../src/orchestrator/pdlc/phases.js";

// >1 prior agent turns so auto-init age guard rejects
const DEFAULT_OLD_HISTORY = [
  createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
  createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
];

async function waitForQueue(queue: InMemoryThreadQueue, threadId: string, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (queue.isProcessing(threadId) && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Orchestrator dispatch — Issue #30", () => {
  let contextAssembler: FakeContextAssembler;
  let threadQueue: InMemoryThreadQueue;
  let config: PtahConfig;
  let invocationGuard: FakeInvocationGuard;
  let pdlcDispatcher: FakePdlcDispatcher;
  let routingEngine: FakeRoutingEngine;
  let discord: FakeDiscordClient;
  let orchestrator: DefaultOrchestrator;

  beforeEach(() => {
    discord = new FakeDiscordClient();
    routingEngine = new FakeRoutingEngine();
    contextAssembler = new FakeContextAssembler();
    threadQueue = new InMemoryThreadQueue();
    config = defaultTestConfig();
    invocationGuard = new FakeInvocationGuard();
    pdlcDispatcher = new FakePdlcDispatcher();

    invocationGuard.results = [{
      status: "success",
      invocationResult: {
        textResponse: "done",
        routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
        artifactChanges: [],
        durationMs: 1000,
      },
      commitResult: defaultCommitResult(),
    }];

    orchestrator = new DefaultOrchestrator({
      discordClient: discord,
      routingEngine,
      contextAssembler,
      skillInvoker: new FakeSkillInvoker(),
      responsePoster: new FakeResponsePoster(),
      threadQueue,
      logger: new FakeLogger(),
      config,
      gitClient: new FakeGitClient(),
      artifactCommitter: new FakeArtifactCommitter(),
      agentLogWriter: new FakeAgentLogWriter(),
      messageDeduplicator: new FakeMessageDeduplicator(),
      questionStore: new FakeQuestionStore(),
      questionPoller: new FakeQuestionPoller(),
      patternBContextBuilder: new FakePatternBContextBuilder(),
      invocationGuard,
      threadStateManager: new FakeThreadStateManager(),
      worktreeRegistry: new FakeWorktreeRegistry(),
      pdlcDispatcher,
      shutdownSignal: new AbortController().signal,
      agentRegistry: new FakeAgentRegistry([
        makeRegisteredAgent({ id: "pm", mention_id: "111222333", display_name: "PM" }),
        makeRegisteredAgent({ id: "eng", mention_id: "444555666", display_name: "Engineer" }),
      ]),
    });
  });

  it("passes taskType and contextDocuments from revision dispatch to assembler", async () => {
    const threadId = "rev-thread-1";
    const threadName = "007-polish — revise plan";
    const featureSlug = "007-polish";

    const message = createThreadMessage({
      content: "<@&111222333> @eng revise",
      threadId,
      threadName,
    });

    routingEngine.resolveHumanResult = "pm";
    discord.threadHistory.set(threadId, DEFAULT_OLD_HISTORY);

    // Feature starts in PLAN_REVIEW for the first invocation (pm reviewer)
    const reviewState: FeatureState = {
      slug: featureSlug,
      phase: "PLAN_REVIEW" as const,
      config: { discipline: "backend-only", skipFspec: false },
      reviewPhases: {
        PLAN_REVIEW: {
          reviewerStatuses: { pm: "revision_requested", qa: "revision_requested" },
          revisionCount: 0,
        },
      },
      forkJoin: null,
      createdAt: "2026-03-16T00:00:00Z",
      updatedAt: "2026-03-17T00:00:00Z",
      completedAt: null,
    };
    // After revision dispatch, feature transitions to PLAN_CREATION
    const creationState: FeatureState = {
      ...reviewState,
      phase: "PLAN_CREATION" as const,
    };

    pdlcDispatcher.managedSlugs.add(featureSlug);

    // Track getFeatureState calls to switch state after first review
    let featureStateCallCount = 0;
    const origGetFeatureState = pdlcDispatcher.getFeatureState.bind(pdlcDispatcher);
    pdlcDispatcher.getFeatureState = async (slug: string) => {
      featureStateCallCount++;
      // Calls 1-2: PLAN_REVIEW (phase guard in handleMessage + LGTM handler)
      // Subsequent calls: PLAN_CREATION (triggers processAgentCompletion → done)
      if (featureStateCallCount <= 2) {
        return reviewState;
      }
      return creationState;
    };

    routingEngine.parseResult = { type: "LGTM" };

    // Two invocations: reviewer pm, then dispatched eng
    invocationGuard.results = [
      {
        status: "success",
        invocationResult: {
          textResponse: 'done\n<routing>{"type":"LGTM"}</routing>',
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 100,
        },
        commitResult: defaultCommitResult(),
      },
      {
        status: "success",
        invocationResult: {
          textResponse: 'revised\n<routing>{"type":"LGTM"}</routing>',
          routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
          artifactChanges: [],
          durationMs: 100,
        },
        commitResult: defaultCommitResult(),
      },
    ];

    // processReviewCompletion dispatches eng with Revise
    const ctxDocs = {
      documents: [
        { type: "plan" as const, relativePath: "docs/007-polish/007-PLAN-polish.md", required: true },
        { type: "cross_review" as const, relativePath: "docs/007-polish/CROSS-REVIEW-*-PLAN.md", required: false },
      ],
    };
    pdlcDispatcher.reviewCompletionResult = {
      action: "dispatch",
      agents: [{
        agentId: "eng",
        taskType: "Revise",
        documentType: "PLAN",
        contextDocuments: ctxDocs,
      }],
    };
    // After eng completes revision, done
    pdlcDispatcher.agentCompletionResult = { action: "done" };
    discord.channels.set("agent-debug", "debug-ch-1");

    await orchestrator.startup();
    await orchestrator.handleMessage(message);
    await waitForQueue(threadQueue, threadId);

    const revisionCall = contextAssembler.assembleCalls.find(
      (c) => c.agentId === "eng" && c.taskType === "Revise",
    );
    expect(revisionCall).toBeDefined();
    expect(revisionCall!.taskType).toBe("Revise");
    expect(revisionCall!.contextDocuments).toBeDefined();
    expect(revisionCall!.contextDocuments!.documents).toHaveLength(2);
  });

  it("omits taskType for human-triggered routing (no pdlcDispatch)", async () => {
    const message = createThreadMessage({
      content: "<@&111222333> @pm hello",
      threadId: "simple-1",
      threadName: "simple — ask",
    });

    routingEngine.resolveHumanResult = "pm";
    discord.threadHistory.set("simple-1", DEFAULT_OLD_HISTORY);
    routingEngine.parseResult = { type: "TASK_COMPLETE" };

    await orchestrator.startup();
    await orchestrator.handleMessage(message);
    await waitForQueue(threadQueue, "simple-1");

    const call = contextAssembler.assembleCalls.find((c) => c.agentId === "pm");
    expect(call).toBeDefined();
    expect(call!.taskType).toBeUndefined();
    expect(call!.contextDocuments).toBeUndefined();
  });
});
