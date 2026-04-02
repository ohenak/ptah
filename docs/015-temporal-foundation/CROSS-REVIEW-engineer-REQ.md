# Cross-Review: Engineer Review of REQ-015 (Re-review)

| Field | Detail |
|-------|--------|
| **Document** | 015-REQ-temporal-foundation.md (v1.2) |
| **Reviewer** | eng (Senior Full-Stack Engineer) |
| **Date** | April 2, 2026 |
| **Review Scope** | Technical feasibility, architectural impact, implementability |
| **Previous Review** | CROSS-REVIEW-engineer-REQ.md (v1.1 review) |

---

## Prior Findings Resolution

All 3 Medium and 2 Low findings from the v1.1 review have been addressed:

| Finding | Severity | Resolution | Status |
|---------|----------|------------|--------|
| F-01: Activity heartbeat unspecified | Medium | REQ-TF-02 now specifies startToCloseTimeout (30min default), heartbeat interval (30s via subprocess liveness polling), heartbeatTimeout (120s) | Resolved |
| F-02: Fork/join failure policy incomplete | Medium | REQ-TF-06 specifies wait-for-all default, fail-fast with cooperative cancellation, no partial merges, full re-dispatch on retry | Resolved |
| F-03: Migration phase mapping undefined | Medium | REQ-MG-01 defines built-in v4→preset mapping, `--phase-map` for custom workflows, abort with clear error on unmapped phases | Resolved |
| F-04: Signal delivery guarantee | Low | REQ-TF-03 notes messaging layer reliability dependency, recommends at-least-once delivery | Resolved |
| F-05: Workflow versioning | Low | REQ-CD-04 specifies config snapshot at workflow creation, changes apply only to new workflows | Resolved |

All 3 clarification questions (Q-01 SDK version, Q-02 Worker topology, Q-03 Workflow ID collision) are also resolved in the updated text.

---

## New Findings

### F-07: Minor Inconsistency in REQ-TF-01 Acceptance Criteria (Low)

The description text specifies `ptah-feature-{slug}-{sequence}` as the workflow ID format, but the acceptance criteria still reads `ptah-feature-{slug}` (without the sequence number). These should match.

**Recommendation:** Update the acceptance criteria to use `ptah-feature-{slug}-{sequence}`.

---

## Positive Observations

1. **Thorough revision.** Every finding and question from the v1.1 review was addressed with specific, implementable details. The changelog (v1.2) traces each change to the original finding — excellent traceability.

2. **Fork/join failure policy is well-designed.** The "no partial merges, full re-dispatch" approach preserves the existing v4 invariant and avoids complex partial-recovery logic. The cooperative cancellation model aligns with Temporal's cancellation semantics.

3. **Migration strategy is robust.** The built-in mapping + `--phase-map` escape hatch + abort-on-unmapped pattern gives users a clear path for both standard and custom workflows.

4. **Workflow versioning via config snapshot** is the correct approach for Temporal. It avoids the complexity of `patched()`/`getVersion()` for config changes and aligns with Temporal's deterministic replay guarantees.

5. **In-process Worker** is the right call for v5.0. It matches the current operational model and avoids premature complexity.

---

## Recommendation

**Approved with minor changes** — Only one Low-severity finding (F-07: acceptance criteria ID format inconsistency). All prior Medium findings are fully resolved. This document is ready for TSPEC work.
