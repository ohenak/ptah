# Cross-Review: Backend Engineer — FSPEC (Round 6)

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.5](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 6 (re-review following Round 5 — FSPEC updated to v1.5) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

FSPEC v1.5 resolves all blocking and non-blocking findings from Round 5 except one residual LOW-severity item (F-03). The document is production-ready and TSPEC authoring is unblocked.

| Finding | Severity | Round Raised | v1.5 Status |
|---------|----------|-------------|-------------|
| F-01 — Worktree branch naming `feat-{X}/phase-{Y}-{ts}` infeasible in git | MEDIUM | Round 4 | ✅ Resolved |
| F-02 — Form 3 natural language dependency has no acceptance test | LOW | Round 4 | ✅ Resolved |
| F-03 — Test gate failure resume lacks developer guidance analogous to §2.6.2 | LOW | Round 4 | ⚠ Partially addressed |

---

## Round 5 Findings — Resolution Status

### F-01 (MEDIUM) — RESOLVED ✅

**§2.6.1 step 2b** now reads:

> "The TSPEC must define a worktree branch naming convention that avoids conflicts with the persistent feature branch name (feat-{feature-name}). The specific format is a TSPEC concern."

The git-infeasible format `feat-{feature-name}/phase-{X}-{timestamp}` has been removed entirely. The delegation to TSPEC is correct: branch naming is a technical implementation detail, which the FSPEC §1 scope statement explicitly excludes. TSPEC authoring is unblocked.

### F-02 (LOW) — RESOLVED ✅

**AT-PD-01-08** has been added to the acceptance tests, covering Form 3 natural language dependency syntax:

```
GIVEN: "Phase C depends on: Phase A, Phase B" and "Phase D depends on: Phase C"
WHEN:  Tech lead parses
THEN:  DAG contains edges: A→C, B→C, C→D
       Produces Batch 1 = [A, B], Batch 2 = [C], Batch 3 = [D]
```

This resolves the behavioral questions about comma-separated multi-predecessor natural language form. The test is numbered AT-PD-01-08 (rather than the suggested AT-PD-01-07, which was taken by the linear chain test) — functionally equivalent.

### F-03 (LOW) — PARTIALLY ADDRESSED ⚠

**AT-BD-01-05** has been added as a new acceptance test covering test gate failure resume (re-runs all batch phases). This captures the behavioral contract and provides test authors with the expected outcome.

However, the developer advisory note recommended for §2.6.1 step 8 — warning that phases may have already been merged to the feature branch before the test gate fired, and recommending the same mitigation as §2.6.2 (manually marking phases Done before re-invoking if re-implementation would be unsafe) — was not added to the behavioral flow text.

**Impact:** Low. AT-BD-01-05 documents the correct observable behavior. A developer who reads only §2.6.1 without checking the acceptance tests could still be surprised on resume. The risk is operational (developer confusion), not correctness. This does not block approval or TSPEC authoring.

**Suggested fix (non-blocking, may be deferred):** Add a note to §2.6.1 step 8 analogous to the partial-merge advisory in §2.6.2:

> *"After a test gate failure, all phases in the batch have already been merged to the feature branch (step 7). On resume, all batch phases are re-implemented over existing code. If re-implementation would be unsafe, manually mark the at-risk phases as Done in the plan document before re-invoking."*

---

## Positive Observations

- **F-01 fix is clean and within scope.** Delegating worktree branch naming to TSPEC respects the FSPEC's stated boundary ("Not in this FSPEC: technical implementation choices"). The constraint is preserved ("must avoid conflicts with the persistent feature branch name") without over-specifying the format.
- **Sub-batch failure cascade behavior is well-specified.** §2.6.1 clearly states that a failing sub-batch cancels all remaining sub-batches, and defers the test gate and plan status update to the final sub-batch only. This is unambiguous.
- **Resume logic (FSPEC-BD-03 §2.8) is comprehensive.** Auto-detection, force re-run, and downstream Done-phase warnings are all specified with acceptance tests.
- **AT-PD-01-08 covers the critical edge cases for Form 3.** Comma-separated multi-predecessor, single-predecessor, and downstream chaining are all exercised.
- **Version history is present and accurate.** The v1.5 change entry correctly summarizes the F-01 resolution for traceability.

---

## Recommendation

**Approved with minor changes.**

All High and Medium findings are resolved. The only remaining open item is F-03 (LOW) — the missing developer advisory note in §2.6.1 step 8. This is a non-blocking editorial improvement that may be addressed in a future revision or deferred until TSPEC/PLAN authoring reveals operational pain.

**TSPEC authoring may proceed.** The behavioral contract, protocols, and acceptance tests are sufficient for a complete technical specification.
