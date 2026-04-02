/**
 * Temporal shared types for the Ptah workflow engine.
 *
 * These types define the data models used across Temporal Workflows,
 * Activities, Signals, and Queries.
 */

import type { FeatureConfig } from "../orchestrator/pdlc/phases.js";
import type { WorkflowConfig } from "../config/workflow-config.js";

// ---------------------------------------------------------------------------
// Phase Status
// ---------------------------------------------------------------------------

export type PhaseStatus =
  | "running"
  | "waiting-for-user"
  | "waiting-for-reviewers"
  | "failed"
  | "completed";

// ---------------------------------------------------------------------------
// Review State (per review phase)
// ---------------------------------------------------------------------------

export type ReviewerStatusValue = "pending" | "approved" | "revision_requested";

export interface ReviewState {
  reviewerStatuses: Record<string, ReviewerStatusValue>;
  revisionCount: number;
}

/** Alias for migration compatibility with v4 ReviewPhaseState shape */
export type ReviewPhaseState = ReviewState;

// ---------------------------------------------------------------------------
// Fork/Join State
// ---------------------------------------------------------------------------

export type FailurePolicy = "wait_for_all" | "fail_fast";

export interface ForkJoinAgentResult {
  status: "pending" | "success" | "failed" | "cancelled";
  worktreePath?: string;
  routingSignal?: string;
  error?: string;
}

export interface ForkJoinState {
  agentResults: Record<string, ForkJoinAgentResult>;
  failurePolicy: FailurePolicy;
}

// ---------------------------------------------------------------------------
// Pending Question State
// ---------------------------------------------------------------------------

export interface PendingQuestionState {
  question: string;
  agentId: string;
  phaseId: string;
  askedAt: string;
}

// ---------------------------------------------------------------------------
// Failure Info
// ---------------------------------------------------------------------------

export interface FailureInfo {
  phaseId: string;
  agentId: string;
  errorType: string;
  errorMessage: string;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Feature Workflow State (queryable via Temporal Query)
// ---------------------------------------------------------------------------

export interface FeatureWorkflowState {
  featureSlug: string;
  featureConfig: FeatureConfig;
  /** Snapshotted at workflow start for versioning (REQ-CD-04). */
  workflowConfig: WorkflowConfig;
  currentPhaseId: string;
  completedPhaseIds: string[];
  activeAgentIds: string[];
  phaseStatus: PhaseStatus;
  reviewStates: Record<string, ReviewState>;
  forkJoinState: ForkJoinState | null;
  pendingQuestion: PendingQuestionState | null;
  failureInfo: FailureInfo | null;
  startedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Signal Payloads
// ---------------------------------------------------------------------------

export interface UserAnswerSignal {
  answer: string;
  answeredBy: string;
  answeredAt: string;
}

export type RetryOrCancelSignal = "retry" | "cancel";
export type ResumeOrCancelSignal = "resume" | "cancel";

// ---------------------------------------------------------------------------
// Activity Input/Output
// ---------------------------------------------------------------------------

export interface SkillActivityInput {
  agentId: string;
  featureSlug: string;
  phaseId: string;
  taskType: string;
  documentType: string;
  contextDocumentRefs: string[];
  featureConfig: FeatureConfig;
  forkJoin: boolean;
  isRevision: boolean;
  priorQuestion?: string;
  priorAnswer?: string;
}

export interface SkillActivityResult {
  routingSignalType: string; // "LGTM" | "TASK_COMPLETE" | "ROUTE_TO_USER"
  question?: string;         // if ROUTE_TO_USER
  artifactChanges: string[];
  worktreePath?: string;     // if forkJoin, worktree not yet merged
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Notification Activity
// ---------------------------------------------------------------------------

export type NotificationType = "question" | "failure" | "status" | "revision-bound";

export interface NotificationInput {
  type: NotificationType;
  featureSlug: string;
  phaseId: string;
  agentId: string;
  message: string;
  workflowId: string;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export interface V4PhaseMapping {
  [v4Phase: string]: string;
}

// ---------------------------------------------------------------------------
// Start Workflow Params
// ---------------------------------------------------------------------------

export interface StartWorkflowParams {
  featureSlug: string;
  featureConfig: FeatureConfig;
  workflowConfig: WorkflowConfig;
  startAtPhase?: string;
  initialReviewState?: Record<string, ReviewPhaseState>;
}
