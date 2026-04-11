# Execution Plan: Fix REQ Overwrite On Workflow Start

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-fix-req-overwrite-on-start](TSPEC-fix-req-overwrite-on-start.md) v1.1 |
| **Requirements** | [REQ-fix-req-overwrite-on-start](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Status** | Draft |

---

## 1. Summary

This plan implements the phase-aware workflow start fix described in TSPEC v1.1. A new `DefaultPhaseDetector` component is introduced in `src/orchestrator/phase-detector.ts`, wired into `TemporalOrchestrator` via a new `phaseDetector` field on `TemporalOrchestratorDeps`, and the `startNewWorkflow()` private method is updated to detect existing REQ files before choosing `startAtPhase`. `NodeFileSystem.exists()` is tightened to propagate real I/O errors (non-ENOENT). Implementation follows strict TDD — all tests are written and confirmed Red before implementation.

> **R-01 mandate (REQ §7):** The first failing test in the plan (Phase B, task B1) is the bug-reproduction regression test: it asserts the desired behavior (REQ present → `startAtPhase: "req-review"`) and is confirmed to fail against the current codebase before any implementation begins. This is a hard ordering constraint.

> **Worktree:** All implementation work must be done in a git worktree created from `feat-fix-req-overwrite-on-start` to keep the branch clean and enable isolated, atomic commits.

---

## 2. Task List

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

### Phase A: Test Double Infrastructure

These tasks create the test doubles required for subsequent phases. Phase A must be complete before Phase B.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Add `existsError: Error \| null = null` field to `FakeFileSystem`; update `exists()` to throw when set; add `existsError` injection test to `fake-filesystem.test.ts` | `tests/unit/fixtures/fake-filesystem.test.ts` | `tests/fixtures/factories.ts` |  ⬚ Not Started |
| A2 | Create `FakePhaseDetector` class in `factories.ts` (fields: `result`, `detectError`, `detectedSlugs`); add `fake-phase-detector.test.ts` with: (a) default `result` returned, (b) `detectError` causes throw, (c) all slug args recorded in `detectedSlugs` | `tests/unit/fixtures/fake-phase-detector.test.ts` | `tests/fixtures/factories.ts` |  ⬚ Not Started |
| A3 | Add `phaseDetector: PhaseDetector` field to `TemporalOrchestratorDeps` interface; update `makeDeps()` in `temporal-orchestrator.test.ts` to include `phaseDetector: new FakePhaseDetector()` (default `startAtPhase: "req-creation"`); confirm existing tests still pass | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` |  ⬚ Not Started |

> **A3 sequencing note:** A3 requires A2 (FakePhaseDetector) to be complete first. A1 and A2 can be done in parallel. A3 will cause a TypeScript compile error in `temporal-orchestrator.ts` until `PhaseDetector` is imported — create the type import from `./phase-detector.js` (file created in Phase C, but the `import type` statement is added here to allow compilation). Alternatively, create a minimal stub `phase-detector.ts` (interface only, no implementation) as part of A3 to unblock compilation.

---

### Phase B: R-01 Regression Test (First Red — mandatory)

> **Hard ordering constraint (REQ §7 R-01):** Task B1 must be written and confirmed FAILING before any implementation work begins in Phases C–H.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | **(R-01 regression)** Write test #12: `FakePhaseDetector` returning `startAtPhase: "req-review"` → `startWorkflowForFeature` called with `startAtPhase: "req-review"`. Confirm test FAILS with current `startNewWorkflow` (which ignores phaseDetector). Record the failure output. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | — (no implementation yet) |  ⬚ Not Started |

---

### Phase C: PhaseDetector Interface and Implementation

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | Define `PhaseDetectionResult` type and `PhaseDetector` interface with full JSDoc in `phase-detector.ts` (no implementation class yet); verify A3's import compiles cleanly | — (interface only, no runtime test needed) | `src/orchestrator/phase-detector.ts` |  ⬚ Not Started |
| C2 | Write `phase-detector.test.ts` with tests #1–11 covering all `DefaultPhaseDetector` behaviors; confirm all 11 tests FAIL (Red) because class doesn't exist | `tests/unit/orchestrator/phase-detector.test.ts` | — |  ⬚ Not Started |
| C3 | Implement `DefaultPhaseDetector` — decision table (Cases A–H), warning logic, structured log entry; confirm tests #1–11 GREEN; refactor | `tests/unit/orchestrator/phase-detector.test.ts` | `src/orchestrator/phase-detector.ts` |  ⬚ Not Started |

---

### Phase D: TemporalOrchestrator `startNewWorkflow` Update

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Write tests #13–15 in `temporal-orchestrator.test.ts`: (13) no REQ → `req-creation`; (14) `detect()` throws → Discord reply with slug + "transient error during phase detection", no workflow started; (15) Branch A (running workflow + ad-hoc) → `detect()` NOT called. Confirm RED. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | — |  ⬚ Not Started |
| D2 | Replace `startNewWorkflow()` body per TSPEC §4.6: call `this.phaseDetector.detect(slug)` in a try/catch; pass `detection.startAtPhase` to `startWorkflowForFeature`; handle catch with `logger.error()` + Discord reply; confirm tests #12–15 GREEN including the R-01 regression. Refactor. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` |  ⬚ Not Started |

---

### Phase E: NodeFileSystem.exists() Error-Propagation Fix

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Update `NodeFileSystem.exists()` to catch only `ENOENT` and propagate all other errors per TSPEC §4.4; run `tests/integration/services/filesystem.test.ts` and confirm all three `exists()` tests (nonexistent → false, existing file → true, existing dir → true) remain GREEN; no new tests needed (existing coverage is sufficient per TSPEC) | `tests/integration/services/filesystem.test.ts` | `src/services/filesystem.ts` |  ⬚ Not Started |

---

### Phase F: Workflow Continuation Tests (REQ-WS-04 and REQ-WS-06)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Add test #18 (REQ-WS-04) to `feature-lifecycle.test.ts`: walk `resolveNextPhase()` forward from `req-review` in a sequential config that includes `req-creation` before it; assert `req-creation` never appears in the sequence and the sequence from `req-review` onward equals the suffix of the full sequence with `req-creation` omitted. Confirm GREEN immediately (existing algorithm satisfies this). | `tests/unit/temporal/feature-lifecycle.test.ts` | — |  ⬚ Not Started |
| F2 | Add test #16 (REQ-WS-06a) to `feature-lifecycle.test.ts`: `resolveNextPhase()` with a purely sequential config never returns a phase at an array index lower than the current phase. Confirm GREEN immediately. | `tests/unit/temporal/feature-lifecycle.test.ts` | — |  ⬚ Not Started |
| F3 | Add test #17 (REQ-WS-06b) to `feature-lifecycle.test.ts`: load production `ptah.workflow.yaml` and assert no phase at index ≥ index of `req-review` has a `transition` pointing to `req-creation`. Confirm GREEN immediately. | `tests/unit/temporal/feature-lifecycle.test.ts` | `ptah.workflow.yaml` (read-only) |  ⬚ Not Started |

> **Phase F note:** These tests verify existing invariants that the codebase already satisfies. They are expected to be GREEN immediately after being written. If any are RED, that indicates a pre-existing regression that must be investigated before proceeding to Phase G.

---

### Phase G: Composition Root Wiring

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Import `DefaultPhaseDetector` in `bin/ptah.ts`; instantiate `new DefaultPhaseDetector(fs, logger)` after the `featureResolver` line; add `phaseDetector` to the `TemporalOrchestrator` constructor call. Run the full test suite to confirm zero regressions. | — (composition root: tested by integration test suite) | `bin/ptah.ts` |  ⬚ Not Started |

---

## 3. Task Dependency Notes

```
A1 ──┐
     ├──→ A3 ──→ B1 (RED, confirm failure)
A2 ──┘         │
               │
               C1 ──→ C2 ──→ C3 ──→ D1 ──→ D2 (GREEN for B1)
                                           │
                                           E1 (independent, can run after D2)
                                           │
                                           F1, F2, F3 (independent of each other, after D2)
                                           │
                                           G1 (after all phases complete)
```

**Critical path:** A1 → A2 → A3 → B1 → C1 → C2 → C3 → D1 → D2 → G1

**Parallelizable:**
- A1 and A2 can be done simultaneously
- F1, F2, F3 can be done in any order after D2 (they don't depend on each other)
- E1 can be done alongside F1-F3 (it modifies a different file)

**Hard constraint (R-01):** B1 must be confirmed RED before C1 begins.

---

## 4. Integration Points

| File | Change Type | Task | Notes |
|------|-------------|------|-------|
| `tests/fixtures/factories.ts` | Add field + guard | A1, A2 | `FakeFileSystem.existsError` + `FakePhaseDetector` class |
| `tests/unit/fixtures/fake-filesystem.test.ts` | Add tests | A1 | `existsError` injection behavior |
| `tests/unit/fixtures/fake-phase-detector.test.ts` | New file | A2 | Full `FakePhaseDetector` behavior |
| `src/orchestrator/temporal-orchestrator.ts` | Add field to interface + replace method | A3, D2 | `phaseDetector` in `TemporalOrchestratorDeps`; `startNewWorkflow()` body |
| `src/orchestrator/phase-detector.ts` | New file | C1, C3 | `PhaseDetectionResult` type, `PhaseDetector` interface, `DefaultPhaseDetector` class |
| `tests/unit/orchestrator/phase-detector.test.ts` | New file | C2, C3 | Tests #1–11 |
| `tests/unit/orchestrator/temporal-orchestrator.test.ts` | Add to `makeDeps()` + add tests | A3, B1, D1 | `phaseDetector` default + tests #12–15 |
| `src/services/filesystem.ts` | Behavior change to `NodeFileSystem.exists()` | E1 | ENOENT-only catch |
| `tests/unit/temporal/feature-lifecycle.test.ts` | Add tests | F1, F2, F3 | Tests #16–18 |
| `bin/ptah.ts` | Add instantiation + wiring | G1 | `new DefaultPhaseDetector(fs, logger)` |

**Existing tests affected by A3:** All existing `temporal-orchestrator.test.ts` tests that call `makeDeps()` will be updated automatically when `makeDeps()` is updated to include `phaseDetector: new FakePhaseDetector()`. Tests that exercise Branch B without checking `startAtPhase` continue to pass (FakePhaseDetector defaults to `req-creation`).

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npm test` in `ptah/`) — 0 failures, 0 skipped
- [ ] R-01: Test B1 was confirmed RED before implementation began (documented in commit message)
- [ ] Tests #1–18 from TSPEC §7.5 all pass
- [ ] REQ-ER-03 satisfied in production: `NodeFileSystem.exists()` propagates non-ENOENT errors through `DefaultPhaseDetector.detect()` to `startNewWorkflow()`'s catch block
- [ ] Code reviewed against all acceptance criteria in REQ v3.0
- [ ] Implementation matches TSPEC v1.1 (protocols, decision table, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-fix-req-overwrite-on-start` for review
