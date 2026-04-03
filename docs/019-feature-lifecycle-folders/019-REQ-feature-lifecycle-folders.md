# Requirements Document

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-019 |
| **Parent Document** | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 1.0 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Reorganize the `docs/` directory from a flat list of numbered feature folders into a lifecycle-based structure with three top-level folders: `backlog/`, `in-progress/`, and `completed/`. This change makes the state of every feature immediately visible from the folder structure and eliminates the need to open individual documents to determine feature status.

All four Claude skills (product-manager, engineer, tech-lead, test-engineer) and the Ptah orchestrator code reference `docs/{NNN}-{feature-name}/` paths. These references must be updated to resolve feature folders under the correct lifecycle subfolder.

**Key design decision:** Features are **unnumbered** while in `backlog/`. They receive a sequential NNN prefix only when promoted to `in-progress/`. This keeps backlog lightweight (no number coordination needed) while preserving ordered numbering for active and completed work.

---

## 2. User Scenarios

### US-01: Product Manager Creates a New Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | A product manager invokes the PM skill to create a new feature. The feature folder and overview.md are created inside `docs/backlog/` without a numeric prefix. |
| **Goals** | New features land in backlog automatically. No manual folder management required. |
| **Pain points** | Today, every new feature gets a NNN prefix immediately, which forces coordination on numbering even for speculative features that may never be built. All features sit in a flat list regardless of status. |
| **Key needs** | PM skill creates feature folders under `docs/backlog/{feature-name}/`. No NNN prefix at creation time. |

### US-02: Engineer Starts Reviewing a Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | An engineer (or tech-lead) begins reviewing a REQ document. Before the review starts, the feature folder is moved from `docs/backlog/{feature-name}/` to `docs/in-progress/{NNN}-{feature-name}/`, receiving its sequential numeric prefix at this point. |
| **Goals** | Active work is clearly separated from backlog. Numbering reflects the order features entered active development. |
| **Pain points** | Today there is no structural distinction between a feature that is being actively worked on and one that is just a backlog idea. |
| **Key needs** | Automated or skill-triggered promotion from backlog to in-progress with NNN assignment. All internal document references update to the new path. |

### US-03: Feature Completes the Lifecycle

| Attribute | Detail |
|-----------|--------|
| **Description** | After test-engineer and product-manager sign off on a feature, the feature folder is moved from `docs/in-progress/{NNN}-{feature-name}/` to `docs/completed/{NNN}-{feature-name}/`. The NNN prefix is preserved. |
| **Goals** | Completed features are archived and clearly separated from active work. The `in-progress/` folder only contains actively worked features. |
| **Pain points** | Today, completed features (e.g., 001-init through 015-temporal-foundation) sit alongside in-progress and speculative features in the same flat list. |
| **Key needs** | Automated or skill-triggered promotion from in-progress to completed. All skills can still find completed feature docs when needed for cross-reference. |

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

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The `docs/` directory only contains feature folders, `requirements/`, `templates/`, `open-questions/`, and standalone files. No other subdirectory conventions exist. | If other conventions exist, migration may break them. |
| A-02 | All existing features (001–018) on `main` are considered "completed" — they have been implemented and merged. | If some are still in progress, they would be incorrectly classified during migration. |
| A-03 | Feature numbering (NNN) is purely for ordering and does not carry semantic meaning beyond creation order. | If numbers encode priority or dependency info, renumbering on promotion would lose that data. |
| A-04 | The `requirements/`, `templates/`, and `open-questions/` folders remain at `docs/` root — they are not feature-specific. | If they should also move, the scope expands significantly. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | All four skill files (`.claude/skills/*/SKILL.md`) must be updated in a coordinated change — partial updates would break skills that still assume the old path structure. | Skill architecture |
| C-02 | Ptah orchestrator source code (`ptah/src/`) references `docs/` paths in multiple modules. These must be updated alongside the skill changes. | Codebase |
| C-03 | Existing features must be migrated to the new folder structure without breaking git history traceability (i.e., use `git mv`). | Development workflow |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| Folder structure | All feature folders are in the correct lifecycle subfolder | `ls docs/{backlog,in-progress,completed}` | 0 features organized | 100% of features organized |
| Skill compatibility | All skills correctly resolve feature paths | Invoke each skill and verify artifact read/write | Skills assume flat `docs/` | Skills resolve across lifecycle folders |
| Feature promotion | Backlog → in-progress promotion assigns NNN and moves folder | Trigger a review on a backlog feature | N/A | Feature appears in `in-progress/` with NNN prefix |
| Feature completion | in-progress → completed promotion moves folder | Sign off on a feature | N/A | Feature appears in `completed/` |

---

## 5. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| FS | Folder Structure |
| PR | Promotion (lifecycle transitions) |
| SK | Skill Updates |
| MG | Migration |

### 5.1 Folder Structure (FS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-FS-01 | Top-level lifecycle folders | The `docs/` directory must contain exactly three feature-lifecycle folders at its root: `backlog/`, `in-progress/`, and `completed/`. Non-feature directories (`requirements/`, `templates/`, `open-questions/`) and standalone files remain at the `docs/` root. | WHO: As a developer GIVEN: The docs/ directory exists WHEN: I list the contents of docs/ THEN: I see `backlog/`, `in-progress/`, `completed/`, plus `requirements/`, `templates/`, `open-questions/`, and any standalone files | P0 | 1 | [US-04] | — |
| REQ-FS-02 | Backlog features are unnumbered | Feature folders in `docs/backlog/` must NOT have a NNN numeric prefix. The folder name is the feature slug only (e.g., `docs/backlog/feature-lifecycle-folders/`). | WHO: As a product manager GIVEN: I create a new feature WHEN: The feature folder is created in backlog THEN: The folder name is `{feature-slug}` with no numeric prefix | P0 | 1 | [US-01] | [REQ-FS-01] |
| REQ-FS-03 | In-progress features are numbered | Feature folders in `docs/in-progress/` must have a NNN numeric prefix (e.g., `docs/in-progress/019-feature-lifecycle-folders/`). | WHO: As a developer GIVEN: A feature has been promoted to in-progress WHEN: I list the contents of `docs/in-progress/` THEN: Each feature folder has a zero-padded 3-digit prefix | P0 | 1 | [US-02] | [REQ-FS-01] |
| REQ-FS-04 | Completed features are numbered | Feature folders in `docs/completed/` retain the NNN numeric prefix assigned during in-progress (e.g., `docs/completed/015-temporal-foundation/`). | WHO: As a developer GIVEN: A feature has been promoted to completed WHEN: I list the contents of `docs/completed/` THEN: Each feature folder has its original NNN prefix | P0 | 1 | [US-03] | [REQ-FS-01] |

### 5.2 Promotion — Lifecycle Transitions (PR)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PR-01 | Backlog to in-progress promotion | When a feature transitions from backlog to in-progress (triggered when an engineer or tech-lead begins reviewing the REQ document), the feature folder must be moved from `docs/backlog/{feature-slug}/` to `docs/in-progress/{NNN}-{feature-slug}/`. The NNN is assigned as the next sequential number based on the highest existing NNN in `docs/in-progress/` and `docs/completed/` combined. | WHO: As an engineer GIVEN: A feature exists in `docs/backlog/{feature-slug}/` WHEN: I start reviewing the REQ document THEN: The folder is moved to `docs/in-progress/{NNN}-{feature-slug}/` where NNN is the next available sequential number | P0 | 1 | [US-02] | [REQ-FS-01], [REQ-FS-02], [REQ-FS-03] |
| REQ-PR-02 | In-progress to completed promotion | When a feature is signed off by both the test-engineer and product-manager, the feature folder must be moved from `docs/in-progress/{NNN}-{feature-slug}/` to `docs/completed/{NNN}-{feature-slug}/`. The NNN prefix is preserved. | WHO: As a product manager GIVEN: Both test-engineer and product-manager have signed off WHEN: The final sign-off is recorded THEN: The folder is moved to `docs/completed/{NNN}-{feature-slug}/` with the same NNN prefix | P0 | 1 | [US-03] | [REQ-FS-01], [REQ-FS-04] |
| REQ-PR-03 | NNN assignment uses global max | The NNN assigned during backlog→in-progress promotion must be globally unique. It is calculated as `max(NNN across in-progress/ and completed/) + 1`, zero-padded to 3 digits. If no numbered folders exist, the first NNN is `001`. | WHO: As a system GIVEN: Multiple features have been promoted over time WHEN: A new feature is promoted to in-progress THEN: Its NNN is one greater than the highest NNN found across both `in-progress/` and `completed/` folders | P0 | 1 | [US-02] | [REQ-PR-01] |
| REQ-PR-04 | Internal document references update on promotion | When a feature folder is moved between lifecycle folders, any internal references within the feature's documents (e.g., relative paths in markdown links) must remain valid. At minimum, references within the feature folder itself must not break. | WHO: As a developer GIVEN: A feature folder has been promoted WHEN: I open any document in the feature folder THEN: All internal relative links and references within the feature folder still resolve correctly | P1 | 1 | [US-02], [US-03] | [REQ-PR-01], [REQ-PR-02] |
| REQ-PR-05 | Promotion uses git mv | Feature folder moves between lifecycle folders must use `git mv` to preserve git history tracking. | WHO: As a developer GIVEN: A feature is being promoted WHEN: The folder is moved THEN: `git log --follow` on files in the new location shows the full history from the original location | P0 | 1 | [US-02], [US-03] | [REQ-PR-01], [REQ-PR-02] |

### 5.3 Skill Updates (SK)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-SK-01 | PM skill creates features in backlog | The product-manager skill's Phase 0 (Feature Folder Bootstrap) must create new feature folders under `docs/backlog/{feature-slug}/` instead of `docs/{NNN}-{feature-slug}/`. It must NOT assign a NNN prefix at creation time. | WHO: As a product manager GIVEN: I invoke the PM skill for a new feature WHEN: Phase 0 runs THEN: The feature folder is created at `docs/backlog/{feature-slug}/` without a NNN prefix | P0 | 1 | [US-01] | [REQ-FS-01], [REQ-FS-02] |
| REQ-SK-02 | All skills resolve feature paths across lifecycle folders | All four skills (PM, engineer, tech-lead, test-engineer) must be able to locate a feature folder by its slug, searching across `backlog/`, `in-progress/`, and `completed/` directories. The resolution order should be: `in-progress/` first (most likely during active work), then `backlog/`, then `completed/`. | WHO: As any Claude skill GIVEN: A feature with slug `{feature-slug}` exists in one of the lifecycle folders WHEN: The skill needs to read or write artifacts for that feature THEN: The skill resolves the correct full path regardless of which lifecycle folder the feature is in | P0 | 1 | [US-05] | [REQ-FS-01] |
| REQ-SK-03 | Engineer/tech-lead skill triggers backlog→in-progress promotion | When the engineer or tech-lead skill begins reviewing a REQ document for a feature that is currently in `docs/backlog/`, the skill must promote the feature to `docs/in-progress/` with the next available NNN prefix before proceeding with the review. | WHO: As an engineer GIVEN: A feature is in `docs/backlog/{feature-slug}/` WHEN: I start a review task on this feature THEN: The feature is promoted to `docs/in-progress/{NNN}-{feature-slug}/` before my review artifacts are created | P0 | 1 | [US-02] | [REQ-PR-01], [REQ-SK-02] |
| REQ-SK-04 | Completion promotion on sign-off | When the final sign-off occurs (both test-engineer and product-manager have approved), the responsible skill (or orchestrator) must promote the feature folder from `docs/in-progress/` to `docs/completed/`. | WHO: As a product manager or test-engineer GIVEN: Both sign-offs are recorded WHEN: The final sign-off is given THEN: The feature is moved to `docs/completed/{NNN}-{feature-slug}/` | P0 | 1 | [US-03] | [REQ-PR-02], [REQ-SK-02] |
| REQ-SK-05 | File Organization section updated in all skills | The File Organization section of each SKILL.md must document the new `docs/` structure showing `backlog/`, `in-progress/`, and `completed/` subfolders. | WHO: As a skill developer GIVEN: The SKILL.md files are updated WHEN: I read the File Organization section THEN: The documented structure shows `docs/backlog/`, `docs/in-progress/`, and `docs/completed/` | P0 | 1 | [US-05] | [REQ-FS-01] |

### 5.4 Migration (MG)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-MG-01 | Create lifecycle folders | The three lifecycle folders (`docs/backlog/`, `docs/in-progress/`, `docs/completed/`) must be created. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/` THEN: `backlog/`, `in-progress/`, and `completed/` directories exist | P0 | 1 | [US-04] | — |
| REQ-MG-02 | Migrate completed features | All existing feature folders on `main` that represent completed, implemented features (001-init through 015-temporal-foundation) must be moved to `docs/completed/` using `git mv`, preserving their NNN prefix. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/completed/` THEN: All historically completed features are present with their original NNN prefixes | P0 | 1 | [US-03], [US-04] | [REQ-MG-01] |
| REQ-MG-03 | Migrate in-progress features | Any existing feature folders that are currently in active development (have REQ documents but are not yet signed off) must be moved to `docs/in-progress/` using `git mv`, preserving their NNN prefix. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/in-progress/` THEN: All currently active features are present with their original NNN prefixes | P0 | 1 | [US-02], [US-04] | [REQ-MG-01] |
| REQ-MG-04 | Non-feature directories stay at root | `docs/requirements/`, `docs/templates/`, `docs/open-questions/`, and standalone files (e.g., FEASIBILITY docs, PTAH_PRD) must remain at the `docs/` root — they are not moved into lifecycle folders. | WHO: As a developer GIVEN: The migration runs WHEN: I list `docs/` THEN: `requirements/`, `templates/`, `open-questions/`, and standalone files are still at the root level | P0 | 1 | [US-04] | [REQ-MG-01] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Git history preservation | All folder moves must use `git mv` so that `git log --follow` continues to show the full history of moved files. | `git log --follow docs/completed/001-init/overview.md` shows commits from before the migration | P0 | 1 |
| REQ-NF-02 | Idempotent migration | Running the migration multiple times must not produce errors or duplicate folders. If a feature is already in the correct lifecycle folder, the migration skips it. | Running migration twice produces the same result as running it once | P1 | 1 |
| REQ-NF-03 | Skill backward compatibility during transition | If a skill encounters a feature folder at the old location (`docs/{NNN}-{feature}/`), it should still work (e.g., by falling back to the old path). This prevents breakage if skills are updated before migration runs. | A skill invoked before migration can still find feature folders at the old path | P2 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Cross-references in existing documents break after migration | Medium | Medium | Use relative paths within feature folders; cross-feature references already use ID-based linking, not file paths | [REQ-PR-04] |
| R-02 | Multiple skills attempt to promote the same feature simultaneously, causing conflicts | Low | Medium | Promotion operations should be idempotent — if the folder is already in the target location, skip the move | [REQ-PR-01], [REQ-PR-02] |
| R-03 | Ptah orchestrator code hardcodes `docs/` paths that don't account for lifecycle subfolders | High | High | Audit all `docs/` path references in `ptah/src/` and update alongside skill changes | [REQ-SK-02] |
| R-04 | NNN numbering conflicts if multiple features are promoted concurrently | Low | Low | Sequential promotion within a single orchestrator process; if needed, use file-based locking | [REQ-PR-03] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 16 | REQ-FS-01, REQ-FS-02, REQ-FS-03, REQ-FS-04, REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-PR-05, REQ-SK-01, REQ-SK-02, REQ-SK-03, REQ-SK-04, REQ-SK-05, REQ-MG-01, REQ-MG-02, REQ-MG-03, REQ-MG-04, REQ-NF-01 |
| P1 | 2 | REQ-PR-04, REQ-NF-02 |
| P2 | 1 | REQ-NF-03 |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 19 | All requirements (single-phase delivery) |

---

## 9. Scope Boundaries

### In Scope

- Creating the three lifecycle folders (`backlog/`, `in-progress/`, `completed/`)
- Migrating all existing feature folders to the correct lifecycle folder
- Updating all four SKILL.md files to reference the new folder structure
- Updating Ptah orchestrator source code to resolve feature paths across lifecycle folders
- Feature promotion logic (backlog→in-progress, in-progress→completed)
- NNN assignment on promotion to in-progress

### Out of Scope

- Changing the internal structure of feature folders (document naming conventions remain the same)
- Automating lifecycle state detection (which features are "completed" vs "in-progress" is determined manually for the initial migration)
- Renumbering existing features (completed features keep their existing NNN)
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

---

*End of Document*
