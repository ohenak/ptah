# Technical Specification: Phase 10 — Parallel Feature Development

| Field | Detail |
|-------|--------|
| **Document ID** | 010-TSPEC-ptah-parallel-feature-development |
| **Requirements** | [010-REQ-ptah-parallel-feature-development](010-REQ-ptah-parallel-feature-development.md) |
| **Date** | March 14, 2026 |
| **Author** | Backend Engineer |
| **Status** | Draft |

---

## 1. Summary

This phase replaces the current direct-to-`main` merge strategy with a two-tier branch strategy. Agent sub-branches (ephemeral, per-invocation) merge into a persistent `feat-{feature-name}` branch, which accumulates all agent work for the feature and is reviewed as a pull request before merging to `main`. Multiple agents may work on the same feature concurrently; their sub-branches are isolated, and merges to the feature branch are serialized via the existing `AsyncMutex` merge-lock. Four SKILL.md files are updated to remove conflicting git workflow instructions.

**Key architectural changes:**
1. **New module** `feature-branch.ts` — pure functions for branch name derivation and slug transformation
2. **`GitClient` protocol** — 8 new methods for Phase 10 git operations
3. **`ArtifactCommitter`** — two-tier merge: commit in sub-branch → lock → pull feature branch → merge → push feature branch
4. **`Orchestrator`** — feature branch creation, new sub-branch naming, `createWorktreeFromBranch`
5. **`InvocationGuard`** — forward `featureBranch` through params; handle new terminal statuses
6. **`types.ts`** — extend `CommitParams`, `CommitResult`, and `MergeStatus`
7. **SKILL.md files** (4) — remove git workflow instructions that conflict with orchestrator-managed worktrees

---

## 2. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Runtime | Node.js 20 LTS | No change |
| Language | TypeScript 5.x (ESM) | No change |
| Package manager | npm | No change |
| Test framework | Vitest | No change |
| New dependencies | None | All git operations use `execFileAsync("git", [...])` |

No new npm dependencies are required. All new git operations are implemented using the existing `execFileAsync` pattern from `node:child_process`.

---

## 3. Project Structure

```
ptah/
├── bin/
│   └── ptah.ts                                         (UPDATED — pass featureBranch context)
├── src/
│   ├── orchestrator/
│   │   ├── feature-branch.ts                           (NEW — slug/branch name pure functions)
│   │   ├── artifact-committer.ts                       (UPDATED — two-tier merge logic)
│   │   ├── invocation-guard.ts                         (UPDATED — featureBranch in params)
│   │   ├── orchestrator.ts                             (UPDATED — feature branch setup, new naming)
│   │   └── merge-lock.ts                               (NO CHANGE)
│   ├── services/
│   │   └── git.ts                                      (UPDATED — 8 new Phase 10 methods)
│   └── types.ts                                        (UPDATED — CommitParams, CommitResult)
├── tests/
│   ├── unit/
│   │   └── orchestrator/
│   │       ├── feature-branch.test.ts                  (NEW)
│   │       ├── artifact-committer.test.ts              (UPDATED — new two-tier merge tests)
│   │       ├── invocation-guard.test.ts                (UPDATED — featureBranch param tests)
│   │       └── orchestrator.test.ts                    (UPDATED — feature branch setup tests)
│   └── fixtures/
│       └── factories.ts                                (UPDATED — FakeGitClient Phase 10 methods)
└── ...

.claude/
└── skills/
    ├── backend-engineer/SKILL.md                       (UPDATED — git workflow section)
    ├── product-manager/SKILL.md                        (UPDATED — git workflow section)
    ├── frontend-engineer/SKILL.md                      (UPDATED — git workflow section)
    └── test-engineer/SKILL.md                          (UPDATED — git workflow section)
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts
  └── DefaultOrchestrator
        ├── featureBranchName()         ← feature-branch.ts (new)
        ├── agentSubBranchName()        ← feature-branch.ts (new)
        ├── NodeGitClient               ← git.ts (Phase 10 methods)
        └── DefaultInvocationGuard
              └── DefaultArtifactCommitter
                    ├── NodeGitClient   ← git.ts (Phase 10 methods)
                    └── AsyncMutex      ← merge-lock.ts (no change)

feature-branch.ts (new, no dependencies)
  └── extractFeatureName()
  └── featureNameToSlug()
  └── featureBranchName()
  └── agentSubBranchName()
```

### 4.2 New Module: `src/orchestrator/feature-branch.ts`

Pure functions only. No I/O, no external dependencies.

```typescript
/**
 * Extracts the feature name from a Discord thread name.
 * Thread names follow the convention "{feature-name} — {task description}".
 * If no em-dash separator is present, the full thread name is returned.
 *
 * Examples:
 *   "010-parallel-feature-development — create TSPEC" → "010-parallel-feature-development"
 *   "My Feature #2 — create TSPEC"                    → "My Feature #2"
 *   "standalone-task"                                  → "standalone-task"
 */
export function extractFeatureName(threadName: string): string;

/**
 * Converts a feature name to a URL-safe branch slug.
 * Algorithm:
 *   1. Lowercase the input
 *   2. Replace sequences of non-alphanumeric characters with a single hyphen
 *   3. Strip leading and trailing hyphens
 *
 * Examples:
 *   "010-parallel-feature-development" → "010-parallel-feature-development"
 *   "My Feature #2"                    → "my-feature-2"
 *   "  Trailing Hyphens--"             → "trailing-hyphens"
 */
export function featureNameToSlug(featureName: string): string;

/**
 * Returns the persistent feature branch name for a given feature.
 * Format: "feat-{slug}"
 *
 * Examples:
 *   "010-parallel-feature-development" → "feat-010-parallel-feature-development"
 *   "My Feature #2"                    → "feat-my-feature-2"
 */
export function featureBranchName(featureName: string): string;

/**
 * Returns the agent sub-branch name for a specific agent invocation on a feature.
 * Format: "ptah/{slug}/{agentId}/{invocationId}"
 *
 * The "ptah/" prefix (not "feat-{name}/") avoids the git ref file/directory conflict
 * (C-10-03): git cannot create "feat-foo/eng/a1b2c3d4" because "feat-foo" already
 * exists as a file in .git/refs/heads/.
 *
 * Examples:
 *   ("parallel-feature-development", "eng", "a1b2c3d4")
 *     → "ptah/parallel-feature-development/eng/a1b2c3d4"
 */
export function agentSubBranchName(
  featureName: string,
  agentId: string,
  invocationId: string,
): string;
```

**Behavioral contracts:**
- `featureNameToSlug` is idempotent: `featureNameToSlug(featureNameToSlug(x)) === featureNameToSlug(x)`
- `featureNameToSlug` never returns an empty string for non-empty input (after stripping, if result is empty, return "unnamed")
- All functions are pure (no side effects, no I/O)

### 4.3 Updated Protocol: `GitClient` (Phase 10 additions)

```typescript
// --- Phase 10 ---

/**
 * Creates a new branch from a specified base branch and adds it as a worktree.
 * Equivalent to: git worktree add -b {newBranch} {path} {baseBranch}
 *
 * Used to create agent sub-branches from the feature branch HEAD (REQ-AB-02).
 */
createWorktreeFromBranch(
  newBranch: string,
  path: string,
  baseBranch: string,
): Promise<void>;

/**
 * Checks out an EXISTING branch into a new worktree (no -b flag).
 * Equivalent to: git worktree add {path} {branch}
 *
 * Used to create a temporary merge worktree for the feature branch.
 */
checkoutBranchInWorktree(branch: string, path: string): Promise<void>;

/**
 * Creates a local branch from a given ref without checking it out.
 * Equivalent to: git branch {branch} {ref}
 *
 * Used to create the feature branch from main on first invocation (REQ-FB-01).
 * Throws if the branch already exists.
 */
createBranchFromRef(branch: string, ref: string): Promise<void>;

/**
 * Pulls the specified branch from a remote into an existing worktree.
 * Equivalent to: git -C {worktreePath} pull {remote} {branch}
 *
 * Used to update the feature branch before merging (REQ-MG-03).
 * Throws on network error, authentication failure, or diverged history.
 */
pullInWorktree(
  worktreePath: string,
  remote: string,
  branch: string,
): Promise<void>;

/**
 * Merges a branch into the HEAD of a worktree.
 * Equivalent to: git -C {worktreePath} merge {branch}
 *
 * Returns "merged" on success, "conflict" on content conflict,
 * "merge-error" on other git error.
 *
 * IMPORTANT: On conflict, does NOT automatically abort. The caller decides
 * whether to abort (cleanup) or retain (developer resolution).
 */
mergeInWorktree(worktreePath: string, branch: string): Promise<MergeResult>;

/**
 * Aborts an in-progress merge in a worktree.
 * Equivalent to: git -C {worktreePath} merge --abort
 *
 * Used only in the merge-error (non-conflict) case.
 */
abortMergeInWorktree(worktreePath: string): Promise<void>;

/**
 * Returns the list of files with unresolved merge conflicts in a worktree.
 * Equivalent to: git -C {worktreePath} diff --name-only --diff-filter=U
 *
 * Used to populate the Discord notification for REQ-MG-02.
 */
getConflictedFiles(worktreePath: string): Promise<string[]>;

/**
 * Pushes a branch to a remote from a worktree.
 * Equivalent to: git -C {worktreePath} push {remote} {branch}
 *
 * Used to push the feature branch after a successful merge (REQ-FB-03).
 * Throws if the push is rejected (e.g., remote has advanced).
 */
pushInWorktree(
  worktreePath: string,
  remote: string,
  branch: string,
): Promise<void>;
```

### 4.4 Updated Types: `src/types.ts`

```typescript
// CommitParams: add featureBranch
export interface CommitParams {
  worktreePath: string;
  branch: string;            // agent sub-branch: ptah/{featureName}/{agentId}/{invocationId}
  featureBranch: string;     // NEW: feature branch: feat-{featureName}
  artifactChanges: string[];
  agentId: string;
  threadName: string;
}

// CommitResult: add conflictFiles, retainedWorktreePath; extend mergeStatus
export type MergeStatus =
  | MergeResult           // "merged" | "conflict" | "merge-error"
  | "no-changes"
  | "commit-error"
  | "lock-timeout"
  | "pull-error"          // NEW: git pull of feature branch failed (REQ-MG-03)
  | "push-error";         // NEW: git push of feature branch failed (REQ-FB-03)

export interface CommitResult {
  commitSha: string | null;
  mergeStatus: MergeStatus;
  branch: string;
  conflictMessage?: string;
  conflictFiles?: string[];          // NEW: files in conflict (REQ-MG-02)
  retainedWorktreePath?: string;     // NEW: retained merge worktree path (REQ-MG-02, REQ-FB-03)
}

// InvocationGuardParams: add featureBranch
export interface InvocationGuardParams {
  agentId: string;
  threadId: string;
  threadName: string;
  bundle: ContextBundle;
  worktreePath: string;
  branch: string;
  featureBranch: string;   // NEW
  config: PtahConfig;
  shutdownSignal: AbortSignal;
  debugChannelId: string | null;
}
```

### 4.5 Updated Module: `artifact-committer.ts`

The `DefaultArtifactCommitter` implements the two-tier merge. The key change: instead of `gitClient.merge(branch)` (which merges into `main`), the committer:
1. Creates a temporary merge worktree for the feature branch
2. Pulls latest from remote
3. Merges the sub-branch
4. Pushes the feature branch
5. Cleans up or retains based on outcome

**Protocol additions:**
```typescript
export interface ArtifactCommitter {
  commitAndMerge(params: CommitParams): Promise<CommitResult>;
  // signature unchanged, but CommitParams now includes featureBranch
}
```

The `DefaultArtifactCommitter` constructor signature stays the same (gitClient + mergeLock + logger). No new injected dependencies.

**Merge worktree path convention:**
- Format: `{tmpdir}/ptah-merge-worktrees/{uuid}` where `uuid` = `randomBytes(4).toString("hex")`
- Example: `/tmp/ptah-merge-worktrees/b3f9a1c2`
- Retained worktrees (conflict, push-error) stay at this path indefinitely
- Successful merge worktrees are removed via `removeWorktree(path)`

### 4.6 Updated Module: `orchestrator.ts`

The Orchestrator manages feature branch lifecycle and uses the new `feature-branch.ts` utilities.

**Key changes to `executeRoutingLoop` and `executePatternBResume`:**

```typescript
// 1. Derive feature name and branch
const featureName = extractFeatureName(triggerMessage.threadName);
const featureBranch = featureBranchName(featureName);

// 2. Ensure feature branch exists (REQ-FB-01, REQ-FB-02)
const featureBranchExists = await this.gitClient.branchExists(featureBranch);
if (!featureBranchExists) {
  await this.gitClient.createBranchFromRef(featureBranch, "main");
}

// 3. Generate sub-branch name using new convention (REQ-AB-01)
const invocationId = randomBytes(4).toString("hex");
const branch = agentSubBranchName(featureName, currentAgentId, invocationId);
const worktreePath = join(tmpdir(), "ptah-worktrees", invocationId);

// 4. Create sub-branch from feature branch HEAD (REQ-AB-02)
await this.gitClient.createWorktreeFromBranch(branch, worktreePath, featureBranch);

// 5. Pass featureBranch through InvocationGuard
const guardResult = await this.invocationGuard.invokeWithRetry({
  ..., branch, featureBranch, ...
});
```

**`handleCommitResult` updates:**

```typescript
case "pull-error":
  // REQ-MG-03: pull failure — post Discord notification
  // Content: feature branch name, git error, sub-branch name
  // Cleanup: sub-branch and worktree already cleaned up by ArtifactCommitter
  break;

case "push-error":
  // REQ-FB-03: push failure — post Discord notification
  // Content: feature branch name, git error, retained worktree path
  // Worktree retained: commitResult.retainedWorktreePath is set
  break;

case "conflict":
  // REQ-MG-02: now includes conflictFiles and retainedWorktreePath
  // Post Discord with: conflicted files, retained path, sub-branch, resolution commands
  break;

case "lock-timeout":
  // REQ-MG-04: lock timeout — post Discord notification
  // Content: feature branch name, sub-branch name, message indicating merge not performed
  // Cleanup: sub-branch and worktree already cleaned up by ArtifactCommitter
  break;
```

### 4.7 Updated Module: `invocation-guard.ts`

- `InvocationGuardParams` gets `featureBranch: string`
- `featureBranch` is forwarded to `artifactCommitter.commitAndMerge()`
- `pull-error` and `push-error` are treated as unrecoverable (no retry), same as `conflict`

### 4.8 SKILL.md Changes (4 files)

**Files:** `.claude/skills/backend-engineer/SKILL.md`, `.claude/skills/product-manager/SKILL.md`, `.claude/skills/frontend-engineer/SKILL.md`, `.claude/skills/test-engineer/SKILL.md`

**Section to update: "Git Workflow"**

Remove all instructions to run:
- `git checkout -b feat-{feature-name}`
- `git checkout feat-{feature-name} && git pull origin feat-{feature-name}`
- `git fetch origin && git checkout -b feat-{feature-name} origin/feat-{feature-name}`
- `git push origin feat-{feature-name}`

Replace with:

> **Branch management is handled by the orchestrator. Do NOT run `git checkout`, `git branch`, or `git push` to manage feature branches. The orchestrator creates your worktree, creates the sub-branch from the feature branch, and pushes the feature branch after your work is merged. Running these commands yourself will conflict with the orchestrator's branch management.**
>
> You are running in an isolated git worktree. Your working directory is the worktree root. Use relative paths for all file operations — do not attempt to navigate to or modify the main repository checkout.
>
> You may still run `git add` and `git commit` to stage and commit changes within your worktree (e.g., for code changes). Documentation changes in `docs/` are automatically staged and committed by the orchestrator after your invocation completes.

---

## 5. Algorithms

### 5.1 Feature Branch Setup (Orchestrator, per invocation)

```
1. Extract feature name:
   featureName = extractFeatureName(threadName)
   e.g., "010-parallel-feature-development — create TSPEC" → "010-parallel-feature-development"

2. Derive feature branch:
   featureBranch = featureBranchName(featureName)
   e.g., "010-parallel-feature-development" → "feat-010-parallel-feature-development"

3. Ensure feature branch exists locally (REQ-FB-01, REQ-FB-02):
   exists = await gitClient.branchExists(featureBranch)
   if not exists:
     await gitClient.createBranchFromRef(featureBranch, "main")
   // REQ-FB-02: if exists, do NOT reset — reuse as-is

4. Generate agent sub-branch:
   invocationId = randomBytes(4).toString("hex")
   branch = agentSubBranchName(featureName, agentId, invocationId)
   e.g., "ptah/010-parallel-feature-development/eng/a1b2c3d4"
   worktreePath = join(tmpdir(), "ptah-worktrees", invocationId)

5. Ensure branch uniqueness (existing ensureUniqueBranch logic, updated naming):
   branch = await ensureUniqueBranch(featureName, agentId, invocationId, branch)

6. Create agent sub-branch worktree from feature branch HEAD (REQ-AB-02):
   await gitClient.createWorktreeFromBranch(branch, worktreePath, featureBranch)
   // This ensures the agent sees all commits on feat-{featureName} (REQ-AB-02)
```

### 5.2 Two-Tier Merge (ArtifactCommitter.commitAndMerge)

```
INPUT: worktreePath, branch (sub-branch), featureBranch, artifactChanges, agentId, threadName

1. Validate — return no-changes if artifactChanges is empty

2. Filter — keep only docs/ paths

3. Stage — addInWorktree(worktreePath, docsChanges)
   On error → cleanupSubBranch(worktreePath, branch); return commit-error

4. Commit — commitInWorktree(worktreePath, message)
   On error → cleanupSubBranch(worktreePath, branch); return commit-error

5. Acquire merge lock (10,000ms timeout)
   On MergeLockTimeoutError → cleanupSubBranch(worktreePath, branch); return lock-timeout

6. Inside lock (try/finally to ensure release):

   a. Create merge worktree for feature branch:
      mergeWorktreePath = join(tmpdir(), "ptah-merge-worktrees", uuid())
      checkoutBranchInWorktree(featureBranch, mergeWorktreePath)

   b. Pull feature branch from remote (REQ-MG-03):
      pullInWorktree(mergeWorktreePath, "origin", featureBranch)
      On error:
        removeWorktree(mergeWorktreePath)      // merge worktree — clean up
        cleanupSubBranch(worktreePath, branch) // sub-branch — clean up
        return pull-error

   c. Merge sub-branch into feature branch:
      result = mergeInWorktree(mergeWorktreePath, branch)

      if result == "conflict":
        conflictFiles = getConflictedFiles(mergeWorktreePath)
        // DO NOT abort merge — retain worktree for developer resolution (REQ-MG-02)
        cleanupSubBranch(worktreePath, branch) // sub-branch no longer needed
        return conflict(files=conflictFiles, retainedPath=mergeWorktreePath)

      if result == "merge-error":
        abortMergeInWorktree(mergeWorktreePath)
        removeWorktree(mergeWorktreePath)      // clean up
        cleanupSubBranch(worktreePath, branch) // clean up
        return merge-error

   d. Push feature branch to remote (REQ-FB-03):
      pushInWorktree(mergeWorktreePath, "origin", featureBranch)
      On error:
        // DO NOT remove merge worktree — retain for developer (REQ-FB-03)
        cleanupSubBranch(worktreePath, branch)
        return push-error(retainedPath=mergeWorktreePath)

   e. SUCCESS:
      shortSha = getShortSha(commitSha)
      removeWorktree(mergeWorktreePath) // clean up merge worktree
      cleanupSubBranch(worktreePath, branch) // clean up agent sub-branch
      return merged(sha=shortSha)

7. Release lock (finally block)
```

### 5.3 Sub-Branch Cleanup (`cleanupSubBranch`)

```
1. removeWorktree(worktreePath) — best effort, log warning on failure
2. deleteBranch(branch)         — best effort, log warning on failure
```

### 5.4 Feature Name Slug Algorithm

```
Input:  threadName = "010-parallel-feature-development — create TSPEC"
Step 1: extractFeatureName → "010-parallel-feature-development"
Step 2: featureNameToSlug
  a. toLowerCase()         → "010-parallel-feature-development"
  b. /[^a-z0-9]+/g → '-'  → "010-parallel-feature-development"
  c. strip leading/trailing hyphens → "010-parallel-feature-development"
Output: "010-parallel-feature-development"
→ featureBranchName: "feat-010-parallel-feature-development"

Input:  "My Feature #2 — create TSPEC"
Step 1: extractFeatureName → "My Feature #2"
Step 2: featureNameToSlug
  a. toLowerCase()         → "my feature #2"
  b. /[^a-z0-9]+/g → '-'  → "my-feature-2"
  c. strip hyphens         → "my-feature-2"
Output: "my-feature-2"
→ featureBranchName: "feat-my-feature-2"
```

---

## 6. Error Handling

| Scenario | Behavior | CommitResult.mergeStatus | Discord Notification Content | Worktree Disposition |
|----------|----------|-------------------------|------------------------------|---------------------|
| No artifact changes | Return immediately | `no-changes` | None | Sub-branch cleaned up by caller |
| Stage failure (git add) | Log error | `commit-error` | Thread error embed via Orchestrator | Sub-branch cleaned up |
| Commit failure | Log error | `commit-error` | Thread error embed | Sub-branch cleaned up |
| Lock timeout (>10,000ms) | Log error | `lock-timeout` | Feature branch, sub-branch name, "merge not performed" | Sub-branch cleaned up |
| Pull failure (network/auth) | Log error | `pull-error` | Feature branch, git error, sub-branch name | Both worktrees cleaned up |
| Merge conflict | Retain merge worktree | `conflict` | Conflicted files, merge worktree path, sub-branch name, `git merge --continue` / `git merge --abort` commands | Merge worktree **retained**; sub-branch cleaned up |
| Merge error (non-conflict) | Abort, clean up | `merge-error` | Thread error embed | Both worktrees cleaned up |
| Push failure | Retain merge worktree | `push-error` | Feature branch, git error, merge worktree path | Merge worktree **retained**; sub-branch cleaned up |
| Feature branch creation failure | Throw (Orchestrator catches) | N/A | Orchestrator posts error embed | No worktree created |
| Sub-branch worktree creation failure | Throw (Orchestrator catches) | N/A | Orchestrator posts error embed | No worktree to clean |

**Notes on retained worktrees:**
- Retained worktrees (conflict, push-error) have no TTL. Developer is responsible for manual cleanup.
- Conflict-retained worktrees are in MERGE_HEAD state. Developer resolves conflicts in the worktree files then runs `git merge --continue` or `git merge --abort`.
- Push-retained worktrees have a complete merge commit but it was not pushed. Developer runs `git push origin {featureBranch}` from the worktree.

---

## 7. Test Strategy

### 7.1 Approach

All new and modified production code follows strict TDD (Red → Green → Refactor). Unit tests use fake implementations of all dependencies (no real git, no real filesystem, no real Discord). Integration tests use real git in temp repositories.

### 7.2 Test Doubles

**`FakeGitClient` additions (in `tests/fixtures/factories.ts`):**

```typescript
// Phase 10 additions to FakeGitClient

// createWorktreeFromBranch
createWorktreeFromBranchCalls: Array<{newBranch: string; path: string; baseBranch: string}> = [];
createWorktreeFromBranchError: Error | null = null;

// checkoutBranchInWorktree
checkoutBranchInWorktreeCalls: Array<{branch: string; path: string}> = [];
checkoutBranchInWorktreeError: Error | null = null;

// createBranchFromRef
createBranchFromRefCalls: Array<{branch: string; ref: string}> = [];
createBranchFromRefError: Error | null = null;

// pullInWorktree
pullInWorktreeCalls: Array<{worktreePath: string; remote: string; branch: string}> = [];
pullInWorktreeError: Error | null = null;

// mergeInWorktree
mergeInWorktreeResult: MergeResult = "merged";
mergeInWorktreeCalls: Array<{worktreePath: string; branch: string}> = [];
mergeInWorktreeError: Error | null = null;

// abortMergeInWorktree
abortMergeInWorktreeCalls: string[] = [];
abortMergeInWorktreeError: Error | null = null;

// getConflictedFiles
getConflictedFilesResult: string[] = [];
getConflictedFilesCalls: string[] = [];

// pushInWorktree
pushInWorktreeCalls: Array<{worktreePath: string; remote: string; branch: string}> = [];
pushInWorktreeError: Error | null = null;
```

**`defaultCommitResult()` factory update:**
```typescript
export function defaultCommitResult(): CommitResult {
  return {
    commitSha: "abc1234",
    mergeStatus: "merged",
    branch: "ptah/test-feature/dev-agent/fakeid",
    // conflictFiles and retainedWorktreePath are optional, omitted by default
  };
}
```

### 7.3 Test Categories

| Category | File | Tests |
|----------|------|-------|
| `feature-branch.ts` pure functions | `tests/unit/orchestrator/feature-branch.test.ts` | `extractFeatureName` (with/without em-dash), `featureNameToSlug` (lowercase, special chars, consecutive hyphens, edge cases), `featureBranchName`, `agentSubBranchName` |
| `ArtifactCommitter` two-tier merge | `tests/unit/orchestrator/artifact-committer.test.ts` | Happy path (merged+pushed+cleanup), pull failure, merge conflict (files+retained path), merge-error (cleanup), push failure (retained path), lock timeout (cleanup), no-changes |
| `DefaultOrchestrator` feature branch | `tests/unit/orchestrator/orchestrator.test.ts` | Feature branch creation on first invocation, feature branch reuse on subsequent invocations, sub-branch naming uses `ptah/{featureName}/{agentId}/{invocationId}`, sub-branch created from feature branch (createWorktreeFromBranch called), handleCommitResult for pull-error/push-error/conflict (new Discord content) |
| `InvocationGuard` featureBranch forwarding | `tests/unit/orchestrator/invocation-guard.test.ts` | `featureBranch` forwarded to commitAndMerge, pull-error treated as unrecoverable, push-error treated as unrecoverable |
| `NodeGitClient` integration | `tests/integration/` | createWorktreeFromBranch, checkoutBranchInWorktree, createBranchFromRef, pullInWorktree (with local bare remote), mergeInWorktree (clean + conflict), getConflictedFiles, pushInWorktree |

### 7.4 Test Patterns

**Conflict detection test example:**
```typescript
describe("merge conflict handling", () => {
  it("retains merge worktree and returns conflicted files on conflict", async () => {
    gitClient.mergeInWorktreeResult = "conflict";
    gitClient.getConflictedFilesResult = ["docs/010/010-TSPEC.md", "docs/010/010-PLAN.md"];

    const result = await committer.commitAndMerge({
      ...params,
      featureBranch: "feat-parallel-feature-development",
    });

    expect(result.mergeStatus).toBe("conflict");
    expect(result.conflictFiles).toEqual(["docs/010/010-TSPEC.md", "docs/010/010-PLAN.md"]);
    expect(result.retainedWorktreePath).toMatch(/ptah-merge-worktrees/);

    // Merge worktree NOT removed (retained for developer)
    expect(gitClient.removedWorktrees).not.toContain(result.retainedWorktreePath);

    // Sub-branch worktree IS removed
    expect(gitClient.removedWorktrees).toContain(params.worktreePath);

    // abortMerge NOT called (developer resolves manually)
    expect(gitClient.abortMergeInWorktreeCalls).toHaveLength(0);
  });
});
```

**Feature branch creation test example:**
```typescript
it("creates feature branch from main on first invocation", async () => {
  gitClient.branchExistsResult = false;

  await orchestrator.handleMessage(createThreadMessage({
    threadName: "010-parallel-feature-development — create TSPEC",
    content: "@eng create the TSPEC",
  }));

  expect(gitClient.createBranchFromRefCalls).toHaveLength(1);
  expect(gitClient.createBranchFromRefCalls[0]).toEqual({
    branch: "feat-010-parallel-feature-development",
    ref: "main",
  });
});

it("reuses existing feature branch on subsequent invocations", async () => {
  gitClient.branchExistsResult = true;

  await orchestrator.handleMessage(createThreadMessage({
    threadName: "010-parallel-feature-development — create PLAN",
    content: "@eng create the PLAN",
  }));

  expect(gitClient.createBranchFromRefCalls).toHaveLength(0);
});
```

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-FB-01 | `Orchestrator.executeRoutingLoop`, `GitClient.branchExists`, `GitClient.createBranchFromRef`, `featureBranchName()` | Orchestrator derives `feat-{slug}` on each invocation; creates from `main` if not exists |
| REQ-FB-02 | `Orchestrator.executeRoutingLoop` — `branchExists()` check + skip creation | When branch exists, skip `createBranchFromRef`; use existing branch as base |
| REQ-FB-03 | `DefaultArtifactCommitter.commitAndMerge`, `GitClient.pushInWorktree` | After merge, push feature branch; on push failure, retain merge worktree and return push-error |
| REQ-FB-04 | Remove old `gitClient.merge(branch)` call from `DefaultArtifactCommitter`; replace with two-tier flow | The old `merge()` call targeting `main` is deleted; no path now merges to `main` |
| REQ-AB-01 | `agentSubBranchName()` in `feature-branch.ts`, `Orchestrator.executeRoutingLoop` | New naming: `ptah/{featureName}/{agentId}/{invocationId}` |
| REQ-AB-02 | `GitClient.createWorktreeFromBranch`, `Orchestrator.executeRoutingLoop` | `git worktree add -b {subBranch} {path} {featureBranch}` — sub-branch starts from feature branch HEAD |
| REQ-AB-03 | `GitClient.createWorktreeFromBranch` (per-agent isolation) | Each agent invocation gets its own worktree and sub-branch; neither is visible to the other |
| REQ-AB-04 | `DefaultArtifactCommitter.cleanupSubBranch` | On merge success: remove sub-branch worktree + delete sub-branch. On technical failure (non-conflict): same. On conflict: sub-branch cleaned up but merge worktree retained. |
| REQ-MG-01 | `AsyncMutex` (existing, no change), `DefaultArtifactCommitter` lock acquisition | Single mutex serializes all merges; timeout returns lock-timeout |
| REQ-MG-02 | `DefaultArtifactCommitter.commitAndMerge` (conflict branch), `GitClient.getConflictedFiles`, `Orchestrator.handleCommitResult` | On conflict: collect files, retain merge worktree, return conflict result; Orchestrator posts Discord notification |
| REQ-MG-03 | `GitClient.pullInWorktree`, `DefaultArtifactCommitter.commitAndMerge` (pull step) | Pull before merge; on failure: clean up and return pull-error |
| REQ-MG-04 | `AsyncMutex` timeout (already 10,000ms), `DefaultArtifactCommitter.commitAndMerge` (lock step), `Orchestrator.handleCommitResult` | Lock timeout → cleanupSubBranch → return lock-timeout; Orchestrator posts Discord notification |
| REQ-SK-01 | `.claude/skills/{pm,eng,fe,qa}/SKILL.md` — Git Workflow section | Remove `git checkout`, `git branch`, `git push` instructions; add orchestrator manages branches statement |
| REQ-SK-02 | `.claude/skills/{pm,eng,fe,qa}/SKILL.md` — Git Workflow section | Add: "you are in an isolated worktree; cwd is worktree root; use relative paths" |
| REQ-PF-NF-01 | `NodeGitClient` implementation of Phase 10 methods using `execFileAsync` | Git operations are direct process calls; merge+push on local bare repo completes well within 10s |
| REQ-PF-NF-02 | `cleanupSubBranch` called on every non-conflict path; merge worktree removed on success/error | At any time, active worktrees ≤ active invocations + conflict-retained worktrees |
| REQ-PF-NF-03 | Default behavior (no opt-in); `featureBranch` derived from thread name automatically | Single-agent workflow uses same two-tier path; `main` is never touched |

---

## 9. Integration Points

### 9.1 Changes to Existing Callsites

| File | Current Behavior | New Behavior |
|------|-----------------|--------------|
| `orchestrator.ts` `executeRoutingLoop()` | `createWorktree(branch, path)` creates branch from `main` HEAD | `createWorktreeFromBranch(branch, path, featureBranch)` creates branch from feature branch HEAD |
| `orchestrator.ts` `executePatternBResume()` | Same as above | Same change |
| `orchestrator.ts` `ensureUniqueBranch()` | Builds `ptah/${agentId}/${threadId}/${invocationId}` | Builds `ptah/${featureName}/${agentId}/${invocationId}` (threadId removed) |
| `orchestrator.ts` `handleCommitResult()` | Handles: conflict, commit-error, merge-error, lock-timeout | Add: pull-error, push-error; enrich conflict with conflictFiles + retainedWorktreePath |
| `invocation-guard.ts` `invokeWithRetry()` | Does not pass featureBranch to commitAndMerge | Passes `featureBranch` through |
| `artifact-committer.ts` `commitAndMerge()` | Calls `this.gitClient.merge(branch)` which merges to `main` | Creates merge worktree, pulls, merges to feature branch, pushes |
| `skill-invoker.ts` `pruneOrphanedWorktrees()` | `pruneWorktrees("ptah/")` | No change — sub-branches still start with `ptah/` |
| `context-assembler.ts` `extractFeatureName()` | Local method | Import from `feature-branch.ts` (DRY) |
| `bin/ptah.ts` | No change in wiring needed | No change — `ArtifactCommitter` and `Orchestrator` receive same injected deps |

### 9.2 Merge Lock Scope

The single `AsyncMutex` instance (in `bin/ptah.ts`) is shared globally across all features. This is intentional: it's simpler and slightly more conservative than per-feature locks. With typical workloads (2–3 concurrent agents on one feature), the 10,000ms timeout provides sufficient window. Per-feature locks are deferred to a future phase if lock contention becomes a problem.

### 9.3 `ContextAssembler.extractFeatureName` Refactor

`DefaultContextAssembler.extractFeatureName()` is currently a public method on the class. In Phase 10, we extract the identical logic into `feature-branch.ts` as a standalone function. `DefaultContextAssembler` is updated to import and call `extractFeatureName` from `feature-branch.ts` rather than maintaining a local copy. The public method on `ContextAssembler` is kept for backward compatibility but delegates to the shared function. Unit tests for `ContextAssembler.extractFeatureName` continue to pass.

### 9.4 Existing Tests

The following existing tests are affected and require updates:

- `artifact-committer.test.ts`: All tests must add `featureBranch` to `createParams()` and update expectations for new two-tier merge behavior
- `orchestrator.test.ts`: Tests using `createWorktree` must update to `createWorktreeFromBranch`; tests for `handleCommitResult` must cover new statuses
- `invocation-guard.test.ts`: `InvocationGuardParams` mock must include `featureBranch`
- `factories.ts`: `FakeGitClient` gets Phase 10 method stubs; `defaultCommitResult()` branch name updated

---

## 10. Open Questions

| # | Question | Impact | Owner |
|---|---------|--------|-------|
| OQ-01 | Should `pullInWorktree` be skipped if the feature branch has no remote tracking ref (e.g., brand-new feature branch that was created locally and never pushed)? `git pull origin feat-{name}` will fail with "couldn't find remote ref" if the branch doesn't exist on remote. | Pull failure would incorrectly block the very first merge to a brand-new feature branch. | QA/BE |
| OQ-02 | Should `mergeInWorktree` use `--no-ff` to always create a merge commit, preserving agent history on the feature branch? Or allow fast-forward (simpler history)? The REQ does not specify. | Affects git log readability on the feature branch. | PM/BE |
| OQ-03 | The `ArtifactCommitter` currently filters to `docs/` only. Phase 10 brings code changes (src/, tests/) in scope when multiple BE agents implement PLAN steps. Should the filter be removed in Phase 10 or deferred? | If deferred, BE agents working on code (not docs) will produce no-changes and their commits won't appear on the feature branch. | PM/BE |

> **Note OQ-01 is likely a MUST-FIX before implementation.** If pull fails on a new feature branch's first invocation, no agent can ever merge. A safe resolution: catch `couldn't find remote ref` errors from `pullInWorktree` and treat as "no remote branch yet — skip pull". Alternatively, only pull if the remote tracking ref exists (`git ls-remote --heads origin {featureBranch}`).

---

## 11. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | March 14, 2026 | Backend Engineer | Initial draft |
