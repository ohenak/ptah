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

export class DefaultPhaseDetector implements PhaseDetector {
  constructor(
    private readonly fs: FileSystem,
    private readonly logger: Logger,
  ) {}

  async detect(slug: string): Promise<PhaseDetectionResult> {
    const inProgressReqPath = `docs/in-progress/${slug}/REQ-${slug}.md`;
    const backlogReqPath = `docs/backlog/${slug}/REQ-${slug}.md`;
    const inProgressOverviewPath = `docs/in-progress/${slug}/overview.md`;
    const backlogOverviewPath = `docs/backlog/${slug}/overview.md`;

    // NOTE: errors propagate — not caught here (caller handles REQ-ER-03)
    const inProgressReq = await this.fs.exists(inProgressReqPath);
    const backlogReq = await this.fs.exists(backlogReqPath);
    const inProgressOverview = await this.fs.exists(inProgressOverviewPath);
    const backlogOverview = await this.fs.exists(backlogOverviewPath);

    const ipPath = `docs/in-progress/${slug}/`;
    const blPath = `docs/backlog/${slug}/`;

    // REQ-PD-03 warning conditions (Cases A, B, C, H)
    if (inProgressReq && backlogReq) {
      // Case C: REQ present in both folders
      this.logger.warn(
        `Phase detection: slug=${slug} REQ found in both ${ipPath} and ${blPath}; resolving to in-progress`,
      );
    } else if (inProgressReq && !backlogReq && backlogOverview) {
      // Case A: REQ in in-progress but overview also exists in backlog
      this.logger.warn(
        `Phase detection: slug=${slug} inconsistent state — REQ in ${ipPath} but overview also in ${blPath}`,
      );
    } else if (!inProgressReq && backlogReq && inProgressOverview) {
      // Case B: REQ in backlog but overview in in-progress
      this.logger.warn(
        `Phase detection: slug=${slug} inconsistent state — overview in ${ipPath} but REQ in ${blPath}`,
      );
    } else if (!inProgressReq && !backlogReq && inProgressOverview && backlogOverview) {
      // Case H: overview in both folders, no REQ
      this.logger.warn(
        `Phase detection: slug=${slug} overview found in both ${ipPath} and ${blPath}; resolving to in-progress`,
      );
    }

    // General resolution rule (REQ-PD-03)
    let resolvedLifecycle: "in-progress" | "backlog";
    let startAtPhase: "req-review" | "req-creation";

    if (inProgressReq) {
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-review";
    } else if (backlogReq) {
      resolvedLifecycle = "backlog";
      startAtPhase = "req-review";
    } else if (inProgressOverview) {
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-creation";
    } else if (backlogOverview) {
      resolvedLifecycle = "backlog";
      startAtPhase = "req-creation";
    } else {
      // Nothing found in any active folder (PM Phase 0 handles folder creation)
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-creation";
    }

    const reqPresent = inProgressReq || backlogReq;
    const overviewPresent = inProgressOverview || backlogOverview;

    // REQ-ER-02: structured log entry
    this.logger.info(
      `Phase detection: slug=${slug} lifecycle=${resolvedLifecycle} reqPresent=${reqPresent} overviewPresent=${overviewPresent} startAtPhase=${startAtPhase}`,
    );

    return { startAtPhase, resolvedLifecycle, reqPresent, overviewPresent };
  }
}
