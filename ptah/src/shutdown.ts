import type { Logger } from "./services/logger.js";
import type { StartResult } from "./types.js";
import type { ThreadQueue } from "./orchestrator/thread-queue.js";
import type { WorktreeRegistry } from "./orchestrator/worktree-registry.js";
import type { GitClient } from "./services/git.js";
import type { Orchestrator } from "./orchestrator/orchestrator.js";
import type { DiscordClient } from "./services/discord.js";

export interface ShutdownHandler {
  shutdown: () => Promise<void>;
  registerSignals: () => void;
}

export function createShutdownHandler(
  result: StartResult,
  logger: Logger,
  threadQueue: ThreadQueue,
  worktreeRegistry: WorktreeRegistry,
  gitClient: GitClient,
  orchestrator: Orchestrator,
  discord: DiscordClient,
  shutdownTimeoutMs: number,
  abortController: AbortController,
  debugChannelId?: string | null,
): ShutdownHandler {
  let shuttingDown = false;
  let exitCode = 0;

  const shutdown = async (): Promise<void> => {
    // Step 1: Double-SIGINT guard
    if (shuttingDown) {
      process.exit(1);
      return;
    }
    shuttingDown = true;

    // Step 2: Enter shutdown mode
    abortController.abort();
    logger.info("[ptah] Shutdown signal received. Waiting for in-flight invocations to complete...");

    // Best-effort: post to #agent-debug
    if (debugChannelId) {
      try {
        await discord.postChannelMessage(debugChannelId,
          "[ptah] System shutting down. Active threads will complete their current invocation. No new messages will be processed."
        );
      } catch {
        logger.warn("Failed to post shutdown notice to #agent-debug");
      }
    }

    // Step 3: Wait for in-flight invocations
    const startTime = Date.now();
    let lastLog = Date.now();
    while (threadQueue.activeCount() > 0) {
      if (Date.now() - startTime >= shutdownTimeoutMs) {
        logger.warn(`[ptah] Shutdown timeout exceeded (${shutdownTimeoutMs}ms). Forcing exit.`);
        exitCode = 1;
        break;
      }
      if (Date.now() - lastLog >= 5000) {
        logger.info(`[ptah] Waiting for ${threadQueue.activeCount()} in-flight invocation(s) to complete...`);
        lastLog = Date.now();
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (exitCode === 0) {
      // Step 4: Commit pending Git changes
      const worktrees = worktreeRegistry.getAll();
      for (const { worktreePath } of worktrees) {
        try {
          const hasChanges = await gitClient.hasUncommittedChanges(worktreePath);
          if (hasChanges) {
            await gitClient.addAllInWorktree(worktreePath);
            await gitClient.commitInWorktree(
              worktreePath,
              "[ptah] System: shutdown commit \u2014 uncommitted changes preserved",
            );
            logger.info(`[ptah] Committed pending Git changes in ${worktreePath}.`);
          }
        } catch (error) {
          logger.warn(`[ptah] Failed to commit changes in ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Step 5: Stop orchestrator (question poller etc.)
    try {
      await orchestrator.shutdown();
    } catch (error) {
      logger.warn(`[ptah] Orchestrator shutdown error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 6: Disconnect Discord (5s timeout)
    try {
      await Promise.race([
        discord.disconnect(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("disconnect timeout")), 5000)),
      ]);
    } catch {
      logger.warn("[ptah] Discord disconnect timed out or failed, force-closing.");
    }
    logger.info("Disconnected from Discord. Goodbye.");

    // Step 7: Exit
    process.exit(exitCode);
  };

  const registerSignals = (): void => {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  };

  return { shutdown, registerSignals };
}
