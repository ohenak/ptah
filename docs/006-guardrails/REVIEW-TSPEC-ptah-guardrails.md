# TSPEC Review: Phase 6 — Guardrails

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document Reviewed** | `docs/006-guardrails/006-TSPEC-ptah-guardrails.md` v1.0 |
| **Reference Documents** | `006-FSPEC-ptah-guardrails.md` v1.2, `006-REQ-PTAH-guardrails.md` v1.0 |
| **Date** | March 13, 2026 |
| **Recommendation** | **Conditional approval** — M-01 must be resolved before plan/implementation begins; M-02 and M-03 should be resolved for clarity |

---

## 1. Summary

The TSPEC is well-structured and technically sound overall. Three new modules (`InvocationGuard`, `ThreadStateManager`, `WorktreeRegistry`) are cleanly defined with protocol-based injection. The retry algorithm and turn-limit integration logic are correct in substance. The test strategy appropriately uses `vi.useFakeTimers()` for backoff delay control, and the test doubles are non-trivial fakes that implement the full protocol.

**Four findings** require resolution:
- **M-01 (High):** A direct behavioral mismatch — the TSPEC specifies no error embed when shutdown cancels a backoff wait, but FSPEC AT-GR-16 explicitly requires an error embed in this case.
- **M-02 (Medium):** The retry algorithm (§5.1) handles `CommitResult.mergeStatus === "conflict"` but does not handle `"commit-error"` or `"lock-timeout"` — both of which the error handling table (§6) classifies as transient. If `commitAndMerge()` returns these as result values rather than throwing, the algorithm silently treats them as success.
- **M-03 (Medium):** All GR-R rule references in the TSPEC are off by one or two from the FSPEC v1.2 numbering. The logic is correct but the references are wrong — a systematic issue caused by the FSPEC being renumbered in v1.2 after the TSPEC was drafted.
- **M-04 (Medium):** `debugChannelId` injection is specified three different ways within the TSPEC itself (Q-02 decision text, §4.3 constructor param, §4.4 null-at-construction). The engineer will need to pick one approach, but it should be the same one throughout the spec.

**Three open questions** require engineer or PM resolution before implementation.

---

## 2. Positive Observations

1. **Protocol-based design is excellent for testability.** `InvocationGuard`, `ThreadStateManager`, and `WorktreeRegistry` are all defined as TypeScript interfaces with concrete fakes. Every behavioral interaction is injectable, making unit tests deterministic without requiring real Discord, Git, or clock APIs.

2. **`AbortController` / `AbortSignal` for backoff cancellation is the right choice.** Using the built-in `AbortSignal` to cancel retry backoff delays is idiomatic Node.js and avoids custom timer management. The single shared `AbortController` at the composition root that is `abort()`'d on shutdown and passed to all invocations is a clean design.

3. **`GuardResult` discriminated union is clean.** The `{ status: "success" | "exhausted" | "unrecoverable" | "shutdown" }` union forces the orchestrator to handle all outcomes explicitly. No silent error swallowing is possible at the call site.

4. **`FakeInvocationGuard` design is correct.** The `results: GuardResult[]` pattern (return in order; last result repeats) is a clean way to script per-test sequences without state machine complexity.

5. **`FakeThreadStateManager` is sufficiently expressive.** The `turnResults` and `reviewTurnResults` maps allow per-threadId outcome injection, which is the right granularity for orchestrator integration tests.

6. **Lazy turn-count reconstruction is the correct decision.** Q-01's decision (lazy: reconstruct on first message after restart) correctly satisfies AT-GR-10 semantics without requiring a bulk Discord history fetch on startup. The `processMessage()` integration point is the right place for this check.

7. **GR-R6 two-strike rule implementation is correct.** The `malformedSignalCount` counter tracked per `invokeWithRetry()` call correctly implements the "retry once for malformed signal, unrecoverable on second" rule. The counter resets per invocation (per GR-R7).

8. **Error handling table (§6) is the most complete of any Phase so far.** All 17 acceptance test scenarios map to specific table rows. The table includes non-blocking, clean-exit, and force-exit paths — covering the full failure taxonomy.

9. **Shutdown sequence aligns with FSPEC §5.2.** Steps 1–7 of the TSPEC shutdown algorithm match the FSPEC behavioral flow, including the 5-second Discord disconnect timeout, the `[ptah] System: shutdown commit` message, and the exit code convention (0 = clean, 1 = force-exit).

---

## 3. Specification–Implementation Mismatches

### M-01 (High) — Shutdown-aborted backoff: TSPEC says no error embed; FSPEC AT-GR-16 requires one

**FSPEC reference:** FSPEC-GR-01 §3.4 edge cases (second row), AT-GR-16

**Expected behavior (FSPEC AT-GR-16):**
```
GIVEN: A Skill invocation failed on attempt 1 and the Orchestrator is waiting
       4 seconds before retry 2
WHEN:  I send SIGINT
THEN:  ...
       4. A red "⛔ Agent Error" embed IS posted to the thread
          (the first attempt's failure is treated as the final result)
       5. The worktree is cleaned up
```

**Actual behavior (TSPEC §4.2.1 GuardResult comment):**
> `{ status: "shutdown" }` — aborted mid-backoff; **no embed posted**

**TSPEC §5.1 (retry algorithm):**
> "If `shutdownSignal` fires during a backoff delay: returns `{ status: 'shutdown' }` without posting an error embed"

**TSPEC §5.3 (shutdown sequence):**
> "The orchestrator receives this result, deregisters the worktree from the registry, and exits the routing loop **without posting an error embed**."

The TSPEC made an explicit counter-decision: when shutdown cancels a backoff wait, no error embed is posted because the system is already shutting down (a courtesy shutdown embed was already posted to `#agent-debug`). This is a reasonable engineering position, but it directly contradicts the approved FSPEC acceptance test.

**Impact:** The Discord thread will show no response and no error context after a mid-backoff shutdown. Users reviewing the thread after an Orchestrator restart will not know whether the agent failed or was interrupted. AT-GR-16 is a required test case per the FSPEC; any test written from the FSPEC will fail against the TSPEC implementation.

**Resolution needed (Q-01):** See §6.

---

### M-02 (Medium) — CommitResult transient statuses not handled in retry algorithm

**FSPEC reference:** FSPEC-GR-01 §3.4 edge cases (third row), FSPEC §3.2 Step 2a

**TSPEC §6 Error Handling table:**
```
| CommitResult.mergeStatus === "commit-error"   | Transient | Retry the full invocation + commit |
| CommitResult.mergeStatus === "lock-timeout"   | Transient | Retry the full invocation + commit |
```

**TSPEC §5.1 algorithm Step 3:**
```
3. Commit artifacts:
   commitResult = await artifactCommitter.commitAndMerge(...)
   If commitResult.mergeStatus === "conflict":
     category = "unrecoverable" → skip to EXHAUSTION
```

After Step 3, if `mergeStatus` is `"commit-error"` or `"lock-timeout"`, the algorithm falls through to Step 4 (SUCCESS) — not to EXHAUSTION or the retry path. The algorithm only handles `"conflict"` as a returned-status failure. The `"commit-error"` and `"lock-timeout"` cases are classified as transient in the error table but have no code path to trigger a retry.

**Possible explanations:**
- `commitAndMerge()` throws an exception for `"commit-error"` and `"lock-timeout"` (not returns them as statuses). In this case, Step 5's exception classifier would catch them as `InvocationError` (transient) and the algorithm would work correctly.
- `commitAndMerge()` returns them as `CommitResult.mergeStatus` values. In this case, the algorithm has a gap.

**Resolution needed (Q-02):** See §6. If `commitAndMerge()` returns these statuses, Step 3 of the algorithm must be extended to check them.

---

### M-03 (Medium) — GR-R numbering references are systematically off from FSPEC v1.2

**Root cause:** The FSPEC was renumbered in v1.2 (PM TSPEC cross-review corrections): §4.5 rules renumbered GR-R10–GR-R15; §5.3 shutdown rules renumbered GR-R16–GR-R23. The TSPEC v1.0 was drafted against FSPEC v1.1 numbering.

**Affected TSPEC locations:**

| TSPEC Location | TSPEC References | FSPEC v1.2 Correct Reference | Rule Content |
|----------------|-----------------|------------------------------|--------------|
| §5.2 "silently return (GR-R10)" | GR-R10 | **GR-R11** | CLOSED/STALLED threads silently drop messages |
| §6 Error table "Silently drop message (GR-R10)" ×2 | GR-R10 | **GR-R11** | Same as above |
| §7.3 "GR-R10 (silent drop)" | GR-R10 | **GR-R11** | Same as above |
| §7.3 "GR-R11 (review limit checked first)" | GR-R11 | **GR-R12** | Review 4-turn limit checked before general limit |
| §5.3 shutdown Step 1 "(GR-R20)" | GR-R20 | **GR-R21** | Second SIGINT force-exits immediately |
| §5.3 shutdown Step 2c "(GR-R21)" | GR-R21 | **GR-R22** | `#agent-debug` embed is best-effort only |

**Impact:** The logic is correct — the wrong rule number is cited but the behavior matches the right rule. However, an engineer who looks up GR-R10 in the FSPEC while implementing will find "turn counts reconstructed on restart" (not the silent-drop rule), causing confusion during implementation and test writing.

**Resolution:** Update all six locations with correct GR-R numbers from FSPEC v1.2.

---

### M-04 (Medium) — `debugChannelId` injection approach is internally inconsistent

**Affected locations within the TSPEC:**

| Section | Approach described |
|---------|-------------------|
| §10 Q-02 Decision | "Store on orchestrator; pass to guard at invocation time **via `InvocationGuardParams`**" |
| §4.2.1 `InvocationGuardParams` interface | `debugChannelId` is **NOT present** in the interface |
| §4.3 `DefaultInvocationGuard` | "Constructor params: ... **+ debugChannelId: string \| null**" |
| §4.4 Composition root | `null, // debugChannelId — resolved in orchestrator.startup() and injected post-construction` |
| §9.5 | Describes three options: setter method, `OrchestratorDeps` constructor, or "store on orchestrator" |

Q-02's decision text says one thing; the concrete implementation sections say another. An engineer reading all four sections will encounter three different injection patterns:
1. Via `InvocationGuardParams` (Q-02 decision text — but not in the interface)
2. Via constructor + null-at-boot (§4.3, §4.4)
3. Via post-construction setter (§9.5 option)

**Resolution (Q-03):** The TSPEC should pick one approach and be consistent. Given the Q-02 decision's stated rationale ("avoids mutable state on the guard"), the `InvocationGuardParams` approach is preferable — but `InvocationGuardParams` must then include `debugChannelId: string | null`. Alternatively, if constructor injection is chosen, Q-02 decision text must be updated.

---

## 4. Untested Properties

| # | Property | Expected Test Level | Gap Description | Risk |
|---|----------|-------------------|-----------------|------|
| UP-01 | When shutdown cancels a backoff wait (AT-GR-16), the error embed IS posted to the thread | Unit (InvocationGuard) | TSPEC specifies `{ status: "shutdown" }` with NO embed; no test for the "error embed on shutdown abort" path. This test will fail per FSPEC even if written. Blocked on M-01 resolution. | High |
| UP-02 | `CommitResult.mergeStatus === "commit-error"` triggers a retry (transient path) | Unit (InvocationGuard) | Listed in error table as transient but not in the algorithm. No test case mentioned for this path. | Medium |
| UP-03 | `CommitResult.mergeStatus === "lock-timeout"` triggers a retry (transient path) | Unit (InvocationGuard) | Same as UP-02. | Medium |
| UP-04 | `maxTurnsPerThread < 5` at startup logs a warning | Unit (config validation) | Mentioned in §9.4 as a startup validation, but not listed in any test file's scope. | Low |
| UP-05 | `WorktreeRegistry` is the authoritative source for shutdown commit step — filesystem is NOT scanned | Unit (Shutdown) | GR-R23 (FSPEC) specifies this constraint. TSPEC §5.3 Step 4 uses `worktreeRegistry.getAll()` (correct), but no explicit test verifies that `git worktree list` is never called during shutdown. | Low |
| UP-06 | `InvocationGuardParams.debugChannelId` (if passed via params) is propagated correctly from orchestrator to guard | Integration (Orchestrator) | Depends on M-04 resolution. If the guard receives `debugChannelId` via params, orchestrator tests must verify it is populated from `startup()` resolve. | Low |

---

## 5. Test Double Review

### `FakeInvocationGuard`
✓ Correct protocol implementation. The `results[]` array pattern is clean and expressive.
✓ `callCount` and `lastParams` enable post-invocation assertions.

Minor: The fake should also capture the `shutdownSignal` from `lastParams` to enable tests that verify the signal is correctly passed through from the orchestrator's shutdown handler.

### `FakeThreadStateManager`
✓ `turnResults` and `reviewTurnResults` maps provide per-threadId injectable outcomes.
✓ `reviewThreadIds` set correctly models the `isReviewThread()` lookup.

Minor: The fake should implement `openThreadIds()` — it is listed in the protocol but not shown in the fake definition. If orchestrator tests use `openThreadIds()` for monitoring assertions, this must be present.

### `FakeWorktreeRegistry`
✓ Clean pass-through implementation.
✓ `deregister()` filter correctly removes the worktree by path.
✓ `getAll()` returns `ReadonlyArray` — correct for snapshot semantics.

### `FakeDiscordClient` extensions
✓ `debugChannelMessages: string[]` field for capturing `#agent-debug` posts is the right approach.

Minor: The field name should be `debugChannelMessages` and must be verified distinct from existing `postChannelMessageCalls` (if that already exists in the current fake) to avoid confusion between debug-channel posts and other channel posts.

### `FakeGitClient` extensions
✓ `hasUncommittedChangesResult` and `resetHardCalls` are the right injectable fields.

Missing: `addAllCalls: string[]` and `commitCalls: string[]` should also be added to verify the shutdown commit step (Step 4: `git add -A` and `git commit`) is called with the correct worktree paths.

---

## 6. Open Questions

### Q-01 (Blocks M-01) — Should an error embed be posted when shutdown cancels a mid-backoff retry?

The FSPEC AT-GR-16 says YES. The TSPEC says NO. Both positions have merit:

- **FSPEC position (error embed):** The agent's task failed; the Discord thread has no response. An error embed explains the gap and tells users "this failed due to a shutdown, not a bug."
- **TSPEC position (no embed):** The system is shutting down; the `#agent-debug` shutdown notification already signals the system state. Posting an error embed in the thread could mislead users into thinking the agent failed when it was interrupted.

**Resolution required from PM:** Which behavior is authoritative? If the error embed is required (FSPEC), the TSPEC must be updated: `InvocationGuard` must post the error embed before returning `{ status: "shutdown" }` (or the orchestrator must post it upon receiving `{ status: "shutdown" }`). If no embed (TSPEC), AT-GR-16 must be updated.

---

### Q-02 (Blocks M-02 resolution) — Does `commitAndMerge()` throw or return for `"commit-error"` / `"lock-timeout"`?

> Does `ArtifactCommitter.commitAndMerge()` throw an exception for `"commit-error"` and `"lock-timeout"` commit outcomes, or does it return a `CommitResult` with those status values?

- **If throws:** The §5.1 algorithm's exception classifier (Step 5) catches them as `InvocationError` (transient) → correct behavior, no algorithm change needed.
- **If returns:** Step 3 of the algorithm must be extended to check these status values and route them to the retry path.

**Resolution required from backend engineer** (who owns Phase 4 FSPEC-AC-01 semantics).

---

### Q-03 (Blocks M-04 resolution) — Which `debugChannelId` injection pattern is the final decision?

Three options described in the TSPEC:

| Option | Pros | Cons |
|--------|------|------|
| A: Via `InvocationGuardParams` at invocation time | No mutable guard state; aligns with Q-02 decision text; testable via params assertions | Requires adding `debugChannelId` to `InvocationGuardParams` interface |
| B: Constructor param + null at boot | Simpler to wire at composition root | Guard has a null field until `startup()` runs; mutable dependency |
| C: Post-construction setter | Mirrors how `startup()` sets other state | Setter is mutable state; harder to fake in tests |

**Option A** is recommended (aligns with stated Q-02 rationale and is most testable). **Resolution required from backend engineer** to confirm, then update TSPEC for consistency.

---

## 7. Execution Plan Observations

No execution plan has been shared for review. These findings should be incorporated before plan creation:

1. **M-01 resolution first:** The `InvocationGuard` module's behavior on shutdown-aborted backoff must be settled before the plan assigns test files to that module.
2. **M-02 resolution:** If `commitAndMerge()` returns (not throws) for transient commit failures, the plan should add a task to extend Step 3 of the algorithm.
3. **M-03:** GR-R numbering fixes are editorial and can be in the first plan task (TSPEC update) rather than a separate implementation task.
4. **M-04:** `debugChannelId` injection approach must be finalized before the composition root wiring task.

---

## 8. Requirement Coverage

All 6 Phase 6 requirements are addressed by the TSPEC:

| Requirement | TSPEC Components | Status |
|-------------|-----------------|--------|
| REQ-SI-07 | `InvocationGuard`, `DefaultInvocationGuard` retry algorithm §5.1 | ✓ Covered |
| REQ-SI-08 | `InvocationGuard` exhaustion path (EXHAUSTION block) | ✓ Covered |
| REQ-NF-02 | `DefaultOrchestrator` GR-R1 catch-all (failure isolated per invocation) | ✓ Covered |
| REQ-DI-08 | `ThreadStateManager.checkAndIncrementTurn()`, orchestrator §5.2 Step 2 | ✓ Covered |
| REQ-RP-05 | `ThreadStateManager.checkAndIncrementReviewTurn()`, orchestrator §5.2 Step 1 | ✓ Covered |
| REQ-SI-10 | `createShutdownHandler` §5.3, `ThreadQueue.activeCount()`, `WorktreeRegistry` | ✓ Covered |

No requirements are unaddressed.

---

## 9. Recommendation

**Conditional approval.** The TSPEC is structurally sound and technically coherent. The module boundaries, protocol definitions, algorithm logic (excluding M-01 and M-02 gaps), and test strategy are all implementation-ready.

**Must resolve before plan creation:**
- M-01: Align TSPEC with FSPEC on error embed behavior for shutdown-aborted backoff (Q-01)
- M-02: Clarify `commitAndMerge()` throw vs. return semantics; extend §5.1 algorithm if needed (Q-02)
- M-04: Pick one `debugChannelId` injection approach and apply it consistently throughout the TSPEC (Q-03)

**Should resolve before plan creation (editorial):**
- M-03: Update GR-R rule references throughout TSPEC to match FSPEC v1.2 numbering

**May defer to implementation:**
- UP-04: `maxTurnsPerThread < 5` startup warning test
- UP-05: WorktreeRegistry exclusivity (no filesystem scan) test
- Missing `FakeGitClient` fields (`addAllCalls`, `commitCalls`) — add to factories when the shutdown task is implemented

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Test Engineer | Initial TSPEC review — 4 mismatches, 6 untested properties, 3 open questions |

---

*End of Document*
