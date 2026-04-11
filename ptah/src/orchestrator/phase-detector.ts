import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";

/**
 * Result of a phase detection scan for a feature slug.
 */
export interface PhaseDetectionResult {
  /**
   * Phase to pass as startAtPhase to startFeatureWorkflow.
   * "req-review" when a REQ file was found; "req-creation" otherwise.
   */
  startAtPhase: "req-review" | "req-creation";

  /**
   * Which lifecycle folder was selected as the resolved folder
   * per the REQ-PD-03 decision table.
   */
  resolvedLifecycle: "in-progress" | "backlog";

  /**
   * True if a REQ file exists in any checked active lifecycle folder.
   */
  reqPresent: boolean;

  /**
   * True if an overview file exists in any checked active lifecycle folder.
   */
  overviewPresent: boolean;
}

export interface PhaseDetector {
  /**
   * Detect the appropriate starting phase for a new feature workflow.
   *
   * Checks the following paths via FileSystem.exists() (in-progress first):
   *   docs/in-progress/<slug>/REQ-<slug>.md
   *   docs/backlog/<slug>/REQ-<slug>.md
   *   docs/in-progress/<slug>/overview.md
   *   docs/backlog/<slug>/overview.md
   *
   * Applies the REQ-PD-03 decision table to determine the resolved lifecycle
   * folder and the start phase. Logs a structured warning for each
   * inconsistent-state case (A, B, C, H). Logs a structured info entry
   * containing slug, lifecycle, reqPresent, overviewPresent, startAtPhase.
   *
   * Does NOT catch errors thrown by FileSystem.exists(). If exists() throws
   * (e.g. permission denied), the error propagates to the caller.
   *
   * Is purely read-only: never creates, writes, renames, or deletes files.
   *
   * Completed lifecycle folders (docs/completed/) are not checked.
   *
   * @throws propagates any error thrown by FileSystem.exists()
   */
  detect(slug: string): Promise<PhaseDetectionResult>;
}
