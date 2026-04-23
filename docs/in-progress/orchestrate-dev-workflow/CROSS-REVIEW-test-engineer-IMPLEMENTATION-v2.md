# Cross-Review: test-engineer — Implementation

**Reviewer:** test-engineer
**Document reviewed:** `feat-orchestrate-dev-workflow` branch (commit f193356)
**Date:** 2026-04-22
**Iteration:** 2

---

## Review Scope

This is iteration 2 of the final codebase review. It focuses on whether the High and Medium findings from iteration 1 (`CROSS-REVIEW-test-engineer-IMPLEMENTATION.md`) were resolved in commit `f193356`.

Source of truth:
- `docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md` (v1.3)
- `docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md` (v1.2)

---

## Resolution Verification

### F-01 (High — PROP-CNP-05): checkArtifactExists registration test strengthened?

**Resolved.** The test in `client.test.ts` (lines 524–534) was strengthened. The new test `"checkArtifactExists token appears within the activities registration block in bin/ptah.ts (PROP-CNP-05)"` uses the regex `/activities\s*:\s*\{[\s\S]{0,2000}checkArtifactExists/` to assert the token appears within the `activities: { ... }` block, not merely anywhere in the file. This satisfies the structural parse requirement from PROP-CNP-05.

### F-02 (High — PROP-RWV-01/02): writtenVersions initialization functional test added?

**Resolved.** A new `describe` block `"buildInitialWorkflowState — writtenVersions initialized per review phase (PROP-RWV-01, PROP-RWV-02)"` was added to `feature-lifecycle.test.ts` (lines 674–764). It includes three tests: one that calls `buildInitialWorkflowState()` with a config containing two review phases (`req-review`, `fspec-review`) and asserts each `reviewStates[phaseId].writtenVersions` equals `{}`; one that asserts `revisionCount` starts at 0 alongside `writtenVersions: {}`; and one that asserts non-review phases (type: `creation`) do not receive a `reviewStates` entry. The multi-phase functional assertion directly satisfies PROP-RWV-02.

### F-03 (High — PROP-INIT-08): Reviewer assignment matrix test added?

**Resolved.** A new `describe` block `"FILE_MANIFEST — PROP-INIT-08: reviewer assignment matrix in ptah.workflow.yaml"` was added to `defaults.test.ts` (lines 204–277). It parses the `FILE_MANIFEST["ptah.workflow.yaml"]` content using `js-yaml` and asserts the exact `agent` and `reviewers.default` values for all 8 phases: `req-review`, `fspec-review`, `tspec-review`, `plan-review`, `properties-review`, `implementation`, `properties-tests`, and `implementation-review`. All assertions use structured equality (not `toContain` string matching), satisfying the "must exactly match" contract of PROP-INIT-08.

### F-04 (Medium — PROP-SC-08): Negative test for checkArtifactExists not called in main loop?

**Resolved.** The test `"checkArtifactExists is NOT called inside the main while(true) phase loop — only in the pre-loop scan (PROP-SC-08)"` (line 1122) was added to `feature-lifecycle.test.ts`. It locates the `"// D2: Main workflow loop"` comment and asserts `checkArtifactExists` does not appear in the source text from that marker to end of file. This is a valid negative property test for PROP-SC-08.

### F-05 (Medium — PROP-RWV-04/06): Functional value assertions for writtenVersions increment/ContinueAsNew?

**Resolved.** Two new `describe` blocks were added to `feature-lifecycle.test.ts`:
- `"PROP-RWV-04: writtenVersions correctly represents round 2 and round 3 values"` (lines 988–1030): calls `buildContinueAsNewPayload()` with a pre-constructed state where `writtenVersions["se-review"] = 2` (round 2) and asserts the payload value equals `2`, not `1` or `0`. A second test asserts `writtenVersions["se-review"] = 3` and `writtenVersions["pm-review"] = 2` for round 3. These are functional value assertions, not static scans.
- `"PROP-RWV-06: ContinueAsNew preserves writtenVersions"` (lines 1032–1064): constructs a pre-transition state with values `{ "se-review": 2, "te-review": 1 }` and `{ "se-review": 1 }` across two review phases, calls `buildContinueAsNewPayload()`, and asserts the payload values are unchanged from the pre-transition state and explicitly not `{}`.

Note: These tests verify the serialization contract of `buildContinueAsNewPayload()` rather than calling `runReviewCycle()` directly. The writtenVersions increment logic inside `runReviewCycle()` is still covered only by static scan (`toContain("writtenVersions")`). This is a residual gap but lower risk than before since the serialization boundary is now verified.

### F-06 (Medium — PROP-MAP-01–09): pm-author/se-author/te-author/tech-lead/se-implement agent ID tests added?

**Resolved.** Five new tests were added to `cross-review-parser.test.ts` (lines 208–227):
- `"maps 'pm-author' to a non-null skill name"` — `agentIdToSkillName("pm-author")` must not be null
- `"maps 'se-author' to a non-null skill name"` — `agentIdToSkillName("se-author")` must not be null
- `"maps 'te-author' to a non-null skill name"` — `agentIdToSkillName("te-author")` must not be null
- `"maps 'tech-lead' to a non-null skill name"` — `agentIdToSkillName("tech-lead")` must not be null
- `"maps 'se-implement' to a non-null skill name"` — `agentIdToSkillName("se-implement")` must not be null

These tests assert the 5 author/lead/implement agent IDs return non-null values. The tests do not assert specific return values (e.g., `"product-manager"` for `pm-author`), only that the mapping exists. This is sufficient to satisfy the REQ-CR-01 coverage requirement that all 8 role agent IDs are mapped.

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Low | `PROP-RWV-04` functional coverage is partially addressed: the new tests verify that `buildContinueAsNewPayload()` correctly serializes pre-constructed `writtenVersions` values of `2` and `3`. However, no test calls `runReviewCycle()` and asserts that the increment from `revisionCount + 1` is correctly stored in `writtenVersions[agentId]` after the call. The static-scan coverage (token `"writtenVersions"` present in `runReviewCycle` body) would not catch a bug such as `writtenVersions[agentId] = currentRevision - 1`. This is the same limitation noted in v1 F-05, now downgraded to Low because the serialization boundary is verified. | PROP-RWV-04, REQ-CR-04 |
| F-02 | Low | `Q-01` from iteration 1 (PROP-SC-05) remains unresolved. `resolveNextPhase()` must NOT catch the error thrown by `evaluateSkipCondition()` for undefined `artifactExists`. No test exists that passes an `artifact.exists` condition with `artifactExists = undefined` to `resolveNextPhase()` and asserts the error propagates uncaught to the caller. The comment range `"PROP-SC-01 through PROP-SC-05"` in `feature-lifecycle.test.ts` does not produce a SC-05 test case — `resolveNextPhase` is not exported and is not tested directly, only `evaluateSkipCondition` is. | PROP-SC-05, REQ-WF-05 |
| F-03 | Low | The `PROP-MAP-06` agent ID test (`pm` → `product-manager`) is covered by the existing `agentIdToSkillName("pm")` test at line 176 of `cross-review-parser.test.ts`. However, there is no test asserting a specific return value for the 5 author/lead/implement IDs (e.g., `pm-author` should map to `"product-manager"`). The `not.toBeNull()` assertion is weaker than PROP-MAP-01-through-03 style assertions which verify exact return values. If the implementation maps `pm-author` to `"frontend-engineer"` (incorrect), the existing test would not catch it. This is acceptable for Low severity because REQ-CR-01's primary contract covers the 3 reviewer agent IDs (`se-review`, `pm-review`, `te-review`) which are tested with exact return values. | PROP-MAP-01–09, REQ-CR-01 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | `PROP-CLI-18` deduplication test `(e)` at line 460 (two polls with identical state emit only one set of lines) now coexists with the new test `(i-prop-cli-18)` that tests the `activeAgentIds = []` → `["pm-author"]` transition. Do both tests pass in the current test run? The test infrastructure (`FakeTemporalClient`) must support the `statusFilter` parameter correctly for the `(i-prop-cli-18)` test to be deterministic. |

---

## Positive Observations

- All three High findings from iteration 1 are fully resolved with appropriate test techniques: structural regex for PROP-CNP-05, multi-phase functional call for PROP-RWV-02, and YAML-parsed structured equality for PROP-INIT-08.
- The PROP-SC-08 negative test correctly uses a source-position sentinel (`"// D2: Main workflow loop"`) to partition the source into pre-loop and in-loop regions. This is a sound technique for the negative property.
- The PROP-RWV-06 `ContinueAsNew` preservation test explicitly asserts `not.toEqual({})` alongside the positive assertion — guarding against the most common regression (reset to empty on resume).
- The 5 author/implement agent ID tests (F-06 resolution) cover the mapping gap that REQ-CR-01 required. Non-null assertions are appropriate here because the exact skill name for author agents is not specified in the PROPERTIES document.
- `countFindingsInCrossReviewFile()` test `(d)` (line 834) closes the integration gap for PROP-CRP-06 by asserting that `writtenVersions["te-review"] = 2` causes the `-v2` path to be read — this directly verifies the integration chain from PROP-CLI-19 through PROP-CRP-06.
- The PROP-CLI-01 happy path test now asserts `startAtPhase` equals `"req-review"` (line 1566), closing the Low finding F-09 from iteration 1.
- The `PROP-BC-01` integration test is non-trivial: it exercises a full `RunCommand.execute()` path with an old 3-agent config (`pm`, `eng`, `qa`), old-format `ptah.workflow.yaml` (`revision_bound: 3`, no `artifact.exists` conditions), and asserts exit code 0, workflow start count, and slug derivation. A second test in the same suite verifies auto-detection resolves `req-review` correctly with the legacy config.

---

## Recommendation

**Approved with Minor Issues**

> All High and Medium findings from iteration 1 are resolved. The three remaining Low findings are acceptable for the current state of the codebase:
>
> **F-01 (Low):** The `runReviewCycle()` writtenVersions increment logic remains covered only by static scan. A functional test calling `runReviewCycle()` directly and asserting `writtenVersions[agentId] === 2` after round 2 would be stronger, but the serialization boundary is now verified.
>
> **F-02 (Low):** `PROP-SC-05` (`resolveNextPhase` must not catch the evaluateSkipCondition error) has no test. Since `resolveNextPhase` is not exported, this requires either exporting it for unit testing or using an integration test through `buildInitialWorkflowState`. This is an acceptable gap for iteration 2.
>
> **F-03 (Low):** Author/lead/implement agent ID mapping tests assert non-null but not exact values. This is appropriate given the PROPERTIES document does not specify exact return values for these IDs beyond "non-null".
>
> The codebase is approved for the next stage. The three Low findings should be addressed in a follow-up properties-tests pass if test completeness is required at 100%.
