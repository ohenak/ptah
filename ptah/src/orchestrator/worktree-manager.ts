/**
 * Worktree Manager — creates and destroys git worktrees for skill invocations
 * and promotion activities.
 */

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
