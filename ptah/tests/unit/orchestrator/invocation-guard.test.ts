import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefaultInvocationGuard } from "../../../src/orchestrator/invocation-guard.js";
import {
  FakeSkillInvoker,
  FakeArtifactCommitter,
  FakeGitClient,
  FakeDiscordClient,
  FakeResponsePoster,
  FakeLogger,
  defaultTestConfig,
  defaultCommitResult,
} from "../../fixtures/factories.js";
import { InvocationTimeoutError } from "../../../src/orchestrator/skill-invoker.js";
import { RoutingParseError } from "../../../src/orchestrator/router.js";
import type { InvocationGuardParams } from "../../../src/orchestrator/invocation-guard.js";
import type { CommitResult } from "../../../src/types.js";

function makeGuard(
  skillInvoker: FakeSkillInvoker,
  artifactCommitter: FakeArtifactCommitter,
  git: FakeGitClient,
  discord: FakeDiscordClient,
  responsePoster: FakeResponsePoster,
  logger: FakeLogger,
) {
  return new DefaultInvocationGuard(skillInvoker, artifactCommitter, git, discord, responsePoster, logger);
}

function makeParams(overrides: Partial<InvocationGuardParams> = {}): InvocationGuardParams {
  const controller = new AbortController();
  return {
    agentId: "dev-agent",
    threadId: "thread-1",
    threadName: "feature — test",
    bundle: {
      systemPrompt: "sys",
      userMessage: "user",
      agentId: "dev-agent",
      threadId: "thread-1",
      featureName: "test",
      resumePattern: "fresh",
      turnNumber: 1,
      tokenCounts: { layer1: 10, layer2: 20, layer3: 5, total: 35 },
    },
    worktreePath: "/tmp/wt-abc",
    branch: "ptah/dev-agent/thread-1/abc",
    config: {
      ...defaultTestConfig(),
      orchestrator: {
        ...defaultTestConfig().orchestrator,
        retry_attempts: 3,
        retry_base_delay_ms: 100,
        retry_max_delay_ms: 10000,
      },
    },
    shutdownSignal: controller.signal,
    debugChannelId: "debug-ch",
    ...overrides,
  };
}

describe("DefaultInvocationGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("happy path returns success on first attempt", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.result = {
      textResponse: "Agent done",
      routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
      artifactChanges: ["docs/foo.md"],
      durationMs: 500,
    };
    const committer = new FakeArtifactCommitter();
    committer.results = [defaultCommitResult()];
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const result = await guard.invokeWithRetry(makeParams());

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.invocationResult.textResponse).toBe("Agent done");
      expect(result.commitResult.mergeStatus).toBe("merged");
    }
    expect(invoker.invokeCalls).toHaveLength(1);
    expect(committer.commitAndMergeCalls).toHaveLength(1);
    expect(discord.postedEmbeds).toHaveLength(0); // no error embeds on success
  });

  it("transient failure retries and succeeds", async () => {
    const invoker = new FakeSkillInvoker();
    let callCount = 0;
    invoker.invoke = async (bundle, config, worktreePath) => {
      callCount++;
      if (callCount === 1) {
        throw new InvocationTimeoutError(90000);
      }
      return {
        textResponse: "ok",
        routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
        artifactChanges: [],
        durationMs: 100,
      };
    };
    const committer = new FakeArtifactCommitter();
    committer.results = [defaultCommitResult()];
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams());
    // Advance timers past the first backoff (100ms base * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("success");
    expect(callCount).toBe(2);
    expect(git.resetHardCalls).toHaveLength(1);
    expect(git.cleanCalls).toHaveLength(1);
  });

  it("exhaustion after all retries returns exhausted and posts embed", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.invokeError = new Error("Network error");
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    discord.channels.set("agent-debug", "debug-ch");
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams({
      config: {
        ...defaultTestConfig(),
        orchestrator: {
          ...defaultTestConfig().orchestrator,
          retry_attempts: 2,
          retry_base_delay_ms: 100,
          retry_max_delay_ms: 10000,
        },
      },
    }));

    // Advance timers past all backoffe delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("exhausted");
    expect(responsePoster.errorReportCalls).toHaveLength(1);
    expect(responsePoster.errorReportCalls[0].errorType).toBe("ERR-RP-01");
    expect(discord.debugChannelMessages.some(m => m.includes("retries exhausted"))).toBe(true);
  });

  it("auth error → unrecoverable immediately without retries", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.invokeError = new Error("401 Unauthorized");
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const result = await guard.invokeWithRetry(makeParams());

    expect(result.status).toBe("unrecoverable");
    expect(invoker.invokeCalls).toHaveLength(1); // no retries
    expect(responsePoster.errorReportCalls).toHaveLength(1);
    expect(responsePoster.errorReportCalls[0].errorType).toBe("ERR-RP-01");
  });

  it("403 error → unrecoverable immediately", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.invokeError = new Error("403 Forbidden");
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const result = await guard.invokeWithRetry(makeParams());
    expect(result.status).toBe("unrecoverable");
    expect(invoker.invokeCalls).toHaveLength(1);
  });

  it("GR-R6: second consecutive malformed routing signal → unrecoverable", async () => {
    const invoker = new FakeSkillInvoker();
    // Return a response with no routing tag on every call
    invoker.result = {
      textResponse: "no routing tag here",
      routingSignalRaw: "no routing tag here",
      artifactChanges: [],
      durationMs: 100,
    };
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams({
      config: {
        ...defaultTestConfig(),
        orchestrator: {
          ...defaultTestConfig().orchestrator,
          retry_attempts: 3,
          retry_base_delay_ms: 50,
          retry_max_delay_ms: 10000,
        },
      },
    }));
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("unrecoverable");
    expect(invoker.invokeCalls.length).toBe(2); // called twice, second is unrecoverable
  });

  it("commit-error triggers retry", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.result = {
      textResponse: "ok",
      routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
      artifactChanges: [],
      durationMs: 100,
    };
    const committer = new FakeArtifactCommitter();
    const badCommit: CommitResult = { commitSha: null, mergeStatus: "commit-error", branch: "test" };
    const goodCommit: CommitResult = { commitSha: "abc", mergeStatus: "merged", branch: "test" };
    committer.results = [badCommit, goodCommit];
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams());
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("success");
    expect(committer.callIndex).toBe(2);
  });

  it("shutdown signal aborts backoff and returns shutdown", async () => {
    const controller = new AbortController();
    const invoker = new FakeSkillInvoker();
    invoker.invokeError = new Error("Network error");
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const params = makeParams({ shutdownSignal: controller.signal });
    const resultPromise = guard.invokeWithRetry(params);

    // Let the first invocation fail and start backoff
    await vi.advanceTimersByTimeAsync(10);
    // Abort before backoff completes
    controller.abort();
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result.status).toBe("shutdown");
  });

  it("merge conflict → unrecoverable", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.result = {
      textResponse: "ok",
      routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
      artifactChanges: [],
      durationMs: 100,
    };
    const committer = new FakeArtifactCommitter();
    const conflictResult: CommitResult = {
      commitSha: null,
      mergeStatus: "conflict",
      branch: "test",
      conflictMessage: "Conflict in docs/foo.md",
    };
    committer.results = [conflictResult];
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const result = await guard.invokeWithRetry(makeParams());

    expect(result.status).toBe("unrecoverable");
    expect(responsePoster.errorReportCalls).toHaveLength(1);
  });

  it("lock-timeout triggers retry", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.result = {
      textResponse: "ok",
      routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
      artifactChanges: [],
      durationMs: 100,
    };
    const committer = new FakeArtifactCommitter();
    const lockTimeout: CommitResult = { commitSha: null, mergeStatus: "lock-timeout", branch: "test" };
    const goodCommit: CommitResult = { commitSha: "abc", mergeStatus: "merged", branch: "test" };
    committer.results = [lockTimeout, goodCommit];
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams());
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("success");
  });

  it("PROP-GR-57: per-retry debug log posted on each retry attempt", async () => {
    // First call fails, second call succeeds — verifies the per-retry log appears
    const invoker = new FakeSkillInvoker();
    let callCount = 0;
    invoker.invoke = async () => {
      callCount++;
      if (callCount === 1) throw new Error("Transient network error");
      return {
        textResponse: "ok",
        routingSignalRaw: "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>",
        artifactChanges: [],
        durationMs: 100,
      };
    };
    const committer = new FakeArtifactCommitter();
    committer.results = [defaultCommitResult()];
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, new FakeGitClient(), discord, responsePoster, logger);

    const resultPromise = guard.invokeWithRetry(makeParams());
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.status).toBe("success");
    // Per-retry log must appear BEFORE the success log, with exact format
    const retryLog = discord.debugChannelMessages.find(
      (m) => m.includes("Retry 1/3") && m.includes("dev-agent") && m.includes("feature — test") && m.includes("retrying in") && m.includes("Transient network error"),
    );
    expect(retryLog).toBeDefined();
  });

  it("PROP-GR-08: malformedSignalCount resets between separate invokeWithRetry() calls", async () => {
    // Guard instance is shared across two calls. If malformedSignalCount were instance-scoped
    // (a bug), the second call's first malformed signal would push the count to 2 → unrecoverable.
    // With correct per-call scoping, both calls recover after one malformed signal.
    const invoker = new FakeSkillInvoker();
    let totalCallCount = 0;
    invoker.invoke = async () => {
      totalCallCount++;
      // Odd invocations return no routing tag; even invocations return valid tag
      const hasTag = totalCallCount % 2 === 0;
      return {
        textResponse: "response",
        routingSignalRaw: hasTag ? "<routing>{\"type\":\"ROUTE_TO_USER\"}</routing>" : "no routing tag",
        artifactChanges: [],
        durationMs: 100,
      };
    };
    const committer = new FakeArtifactCommitter();
    committer.results = [defaultCommitResult(), defaultCommitResult()];
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, new FakeGitClient(), discord, responsePoster, logger);

    // First call: invoke #1 → no tag (malformedSignalCount=1), retry → invoke #2 → valid → success
    const firstPromise = guard.invokeWithRetry(makeParams());
    await vi.advanceTimersByTimeAsync(200);
    const firstResult = await firstPromise;
    expect(firstResult.status).toBe("success");

    // Second call: malformedSignalCount resets to 0.
    // invoke #3 → no tag (malformedSignalCount=1, NOT 2), retry → invoke #4 → valid → success
    const secondPromise = guard.invokeWithRetry(makeParams());
    await vi.advanceTimersByTimeAsync(200);
    const secondResult = await secondPromise;
    // If malformedSignalCount were instance-scoped, secondResult.status would be "unrecoverable"
    expect(secondResult.status).toBe("success");
  });

  it("does not post to debug channel when debugChannelId is null", async () => {
    const invoker = new FakeSkillInvoker();
    invoker.invokeError = new Error("Network error");
    const committer = new FakeArtifactCommitter();
    const git = new FakeGitClient();
    const discord = new FakeDiscordClient();
    const responsePoster = new FakeResponsePoster();
    const logger = new FakeLogger();
    const guard = makeGuard(invoker, committer, git, discord, responsePoster, logger);

    const params = makeParams({
      debugChannelId: null,
      config: {
        ...defaultTestConfig(),
        orchestrator: {
          ...defaultTestConfig().orchestrator,
          retry_attempts: 0, // no retries, fail immediately
          retry_base_delay_ms: 100,
          retry_max_delay_ms: 10000,
        },
      },
    });
    const result = await guard.invokeWithRetry(params);

    expect(result.status).toBe("exhausted");
    expect(discord.postChannelMessageCalls).toHaveLength(0);
  });
});
