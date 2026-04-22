/**
 * TemporalOrchestrator — Phase E (015-temporal-foundation)
 *
 * Simplified orchestrator that delegates feature lifecycle management to Temporal.
 * Replaces PdlcDispatcher, ThreadQueue, InvocationGuard, QuestionStore, QuestionPoller,
 * ThreadStateManager with TemporalClientWrapper + in-process Worker.
 *
 * Responsibilities:
 *  1. Startup: connect Temporal client, prune orphaned worktrees
 *  2. Shutdown: shut down Worker, disconnect Temporal client
 *  3. Start Temporal Workflows when a new feature is initiated (E1)
 *  4. Route user-answer Signals from Discord to Temporal (E2)
 *  5. Route retry-or-cancel and resume-or-cancel Signals from Discord (E3)
 */

import type { Worker } from "@temporalio/worker";
import type { DiscordClient } from "../services/discord.js";
import type { GitClient } from "../services/git.js";
import type { Logger } from "../services/logger.js";
import type { PtahConfig, ThreadMessage } from "../types.js";
import type { WorkflowConfig } from "../config/workflow-config.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { SkillInvoker } from "./skill-invoker.js";
import type { TemporalClientWrapper } from "../temporal/client.js";
import type { PhaseDetector, PhaseDetectionResult } from "./phase-detector.js";
import type { StartWorkflowParams, UserAnswerSignal, FeatureWorkflowState, PhaseStatus } from "../temporal/types.js";
import type { FeatureConfig } from "../types.js";
import { parseAdHocDirective } from "./ad-hoc-parser.js";
import { extractFeatureName, featureNameToSlug, featureBranchName } from "./feature-branch.js";

// ---------------------------------------------------------------------------
// Pure function: parseUserIntent (FSPEC-DR-03)
// ---------------------------------------------------------------------------

export type UserIntent = "retry" | "cancel" | "resume";

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: UserIntent }> = [
  { pattern: /\bretry\b/i, intent: "retry" },
  { pattern: /\bcancel\b/i, intent: "cancel" },
  { pattern: /\bresume\b/i, intent: "resume" },
];

/**
 * Parse the first recognized intent keyword from a message.
 * Returns null if no keyword is found.
 *
 * Per FSPEC-DR-03 BR-DR-10/11/12:
 * - Standalone word matching (word boundary regex)
 * - Case-insensitive
 * - First match wins by position in the message
 */
export function parseUserIntent(content: string): UserIntent | null {
  let earliest: { intent: UserIntent; index: number } | null = null;

  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = pattern.exec(content);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { intent, index: match.index };
    }
  }

  return earliest?.intent ?? null;
}

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface TemporalOrchestratorDeps {
  temporalClient: TemporalClientWrapper;
  worker: Worker;
  discordClient: DiscordClient;
  gitClient: GitClient;
  logger: Logger;
  config: PtahConfig;
  workflowConfig: WorkflowConfig;
  agentRegistry: AgentRegistry;
  skillInvoker: SkillInvoker;
  phaseDetector: PhaseDetector;
}

// ---------------------------------------------------------------------------
// Param types for public methods
// ---------------------------------------------------------------------------

export interface StartWorkflowForFeatureParams {
  featureSlug: string;
  featureConfig: FeatureConfig;
  startAtPhase?: string;
  initialReviewState?: Record<string, unknown>;
}

export interface RouteUserAnswerParams {
  workflowId: string;
  answer: string;
  answeredBy: string;
  answeredAt: string;
}

export interface RouteRetryOrCancelParams {
  workflowId: string;
  action: "retry" | "cancel";
}

export interface RouteResumeOrCancelParams {
  workflowId: string;
  action: "resume" | "cancel";
}

// ---------------------------------------------------------------------------
// TemporalOrchestrator
// ---------------------------------------------------------------------------

export class TemporalOrchestrator {
  private readonly temporalClient: TemporalClientWrapper;
  private readonly worker: Worker;
  private readonly discord: DiscordClient;
  private readonly gitClient: GitClient;
  private readonly logger: Logger;
  private readonly config: PtahConfig;
  private readonly workflowConfig: WorkflowConfig;
  private readonly agentRegistry: AgentRegistry;
  private readonly skillInvoker: SkillInvoker;
  private readonly phaseDetector: PhaseDetector;

  private debugChannelId: string | null = null;
  private workerRunPromise: Promise<void> | null = null;

  constructor(deps: TemporalOrchestratorDeps) {
    this.temporalClient = deps.temporalClient;
    this.worker = deps.worker;
    this.discord = deps.discordClient;
    this.gitClient = deps.gitClient;
    this.logger = deps.logger.forComponent("temporal-orchestrator");
    this.config = deps.config;
    this.workflowConfig = deps.workflowConfig;
    this.agentRegistry = deps.agentRegistry;
    this.skillInvoker = deps.skillInvoker;
    this.phaseDetector = deps.phaseDetector;
  }

  // ---------------------------------------------------------------------------
  // E4: Startup
  // ---------------------------------------------------------------------------

  async startup(): Promise<void> {
    // Prune orphaned worktrees (best effort)
    try {
      await this.skillInvoker.pruneOrphanedWorktrees();
      this.logger.info("Pruned orphaned worktrees");
    } catch (error) {
      this.logger.warn(
        `Failed to prune orphaned worktrees: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Resolve debug channel (best effort)
    try {
      this.debugChannelId = await this.discord.findChannelByName(
        this.config.discord.server_id,
        this.config.discord.channels.debug,
      );
      if (this.debugChannelId) {
        this.logger.info(`Resolved debug channel: ${this.debugChannelId}`);
      } else {
        this.logger.warn(
          `debug channel #${this.config.discord.channels.debug} not found`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to resolve debug channel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Connect Temporal client
    await this.temporalClient.connect();
    this.logger.info("Temporal client connected");

    // Start the Worker polling (runs in background until shutdown)
    this.workerRunPromise = this.worker.run();
    this.workerRunPromise.catch((err) => {
      this.logger.error(`Temporal Worker crashed: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.logger.info("Temporal Worker started polling");
  }

  // ---------------------------------------------------------------------------
  // E5: Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Shut down the Worker first
    try {
      await this.worker.shutdown();
      this.logger.info("Temporal Worker shut down");
    } catch (error) {
      this.logger.warn(
        `Failed to shut down Temporal Worker: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Then disconnect the Temporal client
    await this.temporalClient.disconnect();
    this.logger.info("Temporal client disconnected");
  }

  // ---------------------------------------------------------------------------
  // E1: Start workflow for a new feature
  // ---------------------------------------------------------------------------

  async startWorkflowForFeature(params: StartWorkflowForFeatureParams): Promise<string> {
    // Ensure the shared feature branch exists before starting the workflow (REQ-WB-05)
    const branch = featureBranchName(params.featureSlug);
    await this.gitClient.ensureBranchExists(branch);

    const startParams: StartWorkflowParams = {
      featureSlug: params.featureSlug,
      featureConfig: params.featureConfig,
      workflowConfig: this.workflowConfig,
      startAtPhase: params.startAtPhase,
    };

    const workflowId = await this.temporalClient.startFeatureWorkflow(startParams);
    this.logger.info(`Started workflow ${workflowId} for feature ${params.featureSlug}`);
    return workflowId;
  }

  // ---------------------------------------------------------------------------
  // E2: Route user-answer Signal
  // ---------------------------------------------------------------------------

  async routeUserAnswer(params: RouteUserAnswerParams): Promise<void> {
    const signal: UserAnswerSignal = {
      answer: params.answer,
      answeredBy: params.answeredBy,
      answeredAt: params.answeredAt,
    };
    await this.temporalClient.signalUserAnswer(params.workflowId, signal);
    this.logger.info(`Routed user-answer signal to workflow ${params.workflowId}`);
  }

  // ---------------------------------------------------------------------------
  // E3: Route retry-or-cancel Signal
  // ---------------------------------------------------------------------------

  async routeRetryOrCancel(params: RouteRetryOrCancelParams): Promise<void> {
    await this.temporalClient.signalRetryOrCancel(params.workflowId, params.action);
    this.logger.info(
      `Routed retry-or-cancel signal (${params.action}) to workflow ${params.workflowId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // E3: Route resume-or-cancel Signal
  // ---------------------------------------------------------------------------

  async routeResumeOrCancel(params: RouteResumeOrCancelParams): Promise<void> {
    await this.temporalClient.signalResumeOrCancel(params.workflowId, params.action);
    this.logger.info(
      `Routed resume-or-cancel signal (${params.action}) to workflow ${params.workflowId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Discord Routing: handleMessage (FSPEC-DR-01/02/03)
  // ---------------------------------------------------------------------------

  async handleMessage(message: ThreadMessage): Promise<void> {
    this.logger.debug(
      `handleMessage: threadName=${JSON.stringify(message.threadName)} threadId=${message.threadId} authorName=${JSON.stringify(message.authorName)} isBot=${message.isBot} contentSnippet=${JSON.stringify(message.content.slice(0, 80))}`,
    );

    // Step 1: Bot filter
    if (message.isBot) {
      this.logger.debug("handleMessage: dropping — isBot=true");
      return;
    }

    // Step 2: Extract feature slug
    const featureName = extractFeatureName(message.threadName);
    const slug = featureNameToSlug(featureName);
    const workflowId = `ptah-${slug}`;
    this.logger.debug(`handleMessage: featureName=${JSON.stringify(featureName)} slug=${JSON.stringify(slug)} workflowId=${workflowId}`);

    // Step 3: Check workflow existence FIRST (FSPEC-DR-01 BR-DR-01)
    let workflowRunning = false;
    let workflowState: FeatureWorkflowState | null = null;
    try {
      workflowState = await this.temporalClient.queryWorkflowState(workflowId);
      workflowRunning = true;
      this.logger.debug(`handleMessage: workflow found — state.phaseStatus=${workflowState?.phaseStatus}`);
    } catch (err) {
      if (err instanceof Error && err.name === "WorkflowNotFoundError") {
        // No workflow exists — Branch B (may start new workflow)
        workflowRunning = false;
        this.logger.debug("handleMessage: WorkflowNotFoundError — taking Branch B");
      } else {
        // Temporal query failure (server unreachable, timeout) — fail-silent (FSPEC-DR-01)
        this.logger.warn(`Temporal query failed for ${workflowId}: ${err}`);
        this.logger.debug(`handleMessage: dropping — Temporal query error: ${err instanceof Error ? err.name : String(err)}`);
        return;
      }
    }

    if (workflowRunning && workflowState) {
      // --- Branch A: Workflow IS running ---
      this.logger.debug(`handleMessage: Branch A — phaseStatus=${workflowState.phaseStatus}`);

      // Step 4a: Try ad-hoc directive
      const directive = parseAdHocDirective(message.content);
      if (directive) {
        this.logger.debug(`handleMessage: ad-hoc directive detected — agentIdentifier=${directive.agentIdentifier}`);
        await this.handleAdHocDirective(directive, message, workflowId, slug);
        return;
      }

      // Step 5: State-dependent routing
      this.logger.debug("handleMessage: no ad-hoc directive — delegating to handleStateDependentRouting");
      await this.handleStateDependentRouting(message, workflowId, workflowState);
      return;
    }

    // --- Branch B: No running workflow ---
    this.logger.debug("handleMessage: Branch B — checking for agent mention");

    // Step 4b: Check for agent mention anywhere in message
    const allAgents = this.agentRegistry.getAllAgents();
    const agentIds = allAgents.map((a) => a.id);
    const hasMention = this.containsAgentMention(message.content);
    this.logger.debug(`handleMessage: knownAgents=[${agentIds.join(", ")}] containsAgentMention=${hasMention}`);
    if (!hasMention) {
      this.logger.debug("handleMessage: dropping — no agent mention found");
      return;
    }

    // Guard: empty slug
    if (!slug) {
      this.logger.warn("Empty slug derived from thread name; skipping workflow start");
      this.logger.debug(`handleMessage: dropping — empty slug from threadName=${JSON.stringify(message.threadName)}`);
      return;
    }

    // Step 5b: Start new workflow
    this.logger.debug(`handleMessage: starting new workflow for slug=${slug}`);
    await this.startNewWorkflow(slug, message);
  }

  // ---------------------------------------------------------------------------
  // Private: Ad-hoc directive handling (extracted from original handleMessage)
  // ---------------------------------------------------------------------------

  private async handleAdHocDirective(
    directive: { agentIdentifier: string; instruction: string },
    message: ThreadMessage,
    workflowId: string,
    slug: string,
  ): Promise<void> {
    // Resolve agent
    const agent = this.agentRegistry.getAgentById(directive.agentIdentifier);
    if (!agent) {
      const allAgents = this.agentRegistry.getAllAgents();
      const knownIds = allAgents.map((a) => a.id).join(", ");
      await this.discord.postPlainMessage(
        message.threadId,
        `Agent @${directive.agentIdentifier} is not part of the ${slug} workflow. Known agents: ${knownIds}.`,
      );
      return;
    }

    // Send signal
    try {
      await this.temporalClient.signalAdHocRevision(workflowId, {
        targetAgentId: agent.id,
        instruction: directive.instruction,
        requestedBy: message.authorName,
        requestedAt: message.timestamp.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "WorkflowNotFoundError") {
        await this.discord.postPlainMessage(
          message.threadId,
          `No active workflow found for ${slug}.`,
        );
      } else {
        await this.discord.postPlainMessage(
          message.threadId,
          `Failed to dispatch to @${agent.id}. Please try again.`,
        );
      }
      return;
    }

    // Post acknowledgement (BR-05: failure is non-critical)
    try {
      const truncated =
        directive.instruction.length > 100
          ? directive.instruction.substring(0, 100) + "..."
          : directive.instruction;
      await this.discord.postPlainMessage(
        message.threadId,
        `Dispatching @${agent.id}: ${truncated}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to post Discord ack for ad-hoc dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private: containsAgentMention (FSPEC-DR-01 BR-DR-05)
  // ---------------------------------------------------------------------------

  private containsAgentMention(content: string): boolean {
    const roleMentionPattern = /<@&(\d+)>/g;
    for (const match of content.matchAll(roleMentionPattern)) {
      if (this.agentRegistry.getAgentByMentionId(match[1])) {
        return true;
      }
    }
    const allAgents = this.agentRegistry.getAllAgents();
    return allAgents.some((agent) => {
      const pattern = new RegExp(`@${agent.id}\\b`, "i");
      return pattern.test(content);
    });
  }

  // ---------------------------------------------------------------------------
  // Private: startNewWorkflow (FSPEC-DR-01 step 6b)
  // ---------------------------------------------------------------------------

  private async startNewWorkflow(slug: string, message: ThreadMessage): Promise<void> {
    // Phase detection (REQ-PD-01, REQ-PD-02, REQ-PD-03)
    let detection: PhaseDetectionResult;
    try {
      detection = await this.phaseDetector.detect(slug);
    } catch (err) {
      // REQ-ER-03: I/O error during detection — log and surface to user
      this.logger.error(
        `Phase detection failed for slug=${slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.discord.postPlainMessage(
        message.threadId,
        `${slug}: transient error during phase detection. Please try again.`,
      );
      return; // do NOT start workflow
    }

    const featureConfig: FeatureConfig = {
      discipline: "fullstack",
      skipFspec: false,
      useTechLead: false,
    };

    try {
      const workflowId = await this.startWorkflowForFeature({
        featureSlug: slug,
        featureConfig,
        startAtPhase: detection.startAtPhase,
      });
      await this.ackWithWarnOnError(() =>
        this.discord.addReaction(message.threadId, message.id, "✅"),
      );
      await this.ackWithWarnOnError(() =>
        this.discord.replyToMessage(
          message.threadId,
          message.id,
          `Workflow started: ${workflowId}`,
        ),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "WorkflowExecutionAlreadyStartedError") {
        await this.discord.postPlainMessage(
          message.threadId,
          `Workflow already running for ${slug}`,
        );
      } else {
        const errMsg = this.formatErrorMessage(err);
        await this.ackWithWarnOnError(() =>
          this.discord.addReaction(message.threadId, message.id, "❌"),
        );
        await this.ackWithWarnOnError(() =>
          this.discord.replyToMessage(
            message.threadId,
            message.id,
            `Failed to start workflow: ${errMsg}`,
          ),
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: handleStateDependentRouting (FSPEC-DR-02, DR-03)
  // ---------------------------------------------------------------------------

  private async handleStateDependentRouting(
    message: ThreadMessage,
    workflowId: string,
    state: FeatureWorkflowState,
  ): Promise<void> {
    const phaseStatus = state.phaseStatus;
    this.logger.debug(`handleStateDependentRouting: workflowId=${workflowId} phaseStatus=${phaseStatus}`);

    if (phaseStatus === "waiting-for-user") {
      // FSPEC-DR-02: Route as user answer
      try {
        await this.routeUserAnswer({
          workflowId,
          answer: message.content,
          answeredBy: message.authorName,
          answeredAt: message.timestamp.toISOString(),
        });
        await this.ackWithWarnOnError(() =>
          this.discord.addReaction(message.threadId, message.id, "✅"),
        );
      } catch (err) {
        const errMsg = this.formatErrorMessage(err);
        await this.ackWithWarnOnError(() =>
          this.discord.addReaction(message.threadId, message.id, "❌"),
        );
        await this.ackWithWarnOnError(() =>
          this.discord.replyToMessage(
            message.threadId,
            message.id,
            `Failed to route answer: ${errMsg}`,
          ),
        );
      }
      return;
    }

    if (phaseStatus === "failed" || phaseStatus === "revision-bound-reached") {
      // FSPEC-DR-03: Parse intent and route
      const intent = parseUserIntent(message.content);
      if (!intent) return; // No keyword — silent ignore

      await this.handleIntentRouting(message, workflowId, phaseStatus, intent);
      return;
    }

    // Any other state: silently ignore
    this.logger.debug(`handleStateDependentRouting: dropping — phaseStatus=${phaseStatus} is not actionable`);
  }

  // ---------------------------------------------------------------------------
  // Private: handleIntentRouting (FSPEC-DR-03 BR-DR-13)
  // ---------------------------------------------------------------------------

  private async handleIntentRouting(
    message: ThreadMessage,
    workflowId: string,
    state: PhaseStatus,
    intent: UserIntent,
  ): Promise<void> {
    // State-action validation matrix
    const VALID_ACTIONS: Record<string, UserIntent[]> = {
      "failed": ["retry", "cancel"],
      "revision-bound-reached": ["resume", "cancel"],
    };

    const HINT_MESSAGES: Record<string, string> = {
      "failed": "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort.",
      "revision-bound-reached": "Workflow reached revision bound. Use 'resume' to continue or 'cancel' to abort.",
    };

    const validActions = VALID_ACTIONS[state] ?? [];
    if (!validActions.includes(intent)) {
      // Invalid action for current state — post hint
      const hint = HINT_MESSAGES[state];
      if (hint) {
        await this.discord.postPlainMessage(message.threadId, hint);
      }
      return;
    }

    // Route signal
    try {
      if (state === "failed") {
        await this.routeRetryOrCancel({ workflowId, action: intent as "retry" | "cancel" });
      } else {
        await this.routeResumeOrCancel({ workflowId, action: intent as "resume" | "cancel" });
      }

      // Best-effort ack (BR-DR-14)
      try {
        await this.discord.postPlainMessage(
          message.threadId,
          `Sent ${intent} signal to workflow ${workflowId}`,
        );
      } catch {
        this.logger.warn(`Failed to post ack for ${intent} signal`);
      }
    } catch (err) {
      await this.discord.postPlainMessage(
        message.threadId,
        `Failed to send ${intent} signal. Please try again.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private: acknowledgement helpers
  // ---------------------------------------------------------------------------

  /**
   * Wraps an acknowledgement call (addReaction or replyToMessage) in a try/catch.
   * If the call throws, logs a WARN and swallows the error so the orchestrator
   * continues normally. Discord API failures must never propagate.
   */
  private async ackWithWarnOnError(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (ackErr) {
      const msg = ackErr instanceof Error ? ackErr.message : String(ackErr);
      this.logger.warn(`Acknowledgement failed: ${msg}`);
    }
  }

  /**
   * Extracts and truncates an error message to at most 200 characters.
   * Uses err.message for Error instances and String(err) for all other values.
   * The 200-character limit applies only to the extracted message — the
   * "Failed to {op}: " prefix is concatenated after truncation.
   */
  private formatErrorMessage(err: unknown): string {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return rawMsg.slice(0, 200);
  }
}
