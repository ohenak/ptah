# Execution Plan: Temporal Integration Completion

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-temporal-integration-completion](TSPEC-temporal-integration-completion.md) |
| **Requirements** | [REQ-temporal-integration-completion](REQ-temporal-integration-completion.md) |
| **Functional Specifications** | [FSPEC-temporal-integration-completion](FSPEC-temporal-integration-completion.md) |
| **Date** | 2026-04-08 |
| **Status** | Draft |

## 1. Summary

Complete the "Phase G" integration layer by wiring existing components together: fix `evaluateSkipCondition`, resolve context document templates at dispatch sites, replace the `routingSignalType`-based recommendation proxy with a file-based `readCrossReviewRecommendation` activity, fix the fork/join double-invocation bug, and restructure `handleMessage()` for Discord → Temporal routing (workflow start, user answers, retry/cancel/resume).

## 2. Task List

### Phase A: Foundation — Types, Fakes, and Pure Functions

These tasks have no implementation dependencies and are consumed by all subsequent phases.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Add `PhaseStatus` extension (`"revision-bound-reached"`), `ReadCrossReviewInput`, and `CrossReviewResult` types | `tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/types.ts` | ✅ Done |
| A2 | Add `deriveDocumentType()` pure function | `tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| A3 | Fix `SKILL_TO_AGENT` mapping (`"backend-engineer"` → `"engineer"`) | `tests/unit/orchestrator/cross-review-parser.test.ts` | `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | ✅ Done |
| A4 | Extend `FakeTemporalClient` with `queryWorkflowState` (Map-based + global error injection) | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase B: Skip Condition Fix (REQ-SC-01, REQ-NF-02)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | Fix `evaluateSkipCondition` to strip `config.` prefix | `tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |

### Phase C: Cross-Review Activity (REQ-RC-02)

Depends on: A2 (deriveDocumentType), A3 (SKILL_TO_AGENT fix)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | Create `readCrossReviewRecommendation` activity — approved path | `tests/unit/temporal/cross-review-activity.test.ts` | `ptah/src/temporal/activities/cross-review-activity.ts` | ✅ Done |
| C2 | `readCrossReviewRecommendation` — revision_requested path | `tests/unit/temporal/cross-review-activity.test.ts` | `ptah/src/temporal/activities/cross-review-activity.ts` | ✅ Done |
| C3 | `readCrossReviewRecommendation` — parse_error paths (file not found, unknown agent, unrecognized value, empty file) | `tests/unit/temporal/cross-review-activity.test.ts` | `ptah/src/temporal/activities/cross-review-activity.ts` | ✅ Done |
| C4 | Register `readCrossReviewRecommendation` in `WorkerActivities` interface | — (type-only change, validated by C1-C3 compilation) | `ptah/src/temporal/worker.ts` | ✅ Done |

### Phase D: Context Document Resolution (REQ-CD-01, REQ-CD-02)

Depends on: A2 (deriveDocumentType)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Add `resolvedContextDocumentRefs` to `BuildInvokeSkillInputParams` and update `buildInvokeSkillInput` | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D2 | Fix `documentType` derivation in `buildInvokeSkillInput` (use `deriveDocumentType`) | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D3 | Call `resolveContextDocuments()` in `dispatchSingleAgent` before `buildInvokeSkillInput` | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D4 | Call `resolveContextDocuments()` in `dispatchForkJoin` before `buildInvokeSkillInput` | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D5 | Call `resolveContextDocuments()` in `runReviewCycle` before `buildInvokeSkillInput` | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D6 | Pass `contextDocumentRefs`, `taskType`, `documentType` to `contextAssembler.assemble()` in `invokeSkill` activity | `tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |

### Phase E: Review Cycle Integration (REQ-RC-01)

Depends on: C1-C4 (cross-review activity), A2 (deriveDocumentType)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Add `readCrossReviewRecommendation` proxy to workflow (`proxyActivities` with 30s timeout) | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ⬚ Not Started |
| E2 | Replace `routingSignalType` proxy in `runReviewCycle` with `readCrossReviewRecommendation` activity call | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ⬚ Not Started |
| E3 | Handle `parse_error` result in review cycle (enter `handleFailureFlow`) | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ⬚ Not Started |
| E4 | Fix cross-review refs in revision dispatch (use `agentIdToSkillName` + `crossReviewPath` + `deriveDocumentType`) | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ⬚ Not Started |
| E5 | Set `phaseStatus = "revision-bound-reached"` before resume/cancel wait | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ⬚ Not Started |

### Phase F: Fork/Join Fix (REQ-FJ-01)

No dependencies beyond existing code.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Remove redundant `invokeSkill` call in `dispatchForkJoin` ROUTE_TO_USER handling; use `questionResult` directly | `tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |

### Phase G: Discord Routing (REQ-DR-01, REQ-DR-02, REQ-DR-03)

Depends on: A1 (PhaseStatus), A4 (FakeTemporalClient extension). Phase 1 must be complete before these are tested end-to-end.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Add `parseUserIntent()` pure function | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G2 | Add `containsAgentMention()` private method | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G3 | Add `startNewWorkflow()` private method | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G4 | Add `handleStateDependentRouting()` — user-answer routing (`waiting-for-user` state) | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G5 | Add `handleIntentRouting()` — retry/cancel/resume with state-action validation and hints | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G6 | Restructure `handleMessage()` — workflow existence check first, branch A (ad-hoc + state-dependent), branch B (agent mention + start) | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| G7 | `handleMessage()` — fail-silent on Temporal query failure (non-WorkflowNotFoundError) | `tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |

### Phase H: Integration Tests (REQ-NF-01)

Depends on: All previous phases complete.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| H1 | Integration test: review cycle with `readCrossReviewRecommendation` activity producing approved/revision_requested | `tests/integration/temporal/workflow-integration.test.ts` | — (test only) | ⬚ Not Started |
| H2 | Integration test: context document resolution from template strings through to assembler | `tests/integration/temporal/workflow-integration.test.ts` | — (test only) | ⬚ Not Started |
| H3 | Integration test: Discord message → Temporal signal routing (workflow start, user-answer, retry-or-cancel) | `tests/integration/temporal/workflow-integration.test.ts` | — (test only) | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

## 3. Task Dependency Notes

```
Phase A (foundation) ─── no deps, all tasks parallelizable
  A1 (types)  ────────────────────────────────────────────────┐
  A2 (deriveDocumentType) ───────────────────────────────────┤
  A3 (SKILL_TO_AGENT fix) ──────────────────────────────────┤
  A4 (FakeTemporalClient) ──────────────────────────────────┤
                                                              │
Phase B (skip condition) ← A1                                │
  B1 ← A1 (types needed for compilation only)                │
                                                              │
Phase C (cross-review activity) ← A2, A3                     │
  C1-C3 ← A2 (deriveDocumentType used in workflow,           │
              but activity itself uses parser functions),      │
         ← A3 (SKILL_TO_AGENT mapping must be correct)       │
  C4 ← C1 (type registration after implementation)           │
                                                              │
Phase D (context docs) ← A2                                  │
  D1 ← A2 (deriveDocumentType used in D2)                    │
  D2 ← D1 (field must exist first)                           │
  D3-D5 ← D1 (resolvedContextDocumentRefs param exists)      │
  D6 ← D1 (contextDocumentRefs flows from workflow → activity)│
                                                              │
Phase E (review cycle) ← C1-C4, A2                          │
  E1 ← C4 (activity must be registered)                      │
  E2-E3 ← E1 (proxy must be available)                       │
  E4 ← A3 (agentIdToSkillName correct), A2                   │
  E5 ← A1 (PhaseStatus type)                                 │
                                                              │
Phase F (fork/join) ← no strict deps                         │
  F1 — standalone fix                                         │
                                                              │
Phase G (Discord routing) ← A1, A4                           │
  G1 ← none (pure function)                                   │
  G2 ← none (uses AgentRegistry)                              │
  G3 ← none (uses existing startWorkflowForFeature)           │
  G4 ← A1 (PhaseStatus for state matching)                    │
  G5 ← G1 (parseUserIntent), A1 (PhaseStatus)                │
  G6 ← G1-G5 (all methods must exist), A4 (fake for tests)   │
  G7 ← G6 (handleMessage must be restructured first)          │
                                                              │
Phase H (integration tests) ← all above                      │
  H1 ← C1-C4, E1-E5                                          │
  H2 ← D1-D6                                                  │
  H3 ← G1-G7                                                  │
```

**Parallelization opportunities (within each phase):**
- A1, A2, A3, A4 can all run in parallel
- B1 and F1 can run in parallel (independent fixes)
- C1-C3 can run sequentially within one commit (same file, progressive behavior)
- D1-D2 are sequential, D3-D5 can run in parallel after D1
- G1-G3 can run in parallel (independent methods), G4-G5 depend on G1
- H1, H2, H3 can run in parallel

## 4. Integration Points

### Existing Code Affected

| File | Change | Risk |
|------|--------|------|
| `ptah/src/temporal/types.ts` | Add `PhaseStatus` value, 2 new interfaces | Low — additive only |
| `ptah/src/temporal/workflows/feature-lifecycle.ts` | Multiple function modifications | Medium — largest change surface |
| `ptah/src/temporal/activities/skill-activity.ts` | Add 3 fields to `assemble()` call | Low — interface already supports them |
| `ptah/src/temporal/worker.ts` | Add activity to `WorkerActivities` | Low — additive only |
| `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | Fix one mapping entry | Low — data fix |
| `ptah/src/orchestrator/temporal-orchestrator.ts` | Complete `handleMessage()` restructure | Medium — behavioral change in message handling |
| `ptah/tests/fixtures/factories.ts` | Extend `FakeTemporalClient` | Low — additive only |

### New Files

| File | Purpose |
|------|---------|
| `ptah/src/temporal/activities/cross-review-activity.ts` | New activity for reading cross-review files |
| `ptah/tests/unit/temporal/cross-review-activity.test.ts` | Unit tests for new activity |
| `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | Unit tests for restructured handleMessage |

### Composition Root

The composition root that wires activities for the Temporal Worker must be updated to include `createCrossReviewActivities({ fs, logger })`. This is done as part of task C4 / E1.

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria
- [ ] Implementation matches TSPEC (protocols, algorithm, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
