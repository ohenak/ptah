# Execution Plan: Phase 3 — Skill Routing — Track 6: Skill Invoker

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the Skill Invoker (Phase H) — worktree lifecycle management and Claude Code invocation. Creates isolated Git worktrees for each skill invocation, invokes Claude Code via the `SkillClient` protocol, detects artifact changes in `/docs`, and guarantees worktree cleanup on all exit paths (success, timeout, error). Uses `FakeSkillClient`, `FakeGitClient`, `FakeLogger`.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `SkillInvoker` protocol, `SkillRequest`/`SkillResponse`/`InvocationResult`/`WorktreeInfo` types, `FakeSkillClient`, `FakeGitClient` (extended), `FakeLogger`.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `DefaultSkillInvoker` implementation | Convergence track (Orchestrator, Integration tests) |
| `InvocationTimeoutError` error class | Convergence track (Orchestrator error handling) |
| `InvocationError` error class | Convergence track (Orchestrator error handling) |

---

## 4. Task List

### Phase H: Skill Invoker (TDD)

Worktree lifecycle and Claude Code invocation. Uses `FakeSkillClient`, `FakeGitClient`, `FakeLogger`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 92 | Happy path — creates worktree, invokes Claude Code, detects /docs artifact changes, cleans up worktree + branch (AT-SI-01) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 93 | Branch naming — follows `ptah/{agentId}/{threadId}/{invocationId}` convention with 8-char hex ID (AT-SI-08) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 94 | Worktree path — uses `{os.tmpdir()}/ptah-worktrees/{invocationId}` | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 95 | Timeout — invocation exceeds 90s, worktree cleaned up, throws `InvocationTimeoutError` (AT-SI-04) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 96 | Invocation error — SkillClient throws, worktree cleaned up, throws `InvocationError` (AT-SI-07) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 97 | Rate limit / API error — SkillClient throws rate limit or API error, worktree cleaned up (AT-SI-11) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 98 | Worktree creation failure — git error, Skill not invoked, throws (AT-SI-06) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 99 | Artifact filtering — only /docs changes tracked, non-/docs changes ignored with warning (AT-SI-09) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 100 | Layer 1 file modification warning — changes to overview.md logged as unusual but allowed (AT-SI-12) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 101 | `pruneOrphanedWorktrees()` calls `gitClient.pruneWorktrees("ptah/")` for startup cleanup (SI-R9) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 102 | Cleanup guaranteed on success, timeout, and error — worktree removed + branch deleted in all paths | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 11 tasks (Tasks 92–102) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Token Counter + Context Assembler, Thread Queue, Routing Engine, Response Poster, Service Implementations.*
