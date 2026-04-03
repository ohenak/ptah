# Cross-Review: Engineer — REQ-FLF v2.2 (Feature Lifecycle Folders)

| Field | Detail |
|-------|--------|
| **Reviewer** | engineer |
| **Document Reviewed** | `docs/backlog/feature-lifecycle-folders/REQ-feature-lifecycle-folders.md` v2.2 |
| **Previous Review** | v2.0 — Needs revision (3 High, 2 Medium) |
| **Date** | 2026-04-03 |
| **Recommendation** | **Needs revision** |

---

## Resolution of Previous Findings

All findings from the v2.0 review have been addressed:

| Previous Finding | Resolution |
|-----------------|-----------|
| F-01 (High): `ContextResolutionContext` redesign not specified | ✅ REQ-SK-06 defines the feature resolver behavioral contract; REQ-SK-07 requires resolved path stored in workflow state |
| F-02 (High): Hard-coded path at `feature-lifecycle.ts:1076` replacement unspecified | ✅ REQ-SK-07 explicitly replaces inline path expressions with state reads |
| F-03 (High): Promotion execution responsibility ambiguous | ✅ REQ-SK-08 clearly assigns promotion execution to the orchestrator |
| F-04 (Medium): In-document reference update scope underspecified | ✅ REQ-PR-04 now defines exact in-scope formats and explicit out-of-scope items |
| F-05 (Medium): Idempotency of NNN assignment underspecified | ✅ REQ-NF-02 defines two-phase check for partial-completion idempotency |
| Q-01: Slug collision behavior | ✅ REQ-SK-02 specifies: log warning, return first match by search order |
| Q-02: Who triggers completion promotion | ✅ REQ-SK-08 specifies: orchestrator detects both sign-off signals, runs promotion activity |
| Q-03: Stale file reference in C-02 | ✅ C-02 now includes the correct path `ptah/src/orchestrator/pdlc/cross-review-parser.ts:159` (confirmed in codebase) |

---

## New Findings (v2.2)

### F-01 — REQ-SK-03 description contradicts REQ-SK-08 (Medium)

REQ-SK-03 description reads: *"the skill must promote the feature to `docs/in-progress/` before proceeding with the review."*

REQ-SK-08 is unambiguous: *"Promotion execution... is performed exclusively by the Ptah orchestrator via a dedicated promotion activity — not by Claude skill agents."*

These two statements conflict. An engineer reading REQ-SK-03 in isolation would implement promotion logic inside the skill (agent), directly contradicting REQ-SK-08's exclusive ownership assignment. The acceptance criteria of REQ-SK-03 is fine (it describes the observable outcome: "The feature is promoted before my review artifacts are created"), but the description's wording assigns responsibility to the wrong component.

**Required fix:** Update REQ-SK-03's description to state that the skill detects the feature is in `backlog/` and signals promotion intent to the orchestrator, and that the orchestrator executes the promotion activity before invoking the skill — consistent with REQ-SK-08.

---

### F-02 — REQ-WT-02 "dangling worktree" identification mechanism unspecified (Medium)

REQ-WT-02 requires: *"If the orchestrator or skill crashes mid-execution, a cleanup sweep removes any dangling worktrees on next startup."*

The codebase has `ptah/src/orchestrator/worktree-registry.ts` with `InMemoryWorktreeRegistry`. This registry does not survive a process crash — on restart, the registry is empty. The requirement's acceptance criteria ("worktrees without an active skill invocation are cleaned up") is not verifiable from registry state after a crash.

To implement this requirement, a mechanism to identify worktrees-on-disk that are not associated with any current activity must be specified. Two viable approaches:
1. Use `git worktree list` to enumerate all worktrees attached to the repo on startup, and remove any not tracked by a live Temporal workflow.
2. Make the registry persistent (file-based or Temporal side-effect).

Without specifying which approach is required, the acceptance criteria cannot be implemented deterministically.

**Required addition:** Specify the mechanism for identifying dangling worktrees on startup — either via `git worktree list` comparison or a persistent registry.

---

## Clarification Questions

### Q-01 — REQ-WT-05 "or reuses" a promotion worktree

REQ-WT-05 says the promotion activity "creates (or reuses) a dedicated promotion worktree." Under what condition does reuse apply? If a promotion worktree from a previous crashed run persists on disk, should it be reused or cleaned up and recreated? Reusing a worktree from a partial run could put it in an inconsistent state; recreating it avoids that risk.

This is consistent with REQ-NF-02's two-phase idempotency, but the conditions for "reuse" vs "recreate" need to be clear.

---

## Positive Observations

- **v2.1 revisions are thorough and well-targeted.** All five previous findings and three questions were addressed precisely. REQ-SK-06, REQ-SK-07, and REQ-SK-08 together form a coherent and implementable architecture for feature path resolution and promotion execution.
- **Worktree isolation (WT domain) is the right design.** Giving each skill its own worktree eliminates the shared-mutable-filesystem problem for concurrent agents cleanly. REQ-WT-03 and REQ-WT-04 correctly propagate the DI principle — the resolver accepts the worktree root rather than hardcoding it.
- **REQ-WT-04 separation of `worktreeRoot` and `featurePath`** is a thoughtful design: when a promotion changes the feature path (backlog → in-progress), only `featurePath` in state needs updating, not the worktree root. This avoids recalculating all activity paths after a promotion.
- **C-02 now correctly lists all three affected code locations**, including the actual `pdlc/cross-review-parser.ts:159` path (verified in codebase).
- **REQ-NF-02 two-phase idempotency** correctly handles the partial-completion race by checking for destination folder existence before re-assigning NNN.

---

## Recommendation

**Needs revision.** Two Medium findings must be addressed:

- **F-01**: REQ-SK-03 description must be reworded to align with REQ-SK-08's authoritative ownership assignment (orchestrator executes promotion; skill signals intent).
- **F-02**: REQ-WT-02 must specify the mechanism for identifying dangling worktrees after a crash (e.g., `git worktree list` or persistent registry).

These are targeted fixes to the v2.2 additions; the core v2.1 architecture (resolver service, workflow state design, orchestrator-owned promotion) is solid and does not require further changes.

**The author must address F-01 and F-02, then route the updated REQ back for re-review.**
