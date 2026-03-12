import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import { NodeGitClient } from "../../../src/services/git.js";
import { AsyncMutex } from "../../../src/orchestrator/merge-lock.js";
import { DefaultQuestionStore } from "../../../src/orchestrator/question-store.js";
import type { Logger } from "../../../src/services/logger.js";

const execFileAsync = promisify(execFile);

async function gitExec(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Silent logger for integration tests */
const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe("QuestionStore — full question pipeline (Task 65)", () => {
  let tempDir: string;
  let store: DefaultQuestionStore;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-qstore-"));

    // Set up git repo with initial commit (needed for MergeLock git commits)
    await gitExec(tempDir, "init");
    await gitExec(tempDir, "config", "user.email", "test@test.com");
    await gitExec(tempDir, "config", "user.name", "Test");

    // Create the open-questions directory (store doesn't create parent dirs)
    await nodeFs.mkdir(nodePath.join(tempDir, "docs/open-questions"), { recursive: true });

    // Create an initial commit so HEAD exists
    await nodeFs.writeFile(nodePath.join(tempDir, ".gitkeep"), "");
    await gitExec(tempDir, "add", ".gitkeep");
    await gitExec(tempDir, "commit", "-m", "init");

    const fs = new NodeFileSystem(tempDir);
    const git = new NodeGitClient(tempDir);
    const mergeLock = new AsyncMutex();

    store = new DefaultQuestionStore(
      fs,
      git,
      mergeLock,
      silentLogger,
      "docs/open-questions/pending.md",
      "docs/open-questions/resolved.md",
    );
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  it("ROUTE_TO_USER → pending.md written → answer set → archived to resolved.md with git commits", async () => {
    // 1. appendQuestion — writes pending.md, commits
    const question = await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-abc",
      threadName: "auth — define requirements",
      askedAt: new Date("2026-03-11T10:00:00Z"),
      questionText: "Which OAuth provider should we use?",
      answer: null,
      discordMessageId: null,
    });

    expect(question.id).toMatch(/^Q-\d{4}$/);
    expect(question.agentId).toBe("pm-agent");
    expect(question.answer).toBeNull();

    // Verify pending.md exists
    const pendingPath = nodePath.join(tempDir, "docs/open-questions/pending.md");
    const pendingContent = await nodeFs.readFile(pendingPath, "utf8");
    expect(pendingContent).toContain(question.id);
    expect(pendingContent).toContain("Which OAuth provider should we use?");

    // 2. readPendingQuestions — parses correctly
    const pending = await store.readPendingQuestions();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(question.id);
    expect(pending[0].answer).toBeNull();
    expect(pending[0].discordMessageId).toBeNull();

    // 3. updateDiscordMessageId
    await store.updateDiscordMessageId(question.id, "discord-msg-001");
    const pendingAfterUpdate = await store.readPendingQuestions();
    expect(pendingAfterUpdate[0].discordMessageId).toBe("discord-msg-001");

    // 4. setAnswer
    await store.setAnswer(question.id, "Use Google OAuth");
    const pendingAfterAnswer = await store.readPendingQuestions();
    expect(pendingAfterAnswer[0].answer).toBe("Use Google OAuth");

    // 5. archiveQuestion — moves to resolved.md, clears from pending
    await store.archiveQuestion(question.id, new Date("2026-03-11T11:00:00Z"));

    const pendingAfterArchive = await store.readPendingQuestions();
    expect(pendingAfterArchive).toHaveLength(0);

    const resolved = await store.readResolvedQuestions();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe(question.id);
    expect(resolved[0].answer).toBe("Use Google OAuth");

    // 6. Verify git commits (initial + add question + update notification + answer + resolve)
    const log = await gitExec(tempDir, "log", "--oneline");
    const logLines = log.split("\n");
    expect(logLines.some((l) => l.includes("add question"))).toBe(true);
    expect(logLines.some((l) => l.includes("notification") || l.includes("update"))).toBe(true);
    expect(logLines.some((l) => l.includes("answer"))).toBe(true);
    expect(logLines.some((l) => l.includes("resolve"))).toBe(true);
  });
});
