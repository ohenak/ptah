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
});
