# Cross-Review: Engineer — REQ-FLF v2.3 (Feature Lifecycle Folders)

| Field | Detail |
|-------|--------|
| **Reviewer** | engineer |
| **Document Reviewed** | `docs/backlog/feature-lifecycle-folders/REQ-feature-lifecycle-folders.md` v2.3 |
| **Previous Review** | v2.2 — Needs revision (2 Medium) |
| **Date** | 2026-04-03 |
| **Recommendation** | **Approved with minor changes** |

---

## Resolution of Previous Findings

All findings and questions from the v2.2 review have been addressed:

| Previous Finding | Resolution |
|-----------------|-----------|
| F-01 (Medium): REQ-SK-03 description said "skill must promote", contradicting REQ-SK-08 | ✅ REQ-SK-03 description rewritten: skill detects and signals intent; "The skill never executes the promotion itself." REQ-SK-08 added to dependencies. |
| F-02 (Medium): REQ-WT-02 dangling worktree identification mechanism unspecified | ✅ REQ-WT-02 now specifies: use `git worktree list` to enumerate repo-attached worktrees, cross-reference against live Temporal workflow activity IDs, prune with `git worktree remove --force`. Acceptance criteria updated with two-part criteria (normal completion + startup cleanup). |
| Q-01: REQ-WT-05 "or reuses" ambiguity | ✅ Removed. REQ-WT-05 now requires "a newly created worktree" and explicitly states idempotency is handled by REQ-NF-02 two-phase folder check, not worktree reuse. |

---

## New Findings (v2.3)

### F-01 — REQ-SK-04 description still ambiguous on promotion ownership (Low)

REQ-SK-04 description reads: *"the responsible skill (or orchestrator) must promote the feature folder."*

This was not modified in v2.3. While REQ-SK-08 authoritatively assigns completion promotion to the orchestrator (and the acceptance criteria of SK-04 is correct), the "responsible skill (or orchestrator)" phrasing remains ambiguous. An engineer reading SK-04 in isolation would not know whether to implement promotion in the skill or the orchestrator.

This is non-blocking because REQ-SK-08 is the canonical authority and its dependency chain covers this case. REQ-SK-04 should also add REQ-SK-08 to its dependencies to make the cross-reference explicit.

**Suggested fix (non-blocking):** Update REQ-SK-04 description to mirror SK-03's fixed language: the orchestrator detects both sign-off signals and runs the completion promotion activity. Add REQ-SK-08 to SK-04's dependencies.

---

### F-02 — "workflow activity IDs" is imprecise Temporal terminology (Low)

REQ-WT-02 says: *"cross-reference each against live Temporal workflow activity IDs."*

In Temporal's data model, "activity IDs" are short-lived task identifiers within a single workflow execution. The concept intended here is **workflow executions** (identified by workflow ID + run ID), not activities. The cross-reference should be against active Temporal workflow executions (or equivalently, active workflow run IDs). Using "activity IDs" could cause confusion when implementing the startup cleanup query against the Temporal server.

**Suggested fix (non-blocking):** Replace "live Temporal workflow activity IDs" with "active Temporal workflow executions" (or "live workflow run IDs") to use accurate Temporal terminology.

---

## Positive Observations

- **All Medium findings from v2.2 are cleanly resolved.** REQ-SK-03 is now precise and unambiguous about responsibility boundaries. REQ-WT-02's dangling worktree identification is now fully specified and implementable. REQ-WT-05's worktree reuse ambiguity is eliminated with clear "fresh worktree" language.
- **The specification is now implementable end-to-end.** The feature resolver contract (REQ-SK-06), workflow state design (REQ-SK-07, REQ-WT-04), orchestrator promotion ownership (REQ-SK-08), and worktree lifecycle (REQ-WT-01–05) together form a coherent, implementable architecture with no blocking gaps.
- **The two-phase idempotency design (REQ-NF-02) is correctly separated from worktree lifecycle** — the REQ-WT-05 fix makes clear these are orthogonal concerns.
- **The `git worktree list` + Temporal cross-reference approach** in REQ-WT-02 is the correct crash-safe mechanism given the in-memory registry limitation.

---

## Recommendation

**Approved with minor changes.** Two Low-severity editorial findings (F-01, F-02) are non-blocking and do not require re-review. The document is approved for TSPEC creation.

The PM may address F-01 and F-02 in a future minor revision, but TSPEC work can begin immediately on the current v2.3 text.
