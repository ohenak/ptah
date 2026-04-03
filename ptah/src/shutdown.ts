import type { Logger } from "./services/logger.js";
import type { StartResult } from "./types.js";
import type { DiscordClient } from "./services/discord.js";

export interface ShutdownOrchestrator {
  shutdown: () => Promise<void>;
}

export interface ShutdownHandler {
  shutdown: () => Promise<void>;
  registerSignals: () => void;
}

export function createShutdownHandler(
  result: StartResult,
  logger: Logger,
  orchestrator: ShutdownOrchestrator,
  discord: DiscordClient,
  abortController: AbortController,
  debugChannelId?: string | null,
  debugServerId?: string,
): ShutdownHandler {
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    // Step 1: Double-SIGINT guard
    if (shuttingDown) {
      process.exit(1);
      return;
    }
    shuttingDown = true;

    // Step 2: Enter shutdown mode
    abortController.abort();
    logger.info("[ptah] Shutdown signal received. Shutting down...");

    // Best-effort: post to #agent-debug
    if (debugChannelId) {
      try {
        await discord.postChannelMessage(debugChannelId,
          "[ptah] System shutting down. Active workflows will continue in Temporal."
        );
      } catch {
        logger.warn("Failed to post shutdown notice to #agent-debug");
      }
    }

    // Step 3: Stop orchestrator (shuts down Temporal Worker + disconnects client)
    try {
      await orchestrator.shutdown();
    } catch (error) {
      logger.warn(`[ptah] Orchestrator shutdown error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 4: Disconnect Discord (5s timeout)
    try {
      await Promise.race([
        discord.disconnect(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("disconnect timeout")), 5000)),
      ]);
    } catch {
      logger.warn("[ptah] Discord disconnect timed out or failed, force-closing.");
    }
    logger.info("Disconnected from Discord. Goodbye.");

    // Step 5: Exit
    process.exit(0);
  };

  const registerSignals = (): void => {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  };

  return { shutdown, registerSignals };
}
