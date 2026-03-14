# Execution Plan: Phase 10 — Parallel Feature Development

| Field | Detail |
|-------|--------|
| **Technical Specification** | [010-TSPEC-ptah-parallel-feature-development](010-TSPEC-ptah-parallel-feature-development.md) |
| **Requirements** | [010-REQ-ptah-parallel-feature-development](010-REQ-ptah-parallel-feature-development.md) |
| **Date** | March 14, 2026 |
| **Status** | Draft |

---

## 1. Summary

Replaces the direct-to-`main` merge strategy with a two-tier branch strategy. Agent sub-branches (`ptah/{featureName}/{agentId}/{invocationId}`) merge into a persistent `feat-{featureName}` branch that accumulates all agent work and is reviewed via PR before reaching `main`. Eight new `GitClient` methods are added, `ArtifactCommitter` is refactored to perform the two-tier merge (pull → merge --no-ff → push), `Orchestrator` handles feature branch lifecycle, and four `SKILL.md` files are updated to remove conflicting git workflow instructions.

---

## 2. Task List

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

### Phase A: Types and Foundation

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A-01 | **Update `CommitParams`** — add `featureBranch: string` field | `tests/unit/orchestrator/artifact-committer.test.ts` (existing tests updated to provide `featureBranch`) | `ptah/src/types.ts` | ⬚ Not Started |
| A-02 | **Extend `MergeStatus`** — add `"pull-error"` and `"push-error"` union members | `tests/unit/orchestrator/artifact-committer.test.ts` (new status assertions) | `ptah/src/types.ts` | ⬚ Not Started |
| A-03 | **Extend `CommitResult`** — add `conflictFiles?: string[]` and `retainedWorktreePath?: string` optional fields | `tests/unit/orchestrator/artifact-committer.test.ts` (conflict + push-error result assertions) | `ptah/src/types.ts` | ⬚ Not Started |
| A-04 | **Update `InvocationGuardParams`** — add `featureBranch: string` field | `tests/unit/orchestrator/invocation-guard.test.ts` (existing tests updated to provide `featureBranch`) | `ptah/src/types.ts` | ⬚ Not Started |

---

### Phase B: `feature-branch.ts` Pure Functions

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B-01 | **`extractFeatureName`** — parse feature name before em-dash; return full string when no em-dash | `ptah/tests/unit/orchestrator/feature-branch.test.ts` (NEW) | `ptah/src/orchestrator/feature-branch.ts` (NEW) | ⬚ Not Started |
| B-02 | **`featureNameToSlug`** — lowercase, collapse non-alphanumeric to single hyphen, strip leading/trailing hyphens, return "unnamed" for empty result | `ptah/tests/unit/orchestrator/feature-branch.test.ts` | `ptah/src/orchestrator/feature-branch.ts` | ⬚ Not Started |
| B-03 | **`featureBranchName`** — return `"feat-{slug}"` | `ptah/tests/unit/orchestrator/feature-branch.test.ts` | `ptah/src/orchestrator/feature-branch.ts` | ⬚ Not Started |
| B-04 | **`agentSubBranchName`** — return `"ptah/{slug}/{agentId}/{invocationId}"` | `ptah/tests/unit/orchestrator/feature-branch.test.ts` | `ptah/src/orchestrator/feature-branch.ts` | ⬚ Not Started |
| B-05 | **`ContextAssembler` DRY refactor** — import `extractFeatureName` from `feature-branch.ts`; keep existing public method as delegate | `ptah/tests/unit/orchestrator/context-assembler.test.ts` (existing tests must still pass) | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

---

### Phase C: `GitClient` Protocol + `FakeGitClient` Test Doubles

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C-01 | **`GitClient` interface — Phase 10 methods** — add 8 new method signatures: `createWorktreeFromBranch`, `checkoutBranchInWorktree`, `createBranchFromRef`, `pullInWorktree`, `mergeInWorktree`, `abortMergeInWorktree`, `getConflictedFiles`, `pushInWorktree` | `ptah/tests/unit/fixtures/fake-git-client.test.ts` (updated to verify new fake methods) | `ptah/src/services/git.ts` | ⬚ Not Started |
| C-02 | **`FakeGitClient` Phase 10 additions** — add call-recording fields and error-injection fields for all 8 new methods (per TSPEC Section 7.2); update `defaultCommitResult()` factory | `ptah/tests/unit/fixtures/fake-git-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |

---

### Phase D: `NodeGitClient` — Phase 10 Method Implementations

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D-01 | **`createWorktreeFromBranch`** — `git worktree add -b {newBranch} {path} {baseBranch}` | `ptah/tests/integration/services/git.test.ts` (new section) | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-02 | **`checkoutBranchInWorktree`** — `git worktree add {path} {branch}` (no `-b`, existing branch) | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-03 | **`createBranchFromRef`** — `git branch {branch} {ref}`; throw if branch already exists | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-04 | **`pullInWorktree`** — `git -C {path} pull {remote} {branch}`; catch "couldn't find remote ref" and silently return (new-branch skip path); throw on network/auth/diverged error | `ptah/tests/integration/services/git.test.ts` (local bare repo as remote) | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-05 | **`mergeInWorktree`** — `git -C {path} merge --no-ff {branch}`; return `"merged"` on exit 0, `"conflict"` on exit 1, `"merge-error"` on other error; do NOT abort on conflict | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-06 | **`abortMergeInWorktree`** — `git -C {path} merge --abort` | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-07 | **`getConflictedFiles`** — `git -C {path} diff --name-only --diff-filter=U`; return list of conflicted file paths | `ptah/tests/integration/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| D-08 | **`pushInWorktree`** — `git -C {path} push {remote} {branch}`; throw if push rejected | `ptah/tests/integration/services/git.test.ts` (local bare repo as remote) | `ptah/src/services/git.ts` | ⬚ Not Started |

---

### Phase E: `ArtifactCommitter` — Two-Tier Merge

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E-01 | **Remove `docs/` filter** — delete `filterDocsChanges` function; stage all `artifactChanges` directly | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` (updated: no-changes only on empty list; non-docs changes now committed) | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-02 | **Two-tier merge: happy path** — after sub-branch commit, acquire lock → `checkoutBranchInWorktree` → `pullInWorktree` → `mergeInWorktree(--no-ff)` → `pushInWorktree` → clean up both worktrees → return `"merged"` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` (new test: happy path verifies merge worktree created, push called, both worktrees removed) | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-03 | **Two-tier merge: pull failure** — genuine `pullInWorktree` throw → clean up both worktrees → return `"pull-error"` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-04 | **Two-tier merge: merge conflict** — `mergeInWorktree` returns `"conflict"` → `getConflictedFiles` → do NOT abort → do NOT remove merge worktree → clean up sub-branch → return `"conflict"` with `conflictFiles` and `retainedWorktreePath` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` (verify: abort NOT called, merge worktree NOT removed, sub-branch IS removed) | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-05 | **Two-tier merge: merge-error** — `mergeInWorktree` returns `"merge-error"` → `abortMergeInWorktree` → clean up both worktrees → return `"merge-error"` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-06 | **Two-tier merge: push failure** — `pushInWorktree` throws → do NOT remove merge worktree → clean up sub-branch → return `"push-error"` with `retainedWorktreePath` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E-07 | **Two-tier merge: lock-timeout** — `mergeLock.acquire` throws `MergeLockTimeoutError` → clean up sub-branch → return `"lock-timeout"` (no merge worktree created) | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` (updated: verify merge worktree NOT created on lock-timeout) | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |

---

### Phase F: `InvocationGuard` — `featureBranch` Forwarding

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F-01 | **Forward `featureBranch` to `commitAndMerge`** — pass `params.featureBranch` through to `artifactCommitter.commitAndMerge({ ..., featureBranch })` | `ptah/tests/unit/orchestrator/invocation-guard.test.ts` (verify `featureBranch` appears in commitAndMerge call) | `ptah/src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| F-02 | **Treat `pull-error` as unrecoverable** — add `pull-error` to the unrecoverable commit status check (alongside `conflict`) | `ptah/tests/unit/orchestrator/invocation-guard.test.ts` (new test: pull-error → status "unrecoverable", no retry) | `ptah/src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| F-03 | **Treat `push-error` as unrecoverable** — add `push-error` to the unrecoverable commit status check | `ptah/tests/unit/orchestrator/invocation-guard.test.ts` (new test: push-error → status "unrecoverable", no retry) | `ptah/src/orchestrator/invocation-guard.ts` | ⬚ Not Started |

---

### Phase G: `Orchestrator` — Feature Branch Lifecycle and Sub-Branch Naming

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G-01 | **Feature branch creation on first invocation** — derive `featureBranch = featureBranchName(featureName)`; call `createBranchFromRef(featureBranch, "main")` when `branchExists` returns false | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: `createBranchFromRef` called with correct args when branch doesn't exist) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-02 | **Feature branch reuse on subsequent invocations** — when `branchExists` returns true, skip `createBranchFromRef` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: `createBranchFromRef` NOT called when branch exists) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-03 | **New sub-branch naming** — replace `ptah/${agentId}/${threadId}/${invocationId}` with `agentSubBranchName(featureName, agentId, invocationId)` in `ensureUniqueBranch` and worktree creation | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: sub-branch name format is `ptah/{featureName}/{agentId}/{invocationId}`) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-04 | **`createWorktreeFromBranch` replaces `createWorktree`** — agent worktree is created from feature branch HEAD (not main) using `createWorktreeFromBranch(branch, worktreePath, featureBranch)` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: `createWorktreeFromBranch` called; `createWorktree` NOT called) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-05 | **Pass `featureBranch` to `InvocationGuard`** — add `featureBranch` to `InvocationGuardParams` object passed to `invokeWithRetry` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (existing tests updated to handle new `featureBranch` param) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-06 | **Handle `pull-error` in `handleCommitResult`** — post Discord embed with feature branch name, git error, sub-branch name | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: pull-error → Discord embed posted with correct content) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-07 | **Handle `push-error` in `handleCommitResult`** — post Discord embed with feature branch name, git error, retained worktree path | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (new test: push-error → Discord embed with retainedWorktreePath in message) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-08 | **Enrich `conflict` handling** — include `conflictFiles` and `retainedWorktreePath` in Discord notification (REQ-MG-02) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (updated: conflict embed now includes file list and worktree path) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| G-09 | **`executePatternBResume` parity** — apply same feature branch setup and naming changes to the pattern B resume path | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (existing pattern B test updated) | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

---

### Phase H: SKILL.md Updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| H-01 | **`backend-engineer/SKILL.md`** — remove git checkout/branch/push instructions; add orchestrator-managed branch statement + worktree context | N/A (manual verification against REQ-SK-01, REQ-SK-02) | `.claude/skills/backend-engineer/SKILL.md` | ⬚ Not Started |
| H-02 | **`product-manager/SKILL.md`** — same git workflow section update | N/A | `.claude/skills/product-manager/SKILL.md` | ⬚ Not Started |
| H-03 | **`frontend-engineer/SKILL.md`** — same git workflow section update | N/A | `.claude/skills/frontend-engineer/SKILL.md` | ⬚ Not Started |
| H-04 | **`test-engineer/SKILL.md`** — same git workflow section update | N/A | `.claude/skills/test-engineer/SKILL.md` | ⬚ Not Started |

---

### Phase I: `bin/ptah.ts` Wiring

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| I-01 | **Verify `bin/ptah.ts` requires no wiring changes** — `ArtifactCommitter` and `Orchestrator` receive the same injected deps; TSPEC confirms no new injected dependencies at the composition root | `ptah/tests/integration/cli/ptah.test.ts` (existing test passes) | `ptah/bin/ptah.ts` | ⬚ Not Started |

---

## 3. Task Dependency Notes

```
Phase A (types.ts)
  └── Phase B (feature-branch.ts)       — uses types, no dependencies on A actually; can parallelize with A
  └── Phase C (GitClient protocol + Fake) — uses MergeResult from types
      └── Phase D (NodeGitClient impl)  — implements C interface
          └── Phase E (ArtifactCommitter) — uses new GitClient methods; also depends on A (CommitParams.featureBranch)
              └── Phase F (InvocationGuard) — passes featureBranch; treats pull-error/push-error
                  └── Phase G (Orchestrator) — feature branch lifecycle; depends on B, D, E, F
                      └── Phase I (bin/ptah.ts) — verify no wiring changes
Phase H (SKILL.md) — fully independent; can run at any point
```

**Parallel opportunities:**
- **A and B** can be developed concurrently (pure functions have no dependency on types changes beyond what already exists)
- **C-01 (interface) and C-02 (fake)** must be sequential: interface first, then fake implements it
- **D-01 through D-08** are largely independent and can be implemented in any order within Phase D
- **H-01 through H-04** are fully independent of all code phases

**Blocking dependencies:**
- Phase E requires: A (CommitParams.featureBranch), C (FakeGitClient updated), D (NodeGitClient stubs in integration tests)
- Phase F requires: A (InvocationGuardParams.featureBranch), E (new MergeStatus values)
- Phase G requires: B (featureBranchName, agentSubBranchName), C (FakeGitClient), F (updated InvocationGuard)

---

## 4. Integration Points

### Existing code modified

| File | Nature of Change | Risk |
|------|-----------------|------|
| `ptah/src/types.ts` | `CommitParams`, `MergeStatus`, `CommitResult`, `InvocationGuardParams` extended | Low — additive; existing callers compile with optional fields |
| `ptah/src/services/git.ts` | 8 new methods added to `GitClient` interface and `NodeGitClient` | Medium — `FakeGitClient` in `factories.ts` must be updated simultaneously |
| `ptah/src/orchestrator/artifact-committer.ts` | `filterDocsChanges` removed; entire merge block replaced with two-tier flow | High — core behavior change; all existing tests require update |
| `ptah/src/orchestrator/invocation-guard.ts` | `featureBranch` forwarded; `pull-error`/`push-error` added to unrecoverable set | Medium — new statuses affect retry logic |
| `ptah/src/orchestrator/orchestrator.ts` | Feature branch setup, sub-branch naming, `handleCommitResult` enrichment | High — multiple callsites; pattern B resume path also updated |
| `ptah/src/orchestrator/context-assembler.ts` | `extractFeatureName` delegated to `feature-branch.ts` | Low — public API unchanged |
| `ptah/tests/fixtures/factories.ts` | `FakeGitClient` Phase 10 additions; `defaultCommitResult` branch name | Medium — breaks existing tests until updated in Phase C |

### Existing tests requiring updates (before new tests can pass)

- `artifact-committer.test.ts` — must add `featureBranch` to `createParams()` helper in all existing tests
- `orchestrator.test.ts` — tests using `createWorktree` must be updated to `createWorktreeFromBranch`; `InvocationGuardParams` mocks updated
- `invocation-guard.test.ts` — `InvocationGuardParams` mocks updated with `featureBranch`
- `factories.ts` — `FakeGitClient` additions must not break existing fake-git-client.test.ts

### Files with no change required

- `ptah/src/orchestrator/merge-lock.ts` — no change
- `ptah/src/orchestrator/skill-invoker.ts` — `pruneWorktrees("ptah/")` prefix unchanged
- `ptah/bin/ptah.ts` — no new wiring required (TSPEC Section 9.1)

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`cd ptah && npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against all 17 requirement acceptance criteria
- [ ] Implementation matches TSPEC v0.2 (protocols, algorithm, error handling, test doubles)
- [ ] Existing tests remain green (no regressions from type changes, FakeGitClient updates, docs/-filter removal)
- [ ] REQ-FB-01 through REQ-PF-NF-03 each have at least one unit test verifying the acceptance criteria
- [ ] `mergeInWorktree` uses `--no-ff` (verified in integration test)
- [ ] `pullInWorktree` silently skips on "couldn't find remote ref" (verified in integration test with local bare remote)
- [ ] `docs/` filter is absent from `ArtifactCommitter` (no `filterDocsChanges` call)
- [ ] SKILL.md files contain no `git checkout`, `git branch -b`, or `git push origin feat-` instructions
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-parallel-feature-development` for review
