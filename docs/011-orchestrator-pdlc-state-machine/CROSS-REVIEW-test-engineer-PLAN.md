# Cross-Review: Test Engineer Review of PLAN-011

| Field | Detail |
|-------|--------|
| **Document** | [011-PLAN-TSPEC-orchestrator-pdlc-state-machine.md](011-PLAN-TSPEC-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Test Engineer (`qa`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: Task 38 (test fixtures) is after the tasks that depend on it (High)

Task 38 creates `FakeStateStore` and `FakePdlcDispatcher` in `factories.ts`, but Tasks 29-37 (PdlcDispatcher tests) need `FakeStateStore` for testing. The `DefaultPdlcDispatcher` constructor takes a `StateStore` dependency — every unit test for it requires a fake. Similarly, Task 3 creates the `FakeFileSystem` extension, but that's correctly placed in Phase A before Phase C (state-store tests).

**Impact:** An engineer following the task order will reach Task 29 and need to either create `FakeStateStore` ad-hoc or skip ahead to Task 38, breaking the sequential flow.

**Recommendation:** Split Task 38:
- Move `FakeStateStore` creation to Phase A (alongside Task 3, as "Task 3b" or renumber). It only depends on the `StateStore` protocol from Task 1.
- Move `FakePdlcDispatcher` creation to Phase D before Task 39 (it's needed by orchestrator integration tests). Or keep it at the start of Phase E.

---

### F-02: No integration test for revision bound escalation and resume (Medium)

Task 49 covers "rejection → revision → re-review → approval" but doesn't explicitly include the revision bound escalation path: 4th rejection → pause → developer resume → fresh review cycle. This is a critical P0 flow involving `processResumeFromBound()` which was added to the protocol specifically for this purpose (previous TSPEC review F-02).

**Impact:** The revision bound resume is the only way to recover a feature stuck at the bound. Without an integration test, the interaction between the state machine (revision count), dispatcher (resume), and orchestrator (Pattern B pause/resume) is untested at the integration level.

**Recommendation:** Add an integration test task (e.g., Task 49b): "Integration test: revision bound escalation — 4 rejections → pause → developer resume → fresh review cycle → approval → advance."

---

### F-03: No integration test for backward compatibility with unmanaged features (Medium)

Task 43 mentions "backward compatibility for unmanaged features" as a unit test in `orchestrator.test.ts`, but there's no integration test verifying that a feature without a state record correctly falls through to the existing `RoutingEngine.decide()` path. This is REQ-SM-NF-03 — a P0 non-functional requirement.

**Impact:** Backward compatibility is the highest-risk integration point (Section 4, Risk: High). A unit test with `FakePdlcDispatcher` verifies the branching logic, but doesn't verify that the actual `RoutingEngine` still works end-to-end for unmanaged features after the orchestrator changes.

**Recommendation:** Add an integration test task (e.g., Task 50b): "Integration test: unmanaged feature — feature without state record routes via existing RoutingEngine, PDLC dispatcher not invoked."

---

### F-04: Collect-all-then-evaluate not explicitly called out in integration test scenarios (Low)

Task 49 covers "revision loop" but doesn't explicitly mention the scenario where Reviewer A rejects and Reviewer B approves in the same round. This is the core behavioral change from FSPEC-RT-02 v1.1 — the author should receive BOTH feedbacks before revising. While Task 8 covers this at the unit level, the integration test should verify the full flow: dispatch all reviewers → collect all results (including mixed approved/rejected) → single revision with all feedback.

**Impact:** Low — the unit tests cover the logic. But integration tests exist to verify the modules work together correctly, and this specific interaction (dispatcher collecting all review completions before evaluating) is the most complex integration point.

**Recommendation:** Expand Task 49's description to explicitly include: "mixed review outcome — one rejection + one approval in same round, author receives all feedback."

---

### F-05: Task 14 edge cases should include fullstack-specific scenarios (Low)

Task 14 covers edge cases: "LGTM in review phase (ignored), all_approved in creation phase (ignored), TASK_COMPLETE in non-terminal phase." Missing: subtask_complete event for a non-fullstack feature (should be invalid), and subtask_complete from an unknown agentId in a fullstack feature.

**Impact:** Low — these are straightforward error paths. But without explicit mention, an engineer may skip them.

**Recommendation:** Add to Task 14 description: "subtask_complete in non-fullstack feature (invalid), subtask_complete from unknown agentId (invalid)."

---

## Positive Observations

- **P-01:** The 5-phase dependency structure is clean and follows the test pyramid naturally — pure functions (Phase B) before I/O (Phase C) before integration (Phase D) before end-to-end (Phase E). This means the bulk of tests (~130 unit tests) are written and passing before any complex integration work begins.

- **P-02:** Every task has a test file assigned with a clear test-file-to-source-file mapping. No task is test-free. This makes TDD enforcement straightforward — the engineer knows exactly which test file to write first.

- **P-03:** The PLAN correctly separates state-machine transition logic into fine-grained tasks (Tasks 7-14) rather than one monolithic "implement transition()" task. Each task maps to a specific behavioral concern: creation phases, review phases, revision loops, auto-transitions, fork/join, terminal state, edge cases. This ensures incremental progress and focused test suites.

- **P-04:** Phase B tasks are independent within the phase (state-machine, review-tracker, cross-review-parser, context-matrix, migrations can all be implemented in any order). This is correctly noted in the dependency graph and provides implementation flexibility.

- **P-05:** Integration tests (Tasks 46-50) cover the 5 most important lifecycle scenarios: full happy path, FSPEC skip, fullstack fork/join, revision loop, and state persistence/recovery. These map directly to the user scenarios (US-13 through US-17) from the REQ.

- **P-06:** Definition of Done (Section 5) includes regression verification: "Existing tests remain green — particularly `orchestrator.test.ts`, `context-assembler.test.ts`, `filesystem.test.ts`." This explicitly acknowledges the backward compatibility risk.

---

## Summary

The PLAN is well-structured with clear phases, dependency ordering, and comprehensive task coverage. The 50 tasks map cleanly to the TSPEC's 8 modules and ~153 estimated tests. The TDD approach and phase-based dependency graph ensure that pure functions are tested before I/O layers, which is optimal for the test pyramid.

Three findings should be addressed:

1. **F-01 (High):** Task 38 (test fixtures) must be reordered — FakeStateStore is needed before PdlcDispatcher tests begin in Phase D.
2. **F-02 (Medium):** Missing integration test for revision bound escalation + resume flow.
3. **F-03 (Medium):** Missing integration test for backward compatibility with unmanaged features.

F-04 and F-05 (Low) are minor description enhancements.

**Recommendation: Approved with minor changes** — address F-01 (reorder Task 38) and consider adding F-02/F-03 integration tests. Proceed without re-routing.
