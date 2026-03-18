# Requirements Document

## Tech Lead Orchestration

| Field | Detail |
|-------|--------|
| **Document ID** | 014-REQ-tech-lead-orchestration |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | March 18, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This document defines the requirements for Phase 14 — Tech Lead Orchestration. This phase addresses a throughput limitation in Ptah's current PDLC implementation phase: approved plans are executed sequentially by a single engineer agent (or two in fullstack fork/join), even when the plan's dependency graph reveals significant opportunities for parallel execution. By introducing a tech-lead orchestration layer, Ptah can analyze plan dependencies, compute parallel batches, and dispatch multiple engineer subagents concurrently — reducing wall-clock implementation time while maintaining correctness through inter-batch test validation gates.

---

## 2. User Scenarios

### US-23: Developer Wants Faster Implementation of Large Plans

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer has an approved execution plan with 12 phases (A–L) and a dependency graph showing that several phases are independent of each other. The developer expects Ptah to recognize these parallelism opportunities and run independent phases concurrently rather than waiting for each to complete sequentially. |
| **Goals** | Implementation completes faster by running independent plan phases in parallel. The developer does not need to manually identify which phases can run concurrently. Test validation between batches catches regressions early. |
| **Pain points** | Currently, the orchestrator dispatches a single backend-engineer (or frontend-engineer) to implement the entire plan sequentially. For large plans with many independent phases, this wastes time waiting on phases that could run concurrently. The developer has no way to express "run phases B, C, and D in parallel" to the orchestrator. |
| **Key needs** | Automatic dependency analysis of the plan. Parallel dispatch of independent phases to separate engineer agents. Sequential batch execution with test validation gates. Clear progress reporting showing which phases are running, completed, or failed. |

### US-24: Developer Wants to Resume Implementation from a Specific Batch

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer's implementation run completed Batches 1–3 successfully but Batch 4 failed due to a flaky test. After fixing the issue manually, the developer wants to resume from Batch 4 without re-running Batches 1–3. |
| **Goals** | Resume implementation from any batch without re-executing completed work. The tech lead recognizes which phases are already marked as done in the plan and skips them. |
| **Pain points** | If the orchestrator cannot resume mid-plan, the developer must either re-run the entire implementation (wasting time and tokens) or manually invoke individual engineer agents for the remaining phases (losing the parallelism benefit). |
| **Key needs** | Plan status inspection to determine completed phases. Batch resumption from an arbitrary starting point. Already-completed phases are skipped, not re-run. |

### US-25: Developer Wants Visibility into Parallel Execution Progress

| Attribute | Detail |
|-----------|--------|
| **Description** | While the tech lead is orchestrating parallel implementation, the developer wants to see which batch is currently executing, which phases are running within that batch, and whether any phase has failed — without needing to inspect individual agent logs. |
| **Goals** | Real-time progress visibility at the batch and phase level. Immediate notification when a phase fails, including which phase, which task, and what went wrong. Summary report after each batch completes. |
| **Pain points** | With multiple agents running in parallel, there is no aggregated view of progress. The developer would need to watch multiple agent log files simultaneously to understand the current state. |
| **Key needs** | Batch-level progress reporting in the coordination thread. Per-phase status updates (started, completed, failed). Failure details surfaced immediately upon occurrence. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | Execution plans always contain a "Task Dependency Notes" section with a parseable dependency graph | If plans lack dependency information, the tech lead cannot compute parallel batches and must fall back to sequential execution |
| A-02 | Phases within a plan are the smallest unit of parallelism — tasks within a phase are always executed sequentially by a single agent | If individual tasks within a phase could be parallelized across agents, the current design leaves throughput on the table |
| A-03 | Phase 10 (Parallel Feature Development) branch infrastructure is available — agents can work on sub-branches off a persistent feature branch | Without isolated branching per agent, parallel execution would cause git conflicts |
| A-04 | The tech-lead skill definition exists at `.claude/skills/tech-lead/SKILL.md` and is registered as a valid agent in the Ptah configuration | If the tech-lead skill is missing, the orchestrator cannot delegate to it |
| A-05 | Plan source file paths reliably indicate whether a phase is backend or frontend work | If source file paths are ambiguous, skill assignment may be incorrect |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The tech lead must not write implementation code itself — all code changes are delegated to backend-engineer or frontend-engineer agents | Separation of concerns: the tech lead is an orchestration layer, not an implementation agent |
| C-02 | Batches must execute sequentially — a batch cannot start until all phases in the previous batch have completed and tests pass | Dependency correctness: later batches depend on earlier ones |
| C-03 | Each phase within a batch must execute in an isolated worktree to prevent git conflicts between parallel agents | Git safety: concurrent agents modifying the same working directory causes data loss |
| C-04 | The existing PDLC state machine (pdlc-dispatcher.ts) must remain the authority on phase transitions — the tech lead operates within the IMPLEMENTATION phase, not outside it | Architectural integrity: the tech lead is a sub-orchestrator, not a replacement for the PDLC state machine |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| Parallel batch execution | Wall-clock time for implementation phase | Compare total elapsed time for a 12-phase plan (sequential vs. parallel) | ~12x single-phase duration (sequential) | ~5-6x single-phase duration (batched) |
| Batch resumption | Phases re-executed on resume | Count phases executed when resuming from Batch N | All phases (no resume) | Only phases in Batch N and later |
| Regression detection | Time to detect inter-phase regressions | Time from batch completion to test failure report | End of full implementation (all phases done) | End of each batch (caught early) |

---

## 5. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| TL | Tech Lead Orchestration |
| PD | Plan Dependency Analysis |
| BD | Batch Dispatch |
| PR | Progress Reporting |

### 5.1 Plan Dependency Analysis (PD)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PD-01 | Parse plan dependency graph | The tech lead must parse the "Task Dependency Notes" section of an approved PLAN document and construct a directed acyclic graph (DAG) of phase dependencies. | WHO: As the Ptah orchestrator GIVEN: An approved PLAN document with a "Task Dependency Notes" section WHEN: The tech lead is invoked with the plan file path THEN: A DAG is constructed where nodes are phases and edges represent "depends on" relationships | P0 | 14 | [US-23] | — |
| REQ-PD-02 | Compute topological batches | The tech lead must compute execution batches by performing topological layering on the dependency DAG: Batch 1 contains all phases with no dependencies (in-degree 0), Batch N contains all phases whose dependencies are entirely within Batches 1..(N-1). | WHO: As the Ptah orchestrator GIVEN: A valid dependency DAG with no cycles WHEN: The tech lead computes batches THEN: Each phase appears in exactly one batch; no phase runs before its dependencies are complete; maximum parallelism is achieved within each batch | P0 | 14 | [US-23] | [REQ-PD-01] |
| REQ-PD-03 | Assign skill type per phase | The tech lead must assign each phase to either backend-engineer or frontend-engineer based on the source file paths in the plan's task table. Backend paths (src/, config/, tests/, bin/) map to backend-engineer. Frontend paths (app/, components/, pages/, styles/, hooks/) map to frontend-engineer. Documentation-only phases (docs/) default to backend-engineer. | WHO: As the Ptah orchestrator GIVEN: A phase with tasks listing source file paths WHEN: The tech lead assigns a skill type THEN: The correct engineer skill is assigned based on the source file path conventions | P0 | 14 | [US-23] | [REQ-PD-01] |
| REQ-PD-04 | Detect completed phases | The tech lead must inspect task statuses in the plan document. Phases where all tasks are marked as Done (status field) are considered completed and must be excluded from batch computation. | WHO: As the Ptah orchestrator GIVEN: A plan with some phases already marked as Done WHEN: The tech lead computes batches THEN: Completed phases are excluded from the execution batches; their dependencies are considered satisfied | P0 | 14 | [US-24] | [REQ-PD-01] |
| REQ-PD-05 | Graceful fallback for unparseable dependency graph | If the "Task Dependency Notes" section is missing, empty, or cannot be parsed into a valid DAG, the tech lead must fall back to sequential execution (one phase per batch, in document order) and log a warning. | WHO: As the Ptah orchestrator GIVEN: A plan with missing or malformed dependency notes WHEN: The tech lead attempts to parse dependencies THEN: Execution falls back to sequential mode; a warning is logged explaining why parallel batching was not possible | P1 | 14 | [US-23] | [REQ-PD-01] |

### 5.2 Batch Dispatch (BD)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-BD-01 | Sequential batch execution | Batches must execute in strict sequential order. Batch N must not start until all phases in Batch N-1 have completed successfully and the test suite has passed. | WHO: As the Ptah orchestrator GIVEN: Batch N-1 has completed with all phases successful and tests passing WHEN: The tech lead evaluates next steps THEN: Batch N begins execution | P0 | 14 | [US-23] | [REQ-PD-02] |
| REQ-BD-02 | Parallel phase dispatch within batch | Within a batch, all phases must be dispatched to engineer agents concurrently. Each phase is assigned to its own agent instance running in an isolated worktree. | WHO: As the Ptah orchestrator GIVEN: A batch containing phases [B, C, D] with skill assignments WHEN: The batch begins execution THEN: Three agents are launched concurrently, each in its own isolated worktree, each implementing one phase | P0 | 14 | [US-23] | [REQ-BD-01], [REQ-PD-03] |
| REQ-BD-03 | Worktree isolation per agent | Each agent dispatched within a batch must operate in its own git worktree branched from the feature branch. This prevents file-level conflicts between concurrent agents. | WHO: As the Ptah orchestrator GIVEN: Two agents running in the same batch WHEN: Both agents modify files in their respective phases THEN: Each agent works in an isolated worktree; no file conflicts occur during execution | P0 | 14 | [US-23] | [REQ-BD-02] |
| REQ-BD-04 | Merge worktree results after batch | After all phases in a batch complete successfully, the tech lead must merge each agent's worktree branch into the feature branch. Merges must be serialized to prevent conflicts. | WHO: As the Ptah orchestrator GIVEN: All phases in a batch have completed successfully WHEN: The tech lead merges results THEN: Each worktree branch is merged into the feature branch in sequence; merge conflicts are detected and reported | P0 | 14 | [US-23] | [REQ-BD-02] |
| REQ-BD-05 | Test validation gate between batches | After merging all worktree results for a batch, the tech lead must run the project's test suite. If any test fails, execution must halt and the failure must be reported. The next batch must not start until tests pass. | WHO: As the Ptah orchestrator GIVEN: A batch's worktree results have been merged WHEN: The tech lead runs the test suite THEN: If all tests pass, proceed to the next batch; if any test fails, halt execution and report the failure with details | P0 | 14 | [US-23] | [REQ-BD-04] |
| REQ-BD-06 | Resume from specific batch | The tech lead must support resuming execution from a specific batch number. When resuming, phases in earlier batches that are already marked as Done in the plan are skipped. | WHO: As the Ptah orchestrator GIVEN: A plan with Batches 1-3 completed and the developer requests resumption from Batch 4 WHEN: The tech lead begins execution THEN: Batches 1-3 are skipped; execution begins at Batch 4 | P1 | 14 | [US-24] | [REQ-PD-04] |
| REQ-BD-07 | Phase failure handling | If an agent reports failure (routing signal ROUTE_TO_USER, non-zero exit, or timeout) during a phase, the tech lead must halt the current batch, capture the failure details (phase, task, error), and report the failure to the orchestrator. Other agents in the same batch that are still running should be allowed to complete (do not kill them). | WHO: As the Ptah orchestrator GIVEN: An agent implementing Phase C reports failure WHEN: The tech lead detects the failure THEN: The current batch is marked as failed; failure details are captured; the orchestrator is notified; other running agents in the batch are allowed to finish | P0 | 14 | [US-23], [US-25] | [REQ-BD-02] |
| REQ-BD-08 | Update plan status after each phase | After each phase completes successfully, the tech lead must update the task statuses in the plan document from the agent's work (mark tasks as Done). This ensures the plan reflects current progress for resumption and visibility. | WHO: As the Ptah orchestrator GIVEN: An agent has completed Phase B successfully WHEN: The tech lead processes the completion THEN: All tasks in Phase B are marked as Done in the plan document | P1 | 14 | [US-24], [US-25] | [REQ-BD-02] |

### 5.3 Tech Lead Orchestration (TL)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-TL-01 | Invoke tech lead for implementation | When the PDLC state machine transitions to the IMPLEMENTATION phase and an approved PLAN document exists, the orchestrator must invoke the tech-lead skill instead of directly invoking backend-engineer or frontend-engineer. | WHO: As the Ptah orchestrator GIVEN: The PDLC phase is IMPLEMENTATION and the plan status is "Approved — Ready for Implementation" WHEN: The orchestrator dispatches the implementation task THEN: The tech-lead skill is invoked with the plan file path as context | P0 | 14 | [US-23] | — |
| REQ-TL-02 | Present execution plan for confirmation | Before executing any batches, the tech lead must present the computed batch plan (phases, skill assignments, dependencies, batch groupings) to the user for confirmation. The user may approve, modify, or reject the plan. | WHO: As the developer GIVEN: The tech lead has computed the batch execution plan WHEN: The plan is presented in the coordination thread THEN: The developer can review the batched plan, approve it, request modifications (e.g., change skill assignments, adjust batch grouping), or reject it | P0 | 14 | [US-23] | [REQ-PD-02], [REQ-PD-03] |
| REQ-TL-03 | Tech lead does not write code | The tech lead must not modify source code or test files directly. All implementation work must be delegated to backend-engineer or frontend-engineer agents. The tech lead's responsibilities are limited to plan analysis, batch computation, agent dispatch, result merging, and progress reporting. | WHO: As the Ptah orchestrator GIVEN: The tech lead is orchestrating implementation WHEN: Implementation work is needed THEN: The tech lead delegates to the appropriate engineer skill; it never writes, edits, or commits source code itself | P0 | 14 | [US-23] | — |
| REQ-TL-04 | Merge conflict reporting | If a merge conflict occurs when merging an agent's worktree branch into the feature branch, the tech lead must report the conflicting files and conflict context to the user, and halt execution until the conflict is resolved. | WHO: As the developer GIVEN: Two phases in the same batch modified overlapping files WHEN: The tech lead attempts to merge worktree results THEN: The conflict is reported with file names and context; execution halts; the developer resolves the conflict before the tech lead continues | P1 | 14 | [US-23] | [REQ-BD-04] |
| REQ-TL-05 | Delegate context per phase | When dispatching an agent for a phase, the tech lead must provide: the plan file path, the specific phase to implement (phase letter and task list), the feature branch name, the list of completed dependency phases, and the ACTION directive appropriate for the engineer skill. | WHO: As the Ptah orchestrator GIVEN: The tech lead is dispatching an agent for Phase D WHEN: The agent is launched THEN: The agent receives the plan path, Phase D's task table, the feature branch, the list of completed phases (A, B, C), and the ACTION directive "Implement TSPEC following the PLAN" | P0 | 14 | [US-23] | [REQ-BD-02] |

### 5.4 Progress Reporting (PR)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PR-01 | Batch start notification | When a batch begins execution, the tech lead must post a notification in the coordination thread showing: the batch number, the number of phases running in parallel, and the list of phases with their skill assignments. | WHO: As the developer GIVEN: Batch 3 (containing phases E, F, G) is about to start WHEN: The tech lead begins batch execution THEN: A notification is posted: "Starting Batch 3 (3 phases in parallel): Phase E (backend-engineer), Phase F (backend-engineer), Phase G (backend-engineer)" | P1 | 14 | [US-25] | [REQ-BD-01] |
| REQ-PR-02 | Phase completion notification | When a phase completes (success or failure), the tech lead must post a status update in the coordination thread including: the phase name, result (success/failure), and if failed, the error summary. | WHO: As the developer GIVEN: Phase E has completed successfully WHEN: The tech lead processes the completion THEN: A status update is posted: "Phase E: Foundation Types — completed successfully" | P1 | 14 | [US-25] | [REQ-BD-02] |
| REQ-PR-03 | Batch summary after completion | After all phases in a batch complete and tests pass, the tech lead must post a batch summary: phases completed, test results (pass count), and the next batch to execute. | WHO: As the developer GIVEN: Batch 3 has completed with all phases successful and 47 tests passing WHEN: The tech lead posts the batch summary THEN: A summary is posted: "Batch 3 complete: 3/3 phases done, 47 tests passing. Next: Batch 4 (2 phases)" | P1 | 14 | [US-25] | [REQ-BD-05] |
| REQ-PR-04 | Final implementation summary | After all batches complete, the tech lead must post a final summary: total phases implemented, total batches executed, total tests passing, and overall elapsed time. | WHO: As the developer GIVEN: All 7 batches have completed WHEN: The tech lead finishes execution THEN: A summary is posted with total phases, batches, test count, and elapsed time | P2 | 14 | [US-25] | [REQ-BD-01] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-14-01 | Agent concurrency limit | The tech lead must not launch more than 5 concurrent agents within a single batch. If a batch contains more than 5 phases, it must be split into sub-batches of at most 5. | No more than 5 agents run concurrently at any time | P1 | 14 |
| REQ-NF-14-02 | Worktree cleanup | After each agent completes (success or failure), its worktree must be cleaned up. Worktrees from failed agents must be retained for debugging if the `retain_failed_worktrees` config flag is set. | Worktrees are removed after successful completion; retained on failure if configured | P1 | 14 |
| REQ-NF-14-03 | Backward compatibility | The existing sequential implementation path (direct dispatch to backend-engineer or frontend-engineer) must remain functional. The tech-lead orchestration is engaged only when the tech-lead agent is registered in the configuration. If the tech-lead is not configured, the orchestrator falls back to the current sequential dispatch behavior. | Existing PDLC flow works unchanged when tech-lead is not registered | P0 | 14 |
| REQ-NF-14-04 | Plan format compatibility | The tech lead must work with the existing plan format as defined in `docs/templates/backend-plans-template.md`. No changes to the plan template are required. | The tech lead successfully parses plans that follow the existing template | P0 | 14 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Merge conflicts between phases in the same batch | Medium | High | Batch computation should group phases that touch overlapping files into the same sequential batch when possible; merges are serialized; conflicts are reported immediately | [REQ-BD-04], [REQ-TL-04] |
| R-02 | Dependency graph parsing fails on non-standard plan formats | Low | Medium | Graceful fallback to sequential execution with warning; plan template remains the authoritative format | [REQ-PD-05] |
| R-03 | Agent token/context limits exceeded for large phases | Medium | Medium | Each phase is delegated independently with only its task table, not the full plan context; the tech lead manages the orchestration context | [REQ-TL-05] |
| R-04 | Flaky tests cause false batch failures | Medium | Medium | Clear error reporting helps the developer identify flaky vs. real failures; resume capability avoids re-running passed batches | [REQ-BD-05], [REQ-BD-06] |
| R-05 | Phase 10 branch infrastructure not yet implemented | High | High | If worktree/branch isolation from Phase 10 is not available, the tech lead cannot safely run parallel agents. Feature should be gated on Phase 10 completion. | [REQ-BD-03], [REQ-NF-14-03] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 16 | REQ-PD-01, REQ-PD-02, REQ-PD-03, REQ-PD-04, REQ-BD-01, REQ-BD-02, REQ-BD-03, REQ-BD-04, REQ-BD-05, REQ-BD-07, REQ-TL-01, REQ-TL-02, REQ-TL-03, REQ-TL-05, REQ-NF-14-03, REQ-NF-14-04 |
| P1 | 9 | REQ-PD-05, REQ-BD-06, REQ-BD-08, REQ-TL-04, REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-NF-14-01, REQ-NF-14-02 |
| P2 | 1 | REQ-PR-04 |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 14 | 26 | All requirements in this document |

---

## 9. Scope Boundaries

### In Scope

- Dependency graph parsing from existing PLAN document format
- Topological batch computation for parallel execution
- Skill type inference from source file paths
- Parallel agent dispatch with worktree isolation
- Sequential batch execution with test validation gates
- Batch resumption from arbitrary starting points
- Progress reporting at batch and phase levels
- Merge conflict detection and reporting
- Integration with existing PDLC state machine (IMPLEMENTATION phase)
- Backward-compatible fallback when tech-lead is not configured

### Out of Scope

- Modifications to the PLAN document template or format
- Intra-phase task parallelism (splitting tasks within a phase across agents)
- Automatic merge conflict resolution (conflicts require human intervention)
- Changes to the PDLC state machine phase transitions (tech lead operates within IMPLEMENTATION)
- Real-time streaming of agent output to the developer
- Cost/token optimization across parallel agents
- Automatic file-overlap analysis for smarter batch grouping (future enhancement)

### Assumptions

- Phase 10 (Parallel Feature Development) provides the branching infrastructure needed for isolated worktrees
- The tech-lead skill definition (`.claude/skills/tech-lead/SKILL.md`) is maintained alongside the other skill definitions
- Plans follow the established template with a "Task Dependency Notes" section containing a parseable dependency graph

---

## 10. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-18 | Product Manager | Initial requirements document |

---

*End of Document*
