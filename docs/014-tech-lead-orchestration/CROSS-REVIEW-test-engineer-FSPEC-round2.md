# Cross-Review: Test Engineer — FSPEC (Round 2)

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.2](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 2 (re-review of v1.2) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All seven findings from the Round 1 TE review (F-01 through F-07, five of which were Low, two Medium) have been resolved in v1.2. The dependency syntax enumeration, unrecognized prefix rule, confirmation timeout AT, same-batch rejection AT, sub-batch failure cascade AT, dangling reference and no-task-table ATs, and the traceability/Check 2 fixes are all cleanly addressed.

Three new Medium findings were discovered in the re-review — all three are concurrences with the backend-engineer Round 2 findings, plus TE-specific test-authoring context added to each. Four new Low findings are TE-specific observations not raised by the BE review.

The FSPEC is structurally strong and the newly added ATs (AT-TL-01-06, AT-TL-01-07, AT-BD-02-04, AT-PD-01-05, AT-PD-01-06) are well-formed. The three Medium findings are targeted gaps that must be resolved before test properties and TSPEC can be authored with confidence.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 1) — MEDIUM | Unrecognized Source File prefix behavior undefined (FSPEC-PD-03) | ✅ Resolved — §2.3.1 table and §2.3.2 rule 5 added |
| F-02 (Round 1) — LOW | Missing AT for confirmation timeout (§2.4.3) | ✅ Resolved — AT-TL-01-07 added |
| F-03 (Round 1) — MEDIUM | "Any recognizable form" prevents bounded test set | ✅ Resolved — three explicit syntax forms enumerated in §2.1.2 step 4 |
| F-04 (Round 1) — LOW | Same-batch dependency rejection missing AT | ✅ Resolved — AT-TL-01-06 added |
| F-05 (Round 1) — LOW | Sub-batch failure cascade missing AT | ✅ Resolved — AT-BD-02-04 added |
| F-06 (Round 1) — LOW | §2.1.4 dangling reference and no-task-table cases lack ATs | ✅ Resolved — AT-PD-01-05 and AT-PD-01-06 added |
| F-07 (Round 1) — LOW | REQ-PD-06 missing from traceability; Check 2 pass condition unspecified | ✅ Resolved — REQ-PD-06 added to §4; §2.5.2 Check 2 behavioral pass condition specified |

---

## New Findings

### F-01 — MEDIUM (Concurring with BE F-01): "Re-run Phase" missing from §2.4.2 valid modification types — AT-BD-03-03 untestable

**Location:** §2.4.2 step 2; §2.8.3; AT-BD-03-03

**Issue:** §2.4.2 enumerates three valid modification types for the modification loop: (a) change skill assignment, (b) move a phase, (c) split a batch. §2.8.3 instructs the developer to use "the modify option in FSPEC-TL-01" to request "Re-run Phase B." However, "re-run Phase" is not listed as a valid modification type in §2.4.2.

**TE-specific concern:** AT-BD-03-03 directly tests this flow:

```
WHEN: The developer types "modify" then "re-run Phase B"
THEN: Phase B is added back to the in-memory batch plan
```

This AT is untestable as written. A test implementation of the modification loop that follows §2.4.2 faithfully would have three recognized modification verbs. When the developer types "re-run Phase B," the handler has no matching case — it would either reject the input as unrecognized or produce undefined behavior. The AT would fail at the "modify" step, not because the behavior is wrong, but because the spec's modification loop handler was never told to support "re-run" as a valid input.

The fix required is the same as BE F-01 recommends: add a fourth modification type to §2.4.2 step 2:
> (d) Force a phase to re-run regardless of Done status (e.g., "re-run Phase B"). See §2.8.3 for behavior.

This makes AT-BD-03-03 testable: the modification loop recognizes "re-run Phase B" as type (d), applies §2.8.3's logic, and the AT can proceed.

---

### F-02 — MEDIUM (Concurring with BE F-02): Pre-flight timing contradiction makes the confirmation display untestable

**Location:** §2.4.1 item 2; §2.5.1; AT-TL-01-01; AT-TL-02-01

**Issue:** §2.4.1 item 2 specifies that the Batch Execution Plan presented to the user includes "Pre-flight status — Pass/Fail for each infrastructure check." But §2.5.1 states "Pre-flight runs **after** the user approves the batch execution plan." These two sections describe incompatible models.

**TE-specific concern:** A test author writing test coverage for the pre-execution confirmation display (AT-TL-01-01 and related ATs) faces an unsolvable setup problem:

- **If §2.4.1 governs:** the confirmation display test must mock pre-flight first, then present the confirmation. The test setup needs to stub Check 1 and Check 2 results BEFORE the confirmation is shown. The AT-TL-01-01 happy-path GIVEN clause would need to include "feature branch present on remote AND ArtifactCommitter available" as preconditions.
- **If §2.5.1 governs:** the confirmation display test does NOT need to mock pre-flight at all. The confirmation is shown with no pre-flight results (or a placeholder), and pre-flight is a separate post-approval step. AT-TL-01-01 can be written without any pre-flight stubs.

AT-TL-02-01 confirms the §2.5.1 model ("WHEN: Pre-flight runs after plan approval"), but AT-TL-02-01 applies to the pre-flight step in isolation, not to what is shown in the confirmation display. The question for the confirmation test remains unresolved.

If the intent is §2.4.1's model (show results in confirmation), then §2.5.1 must be updated and AT-TL-02-01's WHEN clause revised. If the intent is §2.5.1's model, then §2.4.1 item 2 must be updated to show that only a description of what will be checked is shown (not actual Pass/Fail results). Either way, the confirmation display AT (AT-TL-01-01) needs to document whether pre-flight results are visible before the developer types "approve."

---

### F-03 — MEDIUM (Concurring with BE F-03): Merge conflict resume AT is untestable due to inaccurate note in §2.6.2

**Location:** §2.6.2 note; §2.8.1; resume AT gap

**Issue:** §2.6.2's note states: "the developer resolves the conflict and resumes from this batch number, which will **re-implement any phases whose merges were aborted**." However, FSPEC-BD-03's resume algorithm (§2.8.1) works from plan Done-status, and §2.6.2 step 4 specifies that "The plan status is **not** updated for this batch." Therefore all phases in the batch remain Not Done, and ALL of them — including phases whose merges already succeeded before the conflict — will be re-implemented on resume.

**TE-specific concern:** There is no acceptance test covering the merge-conflict resume path. To write one, the test author needs to know what to assert in the THEN clause:

```
GIVEN: Batch 2 contains phases D, E, F (in document order); Phase D merges successfully;
       Phase E has a merge conflict; Phase F has not been merged yet.
       Developer resolves the conflict and resumes from Batch 2.
WHEN:  The tech lead resumes
THEN:  ???
```

Two incompatible THEN clauses are possible:
- **Per the §2.6.2 note:** Only E and F are re-implemented; D is skipped because its merge succeeded.
- **Per the resume algorithm (§2.8.1 + §2.6.2 step 4):** D, E, and F are all re-implemented because none have Done status.

Without knowing which behavior is correct, this AT cannot be written. Furthermore, the §2.6.2 note creates a false expectation that could cause the developer to incorrectly assume Phase D's code won't be overwritten — a potential source of confusion about whether a re-run introduces duplicate changes or conflicts with Phase D's already-merged code.

The required fix is one of the two options BE F-03 identifies. Once the PM chooses, a new acceptance test (AT-BD-04 or similar) covering the partial-merge resume scenario can be written with a definitive THEN clause.

---

## New Low Findings (TE-specific)

### F-04 — LOW: No AT for the downstream Done phases warning (§2.8.3 / §2.8.4)

**Location:** §2.8.3; §2.8.4; AT-BD-03-03

**Issue:** §2.8.3 specifies a downstream Done phases warning:

> "Warning: Phase D (which depends on Phase B) is still marked Done and will not be re-run. If Phase B's re-implementation changes its outputs, Phase D's Done status may be stale."

This is a fully-specified, observable behavior: a condition (downstream Done phases exist), a trigger (developer requests "re-run Phase B"), and a message (the exact warning text). However, no acceptance test covers this scenario. AT-BD-03-03 tests the re-run request but its GIVEN clause does not specify whether Phase D (a downstream dependent of Phase B) is marked Done, and its THEN clause does not assert whether the warning is emitted.

Additionally, §2.8.3 specifies that the warning covers "downstream phases that are also marked Done" — but it's unclear whether "downstream" means only **direct** dependents or the full **transitive closure**. Phase D depends on Phase B → warning issued for D. But if Phase E depends on Phase D (transitively depending on Phase B), is a warning also issued for Phase E? A test author needs this boundary to write a complete test.

**Suggested fix:**
1. Add AT-BD-03-04 for the downstream warning scenario:
   ```
   WHO:   As the developer
   GIVEN: Phase B and Phase D (which depends on Phase B) are both marked Done
          The developer requests "re-run Phase B"
   WHEN:  The tech lead processes the re-run request
   THEN:  Phase B is added to the in-memory execution plan
          A warning is posted: "Warning: Phase D (which depends on Phase B) is still marked Done
          and will not be re-run..."
          Phase D remains excluded from the batch plan
   ```
2. Clarify in §2.8.3 whether the warning covers only direct dependents or the full transitive closure of downstream Done phases.

---

### F-05 — LOW: §2.4.2 modification loop has no error rule for unrecognized modification inputs

**Location:** §2.4.2 step 2

**Issue:** §2.4.2 enumerates (currently three, should be four after BE F-01 is fixed) valid modification types. However, no rule is specified for what happens when the developer provides an input that does not match any valid modification type — for example, "delete Phase C", "swap phases B and D", or a free-text response that the tech lead cannot parse.

A test author writing coverage for the modification loop error path needs to know the expected behavior: does the tech lead reject with a specific message and re-prompt? Return a generic error? Silently re-present the plan? Without a rule, the only testable guarantee is "not one of the valid types," but the expected output is undefined.

**Note:** This finding is independent of BE F-01 (which adds "re-run Phase" as a fourth valid type). Even after BE F-01 is resolved, unrecognized inputs that don't match any of the four types remain unspecified.

**Suggested fix:** Add a rule at the end of §2.4.2 step 2:
> If the modification request does not match any recognized type, the tech lead responds with: "Unrecognized modification request. Valid modifications are: change skill assignment, move a phase, split a batch, re-run a phase. Please try again." and re-prompts with "What would you like to change?"

This produces testable, deterministic error-path behavior. An AT can then assert the error message and the loop re-prompting.

---

### F-06 — LOW: §2.7.1 does not classify ROUTE_TO_AGENT and TASK_COMPLETE agent signals as success or failure

**Location:** §2.7.1 Failure Detection; §2.7.2

**Issue:** §2.7.1 explicitly classifies four conditions as FAILURE: `ROUTE_TO_USER`, non-zero exit, timeout, and "error response that cannot be classified as LGTM." An agent is SUCCEEDED if it returns `LGTM` with exit code 0.

The Ptah routing signal set includes two additional signals not addressed: `ROUTE_TO_AGENT` and `TASK_COMPLETE`.

- `TASK_COMPLETE` is described as a terminal signal ("entire feature is done"). If a phase engineer subagent emits this, it is unexpected — the phase is done, not the entire feature. Is this a failure?
- `ROUTE_TO_AGENT` is an ad-hoc coordination signal. If a phase engineer subagent emits this instead of `LGTM` or `ROUTE_TO_USER`, what is the tech lead's response?

The catch-all "error response that cannot be classified as LGTM" would include both, but this is ambiguous for test authoring: should a test that feeds `TASK_COMPLETE` into the phase result handler expect FAILURE handling (no merge, cleanup, halt), or LGTM handling (merge, proceed)?

**Suggested fix:** Expand §2.7.1 to explicitly state:
> Any routing signal other than `LGTM` is treated as FAILURE, including `ROUTE_TO_USER` (blocked on human decision), `ROUTE_TO_AGENT` (unexpected inter-agent routing), and `TASK_COMPLETE` (premature terminal signal from a phase agent).

This makes the FAILURE classification exhaustive and directly testable.

---

### F-07 — LOW: No AT for the unrecognized Source File prefix rule added in §2.3.2

**Location:** §2.3.2 rule 5; §2.3.3

**Issue:** The Round 1 TE finding F-01 requested that §2.3.1 and §2.3.2 be updated to define behavior for unrecognized Source File prefixes. v1.2 added the rule correctly (§2.3.1 table row: "Any unrecognized prefix → backend-engineer (silent default, no warning)" and §2.3.2 rule 5). However, no acceptance test was added for this case.

§2.3.3 has four acceptance tests (AT-PD-03-01 through AT-PD-03-04) covering: pure backend, pure frontend, mixed-layer, and documentation-only phases. There is no AT-PD-03-05 for a phase with an unrecognized prefix (e.g., a task table containing `lib/foo.ts` or `utils/bar.ts`).

The behavior is fully specified (silent backend default, no warning). A test for this case is straightforward to add and is needed for the PROPERTIES document to have a backed property for §2.3.2 rule 5.

**Suggested fix:** Add AT-PD-03-05:
```
WHO:   As the Ptah orchestrator
GIVEN: A phase whose only Source File entry is "lib/utilities/helpers.ts"
       (an unrecognized prefix — not in backend, frontend, docs, or empty categories)
WHEN:  Skill assignment runs
THEN:  Assigned skill = backend-engineer
       No warning emitted (silent default)
```

---

## Positive Observations

- **All seven Round 1 TE findings are cleanly resolved.** In particular, the three-form dependency syntax enumeration in §2.1.2 step 4 is precise and directly testable. AT-PD-01-01 now correctly uses fan-out syntax that matches one of the enumerated forms. The unrecognized prefix rule (§2.3.2 rule 5) is well-defined.
- **AT-TL-01-06 (same-batch rejection) and AT-BD-02-04 (sub-batch failure cascade) are both well-structured.** The AT-TL-01-06 message text is specific enough to assert against. AT-BD-02-04's THEN clause explicitly states "The feature branch is in the exact same state as before Batch 1 began" — this is the no-partial-merge invariant stated as a directly assertable post-condition.
- **AT-BD-03-03 (force re-run) has a clean structure.** Once BE F-01 is fixed (adding "re-run Phase" to §2.4.2), this AT will be fully testable with no ambiguity.
- **§2.7.3 no-partial-merge invariant language** ("the feature branch is in exactly the same state as before Batch N ran") is the strongest, most testable assertion in the FSPEC. This single sentence enables a clean integration test: `git diff feat-branch-before-batch feat-branch-after-failed-batch` must be empty.
- **FSPEC-BD-03 resume algorithm** (re-running completed-phase exclusion = stateless resume) remains an elegant design. The auto-detection approach means the resume path and the fresh-start path share the same code, which minimizes the test surface area: there is exactly one entry point to test for both scenarios (AT-PD-02-02 covers it well).

---

## Recommendation

**Needs revision.**

Three Medium findings (all concurrences with the backend-engineer Round 2 review) must be resolved before TSPEC authoring and PROPERTIES creation can proceed:

- **F-01** (MEDIUM): "Re-run Phase" missing from §2.4.2 — AT-BD-03-03 is untestable without this fix.
- **F-02** (MEDIUM): Pre-flight timing contradiction — the pre-execution confirmation AT and pre-flight ATs require incompatible test setups until this is resolved.
- **F-03** (MEDIUM): Merge conflict resume inaccuracy — no AT for the partial-merge resume scenario can be written until the PM chooses Option A or B.

Four Low findings (F-04 through F-07) are recommended fixes that improve test completeness but do not block TSPEC authoring.

| Finding | Severity | Type | Status | Blocks TSPEC? |
|---------|----------|------|--------|---------------|
| F-01 — "Re-run Phase" not in §2.4.2; AT-BD-03-03 untestable (concurring BE F-01) | MEDIUM | Concurrence | ⬚ Open | Yes |
| F-02 — Pre-flight timing contradiction §2.4.1 vs §2.5.1 (concurring BE F-02) | MEDIUM | Concurrence | ⬚ Open | Yes |
| F-03 — Merge conflict resume note inaccurate; no resume AT possible (concurring BE F-03) | MEDIUM | Concurrence | ⬚ Open | Yes |
| F-04 — No AT for downstream Done phases warning (§2.8.3/§2.8.4) | LOW | New | ⬚ Open | No |
| F-05 — §2.4.2 no error rule for unrecognized modification inputs | LOW | New | ⬚ Open | No |
| F-06 — §2.7.1 ROUTE_TO_AGENT and TASK_COMPLETE not classified | LOW | New | ⬚ Open | No |
| F-07 — No AT for unrecognized Source File prefix rule (§2.3.2 rule 5) | LOW | New | ⬚ Open | No |

Please coordinate with the backend-engineer round 2 findings for a single consolidated revision pass addressing all three Medium findings, then route back for re-review.
