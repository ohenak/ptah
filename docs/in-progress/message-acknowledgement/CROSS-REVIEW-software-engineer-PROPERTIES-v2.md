# Cross-Review: software-engineer — PROPERTIES

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/PROPERTIES-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 2

---

## Prior Findings — Resolution Status

| Prior ID | Severity | Resolution |
|----------|----------|-----------|
| SE-F01 | High | **Resolved.** Prominent PREREQUISITES block added before Section 1. P-01 documents `startWorkflowErrorValue` required for PROP-MA-11 and PROP-MA-12 with explicit PLAN TASK-01 reference. Section 2 infrastructure table marks the field as not-yet-in-fake. |
| SE-F02 | High | **Resolved.** PROP-MA-18 redesigned to use `addReactionErrorValue?: unknown` injection. P-02 added to PREREQUISITES section. Section 2 infrastructure table includes the new field with "prerequisite P-02; not yet in fake" note. |
| SE-F03 | Medium | **Resolved.** PROP-MA-20 redesigned to assert both per-method call arrays contain exactly one entry. G-02 updated with rationale. No global cross-method sequence array required. |
| SE-F04 | Medium | **Resolved.** PROP-MA-30 description now reads "Branch B" matching the TSPEC labeling of `startNewWorkflow()`. |
| SE-F05 | Low | **Open (unchanged).** PROP-MA-23 fixture setup note does not explicitly state that the default `parentChannelId: "parent-1"` already differs from `threadId: "thread-test"`, making the test trivially green for the wrong reason if the implementer uses defaults without examining the distinction. |
| SE-F06 | Low | **Open (unchanged).** PROP-MA-19 still specifies two `await Promise.resolve()` flushes. PLAN AT-MA-13 carries the same two-flush pattern with "add third if flaky" fallback. The actual call graph through `handleMessage` → `queryWorkflowState` (awaited) → `startNewWorkflow` → `phaseDetector.detect` (awaited) → `startFeatureWorkflow` (awaited) requires at minimum 3 microtask flushes to reach the `startFeatureWorkflow` await point. With only two flushes, checkpoint 1 assertions may pass vacuously before the deferred is invoked. |
| SE-F07 | Low | **Open (unchanged).** PROP-MA-13 (`content.length === 226`) remains derivable from PROP-MA-09 assertions and is not a distinct invariant. Not merged or scoped to a unique invariant. |
| SE-F08 | Low | **Resolved.** PROP-MA-33 added as a named property for the failure-path `replyToMessage` independence invariant. G-05 marked as resolved. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| SE2-F01 | Medium | P-02 prerequisite has no PLAN task. PREREQUISITES section correctly flags P-02 as "Not yet in PLAN — must be added," but the PLAN has not been updated to include a task for adding `addReactionErrorValue?: unknown` to `FakeDiscordClient`. PLAN TASK-01 covers only `FakeTemporalClient`. Without a corresponding PLAN task, the `addReactionErrorValue` field may be omitted or deferred without a formal tracking mechanism. PROP-MA-18 will not compile (TypeScript will reject `discord.addReactionErrorValue` as unknown property) until this change is made to `factories.ts`. The PROPERTIES document itself correctly identifies this gap but does not escalate it into an actionable PLAN item. | PREREQUISITES P-02, PROP-MA-18, PLAN Task Table |
| SE2-F02 | Medium | Persistent FSPEC/TSPEC Branch A/B contradiction unresolved. FSPEC Section 1 (Implementation Note) assigns Branch A to `startNewWorkflow()` and Branch B to `handleStateDependentRouting()`. TSPEC Section 1 assigns Branch B to `startNewWorkflow()` and Branch A to `handleStateDependentRouting()`. This reversal is directly contradictory. SE-F04 corrected PROP-MA-30 from "Branch A" to "Branch B" to match the TSPEC — which is correct for the TSPEC's labeling — but the FSPEC-sourced tests and implementer reading FSPEC will encounter the opposite label assignment. PROP-MA-30 now matches TSPEC, TSPEC Section 7.5 regression table, and TSPEC Section 9 out-of-scope table, but contradicts FSPEC Section 2.2 item 12 which states "pre-`startWorkflowForFeature()` guard inside Branch **A**." This is a persistent cross-document inconsistency that could cause confusion during implementation. | PROP-MA-30, FSPEC Section 2.2 item 12, TSPEC Section 1, TSPEC Section 9 |
| SE2-F03 | Low | PROP-MA-18 pass condition does not assert that `handleMessage()` resolves without throwing. PROP-MA-14 explicitly lists "Promise resolves (does not reject)" as part of the pass condition, correctly verifying the error-swallowing behavior for an Error-typed thrown value. PROP-MA-18 tests the equivalent scenario with a non-Error thrown value (`addReactionErrorValue = "rate limit exceeded"`), but its pass condition only checks the WARN log message format. A buggy implementation that re-throws the non-Error value (e.g., by using `throw ackErr` inside a partially-implemented `ackWithWarnOnError`) would not be caught by PROP-MA-18 alone — it would require PROP-MA-14 to detect the regression only for Error-typed values. The pass condition should include: "Promise resolves (does not reject) AND WARN entry message equals `'Acknowledgement failed: rate limit exceeded'`." | PROP-MA-18, PROP-MA-14 |
| SE2-F04 | Low | PROP-MA-23 fixture note still does not make the distinction explicit. The property creates a message with `threadId: "thread-test"` and relies on the default `parentChannelId: "parent-1"` for the distinctness assertion. There is no fixture-level comment in the property asserting that `"parent-1" !== "thread-test"`. An implementer who reads only the pass condition ("All `channelId` values in both call arrays equal `message.threadId`") without examining the fixture defaults may not understand what distinguishes this test from PROP-MA-01 (which also asserts `channelId === message.threadId`). The property would be more defensible with an explicit setup step: "Create message with `threadId: "thread-test"`, `parentChannelId: "parent-1"` (the default differs from threadId, confirming the assertion does not vacuously pass when both are equal)." | PROP-MA-23 |
| SE2-F05 | Low | PROP-MA-19 two-flush deferred pattern is still under-specified for the actual await depth. The PLAN AT-MA-13 uses two flushes with a comment "if flaky, add a third." The call graph from `handleMessage` to `startFeatureWorkflow` passes through: (1) `queryWorkflowState` await, (2) `phaseDetector.detect` await, (3) `startFeatureWorkflow` await. Two microtask flushes advance the queue by two `await` continuations. Since `startFeatureWorkflow` is the third `await` in the chain, two flushes may not reliably pause execution at the deferred promise. The checkpoint 1 assertion (`addReactionCalls.length === 0`) can pass vacuously if the test doesn't actually pause before the deferred resolves. Recommend specifying a minimum of 3 flushes in PROP-MA-19 (one per awaited call before the deferred), or documenting the exact microtask queue depth required, to prevent a silently non-testing checkpoint. | PROP-MA-19, PLAN AT-MA-13 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Is the FSPEC Branch A/B labeling intentionally reversed from the TSPEC, or is one of them a documentation error? The implementer who reads FSPEC first will encounter the opposite mapping from the implementer who reads TSPEC first. Which document should be treated as authoritative for branch labels? |
| Q-02 | PROP-MA-18 relies on `addReactionErrorValue` being added to `FakeDiscordClient` before implementation begins. Should this be elevated to a blocking PLAN task (TASK-00 or a TASK-01 sibling) comparable to how TASK-01 covers `startWorkflowErrorValue`? Or is the PREREQUISITES note in the PROPERTIES document considered a sufficient work-order? |
| Q-03 | PROP-MA-19's checkpoint 1 assertions rely on the test actually pausing at the `startFeatureWorkflow` await point. Has the flush count been empirically verified in the existing test suite environment (Node.js 20, vitest), or is it based on theoretical microtask queue reasoning? If not verified, should the property specify a flush count that errs on the side of over-flushing? |

---

## Positive Observations

- The PREREQUISITES block is a genuine improvement over v1.0. Both P-01 and P-02 are clearly scoped with type signatures, affected properties, and implementation rationale. The "not yet in fake" labeling in Section 2 removes any ambiguity about what is currently present versus what must be added.
- PROP-MA-18's redesign using `addReactionErrorValue` is consistent with the `startWorkflowErrorValue` pattern established by TASK-01. The injection mechanism is symmetric and avoids per-test method overriding, which aligns with the existing fake design patterns in `factories.ts`.
- PROP-MA-20's resolution (F-03) is pragmatic and technically sound. Asserting both per-method arrays contain exactly one entry after a single invocation is a defensible substitute for a global call-sequence array. G-02 correctly notes that the assertion should be tightened if a sequence array is ever added.
- PROP-MA-33 closes the only genuine coverage gap identified in v1 (G-05). The property is scoped to the failure path (❌ reaction path), correctly distinguishing it from PROP-MA-15 which covers the success path.
- The coverage matrix (Section 4) correctly documents PROP-MA-11 and PROP-MA-12 with "(P-01 prereq)" and PROP-MA-18 with "(P-02 prereq)" annotations, giving the implementer an at-a-glance view of which tests have infrastructure dependencies.
- G-06 disposition is well-reasoned: correctly notes that `addReactionError: Error | null` cannot inject non-Error values, the proposed `addReactionErrorValue?: unknown` mechanism is analogous to the established `startWorkflowErrorValue` pattern, and the prerequisite is clearly flagged as not-in-PLAN requiring addition.

---

## Recommendation

**Need Attention**

> SE2-F01 (Medium): The `addReactionErrorValue` field required by PROP-MA-18 has no PLAN task. Either (a) update the PLAN to add a task for extending `FakeDiscordClient` with `addReactionErrorValue?: unknown` (analogous to PLAN TASK-01 for `FakeTemporalClient`), or (b) elevate the PREREQUISITES note into a PLAN amendment explicitly. Without a PLAN task, this fake change has no implementation owner or sequencing position, and PROP-MA-18 will not compile.

> SE2-F02 (Medium): The FSPEC/TSPEC Branch A/B inversion is a persistent cross-document inconsistency. One document must be corrected to align with the other. Recommend choosing the TSPEC as authoritative (since PROP-MA-30 already reflects TSPEC labeling) and updating FSPEC Section 2.2 item 12 from "Branch A" to "Branch B" for the phase-detection failure path.

> SE2-F03 (Low): Add "Promise resolves (does not reject)" to PROP-MA-18's pass condition. This is a one-line addition that closes a meaningful verification gap — without it, a partially-implemented `ackWithWarnOnError` that re-throws non-Error values would not be detected by this property.
