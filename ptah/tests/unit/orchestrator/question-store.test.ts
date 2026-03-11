// tests/unit/orchestrator/question-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DefaultQuestionStore } from "../../../src/orchestrator/question-store.js";
import {
  FakeFileSystem,
  FakeGitClient,
  FakeMergeLock,
  FakeLogger,
  createPendingQuestion,
} from "../../fixtures/factories.js";

const PENDING_PATH = "docs/open-questions/pending.md";
const RESOLVED_PATH = "docs/open-questions/resolved.md";

function makeStore(
  fs: FakeFileSystem,
  git: FakeGitClient,
  lock: FakeMergeLock,
  logger: FakeLogger,
): DefaultQuestionStore {
  return new DefaultQuestionStore(fs, git, lock, logger, PENDING_PATH, RESOLVED_PATH);
}

function makeDeps() {
  const fs = new FakeFileSystem();
  const git = new FakeGitClient();
  const lock = new FakeMergeLock();
  const logger = new FakeLogger();
  const store = makeStore(fs, git, lock, logger);
  return { fs, git, lock, logger, store };
}

// ---------------------------------------------------------------------------
// Task 15: appendQuestion — empty files
// ---------------------------------------------------------------------------
describe("Task 15: appendQuestion with empty files", () => {
  it("assigns Q-0001 when no pending.md or resolved.md exist", async () => {
    const { store } = makeDeps();
    const q = await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "What is the expected response format?",
      answer: null,
      discordMessageId: null,
    });

    expect(q.id).toBe("Q-0001");
  });

  it("creates pending.md with standard header", async () => {
    const { fs, store } = makeDeps();
    await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "What is the expected response format?",
      answer: null,
      discordMessageId: null,
    });

    const content = fs.getFile(PENDING_PATH)!;
    expect(content).toContain("# Pending Questions");
  });

  it("formats entry with all required fields", async () => {
    const { fs, store } = makeDeps();
    await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "What is the expected response format?",
      answer: null,
      discordMessageId: null,
    });

    const content = fs.getFile(PENDING_PATH)!;
    expect(content).toContain("<!-- Q-0001 -->");
    expect(content).toContain("**ID:** Q-0001");
    expect(content).toContain("**Agent:** pm-agent");
    expect(content).toContain("**Thread:** auth — define requirements");
    expect(content).toContain("**Thread ID:** thread-123");
    expect(content).toContain("**Asked:** 2026-01-01T10:00:00.000Z");
    expect(content).toContain("**Question:**\nWhat is the expected response format?");
    expect(content).toContain("**Answer:**\n(blank until answered)");
  });

  it("returns PendingQuestion with id populated", async () => {
    const { store } = makeDeps();
    const result = await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "What is the expected response format?",
      answer: null,
      discordMessageId: null,
    });

    expect(result).toMatchObject({
      id: "Q-0001",
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      questionText: "What is the expected response format?",
      answer: null,
      discordMessageId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Task 16: appendQuestion — scans both files for max ID
// ---------------------------------------------------------------------------
describe("Task 16: appendQuestion scans both files for max ID", () => {
  it("assigns Q-0004 when pending has Q-0001, Q-0003 and resolved has Q-0002", async () => {
    const { fs, store } = makeDeps();

    // pending.md has Q-0001 and Q-0003
    fs.addExisting(
      PENDING_PATH,
      `# Pending Questions\n\n<!-- Q-0001 -->\n**ID:** Q-0001\n\n---\n\n<!-- Q-0003 -->\n**ID:** Q-0003\n\n---\n`,
    );
    // resolved.md has Q-0002
    fs.addExisting(
      RESOLVED_PATH,
      `# Resolved Questions\n\n<!-- Q-0002 -->\n**ID:** Q-0002\n\n---\n`,
    );

    const q = await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-456",
      threadName: "test thread",
      askedAt: new Date("2026-01-02T10:00:00.000Z"),
      questionText: "Another question?",
      answer: null,
      discordMessageId: null,
    });

    expect(q.id).toBe("Q-0004");
  });

  it("zero-pads IDs to 4 digits (e.g. Q-0010 not Q-10)", async () => {
    const { fs, store } = makeDeps();

    // seed IDs 1-9 in pending
    const ids = Array.from({ length: 9 }, (_, i) => `<!-- Q-000${i + 1} -->`).join("\n");
    fs.addExisting(PENDING_PATH, `# Pending Questions\n\n${ids}\n`);

    const q = await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "t",
      threadName: "t",
      askedAt: new Date(),
      questionText: "q",
      answer: null,
      discordMessageId: null,
    });

    expect(q.id).toBe("Q-0010");
  });
});

// ---------------------------------------------------------------------------
// Task 17: appendQuestion — commits under MergeLock
// ---------------------------------------------------------------------------
describe("Task 17: appendQuestion commits under MergeLock", () => {
  it("acquires MergeLock exactly once and releases it", async () => {
    const { lock, store } = makeDeps();

    await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "Question?",
      answer: null,
      discordMessageId: null,
    });

    expect(lock.acquireCalls.length).toBe(1);
    expect(lock.releaseCalls).toBe(1);
  });

  it("commits with exact message format", async () => {
    const { git, store } = makeDeps();

    await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "Question?",
      answer: null,
      discordMessageId: null,
    });

    expect(git.commits).toContain("[ptah] System: add question Q-0001 from pm-agent");
  });

  it("performs git add before commit", async () => {
    const { git, store } = makeDeps();

    await store.appendQuestion({
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth",
      askedAt: new Date("2026-01-01T10:00:00.000Z"),
      questionText: "Question?",
      answer: null,
      discordMessageId: null,
    });

    expect(git.addedPaths.length).toBeGreaterThan(0);
    expect(git.addedPaths[0]).toContain(PENDING_PATH);
  });
});

// ---------------------------------------------------------------------------
// Task 18: updateDiscordMessageId — updates correct block
// ---------------------------------------------------------------------------
describe("Task 18: updateDiscordMessageId updates correct block", () => {
  function makePendingWithTwo(): string {
    return [
      "# Pending Questions",
      "",
      "<!-- Q-0001 -->",
      "**ID:** Q-0001",
      "**Agent:** pm-agent",
      "**Thread:** auth — define requirements",
      "**Thread ID:** thread-123",
      "**Asked:** 2026-01-01T10:00:00.000Z",
      "**Discord Message ID:** ",
      "",
      "**Question:**",
      "First question?",
      "",
      "**Answer:**",
      "(blank until answered)",
      "",
      "---",
      "",
      "<!-- Q-0002 -->",
      "**ID:** Q-0002",
      "**Agent:** dev-agent",
      "**Thread:** some thread",
      "**Thread ID:** thread-456",
      "**Asked:** 2026-01-02T10:00:00.000Z",
      "**Discord Message ID:** ",
      "",
      "**Question:**",
      "Second question?",
      "",
      "**Answer:**",
      "(blank until answered)",
      "",
      "---",
      "",
    ].join("\n");
  }

  it("updates only the target question's Discord Message ID", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithTwo());

    await store.updateDiscordMessageId("Q-0001", "discord-msg-abc");

    const content = fs.getFile(PENDING_PATH)!;
    // Q-0001 block should have the new messageId
    expect(content).toContain("**Discord Message ID:** discord-msg-abc");
    // Q-0002 block should still have blank
    // Split at Q-0002 comment to check its section
    const q2Section = content.split("<!-- Q-0002 -->")[1];
    expect(q2Section).toContain("**Discord Message ID:** \n");
  });

  it("is a no-op if questionId not found in file", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithTwo());
    const original = fs.getFile(PENDING_PATH)!;

    await store.updateDiscordMessageId("Q-9999", "some-id");

    expect(fs.getFile(PENDING_PATH)).toBe(original);
  });

  it("is a no-op if pending.md does not exist", async () => {
    const { git, store } = makeDeps();
    // No pending.md in fs
    await store.updateDiscordMessageId("Q-0001", "some-id");
    expect(git.commits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 19: updateDiscordMessageId — commits with correct message
// ---------------------------------------------------------------------------
describe("Task 19: updateDiscordMessageId commits with correct message", () => {
  it("commits with correct message format", async () => {
    const { fs, git, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Discord Message ID:** ",
        "",
        "**Question:**",
        "Question?",
        "",
        "**Answer:**",
        "(blank until answered)",
        "",
        "---",
        "",
      ].join("\n"),
    );

    await store.updateDiscordMessageId("Q-0001", "discord-msg-123");

    expect(git.commits).toContain("[ptah] System: update Q-0001 notification");
  });

  it("acquires and releases MergeLock", async () => {
    const { fs, lock, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      "# Pending Questions\n\n<!-- Q-0001 -->\n**Discord Message ID:** \n\n---\n",
    );

    await store.updateDiscordMessageId("Q-0001", "discord-msg-123");

    expect(lock.acquireCalls.length).toBe(1);
    expect(lock.releaseCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Task 20: readPendingQuestions — parses well-formed entries
// ---------------------------------------------------------------------------
describe("Task 20: readPendingQuestions parses well-formed entries", () => {
  it("parses 2 questions, discordMessageId null when blank, answer null when blank", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth — define requirements",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Discord Message ID:** ",
        "",
        "**Question:**",
        "What is the expected response format?",
        "",
        "**Answer:**",
        "(blank until answered)",
        "",
        "---",
        "",
        "<!-- Q-0002 -->",
        "**ID:** Q-0002",
        "**Agent:** dev-agent",
        "**Thread:** dev sprint",
        "**Thread ID:** thread-456",
        "**Asked:** 2026-01-02T10:00:00.000Z",
        "**Discord Message ID:** discord-snowflake-789",
        "",
        "**Question:**",
        "How many retries?",
        "",
        "**Answer:**",
        "(blank until answered)",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const questions = await store.readPendingQuestions();

    expect(questions).toHaveLength(2);

    const q1 = questions.find((q) => q.id === "Q-0001")!;
    expect(q1.agentId).toBe("pm-agent");
    expect(q1.threadName).toBe("auth — define requirements");
    expect(q1.threadId).toBe("thread-123");
    expect(q1.askedAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
    expect(q1.questionText).toBe("What is the expected response format?");
    expect(q1.discordMessageId).toBeNull();
    expect(q1.answer).toBeNull();

    const q2 = questions.find((q) => q.id === "Q-0002")!;
    expect(q2.discordMessageId).toBe("discord-snowflake-789");
    expect(q2.answer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 21: readPendingQuestions — edge cases
// ---------------------------------------------------------------------------
describe("Task 21: readPendingQuestions edge cases", () => {
  it("returns [] when file is absent", async () => {
    const { store } = makeDeps();
    const questions = await store.readPendingQuestions();
    expect(questions).toEqual([]);
  });

  it("returns [] when file is empty", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, "");
    const questions = await store.readPendingQuestions();
    expect(questions).toEqual([]);
  });

  it("logs warning and skips malformed block, returns valid ones", async () => {
    const { fs, logger, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "MALFORMED BLOCK NO ID OR FIELDS HERE",
        "",
        "---",
        "",
        "<!-- Q-0002 -->",
        "**ID:** Q-0002",
        "**Agent:** dev-agent",
        "**Thread:** valid thread",
        "**Thread ID:** thread-456",
        "**Asked:** 2026-01-02T10:00:00.000Z",
        "**Discord Message ID:** ",
        "",
        "**Question:**",
        "Valid question?",
        "",
        "**Answer:**",
        "(blank until answered)",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const questions = await store.readPendingQuestions();

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("Q-0002");
    const warns = logger.messages.filter((m) => m.level === "warn");
    expect(warns.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Task 22: readPendingQuestions — detects non-empty answer
// ---------------------------------------------------------------------------
describe("Task 22: readPendingQuestions detects non-empty answer", () => {
  it("returns PendingQuestion with answer set to verbatim content", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Discord Message ID:** discord-msg-123",
        "",
        "**Question:**",
        "What is the expected response format?",
        "",
        "**Answer:**",
        "The response format should be JSON.",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const questions = await store.readPendingQuestions();

    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe("The response format should be JSON.");
  });

  it("treats whitespace-only answer as null", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Discord Message ID:** ",
        "",
        "**Question:**",
        "Question?",
        "",
        "**Answer:**",
        "   ",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const questions = await store.readPendingQuestions();
    expect(questions[0].answer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 23: readResolvedQuestions
// ---------------------------------------------------------------------------
describe("Task 23: readResolvedQuestions", () => {
  it("parses resolved.md into PendingQuestion[] with answer populated", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      RESOLVED_PATH,
      [
        "# Resolved Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth — define requirements",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Answered:** 2026-01-01T10:05:00.000Z",
        "**Discord Message ID:** discord-msg-123",
        "",
        "**Question:**",
        "What is the expected response format?",
        "",
        "**Answer:**",
        "The response format should be JSON.",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const questions = await store.readResolvedQuestions();

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("Q-0001");
    expect(questions[0].answer).toBe("The response format should be JSON.");
    expect(questions[0].discordMessageId).toBe("discord-msg-123");
  });

  it("returns [] when resolved.md is absent", async () => {
    const { store } = makeDeps();
    const questions = await store.readResolvedQuestions();
    expect(questions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 24: getQuestion
// ---------------------------------------------------------------------------
describe("Task 24: getQuestion", () => {
  it("returns matching PendingQuestion by ID", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      [
        "# Pending Questions",
        "",
        "<!-- Q-0001 -->",
        "**ID:** Q-0001",
        "**Agent:** pm-agent",
        "**Thread:** auth",
        "**Thread ID:** thread-123",
        "**Asked:** 2026-01-01T10:00:00.000Z",
        "**Discord Message ID:** ",
        "",
        "**Question:**",
        "Question text?",
        "",
        "**Answer:**",
        "(blank until answered)",
        "",
        "---",
        "",
      ].join("\n"),
    );

    const q = await store.getQuestion("Q-0001");

    expect(q).not.toBeNull();
    expect(q!.id).toBe("Q-0001");
    expect(q!.agentId).toBe("pm-agent");
  });

  it("returns null if question not found", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(
      PENDING_PATH,
      "# Pending Questions\n\n<!-- Q-0001 -->\n**ID:** Q-0001\n\n---\n",
    );

    const q = await store.getQuestion("Q-9999");
    expect(q).toBeNull();
  });

  it("returns null if pending.md is absent", async () => {
    const { store } = makeDeps();
    const q = await store.getQuestion("Q-0001");
    expect(q).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 25: setAnswer
// ---------------------------------------------------------------------------
describe("Task 25: setAnswer", () => {
  function makePendingFile(): string {
    return [
      "# Pending Questions",
      "",
      "<!-- Q-0001 -->",
      "**ID:** Q-0001",
      "**Agent:** pm-agent",
      "**Thread:** auth",
      "**Thread ID:** thread-123",
      "**Asked:** 2026-01-01T10:00:00.000Z",
      "**Discord Message ID:** discord-msg-123",
      "",
      "**Question:**",
      "What is the expected response format?",
      "",
      "**Answer:**",
      "(blank until answered)",
      "",
      "---",
      "",
    ].join("\n");
  }

  it("replaces blank Answer section with verbatim answer text", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingFile());

    await store.setAnswer("Q-0001", "The response format should be JSON.");

    const content = fs.getFile(PENDING_PATH)!;
    expect(content).toContain("**Answer:**\nThe response format should be JSON.");
    expect(content).not.toContain("(blank until answered)");
  });

  it("commits with correct message", async () => {
    const { fs, git, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingFile());

    await store.setAnswer("Q-0001", "The response format should be JSON.");

    expect(git.commits).toContain("[ptah] System: answer Q-0001 via Discord");
  });

  it("acquires and releases MergeLock", async () => {
    const { fs, lock, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingFile());

    await store.setAnswer("Q-0001", "Answer.");

    expect(lock.acquireCalls.length).toBe(1);
    expect(lock.releaseCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Task 26: archiveQuestion
// ---------------------------------------------------------------------------
describe("Task 26: archiveQuestion", () => {
  function makePendingWithOneQuestion(): string {
    return [
      "# Pending Questions",
      "",
      "<!-- Q-0001 -->",
      "**ID:** Q-0001",
      "**Agent:** pm-agent",
      "**Thread:** auth — define requirements",
      "**Thread ID:** thread-123",
      "**Asked:** 2026-01-01T10:00:00.000Z",
      "**Discord Message ID:** discord-msg-123",
      "",
      "**Question:**",
      "What is the expected response format?",
      "",
      "**Answer:**",
      "The response format should be JSON.",
      "",
      "---",
      "",
    ].join("\n");
  }

  it("removes question block from pending.md", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());

    await store.archiveQuestion("Q-0001", new Date("2026-01-01T10:05:00.000Z"));

    const content = fs.getFile(PENDING_PATH)!;
    expect(content).not.toContain("<!-- Q-0001 -->");
  });

  it("creates resolved.md with header if absent, then appends resolved block", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());

    await store.archiveQuestion("Q-0001", new Date("2026-01-01T10:05:00.000Z"));

    const resolved = fs.getFile(RESOLVED_PATH)!;
    expect(resolved).toContain("# Resolved Questions");
    expect(resolved).toContain("<!-- Q-0001 -->");
    expect(resolved).toContain("**ID:** Q-0001");
  });

  it("adds Answered timestamp in the resolved block", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());

    const resolvedAt = new Date("2026-01-01T10:05:00.000Z");
    await store.archiveQuestion("Q-0001", resolvedAt);

    const resolved = fs.getFile(RESOLVED_PATH)!;
    expect(resolved).toContain(`**Answered:** ${resolvedAt.toISOString()}`);
  });

  it("issues single commit with correct message", async () => {
    const { fs, git, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());

    await store.archiveQuestion("Q-0001", new Date("2026-01-01T10:05:00.000Z"));

    expect(git.commits).toEqual(["[ptah] System: resolve Q-0001"]);
  });

  it("appends to existing resolved.md", async () => {
    const { fs, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());
    fs.addExisting(
      RESOLVED_PATH,
      "# Resolved Questions\n\n<!-- Q-0000 -->\n**ID:** Q-0000\n\n---\n",
    );

    await store.archiveQuestion("Q-0001", new Date("2026-01-01T10:05:00.000Z"));

    const resolved = fs.getFile(RESOLVED_PATH)!;
    expect(resolved).toContain("<!-- Q-0000 -->");
    expect(resolved).toContain("<!-- Q-0001 -->");
  });

  it("acquires and releases MergeLock exactly once", async () => {
    const { fs, lock, store } = makeDeps();
    fs.addExisting(PENDING_PATH, makePendingWithOneQuestion());

    await store.archiveQuestion("Q-0001", new Date("2026-01-01T10:05:00.000Z"));

    expect(lock.acquireCalls.length).toBe(1);
    expect(lock.releaseCalls).toBe(1);
  });
});
