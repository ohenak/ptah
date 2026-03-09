import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TSX_BIN = nodePath.resolve(__dirname, "../../../node_modules/.bin/tsx");
const CLI_ENTRY = nodePath.resolve(__dirname, "../../../bin/ptah.ts");

// Task 38 & 39: Composition root wiring and CLI exit codes
describe("CLI integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-cli-int-"));
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  async function runCli(
    cwd: string,
    ...args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execFileAsync(TSX_BIN, [CLI_ENTRY, ...args], {
        cwd,
        env: { ...process.env, PATH: process.env.PATH },
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitCode: execError.code ?? 1,
      };
    }
  }

  // Task 38: Composition root wiring
  describe("composition root", () => {
    it("wires NodeFileSystem and NodeGitClient into InitCommand on init subcommand", async () => {
      await execFileAsync("git", ["init"], { cwd: tempDir });
      await execFileAsync("git", ["config", "user.email", "test@test.com"], {
        cwd: tempDir,
      });
      await execFileAsync("git", ["config", "user.name", "Test"], {
        cwd: tempDir,
      });

      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Created");
      expect(result.stdout).toContain("Committed");
    });
  });

  // Task 35: CLI output formatting (PROP-IN-33, 34, 35, 36)
  describe("output formatting", () => {
    async function initGitRepo(dir: string): Promise<void> {
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
    }

    // PROP-IN-33: stdout contains "✓  Created {path}" for each created item
    it("prints exact '✓  Created {path}' format for created files", async () => {
      await initGitRepo(tempDir);
      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("✓  Created docs/overview.md");
      expect(result.stdout).toContain("✓  Created ptah.config.json");
    });

    // PROP-IN-34: stdout contains "⊘  Skipped {path} (exists)" for each skipped item
    it("prints exact '⊘  Skipped {path} (exists)' format for skipped files", async () => {
      await initGitRepo(tempDir);
      // Pre-create a file so it gets skipped
      await nodeFs.mkdir(nodePath.join(tempDir, "docs"), { recursive: true });
      await nodeFs.writeFile(nodePath.join(tempDir, "docs/overview.md"), "# Existing");
      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("⊘  Skipped docs/overview.md (exists)");
    });

    // PROP-IN-35: stdout contains "ℹ  No new files created — skipping commit." when created[] is empty
    it("prints no-new-files message when all files already exist", async () => {
      await initGitRepo(tempDir);
      // First run creates everything
      await runCli(tempDir, "init");
      // Second run — all files exist
      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ℹ  No new files created — skipping commit.");
    });

    // PROP-IN-36: stdout contains "✓  Committed: [ptah] init: scaffolded docs structure" after commit
    it("prints exact committed message format after successful commit", async () => {
      await initGitRepo(tempDir);
      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("✓  Committed: [ptah] init: scaffolded docs structure");
    });
  });

  // Help output
  describe("help", () => {
    it("prints help and exits 0 when no arguments provided", async () => {
      const result = await runCli(tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ptah");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("init");
    });

    it("prints help and exits 0 for 'help' subcommand", async () => {
      const result = await runCli(tempDir, "help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("init");
    });

    it("prints help and exits 0 for '--help' flag", async () => {
      const result = await runCli(tempDir, "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("init");
    });

    it("prints version in help output", async () => {
      const result = await runCli(tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("0.1.0");
    });

    it("still exits 1 for unknown subcommands", async () => {
      const result = await runCli(tempDir, "unknown");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });

    // Task 38: help text includes start command
    it("includes start command in help output", async () => {
      const result = await runCli(tempDir, "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("start");
      expect(result.stdout).toContain("Start the Orchestrator as a Discord bot");
    });
  });

  // Task 39: ptah start without valid config
  describe("start command", () => {
    it("exits with 1 and shows actionable error when no config file exists", async () => {
      const result = await runCli(tempDir, "start");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ptah.config.json not found");
      expect(result.stderr).toContain("ptah init");
    });
  });

  // Task 39: CLI exit codes
  describe("exit codes", () => {
    it("exits with 0 on success", async () => {
      await execFileAsync("git", ["init"], { cwd: tempDir });
      await execFileAsync("git", ["config", "user.email", "test@test.com"], {
        cwd: tempDir,
      });
      await execFileAsync("git", ["config", "user.name", "Test"], {
        cwd: tempDir,
      });

      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(0);
    });

    it("exits with 1 when not a git repo", async () => {
      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Not a Git repository");
    });

    it("exits with 1 when staged changes exist", async () => {
      await execFileAsync("git", ["init"], { cwd: tempDir });
      await execFileAsync("git", ["config", "user.email", "test@test.com"], {
        cwd: tempDir,
      });
      await execFileAsync("git", ["config", "user.name", "Test"], {
        cwd: tempDir,
      });
      await nodeFs.writeFile(nodePath.join(tempDir, "staged.txt"), "content");
      await execFileAsync("git", ["add", "staged.txt"], { cwd: tempDir });

      const result = await runCli(tempDir, "init");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Staged changes detected");
    });

    it("exits with 1 for unknown subcommand", async () => {
      const result = await runCli(tempDir, "unknown");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });
});
