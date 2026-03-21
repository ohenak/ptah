# Cross-Review: Test Engineer — PLAN

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document** | 014-PLAN-tech-lead-orchestration |
| **Review Date** | 2026-03-21 |
| **Round** | 1 |
| **Recommendation** | **Needs revision** |

---

## 1. Summary

The PLAN is well-structured with clear phase decomposition, thorough task-level detail, and good test file assignments. All 28 requirements from the REQ are traceable to plan tasks. The Definition of Done correctly references all 22 TSPEC §7.5 acceptance test scenarios. However, one Medium-severity finding blocks approval: a factory helper required by Phase B's tests is not assigned to any phase's task list.

---

## 2. Findings

### F-01 — MEDIUM: `makeTechLeadConfig` factory function missing from plan tasks

**Section:** Phase B (Dispatcher Routing), tasks 3–8 and 10–12

**Issue:** TSPEC §7.2 defines a `makeTechLeadConfig` factory helper (lines 576–583) that all 9 Phase B test tasks depend on:

```typescript
function makeTechLeadConfig(overrides?: Partial<FeatureConfig>): FeatureConfig {
  return {
    discipline: "backend-only",
    skipFspec: false,
    useTechLead: true,
    ...overrides,
  };
}
```

This factory is used in every `phaseToAgentId` and `isForkJoinPhase` test case (TSPEC §7.4). However, no task in any phase creates it:

- Phase A tasks 4–8 create config loader test helpers only
- Phase D task 6 creates `makeCommitter`, `makeCommitterWithLock`, `makeMergeBranchParams` — but not `makeTechLeadConfig`
- Phase B has no factory-creation task

Without this task, an engineer implementing Phase B would encounter undefined `makeTechLeadConfig` in the first test they write.

**Required action:** Add a task to Phase B (suggest inserting as B-2, before the test tasks): "Add `makeTechLeadConfig` factory helper to `ptah/tests/fixtures/factories.ts`". This keeps the factory co-located with the phase that first uses it.

---

### F-02 — LOW: Phase A → Phase B dependency may be overstated

**Section:** §3 Task Dependency Notes

**Issue:** The dependency graph declares `Phase A → Phase B` with the annotation "needs FeatureConfig.useTechLead type". However:

- Phase B task 1 adds `useTechLead?: boolean` to `FeatureConfig` in `ptah/src/orchestrator/pdlc/phases.ts`
- Phase A works on `ptah/src/types.ts` and `ptah/src/config/loader.ts`
- Phase B's tests import from `phases.ts` and `pdlc-dispatcher.ts` — neither of which depends on Phase A's `types.ts` additions

If `makeTechLeadConfig` is added to Phase B (per F-01), Phase B becomes fully self-contained. The A→B dependency would be unnecessary, and Phase B could run in Batch 1 alongside A and F — improving parallelism:

**Current batching (3 batches):**
- Batch 1: A, F
- Batch 2: B, C, D
- Batch 3: E

**Potential batching (3 batches, improved):**
- Batch 1: A, B, F
- Batch 2: C, D
- Batch 3: E

This is non-blocking — an unnecessary dependency only costs parallelism, not correctness.

**Suggested action:** Verify whether Phase B genuinely depends on any Phase A output. If not, remove the `A → B` edge from the dependency graph and update the batch analysis.

---

## 3. Positive Observations

- **Complete requirement coverage.** All 28 requirements from the REQ map to plan tasks. Cross-referencing confirmed no orphaned requirements:
  - REQ-PD-01–06 → Phase F tasks 1–6
  - REQ-BD-01–08 → Phase F tasks 10–13, Phase D tasks 8–13
  - REQ-TL-01–05 → Phase B tasks 2–12, Phase F tasks 8–10
  - REQ-PR-01–04 → Phase F task 14
  - REQ-NF-14-01–05 → Phase F tasks 4, 7, 11; Phase B tasks 6–8, 11; Phase C task 3

- **Test files assigned to every testable task.** Unit test tasks correctly reference their test files (`loader.test.ts`, `pdlc-dispatcher.test.ts`, `artifact-committer.test.ts`, `agent-registry.test.ts`). Type-definition-only tasks and SKILL.md tasks correctly omit test files.

- **TSPEC §7.4 test cases fully mapped.** Every test case specified in the TSPEC has a corresponding plan task:
  - Config loader: 4 test cases → Phase A tasks 5–8
  - Dispatcher routing: 6 test cases → Phase B tasks 3–8
  - Fork-join suppression: 3 test cases → Phase B tasks 10–12
  - mergeBranchIntoFeature: 5 test cases → Phase D tasks 9–13
  - Integration wiring: 1 test case → Phase E task 1

- **Test double creation tasks are explicit.** Phase D tasks 4–7 and task 14 explicitly create `FakeMergeLock`, `FakeMergeLockWithTimeout`, extend `FakeGitClient`, and update `FakeArtifactCommitter`. This prevents "where does this fake come from?" confusion during implementation.

- **Phase F decomposition is logical.** The 17 SKILL.md sub-tasks follow the TSPEC algorithm sections (§5.1–§5.10) in a natural implementation order, and the Definition of Done maps each acceptance test scenario range to its corresponding behavioral area.

- **Dependency graph is well-documented.** The ASCII tree visualization and the batch analysis are clear. The fan-out syntax (`Phase A → [Phase B, Phase C, Phase D, Phase E]`) is consistent with the TSPEC's dependency parsing format.

- **Definition of Done is comprehensive.** It includes test pass criteria, regression check, TSPEC conformance, commit hygiene, and — critically — the full acceptance test scenario checklist for SKILL.md validation.

---

## 4. Recommendation

**Needs revision.**

F-01 (Medium) must be addressed: add `makeTechLeadConfig` factory creation as a task in Phase B. Without it, Phase B's tests cannot be implemented as specified in the TSPEC.

F-02 (Low) is optional but worth investigating — removing the A→B dependency would improve parallelism.

Once F-01 is resolved, please route the updated PLAN back for re-review.

---

*Reviewed by: Test Engineer (qa) | 2026-03-21*
