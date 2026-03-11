// tests/unit/orchestrator/pattern-b-context-builder.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultPatternBContextBuilder } from "../../../src/orchestrator/pattern-b-context-builder.js";
import {
  FakeFileSystem,
  FakeLogger,
  FakeTokenCounter,
  defaultTestConfig,
  createPendingQuestion,
  createThreadMessage,
} from "../../fixtures/factories.js";
import type { PtahConfig, PendingQuestion, ThreadMessage } from "../../../src/types.js";

// ────────────────────────────────────────────────────────────────────────────
// Shared setup helpers
// ────────────────────────────────────────────────────────────────────────────

function makeBuilder(
  fs: FakeFileSystem,
  logger: FakeLogger,
  tokenCounter?: FakeTokenCounter,
) {
  const tc = tokenCounter ?? new FakeTokenCounter();
  return new DefaultPatternBContextBuilder(fs, tc, logger);
}

function seedSkillFile(fs: FakeFileSystem, config: PtahConfig, agentId: string, content: string) {
  const skillPath = config.agents.skills[agentId];
  fs.addExisting(skillPath, content);
}

// ────────────────────────────────────────────────────────────────────────────
// Task 32 — Layer 3 formatting: pause summary, question, and answer sections
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 32: Layer 3 formatting", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent\nYou are a PM.");
  });

  it("Layer 3 contains ## Pause Summary section derived from last bot message", async () => {
    const question = createPendingQuestion({ answer: "Use JSON format." });
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({
        authorName: "pm-agent",
        isBot: true,
        content: "I am drafting the requirements spec.",
        timestamp: new Date("2026-01-01T09:00:00Z"),
      }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    expect(bundle.userMessage).toContain("## Pause Summary");
    expect(bundle.userMessage).toContain("You were working on: I am drafting the requirements spec.");
    expect(bundle.userMessage).toContain("You asked the user a question and paused.");
  });

  it("Layer 3 contains ## Question section with verbatim question text", async () => {
    const question = createPendingQuestion({
      questionText: "What is the expected response format?",
      answer: "Use JSON format.",
    });

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.userMessage).toContain("## Question");
    expect(bundle.userMessage).toContain("What is the expected response format?");
  });

  it("Layer 3 contains ## User Answer section with verbatim answer", async () => {
    const question = createPendingQuestion({ answer: "Use JSON format." });

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.userMessage).toContain("## User Answer");
    expect(bundle.userMessage).toContain("Use JSON format.");
  });

  it("Layer 3 uses the last bot message (by timestamp) for pause summary", async () => {
    const question = createPendingQuestion({ answer: "Sounds good." });
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({
        isBot: true,
        content: "First bot message.",
        timestamp: new Date("2026-01-01T09:00:00Z"),
      }),
      createThreadMessage({
        isBot: true,
        content: "Final bot message before pause.",
        timestamp: new Date("2026-01-01T09:30:00Z"),
      }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    expect(bundle.userMessage).toContain("You were working on: Final bot message before pause.");
  });

  it("Layer 3 section order is: Pause Summary, then Question, then User Answer", async () => {
    const question = createPendingQuestion({ answer: "My answer." });
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({ isBot: true, content: "Some bot work.", timestamp: new Date("2026-01-01T09:00:00Z") }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    const summaryIdx = bundle.userMessage.indexOf("## Pause Summary");
    const questionIdx = bundle.userMessage.indexOf("## Question");
    const answerIdx = bundle.userMessage.indexOf("## User Answer");

    expect(summaryIdx).toBeLessThan(questionIdx);
    expect(questionIdx).toBeLessThan(answerIdx);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 33 — Layer 3 fallback: no bot messages → use question.threadName
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 33: Layer 3 pause summary fallback", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
  });

  it("falls back to question.threadName when threadHistory is empty", async () => {
    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "Yes.",
    });

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.userMessage).toContain("You were working on: auth — define requirements.");
    expect(bundle.userMessage).toContain("You asked the user a question and paused.");
  });

  it("falls back to question.threadName when threadHistory has no bot messages", async () => {
    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "Confirmed.",
    });
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({ isBot: false, content: "Human message only." }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    expect(bundle.userMessage).toContain("You were working on: auth — define requirements.");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 34 — Layer 3 structure: thread history must NOT appear in Layer 3
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 34: Layer 3 structure", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
  });

  it("thread history messages do not appear verbatim in layer3 (userMessage)", async () => {
    const question = createPendingQuestion({ answer: "Final answer." });
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({
        isBot: false,
        content: "This is a human message that should not appear in layer3 output.",
      }),
      createThreadMessage({
        isBot: true,
        content: "This is a bot message that should not appear verbatim in layer3.",
      }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    // The thread history should NOT be reproduced in userMessage
    expect(bundle.userMessage).not.toContain("This is a human message that should not appear in layer3 output.");
    // The bot message content appears in the pause summary derivation but it's embedded in the pause summary text:
    // "You were working on: {lastBotMessage.content}."
    // So the bot content IS present via the pause summary, but only the last bot message in context
    // And human messages should never appear
    expect(bundle.userMessage).not.toContain("This is a human message that should not appear in layer3 output.");
  });

  it("layer3 only contains the three expected sections", async () => {
    const question = createPendingQuestion({
      questionText: "My question?",
      answer: "My answer.",
    });

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    // Verify all three sections are present
    expect(bundle.userMessage).toContain("## Pause Summary");
    expect(bundle.userMessage).toContain("## Question");
    expect(bundle.userMessage).toContain("## User Answer");

    // No other ## sections
    const headings = bundle.userMessage.match(/^## .+$/gm) ?? [];
    expect(headings).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 35 — Layer 1: reads role prompt, overview.md, appends constants
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 35: Layer 1 assembly", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
  });

  it("reads role prompt from config.agents.skills[agentId]", async () => {
    const roleContent = "## Role: PM Agent\nYou are a product manager.";
    seedSkillFile(fs, config, "pm-agent", roleContent);

    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).toContain(roleContent);
  });

  it("reads overview.md from docsRoot/featureName/ in worktree when present", async () => {
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
    // featureName extracted from "auth — define requirements" → "auth"
    const overviewPath = `${worktreePath}/${config.docs.root}/auth/overview.md`;
    fs.addExisting(overviewPath, "# Auth Overview\nThis feature handles authentication.");

    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).toContain("## Overview");
    expect(bundle.systemPrompt).toContain("# Auth Overview");
    expect(bundle.systemPrompt).toContain("This feature handles authentication.");
  });

  it("warns and continues when overview.md is absent", async () => {
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
    // No overview.md added

    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    // Build should succeed
    expect(bundle.systemPrompt).toContain("## Role: PM Agent");
    // A warning should be logged
    expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
  });

  it("appends TWO_ITERATION_RULE constant to systemPrompt", async () => {
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");

    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).toContain("maximum of 2 iterations");
  });

  it("appends ROUTING_INSTRUCTION constant to systemPrompt", async () => {
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");

    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).toContain("<routing>");
  });

  it("throws when agentId has no skill configured", async () => {
    // Do NOT seed the skill file
    const question = createPendingQuestion({ agentId: "unknown-agent", answer: "OK." });
    const builder = makeBuilder(fs, logger);

    await expect(
      builder.build({ question, worktreePath, config, threadHistory: [] }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 36 — Layer 2: reads feature files fresh from worktreePath
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 36: Layer 2 feature files", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
  });

  it("reads feature files from worktree docsRoot/featureName/ (excluding overview.md)", async () => {
    const featureDir = `${worktreePath}/${config.docs.root}/auth`;
    fs.addExistingDir(featureDir);
    fs.addExisting(`${featureDir}/overview.md`, "Overview content");
    fs.addExisting(`${featureDir}/requirements.md`, "# Requirements\nMust authenticate.");
    fs.addExisting(`${featureDir}/design.md`, "# Design\nUse JWT.");

    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).toContain("## Feature Files");
    expect(bundle.systemPrompt).toContain("requirements.md");
    expect(bundle.systemPrompt).toContain("Must authenticate.");
    expect(bundle.systemPrompt).toContain("design.md");
    expect(bundle.systemPrompt).toContain("Use JWT.");
    // overview.md should NOT appear as a feature file entry under "## Feature Files"
    // (it's in Layer 1 under "## Overview", but NOT as a "### overview.md" file entry)
    expect(bundle.systemPrompt).not.toContain("### overview.md");
  });

  it("when feature folder does not exist: Layer 2 is empty, no throw, warning logged", async () => {
    // No feature dir seeded
    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);

    // Should not throw
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    // systemPrompt should not contain Feature Files section
    expect(bundle.systemPrompt).not.toContain("## Feature Files");
    // Warning should be logged
    expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
  });

  it("when there are no feature files (except overview.md): Layer 2 is empty, no Feature Files section", async () => {
    const featureDir = `${worktreePath}/${config.docs.root}/auth`;
    fs.addExistingDir(featureDir);
    fs.addExisting(`${featureDir}/overview.md`, "Overview only");

    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.systemPrompt).not.toContain("## Feature Files");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 37 — ContextBundle fields: resumePattern, turnNumber, agentId, etc.
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 37: ContextBundle fields", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    config = defaultTestConfig();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");
  });

  it("returns resumePattern: 'pattern_b'", async () => {
    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.resumePattern).toBe("pattern_b");
  });

  it("returns turnNumber: 1", async () => {
    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.turnNumber).toBe(1);
  });

  it("returns agentId matching question.agentId", async () => {
    const question = createPendingQuestion({ agentId: "pm-agent", answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.agentId).toBe("pm-agent");
  });

  it("returns threadId matching question.threadId", async () => {
    const question = createPendingQuestion({ threadId: "thread-999", answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.threadId).toBe("thread-999");
  });

  it("returns featureName extracted from question.threadName", async () => {
    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.featureName).toBe("auth");
  });

  it("returns featureName as full threadName when no em-dash present", async () => {
    const question = createPendingQuestion({
      threadName: "general task",
      answer: "OK.",
    });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.featureName).toBe("general task");
  });

  it("returns tokenCounts with all four fields", async () => {
    const question = createPendingQuestion({ answer: "OK." });
    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    expect(bundle.tokenCounts).toMatchObject({
      layer1: expect.any(Number),
      layer2: expect.any(Number),
      layer3: expect.any(Number),
      total: expect.any(Number),
    });
    expect(bundle.tokenCounts.total).toBe(
      bundle.tokenCounts.layer1 + bundle.tokenCounts.layer2 + bundle.tokenCounts.layer3,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 38 — Token budget: L1+L3 > 85% of max_tokens → omit Layer 2
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 38: Token budget enforcement", () => {
  let logger: FakeLogger;
  let config: PtahConfig;
  const worktreePath = "/worktree/pm-agent";

  beforeEach(() => {
    logger = new FakeLogger();
    config = defaultTestConfig();
  });

  it("omits Layer 2 with warning when L1+L3 exceed 85% of max_tokens", async () => {
    const fs = new FakeFileSystem();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");

    // Seed feature files that would otherwise appear in Layer 2
    const featureDir = `${worktreePath}/${config.docs.root}/auth`;
    fs.addExistingDir(featureDir);
    fs.addExisting(`${featureDir}/requirements.md`, "# Requirements\nAuthentication requirements.");

    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });

    // Use a TokenCounter that returns a very large count so L1+L3 > 85% of max_tokens (8192)
    // 85% of 8192 = 6963.2; need L1+L3 > 6963
    const tokenCounter = new FakeTokenCounter();
    tokenCounter.fixedCount = 4000; // Each call returns 4000 tokens → L1=4000, L3=4000, total=8000 > 6963

    const builder = makeBuilder(fs, logger, tokenCounter);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    // Layer 2 should be omitted
    expect(bundle.systemPrompt).not.toContain("## Feature Files");
    expect(bundle.tokenCounts.layer2).toBe(0);

    // Warning should be logged
    expect(logger.messages.some((m) => m.level === "warn" && m.message.includes("85%"))).toBe(true);

    // resumePattern still set
    expect(bundle.resumePattern).toBe("pattern_b");
  });

  it("includes Layer 2 when L1+L3 are within 85% budget", async () => {
    const fs = new FakeFileSystem();
    seedSkillFile(fs, config, "pm-agent", "## Role: PM Agent");

    const featureDir = `${worktreePath}/${config.docs.root}/auth`;
    fs.addExistingDir(featureDir);
    fs.addExisting(`${featureDir}/requirements.md`, "# Requirements\nAuthentication requirements.");

    const question = createPendingQuestion({
      threadName: "auth — define requirements",
      answer: "OK.",
    });

    // Use a TokenCounter with small counts so budget is not exceeded
    // 85% of 8192 = 6963; need L1+L3 < 6963
    const tokenCounter = new FakeTokenCounter();
    tokenCounter.fixedCount = 10; // Very small — well within budget

    const builder = makeBuilder(fs, logger, tokenCounter);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory: [] });

    // Layer 2 should be present
    expect(bundle.systemPrompt).toContain("## Feature Files");
    expect(bundle.tokenCounts.layer2).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 38 (integration) — Full build() happy path
// ────────────────────────────────────────────────────────────────────────────

describe("DefaultPatternBContextBuilder — Task 38: Integration happy path", () => {
  it("assembles a complete ContextBundle with all layers for a realistic question", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const config = defaultTestConfig();
    const worktreePath = "/worktree/pm-agent";

    // Setup skill file
    const skillContent = "## Role: PM Agent\nYou are a product manager responsible for defining requirements.";
    seedSkillFile(fs, config, "pm-agent", skillContent);

    // Setup feature docs
    const featureDir = `${worktreePath}/${config.docs.root}/auth`;
    fs.addExistingDir(featureDir);
    fs.addExisting(`${featureDir}/overview.md`, "# Auth Feature\nHandles user authentication.");
    fs.addExisting(`${featureDir}/requirements.md`, "# Auth Requirements\n1. Users must log in.");

    // Setup question with answer
    const question = createPendingQuestion({
      id: "Q-0001",
      agentId: "pm-agent",
      threadId: "thread-123",
      threadName: "auth — define requirements",
      questionText: "What authentication methods are required?",
      answer: "OAuth2 and email/password.",
      askedAt: new Date("2026-01-01T10:00:00Z"),
    });

    // Thread history with one bot message
    const threadHistory: ThreadMessage[] = [
      createThreadMessage({
        isBot: true,
        authorId: "pm-agent",
        content: "I have been analyzing the auth requirements and need clarification.",
        timestamp: new Date("2026-01-01T09:55:00Z"),
      }),
    ];

    const builder = makeBuilder(fs, logger);
    const bundle = await builder.build({ question, worktreePath, config, threadHistory });

    // Verify all ContextBundle fields
    expect(bundle.resumePattern).toBe("pattern_b");
    expect(bundle.turnNumber).toBe(1);
    expect(bundle.agentId).toBe("pm-agent");
    expect(bundle.threadId).toBe("thread-123");
    expect(bundle.featureName).toBe("auth");

    // Layer 1 in systemPrompt
    expect(bundle.systemPrompt).toContain(skillContent);
    expect(bundle.systemPrompt).toContain("## Overview");
    expect(bundle.systemPrompt).toContain("# Auth Feature");
    expect(bundle.systemPrompt).toContain("maximum of 2 iterations");
    expect(bundle.systemPrompt).toContain("<routing>");

    // Layer 2 in systemPrompt
    expect(bundle.systemPrompt).toContain("## Feature Files");
    expect(bundle.systemPrompt).toContain("requirements.md");

    // Layer 3 in userMessage
    expect(bundle.userMessage).toContain("## Pause Summary");
    expect(bundle.userMessage).toContain("You were working on: I have been analyzing the auth requirements");
    expect(bundle.userMessage).toContain("## Question");
    expect(bundle.userMessage).toContain("What authentication methods are required?");
    expect(bundle.userMessage).toContain("## User Answer");
    expect(bundle.userMessage).toContain("OAuth2 and email/password.");

    // Token counts populated
    expect(bundle.tokenCounts.layer1).toBeGreaterThan(0);
    expect(bundle.tokenCounts.layer3).toBeGreaterThan(0);
    expect(bundle.tokenCounts.total).toBe(
      bundle.tokenCounts.layer1 + bundle.tokenCounts.layer2 + bundle.tokenCounts.layer3,
    );

    // No warnings logged (happy path)
    expect(logger.messages.filter((m) => m.level === "warn")).toHaveLength(0);
  });
});
