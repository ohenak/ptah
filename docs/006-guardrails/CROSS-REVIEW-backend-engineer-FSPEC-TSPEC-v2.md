# Cross-Review: Backend Engineer — FSPEC v1.3 + TSPEC v1.2

| Field | Detail |
|-------|--------|
| **Documents Reviewed** | `006-FSPEC-ptah-guardrails.md` v1.3 · `006-TSPEC-ptah-guardrails.md` v1.2 |
| **Reference Documents** | `006-REQ-PTAH-guardrails.md` v1.0, `CROSS-REVIEW-backend-engineer-FSPEC.md`, `CROSS-REVIEW-backend-engineer-TSPEC.md` (prior v1.1 review) |
| **Reviewer** | Backend Engineer |
| **Date** | March 13, 2026 |
| **Recommendation** | **FSPEC: Approved (no changes needed). TSPEC: Approved — v1.2 resolves all must-fix findings. Path to planning is clear.** |

---

## Purpose

This review supersedes the earlier backend engineer TSPEC review (which assessed v1.1 and recommended "Approved with minor changes" pending F-01 and F-02 resolution). This review:

1. Re-confirms the FSPEC v1.3 approval (no new findings since prior review).
2. Verifies that TSPEC v1.2 correctly resolves BE F-01 and F-02 from the v1.1 review.
3. Assesses the three low-severity findings (BE F-03, F-04, F-05) deferred to implementation.
4. Issues a final approval recommendation for both documents.

---

## 1. FSPEC v1.3 — Re-Confirmation

The FSPEC at v1.3 remains fully approved from an engineering perspective. The prior backend engineer FSPEC cross-review (`CROSS-REVIEW-backend-engineer-FSPEC.md`) approved v1.3 unconditionally. No new technical concerns have surfaced since that review.

**Confirmed:**
- All 23 business rules (GR-R1–GR-R23) are technically implementable without new dependencies.
- All 17 acceptance tests (AT-GR-01–AT-GR-17) are verifiable with Vitest fake timers and injectable fakes.
- All 6 Phase 6 requirements (REQ-SI-07, REQ-SI-08, REQ-NF-02, REQ-DI-08, REQ-RP-05, REQ-SI-10) are covered.
- The TE review cycle improvements (turn-limit semantics fix, AT-GR-16, AT-GR-17, GR-R9 body text) are correctly incorporated.

**FSPEC status: Approved. No action needed.**

---

## 2. TSPEC v1.2 — Must-Fix Findings Verification

### 2.1 BE F-01 — `shutdownSignal: AbortSignal` in `OrchestratorDeps` ✅ RESOLVED

**Prior finding:** §4.4 listed three new `OrchestratorDeps` fields (`invocationGuard`, `threadStateManager`, `worktreeRegistry`) but omitted `shutdownSignal: AbortSignal`, leaving `DefaultOrchestrator` unable to populate `InvocationGuardParams.shutdownSignal` at invocation call sites.

**Verification against v1.2:**

TSPEC §4.4 now includes:

```typescript
// Phase 6 additions to OrchestratorDeps
invocationGuard: InvocationGuard;
threadStateManager: ThreadStateManager;
worktreeRegistry: WorktreeRegistry;
/**
 * Shared AbortSignal from the composition-root AbortController.
 * The orchestrator passes this to InvocationGuardParams.shutdownSignal
 * at each invokeWithRetry() call site, so that backoff delays can be
 * cancelled when the shutdown handler calls abortController.abort().
 */
shutdownSignal: AbortSignal;
```

The composition root wiring snippet is also present:

```typescript
const abortController = new AbortController();
const orchestrator = new DefaultOrchestrator({
  // ... existing deps ...
  invocationGuard,
  threadStateManager,
  worktreeRegistry,
  shutdownSignal: abortController.signal,
});
```

**Resolved correctly.** The signal flows from the composition root → `OrchestratorDeps` → each `InvocationGuardParams` invocation call site → `DefaultInvocationGuard` backoff delay. The `AbortController.abort()` call in `createShutdownHandler` Step 2a now has a complete wiring path to its listeners.

---

### 2.2 BE F-02 — `getParentThreadId()` on `ThreadStateManager` protocol ✅ RESOLVED

**Prior finding:** FSPEC §4.4 Step 3b requires `Parent thread: {parentThreadId}` in the stall log message. The `ThreadStateManager` protocol had no method to retrieve the parent thread ID, leaving the orchestrator unable to access this value.

**Verification against v1.2:**

TSPEC §4.2.2 now includes:

```typescript
/**
 * Return the parent thread ID for a review thread, as supplied to
 * registerReviewThread(). Returns undefined if threadId is unknown or
 * was not registered as a review thread.
 * Used by the orchestrator to populate the #agent-debug stall log message
 * per FSPEC §4.4 Step 3b: "Parent thread: {parentThreadId}".
 */
getParentThreadId(threadId: string): string | undefined;
```

TSPEC §5.2 Step 1b now references this method:

```
postToDebugChannel: "[ptah] Review thread {name} ({id}) STALLED after 4 turns —
  no ROUTE_TO_DONE received. Parent thread: {manager.getParentThreadId(threadId) ?? 'unknown'}"
```

`FakeThreadStateManager` (§7.2) now includes:

```typescript
parentThreadIds = new Map<string, string>();  // threadId → parentThreadId

getParentThreadId(threadId: string): string | undefined {
  return this.parentThreadIds.get(threadId);
}
```

**Resolved correctly.** The stall log message can now faithfully produce the FSPEC-specified `Parent thread: {parentThreadId}` without the orchestrator maintaining redundant review-thread parentage state. The `?? 'unknown'` fallback is an appropriate defensive guard for threads where `registerReviewThread()` was never called.

---

## 3. Deferred Low-Severity Findings — Status Check

The following findings from the v1.1 review were deferred to implementation. Their TSPEC status and implementation risk is assessed here.

### 3.1 BE F-03 — `activeCount()` double-counting threads with processing + queued tasks

**Status:** Still deferred. The TSPEC §4.3 description still reads "counts entries in `processing` where the value is `true`, plus entries in `queues` where the array is non-empty."

**Implementation guidance:** Implement as a `Set<string>`-based count. Collect all thread IDs with `processing.get(id) === true` OR `queues.get(id)?.length > 0` into a `Set<string>`, return `set.size`. This prevents double-counting threads with both an active task and a queued backlog.

**Risk assessment:** Low. Shutdown correctness is unaffected — the loop terminates when all work is done regardless of inflated counts. Log message accuracy is the only impact.

---

### 3.2 BE F-04 — Worktree registration timing implicit in processMessage() algorithm

**Status:** Still deferred. The §5.2 algorithm does not show explicit `worktreeRegistry.register()` / `deregister()` call sites.

**Implementation guidance for the plan:**
1. Call `worktreeRegistry.register(worktreePath, branch)` **immediately before** `guard.invokeWithRetry()` is called.
2. Call `worktreeRegistry.deregister(worktreePath)` immediately after receiving any `GuardResult` with status `"exhausted"`, `"unrecoverable"`, or `"shutdown"` (the guard cleaned up the physical worktree on these paths; only registry cleanup remains).
3. Call `worktreeRegistry.deregister(worktreePath)` after successful response posting (or on the GR-R9 partial-commit error path — see F-05 below).

**Risk assessment:** Low. The correct ordering is inferrable by a competent engineer following the existing GR-R23 guidance. However, it should be enforced in the PLAN's task descriptions to prevent a subtle race during shutdown.

---

### 3.3 BE F-05 — GR-R9 partial-commit error path missing `WorktreeRegistry.deregister()`

**Status:** Still deferred. The §5.1 post-commit failure sequence in the TSPEC does not mention deregistration.

**Implementation guidance:** Add `worktreeRegistry.deregister(worktreePath)` as a cleanup step in the §5.1 GR-R9 path, immediately before or after "Clean up worktree (removeWorktree + deleteBranch)." Without this, a GR-R9 error followed by immediate shutdown will attempt `hasUncommittedChanges()` on a non-existent worktree path.

**Risk assessment:** Low. The gap only manifests on the GR-R9 path (post-commit embed failure) followed by immediate shutdown — a double-failure scenario that is rare in practice. The shutdown commit step's `hasUncommittedChanges()` call on a missing path will either throw (surfacing the bug) or return false (no data loss, but stale registry entry). The PLAN task description for the GR-R9 path should include this deregistration.

---

## 4. Additional Observations on v1.2

### 4.1 `FakeInvocationGuard.lastShutdownSignal` field — correct design

The addition of `lastShutdownSignal: AbortSignal | null` to `FakeInvocationGuard` is the right move. Tests for AT-GR-16 (shutdown cancels backoff) need to assert that the signal passed to `invokeWithRetry()` is the same signal that was aborted. Capturing it on the fake makes this assertion straightforward without testing implementation internals.

### 4.2 `FakeGitClient` additions — complete

The `addAllCalls`, `commitCalls`, and `hasUncommittedChangesResult` additions to `FakeGitClient` cover all three operations needed for the shutdown commit step (§5.3 Step 4). The `resetHardCalls` field covers the worktree rollback before retry (§5.1 Step 7). No gaps.

### 4.3 `isSystemMessage` heuristic — limitation noted

The emoji-prefix heuristic in `reconstructTurnCount()` (excluding messages starting with `⏸`, `🔒`, `🚨`, `⛔`) is a belt-and-suspenders guard on top of the primary `isBot === false` filter. The PM has accepted this tradeoff (false positives would allow one extra turn — a mild, self-correcting over-permissiveness). The TSPEC implementor should add a comment in the `reconstructTurnCount` implementation noting this limitation and the deliberate design decision.

### 4.4 No new dependencies — confirmed

The entire Phase 6 implementation uses only:
- `AbortController` / `AbortSignal` (Node.js 20 built-in)
- `process.on('SIGINT' | 'SIGTERM')` (Node.js built-in)
- `setTimeout` / `clearTimeout` (Node.js built-in, controllable via `vi.useFakeTimers()`)
- Existing Phase 1–5 protocols

No new npm dependencies are introduced. ✓

---

## 5. Requirement → Implementation Coverage (Final Verification)

| Requirement | FSPEC | TSPEC v1.2 Components | Verdict |
|-------------|-------|----------------------|---------|
| REQ-SI-07 | FSPEC-GR-01 — retry with backoff | `DefaultInvocationGuard.invokeWithRetry()` §5.1 | ✓ Complete |
| REQ-SI-08 | FSPEC-GR-01 — exhaustion path → error embed | EXHAUSTION block in §5.1 | ✓ Complete |
| REQ-NF-02 | FSPEC-GR-01 — GR-R1 failure isolation | GR-R1 catch-all; orchestrator never re-throws | ✓ Complete |
| REQ-DI-08 | FSPEC-GR-02 — general turn limit + close embed | `checkAndIncrementTurn()` + §5.2 Step 2 | ✓ Complete (F-01 resolved) |
| REQ-RP-05 | FSPEC-GR-02 — review-thread 4-turn limit + stall embed + parent log | `checkAndIncrementReviewTurn()` + `getParentThreadId()` + §5.2 Step 1 | ✓ Complete (F-02 resolved) |
| REQ-SI-10 | FSPEC-GR-03 — graceful shutdown | `createShutdownHandler` + `ThreadQueue.activeCount()` + `WorktreeRegistry` + `shutdownSignal` | ✓ Complete (F-01 resolved) |

---

## 6. Acceptance Test Implementability (Final Verification)

All 17 FSPEC acceptance tests remain implementable from TSPEC v1.2:

| AT | Scenario | Key TSPEC v1.2 dependency | Status |
|----|----------|--------------------------|--------|
| AT-GR-01 | Retry succeeds on second attempt | `FakeInvocationGuard.results[]`, fake timers | ✓ |
| AT-GR-02 | All retries exhausted — error embed | `DefaultInvocationGuard` EXHAUSTION block | ✓ |
| AT-GR-03 | Exponential backoff timing | §5.1 delay formula + fake timers | ✓ |
| AT-GR-04 | Auth error → unrecoverable, 0 retries | §5.1 Step 5 classifier | ✓ |
| AT-GR-05 | Two consecutive malformed signals | `malformedSignalCount` per-invocation | ✓ |
| AT-GR-06 | General limit fires after 10th turn | `checkAndIncrementTurn()` pre-check | ✓ |
| AT-GR-07 | Silent drop for CLOSED thread | `getStatus() === "closed"` → silent return | ✓ |
| AT-GR-08 | Review thread stalled at 5th turn | `checkAndIncrementReviewTurn()` >= 4 | ✓ |
| AT-GR-09 | ROUTE_TO_DONE on Turn 4 — no stall | Review check returns "allowed"; normal routing proceeds | ✓ |
| AT-GR-10 | Restart → turn counts reconstructed | `reconstructTurnCount()` lazy on first message | ✓ |
| AT-GR-11 | Clean shutdown, no in-flight | `activeCount() = 0` fast path | ✓ |
| AT-GR-12 | Shutdown waits for in-flight | §5.3 Step 3 polling loop | ✓ |
| AT-GR-13 | Shutdown timeout → exit 1 | §5.3 Step 3c force-exit path | ✓ |
| AT-GR-14 | Double SIGINT → immediate exit 1 | `shuttingDown` boolean guard | ✓ |
| AT-GR-15 | Pending git changes committed at shutdown | §5.3 Step 4 `worktreeRegistry.getAll()` loop | ✓ |
| AT-GR-16 | Shutdown cancels backoff — error embed posted | `shutdownSignal` abort + `FakeInvocationGuard.lastShutdownSignal` | ✓ |
| AT-GR-17 | Post-commit embed fails — partial-commit embed | `orchestrator.ts` GR-R9 path (after guard returns "success") | ✓ |

---

## 7. Recommendation

**FSPEC v1.3: Approved.** No changes needed. Confirmed against all 6 requirements, 23 business rules, and 17 acceptance tests.

**TSPEC v1.2: Approved.** The two blocking findings from the v1.1 review are correctly resolved:
- F-01 (`shutdownSignal: AbortSignal` in `OrchestratorDeps`): resolved ✓
- F-02 (`getParentThreadId()` on `ThreadStateManager` protocol): resolved ✓

**Path to planning is clear.** The three deferred low-severity findings (F-03 activeCount deduplication, F-04 registration timing, F-05 GR-R9 deregistration) must be addressed in the PLAN's task descriptions and implementation — they are not blocking planning.

**Recommended PLAN task actions:**
- F-03: Implement `activeCount()` with Set-based deduplication — add as a note to the `ThreadQueue.activeCount()` task.
- F-04: Explicitly sequence `register()`/`deregister()` calls in the `DefaultOrchestrator.processMessage()` task description.
- F-05: Include `worktreeRegistry.deregister(worktreePath)` in the GR-R9 post-commit error handling task.

---

*End of Document*
