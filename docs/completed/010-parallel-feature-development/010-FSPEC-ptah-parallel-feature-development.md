# Functional Specification: Phase 10 — Parallel Feature Development

| Field | Detail |
|-------|--------|
| **Document ID** | 010-FSPEC-ptah-parallel-feature-development |
| **Requirements** | [010-REQ-ptah-parallel-feature-development](010-REQ-ptah-parallel-feature-development.md) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This document specifies the behavioral logic for the Phase 10 two-tier branch strategy. It covers the four areas where branching logic, multi-step flows, or business rules must be defined at the product level rather than left to engineering discretion:

1. **FSPEC-FB-01** — Feature Branch Lifecycle: how the persistent `feat-{feature-name}` branch is created, reused, and maintained.
2. **FSPEC-AB-01** — Agent Sub-Branch and Worktree Lifecycle: how per-agent sub-branches are created, isolated, and cleaned up.
3. **FSPEC-MG-01** — Merge Orchestration Flow: the complete sequence from lock acquisition to cleanup, covering success, conflict, technical failure, and timeout paths.
4. **FSPEC-SK-01** — Skill Git Workflow Alignment: what agents must and must not do regarding git in their SKILL.md instructions.

---

## 2. Functional Specifications

---

### FSPEC-FB-01: Feature Branch Lifecycle

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-FB-01 |
| **Title** | Feature Branch Lifecycle |
| **Linked requirements** | [REQ-FB-01], [REQ-FB-02], [REQ-FB-03], [REQ-FB-04] |
| **Status** | Draft |

#### Description

The orchestrator manages a persistent `feat-{feature-name}` branch for each feature. This branch is the single accumulation point for all agent work on the feature. The branch is created once from `main` and never reset; subsequent agent invocations branch from its HEAD. All agent commits flow to this branch, never directly to `main`. The branch is pushed to `origin` after each successful merge.

#### Behavioral Flow

```
On every agent invocation:

1. Derive feature name
   ├── Take Discord thread name
   ├── Strip " — {rest}" suffix (space + em-dash + space)
   ├── Slugify: lowercase → replace non-[a-z0-9-] with hyphen → collapse hyphens → strip leading/trailing hyphens
   └── Feature branch name = "feat-{slug}"

2. Feature branch setup
   ├── Does "feat-{slug}" exist locally?
   │   ├── YES → Does "origin/feat-{slug}" exist?
   │   │         ├── YES → Pull latest from remote (git pull origin feat-{slug})
   │   │         └── NO  → Use local branch as-is (branch is new, never pushed)
   │   └── NO  → Does "origin/feat-{slug}" exist?
   │             ├── YES → Fetch and create local tracking branch from origin
   │             └── NO  → Create branch from main (git checkout -b feat-{slug} main)
   └── Feature branch is now ready; its HEAD is the base for the agent's sub-branch

3. Create agent sub-branch from feature branch HEAD
   (see FSPEC-AB-01)

4. [Agent runs and commits work to sub-branch]

5. Merge agent sub-branch → feature branch
   (see FSPEC-MG-01)

6. Push feature branch to origin
   ├── Run: git push origin feat-{slug}
   ├── SUCCESS → Log success; sub-branch cleanup proceeds (FSPEC-AB-01 §cleanup)
   └── FAILURE (push rejected)
       ├── Retain the worktree with the un-pushed commit
       ├── Post Discord notification (see §Error Scenarios below)
       └── Do NOT clean up sub-branch or worktree — developer must resolve manually
```

#### Business Rules

| ID | Rule |
|----|------|
| BR-FB-01 | The feature branch name is always `feat-{slug}`, where `{slug}` is derived from the Discord thread name using the same algorithm as the feature folder slug (Phase 9 convention). The slug derivation is a pure function: same input always produces same output. |
| BR-FB-02 | The feature branch is NEVER reset, force-pushed, or deleted by the orchestrator. It is append-only from the orchestrator's perspective. |
| BR-FB-03 | `main` is NEVER the merge target for any agent work in Phase 10. The feature branch is always the merge target. |
| BR-FB-04 | The feature branch is pushed to `origin` after every successful sub-branch merge. A local-only feature branch that has never been pushed is acceptable only between branch creation and the first successful merge. |
| BR-FB-05 | If the feature branch does not exist locally but exists on `origin` (e.g., another Ptah instance created it), the local branch is created from `origin/feat-{slug}` to preserve its history. |

#### Input / Output

| Direction | Information |
|-----------|-------------|
| **Input** | Discord thread name (string) |
| **Output** | Name of the feature branch (string: `feat-{slug}`), state = branch exists locally and points to the correct HEAD |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Thread name contains only special characters (no alphanumeric) | Slug collapses to empty string → fallback slug `"feature"` used → branch name `feat-feature` |
| Thread name has no ` — ` separator | The full slugified thread name is used as the slug (no stripping) |
| Feature branch is ahead of remote due to a manual developer push between pull and the next merge | The pull during branch setup picks up the latest, so the agent's sub-branch is based on current HEAD. The subsequent merge handles normal divergence. |
| Multiple Ptah instances simultaneously attempt to create the same feature branch | The second `git checkout -b` will fail with "branch already exists". The orchestrator treats this as "branch already exists" and fetches it from remote. |

#### Error Scenarios

| Scenario | User-Visible Behavior |
|----------|----------------------|
| `git push origin feat-{slug}` is rejected (remote advanced) | Discord message: "⚠️ Push failed for feature branch `feat-{slug}`. The remote branch has advanced. The merged commit is preserved at worktree path: `{worktree-path}`. Run `cd {worktree-path} && git pull origin feat-{slug} --rebase && git push origin feat-{slug}` to resolve." Worktree and sub-branch are retained. |
| `git push origin feat-{slug}` fails with network or auth error | Discord message: "⚠️ Push failed for feature branch `feat-{slug}`. Error: `{git-error-message}`. The merged commit is preserved at worktree path: `{worktree-path}`. Push manually once the error is resolved." Worktree and sub-branch are retained. |

#### Acceptance Tests

**AT-FB-01: New feature, no existing branch**
```
WHO:   As the orchestrator
GIVEN: Thread "010-parallel-feature-development — create TSPEC" triggers an agent invocation
       AND no local or remote branch "feat-parallel-feature-development" exists
WHEN:  The orchestrator sets up the feature branch
THEN:  Branch "feat-parallel-feature-development" is created from current HEAD of "main"
       AND "git branch --list feat-parallel-feature-development" returns the branch name
       AND the agent's sub-branch is created from this branch's HEAD
```

**AT-FB-02: Existing feature branch reused**
```
WHO:   As the orchestrator
GIVEN: "feat-parallel-feature-development" exists with 3 prior agent commits
       AND a new agent invocation is triggered for this feature
WHEN:  The orchestrator sets up the feature branch
THEN:  No new feature branch is created
       AND the agent's sub-branch is created from the current HEAD of "feat-parallel-feature-development"
       AND all 3 prior commits remain on the feature branch (no history loss)
```

**AT-FB-03: Successful push after merge**
```
WHO:   As the orchestrator
GIVEN: An agent's sub-branch has been successfully merged into "feat-parallel-feature-development"
WHEN:  The push step executes
THEN:  "origin/feat-parallel-feature-development" reflects the merged commit
       AND "git log --oneline origin/feat-parallel-feature-development" shows the agent's commit
```

**AT-FB-04: Push rejected — worktree retained**
```
WHO:   As a developer
GIVEN: "origin/feat-parallel-feature-development" advanced since the local pull
       AND the git push is rejected with a non-fast-forward error
WHEN:  The push step executes
THEN:  A Discord message is posted with the worktree path and resolution instructions
       AND the worktree is NOT cleaned up
       AND "git log --oneline {worktree-path}" shows the agent's merged commit
```

---

### FSPEC-AB-01: Agent Sub-Branch and Worktree Lifecycle

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AB-01 |
| **Title** | Agent Sub-Branch and Worktree Lifecycle |
| **Linked requirements** | [REQ-AB-01], [REQ-AB-02], [REQ-AB-03], [REQ-AB-04] |
| **Status** | Draft |

#### Description

Each agent invocation receives a dedicated, isolated git worktree checked out to a uniquely named sub-branch. Sub-branches are created from the feature branch HEAD, ensuring agents see all prior committed work. Sub-branches and their worktrees are ephemeral — they exist only for the duration of the invocation and are cleaned up after merge. Worktrees retained for conflict resolution are the sole exception and persist indefinitely until developer action.

#### Behavioral Flow

```
Sub-branch creation (at invocation start):

1. Determine sub-branch name
   └── Pattern: ptah/{feature-name}/{agentId}/{invocationId}
       Example: ptah/parallel-feature-development/eng/a1b2c3d4
       Note: prefix is "ptah/", NOT "feat-{name}/" (avoids git ref file/directory conflict)

2. Create worktree on sub-branch
   └── git worktree add {worktree-path} -b {sub-branch-name} feat-{feature-name}
       (sub-branch is branched from feature branch HEAD, not from main)

3. Agent runs in worktree
   └── All file operations are relative to {worktree-path}
       Agent commits are on {sub-branch-name}

Sub-branch cleanup (after merge attempt):

4a. SUCCESS path (merge + push succeeded):
    ├── Remove worktree: git worktree remove {worktree-path} --force
    └── Delete sub-branch: git branch -d {sub-branch-name}

4b. CONFLICT path (content conflict during merge):
    ├── DO NOT remove worktree (retained for manual resolution)
    ├── DO NOT delete sub-branch
    └── Post Discord notification with worktree path and resolution commands
        (Worktree persists indefinitely — no TTL — until developer acts)

4c. TECHNICAL FAILURE path (non-conflict git error during merge):
    ├── Remove worktree: git worktree remove {worktree-path} --force
    └── Delete sub-branch: git branch -d {sub-branch-name}
        (un-merged commit is discarded — agent must be re-invoked if needed)

4d. LOCK TIMEOUT path (merge-lock wait exceeded):
    ├── Remove worktree: git worktree remove {worktree-path} --force
    └── Delete sub-branch: git branch -d {sub-branch-name}
        (un-merged commit is discarded — developer is notified per FSPEC-MG-01)
```

#### Business Rules

| ID | Rule |
|----|------|
| BR-AB-01 | Sub-branch naming pattern is `ptah/{feature-name}/{agentId}/{invocationId}`. The `ptah/` prefix (not `feat-{name}/`) is mandatory to avoid the git ref file/directory conflict: if `feat-{name}` exists as a branch file in `.git/refs/heads/`, git cannot create `feat-{name}/sub` because it would require `feat-{name}` to be a directory. |
| BR-AB-02 | Sub-branches are always created from the feature branch HEAD, never from `main` directly. |
| BR-AB-03 | Each concurrent agent invocation MUST have its own worktree and sub-branch. Two agents MUST NOT share a sub-branch or worktree. |
| BR-AB-04 | On successful merge and push: BOTH the worktree AND the sub-branch are cleaned up. Neither is retained after a clean completion. |
| BR-AB-05 | On conflict: NEITHER the worktree NOR the sub-branch is cleaned up. The developer is responsible for cleanup after manual resolution. |
| BR-AB-06 | On technical failure or lock timeout: BOTH the worktree AND the sub-branch are cleaned up. The agent's un-merged commits are not recoverable from the feature branch (but exist in the sub-branch until branch deletion). |

#### Input / Output

| Direction | Information |
|-----------|-------------|
| **Input** | Feature branch name, agent ID, invocation ID, worktree base path |
| **Output** | An isolated worktree at a deterministic path, checked out to a uniquely named sub-branch at the feature branch HEAD |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Worktree removal fails during cleanup (e.g., locked by OS process) | Log the error. Attempt `git worktree prune` to release stale refs. If still failing, post a Discord warning: "⚠️ Failed to clean up worktree `{path}`. Manual cleanup may be required: `git worktree remove {path} --force`." |
| Sub-branch deletion fails after worktree removal (e.g., branch ref locked) | Log the error. Post a Discord warning with the branch name and the command to delete it manually: `git branch -d {branch-name}`. |
| invocationId collides with an existing sub-branch (extremely unlikely but possible on rapid re-invocation) | The `git worktree add -b` command fails with "branch already exists". The orchestrator must surface this as a hard error to the developer rather than silently proceeding. |

#### Error Scenarios

| Scenario | User-Visible Behavior |
|----------|----------------------|
| Worktree creation fails (e.g., insufficient disk space, path conflict) | Discord message: "⚠️ Failed to create worktree for agent `{agentId}` on feature `{feature-name}`. Error: `{git-error-message}`. Invocation cancelled." No sub-branch or worktree is left behind. |
| Cleanup fails after successful merge | Discord warning with worktree path and manual cleanup command. Feature branch integrity is not affected — the merge was already committed and pushed. |

#### Acceptance Tests

**AT-AB-01: Sub-branch created from feature branch HEAD**
```
WHO:   As the orchestrator
GIVEN: "feat-parallel-feature-development" exists with 2 prior commits
       AND a new backend-engineer agent is invoked with invocationId "a1b2c3d4"
WHEN:  The worktree is created
THEN:  Branch "ptah/parallel-feature-development/eng/a1b2c3d4" exists
       AND the branch's base commit equals HEAD of "feat-parallel-feature-development"
       AND "git worktree list" shows the worktree at its expected path
```

**AT-AB-02: Concurrent agents have isolated worktrees**
```
WHO:   As the orchestrator
GIVEN: Agent A (eng, invocation a1b2c3d4) and Agent B (qa, invocation b5c6d7e8)
       are both invoked on "feat-parallel-feature-development" concurrently
WHEN:  Both worktrees are created
THEN:  Agent A's worktree is at a different path from Agent B's worktree
       AND Agent A's sub-branch name differs from Agent B's sub-branch name
       AND "git worktree list" shows 2 separate worktrees (plus the main checkout)
```

**AT-AB-03: Cleanup on successful merge**
```
WHO:   As the orchestrator
GIVEN: Agent A's sub-branch "ptah/parallel-feature-development/eng/a1b2c3d4" was merged successfully
WHEN:  Cleanup runs
THEN:  "git worktree list" does NOT show Agent A's worktree
       AND "git branch --list ptah/parallel-feature-development/eng/a1b2c3d4" returns empty
```

**AT-AB-04: Worktree retained on conflict**
```
WHO:   As a developer
GIVEN: Agent B's sub-branch merge produced a content conflict
WHEN:  The conflict is detected
THEN:  Agent B's worktree remains at its path in conflict state (MERGE_HEAD exists)
       AND "git worktree list" still shows Agent B's worktree
       AND "git branch --list {sub-branch}" still returns the branch
```

---

### FSPEC-MG-01: Merge Orchestration Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MG-01 |
| **Title** | Merge Orchestration Flow |
| **Linked requirements** | [REQ-MG-01], [REQ-MG-02], [REQ-MG-03], [REQ-MG-04] |
| **Status** | Draft |

#### Description

When an agent completes its work, the orchestrator performs a multi-step merge sequence to land the agent's commits on the feature branch. This sequence is protected by the existing `AsyncMutex` merge-lock to serialize concurrent merges. The sequence includes: lock acquisition (with timeout), pre-merge pull of the feature branch, merge attempt, post-merge push, and cleanup. Each failure point has a defined outcome that preserves developer visibility and branch integrity.

#### Behavioral Flow

```
Agent completion triggers merge sequence:

1. Acquire merge-lock
   ├── Attempt to acquire AsyncMutex with 10,000ms timeout
   ├── SUCCESS → proceed to step 2
   └── TIMEOUT (MergeLockTimeoutError after 10,000ms)
       ├── Post Discord notification (see §Lock Timeout below)
       ├── Clean up sub-branch and worktree (FSPEC-AB-01 §4d)
       └── END (agent's work is discarded — developer must re-invoke)

2. Pull latest feature branch from remote (pre-merge update)
   ├── Does "feat-{slug}" have a remote tracking ref?
   │   ├── YES → Run: git pull origin feat-{slug}
   │   │         ├── SUCCESS → proceed to step 3
   │   │         └── TRUE FAILURE (network error, auth error, diverged history)
   │   │             ├── Release merge-lock
   │   │             ├── Post Discord notification (see §Pull Failure below)
   │   │             ├── Clean up sub-branch and worktree (FSPEC-AB-01 §4c)
   │   │             └── END
   │   └── NO  → Feature branch has no remote tracking ref yet (first invocation, never pushed)
   │             ├── Skip pull (nothing to pull)
   │             └── Proceed to step 3 using local feature branch HEAD

3. Merge sub-branch into feature branch
   ├── Run: git merge --no-ff {sub-branch-name} (from feature branch worktree)
   ├── SUCCESS → proceed to step 4
   ├── CONTENT CONFLICT → git detects conflicting edits to the same file
   │   ├── Release merge-lock
   │   ├── Retain worktree in MERGE_HEAD state (DO NOT abort)
   │   ├── Post Discord notification (see §Conflict Handling below)
   │   └── END (worktree retained indefinitely)
   └── TECHNICAL FAILURE (non-conflict git error: corrupted object, permission error, etc.)
       ├── Release merge-lock
       ├── Post Discord notification (see §Technical Failure below)
       ├── Clean up sub-branch and worktree (FSPEC-AB-01 §4c)
       └── END

4. Push feature branch to remote
   (handled by FSPEC-FB-01 §push, step 6)
   ├── SUCCESS
   │   ├── Release merge-lock
   │   ├── Clean up sub-branch and worktree (FSPEC-AB-01 §4a)
   │   └── END (happy path complete)
   └── FAILURE (push rejected)
       ├── Release merge-lock
       ├── Retain worktree with the un-pushed commit (FSPEC-FB-01 §Error Scenarios)
       └── END
```

#### Business Rules

| ID | Rule |
|----|------|
| BR-MG-01 | The merge-lock is per-Ptah-instance and in-memory (`AsyncMutex`). It serializes ALL sub-branch merges to the feature branch within one Ptah instance. If Ptah restarts, the lock resets — in-flight merges do not resume. |
| BR-MG-02 | The merge-lock timeout is 10,000ms. This is a hard limit. There is no retry on timeout. The developer must re-invoke the agent manually if a timeout occurs. |
| BR-MG-03 | A content conflict (git exits non-zero with "CONFLICT" in output) is NOT a technical failure. It is treated differently: the worktree is retained for manual resolution rather than cleaned up. |
| BR-MG-04 | The merge MUST use `--no-ff` (no fast-forward). A merge commit must always be created so the sub-branch's origin is traceable in `git log`. |
| BR-MG-05 | The merge-lock MUST be released before any Discord notification is posted and before any cleanup steps. Holding the lock while posting to Discord (I/O operation) would unnecessarily block other agents. |
| BR-MG-06 | The pre-merge pull is SKIPPED (not failed) when the feature branch has no remote tracking ref. This is the expected state on the very first invocation for a new feature. |

#### Input / Output

| Direction | Information |
|-----------|-------------|
| **Input** | Agent's sub-branch name, feature branch name, worktree path containing agent's commits |
| **Output** | Feature branch advanced by a merge commit; `origin/feat-{slug}` updated; sub-branch and worktree cleaned up (except conflict and push-failure cases) |

#### Discord Notification Content

**Lock Timeout notification:**
```
⚠️ Merge timeout for feature `{feature-name}`
Sub-branch `{sub-branch-name}` could not acquire the merge-lock within 10,000ms.
The agent's work was not merged. Please re-invoke the agent.
```

**Pre-merge Pull Failure notification:**
```
⚠️ Pre-merge pull failed for feature branch `feat-{slug}`
Could not pull latest from remote before merging sub-branch `{sub-branch-name}`.
Error: `{git-error-message}`
The agent's work was not merged. Resolve the remote issue and re-invoke the agent.
```

**Content Conflict notification:**
```
⚠️ Merge conflict on feature branch `feat-{slug}`
Sub-branch: `{sub-branch-name}`
Conflicting files:
  - {file-path-1}
  - {file-path-2}
The worktree is retained at: `{worktree-path}`

To resolve:
  cd {worktree-path}
  # Edit conflicting files to resolve conflicts
  git add {conflicting-files}
  git merge --continue

To discard the agent's changes:
  cd {worktree-path}
  git merge --abort
```

**Technical Failure notification:**
```
⚠️ Merge failed for sub-branch `{sub-branch-name}` on feature `feat-{slug}`
This is a technical git error (not a content conflict).
Error: `{git-error-message}`
The agent's work was not merged. The worktree has been cleaned up.
Please investigate and re-invoke the agent if needed.
```

#### Edge Cases

| Case | Behavior |
|------|----------|
| Feature branch advanced between the pre-merge pull (step 2) and the merge (step 3) due to a concurrent Ptah push | This is prevented by the merge-lock serializing all merges. Only one merge executes at a time, so the feature branch cannot advance between steps 2 and 3 within a single Ptah instance. Across multiple Ptah instances, the post-merge push (step 4) will fail with a rejected push, handled per FSPEC-FB-01 §Error Scenarios. |
| Agent sub-branch has zero commits (agent completed without making changes) | A `git merge --no-ff` of a branch at feature-branch HEAD creates an empty merge commit. This is technically valid but signals a no-op agent invocation. The merge proceeds normally; cleanup follows the success path. |
| Merge-lock held when Ptah restarts | Lock resets on restart. Any waiting agents receive a timeout error or are never notified (depending on timing). The worktrees from those agents persist on disk until manual cleanup. Developers should check `git worktree list` after unexpected Ptah restarts. |

#### Acceptance Tests

**AT-MG-01: Serial merge of two concurrent agents**
```
WHO:   As the orchestrator
GIVEN: Agent A and Agent B both complete work at approximately the same time
       AND both attempt to merge their sub-branches to "feat-parallel-feature-development"
WHEN:  Both merge sequences run
THEN:  One merge executes first, the second waits for the lock
       AND both merges succeed sequentially
       AND "git log --oneline feat-parallel-feature-development" shows both agents' merge commits
       AND neither commit is missing or overwritten
```

**AT-MG-02: Lock timeout**
```
WHO:   As the orchestrator
GIVEN: Agent A holds the merge-lock
       AND Agent B has been waiting for the lock for more than 10,000ms
WHEN:  Agent B's lock acquisition times out
THEN:  A Discord message is posted with Agent B's sub-branch name and the timeout reason
       AND Agent B's worktree and sub-branch are cleaned up
       AND "git log --oneline feat-parallel-feature-development" does NOT show a partial commit from Agent B
```

**AT-MG-03: Content conflict — worktree retained**
```
WHO:   As a developer
GIVEN: Agent A's merge succeeded (modified "src/services/git.ts")
       AND Agent B's sub-branch also modifies "src/services/git.ts" differently
WHEN:  Agent B's merge is attempted
THEN:  The merge exits with CONFLICT status
       AND Agent B's worktree remains at its path with MERGE_HEAD present
       AND a Discord message is posted with the conflicting file path, worktree path, and resolution commands
       AND "git log --oneline feat-parallel-feature-development" does NOT show Agent B's changes (merge not completed)
```

**AT-MG-04: Pre-merge pull skipped for new branch**
```
WHO:   As the orchestrator
GIVEN: "feat-parallel-feature-development" was just created locally
       AND has never been pushed to remote
WHEN:  The pre-merge pull step executes
THEN:  No git pull command is attempted (no remote tracking ref)
       AND the merge proceeds using the local feature branch HEAD
       AND no error is reported
```

**AT-MG-05: Pre-merge pull success**
```
WHO:   As the orchestrator
GIVEN: "origin/feat-parallel-feature-development" has 2 commits not present locally
       (e.g., pushed by another Ptah instance)
WHEN:  The pre-merge pull step executes
THEN:  Local "feat-parallel-feature-development" is updated with the 2 remote commits
       AND the agent's sub-branch is then merged against the updated feature branch HEAD
```

---

### FSPEC-SK-01: Skill Git Workflow Alignment

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-SK-01 |
| **Title** | Skill Git Workflow Alignment |
| **Linked requirements** | [REQ-SK-01], [REQ-SK-02] |
| **Status** | Draft |

#### Description

The SKILL.md files for all four agent types (PM, BE, FE, QA) currently contain instructions for agents to manage their own git branches. These instructions are incompatible with the orchestrator-managed worktree model and must be replaced. The updated SKILL.md files must clearly inform agents of their worktree context and explicitly prohibit independent branch management.

#### Behavioral Flow

```
SKILL.md update for each agent (PM, BE, FE, QA):

1. Remove from Git Workflow section:
   - "git checkout -b feat-{feature-name}" (or equivalent)
   - "git checkout feat-{feature-name}" (or equivalent)
   - "git push origin feat-{feature-name}" (or equivalent)
   - Any instruction to create, switch, or push feature branches

2. Add to Git Workflow section:
   - Explicit statement: branch management (worktree creation, sub-branch creation,
     push to remote) is handled by the orchestrator and MUST NOT be performed by the agent
   - Explicit statement: the agent is running in an isolated git worktree;
     the working directory IS the worktree root
   - Explicit statement: all file operations use paths relative to the worktree root
   - Explicit statement: the agent MUST NOT navigate to or modify the main repository checkout

3. What agents STILL do (unchanged):
   - git add {files}
   - git commit -m "{message}"
   (Agents still stage and commit their own changes within their worktree)
```

#### Business Rules

| ID | Rule |
|----|------|
| BR-SK-01 | All four SKILL.md files (PM, BE, FE, QA) must be updated. Partial updates (e.g., only BE) create inconsistency and behavioral risk. |
| BR-SK-02 | The prohibition on branch management must be explicit, not implicit. The SKILL.md must contain an affirmative statement that branch management is the orchestrator's responsibility. |
| BR-SK-03 | Agents retain the ability to `git add` and `git commit` within their worktree. Only branch-level operations (`checkout -b`, `push`, `pull`) are prohibited. |

#### Input / Output

| Direction | Information |
|-----------|-------------|
| **Input** | Existing SKILL.md files for PM, BE, FE, QA |
| **Output** | Updated SKILL.md files with git checkout/push instructions removed and worktree context instructions added |

#### Edge Cases

| Case | Behavior |
|------|----------|
| An agent skill file has no explicit Git Workflow section | A new "## Working Directory and Git" section is added with the required content. |
| Git workflow instructions are embedded in broader sections rather than an isolated Git Workflow section | Each instruction must be located and removed individually. The new worktree context instructions are added in a clearly marked section. |

#### Acceptance Tests

**AT-SK-01: No checkout or push instructions remain**
```
WHO:   As a skill author reviewing the updated SKILL.md
GIVEN: All four SKILL.md files have been updated
WHEN:  I search for "git checkout", "git branch", and "git push" in the Git Workflow sections
THEN:  No results are found in those sections for these commands
       AND the file explicitly states: "Branch management is handled by the orchestrator"
```

**AT-SK-02: Worktree context is communicated**
```
WHO:   As a skill agent reading SKILL.md
GIVEN: The SKILL.md has been updated
WHEN:  I read the Git Workflow section
THEN:  I find an explicit statement that I am running in an isolated worktree
       AND I find an explicit statement that my working directory is the worktree root
       AND I find an explicit statement that I must not navigate to the main repository checkout
```

---

## 3. Traceability: Requirements → FSPECs

| Requirement | FSPEC |
|-------------|-------|
| REQ-FB-01 | FSPEC-FB-01 |
| REQ-FB-02 | FSPEC-FB-01 |
| REQ-FB-03 | FSPEC-FB-01 |
| REQ-FB-04 | FSPEC-FB-01 |
| REQ-AB-01 | FSPEC-AB-01 |
| REQ-AB-02 | FSPEC-AB-01 |
| REQ-AB-03 | FSPEC-AB-01 |
| REQ-AB-04 | FSPEC-AB-01 |
| REQ-MG-01 | FSPEC-MG-01 |
| REQ-MG-02 | FSPEC-MG-01 |
| REQ-MG-03 | FSPEC-MG-01 |
| REQ-MG-04 | FSPEC-MG-01 |
| REQ-SK-01 | FSPEC-SK-01 |
| REQ-SK-02 | FSPEC-SK-01 |
| REQ-PF-NF-01 | No FSPEC (non-functional — performance measurement, not behavioral logic) |
| REQ-PF-NF-02 | No FSPEC (non-functional — disk usage constraint, not behavioral logic) |
| REQ-PF-NF-03 | No FSPEC (non-functional — compatibility requirement, not behavioral logic) |

---

## 4. Open Questions

| ID | Question | Impact | Raised By |
|----|----------|--------|-----------|
| OQ-FSPEC-01 | Should the Discord conflict notification use a different visual format (e.g., code block for the resolution commands, or an embedded checklist) to reduce developer error during manual resolution? | Low — purely presentational | PM |
| OQ-FSPEC-02 | Should the merge-lock timeout (10,000ms) be developer-configurable (e.g., via `ptah.config.ts`)? The REQ scopes configuration as out-of-scope for Phase 10, but the timeout value is a behavioral constant that may need adjustment under high-parallelism workloads. | Low — deferred to future phase per REQ scope | PM |

---

## 5. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Product Manager | Initial FSPEC for Phase 10. Four FSPECs: FSPEC-FB-01 (feature branch lifecycle), FSPEC-AB-01 (agent sub-branch lifecycle), FSPEC-MG-01 (merge orchestration), FSPEC-SK-01 (skill git workflow alignment). All 14 functional requirements covered. |
