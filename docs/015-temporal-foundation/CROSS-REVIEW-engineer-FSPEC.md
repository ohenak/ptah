# Cross-Review: Engineer Review of FSPEC-015 (Re-review)

| Field | Detail |
|-------|--------|
| **Document** | 015-FSPEC-temporal-foundation.md (v1.1) |
| **Reviewer** | eng (Senior Full-Stack Engineer) |
| **Date** | April 2, 2026 |
| **Review Scope** | Technical feasibility, behavioral flow correctness, edge case coverage |
| **Previous Review** | CROSS-REVIEW-engineer-FSPEC.md (v1.0 review) |

---

## Prior Findings Resolution

All 2 Medium and 3 Low findings from the v1.0 review have been addressed:

| Finding | Severity | Resolution | Status |
|---------|----------|------------|--------|
| F-01: Fork/join merge timing ambiguity | Medium | New BR-04a: fork/join Activities return without merging; Workflow orchestrates merges. FSPEC-TF-01 step 9 split into 9c (single-agent: merge) and 9d (fork/join: don't merge). FSPEC-TF-04 ROUTE_TO_USER section updated — no worktrees merge until all agents return LGTM. | Resolved |
| F-03: Migration fork/join contradicts BR-14 | Medium | FSPEC-MG-01 edge case updated: all subtasks reset to pending on migration, consistent with BR-14. Warning emitted to user. | Resolved |
| F-02: Merge conflict revert mechanism | Low | Acknowledged as TSPEC concern. | Resolved |
| F-04: Review recommendation parse location | Low | Acknowledged as TSPEC concern. | Resolved |
| F-05: Retry-After header Temporal constraint | Low | New BR-26: 429 retries happen inside the Activity, not via Temporal's retry policy. Classification table updated. Matches current v4 InvocationGuard behavior. | Resolved |

---

## New Findings

None.

---

## Positive Observations

1. **BR-04a is the right design.** Moving merge responsibility to the Workflow cleanly separates Activity concerns (execute agent, return results) from Workflow concerns (orchestrate merges, enforce invariants). The `forkJoin: boolean` dispatch parameter is a clean signal for the Activity to adjust its behavior.

2. **BR-26 (internal rate-limit retry) is well-reasoned.** Keeping 429 retries inside the Activity avoids Temporal's fixed-interval retry semantics and matches the proven v4 pattern. The classification table clearly distinguishes internal vs Temporal-level retry.

3. **Fork/join ROUTE_TO_USER flow is now unambiguous.** Steps 1-5 in the ROUTE_TO_USER section clearly state: no merges until all agents return LGTM, only ROUTE_TO_USER agents are re-invoked, successful agents' worktrees are held.

4. **Migration fork/join reset is the safe choice.** Resetting all subtasks with a user-facing warning balances data safety with transparency.

5. **26 business rules across 6 FSPECs provide comprehensive behavioral coverage.** These will translate directly to test cases in the TSPEC.

---

## Recommendation

**Approved** — No findings. All prior Medium findings are fully resolved. The behavioral flows are complete, consistent, and technically sound. This document is ready for TSPEC work.
