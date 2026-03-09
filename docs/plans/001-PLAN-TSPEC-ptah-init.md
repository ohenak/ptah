# Execution Plan: `ptah init` CLI Command

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) |
| **Requirements** | [REQ-IN-01](../requirements/REQ-PTAH.md) through [REQ-IN-08](../requirements/REQ-PTAH.md), [REQ-NF-06](../requirements/REQ-PTAH.md) |
| **Properties** | [PROPERTIES-ptah-init v1.2](../testing/in_review/PROPERTIES-ptah-init.md) |
| **Date** | March 8, 2026 |
| **Status** | Complete (Rev 4 — 103 tests passing, TE review gaps resolved) |

---

## 1. Summary

Implements the `ptah init` CLI command as a TypeScript/Node.js package. The command scaffolds the Ptah project structure (docs hierarchy, ptah/ runtime directory, ptah.config.json, template files) into an existing Git repository, idempotently skipping existing files and committing the result. All implementation follows TDD with dependency-injected protocols for filesystem and Git operations.

---

## 2. Task List

### Phase A: Project Infrastructure

These tasks set up the npm package, TypeScript configuration, and test framework. No TDD cycle — these are build infrastructure.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Initialize npm package with `package.json` (name: `ptah`, type: `module`, Node 20 LTS engine) | — | `ptah/package.json` | ✅ Done |
| 2 | Configure TypeScript (`tsconfig.json` — strict, ESM, `src/` → `dist/`) | — | `ptah/tsconfig.json` | ✅ Done |
| 3 | Configure Vitest (`vitest.config.ts` — ESM, TypeScript paths) | — | `ptah/vitest.config.ts` | ✅ Done |
| 4 | Verify infrastructure: `npm install` succeeds, `npx vitest run` exits cleanly (no tests yet) | — | — | ✅ Done |

### Phase B: Types and Test Doubles

Define shared interfaces and build the test doubles needed by all subsequent TDD tasks.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 5 | Define `FileSystem` protocol interface and `InitResult` type | — | `ptah/src/services/filesystem.ts`, `ptah/src/types.ts` | ✅ Done |
| 6 | Define `GitClient` protocol interface | — | `ptah/src/services/git.ts` | ✅ Done |
| 7 | Implement `FakeFileSystem` test double (in-memory fs with `addExisting()`, `getFile()`, `hasDir()`) | `ptah/tests/unit/fixtures/fake-filesystem.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 8 | Implement `FakeGitClient` test double (configurable returns, call recording) | `ptah/tests/unit/fixtures/fake-git-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase C: Config Defaults Module

Build the manifest definitions and config builder — the data layer that InitCommand consumes.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 9 | Define `DIRECTORY_MANIFEST` — all 9 directories in correct order, verify against TSPEC Section 5.1 | `ptah/tests/unit/config/defaults.test.ts` | `ptah/src/config/defaults.ts` | ✅ Done |
| 10 | Define `FILE_MANIFEST` — all 17 files (14 content + 3 `.gitkeep`) with exact content per TSPEC Section 5.2 | `ptah/tests/unit/config/defaults.test.ts` | `ptah/src/config/defaults.ts` | ✅ Done |
| 11 | Implement `buildConfig(projectName)` — generates `ptah.config.json` content with auto-detected project name; empty basename falls back to `"my-app"` | `ptah/tests/unit/config/defaults.test.ts` | `ptah/src/config/defaults.ts` | ✅ Done |
| 12 | Verify no secrets in generated config content (REQ-NF-06) — config contains env var names only, never values | `ptah/tests/unit/config/defaults.test.ts` | `ptah/src/config/defaults.ts` | ✅ Done |
| 12b | Config `agents.skills` paths match FILE_MANIFEST — every path in `buildConfig().agents.skills` values (e.g., `"./ptah/skills/pm-agent.md"`) must correspond to an entry in FILE_MANIFEST (PROP-IN-44) | `ptah/tests/unit/config/defaults.test.ts` | `ptah/src/config/defaults.ts` | ✅ Done |

### Phase D: InitCommand Core Logic

TDD the main command, one behavior at a time. Each test uses `FakeFileSystem` and `FakeGitClient`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 13 | Error when not in a Git repo — `execute()` throws when `git.isRepo()` returns false | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 14 | Error when pre-existing staged changes — `execute()` throws when `git.hasStagedChanges()` returns true | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 15 | Creates all 9 directories from `DIRECTORY_MANIFEST` — verify each directory exists in fake fs after execute | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 16 | Creates all 17 files from `FILE_MANIFEST` with correct content — verify each file content matches TSPEC | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 17 | InitCommand passes `fs.basename(fs.cwd())` to `buildConfig()` — verify the `ptah.config.json` written to fake fs contains the cwd-derived project name (not hardcoded) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 18 | Skips existing files — pre-populate fake fs with some files, verify they are in `skipped[]` and content unchanged | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 18b | Idempotency — execute() twice on same repo: second run creates nothing, skips all 17 files, `committed=false`, no `git.add`/`git.commit` calls (PROP-IN-27) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 19 | Existing directories are silently continued — directories are NOT added to `skipped[]` (only files are tracked in skipped) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 20 | Exclusion: `docs/threads/` is NOT created (REQ-IN-01, C-07) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 21 | Git commit when files created — `created[]` non-empty triggers `git.add(created)` + `git.commit(...)` with correct message | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 22 | No-op commit — when all files exist (everything skipped), `committed` is false and no git calls made | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 23 | `InitResult` reports correct `created[]`, `skipped[]`, and `committed` values across scenarios | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 24 | Error propagation — git add/commit failures propagate as errors (files remain on disk, no rollback) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 25 | Performance regression guard — `execute()` completes within 5s using in-memory fakes (sanity check against infinite loops/O(n²); real PROP-IN-45 coverage in Phase G Task 37) | `ptah/tests/unit/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |

### Phase E: Concrete Service Implementations (Integration Tests)

TDD the Node.js wrappers for filesystem and Git operations. Tests use real filesystem in temp directories and real `git` in temp repos (approach b per TE review Q6). Each test uses `fs.mkdtemp()` for isolation, cleaned up in `afterEach`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 26 | `NodeFileSystem.exists()` — wraps `fs.access()`, returns true/false | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| 27 | `NodeFileSystem.mkdir()` — wraps `fs.mkdir()` with `{ recursive: true }` | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| 28 | `NodeFileSystem.writeFile()` — wraps `fs.writeFile()` with UTF-8 encoding | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| 29 | `NodeFileSystem.cwd()` and `basename()` — wraps `process.cwd()` and `path.basename()` | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| 30 | `NodeGitClient.isRepo()` — runs `git rev-parse --is-inside-work-tree`, returns true/false (PROP-IN-30) | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 31 | `NodeGitClient.hasStagedChanges()` — runs `git diff --cached --quiet`, returns true if exit code 1 (PROP-IN-31) | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 32 | `NodeGitClient.add()` and `commit()` — runs `git add <paths>` and `git commit -m <message>` | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 33 | `NodeGitClient` error handling — git not installed, permission errors mapped to typed errors | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |

### Phase F: CLI Entry Point

Wire the composition root and console output.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 34 | CLI entry point — `bin/ptah.ts` wires `NodeFileSystem`, `NodeGitClient`, `InitCommand`, handles `init` subcommand | — | `ptah/bin/ptah.ts` | ✅ Done |
| 35 | CLI output formatting — prints `✓ Created`, `⊘ Skipped`, `ℹ No new files`, `✓ Committed` messages | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |

### Phase G: Integration Tests

Integration-level tests that verify cross-module wiring, real filesystem/Git behavior, and CLI process behavior. These cover the 5 Integration-level properties (PROP-IN-28, PROP-IN-30, PROP-IN-31, PROP-IN-45, PROP-IN-46). PROP-IN-30 and PROP-IN-31 are covered by Phase E Tasks 30-31.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 37 | Performance guard — `InitCommand.execute()` completes within 30s using `NodeFileSystem` + `NodeGitClient` in a real temp repo (PROP-IN-45) | `ptah/tests/integration/commands/init.test.ts` | `ptah/src/commands/init.ts` | ✅ Done |
| 38 | Composition root wiring — `bin/ptah.ts` correctly wires `NodeFileSystem` and `NodeGitClient` into `InitCommand` (PROP-IN-28) | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |
| 39 | CLI exit codes — exit 0 on success, exit 1 on error (not git repo, staged changes, permission denied, git failure) (PROP-IN-46) | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |

Status key: ⬚ Not Started | ✅ Done | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 3. Task Dependency Notes

- **Tasks 1-4** (infrastructure) must complete before any TDD tasks begin.
- **Tasks 5-6** (protocols) must complete before Tasks 7-8 (test doubles) since fakes implement the protocols.
- **Tasks 7-8** (test doubles) must complete before Tasks 13-25 (InitCommand) since all InitCommand tests depend on fakes.
- **Tasks 9-12b** (config defaults) must complete before Tasks 15-17 (directory/file creation) since InitCommand consumes the manifests.
- **Tasks 13-25** (InitCommand) are ordered by the algorithm flow but can be implemented in any order after dependencies are met. Task 18b (idempotency) depends on Task 18 (skip logic).
- **Tasks 26-33** (Node implementations) are independent of InitCommand tests and can proceed in parallel after protocols are defined. These are integration tests using real filesystem/Git.
- **Tasks 34-35** (CLI entry point) depend on all Phase C and D tasks.
- **Tasks 37-39** (integration tests) depend on all prior tasks.

```
Phase A (1-4) → Phase B (5-8) → Phase C (9-12b) → Phase D (13-25) → Phase F (34-35) → Phase G (37-39)
                Phase B (5-6) → Phase E (26-33) ──────────────────→ Phase F (34-35) → Phase G (37-39)
```

---

## 4. Definition of Done

- [x] All 39 tasks completed and status updated to ✅
- [x] All tests pass (`npx vitest run`) — 103 tests, 8 test files, 0 failures
- [x] No skipped or pending tests
- [x] Code reviewed against requirement acceptance criteria (REQ-IN-01 through REQ-IN-08, REQ-NF-06)
- [x] Implementation matches TSPEC-ptah-init.md (module architecture, protocols, algorithm, file manifest)
- [x] All 45 properties in PROPERTIES-ptah-init.md v1.2 are covered by at least one task
- [x] Changes committed in logical units with `type(scope): description` format
- [x] Pushed to remote for review
