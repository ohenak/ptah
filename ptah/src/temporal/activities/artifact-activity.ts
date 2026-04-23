/**
 * Artifact Activity — checks whether a PDLC artifact file exists and is non-empty.
 *
 * @see PLAN-021 Tasks 3.2a/3.2b
 * @see PROP-SC-06, PROP-SC-06A
 */

import type { FileSystem } from "../../services/filesystem.js";
import type { CheckArtifactExistsInput } from "../types.js";

/**
 * Activities factory for artifact existence checking.
 * Uses injectable FileSystem for testability.
 */
export function createArtifactActivities(fs: FileSystem) {
  return {
    /**
     * Check whether a PDLC artifact file exists and contains non-whitespace content.
     *
     * Reads `${featurePath}${docType}-${slug}.md`, returns `content.trim().length > 0`.
     * Catches all read errors (ENOENT, permission denied, etc.) and returns `false`.
     */
    async checkArtifactExists(input: CheckArtifactExistsInput): Promise<boolean> {
      const { slug, docType, featurePath } = input;
      const filePath = `${featurePath}${docType}-${slug}.md`;
      try {
        const content = await fs.readFile(filePath);
        return content.trim().length > 0;
      } catch {
        return false;
      }
    },
  };
}
