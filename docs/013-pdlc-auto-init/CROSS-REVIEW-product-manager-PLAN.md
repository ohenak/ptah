# Cross-Review: Product Manager — PLAN (013-PLAN-TSPEC-pdlc-auto-init)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Deliverable** | 013-PLAN-TSPEC-pdlc-auto-init.md |
| **Review Date** | 2026-03-15 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Summary

The execution plan is thorough, well-sequenced, and accurately translates the REQ and FSPEC into concrete engineering tasks. All functional requirements (REQ-PI-01–05, REQ-BC-01–02, REQ-DC-01–03) are traceable to specific tasks or tests. Phase dependencies are correctly ordered (Logger → helpers → fakes → idempotency guard → orchestrator wiring → integration). The three core behavioral flows from FSPEC-PI-01, FSPEC-BC-01, and FSPEC-DC-01 are all represented in the test suite with appropriate coverage.

Two findings are noted below — one medium, one low. Neither blocks implementation, but the medium finding should be addressed before the DoD is declared met.

---

## 2. Findings

### F-01 — REQ-NF-01 (Latency) Is Silently Excluded from DoD
**Severity:** Medium

**Location:** Section 5 (Definition of Done), DoD checkbox:
> "Code reviewed against requirement acceptance criteria (REQ-PI-01–05, REQ-BC-01–02, REQ-DC-01–03, **REQ-NF-02–03**)"

**Issue:** REQ-NF-01 (initialization latency, P1) is absent from the DoD without explanation. The requirement specifies a p95 < 100ms latency target measured over 100 runs in CI. No task in Phases A–F addresses this measurement.

Silent exclusion creates ambiguity: is latency testing intentionally deferred (acceptable for a P1 requirement), or was it overlooked?

**Product impact:** If latency is not measured, there is no signal that the auto-init block is inadvertently blocking the routing loop. The 100ms budget is conservative, but a latency regression could degrade user-perceived responsiveness on first-encounter features.

**Request:** Add an explicit note to the DoD acknowledging the disposition of REQ-NF-01. Two acceptable options:
- **Option A (defer):** Add a DoD line: `REQ-NF-01 latency — deferred to a follow-on performance validation task; not measured in this iteration.` Mark it ⬚ with a note.
- **Option B (cover):** Add a Phase F-2 task to implement the p95 benchmark as a CI test, even a lightweight one (e.g., 100 iterations measuring wall-clock time of the auto-init block using mocked dependencies).

Either option is acceptable from a product perspective. The current state (silent omission) is not.

---

### F-02 — Test ID Overlap Between E-1 and E-2 Task Descriptions
**Severity:** Low

**Location:** Phase E tasks

**Issue:** E-1 claims test IDs "UT-ORC-AI-01 to UT-ORC-AI-06" for happy-path orchestrator tests. E-2 then also references "UT-ORC-AI-03, UT-ORC-AI-04, UT-ORC-AI-05, UT-ORC-AI-06" for error and edge cases. The same six IDs are partitioned across two task rows with overlapping ranges.

This is primarily a technical concern (test ID naming is the engineer's domain), but it creates traceability ambiguity: if a test in the "UT-ORC-AI-03" range fails during CI, it is unclear which task (E-1 happy-path or E-2 error-path) is the source of truth.

**Product impact:** Low. No requirement coverage is missing. The concern is purely operational — debugging test failures and mapping them back to REQ/FSPEC acceptance tests becomes harder if IDs are ambiguous.

**Request:** Clarify the ID partitioning in the task descriptions (e.g., E-1 covers UT-ORC-AI-01/02 happy-path; E-2 covers UT-ORC-AI-03 through UT-ORC-AI-06 error cases) so that each test ID maps to exactly one task row.

---

## 3. Positive Observations

- **Unresolvable slug scenario (REQ-PI-01, A-06) is explicitly covered.** Task E-5 (UT-ORC-SLUG-01) tests the falsy-slug → no auto-init, no age-guard-evaluation, legacy-path-still-invoked path. This is the hardest acceptance criterion in REQ-PI-01 and the plan handles it correctly.

- **Fail-open error handling is preserved throughout.** B-6 specifies `catch → logger.warn + { eligible: true }` for the age guard; E-2 specifies that `logger.info` throws are swallowed and routing proceeds; E-2 specifies `postToDebugChannel` failures are warn-logged but non-fatal. These all match FSPEC error scenarios precisely.

- **Cross-thread idempotency (AT-PI-04) is covered in integration tests.** F-1 IT-05 tests two routing loop invocations for the same slug, both seeing `isManaged → false`, with a single state record as the outcome. This was the most iteratively refined acceptance test across REQ/FSPEC rounds and its inclusion in the integration suite is correct.

- **Conversation history reuse is implicit in E-6.** The task uses `initialMessage?.content` sourced from the existing history rather than issuing a second fetch, consistent with the FSPEC-PI-01 note prohibiting a second `readThreadHistory()` call.

- **Feature 011 freeze boundary is enforced.** Section 4 explicitly lists the frozen modules (`state-machine.ts`, `state-store.ts`, `review-tracker.ts`, `phases.ts`, `context-matrix.ts`, `cross-review-parser.ts`, `migrations.ts`) and the DoD includes "No changes to [those files] (C-01)". This protects against accidental scope creep into Feature 011.

- **TSPEC §4.4 references in DoD.** The DoD checkpoint "Implementation matches TSPEC: `countPriorAgentTurns`, `parseKeywords`, `evaluateAgeGuard` behave per §4.4..." provides a clear, specific verification target that engineers can mechanically check.

---

## 4. Clarification Questions

None. The plan is unambiguous from a product perspective. Only F-01 requires an action; F-02 is a suggestion.

---

## 5. Recommendation

**Approved with minor changes.**

- F-01 (Medium) must be resolved before declaring DoD met — add explicit disposition for REQ-NF-01 in the DoD section (defer or cover, either is fine).
- F-02 (Low) is a suggestion to improve test ID clarity; does not block implementation.

All product requirements have implementation tasks. All FSPEC behavioral flows have corresponding test coverage. The phase dependency graph is correct. Proceed with implementation.
