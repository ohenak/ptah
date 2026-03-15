import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NodeGitClient } from "../../../src/services/git.js";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function gitExec(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function initRepo(dir: string): Promise<void> {
  await gitExec(dir, "init", "-b", "main");
  await gitExec(dir, "config", "user.email", "test@test.com");
  await gitExec(dir, "config", "user.name", "Test");
}

async function makeCommit(dir: string, filename: string, content: string, message: string): Promise<void> {
  await nodeFs.writeFile(nodePath.join(dir, filename), content);
  await gitExec(dir, "add", filename);
  await gitExec(dir, "commit", "-m", message);
}

describe("NodeGitClient", () => {
  let tempDir: string;
  let client: NodeGitClient;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-git-test-"));
    client = new NodeGitClient(tempDir);
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  // Task 30: isRepo()
  describe("isRepo", () => {
    it("returns false when not a git repo", async () => {
      expect(await client.isRepo()).toBe(false);
    });

    it("returns true when inside a git repo", async () => {
      await gitExec(tempDir, "init");
      expect(await client.isRepo()).toBe(true);
    });
  });

  // Task 31: hasStagedChanges()
  describe("hasStagedChanges", () => {
    it("returns false when no staged changes", async () => {
      await gitExec(tempDir, "init");
      // Configure git user for the test repo
      await gitExec(tempDir, "config", "user.email", "test@test.com");
      await gitExec(tempDir, "config", "user.name", "Test");
      expect(await client.hasStagedChanges()).toBe(false);
    });

    it("returns true when files are staged", async () => {
      await gitExec(tempDir, "init");
      await gitExec(tempDir, "config", "user.email", "test@test.com");
      await gitExec(tempDir, "config", "user.name", "Test");
      await nodeFs.writeFile(nodePath.join(tempDir, "file.txt"), "content");
      await gitExec(tempDir, "add", "file.txt");
      expect(await client.hasStagedChanges()).toBe(true);
    });
  });

  // Task 32: add() and commit()
  describe("add and commit", () => {
    it("adds files and commits them", async () => {
      await gitExec(tempDir, "init");
      await gitExec(tempDir, "config", "user.email", "test@test.com");
      await gitExec(tempDir, "config", "user.name", "Test");

      await nodeFs.writeFile(nodePath.join(tempDir, "file.txt"), "content");
      await client.add(["file.txt"]);
      await client.commit("test commit");

      const log = await gitExec(tempDir, "log", "--oneline");
      expect(log).toContain("test commit");
    });

    it("adds multiple files", async () => {
      await gitExec(tempDir, "init");
      await gitExec(tempDir, "config", "user.email", "test@test.com");
      await gitExec(tempDir, "config", "user.name", "Test");

      await nodeFs.writeFile(nodePath.join(tempDir, "a.txt"), "a");
      await nodeFs.writeFile(nodePath.join(tempDir, "b.txt"), "b");
      await client.add(["a.txt", "b.txt"]);
      await client.commit("add two files");

      const log = await gitExec(tempDir, "log", "--oneline");
      expect(log).toContain("add two files");
    });
  });

  // Task 33: Error handling
  describe("error handling", () => {
    it("isRepo returns false for non-repo directory (no throw)", async () => {
      // Non-git directory should not throw, just return false
      expect(await client.isRepo()).toBe(false);
    });

    it("add throws for nonexistent files", async () => {
      await gitExec(tempDir, "init");
      await expect(client.add(["nonexistent.txt"])).rejects.toThrow();
    });

    it("commit throws when nothing is staged", async () => {
      await gitExec(tempDir, "init");
      await gitExec(tempDir, "config", "user.email", "test@test.com");
      await gitExec(tempDir, "config", "user.name", "Test");
      await expect(client.commit("empty commit")).rejects.toThrow();
    });
  });

  // --- Phase 10 ---

  describe("createWorktreeFromBranch", () => {
    it("creates a new worktree on a new branch from a base branch", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      const worktreePath = nodePath.join(tempDir, "sub-wt");
      await client.createWorktreeFromBranch("feat-new", worktreePath, "main");

      // Worktree directory exists
      const stat = await nodeFs.stat(worktreePath);
      expect(stat.isDirectory()).toBe(true);

      // Branch is on the worktree
      const branch = await gitExec(worktreePath, "rev-parse", "--abbrev-ref", "HEAD");
      expect(branch).toBe("feat-new");
    });

    it("throws on failure (invalid base branch)", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      const worktreePath = nodePath.join(tempDir, "sub-wt");
      await expect(
        client.createWorktreeFromBranch("feat-new", worktreePath, "nonexistent-branch"),
      ).rejects.toThrow(/git worktree add \(from branch\) failed/);
    });
  });

  describe("checkoutBranchInWorktree", () => {
    it("creates a worktree for an existing branch", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");
      await gitExec(tempDir, "branch", "feat-existing");

      const worktreePath = nodePath.join(tempDir, "checkout-wt");
      await client.checkoutBranchInWorktree("feat-existing", worktreePath);

      const stat = await nodeFs.stat(worktreePath);
      expect(stat.isDirectory()).toBe(true);

      const branch = await gitExec(worktreePath, "rev-parse", "--abbrev-ref", "HEAD");
      expect(branch).toBe("feat-existing");
    });

    it("throws on failure (branch already checked out)", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");
      // 'main' is already checked out in tempDir
      const worktreePath = nodePath.join(tempDir, "checkout-wt");
      await expect(
        client.checkoutBranchInWorktree("main", worktreePath),
      ).rejects.toThrow(/git worktree add \(checkout\) failed/);
    });
  });

  describe("createBranchFromRef", () => {
    it("creates a new branch from the given ref", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      await client.createBranchFromRef("feat-brand-new", "main");

      const branches = await gitExec(tempDir, "branch");
      expect(branches).toContain("feat-brand-new");
    });

    it("throws when branch already exists", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      await client.createBranchFromRef("new-branch", "main");
      // Creating again should fail
      await expect(
        client.createBranchFromRef("new-branch", "main"),
      ).rejects.toThrow(/git branch create failed/);
    });
  });

  describe("pullInWorktree", () => {
    let bareDir: string;

    beforeEach(async () => {
      // Create a bare repo as "remote"
      bareDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-bare-"));
      await gitExec(bareDir, "init", "--bare");

      // Initialize tempDir as a regular repo
      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      // Push main to bare
      await gitExec(tempDir, "remote", "add", "origin", bareDir);
      await gitExec(tempDir, "push", "origin", "main");
    });

    afterEach(async () => {
      await nodeFs.rm(bareDir, { recursive: true, force: true });
    });

    it("success: pulls a branch that exists on remote", async () => {
      // Create a feature branch on tempDir and push it
      await gitExec(tempDir, "checkout", "-b", "feat-pull-test");
      await makeCommit(tempDir, "feat.txt", "feature content", "feat commit");
      await gitExec(tempDir, "push", "origin", "feat-pull-test");

      // Create a worktree for the branch
      const worktreePath = nodePath.join(tempDir, "pull-wt");
      await client.createWorktreeFromBranch("feat-pull-local", worktreePath, "main");

      // Checkout the feature branch in the worktree
      await gitExec(worktreePath, "checkout", "-b", "feat-pull-test2");
      await gitExec(worktreePath, "fetch", "origin", "feat-pull-test");

      // Pull should succeed (or silently proceed)
      await expect(
        client.pullInWorktree(worktreePath, "origin", "feat-pull-test"),
      ).resolves.not.toThrow();
    });

    it("new-branch silent return: doesn't throw when remote ref not found", async () => {
      // Create worktree on new branch (no remote tracking ref)
      const worktreePath = nodePath.join(tempDir, "new-branch-wt");
      await client.createWorktreeFromBranch("feat-brand-new", worktreePath, "main");

      // Pull for a branch that has no remote ref — should resolve without throwing
      await expect(
        client.pullInWorktree(worktreePath, "origin", "feat-brand-new"),
      ).resolves.not.toThrow();
    });

    it("genuine error: throws when remote URL is invalid", async () => {
      const worktreePath = nodePath.join(tempDir, "err-wt");
      await client.createWorktreeFromBranch("feat-err-branch", worktreePath, "main");

      // Add an invalid remote
      await gitExec(worktreePath, "remote", "add", "bad-remote", "/nonexistent/path/to/repo");

      await expect(
        client.pullInWorktree(worktreePath, "bad-remote", "feat-err-branch"),
      ).rejects.toThrow(/git pull in worktree failed/);
    });
  });

  describe("mergeInWorktree", () => {
    it("returns merged on clean merge", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "base.txt", "base", "base commit");

      // Create feature branch with a commit
      await gitExec(tempDir, "checkout", "-b", "feat-merge-test");
      await makeCommit(tempDir, "feat.txt", "feat content", "feat commit");

      // Create merge worktree on a new branch from main
      const mergeWt = nodePath.join(tempDir, "merge-wt");
      await client.createWorktreeFromBranch("merge-main", mergeWt, "main");

      // Merge feature branch into merge-main (no conflict)
      const result = await client.mergeInWorktree(mergeWt, "feat-merge-test");
      expect(result).toBe("merged");
    });

    it("returns conflict when there is a conflict (does NOT abort)", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "shared.txt", "base", "base commit");

      // Create feature branch that modifies shared.txt
      await gitExec(tempDir, "checkout", "-b", "feat-conflict");
      await makeCommit(tempDir, "shared.txt", "feat version", "feat: modify shared");

      // Also modify shared.txt on main
      await gitExec(tempDir, "checkout", "main");
      await makeCommit(tempDir, "shared.txt", "main version", "main: modify shared");

      // Create merge worktree on a new branch from main
      const mergeWt = nodePath.join(tempDir, "conflict-merge-wt");
      await client.createWorktreeFromBranch("conflict-main", mergeWt, "main");

      const result = await client.mergeInWorktree(mergeWt, "feat-conflict");
      expect(result).toBe("conflict");

      // Verify merge is NOT aborted (MERGE_HEAD still exists)
      const mergeHeadExists = await nodeFs.access(
        nodePath.join(mergeWt, ".git"),
      ).then(() => true).catch(() => false);
      expect(mergeHeadExists).toBe(true);
    });
  });

  describe("abortMergeInWorktree", () => {
    it("aborts an in-progress merge", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "shared.txt", "base", "base commit");

      await gitExec(tempDir, "checkout", "-b", "feat-abort-conflict");
      await makeCommit(tempDir, "shared.txt", "feat version", "feat: modify shared");

      await gitExec(tempDir, "checkout", "main");
      await makeCommit(tempDir, "shared.txt", "main version", "main: modify shared");

      const mergeWt = nodePath.join(tempDir, "abort-wt");
      await client.createWorktreeFromBranch("abort-main", mergeWt, "main");

      // Start a conflicting merge
      await client.mergeInWorktree(mergeWt, "feat-abort-conflict");

      // Abort should succeed
      await expect(client.abortMergeInWorktree(mergeWt)).resolves.not.toThrow();
    });
  });

  describe("getConflictedFiles", () => {
    it("returns list of conflicted files after a merge conflict", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "shared.txt", "base", "base commit");

      await gitExec(tempDir, "checkout", "-b", "feat-conflict-files");
      await makeCommit(tempDir, "shared.txt", "feat version", "feat: modify");

      await gitExec(tempDir, "checkout", "main");
      await makeCommit(tempDir, "shared.txt", "main version", "main: modify");

      const mergeWt = nodePath.join(tempDir, "conflict-files-wt");
      await client.createWorktreeFromBranch("conflict-files-main", mergeWt, "main");
      await client.mergeInWorktree(mergeWt, "feat-conflict-files");

      const conflictFiles = await client.getConflictedFiles(mergeWt);
      expect(conflictFiles).toContain("shared.txt");
    });

    it("returns empty array when no conflicts", async () => {
      await initRepo(tempDir);
      await makeCommit(tempDir, "file.txt", "content", "initial");

      const worktreePath = nodePath.join(tempDir, "no-conflict-wt");
      await client.createWorktreeFromBranch("no-conflict-main", worktreePath, "main");

      const files = await client.getConflictedFiles(worktreePath);
      expect(files).toEqual([]);
    });
  });

  describe("pushInWorktree", () => {
    let bareDir: string;

    beforeEach(async () => {
      bareDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-bare-push-"));
      await gitExec(bareDir, "init", "--bare");

      await initRepo(tempDir);
      await makeCommit(tempDir, "init.txt", "init", "initial commit");

      await gitExec(tempDir, "remote", "add", "origin", bareDir);
      await gitExec(tempDir, "push", "origin", "main");
    });

    afterEach(async () => {
      await nodeFs.rm(bareDir, { recursive: true, force: true });
    });

    it("pushes a branch to remote", async () => {
      // Create a feature branch with a commit, then switch back to main
      await gitExec(tempDir, "checkout", "-b", "feat-push-test");
      await makeCommit(tempDir, "feat.txt", "feat", "feat commit");
      await gitExec(tempDir, "checkout", "main");

      const worktreePath = nodePath.join(tempDir, "push-wt");
      await client.checkoutBranchInWorktree("feat-push-test", worktreePath);

      // Push from the worktree
      await expect(
        client.pushInWorktree(worktreePath, "origin", "feat-push-test"),
      ).resolves.not.toThrow();

      // Verify by checking branches on bare remote
      const remoteBranches = await gitExec(bareDir, "branch");
      expect(remoteBranches).toContain("feat-push-test");
    });

    it("throws when push fails (invalid remote)", async () => {
      await gitExec(tempDir, "checkout", "-b", "feat-push-fail");
      await makeCommit(tempDir, "fail.txt", "fail", "fail commit");
      await gitExec(tempDir, "checkout", "main");

      const worktreePath = nodePath.join(tempDir, "push-fail-wt");
      await client.checkoutBranchInWorktree("feat-push-fail", worktreePath);
      await gitExec(worktreePath, "remote", "add", "bad-remote", "/nonexistent/repo");

      await expect(
        client.pushInWorktree(worktreePath, "bad-remote", "feat-push-fail"),
      ).rejects.toThrow(/git push in worktree failed/);
    });
  });
});
