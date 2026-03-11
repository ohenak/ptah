import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import type { MergeResult, WorktreeInfo } from "../types.js";

export interface GitClient {
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;

  // --- Phase 3 ---
  createWorktree(branch: string, path: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listWorktrees(): Promise<WorktreeInfo[]>;
  pruneWorktrees(branchPrefix: string): Promise<void>;
  diffWorktree(worktreePath: string): Promise<string[]>;

  // --- Phase 4 ---
  addInWorktree(worktreePath: string, files: string[]): Promise<void>;
  commitInWorktree(worktreePath: string, message: string): Promise<string>;
  merge(branch: string): Promise<MergeResult>;
  abortMerge(): Promise<void>;
  getShortSha(sha: string): Promise<string>;
  hasUnmergedCommits(branch: string): Promise<boolean>;
  diffWorktreeIncludingUntracked(worktreePath: string): Promise<string[]>;
  branchExists(branch: string): Promise<boolean>;
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

  // --- Phase 3 worktree operations (implementations in service track) ---

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

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["worktree", "list", "--porcelain"],
        { cwd: this.cwd },
      );
      const worktrees: WorktreeInfo[] = [];
      let currentPath = "";
      for (const line of stdout.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          worktrees.push({
            path: currentPath,
            branch: line.slice("branch refs/heads/".length),
          });
        }
      }
      return worktrees;
    } catch (error: unknown) {
      throw new Error(
        `git worktree list failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async pruneWorktrees(branchPrefix: string): Promise<void> {
    const worktrees = await this.listWorktrees();
    for (const wt of worktrees) {
      if (wt.branch.startsWith(branchPrefix)) {
        await this.removeWorktree(wt.path);
        await this.deleteBranch(wt.branch);
      }
    }
  }

  async diffWorktree(worktreePath: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--name-only", "HEAD"],
        { cwd: worktreePath },
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch (error: unknown) {
      throw new Error(
        `git diff failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // --- Phase 4 operations ---

  async addInWorktree(worktreePath: string, files: string[]): Promise<void> {
    try {
      await execFileAsync("git", ["add", ...files], { cwd: worktreePath });
    } catch (error: unknown) {
      throw new Error(
        `git add in worktree failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async commitInWorktree(worktreePath: string, message: string): Promise<string> {
    try {
      await execFileAsync("git", ["commit", "-m", message], { cwd: worktreePath });
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
      return stdout.trim();
    } catch (error: unknown) {
      throw new Error(
        `git commit in worktree failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async merge(branch: string): Promise<MergeResult> {
    try {
      await execFileAsync("git", ["merge", branch], { cwd: this.cwd });
      return "merged";
    } catch (error: unknown) {
      if (isExecError(error) && error.code === 1) {
        await this.abortMerge();
        return "conflict";
      }
      return "merge-error";
    }
  }

  async abortMerge(): Promise<void> {
    try {
      await execFileAsync("git", ["merge", "--abort"], { cwd: this.cwd });
    } catch (error: unknown) {
      throw new Error(
        `git merge --abort failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getShortSha(sha: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--short", sha], { cwd: this.cwd });
      return stdout.trim();
    } catch (error: unknown) {
      throw new Error(
        `git rev-parse --short failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async hasUnmergedCommits(branch: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", ["log", `HEAD..${branch}`, "--oneline"], { cwd: this.cwd });
      return stdout.trim().length > 0;
    } catch (error: unknown) {
      throw new Error(
        `git log failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async diffWorktreeIncludingUntracked(worktreePath: string): Promise<string[]> {
    try {
      // Get tracked changes
      const { stdout: tracked } = await execFileAsync(
        "git",
        ["diff", "--name-only", "HEAD"],
        { cwd: worktreePath },
      );
      // Get untracked files
      const { stdout: untracked } = await execFileAsync(
        "git",
        ["ls-files", "--others", "--exclude-standard"],
        { cwd: worktreePath },
      );
      const all = [
        ...tracked.trim().split("\n").filter(Boolean),
        ...untracked.trim().split("\n").filter(Boolean),
      ];
      return [...new Set(all)];
    } catch (error: unknown) {
      throw new Error(
        `git diff including untracked failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async branchExists(branch: string): Promise<boolean> {
    try {
      await execFileAsync("git", ["rev-parse", "--verify", `refs/heads/${branch}`], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }
}

interface ExecError extends Error {
  code: number;
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && typeof (error as ExecError).code === "number";
}
