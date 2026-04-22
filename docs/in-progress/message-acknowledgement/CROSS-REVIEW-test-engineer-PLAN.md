# Cross-Review: test-engineer — PLAN

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/PLAN-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 1

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | TASK-01 and TASK-02 are declared parallel, but TASK-02 cannot fully compile when it references `temporalClient.startWorkflowErrorValue` (set in AT-MA-10 and the "Additional" test) before TASK-01 adds that property to `FakeTemporalClient`. TypeScript will emit a type error at the test-file level, which means the TASK-02 agent cannot verify the test file compiles — and cannot run `npm test` to confirm the Red phase — until TASK-01 is complete. The PLAN's own note hedges this ("TASK-01 can be completed first within the same agent"), but the dependency graph still labels them parallel with no constraint. The guidance is contradictory: the diagram says parallel, the note says serial is acceptable. The task table should be unambiguous about the ordering constraint for TypeScript safety. | Section 2 (Dependency Graph), TASK-02 spec |
| F-02 | Low | AT-MA-13 ordering test instructs "If the test is flaky, add a third flush." The number of `await Promise.resolve()` flushes required to reach an `await` point inside `startNewWorkflow()` depends on the implementation's async chain depth, which is not yet written when TASK-02 is executed. Telling the TASK-02 agent to conditionally add a flush "if flaky" is non-deterministic guidance. A more robust pattern — or a note that the flush count should be adjusted after TASK-03 is written and the chain depth is known — would reduce the risk of a false Green if the implementation adds an extra await layer and the test stops catching the suspension point correctly. | TASK-02, AT-MA-13 implementation note |
| F-03 | Low | The plan specifies no explicit test asserting mutual exclusion of ✅ and ❌ on a single `handleMessage` invocation. AT-MA-01 asserts `addReactionCalls.length === 1` and `emoji === "✅"` (no ❌), and AT-MA-04 asserts `emoji === "❌"` (no ✅), which together implicitly guard this. However, neither test explicitly filters for the wrong emoji to assert its absence. A regression that emits both ✅ and ❌ on the success path would be caught by AT-MA-14's count filter (only for ✅) but would pass AT-MA-04 if both emojis were emitted on failure. The gap is narrow but present. This is addressed by REQ-NF-17-03 / BR-03 but has no dedicated assertion. | TASK-02, AT-MA-01, AT-MA-04; REQ-NF-17-03, BR-03 |
| F-04 | Low | The G4 regression update for `"does not post confirmation after delivering answer (BR-DR-08)"` adds `addReactionCalls.toHaveLength(1)` and `emoji === "✅"` assertions (TASK-02 section 2d). This means the test transitions from asserting absence of all feedback to asserting presence of a reaction. The PLAN correctly identifies this as a required update. However, the existing `expect(discord.postPlainMessageCalls).toHaveLength(0)` assertion in this test becomes a weaker guard after the change — it only checks that `postPlainMessage` was not called, but does not verify that `replyToMessage` is also absent. The PLAN adds `expect(discord.replyToMessageCalls).toHaveLength(0)` for this test, which is correct and sufficient. This finding is a confirmation that the guard is present, not a gap — recorded for traceability. | TASK-02, section 2d; FSPEC AT-MA-03 no-reply constraint |

## Questions

| ID | Question |
|----|---------|
| Q-01 | For AT-MA-13, is the implementation's `startNewWorkflow()` guaranteed to have exactly two `await` points before acknowledgement begins (making two `Promise.resolve()` flushes sufficient)? Or should the PLAN pin the flush count to match the known implementation structure in TASK-03, rather than leaving it as a "try 2, add 3 if flaky" instruction? |
| Q-02 | TASK-01 is marked as depending on "none" and TASK-02 is also marked as depending on "none," yet the PLAN's own note acknowledges TASK-02 needs TASK-01 for the AT-MA-10/Additional tests to compile. Should TASK-01 be listed as a soft prerequisite for TASK-02 in the task table, or should the AT-MA-10/Additional test stubs be written with a `// @ts-expect-error` comment until TASK-01 lands, so both tasks can truly run in parallel? |

## Positive Observations

- The TDD batch structure (Red → Green → Refactor across BATCH 1, 2, 3) is correctly sequenced. Verification instructions ("run `npm test` — all MA tests must be Red") at the end of TASK-02 and Green verification at the end of TASK-03 make the phase boundaries explicit and testable.
- The test catalogue in TASK-02 maps one-to-one to every FSPEC acceptance test (AT-MA-01 through AT-MA-16 plus the Additional non-Error object extension), with no FSPEC AT left unmapped. Coverage is complete.
- The regression update specification in sections 2c and 2d is precise: exact assertion text is provided for both removed and added assertions, leaving no ambiguity for the implementing agent about what changes in each of the five affected G3/G4 tests.
- The `startWorkflowErrorValue` design rationale (property-on-fake consistent with existing `startWorkflowError`, `signalError`, `queryWorkflowStateError` patterns) is well-justified and correctly aligned with how `FakeTemporalClient` works in the real factories file.
- The no-touch list (Section 6) and out-of-scope paths are exhaustive and match the FSPEC Section 2.2 exclusions exactly, reducing the risk of an implementing agent accidentally adding acknowledgement to excluded paths.
- The Definition of Done (Section 7) is measurable: every item corresponds to a specific test or `npm` command outcome. No subjective criteria are present.
- AT-MA-13's deferred-promise pattern is the correct approach for testing call ordering without a cross-fake sequence counter, as identified in the FSPEC TE cross-review. The implementation note is clear and actionable.

## Recommendation

**Approved with Minor Issues**

> F-01 is Medium: the parallelization contradiction between the dependency graph and the inline note creates an ambiguous execution contract for the implementing agent. The TASK-01 → TASK-02 compile-time dependency should be made explicit in the task table (either as a dependency annotation or by documenting the `@ts-expect-error` workaround if true parallelism is desired). This does not block implementation but should be resolved before the PLAN is handed off to the tech lead for orchestration, since the tech lead uses the dependency graph to decide dispatch order.
>
> F-02 and F-03 are Low and do not require revision before implementation begins. F-04 is informational.
