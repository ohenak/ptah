import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { NodeGitClient } from "../../../src/services/git.js";

// Helper to set up execFile mock responses
function mockExecFile(
  responses: Array<{ stdout?: string; stderr?: string; error?: Error }>,
) {
  const mockFn = vi.mocked(execFile);
  let callIndex = 0;

  mockFn.mockImplementation(
    ((_cmd: unknown, _args: unknown, _opts: unknown, callback?: Function) => {
      const response = responses[callIndex++] ?? responses[responses.length - 1];
      if (!callback) {
        // promisified usage: return value is used by promisify
        // We need to handle the callback-based API that promisify wraps
        return undefined;
      }
      if (response.error) {
        callback(response.error, { stdout: "", stderr: "" });
      } else {
        callback(null, {
          stdout: response.stdout ?? "",
          stderr: response.stderr ?? "",
        });
      }
    }) as any,
  );
}

// Better helper using promisify-compatible pattern
function setupExecFileMock(
  responses: Array<{ stdout?: string; stderr?: string; error?: Error }>,
) {
  const mockFn = vi.mocked(execFile);
  let callIndex = 0;

  mockFn.mockImplementation(
    ((...args: unknown[]) => {
      const callback = args[args.length - 1];
      const response = responses[callIndex++] ?? responses[responses.length - 1];

      if (typeof callback === "function") {
        if (response.error) {
          callback(response.error, { stdout: "", stderr: "" });
        } else {
          callback(null, {
            stdout: response.stdout ?? "",
            stderr: response.stderr ?? "",
          });
        }
      }
    }) as any,
  );
}

describe("NodeGitClient — worktree operations (unit)", () => {
  let client: NodeGitClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NodeGitClient("/test/repo");
  });

  // Task 125: createWorktree()
  describe("createWorktree", () => {
    it("runs git worktree add -b {branch} {path}", async () => {
      setupExecFileMock([{ stdout: "" }]);

      await client.createWorktree("feat/my-branch", "/tmp/wt-123");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[0]).toBe("git");
      expect(callArgs[1]).toEqual(["worktree", "add", "-b", "feat/my-branch", "/tmp/wt-123"]);
      expect(callArgs[2]).toEqual({ cwd: "/test/repo" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("worktree already exists") }]);

      await expect(client.createWorktree("feat/dup", "/tmp/wt-123")).rejects.toThrow(
        "git worktree add failed",
      );
    });
  });

  // Task 126: removeWorktree()
  describe("removeWorktree", () => {
    it("runs git worktree remove --force {path}", async () => {
      setupExecFileMock([{ stdout: "" }]);

      await client.removeWorktree("/tmp/wt-123");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[0]).toBe("git");
      expect(callArgs[1]).toEqual(["worktree", "remove", "--force", "/tmp/wt-123"]);
      expect(callArgs[2]).toEqual({ cwd: "/test/repo" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("not a worktree") }]);

      await expect(client.removeWorktree("/tmp/wt-bad")).rejects.toThrow(
        "git worktree remove failed",
      );
    });
  });

  // Task 127: deleteBranch()
  describe("deleteBranch", () => {
    it("runs git branch -D {branch}", async () => {
      setupExecFileMock([{ stdout: "" }]);

      await client.deleteBranch("feat/old-branch");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[0]).toBe("git");
      expect(callArgs[1]).toEqual(["branch", "-D", "feat/old-branch"]);
      expect(callArgs[2]).toEqual({ cwd: "/test/repo" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("branch not found") }]);

      await expect(client.deleteBranch("nonexistent")).rejects.toThrow(
        "git branch delete failed",
      );
    });
  });

  // Task 128: listWorktrees()
  describe("listWorktrees", () => {
    it("parses git worktree list --porcelain output into WorktreeInfo[]", async () => {
      const porcelainOutput = [
        "worktree /main/repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /tmp/wt-feat",
        "HEAD def456",
        "branch refs/heads/feat/my-feature",
        "",
      ].join("\n");

      setupExecFileMock([{ stdout: porcelainOutput }]);

      const result = await client.listWorktrees();

      expect(result).toEqual([
        { path: "/main/repo", branch: "main" },
        { path: "/tmp/wt-feat", branch: "feat/my-feature" },
      ]);

      const mockFn = vi.mocked(execFile);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[1]).toEqual(["worktree", "list", "--porcelain"]);
    });

    it("returns empty array when no worktrees have branches", async () => {
      const porcelainOutput = [
        "worktree /main/repo",
        "HEAD abc123",
        "bare",
        "",
      ].join("\n");

      setupExecFileMock([{ stdout: porcelainOutput }]);

      const result = await client.listWorktrees();
      expect(result).toEqual([]);
    });

    it("strips refs/heads/ prefix from branch names", async () => {
      const porcelainOutput = [
        "worktree /tmp/wt",
        "HEAD abc123",
        "branch refs/heads/ptah/agent-abc",
        "",
      ].join("\n");

      setupExecFileMock([{ stdout: porcelainOutput }]);

      const result = await client.listWorktrees();
      expect(result[0].branch).toBe("ptah/agent-abc");
    });
  });

  // Task 129: pruneWorktrees()
  describe("pruneWorktrees", () => {
    it("lists worktrees, removes those with matching branch prefix, deletes their branches", async () => {
      const porcelainOutput = [
        "worktree /main/repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /tmp/ptah-wt-1",
        "HEAD def456",
        "branch refs/heads/ptah/agent-1",
        "",
        "worktree /tmp/ptah-wt-2",
        "HEAD ghi789",
        "branch refs/heads/ptah/agent-2",
        "",
        "worktree /tmp/other-wt",
        "HEAD jkl012",
        "branch refs/heads/feature/unrelated",
        "",
      ].join("\n");

      // Call sequence: listWorktrees, removeWorktree x2, deleteBranch x2
      setupExecFileMock([
        { stdout: porcelainOutput },
        { stdout: "" }, // removeWorktree ptah-wt-1
        { stdout: "" }, // deleteBranch ptah/agent-1
        { stdout: "" }, // removeWorktree ptah-wt-2
        { stdout: "" }, // deleteBranch ptah/agent-2
      ]);

      await client.pruneWorktrees("ptah/");

      const mockFn = vi.mocked(execFile);
      // 1 list + 2 remove + 2 delete = 5 calls
      expect(mockFn).toHaveBeenCalledTimes(5);

      // Verify remove calls
      expect(mockFn.mock.calls[1][1]).toEqual(["worktree", "remove", "--force", "/tmp/ptah-wt-1"]);
      expect(mockFn.mock.calls[2][1]).toEqual(["branch", "-D", "ptah/agent-1"]);
      expect(mockFn.mock.calls[3][1]).toEqual(["worktree", "remove", "--force", "/tmp/ptah-wt-2"]);
      expect(mockFn.mock.calls[4][1]).toEqual(["branch", "-D", "ptah/agent-2"]);
    });

    it("does nothing when no worktrees match the prefix", async () => {
      const porcelainOutput = [
        "worktree /main/repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
      ].join("\n");

      setupExecFileMock([{ stdout: porcelainOutput }]);

      await client.pruneWorktrees("ptah/");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1); // Only list call
    });
  });

  // Task 130: diffWorktree()
  describe("diffWorktree", () => {
    it("runs git diff --name-only HEAD in worktree, returns changed file paths", async () => {
      setupExecFileMock([{
        stdout: "src/main.ts\nsrc/utils.ts\nREADME.md\n",
      }]);

      const result = await client.diffWorktree("/tmp/my-worktree");

      expect(result).toEqual(["src/main.ts", "src/utils.ts", "README.md"]);

      const mockFn = vi.mocked(execFile);
      expect(mockFn.mock.calls[0][1]).toEqual(["diff", "--name-only", "HEAD"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/tmp/my-worktree" });
    });

    it("returns empty array when no changes", async () => {
      setupExecFileMock([{ stdout: "" }]);

      const result = await client.diffWorktree("/tmp/clean-worktree");
      expect(result).toEqual([]);
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("not a git repo") }]);

      await expect(client.diffWorktree("/tmp/bad")).rejects.toThrow("git diff failed");
    });
  });
});

// --- Phase 4: Artifact commit git operations ---

describe("NodeGitClient — Phase 4 artifact commit operations (unit)", () => {
  let client: NodeGitClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NodeGitClient("/test/repo");
  });

  // Task 47: addInWorktree
  describe("addInWorktree", () => {
    it("runs git add with file paths in the worktree directory", async () => {
      setupExecFileMock([{ stdout: "" }]);

      await client.addInWorktree("/tmp/wt-123", ["src/main.ts", "README.md"]);

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[0]).toBe("git");
      expect(callArgs[1]).toEqual(["add", "src/main.ts", "README.md"]);
      expect(callArgs[2]).toEqual({ cwd: "/tmp/wt-123" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("pathspec error") }]);

      await expect(
        client.addInWorktree("/tmp/wt-bad", ["nonexistent.ts"]),
      ).rejects.toThrow("git add in worktree failed");
    });
  });

  // Task 48: commitInWorktree
  describe("commitInWorktree", () => {
    it("runs git commit -m in worktree and returns the commit SHA", async () => {
      setupExecFileMock([
        { stdout: "" }, // git commit
        { stdout: "abc123def456\n" }, // git rev-parse HEAD
      ]);

      const sha = await client.commitInWorktree("/tmp/wt-123", "feat: add feature");

      expect(sha).toBe("abc123def456");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn.mock.calls[0][1]).toEqual(["commit", "-m", "feat: add feature"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/tmp/wt-123" });
      expect(mockFn.mock.calls[1][1]).toEqual(["rev-parse", "HEAD"]);
      expect(mockFn.mock.calls[1][2]).toEqual({ cwd: "/tmp/wt-123" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("nothing to commit") }]);

      await expect(
        client.commitInWorktree("/tmp/wt-bad", "empty"),
      ).rejects.toThrow("git commit in worktree failed");
    });
  });

  // Task 49: merge — success
  describe("merge", () => {
    it("runs git merge and returns 'merged' on success", async () => {
      setupExecFileMock([{ stdout: "Merge made by the 'ort' strategy.\n" }]);

      const result = await client.merge("feat/branch");

      expect(result).toBe("merged");

      const mockFn = vi.mocked(execFile);
      expect(mockFn.mock.calls[0][1]).toEqual(["merge", "feat/branch"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/test/repo" });
    });

    // Task 50: merge — conflict
    it("detects merge conflict, aborts, and returns 'conflict'", async () => {
      const conflictError = new Error("merge conflict") as Error & { code: number };
      conflictError.code = 1;

      setupExecFileMock([
        { error: conflictError }, // git merge fails with exit code 1
        { stdout: "" }, // git merge --abort
      ]);

      const result = await client.merge("feat/conflicting");

      expect(result).toBe("conflict");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn.mock.calls[1][1]).toEqual(["merge", "--abort"]);
    });

    it("returns 'merge-error' on non-conflict failures", async () => {
      const otherError = new Error("fatal: not a git repo") as Error & { code: number };
      otherError.code = 128;

      setupExecFileMock([{ error: otherError }]);

      const result = await client.merge("feat/broken");

      expect(result).toBe("merge-error");
    });
  });

  // Task 51: hasUnmergedCommits
  describe("hasUnmergedCommits", () => {
    it("returns true when branch has commits not on HEAD", async () => {
      setupExecFileMock([{ stdout: "abc1234 some commit\ndef5678 another\n" }]);

      const result = await client.hasUnmergedCommits("feat/branch");

      expect(result).toBe(true);

      const mockFn = vi.mocked(execFile);
      expect(mockFn.mock.calls[0][1]).toEqual(["log", "HEAD..feat/branch", "--oneline"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/test/repo" });
    });

    it("returns false when branch has no unmerged commits", async () => {
      setupExecFileMock([{ stdout: "" }]);

      const result = await client.hasUnmergedCommits("feat/branch");

      expect(result).toBe(false);
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("bad revision") }]);

      await expect(client.hasUnmergedCommits("bad/ref")).rejects.toThrow("git log failed");
    });
  });

  // Task 52: diffWorktreeIncludingUntracked
  describe("diffWorktreeIncludingUntracked", () => {
    it("returns combined list of tracked changes and untracked files", async () => {
      setupExecFileMock([
        { stdout: "src/modified.ts\nsrc/changed.ts\n" }, // git diff --name-only HEAD
        { stdout: "src/new-file.ts\n" }, // git ls-files --others --exclude-standard
      ]);

      const result = await client.diffWorktreeIncludingUntracked("/tmp/wt-123");

      expect(result).toEqual(["src/modified.ts", "src/changed.ts", "src/new-file.ts"]);

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn.mock.calls[0][1]).toEqual(["diff", "--name-only", "HEAD"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/tmp/wt-123" });
      expect(mockFn.mock.calls[1][1]).toEqual(["ls-files", "--others", "--exclude-standard"]);
      expect(mockFn.mock.calls[1][2]).toEqual({ cwd: "/tmp/wt-123" });
    });

    it("deduplicates files that appear in both tracked and untracked", async () => {
      setupExecFileMock([
        { stdout: "src/file.ts\n" },
        { stdout: "src/file.ts\n" },
      ]);

      const result = await client.diffWorktreeIncludingUntracked("/tmp/wt-dup");

      expect(result).toEqual(["src/file.ts"]);
    });

    it("returns empty array when no changes", async () => {
      setupExecFileMock([
        { stdout: "" },
        { stdout: "" },
      ]);

      const result = await client.diffWorktreeIncludingUntracked("/tmp/wt-clean");

      expect(result).toEqual([]);
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("not a repo") }]);

      await expect(
        client.diffWorktreeIncludingUntracked("/tmp/bad"),
      ).rejects.toThrow("git diff including untracked failed");
    });
  });

  // Task 53: branchExists
  describe("branchExists", () => {
    it("returns true when branch exists", async () => {
      setupExecFileMock([{ stdout: "abc123\n" }]);

      const result = await client.branchExists("feat/my-branch");

      expect(result).toBe(true);

      const mockFn = vi.mocked(execFile);
      expect(mockFn.mock.calls[0][1]).toEqual(["rev-parse", "--verify", "refs/heads/feat/my-branch"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/test/repo" });
    });

    it("returns false when branch does not exist", async () => {
      setupExecFileMock([{ error: new Error("fatal: Needed a single revision") }]);

      const result = await client.branchExists("nonexistent");

      expect(result).toBe(false);
    });
  });

  // A3: gitMvInWorktree
  describe("gitMvInWorktree", () => {
    it("runs git mv with cwd set to the worktree path", async () => {
      setupExecFileMock([{ stdout: "" }]);

      await client.gitMvInWorktree("/tmp/wt-123", "docs/backlog/my-feature", "docs/in-progress/my-feature");

      const mockFn = vi.mocked(execFile);
      expect(mockFn.mock.calls[0][0]).toBe("git");
      expect(mockFn.mock.calls[0][1]).toEqual(["mv", "docs/backlog/my-feature", "docs/in-progress/my-feature"]);
      expect(mockFn.mock.calls[0][2]).toEqual({ cwd: "/tmp/wt-123" });
    });

    it("throws a descriptive error when git mv fails", async () => {
      setupExecFileMock([{ error: new Error("fatal: not under version control") }]);

      await expect(
        client.gitMvInWorktree("/tmp/wt-123", "src", "dest"),
      ).rejects.toThrow("git mv in worktree failed");
    });
  });

  // A4: listDirInWorktree
  describe("listDirInWorktree", () => {
    it("lists directory contents at worktreePath/dirPath", async () => {
      const os = await import("node:os");
      const fsPromises = await import("node:fs/promises");
      const nodePath = await import("node:path");

      const tmpDir = await fsPromises.mkdtemp(nodePath.join(os.tmpdir(), "ptah-git-test-"));
      const subDir = nodePath.join(tmpDir, "docs", "in-progress");
      await fsPromises.mkdir(subDir, { recursive: true });
      await fsPromises.writeFile(nodePath.join(subDir, "file-a.md"), "", "utf-8");
      await fsPromises.writeFile(nodePath.join(subDir, "file-b.md"), "", "utf-8");

      try {
        const result = await client.listDirInWorktree(tmpDir, "docs/in-progress");
        expect(result.sort()).toEqual(["file-a.md", "file-b.md"]);
      } finally {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
