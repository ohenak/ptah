/**
 * Feature Resolver — resolves a feature slug to its lifecycle folder path.
 *
 * Search order: in-progress -> backlog -> completed.
 * For completed/, strips NNN- prefix when matching slugs.
 */

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
