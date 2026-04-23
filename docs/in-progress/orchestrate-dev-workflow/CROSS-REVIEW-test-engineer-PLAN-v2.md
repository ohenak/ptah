# Cross-Review: test-engineer — PLAN

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PLAN-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Resolution Summary (Iteration 1 → Iteration 2)

All four High findings from iteration 1 are resolved. All four Medium findings are resolved. Both Low findings remain partially open (see F-10 and F-11 below). Questions Q-01 through Q-04 are addressed in-line below.

| Prior ID | Severity | Resolution |
|----------|----------|-----------|
| F-01 | High | **Resolved.** Task 3.2 split into 3.2a (Red) and 3.2b (Green). TDD order is now enforced. |
| F-02 | High | **Resolved.** Tasks 5.3 and 5.4 split into 5.3a/5.3b and 5.4a/5.4b with explicit per-behavior test cases enumerated. |
| F-03 | High | **Resolved.** Task 5.7 added — integration test covering `RunCommand.execute()` happy path and duplicate-workflow error propagation. |
| F-04 | High | **Resolved.** DoD entry added: "All tests in `artifact-activity.test.ts` pass." |
| F-05 | Medium | **Resolved.** Task 2.5 now enumerates three required behavioral assertions: `signalHumanAnswer` recording, `statusFilter` filtering, and no-filter backward compat. |
| F-06 | Medium | **Resolved.** Task 3.9 extended with static-structure test asserting `checkArtifactExists` token present in `bin/ptah.ts`; DoD entry added. |
| F-07 | Medium | **Resolved.** Task 1.5 added — explicit regression tests for `extractRecommendationValue()` covering all five extraction scenarios. |
| F-08 | Medium | **Resolved.** Task 3.5 now lists all six behaviors: `currentRevision` computation, `revisionCount` injection, `writtenVersions` update, `readCrossReviewRecommendation` call, `activeAgentIds` tracking, `completedPhaseResults` setting. |
| F-09 | Medium | **Resolved.** Task 5.2 now names all 7 auto-detection scenarios as distinct named test cases (T1–T7) with explicit correspondence to FSPEC-CLI-02 ACs. DoD updated. |
| F-10 | Low | **Partially addressed.** Static-scan test for `mapRecommendationToStatus` remains. No explicit test for `extractRecommendationValue` not being publicly exported. See F-01 below. |
| F-11 | Low | **Partially addressed.** DoD does not include `skip_if` on `req-creation` check. See F-02 below. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Low | Task 1.5 adds regression tests for `extractRecommendationValue()` isolation, but neither task 1.1 nor task 1.5 explicitly states that `extractRecommendationValue` is a **private** helper (not exported). The TSPEC Section 5.4 specifies the function as private, and the prior F-10 from iteration 1 flagged the absence of an export guard test. The plan tasks describe the function's behavior but do not include a test asserting the function is not exported from the module (e.g., a static-import test asserting the named export does not exist on the module surface). Without this, a future refactor that accidentally exports the function goes undetected. The risk is low because TypeScript would typically catch an import-of-private-function pattern, but the TSPEC explicitly calls it private and the PLAN should mirror that constraint. | Phase 1, tasks 1.1 and 1.5 |
| F-02 | Low | The DoD (Section 10) entry for the default `ptah.workflow.yaml` template reads: "Default `ptah.workflow.yaml` template contains all 19 phases, `revision_bound: 5` on all review phases, and `skip_if` on `req-creation`". This is inherited text from the PLAN v1.0 and matches task 4.3. However, the task 4.3 description also states the template should include "`properties-tests` phase between `implementation` and `implementation-review`", yet the DoD does not include a DoD bullet specifically asserting the `properties-tests` phase is correctly positioned (between `implementation` and `implementation-review`, not just present). Given that phase ordering is a test-critical invariant that determines the actual workflow execution sequence — getting the phase present but in the wrong position is a silent bug — the DoD should include "default `ptah.workflow.yaml` has `properties-tests` positioned between `implementation` and `implementation-review`". | Phase 4, task 4.3; Section 10 |
| F-03 | Low | Task 5.7 (integration test) specifies two scenarios: happy path and duplicate-workflow error. However, the task description does not include a scenario for the auto-detection path in `resolveStartPhase()` when run via real module interactions. Tasks 5.2 (unit tests) cover all 7 auto-detection scenarios at unit level, but the integration test does not verify that the auto-detection result correctly propagates into the `startAtPhase` parameter sent to the Temporal workflow start call. This is the cross-module boundary between `resolveStartPhase()` and `RunCommand.execute()`. The current task 5.7 tests only the duplicate-workflow check integration boundary, not the auto-detection → workflow-start boundary. This is a low-risk gap because the unit tests for `resolveStartPhase()` are comprehensive, but the integration test does not close the boundary between these two modules. | Phase 5, task 5.7 |
| F-04 | Low | Task 3.4 specifies the `checkArtifactExists` activity proxy should be registered with `startToCloseTimeout: "30 seconds"` and `retry: { maximumAttempts: 2 }`. The PLAN does not include a test task or DoD entry that verifies these exact retry settings. The task describes both source behavior and test coverage, but the test coverage description in task 3.4 focuses on whether the pre-loop scan populates `state.artifactExists` — it does not enumerate a test case that asserts the proxy was constructed with the correct timeout and retry policy. Silent misconfiguration of Temporal activity options is a runtime-only failure. Task 3.9 includes a similar pattern (static-structure test) for the worker registration, but no analogous test exists for the activity proxy configuration. This was raised as Q-01 in the iteration 1 review and remains open. | Phase 3, task 3.4; Q-01 from iteration 1 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | **Carried from iteration 1, unresolved.** Task 3.4 specifies `startToCloseTimeout: "30 seconds"` and `retry: { maximumAttempts: 2 }` for the `checkArtifactExists` activity proxy. Is there a test verifying these settings are applied? They cannot be caught by the type system and are not covered by any listed test task. |
| Q-02 | Task 3.5 now states `state.completedPhaseResults[phaseId]` is set "on phase exit (passed or revision-bound-reached)". Task 5.3b tests case (g) for the `completed` phase result detection via `pollUntilTerminal()`. Is there also a test in `feature-lifecycle.test.ts` (Phase 3 tasks) that independently verifies the workflow correctly sets `completedPhaseResults["req-review"] = "passed"` when all reviewers approve? The end-to-end `completedPhaseResults` contract spans task 3.5 (write side) and task 5.3b (read side), but only the read side has an explicit test case in the plan. |
| Q-03 | Task 5.6 wires `RunCommand.execute()` including `printHelp()` update. The DoD states "`ptah run --help` (or `ptah` with no args) documents the `run` subcommand". Is there a test for this help text behavior, or is it a manual verification item? If untested, it should be noted as a manual DoD item rather than an assertion in `npm test`. |

---

## Positive Observations

- The iteration 1 → 1.1 revision is thorough. All four High findings were addressed with appropriate structural changes — the Red/Green splits for tasks 3.2, 5.3, and 5.4 correctly enforce TDD order and make failing-test states independently verifiable.
- Task 1.5's five `extractRecommendationValue()` regression test cases (heading-scan, bold-wrapped value, code-fence skip, null on missing heading, multi-line look-ahead) directly address the extraction boundary concerns flagged in iteration 1 and match the TSPEC Section 5.4 specification of the private helper's contract.
- Task 5.7 integration test is correctly scoped: it uses real `resolveStartPhase()`, real `LenientConfigLoader`, `FakeTemporalClient` (not full mocks), and `FakeFileSystem`. The duplicate-workflow error path verification is exactly the cross-module integration boundary that unit tests cannot cover. This is the right approach.
- Task 2.5's three behavioral assertions for `FakeTemporalClient` (`signalHumanAnswer` recording, `statusFilter` filtering, no-filter backward compat) are each testable in isolation, correctly verifying the fake's behavioral contract before Phase 3–5 tests rely on it.
- The DoD section (Section 10) grew from 14 to 21 items and now correctly includes `artifact-activity.test.ts` passage, the static-structure `checkArtifactExists` worker-registration test, and the 7 named auto-detection scenarios. The DoD is now one of the most comprehensive in any PLAN document in this codebase.
- The Change Log (Section 11) precisely identifies which iteration 1 finding each v1.1 change addresses, making iteration traceability clear for future reviewers.

---

## Recommendation

**Approved with Minor Issues**

All High and Medium findings from iteration 1 have been resolved. The remaining four findings are all Low severity. The plan is ready to proceed to implementation.

The Low findings (F-01 through F-04) are worth noting to the implementer:
- **F-01:** Consider adding a test in task 1.5 that asserts `extractRecommendationValue` is not exported from `cross-review-parser.ts` (static import check or module surface assertion).
- **F-02:** Add a DoD bullet asserting `properties-tests` is positioned between `implementation` and `implementation-review` in the default YAML.
- **F-03 and F-04:** These represent accepted risk (covered by iteration 1 questions Q-01 and Q-04 that remain open). They do not block implementation.

None of the Low findings require a revision before implementation begins.
