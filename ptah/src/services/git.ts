import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitClient {
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  createWorktree(branch: string, path: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  pruneWorktrees(branchPrefix: string): Promise<void>;
  diffWorktree(worktreePath: string): Promise<string[]>;
}

export class NodeGitClient implements GitClient {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  async isRepo(): Promise<boolean> {
    try {
      await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: this.cwd,
      });
      return true;
    } catch {
      return false;
    }
  }

  async hasStagedChanges(): Promise<boolean> {
    try {
      await execFileAsync("git", ["diff", "--cached", "--quiet"], {
        cwd: this.cwd,
      });
      return false; // exit code 0 means no staged changes
    } catch (error: unknown) {
      if (isExecError(error) && error.code === 1) {
        return true; // exit code 1 means staged changes exist
      }
      throw error;
    }
  }

  async add(paths: string[]): Promise<void> {
    try {
      await execFileAsync("git", ["add", ...paths], { cwd: this.cwd });
    } catch (error: unknown) {
      throw new Error(
        `git add failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async commit(message: string): Promise<void> {
    try {
      await execFileAsync("git", ["commit", "-m", message], {
        cwd: this.cwd,
      });
    } catch (error: unknown) {
      throw new Error(
        `git commit failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createWorktree(branch: string, path: string): Promise<void> {
    try {
      await execFileAsync("git", ["worktree", "add", "-b", branch, path], {
        cwd: this.cwd,
      });
    } catch (error: unknown) {
      throw new Error(
        `git worktree add failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async removeWorktree(path: string): Promise<void> {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", path], {
        cwd: this.cwd,
      });
    } catch (error: unknown) {
      throw new Error(
        `git worktree remove failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async deleteBranch(branch: string): Promise<void> {
    try {
      await execFileAsync("git", ["branch", "-D", branch], {
        cwd: this.cwd,
      });
    } catch (error: unknown) {
      throw new Error(
        `git branch delete failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async pruneWorktrees(branchPrefix: string): Promise<void> {
    try {
      await execFileAsync("git", ["worktree", "prune"], {
        cwd: this.cwd,
      });
      // Also clean up branches matching the prefix
      const { stdout } = await execFileAsync(
        "git",
        ["branch", "--list", `${branchPrefix}*`],
        { cwd: this.cwd }
      );
      const branches = stdout
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);
      for (const branch of branches) {
        try {
          await execFileAsync("git", ["branch", "-D", branch], {
            cwd: this.cwd,
          });
        } catch {
          // Best effort cleanup
        }
      }
    } catch (error: unknown) {
      throw new Error(
        `git worktree prune failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async diffWorktree(worktreePath: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--name-only", "HEAD"],
        { cwd: worktreePath }
      );
      return stdout
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
    } catch (error: unknown) {
      throw new Error(
        `git diff failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

interface ExecError extends Error {
  code: number;
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && typeof (error as ExecError).code === "number";
}
