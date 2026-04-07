# Test Properties Document

## Agent Coordination

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-AC |
| **Requirements** | [REQ-agent-coordination](REQ-agent-coordination.md) |
| **Specifications** | [TSPEC-agent-coordination](TSPEC-agent-coordination.md), [FSPEC-agent-coordination](FSPEC-agent-coordination.md) |
| **Execution Plan** | [PLAN-agent-coordination](PLAN-agent-coordination.md) |
| **Version** | 1.1 |
| **Date** | April 6, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

This properties document covers two coordination capabilities in the Ptah CLI: (1) shared worktree/branch strategy (WB domain) that replaces per-agent branches with a single shared `feat-{featureSlug}` branch, and (2) ad-hoc message routing (MR domain) that enables users to @-mention agents for out-of-band revision requests with FIFO queuing and automatic downstream cascade. Non-functional requirements (NF domain) constrain sequential consistency and future extensibility.

### 1.1 Scope

**In scope:**
- All 15 requirements across WB (5), MR (8), and NF (2) domains
- 3 functional specifications (FSPEC-MR-01, FSPEC-MR-02, FSPEC-MR-03)
- TSPEC protocols, algorithms, error handling, and type definitions
- 52 plan tasks across 9 implementation phases

**Out of scope:**
- Concurrent multi-agent execution (parallel phases)
- Conflict resolution for simultaneous writes
- Unsolicited message routing when no workflow is active
- Fork-join phase paths (unchanged by this feature)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 15 | [REQ-agent-coordination](REQ-agent-coordination.md) |
| Functional specifications analyzed | 3 | [FSPEC-agent-coordination](FSPEC-agent-coordination.md) |
| Technical specifications analyzed | 1 | [TSPEC-agent-coordination](TSPEC-agent-coordination.md) |
| Plan tasks reviewed | 52 | [PLAN-agent-coordination](PLAN-agent-coordination.md) |
| Integration boundaries identified | 9 | temporal-orchestrator, skill-activity, artifact-committer, temporal client, git client, feature-lifecycle workflow, ad-hoc parser, response poster, factories |
| Implementation files reviewed | 0 | N/A — not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 30 | REQ-WB-01..05, REQ-MR-01..08, REQ-NF-01 | Unit |
| Contract | 5 | REQ-MR-02, REQ-MR-06, REQ-WB-03 | Unit |
| Error Handling | 10 | REQ-MR-03, REQ-MR-04, REQ-MR-05, REQ-WB-03, REQ-WB-05 | Unit |
| Data Integrity | 7 | REQ-MR-01, REQ-MR-04, REQ-MR-06, REQ-WB-02 | Unit |
| Integration | 6 | REQ-WB-01, REQ-WB-05, REQ-MR-02, REQ-MR-07 | Integration |
| Idempotency | 4 | REQ-WB-04, REQ-WB-05, REQ-MR-06 | Unit |
| Observability | 2 | REQ-MR-05, REQ-MR-04 | Unit |
| **Total** | **63** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-{DOMAIN}-{NUMBER}` — domain prefix matches the source requirement domain (WB, MR, NF).

**Priority:** Inherited from the highest-priority linked requirement (P0 / P1 / P2).

### 3.1 Functional Properties

Core business logic and behavior.

#### Domain WB — Shared Worktree and Branch Strategy

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-WB-01 | `invokeSkill` must create an agent worktree checked out from `feat-{featureSlug}` (no new branch created) | REQ-WB-01, REQ-WB-02, TSPEC §5.3 | Unit | P0 |
| PROP-WB-02 | `addWorktreeOnBranch` must run `git worktree add <path> <branch>` without the `-b` flag | REQ-WB-02, TSPEC §4.2 | Unit | P0 |
| PROP-WB-03 | Worktree path must follow `/tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}` convention | REQ-WB-02, TSPEC §5.3 | Unit | P0 |
| PROP-WB-04 | `commitAndPush` must commit in the worktree (already on `feat-{featureSlug}`) and push directly to `origin feat-{featureSlug}` | REQ-WB-03, TSPEC §5.5 | Unit | P0 |
| PROP-WB-05 | `commitAndPush` must filter staged files to `docs/` changes only | REQ-WB-03, TSPEC §4.2 | Unit | P0 |
| PROP-WB-06 | `commitAndPush` must return `no-changes` status when artifact change list is empty | REQ-WB-03, TSPEC §4.2 | Unit | P0 |
| PROP-WB-07 | `ensureBranchExists` must create branch from `main` and push to origin when branch does not exist locally or on remote | REQ-WB-05, TSPEC §5.1 | Unit | P0 |
| PROP-WB-08 | `ensureBranchExists` must be a no-op when branch already exists | REQ-WB-05, TSPEC §5.1 | Unit | P0 |

#### Domain MR — Ad-Hoc Message Routing

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MR-01 | `parseAdHocDirective` must return a directive with `agentIdentifier` and `instruction` when the first token starts with `@` | REQ-MR-01, FSPEC-MR-01 §Step 2-3 | Unit | P0 |
| PROP-MR-02 | `parseAdHocDirective` must return `null` when the first token does not start with `@` | REQ-MR-01, FSPEC-MR-01 §Step 3 | Unit | P0 |
| PROP-MR-03 | `parseAdHocDirective` must lowercase the agent identifier (case-insensitive matching) | REQ-MR-01, FSPEC-MR-01 BR-02 | Unit | P0 |
| PROP-MR-04 | `parseAdHocDirective` must strip leading whitespace before extracting the first token | REQ-MR-01, FSPEC-MR-01 §Step 2 | Unit | P0 |
| PROP-MR-05 | `parseAdHocDirective` must treat only the first `@token` as the directive; subsequent `@tokens` are part of the instruction | REQ-MR-01, FSPEC-MR-01 Edge Case "Multiple @ tokens" | Unit | P0 |
| PROP-MR-06 | `parseAdHocDirective` must return an empty instruction string when only `@agent` is sent with no trailing text | REQ-MR-01, FSPEC-MR-01 BR-03, Edge Case "Empty instruction" | Unit | P0 |
| PROP-MR-07 | `handleMessage` must send an `adHocRevision` signal to the Temporal workflow for a known agent | REQ-MR-02, FSPEC-MR-01 §Step 8 | Unit | P0 |
| PROP-MR-08 | `handleMessage` must construct the workflow ID as `ptah-{featureSlug}` without consulting any lookup table or query API | REQ-MR-08, FSPEC-MR-01 §Step 6, TSPEC §5.2 | Unit | P0 |
| PROP-MR-09 | `startFeatureWorkflow` must register the workflow under the deterministic ID `ptah-{featureSlug}` | REQ-MR-08, TSPEC §5.2 | Unit | P0 |
| PROP-MR-10 | `handleMessage` must post a visible acknowledgement reply after successful signal dispatch | REQ-MR-04, FSPEC-MR-01 §Step 9 | Unit | P1 |
| PROP-MR-11 | `adHocRevisionSignal` handler must append the signal payload to the end of the FIFO queue | REQ-MR-06, FSPEC-MR-02 §Step 1, TSPEC §6.2 | Unit | P0 |
| PROP-MR-12 | `drainAdHocQueue` must process signals in FIFO order (first-in, first-out) | REQ-MR-06, FSPEC-MR-02 BR-01 | Unit | P0 |
| PROP-MR-13 | `drainAdHocQueue` must invoke the named agent using `dispatchSingleAgent` with the instruction as `adHocInstruction` | REQ-MR-02, TSPEC §6.2 | Unit | P0 |
| PROP-MR-14 | `drainAdHocQueue` must call `executeCascade` after each ad-hoc agent completes with `LGTM` or `TASK_COMPLETE` | REQ-MR-07, FSPEC-MR-02 §Step 3e | Unit | P0 |
| PROP-MR-15 | `drainAdHocQueue` must skip cascade and process next signal when ad-hoc agent result is `cancelled` | FSPEC-MR-02 Error Scenarios, TSPEC §6.2 | Unit | P0 |
| PROP-MR-16 | `executeCascade` must collect all `type:"review"` phases with strictly higher index than the revised agent's position | REQ-MR-07, FSPEC-MR-03 §Step 2-3, TSPEC §6.3 | Unit | P0 |
| PROP-MR-17 | `executeCascade` must execute collected cascade phases sequentially in workflow config order | REQ-MR-07, FSPEC-MR-03 BR-02 | Unit | P0 |
| PROP-MR-18 | `executeCascade` must return immediately (no-op) when no `type:"review"` phases exist after the revised agent's position | FSPEC-MR-03 §Step 4 | Unit | P0 |
| PROP-MR-19 | Cascade revision loop must identify creation phase using positional convention `phases[reviewIndex - 1]` | REQ-MR-07, FSPEC-MR-03 BR-03 | Unit | P0 |
| PROP-MR-20 | `findAgentPhase` must return the first phase where `phase.agent === agentId` | TSPEC §6.4 | Unit | P0 |
| PROP-MR-21 | `findAgentPhase` must return `null` when the agent does not appear in any phase | TSPEC §6.4, FSPEC-MR-03 §Step 2 | Unit | P0 |

#### Domain NF — Non-Functional

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-01 | `adHocInProgress` flag must be set to `true` before dequeuing and `false` after ad-hoc + cascade completes | REQ-NF-01, TSPEC §6.2 | Unit | P0 |

### 3.2 Contract Properties

Protocol compliance, type conformance, and interface shape.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MR-22 | `AdHocRevisionSignal` must include fields: `targetAgentId` (string), `instruction` (string), `requestedBy` (string), `requestedAt` (ISO 8601 string) | REQ-MR-02, TSPEC §4.3 | Unit | P0 |
| PROP-MR-23 | `signalAdHocRevision` must send the signal with name `"ad-hoc-revision"` to the workflow handle | TSPEC §4.2, §6.2 | Unit | P0 |
| PROP-WB-09 | `CommitAndPushResult` must include fields: `commitSha` (string\|null), `pushStatus` (enum), `featureBranch` (string), optional `errorMessage` | REQ-WB-03, TSPEC §4.2 | Unit | P0 |
| PROP-MR-24 | `FeatureWorkflowState` must include `adHocQueue: AdHocRevisionSignal[]` and `adHocInProgress: boolean` | REQ-MR-06, TSPEC §4.3 | Unit | P0 |
| PROP-MR-25 | `SkillActivityInput` must include optional `adHocInstruction` field for threading ad-hoc instructions | REQ-MR-02, TSPEC §4.3 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MR-26 | `handleMessage` must post error reply "Agent @{id} is not part of the {slug} workflow. Known agents: ..." when agent is not in workflow config | REQ-MR-03, FSPEC-MR-01 §Step 5 | Unit | P1 |
| PROP-MR-27 | `handleMessage` must post error reply "No active workflow found for {slug}." when `signalAdHocRevision` throws `WorkflowNotFoundError` | REQ-MR-05, FSPEC-MR-01 §Step 7 | Unit | P1 |
| PROP-MR-28 | `handleMessage` must post error reply "Failed to dispatch to @{id}. Please try again." when signal delivery fails with a transient error | FSPEC-MR-01 Error Scenarios, TSPEC §7 | Unit | P1 |
| PROP-MR-29 | `handleMessage` must log a warning but NOT throw when the Discord acknowledgement post fails (signal already sent) | FSPEC-MR-01 BR-05, TSPEC §7 | Unit | P1 |
| PROP-WB-10 | `commitAndPush` must return `push-error` status with error message when `git push` fails | REQ-WB-03, TSPEC §7 | Unit | P0 |
| PROP-WB-11 | `commitAndPush` must return `commit-error` status with error message when `git commit` fails | REQ-WB-03, TSPEC §7 | Unit | P0 |
| PROP-WB-12 | `ensureBranchExists` failure must prevent workflow submission (fatal error) | REQ-WB-05, TSPEC §7 | Unit | P0 |
| PROP-MR-30 | `signalAdHocRevision` must throw `WorkflowNotFoundError` when the target workflow does not exist | REQ-MR-05, REQ-MR-08, TSPEC §4.2 | Unit | P0 |
| PROP-MR-31 | `executeCascade` must skip cascade and log a warning when the revised agent is not found in any workflow phase | FSPEC-MR-03 §Step 2, TSPEC §7 | Unit | P0 |
| PROP-MR-32 | Cascade phase failure (non-retryable) must enter the standard failure flow; cascade halts on cancel | FSPEC-MR-03 Error Scenarios | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MR-33 | `parseAdHocDirective` must trim leading and trailing whitespace from the instruction remainder | REQ-MR-01, FSPEC-MR-01 BR-03 | Unit | P0 |
| PROP-MR-34 | Acknowledgement must include agent name and first 100 characters of instruction | REQ-MR-04, FSPEC-MR-01 §Step 9 | Unit | P1 |
| PROP-MR-35 | Acknowledgement must truncate instruction with ellipsis when it exceeds 100 characters, and omit ellipsis when it does not | REQ-MR-04, FSPEC-MR-01 §Step 9 | Unit | P1 |
| PROP-MR-36 | Error reply for unknown agent must include the unknown agent name and comma-separated list of known agents | REQ-MR-03, FSPEC-MR-01 §Step 5 | Unit | P1 |
| PROP-MR-37 | `adHocQueue` must never reorder, drop, or deduplicate signals | REQ-MR-06, FSPEC-MR-02 BR-01 | Unit | P0 |
| PROP-WB-13 | Worktree path components (`agentId`, `featureSlug`, `phaseId`) must be correctly interpolated into the path template | REQ-WB-02, TSPEC §5.3 | Unit | P0 |
| PROP-MR-38 | `ContinueAsNewPayload` must carry `adHocQueue` state across the continue-as-new boundary (no signals lost) | REQ-MR-06, FSPEC-MR-02 Edge Case "Continue-as-new" | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-WB-14 | Downstream agent's worktree must contain upstream agent's committed artifacts when created from `feat-{featureSlug}` | REQ-WB-01, REQ-WB-02, REQ-WB-03 (AC) | Integration | P0 |
| PROP-WB-15 | `startWorkflowForFeature` must call `ensureBranchExists` before submitting the Temporal workflow | REQ-WB-05, TSPEC §5.1 | Integration | P0 |
| PROP-MR-39 | `handleMessage` end-to-end: parse directive → resolve agent → send signal → post ack (full pipeline) | REQ-MR-01, REQ-MR-02, REQ-MR-04, FSPEC-MR-01 | Integration | P0 |
| PROP-MR-40 | `drainAdHocQueue` must be called at each phase transition point in the main workflow loop | FSPEC-MR-02 §Step 4, TSPEC §6.2 | Integration | P0 |
| PROP-MR-41 | Each cascade phase must pull the latest `feat-{featureSlug}` before starting (sees cumulative results of prior phases) | REQ-MR-07, FSPEC-MR-03 BR-04 | Integration | P0 |
| PROP-MR-42 | Workflow must drain remaining queued signals before terminating when all phases are complete | FSPEC-MR-02 Edge Case "Workflow terminates with non-empty queue" | Integration | P0 |

### 3.6 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-WB-16 | `invokeSkill` idempotency check must use path-only matching (`wt.path === worktreeBasePath`) and NOT branch-name matching | REQ-WB-04, TSPEC §5.4 | Unit | P0 |
| PROP-WB-17 | Activity retry must reuse an existing worktree at the same path without error, regardless of other worktrees on the same branch | REQ-WB-04 (AC) | Unit | P0 |
| PROP-WB-18 | `ensureBranchExists` must be idempotent: calling it when the branch already exists must not create a duplicate or fail | REQ-WB-05 (AC #2), TSPEC §5.1 | Unit | P0 |
| PROP-MR-46 | Same-agent queued twice must process both sequentially (not deduplicate) | REQ-MR-06, FSPEC-MR-02 Edge Case "Same agent queued twice" | Unit | P0 |

### 3.7 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MR-44 | `handleMessage` must log the error when signal delivery fails with a transient error | FSPEC-MR-01 Error Scenarios, TSPEC §7 | Unit | P1 |
| PROP-MR-45 | `handleMessage` must log a warning when the Discord acknowledgement post fails | FSPEC-MR-01 BR-05, TSPEC §7 | Unit | P1 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. Derived from specification constraints and the inverse of positive properties.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NEG-01 | `parseAdHocDirective` must NOT classify a mid-sentence `@mention` as an ad-hoc request (only first-token `@` qualifies) | REQ-MR-01, FSPEC-MR-01 BR-01 | Unit | P0 |
| PROP-NEG-02 | `handleMessage` must NOT send a Temporal signal when the `@`-mentioned agent is not part of the workflow | REQ-MR-03, FSPEC-MR-01 §Step 5 | Unit | P1 |
| PROP-NEG-04 | `commitAndPush` must NOT create an intermediate per-agent branch (direct push only) | REQ-WB-03, TSPEC §5.5 | Unit | P0 |
| PROP-NEG-05 | `invokeSkill` idempotency check must NOT use branch-name matching (`wt.branch === ...`) | REQ-WB-04, TSPEC §5.4 | Unit | P0 |
| PROP-NEG-06 | `drainAdHocQueue` must NOT dequeue the next signal while a cascade triggered by the current signal is in progress | REQ-MR-06, FSPEC-MR-02 BR-02 | Unit | P0 |
| PROP-NEG-07 | `executeCascade` must NOT include `type:"creation"`, `type:"approved"`, or `type:"implementation"` phases in the cascade | REQ-MR-07, FSPEC-MR-03 BR-06 | Unit | P0 |
| PROP-NEG-08 | `handleMessage` must NOT parse bot messages as ad-hoc requests | FSPEC-MR-01 Edge Case "Bot messages", TSPEC §6.1 | Unit | P0 |
| PROP-NEG-09 | `adHocQueue` must NOT drop, reorder, or deduplicate signals under any circumstances | REQ-MR-06, FSPEC-MR-02 BR-01 | Unit | P0 |
| PROP-NEG-10 | `executeCascade` must NOT alter the workflow's `currentPhaseId` or `completedPhaseIds` | FSPEC-MR-03 BR-07 | Unit | P0 |
| PROP-NEG-11 | `addWorktreeOnBranch` must NOT create a new branch (no `-b` flag) | REQ-WB-02, TSPEC §4.2 | Unit | P0 |
| PROP-NEG-12 | Cascade revision loop must NOT short-circuit back to the original ad-hoc revision agent; it must target the positional creation phase | REQ-MR-07, FSPEC-MR-03 BR-03 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-WB-01 | PROP-WB-01, PROP-WB-14 | Full |
| REQ-WB-02 | PROP-WB-01, PROP-WB-02, PROP-WB-03, PROP-WB-13, PROP-NEG-11 | Full |
| REQ-WB-03 | PROP-WB-04, PROP-WB-05, PROP-WB-06, PROP-WB-09, PROP-WB-10, PROP-WB-11, PROP-NEG-04 | Full |
| REQ-WB-04 | PROP-WB-16, PROP-WB-17, PROP-NEG-05 | Full |
| REQ-WB-05 | PROP-WB-07, PROP-WB-08, PROP-WB-12, PROP-WB-15, PROP-WB-18 | Full |
| REQ-MR-01 | PROP-MR-01, PROP-MR-02, PROP-MR-03, PROP-MR-04, PROP-MR-05, PROP-MR-06, PROP-MR-33, PROP-NEG-01 | Full |
| REQ-MR-02 | PROP-MR-07, PROP-MR-08, PROP-MR-13, PROP-MR-22, PROP-MR-23, PROP-MR-25, PROP-MR-39 | Full |
| REQ-MR-03 | PROP-MR-26, PROP-MR-36, PROP-NEG-02 | Full |
| REQ-MR-04 | PROP-MR-10, PROP-MR-34, PROP-MR-35 | Full |
| REQ-MR-05 | PROP-MR-27, PROP-MR-30 | Full |
| REQ-MR-06 | PROP-MR-11, PROP-MR-12, PROP-MR-37, PROP-MR-38, PROP-MR-46, PROP-NEG-06, PROP-NEG-09, PROP-MR-42 | Full |
| REQ-MR-07 | PROP-MR-14, PROP-MR-16, PROP-MR-17, PROP-MR-18, PROP-MR-19, PROP-MR-31, PROP-MR-32, PROP-MR-41, PROP-NEG-07, PROP-NEG-10, PROP-NEG-12 | Full |
| REQ-MR-08 | PROP-MR-08, PROP-MR-09, PROP-MR-30 | Full |
| REQ-NF-01 | PROP-NF-01, PROP-NEG-06 | Full |
| REQ-NF-02 | — | Documentation — no testable code property (design constraint verified by TSPEC review) |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-MR-01 (Routing Flow) | PROP-MR-01..10, PROP-MR-22..23, PROP-MR-26..30, PROP-MR-33..36, PROP-MR-39, PROP-NEG-01..02, PROP-NEG-08 | Full |
| FSPEC-MR-02 (Queue Management) | PROP-MR-11..15, PROP-MR-24, PROP-MR-37..38, PROP-MR-40, PROP-MR-42, PROP-MR-46, PROP-NEG-06, PROP-NEG-09 | Full |
| FSPEC-MR-03 (Downstream Cascade) | PROP-MR-16..19, PROP-MR-21, PROP-MR-31..32, PROP-MR-41, PROP-NEG-07, PROP-NEG-10, PROP-NEG-12 | Full |
| TSPEC §5 (WB Algorithms) | PROP-WB-01..08, PROP-WB-10..18, PROP-NEG-04..05, PROP-NEG-11 | Full |
| TSPEC §6 (MR Algorithms) | PROP-MR-07..09, PROP-MR-11..21, PROP-MR-40, PROP-NF-01 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 10 | 10 | 0 | 0 |
| P1 | 5 | 4 | 0 | 1 (REQ-NF-02 — documentation only) |
| P2 | 0 | 0 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 — no E2E tests needed
       /----------\
      / Integration \      6 — cross-module boundaries
     /----------------\
    /    Unit Tests     \  59 — fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 57 | 90.5% |
| Integration | 6 | 9.5% |
| E2E (candidates) | 0 | 0% |
| **Total** | **63** | **100%** |

**E2E justification:** No E2E tests are recommended. All critical behaviors (parsing, signal dispatch, queue FIFO, cascade collection) can be verified at the unit level using protocol-based fakes. Integration properties cover cross-module wiring (worktree → push → downstream visibility, handleMessage pipeline, workflow drain loop). The Temporal workflow queue and cascade logic can be tested via extracted pure helper functions and Temporal's testing utilities without requiring a live Temporal server.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | REQ-NF-02 (shared branch must not block parallel future work) has no testable code property | Low — this is a documentation/design constraint, not a runtime behavior | Low | Verified by TSPEC review (§5.5 documents the serialized push approach). No code test needed. |
| 2 | FSPEC-MR-02 edge case "Continue-as-new with non-empty queue" is covered by data integrity property PROP-MR-38 but has no explicit integration test verifying the full CAN cycle | Queue signals could be lost during continue-as-new if serialization is incorrect | Medium | Ensure Plan Task 48 (`buildContinueAsNewPayload` carries `adHocQueue`) includes a test that verifies round-trip: enqueue signals → trigger CAN → verify signals are present in new workflow execution state. |
| 3 | FSPEC-MR-02 BR-05 (signal during ROUTE_TO_USER wait) — the property PROP-MR-12 covers FIFO ordering but does not explicitly test the interleaving with question flow | A signal arriving during user-answer wait could be processed prematurely if the dequeue condition has a bug | Medium | Plan Phase H (Task 49) should include a test scenario: signal arrives while workflow awaits `userAnswer` → signal is NOT processed until answer completes. |
| 4 | FSPEC-MR-03 edge case "Skip conditions during cascade" — no dedicated property | Cascade could execute phases that should be skipped, producing incorrect behavior | Low | Add a test in Plan Task 41/42 (cascade tests) that configures a `skip_if` condition on a review phase and verifies it is respected during cascade. Covered implicitly by "same dispatch logic" but an explicit test is safer. |
| 5 | FSPEC-MR-02 edge case "Workflow terminates with non-empty queue" — covered by PROP-MR-42 but is an integration-level concern | If the main loop exits before draining, queued signals are silently dropped | Medium | Plan Task 51 should verify that the workflow's terminal condition waits for queue drain. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 6, 2026 | Test Engineer | Initial properties document |
| 1.1 | April 6, 2026 | Test Engineer | Address engineer cross-review: remove PROP-NEG-03 (contradicts FSPEC-MR-01 BR-04 implicit signal attempt), rename PROP-WB-19→PROP-MR-46 (correct domain prefix), merge PROP-MR-43 into PROP-MR-31 (remove overlap) |

---

*End of Document*
