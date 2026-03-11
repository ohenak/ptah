# Requirements Document — Phase 1: Init

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P1 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 1 — Init |

---

## 1. Purpose

This document contains the Phase 1 requirements for Ptah v4.0 — the `ptah init` CLI command. Phase 1 delivers the scaffolding command that bootstraps a repository with the folder structure, configuration, Skill definitions, and operational files needed for Ptah's Orchestrator to run.

**Phase 1 deliverables:** One CLI command (`ptah init`) that is safe to run on existing repos, produces a valid configuration, scaffolds all required directories and files, and commits the result.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 1 |
|------------|-------|-----------------------|
| [US-01] | Developer Bootstraps Ptah in an Existing Repository | Primary user story — all Phase 1 requirements trace to this |
| [US-05] | Developer Launches and Monitors the Orchestrator | REQ-NF-06 (security) ensures secrets are env-only, enabling safe `ptah start` in later phases |

---

## 3. Functional Requirements

### 3.1 Init (IN)

#### REQ-IN-01: Create /docs Folder Structure

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-01 |
| **Title** | Create /docs folder structure |
| **Description** | `ptah init` shall create the `/docs` folder structure as defined in PRD Section 7: `docs/initial_project/`, `docs/architecture/` (with `decisions/` and `diagrams/` subdirs), `docs/open-questions/`, `docs/agent-logs/`, and `docs/overview.md`. The `/docs/threads/` directory is explicitly excluded. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have a Git repository without Ptah scaffolding WHEN: I run `ptah init` THEN: The `/docs` folder structure is created with all required subdirectories and no `docs/threads/` directory exists |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-02: Seed Markdown Templates

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-02 |
| **Title** | Seed feature folders with blank markdown templates |
| **Description** | `ptah init` shall populate each feature folder (starting with `initial_project/`) with 4 blank markdown templates: `requirements.md`, `specifications.md`, `plans.md`, and `properties.md`. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I inspect `docs/initial_project/` THEN: Four blank template files exist: `requirements.md`, `specifications.md`, `plans.md`, `properties.md` |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

#### REQ-IN-03: Create docs/overview.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-03 |
| **Title** | Create project overview template |
| **Description** | `ptah init` shall create `docs/overview.md` with a blank project overview template that serves as cold-start context for all agent invocations. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I open `docs/overview.md` THEN: A blank project overview template exists with sections for project goals, stakeholders, scope, and technical context |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

#### REQ-IN-04: Create ptah.config.json

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-04 |
| **Title** | Generate configuration file with defaults |
| **Description** | `ptah init` shall create `ptah.config.json` at the repo root with all defaults populated: project name/version, active agents, Skill paths, Discord server settings (requiring user edit), Orchestrator settings (max turns, poll interval, retry attempts), Git commit settings, and docs paths. The config file is committed to the repo (OQ-004 resolved: yes). It contains no secrets — `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` are env-only. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I open `ptah.config.json` THEN: A valid JSON config file exists with all default fields populated as defined in PRD Section 8.1 |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-05: Skip Existing Content

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-05 |
| **Title** | Detect and skip existing files |
| **Description** | `ptah init` shall detect existing `/docs` content and `ptah.config.json`. If files already exist, init shall report them and skip — not overwrite — any files already present. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have an existing `/docs` folder or `ptah.config.json` in my repo WHEN: I run `ptah init` THEN: Existing files are reported as skipped and their contents are preserved unchanged |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-06: Initial Git Commit

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-06 |
| **Title** | Commit scaffolded structure |
| **Description** | `ptah init` shall create an initial Git commit with the message: `[ptah] init: scaffolded docs structure`. If no new files were created (all files already exist and were skipped per [REQ-IN-05]), the commit shall be skipped — no empty commits. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` and new files were created WHEN: I check `git log` THEN: The most recent commit has the message `[ptah] init: scaffolded docs structure` and contains all scaffolded files. If no new files were created (all skipped), no commit is made. |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01], [REQ-IN-02], [REQ-IN-03], [REQ-IN-04] |

#### REQ-IN-07: Scaffold Skills from Existing .claude/skills/

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-07 |
| **Title** | Copy existing Claude Code skills as agent Skill definitions |
| **Description** | `ptah init` shall leverage the existing `.claude/skills/` directory as the source for agent Skill definitions. Instead of creating placeholder files under `ptah/skills/`, init shall copy the existing Claude Code skill markdown files into the scaffolded `ptah/skills/` directory, mapping them to Ptah agent roles: `.claude/skills/product-manager/SKILL.md` → `ptah/skills/pm-agent.md`, `.claude/skills/backend-engineer/SKILL.md` → `ptah/skills/dev-agent.md`, `.claude/skills/frontend-engineer/SKILL.md` → `ptah/skills/frontend-agent.md`, `.claude/skills/test-engineer/SKILL.md` → `ptah/skills/test-agent.md`. Init shall also create an empty `ptah/templates/` directory. These paths are referenced by `ptah.config.json` (`agents.skills` and `docs.templates`). If a source skill file does not exist under `.claude/skills/`, init shall fall back to creating a placeholder file with a header and TODO note for that agent. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have `.claude/skills/product-manager/SKILL.md`, `.claude/skills/backend-engineer/SKILL.md`, `.claude/skills/frontend-engineer/SKILL.md`, and `.claude/skills/test-engineer/SKILL.md` in my repo WHEN: I run `ptah init` THEN: `ptah/skills/pm-agent.md`, `ptah/skills/dev-agent.md`, `ptah/skills/frontend-agent.md`, `ptah/skills/test-agent.md` contain the content copied from their respective `.claude/skills/` sources, `ptah/templates/` exists as an empty directory, and all paths referenced in `ptah.config.json` are valid |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-04] |

#### REQ-IN-08: Pre-create Operational Files

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-08 |
| **Title** | Pre-create agent log files and open-questions files |
| **Description** | `ptah init` shall pre-create the following operational files with header stubs: (1) `docs/agent-logs/pm-agent.md`, `docs/agent-logs/dev-agent.md`, `docs/agent-logs/frontend-agent.md`, `docs/agent-logs/test-agent.md` — one per active agent, matching agent IDs in `ptah.config.json`. (2) `docs/open-questions/pending.md` and `docs/open-questions/resolved.md` — used by the Orchestrator in Phase 5 for user question routing. File names for agent logs must match the agent IDs in the config. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I inspect `docs/agent-logs/` and `docs/open-questions/` THEN: Four agent log files exist (`pm-agent.md`, `dev-agent.md`, `frontend-agent.md`, `test-agent.md`) and two open-questions files exist (`pending.md`, `resolved.md`), each with a header stub |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-06 | Security | `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` are loaded from environment only — never in config files or /docs | No secrets appear in `ptah.config.json`, any `/docs` file, or Git history | P0 | Phase 1 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-03 | (Indirect) Scaffolded structure must accommodate future review loop patterns | Low | Low | Structure follows PRD Section 7 conventions; future phases build on it | [REQ-IN-01], [REQ-IN-02] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 9 | REQ-IN-01, REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-05, REQ-IN-06, REQ-IN-07, REQ-IN-08, REQ-NF-06 |
| P1 | 0 | — |

**Specification status:** All 9 requirements are specified in [TSPEC-ptah-init](../specifications/001-TSPEC-ptah-init.md).

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
