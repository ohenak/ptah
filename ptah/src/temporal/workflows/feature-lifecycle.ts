/**
 * Feature Lifecycle Temporal Workflow — Phase D: Workflow Logic
 *
 * This file contains:
 * 1. Pure helper functions (exported for unit testing) — resolveNextPhase,
 *    evaluateSkipCondition, buildInitialWorkflowState, resolveContextDocuments,
 *    computeReviewerList, mapRecommendationToStatus, buildInvokeSkillInput,
 *    buildRevisionInput.
 * 2. The featureLifecycleWorkflow Temporal Workflow definition (deterministic,
 *    no I/O, uses only Temporal SDK primitives).
 *
 * IMPORTANT: The Workflow function MUST be deterministic — no Date.now(),
 * no Math.random(), no direct I/O. All I/O goes through Activities.
 *
 * @see TSPEC-015 Section 5 (Algorithm: Feature Lifecycle Workflow)
 * @see FSPEC-TF-01 through FSPEC-TF-05
 */

import * as wf from "@temporalio/workflow";
import type { PhaseDefinition, WorkflowConfig } from "../../config/workflow-config.js";
import type { FeatureConfig } from "../../types.js";
import type {
  AdHocRevisionSignal,
  FeatureWorkflowState,
  SkillActivityInput,
  SkillActivityResult,
  NotificationInput,
  UserAnswerSignal,
  RetryOrCancelSignal,
  ResumeOrCancelSignal,
  ReviewState,
  ReviewerStatusValue,
  ForkJoinState,
  ForkJoinAgentResult,
  StartWorkflowParams,
} from "../types.js";
import type { MergeResult, MergeWorktreeInput, ResolveFeaturePathInput } from "../activities/skill-activity.js";
import type { FeatureResolverResult } from "../../orchestrator/feature-resolver.js";
import type { PromotionInput, PromotionResult } from "../../orchestrator/promotion-activity.js";

// ---------------------------------------------------------------------------
// Context document resolution context
// ---------------------------------------------------------------------------

export interface ContextResolutionContext {
  featureSlug: string;
  /** Resolved feature folder path, e.g. "docs/in-progress/my-feature/" */
  featurePath: string;
  docsRoot?: string; // kept for backward compat, ignored when featurePath is set
}

// ---------------------------------------------------------------------------
// D14: Context Document Resolution
// ---------------------------------------------------------------------------

/** Document type tokens that map to named document files */
const DOC_TYPE_TOKENS: Record<string, string> = {
  REQ: "REQ",
  FSPEC: "FSPEC",
  TSPEC: "TSPEC",
  PLAN: "PLAN",
  PROPERTIES: "PROPERTIES",
};

/**
 * Extract the NNN prefix from a completed feature path.
 *
 * Given "docs/completed/015-my-feature/", extracts "015".
 * Returns null if the path is not in completed/ or has no NNN prefix.
 */
export function extractCompletedPrefix(featurePath: string): string | null {
  const match = featurePath.match(/docs\/completed\/([0-9]{3})-/);
  return match ? match[1] : null;
}

/**
 * Resolve `{feature}/DOC_TYPE` references to actual file paths.
 *
 * For backlog/in-progress features (unnumbered):
 * | Reference            | Resolves To                          |
 * |----------------------|--------------------------------------|
 * | {feature}/overview   | {featurePath}overview.md             |
 * | {feature}/REQ        | {featurePath}REQ-{slug}.md           |
 * | {feature}/FSPEC      | {featurePath}FSPEC-{slug}.md         |
 * | other (no {feature}) | passed through unchanged             |
 *
 * For completed features (NNN-prefixed):
 * | Reference            | Resolves To                          |
 * |----------------------|--------------------------------------|
 * | {feature}/overview   | {featurePath}{NNN}-overview.md       |
 * | {feature}/REQ        | {featurePath}{NNN}-REQ-{slug}.md     |
 * | other (no {feature}) | passed through unchanged             |
 */
export function resolveContextDocuments(
  refs: string[],
  ctx: ContextResolutionContext,
): string[] {
  const { featureSlug, featurePath } = ctx;
  const nnnPrefix = extractCompletedPrefix(featurePath);

  return refs.map((ref) => {
    if (!ref.startsWith("{feature}/")) {
      // Pass through unchanged — absolute path or CROSS-REVIEW file
      return ref;
    }

    const docType = ref.slice("{feature}/".length);

    if (docType === "overview") {
      return nnnPrefix
        ? `${featurePath}${nnnPrefix}-overview.md`
        : `${featurePath}overview.md`;
    }

    if (DOC_TYPE_TOKENS[docType]) {
      return nnnPrefix
        ? `${featurePath}${nnnPrefix}-${docType}-${featureSlug}.md`
        : `${featurePath}${docType}-${featureSlug}.md`;
    }

    // Unknown {feature}/X reference — pass through unchanged
    return ref;
  });
}

// ---------------------------------------------------------------------------
// D1: Skip Condition Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a skip_if condition is satisfied for the given FeatureConfig.
 *
 * Currently supports top-level boolean fields on FeatureConfig.
 * Returns false (do not skip) for unknown fields to avoid accidental skips.
 */
export function evaluateSkipCondition(
  condition: { field: string; equals: boolean },
  featureConfig: FeatureConfig,
): boolean {
  const config = featureConfig as unknown as Record<string, unknown>;
  const value = config[condition.field];

  if (typeof value !== "boolean") {
    // Unknown field — safe default: do not skip
    return false;
  }

  return value === condition.equals;
}

// ---------------------------------------------------------------------------
// D1: Phase Graph Walker
// ---------------------------------------------------------------------------

/**
 * Resolve the next phase ID to transition to after completing `currentPhaseId`.
 *
 * Rules (in priority order):
 * 1. If the current phase has an explicit `transition` field → return that phase ID.
 * 2. Otherwise, advance to the next phase in array order.
 * 3. If the next phase in array order has a satisfied `skip_if` condition → recurse
 *    to skip it and evaluate the phase after it.
 * 4. If no next phase exists (current is last) → return null (workflow complete).
 *
 * @throws Error if currentPhaseId is not found in the config.
 */
export function resolveNextPhase(
  currentPhaseId: string,
  config: WorkflowConfig,
  featureConfig: FeatureConfig,
): string | null {
  const phases = config.phases;
  const currentIndex = phases.findIndex((p) => p.id === currentPhaseId);

  if (currentIndex === -1) {
    throw new Error(`Phase '${currentPhaseId}' not found in workflow config`);
  }

  const currentPhase = phases[currentIndex];

  // Rule 1: Explicit transition takes precedence
  if (currentPhase.transition) {
    return currentPhase.transition;
  }

  // Rule 2: Advance to next phase in array order
  const nextIndex = currentIndex + 1;
  if (nextIndex >= phases.length) {
    return null; // workflow complete
  }

  const nextPhase = phases[nextIndex];

  // Rule 3: Evaluate skip_if on the candidate next phase
  if (
    nextPhase.skip_if &&
    evaluateSkipCondition(nextPhase.skip_if, featureConfig)
  ) {
    // Skip this phase — recurse from it to find the next non-skipped phase
    return resolveNextPhase(nextPhase.id, config, featureConfig);
  }

  return nextPhase.id;
}

// ---------------------------------------------------------------------------
// D2: Build Initial Workflow State
// ---------------------------------------------------------------------------

export interface BuildInitialStateParams {
  featureSlug: string;
  featureConfig: FeatureConfig;
  workflowConfig: WorkflowConfig;
  startedAt: string;
  startAtPhase?: string;
  initialReviewState?: Record<string, ReviewState>;
  /** Carried forward from continue-as-new payload */
  featurePath?: string | null;
  /** Carried forward from continue-as-new payload (always null — new run gets fresh worktrees) */
  worktreeRoot?: string | null;
  /** Carried forward from continue-as-new payload */
  signOffs?: Record<string, string>;
}

/**
 * Build the initial FeatureWorkflowState for a new workflow execution.
 *
 * The workflowConfig is snapshotted into state for versioning (REQ-CD-04):
 * the workflow uses the config snapshot for its entire lifetime, even if
 * the config file changes on disk.
 *
 * @throws Error if startAtPhase is specified but does not exist in config.
 */
export function buildInitialWorkflowState(
  params: BuildInitialStateParams,
): FeatureWorkflowState {
  const {
    featureSlug,
    featureConfig,
    workflowConfig,
    startedAt,
    startAtPhase,
    initialReviewState,
    featurePath,
    worktreeRoot,
    signOffs,
  } = params;

  // Determine starting phase
  let startingPhaseId: string;
  if (startAtPhase !== undefined) {
    const found = workflowConfig.phases.find((p) => p.id === startAtPhase);
    if (!found) {
      throw new Error(
        `startAtPhase '${startAtPhase}' not found in workflow config`
      );
    }
    startingPhaseId = startAtPhase;
  } else {
    // Default: start at the first phase
    startingPhaseId = workflowConfig.phases[0].id;
  }

  return {
    featureSlug,
    featureConfig,
    workflowConfig,
    currentPhaseId: startingPhaseId,
    completedPhaseIds: [],
    activeAgentIds: [],
    phaseStatus: "running",
    reviewStates: initialReviewState ?? {},
    forkJoinState: null,
    pendingQuestion: null,
    failureInfo: null,
    startedAt,
    updatedAt: startedAt,
    featurePath: featurePath ?? null,
    worktreeRoot: worktreeRoot ?? null,
    signOffs: signOffs ?? {},
    adHocQueue: [],
    adHocInProgress: false,
  };
}

// ---------------------------------------------------------------------------
// E6: Sign-off tracking — record agent ID + timestamp on LGTM
// ---------------------------------------------------------------------------

/**
 * Record a sign-off in the workflow state.
 * Called when a skill activity returns LGTM.
 *
 * @returns The updated signOffs record.
 */
export function recordSignOff(
  signOffs: Record<string, string>,
  agentId: string,
  timestamp: string,
): Record<string, string> {
  return { ...signOffs, [agentId]: timestamp };
}

// ---------------------------------------------------------------------------
// E7: Completion promotion trigger — detect both qa + pm sign-offs
// ---------------------------------------------------------------------------

/**
 * Check whether both required sign-offs (qa and pm) are present.
 * Returns true if completion promotion should be triggered.
 */
export function isCompletionReady(signOffs: Record<string, string>): boolean {
  return signOffs.qa !== undefined && signOffs.pm !== undefined;
}

// ---------------------------------------------------------------------------
// E8: Pre-invocation backlog promotion detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a feature needs backlog→in-progress promotion
 * before skill invocation.
 *
 * @returns true if lifecycle is "backlog" and needs promotion.
 */
export function needsBacklogPromotion(lifecycle: string): boolean {
  return lifecycle === "backlog";
}

// ---------------------------------------------------------------------------
// E9: continue-as-new payload builder
// ---------------------------------------------------------------------------

export interface ContinueAsNewPayload {
  featurePath: string | null;
  worktreeRoot: null; // always null — new run gets fresh worktrees
  signOffs: Record<string, string>;
  /** Carry pending ad-hoc signals across continue-as-new boundary */
  adHocQueue: AdHocRevisionSignal[];
}

/**
 * Build the continue-as-new payload carrying lifecycle state across CAN boundaries.
 * worktreeRoot is always nulled — each new run creates its own worktrees.
 */
export function buildContinueAsNewPayload(
  state: Pick<FeatureWorkflowState, "featurePath" | "signOffs" | "adHocQueue">,
): ContinueAsNewPayload {
  return {
    featurePath: state.featurePath,
    worktreeRoot: null,
    signOffs: { ...state.signOffs },
    adHocQueue: [...state.adHocQueue],
  };
}

// ---------------------------------------------------------------------------
// D3: Build SkillActivityInput for single-agent dispatch
// ---------------------------------------------------------------------------

export interface BuildInvokeSkillInputParams {
  phase: PhaseDefinition;
  agentId: string;
  featureSlug: string;
  featureConfig: FeatureConfig;
  forkJoin: boolean;
  isRevision: boolean;
  priorQuestion?: string;
  priorAnswer?: string;
}

/**
 * Determine the taskType string from the phase type and revision flag.
 *
 * - creation + isRevision=true → "Revise"
 * - creation + isRevision=false → "Create"
 * - review → "Review"
 * - implementation → "Implement"
 * - approved → "Approve" (auto-phase, should not be dispatched)
 */
function resolveTaskType(
  phaseType: PhaseDefinition["type"],
  isRevision: boolean,
): string {
  if (phaseType === "review") return "Review";
  if (phaseType === "implementation") return "Implement";
  if (isRevision) return "Revise";
  return "Create";
}

/**
 * Build a SkillActivityInput for dispatching a single agent or one agent
 * in a fork/join phase.
 */
export function buildInvokeSkillInput(
  params: BuildInvokeSkillInputParams,
): SkillActivityInput {
  const {
    phase,
    agentId,
    featureSlug,
    featureConfig,
    forkJoin,
    isRevision,
    priorQuestion,
    priorAnswer,
  } = params;

  return {
    agentId,
    featureSlug,
    phaseId: phase.id,
    taskType: resolveTaskType(phase.type, isRevision),
    documentType: phase.id, // used as document label in context
    contextDocumentRefs: phase.context_documents ?? [],
    featureConfig,
    forkJoin,
    isRevision,
    ...(priorQuestion !== undefined ? { priorQuestion } : {}),
    ...(priorAnswer !== undefined ? { priorAnswer } : {}),
  };
}

// ---------------------------------------------------------------------------
// D9: Reviewer Manifest Computation
// ---------------------------------------------------------------------------

/**
 * Compute the list of reviewer agent IDs for a review phase based on
 * the feature's discipline.
 *
 * Discipline lookup order:
 * 1. Exact discipline key (e.g., "backend-only")
 * 2. "default" fallback
 * 3. Empty array (no reviewers configured)
 */
export function computeReviewerList(
  phase: PhaseDefinition,
  featureConfig: FeatureConfig,
): string[] {
  const { reviewers } = phase;
  if (!reviewers) return [];

  const discipline = featureConfig.discipline;

  // Exact discipline match
  const disciplineList = reviewers[discipline];
  if (disciplineList && disciplineList.length > 0) return disciplineList;

  // Default fallback
  if (reviewers.default && reviewers.default.length > 0) return reviewers.default;

  return [];
}

// ---------------------------------------------------------------------------
// D9: Map recommendation string to ReviewerStatusValue
// ---------------------------------------------------------------------------

/**
 * Map a cross-review file Recommendation string to a ReviewerStatusValue.
 *
 * Per BR-17: "Approved with minor changes" is treated as "approved".
 *
 * Returns null for unrecognized recommendation strings (caller should retry
 * the reviewer Activity — parse error).
 */
export function mapRecommendationToStatus(
  recommendation: string,
): ReviewerStatusValue | null {
  switch (recommendation) {
    case "Approved":
    case "Approved with minor changes":
      return "approved";
    case "Needs revision":
      return "revision_requested";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// D10: Build revision dispatch input
// ---------------------------------------------------------------------------

export interface BuildRevisionInputParams {
  creationPhase: PhaseDefinition;
  agentId: string;
  featureSlug: string;
  featureConfig: FeatureConfig;
  crossReviewRefs: string[];
}

/**
 * Build a SkillActivityInput for the revision loop — dispatching the author
 * agent with task type "Revise" and cross-review files appended to context.
 *
 * Per FSPEC-TF-05 step 8e: cross-review files are added to the context so
 * the author can see all reviewer feedback.
 */
export function buildRevisionInput(
  params: BuildRevisionInputParams,
): SkillActivityInput {
  const { creationPhase, agentId, featureSlug, featureConfig, crossReviewRefs } = params;

  const baseContextRefs = creationPhase.context_documents ?? [];
  const contextDocumentRefs = [...baseContextRefs, ...crossReviewRefs];

  return {
    agentId,
    featureSlug,
    phaseId: creationPhase.id,
    taskType: "Revise",
    documentType: creationPhase.id,
    contextDocumentRefs,
    featureConfig,
    forkJoin: false,
    isRevision: true,
  };
}

// ---------------------------------------------------------------------------
// Ad-Hoc Queue Helpers (pure functions, exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Find the first phase where `phase.agent === agentId`.
 *
 * Used to build SkillActivityInput for ad-hoc dispatch.
 * @see TSPEC-agent-coordination Section 6.4
 */
export function findAgentPhase(
  agentId: string,
  config: WorkflowConfig,
): PhaseDefinition | null {
  return config.phases.find((p) => p.agent === agentId) ?? null;
}

// ---------------------------------------------------------------------------
// Cascade Helpers (pure functions, exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Collect all `type: "review"` phases after the given agent's position.
 *
 * Finds the first phase where `phase.agent === agentId`, then returns
 * all subsequent phases with `type === "review"`.
 * Returns empty array if agent not found or no review phases follow.
 *
 * @see TSPEC-agent-coordination Section 6.3
 */
export function collectCascadePhases(
  agentId: string,
  config: WorkflowConfig,
): PhaseDefinition[] {
  const agentIndex = config.phases.findIndex((p) => p.agent === agentId);
  if (agentIndex === -1) return [];
  return config.phases.slice(agentIndex + 1).filter((p) => p.type === "review");
}

/**
 * Look up the creation phase that precedes a review phase by positional
 * convention: `phases[reviewIndex - 1]`.
 *
 * Returns the phase at `reviewIndex - 1` regardless of its type, documenting
 * the config constraint that creation phases must immediately precede their
 * review phases.
 *
 * Returns null if the review phase is not found or is at index 0 (no
 * preceding phase).
 *
 * @see TSPEC-agent-coordination Section 6.3 (BR-08 edge case)
 */
export function lookupCreationPhase(
  reviewPhase: PhaseDefinition,
  config: WorkflowConfig,
): PhaseDefinition | null {
  const reviewIndex = config.phases.findIndex((p) => p.id === reviewPhase.id);
  if (reviewIndex <= 0) return null;
  return config.phases[reviewIndex - 1];
}

// ---------------------------------------------------------------------------
// Temporal Activity Proxies
// ---------------------------------------------------------------------------

// Activity function types (must match the registration in worker.ts)
interface WorkflowActivities {
  invokeSkill(input: SkillActivityInput): Promise<SkillActivityResult>;
  mergeWorktree(input: MergeWorktreeInput): Promise<MergeResult>;
  sendNotification(input: NotificationInput): Promise<void>;
  resolveFeaturePath(input: ResolveFeaturePathInput): Promise<FeatureResolverResult>;
  promoteBacklogToInProgress(input: PromotionInput): Promise<PromotionResult>;
  promoteInProgressToCompleted(input: PromotionInput): Promise<PromotionResult>;
}

// Proxy activities — wired to the Temporal task queue at runtime.
// The timeout/retry config is per the TSPEC Section 5.1 and FSPEC BR-10.
const {
  invokeSkill,
  mergeWorktree,
  sendNotification,
  resolveFeaturePath,
  promoteBacklogToInProgress,
  promoteInProgressToCompleted,
} = wf.proxyActivities<WorkflowActivities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "120 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumInterval: "10 minutes",
  },
});

// ---------------------------------------------------------------------------
// Signal and Query definitions
// ---------------------------------------------------------------------------

const userAnswerSignal = wf.defineSignal<[UserAnswerSignal]>("user-answer");
const retryOrCancelSignal = wf.defineSignal<[RetryOrCancelSignal]>("retry-or-cancel");
const resumeOrCancelSignal = wf.defineSignal<[ResumeOrCancelSignal]>("resume-or-cancel");
const adHocRevisionSignal = wf.defineSignal<[AdHocRevisionSignal]>("ad-hoc-revision");

const workflowStateQuery = wf.defineQuery<FeatureWorkflowState>("workflow-state");

// ---------------------------------------------------------------------------
// D13: Query handler state — mutated by the workflow function
// ---------------------------------------------------------------------------

let _state: FeatureWorkflowState | null = null;

// ---------------------------------------------------------------------------
// D12: Failure Flow
// ---------------------------------------------------------------------------

async function handleFailureFlow(params: {
  state: FeatureWorkflowState;
  phaseId: string;
  agentId: string;
  errorType: string;
  errorMessage: string;
  workflowId: string;
}): Promise<"retry" | "cancel"> {
  const { state, phaseId, agentId, errorType, errorMessage, workflowId } = params;

  state.failureInfo = {
    phaseId,
    agentId,
    errorType,
    errorMessage,
    retryCount: (state.failureInfo?.retryCount ?? 0) + 1,
  };
  state.phaseStatus = "failed";
  _state = state;

  await sendNotification({
    type: "failure",
    featureSlug: state.featureSlug,
    phaseId,
    agentId,
    message: `Activity failed: [${errorType}] ${errorMessage}`,
    workflowId,
  });

  let action: RetryOrCancelSignal | null = null;
  wf.setHandler(retryOrCancelSignal, (signal) => { action = signal; });
  await wf.condition(() => action !== null);

  return action!;
}

// ---------------------------------------------------------------------------
// D4: Question Flow (ROUTE_TO_USER)
// ---------------------------------------------------------------------------

async function handleQuestionFlow(params: {
  state: FeatureWorkflowState;
  phase: PhaseDefinition;
  agentId: string;
  question: string;
  featureConfig: FeatureConfig;
  forkJoin: boolean;
  workflowId: string;
}): Promise<SkillActivityResult> {
  const { state, phase, agentId, question, featureConfig, forkJoin, workflowId } = params;

  // Record question and set waiting status
  state.pendingQuestion = {
    question,
    agentId,
    phaseId: phase.id,
    askedAt: new Date().toISOString(),
  };
  state.phaseStatus = "waiting-for-user";
  _state = state;

  // Notify user
  await sendNotification({
    type: "question",
    featureSlug: state.featureSlug,
    phaseId: phase.id,
    agentId,
    message: question,
    workflowId,
  });

  // Wait for user-answer Signal (BR-07: Temporal buffers signals)
  let receivedAnswer: UserAnswerSignal | null = null;

  wf.setHandler(userAnswerSignal, (signal) => {
    // BR-08: Only capture first valid answer; ignore subsequent signals once
    // the answer is set and we've exited the wait loop
    if (receivedAnswer === null) {
      if (!signal.answer) {
        // BR from FSPEC-TF-02 error scenarios: invalid answer — log and re-wait
        // We can't re-wait inside the handler, so we just don't set receivedAnswer
        return;
      }
      receivedAnswer = signal;
    }
  });

  await wf.condition(() => receivedAnswer !== null);

  // Clear pending question
  state.pendingQuestion = null;
  state.phaseStatus = "running";
  _state = state;

  // Re-invoke the same agent with the question and answer in context (BR-05)
  const reinvokeInput = buildInvokeSkillInput({
    phase,
    agentId,
    featureSlug: state.featureSlug,
    featureConfig,
    forkJoin,
    isRevision: false,
    priorQuestion: question,
    priorAnswer: receivedAnswer!.answer,
  });

  // Recursively handle — agent may ask another question (BR-06, nested questions)
  const result = await invokeSkill(reinvokeInput);

  if (result.routingSignalType === "ROUTE_TO_USER") {
    // Nested question — recurse
    return handleQuestionFlow({
      state,
      phase,
      agentId,
      question: result.question!,
      featureConfig,
      forkJoin,
      workflowId,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// D3: Single-Agent Dispatch
// ---------------------------------------------------------------------------

async function dispatchSingleAgent(params: {
  state: FeatureWorkflowState;
  phase: PhaseDefinition;
  agentId: string;
  forkJoin: boolean;
  isRevision: boolean;
  workflowId: string;
  priorQuestion?: string;
  priorAnswer?: string;
}): Promise<SkillActivityResult | "cancelled"> {
  const {
    state,
    phase,
    agentId,
    forkJoin,
    isRevision,
    workflowId,
    priorQuestion,
    priorAnswer,
  } = params;

  state.activeAgentIds = [agentId];
  _state = state;

  const input = buildInvokeSkillInput({
    phase,
    agentId,
    featureSlug: state.featureSlug,
    featureConfig: state.featureConfig,
    forkJoin,
    isRevision,
    priorQuestion,
    priorAnswer,
  });

  let result: SkillActivityResult;
  try {
    result = await invokeSkill(input);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const action = await handleFailureFlow({
      state,
      phaseId: phase.id,
      agentId,
      errorType: error.name,
      errorMessage: error.message,
      workflowId,
    });
    if (action === "cancel") return "cancelled";
    // Retry: re-dispatch from scratch
    return dispatchSingleAgent(params);
  }

  if (result.routingSignalType === "ROUTE_TO_USER") {
    // D4: Enter question flow
    return handleQuestionFlow({
      state,
      phase,
      agentId,
      question: result.question!,
      featureConfig: state.featureConfig,
      forkJoin,
      workflowId,
    });
  }

  // LGTM or TASK_COMPLETE — advance
  if (result.routingSignalType === "LGTM") {
    recordSignOff(state.signOffs, agentId, new Date().toISOString());
  }
  state.activeAgentIds = [];
  _state = state;
  return result;
}

// ---------------------------------------------------------------------------
// D5/D6/D7/D8: Fork/Join Dispatch
// ---------------------------------------------------------------------------

async function dispatchForkJoin(params: {
  state: FeatureWorkflowState;
  phase: PhaseDefinition;
  agents: string[];
  failurePolicy: "wait_for_all" | "fail_fast";
  workflowId: string;
}): Promise<"completed" | "cancelled"> {
  const { state, phase, agents, failurePolicy, workflowId } = params;

  // Initialize fork/join state
  const agentResults: Record<string, ForkJoinAgentResult> = {};
  for (const agentId of agents) {
    agentResults[agentId] = { status: "pending" };
  }
  state.forkJoinState = { agentResults, failurePolicy };
  state.activeAgentIds = [...agents];
  _state = state;

  // Build inputs for all agents (all with forkJoin: true per BR-04a)
  const inputs: Record<string, SkillActivityInput> = {};
  for (const agentId of agents) {
    inputs[agentId] = buildInvokeSkillInput({
      phase,
      agentId,
      featureSlug: state.featureSlug,
      featureConfig: state.featureConfig,
      forkJoin: true,
      isRevision: false,
    });
  }

  // D5: wait_for_all — all settle before we evaluate
  // D6: fail_fast — cancel remaining on first failure
  let results: Record<string, SkillActivityResult | Error>;

  if (failurePolicy === "fail_fast") {
    results = await dispatchForkJoinFailFast(agents, inputs);
  } else {
    results = await dispatchForkJoinWaitForAll(agents, inputs);
  }

  // Evaluate results
  const routeToUserAgents: string[] = [];
  let hasFailure = false;

  for (const agentId of agents) {
    const result = results[agentId];
    if (result instanceof Error) {
      agentResults[agentId] = {
        status: "failed",
        error: result.message,
      };
      hasFailure = true;
    } else if (result.routingSignalType === "ROUTE_TO_USER") {
      agentResults[agentId] = {
        status: "pending", // held, awaiting question answer
        worktreePath: result.worktreePath,
        routingSignal: "ROUTE_TO_USER",
      };
      routeToUserAgents.push(agentId);
    } else {
      // LGTM or TASK_COMPLETE
      agentResults[agentId] = {
        status: "success",
        worktreePath: result.worktreePath,
        routingSignal: result.routingSignalType,
      };
    }
  }

  _state = state;

  // Handle failures — no partial merges (BR-12)
  if (hasFailure) {
    // Clean up all worktrees (Activities that returned success hold worktrees — discard them)
    const allWorktreePaths: string[] = [];
    for (const agentId of agents) {
      const r = agentResults[agentId];
      if (r.worktreePath) allWorktreePaths.push(r.worktreePath);
    }
    for (const worktreePath of allWorktreePaths) {
      try {
        await mergeWorktree({
          worktreePath,
          featureBranch: "", // discard signal — empty featureBranch means cleanup only
          agentId: "",
          worktreeBranch: "",
          featureBranchWorktreePath: "",
        });
      } catch {
        // Best-effort cleanup — ignore errors
      }
    }

    // Notify user with per-agent results
    const summary = Object.entries(agentResults)
      .map(([id, r]) => `${id}: ${r.status}${r.error ? ` (${r.error})` : ""}`)
      .join(", ");

    const action = await handleFailureFlow({
      state,
      phaseId: phase.id,
      agentId: agents.join("+"),
      errorType: "ForkJoinFailure",
      errorMessage: `Fork/join failed. Per-agent results: ${summary}`,
      workflowId,
    });

    if (action === "cancel") return "cancelled";

    // D12 + BR-14: On retry, re-dispatch ALL agents (not just the failed ones)
    return dispatchForkJoin(params);
  }

  // D7: Handle ROUTE_TO_USER agents — process question flows sequentially
  if (routeToUserAgents.length > 0) {
    for (const agentId of routeToUserAgents) {
      const existingResult = results[agentId] as SkillActivityResult;
      const questionResult = await handleQuestionFlow({
        state,
        phase,
        agentId,
        question: existingResult.question!,
        featureConfig: state.featureConfig,
        forkJoin: true,
        workflowId,
      });
      // Re-invoke only the ROUTE_TO_USER agent
      const reinvokeResult = await invokeSkill(
        buildInvokeSkillInput({
          phase,
          agentId,
          featureSlug: state.featureSlug,
          featureConfig: state.featureConfig,
          forkJoin: true,
          isRevision: false,
        })
      );
      // Update the result
      if (reinvokeResult.routingSignalType === "LGTM" || reinvokeResult.routingSignalType === "TASK_COMPLETE") {
        if (reinvokeResult.routingSignalType === "LGTM") {
          recordSignOff(state.signOffs, agentId, new Date().toISOString());
        }
        agentResults[agentId] = {
          status: "success",
          worktreePath: reinvokeResult.worktreePath,
          routingSignal: reinvokeResult.routingSignalType,
        };
      }
    }
    _state = state;
  }

  // D8: All agents succeeded — sequential merge in config order (BR-13)
  const worktreePathsToMerge: { agentId: string; worktreePath: string }[] = [];
  for (const agentId of agents) {
    const r = agentResults[agentId];
    if (r.worktreePath) {
      worktreePathsToMerge.push({ agentId, worktreePath: r.worktreePath });
    }
  }

  // Sequential merge — record pre-merge SHA for rollback on conflict
  const mergedSoFar: string[] = [];
  for (const { agentId, worktreePath } of worktreePathsToMerge) {
    const mergeResult = await mergeWorktree({
      worktreePath,
      featureBranch: state.featureSlug,
      agentId,
      worktreeBranch: `worktree/${agentId}/${state.featureSlug}/${phase.id}`,
      featureBranchWorktreePath: "",
    });

    if (mergeResult === "conflict") {
      // D8: Conflict — rollback previously merged worktrees
      // (The mergeWorktree activity handles the actual git revert)
      for (const alreadyMerged of mergedSoFar) {
        // Attempt rollback (best effort — the activity throws non-retryable on conflict,
        // so we rely on the activity to handle the revert)
        try {
          await mergeWorktree({
            worktreePath: alreadyMerged,
            featureBranch: `__rollback__:${state.featureSlug}`,
            agentId: "",
            worktreeBranch: "",
            featureBranchWorktreePath: "",
          });
        } catch {
          // Rollback best-effort — ignore
        }
      }

      const action = await handleFailureFlow({
        state,
        phaseId: phase.id,
        agentId,
        errorType: "MergeConflict",
        errorMessage: `Merge conflict when merging ${agentId}'s worktree into ${state.featureSlug}`,
        workflowId,
      });

      if (action === "cancel") return "cancelled";
      // Retry — re-dispatch from scratch (BR-14)
      return dispatchForkJoin(params);
    }

    mergedSoFar.push(worktreePath);
  }

  // All merged successfully
  state.forkJoinState = null;
  state.activeAgentIds = [];
  _state = state;

  return "completed";
}

// ---------------------------------------------------------------------------
// Fork/join helpers: wait_for_all and fail_fast dispatch
// ---------------------------------------------------------------------------

async function dispatchForkJoinWaitForAll(
  agents: string[],
  inputs: Record<string, SkillActivityInput>,
): Promise<Record<string, SkillActivityResult | Error>> {
  const promises = agents.map(async (agentId) => {
    try {
      const result = await invokeSkill(inputs[agentId]);
      return { agentId, result };
    } catch (err: unknown) {
      return { agentId, result: err instanceof Error ? err : new Error(String(err)) };
    }
  });

  const settled = await Promise.allSettled(promises);
  const results: Record<string, SkillActivityResult | Error> = {};

  for (const s of settled) {
    if (s.status === "fulfilled") {
      results[s.value.agentId] = s.value.result;
    }
  }

  return results;
}

async function dispatchForkJoinFailFast(
  agents: string[],
  inputs: Record<string, SkillActivityInput>,
): Promise<Record<string, SkillActivityResult | Error>> {
  // Use CancellationScope for cooperative cancellation (D6 / BR-15)
  const results: Record<string, SkillActivityResult | Error> = {};

  await wf.CancellationScope.cancellable(async () => {
    const scope = wf.CancellationScope.current();

    const promises = agents.map(async (agentId) => {
      try {
        const result = await invokeSkill(inputs[agentId]);
        results[agentId] = result;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!(error instanceof wf.CancelledFailure)) {
          // First failure — cancel all remaining activities
          scope.cancel();
        }
        results[agentId] = error;
      }
    });

    await Promise.allSettled(promises);
  });

  return results;
}

// ---------------------------------------------------------------------------
// D9/D10/D11: Review Cycle
// ---------------------------------------------------------------------------

async function runReviewCycle(params: {
  state: FeatureWorkflowState;
  reviewPhase: PhaseDefinition;
  creationPhase: PhaseDefinition;
  authorAgentId: string;
  workflowId: string;
}): Promise<"approved" | "cancelled"> {
  const { state, reviewPhase, creationPhase, authorAgentId, workflowId } = params;

  // D9: Compute reviewers from discipline
  const reviewers = computeReviewerList(reviewPhase, state.featureConfig);
  const revisionBound = reviewPhase.revision_bound ?? 3;

  // Initialize or retrieve review state (preserve revisionCount across re-entries)
  if (!state.reviewStates[reviewPhase.id]) {
    state.reviewStates[reviewPhase.id] = {
      reviewerStatuses: {},
      revisionCount: 0,
    };
  }
  const reviewState = state.reviewStates[reviewPhase.id];

  // Reset statuses for this review round (BR-18: all reviewers re-review)
  reviewState.reviewerStatuses = {};
  for (const agentId of reviewers) {
    reviewState.reviewerStatuses[agentId] = "pending";
  }

  state.phaseStatus = "waiting-for-reviewers";
  state.activeAgentIds = [...reviewers];
  _state = state;

  // Dispatch reviewer Activities in parallel
  const reviewerResults: Record<string, SkillActivityResult | Error> = {};
  await Promise.allSettled(
    reviewers.map(async (reviewerId) => {
      const input = buildInvokeSkillInput({
        phase: reviewPhase,
        agentId: reviewerId,
        featureSlug: state.featureSlug,
        featureConfig: state.featureConfig,
        forkJoin: false,
        isRevision: false,
      });
      try {
        const result = await invokeSkill(input);
        reviewerResults[reviewerId] = result;
      } catch (err: unknown) {
        reviewerResults[reviewerId] = err instanceof Error ? err : new Error(String(err));
      }
    })
  );

  // Collect recommendations
  let anyRevisionRequested = false;
  for (const reviewerId of reviewers) {
    const result = reviewerResults[reviewerId];
    if (result instanceof Error) {
      // Activity failure for reviewer — enter failure flow
      const action = await handleFailureFlow({
        state,
        phaseId: reviewPhase.id,
        agentId: reviewerId,
        errorType: result.name,
        errorMessage: result.message,
        workflowId,
      });
      if (action === "cancel") return "cancelled";
      // Retry the whole review cycle
      return runReviewCycle(params);
    }

    // Parse recommendation from result
    // The routingSignalType encodes the recommendation in the reviewer output
    // (convention: reviewer Activity returns the recommendation in routingSignalType
    //  when it's a review phase, or we parse from the artifact changes)
    // For now, we use the routingSignalType as the recommendation proxy
    // (the real parsing would read the cross-review file, done in Phase G integration)
    const status = mapRecommendationToStatus(result.routingSignalType);
    if (status === null) {
      // Unrecognized recommendation — treat as failure (parse error)
      const action = await handleFailureFlow({
        state,
        phaseId: reviewPhase.id,
        agentId: reviewerId,
        errorType: "RecommendationParseError",
        errorMessage: `Unrecognized recommendation: ${result.routingSignalType}`,
        workflowId,
      });
      if (action === "cancel") return "cancelled";
      return runReviewCycle(params);
    }

    reviewState.reviewerStatuses[reviewerId] = status;
    if (status === "revision_requested") anyRevisionRequested = true;
  }

  _state = state;

  // Evaluate outcome
  if (!anyRevisionRequested) {
    // All approved — advance
    return "approved";
  }

  // D10: Revision loop
  reviewState.revisionCount += 1;

  // D11: Check revision bound
  if (reviewState.revisionCount > revisionBound) {
    // Notify user and wait for resume-or-cancel signal
    await sendNotification({
      type: "revision-bound",
      featureSlug: state.featureSlug,
      phaseId: reviewPhase.id,
      agentId: authorAgentId,
      message: `Feature '${state.featureSlug}' has exceeded the maximum of ${revisionBound} revision cycles in phase ${reviewPhase.id}.`,
      workflowId,
    });

    let resumeAction: ResumeOrCancelSignal | null = null;
    wf.setHandler(resumeOrCancelSignal, (signal) => { resumeAction = signal; });
    await wf.condition(() => resumeAction !== null);

    if (resumeAction === "cancel") return "cancelled";
    // "resume" — continue with another revision despite bound exceeded
  }

  // D10: Dispatch author for revision
  const crossReviewRefs = reviewState.reviewerStatuses
    ? Object.keys(reviewState.reviewerStatuses)
        .filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")
        .map((id) => `${state.featurePath}CROSS-REVIEW-${id}-${creationPhase.id}.md`)
    : [];

  const revisionInput = buildRevisionInput({
    creationPhase,
    agentId: authorAgentId,
    featureSlug: state.featureSlug,
    featureConfig: state.featureConfig,
    crossReviewRefs,
  });

  state.activeAgentIds = [authorAgentId];
  state.phaseStatus = "running";
  _state = state;

  try {
    await invokeSkill(revisionInput);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const action = await handleFailureFlow({
      state,
      phaseId: creationPhase.id,
      agentId: authorAgentId,
      errorType: error.name,
      errorMessage: error.message,
      workflowId,
    });
    if (action === "cancel") return "cancelled";
  }

  // Re-enter review cycle (all reviewerStatuses reset at top of function — BR-18)
  return runReviewCycle(params);
}

// ---------------------------------------------------------------------------
// D2/D13: Main Workflow Function
// ---------------------------------------------------------------------------

export async function featureLifecycleWorkflow(
  params: StartWorkflowParams,
): Promise<void> {
  const { featureSlug, featureConfig, workflowConfig, startAtPhase, initialReviewState } = params;

  // D2: Snapshot workflowConfig into workflow state (REQ-CD-04)
  const state = buildInitialWorkflowState({
    featureSlug,
    featureConfig,
    workflowConfig,
    startedAt: new Date().toISOString(),
    startAtPhase,
    initialReviewState,
  });

  _state = state;

  // D13: Register Query handler
  wf.setHandler(workflowStateQuery, () => _state!);

  // ── Task 47: Ad-hoc revision signal handler ──
  // Enqueue incoming ad-hoc signals for later processing at phase transitions.
  wf.setHandler(adHocRevisionSignal, (signal) => {
    state.adHocQueue.push(signal);
  });

  // Get workflow ID for notification routing
  const workflowInfo = wf.workflowInfo();
  const workflowId = workflowInfo.workflowId;
  const runId = workflowInfo.runId;
  const featureBranch = `feat-${featureSlug}`;

  // ── Task 50/51: drainAdHocQueue — process pending ad-hoc signals ──
  // Called at each phase transition and before workflow termination.
  // Processes signals FIFO, dispatching the target agent and running
  // downstream cascade for each completed ad-hoc dispatch.
  async function drainAdHocQueue(): Promise<void> {
    while (state.adHocQueue.length > 0) {
      state.adHocInProgress = true;
      const signal = state.adHocQueue.shift()!;

      // Find agent's phase to build correct SkillActivityInput
      const agentPhase = findAgentPhase(signal.targetAgentId, workflowConfig);
      if (!agentPhase) {
        // Agent not found in workflow phases — skip this signal
        continue;
      }

      // Ad-hoc dispatch: reuse dispatchSingleAgent with adHocInstruction
      const input = buildInvokeSkillInput({
        phase: agentPhase,
        agentId: signal.targetAgentId,
        featureSlug: state.featureSlug,
        featureConfig: state.featureConfig,
        forkJoin: false,
        isRevision: true,
      });
      // Thread through the ad-hoc instruction
      input.adHocInstruction = signal.instruction;

      const result = await dispatchSingleAgent({
        state,
        phase: agentPhase,
        agentId: signal.targetAgentId,
        forkJoin: false,
        isRevision: true,
        workflowId,
      });

      if (result !== "cancelled") {
        // Task 51: Execute downstream cascade after ad-hoc agent completes
        await executeCascade(signal.targetAgentId, state, workflowConfig, workflowId);
      }

      state.adHocInProgress = false;
    }
  }

  // ── Task 51: executeCascade — run downstream review phases after ad-hoc ──
  async function executeCascade(
    revisedAgentId: string,
    st: FeatureWorkflowState,
    config: WorkflowConfig,
    wfId: string,
  ): Promise<void> {
    const cascadePhases = collectCascadePhases(revisedAgentId, config);
    if (cascadePhases.length === 0) return;

    for (const reviewPhase of cascadePhases) {
      // Check skip_if
      if (reviewPhase.skip_if && evaluateSkipCondition(reviewPhase.skip_if, st.featureConfig)) {
        continue;
      }

      // Find creation phase (positional convention: phases[reviewIndex - 1])
      const creationPhase = lookupCreationPhase(reviewPhase, config);
      if (!creationPhase) {
        // Review phase at index 0 or not found — skip (config error)
        continue;
      }
      const authorAgentId = creationPhase.agent ?? creationPhase.agents?.[0] ?? "pm";

      // Run review cycle (reuses existing runReviewCycle)
      const outcome = await runReviewCycle({
        state: st,
        reviewPhase,
        creationPhase,
        authorAgentId,
        workflowId: wfId,
      });

      if (outcome === "cancelled") return;
    }
  }

  // ── E10: Resolve feature path at workflow start ──────────────────────
  // Uses the FeatureResolver activity to locate the feature folder across
  // lifecycle directories. Stores result in state for all subsequent phases.
  if (state.featurePath === null) {
    const resolveResult = await resolveFeaturePath({
      featureSlug,
      worktreeRoot: ".",  // main working tree root
    });

    if (resolveResult.found) {
      state.featurePath = resolveResult.path;

      // ── E8: Auto-promote from backlog if needed ────────────────────
      if (needsBacklogPromotion(resolveResult.lifecycle)) {
        const promotionResult = await promoteBacklogToInProgress({
          featureSlug,
          featureBranch,
          workflowId,
          runId,
        });
        state.featurePath = promotionResult.featurePath;
      }
    }

    _state = state;
  }

  // D2: Main workflow loop — iterate through phases
  while (true) {
    const currentPhaseId = state.currentPhaseId;
    const currentPhase = workflowConfig.phases.find((p) => p.id === currentPhaseId);

    if (!currentPhase) {
      throw new Error(`Phase '${currentPhaseId}' not found in workflow config`);
    }

    // D2: Evaluate skip_if on current phase
    if (
      currentPhase.skip_if &&
      evaluateSkipCondition(currentPhase.skip_if, featureConfig)
    ) {
      // Skip this phase — advance to next without dispatching
      const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
      if (nextPhaseId === null) break; // workflow complete
      state.completedPhaseIds.push(currentPhaseId);
      state.currentPhaseId = nextPhaseId;
      state.phaseStatus = "running";
      _state = state;
      continue;
    }

    // Determine phase type and dispatch accordingly
    if (currentPhase.type === "approved") {
      // D2: Auto-transition — approved phases do not dispatch any Activity
      const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
      state.completedPhaseIds.push(currentPhaseId);
      if (nextPhaseId === null) break; // workflow complete
      state.currentPhaseId = nextPhaseId;
      state.phaseStatus = "running";
      _state = state;
      continue;
    }

    if (currentPhase.type === "review") {
      // D9: Review cycle
      const reviewers = computeReviewerList(currentPhase, featureConfig);

      // Find the corresponding creation phase to dispatch for revision
      // By convention, creation phase is the one immediately before the review
      const reviewIndex = workflowConfig.phases.findIndex((p) => p.id === currentPhaseId);
      const creationPhase =
        reviewIndex > 0 ? workflowConfig.phases[reviewIndex - 1] : currentPhase;

      const authorAgentId =
        creationPhase.agent ??
        (creationPhase.agents && creationPhase.agents[0]) ??
        "pm";

      const outcome = await runReviewCycle({
        state,
        reviewPhase: currentPhase,
        creationPhase,
        authorAgentId,
        workflowId,
      });

      if (outcome === "cancelled") return;

      // Task 50: Drain ad-hoc queue before advancing phase
      await drainAdHocQueue();

      // All reviewers approved — advance to approved phase
      state.completedPhaseIds.push(currentPhaseId);
      const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
      if (nextPhaseId === null) break;
      state.currentPhaseId = nextPhaseId;
      state.phaseStatus = "running";
      state.activeAgentIds = [];
      _state = state;
      continue;
    }

    if (currentPhase.agents && currentPhase.agents.length > 0) {
      // D5/D6/D7/D8: Fork/join dispatch
      const failurePolicy = currentPhase.failure_policy ?? "wait_for_all";
      const outcome = await dispatchForkJoin({
        state,
        phase: currentPhase,
        agents: currentPhase.agents,
        failurePolicy,
        workflowId,
      });

      if (outcome === "cancelled") return;

      // Task 50: Drain ad-hoc queue before advancing phase
      await drainAdHocQueue();

      // Advance to next phase
      state.completedPhaseIds.push(currentPhaseId);
      const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
      if (nextPhaseId === null) break;
      state.currentPhaseId = nextPhaseId;
      state.phaseStatus = "running";
      _state = state;
      continue;
    }

    if (currentPhase.agent) {
      // D3: Single-agent dispatch
      const result = await dispatchSingleAgent({
        state,
        phase: currentPhase,
        agentId: currentPhase.agent,
        forkJoin: false,
        isRevision: false,
        workflowId,
      });

      if (result === "cancelled") return;

      // Task 50: Drain ad-hoc queue before advancing phase
      await drainAdHocQueue();

      // Advance to next phase
      state.completedPhaseIds.push(currentPhaseId);
      const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
      if (nextPhaseId === null) break;
      state.currentPhaseId = nextPhaseId;
      state.phaseStatus = "running";
      _state = state;
      continue;
    }

    // Phase has neither agent, agents, nor is approved/review — skip it
    const nextPhaseId = resolveNextPhase(currentPhaseId, workflowConfig, featureConfig);
    state.completedPhaseIds.push(currentPhaseId);
    if (nextPhaseId === null) break;
    state.currentPhaseId = nextPhaseId;
    state.phaseStatus = "running";
    _state = state;
  }

  // Task 52: Drain remaining ad-hoc queue signals before workflow termination
  await drainAdHocQueue();

  // ── E7: Completion promotion — trigger when both qa + pm have signed off ──
  if (isCompletionReady(state.signOffs) && state.featurePath !== null) {
    const completionResult = await promoteInProgressToCompleted({
      featureSlug,
      featureBranch,
      workflowId,
      runId,
    });
    state.featurePath = completionResult.featurePath;
    _state = state;
  }

  // Workflow complete
  state.phaseStatus = "completed";
  _state = state;
}
