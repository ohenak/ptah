import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WorktreeInfo } from "../types.js";

const execFileAsync = promisify(execFile);

export interface GitClient {
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  createWorktree(path: string, branch: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listWorktrees(): Promise<WorktreeInfo[]>;
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

  // Task 125: createWorktree()
  async createWorktree(path: string, branch: string): Promise<void> {
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

  // Task 126: removeWorktree()
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

  // Task 127: deleteBranch()
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

  // Task 128: listWorktrees()
  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["worktree", "list", "--porcelain"],
        { cwd: this.cwd },
      );

      const worktrees: WorktreeInfo[] = [];
      const blocks = stdout.split("\n\n").filter((b) => b.trim().length > 0);

      for (const block of blocks) {
        const lines = block.split("\n");
        let path = "";
        let branch = "";

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            path = line.slice("worktree ".length);
          } else if (line.startsWith("branch ")) {
            // branch refs/heads/branch-name -> branch-name
            const ref = line.slice("branch ".length);
            branch = ref.replace("refs/heads/", "");
          }
        }

        if (path && branch) {
          worktrees.push({ path, branch });
        }
      }

      return worktrees;
    } catch (error: unknown) {
      throw new Error(
        `git worktree list failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Task 129: pruneWorktrees()
  async pruneWorktrees(branchPrefix: string): Promise<void> {
    const worktrees = await this.listWorktrees();
    for (const wt of worktrees) {
      if (wt.branch.startsWith(branchPrefix)) {
        await this.removeWorktree(wt.path);
        await this.deleteBranch(wt.branch);
      }
    }
  }

  // Task 130: diffWorktree()
  async diffWorktree(worktreePath: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--name-only", "HEAD"],
        { cwd: worktreePath },
      );

      return stdout.trim().split("\n").filter((line) => line.length > 0);
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
