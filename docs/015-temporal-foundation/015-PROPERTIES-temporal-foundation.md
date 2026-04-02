# Test Properties Document

## Temporal Foundation + Config-Driven Workflow

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-015 |
| **Requirements** | [REQ-015](015-REQ-temporal-foundation.md) |
| **Specifications** | [FSPEC-015](015-FSPEC-temporal-foundation.md), [TSPEC-015](015-TSPEC-temporal-foundation.md) |
| **Execution Plan** | [PLAN-015](015-PLAN-temporal-foundation.md) |
| **Version** | 1.0 |
| **Date** | April 2, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

This document catalogs the testable properties for the Temporal Foundation + Config-Driven Workflow feature (015). The feature replaces Ptah's custom orchestration infrastructure with Temporal durable workflows and makes the PDLC workflow configurable via `ptah.workflow.yaml`. The properties are derived from 20 requirements (REQ-015), 6 functional specifications (FSPEC-015), and the technical specification (TSPEC-015).

### 1.1 Scope

**In scope:**
- Temporal Workflow lifecycle properties (creation, progression, completion)
- Activity lifecycle properties (heartbeat, idempotency, retry, error classification)
- Signal handling properties (user-answer, retry-or-cancel, resume-or-cancel)
- Query handler properties (workflow state inspection)
- Fork/join orchestration properties (parallel dispatch, failure policies, merge behavior)
- Review cycle properties (reviewer dispatch, outcome evaluation, revision loop)
- Config-driven workflow properties (YAML parsing, validation, phase graph, context documents)
- Migration tool properties (phase mapping, dry-run, workflow creation, idempotency)
- Non-functional properties (deployment, observability, worker configuration)

**Out of scope:**
- Discord integration internals (kept from v4, covered by existing tests)
- Claude Agent SDK internals (kept, tested upstream)
- Git worktree creation/merge primitives (kept from v4 `GitClient`)
- SkillInvoker subprocess management (kept, interface unchanged)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 20 | [REQ-015](015-REQ-temporal-foundation.md) |
| Functional specifications analyzed | 6 | [FSPEC-015](015-FSPEC-temporal-foundation.md) |
| Technical specification sections | 15 | [TSPEC-015](015-TSPEC-temporal-foundation.md) |
| Integration boundaries identified | 8 | SkillInvoker, ContextAssembler, ArtifactCommitter, GitClient, RoutingEngine, AgentRegistry, DiscordClient, WorktreeRegistry |
| Implementation files reviewed | 0 | N/A -- not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 42 | REQ-TF-01..08, REQ-CD-01..07, REQ-MG-01..02, REQ-NF-15-01..03 | Unit |
| Contract | 10 | REQ-TF-01, REQ-TF-02, REQ-TF-04, REQ-CD-01, REQ-MG-01 | Unit / Integration |
| Error Handling | 18 | REQ-TF-02, REQ-TF-05, REQ-TF-06, REQ-CD-05, REQ-MG-01 | Unit |
| Data Integrity | 8 | REQ-TF-04, REQ-CD-01, REQ-CD-07, REQ-MG-01 | Unit |
| Integration | 10 | REQ-TF-01..03, REQ-TF-06..08, REQ-NF-15-01 | Integration |
| Performance | 4 | REQ-TF-02, REQ-NF-15-03 | Integration |
| Security | 3 | REQ-TF-03, REQ-NF-15-01 | Unit / Integration |
| Idempotency | 5 | REQ-TF-02, REQ-TF-07, REQ-MG-01 | Unit / Integration |
| Observability | 5 | REQ-TF-04, REQ-NF-15-02 | Unit |
| **Total** | **105** | | |

---

## 3. Properties

### 3.1 Functional Properties

Core business logic and behavior.

#### 3.1.1 Feature Lifecycle Workflow (REQ-TF-01)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-01 | `featureLifecycleWorkflow` must create a workflow with ID `ptah-feature-{slug}-{sequence}` when a new feature is initiated | REQ-TF-01, TSPEC S5.2 | Unit | P0 |
| PROP-TF-02 | `featureLifecycleWorkflow` must begin at the first configured phase when started without `startAtPhase` | REQ-TF-01, TSPEC S5.2 | Unit | P0 |
| PROP-TF-03 | `featureLifecycleWorkflow` must progress through phases in configuration order until completion | REQ-TF-01, TSPEC S5.2 | Unit | P0 |
| PROP-TF-04 | `featureLifecycleWorkflow` must snapshot `workflowConfig` at creation time and use that snapshot for all subsequent phase transitions | REQ-CD-04, TSPEC S5.2 | Unit | P0 |
| PROP-TF-05 | `TemporalClientWrapper.listWorkflowsByPrefix` must be used to determine the next sequence number for a workflow ID to avoid collisions | REQ-TF-01, TSPEC S4.2 | Unit | P0 |

#### 3.1.2 Agent Dispatch via Activities (REQ-TF-02)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-06 | `invokeSkill` Activity must invoke `SkillInvoker.invoke()` with the correct agent ID, context bundle, and feature config | REQ-TF-02, FSPEC-TF-01 S3-5, TSPEC S6 | Unit | P0 |
| PROP-TF-07 | `invokeSkill` Activity must emit heartbeats every `heartbeatInterval` (default 30s) by polling subprocess liveness | REQ-TF-02, FSPEC-TF-01 S6, TSPEC S6.5 | Unit | P0 |
| PROP-TF-08 | `invokeSkill` Activity must return the routing signal and artifact changes when the skill completes successfully | REQ-TF-02, FSPEC-TF-01 S7-9, TSPEC S6.8 | Unit | P0 |
| PROP-TF-09 | `invokeSkill` Activity must merge the worktree to the feature branch when `forkJoin` is false and signal is LGTM | FSPEC-TF-01 S9c, BR-04a, TSPEC S6.8b | Unit | P0 |
| PROP-TF-10 | `invokeSkill` Activity must NOT merge the worktree when `forkJoin` is true, returning the worktree path instead | FSPEC-TF-01 S9d, BR-04a, TSPEC S6.8b | Unit | P0 |
| PROP-TF-11 | `invokeSkill` Activity must NOT merge the worktree when the routing signal is `ROUTE_TO_USER` | FSPEC-TF-01 S8, BR-03, TSPEC S6.8a | Unit | P0 |

#### 3.1.3 Human Input via Signals (REQ-TF-03)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-12 | `featureLifecycleWorkflow` must enter `waitForSignal("user-answer")` state when an Activity returns `ROUTE_TO_USER` | REQ-TF-03, FSPEC-TF-02 S4, TSPEC S5.4 | Unit | P0 |
| PROP-TF-13 | `featureLifecycleWorkflow` must send a notification to the messaging layer with question text, feature slug, agent ID, phase ID, and workflow ID before entering wait | FSPEC-TF-02 S3, TSPEC S5.4.2 | Unit | P0 |
| PROP-TF-14 | `featureLifecycleWorkflow` must re-invoke the same agent for the same phase with the question and answer in context when a `user-answer` Signal is received | REQ-TF-03, FSPEC-TF-02 S7-8, BR-05, TSPEC S5.4.5c | Unit | P0 |
| PROP-TF-15 | `featureLifecycleWorkflow` must support nested questions (agent returns `ROUTE_TO_USER` again after resuming) | FSPEC-TF-02 S9, BR-06, TSPEC S5.4.6 | Unit | P0 |

#### 3.1.4 Workflow State Queries (REQ-TF-04)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-16 | `featureLifecycleWorkflow` must expose a `workflow-state` Query returning current phase, completed phases, active agent IDs, pending reviewer keys, and feature config | REQ-TF-04, TSPEC S5.1 | Unit | P0 |

#### 3.1.5 Retry and Failure Handling (REQ-TF-05)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-17 | `invokeSkill` Activity must classify subprocess crash (non-zero exit) as retryable | REQ-TF-05, FSPEC-TF-03 S2, TSPEC S12 | Unit | P0 |
| PROP-TF-18 | `invokeSkill` Activity must classify API timeout as retryable | REQ-TF-05, FSPEC-TF-03 S2, TSPEC S12 | Unit | P0 |
| PROP-TF-19 | `invokeSkill` Activity must classify routing signal parse failure as non-retryable via `ApplicationFailure.nonRetryable()` | REQ-TF-05, FSPEC-TF-03 S2, BR-09, TSPEC S12 | Unit | P0 |
| PROP-TF-20 | `invokeSkill` Activity must classify git merge conflict as non-retryable | REQ-TF-05, FSPEC-TF-03 S2, TSPEC S12 | Unit | P0 |
| PROP-TF-21 | `invokeSkill` Activity must handle 429 rate limit errors internally with `Retry-After` backoff before throwing to Temporal | FSPEC-TF-03, BR-26, TSPEC S6.9 | Unit | P0 |
| PROP-TF-22 | `featureLifecycleWorkflow` must transition to `failed` state and enter `waitForSignal("retry-or-cancel")` when all Activity retries are exhausted | REQ-TF-05, FSPEC-TF-03 S5, TSPEC S5.6 | Unit | P0 |
| PROP-TF-23 | `featureLifecycleWorkflow` must re-dispatch the Activity from scratch when a `retry` Signal is received in failed state | FSPEC-TF-03 S5d, TSPEC S5.6.5a | Unit | P0 |
| PROP-TF-24 | `featureLifecycleWorkflow` must complete with cancelled status when a `cancel` Signal is received in failed state | FSPEC-TF-03 S5d, TSPEC S5.6.5b | Unit | P0 |

#### 3.1.6 Fork/Join Dispatch (REQ-TF-06)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-25 | `featureLifecycleWorkflow` must dispatch Activities concurrently for all agents in a fork/join phase | REQ-TF-06, FSPEC-TF-04 S2, TSPEC S5.3 | Unit | P0 |
| PROP-TF-26 | `featureLifecycleWorkflow` must merge worktrees sequentially in config-defined order when all fork/join agents succeed | FSPEC-TF-04 S5, BR-13, TSPEC S7 | Unit | P0 |
| PROP-TF-27 | `featureLifecycleWorkflow` must NOT merge any worktrees when any fork/join agent fails (no-partial-merge invariant) | REQ-TF-06, FSPEC-TF-04 Failure S5, BR-12, TSPEC S5.3.5 | Unit | P0 |
| PROP-TF-28 | `featureLifecycleWorkflow` must wait for all remaining Activities before evaluating results under `wait_for_all` policy | REQ-TF-06, FSPEC-TF-04 Failure S3, TSPEC S5.3.2 | Unit | P0 |
| PROP-TF-29 | `featureLifecycleWorkflow` must request cancellation of surviving Activities under `fail_fast` policy when one fails | FSPEC-TF-04 Failure-fast S3, BR-15, TSPEC S5.3.2 | Unit | P0 |
| PROP-TF-30 | `featureLifecycleWorkflow` must re-dispatch ALL agents (not just failed ones) on retry of a failed fork/join phase | REQ-TF-06, FSPEC-TF-04 Failure S10, BR-14, TSPEC S5.6.5a | Unit | P0 |
| PROP-TF-31 | `featureLifecycleWorkflow` must handle `ROUTE_TO_USER` in fork/join by processing question flows sequentially, then re-invoking only the ROUTE_TO_USER agents | FSPEC-TF-04 ROUTE_TO_USER S1-5, TSPEC S5.3.3 | Unit | P0 |

#### 3.1.7 Worktree Management (REQ-TF-07)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-32 | `invokeSkill` Activity must create a git worktree before invoking the skill | REQ-TF-07, FSPEC-TF-01 S3, TSPEC S6.3 | Unit | P0 |
| PROP-TF-33 | `invokeSkill` Activity must clean up the worktree in a finally block on error | REQ-TF-07, FSPEC-TF-01 S10, BR-04, TSPEC S6.9 | Unit | P0 |

#### 3.1.8 Review Cycles (REQ-TF-08)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-34 | `featureLifecycleWorkflow` must compute reviewer manifest from phase config based on feature discipline | REQ-TF-08, FSPEC-TF-05 S2, TSPEC S5.5.1 | Unit | P0 |
| PROP-TF-35 | `featureLifecycleWorkflow` must dispatch reviewer Activities in parallel | REQ-TF-08, FSPEC-TF-05 S4, TSPEC S5.5.3 | Unit | P0 |
| PROP-TF-36 | `featureLifecycleWorkflow` must advance to the approved phase when all reviewers submit "Approved" | REQ-TF-08, FSPEC-TF-05 S6-7, TSPEC S5.5.5a | Unit | P0 |
| PROP-TF-37 | `featureLifecycleWorkflow` must treat "Approved with minor changes" as `approved` for state machine purposes | FSPEC-TF-05 S5c, BR-17, TSPEC S5.5.4b | Unit | P0 |
| PROP-TF-38 | `featureLifecycleWorkflow` must loop back to creation phase with task type `Revise` when any reviewer requests revision | REQ-TF-08, FSPEC-TF-05 S8d-e, TSPEC S5.5.5b | Unit | P0 |
| PROP-TF-39 | `featureLifecycleWorkflow` must require ALL reviewers to re-review after revision (not just those who requested changes) | FSPEC-TF-05 S8f, BR-18, TSPEC S5.5.5v | Unit | P0 |
| PROP-TF-40 | `featureLifecycleWorkflow` must pause and notify user when revision count exceeds the configured bound (default 3) | REQ-TF-08, FSPEC-TF-05 S8b-c, TSPEC S5.5.5biii | Unit | P0 |
| PROP-TF-41 | `featureLifecycleWorkflow` must track revision count per review phase, not globally | FSPEC-TF-05, BR-19, TSPEC S5.5 | Unit | P0 |

#### 3.1.9 Config-Driven Phase Definitions (REQ-CD-01..07)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-CD-01 | `WorkflowConfigLoader` must parse `ptah.workflow.yaml` into a `WorkflowConfig` object with `version` and `phases` array | REQ-CD-01, TSPEC S4.2, S8 | Unit | P0 |
| PROP-CD-02 | `resolveNextPhase` must return the explicit `transition` target when the phase has a `transition` field | REQ-CD-04, TSPEC S5.7 | Unit | P0 |
| PROP-CD-03 | `resolveNextPhase` must return the next phase in array order when no explicit `transition` is defined | REQ-CD-04, TSPEC S5.7 | Unit | P0 |
| PROP-CD-04 | `resolveNextPhase` must skip a phase when its `skip_if` condition evaluates to true against feature config | REQ-CD-04, TSPEC S5.7 | Unit | P0 |
| PROP-CD-05 | `resolveNextPhase` must return `null` when the current phase is the last phase (workflow complete) | TSPEC S5.7 | Unit | P0 |
| PROP-CD-06 | `featureLifecycleWorkflow` must dispatch the agent specified in `PhaseDefinition.agent` for single-agent creation/implementation phases | REQ-CD-02, TSPEC S5.3 | Unit | P0 |
| PROP-CD-07 | `featureLifecycleWorkflow` must dispatch all agents specified in `PhaseDefinition.agents` for fork/join phases | REQ-CD-02, TSPEC S5.3 | Unit | P0 |
| PROP-CD-08 | `featureLifecycleWorkflow` must select the reviewer manifest matching the feature's discipline, falling back to `default` | REQ-CD-03, FSPEC-TF-05 S2, TSPEC S5.5.1 | Unit | P0 |
| PROP-CD-09 | Context document references must resolve `{feature}/REQ` to `docs/{slug}/{prefix}-REQ-{feature}.md` and similarly for other document types | REQ-CD-07, TSPEC S8.2 | Unit | P0 |
| PROP-CD-10 | `featureLifecycleWorkflow` must auto-transition through `approved` phases without dispatching an Activity | TSPEC S5.2.b | Unit | P0 |

#### 3.1.10 Default PDLC Preset (REQ-CD-06)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-CD-11 | Default `ptah.workflow.yaml` preset must define the exact same phase sequence, agent assignments, and reviewer manifests as v4 PDLC | REQ-CD-06, TSPEC S11.1 | Unit | P0 |

#### 3.1.11 Migration (REQ-MG-01, REQ-MG-02)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MG-01 | `MigrateCommand` must read `pdlc-state.json` and create a Temporal Workflow for each in-progress feature at its mapped v5 phase | REQ-MG-01, FSPEC-MG-01 S7, TSPEC S11.2 | Unit | P0 |
| PROP-MG-02 | `MigrateCommand` must use the built-in V4_DEFAULT_MAPPING when no `--phase-map` is provided | REQ-MG-01, FSPEC-MG-01 S3b, BR-24, TSPEC S11.1 | Unit | P0 |
| PROP-MG-03 | `MigrateCommand` must use a custom JSON mapping file when `--phase-map` is provided | REQ-MG-01, FSPEC-MG-01 S3a, TSPEC S11.2 | Unit | P0 |
| PROP-MG-04 | `MigrateCommand` in `--dry-run` mode must print a migration table without creating Temporal Workflows or connecting to Temporal | REQ-MG-02, FSPEC-MG-01 S5, TSPEC S11.2.5 | Unit | P1 |
| PROP-MG-05 | `MigrateCommand` must transfer reviewer statuses and revision count for features in review phases | FSPEC-MG-01 S7c, BR-23, TSPEC S11.2.7d | Unit | P0 |

#### 3.1.12 Non-Functional (REQ-NF-15-01..03)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-01 | `TemporalClientWrapper` must connect using `address`, `namespace`, and optional TLS from `ptah.config.json` | REQ-NF-15-01, TSPEC S4.2, S4.3 | Unit | P0 |
| PROP-NF-02 | Worker must run in-process with the Orchestrator using configurable `taskQueue`, `maxConcurrentWorkflowTasks`, and `maxConcurrentActivities` | REQ-NF-15-03, TSPEC S9 | Unit | P1 |

### 3.2 Contract Properties

API request/response shape, protocol compliance, and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-42 | `invokeSkill` Activity must accept `SkillActivityInput` and return `SkillActivityResult` matching the defined interface shapes | TSPEC S4.3 | Unit | P0 |
| PROP-TF-43 | `sendNotification` Activity must accept `NotificationInput` matching the defined interface shape | TSPEC S4.3 | Unit | P0 |
| PROP-TF-44 | `TemporalClientWrapper.startFeatureWorkflow` must accept `StartWorkflowParams` and return a workflow ID string | TSPEC S4.2 | Unit | P0 |
| PROP-TF-45 | `TemporalClientWrapper.queryWorkflowState` must return a `FeatureWorkflowState` matching the defined interface | TSPEC S4.2 | Unit | P0 |
| PROP-TF-46 | `WorkflowValidator.validate` must return a `ValidationResult` with `valid: boolean` and `errors: ValidationError[]` | TSPEC S4.2 | Unit | P0 |
| PROP-CD-12 | `WorkflowConfig` must conform to `{ version: number, phases: PhaseDefinition[] }` shape after parsing | TSPEC S4.3 | Unit | P0 |
| PROP-CD-13 | `PhaseDefinition` must support all optional fields: `agent`, `agents`, `reviewers`, `transition`, `skip_if`, `failure_policy`, `context_documents`, `revision_bound`, `retry` | TSPEC S4.3 | Unit | P0 |
| PROP-MG-06 | `MigrateCommand.execute` must accept `MigrateOptions` and return `MigrateResult` matching the defined interfaces | TSPEC S4.2 | Unit | P0 |
| PROP-TF-47 | Signal payloads must conform to defined interfaces: `UserAnswerSignal`, `RetryOrCancelSignal`, `ResumeOrCancelSignal` | TSPEC S4.3 | Unit | P0 |
| PROP-TF-48 | `FeatureWorkflowState` must include all required fields: `featureSlug`, `currentPhaseId`, `completedPhaseIds`, `activeAgentIds`, `phaseStatus`, `reviewStates`, `forkJoinState`, `pendingQuestion`, `failureInfo` | TSPEC S4.3 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-49 | `invokeSkill` Activity must throw `ApplicationFailure.nonRetryable()` for git merge conflicts | FSPEC-TF-03, BR-09, TSPEC S12 | Unit | P0 |
| PROP-TF-50 | `invokeSkill` Activity must throw `ApplicationFailure.nonRetryable()` for routing signal parse failures | FSPEC-TF-03, BR-09, TSPEC S12 | Unit | P0 |
| PROP-TF-51 | `invokeSkill` Activity must throw a retryable error for subprocess crash (non-zero exit) | FSPEC-TF-03, TSPEC S12 | Unit | P0 |
| PROP-TF-52 | `invokeSkill` Activity must throw a retryable error for heartbeat timeout | FSPEC-TF-03, TSPEC S12 | Unit | P0 |
| PROP-TF-53 | `invokeSkill` Activity must handle 429 errors internally: read `Retry-After`, sleep, retry; only throw to Temporal when internal retries are exhausted | FSPEC-TF-03, BR-26, TSPEC S6.9 | Unit | P0 |
| PROP-TF-54 | `featureLifecycleWorkflow` must send a failure notification with error type, message, phase, agent, and retry count before entering failed state | FSPEC-TF-03 S5b, TSPEC S5.6.2 | Unit | P0 |
| PROP-TF-55 | `featureLifecycleWorkflow` must enter failed state and notify user when a non-retryable error occurs (no retry-or-cancel, immediate failure) | FSPEC-TF-03 S5, TSPEC S5.6 | Unit | P0 |
| PROP-TF-56 | `mergeWorktree` Activity must revert the first merge and throw non-retryable error when the second worktree in fork/join produces a merge conflict | FSPEC-TF-04 CONFLICT S1-6, TSPEC S7 | Unit | P0 |
| PROP-CD-14 | `WorkflowConfigLoader` must throw `WorkflowConfigError` when `ptah.workflow.yaml` is not found | TSPEC S4.2, S12 | Unit | P0 |
| PROP-CD-15 | `WorkflowConfigLoader` must throw `WorkflowConfigError` when YAML content is malformed | TSPEC S4.2, S12 | Unit | P0 |
| PROP-TF-57 | `featureLifecycleWorkflow` must handle reviewer Activity that returns `ROUTE_TO_USER` via the standard question flow (FSPEC-TF-02), re-invoking the reviewer after the answer | FSPEC-TF-05, BR-21 | Unit | P0 |
| PROP-TF-58 | `featureLifecycleWorkflow` must retry a reviewer Activity when the cross-review file has no parseable recommendation | FSPEC-TF-05 Edge Cases | Unit | P0 |
| PROP-TF-59 | `invokeSkill` Activity must kill subprocess, clean up worktree, and throw `CancellationError` when Temporal sends cancellation request (checked at heartbeat boundary) | FSPEC-TF-01 S6d, TSPEC S6.5d | Unit | P0 |
| PROP-MG-07 | `MigrateCommand` must abort with descriptive error when `pdlc-state.json` is not found | FSPEC-MG-01 S1, TSPEC S12 | Unit | P0 |
| PROP-MG-08 | `MigrateCommand` must abort with descriptive error when `ptah.workflow.yaml` is not found | FSPEC-MG-01 S2, TSPEC S12 | Unit | P0 |
| PROP-MG-09 | `MigrateCommand` must abort listing unmapped phases when any feature's v4 phase has no mapping | REQ-MG-01, FSPEC-MG-01 S4, TSPEC S12 | Unit | P0 |
| PROP-MG-10 | `MigrateCommand` must abort before creating any workflows when Temporal connection fails | FSPEC-MG-01 S6 Error, TSPEC S12 | Unit | P0 |
| PROP-MG-11 | `MigrateCommand` must log error and continue with remaining features when workflow creation fails for one feature | FSPEC-MG-01 Error Scenarios | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-60 | `featureLifecycleWorkflow` Query must return accurate `completedPhaseIds` reflecting all phases the workflow has transitioned through | REQ-TF-04, TSPEC S4.3 | Unit | P0 |
| PROP-TF-61 | `featureLifecycleWorkflow` must preserve `reviewerStatuses` and `revisionCount` across review loop iterations | FSPEC-TF-05, BR-19, TSPEC S5.5 | Unit | P0 |
| PROP-CD-16 | `WorkflowConfigLoader` must preserve all fields from `ptah.workflow.yaml` without data loss during YAML→TypeScript deserialization | REQ-CD-01, TSPEC S4.2, S8.1 | Unit | P0 |
| PROP-CD-17 | Context document resolver must correctly substitute `{feature}` placeholder with the feature slug and document numbering prefix | REQ-CD-07, TSPEC S8.2 | Unit | P0 |
| PROP-MG-12 | `V4_DEFAULT_MAPPING` must map all 15 v4 `PdlcPhase` enum values plus `IMPLEMENTATION`, `IMPLEMENTATION_REVIEW`, and `DONE` to corresponding default preset phase IDs | FSPEC-MG-01, BR-24, TSPEC S11.1 | Unit | P0 |
| PROP-MG-13 | `MigrateCommand` must transfer reviewer statuses faithfully for features mid-review (pending/approved/revision_requested) | FSPEC-MG-01 S7c, BR-23 | Unit | P0 |
| PROP-MG-14 | `MigrateCommand` must compute workflow IDs as `ptah-feature-{slug}-1` for migrated features | FSPEC-MG-01 S7a, TSPEC S11.2 | Unit | P0 |
| PROP-MG-15 | `MigrateCommand` must validate imports by querying each created workflow and reporting any phase mismatches as warnings | FSPEC-MG-01 S8 | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-62 | Temporal Worker must wire `SkillActivityDeps` (SkillInvoker, ContextAssembler, ArtifactCommitter, GitClient, RoutingEngine, AgentRegistry, Logger) via closure and register Activity functions | TSPEC S9, S4.2 | Integration | P0 |
| PROP-TF-63 | `featureLifecycleWorkflow` must correctly use `proxyActivities` to invoke `invokeSkill`, `sendNotification`, and `mergeWorktree` Activities | TSPEC S5.1 | Integration | P0 |
| PROP-TF-64 | `Orchestrator.handleMessage` must start a Temporal Workflow for new features and send Signals for existing features | TSPEC S10 | Integration | P0 |
| PROP-TF-65 | Orchestrator startup must validate workflow config, connect to Temporal, and start the in-process Worker in sequence | TSPEC S10, S15.2 | Integration | P0 |
| PROP-TF-66 | `featureLifecycleWorkflow` must correctly invoke the full lifecycle: phase graph traversal → Activity dispatch → Signal handling → review cycles → completion | REQ-TF-01, TSPEC S5.2 | Integration | P0 |
| PROP-TF-67 | Fork/join merge sequence must use `mergeWorktree` Activity for each worktree in config order, with rollback on conflict | FSPEC-TF-04, TSPEC S7 | Integration | P0 |
| PROP-TF-68 | `TemporalClientWrapper` must successfully connect to a Temporal server using configured address and namespace | REQ-NF-15-01, TSPEC S4.2 | Integration | P0 |
| PROP-TF-69 | Orchestrator shutdown must shut down Worker and disconnect Temporal client gracefully | TSPEC S10 | Integration | P1 |
| PROP-TF-70 | `featureLifecycleWorkflow` review cycle must dispatch reviewer Activities, collect cross-review files, evaluate outcomes, and loop back on revision correctly across multiple iterations | FSPEC-TF-05, TSPEC S5.5 | Integration | P0 |
| PROP-TF-71 | ConfigLoader must read the `temporal` section from `ptah.config.json` and apply defaults for missing fields | TSPEC S15.3 | Integration | P0 |

### 3.6 Performance Properties

Response times, resource limits, and timeout behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-72 | `invokeSkill` Activity must use `startToCloseTimeout` (configurable, default 30 minutes) to bound execution time | REQ-TF-02, TSPEC S5.1 | Integration | P0 |
| PROP-TF-73 | `invokeSkill` Activity must be considered failed when heartbeats stop for longer than `heartbeatTimeout` (configurable, default 120 seconds) | REQ-TF-02, FSPEC-TF-01 Error, TSPEC S5.1 | Integration | P0 |
| PROP-NF-03 | Temporal Worker must respect `maxConcurrentActivities` configuration to limit parallel Activity execution | REQ-NF-15-03, TSPEC S9 | Integration | P1 |
| PROP-NF-04 | `featureLifecycleWorkflow` must consume no resources while waiting for a Signal (suspended state) | REQ-TF-03, FSPEC-TF-02 S4 | Integration | P0 |

### 3.7 Security Properties

Authentication, authorization, input validation, and secrets handling.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-74 | `featureLifecycleWorkflow` must validate `user-answer` Signal payload (answer field present) and re-enter wait state with warning on invalid payload | FSPEC-TF-02 Error, TSPEC S5.4.5 | Unit | P0 |
| PROP-NF-05 | `TemporalClientWrapper` must support TLS configuration (client cert, key, server root CA) for Temporal Cloud connections | REQ-NF-15-01, TSPEC S4.3 | Unit | P0 |
| PROP-NF-06 | `WorkflowValidator` must halt startup with descriptive error when config validation fails, preventing execution of an invalid workflow | REQ-CD-05, TSPEC S4.2, S12 | Unit | P0 |

### 3.8 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-75 | `invokeSkill` Activity must skip skill invocation and return existing routing signal when a committed worktree for the same agent/feature/phase already exists | FSPEC-TF-01 S2, BR-02, TSPEC S6.2 | Unit | P0 |
| PROP-TF-76 | `invokeSkill` Activity must produce the same `SkillActivityResult` on idempotent skip as the original invocation would have | FSPEC-TF-01 S2b, TSPEC S6.2b | Unit | P0 |
| PROP-TF-77 | Worktree cleanup must occur in a finally block ensuring cleanup regardless of Activity success or failure | REQ-TF-07, FSPEC-TF-01 S10, BR-04, BR-11 | Unit | P0 |
| PROP-MG-16 | `MigrateCommand` must skip features whose workflow ID already exists in Temporal (idempotent migration) | FSPEC-MG-01, BR-22, TSPEC S11.2.7b | Unit | P0 |
| PROP-MG-17 | `MigrateCommand` must reset all fork/join subtasks to pending for features mid fork/join and emit a warning | FSPEC-MG-01 Edge Cases, TSPEC S11.2.7c | Unit | P0 |

### 3.9 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-07 | Workflows must use human-readable IDs following `ptah-feature-{slug}-{sequence}` convention | REQ-NF-15-02, TSPEC S4.2 | Unit | P1 |
| PROP-NF-08 | Activities must use meaningful names (e.g., `invoke-{agentId}-{phaseId}`) visible in the Temporal UI | REQ-NF-15-02, TSPEC S14 | Unit | P1 |
| PROP-NF-09 | Workflows must set searchable custom attributes: feature name, current phase, discipline | REQ-NF-15-02, TSPEC S14 | Unit | P1 |
| PROP-NF-10 | `invokeSkill` Activity must log `Idempotent skip: worktree already committed for {agent}/{feature}/{phase}` when performing idempotent skip | FSPEC-TF-01 S2b | Unit | P0 |
| PROP-NF-11 | `MigrateCommand` must emit warning for features paused on a question: `Feature '{slug}' was paused on a question. The pending question was not migrated` | FSPEC-MG-01 Edge Cases | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-TF-80 | `featureLifecycleWorkflow` must NOT reference any hardcoded phase enum — all phase progression must use config-driven definitions | REQ-CD-01 AC, TSPEC S5 | Unit | P0 |
| PROP-TF-81 | `invokeSkill` Activity must NOT merge worktrees when routing signal is `ROUTE_TO_USER` | FSPEC-TF-01 S8, BR-03 | Unit | P0 |
| PROP-TF-82 | `invokeSkill` Activity in fork/join context must NOT self-merge — only the Workflow orchestrates merges | FSPEC-TF-01 S9d, BR-04a | Unit | P0 |
| PROP-TF-83 | `featureLifecycleWorkflow` must NOT merge any worktrees when any Activity in a fork/join batch fails (no-partial-merge) | REQ-TF-06, FSPEC-TF-04 Failure S5, BR-12 | Unit | P0 |
| PROP-TF-84 | `featureLifecycleWorkflow` must NOT retry non-retryable errors (git merge conflict, routing signal parse failure, revision bound exceeded) | FSPEC-TF-03, BR-09 | Unit | P0 |
| PROP-TF-85 | `featureLifecycleWorkflow` must NOT re-dispatch only failed agents on fork/join retry — ALL agents must be re-dispatched | REQ-TF-06, BR-14 | Unit | P0 |
| PROP-TF-86 | `featureLifecycleWorkflow` must NOT skip re-review of approving reviewers after a revision — ALL reviewers must re-review | FSPEC-TF-05, BR-18 | Unit | P0 |
| PROP-TF-87 | `featureLifecycleWorkflow` must NOT dispatch an Activity for `approved` phase types — they auto-transition | TSPEC S5.2.b | Unit | P0 |
| PROP-TF-88 | Temporal retry mechanism must NOT handle 429 rate limit errors — these must be handled internally by the Activity | FSPEC-TF-03, BR-26 | Unit | P0 |
| PROP-TF-89 | `featureLifecycleWorkflow` must NOT use `Date.now()`, `Math.random()`, or direct I/O — it must remain deterministic per Temporal requirements | TSPEC S5.1 comment | Unit | P0 |
| PROP-MG-18 | `MigrateCommand` in `--dry-run` mode must NOT connect to Temporal or create any workflows | REQ-MG-02, FSPEC-MG-01 S5 | Unit | P1 |
| PROP-MG-19 | `MigrateCommand` must NOT transfer pending questions from v4 — the agent will re-ask when resumed | FSPEC-MG-01 Edge Cases | Unit | P0 |
| PROP-CD-18 | `WorkflowValidator` must NOT allow duplicate phase IDs in configuration | REQ-CD-05 | Unit | P0 |
| PROP-CD-19 | `WorkflowValidator` must NOT allow agent references that don't resolve to registered agents | REQ-CD-05 | Unit | P0 |
| PROP-CD-20 | `WorkflowValidator` must NOT allow transition targets that reference non-existent phase IDs | REQ-CD-05 | Unit | P0 |
| PROP-CD-21 | `WorkflowValidator` must NOT allow cycles in the phase graph (except review→creation loops) | REQ-CD-05 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-TF-01 | PROP-TF-01..05, PROP-NF-07 | Full |
| REQ-TF-02 | PROP-TF-06..11, PROP-TF-42, PROP-TF-72..73, PROP-TF-75..77 | Full |
| REQ-TF-03 | PROP-TF-12..15, PROP-TF-74, PROP-NF-04 | Full |
| REQ-TF-04 | PROP-TF-16, PROP-TF-45, PROP-TF-48, PROP-TF-60 | Full |
| REQ-TF-05 | PROP-TF-17..24, PROP-TF-49..55, PROP-TF-84 | Full |
| REQ-TF-06 | PROP-TF-25..31, PROP-TF-56, PROP-TF-83, PROP-TF-85 | Full |
| REQ-TF-07 | PROP-TF-32..33, PROP-TF-77 | Full |
| REQ-TF-08 | PROP-TF-34..41, PROP-TF-57..58, PROP-TF-86 | Full |
| REQ-CD-01 | PROP-CD-01, PROP-CD-12..13, PROP-CD-16, PROP-TF-80 | Full |
| REQ-CD-02 | PROP-CD-06..07 | Full |
| REQ-CD-03 | PROP-CD-08 | Full |
| REQ-CD-04 | PROP-TF-04, PROP-CD-02..05 | Full |
| REQ-CD-05 | PROP-NF-06, PROP-CD-14..15, PROP-CD-18..21 | Full |
| REQ-CD-06 | PROP-CD-11 | Full |
| REQ-CD-07 | PROP-CD-09, PROP-CD-17 | Full |
| REQ-MG-01 | PROP-MG-01..03, PROP-MG-05..17, PROP-MG-19 | Full |
| REQ-MG-02 | PROP-MG-04, PROP-MG-18 | Full |
| REQ-NF-15-01 | PROP-NF-01, PROP-NF-05, PROP-TF-68 | Full |
| REQ-NF-15-02 | PROP-NF-07..09, PROP-NF-10 | Full |
| REQ-NF-15-03 | PROP-NF-02..03 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-TF-01 (Activity Lifecycle) | PROP-TF-06..11, PROP-TF-32..33, PROP-TF-42, PROP-TF-59, PROP-TF-75..77, PROP-TF-81..82, PROP-NF-10 | Full |
| FSPEC-TF-02 (Signal Flow) | PROP-TF-12..15, PROP-TF-74, PROP-NF-04 | Full |
| FSPEC-TF-03 (Failure/Retry) | PROP-TF-17..24, PROP-TF-49..55, PROP-TF-84, PROP-TF-88 | Full |
| FSPEC-TF-04 (Fork/Join) | PROP-TF-25..31, PROP-TF-56, PROP-TF-67, PROP-TF-83, PROP-TF-85 | Full |
| FSPEC-TF-05 (Review Cycle) | PROP-TF-34..41, PROP-TF-57..58, PROP-TF-86 | Full |
| FSPEC-MG-01 (Migration) | PROP-MG-01..19 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 15 | 15 | 0 | 0 |
| P1 | 3 | 3 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 -- not needed; integration tests with TestWorkflowEnvironment cover critical paths
       /----------\
      / Integration \      10 (9.5%) -- cross-module boundaries, Temporal server interaction
     /----------------\
    /    Unit Tests     \  95 (90.5%) -- fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 95 | 90.5% |
| Integration | 10 | 9.5% |
| E2E (candidates) | 0 | 0% |
| **Total** | **105** | **100%** |

**E2E test rationale:** No E2E tests are recommended. The Temporal `TestWorkflowEnvironment` provides a real Temporal test server that runs in-process, enabling true integration tests that cover the full workflow lifecycle without requiring external infrastructure. This gives E2E-level confidence at the integration test level. All critical user journeys (crash recovery, fork/join, review loops, migration) can be exercised with `TestWorkflowEnvironment` + mock Activities.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | No properties for `ptah init` generating `ptah.workflow.yaml` and `temporal` config section | Init command could produce malformed or incomplete config | Low | Add unit tests for init command's config generation as part of CLI entry point changes (TSPEC S15.4). Covered by existing init tests; add assertions for new config fields. |
| 2 | No properties for `ptah status` querying Temporal workflows | Status command regression possible | Low | Add unit tests for status command using `FakeTemporalClient`. Straightforward given existing status tests. |
| 3 | No properties for Orchestrator orphaned worktree pruning on startup | Could leave stale worktrees from crashed Activities | Low | Existing v4 tests cover this behavior. Verify they still pass after refactor. |
| 4 | No properties for very long agent runs approaching `startToCloseTimeout` boundary | Timeout behavior at boundary not explicitly tested | Med | Add integration test with `TestWorkflowEnvironment` time-skipping to verify timeout expiry triggers proper failure flow. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | -- | -- | Pending |
| Technical Lead | -- | -- | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 2, 2026 | Test Engineer | Initial properties document. 105 properties across 9 categories covering 20 requirements, 6 FSPECs, and 1 TSPEC. 95 unit-level, 10 integration-level, 0 E2E. Full coverage of all P0 and P1 requirements. |

---

*End of Document*
