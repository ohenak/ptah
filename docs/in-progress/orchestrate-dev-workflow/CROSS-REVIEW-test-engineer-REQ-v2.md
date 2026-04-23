# Cross-Review: test-engineer — REQ

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Resolution Tracking (v1 Findings)

| v1 ID | Severity | Resolution Status | Notes |
|-------|----------|-------------------|-------|
| F-01 | High | Resolved | Terminal states and exit codes now enumerated in REQ-CLI-01 |
| F-02 | High | Resolved | Canonical detection order, filename pattern, gap-handling, and out-of-order AC added to REQ-CLI-05 |
| F-03 | High | Resolved | SkipCondition discriminated union, `checkArtifactExists` Activity, `FeatureWorkflowState.artifactExists` field, and pre-loop execution order all specified in REQ-WF-05 |
| F-04 | High | Resolved | Explicit REQ-CR-04 → REQ-NF-03 dependency added; `ReadCrossReviewInput` vs `SkillActivityInput` distinction clarified |
| F-05 | High | Resolved | Missing-file silent-skip behavior specified in REQ-CR-07; `writtenVersions` tracking added in REQ-CR-04 |
| F-06 | Medium | Resolved | Empty-file error message added to REQ-CLI-02 |
| F-07 | Medium | Resolved | N defined as total row count in Findings table (all severities) in REQ-CLI-03 |
| F-08 | Medium | Resolved | Full phase list (no `...`) mandated in REQ-CLI-04 |
| F-09 | Medium | Resolved | Slug-consistency assumption captured in A-05 (Assumptions section) |
| F-10 | Medium | Resolved | Old-agent regression cases (`eng`, `qa`, `pm`, `fe`) explicitly listed in REQ-NF-01 AC |
| F-11 | Medium | Resolved | revisionCount ≤ 0 clamped to 1 (no suffix, no error) in REQ-CR-02 |
| F-12 | Medium | Resolved | ROUTE_TO_USER stdin blocking behavior specified in REQ-NF-02 |
| F-13 | Low | Resolved | Missing `revision_bound` = validation error specified in REQ-WF-04 |
| F-14 | Low | Resolved | Reviewer assignment matrix reproduced inline in REQ-WF-02 |
| F-15 | Low | Resolved | Missing PROPERTIES = soft warning specified in REQ-WF-03 |
| F-16 | Low | Resolved | FILE_MANIFEST count note added to REQ-AG-01 (exact count still deferred) |
| F-17 | Low | Resolved | Duplicate workflow check formalized as REQ-CLI-06 with full AC |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | High | REQ-WF-05 specifies that calling `evaluateSkipCondition()` for `artifact.exists` conditions before the pre-loop activity has run "produces a runtime error," but there is no acceptance criterion asserting the error type, message, or observable behavior. A unit test for the pre-call guard cannot assert on the error without knowing what to expect — `throw new Error(...)`, a TypeScript `never` branch, or a returned sentinel are all different test targets. The negative test boundary is undefined. | REQ-WF-05 |
| F-02 | High | REQ-WF-06 changes `isCompletionReady()` to accept the workflow config's `implementation-review` reviewers list instead of hard-coded `signOffs.qa` and `signOffs.pm`. The existing unit tests for `isCompletionReady()` in `feature-lifecycle.test.ts` only call the function with a single `signOffs` argument — they have no config argument. The new signature is not specified in the AC. A test engineer cannot write the replacement unit tests without knowing whether the function signature becomes `isCompletionReady(signOffs, workflowConfig)`, `isCompletionReady(signOffs, requiredAgents: string[])`, or something else. The AC only describes behavior, not the interface. | REQ-WF-06 |
| F-03 | Medium | REQ-CLI-05 specifies auto-detection behavior for a "broken prefix" case (FSPEC absent, TSPEC present) and states the workflow starts at `fspec-creation`. However, the requirement does not specify what happens when `fspec-creation` is not a phase ID in the loaded workflow config (e.g., a custom YAML that only has `req-review` and `tspec-review`). Does auto-detection fall through to `req-review`, fail with an error, or always succeed because it maps only to known phase IDs? The test for a minimal custom YAML cannot be written without this boundary. | REQ-CLI-05 |
| F-04 | Medium | REQ-CR-04 requires `runReviewCycle()` to update `reviewState.writtenVersions[agentId]` after each reviewer invocation. However, the `ReviewState` type definition and its initial state are not specified in the requirements. The AC describes behavior at round 3 but does not describe the initial value of `writtenVersions` — is it `{}` (empty), absent, or pre-populated from prior ContinueAsNew payloads? A test for `writtenVersions` after the first review round cannot assert on state transitions without knowing the initial value. Additionally, `buildContinueAsNewPayload()` currently (per `feature-lifecycle.test.ts`) does not carry `reviewStates`, so `writtenVersions` would be lost across ContinueAsNew boundaries unless explicitly preserved. This cross-boundary behavior is unspecified. | REQ-CR-04 |
| F-05 | Medium | REQ-CLI-06 specifies that `ptah run` queries `listWorkflowsByPrefix("ptah-")` filtered by feature slug. The AC covers the happy path (running workflow → error) and the negative path (no running workflow → proceed). However, it does not specify behavior when the Temporal query itself fails (network timeout, Temporal server down). Does `ptah run` treat a failed query as "no running workflow" (proceed) or as a hard error (exit 1)? This is a distinct failure mode from the duplicate-workflow case and is an untestable gap. | REQ-CLI-06 |
| F-06 | Medium | REQ-NF-02 specifies that when `discord` config is absent and a `ROUTE_TO_USER` state is reached, `ptah run` "waits for stdin input before signalling the workflow to resume." The AC does not specify the stdin prompt format, the signal name used to resume the workflow, or what happens if stdin is closed (pipe or non-interactive terminal). A test simulating non-interactive stdin cannot assert on the failure mode without this specification. | REQ-NF-02 |
| F-07 | Low | REQ-AG-01 states "the exact expected count must be confirmed by counting the full manifest" without providing the confirmed count. The AC says "The total number of files created by `ptah init` matches the updated `FILE_MANIFEST` length" — which is correct but circular. The existing `init.test.ts` assertion `expect(allFileKeys).toHaveLength(18)` must be updated to a specific number. Until the manifest count is confirmed in the REQ, the test update is ambiguous — a TSPEC author must independently count the manifest rather than being able to derive the count from the REQ. | REQ-AG-01 |
| F-08 | Low | REQ-CLI-03 specifies deduplication — "a line is only emitted when phase name, iteration number, or reviewer status changes from the previous poll." The AC example shows a single completed iteration but does not include a test case asserting that polling twice with no state change produces no duplicate output lines. The deduplication contract is described but not given a testable acceptance criterion. | REQ-CLI-03 |
| F-09 | Low | REQ-WF-04 specifies that a review phase with a missing `revision_bound` field causes `ptah run` to exit with code 1 with a validation error identifying the phase. The AC does not specify whether this validation runs at the validator level (`workflow-validator.ts`) or at the CLI level during config parse. The existing `workflow-validator.test.ts` has no `revision_bound` validation tests. Without knowing the validation layer, a test cannot be placed at the correct level — a unit test for the validator vs. an integration test for the CLI. | REQ-WF-04 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-WF-05: What is the exact runtime error produced by calling `evaluateSkipCondition()` with an `artifact.exists` condition before the pre-loop activity completes — a thrown `Error`, a TypeScript compile-time `never` check, or a logged warning with a safe default return? |
| Q-02 | REQ-WF-06: What is the new function signature for `isCompletionReady()`? The AC describes the behavior but does not give the parameter list. |
| Q-03 | REQ-CR-04: What is the initial value of `reviewState.writtenVersions` when a review phase begins for the first time? Is it initialized in `buildInitialWorkflowState()` or lazily on first write? |
| Q-04 | REQ-CLI-06: When the Temporal query to detect running workflows throws an exception (network error, server unreachable), what is the expected behavior of `ptah run`? |
| Q-05 | REQ-NF-02: What is the exact stdin prompt string printed to stdout when a `ROUTE_TO_USER` state is reached without Discord config? What workflow signal name is used to resume? |

---

## Positive Observations

- All 5 High findings from v1 have been fully resolved with precise, testable ACs. The discriminated union specification in REQ-WF-05 is now sufficient to write unit tests for both branches of `evaluateSkipCondition()`. The `checkArtifactExists` Activity boundary is clean — filesystem I/O isolated outside the determinism boundary.
- REQ-CLI-05's canonical detection order with explicit gap-handling ("last contiguous artifact") is now unambiguous. The three acceptance criterion scenarios (full prefix, broken prefix, no artifacts beyond REQ) cover all branching paths at the unit level.
- REQ-CLI-04's fix — "full comma-separated list of all phase IDs from the loaded workflow config" (no `...`) — is now precisely testable with a single string assertion.
- REQ-CR-07's missing-file silent-skip behavior, combined with `writtenVersions` tracking in REQ-CR-04, provides a complete specification for the optimizer context assembly. Both the happy path and the missing-file negative path are now testable.
- REQ-NF-01's old-agent regression cases are now explicitly enumerated in the AC (`eng`, `qa`, `pm`, `fe`), enabling direct parameterized regression tests without spec interpretation.
- The inline reproduction of the Reviewer Assignment Matrix in REQ-WF-02 eliminates the SKILL.md drift risk and provides the exact expected YAML values for snapshot tests.
- A-05 cleanly separates the CLI `startAtPhase` layer from the workflow `skip_if` safety net, resolving Q-03 from v1 and enabling independent unit tests for each layer.

---

## Recommendation

**Need Attention**

> F-01 (missing runtime-error specification for `evaluateSkipCondition()` pre-call guard) and F-02 (undefined `isCompletionReady()` signature change) are High findings that each block a specific test boundary. F-01 prevents writing the guard unit test; F-02 prevents writing any replacement test for the existing `isCompletionReady()` suite in `feature-lifecycle.test.ts`. Both must be resolved before a TSPEC can specify those test cases. Medium findings F-03 through F-06 each leave at least one error or boundary scenario untestable at the unit level.
