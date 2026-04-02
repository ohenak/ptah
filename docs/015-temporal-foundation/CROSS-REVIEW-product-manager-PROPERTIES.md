# Cross-Review: Product Manager → PROPERTIES-015

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | [015-PROPERTIES-temporal-foundation.md](015-PROPERTIES-temporal-foundation.md) |
| **Review Date** | April 2, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01: Non-retryable error handling deviates from FSPEC-TF-03 (High)

**PROP-TF-55** states: `featureLifecycleWorkflow` must enter failed state and notify user when a non-retryable error occurs **(no retry-or-cancel, immediate failure)**.

However, FSPEC-TF-03 step 5 explicitly applies to **both** "all retries exhausted (retryable) **or** non-retryable error" and specifies:
- 5a: Workflow transitions to `failed` state
- 5b: Posts failure notification
- **5c: Enters `waitForSignal("retry-or-cancel")`**
- 5d: User can signal `retry` or `cancel`

The FSPEC intentionally gives users the `retry-or-cancel` option for ALL failure types. For non-retryable errors like merge conflicts, the user may need to manually resolve the issue and then signal `retry` to re-dispatch. For routing signal parse failures, the user may want to `cancel` the workflow cleanly rather than leaving it in a terminal failed state with no recovery path.

**PROP-TF-55 is making a product decision** (removing the retry-or-cancel flow for non-retryable errors) that contradicts the approved FSPEC. This narrows the user's ability to recover from failures without restarting the entire workflow.

**Recommendation:** Update PROP-TF-55 to match FSPEC-TF-03 — non-retryable errors should also enter `waitForSignal("retry-or-cancel")`. PROP-TF-22 already covers the retryable case correctly; PROP-TF-55 should mirror it for non-retryable errors.

---

### F-02: PROP-MG-12 phrasing implies more than 15 v4 phases (Low)

**PROP-MG-12** states: `V4_DEFAULT_MAPPING` must map **all 15 v4 `PdlcPhase` enum values plus `IMPLEMENTATION`, `IMPLEMENTATION_REVIEW`, and `DONE`** to corresponding default preset phase IDs.

This phrasing implies IMPLEMENTATION, IMPLEMENTATION_REVIEW, and DONE are **in addition to** the 15 enum values, making it sound like 18 mappings. The REQ and FSPEC-MG-01 (BR-24) state the built-in mapping covers **all 15 v4 `PdlcPhase` values** — which includes IMPLEMENTATION, IMPLEMENTATION_REVIEW, and DONE as members of the enum.

**Recommendation:** Rephrase to: `V4_DEFAULT_MAPPING must map all 15 v4 PdlcPhase enum values (including IMPLEMENTATION, IMPLEMENTATION_REVIEW, and DONE) to corresponding default preset phase IDs`. Minor editorial fix.

---

## Clarification Questions

### Q-01: Gap 4 — timeout boundary test priority

Gap 4 identifies that long agent runs approaching `startToCloseTimeout` are not explicitly tested, rated as Medium risk. Given that REQ-TF-02 calls out 10-15 minute agent runs as a known reality, and R-09 in the risk register rates this scenario as Med likelihood / High impact, should a property for this boundary condition be elevated to P0 rather than left as a gap? The risk register mitigation specifically mentions configurable `scheduleToCloseTimeout`, but no property validates that the timeout expiry actually triggers the correct failure flow.

---

## Positive Observations

1. **Comprehensive coverage.** All 20 requirements and 6 FSPECs are mapped with "Full" coverage. The traceability from property → source → test level is thorough and will make test implementation straightforward.

2. **Negative properties (Section 4) are excellent.** The 16 negative properties capture critical invariants that are easy to accidentally violate during implementation — particularly PROP-TF-80 (no hardcoded phase enums), PROP-TF-83 (no partial merges), PROP-TF-89 (workflow determinism). These map directly to the product goals.

3. **Business rules faithfully represented.** Key product decisions from the FSPEC are correctly captured as testable properties:
   - No-partial-merge invariant (BR-12) → PROP-TF-27, PROP-TF-83
   - Full re-dispatch on retry (BR-14) → PROP-TF-30, PROP-TF-85
   - All reviewers re-review after revision (BR-18) → PROP-TF-39, PROP-TF-86
   - Internal 429 handling (BR-26) → PROP-TF-21, PROP-TF-53, PROP-TF-88

4. **Test pyramid is well-reasoned.** The decision to use 0 E2E tests with the rationale that `TestWorkflowEnvironment` provides E2E-level confidence at integration cost is well-justified and pragmatic.

5. **Migration properties are thorough.** PROP-MG-16 (idempotent migration), PROP-MG-17 (fork/join reset), and PROP-MG-19 (no question transfer) correctly capture the nuanced edge cases from FSPEC-MG-01.

---

## Recommendation

**Needs revision** — F-01 is a High severity finding where the PROPERTIES document deviates from the approved FSPEC on non-retryable error recovery flow. The author must address F-01 and route the updated document back for re-review.

---

*End of Review*
