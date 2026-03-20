# Cross-Review: Backend Engineer — FSPEC (Round 5)

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.4](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 5 (re-review following Round 4 — no FSPEC update detected) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

The FSPEC is **unchanged at v1.4** since the Round 4 cross-review. No new version has been committed to the feature branch. All three Round 4 findings remain open:

- **F-01 (MEDIUM — blocking):** Worktree branch naming format `feat-{feature-name}/phase-{X}-{timestamp}` in §2.6.1 step 2b is technically infeasible in git. This finding was raised in Round 4 and has not been addressed. It continues to block TSPEC authoring.
- **F-02 (LOW — non-blocking):** Natural language dependency Form 3 has no acceptance test.
- **F-03 (LOW — non-blocking):** Test gate failure resume lacks developer guidance analogous to §2.6.2 merge conflict guidance.

No new findings were identified in this pass. The document content, structure, and acceptance tests are otherwise well-specified and production-ready.

---

## Round 4 Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 4) — MEDIUM | Worktree branch naming `feat-{X}/phase-{Y}-{ts}` is infeasible in git; slash separator conflicts with existing `feat-{X}` ref | ⬚ **Open — FSPEC not updated** |
| F-02 (Round 4) — LOW | Natural language Form 3 dependency syntax has no dedicated acceptance test | ⬚ **Open — FSPEC not updated** |
| F-03 (Round 4) — LOW | Test gate failure resume (§2.6.1 step 8 / AT-BD-01-02) lacks developer guidance analogous to §2.6.2 partial-merge advisory | ⬚ **Open — FSPEC not updated** |

---

## F-01 — MEDIUM (Carried from Round 4): Worktree branch naming infeasible in git

**Location:** FSPEC-BD-01 §2.6.1 step 2b

**Issue (unchanged from Round 4):**

§2.6.1 step 2b prescribes:

> "The worktree branch is named: `feat-{feature-name}/phase-{X}-{timestamp}`"

In git, branch refs are stored as filesystem paths under `.git/refs/heads/`. The existing feature branch `feat-{feature-name}` occupies the file `.git/refs/heads/feat-{feature-name}`. Creating a branch named `feat-{feature-name}/phase-{X}-{timestamp}` requires `.git/refs/heads/feat-{feature-name}` to be a **directory**. It is already a **file**. Git will reject the branch creation:

```
error: cannot lock ref 'refs/heads/feat-{feature-name}/phase-A-123456':
'refs/heads/feat-{feature-name}' exists; cannot create 'refs/heads/feat-{feature-name}/phase-A-123456'
```

Every worktree provisioning call (§2.6.1 step 2) fails. Parallel execution is entirely broken.

**Required fix (two options — unchanged from Round 4):**

1. **Remove the naming prescription** — the FSPEC §1 explicitly excludes "technical implementation choices." Replace step 2b with: "The TSPEC must define a worktree branch naming convention that avoids conflicts with the persistent feature branch name." *(Preferred — within FSPEC scope.)*

2. **Correct the separator** — change `/` to `-`: e.g., `wt-{feature-name}-phase-{X}-{timestamp}` or simply `phase-{X}-{timestamp}` (worktrees are local and short-lived; no feature-name prefix is required for uniqueness).

---

## F-02 — LOW (Carried from Round 4): Form 3 natural language dependency has no acceptance test

**Location:** FSPEC-PD-01 §2.1.2 step 4; §2.1.6 acceptance tests

**Issue (unchanged from Round 4):** Three dependency syntax forms are specified (linear chain, fan-out, natural language). AT-PD-01-01 through AT-PD-01-06 cover fan-out and error scenarios but none specifically exercise Form 3. Key behavioral questions are unresolved for test authors:

- Does `"Phase X depends on: Phase A"` (singular, no comma) parse correctly?
- Does `"Phase X depends on: Phase A, Phase B"` produce two edges (A→X and B→X)?
- Is `"Phase X depends on:"` (no following phases) treated as zero edges or ignored?

**Suggested fix (non-blocking):** Add AT-PD-01-07 covering the natural language form as proposed in Round 4:

```
AT-PD-01-07: Natural language dependency form
WHO:   As the Ptah orchestrator
GIVEN: A plan with phases A, B, C, D and a "Task Dependency Notes" section:
         "Phase C depends on: Phase A, Phase B"
         "Phase D depends on: Phase C"
WHEN:  The tech lead parses the plan
THEN:  The DAG contains edges: A→C, B→C, C→D
       No warnings are emitted
       Topological batching produces: Batch 1 = [A, B], Batch 2 = [C], Batch 3 = [D]
```

---

## F-03 — LOW (Carried from Round 4): Test gate failure resume lacks developer guidance

**Location:** FSPEC-BD-01 §2.6.1 step 8; AT-BD-01-02

**Issue (unchanged from Round 4):** §2.6.2 provides explicit guidance for the partial-merge resume scenario. AT-BD-01-02 describes a functionally identical post-test-gate-failure state (implementation merged to feature branch, plan not updated) — but no developer advisory exists for this path. A developer resuming after a test gate failure may silently re-implement over already-merged code, potentially causing conflicts on the second run.

**Suggested fix (non-blocking):** Add a note to §2.6.1 step 8 (or a new §2.6.3) advising developers that after a test gate failure, phases are re-implemented over already-merged code. Recommend the same mitigation as §2.6.2: manually mark phases as Done in the plan document before re-invoking if re-implementation would be unsafe.

---

## Recommendation

**Needs revision.**

The FSPEC has not been updated since Round 4. F-01 (MEDIUM) remains open and continues to block TSPEC authoring — parallel worktree creation will fail at every call under the current naming format.

**Required action:** Address F-01 before routing back for re-review. F-02 and F-03 remain non-blocking and may be addressed in the same pass or deferred.

| Finding | Severity | Round Raised | Status | Blocks TSPEC? |
|---------|----------|-------------|--------|---------------|
| F-01 — Worktree branch naming `feat-{X}/phase-{Y}-{ts}` infeasible in git | MEDIUM | Round 4 | ⬚ Open | **Yes** |
| F-02 — Form 3 natural language dependency has no acceptance test | LOW | Round 4 | ⬚ Open | No |
| F-03 — Test gate failure resume lacks developer guidance | LOW | Round 4 | ⬚ Open | No |
