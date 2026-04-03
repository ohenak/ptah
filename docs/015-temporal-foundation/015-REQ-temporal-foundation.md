# Requirements Document

## Milestone 1 — Temporal Foundation + Config-Driven Workflow

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-TEMPORAL |
| **Parent Document** | [REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | April 1, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Milestone** | 1 of 3 |
| **Depends On** | Ptah v4.0 (current implementation) |

---

## 1. Purpose

Replace Ptah's custom orchestration infrastructure with Temporal durable workflows, and make the PDLC workflow configurable via structured configuration files rather than hardcoded TypeScript enums and switch statements.

**Why this is Milestone 1:** This delivers crash recovery, deterministic replay, and workflow configurability — the two highest-impact gaps identified in the portability analysis. After this milestone, Ptah can orchestrate its own continued development on Milestones 2 and 3 with greater reliability than the current implementation.

**What is replaced:**

| Current Custom Component | Replaced By |
|--------------------------|-------------|
| `state-machine.ts` (680 lines, hardcoded transitions) | Temporal Workflow + config-driven phase graph |
| `pdlc-dispatcher.ts` (hardcoded `phaseToAgentId`, reviewer manifests) | Config-driven agent mappings + Temporal Activities |
| `thread-queue.ts` (per-thread serialization) | Temporal's built-in workflow-level concurrency |
| `merge-lock.ts` | Temporal's deterministic execution model |
| `invocation-guard.ts` | Temporal Activity idempotency tokens |
| `question-store.ts` + `question-poller.ts` (file-based polling) | Temporal Signals (workflow pauses until signal received) |
| `thread-state-manager.ts` | Temporal workflow state (event-sourced, queryable) |
| JSON state file (`pdlc-state.json`) | Temporal's durable workflow history |

**What is kept:**

| Component | Reason |
|-----------|--------|
| Discord integration (services/discord.ts) | Works well; abstracted in Milestone 2 |
| Claude Agent SDK (services/claude-code.ts) | Best-in-class for code-aware agent execution |
| Git worktree management (worktree-registry.ts) | Essential for parallel agent isolation |
| Context assembler (context-assembler.ts) | 3-layer pattern is sound; directives become config-driven |
| Routing engine (router.ts) | Signal parsing is generic |
| Agent registry (agent-registry.ts) | Clean interface; extended with config-driven registration |

---

## 2. User Stories

### US-10: Orchestrator Recovers from Crashes Without Data Loss

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer is running Ptah to manage a multi-phase feature lifecycle. The Orchestrator process crashes (OOM, host restart, network partition) midway through an agent invocation. When the process restarts, the workflow resumes from its last completed step — no manual intervention, no duplicate work, no lost state. |
| **Goals** | Zero data loss on Orchestrator crash. Automatic workflow resumption. No duplicate agent invocations for already-completed phases. |
| **Pain points** | Current implementation stores state in a JSON file (`pdlc-state.json`) and in-memory structures. A crash can leave state inconsistent — partially written JSON, in-flight invocations with no record, and worktrees that were never cleaned up. |
| **Key needs** | Event-sourced workflow state that survives process restarts. Idempotent Activity execution. Automatic retry of interrupted Activities with backoff. |

### US-11: Developer Configures Custom Workflow Phases

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use Ptah for a different workflow than the default 7-phase PDLC. For example: `Discovery → Design → Implementation → QA → Deploy`, or a simplified `Spec → Build → Review`. They define their custom phases, agent assignments, reviewer manifests, and transition rules in a configuration file. The Orchestrator reads this config and executes the custom workflow without TypeScript code changes. |
| **Goals** | Any linear or branching workflow can be expressed in configuration. Adding/removing/reordering phases requires zero code changes. |
| **Pain points** | Current implementation hardcodes 15 phases as a TypeScript enum, agent-to-phase mappings as switch statements, and reviewer manifests as static tables. Changing the workflow requires modifying 4+ source files and recompiling. |
| **Key needs** | Declarative phase definition in YAML/JSON. Configurable agent-to-phase mappings. Configurable reviewer assignments per phase and discipline. Config validation at startup. |

### US-12: Developer Observes Workflow State via Temporal UI

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to see the real-time state of all active feature workflows — which phase each feature is in, which agents are running, which reviews are pending, and what the full execution history looks like. They open the Temporal Web UI and get this information without reading log files or JSON state files. |
| **Goals** | Real-time workflow visibility. Full execution history with timestamps. Ability to inspect any past workflow step. |
| **Pain points** | Current observability is limited to console logs and the JSON state file. No history of transitions, no timeline view, no ability to inspect what happened at step N. |
| **Key needs** | Temporal Queries for current phase, pending agents, and feature config. Meaningful workflow IDs (feature slug). Searchable workflow attributes. |

### US-13: Developer Migrates Existing Ptah State to Temporal

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer has existing Ptah v4 features at various PDLC phases (some in review, some in creation, some paused on questions). They upgrade to Ptah v5 (Temporal-based). The migration tool reads the existing `pdlc-state.json` and creates Temporal workflows for each in-progress feature, positioned at the correct phase. |
| **Goals** | Zero-downtime migration. In-progress features continue from their current phase. No features are lost or restarted. |
| **Pain points** | Without migration, all in-progress features would need to restart from scratch — potentially losing days of accumulated review cycles and approvals. |
| **Key needs** | Migration CLI command (`ptah migrate`). Validation that all features were imported. Dry-run mode. Rollback guidance. |

---

## 3. Requirements

### Domain: TF — Temporal Foundation

#### REQ-TF-01: PDLC Workflow as Temporal Workflow

| Attribute | Detail |
|-----------|--------|
| **Title** | Feature Lifecycle as Temporal Workflow |
| **Description** | Each feature managed by Ptah runs as a single Temporal Workflow. The workflow progresses through phases defined in configuration, dispatching Activities for agent invocations and waiting for Signals for human input. The workflow ID is `ptah-feature-{feature-slug}`. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** A new feature is initiated (via Discord thread or CLI)<br>**When:** The Orchestrator creates a Temporal Workflow with ID `ptah-feature-{slug}`<br>**Then:** The workflow begins at the first configured phase and progresses through the phase graph until completion or pause. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10, US-11 |
| **Dependencies** | REQ-CD-01, REQ-CD-04 |

#### REQ-TF-02: Skill Invocation as Temporal Activity

| Attribute | Detail |
|-----------|--------|
| **Title** | Agent Dispatch via Temporal Activities |
| **Description** | Each agent invocation (skill call) is a Temporal Activity. The Activity wraps the existing `SkillInvoker.invoke()` call with Temporal's retry, timeout, and heartbeat mechanisms. Activities are idempotent — re-execution after a crash produces the same result or safely skips already-completed work. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** A workflow reaches a phase that requires agent dispatch<br>**When:** The workflow executes a Temporal Activity for the assigned agent<br>**Then:** The Activity invokes the Claude Agent SDK via `SkillInvoker`, returns the routing signal and artifact changes, and the workflow advances based on the result. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10 |
| **Dependencies** | REQ-TF-01 |

#### REQ-TF-03: Human-in-the-Loop via Temporal Signals

| Attribute | Detail |
|-----------|--------|
| **Title** | Human Input via Temporal Signals |
| **Description** | When an agent returns `ROUTE_TO_USER`, the workflow pauses and waits for a Temporal Signal containing the user's answer. The Signal is sent by the messaging layer (Discord listener, CLI prompt, webhook handler). This replaces the file-based `pending.md` polling mechanism. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** An agent returns `ROUTE_TO_USER` with a question<br>**When:** The workflow emits a notification (via the messaging provider) and waits for a `user-answer` Signal<br>**Then:** The workflow resumes with the user's answer injected into the next agent's context. The workflow can wait indefinitely without consuming resources. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10 |
| **Dependencies** | REQ-TF-01 |

#### REQ-TF-04: Workflow State Queries

| Attribute | Detail |
|-----------|--------|
| **Title** | Query Workflow State at Any Time |
| **Description** | Each Temporal Workflow exposes Queries for its current state: current phase, active agents, pending reviewers, feature config, phase history, and elapsed time. These Queries are used by the messaging layer (to post status updates), the CLI (for `ptah status`), and the Temporal Web UI. |
| **Acceptance Criteria** | **Who:** Developer or messaging layer<br>**Given:** A feature workflow is running<br>**When:** A Query is sent to the workflow (via Temporal SDK, CLI, or Web UI)<br>**Then:** The workflow returns its current phase, list of completed phases, active agent IDs, pending reviewer keys, and feature configuration. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-12 |
| **Dependencies** | REQ-TF-01 |

#### REQ-TF-05: Activity Failure Recovery

| Attribute | Detail |
|-----------|--------|
| **Title** | Automatic Retry and Failure Handling for Activities |
| **Description** | Temporal Activities for agent invocations use configurable retry policies (max attempts, initial interval, backoff coefficient, max interval). Non-retryable errors (e.g., `ROUTE_TO_USER`, revision bound exceeded) are marked as such. After all retries are exhausted, the workflow transitions to a failure state and notifies the user. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** A skill invocation Activity fails with a transient error (timeout, rate limit)<br>**When:** Temporal retries the Activity according to the configured retry policy<br>**Then:** If retry succeeds, the workflow continues. If all retries are exhausted, the workflow enters a failed state and sends a notification to the user with the error details. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10 |
| **Dependencies** | REQ-TF-02 |

#### REQ-TF-06: Fork/Join via Temporal Child Workflows or Parallel Activities

| Attribute | Detail |
|-----------|--------|
| **Title** | Parallel Agent Dispatch for Fork/Join Phases |
| **Description** | For phases configured as fork/join (e.g., fullstack features where both `eng` and `fe` work in parallel), the workflow dispatches multiple Activities concurrently and waits for all to complete before advancing. Partial completion is tracked. If any agent fails, the workflow follows the configured failure policy (wait-for-all or fail-fast). |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** A workflow reaches a fork/join phase with agents `[eng, fe]`<br>**When:** The workflow dispatches both Activities concurrently<br>**Then:** The workflow waits for both to complete. If both succeed, it advances to the next phase. If one fails, the behavior follows the configured failure policy. Partial completion state is visible via Queries. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10, US-11 |
| **Dependencies** | REQ-TF-02, REQ-CD-01 |

#### REQ-TF-07: Worktree Lifecycle as Activity Side Effect

| Attribute | Detail |
|-----------|--------|
| **Title** | Git Worktree Management Within Activities |
| **Description** | The creation, use, merge, and cleanup of git worktrees remain within the Activity execution boundary. The Activity creates a worktree before invoking the skill, merges changes back after success, and cleans up the worktree in a finally block. Orphaned worktrees from crashed Activities are pruned on Orchestrator startup (existing behavior preserved). |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** An Activity is dispatched for agent `eng` on feature `my-feature`<br>**When:** The Activity creates a worktree, invokes the skill, and the skill completes successfully<br>**Then:** The Activity merges the worktree changes back to the feature branch and removes the worktree. If the Activity crashes mid-execution, the worktree is cleaned up on next startup. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10 |
| **Dependencies** | REQ-TF-02 |

#### REQ-TF-08: Review Phase as Workflow Loop

| Attribute | Detail |
|-----------|--------|
| **Title** | Review Cycles Modeled as Workflow Loops |
| **Description** | Review phases dispatch reviewer Activities in parallel, collect their recommendations (approved / revision_requested), and either advance to the approved phase or loop back to the creation phase for revision. The revision count is tracked in workflow state. Revision bound (configurable, default 3) triggers a pause with user notification. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** A workflow enters a review phase with 3 configured reviewers<br>**When:** All reviewers submit their recommendations<br>**Then:** If all approve, the workflow advances. If any request revision, the workflow loops back to the creation phase with revision count incremented. If revision count exceeds the configured bound, the workflow pauses and notifies the user. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10, US-11 |
| **Dependencies** | REQ-TF-02, REQ-CD-03 |

### Domain: CD — Config-Driven Workflow

#### REQ-CD-01: Declarative Phase Definitions

| Attribute | Detail |
|-----------|--------|
| **Title** | Define Workflow Phases in Configuration |
| **Description** | Workflow phases are defined in a `workflow` section of `ptah.config.json` (or a separate `ptah.workflow.yaml`). Each phase has: a unique ID, display name, type (`creation`, `review`, `approved`, `implementation`), and optional properties (fork_join, skip conditions). The Orchestrator reads this config at startup and constructs the workflow graph dynamically. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with a `workflow.phases` array defining 5 custom phases<br>**When:** The Orchestrator starts<br>**Then:** It constructs a workflow graph with exactly those 5 phases. No hardcoded phase enum is referenced. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | None |

#### REQ-CD-02: Config-Driven Agent-to-Phase Mapping

| Attribute | Detail |
|-----------|--------|
| **Title** | Assign Agents to Phases via Configuration |
| **Description** | Each phase definition includes an `agent` field (or `agents` for fork/join) specifying which agent ID(s) to dispatch. For review phases, a `reviewers` field specifies the reviewer manifest per discipline. No `phaseToAgentId()` switch statement exists in the codebase. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A phase `spec-creation` configured with `agent: "eng"` and a phase `spec-review` configured with `reviewers: { default: ["pm", "qa"] }`<br>**When:** The workflow reaches `spec-creation`<br>**Then:** The Orchestrator dispatches agent `eng`. When `spec-review` is reached, it dispatches agents `pm` and `qa` as reviewers. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01 |

#### REQ-CD-03: Config-Driven Reviewer Manifests

| Attribute | Detail |
|-----------|--------|
| **Title** | Reviewer Assignments Defined in Configuration |
| **Description** | Each review phase specifies its reviewer manifest in configuration, optionally varying by discipline (`backend-only`, `frontend-only`, `fullstack`). This replaces the hardcoded `REVIEWER_TABLE` in `review-tracker.ts` and the `reviewerKeysForPhase()` function in `state-machine.ts`. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A review phase configured with `reviewers: { backend-only: ["eng", "qa"], frontend-only: ["fe", "qa"], fullstack: ["eng", "fe", "qa"] }`<br>**When:** A fullstack feature enters this review phase<br>**Then:** The Orchestrator dispatches reviewers `eng`, `fe`, and `qa`. Changing this list requires only a config change, not a code change. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01 |

#### REQ-CD-04: Config-Driven Transition Rules

| Attribute | Detail |
|-----------|--------|
| **Title** | Phase Transitions Defined in Configuration |
| **Description** | The workflow graph (which phase follows which) is defined in configuration via `transitions` or implicit ordering. Supports: linear chains (`A → B → C`), conditional transitions (`skip_if` predicates), and the creation → review → approved → next-creation pattern as a configurable template. The `transition()` function in `state-machine.ts` is replaced by a generic graph walker that reads the config. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A workflow config with transitions `req_creation → req_review → req_approved → spec_creation → ...`<br>**When:** The workflow completes `req_creation`<br>**Then:** It advances to `req_review` as defined in the config. Adding a new phase between them requires only a config change. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01 |

#### REQ-CD-05: Configuration Schema Validation

| Attribute | Detail |
|-----------|--------|
| **Title** | Validate Workflow Configuration at Startup |
| **Description** | The Orchestrator validates the workflow configuration at startup against a JSON Schema or programmatic validator. Validation checks: all phase IDs are unique, all agent references resolve to registered agents, all transitions reference valid phases, no cycles in the phase graph (unless explicitly configured as review loops), and required fields are present. Invalid config halts startup with a descriptive error message. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with a phase referencing agent `"security"` that is not registered in the agents section<br>**When:** The Orchestrator starts<br>**Then:** It halts with an error: `Workflow validation failed: phase "security-review" references unknown agent "security". Register it in agents.definitions.` |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01, REQ-CD-02, REQ-CD-04 |

#### REQ-CD-06: Default PDLC Workflow Preset

| Attribute | Detail |
|-----------|--------|
| **Title** | Ship Default PDLC Configuration |
| **Description** | Ptah ships with a default workflow configuration that replicates the current v4 PDLC exactly (REQ → FSPEC → TSPEC → PLAN → PROPERTIES → IMPLEMENTATION, with review and approval phases, discipline-aware reviewer manifests, and fork/join for fullstack). This serves as both the default for `ptah init` and as a reference example for custom workflows. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A fresh `ptah init` with no custom workflow config<br>**When:** The Orchestrator starts<br>**Then:** It runs the default PDLC workflow identical to v4 behavior. No regression from the current phase sequence, agent assignments, or reviewer manifests. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01 through REQ-CD-05 |

#### REQ-CD-07: Context Document Matrix in Configuration

| Attribute | Detail |
|-----------|--------|
| **Title** | Configure Which Documents Are Provided to Each Phase |
| **Description** | Each phase definition includes a `context_documents` field specifying which prior artifacts to include in the agent's context bundle. This replaces the hardcoded `getContextDocuments()` function in `context-matrix.ts`. Supports references like `{feature}/REQ`, `{feature}/FSPEC`, `{feature}/TSPEC` that resolve to the actual file paths. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A phase `plan-creation` configured with `context_documents: ["{feature}/REQ", "{feature}/TSPEC"]`<br>**When:** The workflow dispatches an agent for this phase<br>**Then:** The context bundle includes the REQ and TSPEC documents for the current feature. Changing this list requires only a config change. |
| **Priority** | P1 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-11 |
| **Dependencies** | REQ-CD-01 |

### Domain: MG — Migration

#### REQ-MG-01: State Migration Tool

| Attribute | Detail |
|-----------|--------|
| **Title** | Migrate Existing pdlc-state.json to Temporal Workflows |
| **Description** | A `ptah migrate` CLI command reads the existing `pdlc-state.json` file and creates a Temporal Workflow for each in-progress feature, positioned at its current phase. Completed features are optionally imported as completed workflows (for history). The migration tool validates that all features were imported successfully and reports any issues. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `pdlc-state.json` with 3 features: one at `TSPEC_REVIEW`, one at `IMPLEMENTATION`, one at `DONE`<br>**When:** The developer runs `ptah migrate`<br>**Then:** Two active Temporal Workflows are created (at TSPEC_REVIEW and IMPLEMENTATION respectively). The DONE feature is optionally imported as a completed workflow. A summary report confirms all 3 features were processed. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-13 |
| **Dependencies** | REQ-TF-01, REQ-CD-01 |

#### REQ-MG-02: Migration Dry-Run Mode

| Attribute | Detail |
|-----------|--------|
| **Title** | Dry-Run Mode for Migration |
| **Description** | `ptah migrate --dry-run` reads the state file and reports what workflows would be created, at what phases, without actually creating them. This allows developers to verify the migration plan before executing it. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `pdlc-state.json` with features in various states<br>**When:** The developer runs `ptah migrate --dry-run`<br>**Then:** The tool outputs a table of features, their current phases, and the Temporal Workflow IDs that would be created. No Temporal Workflows are actually created. |
| **Priority** | P1 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-13 |
| **Dependencies** | REQ-MG-01 |

### Domain: NF — Non-Functional

#### REQ-NF-09: Temporal Server Deployment Options

| Attribute | Detail |
|-----------|--------|
| **Title** | Support Multiple Temporal Deployment Options |
| **Description** | Ptah supports connecting to: (1) Temporal Cloud (SaaS), (2) a self-hosted Temporal server, or (3) a local development server started via `temporal server start-dev`. The connection is configured in `ptah.config.json` via `temporal.address`, `temporal.namespace`, and optional `temporal.tls` fields. `ptah init` includes a `temporal` section with localhost defaults. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `temporal.address: "localhost:7233"` and `temporal.namespace: "default"`<br>**When:** The Orchestrator starts<br>**Then:** It connects to the local Temporal server at the configured address and namespace. Changing `temporal.address` to a Temporal Cloud endpoint and adding TLS config switches to the cloud deployment with no code changes. |
| **Priority** | P0 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10, US-12 |
| **Dependencies** | REQ-TF-01 |

#### REQ-NF-10: Workflow Observability via Temporal UI

| Attribute | Detail |
|-----------|--------|
| **Title** | Meaningful Workflow Metadata for Temporal UI |
| **Description** | Workflows use human-readable IDs (`ptah-feature-{slug}`), set searchable custom attributes (feature name, current phase, discipline), and emit meaningful Activity names (e.g., `invoke-eng-tspec-creation`). This enables effective use of the Temporal Web UI for monitoring and debugging without any additional tooling. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** 5 active feature workflows in Temporal<br>**When:** The developer opens the Temporal Web UI<br>**Then:** They see workflows listed by feature name, can filter by current phase, can click into any workflow to see the full execution history with timestamps, and can inspect Activity inputs/outputs. |
| **Priority** | P1 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-12 |
| **Dependencies** | REQ-TF-01, REQ-TF-04 |

#### REQ-NF-11: Temporal Worker Configuration

| Attribute | Detail |
|-----------|--------|
| **Title** | Configurable Temporal Worker Settings |
| **Description** | The Temporal Worker (embedded in the Orchestrator process) is configurable via `ptah.config.json`: task queue name, max concurrent workflow tasks, max concurrent activity tasks, and Activity timeouts. Defaults are provided for single-machine operation. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `temporal.worker.max_concurrent_activities: 3`<br>**When:** The Orchestrator starts<br>**Then:** The Temporal Worker processes at most 3 Activities concurrently. |
| **Priority** | P1 |
| **Phase** | Milestone 1 |
| **Source Stories** | US-10 |
| **Dependencies** | REQ-NF-09 |

---

## 4. Scope Boundaries

### 4.1 In Scope

- Temporal Workflow for feature lifecycle management
- Temporal Activities for skill invocation with retry and timeout
- Temporal Signals for human-in-the-loop (replacing file-based polling)
- Temporal Queries for workflow state inspection
- Config-driven phase definitions, agent mappings, reviewer manifests, and transitions
- Default PDLC workflow preset matching v4 behavior
- Migration tool (`ptah migrate`) for existing state
- Support for Temporal Cloud, self-hosted, and local dev server
- Workflow observability via Temporal Web UI

### 4.2 Out of Scope

- Messaging abstraction (Discord remains the only provider) — Milestone 2
- Library packaging or plugin system — Milestone 3
- MCP/A2A protocol support — Milestone 3
- Multi-repo or multi-instance support
- Custom Temporal UI views or dashboards
- Temporal schedule-based workflows (cron features)

### 4.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-08 | Temporal TypeScript SDK (v1.x) is stable and supports all required primitives (Workflows, Activities, Signals, Queries) | Core architecture may need adjustment; mitigated by SDK maturity |
| A-09 | `temporal server start-dev` provides a sufficient local development experience | Developers may need Docker Compose for local Temporal; document alternatives |
| A-10 | The existing Claude Agent SDK invocation pattern fits within Temporal's Activity model (long-running Activities with heartbeat) | May need to use Temporal's async Activity completion pattern for very long agent runs |
| A-11 | Temporal's event-sourced workflow state is sufficient for all PDLC state needs — no additional database required | If complex queries are needed beyond what Temporal provides, may need a read-side projection |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-09 | Temporal SDK Activity timeout may be too short for long agent invocations (some skills run 10-15 minutes) | Med | High | Use heartbeat-based Activities with configurable `scheduleToCloseTimeout` up to 30 minutes; implement heartbeat reporting from SkillInvoker |
| R-10 | Config-driven workflow may not express all edge cases of the current hardcoded state machine | Med | Med | Ship default PDLC preset and validate it passes all existing tests before removing hardcoded logic |
| R-11 | Temporal server adds operational complexity for solo developers | Med | Med | Document `temporal server start-dev` for local use; recommend Temporal Cloud for production; include in `ptah init` setup guide |
| R-12 | Migration from v4 state may produce incorrect workflow positions for features mid-review | Low | High | Migration dry-run mode; validate review phase state (pending reviewers, revision count) is correctly transferred |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 14 | REQ-TF-01 through REQ-TF-08, REQ-CD-01 through REQ-CD-06, REQ-MG-01, REQ-NF-09 |
| P1 | 4 | REQ-CD-07, REQ-MG-02, REQ-NF-10, REQ-NF-11 |

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| TF — Temporal Foundation | 8 | REQ-TF-01 through REQ-TF-08 |
| CD — Config-Driven Workflow | 7 | REQ-CD-01 through REQ-CD-07 |
| MG — Migration | 2 | REQ-MG-01, REQ-MG-02 |
| NF — Non-Functional | 3 | REQ-NF-09, REQ-NF-10, REQ-NF-11 |

**Total: 20 requirements (14 P0, 4 P1)**

---

## 7. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 1, 2026 | Product Manager | Initial requirements document for Milestone 1 (Temporal Foundation + Config-Driven Workflow). 20 requirements across 4 domains. |

---

*End of Document*
