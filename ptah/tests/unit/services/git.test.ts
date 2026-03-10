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

      await client.createWorktree("/tmp/wt-123", "feat/my-branch");

      const mockFn = vi.mocked(execFile);
      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[0]).toBe("git");
      expect(callArgs[1]).toEqual(["worktree", "add", "-b", "feat/my-branch", "/tmp/wt-123"]);
      expect(callArgs[2]).toEqual({ cwd: "/test/repo" });
    });

    it("throws on failure", async () => {
      setupExecFileMock([{ error: new Error("worktree already exists") }]);

      await expect(client.createWorktree("/tmp/wt-123", "feat/dup")).rejects.toThrow(
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
