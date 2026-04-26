# Properties Document

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-021 |
| **Parent Documents** | REQ-021 (v1.3), FSPEC-021 (v1.2), TSPEC-021 (v1.2), PLAN-021 (v1.1) |
| **Version** | 1.2 |
| **Date** | April 22, 2026 |
| **Author** | Senior Test Engineer |
| **Status** | Draft |

---

## 1. Purpose

This document defines the testable system properties for the orchestrate-dev workflow alignment feature. Each property is an invariant, behavioral contract, or quality attribute that must hold once the feature is implemented. Properties are grouped by behavioral domain, classified by test level, and traced to requirements and PLAN tasks.

---

## 2. Property Index

| Domain | Count | Property IDs |
|--------|-------|-------------|
| CLI — ptah run | 24 | PROP-CLI-01 through PROP-CLI-24 |
| SkipCondition Evaluation | 10 | PROP-SC-01 through PROP-SC-09, PROP-SC-06A |
| crossReviewPath Versioning | 6 | PROP-CRP-01 through PROP-CRP-06 |
| parseRecommendation / VALUE_MATCHERS | 10 | PROP-PR-01 through PROP-PR-10 |
| AGENT_TO_SKILL Mapping | 9 | PROP-MAP-01 through PROP-MAP-09 |
| ReviewState.writtenVersions Lifecycle | 7 | PROP-RWV-01 through PROP-RWV-07 |
| runReviewCycle Revision Threading | 6 | PROP-RRC-01 through PROP-RRC-06 |
| isCompletionReady Dynamic Derivation | 7 | PROP-ICR-01 through PROP-ICR-07 |
| buildContinueAsNewPayload Completeness | 4 | PROP-CNP-01, PROP-CNP-03 through PROP-CNP-05 |
| ptah init Scaffold | 8 | PROP-INIT-01 through PROP-INIT-08 |
| Workflow Validator | 4 | PROP-WFV-01 through PROP-WFV-04 |
| Backward Compatibility | 1 | PROP-BC-01 |

**Total: 96 properties**

---

## 3. Domain: CLI — ptah run

### PROP-CLI-01

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run <req-path>` must start a Temporal `featureLifecycleWorkflow` for the feature slug derived from `<req-path>` when the REQ file exists, is non-empty, no duplicate workflow is running, and `ptah.workflow.yaml` is present and valid. This test uses `FakeTemporalClient` (not a real Temporal cluster) and is therefore a unit test. |
| **Category** | Functional |
| **Test Level** | Unit |
| **Test File** | `ptah/tests/unit/commands/run.test.ts` |
| **PLAN Tasks** | 5.6, 5.7 |
| **Requirements** | REQ-CLI-01 |

### PROP-CLI-02

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: REQ file not found: <path>` to stdout and exit with code 1 when the REQ file path does not exist on the filesystem. No Temporal workflow must be started. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-02 |

### PROP-CLI-03

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: REQ file is empty: <path>` to stdout and exit with code 1 when the REQ file exists but contains only whitespace (spaces, tabs, newlines). No Temporal workflow must be started. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-02 |

### PROP-CLI-04

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must derive the feature slug from the parent directory name of the REQ file path (e.g., `docs/in-progress/my-feature/REQ-my-feature.md` → slug `my-feature`). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-01 |

### PROP-CLI-05

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: ptah.workflow.yaml not found in current directory.` to stdout and exit with code 1 when `ptah.workflow.yaml` is absent from the current working directory. No Temporal workflow must be started. This property covers the `YamlWorkflowConfigLoader` catch-and-reformat path described in FSPEC-CLI-01 BR-CLI-06, where `WorkflowConfigError` is caught and reformatted into the context-appropriate headless error message. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-01, FSPEC-CLI-01 (BR-CLI-06) |

### PROP-CLI-06

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: workflow already running for feature "<slug>". Use --from-phase to restart from a specific phase after terminating the existing workflow.` to stdout and exit with code 1 when a Temporal workflow with `Running` or `ContinuedAsNew` status exists for the same feature slug. The test must verify both statuses independently: one test case stubs `FakeTemporalClient.listWorkflowsByPrefix` to return a workflow with `Running` status and asserts the error fires; a second test case stubs `ContinuedAsNew` status and asserts the same error fires. No new workflow must be started in either case. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6, 3.9 |
| **Requirements** | REQ-CLI-06 |

### PROP-CLI-07

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: unable to check for running workflows: <error message>` to stdout and exit with code 1 when the Temporal duplicate-workflow query throws any exception. No workflow must be started. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-06 |

### PROP-CLI-08

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must exit with code 0 when the Temporal workflow reaches `completed` terminal state. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.3a, 5.3b |
| **Requirements** | REQ-CLI-01 |

### PROP-CLI-09

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must exit with code 1 when the Temporal workflow reaches any of the terminal states: `failed`, `revision-bound-reached`, or `cancelled`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.3a, 5.3b |
| **Requirements** | REQ-CLI-01 |

### PROP-CLI-10

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run --from-phase <phase-id>` must start the Temporal workflow with `startAtPhase` equal to `<phase-id>` when the phase ID exists in the loaded workflow config, bypassing auto-detection entirely. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-04 |

### PROP-CLI-11

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run --from-phase <phase-id>` must print `Error: phase "<phase-id>" not found. Valid phases: [<complete comma-separated list of all phase IDs from the loaded config>]` and exit with code 1 when the given phase ID does not exist in the loaded workflow config. The list must not be truncated with `...`. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-04 |

### PROP-CLI-12

| Field | Detail |
|-------|--------|
| **Statement** | Auto-detection must resolve `startAtPhase` to `req-review` with no stdout log message when only the REQ file is present in the feature folder (FSPEC, TSPEC, PLAN, and PROPERTIES are all absent). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-13

| Field | Detail |
|-------|--------|
| **Statement** | Auto-detection must resolve `startAtPhase` to `fspec-creation` and print `Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)` when FSPEC is absent but TSPEC (or any later artifact) is present — breaking contiguity after REQ. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-14

| Field | Detail |
|-------|--------|
| **Statement** | Auto-detection must advance the derived `startAtPhase` to the creation phase for the first missing artifact in the contiguous prefix sequence (REQ → FSPEC → TSPEC → PLAN → PROPERTIES), stopping at the first absent artifact. For a folder with REQ and FSPEC present but TSPEC absent, the derived phase must be `tspec-creation` with log message `Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-15

| Field | Detail |
|-------|--------|
| **Statement** | Auto-detection must resolve `startAtPhase` to `implementation` with log message `Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)` when all five PDLC artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) are present and non-empty in the feature folder. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-16

| Field | Detail |
|-------|--------|
| **Statement** | Auto-detection must print `Error: auto-detected phase "<phase-id>" not found in workflow config. Use --from-phase to specify a valid start phase.` and exit with code 1 when the derived phase ID is absent from the loaded workflow config. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-17

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must treat a zero-byte file or a file containing only whitespace as absent for auto-detection purposes (artifact must be non-empty to count as present). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.2 |
| **Requirements** | REQ-CLI-05 |

### PROP-CLI-18

| Field | Detail |
|-------|--------|
| **Statement** | Progress polling must emit `[Phase <label> — <title>] Iteration <N>` for each new review phase iteration and per-reviewer status lines (`Approved ✅` for `approved`; `Need Attention (<N> findings)` for `revision_requested`). Deduplication must suppress repeat emission when the combined deduplication key is unchanged between consecutive polls. The deduplication key is the 4-tuple: (phase name, iteration number, all reviewer statuses as a sorted key-value string, `activeAgentIds` as a sorted comma-separated string). Additionally, any change to `completedPhaseResults` — specifically, a change in the set of phase IDs present in the map OR a change in any phase's result value — invalidates the key and causes new lines to be emitted even if the 4-tuple is otherwise unchanged. The `completedPhaseResults` predicate is: the set of `{phaseId: result}` pairs serialized as a sorted key-value string must be identical across consecutive polls for deduplication to suppress output. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.3b, 5.4b |
| **Requirements** | REQ-CLI-03 |

### PROP-CLI-19

| Field | Detail |
|-------|--------|
| **Statement** | The finding count `N` in `Need Attention (N findings)` must equal the count of data rows only in the `## Findings` table of the reviewer's cross-review file (excluding header and separator rows). When the file is unreadable or absent, `N` must be reported as `?`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.4a, 5.4b |
| **Requirements** | REQ-CLI-03 |

### PROP-CLI-20

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must use the PHASE_LABELS static map (`req-review` → `R / REQ Review`, `fspec-review` → `F / FSPEC Review`, `tspec-review` → `T / TSPEC Review`, `plan-review` → `P / PLAN Review`, `properties-review` → `PT / PROPERTIES Review`, `properties-tests` → `PTT / Properties Tests`, `implementation-review` → `IR / Implementation Review`) for progress output, falling back to the raw phase ID as both label and title for unknown phase IDs. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.4b |
| **Requirements** | REQ-CLI-03 |

### PROP-CLI-21

| Field | Detail |
|-------|--------|
| **Statement** | When no Discord config is present and the workflow reaches `ROUTE_TO_USER` state, `ptah run` must print `[Question] <question-text>` followed by `Answer: ` (no trailing newline, flushed to stdout before stdin is read via the `process.stdout.write` callback pattern), read one line from stdin, and call `signalHumanAnswer(workflowId, answer)` using signal name `"humanAnswerSignal"`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.5 |
| **Requirements** | REQ-NF-02 |

### PROP-CLI-22

| Field | Detail |
|-------|--------|
| **Statement** | When stdin is closed (EOF) before the engineer provides input in the no-Discord question path, `ptah run` must call `signalHumanAnswer(workflowId, "")` (empty string) and print `Warning: stdin closed before answer was provided; resuming workflow with empty answer.` to stderr (not stdout). |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.5 |
| **Requirements** | REQ-NF-02 |

### PROP-CLI-23

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` progress polling must emit a phase transition line `[Phase <label> — <title>] Passed ✅` when `completedPhaseResults[phaseId] = "passed"` is detected in the workflow state for the first time for a given phase. The line must be emitted exactly once per phase (not repeated on subsequent polls after the phase is already in `completedPhaseResults`). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.3b |
| **Requirements** | REQ-CLI-03 |

### PROP-CLI-24

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` progress polling must emit a phase transition line `[Phase <label> — <title>] Revision Bound Reached ⚠️` when `completedPhaseResults[phaseId] = "revision-bound-reached"` is detected in the workflow state for the first time for a given phase. Additionally, the optimizer-dispatch line `[Phase <label> — <title>] <agent-id> addressing feedback...` must be emitted when all reviewers for a phase are done AND `activeAgentIds` contains at least one agent ID — indicating the author agent is actively addressing feedback. Both lines are governed by the same deduplication key (see PROP-CLI-18): they are emitted only when the combined key (phase name, iteration number, reviewer statuses, `activeAgentIds`, and `completedPhaseResults`) changes. In particular, a transition from `activeAgentIds = []` to `activeAgentIds = ["pm-author"]` — with reviewer statuses and `completedPhaseResults` otherwise unchanged — must change the deduplication key and cause the optimizer-dispatch line to be emitted. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.3b, 5.4b |
| **Requirements** | REQ-CLI-03 |

---

## 4. Domain: SkipCondition Evaluation

### PROP-SC-01

| Field | Detail |
|-------|--------|
| **Statement** | `evaluateSkipCondition()` must return `true` for an `artifact.exists` condition when `artifactExists[condition.artifact]` is `true`, causing the phase to be skipped. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.3 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-02

| Field | Detail |
|-------|--------|
| **Statement** | `evaluateSkipCondition()` must return `false` for an `artifact.exists` condition when `artifactExists[condition.artifact]` is `false`, causing the phase to run. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.3 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-03

| Field | Detail |
|-------|--------|
| **Statement** | `evaluateSkipCondition()` must return `false` for an `artifact.exists` condition when the artifact key is absent from the `artifactExists` map (key not populated by the pre-loop activity). |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.3 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-04

| Field | Detail |
|-------|--------|
| **Statement** | `evaluateSkipCondition()` must throw `Error("evaluateSkipCondition: artifactExists map not yet populated — checkArtifactExists Activity must run before evaluating artifact.exists conditions")` — with the exact message — when called with an `artifact.exists` condition and `artifactExists` argument is `undefined`. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.3 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-05

| Field | Detail |
|-------|--------|
| **Statement** | `resolveNextPhase()` must NOT catch the error thrown by `evaluateSkipCondition()` for undefined `artifactExists`; the error must propagate to the Temporal workflow boundary uncaught. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.3 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-06

| Field | Detail |
|-------|--------|
| **Statement** | The `checkArtifactExists` Temporal Activity must return `true` when the file `<docType>-<slug>.md` exists in the feature folder and is non-empty; must return `false` when the file is absent, empty, or whitespace-only. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.2a, 3.2b |
| **Requirements** | REQ-WF-05 |

### PROP-SC-06A

| Field | Detail |
|-------|--------|
| **Statement** | `createArtifactActivities()` factory must return an object that contains a `checkArtifactExists` property of type `function`. A unit test must call `createArtifactActivities(featurePath)` and assert: (a) the return value is an object (not `undefined` or `null`), and (b) `typeof result.checkArtifactExists === "function"`. This verifies the factory return-shape satisfies the `WorkflowActivities` interface contract expected by the Temporal worker registration in `bin/ptah.ts`. If the factory returns the wrong shape, the activity is silently unregistered at Temporal worker startup — a runtime failure that no type-level check can catch. |
| **Category** | Contract |
| **Test Level** | Unit |
| **Test File** | `ptah/tests/unit/temporal/activities/artifact-activity.test.ts` |
| **PLAN Tasks** | 3.2a |
| **Requirements** | REQ-WF-05 |

### PROP-SC-07

| Field | Detail |
|-------|--------|
| **Statement** | The pre-loop artifact scan in `featureLifecycleWorkflow` must invoke `checkArtifactExists` for every phase in the full workflow config that has an `artifact.exists` skip condition, regardless of the `startAtPhase` value. Phases before `startAtPhase` must still have their artifact existence pre-fetched. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.4 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-08

| Field | Detail |
|-------|--------|
| **Statement** | `checkArtifactExists` must NOT be called again during the main phase loop; the `state.artifactExists` map populated before the loop is used throughout the loop without re-evaluation. |
| **Category** | Idempotency |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.4 |
| **Requirements** | REQ-WF-05 |

### PROP-SC-09

| Field | Detail |
|-------|--------|
| **Statement** | When `startAtPhase` is set to a phase after `req-creation` (e.g., `"implementation"`), `checkArtifactExists` must still be called for `req-creation`'s `artifact.exists` condition — i.e., the pre-loop scan must NOT skip phases that precede `startAtPhase`. A unit test must configure a workflow with `startAtPhase = "implementation"` and assert that `checkArtifactExists` is called for the `"REQ"` artifact (belonging to `req-creation`) before the main loop starts. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.4 |
| **Requirements** | REQ-WF-05 |

---

## 5. Domain: crossReviewPath Versioning

### PROP-CRP-01

| Field | Detail |
|-------|--------|
| **Statement** | `crossReviewPath(featurePath, skillName, docType, 1)` must return `<featurePath>CROSS-REVIEW-<skillName>-<docType>.md` (no version suffix). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.3 |
| **Requirements** | REQ-CR-02 |

### PROP-CRP-02

| Field | Detail |
|-------|--------|
| **Statement** | `crossReviewPath(featurePath, skillName, docType, N)` for N ≥ 2 must return `<featurePath>CROSS-REVIEW-<skillName>-<docType>-v<N>.md`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.3 |
| **Requirements** | REQ-CR-02 |

### PROP-CRP-03

| Field | Detail |
|-------|--------|
| **Statement** | `crossReviewPath()` called with `revisionCount` of `0` or any negative integer must return the same unversioned path as `revisionCount = 1` (clamped behavior, no error thrown). |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.3 |
| **Requirements** | REQ-CR-02 |

### PROP-CRP-04

| Field | Detail |
|-------|--------|
| **Statement** | `crossReviewPath()` called with `revisionCount` of `undefined` must return the unversioned path (same as `revisionCount = 1`). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.3 |
| **Requirements** | REQ-CR-02 |

### PROP-CRP-05

| Field | Detail |
|-------|--------|
| **Statement** | `readCrossReviewRecommendation` activity must read from the versioned path `CROSS-REVIEW-<skill>-<docType>-v<N>.md` when called with `revisionCount: N` where N ≥ 2. |
| **Category** | Integration |
| **Test Level** | Integration |
| **PLAN Tasks** | 1.4 |
| **Requirements** | REQ-CR-03 |

### PROP-CRP-06

| Field | Detail |
|-------|--------|
| **Statement** | `countFindingsInCrossReviewFile()` must use `reviewState.writtenVersions[agentId]` to resolve the versioned cross-review file path for the current iteration (e.g., `writtenVersions["te-review"] = 2` → reads the `-v2` path). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.4a, 5.4b |
| **Requirements** | REQ-CLI-03, REQ-CR-02 |

---

## 6. Domain: parseRecommendation / VALUE_MATCHERS

### PROP-PR-01

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation("Approved with Minor Issues")` must return `{ status: "approved" }`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-02

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation("Need Attention")` must return `{ status: "revision_requested" }`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1 |
| **Requirements** | REQ-CR-06 |

### PROP-PR-03

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation()` must be case-insensitive: `"APPROVED WITH MINOR ISSUES"`, `"Approved With Minor Issues"`, and `"approved with minor issues"` must all return `{ status: "approved" }`. Likewise, `"NEED ATTENTION"` must return `{ status: "revision_requested" }`. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1 |
| **Requirements** | REQ-CR-05, REQ-CR-06 |

### PROP-PR-04

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation()` must preserve all pre-existing VALUE_MATCHERS behavior: `"Approved"` → `approved`, `"Approved with Minor Changes"` → `approved`, `"Revision Requested"` → `revision_requested`. No regression is permitted in existing recognized phrases. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1 |
| **Requirements** | REQ-CR-05, REQ-NF-01 |

### PROP-PR-05

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation()` must return `{ status: "revision_requested" }` for any unrecognized input value (conservative default). |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-06

| Field | Detail |
|-------|--------|
| **Statement** | `parseRecommendation()` must accept only the pre-extracted `Recommendation:` field value as its argument — not the full cross-review file content. Field extraction from the file is the caller's responsibility (`readCrossReviewRecommendation` activity). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.1, 1.4 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-07

| Field | Detail |
|-------|--------|
| **Statement** | `extractRecommendationValue()` (private helper) must return the extracted field value for a valid `Recommendation:` heading in the cross-review file, handling: inline values, bold-wrapped values (`**Approved**`), multi-line look-ahead (heading on one line, value on the next non-blank line), and code-fence skipping (a `Recommendation:` line inside a code fence must be ignored). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.5 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-08

| Field | Detail |
|-------|--------|
| **Statement** | `extractRecommendationValue()` must return `null` when no `Recommendation:` heading exists in the file content. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.5 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-09

| Field | Detail |
|-------|--------|
| **Statement** | `mapRecommendationToStatus()` must NOT exist anywhere in `feature-lifecycle.ts` after the migration. A static source-scan test must assert the string `"mapRecommendationToStatus"` is absent from the source file content. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-CR-05 |

### PROP-PR-10

| Field | Detail |
|-------|--------|
| **Statement** | A complementary static source-scan test must assert that `feature-lifecycle.ts` contains an import of `parseRecommendation` from `cross-review-parser.ts` and that at least one call to `parseRecommendation(` is present in the file. This guards against a scenario where `mapRecommendationToStatus` is merely renamed (satisfying PROP-PR-09's absence check) but consolidation to the canonical parser is not actually completed. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-CR-05 |

---

## 7. Domain: AGENT_TO_SKILL Mapping

### PROP-MAP-01

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("se-review")` must return `"software-engineer"`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01 |

### PROP-MAP-02

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("pm-review")` must return `"product-manager"`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01 |

### PROP-MAP-03

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("te-review")` must return `"test-engineer"`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01 |

### PROP-MAP-04

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("eng")` must return `"engineer"` (legacy backward compatibility). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01, REQ-NF-01 |

### PROP-MAP-05

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("qa")` must return `"test-engineer"` (legacy backward compatibility). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01, REQ-NF-01 |

### PROP-MAP-06

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("pm")` must return `"product-manager"` (legacy backward compatibility). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01, REQ-NF-01 |

### PROP-MAP-07

| Field | Detail |
|-------|--------|
| **Statement** | `agentIdToSkillName("fe")` must return `"frontend-engineer"` (legacy backward compatibility). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01, REQ-NF-01 |

### PROP-MAP-08

| Field | Detail |
|-------|--------|
| **Statement** | `AGENT_TO_SKILL` must be derived primarily by reversing `SKILL_TO_AGENT`, with a supplemental `LEGACY_AGENT_TO_SKILL` merge for backward-compat entries that cannot be expressed via pure reversal. `AGENT_TO_SKILL` must NOT be an independently maintained table. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-CR-01 |

### PROP-MAP-09

| Field | Detail |
|-------|--------|
| **Statement** | Cross-review files written by legacy agents (`pm`, `eng`, `qa`, `fe`) must continue to be parseable after the mapping update — the skill names for these legacy IDs must resolve to their pre-existing values. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 1.2 |
| **Requirements** | REQ-NF-01 |

---

## 8. Domain: ReviewState.writtenVersions Lifecycle

### PROP-RWV-01

| Field | Detail |
|-------|--------|
| **Statement** | `ReviewState` must include a `writtenVersions: Record<string, number>` field (agentId → highest revision dispatched). All `ReviewState` construction sites must initialize `writtenVersions` to `{}`. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 2.1 |
| **Requirements** | REQ-NF-04 |

### PROP-RWV-02

| Field | Detail |
|-------|--------|
| **Statement** | `buildInitialWorkflowState()` must initialize `reviewStates[phaseId].writtenVersions` to `{}` for each review phase — a new workflow starts with no version history. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-NF-04, REQ-CR-04 |

### PROP-RWV-03

| Field | Detail |
|-------|--------|
| **Statement** | After each reviewer is dispatched in `runReviewCycle()`, `reviewState.writtenVersions[agentId]` must be updated to the `currentRevision` value for that reviewer. After the first review round, `writtenVersions` must contain one entry per dispatched reviewer, each set to `1`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-CR-04 |

### PROP-RWV-04

| Field | Detail |
|-------|--------|
| **Statement** | `reviewState.writtenVersions[agentId]` must be incremented to `currentRevision` on each successive review round (round 2 → value `2`, round 3 → value `3`, etc.). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-CR-04 |

### PROP-RWV-05

| Field | Detail |
|-------|--------|
| **Statement** | `buildContinueAsNewPayload()` must include the full `reviewStates` map (with `writtenVersions` for each review phase) in the serialized payload, ensuring the version history is preserved across Temporal `ContinueAsNew` transitions. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-NF-04, REQ-CR-04 |

### PROP-RWV-06

| Field | Detail |
|-------|--------|
| **Statement** | A workflow that resumes after a `ContinueAsNew` transition must have `reviewStates[phaseId].writtenVersions` equal to the values set before the transition — not reset to `{}`. |
| **Category** | Idempotency |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-NF-04 |

### PROP-RWV-07

| Field | Detail |
|-------|--------|
| **Statement** | The optimizer context assembly must enumerate all prior versions for each reviewer using `reviewState.writtenVersions[agentId]` — for a reviewer with `writtenVersions["se-review"] = 3`, all three versioned paths (v1, v2, v3) must be passed to the context assembler. The workflow's responsibility is to enumerate paths unconditionally via `crossReviewPath()`; the `DefaultContextAssembler` (not `runReviewCycle()` itself) is responsible for silently skipping refs whose files are unreadable on disk. A unit test of `runReviewCycle()` with a mocked context assembler must verify that the workflow passes all three paths to the assembler rather than verifying the assembler's skip behavior. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.6 |
| **Requirements** | REQ-CR-07 |

---

## 9. Domain: runReviewCycle Revision Threading

### PROP-RRC-01

| Field | Detail |
|-------|--------|
| **Statement** | `runReviewCycle()` must compute `currentRevision = reviewState.revisionCount + 1` (1-indexed) and pass it as `revisionCount: currentRevision` to each `invokeSkill` call for reviewer agents. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-CR-04, REQ-NF-03 |

### PROP-RRC-02

| Field | Detail |
|-------|--------|
| **Statement** | `runReviewCycle()` must pass `revisionCount: currentRevision` to `readCrossReviewRecommendation` so the activity reads from the correctly versioned cross-review file. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-CR-03, REQ-CR-04 |

### PROP-RRC-03

| Field | Detail |
|-------|--------|
| **Statement** | The agent context prompt assembled by `buildInvokeSkillInput()` in `skill-activity.ts` must include the line `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md` (with `-v{N}` suffix for N ≥ 2; no suffix for N = 1) so the agent knows exactly where to write its output. The test must be a unit test of `buildInvokeSkillInput()` directly in `skill-activity.test.ts`, asserting on the constructed prompt string — not a test of `runReviewCycle()`, which can only verify that `revisionCount` is passed through the `SkillActivityInput` struct but cannot verify the prompt assembly logic. |
| **Category** | Contract |
| **Test Level** | Unit |
| **Test File** | `ptah/tests/unit/temporal/skill-activity.test.ts` |
| **PLAN Tasks** | 3.5 |
| **Requirements** | REQ-NF-03 |

### PROP-RRC-04

| Field | Detail |
|-------|--------|
| **Statement** | The optimizer context assembly in `runReviewCycle()` must include cross-review files from ALL reviewers regardless of their recommendation status (approved or revision_requested). The existing filter restricting context to only `revision_requested` reviewers must be removed. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.6 |
| **Requirements** | REQ-CR-07 |

### PROP-RRC-05

| Field | Detail |
|-------|--------|
| **Statement** | `runReviewCycle()` must build the optimizer context path list unconditionally — passing all versioned cross-review paths (enumerated via `crossReviewPath()`) to the context assembler without performing its own existence check. A unit test of `runReviewCycle()` must verify that all N paths are passed to the assembler, independent of whether those files exist on disk. The silent-skip behavior for missing files belongs to `DefaultContextAssembler` and is tested at the assembler level, not at the `runReviewCycle()` level. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.6 |
| **Requirements** | REQ-CR-07 |

### PROP-RRC-06

| Field | Detail |
|-------|--------|
| **Statement** | `deriveDocumentType("properties-tests")` must return `"PROPERTIES"` (not `"PROPERTIES-TESTS"`). The special-case lookup must be applied before the regex-stripping step, taking precedence over it. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-WF-03 |

---

## 10. Domain: isCompletionReady Dynamic Derivation

### PROP-ICR-01

| Field | Detail |
|-------|--------|
| **Statement** | `isCompletionReady(signOffs, workflowConfig)` must return `true` when all agent IDs listed in the `implementation-review` phase's reviewer list have `signOffs[agentId] === true`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06 |

### PROP-ICR-02

| Field | Detail |
|-------|--------|
| **Statement** | `isCompletionReady(signOffs, workflowConfig)` must return `false` when at least one agent in the `implementation-review` reviewer list has `signOffs[agentId] !== true` (absent or `false`). |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06 |

### PROP-ICR-03

| Field | Detail |
|-------|--------|
| **Statement** | `isCompletionReady()` must fall back to `signOffs["qa"] === true && signOffs["pm"] === true` when the `workflowConfig` has no `implementation-review` phase (legacy backward compatibility path). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06, REQ-NF-01 |

### PROP-ICR-04

| Field | Detail |
|-------|--------|
| **Statement** | `isCompletionReady()` must return `true` when the `implementation-review` phase exists with an empty reviewers list (vacuous truth — no agents required to sign off). |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06 |

### PROP-ICR-05

| Field | Detail |
|-------|--------|
| **Statement** | `isCompletionReady()` must derive the required reviewer agents by calling `computeReviewerList()` on the `implementation-review` phase's `reviewers` manifest, consistent with reviewer list resolution throughout the rest of the codebase. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06 |

### PROP-ICR-06

| Field | Detail |
|-------|--------|
| **Statement** | `approved_with_minor_issues` sign-offs must count as approved in `isCompletionReady()` — sign-offs stored as `true` (via `parseRecommendation()` mapping to `"approved"` → `true`) must satisfy the completion check for any reviewer. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06, REQ-CR-05 |

### PROP-ICR-07

| Field | Detail |
|-------|--------|
| **Statement** | All existing call sites of `isCompletionReady()` in `feature-lifecycle.ts` must be updated to pass `workflowConfig` as the second argument. The old single-argument signature must not exist anywhere in the codebase after the change. |
| **Category** | Integration |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.7 |
| **Requirements** | REQ-WF-06 |

---

## 11. Domain: buildContinueAsNewPayload Completeness

### PROP-CNP-01

| Field | Detail |
|-------|--------|
| **Statement** | `buildContinueAsNewPayload()` must include the full `reviewStates` map in the serialized payload, carrying `writtenVersions` for each review phase. A call with state where `reviewStates["req-review"].writtenVersions = { "se-review": 2 }` must return a payload where `reviewStates["req-review"].writtenVersions` equals `{ "se-review": 2 }`. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-NF-04 |

### PROP-CNP-03

| Field | Detail |
|-------|--------|
| **Statement** | `buildContinueAsNewPayload()` must include all existing fields (`featurePath`, `worktreeRoot`, `signOffs`, `adHocQueue`) alongside the new `reviewStates` field — no existing fields may be dropped. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-NF-04 |

### PROP-CNP-04

| Field | Detail |
|-------|--------|
| **Statement** | The existing `buildContinueAsNewPayload()` unit test fixture must be extended to include a `reviewStates` field with a non-trivial `writtenVersions` value (e.g., `{ "se-review": 2 }`). The test must assert the payload contains this value, proving serialization works. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.8 |
| **Requirements** | REQ-NF-04 |

### PROP-CNP-05

| Field | Detail |
|-------|--------|
| **Statement** | A static-structure test must assert that `bin/ptah.ts` source contains the token `"checkArtifactExists"` within the worker activities registration block — specifically within the `proxyActivities()` call or `createWorker({ activities: ... })` call — and not merely anywhere in the file (e.g., an import or comment containing the token would not satisfy this property). The test should use a targeted regex or structural parse to verify the token appears in the activities context. |
| **Category** | Integration |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.9 |
| **Requirements** | REQ-WF-05 |

---

## 12. Domain: ptah init Scaffold

### PROP-INIT-01

| Field | Detail |
|-------|--------|
| **Statement** | `ptah init` must create exactly 8 skill stub files under `ptah/skills/`: `pm-author.md`, `pm-review.md`, `se-author.md`, `se-review.md`, `te-author.md`, `te-review.md`, `tech-lead.md`, `se-implement.md`. All 8 files must exist after `ptah init` runs. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.1 |
| **Requirements** | REQ-AG-01 |

### PROP-INIT-02

| Field | Detail |
|-------|--------|
| **Statement** | The total number of files created by `ptah init` (i.e., `Object.keys(FILE_MANIFEST).length`) must equal the value derived by the formula: `(prior FILE_MANIFEST count) − (prior skill stub count) − (prior agent-log stub count) + 8`. The `init.test.ts` assertion must verify this derived count rather than a hardcoded value, OR the test must include a comment citing the verified baseline count from which the expected value was computed. Per PLAN task 4.1, the expected count after removing 3 old skill stubs and 3 old agent-log stubs and adding 8 new skill stubs is `20` — but this value must be confirmed against the actual codebase manifest before the assertion is hardcoded; the implementation must count the actual manifest entries and update the assertion accordingly. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.1 |
| **Requirements** | REQ-AG-01 |

### PROP-INIT-03

| Field | Detail |
|-------|--------|
| **Statement** | `buildConfig()` must produce a `ptah.config.json` containing exactly 8 entries in `agents.active`: `pm-author`, `pm-review`, `se-author`, `se-review`, `te-author`, `te-review`, `tech-lead`, `se-implement`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.2 |
| **Requirements** | REQ-AG-02 |

### PROP-INIT-04

| Field | Detail |
|-------|--------|
| **Statement** | Each of the 8 agents in `ptah.config.json` must have a valid `agents.skills` path pointing to its corresponding skill stub file under `./ptah/skills/` (e.g., `pm-author` → `./ptah/skills/pm-author.md`). |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.2 |
| **Requirements** | REQ-AG-02 |

### PROP-INIT-05

| Field | Detail |
|-------|--------|
| **Statement** | The default `ptah.workflow.yaml` template must contain the `properties-tests` phase (type: `creation`, agent: `se-implement`) positioned between the `implementation` phase and `implementation-review`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.3 |
| **Requirements** | REQ-WF-03 |

### PROP-INIT-06

| Field | Detail |
|-------|--------|
| **Statement** | Every review phase in the default `ptah.workflow.yaml` template must have `revision_bound: 5`. |
| **Category** | Contract |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.3 |
| **Requirements** | REQ-WF-04 |

### PROP-INIT-07

| Field | Detail |
|-------|--------|
| **Statement** | The `req-creation` phase in the default `ptah.workflow.yaml` template must include `skip_if: { field: artifact.exists, artifact: REQ }`. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.3 |
| **Requirements** | REQ-WF-01 |

### PROP-INIT-08

| Field | Detail |
|-------|--------|
| **Statement** | The reviewer assignment matrix in the default `ptah.workflow.yaml` template must exactly match: `req-review` (pm-author, reviewers: se-review + te-review), `fspec-review` (pm-author, reviewers: se-review + te-review), `tspec-review` (se-author, reviewers: pm-review + te-review), `plan-review` (se-author, reviewers: pm-review + te-review), `properties-review` (te-author, reviewers: pm-review + se-review), `implementation` (tech-lead, no reviewers), `properties-tests` (se-implement, no reviewers), `implementation-review` (se-author, reviewers: pm-review + te-review). All reviewer lists must be specified under the `"default"` discipline key. |
| **Category** | Data Integrity |
| **Test Level** | Unit |
| **PLAN Tasks** | 4.3 |
| **Requirements** | REQ-WF-02 |

---

## 13. Domain: Workflow Validator

### PROP-WFV-01

| Field | Detail |
|-------|--------|
| **Statement** | `YamlWorkflowConfigLoader.validateStructure()` must throw `WorkflowConfigError` identifying the offending phase when it encounters a review-phase entry in `ptah.workflow.yaml` that is missing a `revision_bound` field. The `ptah run` command must catch this error and exit with code 1, printing the validation error message. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.1 |
| **Requirements** | REQ-WF-04 |

### PROP-WFV-02

| Field | Detail |
|-------|--------|
| **Statement** | `validateStructure()` must accept a `skip_if` block with `field: "artifact.exists"` and a non-empty `artifact` string as a valid `SkipCondition` — no `WorkflowConfigError` must be thrown for a well-formed `artifact.exists` condition. |
| **Category** | Functional |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.1 |
| **Requirements** | REQ-WF-01, REQ-WF-05 |

### PROP-WFV-03

| Field | Detail |
|-------|--------|
| **Statement** | `validateStructure()` must throw `WorkflowConfigError` when a `skip_if` block has `field: "artifact.exists"` but the `artifact` field is absent or empty. A malformed `artifact.exists` condition with a missing `artifact` key must not pass validation. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.1 |
| **Requirements** | REQ-WF-01, REQ-WF-05 |

### PROP-WFV-04

| Field | Detail |
|-------|--------|
| **Statement** | `validateStructure()` must throw `WorkflowConfigError` when a `skip_if` block has `field: "artifact.exists"` AND an `equals` property present simultaneously — this is a malformed discriminated union and must not pass validation. Similarly, a `config.*` branch with `artifact` present (instead of `equals`) must also throw `WorkflowConfigError`. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 3.1 |
| **Requirements** | REQ-WF-01, REQ-WF-05 |

---

## 14. Domain: Backward Compatibility

### PROP-BC-01

| Field | Detail |
|-------|--------|
| **Statement** | `ptah start` must continue to operate correctly after all changes from this feature are applied. An integration test using a project configured with the old 3-agent config (`pm`, `eng`, `qa`) and an old-format `ptah.workflow.yaml` (no new phases, no `artifact.exists` conditions, `revision_bound: 3`) must successfully start a workflow and complete without error. This property verifies the headline acceptance criterion of REQ-NF-01 — that the primary entry point for legacy projects remains functional. |
| **Category** | Integration |
| **Test Level** | Integration |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-NF-01 |

---

## 15. Coverage Matrix

| Requirement | Properties | Gap? |
|-------------|------------|------|
| REQ-CLI-01 | PROP-CLI-01, PROP-CLI-04, PROP-CLI-08, PROP-CLI-09 | None |
| REQ-CLI-02 | PROP-CLI-02, PROP-CLI-03 | None |
| REQ-CLI-03 | PROP-CLI-18, PROP-CLI-19, PROP-CLI-20, PROP-CLI-23, PROP-CLI-24, PROP-CRP-06 | None |
| REQ-CLI-04 | PROP-CLI-10, PROP-CLI-11 | None |
| REQ-CLI-05 | PROP-CLI-12, PROP-CLI-13, PROP-CLI-14, PROP-CLI-15, PROP-CLI-16, PROP-CLI-17 | None |
| REQ-CLI-06 | PROP-CLI-06, PROP-CLI-07 | None |
| REQ-WF-01 | PROP-INIT-07, PROP-SC-01, PROP-SC-02, PROP-WFV-02, PROP-WFV-03, PROP-WFV-04 | None |
| REQ-WF-02 | PROP-INIT-08 | None |
| REQ-WF-03 | PROP-INIT-05, PROP-RRC-06 | None |
| REQ-WF-04 | PROP-INIT-06, PROP-WFV-01 | None |
| REQ-WF-05 | PROP-SC-01 through PROP-SC-09, PROP-SC-06A | None |
| REQ-WF-06 | PROP-ICR-01 through PROP-ICR-07 | None |
| REQ-AG-01 | PROP-INIT-01, PROP-INIT-02 | None |
| REQ-AG-02 | PROP-INIT-03, PROP-INIT-04 | None |
| REQ-CR-01 | PROP-MAP-01 through PROP-MAP-09 | None |
| REQ-CR-02 | PROP-CRP-01 through PROP-CRP-04 | None |
| REQ-CR-03 | PROP-CRP-05, PROP-RRC-02 | None |
| REQ-CR-04 | PROP-RRC-01, PROP-RRC-02, PROP-RWV-03, PROP-RWV-04 | None |
| REQ-CR-05 | PROP-PR-01, PROP-PR-03, PROP-PR-04, PROP-PR-06, PROP-PR-07, PROP-PR-08, PROP-PR-09, PROP-PR-10 | None |
| REQ-CR-06 | PROP-PR-02, PROP-PR-03 | None |
| REQ-CR-07 | PROP-RWV-07, PROP-RRC-04, PROP-RRC-05 | None |
| REQ-NF-01 | PROP-MAP-04 through PROP-MAP-09, PROP-PR-04, PROP-ICR-03, PROP-BC-01 | None |
| REQ-NF-02 | PROP-CLI-21, PROP-CLI-22 | None |
| REQ-NF-03 | PROP-RRC-03 | None |
| REQ-NF-04 | PROP-RWV-01, PROP-RWV-02, PROP-RWV-05, PROP-RWV-06, PROP-CNP-01, PROP-CNP-03, PROP-CNP-04 | None |

---

## 16. Negative Properties

The following properties define what must NOT happen after implementation:

| Property ID | Must NOT Happen | Test Level |
|-------------|----------------|------------|
| PROP-CLI-02 | `ptah run` must NOT start a Temporal workflow when the REQ file is absent | Unit |
| PROP-CLI-03 | `ptah run` must NOT start a Temporal workflow when the REQ file is empty/whitespace-only | Unit |
| PROP-CLI-05 | `ptah run` must NOT start a Temporal workflow when `ptah.workflow.yaml` is missing | Unit |
| PROP-CLI-06 | `ptah run` must NOT start a duplicate workflow when one is already running (Running or ContinuedAsNew) | Unit |
| PROP-CLI-22 | `ptah run` must NOT print the stdin-closed warning to stdout (it goes to stderr) | Unit |
| PROP-SC-04 | `evaluateSkipCondition()` must NOT silently return `false` when called before the pre-loop activity — it must throw | Unit |
| PROP-SC-05 | `resolveNextPhase()` must NOT catch the throw from `evaluateSkipCondition()` | Unit |
| PROP-SC-08 | `checkArtifactExists` must NOT be invoked again during the main phase loop | Unit |
| PROP-SC-09 | The pre-loop scan must NOT skip phases that precede `startAtPhase` | Unit |
| PROP-RRC-05 | `runReviewCycle()` must NOT perform its own file-existence check on cross-review paths — path enumeration is unconditional; file-existence filtering belongs to the context assembler | Unit |
| PROP-PR-09 | `mapRecommendationToStatus()` must NOT exist in `feature-lifecycle.ts` | Unit |
| PROP-MAP-08 | `AGENT_TO_SKILL` must NOT be a fully independent hand-maintained table | Unit |
| PROP-CNP-05 | `bin/ptah.ts` must NOT be missing the `checkArtifactExists` token in the worker activities registration block | Unit |
| PROP-WFV-01 | A review phase missing `revision_bound` must NOT be accepted by the workflow validator | Unit |
| PROP-WFV-03 | A `skip_if` block with `field: "artifact.exists"` but no `artifact` key must NOT pass validation | Unit |
| PROP-WFV-04 | A malformed discriminated union (`artifact.exists` + `equals`, or `config.*` + `artifact`) must NOT pass validation | Unit |

---

## 17. E2E Properties

The following 2 properties require end-to-end validation (maximum E2E tests per feature: 3–5):

| Property ID | E2E Scenario |
|-------------|-------------|
| PROP-CLI-01 | Happy-path: REQ file valid, no duplicate workflow, config present → workflow starts and exits 0 on completion (driven by FakeTemporalClient in unit test; real cluster for full E2E) |
| PROP-CNP-01 | Resume after ContinueAsNew: workflow carries `writtenVersions` through a full `ContinueAsNew` boundary with real Temporal infrastructure |

---

## 18. Test File Mapping

| Test File | Properties Covered |
|-----------|-------------------|
| `ptah/tests/unit/orchestrator/cross-review-parser.test.ts` | PROP-CRP-01–06, PROP-PR-01–10, PROP-MAP-01–09 |
| `ptah/tests/unit/temporal/cross-review-activity.test.ts` | PROP-CRP-05, PROP-PR-06, PROP-PR-07 |
| `ptah/tests/unit/temporal/activities/artifact-activity.test.ts` (new) | PROP-SC-06 |
| `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts` | PROP-SC-01–09, PROP-SC-06A, PROP-RWV-01–07, PROP-RRC-01–02, PROP-RRC-04–06, PROP-ICR-01–07, PROP-CNP-01, PROP-CNP-03–05, PROP-PR-09, PROP-PR-10 |
| `ptah/tests/unit/temporal/skill-activity.test.ts` | PROP-RRC-03 |
| `ptah/tests/unit/config/workflow-validator.test.ts` | PROP-INIT-06 (revision_bound validation), PROP-WFV-01–04 |
| `ptah/tests/unit/config/defaults.test.ts` | PROP-INIT-01–08 |
| `ptah/tests/unit/commands/init.test.ts` | PROP-INIT-01, PROP-INIT-02 |
| `ptah/tests/unit/commands/run.test.ts` (new) | PROP-CLI-01–24 |
| `ptah/tests/unit/fixtures/factories.test.ts` | PROP-CLI-06 (FakeTemporalClient statusFilter behavior) |
| `ptah/tests/unit/temporal/client.test.ts` | PROP-CNP-05 (static-structure test for checkArtifactExists in ptah.ts) |
| `ptah/tests/integration/commands/run.integration.test.ts` (new) | PROP-BC-01 |

---

## 19. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Senior Test Engineer | Initial PROPERTIES document. 87 properties across 10 domains, derived from REQ-021 v1.3, FSPEC-021 v1.2, TSPEC-021 v1.2, and PLAN-021 v1.1. Coverage matrix confirms all 25 requirements have at least one property. 12 negative properties and 2 E2E properties identified. |
| 1.1 | April 22, 2026 | Senior Test Engineer | Addressed cross-review feedback from product-manager (3 High, 4 Medium) and software-engineer (3 High, 4 Medium). **High findings resolved:** (1) PM-F-01: Added PROP-WFV-01 — workflow validator must throw WorkflowConfigError for review phase missing `revision_bound`, covering REQ-WF-04 negative AC. (2) PM-F-02: Added PROP-WFV-02, PROP-WFV-03, PROP-WFV-04 — YAML validator acceptance of valid `artifact.exists` SkipCondition and rejection of two malformed variants (missing `artifact` field; spurious `equals` field with `artifact.exists`). (3) PM-F-03: Added PROP-CLI-23 (Passed ✅ phase transition) and PROP-CLI-24 (Revision Bound Reached ⚠️ + optimizer-dispatch line) to cover REQ-CLI-03 phase transition output. (4) SE-F-01: Rewrote PROP-RRC-05 — clarified that `runReviewCycle()` builds path list unconditionally and the silent-skip responsibility belongs to `DefaultContextAssembler`; updated PROP-RWV-07 to reflect the same layering. (5) SE-F-02: Fixed PROP-CLI-01 — reclassified from Integration to Unit, added explicit note that FakeTemporalClient drives the test; removed the Integration classification conflict with `tests/unit/` file placement. (6) SE-F-03: Added PROP-SC-09 — negative property asserting the pre-loop scan must still fire for phases before `startAtPhase` when `startAtPhase` is set to a later phase. **Medium findings resolved:** (7) PM-F-04 / SE-F-11: Revised PROP-INIT-02 — replaced hardcoded `20` with derivation rule and instruction to verify baseline count; kept `20` as the PLAN-stated expected value with a verification caveat. (8) PM-F-05: Added PROP-BC-01 (new Backward Compatibility domain) — integration property verifying `ptah start` continues to operate with old 3-agent config post-upgrade. (9) PM-F-06: Removed PROP-CNP-02 (deep-copy requirement) — reclassified as a TSPEC implementation decision not derivable from product requirements; renumbered PROP-CNP-03 and PROP-CNP-04 accordingly (PROP-CNP-02 number retired). (10) SE-F-04: Updated PROP-CLI-06 to explicitly require two independent test cases — one for `Running` status and one for `ContinuedAsNew` status. (11) SE-F-05: Updated PROP-CNP-05 to require the token appear within the activities registration block context, not merely anywhere in the file. (12) SE-F-06: Added PROP-PR-10 — complementary import/call assertion verifying `parseRecommendation` is imported and called in `feature-lifecycle.ts`. (13) SE-F-07: Updated PROP-CLI-18 deduplication key to include `completedPhaseResults` alongside phase, iteration, and reviewer statuses. Property index updated (95 total properties, 12 domains). Coverage matrix updated to include new properties. Negative properties section updated. Test file mapping updated. |
| 1.2 | April 22, 2026 | Senior Test Engineer | Addressed all Medium findings from second-iteration cross-reviews (software-engineer v2: F-01 through F-04; product-manager v2: F-01 through F-02). **(1) SE-v2-F-01:** Rewrote PROP-CLI-12 statement to remove the ambiguous parenthetical condition inconsistent with PLAN T3 — now reads "only the REQ file is present in the feature folder (FSPEC, TSPEC, PLAN, and PROPERTIES are all absent)." **(2) SE-v2-F-02 + PM-v2-F-01:** Extended PROP-CLI-18 deduplication key to include `activeAgentIds` (as a sorted comma-separated string) as the fourth component of the key tuple. Added exact predicate for `completedPhaseResults` participation: the set of `{phaseId: result}` pairs serialized as a sorted key-value string must be identical across consecutive polls. Updated PROP-CLI-24 to explicitly state that a transition from `activeAgentIds = []` to `activeAgentIds = ["pm-author"]` changes the key and causes the optimizer-dispatch line to be emitted, even when reviewer statuses and `completedPhaseResults` are unchanged. **(3) SE-v2-F-03:** Added PROP-SC-06A — new Contract/Unit property requiring `createArtifactActivities()` factory to return an object with a `checkArtifactExists` function property, covering PLAN task 3.2a test case (d) and guarding against silent Temporal worker registration failures. Test file: `artifact-activity.test.ts`. **(4) SE-v2-F-04:** Corrected PROP-RRC-03 — added explicit Test File field pointing to `skill-activity.test.ts`; updated statement to specify that the test must be a unit test of `buildInvokeSkillInput()` in `skill-activity.ts`, not a test of `runReviewCycle()`. Test file mapping in Section 18 updated: PROP-RRC-03 removed from `feature-lifecycle.test.ts` entry and added to a new `skill-activity.test.ts` entry. **(5) PM-v2-F-02:** Added FSPEC-CLI-01 BR-CLI-06 traceability to PROP-CLI-05 — statement now explicitly names the `WorkflowConfigError` catch-and-reformat path as the source of this behavioral contract; Requirements field updated to include `FSPEC-CLI-01 (BR-CLI-06)`. Property index updated (96 total properties, 12 domains). Coverage matrix updated. |

---

*End of Document*
