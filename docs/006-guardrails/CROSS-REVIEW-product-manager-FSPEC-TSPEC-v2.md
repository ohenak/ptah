# Cross-Review: Product Manager → FSPEC-PTAH-PHASE6 (v1.3) + TSPEC-PTAH-PHASE6 (v1.1)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Documents Reviewed** | `006-FSPEC-ptah-guardrails.md` v1.3 · `006-TSPEC-ptah-guardrails.md` v1.1 |
| **Reference Documents** | `006-REQ-PTAH-guardrails.md` v1.0, `CROSS-REVIEW-backend-engineer-TSPEC.md`, `CROSS-REVIEW-test-engineer-FSPEC.md` |
| **Date** | March 13, 2026 |
| **Recommendation** | **FSPEC: Approved (no changes needed).** **TSPEC: Approved with minor changes — engineering must produce v1.2 addressing BE F-01 and F-02 before planning begins.** |

---

## 1. FSPEC v1.3 Review — Confirmed Approved

The FSPEC at v1.3 remains fully approved from a product perspective. No new findings. This section documents a fresh confirmation pass against all six Phase 6 requirements.

### 1.1 Requirement Coverage (Confirmed)

| Requirement | FSPEC Coverage | Product Intent Clear? |
|-------------|---------------|-----------------------|
| REQ-SI-07 | FSPEC-GR-01 — retry with exponential backoff | ✓ |
| REQ-SI-08 | FSPEC-GR-01 — exhaustion path → error embed, continue running | ✓ |
| REQ-NF-02 | FSPEC-GR-01 — GR-R1 isolation catch-all | ✓ |
| REQ-DI-08 | FSPEC-GR-02 — general turn limit + close embed | ✓ |
| REQ-RP-05 | FSPEC-GR-02 — review-thread 4-turn limit + stall embed | ✓ |
| REQ-SI-10 | FSPEC-GR-03 — graceful shutdown sequence | ✓ |

### 1.2 TE Review Findings — All Resolved in v1.3

The TE review of FSPEC v1.0 raised three findings. Verification against v1.3:

- **TE F-01 (High): Turn-limit semantics contradiction** — Resolved in v1.1. §4.3 behavioral flow and AT-GR-06/AT-GR-07 now consistently implement Option A: `maxTurnsPerThread = 10` means 10 invocations proceed; blocked on the 11th. `checkAndIncrementTurn()` checks `turn_count >= maxTurnsPerThread` after increment. ✓
- **TE F-02 (Medium): No AT for retry-in-backoff at shutdown** — Resolved in v1.2. AT-GR-16 added: shutdown during backoff wait cancels the delay and posts the error embed treating the last failure as final. ✓
- **TE F-03 (Low): Partial-commit edge case untestable** — Resolved in v1.2. GR-R9 added specifying the partial-commit embed body verbatim. AT-GR-17 added. ✓

### 1.3 Business Rules Completeness (Confirmed)

All 23 business rules (GR-R1 through GR-R23) remain correctly specified in v1.3. No gaps, no ambiguities, no product decisions left to engineering. The rules are testable and unambiguous.

**Particularly important product rules confirmed correct:**
- **GR-R6** (two-strike rule for malformed signals): scoped per invocation, not per thread ✓
- **GR-R7** (retry budget reset per turn): each routing event starts fresh ✓
- **GR-R11** (silent drop for CLOSED/STALLED threads): no second embed on repeat messages ✓
- **GR-R12** (review-limit checked before general turn limit): review threads get both checks; review limit takes priority ✓
- **GR-R15** (review limit fixed at 4): hardcoded, not configurable — product intent preserved ✓
- **GR-R17** (in-flight invocation completes before shutdown): correct graceful degradation guarantee ✓
- **GR-R23** (registry, not filesystem scan, for worktree enumeration): avoids `git worktree list` parsing ✓

### 1.4 Acceptance Tests Coverage (Confirmed)

AT-GR-01 through AT-GR-17 are all well-specified in WHO/GIVEN/WHEN/THEN format. All edge cases from §5.4 are covered by at least one acceptance test. No orphaned tests, no uncovered flows.

---

## 2. TSPEC v1.1 Review — Product Perspective

### 2.1 Summary

From a product perspective, TSPEC v1.1 faithfully implements all FSPEC behavioral requirements. The prior PM cross-review approval (March 13, 2026) stands. This review assesses the TSPEC in light of the Backend Engineer's cross-review findings (F-01 through F-05) and determines which have product-level implications.

### 2.2 BE Cross-Review Findings — Product Assessment

The Backend Engineer reviewed TSPEC v1.1 and found five findings. PM assessment of each:

#### BE F-01 (Medium) — `shutdownSignal: AbortSignal` missing from `OrchestratorDeps`

**Product impact: None.** This is a technical wiring omission. The behavior it enables (backoff cancellation on shutdown) is correctly specified in FSPEC-GR-03 and FSPEC §5.4, and the TSPEC §5.3 shutdown algorithm correctly describes the flow. The missing field is an engineering-level specification gap only.

**PM action: None.** Engineering must add this field to TSPEC §4.4 to produce v1.2. No FSPEC change needed.

---

#### BE F-02 (Medium) — `ThreadStateManager` protocol missing `getParentThreadId()` — breaks FSPEC-specified stall log content

**Product impact: Medium.** This finding has a product-level dimension. FSPEC §4.4 Step 3b explicitly specifies the `#agent-debug` stall log message as:

```
"[ptah] Review thread {threadName} ({threadId}) STALLED after 4 turns —
 no ROUTE_TO_DONE received. Thread halted. Parent thread: {parentThreadId}"
```

The `Parent thread: {parentThreadId}` component is FSPEC-specified behavior (REQ-DI-08 acceptance criteria: "log to #agent-debug"). Without `getParentThreadId()` on the protocol, engineers cannot access this value from `ThreadStateManager` without inventing an unspecified retrieval mechanism. Any implementation that omits `{parentThreadId}` from the log message deviates from the FSPEC.

**PM action: None to FSPEC** — the FSPEC specification is correct and should not change. Engineering must add `getParentThreadId(threadId: string): string | undefined` to the `ThreadStateManager` protocol in TSPEC §4.2.2 and update `FakeThreadStateManager` accordingly. This is the BE's specified resolution and it is correct.

**Confirmed product requirement:** The stall log message MUST include the parent thread ID as specified. This is a P1 diagnostic requirement — developers need the parent thread reference to trace review thread issues.

---

#### BE F-03 (Low) — `activeCount()` double-counts threads with both processing and queued tasks

**Product impact: None.** The shutdown correctness (waiting until all work completes) is unaffected. Only log accuracy during shutdown diagnostics is degraded. Not a product-level concern.

**PM action: None.** Engineering to resolve during implementation.

---

#### BE F-04 (Low) — Worktree registration timing implicit in §5.2

**Product impact: None.** Technical sequencing detail. The product behavior (no uncommitted changes lost at shutdown) is correctly specified in GR-R23 and FSPEC-GR-03 Step 4. The *when* of `register()`/`deregister()` calls is an implementation concern.

**PM action: None.** Engineering to document in TSPEC §5.2 during v1.2 update.

---

#### BE F-05 (Low) — GR-R9 partial-commit error path missing `WorktreeRegistry.deregister()`

**Product impact: None.** The partial-commit path behavior (error embed + developer investigation) is correctly specified. The stale registry entry is an implementation edge case.

**PM action: None.** Engineering to resolve during implementation.

---

### 2.3 BE Q-01 — `reconstructTurnCount` emoji-prefix heuristic

**Product assessment:** The BE notes that the emoji-prefix heuristic (`⏸`, `🔒`, `🚨`, `⛔`) used to detect Orchestrator system messages could incorrectly exclude a legitimate agent response that starts with one of these emojis. This is a valid product concern but an acceptable tradeoff:

- The primary filter (`isBot === false`) handles the common case correctly.
- The emoji prefix is a belt-and-suspenders guard for edge cases.
- The risk of a false positive (agent message excluded from turn count) would allow one extra turn beyond `maxTurnsPerThread`. This is a mild, self-correcting over-permissiveness.

**PM decision:** Accept the heuristic as specified. Add a comment in the `ThreadStateManager` behavioral contract noting this limitation. No FSPEC change required.

---

### 2.4 Requirement → Implementation Alignment (Re-confirmed)

| Requirement | FSPEC | TSPEC Components | Product Intent Preserved? |
|-------------|-------|-----------------|--------------------------|
| REQ-SI-07 | FSPEC-GR-01 | `DefaultInvocationGuard.invokeWithRetry()` §5.1 | ✓ |
| REQ-SI-08 | FSPEC-GR-01 exhaustion | EXHAUSTION block in §5.1 | ✓ |
| REQ-NF-02 | FSPEC-GR-01 GR-R1 | GR-R1 catch-all; orchestrator never re-throws | ✓ |
| REQ-DI-08 | FSPEC-GR-02 general limit | `checkAndIncrementTurn()` + §5.2 Step 2 | ✓ (pending BE F-01/F-02 in v1.2) |
| REQ-RP-05 | FSPEC-GR-02 review limit | `checkAndIncrementReviewTurn()` + §5.2 Step 1 | ✓ (pending BE F-02 in v1.2) |
| REQ-SI-10 | FSPEC-GR-03 shutdown | `createShutdownHandler` + `ThreadQueue.activeCount()` + `WorktreeRegistry` | ✓ (pending BE F-01 in v1.2) |

### 2.5 Acceptance Test Traceability (Re-confirmed)

All 17 FSPEC acceptance tests (AT-GR-01 through AT-GR-17) remain implementable from TSPEC v1.1. BE F-01/F-02 do not invalidate any existing test — they add missing plumbing that the tests implicitly require.

---

## 3. Path to Planning

**Current blocking items (must resolve before plan creation):**

| Item | Owner | Action |
|------|-------|--------|
| BE F-01: Add `shutdownSignal: AbortSignal` to `OrchestratorDeps` in §4.4 + composition root | Backend Engineer | TSPEC v1.2 |
| BE F-02: Add `getParentThreadId()` to `ThreadStateManager` protocol in §4.2.2 + `FakeThreadStateManager` | Backend Engineer | TSPEC v1.2 |

**Can defer to implementation:**
- BE F-03: `activeCount()` Set-based deduplication
- BE F-04: Explicit `register()`/`deregister()` call sites in §5.2
- BE F-05: `WorktreeRegistry.deregister()` in GR-R9 cleanup

**Unblocked:**
- FSPEC v1.3: Approved. No changes needed.
- REQ v1.0: Approved. No changes needed.

**Next step:** Backend Engineer produces TSPEC v1.2 addressing BE F-01 and F-02, then planning can begin.

---

## 4. Positive Observations (Combined)

1. **FSPEC v1.3 is a complete, well-structured behavioral specification.** All 23 business rules are unambiguous and testable. No product decisions were left to engineering.
2. **TSPEC v1.1 correctly implements all product-level behavioral intent.** No requirements were narrowed, reinterpreted, or silently dropped.
3. **The three-module architecture (`InvocationGuard`, `ThreadStateManager`, `WorktreeRegistry`) cleanly maps to the three FSPEC behavioral clusters.** Module boundaries respect product-level concerns.
4. **The TE review cycle improved both FSPEC and TSPEC significantly.** The turn-limit semantics fix (TE F-01 → FSPEC v1.1) and the AT-GR-16/AT-GR-17 additions (TE F-02/F-03 → FSPEC v1.2) made the specification more precise.
5. **The `GuardResult` discriminated union (`"success" | "exhausted" | "unrecoverable" | "shutdown"`) correctly encodes all product-specified failure modes.** No error path can be silently swallowed.

---

*End of Document*
