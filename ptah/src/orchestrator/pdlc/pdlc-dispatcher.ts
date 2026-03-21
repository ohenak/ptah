import {
  type PdlcPhase,
  PdlcPhase as Phase,
  type FeatureConfig,
  type FeatureState,
  type PdlcStateFile,
  type DispatchAction,
  type AgentDispatch,
  type SideEffect,
  type DocumentType,
  type TaskType,
  UnknownFeatureError,
} from "./phases.js";
import { createFeatureState, transition } from "./state-machine.js";
import type { StateStore } from "./state-store.js";
import {
  computeReviewerManifest,
  reviewerKey,
  initializeReviewPhaseState,
} from "./review-tracker.js";
import { parseRecommendation, agentIdToSkillName, crossReviewPath } from "./cross-review-parser.js";
import { getContextDocuments } from "./context-matrix.js";
import type { FileSystem } from "../../services/filesystem.js";
import type { Logger } from "../../services/logger.js";

export interface PdlcDispatcher {
  isManaged(featureSlug: string): Promise<boolean>;
  getFeatureState(featureSlug: string): Promise<FeatureState | null>;
  initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState>;
  processAgentCompletion(params: {
    featureSlug: string;
    agentId: string;
    signal: "LGTM" | "TASK_COMPLETE";
    worktreePath: string;
  }): Promise<DispatchAction>;
  processReviewCompletion(params: {
    featureSlug: string;
    reviewerAgentId: string;
    reviewerScope?: string;
    worktreePath: string;
  }): Promise<DispatchAction>;
  getNextAction(featureSlug: string): Promise<DispatchAction>;
  processResumeFromBound(featureSlug: string): Promise<DispatchAction>;
  loadState(): Promise<void>;
}

// Phase classification helpers
const CREATION_PHASES = new Set<PdlcPhase>([
  Phase.REQ_CREATION,
  Phase.FSPEC_CREATION,
  Phase.TSPEC_CREATION,
  Phase.PLAN_CREATION,
  Phase.PROPERTIES_CREATION,
]);

const REVIEW_PHASES = new Set<PdlcPhase>([
  Phase.REQ_REVIEW,
  Phase.FSPEC_REVIEW,
  Phase.TSPEC_REVIEW,
  Phase.PLAN_REVIEW,
  Phase.PROPERTIES_REVIEW,
  Phase.IMPLEMENTATION_REVIEW,
]);

const APPROVED_PHASES = new Set<PdlcPhase>([
  Phase.REQ_APPROVED,
  Phase.FSPEC_APPROVED,
  Phase.TSPEC_APPROVED,
  Phase.PLAN_APPROVED,
  Phase.PROPERTIES_APPROVED,
]);

const FORK_JOIN_PHASES = new Set<PdlcPhase>([
  Phase.TSPEC_CREATION,
  Phase.PLAN_CREATION,
  Phase.IMPLEMENTATION,
]);

function phaseToDocumentType(phase: PdlcPhase): DocumentType {
  if (phase === Phase.REQ_CREATION || phase === Phase.REQ_REVIEW) return "REQ";
  if (phase === Phase.FSPEC_CREATION || phase === Phase.FSPEC_REVIEW) return "FSPEC";
  if (phase === Phase.TSPEC_CREATION || phase === Phase.TSPEC_REVIEW) return "TSPEC";
  if (phase === Phase.PLAN_CREATION || phase === Phase.PLAN_REVIEW) return "PLAN";
  if (phase === Phase.PROPERTIES_CREATION || phase === Phase.PROPERTIES_REVIEW) return "PROPERTIES";
  if (phase === Phase.IMPLEMENTATION || phase === Phase.IMPLEMENTATION_REVIEW) return "IMPLEMENTATION";
  return "";
}

export function phaseToAgentId(phase: PdlcPhase, config: FeatureConfig): string {
  switch (phase) {
    case Phase.REQ_CREATION:
    case Phase.FSPEC_CREATION:
      return "pm";
    case Phase.TSPEC_CREATION:
    case Phase.PLAN_CREATION:
      return config.discipline === "frontend-only" ? "fe" : "eng";
    case Phase.IMPLEMENTATION:
      if (config.useTechLead) return "tl";
      return config.discipline === "frontend-only" ? "fe" : "eng";
    case Phase.PROPERTIES_CREATION:
      return "qa";
    default:
      return "eng";
  }
}

function phaseToTaskType(phase: PdlcPhase): TaskType {
  if (phase === Phase.IMPLEMENTATION) return "Implement";
  return "Create";
}

function isCreationPhase(phase: PdlcPhase): boolean {
  return CREATION_PHASES.has(phase);
}

function isReviewPhase(phase: PdlcPhase): boolean {
  return REVIEW_PHASES.has(phase);
}

function isApprovedPhase(phase: PdlcPhase): boolean {
  return APPROVED_PHASES.has(phase);
}

export function isForkJoinPhase(phase: PdlcPhase, config: FeatureConfig): boolean {
  if (config.useTechLead && phase === Phase.IMPLEMENTATION) return false;
  return config.discipline === "fullstack" && FORK_JOIN_PHASES.has(phase);
}

/** Build the expected artifact path for a given phase and feature */
function expectedArtifactPath(
  docsRoot: string,
  featureSlug: string,
  phase: PdlcPhase,
): string | null {
  const docType = phaseToDocumentType(phase);
  if (!docType) return null; // IMPLEMENTATION has no artifact to validate

  const parts = featureSlug.split("-");
  const prefix = parts[0];
  const featureName = parts.slice(1).join("-");
  return `${docsRoot}/${featureSlug}/${prefix}-${docType}-${featureName}.md`;
}

export class DefaultPdlcDispatcher implements PdlcDispatcher {
  private state: PdlcStateFile | null = null;

  constructor(
    private readonly stateStore: StateStore,
    private readonly fs: FileSystem,
    private readonly logger: Logger,
    private readonly docsRoot: string,
  ) {}

  async loadState(): Promise<void> {
    this.state = await this.stateStore.load();
  }

  async isManaged(featureSlug: string): Promise<boolean> {
    this.ensureLoaded();
    return featureSlug in this.state!.features;
  }

  async getFeatureState(featureSlug: string): Promise<FeatureState | null> {
    this.ensureLoaded();
    return this.state!.features[featureSlug] ?? null;
  }

  async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
    this.ensureLoaded();
    // Idempotency guard: if a state record already exists, return it without modification (REQ-PI-05)
    const existing = this.state!.features[slug];
    if (existing) {
      this.logger.debug(
        `[ptah] PDLC auto-init skipped: "${slug}" already initialized (concurrent request)`
      );
      return existing;
    }
    const now = new Date().toISOString();
    const featureState = createFeatureState(slug, config, now);
    this.state!.features[slug] = featureState;
    await this.stateStore.save(this.state!);
    return featureState;
  }

  async processAgentCompletion(params: {
    featureSlug: string;
    agentId: string;
    signal: "LGTM" | "TASK_COMPLETE";
    worktreePath: string;
  }): Promise<DispatchAction> {
    this.ensureLoaded();
    const featureState = this.getFeatureOrThrow(params.featureSlug);
    const { phase, config } = featureState;

    // TASK_COMPLETE in non-terminal phase treated as LGTM
    let signal = params.signal;
    if (signal === "TASK_COMPLETE" && phase !== Phase.DONE) {
      this.logger.warn(`Agent returned TASK_COMPLETE in non-terminal phase ${phase}, treating as LGTM`);
      signal = "LGTM";
    }

    // Determine event type based on fork/join
    const isForked = isForkJoinPhase(phase, config);

    // Artifact validation (skip for IMPLEMENTATION phase)
    if (phase !== Phase.IMPLEMENTATION) {
      const worktreeDocsRoot = this.docsRoot.replace(/^(?:\.\.\/)+/, "");
      const artifactPath = expectedArtifactPath(worktreeDocsRoot, params.featureSlug, phase);
      if (artifactPath) {
        // Check worktree first; if worktree was already cleaned up (no-changes path),
        // fall back to checking the main repo via docsRoot relative to cwd.
        const worktreePath = `${params.worktreePath}/${artifactPath}`;
        const mainRepoPath = this.fs.joinPath(this.docsRoot, params.featureSlug,
          artifactPath.split("/").pop()!);
        const worktreeExists = await this.fs.exists(worktreePath);
        const mainRepoExists = !worktreeExists && await this.fs.exists(mainRepoPath);
        const exists = worktreeExists || mainRepoExists;
        this.logger.info(
          `[artifact-check] artifactPath="${artifactPath}" worktreePath="${worktreePath}" ` +
          `worktreeExists=${worktreeExists} mainRepoPath="${mainRepoPath}" mainRepoExists=${mainRepoExists}`,
        );
        if (!exists) {
          return {
            action: "retry_agent",
            reason: "artifact_missing",
            message: `Expected artifact at ${artifactPath} not found`,
          };
        }
      }
    }

    // Build event
    const now = new Date().toISOString();
    let event;
    if (isForked) {
      event = { type: "subtask_complete" as const, agentId: params.agentId };
    } else {
      event = { type: "lgtm" as const, agentId: params.agentId };
    }

    // Transition
    const result = transition(featureState, event, now);

    // Persist
    this.state!.features[params.featureSlug] = result.newState;
    await this.stateStore.save(this.state!);

    // Process side effects
    return this.processSideEffects(result.sideEffects, result.newState);
  }

  async processReviewCompletion(params: {
    featureSlug: string;
    reviewerAgentId: string;
    reviewerScope?: string;
    worktreePath: string;
  }): Promise<DispatchAction> {
    this.ensureLoaded();
    const featureState = this.getFeatureOrThrow(params.featureSlug);
    const { phase } = featureState;

    // Determine the document type from the current phase
    const docType = phaseToDocumentType(phase);

    // Get the skill name for this agent
    const skillName = agentIdToSkillName(params.reviewerAgentId);
    if (!skillName) {
      return {
        action: "pause",
        reason: "unknown_agent",
        message: `Unknown agent ID: ${params.reviewerAgentId}`,
      };
    }

    // Determine cross-review file path
    const reviewFilePath = crossReviewPath(params.featureSlug, skillName, docType);
    const worktreeFullPath = `${params.worktreePath}/${reviewFilePath}`;
    // Fallback: if worktree was cleaned up (no-changes path), read from main repo
    const mainRepoFullPath = this.fs.joinPath(this.docsRoot, params.featureSlug,
      reviewFilePath.split("/").pop()!);

    // Read cross-review file (try worktree first, then main repo)
    let fileContent: string;
    try {
      fileContent = await this.fs.readFile(worktreeFullPath);
    } catch {
      try {
        fileContent = await this.fs.readFile(mainRepoFullPath);
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === "ENOENT" || error.message?.includes("ENOENT")) {
          return {
            action: "pause",
            reason: "file_missing",
            message: `Cross-review file not found: ${reviewFilePath}. The reviewer agent did not produce the expected cross-review document.`,
          };
        }
        throw err;
      }
    }

    // Parse recommendation
    const parsed = parseRecommendation(fileContent);

    if (parsed.status === "parse_error") {
      if (parsed.reason === "No Recommendation heading found") {
        return {
          action: "pause",
          reason: "no_recommendation",
          message: `Cross-review file ${reviewFilePath} does not contain a Recommendation heading. The reviewer must include a "## Recommendation" section.`,
        };
      }
      return {
        action: "pause",
        reason: "unrecognized_recommendation",
        message: `Cross-review file ${reviewFilePath} contains an unrecognized recommendation: "${parsed.rawValue ?? ""}". Valid values: "Approved", "Approved with minor changes", "Needs revision".`,
      };
    }

    // Build reviewer key
    const rKey = params.reviewerScope
      ? `${params.reviewerAgentId}:${params.reviewerScope}`
      : params.reviewerAgentId;

    // Build review_submitted event
    const now = new Date().toISOString();
    const event = {
      type: "review_submitted" as const,
      reviewerKey: rKey,
      recommendation: parsed.status as "approved" | "revision_requested",
    };

    // Transition
    const result = transition(featureState, event, now);

    // Persist
    this.state!.features[params.featureSlug] = result.newState;
    await this.stateStore.save(this.state!);

    // Process side effects
    return this.processSideEffects(result.sideEffects, result.newState);
  }

  async getNextAction(featureSlug: string): Promise<DispatchAction> {
    this.ensureLoaded();
    const featureState = this.getFeatureOrThrow(featureSlug);
    const { phase, config } = featureState;

    if (phase === Phase.DONE) {
      return { action: "done" };
    }

    if (isCreationPhase(phase) || phase === Phase.IMPLEMENTATION) {
      // Dispatch creation agent(s)
      const agents: AgentDispatch[] = [];
      const docType = phaseToDocumentType(phase);
      const taskType = phaseToTaskType(phase);
      const isRevision = (featureState.reviewPhases[this.correspondingReviewPhase(phase)]?.revisionCount ?? 0) > 0;

      if (isForkJoinPhase(phase, config)) {
        // Check which subtasks are still pending
        const forkJoin = featureState.forkJoin;
        for (const agentId of ["eng", "fe"]) {
          if (!forkJoin || forkJoin.subtasks[agentId] === "pending") {
            agents.push({
              agentId,
              taskType: isRevision ? "Revise" : taskType,
              documentType: docType,
              contextDocuments: getContextDocuments(phase, featureSlug, config, { isRevision }),
            });
          }
        }
      } else {
        const agentId = phaseToAgentId(phase, config);
        agents.push({
          agentId,
          taskType: isRevision ? "Revise" : taskType,
          documentType: docType,
          contextDocuments: getContextDocuments(phase, featureSlug, config, { isRevision }),
        });
      }

      return { action: "dispatch", agents };
    }

    if (isReviewPhase(phase)) {
      // Dispatch pending reviewers
      const reviewState = featureState.reviewPhases[phase];
      if (!reviewState) {
        // Initialize review state if missing
        const manifest = computeReviewerManifest(phase, config.discipline);
        const rState = initializeReviewPhaseState(manifest);

        // Persist the initialized review state
        featureState.reviewPhases[phase] = rState;
        this.state!.features[featureSlug] = featureState;
        await this.stateStore.save(this.state!);

        return this.buildReviewDispatch(phase, rState, featureSlug, config);
      }

      return this.buildReviewDispatch(phase, reviewState, featureSlug, config);
    }

    if (isApprovedPhase(phase)) {
      // Auto-transition
      const now = new Date().toISOString();
      const event = { type: "auto" as const };
      const result = transition(featureState, event, now);

      this.state!.features[featureSlug] = result.newState;
      await this.stateStore.save(this.state!);

      return this.processSideEffects(result.sideEffects, result.newState);
    }

    return { action: "wait" };
  }

  async processResumeFromBound(featureSlug: string): Promise<DispatchAction> {
    this.ensureLoaded();
    const featureState = this.getFeatureOrThrow(featureSlug);
    const { phase, config } = featureState;

    if (!isReviewPhase(phase)) {
      return {
        action: "pause",
        reason: "invalid_phase",
        message: `Cannot resume from bound: feature ${featureSlug} is not in a review phase (current: ${phase})`,
      };
    }

    const reviewState = featureState.reviewPhases[phase];
    if (!reviewState) {
      return {
        action: "pause",
        reason: "no_review_state",
        message: `No review state for phase ${phase}`,
      };
    }

    // Reset revision count and reviewer statuses
    const resetStatuses: Record<string, "pending"> = {};
    for (const key of Object.keys(reviewState.reviewerStatuses)) {
      resetStatuses[key] = "pending";
    }

    const newReviewState = {
      reviewerStatuses: resetStatuses,
      revisionCount: 0,
    };

    featureState.reviewPhases[phase] = newReviewState;
    featureState.updatedAt = new Date().toISOString();
    this.state!.features[featureSlug] = featureState;
    await this.stateStore.save(this.state!);

    return this.buildReviewDispatch(phase, newReviewState, featureSlug, config);
  }

  // --- Private helpers ---

  private ensureLoaded(): void {
    if (!this.state) {
      throw new Error("State not loaded. Call loadState() first.");
    }
  }

  private getFeatureOrThrow(slug: string): FeatureState {
    this.ensureLoaded();
    const feature = this.state!.features[slug];
    if (!feature) {
      throw new UnknownFeatureError(slug);
    }
    return feature;
  }

  private correspondingReviewPhase(phase: PdlcPhase): PdlcPhase {
    const map: Partial<Record<PdlcPhase, PdlcPhase>> = {
      [Phase.REQ_CREATION]: Phase.REQ_REVIEW,
      [Phase.FSPEC_CREATION]: Phase.FSPEC_REVIEW,
      [Phase.TSPEC_CREATION]: Phase.TSPEC_REVIEW,
      [Phase.PLAN_CREATION]: Phase.PLAN_REVIEW,
      [Phase.PROPERTIES_CREATION]: Phase.PROPERTIES_REVIEW,
      [Phase.IMPLEMENTATION]: Phase.IMPLEMENTATION_REVIEW,
    };
    return map[phase] ?? phase;
  }

  private buildReviewDispatch(
    phase: PdlcPhase,
    reviewState: { reviewerStatuses: Record<string, string> },
    featureSlug: string,
    config: FeatureConfig,
  ): DispatchAction {
    const pendingReviewers = Object.entries(reviewState.reviewerStatuses)
      .filter(([, status]) => status === "pending")
      .map(([key]) => key);

    if (pendingReviewers.length === 0) {
      return { action: "wait" };
    }

    const docType = phaseToDocumentType(phase);
    const agents: AgentDispatch[] = pendingReviewers.map(rKey => {
      const parts = rKey.split(":");
      const agentId = parts[0];
      return {
        agentId,
        taskType: "Review" as TaskType,
        documentType: docType,
        contextDocuments: getContextDocuments(phase, featureSlug, config),
      };
    });

    return { action: "dispatch", agents };
  }

  private async processSideEffects(
    sideEffects: SideEffect[],
    featureState: FeatureState,
  ): Promise<DispatchAction> {
    const agents: AgentDispatch[] = [];
    const { slug, config, phase } = featureState;

    for (const effect of sideEffects) {
      switch (effect.type) {
        case "dispatch_agent": {
          const isRevision = effect.taskType === "Revise" || effect.taskType === "Resubmit";
          const contextDocs = getContextDocuments(phase, slug, config, { isRevision });
          agents.push({
            agentId: effect.agentId,
            taskType: effect.taskType,
            documentType: effect.documentType,
            contextDocuments: contextDocs,
          });
          break;
        }

        case "dispatch_reviewers": {
          const docType = phaseToDocumentType(phase);
          for (const rKey of effect.reviewerKeys) {
            const parts = rKey.split(":");
            const agentId = parts[0];
            agents.push({
              agentId,
              taskType: "Review",
              documentType: docType,
              contextDocuments: getContextDocuments(phase, slug, config),
            });
          }
          break;
        }

        case "pause_feature":
          return {
            action: "pause",
            reason: effect.reason,
            message: effect.message,
          };

        case "auto_transition": {
          // Recursively process the auto-transition
          const now = new Date().toISOString();
          const autoEvent = { type: "auto" as const };
          const result = transition(featureState, autoEvent, now);

          // Persist
          this.state!.features[slug] = result.newState;
          await this.stateStore.save(this.state!);

          return this.processSideEffects(result.sideEffects, result.newState);
        }

        case "log_warning":
          this.logger.warn(effect.message);
          break;
      }
    }

    if (agents.length > 0) {
      return { action: "dispatch", agents };
    }

    // If the feature reached DONE, return done
    if (featureState.phase === Phase.DONE) {
      return { action: "done" };
    }

    // No dispatch actions (e.g., partial fork/join completion)
    return { action: "wait" };
  }
}
