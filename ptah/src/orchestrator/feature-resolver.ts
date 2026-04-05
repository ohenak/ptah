/**
 * Feature Resolver — resolves a feature slug to its lifecycle folder path.
 *
 * Search order: in-progress -> backlog -> completed.
 * For completed/, strips NNN- prefix when matching slugs.
 */

import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";

export type FeatureResolverResult =
  | {
      found: true;
      /** Relative path from worktree root, e.g. "docs/in-progress/my-feature/" */
      path: string;
      /** Which lifecycle folder */
      lifecycle: "backlog" | "in-progress" | "completed";
    }
  | {
      found: false;
      slug: string;
    };

export interface FeatureResolver {
  /**
   * Resolve a feature slug to its folder path within a worktree.
   *
   * Search order: in-progress -> backlog -> completed.
   * For completed/, strips NNN- prefix when matching slugs.
   * Returns path relative to worktreeRoot.
   * Returns { found: false } if not found — never throws.
   */
  resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult>;
}

interface Match {
  path: string;
  lifecycle: "backlog" | "in-progress" | "completed";
}

const COMPLETED_PREFIX_PATTERN = /^[0-9]{3}-/;

export class DefaultFeatureResolver implements FeatureResolver {
  constructor(
    private fs: FileSystem,
    private logger: Logger,
  ) {}

  async resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult> {
    try {
      // 1. Normalize worktreeRoot: strip trailing slash
      const normalizedRoot = worktreeRoot.replace(/\/+$/, "");

      // 2. searchRoot = path.join(worktreeRoot, "docs")
      const searchRoot = this.fs.joinPath(normalizedRoot, "docs");

      const matches: Match[] = [];

      // 3. Search in-progress
      try {
        const inProgressCandidate = this.fs.joinPath(searchRoot, "in-progress", slug);
        if (await this.fs.exists(inProgressCandidate)) {
          matches.push({
            path: `docs/in-progress/${slug}/`,
            lifecycle: "in-progress",
          });
        }
      } catch (err) {
        this.logger.warn(
          `Error checking in-progress folder for slug "${slug}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4. Search backlog
      try {
        const backlogCandidate = this.fs.joinPath(searchRoot, "backlog", slug);
        if (await this.fs.exists(backlogCandidate)) {
          matches.push({
            path: `docs/backlog/${slug}/`,
            lifecycle: "backlog",
          });
        }
      } catch (err) {
        this.logger.warn(
          `Error checking backlog folder for slug "${slug}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 5. Search completed
      try {
        const completedDir = this.fs.joinPath(searchRoot, "completed");
        const entries = await this.fs.readDir(completedDir);
        for (const entry of entries) {
          if (COMPLETED_PREFIX_PATTERN.test(entry)) {
            const entrySuffix = entry.replace(COMPLETED_PREFIX_PATTERN, "");
            if (entrySuffix === slug) {
              matches.push({
                path: `docs/completed/${entry}/`,
                lifecycle: "completed",
              });
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `Error reading completed folder for slug "${slug}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 6. Collect all matches
      if (matches.length > 1) {
        const locations = matches.map((m) => m.lifecycle).join(", ");
        this.logger.warn(
          `Slug "${slug}" found in multiple lifecycle folders: ${locations}. Returning first match per search order.`,
        );
      }

      // 7. Return first match or not-found
      if (matches.length >= 1) {
        return { found: true, path: matches[0].path, lifecycle: matches[0].lifecycle };
      }

      return { found: false, slug };
    } catch (err) {
      // Never throw from resolve()
      this.logger.warn(
        `Unexpected error resolving slug "${slug}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return { found: false, slug };
    }
  }
}
