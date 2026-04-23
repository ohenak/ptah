# Cross-Review: test-engineer — Implementation

**Reviewer:** test-engineer
**Document reviewed:** `feat-orchestrate-dev-workflow` branch (commits 6581c1d through d202a8b)
**Date:** 2026-04-22
**Iteration:** 1

---

## Review Scope

This review covers the test suite and implementation against:
- Source of truth: `docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md` (v1.3)
- Source of truth: `docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md` (v1.2)
- Key test files as listed in PROPERTIES Section 18 (Test File Mapping)
- All 96 PROPERTIES across 12 domains

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | High | `PROP-CNP-05` is only partially tested. `client.test.ts` asserts `source.toContain("checkArtifactExists")` which passes if the token appears anywhere in `bin/ptah.ts` (including an import or a comment). PROP-CNP-05 explicitly requires the token to appear "within the activities registration block context — specifically within the `proxyActivities()` call or `createWorker({ activities: ... })` call". A targeted regex or structural parse was required. The current test would pass even if `checkArtifactExists` is imported but never registered as an activity. | PROP-CNP-05, REQ-WF-05 |
| F-02 | High | `PROP-RWV-01` and `PROP-RWV-02` are not covered by a direct functional test. PROP-RWV-01 requires asserting that `ReviewState` has a `writtenVersions: Record<string, number>` field on all construction sites; PROP-RWV-02 requires asserting `buildInitialWorkflowState()` initializes `reviewStates[phaseId].writtenVersions` to `{}` for each review phase. The `types.test.ts` tests the type shape in isolation, but no test calls `buildInitialWorkflowState()` with a workflow config containing multiple review phases and asserts that each resulting `reviewStates[phaseId].writtenVersions` is initialized to `{}`. The closest test is in `temporal/workflows/feature-lifecycle.test.ts` which tests for `artifactExists` and `completedPhaseResults` initialization but does not assert on `writtenVersions` initialization per review phase. | PROP-RWV-01, PROP-RWV-02, REQ-NF-04 |
| F-03 | High | `PROP-INIT-08` (reviewer assignment matrix) has no named test verifying the exact matrix. The `defaults.test.ts` tests that `revision_bound: 5` is present on 6 review phases and that the `default:` discipline key is used, but there is no test asserting the per-phase `agent` and `reviewers` values match the exact table from REQ-WF-02 (e.g., `req-review` agent is `pm-author` with reviewers `se-review` and `te-review`; `tspec-review` agent is `se-author` with reviewers `pm-review` and `te-review`; `implementation-review` agent is `se-author` with reviewers `pm-review` and `te-review`). PROP-INIT-08 explicitly states the matrix "must exactly match" — this is a data integrity property with no verification. | PROP-INIT-08, REQ-WF-02 |
| F-04 | Medium | `PROP-SC-08` (checkArtifactExists must NOT be called again during the main phase loop) is stated as covered by the comment `// PROP-SC-07, PROP-SC-08, PROP-SC-09` in the new `feature-lifecycle.test.ts` but the actual test cases only assert presence of `checkArtifactExists` in a `proxyActivities` call and that the scan uses `workflowConfig.phases`. No test verifies the negative property that `checkArtifactExists` is not called a second time inside the loop. This is listed in PROPERTIES Section 16 (Negative Properties) and requires explicit test coverage. | PROP-SC-08, REQ-WF-05 |
| F-05 | Medium | `PROP-RWV-04` (writtenVersions incremented correctly on round 2, round 3) and `PROP-RWV-06` (ContinueAsNew resume preserves writtenVersions, not reset to `{}`) have only static-scan coverage, not functional value assertions. The `PROP-RRC-01/RRC-02/RWV-03` test block scans `runReviewCycle` source for the string `"writtenVersions"` and `"revisionCount + 1"` but does not invoke `runReviewCycle()` and assert that `writtenVersions["se-review"]` equals `2` after a second round. Static scan confirms the token is present but cannot verify the update logic is correct (e.g., it would not catch `writtenVersions[agentId] = currentRevision - 1` as a bug). | PROP-RWV-04, PROP-RWV-06, REQ-CR-04 |
| F-06 | Medium | `PROP-MAP-08` test in `cross-review-parser.test.ts` checks for the `LEGACY_AGENT_TO_SKILL` merge pattern but does not assert that `agentIdToSkillName("pm-author")`, `agentIdToSkillName("se-author")`, `agentIdToSkillName("te-author")`, `agentIdToSkillName("tech-lead")`, and `agentIdToSkillName("se-implement")` return non-null values. REQ-CR-01 requires `AGENT_TO_SKILL` to cover "all 8 role agent IDs" but PROP-MAP-01 through PROP-MAP-09 only cover `se-review`, `pm-review`, `te-review`, plus the 4 legacy IDs. The 4 author/lead/implement agent IDs (`pm-author`, `se-author`, `te-author`, `tech-lead`, `se-implement`) are missing from PROP-MAP coverage — and therefore from the tests. | PROP-MAP-01–09, REQ-CR-01, REQ-AG-02 |
| F-07 | Medium | `PROP-CLI-18` deduplication key includes `activeAgentIds` and `completedPhaseResults` per the v1.2 PROPERTIES spec. The deduplication test at line 460 ("two polls with identical state emit only one set of lines") uses a running state with a fixed `reviewStates` object but does not test that a transition from `activeAgentIds = []` to `activeAgentIds = ["pm-author"]` — with reviewer statuses otherwise unchanged — invalidates the key and causes the optimizer-dispatch line to be emitted. This specific scenario is called out explicitly in PROP-CLI-24 and PROP-CLI-18 and requires a dedicated test case. | PROP-CLI-18, PROP-CLI-24 |
| F-08 | Medium | `PROP-CLI-19` (finding count `N` in `Need Attention (N findings)` equals count of data rows in `## Findings` table; `?` when file unreadable) is partially tested by `countFindingsInCrossReviewFile()` tests. However, no test verifies the integration path where `emitProgressLines()` calls `countFindingsInCrossReviewFile()` using `reviewState.writtenVersions[agentId]` to resolve the versioned path (PROP-CRP-06). The `countFindingsInCrossReviewFile()` unit tests verify the counting logic in isolation, but PROP-CRP-06 specifically requires that the versioned path resolution uses `writtenVersions[agentId]` — this integration assertion is absent. | PROP-CRP-06, PROP-CLI-19, REQ-CLI-03 |
| F-09 | Low | `PROP-CLI-01` (happy path: workflow starts and exits 0) is present as a named test at line 1460 ("happy path: exits 0 when REQ is valid, no duplicate, workflow completes") in `RunCommand.execute()` tests. However, the test does not assert that `startWorkflow` was called with `startAtPhase: "req-review"` specifically — it verifies exit code 0 but not that the workflow was started at the correct phase. REQ-CLI-01 specifies `startAtPhase: "req-review"` as a required AC. | PROP-CLI-01, REQ-CLI-01 |
| F-10 | Low | `PROP-BC-01` requires an integration test verifying `ptah start` continues to operate with the old 3-agent config post-upgrade. The integration test file `run.integration.test.ts` exists but its content was not visible in the worktree used for review. The PROPERTIES Test File Mapping specifies `ptah/tests/integration/commands/run.integration.test.ts (new)` for PROP-BC-01. This property needs confirmation that the test is non-trivial and exercises the legacy `ptah start` path with a 3-agent config, not just a placeholder. | PROP-BC-01, REQ-NF-01 |
| F-11 | Low | `PROP-MAP-09` states "cross-review files written by legacy agents must continue to be parseable after the mapping update". The agentIdToSkillName tests cover the 4 legacy IDs as lookups, but there is no end-to-end test constructing a `crossReviewPath()` using a legacy agent ID via `agentIdToSkillName()` and asserting the path is correctly formed. The property is a contract property but the path-construction integration is untested. | PROP-MAP-09, REQ-NF-01 |
| F-12 | Low | The `parseRecommendation()` API contract changed from accepting full file content to accepting the pre-extracted field value (PROP-PR-06). The existing tests in `cross-review-parser.test.ts` that were passing full file content (the original `describe("parseRecommendation")` block) were replaced, but the in-worktree version still shows the old API. While the new tests correctly call `parseRecommendation("Approved with minor issues")` with extracted values, a test asserting the old full-file-content caller behavior now returns `parse_error` (i.e., negative test: passing full file content returns unrecognized) would close the contract boundary explicitly. | PROP-PR-06, REQ-CR-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | The `PROP-SC-05` property ("resolveNextPhase must NOT catch the error thrown by evaluateSkipCondition for undefined artifactExists — the error must propagate to the Temporal workflow boundary uncaught") requires a test verifying propagation behavior. Is there a test covering this? It was not found in the reviewed test files. |
| Q-02 | `PROP-CRP-05` is mapped to `cross-review-activity.test.ts`. The `revisionCount threading` tests in that file do verify the versioned path reading. However, the test file mapping in PROPERTIES also lists `PROP-CRP-05` as an Integration-level test. Is the `cross-review-activity.test.ts` test intended to serve as both unit and integration coverage, or is a separate integration test planned? |
| Q-03 | `PROP-ICR-07` requires that all existing call sites of `isCompletionReady()` in `feature-lifecycle.ts` are updated to pass `workflowConfig` as the second argument. The static-scan test checks the source for absence of single-argument calls. Has the static scan been confirmed to correctly distinguish single-argument vs two-argument call sites, particularly in cases where the workflowConfig argument might be a variable vs an inline object? |

---

## Positive Observations

- All 7 auto-detection scenarios (T1–T7) are present as individually named tests in `run.test.ts`. The test names are clear and each maps cleanly to a scenario from REQ-CLI-05.
- PROP-PR-09 and PROP-PR-10 (static-scan for `mapRecommendationToStatus` removal and `parseRecommendation` import) are both implemented as dedicated named tests. This is exactly the right technique for verifying removal of a function.
- PROP-SC-06A (`createArtifactActivities()` factory shape contract) is correctly placed in `artifact-activity.test.ts` and tests both the object shape and the function type — guarding against silent Temporal worker registration failure.
- The `PROP-WFV-01` through `PROP-WFV-04` workflow validator tests in `workflow-validator.test.ts` are thorough: they test the valid case (PROP-WFV-02), the missing-artifact field case (PROP-WFV-03), the empty-artifact-string case, and the malformed discriminated union case (PROP-WFV-04).
- The `PROP-ICR-01` through `PROP-ICR-06` block in `workflows/feature-lifecycle.test.ts` is comprehensive, including legacy fallback (PROP-ICR-03), vacuous truth (PROP-ICR-04), and the `computeReviewerList()` derivation path (PROP-ICR-05).
- `crossReviewPath()` revision versioning tests (PROP-CRP-01 through PROP-CRP-04) cover N=1, N=2, N=5, N=0, and negative N — all boundary cases from REQ-CR-02 are exercised.
- PROP-CNP-01 and PROP-CNP-04 are covered with a non-trivial fixture (`writtenVersions: { "se-review": 2 }`) that proves serialization through `buildContinueAsNewPayload()`.
- The `PHASE_LABELS` map test correctly enumerates all 7 expected entries from the spec, including `"properties-tests"` → `"PTT"`.
- TDD discipline is demonstrated: each implementation commit (phases 1–5) has a corresponding test commit (`d202a8b`) that covers the full PROPERTIES document. Phase ordering in the git log is consistent with TDD (tests implemented concurrently with or immediately after implementation).

---

## Recommendation

**Need Attention**

> Three High findings (F-01, F-02, F-03) require test additions before the codebase can be considered fully verified against PROPERTIES-021.
>
> **F-01 (PROP-CNP-05):** The `checkArtifactExists` registration test must be strengthened to assert the token appears within the `proxyActivities` or `createWorker` activities block — not merely anywhere in the file. A regex like `/createWorker[\s\S]*?checkArtifactExists/` or `/proxyActivities[\s\S]{0,500}checkArtifactExists/` would satisfy the structural parse requirement.
>
> **F-02 (PROP-RWV-01, PROP-RWV-02):** A functional test must call `buildInitialWorkflowState()` with a config containing at least two review phases and assert `state.reviewStates["req-review"].writtenVersions` and `state.reviewStates["fspec-review"].writtenVersions` are both `{}`. The current type-level test in `types.test.ts` is necessary but not sufficient.
>
> **F-03 (PROP-INIT-08):** A test must parse `FILE_MANIFEST["ptah.workflow.yaml"]` as YAML and assert the exact `agent` and `reviewers.default` values for all 8 review/creation/implementation phases in the reviewer assignment matrix. A YAML parse + structured assertion (not string contains) is required to satisfy the "must exactly match" contract.
