# Test Properties Document

## Ptah Init Command

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-ptah-init |
| **Requirements** | [REQ-IN-01 through REQ-IN-08, REQ-NF-06](../requirements/REQ-PTAH.md) |
| **Specifications** | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) |
| **Execution Plan** | N/A — not yet created |
| **Version** | 1.2 |
| **Date** | March 8, 2026 |
| **Author** | Test Engineer |
| **Status** | In Review |
| **Approval Date** | Pending |

---

## 1. Overview

This properties document catalogs every testable invariant for the `ptah init` CLI command — a TypeScript/Node.js command that scaffolds the Ptah project structure (directories, template files, config, and Git commit) into an existing Git repository. All properties trace to REQ-IN-01 through REQ-IN-08, REQ-NF-06, and TSPEC-ptah-init.md.

### 1.1 Scope

**In scope:**
- InitCommand behavior: directory creation, file creation, skip-existing logic, Git operations
- FileSystem and GitClient protocol compliance
- ptah.config.json generation and content correctness
- Error handling for all failure modes defined in TSPEC Section 8
- Idempotency guarantees (REQ-IN-05)
- Console output formatting (TSPEC Section 6, steps 5-7)
- Security constraint: no secrets in generated files (REQ-NF-06)

**Out of scope:**
- Phase 2+ features (Orchestrator, Discord, context assembly)
- CI/CD pipeline configuration
- CLI argument parsing beyond `init` subcommand
- NodeFileSystem and NodeGitClient integration with real OS/Git (covered by integration tests in plan augmentation phase)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 9 | [REQ-IN-01 through REQ-IN-08, REQ-NF-06](../requirements/REQ-PTAH.md) |
| Specifications analyzed | 1 | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) |
| Plan tasks reviewed | 0 | N/A — not yet created |
| Integration boundaries identified | 5 | package.json bin, ptah.config.json schema, ptah/skills/ paths, docs/ structure, Git working tree |
| Implementation files reviewed | 0 | N/A — not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 9 | REQ-IN-01, REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-06, REQ-IN-07, REQ-IN-08 | Unit |
| Contract | 2 | TSPEC §4.2 | Unit |
| Error Handling | 6 | TSPEC §6, §8 | Unit |
| Data Integrity | 8 | REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-07, REQ-IN-08 | Unit |
| Idempotency | 4 | REQ-IN-05, REQ-IN-06 | Unit |
| Integration | 4 | TSPEC §4.4, §7.2, §8 | Integration |
| Performance | 1 | TSPEC §9.3 | Integration |
| Security | 1 | REQ-NF-06 | Unit |
| Observability | 4 | TSPEC §6 | Unit |
| **Total** | **39** | | |

**Negative properties** (Section 4): **6** additional properties defining prohibited behaviors.

**Grand total:** **45** testable properties.

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-IN-{NUMBER}` — domain prefix `IN` matches the Init specification domain.

**Priority:** All source requirements are P0, so all properties inherit P0 unless noted.

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-01 | InitCommand must create all 9 directories from the manifest when none exist | REQ-IN-01, REQ-IN-07, TSPEC §5.1 | Unit | P0 |
| PROP-IN-02 | InitCommand must create all 17 files (14 content + 3 `.gitkeep`) when none exist | REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-07, REQ-IN-08, TSPEC §5.2 | Unit | P0 |
| PROP-IN-03 | InitCommand must exclude `docs/threads/` directory from the manifest | REQ-IN-01 (C-07) | Unit | P0 |
| PROP-IN-04 | InitCommand must auto-detect project name from `path.basename(process.cwd())` for `ptah.config.json` | REQ-IN-04, TSPEC §5.2 | Unit | P0 |
| PROP-IN-05 | InitCommand must use `"my-app"` as project name fallback when basename returns empty string | REQ-IN-04, TSPEC §5.2 | Unit | P0 |
| PROP-IN-06 | InitCommand must create git commit with message `[ptah] init: scaffolded docs structure` when `created[]` is non-empty | REQ-IN-06, TSPEC §6 step 7 | Unit | P0 |
| PROP-IN-07 | InitCommand must skip git commit when `created[]` is empty (all files already exist) | REQ-IN-06, TSPEC §6 step 6 | Unit | P0 |
| PROP-IN-08 | InitCommand must `git add` only the paths in `created[]` before committing | REQ-IN-06, TSPEC §6 step 7 | Unit | P0 |
| PROP-IN-09 | InitCommand must return `InitResult` with `created: string[]`, `skipped: string[]`, `committed: boolean` | TSPEC §4.2 | Unit | P0 |

### 3.2 Contract Properties

Protocol compliance and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-10 | `NodeFileSystem` must implement the `FileSystem` protocol (`exists`, `mkdir`, `writeFile`, `cwd`, `basename`) | TSPEC §4.2, §4.3 | Unit | P0 |
| PROP-IN-11 | `NodeGitClient` must implement the `GitClient` protocol (`isRepo`, `hasStagedChanges`, `add`, `commit`) | TSPEC §4.2, §4.3 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-12 | InitCommand must exit with error `"Not a Git repository. Run 'git init' first."` when `git.isRepo()` returns false | TSPEC §6 step 1, §8 | Unit | P0 |
| PROP-IN-13 | InitCommand must exit with error `"Staged changes detected. Please commit or stash them before running 'ptah init'."` when `git.hasStagedChanges()` returns true | TSPEC §6 step 2, §8 | Unit | P0 |
| PROP-IN-14 | InitCommand must exit with error when Git is not installed (git CLI not found) | TSPEC §8 | Unit | P0 |
| PROP-IN-15 | InitCommand must propagate error when file write permission is denied | TSPEC §8 | Unit | P0 |
| PROP-IN-16 | InitCommand must propagate error when `git add` fails (created files remain on disk) | TSPEC §8 | Unit | P0 |
| PROP-IN-17 | InitCommand must propagate error when `git commit` fails (created files remain on disk) | TSPEC §8 | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-18 | `docs/overview.md` must contain sections for project goals, stakeholders, scope, and technical context | REQ-IN-03, TSPEC §5.2 | Unit | P0 |
| PROP-IN-19 | `docs/initial_project/` must contain 4 template files (`requirements.md`, `specifications.md`, `plans.md`, `properties.md`) with correct header stubs | REQ-IN-02, TSPEC §5.2 | Unit | P0 |
| PROP-IN-20 | `ptah.config.json` must contain all required default fields (`project`, `agents`, `discord`, `orchestrator`, `git`, `docs`) with correct default values: `agents.model` = `"claude-sonnet-4-6"`, `agents.active` = `["pm-agent", "dev-agent", "test-agent"]`, `orchestrator.max_turns_per_thread` = `10`, `orchestrator.retry_attempts` = `3`, `git.commit_prefix` = `"[ptah]"`, `git.auto_commit` = `true` | REQ-IN-04, TSPEC §5.2 | Unit | P0 |
| PROP-IN-21 | `.gitkeep` files must be empty (zero bytes) in `docs/architecture/decisions/`, `docs/architecture/diagrams/`, `ptah/templates/` | TSPEC §5.2 | Unit | P0 |
| PROP-IN-22 | Agent log files (`pm-agent.md`, `dev-agent.md`, `test-agent.md`) must contain correct header stubs and match agent IDs in config | REQ-IN-08, TSPEC §5.2 | Unit | P0 |
| PROP-IN-23 | Skill placeholder files (`ptah/skills/pm-agent.md`, `dev-agent.md`, `test-agent.md`) must contain correct placeholder content | REQ-IN-07, TSPEC §5.2 | Unit | P0 |
| PROP-IN-43 | `docs/open-questions/pending.md` must contain header `"# Pending Questions"` with stub `"_Questions from agents will be appended here by the Orchestrator._"`, and `docs/open-questions/resolved.md` must contain header `"# Resolved Questions"` with stub `"_Answered questions are moved here from pending.md by the Orchestrator._"` | REQ-IN-08, TSPEC §5.2 | Unit | P0 |
| PROP-IN-44 | `ptah.config.json` `agents.skills` paths must match the actual scaffolded skill file paths (e.g., `"./ptah/skills/pm-agent.md"` must correspond to a created file) | REQ-IN-07, TSPEC §11 #3 | Unit | P0 |

### 3.5 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-24 | InitCommand must skip existing files without modifying their content | REQ-IN-05, TSPEC §6 step 4b | Unit | P0 |
| PROP-IN-25 | InitCommand must report skipped files in `InitResult.skipped[]` | REQ-IN-05, TSPEC §6 step 4b | Unit | P0 |
| PROP-IN-26 | InitCommand must not add existing directories to `skipped[]` — only files are tracked in `skipped[]` | TSPEC §6 step 4a | Unit | P0 |
| PROP-IN-27 | Running InitCommand twice on the same repo must produce identical filesystem state (second run creates nothing, skips all) | REQ-IN-05, REQ-IN-06 | Unit | P0 |

### 3.6 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-28 | Composition root must wire `NodeFileSystem` and `NodeGitClient` into `InitCommand` | TSPEC §4.4 | Integration | P0 |
| PROP-IN-30 | `NodeGitClient.isRepo()` must invoke `git rev-parse --is-inside-work-tree` and return boolean | TSPEC §7.2 | Integration | P0 |
| PROP-IN-31 | `NodeGitClient.hasStagedChanges()` must invoke `git diff --cached --quiet` and return true when exit code is 1 | TSPEC §7.2 | Integration | P0 |
| PROP-IN-46 | CLI must exit with code 0 on success and code 1 on any error (not a git repo, staged changes, permission denied, git failure) | TSPEC §8 | Integration | P0 |

### 3.7 Performance Properties

Response times and timeout behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-45 | `InitCommand.execute()` must complete within 30 seconds | TSPEC §9.3 | Integration | P0 |

### 3.8 Security Properties

Secrets handling.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-32 | `ptah.config.json` must reference `DISCORD_BOT_TOKEN` only as an env var name (via `discord.bot_token_env` field), never as a literal secret value. `ANTHROPIC_API_KEY` must not appear in the config file in any form — it is consumed by the Claude Agent SDK from the environment directly | REQ-NF-06, TSPEC §5.2 | Unit | P0 |

### 3.9 Observability Properties

Console output formatting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-33 | InitCommand must print `"✓  Created {path}"` for each created item | TSPEC §6 step 5 | Unit | P0 |
| PROP-IN-34 | InitCommand must print `"⊘  Skipped {path} (exists)"` for each skipped item | TSPEC §6 step 5 | Unit | P0 |
| PROP-IN-35 | InitCommand must print `"ℹ  No new files created — skipping commit."` when `created[]` is empty | TSPEC §6 step 6 | Unit | P0 |
| PROP-IN-36 | InitCommand must print `"✓  Committed: [ptah] init: scaffolded docs structure"` after successful commit | TSPEC §6 step 7 | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. Derived from specification constraints and the inverse of positive properties.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-37 | InitCommand must not create `docs/threads/` directory | REQ-IN-01 (C-07) | Unit | P0 |
| PROP-IN-38 | InitCommand must not overwrite existing files — existing content must be preserved byte-for-byte | REQ-IN-05 | Unit | P0 |
| PROP-IN-39 | `ptah.config.json` must not contain any literal secret values; `ANTHROPIC_API_KEY` must not appear in the config file in any form (not as a key, value, or comment) | REQ-NF-06 | Unit | P0 |
| PROP-IN-40 | InitCommand must not create empty git commits when all files are skipped | REQ-IN-06 | Unit | P0 |
| PROP-IN-41 | InitCommand must not call `fs.mkdir`, `fs.writeFile`, `git.add`, or `git.commit` when `git.hasStagedChanges()` returns true | TSPEC §6 step 2 | Unit | P0 |
| PROP-IN-42 | InitCommand must not perform partial rollback on failure — created files remain on disk | TSPEC §8 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-IN-01 | PROP-IN-01, PROP-IN-03, PROP-IN-37 | Full |
| REQ-IN-02 | PROP-IN-02, PROP-IN-19 | Full |
| REQ-IN-03 | PROP-IN-02, PROP-IN-18 | Full |
| REQ-IN-04 | PROP-IN-02, PROP-IN-04, PROP-IN-05, PROP-IN-20 | Full |
| REQ-IN-05 | PROP-IN-24, PROP-IN-25, PROP-IN-26, PROP-IN-27, PROP-IN-38 | Full |
| REQ-IN-06 | PROP-IN-06, PROP-IN-07, PROP-IN-08, PROP-IN-40 | Full |
| REQ-IN-07 | PROP-IN-01, PROP-IN-02, PROP-IN-23, PROP-IN-44 | Full |
| REQ-IN-08 | PROP-IN-02, PROP-IN-22, PROP-IN-43 | Full |
| REQ-NF-06 | PROP-IN-32, PROP-IN-39 | Full |

### 5.2 Specification Coverage

| Specification Section | Properties | Coverage |
|-----------------------|------------|----------|
| TSPEC §4.2 (Protocols) | PROP-IN-09, PROP-IN-10, PROP-IN-11 | Full |
| TSPEC §4.4 (Composition Root) | PROP-IN-28 | Full |
| TSPEC §5.1 (Directories) | PROP-IN-01, PROP-IN-03, PROP-IN-37 | Full |
| TSPEC §5.2 (Files) | PROP-IN-02, PROP-IN-18, PROP-IN-19, PROP-IN-20, PROP-IN-21, PROP-IN-22, PROP-IN-23, PROP-IN-43, PROP-IN-44 | Full |
| TSPEC §6 (Algorithm) | PROP-IN-04, PROP-IN-05, PROP-IN-06, PROP-IN-07, PROP-IN-08, PROP-IN-24, PROP-IN-25, PROP-IN-26, PROP-IN-33, PROP-IN-34, PROP-IN-35, PROP-IN-36, PROP-IN-41 | Full |
| TSPEC §7.2 (Git Service) | PROP-IN-30, PROP-IN-31 | Full |
| TSPEC §8 (Error Handling) | PROP-IN-12, PROP-IN-13, PROP-IN-14, PROP-IN-15, PROP-IN-16, PROP-IN-17, PROP-IN-42, PROP-IN-46 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 9 | 9 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 -- not needed for Phase 1
       /----------\
      / Integration \      5 -- composition root, git CLI wiring, performance guard, exit codes
     /----------------\
    /    Unit Tests     \  40 -- all functional, error, data, idempotency, observability, security
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 40 | 89% |
| Integration | 5 | 11% |
| E2E (candidates) | 0 | 0% |
| **Total** | **45** | **100%** |

**E2E justification:** No E2E tests are needed. The protocol-based architecture with dependency injection means all InitCommand behavior can be verified at the unit level using `FakeFileSystem` and `FakeGitClient`. The 4 integration properties verify real `NodeFileSystem`/`NodeGitClient` wiring and performance — they do not require a full-stack E2E test.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | No property for CLI entry point (`bin/ptah.ts`) argument parsing | If `ptah init` subcommand routing is wrong, none of the properties fire | Low | Defer to plan augmentation — this is a thin composition root concern. An integration test for the CLI entry point would cover it. |
| 2 | No property for `NodeFileSystem.mkdir` recursive behavior | The spec states `{ recursive: true }` but no property explicitly asserts recursive creation | Low | Covered implicitly by PROP-IN-01 (creates all 9 directories). If a dedicated `NodeFileSystem` integration test is added, it should assert recursive behavior. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 8, 2026 | Test Engineer | Initial properties document — 42 properties across 8 categories derived from 9 requirements and TSPEC-ptah-init (Rev 3) |
| 1.1 | March 8, 2026 | Test Engineer | PM review feedback addressed (Q1-Q7): reordered sections to match ID sequence; fixed PROP-IN-32/39 ANTHROPIC_API_KEY accuracy; added PROP-IN-43 (open-questions content), PROP-IN-44 (config-skills path consistency, reclassified from Integration to Unit), PROP-IN-45 (performance guard); expanded PROP-IN-20 with specific default values; refined PROP-IN-41 precision. Total: 44 properties. |
| 1.2 | March 8, 2026 | Backend Engineer | TE plan review feedback: added PROP-IN-46 (CLI exit codes — TSPEC §8, Integration level) to close two-way traceability gap identified in plan review Q4. Total: 45 properties. |

---

*End of Document*
