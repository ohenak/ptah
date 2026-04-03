# Test Properties Document

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-FLF |
| **Requirements** | [REQ-FLF](REQ-feature-lifecycle-folders.md) |
| **Specifications** | [FSPEC-FLF](FSPEC-feature-lifecycle-folders.md), [TSPEC-FLF](TSPEC-feature-lifecycle-folders.md) |
| **Execution Plan** | [PLAN-FLF](PLAN-feature-lifecycle-folders.md) |
| **Version** | 1.0 |
| **Date** | April 4, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

This document catalogs all testable invariants for the Feature Lifecycle Folders feature. The feature reorganizes `docs/` into lifecycle-based folders (`backlog/`, `in-progress/`, `completed/`), implements a feature resolver service, two promotion activities (backlog-to-in-progress and in-progress-to-completed), worktree isolation for skill invocations, a one-time migration script, and SKILL.md updates.

Properties are derived from REQ-FLF (v2.3), FSPEC-FLF (v1.1), and TSPEC-FLF (v1.1). Every requirement (REQ-FS-01..04, REQ-PR-01..05, REQ-SK-01..08, REQ-MG-01..04, REQ-WT-01..05, REQ-NF-01..03) is covered by at least one property.

### 1.1 Scope

**In scope:**
- Folder structure invariants (FS)
- Promotion flow logic and NNN assignment (PR)
- Feature resolver service behavior (SK)
- Migration script behavior (MG)
- Worktree isolation lifecycle (WT)
- Non-functional requirements: git history, idempotency, backward compatibility (NF)
- Error handling for all modules
- Negative properties (prohibited behaviors)

**Out of scope:**
- SKILL.md prose content verification (REQ-SK-05 is a documentation-only change; verified by manual review)
- End-to-end Temporal cluster integration (covered by separate infrastructure tests)
- UI or CLI UX testing (no UI component exists)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 29 | [REQ-FLF](REQ-feature-lifecycle-folders.md) |
| Specifications analyzed | 6 | [FSPEC-FLF](FSPEC-feature-lifecycle-folders.md), [TSPEC-FLF](TSPEC-feature-lifecycle-folders.md) |
| Plan tasks reviewed | N/A | [PLAN-FLF](PLAN-feature-lifecycle-folders.md) |
| Integration boundaries identified | 5 | Resolver+Promotion, Workflow+Activities, WorktreeManager+GitClient, Migration+GitClient, CompositionRoot |
| Implementation files reviewed | 0 | N/A -- not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 30 | REQ-FS-01..04, REQ-PR-01..05, REQ-SK-01..04, REQ-SK-06..08, REQ-MG-01..04, REQ-WT-01..02, REQ-WT-05, REQ-NF-03 | Unit |
| Contract | 8 | REQ-SK-06, REQ-SK-07, REQ-WT-04 | Unit / Integration |
| Error Handling | 12 | REQ-PR-01..05, REQ-SK-02, REQ-SK-06, REQ-WT-01..02, REQ-MG-01..04 | Unit |
| Data Integrity | 7 | REQ-PR-02..04, REQ-MG-02..03 | Unit |
| Integration | 7 | REQ-SK-07, REQ-SK-08, REQ-WT-03..05 | Integration |
| Idempotency | 6 | REQ-NF-02 | Unit / Integration |
| Observability | 5 | REQ-SK-02, REQ-WT-02, REQ-NF-02 | Unit |
| Negative | 18 | REQ-FS-02..03, REQ-PR-01..04, REQ-SK-02..08, REQ-WT-01..02, REQ-WT-05, REQ-MG-02..04 | Unit / Integration |
| **Total** | **93** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-{DOMAIN}-{NUMBER}` -- domain prefix matches the requirement domain.

**Priority:** Inherited from the highest-priority linked requirement (P0 / P1 / P2).

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-FS-01 | Folder structure must contain exactly `backlog/`, `in-progress/`, and `completed/` directories under `docs/` when the lifecycle structure is initialized | [REQ-FS-01] | Unit | P0 |
| PROP-FS-02 | Folder structure must preserve `requirements/`, `templates/`, `open-questions/`, and standalone files at the `docs/` root when lifecycle folders are present | [REQ-FS-01] | Unit | P0 |
| PROP-FS-03 | Feature folders in `docs/backlog/` must use the bare feature slug as the folder name with no NNN numeric prefix when created | [REQ-FS-02] | Unit | P0 |
| PROP-FS-04 | Document filenames in `docs/backlog/` must have no NNN prefix (e.g., `REQ-{slug}.md`, `overview.md`) when a feature is in backlog | [REQ-FS-02] | Unit | P0 |
| PROP-FS-05 | Feature folders in `docs/in-progress/` must use the bare feature slug as the folder name with no NNN numeric prefix when a feature is in progress | [REQ-FS-03] | Unit | P0 |
| PROP-FS-06 | Document filenames in `docs/in-progress/` must have no NNN prefix when a feature is in progress | [REQ-FS-03] | Unit | P0 |
| PROP-FS-07 | Feature folders in `docs/completed/` must have a zero-padded 3-digit NNN prefix (e.g., `015-temporal-foundation/`) when a feature has been promoted to completed | [REQ-FS-04] | Unit | P0 |
| PROP-FS-08 | Document filenames in `docs/completed/` must have the NNN prefix matching the folder's NNN (e.g., `015-REQ-temporal-foundation.md`) when a feature is completed | [REQ-FS-04] | Unit | P0 |
| PROP-PR-01 | `promoteBacklogToInProgress` must move the feature folder from `docs/backlog/{slug}/` to `docs/in-progress/{slug}/` when the feature exists in backlog | [REQ-PR-01], [FSPEC-PR-01] | Unit | P0 |
| PROP-PR-02 | `promoteBacklogToInProgress` must leave folder name and all filenames unchanged (no NNN prefix assigned) when promoting from backlog to in-progress | [REQ-PR-01], [FSPEC-PR-01 BR-03] | Unit | P0 |
| PROP-PR-03 | `promoteInProgressToCompleted` Phase 1 must move the feature folder from `docs/in-progress/{slug}/` to `docs/completed/{NNN}-{slug}/` when the feature exists in in-progress and no prior partial completion exists | [REQ-PR-02], [FSPEC-PR-01] | Unit | P0 |
| PROP-PR-04 | `promoteInProgressToCompleted` Phase 2 must rename every file in the completed folder by prepending `{NNN}-` to the filename when the file does not already have the NNN prefix | [REQ-PR-02], [FSPEC-PR-01] | Unit | P0 |
| PROP-PR-05 | `promoteInProgressToCompleted` Phase 3 must update markdown links matching `[text](filename.md)` and `[text](./filename.md)` to reference NNN-prefixed filenames when those files were renamed in Phase 2 | [REQ-PR-04], [FSPEC-PR-01 BR-06] | Unit | P1 |
| PROP-PR-06 | `promoteInProgressToCompleted` must calculate NNN as `max(existing NNN in completed/) + 1` zero-padded to 3 digits when completed/ contains existing numbered folders | [REQ-PR-03], [FSPEC-PR-01 BR-04] | Unit | P0 |
| PROP-PR-07 | `promoteInProgressToCompleted` must assign NNN = `001` when `docs/completed/` contains no numbered folders | [REQ-PR-03], [FSPEC-PR-01] | Unit | P0 |
| PROP-PR-08 | `promoteInProgressToCompleted` must preserve NNN gaps (e.g., after `001` and `003`, next is `004`) when gaps exist in the completed sequence | [REQ-PR-03], [FSPEC-PR-01 edge case] | Unit | P0 |
| PROP-PR-09 | Both promotion activities must use `git mv` for all folder moves and file renames when executing promotions | [REQ-PR-05], [REQ-NF-01], [FSPEC-PR-01 BR-02] | Unit | P0 |
| PROP-SK-01 | PM skill Phase 0 must create new feature folders under `docs/backlog/{slug}/` with unnumbered filenames when bootstrapping a new feature | [REQ-SK-01] | Unit | P0 |
| PROP-SK-02 | `FeatureResolver.resolve` must search `in-progress/` first, then `backlog/`, then `completed/` and return the first match when a slug exists in exactly one lifecycle folder | [REQ-SK-02], [REQ-SK-06], [FSPEC-SK-01 BR-03] | Unit | P0 |
| PROP-SK-03 | `FeatureResolver.resolve` must strip the NNN prefix from `completed/` folder names when comparing against the provided slug | [REQ-SK-02], [FSPEC-SK-01 BR-02] | Unit | P0 |
| PROP-SK-04 | `FeatureResolver.resolve` must return `{ found: false, slug }` (not throw) when the slug does not exist in any lifecycle folder | [REQ-SK-02], [REQ-SK-06], [FSPEC-SK-01 BR-05] | Unit | P0 |
| PROP-SK-05 | Orchestrator must detect the backlog condition during pre-invocation setup and execute `promoteBacklogToInProgress` before invoking any engineer or tech-lead skill when the feature is in `docs/backlog/` | [REQ-SK-03], [REQ-SK-08], [FSPEC-PR-01] | Unit | P0 |
| PROP-SK-06 | Orchestrator must execute `promoteInProgressToCompleted` when both `test-engineer` and `product-manager` LGTM signals have been received within the same workflow execution | [REQ-SK-04], [REQ-SK-08], [FSPEC-PR-01 BR-07] | Unit | P0 |
| PROP-SK-07 | Orchestrator must not trigger completion promotion when only one of the two required sign-off signals has been received | [REQ-SK-08], [FSPEC-PR-01 BR-07] | Unit | P0 |
| PROP-MG-01 | `MigrateLifecycleCommand` must create `docs/backlog/`, `docs/in-progress/`, and `docs/completed/` directories with `.gitkeep` files when migration runs | [REQ-MG-01], [FSPEC-MG-01 BR-06] | Unit | P0 |
| PROP-MG-02 | `MigrateLifecycleCommand` must move all folders matching `^[0-9]{3}-` to `docs/completed/` preserving their NNN prefix when migration runs | [REQ-MG-02], [FSPEC-MG-01 BR-02, BR-03] | Unit | P0 |
| PROP-MG-03 | `MigrateLifecycleCommand` must move remaining feature folders to `docs/in-progress/` when migration runs | [REQ-MG-03], [FSPEC-MG-01] | Unit | P0 |
| PROP-MG-04 | `MigrateLifecycleCommand` must not move `requirements/`, `templates/`, `open-questions/`, or standalone files when migration runs | [REQ-MG-04], [FSPEC-MG-01] | Unit | P0 |
| PROP-WT-01 | `WorktreeManager.create` must create a new git worktree at `/tmp/ptah-wt-{uuid}/` checked out on the feature branch when a skill invocation or promotion activity is prepared | [REQ-WT-01], [FSPEC-WT-01 BR-03] | Unit | P0 |
| PROP-NF-01 | `FeatureResolver.resolve` must fall back to searching `docs/{NNN}-{slug}/` or `docs/{slug}/` at the repository root when lifecycle folders do not exist and the feature is not found via lifecycle search | [REQ-NF-03] | Unit | P2 |

### 3.2 Contract Properties

API request/response shape, protocol compliance, and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-SK-08 | `FeatureResolver.resolve` must return a `FeatureResolverResult` with `found: true`, `path` (relative to worktreeRoot), and `lifecycle` field when the slug is found | [TSPEC-FLF 4.2.1] | Unit | P0 |
| PROP-SK-09 | `FeatureResolver.resolve` must return `{ found: false, slug }` as a value (not an exception) when the slug is not found | [TSPEC-FLF 4.2.1], [FSPEC-SK-01 BR-05] | Unit | P0 |
| PROP-SK-10 | `FeatureResolver.resolve` must accept `worktreeRoot` as an absolute path and return `path` as a relative path from that root when called | [TSPEC-FLF 4.2.1], [FSPEC-SK-01 BR-06] | Unit | P0 |
| PROP-WT-02 | `WorktreeManager.create` must return a `WorktreeHandle` with `path` (absolute) and `branch` fields when worktree creation succeeds | [TSPEC-FLF 4.2.2] | Unit | P0 |
| PROP-WT-03 | `WorktreeManager.destroy` must return `Promise<void>` and must not throw when `git worktree remove` fails | [TSPEC-FLF 4.2.2] | Unit | P0 |
| PROP-WT-04 | `WorktreeRegistry` must store `worktreePath`, `branch`, `workflowId`, `runId`, `activityId`, and `createdAt` for each registered worktree when `register` is called | [TSPEC-FLF 4.2.3] | Unit | P0 |
| PROP-WT-05 | `FeatureWorkflowState` must include `featurePath` (string or null), `worktreeRoot` (string or null), and `signOffs` (Record<string, string>) fields when the workflow state type is defined | [TSPEC-FLF 4.2.4] | Unit | P0 |
| PROP-PR-10 | `promoteInProgressToCompleted` must produce 2-3 git commits (Phase 1 folder move, Phase 2 file rename, Phase 3 ref update if applicable) on the feature branch when a full promotion completes | [FSPEC-PR-01], [TSPEC-FLF 5.2.2] | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PR-11 | `promoteBacklogToInProgress` must throw `ApplicationFailure.nonRetryable` when the feature slug is not found in either `backlog/` or `in-progress/` | [TSPEC-FLF 6] | Unit | P0 |
| PROP-PR-12 | Both promotion activities must throw `ApplicationFailure.nonRetryable` when `git mv` fails (source path does not exist) | [TSPEC-FLF 6], [FSPEC-PR-01 Error Scenarios] | Unit | P0 |
| PROP-PR-13 | Both promotion activities must throw a retryable `ApplicationFailure` when `git push` fails (remote conflict) | [TSPEC-FLF 6], [FSPEC-PR-01 Error Scenarios] | Unit | P0 |
| PROP-PR-14 | `promoteInProgressToCompleted` must throw `ApplicationFailure.nonRetryable` when `docs/completed/` is unreadable (filesystem error) | [TSPEC-FLF 6] | Unit | P0 |
| PROP-PR-15 | `promoteInProgressToCompleted` Phase 3 must log a warning and skip the affected file (not fail the promotion) when an internal reference update produces a parse error | [TSPEC-FLF 6], [FSPEC-PR-01 Error Scenarios] | Unit | P1 |
| PROP-WT-06 | `WorktreeManager.create` must throw `ApplicationFailure.nonRetryable` when `git worktree add` fails | [TSPEC-FLF 6] | Unit | P0 |
| PROP-WT-07 | `WorktreeManager.destroy` must log the error and not throw when `git worktree remove` fails in a finally block | [TSPEC-FLF 6], [FSPEC-WT-01 Error Scenarios] | Unit | P0 |
| PROP-WT-08 | `WorktreeManager.cleanupDangling` must log a warning and skip the cleanup sweep when the Temporal server is unreachable during startup | [TSPEC-FLF 6], [FSPEC-WT-01 edge cases] | Unit | P0 |
| PROP-MG-05 | `MigrateLifecycleCommand` must exit with code 1 and make no changes when the git working tree is dirty | [TSPEC-FLF 6], [FSPEC-MG-01 BR-05] | Unit | P0 |
| PROP-MG-06 | `MigrateLifecycleCommand` must exit with code 1 and make no changes when any lifecycle folder already contains files | [TSPEC-FLF 6], [FSPEC-MG-01 Error Scenarios] | Unit | P0 |
| PROP-MG-07 | `MigrateLifecycleCommand` must exit with code 1 when `git mv` fails for any folder during migration | [TSPEC-FLF 6] | Unit | P0 |
| PROP-MG-08 | `MigrateLifecycleCommand` must exit with code 1 when a file-rename conflict occurs (duplicate name after NNN-prefix stripping) | [TSPEC-FLF 6], [FSPEC-MG-01 edge cases] | Unit | P0 |

### 3.4 Data Integrity Properties

Path transformations, NNN calculations, and rename maps.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PR-16 | NNN calculation must extract leading 3-digit integers from all `docs/completed/` folder names matching `^[0-9]{3}-`, take the maximum, and add 1 when computing the next NNN | [REQ-PR-03], [TSPEC-FLF 5.2.2] | Unit | P0 |
| PROP-PR-17 | NNN must be zero-padded to exactly 3 digits (e.g., `001`, `012`, `123`) when assigned during completion promotion | [REQ-PR-03], [REQ-FS-04] | Unit | P0 |
| PROP-PR-18 | The rename map built in Phase 2 must map every original filename to `{NNN}-{originalFilename}` when files are renamed | [TSPEC-FLF 5.2.2] | Unit | P0 |
| PROP-PR-19 | Phase 3 internal ref update regex must match `[text](filename.md)` and `[text](./filename.md)` patterns only, replacing the target with the NNN-prefixed version from the rename map when those patterns reference renamed files | [FSPEC-PR-01 BR-06], [TSPEC-FLF 5.2.2] | Unit | P1 |
| PROP-MG-09 | Migration must strip the `^[0-9]{3}-` prefix from both folder names and document filenames when moving NNN-prefixed features to `docs/in-progress/` | [REQ-MG-03], [FSPEC-MG-01 BR-04] | Unit | P0 |
| PROP-MG-10 | Migration must preserve the original NNN prefix on folders moved to `docs/completed/` without renumbering when migrating completed features | [REQ-MG-02], [FSPEC-MG-01 BR-03] | Unit | P0 |
| PROP-SK-11 | `FeatureResolver.resolve` must normalize the worktreeRoot by stripping any trailing slash before constructing search paths when the input path has a trailing slash | [FSPEC-SK-01 edge cases] | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-SK-12 | Workflow must store the resolved `featurePath` and `worktreeRoot` in `FeatureWorkflowState` after resolver returns and all subsequent activities must read the path from state (not re-invoke the resolver) when processing a feature | [REQ-SK-07], [REQ-WT-04], [FSPEC-SK-01 State Storage] | Integration | P0 |
| PROP-SK-13 | Activities must compute absolute artifact paths as `path.join(state.worktreeRoot, state.featurePath, filename)` when accessing feature files | [REQ-WT-04], [FSPEC-SK-01] | Integration | P0 |
| PROP-SK-14 | `crossReviewPath` must accept `state.featurePath` (e.g., `docs/in-progress/my-feature/`) instead of bare slug when constructing cross-review file paths | [TSPEC-FLF 5.6], [REQ-SK-07] | Integration | P0 |
| PROP-WT-09 | `FeatureResolver.resolve` must search lifecycle folders under the provided `worktreeRoot` (not the main working tree root) when called from a skill context within a worktree | [REQ-WT-03], [FSPEC-SK-01 BR-04] | Integration | P0 |
| PROP-WT-10 | Each promotion activity must create a fresh worktree via `WorktreeManager.create`, execute within it, and destroy it in a finally block when running a promotion | [REQ-WT-05], [FSPEC-WT-01 BR-06] | Integration | P0 |
| PROP-WT-11 | Composition root must instantiate `DefaultFeatureResolver` and `DefaultWorktreeManager` and inject them into the activity factory when the orchestrator starts | [TSPEC-FLF 4.4] | Integration | P0 |
| PROP-WT-12 | Composition root must call `worktreeManager.cleanupDangling` after the Temporal client connects during orchestrator startup when the process initializes | [TSPEC-FLF 4.4] | Integration | P0 |

### 3.8 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-02 | `promoteBacklogToInProgress` must return success without running `git mv` when the feature already exists in `docs/in-progress/{slug}/` and not in `docs/backlog/{slug}/` | [REQ-NF-02], [FSPEC-PR-01 step 4] | Unit | P1 |
| PROP-NF-03 | `promoteInProgressToCompleted` Phase 1 must detect an existing `docs/completed/{NNN}-{slug}/` folder and skip NNN assignment and folder move when the destination already exists | [REQ-NF-02], [FSPEC-PR-01 step 5a-b] | Unit | P1 |
| PROP-NF-04 | `promoteInProgressToCompleted` Phase 2 must skip files already prefixed with `{NNN}-` and rename only the remaining files when some files were renamed in a prior partial run | [REQ-NF-02], [FSPEC-PR-01 step 6c] | Unit | P1 |
| PROP-NF-05 | `promoteInProgressToCompleted` must produce a final state identical to a single uninterrupted run when retried after a Phase 1 completion + Phase 2 partial failure | [REQ-NF-02], [FSPEC-PR-01 AT-PR-04] | Integration | P1 |
| PROP-NF-06 | `promoteInProgressToCompleted` Phase 2 must not make a commit when all files in the folder already have the NNN prefix | [FSPEC-PR-01 edge case: no files to rename] | Unit | P1 |
| PROP-NF-07 | `promoteInProgressToCompleted` must not re-assign a different NNN when the destination folder with the original NNN already exists from a prior partial run | [REQ-NF-02], [FSPEC-PR-01 BR-05] | Unit | P1 |

### 3.9 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-SK-15 | `FeatureResolver.resolve` must log a warning listing all matching folders when a slug is found in more than one lifecycle folder simultaneously | [REQ-SK-02], [FSPEC-SK-01 step 5] | Unit | P0 |
| PROP-PR-20 | `promoteBacklogToInProgress` must log `[ptah] Idempotent skip: {slug} already in in-progress.` when the idempotency check detects the feature is already promoted | [FSPEC-PR-01 step 4], [REQ-NF-02] | Unit | P1 |
| PROP-WT-13 | `WorktreeManager.destroy` must log `[ptah:worktree] Failed to remove worktree {path}: {error}` when `git worktree remove` fails | [TSPEC-FLF 5.3] | Unit | P0 |
| PROP-WT-14 | `WorktreeManager.cleanupDangling` must log `[ptah:startup] Pruned dangling worktree: {path}` for each removed worktree when dangling worktrees are found on startup | [FSPEC-WT-01 AT-WT-03], [TSPEC-FLF 5.4] | Unit | P0 |
| PROP-MG-11 | `MigrateLifecycleCommand` must print a migration summary showing counts of completed and in-progress features moved when migration completes successfully | [FSPEC-MG-01 step 7] | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. These are derived from the inverse of positive properties and from explicit specification constraints.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-FS-09 | Feature folders in `backlog/` must not have a NNN numeric prefix under any circumstance when they reside in backlog | [REQ-FS-02] | Unit | P0 |
| PROP-FS-10 | Feature folders in `in-progress/` must not have a NNN numeric prefix under any circumstance when they reside in in-progress | [REQ-FS-03] | Unit | P0 |
| PROP-PR-21 | `promoteBacklogToInProgress` must not rename any files or assign a NNN prefix when promoting from backlog to in-progress | [REQ-PR-01], [FSPEC-PR-01 BR-03] | Unit | P0 |
| PROP-PR-22 | `promoteInProgressToCompleted` must not re-use an existing NNN value already present in `docs/completed/` when assigning a new NNN | [REQ-PR-03], [FSPEC-PR-01 BR-04] | Unit | P0 |
| PROP-PR-23 | Phase 3 internal ref update must not modify cross-feature references, bare prose mentions, absolute paths, wiki-style links, reference-style links, or HTML `<a>` patterns when updating internal references | [REQ-PR-04], [FSPEC-PR-01 BR-06] | Unit | P1 |
| PROP-PR-24 | Sign-off state from a prior workflow run must not carry forward automatically across `continue-as-new` boundaries unless explicitly passed in the CAN payload | [FSPEC-PR-01 BR-07] | Unit | P0 |
| PROP-SK-16 | No module other than `FeatureResolver` must independently construct lifecycle-based feature paths when resolving feature locations | [REQ-SK-06], [FSPEC-SK-01 BR-01] | Unit | P0 |
| PROP-SK-17 | `FeatureResolver.resolve` must not throw an exception when the slug is not found in any lifecycle folder | [REQ-SK-02], [FSPEC-SK-01 BR-05] | Unit | P0 |
| PROP-SK-18 | `FeatureResolver.resolve` must not fall back to the main working tree root when a `worktreeRoot` is provided (even if the path is unexpected) | [FSPEC-SK-01 BR-04] | Unit | P0 |
| PROP-SK-19 | Activities must not re-invoke the feature resolver independently when the resolved path is already stored in workflow state | [REQ-SK-07] | Unit | P0 |
| PROP-SK-20 | Claude skill agents must not execute promotion operations (`git mv` + commit) directly when a promotion is needed -- only the orchestrator executes promotions | [REQ-SK-08], [FSPEC-PR-01 BR-01] | Unit | P0 |
| PROP-WT-15 | Skill invocations and promotion activities must not modify the main working tree when executing | [REQ-WT-01], [FSPEC-WT-01 BR-02] | Integration | P0 |
| PROP-WT-16 | Multiple concurrent skills must not share a worktree when running in parallel | [FSPEC-WT-01 BR-01] | Integration | P0 |
| PROP-WT-17 | Promotion activities must not reuse a worktree from a previous run when executing -- they must always create a fresh worktree | [REQ-WT-05], [FSPEC-WT-01 BR-06] | Unit | P0 |
| PROP-WT-18 | `WorktreeManager.cleanupDangling` must not prune worktrees associated with active Temporal workflow executions when performing crash-recovery cleanup | [FSPEC-WT-01 BR-05], [FSPEC-WT-01 edge cases] | Unit | P0 |
| PROP-MG-12 | `MigrateLifecycleCommand` must not move `requirements/`, `templates/`, or `open-questions/` directories into lifecycle folders when migration runs | [REQ-MG-04] | Unit | P0 |
| PROP-MG-13 | `MigrateLifecycleCommand` must not renumber completed features (must preserve original NNN) when migrating to `docs/completed/` | [REQ-MG-02], [FSPEC-MG-01 BR-03] | Unit | P0 |
| PROP-MG-14 | `MigrateLifecycleCommand` must not run inside a worktree -- it must run exclusively in the main working tree | [FSPEC-MG-01 BR-01] | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

Every requirement must map to at least one property. Gaps are flagged with reason and recommendation.

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-FS-01 | PROP-FS-01, PROP-FS-02 | Full |
| REQ-FS-02 | PROP-FS-03, PROP-FS-04, PROP-FS-09 | Full |
| REQ-FS-03 | PROP-FS-05, PROP-FS-06, PROP-FS-10 | Full |
| REQ-FS-04 | PROP-FS-07, PROP-FS-08, PROP-PR-17 | Full |
| REQ-PR-01 | PROP-PR-01, PROP-PR-02, PROP-PR-21 | Full |
| REQ-PR-02 | PROP-PR-03, PROP-PR-04, PROP-PR-05, PROP-PR-10 | Full |
| REQ-PR-03 | PROP-PR-06, PROP-PR-07, PROP-PR-08, PROP-PR-16, PROP-PR-17, PROP-PR-22 | Full |
| REQ-PR-04 | PROP-PR-05, PROP-PR-19, PROP-PR-23 | Full |
| REQ-PR-05 | PROP-PR-09 | Full |
| REQ-SK-01 | PROP-SK-01 | Full |
| REQ-SK-02 | PROP-SK-02, PROP-SK-03, PROP-SK-04, PROP-SK-15, PROP-SK-17 | Full |
| REQ-SK-03 | PROP-SK-05, PROP-SK-20 | Full |
| REQ-SK-04 | PROP-SK-06 | Full |
| REQ-SK-05 | -- | No coverage -- documentation-only change; verified by manual review |
| REQ-SK-06 | PROP-SK-02, PROP-SK-04, PROP-SK-08, PROP-SK-09, PROP-SK-10, PROP-SK-16 | Full |
| REQ-SK-07 | PROP-SK-12, PROP-SK-13, PROP-SK-19 | Full |
| REQ-SK-08 | PROP-SK-05, PROP-SK-06, PROP-SK-07, PROP-SK-20, PROP-PR-24 | Full |
| REQ-MG-01 | PROP-MG-01 | Full |
| REQ-MG-02 | PROP-MG-02, PROP-MG-10, PROP-MG-13 | Full |
| REQ-MG-03 | PROP-MG-03, PROP-MG-09 | Full |
| REQ-MG-04 | PROP-MG-04, PROP-MG-12 | Full |
| REQ-WT-01 | PROP-WT-01, PROP-WT-15, PROP-WT-16 | Full |
| REQ-WT-02 | PROP-WT-03, PROP-WT-04, PROP-WT-07, PROP-WT-08, PROP-WT-12, PROP-WT-14, PROP-WT-18 | Full |
| REQ-WT-03 | PROP-WT-09 | Full |
| REQ-WT-04 | PROP-WT-05, PROP-SK-12, PROP-SK-13 | Full |
| REQ-WT-05 | PROP-WT-10, PROP-WT-17 | Full |
| REQ-NF-01 | PROP-PR-09 | Full |
| REQ-NF-02 | PROP-NF-02, PROP-NF-03, PROP-NF-04, PROP-NF-05, PROP-NF-06, PROP-NF-07 | Full |
| REQ-NF-03 | PROP-NF-01 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-PR-01 | PROP-PR-01..PR-24, PROP-NF-02..NF-07, PROP-SK-05..SK-07 | Full |
| FSPEC-SK-01 | PROP-SK-02..SK-20 | Full |
| FSPEC-WT-01 | PROP-WT-01..WT-18 | Full |
| FSPEC-MG-01 | PROP-MG-01..MG-14 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 26 | 25 | 0 | 1 (REQ-SK-05 -- docs only) |
| P1 | 2 | 2 | 0 | 0 |
| P2 | 1 | 1 | 0 | 0 |

---

## 6. Test Level Distribution

Summary of how properties are distributed across the test pyramid.

```
        /  E2E  \          0 -- no end-to-end properties defined
       /----------\
      / Integration \      12 -- cross-module boundaries
     /----------------\
    /    Unit Tests     \  81 -- fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 81 | 87% |
| Integration | 12 | 13% |
| E2E (candidates) | 0 | 0% |
| **Total** | **93** | **100%** |

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | REQ-SK-05 (SKILL.md updates) has no automated property | Incorrect File Organization sections could mislead skills | Low | Verify manually during code review; consider a snapshot test comparing SKILL.md sections against expected content |
| 2 | Concurrent NNN assignment race condition between two simultaneous completion promotions | Two features could receive the same NNN if promoted concurrently in separate worktrees | Med | Add an integration test that simulates concurrent promotion and verifies sequential Temporal activity scheduling prevents NNN collision |
| 3 | No E2E property for full lifecycle journey (create in backlog, promote to IP, promote to completed) | Multi-step lifecycle flow may have integration gaps not caught by unit tests | Med | Consider adding one E2E candidate test exercising the complete lifecycle from PM skill creation through completion |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | -- | -- | Pending |
| Technical Lead | -- | -- | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 4, 2026 | Test Engineer | Initial properties document |

---

*End of Document*
