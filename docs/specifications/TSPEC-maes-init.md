# Technical Specification: `maes init` CLI Command

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-IN-01](../requirements/REQ-MAES.md) through [REQ-IN-08](../requirements/REQ-MAES.md), [REQ-NF-06](../requirements/REQ-MAES.md) |
| **Analysis** | [ANALYSIS-maes-init.md](./ANALYSIS-maes-init.md) |
| **Date** | March 8, 2026 |
| **Status** | Draft (Rev 3 — PM + TE review feedback addressed) |

---

## 1. Summary

A TypeScript/Node.js CLI command (`maes init`) that scaffolds the MAES project structure into an existing Git repository. It creates the `/docs` folder hierarchy, `maes/` runtime directory, `maes.config.json`, seeds template files, and commits the result — all idempotently (existing files are skipped, not overwritten).

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Discord.js + Claude Agent SDK alignment (Analysis Q2) |
| Language | TypeScript 5.x | Type safety, IDE support |
| Package manager | npm | Standard, no additional tooling |
| Test framework | Vitest | Fast, ESM-native, TS-first |
| CLI entry point | `bin/maes.ts` via `tsx` | Zero-compile dev workflow; `tsc` for production build |
| Build | `tsc` → `dist/` | Standard TS compilation |

**No external dependencies for Phase 1.** The init command uses only Node.js built-in modules (`fs`, `path`, `child_process`). Third-party packages (discord.js, @anthropic-ai/sdk) are deferred to Phase 2+.

---

## 3. Project Structure

```
maes/                          ← npm package root (new)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── bin/
│   └── maes.ts                ← CLI entry point
├── src/
│   ├── commands/
│   │   └── init.ts            ← maes init command logic
│   ├── services/
│   │   ├── filesystem.ts      ← FileSystem protocol + NodeFileSystem impl
│   │   └── git.ts             ← GitClient protocol + NodeGitClient impl
│   ├── config/
│   │   └── defaults.ts        ← Default config schema + file manifests
│   └── types.ts               ← Shared types
└── tests/
    ├── unit/
    │   ├── commands/
    │   │   └── init.test.ts
    │   ├── services/
    │   │   ├── filesystem.test.ts
    │   │   └── git.test.ts
    │   └── config/
    │       └── defaults.test.ts
    └── fixtures/
        └── factories.ts       ← Test doubles and factories
```

**Note:** The `maes/` package directory is at the repo root, alongside `docs/` and `.claude/`. This is the MAES framework source code — not to be confused with the `maes/` runtime directory that `maes init` scaffolds inside target repos.

Wait — naming collision. The MAES source code package and the scaffolded `maes/` runtime directory inside target repos share the same name. To avoid confusion:

- **MAES source code** lives in this repo's root as an npm package (with `package.json`, `src/`, etc.)
- **Scaffolded `maes/` directory** is what `maes init` creates inside the *target* repo where the user runs the command

When developing MAES itself, running `maes init` in the MAES source repo would create a `maes/skills/` and `maes/templates/` directory alongside the source `src/`. This is acceptable — the scaffolded files don't conflict with the source code.

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/maes.ts
  └── src/commands/init.ts (InitCommand)
        ├── src/services/filesystem.ts (FileSystem protocol)
        └── src/services/git.ts (GitClient protocol)
```

### 4.2 Protocols (Interfaces)

```typescript
// src/services/filesystem.ts

interface FileSystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;       // recursive
  writeFile(path: string, content: string): Promise<void>;
  cwd(): string;
  basename(path: string): string;
}
```

```typescript
// src/services/git.ts

interface GitClient {
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;     // pre-existing staged changes
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
}
```

```typescript
// src/commands/init.ts

interface InitResult {
  created: string[];      // files/dirs created
  skipped: string[];      // files/dirs that already existed
  committed: boolean;     // whether a Git commit was made
}

class InitCommand {
  constructor(
    private fs: FileSystem,
    private git: GitClient,
  ) {}

  async execute(): Promise<InitResult>;
}
```

### 4.3 Concrete Implementations

- `NodeFileSystem` — wraps `node:fs/promises` and `node:path`
- `NodeGitClient` — wraps `child_process.execFile` for `git` CLI calls

### 4.4 Composition Root

```typescript
// bin/maes.ts
const fs = new NodeFileSystem();
const git = new NodeGitClient();
const command = new InitCommand(fs, git);
const result = await command.execute();
// Print results to console
```

---

## 5. File Manifest

The following is the complete list of files and directories that `maes init` creates. Each entry includes the exact content for files with content.

### 5.1 Directories (created empty or as parents)

| Path | REQ |
|------|-----|
| `docs/` | REQ-IN-01 |
| `docs/initial_project/` | REQ-IN-01 |
| `docs/architecture/` | REQ-IN-01 |
| `docs/architecture/decisions/` | REQ-IN-01 |
| `docs/architecture/diagrams/` | REQ-IN-01 |
| `docs/open-questions/` | REQ-IN-01 |
| `docs/agent-logs/` | REQ-IN-01 |
| `maes/skills/` | REQ-IN-07 |
| `maes/templates/` | REQ-IN-07 |

**Excluded:** `docs/threads/` (C-07)

**Empty directory handling:** Git does not track empty directories. Directories that contain no files in the manifest get a `.gitkeep` placeholder file to ensure they survive `git clone`. These are: `docs/architecture/decisions/`, `docs/architecture/diagrams/`, and `maes/templates/`. The `.gitkeep` files are empty (zero bytes).

### 5.2 Files with Content

#### docs/overview.md (REQ-IN-03)

```markdown
# Project Overview

## Project Goals

_Describe what this project aims to achieve._

## Stakeholders

_List who is involved and their roles._

## Scope

_Define what is in scope and out of scope._

## Technical Context

_Key technical decisions, constraints, or dependencies._
```

#### docs/initial_project/requirements.md (REQ-IN-02)

```markdown
# Requirements

_This file will be populated by the PM Agent._
```

#### docs/initial_project/specifications.md (REQ-IN-02)

```markdown
# Specifications

_This file will be populated by the PM Agent._
```

#### docs/initial_project/plans.md (REQ-IN-02)

```markdown
# Plans

_This file will be populated by the Dev Agent._
```

#### docs/initial_project/properties.md (REQ-IN-02)

```markdown
# Properties

_This file will be populated by the Test Agent._
```

#### docs/agent-logs/pm-agent.md (REQ-IN-08)

```markdown
# PM Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
```

#### docs/agent-logs/dev-agent.md (REQ-IN-08)

```markdown
# Dev Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
```

#### docs/agent-logs/test-agent.md (REQ-IN-08)

```markdown
# Test Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
```

#### docs/open-questions/pending.md (REQ-IN-08)

```markdown
# Pending Questions

_Questions from agents will be appended here by the Orchestrator._
```

#### docs/open-questions/resolved.md (REQ-IN-08)

```markdown
# Resolved Questions

_Answered questions are moved here from pending.md by the Orchestrator._
```

#### maes/skills/pm-agent.md (REQ-IN-07)

```markdown
# PM Agent Skill

<!-- TODO: Define the PM Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the PM Agent's role prompt. -->
```

#### maes/skills/dev-agent.md (REQ-IN-07)

```markdown
# Dev Agent Skill

<!-- TODO: Define the Dev Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the Dev Agent's role prompt. -->
```

#### maes/skills/test-agent.md (REQ-IN-07)

```markdown
# Test Agent Skill

<!-- TODO: Define the Test Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the Test Agent's role prompt. -->
```

#### docs/architecture/decisions/.gitkeep (REQ-IN-01)

Empty file (zero bytes). Ensures directory survives `git clone`.

#### docs/architecture/diagrams/.gitkeep (REQ-IN-01)

Empty file (zero bytes). Ensures directory survives `git clone`.

#### maes/templates/.gitkeep (REQ-IN-07)

Empty file (zero bytes). Ensures directory survives `git clone`.

#### maes.config.json (REQ-IN-04)

The `project.name` field is auto-detected from the current directory name via `path.basename(process.cwd())`, with fallback to `"my-app"` when `basename()` returns an empty string (e.g., running from the filesystem root `/`). The fallback condition is strictly: `basename === "" ? "my-app" : basename`.

```json
{
  "project": {
    "name": "<detected-dir-name>",
    "version": "1.0.0"
  },
  "agents": {
    "active": ["pm-agent", "dev-agent", "test-agent"],
    "skills": {
      "pm-agent": "./maes/skills/pm-agent.md",
      "dev-agent": "./maes/skills/dev-agent.md",
      "test-agent": "./maes/skills/test-agent.md"
    },
    "model": "claude-sonnet-4-6",
    "max_tokens": 8192
  },
  "discord": {
    "bot_token_env": "DISCORD_BOT_TOKEN",
    "server_id": "YOUR_SERVER_ID",
    "channels": {
      "updates": "agent-updates",
      "questions": "open-questions",
      "debug": "agent-debug"
    },
    "mention_user_id": "YOUR_USER_ID"
  },
  "orchestrator": {
    "max_turns_per_thread": 10,
    "pending_poll_seconds": 30,
    "retry_attempts": 3
  },
  "git": {
    "commit_prefix": "[MAES]",
    "auto_commit": true
  },
  "docs": {
    "root": "docs",
    "templates": "./maes/templates"
  }
}
```

**Security (REQ-NF-06):** `discord.bot_token_env` is the env var *name*, not a secret value. `ANTHROPIC_API_KEY` is consumed by the Claude Agent SDK from the environment directly — it does not appear in the config file.

---

## 6. Init Command Algorithm

```
1. Check Git is initialized (git.isRepo())
   → If not, exit with error: "Not a Git repository. Run 'git init' first."

2. Check for pre-existing staged changes (git.hasStagedChanges())
   → If staged changes exist, exit with error:
     "Staged changes detected. Please commit or stash them before running 'maes init'."
   → This prevents polluting the [MAES] init commit with unrelated user changes.

3. Build file manifest (all files from Section 5)

4. For each entry in manifest:
   a. If directory: check exists → if not, mkdir(recursive) → add to created[]
      (If directory already exists, silently continue — directories are NOT added to skipped[].
       Only files are tracked in skipped[], per REQ-IN-05 "existing files".)
   b. If file: check exists → if exists, add to skipped[] → if not, writeFile → add to created[]

5. Print results:
   ✓  Created {path}          (for each created item)
   ⊘  Skipped {path} (exists)  (for each skipped item)

6. If created[] is empty:
   → Print: "ℹ  No new files created — skipping commit."
   → Return { created: [], skipped: [...], committed: false }

7. If created[] is non-empty:
   a. git.add(created)
   b. git.commit("[MAES] init: scaffolded docs structure")
      (Commit message is hardcoded — not derived from config `git.commit_prefix`.
       The config file is being created during this very operation, so it cannot
       be read yet. The `[MAES]` prefix is a compile-time constant.)
   → Print: "✓  Committed: [MAES] init: scaffolded docs structure"
   → Return { created: [...], skipped: [...], committed: true }
```

---

## 7. Service Architecture

### 7.1 FileSystem Service

| Method | Behavior |
|--------|----------|
| `exists(path)` | Returns true if path exists (file or directory) |
| `mkdir(path)` | Creates directory recursively (`{ recursive: true }`) |
| `writeFile(path, content)` | Writes UTF-8 string to file. Parent directories are expected to already exist (created by prior `mkdir` calls in Algorithm step 4a). The `NodeFileSystem` implementation may defensively create parents as a safety net, but the algorithm does not rely on this — `mkdir` is the authoritative directory creation path. |
| `cwd()` | Returns `process.cwd()` |
| `basename(path)` | Returns last segment of path |

**Implementation:** `NodeFileSystem` wraps `node:fs/promises` (`access`, `mkdir`, `writeFile`) and `node:path` (`basename`).

### 7.2 Git Service

| Method | Behavior |
|--------|----------|
| `isRepo()` | Runs `git rev-parse --is-inside-work-tree`, returns true/false |
| `hasStagedChanges()` | Runs `git diff --cached --quiet`, returns true if exit code is 1 (pre-existing staged changes) |
| `add(paths)` | Runs `git add <paths>` |
| `commit(message)` | Runs `git commit -m <message>` |

**Implementation:** `NodeGitClient` uses `child_process.execFile` to invoke the `git` CLI. Errors are caught and mapped to typed errors.

---

## 8. Error Handling

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| Not a Git repository | Print error message and exit | 1 |
| Pre-existing staged changes | Print error message and exit (before any file operations) | 1 |
| Git not installed | Print error message and exit | 1 |
| Permission denied on file write | Print error and exit | 1 |
| Git add fails | Print error (files are already created on disk) | 1 |
| Git commit fails | Print error (files are already created on disk) | 1 |

No partial rollback — if some files are created and the commit fails, the created files remain on disk. The user can re-run `maes init` safely (idempotent).

---

## 9. Test Strategy

### 9.1 Approach

All tests use **injected test doubles** — no filesystem I/O, no Git subprocess calls. The `FileSystem` and `GitClient` protocols enable full in-memory testing.

### 9.2 Test Doubles

```typescript
// tests/fixtures/factories.ts

class FakeFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  // Pre-populate to simulate existing files
  addExisting(path: string, content?: string): void;

  // Protocol methods — operate on in-memory maps
  async exists(path: string): Promise<boolean>;
  async mkdir(path: string): Promise<void>;
  async writeFile(path: string, content: string): Promise<void>;
  cwd(): string;
  basename(path: string): string;

  // Test assertions
  getFile(path: string): string | undefined;
  hasDir(path: string): boolean;
}

class FakeGitClient implements GitClient {
  isRepoReturn = true;
  hasStagedReturn = false;
  addedPaths: string[][] = [];
  commits: string[] = [];

  async isRepo(): Promise<boolean>;
  async hasStagedChanges(): Promise<boolean>;
  async add(paths: string[]): Promise<void>;
  async commit(message: string): Promise<void>;
}
```

### 9.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| Directory creation | All 9 directories created per manifest | `tests/unit/commands/init.test.ts` |
| File creation | All 17 files created with correct content (14 content files + 3 `.gitkeep`) | `tests/unit/commands/init.test.ts` |
| Skip existing | Existing files preserved, reported as skipped | `tests/unit/commands/init.test.ts` |
| Git commit | Commit made when files created, skipped when no-op | `tests/unit/commands/init.test.ts` |
| Staged changes guard | Error when pre-existing staged changes detected | `tests/unit/commands/init.test.ts` |
| Git not initialized | Error when not in a Git repo | `tests/unit/commands/init.test.ts` |
| Git add/commit failure | Error propagation when git add or commit fails, files remain on disk | `tests/unit/commands/init.test.ts` |
| Exclusion: docs/threads/ | `docs/threads/` is NOT created (REQ-IN-01, C-07) | `tests/unit/commands/init.test.ts` |
| Config defaults | project.name auto-detected from cwd; empty basename falls back to "my-app" | `tests/unit/config/defaults.test.ts` |
| Security | No secrets in generated config content | `tests/unit/config/defaults.test.ts` |
| Performance guard | `InitCommand.execute()` completes within timeout (< 30s success metric) | `tests/unit/commands/init.test.ts` |
| FileSystem impl | NodeFileSystem wraps fs/promises correctly | `tests/unit/services/filesystem.test.ts` |
| GitClient impl | NodeGitClient invokes correct git commands | `tests/unit/services/git.test.ts` |

---

## 10. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-IN-01 | `InitCommand.execute()`, `config/defaults.ts` (DIRECTORY_MANIFEST) | Creates /docs folder hierarchy from manifest |
| REQ-IN-02 | `InitCommand.execute()`, `config/defaults.ts` (FILE_MANIFEST) | Seeds 4 template files in `docs/initial_project/` |
| REQ-IN-03 | `config/defaults.ts` (FILE_MANIFEST entry for `docs/overview.md`) | Overview template with project goals, stakeholders, scope, technical context |
| REQ-IN-04 | `config/defaults.ts` (`buildConfig()`), `InitCommand.execute()` | Generates `maes.config.json` with defaults and auto-detected project name |
| REQ-IN-05 | `InitCommand.execute()` (exists check before each write) | Skips existing files, reports them, preserves content |
| REQ-IN-06 | `InitCommand.execute()` (git.add + git.commit after file creation) | Conditional commit — only when created[] is non-empty |
| REQ-IN-07 | `config/defaults.ts` (FILE_MANIFEST entries for `maes/skills/*`) | Scaffolds `maes/skills/` with 3 placeholder Skill files and `maes/templates/` |
| REQ-IN-08 | `config/defaults.ts` (FILE_MANIFEST entries for agent-logs and open-questions) | Pre-creates 3 agent log files + 2 open-questions files |
| REQ-NF-06 | `config/defaults.ts` (`buildConfig()`) | Config contains env var names, never secret values |

---

## 11. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | `package.json` `"bin"` field | Registers `maes` as a CLI command | Users run `npx maes init` or `maes init` (if globally installed) |
| 2 | `maes.config.json` | Schema consumed by Phase 2+ Orchestrator | Schema must remain backward-compatible across phases |
| 3 | `maes/skills/*.md` | Placeholder files populated in Phase 2 | File paths must match `agents.skills` config entries |
| 4 | `docs/` structure | Convention used by all agents and Orchestrator | Structure must match PRD Section 7 exactly |
| 5 | Git working tree | Init command operates on cwd | Must be inside a Git repo (Assumption A-03) |

---

## 12. Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| — | None | — | All questions resolved in Analysis phase |

---

*Gate: User reviews and approves this technical specification before proceeding to Planning (Phase 3).*
