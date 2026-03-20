import { describe, it, expect, beforeEach } from "vitest";
import { FakeLogger } from "../../fixtures/factories.js";
import type { LogEntry } from "../../../src/types.js";

describe("FakeLogger", () => {
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  describe("entries tracking", () => {
    it("starts with empty entries array", () => {
      expect(logger.entries).toEqual([]);
    });

    it("log() appends a LogEntry to entries", () => {
      const entry: LogEntry = { component: "orchestrator", level: "INFO", message: "started" };
      logger.log(entry);
      expect(logger.entries).toHaveLength(1);
      expect(logger.entries[0]).toEqual(entry);
    });

    it("log() appends multiple entries in order", () => {
      logger.log({ component: "router", level: "DEBUG", message: "first" });
      logger.log({ component: "discord", level: "ERROR", message: "second" });
      expect(logger.entries).toHaveLength(2);
      expect(logger.entries[0].message).toBe("first");
      expect(logger.entries[1].message).toBe("second");
    });
  });

  describe("Logger interface methods populate entries", () => {
    it("error() appends entry with level ERROR", () => {
      logger.error("something broke");
      expect(logger.entries).toHaveLength(1);
      expect(logger.entries[0].level).toBe("ERROR");
      expect(logger.entries[0].message).toBe("something broke");
    });

    it("warn() appends entry with level WARN", () => {
      logger.warn("watch out");
      expect(logger.entries[0].level).toBe("WARN");
      expect(logger.entries[0].message).toBe("watch out");
    });

    it("info() appends entry with level INFO", () => {
      logger.info("all good");
      expect(logger.entries[0].level).toBe("INFO");
      expect(logger.entries[0].message).toBe("all good");
    });

    it("debug() appends entry with level DEBUG", () => {
      logger.debug("verbose detail");
      expect(logger.entries[0].level).toBe("DEBUG");
      expect(logger.entries[0].message).toBe("verbose detail");
    });
  });

  describe("backward compatibility", () => {
    it("messages array still accumulates level and message", () => {
      logger.info("hello");
      expect(logger.messages).toHaveLength(1);
      expect(logger.messages[0]).toEqual({ level: "info", message: "hello" });
    });
  });
});
