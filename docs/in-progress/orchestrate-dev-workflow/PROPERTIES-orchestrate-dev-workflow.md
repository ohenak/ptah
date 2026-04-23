# Properties Document

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-021 |
| **Parent Documents** | REQ-021 (v1.3), FSPEC-021 (v1.2), TSPEC-021 (v1.2), PLAN-021 (v1.1) |
| **Version** | 1.0 |
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
| CLI — ptah run | 22 | PROP-CLI-01 through PROP-CLI-22 |
| SkipCondition Evaluation | 8 | PROP-SC-01 through PROP-SC-08 |
| crossReviewPath Versioning | 6 | PROP-CRP-01 through PROP-CRP-06 |
| parseRecommendation / VALUE_MATCHERS | 9 | PROP-PR-01 through PROP-PR-09 |
| AGENT_TO_SKILL Mapping | 9 | PROP-MAP-01 through PROP-MAP-09 |
| ReviewState.writtenVersions Lifecycle | 7 | PROP-RWV-01 through PROP-RWV-07 |
| runReviewCycle Revision Threading | 6 | PROP-RRC-01 through PROP-RRC-06 |
| isCompletionReady Dynamic Derivation | 7 | PROP-ICR-01 through PROP-ICR-07 |
| buildContinueAsNewPayload Completeness | 5 | PROP-CNP-01 through PROP-CNP-05 |
| ptah init Scaffold | 8 | PROP-INIT-01 through PROP-INIT-08 |

**Total: 87 properties**

---

## 3. Domain: CLI — ptah run

### PROP-CLI-01

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run <req-path>` must start a Temporal `featureLifecycleWorkflow` for the feature slug derived from `<req-path>` when the REQ file exists, is non-empty, no duplicate workflow is running, and `ptah.workflow.yaml` is present and valid. |
| **Category** | Functional |
| **Test Level** | Integration |
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
| **Statement** | `ptah run` must print `Error: ptah.workflow.yaml not found in current directory.` to stdout and exit with code 1 when `ptah.workflow.yaml` is absent from the current working directory. No Temporal workflow must be started. |
| **Category** | Error Handling |
| **Test Level** | Unit |
| **PLAN Tasks** | 5.6 |
| **Requirements** | REQ-CLI-01 |

### PROP-CLI-06

| Field | Detail |
|-------|--------|
| **Statement** | `ptah run` must print `Error: workflow already running for feature "<slug>". Use --from-phase to restart from a specific phase after terminating the existing workflow.` to stdout and exit with code 1 when a Temporal workflow with `Running` or `ContinuedAsNew` status exists for the same feature slug. No new workflow must be started. |
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
| **Statement** | Auto-detection must resolve `startAtPhase` to `req-review` with no stdout log message when only the REQ file exists in the feature folder and no gap artifacts (TSPEC, PLAN, PROPERTIES) are present beyond the absent FSPEC. |
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
| **Statement** | Progress polling must emit `[Phase <label> — <title>] Iteration <N>` for each new review phase iteration and per-reviewer status lines (`Approved ✅` for `approved`; `Need Attention (<N> findings)` for `revision_requested`). Deduplication must suppress repeat emission when phase name, iteration number, and all reviewer statuses are unchanged between consecutive polls. |
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
| **Statement** | The optimizer context assembly must enumerate all prior versions for each reviewer using `reviewState.writtenVersions[agentId]` — for a reviewer with `writtenVersions["se-review"] = 3`, all three versioned files (v1, v2, v3) must be included in the context list (excluding any that are missing on disk, which are silently skipped without error). |
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
| **Statement** | The agent context prompt injected via `SkillActivityInput.revisionCount` must include the line `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md` (with `-v{N}` suffix for N ≥ 2; no suffix for N = 1) so the agent knows exactly where to write its output. |
| **Category** | Contract |
| **Test Level** | Unit |
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
| **Statement** | A missing cross-review file (not found on disk when building optimizer context) must be silently skipped — excluded from the context list without causing a hard error, without changing `phaseStatus`, and without setting `failureInfo` on the workflow state. |
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

### PROP-CNP-02

| Field | Detail |
|-------|--------|
| **Statement** | `buildContinueAsNewPayload()` must deep-copy `reviewStates` — mutating the original state's `writtenVersions` after calling `buildContinueAsNewPayload()` must not affect the returned payload. |
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
| **Statement** | A static-structure test must assert that `bin/ptah.ts` source contains the token `"checkArtifactExists"` in the worker activities registration block, verifying the activity is registered before the workflow can use it. |
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
| **Statement** | The total number of files created by `ptah init` (i.e., `Object.keys(FILE_MANIFEST).length`) must equal 20. The `init.test.ts` assertion `expect(Object.keys(FILE_MANIFEST).length).toBe(20)` must pass. |
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

## 13. Coverage Matrix

| Requirement | Properties | Gap? |
|-------------|------------|------|
| REQ-CLI-01 | PROP-CLI-01, PROP-CLI-04, PROP-CLI-08, PROP-CLI-09 | None |
| REQ-CLI-02 | PROP-CLI-02, PROP-CLI-03 | None |
| REQ-CLI-03 | PROP-CLI-18, PROP-CLI-19, PROP-CLI-20, PROP-CRP-06 | None |
| REQ-CLI-04 | PROP-CLI-10, PROP-CLI-11 | None |
| REQ-CLI-05 | PROP-CLI-12, PROP-CLI-13, PROP-CLI-14, PROP-CLI-15, PROP-CLI-16, PROP-CLI-17 | None |
| REQ-CLI-06 | PROP-CLI-06, PROP-CLI-07 | None |
| REQ-WF-01 | PROP-INIT-07, PROP-SC-01, PROP-SC-02 | None |
| REQ-WF-02 | PROP-INIT-08 | None |
| REQ-WF-03 | PROP-INIT-05, PROP-RRC-06 | None |
| REQ-WF-04 | PROP-INIT-06 | None |
| REQ-WF-05 | PROP-SC-01 through PROP-SC-08 | None |
| REQ-WF-06 | PROP-ICR-01 through PROP-ICR-07 | None |
| REQ-AG-01 | PROP-INIT-01, PROP-INIT-02 | None |
| REQ-AG-02 | PROP-INIT-03, PROP-INIT-04 | None |
| REQ-CR-01 | PROP-MAP-01 through PROP-MAP-09 | None |
| REQ-CR-02 | PROP-CRP-01 through PROP-CRP-04 | None |
| REQ-CR-03 | PROP-CRP-05, PROP-RRC-02 | None |
| REQ-CR-04 | PROP-RRC-01, PROP-RRC-02, PROP-RWV-03, PROP-RWV-04 | None |
| REQ-CR-05 | PROP-PR-01, PROP-PR-03, PROP-PR-04, PROP-PR-06, PROP-PR-07, PROP-PR-08, PROP-PR-09 | None |
| REQ-CR-06 | PROP-PR-02, PROP-PR-03 | None |
| REQ-CR-07 | PROP-RWV-07, PROP-RRC-04, PROP-RRC-05 | None |
| REQ-NF-01 | PROP-MAP-04 through PROP-MAP-09, PROP-PR-04, PROP-ICR-03 | None |
| REQ-NF-02 | PROP-CLI-21, PROP-CLI-22 | None |
| REQ-NF-03 | PROP-RRC-03 | None |
| REQ-NF-04 | PROP-RWV-01, PROP-RWV-02, PROP-RWV-05, PROP-RWV-06, PROP-CNP-01 through PROP-CNP-04 | None |

---

## 14. Negative Properties

The following properties define what must NOT happen after implementation:

| Property ID | Must NOT Happen | Test Level |
|-------------|----------------|------------|
| PROP-CLI-02 | `ptah run` must NOT start a Temporal workflow when the REQ file is absent | Unit |
| PROP-CLI-03 | `ptah run` must NOT start a Temporal workflow when the REQ file is empty/whitespace-only | Unit |
| PROP-CLI-05 | `ptah run` must NOT start a Temporal workflow when `ptah.workflow.yaml` is missing | Unit |
| PROP-CLI-06 | `ptah run` must NOT start a duplicate workflow when one is already running | Unit |
| PROP-CLI-22 | `ptah run` must NOT print the stdin-closed warning to stdout (it goes to stderr) | Unit |
| PROP-SC-04 | `evaluateSkipCondition()` must NOT silently return `false` when called before the pre-loop activity — it must throw | Unit |
| PROP-SC-05 | `resolveNextPhase()` must NOT catch the throw from `evaluateSkipCondition()` | Unit |
| PROP-SC-08 | `checkArtifactExists` must NOT be invoked again during the main phase loop | Unit |
| PROP-RRC-05 | A missing cross-review file must NOT cause a hard error or change `phaseStatus` | Unit |
| PROP-PR-09 | `mapRecommendationToStatus()` must NOT exist in `feature-lifecycle.ts` | Unit |
| PROP-MAP-08 | `AGENT_TO_SKILL` must NOT be a fully independent hand-maintained table | Unit |
| PROP-CNP-05 | `bin/ptah.ts` must NOT be missing the `checkArtifactExists` token in the worker activities block | Unit |

---

## 15. E2E Properties

The following 2 properties require end-to-end validation (maximum E2E tests per feature: 3–5):

| Property ID | E2E Scenario |
|-------------|-------------|
| PROP-CLI-01 | Happy-path: REQ file valid, no duplicate workflow, config present → workflow starts and exits 0 on completion |
| PROP-CNP-01 | Resume after ContinueAsNew: workflow carries `writtenVersions` through a full `ContinueAsNew` boundary with real Temporal infrastructure |

---

## 16. Test File Mapping

| Test File | Properties Covered |
|-----------|-------------------|
| `ptah/tests/unit/orchestrator/cross-review-parser.test.ts` | PROP-CRP-01–06, PROP-PR-01–09, PROP-MAP-01–09 |
| `ptah/tests/unit/temporal/cross-review-activity.test.ts` | PROP-CRP-05, PROP-PR-06, PROP-PR-07 |
| `ptah/tests/unit/temporal/activities/artifact-activity.test.ts` (new) | PROP-SC-06 |
| `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts` | PROP-SC-01–08, PROP-RWV-01–07, PROP-RRC-01–06, PROP-ICR-01–07, PROP-CNP-01–05 |
| `ptah/tests/unit/config/workflow-validator.test.ts` | PROP-INIT-06 (revision_bound validation) |
| `ptah/tests/unit/config/defaults.test.ts` | PROP-INIT-01–08 |
| `ptah/tests/unit/commands/init.test.ts` | PROP-INIT-01, PROP-INIT-02 |
| `ptah/tests/unit/commands/run.test.ts` (new) | PROP-CLI-01–22 |
| `ptah/tests/unit/fixtures/factories.test.ts` | PROP-CLI-06 (FakeTemporalClient statusFilter behavior) |
| `ptah/tests/unit/temporal/client.test.ts` | PROP-CNP-05 (static-structure test for checkArtifactExists in ptah.ts) |

---

## 17. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Senior Test Engineer | Initial PROPERTIES document. 87 properties across 10 domains, derived from REQ-021 v1.3, FSPEC-021 v1.2, TSPEC-021 v1.2, and PLAN-021 v1.1. Coverage matrix confirms all 25 requirements have at least one property. 12 negative properties and 2 E2E properties identified. |

---

*End of Document*
