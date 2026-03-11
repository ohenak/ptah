import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DefaultAgentLogWriter,
  formatAgentName,
} from "../../../src/orchestrator/agent-log-writer.js";
import { FakeFileSystem, FakeLogger, FakeMergeLock } from "../../fixtures/factories.js";
import type { LogEntry, LogStatus } from "../../../src/types.js";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: "2026-03-10 14:30",
    agentId: "dev-agent",
    threadName: "test-thread",
    status: "completed",
    commitSha: "abc1234",
    summary: "Updated docs",
    ...overrides,
  };
}

describe("DefaultAgentLogWriter", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let lock: FakeMergeLock;
  let writer: DefaultAgentLogWriter;

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    lock = new FakeMergeLock();
    writer = new DefaultAgentLogWriter(fs, lock, logger);
  });

  // Task 37: Happy path — entry appended with correct markdown table row format
  describe("Task 37: happy path", () => {
    it("appends a correctly formatted markdown table row", async () => {
      // Pre-populate log file with header
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      const entry = makeEntry();
      await writer.append(entry);

      const content = fs.getFile(logPath)!;
      expect(content).toContain(
        "| 2026-03-10 14:30 | test-thread | completed | abc1234 | Updated docs |",
      );
    });

    it("escapes pipe characters in data as \\|", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      const entry = makeEntry({
        threadName: "feat | bug",
        summary: "Fixed | issue",
      });
      await writer.append(entry);

      const content = fs.getFile(logPath)!;
      expect(content).toContain("feat \\| bug");
      expect(content).toContain("Fixed \\| issue");
    });
  });

  // Task 38: All statuses
  describe("Task 38: all statuses", () => {
    const statuses: LogStatus[] = ["completed", "completed (no changes)", "conflict", "error"];

    for (const status of statuses) {
      it(`produces correct row for status "${status}"`, async () => {
        const logPath = "docs/agent-logs/dev-agent.md";
        fs.addExisting(
          logPath,
          "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
        );

        const entry = makeEntry({ status });
        await writer.append(entry);

        const content = fs.getFile(logPath)!;
        expect(content).toContain(`| ${status} |`);
      });
    }

    it("uses em dash for null commitSha", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      const entry = makeEntry({ status: "completed (no changes)", commitSha: null });
      await writer.append(entry);

      const content = fs.getFile(logPath)!;
      expect(content).toContain("| \u2014 |");
    });
  });

  // Task 39: Missing file — auto-created with header
  describe("Task 39: missing file", () => {
    it("creates log file with header when file does not exist", async () => {
      const entry = makeEntry({ agentId: "pm-agent" });
      await writer.append(entry);

      const logPath = "docs/agent-logs/pm-agent.md";
      const content = fs.getFile(logPath)!;
      expect(content).toContain("# Pm Agent Activity Log");
      expect(content).toContain("| Date | Thread | Status | Commit | Summary |");
      expect(content).toContain("|------|--------|--------|--------|---------|");
    });

    it("appends entry after creating the file", async () => {
      const entry = makeEntry({ agentId: "pm-agent" });
      await writer.append(entry);

      const logPath = "docs/agent-logs/pm-agent.md";
      const content = fs.getFile(logPath)!;
      expect(content).toContain("| 2026-03-10 14:30 | test-thread | completed | abc1234 | Updated docs |");
    });

    it("logs warning about creating new log file", async () => {
      const entry = makeEntry({ agentId: "pm-agent" });
      await writer.append(entry);

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("pm-agent"))).toBe(true);
    });

    it("creates the docs/agent-logs directory", async () => {
      const entry = makeEntry({ agentId: "pm-agent" });
      await writer.append(entry);

      expect(fs.hasDir("docs/agent-logs")).toBe(true);
    });

    it("derives display name from agentId via formatAgentName()", async () => {
      const entry = makeEntry({ agentId: "frontend-dev-agent" });
      await writer.append(entry);

      const logPath = "docs/agent-logs/frontend-dev-agent.md";
      const content = fs.getFile(logPath)!;
      expect(content).toContain("# Frontend Dev Agent Activity Log");
    });
  });

  // Task 40: Malformed file — existing file without proper table header
  describe("Task 40: malformed file", () => {
    it("appends entry best-effort to malformed file", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(logPath, "# Some random content\nNo table here\n");

      const entry = makeEntry();
      await writer.append(entry);

      const content = fs.getFile(logPath)!;
      expect(content).toContain("| 2026-03-10 14:30 | test-thread | completed | abc1234 | Updated docs |");
    });

    it("logs warning about malformed file", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(logPath, "# Some random content\n");

      const entry = makeEntry();
      await writer.append(entry);

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("Malformed"))).toBe(true);
    });
  });

  // Task 41: Write failure — appendFile throws, warning logged, no rethrow
  describe("Task 41: write failure", () => {
    it("logs warning and does not throw when appendFile fails twice", async () => {
      vi.useFakeTimers();
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      fs.appendFileError = new Error("disk full");

      const promise = writer.append(makeEntry());
      // Advance past retry delay
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("Log append failed"))).toBe(true);
      vi.useRealTimers();
    });
  });

  // Task 42: Retry on write failure — first attempt fails, retry succeeds
  describe("Task 42: retry on write failure", () => {
    it("retries after 100ms on first failure and succeeds", async () => {
      vi.useFakeTimers();
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      // Fail on first appendFile call only, succeed on retry
      let callCount = 0;
      const originalAppend = fs.appendFile.bind(fs);
      fs.appendFile = async (path: string, content: string) => {
        callCount++;
        if (callCount === 1) throw new Error("transient error");
        return originalAppend(path, content);
      };

      const promise = writer.append(makeEntry());
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      const content = fs.getFile(logPath)!;
      expect(content).toContain("| 2026-03-10 14:30 |");
      // No warning logged since retry succeeded
      const warnings = logger.messages.filter(
        (m) => m.level === "warn" && m.message.includes("Log append failed"),
      );
      expect(warnings).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  // Task 43: Pipe escaping
  describe("Task 43: pipe escaping", () => {
    it("escapes | characters in threadName and summary", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      const entry = makeEntry({
        threadName: "feature|branch|test",
        summary: "Fix|pipe|chars",
      });
      await writer.append(entry);

      const content = fs.getFile(logPath)!;
      expect(content).toContain("feature\\|branch\\|test");
      expect(content).toContain("Fix\\|pipe\\|chars");
      // Ensure escaped pipes are present in the row and unescaped pipes are only delimiters
      const row = content.split("\n").find((l) => l.includes("feature"));
      expect(row).toBeDefined();
      // Remove escaped pipes, then count remaining (should be exactly 6 delimiters)
      const withoutEscaped = row!.replace(/\\\|/g, "");
      const delimiterCount = withoutEscaped.split("").filter((c) => c === "|").length;
      expect(delimiterCount).toBe(6);
    });
  });

  // Task 44: Merge lock — lock acquired before file operations, released after
  describe("Task 44: merge lock", () => {
    it("acquires lock before file operations", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      await writer.append(makeEntry());

      expect(lock.acquireCalls).toHaveLength(1);
      expect(lock.acquireCalls[0]).toBe(10_000);
    });

    it("releases lock after successful append", async () => {
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );

      await writer.append(makeEntry());

      expect(lock.releaseCalls).toBeGreaterThan(0);
    });

    it("releases lock on error path", async () => {
      vi.useFakeTimers();
      const logPath = "docs/agent-logs/dev-agent.md";
      fs.addExisting(
        logPath,
        "# Dev Agent Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|\n",
      );
      fs.appendFileError = new Error("write error");

      const promise = writer.append(makeEntry());
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(lock.releaseCalls).toBeGreaterThan(0);
      vi.useRealTimers();
    });
  });

  // Task 45: Lock timeout — MergeLockTimeoutError, warning logged, returns without writing
  describe("Task 45: lock timeout", () => {
    it("logs warning and returns without writing on lock timeout", async () => {
      const { MergeLockTimeoutError } = await import("../../../src/orchestrator/merge-lock.js");
      lock.acquireError = new MergeLockTimeoutError(10_000);

      const entry = makeEntry();
      await writer.append(entry);

      // No file should be created/modified
      expect(fs.getFile("docs/agent-logs/dev-agent.md")).toBeUndefined();

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("lock timeout"))).toBe(true);
    });

    it("does not throw on lock timeout", async () => {
      const { MergeLockTimeoutError } = await import("../../../src/orchestrator/merge-lock.js");
      lock.acquireError = new MergeLockTimeoutError(10_000);

      await expect(writer.append(makeEntry())).resolves.toBeUndefined();
    });
  });

  // formatAgentName helper
  describe("formatAgentName", () => {
    it("capitalizes each word split by hyphens", () => {
      expect(formatAgentName("dev-agent")).toBe("Dev Agent");
      expect(formatAgentName("pm-agent")).toBe("Pm Agent");
      expect(formatAgentName("frontend-dev-agent")).toBe("Frontend Dev Agent");
    });

    it("handles single word", () => {
      expect(formatAgentName("agent")).toBe("Agent");
    });
  });
});
