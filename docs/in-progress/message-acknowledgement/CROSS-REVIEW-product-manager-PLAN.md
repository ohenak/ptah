# Cross-Review: product-manager — PLAN

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/message-acknowledgement/PLAN-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Medium | REQ-NF-17-02 (P1) — the "acknowledgement appears within 5 seconds" latency requirement — has no corresponding task or validation step in the PLAN. All 17 tests in TASK-02 focus on correctness (reactions, replies, error handling, ordering). None addresses the 5-second latency target from the REQ success metrics table. TASK-04 (Definition of Done) also omits any latency validation gate. The TSPEC review (Finding 2) already flagged this gap, yet the PLAN was authored after the TSPEC review and still does not close it. A P1 requirement with an explicit measurable target cannot be considered covered by the absence of a task. | REQ-NF-17-02 |
| F-02 | Low | TSPEC Section 7.2 states "No changes to `FakeDiscordClient`, `FakeTemporalClient`, or any factory are required by this feature," but TASK-01 of the PLAN directly contradicts this by extending `FakeTemporalClient` in `factories.ts`. The PLAN is correct — TASK-01 is needed for AT-MA-10 — but the contradiction means the TSPEC is now inaccurate. This does not block implementation, but the discrepancy could confuse the implementing agent about whether factory changes are permitted. | REQ-MA-05 (AT-MA-10 coverage) |
| F-03 | Low | PLAN Section 1 states "No new files, interfaces, or fakes are required," yet TASK-01 adds a new property (`startWorkflowErrorValue`) to an existing fake. The statement is technically true (no new *files*) but the phrasing "no new fakes" conflicts with the property addition. Minor wording inaccuracy in the summary could mislead reviewers about the change surface. | REQ-MA-05 (AT-MA-10 coverage) |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | For REQ-NF-17-02 (latency ≤ 5s under normal network conditions), is the acceptance posture manual-test-only (per the REQ success metrics table)? If yes, should TASK-04 include an explicit manual verification step ("post a message in a live Discord thread and confirm reaction appears within 5 seconds") so the Definition of Done is complete for this P1 requirement? |
| Q-02 | The TSPEC review (Finding 2) recommended adding latency validation guidance to the TSPEC traceability table. Was that recommendation accepted? If so, why does the PLAN still have no corresponding task or verification step for REQ-NF-17-02? |

---

## Positive Observations

- All six P0 functional requirements (REQ-MA-01 through REQ-MA-06) are covered by at least one task and at least one acceptance test. Traceability from requirement to task to test is clear throughout.
- Phasing is correct: all work is Phase 1, all P0 requirements are addressed before P1. The TDD sequence (Red → Green → Refactor across TASK-01 through TASK-04) is disciplined and preserves the ability to verify each step independently.
- The no-touch list (Section 6) is comprehensive and explicitly names every out-of-scope path from the FSPEC. No scope creep is present — the PLAN does not introduce any product behavior beyond what the REQ and FSPEC authorize.
- All FSPEC acceptance tests (AT-MA-01 through AT-MA-16, plus the Additional non-Error object case) are enumerated in TASK-02 with precise assertion guidance. The negative guard test (AT-MA-15, query failure early-exit) is included, which correctly preserves the out-of-scope exclusion.
- Regression test updates in TASK-02 (Sections 2c and 2d) are correctly scoped: only the G3 and G4 tests that previously relied on `postPlainMessage` for the replaced paths are updated. The `WorkflowExecutionAlreadyStartedError` path is correctly left unchanged.
- REQ-NF-17-03 (no double-acknowledgement) is addressed by AT-MA-14 and anchored in the single code-path structure described in TASK-03. This is a clean product-fidelity solution.

---

## Recommendation

**Need Attention**

F-01 is Medium severity. REQ-NF-17-02 is a P1 requirement with a defined success metric (reaction visible within 5 seconds, 100% of the time under normal conditions) that the PLAN does not address. Before implementation is considered complete, the team must either:

1. Add a manual verification step to TASK-04's Definition of Done (e.g. "post a message in a connected Discord thread and confirm the ✅ reaction appears within 5 seconds"), or
2. Explicitly document that REQ-NF-17-02 is accepted as operationally validated outside this PLAN's scope, with PM sign-off.

F-02 and F-03 are Low severity and do not require plan changes before implementation begins, but the TSPEC should be corrected to remove the inaccurate "no changes to factories are required" statement.
