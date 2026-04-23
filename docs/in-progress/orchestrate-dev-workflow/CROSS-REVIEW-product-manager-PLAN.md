# Cross-Review: product-manager — PLAN

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PLAN-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | REQ-NF-01 (backward compatibility) is not explicitly called out as a testable concern in any task. The Definition of Done lists backward-compat `agentIdToSkillName` cases, but no task owns the corresponding regression tests as a named deliverable. An engineer reading only the task table could omit regression coverage for existing `pm`, `eng`, `qa`, `fe` agent ID callers in `ptah start` paths. The DoD implicitly captures this but a PLAN task should make it explicit. | REQ-NF-01 |
| F-02 | Low | REQ-WF-04 requires that a review phase missing `revision_bound` causes `ptah run` to exit with code 1 and print a validation error identifying the phase. Task 3.1 adds the required-field validator, and task 5.6 references "workflow config load" as a pre-flight check. However, neither task explicitly calls out the acceptance test scenario: "custom YAML with review phase missing `revision_bound` → `ptah run` exits 1 with phase-identifying error message." The on-error user-facing behavior (exact message format, exit code) is not owned by any named test case in the PLAN. | REQ-WF-04 |
| F-03 | Low | REQ-CLI-03 acceptance criteria specify exact output format: phase header line with label (`R`, `F`, etc.) and indented reviewer lines with specific spacing (`  se-review:  Approved ✅`). Task 5.4 references a `PHASE_LABELS` static map but does not enumerate the 7 required entries (R, F, T, P, PT, PTT, IR from FSPEC-CLI-03 Phase Label Map). An implementer working from the PLAN alone without the FSPEC could produce a different label set. Since the format is user-visible and part of the acceptance criteria, this omission is a traceability gap. | REQ-CLI-03 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Task 5.6 says `RunCommand.execute()` performs "workflow config load" as a pre-flight step. Task 5.1 covers `LenientConfigLoader` for `ptah.config.json`. Are both loaders (`LenientConfigLoader` for the Ptah config and `YamlWorkflowConfigLoader` for the workflow YAML) invoked in task 5.6, or is the workflow YAML loader a separate implicit dependency? Clarifying which task owns the workflow YAML load path ensures the validator from task 3.1 is provably exercised by `ptah run`'s pre-flight. |
| Q-02 | Task 4.3 covers the `properties-tests` phase in the default `ptah.workflow.yaml`. Task 3.2 creates the `checkArtifactExists` Activity. REQ-WF-03 specifies that if the PROPERTIES artifact is absent when `properties-tests` runs, the workflow emits a "soft warning" and proceeds. No task explicitly owns that soft-warning behavior — is this intentionally deferred to the `se-implement` agent skill content (which is out of scope per REQ scope boundaries), or does the workflow engine need to surface it in state? |

---

## Positive Observations

- All 25 requirements (18 P0, 6 P1, 1 implicit NF-01) are covered by at least one named task. The traceability from REQ to PLAN task is thorough and unambiguous.
- Phase ordering is correct: P0 cross-review parser changes (Phase 1) gate all downstream phases; types (Phase 2) gate workflow engine (Phase 3); Phases 4 and 5 correctly depend on Phase 3 with Phase 4's light Phase 2 dependency called out explicitly.
- The Definition of Done is unusually precise — 17 checkable criteria map one-to-one to specific REQ acceptance conditions (e.g., exact `agentIdToSkillName` return values, `deriveDocumentType("properties-tests")` = `"PROPERTIES"`, FILE_MANIFEST count = 20). This makes acceptance verification straightforward.
- Out-of-scope items from the REQ (Discord-driven `ptah start` mode, skill content, parallel dispatch changes) are absent from all task descriptions — scope compliance is clean.
- The risk table in Section 11 correctly identifies the three multi-file co-change risks (`SkipCondition`, `buildContinueAsNewPayload`, `FakeTemporalClient` interface drift) and proposes concrete mitigation strategies aligned with the FSPEC's co-change requirements.
- Task 3.5 explicitly tracks `state.activeAgentIds` (add on dispatch, remove on completion) and `state.completedPhaseResults`, which are consumed by `pollUntilTerminal()` in task 5.3 — the data-flow contract between the workflow engine and CLI progress reporter is complete.
- Task 3.6 correctly calls out the removal of the `.filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")` filter, which is required by REQ-CR-07 and FSPEC-CR-01 BR-CR-06.

---

## Recommendation

**Approved with Minor Issues**

> All three findings are Low severity. No P0 or P1 requirement is missing coverage. The plan is safe to implement as written. The Low findings are documentation gaps rather than functional risks: F-01 is mitigated by the DoD, F-02 is mitigated by task 3.1 + task 5.6, and F-03 is resolvable by implementers referencing FSPEC-CLI-03. No rework is required before implementation begins.
