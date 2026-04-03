# Requirements Document

## Tech Lead Orchestration

| Field | Detail |
|-------|--------|
| **Document ID** | 014-REQ-tech-lead-orchestration |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.4 |
| **Date** | March 19, 2026 |
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
| A-01 | Execution plans contain a "Task Dependency Notes" section with a parseable dependency graph expressed in either linear chain format (`A → B → C`) or fan-out format (`A → [B, C]`). Plans authored before this feature may use linear-chain-only format and will produce single-phase batches until updated to fan-out syntax. | If plans lack dependency information entirely, the tech lead cannot compute parallel batches and must fall back to sequential execution |
| A-02 | Phases within a plan are the smallest unit of parallelism — tasks within a phase are always executed sequentially by a single agent | If individual tasks within a phase could be parallelized across agents, the current design leaves throughput on the table |
| A-03 | The Agent tool's `isolation: "worktree"` parameter is available and provides git worktree isolation per dispatched agent — the tech lead uses this built-in mechanism rather than directly invoking TypeScript worktree management APIs | Without worktree isolation support in the Agent tool, parallel execution would cause git conflicts |
| A-04 | The tech-lead skill definition exists at `.claude/skills/tech-lead/SKILL.md` and is registered as a valid agent in the Ptah configuration | If the tech-lead skill is missing, the orchestrator cannot delegate to it |
| A-05 | Plan source file paths reliably indicate whether a phase is backend or frontend work, with the exception of mixed-path phases (see REQ-PD-03) | If source file paths are ambiguous, skill assignment may be incorrect |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The tech lead must not write implementation code itself — all code changes are delegated to backend-engineer or frontend-engineer agents | Separation of concerns: the tech lead is an orchestration layer, not an implementation agent |
| C-02 | Batches must execute sequentially — a batch cannot start until all phases in the previous batch have completed and tests pass | Dependency correctness: later batches depend on earlier ones |
| C-03 | Each phase within a batch must execute in an isolated worktree to prevent git conflicts between parallel agents. This isolation is achieved using the Agent tool's `isolation: "worktree"` parameter — no direct TypeScript worktree API calls are required from the tech-lead skill prompt. | Git safety: concurrent agents modifying the same working directory causes data loss |
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
| REQ-PD-01 | Parse plan dependency graph | The tech lead must parse the "Task Dependency Notes" section of an approved PLAN document and construct a directed acyclic graph (DAG) of phase dependencies. The parser must support both linear chain syntax (`A → B → C`) and fan-out syntax (`A → [B, C]`). Plans using only linear-chain syntax will produce single-phase batches (each batch contains one phase), which is valid behavior. If the plan file path provided at invocation does not exist or cannot be read, the tech lead must report the error to the user (including the path) and halt without attempting any execution. | WHO: As the Ptah orchestrator GIVEN: An approved PLAN document with a "Task Dependency Notes" section WHEN: The tech lead is invoked with the plan file path THEN: A DAG is constructed where nodes are phases and edges represent "depends on" relationships; fan-out syntax produces multi-phase batches; linear-chain syntax produces single-phase batches. If the plan file is missing or unreadable, the tech lead reports the error with the file path and halts. | P0 | 14 | [US-23] | — |
| REQ-PD-02 | Compute topological batches | The tech lead must compute execution batches by performing topological layering on the dependency DAG. The batch assignment algorithm is: Batch N for a phase = (length of the longest dependency chain from any root phase to this phase) + 1. Phases with no dependencies are assigned to Batch 1. | WHO: As the Ptah orchestrator GIVEN: A valid dependency DAG with no cycles WHEN: The tech lead computes batches THEN: Each phase appears in exactly one batch; no phase runs before its dependencies are complete; each phase is assigned to batch N = (longest path length from any root to this phase) + 1; phases with no dependencies are assigned to Batch 1 | P0 | 14 | [US-23] | [REQ-PD-01] |
| REQ-PD-03 | Assign skill type per phase | The tech lead must assign each phase to either backend-engineer or frontend-engineer based on the source file paths in the plan's task table. Backend paths (`src/`, `config/`, `tests/`, `bin/`) map to backend-engineer. Frontend paths (`app/`, `components/`, `pages/`, `styles/`, `hooks/`) map to frontend-engineer. Documentation-only phases (`docs/`) default to backend-engineer. If a phase contains both backend and frontend source paths, backend-engineer is assigned by default and a warning is logged; the user may override this assignment during the plan confirmation step per [REQ-TL-02]. | WHO: As the Ptah orchestrator GIVEN: A phase with tasks listing source file paths WHEN: The tech lead assigns a skill type THEN: For backend-only paths, backend-engineer is assigned; for frontend-only paths, frontend-engineer is assigned; for documentation-only paths, backend-engineer is assigned; for mixed-path phases, backend-engineer is assigned and a warning is logged indicating the user may override during confirmation | P0 | 14 | [US-23] | [REQ-PD-01] |
| REQ-PD-04 | Detect completed phases | The tech lead must inspect task statuses in the plan document. Phases where all tasks are marked as Done (status field) are considered completed and must be excluded from batch computation. If batch computation results in zero executable phases (all phases are already marked Done), the tech lead must post a "nothing to do" completion notification and exit without launching any agents. | WHO: As the Ptah orchestrator GIVEN: A plan with some phases already marked as Done WHEN: The tech lead computes batches THEN: Completed phases are excluded from the execution batches; their dependencies are considered satisfied. If all phases are Done, the tech lead posts a notification ("All phases are already marked as complete — nothing to do") and exits without running agents or the test suite. | P0 | 14 | [US-24] | [REQ-PD-01] |
| REQ-PD-05 | Graceful fallback for unparseable dependency graph | If the "Task Dependency Notes" section is missing, empty, or cannot be parsed into a valid DAG (excluding cycle detection, which is covered by REQ-PD-06), the tech lead must fall back to sequential execution (one phase per batch, in document order) and log a warning. | WHO: As the Ptah orchestrator GIVEN: A plan with missing or malformed dependency notes (excluding cyclic graphs) WHEN: The tech lead attempts to parse dependencies THEN: Execution falls back to sequential mode; a warning is logged explaining why parallel batching was not possible | P1 | 14 | [US-23] | [REQ-PD-01] |
| REQ-PD-06 | Detect and report cyclic dependencies | If topological layering detects a cycle in the dependency graph (i.e., topological sort cannot complete because phases remain with unresolved in-edges), the tech lead must report the cycle by naming the phases involved, log an error-level warning, and fall back to sequential execution (one phase per batch, in document order). | WHO: As the Ptah orchestrator GIVEN: A plan whose "Task Dependency Notes" section contains a cycle (e.g., Phase B depends on Phase C, which depends on Phase B) WHEN: The tech lead performs topological layering THEN: The cycle is detected; an error-level warning is logged naming the phases involved in the cycle; execution falls back to sequential mode rather than looping indefinitely or crashing | P0 | 14 | [US-23] | [REQ-PD-01] |

### 5.2 Batch Dispatch (BD)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-BD-01 | Sequential batch execution | Batches must execute in strict sequential order. Batch N must not start until all phases in Batch N-1 have completed successfully and the test suite has passed. | WHO: As the Ptah orchestrator GIVEN: Batch N-1 has completed with all phases successful and tests passing WHEN: The tech lead evaluates next steps THEN: Batch N begins execution | P0 | 14 | [US-23] | [REQ-PD-02] |
| REQ-BD-02 | Parallel phase dispatch within batch | Within a batch, all phases must be dispatched to engineer agents concurrently. Each phase is assigned to its own agent instance using the Agent tool with `isolation: "worktree"`. | WHO: As the Ptah orchestrator GIVEN: A batch containing phases [B, C, D] with skill assignments WHEN: The batch begins execution THEN: Three agents are launched concurrently, each with `isolation: "worktree"`, each implementing one phase | P0 | 14 | [US-23] | [REQ-BD-01], [REQ-PD-03] |
| REQ-BD-03 | Worktree isolation per agent | Each agent dispatched within a batch must operate in its own isolated git worktree. Isolation is achieved by passing `isolation: "worktree"` to the Agent tool when dispatching each engineer agent. The tech lead does not directly call TypeScript worktree management APIs — this mechanism is provided transparently by the Agent infrastructure. | WHO: As the Ptah orchestrator GIVEN: Two agents running in the same batch WHEN: Both agents modify files in their respective phases THEN: Each agent works in an isolated worktree created by the Agent tool's `isolation: "worktree"` parameter; no file conflicts occur during execution | P0 | 14 | [US-23] | [REQ-BD-02] |
| REQ-BD-04 | Merge worktree results after batch | After all phases in a batch complete successfully, the tech lead must merge each agent's worktree branch into the feature branch. Merges must be serialized to prevent conflicts. | WHO: As the Ptah orchestrator GIVEN: All phases in a batch have completed successfully WHEN: The tech lead merges results THEN: Each worktree branch is merged into the feature branch in sequence; merge conflicts are detected and reported | P0 | 14 | [US-23] | [REQ-BD-02] |
| REQ-BD-05 | Test validation gate between batches | After merging all worktree results for a batch, the tech lead must run the project's test suite (`npx vitest run` from the `ptah/` directory). Two distinct failure modes must be handled differently: (a) test assertion failure — one or more test cases fail; report which tests failed and halt; (b) test invocation failure — the test runner itself fails to start (e.g., compilation error, missing configuration); report the invocation error separately and halt. In both cases, the next batch must not start until the failure is resolved. A timeout policy for the test suite invocation itself (to handle hung test runners) is out of scope for this requirement and is deferred to TSPEC. | WHO: As the Ptah orchestrator GIVEN: A batch's worktree results have been merged WHEN: The tech lead runs the test suite THEN: If all tests pass, proceed to the next batch; if test assertion failures occur, halt and report the failing test names and phases most likely responsible; if the test runner fails to start, halt and report the runner error with the full error output so the developer can diagnose the environment issue | P0 | 14 | [US-23] | [REQ-BD-04] |
| REQ-BD-06 | Resume from specific batch | The tech lead must support resuming execution from a specific batch number. When resuming, phases in earlier batches that are already marked as Done in the plan are skipped. | WHO: As the Ptah orchestrator GIVEN: A plan with Batches 1-3 completed and the developer requests resumption from Batch 4 WHEN: The tech lead begins execution THEN: Batches 1-3 are skipped; execution begins at Batch 4 | P1 | 14 | [US-24] | [REQ-PD-04] |
| REQ-BD-07 | Phase failure handling | If an agent reports failure (routing signal ROUTE_TO_USER, non-zero exit, or timeout configured via `tech_lead_agent_timeout_ms` in the Ptah configuration, defaulting to 600,000 ms) during a phase, the tech lead must: (1) allow other agents in the same batch that are still running to complete; (2) NOT merge any worktree branches from the current batch into the feature branch — neither from the failed phase nor from successful sibling phases; (3) capture the failure details (phase, task, error); (4) report the failure and halt. Because no partial merges occur, the batch must be re-run in its entirety after the failure is resolved (or the developer may resume from that batch number per REQ-BD-06). | WHO: As the Ptah orchestrator GIVEN: An agent implementing Phase C reports failure WHEN: The tech lead detects the failure THEN: Other running agents in the batch are allowed to finish; no worktree branches from the current batch are merged into the feature branch; failure details are captured and reported; the current batch is marked as failed; the orchestrator is notified; the developer must resolve the failure and resume or retry the batch | P0 | 14 | [US-23], [US-25] | [REQ-BD-02] |
| REQ-BD-08 | Update plan status after each phase | After each phase completes successfully, the tech lead must update the task statuses in the plan document (mark tasks as Done). Plan status updates must be serialized — even when multiple phases in a batch complete near-simultaneously, updates to the plan file must be applied one at a time to prevent concurrent write corruption. | WHO: As the Ptah orchestrator GIVEN: An agent has completed Phase B successfully WHEN: The tech lead processes the completion THEN: All tasks in Phase B are marked as Done in the plan document; if another phase completion is also pending, its update waits until Phase B's update completes | P1 | 14 | [US-24], [US-25] | [REQ-BD-02] |

### 5.3 Tech Lead Orchestration (TL)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-TL-01 | Invoke tech lead for implementation | When the PDLC state machine transitions to the IMPLEMENTATION phase and the feature's `FeatureConfig` has `useTechLead: true`, the orchestrator must route to the tech-lead skill instead of directly invoking backend-engineer or frontend-engineer. When `useTechLead` is absent or false, the existing dispatch behavior is preserved (see REQ-NF-14-03). | WHO: As the Ptah orchestrator GIVEN: The PDLC phase is IMPLEMENTATION, the plan status is "Approved — Ready for Implementation", and `config.useTechLead` is true WHEN: The orchestrator dispatches the implementation task THEN: The tech-lead skill is invoked with the plan file path as context instead of backend-engineer or frontend-engineer | P0 | 14 | [US-23] | — |
| REQ-TL-02 | Present execution plan for confirmation | Before executing any batches, the tech lead must present the computed batch plan (phases, skill assignments, dependencies, batch groupings) to the user for confirmation. The user may: (a) **Approve** — execution proceeds as presented; (b) **Modify** — the user may request one or more of the following changes: change the skill assignment for a specific phase (e.g., "assign Phase D to frontend-engineer"), or move a phase to a different batch (e.g., "run Phase E in Batch 2 instead of Batch 3"); if a modification would create a dependency violation (a phase moved before its dependency), the tech lead must explain the violation and re-present the corrected plan for re-confirmation; (c) **Reject** — the tech lead exits and signals `ROUTE_TO_USER` indicating the developer rejected the plan, with instructions to re-invoke when ready. | WHO: As the developer GIVEN: The tech lead has computed the batch execution plan WHEN: The plan is presented in the coordination thread THEN: The developer can approve (execution proceeds), request a skill assignment or batch grouping change (tech lead updates the plan and re-presents for confirmation, rejecting invalid modifications with explanation), or reject (tech lead exits with ROUTE_TO_USER) | P0 | 14 | [US-23] | [REQ-PD-02], [REQ-PD-03] |
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
| REQ-NF-14-01 | Agent concurrency limit | The tech lead must not launch more than 5 concurrent agents within a single topological batch. If a topological batch contains more than 5 phases, it must be split into sub-batches of at most 5. The test validation gate (REQ-BD-05) fires **once per topological batch** — after all sub-batches within the same topological layer have completed and been merged — not between individual sub-batches. This preserves the semantic guarantee that the next topological batch does not start until all phases in the current topological layer are done and tested. | No more than 5 agents run concurrently at any time; the test gate fires once per topological batch (after all sub-batches within that layer are merged), not between sub-batches | P1 | 14 |
| REQ-NF-14-02 | Worktree cleanup | After each agent completes successfully, its worktree must be cleaned up. After a failed agent completes, its worktree must be cleaned up unless `retain_failed_worktrees` is set to `true` in the Ptah configuration. The `retain_failed_worktrees` flag defaults to `false` when absent — cleanup is the default behavior on failure. | Worktrees are removed after successful completion; worktrees are removed after failure unless `retain_failed_worktrees: true` is set in configuration (default: `false`); when retention is enabled, failed worktrees are preserved for debugging | P1 | 14 |
| REQ-NF-14-03 | Backward compatibility | The existing sequential implementation path (direct dispatch to backend-engineer or frontend-engineer) must remain functional. Tech-lead orchestration is engaged only when the feature's `FeatureConfig` has `useTechLead: true`. When this field is absent or false, the orchestrator dispatches to `eng` or `fe` per the existing `discipline`-based logic in `pdlc-dispatcher.ts` without modification. The `FORK_JOIN_PHASES` classification for fullstack IMPLEMENTATION continues to apply when `useTechLead` is false. When `useTechLead === true`, the `FORK_JOIN_PHASES` fork-join behavior for IMPLEMENTATION is suppressed regardless of `discipline`, and a single tech-lead dispatch is issued instead. | Existing PDLC flow works unchanged when `useTechLead` is absent or false; when `useTechLead === true`, a single tech-lead dispatch is issued for fullstack features and fork-join is not triggered | P0 | 14 |
| REQ-NF-14-04 | Plan format compatibility | The tech lead must work with execution plans following the existing template format (`docs/templates/backend-plans-template.md`). The "Task Dependency Notes" section is extended to support fan-out syntax (`A → [B, C]`) in addition to the existing linear chain syntax (`A → B → C`). The plan template will be updated as part of this feature to document the extended fan-out syntax. Plans that use only linear-chain syntax continue to work and will produce single-phase batches (effective sequential execution), which is valid behavior. | The tech lead successfully parses plans using both linear-chain and fan-out dependency syntax; linear-chain plans produce single-phase batches; the updated template documents both syntax forms | P0 | 14 |
| REQ-NF-14-05 | Pre-flight infrastructure check before parallel dispatch | Before dispatching any parallel batch, the tech lead must verify that two infrastructure prerequisites are in place: (1) the persistent feature branch (`feat-{feature-name}`) exists on the remote repository (not just locally), as this is the base from which agent worktrees are created; (2) the `ArtifactCommitter` service (Phase 010) supports the two-tier branch merge operation needed to merge worktree branches into the feature branch. If either check fails, the tech lead must post a notification in the coordination thread explaining the failure, fall back to sequential execution (one phase per batch, in document order), and proceed without re-presenting the plan for approval. This check runs only when the batch plan includes at least one batch with more than one phase; it is skipped entirely in sequential fallback mode. | WHO: As the Ptah orchestrator GIVEN: The batch plan includes at least one batch with more than one phase AND the user has approved the execution plan WHEN: The tech lead runs pre-flight checks THEN: (a) if both checks pass, parallel execution proceeds as planned; (b) if the feature branch is absent from the remote, the tech lead posts a notification identifying the failed check and falls back to sequential execution without re-prompting; (c) if ArtifactCommitter two-tier merge support is unavailable, the tech lead posts a notification and falls back to sequential execution without re-prompting | P1 | 14 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Merge conflicts between phases in the same batch | Medium | High | Batch computation should group phases that touch overlapping files into the same sequential batch when possible; merges are serialized; conflicts are reported immediately | [REQ-BD-04], [REQ-TL-04] |
| R-02 | Dependency graph parsing fails on non-standard plan formats | Low | Medium | Graceful fallback to sequential execution with warning; plan template remains the authoritative format | [REQ-PD-05] |
| R-03 | Agent token/context limits exceeded for large phases | Medium | Medium | Each phase is delegated independently with only its task table, not the full plan context; the tech lead manages the orchestration context | [REQ-TL-05] |
| R-04 | Flaky tests cause false batch failures | Medium | Medium | Clear error reporting helps the developer identify flaky vs. real failures; resume capability avoids re-running passed batches | [REQ-BD-05], [REQ-BD-06] |
| R-05 | Phase 10 branch infrastructure not yet implemented | Low | High | Phase 10 implementation is committed to the repository (`worktree-registry.ts`, `feature-branch.ts`, `artifact-committer.ts`). The tech-lead uses the Agent tool's `isolation: "worktree"` parameter rather than calling these APIs directly, further reducing the dependency surface. Risk is now Low likelihood. | [REQ-BD-03], [REQ-NF-14-03] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 17 | REQ-PD-01, REQ-PD-02, REQ-PD-03, REQ-PD-04, REQ-PD-06, REQ-BD-01, REQ-BD-02, REQ-BD-03, REQ-BD-04, REQ-BD-05, REQ-BD-07, REQ-TL-01, REQ-TL-02, REQ-TL-03, REQ-TL-05, REQ-NF-14-03, REQ-NF-14-04 |
| P1 | 10 | REQ-PD-05, REQ-BD-06, REQ-BD-08, REQ-TL-04, REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-NF-14-01, REQ-NF-14-02, REQ-NF-14-05 |
| P2 | 1 | REQ-PR-04 |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 14 | 28 | All requirements in this document |

---

## 9. Scope Boundaries

### In Scope

- Dependency graph parsing from existing PLAN document format (linear chain and extended fan-out syntax)
- Plan template update to document fan-out dependency syntax
- Topological batch computation for parallel execution
- Skill type inference from source file paths (with conflict resolution for mixed-path phases)
- Parallel agent dispatch with worktree isolation (via Agent tool `isolation: "worktree"`)
- Sequential batch execution with test validation gates
- Batch resumption from arbitrary starting points
- Progress reporting at batch and phase levels
- Merge conflict detection and reporting
- Integration with existing PDLC state machine (IMPLEMENTATION phase via `useTechLead` config flag)
- Backward-compatible fallback when `useTechLead` is absent or false
- Pre-flight infrastructure check (feature branch on remote, ArtifactCommitter two-tier merge support) with sequential fallback on failure
- Cycle detection in dependency graphs with fallback to sequential execution
- Serialized plan status updates to prevent concurrent write corruption

### Out of Scope

- Intra-phase task parallelism (splitting tasks within a phase across agents)
- Automatic merge conflict resolution (conflicts require human intervention)
- Changes to the PDLC state machine phase transitions (tech lead operates within IMPLEMENTATION)
- Real-time streaming of agent output to the developer
- Cost/token optimization across parallel agents
- Automatic file-overlap analysis for smarter batch grouping (future enhancement)
- Automatic retry of failed phases (developer decides whether to resume or abort)

### Assumptions

- The Agent tool's `isolation: "worktree"` parameter provides per-agent git worktree isolation without requiring direct TypeScript API calls from the tech-lead skill
- The tech-lead skill definition (`.claude/skills/tech-lead/SKILL.md`) is maintained alongside the other skill definitions
- Plans follow the established template with a "Task Dependency Notes" section; fan-out syntax support is added as part of this feature

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
| 1.4 | 2026-03-19 | Product Manager | Added REQ-NF-14-05 (Pre-flight infrastructure check) to back the FSPEC-TL-02 linked requirement reference that was present in the FSPEC but had no corresponding REQ entry. Updated requirements summary: P1 count 9→10, Phase 14 total 27→28. Updated scope boundary to include pre-flight infrastructure check. |
| 1.3 | 2026-03-19 | Product Manager | Addressed blocking Medium findings from BE Round 3 / TE Round 4: (1) REQ-NF-14-02 — rewrote description to remove contradiction with acceptance criteria; added explicit default value for `retain_failed_worktrees` (defaults to `false`); updated acceptance criteria for consistency. (2) REQ-NF-14-03 — added explicit sentence suppressing `FORK_JOIN_PHASES` fork-join behavior when `useTechLead === true`. Also addressed Low findings: added plan file precondition (missing/unreadable plan) to REQ-PD-01; deferred test suite invocation timeout to TSPEC via note in REQ-BD-05. |
| 1.2 | 2026-03-19 | Product Manager | Corrected requirements summary counts: P0 count 18 → 17, Phase 14 total 28 → 27 (cosmetic fix per TE cross-review F-01) |
| 1.1 | 2026-03-19 | Product Manager | Addressed cross-review feedback: clarified plan dependency format (fan-out syntax support + template update); specified partial batch failure merge semantics (no partial merges); clarified worktree mechanism (Agent tool `isolation: "worktree"`); added `useTechLead` config field for dispatcher routing; added REQ-PD-06 for cycle detection; made REQ-PD-02 batch formula precise; added mixed-path skill conflict resolution to REQ-PD-03; narrowed REQ-TL-02 modification/rejection protocol; specified sub-batch test gate semantics in REQ-NF-14-01; added all-phases-done edge case to REQ-PD-04; added serialization note to REQ-BD-08; distinguished test invocation vs. assertion failure in REQ-BD-05; added agent timeout config reference to REQ-BD-07; updated R-05 to Low likelihood |

---

*End of Document*
