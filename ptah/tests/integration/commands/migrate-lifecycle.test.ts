/**
 * Integration test for MigrateLifecycleCommand (G10).
 *
 * Uses a real temporary git repository. Verifies the full migration with
 * actual filesystem operations and git commands.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrateLifecycleCommand } from "../../../src/commands/migrate-lifecycle.js";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import { NodeGitClient } from "../../../src/services/git.js";
import { ConsoleLogger } from "../../../src/services/logger.js";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function initGitRepo(dir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
}

async function createAndCommitDocs(dir: string, structure: Record<string, string>): Promise<void> {
  // Write all files
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = nodePath.join(dir, relPath);
    await nodeFs.mkdir(nodePath.dirname(fullPath), { recursive: true });
    await nodeFs.writeFile(fullPath, content);
  }
  await execFileAsync("git", ["add", "-A"], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", "chore: initial docs structure"], { cwd: dir });
}

async function checkFileExists(dir: string, relPath: string): Promise<boolean> {
  try {
    await nodeFs.access(nodePath.join(dir, relPath));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// G10: Full migration integration test
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand integration (G10)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-migrate-lc-"));
    await initGitRepo(tempDir);

    // Set up a realistic docs/ structure:
    // - docs/001-old-completed-feature/ — should go to completed/
    // - docs/002-another-completed/    — should go to completed/
    // - docs/active-wip/               — should go to in-progress/
    // - docs/another-wip/              — should go to in-progress/
    // - docs/requirements/             — should stay (system dir)
    // - docs/templates/                — should stay (system dir)
    await createAndCommitDocs(tempDir, {
      "docs/001-old-completed-feature/REQ.md": "# Requirements\nContent",
      "docs/001-old-completed-feature/TSPEC.md": "# TSPEC\nContent",
      "docs/002-another-completed/REQ.md": "# Requirements\nContent",
      "docs/active-wip/REQ.md": "# Requirements\nContent",
      "docs/another-wip/REQ.md": "# Requirements\nContent",
      "docs/requirements/template.md": "# Requirements template",
      "docs/templates/feature.md": "# Feature template",
    });
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  it("migrates all features to correct lifecycle folders", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.completedMoved).toBe(2);
    expect(result.inProgressMoved).toBe(2);
    expect(result.committed).toBe(true);
  });

  it("places NNN-prefixed folders in docs/completed/", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(
      await checkFileExists(tempDir, "docs/completed/001-old-completed-feature/REQ.md"),
    ).toBe(true);
    expect(
      await checkFileExists(tempDir, "docs/completed/002-another-completed/REQ.md"),
    ).toBe(true);
  });

  it("places remaining feature folders in docs/in-progress/", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(
      await checkFileExists(tempDir, "docs/in-progress/active-wip/REQ.md"),
    ).toBe(true);
    expect(
      await checkFileExists(tempDir, "docs/in-progress/another-wip/REQ.md"),
    ).toBe(true);
  });

  it("leaves system directories (requirements/, templates/) in place", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(await checkFileExists(tempDir, "docs/requirements/template.md")).toBe(true);
    expect(await checkFileExists(tempDir, "docs/templates/feature.md")).toBe(true);
  });

  it("creates lifecycle dirs with .gitkeep files", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(await checkFileExists(tempDir, "docs/backlog/.gitkeep")).toBe(true);
    expect(await checkFileExists(tempDir, "docs/in-progress/.gitkeep")).toBe(true);
    expect(await checkFileExists(tempDir, "docs/completed/.gitkeep")).toBe(true);
  });

  it("original locations are gone after migration", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(await checkFileExists(tempDir, "docs/001-old-completed-feature")).toBe(false);
    expect(await checkFileExists(tempDir, "docs/active-wip")).toBe(false);
  });

  it("creates a git commit with the migration message", async () => {
    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const logger = new ConsoleLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    const { stdout } = await execFileAsync("git", ["log", "--oneline", "-1"], { cwd: tempDir });
    expect(stdout).toContain("chore(migration): reorganize docs/ into lifecycle folders");
  });
}, { timeout: 30000 });
