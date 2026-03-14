# Cross-Review: Backend Engineer — TSPEC-PTAH-PHASE6 (v1.1)

| Field | Detail |
|-------|--------|
| **Document Reviewed** | [006-TSPEC-ptah-guardrails.md](./006-TSPEC-ptah-guardrails.md) (v1.1) |
| **Reference Documents** | [006-FSPEC-ptah-guardrails.md](./006-FSPEC-ptah-guardrails.md) (v1.3), [006-REQ-PTAH-guardrails.md](./006-REQ-PTAH-guardrails.md) (v1.0) |
| **Reviewer** | Backend Engineer |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved with minor changes** — F-01 and F-02 should be addressed before plan creation; F-03, F-04, F-05 can be resolved during implementation |

---

## Summary

The TSPEC v1.1 is architecturally sound and ready for planning. The three new modules (`InvocationGuard`, `ThreadStateManager`, `WorktreeRegistry`) are cleanly designed with correct protocol boundaries. The retry algorithm, turn-limit integration, and shutdown sequence all faithfully implement the FSPEC behavioral flows. The TE review's four mismatches are correctly resolved in v1.1.

Five implementation gaps are identified. Two require TSPEC updates before planning (F-01: missing `shutdownSignal` wiring into `OrchestratorDeps`; F-02: missing `parentThreadId` accessor on `ThreadStateManager`). Three are low-risk and can be addressed during implementation (F-03: `activeCount()` double-counting; F-04: worktree registration timing; F-05: deregistration on GR-R9 path).

---

## Findings

### F-01 (Medium) — `OrchestratorDeps` missing `shutdownSignal: AbortSignal`

**Location:** §4.4 Composition Root, `OrchestratorDeps` additions

**Description:**
§5.3 correctly specifies that a single `AbortController` is created at the composition root, with `controller.signal` passed to `DefaultOrchestrator` so it can populate `InvocationGuardParams.shutdownSignal` at each invocation call site. However, §4.4 only lists three new `OrchestratorDeps` fields:

```typescript
// Phase 6 additions to OrchestratorDeps
invocationGuard: InvocationGuard;
threadStateManager: ThreadStateManager;
worktreeRegistry: WorktreeRegistry;
```

`shutdownSignal: AbortSignal` is absent. Without this field, `DefaultOrchestrator` has no reference to the signal and cannot populate `InvocationGuardParams.shutdownSignal` when calling `guard.invokeWithRetry()`. The composition root wiring in §4.4 shows `abortController` being passed to `createShutdownHandler` but not to `DefaultOrchestrator`.

**Impact:** Medium — the engineer cannot implement the `processMessage()` invocation call without this field. If it is not added to the TSPEC, the engineer must invent the wiring pattern, potentially choosing an inconsistent approach (e.g., storing the controller on the orchestrator instead of the signal, or accessing it via a closure).

**Resolution:** Add `shutdownSignal: AbortSignal` to the `OrchestratorDeps` additions in §4.4, and add the corresponding composition-root line: `shutdownSignal: controller.signal` passed into `DefaultOrchestrator`.

---

### F-02 (Medium) — `ThreadStateManager` protocol has no `parentThreadId` accessor — required for FSPEC §4.4 Step 3b stall log

**Location:** §4.2.2 `ThreadStateManager` protocol, §5.2 Turn Limit algorithm Step 1b

**Description:**
FSPEC §4.4 Step 3b requires this `#agent-debug` log entry when a review thread stalls:
```
"[ptah] Review thread {threadName} ({threadId}) STALLED after 4 turns —
 no ROUTE_TO_DONE received. Thread halted. Parent thread: {parentThreadId}"
```

`registerReviewThread(threadId, parentThreadId)` stores the `parentThreadId` in `ThreadStateEntry.parentThreadId`. However, the `ThreadStateManager` protocol exposes no method to retrieve it. The orchestrator's `processMessage()` has the `threadId` but does not independently track review-thread parentage — it relies on `ThreadStateManager` for that state.

The §5.2 algorithm Step 1b shows the debug channel post:
```
postToDebugChannel: "[ptah] Review thread {name} ({id}) STALLED after 4 turns —
  no ROUTE_TO_DONE received. Parent thread: {parentId}"
```
...but `{parentId}` has no specified source in the algorithm.

**Impact:** Medium — the engineer will need to either (a) invent an ad-hoc retrieval method, (b) have the orchestrator maintain a redundant review-thread→parent map, or (c) omit `parentThreadId` from the log message (deviating from the FSPEC). Option (c) is an FSPEC violation; options (a) and (b) add unspecified state management.

**Resolution:** Add `getParentThreadId(threadId: string): string | undefined` to the `ThreadStateManager` protocol. Update `FakeThreadStateManager` to implement it (returning from a `Map<string, string>`). Update §5.2 Step 1b to reference `manager.getParentThreadId(threadId)` as the source of `{parentId}`.

---

### F-03 (Low) — `activeCount()` double-counts threads with both processing and queued tasks

**Location:** §4.2.4 `ThreadQueue` updates, §4.3 `InMemoryThreadQueue` description

**Description:**
The `activeCount()` description in §4.3 reads: "counts entries in `processing` where the value is `true`, plus entries in `queues` where the array is non-empty." A thread that is actively executing (processing=true) AND has pending tasks queued (queues.length > 0) will be counted twice — once from the `processing` map and once from the `queues` map. This is a valid runtime state: a thread processes its current task while additional tasks accumulate.

For the shutdown wait loop (`while threadQueue.activeCount() > 0`), the inflated count does not break correctness — the loop still waits until all work completes. However, the periodic log message `"Waiting for {count} in-flight invocation(s) to complete..."` will report a count higher than the actual number of threads with pending work, which is misleading during diagnostics.

**Impact:** Low — shutdown correctness is not affected. Log accuracy is degraded.

**Resolution:** Implement `activeCount()` as a Set-based count of distinct thread IDs: collect all thread IDs that have `processing=true` OR `queues.length > 0` into a `Set<string>`, then return `set.size`. Update the §4.3 description accordingly.

---

### F-04 (Low) — Worktree registration timing is implicit; needs explicit specification in §5.2 algorithm

**Location:** §5.2 Turn Limit / processMessage() algorithm, §4.2.3 `WorktreeRegistry` contract

**Description:**
`InvocationGuardParams.worktreePath: string` implies the orchestrator computes the worktree path before calling `invokeWithRetry()`. The `WorktreeRegistry` is listed under `OrchestratorDeps` (not `InvocationGuardDeps`), correctly placing register/deregister responsibility with the orchestrator. However, the TSPEC does not state when in `processMessage()` the orchestrator calls `register()` and `deregister()`.

For shutdown correctness, registration must happen **before** `invokeWithRetry()` is called — not after it returns. If shutdown fires between `invokeWithRetry()` being called and the guard internally creating the worktree (inside `SkillInvoker.invoke()`), the registry will correctly contain the path, enabling `hasUncommittedChanges()` to be called. If registration happened after return, the window where shutdown could miss the worktree would be larger.

The `deregister()` timing is equally implicit: the guard deregisters on failure paths internally (via its `InvocationGuardParams` cleanup logic) but on the success path, the orchestrator holds `{ status: "success" }` and must deregister before the next operation.

**Impact:** Low — a competent engineer will infer the correct ordering. However, documenting it explicitly prevents a subtle race condition and makes the test cases for the shutdown-commit step unambiguous.

**Resolution:** Add explicit `worktreeRegistry.register(worktreePath, branch)` / `worktreeRegistry.deregister(worktreePath)` call sites to the §5.2 processMessage() algorithm, clearly showing:
1. `register()` called immediately before `guard.invokeWithRetry()`
2. `deregister()` called immediately after receiving any non-`"success"` GuardResult (the guard already cleaned up the worktree internally on those paths)
3. `deregister()` called after successful response posting (or on the GR-R9 partial-commit error path per F-05 below)

---

### F-05 (Low) — GR-R9 partial-commit error path in §5.1 does not specify `WorktreeRegistry.deregister()`

**Location:** §5.1 post-commit response-posting failure section (GR-R9/AT-GR-17 path)

**Description:**
The §5.1 post-commit failure path lists these cleanup steps:
```
3. Post partial-commit error embed to thread
4. Clean up worktree (removeWorktree + deleteBranch).
5. Return from routing loop iteration.
```

Step 4 specifies physical worktree cleanup but does not mention `worktreeRegistry.deregister(worktreePath)`. Since the orchestrator registered the worktree before calling `invokeWithRetry()` (per F-04), it must also deregister on this error path. Without deregistration, the registry will retain a stale entry for a worktree that no longer exists on disk. If a subsequent shutdown fires after this error path, the shutdown-commit step (§5.3 Step 4) would attempt `hasUncommittedChanges()` on a non-existent path.

**Impact:** Low — this is an edge case that only manifests if a GR-R9 error is followed by a rapid shutdown. The TSPEC should be explicit so the engineer does not have to infer the requirement.

**Resolution:** Add `worktreeRegistry.deregister(worktreePath)` as a step in the §5.1 post-commit failure sequence, immediately before or after the physical worktree cleanup in step 4.

---

## Clarification Questions

### Q-01 (Informational) — `reconstructTurnCount` emoji-prefix heuristic may exclude valid agent messages

**Location:** §4.2.2 `ThreadStateManager` behavioural contract

**Description:**
The `isSystemMessage` heuristic excludes "messages starting with `⏸`, `🔒`, `🚨`, `⛔`" from the turn count reconstruction. In normal operation, all Orchestrator-posted system messages come from the bot account and are already excluded by the `isBot === false` check. The emoji-prefix check is a secondary filter — likely intended for cases where a non-bot source posts a system-like message, or as a belt-and-suspenders guard.

The risk is that a legitimate agent message that starts with one of these emojis (e.g., a PM agent beginning its response with `"⛔ Blocked — this approach conflicts with..."`) would be incorrectly excluded from the turn count. This under-counts turns and could allow more invocations than `maxTurnsPerThread` would permit.

**Not blocking approval.** This is an inherent limitation of heuristic-based counting. However, the spec should note this limitation explicitly so the implementer understands the tradeoff and does not attempt to "fix" it by tightening the heuristic in ways that break more common cases.

---

## Positive Observations

1. **Protocol-based dependency injection is rigorously applied.** All three new modules define TypeScript interfaces before concrete implementations. `DefaultInvocationGuard` receives its five dependencies as constructor parameters without any internal instantiation. The composition root wiring in §4.4 is the sole concrete-type construction site.

2. **`GuardResult` discriminated union is the correct API boundary.** The `"success" | "exhausted" | "unrecoverable" | "shutdown"` union forces the orchestrator to handle all four outcomes explicitly at the call site. Silent error swallowing is structurally impossible with this design.

3. **`AbortSignal` for backoff cancellation is idiomatic and testable.** Using the built-in `AbortController`/`AbortSignal` pair avoids custom timer management and is testable with `vi.useFakeTimers()`. The single shared controller at the composition root is the correct single-responsibility design.

4. **Q-03 resolution is backed by codebase evidence.** Confirming that `commitAndMerge()` returns (rather than throws) for `"commit-error"`, `"lock-timeout"`, and `"merge-error"` via direct `artifact-committer.ts` inspection eliminates speculation about the §5.1 algorithm branching. The explicit inline note in Step 3 ("These statuses are RETURNED by commitAndMerge(), not thrown") is exactly the right documentation anchor for the engineer.

5. **Lazy turn-count reconstruction is the correct architectural choice.** Eager reconstruction on startup would require enumerating all Discord threads — an operation with no clean Discord.js API. Lazy reconstruction on first message is simpler, correct, and matches the AT-GR-10 acceptance test semantics.

6. **`malformedSignalCount` per-invocation is the correct GR-R6 implementation.** Resetting the malformed-signal counter per `invokeWithRetry()` call (not per thread) correctly implements GR-R7: each turn gets a fresh retry budget, including a fresh two-strike allowance for malformed signals.

7. **Test doubles are comprehensive and expressive.** `FakeInvocationGuard.results[]` (return in order, last repeats), `FakeThreadStateManager.turnResults` (per-threadId injectable outcomes), `FakeWorktreeRegistry` (pass-through with `deregister()` filter) — all three support rich per-test configuration without state machine complexity. The TE-requested additions (`lastShutdownSignal`, `openThreadIds()`, `addAllCalls`, `commitCalls`) are all present in v1.1.

8. **Error handling table (§6) is exhaustive.** All 17 AT-GR acceptance test scenarios map to table rows. The coverage of non-blocking, clean-exit, and force-exit paths gives the engineer a complete failure taxonomy without gaps.

---

## Requirement Coverage

All 6 Phase 6 requirements are correctly mapped in §8. No requirement is left without a technical component:

| Requirement | TSPEC Components | Coverage |
|-------------|-----------------|---------|
| REQ-SI-07 | `InvocationGuard`, `DefaultInvocationGuard` retry algorithm §5.1 | ✓ |
| REQ-SI-08 | `InvocationGuard` exhaustion path | ✓ |
| REQ-NF-02 | GR-R1 catch-all on orchestrator (failure never propagates) | ✓ |
| REQ-DI-08 | `ThreadStateManager.checkAndIncrementTurn()`, §5.2 Step 2 | ✓ |
| REQ-RP-05 | `ThreadStateManager.checkAndIncrementReviewTurn()`, §5.2 Step 1 | ✓ |
| REQ-SI-10 | `createShutdownHandler`, `ThreadQueue.activeCount()`, `WorktreeRegistry` | ✓ |

---

## FSPEC Alignment Note

TSPEC v1.1 aligns with FSPEC v1.3 in all material behavioral respects. The three outstanding findings from the earlier backend FSPEC review (F-01: review turn increment timing; F-02: shutdown timeout step sequence; F-03: debug embed format) are correctly resolved in the TSPEC:

- **FSPEC F-01** → TSPEC uses atomic `checkAndIncrementReviewTurn()` (§5.2 Step 1a) ✓
- **FSPEC F-02** → TSPEC §5.3 Step 3c explicitly jumps to Step 6 (disconnect) on timeout, skipping Step 5 ✓
- **FSPEC F-03** → TSPEC §5.3 Step 2c posts a plain-text string to `#agent-debug` (not a structured embed) — acceptable for a debug-channel notification ✓

No FSPEC conflicts are present in v1.1.

---

## Recommendation

**Approved with minor changes.** The TSPEC is implementation-ready once F-01 and F-02 are addressed.

**Must resolve before plan creation:**
- F-01: Add `shutdownSignal: AbortSignal` to `OrchestratorDeps` and update composition root wiring
- F-02: Add `getParentThreadId(threadId: string): string | undefined` to `ThreadStateManager` protocol and `FakeThreadStateManager`

**Can resolve during implementation:**
- F-03: Deduplicate `activeCount()` by using a `Set<string>` across both `processing` and `queues` maps
- F-04: Document `register()` / `deregister()` call sites explicitly in §5.2 processMessage() algorithm
- F-05: Add `worktreeRegistry.deregister()` to the GR-R9 partial-commit error cleanup steps

**Informational (no action required):**
- Q-01: Note the emoji-prefix heuristic limitation in the `reconstructTurnCount` contract comment
