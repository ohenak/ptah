/**
 * v4-types.ts — Legacy v4 PDLC types retained for migration tooling only.
 *
 * These types represent the on-disk format of the v4 pdlc-state.json file.
 * They are used exclusively by `ptah migrate` (MigrateCommand) to read
 * existing v4 state and create Temporal workflows.
 *
 * Do NOT use these types in new code — use WorkflowConfig / FeatureWorkflowState instead.
 */

import type { FeatureConfig } from "../../types.js";

// --- v4 Phase Enum ---

export enum PdlcPhase {
  REQ_CREATION = "REQ_CREATION",
  REQ_REVIEW = "REQ_REVIEW",
  REQ_APPROVED = "REQ_APPROVED",
  FSPEC_CREATION = "FSPEC_CREATION",
  FSPEC_REVIEW = "FSPEC_REVIEW",
  FSPEC_APPROVED = "FSPEC_APPROVED",
  TSPEC_CREATION = "TSPEC_CREATION",
  TSPEC_REVIEW = "TSPEC_REVIEW",
  TSPEC_APPROVED = "TSPEC_APPROVED",
  PLAN_CREATION = "PLAN_CREATION",
  PLAN_REVIEW = "PLAN_REVIEW",
  PLAN_APPROVED = "PLAN_APPROVED",
  PROPERTIES_CREATION = "PROPERTIES_CREATION",
  PROPERTIES_REVIEW = "PROPERTIES_REVIEW",
  PROPERTIES_APPROVED = "PROPERTIES_APPROVED",
  IMPLEMENTATION = "IMPLEMENTATION",
  IMPLEMENTATION_REVIEW = "IMPLEMENTATION_REVIEW",
  DONE = "DONE",
}

// --- v4 Reviewer Status ---

export type ReviewerStatus = "pending" | "approved" | "revision_requested";

export interface ReviewPhaseState {
  reviewerStatuses: Record<string, ReviewerStatus>;
  revisionCount: number;
}

// --- v4 Fork/Join State ---

export type SubTaskStatus = "pending" | "complete";

export interface ForkJoinState {
  subtasks: Record<string, SubTaskStatus>;
}

// --- v4 Per-Feature State ---

export interface FeatureState {
  slug: string;
  phase: PdlcPhase;
  config: FeatureConfig;
  reviewPhases: Partial<Record<PdlcPhase, ReviewPhaseState>>;
  forkJoin: ForkJoinState | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// --- v4 Persisted State File ---

export interface PdlcStateFile {
  version: number;
  features: Record<string, FeatureState>;
}

// --- Parsed Cross-Review Recommendation (used by cross-review-parser.ts) ---

export type ParsedRecommendation =
  | { status: "approved" }
  | { status: "revision_requested" }
  | { status: "parse_error"; reason: string; rawValue?: string };
