# Cross-Review: Product Manager — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/010-parallel-feature-development/010-PROPERTIES-ptah-parallel-feature-development.md` |
| **Review Date** | March 14, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The PROPERTIES document is thorough and accurate. All 17 requirements are covered with no gaps, the negative properties section is well-derived from constraints and correctness invariants, and the gap documentation in §7 is honest and appropriately risk-rated. Three low-severity findings are noted below — two are easy fixes, one is a minor coverage note to consider.

---

## Findings

### F-01 — Missing §3.7 (Document Structure)
**Severity:** Low
**Location:** §3 Properties section headings

Section numbering skips §3.7. The outline reads: §3.1 Functional, §3.2 Contract, §3.3 Error Handling, §3.4 Data Integrity, §3.5 Integration, §3.6 Performance, **[missing §3.7]**, §3.8 Idempotency, §3.9 Observability. This is a formatting defect that will confuse readers cross-referencing sections. Fix by renumbering §3.8 → §3.7 and §3.9 → §3.8, or by inserting a placeholder §3.7 if a future category is planned.

---

### F-02 — PROP-SK-01 and PROP-NEG-10 Are Functionally Redundant
**Severity:** Low
**Location:** §3.1 (PROP-SK-01) and §4 (PROP-NEG-10)

PROP-SK-01 positively states that SKILL.md files "must contain no instructions to run `git checkout -b feat-`, `git checkout feat-` with pull, `git fetch origin && git checkout -b feat-`, or `git push origin feat-`." PROP-NEG-10 negatively states that SKILL.md files "must NOT instruct agents to run `git checkout`, `git checkout feat-` with pull, `git fetch origin && git checkout -b`, or `git push origin feat-`." These test the same invariant from opposite framings, covering the same test scenario (manual SKILL.md inspection). Consider either consolidating them into a single property or adding a brief clarifying note in PROP-NEG-10 distinguishing its scope from PROP-SK-01 (e.g., PROP-NEG-10 is the negative formulation of PROP-SK-01's first assertion; PROP-SK-02 covers the positive requirement for what SKILL.md *must* contain).

No requirement is under-covered; this is a clarity issue only.

---

### F-03 — REQ-FB-03 Push-Failure Commit Preservation Not Explicitly Tested
**Severity:** Low
**Location:** §3.1 PROP-FB-09, coverage matrix §5.1

REQ-FB-03's push-failure acceptance criteria specifies two outcomes: (1) the worktree is retained for manual resolution, and (2) **"the local feature branch commit is preserved."** PROP-FB-09 covers worktree retention and the `"push-error"` return status with `retainedWorktreePath` set, but does not explicitly assert that the local feature branch commit survives the failure path (i.e., that the merged commit remains reachable on the feature branch in the merge worktree even though the push failed). In practice, the retained worktree IS the feature branch, so the commit is structurally preserved — but adding an explicit assertion that the commit count on the local feature branch in the worktree is `N+1` after the push failure would make this auditable.

This is a minor addition to PROP-FB-09 or a new PROP-FB-11 and is not blocking.

---

## Clarification Questions

None. The document is unambiguous and well-sourced.

---

## Positive Observations

1. **Complete 17/17 requirement coverage.** Every P0 and P1 requirement has full property coverage with no gaps. The coverage matrix (§5.1) is accurate and matches the property listing.

2. **Negative properties section (§4) is excellent.** The 10 negative properties are well-derived from constraints (C-10-03 ref conflict, C-10-02 worktree isolation) and TSPEC correctness invariants. PROP-NEG-02 (no abort on conflict) and PROP-NEG-05 (no merge worktree before lock) in particular capture important behavioral correctness invariants that a positive-only property list would miss.

3. **Gap documentation (§7) is honest and well-rated.** The four documented gaps are accurately assessed as low-to-medium risk. The CI grep recommendation (Gap #4) for SKILL.md verification is a practical quick-win that addresses a genuine detection gap with a one-line assertion.

4. **PROP-DI-02 covers the OQ-03 open question resolution.** By explicitly testing that all artifact paths are staged without filtering by directory, the PROPERTIES document correctly locks in the "no docs/-only filter" product decision from REQ v1.2. This prevents accidental reversion by a future implementation.

5. **PROP-AB-06 (executePatternBResume parity)** is appropriately included and priority-rated P0. Resume invocations are an existing production code path; missing feature branch setup on resume would silently break users who trigger Pattern B continuations. The property is correctly sourced to [REQ-FB-01] and [REQ-AB-01].

6. **Test level distribution is appropriate.** The 0 E2E recommendation is well-justified. Unit/integration coverage at the ArtifactCommitter + NodeGitClient boundary is the correct tradeoff. E2E tests for multi-agent parallel scenarios would be fragile and slow without meaningful additional coverage.

---

## Recommendation

**Approved with minor changes.**

- F-01 (§3.7 numbering gap) must be corrected before the document is finalized — it is a structural defect.
- F-02 and F-03 are optional improvements. If addressed, they should be noted in the change log; if deferred, they may be tracked as low-priority follow-up items.

No product intent has been misrepresented, narrowed, or omitted. All acceptance criteria from the approved REQ v1.2 are reflected in the PROPERTIES document. The document is ready for Technical Lead approval pending the §3.7 correction.
