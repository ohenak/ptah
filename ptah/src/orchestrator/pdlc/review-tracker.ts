import {
  PdlcPhase,
  type Discipline,
  type ReviewerManifestEntry,
  type ReviewPhaseState,
} from "./phases.js";

// --- Review phase set ---

const REVIEW_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_REVIEW,
  PdlcPhase.FSPEC_REVIEW,
  PdlcPhase.TSPEC_REVIEW,
  PdlcPhase.PLAN_REVIEW,
  PdlcPhase.PROPERTIES_REVIEW,
  PdlcPhase.IMPLEMENTATION_REVIEW,
]);

// --- Reviewer computation table (FSPEC-FC-01) ---

type ManifestTable = Record<string, Record<Discipline, ReviewerManifestEntry[]>>;

const REVIEWER_TABLE: ManifestTable = {
  [PdlcPhase.REQ_REVIEW]: {
    "backend-only": [{ agentId: "eng" }, { agentId: "qa" }],
    "frontend-only": [{ agentId: "fe" }, { agentId: "qa" }],
    fullstack: [{ agentId: "eng" }, { agentId: "fe" }, { agentId: "qa" }],
  },
  [PdlcPhase.FSPEC_REVIEW]: {
    "backend-only": [{ agentId: "eng" }, { agentId: "qa" }],
    "frontend-only": [{ agentId: "fe" }, { agentId: "qa" }],
    fullstack: [{ agentId: "eng" }, { agentId: "fe" }, { agentId: "qa" }],
  },
  [PdlcPhase.TSPEC_REVIEW]: {
    "backend-only": [{ agentId: "pm" }, { agentId: "qa" }],
    "frontend-only": [{ agentId: "pm" }, { agentId: "qa" }],
    fullstack: [
      { agentId: "pm" },
      { agentId: "pm", scope: "fe_tspec" },
      { agentId: "qa" },
      { agentId: "qa", scope: "fe_tspec" },
      { agentId: "fe", scope: "be_tspec" },
      { agentId: "eng", scope: "fe_tspec" },
    ],
  },
  [PdlcPhase.PLAN_REVIEW]: {
    "backend-only": [{ agentId: "pm" }, { agentId: "qa" }],
    "frontend-only": [{ agentId: "pm" }, { agentId: "qa" }],
    fullstack: [
      { agentId: "pm" },
      { agentId: "pm", scope: "fe_plan" },
      { agentId: "qa" },
      { agentId: "qa", scope: "fe_plan" },
      { agentId: "fe", scope: "be_plan" },
      { agentId: "eng", scope: "fe_plan" },
    ],
  },
  [PdlcPhase.PROPERTIES_REVIEW]: {
    "backend-only": [{ agentId: "pm" }, { agentId: "eng" }],
    "frontend-only": [{ agentId: "pm" }, { agentId: "fe" }],
    fullstack: [{ agentId: "pm" }, { agentId: "eng" }, { agentId: "fe" }],
  },
  [PdlcPhase.IMPLEMENTATION_REVIEW]: {
    "backend-only": [{ agentId: "qa" }],
    "frontend-only": [{ agentId: "qa" }],
    fullstack: [{ agentId: "qa" }],
  },
};

/**
 * Compute the reviewer manifest for a review phase + discipline.
 *
 * @throws Error if phase is not a review phase
 * @throws Error if discipline is unknown
 */
export function computeReviewerManifest(
  phase: PdlcPhase,
  discipline: Discipline,
): ReviewerManifestEntry[] {
  if (!REVIEW_PHASES.has(phase)) {
    throw new Error(`Phase ${phase} is not a review phase`);
  }

  const phaseTable = REVIEWER_TABLE[phase];
  if (!phaseTable) {
    throw new Error(`Phase ${phase} is not a review phase`);
  }

  const manifest = phaseTable[discipline];
  if (!manifest) {
    throw new Error(`Unknown discipline: ${discipline}`);
  }

  return manifest;
}

/**
 * Generate the string key for a reviewer manifest entry.
 *
 * - If scope is undefined: returns agentId (e.g., "eng")
 * - If scope is defined: returns "agentId:scope" (e.g., "pm:fe_tspec")
 */
export function reviewerKey(entry: ReviewerManifestEntry): string {
  if (entry.scope !== undefined) {
    return `${entry.agentId}:${entry.scope}`;
  }
  return entry.agentId;
}

/**
 * Initialize a ReviewPhaseState with all reviewers set to "pending".
 */
export function initializeReviewPhaseState(
  manifest: ReviewerManifestEntry[],
): ReviewPhaseState {
  const reviewerStatuses: Record<string, "pending"> = {};
  for (const entry of manifest) {
    reviewerStatuses[reviewerKey(entry)] = "pending";
  }
  return {
    reviewerStatuses,
    revisionCount: 0,
  };
}

/**
 * Evaluate the outcome of a review phase.
 *
 * - "all_approved" -- every reviewer status is "approved"
 * - "has_revision_requested" -- at least one is "revision_requested" AND none are "pending"
 * - "pending" -- some reviewers are still "pending"
 */
export function evaluateReviewOutcome(
  state: ReviewPhaseState,
): "all_approved" | "has_revision_requested" | "pending" {
  const statuses = Object.values(state.reviewerStatuses);

  let hasPending = false;
  let hasRevisionRequested = false;

  for (const status of statuses) {
    if (status === "pending") {
      hasPending = true;
    } else if (status === "revision_requested") {
      hasRevisionRequested = true;
    }
  }

  if (hasPending) {
    return "pending";
  }

  if (hasRevisionRequested) {
    return "has_revision_requested";
  }

  return "all_approved";
}
