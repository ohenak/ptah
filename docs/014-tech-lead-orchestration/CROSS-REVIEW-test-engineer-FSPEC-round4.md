# Cross-Review: Test Engineer — FSPEC (Round 4)

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.4](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 4 (re-review of v1.4) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All three findings from the Round 3 TE review (one Medium, two Low) are resolved cleanly in v1.4. The batch split dependency-violation rejection rule and its two acceptance tests (AT-TL-01-08 and AT-TL-01-09) are well-executed. AT-TL-02-03 is now at full parity with AT-TL-02-02. The §2.4.1 pre-flight status qualifier is unambiguous.

One new Medium finding is raised in this round — the worktree branch naming format prescribed in §2.6.1 step 2b (`feat-{feature-name}/phase-{X}-{timestamp}`) creates a git namespace collision with the existing `feat-{feature-name}` branch, which means every worktree creation will fail and all integration tests that exercise the batch execution lifecycle will fail at setup. This corroborates and extends BE Round 4 F-01 with a testability-specific analysis. Two new Low findings cover a missing acceptance test for the Form 1 (linear chain) parsing path and a missing AT for the test gate failure resume scenario.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 3) — MEDIUM | §2.4.2(c) batch split has no dependency-violation rejection rule and no acceptance tests | ✅ Resolved — rejection rule with exact message template added to §2.4.2(c); AT-TL-01-08 (valid split) and AT-TL-01-09 (dependency-violating split rejected) added; rejected splits do not consume modification cycles (§2.4.3) |
| F-02 (Round 3) — LOW | AT-TL-02-03 THEN clause underspecified relative to AT-TL-02-02 | ✅ Resolved — AT-TL-02-03 now specifies: failure message text, pre-flight status line content ("Fail — ArtifactCommitter two-tier merge capability unavailable"), and sequential execution outcome; fully parity with AT-TL-02-02 |
| F-03 (Round 3) — LOW | §2.4.1 item 2 "only shown when parallel mode is active" ambiguous for pre-flight-failure case | ✅ Resolved — §2.4.1 item 2 now reads "shown when pre-flight ran and completed (regardless of whether it passed or failed)" with an explicit NOT-shown exception for parse-time sequential fallback mode |

---

## New Findings

### F-01 — MEDIUM: §2.6.1 step 2b prescribes a git-infeasible worktree branch naming format, rendering all batch execution lifecycle tests untestable

**Location:** FSPEC-BD-01 §2.6.1 step 2b

**Issue:** §2.6.1 step 2b states:

> "The worktree branch is named: `feat-{feature-name}/phase-{X}-{timestamp}` (where {X} is the phase letter and {timestamp} is a short unique suffix)."

This naming format is infeasible in git. The feature branch `feat-{feature-name}` must already exist on the remote by the time any worktree is created (validated by FSPEC-TL-02 Check 1). Git stores branch refs as files under `.git/refs/heads/`. The branch `feat-{feature-name}` is stored as the file `.git/refs/heads/feat-{feature-name}`. Creating `feat-{feature-name}/phase-{X}-{timestamp}` requires the filesystem path `.git/refs/heads/feat-{feature-name}/phase-{X}-{timestamp}`, which requires `.git/refs/heads/feat-{feature-name}` to be a **directory**. Since it is already a **file**, git rejects the creation:

```
error: cannot lock ref 'refs/heads/feat-{feature-name}/phase-A-123456':
'refs/heads/feat-{feature-name}' exists; cannot create 'refs/heads/feat-{feature-name}/phase-A-123456'
```

**Testability impact (why this blocks TSPEC authoring):**

The batch execution lifecycle (FSPEC-BD-01) runs worktree provisioning (step 2) before any agent dispatch. Every acceptance test that exercises the batch execution lifecycle depends on step 2 succeeding:

- **AT-BD-01-01** (complete batch lifecycle, happy path): Fails at step 2 — worktree creation for Phase B and Phase C fails before any agent is dispatched.
- **AT-BD-01-02** (test gate failure): Fails at step 2 — worktrees for Batch 2 phases cannot be created.
- **AT-BD-01-03** (plan update is last step): Fails at step 2 — cannot reach the merge/test/update steps.
- **AT-BD-01-04** (merge conflict resume): Fails at step 2 — worktrees for Phases D, E, F cannot be created.
- **AT-BD-02-01** through **AT-BD-02-04** (failure handling and sub-batch cascade): All fail at step 2.

In total, **9 of the 9 batch execution lifecycle acceptance tests** have an unresolvable failure at the worktree provisioning step under the current naming convention. No integration test for parallel batch execution can be written that passes.

**Pre-flight Check 1 makes this a guaranteed failure chain:** Pre-flight verifies the feature branch exists on remote *before* the confirmation is shown. This means the naming collision is always guaranteed to exist when parallel execution is attempted. Sequential fallback (which skips worktree provisioning) would pass, but parallel mode — the primary test target — cannot be tested at all.

**Required fix (two options, matching BE Round 4 F-01):**

1. **Remove the naming format from the FSPEC** (preferred): §1 explicitly excludes "technical implementation choices" as out of scope. The specific branch naming format is a TSPEC concern. Remove step 2b's naming prescription and add: "The TSPEC must define a worktree branch naming convention that avoids conflicts with the persistent feature branch." The TSPEC then specifies a feasible format (e.g., `wt-{feature-name}-phase-{X}-{timestamp}` using hyphens).

2. **Correct the naming format**: Replace the `/` separator with `-`: `feat-{feature-name}-phase-{X}-{timestamp}` or a simpler `wt-phase-{X}-{timestamp}`.

Option 1 is strongly preferred — it is consistent with the FSPEC's stated scope and moves the technically constrained decision to the TSPEC where it belongs.

---

### F-02 — LOW: Form 1 (linear chain) dependency syntax has no dedicated acceptance test; combined Form 1 + Form 3 gap

**Location:** FSPEC-PD-01 §2.1.2 step 4; §2.1.6 acceptance tests

**Issue:** §2.1.2 step 4 identifies three dependency syntax forms, of which two are "required" (Forms 1 and 2) and one is "also accepted" (Form 3). AT-PD-01-01 (the sole parser-level AT) tests only Form 2 (fan-out syntax):

```
AT-PD-01-01: Uses "A → [B, C]" (fan-out, Form 2)
```

**Form 1 (required — linear chain) has no AT.** A Form 1 declaration `A → B → C` encodes two edges (A→B and B→C) using an implicit linear chain without brackets. This is a distinct parsing path from Form 2 (which requires brackets for multi-target declarations). A regression in Form 1 parsing — for example, interpreting `A → B → C` as a single edge A→C, or mishandling the chained arrow — would not be caught by any acceptance test.

**Form 3 (accepted — natural language) has no AT.** This is consistent with BE Round 4 F-02. The following edge cases are unspecified:
- `"Phase X depends on: Phase A"` (single dependency, no comma) — does this produce one edge?
- `"Phase X depends on: Phase A, Phase B"` (multiple dependencies) — does this produce two edges (A→X and B→X)?
- `"Phase X depends on:"` (no following phases) — is this a matching-but-empty Form 3 line, or a non-matching line?

**Suggested fix (Low — non-blocking):** Add two acceptance tests:

```
AT-PD-01-07: Form 1 — linear chain dependency parsing
WHO:   As the Ptah orchestrator
GIVEN: A plan with phases A, B, C, D and a "Task Dependency Notes" section:
         "A → B → C → D"   (linear chain: B depends on A, C on B, D on C)
WHEN:  The tech lead parses the plan
THEN:  The DAG contains edges: A→B, B→C, C→D (three edges from one declaration)
       No warnings are emitted
       Topological batching produces: Batch 1 = [A], Batch 2 = [B], Batch 3 = [C], Batch 4 = [D]
```

```
AT-PD-01-08: Form 3 — natural language dependency parsing
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

### F-03 — LOW: Test gate failure resume path lacks an acceptance test analogous to AT-BD-01-04

**Location:** FSPEC-BD-01 §2.6.1 step 8; AT-BD-01-02; §2.6.2

**Issue:** AT-BD-01-02 specifies what happens immediately after a test gate failure:

```
THEN:  "Test gate failed after Batch 2" is posted with the failing test names
       Execution halts; Batch 3 does not start
       Plan status is NOT updated for Batch 2
       The feature branch has the Batch 2 implementation changes (merges succeeded)
       but the plan document still shows those tasks as not done
```

This is the end of AT-BD-01-02's THEN clause. The resume scenario that follows — the developer fixes the failing tests and re-invokes the tech lead — is not covered by any acceptance test. In contrast, the merge conflict scenario has AT-BD-01-04 (merge conflict resume re-runs all batch phases), which explicitly asserts:

- Which phases are re-implemented (D, E, F — all three).
- That "Phase D is re-implemented over code already present on the feature branch from its first successful merge."
- That the post-batch flow (test gate, plan status update) proceeds normally.

The test gate failure resume path creates functionally identical state: implementation code is on the feature branch (all merges succeeded before the test gate ran), but the plan shows those tasks as Not Done. On resume, all Batch 2 phases will be re-implemented over code already merged. There is no AT asserting this behavior, and there is no developer guidance in §2.6.1 step 8 (unlike §2.6.2's explicit guidance for merge conflict resume).

This corroborates BE Round 4 F-03 and adds the missing-AT dimension.

**Testability gap:** A test author writing integration tests for the resume path cannot write a property test for "what happens when the developer resumes after a test gate failure" — there is no THEN clause to assert. The gap is symmetric with the merge conflict path: AT-BD-01-04 exists for merge conflicts; no equivalent AT exists for test gate failure.

**Suggested additions (Low — non-blocking):**

1. Add a note to §2.6.1 step 8 analogous to the §2.6.2 developer guidance: "Note: Because plan status is not updated for a failed batch, all phases in the batch will be re-implemented on resume — including phases whose worktree merges succeeded before the test gate ran. Developers should manually mark already-correct phases as Done in the plan document if re-implementation would produce duplicate or conflicting changes."

2. Add an acceptance test:

```
AT-BD-01-05: Test gate failure resume re-runs all batch phases
WHO:   As the Ptah orchestrator
GIVEN: Batch 2 contains phases D, E, F; all three agents complete successfully;
       all three worktrees are merged into the feature branch
       The test suite run after Batch 2 reports 1 failing test
       Plan status is NOT updated; D, E, F remain Not Done in the plan document
       The developer fixes the failing test and re-invokes the tech lead
WHEN:  The tech lead resumes
THEN:  The plan shows D, E, F all as Not Done
       Batch computation includes D, E, and F (all three are re-implemented)
       The pre-execution confirmation shows a resume note for any earlier
         batches that are fully Done; Batch 2 contains D, E, and F
       Phase D is re-implemented over code already present on the feature branch
         from its first successful merge
       All three phases (D, E, F) complete and are merged in document order
       The post-batch flow (test gate, plan status update) proceeds normally
```

---

## Positive Observations

- **AT-TL-01-08 and AT-TL-01-09 are the strongest additions in v1.4.** AT-TL-01-08 is the first AT to exercise a successful plan modification with a cross-batch dependency verification (Phase D depends on C; C stays in Batch 2 before the new Batch 3 — the THEN clause explicitly confirms the dependency is still satisfied). AT-TL-01-09's THEN clause directly matches the error message template in §2.4.2(c), making it trivially verifiable: a test author can assert the exact message text without any inference.
- **§2.4.3 iteration counter rules are mechanically precise.** The three-category taxonomy — (1) successful modifications that advance the counter, (2) unrecognized inputs that do not, (3) recognized-but-rejected modifications that do not — is exhaustive and directly maps to property tests. The counterexample list for category 3 (dependency-violating move, same-batch move, dependency-violating split) exactly matches the rejection clauses in §2.4.2(b) and §2.4.2(c), with no ambiguity about which inputs are covered.
- **§2.4.3 "no automatic approval" statement closes a key test boundary.** Explicitly stating "the tech lead never begins execution without an explicit approve response from the user" is directly assertable: a test can construct a scenario where the 5-iteration limit is hit and verify that execution does not begin without an "approve" token.
- **AT-TL-02-03 is now at full AT-TL-02-02 parity.** The expanded THEN clause — specific failure message, pre-flight status line text, sequential execution outcome — gives test authors three independently assertable conditions rather than one inferential summary. This is the right level of AT granularity.
- **§2.7.1 failure classification remains exhaustive.** The explicit enumeration of `ROUTE_TO_USER`, `ROUTE_TO_AGENT`, `TASK_COMPLETE`, non-zero exit, and timeout as FAILURE conditions is clean. Test authors can write one property per signal type; no ambiguity remains about what constitutes FAILURE.

---

## Recommendation

**Needs revision.**

One Medium finding must be resolved before TSPEC authoring can proceed with integration test specifications for the batch execution lifecycle:

- **F-01** (MEDIUM): §2.6.1 step 2b prescribes `feat-{feature-name}/phase-{X}-{timestamp}` as the worktree branch naming format. This naming format is technically infeasible in git because the feature branch `feat-{feature-name}` already occupies the ref path — git cannot create a child ref under a ref that is already a file. As a result, worktree creation fails for every phase in every parallel batch, and all 9 batch execution lifecycle acceptance tests (AT-BD-01-01 through AT-BD-01-05 and AT-BD-02-01 through AT-BD-02-04) are untestable at setup. The fix is to remove the naming format from the FSPEC (deferring to TSPEC, Option 1, preferred) or correct the separator to hyphens (Option 2).

Two Low findings (F-02, F-03) are non-blocking and may be addressed in the same pass or deferred alongside TSPEC authoring.

| Finding | Severity | Status | Blocks TSPEC? |
|---------|----------|--------|---------------|
| F-01 — §2.6.1 step 2b worktree branch naming `feat-{X}/phase-{Y}` infeasible in git; blocks all batch lifecycle ATs | MEDIUM | ⬚ Open | Yes |
| F-02 — Form 1 (linear chain) and Form 3 (natural language) dependency syntax have no dedicated acceptance tests | LOW | ⬚ Open | No |
| F-03 — Test gate failure resume has no AT analogous to AT-BD-01-04; §2.6.1 step 8 missing developer guidance | LOW | ⬚ Open | No |

Please address F-01 (Medium) and route back for re-review. F-02 and F-03 may be addressed in the same pass or deferred — they do not block TSPEC.
