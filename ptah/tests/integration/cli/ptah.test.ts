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
