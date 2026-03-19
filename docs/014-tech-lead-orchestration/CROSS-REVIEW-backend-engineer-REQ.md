# Cross-Review: Backend Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 2 (re-review of v1.2) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved** |

---

## Re-Review Summary

This is a re-review of v1.2, revised in response to Round 1 findings from both the backend engineer and test engineer. All six backend-engineer findings (F-01 through F-06) and all test-engineer findings have been resolved. No new High or Medium findings identified.

---

## Prior Findings — Resolution Status

| Finding | Severity | Description | Status |
|---------|----------|-------------|--------|
| BE-F-01 | HIGH | Plan template format couldn't express fan-out dependencies | ✅ Resolved — REQ-PD-01 now explicitly requires fan-out syntax (`A → [B, C]`); REQ-NF-14-04 specifies template update as an in-scope deliverable |
| BE-F-02 | HIGH | Partial-batch failure merge semantics were undefined | ✅ Resolved — REQ-BD-07 now explicitly states no worktree branches (neither failed nor successful sibling phases) are merged when any phase in a batch fails; batch must be re-run in entirety |
| BE-F-03 | HIGH | Worktree creation mechanism was unspecified for a SKILL.md agent | ✅ Resolved — A-03, C-03, and REQ-BD-03 now uniformly specify the Agent tool's `isolation: "worktree"` parameter as the sole mechanism; no direct TypeScript API calls required from the tech-lead skill |
| BE-F-04 | MEDIUM | Integration path into `pdlc-dispatcher.ts` was unspecified | ✅ Resolved — REQ-TL-01 specifies `useTechLead: true` in `FeatureConfig` as the routing condition; REQ-NF-14-03 defines the backward-compatible fallback when the field is absent or false |
| BE-F-05 | LOW | R-05 risk severity appeared stale (Phase 10 was already committed) | ✅ Resolved — R-05 updated to Low likelihood with explicit note that Phase 10 infrastructure is committed |
| BE-F-06 | LOW | REQ-BD-08 plan status updates susceptible to concurrent write corruption | ✅ Resolved — REQ-BD-08 now includes an explicit serialization clause: "updates to the plan file must be applied one at a time to prevent concurrent write corruption" |

---

## New Findings

No new High or Medium findings identified in v1.2.

### F-01 — LOW: `tests/` path assignment may be incorrect for frontend test files

**Affected requirement:** REQ-PD-03

REQ-PD-03 maps `tests/` directory paths to `backend-engineer`. In a project where frontend components also have test files under `tests/components/` or `tests/ui/`, this heuristic would mis-assign those phases to backend-engineer. For the current Ptah codebase (which is primarily a Node/TypeScript backend with no frontend test directory), this is acceptable. However, if future features introduce frontend test files under `tests/`, the skill assignment logic would silently produce wrong assignments.

This is a Low/cosmetic finding. No change required before TSPEC authoring — the TSPEC author should be aware of this boundary when implementing the path-to-skill mapping.

**Recommended acknowledgment:** No REQ change needed; the TSPEC should document the `tests/` assignment heuristic as a known limitation with the recommended workaround (the user may override via REQ-TL-02 confirmation step).

---

## Clarification Questions

None. All Round 1 clarification questions (Q-01 through Q-03) have been resolved by the v1.1/v1.2 revisions.

---

## Positive Observations

All prior positive observations from Round 1 remain valid. Additional observations on the v1.1/v1.2 improvements:

- **REQ-BD-07's "no partial merges" rule** is architecturally correct. By keeping the feature branch in a clean state after a batch failure, it makes the expected test outcome after re-run deterministic. This is the right tradeoff between "wasted re-execution" and "non-deterministic partial state."
- **The `useTechLead` feature flag** (REQ-TL-01, REQ-NF-14-03) cleanly separates the new code path from the existing dispatcher. This design makes it straightforward to write regression tests for the existing sequential PDLC flow without mocking tech-lead infrastructure.
- **A-03's explicit reference to `isolation: "worktree"`** as a provided infrastructure primitive correctly keeps the SKILL.md design lightweight. The tech lead does not need to own worktree lifecycle management — it delegates that to the Agent tool — which reduces implementation surface area and test complexity.
- **REQ-PD-06's cycle detection** follows the same defensive pattern as REQ-PD-05 (graceful fallback). The combination of these two requirements means the tech lead degrades gracefully to sequential execution for any graph it cannot process, rather than crashing or producing incorrect batches.

---

## Recommendation

**Approved.**

All High, Medium, and Low findings from Round 1 have been fully resolved in v1.2. The single new Low finding (F-01, `tests/` path assignment) is non-blocking and appropriate to defer to the TSPEC. This REQ is ready to proceed to TSPEC authoring.
