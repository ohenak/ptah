/**
 * Temporal Activity for reading cross-review recommendations from disk.
 *
 * Reads the CROSS-REVIEW markdown file written by a reviewer agent,
 * parses the recommendation using the existing cross-review-parser module,
 * and returns a structured result for the workflow to act on.
 *
 * @see TSPEC Section 5.3 (REQ-RC-02)
 */

import type { FileSystem } from "../../services/filesystem.js";
import type { Logger } from "../../services/logger.js";
import type { ReadCrossReviewInput, CrossReviewResult } from "../types.js";
import {
  agentIdToSkillName,
  crossReviewPath,
  extractRecommendationValue,
  parseRecommendation,
} from "../../orchestrator/pdlc/cross-review-parser.js";

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface CrossReviewActivityDeps {
  fs: FileSystem;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Activity factory
// ---------------------------------------------------------------------------

export function createCrossReviewActivities(deps: CrossReviewActivityDeps) {
  const { fs, logger } = deps;

  async function readCrossReviewRecommendation(
    input: ReadCrossReviewInput,
  ): Promise<CrossReviewResult> {
    const { featurePath, agentId, documentType, revisionCount } = input;

    // Step 1: Map agentId to skillName (reviewer token)
    const skillName = agentIdToSkillName(agentId);
    if (skillName === null) {
      return {
        status: "parse_error",
        reason: `Unknown agent ID: ${agentId}`,
      };
    }

    // Step 2: Construct file path (with optional revision versioning)
    const filePath = crossReviewPath(featurePath, skillName, documentType, revisionCount);

    // Step 3: Read file
    let content: string;
    try {
      content = await fs.readFile(filePath);
    } catch {
      logger.warn(`Cross-review file not found: ${filePath}`);
      return {
        status: "parse_error",
        reason: "Cross-review file not found",
      };
    }

    // Step 4: Extract recommendation value from file content (two-step pattern)
    const rawValue = extractRecommendationValue(content);
    if (rawValue === null) {
      return { status: "parse_error", reason: "No Recommendation heading found" };
    }

    // Step 5: Parse extracted value
    const parsed = parseRecommendation(rawValue);
    if (parsed.status === "parse_error") {
      return parsed;
    }

    return { status: parsed.status };
  }

  return { readCrossReviewRecommendation };
}
