# Cross-Review: Product Manager → TSPEC v1.2 (Confirmation Review)

| Field | Detail |
|-------|--------|
| **Document Reviewed** | `006-TSPEC-ptah-guardrails.md` v1.2 |
| **Reference Documents** | `006-FSPEC-ptah-guardrails.md` v1.3, `006-REQ-PTAH-guardrails.md` v1.0, `CROSS-REVIEW-product-manager-FSPEC-TSPEC-v2.md` (prior PM review), `CROSS-REVIEW-backend-engineer-FSPEC-TSPEC-v2.md` (BE v2 review) |
| **Reviewer** | Product Manager |
| **Date** | March 13, 2026 |
| **Recommendation** | **TSPEC v1.2: Approved. All PM-blocking conditions from the prior review are satisfied. Planning may proceed.** |

---

## 1. Purpose

This review is the PM's final confirmation pass on TSPEC v1.2. The prior PM cross-review (`CROSS-REVIEW-product-manager-FSPEC-TSPEC-v2.md`) assessed TSPEC v1.1 and concluded:

> *"TSPEC: Approved with minor changes — engineering must produce v1.2 addressing BE F-01 and F-02 before planning begins."*

The backend engineer has since produced TSPEC v1.2 (changelog §v1.2) and the BE v2 review (`CROSS-REVIEW-backend-engineer-FSPEC-TSPEC-v2.md`) has verified both findings are correctly resolved. This review confirms the PM-level assessment of the v1.2 changes and provides the final product-perspective sign-off.

---

## 2. Prior PM Blocking Conditions — Verification

### 2.1 BE F-01 — `shutdownSignal: AbortSignal` in `OrchestratorDeps`

**Prior PM assessment:** "Engineering must add this field to TSPEC §4.4 to produce v1.2. No FSPEC change needed."

**Verification in TSPEC v1.2 §4.4:**

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

Composition-root wiring also present in §4.4:

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

**Status: Resolved ✓**

The signal flows: composition root → `OrchestratorDeps.shutdownSignal` → each `InvocationGuardParams.shutdownSignal` call site → `DefaultInvocationGuard` backoff delay check → `AbortController.abort()` from `createShutdownHandler` Step 2a cancels in-progress backoff. This is exactly what FSPEC-GR-03 Step 2a and AT-GR-16 require.

---

### 2.2 BE F-02 — `getParentThreadId()` on `ThreadStateManager` protocol

**Prior PM assessment:** "Engineering must add `getParentThreadId(threadId: string): string | undefined` to the `ThreadStateManager` protocol in TSPEC §4.2.2 and update `FakeThreadStateManager` accordingly. This is required to implement the FSPEC-specified stall log message (`Parent thread: {parentThreadId}`)."

**Verification in TSPEC v1.2 §4.2.2:**

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

**Verification in TSPEC v1.2 §5.2 Step 1b:**

```
postToDebugChannel: "[ptah] Review thread {name} ({id}) STALLED after 4 turns —
  no ROUTE_TO_DONE received. Parent thread: {manager.getParentThreadId(threadId) ?? 'unknown'}"
```

**Verification in TSPEC v1.2 §7.2 `FakeThreadStateManager`:**

```typescript
parentThreadIds = new Map<string, string>();  // threadId → parentThreadId

getParentThreadId(threadId: string): string | undefined {
  return this.parentThreadIds.get(threadId);
}
```

**Status: Resolved ✓**

The FSPEC-specified stall log message `Parent thread: {parentThreadId}` can now be faithfully produced. The `?? 'unknown'` fallback is a reasonable defensive guard that does not alter the product-specified behavior for properly registered review threads.

---

## 3. Requirement → Product Intent Alignment (Final Pass)

| Requirement | FSPEC | TSPEC v1.2 Components | Product Intent Preserved? |
|-------------|-------|----------------------|--------------------------|
| REQ-SI-07 | FSPEC-GR-01 — retry with backoff | `DefaultInvocationGuard.invokeWithRetry()` §5.1 | ✓ |
| REQ-SI-08 | FSPEC-GR-01 — exhaustion path → error embed | EXHAUSTION block §5.1 steps 8–12 | ✓ |
| REQ-NF-02 | FSPEC-GR-01 — GR-R1 isolation | GR-R1 catch-all; orchestrator never re-throws | ✓ |
| REQ-DI-08 | FSPEC-GR-02 — general turn limit + close embed | `checkAndIncrementTurn()` + §5.2 Step 2 | ✓ |
| REQ-RP-05 | FSPEC-GR-02 — review-thread 4-turn limit + stall embed + parent log | `checkAndIncrementReviewTurn()` + `getParentThreadId()` + §5.2 Step 1 | ✓ |
| REQ-SI-10 | FSPEC-GR-03 — graceful shutdown | `createShutdownHandler` + `ThreadQueue.activeCount()` + `WorktreeRegistry` + `shutdownSignal` | ✓ |

All six Phase 6 requirements remain faithfully specified in v1.2. No requirement has been narrowed, reinterpreted, or silently dropped relative to the approved FSPEC v1.3.

---

## 4. Acceptance Test Traceability (Final Confirmation)

All 17 FSPEC acceptance tests (AT-GR-01 through AT-GR-17) remain implementable from TSPEC v1.2. The two must-fix items (F-01, F-02) were the missing plumbing for AT-GR-16 (`shutdownSignal` propagation) and AT-GR-08/AT-GR-09 parent-thread logging — both are now supplied.

No acceptance tests have been dropped, narrowed, or made untestable by the v1.2 changes. The `FakeThreadStateManager.parentThreadIds` map and `FakeInvocationGuard.lastShutdownSignal` additions in §7.2 ensure the relevant ATs (AT-GR-08, AT-GR-16) remain straightforwardly assertable.

---

## 5. No New Product Findings

The v1.2 changes are confined to:
1. Adding `shutdownSignal: AbortSignal` to `OrchestratorDeps` in §4.4 with composition-root wiring.
2. Adding `getParentThreadId()` to the `ThreadStateManager` protocol in §4.2.2, updating the §5.2 Step 1b algorithm, and updating `FakeThreadStateManager` in §7.2.

These are engineering-level additions that close the two specification gaps identified in the prior PM review. No product decisions were made. No FSPEC business rules were altered. No acceptance criteria were reinterpreted.

**No new PM findings. No changes required.**

---

## 6. Deferred Items Status

The three low-severity BE findings (F-03, F-04, F-05) deferred to implementation in the prior PM review remain deferred. The PM position is unchanged:

| Item | PM Position |
|------|-------------|
| F-03: `activeCount()` Set-based deduplication | Accept — shutdown correctness unaffected; log accuracy is an implementation concern |
| F-04: Explicit `register()`/`deregister()` sequencing in §5.2 | Accept — correct ordering is inferrable; enforce in PLAN task descriptions |
| F-05: `WorktreeRegistry.deregister()` on GR-R9 error path | Accept — double-failure scenario; enforce in PLAN task descriptions |

These must be addressed in the PLAN. The BE v2 review has provided concrete implementation guidance for each.

---

## 7. Recommendation

**TSPEC v1.2: Approved.**

Both PM-blocking conditions from the prior review are correctly resolved. The document faithfully implements all six Phase 6 requirements as specified in FSPEC v1.3 and REQ v1.0. No product intent has drifted.

**Planning may begin. No further review cycles are required for FSPEC or TSPEC.**

---

*End of Document*
