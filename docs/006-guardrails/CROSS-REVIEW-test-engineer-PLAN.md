# Cross-Review: Test Engineer → Execution Plan (PLAN)

| Field | Detail |
|-------|--------|
| **Document Reviewed** | `006-PLAN-TSPEC-ptah-guardrails.md` |
| **Reference Documents** | `006-REQ-PTAH-guardrails.md` v1.0, `006-TSPEC-ptah-guardrails.md` v1.2, `006-PROPERTIES-ptah-guardrails.md` v1.0, `CROSS-REVIEW-product-manager-PLAN.md` |
| **Reviewer** | Test Engineer |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Review Scope

This review evaluates the execution plan from the **testing perspective only**: test file assignment, test coverage completeness against the PROPERTIES document, test level appropriateness, test double design, use of fake timers, integration test identification, and E2E test justification. Product requirements traceability and implementation architecture choices are out of this review's scope (those are covered by the PM review).

---

## 2. Test Coverage Analysis

### 2.1 Properties → Plan Task Mapping

All 72 PROP-GR properties from `006-PROPERTIES-ptah-guardrails.md` were cross-referenced against the PLAN.

| Property Range | PLAN Coverage | Assessment |
|----------------|---------------|------------|
| PROP-GR-01–10 (Functional — InvocationGuard) | D-2, D-3, D-4, D-5, D-6, D-7 | ✓ Full — each PROP maps to a specific D-task |
| PROP-GR-11–18 (Functional — ThreadStateManager + Orchestrator) | B-2, B-3, E-4 | ✓ Full |
| PROP-GR-19–22 (Functional — Shutdown + AbortSignal) | D-8, F-2, F-3 | ✓ Full |
| PROP-GR-23–29 (Contract — Protocols + Config) | D-1, B-1, A-1, A-2, A-3, C-1 | ✓ Full — protocol definitions are well-covered in D-1, B-1, A-3, C-1 |
| PROP-GR-30–42 (Error Handling) | D-4, D-5, D-8, E-2, E-6, F-1, F-2, F-4 | ✓ Full — minor gap noted in F-01 below |
| PROP-GR-43–47 (Data Integrity) | B-4, C-2 | ✓ Full |
| PROP-GR-48–53 (Integration) | E-3, E-4, E-5, G-1 | ✓ Full |
| PROP-GR-54–56 (Performance) | F-3 | ✓ Full |
| PROP-GR-57–62 (Observability) | D-3, D-4, E-4, E-5 | ✓ Covered — minor observation Q-01 below |
| PROP-GR-63–72 (Negative Properties) | D-4, D-5, D-6, D-8, E-3, E-6, F-4 | ✓ Full |

**Overall coverage verdict: Complete.** All 72 PROP-GR properties are covered by at least one PLAN task. No properties are orphaned.

### 2.2 Acceptance Test Mapping

All 17 AT-GR acceptance tests (Phase H) were verified against PROP-GR properties:

| AT | Primary Properties Exercised | Assessment |
|----|------------------------------|------------|
| AT-GR-01 (retry succeeds) | PROP-GR-01, PROP-GR-02, PROP-GR-57 | ✓ |
| AT-GR-02 (all retries exhausted) | PROP-GR-05, PROP-GR-30, PROP-GR-31, PROP-GR-33 | ✓ |
| AT-GR-03 (backoff timing) | PROP-GR-03, PROP-GR-55 | ✓ |
| AT-GR-04 (auth error → unrecoverable) | PROP-GR-06, PROP-GR-63 | ✓ |
| AT-GR-05 (two malformed signals) | PROP-GR-07, PROP-GR-08, PROP-GR-71 | ✓ |
| AT-GR-06 (general turn limit) | PROP-GR-12, PROP-GR-17, PROP-GR-59 | ✓ |
| AT-GR-07 (CLOSED thread silent drop) | PROP-GR-13, PROP-GR-68 | ✓ |
| AT-GR-08 (review thread stalled) | PROP-GR-14, PROP-GR-18, PROP-GR-60 | ✓ |
| AT-GR-09 (ROUTE_TO_DONE on Turn 4) | PROP-GR-14, PROP-GR-16 | ✓ |
| AT-GR-10 (restart → lazy reconstruction) | PROP-GR-43, PROP-GR-53, PROP-GR-58 | ✓ |
| AT-GR-11 (clean shutdown) | PROP-GR-19, PROP-GR-20, PROP-GR-35 | ✓ |
| AT-GR-12 (shutdown waits for in-flight) | PROP-GR-20, PROP-GR-34, PROP-GR-50 | ✓ |
| AT-GR-13 (shutdown timeout → exit 1) | PROP-GR-36, PROP-GR-56 | ✓ |
| AT-GR-14 (double SIGINT → exit 1) | PROP-GR-35 | ✓ |
| AT-GR-15 (pending Git changes committed) | PROP-GR-21, PROP-GR-37, PROP-GR-46 | ✓ |
| AT-GR-16 (shutdown cancels backoff) | PROP-GR-22, PROP-GR-49, PROP-GR-55, PROP-GR-67 | ✓ |
| AT-GR-17 (post-commit embed fails) | PROP-GR-39, PROP-GR-48, PROP-GR-69 | ✓ |

---

## 3. Findings

### F-01 — Minor: B-3 cites GR-R11 for STALLED silent drop — incorrect rule reference [Low]

**Location:** Phase B, task B-3 description: `"GR-R11 silent drop for STALLED"`

**Finding:** GR-R11 in the FSPEC applies specifically to CLOSED threads (general turn limit). STALLED review threads are governed by a distinct rule. The behaviour described in B-3 is **correct** (STALLED → subsequent messages are silently dropped), but the rule citation will mislead the engineer implementing the code comment.

**Impact:** No behavioral change required. This is a documentation labeling issue only. If an engineer adds a code comment citing `GR-R11` for the STALLED path, a reviewer cross-checking against the FSPEC will flag a mismatch.

**Recommendation:** The implementing engineer should cite the correct FSPEC §4.3 stall-drop rule (or equivalently note "analogous to GR-R11 for STALLED state") in the code comment. No PLAN revision required. This finding is noted so the engineer is aware when implementing B-3.

*(Note: This finding was also raised by the PM review — documented here for completeness.)*

---

### F-02 — Minor: Phase H test descriptions do not call out fake timer setup requirement [Low]

**Location:** Phase H tasks H-3 (AT-GR-03), H-11 through H-16

**Finding:** Tasks H-3, H-11, H-12, H-13, and H-16 involve timing-sensitive assertions (backoff delay formula verification, 500ms poll interval, 5-second progress log, `shutdownTimeoutMs` elapse). The PLAN does not explicitly state that `vi.useFakeTimers()` must be configured in the Phase H integration test file.

This is already covered in the TSPEC §7.1 ("Phase 6 adds three new modules with complex async behaviour... All unit tests use `vi.useFakeTimers()`") and in Phase D task descriptions for unit tests. However, the Phase H file (`tests/integration/orchestrator/guardrails.test.ts`) may be set up by an engineer who does not cross-reference back to D-3/F-3 task descriptions.

**Impact:** If the integration test file is written without fake timers, H-3 and H-11–H-16 will rely on real wall-clock time, making them slow (~30+ seconds per test) and flaky.

**Recommendation:** Add a note to the Phase H task row or the Phase H header: `"Note: vi.useFakeTimers() required in test suite setup for timing-sensitive ATs (H-3, H-11–H-16)"`. This is a must-fix for test reliability but does not change any implementation.

---

### F-03 — Minor: D-10/D-11 (FakeGitClient/FakeDiscordClient extensions) are listed under Phase D but are needed by Phase F tests [Low]

**Location:** Phase D, tasks D-10 and D-11

**Finding:** D-10 extends `FakeGitClient` with `resetHardCalls`, `addAllCalls`, `commitCalls` — these are needed in Phase D tests for the worktree-reset-before-retry assertions. However, `addAllCalls` and `commitCalls` are also needed in Phase F shutdown tests for Step 4 (shutdown commit). Similarly, D-11 (`debugChannelMessages`) is needed by Phase F tests.

The PLAN correctly sequences D-10/D-11 before Phase E (to avoid `factories.ts` merge conflicts), so Phase F implicitly benefits. However, if an engineer implements D-10 narrowly (only the fields needed for D-tests), Phase F tests may fail for a confusing reason.

**Impact:** Potential confusion / missing test coverage in Phase F if D-10's `addAllCalls`/`commitCalls` fields are not added.

**Recommendation:** The D-10 task description already includes `addAllCalls` and `commitCalls` — this is correct. Engineers should implement all fields listed, not just those needed for D tests. No PLAN change needed; noting here for emphasis.

---

## 4. Clarification Questions

### Q-01 — Observability: Are retry-success logs to #agent-debug covered by a test assertion? [Low]

**Location:** TSPEC §4.2.1 behavioural contract: "On successful retry: logs success to `#agent-debug`, returns `{ status: "success", ... }`"

**Question:** The TSPEC mentions that on successful retry (after ≥1 failure), the guard logs a success message to `#agent-debug`. Is this covered by task D-3 or H-1? The D-3 task description focuses on failure → retry → success sequencing and backoff delays, but the test assertion for the success log message is not explicit.

**Suggested answer:** Add a note to D-3: "Assert that `FakeDiscordClient.debugChannelMessages` includes a success log after a retry succeeds (in addition to the retry-attempt log from step 7)." If this behavior is intentionally not specified in the FSPEC, it can be treated as implementation detail and left untested.

**No PLAN revision required** — engineers may address inline when implementing D-3.

---

## 5. Positive Observations

- **Fake timer coverage is well-designed.** D-3 (backoff timing) and F-3 (shutdown wait loop) explicitly call out `vi.useFakeTimers()` at the task level. This is the correct approach for testing async timing behaviour without wall-clock waits.

- **Sequencing of `factories.ts` modifications (D-9, D-10, D-11) before Phase E** is excellent engineering hygiene. It prevents merge conflicts in the shared fixture file and ensures all fakes are ready before orchestrator wiring tests run.

- **`FakeInvocationGuard.lastShutdownSignal` field** is correctly designed (TSPEC §7.2, PLAN D-9). Tests can assert that the `AbortSignal` reference is correctly threaded from the orchestrator through to each invocation — this covers PROP-GR-49 precisely.

- **The `Set<string>` deduplication requirement in C-2** (BE F-03 resolution) is the right implementation note. Without deduplication, a thread with a queued task AND active processing would be double-counted, causing the shutdown wait to never terminate for that thread. Calling this out in the PLAN prevents a subtle bug.

- **E-3 registration timing** (register immediately before `invokeWithRetry()`, deregister immediately after non-success) is explicitly sequenced in the task description. This ensures PROP-GR-48 is tested and the shutdown worktree-commit step sees the correct set of worktrees.

- **Phase H acceptance tests are properly isolated** from unit tests in `tests/integration/orchestrator/guardrails.test.ts`. This avoids polluting the fast unit-test feedback loop with slower integration scenarios.

- **17 E2E acceptance tests is appropriate** for Phase 6. The feature involves complex async coordination across 4+ modules. An engineer could not adequately cover AT-GR-11 through AT-GR-17 (shutdown sequencing) at the unit level — they require real module interaction. The count is justified.

---

## 6. Recommendation

**Approved with minor changes.**

The PLAN is well-structured and provides sufficient test detail for engineers to implement without ambiguity. All 72 properties from the PROPERTIES document are covered. All 17 acceptance tests map to Phase H tasks.

**Must-fix before implementation:**
- **F-02:** Add `vi.useFakeTimers()` note to Phase H header or to H-3/H-11–H-16 task rows to prevent flaky integration tests.

**Should address during implementation (no PLAN revision required):**
- **F-01:** Use correct FSPEC rule citation in B-3 code comment (not GR-R11).
- **F-03:** Implement all FakeGitClient fields from D-10 list, not only those needed for D-tests.
- **Q-01:** Confirm whether retry-success log to `#agent-debug` requires a test assertion in D-3.

These items may be addressed inline during implementation without requiring a PLAN update. Implementation may proceed once F-02 is resolved.

---

*End of Review*
