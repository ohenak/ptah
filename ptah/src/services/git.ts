import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitClient {
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
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
}

interface ExecError extends Error {
  code: number;
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && typeof (error as ExecError).code === "number";
}
