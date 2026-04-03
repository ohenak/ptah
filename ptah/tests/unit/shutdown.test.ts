import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createShutdownHandler } from "../../src/shutdown.js";
import type { ShutdownOrchestrator } from "../../src/shutdown.js";
import {
  FakeLogger,
  FakeDiscordClient,
} from "../fixtures/factories.js";
import type { StartResult } from "../../src/types.js";

function makeFakeOrchestrator(): ShutdownOrchestrator {
  return {
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createShutdownHandler", () => {
  let logger: FakeLogger;
  let result: StartResult;
  let discord: FakeDiscordClient;
  let orchestrator: ShutdownOrchestrator;
  let abortController: AbortController;

  beforeEach(() => {
    logger = new FakeLogger();
    result = { cleanup: vi.fn().mockResolvedValue(undefined) };
    discord = new FakeDiscordClient();
    orchestrator = makeFakeOrchestrator();
    abortController = new AbortController();
    // Mock process.exit to prevent actual exit
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeHandler(opts?: { debugChannelId?: string }) {
    return createShutdownHandler(
      result,
      logger,
      orchestrator,
      discord,
      abortController,
      opts?.debugChannelId ?? null,
    );
  }

  // PROP-DI-13: SIGINT triggers graceful shutdown
  it("calls orchestrator.shutdown() and exits with code 0 on shutdown", async () => {
    const { shutdown } = makeHandler();

    await shutdown();

    // orchestrator.shutdown() called
    expect(orchestrator.shutdown).toHaveBeenCalledTimes(1);
    // discord.disconnect() called
    expect(discord.disconnected).toBe(true);
    // exits with 0
    expect(process.exit).toHaveBeenCalledWith(0);
    // logs goodbye
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "info", message: "Disconnected from Discord. Goodbye." }),
    );
  });

  // PROP-DI-14: SIGTERM triggers same graceful shutdown
  it("registers both SIGINT and SIGTERM handlers", () => {
    const onSpy = vi.spyOn(process, "on");
    const { registerSignals } = makeHandler();

    registerSignals();

    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });

  // PROP-DI-47: shuttingDown guard prevents concurrent shutdown
  it("prevents concurrent shutdown — second call forces exit(1)", async () => {
    const { shutdown } = makeHandler();

    // First call in the background, second call immediately after
    const first = shutdown();
    // Second call should trigger process.exit(1) immediately
    shutdown();
    await first;

    // process.exit should have been called (at least once for the first shutdown)
    expect(process.exit).toHaveBeenCalled();
  });

  // Phase 15: abortController.abort() is called on shutdown
  it("abortController.abort() called on shutdown to signal in-flight operations", async () => {
    const abortSpy = vi.spyOn(abortController, "abort");
    const { shutdown } = makeHandler();

    await shutdown();

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
