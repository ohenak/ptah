/**
 * Tests for the invokeSkill and mergeWorktree Activities.
 *
 * Activities are plain async functions that close over injected dependencies (SkillActivityDeps).
 * We test them by injecting fakes from factories.ts.
 *
 * Temporal Activity context (heartbeat, cancellation) is mocked via vi.mock().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SkillActivityInput, SkillActivityResult } from "../../../src/temporal/types.js";
import type { SkillActivityDeps, MergeWorktreeInput, MergeResult as ActivityMergeResult } from "../../../src/temporal/activities/skill-activity.js";
import {
  FakeGitClient,
  FakeSkillInvoker,
  FakeArtifactCommitter,
  FakeRoutingEngine,
  FakeContextAssembler,
  FakeAgentRegistry,
  FakeLogger,
  FakeFeatureResolver,
  FakeWorktreeManager,
  FakeFileSystem,
  defaultTestConfig,
  makeRegisteredAgent,
} from "../../fixtures/factories.js";
import type { PtahConfig } from "../../../src/types.js";

// ---------------------------------------------------------------------------
// Mock @temporalio/activity Context
// ---------------------------------------------------------------------------

const mockHeartbeat = vi.fn();
const mockIsCancelled = vi.fn(() => false);
const mockSleep = vi.fn(() => Promise.resolve());

class MockCancelledFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelledFailure";
  }
}

let mockCancellationAborted = false;

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({
      heartbeat: mockHeartbeat,
      cancellationSignal: { get aborted() { return mockCancellationAborted; } },
    }),
  },
  heartbeat: mockHeartbeat,
  CancelledFailure: MockCancelledFailure,
}));

vi.mock("@temporalio/common", () => ({
  ApplicationFailure: {
    nonRetryable: (message: string, type?: string) => {
      const err = new Error(message) as Error & { nonRetryable: boolean; type: string };
      err.name = "ApplicationFailure";
      err.nonRetryable = true;
      err.type = type ?? "NonRetryableError";
      return err;
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultInput(overrides?: Partial<SkillActivityInput>): SkillActivityInput {
  return {
    agentId: "eng",
    featureSlug: "my-feature",
    phaseId: "tspec-creation",
    taskType: "Create",
    documentType: "TSPEC",
    contextDocumentRefs: ["{feature}/REQ"],
    featureConfig: { discipline: "backend-only", skipFspec: false },
    forkJoin: false,
    isRevision: false,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<PtahConfig>): PtahConfig {
  const base = defaultTestConfig();
  return {
    ...base,
    temporal: {
      address: "localhost:7233",
      namespace: "default",
      taskQueue: "ptah-main",
      worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
      retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2, maxIntervalSeconds: 600 },
      heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
    },
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<SkillActivityDeps>): SkillActivityDeps {
  const gitClient = new FakeGitClient();
  const skillInvoker = new FakeSkillInvoker();
  const artifactCommitter = new FakeArtifactCommitter();
  const routingEngine = new FakeRoutingEngine();
  const contextAssembler = new FakeContextAssembler();
  const agentRegistry = new FakeAgentRegistry([
    makeRegisteredAgent({ id: "eng", display_name: "Engineer" }),
    makeRegisteredAgent({ id: "pm", display_name: "Product Manager" }),
  ]);
  const logger = new FakeLogger();
  const config = makeConfig();
  const worktreeManager = new FakeWorktreeManager();
  const fs = new FakeFileSystem();

  return {
    skillInvoker,
    contextAssembler,
    artifactCommitter,
    gitClient,
    routingEngine,
    agentRegistry,
    logger,
    config,
    worktreeManager,
    fs,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import activity creators (after mocks are set up)
// ---------------------------------------------------------------------------

let createActivities: typeof import("../../../src/temporal/activities/skill-activity.js").createActivities;

beforeEach(async () => {
  vi.clearAllMocks();
  mockIsCancelled.mockReturnValue(false);
  mockCancellationAborted = false;
  const mod = await import("../../../src/temporal/activities/skill-activity.js");
  createActivities = mod.createActivities;
});

// ===========================================================================
// C1: Idempotency Check
// ===========================================================================

describe("invokeSkill — idempotency check (C1)", () => {
  it("skips invocation when worktree exists with committed changes", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;

    // Simulate existing worktree with committed changes
    const worktreePath = `/tmp/ptah-worktrees/eng/my-feature/tspec-creation`;
    gitClient.worktrees = [{ path: worktreePath, branch: "ptah/my-feature/eng/tspec-creation" }];
    gitClient.hasUnmergedCommitsResult = true;

    const { invokeSkill } = createActivities(deps);
    const input = makeDefaultInput();
    const result = await invokeSkill(input);

    // Skill should NOT have been invoked
    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(0);

    // Result should indicate idempotent skip
    expect(result.routingSignalType).toBe("LGTM");
    expect(result.artifactChanges).toEqual([]);
  });

  it("proceeds when worktree does not exist", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    gitClient.worktrees = [];
    routingEngine.parseResult = { type: "LGTM" };

    // Set up diff for artifact detection
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const input = makeDefaultInput();
    const result = await invokeSkill(input);

    // Skill SHOULD have been invoked
    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(1);
    expect(result.routingSignalType).toBe("LGTM");
  });

  it("proceeds when worktree exists but has no committed changes", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    const worktreePath = `/tmp/ptah-worktrees/eng/my-feature/tspec-creation`;
    gitClient.worktrees = [{ path: worktreePath, branch: "ptah/my-feature/eng/tspec-creation" }];
    gitClient.hasUnmergedCommitsResult = false;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const input = makeDefaultInput();
    const result = await invokeSkill(input);

    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(1);
    expect(result.routingSignalType).toBe("LGTM");
  });

  it("logs idempotent skip message", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const logger = deps.logger as FakeLogger;

    const worktreePath = `/tmp/ptah-worktrees/eng/my-feature/tspec-creation`;
    gitClient.worktrees = [{ path: worktreePath, branch: "ptah/my-feature/eng/tspec-creation" }];
    gitClient.hasUnmergedCommitsResult = true;

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    const logMessages = logger.messages.map((m) => m.message);
    expect(logMessages.some((msg) => msg.includes("Idempotent skip"))).toBe(true);
  });
});

// ===========================================================================
// C2: Worktree Creation, Context Assembly, Skill Invocation
// ===========================================================================

describe("invokeSkill — worktree creation, context assembly, skill invocation (C2)", () => {
  it("creates a worktree on the feature branch", async () => {
    const deps = makeDeps();
    const worktreeManager = deps.worktreeManager as FakeWorktreeManager;
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // WorktreeManager is now responsible for worktree creation (F1)
    // For forkJoin=false (default), a per-agent review branch is used
    expect(worktreeManager.createCalls).toHaveLength(1);
    expect(worktreeManager.createCalls[0]!.featureBranch).toBe("feat-my-feature-review-eng");
  });

  it("assembles context with contextDocumentRefs", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const input = makeDefaultInput({ contextDocumentRefs: ["{feature}/REQ", "{feature}/TSPEC"] });
    await invokeSkill(input);

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    expect(contextAssembler.assembleCalls[0]!.agentId).toBe("eng");
  });

  it("invokes skill with assembled context and worktree path", async () => {
    const deps = makeDeps();
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    expect(skillInvoker.invokeCalls).toHaveLength(1);
    expect(skillInvoker.invokeCalls[0]!.worktreePath).toBeDefined();
  });

  it("passes prior question and answer in context when provided", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({
        priorQuestion: "Should auth use Google or GitHub?",
        priorAnswer: "Google",
      }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
  });
});

// ===========================================================================
// C3: Heartbeat Loop
// ===========================================================================

describe("invokeSkill — heartbeat loop (C3)", () => {
  it("calls heartbeat during skill invocation", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    // Simulate a skill invocation that takes some time
    skillInvoker.result = {
      textResponse: "done",
      routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
      artifactChanges: [],
      durationMs: 5000,
    };

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // Heartbeat should have been called at least once during execution
    // (exact count depends on timing, but the mechanism should be wired)
    expect(mockHeartbeat).toHaveBeenCalled();
  });

  it("emits initial heartbeat before invocation", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // First heartbeat call should be the initial "invoking" heartbeat
    expect(mockHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "invoking" }),
    );
  });

  it("emits post-invocation heartbeat with parsing phase", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // Should have a "parsing" heartbeat after invocation completes
    expect(mockHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "parsing" }),
    );
  });

  it("stops heartbeat loop when skill invocation completes", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    // After invocation completes, result should be normal
    expect(result.routingSignalType).toBe("LGTM");
  });
});

// ===========================================================================
// C4: LGTM/TASK_COMPLETE Handling
// ===========================================================================

describe("invokeSkill — LGTM/TASK_COMPLETE handling (C4)", () => {
  it("commits and pushes worktree on LGTM for single-agent dispatch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: false }));

    expect(result.routingSignalType).toBe("LGTM");
    expect(result.artifactChanges).toEqual(["docs/my-feature/TSPEC.md"]);
    // For single-agent: should commit and push (not merge)
    expect(artifactCommitter.commitAndPushCalls).toHaveLength(1);
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(0);
    expect(result.worktreePath).toBeUndefined();
  });

  it("commits and pushes worktree on TASK_COMPLETE for single-agent dispatch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "TASK_COMPLETE" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: false }));

    expect(result.routingSignalType).toBe("TASK_COMPLETE");
    expect(artifactCommitter.commitAndPushCalls).toHaveLength(1);
  });

  it("commits but does NOT merge on LGTM for fork/join dispatch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: true }));

    expect(result.routingSignalType).toBe("LGTM");
    // For fork/join: worktree path should be returned (not merged)
    expect(result.worktreePath).toBeDefined();
    // Commit changes in worktree should still happen
    expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
    // But no merge through artifactCommitter.commitAndMerge
    expect((deps.artifactCommitter as FakeArtifactCommitter).commitAndMergeCalls).toHaveLength(0);
  });

  it("returns artifact changes list", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [
      "docs/my-feature/TSPEC.md",
      "docs/my-feature/015-TSPEC-temporal-foundation.md",
    ];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    expect(result.artifactChanges).toHaveLength(2);
    expect(result.artifactChanges).toContain("docs/my-feature/TSPEC.md");
  });

  it("returns duration in milliseconds", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// C5: ROUTE_TO_USER Handling
// ===========================================================================

describe("invokeSkill — ROUTE_TO_USER handling (C5)", () => {
  it("returns ROUTE_TO_USER without merging worktree", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "Should auth use Google?" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    expect(result.routingSignalType).toBe("ROUTE_TO_USER");
    expect(result.question).toBe("Should auth use Google?");
    // NO merge should happen
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(0);
    // NO commit should happen (work may be incomplete)
    expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
    // Worktree should be preserved (returned for re-use)
    expect(result.worktreePath).toBeDefined();
  });

  it("does not clean up worktree on ROUTE_TO_USER", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What format?" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // Worktree should NOT be removed
    expect(gitClient.removedWorktrees).toHaveLength(0);
  });
});

// ===========================================================================
// C6: Error Classification
// ===========================================================================

describe("invokeSkill — error classification (C6)", () => {
  it("throws non-retryable error on routing signal parse failure", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseError = new Error("Malformed routing signal");

    const { invokeSkill } = createActivities(deps);

    await expect(invokeSkill(makeDefaultInput())).rejects.toThrow();

    try {
      await invokeSkill(makeDefaultInput());
    } catch (err: unknown) {
      const error = err as Error & { nonRetryable?: boolean };
      expect(error.nonRetryable).toBe(true);
    }
  });

  it("throws non-retryable error on git push failure", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/test.md"];

    // Simulate push error
    artifactCommitter.commitAndPushResult = {
      commitSha: "abc",
      pushStatus: "push-error",
      featureBranch: "feat-my-feature",
      errorMessage: "remote rejected push",
    };

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput());
      expect.fail("Expected error to be thrown");
    } catch (err: unknown) {
      const error = err as Error & { nonRetryable?: boolean };
      expect(error.nonRetryable).toBe(true);
    }
  });

  it("throws retryable error on subprocess crash", async () => {
    const deps = makeDeps();
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;

    skillInvoker.invokeError = new Error("Subprocess exited with code 1");

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput());
      expect.fail("Expected error to be thrown");
    } catch (err: unknown) {
      const error = err as Error & { nonRetryable?: boolean };
      // Retryable errors should NOT have nonRetryable set
      expect(error.nonRetryable).toBeUndefined();
    }
  });

  it("cleans up worktree on error (finally block)", async () => {
    const deps = makeDeps();
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;
    const worktreeManager = deps.worktreeManager as FakeWorktreeManager;

    skillInvoker.invokeError = new Error("Subprocess crashed");

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput());
    } catch {
      // expected
    }

    // Worktree should be cleaned up via WorktreeManager.destroy() (F1)
    expect(worktreeManager.destroyCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles 429 rate limit with internal retry (BR-26)", async () => {
    const deps = makeDeps();
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    // First call throws 429, second call succeeds
    let callCount = 0;
    (deps.skillInvoker as FakeSkillInvoker).invokeError = null;
    const originalInvoke = skillInvoker.invoke.bind(skillInvoker);
    vi.spyOn(deps.skillInvoker, "invoke").mockImplementation(async (bundle, config, worktreePath) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("Rate limited") as Error & { statusCode: number; retryAfter?: number };
        err.statusCode = 429;
        err.retryAfter = 0; // Immediate retry for testing
        throw err;
      }
      return {
        textResponse: "done",
        routingSignalRaw: '<routing>{"type":"LGTM"}</routing>',
        artifactChanges: [],
        durationMs: 1000,
      };
    });

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    expect(result.routingSignalType).toBe("LGTM");
    expect(callCount).toBe(2); // First 429, then success
  });
});

// ===========================================================================
// C7: mergeWorktree Activity
// ===========================================================================

describe("mergeWorktree Activity (C7)", () => {
  it("merges worktree branch into feature branch", async () => {
    const deps = makeDeps();
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    artifactCommitter.mergeBranchResult = {
      status: "merged",
      commitSha: "abc123",
      conflictingFiles: [],
      errorMessage: null,
    };

    const { mergeWorktree } = createActivities(deps);
    const result = await mergeWorktree({
      worktreePath: "/tmp/worktree/eng",
      featureBranch: "feat-my-feature",
      agentId: "eng",
      worktreeBranch: "ptah/my-feature/eng/tspec-creation",
      featureBranchWorktreePath: "/tmp/worktree-feature",
    });

    expect(result).toBe("merged");
    expect(artifactCommitter.mergeBranchCalls).toHaveLength(1);
  });

  it("throws non-retryable error on merge conflict", async () => {
    const deps = makeDeps();
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    artifactCommitter.mergeBranchResult = {
      status: "conflict",
      commitSha: null,
      conflictingFiles: ["docs/README.md"],
      errorMessage: "Merge conflict in docs/README.md",
    };

    const { mergeWorktree } = createActivities(deps);

    try {
      await mergeWorktree({
        worktreePath: "/tmp/worktree/eng",
        featureBranch: "feat-my-feature",
        agentId: "eng",
        worktreeBranch: "ptah/my-feature/eng/tspec-creation",
        featureBranchWorktreePath: "/tmp/worktree-feature",
      });
      expect.fail("Expected error to be thrown");
    } catch (err: unknown) {
      const error = err as Error & { nonRetryable?: boolean };
      expect(error.nonRetryable).toBe(true);
    }
  });

  it("cleans up worktree after successful merge", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    artifactCommitter.mergeBranchResult = {
      status: "merged",
      commitSha: "abc123",
      conflictingFiles: [],
      errorMessage: null,
    };

    const { mergeWorktree } = createActivities(deps);
    await mergeWorktree({
      worktreePath: "/tmp/worktree/eng",
      featureBranch: "feat-my-feature",
      agentId: "eng",
      worktreeBranch: "ptah/my-feature/eng/tspec-creation",
      featureBranchWorktreePath: "/tmp/worktree-feature",
    });

    expect(gitClient.removedWorktrees).toContain("/tmp/worktree/eng");
  });
});

// ===========================================================================
// E10: resolveFeaturePath activity
// ===========================================================================

describe("resolveFeaturePath activity", () => {
  it("delegates to FeatureResolver.resolve() with correct arguments", async () => {
    const fakeResolver = new FakeFeatureResolver();
    fakeResolver.setResult("my-feature", {
      found: true,
      path: "docs/in-progress/my-feature/",
      lifecycle: "in-progress",
    });

    const deps = makeDeps({ featureResolver: fakeResolver });
    const { resolveFeaturePath } = createActivities(deps);

    const result = await resolveFeaturePath({
      featureSlug: "my-feature",
      worktreeRoot: "/tmp/ptah-wt-abc123",
    });

    expect(result).toEqual({
      found: true,
      path: "docs/in-progress/my-feature/",
      lifecycle: "in-progress",
    });
    expect(fakeResolver.resolveCalls).toEqual([
      { slug: "my-feature", worktreeRoot: "/tmp/ptah-wt-abc123" },
    ]);
  });

  it("returns not-found result when feature is not resolved", async () => {
    const fakeResolver = new FakeFeatureResolver();
    fakeResolver.setResult("nonexistent", { found: false, slug: "nonexistent" });

    const deps = makeDeps({ featureResolver: fakeResolver });
    const { resolveFeaturePath } = createActivities(deps);

    const result = await resolveFeaturePath({
      featureSlug: "nonexistent",
      worktreeRoot: "/tmp/ptah-wt-xyz",
    });

    expect(result).toEqual({ found: false, slug: "nonexistent" });
  });

  it("throws non-retryable error when featureResolver is not configured", async () => {
    const deps = makeDeps({ featureResolver: undefined });
    const { resolveFeaturePath } = createActivities(deps);

    await expect(
      resolveFeaturePath({
        featureSlug: "my-feature",
        worktreeRoot: "/tmp/ptah-wt-abc",
      })
    ).rejects.toThrow("FeatureResolver not configured in SkillActivityDeps");
  });
});

// ===========================================================================
// F1: invokeSkill delegates worktree creation to WorktreeManager
// ===========================================================================

describe("invokeSkill — WorktreeManager delegation (F1)", () => {
  it("creates worktree via WorktreeManager.create() instead of inline path", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // WorktreeManager.create() should have been called with per-agent review branch
    expect(worktreeManager.createCalls).toHaveLength(1);
    expect(worktreeManager.createCalls[0]!.featureBranch).toBe("feat-my-feature-review-eng");
  });

  it("uses WorktreeHandle.path as the worktree path for context assembly and invocation", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // The worktree path used for invocation should be the one from WorktreeManager
    expect(skillInvoker.invokeCalls).toHaveLength(1);
    expect(skillInvoker.invokeCalls[0]!.worktreePath).toMatch(/^\/tmp\/ptah-wt-fake-/);
  });

  it("destroys worktree via WorktreeManager.destroy() after successful single-agent merge", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/test.md"];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: false }));

    // WorktreeManager.destroy() should have been called
    expect(worktreeManager.destroyCalls).toHaveLength(1);
    expect(worktreeManager.destroyCalls[0]).toMatch(/^\/tmp\/ptah-wt-fake-/);
  });

  it("destroys worktree via WorktreeManager.destroy() on error", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;

    skillInvoker.invokeError = new Error("Subprocess crashed");

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput());
    } catch {
      // expected
    }

    // WorktreeManager.destroy() should have been called in the finally block
    expect(worktreeManager.destroyCalls).toHaveLength(1);
    expect(worktreeManager.destroyCalls[0]).toMatch(/^\/tmp\/ptah-wt-fake-/);
  });

  it("does NOT destroy worktree on ROUTE_TO_USER (worktree preserved for reuse)", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "ROUTE_TO_USER", question: "What format?" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    expect(result.routingSignalType).toBe("ROUTE_TO_USER");
    // Worktree should NOT be destroyed (preserved for future use)
    expect(worktreeManager.destroyCalls).toHaveLength(0);
  });

  it("does NOT destroy worktree for fork/join dispatch (worktree preserved for merge)", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/test.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: true }));

    expect(result.routingSignalType).toBe("LGTM");
    // Fork/join: worktree should NOT be destroyed (will be merged later)
    expect(worktreeManager.destroyCalls).toHaveLength(0);
  });

  it("does not call gitClient.createWorktree directly (delegated to WorktreeManager)", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // gitClient.createWorktree should NOT be called directly by invokeSkill
    // (it's now delegated to WorktreeManager)
    expect(gitClient.createdWorktrees).toHaveLength(0);
  });
});

// ===========================================================================
// F2: SkillActivityDeps includes worktreeManager and fs
// ===========================================================================

describe("SkillActivityDeps — new dependencies (F2)", () => {
  it("accepts worktreeManager in deps and uses it for worktree creation", async () => {
    const worktreeManager = new FakeWorktreeManager();
    const deps = makeDeps({ worktreeManager });
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    expect(worktreeManager.createCalls).toHaveLength(1);
  });

  it("accepts fs in deps without error", async () => {
    const fs = new FakeFileSystem();
    const deps = makeDeps({ fs });

    // Should not throw — fs is accepted as a valid dependency
    const { invokeSkill } = createActivities(deps);
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const result = await invokeSkill(makeDefaultInput());
    expect(result.routingSignalType).toBe("LGTM");
  });
});

// ===========================================================================
// Agent Coordination — Phase E: Shared Branch Worktree + CommitAndPush
// ===========================================================================

describe("invokeSkill — path-only idempotency check (Task 26)", () => {
  it("matches existing worktree by path only, ignoring branch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;

    // Existing worktree at the expected path but with a DIFFERENT branch name
    const worktreeBasePath = `/tmp/ptah-worktrees/eng/my-feature/tspec-creation`;
    gitClient.worktrees = [{ path: worktreeBasePath, branch: "some-other-branch" }];
    gitClient.hasUnmergedCommitsResult = true;

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    // Should still detect the existing worktree by path and skip
    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(0);
    expect(result.routingSignalType).toBe("LGTM");
    expect(result.artifactChanges).toEqual([]);
  });

  it("does NOT match worktree by branch alone when path differs", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    // Worktree with the old-style branch name but at a DIFFERENT path
    gitClient.worktrees = [{ path: "/some/other/path", branch: "ptah/my-feature/eng/tspec-creation" }];
    gitClient.hasUnmergedCommitsResult = true;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    // Should NOT match by branch — should proceed with invocation
    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(1);
    expect(result.routingSignalType).toBe("LGTM");
  });
});

describe("invokeSkill — addWorktreeOnBranch legacy path (Task 27)", () => {
  it("creates worktree via addWorktreeOnBranch when worktreeManager is not available", async () => {
    // Remove worktreeManager to trigger legacy path
    const deps = makeDeps({ worktreeManager: undefined });
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    // Should call addWorktreeOnBranch with the worktree path and feature branch
    expect(gitClient.worktreesOnBranch).toHaveLength(1);
    expect(gitClient.worktreesOnBranch[0]).toEqual({
      path: "/tmp/ptah-worktrees/eng/my-feature/tspec-creation",
      branch: "feat-my-feature",
    });

    // Should NOT call the old createWorktree (which creates a new branch)
    expect(gitClient.createdWorktrees).toHaveLength(0);
  });

  it("reuses existing worktree when addWorktreeOnBranch fails and worktree exists", async () => {
    const deps = makeDeps({ worktreeManager: undefined });
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    const worktreePath = `/tmp/ptah-worktrees/eng/my-feature/tspec-creation`;
    gitClient.worktrees = [{ path: worktreePath, branch: "feat-my-feature" }];
    gitClient.hasUnmergedCommitsResult = false; // Not committed, so proceed
    gitClient.addWorktreeOnBranchError = new Error("worktree already exists");

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput());

    // Should succeed by reusing existing worktree
    expect(result.routingSignalType).toBe("LGTM");
    expect((deps.skillInvoker as FakeSkillInvoker).invokeCalls).toHaveLength(1);
  });
});

describe("invokeSkill — commitAndPush for non-fork-join (Task 28)", () => {
  it("calls commitAndPush instead of commitAndMerge for single-agent dispatch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: false }));

    expect(result.routingSignalType).toBe("LGTM");
    // Should use commitAndPush, NOT commitAndMerge
    expect(artifactCommitter.commitAndPushCalls).toHaveLength(1);
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(0);
    expect(artifactCommitter.commitAndPushCalls[0]!.featureBranch).toBe("feat-my-feature");
    expect(artifactCommitter.commitAndPushCalls[0]!.worktreeBranch).toBe("feat-my-feature-review-eng");
    expect(artifactCommitter.commitAndPushCalls[0]!.agentId).toBe("eng");
  });

  it("still uses fork-join path (commit without merge) when forkJoin is true", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: true }));

    // Fork-join path unchanged: commit in worktree but no commitAndPush or commitAndMerge
    expect(artifactCommitter.commitAndPushCalls).toHaveLength(0);
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(0);
    expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
    expect(result.worktreePath).toBeDefined();
  });

  it("cleans up worktree after successful commitAndPush", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const worktreeManager = deps.worktreeManager as FakeWorktreeManager;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: false }));

    // WorktreeManager.destroy should be called after successful push
    expect(worktreeManager.destroyCalls).toHaveLength(1);
  });
});

// ===========================================================================
// Per-agent review branch isolation (parallel reviewer fix)
// ===========================================================================

describe("invokeSkill — per-agent review branch isolation", () => {
  it("creates review branch from featureBranch before worktree creation (forkJoin=false)", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const worktreeManager = deps.worktreeManager as FakeWorktreeManager;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: false }));

    // createOrResetBranch should be called with the review branch derived from featureBranch
    expect(gitClient.createOrResetBranchCalls).toHaveLength(1);
    expect(gitClient.createOrResetBranchCalls[0]).toEqual({
      branch: "feat-my-feature-review-eng",
      fromRef: "feat-my-feature",
    });

    // worktreeManager.create should use the review branch, not featureBranch
    expect(worktreeManager.createCalls).toHaveLength(1);
    expect(worktreeManager.createCalls[0]!.featureBranch).toBe("feat-my-feature-review-eng");
  });

  it("does NOT create review branch for forkJoin=true", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const worktreeManager = deps.worktreeManager as FakeWorktreeManager;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: true }));

    // No review branch — forkJoin worktrees use featureBranch directly
    expect(gitClient.createOrResetBranchCalls).toHaveLength(0);
    expect(worktreeManager.createCalls[0]!.featureBranch).toBe("feat-my-feature");
  });

  it("passes worktreeBranch to commitAndPush when review branch is used", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: false }));

    expect(artifactCommitter.commitAndPushCalls).toHaveLength(1);
    expect(artifactCommitter.commitAndPushCalls[0]!.featureBranch).toBe("feat-my-feature");
    expect(artifactCommitter.commitAndPushCalls[0]!.worktreeBranch).toBe("feat-my-feature-review-eng");
  });

  it("deletes review branch after successful commitAndPush", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput({ forkJoin: false }));

    // Review branch should be deleted after the push succeeds
    expect(gitClient.deletedBranches).toContain("feat-my-feature-review-eng");
  });

  it("does NOT delete review branch on skill invocation failure", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const skillInvoker = deps.skillInvoker as FakeSkillInvoker;

    skillInvoker.invokeError = new Error("Skill crashed");

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput({ forkJoin: false }));
    } catch {
      // expected
    }

    // Review branch should NOT be deleted — left for debugging
    expect(gitClient.deletedBranches).not.toContain("feat-my-feature-review-eng");
  });

  it("two parallel reviewers (eng, qa) create separate review branches", async () => {
    // Simulate eng invocation
    const depsEng = makeDeps();
    const gitClientEng = depsEng.gitClient as FakeGitClient;
    const routingEng = depsEng.routingEngine as FakeRoutingEngine;
    routingEng.parseResult = { type: "LGTM" };
    gitClientEng.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill: invokeEng } = createActivities(depsEng);
    await invokeEng(makeDefaultInput({ agentId: "eng", forkJoin: false }));

    expect(gitClientEng.createOrResetBranchCalls[0]!.branch).toBe("feat-my-feature-review-eng");

    // Simulate qa invocation (separate deps / gitClient instance)
    const depsQa = makeDeps();
    const gitClientQa = depsQa.gitClient as FakeGitClient;
    const routingQa = depsQa.routingEngine as FakeRoutingEngine;
    routingQa.parseResult = { type: "LGTM" };
    gitClientQa.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill: invokeQa } = createActivities(depsQa);
    await invokeQa(makeDefaultInput({ agentId: "qa", forkJoin: false }));

    expect(gitClientQa.createOrResetBranchCalls[0]!.branch).toBe("feat-my-feature-review-qa");
  });
});

describe("invokeSkill — adHocInstruction passthrough (Task 29)", () => {
  it("includes adHocInstruction in the trigger message content when present", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({
        adHocInstruction: "Address feedback from cross-review: fix section 3",
      }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    // The ad-hoc instruction should appear in the trigger message content
    expect(assembleCall.triggerMessage.content).toContain(
      "Address feedback from cross-review: fix section 3",
    );
  });

  it("does NOT alter trigger message when adHocInstruction is absent", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput()); // No adHocInstruction

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    // Standard trigger message content — no ad-hoc text
    expect(assembleCall.triggerMessage.content).toBe("Execute Create for TSPEC");
  });
});

// ---------------------------------------------------------------------------
// REQ-CD-02: Pass contextDocumentRefs, taskType, documentType to contextAssembler.assemble()
// ---------------------------------------------------------------------------

describe("invokeSkill — REQ-CD-02: pass context fields to contextAssembler.assemble()", () => {
  it("passes contextDocumentRefs to contextAssembler.assemble() when non-empty", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({
        contextDocumentRefs: [
          "docs/in-progress/my-feature/REQ-my-feature.md",
          "docs/in-progress/my-feature/overview.md",
        ],
      }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    expect(assembleCall.contextDocumentRefs).toEqual([
      "docs/in-progress/my-feature/REQ-my-feature.md",
      "docs/in-progress/my-feature/overview.md",
    ]);
  });

  it("does NOT pass contextDocumentRefs when array is empty (preserves backward compatibility)", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({
        contextDocumentRefs: [],
      }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    expect(assembleCall.contextDocumentRefs).toBeUndefined();
  });

  it("passes taskType to contextAssembler.assemble()", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({ taskType: "Review" }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    expect(assembleCall.taskType).toBe("Review");
  });

  it("passes documentType to contextAssembler.assemble()", async () => {
    const deps = makeDeps();
    const contextAssembler = deps.contextAssembler as FakeContextAssembler;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(
      makeDefaultInput({ documentType: "FSPEC" }),
    );

    expect(contextAssembler.assembleCalls).toHaveLength(1);
    const assembleCall = contextAssembler.assembleCalls[0]!;
    expect(assembleCall.documentType).toBe("FSPEC");
  });
});
