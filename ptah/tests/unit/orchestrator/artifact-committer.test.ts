import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultArtifactCommitter,
  formatAgentName,
} from "../../../src/orchestrator/artifact-committer.js";
import {
  FakeGitClient,
  FakeMergeLock,
  FakeMergeLockWithTimeout,
  FakeLogger,
  makeCommitterWithLock,
  makeMergeBranchParams,
} from "../../fixtures/factories.js";
import { MergeLockTimeoutError } from "../../../src/orchestrator/merge-lock.js";
import type { CommitParams, CommitAndPushParams } from "../../../src/types.js";

function createCommitAndPushParams(overrides: Partial<CommitAndPushParams> = {}): CommitAndPushParams {
  return {
    worktreePath: "/tmp/ptah-worktrees/fake",
    featureBranch: "feat-test-feature",
    artifactChanges: ["docs/specs/feature.md", "docs/plans/plan.md"],
    agentId: "dev-agent",
    threadName: "Feature ABC — Implement the widget",
    ...overrides,
  };
}

function createParams(overrides: Partial<CommitParams> = {}): CommitParams {
  return {
    worktreePath: "/tmp/ptah-worktrees/fake",
    branch: "ptah/dev-agent/thread-1/fake",
    artifactChanges: ["docs/specs/feature.md", "docs/plans/plan.md"],
    agentId: "dev-agent",
    threadName: "Feature ABC — Implement the widget",
    ...overrides,
  };
}

describe("DefaultArtifactCommitter", () => {
  let gitClient: FakeGitClient;
  let mergeLock: FakeMergeLock;
  let logger: FakeLogger;
  let committer: DefaultArtifactCommitter;

  beforeEach(() => {
    gitClient = new FakeGitClient();
    mergeLock = new FakeMergeLock();
    logger = new FakeLogger();
    committer = new DefaultArtifactCommitter(gitClient, mergeLock, logger);

    // Set the fake merge result to the correct string type
    gitClient.mergeResult = "merged";
  });

  // Task 25: No changes — empty artifactChanges
  describe("no changes", () => {
    it("returns no-changes when artifactChanges is empty", async () => {
      const params = createParams({ artifactChanges: [] });
      const result = await committer.commitAndMerge(params);

      expect(result).toEqual({
        commitSha: null,
        mergeStatus: "no-changes",
        branch: params.branch,
      });

      // No git operations called
      expect(gitClient.addInWorktreeCalls).toHaveLength(0);
      expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
      expect(gitClient.mergeCalls).toHaveLength(0);
      expect(mergeLock.acquireCalls).toHaveLength(0);
    });
  });

  // Task 26: Happy path — commit + merge success
  describe("happy path", () => {
    it("commits, merges, cleans up, and returns merged result", async () => {
      const params = createParams();
      gitClient.commitInWorktreeResult = "abc1234def5678";
      gitClient.getShortShaResult = "abc1234";

      const result = await committer.commitAndMerge(params);

      expect(result).toEqual({
        commitSha: "abc1234",
        mergeStatus: "merged",
        branch: params.branch,
      });

      // Verify call sequence: add, commit, acquire lock, merge, getShortSha
      expect(gitClient.addInWorktreeCalls).toHaveLength(1);
      expect(gitClient.addInWorktreeCalls[0]).toEqual({
        worktreePath: params.worktreePath,
        files: params.artifactChanges,
      });

      expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
      expect(gitClient.commitInWorktreeCalls[0].worktreePath).toBe(params.worktreePath);

      expect(mergeLock.acquireCalls).toHaveLength(1);
      expect(mergeLock.acquireCalls[0]).toBe(10_000);

      expect(gitClient.mergeCalls).toHaveLength(1);
      expect(gitClient.mergeCalls[0]).toBe(params.branch);

      expect(gitClient.getShortShaCalls).toHaveLength(1);
      expect(gitClient.getShortShaCalls[0]).toBe("abc1234def5678");

      // Lock released
      expect(mergeLock.releaseCalls).toBe(1);

      // Cleanup: removeWorktree + deleteBranch
      expect(gitClient.removedWorktrees).toContain(params.worktreePath);
      expect(gitClient.deletedBranches).toContain(params.branch);
    });
  });

  // Task 27: Commit message format with em-dash
  describe("commit message format", () => {
    it("extracts description after em-dash in threadName", async () => {
      const params = createParams({
        agentId: "dev-agent",
        threadName: "Feature ABC — Implement the widget",
      });

      await committer.commitAndMerge(params);

      expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
      expect(gitClient.commitInWorktreeCalls[0].message).toBe(
        "[ptah] Dev Agent: Implement the widget",
      );
    });
  });

  // Task 28: Commit message fallback — no em-dash
  describe("commit message fallback", () => {
    it("uses full threadName when no em-dash present", async () => {
      const params = createParams({
        agentId: "pm-agent",
        threadName: "Simple task name",
      });

      await committer.commitAndMerge(params);

      expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
      expect(gitClient.commitInWorktreeCalls[0].message).toBe(
        "[ptah] Pm Agent: Simple task name",
      );
    });
  });

  // Task 29: Docs filter — only docs/ changes staged
  describe("docs filter", () => {
    it("only stages docs/ changes and logs warning for non-docs", async () => {
      const params = createParams({
        artifactChanges: [
          "docs/specs/feature.md",
          "src/index.ts",
          "docs/plans/plan.md",
          "package.json",
        ],
      });

      await committer.commitAndMerge(params);

      // Only docs/ files staged
      expect(gitClient.addInWorktreeCalls).toHaveLength(1);
      expect(gitClient.addInWorktreeCalls[0].files).toEqual([
        "docs/specs/feature.md",
        "docs/plans/plan.md",
      ]);

      // Warning logged for non-docs files
      const warnings = logger.entries.filter((e) => e.level === "WARN");
      expect(warnings.length).toBeGreaterThan(0);
      const warningText = warnings.map((w) => w.message).join(" ");
      expect(warningText).toContain("src/index.ts");
      expect(warningText).toContain("package.json");
    });
  });

  // Task 30: All non-docs filtered — returns no-changes
  describe("all non-docs filtered", () => {
    it("returns no-changes when all changes are non-docs", async () => {
      const params = createParams({
        artifactChanges: ["src/index.ts", "package.json"],
      });

      const result = await committer.commitAndMerge(params);

      expect(result).toEqual({
        commitSha: null,
        mergeStatus: "no-changes",
        branch: params.branch,
      });

      expect(gitClient.addInWorktreeCalls).toHaveLength(0);
      expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
    });
  });

  // Task 31: Merge conflict
  describe("merge conflict", () => {
    it("returns conflict, retains worktree, releases lock", async () => {
      gitClient.mergeResult = "conflict";
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      expect(result.mergeStatus).toBe("conflict");
      expect(result.branch).toBe(params.branch);
      expect(result.conflictMessage).toBeDefined();

      // Worktree NOT cleaned up
      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);

      // Lock released
      expect(mergeLock.releaseCalls).toBe(1);
    });
  });

  // Task 32: Commit failure — addInWorktree throws
  describe("commit failure (git add)", () => {
    it("returns commit-error, no merge lock, worktree cleaned up", async () => {
      gitClient.addInWorktreeError = new Error("git add failed");
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      expect(result).toEqual({
        commitSha: null,
        mergeStatus: "commit-error",
        branch: params.branch,
        conflictMessage: "git add failed",
      });

      // No merge lock acquired
      expect(mergeLock.acquireCalls).toHaveLength(0);

      // Worktree cleaned up
      expect(gitClient.removedWorktrees).toContain(params.worktreePath);
      expect(gitClient.deletedBranches).toContain(params.branch);
    });
  });

  // Task 33: Commit failure — commitInWorktree throws
  describe("commit failure (git commit)", () => {
    it("returns commit-error, no merge lock, worktree cleaned up", async () => {
      gitClient.commitInWorktreeError = new Error("git commit failed");
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      expect(result).toEqual({
        commitSha: null,
        mergeStatus: "commit-error",
        branch: params.branch,
        conflictMessage: "git commit failed",
      });

      // Add was called
      expect(gitClient.addInWorktreeCalls).toHaveLength(1);

      // No merge lock acquired
      expect(mergeLock.acquireCalls).toHaveLength(0);

      // Worktree cleaned up
      expect(gitClient.removedWorktrees).toContain(params.worktreePath);
      expect(gitClient.deletedBranches).toContain(params.branch);
    });
  });

  // Task 34: Merge error
  describe("merge error", () => {
    it("returns merge-error, retains worktree, releases lock", async () => {
      gitClient.mergeResult = "merge-error";
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      expect(result.mergeStatus).toBe("merge-error");
      expect(result.branch).toBe(params.branch);
      expect(result.conflictMessage).toBeDefined();

      // Worktree NOT cleaned up
      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);

      // Lock released
      expect(mergeLock.releaseCalls).toBe(1);
    });
  });

  // Task 35: Lock timeout
  describe("lock timeout", () => {
    it("returns lock-timeout, preserves commitSha, retains worktree", async () => {
      mergeLock.acquireError = new MergeLockTimeoutError(10_000);
      gitClient.commitInWorktreeResult = "abc1234def5678";
      gitClient.getShortShaResult = "abc1234";
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      expect(result.mergeStatus).toBe("lock-timeout");
      expect(result.branch).toBe(params.branch);
      // commitSha preserved from the commit step
      expect(result.commitSha).toBe("abc1234def5678");

      // Worktree NOT cleaned up
      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);

      // Lock was NOT successfully acquired (so no release)
      expect(mergeLock.releaseCalls).toBe(0);
    });
  });

  // EVT-OB-06: Artifact commit complete
  describe("EVT-OB-06: artifact commit complete event", () => {
    it("emits INFO log with agentId, commitSha, and branch after successful merge", async () => {
      const params = createParams();
      gitClient.commitInWorktreeResult = "abc1234def5678";
      gitClient.getShortShaResult = "abc1234";

      await committer.commitAndMerge(params);

      const infoEntries = logger.entriesAt("INFO");
      const evt = infoEntries.find((e) =>
        e.message.includes("artifact commit complete"),
      );
      expect(evt).toBeDefined();
      expect(evt!.component).toBe("artifact-committer");
      expect(evt!.level).toBe("INFO");
      expect(evt!.message).toBe(
        `artifact commit complete: ${params.agentId} → abc1234 (branch: ${params.branch})`,
      );
    });

    it("emits INFO no-changes log when artifactChanges is empty", async () => {
      const params = createParams({ artifactChanges: [] });

      await committer.commitAndMerge(params);

      const infoEntries = logger.entriesAt("INFO");
      const evt = infoEntries.find((e) =>
        e.message.includes("artifact commit: no changes"),
      );
      expect(evt).toBeDefined();
      expect(evt!.component).toBe("artifact-committer");
      expect(evt!.level).toBe("INFO");
      expect(evt!.message).toBe(
        `artifact commit: no changes for ${params.agentId}`,
      );
    });

    it("emits INFO no-changes log when all changes are non-docs", async () => {
      const params = createParams({
        artifactChanges: ["src/index.ts", "package.json"],
      });

      await committer.commitAndMerge(params);

      const infoEntries = logger.entriesAt("INFO");
      const evt = infoEntries.find((e) =>
        e.message.includes("artifact commit: no changes"),
      );
      expect(evt).toBeDefined();
      expect(evt!.component).toBe("artifact-committer");
      expect(evt!.level).toBe("INFO");
      expect(evt!.message).toBe(
        `artifact commit: no changes for ${params.agentId}`,
      );
    });
  });

  // Task 36: Cleanup failures — warnings logged, no rethrow
  describe("cleanup failures", () => {
    it("logs warnings when removeWorktree throws", async () => {
      gitClient.removeWorktreeError = new Error("worktree remove failed");
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      // Merge still succeeds
      expect(result.mergeStatus).toBe("merged");

      // Warning logged
      const warnings = logger.entries.filter((e) => e.level === "WARN");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.message.includes("worktree"))).toBe(true);
    });

    it("logs warnings when deleteBranch throws", async () => {
      gitClient.deleteBranchError = new Error("branch delete failed");
      const params = createParams();

      const result = await committer.commitAndMerge(params);

      // Merge still succeeds
      expect(result.mergeStatus).toBe("merged");

      // Warning logged
      const warnings = logger.entries.filter((e) => e.level === "WARN");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.message.includes("branch"))).toBe(true);
    });
  });
});

// formatAgentName helper tests
describe("formatAgentName", () => {
  it("converts hyphenated id to capitalized words", () => {
    expect(formatAgentName("dev-agent")).toBe("Dev Agent");
  });

  it("capitalizes single word", () => {
    expect(formatAgentName("admin")).toBe("Admin");
  });

  it("handles multiple hyphens", () => {
    expect(formatAgentName("pm-lead-agent")).toBe("Pm Lead Agent");
  });
});

// --- Phase 14: mergeBranchIntoFeature tests ---

describe("DefaultArtifactCommitter.mergeBranchIntoFeature", () => {
  it("returns merged status with commitSha on successful merge and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "merged";
    git.getShortShaResult = "abc123";
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merged");
    expect(result.commitSha).toBe("abc123");
    expect(result.conflictingFiles).toHaveLength(0);
    expect(lock.releaseCalls).toBe(1);
  });

  it("returns conflict status and conflicting files, aborts merge, and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "conflict";
    git.getConflictedFilesResult = ["src/foo.ts", "src/bar.ts"];
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("conflict");
    expect(result.conflictingFiles).toEqual(["src/foo.ts", "src/bar.ts"]);
    expect(git.abortMergeInWorktreeCalls).toHaveLength(1);
    expect(lock.releaseCalls).toBe(1);
  });

  it("returns already-up-to-date when source is already in target history and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "already-up-to-date";
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("already-up-to-date");
    expect(result.commitSha).toBeNull();
    expect(lock.releaseCalls).toBe(1);
  });

  it("returns merge-error on lock timeout (lock not acquired, no release)", async () => {
    const git = new FakeGitClient();
    const lock = new FakeMergeLockWithTimeout();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merge-error");
    expect(result.errorMessage).toContain("Merge lock timeout");
  });

  it("returns merge-error when git throws an unexpected error and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeError = new Error("git internal error");
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merge-error");
    expect(result.errorMessage).toBe("git internal error");
    expect(lock.releaseCalls).toBe(1);
  });
});

// --- Agent Coordination: commitAndPush tests ---

describe("DefaultArtifactCommitter.commitAndPush", () => {
  let gitClient: FakeGitClient;
  let mergeLock: FakeMergeLock;
  let logger: FakeLogger;
  let committer: DefaultArtifactCommitter;

  beforeEach(() => {
    gitClient = new FakeGitClient();
    mergeLock = new FakeMergeLock();
    logger = new FakeLogger();
    committer = new DefaultArtifactCommitter(gitClient, mergeLock, logger);
  });

  // Task 19: filters to docs/ changes, commits, and pushes to origin
  it("filters to docs/ changes, commits, and pushes to origin", async () => {
    gitClient.commitInWorktreeResult = "abc1234def5678";
    gitClient.getShortShaResult = "abc1234";
    const params = createCommitAndPushParams({
      artifactChanges: [
        "docs/specs/feature.md",
        "src/index.ts",
        "docs/plans/plan.md",
      ],
    });

    const result = await committer.commitAndPush(params);

    expect(result.pushStatus).toBe("pushed");
    expect(result.commitSha).toBe("abc1234");
    expect(result.featureBranch).toBe("feat-test-feature");

    // Only docs/ files staged
    expect(gitClient.addInWorktreeCalls).toHaveLength(1);
    expect(gitClient.addInWorktreeCalls[0].files).toEqual([
      "docs/specs/feature.md",
      "docs/plans/plan.md",
    ]);

    // Commit made in worktree
    expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
    expect(gitClient.commitInWorktreeCalls[0].worktreePath).toBe(params.worktreePath);
    expect(gitClient.commitInWorktreeCalls[0].message).toBe(
      "[ptah] Dev Agent: Implement the widget",
    );

    // Push made
    expect(gitClient.pushInWorktreeCalls).toHaveLength(1);
    expect(gitClient.pushInWorktreeCalls[0]).toEqual({
      worktreePath: params.worktreePath,
      remote: "origin",
      branch: "feat-test-feature",
    });

    // No merge lock acquired (commitAndPush doesn't need one)
    expect(mergeLock.acquireCalls).toHaveLength(0);

    // Non-docs warning logged
    const warnings = logger.entries.filter((e) => e.level === "WARN");
    expect(warnings.some((w) => w.message.includes("src/index.ts"))).toBe(true);
  });

  // Task 20: returns no-changes when artifact list is empty
  it("returns no-changes when artifact list is empty", async () => {
    const params = createCommitAndPushParams({ artifactChanges: [] });

    const result = await committer.commitAndPush(params);

    expect(result).toEqual({
      commitSha: null,
      pushStatus: "no-changes",
      featureBranch: "feat-test-feature",
    });

    expect(gitClient.addInWorktreeCalls).toHaveLength(0);
    expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
    expect(gitClient.pushInWorktreeCalls).toHaveLength(0);
  });

  it("returns no-changes when all changes are non-docs", async () => {
    const params = createCommitAndPushParams({
      artifactChanges: ["src/index.ts", "package.json"],
    });

    const result = await committer.commitAndPush(params);

    expect(result.pushStatus).toBe("no-changes");
    expect(result.commitSha).toBeNull();
  });

  // Task 21: returns push-error when push fails
  it("returns push-error when push fails", async () => {
    gitClient.commitInWorktreeResult = "abc1234def5678";
    gitClient.pushInWorktreeError = new Error("remote rejected");
    const params = createCommitAndPushParams();

    const result = await committer.commitAndPush(params);

    expect(result.pushStatus).toBe("push-error");
    expect(result.commitSha).toBe("abc1234def5678");
    expect(result.featureBranch).toBe("feat-test-feature");
    expect(result.errorMessage).toBe("remote rejected");
  });

  // Task 22: returns commit-error when commit fails
  it("returns commit-error when git add fails", async () => {
    gitClient.addInWorktreeError = new Error("git add failed");
    const params = createCommitAndPushParams();

    const result = await committer.commitAndPush(params);

    expect(result.pushStatus).toBe("commit-error");
    expect(result.commitSha).toBeNull();
    expect(result.errorMessage).toBe("git add failed");
    expect(gitClient.pushInWorktreeCalls).toHaveLength(0);
  });

  it("returns commit-error when git commit fails", async () => {
    gitClient.commitInWorktreeError = new Error("nothing to commit");
    const params = createCommitAndPushParams();

    const result = await committer.commitAndPush(params);

    expect(result.pushStatus).toBe("commit-error");
    expect(result.commitSha).toBeNull();
    expect(result.errorMessage).toBe("nothing to commit");
    expect(gitClient.pushInWorktreeCalls).toHaveLength(0);
  });

  it("uses correct commit message format with em-dash extraction", async () => {
    gitClient.commitInWorktreeResult = "abc1234";
    const params = createCommitAndPushParams({
      agentId: "pm",
      threadName: "Feature ABC — Define requirements",
    });

    await committer.commitAndPush(params);

    expect(gitClient.commitInWorktreeCalls[0].message).toBe(
      "[ptah] Pm: Define requirements",
    );
  });

  it("uses full threadName when no em-dash present", async () => {
    gitClient.commitInWorktreeResult = "abc1234";
    const params = createCommitAndPushParams({
      agentId: "eng",
      threadName: "Simple task",
    });

    await committer.commitAndPush(params);

    expect(gitClient.commitInWorktreeCalls[0].message).toBe(
      "[ptah] Eng: Simple task",
    );
  });
});
