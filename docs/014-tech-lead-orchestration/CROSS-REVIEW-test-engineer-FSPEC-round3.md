# Cross-Review: Test Engineer — FSPEC (Round 3)

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.3](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 3 (re-review of v1.3) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All seven findings from the Round 2 TE review (three Medium, four Low) have been resolved cleanly in v1.3. The "re-run Phase" modification type (d), the pre-flight timing resolution, the merge conflict resume correction (Option B), the downstream Done phases warning (with transitive closure clarification), the unrecognized modification error rule, the exhaustive failure signal classification, and the unrecognized Source File prefix AT are all well-addressed.

One new Medium finding was discovered in this round — a dependency-violation gap in the batch split operation (§2.4.2(c)) that lacks rejection logic and has no acceptance test, leaving the invalid-split scenario untestable and potentially unsafe. Two new Low findings cover a thin AT and a minor ambiguity in the pre-flight status display condition.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 2) — MEDIUM | "Re-run Phase" missing from §2.4.2; AT-BD-03-03 untestable | ✅ Resolved — §2.4.2(d) added; AT-BD-03-03 now testable |
| F-02 (Round 2) — MEDIUM | Pre-flight timing contradiction §2.4.1 vs §2.5.1 | ✅ Resolved — §2.5.1 now states pre-flight runs before confirmation; AT-TL-01-01 and AT-TL-02-01 updated consistently |
| F-03 (Round 2) — MEDIUM | Merge conflict resume note inaccurate; no resume AT | ✅ Resolved — Option B chosen in §2.6.2 note (all batch phases re-run); AT-BD-01-04 added |
| F-04 (Round 2) — LOW | No AT for downstream Done phases warning | ✅ Resolved — AT-BD-03-04 added with transitive closure; §2.8.3 clarifies "downstream" = full transitive closure |
| F-05 (Round 2) — LOW | §2.4.2 no error rule for unrecognized modification inputs | ✅ Resolved — unrecognized request rule added to §2.4.2 step 2 with exact message and re-prompt |
| F-06 (Round 2) — LOW | §2.7.1 ROUTE_TO_AGENT and TASK_COMPLETE not classified | ✅ Resolved — §2.7.1 expanded; failure classification is now exhaustive with explicit signal list |
| F-07 (Round 2) — LOW | No AT for unrecognized Source File prefix rule (§2.3.2 rule 5) | ✅ Resolved — AT-PD-03-05 added |

---

## New Findings

### F-01 — MEDIUM: §2.4.2(c) batch split has no dependency-violation rejection rule and no acceptance test

**Location:** §2.4.2 step 2(c); §2.4.4

**Issue:** §2.4.2(b) specifies that a "move phase" request is rejected with an explanation if the move would place a phase before any of its dependencies (including the same-batch case). This rejection logic makes the move operation safe and testable (AT-TL-01-03 and AT-TL-01-06 both cover the rejection path).

§2.4.2(c) specifies "split a batch into two consecutive batches (user specifies which phases stay in the current batch and which move to the new batch)." The new batch is created after the current batch, so phases moved to the new batch go to a later execution position. However, a dependency violation is still possible:

**Invalid split example:** Batch 3 contains phases [C, D] where Phase D depends on Phase C. The developer requests: "split Batch 3 — move Phase C to a new Batch 4, keep Phase D in Batch 3." After the split, Phase D is in Batch 3 and its dependency Phase C is in Batch 4 — C executes *after* D. This is a dependency violation.

There is no rejection rule for this case and no acceptance test. Unlike the move operation, the split operation has no guard clause. A test author writing coverage for the batch split path:

1. Cannot write a test for the invalid-split rejection case — the expected behavior is unspecified.
2. Has no THEN clause to assert for the valid-split success case either — no AT for a successful split exists (there is no AT-TL-01-08 or equivalent).

The fix requires two additions:
1. A dependency-violation rejection rule for §2.4.2(c) analogous to the rule in §2.4.2(b):
   > If the requested split would place a phase in the new (later) batch while any phase that depends on it remains in the current (earlier) batch, reject with: "Phase {X} cannot be moved to a later batch because Phase {Y} (which depends on Phase {X}) would remain in Batch {N} before it. Please adjust the split to keep dependencies before their dependents."

2. Two acceptance tests:
   - **AT-TL-01-08 (valid split):** A developer splits a batch with no dependency violations; the plan is updated and re-presented.
   - **AT-TL-01-09 (dependency-violating split rejected):** A developer requests a split that would place a dependency after its dependent; the tech lead rejects with an explanation and re-prompts.

Without these, the batch split operation is the only modification type that lacks both a rejection rule and an acceptance test.

---

### F-02 — LOW: AT-TL-02-03 underspecified relative to AT-TL-02-02

**Location:** §2.5.4; AT-TL-02-03

**Issue:** AT-TL-02-02 (feature branch missing on remote) provides a detailed THEN clause:
- Specific warning message content
- Sequential fallback plan shown with exact message text
- Pre-flight status line content
- Developer action and outcome

AT-TL-02-03 (ArtifactCommitter capability absent) provides only:
```
THEN:  Check 2 fails; warning logged; sequential fallback applied
```

This AT is not independently testable. A test author must combine AT-TL-02-03 with §2.5.3 to infer what "warning logged" contains (the log message) and what "sequential fallback applied" means in terms of what is presented to the developer in the confirmation.

The THEN clause of AT-TL-02-03 should match the level of detail in AT-TL-02-02:
- The specific check that failed (Check 2 — ArtifactCommitter capability)
- The message content shown in the confirmation ("Parallel execution unavailable — pre-flight check failed: ArtifactCommitter two-tier merge capability not available. Showing sequential execution plan...")
- The pre-flight status line shown ("Fail — ArtifactCommitter two-tier merge capability unavailable")
- That the developer types "approve" and sequential execution begins

**Suggested fix:** Expand AT-TL-02-03's THEN clause to match AT-TL-02-02's level of specificity, using the message format from §2.5.3 step 3.

---

### F-03 — LOW: §2.4.1 item 2 "only shown when parallel mode is active" is ambiguous for the pre-flight-failure case

**Location:** §2.4.1 item 2; §2.5.3 step 3

**Issue:** §2.4.1 item 2 states: "**Pre-flight status** — Pass/Fail for each infrastructure check (feature branch presence, ArtifactCommitter availability) — **only shown when parallel mode is active**."

§2.5.3 step 3 states that when pre-flight fails, the sequential fallback plan is presented and "The §2.4.1 pre-flight status line in the confirmation shows the failed check result (Fail)." AT-TL-02-02 confirms: "The 'Pre-flight status' line shows 'Fail — feature branch not found on remote'."

These two specifications are consistent in intent (the pre-flight status is shown in both success and failure cases), but §2.4.1 item 2's qualifying phrase "only shown when parallel mode is active" is ambiguous for the case where pre-flight *ran* in parallel mode but *failed*, causing degradation to sequential mode. The condition "parallel mode is active" is unclear: does it refer to the mode at the time pre-flight ran (parallel, because we intended to run in parallel) or the mode at the time the confirmation is displayed (sequential, after degradation)?

A test author writing AT coverage for the pre-execution confirmation display needs to know whether the pre-flight status line appears in the confirmation when the developer sees a sequential fallback due to pre-flight failure. §2.5.3 and AT-TL-02-02 answer this implicitly ("yes, it appears"), but §2.4.1 item 2 is read in isolation when writing the confirmation display tests.

**Suggested fix:** Revise §2.4.1 item 2 to clarify:
> "**Pre-flight status** — Pass/Fail for each infrastructure check — shown when pre-flight ran (i.e., the batch plan had at least one parallel batch). This line appears regardless of whether pre-flight passed or failed; when pre-flight failed, it shows the Fail result and explains why sequential mode was chosen. Pre-flight status is NOT shown in pure sequential fallback mode (triggered by missing/unparseable dependency section) because pre-flight is not invoked in that case."

---

## Positive Observations

- **All Round 2 Medium findings fully resolved.** The pre-flight timing fix is clean — pre-flight now runs before confirmation, which makes AT-TL-01-01's GIVEN clause coherent (pre-flight results are visible when the developer sees the plan). The §2.6.2 Option B resolution is honest and developer-guiding — the note explicitly warns developers that previously-merged phases will be re-implemented and tells them how to avoid it.
- **AT-BD-03-04 (downstream Done phases warning) is the strongest new AT in v1.3.** The transitive closure semantics (Phase D and Phase E both receive warnings because E transitively depends on Phase B) are precisely specified, and the THEN clause asserts exactly two warning messages with specific text — directly testable.
- **§2.7.1 exhaustive failure classification** is now one of the most testable assertions in the FSPEC. A property can be written: "For each of {ROUTE_TO_USER, ROUTE_TO_AGENT, TASK_COMPLETE, non-zero exit, timeout}, the tech lead must not merge and must halt." The explicit enumeration removes all ambiguity about what constitutes FAILURE.
- **AT-BD-01-04 (partial-merge resume)** is the best new AT for integration testing: it specifies exactly which phases (D, E, F — all three) are re-run after a merge conflict, and it confirms that Phase D is re-implemented "over code already present" from its first merge. This is a non-trivial, directly assertable condition.
- **§2.4.2 unrecognized modification rule** ("does not count toward the 5-iteration limit") is a testability improvement — test authors can write a scenario where an unrecognized input precedes a valid modification and verify the counter does not increment.

---

## Recommendation

**Needs revision.**

One Medium finding must be resolved before TSPEC authoring can proceed with full coverage of the modification loop:

- **F-01** (MEDIUM): §2.4.2(c) batch split has no dependency-violation rejection rule and no acceptance tests. The move operation (§2.4.2(b)) has both. The split operation is the only modification type that can produce a broken execution order without being caught and is the only type with no AT. Test authors cannot write properties for the invalid-split case until the rejection rule and ATs are added.

Two Low findings (F-02, F-03) are recommended fixes that improve AT completeness and specification precision but do not block TSPEC authoring.

| Finding | Severity | Status | Blocks TSPEC? |
|---------|----------|--------|---------------|
| F-01 — §2.4.2(c) batch split: no dependency-violation rejection rule, no ATs | MEDIUM | ⬚ Open | Yes |
| F-02 — AT-TL-02-03 THEN clause underspecified | LOW | ⬚ Open | No |
| F-03 — §2.4.1 item 2 "parallel mode active" ambiguous for pre-flight-failure case | LOW | ⬚ Open | No |

Please address F-01 (Medium) and route back for re-review. F-02 and F-03 may be addressed in the same pass or deferred — they do not block TSPEC.
