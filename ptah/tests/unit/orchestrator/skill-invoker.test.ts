import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultSkillInvoker,
  InvocationTimeoutError,
  InvocationError,
} from "../../../src/orchestrator/skill-invoker.js";
import {
  FakeSkillClient,
  FakeGitClient,
  FakeLogger,
  defaultTestConfig,
} from "../../fixtures/factories.js";
import type { ContextBundle, PtahConfig } from "../../../src/types.js";

function createBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    systemPrompt: "You are a helpful agent.",
    userMessage: "Do the thing.",
    agentId: "dev-agent",
    threadId: "thread-42",
    featureName: "my-feature",
    resumePattern: "fresh",
    turnNumber: 1,
    tokenCounts: { layer1: 100, layer2: 200, layer3: 300, total: 600 },
    ...overrides,
  };
}

describe("DefaultSkillInvoker", () => {
  let skillClient: FakeSkillClient;
  let gitClient: FakeGitClient;
  let logger: FakeLogger;
  let config: PtahConfig;
  let invoker: DefaultSkillInvoker;
  const worktreePath = "/tmp/ptah-worktrees/test1234";

  beforeEach(() => {
    skillClient = new FakeSkillClient();
    gitClient = new FakeGitClient();
    logger = new FakeLogger();
    config = defaultTestConfig();
    invoker = new DefaultSkillInvoker(skillClient, gitClient, logger);
  });

  // ─── Task 54: SkillInvoker receives worktreePath ─────────────────
  describe("Task 54: receives worktreePath, does not create worktree", () => {
    it("uses the provided worktreePath and does NOT call gitClient.createWorktree", async () => {
      skillClient.responses = [{ textContent: "I made changes to docs." }];
      gitClient.diffWorktreeIncludingUntrackedResult = [
        "docs/features/my-feature.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config, worktreePath);

      // Worktree was NOT created by SkillInvoker
      expect(gitClient.createdWorktrees).toHaveLength(0);

      // SkillClient was invoked with the provided worktreePath
      expect(skillClient.invocations).toHaveLength(1);
      const req = skillClient.invocations[0];
      expect(req.worktreePath).toBe(worktreePath);
      expect(req.systemPrompt).toBe(bundle.systemPrompt);
      expect(req.userMessage).toBe(bundle.userMessage);
      expect(req.timeoutMs).toBe(config.orchestrator.invocation_timeout_ms);

      // Result has correct shape (no worktreePath or branch fields)
      expect(result.textResponse).toBe("I made changes to docs.");
      expect(result.routingSignalRaw).toBe("I made changes to docs.");
      expect(result.artifactChanges).toEqual(["docs/features/my-feature.md"]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect((result as Record<string, unknown>)["worktreePath"]).toBeUndefined();
      expect((result as Record<string, unknown>)["branch"]).toBeUndefined();
    });
  });

  // ─── Task 55: SkillInvoker no cleanup ─────────────────────────────
  describe("Task 55: no cleanup — worktree not removed, no branch deletion", () => {
    it("does NOT remove worktree or delete branch on success", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [];

      const bundle = createBundle();
      await invoker.invoke(bundle, config, worktreePath);

      // No cleanup operations performed
      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);
    });

    it("does NOT remove worktree or delete branch on timeout", async () => {
      config.orchestrator.invocation_timeout_ms = 50;
      skillClient.invokeDelay = 200;

      const bundle = createBundle();
      try {
        await invoker.invoke(bundle, config, worktreePath);
      } catch {
        // expected
      }

      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);
    });

    it("does NOT remove worktree or delete branch on error", async () => {
      skillClient.invokeError = new Error("boom");

      const bundle = createBundle();
      try {
        await invoker.invoke(bundle, config, worktreePath);
      } catch {
        // expected
      }

      expect(gitClient.removedWorktrees).toHaveLength(0);
      expect(gitClient.deletedBranches).toHaveLength(0);
    });
  });

  // ─── Task 56: SkillInvoker uses diffWorktreeIncludingUntracked ────
  describe("Task 56: uses diffWorktreeIncludingUntracked", () => {
    it("detects both tracked and untracked files via diffWorktreeIncludingUntracked", async () => {
      skillClient.responses = [{ textContent: "created new files" }];
      // Set up diffWorktreeIncludingUntrackedResult (the new method)
      gitClient.diffWorktreeIncludingUntrackedResult = [
        "docs/features/existing.md",    // tracked change
        "docs/features/new-file.md",    // untracked new file
      ];
      // Old method should NOT be used — set different value to verify
      gitClient.diffResult = ["docs/features/old-only.md"];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config, worktreePath);

      // Should use diffWorktreeIncludingUntracked results, not diffWorktree
      expect(result.artifactChanges).toEqual([
        "docs/features/existing.md",
        "docs/features/new-file.md",
      ]);
      // The old diffResult should not appear
      expect(result.artifactChanges).not.toContain("docs/features/old-only.md");
    });
  });

  // ─── Existing tests updated for new signature ─────────────────────

  describe("happy path", () => {
    it("invokes Claude Code, detects /docs artifact changes via diffWorktreeIncludingUntracked", async () => {
      skillClient.responses = [{ textContent: "I made changes to docs." }];
      gitClient.diffWorktreeIncludingUntrackedResult = [
        "docs/features/my-feature.md",
        "docs/overview.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config, worktreePath);

      // SkillClient was invoked with correct request
      expect(skillClient.invocations).toHaveLength(1);
      const req = skillClient.invocations[0];
      expect(req.systemPrompt).toBe(bundle.systemPrompt);
      expect(req.userMessage).toBe(bundle.userMessage);
      expect(req.worktreePath).toBe(worktreePath);
      expect(req.timeoutMs).toBe(config.orchestrator.invocation_timeout_ms);

      // Result has correct shape
      expect(result.textResponse).toBe("I made changes to docs.");
      expect(result.routingSignalRaw).toBe("I made changes to docs.");
      expect(result.artifactChanges).toEqual([
        "docs/features/my-feature.md",
        "docs/overview.md",
      ]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("timeout", () => {
    it("throws InvocationTimeoutError when invocation exceeds timeout", async () => {
      config.orchestrator.invocation_timeout_ms = 50;
      skillClient.invokeDelay = 200;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config, worktreePath)).rejects.toThrow(
        InvocationTimeoutError,
      );
    });
  });

  describe("invocation error", () => {
    it("throws InvocationError when SkillClient throws", async () => {
      skillClient.invokeError = new Error("Claude Code crashed");

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config, worktreePath)).rejects.toThrow(
        InvocationError,
      );
    });
  });

  describe("rate limit / API error", () => {
    it("wraps rate limit error in InvocationError", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.name = "RateLimitError";
      skillClient.invokeError = rateLimitError;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config, worktreePath)).rejects.toThrow(
        InvocationError,
      );
    });

    it("wraps API error in InvocationError", async () => {
      const apiError = new Error("API unavailable");
      apiError.name = "APIError";
      skillClient.invokeError = apiError;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config, worktreePath)).rejects.toThrow(
        InvocationError,
      );
    });
  });

  describe("artifact filtering", () => {
    it("only includes /docs changes, ignores non-/docs changes with warning", async () => {
      skillClient.responses = [{ textContent: "made changes" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [
        "docs/features/new-feature.md",
        "src/main.ts",
        "package.json",
        "docs/api/endpoints.md",
        "README.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config, worktreePath);

      expect(result.artifactChanges).toEqual([
        "docs/features/new-feature.md",
        "docs/api/endpoints.md",
      ]);

      // Warning logged for non-docs changes
      const warnings = logger.entries.filter((e) => e.level === "WARN");
      expect(warnings.some((w) => w.message.includes("non-docs"))).toBe(true);
    });
  });

  describe("layer 1 file modification warning", () => {
    it("logs warning for overview.md changes but still includes them", async () => {
      skillClient.responses = [{ textContent: "updated overview" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [
        "docs/overview.md",
        "docs/features/something.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config, worktreePath);

      expect(result.artifactChanges).toContain("docs/overview.md");

      const warnings = logger.entries.filter((e) => e.level === "WARN");
      expect(
        warnings.some((w) => w.message.includes("overview.md")),
      ).toBe(true);
    });
  });

  describe("pruneOrphanedWorktrees", () => {
    it("calls gitClient.pruneWorktrees with ptah/ prefix", async () => {
      await invoker.pruneOrphanedWorktrees();
      expect(gitClient.prunedPrefixes).toEqual(["ptah/"]);
    });
  });

  // ─── EVT-OB-03 / EVT-OB-04: Observability log events ─────────────
  describe("EVT-OB-03 and EVT-OB-04: skill invocation observability events", () => {
    it("emits EVT-OB-03 (skill invocation started) before invoking the skill", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [];

      const bundle = createBundle({ agentId: "dev-agent" });
      await invoker.invoke(bundle, config, worktreePath);

      const infos = logger.entries.filter((e) => e.level === "INFO");
      const startEvent = infos.find((e) =>
        e.message.includes("skill invocation started: dev-agent") &&
        e.message.includes(`(timeout ${config.orchestrator.invocation_timeout_ms}ms)`)
      );
      expect(startEvent).toBeDefined();
      expect(startEvent?.component).toBe("skill-invoker");
    });

    it("emits EVT-OB-04 (skill invocation complete) after invoking the skill successfully", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [];

      const bundle = createBundle({ agentId: "dev-agent" });
      const result = await invoker.invoke(bundle, config, worktreePath);

      const infos = logger.entries.filter((e) => e.level === "INFO");
      const completeEvent = infos.find((e) =>
        e.message.includes("skill invocation complete: dev-agent") &&
        e.message.includes(`${result.durationMs}ms`)
      );
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.component).toBe("skill-invoker");
    });

    it("emits EVT-OB-03 with correct agentId and timeoutMs from config", async () => {
      config.orchestrator.invocation_timeout_ms = 30_000;
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffWorktreeIncludingUntrackedResult = [];

      const bundle = createBundle({ agentId: "test-agent" });
      await invoker.invoke(bundle, config, worktreePath);

      const infos = logger.entries.filter((e) => e.level === "INFO");
      const startEvent = infos.find((e) =>
        e.message === "skill invocation started: test-agent (timeout 30000ms)"
      );
      expect(startEvent).toBeDefined();
      expect(startEvent?.component).toBe("skill-invoker");
    });

    it("does not emit EVT-OB-04 when invocation times out", async () => {
      config.orchestrator.invocation_timeout_ms = 50;
      skillClient.invokeDelay = 200;

      const bundle = createBundle({ agentId: "dev-agent" });
      try {
        await invoker.invoke(bundle, config, worktreePath);
      } catch {
        // expected timeout error
      }

      const completeEvents = logger.entries.filter(
        (e) => e.level === "INFO" && e.message.includes("skill invocation complete")
      );
      expect(completeEvents).toHaveLength(0);
    });

    it("does not emit EVT-OB-04 when invocation throws an error", async () => {
      skillClient.invokeError = new Error("boom");

      const bundle = createBundle({ agentId: "dev-agent" });
      try {
        await invoker.invoke(bundle, config, worktreePath);
      } catch {
        // expected error
      }

      const completeEvents = logger.entries.filter(
        (e) => e.level === "INFO" && e.message.includes("skill invocation complete")
      );
      expect(completeEvents).toHaveLength(0);
    });
  });
});
