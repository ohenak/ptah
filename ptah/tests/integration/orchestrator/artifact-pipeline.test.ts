import { describe, it, expect, beforeEach } from "vitest";
import { DefaultArtifactCommitter } from "../../../src/orchestrator/artifact-committer.js";
import { DefaultAgentLogWriter } from "../../../src/orchestrator/agent-log-writer.js";
import { AsyncMutex } from "../../../src/orchestrator/merge-lock.js";
import {
  FakeGitClient,
  FakeFileSystem,
  FakeLogger,
} from "../../fixtures/factories.js";
import type { CommitParams, LogEntry } from "../../../src/types.js";

// Task 76: Integration — artifact pipeline
describe("Artifact pipeline integration", () => {
  let gitClient: FakeGitClient;
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let mergeLock: AsyncMutex;
  let artifactCommitter: DefaultArtifactCommitter;
  let agentLogWriter: DefaultAgentLogWriter;

  beforeEach(() => {
    gitClient = new FakeGitClient();
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    mergeLock = new AsyncMutex();

    // Configure git to return "merged" for merge
    gitClient.mergeResult = "merged";

    artifactCommitter = new DefaultArtifactCommitter(gitClient, mergeLock, logger);
    agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);
  });

  describe("full commit -> merge -> log -> cleanup pipeline", () => {
    it("commits artifacts, merges to main, cleans up worktree, and writes log entry", async () => {
      const commitParams: CommitParams = {
        agentId: "dev-agent",
        threadName: "feature-123 \u2014 implement login",
        worktreePath: "/tmp/ptah-worktrees/abc123",
        branch: "ptah/dev-agent/thread-1/abc123",
        artifactChanges: ["docs/specs/login.md", "docs/specs/auth.md"],
      };

      // Step 1: Run commitAndMerge
      const commitResult = await artifactCommitter.commitAndMerge(commitParams);

      // Verify: git add called with docs changes
      expect(gitClient.addInWorktreeCalls).toHaveLength(1);
      expect(gitClient.addInWorktreeCalls[0].worktreePath).toBe(
        "/tmp/ptah-worktrees/abc123",
      );
      expect(gitClient.addInWorktreeCalls[0].files).toEqual([
        "docs/specs/login.md",
        "docs/specs/auth.md",
      ]);

      // Verify: git commit called with correct message format
      expect(gitClient.commitInWorktreeCalls).toHaveLength(1);
      expect(gitClient.commitInWorktreeCalls[0].worktreePath).toBe(
        "/tmp/ptah-worktrees/abc123",
      );
      expect(gitClient.commitInWorktreeCalls[0].message).toBe(
        "[ptah] Dev Agent: implement login",
      );

      // Verify: merge called
      expect(gitClient.mergeCalls).toHaveLength(1);
      expect(gitClient.mergeCalls[0]).toBe("ptah/dev-agent/thread-1/abc123");

      // Verify: merge result is "merged"
      expect(commitResult.mergeStatus).toBe("merged");
      expect(commitResult.commitSha).toBe("abc1234");
      expect(commitResult.conflictMessage).toBeUndefined();

      // Verify: worktree cleaned up
      expect(gitClient.removedWorktrees).toContain(
        "/tmp/ptah-worktrees/abc123",
      );
      expect(gitClient.deletedBranches).toContain(
        "ptah/dev-agent/thread-1/abc123",
      );

      // Step 2: Write log entry
      const logEntry: LogEntry = {
        timestamp: new Date("2026-03-10T12:00:00.000Z"),
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: "feature-123 \u2014 implement login",
        status: "completed",
        commitSha: commitResult.commitSha,
        summary: "implement login",
      };

      await agentLogWriter.append(logEntry);

      // Verify: log file created with header and entry
      const logPath = fs.joinPath("docs", "agent-logs", "dev-agent.md");
      const logContent = fs.getFile(logPath);
      expect(logContent).toBeDefined();
      expect(logContent).toContain("# Dev Agent Activity Log");
      expect(logContent).toContain("| Date | Thread | Status | Commit | Summary |");
      expect(logContent).toContain("abc1234");
      expect(logContent).toContain("implement login");
    });

    it("handles no-changes path correctly", async () => {
      const commitParams: CommitParams = {
        agentId: "dev-agent",
        threadName: "feature-empty",
        worktreePath: "/tmp/ptah-worktrees/empty",
        branch: "ptah/dev-agent/thread-1/empty",
        artifactChanges: [],
      };

      const result = await artifactCommitter.commitAndMerge(commitParams);

      expect(result.mergeStatus).toBe("no-changes");
      expect(result.commitSha).toBeNull();

      // No git operations should have been called
      expect(gitClient.addInWorktreeCalls).toHaveLength(0);
      expect(gitClient.commitInWorktreeCalls).toHaveLength(0);
      expect(gitClient.mergeCalls).toHaveLength(0);
    });

    it("filters non-docs changes and only stages docs/ files", async () => {
      gitClient.mergeResult = "merged";

      const commitParams: CommitParams = {
        agentId: "dev-agent",
        threadName: "mixed-changes",
        worktreePath: "/tmp/ptah-worktrees/mixed",
        branch: "ptah/dev-agent/thread-1/mixed",
        artifactChanges: [
          "docs/specs/feature.md",
          "src/code.ts",
          "docs/plans/plan.md",
          "package.json",
        ],
      };

      const result = await artifactCommitter.commitAndMerge(commitParams);

      expect(result.mergeStatus).toBe("merged");
      // Only docs/ files should be staged
      expect(gitClient.addInWorktreeCalls[0].files).toEqual([
        "docs/specs/feature.md",
        "docs/plans/plan.md",
      ]);
    });

    it("handles merge conflict by retaining worktree", async () => {
      gitClient.mergeResult = "conflict";

      const commitParams: CommitParams = {
        agentId: "dev-agent",
        threadName: "conflict-feature",
        worktreePath: "/tmp/ptah-worktrees/conflict",
        branch: "ptah/dev-agent/thread-1/conflict",
        artifactChanges: ["docs/specs/login.md"],
      };

      const result = await artifactCommitter.commitAndMerge(commitParams);

      expect(result.mergeStatus).toBe("conflict");
      expect(result.commitSha).toBe("abc1234");
      expect(result.conflictMessage).toContain("conflict");

      // Worktree should NOT be cleaned up on conflict
      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);
    });
  });
});

// Task 77: Integration — concurrent log serialization
describe("Concurrent log serialization", () => {
  it("serializes two concurrent append() calls through the same AsyncMutex", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const mergeLock = new AsyncMutex();
    const agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);

    const entry1: LogEntry = {
      timestamp: new Date("2026-03-10T12:00:00.000Z"),
      agentId: "dev-agent",
      threadId: "thread-1",
      threadName: "feature-1",
      status: "completed",
      commitSha: "sha1111",
      summary: "first entry",
    };

    const entry2: LogEntry = {
      timestamp: new Date("2026-03-10T12:01:00.000Z"),
      agentId: "dev-agent",
      threadId: "thread-2",
      threadName: "feature-2",
      status: "completed",
      commitSha: "sha2222",
      summary: "second entry",
    };

    // Call append() twice concurrently
    await Promise.all([
      agentLogWriter.append(entry1),
      agentLogWriter.append(entry2),
    ]);

    // Verify both entries are written (not lost)
    const logPath = fs.joinPath("docs", "agent-logs", "dev-agent.md");
    const logContent = fs.getFile(logPath);
    expect(logContent).toBeDefined();
    expect(logContent).toContain("sha1111");
    expect(logContent).toContain("sha2222");
    expect(logContent).toContain("first entry");
    expect(logContent).toContain("second entry");

    // Verify entries are not interleaved - each line should be a complete table row
    const lines = logContent!.split("\n").filter((l) => l.startsWith("| 2026") || l.startsWith("| Tue") || l.startsWith("| Mon"));
    // Use a more flexible approach: find lines containing our shas
    const entryLines = logContent!.split("\n").filter((l) => l.includes("sha1111") || l.includes("sha2222"));
    expect(entryLines).toHaveLength(2);

    // Each line should be a complete table row (starts and ends with |)
    for (const line of entryLines) {
      expect(line).toMatch(/^\|.*\|$/);
    }

    // Verify the append calls were serialized (appendFile was called for each entry)
    const appendCalls = fs.appendFileCalls.filter((c) => c.path === logPath);
    expect(appendCalls).toHaveLength(2);

    // Each appended chunk should be a complete log line (not interleaved fragments)
    for (const call of appendCalls) {
      expect(call.content.trim()).toMatch(/^\|.*\|$/);
    }
  });

  it("does not lose entries when three concurrent appends target different agents", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const mergeLock = new AsyncMutex();
    const agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);

    const entries: LogEntry[] = [
      {
        timestamp: new Date("2026-03-10T12:00:00.000Z"),
        agentId: "dev-agent",
        threadId: "thread-a",
        threadName: "feature-a",
        status: "completed",
        commitSha: "sha-a",
        summary: "entry a",
      },
      {
        timestamp: new Date("2026-03-10T12:00:01.000Z"),
        agentId: "pm-agent",
        threadId: "thread-b",
        threadName: "feature-b",
        status: "completed (no changes)",
        commitSha: null,
        summary: "entry b",
      },
      {
        timestamp: new Date("2026-03-10T12:00:02.000Z"),
        agentId: "dev-agent",
        threadId: "thread-c",
        threadName: "feature-c",
        status: "conflict",
        commitSha: "sha-c",
        summary: "entry c",
      },
    ];

    // All three concurrent
    await Promise.all(entries.map((e) => agentLogWriter.append(e)));

    // dev-agent log should have 2 entries
    const devLogPath = fs.joinPath("docs", "agent-logs", "dev-agent.md");
    const devContent = fs.getFile(devLogPath);
    expect(devContent).toBeDefined();
    expect(devContent).toContain("entry a");
    expect(devContent).toContain("entry c");

    // pm-agent log should have 1 entry
    const pmLogPath = fs.joinPath("docs", "agent-logs", "pm-agent.md");
    const pmContent = fs.getFile(pmLogPath);
    expect(pmContent).toBeDefined();
    expect(pmContent).toContain("entry b");
    expect(pmContent).toContain("\u2014"); // null commitSha → "—" (em dash)
  });
});
