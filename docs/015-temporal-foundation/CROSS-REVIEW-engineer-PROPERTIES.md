# Cross-Review: Engineer Review of PROPERTIES-015

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [015-PROPERTIES-temporal-foundation.md](015-PROPERTIES-temporal-foundation.md) |
| **Reviewer** | Engineer |
| **Date** | April 2, 2026 |
| **Review Scope** | Technical feasibility, testability, completeness, alignment with TSPEC |

---

## Findings

### F-01: PROP-TF-52 classifies heartbeat timeout as a retryable error thrown by the Activity — but heartbeat timeout is detected by Temporal, not the Activity (Medium)

**Severity:** Medium

PROP-TF-52 states: `invokeSkill Activity must throw a retryable error for heartbeat timeout`. However, heartbeat timeout is not something the Activity itself detects or throws. When heartbeats stop for longer than `heartbeatTimeout`, **Temporal** cancels the Activity externally. The Activity doesn't get the opportunity to throw a retryable error — Temporal treats heartbeat timeout as a retryable failure by default (unless the retry policy says otherwise).

This property should be reframed as: "When heartbeats stop for longer than `heartbeatTimeout`, Temporal must retry the Activity according to the retry policy." This is a Temporal SDK behavioral contract, not Activity-level code. The property should either be moved to Integration (testing with `TestWorkflowEnvironment`) or rewritten to test Activity-level behavior — e.g., verifying that the Activity correctly calls `context.heartbeat()` within the interval so that Temporal does *not* consider it timed out.

### F-02: PROP-TF-48 `FeatureWorkflowState` field list is missing `startedAt` and `updatedAt` (Low)

**Severity:** Low

PROP-TF-48 enumerates the required fields of `FeatureWorkflowState` but omits `startedAt` and `updatedAt`, which are present in the TSPEC type definition (TSPEC S4.3). These are listed in the TSPEC `FeatureWorkflowState` interface. Adding them makes the contract property complete.

### F-03: PROP-TF-56 tests merge conflict rollback as a unit test, but the merge sequence involves multiple Activity calls orchestrated by the Workflow (Low)

**Severity:** Low

PROP-TF-56 ("`mergeWorktree` Activity must revert the first merge and throw non-retryable error when the second worktree in fork/join produces a merge conflict") is marked as Unit. However, the sequential merge with rollback involves the Workflow calling `mergeWorktree` Activity multiple times in sequence (TSPEC S7). The rollback logic (revert first merge) is controlled by the Workflow, not the Activity in isolation. Consider marking this as Integration and testing with `TestWorkflowEnvironment` for the multi-merge scenario, while keeping unit tests for the individual `mergeWorktree` Activity's conflict detection.

### F-04: No property for `SkillActivityInput.taskType` and `documentType` correctness (Low)

**Severity:** Low

The TSPEC defines `SkillActivityInput` with `taskType` (e.g., "Create" vs "Revise") and `documentType` (e.g., "TSPEC", "REQ") fields that the Workflow must derive from phase config and revision state. No property explicitly verifies the Workflow populates these fields correctly for creation vs revision dispatches. PROP-TF-06 covers "correct agent ID, context bundle, and feature config" but doesn't mention `taskType`/`documentType`. This is derivable from PROP-TF-38 (revision → "Revise") but could be made explicit.

---

## Clarification Questions

### Q-01: How should PROP-TF-89 (workflow determinism) be tested?

PROP-TF-89 requires the workflow must not use `Date.now()`, `Math.random()`, or direct I/O. Is the intent to enforce this via a linting rule, a code review check, or an actual runtime test? Temporal's replay mechanism would surface non-determinism at runtime, but only intermittently. A static analysis approach (e.g., ESLint rule banning these APIs in workflow files) would be more reliable and could be verified as a unit test.

### Q-02: PROP-TF-31 — fork/join `ROUTE_TO_USER` sequential question processing order?

PROP-TF-31 states the workflow handles `ROUTE_TO_USER` in fork/join by "processing question flows sequentially." Is the order defined by config phase ordering of agents, or by the order in which Activities return `ROUTE_TO_USER`? The FSPEC (FSPEC-TF-04 ROUTE_TO_USER S1-5) and TSPEC (S5.3.3) should govern, but the property doesn't specify the ordering constraint. The test will need to know which agent's question is presented first.

---

## Positive Observations

1. **Comprehensive coverage.** 105 properties covering all 20 requirements and 6 FSPECs with zero gaps in the coverage matrix is thorough. The 90/10 unit-to-integration split is well-calibrated for a Temporal-based system where `TestWorkflowEnvironment` provides strong integration coverage.

2. **Negative properties (Section 4) are excellent.** PROP-TF-80 through PROP-CD-21 explicitly codify invariants that would be easy to violate during implementation. These will serve as strong regression guards — especially PROP-TF-83 (no-partial-merge), PROP-TF-85 (full re-dispatch), and PROP-TF-89 (determinism).

3. **Idempotency properties are well-defined.** PROP-TF-75..77 and PROP-MG-16..17 cover the key idempotency scenarios that are critical for crash recovery correctness.

4. **Gaps section is honest and actionable.** The 4 identified gaps (init, status, orphaned worktree pruning, timeout boundary) are real and appropriately triaged as Low/Med risk with concrete recommendations.

5. **Traceability is strong.** Every property has a clear Source column linking back to REQ/FSPEC/TSPEC sections, making it easy to verify spec compliance during implementation.

---

## Recommendation

**Approved with minor changes**

All findings are Low severity except F-01 (Medium). However, F-01 is a property *description* accuracy issue, not a missing coverage gap — the heartbeat timeout behavior *is* tested via PROP-TF-73 at the Integration level. The property text in PROP-TF-52 just needs correction to reflect the actual test mechanism (Temporal-detected timeout vs Activity-thrown error). Given that the underlying behavior is covered, this is a minor wording fix rather than a structural gap.

Suggested changes:
- **F-01:** Rewrite PROP-TF-52 to describe the Temporal-side timeout detection, or merge it into PROP-TF-73 (Integration) and remove the misleading Unit property.
- **F-02:** Add `startedAt` and `updatedAt` to PROP-TF-48's field list.
- **F-03:** Consider moving PROP-TF-56 to Integration or splitting it.
- **F-04:** Optionally add a property for `taskType`/`documentType` derivation.

---

*End of Review*
