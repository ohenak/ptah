import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createShutdownHandler } from "../../src/shutdown.js";
import { FakeLogger } from "../fixtures/factories.js";
import type { StartResult } from "../../src/types.js";

describe("createShutdownHandler", () => {
  let logger: FakeLogger;
  let cleanupFn: ReturnType<typeof vi.fn>;
  let result: StartResult;

  beforeEach(() => {
    logger = new FakeLogger();
    cleanupFn = vi.fn().mockResolvedValue(undefined);
    result = { cleanup: cleanupFn };
    // Mock process.exit to prevent actual exit
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // PROP-DI-13: SIGINT triggers graceful shutdown
  it("calls cleanup and exits with code 0 on shutdown", async () => {
    const { shutdown } = createShutdownHandler(result, logger);

    await shutdown();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(logger.messages).toContainEqual({ level: "info", message: "Shutting down..." });
    expect(logger.messages).toContainEqual({ level: "info", message: "Disconnected from Discord. Goodbye." });
  });

  // PROP-DI-14: SIGTERM triggers same graceful shutdown
  it("registers both SIGINT and SIGTERM handlers", () => {
    const onSpy = vi.spyOn(process, "on");
    const { registerSignals } = createShutdownHandler(result, logger);

    registerSignals();

    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });

  // PROP-DI-47: shuttingDown guard prevents concurrent shutdown
  it("prevents concurrent shutdown — second call is a no-op", async () => {
    const { shutdown } = createShutdownHandler(result, logger);

    // Call shutdown twice concurrently
    await Promise.all([shutdown(), shutdown()]);

    // cleanup should only be called once
    expect(cleanupFn).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledTimes(1);
  });

  it("logs shutdown sequence in correct order", async () => {
    const { shutdown } = createShutdownHandler(result, logger);

    await shutdown();

    const infoMessages = logger.messages
      .filter(m => m.level === "info")
      .map(m => m.message);

    const shutdownIdx = infoMessages.indexOf("Shutting down...");
    const goodbyeIdx = infoMessages.indexOf("Disconnected from Discord. Goodbye.");

    expect(shutdownIdx).toBeGreaterThanOrEqual(0);
    expect(goodbyeIdx).toBeGreaterThan(shutdownIdx);
  });
});
