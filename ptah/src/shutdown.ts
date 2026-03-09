import type { Logger } from "./services/logger.js";
import type { StartResult } from "./types.js";

export interface ShutdownHandler {
  shutdown: () => Promise<void>;
  registerSignals: () => void;
}

export function createShutdownHandler(
  result: StartResult,
  logger: Logger,
): ShutdownHandler {
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down...");
    await result.cleanup();
    logger.info("Disconnected from Discord. Goodbye.");
    process.exit(0);
  };

  const registerSignals = (): void => {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  };

  return { shutdown, registerSignals };
}
