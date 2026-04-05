/**
 * Migration command — reorganize docs/ into lifecycle folders.
 *
 * One-time migration from the flat docs/{slug}/ structure to:
 *   docs/backlog/, docs/in-progress/, docs/completed/
 *
 * Algorithm:
 *  1. PRE-FLIGHT checks
 *  2. Create lifecycle directories with .gitkeep
 *  3. Move NNN-prefixed folders → docs/completed/
 *  4. Move remaining feature folders → docs/in-progress/
 *  5. Commit
 *  6. Return summary
 */

import type { GitClient } from "../services/git.js";
import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrateLifecycleResult {
  completedMoved: number;
  inProgressMoved: number;
  committed: boolean;
}

// ---------------------------------------------------------------------------
// Constant sets
// ---------------------------------------------------------------------------

/** System directories in docs/ that must never be migrated. */
const SYSTEM_DIRS = new Set([
  "requirements",
  "templates",
  "open-questions",
  "backlog",
  "in-progress",
  "completed",
]);

const LIFECYCLE_DIRS = ["backlog", "in-progress", "completed"] as const;
const COMPLETED_NNN_PATTERN = /^[0-9]{3}-/;
const COMMIT_MESSAGE =
  "chore(migration): reorganize docs/ into lifecycle folders\n\n(backlog/in-progress/completed)";

// ---------------------------------------------------------------------------
// MigrateLifecycleCommand
// ---------------------------------------------------------------------------

export class MigrateLifecycleCommand {
  constructor(
    private gitClient: GitClient,
    private fs: FileSystem,
    private logger: Logger,
  ) {}

  async execute(): Promise<MigrateLifecycleResult> {
    // -----------------------------------------------------------------------
    // Step 1: Pre-flight
    // -----------------------------------------------------------------------

    // 1a. docs/ must exist
    const docsExists = await this.fs.exists("docs");
    if (!docsExists) {
      throw new Error("Pre-flight failed: docs/ directory does not exist");
    }

    // 1b. Working tree must be clean
    const dirty = await this.gitClient.hasUncommittedChanges(this.fs.cwd());
    if (dirty) {
      throw new Error(
        "Pre-flight failed: working tree is not clean — commit or stash changes first",
      );
    }

    // 1c. Lifecycle folders must be empty (or not yet created)
    for (const lcDir of LIFECYCLE_DIRS) {
      const lcPath = this.fs.joinPath("docs", lcDir);
      const lcExists = await this.fs.exists(lcPath);
      if (lcExists) {
        const entries = await this.fs.listDirs(lcPath);
        // Also check for non-gitkeep files
        const allEntries = await this.fs.readDirMatching(lcPath, /.*/);
        const nonKeep = allEntries.filter((e) => e !== ".gitkeep");
        if (nonKeep.length > 0 || entries.length > 0) {
          throw new Error(
            `Pre-flight failed: docs/${lcDir}/ already contains files — migration already run?`,
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Create lifecycle directories
    // -----------------------------------------------------------------------
    for (const lcDir of LIFECYCLE_DIRS) {
      const lcPath = this.fs.joinPath("docs", lcDir);
      await this.fs.mkdir(lcPath);
      await this.fs.writeFile(this.fs.joinPath(lcPath, ".gitkeep"), "");
      this.logger.info(`Created docs/${lcDir}/.gitkeep`);
    }

    // -----------------------------------------------------------------------
    // Step 3: Migrate completed features (NNN-prefixed folders)
    // -----------------------------------------------------------------------
    const allDirs = await this.fs.listDirs("docs");
    const completedCandidates = allDirs.filter((d) => COMPLETED_NNN_PATTERN.test(d));

    for (const dir of completedCandidates) {
      const src = this.fs.joinPath("docs", dir);
      const dest = this.fs.joinPath("docs", "completed", dir);
      await this.gitClient.gitMvInWorktree(this.fs.cwd(), src, dest);
      this.logger.info(`Moved ${src} → ${dest}`);
    }

    // -----------------------------------------------------------------------
    // Step 4: Migrate in-progress features (remaining directories)
    // -----------------------------------------------------------------------
    // Re-scan docs/ — NNN-prefixed folders have been moved, and system dirs
    // and lifecycle dirs are excluded.
    const remainingDirs = await this.fs.listDirs("docs");
    const inProgressCandidates = remainingDirs.filter(
      (d) => !SYSTEM_DIRS.has(d) && !COMPLETED_NNN_PATTERN.test(d),
    );

    for (const dir of inProgressCandidates) {
      const src = this.fs.joinPath("docs", dir);
      const dest = this.fs.joinPath("docs", "in-progress", dir);
      await this.gitClient.gitMvInWorktree(this.fs.cwd(), src, dest);
      this.logger.info(`Moved ${src} → ${dest}`);
    }

    // -----------------------------------------------------------------------
    // Step 5: Commit
    // -----------------------------------------------------------------------
    await this.gitClient.add(["docs"]);
    await this.gitClient.commit(COMMIT_MESSAGE);
    this.logger.info("Committed migration");

    return {
      completedMoved: completedCandidates.length,
      inProgressMoved: inProgressCandidates.length,
      committed: true,
    };
  }
}
