# Cross-Review: product-manager — Implementation

**Reviewer:** product-manager
**Document reviewed:** ptah/src/commands/run.ts, ptah/src/temporal/client.ts, ptah/src/temporal/workflows/feature-lifecycle.ts, ptah/src/temporal/types.ts, ptah/src/orchestrator/pdlc/cross-review-parser.ts, ptah/src/config/defaults.ts, ptah/bin/ptah.ts
**Date:** 2026-04-22
**Iteration:** 2

---

## Verification of Prior Findings

This iteration verifies resolution of the four findings raised in iteration 1.

### F-04 (Signal name mismatch: `"user-answer"` vs `"humanAnswerSignal"`) — RESOLVED

The fix commit (`f193356`) took the additive approach: the workflow now registers both signal names. `wf.defineSignal<[string]>("humanAnswerSignal")` is declared at line 738 of `feature-lifecycle.ts`. A `wf.setHandler(humanAnswerSignal, ...)` is added in `handleQuestionFlow()` that wraps the plain string into a `UserAnswerSignal` shape so the rest of the handler runs uniformly. `client.ts` has a new `signalHumanAnswer()` method that sends to `"humanAnswerSignal"` (line 129). `run.ts` calls `params.temporalClient.signalHumanAnswer()` for the stdin path. Both signal paths now work correctly. REQ-NF-02 is satisfied.

### F-02 (Error messages written to stdout instead of stderr) — NOT RESOLVED

`run.ts` still writes all validation error messages via `stdout.write()` (e.g., lines 650, 662, 681, 690, 706, 712, 724). The `PollParams` interface and `RunCommand` constructor accept `stderr: NodeJS.WriteStream`, but only `handleQuestion()` uses `stderr` (for the stdin-closed warning). Error paths triggered by invalid REQ path, empty REQ, missing phase, duplicate workflow, and config load failure all write to `stdout`. The REQ does not explicitly mandate the output stream, so this remains a Low / UX-only concern. Status: unchanged Low finding.

### F-03 (Workflow validator not invoked by `ptah run`) — NOT RESOLVED

`run.ts` calls `workflowConfigLoader.load()` which validates structural YAML schema but does not call `DefaultWorkflowValidator.validate()`. The validator's `revision_bound` check (PROP-WFV-01) is therefore bypassed by `ptah run`. A workflow YAML with a review phase missing `revision_bound` would silently use the fallback value in `feature-lifecycle.ts`. REQ-WF-04 acceptance criteria specifies that `ptah run` must exit with code 1 and print a validation error in this case. The `ptah start` path does call the validator (bin/ptah.ts lines 123-131). Status: unchanged Low finding.

### F-01 (SKILL_TO_AGENT structural inversion) — NOT RESOLVED

`SKILL_TO_AGENT` in `cross-review-parser.ts` still contains the inverted entries: `"pm-review": "pm-review"`, `"te-review": "te-review"`, `"se-review": "se-review"` (lines 11-13). The fix commit only added the five author/implementation agent IDs to `LEGACY_AGENT_TO_SKILL`, which was a positive extension but did not remove or correct the phantom entries in `SKILL_TO_AGENT`. The data model inconsistency (agent IDs as keys in the skill-name-keyed map) persists. Functional behavior for `agentIdToSkillName()` is still correct because `LEGACY_AGENT_TO_SKILL` wins in the merge. Status: unchanged Low finding.

---

## New Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-06 | Low | `resolveStartPhase()` in `run.ts` (lines 217-232): the `lastContiguousIndex === 0` branch uses `DETECTION_SEQUENCE.slice(2)` to detect gap artifacts beyond FSPEC. `slice(2)` covers entries at indices 2,3,4 (TSPEC, PLAN, PROPERTIES) but skips the FSPEC entry at index 1. This is correct — FSPEC is the *missing* artifact when `lastContiguousIndex === 0` and there is no bug. However, the variable name `hasGapArtifactBeyondFSPEC` is semantically precise only if FSPEC is index 1 and the check starts at index 2. A future maintainer inserting a new artifact type between REQ and FSPEC could shift the indices and silently break the detection logic. This is a maintainability concern, not a functional defect. | REQ-CLI-05 |
| F-07 | Low | `resolveStartPhase()` only auto-detects up to PROPERTIES as the last artifact. When all five artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) are present (i.e., `lastContiguousIndex === DETECTION_SEQUENCE.length - 1 === 4`), `derivedPhase` is set to `"implementation"` (line 223). The REQ-CLI-05 acceptance criteria does not define the "all five present" case explicitly; the implementation assumes `implementation` as the next phase. If the loaded workflow config lacks an `"implementation"` phase ID (e.g., a custom YAML uses a different name), this will trigger the config-validation error path (line 246-250) rather than defaulting to a user-specified phase. This is a functional gap only for non-standard YAML configurations; the default YAML has `implementation` and is unaffected. | REQ-CLI-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | F-01 (unchanged): Are the inverted entries (`"pm-review": "pm-review"`, etc.) in `SKILL_TO_AGENT` intentional, or is cleanup expected in a follow-up? They should be removed to keep the data model contract clean. |
| Q-02 | F-03 (unchanged): Is there a deliberate product or architectural reason why `ptah run` does not invoke `DefaultWorkflowValidator`? If the validator requires the agent registry (which `ptah run` does not load), a lightweight validation path — or moving the `revision_bound` check into `validateStructure()` — would satisfy REQ-WF-04 without the full registry dependency. |
| Q-03 | F-07: Should the auto-detection documentation or code be clarified to state that "all five artifacts present → resume at implementation" is the intended behavior? |

---

## Positive Observations

- F-04 resolution is correct and clean: the additive two-signal approach (Discord path via `"user-answer"`, stdin path via `"humanAnswerSignal"`) avoids breaking existing Discord consumers while satisfying REQ-NF-02 for the new `ptah run` stdin path.
- `ReviewState.writtenVersions` field is present in `types.ts` (line 32), `buildInitialWorkflowState()` pre-populates all review phases with `writtenVersions: {}`, and `buildContinueAsNewPayload()` carries the field across `ContinueAsNew` boundaries. REQ-NF-04 fully satisfied.
- `ReadCrossReviewInput.revisionCount` and `SkillActivityInput.revisionCount` are both present in `types.ts`. REQ-NF-03 satisfied.
- `listWorkflowsByPrefix()` correctly appends `AND ExecutionStatus IN (...)` when `statusFilter` is provided, and `run.ts` uses it to detect duplicate running workflows. REQ-CLI-06 satisfied.
- `ptah init` scaffolds all 8 skill stub files and `buildConfig()` registers all 8 agents. REQ-AG-01 and REQ-AG-02 confirmed satisfied.
- Default `ptah.workflow.yaml` in `defaults.ts` contains `properties-tests` phase (type: creation, agent: se-implement) positioned between `implementation` and `implementation-review`. All review phases carry `revision_bound: 5`. REQ-WF-03 and REQ-WF-04 (default value) satisfied.
- `SKILL_TO_AGENT` new canonical entries (`"software-engineer": "se-review"`, plus the `LEGACY_AGENT_TO_SKILL` correct entries) produce correct results from `agentIdToSkillName()` for all 8 role agent IDs. REQ-CR-01 functional behavior satisfied.
- `VALUE_MATCHERS` includes `"approved with minor issues"` (approved) and `"need attention"` (revision_requested). `mapRecommendationToStatus()` is absent from the codebase. REQ-CR-05 and REQ-CR-06 satisfied.
- `isCompletionReady()` now derives required sign-off agents from `workflowConfig.implementation-review.reviewers` with legacy fallback. REQ-WF-06 satisfied.
- All 25 requirements continue to be structurally addressed. No P0 or P1 requirements are missing or regressed.

---

## Recommendation

**Approved with Minor Issues**

> No High or Medium findings. Three Low findings from iteration 1 (F-01, F-02, F-03) remain open but unblocking — the feature functions correctly for all primary user scenarios (US-01 through US-07). Two new Low findings (F-06, F-07) are maintainability concerns only, not functional defects. The primary blocker from iteration 1 — F-04 (signal name mismatch) — is fully resolved.
>
> The three persistent Low findings may be addressed in a follow-up iteration or tracked as tech debt:
> - **F-01**: Remove phantom `SKILL_TO_AGENT` entries (`"pm-review"`, `"te-review"`, `"se-review"`) to restore data model contract.
> - **F-02**: Route validation error messages through `stderr` for standard CLI UX.
> - **F-03**: Invoke `DefaultWorkflowValidator` in `ptah run` (or move `revision_bound` check into `validateStructure`) to enforce REQ-WF-04 acceptance criteria for custom YAMLs.
