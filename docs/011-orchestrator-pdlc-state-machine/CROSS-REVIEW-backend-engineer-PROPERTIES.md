# Cross-Review: Backend Engineer Review of PROPERTIES-011

| Field | Detail |
|-------|--------|
| **Document** | [011-PROPERTIES-orchestrator-pdlc-state-machine.md](011-PROPERTIES-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Backend Engineer (`eng`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: Metadata references PLAN v1.0 but approved version is v1.1 with 53 tasks (Low)

Section 1.2 states "Plan tasks reviewed: 50" and the metadata table references PLAN v1.0. The approved PLAN is v1.1 with 53 tasks (3 integration tests were added during review: revision bound escalation, backward compatibility, and FakePdlcDispatcher reordering).

**Impact:** Minor metadata discrepancy. The properties themselves are correct — the additional integration tests in Tasks 51-53 are covered by PROP-INT-02, PROP-INT-04, and PROP-INT-08.

**Recommendation:** Update metadata to reference PLAN v1.1 and "53 tasks reviewed."

---

### F-02: Gap #4 — `processResumeFromBound()` should have explicit unit properties (Medium)

Gap #4 acknowledges that `processResumeFromBound()` has no dedicated properties and states it's "covered implicitly by PROP-SM-18 and PROP-INT-08." However, this method performs 3 distinct operations that should be individually verifiable:

1. Reset `revisionCount` to 0 for the current review phase
2. Reset all `reviewerStatuses` to `"pending"`
3. Return a dispatch action with reviewer dispatch entries

PROP-SM-18 only tests that the revision bound triggers a pause — it doesn't test the resume path. PROP-INT-08 tests the full lifecycle but doesn't isolate the resume behavior.

**Impact:** Without explicit properties, an engineer implementing `processResumeFromBound()` may miss one of the 3 operations (e.g., forgetting to reset the revision count, which would cause the bound to trigger again immediately on the next rejection).

**Recommendation:** Add 2-3 properties:
- `PROP-SM-20`: `processResumeFromBound()` must reset `revisionCount` to 0 for the paused review phase
- `PROP-SM-21`: `processResumeFromBound()` must reset all `reviewerStatuses` to `"pending"` for the paused review phase
- `PROP-SM-22`: `processResumeFromBound()` must return `{ action: "dispatch" }` with reviewer dispatch entries for the review phase

---

### F-03: PROP-NEG-03 wording references removed behavior label (Low)

PROP-NEG-03 states: "must NOT transition on `review_submitted` when any reviewers are still `pending` (collect-all-then-evaluate)." The parenthetical cites BR-RL-03 which in the FSPEC v1.1 was reworded from early-exit to collect-all. The property correctly describes the behavior, but the source reference "BR-RL-03" may confuse if someone reads the original v1.0 FSPEC (where BR-RL-03 said the opposite).

**Impact:** Cosmetic — the property behavior is correct. Only the source citation could cause confusion.

**Recommendation:** Update source to "FSPEC-RT-02 v1.1, BR-RL-03" to clarify the version.

---

## Positive Observations

- **P-01:** The property count (86) and category distribution are excellent. 78 unit-level properties for the pure-function modules means the bulk of testing is fast, isolated, and deterministic — exactly matching the TSPEC's architecture.

- **P-02:** The negative properties (Section 4) are particularly valuable. PROP-NEG-01 through NEG-14 explicitly codify the "must NOT" constraints from the FSPEC business rules. These are the tests most likely to catch regressions — e.g., PROP-NEG-03 ensures the collect-all-then-evaluate model isn't accidentally reverted to early-exit.

- **P-03:** The coverage matrix (Section 5) provides complete traceability from requirements to properties. Every P0 requirement has "Full" coverage, and the 6 uncovered requirements (SA-01–SA-06) are correctly identified as out of scope with clear justification.

- **P-04:** PROP-CT-01 through CT-08 (contract properties) ensure the protocol interfaces match the TSPEC signatures. This catches type drift between the protocol definition and implementation.

- **P-05:** The idempotency properties (PROP-ID-01 through ID-03) are a smart addition. They verify that the pure-function guarantee holds under repeated invocations — important for resilience when the orchestrator retries or recovers.

- **P-06:** The E2E justification is sound. The pure-function architecture + integration tests covering the full lifecycle make E2E tests redundant. This keeps the test suite fast.

- **P-07:** PROP-SM-19 correctly captures the fullstack partial-rejection Resubmit/Revise distinction, which was a cross-review finding (FSPEC F-04, TSPEC PM F-04) that went through multiple review rounds to get right.

---

## Summary

This is a thorough and well-structured properties document with excellent coverage. The 86 properties map cleanly to the TSPEC's module architecture, and the negative properties provide strong regression safety for the behavioral constraints.

The main actionable item is **F-02** — `processResumeFromBound()` needs explicit unit properties rather than relying on implicit coverage from integration tests. This method is the only recovery path from revision bound escalation, and its 3 operations (reset count, reset statuses, dispatch reviewers) should be independently testable.

**F-01** and **F-03** are minor metadata/citation fixes.

**Recommendation: Approved with minor changes** — add the `processResumeFromBound()` properties (F-02) and fix metadata (F-01).
