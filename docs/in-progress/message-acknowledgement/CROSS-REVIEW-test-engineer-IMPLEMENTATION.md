# Cross-Review: Test Engineer — IMPLEMENTATION-message-acknowledgement

**Reviewer Role:** Senior Test Engineer
**Document Reviewed:** Implementation + test suite on feat-message-acknowledgement
**Review Date:** 2026-04-21
**Recommendation:** Approved with Minor Issues

---

## Summary

All 33 PROPERTIES defined in PROPERTIES-message-acknowledgement v1.2 are covered by the 94-test suite. Every test passes against the implementation. The two regression guards (no reaction on `WorkflowExecutionAlreadyStartedError`, no reaction on query failure early-exit) are correctly specified in PROP-MA-28 and PROP-MA-27 respectively and are tested by dedicated assertions. Three low-severity observations are noted below; none block shipment.

---

## Findings

### Finding 1: PROP-MA-23 and PROP-MA-24 (channelId / messageId sourcing) are not exercised on the signal-routing path

- **Severity:** Low
- **Location:** `temporal-orchestrator.test.ts` — AT-MA-03 and the broader MA suite
- **Issue:** PROP-MA-23 asserts that `channelId` in `addReaction` and `replyToMessage` equals `message.threadId` (not `message.parentChannelId`). PROP-MA-24 asserts `messageId` equals `message.id`. Both tests (labeled PROP-MA-23 and PROP-MA-24) use only the workflow-start path fixture. The signal-routing success path (AT-MA-03 / PROP-MA-02) verifies the emoji is `"✅"` and that no reply is posted, but does not assert `channelId === message.threadId` or `messageId === message.id` for `addReaction` on that path. If a future refactor changes how `message.threadId` or `message.id` is threaded through `handleStateDependentRouting`, the sourcing bug would go undetected.
- **Recommendation:** Add a signal-routing-path variant of PROP-MA-23/24: seed a message with distinct `threadId` and `parentChannelId`, set `phaseStatus: "waiting-for-user"`, and assert `addReactionCalls[0].channelId === message.threadId` and `addReactionCalls[0].messageId === message.id`. This is a two-line extension to AT-MA-03 or a separate test.

---

### Finding 2: AT-MA-13 ordering test uses microtask flush count that is fragile to implementation changes

- **Severity:** Low
- **Location:** `temporal-orchestrator.test.ts` — AT-MA-13 (PROP-MA-19)
- **Issue:** AT-MA-13 verifies that acknowledgement calls are not issued before the Temporal operation resolves. It does this by injecting a deferred promise into `startFeatureWorkflow`, flushing 3 `await Promise.resolve()` calls, checking that `addReactionCalls.length === 0`, then resolving the deferred and checking that `addReactionCalls.length === 1`. The flush count of 3 corresponds to the current chain depth (`queryWorkflowState` → `phaseDetector.detect` → `startFeatureWorkflow`). If the implementation adds an additional `await` before `startFeatureWorkflow` — for example, a guard check or a config lookup — the deferred may not have been reached by checkpoint 1, making the zero-count assertion trivially pass while concealing an ordering regression. The test's dual-checkpoint design (0 before, 1 after) does prevent a fully vacuous pass, but checkpoint 1 would stop being meaningful.
- **Recommendation:** Add an explicit signal inside the deferred callback to confirm `handleMessage` has reached the `startFeatureWorkflow` call before the checkpoint-1 assertion. Alternatively, document the 3-flush assumption with a comment noting that it must be updated if the await chain depth changes.

---

### Finding 3: PROP-MA-12 test is labeled "Additional" rather than by property ID

- **Severity:** Low
- **Location:** `temporal-orchestrator.test.ts` — the test labeled `"Additional: non-Error object thrown value uses String(err) ([object Object]) in error reply"`
- **Issue:** PROP-MA-12 (non-Error object thrown value → `String(err)` → `"[object Object]"`) has one test covering it, but the test name does not include "PROP-MA-12" or an AT-MA reference. Every other new property in the MA suite uses an explicit `AT-MA-NN` or `PROP-MA-NN` label. Without the label, automated traceability tooling or future reviewers cannot quickly identify which property this test covers.
- **Recommendation:** Rename the test to `"AT-MA-10b"` or `"PROP-MA-12: non-Error object thrown value uses String(err) ([object Object]) in error reply"` to match the labeling convention used throughout the MA suite.

---

## Positive Observations

- **All 33 PROPERTIES covered, all 94 tests pass.** Full verification was performed by running `vitest run` against the implementation on `feat-message-acknowledgement`. Every `AT-MA-*` and `PROP-MA-*` test resolves correctly.

- **Regression guards are correctly implemented.** PROP-MA-27 (`queryWorkflowState` failure → zero reactions) and PROP-MA-28 (`WorkflowExecutionAlreadyStartedError` → zero reactions, zero replies, plain-message unchanged) are each covered by dedicated tests with explicit assertions. AT-MA-15 and the PROP-MA-28 test both use negative assertions (`toHaveLength(0)`) that would fail if the implementation mistakenly added an acknowledgement call on those excluded paths.

- **Pre-existing tests correctly updated.** The G3 ("starts workflow and posts confirmation"), G4 ("does not post confirmation after delivering answer"), and G4 ("posts error when user-answer signal delivery fails") tests were all migrated from `postPlainMessageCalls` assertions to `addReactionCalls` / `replyToMessageCalls` assertions consistent with the new acknowledgement API. No pre-existing test was left asserting the old `"Started workflow..."` plain-message format that is no longer emitted on the workflow-start path.

- **`ackWithWarnOnError` helper design.** Extracting all acknowledgement calls through a single `ackWithWarnOnError` wrapper gives the swallowing behaviour a single place of definition. Every test that exercises ack failure (AT-MA-11, AT-MA-12, AT-MA-16, PROP-MA-16, PROP-MA-18, PROP-MA-33) is testing the same helper, so a change to its logic would be caught by all of them simultaneously.

- **Fake extensions correctly implemented.** Both prerequisites from PROPERTIES v1.2 (P-01: `FakeTemporalClient.startWorkflowErrorValue`, P-02: `FakeDiscordClient.addReactionErrorValue`) are present in `factories.ts` and exercised by AT-MA-10, the "Additional" test (PROP-MA-12), and PROP-MA-18. The injection check order (value field before error field) is correct in both fakes.

- **PROP-MA-29 guard against rogue "query workflows" label.** The PROP-MA-29 test exercises three distinct scenarios in a single test (nominal success, workflow-start failure, query failure early-exit) and asserts that no `replyToMessage` call ever uses the `"Failed to query workflows:"` prefix. This multi-scenario structure provides broader regression coverage than a single-scenario test would.

- **PROP-MA-33 closes the failure-path call-independence gap.** The addition of PROP-MA-33 (addReaction on ❌ path throws → replyToMessage still called) ensures that the `ackWithWarnOnError` independence invariant is tested on the error path, not just the success path (PROP-MA-15). This is the correct resolution of G-05 noted in the PROPERTIES v1.2 gap log.

---

## Recommendation

**Approved with Minor Issues**

The three findings are all Low severity. Finding 1 (signal-routing path not covered by channelId/messageId sourcing tests) is the most actionable and represents a genuine gap in PROP-MA-23/24 coverage, though the mechanism is tested on the workflow-start path and the implementation shares a single code path for both. Findings 2 and 3 are quality-of-life improvements. None of the findings indicate a correctness defect in the implementation or a falsely passing test. The feature is ready to ship; the findings should be addressed in a follow-up before the branch is closed.
