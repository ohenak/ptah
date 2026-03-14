# Cross-Review: Backend Engineer — FSPEC-010

| Field | Detail |
|-------|--------|
| **Document Reviewed** | [010-FSPEC-ptah-parallel-feature-development](010-FSPEC-ptah-parallel-feature-development.md) |
| **Reviewer** | Backend Engineer |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01 — Feature Branch Worktree Lifecycle Is Unspecified (Medium)

**Location:** FSPEC-MG-01, Step 3

The merge step reads:
```
git merge --no-ff {sub-branch-name} (from feature branch worktree)
```

The parenthetical "(from feature branch worktree)" implies a git worktree checked out to the feature branch must exist at merge time. However, the FSPEC defines no lifecycle for this worktree: it is never created, located, or cleaned up in any of the four FSPECs.

**Current implementation context:** The existing `mergeInWorktree(worktreePath, branch)` in `NodeGitClient` runs `git -C {worktreePath} merge --no-ff {branch}`. To call this for a feature branch merge, a worktree path for the feature branch must be known at merge time. The main checkout (`this.cwd`) is the current merge target (main), and cannot be used directly as the feature branch checkout.

**Two valid approaches exist — the FSPEC should specify which:**
1. **Persistent feature-branch worktree** at a stable path (e.g., `{tmpdir}/ptah-features/{slug}`), created on feature branch setup and reused across invocations. The pull step (FSPEC-MG-01 step 2) would also happen in this worktree.
2. **Ephemeral feature-branch worktree** created specifically for each merge, then removed after the push. Simpler to reason about but adds two worktree operations per merge.

Without this clarified, the merge sequence in FSPEC-MG-01 cannot be fully implemented.

**Request:** Add a subsection to FSPEC-MG-01 (or FSPEC-FB-01) describing the feature branch worktree: its creation point, path convention, and lifetime.

---

### F-02 — Merge-Lock Scope: Global vs. Per-Feature (Medium)

**Location:** FSPEC-MG-01 BR-MG-01; REQ-MG-01

REQ-MG-01 states: "Only one merge may execute at a time **per feature branch**." BR-MG-01 says: "The merge-lock serializes **ALL** sub-branch merges to the feature branch within one Ptah instance."

These statements are slightly in tension. If Ptah is orchestrating two features simultaneously (feat-A and feat-B), the phrase "all sub-branch merges" implies a single global lock would serialize merges across features — agents on feat-B would block while feat-A's merge runs. A per-feature lock would allow feat-A and feat-B merges to proceed concurrently.

**Implementation implication:** The existing `AsyncMutex` is a single instance created at composition root. Per-feature locking would require a `Map<featureName, AsyncMutex>` (keyed by slug). This is a straightforward change but it is an architectural decision the FSPEC should make explicit.

**Request:** Clarify in BR-MG-01 whether the lock is a single global mutex or a per-feature mutex. If per-feature, note that the composition root needs a lock registry rather than a single lock instance.

---

### F-03 — Fallback Slug Discrepancy (Low)

**Location:** FSPEC-FB-01 Edge Cases; `feature-branch.ts`

FSPEC-FB-01 specifies the empty-slug fallback as `"feature"` → branch `feat-feature`. The existing implementation in `featureNameToSlug()` returns `"unnamed"` → branch `feat-unnamed`.

These two values are incompatible: once either convention is used in production, branches created under the old convention won't be found by the new lookup logic.

**Request:** Align the FSPEC fallback value with the existing `featureNameToSlug()` return value (`"unnamed"`), or note that the implementation must be updated to match the FSPEC (`"feature"`). Either is fine; the FSPEC and implementation just need to agree.

---

### F-04 — `docs/` Filter Interaction with Phase 10 (Low)

**Location:** FSPEC (all four FSPECs); `artifact-committer.ts` `filterDocsChanges()`

The existing `DefaultArtifactCommitter` applies a hard filter: only files under `docs/` are staged and committed. Non-docs files are warned and dropped. This filter is not referenced anywhere in the Phase 10 FSPEC.

If Phase 10 intends to support code artifact commits (e.g., backend-engineer implementing source files), the FSPEC should explicitly state whether the `docs/`-only filter is preserved, removed, or expanded. OQ-03 in the REQ remains open on this question.

If the `docs/`-only filter is preserved for Phase 10, the FSPEC is complete as-is. If it is removed, the `DefaultArtifactCommitter` must change and this should be called out as a modification in the FSPEC's integration point list.

**Request:** Add a clarifying statement in FSPEC-MG-01 (or a new edge case row) confirming whether the `docs/`-only artifact filter applies in Phase 10.

---

### F-05 — Empty-Commit Edge Case May Never Be Reached (Low)

**Location:** FSPEC-MG-01 Edge Cases — "Agent sub-branch has zero commits"

The FSPEC edge case states: "A `git merge --no-ff` of a branch at feature-branch HEAD creates an empty merge commit." In the current implementation, `DefaultArtifactCommitter` exits early (returns `{ mergeStatus: "no-changes" }`) when `artifactChanges.length === 0` or when the `docs/` filter reduces changes to zero. In these cases the `commitInWorktree` step is never reached, so the sub-branch is never populated with a commit, and the merge step is never attempted.

The sub-branch created for this invocation (at feature-branch HEAD) has zero commits, so the merge is effectively a no-op. The orchestrator should clean up the sub-branch and worktree on this path, which the FSPEC-AB-01 §4a success path handles correctly (though the actual path is "no-changes" rather than "merged").

This is a minor consistency note — the empty-merge-commit edge case may be unreachable via current committer logic — not a blocking issue. The cleanup behavior is correct either way.

**No change required.** This is informational context for the TSPEC author.

---

## Clarification Questions

### Q-01 — Is the merge performed in the main checkout or a feature branch worktree?

If approach (1) from F-01 is chosen (persistent feature-branch worktree), the pull step in FSPEC-MG-01 step 2 and the merge step in step 3 both operate on this dedicated worktree. If approach (2) is chosen (ephemeral), when is the ephemeral worktree created — before lock acquisition or after? Before-lock creation means the worktree exists during the full lock wait (potentially 10s); after-lock is more efficient but adds worktree overhead inside the lock.

---

## Positive Observations

- **Lock-release-before-notification ordering** (BR-MG-05) is architecturally sound and directly implementable with a `try/finally` pattern — the existing `artifact-committer.ts` already uses this pattern correctly.
- **Sub-branch naming** (`ptah/{feature}/{agentId}/{invocationId}`) is well-justified by C-10-03 and the existing `feature-branch.ts` already implements `agentSubBranchName()` with this exact pattern.
- **Pre-merge pull** silent no-op for new branches (BR-MG-06) aligns perfectly with the existing `pullInWorktree()` implementation that swallows `"couldn't find remote ref"` errors.
- **Conflict vs. technical failure distinction** (BR-MG-03) maps cleanly onto the existing `MergeResult = "merged" | "conflict" | "merge-error"` type — no new type variants are needed.
- **Slug derivation** in FSPEC-FB-01 aligns with the existing `extractFeatureName()` and `featureNameToSlug()` pure functions in `feature-branch.ts`.
- **FSPEC-SK-01** is well-scoped: removing git checkout/push instructions and adding worktree-context language is a targeted, low-risk change to skill files.
- **Discord notification content** is complete and actionable, including exact commands for developers to resolve conflicts and push failures.

---

## Recommendation

**Approved with minor changes.** Two medium-severity findings (F-01 and F-02) must be addressed before the TSPEC is written, as they affect the architectural shape of the implementation. The remaining findings are low-severity and can be clarified with minimal FSPEC changes. No blocking issues prevent the overall design from proceeding.
