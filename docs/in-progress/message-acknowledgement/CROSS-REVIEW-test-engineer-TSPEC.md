# Cross-Review: test-engineer — TSPEC

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/TSPEC-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | AT-MA-10 requires `FakeTemporalClient.startFeatureWorkflow` to throw a non-Error string, but the fake only accepts `startWorkflowError: Error \| null`. The TSPEC acknowledges this and says "a custom subclass or direct override ... is used", but provides no concrete guidance on what that override looks like. Without a code-level pattern, engineers will either skip this test or write it incorrectly (e.g. using a subclass of Error, which would hit the `instanceof Error` branch instead of the `String(err)` branch, rendering the test invalid). The "Additional" variant that throws `{ code: 503 }` has the same problem. | Section 7.4 AT-MA-10 and "Additional" test |
| F-02 | Medium | AT-MA-03 asserts `discord.postPlainMessageCalls.filter(c => c.threadId === message.threadId)` but `FakeDiscordClient.postPlainMessageCalls` records entries with `{ threadId, content }` (not `channelId`). The TSPEC notes this correctly in the AT-MA-03 block ("Note: `postPlainMessageCalls` filter uses `c.threadId`"). However, the same note contradicts the FSPEC AT-MA-03 which filters with `c.channelId`. One of the two documents has the wrong field name. Engineers implementing from the TSPEC will produce correct code; engineers implementing from the FSPEC will write a broken assertion. The inconsistency is a defect risk. | Section 7.4 AT-MA-03 note vs. FSPEC AT-MA-03 Then clause |
| F-03 | Low | AT-MA-13 (ordering test) uses a deferred-promise technique that requires overriding `startFeatureWorkflow` on the `FakeTemporalClient` instance. The TSPEC says "override `startFeatureWorkflow` on the `FakeTemporalClient` instance for this test only" but does not show how the two assertion checkpoints are implemented in Vitest. Specifically, calling `handleMessage()` without `await`, then checking call counts at a suspension point, requires careful use of microtask scheduling (`await Promise.resolve()` or similar). Without this detail, the test is easy to write incorrectly and may pass vacuously (both counts already 0 at the time of the first check because the deferred promise never yielded). | Section 7.4 AT-MA-13 |
| F-04 | Low | The TSPEC does not specify how the `formatErrorMessage` helper is tested in isolation. Both AT-MA-08/AT-MA-09 (truncation boundary) and the AT-MA-10/Additional (non-Error thrown value) tests exercise `formatErrorMessage` only through the full `handleMessage()` invocation path. A direct unit test of the pure helper (e.g. `formatErrorMessage(new Error("x".repeat(201)))`) would be faster, simpler to diagnose on failure, and would provide explicit coverage of the 200-character slice boundary without requiring the full orchestrator setup. The TSPEC justifies placing all tests in `temporal-orchestrator.test.ts` (Section 7.1), but does not address whether the helper is also testable in isolation given that it is a private method. If it is not separately testable, the TSPEC should acknowledge that AT-MA-08 and AT-MA-09 are the only coverage path and that they must be precise enough to serve that role. | Section 7.1, Section 7.4 AT-MA-08/AT-MA-09 |
| F-05 | Low | The regression table (Section 7.5) identifies five existing tests that require updates. It does not state whether `postPlainMessageCalls` assertions in `G3` and `G4` tests that are NOT listed (e.g. the `WorkflowExecutionAlreadyStartedError` test, which continues to use `postPlainMessage`) need complementary `addReactionCalls.toHaveLength(0)` assertions to guard against accidental reaction injection on unchanged paths. Without explicit negative assertions on those paths, a regression where the implementation incorrectly fires `addReaction` on the `WorkflowExecutionAlreadyStartedError` path would not be caught by the test suite. | Section 7.5 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | For AT-MA-10 and the "Additional" test, what is the recommended mechanism for overriding `startFeatureWorkflow` to throw a non-Error value? Is the intent to temporarily reassign the method on the instance (e.g. `temporalClient.startFeatureWorkflow = async () => { throw "string" }`)? If so, should the TSPEC show this pattern explicitly to prevent engineers from accidentally passing an Error subclass? |
| Q-02 | AT-MA-13 checks "call counts at the suspension point (before deferred resolves)". In an async Vitest test, what exact mechanism is proposed for observing the intermediate state? A `await Promise.resolve()` flush? A manual tick? Without this, the test may pass trivially (because `handleMessage` hasn't run at all yet). |
| Q-03 | The TSPEC states `formatErrorMessage` is a private method (Section 5). Does the team intend to expose it as `package-private` or via a test accessor to enable direct unit testing, or are AT-MA-08/AT-MA-09 the definitive coverage path? |

---

## Positive Observations

- The test catalogue (Section 7.4) maps precisely to FSPEC acceptance tests. The one-to-one AT numbering makes traceability trivial.
- The TSPEC correctly identifies all five affected regression tests in Section 7.5 with explicit before/after assertion descriptions — this is unusually thorough and directly actionable.
- The `FakeDiscordClient` and `FakeTemporalClient` infrastructure is already complete for all in-scope tests. The claim that no new fake infrastructure is required is verified: `addReactionCalls`, `addReactionError`, `replyToMessageCalls`, `replyToMessageError`, and `FakeLogger.entriesAt()` are all present in `factories.ts`.
- The decision to add all new tests to the existing `temporal-orchestrator.test.ts` (Section 7.1) is appropriate — the describe-group pattern used in the file scales cleanly to the new `describe("handleMessage — message acknowledgement (MA)")` block.
- Truncation boundary tests AT-MA-08 and AT-MA-09 cover both sides of the 200/201 boundary, satisfying the exact-boundary requirement from REQ-MA-05 and FSPEC BR-06.
- The partial-failure test AT-MA-12 (reaction fails, reply still sent) directly validates the independence invariant from FSPEC-MA-06 and REQ-MA-06. This is the most commonly omitted test in ack-swallow patterns, and its presence here is commendable.
- AT-MA-15 (no ack on query failure early-exit) explicitly guards the out-of-scope boundary, preventing engineers from accidentally adding acknowledgement to the early-exit path.
- AT-MA-16 (dual ack failure) validates the two-WARN scenario, which would otherwise only be exercised by manual testing.

---

## Recommendation

**Approved with Minor Issues**

F-01 and F-02 are Medium severity. F-01 (no concrete pattern for throwing non-Error values in `FakeTemporalClient`) is likely to produce an invalid test that silently passes without actually exercising the `String(err)` branch. F-02 (field name inconsistency between TSPEC and FSPEC for `postPlainMessageCalls` filter) is an inter-document defect that will cause one document's AT-MA-03 implementation to have a broken assertion. Both should be resolved before implementation begins. The Low findings are improvements rather than blockers.
