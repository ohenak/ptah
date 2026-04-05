# Functional Specification

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-FLF |
| **Parent Document** | [REQ-FLF](016-REQ-feature-lifecycle-folders.md) |
| **Version** | 1.1 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Overview

This document specifies behavioral flows for the Feature Lifecycle Folders feature. It covers four areas with branching logic, multi-step flows, or business rules that engineers should not decide alone:

1. **FSPEC-PR-01** — Lifecycle Promotion Flows (backlog→in-progress, in-progress→completed, including NNN assignment and internal reference updates)
2. **FSPEC-SK-01** — Feature Resolver Service (search algorithm, worktree-relative operation, state storage)
3. **FSPEC-WT-01** — Worktree Lifecycle Management (creation, use, cleanup, crash recovery)
4. **FSPEC-MG-01** — One-Time Migration Script (migration steps and ordering)

### Direct-to-TSPEC Requirements

The following requirements are fully defined in the REQ and do not require a separate FSPEC:

| Requirement | Reason |
|-------------|--------|
| REQ-FS-01..04 | Folder structure definition — no branching logic |
| REQ-SK-01 | PM skill creates feature in `docs/backlog/` — simple path substitution |
| REQ-SK-05 | Update SKILL.md File Organization sections — documentation change |
| REQ-NF-01 | Use `git mv` — implementation constraint |
| REQ-NF-03 | Old-path fallback — simple existence check |

### FSPEC Coverage

| FSPEC ID | Title | Linked Requirements |
|----------|-------|---------------------|
| FSPEC-PR-01 | Lifecycle Promotion Flows | REQ-PR-01, REQ-PR-02, REQ-PR-03, REQ-PR-04, REQ-PR-05, REQ-SK-03, REQ-SK-04, REQ-SK-08, REQ-NF-02 |
| FSPEC-SK-01 | Feature Resolver Service | REQ-SK-02, REQ-SK-06, REQ-SK-07, REQ-WT-03, REQ-WT-04 |
| FSPEC-WT-01 | Worktree Lifecycle Management | REQ-WT-01, REQ-WT-02, REQ-WT-05 |
| FSPEC-MG-01 | One-Time Migration Script | REQ-MG-01, REQ-MG-02, REQ-MG-03, REQ-MG-04 |

---

## FSPEC-PR-01: Lifecycle Promotion Flows

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-PR-01 |
| **Title** | Lifecycle Promotion Flows |
| **Linked Requirements** | [REQ-PR-01], [REQ-PR-02], [REQ-PR-03], [REQ-PR-04], [REQ-PR-05], [REQ-SK-03], [REQ-SK-04], [REQ-SK-08], [REQ-NF-02] |
| **Dependencies** | [FSPEC-SK-01] (resolver used to verify post-promotion state) |

### Description

Specifies the complete flow for both lifecycle promotion events:

1. **Backlog→In-Progress:** Triggered during the orchestrator's pre-invocation setup for an engineer or tech-lead skill. The orchestrator resolves the feature path and detects the backlog condition before invoking the skill. If the feature is in `docs/backlog/`, the orchestrator runs the promotion activity and then invokes the skill with the updated path. The skill is never aware of the promotion — it receives an already-promoted path from workflow state.
2. **In-Progress→Completed:** Triggered when the orchestrator detects that both the test-engineer and product-manager have emitted sign-off routing signals within the same workflow execution. The orchestrator runs the completion promotion activity, which assigns a NNN prefix, moves the folder, and renames files.

### Behavioral Flow — Backlog→In-Progress Promotion

**Actor: Orchestrator — pre-invocation setup**

1. **Orchestrator prepares to invoke an engineer or tech-lead skill.** As part of pre-invocation setup, the orchestrator calls the feature resolver service with the feature slug and worktree root (see [FSPEC-SK-01]).
2. **Resolver returns the feature path.** The orchestrator inspects the path prefix:
   - If path is under `docs/in-progress/` → no promotion needed. Store path in workflow state and proceed to invoke the skill.
   - If path is under `docs/backlog/` → promotion is needed. Proceed to step 3.
   - If path is under `docs/completed/` → unexpected state. Log a warning and proceed to invoke the skill (the feature should not be in completed if a review is just beginning).
3. **Orchestrator runs the Backlog→In-Progress Promotion Activity** (steps 4–9 below) before invoking the skill.

**Actor: Orchestrator — Backlog→In-Progress Promotion Activity**

4. **Idempotency check:** Verify the source folder `docs/backlog/{feature-slug}/` exists.
   - If it does NOT exist → check whether `docs/in-progress/{feature-slug}/` already exists.
     - If yes → log `[ptah] Idempotent skip: {feature-slug} already in in-progress.` Return success.
     - If no → log an error: `Feature {feature-slug} not found in backlog or in-progress.` Return error.
   - If it DOES exist → continue to step 5.
5. **Run `git mv docs/backlog/{feature-slug}/ docs/in-progress/{feature-slug}/`** within the promotion worktree.
6. **Commit the move:** `git commit -m "chore(lifecycle): promote {feature-slug} backlog → in-progress"`.
7. **Push to the feature branch.**
8. **Update workflow state:** Set `featurePath` to `docs/in-progress/{feature-slug}/` in workflow state.
9. **Return success.** The orchestrator now invokes the skill using the updated path. The skill receives the promoted path from workflow state and is unaware that a promotion occurred.

### Behavioral Flow — In-Progress→Completed Promotion

**Actor: Orchestrator — sign-off detection**

1. **Orchestrator monitors routing signals** within the current workflow run.
2. When a `LGTM` signal is received from a skill, record which skill sent it.
3. **Detect final sign-off condition:** Both `test-engineer` and `product-manager` have emitted `LGTM` signals in the current workflow run.
4. Orchestrator runs the **In-Progress→Completed Promotion Activity.**

**Actor: Orchestrator — In-Progress→Completed Promotion Activity**

5. **Phase 1 — NNN assignment and folder move (with idempotency check):**
   a. Check whether `docs/completed/` already contains a folder matching `{NNN}-{feature-slug}` for any NNN value.
   b. If such a folder EXISTS → this promotion was partially completed before. Record the existing NNN. **Skip to Phase 2.**
   c. If no such folder exists → calculate NNN: scan all folders in `docs/completed/` matching `^[0-9]{3}-`. Extract the leading 3-digit integer from each, take the maximum, and add 1. If no such folders exist, NNN = `001`. Zero-pad to 3 digits.
   d. Run `git mv docs/in-progress/{feature-slug}/ docs/completed/{NNN}-{feature-slug}/`.
   e. Commit: `git commit -m "chore(lifecycle): promote {feature-slug} in-progress → completed ({NNN})"`.
6. **Phase 2 — File rename (with per-file idempotency):**
   a. List all files directly in `docs/completed/{NNN}-{feature-slug}/`.
   b. For each file where the filename does NOT already start with `{NNN}-`:
      - Run `git mv docs/completed/{NNN}-{feature-slug}/{filename} docs/completed/{NNN}-{feature-slug}/{NNN}-{filename}`.
   c. Files already prefixed with `{NNN}-` are skipped (idempotency — a retry after partial failure resumes here).
   d. Commit all renames: `git commit -m "chore(lifecycle): rename docs in {NNN}-{feature-slug} with NNN prefix"`.
7. **Phase 3 — Internal reference update:**
   a. Scan each renamed document in `docs/completed/{NNN}-{feature-slug}/` for markdown link patterns that reference same-folder files that were renamed (see Business Rules for scope).
   b. For each match: update the target filename in the link to its NNN-prefixed version.
   c. If any files were modified: `git commit -m "chore(lifecycle): update internal refs in {NNN}-{feature-slug}"`.
8. **Push to the feature branch.**
9. **Update workflow state:** Set `featurePath` to `docs/completed/{NNN}-{feature-slug}/` in workflow state.
10. **Return success.**

### Business Rules

- **BR-01:** Both detection and execution of promotions are performed by the orchestrator, never by Claude skill agents. For backlog→in-progress, the orchestrator detects the backlog condition during pre-invocation setup and promotes before invoking the skill. For in-progress→completed, the orchestrator detects both sign-off signals and runs the completion activity. Skills are never aware of promotions — they receive already-resolved paths from workflow state.
- **BR-02:** Both promotions use `git mv` for all file system operations to preserve `git log --follow` history.
- **BR-03:** Backlog→In-Progress promotion does NOT rename files or assign a NNN prefix. Folder and file names are unchanged.
- **BR-04:** NNN assignment is global across `docs/completed/` — it is based on the maximum existing NNN, not a count. Gaps in the sequence are acceptable; re-use of an existing NNN is not.
- **BR-05:** The two-phase idempotency design (Phase 1 check, Phase 2 per-file check) ensures that a promotion activity retried after a crash resumes from where it left off without re-assigning NNN or re-moving an already-moved folder.
- **BR-06:** Internal reference update scope is limited to markdown link patterns `[text](filename.md)` and `[text](./filename.md)` where the target is a file in the same feature folder that was renamed in Phase 2. Cross-feature links and bare prose mentions are out of scope.
- **BR-07:** The sign-off detection for In-Progress→Completed requires both `test-engineer` AND `product-manager` to have emitted `LGTM` signals. A single sign-off is not sufficient. The detection is scoped to a single Temporal workflow execution, identified by the `(workflowId, runId)` pair. If a workflow uses `continue-as-new` (producing a new `runId`), sign-off state accumulated in the prior run is NOT automatically carried forward — the workflow must explicitly pass sign-off state in the `continue-as-new` payload if it needs to survive a run boundary. Sign-offs from unrelated workflow executions are never counted.

### Input / Output

**Backlog→In-Progress Promotion**

| | Detail |
|-|--------|
| Input | Feature slug, current workflow state |
| Output | Updated workflow state (`featurePath` = `docs/in-progress/{slug}/`), git commit on feature branch |

**In-Progress→Completed Promotion**

| | Detail |
|-|--------|
| Input | Feature slug, current workflow state, `docs/completed/` listing |
| Output | Updated workflow state (`featurePath` = `docs/completed/{NNN}-{slug}/`), 2–3 git commits on feature branch, renamed files with NNN prefix |

### Edge Cases

- **Feature already in target folder (retry after crash):** Both promotion activities detect the target folder already exists and skip the move step. For completion, Phase 2 re-checks each file individually to resume file renames.
- **Two features promoted to completed concurrently:** The NNN assignment reads `docs/completed/` at the start of the promotion activity. If two promotions run concurrently in separate worktrees, the second one to commit and push will get a conflict on the `docs/completed/` folder listing. The NNN calculation must be performed within a transaction boundary (e.g., while holding a file-based lock, or by using Temporal's serial activity scheduling for completion promotions). This is the same concern as [R-04] — sequential completion within a single orchestrator process is the first mitigation.
- **Feature in `backlog/` when engineer starts a non-review task (e.g., TSPEC creation):** The backlog→in-progress promotion is triggered during the orchestrator's pre-invocation setup for any engineer or tech-lead skill task. If the feature is in backlog, the orchestrator promotes it before invoking the skill, regardless of the specific task type (review, TSPEC, PLAN, etc.).
- **NNN gap in `completed/`:** If `docs/completed/` contains `001-init` and `003-something` (no `002-*`), the next NNN will be `004`. Gaps are preserved — the algorithm does not fill gaps.
- **No files to rename in Phase 2:** If all files in the folder already have the NNN prefix (e.g., a retry where Phase 1 succeeded but Phase 2 was interrupted before any files were renamed, then the crash recovery on restart finds no un-prefixed files), Phase 2 is a no-op. No commit is made.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `git mv` fails (source path does not exist) | Activity throws a non-retryable error. Workflow enters a failed state and notifies the user. The user must investigate before retrying. |
| `git mv` fails due to target already existing (non-idempotent case) | This should not occur if the idempotency check runs first. If it does, throw a non-retryable error. |
| Git push fails (e.g., remote conflict) | Activity throws a retryable error. Temporal retry policy applies. The two-phase idempotency check ensures the retry is safe. |
| `docs/completed/` cannot be read (filesystem error) | Throw a non-retryable error. Workflow enters a failed state. |
| Internal reference update produces a parse error | Log a warning and skip the affected file. Do not fail the promotion for a reference-update parse failure — the structural promotion is more important than the reference cleanup. |

### Acceptance Tests

**AT-PR-01:** Backlog→In-Progress — normal flow (orchestrator-first).
```
WHO:   As the Ptah orchestrator
GIVEN: A feature exists at docs/backlog/my-feature/
       with files REQ-my-feature.md and overview.md
WHEN:  The orchestrator resolves the feature path during pre-invocation setup
       for an engineer skill and detects it is in docs/backlog/
THEN:  The orchestrator runs the promotion activity before invoking the skill
       The folder is moved to docs/in-progress/my-feature/
       File names are unchanged (REQ-my-feature.md, overview.md)
       git log --follow on REQ-my-feature.md shows history from before the move
       Workflow state featurePath = docs/in-progress/my-feature/
       The engineer skill receives the promoted path and is unaware of the promotion
```

**AT-PR-02:** Backlog→In-Progress — idempotent on retry.
```
WHO:   As the Ptah orchestrator
GIVEN: The promotion activity previously ran and moved the folder to
       docs/in-progress/my-feature/
       but the workflow crashed before updating state
WHEN:  The promotion activity runs again for slug my-feature
THEN:  The activity logs "Idempotent skip" and returns success
       No git mv is run a second time
       Workflow state featurePath = docs/in-progress/my-feature/
```

**AT-PR-03:** In-Progress→Completed — normal flow with NNN assignment.
```
WHO:   As the Ptah orchestrator
GIVEN: A feature exists at docs/in-progress/my-feature/
       with files REQ-my-feature.md, FSPEC-my-feature.md, TSPEC-my-feature.md
       docs/completed/ currently contains 002-some-other-feature/
WHEN:  Both test-engineer and product-manager LGTM signals are received
THEN:  The folder is moved to docs/completed/003-my-feature/
       Files are renamed to 003-REQ-my-feature.md, 003-FSPEC-my-feature.md, 003-TSPEC-my-feature.md
       Any markdown links within those files that reference the old filenames are updated
       git log --follow on any renamed file shows history from before the move and rename
       Workflow state featurePath = docs/completed/003-my-feature/
```

**AT-PR-04:** In-Progress→Completed — Phase 1 succeeded, Phase 2 partial (crash recovery).
```
WHO:   As the Ptah orchestrator
GIVEN: A crash occurred after the folder was moved to docs/completed/003-my-feature/
       but only REQ-my-feature.md was renamed to 003-REQ-my-feature.md
       FSPEC-my-feature.md and TSPEC-my-feature.md are still unrenamed
WHEN:  The promotion activity retries
THEN:  Phase 1 detects 003-my-feature already exists, skips the folder move and NNN re-assignment
       Phase 2 skips 003-REQ-my-feature.md (already prefixed) and renames only the remaining two files
       Final state: all three files have the 003- prefix
```

**AT-PR-05:** Internal reference update.
```
WHO:   As a developer
GIVEN: docs/completed/003-my-feature/003-TSPEC-my-feature.md contains
       the link [Requirements](REQ-my-feature.md)
WHEN:  The completion promotion runs Phase 3
THEN:  The link is updated to [Requirements](003-REQ-my-feature.md)
       A cross-feature link like [Other](../002-other/002-REQ-other.md)
       is left unchanged
```

**AT-PR-06:** Sign-off detection — both required.
```
WHO:   As the Ptah orchestrator
GIVEN: The current workflow run has received a LGTM from test-engineer
       but NOT yet from product-manager
WHEN:  No additional sign-off arrives
THEN:  The completion promotion activity is NOT triggered
       The workflow waits for the second sign-off
```

---

## FSPEC-SK-01: Feature Resolver Service

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-SK-01 |
| **Title** | Feature Resolver Service |
| **Linked Requirements** | [REQ-SK-02], [REQ-SK-06], [REQ-SK-07], [REQ-WT-03], [REQ-WT-04] |
| **Dependencies** | [FSPEC-WT-01] (worktree root is the search root) |

### Description

Specifies the behavior of the single feature resolver service that all orchestrator activities and skills must use to locate a feature folder. The resolver accepts a feature slug and a worktree root path and returns the full resolved path to the feature folder, or a not-found signal if the slug is not found in any lifecycle folder.

### Behavioral Flow

1. **Caller provides:** feature slug (string), worktree root path (absolute path to the worktree or main working tree root).
2. **Resolver constructs the search root:** `{worktreeRoot}/docs/`.
3. **Search in order — stop at first match:**
   a. Check `{searchRoot}/in-progress/{slug}/` — does this directory exist?
      - Yes → return `docs/in-progress/{slug}/` (path relative to worktree root).
   b. Check `{searchRoot}/backlog/{slug}/` — does this directory exist?
      - Yes → return `docs/backlog/{slug}/`.
   c. Scan `{searchRoot}/completed/` for a directory whose name matches `^[0-9]{3}-{slug}$`.
      - If found → return `docs/completed/{matched-folder-name}/`.
4. **If no match found in all three lifecycle folders:**
   - Return a not-found signal: `{ found: false, slug }`. Do NOT throw an error.
5. **If the slug is found in more than one lifecycle folder simultaneously (invariant violation):**
   - Log: `[ptah:resolver] WARNING: slug {slug} found in multiple lifecycle folders: {list}. Returning first match per search order.`
   - Return the first match according to the search order in step 3 (in-progress > backlog > completed).

### Business Rules

- **BR-01:** The resolver must never construct or hard-code lifecycle paths independently. The entire resolution logic is contained in this single service.
- **BR-02:** The `completed/` search strips the NNN prefix for comparison: a slug of `temporal-foundation` matches folder `015-temporal-foundation`. The NNN is NOT part of the slug.
- **BR-03:** The search order (in-progress → backlog → completed) reflects operational priority: a feature being worked on is found faster than a completed one.
- **BR-04:** The resolver always operates relative to the provided worktree root. It never falls back to the main working tree root, even if the worktree root path is unexpected.
- **BR-05:** A not-found result is a normal return value, not an exception. Callers are responsible for handling not-found results (e.g., the PM skill's Phase 0 uses not-found to decide whether to create a new feature folder).
- **BR-06:** The resolved path is relative to the worktree root (e.g., `docs/in-progress/my-feature/`), not an absolute path. Callers combine it with the worktree root to form absolute paths: `path.join(worktreeRoot, resolvedPath)`.

### State Storage

After the resolver returns a result, the orchestrator stores both values in workflow state:

```
state.worktreeRoot   = "/tmp/ptah-wt-{uuid}/"    (absolute path to worktree)
state.featurePath    = "docs/in-progress/my-feature/"  (relative, resolver result)
```

Activities derive the absolute artifact path as:

```
absolutePath = path.join(state.worktreeRoot, state.featurePath, filename)
```

When a promotion changes the feature's lifecycle folder, only `state.featurePath` is updated. `state.worktreeRoot` remains stable for the duration of the workflow run (a new run gets a new worktree).

### Input / Output

| | Detail |
|-|--------|
| Input | `featureSlug: string`, `worktreeRoot: string` (absolute path) |
| Output | `{ found: true, path: string }` — path relative to worktree root, or `{ found: false, slug: string }` |

### Edge Cases

- **Slug with hyphens:** Slugs such as `feature-lifecycle-folders` are valid. The `completed/` search uses a suffix-match on the folder name after stripping the `{NNN}-` prefix: folder `019-feature-lifecycle-folders` matches slug `feature-lifecycle-folders`.
- **Empty `completed/` folder:** If `docs/completed/` exists but contains no subfolders, the completed search produces no match. This is normal.
- **`completed/` folder does not exist:** If the directory itself does not exist (e.g., freshly initialized repo before migration), the resolver treats it as empty and continues to the not-found result.
- **Worktree root has trailing slash:** Callers may pass paths with or without a trailing slash. The resolver normalizes the input by stripping any trailing slash before constructing search paths.
- **Non-slug directory names in lifecycle folders:** If `docs/in-progress/` contains a folder that is not a valid feature slug (e.g., a `.DS_Store` or miscellaneous file), the resolver ignores it — it only checks for an exact match to the provided slug.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `worktreeRoot` does not exist on disk | Resolver returns `{ found: false }`. Does not throw. Caller receives not-found and handles accordingly. |
| `docs/` directory does not exist under worktree root | Resolver returns `{ found: false }`. Does not throw. |
| Filesystem error reading a lifecycle folder (e.g., permission denied) | Resolver logs a warning and treats that lifecycle folder as empty. Search continues to the next lifecycle folder. |

### Acceptance Tests

**AT-SK-01:** Feature found in `in-progress/`.
```
WHO:   As any orchestrator activity
GIVEN: worktreeRoot = /tmp/ptah-wt-abc/
       /tmp/ptah-wt-abc/docs/in-progress/agent-coordination/ exists
WHEN:  resolver({ slug: "agent-coordination", worktreeRoot: "/tmp/ptah-wt-abc/" })
THEN:  Returns { found: true, path: "docs/in-progress/agent-coordination/" }
```

**AT-SK-02:** Feature found in `completed/` by slug matching.
```
WHO:   As any orchestrator activity
GIVEN: worktreeRoot = /tmp/ptah-wt-abc/
       /tmp/ptah-wt-abc/docs/completed/015-temporal-foundation/ exists
       (no in-progress or backlog match)
WHEN:  resolver({ slug: "temporal-foundation", worktreeRoot: "/tmp/ptah-wt-abc/" })
THEN:  Returns { found: true, path: "docs/completed/015-temporal-foundation/" }
```

**AT-SK-03:** Feature not found returns not-found signal (no throw).
```
WHO:   As any orchestrator activity
GIVEN: The slug "unknown-feature" is not in any lifecycle folder
WHEN:  resolver({ slug: "unknown-feature", worktreeRoot: "/tmp/ptah-wt-abc/" })
THEN:  Returns { found: false, slug: "unknown-feature" }
       No exception is thrown
```

**AT-SK-04:** Slug found in multiple folders — warning + first match returned.
```
WHO:   As any orchestrator activity
GIVEN: docs/in-progress/my-feature/ AND docs/backlog/my-feature/ both exist
       (invariant violation)
WHEN:  resolver({ slug: "my-feature", worktreeRoot: "/tmp/ptah-wt-abc/" })
THEN:  A warning is logged listing both folders
       Returns { found: true, path: "docs/in-progress/my-feature/" }
       (in-progress takes priority)
```

**AT-SK-05:** State storage.
```
WHO:   As the Ptah orchestrator workflow
GIVEN: The resolver returns { found: true, path: "docs/in-progress/my-feature/" }
       for worktreeRoot "/tmp/ptah-wt-abc/"
WHEN:  The workflow stores the result
THEN:  state.worktreeRoot = "/tmp/ptah-wt-abc/"
       state.featurePath  = "docs/in-progress/my-feature/"
       An activity computes path.join(state.worktreeRoot, state.featurePath, "REQ-my-feature.md")
       = "/tmp/ptah-wt-abc/docs/in-progress/my-feature/REQ-my-feature.md"
```

---

## FSPEC-WT-01: Worktree Lifecycle Management

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-WT-01 |
| **Title** | Worktree Lifecycle Management |
| **Linked Requirements** | [REQ-WT-01], [REQ-WT-02], [REQ-WT-05] |
| **Dependencies** | None |

### Description

Specifies the lifecycle of git worktrees used by skill invocations and promotion activities: creation before the skill or activity runs, cleanup after it completes (success or failure), and crash-recovery cleanup on orchestrator startup.

### Behavioral Flow — Skill Invocation Worktree

**Creation (before skill runs):**

1. The orchestrator generates a unique worktree path: `/tmp/ptah-wt-{uuid}/` (UUID generated fresh per invocation).
2. Register the worktree in the in-memory registry: `{ worktreePath, workflowId, runId, activityId, createdAt }`.
3. Run: `git worktree add /tmp/ptah-wt-{uuid}/ {featureBranch}`.
4. Store `worktreeRoot = /tmp/ptah-wt-{uuid}/` in workflow state.
5. Invoke the skill with its working directory set to the worktree root.

**Cleanup (after skill completes or fails):**

6. On skill completion (success or failure), run: `git worktree remove --force /tmp/ptah-wt-{uuid}/`.
7. Remove the entry from the in-memory registry.
8. This cleanup runs in a `finally` block — it executes regardless of whether the skill succeeded or failed.

### Behavioral Flow — Promotion Activity Worktree

Promotion activities (both backlog→in-progress and in-progress→completed) each require their own isolated worktree:

1. Follow the same creation steps 1–3 above.
2. Execute the promotion activity within this worktree (git mv, commits, push).
3. Clean up the worktree in a `finally` block after the promotion activity completes.
4. Promotion worktrees are short-lived: they exist only for the duration of the promotion activity.

### Behavioral Flow — Crash-Recovery Cleanup (Orchestrator Startup)

On each orchestrator process startup:

1. Run: `git worktree list --porcelain`. Parse the output to enumerate all worktrees currently registered with the local git repository.
2. Exclude the main working tree (the first entry from `git worktree list`, which has no `worktree` field — it is the repo root).
3. For each non-main worktree:
   a. Extract the worktree path from the `worktree` field.
   b. Check whether any **active Temporal workflow execution** (identified by workflow ID + run ID) is associated with this worktree path. Query the Temporal server for active workflow executions that match the stored `workflowId` + `runId` pair.
   c. If an active execution exists → this worktree is legitimately in use. Leave it.
   d. If no active execution is found → this is a dangling worktree from a prior crash. Run: `git worktree remove --force {worktreePath}`. Log: `[ptah:startup] Pruned dangling worktree: {worktreePath}`.
4. After pruning, run `git worktree prune` to clean up any stale administrative files.

### Business Rules

- **BR-01:** One worktree per skill invocation. Multiple concurrent skills on the same feature branch operate in independent worktrees — they never share a worktree.
- **BR-02:** The main working tree is never modified by a skill invocation or promotion activity. All file reads and writes during skill execution occur within the assigned worktree.
- **BR-03:** Worktree paths follow the pattern `/tmp/ptah-wt-{uuid}/` to avoid collisions with other processes on the same machine.
- **BR-04:** The in-memory registry maps worktree paths to `{ workflowId, runId, activityId }`. This registry is rebuilt from Temporal state on restart — the registry itself is not persisted.
- **BR-05:** Crash recovery uses `git worktree list` (the source of truth from git) plus Temporal's active execution query (the source of truth for liveness). The in-memory registry is not used for crash recovery since it does not survive a process crash.
- **BR-06:** Promotion worktrees follow the same lifecycle rules as skill worktrees. A fresh worktree is always created for each promotion activity — reuse of a previous worktree is not permitted.

### Input / Output

**Worktree Creation**

| | Detail |
|-|--------|
| Input | Feature branch name, workflow ID, run ID, activity ID |
| Output | Worktree root path (absolute), registered in in-memory registry |

**Worktree Cleanup**

| | Detail |
|-|--------|
| Input | Worktree root path |
| Output | Worktree removed from filesystem and in-memory registry |

**Crash-Recovery Cleanup**

| | Detail |
|-|--------|
| Input | `git worktree list` output, Temporal active execution query results |
| Output | Dangling worktrees removed; `git worktree prune` run |

### Edge Cases

- **Worktree creation fails (e.g., path already exists due to UUID collision):** The UUID space is large enough that collisions are negligible, but if `git worktree add` fails, the orchestrator should retry with a new UUID once before raising a non-retryable error.
- **Skill is cancelled mid-execution:** The `finally` block in the activity runs regardless. The worktree is removed even if the skill was killed.
- **Temporal server temporarily unreachable during startup cleanup:** If the Temporal query for active executions fails, the startup sweep should log a warning and skip cleanup for that run rather than pruning worktrees that might be legitimate. Aggressive false-positive pruning is worse than leaving a dangling worktree until the next restart.
- **`git worktree remove` fails (worktree has uncommitted changes):** Use `--force` flag to override. Uncommitted changes in a worktree being cleaned up represent work that was not committed before the crash — this work is lost, and the operator should be notified via a startup log message.
- **Many dangling worktrees on startup (e.g., crash loop):** The startup sweep should complete quickly (seconds) regardless of the number of dangling worktrees. Each `git worktree remove --force` is fast for worktrees with no large uncommitted files.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `git worktree add` fails | Throw a non-retryable error. The skill is not invoked. Notify the user. |
| `git worktree remove` fails in `finally` block | Log the error and continue. The worktree path is removed from the in-memory registry. The dangling worktree will be pruned on next startup by the crash-recovery sweep. |
| Startup cleanup query to Temporal fails | Log a warning, skip the cleanup sweep. Retry on next startup. |

### Acceptance Tests

**AT-WT-01:** Normal skill invocation lifecycle.
```
WHO:   As the Ptah orchestrator
GIVEN: A skill is about to be invoked for feature my-feature on branch feat-my-feature
WHEN:  The orchestrator prepares the execution environment
THEN:  A new worktree is created at /tmp/ptah-wt-{uuid}/
       The worktree is checked out on feat-my-feature
       The skill's working directory is set to /tmp/ptah-wt-{uuid}/
       After the skill completes, the worktree is removed from filesystem
       The in-memory registry no longer contains the worktree entry
```

**AT-WT-02:** Two concurrent skills on same feature branch do not conflict.
```
WHO:   As the Ptah orchestrator
GIVEN: Engineer skill and test-engineer skill are dispatched in parallel for the same feature
WHEN:  Both skills execute concurrently
THEN:  Each skill has its own worktree at a different /tmp/ptah-wt-{uuid}/ path
       File writes by one skill do not appear in the other skill's worktree
       Both skills complete and their commits land cleanly on the feature branch
```

**AT-WT-03:** Crash-recovery startup sweep removes dangling worktrees.
```
WHO:   As the Ptah orchestrator process on startup
GIVEN: git worktree list shows two non-main worktrees:
         /tmp/ptah-wt-aaa/ (associated with workflow run X — still active in Temporal)
         /tmp/ptah-wt-bbb/ (associated with workflow run Y — no longer active in Temporal)
WHEN:  The startup crash-recovery sweep runs
THEN:  /tmp/ptah-wt-aaa/ is left intact
       /tmp/ptah-wt-bbb/ is removed with git worktree remove --force
       A log message is emitted: "[ptah:startup] Pruned dangling worktree: /tmp/ptah-wt-bbb/"
       git worktree prune is run after the sweep
```

**AT-WT-04:** Promotion activity uses its own worktree.
```
WHO:   As the Ptah orchestrator
GIVEN: A backlog→in-progress promotion is triggered
WHEN:  The promotion activity runs
THEN:  A new worktree is created specifically for this activity (separate from any active skill worktrees)
       git mv and git commit run within this promotion worktree
       The promotion worktree is deleted after the activity completes
```

---

## FSPEC-MG-01: One-Time Migration Script

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MG-01 |
| **Title** | One-Time Migration Script |
| **Linked Requirements** | [REQ-MG-01], [REQ-MG-02], [REQ-MG-03], [REQ-MG-04] |
| **Dependencies** | None |

### Description

Specifies the behavior of the one-time migration script that reorganizes the existing flat `docs/` directory into the lifecycle folder structure. The script runs once against the `main` branch working tree (not via a worktree). It is not part of the Ptah orchestrator's runtime — it is a standalone script run by a developer.

### Behavioral Flow

1. **Pre-flight checks:**
   a. Verify the current working directory contains a `docs/` directory. If not, print: `Error: docs/ directory not found. Run this script from the repository root.` and exit with code 1.
   b. Verify the git working tree is clean (`git status --short` produces no output). If not, print: `Error: Working tree is not clean. Commit or stash changes before running migration.` and exit with code 1.
   c. Verify all three lifecycle directories do NOT already exist (or are empty if they do). If any of `docs/backlog/`, `docs/in-progress/`, `docs/completed/` contains files, print: `Migration may have already run. Found non-empty lifecycle folder: {path}. Inspect manually before re-running.` and exit with code 1.

2. **Create lifecycle directories:**
   a. `mkdir -p docs/backlog docs/in-progress docs/completed`
   b. Git does not track empty directories. Add `.gitkeep` files: `touch docs/backlog/.gitkeep docs/in-progress/.gitkeep docs/completed/.gitkeep`
   c. Log: `Created lifecycle folders: docs/backlog/, docs/in-progress/, docs/completed/`

3. **Migrate completed features (001 through highest existing NNN):**
   a. Scan `docs/` for folders matching `^[0-9]{3}-`. Sort ascending.
   b. For each matched folder (e.g., `docs/001-init/`):
      - Run `git mv docs/{NNN}-{slug}/ docs/completed/{NNN}-{slug}/`.
      - Log: `Moved docs/{NNN}-{slug}/ → docs/completed/{NNN}-{slug}/`
   c. These folders keep their NNN prefix — they are already numbered.

4. **Migrate in-progress features (features currently under development with REQ documents but no sign-off):**
   a. Scan `docs/` for any remaining feature folders not yet moved (after step 3). These may have NNN prefixes if they were created in the old structure, or no prefix if they were already started under the new structure.
   b. For each in-progress feature folder:
      - If the folder has a NNN prefix (e.g., `docs/019-my-feature/`):
        1. Determine the un-prefixed slug: strip the `^[0-9]{3}-` prefix from the folder name.
        2. `git mv docs/{NNN}-{slug}/ docs/in-progress/{slug}/`.
        3. Rename any document files within the folder that have the `{NNN}-` prefix: `git mv docs/in-progress/{slug}/{NNN}-{filename} docs/in-progress/{slug}/{filename}`.
        4. Log: `Moved docs/{NNN}-{slug}/ → docs/in-progress/{slug}/ (NNN prefix stripped from folder and files)`
      - If the folder has no NNN prefix (e.g., `docs/my-feature/`):
        1. `git mv docs/{slug}/ docs/in-progress/{slug}/`.
        2. Log: `Moved docs/{slug}/ → docs/in-progress/{slug}/`

5. **Leave non-feature directories at `docs/` root:**
   - `docs/requirements/`, `docs/templates/`, `docs/open-questions/`, and any standalone files (e.g., `PTAH_PRD_v4.0.docx`, `FEASIBILITY*.md`) remain where they are. Do NOT move them.
   - Log: `Skipped non-feature directories: requirements/, templates/, open-questions/ (left at docs/ root)`

6. **Commit the migration:**
   - `git add -A docs/`
   - `git commit -m "chore(migration): reorganize docs/ into lifecycle folders (backlog/in-progress/completed)"`
   - Log: `Migration complete. Committed all changes.`

7. **Post-migration verification (dry-run output):**
   Print a summary:
   ```
   Migration summary:
     Completed features moved : N  (docs/completed/)
     In-progress features moved: M  (docs/in-progress/)
     Non-feature dirs left at root: requirements/, templates/, open-questions/
   Review the result with: git show --stat HEAD
   ```

### Business Rules

- **BR-01:** The migration script runs exclusively in the main working tree, not in a worktree. It is a developer-run script, not an orchestrator activity.
- **BR-02:** The determination of which features are "completed" versus "in-progress" uses a simple heuristic: numbered folders (matching `^[0-9]{3}-`) are classified as completed; all remaining feature folders are classified as in-progress. If the heuristic misclassifies a feature, the developer must correct it manually after the script completes by running `git mv` to move the folder to the correct lifecycle directory. The script does not provide a built-in override mechanism.
- **BR-03:** Existing NNN prefixes on completed features are preserved — they keep their original numbers. The script does not renumber completed features.
- **BR-04:** In-progress features have their NNN prefix stripped from both the folder name and document filenames. This ensures they conform to the "unnumbered in-progress" convention from the moment of migration.
- **BR-05:** The migration is not idempotent by default (the pre-flight check in step 1c prevents re-running on a non-empty lifecycle folder). A developer who needs to re-run must manually inspect the state first.
- **BR-06:** The `.gitkeep` files in empty lifecycle folders ensure the directories are tracked by git. They should not be removed.

### Input / Output

| | Detail |
|-|--------|
| Input | Git repository root (current working directory), `docs/` directory listing |
| Output | Reorganized `docs/` directory with three lifecycle subfolders; one git commit on the current branch |

### Edge Cases

- **Feature folder that is neither clearly completed nor in-progress:** The default heuristic (numbered = completed) may misclassify a numbered feature that was started but never finished. The developer should review the migration output and manually move misclassified folders before committing.
- **`docs/backlog/` is empty after migration:** This is expected — at the time of migration, all known features are either completed or in-progress. New features will be created in `backlog/` by the PM skill going forward.
- **A feature folder contains subdirectories:** The `git mv` of the entire folder handles subdirectories recursively. The file-rename step (step 4b for in-progress features with NNN prefix) only renames direct children matching the NNN prefix pattern, not files in subdirectories.
- **File rename produces a conflict with an existing file:** If `docs/in-progress/{slug}/{filename}` already exists after stripping the NNN prefix (e.g., two files that differ only in prefix), the script must stop and print: `Conflict: file {filename} already exists after NNN-prefix removal. Manual intervention required.`

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Pre-flight: working tree not clean | Print error and exit code 1. No changes made. |
| Pre-flight: lifecycle folder already non-empty | Print warning and exit code 1. No changes made. |
| `git mv` fails for any folder | Print error with details and exit code 1. Migration is left in a partial state — the developer must inspect `git status` and either complete or revert manually. |
| File-rename conflict (two files with same post-strip name) | Print conflict details and exit code 1. Manual intervention required before re-running. |

### Acceptance Tests

**AT-MG-01:** Normal migration of completed and in-progress features.
```
WHO:   As a developer
GIVEN: docs/ contains 001-init/ through 015-temporal-foundation/
       (all completed) and docs/feature-lifecycle-folders/ (in-progress, unnumbered)
       Working tree is clean
WHEN:  The migration script runs
THEN:  docs/completed/001-init/ through docs/completed/015-temporal-foundation/ exist
       docs/in-progress/feature-lifecycle-folders/ exists (already unnumbered — no rename needed)
       docs/requirements/, docs/templates/, docs/open-questions/ remain at docs/ root
       Exactly one git commit is created
```

**AT-MG-02:** In-progress feature with NNN prefix gets prefix stripped.
```
WHO:   As a developer
GIVEN: docs/ contains 016-new-feature/ with files:
         016-REQ-new-feature.md
         016-FSPEC-new-feature.md
         overview.md
WHEN:  The migration script identifies 016-new-feature as in-progress
THEN:  docs/in-progress/new-feature/ contains:
         REQ-new-feature.md
         FSPEC-new-feature.md
         overview.md
       (NNN prefix removed from folder name and document filenames)
       git log --follow on REQ-new-feature.md shows commits from before the migration
```

**AT-MG-03:** Pre-flight check blocks re-run on non-empty lifecycle folder.
```
WHO:   As a developer
GIVEN: docs/completed/ already contains 001-init/ (migration was previously run)
WHEN:  The migration script is run again
THEN:  The script prints the non-empty lifecycle folder warning
       Exits with code 1
       No changes are made to the filesystem
```

---

## 2. Open Questions

None. All product decisions required to write this specification were resolved in the REQ document (v2.3) and the engineer FSPEC cross-review (v1.0). The following notes apply:

- **REQ-SK-03 alignment with FSPEC-PR-01:** REQ-SK-03 describes the skill as detecting backlog status and signalling intent. FSPEC-PR-01 v1.1 adopts the orchestrator-first model (Alternative A from the engineer cross-review), where the orchestrator detects the backlog condition during pre-invocation setup. The skill is never aware of the promotion. The TSPEC author should implement per FSPEC-PR-01 — the orchestrator owns both detection and execution. REQ-SK-03's intent (ensure the feature is promoted before the skill writes artifacts) is fully preserved; only the mechanism has changed from skill-signals to orchestrator-detects.
- **REQ-SK-04 F-01 (Low, from REQ cross-review):** "responsible skill (or orchestrator)" phrasing — [FSPEC-PR-01] unambiguously assigns promotion execution to the orchestrator (BR-01). The TSPEC author should implement per FSPEC-PR-01.
- **REQ-WT-02 F-02 (Low, from REQ cross-review):** "Temporal workflow activity IDs" imprecise terminology — [FSPEC-WT-01 AT-WT-03] and Business Rule BR-05 use accurate terminology ("active Temporal workflow execution identified by workflow ID + run ID"). The TSPEC author should implement per FSPEC-WT-01.

---

## 3. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 3, 2026 | Product Manager | Initial functional specification |
| 1.1 | April 3, 2026 | Product Manager | Addressed engineer cross-review of v1.0 (F-01, F-02, F-03, Q-01). Rewrote FSPEC-PR-01 backlog→in-progress flow to orchestrator-first model: orchestrator detects backlog condition during pre-invocation setup, not the skill (F-01). Removed `PROMOTE_BACKLOG_TO_IN_PROGRESS` signal type — no router extension needed (F-02). Updated BR-01 to reflect orchestrator owns both detection and execution. Updated AT-PR-01. Replaced vague "manual overrides" in FSPEC-MG-01 BR-02 with explicit `git mv` workaround (F-03). Clarified BR-07 sign-off scope: scoped to `(workflowId, runId)` pair; `continue-as-new` requires explicit state carry-forward (Q-01). |
