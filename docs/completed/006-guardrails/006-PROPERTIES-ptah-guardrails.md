# Test Properties Document

## Phase 6: Guardrails

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-006-ptah-guardrails |
| **Requirements** | [006-REQ-PTAH-guardrails](006-REQ-PTAH-guardrails.md) |
| **Specifications** | [006-TSPEC-ptah-guardrails](006-TSPEC-ptah-guardrails.md), [006-FSPEC-ptah-guardrails](006-FSPEC-ptah-guardrails.md) |
| **Execution Plan** | [006-PLAN-TSPEC-ptah-guardrails](006-PLAN-TSPEC-ptah-guardrails.md) |
| **Version** | 1.0 |
| **Date** | March 13, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

Phase 6 adds three behavioural safety nets to the Ptah Orchestrator: retry with exponential backoff (`InvocationGuard`), turn-limit enforcement (`ThreadStateManager`), and graceful shutdown (`shutdown.ts` + `WorktreeRegistry`). This properties document derives all testable invariants from the approved requirements, FSPEC, and TSPEC, classifies them by category and test level, and identifies coverage gaps.

### 1.1 Scope

**In scope:**
- `DefaultInvocationGuard` — retry algorithm, failure classification, backoff cancellation, error embed posting
- `InMemoryThreadStateManager` — turn counting, OPEN/CLOSED/STALLED state transitions, review-thread tracking, lazy reconstruction
- `InMemoryWorktreeRegistry` — register/deregister/snapshot protocol
- `InMemoryThreadQueue.activeCount()` — shutdown polling extension
- `DefaultOrchestrator` Phase 6 wiring — turn-limit pre-checks, guard result handling, post-commit error path, debug-channel integration
- `createShutdownHandler` rewrite — 7-step graceful shutdown sequence, double-SIGINT guard
- Config defaults — `retry_base_delay_ms`, `retry_max_delay_ms`, `shutdown_timeout_ms`
- Test doubles — `FakeInvocationGuard`, `FakeThreadStateManager`, `FakeWorktreeRegistry`, FakeGitClient/FakeDiscordClient extensions

**Out of scope:**
- Phase 1–5 modules not modified by Phase 6
- Discord.js library internals
- SkillInvoker and ArtifactCommitter implementation (tested in Phases 3/4)
- Production deployment, monitoring, and alerting

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 6 | [006-REQ-PTAH-guardrails](006-REQ-PTAH-guardrails.md) — REQ-DI-08, REQ-RP-05, REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02 |
| TSPEC sections analyzed | 10 | §4.2 Protocols, §5.1–5.3 Algorithms, §6 Error Handling, §7 Test Strategy, §9 Integration Points |
| FSPEC business rules analyzed | 22+ | FSPEC-GR-01 (GR-R1–R9), FSPEC-GR-02 (GR-R11/R12), FSPEC-GR-03 (GR-R17, R21, R22), 17 acceptance tests |
| Plan tasks reviewed | 33 | Phases A–H (A-1 through H-17) |
| Integration boundaries identified | 5 | InvocationGuard ↔ SkillInvoker/ArtifactCommitter; Orchestrator ↔ ThreadStateManager; Orchestrator ↔ WorktreeRegistry; ShutdownHandler ↔ ThreadQueue; AbortController ↔ InvocationGuard backoff |
| Implementation files reviewed | 0 | Not yet implemented — Phase 6 is pre-implementation |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 22 | REQ-SI-07, REQ-SI-08, REQ-DI-08, REQ-RP-05, REQ-SI-10 | Unit |
| Contract | 7 | REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-DI-08, REQ-RP-05 | Unit / Integration |
| Error Handling | 12 | REQ-SI-08, REQ-SI-10, REQ-NF-02 | Unit |
| Data Integrity | 5 | REQ-DI-08, REQ-RP-05 | Unit |
| Integration | 6 | REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02 | Integration |
| Performance | 3 | REQ-SI-07, REQ-SI-10 | Integration |
| Observability | 6 | REQ-SI-08, REQ-DI-08, REQ-RP-05, REQ-SI-10 | Unit |
| **Total** | **61** | All 6 requirements | |

---

## 3. Properties

**ID format:** `PROP-GR-{NUMBER}` — GR prefix denotes Phase 6 Guardrails across all domains.

**Priority:** All Phase 6 requirements are P0. All properties inherit P0 priority.

### 3.1 Functional Properties

Core business logic and behaviour of each Phase 6 module.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-01 | `DefaultInvocationGuard` must invoke `SkillInvoker.invoke()` then `ArtifactCommitter.commitAndMerge()` as one logical unit and return `{ status: "success", invocationResult, commitResult }` when both succeed on the first attempt | TSPEC §4.2.1, REQ-SI-07 | Unit | P0 |
| PROP-GR-02 | `DefaultInvocationGuard` must retry up to `config.orchestrator.retry_attempts` times on transient failures (`InvocationTimeoutError`, `InvocationError` non-auth) | TSPEC §5.1 Step 7, REQ-SI-07 | Unit | P0 |
| PROP-GR-03 | `DefaultInvocationGuard` must compute backoff delay as `min(retryBaseDelayMs * 2^(retryCount - 1), retryMaxDelayMs)` with no jitter between retries | TSPEC §5.1 Step 7, FSPEC GR-R2, REQ-SI-07 | Unit | P0 |
| PROP-GR-04 | `DefaultInvocationGuard` must perform `git reset --hard HEAD && git clean -fd` on the worktree before each retry attempt | TSPEC §5.1 Step 7, FSPEC GR-R3, REQ-SI-07 | Unit | P0 |
| PROP-GR-05 | `DefaultInvocationGuard` must return `{ status: "exhausted" }` after all `retry_attempts` retries are exhausted | TSPEC §5.1 EXHAUSTION, REQ-SI-08 | Unit | P0 |
| PROP-GR-06 | `DefaultInvocationGuard` must return `{ status: "unrecoverable" }` immediately for auth errors — error messages containing "401", "403", "Unauthorized", or "authentication" — without any retry | TSPEC §5.1 Step 5, TSPEC §6, REQ-SI-08 | Unit | P0 |
| PROP-GR-07 | `DefaultInvocationGuard` must apply the two-strike rule: first `RoutingParseError` or empty Skill output is treated as transient (retry); second consecutive is unrecoverable | TSPEC §5.1 Step 2, Step 5, FSPEC GR-R6, REQ-SI-07 | Unit | P0 |
| PROP-GR-08 | `DefaultInvocationGuard` must reset `malformedSignalCount` to 0 at the start of each `invokeWithRetry()` call (scoped per invocation, not per thread) | TSPEC §4.2.1, FSPEC GR-R7, REQ-SI-07 | Unit | P0 |
| PROP-GR-09 | `DefaultInvocationGuard` must treat `CommitResult.mergeStatus === "conflict"` as unrecoverable — no retry | TSPEC §5.1 Step 3, TSPEC §6, REQ-SI-08 | Unit | P0 |
| PROP-GR-10 | `DefaultInvocationGuard` must route `CommitResult` transient statuses (`"commit-error"`, `"lock-timeout"`, `"merge-error"`) to the retry path via explicit branch in Step 3 (these are returned, not thrown) | TSPEC §5.1 Step 3, TSPEC §6 Q-03, REQ-SI-07 | Unit | P0 |
| PROP-GR-11 | `InMemoryThreadStateManager` must return `"allowed"` and increment `turnCount` when thread is OPEN and `turnCount < maxTurns` | TSPEC §4.2.2, REQ-DI-08 | Unit | P0 |
| PROP-GR-12 | `InMemoryThreadStateManager` must return `"limit-reached"` on the turn that equals `maxTurns` (the turn that hits the limit) | TSPEC §4.2.2, FSPEC GR-R11, REQ-DI-08 | Unit | P0 |
| PROP-GR-13 | `InMemoryThreadStateManager` must return `"limit-reached"` for all subsequent calls on a CLOSED thread (GR-R11 silent drop) | TSPEC §5.2, FSPEC GR-R11, REQ-DI-08 | Unit | P0 |
| PROP-GR-14 | `InMemoryThreadStateManager` must return `"stalled"` when `checkAndIncrementReviewTurn()` is called and `reviewTurnCount >= 4` (fixed limit, not parameterised) | TSPEC §4.2.2, FSPEC GR-R12, REQ-RP-05 | Unit | P0 |
| PROP-GR-15 | `InMemoryThreadStateManager` must return `"stalled"` for all subsequent calls on a STALLED review thread | TSPEC §4.2.2, FSPEC GR-R11, REQ-RP-05 | Unit | P0 |
| PROP-GR-16 | `DefaultOrchestrator.processMessage()` must check review-thread turn limit BEFORE the general turn limit — review check takes priority (GR-R12) | TSPEC §5.2 Step 1, FSPEC GR-R12, REQ-RP-05 | Unit | P0 |
| PROP-GR-17 | `DefaultOrchestrator.processMessage()` must NOT invoke `InvocationGuard` when general turn limit is reached or already CLOSED | TSPEC §5.2 Step 2, FSPEC GR-R11, REQ-DI-08 | Unit | P0 |
| PROP-GR-18 | `DefaultOrchestrator.processMessage()` must NOT invoke `InvocationGuard` when review-thread turn limit is reached or already STALLED | TSPEC §5.2 Step 1, REQ-RP-05 | Unit | P0 |
| PROP-GR-19 | `createShutdownHandler` must call `abortController.abort()` as the first action in Step 2 to cancel pending backoff delays | TSPEC §5.3 Step 2, REQ-SI-10 | Unit | P0 |
| PROP-GR-20 | `createShutdownHandler` must poll `threadQueue.activeCount() > 0` every 500ms until count reaches 0 or `shutdownTimeoutMs` elapses | TSPEC §5.3 Step 3, REQ-SI-10 | Unit | P0 |
| PROP-GR-21 | `createShutdownHandler` must commit pending Git changes in each registered worktree during shutdown Step 4 using `gitClient.hasUncommittedChanges()` check before committing | TSPEC §5.3 Step 4, REQ-SI-10 | Unit | P0 |
| PROP-GR-22 | `DefaultInvocationGuard` must return `{ status: "shutdown" }` when `shutdownSignal` fires during a backoff delay, posting an error embed (treating the last failure as final per AT-GR-16) and cleaning up the worktree | TSPEC §5.1 Step 7 shutdown branch, REQ-SI-10 | Unit | P0 |

---

### 3.2 Contract Properties

Protocol compliance, type conformance, and interface shape.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-23 | `InvocationGuard` protocol must define a single method `invokeWithRetry(params: InvocationGuardParams): Promise<GuardResult>` where `GuardResult` is a discriminated union of `"success" \| "exhausted" \| "unrecoverable" \| "shutdown"` | TSPEC §4.2.1, REQ-SI-07 | Unit | P0 |
| PROP-GR-24 | `InvocationGuardParams` must carry `shutdownSignal: AbortSignal` and `debugChannelId: string \| null` (not stored on guard constructor — passed at call site) | TSPEC §4.2.1, §9.5, REQ-SI-10 | Unit | P0 |
| PROP-GR-25 | `ThreadStateManager` protocol must implement all 9 methods: `checkAndIncrementTurn`, `closeThread`, `registerReviewThread`, `isReviewThread`, `checkAndIncrementReviewTurn`, `stallReviewThread`, `getParentThreadId`, `getStatus`, `openThreadIds`, `reconstructTurnCount` | TSPEC §4.2.2, REQ-DI-08, REQ-RP-05 | Unit | P0 |
| PROP-GR-26 | `WorktreeRegistry` protocol must implement `register(worktreePath, branch)`, `deregister(worktreePath)`, `getAll(): ReadonlyArray<ActiveWorktree>`, `size(): number` | TSPEC §4.2.3, REQ-SI-10 | Unit | P0 |
| PROP-GR-27 | `ThreadQueue` must expose `activeCount(): number` as part of its interface contract | TSPEC §4.2.4, REQ-SI-10 | Unit | P0 |
| PROP-GR-28 | `OrchestratorDeps` must include `invocationGuard: InvocationGuard`, `threadStateManager: ThreadStateManager`, `worktreeRegistry: WorktreeRegistry`, and `shutdownSignal: AbortSignal` as required fields | TSPEC §4.4, REQ-SI-07, REQ-SI-10 | Integration | P0 |
| PROP-GR-29 | `PtahConfig.orchestrator` must accept optional keys `retry_base_delay_ms`, `retry_max_delay_ms`, and `shutdown_timeout_ms` with defaults of 2000, 30000, and 60000 respectively | TSPEC §9.4, REQ-SI-07, REQ-SI-10 | Unit | P0 |

---

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-30 | `DefaultInvocationGuard` must post a red "⛔ Agent Error" embed to the originating thread on exhaustion with a short error description and reference to `#agent-debug` | TSPEC §5.1 Step 9, FSPEC GR-R4, REQ-SI-08 | Unit | P0 |
| PROP-GR-31 | `DefaultInvocationGuard` must log the full error message and stacktrace to `#agent-debug` on exhaustion or unrecoverable failure | TSPEC §5.1 Step 8, FSPEC GR-R4, REQ-SI-08 | Unit | P0 |
| PROP-GR-32 | `DefaultInvocationGuard` must NOT retry the Discord error embed post if posting fails — log to console and proceed (GR-R5) | TSPEC §5.1 Step 10, FSPEC GR-R5, REQ-SI-08 | Unit | P0 |
| PROP-GR-33 | `DefaultInvocationGuard` must clean up worktree (removeWorktree + deleteBranch) on exhaustion, unrecoverable, and shutdown results | TSPEC §5.1 Step 11, REQ-SI-08 | Unit | P0 |
| PROP-GR-34 | `DefaultInvocationGuard` must NOT pass `AbortSignal` to `SkillInvoker.invoke()` — active invocations run to completion; signal is only checked at backoff delay (GR-R17) | TSPEC §5.3 shutdownSignal integration, FSPEC GR-R17, REQ-SI-10 | Unit | P0 |
| PROP-GR-35 | `createShutdownHandler` must call `process.exit(1)` immediately on the second SIGINT — double-SIGINT guard using a `shuttingDown` boolean flag | TSPEC §5.3 Step 1, FSPEC GR-R21, REQ-SI-10 | Unit | P0 |
| PROP-GR-36 | `createShutdownHandler` must call `process.exit(1)` when `shutdownTimeoutMs` elapses before `activeCount()` reaches 0 | TSPEC §5.3 Step 3c, REQ-SI-10 | Unit | P0 |
| PROP-GR-37 | `createShutdownHandler` shutdown commit step must NOT block shutdown on git failure — log to console and continue (handles `index.lock` scenario) | TSPEC §5.3 Step 4, TSPEC §6, REQ-SI-10 | Unit | P0 |
| PROP-GR-38 | `DefaultOrchestrator.processMessage()` must NOT re-throw any error from `InvocationGuard.invokeWithRetry()` — failures are fully handled internally (GR-R1 catch-all) | TSPEC §4.2.1, FSPEC GR-R1, REQ-NF-02 | Unit | P0 |
| PROP-GR-39 | `DefaultOrchestrator.processMessage()` must handle the GR-R9 post-commit response-posting failure: log commit SHA to `#agent-debug`, post partial-commit "⛔ Agent Error" embed, deregister worktree, clean up worktree, return — no retry | TSPEC §5.1 GR-R9 block, REQ-SI-08 | Unit | P0 |
| PROP-GR-40 | `DefaultOrchestrator.postToDebugChannel()` must be a no-op when `debugChannelId` is null (channel not found at startup) | TSPEC §9.5, REQ-SI-08 | Unit | P0 |
| PROP-GR-41 | `DefaultOrchestrator.postToDebugChannel()` must swallow Discord errors with `logger.warn` — never propagate debug-channel post failures | TSPEC §9.5, REQ-SI-08 | Unit | P0 |
| PROP-GR-42 | `createShutdownHandler` must post a best-effort shutdown notification embed to `#agent-debug` in Step 2c, swallowing failures without blocking shutdown (GR-R22) | TSPEC §5.3 Step 2c, FSPEC GR-R22, REQ-SI-10 | Unit | P0 |

---

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and state preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-43 | `InMemoryThreadStateManager.reconstructTurnCount()` must count exactly the messages where `isBot === false` AND content does NOT start with `⏸`, `🔒`, `🚨`, or `⛔` | TSPEC §4.2.2 reconstructTurnCount, REQ-DI-08, REQ-RP-05 | Unit | P0 |
| PROP-GR-44 | `InMemoryThreadStateManager` must default to `{ status: "open", turnCount: 0 }` for any unknown thread ID | TSPEC §4.2.2, REQ-DI-08 | Unit | P0 |
| PROP-GR-45 | `InMemoryThreadStateManager.getStatus()` must return the current `ThreadStatus` (`"open"`, `"closed"`, or `"stalled"`) reflecting the latest state transition | TSPEC §4.2.2, REQ-DI-08, REQ-RP-05 | Unit | P0 |
| PROP-GR-46 | `InMemoryWorktreeRegistry.getAll()` must return a snapshot (`ReadonlyArray`) — mutations after the call must not affect the returned array | TSPEC §4.2.3, REQ-SI-10 | Unit | P0 |
| PROP-GR-47 | `InMemoryThreadQueue.activeCount()` must use a `Set<string>` deduplication strategy — a thread with both active processing and queued items is counted exactly once | TSPEC §4.2.4, PLAN C-2, REQ-SI-10 | Unit | P0 |

---

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-48 | `DefaultOrchestrator` must register the worktree in `WorktreeRegistry` IMMEDIATELY BEFORE calling `invokeWithRetry()` and deregister IMMEDIATELY AFTER receiving any non-`"success"` `GuardResult` | TSPEC §4.4, PLAN E-3, REQ-SI-10 | Integration | P0 |
| PROP-GR-49 | `DefaultOrchestrator` must pass `shutdownSignal` from `OrchestratorDeps` to every `InvocationGuardParams` call site — the signal must flow from the composition-root `AbortController` to each backoff delay | TSPEC §4.4, §5.3, REQ-SI-10 | Integration | P0 |
| PROP-GR-50 | `createShutdownHandler` must call `orchestrator.shutdown()` in Step 5, preserving the existing Phase 5 `questionPoller.stop()` behaviour | TSPEC §5.3 Step 5, §9.3, REQ-SI-10 | Integration | P0 |
| PROP-GR-51 | `DefaultOrchestrator.startup()` must resolve `debugChannelId` by calling `discord.findChannelByName(guildId, "agent-debug")` and store it as `private debugChannelId: string \| null` | TSPEC §9.5, REQ-SI-08 | Integration | P0 |
| PROP-GR-52 | Composition root (`bin/ptah.ts`) must instantiate one shared `AbortController` and wire its `.signal` to `DefaultOrchestrator` and its `.abort()` to `createShutdownHandler` | TSPEC §4.4, §5.3, REQ-SI-10 | Integration | P0 |
| PROP-GR-53 | `DefaultOrchestrator.processMessage()` must reconstruct turn count from Discord history on the first message from a thread since startup (lazy reconstruction) before applying the turn-limit pre-check | TSPEC §5.2 Lazy reconstruction algorithm, REQ-DI-08, REQ-RP-05 | Integration | P0 |

---

### 3.6 Performance Properties

Response times, resource limits, and timeout behaviour.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-54 | `createShutdownHandler` must log a progress message to console every 5 seconds while polling `activeCount()` — avoiding silent wait periods | TSPEC §5.3 Step 3, REQ-SI-10 | Integration | P0 |
| PROP-GR-55 | `DefaultInvocationGuard` backoff delays must be interruptible — an `AbortSignal` abort during the delay must resolve the wait immediately (no wall-clock wait time after abort) | TSPEC §4.2.1, §5.1 Step 7, REQ-SI-10 | Integration | P0 |
| PROP-GR-56 | `createShutdownHandler` must poll `threadQueue.activeCount()` at 500ms intervals (not zero-delay spinning and not >1s intervals) | TSPEC §5.3 Step 3, REQ-SI-10 | Integration | P0 |

---

### 3.7 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-57 | `DefaultInvocationGuard` must log to `#agent-debug` on every retry attempt: `"[ptah] Retry {n}/{max} for {agentId} in thread {threadName} — retrying in {delay}ms. Error: {message}"` | TSPEC §5.1 Step 7, FSPEC GR-R8, REQ-SI-07 | Unit | P0 |
| PROP-GR-58 | `DefaultOrchestrator.processMessage()` must log `"[ptah] Reconstructed turn count for thread {threadId}: {count}"` to console after lazy reconstruction | TSPEC §5.2 Lazy reconstruction, REQ-DI-08 | Unit | P0 |
| PROP-GR-59 | `DefaultOrchestrator.processMessage()` must log to `#agent-debug` when posting a general close embed: `"[ptah] Thread {name} ({id}) closed — max turns ({maxTurnsPerThread}) reached. No further routing."` | TSPEC §5.2 Step 2, REQ-DI-08 | Unit | P0 |
| PROP-GR-60 | `DefaultOrchestrator.processMessage()` must log to `#agent-debug` when posting a review-thread stall embed: `"[ptah] Review thread {name} ({id}) STALLED after 4 turns — no ROUTE_TO_DONE received. Parent thread: {parentId}"` where `{parentId}` comes from `manager.getParentThreadId(threadId)` | TSPEC §5.2 Step 1b, REQ-RP-05 | Unit | P0 |
| PROP-GR-61 | `buildConfig()` must log a startup validation warning when `max_turns_per_thread < 5` | TSPEC §9.4, TSPEC §6, REQ-DI-08 | Unit | P0 |
| PROP-GR-62 | `DefaultInvocationGuard` must log the full error + stacktrace to `#agent-debug` in the exhaustion path: `"[ptah] ERROR: All {retry_attempts} retries exhausted for {agentId} in thread {threadName}. Giving up. Final error: {message}\nStacktrace: {stack}"` | TSPEC §5.1 Step 8, FSPEC GR-R4, REQ-SI-08 | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-GR-63 | `DefaultInvocationGuard` must NOT retry auth errors (error message contains "401", "403", "Unauthorized", or "authentication") — first occurrence is unrecoverable | TSPEC §5.1 Step 5, TSPEC §6, REQ-SI-08 | Unit | P0 |
| PROP-GR-64 | `DefaultInvocationGuard` must NOT retry `CommitResult.mergeStatus === "conflict"` — first occurrence is unrecoverable | TSPEC §5.1 Step 3, TSPEC §6, REQ-SI-08 | Unit | P0 |
| PROP-GR-65 | `DefaultInvocationGuard` must NOT retry the Discord error embed post if posting fails — log to console only (GR-R5) | TSPEC §5.1 Step 10, FSPEC GR-R5, REQ-SI-08 | Unit | P0 |
| PROP-GR-66 | `DefaultInvocationGuard` must NOT store `debugChannelId` as a constructor field — it must be received via `InvocationGuardParams` at each call site to prevent mutable guard state | TSPEC §4.3, §9.5, REQ-SI-08 | Unit | P0 |
| PROP-GR-67 | `DefaultInvocationGuard` must NOT pass `AbortSignal` to `SkillInvoker.invoke()` — active Skill invocations must run to completion without abort interruption (GR-R17) | TSPEC §5.3 shutdownSignal integration, FSPEC GR-R17, REQ-SI-10 | Unit | P0 |
| PROP-GR-68 | `DefaultOrchestrator` must NOT invoke `SkillInvoker` (via `InvocationGuard`) when a thread is in CLOSED or STALLED state — routing must be blocked before invocation | TSPEC §5.2, FSPEC GR-R11, REQ-DI-08, REQ-RP-05 | Unit | P0 |
| PROP-GR-69 | `DefaultOrchestrator` must NOT retry the post-commit Discord response post — artifacts are already committed; retry is incorrect (GR-R9) | TSPEC §5.1 GR-R9 block, REQ-SI-08 | Unit | P0 |
| PROP-GR-70 | `createShutdownHandler` must NOT block shutdown on a git failure during the shutdown commit step — each worktree failure is logged and skipped | TSPEC §5.3 Step 4c, TSPEC §6, REQ-SI-10 | Unit | P0 |
| PROP-GR-71 | `DefaultInvocationGuard` must NOT carry `malformedSignalCount` across separate `invokeWithRetry()` calls — the counter is scoped per invocation (reset to 0 on entry) | TSPEC §5.1 Step 2, FSPEC GR-R7, REQ-SI-07 | Unit | P0 |
| PROP-GR-72 | `DefaultOrchestrator` must NOT expose the Orchestrator process via uncaught errors from any single thread's routing failure — failures are fully contained per invocation | TSPEC §4.2.1, FSPEC GR-R1, REQ-NF-02 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-SI-07 (Retry with Exponential Backoff) | PROP-GR-01, PROP-GR-02, PROP-GR-03, PROP-GR-04, PROP-GR-07, PROP-GR-08, PROP-GR-10, PROP-GR-23, PROP-GR-57, PROP-GR-63, PROP-GR-71 | Full |
| REQ-SI-08 (Graceful Failure Handling) | PROP-GR-05, PROP-GR-06, PROP-GR-09, PROP-GR-30, PROP-GR-31, PROP-GR-32, PROP-GR-33, PROP-GR-38, PROP-GR-39, PROP-GR-40, PROP-GR-41, PROP-GR-51, PROP-GR-62, PROP-GR-64, PROP-GR-65, PROP-GR-66, PROP-GR-69 | Full |
| REQ-DI-08 (Max-Turns System Message) | PROP-GR-11, PROP-GR-12, PROP-GR-13, PROP-GR-16, PROP-GR-17, PROP-GR-43, PROP-GR-44, PROP-GR-45, PROP-GR-53, PROP-GR-58, PROP-GR-59, PROP-GR-61, PROP-GR-68 | Full |
| REQ-RP-05 (Block Fifth Turn in Review Threads) | PROP-GR-14, PROP-GR-15, PROP-GR-16, PROP-GR-18, PROP-GR-25, PROP-GR-53, PROP-GR-60, PROP-GR-68 | Full |
| REQ-SI-10 (Graceful Shutdown) | PROP-GR-19, PROP-GR-20, PROP-GR-21, PROP-GR-22, PROP-GR-24, PROP-GR-26, PROP-GR-27, PROP-GR-28, PROP-GR-34, PROP-GR-35, PROP-GR-36, PROP-GR-37, PROP-GR-42, PROP-GR-46, PROP-GR-47, PROP-GR-48, PROP-GR-49, PROP-GR-50, PROP-GR-52, PROP-GR-54, PROP-GR-55, PROP-GR-56, PROP-GR-67, PROP-GR-70 | Full |
| REQ-NF-02 (Reliability) | PROP-GR-38, PROP-GR-72 | Full |

### 5.2 Specification Coverage

| Specification Section | Properties | Coverage |
|----------------------|------------|----------|
| TSPEC §4.2.1 InvocationGuard protocol | PROP-GR-01–10, PROP-GR-22–24, PROP-GR-30–34, PROP-GR-57, PROP-GR-62–67, PROP-GR-69, PROP-GR-71 | Full |
| TSPEC §4.2.2 ThreadStateManager protocol | PROP-GR-11–16, PROP-GR-25, PROP-GR-43–45, PROP-GR-53, PROP-GR-58–60, PROP-GR-68 | Full |
| TSPEC §4.2.3 WorktreeRegistry protocol | PROP-GR-26, PROP-GR-46, PROP-GR-48 | Full |
| TSPEC §4.2.4 ThreadQueue.activeCount() | PROP-GR-27, PROP-GR-47, PROP-GR-56 | Full |
| TSPEC §4.4 Composition Root / OrchestratorDeps | PROP-GR-28, PROP-GR-49, PROP-GR-51, PROP-GR-52, PROP-GR-66 | Full |
| TSPEC §5.1 Retry Algorithm | PROP-GR-01–10, PROP-GR-22, PROP-GR-30–34, PROP-GR-57, PROP-GR-62, PROP-GR-63–65, PROP-GR-69, PROP-GR-71 | Full |
| TSPEC §5.2 Turn Limit Enforcement | PROP-GR-11–18, PROP-GR-43, PROP-GR-53, PROP-GR-58–60, PROP-GR-68 | Full |
| TSPEC §5.3 Graceful Shutdown Sequence | PROP-GR-19–21, PROP-GR-35–37, PROP-GR-42, PROP-GR-50, PROP-GR-54–56, PROP-GR-67, PROP-GR-70 | Full |
| TSPEC §6 Error Handling | PROP-GR-30–42, PROP-GR-63–70 | Full |
| TSPEC §9.4 Config Schema | PROP-GR-29, PROP-GR-61 | Full |
| TSPEC §9.5 Discord #agent-debug channel | PROP-GR-40, PROP-GR-41, PROP-GR-51, PROP-GR-66 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 6 | 6 | 0 | 0 |
| P1 | 0 | — | — | — |
| P2 | 0 | — | — | — |

---

## 6. Test Level Distribution

```
        /  E2E  \          Few — critical journeys only
       /----------\
      / Integration \      Moderate — cross-module boundaries
     /----------------\
    /    Unit Tests     \  Many — fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 53 | 87% |
| Integration | 9 | 15% |
| E2E (AT-GR-01–17 in `guardrails.test.ts`) | 17 (acceptance tests, not separate properties) | — |
| **Total** | **62** | **100%** |

**Note on E2E acceptance tests:** The 17 AT-GR acceptance tests (Phase H in the PLAN) cross multiple modules and use real implementations with fake timers. They verify end-to-end scenarios rather than isolated module properties, so they are listed separately. They should be validated against the properties listed here — every AT-GR must exercise at least one PROP-GR.

**Justification for 17 acceptance tests:** Phase 6 introduces complex async interactions (retry backoff + AbortSignal cancellation, shutdown coordination across 4 modules). These cannot be adequately verified at unit level alone. Each acceptance test covers a distinct scenario crossing InvocationGuard + Orchestrator + Shutdown boundaries. This count is appropriate for the complexity of the feature.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | `reconstructTurnCount()` heuristic (emoji-prefix detection) may incorrectly count orchestrator system messages if the emoji is embedded mid-message or if a user sends a message starting with the same emoji | If miscounted, a thread may hit the turn limit early or late | Low | Add a code comment documenting the limitation as a deliberate design decision (per TSPEC Q-03 / PLAN B-4 instruction). Add unit tests for boundary cases: messages that start with the emoji vs. contain it mid-message |
| 2 | No property covers the `getAll()` snapshot contract for `WorktreeRegistry` under concurrent modification during shutdown wait | If register/deregister races with shutdown Step 4 iteration, worktrees could be missed or double-processed | Low | `InMemoryWorktreeRegistry` is single-threaded Node.js; race is not a real concern in this runtime. Document this assumption. PROP-GR-46 covers snapshot correctness for sequential use. |
| 3 | The `discord.findChannelByName(guildId, "agent-debug")` call in `startup()` returning null is tested as a no-op (PROP-GR-40) but there is no property for the "null channel resolved at startup, then channel created later" case | Debug logs are silently dropped for the entire session if the channel was missing at boot | Low | Add integration test verifying that `debugChannelId` is populated from the startup call, and that null is handled throughout the session. Out of scope for implementation gate — acceptable risk. |
| 4 | No property explicitly covers the `openThreadIds()` method contract — it's part of the `ThreadStateManager` protocol but is not exercised in any named acceptance test | Monitoring tooling built on this method could be incorrect | Low | Add PROP-GR-25 scope already covers the protocol requirement. Add unit test asserting `openThreadIds()` returns only OPEN thread IDs, not CLOSED or STALLED ones. Recommend adding to thread-state-manager unit test coverage. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Test Engineer | Initial properties document for Phase 6 Guardrails |

---

*End of Document*
