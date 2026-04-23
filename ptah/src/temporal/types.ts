/**
 * Temporal shared types for the Ptah workflow engine.
 *
 * These types define the data models used across Temporal Workflows,
 * Activities, Signals, and Queries.
 */

import type { FeatureConfig } from "../types.js";
import type { WorkflowConfig } from "../config/workflow-config.js";

// ---------------------------------------------------------------------------
// Phase Status
// ---------------------------------------------------------------------------

export type PhaseStatus =
  | "running"
  | "waiting-for-user"
  | "waiting-for-reviewers"
  | "failed"
  | "revision-bound-reached"
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

  // --- Feature Lifecycle Folders ---
  /** Resolved feature folder path relative to worktree root (e.g. "docs/in-progress/my-feature/") */
  featurePath: string | null;
  /** Absolute path to the active worktree root (e.g. "/tmp/ptah-wt-abc123/") */
  worktreeRoot: string | null;
  /** Sign-off tracking: agent ID → ISO 8601 timestamp of LGTM */
  signOffs: Record<string, string>;

  // --- Agent Coordination ---
  /** FIFO queue of pending ad-hoc revision signals */
  adHocQueue: AdHocRevisionSignal[];
  /** True while processing an ad-hoc dispatch + cascade */
  adHocInProgress: boolean;
}

// ---------------------------------------------------------------------------
// Signal Payloads
// ---------------------------------------------------------------------------

export interface UserAnswerSignal {
  answer: string;
  answeredBy: string;
  answeredAt: string;
}

export interface AdHocRevisionSignal {
  targetAgentId: string;
  instruction: string;
  requestedBy: string;
  requestedAt: string;   // ISO 8601
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
  /** Ad-hoc instruction text from user's @-mention message */
  adHocInstruction?: string;
}

export interface SkillActivityResult {
  routingSignalType: string; // "LGTM" | "TASK_COMPLETE" | "ROUTE_TO_USER"
  question?: string;         // if ROUTE_TO_USER
  artifactChanges: string[];
  worktreePath?: string;     // if forkJoin, worktree not yet merged
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Cross-Review Activity (REQ-RC-02)
// ---------------------------------------------------------------------------

export interface ReadCrossReviewInput {
  featurePath: string;
  agentId: string;
  documentType: string;  // e.g., "REQ", "TSPEC"
  revisionCount?: number;  // 1-indexed; undefined = revision 1 (unversioned)
}

export interface CrossReviewResult {
  status: "approved" | "revision_requested" | "parse_error";
  reason?: string;       // only when status === "parse_error"
  rawValue?: string;     // only when status === "parse_error" and value was found but unrecognized
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
