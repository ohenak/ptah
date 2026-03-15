// --- Phase Enumeration (REQ-SM-01) ---

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

// --- Feature Configuration (REQ-FC-01) ---

export type Discipline = "backend-only" | "frontend-only" | "fullstack";

export interface FeatureConfig {
  discipline: Discipline;
  skipFspec: boolean;
}

// --- Event Types (FSPEC-SM-01) ---

export type PdlcEvent =
  | { type: "lgtm"; agentId: string }
  | { type: "subtask_complete"; agentId: string }
  | { type: "review_submitted"; reviewerKey: string; recommendation: ReviewRecommendation }
  | { type: "auto" };

export type ReviewRecommendation = "approved" | "revision_requested";

// --- Reviewer Status (FSPEC-RT-02) ---

export type ReviewerStatus = "pending" | "approved" | "revision_requested";

export interface ReviewPhaseState {
  reviewerStatuses: Record<string, ReviewerStatus>;
  revisionCount: number;
}

// --- Fork/Join State (FSPEC-SM-01) ---

export type SubTaskStatus = "pending" | "complete";

export interface ForkJoinState {
  subtasks: Record<string, SubTaskStatus>;
}

// --- Per-Feature State (REQ-SM-02) ---

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

// --- Persisted State File (REQ-SM-05, REQ-SM-10) ---

export interface PdlcStateFile {
  version: number;
  features: Record<string, FeatureState>;
}

// --- Transition Result ---

export interface TransitionResult {
  newState: FeatureState;
  sideEffects: SideEffect[];
}

export type SideEffect =
  | { type: "dispatch_agent"; agentId: string; taskType: TaskType; documentType: DocumentType }
  | { type: "dispatch_reviewers"; reviewerKeys: string[] }
  | { type: "pause_feature"; reason: string; message: string }
  | { type: "log_warning"; message: string }
  | { type: "auto_transition" };

export type TaskType = "Create" | "Review" | "Revise" | "Resubmit" | "Implement";
export type DocumentType = "REQ" | "FSPEC" | "TSPEC" | "PLAN" | "PROPERTIES" | "IMPLEMENTATION" | "";

// --- Reviewer Manifest Entry (FSPEC-FC-01) ---

export interface ReviewerManifestEntry {
  agentId: string;
  scope?: string;
}

// --- Context Document Set (FSPEC-CA-01) ---

export interface ContextDocument {
  type: "overview" | "req" | "fspec" | "tspec" | "plan" | "properties" | "cross_review";
  relativePath: string;
  required: boolean;
}

export interface ContextDocumentSet {
  documents: ContextDocument[];
}

// --- Dispatch Result (from PdlcDispatcher) ---

export type DispatchAction =
  | { action: "dispatch"; agents: AgentDispatch[] }
  | { action: "retry_agent"; reason: string; message: string }
  | { action: "pause"; reason: string; message: string }
  | { action: "done" }
  | { action: "wait" };

export interface AgentDispatch {
  agentId: string;
  taskType: TaskType;
  documentType: DocumentType;
  contextDocuments: ContextDocumentSet;
}

// --- Parsed Recommendation (FSPEC-RT-01) ---

export type ParsedRecommendation =
  | { status: "approved" }
  | { status: "revision_requested" }
  | { status: "parse_error"; reason: string; rawValue?: string };

// --- Error Types ---

export class InvalidTransitionError extends Error {
  constructor(
    public readonly phase: PdlcPhase,
    public readonly eventType: string,
    public readonly validEvents: string[],
  ) {
    super(
      `Invalid event '${eventType}' in phase ${phase}. Valid events: ${validEvents.join(", ")}`,
    );
    this.name = "InvalidTransitionError";
  }
}

export class UnknownFeatureError extends Error {
  constructor(public readonly slug: string) {
    super(`No state record for feature: ${slug}`);
    this.name = "UnknownFeatureError";
  }
}
