# Cross-Review: Product Manager — TSPEC Review

| Field | Detail |
|-------|--------|
| **Document Reviewed** | `docs/010-parallel-feature-development/010-TSPEC-ptah-parallel-feature-development.md` |
| **Reviewed By** | Product Manager |
| **Date** | March 14, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The TSPEC is thorough, well-structured, and demonstrates strong alignment with the approved requirements. The requirement → technical component mapping (Section 8) is exemplary. All 17 requirements are traced to specific implementation components. Four findings are noted — two require action before implementation proceeds (F-01, F-02), one requires a product decision (F-03), and one is a recommendation (F-04).

---

## Findings

### F-01 — HIGH | REQ-MG-02 Contradiction Between REQ and TSPEC Behavior

**Location:** TSPEC Section 4.3 (`mergeInWorktree` docstring), Section 5.2 (step c), Section 6 (error table)

**Finding:** The TSPEC correctly retains the merge worktree in **conflict state** (MERGE_HEAD) rather than aborting the merge, so the developer can run `git merge --continue` or `git merge --abort` from the worktree. However, REQ-MG-02 acceptance criteria contains contradictory language:

> "The merge is **aborted** AND the worktree is retained at its path AND a Discord message is posted that includes: … (4) the commands the developer should run to resolve: `cd {worktree-path} && **git merge --continue**` (after editing conflicted files)…"

A merge that has been aborted cannot be continued. The TSPEC's behavior (retain in conflict state, do NOT abort) is the correct product behavior — it is the only path that allows `git merge --continue`. The REQ language "the merge is aborted" is incorrect.

**Required action:** Update REQ-MG-02 acceptance criteria to remove "the merge is aborted" and replace with "the merge is left in conflict state (MERGE_HEAD)". The TSPEC implementation is correct as written. The REQ needs to catch up to the correct behavior.

---

### F-02 — HIGH | OQ-01 Is a Product Decision, Not Just a Technical One — REQ-MG-03 Needs Update

**Location:** TSPEC Section 10, OQ-01; REQ-MG-03 acceptance criteria

**Finding:** OQ-01 is flagged as a likely MUST-FIX: `pullInWorktree` fails with "couldn't find remote ref" when the feature branch has never been pushed to remote. This is the **normal first-invocation state** for every new feature — the orchestrator creates the feature branch locally (`createBranchFromRef`) but never pushes it before the first merge attempt. The pull in step 6b then fails, blocking all first merges.

REQ-MG-03's pull failure acceptance criteria covers "network error, authentication failure" but not "remote branch does not exist yet". This is a product-level gap in the requirement.

**Product decision (PM owns this):** The correct behavior is to **skip pull if the feature branch has no remote tracking ref**. Rationale: if no one has pushed to the remote feature branch yet, there is nothing to pull. The first merge creates the initial remote ref. This is expected, not an error.

**Required action:**
1. Update REQ-MG-03 to add a third acceptance criteria path: **"New branch path"** — `WHO: As the orchestrator / GIVEN: The feature branch has no remote tracking ref (first invocation, branch never pushed) / WHEN: The pre-merge pull is attempted / THEN: The pull step is skipped (treated as 'already up to date') AND the merge proceeds normally`.
2. TSPEC Section 5.2 step b and Section 6 error table should document this skip behavior explicitly, distinguishing it from true pull failures (network, auth, diverged history).

---

### F-03 — MEDIUM | OQ-03 Requires an Explicit Product Decision Before Implementation

**Location:** TSPEC Section 10, OQ-03; REQ scope

**Finding:** OQ-03 asks whether the `docs/` filter in `ArtifactCommitter` should be removed in Phase 10 to allow code artifacts (src/, tests/) to reach the feature branch. This is explicitly deferred to PM/BE.

The product decision is non-trivial: Phase 10's user scenarios (US-11, US-12) describe parallel BE agents implementing PLAN steps — which are code changes. If the `docs/` filter is retained, BE agents implementing code will produce `no-changes` and their commits will not appear on the feature branch. This means **the primary use case for Phase 10 (parallel code implementation) is broken by default**.

**Options:**

| Option | Trade-offs |
|--------|-----------|
| **A. Remove `docs/` filter in Phase 10** | Enables code artifact commits. All tracked changes in the sub-branch are staged and committed. Risk: accidentally includes unintended files if agents stage broadly. Needed for US-11 to work end-to-end. |
| **B. Retain `docs/` filter in Phase 10; add Phase 11 item** | Simpler to implement now. Phase 10 delivers docs-only parallel work (US-12 works, US-11 partially works). Code implementation via parallel agents deferred. Must be documented as a known limitation in the REQ. |

**PM recommendation: Option A (remove the filter).** US-11 ("implement PLAN steps concurrently") is a P0 driver for this phase. Delivering Phase 10 without supporting code artifacts would leave the primary parallel workflow broken. The risk of accidentally staging unintended files is manageable with the existing sub-branch isolation model — each agent is in its own worktree.

**Required action before implementation:** PM will update REQ scope and REQ-PF-NF-03 to explicitly address code artifacts, OR explicitly document Option B as an accepted limitation. The TSPEC must not proceed to implementation with OQ-03 unresolved, as the answer changes which paths `ArtifactCommitter` exercises.

---

### F-04 — LOW | OQ-02: Recommend `--no-ff` for Merge Commit Strategy

**Location:** TSPEC Section 10, OQ-02

**Finding:** OQ-02 asks whether `mergeInWorktree` should use `--no-ff`. From a product perspective, `--no-ff` is the correct choice. Rationale: the feature branch is a PR review artifact — developers reviewing the PR should be able to see individual agent contributions (which agent produced which commit, in what order). Fast-forward merges collapse this history; `--no-ff` preserves it as distinct merge commits.

This aligns with US-10 ("developer reviews agent work before it reaches main") — the PR review is richer when agent work is traceable as discrete merge commits on the feature branch.

**Required action:** No REQ update needed. The TSPEC should document the choice of `--no-ff` and the rationale in the `mergeInWorktree` docstring or algorithm notes. Low severity — the choice can be made by the engineer; PM endorses `--no-ff`.

---

## Clarification Questions

### Q-01 — Feature Branch First Push Timing

**To:** Backend Engineer
**Question:** In the TSPEC's orchestrator flow (Section 4.6), the feature branch is created locally via `createBranchFromRef(featureBranch, "main")` but is never pushed to remote during orchestrator setup. The first push happens in `ArtifactCommitter` step 6d after the first merge. Is this intentional? Or should the orchestrator push the feature branch to remote immediately after `createBranchFromRef` to establish the remote tracking ref before the merge attempt?

The answer determines whether OQ-01's "skip pull if no remote ref" approach is needed, or whether the orchestrator can push eagerly and always have a remote tracking ref by the time `pullInWorktree` is called.

---

## Positive Observations

- **Section 8 (Requirement → Technical Component Mapping)** is exemplary. Every requirement is traced to specific modules and methods. No orphaned requirements, no unmapped components.
- **Section 6 (Error Handling)** table is comprehensive and clearly communicates product intent for each failure mode. The "Worktree Disposition" column is particularly useful for understanding the developer experience.
- **C-10-03 resolution** (`ptah/` prefix for sub-branches) is correctly derived from the product constraint and cleanly documented in both the REQ and TSPEC.
- **OQ flagging** demonstrates good engineering judgment. All three open questions are product-impacting and have been surfaced correctly to PM/BE rather than being resolved unilaterally.
- **`cleanupSubBranch` as best-effort** (log warning, don't throw) is the right product behavior — an orphaned sub-branch is operationally annoying but should not cause the overall invocation to fail.
- **Section 9.3 (`ContextAssembler` refactor)** correctly identifies and addresses the DRY opportunity. Public method backward compatibility is preserved — no product regression.
- **SKILL.md replacement language** (Section 4.8) strikes the right balance: removes the conflicting git commands, explains the worktree model clearly, and still allows agents to `git add`/`git commit` for code changes.

---

## Recommendation

**Approved with minor changes.**

Two items must be resolved before implementation begins:
1. **F-01** — PM will correct REQ-MG-02 to remove the "merge is aborted" contradiction. TSPEC behavior is correct.
2. **F-02** + **Q-01** — PM will update REQ-MG-03 to cover the "no remote tracking ref" case (skip pull). TSPEC must document this skip behavior in Section 5.2 and Section 6.
3. **F-03** — PM will make the docs/ filter decision explicit in the REQ and confirm to the BE team before implementation of `ArtifactCommitter` begins.

F-04 is advisory — engineer may proceed with `--no-ff` per PM's endorsement without a REQ update.
