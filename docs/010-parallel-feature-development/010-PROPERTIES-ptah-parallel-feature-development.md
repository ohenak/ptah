# Test Properties Document

## Phase 10 — Parallel Feature Development

| Field | Detail |
|-------|--------|
| **Document ID** | 010-PROPERTIES-ptah-parallel-feature-development |
| **Requirements** | [010-REQ-ptah-parallel-feature-development](010-REQ-ptah-parallel-feature-development.md) |
| **Specifications** | [010-TSPEC-ptah-parallel-feature-development](010-TSPEC-ptah-parallel-feature-development.md) |
| **Execution Plan** | [010-PLAN-TSPEC-ptah-parallel-feature-development](010-PLAN-TSPEC-ptah-parallel-feature-development.md) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Test Engineer |
| **Status** | Approved |
| **Approval Date** | March 14, 2026 |

---

## 1. Overview

This document catalogs all testable properties for Phase 10 — Parallel Feature Development. The feature replaces Ptah's direct-to-`main` artifact merge strategy with a two-tier branch strategy: agent sub-branches (`ptah/{featureName}/{agentId}/{invocationId}`) merge into a persistent `feat-{featureName}` branch, which accumulates all agent work and is reviewed via PR before reaching `main`. Multiple agents may run concurrently on the same feature; their worktrees are isolated and merges are serialized via the existing `AsyncMutex` merge-lock.

### 1.1 Scope

**In scope:**
- `feature-branch.ts` — pure functions for branch name derivation and slug transformation
- `GitClient` protocol — 8 new Phase 10 method signatures and `NodeGitClient` implementations
- `ArtifactCommitter` — two-tier merge logic (pull → merge --no-ff → push), all error paths, worktree retention, cleanup
- `Orchestrator` — feature branch lifecycle (create / reuse), sub-branch naming, `handleCommitResult` Discord notifications for all new statuses, `executePatternBResume` parity
- `InvocationGuard` — `featureBranch` forwarding, new unrecoverable status handling
- `types.ts` — `CommitParams`, `CommitResult`, `MergeStatus`, `InvocationGuardParams` extensions
- `FakeGitClient` — Phase 10 test double additions
- SKILL.md files (4) — removal of conflicting git workflow instructions

**Out of scope:**
- Automatic PR creation or merge automation (developer-managed, out of scope per §7.2)
- Feature branch deletion after PR merge (deferred)
- Conflict resolution automation (developer-managed per A-10-05)
- Merge failure retry logic (single attempt per invocation per §7.2)
- Merge-lock persistence across Ptah restarts (in-memory only per A-10-06)
- Orchestrator-level parallelism configuration (deferred per §7.2)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 17 | [010-REQ](010-REQ-ptah-parallel-feature-development.md) — 12 P0, 5 P1 |
| Specification sections analyzed | 11 | [010-TSPEC](010-TSPEC-ptah-parallel-feature-development.md) §§4–9 |
| Plan tasks reviewed | 34 | [010-PLAN](010-PLAN-TSPEC-ptah-parallel-feature-development.md) phases A–I |
| Integration boundaries identified | 4 | ArtifactCommitter↔GitClient, Orchestrator↔InvocationGuard, InvocationGuard↔ArtifactCommitter, NodeGitClient↔git subprocess |
| Implementation files reviewed | 0 | N/A — not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 33 | REQ-FB-01–04, REQ-AB-01–04, REQ-MG-01–04, REQ-SK-01–02, REQ-PF-NF-03 | Unit / Manual |
| Contract | 7 | REQ-FB-01, REQ-AB-01, REQ-MG-01–02, TSPEC §4.3–4.4 | Unit |
| Error Handling | 8 | REQ-MG-03, REQ-FB-03, REQ-AB-04, TSPEC §5.2–6 | Unit / Integration |
| Data Integrity | 4 | REQ-FB-01–02, REQ-AB-02, TSPEC §4.2, §5.2 | Unit / Integration |
| Integration | 8 | REQ-AB-01–03, REQ-MG-01, REQ-MG-03, TSPEC §4.3, §9.3 | Integration / Unit |
| Performance | 2 | REQ-PF-NF-01–02 | Integration (manual) |
| Idempotency | 2 | TSPEC §4.2 | Unit |
| Observability | 2 | TSPEC §5.2–5.3 | Unit |
| **Total** | **66** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-{DOMAIN}-{NUMBER}` — domain prefix matches the source requirement domain.

**Priority:** Inherited from the highest-priority linked requirement (P0 / P1 / P2).

---

### 3.1 Functional Properties

Core business logic and observable behavior.

#### Feature Branching — Pure Functions

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-FB-01 | `extractFeatureName` must return the substring before the em-dash (`—`) separator when an em-dash is present in the thread name | [REQ-FB-01], [TSPEC §4.2] | Unit | P0 |
| PROP-FB-02 | `extractFeatureName` must return the full string unchanged when no em-dash separator is present | [REQ-FB-01], [TSPEC §4.2] | Unit | P0 |
| PROP-FB-03 | `featureNameToSlug` must lowercase the input, replace sequences of non-alphanumeric characters with a single hyphen, and strip leading and trailing hyphens | [REQ-FB-01], [TSPEC §4.2] | Unit | P0 |
| PROP-FB-04 | `featureBranchName` must return `"feat-{slug}"` given any feature name | [REQ-FB-01], [TSPEC §4.2] | Unit | P0 |

#### Feature Branch Lifecycle — Orchestrator

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-FB-05 | `Orchestrator` must call `createBranchFromRef(featureBranch, "main")` when `branchExists(featureBranch)` returns `false` | [REQ-FB-01], [TSPEC §5.1] | Unit | P0 |
| PROP-FB-06 | `Orchestrator` must skip `createBranchFromRef` and reuse the existing branch when `branchExists(featureBranch)` returns `true` | [REQ-FB-02], [TSPEC §5.1] | Unit | P0 |
| PROP-FB-07 | `Orchestrator` must post a Discord error embed and halt invocation setup when `createBranchFromRef` throws | [REQ-FB-01], [TSPEC §6] | Unit | P0 |

#### Feature Branch — Push After Merge

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-FB-08 | `ArtifactCommitter` must call `pushInWorktree(mergeWorktreePath, "origin", featureBranch)` after a successful merge — `remote` must be `"origin"` and `branch` must be `featureBranch`, not the sub-branch name | [REQ-FB-03], [TSPEC §5.2 step d] | Unit | P0 |
| PROP-FB-09 | `ArtifactCommitter` must retain the merge worktree and return `"push-error"` with `retainedWorktreePath` set when `pushInWorktree` throws — the merge commit already landed in the merge worktree at `retainedWorktreePath` and remains reachable on `featureBranch` in that worktree, so the developer can push manually without losing work | [REQ-FB-03], [TSPEC §5.2 step d] | Unit | P0 |

#### Agent Sub-Branch — Orchestrator

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AB-01 | `agentSubBranchName` must return `"ptah/{slug}/{agentId}/{invocationId}"` | [REQ-AB-01], [TSPEC §4.2] | Unit | P0 |
| PROP-AB-02 | `Orchestrator` must generate sub-branch names in `ptah/{featureName}/{agentId}/{invocationId}` format using `agentSubBranchName` | [REQ-AB-01], [TSPEC §5.1 step 4] | Unit | P0 |
| PROP-AB-03 | `Orchestrator` must call `createWorktreeFromBranch(subBranch, worktreePath, featureBranch)` — `createWorktree` must not be called | [REQ-AB-02], [TSPEC §5.1 step 6] | Unit | P0 |
| PROP-AB-04 | `Orchestrator` must pass `featureBranch` in `InvocationGuardParams` | [REQ-AB-01], [REQ-FB-03], [TSPEC §4.7] | Unit | P0 |
| PROP-AB-05 | `InvocationGuard` must pass `featureBranch` from `InvocationGuardParams` to `artifactCommitter.commitAndMerge` | [TSPEC §4.7] | Unit | P0 |
| PROP-AB-06 | `Orchestrator.executePatternBResume` must apply identical feature branch setup (create-or-reuse) and sub-branch naming to `executeRoutingLoop` | [REQ-FB-01], [REQ-AB-01], [TSPEC §9.1] | Unit | P0 |

#### Agent Sub-Branch — Cleanup

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AB-07 | `ArtifactCommitter` must call `cleanupSubBranch` (remove sub-branch worktree + delete sub-branch) after a successful two-tier merge | [REQ-AB-04], [TSPEC §5.2 step e] | Unit | P0 |
| PROP-AB-08 | `ArtifactCommitter` must call `cleanupSubBranch` on technical failure paths: `commit-error`, `pull-error`, `merge-error`, and `lock-timeout` | [REQ-AB-04], [TSPEC §5.2] | Unit | P0 |
| PROP-AB-09 | `ArtifactCommitter` must call `cleanupSubBranch` on conflict — the sub-branch is no longer needed even though the merge worktree is retained | [REQ-AB-04], [REQ-MG-02], [TSPEC §5.2 step c] | Unit | P0 |

#### Two-Tier Merge Flow — ArtifactCommitter

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MG-01 | `ArtifactCommitter` must return `"no-changes"` immediately without staging, committing, or acquiring the merge-lock when `artifactChanges` is empty | [TSPEC §5.2 step 1] | Unit | P0 |
| PROP-MG-02 | `ArtifactCommitter` must stage and commit all items in `artifactChanges` to the sub-branch before acquiring the merge-lock | [REQ-AB-04], [TSPEC §5.2 steps 2–3] | Unit | P0 |
| PROP-MG-03 | `ArtifactCommitter` must acquire the merge-lock before creating the merge worktree | [REQ-MG-01], [TSPEC §5.2 step 4] | Unit | P0 |
| PROP-MG-04 | `ArtifactCommitter` must call `pullInWorktree(mergeWorktreePath, "origin", featureBranch)` before `mergeInWorktree` | [REQ-MG-03], [TSPEC §5.2 step b] | Unit | P1 |
| PROP-MG-05 | `ArtifactCommitter` must call `getConflictedFiles`, retain the merge worktree, and return `"conflict"` with `conflictFiles` and `retainedWorktreePath` populated when `mergeInWorktree` returns `"conflict"` | [REQ-MG-02], [TSPEC §5.2 step c] | Unit | P0 |
| PROP-MG-06 | `ArtifactCommitter` must call `abortMergeInWorktree`, remove both the merge worktree and the sub-branch worktree, and return `"merge-error"` when `mergeInWorktree` returns `"merge-error"` | [TSPEC §5.2 step c, §6] | Unit | P0 |
| PROP-MG-07 | `ArtifactCommitter` must return `"lock-timeout"` and clean up the sub-branch without creating a merge worktree when merge-lock acquisition throws `MergeLockTimeoutError` | [REQ-MG-04], [TSPEC §5.2 step 4] | Unit | P1 |

#### Orchestrator Discord Notifications

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MG-08 | `Orchestrator.handleCommitResult` must post a Discord embed containing the feature branch name, the git error message, and the sub-branch name when `mergeStatus` is `"pull-error"` | [REQ-MG-03], [TSPEC §4.6] | Unit | P1 |
| PROP-FB-10 | `Orchestrator.handleCommitResult` must post a Discord embed containing the feature branch name, the git error message, and `retainedWorktreePath` when `mergeStatus` is `"push-error"` | [REQ-FB-03], [TSPEC §4.6] | Unit | P0 |
| PROP-MG-09 | `Orchestrator.handleCommitResult` must post a Discord embed containing all four REQ-MG-02 elements — conflicted file list, retained merge worktree path, sub-branch name, and `git merge --continue` / `git merge --abort` resolution commands — when `mergeStatus` is `"conflict"` | [REQ-MG-02], [TSPEC §4.6] | Unit | P0 |
| PROP-MG-10 | `Orchestrator.handleCommitResult` must post a Discord embed containing the feature branch name, the sub-branch name, and a message indicating the merge was not performed when `mergeStatus` is `"lock-timeout"` | [REQ-MG-04], [TSPEC §4.6] | Unit | P1 |

#### InvocationGuard — Unrecoverable Statuses

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-MG-11 | `InvocationGuard` must treat `"pull-error"`, `"push-error"`, and `"lock-timeout"` as unrecoverable statuses — no retry must be attempted | [REQ-MG-03], [REQ-FB-03], [REQ-MG-04], [TSPEC §4.7] | Unit | P0 |

#### Skill Alignment

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-SK-01 | All four SKILL.md files (PM, BE, FE, QA) must contain no instructions to run `git checkout -b feat-`, `git checkout feat-` with pull, `git fetch origin && git checkout -b feat-`, or `git push origin feat-` | [REQ-SK-01], [TSPEC §4.8] | Manual | P0 |
| PROP-SK-02 | All four SKILL.md files must contain an explicit statement that branch management (worktree creation, sub-branch creation, push to remote) is handled by the orchestrator and must not be performed by the agent | [REQ-SK-01], [TSPEC §4.8] | Manual | P0 |

> **Note on PROP-SK-01 and PROP-NEG-10:** These two properties both address the same SKILL.md invariant from complementary framings — PROP-SK-01 is a **positive** specification property (the file must not contain conflicting instructions) while PROP-NEG-10 is a **negative** property (agents must not perform these operations). They are retained as separate entries because they belong to different sections (§3.1 Functional vs §4 Negative) and drive different test scripts: PROP-SK-01 drives the CI grep check (Gap #4) while PROP-NEG-10 drives the conceptual constraint across all agent invocations.
| PROP-SK-03 | All four SKILL.md files must contain an explicit statement that the agent runs in an isolated git worktree, that all file operations are relative to the worktree root, and that the agent must not navigate to or modify the main repository checkout | [REQ-SK-02], [TSPEC §4.8] | Manual | P1 |

#### Backward Compatibility

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-01 | A single-agent invocation must produce commits on `feat-{featureName}` and leave `main` unchanged, with no additional configuration required beyond the current Ptah setup | [REQ-PF-NF-03], [TSPEC §9.1] | Integration | P0 |

---

### 3.2 Contract Properties

Protocol compliance, type conformance, and interface shape.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-CT-01 | `GitClient` interface must declare all 8 Phase 10 methods: `createWorktreeFromBranch`, `checkoutBranchInWorktree`, `createBranchFromRef`, `pullInWorktree`, `mergeInWorktree`, `abortMergeInWorktree`, `getConflictedFiles`, `pushInWorktree` with the signatures specified in TSPEC §4.3 | [TSPEC §4.3] | Unit | P0 |
| PROP-CT-02 | `CommitParams` must include `featureBranch: string` as a required field | [TSPEC §4.4] | Unit | P0 |
| PROP-CT-03 | `CommitResult` must include `conflictFiles?: string[]` and `retainedWorktreePath?: string` as optional fields | [REQ-MG-02], [REQ-FB-03], [TSPEC §4.4] | Unit | P0 |
| PROP-CT-04 | `MergeStatus` union type must include `"pull-error"` and `"push-error"` members in addition to the existing members | [REQ-MG-03], [REQ-FB-03], [TSPEC §4.4] | Unit | P0 |
| PROP-CT-05 | `InvocationGuardParams` must include `featureBranch: string` as a required field | [TSPEC §4.4, §4.7] | Unit | P0 |
| PROP-CT-06 | `mergeInWorktree` must have return type `Promise<MergeResult>` where `MergeResult = "merged" \| "conflict" \| "merge-error"` | [TSPEC §4.3] | Unit | P0 |
| PROP-CT-07 | `FakeGitClient` must implement all 8 Phase 10 methods with separate call-recording arrays and error-injection fields for each method, exactly as specified in TSPEC §7.2 | [TSPEC §7.2] | Unit | P0 |

---

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-EH-01 | `ArtifactCommitter` must return `"commit-error"` and call `cleanupSubBranch` when `addInWorktree` throws | [REQ-AB-04], [TSPEC §5.2 step 2] | Unit | P0 |
| PROP-EH-02 | `ArtifactCommitter` must return `"commit-error"` and call `cleanupSubBranch` when `commitInWorktree` throws | [REQ-AB-04], [TSPEC §5.2 step 3] | Unit | P0 |
| PROP-EH-03 | `ArtifactCommitter` must clean up both the merge worktree and the sub-branch worktree, then return `"pull-error"`, when `pullInWorktree` throws a genuine error (network failure, authentication failure, or diverged history) | [REQ-MG-03], [TSPEC §5.2 step b] | Unit | P1 |
| PROP-EH-04 | `ArtifactCommitter` must release the merge-lock in a `finally` block so that every execution path — success, conflict, merge-error, pull-error, push-error — releases the lock before returning | [REQ-MG-01], [TSPEC §5.2 step 6] | Unit | P0 |
| PROP-EH-05 | `NodeGitClient.pullInWorktree` must silently return (resolve without throwing) when git exits with a "couldn't find remote ref" error in stderr | [REQ-MG-03 new-branch path], [TSPEC §4.3] | Integration | P1 |
| PROP-EH-06 | `NodeGitClient.pullInWorktree` must throw an error for genuine pull failures: network errors, authentication failures, and diverged history | [REQ-MG-03], [TSPEC §4.3] | Integration | P1 |
| PROP-EH-07 | `NodeGitClient.createBranchFromRef` must throw when the target branch already exists | [TSPEC §4.3] | Integration | P0 |
| PROP-EH-08 | `NodeGitClient.pushInWorktree` must throw when the remote rejects the push (e.g., non-fast-forward rejection) | [REQ-FB-03], [TSPEC §4.3] | Integration | P0 |

---

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-01 | `featureNameToSlug` must return `"unnamed"` for any input that yields an empty string after transformation — specifically: empty string `""`, all-hyphens `"---"`, and all-special-characters `"#@!"` | [TSPEC §4.2], [PLAN B-02] | Unit | P0 |
| PROP-DI-02 | `ArtifactCommitter` must stage all items in `artifactChanges` without filtering by directory — `docs/`, `src/`, `tests/`, and all other paths must be staged | [TSPEC §5.2 step 2, OQ-03] | Unit | P0 |
| PROP-DI-03 | `Orchestrator` must not modify or reset any existing commits on the feature branch when `branchExists` returns `true` — the feature branch HEAD must remain unchanged before the new sub-branch is created from it | [REQ-FB-02] | Unit | P0 |
| PROP-DI-04 | An agent sub-branch created from `feat-{featureName}` must contain all commits previously merged to the feature branch — the agent starts with the complete accumulated state | [REQ-AB-02], [TSPEC §5.1 step 6] | Integration | P0 |

---

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-IN-01 | `NodeGitClient.createWorktreeFromBranch` must execute `git worktree add -b {newBranch} {path} {baseBranch}` — the `-b` flag must be present and `baseBranch` must be passed as the third argument | [REQ-AB-02], [TSPEC §4.3] | Integration | P0 |
| PROP-IN-02 | `NodeGitClient.checkoutBranchInWorktree` must execute `git worktree add {path} {branch}` without the `-b` flag — it checks out an existing branch, not creates one | [TSPEC §4.3] | Integration | P0 |
| PROP-IN-03 | `NodeGitClient.createBranchFromRef` must execute `git branch {branch} {ref}` without checking out the new branch | [REQ-FB-01], [TSPEC §4.3] | Integration | P0 |
| PROP-IN-04 | `NodeGitClient.mergeInWorktree` must execute `git -C {worktreePath} merge --no-ff {branch}` — the `--no-ff` flag must be present to always create a merge commit | [TSPEC §4.3, OQ-02] | Integration | P0 |
| PROP-IN-05 | `NodeGitClient.getConflictedFiles` must return the list of unresolved conflict file paths by running `git -C {worktreePath} diff --name-only --diff-filter=U` | [REQ-MG-02], [TSPEC §4.3] | Integration | P0 |
| PROP-IN-06 | `NodeGitClient.pushInWorktree` must execute `git -C {worktreePath} push {remote} {branch}` | [REQ-FB-03], [TSPEC §4.3] | Integration | P0 |
| PROP-IN-07 | The merge-lock must be released on every code path through `ArtifactCommitter.commitAndMerge` — after any result status (success, conflict, merge-error, pull-error, push-error, lock-timeout), a subsequent `mergeLock.acquire()` call must succeed | [REQ-MG-01], [TSPEC §5.2 step 6] | Unit | P0 |
| PROP-IN-08 | `ContextAssembler.extractFeatureName` must delegate to `extractFeatureName` from `feature-branch.ts` so that the orchestrator and context assembler use identical feature name extraction logic | [TSPEC §9.3] | Unit | P1 |

---

### 3.6 Performance Properties

Response times, resource limits, and timeout behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-02 | The two-tier merge pipeline — from merge-lock acquisition through `pullInWorktree`, `mergeInWorktree`, `pushInWorktree`, to merge-lock release — must complete in under 10 seconds when using a local bare repository as the remote | [REQ-PF-NF-01] | Integration (manual validation per PLAN DoD) | P1 |
| PROP-NF-03 | At any point in time, `git worktree list` must show no more worktrees than the count of active agent invocations plus the count of worktrees explicitly retained for conflict or push-error resolution | [REQ-PF-NF-02] | Integration (manual validation per PLAN DoD) | P1 |

---

### 3.7 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-ID-01 | `featureNameToSlug` must be idempotent: `featureNameToSlug(featureNameToSlug(x)) === featureNameToSlug(x)` for any non-empty string input | [TSPEC §4.2] | Unit | P0 |
| PROP-ID-02 | `featureBranchName` must always return the same branch name string for the same feature name input — no randomness, no side effects | [TSPEC §4.2] | Unit | P0 |

---

### 3.8 Observability Properties

Logging and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-OB-01 | `ArtifactCommitter` must log a non-fatal warning when `cleanupSubBranch` encounters an error — the error must be logged and execution must continue rather than propagating the failure | [TSPEC §5.3] | Unit | P1 |
| PROP-OB-02 | `ArtifactCommitter` must log a non-fatal warning when `removeWorktree` fails during success-path merge worktree cleanup — the error must be logged and the `"merged"` result must still be returned | [TSPEC §5.2 step e] | Unit | P1 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. These are derived from specification constraints, inversion of positive properties, and critical correctness invariants.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NEG-01 | `ArtifactCommitter` must NOT call any method that targets `main` as a merge destination — the old `merge(branch)` call is replaced by the two-tier flow; no `GitClient` method targeting `main` exists on the interface | [REQ-FB-04], [TSPEC §4.5, PLAN DoD] | Unit (compile-time invariant) | P0 |
| PROP-NEG-02 | `ArtifactCommitter` must NOT call `abortMergeInWorktree` when `mergeInWorktree` returns `"conflict"` — the worktree must remain in `MERGE_HEAD` state for the developer to run `git merge --continue` | [REQ-MG-02], [TSPEC §5.2 step c] | Unit | P0 |
| PROP-NEG-03 | `ArtifactCommitter` must NOT call `removeWorktree` on the merge worktree when `mergeInWorktree` returns `"conflict"` — the merge worktree must be retained indefinitely at `retainedWorktreePath` | [REQ-MG-02], [TSPEC §5.2 step c] | Unit | P0 |
| PROP-NEG-04 | `ArtifactCommitter` must NOT call `removeWorktree` on the merge worktree when `pushInWorktree` throws — the merge worktree must be retained so the developer can push manually | [REQ-FB-03], [TSPEC §5.2 step d] | Unit | P0 |
| PROP-NEG-05 | `ArtifactCommitter` must NOT create the merge worktree before acquiring the merge-lock — merge worktree creation is the first action inside the lock, not before it | [REQ-MG-01], [TSPEC §5.2 steps 4–5] | Unit | P0 |
| PROP-NEG-06 | `Orchestrator` must NOT call `createBranchFromRef` when `branchExists(featureBranch)` returns `true` — the existing feature branch must be reused without modification | [REQ-FB-02] | Unit | P0 |
| PROP-NEG-07 | `Orchestrator` must NOT create agent sub-branch worktrees from `main` HEAD — the `baseBranch` argument to `createWorktreeFromBranch` must be `featureBranch`, not `"main"` | [REQ-AB-02], [C-10-02] | Unit | P0 |
| PROP-NEG-08 | Sub-branch names must NOT use `feat-{name}/` as a prefix — the prefix must be `ptah/` to avoid the git ref file-directory conflict described in C-10-03 | [REQ-AB-01], [C-10-03] | Unit | P0 |
| PROP-NEG-09 | `NodeGitClient.pullInWorktree` must NOT throw when git exits with "couldn't find remote ref" in stderr — this condition is an expected no-op for brand-new feature branches that have never been pushed | [REQ-MG-03 new-branch path], [TSPEC §4.3] | Integration | P1 |
| PROP-NEG-10 | SKILL.md files must NOT instruct agents to run `git checkout`, `git checkout feat-` with pull, `git fetch origin && git checkout -b`, or `git push origin feat-` to manage feature branches | [REQ-SK-01], [TSPEC §4.8] | Manual | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-FB-01 | PROP-FB-01, PROP-FB-02, PROP-FB-03, PROP-FB-04, PROP-FB-05, PROP-FB-07, PROP-ID-01, PROP-ID-02 | Full |
| REQ-FB-02 | PROP-FB-06, PROP-DI-03, PROP-NEG-06 | Full |
| REQ-FB-03 | PROP-FB-08, PROP-FB-09, PROP-FB-10, PROP-EH-08, PROP-IN-06, PROP-NEG-04 | Full |
| REQ-FB-04 | PROP-NEG-01 | Full — covered at compile time per PLAN DoD: `GitClient` interface has no `merge(target: "main")` method; no runtime assertion required |
| REQ-AB-01 | PROP-AB-01, PROP-AB-02, PROP-AB-03, PROP-AB-04, PROP-AB-05, PROP-NEG-08 | Full |
| REQ-AB-02 | PROP-AB-03, PROP-DI-04, PROP-NEG-07 | Full |
| REQ-AB-03 | PROP-AB-03, PROP-IN-01, PROP-IN-02 | Full — isolation guaranteed by per-agent worktree/branch creation |
| REQ-AB-04 | PROP-AB-07, PROP-AB-08, PROP-AB-09, PROP-EH-01, PROP-EH-02 | Full |
| REQ-MG-01 | PROP-MG-03, PROP-EH-04, PROP-IN-07, PROP-NEG-05 | Full |
| REQ-MG-02 | PROP-MG-05, PROP-MG-09, PROP-IN-05, PROP-NEG-02, PROP-NEG-03 | Full |
| REQ-MG-03 | PROP-MG-04, PROP-MG-08, PROP-EH-03, PROP-EH-05, PROP-EH-06, PROP-NEG-09 | Full |
| REQ-MG-04 | PROP-MG-07, PROP-MG-10, PROP-MG-11 | Full |
| REQ-SK-01 | PROP-SK-01, PROP-SK-02, PROP-NEG-10 | Full |
| REQ-SK-02 | PROP-SK-03 | Full |
| REQ-PF-NF-01 | PROP-NF-02 | Full — manual validation only per PLAN DoD (latency is environment-dependent) |
| REQ-PF-NF-02 | PROP-NF-03 | Full — manual validation only per PLAN DoD (requires live orchestrator with concurrent invocations) |
| REQ-PF-NF-03 | PROP-NF-01 | Full |

### 5.2 Specification Coverage

| TSPEC Section | Properties | Coverage |
|---------------|------------|----------|
| §4.2 `feature-branch.ts` functions | PROP-FB-01 through PROP-FB-04, PROP-AB-01, PROP-DI-01, PROP-ID-01, PROP-ID-02 | Full |
| §4.3 `GitClient` Phase 10 methods | PROP-CT-01, PROP-CT-06, PROP-CT-07, PROP-EH-05 through PROP-EH-08, PROP-IN-01 through PROP-IN-06 | Full |
| §4.4 Type updates | PROP-CT-02, PROP-CT-03, PROP-CT-04, PROP-CT-05 | Full |
| §4.5 `ArtifactCommitter` two-tier | PROP-MG-01 through PROP-MG-07, PROP-FB-08, PROP-FB-09, PROP-AB-07 through PROP-AB-09, PROP-NEG-01 | Full |
| §4.6 Orchestrator `handleCommitResult` | PROP-MG-08 through PROP-MG-10, PROP-FB-10 | Full |
| §4.7 `InvocationGuard` | PROP-AB-04, PROP-AB-05, PROP-MG-11 | Full |
| §4.8 SKILL.md changes | PROP-SK-01, PROP-SK-02, PROP-SK-03, PROP-NEG-10 | Full |
| §5.1 Feature branch setup algorithm | PROP-FB-05, PROP-FB-06, PROP-FB-07, PROP-AB-02, PROP-AB-03, PROP-AB-06 | Full |
| §5.2 Two-tier merge algorithm | PROP-MG-01 through PROP-MG-07, PROP-AB-07 through PROP-AB-09, PROP-EH-01 through PROP-EH-04, PROP-NEG-02 through PROP-NEG-05 | Full |
| §5.3 Cleanup | PROP-AB-07, PROP-AB-08, PROP-OB-01 | Full |
| §9.3 ContextAssembler DRY refactor | PROP-IN-08 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 12 | 12 | 0 | 0 |
| P1 | 5 | 5 | 0 | 0 |
| P2 | 0 | — | — | — |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 — no critical user journeys require E2E tests;
       /----------\            all scenarios are covered at unit/integration level
      / Integration \      14 — NodeGitClient git commands, cross-module wiring
     /----------------\
    /    Unit Tests     \  52 — pure functions, ArtifactCommitter paths,
   /____________________\       Orchestrator, InvocationGuard, FakeGitClient
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 47 | 71% |
| Integration | 11 | 17% |
| Manual verification | 5 | 8% |
| Compile-time invariant | 1 | 2% |
| Integration (manual) | 2 | 3% |
| **Total** | **66** | **100%** |

**E2E tests: 0 recommended.** All properties are testable at unit or integration level. The critical user journeys (parallel agents merging to a feature branch, conflict resolution workflow) are adequately covered by `NodeGitClient` integration tests against a local bare repository and `ArtifactCommitter` unit tests with `FakeGitClient`.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | REQ-PF-NF-01 (merge latency < 10s) and REQ-PF-NF-02 (worktree count bound) have no automated test — manual validation only per PLAN DoD | Latency regressions or worktree leaks could go undetected in CI | Low | Accept manual validation for Phase 10 per PLAN DoD. If worktree leaks are observed in production, add a `git worktree list \| wc -l` assertion to the integration test setup/teardown. |
| 2 | REQ-FB-04 (no merge to main) is a compile-time invariant with no runtime test | If the `merge()` method is accidentally re-added to `GitClient`, there is no test to catch its misuse at runtime | Low | The interface-level constraint is sufficient per PLAN DoD Q-01 resolution. If a `merge()` method is ever re-added for non-main purposes, add a negative assertion to the `ArtifactCommitter` happy-path test verifying no `main`-targeting call occurs. |
| 3 | Conflict-retained worktrees have no TTL and no automated cleanup path — developer is solely responsible for `git worktree remove` after resolution | Unreachable retained worktrees could accumulate on developer machines over time | Low | Document the retention behavior in Discord notification messages (already required by REQ-MG-02). Consider a `ptah worktree prune --retained` command in a future phase. |
| 4 | SKILL.md verification (PROP-SK-01, PROP-SK-02, PROP-SK-03, PROP-NEG-10) is manual — no automated CI check enforces SKILL.md content constraints | A future SKILL.md edit could re-introduce conflicting git instructions without detection | Medium | Add a CI grep check: `grep -r "git checkout.*feat-\|git push origin feat-" .claude/skills/` should return no matches. This is a one-line CI assertion that covers all four files. |
| 5 | `executePatternBResume` parity (PROP-AB-06) tests three specific assertions (G-09 in PLAN): `createBranchFromRef`, `createWorktreeFromBranch`, and `featureBranch` in `InvocationGuardParams`. If the resume path adds future logic diverging from the routing loop path, new properties will be needed. | Parallel agents using resume invocations could operate on stale feature branch state | Low | PROP-AB-06 covers Phase 10 parity. Review if `executePatternBResume` diverges during implementation and add properties as needed. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | Product Manager | March 14, 2026 | Approved (minor changes) |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Test Engineer | Initial properties document. 66 positive properties across 8 categories (33 functional, 7 contract, 8 error handling, 4 data integrity, 8 integration, 2 performance, 2 idempotency, 2 observability) plus 10 negative properties. All 17 requirements covered. No E2E tests recommended — full coverage achieved at unit and integration levels. |
| 1.1 | March 14, 2026 | Test Engineer | Address PM review feedback: (F-01) Renumber §3.8→§3.7 and §3.9→§3.8 to correct section gap; (F-02) Add clarifying note on PROP-SK-01/PROP-NEG-10 complementary relationship; (F-03) Strengthen PROP-FB-09 to explicitly assert commit reachability after push failure. Status updated to Approved. |

---

*End of Document*
