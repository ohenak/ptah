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
});
