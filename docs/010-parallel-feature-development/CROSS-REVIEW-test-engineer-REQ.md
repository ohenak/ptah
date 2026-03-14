# Cross-Review: Test Engineer — 010-REQ-ptah-parallel-feature-development

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document Reviewed** | `docs/010-parallel-feature-development/010-REQ-ptah-parallel-feature-development.md` |
| **Document Version on Disk** | 1.0 (Draft) |
| **Routing Message Claimed Version** | 1.1 (In Review) |
| **Review Date** | March 14, 2026 |
| **Recommendation** | **Needs revision** |

---

## Executive Summary

The REQ is well-structured with clear user scenarios and a sensible domain decomposition (FB / AB / MG / SK). The majority of acceptance criteria use proper Who/Given/When/Then format with concrete, observable outcomes. However, there are **three blocking issues** that must be resolved before the document can be approved:

1. **The v1.1 changes described in the routing message are NOT present in the document on the feature branch.** The document on disk is v1.0 (Draft). The sub-branch naming conflict (BE finding F-01) is still in the document, the duplicate §8 heading is still present, and the P0 count still reads "10" despite listing 12 IDs.
2. **REQ-AB-04's THEN clause omits the failure cleanup path**, even though the description mentions it explicitly.
3. **REQ-MG-01 contains a non-observable outcome** ("no race condition corrupts the feature branch") that cannot be tested directly.

There are also medium-severity gaps in error-path acceptance criteria across several requirements. See findings below.

---

## Findings

### F-01 — Document not at v1.1: described fixes not applied (HIGH)

**Location:** Document header, REQ-AB-01, REQ-AB-04, §7.1, §9 Requirements Summary

The routing message states the document is at v1.1 with these changes applied:
- Sub-branch naming changed from `feat-{name}/{agentId}/{invocationId}` → `ptah/{name}/{agentId}/{invocationId}` in REQ-AB-01, REQ-AB-04, and §7.1
- Duplicate §8 heading renumbered to §9/§10/§11
- P0 count corrected from 10 → 12

**None of these changes are present in the document on the feature branch.** Specifically:

- REQ-AB-01 still reads: *"branch named `feat-{feature-name}/{agentId}/{invocationId}`"* and its example still shows `feat-parallel-feature-development/eng/a1b2c3d4`
- REQ-AB-04 THEN clause still shows: `feat-parallel-feature-development/eng/a1b2c3d4`
- §7.1 still shows: *"Two-tier branch strategy: `feat-{feature-name}` (persistent) → `feat-{feature-name}/{agentId}/{invocationId}` (ephemeral per-agent)"*
- The document has two `## 8.` sections (Risks and Requirements Summary)
- The P0 row says count "10" but lists 12 IDs

This means the critical F-01 finding from the BE review (git file/directory naming conflict that makes the feature branch un-checkable once sub-branches exist) is **still unresolved** in the document I am reviewing. **This is a blocking issue: the naming `feat-{name}/sub` cannot co-exist with branch `feat-{name}` due to how git stores refs as filesystem entries.**

> Per git's ref storage design, if `feat-parallel-feature-development` exists as a file in `.git/refs/heads/`, git cannot create `feat-parallel-feature-development/eng/a1b2c3d4` because it would require `feat-parallel-feature-development` to be a directory. This produces `fatal: cannot lock ref '...'`. The proposed `ptah/{name}/{agentId}/{invocationId}` prefix cleanly avoids this.

**Required action:** Apply all v1.1 changes, update version to 1.1, update status to In Review, and recommit to the feature branch before routing for re-review.

---

### F-02 — REQ-AB-04 THEN clause omits failure cleanup path (HIGH)

**Location:** REQ-AB-04 acceptance criteria

The **Description** reads: *"After an agent's sub-branch is merged to the feature branch (or if the merge fails), the sub-branch and its worktree must be cleaned up."*

However, the **THEN clause** only covers the success path:

> *"THEN: The worktree for the sub-branch is removed AND the sub-branch is deleted AND `git worktree list` no longer shows the worktree"*

There is no THEN clause for the failure path. This means:
- We cannot verify that cleanup occurs when the merge fails
- The failure cleanup behavior is in the description (informal) but not in the acceptance criteria (testable contract)
- REQ-MG-02 specifies that worktrees are **retained** on conflict — but REQ-AB-04 says cleanup happens "if the merge fails." These are contradictory unless "merge fails" means something different from "merge results in conflict." This ambiguity needs resolution.

**Required action:** Add a second AC scenario for the merge-failure path. Clarify whether "merge fails" (technical failure) and "merge conflict" (content conflict) are treated differently for cleanup purposes.

---

### F-03 — REQ-MG-01 contains a non-observable outcome (HIGH)

**Location:** REQ-MG-01 THEN clause

> *"AND no race condition corrupts the feature branch"*

"Corrupts" is not an observable, testable outcome. A test cannot assert "not corrupted" without defining what corruption looks like. This is a vague negative property.

**Required action:** Replace with an observable assertion, such as:
> *"AND the feature branch contains commits from both Agent A and Agent B, in the order their locks were acquired, with no commits lost"*

Or:
> *"AND `git log feat-parallel-feature-development` contains both Agent A's commit and Agent B's commit AND `git fsck` reports no object errors"*

---

### F-04 — Error path acceptance criteria missing for push and pull failures (MEDIUM)

**Location:** REQ-FB-03 (push), REQ-MG-03 (pull)

**REQ-FB-03:** The THEN clause only covers the success path ("pushed to origin", "remote branch reflects the merged commit"). There is no AC for what happens if `git push` is rejected (e.g., the remote has moved ahead due to a concurrent push from another Ptah instance). This is a realistic scenario under parallel execution.

**REQ-MG-03:** Similarly, the THEN clause only covers the success path. No AC for what happens if `git pull` fails (network error, authentication failure).

For both: it's unclear whether push/pull failures surface as Discord notifications (like REQ-MG-02 for conflicts) or are silently retried or cause the invocation to fail without developer notification. The risk table (R-10-04) notes "Merge-lock already handles timeouts" but there is no corresponding requirement.

**Required action:** Add THEN clauses for failure paths on REQ-FB-03 and REQ-MG-03. At minimum, specify: does the failure surface to the developer (how?), is it retried (how many times?), and is the worktree cleaned up on failure?

---

### F-05 — REQ-MG-02 Discord notification format is not observable (MEDIUM)

**Location:** REQ-MG-02 THEN clause

> *"a Discord message is posted with the conflict details and worktree path for manual resolution"*

"Conflict details" is vague. A test cannot assert that "conflict details" are present without knowing what they are. This is important because developers rely on this message to know how to resolve the conflict manually.

**Required action:** Specify the observable contents of the notification. For example:
> *"a Discord message is posted that includes: the conflicting file paths, the worktree path where the conflict is retained, and the command the developer should run to inspect the conflict"*

---

### F-06 — REQ-SK-01 THEN clause contains a non-observable outcome (MEDIUM)

**Location:** REQ-SK-01 THEN clause

> *"AND I understand that branch management is handled by the orchestrator"*

Agent comprehension ("I understand") cannot be tested. This is a documentation outcome, not a behavioral one.

**Required action:** Replace with an observable outcome:
> *"AND the SKILL.md file contains an explicit statement that branch management (git checkout, git branch, git push) is handled by the orchestrator and must not be performed by the agent"*

Additionally: the AC verifies the SKILL.md document content but does not verify behavioral compliance. Consider adding: *"AND an integration test invokes the skill in a worktree and verifies no git branch/checkout/push commands are executed by the skill"* — or explicitly note this is a doc-audit requirement only.

---

### F-07 — REQ-MG-01 missing lock timeout acceptance criteria (MEDIUM)

**Location:** REQ-MG-01, Risk R-10-04

Risk R-10-04 states: *"Merge-lock already handles timeouts."* But there is no requirement specifying the timeout behavior. This means:
- What is the timeout value?
- What happens when the timeout is reached — does the waiting merge fail, retry, or notify the developer?
- Is there an AC to test this timeout path?

Without a requirement, the lock timeout behavior is undocumented and untestable.

**Required action:** Either add an explicit timeout requirement in REQ-MG-01 (preferred) or add a new REQ-MG-04 for lock timeout behavior with a testable THEN clause.

---

### F-08 — REQ-PF-NF-01 measurement method is not operationally testable as written (LOW)

**Location:** REQ-PF-NF-01

> *"measured from merge-lock acquire to push complete, excluding network latency for git push"*

"Excluding network latency" is not operationally testable in a standard CI environment without a mock git remote. The test would need to either:
1. Use a local bare git repository as the remote (to eliminate network variance)
2. Time only the local operations and mock the push

The AC does not specify the test harness, making it ambiguous whether a test that uses a real remote would pass or fail depending on network conditions.

**Required action:** Add a note to the AC specifying the test harness assumption: *"measured using a local bare git repository as the remote to eliminate network variance"* — or relax to *"merge-lock acquire to merge commit complete (local), excluding push"*.

---

### F-09 — REQ-FB-01 missing AC for slug transformation correctness (LOW)

**Location:** REQ-FB-01

REQ-FB-01 states the feature name is derived from the Discord thread name using *"the same slug convention as Phase 9 ([REQ-AF-04])"* but provides no AC that verifies the slug transformation is applied correctly. The GIVEN provides a single happy-path example ("010-parallel-feature-development") that already looks like a valid slug.

Testability gap: what if the thread name contains uppercase letters, spaces, special characters, or exceeds git's branch name length limits?

**Required action:** Add a second AC scenario with a thread name that requires transformation (e.g., "My Feature #2 — Create TSPEC") to make the slug transformation behavior observable and testable.

---

### F-10 — REQ-PF-NF-03 AC does not define the "end result" (LOW)

**Location:** REQ-PF-NF-03

> *"A single-agent invocation produces the same end result (commits on feature branch, pushed to remote) as it would under the new architecture, with no additional configuration"*

The parenthetical "(commits on feature branch, pushed to remote)" partially defines the end result, but it's embedded in a description sentence rather than the THEN clause. The formal AC is:

> *"Recommendation: Approved with minor changes"* — wait, that's not in the requirement. Let me re-read.

The acceptance criteria field reads: *"A single-agent invocation produces the same end result (commits on feature branch, pushed to remote) as it would under the new architecture, with no additional configuration"*

This is the entire AC — it's a single sentence that serves as both context and verifiable outcome. It's not in Who/Given/When/Then format, unlike all other requirements. This makes it harder to write a specific test.

**Required action:** Reformat as Who/Given/When/Then with an explicit THEN clause, e.g.: *"THEN: The agent's commits appear on `feat-{feature-name}` AND `origin/feat-{feature-name}` reflects those commits AND `main` is unchanged"*.

---

## Clarification Questions

### Q-01 — Post-conflict resolution: manual re-trigger or automatic?

**Location:** REQ-MG-02

After a conflict is reported and the developer manually resolves it in the retained worktree, what is the expected next step? Does the developer:
- Manually run `git merge --continue` and `git push`?
- Run a Ptah command to re-trigger the merge?
- Get a Discord prompt to confirm resolution?

The current requirement says the worktree is retained "for manual resolution" but doesn't specify the resolution flow. This affects testability: the AC for the "resolved" state cannot be written without knowing the expected mechanism.

---

### Q-02 — Push failure handling (REQ-FB-03) vs. merge conflict notification (REQ-MG-02)

Are push failures (REQ-FB-03) and pull failures (REQ-MG-03) treated the same as merge conflicts for developer notification purposes? Or is there a different error escalation path? Knowing this would allow the error-path ACs in F-04 to be written concisely.

---

### Q-03 — Worktree TTL after merge failure (REQ-AB-04)

REQ-MG-02 says a conflict-retained worktree is kept for manual resolution. Is there a time-to-live (TTL) for retained worktrees, or are they retained indefinitely until the developer manually cleans them up? This affects REQ-PF-NF-02 (worktree disk usage) — the AC says "conflict-retained worktrees" are allowed, but doesn't bound their count or lifespan.

---

### Q-04 — Merge-lock persistence across Ptah restarts

Is the merge-lock referenced in REQ-MG-01 in-memory or file-based? If Ptah restarts while two agents are queued, does the lock reset? This is relevant for testing crash-recovery scenarios and for the lock timeout behavior gap in F-07.

---

## Positive Observations

- **Concrete examples throughout.** REQ-AB-01, REQ-AB-02, REQ-AB-03, and REQ-MG-02 all provide specific branch names, agent types, and invocation IDs in their GIVEN/THEN clauses. This makes writing tests significantly easier.
- **REQ-FB-04 is a model AC.** It uses a before/after observable assertion ("No commits appear on main that were not there before the invocation") that maps directly to a git-log comparison test.
- **REQ-AB-03 clearly specifies the isolation invariant.** The THEN clause's file-visibility assertions are unambiguous and directly testable with worktree file operations.
- **REQ-MG-02 worktree retention is explicit.** Keeping the worktree for manual resolution is a deliberate, observable outcome rather than an implicit fallback.
- **Risk table is thorough.** R-10-01 through R-10-05 map cleanly to requirements and show awareness of edge cases.
- **A-10-02 correctly flags merge-lock coupling as an assumption.** This is a good testability anchor — the TSPEC can verify this assumption by showing the lock mechanism is parameterizable on target branch.

---

## Recommendation: Needs Revision

The following **must-fix items** are required before the document can be approved:

| Priority | Finding | Fix Required |
|----------|---------|--------------|
| **BLOCKER** | F-01 | Apply v1.1 changes: rename sub-branch prefix to `ptah/`, fix duplicate §8, fix P0 count. Recommit and push. |
| **Must fix** | F-02 | Add failure-path THEN clause to REQ-AB-04; resolve contradiction with REQ-MG-02 |
| **Must fix** | F-03 | Replace "no race condition corrupts" with observable outcome in REQ-MG-01 |
| **Should fix** | F-04 | Add error-path ACs to REQ-FB-03 and REQ-MG-03 |
| **Should fix** | F-05 | Specify observable Discord notification contents in REQ-MG-02 |
| **Should fix** | F-06 | Replace "I understand" with observable SKILL.md content assertion in REQ-SK-01 |
| **Should fix** | F-07 | Add lock timeout AC to REQ-MG-01 or new REQ-MG-04 |
| **Nice to have** | F-08 | Specify test harness for REQ-PF-NF-01 measurement |
| **Nice to have** | F-09 | Add slug transformation edge-case AC to REQ-FB-01 |
| **Nice to have** | F-10 | Reformat REQ-PF-NF-03 as Who/Given/When/Then |

Please address the must-fix items and route the updated REQ back to QA for re-review. The should-fix items may be addressed at the author's discretion, but omitting them will add work during TSPEC authoring (the TSPEC will need to define these behaviors without a requirement to trace to).

---

*Reviewed by: Test Engineer | March 14, 2026*
