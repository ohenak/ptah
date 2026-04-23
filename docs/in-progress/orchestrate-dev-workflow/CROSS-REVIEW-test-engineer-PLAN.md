# Cross-Review: test-engineer — PLAN

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PLAN-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | High | Task 3.2 (`artifact-activity.ts`) lists no test task before it — the task itself produces the new source file and mentions `artifact-activity.test.ts (new)`, but no separate Red-phase test task exists. The PLAN groups both red and green under one row, violating the stated TDD order ("test tasks precede implementation tasks"). The test must be a distinct task (e.g. 3.2a: write failing tests; 3.2b: implement) so the red phase is independently verifiable. | Phase 3 task table, task 3.2 |
| F-02 | High | Task 5.3 (`pollUntilTerminal`) and task 5.4 (`emitProgressLines` / `countFindingsInCrossReviewFile`) are each single rows that bundle Red + Green + specification of complex branching logic. `pollUntilTerminal` alone covers: terminal state detection, `ROUTE_TO_USER` delegation, transient error handling, `lastEmittedState` deduplication, `lastTrackedPhaseId` transition tracking, and `completedPhaseResults`-based per-phase emission. Bundling all of this into one test task makes it impossible to confirm TDD order or identify which branch is under test when a task fails. Each distinct behavior should be a separate test task. | Phase 5 task table, tasks 5.3 and 5.4 |
| F-03 | High | No integration test task exists anywhere in the plan for the end-to-end `ptah run` path: REQ file validation → slug derivation → config load → `resolveStartPhase` → duplicate check → workflow start → progress polling. The TSPEC specifies these cross-module interactions as the critical path; each boundary crossing (CLI → Temporal client, CLI → filesystem, CLI → workflow config loader) should have at least one integration test. Lower-level unit tests cannot substitute because the error surfacing from `listWorkflowsByPrefix` into `RunCommand.execute()` is a cross-module boundary. | Phase 5 overall; TSPEC Section 6.3 |
| F-04 | High | The definition of done (Section 10) has no test-passage entry for the new `artifact-activity.test.ts` file (task 3.2). The DoD bullet list references the static-scan test for `mapRecommendationToStatus`, the `FakeTemporalClient` compile check, and various AC assertions — but does not state "all tests in `artifact-activity.test.ts` pass". A test file that is never mentioned in the DoD can be omitted without the DoD being violated. | Section 10 |
| F-05 | Medium | Task 2.5 (`FakeTemporalClient`) is a test fixture task, not a test task — it extends the fake without specifying what behavioral assertions should be verified in `factories.test.ts`. The task says "add `signalHumanAnswer()` method", "extend `listWorkflowsByPrefix()`", and "add `workflowStatuses` field", but does not specify that tests must assert: (a) `signalHumanAnswer` records calls to `humanAnswerSignals`, (b) `listWorkflowsByPrefix` with `statusFilter` filters correctly, (c) `listWorkflowsByPrefix` without `statusFilter` returns all IDs unchanged. These are behaviorally critical properties of the fake that must be tested in isolation before the fake is used across Phase 3–5 tests. | Phase 2, task 2.5 |
| F-06 | Medium | Task 3.9 (`TemporalClientWrapper` extensions) includes production source changes (`client.ts`) and worker registration (`bin/ptah.ts`) but its test file is `client.test.ts` only. There is no test task for verifying that `checkArtifactExists` is registered in the worker — `bin/ptah.ts` worker registration is listed as a source file change but has no corresponding test coverage task. Worker mis-registration is a silent runtime failure; a compilation-or-structure test should assert the activity is included in the worker activities list. | Phase 3, task 3.9; Section 9 integration points |
| F-07 | Medium | Tasks 1.1 and 1.4 together constitute a breaking refactor of `parseRecommendation()` (accepting extracted value instead of full content) and a matching update to the activity. However, there is no explicit test task that verifies backward-compat for the `extractRecommendationValue()` extraction path — specifically that the heading-scan logic (HEADING_PATTERN, BOLD_PATTERN, code-fence skipping) produces the same extracted string as the old monolithic `parseRecommendation()` did on the same inputs. Regression-protecting the extraction logic is its own unit test concern, separate from testing VALUE_MATCHERS. | Phase 1, tasks 1.1 and 1.4; FSPEC-CR-02; TSPEC Section 5.4 |
| F-08 | Medium | Task 3.5 (`runReviewCycle()` revision threading) bundles five distinct behaviors — `currentRevision` computation, `revisionCount` injection into `invokeSkill`, `writtenVersions` update, `readCrossReviewRecommendation` call with revision count, `activeAgentIds` tracking, and `completedPhaseResults` setting. Each is an independently testable property. With all changes in one row, a failing test in CI gives no signal about which of these six behaviors broke. The task should be split into at minimum two tasks: (a) revision count threading and `writtenVersions` tracking, and (b) `activeAgentIds` / `completedPhaseResults` lifecycle. | Phase 3, task 3.5 |
| F-09 | Medium | The plan has no test task for the `resolveStartPhase()` auto-detection edge case where a feature folder has artifacts beyond a gap (e.g., FSPEC absent, TSPEC present). Task 5.2 mentions "all 7 scenarios from the phase map table (Section 6.4 of TSPEC)" but does not explicitly confirm each scenario has a named test case. Given that the gap detection logic (BR-CLI-08: contiguity broken at the gap) is a subtle invariant, each of the 7 scenarios from the FSPEC phase map table (AT-CLI-02-A through AT-CLI-02-F plus the gap case) must each be a named test case in `run.test.ts`. The plan task is too terse to guarantee these scenarios will be independently covered. | Phase 5, task 5.2; FSPEC-CLI-02 |
| F-10 | Low | Task 3.8 includes a static-scan test that asserts `feature-lifecycle.ts` source does not contain `"mapRecommendationToStatus"`. This test is good, but the plan does not include a corresponding static-scan task asserting no file in the codebase (other than the parser file and its test) references `extractRecommendationValue` as a public export — the refactor moves extraction to a private helper but the plan does not confirm the function is not accidentally exported. This is a low-risk oversight that could be caught by TypeScript, but is worth naming explicitly. | Phase 3, task 3.8; Phase 1, task 1.1 |
| F-11 | Low | Task 4.3 verifies the default `ptah.workflow.yaml` template contains "all 19 phases, `revision_bound: 5` on all review phases, and `skip_if` on `req-creation`". The test file listed is `defaults.test.ts`. However, the DoD (Section 10) mentions the template check for `revision_bound` but does not list a DoD entry that checks `skip_if` on `req-creation` is present in the template. The DoD and the task description are slightly out of sync. | Phase 4, task 4.3; Section 10 |
| F-12 | Low | Task 5.5 (`handleQuestion()`) lists stdin/stdout injection as the testable surface but does not mention a test case for the explicit flush-before-read contract (BR-CLI-20: `process.stdout.write` with callback before stdin read begins). This is a subtle concurrency-adjacent behavior that the FSPEC explicitly calls out with a unit test assertion pattern — the plan task should reference it so the implementer knows to include this assertion. | Phase 5, task 5.5; FSPEC-CLI-04 BR-CLI-20, AT-CLI-04-A |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Task 3.4 states the pre-loop scan uses `startToCloseTimeout: "30 seconds"` and `retry: { maximumAttempts: 2 }`. Is there a test task that verifies the activity proxy is registered with exactly these retry settings? Temporal SDK does not enforce this at compile time; a test that asserts the proxy options would prevent silent mis-configuration. |
| Q-02 | Task 2.5 extends `FakeTemporalClient` with `workflowStatuses: Map<string, string>`. Is there a test in `factories.test.ts` (or a Phase 3/5 test) that populates this map and asserts `listWorkflowsByPrefix` with `statusFilter: ["Running"]` returns only the running workflow? This is the critical behavior used by `RunCommand` for the duplicate-workflow check. |
| Q-03 | Phase 5 task 5.6 wires `RunCommand.execute()` and updates `ptah.ts`. The plan lists both `run.test.ts` and `run.ts` / `bin/ptah.ts` in the same task row. Does `ptah.ts` wiring have its own test coverage within 5.6, or is it tested only indirectly through the integration tests that are absent from the plan (see F-03)? |
| Q-04 | The `completedPhaseResults` field is set by the workflow (task 3.5) and read by `pollUntilTerminal()` (task 5.3). Is there a plan task that explicitly tests the end-to-end contract between these two: workflow sets `completedPhaseResults["req-review"] = "passed"` → `pollUntilTerminal()` emits `[Phase R — REQ Review] Passed ✅`? This cross-phase boundary is the most likely place for an integration regression. |

---

## Positive Observations

- The phase dependency diagram in Section 3 is clear and accurate. It correctly surfaces that Phase 3 tasks 3.1 and 3.2 must complete before 3.3–3.8, providing a natural test-ordering constraint that an implementer can follow.
- The DoD section (Section 10) is unusually thorough for a PLAN document — including compiler-level checks (TypeScript compilation, `FakeTemporalClient` interface compliance) alongside test-passage criteria. The static-scan test for `mapRecommendationToStatus` is a particularly good testing practice that provides a regression net beyond the type system.
- Task 1.3 (`crossReviewPath()` versioning) correctly covers negative-input clamping (`revisionCount ≤ 0` → 1) as a test boundary, matching the corresponding REQ-CR-02 acceptance criterion.
- The risk notes in Section 11 accurately identify the most brittle co-change areas (`SkipCondition` type change, `FakeTemporalClient` interface drift, `buildContinueAsNewPayload` fixture shape) and suggest the correct mitigation (same-commit co-changes, fixture-first updates). This directly reduces the probability of a phase partially passing tests while leaving semantics wrong.
- Task 3.1 correctly identifies `revision_bound` validation as a Phase 3 sub-task inside the workflow validator, matching the REQ-WF-04 requirement that a missing `revision_bound` on a review phase is a validator error — not a runtime default.

---

## Recommendation

**Need Attention**

Three High findings must be resolved before implementation begins:

- **F-01:** Split task 3.2 into a Red task (write failing tests for `checkArtifactExists`) and a Green task (implement the activity). The current single row violates the TDD order stated in Section 1.
- **F-02:** Split tasks 5.3 and 5.4 into discrete test tasks, one per behavior (deduplication, terminal state handling, `ROUTE_TO_USER` delegation, per-phase transition emission, finding count). The current bundling makes TDD order unverifiable.
- **F-03:** Add at least one integration test task to Phase 5 covering the `RunCommand.execute()` happy path end-to-end using real module interactions (real `resolveStartPhase`, real `FakeTemporalClient`, real `FakeFileSystem`). Unit tests of individual helpers do not cover the cross-module error-propagation paths.
- **F-04:** Add a DoD entry: "All tests in `artifact-activity.test.ts` pass."

The four Medium findings (F-05 through F-09) should be addressed in the same revision pass: annotate task 2.5 with required behavioral assertions for `FakeTemporalClient`, add a worker-registration test for task 3.9, add a `extractRecommendationValue` regression test task for task 1.4, and confirm task 5.2 names all 7 auto-detection scenarios as distinct test cases.
