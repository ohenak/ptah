import { describe, it, expect } from "vitest";
import { FakeGitClient } from "../../fixtures/factories.js";

describe("FakeGitClient", () => {
  it("isRepo returns true by default", async () => {
    const git = new FakeGitClient();
    expect(await git.isRepo()).toBe(true);
  });

  it("isRepo returns configured value", async () => {
    const git = new FakeGitClient();
    git.isRepoReturn = false;
    expect(await git.isRepo()).toBe(false);
  });

  it("hasStagedChanges returns false by default", async () => {
    const git = new FakeGitClient();
    expect(await git.hasStagedChanges()).toBe(false);
  });

  it("hasStagedChanges returns configured value", async () => {
    const git = new FakeGitClient();
    git.hasStagedReturn = true;
    expect(await git.hasStagedChanges()).toBe(true);
  });

  it("add records paths", async () => {
    const git = new FakeGitClient();
    await git.add(["file1.txt", "file2.txt"]);
    expect(git.addedPaths).toEqual([["file1.txt", "file2.txt"]]);
  });

  it("commit records message", async () => {
    const git = new FakeGitClient();
    await git.commit("test commit");
    expect(git.commits).toEqual(["test commit"]);
  });

  it("add throws when addError is set", async () => {
    const git = new FakeGitClient();
    git.addError = new Error("git add failed");
    await expect(git.add(["file.txt"])).rejects.toThrow("git add failed");
  });

  it("commit throws when commitError is set", async () => {
    const git = new FakeGitClient();
    git.commitError = new Error("git commit failed");
    await expect(git.commit("msg")).rejects.toThrow("git commit failed");
  });

  // --- Phase 10 methods ---

  describe("createWorktreeFromBranch", () => {
    it("records call and adds to worktrees", async () => {
      const git = new FakeGitClient();
      await git.createWorktreeFromBranch("new-branch", "/tmp/wt", "main");
      expect(git.createWorktreeFromBranchCalls).toHaveLength(1);
      expect(git.createWorktreeFromBranchCalls[0]).toEqual({
        newBranch: "new-branch",
        path: "/tmp/wt",
        baseBranch: "main",
      });
      expect(git.worktrees).toContainEqual({ path: "/tmp/wt", branch: "new-branch" });
      expect(git.createdWorktrees).toContainEqual({ path: "/tmp/wt", branch: "new-branch" });
    });

    it("throws when createWorktreeFromBranchError is set", async () => {
      const git = new FakeGitClient();
      git.createWorktreeFromBranchError = new Error("worktree from branch failed");
      await expect(
        git.createWorktreeFromBranch("b", "/p", "base"),
      ).rejects.toThrow("worktree from branch failed");
    });
  });

  describe("checkoutBranchInWorktree", () => {
    it("records call and adds to worktrees", async () => {
      const git = new FakeGitClient();
      await git.checkoutBranchInWorktree("feat-abc", "/tmp/merge-wt");
      expect(git.checkoutBranchInWorktreeCalls).toHaveLength(1);
      expect(git.checkoutBranchInWorktreeCalls[0]).toEqual({ branch: "feat-abc", path: "/tmp/merge-wt" });
      expect(git.worktrees).toContainEqual({ path: "/tmp/merge-wt", branch: "feat-abc" });
    });

    it("throws when checkoutBranchInWorktreeError is set", async () => {
      const git = new FakeGitClient();
      git.checkoutBranchInWorktreeError = new Error("checkout failed");
      await expect(
        git.checkoutBranchInWorktree("b", "/p"),
      ).rejects.toThrow("checkout failed");
    });
  });

  describe("createBranchFromRef", () => {
    it("records call", async () => {
      const git = new FakeGitClient();
      await git.createBranchFromRef("feat-new", "main");
      expect(git.createBranchFromRefCalls).toHaveLength(1);
      expect(git.createBranchFromRefCalls[0]).toEqual({ branch: "feat-new", ref: "main" });
    });

    it("throws when createBranchFromRefError is set", async () => {
      const git = new FakeGitClient();
      git.createBranchFromRefError = new Error("branch create failed");
      await expect(git.createBranchFromRef("b", "ref")).rejects.toThrow("branch create failed");
    });
  });

  describe("pullInWorktree", () => {
    it("records call", async () => {
      const git = new FakeGitClient();
      await git.pullInWorktree("/tmp/wt", "origin", "feat-x");
      expect(git.pullInWorktreeCalls).toHaveLength(1);
      expect(git.pullInWorktreeCalls[0]).toEqual({
        worktreePath: "/tmp/wt",
        remote: "origin",
        branch: "feat-x",
      });
    });

    it("throws when pullInWorktreeError is set", async () => {
      const git = new FakeGitClient();
      git.pullInWorktreeError = new Error("pull failed");
      await expect(git.pullInWorktree("/wt", "origin", "b")).rejects.toThrow("pull failed");
    });
  });

  describe("mergeInWorktree", () => {
    it("records call and returns mergeInWorktreeResult", async () => {
      const git = new FakeGitClient();
      git.mergeInWorktreeResult = "merged";
      const result = await git.mergeInWorktree("/tmp/wt", "ptah/feat/eng/abc");
      expect(result).toBe("merged");
      expect(git.mergeInWorktreeCalls).toHaveLength(1);
      expect(git.mergeInWorktreeCalls[0]).toEqual({
        worktreePath: "/tmp/wt",
        branch: "ptah/feat/eng/abc",
      });
    });

    it("returns conflict when mergeInWorktreeResult is conflict", async () => {
      const git = new FakeGitClient();
      git.mergeInWorktreeResult = "conflict";
      const result = await git.mergeInWorktree("/wt", "b");
      expect(result).toBe("conflict");
    });

    it("throws when mergeInWorktreeError is set", async () => {
      const git = new FakeGitClient();
      git.mergeInWorktreeError = new Error("merge failed");
      await expect(git.mergeInWorktree("/wt", "b")).rejects.toThrow("merge failed");
    });
  });

  describe("abortMergeInWorktree", () => {
    it("records worktreePath", async () => {
      const git = new FakeGitClient();
      await git.abortMergeInWorktree("/tmp/wt");
      expect(git.abortMergeInWorktreeCalls).toContain("/tmp/wt");
    });

    it("throws when abortMergeInWorktreeError is set", async () => {
      const git = new FakeGitClient();
      git.abortMergeInWorktreeError = new Error("abort failed");
      await expect(git.abortMergeInWorktree("/wt")).rejects.toThrow("abort failed");
    });
  });

  describe("getConflictedFiles", () => {
    it("records call and returns getConflictedFilesResult", async () => {
      const git = new FakeGitClient();
      git.getConflictedFilesResult = ["docs/a.md", "docs/b.md"];
      const result = await git.getConflictedFiles("/tmp/wt");
      expect(result).toEqual(["docs/a.md", "docs/b.md"]);
      expect(git.getConflictedFilesCalls).toContain("/tmp/wt");
    });

    it("returns empty array by default", async () => {
      const git = new FakeGitClient();
      const result = await git.getConflictedFiles("/wt");
      expect(result).toEqual([]);
    });
  });

  describe("pushInWorktree", () => {
    it("records call", async () => {
      const git = new FakeGitClient();
      await git.pushInWorktree("/tmp/wt", "origin", "feat-x");
      expect(git.pushInWorktreeCalls).toHaveLength(1);
      expect(git.pushInWorktreeCalls[0]).toEqual({
        worktreePath: "/tmp/wt",
        remote: "origin",
        branch: "feat-x",
      });
    });

    it("throws when pushInWorktreeError is set", async () => {
      const git = new FakeGitClient();
      git.pushInWorktreeError = new Error("push rejected");
      await expect(git.pushInWorktree("/wt", "origin", "b")).rejects.toThrow("push rejected");
    });
  });
});
