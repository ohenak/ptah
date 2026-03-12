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
  private pausedThreadIds = new Set<string>();
  private openQuestionsChannelId: string | null = null;
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
    const debugChannelId = await this.discord.findChannelByName(
      this.config.discord.server_id,
      this.config.discord.channels.debug,
    );
    if (debugChannelId) {
      this.logger.info(`Resolved debug channel: ${debugChannelId}`);
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
      this.logger.debug(`Dropping message for paused thread ${message.threadId}`);
      return;
    }

    // Step 2: Ignore bot messages
    if (message.isBot) {
      return;
    }

    // Step 3: Resolve agent from human message
    const agentId = this.routingEngine.resolveHumanMessage(message, this.config);

    // Step 4: If no agent, post system message
    if (!agentId) {
      await this.discord.postSystemMessage(
        message.threadId,
        "Please @mention a role to direct your message to a specific agent.",
      );
      return;
    }

    // Step 5: Run the routing loop starting with the resolved agent
    await this.executeRoutingLoop(agentId, message);
  }

  private async executeRoutingLoop(
    initialAgentId: string,
    triggerMessage: ThreadMessage,
  ): Promise<void> {
    let currentAgentId = initialAgentId;

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

      // Create worktree (outer try — if this fails, no cleanup needed)
      try {
        await this.gitClient.createWorktree(branch, worktreePath);
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

      try {
        // Read thread history
        const threadHistory = await this.discord.readThreadHistory(
          triggerMessage.threadId,
        );

        // Assemble context (with worktreePath for Layer 2)
        const bundle = await this.contextAssembler.assemble({
          agentId: currentAgentId,
          threadId: triggerMessage.threadId,
          threadName: triggerMessage.threadName,
          threadHistory,
          triggerMessage,
          config: this.config,
          worktreePath,
        });

        // Invoke skill (with worktreePath)
        const result = await this.skillInvoker.invoke(bundle, this.config, worktreePath);

        // Artifact commit & merge
        const agentDisplayName = formatAgentName(currentAgentId);
        const commitResult = await this.artifactCommitter.commitAndMerge({
          agentId: currentAgentId,
          threadName: triggerMessage.threadName,
          worktreePath,
          branch,
          artifactChanges: result.artifactChanges,
        });

        // Handle commit/merge error embeds
        await this.handleCommitResult(commitResult, triggerMessage, worktreePath, branch, agentDisplayName);

        // Cleanup worktree on no-changes path
        if (commitResult.mergeStatus === "no-changes") {
          await this.cleanupWorktree(worktreePath, branch);
        }

        // Write agent log (always)
        const logStatus = deriveLogStatus(commitResult);
        await this.writeLogEntry(
          currentAgentId,
          triggerMessage,
          logStatus,
          commitResult.commitSha,
        );

        // Post agent response
        await this.responsePoster.postAgentResponse({
          threadId: triggerMessage.threadId,
          agentId: currentAgentId,
          text: result.textResponse,
          config: this.config,
          footer: `${result.durationMs}ms`,
        });

        // Parse routing signal
        const signal = this.routingEngine.parseSignal(result.routingSignalRaw);

        // Decide next action
        const decision = this.routingEngine.decide(signal, this.config);

        // Handle decision
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
        currentAgentId = decision.targetAgentId!;
        // Continue the while loop
      } catch (error) {
        // Skill timeout/error — cleanup worktree, no commit
        await this.cleanupWorktree(worktreePath, branch);

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
          await this.responsePoster.postErrorEmbed(
            triggerMessage.threadId,
            "Skill invocation timed out (>90s)",
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

    // Create worktree
    try {
      await this.gitClient.createWorktree(branch, worktreePath);
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

      // Invoke skill
      const result = await this.skillInvoker.invoke(bundle, this.config, worktreePath);

      // Artifact commit & merge
      const agentDisplayName = formatAgentName(question.agentId);
      const commitResult = await this.artifactCommitter.commitAndMerge({
        agentId: question.agentId,
        threadName: question.threadName,
        worktreePath,
        branch,
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

      // ROUTE_TO_AGENT — continue with executeRoutingLoop
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
