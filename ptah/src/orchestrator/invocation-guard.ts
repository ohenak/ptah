import type { SkillInvoker } from "./skill-invoker.js";
import { InvocationTimeoutError } from "./skill-invoker.js";
import type { ArtifactCommitter } from "./artifact-committer.js";
import type { GitClient } from "../services/git.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";
import type { ContextBundle, PtahConfig, InvocationResult, CommitResult, UserFacingErrorContext } from "../types.js";
import { RoutingParseError } from "./router.js";
import type { ResponsePoster } from "./response-poster.js";
import { buildErrorMessage } from "./error-messages.js";

export type FailureCategory = "transient" | "unrecoverable";

export interface InvocationGuardParams {
  agentId: string;
  threadId: string;
  threadName: string;
  bundle: ContextBundle;
  worktreePath: string;
  branch: string;
  featureBranch: string;
  config: PtahConfig;
  shutdownSignal: AbortSignal;
  debugChannelId: string | null;
}

export type GuardResult =
  | { status: "success"; invocationResult: InvocationResult; commitResult: CommitResult }
  | { status: "exhausted" }
  | { status: "unrecoverable" }
  | { status: "shutdown" };

export interface InvocationGuard {
  invokeWithRetry(params: InvocationGuardParams): Promise<GuardResult>;
}

export class DefaultInvocationGuard implements InvocationGuard {
  private readonly logger: Logger;
  private readonly responsePoster: ResponsePoster;

  constructor(
    private readonly skillInvoker: SkillInvoker,
    private readonly artifactCommitter: ArtifactCommitter,
    private readonly gitClient: GitClient,
    private readonly discordClient: DiscordClient,
    responsePoster: ResponsePoster,
    logger: Logger,
  ) {
    this.responsePoster = responsePoster;
    this.logger = logger.forComponent('invocation-guard');
  }

  async invokeWithRetry(params: InvocationGuardParams): Promise<GuardResult> {
    const {
      agentId, threadId, threadName, bundle, worktreePath, branch, featureBranch,
      config, shutdownSignal, debugChannelId,
    } = params;

    const retryAttempts = config.orchestrator.retry_attempts ?? 3;
    const retryBaseDelayMs = config.orchestrator.retry_base_delay_ms ?? 2000;
    const retryMaxDelayMs = config.orchestrator.retry_max_delay_ms ?? 30000;

    let retryCount = 0;
    let malformedSignalCount = 0;
    let lastError: Error | null = null;
    let category: FailureCategory = "transient";

    while (true) {
      // Step 1: Invoke skill
      let invocationResult: InvocationResult;
      try {
        invocationResult = await this.skillInvoker.invoke(bundle, config, worktreePath);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        category = this.classifyError(lastError, malformedSignalCount);
        if (error instanceof RoutingParseError) {
          malformedSignalCount++;
          category = malformedSignalCount >= 2 ? "unrecoverable" : "transient";
        }
        if (category === "unrecoverable" || retryCount >= retryAttempts) {
          return await this.handleExhaustion(
            agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId, retryAttempts,
            category === "unrecoverable",
          );
        }
        retryCount++;
        const delayMs = this.computeBackoffDelay(retryCount, retryBaseDelayMs, retryMaxDelayMs);
        await this.postToDebugChannel(debugChannelId,
          `[ptah] Retry ${retryCount}/${retryAttempts} for ${agentId} in thread ${threadName} — retrying in ${delayMs}ms. Error: ${lastError.message}`);
        const delayed = await this.waitWithBackoff(delayMs, shutdownSignal);
        if (!delayed) {
          await this.handleShutdownAbort(agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId);
          return { status: "shutdown" };
        }
        await this.resetWorktree(worktreePath);
        continue;
      }

      // Step 2: Check for malformed/missing routing signal (GR-R6)
      const hasRoutingTag = invocationResult.routingSignalRaw &&
        /<routing>\s*\{/.test(invocationResult.routingSignalRaw);
      if (!hasRoutingTag) {
        malformedSignalCount++;
        lastError = new Error(`Missing routing signal in response (count: ${malformedSignalCount})`);
        if (malformedSignalCount >= 2) {
          category = "unrecoverable";
          return await this.handleExhaustion(
            agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId, retryAttempts, true,
          );
        }
        category = "transient";
        retryCount++;
        const delayMs = this.computeBackoffDelay(retryCount, retryBaseDelayMs, retryMaxDelayMs);
        await this.postToDebugChannel(debugChannelId,
          `[ptah] Retry ${retryCount}/${retryAttempts} for ${agentId} in thread ${threadName} — retrying in ${delayMs}ms. Error: ${lastError.message}`);
        const delayed = await this.waitWithBackoff(delayMs, shutdownSignal);
        if (!delayed) {
          await this.handleShutdownAbort(agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId);
          return { status: "shutdown" };
        }
        await this.resetWorktree(worktreePath);
        continue;
      }

      // Step 3: Commit artifacts
      let commitResult: CommitResult;
      try {
        commitResult = await this.artifactCommitter.commitAndMerge({
          agentId, threadName, worktreePath, branch, featureBranch,
          artifactChanges: invocationResult.artifactChanges,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        category = "transient";
        if (retryCount >= retryAttempts) {
          return await this.handleExhaustion(
            agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId, retryAttempts,
          );
        }
        retryCount++;
        const delayMs = this.computeBackoffDelay(retryCount, retryBaseDelayMs, retryMaxDelayMs);
        await this.postToDebugChannel(debugChannelId,
          `[ptah] Retry ${retryCount}/${retryAttempts} for ${agentId} in thread ${threadName} — retrying in ${delayMs}ms. Error: ${lastError.message}`);
        const delayed = await this.waitWithBackoff(delayMs, shutdownSignal);
        if (!delayed) {
          await this.handleShutdownAbort(agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId);
          return { status: "shutdown" };
        }
        await this.resetWorktree(worktreePath);
        continue;
      }

      // Check for unrecoverable commit status (conflict)
      if (commitResult.mergeStatus === "conflict") {
        lastError = new Error(`Merge conflict: ${commitResult.conflictMessage ?? "unknown"}`);
        return await this.handleExhaustion(
          agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId, retryAttempts, true,
        );
      }

      // Check for transient commit statuses (returned, not thrown)
      if (
        commitResult.mergeStatus === "commit-error" ||
        commitResult.mergeStatus === "lock-timeout" ||
        commitResult.mergeStatus === "merge-error"
      ) {
        lastError = new Error(`Commit transient failure: ${commitResult.mergeStatus}`);
        category = "transient";
        if (retryCount >= retryAttempts) {
          return await this.handleExhaustion(
            agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId, retryAttempts,
          );
        }
        retryCount++;
        const delayMs = this.computeBackoffDelay(retryCount, retryBaseDelayMs, retryMaxDelayMs);
        await this.postToDebugChannel(debugChannelId,
          `[ptah] Retry ${retryCount}/${retryAttempts} for ${agentId} in thread ${threadName} — retrying in ${delayMs}ms. Error: ${lastError.message}`);
        const delayed = await this.waitWithBackoff(delayMs, shutdownSignal);
        if (!delayed) {
          await this.handleShutdownAbort(agentId, threadId, threadName, worktreePath, branch, lastError, debugChannelId);
          return { status: "shutdown" };
        }
        await this.resetWorktree(worktreePath);
        continue;
      }

      // Step 4: SUCCESS
      if (retryCount > 0) {
        await this.postToDebugChannel(debugChannelId,
          `[ptah] Retry succeeded for ${agentId} in thread ${threadName} after ${retryCount} attempt(s).`);
      }
      return { status: "success", invocationResult, commitResult };
    }
  }

  private classifyError(error: Error, _malformedCount: number): FailureCategory {
    if (error instanceof InvocationTimeoutError) return "transient";
    const msg = error.message.toLowerCase();
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("authentication")) {
      return "unrecoverable";
    }
    return "transient";
  }

  private computeBackoffDelay(retryCount: number, baseDelayMs: number, maxDelayMs: number): number {
    return Math.min(baseDelayMs * Math.pow(2, retryCount - 1), maxDelayMs);
  }

  private async waitWithBackoff(
    delayMs: number,
    shutdownSignal: AbortSignal,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (shutdownSignal.aborted) {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        shutdownSignal.removeEventListener("abort", onAbort);
        resolve(true);
      }, delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        resolve(false);
      };
      shutdownSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async resetWorktree(worktreePath: string): Promise<void> {
    try {
      await this.gitClient.resetHardInWorktree(worktreePath);
      await this.gitClient.cleanInWorktree(worktreePath);
    } catch (error) {
      this.logger.warn(`Failed to reset worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleExhaustion(
    agentId: string,
    threadId: string,
    threadName: string,
    worktreePath: string,
    branch: string,
    lastError: Error | null,
    debugChannelId: string | null,
    retryAttempts: number,
    isUnrecoverable = false,
  ): Promise<GuardResult> {
    const errMsg = lastError?.message ?? "Unknown error";
    const stack = lastError?.stack ?? "";

    await this.postToDebugChannel(debugChannelId,
      `[ptah] ERROR: All ${retryAttempts} retries exhausted for ${agentId} in thread ${threadName}. Giving up. Final error: ${errMsg}\nStacktrace: ${stack}`
    );

    try {
      await this.postErrorEmbed(threadId, agentId, errMsg);
    } catch (embedError) {
      this.logger.warn(`Failed to post error embed: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
    }

    await this.cleanupWorktree(worktreePath, branch);

    return isUnrecoverable ? { status: "unrecoverable" } : { status: "exhausted" };
  }

  private async handleShutdownAbort(
    agentId: string,
    threadId: string,
    threadName: string,
    worktreePath: string,
    branch: string,
    lastError: Error | null,
    debugChannelId: string | null,
  ): Promise<void> {
    const errMsg = lastError?.message ?? "Shutdown interrupted";
    await this.postToDebugChannel(debugChannelId,
      `[ptah] SHUTDOWN: Backoff interrupted for ${agentId} in thread ${threadName}. Error: ${errMsg}`
    );
    try {
      await this.postErrorEmbed(threadId, agentId, errMsg);
    } catch (embedError) {
      this.logger.warn(`Failed to post shutdown error embed: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
    }
    await this.cleanupWorktree(worktreePath, branch);
  }

  private async postErrorEmbed(threadId: string, agentId: string, _errorMessage: string): Promise<void> {
    const context: UserFacingErrorContext = { agentDisplayName: agentId, agentId };
    const msg = buildErrorMessage('ERR-RP-01', context);
    this.logger.error(msg.whatHappened);
    await this.responsePoster.postErrorReportEmbed({ threadId, errorType: 'ERR-RP-01', context });
  }

  private async postToDebugChannel(debugChannelId: string | null, message: string): Promise<void> {
    if (!debugChannelId) return;
    try {
      await this.discordClient.postChannelMessage(debugChannelId, message);
    } catch {
      this.logger.warn(`Failed to post to #agent-debug`);
    }
  }

  private async cleanupWorktree(worktreePath: string, branch: string): Promise<void> {
    try {
      await this.gitClient.removeWorktree(worktreePath);
    } catch (error) {
      this.logger.warn(`Failed to remove worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await this.gitClient.deleteBranch(branch);
    } catch (error) {
      this.logger.warn(`Failed to delete branch ${branch}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
