/**
 * Promotion Activities — Temporal activity functions for lifecycle folder promotion.
 *
 * Two activities:
 *   - promoteBacklogToInProgress: moves a feature folder from docs/backlog/ to docs/in-progress/
 *   - promoteInProgressToCompleted: moves a feature from docs/in-progress/ to docs/completed/{NNN}-{slug}/,
 *     renames files with NNN prefix, and updates internal markdown references.
 *
 * Activities are plain async functions closed over injected dependencies (PromotionActivityDeps).
 * They are NOT classes — matching the existing pattern in skill-activity.ts.
 *
 * @see TSPEC §5.2 (Promotion Activities)
 * @see FSPEC-PR-01 (Lifecycle Promotion Flows)
 */

import { ApplicationFailure } from "@temporalio/common";
import type { WorktreeManager } from "./worktree-manager.js";
import type { GitClient } from "../services/git.js";
import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromotionInput {
  featureSlug: string;
  featureBranch: string;
  workflowId: string;
  runId: string;
}

export interface PromotionResult {
  featurePath: string;
  promoted: boolean;
}

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface PromotionActivityDeps {
  worktreeManager: WorktreeManager;
  gitClient: GitClient;
  fs: FileSystem;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Activity factory — returns activity functions closed over deps
// ---------------------------------------------------------------------------

export function createPromotionActivities(deps: PromotionActivityDeps) {
  const { worktreeManager, gitClient, fs, logger } = deps;

  // -------------------------------------------------------------------------
  // promoteBacklogToInProgress
  // -------------------------------------------------------------------------

  async function promoteBacklogToInProgress(
    input: PromotionInput,
  ): Promise<PromotionResult> {
    const { featureSlug, featureBranch, workflowId, runId } = input;
    const activityId = "promote-backlog-to-in-progress";

    const handle = await worktreeManager.create(
      featureBranch,
      workflowId,
      runId,
      activityId,
    );
    const wtPath = handle.path;

    try {
      const backlogPath = fs.joinPath(wtPath, "docs", "backlog", featureSlug);
      const backlogExists = await fs.exists(backlogPath);

      if (!backlogExists) {
        // Check if already in in-progress (idempotent skip)
        const inProgressPath = fs.joinPath(
          wtPath,
          "docs",
          "in-progress",
          featureSlug,
        );
        const inProgressExists = await fs.exists(inProgressPath);

        if (inProgressExists) {
          logger.info(
            `Idempotent skip: ${featureSlug} already in in-progress.`,
          );
          return {
            featurePath: `docs/in-progress/${featureSlug}/`,
            promoted: false,
          };
        }

        throw ApplicationFailure.nonRetryable(
          `Feature ${featureSlug} not found in backlog or in-progress.`,
        );
      }

      // Move from backlog to in-progress
      try {
        await gitClient.gitMvInWorktree(
          wtPath,
          `docs/backlog/${featureSlug}/`,
          `docs/in-progress/${featureSlug}/`,
        );
      } catch (err) {
        throw ApplicationFailure.nonRetryable(
          `git mv failed for ${featureSlug}: ${err instanceof Error ? err.message : String(err)}`,
          "GitMvError",
        );
      }

      // Commit
      await gitClient.commitInWorktree(
        wtPath,
        `chore(lifecycle): promote ${featureSlug} backlog → in-progress`,
      );

      // Push worktree branch to remote as the feature branch
      await gitClient.pushInWorktree(wtPath, "origin", `HEAD:refs/heads/${featureBranch}`);

      return {
        featurePath: `docs/in-progress/${featureSlug}/`,
        promoted: true,
      };
    } finally {
      await worktreeManager.destroy(wtPath);
    }
  }

  // -------------------------------------------------------------------------
  // promoteInProgressToCompleted
  // -------------------------------------------------------------------------

  async function promoteInProgressToCompleted(
    input: PromotionInput,
  ): Promise<PromotionResult> {
    const { featureSlug, featureBranch, workflowId, runId } = input;
    const activityId = "promote-in-progress-to-completed";

    const handle = await worktreeManager.create(
      featureBranch,
      workflowId,
      runId,
      activityId,
    );
    const wtPath = handle.path;

    try {
      // ─── Phase 1: NNN assignment and folder move ─────────────────────
      const completedDir = fs.joinPath(wtPath, "docs", "completed");
      let nnn: string;

      // Check if completed/ already contains a folder matching *-{slug}
      const completedEntries = await safeReadDir(completedDir);
      const existingMatch = completedEntries.find((entry) => {
        const match = entry.match(/^([0-9]{3})-(.+)$/);
        return match != null && match[2] === featureSlug;
      });

      if (existingMatch != null) {
        // Already in completed — record existing NNN, skip move
        nnn = existingMatch.slice(0, 3);
      } else {
        // Calculate NNN: max existing + 1, or "001" if empty
        const nnnFolders = completedEntries.filter((entry) =>
          /^[0-9]{3}-/.test(entry),
        );
        if (nnnFolders.length === 0) {
          nnn = "001";
        } else {
          const maxNNN = Math.max(
            ...nnnFolders.map((f) => parseInt(f.slice(0, 3), 10)),
          );
          nnn = String(maxNNN + 1).padStart(3, "0");
        }

        // git mv folder
        try {
          await gitClient.gitMvInWorktree(
            wtPath,
            `docs/in-progress/${featureSlug}/`,
            `docs/completed/${nnn}-${featureSlug}/`,
          );
        } catch (err) {
          throw ApplicationFailure.nonRetryable(
            `git mv failed for ${featureSlug}: ${err instanceof Error ? err.message : String(err)}`,
            "GitMvError",
          );
        }

        // Commit Phase 1
        await gitClient.commitInWorktree(
          wtPath,
          `chore(lifecycle): promote ${featureSlug} in-progress → completed (${nnn})`,
        );

      }

      const completedFeatureDir = `docs/completed/${nnn}-${featureSlug}/`;

      // ─── Phase 2: File rename ────────────────────────────────────────
      const files = await gitClient.listDirInWorktree(
        wtPath,
        completedFeatureDir,
      );

      const nnnPrefix = `${nnn}-`;
      const renameMap = new Map<string, string>();
      let anyRenamed = false;

      for (const file of files) {
        if (!file.startsWith(nnnPrefix)) {
          const newName = `${nnnPrefix}${file}`;
          renameMap.set(file, newName);

          try {
            await gitClient.gitMvInWorktree(
              wtPath,
              `${completedFeatureDir}${file}`,
              `${completedFeatureDir}${newName}`,
            );
          } catch (err) {
            throw ApplicationFailure.nonRetryable(
              `git mv failed renaming ${file} to ${newName}: ${err instanceof Error ? err.message : String(err)}`,
              "GitMvError",
            );
          }
          anyRenamed = true;
        }
      }

      if (anyRenamed) {
        await gitClient.commitInWorktree(
          wtPath,
          `chore(lifecycle): rename docs in ${nnn}-${featureSlug} with NNN prefix`,
        );
      }

      // ─── Phase 3: Internal reference update ──────────────────────────
      if (renameMap.size > 0) {
        let anyModified = false;

        // Build the current filename list: renamed files get new name,
        // already-prefixed files keep their name
        const currentFiles = files.map((f) => renameMap.get(f) ?? f);

        for (const currentFile of currentFiles) {
          const filePath = fs.joinPath(
            wtPath,
            completedFeatureDir,
            currentFile,
          );

          try {
            let content = await fs.readFile(filePath);
            let modified = false;

            for (const [oldFilename, newFilename] of renameMap) {
              const escaped = oldFilename.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
              );
              const pattern = new RegExp(
                `(\\[[^\\]]*\\]\\()(\\.\\/)?(${escaped})(\\))`,
                "g",
              );

              const updated = content.replace(
                pattern,
                (_match, prefix, dotSlash, _oldName, suffix) => {
                  return `${prefix}${dotSlash ?? ""}${newFilename}${suffix}`;
                },
              );

              if (updated !== content) {
                content = updated;
                modified = true;
              }
            }

            if (modified) {
              await fs.writeFile(filePath, content);
              anyModified = true;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn(
              `Failed to update internal references in ${currentFile}: ${message}`,
            );
          }
        }

        if (anyModified) {
          // git add + commit
          await gitClient.addInWorktree(wtPath, ["."]);
          await gitClient.commitInWorktree(
            wtPath,
            `chore(lifecycle): update internal refs in ${nnn}-${featureSlug}`,
          );
        }
      }

      // Push worktree branch to remote as the feature branch
      await gitClient.pushInWorktree(wtPath, "origin", `HEAD:refs/heads/${featureBranch}`);

      return {
        featurePath: completedFeatureDir,
        promoted: true,
      };
    } finally {
      await worktreeManager.destroy(wtPath);
    }
  }

  /**
   * Safely read directory entries. Returns empty array if dir doesn't exist.
   */
  async function safeReadDir(dirPath: string): Promise<string[]> {
    try {
      return await fs.readDir(dirPath);
    } catch {
      return [];
    }
  }

  return {
    promoteBacklogToInProgress,
    promoteInProgressToCompleted,
  };
}
