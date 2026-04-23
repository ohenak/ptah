# Functional Specification

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-021 |
| **Parent Document** | [REQ-orchestrate-dev-workflow](REQ-orchestrate-dev-workflow.md) (v1.3, Draft) |
| **Version** | 1.1 |
| **Date** | April 22, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This document specifies the behavioral logic for the Orchestrate-Dev Workflow Alignment feature. It covers areas of behavioral complexity — branching logic, multi-step flows, and business rules that engineers must not decide alone. Straightforward configuration changes (YAML defaults, stub file text, type field additions) are left to the TSPEC.

---

## 2. FSPEC Index

| ID | Title | Linked Requirements |
|----|-------|---------------------|
| FSPEC-CLI-01 | `ptah run` Command Execution Flow | REQ-CLI-01, REQ-CLI-02, REQ-CLI-06 |
| FSPEC-CLI-02 | Phase Resolution: `--from-phase`, Auto-Detection, and Default | REQ-CLI-04, REQ-CLI-05 |
| FSPEC-CLI-03 | Stdout Progress Reporting | REQ-CLI-03 |
| FSPEC-CLI-04 | Human-in-the-Loop Input Handling | REQ-NF-02 |
| FSPEC-WF-01 | Artifact-Based Skip Condition Evaluation | REQ-WF-01, REQ-WF-05 |
| FSPEC-WF-02 | `isCompletionReady()` Dynamic Sign-Off Derivation | REQ-WF-06 |
| FSPEC-CR-01 | Cross-Review Versioned Path Construction | REQ-CR-02, REQ-CR-03, REQ-CR-04 |
| FSPEC-CR-02 | Recommendation Parser Consolidation | REQ-CR-05, REQ-CR-06 |
| FSPEC-CR-03 | Optimizer Context Assembly from All Review Versions | REQ-CR-07 |

---

## 3. Functional Specifications

---

### FSPEC-CLI-01: `ptah run` Command Execution Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-01 |
| **Title** | `ptah run` Command Execution Flow |
| **Linked Requirements** | REQ-CLI-01, REQ-CLI-02, REQ-CLI-06 |

#### Description

`ptah run` is the primary headless entry point for the PDLC pipeline. It performs a sequential series of pre-flight checks, resolves the start phase, checks for an already-running workflow, starts a Temporal workflow, and streams progress until a terminal state is reached.

#### Behavioral Flow

```
ptah run <req-path> [--from-phase <phase-id>]
  │
  ├── STEP 1: Validate REQ file
  │     ├── File does not exist → print error, exit 1
  │     ├── File is empty (zero bytes or whitespace only) → print error, exit 1
  │     └── File exists and non-empty → continue
  │
  ├── STEP 2: Derive feature slug
  │     └── Extract slug from path: last path segment directory name
  │         e.g. docs/in-progress/my-feature/REQ-my-feature.md → "my-feature"
  │
  ├── STEP 3: Load workflow config
  │     └── Load ptah.workflow.yaml from current working directory
  │           ├── File missing → print error (see Error Messages), exit 1
  │           └── YamlWorkflowConfigLoader throws WorkflowConfigError →
  │                 catch, reformat, print "Error: ptah.workflow.yaml not found
  │                 in current directory." to stdout, exit 1
  │
  ├── STEP 4: Resolve start phase (→ FSPEC-CLI-02)
  │     ├── --from-phase provided → validate phase ID in config; if invalid, exit 1
  │     └── --from-phase absent → run auto-detection algorithm; if error, exit 1
  │
  ├── STEP 5: Check for duplicate running workflow (REQ-CLI-06)
  │     ├── Query Temporal for workflows with prefix "ptah-{slug}" and
  │     │   statusFilter: ["Running", "ContinuedAsNew"]
  │     ├── Query fails (network/server error) → print error, exit 1
  │     ├── Any workflow returned → print error, exit 1
  │     └── No running workflow found → continue
  │
  ├── STEP 6: Start Temporal featureLifecycleWorkflow
  │     └── params: { featureSlug, reqPath, startAtPhase }
  │
  └── STEP 7: Stream progress to stdout (→ FSPEC-CLI-03)
        ├── Poll queryWorkflowState every 2 seconds
        ├── Handle ROUTE_TO_USER states (→ FSPEC-CLI-04)
        └── On terminal state:
              ├── completed → exit 0
              ├── failed → exit 1
              ├── revision-bound-reached → exit 1
              └── cancelled → exit 1
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CLI-01 | The REQ file empty check covers zero-byte files AND files containing only whitespace (spaces, tabs, newlines). A file with only whitespace is treated as empty. |
| BR-CLI-02 | Feature slug derivation uses the directory name of the REQ file's parent folder, not the filename stem. `docs/in-progress/my-feature/REQ-my-feature.md` → slug = `my-feature`. |
| BR-CLI-03 | The Temporal workflow ID is `ptah-{slug}`. The duplicate-check query uses this exact prefix. |
| BR-CLI-04 | A Temporal workflow in `Closed`, `Failed`, `TimedOut`, `Terminated`, or `Completed` status does NOT block a new start. Only `Running` and `ContinuedAsNew` block. |
| BR-CLI-05 | If the Temporal query itself throws an exception (any error), `ptah run` treats this as a hard error and exits 1. It does not start the workflow under uncertainty. |
| BR-CLI-06 | `ptah run` catches `WorkflowConfigError` thrown by `YamlWorkflowConfigLoader` and reformats it as: `Error: ptah.workflow.yaml not found in current directory.` This message differs from the raw loader message ("Run 'ptah init' first") to give context-appropriate guidance for headless operation. Exit code 1. |

#### Error Messages

| Condition | Stdout Message | Exit Code |
|-----------|---------------|-----------|
| REQ file not found | `Error: REQ file not found: <path>` | 1 |
| REQ file is empty | `Error: REQ file is empty: <path>` | 1 |
| `ptah.workflow.yaml` not found | `Error: ptah.workflow.yaml not found in current directory.` | 1 |
| Running workflow exists | `Error: workflow already running for feature "<slug>". Use --from-phase to restart from a specific phase after terminating the existing workflow.` | 1 |
| Temporal query exception | `Error: unable to check for running workflows: <error message>` | 1 |
| Workflow failed | (final progress line from poll) | 1 |
| Workflow revision-bound-reached | (final progress line from poll) | 1 |
| Workflow cancelled | (final progress line from poll) | 1 |

#### Edge Cases

- **Path with no parent directory** (e.g., `REQ-foo.md` with no `/`): treat the slug as the filename stem stripped of `REQ-` prefix and `.md` extension. This is an edge case; the canonical form is always `docs/{category}/{slug}/REQ-{slug}.md`.
- **`ptah.workflow.yaml` missing from current directory**: `ptah run` catches the `WorkflowConfigError` from `YamlWorkflowConfigLoader`, prints `Error: ptah.workflow.yaml not found in current directory.` to stdout, and exits 1 (see BR-CLI-06).

#### Acceptance Tests

**AT-CLI-01-A: Happy path start**
- Who: Engineer
- Given: `docs/in-progress/my-feature/REQ-my-feature.md` exists and is non-empty; no running Temporal workflow for `my-feature`
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: A Temporal `featureLifecycleWorkflow` starts for `my-feature`. stdout begins streaming progress. Command stays alive until terminal state. (Testable via a fake Temporal client that returns non-terminal poll state indefinitely until explicitly resolved.)

**AT-CLI-01-B: REQ file not found**
- Who: Engineer
- Given: `docs/ghost/REQ-ghost.md` does not exist
- When: `ptah run docs/ghost/REQ-ghost.md`
- Then: stdout prints `Error: REQ file not found: docs/ghost/REQ-ghost.md`. Exit code 1. No Temporal workflow started.

**AT-CLI-01-C: REQ file is whitespace-only**
- Who: Engineer
- Given: `docs/in-progress/my-feature/REQ-my-feature.md` contains only spaces and newlines
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Error: REQ file is empty: docs/in-progress/my-feature/REQ-my-feature.md`. Exit code 1.

**AT-CLI-01-D: Duplicate running workflow**
- Who: Engineer
- Given: A Temporal workflow `ptah-my-feature` is in `Running` status
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Error: workflow already running for feature "my-feature". Use --from-phase to restart from a specific phase after terminating the existing workflow.` Exit code 1.

**AT-CLI-01-E: Temporal server unreachable during duplicate check**
- Who: Engineer
- Given: Temporal server is not reachable when `ptah run` performs the running-workflow check
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Error: unable to check for running workflows: <error message>`. Exit code 1.

**AT-CLI-01-F: Workflow completes successfully**
- Who: Engineer
- Given: A valid REQ file, no duplicate workflow, workflow runs to completion
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: Command exits with code 0.

**AT-CLI-01-G: Workflow reaches revision-bound**
- Who: Engineer
- Given: A review phase exhausts its revision_bound
- When: Workflow reaches `revision-bound-reached` terminal state
- Then: Command exits with code 1.

**AT-CLI-01-H: `ptah.workflow.yaml` missing**
- Who: Engineer
- Given: No `ptah.workflow.yaml` file exists in the current working directory
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Error: ptah.workflow.yaml not found in current directory.` Exit code 1. No Temporal workflow started.

---

### FSPEC-CLI-02: Phase Resolution: `--from-phase`, Auto-Detection, and Default

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-02 |
| **Title** | Phase Resolution: `--from-phase`, Auto-Detection, and Default |
| **Linked Requirements** | REQ-CLI-04, REQ-CLI-05 |

#### Description

Before starting the Temporal workflow, `ptah run` must determine `startAtPhase`. This is resolved through a strict three-tier priority: explicit flag > auto-detection > default. This FSPEC defines each tier's behavior and the validation gate that follows.

**Architectural note:** CLI-side auto-detection (Tier 2) is a direct filesystem `stat` performed before the Temporal workflow starts, operating on the feature folder derived from the REQ file path. This is an entirely separate check from the `checkArtifactExists` Temporal Activity specified in FSPEC-WF-01, which runs inside the Temporal workflow boundary for determinism safety. Both layers check artifact existence independently; the explicit `startAtPhase` value passed to `featureLifecycleWorkflow` always takes precedence over the workflow-side skip condition result (per Assumption A-05 in the REQ).

#### Behavioral Flow

```
Phase Resolution
  │
  ├── TIER 1: --from-phase <phase-id> provided
  │     ├── Look up <phase-id> in loaded workflow config
  │     ├── Phase found → startAtPhase = <phase-id>; DONE
  │     └── Phase not found →
  │           print: Error: phase "<phase-id>" not found. Valid phases:
  │                  [<complete comma-separated list of all phase IDs>]
  │           exit 1
  │
  ├── TIER 2: --from-phase absent → run auto-detection
  │     │
  │     │  Note: this is a direct filesystem stat on the feature folder
  │     │  (directory containing the REQ file). It is NOT a Temporal Activity.
  │     │
  │     │  Detection Order (canonical PDLC sequence):
  │     │    REQ → FSPEC → TSPEC → PLAN → PROPERTIES
  │     │
  │     │  For each artifact in order:
  │     │    Check: does <DOCTYPE>-{slug}.md exist in feature folder AND is non-empty?
  │     │
  │     │  Find the last CONTIGUOUS artifact present from the start of the sequence.
  │     │  Gaps break contiguity: if FSPEC is absent but TSPEC is present,
  │     │  the contiguous prefix ends at REQ.
  │     │
  │     ├── Last contiguous artifact = REQ only (no gap) →
  │     │     startAtPhase = "req-review"
  │     │     stdout: (no auto-detection message — this is the default)
  │     │
  │     ├── Last contiguous artifact = REQ, but gap after it →
  │     │     (e.g., FSPEC absent, TSPEC present)
  │     │     startAtPhase = "fspec-creation"
  │     │     stdout: Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)
  │     │
  │     ├── Last contiguous artifact = FSPEC →
  │     │     startAtPhase = "tspec-creation"
  │     │     stdout: Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)
  │     │
  │     ├── Last contiguous artifact = TSPEC →
  │     │     startAtPhase = "plan-creation"
  │     │     stdout: Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)
  │     │
  │     ├── Last contiguous artifact = PLAN →
  │     │     startAtPhase = "properties-creation"
  │     │     stdout: Auto-detected resume phase: properties-creation (PLAN found, PROPERTIES missing)
  │     │
  │     └── Last contiguous artifact = PROPERTIES →
  │           startAtPhase = "implementation"
  │           stdout: Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)
  │
  └── TIER 3 (implicit in Tier 2): No artifacts in sequence found at all →
        startAtPhase = "req-review" (same as "REQ only, no gap" case)

After Tier 2: validate derived startAtPhase against loaded workflow config
  ├── Phase ID exists in config → proceed
  └── Phase ID not in config →
        print: Error: auto-detected phase "<phase-id>" not found in workflow config.
               Use --from-phase to specify a valid start phase.
        exit 1
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CLI-06 | The canonical detection sequence is fixed: REQ, FSPEC, TSPEC, PLAN, PROPERTIES. No other artifact types participate in auto-detection. |
| BR-CLI-07 | Artifact detection requires the file to be non-empty. A zero-byte or whitespace-only file is treated as absent for auto-detection purposes. |
| BR-CLI-08 | Contiguity is measured from REQ. If FSPEC is absent but TSPEC is present, the sequence is treated as breaking after REQ. The gap artifact (FSPEC) determines the derived phase — `fspec-creation` — not the artifact beyond the gap (TSPEC). The derived phase is the creation phase for the first missing artifact in the sequence. |
| BR-CLI-09 | The artifact filename pattern is exactly `<DOCTYPE>-{slug}.md` where `<DOCTYPE>` is the uppercase document type and `{slug}` is the feature slug. The search is case-sensitive and performed in the feature folder (the directory containing the REQ file). |
| BR-CLI-10 | When `--from-phase` provides an invalid phase ID, the error message lists ALL phase IDs from the loaded config, not a subset. The list must not include `...` or truncation. |
| BR-CLI-11 | The `--from-phase` flag takes precedence over auto-detection. When the flag is present, auto-detection is not performed. |
| BR-CLI-12 | The "no artifacts beyond REQ" case (REQ exists, FSPEC absent, no gap artifacts beyond FSPEC) resolves to `req-review` with no stdout message. This is distinct from the gap case (FSPEC absent, TSPEC present) which resolves to `fspec-creation` with a log message. |
| BR-CLI-13 | CLI auto-detection is a direct synchronous filesystem `stat` call (e.g., `fs.existsSync` / `stat` on the feature folder path), executed before the Temporal workflow is started. It must not use Temporal Activities. |

#### Auto-Detection Phase Map

| Last Contiguous Artifact | Scenario | Derived `startAtPhase` | Stdout Log Message |
|--------------------------|----------|------------------------|-------------------|
| REQ only (no gap, nothing else exists) | Default start | `req-review` | (none) |
| REQ only (gap: FSPEC absent, TSPEC present) | Gap after REQ | `fspec-creation` | `Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)` |
| REQ + FSPEC | Next artifact missing | `tspec-creation` | `Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)` |
| REQ + FSPEC + TSPEC | Next artifact missing | `plan-creation` | `Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)` |
| REQ + FSPEC + TSPEC + PLAN | Next artifact missing | `properties-creation` | `Auto-detected resume phase: properties-creation (PLAN found, PROPERTIES missing)` |
| REQ + FSPEC + TSPEC + PLAN + PROPERTIES | All present | `implementation` | `Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)` |

#### Edge Cases

- **FSPEC absent, TSPEC present**: gap breaks at FSPEC; derived phase = `fspec-creation`. stdout: `Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)`. The TSPEC file is beyond the gap and does not affect the derived phase.
- **Feature folder is empty (only REQ exists, nothing else)**: derived phase = `req-review`. No log message.
- **Custom `ptah.workflow.yaml` omits `tspec-creation`**: if the auto-detected phase is `tspec-creation` and the config has no such phase, the command exits 1 with the config-mismatch error.
- **All artifacts present**: `startAtPhase` = `implementation`. This is the furthest phase resolvable by artifact detection alone.

#### Acceptance Tests

**AT-CLI-02-A: `--from-phase` valid**
- Who: Engineer
- Given: Feature has TSPEC but PLAN is missing; Temporal workflow was deleted; loaded config includes `plan-creation`
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md --from-phase plan-creation`
- Then: Workflow starts at `plan-creation`. Auto-detection is not run.

**AT-CLI-02-B: `--from-phase` invalid**
- Who: Engineer
- Given: Loaded config has phases: `req-review`, `fspec-creation`, `fspec-review`, `tspec-creation`, `tspec-review`, `plan-creation`, `plan-review`, `properties-creation`, `properties-review`, `implementation`, `properties-tests`, `implementation-review`
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md --from-phase nonexistent`
- Then: Prints `Error: phase "nonexistent" not found. Valid phases: req-review, fspec-creation, fspec-review, tspec-creation, tspec-review, plan-creation, plan-review, properties-creation, properties-review, implementation, properties-tests, implementation-review` (complete list). Exit code 1.

**AT-CLI-02-C: Auto-detection — full contiguous prefix**
- Who: Engineer
- Given: Feature folder contains `REQ-my-feature.md`, `FSPEC-my-feature.md`, `TSPEC-my-feature.md` (all non-empty). `PLAN-my-feature.md` is absent.
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)`. Workflow starts at `plan-creation`.

**AT-CLI-02-D: Auto-detection — gap in sequence**
- Who: Engineer
- Given: Feature folder contains `REQ-my-feature.md` (non-empty). `FSPEC-my-feature.md` is absent. `TSPEC-my-feature.md` is present.
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)`. Workflow starts at `fspec-creation`. (TSPEC beyond the gap does not advance the derived phase.)

**AT-CLI-02-E: Auto-detection — no artifacts beyond REQ**
- Who: Engineer
- Given: Only `REQ-my-feature.md` exists in the feature folder (FSPEC is absent, no gap beyond it)
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: Workflow starts at `req-review`. No auto-detection log message printed.

**AT-CLI-02-F: Auto-detected phase missing from config**
- Who: Engineer
- Given: Custom `ptah.workflow.yaml` has no `tspec-creation` phase. Feature folder contains `REQ-my-feature.md` and `FSPEC-my-feature.md` (both non-empty), but `TSPEC-my-feature.md` is absent.
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: Auto-detection derives `tspec-creation`. stdout prints `Error: auto-detected phase "tspec-creation" not found in workflow config. Use --from-phase to specify a valid start phase.` Exit code 1.

---

### FSPEC-CLI-03: Stdout Progress Reporting

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-03 |
| **Title** | Stdout Progress Reporting |
| **Linked Requirements** | REQ-CLI-03 |

#### Description

While `ptah run` is executing, it polls `queryWorkflowState` every 2 seconds and emits progress lines to stdout when the workflow state changes. This provides real-time visibility without requiring Discord or Temporal UI.

**Scope:** Progress reporting is specified only for **review phases** in this FSPEC. Creation phases (req-creation, fspec-creation, tspec-creation, plan-creation, properties-creation) emit no phase-header or reviewer-result progress lines. When a creation phase dispatches its agent, the only output is the optimizer-dispatch line: `[Phase {phase-label} — {phase-title}] {agent-id} running...`. If the orchestrator does not emit a creation phase dispatch signal, no output is produced for that phase. This resolves OQ-01 and OQ-02 as out-of-scope for the initial implementation.

**Cross-review file path:** The finding count `N` is read from the cross-review file on disk. `ptah run` resolves the cross-review file path relative to the REQ file's parent directory (the feature folder). This assumes the workflow worker runs on the same machine as the CLI. Remote Temporal deployments (workflow worker on a separate machine) are not supported for progress finding counts; in that scenario, the file will not exist locally and `N` is reported as `?` (per BR-CLI-14).

#### Behavioral Flow

```
Progress Polling Loop
  │
  ├── Poll queryWorkflowState every 2 seconds
  │
  ├── Deduplication check: has (phase name, iteration number, reviewer statuses) changed
  │   since the last emission? If no change → skip this tick
  │
  ├── On new phase iteration start:
  │     emit: [Phase {phase-label} — {phase-title}] Iteration {N}
  │
  ├── On reviewer result (for each reviewer in the phase):
  │     ├── status = approved or approved_with_minor_issues:
  │     │     emit:   {reviewer-id}:  Approved ✅
  │     │     Note: both "approved" and "approved_with_minor_issues" from
  │     │     parseRecommendation() collapse to the "approved" ReviewerStatusValue
  │     │     stored in reviewerStatuses. The progress reporter reads "approved"
  │     │     and emits "Approved ✅" — no sub-variant is stored or needed.
  │     └── status = revision_requested:
  │           emit:   {reviewer-id}:  Need Attention ({N} findings)
  │                   where N = count of DATA rows only in ## Findings table
  │                   (header row and separator row are excluded from the count)
  │
  ├── On optimizer dispatch (author addressing feedback):
  │     emit: [Phase {phase-label} — {phase-title}] {agent-id} addressing feedback...
  │
  ├── On phase transition:
  │     emit: [Phase {phase-label} — {phase-title}] Passed ✅
  │     or:   [Phase {phase-label} — {phase-title}] Revision Bound Reached ⚠️
  │
  └── On terminal state:
        emit: Workflow completed ✅  (for completed)
        or:   Workflow failed ❌     (for failed)
        or:   Workflow cancelled     (for cancelled)
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CLI-14 | Deduplication prevents duplicate lines: a line is only emitted when at least one of (phase name, iteration number, any reviewer's status) has changed from the previous poll. |
| BR-CLI-15 | The finding count `N` in `Need Attention (N findings)` is the count of **data rows only** in the `## Findings` table of the reviewer's cross-review file. The header row (column names) and the separator row (`\|---\|---\|`) are excluded. A table with 4 data rows reports N=4 regardless of how many header or separator rows precede them. If the cross-review file cannot be read, `N` is reported as `?`. |
| BR-CLI-16 | Phase label is the short uppercase letter(s) used in the orchestrate-dev format (e.g., `R` for req-review, `F` for fspec-review, `T` for tspec-review, etc.). Phase title is the human-readable name. |
| BR-CLI-17 | All progress lines go to stdout, not stderr. Stderr is reserved for warnings only (e.g., the stdin-closed warning in FSPEC-CLI-04). |
| BR-CLI-18 | `approved_with_minor_issues` is not a separate `ReviewerStatusValue` variant. `parseRecommendation()` maps it to `{ status: "approved" }`, which is stored as `"approved"` in `reviewerStatuses`. The progress reporter does not need to distinguish `approved` from `approved_with_minor_issues` — both emit `Approved ✅`. |
| BR-CLI-19 | Cross-review file paths for finding count are resolved relative to the feature folder (the directory containing the REQ file passed to `ptah run`), not relative to CWD. This keeps finding counts accurate regardless of where `ptah run` is invoked from. |

#### Phase Label Map

| Phase ID | Label | Title |
|----------|-------|-------|
| `req-review` | R | REQ Review |
| `fspec-review` | F | FSPEC Review |
| `tspec-review` | T | TSPEC Review |
| `plan-review` | P | PLAN Review |
| `properties-review` | PT | PROPERTIES Review |
| `properties-tests` | PTT | Properties Tests |
| `implementation-review` | IR | Implementation Review |

#### Example Output Sequence

```
[Phase R — REQ Review] Iteration 1
  se-review:  Approved ✅
  te-review:  Need Attention (4 findings)
[Phase R — REQ Review] pm-author addressing feedback...
[Phase R — REQ Review] Iteration 2
  se-review:  Approved ✅
  te-review:  Approved ✅
[Phase R — REQ Review] Passed ✅
[Phase F — FSPEC Review] Iteration 1
  ...
```

#### Acceptance Tests

**AT-CLI-03-A: Mixed review result output**
- Who: Engineer
- Given: Phase R (REQ Review) iteration 1 just completed with `se-review` approving and `te-review` requesting revision. `te-review`'s cross-review file has 4 data rows in the `## Findings` table (plus one header row and one separator row — 6 total rows, 4 data rows).
- When: The next poll detects the state change
- Then: stdout contains exactly:
  ```
  [Phase R — REQ Review] Iteration 1
    se-review:  Approved ✅
    te-review:  Need Attention (4 findings)
  [Phase R — REQ Review] pm-author addressing feedback...
  ```

**AT-CLI-03-B: Deduplication**
- Who: Engineer
- Given: Poll tick returns the same phase, iteration, and reviewer statuses as the previous tick
- When: The poll fires
- Then: No new lines are emitted to stdout.

**AT-CLI-03-C: Cross-review file unreadable**
- Who: Engineer
- Given: `te-review` has `revision_requested` status but its cross-review file is missing on disk
- When: Progress line is emitted for `te-review`
- Then: stdout prints `te-review:  Need Attention (? findings)`.

**AT-CLI-03-D: Phase passed**
- Who: Engineer
- Given: All reviewers approve in Phase R
- When: Phase R transitions to completed
- Then: stdout prints `[Phase R — REQ Review] Passed ✅`.

---

### FSPEC-CLI-04: Human-in-the-Loop Input Handling

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-04 |
| **Title** | Human-in-the-Loop Input Handling |
| **Linked Requirements** | REQ-NF-02 |

#### Description

When the workflow reaches a `ROUTE_TO_USER` state (a blocking question from an agent), `ptah run` must handle the question differently based on whether Discord is configured. This FSPEC covers the no-Discord path; the Discord path is unchanged existing behavior.

**Signal name resolution:** The existing codebase defines signal `"user-answer"` used by `ptah start` via Discord. FSPEC-CLI-04 introduces signal `"humanAnswerSignal"` for the headless stdin path. These are **two distinct Temporal signals** on the same workflow. The workflow handler must listen on both signals — `"user-answer"` for Discord-routed answers and `"humanAnswerSignal"` for stdin-routed answers. There is no migration of `"user-answer"`; the two signals coexist. The `ptah run` headless path exclusively uses `"humanAnswerSignal"`, and `ptah start` continues to use `"user-answer"`. The `TemporalClientWrapper` must expose a new method `signalHumanAnswer(workflowId: string, answer: string): Promise<void>` that sends the `"humanAnswerSignal"` signal; it must not reuse `signalUserAnswer()`.

**Config loading:** `ptah run` must use a lenient config loader that treats a missing `discord` section as valid (Discord-less mode). It must not throw an error when `discord` is absent from `ptah.config.json`, unlike the current `ConfigLoader` used by `ptah start` which treats `discord` as required.

#### Behavioral Flow

```
ROUTE_TO_USER state detected
  │
  ├── Discord config present in ptah.config.json?
  │     Yes → route question to Discord as normal (existing behavior)
  │           stdin NOT read
  │           return to progress polling
  │
  └── No Discord config →
        emit to stdout: [Question] <question-text>
        emit to stdout: Answer:   ← (trailing space, no newline, acts as inline prompt)
        Read one line from stdin
        │
        ├── Line received → call signalHumanAnswer(workflowId, line)
        │                   return to progress polling
        │
        └── stdin closed / EOF before input →
              call signalHumanAnswer(workflowId, "")
              emit to stderr: Warning: stdin closed before answer was provided;
                              resuming workflow with empty answer.
              return to progress polling
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CLI-20 | The `Answer: ` prompt is printed WITHOUT a trailing newline, so the cursor stays on the same line for the engineer to type. This is a deliberate UX choice for inline prompting. |
| BR-CLI-21 | The signal name used for the headless stdin path is exactly `"humanAnswerSignal"`. The existing `"user-answer"` signal used by `ptah start` / Discord is preserved unchanged. Both signals coexist on the workflow. |
| BR-CLI-22 | Only ONE line is read from stdin per `ROUTE_TO_USER` event. Multi-line input is not supported; only the first line is consumed. |
| BR-CLI-23 | The closed-stdin warning goes to stderr, not stdout. The progress stream on stdout remains clean. |
| BR-CLI-24 | When Discord config is present, stdin reading is entirely suppressed even if the question could theoretically be answered via stdin. Discord takes exclusive ownership. |
| BR-CLI-25 | `ptah run` uses a lenient config loader: absence of a `discord` section in `ptah.config.json` is treated as "Discord not configured" and is not an error. This differs from `ptah start`'s strict config loader. |
| BR-CLI-26 | The `TemporalClientWrapper` exposes a new method `signalHumanAnswer(workflowId: string, answer: string): Promise<void>` that sends the `"humanAnswerSignal"` signal. This is a separate method from `signalUserAnswer()` and must not be implemented by reusing that method with a different signal name constant. |

#### Acceptance Tests

**AT-CLI-04-A: No-Discord question answered**
- Who: Engineer with no Discord config
- Given: `ptah.config.json` has no `discord` section. Workflow reaches `ROUTE_TO_USER` with question "Should the feature include authentication?"
- When: The state is detected by the progress poller
- Then: stdout prints `[Question] Should the feature include authentication?` followed by `Answer: ` (no newline). `ptah run` reads one line from stdin. After the engineer types `Yes` and presses Enter, `signalHumanAnswer(workflowId, "Yes")` is called — which sends signal `"humanAnswerSignal"` with value `"Yes"` to the workflow. Progress polling resumes.

**AT-CLI-04-B: stdin closed before answer**
- Who: Engineer running in non-interactive mode (e.g., piped stdin)
- Given: No Discord config. Workflow reaches `ROUTE_TO_USER`. stdin is closed (EOF) before any input.
- When: `ptah run` reads stdin and gets EOF
- Then: `signalHumanAnswer(workflowId, "")` is called. stderr prints `Warning: stdin closed before answer was provided; resuming workflow with empty answer.`

**AT-CLI-04-C: Discord config present — stdin not read**
- Who: Engineer with Discord configured
- Given: `ptah.config.json` has a `discord` section. Workflow reaches `ROUTE_TO_USER`.
- When: The state is detected
- Then: Question is routed to Discord. `ptah run` does NOT prompt on stdout and does NOT read stdin.

---

### FSPEC-WF-01: Artifact-Based Skip Condition Evaluation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-WF-01 |
| **Title** | Artifact-Based Skip Condition Evaluation |
| **Linked Requirements** | REQ-WF-01, REQ-WF-05 |

#### Description

The `SkipCondition` type gains a new discriminated union variant `{ field: "artifact.exists"; artifact: string }`. Evaluating this condition requires filesystem I/O, which must not run inline in the Temporal workflow (non-determinism violation). This FSPEC defines the pre-loop activity pattern, the `evaluateSkipCondition()` function contract, and the `deriveDocumentType()` extension required for the `properties-tests` phase.

#### `SkipCondition` TypeScript Type Definition

The complete discriminated union that must replace the current `{ field: string; equals: boolean }` definition:

```typescript
type SkipCondition =
  | { field: `config.${string}`; equals: boolean }
  | { field: "artifact.exists"; artifact: string };
```

**Validation rules for `validateStructure()` in `workflow-validator.ts`:**

| Branch | Required fields | Forbidden fields | Validator action on violation |
|--------|----------------|-----------------|-------------------------------|
| `config.*` branch | `field` (string starting with `config.`), `equals` (boolean) | `artifact` must not be present | Throw `WorkflowConfigError` |
| `artifact.exists` branch | `field` (exactly `"artifact.exists"`), `artifact` (non-empty string) | `equals` must not be present | Throw `WorkflowConfigError` |

A `skip_if` block where `field === "artifact.exists"` but `artifact` is absent (or empty) is a validation error. A `skip_if` block with `field === "artifact.exists"` AND an `equals` property present is also a validation error (malformed discriminated union).

#### `deriveDocumentType("properties-tests")` Specification

The existing `deriveDocumentType()` function strips phase ID suffixes using a regex that matches `-creation`, `-review`, and `-approved`. The regex does **not** match `-tests`, so `deriveDocumentType("properties-tests")` currently returns `"PROPERTIES-TESTS"` without this change.

The function must be extended with a special-case lookup **before** the regex stripping step:

```
deriveDocumentType(phaseId)
  │
  ├── Special-case lookup (applied before regex):
  │     "properties-tests" → "PROPERTIES"
  │
  └── Fallback: apply existing regex strip logic
```

This ensures `deriveDocumentType("properties-tests")` returns `"PROPERTIES"`, allowing reviewer agents to correctly locate the PROPERTIES artifact for the phase.

#### Behavioral Flow

```
Workflow Start (before main phase loop)
  │
  ├── Collect all phases with skip_if: { field: "artifact.exists" }
  │
  ├── For each such phase:
  │     invoke checkArtifactExists(slug, docType) as a Temporal Activity
  │     store result in state.artifactExists[docType] = true|false
  │
  └── Main phase loop begins
        │
        └── For each phase with skip_if:
              call evaluateSkipCondition(condition, featureConfig, state.artifactExists)
              │
              ├── condition.field starts with "config." → use existing config-lookup logic
              │
              └── condition.field = "artifact.exists" →
                    ├── artifactExists is undefined (pre-loop) →
                    │     THROW Error("evaluateSkipCondition: artifactExists map not yet
                    │     populated — checkArtifactExists Activity must run before
                    │     evaluating artifact.exists conditions")
                    │
                    └── artifactExists is defined →
                          return artifactExists[condition.artifact] ?? false
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-WF-01 | `checkArtifactExists` runs as a Temporal Activity (not inline workflow code) so filesystem I/O stays determinism-safe. |
| BR-WF-02 | The artifact filename checked by `checkArtifactExists` is `{docType}-{slug}.md` in the feature folder. The slug is the same slug passed to `featureLifecycleWorkflow`. |
| BR-WF-03 | `state.artifactExists` is keyed by `docType` string (e.g., `"REQ"`, `"FSPEC"`). Lookups are case-sensitive and must use the same casing as the YAML `artifact:` value. |
| BR-WF-04 | If a key is not present in `state.artifactExists` (e.g., an artifact type not covered by pre-loop checks), `evaluateSkipCondition()` returns `false` (treat as absent). |
| BR-WF-05 | The `checkArtifactExists` activity is called once per artifact type per workflow start. It is not re-evaluated during the main loop. |
| BR-WF-06 | All three existing call sites of `evaluateSkipCondition()` in `feature-lifecycle.ts` must pass `state.artifactExists` as the third argument. Omitting the third argument for `artifact.exists` conditions is a programming error caught by the throw. |
| BR-WF-07 | Pre-loop artifact checks run for ALL phases with `artifact.exists` conditions regardless of `startAtPhase`. Even if `startAtPhase` skips past `req-creation`, the activity still checks artifact existence for every phase that declares an `artifact.exists` skip condition, including skipped phases. |
| BR-WF-08 | `deriveDocumentType()` applies the special-case lookup BEFORE the regex. The special-case table takes precedence over the regex stripping logic. |

#### `ReviewerManifest` and Discipline Key for New Default YAML

The `ReviewerManifest` type in `workflow-config.ts` uses a discipline-keyed object (`{ default?, backend-only?, frontend-only?, fullstack? }`). The new default `ptah.workflow.yaml` generated by `ptah init` must specify reviewer lists using the `"default"` discipline key so that `computeReviewerList()` resolves the reviewer list via its existing `"default"` fallback path. Example:

```yaml
reviewers:
  default: [se-review, te-review]
```

This is the canonical form for all review phases in the new default YAML. FSPEC-WF-02 (which shows flat reviewer arrays in acceptance tests) refers to the resolved list after `computeReviewerList()` processes the manifest — not the raw YAML shape.

#### Acceptance Tests

**AT-WF-01-A: REQ exists — req-creation skipped**
- Who: Workflow engine
- Given: `REQ-my-feature.md` exists in the feature folder. Phase `req-creation` has `skip_if: { field: "artifact.exists", artifact: "REQ" }`.
- When: The workflow starts for `my-feature`
- Then: `checkArtifactExists("my-feature", "REQ")` returns `true`. `state.artifactExists["REQ"]` = `true`. `evaluateSkipCondition` returns `true`. Phase `req-creation` is skipped. First executed phase is `req-review`.

**AT-WF-01-B: REQ absent — req-creation runs**
- Who: Workflow engine
- Given: No `REQ-my-feature.md` in the feature folder
- When: Workflow starts
- Then: `checkArtifactExists("my-feature", "REQ")` returns `false`. `evaluateSkipCondition` returns `false`. Phase `req-creation` runs normally.

**AT-WF-01-C: evaluateSkipCondition called before pre-loop activity**
- Who: Workflow engine
- Given: `evaluateSkipCondition` is called with an `artifact.exists` condition and `artifactExists` is `undefined`
- When: The function is invoked
- Then: It throws `Error("evaluateSkipCondition: artifactExists map not yet populated — checkArtifactExists Activity must run before evaluating artifact.exists conditions")`.

**AT-WF-01-D: Unknown artifact key**
- Who: Workflow engine
- Given: `state.artifactExists` does not contain key `"FSPEC"`; condition is `{ field: "artifact.exists", artifact: "FSPEC" }`
- When: `evaluateSkipCondition` is called
- Then: Returns `false`. Phase is not skipped.

**AT-WF-01-E: resolveNextPhase() propagates evaluateSkipCondition throw**
- Who: Workflow engine
- Given: A phase has `skip_if: { field: "artifact.exists", artifact: "REQ" }`. `resolveNextPhase()` is called before the pre-loop activity has run, so `artifactExists` is `undefined`.
- When: `resolveNextPhase()` calls `evaluateSkipCondition()` internally
- Then: `resolveNextPhase()` allows the `Error` thrown by `evaluateSkipCondition()` to propagate up uncaught. The error reaches the Temporal workflow boundary and causes the phase to fail with the same error message. `resolveNextPhase()` must NOT catch or swallow this error.

**AT-WF-01-F: deriveDocumentType("properties-tests") returns "PROPERTIES"**
- Who: Workflow engine
- Given: Phase ID is `"properties-tests"`
- When: `deriveDocumentType("properties-tests")` is called
- Then: Returns `"PROPERTIES"` (not `"PROPERTIES-TESTS"`).

**AT-WF-01-G: checkArtifactExists not re-called mid-loop**
- Who: Workflow engine
- Given: Pre-loop artifact checks have completed; `state.artifactExists` is populated
- When: The main phase loop runs through multiple phases
- Then: `checkArtifactExists` is not invoked again during the loop. The `state.artifactExists` map used throughout the loop is the one populated before the loop started.

---

### FSPEC-WF-02: `isCompletionReady()` Dynamic Sign-Off Derivation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-WF-02 |
| **Title** | `isCompletionReady()` Dynamic Sign-Off Derivation |
| **Linked Requirements** | REQ-WF-06 |

#### Description

`isCompletionReady()` must no longer hard-code `signOffs.qa` and `signOffs.pm` as the required agents. Instead it reads the reviewer list from the `implementation-review` phase of the loaded workflow config. This allows teams to use any reviewer set in their config without modifying code.

#### Behavioral Flow

```
isCompletionReady(signOffs, workflowConfig)
  │
  ├── Look up workflowConfig phases for phase ID "implementation-review"
  │
  ├── Phase not found in config →
  │     LEGACY FALLBACK: return signOffs.qa === true && signOffs.pm === true
  │
  └── Phase found →
        requiredAgents = computeReviewerList(workflowConfig["implementation-review"].reviewers)
        For each agentId in requiredAgents:
          if signOffs[agentId] !== true → return false
        All present → return true
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-WF-09 | An approved status is `true` in `signOffs`. Both `"approved"` and `"approved_with_minor_issues"` from the reviewer's recommendation map to `true` via `parseRecommendation()` returning `{ status: "approved" }` — which collapses to `"approved"` stored in `reviewerStatuses`, then mapped to `true` in `signOffs`. A `"revision_requested"` or absent sign-off maps to `false`. |
| BR-WF-10 | The legacy fallback (checking `signOffs.qa && signOffs.pm`) is preserved exclusively for configs that have no `implementation-review` phase. It is not used when the phase exists but has an empty reviewers list — an empty reviewers list means `isCompletionReady()` returns `true` immediately (vacuous truth). Note: when `computeReviewerList()` returns `[]` for zero-reviewer phases, the review cycle in the main loop will also dispatch zero agents and return `"approved"` with `anyRevisionRequested = false` — both behaviors are consistent. |
| BR-WF-11 | All existing call sites of `isCompletionReady()` must be updated to pass `workflowConfig` as the second argument. |
| BR-WF-12 | `requiredAgents` is derived by calling `computeReviewerList()` on the `reviewers` manifest of the `implementation-review` phase, using the same resolution logic as any other review phase. This ensures reviewer manifest format consistency across the codebase. |

#### Acceptance Tests

**AT-WF-02-A: All required reviewers signed off**
- Who: Orchestrator
- Given: `workflowConfig["implementation-review"].reviewers = { default: ["pm-review", "te-review"] }`. After `computeReviewerList()` resolution: `["pm-review", "te-review"]`. `signOffs = { "pm-review": true, "te-review": true }`.
- When: `isCompletionReady(signOffs, workflowConfig)` is called
- Then: Returns `true`.

**AT-WF-02-B: One required reviewer not yet signed off**
- Who: Orchestrator
- Given: Same config. `signOffs = { "pm-review": true }` (te-review absent)
- When: Called
- Then: Returns `false`.

**AT-WF-02-C: Legacy fallback — no implementation-review phase**
- Who: Orchestrator
- Given: `workflowConfig` has no `implementation-review` phase. `signOffs = { qa: true, pm: true }`.
- When: Called
- Then: Returns `true` (legacy path).

**AT-WF-02-D: Legacy fallback — missing one old sign-off**
- Who: Orchestrator
- Given: `workflowConfig` has no `implementation-review` phase. `signOffs = { qa: true }`.
- When: Called
- Then: Returns `false` (legacy path, pm missing).

**AT-WF-02-E: Empty reviewers list**
- Who: Orchestrator
- Given: `workflowConfig["implementation-review"].reviewers = { default: [] }`
- When: Called
- Then: Returns `true` (vacuous truth — no agents required).

**AT-WF-02-F: approved_with_minor_issues sign-off counts as approved**
- Who: Orchestrator
- Given: `workflowConfig["implementation-review"].reviewers = { default: ["pm-review", "te-review"] }`. `signOffs = { "pm-review": true, "te-review": true }` where `"te-review"`'s sign-off was set to `true` because `parseRecommendation()` returned `{ status: "approved" }` for an `"Approved with Minor Issues"` recommendation.
- When: `isCompletionReady(signOffs, workflowConfig)` is called
- Then: Returns `true`. (The `approved_with_minor_issues` → `approved` → `true` collapse is transparent to `isCompletionReady()`.)

---

### FSPEC-CR-01: Cross-Review Versioned Path Construction

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CR-01 |
| **Title** | Cross-Review Versioned Path Construction |
| **Linked Requirements** | REQ-CR-02, REQ-CR-03, REQ-CR-04 |

#### Description

Each review iteration must write to a uniquely named file so that prior iterations are preserved. This FSPEC defines the versioning rules for `crossReviewPath()`, how `revisionCount` flows from `runReviewCycle()` into both the reviewer invocation and the read activity, and how `writtenVersions` tracks iteration history.

#### Behavioral Flow

```
crossReviewPath(featureDir, skillName, docType, revisionCount?)
  │
  ├── revisionCount is undefined, 0, or negative → use revisionCount = 1
  │
  ├── revisionCount = 1 →
  │     return "{featureDir}/CROSS-REVIEW-{skillName}-{docType}.md"
  │
  └── revisionCount ≥ 2 →
        return "{featureDir}/CROSS-REVIEW-{skillName}-{docType}-v{revisionCount}.md"
```

```
runReviewCycle() — for each review round
  │
  ├── currentRevision = reviewState.revisionCount + 1  (1-indexed)
  │
  ├── For each reviewer agent:
  │     ├── invoke invokeSkill with revisionCount = currentRevision
  │     │     (agent context includes: "Cross-review output file:
  │     │      CROSS-REVIEW-{skillName}-{docType}[-v{N}].md")
  │     │     (see REQ-NF-03 for SkillActivityInput.revisionCount type change)
  │     │
  │     └── update reviewState.writtenVersions[agentId] = currentRevision
  │
  └── For reading results:
        call readCrossReviewRecommendation with revisionCount = currentRevision
        (reads from the versioned path)
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CR-01 | `revisionCount` is 1-indexed. Round 1 = unversioned file. Round 2 = `-v2` suffix. Round N = `-vN` suffix. |
| BR-CR-02 | A `revisionCount` of 0 or any negative integer is clamped to 1 (no suffix, no error thrown). |
| BR-CR-03 | `reviewState.writtenVersions` is initialized to `{}` in `buildInitialWorkflowState()` and **explicitly included** in `buildContinueAsNewPayload()`. It is not reset on `ContinueAsNew`. The `buildContinueAsNewPayload()` function must be extended to serialize the full `reviewStates` map (including `writtenVersions` within each `ReviewState`) into the `ContinueAsNewPayload` type. Implementing the `ReviewState.writtenVersions` type field (REQ-NF-04) without updating `buildContinueAsNewPayload()` would cause silent data loss on `ContinueAsNew` — both changes are required together. |
| BR-CR-04 | The context prompt injected into the reviewer agent's input must include the exact expected output filename: `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md`. This is how the agent knows where to write. The context injection happens via the `revisionCount` field added to `SkillActivityInput` (see REQ-NF-03). |
| BR-CR-05 | `revisionCount` in `ReadCrossReviewInput` and `SkillActivityInput` is optional. When absent, callers that pass no value get unversioned behavior (same as passing 1). |
| BR-CR-06 | The existing filter in `runReviewCycle()` at line 1319 of `feature-lifecycle.ts` — which restricts cross-review context refs to only reviewers with `revision_requested` status — must be **removed**. FSPEC-CR-03 (BR-CR-10) requires ALL reviewers' files to be included regardless of status. Implementers must remove the `.filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")` call. |

#### Versioning Examples

| revisionCount | Output Filename |
|---------------|----------------|
| undefined / 1 | `CROSS-REVIEW-software-engineer-REQ.md` |
| 2 | `CROSS-REVIEW-software-engineer-REQ-v2.md` |
| 3 | `CROSS-REVIEW-software-engineer-REQ-v3.md` |
| 0 | `CROSS-REVIEW-software-engineer-REQ.md` (clamped to 1) |
| -5 | `CROSS-REVIEW-software-engineer-REQ.md` (clamped to 1) |

#### Acceptance Tests

**AT-CR-01-A: Revision 1 path (unversioned)**
- Who: Orchestrator
- Given: `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", 1)`
- Then: Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ.md`.

**AT-CR-01-A2: revisionCount undefined — unversioned path**
- Who: Orchestrator
- Given: `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", undefined)`
- Then: Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ.md` (same as revision 1).

**AT-CR-01-B: Revision 3 path**
- Who: Orchestrator
- Given: `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", 3)`
- Then: Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ-v3.md`.

**AT-CR-01-C: revisionCount = 0 clamped**
- Who: Orchestrator
- Given: `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", 0)`
- Then: Returns unversioned path (same as revision 1).

**AT-CR-01-D: Round 2 read uses versioned path**
- Who: Orchestrator
- Given: Review phase on second iteration (revisionCount = 2)
- When: `readCrossReviewRecommendation` is called with `{ ..., revisionCount: 2 }`
- Then: Reads from `CROSS-REVIEW-{skill}-{DOC}-v2.md`.

**AT-CR-01-E: writtenVersions updated after reviewer dispatch**
- Who: Orchestrator
- Given: First review round begins; `reviewState.writtenVersions` = `{}`
- When: Reviewers `se-review` and `te-review` are dispatched with `revisionCount = 1`
- Then: After dispatch, `reviewState.writtenVersions` = `{ "se-review": 1, "te-review": 1 }`.

**AT-CR-01-F: writtenVersions preserved across ContinueAsNew**
- Who: Orchestrator
- Given: Workflow undergoes `ContinueAsNew` after round 2; `writtenVersions = { "se-review": 2 }`. This is verified via a unit test of `buildContinueAsNewPayload()`: the function is called with a state where `reviewStates["req-review"].writtenVersions = { "se-review": 2 }` and the returned payload must include that value.
- When: The payload is deserialized into the resumed workflow state
- Then: `reviewState.writtenVersions` = `{ "se-review": 2 }` in the resumed workflow state (not reset). The unit test asserts `buildContinueAsNewPayload(state).reviewStates["req-review"].writtenVersions` equals `{ "se-review": 2 }`.

---

### FSPEC-CR-02: Recommendation Parser Consolidation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CR-02 |
| **Title** | Recommendation Parser Consolidation |
| **Linked Requirements** | REQ-CR-05, REQ-CR-06 |

#### Description

Two new phrases must be recognized: `"approved with minor issues"` (maps to `approved`) and `"need attention"` (maps to `revision_requested`). The existing parallel implementation `mapRecommendationToStatus()` in `feature-lifecycle.ts` is removed; all callers use `parseRecommendation()` from `cross-review-parser.ts` as the single authoritative parser.

**Function contract:** `parseRecommendation()` takes the **normalized value of the `Recommendation:` field only** — not the full file text. The caller (e.g., `readCrossReviewRecommendation` activity or any migration from `mapRecommendationToStatus()`) is responsible for extracting the `Recommendation:` field value from the file before calling `parseRecommendation()`. The function signature is:

```typescript
function parseRecommendation(recommendationFieldValue: string): { status: ReviewStatus }
```

The `text` parameter in the behavioral flow below refers to the extracted recommendation field value, not the full file content.

#### Behavioral Flow

```
parseRecommendation(recommendationFieldValue)
  │
  ├── Normalize: lowercase the recommendation field value
  │
  ├── Match against VALUE_MATCHERS (in order, first match wins):
  │     "approved"                    → { status: "approved" }
  │     "approved with minor changes" → { status: "approved" }
  │     "approved with minor issues"  → { status: "approved" }   ← NEW
  │     "need attention"              → { status: "revision_requested" }  ← NEW
  │     "revision requested"          → { status: "revision_requested" }
  │     (any other value)             → { status: "revision_requested" }  (default)
  │
  └── return matched status
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CR-07 | Matching is case-insensitive. `"Approved with Minor Issues"`, `"APPROVED WITH MINOR ISSUES"`, and `"approved with minor issues"` all produce `{ status: "approved" }`. |
| BR-CR-08 | `mapRecommendationToStatus()` is deleted from `feature-lifecycle.ts`. No references to it may remain after this change. Any callers outside `feature-lifecycle.ts` must also be migrated to `parseRecommendation()`. |
| BR-CR-09 | The unrecognized-value default is `revision_requested` (conservative: unknown = request revision). |
| BR-CR-10 | `parseRecommendation()` receives the extracted `Recommendation:` field value, not the full file text. Field extraction from the cross-review file is the caller's responsibility (handled by `readCrossReviewRecommendation` activity). |

#### VALUE_MATCHERS — Complete Set After Change

| Phrase (lowercased) | Status |
|--------------------|--------|
| `"approved"` | `approved` |
| `"approved with minor changes"` | `approved` |
| `"approved with minor issues"` | `approved` |
| `"revision requested"` | `revision_requested` |
| `"need attention"` | `revision_requested` |
| (any unrecognized value) | `revision_requested` |

#### Acceptance Tests

**AT-CR-02-A: "Approved with Minor Issues" recognized**
- Who: Recommendation parser
- Given: The `Recommendation:` field value extracted from a cross-review file is `"Approved with Minor Issues"`
- When: `parseRecommendation("Approved with Minor Issues")` is called
- Then: Returns `{ status: "approved" }`.

**AT-CR-02-B: "Need Attention" recognized**
- Who: Recommendation parser
- Given: The extracted `Recommendation:` field value is `"Need Attention"`
- When: `parseRecommendation("Need Attention")` is called
- Then: Returns `{ status: "revision_requested" }`.

**AT-CR-02-C: Case insensitivity**
- Who: Recommendation parser
- Given: `parseRecommendation("NEED ATTENTION")` is called
- When: The function runs
- Then: Returns `{ status: "revision_requested" }`.

**AT-CR-02-D: Existing "Approved" still works**
- Who: Recommendation parser
- Given: `parseRecommendation("Approved")` is called
- When: The function runs
- Then: Returns `{ status: "approved" }`.

**AT-CR-02-E: No reference to mapRecommendationToStatus**
- Who: Codebase
- Given: The post-change codebase
- Then: No file imports or calls `mapRecommendationToStatus`. The function does not exist in `feature-lifecycle.ts`.

---

### FSPEC-CR-03: Optimizer Context Assembly from All Review Versions

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CR-03 |
| **Title** | Optimizer Context Assembly from All Review Versions |
| **Linked Requirements** | REQ-CR-07 |

#### Description

When dispatching the optimizer (the author agent for revision), all cross-review files from all reviewers and all prior iterations must be included in the context. This ensures the optimizer has complete history and can see which issues were raised in which rounds.

#### Behavioral Flow

```
Build optimizer context for revision dispatch
  │
  ├── For each reviewer agentId in the review phase:
  │     highestVersion = reviewState.writtenVersions[agentId] (from FSPEC-CR-01)
  │     skillName = agentIdToSkillName(agentId)
  │
  │     For v = 1 to highestVersion (inclusive):
  │       path = crossReviewPath(featureDir, skillName, docType, v)
  │       Does file exist on disk?
  │         Yes → add path to context list
  │         No  → silently skip (no error, no status change)
  │
  └── Pass complete context list to optimizer (pm-author / se-author / te-author)
      as context document paths
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CR-11 | ALL reviewers' files are included, regardless of their recommendation status. A reviewer who `approved` in round 1 still contributes their file to context in round 2. The existing status-filter in `runReviewCycle()` (line 1319 of `feature-lifecycle.ts`) that restricts context to only `revision_requested` reviewers must be removed (see FSPEC-CR-01 BR-CR-06). |
| BR-CR-12 | ALL prior iterations are included. If a reviewer has `writtenVersions["se-review"] = 3`, files for v1, v2, and v3 are all checked and included if present. |
| BR-CR-13 | A missing file (file written in a previous round but not found on disk now) is silently skipped. No error is raised, no workflow status is changed. Specifically: `phaseStatus` remains `"running"` and no `failureInfo` is set. |
| BR-CR-14 | The iteration enumeration starts at v=1. The unversioned file (v=1) and versioned files (v≥2) are treated uniformly using `crossReviewPath()`. |

#### Context Assembly Example

| Round | Reviewer | Status | writtenVersions | Files included in optimizer context |
|-------|----------|--------|----------------|-------------------------------------|
| 1 | pm-review | approved | 1 | `CROSS-REVIEW-product-manager-REQ.md` |
| 1 | se-review | revision_requested | 1 | `CROSS-REVIEW-software-engineer-REQ.md` |
| 2 | pm-review | approved | 1 | `CROSS-REVIEW-product-manager-REQ.md` |
| 2 | se-review | revision_requested | 2 | `CROSS-REVIEW-software-engineer-REQ.md`, `CROSS-REVIEW-software-engineer-REQ-v2.md` |

When round 2 optimizer is dispatched, context includes all 4 files above (minus any missing).

#### Acceptance Tests

**AT-CR-03-A: All versions included for requesting reviewer**
- Who: Orchestrator
- Given: Round 2 revision. `pm-review` approved (writtenVersions["pm-review"] = 1). `se-review` requested revision (writtenVersions["se-review"] = 2). All cross-review files exist on disk.
- When: Optimizer (`pm-author`) is dispatched for revision
- Then: Context includes: `CROSS-REVIEW-product-manager-REQ.md` (v1), `CROSS-REVIEW-software-engineer-REQ.md` (v1), `CROSS-REVIEW-software-engineer-REQ-v2.md` (v2). Total: 3 files.

**AT-CR-03-B: Missing file silently skipped — workflow state unchanged**
- Who: Orchestrator
- Given: `pm-review` v1 cross-review file does not exist on disk
- When: Building optimizer context
- Then: `CROSS-REVIEW-product-manager-REQ.md` is excluded from the context list. No error is raised. `phaseStatus` remains `"running"`. No `failureInfo` is set on the workflow state.

**AT-CR-03-C: Approving reviewer files still included**
- Who: Orchestrator
- Given: `pm-review` approved in round 1. Only `se-review` requested revision.
- When: Round 2 optimizer is dispatched
- Then: `pm-review`'s cross-review file is included in context alongside `se-review`'s files.

---

## 4. Open Questions

| ID | Question | Affects | Status |
|----|----------|---------|--------|
| OQ-03 | When PROPERTIES file is absent during `properties-tests` phase, what specific text does `se-implement` include in its output to indicate the absence? Should `ptah run` surface this as a warning? | REQ-WF-03 | Open |
| OQ-04 | Is the `listWorkflowsByPrefix` enhancement (adding `statusFilter`) intended as a breaking change to the existing method signature, or should it be a new overload? | REQ-CLI-06 | Open — engineering to decide |

*Note: OQ-01 and OQ-02 (creation phase progress label and emission) are resolved: creation phases are out of scope for this FSPEC iteration. Creation phases emit no phase-header or reviewer-result progress lines (see FSPEC-CLI-03 Description).*

---

## 5. Traceability

| Requirement | FSPEC | Status |
|-------------|-------|--------|
| REQ-CLI-01 | FSPEC-CLI-01 | Covered |
| REQ-CLI-02 | FSPEC-CLI-01 | Covered |
| REQ-CLI-03 | FSPEC-CLI-03 | Covered |
| REQ-CLI-04 | FSPEC-CLI-02 | Covered |
| REQ-CLI-05 | FSPEC-CLI-02 | Covered |
| REQ-CLI-06 | FSPEC-CLI-01 | Covered |
| REQ-WF-01 | FSPEC-WF-01 | Covered |
| REQ-WF-02 | No FSPEC — configuration table, no behavioral branching | Not required |
| REQ-WF-03 | FSPEC-WF-01 (deriveDocumentType specification) | Covered |
| REQ-WF-04 | No FSPEC — validation rule is a single check with clear error message | Not required |
| REQ-WF-05 | FSPEC-WF-01 | Covered |
| REQ-WF-06 | FSPEC-WF-02 | Covered |
| REQ-AG-01 | No FSPEC — file manifest change, no behavioral branching | Not required |
| REQ-AG-02 | No FSPEC — config generation, no behavioral branching | Not required |
| REQ-CR-01 | No FSPEC — mapping table addition, no behavioral branching | Not required |
| REQ-CR-02 | FSPEC-CR-01 | Covered |
| REQ-CR-03 | FSPEC-CR-01 | Covered |
| REQ-CR-04 | FSPEC-CR-01 | Covered |
| REQ-CR-05 | FSPEC-CR-02 | Covered |
| REQ-CR-06 | FSPEC-CR-02 | Covered |
| REQ-CR-07 | FSPEC-CR-03 | Covered |
| REQ-NF-01 | No FSPEC — backward compatibility constraints, no new flow | Not required |
| REQ-NF-02 | FSPEC-CLI-04 | Covered |
| REQ-NF-03 | FSPEC-CR-01 | Covered |
| REQ-NF-04 | FSPEC-CR-01 | Covered |

---

## 6. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Product Manager | Initial FSPEC. 9 functional specifications covering CLI flows, workflow engine skip conditions, cross-review versioning, and recommendation parser consolidation. |
| 1.1 | April 22, 2026 | Product Manager | Addressed cross-review feedback from software-engineer (4 High, 6 Medium) and test-engineer (4 High, 7 Medium). Key changes: (1) SE F-01 / REQ-WF-03 traceability: added `deriveDocumentType("properties-tests")` special-case lookup spec to FSPEC-WF-01; updated traceability row. (2) SE F-02: added full TypeScript discriminated union definition for `SkipCondition` with validator rules table to FSPEC-WF-01. (3) SE F-03 / TE F-09: resolved signal name conflict — specified `"humanAnswerSignal"` and `"user-answer"` coexist as two distinct Temporal signals; added `signalHumanAnswer()` method spec; specified lenient config loader requirement in FSPEC-CLI-04. (4) SE F-04 / TE F-08: explicitly required `buildContinueAsNewPayload()` to carry full `reviewStates` including `writtenVersions`; added unit test mechanism to AT-CR-01-F. (5) TE F-01: added AT-WF-01-E specifying `resolveNextPhase()` must propagate `evaluateSkipCondition()` throw without catching. (6) TE F-02: reconciled FSPEC-CLI-02 vs REQ-CLI-05 contradiction — gap-after-REQ case now derives `fspec-creation` with a log message (matching REQ AC), while no-artifacts-beyond-REQ derives `req-review` with no message; updated flow diagram, business rules, phase map, and acceptance tests. (7) SE F-03 / TE F-03: clarified `N` in "Need Attention (N findings)" = data rows only, header and separator rows excluded; updated BR-CLI-15 and AT-CLI-03-A. (8) SE F-04 / TE F-04: specified `parseRecommendation()` takes extracted recommendation field value not full file text; added function signature; updated BR-CR-10. (9) SE F-05 / BR-CR-06: called out filter removal required in `runReviewCycle()`. (10) SE F-06: specified `ReviewerManifest` discipline key as `"default"` for new YAML in FSPEC-WF-01. (11) SE F-07: added missing `ptah.workflow.yaml` error to FSPEC-CLI-01 error table and acceptance test AT-CLI-01-H; specified WorkflowConfigError catch-and-reformat as BR-CLI-06. (12) SE F-08 / BR-CLI-18: specified `approved_with_minor_issues` collapses to `"approved"` ReviewerStatusValue — no sub-variant needed. (13) SE F-09 / BR-CLI-19: specified cross-review file paths resolved relative to feature folder (REQ parent dir). (14) SE F-10: added architectural note to FSPEC-CLI-02 about CLI-side stat vs Temporal Activity dual-check. (15) TE F-06: fixed AT-CLI-02-F to use REQ+FSPEC present → derives `tspec-creation` → absent from custom config. (16) TE F-07: added AT-WF-02-F testing `approved_with_minor_issues` path. (17) TE F-10: resolved OQ-01/OQ-02 — creation phases are out of scope for progress reporting. (18) TE F-11: added `phaseStatus`/`failureInfo` invariant to AT-CR-03-B. Added AT-WF-01-F (`deriveDocumentType`), AT-WF-01-G (no re-call mid-loop), AT-CR-01-A2 (`undefined` revisionCount). Removed OQ-01 and OQ-02 from open questions. |

---

*End of Document*
