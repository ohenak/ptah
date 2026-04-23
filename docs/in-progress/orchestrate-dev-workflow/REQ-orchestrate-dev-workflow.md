# Requirements Document

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-021 |
| **Parent Document** | [orchestrate-dev SKILL.md](../../../.claude/skills/orchestrate-dev/SKILL.md) |
| **Version** | 1.2 |
| **Date** | April 22, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Align Ptah's default workflow configuration, agent roster, CLI, and cross-review mechanics with the pipeline defined in the `orchestrate-dev` Claude Code skill.

Today, Ptah implements the right structural primitives (Temporal-backed workflow engine, parallel reviewer dispatch, fork/join, revision loops, cross-review file parsing) but its defaults diverge from the `orchestrate-dev` skill in four concrete ways:

1. **Agent roster mismatch.** `ptah init` scaffolds 3–5 generic agents (`pm`, `eng`, `qa`, `fe`). `orchestrate-dev` defines 8 role-specific agents (`pm-author`, `pm-review`, `se-author`, `se-review`, `te-author`, `te-review`, `tech-lead`, `se-implement`). Ptah's agent registry, skill name mapping, and default workflow YAML must be updated to match.

2. **Missing phases.** The default `ptah.workflow.yaml` lacks the PROPERTIES Tests phase (Phase PT — `se-implement` writes TDD tests post-implementation). It also does not treat req-creation as optional when a REQ file already exists, which prevents starting mid-pipeline from an existing REQ.

3. **Cross-review mechanics gaps.** The recommendation parser does not recognize `"approved with minor issues"` (orchestrate-dev's passing phrase) or `"need attention"` (its failing phrase). File versioning for successive review iterations uses an un-suffixed path on every round, making it impossible to preserve previous iterations. The agent-to-skill-name mapping does not cover the new role agent IDs.

4. **No headless `run` command.** There is no CLI entry point that accepts a REQ file path, starts the workflow at Phase R, and reports progress to stdout — the equivalent of `/orchestrate-dev docs/{feature}/REQ-{feature}.md`.

---

## 2. User Scenarios

### US-01: Engineer Runs a Workflow from an Existing REQ

| Attribute | Detail |
|-----------|--------|
| **Description** | An engineer has already authored a REQ document (either manually or via `pm-author`) and wants Ptah to take over the rest of the pipeline — cross-reviews, FSPEC, TSPEC, PLAN, PROPERTIES, implementation, tests, and final review — without re-running REQ creation. They run `ptah run docs/my-feature/REQ-my-feature.md` and Ptah starts at Phase R. |
| **Goals** | Start the PDLC pipeline from an existing approved REQ with a single command. |
| **Pain points** | Currently, all Ptah workflows start from `req-creation`. There is no `ptah run` command, no way to skip creation phases when artifacts already exist, and no headless progress mode. |
| **Key needs** | `ptah run <req-path>` CLI command; auto-skip of creation phases when upstream artifacts exist; stdout progress reporting. |

### US-02: Engineer Gets the Full Orchestrate-Dev Agent Roster on Init

| Attribute | Detail |
|-----------|--------|
| **Description** | An engineer runs `ptah init` in a new project. They expect to get 8 skill files matching the roles defined in `orchestrate-dev` (pm-author, pm-review, se-author, se-review, te-author, te-review, tech-lead, se-implement), a workflow YAML that wires those roles to the correct phases and reviewers, and a config file that registers all 8 agents. |
| **Goals** | Zero-configuration start for teams adopting the orchestrate-dev workflow. |
| **Pain points** | Current `ptah init` creates 3 generic agents. Teams must manually align agent IDs, skill files, and workflow phases with what `orchestrate-dev` expects. |
| **Key needs** | Updated `FILE_MANIFEST` and `buildConfig()` in `defaults.ts`; updated default `ptah.workflow.yaml`. |

### US-03: Cross-Reviews Are Named, Versioned, and Parsed Correctly

| Attribute | Detail |
|-----------|--------|
| **Description** | A reviewer agent (e.g., `se-review`) writes `CROSS-REVIEW-software-engineer-REQ.md` in the first review round and `CROSS-REVIEW-software-engineer-REQ-v2.md` in the second. The orchestrator reads the latest version, passes it as context to the optimizer, and gates phase advancement on all reviewers issuing "Approved" or "Approved with Minor Issues". |
| **Goals** | Cross-review files are correctly discovered, versioned, and their recommendations correctly parsed. |
| **Pain points** | Current `agentIdToSkillName()` only maps `pm`, `eng`, `qa` — not the new role agent IDs. `crossReviewPath()` produces un-versioned paths on every round, overwriting iteration history. The recommendation parser does not recognize `"approved with minor issues"` or `"need attention"`. |
| **Key needs** | Extended AGENT_TO_SKILL mapping; versioned `crossReviewPath()` with revision count input; new VALUE_MATCHERS entries. |

### US-04: PROPERTIES Tests Are Implemented After Each Feature's Implementation

| Attribute | Detail |
|-----------|--------|
| **Description** | After implementation completes, Ptah automatically dispatches `se-implement` to write TDD tests for every entry in the PROPERTIES document. The full test suite must pass before the workflow advances to the final codebase review. |
| **Goals** | Every shipped feature has PROPERTIES-driven tests verified against the actual implementation. |
| **Pain points** | The current default workflow has no Phase PT. After implementation the workflow jumps directly to `implementation-review`. |
| **Key needs** | New `properties-tests` phase entry in the default `ptah.workflow.yaml` dispatching `se-implement` between `implementation` and `implementation-review`. |

### US-05: Review Loops Run for Up to 5 Iterations

| Attribute | Detail |
|-----------|--------|
| **Description** | Each review phase runs for at most 5 revision cycles before pausing and notifying the engineer. This matches the orchestrate-dev loop limit and provides more headroom than the current default of 3. |
| **Goals** | Fewer premature pauses on complex features; consistent limit with orchestrate-dev documentation. |
| **Pain points** | Current default `revision_bound: 3` often triggers the revision-bound-reached pause too early on involved specs. |
| **Key needs** | Update `revision_bound` default to 5 in the default `ptah.workflow.yaml`. |

### US-06: Engineers Can Track Phase and Reviewer Status in Real Time

| Attribute | Detail |
|-----------|--------|
| **Description** | While `ptah run` is executing, the engineer sees live progress: which phase and iteration is running, which reviewers approved or flagged issues, and a summary of findings. |
| **Goals** | Visibility into workflow execution without polling Discord or Temporal UI. |
| **Pain points** | Current Ptah only sends notifications via Discord; there is no stdout progress stream for headless operation. |
| **Key needs** | Progress event emitter in the orchestrator that writes orchestrate-dev-formatted lines to stdout during `ptah run`. |

### US-07: Engineer Resumes a Workflow After Temporal Data Loss or Accidental Deletion

| Attribute | Detail |
|-----------|--------|
| **Description** | A Temporal workflow for a feature is deleted — either accidentally via the Temporal UI/`tctl`, due to Temporal database data loss, or because the engineer needs to re-run a specific phase that produced bad output. Some artifacts (REQ, FSPEC, TSPEC, ...) already exist on disk. The engineer wants to restart the pipeline from the last meaningful point without losing the work already committed to the feature branch. |
| **Goals** | Resume a PDLC pipeline mid-flight after losing Temporal state, without restarting from Phase R. |
| **Pain points** | A Temporal worker crash is auto-recovered via event replay — but if the workflow itself is gone from Temporal, there is no recovery path: `ptah run` would restart from Phase R, re-running creation phases whose artifacts already exist. |
| **Key needs** | `--from-phase <phase-id>` flag on `ptah run` for explicit resume; artifact-based auto-detection of the furthest completed phase when the flag is absent. |

---

## 3. Scope Boundaries

### 3.1 In Scope

- New `ptah run <req-path>` CLI subcommand
- `ptah run --from-phase <phase-id>` flag for explicit mid-pipeline resume
- Artifact-based auto-detection of the furthest completed phase when `--from-phase` is absent
- Updated `ptah init` scaffold: 8 skill files, updated `ptah.config.json`, updated `ptah.workflow.yaml`
- New default `ptah.workflow.yaml`: 8-role agents, Phase PT, `revision_bound: 5`, Phase R start
- Extended `AGENT_TO_SKILL` mapping in `cross-review-parser.ts` for new role agent IDs
- Versioned `crossReviewPath()` — accepts `revisionCount` and appends `-v{N}` suffix for N ≥ 2
- New VALUE_MATCHERS entries: `"approved with minor issues"` → approved, `"need attention"` → revision_requested
- Consolidation of `mapRecommendationToStatus()` into `parseRecommendation()` so there is a single authoritative parser
- `AGENT_TO_SKILL` map sourced exclusively from `SKILL_TO_AGENT` reversal so both maps stay consistent
- `SkipCondition` discriminated union: `{ field: "config.*"; equals: boolean } | { field: "artifact.exists"; artifact: string }`
- New `checkArtifactExists` Temporal Activity that performs filesystem I/O and stores its result in `FeatureWorkflowState` before the main phase loop
- `ReviewState` gains `writtenVersions: Record<string, number>` (agentId → highest revision number written) to track cross-review file history
- Optimizer context: include all cross-review files (not only those requesting revision) and all prior iterations using `writtenVersions`
- Stdout progress reporting in `ptah run` mode using orchestrate-dev format
- `req-creation` phase skipped when the REQ file already exists at workflow start
- New `REQ-CLI-06`: `ptah run` checks for existing running Temporal workflow and exits with error if one is found
- `isCompletionReady()` updated to derive required sign-off agents from the workflow config's `implementation-review` phase reviewers list
- `properties-tests` phase: `deriveDocumentType("properties-tests")` returns `"PROPERTIES"` (not `"PROPERTIES-TESTS"`)

### 3.2 Out of Scope

- Changing Ptah's existing Discord-driven `ptah start` mode
- Implementing the `tech-lead` skill content itself (skill files are stubs; content is user responsibility)
- Implementing the `se-implement` or any other skill content
- Automatic prompting for human answers via stdin during `ptah run` (questions still route to Discord when Discord config is present; when absent, `ptah run` prints the question to stdout and pauses execution at the `ROUTE_TO_USER` state)
- Changing the Temporal workflow engine's parallel dispatch or merge mechanics
- Support for more than one active `ptah run` session per feature simultaneously

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The orchestrate-dev agent skill files already exist under `.claude/skills/`; Ptah only needs to reference them | If the skills don't exist, agents will fail at invocation — but that is a user configuration concern |
| A-02 | `featureLifecycleWorkflow` already supports `startAtPhase` correctly via `StartWorkflowParams` | If `startAtPhase` doesn't handle the skip-creation case cleanly, additional workflow logic is needed |
| A-03 | Agents write cross-review files at exactly the path `crossReviewPath()` produces | Agents must be given the expected path via context; otherwise they may write to different locations |
| A-04 | A Temporal server is running locally when `ptah run` executes | `ptah run` is a thin CLI wrapper over the same Temporal infrastructure as `ptah start` |
| A-05 | The CLI is solely responsible for computing `startAtPhase` from existing artifacts and passing it to `featureLifecycleWorkflow`. The workflow engine's `skip_if: artifact.exists` check (REQ-WF-01/REQ-WF-05) runs independently at workflow start; both layers may agree or the workflow-side check acts as a safety net. The CLI result takes precedence via the explicit `startAtPhase` parameter. | If the two layers produce conflicting start phases, the explicit `startAtPhase` value always wins |

---

## 4. Requirements

### Domain: CLI — Command-Line Interface

#### REQ-CLI-01: `ptah run` Command

| Attribute | Detail |
|-----------|--------|
| **Description** | Add a `ptah run <req-path>` subcommand. It reads the REQ file at the given path, derives the feature slug from the path (e.g., `docs/in-progress/my-feature/REQ-my-feature.md` → `my-feature`), starts a Temporal `featureLifecycleWorkflow` with `startAtPhase: "req-review"`, streams progress to stdout in the orchestrate-dev format, and exits when the workflow reaches a terminal state. Terminal states are: `completed` (exit code 0), `failed` (exit code 1), `revision-bound-reached` (exit code 1), `cancelled` (exit code 1). |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A REQ file at `docs/in-progress/my-feature/REQ-my-feature.md` **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md` **Then:** A Temporal workflow starts for `my-feature` at phase `req-review`. Progress lines appear on stdout. The command exits with code 0 when the workflow status transitions to `completed`, and code 1 for `failed`, `revision-bound-reached`, or `cancelled`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01, US-06 |
| **Dependencies** | None — builds on existing Temporal client infrastructure |

#### REQ-CLI-02: `ptah run` Validates REQ File Existence and Content

| Attribute | Detail |
|-----------|--------|
| **Description** | Before starting the workflow, `ptah run` confirms the REQ file exists and is non-empty. If the file does not exist, it prints `Error: REQ file not found: <path>` and exits with code 1. If the file exists but is empty (zero bytes or whitespace only), it prints `Error: REQ file is empty: <path>` and exits with code 1. Neither condition starts a Temporal workflow. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A path that does not point to an existing file **When:** They run `ptah run docs/ghost-feature/REQ-ghost-feature.md` **Then:** The command prints `Error: REQ file not found: docs/ghost-feature/REQ-ghost-feature.md` and exits with code 1. **Given:** A path pointing to a zero-byte file **When:** They run `ptah run docs/ghost-feature/REQ-ghost-feature.md` **Then:** The command prints `Error: REQ file is empty: docs/ghost-feature/REQ-ghost-feature.md` and exits with code 1. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-03: `ptah run` Stdout Progress Reporting

| Attribute | Detail |
|-----------|--------|
| **Description** | During workflow execution, `ptah run` polls `queryWorkflowState` at a 2-second interval and emits new progress lines to stdout as state changes are detected (deduplication: a line is only emitted when phase name, iteration number, or reviewer status changes from the previous poll). Each phase entry line includes the phase name and iteration number. Each reviewer result line includes the reviewer agent ID and recommendation. The finding count `N` in `Need Attention (N findings)` is the total row count in the `## Findings` table of the cross-review file (all severities). Phase transitions are marked with the gate result. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A running `ptah run` session **When:** Phase R iteration 1 completes with se-review approving and te-review requesting revision **Then:** stdout contains: `[Phase R — REQ Review] Iteration 1`, `  se-review:  Approved ✅`, `  te-review:  Need Attention (N findings)` where N equals the total row count in te-review's Findings table, `[Phase R — REQ Review] pm-author addressing feedback...` |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-06 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-04: `ptah run` Accepts `--from-phase` Flag for Explicit Resume

| Attribute | Detail |
|-----------|--------|
| **Description** | `ptah run <req-path> --from-phase <phase-id>` starts the Temporal workflow with `startAtPhase` set to the given phase ID, bypassing both auto-detection and the default Phase R start. If the phase ID does not exist in the loaded workflow config, `ptah run` prints an error listing all phase IDs defined in the config (not a subset, not `...`) and exits with code 1. This flag takes precedence over artifact-based auto-detection. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature whose TSPEC already exists but whose Temporal workflow was deleted **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md --from-phase plan-creation` **Then:** A new Temporal workflow starts at `plan-creation`, skipping all earlier phases. **Given:** An invalid phase ID `--from-phase nonexistent` **When:** The command runs **Then:** It prints `Error: phase "nonexistent" not found. Valid phases: [<full comma-separated list of all phase IDs from the loaded workflow config>]` and exits with code 1. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-07 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-05: `ptah run` Auto-Detects Resume Phase from Existing Artifacts

| Attribute | Detail |
|-----------|--------|
| **Description** | When `--from-phase` is not provided, `ptah run` inspects the feature folder for existing document artifacts using a strict canonical PDLC detection order: REQ → FSPEC → TSPEC → PLAN → PROPERTIES. Each artifact is detected by the presence of a non-empty file matching `<DOCTYPE>-{slug}.md` (e.g., `TSPEC-my-feature.md`) in the feature folder. Detection advances to the next creation phase after the last artifact found in the unbroken prefix of the sequence — gaps (e.g., FSPEC absent but TSPEC present) are treated as if the gap artifact is missing; auto-detection uses the last contiguous artifact. The `startAtPhase` is set to the creation phase immediately following the last contiguous artifact found. If no artifacts beyond the REQ exist, the default start is `req-review`. Auto-detection result is logged to stdout. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature folder where `TSPEC-my-feature.md` exists, `PLAN-my-feature.md` does not, and `FSPEC-my-feature.md` exists (full contiguous prefix: REQ, FSPEC, TSPEC) **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md` **Then:** stdout prints `Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)` and the workflow starts at `plan-creation`. **Given:** A folder where FSPEC is absent but TSPEC is present (broken prefix after REQ) **When:** They run `ptah run` **Then:** stdout prints `Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)` and the workflow starts at `fspec-creation`. **Given:** A folder with no artifacts beyond the REQ **When:** They run `ptah run` **Then:** The workflow starts at `req-review`. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-07 |
| **Dependencies** | REQ-CLI-01, REQ-WF-05 |

#### REQ-CLI-06: `ptah run` Prevents Duplicate Temporal Workflows

| Attribute | Detail |
|-----------|--------|
| **Description** | Before starting a new Temporal workflow, `ptah run` queries `listWorkflowsByPrefix("ptah-")` filtered by the feature slug to detect any workflow with status `Running` or `ContinuedAsNew`. If a running workflow is found, the command prints an error and exits with code 1 without starting a duplicate. Closed and terminated workflows with the same ID do not block a new start. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A Temporal workflow for `my-feature` is already in `Running` status **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md` **Then:** The command prints `Error: workflow already running for feature "my-feature". Use --from-phase to restart from a specific phase after terminating the existing workflow.` and exits with code 1. **Given:** No running workflow exists for `my-feature` **When:** They run `ptah run` **Then:** The command proceeds normally. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | REQ-CLI-01 |

---

### Domain: WF — Workflow Configuration

#### REQ-WF-01: Default Workflow Starts at Phase R When REQ Exists

| Attribute | Detail |
|-----------|--------|
| **Description** | The `req-creation` phase in the default `ptah.workflow.yaml` must include a `skip_if` condition using the new `artifact.exists` field type (see REQ-WF-05): `{ field: "artifact.exists", artifact: "REQ" }`. The workflow engine evaluates this by reading the pre-fetched `artifactExists["REQ"]` value from `FeatureWorkflowState` (populated before the main loop by the `checkArtifactExists` Activity). The feature slug used to construct the filename `REQ-{slug}.md` is the same slug derived by `ptah run` from the REQ file path. When the condition is true, the first executed phase is `req-review`. When the REQ does not exist, `req-creation` runs normally. The `workflow-validator.ts` `YamlWorkflowConfigLoader.validateStructure` must be updated to accept `field: "artifact.exists"` in the `skip_if` block. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature folder containing `REQ-my-feature.md` **When:** A workflow starts for `my-feature` **Then:** The workflow begins at `req-review` without dispatching `pm-author` for creation. **Given:** A feature folder with no REQ file **When:** A workflow starts **Then:** The workflow begins at `req-creation`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | REQ-WF-05 |

#### REQ-WF-02: Default Workflow Uses Orchestrate-Dev 8-Role Agent IDs

| Attribute | Detail |
|-----------|--------|
| **Description** | The default `ptah.workflow.yaml` produced by `ptah init` must reference the 8 orchestrate-dev agent IDs with reviewer assignments matching the table below (reproduced from `orchestrate-dev/SKILL.md` at the time of this document): |

**Reviewer Assignment Matrix**

| Phase | Phase ID | Agent | Reviewers |
|-------|----------|-------|-----------|
| REQ Review | `req-review` | `pm-author` | `se-review`, `te-review` |
| FSPEC Review | `fspec-review` | `pm-author` | `se-review`, `te-review` |
| TSPEC Review | `tspec-review` | `se-author` | `pm-review`, `te-review` |
| PLAN Review | `plan-review` | `se-author` | `pm-review`, `te-review` |
| PROPERTIES Review | `properties-review` | `te-author` | `pm-review`, `se-review` |
| Implementation | `implementation` | `tech-lead` | — |
| Properties Tests | `properties-tests` | `se-implement` | — |
| Final Codebase Review | `implementation-review` | `se-author` | `pm-review`, `te-review` |

| Attribute | Detail |
|-----------|--------|
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs **Then:** `ptah.workflow.yaml` contains phases whose `agent` and `reviewers` fields exactly match the Reviewer Assignment Matrix table above. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | REQ-AG-01 |

#### REQ-WF-03: Default Workflow Includes PROPERTIES Tests Phase

| Attribute | Detail |
|-----------|--------|
| **Description** | The default `ptah.workflow.yaml` must include a `properties-tests` phase (type: `creation`, agent: `se-implement`) positioned between the `implementation` phase and `implementation-review`. Context documents: `{feature}/REQ`, `{feature}/TSPEC`, `{feature}/PLAN`, `{feature}/PROPERTIES`. The `deriveDocumentType()` function must map the phase ID `"properties-tests"` to the document type `"PROPERTIES"` (not `"PROPERTIES-TESTS"`), ensuring reviewer agents correctly locate the PROPERTIES artifact. If the PROPERTIES artifact does not exist when the phase runs (e.g., properties-creation was skipped), the workflow treats the missing context document as a soft warning and proceeds — the `se-implement` agent is responsible for noting the absence in its output. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs and the implementation phase completes **Then:** The workflow advances to a `properties-tests` phase dispatching `se-implement`. Only after `properties-tests` completes does the workflow advance to `implementation-review`. `deriveDocumentType("properties-tests")` returns `"PROPERTIES"`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-04 |
| **Dependencies** | REQ-WF-02 |

#### REQ-WF-04: Default Revision Bound Is 5

| Attribute | Detail |
|-----------|--------|
| **Description** | All review phases in the default `ptah.workflow.yaml` must have `revision_bound: 5`. A review phase that is missing a `revision_bound` field is treated as a configuration error by the workflow validator and causes `ptah run` to exit with code 1 before starting the workflow. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs **Then:** Every review phase entry in `ptah.workflow.yaml` contains `revision_bound: 5`. **Given:** A custom `ptah.workflow.yaml` with a review phase missing `revision_bound` **When:** `ptah run` parses it **Then:** The command exits with code 1 and prints a validation error identifying the phase. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-05 |
| **Dependencies** | None |

#### REQ-WF-05: Skip Condition Supports Artifact Existence Check

| Attribute | Detail |
|-----------|--------|
| **Description** | The `SkipCondition` type in `PhaseDefinition` is extended to a discriminated union: `{ field: "config.*"; equals: boolean } \| { field: "artifact.exists"; artifact: string }`. A new Temporal Activity `checkArtifactExists(slug: string, docType: string): Promise<boolean>` performs the filesystem check (reads whether `<docType>-{slug}.md` exists in the feature folder). This Activity is called for each phase with a `skip_if: { field: "artifact.exists" }` condition before the main phase loop begins, and its results are stored in a new `FeatureWorkflowState` field `artifactExists: Record<string, boolean>` (keyed by `docType`). `evaluateSkipCondition()` is updated to handle the new union branch by reading `state.artifactExists[condition.artifact]`. The `evaluateSkipCondition()` call for `artifact.exists` conditions is only valid after the pre-loop activity has run; calling it before produces a runtime error. |
| **Acceptance Criteria** | **Who:** Workflow engine **Given:** A phase with `skip_if: { field: "artifact.exists", artifact: "REQ" }` **When:** `REQ-my-feature.md` exists in the feature folder **Then:** `checkArtifactExists("my-feature", "REQ")` returns `true`, `state.artifactExists["REQ"]` is `true`, and `evaluateSkipCondition()` returns `true`, causing the phase to be skipped. **When:** The file does not exist **Then:** `evaluateSkipCondition()` returns `false` and the phase runs. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | None |

#### REQ-WF-06: `isCompletionReady()` Uses Workflow-Config Reviewer List

| Attribute | Detail |
|-----------|--------|
| **Description** | `isCompletionReady()` in `feature-lifecycle.ts` must no longer hard-code `signOffs.qa` and `signOffs.pm` as the required sign-off agents. Instead, it must derive the required sign-off agent IDs from the `implementation-review` phase's `reviewers` list in the loaded workflow config. A workflow is completion-ready when all agents listed as reviewers on `implementation-review` have submitted an `approved` or `approved_with_minor_issues` sign-off. For backward compatibility, if the workflow config has no `implementation-review` phase, the function falls back to the legacy `signOffs.qa && signOffs.pm` check. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A workflow config where `implementation-review` has `reviewers: [pm-review, te-review]` **When:** Both `pm-review` and `te-review` submit approved sign-offs **Then:** `isCompletionReady()` returns `true`. **Given:** Only one of the two has signed off **Then:** It returns `false`. **Given:** An old workflow config with no `implementation-review` phase **When:** Both `signOffs.qa` and `signOffs.pm` are true **Then:** It returns `true` (legacy path). |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | REQ-WF-02 |

---

### Domain: AG — Agent Configuration

#### REQ-AG-01: `ptah init` Scaffolds 8 Orchestrate-Dev Skill Files

| Attribute | Detail |
|-----------|--------|
| **Description** | The `FILE_MANIFEST` in `defaults.ts` must include stub skill files for all 8 orchestrate-dev agents under `ptah/skills/`: `pm-author.md`, `pm-review.md`, `se-author.md`, `se-review.md`, `te-author.md`, `te-review.md`, `tech-lead.md`, `se-implement.md`. Each stub includes a comment directing the user to populate the skill prompt. The `FILE_MANIFEST` length and the `init.test.ts` assertion must be updated to reflect the new file count (previously 18; the new count is 18 − (prior skill count) + 8; the exact expected count must be confirmed by counting the full manifest). |
| **Acceptance Criteria** | **Who:** Engineer **Given:** An empty project directory **When:** `ptah init` runs **Then:** All 8 skill stub files exist under `ptah/skills/`. The total number of files created by `ptah init` matches the updated `FILE_MANIFEST` length. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | None |

#### REQ-AG-02: `ptah.config.json` Registers All 8 Agents

| Attribute | Detail |
|-----------|--------|
| **Description** | The `buildConfig()` function in `defaults.ts` must produce a `ptah.config.json` with all 8 agents listed under `agents.active` with their corresponding `agents.skills` paths pointing to the stub files created by REQ-AG-01. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs **Then:** `ptah.config.json` contains 8 entries in `agents.active`: `pm-author`, `pm-review`, `se-author`, `se-review`, `te-author`, `te-review`, `tech-lead`, `se-implement`, each with a valid `agents.skills` path. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | REQ-AG-01 |

---

### Domain: CR — Cross-Review Mechanics

#### REQ-CR-01: AGENT_TO_SKILL Mapping Covers All 8 Role Agent IDs

| Attribute | Detail |
|-----------|--------|
| **Description** | The `SKILL_TO_AGENT` map in `cross-review-parser.ts` is the source of truth. `AGENT_TO_SKILL` is derived by reversing `SKILL_TO_AGENT` and must not be maintained independently. New forward entries must be added to `SKILL_TO_AGENT`: `"product-manager"` → `"pm-review"`, `"software-engineer"` → `"se-review"`, `"test-engineer"` → `"te-review"`. The existing entries for old agent IDs (`pm`, `eng`, `qa`, `fe`) in `SKILL_TO_AGENT` must be preserved so that `agentIdToSkillName("eng")` still returns `"engineer"` and `agentIdToSkillName("qa")` still returns `"test-engineer"` after the change. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** The updated `cross-review-parser.ts` **When:** `agentIdToSkillName("se-review")` is called **Then:** It returns `"software-engineer"`. `agentIdToSkillName("pm-review")` returns `"product-manager"`. `agentIdToSkillName("te-review")` returns `"test-engineer"`. `agentIdToSkillName("eng")` returns `"engineer"`. `agentIdToSkillName("qa")` returns `"test-engineer"`. `agentIdToSkillName("pm")` returns the existing mapped value. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-02: `crossReviewPath()` Supports Revision-Count Versioning

| Attribute | Detail |
|-----------|--------|
| **Description** | `crossReviewPath()` must accept an optional `revisionCount` parameter (1-indexed integer, minimum valid value is 1). When `revisionCount` is 1 or absent, the path has no version suffix (existing behavior). When `revisionCount ≥ 2`, the path appends `-v{revisionCount}` before `.md`. A `revisionCount` of 0 or negative is treated as 1 (no suffix, no error). Example: revision 1 → `CROSS-REVIEW-software-engineer-REQ.md`; revision 2 → `CROSS-REVIEW-software-engineer-REQ-v2.md`. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", 1)` **Then:** Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ.md`. **Given:** revision count 3 **Then:** Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ-v3.md`. **Given:** revision count 0 **Then:** Returns the unversioned path (same as revision 1). |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-03: `readCrossReviewRecommendation` Uses Versioned Path

| Attribute | Detail |
|-----------|--------|
| **Description** | The `ReadCrossReviewInput` type (in `temporal/types.ts`) must include an optional `revisionCount?: number` field (not `SkillActivityInput` — see REQ-NF-03 correction). The `readCrossReviewRecommendation` activity in `cross-review-activity.ts` must pass this field to `crossReviewPath()` to construct the correct versioned path. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A review phase on its second iteration (revisionCount = 2) **When:** `readCrossReviewRecommendation` is called with `{ ..., revisionCount: 2 }` **Then:** The activity reads `CROSS-REVIEW-{skill}-{DOC}-v2.md`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02 |

#### REQ-CR-04: `runReviewCycle` Passes Revision Count to Activities

| Attribute | Detail |
|-----------|--------|
| **Description** | `runReviewCycle()` in `feature-lifecycle.ts` must pass the current `reviewState.revisionCount + 1` (1-indexed) to both `invokeSkill` (so agents know which file name to write) and `readCrossReviewRecommendation` (so the orchestrator reads the correct version). Additionally, `runReviewCycle()` must update `reviewState.writtenVersions[agentId]` to the dispatched revision count after each reviewer invocation, so the optimizer context can enumerate all prior versions via REQ-CR-07. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A review phase on its third review round **When:** Reviewer agents are dispatched **Then:** `invokeSkill` input carries `revisionCount: 3`; `readCrossReviewRecommendation` is called with `revisionCount: 3`; `reviewState.writtenVersions[agentId]` is updated to 3 for each dispatched reviewer. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02, REQ-CR-03, REQ-NF-03 |

#### REQ-CR-05: Recommendation Parser Recognizes "Approved with Minor Issues"

| Attribute | Detail |
|-----------|--------|
| **Description** | Add `"approved with minor issues"` to `VALUE_MATCHERS` in `cross-review-parser.ts` as an `approved` outcome (alongside the existing `"approved with minor changes"`). The `mapRecommendationToStatus()` function in `feature-lifecycle.ts` is removed and all callers are migrated to use `parseRecommendation()` from `cross-review-parser.ts` as the single authoritative implementation. |
| **Acceptance Criteria** | **Who:** Recommendation parser **Given:** A cross-review file containing `Recommendation: Approved with Minor Issues` **When:** `parseRecommendation()` is called **Then:** Returns `{ status: "approved" }`. No code path in `feature-lifecycle.ts` calls `mapRecommendationToStatus()` after this change. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-06: Recommendation Parser Recognizes "Need Attention"

| Attribute | Detail |
|-----------|--------|
| **Description** | Add `"need attention"` to `VALUE_MATCHERS` as a `revision_requested` outcome. This entry is added to both `VALUE_MATCHERS` in `cross-review-parser.ts` and any remaining callers are migrated to the consolidated parser per REQ-CR-05. |
| **Acceptance Criteria** | **Who:** Recommendation parser **Given:** A cross-review file containing `Recommendation: Need Attention` **When:** `parseRecommendation()` is called **Then:** Returns `{ status: "revision_requested" }`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-05 |

#### REQ-CR-07: Optimizer Receives All Cross-Review Versions as Context

| Attribute | Detail |
|-----------|--------|
| **Description** | When dispatching the optimizer (author agent for revision), `runReviewCycle()` must include cross-review files from ALL reviewers (not only those with `revision_requested` status) and from ALL prior iterations, enumerated using `reviewState.writtenVersions[agentId]` (populated by REQ-CR-04). If a prior-iteration file does not exist on disk when building the context (e.g., the agent failed to write it), the missing file is silently skipped — it is excluded from the context list without causing a hard error or changing the workflow status. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** Round 2 revision with `pm-review` approving (writtenVersions["pm-review"] = 1) and `se-review` requesting revision (writtenVersions["se-review"] = 2) **When:** `pm-author` (optimizer) is dispatched for revision **Then:** Its context includes `CROSS-REVIEW-product-manager-REQ.md` (v1), `CROSS-REVIEW-software-engineer-REQ.md` (v1), and `CROSS-REVIEW-software-engineer-REQ-v2.md` (v2). **Given:** `CROSS-REVIEW-product-manager-REQ.md` does not exist on disk **When:** Building the context **Then:** It is excluded from the context list and no error is raised. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02, REQ-CR-04 |

---

### Domain: NF — Non-Functional

#### REQ-NF-01: Backward Compatibility for Existing Ptah Projects

| Attribute | Detail |
|-----------|--------|
| **Description** | Changes to `cross-review-parser.ts`, `feature-lifecycle.ts`, and `workflow-config.ts` must not break existing projects using the prior agent IDs (`pm`, `eng`, `qa`, `fe`) or the prior `revision_bound: 3` default. Existing `ptah.workflow.yaml` files continue to work unchanged. The old `SKILL_TO_AGENT` entries for `pm`, `eng`, `qa`, `fe` must be preserved (see REQ-CR-01). |
| **Acceptance Criteria** | **Who:** Existing Ptah user **Given:** An existing project with the old 3-agent config and `ptah.workflow.yaml` **When:** They upgrade Ptah to the new version **Then:** `ptah start` continues to operate. No migration step is required. `agentIdToSkillName("eng")` returns `"engineer"`. `agentIdToSkillName("qa")` returns `"test-engineer"`. `agentIdToSkillName("pm")` returns the existing mapped value. `agentIdToSkillName("fe")` returns the existing mapped value. Cross-review files written by old agents continue to be parsed correctly. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | None |

#### REQ-NF-02: `ptah run` Must Not Require Discord

| Attribute | Detail |
|-----------|--------|
| **Description** | `ptah run` must start the Temporal workflow and stream progress without requiring a Discord bot token or server ID. When the workflow reaches a `ROUTE_TO_USER` state (human-in-the-loop question) and `discord` config is absent, `ptah run` prints the question text to stdout and blocks execution, waiting for the engineer to provide input via stdin before resuming the workflow signal. When `discord` config is present, the question is routed to Discord as normal. |
| **Acceptance Criteria** | **Who:** Engineer with no Discord config **Given:** A `ptah.config.json` with no `discord` section **When:** They run `ptah run docs/my-feature/REQ-my-feature.md` **Then:** The workflow starts and runs. Progress appears on stdout. No Discord-related error is thrown. **When:** The workflow reaches a `ROUTE_TO_USER` state **Then:** The question text is printed to stdout and `ptah run` waits for stdin input before signalling the workflow to resume. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-01, US-06 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-NF-03: `ReadCrossReviewInput` and `SkillActivityInput` Carry `revisionCount`

| Attribute | Detail |
|-----------|--------|
| **Description** | Two type changes are required in `temporal/types.ts`: (1) `ReadCrossReviewInput` must include `revisionCount?: number` so `readCrossReviewRecommendation` constructs the versioned path (primary change needed for REQ-CR-03). (2) `SkillActivityInput` must also include `revisionCount?: number` so the `invokeSkill` activity can inject the expected cross-review output filename into the agent's context prompt — specifically, the context must include the line `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md` so the agent knows exactly where to write its output. |
| **Acceptance Criteria** | **Who:** Type system **Given:** `ReadCrossReviewInput` with `revisionCount: 2` **When:** `readCrossReviewRecommendation` runs **Then:** It reads from `CROSS-REVIEW-{skill}-{DOC}-v2.md`. **Given:** `SkillActivityInput` with `revisionCount: 2` **When:** The agent is invoked **Then:** The agent's context prompt contains `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}-v2.md`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-04 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-01 | Artifact-existence skip condition requires filesystem I/O inside the Temporal workflow determinism boundary | High | High | Implement as a new Temporal activity (`checkArtifactExists`) called at workflow start; store result in `FeatureWorkflowState.artifactExists` for use in `evaluateSkipCondition` (see REQ-WF-05) |
| R-02 | Changing `crossReviewPath()` signature breaks callers that do not pass `revisionCount` | Med | Med | Make `revisionCount` optional with default 1; existing callers work unchanged |
| R-03 | Agents writing cross-review files may not use the versioned file name if context is not explicit | Med | High | Pass the expected output file name as part of the `invokeSkill` context via `revisionCount` in `SkillActivityInput` (see REQ-NF-03); document the contract in skill stubs |
| R-04 | `ptah run` running alongside `ptah start` could create duplicate Temporal workflows for the same feature | Med | Med | REQ-CLI-06 formalizes this check: `ptah run` queries for running workflows before starting; exits with error if one is found |
| R-05 | `mapRecommendationToStatus()` parallel implementation diverges from `parseRecommendation()` over time | Med | Med | REQ-CR-05 requires removal of `mapRecommendationToStatus()` and consolidation to `parseRecommendation()` as the single parser |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 17 | REQ-CLI-01, REQ-CLI-02, REQ-CLI-04, REQ-WF-01, REQ-WF-02, REQ-WF-03, REQ-WF-05, REQ-WF-06, REQ-AG-01, REQ-AG-02, REQ-CR-01, REQ-CR-02, REQ-CR-03, REQ-CR-04, REQ-CR-05, REQ-CR-06, REQ-NF-01, REQ-NF-03 |
| P1 | 6 | REQ-CLI-03, REQ-CLI-05, REQ-CLI-06, REQ-WF-04, REQ-CR-07, REQ-NF-02 |

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| CLI — Command-Line Interface | 6 | REQ-CLI-01 through REQ-CLI-06 |
| WF — Workflow Configuration | 6 | REQ-WF-01 through REQ-WF-06 |
| AG — Agent Configuration | 2 | REQ-AG-01 through REQ-AG-02 |
| CR — Cross-Review Mechanics | 7 | REQ-CR-01 through REQ-CR-07 |
| NF — Non-Functional | 3 | REQ-NF-01 through REQ-NF-03 |

**Total: 24 requirements**

---

## 7. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Product Manager | Initial requirements document. 20 requirements across 5 domains. |
| 1.1 | April 22, 2026 | Product Manager | Added US-07 (workflow resume after Temporal data loss). Added REQ-CLI-04 (`--from-phase` flag, P0) and REQ-CLI-05 (artifact-based auto-detection, P1). Updated in-scope list, requirements summary. Total: 22 requirements. |
| 1.2 | April 22, 2026 | Product Manager | Addressed cross-review feedback from software-engineer (13 findings) and test-engineer (17 findings). Key changes: (1) Specified `SkipCondition` discriminated union and `checkArtifactExists` Activity contract with `FeatureWorkflowState.artifactExists` field (SE F-01, TE F-03). (2) Corrected REQ-NF-03 to target both `ReadCrossReviewInput` and `SkillActivityInput`; clarified `revisionCount` purpose for each (SE F-02). (3) Added `ReviewState.writtenVersions` field to track per-reviewer version history; specified missing-file behavior for REQ-CR-07 (SE F-03, TE F-05). (4) Clarified CLI-vs-workflow architectural boundary via A-05: CLI computes `startAtPhase`, workflow `skip_if` acts as safety net (SE F-04, TE Q-03). (5) Added REQ-WF-06 to fix `isCompletionReady()` sign-off agent derivation from workflow config (SE F-05). (6) Defined terminal states and exit codes in REQ-CLI-01 (TE F-01). (7) Specified canonical detection order, filename pattern, and gap-handling rule in REQ-CLI-05 (TE F-02). (8) Added explicit REQ-CR-04 → REQ-NF-03 dependency (TE F-04). (9) Added REQ-CLI-06 formalizing duplicate-workflow check from R-04 (SE F-07, TE F-17). (10) Specified polling mechanism (2s interval, deduplication) and finding-count derivation for REQ-CLI-03 (SE F-06, TE F-07). (11) Specified context injection contract for `revisionCount` in skill prompts (SE F-08). (12) Required removal of `mapRecommendationToStatus()` in REQ-CR-05 (SE F-09). (13) Specified empty-file error message for REQ-CLI-02 (TE F-06). (14) Clarified valid phase list is exhaustive (no `...`) in REQ-CLI-04 (TE F-08). (15) Clarified slug-consistency assumption in REQ-WF-01 (TE F-09). (16) Updated REQ-NF-01 AC with explicit old-agent regression cases (TE F-10). (17) Specified `revisionCount` ≤ 0 clamped to 1 in REQ-CR-02 (TE F-11). (18) Specified ROUTE_TO_USER stdin behavior in REQ-NF-02 (TE F-12). (19) Specified `revision_bound` missing = validation error in REQ-WF-04 (TE F-13). (20) Reproduced reviewer assignment matrix inline in REQ-WF-02 (TE F-14). (21) Specified missing-PROPERTIES soft-warning in REQ-WF-03 (TE F-15). (22) Added FILE_MANIFEST count note in REQ-AG-01 (TE F-16). (23) `AGENT_TO_SKILL` sourced from `SKILL_TO_AGENT` reversal (SE F-12). (24) `deriveDocumentType("properties-tests")` → `"PROPERTIES"` (SE F-13). Total: 24 requirements (+2 new: REQ-CLI-06, REQ-WF-06). |

---

*End of Document*
