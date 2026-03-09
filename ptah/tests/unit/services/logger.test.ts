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
});
