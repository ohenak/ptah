import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsoleLogger } from "../../../src/services/logger.js";

describe("ConsoleLogger", () => {
  let logger: ConsoleLogger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new ConsoleLogger();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("info() writes '[ptah] {message}' to stdout", () => {
    logger.info("Connected to Discord");
    expect(logSpy).toHaveBeenCalledWith("[ptah] Connected to Discord");
  });

  it("warn() writes '[ptah] WARN: {message}' to stdout", () => {
    logger.warn("Thread has >200 messages");
    expect(logSpy).toHaveBeenCalledWith("[ptah] WARN: Thread has >200 messages");
  });

  it("error() writes '[ptah] Error: {message}' to stderr", () => {
    logger.error("Connection failed");
    expect(errorSpy).toHaveBeenCalledWith("[ptah] Error: Connection failed");
  });

  describe("forComponent()", () => {
    it("returns a Logger instance", () => {
      const scoped = logger.forComponent("orchestrator");
      expect(scoped).toBeDefined();
      expect(typeof scoped.info).toBe("function");
      expect(typeof scoped.warn).toBe("function");
      expect(typeof scoped.error).toBe("function");
      expect(typeof scoped.debug).toBe("function");
    });

    it("scoped logger info() writes '[ptah:{component}] INFO: {message}' to stdout", () => {
      const scoped = logger.forComponent("orchestrator");
      scoped.info("starting up");
      expect(logSpy).toHaveBeenCalledWith("[ptah:orchestrator] INFO: starting up");
    });

    it("scoped logger warn() writes '[ptah:{component}] WARN: {message}' to stderr", () => {
      const scoped = logger.forComponent("router");
      scoped.warn("no agent found");
      expect(errorSpy).toHaveBeenCalledWith("[ptah:router] WARN: no agent found");
    });

    it("scoped logger error() writes '[ptah:{component}] ERROR: {message}' to stderr", () => {
      const scoped = logger.forComponent("skill-invoker");
      scoped.error("invocation failed");
      expect(errorSpy).toHaveBeenCalledWith("[ptah:skill-invoker] ERROR: invocation failed");
    });

    it("scoped logger debug() writes '[ptah:{component}] DEBUG: {message}' to stdout", () => {
      const scoped = logger.forComponent("discord");
      scoped.debug("raw event received");
      expect(logSpy).toHaveBeenCalledWith("[ptah:discord] DEBUG: raw event received");
    });

    it("scoped logger forComponent() returns a new scoped logger for the given component", () => {
      const scoped = logger.forComponent("orchestrator");
      const rescoped = scoped.forComponent("router");
      rescoped.info("re-scoped message");
      expect(logSpy).toHaveBeenCalledWith("[ptah:router] INFO: re-scoped message");
    });

    it("different components produce distinct prefix in output", () => {
      const orchestratorLog = logger.forComponent("orchestrator");
      const routerLog = logger.forComponent("router");
      orchestratorLog.info("msg from orchestrator");
      routerLog.info("msg from router");
      expect(logSpy).toHaveBeenCalledWith("[ptah:orchestrator] INFO: msg from orchestrator");
      expect(logSpy).toHaveBeenCalledWith("[ptah:router] INFO: msg from router");
    });
  });
});
