# Requirements Document

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-FLF |
| **Parent Document** | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 2.2 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Reorganize the `docs/` directory from a flat list of numbered feature folders into a lifecycle-based structure with three top-level folders: `backlog/`, `in-progress/`, and `completed/`. This change makes the state of every feature immediately visible from the folder structure and eliminates the need to open individual documents to determine feature status.

All four Claude skills (product-manager, engineer, tech-lead, test-engineer) and the Ptah orchestrator code reference `docs/{NNN}-{feature-name}/` paths. These references must be updated to resolve feature folders under the correct lifecycle subfolder.

**Key design decision:** Features are **unnumbered** in both `backlog/` and `in-progress/`. They receive a sequential NNN prefix only when promoted to `completed/`. This keeps active work lightweight (no number coordination needed) and assigns permanent ordering only to finished work.

---

## 2. User Scenarios

### US-01: Product Manager Creates a New Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | A product manager invokes the PM skill to create a new feature. The feature folder and overview.md are created inside `docs/backlog/` without a numeric prefix. |
| **Goals** | New features land in backlog automatically. No manual folder management required. |
| **Pain points** | Today, every new feature gets a NNN prefix immediately, which forces coordination on numbering even for speculative features that may never be built. All features sit in a flat list regardless of status. |
| **Key needs** | PM skill creates feature folders under `docs/backlog/{feature-slug}/`. No NNN prefix at creation time. |

### US-02: Engineer Starts Working on a Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | An engineer (or tech-lead) begins reviewing a REQ document. Before the review starts, the feature folder is moved from `docs/backlog/{feature-slug}/` to `docs/in-progress/{feature-slug}/`. No NNN prefix is assigned — the feature remains unnumbered. |
| **Goals** | Active work is clearly separated from backlog. The `in-progress/` folder contains only features being actively developed. |
| **Pain points** | Today there is no structural distinction between a feature that is being actively worked on and one that is just a backlog idea. |
| **Key needs** | Automated or skill-triggered promotion from backlog to in-progress. All internal document references update to the new path. |

### US-03: Feature Completes the Lifecycle

| Attribute | Detail |
|-----------|--------|
| **Description** | After test-engineer and product-manager sign off on a feature, the feature folder is moved from `docs/in-progress/{feature-slug}/` to `docs/completed/{NNN}-{feature-slug}/`. The NNN prefix is assigned at this point, reflecting completion order. Document filenames within the folder are also prefixed with NNN (e.g., `REQ-{feature}.md` → `{NNN}-REQ-{feature}.md`). |
| **Goals** | Completed features are archived with a permanent ordering number. The `in-progress/` folder only contains actively worked features. |
| **Pain points** | Today, completed features (e.g., 001-init through 015-temporal-foundation) sit alongside in-progress and speculative features in the same flat list. |
| **Key needs** | Automated or skill-triggered promotion from in-progress to completed with NNN assignment. All skills can still find completed feature docs when needed for cross-reference. |

### US-04: Developer Browses Feature Status

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer (or any team member) looks at the `docs/` folder to quickly understand what features exist, which are in progress, and which are done. |
| **Goals** | Feature status is immediately visible from the directory structure — no need to open any files. |
| **Pain points** | Today, `docs/` contains 18+ numbered folders with no indication of status. You must open individual files or check git history to determine if a feature is speculative, active, or completed. |
| **Key needs** | Three clearly named top-level folders. Feature folders nested under the folder matching their lifecycle state. |

### US-05: Skill Reads or Writes Feature Artifacts

| Attribute | Detail |
|-----------|--------|
| **Description** | Any Claude skill (PM, engineer, tech-lead, test-engineer) needs to read or write artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES, CROSS-REVIEW files) for a feature. The skill must resolve the feature folder regardless of which lifecycle folder it's in. |
| **Goals** | Skills can locate feature folders without hardcoding which lifecycle folder a feature is in. Path resolution is consistent across all skills. |
| **Pain points** | Today, skills assume `docs/{NNN}-{feature-name}/`. With lifecycle folders, the same feature could be in `docs/backlog/`, `docs/in-progress/`, or `docs/completed/` depending on its state. |
| **Key needs** | A feature resolution mechanism — given a feature slug, find its folder across the three lifecycle directories. Skills updated to use resolved paths. |

### US-06: Multiple Skills Run in Parallel Without Conflict

| Attribute | Detail |
|-----------|--------|
| **Description** | Two or more Claude skill agents are dispatched in parallel on the same feature branch (e.g., engineer writing a TSPEC while test-engineer reads the REQ). Each agent must read and write files without interfering with the other or with the main working tree. |
| **Goals** | Parallel execution is safe. No agent clobbers another agent's uncommitted work or leaves the main working tree in a dirty state. |
| **Pain points** | Today, all skill invocations operate in the main working tree. If two agents run simultaneously, their file writes and `git` commands can interleave, producing corrupt commits or lost files. |
| **Key needs** | Each skill invocation runs in its own isolated git worktree so that concurrent agents operate on independent filesystem paths. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The `docs/` directory only contains feature folders, `requirements/`, `templates/`, `open-questions/`, and standalone files. No other subdirectory conventions exist. | If other conventions exist, migration may break them. |
| A-02 | All existing features (001–015) on `main` are considered "completed" — they have been implemented and merged. | If some are still in progress, they would be incorrectly classified during migration. |
| A-03 | Feature numbering (NNN) is purely for ordering and does not carry semantic meaning beyond completion order. | If numbers encode priority or dependency info, renumbering on completion would lose that data. |
| A-04 | The `requirements/`, `templates/`, and `open-questions/` folders remain at `docs/` root — they are not feature-specific. | If they should also move, the scope expands significantly. |
| A-05 | Document filenames within a feature folder mirror the folder's naming convention — unnumbered in backlog/in-progress, NNN-prefixed in completed. | If filenames should always stay unnumbered, the rename-on-completion logic is unnecessary. |
| A-06 | A single feature resolver service exists in the Ptah orchestrator. All path resolution for feature folders goes through this service — skills and orchestrator activities do not independently search lifecycle folders. | If resolution is duplicated across modules, inconsistencies will emerge when search order or folder conventions change. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | All four skill files (`.claude/skills/*/SKILL.md`) must be updated in a coordinated change — partial updates would break skills that still assume the old path structure. | Skill architecture |
| C-02 | Ptah orchestrator source code (`ptah/src/`) references `docs/` paths in at least three locations that must be updated: (1) `ptah/src/orchestrator/pdlc/cross-review-parser.ts:159` — returns a `docs/${featureSlug}/CROSS-REVIEW-...` string; (2) `ptah/src/temporal/workflows/feature-lifecycle.ts:1076` — maps agent IDs to `docs/${state.featureSlug}/CROSS-REVIEW-...`; (3) `ptah/src/temporal/workflows/feature-lifecycle.ts:66-71` — comment block documenting old `docs/{prefix}-{slug}/` path conventions. All three must be updated alongside the skill changes. | Codebase |
| C-03 | Existing features must be migrated to the new folder structure without breaking git history traceability (i.e., use `git mv`). | Development workflow |
| C-04 | The main working tree must never be modified by a skill invocation. All skill file reads and writes occur within the skill's assigned worktree. The main working tree is used only by the developer and by the orchestrator's one-time migration script. | Isolation architecture |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| Folder structure | All feature folders are in the correct lifecycle subfolder | `ls docs/{backlog,in-progress,completed}` | 0 features organized | 100% of features organized |
| Skill compatibility | All skills correctly resolve feature paths | Invoke each skill and verify artifact read/write | Skills assume flat `docs/` | Skills resolve across lifecycle folders |
| Feature promotion (backlog→in-progress) | Promotion moves folder without assigning NNN | Trigger a review on a backlog feature | N/A | Feature appears in `in-progress/` without NNN prefix |
| Feature completion (in-progress→completed) | Promotion moves folder and assigns NNN | Sign off on a feature | N/A | Feature appears in `completed/` with NNN prefix and files renamed |
| Parallel skill isolation | Two skills running concurrently on the same branch do not conflict | Run engineer + test-engineer skills simultaneously; verify no merge conflicts or lost files | Skills share the main working tree | Each skill operates in its own worktree; commits land cleanly |

---

## 5. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| FS | Folder Structure |
| PR | Promotion (lifecycle transitions) |
| SK | Skill Updates |
| MG | Migration |
| WT | Worktree Isolation |

### 5.1 Folder Structure (FS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-FS-01 | Top-level lifecycle folders | The `docs/` directory must contain exactly three feature-lifecycle folders at its root: `backlog/`, `in-progress/`, and `completed/`. Non-feature directories (`requirements/`, `templates/`, `open-questions/`) and standalone files remain at the `docs/` root. | WHO: As a developer GIVEN: The docs/ directory exists WHEN: I list the contents of docs/ THEN: I see `backlog/`, `in-progress/`, `completed/`, plus `requirements/`, `templates/`, `open-questions/`, and any standalone files | P0 | 1 | [US-04] | — |
| REQ-FS-02 | Backlog features are unnumbered | Feature folders in `docs/backlog/` must NOT have a NNN numeric prefix. The folder name is the feature slug only (e.g., `docs/backlog/feature-lifecycle-folders/`). Document filenames within the folder are also unnumbered (e.g., `REQ-feature-lifecycle-folders.md`). | WHO: As a product manager GIVEN: I create a new feature WHEN: The feature folder is created in backlog THEN: The folder name is `{feature-slug}` with no numeric prefix and document filenames have no NNN prefix | P0 | 1 | [US-01] | [REQ-FS-01] |
| REQ-FS-03 | In-progress features are unnumbered | Feature folders in `docs/in-progress/` must NOT have a NNN numeric prefix. The folder name is the feature slug only (e.g., `docs/in-progress/agent-coordination/`). Document filenames within the folder are also unnumbered (e.g., `REQ-agent-coordination.md`). | WHO: As a developer GIVEN: A feature has been promoted to in-progress WHEN: I list the contents of `docs/in-progress/` THEN: Each feature folder has no numeric prefix, only the feature slug | P0 | 1 | [US-02] | [REQ-FS-01] |
| REQ-FS-04 | Completed features are numbered | Feature folders in `docs/completed/` have a NNN numeric prefix assigned at completion time (e.g., `docs/completed/015-temporal-foundation/`). Document filenames within the folder are also NNN-prefixed (e.g., `015-REQ-temporal-foundation.md`). | WHO: As a developer GIVEN: A feature has been promoted to completed WHEN: I list the contents of `docs/completed/` THEN: Each feature folder has a zero-padded 3-digit prefix and document filenames match | P0 | 1 | [US-03] | [REQ-FS-01] |

### 5.2 Promotion — Lifecycle Transitions (PR)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PR-01 | Backlog to in-progress promotion | When a feature transitions from backlog to in-progress (triggered when an engineer or tech-lead begins reviewing the REQ document), the feature folder must be moved from `docs/backlog/{feature-slug}/` to `docs/in-progress/{feature-slug}/`. No NNN prefix is assigned. The folder and file names remain unchanged. | WHO: As an engineer GIVEN: A feature exists in `docs/backlog/{feature-slug}/` WHEN: I start reviewing the REQ document THEN: The folder is moved to `docs/in-progress/{feature-slug}/` with no NNN prefix — folder and file names are unchanged | P0 | 1 | [US-02] | [REQ-FS-01], [REQ-FS-02], [REQ-FS-03] |
| REQ-PR-02 | In-progress to completed promotion | When a feature is signed off by both the test-engineer and product-manager, the feature folder must be moved from `docs/in-progress/{feature-slug}/` to `docs/completed/{NNN}-{feature-slug}/`. The NNN prefix is assigned at this point. All document filenames within the folder must also be prefixed with NNN (e.g., `REQ-{feature}.md` → `{NNN}-REQ-{feature}.md`). | WHO: As a product manager GIVEN: Both test-engineer and product-manager have signed off WHEN: The final sign-off is recorded THEN: The folder is moved to `docs/completed/{NNN}-{feature-slug}/` and all document files are renamed with the NNN prefix | P0 | 1 | [US-03] | [REQ-FS-01], [REQ-FS-04] |
| REQ-PR-03 | NNN assignment uses global max at completion | The NNN assigned during in-progress→completed promotion must be globally unique. It is calculated as `max(NNN across completed/) + 1`, zero-padded to 3 digits. If no numbered folders exist in `completed/`, the first NNN is `001`. | WHO: As a system GIVEN: Multiple features have been completed over time WHEN: A new feature is promoted to completed THEN: Its NNN is one greater than the highest NNN found in the `completed/` folder | P0 | 1 | [US-03] | [REQ-PR-02] |
| REQ-PR-04 | Internal document references update on promotion to completed | When a feature is promoted to `completed/` and document filenames are NNN-prefixed, any same-folder markdown link that references a renamed file must be updated. **In scope:** markdown link patterns `[text](filename.md)` and `[text](./filename.md)` where the target filename matches a file being renamed in the same feature folder. **Out of scope:** cross-feature references (links pointing to files in other feature folders), bare filename mentions in prose, and absolute paths. This scanning and updating is performed as part of the completion promotion activity in the orchestrator. The backlog→in-progress promotion requires no reference updates because no files are renamed. | WHO: As a developer GIVEN: A feature folder has been promoted to completed WHEN: I open any document in the feature folder THEN: All same-folder markdown links in the formats `[text](filename.md)` and `[text](./filename.md)` resolve correctly to the NNN-prefixed filenames | P1 | 1 | [US-03] | [REQ-PR-02], [REQ-SK-08] |
| REQ-PR-05 | Promotion uses git mv | Feature folder moves between lifecycle folders must use `git mv` to preserve git history tracking. This applies to both the folder move and any file renames during completion promotion. | WHO: As a developer GIVEN: A feature is being promoted WHEN: The folder is moved (and files renamed for completion) THEN: `git log --follow` on files in the new location shows the full history from the original location | P0 | 1 | [US-02], [US-03] | [REQ-PR-01], [REQ-PR-02] |

### 5.3 Skill Updates (SK)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-SK-01 | PM skill creates features in backlog | The product-manager skill's Phase 0 (Feature Folder Bootstrap) must create new feature folders under `docs/backlog/{feature-slug}/` instead of `docs/{NNN}-{feature-slug}/`. It must NOT assign a NNN prefix at creation time. Document filenames are unnumbered (e.g., `REQ-{feature-slug}.md`). | WHO: As a product manager GIVEN: I invoke the PM skill for a new feature WHEN: Phase 0 runs THEN: The feature folder is created at `docs/backlog/{feature-slug}/` without a NNN prefix and document filenames are unnumbered | P0 | 1 | [US-01] | [REQ-FS-01], [REQ-FS-02] |
| REQ-SK-02 | All skills resolve feature paths across lifecycle folders | All four skills (PM, engineer, tech-lead, test-engineer) must be able to locate a feature folder by its slug via the feature resolver service, which searches `in-progress/`, `backlog/`, and `completed/` directories in that order. For `completed/`, the search must strip the NNN prefix when comparing slugs (e.g., matching slug `temporal-foundation` to folder `015-temporal-foundation`). If the same slug is found in more than one lifecycle folder simultaneously (invariant violation), the resolver must log a warning and return the first match according to search order — it must not throw an error. | WHO: As any Claude skill GIVEN: A feature with slug `{feature-slug}` exists in one of the lifecycle folders WHEN: The skill needs to read or write artifacts for that feature THEN: The skill resolves the correct full path regardless of which lifecycle folder the feature is in; if the slug exists in multiple folders, a warning is logged and the highest-priority match is returned | P0 | 1 | [US-05] | [REQ-FS-01] |
| REQ-SK-03 | Engineer/tech-lead skill triggers backlog→in-progress promotion | When the engineer or tech-lead skill begins reviewing a REQ document for a feature that is currently in `docs/backlog/`, the skill must promote the feature to `docs/in-progress/` before proceeding with the review. No NNN prefix is assigned during this promotion. | WHO: As an engineer GIVEN: A feature is in `docs/backlog/{feature-slug}/` WHEN: I start a review task on this feature THEN: The feature is promoted to `docs/in-progress/{feature-slug}/` before my review artifacts are created | P0 | 1 | [US-02] | [REQ-PR-01], [REQ-SK-02] |
| REQ-SK-04 | Completion promotion on sign-off | When the final sign-off occurs (both test-engineer and product-manager have approved), the responsible skill (or orchestrator) must promote the feature folder from `docs/in-progress/` to `docs/completed/`, assigning the next available NNN prefix and renaming document files accordingly. | WHO: As a product manager or test-engineer GIVEN: Both sign-offs are recorded WHEN: The final sign-off is given THEN: The feature is moved to `docs/completed/{NNN}-{feature-slug}/` with files renamed to `{NNN}-{doctype}-{feature-slug}.md` | P0 | 1 | [US-03] | [REQ-PR-02], [REQ-SK-02] |
| REQ-SK-05 | File Organization section updated in all skills | The File Organization section of each SKILL.md must document the new `docs/` structure showing `backlog/`, `in-progress/`, and `completed/` subfolders, and clarify that features are unnumbered until completion. | WHO: As a skill developer GIVEN: The SKILL.md files are updated WHEN: I read the File Organization section THEN: The documented structure shows `docs/backlog/` (unnumbered), `docs/in-progress/` (unnumbered), and `docs/completed/` (NNN-prefixed) | P0 | 1 | [US-05] | [REQ-FS-01] |
| REQ-SK-06 | Feature resolver service with defined behavioral contract | A single feature resolver service must exist in the Ptah orchestrator. Its behavioral contract: given a feature slug as input, it searches `in-progress/`, `backlog/`, and `completed/` directories in that order and returns the full resolved folder path. For `completed/`, it matches by stripping the NNN prefix from folder names. If the slug is not found in any folder, it returns a not-found signal (not an error). If the slug is found in multiple folders simultaneously, it logs a warning and returns the first match. All orchestrator activities and code paths that need a feature folder path must call this service — no module may construct lifecycle-based paths independently. | WHO: As a Ptah orchestrator activity GIVEN: I need the folder path for feature slug `{feature-slug}` WHEN: I call the feature resolver service with `{feature-slug}` THEN: I receive the resolved full path (e.g., `docs/in-progress/agent-coordination/`) or a not-found signal; the service never throws on a missing feature | P0 | 1 | [US-05] | [REQ-FS-01], [REQ-SK-02] |
| REQ-SK-07 | Resolved feature path stored in workflow state | Once the feature resolver service resolves a feature path for a given workflow run, the resolved path must be stored in the workflow state object and reused by all subsequent activities in that run. Activities must not re-invoke the resolver independently — they must read the path from state. This ensures that hard-coded inline path expressions (such as `docs/${state.featureSlug}/CROSS-REVIEW-...`) are replaced with expressions that read from the pre-resolved path in state. | WHO: As a Ptah workflow GIVEN: The feature has been resolved at the start of a workflow run WHEN: Any subsequent activity in the same run needs the feature folder path THEN: The activity reads the resolved path from workflow state, not by calling the resolver again | P0 | 1 | [US-05] | [REQ-SK-06] |
| REQ-SK-08 | Orchestrator executes promotions; skills signal intent | Promotion execution (running `git mv` and committing the result) is performed exclusively by the Ptah orchestrator via a dedicated promotion activity — not by Claude skill agents. Claude skill agents are responsible only for detecting that a promotion is needed (e.g., finding the feature in `backlog/` when starting an in-progress task) and signalling this intent to the orchestrator. For backlog→in-progress promotion, the orchestrator runs the promotion activity before invoking the skill. For in-progress→completed promotion, the orchestrator detects that both the test-engineer and product-manager have emitted sign-off routing signals within the same workflow run, then runs the completion promotion activity. | WHO: As the Ptah orchestrator GIVEN: A skill has signalled that a feature in `backlog/` needs promotion WHEN: The orchestrator prepares to invoke the skill THEN: The orchestrator runs the promotion activity (git mv + commit) before the skill executes; WHO: As the Ptah orchestrator GIVEN: Both sign-off routing signals have been received in the current workflow run WHEN: The final sign-off is detected THEN: The orchestrator runs the completion promotion activity (git mv + NNN assignment + file rename + commit) | P0 | 1 | [US-02], [US-03] | [REQ-PR-01], [REQ-PR-02], [REQ-SK-06] |

### 5.4 Migration (MG)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-MG-01 | Create lifecycle folders | The three lifecycle folders (`docs/backlog/`, `docs/in-progress/`, `docs/completed/`) must be created. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/` THEN: `backlog/`, `in-progress/`, and `completed/` directories exist | P0 | 1 | [US-04] | — |
| REQ-MG-02 | Migrate completed features | All existing feature folders on `main` that represent completed, implemented features (001-init through 015-temporal-foundation) must be moved to `docs/completed/` using `git mv`, preserving their NNN prefix. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/completed/` THEN: All historically completed features are present with their original NNN prefixes | P0 | 1 | [US-03], [US-04] | [REQ-MG-01] |
| REQ-MG-03 | Migrate in-progress features | Any existing feature folders that are currently in active development (have REQ documents but are not yet signed off) must be moved to `docs/in-progress/` using `git mv`. If they currently have NNN prefixes, the NNN prefix must be removed from both the folder name and document filenames to match the unnumbered in-progress convention. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/in-progress/` THEN: All currently active features are present without NNN prefixes | P0 | 1 | [US-02], [US-04] | [REQ-MG-01] |
| REQ-MG-04 | Non-feature directories stay at root | `docs/requirements/`, `docs/templates/`, `docs/open-questions/`, and standalone files (e.g., FEASIBILITY docs, PTAH_PRD) must remain at the `docs/` root — they are not moved into lifecycle folders. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/` THEN: `requirements/`, `templates/`, `open-questions/`, and standalone files are still at the root level | P0 | 1 | [US-04] | [REQ-MG-01] |

### 5.5 Worktree Isolation (WT)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-WT-01 | Each skill invocation runs in a dedicated git worktree | Every Claude skill invocation (PM, engineer, tech-lead, test-engineer) must execute within a git worktree created specifically for that invocation. The worktree is checked out on the feature branch. The skill reads and writes all artifacts within the worktree — it never touches the main working tree. | WHO: As the Ptah orchestrator GIVEN: A skill is about to be invoked WHEN: The orchestrator prepares the execution environment THEN: A new git worktree is created for the feature branch, and the skill's working directory is set to that worktree root | P0 | 1 | [US-06] | [REQ-WT-02] |
| REQ-WT-02 | Orchestrator manages worktree lifecycle | The Ptah orchestrator is responsible for creating and destroying worktrees for each skill invocation. A worktree is created immediately before the skill runs. It is removed after the skill completes (success or failure). If the orchestrator or skill crashes mid-execution, a cleanup sweep removes any dangling worktrees on next startup. | WHO: As the Ptah orchestrator GIVEN: A skill completes or fails WHEN: The orchestrator handles the skill's completion THEN: The worktree used by that skill is deleted; on next orchestrator startup, any worktrees without an active skill invocation are cleaned up | P0 | 1 | [US-06] | — |
| REQ-WT-03 | Feature resolver operates relative to the worktree root | The feature resolver service ([REQ-SK-06]) must accept the worktree root path as an input parameter and search lifecycle folders under that root. It must never search under the main working tree root when called from a skill context. The worktree root is passed by the orchestrator when it sets up the skill execution environment. | WHO: As a Ptah orchestrator activity running inside a skill's worktree GIVEN: The worktree root is `/tmp/ptah-wt-{uuid}/` WHEN: I call the feature resolver with slug `{feature-slug}` and worktree root `/tmp/ptah-wt-{uuid}/` THEN: The resolver searches `/tmp/ptah-wt-{uuid}/docs/in-progress/`, `/tmp/ptah-wt-{uuid}/docs/backlog/`, and `/tmp/ptah-wt-{uuid}/docs/completed/` | P0 | 1 | [US-06] | [REQ-SK-06], [REQ-WT-01] |
| REQ-WT-04 | Worktree root stored in workflow state alongside resolved feature path | The workflow state must store both the worktree root path and the feature-folder path relative to that root. Activities combine these to form the absolute path to a feature artifact. Storing them separately allows the orchestrator to substitute the worktree root when re-using a resolved feature path across multiple skill invocations (e.g., when a promotion changes the feature-folder path, only the relative path field in state is updated). | WHO: As a Ptah workflow activity GIVEN: Workflow state contains `worktreeRoot` and `featurePath` fields WHEN: The activity needs to write to a feature artifact THEN: The activity computes `path.join(state.worktreeRoot, state.featurePath, filename)` to get the absolute path | P0 | 1 | [US-05], [US-06] | [REQ-SK-07], [REQ-WT-01] |
| REQ-WT-05 | Promotion activities execute inside a worktree | The promotion activities ([REQ-SK-08]) that run `git mv` and commit the result must execute within a dedicated worktree, not in the main working tree. This isolates the `git mv` operation from any concurrent skill invocations operating on other worktrees of the same branch. | WHO: As the Ptah orchestrator GIVEN: A backlog→in-progress or in-progress→completed promotion is needed WHEN: The orchestrator runs the promotion activity THEN: The activity creates (or reuses) a dedicated promotion worktree, performs `git mv` + commit within it, pushes, and then deletes the worktree | P0 | 1 | [US-02], [US-03], [US-06] | [REQ-SK-08], [REQ-WT-01], [REQ-WT-02] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Git history preservation | All folder moves must use `git mv` so that `git log --follow` continues to show the full history of moved files. | `git log --follow docs/completed/001-init/overview.md` shows commits from before the migration | P0 | 1 |
| REQ-NF-02 | Idempotent promotion and migration | All promotion operations (backlog→in-progress, in-progress→completed) and the one-time migration must be idempotent. If a feature is already in the target lifecycle folder, the operation skips the folder move. For the completion promotion specifically, a two-phase check is required to handle partial-completion failures: (1) if the destination `completed/{NNN}-{slug}/` folder already exists, skip NNN assignment and the folder move; (2) resume only the file-rename step for any files that have not yet been renamed to their NNN-prefixed names. This prevents NNN re-assignment or duplication if the promotion activity is retried after a partial failure. | Running promotion or migration multiple times produces the same result as running it once; a partially completed promotion resumes from where it left off without re-assigning NNN | P1 | 1 |
| REQ-NF-03 | Skill backward compatibility during transition | If a skill encounters a feature folder at the old location (`docs/{NNN}-{feature}/`), it should still work (e.g., by falling back to the old path). This prevents breakage if skills are updated before migration runs. | A skill invoked before migration can still find feature folders at the old path | P2 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Cross-references in existing documents break after migration | Medium | Medium | Use relative paths within feature folders; cross-feature references already use ID-based linking, not file paths | [REQ-PR-04] |
| R-02 | Multiple skills attempt to promote the same feature simultaneously, causing conflicts | Low | Medium | Promotion operations should be idempotent — if the folder is already in the target location, skip the move | [REQ-PR-01], [REQ-PR-02] |
| R-03 | Ptah orchestrator code hardcodes `docs/` paths that don't account for lifecycle subfolders | High | High | Audit all `docs/` path references in `ptah/src/` — confirmed locations: `ptah/src/orchestrator/pdlc/cross-review-parser.ts:159`, `ptah/src/temporal/workflows/feature-lifecycle.ts:1076`, and `feature-lifecycle.ts:66-71` (comment block). Replace all inline path construction with calls to the feature resolver service and reads from workflow state per [REQ-SK-06] and [REQ-SK-07] | [REQ-SK-02], [REQ-SK-06], [REQ-SK-07] |
| R-04 | NNN numbering conflicts if multiple features are completed concurrently | Low | Low | Sequential completion within a single orchestrator process; if needed, use file-based locking | [REQ-PR-03] |
| R-05 | File rename on completion breaks in-document references | Medium | Medium | Completion promotion must scan document content for internal file references (e.g., markdown links to `REQ-{feature}.md`) and update them to the NNN-prefixed names | [REQ-PR-02], [REQ-PR-04] |
| R-06 | Worktree accumulation if orchestrator or skill crashes without cleanup | Medium | Low | On each orchestrator startup, sweep for worktrees whose associated skill invocation is no longer active and delete them. Worktrees are cheap to recreate — aggressive cleanup is preferable to accumulation | [REQ-WT-02] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 26 | REQ-FS-01, REQ-FS-02, REQ-FS-03, REQ-FS-04, REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-PR-05, REQ-SK-01, REQ-SK-02, REQ-SK-03, REQ-SK-04, REQ-SK-05, REQ-SK-06, REQ-SK-07, REQ-SK-08, REQ-MG-01, REQ-MG-02, REQ-MG-03, REQ-MG-04, REQ-NF-01, REQ-WT-01, REQ-WT-02, REQ-WT-03, REQ-WT-04, REQ-WT-05 |
| P1 | 2 | REQ-PR-04, REQ-NF-02 |
| P2 | 1 | REQ-NF-03 |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 29 | All requirements (single-phase delivery) |

---

## 9. Scope Boundaries

### In Scope

- Creating the three lifecycle folders (`backlog/`, `in-progress/`, `completed/`)
- Migrating all existing feature folders to the correct lifecycle folder
- Updating all four SKILL.md files to reference the new folder structure
- Updating Ptah orchestrator source code to resolve feature paths across lifecycle folders
- Feature promotion logic (backlog→in-progress without NNN, in-progress→completed with NNN)
- NNN assignment and file renaming on promotion to completed
- Removing NNN from in-progress features during migration
- Git worktree creation, use, and cleanup for all skill invocations and promotion activities

### Out of Scope

- Changing the internal structure of feature folders beyond the NNN prefix convention
- Automating lifecycle state detection (which features are "completed" vs "in-progress" is determined manually for the initial migration)
- Renumbering existing completed features (they keep their existing NNN)
- Moving `requirements/`, `templates/`, or `open-questions/` directories
- CI/CD or automation triggers for promotion (promotions are triggered by skills during the PDLC workflow)

---

## 10. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 3, 2026 | Product Manager | Initial requirements document |
| 2.0 | April 3, 2026 | Product Manager | Major revision: in-progress features are now unnumbered. NNN prefix assigned only on promotion to completed (not on promotion to in-progress). Updated REQ-FS-03, REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-SK-03, REQ-SK-04, US-02, US-03, REQ-MG-03. Added A-05, R-05. Changed Document ID from REQ-019 to REQ-FLF (unnumbered). |
| 2.1 | April 3, 2026 | Product Manager | Addressed engineer cross-review (F-01–F-05, Q-01–Q-03). Added REQ-SK-06 (feature resolver behavioral contract — F-01), REQ-SK-07 (resolved path in workflow state — F-02), REQ-SK-08 (orchestrator owns promotion execution — F-03, Q-02). Updated REQ-SK-02 with slug collision behavior (Q-01). Updated REQ-PR-04 with in-scope reference formats (F-04). Updated REQ-NF-02 with two-phase idempotency for partial-completion (F-05). Fixed C-02 with full file paths (Q-03). Fixed R-03 to reference full paths. Added A-06. |
| 2.2 | April 3, 2026 | Product Manager | Added worktree isolation requirements. New US-06 (parallel skill agent isolation). New domain WT. Added REQ-WT-01 (skill in dedicated worktree), REQ-WT-02 (orchestrator manages lifecycle), REQ-WT-03 (resolver operates relative to worktree root), REQ-WT-04 (worktree root + feature path in state), REQ-WT-05 (promotion activities in worktree). Added C-04 (main working tree never modified by skills), R-06 (worktree accumulation risk). Updated requirements summary (26 P0, 29 total). |

---

*End of Document*
