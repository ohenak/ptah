import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InitCommand } from "../../../src/commands/init.js";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import { NodeGitClient } from "../../../src/services/git.js";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Task 37: Performance guard with real filesystem + Git
describe("InitCommand integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-init-int-"));
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test"], {
      cwd: tempDir,
    });
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  it("completes within 30 seconds using real filesystem and git", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const command = new InitCommand(fs, git);

    const start = Date.now();
    const result = await command.execute();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(30000);
    expect(result.created.length).toBeGreaterThan(0);
    expect(result.committed).toBe(true);
  });

  it("creates all expected files on real filesystem", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const command = new InitCommand(fs, git);

    const result = await command.execute();

    // Verify files exist on disk
    for (const filePath of result.created) {
      const fullPath = nodePath.join(tempDir, filePath);
      const stat = await nodeFs.stat(fullPath);
      expect(stat.isFile(), `Expected ${filePath} to exist on disk`).toBe(true);
    }
  });

  it("creates a real git commit", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const command = new InitCommand(fs, git);

    await command.execute();

    const { stdout } = await execFileAsync("git", ["log", "--oneline"], {
      cwd: tempDir,
    });
    expect(stdout).toContain("[ptah] init: scaffolded docs structure");
  });
});
