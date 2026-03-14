# Cross-Review: Product Manager → TSPEC-PTAH-PHASE6

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/006-guardrails/006-TSPEC-ptah-guardrails.md` v1.1 |
| **Reference Documents** | `006-FSPEC-ptah-guardrails.md` v1.3, `006-REQ-PTAH-guardrails.md` v1.0 |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved** — all product-perspective findings resolved; TSPEC faithfully implements all FSPEC behavioral constraints |

---

## Positive Observations

1. **All 6 Phase 6 requirements are addressed.** The requirement→component mapping (§8) is complete and correct. `InvocationGuard`, `ThreadStateManager`, `WorktreeRegistry`, `createShutdownHandler`, and orchestrator changes together cover REQ-SI-07, REQ-SI-08, REQ-NF-02, REQ-DI-08, REQ-RP-05, and REQ-SI-10 with no gaps.

2. **FSPEC behavioral clusters map cleanly to modules.** The three FSPEC sections (FSPEC-GR-01 retry/failure, FSPEC-GR-02 turn-limit, FSPEC-GR-03 shutdown) map to `DefaultInvocationGuard`, `InMemoryThreadStateManager`, and the `createShutdownHandler` rewrite respectively. The module boundaries respect the product-level boundaries.

3. **Business rules are implemented, not reinterpreted.** GR-R1 through GR-R23 (FSPEC v1.3 numbering) are faithfully applied: GR-R1 catch-all isolation, GR-R6 two-strike rule, GR-R7 per-invocation retry budget reset, GR-R9 partial-commit embed, GR-R11 silent drop for CLOSED/STALLED threads, GR-R12 review-limit-first ordering, GR-R15 fixed-4 review limit, GR-R17 in-flight completion during shutdown, GR-R21 double-SIGINT force-exit, GR-R23 registry-not-filesystem for worktree enumeration.

4. **Turn-limit semantics match AT-GR-06.** The `checkAndIncrementTurn()` interface — check `turn_count >= maxTurns` *before* incrementing — correctly implements the `maxTurnsPerThread = 10` → 10 invocations proceed, blocked on the 11th convention established in FSPEC v1.1.

5. **Shutdown error embed on backoff-abort is specified correctly.** Following the TE TSPEC review (M-01 resolution), TSPEC v1.1 §5.1 Step 7 now posts the error embed before returning `{ status: "shutdown" }`, matching FSPEC AT-GR-16 exactly.

6. **Review-thread limit is correctly hardcoded at 4 and non-parameterised.** `checkAndIncrementReviewTurn()` has no `maxTurns` parameter. GR-R15 (fixed product rule, not configurable) is correctly implemented as a hardcoded constant in the protocol definition.

7. **Post-commit response-posting failure (GR-R9) is handled in `orchestrator.ts`, not in `InvocationGuard`.** This is architecturally correct — the FSPEC delegates this path to the orchestrator (§3.4 edge case, §3.3 GR-R9), and the TSPEC correctly places the logic in `orchestrator.ts` after `guard.invokeWithRetry()` returns `{ status: "success" }`. The partial-commit embed body matches the GR-R9 specification verbatim.

8. **Config schema additions are correctly specified.** The two new `ptah.config.json` keys (`retry_base_delay_ms` and `retry_max_delay_ms`) and the newly exposed `shutdown_timeout_ms` use the correct snake_case naming convention matching the existing schema. (A camelCase inconsistency in an earlier draft was identified and corrected before approval.)

9. **`WorktreeRegistry` is used (not filesystem scan) for shutdown commit.** §5.3 Step 4 uses `worktreeRegistry.getAll()` — matching GR-R23 which requires registry-based enumeration. No `git worktree list` invocation.

10. **`debugChannelId` injection is consistently applied via `InvocationGuardParams`.** After M-04 resolution in TSPEC v1.1, `InvocationGuardParams` includes `debugChannelId: string | null`, the guard constructor holds no debug channel ID, and §9.5 confirms the guard reads from params directly. This is the correct implementation of GR-R8 (log every retry and exhaustion event to `#agent-debug`) without introducing mutable guard state.

---

## Findings

### F-01 (High) — [Resolved before this review] GR-R numbering conflict

**In TSPEC v1.0:** GR-R references throughout the TSPEC were off by 1–2 positions from the authoritative FSPEC v1.2 numbering. Specifically: TSPEC's "GR-R10" mapped to FSPEC's "GR-R11" (silent drop rule), "GR-R11" mapped to "GR-R12" (review limit checked first), "GR-R20"→"GR-R21" (double-SIGINT), "GR-R21"→"GR-R22" (best-effort debug embed).

**Resolution:** FSPEC was renumbered definitively in v1.2 (GR-R1–GR-R23). TSPEC v1.1 updated all 6 affected locations to match. **Verified resolved.**

### F-02 (Low) — [Resolved before this review] Config key naming convention

**In TSPEC v1.0 draft:** Config key references used inconsistent casing in some sections. The authoritative `ptah.config.json` schema uses snake_case throughout.

**Resolution:** FSPEC §2.4 configuration table updated to snake_case in v1.2 (`retry_base_delay_ms`, `retry_max_delay_ms`, `shutdown_timeout_ms`). TSPEC §9.4 matches. **Verified resolved.**

---

## Clarification Questions

None. All product decisions are reflected correctly in the TSPEC. The three open questions from the TE TSPEC review (Q-01 through Q-03) have all been resolved in TSPEC v1.1 and the resolutions align with the FSPEC.

---

## Requirement Coverage Verification

| Requirement | FSPEC Coverage | TSPEC Components | Product Intent Preserved? |
|-------------|---------------|-----------------|--------------------------|
| REQ-SI-07 | FSPEC-GR-01 — retry algorithm | `DefaultInvocationGuard.invokeWithRetry()` §5.1 | ✓ Yes |
| REQ-SI-08 | FSPEC-GR-01 — exhaustion path | `InvocationGuard` EXHAUSTION block (§5.1) | ✓ Yes |
| REQ-NF-02 | FSPEC-GR-01 — GR-R1 isolation | `DefaultOrchestrator` never re-throws; GR-R1 catch-all | ✓ Yes |
| REQ-DI-08 | FSPEC-GR-02 — general turn limit | `ThreadStateManager.checkAndIncrementTurn()` + orchestrator §5.2 | ✓ Yes |
| REQ-RP-05 | FSPEC-GR-02 — review-thread 4-turn limit | `ThreadStateManager.checkAndIncrementReviewTurn()` + orchestrator §5.2 | ✓ Yes |
| REQ-SI-10 | FSPEC-GR-03 — graceful shutdown | `createShutdownHandler` rewrite + `ThreadQueue.activeCount()` + `WorktreeRegistry` | ✓ Yes |

---

## Acceptance Test Traceability

All 17 FSPEC acceptance tests are verifiable against the TSPEC implementation:

| AT | Scenario | TSPEC Implementation Section | Covered in Tests? |
|----|----------|------------------------------|-------------------|
| AT-GR-01 | Successful retry after transient failure | §5.1 LOOP + SUCCESS path | `invocation-guard.test.ts` |
| AT-GR-02 | All retries exhausted — error embed posted | §5.1 EXHAUSTION block | `invocation-guard.test.ts` |
| AT-GR-03 | Exponential backoff delays correct | §5.1 Step 7 delay formula | `invocation-guard.test.ts` (fake timers) |
| AT-GR-04 | Unrecoverable failure — no retry | §5.1 Step 5 (auth error classifier) | `invocation-guard.test.ts` |
| AT-GR-05 | Two consecutive malformed signals — unrecoverable | §5.1 `malformedSignalCount` logic | `invocation-guard.test.ts` |
| AT-GR-06 | General max-turns limit fires after 10th | `checkAndIncrementTurn()` pre-increment check | `thread-state-manager.test.ts` |
| AT-GR-07 | Subsequent messages after CLOSED silently dropped | `getStatus()` check → "limit-reached" | `thread-state-manager.test.ts` |
| AT-GR-08 | Review thread stalls at fifth turn | `checkAndIncrementReviewTurn()` >= 4 check | `thread-state-manager.test.ts` |
| AT-GR-09 | ROUTE_TO_DONE on Turn 4 — normal resolution | §5.2 review-limit check before general limit | `guardrails.test.ts` (integration) |
| AT-GR-10 | Orchestrator restart — turn counts reconstructed | `reconstructTurnCount()` + lazy reconstruction in §5.2 | `thread-state-manager.test.ts` |
| AT-GR-11 | Clean shutdown with no in-flight invocations | §5.3 Steps 1–7, `activeCount()` = 0 fast path | `shutdown.test.ts` |
| AT-GR-12 | Shutdown waits for in-flight invocation | §5.3 Step 3 wait loop | `shutdown.test.ts` |
| AT-GR-13 | Shutdown timeout — force exit | §5.3 Step 3c timeout path, exit code 1 | `shutdown.test.ts` |
| AT-GR-14 | Second SIGINT — immediate force exit | §5.3 Step 1 `shuttingDown` guard | `shutdown.test.ts` |
| AT-GR-15 | Pending Git changes committed on shutdown | §5.3 Step 4 `worktreeRegistry.getAll()` loop | `shutdown.test.ts` |
| AT-GR-16 | SIGINT cancels backoff wait — error embed posted | §5.1 Step 7 `shutdownSignal` abort path | `invocation-guard.test.ts` |
| AT-GR-17 | Post-commit response embed fails — partial-commit embed | `orchestrator.ts` GR-R9 path (§5.1 post-success section) | `orchestrator.test.ts` |

---

## Summary

The TSPEC v1.1 is a faithful, complete, and testable implementation of the Phase 6 FSPEC. All 6 requirements are covered, all 17 acceptance tests are implementable from the TSPEC, all 23 FSPEC business rules are reflected in the algorithm, protocol definitions, and module contracts.

No product-level decisions were made unilaterally by engineering. The two cross-review findings (GR-R numbering and config key naming) were editorial corrections that improved traceability without changing any behavioral intent.

**Recommendation: Approved.** The TSPEC is ready for execution planning.

---

*End of Document*
