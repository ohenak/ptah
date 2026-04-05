import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeGitClient, FakeWorktreeRegistry, FakeLogger } from "../../fixtures/factories.js";
import { DefaultWorktreeManager } from "../../../src/orchestrator/worktree-manager.js";

describe("DefaultWorktreeManager", () => {
  let gitClient: FakeGitClient;
  let registry: FakeWorktreeRegistry;
  let logger: FakeLogger;
  let manager: DefaultWorktreeManager;

  beforeEach(() => {
    gitClient = new FakeGitClient();
    registry = new FakeWorktreeRegistry();
    logger = new FakeLogger();
    manager = new DefaultWorktreeManager(gitClient, registry, logger);
  });

  // ─── C1: create — generates UUID path, calls git worktree add, registers ───
  describe("C1: create — happy path", () => {
    it("generates a /tmp/ptah-wt-{uuid}/ path and creates a worktree", async () => {
      const handle = await manager.create("feat-my-feature", "wf-1", "run-1", "act-1");

      // Path should match the expected pattern
      expect(handle.path).toMatch(/^\/tmp\/ptah-wt-[0-9a-f-]+\/$/);
      // Branch is a unique ptah-wt-{uuid} branch, not the feature branch
      expect(handle.branch).toMatch(/^ptah-wt-[0-9a-f-]+$/);
    });

    it("calls gitClient.createWorktreeFromBranch with a unique branch based off feature branch", async () => {
      const handle = await manager.create("feat-my-feature", "wf-1", "run-1", "act-1");

      expect(gitClient.createWorktreeFromBranchCalls).toHaveLength(1);
      expect(gitClient.createWorktreeFromBranchCalls[0]!.baseBranch).toBe("feat-my-feature");
      expect(gitClient.createWorktreeFromBranchCalls[0]!.path).toBe(handle.path);
      expect(gitClient.createWorktreeFromBranchCalls[0]!.newBranch).toMatch(/^ptah-wt-[0-9a-f-]+$/);
    });

    it("registers the worktree in the registry with all metadata", async () => {
      const handle = await manager.create("feat-my-feature", "wf-1", "run-1", "act-1");

      expect(registry.size()).toBe(1);
      const all = registry.getAll();
      expect(all[0]).toEqual(
        expect.objectContaining({
          worktreePath: handle.path,
          branch: handle.branch,
          workflowId: "wf-1",
          runId: "run-1",
          activityId: "act-1",
        }),
      );
      // createdAt should be a valid ISO 8601 string
      expect(new Date(all[0]!.createdAt).toISOString()).toBe(all[0]!.createdAt);
    });
  });

  // ─── C2: create — retries with new UUID on collision ──────────────────────
  describe("C2: create — retries on collision", () => {
    it("retries with a new UUID when first attempt fails, second succeeds", async () => {
      let callCount = 0;
      gitClient.createWorktreeFromBranch = async (newBranch: string, path: string, baseBranch: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("fatal: worktree path already exists");
        }
        gitClient.createWorktreeFromBranchCalls.push({ newBranch, path, baseBranch });
      };

      const handle = await manager.create("feat-retry", "wf-1", "run-1", "act-1");

      expect(callCount).toBe(2);
      expect(handle.path).toMatch(/^\/tmp\/ptah-wt-[0-9a-f-]+\/$/);
      expect(handle.branch).toMatch(/^ptah-wt-[0-9a-f-]+$/);
      expect(registry.size()).toBe(1);
    });
  });

  // ─── C3: create — throws non-retryable error after two failed attempts ────
  describe("C3: create — throws after two failures", () => {
    it("throws a non-retryable error when both attempts fail", async () => {
      gitClient.createWorktreeFromBranchError = new Error("fatal: cannot create worktree");

      await expect(
        manager.create("feat-fail", "wf-1", "run-1", "act-1"),
      ).rejects.toThrow("Failed to create worktree after 2 attempts");

      // Should have attempted twice
      expect(registry.size()).toBe(0);
    });
  });

  // ─── C4: destroy — calls git worktree remove --force, deregisters ─────────
  describe("C4: destroy — happy path", () => {
    it("removes the worktree and deregisters from registry", async () => {
      // First create a worktree
      const handle = await manager.create("feat-destroy", "wf-1", "run-1", "act-1");
      expect(registry.size()).toBe(1);

      await manager.destroy(handle.path);

      expect(gitClient.removedWorktrees).toContain(handle.path);
      expect(registry.size()).toBe(0);
    });
  });

  // ─── C5: destroy — logs error but does not throw when removal fails ───────
  describe("C5: destroy — logs error, does not throw", () => {
    it("logs the error but does not throw when git worktree remove fails", async () => {
      const handle = await manager.create("feat-fail-destroy", "wf-1", "run-1", "act-1");
      gitClient.removeWorktreeError = new Error("permission denied");

      // Should NOT throw
      await expect(manager.destroy(handle.path)).resolves.toBeUndefined();

      // Should have logged an error
      const errorLogs = logger.entriesAt("ERROR");
      expect(errorLogs.length).toBeGreaterThanOrEqual(1);
      expect(errorLogs.some((e) => e.message.includes(handle.path))).toBe(true);

      // Should still deregister from registry even when removal fails
      expect(registry.size()).toBe(0);
    });
  });

  // ─── C6: cleanupDangling — prunes dangling, skips non-ptah worktrees ──────
  describe("C6: cleanupDangling — prunes dangling worktrees", () => {
    it("removes dangling ptah worktrees not in activeExecutions, skips non-ptah", async () => {
      // Set up worktrees that listWorktrees() will return
      // Main worktree (first entry — should always be skipped)
      gitClient.worktrees = [
        { path: "/home/user/project", branch: "main" },
        { path: "/tmp/ptah-wt-aaa-111/", branch: "feat-a" },
        { path: "/tmp/ptah-wt-bbb-222/", branch: "feat-b" },
        { path: "/home/user/other-worktree", branch: "feat-c" },
      ];

      // Register aaa in the registry (to simulate it was active before crash)
      registry.register({
        worktreePath: "/tmp/ptah-wt-aaa-111/",
        branch: "feat-a",
        workflowId: "wf-active",
        runId: "run-active",
        activityId: "act-1",
        createdAt: new Date().toISOString(),
      });

      // activeExecutions contains "wf-active:run-active" — so aaa is still active
      const activeExecutions = new Set(["wf-active:run-active"]);

      // Track only the force-remove calls from the sweep (not from pruneWorktrees)
      const sweepRemovedPaths: string[] = [];
      let sweepDone = false;
      const originalPrune = gitClient.pruneWorktrees.bind(gitClient);
      gitClient.pruneWorktrees = async (prefix: string) => {
        sweepDone = true;
        return originalPrune(prefix);
      };
      const originalRemove = gitClient.removeWorktree.bind(gitClient);
      gitClient.removeWorktree = async (path: string) => {
        if (!sweepDone) {
          sweepRemovedPaths.push(path);
        }
        return originalRemove(path);
      };

      await manager.cleanupDangling(activeExecutions);

      // bbb-222 is dangling (not in registry, path matches ptah pattern) → removed
      expect(sweepRemovedPaths).toContain("/tmp/ptah-wt-bbb-222/");
      // aaa-111 is active → NOT removed during sweep
      expect(sweepRemovedPaths).not.toContain("/tmp/ptah-wt-aaa-111/");
      // /home/user/other-worktree is not ptah-managed → NOT removed
      expect(sweepRemovedPaths).not.toContain("/home/user/other-worktree");
      // Main worktree is always excluded
      expect(sweepRemovedPaths).not.toContain("/home/user/project");

      // Should have logged the prune
      const infoLogs = logger.entriesAt("INFO");
      expect(infoLogs.some((e) => e.message.includes("Pruned dangling worktree"))).toBe(true);
      expect(infoLogs.some((e) => e.message.includes("/tmp/ptah-wt-bbb-222/"))).toBe(true);
    });
  });

  // ─── C7: cleanupDangling — runs git worktree prune after sweep ────────────
  describe("C7: cleanupDangling — runs git worktree prune after sweep", () => {
    it("calls pruneWorktrees after the cleanup sweep", async () => {
      gitClient.worktrees = [
        { path: "/home/user/project", branch: "main" },
      ];

      await manager.cleanupDangling(new Set());

      // pruneWorktrees should have been called
      expect(gitClient.prunedPrefixes).toHaveLength(1);
    });
  });

  // ─── PROP-WT-08: cleanupDangling logs warning when listWorktrees fails ───
  describe("PROP-WT-08: cleanupDangling graceful degradation", () => {
    it("logs warning and does not throw when listWorktrees fails", async () => {
      gitClient.listWorktreesError = new Error("Temporal server unreachable");

      // Should NOT throw
      await expect(manager.cleanupDangling(new Set())).resolves.toBeUndefined();

      // Should have logged a warning
      const warnLogs = logger.entriesAt("WARN");
      expect(warnLogs.length).toBeGreaterThanOrEqual(1);
      expect(warnLogs.some((e) => e.message.includes("Skipping worktree cleanup"))).toBe(true);
      expect(warnLogs.some((e) => e.message.includes("Temporal server unreachable"))).toBe(true);
    });

    it("does not call pruneWorktrees when listWorktrees fails", async () => {
      gitClient.listWorktreesError = new Error("connection refused");

      await manager.cleanupDangling(new Set());

      // pruneWorktrees should NOT have been called
      expect(gitClient.prunedPrefixes).toHaveLength(0);
    });
  });
});
