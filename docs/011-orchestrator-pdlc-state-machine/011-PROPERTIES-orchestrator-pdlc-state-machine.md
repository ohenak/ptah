# Test Properties Document

## Orchestrator-Driven PDLC State Machine

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-011 |
| **Requirements** | [011-REQ-orchestrator-pdlc-state-machine](011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Specifications** | [011-FSPEC-orchestrator-pdlc-state-machine](011-FSPEC-orchestrator-pdlc-state-machine.md) (v1.2, Approved), [011-TSPEC-orchestrator-pdlc-state-machine](011-TSPEC-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Execution Plan** | [011-PLAN-TSPEC-orchestrator-pdlc-state-machine](011-PLAN-TSPEC-orchestrator-pdlc-state-machine.md) (v1.0, Approved) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

This properties document catalogs the testable invariants for the orchestrator-driven PDLC state machine. The feature replaces LLM-driven workflow logic embedded in SKILL.md files with a deterministic TypeScript state machine that enforces PDLC phase ordering, tracks review approvals, computes reviewer sets based on feature discipline, and persists state to disk for crash recovery.

The architecture follows a pure-function reducer pattern: `transition(state, event) → { newState, sideEffects }`, with all I/O separated from transition logic.

### 1.1 Scope

**In scope:**
- State machine transition logic (pure function)
- Review tracking (reviewer manifests, status evaluation, revision loops)
- Cross-review file parsing (approval detection)
- Context document matrix (phase-aware document selection)
- State persistence (atomic writes, recovery, schema migration)
- PdlcDispatcher orchestration (agent completion, review completion, resume)
- Orchestrator integration (managed vs. unmanaged feature routing)

**Out of scope:**
- SKILL.md text changes (REQ-SA-01 through REQ-SA-06) — documentation task, not code
- UI dashboard for PDLC progress visualization — future feature
- Automated PR creation at DONE phase — separate feature
- Reviewer timeout mechanism — documented as P1 known limitation

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 44 | [REQ-011](011-REQ-orchestrator-pdlc-state-machine.md) (38 P0, 6 P1) |
| Specifications analyzed | 2 | [FSPEC-011](011-FSPEC-orchestrator-pdlc-state-machine.md), [TSPEC-011](011-TSPEC-orchestrator-pdlc-state-machine.md) |
| Plan tasks reviewed | 50 | [PLAN-011](011-PLAN-TSPEC-orchestrator-pdlc-state-machine.md) |
| Integration boundaries identified | 4 | orchestrator.ts, context-assembler.ts, filesystem.ts, factories.ts |
| Implementation files reviewed | 0 | N/A — not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 42 | REQ-SM-01–11, REQ-RT-01–09, REQ-AI-01–05, REQ-FC-01–05, REQ-CA-01–03 | Unit |
| Contract | 8 | REQ-SM-NF-04, REQ-AI-04, TSPEC 4.3 | Unit / Integration |
| Error Handling | 14 | REQ-SM-10, REQ-RT-04, REQ-AI-04–05, REQ-SM-NF-02, TSPEC 6 | Unit |
| Data Integrity | 6 | REQ-SM-02, REQ-SM-05, REQ-SM-06, REQ-SM-10 | Unit |
| Integration | 8 | REQ-SM-NF-03, REQ-AI-01, REQ-CA-01, TSPEC 5.6–5.8 | Integration |
| Performance | 1 | REQ-SM-NF-01 | Integration |
| Idempotency | 3 | REQ-SM-03, REQ-FC-04 | Unit |
| Observability | 4 | REQ-SM-NF-05, FSPEC-RT-01 | Unit |
| **Total** | **86** | | |

---

## 3. Properties

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-SM-01 | `createFeatureState()` must return a `FeatureState` with `phase: REQ_CREATION`, the given slug and config, and current timestamps when called with a valid slug and config | REQ-SM-02 | Unit | P0 |
| PROP-SM-02 | `transition()` must transition from `REQ_CREATION` to `REQ_REVIEW` with `dispatch_reviewers` side effect when a `lgtm` event is received | REQ-SM-03, FSPEC-SM-01 | Unit | P0 |
| PROP-SM-03 | `transition()` must transition from each `*_CREATION` phase to the corresponding `*_REVIEW` phase on `lgtm` for single-discipline features | REQ-SM-03 | Unit | P0 |
| PROP-SM-04 | `transition()` must transition from `REQ_APPROVED` to `FSPEC_CREATION` when `skipFspec === false` on `auto` event | REQ-SM-04, FSPEC-SM-01 | Unit | P1 |
| PROP-SM-05 | `transition()` must transition from `REQ_APPROVED` to `TSPEC_CREATION` when `skipFspec === true` on `auto` event | REQ-SM-04, FSPEC-SM-01 | Unit | P1 |
| PROP-SM-06 | `transition()` must transition from each `*_APPROVED` phase to the next `*_CREATION` phase with `dispatch_agent` side effect on `auto` event | REQ-SM-03, BR-SM-02 | Unit | P0 |
| PROP-SM-07 | `transition()` must initialize `forkJoin = { subtasks: { eng: "pending", fe: "pending" } }` when entering `TSPEC_CREATION` for a fullstack feature | REQ-SM-07, FSPEC-SM-01 | Unit | P0 |
| PROP-SM-08 | `transition()` must update `forkJoin.subtasks[agentId]` to `"complete"` on `subtask_complete` when not all subtasks are complete, without transitioning | REQ-SM-07 | Unit | P0 |
| PROP-SM-09 | `transition()` must transition from `TSPEC_CREATION` to `TSPEC_REVIEW` when all fork/join subtasks are `"complete"` | REQ-SM-07, FSPEC-SM-01 | Unit | P0 |
| PROP-SM-10 | `transition()` must apply the same fork/join pattern for `PLAN_CREATION` as for `TSPEC_CREATION` | REQ-SM-08 | Unit | P0 |
| PROP-SM-11 | `transition()` must apply the same fork/join pattern for `IMPLEMENTATION` as for `TSPEC_CREATION` | REQ-SM-11 | Unit | P0 |
| PROP-SM-12 | `transition()` must transition from `IMPLEMENTATION_REVIEW` to `DONE` with completion timestamp when all reviewers approve | REQ-SM-09 | Unit | P0 |
| PROP-SM-13 | `transition()` must update `reviewerStatuses[event.reviewerKey]` and return no side effects when `review_submitted` is received and some reviewers are still `pending` | REQ-RT-03, FSPEC-RT-02 | Unit | P0 |
| PROP-SM-14 | `transition()` must transition from `*_REVIEW` to `*_APPROVED` with `auto_transition` side effect when `evaluateReviewOutcome()` returns `all_approved` | REQ-RT-05, FSPEC-RT-02 | Unit | P0 |
| PROP-SM-15 | `transition()` must transition from `*_REVIEW` to `*_CREATION` with `dispatch_agent(Revise)` when `evaluateReviewOutcome()` returns `has_revision_requested` and `revisionCount <= 3` | REQ-RT-06, FSPEC-RT-02 | Unit | P0 |
| PROP-SM-16 | `transition()` must reset ALL reviewer statuses to `pending` when entering a revision loop | REQ-RT-06, BR-RL-04 | Unit | P0 |
| PROP-SM-17 | `transition()` must increment `revisionCount` for the current phase on each revision loop | BR-RL-01 | Unit | P0 |
| PROP-SM-18 | `transition()` must return `pause_feature` side effect without transitioning when `revisionCount > 3` and a rejection is present | REQ-RT-09, FSPEC-RT-02 | Unit | P0 |
| PROP-SM-19 | `transition()` must emit `dispatch_agent(Resubmit)` for approved sub-task authors and `dispatch_agent(Revise)` for rejected sub-task authors in fullstack revision loops | FSPEC-RT-02, TSPEC 5.1 | Unit | P0 |
| PROP-RT-01 | `computeReviewerManifest()` must return `[eng, qa]` for `REQ_REVIEW` with `backend-only` discipline | REQ-RT-01, REQ-RT-02, FSPEC-FC-01 | Unit | P0 |
| PROP-RT-02 | `computeReviewerManifest()` must return `[fe, qa]` for `REQ_REVIEW` with `frontend-only` discipline | REQ-RT-01, REQ-FC-04 | Unit | P0 |
| PROP-RT-03 | `computeReviewerManifest()` must return `[eng, fe, qa]` for `REQ_REVIEW` with `fullstack` discipline | REQ-RT-01, REQ-FC-04 | Unit | P0 |
| PROP-RT-04 | `computeReviewerManifest()` must return composite keys for fullstack `TSPEC_REVIEW`: `pm`, `pm:fe_tspec`, `qa`, `qa:fe_tspec`, `fe:be_tspec`, `eng:fe_tspec` (6 entries) | REQ-FC-05, BR-RC-03 | Unit | P0 |
| PROP-RT-05 | `computeReviewerManifest()` must return `[qa]` for `IMPLEMENTATION_REVIEW` regardless of discipline | REQ-RT-02, BR-RC-04 | Unit | P0 |
| PROP-RT-06 | `evaluateReviewOutcome()` must return `"all_approved"` when every reviewer status is `"approved"` | REQ-RT-05 | Unit | P0 |
| PROP-RT-07 | `evaluateReviewOutcome()` must return `"has_revision_requested"` when at least one reviewer has `"revision_requested"` and no reviewers are `"pending"` | FSPEC-RT-02 | Unit | P0 |
| PROP-RT-08 | `evaluateReviewOutcome()` must return `"pending"` when no rejections exist but some reviewers are still `"pending"` | FSPEC-RT-02 | Unit | P0 |
| PROP-AD-01 | `parseRecommendation()` must return `{ status: "approved" }` when content contains `"Recommendation: Approved"` | REQ-RT-04, FSPEC-RT-01 | Unit | P0 |
| PROP-AD-02 | `parseRecommendation()` must return `{ status: "approved" }` when content contains `"Recommendation: Approved with minor changes"` | REQ-RT-04, BR-AD-02 | Unit | P0 |
| PROP-AD-03 | `parseRecommendation()` must return `{ status: "revision_requested" }` when content contains `"Recommendation: Needs revision"` | REQ-RT-04 | Unit | P0 |
| PROP-AD-04 | `parseRecommendation()` must be case-insensitive: `"APPROVED"`, `"approved"`, `"Approved "` must all match | REQ-RT-04, BR-AD-01 | Unit | P0 |
| PROP-AD-05 | `parseRecommendation()` must match `"approved with minor changes"` before `"approved"` when both substrings are present | BR-AD-02 | Unit | P0 |
| PROP-AD-06 | `parseRecommendation()` must ignore Recommendation headings inside fenced code blocks (``` or ~~~) | FSPEC-RT-01 edge case | Unit | P0 |
| PROP-CA-01 | `getContextDocuments()` must return only `overview.md` for `REQ_CREATION` | REQ-CA-02, FSPEC-CA-01 | Unit | P0 |
| PROP-CA-02 | `getContextDocuments()` must return `overview.md`, `REQ`, `FSPEC` for `TSPEC_CREATION` when `skipFspec === false` | REQ-CA-02 | Unit | P0 |
| PROP-CA-03 | `getContextDocuments()` must return `overview.md`, `REQ` (without FSPEC) for `TSPEC_CREATION` when `skipFspec === true` | REQ-CA-02, BR-CA-02 | Unit | P0 |
| PROP-CA-04 | `getContextDocuments()` must return standard creation-phase documents PLUS cross-review files when `isRevision === true` | REQ-CA-03, BR-CA-03 | Unit | P0 |
| PROP-CA-05 | `getContextDocuments()` must return `TSPEC`, `PLAN`, `PROPERTIES` (without overview.md or REQ) for `IMPLEMENTATION` | REQ-CA-02 | Unit | P0 |
| PROP-CA-06 | `getContextDocuments()` must return only the backend TSPEC for backend engineer in fullstack `PLAN_CREATION` when `agentScope === "be"` | BR-CA-04 | Unit | P0 |
| PROP-FC-01 | `initializeFeature()` must default discipline to `"backend-only"` when no discipline is specified | REQ-FC-03 | Unit | P1 |
| PROP-AI-01 | `processAgentCompletion()` must validate artifact exists at expected path before transitioning | REQ-AI-05, BR-SM-04 | Unit | P1 |
| PROP-AI-02 | `processAgentCompletion()` must return `{ action: "retry_agent" }` when artifact is missing after LGTM | REQ-AI-05, TSPEC 5.6 | Unit | P1 |

### 3.2 Contract Properties

Protocol compliance, type conformance, and interface shape.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-CT-01 | `transition()` must be a pure function: given the same `(state, event, now)` inputs, it must always return the same `TransitionResult` with no side effects outside the return value | REQ-SM-NF-04 | Unit | P0 |
| PROP-CT-02 | `StateStore` protocol must expose `load(): Promise<PdlcStateFile>` and `save(state: PdlcStateFile): Promise<void>` | TSPEC 4.3.1 | Unit | P0 |
| PROP-CT-03 | `PdlcDispatcher` protocol must expose all 8 methods: `isManaged`, `getFeatureState`, `initializeFeature`, `processAgentCompletion`, `processReviewCompletion`, `getNextAction`, `processResumeFromBound`, `loadState` | TSPEC 4.3.2 | Unit | P0 |
| PROP-CT-04 | `FakeStateStore` must implement `StateStore` protocol with `loadError`, `saveError`, and `saveCount` injection points | TSPEC 7.2 | Unit | P0 |
| PROP-CT-05 | `FakePdlcDispatcher` must implement `PdlcDispatcher` protocol with call recording arrays for `processAgentCompletion` and `processReviewCompletion` | TSPEC 7.2 | Unit | P0 |
| PROP-CT-06 | `FakeFileSystem` must implement `rename()` and `copyFile()` with correct in-memory semantics and error injection | TSPEC 7.2 | Unit | P0 |
| PROP-CT-07 | `skillNameToAgentId()` must return the correct agent ID for all 4 skill names: `backend-engineer→eng`, `frontend-engineer→fe`, `product-manager→pm`, `test-engineer→qa` | BR-AD-04 | Unit | P0 |
| PROP-CT-08 | `reviewerKey()` must return `agentId` when scope is undefined and `agentId:scope` when scope is defined | TSPEC 5.3 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-EH-01 | `transition()` must throw `InvalidTransitionError` with phase, event type, and valid events when an invalid event is received for the current phase | TSPEC 5.1, FSPEC-SM-01 | Unit | P0 |
| PROP-EH-02 | `transition()` must throw `InvalidTransitionError` when any event is received for a feature in `DONE` phase | REQ-SM-09, BR-SM-03 | Unit | P0 |
| PROP-EH-03 | `FileStateStore.load()` must return fresh state when the state file does not exist | FSPEC-SM-02 | Unit | P0 |
| PROP-EH-04 | `FileStateStore.load()` must return fresh state when the state file is empty (0 bytes) | FSPEC-SM-02 edge case | Unit | P0 |
| PROP-EH-05 | `FileStateStore.load()` must return fresh state when the state file contains invalid JSON | REQ-SM-NF-02, FSPEC-SM-02 | Unit | P0 |
| PROP-EH-06 | `FileStateStore.load()` must return fresh state when the state file version is newer than `CURRENT_VERSION` | REQ-SM-10, FSPEC-SM-02 | Unit | P0 |
| PROP-EH-07 | `FileStateStore.load()` must copy the original file to `.bak` and return fresh state when migration fails | REQ-SM-10, BR-PS-06 | Unit | P0 |
| PROP-EH-08 | `FileStateStore.save()` must throw and preserve the previous state file when the rename operation fails | BR-PS-01, TSPEC 5.2 | Unit | P0 |
| PROP-EH-09 | `processReviewCompletion()` must return `{ action: "pause" }` with a file-missing message when the cross-review file does not exist | REQ-RT-04, FSPEC-RT-01 Failure Case 1 | Unit | P0 |
| PROP-EH-10 | `processReviewCompletion()` must return `{ action: "pause" }` with a missing-heading message when the cross-review file has no Recommendation heading | FSPEC-RT-01 Failure Case 2 | Unit | P0 |
| PROP-EH-11 | `processReviewCompletion()` must return `{ action: "pause" }` with a parse-error message when the Recommendation value is unrecognized | FSPEC-RT-01 Failure Case 3 | Unit | P0 |
| PROP-EH-12 | `parseRecommendation()` must return `{ status: "parse_error" }` when multiple Recommendation headings are found | BR-AD-03 | Unit | P0 |
| PROP-EH-13 | `computeReviewerManifest()` must throw an error when an unknown discipline value is provided | FSPEC-FC-01 edge case | Unit | P0 |
| PROP-EH-14 | `computeReviewerManifest()` must throw an error when a non-review phase is provided | FSPEC-FC-01 edge case | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-01 | `FileStateStore.save()` must write the state as JSON with 2-space indent to a `.tmp` file, then rename to the final path | REQ-SM-05, BR-PS-03 | Unit | P0 |
| PROP-DI-02 | `FileStateStore.save()` must create the `state/` directory if it does not exist | FSPEC-SM-02 edge case | Unit | P0 |
| PROP-DI-03 | `FileStateStore.load()` must run sequential migration chain (v1→v2→v3, not v1→v3) when the persisted version is older than `CURRENT_VERSION` | REQ-SM-10, BR-PS-05 | Unit | P0 |
| PROP-DI-04 | `FileStateStore.load()` must persist the migrated state atomically after successful migration | FSPEC-SM-02 | Unit | P0 |
| PROP-DI-05 | `FeatureState.completedAt` must be set to the current timestamp when phase transitions to `DONE` and must be `null` for all other phases | REQ-SM-09 | Unit | P0 |
| PROP-DI-06 | `FeatureState.updatedAt` must be updated on every phase transition | REQ-SM-02 | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-INT-01 | Orchestrator must check `pdlcDispatcher.isManaged()` and route LGTM/TASK_COMPLETE signals to `processAgentCompletion()` for managed features | REQ-AI-01, TSPEC 5.8 | Integration | P0 |
| PROP-INT-02 | Orchestrator must use existing `RoutingEngine.decide()` for features without a state record (unmanaged features) | REQ-SM-NF-03 | Integration | P0 |
| PROP-INT-03 | Orchestrator must log a warning and invoke the target agent for one turn when `ROUTE_TO_AGENT` is received for a managed feature, without changing the PDLC phase | REQ-AI-04, BR-DI-02 | Integration | P0 |
| PROP-INT-04 | Orchestrator must re-invoke agent up to 2 more times (3 total) when `processAgentCompletion()` returns `retry_agent`, then escalate via pause after 3 failures | REQ-AI-05, TSPEC QA-Q-01 | Integration | P1 |
| PROP-INT-05 | `DefaultPdlcDispatcher` must call `stateStore.save()` after every successful transition and before returning the dispatch action | BR-PS-01 | Integration | P0 |
| PROP-INT-06 | `DefaultPdlcDispatcher.processReviewCompletion()` must read the cross-review file via `fs.readFile()`, parse it, build the event, transition, persist, and return the dispatch action | TSPEC 5.6 | Integration | P0 |
| PROP-INT-07 | `ContextAssembler.assemble()` must read only the documents specified in `contextDocuments` when the parameter is provided | REQ-CA-01, TSPEC 5.8 | Integration | P0 |
| PROP-INT-08 | Full PDLC lifecycle must progress from `REQ_CREATION` through `DONE` with correct state transitions, review tracking, and state persistence at each step | REQ-SM-01–09 | Integration | P0 |

### 3.6 Performance Properties

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PERF-01 | State transitions (phase changes + state persistence) must complete within 100ms excluding agent invocation time | REQ-SM-NF-01 | Integration | P1 |

### 3.7 Idempotency Properties

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-ID-01 | `transition()` must return the same `TransitionResult` for the same `(state, event, now)` inputs regardless of how many times it is called | REQ-SM-NF-04 | Unit | P0 |
| PROP-ID-02 | `computeReviewerManifest()` must return the same reviewer set for the same `(phase, discipline)` inputs on every invocation | BR-RC-01 | Unit | P0 |
| PROP-ID-03 | `getContextDocuments()` must return the same document set for the same `(phase, slug, config, options)` inputs | BR-CA-01 | Unit | P0 |

### 3.8 Observability Properties

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-OB-01 | `DefaultPdlcDispatcher` must log every state transition with: feature slug, from-phase, to-phase, trigger event, and timestamp | REQ-SM-NF-05 | Unit | P1 |
| PROP-OB-02 | `DefaultPdlcDispatcher` must log a warning when an agent returns `ROUTE_TO_AGENT` for a managed feature | REQ-AI-04, BR-DI-02 | Unit | P1 |
| PROP-OB-03 | `FileStateStore.load()` must log an info message when no state file exists and fresh state is initialized | FSPEC-SM-02 | Unit | P1 |
| PROP-OB-04 | `FileStateStore.load()` must log an error with file path when the state file is corrupted | FSPEC-SM-02 | Unit | P1 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NEG-01 | `transition()` must NOT allow skipping phases — only adjacent transitions as defined in the transition map are valid | REQ-SM-03 | Unit | P0 |
| PROP-NEG-02 | `transition()` must NOT accept any events for a feature in `DONE` phase | REQ-SM-09, BR-SM-03 | Unit | P0 |
| PROP-NEG-03 | `transition()` must NOT transition on `review_submitted` when any reviewers are still `pending` (collect-all-then-evaluate) | FSPEC-RT-02, BR-RL-03 | Unit | P0 |
| PROP-NEG-04 | `transition()` must NOT advance from a `*_REVIEW` phase when any reviewer has status `revision_requested` | REQ-RT-05 | Unit | P0 |
| PROP-NEG-05 | `transition()` must NOT transition on revision when `revisionCount > 3` — must pause instead | REQ-RT-09 | Unit | P0 |
| PROP-NEG-06 | `transition()` must NOT process `lgtm` events in `*_REVIEW` phases — must ignore with warning | FSPEC-SM-01 edge case | Unit | P0 |
| PROP-NEG-07 | `transition()` must NOT process `all_approved` events in `*_CREATION` phases — must ignore with warning | FSPEC-SM-01 edge case | Unit | P0 |
| PROP-NEG-08 | Orchestrator must NOT change the PDLC phase when `ROUTE_TO_AGENT` is received for a managed feature | BR-DI-02 | Unit | P0 |
| PROP-NEG-09 | `FileStateStore.save()` must NOT leave the state file in a partial-write state — atomic write only | BR-PS-03 | Unit | P0 |
| PROP-NEG-10 | `computeReviewerManifest()` must NOT include the authoring agent in its own reviewer set for single-discipline features | BR-RC-02 | Unit | P0 |
| PROP-NEG-11 | `getContextDocuments()` must NOT include FSPEC in context when `skipFspec === true` | BR-CA-02 | Unit | P0 |
| PROP-NEG-12 | `getContextDocuments()` must NOT include documents not listed in the context matrix for the given phase | BR-CA-01 | Unit | P0 |
| PROP-NEG-13 | `FileStateStore.load()` must NOT load a state file with a version newer than `CURRENT_VERSION` | REQ-SM-10 | Unit | P0 |
| PROP-NEG-14 | `processAgentCompletion()` must NOT transition to `DONE` when `TASK_COMPLETE` is received during a non-terminal phase — must treat as LGTM | FSPEC-AI-01 edge case | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-SM-01 | PROP-SM-01 (enum via type), PROP-SM-02–19 (transitions use all phases) | Full |
| REQ-SM-02 | PROP-SM-01, PROP-DI-05, PROP-DI-06 | Full |
| REQ-SM-03 | PROP-SM-02, PROP-SM-03, PROP-SM-06, PROP-NEG-01 | Full |
| REQ-SM-04 | PROP-SM-04, PROP-SM-05 | Full |
| REQ-SM-05 | PROP-DI-01, PROP-INT-05 | Full |
| REQ-SM-06 | PROP-EH-03, PROP-EH-04, PROP-EH-05 | Full |
| REQ-SM-07 | PROP-SM-07, PROP-SM-08, PROP-SM-09 | Full |
| REQ-SM-08 | PROP-SM-10 | Full |
| REQ-SM-09 | PROP-SM-12, PROP-DI-05, PROP-NEG-02 | Full |
| REQ-SM-10 | PROP-DI-03, PROP-DI-04, PROP-EH-06, PROP-EH-07, PROP-NEG-13 | Full |
| REQ-SM-11 | PROP-SM-11 | Full |
| REQ-RT-01 | PROP-RT-01, PROP-RT-02, PROP-RT-03, PROP-RT-04, PROP-RT-05 | Full |
| REQ-RT-02 | PROP-RT-01–05 (encoded in manifest computation) | Full |
| REQ-RT-03 | PROP-SM-13 | Full |
| REQ-RT-04 | PROP-AD-01–06, PROP-EH-09–12 | Full |
| REQ-RT-05 | PROP-SM-14, PROP-RT-06, PROP-NEG-04 | Full |
| REQ-RT-06 | PROP-SM-15, PROP-SM-16, PROP-SM-17 | Full |
| REQ-RT-07 | PROP-CA-04 | Full |
| REQ-RT-08 | — | Not in scope (P1 concurrent dispatch — sequential is P0) |
| REQ-RT-09 | PROP-SM-18, PROP-NEG-05 | Full |
| REQ-AI-01 | PROP-INT-01 | Full |
| REQ-AI-02 | PROP-SM-06 (dispatch_agent side effects use phase-to-agent mapping) | Full |
| REQ-AI-03 | PROP-INT-01 (directive constructed in dispatcher) | Full |
| REQ-AI-04 | PROP-INT-01, PROP-INT-03, PROP-NEG-08 | Full |
| REQ-AI-05 | PROP-AI-01, PROP-AI-02, PROP-INT-04 | Full |
| REQ-FC-01 | PROP-RT-01–05 (discipline input to manifest) | Full |
| REQ-FC-02 | PROP-SM-01 (config in state record) | Full |
| REQ-FC-03 | PROP-FC-01 | Full |
| REQ-FC-04 | PROP-RT-01–05 | Full |
| REQ-FC-05 | PROP-RT-04 (fullstack peer review composite keys) | Full |
| REQ-SA-01–06 | — | Out of scope (documentation task, not code) |
| REQ-CA-01 | PROP-CA-01–06, PROP-INT-07 | Full |
| REQ-CA-02 | PROP-CA-01–06 | Full |
| REQ-CA-03 | PROP-CA-04 | Full |
| REQ-SM-NF-01 | PROP-PERF-01 | Full |
| REQ-SM-NF-02 | PROP-DI-01, PROP-EH-05, PROP-EH-08, PROP-NEG-09 | Full |
| REQ-SM-NF-03 | PROP-INT-02 | Full |
| REQ-SM-NF-04 | PROP-CT-01, PROP-ID-01 | Full |
| REQ-SM-NF-05 | PROP-OB-01, PROP-OB-02 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-SM-01 | PROP-SM-02–19, PROP-NEG-01–07 | Full |
| FSPEC-SM-02 | PROP-DI-01–04, PROP-EH-03–08 | Full |
| FSPEC-RT-01 | PROP-AD-01–06, PROP-EH-09–12, PROP-CT-07 | Full |
| FSPEC-RT-02 | PROP-SM-13–19, PROP-RT-06–08 | Full |
| FSPEC-AI-01 | PROP-AI-01–02, PROP-INT-01, PROP-INT-04, PROP-NEG-14 | Full |
| FSPEC-FC-01 | PROP-RT-01–05, PROP-EH-13–14, PROP-NEG-10 | Full |
| FSPEC-CA-01 | PROP-CA-01–06, PROP-NEG-11–12 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 38 | 32 | 0 | 6 (REQ-SA-01–06, out of scope) |
| P1 | 6 | 6 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 -- no E2E tests needed
       /----------\
      / Integration \      8 properties -- cross-module boundaries
     /----------------\
    /    Unit Tests     \  78 properties -- fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 78 | 91% |
| Integration | 8 | 9% |
| E2E (candidates) | 0 | 0% |
| **Total** | **86** | **100%** |

**E2E justification:** No E2E tests are recommended. The pure-function architecture means all state machine logic is testable at the unit level. The integration tests in PROP-INT-01 through PROP-INT-08 cover the cross-module boundaries (dispatcher ↔ state store ↔ state machine ↔ context matrix). The full lifecycle integration test (PROP-INT-08) verifies the complete PDLC progression without requiring E2E infrastructure.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | REQ-SA-01 through REQ-SA-06 (SKILL.md simplification) have no properties | SKILL.md changes are documentation-only, not testable as code properties | Low | Defer — these are text edits verified by manual review, not automated tests |
| 2 | REQ-RT-08 (concurrent review dispatch) is P1 and not covered | Sequential dispatch is P0; concurrent is a future enhancement | Low | Accept — sequential dispatch is tested; concurrent can be added later |
| 3 | Reviewer timeout mechanism is not implemented | A crashed reviewer agent leaves the feature stuck in `*_REVIEW` | Medium | Acknowledged as P1 known limitation in TSPEC. No property needed until timeout is implemented. |
| 4 | `processResumeFromBound()` has no dedicated properties | This method resets revision count and re-enters review | Medium | Covered implicitly by PROP-SM-18 (revision bound) and integration test PROP-INT-08. Consider adding explicit unit properties if test coverage is insufficient during implementation. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Test Engineer | Initial properties document — 86 properties across 8 categories covering 38/44 requirements (6 out-of-scope SKILL.md documentation requirements) |

---

*End of Document*
