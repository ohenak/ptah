# Cross-Review: Test Engineer Review of FSPEC-011

| Field | Detail |
|-------|--------|
| **Document** | [011-FSPEC-orchestrator-pdlc-state-machine.md](011-FSPEC-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Test Engineer (`qa`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: Fullstack revision loop restarts ALL sub-tasks even when only one was rejected — testability gap (High)

FSPEC-RT-02 fullstack TSPEC_REVIEW edge case states: "Both TSPECs go back to creation for revision (the entire TSPEC_CREATION phase restarts)." This means the backend engineer is re-invoked with a "Revise" directive even when their TSPEC was approved. However:

1. **The revision context (FSPEC-CA-01) doesn't specify what the approved sub-task's author receives.** Does the backend engineer get a "Revise" directive with cross-review files showing their TSPEC was approved? This would be confusing — the directive says "revise" but the feedback says "approved."
2. **No acceptance test covers the partial-rejection fullstack scenario end-to-end.** AT-RL-06 covers the all-approved case. The fullstack edge case in FSPEC-RT-02 describes the behavior narratively but has no corresponding AT.

**Impact:** Testing the fork/join revision loop for partial rejection requires knowing (a) what directive each sub-task author receives, (b) whether the approved author must re-create or can simply re-submit, and (c) what cross-review files each receives. Without this, test assertions are ambiguous.

**Recommendation:** Either (a) add an acceptance test AT-RL-08 covering partial rejection in fullstack TSPEC_REVIEW with specific expected behavior for both engineers, or (b) change the revision behavior so only the rejected sub-task's author is re-invoked (simpler to test, but requires tracking per-sub-task review status separately).

---

### F-02: FSPEC-AI-01 artifact validation 3-attempt failure has no acceptance test (Medium)

Step 5 specifies "Maximum 2 re-invocation attempts. After 2 failures → pause via ROUTE_TO_USER." AT-DI-04 tests the first re-invocation but no acceptance test covers the escalation after 3 total attempts. This is a critical error path — a runaway agent that never produces an artifact must be caught.

**Impact:** Without an explicit AT, the max-retry escalation could be implemented incorrectly (e.g., off-by-one: 2 retries vs 3 total attempts).

**Recommendation:** Add AT-DI-07: "WHO: As the orchestrator GIVEN: agent returns LGTM for REQ_CREATION WHEN: artifact is missing after 3 invocation attempts THEN: feature pauses via ROUTE_TO_USER with message identifying the agent and expected path."

---

### F-03: BR-AD-03 wording contradicts the behavioral flow (Medium)

BR-AD-03 says: "Only the FIRST Recommendation heading is used. If multiple exist, the file is treated as unparseable (Failure Case 3)." The first sentence ("only the first is used") implies the system would use it, while the second sentence says it's unparseable. The behavioral flow step 8 is clear: multiple headings → Failure Case 3. The first sentence of BR-AD-03 is misleading.

**Impact:** An engineer implementing this may choose to use the first heading instead of treating it as unparseable, since the first sentence seems authoritative.

**Recommendation:** Remove the first sentence of BR-AD-03. Change to: "If multiple headings containing 'Recommendation' are found, the file is treated as unparseable (Failure Case 3)."

---

### F-04: FSPEC-RT-01 code block exclusion lacks parsing specificity (Medium)

Edge case: "Code blocks should be ignored during heading search. Only top-level headings are parsed." This doesn't specify:
1. Whether both fenced (`` ``` ``) and indented (4+ spaces) code blocks are excluded
2. Whether inline code (`` `Recommendation` ``) in a heading is still matched
3. Whether HTML comment blocks (`<!-- -->`) are excluded

**Impact:** Without clear rules, different implementations could behave differently. A test asserting "Recommendation inside fenced code block is ignored" might pass while "Recommendation in indented code block" fails.

**Recommendation:** Specify: "Fenced code blocks (delimited by `` ``` `` or `~~~`) are excluded from heading search. Indented code blocks are NOT excluded (they are uncommon in cross-review files). Inline code within a heading IS still matched — e.g., a heading `## \`Recommendation\`` is a valid match."

---

### F-05: FSPEC-SM-02 no acceptance test for missing `version` field (Low)

Edge case says: "State file contains valid JSON but no `version` field → Treat as schema version 0 → attempt migration from v0 if a v0→v1 migration exists, otherwise treat as corrupted." No AT covers this.

**Impact:** The v0 migration path is a boundary condition at the intersection of schema validation and migration logic. Without a test, it could silently fall through to "corrupted" when a v0→v1 migration does exist.

**Recommendation:** Add AT-PS-08: "WHO: As the orchestrator GIVEN: state file contains valid JSON with no version field and a v0→v1 migration exists WHEN: the orchestrator starts up THEN: migration runs from v0 to current version."

---

### F-06: FSPEC-AI-01 `TASK_COMPLETE` in non-terminal phase handling is ambiguous (Low)

Edge case: "Agent returns `TASK_COMPLETE` during a non-terminal phase → Log warning. Do NOT transition to DONE. Treat as LGTM." However, treating it as LGTM means artifact validation (step 5) would fire. If the agent truly meant TASK_COMPLETE, it likely didn't produce the expected artifact for this creation phase.

**Impact:** Treating TASK_COMPLETE as LGTM triggers artifact validation, which may fail, leading to re-invocation. The re-invocation message says "create the artifact" but the agent originally signaled it was done. This creates a confusing loop.

**Recommendation:** Add clarification: after treating TASK_COMPLETE as LGTM and failing artifact validation, the ROUTE_TO_USER message should include: "Agent signaled TASK_COMPLETE during {phase}, which is not a terminal phase. The expected artifact was not found."

---

## Clarification Questions

### Q-01: FSPEC-RT-02 collect-all-then-evaluate — what if a reviewer agent crashes and never produces a cross-review file?

The behavioral flow says the orchestrator waits for ALL reviewers to complete. If a reviewer agent fails catastrophically (crashes, times out, infinite loop), the feature would be stuck indefinitely with a reviewer in `pending` status. Is there a timeout or dead-letter mechanism? This is critical for testing the review lifecycle under failure conditions.

### Q-02: FSPEC-CA-01 revision context — how are "cross-review files from the failed review round" identified?

Step 2 says "Add ALL cross-review files from the failed review round." But cross-review files from multiple rounds may exist in the same directory (overwritten). Does the orchestrator track which files belong to which round, or does it glob for all matching `CROSS-REVIEW-*-{doc-type}.md` files? If files are overwritten each round, the latest files implicitly represent the most recent round — but this assumption needs to be explicit for testing.

---

## Positive Observations

- **P-01:** The collect-all-then-evaluate model (FSPEC-RT-02 BR-RL-03) is significantly more testable than early-exit. It creates a clean state transition: gather all inputs, then evaluate once. Tests can set up complete reviewer result sets and assert a single outcome.

- **P-02:** FSPEC-RT-01 (approval detection) is thoroughly specified with 3 distinct failure cases, each with actionable error messages. The 8 acceptance tests cover positive matches, case insensitivity, and all failure paths. This is the most critical integration point and it's well-tested by the spec.

- **P-03:** FSPEC-FC-01 (reviewer set computation) as a pure function `(phase, discipline) → reviewerSet` is ideal for exhaustive parameterized testing. The 15 cells in the reviewer computation table (5 phases × 3 disciplines) map directly to 15 test cases, plus the fullstack peer review detail table provides additional assertion targets.

- **P-04:** FSPEC-SM-02 (persistence) has excellent boundary coverage: empty file, corrupted JSON, missing version field, newer version, migration failure — each with defined behavior. The write path's fail-closed design (BR-PS-01) is the correct choice for state integrity.

- **P-05:** The revision bound mechanism (FSPEC-RT-02, max 3 cycles per phase) addresses the testability concern raised in the REQ cross-review (F-01). The resume behavior is also well-defined — reset count, re-enter review.

- **P-06:** FSPEC-AI-01's artifact validation with bounded retries (max 2 re-invocations) prevents unbounded agent loops. Combined with the revision bound, the system has termination guarantees at both the review and dispatch levels.

- **P-07:** The fullstack `reviewer_id:document_scope` pair tracking (FSPEC-RT-02 BR-RL-06) is a clean solution to the multi-document review problem. The pair structure creates unambiguous status entries that can be individually tested.

---

## Summary

This is a comprehensive, well-structured FSPEC that resolves the behavioral complexity identified in the REQ. The 7 functional specifications cover all the decision points that need product-level specification. The acceptance tests are in proper format and cover the primary paths well.

The main testability concerns are:

1. **Fullstack partial-rejection revision loop** (F-01, High) — the most complex scenario in the system lacks an acceptance test and has ambiguous behavior for the approved sub-task's author
2. **Artifact validation escalation** (F-02, Medium) — missing AT for the 3-attempt failure path
3. **BR-AD-03 contradictory wording** (F-03, Medium) — could lead to wrong implementation
4. **Code block exclusion parsing rules** (F-04, Medium) — needs specificity for test assertions

F-05 and F-06 (Low) are minor gaps that can be addressed in TSPEC.

The 2 clarification questions (Q-01 reviewer timeout, Q-02 cross-review file round identification) affect error-path test design and should be resolved before TSPEC creation.

**Recommendation: Approved with minor changes** — address F-01 (add AT for fullstack partial rejection), F-02 (add AT for max-retry escalation), and F-03 (fix BR-AD-03 wording). F-04 through F-06 can be deferred to TSPEC.
