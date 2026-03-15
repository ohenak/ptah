/**
 * PDLC State Machine — pure function module.
 *
 * No class, no I/O, no injected dependencies.
 * All types imported from ./phases.js.
 */

import {
  type FeatureConfig,
  type FeatureState,
  type ForkJoinState,
  type PdlcEvent,
  type ReviewPhaseState,
  type SideEffect,
  type TransitionResult,
  type DocumentType,
  type TaskType,
  PdlcPhase,
  InvalidTransitionError,
} from "./phases.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create initial state for a new feature. */
export function createFeatureState(slug: string, config: FeatureConfig, now: string): FeatureState {
  return {
    slug,
    phase: PdlcPhase.REQ_CREATION,
    config,
    reviewPhases: {},
    forkJoin: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

/** List valid event type strings for a given phase and config. */
export function validEventsForPhase(phase: PdlcPhase, config: FeatureConfig): string[] {
  if (phase === PdlcPhase.DONE) return [];

  // Approved phases always auto-transition
  if (isApprovedPhase(phase)) return ["auto"];

  // Review phases accept review_submitted
  if (isReviewPhase(phase)) return ["review_submitted"];

  // Creation / implementation phases
  if (isForkJoinPhase(phase) && config.discipline === "fullstack") {
    return ["subtask_complete"];
  }

  return ["lgtm"];
}

/** Compute the next state given current state and event. */
export function transition(
  state: FeatureState,
  event: PdlcEvent,
  now: string,
): TransitionResult {
  // Terminal state guard
  if (state.phase === PdlcPhase.DONE) {
    throw new InvalidTransitionError(
      state.phase,
      event.type,
      [],
    );
  }

  const valid = validEventsForPhase(state.phase, state.config);

  // Edge case: lgtm in a review phase => log_warning, state unchanged
  if (event.type === "lgtm" && isReviewPhase(state.phase)) {
    return {
      newState: { ...state, updatedAt: now },
      sideEffects: [{ type: "log_warning", message: `Ignoring 'lgtm' event in review phase ${state.phase}` }],
    };
  }

  // Validate event is valid for current phase
  if (!valid.includes(event.type)) {
    throw new InvalidTransitionError(state.phase, event.type, valid);
  }

  // Dispatch by phase category
  if (isCreationPhase(state.phase) || state.phase === PdlcPhase.IMPLEMENTATION) {
    return handleCreationPhase(state, event, now);
  }

  if (isReviewPhase(state.phase)) {
    return handleReviewPhase(state, event, now);
  }

  if (isApprovedPhase(state.phase)) {
    return handleApprovedPhase(state, event, now);
  }

  // Should be unreachable
  throw new InvalidTransitionError(state.phase, event.type, valid);
}

// ---------------------------------------------------------------------------
// Phase classification helpers
// ---------------------------------------------------------------------------

const CREATION_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_CREATION,
  PdlcPhase.FSPEC_CREATION,
  PdlcPhase.TSPEC_CREATION,
  PdlcPhase.PLAN_CREATION,
  PdlcPhase.PROPERTIES_CREATION,
  PdlcPhase.IMPLEMENTATION,
]);

const REVIEW_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_REVIEW,
  PdlcPhase.FSPEC_REVIEW,
  PdlcPhase.TSPEC_REVIEW,
  PdlcPhase.PLAN_REVIEW,
  PdlcPhase.PROPERTIES_REVIEW,
  PdlcPhase.IMPLEMENTATION_REVIEW,
]);

const APPROVED_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_APPROVED,
  PdlcPhase.FSPEC_APPROVED,
  PdlcPhase.TSPEC_APPROVED,
  PdlcPhase.PLAN_APPROVED,
  PdlcPhase.PROPERTIES_APPROVED,
]);

/** Phases that use fork/join for fullstack features. */
const FORK_JOIN_PHASES = new Set<PdlcPhase>([
  PdlcPhase.TSPEC_CREATION,
  PdlcPhase.PLAN_CREATION,
  PdlcPhase.IMPLEMENTATION,
]);

function isCreationPhase(phase: PdlcPhase): boolean {
  return CREATION_PHASES.has(phase);
}

function isReviewPhase(phase: PdlcPhase): boolean {
  return REVIEW_PHASES.has(phase);
}

function isApprovedPhase(phase: PdlcPhase): boolean {
  return APPROVED_PHASES.has(phase);
}

function isForkJoinPhase(phase: PdlcPhase): boolean {
  return FORK_JOIN_PHASES.has(phase);
}

// ---------------------------------------------------------------------------
// Phase mapping helpers
// ---------------------------------------------------------------------------

/** Map creation/implementation phase → corresponding review phase. */
function creationToReview(phase: PdlcPhase): PdlcPhase {
  const map: Partial<Record<PdlcPhase, PdlcPhase>> = {
    [PdlcPhase.REQ_CREATION]: PdlcPhase.REQ_REVIEW,
    [PdlcPhase.FSPEC_CREATION]: PdlcPhase.FSPEC_REVIEW,
    [PdlcPhase.TSPEC_CREATION]: PdlcPhase.TSPEC_REVIEW,
    [PdlcPhase.PLAN_CREATION]: PdlcPhase.PLAN_REVIEW,
    [PdlcPhase.PROPERTIES_CREATION]: PdlcPhase.PROPERTIES_REVIEW,
    [PdlcPhase.IMPLEMENTATION]: PdlcPhase.IMPLEMENTATION_REVIEW,
  };
  return map[phase]!;
}

/** Map review phase → corresponding approved phase (or DONE for implementation). */
function reviewToApproved(phase: PdlcPhase): PdlcPhase {
  const map: Partial<Record<PdlcPhase, PdlcPhase>> = {
    [PdlcPhase.REQ_REVIEW]: PdlcPhase.REQ_APPROVED,
    [PdlcPhase.FSPEC_REVIEW]: PdlcPhase.FSPEC_APPROVED,
    [PdlcPhase.TSPEC_REVIEW]: PdlcPhase.TSPEC_APPROVED,
    [PdlcPhase.PLAN_REVIEW]: PdlcPhase.PLAN_APPROVED,
    [PdlcPhase.PROPERTIES_REVIEW]: PdlcPhase.PROPERTIES_APPROVED,
    [PdlcPhase.IMPLEMENTATION_REVIEW]: PdlcPhase.DONE,
  };
  return map[phase]!;
}

/** Map review phase → corresponding creation phase (for revision loops). */
function reviewToCreation(phase: PdlcPhase): PdlcPhase {
  const map: Partial<Record<PdlcPhase, PdlcPhase>> = {
    [PdlcPhase.REQ_REVIEW]: PdlcPhase.REQ_CREATION,
    [PdlcPhase.FSPEC_REVIEW]: PdlcPhase.FSPEC_CREATION,
    [PdlcPhase.TSPEC_REVIEW]: PdlcPhase.TSPEC_CREATION,
    [PdlcPhase.PLAN_REVIEW]: PdlcPhase.PLAN_CREATION,
    [PdlcPhase.PROPERTIES_REVIEW]: PdlcPhase.PROPERTIES_CREATION,
    [PdlcPhase.IMPLEMENTATION_REVIEW]: PdlcPhase.IMPLEMENTATION,
  };
  return map[phase]!;
}

/** Map phase → document type for side effects. */
function phaseToDocumentType(phase: PdlcPhase): DocumentType {
  if (phase.startsWith("REQ_") || phase === PdlcPhase.REQ_CREATION) return "REQ";
  if (phase.startsWith("FSPEC_") || phase === PdlcPhase.FSPEC_CREATION) return "FSPEC";
  if (phase.startsWith("TSPEC_") || phase === PdlcPhase.TSPEC_CREATION) return "TSPEC";
  if (phase.startsWith("PLAN_") || phase === PdlcPhase.PLAN_CREATION) return "PLAN";
  if (phase.startsWith("PROPERTIES_") || phase === PdlcPhase.PROPERTIES_CREATION) return "PROPERTIES";
  if (phase === PdlcPhase.IMPLEMENTATION || phase === PdlcPhase.IMPLEMENTATION_REVIEW) return "";
  return "";
}

/** Map creation phase → author agentId for dispatch_agent side effects. */
function phaseToAuthor(phase: PdlcPhase, config: FeatureConfig): string {
  switch (phase) {
    case PdlcPhase.REQ_CREATION:
    case PdlcPhase.FSPEC_CREATION:
      return "pm";
    case PdlcPhase.TSPEC_CREATION:
    case PdlcPhase.PLAN_CREATION:
      return config.discipline === "frontend-only" ? "fe" : "eng";
    case PdlcPhase.PROPERTIES_CREATION:
      return "qa";
    case PdlcPhase.IMPLEMENTATION:
      return config.discipline === "frontend-only" ? "fe" : "eng";
    default:
      return "eng";
  }
}

/** Compute reviewer keys for a review phase. The state machine emits these
 *  in the dispatch_reviewers side effect; the PdlcDispatcher resolves them. */
function reviewerKeysForPhase(phase: PdlcPhase, config: FeatureConfig): string[] {
  const d = config.discipline;

  switch (phase) {
    case PdlcPhase.REQ_REVIEW:
    case PdlcPhase.FSPEC_REVIEW:
      if (d === "backend-only") return ["eng", "qa"];
      if (d === "frontend-only") return ["fe", "qa"];
      return ["eng", "fe", "qa"]; // fullstack

    case PdlcPhase.TSPEC_REVIEW:
      if (d === "fullstack") return ["pm", "pm:fe_tspec", "qa", "qa:fe_tspec", "fe:be_tspec", "eng:fe_tspec"];
      return ["pm", "qa"];

    case PdlcPhase.PLAN_REVIEW:
      if (d === "fullstack") return ["pm", "pm:fe_plan", "qa", "qa:fe_plan", "fe:be_plan", "eng:fe_plan"];
      return ["pm", "qa"];

    case PdlcPhase.PROPERTIES_REVIEW:
      if (d === "backend-only") return ["pm", "eng"];
      if (d === "frontend-only") return ["pm", "fe"];
      return ["pm", "eng", "fe"]; // fullstack

    case PdlcPhase.IMPLEMENTATION_REVIEW:
      return ["qa"];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Creation phase handler
// ---------------------------------------------------------------------------

function handleCreationPhase(
  state: FeatureState,
  event: PdlcEvent,
  now: string,
): TransitionResult {
  const phase = state.phase;

  // Fork/join for fullstack
  if (isForkJoinPhase(phase) && state.config.discipline === "fullstack") {
    if (event.type === "subtask_complete") {
      return handleSubtaskComplete(state, event.agentId, now);
    }
    // subtask_complete is the only valid event for fullstack fork/join phases
    throw new InvalidTransitionError(phase, event.type, ["subtask_complete"]);
  }

  // Single-discipline: lgtm transitions to review
  if (event.type === "lgtm") {
    return transitionToReview(state, now);
  }

  throw new InvalidTransitionError(phase, event.type, validEventsForPhase(phase, state.config));
}

function transitionToReview(state: FeatureState, now: string): TransitionResult {
  const reviewPhase = creationToReview(state.phase);
  const keys = reviewerKeysForPhase(reviewPhase, state.config);

  // Initialize review phase state
  const reviewerStatuses: Record<string, string> = {};
  for (const key of keys) {
    reviewerStatuses[key] = "pending";
  }

  const existingReviewState = state.reviewPhases[reviewPhase];
  const revisionCount = existingReviewState?.revisionCount ?? 0;

  const newReviewPhases = {
    ...state.reviewPhases,
    [reviewPhase]: {
      reviewerStatuses,
      revisionCount,
    } as ReviewPhaseState,
  };

  return {
    newState: {
      ...state,
      phase: reviewPhase,
      reviewPhases: newReviewPhases,
      updatedAt: now,
    },
    sideEffects: [{ type: "dispatch_reviewers", reviewerKeys: keys }],
  };
}

// ---------------------------------------------------------------------------
// Fork/join handler
// ---------------------------------------------------------------------------

function handleSubtaskComplete(
  state: FeatureState,
  agentId: string,
  now: string,
): TransitionResult {
  const fj = state.forkJoin;

  if (!fj) {
    throw new InvalidTransitionError(state.phase, "subtask_complete", ["subtask_complete"]);
  }

  // Validate agentId is a known subtask
  if (!(agentId in fj.subtasks)) {
    throw new InvalidTransitionError(state.phase, "subtask_complete", ["subtask_complete"]);
  }

  const newSubtasks = { ...fj.subtasks, [agentId]: "complete" as const };
  const allComplete = Object.values(newSubtasks).every((s) => s === "complete");

  if (allComplete) {
    // Clear forkJoin and transition to review
    const stateWithClearedFJ: FeatureState = {
      ...state,
      forkJoin: null,
      updatedAt: now,
    };
    return transitionToReview(stateWithClearedFJ, now);
  }

  // Partial completion: update forkJoin, no transition
  return {
    newState: {
      ...state,
      forkJoin: { subtasks: newSubtasks },
      updatedAt: now,
    },
    sideEffects: [],
  };
}

// ---------------------------------------------------------------------------
// Review phase handler
// ---------------------------------------------------------------------------

function handleReviewPhase(
  state: FeatureState,
  event: PdlcEvent,
  now: string,
): TransitionResult {
  if (event.type !== "review_submitted") {
    throw new InvalidTransitionError(
      state.phase,
      event.type,
      validEventsForPhase(state.phase, state.config),
    );
  }

  const reviewState = state.reviewPhases[state.phase];
  if (!reviewState) {
    throw new Error(`No review phase state for phase ${state.phase}`);
  }

  // Update reviewer status
  const newStatuses = {
    ...reviewState.reviewerStatuses,
    [event.reviewerKey]: event.recommendation,
  };

  const newReviewState: ReviewPhaseState = {
    ...reviewState,
    reviewerStatuses: newStatuses,
  };

  // Evaluate outcome
  const outcome = evaluateReviewOutcome(newReviewState);

  if (outcome === "pending") {
    // Still waiting for reviewers
    return {
      newState: {
        ...state,
        reviewPhases: { ...state.reviewPhases, [state.phase]: newReviewState },
        updatedAt: now,
      },
      sideEffects: [],
    };
  }

  if (outcome === "all_approved") {
    const approvedPhase = reviewToApproved(state.phase);
    const newState: FeatureState = {
      ...state,
      phase: approvedPhase,
      reviewPhases: { ...state.reviewPhases, [state.phase]: newReviewState },
      updatedAt: now,
      completedAt: approvedPhase === PdlcPhase.DONE ? now : state.completedAt,
    };

    const sideEffects: SideEffect[] = approvedPhase === PdlcPhase.DONE
      ? []
      : [{ type: "auto_transition" }];

    return { newState, sideEffects };
  }

  // has_revision_requested
  const newRevisionCount = newReviewState.revisionCount + 1;

  if (newRevisionCount > 3) {
    // Revision bound exceeded — pause, state unchanged (except updated review statuses)
    return {
      newState: {
        ...state,
        reviewPhases: {
          ...state.reviewPhases,
          [state.phase]: { ...newReviewState, revisionCount: newRevisionCount },
        },
        updatedAt: now,
      },
      sideEffects: [{
        type: "pause_feature",
        reason: "Revision bound exceeded",
        message: `Feature '${state.slug}' has exceeded the maximum of 3 revision cycles in phase ${state.phase}.`,
      }],
    };
  }

  // Reset all statuses to pending and transition back to creation
  const resetStatuses: Record<string, string> = {};
  for (const key of Object.keys(newStatuses)) {
    resetStatuses[key] = "pending";
  }

  const creationPhase = reviewToCreation(state.phase);

  const revisionSideEffects = computeRevisionSideEffects(
    state.phase,
    newStatuses,
    state.config,
    creationPhase,
  );

  return {
    newState: {
      ...state,
      phase: creationPhase,
      reviewPhases: {
        ...state.reviewPhases,
        [state.phase]: {
          reviewerStatuses: resetStatuses as Record<string, "pending">,
          revisionCount: newRevisionCount,
        },
      },
      forkJoin: initForkJoinIfNeeded(creationPhase, state.config),
      updatedAt: now,
    },
    sideEffects: revisionSideEffects,
  };
}

/** Inline review outcome evaluation. */
function evaluateReviewOutcome(
  reviewState: ReviewPhaseState,
): "all_approved" | "has_revision_requested" | "pending" {
  const statuses = Object.values(reviewState.reviewerStatuses);

  if (statuses.some((s) => s === "revision_requested")) {
    // Check if any are still pending — if so, we're still waiting
    if (statuses.some((s) => s === "pending")) return "pending";
    return "has_revision_requested";
  }

  if (statuses.some((s) => s === "pending")) return "pending";

  return "all_approved";
}

/** Compute side effects for a revision loop. */
function computeRevisionSideEffects(
  reviewPhase: PdlcPhase,
  reviewerStatuses: Record<string, string>,
  config: FeatureConfig,
  creationPhase: PdlcPhase,
): SideEffect[] {
  const docType = phaseToDocumentType(creationPhase);

  // For fullstack multi-document reviews (TSPEC_REVIEW, PLAN_REVIEW):
  // Determine which sub-documents were rejected vs approved.
  if (
    config.discipline === "fullstack" &&
    (reviewPhase === PdlcPhase.TSPEC_REVIEW || reviewPhase === PdlcPhase.PLAN_REVIEW)
  ) {
    return computeFullstackRevisionSideEffects(reviewerStatuses, config, creationPhase, docType);
  }

  // Single-discipline: dispatch author with "Revise"
  const author = phaseToAuthor(creationPhase, config);
  return [{
    type: "dispatch_agent",
    agentId: author,
    taskType: "Revise",
    documentType: docType,
  }];
}

/** Compute side effects for fullstack revision in multi-document reviews. */
function computeFullstackRevisionSideEffects(
  reviewerStatuses: Record<string, string>,
  config: FeatureConfig,
  creationPhase: PdlcPhase,
  docType: DocumentType,
): SideEffect[] {
  // Determine if backend doc was rejected (any non-scoped reviewer rejected)
  // and if frontend doc was rejected (any fe-scoped reviewer rejected)
  const beRejected = Object.entries(reviewerStatuses).some(
    ([key, status]) => !key.includes(":") && status === "revision_requested",
  ) || Object.entries(reviewerStatuses).some(
    ([key, status]) => key.endsWith(":be_tspec") || key.endsWith(":be_plan")
      ? status === "revision_requested"
      : false,
  );

  const feScopePattern = creationPhase === PdlcPhase.TSPEC_CREATION ? "fe_tspec" : "fe_plan";
  const feRejected = Object.entries(reviewerStatuses).some(
    ([key, status]) => key.includes(`:${feScopePattern}`) && status === "revision_requested",
  );

  const effects: SideEffect[] = [];

  // Backend engineer
  effects.push({
    type: "dispatch_agent",
    agentId: "eng",
    taskType: beRejected ? "Revise" : "Resubmit",
    documentType: docType,
  });

  // Frontend engineer
  effects.push({
    type: "dispatch_agent",
    agentId: "fe",
    taskType: feRejected ? "Revise" : "Resubmit",
    documentType: docType,
  });

  return effects;
}

// ---------------------------------------------------------------------------
// Approved phase handler (auto-transitions)
// ---------------------------------------------------------------------------

function handleApprovedPhase(
  state: FeatureState,
  event: PdlcEvent,
  now: string,
): TransitionResult {
  if (event.type !== "auto") {
    throw new InvalidTransitionError(state.phase, event.type, ["auto"]);
  }

  const { nextPhase, agentId, taskType, docType } = computeAutoTransitionTarget(state);
  const forkJoin = initForkJoinIfNeeded(nextPhase, state.config);

  return {
    newState: {
      ...state,
      phase: nextPhase,
      forkJoin,
      updatedAt: now,
    },
    sideEffects: [{
      type: "dispatch_agent",
      agentId,
      taskType,
      documentType: docType,
    }],
  };
}

function computeAutoTransitionTarget(state: FeatureState): {
  nextPhase: PdlcPhase;
  agentId: string;
  taskType: TaskType;
  docType: DocumentType;
} {
  switch (state.phase) {
    case PdlcPhase.REQ_APPROVED:
      if (state.config.skipFspec) {
        return {
          nextPhase: PdlcPhase.TSPEC_CREATION,
          agentId: phaseToAuthor(PdlcPhase.TSPEC_CREATION, state.config),
          taskType: "Create",
          docType: "TSPEC",
        };
      }
      return {
        nextPhase: PdlcPhase.FSPEC_CREATION,
        agentId: "pm",
        taskType: "Create",
        docType: "FSPEC",
      };

    case PdlcPhase.FSPEC_APPROVED:
      return {
        nextPhase: PdlcPhase.TSPEC_CREATION,
        agentId: phaseToAuthor(PdlcPhase.TSPEC_CREATION, state.config),
        taskType: "Create",
        docType: "TSPEC",
      };

    case PdlcPhase.TSPEC_APPROVED:
      return {
        nextPhase: PdlcPhase.PLAN_CREATION,
        agentId: phaseToAuthor(PdlcPhase.PLAN_CREATION, state.config),
        taskType: "Create",
        docType: "PLAN",
      };

    case PdlcPhase.PLAN_APPROVED:
      return {
        nextPhase: PdlcPhase.PROPERTIES_CREATION,
        agentId: "qa",
        taskType: "Create",
        docType: "PROPERTIES",
      };

    case PdlcPhase.PROPERTIES_APPROVED:
      return {
        nextPhase: PdlcPhase.IMPLEMENTATION,
        agentId: phaseToAuthor(PdlcPhase.IMPLEMENTATION, state.config),
        taskType: "Implement",
        docType: "",
      };

    default:
      throw new Error(`No auto-transition defined for phase ${state.phase}`);
  }
}

/** Initialize fork/join state if the target phase supports it and discipline is fullstack. */
function initForkJoinIfNeeded(phase: PdlcPhase, config: FeatureConfig): ForkJoinState | null {
  if (!isForkJoinPhase(phase) || config.discipline !== "fullstack") {
    return null;
  }

  return {
    subtasks: {
      eng: "pending",
      fe: "pending",
    },
  };
}
