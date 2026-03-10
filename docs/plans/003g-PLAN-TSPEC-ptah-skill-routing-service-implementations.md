# Execution Plan: Phase 3 — Skill Routing — Track 7: Service Implementations

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the concrete service implementations (Phase J) — `ClaudeCodeClient`, `DiscordJsClient` extensions, `NodeGitClient` extensions, and `NodeFileSystem` extensions. These wrap external libraries (discord.js, git CLI, Claude Code SDK) and can run in parallel with all unit test tracks since unit tests use fakes, not real service implementations.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `SkillClient` protocol, extended `DiscordClient`/`GitClient`/`FileSystem` protocols, `EmbedOptions`/`WorktreeInfo` types.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `ClaudeCodeClient` implementation | Convergence track (composition root wiring) |
| `DiscordJsClient` extensions (`postEmbed`, `createThread`, `postSystemMessage`) | Convergence track (composition root wiring) |
| `NodeGitClient` extensions (worktree operations) | Convergence track (composition root wiring) |
| `NodeFileSystem` extensions (`readDir`, `joinPath`) | Convergence track (composition root wiring) |

---

## 4. Task List

### Phase J: Service Implementations (TDD)

Concrete implementations for extended protocols. These wrap external libraries (discord.js, git CLI, Claude Code SDK).

**ClaudeCodeClient:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 116 | `invoke()` calls Claude Code SDK with system prompt + user message + `cwd` set to worktree path, returns text content (happy path) | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 117 | `allowedTools` defaults to `["Edit", "Read", "Write", "Glob", "Grep"]` — no Bash access | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 118 | Timeout — throws after `timeoutMs` elapsed | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 119 | Process/API error — throws on Claude Code failure | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 120 | Rate limit error — throws identifiable rate limit error | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |

**DiscordJsClient extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 121 | `postEmbed()` posts a colour-coded embed to the specified thread, returns message ID | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 122 | `postEmbed()` splits content >4096 chars into numbered sequential embeds | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 123 | `createThread()` creates thread with name and initial embed, returns thread ID | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 124 | `postSystemMessage()` posts Gray embed to thread | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |

**NodeGitClient extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 125 | `createWorktree()` runs `git worktree add -b {branch} {path}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 126 | `removeWorktree()` runs `git worktree remove --force {path}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 127 | `deleteBranch()` runs `git branch -D {branch}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 128 | `listWorktrees()` parses `git worktree list --porcelain` output into `WorktreeInfo[]` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 129 | `pruneWorktrees()` lists worktrees, removes those with matching branch prefix, deletes their branches | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 130 | `diffWorktree()` runs `git diff --name-only HEAD` in worktree, returns changed file paths | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |

**NodeFileSystem extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 131 | `readDir()` returns filenames in directory; returns empty array for non-existent directory | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ⬚ Not Started |
| 132 | `joinPath()` joins path segments via `node:path.join()` | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 17 tasks (Tasks 116–132) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Token Counter + Context Assembler, Thread Queue, Routing Engine, Response Poster, Skill Invoker.*
