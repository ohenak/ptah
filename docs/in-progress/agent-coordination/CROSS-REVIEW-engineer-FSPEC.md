# Cross-Review: Engineer — FSPEC-AC Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer |
| **Document** | [FSPEC-agent-coordination.md](FSPEC-agent-coordination.md) |
| **Version Reviewed** | 1.0 |
| **Date** | April 6, 2026 |
| **Recommendation** | **Needs revision** |

---

## Positive Observations

- **Clean separation between orchestrator and workflow layers.** FSPEC-MR-01 correctly places the message parsing and signal dispatch in the orchestrator layer, while FSPEC-MR-02/03 describe in-workflow behavior. This aligns with the existing architecture where Discord message handling happens in `start.ts` and workflow logic lives in `feature-lifecycle.ts`.
- **BR-04 (implicit workflow check via signal delivery)** is technically sound — Temporal's SDK throws `WorkflowNotFoundError` on signal to a non-existent workflow. This avoids TOCTOU race conditions and is the idiomatic Temporal approach.
- **FSPEC-MR-02's cascade-blocking rule (BR-02)** is well-defined and directly maps to a `wf.condition()` guard in the workflow loop. The dequeue conditions are unambiguous and testable.
- **FSPEC-MR-03's skip_if handling during cascade (edge case)** is correct — reusing `evaluateSkipCondition()` for cascade phases is consistent with the main loop behavior at line 1291 of `feature-lifecycle.ts`.
- **FSPEC coverage decisions are sound.** All 7 WB/NF requirements are genuinely direct-to-TSPEC (no branching logic), and the 3 MR FSPECs cover the requirements that have real behavioral complexity.

---

## Findings

### F-01 — Medium: Cascade revision loop does not specify how to identify the creation phase for each cascaded review

**FSPEC:** FSPEC-MR-03, Step 5f, BR-03

FSPEC-MR-03 BR-03 states: _"The target of the revision is determined by the review phase's configuration (e.g., which creation phase it reviews)."_ However, `PhaseDefinition` has no explicit "creation phase" field — the current codebase uses an **implicit positional convention**: the creation phase is `workflowConfig.phases[reviewIndex - 1]` (line 1324 of `feature-lifecycle.ts`).

In the normal main loop, this works because phases execute in array order — the phase immediately before a review is always the creation phase. But in the cascade, review phases are **extracted from the array and executed out of their normal sequence**. The cascade collects only `type: "review"` phases, skipping creation/approved/implementation phases between them.

Example showing why this matters:

```
Phase array: pm-create(0) → pm-review(1) → approved(2) → eng-tspec(3) → eng-review(4) → qa-review(5)

Cascade after ad-hoc PM revision:
  Cascades: pm-review(1), eng-review(4), qa-review(5)
```

For each cascaded review phase, the creation phase must be derived from the **original array position**, not from the cascade collection:
- `pm-review(1)` → creation phase is `pm-create(0)` (index 1-1=0) ✅
- `eng-review(4)` → creation phase is `eng-tspec(3)` (index 4-1=3) ✅
- `qa-review(5)` → creation phase is `eng-review(4)` (index 5-1=4) — this is **another review phase**, not a creation phase ⚠️

The last case reveals a broader issue: the "previous phase in array" convention doesn't always yield the correct creation phase, even in the main loop. But for the cascade, this ambiguity becomes a product-level decision: if `qa-review` requests a revision, who should address it? The phase at index 4 (`eng-review`)? Or should `qa-review` have an explicit `creationPhase` reference?

**Required fix:** FSPEC-MR-03 must specify one of:
1. **Use the same positional convention as the main loop** (`phases[reviewIndex - 1]` in the original config array), acknowledging that this may yield a non-creation phase in some configs. Add a business rule that the workflow config must structure review phases immediately after their corresponding creation phase for the cascade to work correctly.
2. **Require the workflow config to declare an explicit `creationPhase` field on review phases**, which the cascade uses. This is cleaner but adds a config schema change.

Either option is acceptable — but the FSPEC must be explicit rather than deferring to "standard revision loop" which has implicit assumptions.

---

### F-02 — Low: FSPEC-MR-03 step 5f uses "returns 'Needs revision'" without explaining the detection mechanism

**FSPEC:** FSPEC-MR-03, Step 5f

The phrase _"If the cascade phase returns 'Needs revision'"_ could confuse the engineer because the standard routing signal types are `LGTM`, `TASK_COMPLETE`, `ROUTE_TO_USER` — there is no `Needs revision` routing signal. In practice, review phases return the recommendation text (e.g., `"Needs revision"`) as the `routingSignalType` string, and `mapRecommendationToStatus()` (line 462 of `feature-lifecycle.ts`) maps it to `"revision_requested"`.

The step says to "enter the standard revision loop" which correctly delegates to the existing `runReviewCycle` logic. But adding a parenthetical like _(i.e., the review cycle determines the artifact needs revision via the existing recommendation parsing)_ would remove ambiguity for implementability.

Not blocking — the engineer can read `runReviewCycle` to understand the mechanism.

---

### F-03 — Low: FSPEC-MR-01 step 4 specifies display_name matching beyond REQ scope

**FSPEC:** FSPEC-MR-01, Step 4

The REQ Assumptions section states: _"Mapping from human-readable @mention text (e.g., @product-manager) to agent ID (e.g., pm) is performed by the system at message receipt time and is not a product-level concern."_ The FSPEC adds matching against `agent.display_name`, which is a system-level design decision the REQ explicitly deferred.

This is helpful specificity for the engineer — `RegisteredAgent.display_name` is always populated (falls back to `id`), so the matching is straightforward. But it slightly extends beyond the FSPEC's intended product scope.

Not blocking — the engineer can implement or adjust as appropriate in the TSPEC.

---

## Clarification Questions

**Q-01:** FSPEC-MR-03 BR-07 states _"the workflow resumes its normal sequential phase execution from wherever it left off."_ What does "left off" mean precisely? If the workflow had completed phase 3 of 5 when the ad-hoc signal arrived, and the ad-hoc revision + cascade completes, does the workflow resume at phase 4 (the next unexecuted phase)? Or does it re-execute phase 3 since the ad-hoc may have changed the artifacts phase 3 produced?

The main loop's phase cursor (`state.currentPhaseId`) is not modified by the cascade (per BR-07). So if the ad-hoc signal arrives BETWEEN phases (during the phase transition check), the cursor already points to the next phase. But if it arrives DURING a phase (signal enqueued while activity is running), the cursor still points to the current phase, which will have already completed by the time the queue is processed. The FSPEC should clarify: after queue processing at a phase transition, the workflow advances to the next phase as normal, and the cascade does NOT cause any already-completed phase to re-execute.

---

## Recommendation

**Needs revision.** One Medium-severity finding (F-01) must be addressed: the cascade's creation-phase identification mechanism for revision loops needs to be explicitly specified in FSPEC-MR-03 rather than deferred to "standard revision loop." The two Low findings and the clarification question are non-blocking.

After addressing F-01, route the updated FSPEC back for re-review.
