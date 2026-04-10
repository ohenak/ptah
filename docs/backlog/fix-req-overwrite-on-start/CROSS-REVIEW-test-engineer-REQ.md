# Test Engineer Cross-Review: REQ-fix-req-overwrite-on-start (v2.0)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v2.0 |
| **Previous Review** | v1.0 — Needs revision (1 High, 5 Medium, 3 Low findings) |
| **Date** | 2026-04-10 |
| **Recommendation** | **Approved with minor changes** |

---

## Resolution Verification

All High and Medium findings from the v1.0 review have been addressed. This section confirms disposition of each original finding.

| Original Finding | Severity | Status | Notes |
|-----------------|----------|--------|-------|
| TE-F-01: REQ-NF-01 latency flakiness | High | ✅ Resolved | REQ-NF-01 deprecated in v2.0 with clear rationale |
| TE-F-02: REQ-WS-04 "identically" untestable | Medium | ✅ Resolved | AC now specifies `req-review` as first activity, same sequence from `req-review` onward, `req-creation` absent |
| TE-F-03: "REQ exists" undefined | Medium | ✅ Resolved | REQ-PD-01 and REQ-PD-02 now define "exists" as regular file + size > 0 |
| TE-F-04: REQ-WS-03 unverifiable across retries | Medium | ✅ Resolved | REQ-WS-03 scoped to unit-testable orchestrator invariant; REQ-WS-06 covers workflow-definition static check |
| TE-F-05: REQ-NF-02 test matrix incomplete | Medium | ✅ Resolved | Expanded from 2 to 9 scenarios, each mapped to a requirement ID |
| TE-F-06: Discord reply content unpinned | Medium | ✅ Resolved | REQ-ER-03 pins substring contract: slug + `transient error during phase detection`, in invoking thread |
| TE-F-07: Negative properties under-specified | Low | ✅ Resolved | "Reply in invoking thread (not parent channel)" added to REQ-ER-03; deduplication covered by R-03 |
| TE-F-08: REQ-ER-02 log format untestable | Low | ✅ Resolved | Key-value format explicit; Logger string interface confirmed sufficient; REQ-NF-04 pins the interface |
| TE-F-09: REQ-PD-03 warning content unpinned | Low | ✅ Resolved | AC now specifies warning log must contain slug + both `docs/in-progress/<slug>/` and `docs/backlog/<slug>/` as literal substrings |

---

## Findings

### F-01 — REQ-PD-03 table row lists stale warning-case set "(B, C, D)" (Low)

**Severity:** Low

The `REQ-PD-03` row in the requirements table (Section 5.1) reads:

> "A warning is logged for all inconsistent-state cases (B, C, D)."

This is a residual from v1.1. The authoritative detailed AC below the decision table correctly says:

> "for all inconsistent-state cases **(A, B, C, H)**"

And the decision table itself marks Cases A, B, C as "Inconsistent — log warning" and Case H as "Mildly inconsistent — log warning." Case D is "Normal — no warning."

The table row is out of sync with the AC and the decision table. An engineer reading only the requirements table row (without the detailed AC) would produce the wrong behavior.

**Recommendation:** Update the REQ-PD-03 table row description to say "(A, B, C, H)" to match the decision table and detailed AC. One-line fix.

---

## Clarification Questions

None. All v1.0 clarification questions were either answered in the revision or are deferred by scope decision.

---

## Positive Observations

- **All nine REQ-NF-02 test scenarios are mapped to requirement IDs.** This is exactly the right pattern — the test matrix is derived from the requirement graph, not from a hand-picked subset. Any new requirement added in a future version will visibly create a gap in the matrix.
- **REQ-WS-03 / REQ-WS-06 split is well-designed.** Separating the unit-testable orchestrator invariant (fake TemporalClient + fake FileSystem) from the workflow-definition invariant (static inspection) means neither test is over-scoped. The TSPEC author has clear guidance on which test double to use for each.
- **REQ-ER-03 substring contract** (`transient error during phase detection`) gives the test a deterministic assertion target without freezing full message copy — precisely the right balance.
- **REQ-PD-01 and REQ-PD-02 "exists" definition** (regular file + size > 0) is unambiguous and directly translatable to a `FileSystem.stat + isFile + size` call pattern in the test fake.
- **REQ-PD-03 exhaustive decision table** (Cases A–H) eliminates the ambiguity from v1.0. Each row is a distinct test fixture. The general resolution rule below the table makes the algorithm implementable without reference to the individual rows.
- **Deprecation housekeeping** is done correctly — REQ-ER-01 and REQ-NF-01 are deprecated with rationale and retained for traceability, not silently removed.

---

## Recommendation

**Approved with minor changes.**

One Low-severity cosmetic finding (F-01): the REQ-PD-03 table row description says "(B, C, D)" where it should say "(A, B, C, H)". This is a one-line fix and is non-blocking. The detailed AC below the decision table is authoritative and correct — no behavior change is implied, only editorial alignment.

The document is ready to proceed to TSPEC authoring once F-01 is corrected. The TSPEC author must rely on the detailed decision table AC, not the table row summary, so this can also be fixed during the TSPEC cross-review cycle if the PM prefers to defer it.

---

*End of review*
