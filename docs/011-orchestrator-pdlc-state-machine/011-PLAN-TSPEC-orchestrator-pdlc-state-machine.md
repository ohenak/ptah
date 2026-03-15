# Execution Plan: Orchestrator-Driven PDLC State Machine

| Field | Detail |
|-------|--------|
| **Technical Specification** | [011-TSPEC-orchestrator-pdlc-state-machine](011-TSPEC-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Requirements** | [011-REQ-orchestrator-pdlc-state-machine](011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Functional Specification** | [011-FSPEC-orchestrator-pdlc-state-machine](011-FSPEC-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Date** | March 14, 2026 |
| **Version** | 1.1 |
| **Status** | Approved |

## 1. Summary

This plan implements the PDLC state machine as 8 new modules within `ptah/src/orchestrator/pdlc/`, plus updates to 4 existing files. The work is organized into 5 phases (53 tasks) following dependency order: types and pure functions first, then I/O layers, then integration. Each task follows strict TDD (Red → Green → Refactor). REQ-SA-01–SA-06 (SKILL.md simplification) are deferred to a separate task.

## 2. Task List

### Phase A: Types and Infrastructure

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Define `PdlcPhase` enum, `Discipline`, `FeatureConfig`, event types, `FeatureState`, `ReviewPhaseState`, `ForkJoinState`, `PdlcStateFile`, `TransitionResult`, `SideEffect`, `TaskType`, `DocumentType`, `ReviewerManifestEntry`, `ContextDocument`, `ContextDocumentSet`, `DispatchAction`, `AgentDispatch`, `ParsedRecommendation` types | `tests/unit/orchestrator/pdlc/state-machine.test.ts` (import-only test) | `ptah/src/orchestrator/pdlc/phases.ts` | ✅ Done |
| 2 | Add `rename()` and `copyFile()` methods to `FileSystem` interface and `NodeFileSystem` | `ptah/tests/unit/services/filesystem.test.ts` (extend) | `ptah/src/services/filesystem.ts` | ✅ Done |
| 3 | Update `FakeFileSystem` with `rename()`, `copyFile()`, and error injection | `ptah/tests/unit/services/filesystem.test.ts` (extend) | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 4 | Add `state/` to `.gitignore` | — | `ptah/.gitignore` | ✅ Done |
| 5 | Add `FakeStateStore` to test fixtures (needed by Phase D tests) | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase B: Pure Function Modules

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 6 | Implement `createFeatureState()` — creates initial state with slug, config, phase=REQ_CREATION, timestamps | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 7 | Implement `validEventsForPhase()` — returns valid event types for each phase/config combination | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 8 | Implement `transition()` for creation phases — LGTM in `*_CREATION` → `*_REVIEW` with `dispatch_reviewers` side effect | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 9 | Implement `transition()` for review phases — collect-all-then-evaluate: update per-reviewer status, wait for pending, evaluate when all complete | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 10 | Implement `transition()` review revision loop — all complete + any rejection → increment revisionCount, reset statuses, transition to `*_CREATION` with Revise/Resubmit side effects | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 11 | Implement `transition()` revision bound — revisionCount > 3 → `pause_feature` side effect, state unchanged | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 12 | Implement `transition()` for auto-transitions — `*_APPROVED` → next creation phase with `dispatch_agent`; REQ_APPROVED with skipFspec branching | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 13 | Implement `transition()` fork/join — fullstack `TSPEC_CREATION`/`PLAN_CREATION`/`IMPLEMENTATION`: subtask_complete events, partial + full completion | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 14 | Implement `transition()` terminal state and error handling — DONE guard, `InvalidTransitionError`, `UnknownFeatureError` | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 15 | Implement `transition()` edge cases — LGTM in review phase (ignored + warning), all_approved in creation phase (ignored + warning), TASK_COMPLETE in non-terminal phase (treat as LGTM), subtask_complete in non-fullstack feature (invalid), subtask_complete from unknown agentId (invalid) | `ptah/tests/unit/orchestrator/pdlc/state-machine.test.ts` | `ptah/src/orchestrator/pdlc/state-machine.ts` | ✅ Done |
| 16 | Implement `computeReviewerManifest()` — reviewer lookup table for all 6 review phases × 3 disciplines, including fullstack composite keys | `ptah/tests/unit/orchestrator/pdlc/review-tracker.test.ts` | `ptah/src/orchestrator/pdlc/review-tracker.ts` | ✅ Done |
| 17 | Implement `reviewerKey()`, `initializeReviewPhaseState()`, `evaluateReviewOutcome()` | `ptah/tests/unit/orchestrator/pdlc/review-tracker.test.ts` | `ptah/src/orchestrator/pdlc/review-tracker.ts` | ✅ Done |
| 18 | Implement `computeReviewerManifest()` error cases — unknown discipline, non-review phase | `ptah/tests/unit/orchestrator/pdlc/review-tracker.test.ts` | `ptah/src/orchestrator/pdlc/review-tracker.ts` | ✅ Done |
| 19 | Implement `parseRecommendation()` — happy path: "Approved", "Approved with minor changes", "Needs revision" (case-insensitive, whitespace-tolerant) | `ptah/tests/unit/orchestrator/pdlc/cross-review-parser.test.ts` | `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | ✅ Done |
| 20 | Implement `parseRecommendation()` edge cases — code block exclusion, multiple headings, no heading, unrecognized value, trailing period, extra text after match | `ptah/tests/unit/orchestrator/pdlc/cross-review-parser.test.ts` | `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | ✅ Done |
| 21 | Implement `skillNameToAgentId()` and `crossReviewPath()` | `ptah/tests/unit/orchestrator/pdlc/cross-review-parser.test.ts` | `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | ✅ Done |
| 22 | Implement `getContextDocuments()` — creation phase matrix: REQ_CREATION through IMPLEMENTATION | `ptah/tests/unit/orchestrator/pdlc/context-matrix.test.ts` | `ptah/src/orchestrator/pdlc/context-matrix.ts` | ✅ Done |
| 23 | Implement `getContextDocuments()` — review phase matrix + revision context augmentation (isRevision=true adds CROSS-REVIEW files) | `ptah/tests/unit/orchestrator/pdlc/context-matrix.test.ts` | `ptah/src/orchestrator/pdlc/context-matrix.ts` | ✅ Done |
| 24 | Implement `getContextDocuments()` — fullstack scope filtering (agentScope="be"/"fe") and skipFspec handling | `ptah/tests/unit/orchestrator/pdlc/context-matrix.test.ts` | `ptah/src/orchestrator/pdlc/context-matrix.ts` | ✅ Done |
| 25 | Implement `migrateState()` and migration registry infrastructure (empty for v1, sequential chain pattern) | `ptah/tests/unit/orchestrator/pdlc/migrations.test.ts` | `ptah/src/orchestrator/pdlc/migrations.ts` | ✅ Done |

### Phase C: I/O Layer — State Store

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 26 | Implement `FileStateStore.load()` — no file → fresh state; valid file → parsed state; empty file → fresh state | `ptah/tests/unit/orchestrator/pdlc/state-store.test.ts` | `ptah/src/orchestrator/pdlc/state-store.ts` | ⬚ Not Started |
| 27 | Implement `FileStateStore.load()` — corrupted JSON → fresh state; version mismatch → migration or fresh state; future version → fresh state | `ptah/tests/unit/orchestrator/pdlc/state-store.test.ts` | `ptah/src/orchestrator/pdlc/state-store.ts` | ⬚ Not Started |
| 28 | Implement `FileStateStore.save()` — atomic write (write .tmp → rename), directory creation, error handling | `ptah/tests/unit/orchestrator/pdlc/state-store.test.ts` | `ptah/src/orchestrator/pdlc/state-store.ts` | ⬚ Not Started |
| 29 | Implement `FileStateStore.load()` migration path — backup to .bak on migration failure, sequential migration chain | `ptah/tests/unit/orchestrator/pdlc/state-store.test.ts` | `ptah/src/orchestrator/pdlc/state-store.ts` | ⬚ Not Started |

### Phase D: Orchestration Layer — PdlcDispatcher

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 30 | Implement `DefaultPdlcDispatcher` — constructor, `loadState()`, `isManaged()`, `getFeatureState()`, `initializeFeature()` | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 31 | Implement `processAgentCompletion()` — LGTM handling for single-discipline creation phases: validate artifact, build event, transition, persist, return dispatch action | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 32 | Implement `processAgentCompletion()` — fullstack fork/join: subtask_complete events, partial + full completion | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 33 | Implement `processAgentCompletion()` — artifact validation: missing artifact → `retry_agent` action; TASK_COMPLETE in non-terminal → treat as LGTM | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 34 | Implement `processReviewCompletion()` — read cross-review file, parse recommendation, build event, transition, persist, return dispatch action | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 35 | Implement `processReviewCompletion()` — parse errors: missing file → pause; no recommendation → pause; unrecognized value → pause (FSPEC-RT-01 failure cases) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 36 | Implement `getNextAction()` — startup recovery: dispatch pending agents for creation phases, dispatch pending reviewers for review phases, handle approved/done phases | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 37 | Implement `processResumeFromBound()` — reset revision count, reset reviewer statuses, return dispatch action for reviewers | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 38 | Implement side effect processing — convert `SideEffect[]` to `DispatchAction` with context documents from `getContextDocuments()`, handle auto-transition recursion | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |

### Phase E: Integration — Orchestrator + Context Assembler

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 39 | Add `FakePdlcDispatcher` to test fixtures (needed by orchestrator integration tests) | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 40 | Add `pdlcDispatcher` to `OrchestratorDeps` interface | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (extend) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 41 | Implement managed-feature branch in `executeRoutingLoop()` — check `isManaged()`, route LGTM/TASK_COMPLETE to `processAgentCompletion()`, route review completion to `processReviewCompletion()` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (extend) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 42 | Implement ROUTE_TO_AGENT handling for managed features — ad-hoc coordination (log warning, invoke target for one turn, phase unchanged) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (extend) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 43 | Implement `DispatchAction` processing in orchestrator — `dispatch` → set next agent(s), `retry_agent` → re-invoke with correction directive (up to 2 retries), `pause` → ROUTE_TO_USER, `done` → completion, `wait` → return | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (extend) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 44 | Implement `loadState()` call in `startup()`, backward compatibility for unmanaged features | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (extend) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 45 | Update `ContextAssembler.assemble()` — accept optional `contextDocuments` parameter, read only specified documents when provided | `ptah/tests/unit/orchestrator/context-assembler.test.ts` (extend) | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 46 | Add composition root wiring for `FileStateStore` and `DefaultPdlcDispatcher` in entry point | — | `ptah/src/orchestrator/orchestrator.ts` (or `bin/ptah.ts`) | ⬚ Not Started |
| 47 | Integration test: full PDLC lifecycle — backend-only feature from REQ_CREATION through DONE with all transitions, reviews, and state persistence | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 48 | Integration test: FSPEC skip path — feature with skipFspec=true skips FSPEC phases | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 49 | Integration test: fullstack fork/join — parallel TSPEC creation and review with composite reviewer keys | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 50 | Integration test: revision loop with mixed outcomes — one rejection + one approval in same round, author receives all feedback; rejection → revision → re-review → approval | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 51 | Integration test: revision bound escalation — 4 rejections → pause via ROUTE_TO_USER → developer resume via `processResumeFromBound()` → fresh review cycle → approval → advance | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 52 | Integration test: backward compatibility — unmanaged feature (no state record) routes via existing RoutingEngine, PdlcDispatcher not invoked | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |
| 53 | Integration test: state persistence and recovery — persist state, simulate restart, verify recovery via `getNextAction()` | `ptah/tests/integration/orchestrator/pdlc-lifecycle.test.ts` | (multiple source files) | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

## 3. Task Dependency Notes

```
Phase A (Tasks 1-5): Infrastructure + test doubles — no dependencies
  │  Task 5 (FakeStateStore) depends on Task 1 (StateStore protocol)
  │
  ▼
Phase B (Tasks 6-25): Pure functions — depends on Phase A types
  │  Tasks 6-15 (state-machine) depend on Task 1 (types)
  │  Tasks 16-18 (review-tracker) depend on Task 1 (types)
  │  Tasks 19-21 (cross-review-parser) depend on Task 1 (types)
  │  Tasks 22-24 (context-matrix) depend on Task 1 (types)
  │  Task 25 (migrations) depends on Task 1 (types)
  │  Within Phase B, modules are independent of each other.
  │
  ▼
Phase C (Tasks 26-29): State store — depends on Tasks 1-3, 5 (types + FileSystem + FakeStateStore)
  │  Also depends on Task 25 (migrations) for load() migration path.
  │
  ▼
Phase D (Tasks 30-38): PdlcDispatcher — depends on ALL of Phases B and C
  │  Uses state-machine, review-tracker, cross-review-parser,
  │  context-matrix as imported pure functions.
  │  Uses FakeStateStore from Task 5 for testing.
  │
  ▼
Phase E (Tasks 39-53): Integration — depends on Phase D
  │  Task 39 (FakePdlcDispatcher) must precede Tasks 40-46.
  │  Tasks 40-46 modify existing orchestrator code.
  │  Tasks 47-53 are integration tests exercising the full stack.
```

## 4. Integration Points

| Existing File | Change | Risk |
|---|---|---|
| `ptah/src/orchestrator/orchestrator.ts` | Add `pdlcDispatcher` to `OrchestratorDeps`, modify `executeRoutingLoop()` to branch on managed vs. unmanaged features | High — core routing loop. Must preserve backward compatibility for unmanaged features. Extensive existing test coverage must remain green. |
| `ptah/src/orchestrator/context-assembler.ts` | Add optional `contextDocuments` parameter to `assemble()` | Low — backward-compatible addition. Existing tests unaffected when param is omitted. |
| `ptah/src/services/filesystem.ts` | Add `rename()` and `copyFile()` to `FileSystem` interface + `NodeFileSystem` | Medium — all existing `FakeFileSystem` consumers need the new methods (even as no-ops). |
| `ptah/tests/fixtures/factories.ts` | Add `FakeStateStore`, `FakePdlcDispatcher`, extend `FakeFileSystem` | Low — additive changes to test infrastructure. |
| `ptah/.gitignore` | Add `state/` directory | None — trivial. |

## 5. Definition of Done

- [ ] All 53 tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (REQ-SM-01 through REQ-CA-03)
- [ ] Implementation matches TSPEC v1.2 (protocols, algorithms, error handling, test doubles)
- [ ] Existing tests remain green (no regressions) — particularly `orchestrator.test.ts`, `context-assembler.test.ts`, `filesystem.test.ts`
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
- [ ] Pure function modules have zero I/O dependencies (state-machine, review-tracker, cross-review-parser, context-matrix)
- [ ] StateStore and PdlcDispatcher use protocol-based dependency injection
- [ ] State file atomic write verified (no partial-write states)
- [ ] Backward compatibility verified: unmanaged features use existing RoutingEngine path

**Scope note:** REQ-SA-01 through REQ-SA-06 (SKILL.md simplification) are deferred to a separate documentation task per TSPEC OQ-01. This PLAN covers the orchestrator code changes only. SKILL.md updates should follow immediately after state machine deployment, before any new features use the PDLC state machine.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Backend Engineer | Initial execution plan — 50 tasks across 5 phases |
| 1.1 | March 14, 2026 | Backend Engineer | Address PM+QA review: reorder test fixtures (QA F-01), add integration tests for revision bound resume (QA F-02), backward compatibility (QA F-03), expand edge cases (QA F-05), add SKILL.md deferral note (PM F-03), expand revision loop test for mixed outcomes (QA F-04). 53 tasks. |

---

*End of Document*
