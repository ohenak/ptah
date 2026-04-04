import { describe, it, expect, beforeEach } from "vitest";
import {
  FakeWorktreeManager,
  FakeGitClient,
  FakeFileSystem,
  FakeLogger,
} from "../../fixtures/factories.js";
import {
  createPromotionActivities,
  type PromotionInput,
} from "../../../src/orchestrator/promotion-activity.js";

describe("Promotion Activities", () => {
  let worktreeManager: FakeWorktreeManager;
  let gitClient: FakeGitClient;
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let activities: ReturnType<typeof createPromotionActivities>;

  const defaultInput: PromotionInput = {
    featureSlug: "my-feature",
    featureBranch: "feat-my-feature",
    workflowId: "wf-1",
    runId: "run-1",
  };

  beforeEach(() => {
    worktreeManager = new FakeWorktreeManager();
    gitClient = new FakeGitClient();
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    activities = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // promoteBacklogToInProgress
  // ─────────────────────────────────────────────────────────────────────────

  describe("promoteBacklogToInProgress", () => {
    // ─── D1: normal flow ─────────────────────────────────────────────────
    describe("D1: normal flow — git mv, commit, push, returns updated path", () => {
      it("creates a worktree, moves the folder, commits, pushes, and returns promoted path", async () => {
        // Setup: feature exists in backlog within the worktree
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/backlog/my-feature`);

        const result = await activities.promoteBacklogToInProgress(defaultInput);

        // Verify worktree was created with correct params
        expect(worktreeManager.createCalls).toEqual([
          {
            featureBranch: "feat-my-feature",
            workflowId: "wf-1",
            runId: "run-1",
            activityId: "promote-backlog-to-in-progress",
          },
        ]);

        // Verify git mv was called
        expect(gitClient.gitMvInWorktreeCalls).toEqual([
          {
            worktreePath: wtPath,
            source: "docs/backlog/my-feature/",
            destination: "docs/in-progress/my-feature/",
          },
        ]);

        // Verify commit was made
        expect(gitClient.commitInWorktreeCalls).toEqual([
          {
            worktreePath: wtPath,
            message: "chore(lifecycle): promote my-feature backlog → in-progress",
          },
        ]);

        // Verify push was made
        expect(gitClient.pushInWorktreeCalls).toEqual([
          {
            worktreePath: wtPath,
            remote: "origin",
            branch: "feat-my-feature",
          },
        ]);

        // Verify return value
        expect(result).toEqual({
          featurePath: "docs/in-progress/my-feature/",
          promoted: true,
        });
      });
    });

    // ─── D2: idempotent skip ─────────────────────────────────────────────
    describe("D2: idempotent skip — feature already in in-progress", () => {
      it("returns promoted: false when feature is already in in-progress", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        // backlog does NOT exist, but in-progress does
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);

        const result = await activities.promoteBacklogToInProgress(defaultInput);

        // No git mv should have been called
        expect(gitClient.gitMvInWorktreeCalls).toHaveLength(0);
        // No commit
        expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
        // No push
        expect(gitClient.pushInWorktreeCalls).toHaveLength(0);

        expect(result).toEqual({
          featurePath: "docs/in-progress/my-feature/",
          promoted: false,
        });
      });

      it("logs an idempotent skip message", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);

        await activities.promoteBacklogToInProgress(defaultInput);

        const infoMessages = logger.messages
          .filter((m) => m.level === "info")
          .map((m) => m.message);
        expect(infoMessages).toContainEqual(
          expect.stringContaining("Idempotent skip"),
        );
        expect(infoMessages).toContainEqual(
          expect.stringContaining("my-feature"),
        );
      });
    });

    // ─── D3: not found error ─────────────────────────────────────────────
    describe("D3: not found — feature not in backlog or in-progress", () => {
      it("throws ApplicationFailure.nonRetryable when feature is not found", async () => {
        // Neither backlog nor in-progress exist
        await expect(
          activities.promoteBacklogToInProgress(defaultInput),
        ).rejects.toThrow("Feature my-feature not found in backlog or in-progress");
      });

      it("the error is non-retryable", async () => {
        try {
          await activities.promoteBacklogToInProgress(defaultInput);
          expect.fail("Should have thrown");
        } catch (err: unknown) {
          // ApplicationFailure from @temporalio/common has name + nonRetryable
          expect((err as Error).name).toBe("ApplicationFailure");
          expect((err as { nonRetryable: boolean }).nonRetryable).toBe(true);
        }
      });
    });

    // ─── D4: worktree destroyed in finally block ─────────────────────────
    describe("D4: worktree destroyed in finally block", () => {
      it("destroys the worktree on success", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/backlog/my-feature`);

        await activities.promoteBacklogToInProgress(defaultInput);

        expect(worktreeManager.destroyCalls).toEqual([wtPath]);
      });

      it("destroys the worktree on failure", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        // Feature not found — will throw

        try {
          await activities.promoteBacklogToInProgress(defaultInput);
        } catch {
          // expected
        }

        expect(worktreeManager.destroyCalls).toEqual([wtPath]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // promoteInProgressToCompleted
  // ─────────────────────────────────────────────────────────────────────────

  describe("promoteInProgressToCompleted", () => {
    // ─── D5: Phase 1 — NNN assignment (max+1, zero-pad), folder move ────
    describe("D5: Phase 1 — NNN assignment (max+1, zero-pad), folder move", () => {
      it("assigns NNN = max+1 and moves folder to completed", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        // completed/ has existing 002-other-feature
        fs.addExistingDir(`${wtPath}docs/completed/002-other-feature`);
        // in-progress feature exists
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        // readDirMatching returns completed folders
        fs.addExisting(`${wtPath}docs/completed/.gitkeep`, "");
        // listDirInWorktree returns files in the newly moved folder
        gitClient.listDirInWorktreeResult = ["REQ-my-feature.md", "overview.md"];

        const result = await activities.promoteInProgressToCompleted(defaultInput);

        // Verify folder move: git mv docs/in-progress/my-feature/ docs/completed/003-my-feature/
        expect(gitClient.gitMvInWorktreeCalls[0]).toEqual({
          worktreePath: wtPath,
          source: "docs/in-progress/my-feature/",
          destination: "docs/completed/003-my-feature/",
        });

        // Verify Phase 1 commit
        expect(gitClient.commitInWorktreeCalls[0]).toEqual({
          worktreePath: wtPath,
          message: "chore(lifecycle): promote my-feature in-progress → completed (003)",
        });

        expect(result.featurePath).toBe("docs/completed/003-my-feature/");
        expect(result.promoted).toBe(true);
      });
    });

    // ─── D6: Phase 1 idempotency — folder already in completed ──────────
    describe("D6: Phase 1 idempotency — folder already exists in completed", () => {
      it("skips folder move when feature already in completed", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        // Feature already in completed with NNN = 005
        fs.addExistingDir(`${wtPath}docs/completed/005-my-feature`);
        // listDirInWorktree returns files already with prefix
        gitClient.listDirInWorktreeResult = [
          "005-REQ-my-feature.md",
          "005-overview.md",
        ];

        const result = await activities.promoteInProgressToCompleted(defaultInput);

        // The first git mv call should NOT be a folder move
        // (only file renames might happen, but since they're already prefixed, nothing)
        const folderMoveCalls = gitClient.gitMvInWorktreeCalls.filter(
          (c) => c.source === "docs/in-progress/my-feature/",
        );
        expect(folderMoveCalls).toHaveLength(0);

        expect(result.featurePath).toBe("docs/completed/005-my-feature/");
        expect(result.promoted).toBe(true);
      });
    });

    // ─── D7: NNN = "001" when completed/ is empty ───────────────────────
    describe("D7: NNN = '001' when completed/ is empty", () => {
      it("assigns NNN = 001 when no completed folders exist", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        // No folders in completed/
        gitClient.listDirInWorktreeResult = ["REQ-my-feature.md"];

        const result = await activities.promoteInProgressToCompleted(defaultInput);

        expect(gitClient.gitMvInWorktreeCalls[0]).toEqual({
          worktreePath: wtPath,
          source: "docs/in-progress/my-feature/",
          destination: "docs/completed/001-my-feature/",
        });

        expect(result.featurePath).toBe("docs/completed/001-my-feature/");
      });
    });

    // ─── D8: NNN gap handling ────────────────────────────────────────────
    describe("D8: NNN gap handling (e.g., 001, 003 → next is 004)", () => {
      it("uses max+1 even when there are gaps", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/completed/001-first`);
        fs.addExistingDir(`${wtPath}docs/completed/003-third`);
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        gitClient.listDirInWorktreeResult = ["REQ-my-feature.md"];

        const result = await activities.promoteInProgressToCompleted(defaultInput);

        expect(gitClient.gitMvInWorktreeCalls[0]).toEqual({
          worktreePath: wtPath,
          source: "docs/in-progress/my-feature/",
          destination: "docs/completed/004-my-feature/",
        });

        expect(result.featurePath).toBe("docs/completed/004-my-feature/");
      });
    });

    // ─── D9: Phase 2 — file rename ──────────────────────────────────────
    describe("D9: Phase 2 — file rename (all files get NNN prefix)", () => {
      it("renames each file with NNN prefix using git mv", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        // After folder move, listDirInWorktree returns these files
        gitClient.listDirInWorktreeResult = [
          "REQ-my-feature.md",
          "FSPEC-my-feature.md",
          "overview.md",
        ];

        await activities.promoteInProgressToCompleted(defaultInput);

        // First call: folder move
        // Remaining calls: file renames
        const fileRenameCalls = gitClient.gitMvInWorktreeCalls.slice(1);
        expect(fileRenameCalls).toEqual([
          {
            worktreePath: wtPath,
            source: "docs/completed/001-my-feature/REQ-my-feature.md",
            destination: "docs/completed/001-my-feature/001-REQ-my-feature.md",
          },
          {
            worktreePath: wtPath,
            source: "docs/completed/001-my-feature/FSPEC-my-feature.md",
            destination: "docs/completed/001-my-feature/001-FSPEC-my-feature.md",
          },
          {
            worktreePath: wtPath,
            source: "docs/completed/001-my-feature/overview.md",
            destination: "docs/completed/001-my-feature/001-overview.md",
          },
        ]);

        // Verify Phase 2 commit
        const phase2Commit = gitClient.commitInWorktreeCalls.find((c) =>
          c.message.includes("rename docs"),
        );
        expect(phase2Commit).toBeDefined();
        expect(phase2Commit!.message).toBe(
          "chore(lifecycle): rename docs in 001-my-feature with NNN prefix",
        );
      });
    });

    // ─── D10: Phase 2 idempotency — already-prefixed files skipped ──────
    describe("D10: Phase 2 idempotency — already-prefixed files are skipped", () => {
      it("skips files that already have the NNN prefix", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        // Some files already prefixed, some not
        gitClient.listDirInWorktreeResult = [
          "001-REQ-my-feature.md", // already prefixed
          "overview.md", // not prefixed
        ];

        await activities.promoteInProgressToCompleted(defaultInput);

        // File rename calls (skip first which is folder move)
        const fileRenameCalls = gitClient.gitMvInWorktreeCalls.slice(1);
        // Only overview.md should be renamed
        expect(fileRenameCalls).toEqual([
          {
            worktreePath: wtPath,
            source: "docs/completed/001-my-feature/overview.md",
            destination: "docs/completed/001-my-feature/001-overview.md",
          },
        ]);
      });

      it("does not commit when all files already have NNN prefix", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        // All files already prefixed
        gitClient.listDirInWorktreeResult = [
          "001-REQ-my-feature.md",
          "001-overview.md",
        ];

        await activities.promoteInProgressToCompleted(defaultInput);

        // No Phase 2 commit
        const phase2Commits = gitClient.commitInWorktreeCalls.filter((c) =>
          c.message.includes("rename docs"),
        );
        expect(phase2Commits).toHaveLength(0);
      });
    });

    // ─── D11: Phase 3 — internal reference update ───────────────────────
    describe("D11: Phase 3 — internal reference update (markdown links)", () => {
      it("updates markdown links to renamed files", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        gitClient.listDirInWorktreeResult = [
          "REQ-my-feature.md",
          "overview.md",
        ];

        // After Phase 2 renames, we need to set up the file content
        // that references old names. The implementation will read files
        // from the worktree using fs.readFile.
        const completedDir = `${wtPath}docs/completed/001-my-feature/`;
        fs.addExisting(
          `${completedDir}001-REQ-my-feature.md`,
          "See [overview](overview.md) and [also here](./overview.md) for details.",
        );
        fs.addExisting(
          `${completedDir}001-overview.md`,
          "References [REQ](REQ-my-feature.md) document.",
        );

        await activities.promoteInProgressToCompleted(defaultInput);

        // After Phase 3, the files should have updated references
        const reqContent = fs.getFile(`${completedDir}001-REQ-my-feature.md`);
        expect(reqContent).toBe(
          "See [overview](001-overview.md) and [also here](./001-overview.md) for details.",
        );

        const overviewContent = fs.getFile(`${completedDir}001-overview.md`);
        expect(overviewContent).toBe(
          "References [REQ](001-REQ-my-feature.md) document.",
        );

        // Verify Phase 3 commit
        const phase3Commit = gitClient.commitInWorktreeCalls.find((c) =>
          c.message.includes("update internal refs"),
        );
        expect(phase3Commit).toBeDefined();
        expect(phase3Commit!.message).toBe(
          "chore(lifecycle): update internal refs in 001-my-feature",
        );
      });
    });

    // ─── D12: Phase 3 — cross-feature links left unchanged ──────────────
    describe("D12: Phase 3 — cross-feature links left unchanged", () => {
      it("does not modify links to files outside the feature folder", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        gitClient.listDirInWorktreeResult = ["REQ-my-feature.md"];

        const completedDir = `${wtPath}docs/completed/001-my-feature/`;
        // File has a cross-feature link and an external link
        fs.addExisting(
          `${completedDir}001-REQ-my-feature.md`,
          "See [other feature](../other-feature/REQ-other.md) and [external](https://example.com).",
        );

        await activities.promoteInProgressToCompleted(defaultInput);

        // Content should be unchanged — no same-folder files were referenced
        const content = fs.getFile(`${completedDir}001-REQ-my-feature.md`);
        expect(content).toBe(
          "See [other feature](../other-feature/REQ-other.md) and [external](https://example.com).",
        );
      });
    });

    // ─── D13: Phase 3 — parse error logs warning, continues ─────────────
    describe("D13: Phase 3 — parse error on internal ref update logs warning, continues", () => {
      it("logs warning and continues when readFile throws during ref update", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        gitClient.listDirInWorktreeResult = [
          "REQ-my-feature.md",
          "overview.md",
        ];

        // Set up one file but make the other missing (simulates read error)
        const completedDir = `${wtPath}docs/completed/001-my-feature/`;
        fs.addExisting(
          `${completedDir}001-REQ-my-feature.md`,
          "See [overview](overview.md).",
        );
        // 001-overview.md is NOT added — readFile will throw ENOENT

        const result = await activities.promoteInProgressToCompleted(defaultInput);

        // Should still succeed
        expect(result.promoted).toBe(true);

        // Should have a warning log
        const warnMessages = logger.messages
          .filter((m) => m.level === "warn")
          .map((m) => m.message);
        expect(warnMessages.length).toBeGreaterThan(0);
        expect(warnMessages.some((m) => m.includes("001-overview.md"))).toBe(true);
      });
    });

    // ─── D14: worktree destroyed in finally block ────────────────────────
    describe("D14: worktree destroyed in finally block", () => {
      it("destroys worktree on success", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);
        gitClient.listDirInWorktreeResult = [];

        await activities.promoteInProgressToCompleted(defaultInput);

        expect(worktreeManager.destroyCalls).toEqual([wtPath]);
      });

      it("destroys worktree on failure", async () => {
        const wtPath = "/tmp/ptah-wt-fake-1/";
        // Simulate failure: git mv throws
        gitClient.gitMvInWorktreeError = new Error("git mv failed");
        fs.addExistingDir(`${wtPath}docs/in-progress/my-feature`);
        fs.addExistingDir(`${wtPath}docs/completed`);

        try {
          await activities.promoteInProgressToCompleted(defaultInput);
        } catch {
          // expected
        }

        expect(worktreeManager.destroyCalls).toEqual([wtPath]);
      });
    });
  });
});
