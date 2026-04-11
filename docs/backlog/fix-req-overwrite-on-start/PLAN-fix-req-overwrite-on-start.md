# Execution Plan: Fix REQ Overwrite On Workflow Start

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-fix-req-overwrite-on-start](TSPEC-fix-req-overwrite-on-start.md) v1.1 |
| **Requirements** | [REQ-fix-req-overwrite-on-start](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Version** | 1.1 |
| **Status** | In Review |

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
| A1 | Add `existsError: Error \| null = null` field to `FakeFileSystem`; update `exists()` to throw when set; add `existsError` injection test to `fake-filesystem.test.ts` | `tests/unit/fixtures/fake-filesystem.test.ts` | `tests/fixtures/factories.ts` | ✅ Done |
| A2 | Create `FakePhaseDetector` class in `factories.ts` (fields: `result`, `detectError`, `detectedSlugs`); add `fake-phase-detector.test.ts` with: (a) default `result` returned, (b) `detectError` causes throw, (c) all slug args recorded in `detectedSlugs` | `tests/unit/fixtures/fake-phase-detector.test.ts` | `tests/fixtures/factories.ts` | ✅ Done |
| A3 | Create **minimal stub** `src/orchestrator/phase-detector.ts` with only the `PhaseDetectionResult` type and `PhaseDetector` interface (no JSDoc, no implementation class); add `phaseDetector: PhaseDetector` field to `TemporalOrchestratorDeps` interface with `import type { PhaseDetector } from "./phase-detector.js"`; update `makeDeps()` in `temporal-orchestrator.test.ts` to include `phaseDetector: new FakePhaseDetector()` (default `startAtPhase: "req-creation"`); confirm existing tests still pass | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts`, `src/orchestrator/phase-detector.ts` (stub) | ✅ Done |

> **A3 sequencing note:** A3 requires A2 (FakePhaseDetector) to be complete first. A1 and A2 can be done in parallel. To unblock the TypeScript compile in both `temporal-orchestrator.ts` and `factories.ts`, A3 **creates a minimal stub** `src/orchestrator/phase-detector.ts` containing only the `PhaseDetectionResult` type and the `PhaseDetector` interface (no implementation class, no JSDoc yet). C1 then replaces this stub with the full interface and JSDoc. This unambiguous ordering avoids dangling `import type` references to a nonexistent module and gives C1 a clear "replace stub" action.

---

### Phase B: R-01 Regression Test (First Red — mandatory)

> **Hard ordering constraint (REQ §7 R-01):** Task B1 must be written and confirmed FAILING before any implementation work begins in Phases C–H.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | **(R-01 regression)** Write test #12: `FakePhaseDetector` returning `startAtPhase: "req-review"` → `startWorkflowForFeature` called with `startAtPhase: "req-review"`. Confirm test FAILS with current `startNewWorkflow` (which ignores phaseDetector). Record the failure output. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | — (no implementation yet) | ✅ Done |

---

### Phase C: PhaseDetector Interface and Implementation

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | **Replace the A3 stub** in `phase-detector.ts` with the full interface and JSDoc per TSPEC §4.2 (still no implementation class); verify all existing imports still compile cleanly | — (interface only, no runtime test needed) | `src/orchestrator/phase-detector.ts` | ✅ Done |
| C2 | Write `phase-detector.test.ts` with tests #1–11 covering all `DefaultPhaseDetector` behaviors; confirm all 11 tests FAIL (Red) because class doesn't exist | `tests/unit/orchestrator/phase-detector.test.ts` | — | ✅ Done |
| C3 | Implement `DefaultPhaseDetector` — decision table (Cases A–H), warning logic, structured log entry; confirm tests #1–11 GREEN; refactor | `tests/unit/orchestrator/phase-detector.test.ts` | `src/orchestrator/phase-detector.ts` | ✅ Done |

---

### Phase D: TemporalOrchestrator `startNewWorkflow` Update

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Write tests #13–15 in `temporal-orchestrator.test.ts`: (13) no REQ → `req-creation`; (14) `detect()` throws → Discord reply posted to `message.threadId` (the invoking thread, **not** the parent channel) with slug + "transient error during phase detection" as literal substrings, no workflow started; (15) Branch A (running workflow + ad-hoc) → `detect()` NOT called. Confirm RED. Test #14 MUST assert the `FakeDiscordClient.postPlainMessage` call received `message.threadId` as its target (REQ-ER-03 thread-target AC). | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | — | ✅ Done |
| D2 | Replace `startNewWorkflow()` body per TSPEC §4.6: call `this.phaseDetector.detect(slug)` in a try/catch; pass `detection.startAtPhase` to `startWorkflowForFeature`; handle catch with `logger.error()` + Discord reply; confirm tests #12–15 GREEN including the R-01 regression. Refactor. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |

---

### Phase E: NodeFileSystem.exists() Error-Propagation Fix

> **TDD ordering:** E1 writes the failing unit tests that pin the REQ-ER-03 production-coverage behavior (per test-engineer cross-review F-01). E2 implements the one-line semantic fix. E1 must be confirmed RED before E2 begins.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | **(R-01 for REQ-ER-03 production coverage)** Add three new tests to `tests/unit/services/filesystem.test.ts` under a new `describe("NodeFileSystem.exists() error propagation (REQ-ER-03)")` block using `vi.mock("node:fs/promises")`: (a) `fs.access` throws `ENOENT` → `exists()` resolves `false`; (b) `fs.access` throws `EACCES` → `exists()` rejects with the same error (match on `.code === "EACCES"`); (c) `fs.access` throws `EIO` → `exists()` rejects with the same error (match on `.code === "EIO"`). Confirm all three FAIL (Red) against current implementation — test (a) may already be green, but (b) and (c) MUST fail because the current `catch` swallows everything. Record the failure output. | `tests/unit/services/filesystem.test.ts` | — |  ⬚ Not Started |
| E2 | Update `NodeFileSystem.exists()` to catch only `ENOENT` and propagate all other errors per TSPEC §4.4; confirm the three E1 tests are now GREEN; also run `tests/integration/services/filesystem.test.ts` and confirm all three existing `exists()` integration tests (nonexistent → false, existing file → true, existing dir → true) remain GREEN. Refactor. | `tests/unit/services/filesystem.test.ts`, `tests/integration/services/filesystem.test.ts` | `src/services/filesystem.ts` |  ⬚ Not Started |

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
                                           E1 (RED) ──→ E2 (GREEN) — independent branch, can run after D2
                                           │
                                           F1, F2, F3 (independent of each other, after D2)
                                           │
                                           G1 (after all phases complete)
```

**Critical path:** A1 → A2 → A3 → B1 → C1 → C2 → C3 → D1 → D2 → G1

**Parallelizable:**
- A1 and A2 can be done simultaneously
- F1, F2, F3 can be done in any order after D2 (they don't depend on each other)
- E1 → E2 can be done alongside F1-F3 (it modifies a different file; E1 must precede E2 per TDD ordering)

**Hard constraints:**
- **R-01 (REQ §7):** B1 must be confirmed RED before C1 begins.
- **TDD for Phase E:** E1 must be confirmed RED before E2 begins (pins REQ-ER-03 production coverage per test-engineer F-01).

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
| `tests/unit/services/filesystem.test.ts` | Add tests | E1 | New `describe` block for `NodeFileSystem.exists()` error propagation (REQ-ER-03); stubs `node:fs/promises` via `vi.mock` |
| `src/services/filesystem.ts` | Behavior change to `NodeFileSystem.exists()` | E2 | ENOENT-only catch |
| `tests/unit/temporal/feature-lifecycle.test.ts` | Add tests | F1, F2, F3 | Tests #16–18 |
| `bin/ptah.ts` | Add instantiation + wiring | G1 | `new DefaultPhaseDetector(fs, logger)` |

**Existing tests affected by A3:** All existing `temporal-orchestrator.test.ts` tests that call `makeDeps()` will be updated automatically when `makeDeps()` is updated to include `phaseDetector: new FakePhaseDetector()`. Tests that exercise Branch B without checking `startAtPhase` continue to pass (FakePhaseDetector defaults to `req-creation`).

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npm test` in `ptah/`) — 0 failures, 0 skipped
- [ ] R-01: Test B1 was confirmed RED before implementation began (documented in commit message)
- [ ] Phase E TDD: E1's three `NodeFileSystem.exists()` propagation tests were confirmed RED (for EACCES and EIO cases) before E2's implementation change (documented in commit message)
- [ ] Tests #1–18 from TSPEC §7.5 all pass
- [ ] REQ-ER-03 satisfied in production: `NodeFileSystem.exists()` propagates non-ENOENT errors through `DefaultPhaseDetector.detect()` to `startNewWorkflow()`'s catch block, **verified by the E1 unit tests** (not only by the test-double chain in tests #11 and #14)
- [ ] REQ-ER-03 thread-target AC verified: test #14 asserts the Discord reply is posted to `message.threadId` (the invoking thread), not the parent channel
- [ ] Code reviewed against all acceptance criteria in REQ v3.0
- [ ] Implementation matches TSPEC v1.1 (protocols, decision table, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Composition-root wiring (G1) verified: TypeScript strict mode catches missing/misnamed `phaseDetector` dep at compile time; in addition, the engineer runs `npm run build` locally to confirm `bin/ptah.ts` compiles cleanly after wiring, and runs a one-shot `ptah --help` (or equivalent no-side-effect invocation) to confirm no runtime TypeError at startup. CI does not cover this path; document the smoke check result in the G1 commit message.
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-fix-req-overwrite-on-start` for review

---

## 6. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-10 | Initial draft. |
| 1.1 | 2026-04-10 | Addressed test-engineer cross-review ([CROSS-REVIEW-test-engineer-PLAN.md](CROSS-REVIEW-test-engineer-PLAN.md)): **F-01 (Medium)** — split Phase E into E1 (new RED tests for `NodeFileSystem.exists()` ENOENT/EACCES/EIO propagation via `vi.mock("node:fs/promises")`) and E2 (implementation); added TDD ordering note to Phase E; updated §3 dependency graph, §4 integration points, and §5 DoD to reference new E1 tests. **F-02 (Low)** — D1 test #14 now explicitly asserts the Discord reply target is `message.threadId` (not parent channel); added matching DoD line. **F-03 (Low)** — A3 sequencing note committed to the "minimal stub" approach (removed "Alternatively" ambiguity); A3 task row now lists `src/orchestrator/phase-detector.ts` (stub) in Source File column; C1 task description updated to "Replace the A3 stub". **F-04 (Low)** — added §5 DoD line acknowledging composition-root wiring (G1) is verified by TypeScript strict mode + local `npm run build` + one-shot `ptah --help` smoke rather than by CI. |
