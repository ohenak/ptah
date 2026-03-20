# Cross-Review: Test Engineer — FSPEC (Round 6)

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.6](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 6 (re-review of v1.6) |
| **Date** | 2026-03-20 |
| **Recommendation** | **Needs revision** |

---

## Summary

All three Low findings from Round 5 are fully resolved in v1.6. The re-prompt example now includes `'re-run Phase B'` (TE F-01), the timeout–kill-mechanism contradiction in §2.7.1 is resolved with a clear clarifying sentence (TE F-02), and all three halt messages now use the correct "re-invoke the tech lead — execution will automatically resume" phrasing (TE F-03).

One new Medium finding is raised in this round. §2.4.2 step 2b's move validation rule only checks whether the *moved phase's own dependencies* would be violated, but does not check whether downstream *dependents* of the moved phase would have their dependency order violated. This creates a behavioral correctness gap: a developer can move a prerequisite phase to a later batch, leaving a dependent phase in an earlier batch, and the tech lead will accept the move — producing an execution plan that directly violates REQ-PD-02 ("no phase runs before its dependencies are complete"). This is a P0 correctness issue and blocks TSPEC authoring.

One Low finding is also raised: FSPEC-PD-02 §2.2.2 states the partial-completion boundary condition ("even one task not Done → phase not completed") but has no acceptance test asserting it. A TSPEC author has no AT template to write an isolated unit test for this boundary.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 5) — LOW | §2.4.2 step 1 re-prompt omits "re-run" from examples | ✅ Resolved — `'re-run Phase B'` added as the fourth example in the step 1 re-prompt |
| F-02 (Round 5) — LOW | §2.7.1 timeout failure condition vs. §2.7.2 "no kill mechanism" contradiction | ✅ Resolved — clarifying sentence added: timeout is enforced by Agent tool infrastructure via `tech_lead_agent_timeout_ms`; no active kill mechanism required from the tech lead side |
| F-03 (Round 5) — LOW | §2.6.1 step 8 / §2.6.2 step 3 "resume from Batch {N}" implies explicit batch-number selection; contradicts FSPEC-BD-03 auto-detection | ✅ Resolved — all three halt messages (§2.6.1 step 8, §2.6.2 step 3, §2.7.2 step 4) now read "re-invoke the tech lead — execution will automatically resume from Batch {N}" |

---

## New Findings

### F-01 — MEDIUM: §2.4.2 step 2b move validation only checks the moved phase's own dependencies; does not detect downstream dependent violations

**Location:** FSPEC-TL-01 §2.4.2 step 2(b)

**Issue:** The move validation rule reads:

> "Move a phase to a different batch (must not violate the phase's dependency constraints). → If the requested move would place a phase into the same batch as any of its **dependencies**, OR into a batch numbered **before** any of its **dependencies**, reject the move…"

This rule checks whether the *moved phase X* would end up in a batch that conflicts with what X depends on. It does not check the inverse: whether moving X to a later batch would leave a phase Y (which *depends on X*) in an earlier batch — creating an execution order where Y runs before X has completed.

**Concrete example not caught by the current rule:**

```
Current plan:
  Batch 3: Phase D (no dependencies)
  Batch 4: Phase E (depends on Phase D)

Developer requests: "move Phase D to Batch 5"

Validation check applied (per §2.4.2 step 2b):
  Does moving Phase D to Batch 5 place D in the same batch as any of D's dependencies?  → No (D has no dependencies)
  Does moving Phase D to Batch 5 place D before any of D's dependencies?                → No (D has no dependencies)

Result: move is ACCEPTED ✅ (per current rule)

Resulting plan:
  Batch 4: Phase E (depends on Phase D)  ← E runs before its dependency
  Batch 5: Phase D

This plan violates REQ-PD-02: Phase E runs before Phase D completes.
```

The move is accepted even though it places a dependent phase (E) in an *earlier* batch than its prerequisite (D), directly violating the "no phase runs before its dependencies are complete" invariant from REQ-PD-02 (P0).

**Asymmetry with split validation:** The batch split validation in §2.4.2 step 2(c) is correctly specified in both directions:

> "If the requested split would place a phase in the new (later) batch while any **phase that depends on it** remains in the current (earlier) batch, reject the split."

This split rule catches downstream dependent violations. The move rule should have a symmetric check.

**Testability impact:** A TSPEC author reading only §2.4.2 step 2b would implement move validation that checks only the moved phase's own dependencies. No acceptance test exists for the downstream-dependent violation case, so there is no template for a unit test that catches the asymmetric move scenario. The resulting implementation would silently produce invalid execution plans.

**Suggested fix:** Extend §2.4.2 step 2b with a downstream violation check:

> "The tech lead must also reject the move if the destination batch number is greater than the batch number of any phase that depends on the moved phase (downstream violation). Error message: 'Phase {X} cannot be moved to Batch {M} because Phase {Y} (which depends on Phase {X}) is currently in Batch {N}, which would execute before Batch {M}. Please choose a destination batch numbered at or before Batch {N}.'"

Add a corresponding acceptance test (AT-TL-01-10) to cover this scenario:

```
AT-TL-01-10: Move to later batch rejected when dependents remain in earlier batch
WHO:   As the developer
GIVEN: Batch 3 contains Phase D (no dependencies of its own)
       Batch 4 contains Phase E (which depends on Phase D)
WHEN:  The developer requests "move Phase D to Batch 5"
THEN:  The tech lead rejects the move:
         "Phase D cannot be moved to Batch 5 because Phase E (which depends on
          Phase D) is currently in Batch 4, which would execute before Batch 5.
          Please choose a destination batch numbered at or before Batch 4."
       The original plan is retained (Phase D remains in Batch 3); the developer is re-prompted
       The modification cycle counter is NOT incremented
```

---

### F-02 — LOW: FSPEC-PD-02 §2.2.2 partial-completion boundary condition has no acceptance test

**Location:** FSPEC-PD-02 §2.2.2

**Issue:** §2.2.2 states explicitly:

> "A phase with **even one task** marked 'In Progress', 'Not Started', or with a blank status is **not** completed."

This is a meaningful boundary condition for the completion check — a phase with 5 tasks, 4 of which are Done and 1 of which is "In Progress", must be treated as not-completed and included in batch computation. However, no acceptance test validates this boundary. The existing ATs for this area are:

- AT-PD-02-02: Tests the "all tasks Done → phase excluded" path.
- AT-PD-02-04: Tests the "all phases entirely Done → nothing to execute" path.

There is no AT that verifies the "some tasks Done, some not Done → phase NOT excluded" path. A TSPEC author writing unit tests for the phase-completion predicate has no FSPEC-level template for the partial-completion case.

**Testability impact:** A TSPEC author writing unit tests for the phase-completion check has the "all Done" and "all Not Done" cases covered by ATs, but the "partial Done" case is only specified in prose (§2.2.2). An engineer could plausibly (and incorrectly) implement "if any task is Done, phase is considered Done" without a failing AT to catch the error.

**Suggested fix (Low — non-blocking):** Add AT-PD-02-05 to §2.2.5:

```
AT-PD-02-05: Partially-done phase is NOT excluded from batch computation
WHO:   As the Ptah orchestrator
GIVEN: Phase D has 3 tasks:
         Task 1 — Status: Done (✅)
         Task 2 — Status: In Progress
         Task 3 — Status: Done (✅)
WHEN:  Completed-phase exclusion runs
THEN:  Phase D is NOT classified as completed
       Phase D is included in batch computation
       (2 of 3 tasks Done is not sufficient for exclusion — all tasks must be Done)
```

---

## Positive Observations

- **All Round 5 findings resolved cleanly.** The TE F-02 (timeout/kill-mechanism) resolution is particularly strong: the clarifying sentence in §2.7.1 is precisely calibrated — it explains the enforcement mechanism (Agent tool infrastructure via `tech_lead_agent_timeout_ms`) while letting §2.7.2's "no active kill mechanism" statement stand as accurate from the tech lead's perspective. These two statements are no longer in tension.
- **The three halt messages are now consistent with FSPEC-BD-03 auto-detection.** The "re-invoke the tech lead — execution will automatically resume" phrasing correctly sets developer expectations: there is no `--resume-from-batch` flag, no explicit batch number required. The message and the actual behavior now match.
- **The split validation in §2.4.2 step 2(c) is well-designed.** It correctly checks both directions: the split rejects (a) placing a dependent phase before its prerequisite, and (b) placing a prerequisite phase after a phase that depends on it. This is the pattern that the move validation (step 2b) should mirror.
- **FSPEC-BD-03 downstream Done phases warning (§2.8.3 and AT-BD-03-04) remains the strongest section of the document.** The transitive closure specification and the per-dependent warning pattern are precise and cover a genuinely complex multi-step developer interaction scenario.

---

## Recommendation

**Needs revision.**

F-01 is Medium severity: it describes a behavioral correctness gap that allows move operations to produce execution plans violating REQ-PD-02 (P0). The TSPEC author cannot write correct move-validation tests without a fixed specification. F-02 is Low and non-blocking.

| Finding | Severity | Status | Blocks TSPEC? |
|---------|----------|--------|---------------|
| F-01 — §2.4.2 step 2b move validation missing downstream dependent check | MEDIUM | ⬚ Open | Yes |
| F-02 — FSPEC-PD-02 §2.2.2 partial-completion boundary has no AT | LOW | ⬚ Open | No |

The PM must address F-01 (add downstream violation check to §2.4.2 step 2b and add AT-TL-01-10) and re-route the updated FSPEC for re-review before TSPEC authoring begins. F-02 may be addressed in the same pass or carried forward.
