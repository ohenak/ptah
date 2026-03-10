# Functional Specification: Phase 4 — Artifact Commits

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE4 |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.2 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 4 (Artifact Commits) of Ptah v4.0. Phase 4 transitions the system from "routing loop works, artifacts discarded" (Phase 3) to "every Skill-produced artifact is committed, merged, logged, and auditable."

Phase 4 contains 6 requirements across 2 domains (SI, NF) that together close the artifact persistence gap left by Phase 3. The core challenge is a multi-step post-invocation pipeline — commit in worktree → serialize merge to main → cleanup worktree → append agent log — with conflict handling, concurrency safety, and deduplication.

**What Phase 4 delivers:** After a Skill invocation completes, artifact changes are committed in the worktree, merged to the main branch, logged, and the worktree is cleaned up. Every artifact change has a Git commit with agent attribution. Every invocation has an agent log entry. No Discord message is processed twice.

**Relationship to Phase 3:** Phase 3's FSPEC-SI-01 (§7.9 Worktree Lifecycle) explicitly states that artifact changes are "detected and logged but discarded" and that "Phase 4 adds commit → merge → cleanup." This FSPEC replaces Phase 3's discard-on-complete behavior with a full commit-merge-cleanup pipeline. All other Phase 3 behaviors (context assembly, routing, invocation, Discord posting) remain unchanged.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-SI-05] | Commit artifact changes with agent attribution | [FSPEC-AC-01] |
| [REQ-SI-13] | Worktree merge and cleanup | [FSPEC-AC-01] |
| [REQ-SI-06] | Append agent logs | [FSPEC-AC-02] |
| [REQ-SI-09] | Idempotent message processing | [FSPEC-AC-03] |
| [REQ-NF-03] | Idempotency | [FSPEC-AC-03] |
| [REQ-NF-05] | Auditability | [FSPEC-AC-01], [FSPEC-AC-02] |

### 2.2 Requirements NOT Requiring FSPECs

None — all 6 Phase 4 requirements have behavioral complexity warranting functional specification.

### 2.3 Phase 3 Behaviors Modified by Phase 4

Phase 4 modifies one specific behavior defined in Phase 3:

| Phase 3 Reference | Phase 3 Behavior | Phase 4 Replacement |
|--------------------|------------------|---------------------|
| FSPEC-SI-01 §7.9 — Worktree Lifecycle, path (a) "Successful invocation" | Artifact changes are detected and logged but **discarded**. Worktree directory is removed. Branch is deleted. | Artifact changes are **committed** in the worktree, **merged** to main, **logged** to agent-logs, then worktree is cleaned up. See FSPEC-AC-01. |
| FSPEC-SI-01 §7.9 — Worktree Lifecycle, path (d)/(e) "Process crash/restart" | Orphaned worktrees are pruned on startup. | Orphaned worktrees with **uncommitted** changes are pruned (unchanged). Orphaned worktrees with **committed but unmerged** changes are flagged for manual review rather than silently pruned. See FSPEC-AC-01 §3.4. |
| FSPEC-CB-01 §3.3 — Business Rule CB-R7 | Layer 2 is read from main working tree before worktree creation (TOCTOU accepted). | Layer 2 shall now be read from the **worktree** after creation, eliminating the TOCTOU window. This is because Phase 4 commits to the main tree, so stale Layer 2 reads could cause agents to produce conflicting artifacts. **This changes the Phase 3 orchestration order:** Phase 3 runs assemble-context → create-worktree → invoke. Phase 4 runs create-worktree → read-Layer-2-from-worktree → assemble-context → invoke. The worktree must exist before context assembly begins. |
| FSPEC-SI-01 §7.9 — Worktree cleanup ownership | Worktree cleanup is performed by the Skill Invoker unconditionally in a `finally` block after invocation completes. | Phase 4 **moves worktree cleanup responsibility from the Skill Invoker to the Orchestrator** (or a dedicated post-invocation pipeline). The Orchestrator owns the full post-invocation lifecycle: commit → merge → conditional cleanup → log append. The Skill Invoker returns the worktree path and branch to the Orchestrator without cleaning up. Cleanup is conditional: successful merge → cleanup; merge conflict → retain worktree; timeout/crash → cleanup (discard changes, unchanged from Phase 3). |

All other Phase 3 behaviors (routing, context assembly, invocation mechanism, Discord posting, error handling) remain unchanged.

---

## 3. FSPEC-AC-01: Artifact Commit and Merge Lifecycle

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AC-01 |
| **Title** | Artifact Commit and Merge Lifecycle |
| **Linked Requirements** | [REQ-SI-05], [REQ-SI-13], [REQ-NF-05] |

### 3.1 Description

After a Skill invocation completes successfully, the Orchestrator commits any artifact changes in the worktree with agent attribution, merges the worktree branch to the main branch, and cleans up the worktree. This replaces Phase 3's "discard-on-complete" behavior and ensures every artifact change is version-controlled and attributed.

### 3.2 Behavioral Flow

```
1. TRIGGER: A Skill invocation completes in a worktree (FSPEC-SI-01 Step 4)
   and the Skill output has been captured (text response + routing signal)

2. DETECT ARTIFACT CHANGES
   a. In the invocation's worktree, detect all file changes:
      - Modified files in /docs/ (tracked by Git diff)
      - New files in /docs/ (untracked)
      - Deleted files in /docs/
   b. Changes outside /docs/ are ignored (consistent with Phase 3 SI edge case)
   c. If NO /docs/ changes detected → Skip commit (Step 6: cleanup only)

3. COMMIT IN WORKTREE
   a. Stage all /docs/ changes in the worktree
   b. Commit with attribution message format:
      [ptah] {Agent}: {description}
      where:
      - {Agent} is the agent's display name (e.g., "PM Agent", "Dev Agent")
      - {description} is a brief summary of the change, derived from:
        - The thread name: extract text after " — " (em dash)
          (e.g., "auth — review requirements" → "review requirements")
        - Fallback: if the thread name has no " — " separator,
          use the full thread name as the description
   c. The commit is made on the worktree's branch
      (ptah/{agent-id}/{thread-id}/{invocation-id})

4. MERGE TO MAIN (SERIALIZED)
   a. Acquire the merge lock (one merge at a time — see AC-R3)
   b. Merge the worktree branch into the main branch
      - Use fast-forward merge if possible
      - If fast-forward is not possible (concurrent changes on main),
        use a merge commit
   c. On MERGE SUCCESS → proceed to Step 5 (cleanup)
   d. On MERGE CONFLICT → proceed to Step 7 (conflict handling)

5. CLEANUP (on success)
   a. Remove the worktree directory
   b. Delete the worktree branch (ptah/{agent-id}/{thread-id}/{invocation-id})
   c. Append agent log entry (→ FSPEC-AC-02)
   d. Proceed with Discord posting (FSPEC-DI-01) and routing (FSPEC-RP-01)

6. CLEANUP (no changes — skip commit)
   a. Remove the worktree directory
   b. Delete the worktree branch
   c. Append agent log entry (→ FSPEC-AC-02) — log the invocation
      even when no artifacts were changed
   d. Proceed with Discord posting and routing

7. CONFLICT HANDLING
   a. The merge has failed due to conflicting changes on main
   b. RETAIN the worktree — do NOT remove it
   c. Post an error embed to the thread:
      "Merge conflict: {Agent}'s changes in {worktree-branch} conflict
       with recent changes on main. The worktree has been retained at
       {worktree-path} for manual resolution."
   d. Log to #agent-debug with full conflict details
      (which files conflict, worktree path, branch name)
   e. Append agent log entry with conflict status (→ FSPEC-AC-02)
   f. Release the merge lock
   g. The text response and routing signal are STILL processed:
      - Discord posting proceeds (the Skill's response is posted)
      - Routing proceeds (the next agent is invoked if applicable)
   h. The conflicted worktree remains on disk until a developer
      manually resolves it

8. ERROR HANDLING (commit or merge failure — not conflict)
   a. If the commit operation itself fails (e.g., Git error):
      - Post error embed to thread
      - Log to #agent-debug
      - Clean up worktree (discard changes — same as Phase 3)
      - Proceed with Discord posting and routing
      - Agent log entry records the failure
   b. If the merge fails for non-conflict reasons (e.g., disk error):
      - Same as conflict handling (Step 7) — retain worktree for safety
```

### 3.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| AC-R1 | Only `/docs/` file changes are committed. Changes outside `/docs/` are ignored. | Skills operate on documentation artifacts only. Non-docs changes are unexpected and could be harmful. |
| AC-R2 | Commit message format is exactly `[ptah] {Agent}: {description}`. No variation. | Consistent format enables Git log auditing, filtering (`git log --grep="\[ptah\]"`), and attribution analysis. |
| AC-R3 | Merges to main are serialized — one merge at a time, globally. The merge lock has a default timeout of **10 seconds**. Merge ordering is **not guaranteed** (implementation-dependent — FIFO, priority-based, or arbitrary are all acceptable). | Concurrent merges to the same branch cause race conditions. Serializing merges is the simplest strategy that guarantees correctness. The operational ceiling of ~5 concurrent invocations (Phase 3, SI §7.3 Step 6c) means merge serialization is not a bottleneck. The 10-second timeout is generous — merge operations on docs-only changes are expected to complete in <1 second. If the lock is held longer than 10 seconds, something is wrong (e.g., a deadlock or hung process). |
| AC-R4 | On merge conflict, the worktree is RETAINED, not cleaned up. | The developer needs the worktree to inspect and resolve the conflict. Deleting it would lose the committed changes. |
| AC-R5 | Discord posting and routing proceed even on merge conflict. | The Skill's text response and routing signal are independent of artifact persistence. The conversation continues in Discord while the conflict is resolved asynchronously. |
| AC-R6 | Agent log entry is appended for EVERY invocation — success, no-change, conflict, or failure. | Auditability requires a complete record of all invocations, not just successful ones. |
| AC-R7 | Commit description is derived from thread context, not from the Skill's response text. The description is the text after " — " (em dash) in the thread name. **Fallback:** If the thread name contains no " — " separator, use the full thread name as the description. | The Skill's response text may be long and unsuitable for a commit message. Thread name provides a concise, consistent description. |
| AC-R8 | The merge lock is released on every exit path — success, conflict, and error. | Failure to release the lock would deadlock all subsequent merges. |
| AC-R9 | The merge lock and agent log append locks must not conflict. A log append to the main working tree must not occur while a merge to main is in progress on that same working tree, or vice versa. The TSPEC shall define the synchronization mechanism (e.g., merge lock also gates log appends, or stash/unstash, or `--no-commit` merge strategy). | Agent log files live at `docs/agent-logs/` — inside the `/docs/` commit scope. An uncommitted log change in the main working tree could cause `git merge` to fail if the merge touches the same file. The merge lock (AC-R3) and per-agent log lock (AL-R4) are independent; without coordination, a log append during a merge is a race condition. |
| AC-R10 | Git auto-merge of non-overlapping changes to the same file is accepted. The Orchestrator does not perform semantic merge validation. Semantic consistency is the responsibility of the review loop ([FSPEC-RP-03]). | When two agents modify non-overlapping lines of the same file, Git's merge algorithm silently succeeds. The merged result may be semantically inconsistent (e.g., one agent changes a requirement while another writes a spec referencing the old version). This is acceptable for Phase 4: the review loop (Phase 5) is designed to catch semantic inconsistencies. Adding semantic merge validation would require content-aware diffing, which is disproportionate to the risk given Phase 5's review mechanism. |

### 3.4 Worktree Lifecycle (Phase 4 — replaces Phase 3 §7.9)

Phase 4 replaces Phase 3's worktree lifecycle for the successful invocation path. All other paths remain unchanged from Phase 3.

| Completion Path | Phase 3 Behavior | Phase 4 Behavior |
|----------------|-------------------|-------------------|
| **(a) Successful invocation, with artifact changes** | Changes discarded. Worktree removed. Branch deleted. | Changes committed in worktree → merged to main → worktree removed → branch deleted → agent log appended. |
| **(b) Successful invocation, no artifact changes** | Worktree removed. Branch deleted. | Worktree removed. Branch deleted. Agent log appended (records invocation even without changes). |
| **(c) Merge conflict** | N/A (Phase 3 doesn't merge) | Changes committed in worktree. Merge fails. Worktree **retained**. Error embed posted. Agent log appended with conflict status. |
| **(d) Timeout (>90s)** | Worktree removed. Branch deleted. | **Unchanged from Phase 3.** Timed-out invocations discard changes — no partial commits. |
| **(e) Skill crash / unhandled error** | Worktree removed. Branch deleted. | **Unchanged from Phase 3.** Crashed invocations discard changes. |
| **(f) Process crash** | Orphaned worktrees pruned on startup. | Orphaned worktrees **with commits** on their branch (detectable by checking whether the worktree branch has commits not on main — e.g., `git log main..{branch}` is non-empty) are **flagged** to the developer via console warning on startup — not silently pruned. Orphaned worktrees **without commits** (branch has no unique commits vs. main) are pruned as in Phase 3. |
| **(g) Process restart (graceful)** | Same as (f). | Same as (f). |

### 3.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill produces changes to both `/docs/auth/` and `/docs/payments/` in one invocation | All `/docs/` changes are committed in a single commit. One commit per invocation — not per file or per feature. |
| Skill deletes a `/docs/` file | The deletion is committed. Deletions are valid artifact changes. |
| Multiple concurrent invocations finish simultaneously and all need to merge | Merges queue behind the merge lock. Each merge is processed in order. The second merge may encounter a conflict if the first merge modified the same files. |
| Worktree branch already exists (leftover from crash) | On worktree creation (Phase 3 FSPEC-SI-01 Step 2b), check if the branch exists. If it does and has commits, flag for manual review and create a new branch with a different invocation-id. If it has no commits, delete it and recreate. **Rationale:** This is a defensive check for the scenario where startup pruning ran but failed to delete a specific branch (e.g., branch deletion error), or the process crashed between branch creation and worktree creation. The random invocation-id makes actual collisions negligible, but the check prevents a hard failure and is cheap. |
| Main branch has diverged significantly since worktree creation (e.g., many human pushes) | This may cause conflicts even if the files don't overlap (depending on Git's merge strategy). Treated as a merge conflict — worktree retained. |
| Main branch was force-pushed after a crash (path f recovery) | If `main` was force-pushed or rebased after a crash, the committed-but-unmerged detection (`git log main..{branch}`) could give misleading results — branches may appear to have "new" commits relative to the rewritten main. This is extremely unlikely in normal operation (human pushes to main are the only external mutation). If detected, the worktree is still flagged for manual review, which is the safe default. |
| The Skill modifies `docs/agent-logs/*.md` directly in its worktree | The Orchestrator appends agent logs after merge (FSPEC-AC-02), not the Skill. If the Skill modified agent-logs, these changes are committed along with other `/docs/` changes. The Orchestrator's log append (Step 5c) occurs on main after merge — no conflict with the Skill's changes because they're already merged. However, this is unusual — log a warning. |
| A Skill reads `docs/agent-logs/` files in its worktree | The worktree contains a snapshot of agent-logs from the time the worktree was created. These logs may be stale (missing entries appended to main since worktree creation). This is acceptable — agent-logs are for audit purposes, not for agent context. Skills should not depend on agent-log contents for decision-making. |
| Git commit fails because the worktree has an invalid state (e.g., locked index) | Treated as a commit failure (Step 8a — see §3.6 rows 1-2). Changes discarded. Error logged. |
| Agent A deletes a `/docs/` file; Agent B modifies the same file concurrently | Git reports a delete-modify conflict. Standard conflict handling applies (Step 7): worktree retained, error embed posted, agent log records conflict status. |
| Two agents both create the same new file (e.g., `docs/auth/analysis.md`) with different content | Git reports a conflict (add-add collision). Standard conflict handling applies (Step 7). |
| Two agents modify the same file but different non-overlapping lines | Git auto-merge silently succeeds per AC-R10. The merged result may be semantically inconsistent. Semantic consistency is delegated to the review loop ([FSPEC-RP-03]). |

### 3.6 Error Scenarios

| Error | Behavior |
|-------|----------|
| `git add` fails in worktree | Commit failure (Step 8a). Discard changes. Error embed. Log. |
| `git commit` fails in worktree | Commit failure (Step 8a). Discard changes. Error embed. Log. |
| `git merge` returns conflict | Conflict handling (Step 7). Retain worktree. Error embed. Log. |
| `git merge` fails for non-conflict reason (e.g., I/O error) | Treat as conflict (Step 7). Retain worktree for safety. Error embed. Log. |
| Worktree removal fails (`git worktree remove`) | Log error. Worktree remains on disk. Startup pruning will handle it on next restart. Not a blocking failure. |
| Branch deletion fails after worktree removal | Log error. Orphaned branch remains. Startup pruning will handle it. Not a blocking failure. |
| Merge lock acquisition times out | Post error embed to thread. Log. Skip merge. Retain worktree for manual resolution. This should be rare — merge operations are fast (<1s for docs-only changes). |

### 3.7 Acceptance Tests

**AT-AC-01: Standard artifact commit and merge**

```
WHO:   As the Orchestrator
GIVEN: The Dev Agent Skill invocation completes in a worktree
       and the Skill has modified `docs/auth/requirements.md`
WHEN:  I process the post-invocation pipeline
THEN:  The change is committed in the worktree with message
       "[ptah] Dev Agent: review requirements"
       The worktree branch is merged to main
       The worktree directory is removed
       The worktree branch is deleted
       `docs/auth/requirements.md` on main reflects the Skill's changes
```

**AT-AC-02: No artifact changes — skip commit**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes in a worktree
       and the Skill made no changes to any /docs/ files
WHEN:  I process the post-invocation pipeline
THEN:  No commit is created
       The worktree is removed and branch deleted
       An agent log entry is still appended (FSPEC-AC-02)
       Discord posting and routing proceed normally
```

**AT-AC-03: Merge conflict — worktree retained**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent Skill modifies `docs/auth/requirements.md` in its worktree
       and another invocation has already merged changes to the same file on main
WHEN:  I attempt to merge the PM Agent's worktree branch to main
THEN:  The merge fails with a conflict
       The worktree is NOT removed
       An error embed is posted: "Merge conflict: PM Agent's changes in
       ptah/pm-agent/{thread-id}/{inv-id} conflict with recent changes
       on main..."
       The conflict is logged to #agent-debug
       The Skill's text response is STILL posted to Discord
       The routing signal is STILL processed
```

**AT-AC-04: Serialized merge — no concurrent merges**

```
WHO:   As the Orchestrator
GIVEN: Two Skill invocations (Dev Agent in Thread A, Test Agent in Thread B)
       complete simultaneously, both with artifact changes
WHEN:  Both attempt to merge to main
THEN:  One merge completes first (acquires the lock)
       The second merge waits until the first finishes
       Both merges are processed sequentially
       If neither conflicts, both succeed
```

**AT-AC-05: Commit message format**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent completes work in thread "auth — review requirements"
       with artifact changes
WHEN:  I commit the changes in the worktree
THEN:  The commit message is exactly "[ptah] PM Agent: review requirements"
       The message follows the format [ptah] {Agent}: {description}
```

**AT-AC-06: Non-docs changes ignored**

```
WHO:   As the Orchestrator
GIVEN: A Skill has modified both `docs/auth/specs.md` and `src/utils.ts`
       in its worktree
WHEN:  I stage and commit artifact changes
THEN:  Only `docs/auth/specs.md` is staged and committed
       `src/utils.ts` changes are not committed
       A warning is logged about non-/docs changes
```

**AT-AC-07: Commit description derived from thread name**

```
WHO:   As the Orchestrator
GIVEN: The thread name is "payments — write specification"
       and the Dev Agent has made artifact changes
WHEN:  I create the commit message
THEN:  The commit message is "[ptah] Dev Agent: write specification"
       The description is extracted from the thread name (text after " — ")
```

**AT-AC-08: File deletion committed**

```
WHO:   As the Orchestrator
GIVEN: A Skill has deleted `docs/auth/old-notes.md` in its worktree
WHEN:  I stage and commit artifact changes
THEN:  The deletion is committed
       The file is removed from main after merge
```

**AT-AC-09: Timeout — no commit, changes discarded**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation times out (>90s) and has uncommitted
       changes in the worktree
WHEN:  I handle the timeout
THEN:  No commit is created
       Changes are discarded (unchanged from Phase 3)
       The worktree is removed and branch deleted
```

**AT-AC-10: Process crash — committed worktrees flagged on restart**

```
WHO:   As the Orchestrator
GIVEN: A process crash occurred after a commit was made in a worktree
       but before the merge to main completed
       and the Orchestrator restarts
WHEN:  I run the startup pruning routine
THEN:  The orphaned worktree with commits is NOT silently pruned
       A console warning is displayed:
       "Found orphaned worktree with commits: {branch-name} at {path}.
        Manual review required."
       Orphaned worktrees without commits are pruned normally
```

**AT-AC-11: Merge lock released on conflict**

```
WHO:   As the Orchestrator
GIVEN: A merge operation encounters a conflict
WHEN:  The conflict is handled (Step 7)
THEN:  The merge lock is released
       The next queued merge can proceed
       The system does not deadlock
```

**AT-AC-12: Multiple file changes in single commit**

```
WHO:   As the Orchestrator
GIVEN: A Skill modifies `docs/auth/requirements.md`,
       creates `docs/auth/analysis.md`, and
       deletes `docs/auth/old-draft.md`
WHEN:  I commit artifact changes
THEN:  All three changes are in a single commit
       The commit message is "[ptah] {Agent}: {description}"
       One invocation = one commit
```

**AT-AC-13: Discord posting proceeds despite merge conflict**

```
WHO:   As the Orchestrator
GIVEN: A merge conflict has occurred for the PM Agent's changes
       and the PM Agent's Skill response includes text and a
       ROUTE_TO_AGENT signal targeting dev-agent
WHEN:  I handle the merge conflict
THEN:  The PM Agent's text response is posted to Discord as an embed
       The ROUTE_TO_AGENT signal is processed
       The Dev Agent is invoked next
       The merge conflict does not block the conversation flow
```

**AT-AC-14: Commit description fallback — thread name without em dash**

```
WHO:   As the Orchestrator
GIVEN: The thread name is "review auth requirements" (no " — " separator)
       and the Dev Agent has made artifact changes
WHEN:  I create the commit message
THEN:  The commit message is "[ptah] Dev Agent: review auth requirements"
       The full thread name is used as the description (fallback)
```

**AT-AC-15: Commit failure — changes discarded, pipeline continues**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes with artifact changes
       but the `git add` or `git commit` operation fails
       (e.g., locked index, corrupted worktree state)
WHEN:  I handle the commit failure (Step 8a)
THEN:  The changes are discarded (not committed)
       An error embed is posted to the thread
       The error is logged to #agent-debug
       The worktree is cleaned up (removed)
       Discord posting proceeds (Skill's text response is still posted)
       Routing proceeds (next agent is invoked if applicable)
       An agent log entry is appended with "error" status
```

**AT-AC-16: Non-conflict merge failure — worktree retained**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes and changes are committed
       but the `git merge` operation fails for a non-conflict reason
       (e.g., I/O error, disk failure)
WHEN:  I handle the merge failure (Step 8b)
THEN:  The worktree is RETAINED (same as conflict handling)
       An error embed is posted to the thread
       The error is logged to #agent-debug
       Discord posting and routing proceed normally
       An agent log entry is appended with "conflict" status
```

**AT-AC-17: Merge lock timeout — error embed, no deadlock**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes with committed changes
       but the merge lock cannot be acquired within 10 seconds
WHEN:  The merge lock acquisition times out
THEN:  An error embed is posted to the thread:
       "Merge lock timeout: could not acquire merge lock within 10s.
        Worktree retained for manual resolution."
       The worktree is RETAINED (not cleaned up)
       The error is logged to #agent-debug
       Discord posting and routing proceed normally
       An agent log entry is appended with "error" status
       The merge lock is NOT in a deadlocked state
       Other merges can still acquire the lock
```

**AT-AC-18: Merge lock released on success path**

```
WHO:   As the Orchestrator
GIVEN: A merge operation completes successfully (no conflict)
WHEN:  The merge lock is released after success
THEN:  The next queued merge can acquire the lock immediately
       No deadlock occurs
       The system can process subsequent merges without delay
```

**AT-AC-19: Concurrent merge and log append — AC-R9 constraint**

```
WHO:   As the Orchestrator
GIVEN: A merge to main is in progress (merge lock held)
       and a different agent's invocation completes and needs
       to append to `docs/agent-logs/dev-agent.md`
WHEN:  The log append and merge execute concurrently
THEN:  The log append does NOT corrupt the merge operation
       The merge does NOT corrupt the log append
       Both operations complete successfully
       The synchronization mechanism (defined by TSPEC) prevents
       conflicts between the merge lock (AC-R3) and the per-agent
       log lock (AL-R4)
```

**AT-AC-20: Delete-modify conflict — standard conflict handling**

```
WHO:   As the Orchestrator
GIVEN: Agent A deletes `docs/auth/old-notes.md` and merges successfully
       and Agent B has modified `docs/auth/old-notes.md` in its worktree
WHEN:  Agent B's worktree branch is merged to main
THEN:  Git reports a delete-modify conflict
       The worktree is RETAINED (Step 7)
       An error embed is posted with conflict details
       Discord posting and routing proceed normally
       An agent log entry is appended with "conflict" status
```

### 3.8 Dependencies

- Depends on: [FSPEC-SI-01] (Phase 3 — Skill Invocation Lifecycle provides the worktree and output capture)
- Feeds into: [FSPEC-AC-02] (agent log append after merge or conflict)
- Feeds into: [FSPEC-DI-01] (Discord posting proceeds after commit/merge)
- Feeds into: [FSPEC-RP-01] (routing proceeds after commit/merge)

---

## 4. FSPEC-AC-02: Agent Log Append

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AC-02 |
| **Title** | Agent Log Append — Timestamped Invocation Records |
| **Linked Requirements** | [REQ-SI-06], [REQ-NF-05] |

### 4.1 Description

After every Skill invocation (regardless of outcome), the Orchestrator appends a timestamped entry to `docs/agent-logs/{agent}.md`. This provides a persistent, human-readable audit trail of all agent activity. Agent logs are written on the main branch, not in worktrees. Because agent-logs reside under `/docs/`, they are within the artifact commit scope (AC-R1) and will be included in the next artifact commit's staging operation.

### 4.2 Behavioral Flow

```
1. TRIGGER: A Skill invocation has completed processing
   (after commit/merge/cleanup per FSPEC-AC-01, or after error handling)

2. DETERMINE LOG ENTRY CONTENT
   a. Timestamp: ISO 8601 format (e.g., 2026-03-10T14:30:00Z)
   b. Agent: The agent that was invoked (e.g., "dev-agent")
   c. Thread: The thread name (e.g., "auth — review requirements")
   d. Status: One of:
      - "completed" — Skill invocation succeeded, artifacts committed
        and merged (or no artifacts to commit)
      - "completed (no changes)" — Skill invocation succeeded,
        no artifact changes detected
      - "conflict" — Skill invocation succeeded, artifacts committed,
        but merge to main failed due to conflict
      - "error" — Skill invocation failed (timeout, crash, API error)
   e. Commit: The Git commit SHA (short form) if a commit was made,
      or "none" if no commit
   f. Summary: Brief description of what the agent did — derived from
      the thread name (same as commit description)

3. APPEND TO LOG FILE
   a. Open `docs/agent-logs/{agent}.md` on the main branch
   b. Append the log entry (see §4.3 for format)
   c. The append is NOT committed to Git by the Orchestrator
      — it is a working tree modification. Because agent-logs reside
      under /docs/ (within the artifact commit scope per AC-R1),
      the next artifact commit's staging of /docs/ changes will
      include accumulated log entries. Alternatively, the developer's
      next manual commit will include them.
      This avoids one extra commit per invocation just for logs.

4. CONCURRENCY SAFETY
   a. Log appends are serialized per agent (one append at a time
      per agent log file)
   b. Different agents can append to their own logs concurrently
      (they write to different files)
```

### 4.3 Log Entry Format

Each entry is a single Markdown line appended to the file:

```
| {timestamp} | {status} | {thread} | {commit} | {summary} |
```

The log file uses a Markdown table format. The file header (created by `ptah init`) is:

```markdown
# Agent Log: {Agent Name}

| Timestamp | Status | Thread | Commit | Summary |
|-----------|--------|--------|--------|---------|
```

Entries are appended to the table. Example:

```
| 2026-03-10T14:30:00Z | completed | auth — review requirements | a1b2c3d | review requirements |
| 2026-03-10T14:35:12Z | completed (no changes) | auth — review requirements | none | review requirements |
| 2026-03-10T15:01:45Z | conflict | payments — write spec | e4f5g6h | write spec |
| 2026-03-10T15:10:03Z | error | payments — write spec | none | write spec |
```

### 4.4 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| AL-R1 | Every Skill invocation produces a log entry — no exceptions. | Auditability requires a complete record. Selective logging creates blind spots. |
| AL-R2 | Log entries are append-only. Existing entries are never modified or deleted by the Orchestrator. | Append-only logs provide a tamper-evident audit trail. |
| AL-R3 | Log appends are NOT individually committed to Git. They accumulate as working tree changes. Because agent-logs live at `docs/agent-logs/` (inside the `/docs/` commit scope per AC-R1), accumulated log changes are included when the next artifact commit stages `/docs/` changes. | One extra commit per invocation just for log entries would be excessive noise. Log changes are swept into the next artifact commit automatically, or included in the developer's next manual commit. |
| AL-R4 | Log appends are serialized per agent file to prevent concurrent write corruption. | Two concurrent invocations of the same agent (in different threads) could corrupt the file if they write simultaneously. |
| AL-R5 | Log files are on the main branch, not in worktrees. Log appends must not conflict with concurrent merge operations on the main working tree — see AC-R9 for the synchronization constraint. | Logs are a global audit record. Writing them in worktrees would make them subject to merge conflicts and would defer visibility until merge. Because log files reside inside `/docs/`, uncommitted log changes on the main working tree could interfere with `git merge` if the merge touches the same files. |
| AL-R6 | Timestamp uses UTC in ISO 8601 format. | Consistent timezone eliminates ambiguity when agents operate across time zones or during DST transitions. |
| AL-R7 | Pipe characters (`|`) in log entry fields (thread name, summary, etc.) must be escaped as `\|` before writing the entry. | Log entries use Markdown table syntax with `|` as the column delimiter. Unescaped pipe characters in field values corrupt the table structure (e.g., a thread named "auth | review" produces 6 columns instead of 5). |

### 4.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Agent log file does not exist (`docs/agent-logs/{agent}.md` missing) | Create the file with the standard header (see §4.3), then append the entry. Log a warning. |
| Agent log file is malformed (header missing or corrupt) | Append the entry anyway — best-effort. Log a warning about the malformed file. |
| Two invocations of the same agent complete simultaneously | Serialized per AL-R4. One append completes before the other starts. |
| Agent log file is locked by another process (e.g., user's editor) | Retry append once after a short delay. If still locked, log a warning and skip this entry. The invocation still proceeds — log failure does not block the pipeline. |
| Process crashes before log entry is written | The log entry is lost for this invocation. This is accepted — the Git commit (if it was made and merged) still provides an audit trail via `git log --grep="[ptah]"`. |

### 4.6 Error Scenarios

| Error | Behavior |
|-------|----------|
| File write failure (permissions, disk full) | Log a warning to console and #agent-debug. Skip the log entry. The invocation pipeline is NOT blocked. |
| File creation failure (cannot create `docs/agent-logs/` directory) | Log a warning. Skip. Not blocking. |
| File locked by another process (editor, concurrent process) | Retry append once after a short delay. If still locked on retry, log a warning to console and #agent-debug. Skip the log entry. Pipeline is NOT blocked. |

### 4.7 Acceptance Tests

**AT-AL-01: Standard log entry after successful commit**

```
WHO:   As the Orchestrator
GIVEN: The Dev Agent's invocation completed successfully
       and artifacts were committed (SHA: a1b2c3d)
       in thread "auth — review requirements"
WHEN:  I append the agent log entry
THEN:  `docs/agent-logs/dev-agent.md` contains a new entry:
       | {timestamp} | completed | auth — review requirements | a1b2c3d | review requirements |
       The timestamp is in ISO 8601 UTC format
```

**AT-AL-02: Log entry for no-change invocation**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent's invocation completed successfully
       but no artifact changes were detected
       in thread "auth — review requirements"
WHEN:  I append the agent log entry
THEN:  `docs/agent-logs/pm-agent.md` contains a new entry:
       | {timestamp} | completed (no changes) | auth — review requirements | none | review requirements |
```

**AT-AL-03: Log entry for merge conflict**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent's invocation completed
       and artifacts were committed (SHA: e4f5g6h)
       but the merge to main failed due to conflict
WHEN:  I append the agent log entry
THEN:  `docs/agent-logs/pm-agent.md` contains a new entry:
       | {timestamp} | conflict | {thread-name} | e4f5g6h | {description} |
```

**AT-AL-04: Log entry for failed invocation**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation failed (e.g., timeout, API error)
       in thread "payments — write specification"
WHEN:  I append the agent log entry
THEN:  `docs/agent-logs/{agent}.md` contains a new entry:
       | {timestamp} | error | payments — write specification | none | write specification |
```

**AT-AL-05: Log append does not create a Git commit**

```
WHO:   As the Orchestrator
GIVEN: A log entry has been appended to `docs/agent-logs/dev-agent.md`
WHEN:  I check the Git status of the main working tree
THEN:  `docs/agent-logs/dev-agent.md` appears as a modified (unstaged) file
       No new Git commit was created just for the log entry
```

**AT-AL-06: Missing log file is auto-created**

```
WHO:   As the Orchestrator
GIVEN: `docs/agent-logs/dev-agent.md` does not exist
WHEN:  I attempt to append a log entry for dev-agent
THEN:  The file is created with the standard Markdown table header
       The log entry is appended after the header
       A warning is logged about the missing file
```

**AT-AL-07: Serialized per-agent log writes**

```
WHO:   As the Orchestrator
GIVEN: Two concurrent Dev Agent invocations complete simultaneously
       (in different threads)
WHEN:  Both attempt to append to `docs/agent-logs/dev-agent.md`
THEN:  The appends are serialized — one completes before the other starts
       Both entries appear in the file in order
       The file is not corrupted
```

**AT-AL-08: Log failure does not block pipeline**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completed successfully
       and the log file write fails (e.g., disk full)
WHEN:  I handle the log failure
THEN:  A warning is logged to console and #agent-debug
       Discord posting proceeds normally
       Routing proceeds normally
       The invocation pipeline is NOT blocked
```

**AT-AL-09: Malformed log file — append best-effort**

```
WHO:   As the Orchestrator
GIVEN: `docs/agent-logs/dev-agent.md` exists but is malformed
       (e.g., the Markdown table header is missing or corrupt)
WHEN:  I attempt to append a log entry
THEN:  The log entry is appended anyway (best-effort)
       A warning is logged about the malformed file
       The invocation pipeline is NOT blocked
       The entry is appended even if the table structure is broken
```

**AT-AL-10: Log file locked — retry once, then skip**

```
WHO:   As the Orchestrator
GIVEN: `docs/agent-logs/dev-agent.md` is locked by another process
       (e.g., user has the file open in an editor with a lock)
WHEN:  I attempt to append a log entry
THEN:  The first attempt fails (file locked)
       The system retries once after a short delay
       If still locked: the entry is skipped
       A warning is logged to console and #agent-debug
       The invocation pipeline is NOT blocked
       Discord posting and routing proceed normally
```

### 4.8 Dependencies

- Depends on: [FSPEC-AC-01] (log entry is appended after commit/merge/cleanup)
- Depends on: [FSPEC-SI-01] (invocation completion triggers log append)

---

## 5. FSPEC-AC-03: Idempotent Message Processing

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AC-03 |
| **Title** | Idempotent Message Processing — Deduplication by Message ID |
| **Linked Requirements** | [REQ-SI-09], [REQ-NF-03] |

### 5.1 Description

The Orchestrator must not re-invoke a Skill for a Discord message it has already processed. This prevents duplicate artifact commits, duplicate agent log entries, and wasted API calls. Deduplication is tracked by Discord message ID using an in-memory set.

### 5.2 Behavioral Flow

```
1. TRIGGER: A message arrives in a thread under #agent-updates
   (before routing — this is the earliest check in the pipeline)

2. CHECK DEDUPLICATION
   a. Extract the Discord message ID from the incoming message
   b. Check if this message ID exists in the processed-messages set
   c. If FOUND → SKIP processing (Step 3)
   d. If NOT FOUND → RECORD and PROCESS (Step 4)

3. SKIP (duplicate message)
   a. Do not invoke any Skill
   b. Do not post any Discord message
   c. Log at debug level: "Skipping duplicate message {message-id}"
   d. No error — this is expected behavior

4. RECORD AND PROCESS (new message)
   a. Add the message ID to the processed-messages set
   b. Proceed to routing (FSPEC-RP-01) → context assembly →
      invocation → commit/merge → etc.
   c. The message ID remains in the set permanently (for the
      lifetime of the process)

5. ON PROCESS RESTART
   a. The processed-messages set is empty (in-memory only)
   b. The Orchestrator re-reads thread history via Phase 2's
      readThreadHistory
   c. Messages that were already processed (and have bot responses
      in the thread) are identified by their existing bot replies
   d. Messages that were NOT processed (no bot response) are
      re-processed normally
   e. The key insight: a message is "already processed" if the
      thread already contains a bot response to it. This is
      determined by the existing Phase 3 routing logic
      (FSPEC-RP-01 Step 2a — bot ignores its own messages)
```

### 5.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| ID-R1 | Deduplication check is the FIRST check in the message pipeline, before routing. | Catching duplicates early prevents any downstream processing — no wasted context assembly or API calls. |
| ID-R2 | The processed-messages set is in-memory only. It is NOT persisted to disk or database. | Discord thread history provides the durable deduplication mechanism (Step 5c/d). In-memory tracking handles the common case (duplicate events during normal operation). The restart case is handled by thread history inspection. |
| ID-R3 | A message ID is added to the set BEFORE processing begins, not after completion. | Adding before processing prevents a race condition during normal operation where the same message event fires twice and both start processing concurrently. On restart, the in-memory set is empty regardless — thread history serves as the durable dedup mechanism (see ID-R5). |
| ID-R4 | Duplicate messages are silently skipped — no error, no warning. | Discord may deliver the same message event multiple times (e.g., reconnection). This is expected, not an error. |
| ID-R5 | On restart, thread history is the source of truth for what has been processed. Re-processing produces **new output, not a replay** — Skills are non-deterministic (LLM-based). This is safe because the original invocation's output was lost (never merged or posted), so new output is the correct recovery. | In-memory state is lost. Thread history shows which messages have bot responses and which don't. Unprocessed messages are re-processed. Note: because Skills are LLM-based, re-invoking the same Skill on the same message will likely produce different artifacts than the original invocation. The "idempotent" property refers to the pipeline mechanism (no double-processing during normal operation), not to Skill output determinism. See §5.4 for the partial-crash double-commit scenario. |

### 5.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Discord delivers the same message event twice in rapid succession | The first event adds the ID to the set and begins processing. The second event finds the ID in the set and skips. No duplicate processing. |
| Process restarts and re-reads thread history | Messages with existing bot responses are not re-processed (FSPEC-RP-01 routing logic handles this — bot-posted embeds trigger a ROUTE_TO_AGENT or terminal signal, not re-invocation of the original message's target). Messages without bot responses are re-processed. |
| Discord reconnection after network interruption | The bot receives a backlog of messages. Each is checked against the processed-messages set. Messages processed before the disconnect are skipped. New messages are processed. |
| Processed-messages set grows unboundedly over time | Accepted for Phase 4. Each entry is a message ID string (~20 bytes). At 1000 messages/day, this is ~20KB/day — negligible for the expected operational scale. A future phase may add periodic eviction of old entries (e.g., messages older than 24 hours). |
| A message is in the processed set but its Skill invocation failed | The message is treated as "processed" — it will NOT be re-processed on its own. However, if the failure was posted as an error embed, a human can re-trigger by posting a new message. This is by design: automatic re-processing of failed messages is Phase 6's responsibility (retry with backoff). |
| **Partial-crash double-commit (known limitation):** Process crashes after merge succeeds but before Discord response is posted | On restart: the thread has no bot response for this message → it is re-processed. The Skill produces new (potentially different) artifacts → committed and merged (new commit). **Result:** Two commits for the same message, with potentially different content. **This is accepted as a known limitation.** The alternative (checking Git history for `[ptah]` commits matching the thread) would add significant complexity. Both commits are valid work product — the review loop (Phase 5) will review the latest state. |
| Post-restart, a message whose original invocation posted an error embed | The error embed in thread history serves as the "bot response." FSPEC-RP-01's routing logic treats this as a processed message — it is NOT re-processed. The error embed is the terminal response for this message. A human must post a new message to retry. |

### 5.5 Error Scenarios

| Error | Behavior |
|-------|----------|
| Message has no message ID (malformed Discord event) | Skip the message. Log a warning. Do not attempt to process. |

### 5.6 Acceptance Tests

**AT-ID-01: Duplicate message is skipped**

```
WHO:   As the Orchestrator
GIVEN: I have already processed Discord message with ID "msg-123"
WHEN:  I receive the same message ID "msg-123" again
THEN:  I do not invoke any Skill
       I do not post any Discord message
       I log "Skipping duplicate message msg-123" at debug level
```

**AT-ID-02: New message is processed normally**

```
WHO:   As the Orchestrator
GIVEN: I have not seen Discord message with ID "msg-456"
WHEN:  I receive message "msg-456"
THEN:  The message ID is added to the processed-messages set
       The message proceeds through routing → context assembly → invocation
```

**AT-ID-03: Dedup check is first in pipeline**

```
WHO:   As the Orchestrator
GIVEN: I have already processed message "msg-123"
WHEN:  I receive "msg-123" again
THEN:  No routing decision is made
       No context assembly occurs
       No API call is made
       The duplicate is caught before any downstream processing
```

**AT-ID-04: Rapid duplicate delivery**

```
WHO:   As the Orchestrator
GIVEN: Discord delivers message "msg-789" twice within 100ms
WHEN:  Both events are received
THEN:  Only one Skill invocation occurs
       The second event is skipped
       No duplicate commits or log entries are produced
```

**AT-ID-05: Post-restart deduplication via thread history**

```
WHO:   As the Orchestrator
GIVEN: The process has restarted (processed-messages set is empty)
       and thread "auth — review" contains:
       - Human message (msg-100): "@Dev Agent review requirements"
       - Bot embed (response to msg-100): Dev Agent's review
       - Human message (msg-200): "@PM Agent update requirements"
       - No bot response to msg-200
WHEN:  I re-read the thread history on startup
THEN:  msg-100 is not re-processed (bot response already exists)
       msg-200 IS re-processed (no bot response found)
```

**AT-ID-06: Failed message remains in processed set**

```
WHO:   As the Orchestrator
GIVEN: Message "msg-300" was processed but the Skill invocation failed
       and an error embed was posted
WHEN:  I receive "msg-300" again (e.g., Discord reconnect)
THEN:  The message is skipped (it's in the processed set)
       The error embed already in the thread serves as the response
       Re-processing of failed messages is Phase 6's responsibility
```

**AT-ID-07: Malformed message without ID**

```
WHO:   As the Orchestrator
GIVEN: A Discord event arrives with no message ID
WHEN:  I attempt dedup check
THEN:  The message is skipped entirely
       A warning is logged
       No Skill invocation occurs
```

**AT-ID-08: Post-restart, error-embed message not re-processed**

```
WHO:   As the Orchestrator
GIVEN: The process has restarted (processed-messages set is empty)
       and thread "auth — review" contains:
       - Human message (msg-400): "@Dev Agent review requirements"
       - Bot error embed (response to msg-400): "Skill invocation failed..."
WHEN:  I re-read the thread history on startup
THEN:  msg-400 is NOT re-processed
       The error embed serves as the bot response in thread history
       The routing logic (FSPEC-RP-01) treats the error embed
       as a terminal response for msg-400
       A human must post a new message to retry
```

### 5.7 Dependencies

- Depends on: Phase 2 Discord connection (message events with IDs)
- Consumed by: [FSPEC-RP-01] (only non-duplicate messages reach routing)

---

## 6. End-to-End Flow Summary

Phase 4 extends the Phase 3 pipeline with three new steps (marked with **★**):

```
Message arrives in #agent-updates thread
  │
  ├─ ★ DEDUP CHECK (FSPEC-AC-03)
  │   Is this message ID already processed?
  │   ├─ YES → SKIP (silent)
  │   └─ NO → Record ID, continue
  │
  ├─ Is it our own message? → IGNORE (Phase 3, unchanged)
  │
  ├─ ROUTING (FSPEC-RP-01, Phase 3, unchanged)
  │
  ├─ ★ WORKTREE CREATION (moved from inside Skill Invocation)
  │   Create worktree before context assembly (§2.3 flow reorder)
  │
  ├─ CONTEXT ASSEMBLY (FSPEC-CB-01, Phase 3, modified*)
  │   * Layer 2 now reads from worktree (§2.3)
  │   * Requires worktree to exist first (flow reorder from Phase 3)
  │
  ├─ SKILL INVOCATION (FSPEC-SI-01, Phase 3, modified*)
  │   * Invokes Skill in existing worktree, captures output
  │   * Worktree creation moved to earlier step
  │   * Worktree cleanup moved to Artifact Commit step below
  │
  ├─ ★ ARTIFACT COMMIT & MERGE (FSPEC-AC-01)
  │   │
  │   ├─ Changes detected?
  │   │   ├─ YES → Commit in worktree → Merge to main
  │   │   │         ├─ Merge SUCCESS → Cleanup worktree
  │   │   │         └─ Merge CONFLICT → Retain worktree, post error
  │   │   └─ NO → Cleanup worktree (no commit)
  │   │
  │   └─ Continue to Discord posting regardless
  │
  ├─ ★ AGENT LOG (FSPEC-AC-02)
  │   Append entry to docs/agent-logs/{agent}.md
  │
  ├─ DISCORD POSTING (FSPEC-DI-01, Phase 3, unchanged)
  │
  └─ ROUTING LOOP (back to top for next message)
```

### 6.1 End-to-End Acceptance Test

**AT-E2E-P4-01: Complete message → commit → response loop**

```
WHO:   As the Orchestrator
GIVEN: A human posts "@Dev Agent review the requirements"
       in thread "auth — review requirements"
       and the message ID has not been seen before
       and `docs/auth/requirements.md` exists
WHEN:  I process the complete Phase 4 pipeline
THEN:  1. Message ID dedup check passes (new message)
       2. Routing identifies dev-agent (FSPEC-RP-01)
       3. Context Bundle assembled (FSPEC-CB-01)
       4. Worktree created, Skill invoked (FSPEC-SI-01)
       5. Skill modifies `docs/auth/requirements.md` in worktree
       6. Changes committed: "[ptah] Dev Agent: review requirements"
       7. Worktree merged to main (merge lock acquired/released)
       8. Worktree removed, branch deleted
       9. Agent log entry appended to `docs/agent-logs/dev-agent.md`:
          "| {timestamp} | completed | auth — review requirements | {sha} | review requirements |"
       10. Response posted as Amber embed to Discord
       11. Routing signal processed for next cycle
       The entire flow completes within 90 seconds
```

**AT-E2E-P4-02: Duplicate message after successful processing**

```
WHO:   As the Orchestrator
GIVEN: Message "msg-500" was fully processed (committed, merged, logged)
WHEN:  Discord re-delivers "msg-500"
THEN:  The message is silently skipped
       No duplicate Skill invocation occurs
       No duplicate commit is created
       No duplicate agent log entry is written
```

---

## 7. Open Questions (Resolved)

| # | Question | Resolution | Rationale |
|---|----------|------------|-----------|
| OQ-FSPEC-P4-01 | Should agent log entries be committed immediately (one commit per log entry) or accumulated as working tree changes? | **Option A: Accumulate as working tree changes.** Agent-logs reside at `docs/agent-logs/` (inside `/docs/`), so accumulated log changes are automatically included when the next artifact commit stages `/docs/` changes. No additional commits needed. | Backend engineer confirmed Option A is correct. With agent-logs inside `/docs/`, the "next artifact commit picks them up" mechanism works as designed. One extra commit per invocation just for logs would be excessive noise. Agent-logs are supplementary to Git commits, not a replacement. |
| OQ-FSPEC-P4-02 | Should the Layer 2 TOCTOU fix (§2.3 — read from worktree instead of main) be mandatory in Phase 4, or deferred? | **Option A: Mandatory in Phase 4.** The Phase 3 orchestration order (assemble-context → create-worktree → invoke) changes to (create-worktree → read-Layer-2-from-worktree → assemble-context → invoke). See §2.3 for the full flow change. | Backend engineer confirmed the TOCTOU window becomes a data integrity issue once artifacts are committed — stale Layer 2 reads could produce incorrect committed artifacts. The flow reorder is a necessary cost. The TOCTOU window (~100ms in Phase 3) was acceptable when artifacts were discarded; it is not acceptable when artifacts are committed to main. |

---

## 8. Traceability Summary

| FSPEC | Linked Requirements | Domain |
|-------|--------------------|--------|
| FSPEC-AC-01 | REQ-SI-05, REQ-SI-13, REQ-NF-05 | Artifact Commit & Merge |
| FSPEC-AC-02 | REQ-SI-06, REQ-NF-05 | Agent Log |
| FSPEC-AC-03 | REQ-SI-09, REQ-NF-03 | Idempotency |

---

## 9. Quality Checklist

### 9.1 Functional Specification Completeness

- [x] Every FSPEC has a unique ID following `FSPEC-{DOMAIN}-{NUMBER}` — 3 FSPECs: AC-01, AC-02, AC-03
- [x] Every FSPEC links to at least one requirement (`REQ-XX-XX`) — 6 requirements mapped across 3 FSPECs (§2.1)
- [x] Behavioral flows cover all decision branches — commit/merge/conflict paths (§3), log append (§4), dedup check (§5)
- [x] Business rules are explicit and testable — 23 business rules (AC-R1–R10, AL-R1–R7, ID-R1–R5)
- [x] Edge cases and error scenarios are documented — merge conflicts (including delete-modify, add-add, auto-merge), concurrent merges, orphaned worktrees, duplicate messages, restart recovery, partial-crash double-commit, pipe escaping, locked files
- [x] Acceptance tests are in Who/Given/When/Then format — 40 acceptance tests across 3 FSPECs + 2 E2E
- [x] No technical implementation details are prescribed — engineers have freedom to design the technical solution
- [x] Open questions resolved — OQ-FSPEC-P4-01 (Option A), OQ-FSPEC-P4-02 (Option A) — resolved in v1.1 per backend-engineer review

### 9.2 Traceability

- [x] All 6 Phase 4 requirements map to at least one FSPEC
- [x] No orphaned FSPECs — all 3 FSPECs map to at least one REQ
- [x] Phase 3 modifications are documented explicitly (§2.3)

### 9.3 Cross-Skill Reviews

- [x] Cross-skill review: backend-engineer — complete (v1.1: F-01 through F-06 addressed, Q-01 through Q-03 resolved, OQ-01 and OQ-02 resolved)
- [x] Cross-skill review: test-engineer — complete (v1.2: F-01 through F-06 addressed, Q-01 through Q-04 resolved, 9 new ATs added)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Initial functional specification for Phase 4 (Artifact Commits). 3 FSPECs covering all 6 Phase 4 requirements: FSPEC-AC-01 (Artifact Commit & Merge Lifecycle), FSPEC-AC-02 (Agent Log Append), FSPEC-AC-03 (Idempotent Message Processing). 30 acceptance tests + 2 end-to-end tests. 2 open questions flagged. |
| 1.1 | March 10, 2026 | Product Manager | Backend-engineer cross-skill review incorporated. **Changes:** (1) §2.3: Added worktree cleanup ownership transfer row and expanded TOCTOU row with explicit flow reorder. (2) AC-R7: Added fallback for thread names without em dash. (3) AC-R9: New business rule — merge lock and log-append lock synchronization constraint (F-03). (4) §3.4(f): Clarified committed-but-unmerged detection mechanism. (5) §3.5: Added force-push edge case, clarified branch-exists rationale, added stale-logs-in-worktree edge case. (6) AT-AC-14: New acceptance test for em-dash fallback. (7) All `agent-logs/` paths corrected to `docs/agent-logs/` (Q-03). (8) AL-R3, AL-R5: Updated to reference docs/agent-logs/ location and AC-R9 constraint. (9) ID-R3: Simplified rationale (F-06). (10) §6: Updated flow diagram with worktree creation reorder. (11) OQ-FSPEC-P4-01: Resolved as Option A. (12) OQ-FSPEC-P4-02: Resolved as Option A (mandatory). |
| 1.2 | March 10, 2026 | Product Manager | Test-engineer cross-skill review incorporated (REVIEW-FSPEC-PTAH-PHASE4 v1.0). All 6 findings addressed, 4 open questions resolved. **Changes:** (1) AC-R10: New business rule — Git auto-merge of non-overlapping changes accepted; semantic consistency delegated to review loop (Q-01 resolved). (2) AC-R3: Added merge lock timeout (10s default) and stated merge ordering is not guaranteed (F-03). (3) §3.5: Added 3 new edge cases — delete-modify conflict, new-file collision, auto-merge of non-overlapping changes (F-02, Q-02 resolved). Updated index.lock cross-reference to §3.6 (F-06). (4) AL-R7: New business rule — pipe character escaping in log entry fields (Q-04 resolved). (5) §4.6: Added locked-file retry error scenario (F-06). (6) ID-R5: Reworded to acknowledge non-deterministic Skill re-processing on restart (Q-03 resolved). (7) §5.4: Added partial-crash double-commit scenario as known limitation and error-embed restart interaction (F-04). (8) 9 new acceptance tests: AT-AC-15 (commit failure), AT-AC-16 (non-conflict merge failure), AT-AC-17 (merge lock timeout), AT-AC-18 (lock release on success), AT-AC-19 (concurrent merge/log append — AC-R9), AT-AC-20 (delete-modify conflict), AT-ID-08 (error-embed restart), AT-AL-09 (malformed log file), AT-AL-10 (locked log file). Total: 40 ATs + 2 E2E. |

---

*Gate: User reviews and approves this functional specification before handoff to engineering.*
