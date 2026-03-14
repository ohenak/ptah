# Execution Plan: Phase 6 — Guardrails

| Field | Detail |
|-------|--------|
| **Technical Specification** | [006-TSPEC-ptah-guardrails](006-TSPEC-ptah-guardrails.md) |
| **Requirements** | [006-REQ-PTAH-guardrails](006-REQ-PTAH-guardrails.md) |
| **Functional Specification** | [006-FSPEC-ptah-guardrails](006-FSPEC-ptah-guardrails.md) |
| **Date** | March 13, 2026 |
| **Status** | In Progress |

---

## 1. Summary

Phase 6 adds three behavioral safety nets to the Orchestrator: **retry with exponential backoff** when Skill invocations fail (`InvocationGuard`), **turn-limit enforcement** to prevent runaway threads (`ThreadStateManager`), and **graceful shutdown** on SIGINT/SIGTERM (`shutdown.ts` rewrite + `WorktreeRegistry`). The implementation introduces three new modules, extends two existing modules (`ThreadQueue`, `Orchestrator`), and replaces the minimal `shutdown.ts` with a full structured 7-step shutdown sequence. All retry delays are cancellable via `AbortSignal` so shutdown can interrupt a backoff wait without leaving threads in a half-started state.

---

## 2. Task List

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

### Phase A: Foundation — Types, Config, and Registry

Phase A establishes the type-level and data infrastructure that all subsequent phases depend on: new config keys, the `ThreadStatus` type, and the pure-data `WorktreeRegistry` module.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A-1 | Add `retry_base_delay_ms`, `retry_max_delay_ms`, `shutdown_timeout_ms` optional keys to `PtahConfig.orchestrator` in `src/types.ts`; add `ThreadStatus` type (`"open" \| "closed" \| "stalled"`) and `ThreadStateEntry` interface | `tests/unit/orchestrator/thread-state-manager.test.ts` (type imports used here) | `src/types.ts` | ✅ Done |
| A-2 | Add defaults for `retry_base_delay_ms` (2000), `retry_max_delay_ms` (30000), and `shutdown_timeout_ms` (60000) to `buildConfig()` / `src/config/defaults.ts`; add startup validation warning if `max_turns_per_thread < 5` | `tests/unit/config/defaults.test.ts` (or nearest config test) | `src/config/defaults.ts` | ✅ Done |
| A-3 | Implement `WorktreeRegistry` protocol + `InMemoryWorktreeRegistry` concrete class: `register()`, `deregister()`, `getAll()`, `size()` | `tests/unit/orchestrator/worktree-registry.test.ts` (NEW) | `src/orchestrator/worktree-registry.ts` (NEW) | ✅ Done |
| A-4 | Add `FakeWorktreeRegistry` to `tests/fixtures/factories.ts` | `tests/unit/orchestrator/worktree-registry.test.ts` (uses fake) | `tests/fixtures/factories.ts` | ✅ Done |

---

### Phase B: ThreadStateManager

Phase B implements all turn-count and thread-state logic. This module is purely in-memory with no async operations, making it the safest to TDD first before wiring into the orchestrator.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B-1 | Implement `ThreadStateManager` protocol (interface) with all 8 methods: `checkAndIncrementTurn`, `closeThread`, `registerReviewThread`, `isReviewThread`, `checkAndIncrementReviewTurn`, `stallReviewThread`, `getParentThreadId`, `getStatus`, `openThreadIds`, `reconstructTurnCount` | `tests/unit/orchestrator/thread-state-manager.test.ts` (NEW) | `src/orchestrator/thread-state-manager.ts` (NEW) | ✅ Done |
| B-2 | Implement `InMemoryThreadStateManager`: unknown threads default to OPEN with `turnCount = 0`; general turn limit check via `checkAndIncrementTurn()`; `closeThread()` transitions to CLOSED; CLOSED threads return `"limit-reached"` on subsequent calls (GR-R11 silent drop) | `tests/unit/orchestrator/thread-state-manager.test.ts` | `src/orchestrator/thread-state-manager.ts` | ✅ Done |
| B-3 | Implement review thread tracking in `InMemoryThreadStateManager`: `registerReviewThread()` with `parentThreadId`, `isReviewThread()`, `checkAndIncrementReviewTurn()` (fixed limit of 4), `stallReviewThread()`, `getParentThreadId()`, GR-R12 (review check priority), GR-R11 silent drop for STALLED | `tests/unit/orchestrator/thread-state-manager.test.ts` | `src/orchestrator/thread-state-manager.ts` | ✅ Done |
| B-4 | Implement `reconstructTurnCount()` in `InMemoryThreadStateManager`: count messages where `isBot === false` and content does not start with `⏸`, `🔒`, `🚨`, `⛔`; add comment documenting the emoji-prefix heuristic limitation and deliberate design decision | `tests/unit/orchestrator/thread-state-manager.test.ts` | `src/orchestrator/thread-state-manager.ts` | ✅ Done |
| B-5 | Add `FakeThreadStateManager` to `tests/fixtures/factories.ts` with all controllable fields: `turnResults`, `reviewTurnResults`, `reviewThreadIds`, `turnCounts`, `openThreadIdSet`, `parentThreadIds`; implement full protocol | `tests/unit/orchestrator/orchestrator.test.ts` (uses fake) | `tests/fixtures/factories.ts` | ✅ Done |

---

### Phase C: ThreadQueue — `activeCount()`

Phase C adds the single new method to the existing `ThreadQueue` needed for shutdown polling.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C-1 | Add `activeCount(): number` to `ThreadQueue` interface | `tests/unit/orchestrator/thread-queue.test.ts` | `src/orchestrator/thread-queue.ts` | ✅ Done |
| C-2 | Implement `activeCount()` on `InMemoryThreadQueue` using a `Set<string>`-based count: collect all thread IDs where `processing.get(id) === true` OR `queues.get(id)?.length > 0`; return `set.size` (prevents double-counting — BE F-03) | `tests/unit/orchestrator/thread-queue.test.ts` | `src/orchestrator/thread-queue.ts` | ✅ Done |

---

### Phase D: InvocationGuard

Phase D implements the core retry-with-backoff module. This is the most complex Phase 6 component. All backoff delay tests use `vi.useFakeTimers()`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D-1 | Define `InvocationGuard` protocol, `InvocationGuardParams` type, `GuardResult` discriminated union (`"success" \| "exhausted" \| "unrecoverable" \| "shutdown"`), and `FailureCategory` type in `src/orchestrator/invocation-guard.ts` | `tests/unit/orchestrator/invocation-guard.test.ts` (NEW) | `src/orchestrator/invocation-guard.ts` (NEW) | ✅ Done |
| D-2 | Implement `DefaultInvocationGuard` happy path: success on first attempt returns `{ status: "success", invocationResult, commitResult }` | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-3 | Implement transient failure + retry path: `InvocationTimeoutError` and `InvocationError` (non-auth) trigger retry; exponential backoff delay formula `min(retryBaseDelayMs * 2^(retryCount - 1), retryMaxDelayMs)` using `vi.useFakeTimers()`; worktree reset (`git reset --hard HEAD && git clean -fd`) before each retry | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-4 | Implement exhaustion path: after `retry_attempts` retries, post red "⛔ Agent Error" embed to originating thread; log full error + stacktrace to `#agent-debug`; handle Discord unavailability gracefully (log to console, do NOT retry embed — GR-R5); clean up worktree; return `{ status: "exhausted" }` | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-5 | Implement unrecoverable failure classification: auth errors ("401"/"403"/"Unauthorized"/"authentication") skip retries entirely; merge conflict (`CommitResult.mergeStatus === "conflict"`) skips retries; return `{ status: "unrecoverable" }` after posting error embed | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-6 | Implement GR-R6 two-strike rule for malformed/missing routing signals: `RoutingParseError` on 1st occurrence → transient retry; 2nd consecutive → unrecoverable; empty Skill output (no routing tag) treated identically; `malformedSignalCount` is scoped per invocation (reset to 0 each `invokeWithRetry()` call, not per thread) | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-7 | Implement `CommitResult` transient status handling in §5.1 Step 3: `"commit-error"`, `"lock-timeout"`, `"merge-error"` returned by `commitAndMerge()` (NOT thrown) must be detected and routed to retry path explicitly | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-8 | Implement `shutdownSignal` integration: if `shutdownSignal` fires during a backoff delay, post error embed (treating last failure as final — AT-GR-16), clean up worktree, return `{ status: "shutdown" }`; `AbortSignal` is NOT passed to `SkillInvoker.invoke()` (active invocations run to completion — GR-R17) | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ✅ Done |
| D-9 | Add `FakeInvocationGuard` to `tests/fixtures/factories.ts`: `results: GuardResult[]`, `callCount`, `lastParams`, `lastShutdownSignal` (for AT-GR-16 assertions); returns results in order, repeats last when exhausted | `tests/unit/orchestrator/orchestrator.test.ts` (uses fake) | `tests/fixtures/factories.ts` | ✅ Done |
| D-10 | Extend `FakeGitClient` in `tests/fixtures/factories.ts` with Phase 6 additions: `hasUncommittedChangesResult = false`, `resetHardCalls: string[]`, `addAllCalls: string[]`, `commitCalls: Array<{ path: string; message: string }>` | Various Phase 6 tests | `tests/fixtures/factories.ts` | ✅ Done |
| D-11 | Extend `FakeDiscordClient` in `tests/fixtures/factories.ts` with `debugChannelMessages: string[]` field (separate from any existing `postChannelMessageCalls`) for asserting `#agent-debug` posts | Various Phase 6 tests | `tests/fixtures/factories.ts` | ✅ Done |

---

### Phase E: Orchestrator — Phase 6 Wiring

Phase E wires all new Phase 6 modules into `DefaultOrchestrator` and extends `processMessage()` with turn-limit checks. This phase modifies existing code and requires the most careful test coverage.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E-1 | Extend `OrchestratorDeps` with Phase 6 fields: `invocationGuard: InvocationGuard`, `threadStateManager: ThreadStateManager`, `worktreeRegistry: WorktreeRegistry`, `shutdownSignal: AbortSignal`; update `DefaultOrchestrator` constructor to store them as private fields | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |
| E-2 | Add `private debugChannelId: string \| null = null` to `DefaultOrchestrator`; resolve it in `startup()` by calling `discord.findChannelByName(guildId, "agent-debug")`; add `private async postToDebugChannel(message: string): Promise<void>` helper (no-op if `debugChannelId` is null; swallows Discord errors with `logger.warn`) | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |
| E-3 | Replace direct `skillInvoker.invoke()` + `artifactCommitter.commitAndMerge()` calls in `processMessage()` with `invocationGuard.invokeWithRetry(params)`; pass `shutdownSignal` and `debugChannelId` in `InvocationGuardParams`; register worktree **immediately before** `invokeWithRetry()` call; handle `GuardResult` statuses: `"success"` continues, `"exhausted"` / `"unrecoverable"` / `"shutdown"` deregisters worktree and returns | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |
| E-4 | Add turn-limit pre-check at the start of `processMessage()` (before agent resolution, after deduplication): (1) if review thread → `checkAndIncrementReviewTurn()` → on `"stalled"` post red "🚨 Review Thread Stalled" embed + `postToDebugChannel` with parent thread ID (GR-R12 takes priority); (2) general limit → `checkAndIncrementTurn()` → on `"limit-reached"` check if already CLOSED (GR-R11 silent drop) else post orange "🔒 Thread Closed" embed + `postToDebugChannel` + `closeThread()` | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |
| E-5 | Add lazy turn-count reconstruction in `processMessage()`: before the turn-limit check, if thread has not been seen since startup (not in an in-memory `seenThreadIds: Set<string>`), call `threadStateManager.reconstructTurnCount(threadId, await discord.readThreadHistory(threadId), isReviewThread)`; log `"[ptah] Reconstructed turn count for thread {threadId}: {count}"` | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |
| E-6 | Implement GR-R9 / AT-GR-17 post-commit response-posting failure path in `processMessage()`: after `guard.invokeWithRetry()` returns `{ status: "success" }`, if the Discord response embed post throws — do NOT retry; log commit SHA to `#agent-debug`; post red partial-commit "⛔ Agent Error" embed; deregister worktree (BE F-05); clean up worktree; return | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ✅ Done |

---

### Phase F: Graceful Shutdown

Phase F rewrites `shutdown.ts` with the full 7-step sequence and updates the composition root.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F-1 | Rewrite `createShutdownHandler()` signature to accept new Phase 6 params: `threadQueue: ThreadQueue`, `worktreeRegistry: WorktreeRegistry`, `gitClient: GitClient`, `orchestrator: Orchestrator`, `discord: DiscordClient`, `shutdownTimeoutMs: number`, `abortController: AbortController`, `debugChannelId?: string \| null` (in addition to existing `result: StartResult` and `logger: Logger`); implement double-SIGINT guard (AT-GR-14 — `shuttingDown` boolean → `process.exit(1)` on second signal) | `tests/unit/shutdown.test.ts` (NEW/extended) | `src/shutdown.ts` | ✅ Done |
| F-2 | Implement Step 2 in `createShutdownHandler`: call `abortController.abort()` to cancel pending backoff delays; log shutdown notice to console; best-effort post `#agent-debug` embed (swallow failure — GR-R22) | `tests/unit/shutdown.test.ts` | `src/shutdown.ts` | ✅ Done |
| F-3 | Implement Step 3 wait loop in `createShutdownHandler`: poll `threadQueue.activeCount() > 0` every 500ms with 5-second progress log; on `shutdownTimeoutMs` exceeded → log force-exit message, set `exitCode = 1`; use `vi.useFakeTimers()` in tests | `tests/unit/shutdown.test.ts` | `src/shutdown.ts` | ✅ Done |
| F-4 | Implement Step 4 shutdown commit in `createShutdownHandler`: iterate `worktreeRegistry.getAll()`; for each, call `gitClient.hasUncommittedChanges()`; if true → `git add -A` + `git commit -m "[ptah] System: shutdown commit — uncommitted changes preserved"`; log on success; on git failure log and continue (non-blocking — handles `index.lock` scenario) | `tests/unit/shutdown.test.ts` | `src/shutdown.ts` | ✅ Done |
| F-5 | Implement Steps 5–7 in `createShutdownHandler`: Step 5 `await orchestrator.shutdown()` (stops questionPoller); Step 6 `discord.disconnect()` with 5-second timeout (force-close with log if exceeded); Step 7 `process.exit(exitCode)` | `tests/unit/shutdown.test.ts` | `src/shutdown.ts` | ✅ Done |

---

### Phase G: Composition Root

Phase G wires all new Phase 6 modules into `bin/ptah.ts`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G-1 | Update `bin/ptah.ts` composition root: create `AbortController`, instantiate `InMemoryWorktreeRegistry`, `InMemoryThreadStateManager`, `DefaultInvocationGuard` (with `skillInvoker`, `artifactCommitter`, `gitClient`, `discordClient`, `logger`); pass all new deps + `shutdownSignal: abortController.signal` to `DefaultOrchestrator`; update `createShutdownHandler` call with all new Phase 6 params (`orchestrator`, `discord`, `shutdownTimeoutMs`, `abortController`) | N/A (integration test coverage) | `bin/ptah.ts` | ✅ Done |

---

### Phase H: Acceptance Tests

Phase H writes the end-to-end integration tests that verify all 17 FSPEC acceptance tests (AT-GR-01 through AT-GR-17).

> **Note:** `vi.useFakeTimers()` is **required** in the `guardrails.test.ts` suite-level setup (`beforeEach`/`beforeAll`). Tasks H-3, H-11, H-12, H-13, and H-16 involve timing-sensitive assertions (backoff delay formula, 500ms poll interval, 5-second progress log, `shutdownTimeoutMs` elapse). Without fake timers these tests will rely on real wall-clock time, making them slow (30+ seconds per test) and flaky. (TE review finding F-02.)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| H-1 | AT-GR-01 — retry succeeds on second attempt: Skill fails once, succeeds on retry; assert 2 invocations, no error embed | `tests/integration/orchestrator/guardrails.test.ts` (NEW) | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| H-2 | AT-GR-02 — all retries exhausted: Skill fails `retry_attempts + 1` times; assert error embed posted to thread, `#agent-debug` log, Orchestrator continues for other threads | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| H-3 | AT-GR-03 — exponential backoff timing: 3 failures; assert delays match formula `min(base * 2^n, max)` using fake timers | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| H-4 | AT-GR-04 — auth error → unrecoverable, 0 retries: Skill throws `InvocationError` with "401"; assert no retry, error embed posted immediately | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| H-5 | AT-GR-05 — two consecutive malformed signals: assert first → transient retry, second → error embed, Orchestrator continues | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| H-6 | AT-GR-06 — general turn limit fires: thread with 10 turns; 11th message → orange "🔒" embed + `#agent-debug` log, Skill NOT invoked | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/thread-state-manager.ts`, `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| H-7 | AT-GR-07 — silent drop for CLOSED thread: 12th message to already-CLOSED thread → no embed, no routing | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/thread-state-manager.ts`, `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| H-8 | AT-GR-08 — review thread stalled at 5th turn: 5th message → red "🚨 Review Thread Stalled" embed + `#agent-debug` log with parent thread ID | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/thread-state-manager.ts`, `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| H-9 | AT-GR-09 — `ROUTE_TO_DONE` on Turn 4 in review thread → no stall; normal routing proceeds | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/thread-state-manager.ts`, `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| H-10 | AT-GR-10 — restart → turn counts reconstructed lazily from Discord history on first message post-restart | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/thread-state-manager.ts`, `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| H-11 | AT-GR-11 — clean shutdown, no in-flight: `activeCount() = 0` immediately; `process.exit(0)` within 2 seconds | `tests/integration/orchestrator/guardrails.test.ts` | `src/shutdown.ts` | ⬚ Not Started |
| H-12 | AT-GR-12 — shutdown waits for in-flight invocation: `activeCount()` drops to 0 after delay; shutdown completes normally | `tests/integration/orchestrator/guardrails.test.ts` | `src/shutdown.ts` | ⬚ Not Started |
| H-13 | AT-GR-13 — shutdown timeout exceeded: `activeCount()` never reaches 0; `shutdownTimeoutMs` elapses; `process.exit(1)` | `tests/integration/orchestrator/guardrails.test.ts` | `src/shutdown.ts` | ⬚ Not Started |
| H-14 | AT-GR-14 — double SIGINT → immediate `process.exit(1)` | `tests/integration/orchestrator/guardrails.test.ts` | `src/shutdown.ts` | ⬚ Not Started |
| H-15 | AT-GR-15 — pending Git changes committed at shutdown: worktree with uncommitted changes; shutdown Step 4 commits them | `tests/integration/orchestrator/guardrails.test.ts` | `src/shutdown.ts`, `src/orchestrator/worktree-registry.ts` | ⬚ Not Started |
| H-16 | AT-GR-16 — shutdown cancels backoff: invocation waiting in backoff delay when SIGINT arrives; `shutdownSignal` aborts delay; error embed posted (last failure treated as final); no retry 2 attempted | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/invocation-guard.ts`, `src/shutdown.ts` | ⬚ Not Started |
| H-17 | AT-GR-17 — post-commit embed fails: `invokeWithRetry()` returns `{ status: "success" }`; Discord response post throws; partial-commit "⛔ Agent Error" embed posted; commit SHA logged to `#agent-debug`; worktree deregistered | `tests/integration/orchestrator/guardrails.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |

---

## 3. Task Dependency Notes

```
Phase A (Types + Config + WorktreeRegistry)
  └── Phase B (ThreadStateManager) ← depends on A-1 for types
  └── Phase C (ThreadQueue.activeCount) ← independent; run in parallel with B
  └── Phase D (InvocationGuard) ← depends on A-1 for types; D-10/D-11 depend on A-4
  └── Phase E (Orchestrator wiring) ← depends on B-5, C-2, D-9, D-10, D-11
  └── Phase F (Shutdown) ← depends on C-2 (activeCount), A-3 (WorktreeRegistry)
  └── Phase G (Composition Root) ← depends on ALL phases A–F
  └── Phase H (Acceptance Tests) ← depends on Phase G; individual ATs map to earlier phases

Recommended sequencing:
  A → {B, C, D} in parallel → E → F → G → H

  A-1 (types) must be done before B-1, D-1.
  A-3 (WorktreeRegistry) can be done in parallel with B and D.
  A-4 (FakeWorktreeRegistry) can be done alongside A-3.
  D-9/D-10/D-11 (new fakes in factories.ts) should be done before E-1 to avoid
  merge conflicts in factories.ts.
  E-3 and E-4 are the most critical integration tasks — they must be done
  sequentially within Phase E and tested carefully against existing
  orchestrator.test.ts suites to prevent regressions.
```

**Note on deferred BE findings:**
- **BE F-03** (activeCount deduplication): Addressed in C-2 with explicit `Set<string>` guidance.
- **BE F-04** (registration timing): Explicitly sequenced in E-3 — `register()` immediately before `invokeWithRetry()`, `deregister()` immediately after receiving non-success `GuardResult`.
- **BE F-05** (GR-R9 deregistration): Explicitly included in E-6 — `worktreeRegistry.deregister(worktreePath)` is listed as a required step in the post-commit error path.

---

## 4. Integration Points

### 4.1 Phase 3 (Skill Routing)
`DefaultInvocationGuard` wraps the existing `SkillInvoker.invoke()` call. The `ContextAssembler` and routing-signal parsing in `orchestrator.ts` are unchanged. Phase E-3 replaces the direct `skillInvoker.invoke()` call with `invocationGuard.invokeWithRetry()` — the surrounding orchestrator flow (context assembly, response posting, signal parsing) is unchanged.

### 4.2 Phase 4 (Artifact Commits)
`DefaultInvocationGuard` calls `ArtifactCommitter.commitAndMerge()` inside the retry scope. D-7 handles the returned (not thrown) `CommitResult` transient statuses. The worktree reset step before retry ensures no partial commit state bleeds into the next attempt.

### 4.3 Phase 5 (User Questions)
`DefaultOrchestrator.shutdown()` already calls `questionPoller.stop()`. Phase F-5 calls `orchestrator.shutdown()` in Step 5 to preserve this behaviour. The `AbortController.abort()` fires in Step 2a, before the wait loop, so any retry backoff in progress is cancelled before the poller is stopped.

### 4.4 Existing Test Suite
The `tests/unit/orchestrator/orchestrator.test.ts` file (78k) will require the most careful updates during Phase E. The existing `FakeSkillInvoker` and `FakeArtifactCommitter` will remain but will be used inside `DefaultInvocationGuard` rather than directly by the orchestrator. Phase E tests must verify that the orchestrator correctly delegates to `FakeInvocationGuard` and handles all four `GuardResult` statuses.

### 4.5 Config Defaults
Phase A-2 adds new optional keys to `PtahConfig.orchestrator`. Existing tests that construct `PtahConfig` directly (without going through `buildConfig()`) will not be affected — the keys are `optional` so they can be omitted. Only tests that explicitly test config loading/defaults need updating.

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (REQ-DI-08, REQ-RP-05, REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02)
- [ ] Implementation matches TSPEC v1.3 (protocols, algorithm, error handling, test doubles)
- [ ] All 17 acceptance tests (AT-GR-01 through AT-GR-17) pass in `tests/integration/orchestrator/guardrails.test.ts`
- [ ] BE deferred findings addressed: F-03 (activeCount deduplication), F-04 (registration timing), F-05 (GR-R9 deregistration)
- [ ] `isSystemMessage` heuristic in `reconstructTurnCount()` has an explanatory code comment documenting the limitation and deliberate design decision
- [ ] Existing Phase 1–5 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-guardrails` for review

---

*Gate: PLAN reviewed and approved by test-engineer and product-manager before implementation begins.*
