# Phase 1 Analysis Summary — `ptah init` CLI Command

| Field | Detail |
|-------|--------|
| **Requirements** | REQ-IN-01, REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-05, REQ-IN-06, REQ-NF-06 |
| **User Story** | [US-01](../requirements/REQ-PTAH.md) |
| **Date** | March 8, 2026 |
| **Author** | Backend Engineer |
| **Status** | Questions Resolved — Ready for TSPEC |

---

## 1. Requirements in Scope

| ID | Title | Priority |
|----|-------|----------|
| REQ-IN-01 | Create /docs folder structure | P0 |
| REQ-IN-02 | Seed markdown templates | P0 |
| REQ-IN-03 | Create docs/overview.md | P0 |
| REQ-IN-04 | Create ptah.config.json | P0 |
| REQ-IN-05 | Detect and skip existing files | P0 |
| REQ-IN-06 | Initial Git commit | P0 |
| REQ-NF-06 | Security — secrets from env only | P0 |

---

## 2. What the System Must Do

`ptah init` is a CLI command that scaffolds a Ptah project structure into an existing Git repository:

- Creates `/docs` folder tree: `docs/initial_project/`, `docs/architecture/` (with `decisions/` and `diagrams/`), `docs/open-questions/`, `docs/agent-logs/`, and `docs/overview.md`
- Explicitly excludes `docs/threads/` (replaced by Discord in v4.0)
- Seeds `docs/initial_project/` with 4 blank templates: `requirements.md`, `specifications.md`, `plans.md`, `properties.md`
- Creates `docs/overview.md` with a blank project overview template (sections for project goals, stakeholders, and scope)
- Creates `ptah.config.json` at repo root with all defaults populated (project name/version, agents, Skill paths, Discord server settings, Orchestrator settings, Git commit settings, docs paths — **no secrets**)
- Detects existing files and skips them (no overwrites), reporting what was skipped
- Creates a Git commit with the message: `[ptah] init: scaffolded docs structure`
- Must complete in < 30 seconds (Success Metric from Section 5)

---

## 3. Existing Codebase Review

**Greenfield project.** No source code, package management, or test infrastructure exists.

| Area | Finding |
|------|---------|
| Source code | None — no `src/`, `lib/`, `bin/`, or implementation files |
| Package management | None — no `package.json`, `pyproject.toml`, etc. |
| Test infrastructure | None |
| Existing docs | `docs/requirements/REQ-PTAH.md`, `docs/requirements/traceability-matrix.md`, `docs/templates/*.md` |
| Configuration | `.claude/settings.local.json` only |
| Functional specs | None — all FSPEC-* are "Pending" per the traceability matrix |

---

## 4. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | Git repository root | `ptah init` runs from repo root, creates files, and commits | Must detect Git is initialized (Assumption A-03) |
| 2 | `ptah.config.json` | Config file used by Phase 2+ (`ptah start`) | Schema must be forward-compatible with Orchestrator needs |
| 3 | `/docs` folder structure | Convention used by all agents and the Orchestrator for artifact storage | Must match PRD Section 7 structure exactly |
| 4 | Environment variables | `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY` — referenced in config docs but never stored in files | REQ-NF-06 compliance |

---

## 5. Risks and Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| 1 | **No functional specification exists.** All FSPEC-* for Phase 1 are "Pending." The requirements (REQ-IN-01 through REQ-IN-06) have well-defined acceptance criteria but no formal FSPEC document. Should we proceed with the requirements as the spec, or should a functional spec be written first? | Question | **Resolved — Proceed with requirements as the spec.** Phase 1 (`ptah init`) is a straightforward CLI scaffolding command with well-defined acceptance criteria in the requirements. The requirements are sufficiently detailed and unambiguous for direct technical specification. Writing a separate FSPEC would add overhead without meaningful value for this scope. Skip FSPEC for Phase 1 and proceed directly to TSPEC. (Note: Phase 2+ features with more complex user workflows will require FSPECs.) |
| 2 | **Language/runtime not specified.** The REQ-PTAH document doesn't specify a language. The backend-engineer skill references Python/FastAPI patterns. However, Ptah coordinates Claude agents — should this be TypeScript/Node.js (aligning with Claude Code's ecosystem) or Python? | Question | **Resolved — TypeScript / Node.js.** Three factors drive this decision: (1) **Discord ecosystem alignment** — `discord.js` is the dominant Discord bot library with the largest community and best-maintained API bindings. Python alternatives (`discord.py`) have had maintenance gaps. (2) **Claude Agent SDK alignment** — The Claude Agent SDK TypeScript package has 1.85M+ weekly downloads vs. Python's smaller footprint. Ptah invokes Claude Skills programmatically, so using the same SDK language reduces integration friction. (3) **Single runtime** — Both `ptah init` (CLI) and `ptah start` (Discord bot / Orchestrator) run in the same process context. TypeScript/Node.js handles both CLI tooling and long-running event-driven processes well. Use Node.js 20 LTS or later. |
| 3 | **`ptah.config.json` schema details.** REQ-IN-04 references "PRD Section 8.1" for the config schema defaults. The PRD is a `.docx` file. I need the exact config schema — fields, defaults, and structure. Can you provide the config schema, or should I define it in the TSPEC? | Question | **Resolved — Schema provided from PRD Section 8.1.** The exact default config is provided below in Section 5.1. Use this as the canonical schema. Fields requiring user edit after init: `discord.server_id`, `discord.mention_user_id`, and `project.name`. All other fields have sensible defaults. Secrets (`DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`) are referenced by env var name only — never stored as values. |
| 4 | **Template content for seeded files.** REQ-IN-02 says "4 blank markdown templates" but doesn't specify their contents. The `docs/templates/` folder has existing template files (`requirements-template.md`, `specification-template.md`, etc.) — should those be used as the seed content, or should simpler stubs be created? | Question | **Resolved — Create simple stubs, not copies of `docs/templates/`.** The `docs/templates/` files in this repo are the PM skill's own workflow templates (150-200 lines each with detailed instructions). Those are too heavy for seeded feature files. Instead, create minimal stubs with just the document title and a placeholder line. The agents will populate these files with real content during their work. Example stub for `requirements.md`: `# Requirements\n\n_This file will be populated by the PM Agent._` |
| 5 | **`docs/overview.md` template content.** REQ-IN-03 says "sections for project goals, stakeholders, and scope." Should I define the exact template structure in the TSPEC, or is there an existing template to follow? | Question | **Resolved — Define in TSPEC. Use the following structure.** The PRD (Section 7) confirms `overview.md` serves as "cold-start context loaded by every Skill invocation." The template should include these sections with placeholder text: `# Project Overview`, `## Project Goals` (what the project aims to achieve), `## Stakeholders` (who is involved and their roles), `## Scope` (what is in and out of scope), `## Technical Context` (key technical decisions or constraints). Keep it concise — this file is included in every Context Bundle (Layer 1) so it consumes token budget on every invocation. Define the exact template content in the TSPEC. |
| 6 | **Agent log files.** The folder `docs/agent-logs/` is created by init. Should `ptah init` also pre-create agent log files (e.g., `pm.md`, `dev.md`, `test.md`), or just the empty directory? | Question | **Resolved — Yes, pre-create the three agent log files.** The PRD Section 6.1 CLI output explicitly shows: `✓  Created docs/agent-logs/  (pm-agent.md, dev-agent.md, test-agent.md)`. PRD Section 7 confirms these as `agent-logs/pm-agent.md`, `agent-logs/dev-agent.md`, `agent-logs/test-agent.md`. Pre-create all three with a header line (e.g., `# PM Agent Log\n\n_Entries appended by the Orchestrator after each Skill invocation._`). The file names must match the agent IDs in `ptah.config.json` (`pm-agent`, `dev-agent`, `test-agent`). |
| 7 | **Config references `./ptah/skills/` and `./ptah/templates/` paths.** The config schema (Section 5.1) references `"./ptah/skills/pm-agent.md"` etc. and `"./ptah/templates"`. The current repo has development skills at `.claude/skills/` (used by Claude Code for dev workflow). Are `./ptah/skills/` and `./ptah/templates/` separate directories that Ptah uses at runtime for agent Skill definitions? Should `ptah init` also scaffold these directories and create placeholder skill files? | Question | **Resolved — Yes, scaffold `ptah/` runtime directory with placeholder Skills.** The `./ptah/skills/` directory is separate from `.claude/skills/` — it contains the Ptah agent Skill definitions (system prompts) that the Orchestrator loads at runtime via the Claude Agent SDK. The `.claude/skills/` directory is for the human developer's Claude Code workflow; `./ptah/skills/` is for the Ptah agents. `ptah init` should create: (1) `ptah/skills/pm-agent.md`, `ptah/skills/dev-agent.md`, `ptah/skills/test-agent.md` — placeholder Skill definitions with a header and TODO note. The actual Skill system prompts will be written during Phase 2. (2) `ptah/templates/` — empty directory for future use. This ensures the config paths are valid from day one. New requirement REQ-IN-07 added to REQ-PTAH.md. |
| 8 | **No-op commit behavior.** REQ-IN-06 says create a Git commit. REQ-IN-05 says skip existing files. If `ptah init` is run a second time and all files already exist (everything skipped), should the commit be skipped too (no empty commits)? | Question | **Resolved — Yes, skip the commit if no new files were created.** REQ-IN-06 acceptance criteria already states "GIVEN: I have run `ptah init` and new files were created" — the commit is conditional on new file creation. If all files are skipped (second run), there is nothing to stage and no commit is made. The CLI should report: `ℹ  No new files created — skipping commit.` No empty commits. REQ-IN-06 updated in REQ-PTAH.md to make this explicit. |
| 9 | **CLI arguments.** The config notes that `project.name` defaults to the Git repo directory name. Should `ptah init` accept any CLI arguments (e.g., `ptah init --name my-project`) or is it strictly zero-argument? The requirements only specify `ptah init` with no arguments. | Question | **Resolved — Zero arguments for v4.0.** Constraint C-04 states "Two CLI commands only (`ptah init`, `ptah start`) — all other commands deferred." The PRD Section 6.1 shows `$ ptah init` with no arguments. The `project.name` field is auto-detected from the Git repository directory name (via `path.basename(process.cwd())`) with a fallback to `"my-app"`. Users can edit `ptah.config.json` after init to customize. Adding CLI flags is deferred — keep the interface minimal for v4.0. |
| 10 | **`docs/open-questions/` contents.** The folder `docs/open-questions/` is created by init. REQ-PQ-01 (Phase 5) references `open-questions/pending.md` and REQ-PQ-04 references `open-questions/resolved.md`. Should `ptah init` pre-create these files (like the agent logs), or just the empty directory? | Question | **Resolved — Yes, pre-create both `pending.md` and `resolved.md`.** The PRD Section 6.1 CLI output explicitly shows: `✓  Created docs/open-questions/   (pending.md, resolved.md)`. Both files are referenced by Phase 5 requirements and must exist before the Orchestrator can write to them. Pre-create with a header line (e.g., `# Pending Questions\n\n_Questions from agents will be appended here by the Orchestrator._`). New requirement REQ-IN-08 added to REQ-PTAH.md. |

---

## 5.1 Config Schema Reference (from PRD Section 8.1)

The following is the canonical `ptah.config.json` schema with defaults. Fields marked with `← USER EDIT` require the user to fill in project-specific values after running `ptah init`.

```json
{
  "project": {
    "name":    "my-app",
    "version": "1.0.0"
  },
  "agents": {
    "active": ["pm-agent", "dev-agent", "test-agent"],
    "skills": {
      "pm-agent":   "./ptah/skills/pm-agent.md",
      "dev-agent":  "./ptah/skills/dev-agent.md",
      "test-agent": "./ptah/skills/test-agent.md"
    },
    "model":      "claude-sonnet-4-20250514",
    "max_tokens": 8192
  },
  "discord": {
    "bot_token_env":   "DISCORD_BOT_TOKEN",
    "server_id":       "YOUR_SERVER_ID",
    "channels": {
      "updates":   "agent-updates",
      "questions": "open-questions",
      "debug":     "agent-debug"
    },
    "mention_user_id": "YOUR_USER_ID"
  },
  "orchestrator": {
    "max_turns_per_thread":    10,
    "pending_poll_seconds":    30,
    "retry_attempts":          3
  },
  "git": {
    "commit_prefix": "[ptah]",
    "auto_commit":   true
  },
  "docs": {
    "root":      "docs",
    "templates": "./ptah/templates"
  }
}
```

**Notes:**
- `discord.bot_token_env` and the implicit `ANTHROPIC_API_KEY` reference are env var **names**, not values — REQ-NF-06 compliance
- `discord.server_id` and `discord.mention_user_id` are placeholder strings that the user must replace
- `project.name` defaults to the Git repository directory name (if detectable) or `"my-app"`

---

## 6. Next Step

All open questions (1-10) are resolved. Proceed to **Technical Specification** — producing a `TSPEC-ptah-init.md` document with:

- **TypeScript / Node.js 20 LTS** project setup (package.json, tsconfig, etc.)
- Module architecture for the `ptah init` command (zero CLI arguments)
- Config file schema definition (use Section 5.1 above as canonical reference)
- File/folder manifest with exact template contents for all seeded files, including:
  - `docs/` structure with feature templates, agent logs, and open-questions files
  - `ptah/skills/` placeholder Skill definitions
  - `ptah/templates/` empty directory
- No-op behavior when all files already exist (skip commit)
- Test strategy and test file organization
- Dependency injection approach for filesystem and Git operations

**Requirements updated:** REQ-IN-06 clarified (no-op commit), REQ-IN-07 added (ptah/ runtime directory), REQ-IN-08 added (open-questions files). See REQ-PTAH.md v1.3.

---

*Gate: All questions resolved by Product Manager on March 8, 2026. Backend Engineer may proceed to Technical Specification.*
