import type { CommitParams, CommitResult, MergeBranchParams, BranchMergeResult } from "../types.js";
import type { GitClient } from "../services/git.js";
import type { MergeLock } from "./merge-lock.js";
import { MergeLockTimeoutError } from "./merge-lock.js";
import type { Logger } from "../services/logger.js";

export interface ArtifactCommitter {
  commitAndMerge(params: CommitParams): Promise<CommitResult>;
  mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult>;
}

/** Merge lock timeout for commitAndMerge (existing) */
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

/** Merge lock timeout for mergeBranchIntoFeature — 30 seconds is sufficient for
 *  serializing sequential merge operations within a single batch. */
const MERGE_BRANCH_LOCK_TIMEOUT_MS = 30_000;

export function formatAgentName(agentId: string): string {
  return agentId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractDescription(threadName: string): string {
  const emDashIndex = threadName.indexOf(" \u2014 ");
  if (emDashIndex === -1) {
    return threadName;
  }
  return threadName.slice(emDashIndex + 3);
}

function filterDocsChanges(
  artifactChanges: string[],
  logger: Logger,
): string[] {
  const docsChanges: string[] = [];
  const nonDocsChanges: string[] = [];

  for (const path of artifactChanges) {
    if (path.startsWith("docs/")) {
      docsChanges.push(path);
    } else {
      nonDocsChanges.push(path);
    }
  }

  if (nonDocsChanges.length > 0) {
    logger.warn(
      `Filtered non-docs changes: ${nonDocsChanges.join(", ")}`,
    );
  }

  return docsChanges;
}

export class DefaultArtifactCommitter implements ArtifactCommitter {
  private readonly gitClient: GitClient;
  private readonly mergeLock: MergeLock;
  private readonly logger: Logger;

  constructor(gitClient: GitClient, mergeLock: MergeLock, logger: Logger) {
    this.gitClient = gitClient;
    this.mergeLock = mergeLock;
    this.logger = logger.forComponent('artifact-committer');
  }

  async commitAndMerge(params: CommitParams): Promise<CommitResult> {
    const { worktreePath, branch, artifactChanges, agentId, threadName } =
      params;

    // 1. VALIDATE — return no-changes if empty
    if (artifactChanges.length === 0) {
      this.logger.info(`artifact commit: no changes for ${agentId}`);
      return { commitSha: null, mergeStatus: "no-changes", branch };
    }

    // 2. DERIVE AGENT NAME
    const agentDisplayName = formatAgentName(agentId);

    // 3. FILTER to docs/ only
    const docsChanges = filterDocsChanges(artifactChanges, this.logger);
    if (docsChanges.length === 0) {
      this.logger.info(`artifact commit: no changes for ${agentId}`);
      return { commitSha: null, mergeStatus: "no-changes", branch };
    }

    // 4. STAGE
    try {
      await this.gitClient.addInWorktree(worktreePath, docsChanges);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      await this.cleanupWorktree(worktreePath, branch);
      return {
        commitSha: null,
        mergeStatus: "commit-error",
        branch,
        conflictMessage: message,
      };
    }

    // 5. COMMIT IN WORKTREE
    const description = extractDescription(threadName);
    const commitMessage = `[ptah] ${agentDisplayName}: ${description}`;
    let commitSha: string;

    try {
      commitSha = await this.gitClient.commitInWorktree(
        worktreePath,
        commitMessage,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      await this.cleanupWorktree(worktreePath, branch);
      return {
        commitSha: null,
        mergeStatus: "commit-error",
        branch,
        conflictMessage: message,
      };
    }

    // 6. ACQUIRE MERGE LOCK
    let release: (() => void) | undefined;
    try {
      release = await this.mergeLock.acquire(DEFAULT_LOCK_TIMEOUT_MS);
    } catch (error: unknown) {
      if (error instanceof MergeLockTimeoutError) {
        return {
          commitSha,
          mergeStatus: "lock-timeout",
          branch,
        };
      }
      throw error;
    }

    // 7. MERGE TO MAIN (inside try/finally for lock release)
    try {
      const mergeResult = await this.gitClient.merge(branch);

      if (mergeResult === "merged") {
        const shortSha = await this.gitClient.getShortSha(commitSha);
        await this.cleanupWorktree(worktreePath, branch);
        this.logger.info(
          `artifact commit complete: ${agentId} → ${shortSha} (branch: ${branch})`,
        );
        return {
          commitSha: shortSha,
          mergeStatus: "merged",
          branch,
        };
      }

      if (mergeResult === "conflict") {
        return {
          commitSha,
          mergeStatus: "conflict",
          branch,
          conflictMessage: `Merge conflict on branch ${branch}`,
        };
      }

      // merge-error
      return {
        commitSha,
        mergeStatus: "merge-error",
        branch,
        conflictMessage: `Merge error on branch ${branch}`,
      };
    } finally {
      release();
    }
  }

  async mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult> {
    const { sourceBranch, featureBranch, featureBranchWorktreePath, agentId } = params;
    this.logger.info(`[merge] Merging ${sourceBranch} → ${featureBranch} (agent: ${agentId})`);

    // 1. Acquire merge lock to serialize concurrent merge operations
    let releaseLock: (() => void) | null = null;
    try {
      releaseLock = await this.mergeLock.acquire(MERGE_BRANCH_LOCK_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof MergeLockTimeoutError) {
        return {
          status: "merge-error",
          commitSha: null,
          conflictingFiles: [],
          errorMessage: "Merge lock timeout — another merge is in progress",
        };
      }
      throw err;
    }

    try {
      // 2. Attempt merge
      const mergeResult = await this.gitClient.mergeInWorktree(
        featureBranchWorktreePath,
        sourceBranch,
      );

      if (mergeResult === "merged") {
        const sha = await this.gitClient.getShortSha("HEAD");
        return { status: "merged", commitSha: sha, conflictingFiles: [], errorMessage: null };
      }

      if (mergeResult === "already-up-to-date") {
        return { status: "already-up-to-date", commitSha: null, conflictingFiles: [], errorMessage: null };
      }

      if (mergeResult === "conflict") {
        // 3. Get conflicting files, then abort
        const conflictFiles = await this.gitClient.getConflictedFiles(featureBranchWorktreePath);
        await this.gitClient.abortMergeInWorktree(featureBranchWorktreePath);
        return { status: "conflict", commitSha: null, conflictingFiles: conflictFiles, errorMessage: null };
      }

      return {
        status: "merge-error",
        commitSha: null,
        conflictingFiles: [],
        errorMessage: `Unexpected merge result: ${mergeResult}`,
      };
    } catch (err) {
      return {
        status: "merge-error",
        commitSha: null,
        conflictingFiles: [],
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      releaseLock?.();
    }
  }

  private async cleanupWorktree(
    worktreePath: string,
    branch: string,
  ): Promise<void> {
    try {
      await this.gitClient.removeWorktree(worktreePath);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to remove worktree at ${worktreePath}: ${message}`,
      );
    }

    try {
      await this.gitClient.deleteBranch(branch);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to delete branch ${branch}: ${message}`,
      );
    }
  }
}
