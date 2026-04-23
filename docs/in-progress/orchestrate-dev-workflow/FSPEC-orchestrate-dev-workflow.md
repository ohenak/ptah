# Functional Specification

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-021 |
| **Parent Document** | [REQ-orchestrate-dev-workflow](REQ-orchestrate-dev-workflow.md) (v1.3, Draft) |
| **Version** | 1.0 |
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
  │     └── Load ptah.workflow.yaml from current directory
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

#### Error Messages

| Condition | Stdout Message | Exit Code |
|-----------|---------------|-----------|
| REQ file not found | `Error: REQ file not found: <path>` | 1 |
| REQ file is empty | `Error: REQ file is empty: <path>` | 1 |
| Running workflow exists | `Error: workflow already running for feature "<slug>". Use --from-phase to restart from a specific phase after terminating the existing workflow.` | 1 |
| Temporal query exception | `Error: unable to check for running workflows: <error message>` | 1 |
| Workflow failed | (final progress line from poll) | 1 |
| Workflow revision-bound-reached | (final progress line from poll) | 1 |
| Workflow cancelled | (final progress line from poll) | 1 |

#### Edge Cases

- **Path with no parent directory** (e.g., `REQ-foo.md` with no `/`): treat the slug as the filename stem stripped of `REQ-` prefix and `.md` extension. This is an edge case; the canonical form is always `docs/{category}/{slug}/REQ-{slug}.md`.
- **`ptah.workflow.yaml` missing from current directory**: `ptah run` prints `Error: ptah.workflow.yaml not found in current directory.` and exits 1.

#### Acceptance Tests

**AT-CLI-01-A: Happy path start**
- Who: Engineer
- Given: `docs/in-progress/my-feature/REQ-my-feature.md` exists and is non-empty; no running Temporal workflow for `my-feature`
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: A Temporal `featureLifecycleWorkflow` starts for `my-feature`. stdout begins streaming progress. Command stays alive (non-blocking) until terminal state.

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

---

### FSPEC-CLI-02: Phase Resolution: `--from-phase`, Auto-Detection, and Default

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-02 |
| **Title** | Phase Resolution: `--from-phase`, Auto-Detection, and Default |
| **Linked Requirements** | REQ-CLI-04, REQ-CLI-05 |

#### Description

Before starting the Temporal workflow, `ptah run` must determine `startAtPhase`. This is resolved through a strict three-tier priority: explicit flag > auto-detection > default. This FSPEC defines each tier's behavior and the validation gate that follows.

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
  │     ├── Last contiguous artifact = REQ →
  │     │     startAtPhase = "req-review"
  │     │     stdout: (no auto-detection message — this is the default)
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
  └── TIER 3 (implicit in Tier 2): No artifacts beyond REQ → startAtPhase = "req-review"

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
| BR-CLI-08 | Contiguity is measured from REQ. If FSPEC is absent but TSPEC is present, the sequence is treated as ending after REQ. TSPEC is ignored for the purpose of advancing the detected phase. |
| BR-CLI-09 | The artifact filename pattern is exactly `<DOCTYPE>-{slug}.md` where `<DOCTYPE>` is the uppercase document type and `{slug}` is the feature slug. The search is case-sensitive and performed in the feature folder (the directory containing the REQ file). |
| BR-CLI-10 | When `--from-phase` provides an invalid phase ID, the error message lists ALL phase IDs from the loaded config, not a subset. The list must not include `...` or truncation. |
| BR-CLI-11 | The `--from-phase` flag takes precedence over auto-detection. When the flag is present, auto-detection is not performed. |

#### Auto-Detection Phase Map

| Last Contiguous Artifact | Derived `startAtPhase` | Stdout Log Message |
|--------------------------|------------------------|-------------------|
| REQ only (default) | `req-review` | (none) |
| REQ + FSPEC | `tspec-creation` | `Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)` |
| REQ + FSPEC + TSPEC | `plan-creation` | `Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)` |
| REQ + FSPEC + TSPEC + PLAN | `properties-creation` | `Auto-detected resume phase: properties-creation (PLAN found, PROPERTIES missing)` |
| REQ + FSPEC + TSPEC + PLAN + PROPERTIES | `implementation` | `Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)` |

#### Edge Cases

- **FSPEC absent, TSPEC present**: contiguous prefix ends at REQ; derived phase = `req-review`. The TSPEC is ignored.
- **Feature folder is empty (only REQ exists)**: derived phase = `req-review`. No log message.
- **Custom `ptah.workflow.yaml` omits `fspec-creation`**: if the auto-detected phase is `fspec-creation` and the config has no such phase, the command exits 1 with the config-mismatch error.
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
- Then: stdout does NOT mention TSPEC. Workflow starts at `req-review`. (TSPEC is beyond the broken prefix and is ignored.)

**AT-CLI-02-E: Auto-detection — no artifacts beyond REQ**
- Who: Engineer
- Given: Only `REQ-my-feature.md` exists in the feature folder
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: Workflow starts at `req-review`. No auto-detection log message printed.

**AT-CLI-02-F: Auto-detected phase missing from config**
- Who: Engineer
- Given: Custom `ptah.workflow.yaml` has no `fspec-creation` phase. Feature folder has only `REQ-my-feature.md`.
- When: `ptah run docs/in-progress/my-feature/REQ-my-feature.md`
- Then: stdout prints `Error: auto-detected phase "fspec-creation" not found in workflow config. Use --from-phase to specify a valid start phase.` Exit code 1.

---

### FSPEC-CLI-03: Stdout Progress Reporting

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CLI-03 |
| **Title** | Stdout Progress Reporting |
| **Linked Requirements** | REQ-CLI-03 |

#### Description

While `ptah run` is executing, it polls `queryWorkflowState` every 2 seconds and emits progress lines to stdout when the workflow state changes. This provides real-time visibility without requiring Discord or Temporal UI.

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
  │     └── status = revision_requested:
  │           emit:   {reviewer-id}:  Need Attention ({N} findings)
  │                   where N = total row count in ## Findings table of cross-review file
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
| BR-CLI-12 | Deduplication prevents duplicate lines: a line is only emitted when at least one of (phase name, iteration number, any reviewer's status) has changed from the previous poll. |
| BR-CLI-13 | The finding count `N` in `Need Attention (N findings)` is the total number of rows in the `## Findings` table of the reviewer's cross-review file for that iteration. All severity rows count. If the cross-review file cannot be read, `N` is reported as `?`. |
| BR-CLI-14 | Phase label is the short uppercase letter(s) used in the orchestrate-dev format (e.g., `R` for req-review, `F` for fspec-review, `T` for tspec-review, etc.). Phase title is the human-readable name. |
| BR-CLI-15 | All progress lines go to stdout, not stderr. Stderr is reserved for warnings only (e.g., the stdin-closed warning in FSPEC-CLI-04). |

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
- Given: Phase R (REQ Review) iteration 1 just completed with `se-review` approving and `te-review` requesting revision with 4 findings
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

#### Behavioral Flow

```
ROUTE_TO_USER state detected
  │
  ├── Discord config present?
  │     Yes → route question to Discord as normal (existing behavior)
  │           stdin NOT read
  │           return to progress polling
  │
  └── No Discord config →
        emit to stdout: [Question] <question-text>
        emit to stdout: Answer:   ← (trailing space, no newline, acts as inline prompt)
        Read one line from stdin
        │
        ├── Line received → send line contents via signal "humanAnswerSignal" to workflow
        │                   return to progress polling
        │
        └── stdin closed / EOF before input →
              send empty string via signal "humanAnswerSignal" to workflow
              emit to stderr: Warning: stdin closed before answer was provided;
                              resuming workflow with empty answer.
              return to progress polling
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-CLI-16 | The `Answer: ` prompt is printed WITHOUT a trailing newline, so the cursor stays on the same line for the engineer to type. This is a deliberate UX choice for inline prompting. |
| BR-CLI-17 | The signal name used is exactly `"humanAnswerSignal"`. |
| BR-CLI-18 | Only ONE line is read from stdin per `ROUTE_TO_USER` event. Multi-line input is not supported; only the first line is consumed. |
| BR-CLI-19 | The closed-stdin warning goes to stderr, not stdout. The progress stream on stdout remains clean. |
| BR-CLI-20 | When Discord config is present, stdin reading is entirely suppressed even if the question could theoretically be answered via stdin. Discord takes exclusive ownership. |

#### Acceptance Tests

**AT-CLI-04-A: No-Discord question answered**
- Who: Engineer with no Discord config
- Given: `ptah.config.json` has no `discord` section. Workflow reaches `ROUTE_TO_USER` with question "Should the feature include authentication?"
- When: The state is detected by the progress poller
- Then: stdout prints `[Question] Should the feature include authentication?` followed by `Answer: ` (no newline). `ptah run` reads one line from stdin. After the engineer types `Yes` and presses Enter, the workflow receives signal `"humanAnswerSignal"` with value `"Yes"`. Progress polling resumes.

**AT-CLI-04-B: stdin closed before answer**
- Who: Engineer running in non-interactive mode (e.g., piped stdin)
- Given: No Discord config. Workflow reaches `ROUTE_TO_USER`. stdin is closed (EOF) before any input.
- When: `ptah run` reads stdin and gets EOF
- Then: Signal `"humanAnswerSignal"` is sent with empty string. stderr prints `Warning: stdin closed before answer was provided; resuming workflow with empty answer.`

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

The `SkipCondition` type gains a new variant `{ field: "artifact.exists"; artifact: string }`. Evaluating this condition requires filesystem I/O, which must not run inline in the Temporal workflow (non-determinism violation). This FSPEC defines the pre-loop activity pattern and the `evaluateSkipCondition()` function contract.

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
              ├── condition.field = "config.*" → use existing config-lookup logic
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
        requiredAgents = workflowConfig["implementation-review"].reviewers
        For each agentId in requiredAgents:
          if signOffs[agentId] !== true → return false
        All present → return true
```

#### Business Rules

| Rule | Detail |
|------|--------|
| BR-WF-07 | An approved status is `true` in `signOffs`. An `approved_with_minor_issues` sign-off also maps to `true`. A `revision_requested` or absent sign-off maps to `false`. |
| BR-WF-08 | The legacy fallback (checking `signOffs.qa && signOffs.pm`) is preserved exclusively for configs that have no `implementation-review` phase. It is not used when the phase exists but has an empty reviewers list — an empty reviewers list means `isCompletionReady()` returns `true` immediately (vacuous truth). |
| BR-WF-09 | All existing call sites of `isCompletionReady()` must be updated to pass `workflowConfig` as the second argument. |

#### Acceptance Tests

**AT-WF-02-A: All required reviewers signed off**
- Who: Orchestrator
- Given: `workflowConfig["implementation-review"].reviewers = ["pm-review", "te-review"]`. `signOffs = { "pm-review": true, "te-review": true }`.
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
- Given: `workflowConfig["implementation-review"].reviewers = []`
- When: Called
- Then: Returns `true` (vacuous truth — no agents required).

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
| BR-CR-03 | `reviewState.writtenVersions` is initialized to `{}` in `buildInitialWorkflowState()` and included in `buildContinueAsNewPayload()`. It is not reset on `ContinueAsNew`. |
| BR-CR-04 | The context prompt injected into the reviewer agent's input must include the exact expected output filename: `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md`. This is how the agent knows where to write. |
| BR-CR-05 | `revisionCount` in `ReadCrossReviewInput` and `SkillActivityInput` is optional. When absent, callers that pass no value get unversioned behavior (same as passing 1). |

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
- Given: Workflow undergoes `ContinueAsNew` after round 2; `writtenVersions = { "se-review": 2 }`
- When: Workflow resumes
- Then: `reviewState.writtenVersions` = `{ "se-review": 2 }` in the resumed workflow state (not reset).

---

### FSPEC-CR-02: Recommendation Parser Consolidation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CR-02 |
| **Title** | Recommendation Parser Consolidation |
| **Linked Requirements** | REQ-CR-05, REQ-CR-06 |

#### Description

Two new phrases must be recognized: `"approved with minor issues"` (maps to `approved`) and `"need attention"` (maps to `revision_requested`). The existing parallel implementation `mapRecommendationToStatus()` in `feature-lifecycle.ts` is removed; all callers use `parseRecommendation()` from `cross-review-parser.ts` as the single authoritative parser.

#### Behavioral Flow

```
parseRecommendation(text)
  │
  ├── Normalize: lowercase the full Recommendation field value
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
| BR-CR-06 | Matching is case-insensitive. `"Approved with Minor Issues"`, `"APPROVED WITH MINOR ISSUES"`, and `"approved with minor issues"` all produce `{ status: "approved" }`. |
| BR-CR-07 | `mapRecommendationToStatus()` is deleted from `feature-lifecycle.ts`. No references to it may remain after this change. |
| BR-CR-08 | The unrecognized-value default is `revision_requested` (conservative: unknown = request revision). |
| BR-CR-09 | Matching uses the normalized value of the `Recommendation:` field in the cross-review file, not the full file text. |

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
- Given: Cross-review file contains `Recommendation: Approved with Minor Issues`
- When: `parseRecommendation()` is called
- Then: Returns `{ status: "approved" }`.

**AT-CR-02-B: "Need Attention" recognized**
- Who: Recommendation parser
- Given: Cross-review file contains `Recommendation: Need Attention`
- When: `parseRecommendation()` is called
- Then: Returns `{ status: "revision_requested" }`.

**AT-CR-02-C: Case insensitivity**
- Who: Recommendation parser
- Given: `Recommendation: NEED ATTENTION`
- When: `parseRecommendation()` is called
- Then: Returns `{ status: "revision_requested" }`.

**AT-CR-02-D: Existing "Approved" still works**
- Who: Recommendation parser
- Given: `Recommendation: Approved`
- When: `parseRecommendation()` is called
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
| BR-CR-10 | ALL reviewers' files are included, regardless of their recommendation status. A reviewer who `approved` in round 1 still contributes their file to context in round 2. |
| BR-CR-11 | ALL prior iterations are included. If a reviewer has `writtenVersions["se-review"] = 3`, files for v1, v2, and v3 are all checked and included if present. |
| BR-CR-12 | A missing file (file written in a previous round but not found on disk now) is silently skipped. No error is raised, no workflow status is changed. |
| BR-CR-13 | The iteration enumeration starts at v=1. The unversioned file (v=1) and versioned files (v≥2) are treated uniformly using `crossReviewPath()`. |

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

**AT-CR-03-B: Missing file silently skipped**
- Who: Orchestrator
- Given: `pm-review` v1 cross-review file does not exist on disk
- When: Building optimizer context
- Then: `CROSS-REVIEW-product-manager-REQ.md` is excluded from the context list. No error is raised. Workflow status is unchanged.

**AT-CR-03-C: Approving reviewer files still included**
- Who: Orchestrator
- Given: `pm-review` approved in round 1. Only `se-review` requested revision.
- When: Round 2 optimizer is dispatched
- Then: `pm-review`'s cross-review file is included in context alongside `se-review`'s files.

---

## 4. Open Questions

| ID | Question | Affects | Status |
|----|----------|---------|--------|
| OQ-01 | What is the phase label scheme for creation phases (req-creation, fspec-creation, etc.) in progress output? The REQ covers only review phases in progress examples. | FSPEC-CLI-03 | Open |
| OQ-02 | Should `ptah run` emit progress for creation phases (dispatching pm-author for req-creation) or only for review phases? | FSPEC-CLI-03 | Open |
| OQ-03 | When PROPERTIES file is absent during `properties-tests` phase, what specific text does `se-implement` include in its output to indicate the absence? Should `ptah run` surface this as a warning? | REQ-WF-03 | Open |
| OQ-04 | Is the `listWorkflowsByPrefix` enhancement (adding `statusFilter`) intended as a breaking change to the existing method signature, or should it be a new overload? | REQ-CLI-06 | Open — engineering to decide |

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
| REQ-WF-03 | No FSPEC — phase position and document type mapping are deterministic | Not required |
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

---

*End of Document*
