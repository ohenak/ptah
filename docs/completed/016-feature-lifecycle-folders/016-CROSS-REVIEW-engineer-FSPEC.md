# Cross-Review: Engineer — FSPEC-FLF v1.1 (Feature Lifecycle Folders)

| Field | Detail |
|-------|--------|
| **Reviewer** | engineer |
| **Document Reviewed** | `docs/backlog/feature-lifecycle-folders/FSPEC-feature-lifecycle-folders.md` v1.1 |
| **Previous Review** | v1.0 — Needs revision (2 Medium, 1 Low, 1 Question) |
| **Date** | 2026-04-03 |
| **Recommendation** | **Approved** |

---

## Resolution of Previous Findings

All findings and questions from the v1.0 review have been addressed:

| Previous Finding | Resolution |
|-----------------|-----------|
| F-01 (Medium): Backlog→in-progress flow sequencing contradiction — skill vs. orchestrator attribution | ✅ Rewrote FSPEC-PR-01 Behavioral Flow to orchestrator-first model. Steps 1–3 now labeled "Orchestrator — pre-invocation setup." Orchestrator calls the resolver, detects the backlog condition, and runs the promotion before invoking the skill. The skill is never aware of the promotion (step 9: "The skill receives the promoted path from workflow state and is unaware that a promotion occurred"). AT-PR-01 updated accordingly. |
| F-02 (Medium): `PROMOTE_BACKLOG_TO_IN_PROGRESS` signal type incompatible with existing router | ✅ Removed entirely. The orchestrator-first model eliminates the need for any new routing signal type. No router extension required. Skills continue to emit only existing signal types (LGTM, ROUTE_TO_USER, etc.). |
| F-03 (Low): "Manual overrides" in FSPEC-MG-01 BR-02 undefined | ✅ BR-02 rewritten. Removed "manual overrides" claim. Now states explicitly: "the developer must correct it manually after the script completes by running `git mv` to move the folder to the correct lifecycle directory. The script does not provide a built-in override mechanism." |
| Q-01: "Current workflow run" scope for sign-off detection | ✅ BR-07 now specifies: scoped to a single Temporal workflow execution identified by `(workflowId, runId)`. Explicitly addresses `continue-as-new`: sign-off state is NOT automatically carried forward — the workflow must pass it in the `continue-as-new` payload if needed. |

---

## New Findings (v1.1)

None.

---

## Positive Observations

- The orchestrator-first model in FSPEC-PR-01 is clean and eliminates an entire class of complexity (no mid-activity pause, no router extension, no new signal types). Detection and execution are co-located in the orchestrator, which is the right boundary.
- BR-01 now reads "Both detection and execution of promotions are performed by the orchestrator" — this is a stronger and more precise statement than the v1.0 wording ("execution is always performed by the orchestrator") and fully aligns with the behavioral flow.
- The edge case for "Feature in backlog when engineer starts a non-review task" was updated to generalize: promotion triggers during pre-invocation setup for *any* engineer or tech-lead skill task, not just reviews. This closes a gap that v1.0 left ambiguous.
- The Open Questions section cleanly documents the divergence between REQ-SK-03 (skill-signals model) and FSPEC-PR-01 v1.1 (orchestrator-first), with clear guidance that the TSPEC author should implement per FSPEC-PR-01. The intent of REQ-SK-03 (feature is promoted before the skill writes artifacts) is preserved.
- BR-07's `continue-as-new` guidance gives the TSPEC author a concrete design decision: sign-off state must be explicitly carried in the CAN payload. This is directly implementable.
- The two-phase idempotency design, resolver contract, worktree lifecycle, and migration script flows remain strong — no regressions from the v1.0 review.

---

## Summary

All Medium findings from v1.0 have been fully resolved. The FSPEC is technically sound and implementable. No new findings. Approved for TSPEC creation.
