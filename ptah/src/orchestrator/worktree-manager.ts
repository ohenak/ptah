/**
 * Worktree Manager — creates and destroys git worktrees for skill invocations
 * and promotion activities.
 */

import { randomUUID } from "node:crypto";
import type { GitClient } from "../services/git.js";
import type { WorktreeRegistry } from "./worktree-registry.js";
import type { Logger } from "../services/logger.js";

export interface WorktreeHandle {
  /** Absolute path to the worktree root */
  path: string;
  /** The branch checked out in this worktree */
  branch: string;
}

export interface WorktreeManager {
  /**
   * Create a new worktree for a skill invocation or promotion activity.
   * Generates a UUID-based path under /tmp/ptah-wt-{uuid}/.
   * Registers the worktree in the in-memory registry.
   */
  create(
    featureBranch: string,
    workflowId: string,
    runId: string,
    activityId: string,
  ): Promise<WorktreeHandle>;

  /**
   * Destroy a worktree. Runs `git worktree remove --force`.
   * Deregisters from the in-memory registry.
   * Must not throw on cleanup failure (logs instead).
   */
  destroy(worktreePath: string): Promise<void>;

  /**
   * Crash-recovery sweep on orchestrator startup.
   * Prunes dangling worktrees not matching active Temporal executions.
   */
  cleanupDangling(activeExecutions: Set<string>): Promise<void>;
}

const PTAH_WORKTREE_PREFIX = "/tmp/ptah-wt-";
const MAX_CREATE_ATTEMPTS = 2;

export class DefaultWorktreeManager implements WorktreeManager {
  constructor(
    private gitClient: GitClient,
    private registry: WorktreeRegistry,
    private logger: Logger,
  ) {}

  async create(
    featureBranch: string,
    workflowId: string,
    runId: string,
    activityId: string,
  ): Promise<WorktreeHandle> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const uuid = randomUUID();
      const worktreePath = `${PTAH_WORKTREE_PREFIX}${uuid}/`;

      try {
        await this.gitClient.createWorktree(featureBranch, worktreePath);

        this.registry.register({
          worktreePath,
          branch: featureBranch,
          workflowId,
          runId,
          activityId,
          createdAt: new Date().toISOString(),
        });

        return { path: worktreePath, branch: featureBranch };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Worktree creation attempt ${attempt + 1} failed for ${worktreePath}: ${lastError.message}`,
        );
      }
    }

    throw new Error(
      `Failed to create worktree after ${MAX_CREATE_ATTEMPTS} attempts: ${lastError?.message}`,
    );
  }

  async destroy(worktreePath: string): Promise<void> {
    try {
      await this.gitClient.removeWorktree(worktreePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[ptah:worktree] Failed to remove worktree ${worktreePath}: ${message}`,
      );
    }

    this.registry.deregister(worktreePath);
  }

  async cleanupDangling(activeExecutions: Set<string>): Promise<void> {
    const worktrees = await this.gitClient.listWorktrees();

    // Skip the first entry (main working tree)
    const nonMainWorktrees = worktrees.slice(1);

    for (const wt of nonMainWorktrees) {
      // Skip non-ptah worktrees
      if (!wt.path.startsWith(PTAH_WORKTREE_PREFIX)) {
        continue;
      }

      // Check if this worktree is associated with an active execution
      const registryEntry = this.registry.getAll().find(
        (entry) => entry.worktreePath === wt.path,
      );

      const isActive =
        registryEntry != null &&
        activeExecutions.has(`${registryEntry.workflowId}:${registryEntry.runId}`);

      if (!isActive) {
        try {
          await this.gitClient.removeWorktree(wt.path);
          this.logger.info(
            `[ptah:startup] Pruned dangling worktree: ${wt.path}`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[ptah:startup] Failed to prune worktree ${wt.path}: ${message}`,
          );
        }
      }
    }

    // Run git worktree prune to clean up stale admin files
    await this.gitClient.pruneWorktrees("");
  }
}
