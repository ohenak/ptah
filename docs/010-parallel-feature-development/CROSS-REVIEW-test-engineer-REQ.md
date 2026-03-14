# Cross-Review: Test Engineer — 010-REQ-ptah-parallel-feature-development

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document Reviewed** | `docs/010-parallel-feature-development/010-REQ-ptah-parallel-feature-development.md` |
| **Document Version** | 1.1 (In Review) |
| **Review Date** | March 14, 2026 |
| **Review Round** | 2 (re-review after v1.1 revisions) |
| **Recommendation** | **Approved** |

---

## Re-Review Summary

This is a re-review of the REQ document following the v1.1 revisions submitted by the Product Manager. All 10 findings (F-01 through F-10) and all 4 clarification questions (Q-01 through Q-04) from the Round 1 review have been addressed. The document is ready for approval.

---

## Finding Resolution Verification

### F-01 (BLOCKER) — Sub-branch naming conflict: **RESOLVED** ✅

- REQ-AB-01 now specifies `ptah/{feature-name}/{agentId}/{invocationId}` naming with example `ptah/parallel-feature-development/eng/a1b2c3d4`
- REQ-AB-04 THEN clause uses `ptah/parallel-feature-development/eng/a1b2c3d4`
- §7.1 in-scope list correctly shows `ptah/{feature-name}/{agentId}/{invocationId}`
- New constraint C-10-03 explains the git ref file/directory conflict precisely and documents the `ptah/` prefix as the resolution
- Duplicate §8 heading fixed; document renumbered §8 Risks → §9 Requirements Summary → §10 Approval → §11 Change Log
- P0 count corrected to **12**, matching the listed IDs

---

### F-02 (Must fix) — REQ-AB-04 failure-path THEN clause: **RESOLVED** ✅

REQ-AB-04 now has two distinct AC scenarios:
- **Success path**: worktree removed, sub-branch deleted, `git worktree list` and `git branch --list` assertions included
- **Technical failure path**: worktree removed, sub-branch deleted, Discord notification with error details

The description now explicitly disambiguates "merge fails" (technical git error → cleanup) vs. "merge conflict" (content conflict → retain per REQ-MG-02). The former contradiction is resolved.

---

### F-03 (Must fix) — REQ-MG-01 non-observable outcome: **RESOLVED** ✅

The vague "no race condition corrupts" clause is replaced with:
> *"`git log --oneline feat-parallel-feature-development` shows commits from both Agent A and Agent B, in the order the lock was acquired AND neither commit is missing or overwritten"*

This is directly testable via `git log` output comparison.

---

### F-04 (Should fix) — Error-path ACs for push/pull failures: **RESOLVED** ✅

- **REQ-FB-03** now has a "Push failure path" scenario specifying Discord notification contents: feature branch name, git error message, and worktree path
- **REQ-MG-03** now has a "Pull failure path" scenario specifying Discord notification contents: feature branch name, git error message, and sub-branch name; worktree and sub-branch are cleaned up

---

### F-05 (Should fix) — REQ-MG-02 Discord notification format: **RESOLVED** ✅

REQ-MG-02 THEN clause now enumerates the observable Discord notification fields: (1) conflicting file paths, (2) absolute worktree path, (3) sub-branch name, (4) exact commands to resolve (`git merge --continue` or `git merge --abort`). Each field is individually testable.

---

### F-06 (Should fix) — REQ-SK-01 non-observable THEN clause: **RESOLVED** ✅

The "I understand" comprehension assertion is replaced with:
> *"the file contains no instructions to run `git checkout`, `git branch`, or `git push` AND the file contains an explicit statement that branch management (worktree creation, sub-branch creation, push to remote) is handled by the orchestrator and must not be performed by the agent"*

This is a document-content assertion testable by static analysis of SKILL.md files.

---

### F-07 (Should fix) — Lock timeout requirement: **RESOLVED** ✅

New **REQ-MG-04** (P1) specifies:
- Default timeout: 10,000ms (sourced from `AsyncMutex` default)
- THEN: Discord notification with feature branch name, timed-out sub-branch name, and indication the merge was not performed
- THEN: Sub-branch and worktree cleaned up
- THEN: No partial or corrupt commit on `git log feat-{feature-name}`

All timeout path outcomes are observable and testable.

---

### F-08 (Nice to have) — REQ-PF-NF-01 test harness: **RESOLVED** ✅

REQ-PF-NF-01 GIVEN now specifies: *"A local bare git repository is used as the remote (to eliminate network variance)"*. The performance test is now operationally reproducible.

---

### F-09 (Nice to have) — REQ-FB-01 slug transformation edge case: **RESOLVED** ✅

REQ-FB-01 includes a second AC scenario ("Slug transformation") with GIVEN: thread name "My Feature #2 — create TSPEC" and THEN: branch named `feat-my-feature-2` (lowercased, special characters replaced with hyphens, consecutive hyphens collapsed). This is testable with a string-transformation unit test.

---

### F-10 (Nice to have) — REQ-PF-NF-03 format: **RESOLVED** ✅

REQ-PF-NF-03 is now in full Who/Given/When/Then format. THEN clause: commits appear on `feat-{feature-name}`, `origin/feat-{feature-name}` reflects those commits, `main` is unchanged, no additional configuration required.

---

## Clarification Question Resolution Verification

| Question | Resolution |
|----------|------------|
| Q-01: Post-conflict resolution flow | Answered by A-10-05: developer manually runs `git merge --continue` or `git merge --abort` from retained worktree. No Ptah automation in Phase 10. Conflict resolution automation explicitly deferred. |
| Q-02: Push/pull failure notification consistency | Answered by REQ-FB-03 and REQ-MG-03 error-path ACs: both use Discord notification with specific fields, consistent with REQ-MG-02 pattern. |
| Q-03: Worktree TTL for conflict-retained worktrees | Answered by A-10-05: conflict-retained worktrees have no TTL and are retained indefinitely until developer manually removes them. REQ-PF-NF-02 acknowledges this explicitly. |
| Q-04: Merge-lock persistence across restarts | Answered by A-10-06: lock is in-memory (`AsyncMutex`), resets on Ptah restart. Crash recovery is out of scope for Phase 10. |

---

## Positive Observations (Round 2)

All Round 1 positives carry forward. Additional observations from v1.1:

- **C-10-03 is a model constraint.** It explains the git ref storage design, reproduces the error message (`fatal: cannot lock ref`), and directly references the mitigation. This is exactly the kind of constraint that prevents implementation surprises.
- **A-10-05 and A-10-06 are high-value assumptions.** By explicitly documenting that conflict resolution is manual and that the lock is in-memory (not persistent), the REQ shields the TSPEC author from designing phantom requirements. These are honest about Phase 10 scope.
- **REQ-MG-04 is well-structured.** The 10,000ms default is concrete, the error type (`MergeLockTimeoutError`) is named, and the no-partial-commit assertion provides a testable safety invariant.
- **Requirement count bookkeeping is correct.** P0=12, P1=5, total=17 — all verified by manual count.

---

## Recommendation: Approved

All must-fix, should-fix, and nice-to-have findings from Round 1 are resolved. The document is internally consistent, all acceptance criteria are in observable Who/Given/When/Then format, and the 17 requirements provide sufficient specification for TSPEC authoring without further clarification.

**The REQ document v1.1 is approved. The document status should be updated to Approved and the gate to FSPEC/TSPEC authoring is clear.**

---

*Reviewed by: Test Engineer (re-review) | March 14, 2026*
