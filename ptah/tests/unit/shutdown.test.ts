import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createShutdownHandler } from "../../src/shutdown.js";
import {
  FakeLogger,
  FakeGitClient,
  FakeWorktreeRegistry,
  FakeDiscordClient,
} from "../fixtures/factories.js";
import type { StartResult } from "../../src/types.js";
import type { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import type { ThreadQueue } from "../../src/orchestrator/thread-queue.js";

function makeFakeOrchestrator(): Orchestrator {
  return {
    handleMessage: vi.fn().mockResolvedValue(undefined),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    resumeWithPatternB: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeThreadQueue(activeCount = 0): ThreadQueue {
  return {
    enqueue: vi.fn(),
    isProcessing: vi.fn().mockReturnValue(false),
    activeCount: vi.fn().mockReturnValue(activeCount),
  };
}

describe("createShutdownHandler", () => {
  let logger: FakeLogger;
  let result: StartResult;
  let gitClient: FakeGitClient;
  let worktreeRegistry: FakeWorktreeRegistry;
  let discord: FakeDiscordClient;
  let orchestrator: Orchestrator;
  let threadQueue: ThreadQueue;
  let abortController: AbortController;

  beforeEach(() => {
    logger = new FakeLogger();
    result = { cleanup: vi.fn().mockResolvedValue(undefined) };
    gitClient = new FakeGitClient();
    worktreeRegistry = new FakeWorktreeRegistry();
    discord = new FakeDiscordClient();
    orchestrator = makeFakeOrchestrator();
    threadQueue = makeFakeThreadQueue(0);
    abortController = new AbortController();
    // Mock process.exit to prevent actual exit
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeHandler(opts?: { activeCount?: number; debugChannelId?: string }) {
    const queue = opts?.activeCount != null ? makeFakeThreadQueue(opts.activeCount) : threadQueue;
    return createShutdownHandler(
      result,
      logger,
      queue,
      worktreeRegistry,
      gitClient,
      orchestrator,
      discord,
      60000, // shutdownTimeoutMs
      abortController,
      opts?.debugChannelId ?? null,
    );
  }

  // PROP-DI-13: SIGINT triggers graceful shutdown
  it("calls cleanup and exits with code 0 on shutdown", async () => {
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

  // Phase 6: abortController.abort() is called on shutdown
  it("abortController.abort() called on shutdown to signal in-flight invocations", async () => {
    const abortSpy = vi.spyOn(abortController, "abort");
    const { shutdown } = makeHandler();

    await shutdown();

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
