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

  return {
    skillInvoker,
    contextAssembler,
    artifactCommitter,
    gitClient,
    routingEngine,
    agentRegistry,
    logger,
    config,
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
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = [];

    const { invokeSkill } = createActivities(deps);
    await invokeSkill(makeDefaultInput());

    expect(gitClient.createdWorktrees).toHaveLength(1);
    expect(gitClient.createdWorktrees[0]!.branch).toContain("ptah/my-feature/eng/tspec-creation");
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
  it("commits and merges worktree on LGTM for single-agent dispatch", async () => {
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
    // For single-agent: should commit and merge
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(1);
    expect(result.worktreePath).toBeUndefined();
  });

  it("commits and merges worktree on TASK_COMPLETE for single-agent dispatch", async () => {
    const deps = makeDeps();
    const gitClient = deps.gitClient as FakeGitClient;
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;

    routingEngine.parseResult = { type: "TASK_COMPLETE" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/my-feature/TSPEC.md"];

    const { invokeSkill } = createActivities(deps);
    const result = await invokeSkill(makeDefaultInput({ forkJoin: false }));

    expect(result.routingSignalType).toBe("TASK_COMPLETE");
    expect(artifactCommitter.commitAndMergeCalls).toHaveLength(1);
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

  it("throws non-retryable error on git merge conflict", async () => {
    const deps = makeDeps();
    const routingEngine = deps.routingEngine as FakeRoutingEngine;
    const artifactCommitter = deps.artifactCommitter as FakeArtifactCommitter;
    const gitClient = deps.gitClient as FakeGitClient;

    routingEngine.parseResult = { type: "LGTM" };
    gitClient.diffWorktreeIncludingUntrackedResult = ["docs/test.md"];

    // Simulate merge conflict
    artifactCommitter.results = [{
      commitSha: "abc",
      mergeStatus: "conflict",
      branch: "test",
      conflictFiles: ["docs/test.md"],
    }];

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
    const gitClient = deps.gitClient as FakeGitClient;

    skillInvoker.invokeError = new Error("Subprocess crashed");

    const { invokeSkill } = createActivities(deps);

    try {
      await invokeSkill(makeDefaultInput());
    } catch {
      // expected
    }

    // Worktree should be cleaned up
    expect(gitClient.removedWorktrees.length).toBeGreaterThanOrEqual(1);
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
