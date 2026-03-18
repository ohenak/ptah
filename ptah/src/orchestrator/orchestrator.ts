import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThreadMessage, PtahConfig, CommitResult, LogStatus, LogEntry, PendingQuestion, ChannelMessage } from "../types.js";
import type { DiscordClient } from "../services/discord.js";
import type { GitClient } from "../services/git.js";
import type { Logger } from "../services/logger.js";
import type { RoutingEngine } from "./router.js";
import { RoutingParseError } from "./router.js";
import type { ContextAssembler } from "./context-assembler.js";
import type { SkillInvoker } from "./skill-invoker.js";
import { InvocationTimeoutError } from "./skill-invoker.js";
import type { ResponsePoster } from "./response-poster.js";
import type { ThreadQueue } from "./thread-queue.js";
import type { ArtifactCommitter } from "./artifact-committer.js";
import type { AgentLogWriter } from "./agent-log-writer.js";
import type { MessageDeduplicator } from "./message-deduplicator.js";
import type { QuestionStore } from "./question-store.js";
import type { QuestionPoller } from "./question-poller.js";
import type { PatternBContextBuilder } from "./pattern-b-context-builder.js";
import type { InvocationGuard } from "./invocation-guard.js";
import type { ThreadStateManager } from "./thread-state-manager.js";
import type { WorktreeRegistry } from "./worktree-registry.js";
import type { PdlcDispatcher } from "./pdlc/pdlc-dispatcher.js";
import { type DispatchAction, type AgentDispatch, type FeatureConfig, type Discipline, PdlcPhase } from "./pdlc/phases.js";
import { computeReviewerManifest } from "./pdlc/review-tracker.js";
import { extractFeatureName, featureNameToSlug, featureBranchName } from "./feature-branch.js";

const REVIEW_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_REVIEW,
  PdlcPhase.FSPEC_REVIEW,
  PdlcPhase.TSPEC_REVIEW,
  PdlcPhase.PLAN_REVIEW,
  PdlcPhase.PROPERTIES_REVIEW,
  PdlcPhase.IMPLEMENTATION_REVIEW,
]);

export interface Orchestrator {
  handleMessage(message: ThreadMessage): Promise<void>;
  startup(): Promise<void>;
  shutdown(): Promise<void>;
  resumeWithPatternB(question: PendingQuestion): Promise<void>;
}

export interface OrchestratorDeps {
  discordClient: DiscordClient;
  routingEngine: RoutingEngine;
  contextAssembler: ContextAssembler;
  skillInvoker: SkillInvoker;
  responsePoster: ResponsePoster;
  threadQueue: ThreadQueue;
  logger: Logger;
  config: PtahConfig;

  // --- Phase 4 (new) ---
  gitClient: GitClient;
  artifactCommitter: ArtifactCommitter;
  agentLogWriter: AgentLogWriter;
  messageDeduplicator: MessageDeduplicator;

  // --- Phase 5 (new) ---
  questionStore: QuestionStore;
  questionPoller: QuestionPoller;
  patternBContextBuilder: PatternBContextBuilder;

  // --- Phase 6 (new) ---
  invocationGuard: InvocationGuard;
  threadStateManager: ThreadStateManager;
  worktreeRegistry: WorktreeRegistry;
  shutdownSignal: AbortSignal;

  // --- Phase 11: PDLC State Machine (new) ---
  pdlcDispatcher: PdlcDispatcher;
}

export class DefaultOrchestrator implements Orchestrator {
  private readonly discord: DiscordClient;
  private readonly routingEngine: RoutingEngine;
  private readonly contextAssembler: ContextAssembler;
  private readonly skillInvoker: SkillInvoker;
  private readonly responsePoster: ResponsePoster;
  private readonly threadQueue: ThreadQueue;
  private readonly logger: Logger;
  private readonly config: PtahConfig;
  private readonly gitClient: GitClient;
  private readonly artifactCommitter: ArtifactCommitter;
  private readonly agentLogWriter: AgentLogWriter;
  private readonly messageDeduplicator: MessageDeduplicator;
  private readonly questionStore: QuestionStore;
  private readonly questionPoller: QuestionPoller;
  private readonly patternBContextBuilder: PatternBContextBuilder;
  private readonly invocationGuard: InvocationGuard;
  private readonly threadStateManager: ThreadStateManager;
  private readonly worktreeRegistry: WorktreeRegistry;
  private readonly shutdownSignal: AbortSignal;
  private readonly pdlcDispatcher: PdlcDispatcher;
  private pausedThreadIds = new Set<string>();
  private openQuestionsChannelId: string | null = null;
  private debugChannelId: string | null = null;
  private seenThreadIds = new Set<string>();
  /**
   * In-memory map of Discord message ID → question ID.
   * Seeded on startup from both pending.md and resolved.md.
   * Updated whenever a new question notification is posted.
   */
  private discordMessageIdMap = new Map<string, string>();

  constructor(deps: OrchestratorDeps) {
    this.discord = deps.discordClient;
    this.routingEngine = deps.routingEngine;
    this.contextAssembler = deps.contextAssembler;
    this.skillInvoker = deps.skillInvoker;
    this.responsePoster = deps.responsePoster;
    this.threadQueue = deps.threadQueue;
    this.logger = deps.logger;
    this.config = deps.config;
    this.gitClient = deps.gitClient;
    this.artifactCommitter = deps.artifactCommitter;
    this.agentLogWriter = deps.agentLogWriter;
    this.messageDeduplicator = deps.messageDeduplicator;
    this.questionStore = deps.questionStore;
    this.questionPoller = deps.questionPoller;
    this.patternBContextBuilder = deps.patternBContextBuilder;
    this.invocationGuard = deps.invocationGuard;
    this.threadStateManager = deps.threadStateManager;
    this.worktreeRegistry = deps.worktreeRegistry;
    this.shutdownSignal = deps.shutdownSignal;
    this.pdlcDispatcher = deps.pdlcDispatcher;
  }

  async handleMessage(message: ThreadMessage): Promise<void> {
    this.threadQueue.enqueue(message.threadId, async () => {
      await this.processMessage(message);
    });
  }

  async shutdown(): Promise<void> {
    await this.questionPoller.stop();
  }

  async resumeWithPatternB(question: PendingQuestion): Promise<void> {
    this.threadQueue.enqueue(question.threadId, async () => {
      await this.executePatternBResume(question);
    });
  }

  async startup(): Promise<void> {
    // Best-effort prune orphaned worktrees (SI-R9)
    try {
      await this.skillInvoker.pruneOrphanedWorktrees();
      this.logger.info("Pruned orphaned worktrees");
    } catch (error) {
      this.logger.warn(
        `Failed to prune orphaned worktrees: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Resolve debug channel (Q-01)
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

    // Phase 5: Resolve #open-questions channel
    const openQuestionsChannelId = await this.discord.findChannelByName(
      this.config.discord.server_id,
      this.config.discord.channels.questions,
    );

    if (openQuestionsChannelId) {
      this.openQuestionsChannelId = openQuestionsChannelId;
      this.logger.info(`Resolved open-questions channel: ${openQuestionsChannelId}`);

      // Register Discord reply listener
      this.discord.onChannelMessage(openQuestionsChannelId, async (msg) => {
        await this.handleOpenQuestionReply(msg);
      });
    } else {
      this.logger.warn(
        `open-questions channel #${this.config.discord.channels.questions} not found — Discord notifications will be skipped`,
      );
    }

    // Restart recovery: seed discordMessageIdMap and restore paused threads
    let pendingQuestions: PendingQuestion[] = [];
    let resolvedQuestions: PendingQuestion[] = [];
    try {
      pendingQuestions = await this.questionStore.readPendingQuestions();
      resolvedQuestions = await this.questionStore.readResolvedQuestions();
    } catch (error) {
      this.logger.warn(
        `Failed to read questions on startup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Seed discordMessageIdMap from both files
    for (const q of [...pendingQuestions, ...resolvedQuestions]) {
      if (q.discordMessageId) {
        this.discordMessageIdMap.set(q.discordMessageId, q.id);
      }
    }

    // Restore paused threads and re-register with poller
    for (const q of pendingQuestions) {
      this.pausedThreadIds.add(q.threadId);
      this.questionPoller.registerQuestion({
        questionId: q.id,
        agentId: q.agentId,
        threadId: q.threadId,
      });
    }

    if (pendingQuestions.length > 0) {
      this.logger.info(`Restored ${pendingQuestions.length} pending question(s) from pending.md`);
    }

    // Phase 11: Load PDLC state from disk
    try {
      await this.pdlcDispatcher.loadState();
      this.logger.info("Loaded PDLC state");
    } catch (error) {
      this.logger.warn(
        `Failed to load PDLC state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async postToDebugChannel(message: string): Promise<void> {
    if (!this.debugChannelId) return;
    try {
      await this.discord.postChannelMessage(this.debugChannelId, message);
    } catch {
      this.logger.warn("Failed to post to #agent-debug");
    }
  }

  private async processMessage(message: ThreadMessage): Promise<void> {
    // Step 0: Malformed message guard
    if (!message.id) {
      this.logger.warn("Skipping message with no ID");
      return;
    }

    // Step 1: Dedup check (FSPEC-AC-03, ID-R1)
    if (this.messageDeduplicator.isDuplicate(message.id)) {
      this.logger.warn(`Skipping duplicate message ${message.id}`);
      return;
    }

    // Phase 5: silently drop messages for paused threads (PQ-R10)
    if (this.pausedThreadIds.has(message.threadId)) {
      this.logger.info(`Dropping message for paused thread ${message.threadId}`);
      return;
    }

    // Step 2: Ignore bot messages
    if (message.isBot) {
      return;
    }

    // Phase 6: Lazy turn-count reconstruction (E-5)
    if (!this.seenThreadIds.has(message.threadId)) {
      const history = await this.discord.readThreadHistory(message.threadId);
      const isReview = this.threadStateManager.isReviewThread(message.threadId);
      this.threadStateManager.reconstructTurnCount(message.threadId, history, isReview);
      this.seenThreadIds.add(message.threadId);
      this.logger.info(`[ptah] Reconstructed turn count for thread ${message.threadId}`);
    }

    // Phase 6: Turn-limit pre-check (E-4)
    if (this.threadStateManager.isReviewThread(message.threadId)) {
      // GR-R12: review check has priority
      const reviewResult = this.threadStateManager.checkAndIncrementReviewTurn(message.threadId);
      if (reviewResult === "stalled") {
        this.threadStateManager.stallReviewThread(message.threadId);
        const parentThreadId = this.threadStateManager.getParentThreadId(message.threadId);
        await this.discord.postEmbed({
          threadId: message.threadId,
          title: "\uD83D\uDEA8 Review Thread Stalled",
          description: "This review thread has reached its turn limit and has been stalled.",
          colour: 0xFF0000,
        });
        const parentSuffix = parentThreadId ? `. Parent thread: ${parentThreadId}` : "";
        await this.postToDebugChannel(
          `[ptah] Review thread ${message.threadName} (${message.threadId}) STALLED after 4 turns — no ROUTE_TO_DONE received${parentSuffix}`
        );
        return;
      }
    } else {
      // General turn limit check
      const maxTurns = this.config.orchestrator.max_turns_per_thread;
      const turnResult = this.threadStateManager.checkAndIncrementTurn(message.threadId, maxTurns);
      if (turnResult === "limit-reached") {
        // GR-R11: if already CLOSED, silently drop
        const status = this.threadStateManager.getStatus(message.threadId);
        if (status === "closed") {
          return;
        }
        // Close the thread and post embed
        this.threadStateManager.closeThread(message.threadId);
        await this.discord.postEmbed({
          threadId: message.threadId,
          title: "\uD83D\uDD12 Thread Closed",
          description: `This thread has reached the maximum turn limit of ${maxTurns} and has been closed.`,
          colour: 0xFF6600,
        });
        await this.postToDebugChannel(
          `[ptah] Thread ${message.threadName} (${message.threadId}) closed — max turns (${maxTurns}) reached. No further routing.`
        );
        return;
      }
    }

    // Step 3: Resolve agent from human message
    const agentId = this.routingEngine.resolveHumanMessage(message, this.config);

    // Step 4: If no agent, post system message
    if (!agentId) {
      this.logger.info(`No role mention found in message ${message.id} from ${message.authorName}`);
      await this.discord.postSystemMessage(
        message.threadId,
        "Please @mention a role to direct your message to a specific agent.",
      );
      return;
    }

    this.logger.info(`Message received from ${message.authorName} in thread "${message.threadName}" → agent: ${agentId}`);

    // Step 5: Phase guard — block non-reviewers from being invoked during review phases
    let featureSlug: string | null = null;
    try {
      featureSlug = featureNameToSlug(extractFeatureName(message.threadName));
    } catch {
      // Slug resolution failed — skip guard
    }
    if (featureSlug) {
      const featureState = await this.pdlcDispatcher.getFeatureState(featureSlug);
      if (featureState && REVIEW_PHASES.has(featureState.phase)) {
        const manifest = computeReviewerManifest(featureState.phase, featureState.config.discipline);
        const allowedAgentIds = new Set(manifest.map(e => e.agentId));
        if (!allowedAgentIds.has(agentId)) {
          this.logger.warn(
            `Blocked @mention → "${agentId}" during ${featureState.phase}: not in reviewer manifest [${[...allowedAgentIds].join(", ")}]`,
          );
          await this.discord.postSystemMessage(
            message.threadId,
            `**${formatAgentName(agentId)}** is not an authorized reviewer for this phase. Authorized reviewers: ${[...allowedAgentIds].map(formatAgentName).join(", ")}.`,
          );
          return;
        }
      }
    }

    // Step 6: Run the routing loop starting with the resolved agent
    await this.executeRoutingLoop(agentId, message);
  }

  private async executeRoutingLoop(
    initialAgentId: string,
    triggerMessage: ThreadMessage,
    pdlcDispatch?: AgentDispatch,
  ): Promise<void> {
    let currentAgentId = initialAgentId;
    let routingMessage: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Generate worktree identifiers
      let invocationId = randomBytes(4).toString("hex");
      let branch = `ptah/${currentAgentId}/${triggerMessage.threadId}/${invocationId}`;
      let worktreePath = join(tmpdir(), "ptah-worktrees", invocationId);

      // Branch-already-exists guard (Task 64)
      try {
        branch = await this.ensureUniqueBranch(
          currentAgentId,
          triggerMessage.threadId,
          invocationId,
          branch,
          worktreePath,
        );
        // Update worktreePath if branch changed
        const parts = branch.split("/");
        const newInvocationId = parts[parts.length - 1];
        worktreePath = join(tmpdir(), "ptah-worktrees", newInvocationId);
      } catch {
        // If ensureUniqueBranch fails somehow, continue with original
      }

      // Create worktree from the feature branch (not HEAD)
      const baseBranch = featureBranchName(extractFeatureName(triggerMessage.threadName));
      this.logger.info(`Creating worktree for ${currentAgentId} on branch ${branch} from ${baseBranch}`);
      try {
        await this.gitClient.createWorktreeFromBranch(branch, worktreePath, baseBranch);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Worktree creation failed: ${errorMessage}`,
        );
        // Write error log entry
        await this.writeLogEntry(currentAgentId, triggerMessage, "error", null);
        return;
      }

      let worktreeCleaned = false;
      try {
        // Read thread history
        const threadHistory = await this.discord.readThreadHistory(
          triggerMessage.threadId,
        );

        // Assemble context (with worktreePath for Layer 2)
        const agentLabel = formatAgentName(currentAgentId);
        this.logger.info(`Assembling context for ${currentAgentId} (feature: "${triggerMessage.threadName}")`);
        await this.responsePoster.postProgressEmbed(
          triggerMessage.threadId,
          `Assembling context for **${agentLabel}**...`,
        );
        const bundle = await this.contextAssembler.assemble({
          agentId: currentAgentId,
          threadId: triggerMessage.threadId,
          threadName: triggerMessage.threadName,
          threadHistory,
          triggerMessage,
          config: this.config,
          worktreePath,
          routingMessage,
          contextDocuments: pdlcDispatch?.contextDocuments,
          taskType: pdlcDispatch?.taskType,
          documentType: pdlcDispatch?.documentType,
        });

        this.logger.info(`--- Prompt for ${currentAgentId} (thread: "${triggerMessage.threadName}", pattern: ${bundle.resumePattern}, turn: ${bundle.turnNumber}) ---`);
        this.logger.info(`[System Prompt] (${bundle.tokenCounts.layer1} L1 + ${bundle.tokenCounts.layer2} L2 tokens):\n${bundle.systemPrompt}`);
        this.logger.info(`[User Message] (${bundle.tokenCounts.layer3} tokens):\n${bundle.userMessage}`);
        this.logger.info(`--- End prompt for ${currentAgentId} ---`);

        const timeoutSec = Math.round((this.config.orchestrator.invocation_timeout_ms ?? 900_000) / 1000);
        this.logger.info(`Invoking ${currentAgentId} skill (timeout: ${timeoutSec}s)...`);
        await this.responsePoster.postProgressEmbed(
          triggerMessage.threadId,
          `Invoking **${agentLabel}** skill (timeout: ${timeoutSec}s)...`,
        );

        // Phase 6: Register worktree BEFORE invoking guard
        this.worktreeRegistry.register(worktreePath, branch);

        // Phase 6: Use InvocationGuard instead of direct skillInvoker + artifactCommitter
        const guardResult = await this.invocationGuard.invokeWithRetry({
          agentId: currentAgentId,
          threadId: triggerMessage.threadId,
          threadName: triggerMessage.threadName,
          bundle,
          worktreePath,
          branch,
          featureBranch: baseBranch,
          config: this.config,
          shutdownSignal: this.shutdownSignal,
          debugChannelId: this.debugChannelId,
        });

        if (guardResult.status !== "success") {
          // Deregister worktree on non-success (InvocationGuard already cleaned up)
          this.worktreeRegistry.deregister(worktreePath);
          await this.writeLogEntry(currentAgentId, triggerMessage, "error", null);
          return;
        }

        const { invocationResult: result, commitResult } = guardResult;

        const durationLabel = result.durationMs >= 60000
          ? `${Math.round(result.durationMs / 1000)}s`
          : `${result.durationMs}ms`;
        this.logger.info(`Skill ${currentAgentId} completed in ${durationLabel} (${result.artifactChanges.length} artifact changes)`);
        await this.responsePoster.postProgressEmbed(
          triggerMessage.threadId,
          `**${agentLabel}** completed in ${durationLabel} — ${result.artifactChanges.length} file(s) changed.`,
        );

        // Cleanup worktree on no-changes path
        if (commitResult.mergeStatus === "no-changes") {
          await this.cleanupWorktree(worktreePath, branch);
          worktreeCleaned = true;
        }

        // Write agent log (always)
        const logStatus = deriveLogStatus(commitResult);
        await this.writeLogEntry(
          currentAgentId,
          triggerMessage,
          logStatus,
          commitResult.commitSha,
        );

        // Post agent response — GR-R9: if this throws, log SHA and return
        this.logger.info(`Posting ${currentAgentId} response to thread "${triggerMessage.threadName}"`);
        try {
          await this.responsePoster.postAgentResponse({
            threadId: triggerMessage.threadId,
            agentId: currentAgentId,
            text: result.textResponse,
            config: this.config,
            footer: `${result.durationMs}ms`,
          });
        } catch (postError) {
          // GR-R9 / AT-GR-17: Discord response post failed after successful commit
          const sha = commitResult.commitSha ?? "unknown";
          await this.postToDebugChannel(
            `[ptah] GR-R9: Discord post failed after successful commit ${sha} for ${currentAgentId} in thread ${triggerMessage.threadName}. Error: ${postError instanceof Error ? postError.message : String(postError)}`
          );
          await this.discord.postEmbed({
            threadId: triggerMessage.threadId,
            title: "\u26D4 Agent Error",
            description: `Partial commit: ${currentAgentId} completed its work (commit: ${sha}) but the response could not be posted to Discord. See #agent-debug for details.`,
            colour: 0xFF0000,
          }).catch(() => {});
          this.worktreeRegistry.deregister(worktreePath);
          await this.cleanupWorktree(worktreePath, branch);
          return;
        }

        // Deregister worktree after successful response post
        this.worktreeRegistry.deregister(worktreePath);

        // Parse routing signal
        const signal = this.routingEngine.parseSignal(result.routingSignalRaw);

        // Phase 11 + 13: Resolve slug, check PDLC state, auto-initialize if eligible
        let featureSlug: string;
        try {
          featureSlug = featureNameToSlug(extractFeatureName(triggerMessage.threadName));
        } catch {
          // Slug resolution threw — fall through to unmanaged path (REQ-PI-01, A-06)
          featureSlug = "";
        }

        const isManaged = featureSlug ? await this.pdlcDispatcher.isManaged(featureSlug) : false;
        let effectivelyManaged = isManaged;

        if (featureSlug && !isManaged) {
          const guardResult = evaluateAgeGuard(threadHistory, this.logger);
          if (guardResult.eligible) {
            const initialMessage = threadHistory.find(m => !m.isBot) ?? null;
            const autoInitConfig = parseKeywords(initialMessage?.content ?? null);
            try {
              await this.pdlcDispatcher.initializeFeature(featureSlug, autoInitConfig);
              effectivelyManaged = true;
            } catch (initError) {
              this.logger.error(
                `[ptah] Failed to auto-initialize PDLC state for "${featureSlug}": ${
                  initError instanceof Error ? initError.message : String(initError)
                }`
              );
              return; // BR-PI-03: do NOT proceed to managed or legacy path
            }
            // Log init success (REQ-PI-03) — swallow logger errors
            try {
              this.logger.info(
                `[ptah] Auto-initialized PDLC state for feature "${featureSlug}" with discipline "${autoInitConfig.discipline}"`
              );
            } catch {
              // logger threw — swallow and continue (REQ-PI-03)
            }
            // Post debug channel notification (REQ-PI-04) — non-fatal
            await this.postToDebugChannel(
              `[ptah] PDLC auto-init: feature "${featureSlug}" registered with discipline "${autoInitConfig.discipline}", starting at REQ_CREATION`
            );
          } else {
            // Age guard: thread is too old for auto-init — log at debug and fall through to legacy path
            this.logger.debug(
              `[ptah] Skipping PDLC auto-init for "${featureSlug}" — thread has ${guardResult.turnCount} prior turns (threshold: 1)`
            );
          }
        }

        if (effectivelyManaged) {
          // PDLC-managed feature path
          if (signal.type === "LGTM" || signal.type === "TASK_COMPLETE") {
            // Determine if the feature is in a review phase — if so, route
            // through processReviewCompletion so the cross-review file is
            // parsed and a review_submitted event is fired instead of lgtm.
            const featureState = await this.pdlcDispatcher.getFeatureState(featureSlug);
            const isReviewPhase = featureState != null && REVIEW_PHASES.has(featureState.phase);

            let dispatchAction: DispatchAction;
            if (isReviewPhase) {
              dispatchAction = await this.pdlcDispatcher.processReviewCompletion({
                featureSlug,
                reviewerAgentId: currentAgentId,
                worktreePath,
              });
            } else {
              dispatchAction = await this.pdlcDispatcher.processAgentCompletion({
                featureSlug,
                agentId: currentAgentId,
                signal: signal.type as "LGTM" | "TASK_COMPLETE",
                worktreePath,
              });
            }
            const loopResult = await this.handleDispatchAction(
              dispatchAction,
              triggerMessage,
              currentAgentId,
              result.textResponse,
              worktreePath,
            );
            if (loopResult === "continue") {
              return;
            }
            return;
          }

          if (signal.type === "ROUTE_TO_USER") {
            const questionText = (signal as { question?: string }).question ?? "Awaiting user input.";
            await this.handleRouteToUser(questionText, triggerMessage, currentAgentId);
            return;
          }

          if (signal.type === "ROUTE_TO_AGENT") {
            this.logger.warn(
              `Agent used ROUTE_TO_AGENT in PDLC-managed feature — ad-hoc coordination`,
            );
            const targetAgentId = (signal as { agentId?: string }).agentId;
            if (targetAgentId) {
              // Guard: reject routing to non-reviewers during review phases
              const latestState = await this.pdlcDispatcher.getFeatureState(featureSlug);
              if (latestState && REVIEW_PHASES.has(latestState.phase)) {
                const manifest = computeReviewerManifest(latestState.phase, latestState.config.discipline);
                const allowedAgentIds = new Set(manifest.map(e => e.agentId));
                if (!allowedAgentIds.has(targetAgentId)) {
                  this.logger.warn(
                    `Blocked ROUTE_TO_AGENT → "${targetAgentId}" during ${latestState.phase}: not in reviewer manifest [${[...allowedAgentIds].join(", ")}]`,
                  );
                  await this.responsePoster.postProgressEmbed(
                    triggerMessage.threadId,
                    `Blocked routing to **${formatAgentName(targetAgentId)}** — not an authorized reviewer for this phase.`,
                  );
                  return;
                }
              }

              const nextAgentLabel = formatAgentName(targetAgentId);
              await this.responsePoster.postProgressEmbed(
                triggerMessage.threadId,
                `Routing to **${nextAgentLabel}**...`,
              );
              currentAgentId = targetAgentId;
              routingMessage = result.textResponse;
              continue;
            }
            return;
          }

          // Unknown signal type in managed feature — treat as terminal
          return;
        }

        // Unmanaged feature: use existing RoutingEngine.decide() path (backward compatibility)
        const decision = this.routingEngine.decide(signal, this.config);

        // Handle decision
        this.logger.info(`Routing decision: ${decision.signal.type}${decision.targetAgentId ? ` → ${decision.targetAgentId}` : ""}`);
        if (decision.isTerminal) {
          await this.responsePoster.postCompletionEmbed(
            triggerMessage.threadId,
            currentAgentId,
            this.config,
          );
          return;
        }

        if (decision.isPaused) {
          const questionText = decision.signal.question ?? "Awaiting user input.";
          await this.handleRouteToUser(questionText, triggerMessage, currentAgentId);
          return;
        }

        if (decision.createNewThread) {
          const featureName = bundle.featureName;
          await this.responsePoster.createCoordinationThread({
            channelId: triggerMessage.parentChannelId,
            featureName,
            description: `Coordination with ${decision.targetAgentId}`,
            agentId: decision.targetAgentId!,
            initialText: result.textResponse,
            config: this.config,
          });
          return;
        }

        // ROUTE_TO_AGENT with reply — loop with new agent
        // Guard: reject routing to non-reviewers during review phases
        if (featureSlug) {
          const currentState = await this.pdlcDispatcher.getFeatureState(featureSlug);
          if (currentState && REVIEW_PHASES.has(currentState.phase)) {
            const manifest = computeReviewerManifest(currentState.phase, currentState.config.discipline);
            const allowedAgentIds = new Set(manifest.map(e => e.agentId));
            if (!allowedAgentIds.has(decision.targetAgentId!)) {
              this.logger.warn(
                `Blocked ROUTE_TO_AGENT → "${decision.targetAgentId}" during ${currentState.phase}: not in reviewer manifest [${[...allowedAgentIds].join(", ")}]`,
              );
              await this.responsePoster.postProgressEmbed(
                triggerMessage.threadId,
                `Blocked routing to **${formatAgentName(decision.targetAgentId!)}** — not an authorized reviewer for this phase.`,
              );
              return;
            }
          }
        }

        const nextAgentLabel = formatAgentName(decision.targetAgentId!);
        await this.responsePoster.postProgressEmbed(
          triggerMessage.threadId,
          `Routing to **${nextAgentLabel}**...`,
        );
        currentAgentId = decision.targetAgentId!;
        routingMessage = result.textResponse;
        // Continue the while loop
      } catch (error) {
        // Unexpected error — cleanup worktree (skip if already cleaned up)
        this.worktreeRegistry.deregister(worktreePath);
        if (!worktreeCleaned) {
          await this.cleanupWorktree(worktreePath, branch);
        }

        // Write error log entry
        await this.writeLogEntry(currentAgentId, triggerMessage, "error", null);

        if (error instanceof RoutingParseError) {
          await this.responsePoster.postErrorEmbed(
            triggerMessage.threadId,
            `Routing error: ${error.message}`,
          );
          return;
        }

        if (error instanceof InvocationTimeoutError) {
          const timeoutSec = Math.round((this.config.orchestrator.invocation_timeout_ms ?? 900_000) / 1000);
          await this.responsePoster.postErrorEmbed(
            triggerMessage.threadId,
            `Skill invocation timed out (>${timeoutSec}s)`,
          );
          return;
        }

        // Generic error (InvocationError or other)
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Skill invocation failed: ${errorMessage}`,
        );
        return;
      }
    }
  }

  private async handleRouteToUser(
    questionText: string,
    triggerMessage: ThreadMessage,
    agentId: string,
  ): Promise<void> {
    // 1. Append question to store (atomically assigns ID)
    const partialQuestion = {
      agentId,
      threadId: triggerMessage.threadId,
      threadName: triggerMessage.threadName,
      askedAt: new Date(),
      questionText,
      answer: null,
      discordMessageId: null,
    };

    const question = await this.questionStore.appendQuestion(partialQuestion);

    // 2. Post Discord notification (best-effort)
    if (this.openQuestionsChannelId) {
      try {
        const content = this.formatQuestionNotification(question);
        const discordMessageId = await this.discord.postChannelMessage(
          this.openQuestionsChannelId,
          content,
        );
        await this.questionStore.updateDiscordMessageId(question.id, discordMessageId);
        this.discordMessageIdMap.set(discordMessageId, question.id);
      } catch (error) {
        this.logger.warn(
          `Failed to post Discord notification for ${question.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      this.logger.warn(
        `open-questions channel not resolved — skipping Discord notification for ${question.id}`,
      );
    }

    // 3. Post pause embed to originating thread
    await this.discord.postSystemMessage(
      triggerMessage.threadId,
      `\u23F8 Paused \u2014 waiting for user answer to ${question.id}`,
    );

    // 4. Add threadId to pausedThreadIds
    this.pausedThreadIds.add(triggerMessage.threadId);

    // 5. Register with poller
    this.questionPoller.registerQuestion({
      questionId: question.id,
      agentId,
      threadId: triggerMessage.threadId,
    });
  }

  private async handleDispatchAction(
    dispatchAction: DispatchAction,
    triggerMessage: ThreadMessage,
    currentAgentId: string,
    _lastResponse: string,
    _worktreePath: string,
  ): Promise<"continue" | "stop"> {
    switch (dispatchAction.action) {
      case "dispatch": {
        // Set next agent(s) and continue loop — dispatch first agent sequentially
        for (const agentDispatch of dispatchAction.agents) {
          await this.executeRoutingLoop(agentDispatch.agentId, triggerMessage, agentDispatch);
        }
        return "continue";
      }
      case "retry_agent": {
        // Re-invoke with correction directive (up to 2 retries, 3 total attempts)
        this.logger.warn(
          `PDLC retry_agent: ${dispatchAction.reason} — ${dispatchAction.message}`,
        );
        // Post the retry message and re-enter routing loop
        await this.responsePoster.postProgressEmbed(
          triggerMessage.threadId,
          `Retrying agent: ${dispatchAction.message}`,
        );
        await this.executeRoutingLoop(currentAgentId, triggerMessage);
        return "continue";
      }
      case "pause": {
        // Handle via ROUTE_TO_USER mechanism
        await this.handleRouteToUser(dispatchAction.message, triggerMessage, currentAgentId);
        return "stop";
      }
      case "done": {
        // Post completion embed
        await this.responsePoster.postCompletionEmbed(
          triggerMessage.threadId,
          currentAgentId,
          this.config,
        );
        return "stop";
      }
      case "wait": {
        // Return — waiting for more results (fork/join)
        return "stop";
      }
      default:
        return "stop";
    }
  }

  private formatQuestionNotification(question: PendingQuestion): string {
    return (
      `<@${this.config.discord.mention_user_id}> **Question from ${question.agentId}** (${question.id})\n\n` +
      `**Thread:** ${question.threadName}\n\n` +
      `**Question:**\n${question.questionText}`
    );
  }

  private async handleOpenQuestionReply(message: ChannelMessage): Promise<void> {
    // 1. Ignore if not a Discord reply
    if (!message.replyToMessageId) return;

    // 2. Ignore if not the configured user
    if (message.authorId !== this.config.discord.mention_user_id) return;

    // 3. Ignore empty messages
    if (!message.content.trim()) return;

    // 4. Look up question ID from discordMessageIdMap
    const questionId = this.discordMessageIdMap.get(message.replyToMessageId);
    if (questionId === undefined) return;

    // 5. Check if question still pending
    const existing = await this.questionStore.getQuestion(questionId);
    if (existing === null) {
      try {
        await this.discord.replyToMessage(
          this.openQuestionsChannelId!,
          message.id,
          "This question has already been resolved.",
        );
      } catch (error) {
        this.logger.warn(
          `Failed to reply to message: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }

    // 6. Check if already answered
    if (existing.answer !== null) {
      try {
        await this.discord.replyToMessage(
          this.openQuestionsChannelId!,
          message.id,
          "This question already has an answer.",
        );
      } catch (error) {
        this.logger.warn(
          `Failed to reply to message: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }

    // 7. Write answer
    await this.questionStore.setAnswer(questionId, message.content);

    // 8. Confirm (best-effort)
    try {
      await this.discord.addReaction(this.openQuestionsChannelId!, message.id, "✅");
    } catch (error) {
      this.logger.warn(
        `Failed to add ✅ reaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executePatternBResume(question: PendingQuestion): Promise<void> {
    // Generate worktree identifiers
    let invocationId = randomBytes(4).toString("hex");
    let branch = `ptah/${question.agentId}/${question.threadId}/${invocationId}`;
    let worktreePath = join(tmpdir(), "ptah-worktrees", invocationId);

    // Branch-already-exists guard
    try {
      branch = await this.ensureUniqueBranch(
        question.agentId,
        question.threadId,
        invocationId,
        branch,
        worktreePath,
      );
      const parts = branch.split("/");
      const newInvocationId = parts[parts.length - 1];
      worktreePath = join(tmpdir(), "ptah-worktrees", newInvocationId);
    } catch {
      // Continue with original
    }

    // Build synthetic trigger message
    const threadHistory = await this.discord.readThreadHistory(question.threadId);
    const syntheticTrigger: ThreadMessage = {
      id: `pattern-b-resume-${question.id}`,
      threadId: question.threadId,
      threadName: question.threadName,
      parentChannelId: threadHistory[0]?.parentChannelId ?? "",
      authorId: this.config.discord.mention_user_id,
      authorName: "User",
      isBot: false,
      content: question.answer!,
      timestamp: new Date(),
    };

    // Create worktree from the feature branch (not HEAD)
    const patternBBaseBranch = featureBranchName(extractFeatureName(question.threadName));
    try {
      await this.gitClient.createWorktreeFromBranch(branch, worktreePath, patternBBaseBranch);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.responsePoster.postErrorEmbed(
        question.threadId,
        `Worktree creation failed (Pattern B): ${errorMessage}`,
      );
      await this.writeLogEntry(question.agentId, syntheticTrigger, "error", null);
      return;
    }

    try {
      // Build Pattern B context
      const bundle = await this.patternBContextBuilder.build({
        question,
        worktreePath,
        config: this.config,
        threadHistory,
      });

      this.logger.info(`--- Prompt for ${question.agentId} (thread: "${question.threadName}", pattern: pattern_b) ---`);
      this.logger.info(`[System Prompt] (${bundle.tokenCounts.layer1} L1 + ${bundle.tokenCounts.layer2} L2 tokens):\n${bundle.systemPrompt}`);
      this.logger.info(`[User Message] (${bundle.tokenCounts.layer3} tokens):\n${bundle.userMessage}`);
      this.logger.info(`--- End prompt for ${question.agentId} ---`);

      // Invoke skill
      const result = await this.skillInvoker.invoke(bundle, this.config, worktreePath);

      // Artifact commit & merge
      const agentDisplayName = formatAgentName(question.agentId);
      const commitResult = await this.artifactCommitter.commitAndMerge({
        agentId: question.agentId,
        threadName: question.threadName,
        worktreePath,
        branch,
        featureBranch: patternBBaseBranch,
        artifactChanges: result.artifactChanges,
      });

      await this.handleCommitResult(commitResult, syntheticTrigger, worktreePath, branch, agentDisplayName);

      if (commitResult.mergeStatus === "no-changes") {
        await this.cleanupWorktree(worktreePath, branch);
      }

      const logStatus = deriveLogStatus(commitResult);
      await this.writeLogEntry(question.agentId, syntheticTrigger, logStatus, commitResult.commitSha);

      // Post response (best-effort — post-invocation Discord errors do not block archival)
      try {
        await this.responsePoster.postAgentResponse({
          threadId: question.threadId,
          agentId: question.agentId,
          text: result.textResponse,
          config: this.config,
          footer: `${result.durationMs}ms`,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to post Pattern B response to Discord: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Remove from paused threads
      this.pausedThreadIds.delete(question.threadId);

      // Archive the question
      await this.questionStore.archiveQuestion(question.id, new Date());

      // Parse routing signal and continue
      const signal = this.routingEngine.parseSignal(result.routingSignalRaw);

      // Check if this feature is PDLC-managed
      let featureSlug: string;
      try {
        featureSlug = featureNameToSlug(extractFeatureName(question.threadName));
      } catch {
        featureSlug = "";
      }
      const isManaged = featureSlug ? await this.pdlcDispatcher.isManaged(featureSlug) : false;

      if (isManaged) {
        // PDLC-managed path — mirror executeRoutingLoop logic
        if (signal.type === "LGTM" || signal.type === "TASK_COMPLETE") {
          const featureState = await this.pdlcDispatcher.getFeatureState(featureSlug);
          const isReviewPhase = featureState != null && REVIEW_PHASES.has(featureState.phase);

          let dispatchAction: DispatchAction;
          if (isReviewPhase) {
            dispatchAction = await this.pdlcDispatcher.processReviewCompletion({
              featureSlug,
              reviewerAgentId: question.agentId,
              worktreePath,
            });
          } else {
            dispatchAction = await this.pdlcDispatcher.processAgentCompletion({
              featureSlug,
              agentId: question.agentId,
              signal: signal.type as "LGTM" | "TASK_COMPLETE",
              worktreePath,
            });
          }
          await this.handleDispatchAction(
            dispatchAction,
            syntheticTrigger,
            question.agentId,
            result.textResponse,
            worktreePath,
          );
          return;
        }

        if (signal.type === "ROUTE_TO_USER") {
          const questionText = (signal as { question?: string }).question ?? "Awaiting user input.";
          await this.handleRouteToUser(questionText, syntheticTrigger, question.agentId);
          return;
        }

        if (signal.type === "ROUTE_TO_AGENT") {
          const targetAgentId = (signal as { agentId?: string }).agentId;
          if (targetAgentId) {
            // Guard: reject routing to non-reviewers during review phases
            const pbManagedState = await this.pdlcDispatcher.getFeatureState(featureSlug);
            if (pbManagedState && REVIEW_PHASES.has(pbManagedState.phase)) {
              const manifest = computeReviewerManifest(pbManagedState.phase, pbManagedState.config.discipline);
              const allowedAgentIds = new Set(manifest.map(e => e.agentId));
              if (!allowedAgentIds.has(targetAgentId)) {
                this.logger.warn(
                  `Blocked managed Pattern B ROUTE_TO_AGENT → "${targetAgentId}" during ${pbManagedState.phase}: not in reviewer manifest [${[...allowedAgentIds].join(", ")}]`,
                );
                await this.responsePoster.postProgressEmbed(
                  question.threadId,
                  `Blocked routing to **${formatAgentName(targetAgentId)}** — not an authorized reviewer for this phase.`,
                );
                return;
              }
            }
            await this.executeRoutingLoop(targetAgentId, syntheticTrigger);
          }
          return;
        }

        // Unknown signal in managed feature — treat as terminal
        return;
      }

      // Unmanaged feature: use legacy RoutingEngine.decide() path
      const decision = this.routingEngine.decide(signal, this.config);

      if (decision.isTerminal) {
        await this.responsePoster.postCompletionEmbed(
          question.threadId,
          question.agentId,
          this.config,
        );
        return;
      }

      if (decision.isPaused) {
        await this.handleRouteToUser(
          decision.signal.question ?? "Awaiting user input.",
          syntheticTrigger,
          question.agentId,
        );
        return;
      }

      if (decision.createNewThread) {
        const featureName = bundle.featureName;
        await this.responsePoster.createCoordinationThread({
          channelId: syntheticTrigger.parentChannelId,
          featureName,
          description: `Coordination with ${decision.targetAgentId}`,
          agentId: decision.targetAgentId!,
          initialText: result.textResponse,
          config: this.config,
        });
        return;
      }

      // ROUTE_TO_AGENT — guard non-reviewers, then continue with executeRoutingLoop
      let patternBSlug: string | null = null;
      try {
        patternBSlug = featureNameToSlug(extractFeatureName(question.threadName));
      } catch {
        // Slug resolution failed — skip guard
      }
      if (patternBSlug) {
        const pbState = await this.pdlcDispatcher.getFeatureState(patternBSlug);
        if (pbState && REVIEW_PHASES.has(pbState.phase)) {
          const manifest = computeReviewerManifest(pbState.phase, pbState.config.discipline);
          const allowedAgentIds = new Set(manifest.map(e => e.agentId));
          if (!allowedAgentIds.has(decision.targetAgentId!)) {
            this.logger.warn(
              `Blocked Pattern B ROUTE_TO_AGENT → "${decision.targetAgentId}" during ${pbState.phase}: not in reviewer manifest [${[...allowedAgentIds].join(", ")}]`,
            );
            await this.responsePoster.postProgressEmbed(
              question.threadId,
              `Blocked routing to **${formatAgentName(decision.targetAgentId!)}** — not an authorized reviewer for this phase.`,
            );
            return;
          }
        }
      }
      await this.executeRoutingLoop(decision.targetAgentId!, syntheticTrigger);
    } catch (error) {
      await this.cleanupWorktree(worktreePath, branch);
      await this.writeLogEntry(question.agentId, syntheticTrigger, "error", null);

      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.responsePoster.postErrorEmbed(
        question.threadId,
        `Pattern B resume failed: ${errorMessage}`,
      );
      // Question remains in pending.md for retry — do NOT clear pausedThreadIds
    }
  }

  private async ensureUniqueBranch(
    agentId: string,
    threadId: string,
    invocationId: string,
    branch: string,
    worktreePath: string,
  ): Promise<string> {
    const maxAttempts = 3;
    let currentBranch = branch;
    let currentInvocationId = invocationId;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const exists = await this.gitClient.branchExists(currentBranch);
      if (!exists) {
        return currentBranch;
      }

      const hasCommits = await this.gitClient.hasUnmergedCommits(currentBranch);
      if (hasCommits) {
        // Regenerate invocationId
        currentInvocationId = randomBytes(4).toString("hex");
        currentBranch = `ptah/${agentId}/${threadId}/${currentInvocationId}`;
      } else {
        // Delete leftover branch
        await this.gitClient.deleteBranch(currentBranch);
        return currentBranch;
      }
    }

    return currentBranch;
  }

  private async handleCommitResult(
    commitResult: CommitResult,
    triggerMessage: ThreadMessage,
    worktreePath: string,
    branch: string,
    agentDisplayName: string,
  ): Promise<void> {
    switch (commitResult.mergeStatus) {
      case "conflict":
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Merge conflict: ${agentDisplayName}'s changes in ${branch} ` +
            `conflict with recent changes on main. The worktree has been ` +
            `retained at ${worktreePath} for manual resolution.`,
        );
        this.logger.error(
          `Merge conflict for ${branch}: ${commitResult.conflictMessage}`,
        );
        break;

      case "commit-error":
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Commit failed: ${commitResult.conflictMessage}`,
        );
        this.logger.error(
          `Commit error for ${branch}: ${commitResult.conflictMessage}`,
        );
        await this.cleanupWorktree(worktreePath, branch);
        break;

      case "merge-error":
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Merge failed: ${commitResult.conflictMessage}. ` +
            `Worktree retained at ${worktreePath} for manual resolution.`,
        );
        this.logger.error(
          `Merge error for ${branch}: ${commitResult.conflictMessage}`,
        );
        break;

      case "lock-timeout":
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Merge lock timeout: could not acquire merge lock within 10s. ` +
            `Worktree retained for manual resolution.`,
        );
        this.logger.error(`Merge lock timeout for ${branch}`);
        break;
    }
  }

  private async writeLogEntry(
    agentId: string,
    triggerMessage: ThreadMessage,
    status: LogStatus,
    commitSha: string | null,
  ): Promise<void> {
    const summary = extractDescription(triggerMessage.threadName);
    const entry: LogEntry = {
      timestamp: new Date(),
      agentId,
      threadId: triggerMessage.threadId,
      threadName: triggerMessage.threadName,
      status,
      commitSha,
      summary,
    };
    try {
      await this.agentLogWriter.append(entry);
    } catch (error) {
      this.logger.warn(
        `Failed to write log entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async cleanupWorktree(worktreePath: string, branch: string): Promise<void> {
    try {
      await this.gitClient.removeWorktree(worktreePath);
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.gitClient.deleteBranch(branch);
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup branch ${branch}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// --- Helper functions ---

function deriveLogStatus(commitResult: CommitResult): LogStatus {
  switch (commitResult.mergeStatus) {
    case "merged":
      return "completed";
    case "no-changes":
      return "completed (no changes)";
    case "conflict":
      return "conflict";
    case "merge-error":
      return "conflict";
    default:
      return "error"; // commit-error, lock-timeout
  }
}

function extractDescription(threadName: string): string {
  const emDashIndex = threadName.indexOf(" \u2014 ");
  if (emDashIndex !== -1) {
    return threadName.slice(emDashIndex + 3);
  }
  return threadName;
}

function formatAgentName(agentId: string): string {
  return agentId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// --- PDLC Auto-Init Helpers (Feature 013) ---

/** @internal — exported for testing only */
export function countPriorAgentTurns(history: ThreadMessage[]): number {
  return history.filter(m => m.isBot && m.content.includes("<routing>")).length;
}

/**
 * Scope constraint: parses initialMessage.content only.
 * Thread-name scanning deferred (OQ-02).
 *
 * @internal — exported for testing only
 */
export function parseKeywords(text: string | null | undefined): FeatureConfig {
  const DEFAULT_CONFIG: FeatureConfig = { discipline: "backend-only", skipFspec: false };
  if (!text) return { ...DEFAULT_CONFIG };

  const tokenRegex = /\[([^\s\[\]]+)\]/g;
  let discipline: Discipline = "backend-only";
  let skipFspec = false;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const token = match[1];
    switch (token) {
      case "backend-only":
        discipline = "backend-only";
        break;
      case "frontend-only":
        discipline = "frontend-only";
        break;
      case "fullstack":
        discipline = "fullstack";
        break;
      case "skip-fspec":
        skipFspec = true;
        break;
      // Unknown tokens: ignore (no error, no log)
    }
  }

  return { discipline, skipFspec };
}

export const AGE_GUARD_THRESHOLD = 1;

export type AgeGuardResult = { eligible: true } | { eligible: false; turnCount: number };

/** @internal — exported for testing only */
export function evaluateAgeGuard(history: ThreadMessage[], logger: Logger): AgeGuardResult {
  try {
    const count = countPriorAgentTurns(history);
    return count <= AGE_GUARD_THRESHOLD
      ? { eligible: true }
      : { eligible: false, turnCount: count };
  } catch (err) {
    logger.warn(
      `[ptah] evaluateAgeGuard: unexpected error counting agent turns — failing open: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { eligible: true };
  }
}
