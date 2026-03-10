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
import * as os from "node:os";

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

  beforeEach(() => {
    skillClient = new FakeSkillClient();
    gitClient = new FakeGitClient();
    logger = new FakeLogger();
    config = defaultTestConfig();
    invoker = new DefaultSkillInvoker(skillClient, gitClient, logger);
  });

  // Task 92: Happy path (AT-SI-01)
  describe("happy path", () => {
    it("creates worktree, invokes Claude Code, detects /docs artifact changes, cleans up worktree + branch", async () => {
      skillClient.responses = [{ textContent: "I made changes to docs." }];
      gitClient.diffResult = [
        "docs/features/my-feature.md",
        "docs/overview.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config);

      // Worktree was created (use createdWorktrees since cleanup removes from worktrees)
      expect(gitClient.createdWorktrees).toHaveLength(1);
      const worktree = gitClient.createdWorktrees[0];
      expect(worktree.path).toContain(`${os.tmpdir()}/ptah-worktrees/`);

      // SkillClient was invoked with correct request
      expect(skillClient.invocations).toHaveLength(1);
      const req = skillClient.invocations[0];
      expect(req.systemPrompt).toBe(bundle.systemPrompt);
      expect(req.userMessage).toBe(bundle.userMessage);
      expect(req.worktreePath).toBe(worktree.path);
      expect(req.timeoutMs).toBe(config.orchestrator.invocation_timeout_ms);

      // Result has correct shape
      expect(result.textResponse).toBe("I made changes to docs.");
      expect(result.routingSignalRaw).toBe("I made changes to docs.");
      expect(result.artifactChanges).toEqual([
        "docs/features/my-feature.md",
        "docs/overview.md",
      ]);
      expect(result.worktreePath).toBe(worktree.path);
      expect(result.branch).toBe(worktree.branch);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Cleanup happened
      expect(gitClient.removedWorktrees).toContain(worktree.path);
      expect(gitClient.deletedBranches).toContain(worktree.branch);
    });
  });

  // Task 93: Branch naming (AT-SI-08)
  describe("branch naming", () => {
    it("follows ptah/{agentId}/{threadId}/{invocationId} convention with 8-char hex ID", async () => {
      skillClient.responses = [{ textContent: "ok" }];
      gitClient.diffResult = [];

      const bundle = createBundle({ agentId: "pm-agent", threadId: "thread-99" });
      await invoker.invoke(bundle, config);

      const branch = gitClient.createdWorktrees[0].branch;
      const parts = branch.split("/");
      expect(parts[0]).toBe("ptah");
      expect(parts[1]).toBe("pm-agent");
      expect(parts[2]).toBe("thread-99");
      expect(parts[3]).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  // Task 94: Worktree path
  describe("worktree path", () => {
    it("uses {os.tmpdir()}/ptah-worktrees/{invocationId}", async () => {
      skillClient.responses = [{ textContent: "ok" }];
      gitClient.diffResult = [];

      const bundle = createBundle();
      await invoker.invoke(bundle, config);

      const worktree = gitClient.createdWorktrees[0];
      const tmpdir = os.tmpdir();
      expect(worktree.path).toMatch(
        new RegExp(`^${tmpdir.replace(/[/\\]/g, "[/\\\\]")}/ptah-worktrees/[0-9a-f]{8}$`)
      );

      // The invocationId in the path matches the one in the branch
      const branchId = worktree.branch.split("/")[3];
      expect(worktree.path).toContain(branchId);
    });
  });

  // Task 95: Timeout (AT-SI-04)
  describe("timeout", () => {
    it("throws InvocationTimeoutError when invocation exceeds timeout, cleans up worktree", async () => {
      // Use a very short timeout
      config.orchestrator.invocation_timeout_ms = 50;
      skillClient.invokeDelay = 200;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config)).rejects.toThrow(
        InvocationTimeoutError
      );

      // Cleanup still happened
      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });
  });

  // Task 96: Invocation error (AT-SI-07)
  describe("invocation error", () => {
    it("throws InvocationError when SkillClient throws, cleans up worktree", async () => {
      skillClient.invokeError = new Error("Claude Code crashed");

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config)).rejects.toThrow(
        InvocationError
      );

      // Cleanup still happened
      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });
  });

  // Task 97: Rate limit / API error (AT-SI-11)
  describe("rate limit / API error", () => {
    it("wraps rate limit error in InvocationError and cleans up worktree", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.name = "RateLimitError";
      skillClient.invokeError = rateLimitError;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config)).rejects.toThrow(
        InvocationError
      );

      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });

    it("wraps API error in InvocationError and cleans up worktree", async () => {
      const apiError = new Error("API unavailable");
      apiError.name = "APIError";
      skillClient.invokeError = apiError;

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config)).rejects.toThrow(
        InvocationError
      );

      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });
  });

  // Task 98: Worktree creation failure (AT-SI-06)
  describe("worktree creation failure", () => {
    it("throws when git worktree creation fails, skill is not invoked", async () => {
      gitClient.createWorktreeError = new Error("git worktree add failed");

      const bundle = createBundle();
      await expect(invoker.invoke(bundle, config)).rejects.toThrow(
        "git worktree add failed"
      );

      // Skill was never invoked
      expect(skillClient.invocations).toHaveLength(0);
    });
  });

  // Task 99: Artifact filtering (AT-SI-09)
  describe("artifact filtering", () => {
    it("only includes /docs changes, ignores non-/docs changes with warning", async () => {
      skillClient.responses = [{ textContent: "made changes" }];
      gitClient.diffResult = [
        "docs/features/new-feature.md",
        "src/main.ts",
        "package.json",
        "docs/api/endpoints.md",
        "README.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config);

      expect(result.artifactChanges).toEqual([
        "docs/features/new-feature.md",
        "docs/api/endpoints.md",
      ]);

      // Warning logged for non-docs changes
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("non-docs"))).toBe(true);
    });
  });

  // Task 100: Layer 1 file modification warning (AT-SI-12)
  describe("layer 1 file modification warning", () => {
    it("logs warning for overview.md changes but still includes them", async () => {
      skillClient.responses = [{ textContent: "updated overview" }];
      gitClient.diffResult = [
        "docs/overview.md",
        "docs/features/something.md",
      ];

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config);

      // overview.md is included in artifact changes
      expect(result.artifactChanges).toContain("docs/overview.md");

      // Warning logged about layer 1 modification
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(
        warnings.some((w) => w.message.includes("overview.md"))
      ).toBe(true);
    });
  });

  // Task 101: pruneOrphanedWorktrees (SI-R9)
  describe("pruneOrphanedWorktrees", () => {
    it("calls gitClient.pruneWorktrees with ptah/ prefix", async () => {
      await invoker.pruneOrphanedWorktrees();

      expect(gitClient.prunedPrefixes).toEqual(["ptah/"]);
    });
  });

  // Task 102: Cleanup guaranteed on success, timeout, and error
  describe("cleanup guaranteed", () => {
    it("cleans up worktree and branch on success", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffResult = [];

      const bundle = createBundle();
      await invoker.invoke(bundle, config);

      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });

    it("cleans up worktree and branch on timeout", async () => {
      config.orchestrator.invocation_timeout_ms = 50;
      skillClient.invokeDelay = 200;

      const bundle = createBundle();
      try {
        await invoker.invoke(bundle, config);
      } catch {
        // expected
      }

      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });

    it("cleans up worktree and branch on error", async () => {
      skillClient.invokeError = new Error("boom");

      const bundle = createBundle();
      try {
        await invoker.invoke(bundle, config);
      } catch {
        // expected
      }

      expect(gitClient.removedWorktrees).toHaveLength(1);
      expect(gitClient.deletedBranches).toHaveLength(1);
    });

    it("swallows cleanup errors with warning log", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffResult = [];
      gitClient.removeWorktreeError = new Error("cleanup failed");

      const bundle = createBundle();
      // Should not throw despite cleanup error
      const result = await invoker.invoke(bundle, config);
      expect(result.textResponse).toBe("done");

      // Warning was logged about cleanup failure
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(
        warnings.some((w) => w.message.includes("Failed to cleanup worktree"))
      ).toBe(true);
    });

    it("swallows branch deletion errors with warning log", async () => {
      skillClient.responses = [{ textContent: "done" }];
      gitClient.diffResult = [];
      gitClient.deleteBranchError = new Error("branch delete failed");

      const bundle = createBundle();
      const result = await invoker.invoke(bundle, config);
      expect(result.textResponse).toBe("done");

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(
        warnings.some((w) => w.message.includes("Failed to cleanup branch"))
      ).toBe(true);
    });
  });
});
