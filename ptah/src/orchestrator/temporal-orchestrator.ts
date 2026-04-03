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
import type { Logger } from "../services/logger.js";
import type { PtahConfig } from "../types.js";
import type { WorkflowConfig } from "../config/workflow-config.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { SkillInvoker } from "./skill-invoker.js";
import type { TemporalClientWrapper } from "../temporal/client.js";
import type { StartWorkflowParams, UserAnswerSignal } from "../temporal/types.js";
import type { FeatureConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface TemporalOrchestratorDeps {
  temporalClient: TemporalClientWrapper;
  worker: Worker;
  discordClient: DiscordClient;
  logger: Logger;
  config: PtahConfig;
  workflowConfig: WorkflowConfig;
  agentRegistry: AgentRegistry;
  skillInvoker: SkillInvoker;
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
  private readonly logger: Logger;
  private readonly config: PtahConfig;
  private readonly workflowConfig: WorkflowConfig;
  private readonly agentRegistry: AgentRegistry;
  private readonly skillInvoker: SkillInvoker;

  private debugChannelId: string | null = null;

  constructor(deps: TemporalOrchestratorDeps) {
    this.temporalClient = deps.temporalClient;
    this.worker = deps.worker;
    this.discord = deps.discordClient;
    this.logger = deps.logger.forComponent("temporal-orchestrator");
    this.config = deps.config;
    this.workflowConfig = deps.workflowConfig;
    this.agentRegistry = deps.agentRegistry;
    this.skillInvoker = deps.skillInvoker;
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
}
