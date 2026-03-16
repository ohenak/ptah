# Cross-Review: Test Engineer — Code Review

## Feature 013: PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (QA Agent) |
| **Review Scope** | Implementation code vs. TSPEC, PLAN, and PROPERTIES documents |
| **Branch** | `feat-pdlc-auto-init` |
| **Date** | 2026-03-16 |
| **Documents Reviewed** | `013-TSPEC-pdlc-auto-init.md` (v1.2), `013-PLAN-TSPEC-pdlc-auto-init.md`, `013-PROPERTIES-pdlc-auto-init.md` (v1.1) |
| **Files Reviewed** | `ptah/src/orchestrator/orchestrator.ts`, `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts`, `ptah/src/services/logger.ts`, `ptah/tests/fixtures/factories.ts`, `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts`, `ptah/tests/unit/orchestrator/orchestrator.test.ts`, `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` |

---

## Summary

Phases A–E are complete; all 1,108 tests pass (0 failures, 1 pre-existing skip). The implementation is clean, the helpers are pure and well-scoped, and the FakeLogger/FakePdlcDispatcher protocol extensions are correct. The three critical gaps below are not bugs in the implementation — they are gaps in the test assertions that allow specific behavioral regressions to slip through undetected.

---

## Findings

### F-01 — Medium — PROP-PI-16 ordering assertion is incomplete

**Property:** PROP-PI-16 — `executeRoutingLoop` must emit the info log **before** posting the debug channel notification.

**Location:** `ptah/tests/unit/orchestrator/orchestrator.test.ts`, UT-ORC-AI-01 (lines 2200–2207)

**Observation:** The test computes `infoIndex` from `logger.messages.indexOf(infoLog!)` but never uses it in any assertion. The final `expect` only checks that `debugPostIndex >= 0` (i.e., the debug channel post happened at all). The ordering invariant from PROP-PI-16 and REQ-PI-03 is therefore not verified. A regression where the implementation swaps the order — posting to the debug channel before emitting the info log — would pass the test suite undetected.

**Expected assertion (missing):**
```ts
expect(infoIndex).toBeLessThan(debugPostIndex);
```
The variable `infoIndex` was clearly intended to be used in this comparison but the final `expect` was accidentally written without it.

**Impact:** A future refactor that moves `postToDebugChannel` before `logger.info` would silently break REQ-PI-03 ordering without failing any test.

---

### F-02 — Medium — PROP-PI-10 initial-message sourcing has no assertion in orchestrator tests

**Property:** PROP-PI-10 — `executeRoutingLoop` must pass the content of the first `isBot === false` message to `parseKeywords`, not the thread name and not any bot message.

**Location:** `ptah/tests/unit/orchestrator/orchestrator.test.ts`, describe "PDLC auto-init — happy path (E-1)"

**Observation:** PROP-PI-10 was listed as Gap #1 in PROPERTIES §7 with a recommendation to add an explicit sourcing assertion in UT-ORC-AI-01. The current UT-ORC-AI-01 indirectly tests keyword parsing (it verifies `initializeFeatureCalls[0].config`) but does not verify *which* message's content was passed to `parseKeywords`. The test harness sets both `message.content` (the triggering message) and `threadHistory[0].content` to the same value (`"@pm create REQ"`), so the test cannot distinguish between the implementation correctly reading the first user-authored history message and incorrectly reading the trigger message or thread name.

**Impact:** A regression where `parseKeywords(triggerMessage.content)` replaces `parseKeywords(initialMessage?.content ?? null)` would produce the same keyword result in all current tests and pass undetected. The regression was explicitly called out as a concern in PROP-PI-10 and Gap #1 of the PROPERTIES document.

**Suggested fix:** Add a test where `triggerMessage.content` differs from `threadHistory.find(m => !m.isBot).content` and assert the config reflects the history message keywords, not the trigger message keywords.

---

### F-03 — Medium — Integration tests (Phase F) are entirely absent

**Properties:** PROP-PI-20, PROP-PI-21, PROP-BC-10, PROP-PI-22, PROP-NF-02

**Location:** `ptah/tests/integration/orchestrator/` — `pdlc-auto-init.test.ts` does not exist

**Observation:** Phase F (IT-01 through IT-05 plus the F-2 latency smoke test) is marked "Not Started" in the PLAN and confirmed absent from the codebase. The PLAN's DoD explicitly requires all integration tests and the latency benchmark before marking the feature complete. Five integration properties (PROP-PI-20, PROP-PI-21, PROP-BC-10, PROP-PI-22, PROP-NF-02) have no test coverage at the intended level. In particular:
- **PROP-PI-21** (two sequential invocations produce a single state record) is not tested end-to-end — only the `DefaultPdlcDispatcher` unit test covers the idempotency guard in isolation.
- **PROP-PI-22** (transient failure → retry succeeds on next message) has no test coverage at any level.
- **PROP-NF-02** (orchestration overhead ≤ 5ms p95) has no benchmark.

**Impact:** The feature cannot satisfy its own Definition of Done with Phase F missing. Cross-module wiring bugs (e.g., incorrect parameter ordering between `evaluateAgeGuard` and `parseKeywords` in the routing loop) could exist and be undetectable at unit level.

---

### F-04 — Low — PROP-PI-08 and PROP-PI-09 lack dedicated unit tests

**Properties:** PROP-PI-08 (logger.info swallow → managed path still invoked), PROP-PI-09 (debug channel post failure → warn logged, routing continues)

**Location:** `ptah/tests/unit/orchestrator/orchestrator.test.ts`, describe "PDLC auto-init — error and edge cases (E-2)"

**Observation:** The PLAN's E-2 task lists both error scenarios ("UT-ORC-AI-06: logger.info throws during success log → error swallowed, routing proceeds; also cover: `postToDebugChannel` fails → warn logged, routing proceeds"). However, neither scenario has a test in the current suite. The test titled "UT-ORC-AI-06" tests "already-managed feature — auto-init not re-triggered", which is a valid test but corresponds to a different scenario than the E-2 task description. The logger.info swallow path and postToDebugChannel failure path are unverified.

**Specific PROP-PI-08 gap:** PROP-PI-08 was strengthened in v1.1 to require two observable assertions — (1) no exception propagates AND (2) the managed PDLC path IS invoked. No test currently verifies either.

**Impact:** A future change that accidentally lets a logger.info throw propagate upward (breaking the `try/catch` swallow) would not be caught by tests.

---

### F-05 — Low — UT-AG-01 and UT-AG-05 are duplicate tests

**Location:** `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts`, lines 108–134

**Observation:** UT-AG-01 ("0 turns → eligible") and UT-AG-05 ("empty array → eligible") both call `evaluateAgeGuard([], logger)` and assert `{ eligible: true }`. The two tests are identical in input and output, providing no additional coverage. This likely reflects a minor editorial issue during test development (UT-AG-05 appears to be a renamed duplicate of UT-AG-01).

**Impact:** None at runtime, but it adds noise to the test count and could mislead future maintainers about boundary conditions being distinct.

---

### F-06 — Low — `[ fullstack ]` and `[FULLSTACK]` case-sensitivity tests are absent from orchestrator integration-level tests (E-4)

**Properties:** PROP-DC-07, PROP-DC-N01

**Location:** `ptah/tests/unit/orchestrator/orchestrator.test.ts`, describe "PDLC auto-init — discipline keyword integration (E-4)"

**Observation:** The PLAN's E-4 task calls for tests UT-ORC-DC-01 through UT-ORC-DC-09, including space-padded (`[ fullstack ]`) and case-variant (`[FULLSTACK]`) scenarios. The implemented tests only cover UT-ORC-DC-01 through UT-ORC-DC-04. The case-sensitivity and space-sensitivity variants are tested at the `parseKeywords` unit level (UT-KW-08, UT-KW-09) but not at the orchestrator level. Given that `parseKeywords` is a pure function and its unit tests are thorough, the risk is low — the orchestrator tests call `parseKeywords` directly without interposing — but the PLAN's full E-4 test set is incomplete.

---

## Clarification Questions

### Q-01 — Test ID collision in PLAN E-2 description

The PLAN's E-2 task description states "UT-ORC-AI-06: logger.info throws during success log → error swallowed, routing proceeds" but the implemented test titled UT-ORC-AI-06 covers "already-managed feature — auto-init not re-triggered". Are there two different intended behaviors for UT-ORC-AI-06, or was the logger.info swallow scenario intended to receive a different ID (e.g., UT-ORC-AI-07)? Clarifying this determines whether the logger.info swallow test is missing or was intentionally replaced.

### Q-02 — Integration test scheduling

The DoD requires all Phase F tests before marking the feature complete. Is Phase F being deferred to a follow-up feature (014), or is it still planned for this branch? If deferred, the PLAN status should be updated and a new DoD checkpoint created to avoid permanent open coverage gaps for PROP-PI-21, PROP-PI-22, and PROP-NF-02.

### Q-03 — ConsoleLogger.debug uses `console.log` not `console.debug`

PROP-PI-05 specifies that `ConsoleLogger.debug` must delegate to `console.debug`. The implementation at `ptah/src/services/logger.ts:21` delegates to `console.log("[ptah] DEBUG: ...")` instead. Is this intentional (unified log stream for production) or an inadvertent deviation from the PROPERTIES contract?

---

## Positive Observations

1. **Clean auto-init block structure.** The `executeRoutingLoop` auto-init block (lines 496–541 of `orchestrator.ts`) follows the TSPEC §4.4.3 algorithm faithfully: try/catch slug resolution, `evaluateAgeGuard` before `parseKeywords`, `effectivelyManaged` flag pattern, swallowed logger.info, non-fatal `postToDebugChannel`. The guard variable naming is unambiguous.

2. **Idempotency guard is correct and well-tested.** `DefaultPdlcDispatcher.initializeFeature()` implements the check-before-write guard precisely as specified in TSPEC §4.4.5, and the UT-IDP-01/UT-IDP-02 tests verify all three observable properties: single save, config non-overwrite, and debug log emission.

3. **Fail-open age guard is correctly implemented and tested.** `evaluateAgeGuard` wraps `countPriorAgentTurns` in a try/catch and returns `{ eligible: true }` with a warn log on any error (UT-AG-06). The test correctly asserts both the return value and the warn log emission.

4. **`parseKeywords` is pure, export-safe, and thoroughly tested.** The function handles all 12 specified test cases (UT-KW-01 through UT-KW-12) including null/undefined/empty inputs, case-sensitivity, space-padding, last-discipline-wins, and duplicate skip-fspec. No state mutation.

5. **FakePdlcDispatcher protocol extension is additive and non-breaking.** The addition of `initializeFeatureCalls`, `initError`, and `autoRegisterOnInit` to `FakePdlcDispatcher` is fully backward-compatible. All 1,068 pre-existing tests continue to pass unmodified (confirmed: 1,108 total tests pass, +40 new).

6. **`DEFAULT_OLD_HISTORY` sentinel pattern is clever.** The orchestrator test file defines a two-routing-message history that ensures the age guard rejects auto-init for all pre-existing tests, preventing any inadvertent auto-init side effects on the 56 pre-existing orchestrator scenarios.

7. **`AGE_GUARD_THRESHOLD` is a named constant.** Exporting `AGE_GUARD_THRESHOLD = 1` as a module-level constant (not a magic number) makes the boundary condition discoverable and makes future threshold changes a single-line edit.

---

## Recommendation

**Approved with minor changes**

The implementation is functionally correct and all tests pass. The three medium-severity findings (F-01, F-02, F-03) must be addressed before marking the feature complete per the DoD:

- **F-01** is a one-line fix (add `expect(infoIndex).toBeLessThan(debugPostIndex)` to UT-ORC-AI-01).
- **F-02** requires adding a targeted test scenario where trigger message and history message keywords differ.
- **F-03** (Phase F integration tests) is the most significant gap — either implement IT-01 through IT-05 and the F-2 benchmark on this branch, or explicitly defer to a follow-up feature and update the DoD accordingly.

Findings F-04 through F-06 are low-severity cleanup items that can be addressed in the same pass or deferred to a fast-follow.
