# Requirements Document

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-021 |
| **Parent Document** | [orchestrate-dev SKILL.md](../../../.claude/skills/orchestrate-dev/SKILL.md) |
| **Version** | 1.1 |
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
- Optimizer context: include all cross-review files (not only those requesting revision) in revision dispatch context
- Stdout progress reporting in `ptah run` mode using orchestrate-dev format
- `req-creation` phase skipped when the REQ file already exists at workflow start

### 3.2 Out of Scope

- Changing Ptah's existing Discord-driven `ptah start` mode
- Implementing the `tech-lead` skill content itself (skill files are stubs; content is user responsibility)
- Implementing the `se-implement` or any other skill content
- Automatic prompting for human answers via stdin during `ptah run` (questions still route to Discord)
- Changing the Temporal workflow engine's parallel dispatch or merge mechanics
- Support for more than one active `ptah run` session per feature simultaneously

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The orchestrate-dev agent skill files already exist under `.claude/skills/`; Ptah only needs to reference them | If the skills don't exist, agents will fail at invocation — but that is a user configuration concern |
| A-02 | `featureLifecycleWorkflow` already supports `startAtPhase` correctly via `StartWorkflowParams` | If `startAtPhase` doesn't handle the skip-creation case cleanly, additional workflow logic is needed |
| A-03 | Agents write cross-review files at exactly the path `crossReviewPath()` produces | Agents must be given the expected path via context; otherwise they may write to different locations |
| A-04 | A Temporal server is running locally when `ptah run` executes | `ptah run` is a thin CLI wrapper over the same Temporal infrastructure as `ptah start` |

---

## 4. Requirements

### Domain: CLI — Command-Line Interface

#### REQ-CLI-01: `ptah run` Command

| Attribute | Detail |
|-----------|--------|
| **Description** | Add a `ptah run <req-path>` subcommand. It reads the REQ file at the given path, derives the feature slug from the path (e.g., `docs/in-progress/my-feature/REQ-my-feature.md` → `my-feature`), starts a Temporal `featureLifecycleWorkflow` with `startAtPhase: "req-review"`, streams progress to stdout in the orchestrate-dev format, and exits with code 0 on completion or 1 on failure. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A REQ file at `docs/in-progress/my-feature/REQ-my-feature.md` **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md` **Then:** A Temporal workflow starts for `my-feature` at phase `req-review`. Progress lines appear on stdout. The command exits when the workflow reaches a terminal state. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01, US-06 |
| **Dependencies** | None — builds on existing Temporal client infrastructure |

#### REQ-CLI-02: `ptah run` Validates REQ File Existence

| Attribute | Detail |
|-----------|--------|
| **Description** | Before starting the workflow, `ptah run` confirms the REQ file exists and is non-empty. If either condition fails, it prints an error message and exits with code 1 without starting a Temporal workflow. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A path that does not point to an existing file **When:** They run `ptah run docs/ghost-feature/REQ-ghost-feature.md` **Then:** The command prints `Error: REQ file not found: docs/ghost-feature/REQ-ghost-feature.md` and exits with code 1. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-03: `ptah run` Stdout Progress Reporting

| Attribute | Detail |
|-----------|--------|
| **Description** | During workflow execution, `ptah run` emits progress lines to stdout using the orchestrate-dev format. Each phase entry line includes the phase name and iteration number. Each reviewer result line includes the reviewer agent ID and recommendation (Approved ✅ or Need Attention with finding count). Phase transitions are marked with the gate result. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A running `ptah run` session **When:** Phase R iteration 1 completes with se-review approving and te-review requesting revision **Then:** stdout contains: `[Phase R — REQ Review] Iteration 1`, `  se-review:  Approved ✅`, `  te-review:  Need Attention (N findings)`, `[Phase R — REQ Review] pm-author addressing feedback...` |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-06 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-04: `ptah run` Accepts `--from-phase` Flag for Explicit Resume

| Attribute | Detail |
|-----------|--------|
| **Description** | `ptah run <req-path> --from-phase <phase-id>` starts the Temporal workflow with `startAtPhase` set to the given phase ID, bypassing both auto-detection and the default Phase R start. If the phase ID does not exist in the loaded workflow config, `ptah run` prints an error listing valid phase IDs and exits with code 1. This flag takes precedence over artifact-based auto-detection. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature whose TSPEC already exists but whose Temporal workflow was deleted **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md --from-phase plan-creation` **Then:** A new Temporal workflow starts at `plan-creation`, skipping all earlier phases. Given an invalid phase ID (e.g., `--from-phase nonexistent`), the command prints `Error: phase "nonexistent" not found. Valid phases: [req-creation, req-review, ...]` and exits with code 1. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-07 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-CLI-05: `ptah run` Auto-Detects Resume Phase from Existing Artifacts

| Attribute | Detail |
|-----------|--------|
| **Description** | When `--from-phase` is not provided, `ptah run` inspects the feature folder for existing document artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) and sets `startAtPhase` to the creation phase immediately following the last artifact found. The detection order follows the canonical PDLC sequence. If no artifacts beyond the REQ exist, the default start is `req-review` (Phase R). Auto-detection is logged to stdout so the engineer can confirm or override with `--from-phase`. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature folder containing `TSPEC-my-feature.md` but no `PLAN-my-feature.md` **When:** They run `ptah run docs/in-progress/my-feature/REQ-my-feature.md` **Then:** stdout prints `Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)` and the workflow starts at `plan-creation`. Given a folder with no artifacts beyond the REQ, the workflow starts at `req-review`. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-07 |
| **Dependencies** | REQ-CLI-01, REQ-WF-05 |

---

### Domain: WF — Workflow Configuration

#### REQ-WF-01: Default Workflow Starts at Phase R When REQ Exists

| Attribute | Detail |
|-----------|--------|
| **Description** | The `req-creation` phase in the default `ptah.workflow.yaml` must include a `skip_if` condition that evaluates to true when the REQ document already exists on disk. When skipped, the first executed phase is `req-review`. When the REQ does not exist, `req-creation` runs normally. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A feature folder containing `REQ-my-feature.md` **When:** A workflow starts for `my-feature` **Then:** The workflow begins at `req-review` without dispatching `pm-author` for creation. Given a feature folder with no REQ file, the workflow begins at `req-creation`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | A new `skip_if` field type: `field: artifact.exists`, `artifact: "REQ"` — see REQ-WF-05 |

#### REQ-WF-02: Default Workflow Uses Orchestrate-Dev 8-Role Agent IDs

| Attribute | Detail |
|-----------|--------|
| **Description** | The default `ptah.workflow.yaml` produced by `ptah init` must reference the 8 orchestrate-dev agent IDs with reviewer assignments matching the Reviewer Assignment Matrix in `orchestrate-dev/SKILL.md`: REQ Review (`se-review`, `te-review`); FSPEC Review (`se-review`, `te-review`); TSPEC Review (`pm-review`, `te-review`); PLAN Review (`pm-review`, `te-review`); PROPERTIES Review (`pm-review`, `se-review`); Implementation: `tech-lead`; Properties Tests: `se-implement`; Final Codebase Review (`pm-review`, `te-review`). |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs **Then:** `ptah.workflow.yaml` contains phases whose `agent` and `reviewers` fields exactly match the orchestrate-dev Reviewer Assignment Matrix. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | REQ-AG-01 |

#### REQ-WF-03: Default Workflow Includes PROPERTIES Tests Phase

| Attribute | Detail |
|-----------|--------|
| **Description** | The default `ptah.workflow.yaml` must include a `properties-tests` phase (type: `creation`, agent: `se-implement`) positioned between the `implementation` phase and `implementation-review`. Context documents: `{feature}/REQ`, `{feature}/TSPEC`, `{feature}/PLAN`, `{feature}/PROPERTIES`. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs and the implementation phase completes **Then:** The workflow advances to a `properties-tests` phase dispatching `se-implement`. Only after `properties-tests` completes does the workflow advance to `implementation-review`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-04 |
| **Dependencies** | REQ-WF-02 |

#### REQ-WF-04: Default Revision Bound Is 5

| Attribute | Detail |
|-----------|--------|
| **Description** | All review phases in the default `ptah.workflow.yaml` must have `revision_bound: 5`. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** A freshly-initialized project **When:** `ptah init` runs **Then:** Every review phase entry in `ptah.workflow.yaml` contains `revision_bound: 5`. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-05 |
| **Dependencies** | None |

#### REQ-WF-05: Skip Condition Supports Artifact Existence Check

| Attribute | Detail |
|-----------|--------|
| **Description** | The `skip_if` schema in `PhaseDefinition` must support a new field type: `{ field: "artifact.exists", artifact: "<DOC_TYPE>" }` that evaluates to true when the named document (e.g., `REQ-{slug}.md`) exists on disk in the feature folder. The `evaluateSkipCondition()` function (or a new helper) must implement this check by calling the filesystem service. |
| **Acceptance Criteria** | **Who:** Workflow engine **Given:** A phase with `skip_if: { field: "artifact.exists", artifact: "REQ" }` **When:** `REQ-my-feature.md` exists in the feature folder **Then:** `evaluateSkipCondition()` returns true and the phase is skipped. When the file does not exist, it returns false and the phase runs. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-01 |
| **Dependencies** | None |

---

### Domain: AG — Agent Configuration

#### REQ-AG-01: `ptah init` Scaffolds 8 Orchestrate-Dev Skill Files

| Attribute | Detail |
|-----------|--------|
| **Description** | The `FILE_MANIFEST` in `defaults.ts` must include stub skill files for all 8 orchestrate-dev agents under `ptah/skills/`: `pm-author.md`, `pm-review.md`, `se-author.md`, `se-review.md`, `te-author.md`, `te-review.md`, `tech-lead.md`, `se-implement.md`. Each stub includes a comment directing the user to populate the skill prompt. |
| **Acceptance Criteria** | **Who:** Engineer **Given:** An empty project directory **When:** `ptah init` runs **Then:** All 8 skill stub files exist under `ptah/skills/`. |
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
| **Description** | The `AGENT_TO_SKILL` mapping in `cross-review-parser.ts` must include entries for all reviewer role agents: `pm-review` → `"product-manager"`, `se-review` → `"software-engineer"`, `te-review` → `"test-engineer"`. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A review phase using `pm-review`, `se-review`, `te-review` **When:** `agentIdToSkillName("se-review")` is called **Then:** It returns `"software-engineer"`. Same for `pm-review` → `"product-manager"` and `te-review` → `"test-engineer"`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-02: `crossReviewPath()` Supports Revision-Count Versioning

| Attribute | Detail |
|-----------|--------|
| **Description** | `crossReviewPath()` must accept an optional `revisionCount` parameter (1-indexed). When `revisionCount` is 1 or absent, the path has no version suffix (existing behavior). When `revisionCount ≥ 2`, the path appends `-v{revisionCount}` before `.md`. Example: revision 1 → `CROSS-REVIEW-software-engineer-REQ.md`; revision 2 → `CROSS-REVIEW-software-engineer-REQ-v2.md`. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** `crossReviewPath("docs/in-progress/f/", "software-engineer", "REQ", 1)` **Then:** Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ.md`. **Given:** revision count 3 **Then:** Returns `docs/in-progress/f/CROSS-REVIEW-software-engineer-REQ-v3.md`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-03: `readCrossReviewRecommendation` Uses Versioned Path

| Attribute | Detail |
|-----------|--------|
| **Description** | The `ReadCrossReviewInput` type and the `readCrossReviewRecommendation` activity must accept a `revisionCount` field so the activity reads from the correctly versioned file path produced by `crossReviewPath()`. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A review phase on its second iteration (revisionCount = 2) **When:** `readCrossReviewRecommendation` is called with `{ ..., revisionCount: 2 }` **Then:** The activity reads `CROSS-REVIEW-{skill}-{DOC}-v2.md`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02 |

#### REQ-CR-04: `runReviewCycle` Passes Revision Count to Activities

| Attribute | Detail |
|-----------|--------|
| **Description** | `runReviewCycle()` in `feature-lifecycle.ts` must pass the current `reviewState.revisionCount + 1` (1-indexed) to both `invokeSkill` (so agents know which file name to write) and `readCrossReviewRecommendation` (so the orchestrator reads the correct version). |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** A review phase on its third review round **When:** Reviewer agents are dispatched **Then:** `invokeSkill` input carries `revisionCount: 3`; `readCrossReviewRecommendation` is called with `revisionCount: 3`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02, REQ-CR-03 |

#### REQ-CR-05: Recommendation Parser Recognizes "Approved with Minor Issues"

| Attribute | Detail |
|-----------|--------|
| **Description** | Add `"approved with minor issues"` to `VALUE_MATCHERS` in `cross-review-parser.ts` as an `approved` outcome (alongside the existing `"approved with minor changes"`). |
| **Acceptance Criteria** | **Who:** Recommendation parser **Given:** A cross-review file containing `Recommendation: Approved with Minor Issues` **When:** `parseRecommendation()` is called **Then:** Returns `{ status: "approved" }`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-06: Recommendation Parser Recognizes "Need Attention"

| Attribute | Detail |
|-----------|--------|
| **Description** | Add `"need attention"` to `VALUE_MATCHERS` as a `revision_requested` outcome. |
| **Acceptance Criteria** | **Who:** Recommendation parser **Given:** A cross-review file containing `Recommendation: Need Attention` **When:** `parseRecommendation()` is called **Then:** Returns `{ status: "revision_requested" }`. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | None |

#### REQ-CR-07: Optimizer Receives All Cross-Review Versions as Context

| Attribute | Detail |
|-----------|--------|
| **Description** | When dispatching the optimizer (author agent for revision), `runReviewCycle()` must include cross-review files from ALL reviewers (not only those with `revision_requested` status) and from ALL prior iterations (all version suffixes from v1 through the current round). This matches the orchestrate-dev directive: "The optimizer always reads ALL versions before addressing feedback." |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** Round 2 revision with `pm-review` approving and `se-review` requesting revision **When:** `pm-author` (optimizer) is dispatched for revision **Then:** Its context includes both `CROSS-REVIEW-product-manager-REQ.md` (v1) and `CROSS-REVIEW-software-engineer-REQ.md` (v1) AND `CROSS-REVIEW-software-engineer-REQ-v2.md` (v2). |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-02, REQ-CR-04 |

---

### Domain: NF — Non-Functional

#### REQ-NF-01: Backward Compatibility for Existing Ptah Projects

| Attribute | Detail |
|-----------|--------|
| **Description** | Changes to `cross-review-parser.ts`, `feature-lifecycle.ts`, and `workflow-config.ts` must not break existing projects using the prior agent IDs (`pm`, `eng`, `qa`, `fe`) or the prior `revision_bound: 3` default. Existing `ptah.workflow.yaml` files continue to work unchanged. |
| **Acceptance Criteria** | **Who:** Existing Ptah user **Given:** An existing project with the old 3-agent config and `ptah.workflow.yaml` **When:** They upgrade Ptah to the new version **Then:** `ptah start` continues to operate. No migration step is required. Cross-review files written by old agents (`engineer`, `test-engineer`) continue to be parsed correctly. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-02 |
| **Dependencies** | None |

#### REQ-NF-02: `ptah run` Must Not Require Discord

| Attribute | Detail |
|-----------|--------|
| **Description** | `ptah run` must start the Temporal workflow and stream progress without requiring a Discord bot token or server ID. Agent invocations, progress reporting, and phase transitions all work in headless mode. Human-in-the-loop questions are surfaced via stdout and routed to Discord only when `discord` config is present. |
| **Acceptance Criteria** | **Who:** Engineer with no Discord config **Given:** A `ptah.config.json` with no `discord` section **When:** They run `ptah run docs/my-feature/REQ-my-feature.md` **Then:** The workflow starts and runs. Progress appears on stdout. No Discord-related error is thrown. |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source Stories** | US-01, US-06 |
| **Dependencies** | REQ-CLI-01 |

#### REQ-NF-03: `SkillActivityInput` Carries `revisionCount`

| Attribute | Detail |
|-----------|--------|
| **Description** | The `SkillActivityInput` type in `temporal/types.ts` must include an optional `revisionCount?: number` field. This allows the `invokeSkill` activity to pass the revision count to the agent's context so the agent knows which file name to write for the cross-review output. |
| **Acceptance Criteria** | **Who:** Type system **Given:** A `SkillActivityInput` with `revisionCount: 2` **When:** The agent is invoked **Then:** The agent's context includes the expected cross-review file name (`CROSS-REVIEW-{skill}-{DOC}-v2.md`) so it knows where to write its output. |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source Stories** | US-03 |
| **Dependencies** | REQ-CR-04 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-01 | Artifact-existence skip condition requires filesystem I/O inside the Temporal workflow determinism boundary | High | High | Implement as a new Temporal activity (`checkArtifactExists`) called at workflow start; store result in workflow state for use in `evaluateSkipCondition` |
| R-02 | Changing `crossReviewPath()` signature breaks callers that do not pass `revisionCount` | Med | Med | Make `revisionCount` optional with default 1; existing callers work unchanged |
| R-03 | Agents writing cross-review files may not use the versioned file name if context is not explicit | Med | High | Pass the expected output file name as part of the `invokeSkill` context; document the contract in skill stubs |
| R-04 | `ptah run` running alongside `ptah start` could create duplicate Temporal workflows for the same feature | Med | Med | `ptah run` checks for an existing running workflow before starting; exits with error if one is found |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 15 | REQ-CLI-01, REQ-CLI-02, REQ-CLI-04, REQ-WF-01, REQ-WF-02, REQ-WF-03, REQ-WF-05, REQ-AG-01, REQ-AG-02, REQ-CR-01, REQ-CR-02, REQ-CR-03, REQ-CR-04, REQ-CR-05, REQ-CR-06, REQ-NF-01, REQ-NF-03 |
| P1 | 5 | REQ-CLI-03, REQ-CLI-05, REQ-WF-04, REQ-CR-07, REQ-NF-02 |

> Note: P0 count listed as 15; the full set is 17 entries (some IDs span both groups above).

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| CLI — Command-Line Interface | 5 | REQ-CLI-01 through REQ-CLI-05 |
| WF — Workflow Configuration | 5 | REQ-WF-01 through REQ-WF-05 |
| AG — Agent Configuration | 2 | REQ-AG-01 through REQ-AG-02 |
| CR — Cross-Review Mechanics | 7 | REQ-CR-01 through REQ-CR-07 |
| NF — Non-Functional | 3 | REQ-NF-01 through REQ-NF-03 |

**Total: 22 requirements**

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

---

*End of Document*
