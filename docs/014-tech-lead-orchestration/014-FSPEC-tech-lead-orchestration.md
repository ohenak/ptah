# Functional Specification: Tech Lead Orchestration

| Field | Detail |
|-------|--------|
| **Document ID** | 014-FSPEC-tech-lead-orchestration |
| **Requirements** | [014-REQ-tech-lead-orchestration](./014-REQ-tech-lead-orchestration.md) |
| **Version** | 1.2 |
| **Date** | March 19, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This document specifies the behavioral logic for the tech-lead orchestration layer introduced in Phase 14. It defines decision rules, flow sequences, edge cases, and error scenarios for requirements that contain branching logic or multi-step processes that engineers should not resolve independently.

**Scope of this FSPEC:** Plan ingestion and dependency parsing, topological batch computation (including sub-batch splitting), phase skill assignment, pre-flight infrastructure verification, the pre-execution confirmation loop, the batch execution lifecycle, phase failure handling, batch-level result merging, the post-batch test gate, plan status updates, and resume logic.

**Not in this FSPEC:** Technical implementation choices (data structures, class design, algorithm library selection), test strategy, or code organization — those are TSPEC concerns.

---

## 2. Functional Specifications

### FSPEC-PD-01 — Dependency Graph Parsing

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-PD-01], [REQ-PD-05], [REQ-PD-06] |
| **Description** | Defines how the tech lead reads a PLAN document and constructs a directed acyclic graph (DAG) of phase dependencies. |

#### 2.1.1 Input

- The fully-qualified file path to an approved PLAN document (e.g., `docs/014-tech-lead-orchestration/014-PLAN-tech-lead-orchestration.md`).

#### 2.1.2 Behavioral Flow

```
1. Verify the plan file exists and is readable.
   → If missing or unreadable: report error with the file path; halt. Do not dispatch any agents.

2. Parse the plan document to extract:
   a. The list of phases (plan phase headers, e.g., "Phase A — Foundation Types").
   b. The task table for each phase (columns: Task, Source File, Test File, Status).
   c. The "Task Dependency Notes" section.

3. Locate the "Task Dependency Notes" section.
   → If the section is absent or empty: enter SEQUENTIAL FALLBACK MODE (see §2.1.5).

4. Parse dependency declarations from the "Task Dependency Notes" section.
   Two canonical syntax forms are required (from REQ-PD-01):
     Form 1 — Linear chain:  "A → B → C"
       (B depends on A; C depends on B)
     Form 2 — Fan-out:       "A → [B, C]"
       (B and C each depend on A; brackets required around multiple targets)
   The natural-language form is also accepted:
     Form 3 — Natural language: "Phase X depends on: Phase A, Phase B"
       (Phase X depends on Phase A and Phase B)
   Phase names in all forms are matched case-insensitively and with leading/
   trailing whitespace trimmed. Lines in the dependency section that do not
   match any of the three supported forms are ignored (not parsed as dependency
   declarations) and a debug log entry is emitted for each skipped line.
   → If no dependency lines can be parsed (section exists but all lines match
     none of the three supported forms): enter SEQUENTIAL FALLBACK MODE (see §2.1.5).

5. Construct a directed acyclic graph (DAG):
   - Nodes: one per phase identified in step 2a.
   - Edges: for each dependency declaration "Phase X depends on Phase Y",
     add a directed edge Y → X (Y must complete before X).

6. Validate the DAG:
   a. Check for cycles (a phase that, directly or transitively, depends on itself).
      → If a cycle is detected: enter SEQUENTIAL FALLBACK MODE (see §2.1.5).
      Log the cycle path (e.g., "Cycle detected: Phase C → Phase E → Phase C").
   b. Check that every phase referenced in dependency declarations exists as a
      node (no dangling references).
      → If a dangling reference is found: log a warning identifying the unknown
        phase name; treat it as if that dependency line did not exist and continue.
        Do not enter fallback mode for dangling references alone.

7. Return the validated DAG for batch computation (FSPEC-PD-02).
```

#### 2.1.3 Business Rules

- The tech lead treats the PLAN document as read-only during dependency parsing. It must not write to the plan file at this stage.
- Phase names are compared case-insensitively and with leading/trailing whitespace trimmed to tolerate minor formatting variations.
- A plan with zero inter-phase dependencies (all phases are independent) is valid — it produces a DAG with no edges. All phases land in Batch 1.
- A plan with exactly one phase is valid — it produces a single-node DAG with a single-phase Batch 1.

#### 2.1.4 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Plan file path is a directory | Report error: "Expected a file path, not a directory: `{path}`". Halt. |
| Plan file exists but is empty | Report error: "Plan file is empty: `{path}`". Halt. |
| Plan has phases but no task tables | Log warning: "No task tables found; phase list derived from phase headers only." Continue with empty task tables. |
| Dependency section references a phase letter not in the phase list | Log warning identifying the unknown phase; ignore that dependency line. Continue. |
| All phases have no dependencies listed (empty dependency section) | Enter SEQUENTIAL FALLBACK MODE. |

#### 2.1.5 Sequential Fallback Mode

When sequential fallback is triggered:
1. Log a warning explaining the reason (missing section / parse failure / cycle detected).
2. Treat each phase as an independent single-phase batch, in document order (Phase A = Batch 1, Phase B = Batch 2, …).
3. Continue to pre-execution confirmation (FSPEC-TL-01), presenting the sequential plan clearly labelled "Sequential execution — parallel batching not available."
4. Do **not** run the pre-flight infrastructure check (FSPEC-TL-02) — sequential execution does not require the Phase 010 branch infrastructure.

#### 2.1.6 Acceptance Tests

**AT-PD-01-01: Valid plan with dependency section (fan-out syntax)**
```
WHO:   As the Ptah orchestrator
GIVEN: A plan with phases A–F and a "Task Dependency Notes" section using fan-out syntax:
         "A → [B, C]"   (B and C depend on A)
         "B → [D]"      (D depends on B)
         "C → [D]"      (D also depends on C)
         "D → [E, F]"   (E and F depend on D)
WHEN:  The tech lead parses the plan
THEN:  A 6-node DAG is constructed: A(0 deps), B(dep A), C(dep A), D(dep B,C), E(dep D), F(dep D)
       No warnings are emitted
```

**AT-PD-01-02: Missing dependency section**
```
WHO:   As the Ptah orchestrator
GIVEN: A valid plan with phases A–C but no "Task Dependency Notes" section
WHEN:  The tech lead parses the plan
THEN:  A warning is logged: "Task Dependency Notes section not found — falling back to sequential execution"
       Sequential fallback mode is entered; batches = [A], [B], [C]
```

**AT-PD-01-03: Cycle in dependency graph**
```
WHO:   As the Ptah orchestrator
GIVEN: A plan with declarations "Phase B depends on Phase C" and "Phase C depends on Phase B"
WHEN:  The tech lead validates the DAG
THEN:  A warning is logged identifying the cycle path
       Sequential fallback mode is entered
```

**AT-PD-01-04: Missing plan file**
```
WHO:   As the Ptah orchestrator
GIVEN: The plan file path does not exist on the filesystem
WHEN:  The tech lead attempts to read the plan
THEN:  An error is reported: "Plan file not found: {path}"
       No agents are dispatched
       Execution halts
```

**AT-PD-01-05: Dangling reference in dependency section**
```
WHO:   As the Ptah orchestrator
GIVEN: A plan with phases A, B, C and a dependency section containing "A → [B, Z]"
       (Phase Z does not exist in the plan's phase list)
WHEN:  The tech lead validates the DAG
THEN:  A warning is logged: "Unknown phase 'Z' referenced in dependency declaration — ignoring this reference"
       The dependency A → B is still parsed and applied
       The reference to Z is ignored; parse continues
       Sequential fallback is NOT triggered (a dangling reference alone does not cause fallback)
```

**AT-PD-01-06: Plan with phase headers but no task tables**
```
WHO:   As the Ptah orchestrator
GIVEN: A plan with phase headers "Phase A — Foundation" and "Phase B — Services"
       but no task table rows under either phase
WHEN:  The tech lead parses the plan
THEN:  A warning is logged: "No task tables found; phase list derived from phase headers only."
       Batch computation proceeds using only the phase headers
       Both phases are treated as not completed (absence of tasks ≠ completion)
       Parse continues without error
```

---

### FSPEC-PD-02 — Topological Batch Computation

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-PD-02], [REQ-PD-04], [REQ-NF-14-01] |
| **Description** | Specifies how the validated dependency DAG is converted into ordered execution batches, how completed phases are excluded, and how batches exceeding the concurrency limit are split into sub-batches. |

#### 2.2.1 Behavioral Flow

```
1. Exclude completed phases.
   For each phase, inspect its task table. A phase is COMPLETED if every task
   row has status "Done" (✅ or equivalent done marker). Remove completed phases
   from the DAG. Treat their edges as satisfied — any phase that depended only
   on completed phases now has in-degree 0.

2. Perform topological layering:
   a. Batch 1 = all phases with in-degree 0 (no remaining dependencies).
   b. Remove Batch 1 phases from the DAG.
   c. Batch 2 = all phases now with in-degree 0 after Batch 1 removal.
   d. Repeat until the DAG is empty.

3. For each computed batch, apply the concurrency cap:
   If a batch contains more than 5 phases, split it into consecutive sub-batches
   of at most 5 phases each (see §2.2.3 for sub-batch ordering rules).
   Sub-batches are labelled "Batch N.1", "Batch N.2", etc.
   Sub-batches within the same topological batch execute sequentially (no
   test gate fires between individual sub-batches). The test validation gate
   fires once per topological batch — after all sub-batches in that topological
   layer have completed and been merged (REQ-NF-14-01).

4. Return the ordered list of batches (and sub-batches, if any) for presentation
   in the pre-execution confirmation step (FSPEC-TL-01).
```

#### 2.2.2 Completed Phase Exclusion Rules

- A phase is COMPLETED only if **all** tasks in its task table are marked Done. A phase with even one task marked "In Progress", "Not Started", or with a blank status is **not** completed.
- If a plan phase has no task table (zero task rows), it is treated as **not completed** — absence of tasks does not imply completion.
- Completed phases are excluded from batch computation but their dependency edges are treated as satisfied. This is what enables resume: phases B and C that depend on completed phase A correctly land in Batch 1 (after A is excluded).

#### 2.2.3 Sub-batch Ordering Rules

When a batch of N > 5 phases is split into sub-batches, phases are assigned to sub-batches in the order they appear in the plan document (document order is the stable tie-breaker). This rule exists so that the split is deterministic and reproducible — running the same plan twice always produces the same sub-batch grouping.

Example: A batch containing phases [C, D, E, F, G, H, I] (7 phases) in document order is split into:
- Sub-batch 1: [C, D, E, F, G]
- Sub-batch 2: [H, I]

#### 2.2.4 Edge Cases

| Scenario | Behavior |
|----------|----------|
| All phases are completed | Computed batch list is empty. Skip to final summary (no execution occurs). Report: "All phases are already marked Done. Nothing to execute." |
| Single remaining phase | One batch containing one phase. No parallel dispatch needed — dispatch as a single agent (no worktree isolation overhead required, but worktree isolation is still used for consistency). |
| DAG has 12 phases, all independent (in-degree 0) | Single batch of 12 phases → split into sub-batches [phases 1–5], [phases 6–10], [phases 11–12]. |
| A phase in the middle of the document is completed but its dependents are not | Completed phase is excluded; its dependents move earlier in the batch sequence accordingly. |

#### 2.2.5 Acceptance Tests

**AT-PD-02-01: Standard topological layering**
```
WHO:   As the Ptah orchestrator
GIVEN: DAG with: A(no deps), B(dep A), C(dep A), D(dep B,C), E(dep D)
WHEN:  Topological batching is computed with no completed phases
THEN:  Batch 1 = [A], Batch 2 = [B, C], Batch 3 = [D], Batch 4 = [E]
```

**AT-PD-02-02: Resume with completed phases excluded**
```
WHO:   As the Ptah orchestrator
GIVEN: Same DAG; phases A, B, C are all marked Done
WHEN:  Topological batching is computed
THEN:  D has in-degree 0 (both dependencies satisfied); Batch 1 = [D], Batch 2 = [E]
       Phases A, B, C do not appear in any batch
```

**AT-PD-02-03: Large batch split**
```
WHO:   As the Ptah orchestrator
GIVEN: 7 independent phases [C, D, E, F, G, H, I] in document order (all in-degree 0)
WHEN:  Batch computation applies the concurrency cap of 5
THEN:  Batch 1.1 = [C, D, E, F, G], Batch 1.2 = [H, I]
       Batch 1.1 executes and its worktrees are merged; Batch 1.2 then executes and its worktrees are merged
       The test validation gate fires once, after Batch 1.2 is merged (not between Batch 1.1 and 1.2)
       Batch 2 does not start until the single post-Batch-1 test gate passes
```

**AT-PD-02-04: All phases completed**
```
WHO:   As the Ptah orchestrator
GIVEN: A plan where every task in every phase is marked Done
WHEN:  Batch computation runs
THEN:  The batch list is empty
       The tech lead reports: "All phases are already marked Done. Nothing to execute."
       No agents are dispatched
```

---

### FSPEC-PD-03 — Phase Skill Assignment

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-PD-03] |
| **Description** | Specifies the exact rules for assigning backend-engineer or frontend-engineer to a phase based on Source File paths in its task table. |

#### 2.3.1 Assignment Rules

Skill assignment is determined solely by the **Source File** column of the phase's task table. The Test File column is ignored for this purpose.

**Path prefix → Skill mapping:**

| Source File prefix | Assigned skill |
|--------------------|---------------|
| `src/` | backend-engineer |
| `config/` | backend-engineer |
| `tests/` | backend-engineer |
| `bin/` | backend-engineer |
| `app/` | frontend-engineer |
| `components/` | frontend-engineer |
| `pages/` | frontend-engineer |
| `styles/` | frontend-engineer |
| `hooks/` | frontend-engineer |
| `docs/` (only) | backend-engineer (default) |
| `—` or empty | backend-engineer (default) |
| Any unrecognized prefix (e.g., `lib/`, `utils/`, `scripts/`) | backend-engineer (silent default, no warning) |

**Mixed-layer rule:** If a phase's task table contains Source File entries mapping to both backend-engineer prefixes (e.g., `src/`) and frontend-engineer prefixes (e.g., `app/`), the phase is assigned **backend-engineer** and a warning is logged:

> `"Warning: Phase {X} has tasks spanning both backend (src/) and frontend (app/) source paths. Defaulted to backend-engineer. Review skill assignment before approving the execution plan."`

This warning is surfaced in the pre-execution confirmation (FSPEC-TL-01) so the developer can override the assignment before any agents are dispatched.

#### 2.3.2 Skill Assignment Precedence

1. If all Source File entries in the task table are backend-only prefixes → **backend-engineer**.
2. If all Source File entries are frontend-only prefixes → **frontend-engineer**.
3. If Source File entries span both prefix groups → **backend-engineer** with warning.
4. If all Source File entries are `docs/` or empty → **backend-engineer** (silent default, no warning).
5. If a Source File entry's path prefix is not in any recognized category (not backend, not frontend, not `docs/`, and not empty) → treat as a **backend path** (silent default, no warning). Unrecognized prefixes do not trigger the mixed-layer warning unless they co-exist with explicit frontend prefixes (in which case rule 3 applies because the mixed-layer check treats unrecognized paths as backend).

#### 2.3.3 Acceptance Tests

**AT-PD-03-01: Pure backend phase**
```
WHO:   As the Ptah orchestrator
GIVEN: A phase whose task table Source File column contains only "src/services/foo.ts" and "tests/unit/foo.test.ts"
WHEN:  Skill assignment runs
THEN:  Assigned skill = backend-engineer; no warning emitted
```

**AT-PD-03-02: Pure frontend phase**
```
WHO:   As the Ptah orchestrator
GIVEN: A phase whose Source File column contains "app/components/Bar.tsx" and "styles/bar.css"
WHEN:  Skill assignment runs
THEN:  Assigned skill = frontend-engineer; no warning emitted
```

**AT-PD-03-03: Mixed-layer phase**
```
WHO:   As the Ptah orchestrator
GIVEN: A phase with Source Files "src/api/handler.ts" and "app/views/Form.tsx"
WHEN:  Skill assignment runs
THEN:  Assigned skill = backend-engineer
       Warning logged identifying Phase X as spanning backend and frontend paths
       Warning is surfaced in the pre-execution confirmation
```

**AT-PD-03-04: Documentation-only phase**
```
WHO:   As the Ptah orchestrator
GIVEN: A phase whose only Source File entry is "docs/014-tech-lead-orchestration/overview.md"
WHEN:  Skill assignment runs
THEN:  Assigned skill = backend-engineer; no warning emitted
```

---

### FSPEC-TL-01 — Pre-execution Plan Confirmation and Modification Loop

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-TL-02] |
| **Description** | Specifies the content of the pre-execution batch plan presented to the user, the modifications the user may request, and the rules for when the modification loop terminates. This FSPEC resolves TE-F-04 (modification loop termination was deferred from REQ). |

#### 2.4.1 Confirmation Presentation Content

Before dispatching any agents, the tech lead presents a **Batch Execution Plan** in the coordination thread. The plan must include:

1. **Execution mode** — "Parallel (N batches)" or "Sequential fallback (N batches)" — with a reason if sequential fallback applies.
2. **Pre-flight status** — Pass/Fail for each infrastructure check (feature branch presence, ArtifactCommitter availability) — only shown when parallel mode is active.
3. **Batch summary table:**

   | Batch | Phases | Skills |
   |-------|--------|--------|
   | Batch 1 | Phase A | backend-engineer |
   | Batch 2 | Phase B, Phase C | backend-engineer, backend-engineer |
   | … | … | … |

4. **Any warnings** from skill assignment (mixed-layer phases) or dependency parsing (dangling references).
5. **Resume note** (if applicable) — "Resuming from Batch N. Phases {list} have been skipped as already completed." (See FSPEC-BD-03 for resume detection logic.)
6. **Confirmation prompt** — "Type **approve** to begin execution, **modify** to adjust the plan, or **cancel** to abort."

#### 2.4.2 Modification Loop

If the user responds **modify**, the tech lead enters a modification loop:

```
1. Ask the user to specify the modification:
   "What would you like to change? (e.g., 'change Phase D to frontend-engineer',
   'move Phase E to Batch 2', 'split Batch 3')"

2. Apply the requested modification to the in-memory batch plan.
   Valid modification types:
   a. Change skill assignment for a phase (override the auto-inferred assignment).
   b. Move a phase to a different batch (must not violate the phase's dependency constraints).
      → If the requested move would place a phase into the same batch as any of its
        dependencies, OR into a batch numbered before any of its dependencies, reject
        the move with an explanation and re-prompt. Phases within a batch execute in
        parallel; a phase may only be in a batch strictly after all phases it depends on.
   c. Split a batch into two consecutive batches (user specifies which phases stay
      in the current batch and which move to the new batch).

3. Present the updated Batch Execution Plan in full (same format as §2.4.1).

4. Re-prompt: "Type approve to begin execution, modify to make another change, or cancel to abort."
```

#### 2.4.3 Modification Loop Termination Rules

The modification loop terminates when:

- The user responds **approve** → execution begins.
- The user responds **cancel** → execution is aborted; the tech lead reports "Execution cancelled by user." No agents are dispatched.
- The user provides **no response within 10 minutes** of the prompt → the tech lead reports "Confirmation timeout — execution cancelled." No agents are dispatched. (Timeout policy is approximate; exact implementation is a TSPEC concern.)
- The modification loop has cycled **5 times without an approve or cancel** → the tech lead reports: "Maximum modification iterations reached. Please approve or cancel to proceed." and re-presents the final plan. If the user still does not respond within 10 minutes, apply the timeout rule above.

**There is no automatic approval.** The tech lead never begins execution without an explicit **approve** response from the user.

#### 2.4.4 Acceptance Tests

**AT-TL-01-01: Standard approval**
```
WHO:   As the developer
GIVEN: The tech lead has computed 3 batches for a 6-phase plan
WHEN:  The developer reads the Batch Execution Plan and types "approve"
THEN:  Execution begins immediately with Batch 1
```

**AT-TL-01-02: Skill override modification**
```
WHO:   As the developer
GIVEN: Phase D was auto-assigned backend-engineer due to a mixed-layer warning
WHEN:  The developer types "modify" then "change Phase D to frontend-engineer"
THEN:  The plan is updated; Phase D now shows frontend-engineer
       The updated plan is re-presented; the developer can approve or modify further
```

**AT-TL-01-03: Dependency-violating move rejected**
```
WHO:   As the developer
GIVEN: Phase E depends on Phase D; both are in Batch 3
WHEN:  The developer requests "move Phase E to Batch 2"
THEN:  The tech lead rejects the move: "Phase E depends on Phase D (Batch 3). Moving Phase E before Phase D would violate its dependency. Please choose a batch after Batch 3."
       The original plan is retained; the developer is re-prompted
```

**AT-TL-01-04: User cancels**
```
WHO:   As the developer
GIVEN: A batch plan has been presented
WHEN:  The developer types "cancel"
THEN:  "Execution cancelled by user." is posted in the coordination thread
       No agents are dispatched; no worktrees are created
```

**AT-TL-01-05: Maximum modifications reached**
```
WHO:   As the developer
GIVEN: The modification loop has cycled 5 times
WHEN:  The tech lead re-presents the final plan after the 5th modification
THEN:  "Maximum modification iterations reached. Please approve or cancel to proceed." is posted
       The tech lead waits for approve or cancel; no automatic execution occurs
```

**AT-TL-01-06: Same-batch dependency violation rejected**
```
WHO:   As the developer
GIVEN: Phase E depends on Phase D; Phase D is currently in Batch 3, Phase E is in Batch 4
WHEN:  The developer requests "move Phase E to Batch 3"
THEN:  The tech lead rejects the move:
         "Phase E depends on Phase D (also in Batch 3). Phases in the same batch run in
          parallel — Phase E cannot share a batch with its dependency Phase D.
          Please choose a batch strictly after Batch 3."
       The original plan is retained (Phase E remains in Batch 4); the developer is re-prompted
```

**AT-TL-01-07: Confirmation timeout cancels execution**
```
WHO:   As the developer
GIVEN: A batch plan has been presented in the coordination thread
WHEN:  The developer provides no response for 10 minutes
THEN:  "Confirmation timeout — execution cancelled." is posted in the coordination thread
       No agents are dispatched; no worktrees are created
       Execution does not begin
```

---

### FSPEC-TL-02 — Pre-flight Infrastructure Check

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-NF-14-05] |
| **Description** | Specifies the two infrastructure checks the tech lead must pass before dispatching any parallel batch. Defines the fallback behavior when either check fails. This check applies only when the batch plan contains batches with more than one phase (parallel dispatch is required). |

#### 2.5.1 When Pre-flight Runs

Pre-flight runs **after** the user approves the batch execution plan (FSPEC-TL-01) and **before** any agents are dispatched. In sequential fallback mode (all batches have one phase), pre-flight is skipped entirely.

**Ordering with parse-time fallback:** When sequential fallback is triggered during dependency parsing (FSPEC-PD-01 §2.1.5), the flow is: parse → fallback triggered → pre-execution confirmation shown to user (with "Sequential execution" label) → user approves → pre-flight is not invoked → sequential execution begins. The user always sees the confirmation step; pre-flight is simply never reached in sequential mode.

#### 2.5.2 Infrastructure Checks

Two checks are performed in sequence:

**Check 1 — Feature branch present on remote:**
Verify that the persistent `feat-{feature-name}` branch exists on the remote repository (not just locally). This is the base branch from which agent worktrees are created.

- Pass: branch exists on remote.
- Fail: branch does not exist on remote.

**Check 2 — ArtifactCommitter two-tier merge capability:**
Verify that the `ArtifactCommitter` service (introduced in Phase 010) supports the two-tier branch merge operation needed to merge agent worktree branches into the feature branch.

- Pass: the `ArtifactCommitter` service confirms it can perform a worktree-branch-to-feature-branch merge. Behaviorally, this means the service exposes or acknowledges a `mergeBranchIntoFeature` capability. The specific verification mechanism (method existence check, capability flag, version query) is a TSPEC concern, but whatever mechanism is used must produce a definitive pass/fail answer before any agent dispatch occurs.
- Fail: the `ArtifactCommitter` service does not expose the two-tier merge capability, or Phase 010 has not been deployed and the service is entirely unavailable.

#### 2.5.3 Fallback Behavior

If either check fails:
1. Log the specific check that failed with an explanation.
2. Post in the coordination thread: "Pre-flight check failed: {reason}. Falling back to sequential execution (one phase per batch). Parallel dispatch is unavailable pending Phase 010 deployment."
3. Recompute the batch plan in sequential mode (one phase per batch, document order) — **without** re-presenting the plan for approval. The user already approved the intent; the tech lead is transparently degrading the execution mode, not changing what gets implemented.
4. Proceed with sequential execution using the recomputed single-phase batches.

#### 2.5.4 Acceptance Tests

**AT-TL-02-01: Both checks pass**
```
WHO:   As the Ptah orchestrator
GIVEN: feat-{feature-name} exists on the remote; ArtifactCommitter two-tier capability is available
WHEN:  Pre-flight runs after plan approval
THEN:  Both checks pass; parallel execution proceeds as planned
```

**AT-TL-02-02: Feature branch missing on remote**
```
WHO:   As the Ptah orchestrator
GIVEN: The local feat-* branch exists but has not been pushed to remote
WHEN:  Pre-flight Check 1 runs
THEN:  Check 1 fails; warning logged; sequential fallback applied
       Tech lead posts the fallback notification in the coordination thread
       Sequential execution proceeds without re-prompting for approval
```

**AT-TL-02-03: ArtifactCommitter capability absent**
```
WHO:   As the Ptah orchestrator
GIVEN: Phase 010 has not been deployed; ArtifactCommitter lacks two-tier merge support
WHEN:  Pre-flight Check 2 runs
THEN:  Check 2 fails; warning logged; sequential fallback applied
```

---

### FSPEC-BD-01 — Batch Execution Lifecycle

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-BD-01], [REQ-BD-02], [REQ-BD-03], [REQ-BD-04], [REQ-BD-05], [REQ-BD-08], [REQ-PR-01], [REQ-PR-02], [REQ-PR-03] |
| **Description** | Specifies the complete end-to-end sequence for executing a single batch, from batch-start notification through plan status update. This is the core loop the tech lead executes for each batch (and sub-batch). |

#### 2.6.1 Behavioral Flow (Per Batch)

> **Sub-batch note (REQ-NF-14-01):** When a topological batch is split into sub-batches (N.1, N.2, …), this lifecycle runs once per sub-batch with one modification: the **test gate (step 8) and plan status update (step 9) are deferred to after the final sub-batch** in the topological layer. Sub-batches N.1 through N.(last-1) skip steps 8–10 and proceed directly from step 7 (merge) to the next sub-batch at step 1. Only the final sub-batch N.last executes steps 8–10 for the full topological batch.
>
> **Sub-batch failure cascade:** If FSPEC-BD-02 is triggered for sub-batch N.M (due to any phase failure), **all remaining sub-batches N.(M+1) and beyond are immediately cancelled — none of them execute**. The failure handling and execution halt described in FSPEC-BD-02 apply to the entire topological batch. This preserves the no-partial-merge invariant: because sub-batch N.M had no merges (FSPEC-BD-02 §2.7.2 step 5), and no previous sub-batch had a failure, the feature branch remains in the same state it was in before topological batch N began.

```
1. POST BATCH START NOTIFICATION (REQ-PR-01)
   Post in coordination thread:
   "Starting Batch {N} ({K} phases in parallel): {Phase X} ({skill}), {Phase Y} ({skill}), …"
   For sub-batches: "Starting Batch {N}.{M} (sub-batch {M} of {total}) ({K} phases): …"

2. PROVISION WORKTREES
   For each phase in the batch:
   a. Create an isolated git worktree branched from the current tip of the
      feature branch (feat-{feature-name}).
   b. The worktree branch is named: feat-{feature-name}/phase-{X}-{timestamp}
      (where {X} is the phase letter and {timestamp} is a short unique suffix).
   c. Record the worktree path and branch name for later merge and cleanup.

3. DISPATCH AGENTS IN PARALLEL
   Launch all phase agents concurrently. Each agent receives (REQ-TL-05):
   - The plan file path.
   - The specific phase to implement (phase letter + task table).
   - The feature branch name (feat-{feature-name}).
   - The list of completed dependency phases.
   - The ACTION directive: "Implement TSPEC following the PLAN".
   - The worktree path as the working directory.
   Wait for all agents to complete (success or failure).

4. COLLECT RESULTS
   For each phase agent that has completed:
   - Record result: SUCCESS or FAILURE.
   - Record completion notification content for step 5.

5. POST PHASE COMPLETION NOTIFICATIONS (REQ-PR-02)
   For each completed phase (in completion order):
   Post: "Phase {X}: {phase title} — {completed successfully | FAILED: {error summary}}"

6. EVALUATE BATCH OUTCOME
   If ANY phase in the batch failed:
   → Enter BATCH FAILURE HANDLING (FSPEC-BD-02). Stop here.

   If ALL phases succeeded:
   → Continue to step 7.

7. MERGE WORKTREES (SEQUENTIAL, REQ-BD-04)
   For each phase in the batch, in document order:
   a. Merge the phase's worktree branch into the feature branch.
   b. If a merge conflict is detected: enter MERGE CONFLICT HANDLING (see §2.6.2).
   c. After a successful merge: clean up the worktree (delete worktree and branch).

8. RUN TEST GATE (REQ-BD-05)
   Run the project's test suite on the feature branch.
   - If all tests pass: continue to step 9.
   - If any tests fail: report failures in the coordination thread; halt execution.
     Do not proceed to the next batch. The plan status is NOT updated.
     Post: "Test gate failed after Batch {N}. {K} test(s) failing: {test names/summary}.
     Resolve failures and resume from Batch {N}."

9. UPDATE PLAN STATUS (REQ-BD-08) — FINAL STEP
   Write task status updates to the plan document on the feature branch.
   Mark all tasks in all phases of this batch as Done.
   Commit the plan update with message: "chore: mark Batch {N} phases as Done in plan".
   Push to the feature branch.

   Ordering invariant: plan status writes occur ONLY after all worktree merges
   (step 7) and after the test gate (step 8) have completed successfully.
   This prevents plan file divergence from causing merge conflicts.

10. POST BATCH SUMMARY (REQ-PR-03)
    Post in coordination thread:
    "Batch {N} complete: {K}/{K} phases done, {T} tests passing. Next: Batch {N+1} ({M} phases)"
    If this was the final batch: post final summary (REQ-PR-04) instead.

11. ADVANCE TO NEXT BATCH
    Proceed to step 1 for Batch N+1.
```

#### 2.6.2 Merge Conflict Handling

If step 7 encounters a merge conflict while merging phase X's worktree branch:

1. Abort the merge (restore the feature branch to its pre-merge state).
2. Do **not** proceed with merging remaining phases in this batch.
3. Post in the coordination thread: "Merge conflict detected when merging Phase {X} results. Conflicting files: {file1}, {file2}. Please resolve the conflict and resume from Batch {N}." (REQ-TL-04)
4. Halt execution. The plan status is **not** updated for this batch.
5. Clean up all remaining (not-yet-merged) worktrees for this batch without merging.

**Note:** Only the phases already successfully merged (before the conflict) have their changes on the feature branch. This partial state is expected and acceptable — the developer resolves the conflict and resumes from this batch number, which will re-implement any phases whose merges were aborted.

#### 2.6.3 Acceptance Tests

**AT-BD-01-01: Complete batch lifecycle (happy path)**
```
WHO:   As the Ptah orchestrator
GIVEN: A batch containing phases B and C (both assigned backend-engineer)
WHEN:  The batch executes
THEN:  Worktrees are created for B and C
       Agents are launched concurrently
       Both agents complete successfully
       Phase completion notifications are posted
       B's worktree is merged first (document order), then C's
       Test suite runs and passes
       Plan document is updated: all B and C tasks marked Done
       Batch summary is posted
       Tech lead proceeds to the next batch
```

**AT-BD-01-02: Test gate failure halts execution**
```
WHO:   As the Ptah orchestrator
GIVEN: All phases in Batch 2 completed successfully; worktrees merged
WHEN:  The test suite run after Batch 2 reports 2 failing tests
THEN:  "Test gate failed after Batch 2" is posted with the failing test names
       Execution halts; Batch 3 does not start
       Plan status is NOT updated for Batch 2
       The feature branch has the Batch 2 implementation changes (merges succeeded)
       but the plan document still shows those tasks as not done
```

**AT-BD-01-03: Plan update is last step**
```
WHO:   As the Ptah orchestrator
GIVEN: A batch has completed; all merges succeeded; test gate passed
WHEN:  Post-batch processing runs
THEN:  The plan document is updated (tasks marked Done) AFTER all merges and AFTER the test gate
       The plan commit is the last commit in the post-batch sequence
```

---

### FSPEC-BD-02 — Phase Failure Handling

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-BD-07], [REQ-NF-14-02] |
| **Description** | Specifies the exact behavior when one or more agents fail during a batch, including the no-partial-merge invariant and worktree cleanup rules. |

#### 2.7.1 Failure Detection

An agent is considered to have FAILED if it:
- Returns a `ROUTE_TO_USER` routing signal (blocked on a human decision).
- Returns a non-zero exit code.
- Times out without completing (timeout threshold is a TSPEC concern).
- Returns an error response that cannot be classified as a LGTM signal.

An agent is considered to have SUCCEEDED if it returns a `LGTM` routing signal and its exit code is 0.

#### 2.7.2 Behavioral Flow (Batch Failure)

```
1. One or more agents in the batch report FAILURE.

2. Allow all still-running agents in the batch to complete naturally.
   Do NOT terminate running agents mid-execution.
   There is no mechanism to forcibly kill a running agent subagent — this is by design.

3. Once ALL agents in the batch have completed (either success or failure):

4. POST failure notifications for all failed phases:
   "Phase {X}: {phase title} — FAILED: {error summary}"
   Then post an overall failure notice:
   "Batch {N} failed. {K} phase(s) failed: {Phase X}, {Phase Y}. Implementation halted.
   Resolve the failure(s) and resume from Batch {N}."

5. DO NOT MERGE any worktree changes, regardless of which phases succeeded.
   The no-partial-merge invariant: only complete batches (all phases succeeded)
   are merged. A failed batch leaves the feature branch unchanged from before
   Batch N began.

6. CLEAN UP all worktrees for this batch:
   - Successful agent worktrees: always clean up (delete worktree + branch).
   - Failed agent worktrees:
     a. If `retain_failed_worktrees: false` (or absent) in Ptah config: clean up.
     b. If `retain_failed_worktrees: true` in Ptah config: retain the worktree and
        log its path: "Failed worktree for Phase {X} retained at: {path} (branch: {branch-name})"

7. HALT execution. The plan status is NOT updated for this batch.
   The next batch does NOT begin.
```

#### 2.7.3 No-partial-merge Invariant

The no-partial-merge rule exists to ensure that `REQ-BD-06` (resume from batch) finds a clean, consistent starting point. When the developer resumes from Batch N after a failure, the feature branch is in exactly the same state as before Batch N ran — so all phases in Batch N are re-implemented from scratch.

The developer may notice that re-implementation re-does work from phases that succeeded in the failed batch. This is an accepted trade-off: correctness and a clean branch state are prioritized over saving partial work.

#### 2.7.4 Worktree Cleanup Timing

- Worktrees for **successful agents in a failed batch** are cleaned up immediately after the failure-handling flow completes (step 6 above). Their work is discarded.
- Worktrees for **failed agents** follow the `retain_failed_worktrees` configuration flag.
- Default behavior (flag absent or false): all worktrees are cleaned up.

#### 2.7.5 Acceptance Tests

**AT-BD-02-01: One phase fails; others succeed — no partial merge**
```
WHO:   As the Ptah orchestrator
GIVEN: Batch 2 contains phases D, E, F; Phase E fails; D and F succeed
WHEN:  The tech lead processes the batch outcome
THEN:  D and F complete; Phase E failure is detected
       Failure notification posted for Phase E; batch failure notice posted
       NO merges occur — the feature branch is unchanged from before Batch 2 started
       All three worktrees are cleaned up (assuming retain_failed_worktrees: false)
       Execution halts
```

**AT-BD-02-02: Failed worktree retained when configured**
```
WHO:   As the Ptah orchestrator
GIVEN: retain_failed_worktrees: true is set in Ptah config; Phase E fails
WHEN:  Failure handling runs
THEN:  Phase E's worktree is retained at its path
       "Failed worktree for Phase E retained at: {path}" is logged
       Successful agents' worktrees (D, F) are still cleaned up
```

**AT-BD-02-03: All phases in batch fail**
```
WHO:   As the Ptah orchestrator
GIVEN: Batch 2 contains phases D and E; both fail
WHEN:  The tech lead processes the batch outcome
THEN:  Failure notifications posted for D and E; batch failure notice posted
       No merges; all worktrees cleaned per config
       Execution halts
```

**AT-BD-02-04: Sub-batch failure cascades to cancel remaining sub-batches**
```
WHO:   As the Ptah orchestrator
GIVEN: Topological Batch 1 is split into sub-batches:
         Batch 1.1 = [Phase C, Phase D, Phase E, Phase F, Phase G]
         Batch 1.2 = [Phase H, Phase I]
       Phase D in sub-batch 1.1 fails; phases C, E, F, G all succeed
WHEN:  Sub-batch 1.1 failure handling runs
THEN:  No merges occur for sub-batch 1.1 (no-partial-merge invariant — any phase
         failure in a sub-batch prevents all merges for that sub-batch)
       Sub-batch 1.2 is cancelled; phases H and I are never dispatched
       Failure notification posted for Phase D; batch failure notice posted for Batch 1
       Execution halts; Batch 2 does not start
       The feature branch is in the exact same state as before Batch 1 began
```

---

### FSPEC-BD-03 — Resume Logic

| Field | Detail |
|-------|--------|
| **Linked Requirements** | [REQ-BD-06], [REQ-PD-04] |
| **Description** | Specifies the interaction between automatic resume-point detection and explicit user override. Resolves BE Q-03 (was the resume point auto-detected or explicitly specified?). |

#### 2.8.1 Resume Point Detection

When the tech lead is invoked on a plan that has some phases already marked Done, it **automatically detects the resume point** using the completed-phase exclusion logic in FSPEC-PD-02. The tech lead does not require the user to know or specify a batch number.

**Detection algorithm:**
1. Run dependency parsing (FSPEC-PD-01) and completed-phase exclusion (FSPEC-PD-02).
2. The computed batch list represents exactly what remains to be done.
3. The first batch in this list is the "resume point" — the earliest batch with incomplete phases.

#### 2.8.2 Resume Presentation in Confirmation

If the tech lead detects that some phases are already completed, the pre-execution confirmation (FSPEC-TL-01) includes a **resume note** at the top:

> "Resume detected: Phases {A}, {B}, {C} are already marked Done and will be skipped. Execution will begin at the equivalent of Batch {N} in the original plan."

The user can proceed with the auto-detected resume point by typing **approve**, or modify the plan further (e.g., if they want to re-run a phase they believe needs to be redone despite its Done status).

#### 2.8.3 Re-running a Completed Phase

If the developer needs to force a completed phase to re-run (e.g., because the Done status was set incorrectly), they can use the **modify** option in FSPEC-TL-01 to request:

> "Re-run Phase B"

The tech lead responds by marking Phase B as not-completed in the in-memory batch plan (not writing to the plan document), placing it back in the batch computation. Phase B is then included in the batch execution as if it were not done. The developer is informed:

> "Phase B has been added back to the execution plan. It will run in Batch {N}. Note: this does not modify the plan document — task statuses will be updated after the batch completes."

**Downstream Done phases warning:** If Phase B has downstream phases that are also marked Done in the plan (e.g., Phase D which depends on Phase B), those downstream phases remain excluded from the in-memory batch plan unless the developer explicitly requests them to be re-run as well. The tech lead posts a warning alongside the above confirmation message:

> "Warning: Phase D (which depends on Phase B) is still marked Done and will not be re-run. If Phase B's re-implementation changes its outputs, Phase D's Done status may be stale. To also re-run Phase D, type 'modify' and request 're-run Phase D'."

This warning is informational only — the developer is in full control of which phases are re-run.

#### 2.8.4 Acceptance Tests

**AT-BD-03-01: Auto-detection of resume point**
```
WHO:   As the developer
GIVEN: Plan with phases A–F; A, B, C are marked Done in the plan document
WHEN:  The tech lead is invoked
THEN:  The pre-execution confirmation shows: "Resume detected: Phases A, B, C already Done. Execution begins at Batch N."
       Batch computation excludes A, B, C
       The developer types "approve" and execution starts from the first incomplete phase
```

**AT-BD-03-02: No resume — all phases pending**
```
WHO:   As the developer
GIVEN: Plan with no phases marked Done
WHEN:  The tech lead is invoked
THEN:  No resume note appears in the confirmation
       Execution begins at Batch 1 as normal
```

**AT-BD-03-03: Force re-run of completed phase**
```
WHO:   As the developer
GIVEN: Phase B is marked Done but the developer believes it needs to be re-implemented
WHEN:  The developer types "modify" then "re-run Phase B"
THEN:  Phase B is added back to the in-memory batch plan
       The updated plan (now including Phase B) is re-presented for confirmation
       Phase B will execute as a normal phase in its appropriate batch
       The plan document is not modified at this point
```

---

## 3. Open Questions

| ID | Question | Raised By | Status |
|----|----------|-----------|--------|
| OQ-01 | Should the tech lead post progress updates to a dedicated Discord thread per batch, or always to the same coordination thread? | PM | **Resolved:** All progress updates post to the same coordination thread as the orchestrator. No per-batch threads. |
| OQ-02 | If the developer resolves a merge conflict manually and re-pushes, does the tech lead need an explicit signal to resume, or should it detect the resolution? | PM | **Deferred to TSPEC.** The behavioral expectation is that the developer invokes the tech lead again after conflict resolution; auto-detection of conflict resolution is out of scope for this phase. |
| OQ-03 | Does the modification loop (FSPEC-TL-01) need to support merging two phases into one, or splitting one phase into two? | PM | **Out of scope.** Phase-level restructuring is a plan editing concern, not a tech-lead concern. The tech lead works with the phases as defined in the PLAN document. |

---

## 4. FSPEC → Requirement Traceability

| FSPEC ID | Title | Linked Requirements |
|----------|-------|---------------------|
| FSPEC-PD-01 | Dependency Graph Parsing | REQ-PD-01, REQ-PD-05, REQ-PD-06 |
| FSPEC-PD-02 | Topological Batch Computation | REQ-PD-02, REQ-PD-04, REQ-NF-14-01 |
| FSPEC-PD-03 | Phase Skill Assignment | REQ-PD-03 |
| FSPEC-TL-01 | Pre-execution Plan Confirmation and Modification Loop | REQ-TL-02 |
| FSPEC-TL-02 | Pre-flight Infrastructure Check | REQ-NF-14-05 |
| FSPEC-BD-01 | Batch Execution Lifecycle | REQ-BD-01, REQ-BD-02, REQ-BD-03, REQ-BD-04, REQ-BD-05, REQ-BD-08, REQ-PR-01, REQ-PR-02, REQ-PR-03 |
| FSPEC-BD-02 | Phase Failure Handling | REQ-BD-07, REQ-NF-14-02 |
| FSPEC-BD-03 | Resume Logic | REQ-BD-06, REQ-PD-04 |

**Requirements not covered by an FSPEC** (behavior is self-evident from the REQ; no branching logic requiring behavioral specification):

| Requirement | Reason No FSPEC Needed |
|-------------|------------------------|
| REQ-TL-01 | Integration point is a one-line config check in `phaseToAgentId()`; fully specified in REQ-TL-01 and REQ-NF-14-03 |
| REQ-TL-03 | Constraint (tech lead does not write code); no behavioral flow |
| REQ-TL-04 | Covered by FSPEC-BD-01 §2.6.2 (merge conflict handling) |
| REQ-TL-05 | Covered by FSPEC-BD-01 §2.6.1 step 3 (dispatch context) |
| REQ-PR-04 | Final summary is a notification; no branching logic |
| REQ-NF-14-03 | Backward-compatibility flag; fully specified in REQ |
| REQ-NF-14-04 | Compatibility constraint; no behavioral flow |

---

## 5. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2026-03-19 | Product Manager | Addressed all Medium and Low findings from backend-engineer (BE F-01–F-05) and test-engineer (TE F-01–F-07) cross-reviews of v1.1. **Medium fixes:** (1) BE F-01/TE F-03 — replaced "any recognizable form" with explicit enumeration of three supported dependency syntax forms (linear chain, fan-out, natural language); updated AT-PD-01-01 to use canonical fan-out syntax. (2) BE F-02 — amended §2.4.2 step 2b to reject moves placing a phase into the same batch as any of its dependencies, not just before them; added AT-TL-01-06 for same-batch rejection. (3) BE F-03 — added explicit sub-batch failure cascade statement to §2.6.1 sub-batch note; added AT-BD-02-04 for cascade scenario. (4) TE F-01 — added unrecognized Source File prefix fallback rule to §2.3.1 table and §2.3.2 precedence list. **Low fixes:** (5) BE F-04/TE F-07 — added REQ-PD-06 to FSPEC-PD-01 linked requirements and §4 traceability table. (6) BE F-05/TE F-07 — added behavioral pass condition description for FSPEC-TL-02 Check 2. (7) TE F-02 — added AT-TL-01-07 for 10-minute confirmation timeout. (8) TE F-06 — added AT-PD-01-05 (dangling reference) and AT-PD-01-06 (no task tables). (9) BE Q-02 — added downstream Done phases warning to §2.8.3. (10) BE Q-01 — clarified parse-time fallback → confirmation → skip pre-flight ordering in §2.5.1. |
| 1.1 | 2026-03-19 | Product Manager | Corrected three pre-commit bugs: (1) AT-PD-01-01 "4-node DAG" → "6-node DAG" (phases A–F = 6 nodes); (2) FSPEC-PD-02 §2.2.1 step 3 and AT-PD-02-03 incorrectly stated test gate fires between sub-batches — corrected to align with REQ-NF-14-01 (gate fires once per topological batch after all sub-batches complete); (3) added sub-batch clarification note to FSPEC-BD-01 §2.6.1 making the deferred test gate behavior explicit. Also added REQ-NF-14-05 to REQ to back the FSPEC-TL-02 linked requirement reference. |
| 1.0 | 2026-03-19 | Product Manager | Initial functional specification. Covers FSPEC-PD-01/02/03, FSPEC-TL-01/02, FSPEC-BD-01/02/03. Addresses deferred items from backend-engineer and test-engineer reviews: BE Q-03 (resume auto-detect vs explicit resolved in FSPEC-BD-03), TE-F-03 (sub-batch split order resolved in FSPEC-PD-02 §2.2.3), TE-F-04 (modification loop termination resolved in FSPEC-TL-01 §2.4.3). |

---

*End of Document*
