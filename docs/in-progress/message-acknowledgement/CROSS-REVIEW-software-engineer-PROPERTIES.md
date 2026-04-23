# Cross-Review: software-engineer — PROPERTIES

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/PROPERTIES-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | High | `startWorkflowErrorValue` does not exist in `FakeTemporalClient`. The current `FakeTemporalClient.startFeatureWorkflow()` (factories.ts line 1449) only checks `this.startWorkflowError: Error | null`. PROP-MA-11 and PROP-MA-12 reference `startWorkflowErrorValue` in their testable assertions, but this property does not exist on the fake yet — it is added by PLAN TASK-01. The PROPERTIES document lists `startWorkflowErrorValue` in the Test Infrastructure Reference table (Section 2) as if it already exists. This is misleading: implementation is blocked on TASK-01, which the PROPERTIES document does not explicitly note (only G-03 mentions it in passing). | Section 2 (Infrastructure table), PROP-MA-11, PROP-MA-12, G-03 |
| F-02 | High | PROP-MA-18 is not exercisable with the current `FakeDiscordClient`. `addReactionError` is typed as `Error | null` (factories.ts line 625). Injecting a non-Error string requires overriding `addReactionError` to `unknown` or monkey-patching `addReaction` on the instance. The test assertion in PROP-MA-18 ("inject a non-Error thrown value from `addReaction()`") has no corresponding mechanism in the existing fake. The property must either be qualified with an implementation note or the fake must be extended (similarly to how `startWorkflowErrorValue` extends `FakeTemporalClient`). | PROP-MA-18 |
| F-03 | Medium | PROP-MA-20 (ordering: `addReaction` before `replyToMessage`) requires instrumenting a "global call-order sequence" that does not exist in `FakeDiscordClient`. The existing fake records `addReactionCalls` and `replyToMessageCalls` as separate arrays with no interleaved ordering information. Gap G-02 acknowledges this but the property is written as if the mechanism already exists ("Instrument `FakeDiscordClient` to record a global call-order sequence"). The property is not testable as written without a fake change, yet no corresponding TASK exists in the PLAN to add it. | PROP-MA-20, G-02 |
| F-04 | Medium | PROP-MA-30 references `FakePhaseDetector.detectError` — this field exists in factories.ts (line 1608) — but the property description says "pre-`startWorkflowForFeature()` guard inside Branch A". This is incorrect: `phaseDetector.detect()` is called inside `startNewWorkflow()`, which is on Branch B (no running workflow), not Branch A. The incorrect branch label could mislead the implementer about which code path is under test. | PROP-MA-30 |
| F-05 | Medium | PROP-MA-23 asks to create a message where `threadId !== parentChannelId`. `createThreadMessage` does accept a `parentChannelId` option (factories.ts line 1094–1105) with a default of `"parent-1"`, so this is feasible. However, the property does not assert that `parentChannelId` is also distinct from `"thread-test"` in the fixture setup — if a test uses the default `parentChannelId: "parent-1"` alongside `threadId: "thread-test"` these are already distinct. The assertion is technically sound but the fixture note should be explicit that the default `parentChannelId` already differs from `"thread-test"` — making this test trivially green from the fixture alone. This could mask incorrect implementations that accidentally route to `threadId` for non-related reasons. | PROP-MA-23 |
| F-06 | Low | PROP-MA-19 uses a deferred-promise pattern with two sequential `await Promise.resolve()` flushes to advance past the `await` inside `startNewWorkflow()`. The PLAN (TASK-02, AT-MA-13) notes "If the test is flaky, add a third flush." Microtask flushing via `Promise.resolve()` chains is inherently fragile in Node.js when code under test includes multiple `await` points (phase detection adds at least one additional `await` before `startWorkflowForFeature`). In the actual `startNewWorkflow`, there is an `await this.phaseDetector.detect(slug)` call before `await this.startWorkflowForFeature(...)`. At minimum 3 flushes are needed (one for `queryWorkflowState`, one for `detect`, one for `startFeatureWorkflow`). Two flushes will not reliably reach the `startFeatureWorkflow` await point — the "checkpoint 1" assertions will be checked before the deferred is even invoked, making the test vacuously pass at checkpoint 1. | PROP-MA-19 |
| F-07 | Low | PROP-MA-13 duplicates coverage already provided by PROP-MA-09. Both use `new Error("x".repeat(200))` and assert on the prefix and total content length. PROP-MA-09 already asserts `content.startsWith("Failed to start workflow: ")` AND `content.slice(...).length === 200` AND `content.endsWith("x".repeat(200))`. PROP-MA-13 adds `content.length === 226` — which is derivable from the PROP-MA-09 assertions — but is not a distinct invariant. The coverage matrix lists both under REQ-MA-02 and FSPEC BR-06. One of them (PROP-MA-13) should either be merged into PROP-MA-09 or clearly scoped to a distinct invariant (e.g., testing the `"route answer"` prefix independently). | PROP-MA-09, PROP-MA-13, Coverage matrix |
| F-08 | Low | G-05 (Gaps section) notes the absence of a property guarding `replyToMessage` call independence on the ❌ failure path (i.e., `addReaction` fails during a Temporal error path, `replyToMessage` still fires). The gap is acknowledged and correctly identified, but no resolution is proposed in the PROPERTIES document itself — the gap simply trails off: "Add a supplementary test: given `startWorkflowError` throws AND `addReactionError` throws...". This test is not listed as PROP-MA-33 or any numbered property, so it will not be in the implementation scope unless explicitly elevated to a named property. | G-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-MA-18 injects a non-Error value through `addReaction`. Since `FakeDiscordClient.addReactionError` is typed `Error | null`, will this require a type change to `Error | unknown | null`, or a per-test method override on the fake instance? If the latter, is that consistent with the existing pattern used for `startWorkflowErrorValue`? |
| Q-02 | PROP-MA-19's two-flush deferred pattern is in the PROPERTIES but the actual code path has three awaited async points before `startWorkflowForFeature` resolves (`queryWorkflowState`, `phaseDetector.detect`, and `startFeatureWorkflow` itself). Should the flush count in the property be updated to reflect the real call graph, or should the property use a more robust synchronization mechanism (e.g., a spy on `discord.addReaction` resolved by the deferred)? |
| Q-03 | G-05 identifies a missing property for the failure-path independence of `replyToMessage` when `addReaction` fails. Should this be added as PROP-MA-33, or is G-05's "supplementary test" note sufficient and will be handled at implementation time? |
| Q-04 | PROP-MA-20's ordering assertion requires a shared call-sequence array in `FakeDiscordClient`. Is this expected to be added as part of TASK-01 / TASK-02, or is it out of scope for this PROPERTIES version? If out of scope, should PROP-MA-20 be marked as "pending infrastructure" rather than listed as a testable property? |

---

## Positive Observations

- The fake compatibility check is thorough: all `FakeDiscordClient` fields referenced (`addReactionCalls`, `addReactionError`, `replyToMessageCalls`, `replyToMessageError`, `postPlainMessageCalls`) are confirmed present in factories.ts with the correct types and shapes. The property assertions will compile cleanly against the existing fake.
- The 10-category taxonomy (Functional, Data Integrity, Error Handling, Ordering, Idempotency, Contract, Regression, Observability) is well-structured and maps to distinct invariant classes rather than simply repeating the FSPEC acceptance tests.
- The negative properties (PROP-MA-04, PROP-MA-22, PROP-MA-26 through PROP-MA-30) are substantive and cover important out-of-scope-path regressions. In particular, PROP-MA-28 (no reaction on `WorkflowExecutionAlreadyStartedError`) and PROP-MA-27 (no reaction on query failure) directly guard against scope creep in the implementation.
- G-03 correctly identifies that TSPEC Section 7.2 is wrong about "no fake changes required" and defers to PLAN TASK-01 as authoritative. This cross-document reconciliation reduces the risk of an implementer following the wrong source of truth.
- PROP-MA-17 (dual ack failure: two independent WARN entries) is correctly scoped and maps directly to the `ackWithWarnOnError` independence invariant in TSPEC Section 4.1.
- Regression update guidance cross-referenced from TSPEC Section 7.5 is accurate: the five affected tests in G3/G4 are identified, and the distinction between modified tests and the unchanged `WorkflowExecutionAlreadyStartedError` test is preserved.
- PROP-MA-32 (no ERROR-level log for ack failures) adds a negative observability property that is not explicitly in the FSPEC acceptance tests, preventing over-eager error logging in the implementation.

---

## Recommendation

**Need Attention**

> F-01 (High): `startWorkflowErrorValue` is listed in Section 2 as existing infrastructure but does not exist in the current fake. The PROPERTIES document must add an explicit prerequisite note at the top of Section 2 (or a dedicated "Infrastructure Prerequisites" subsection) stating that PROP-MA-11 and PROP-MA-12 require PLAN TASK-01 to be completed first.

> F-02 (High): PROP-MA-18 has no injection mechanism for a non-Error value through `addReactionError`. Either (a) extend the PROPERTIES document to specify a `FakeDiscordClient` change analogous to `startWorkflowErrorValue` (a new `addReactionErrorValue?: unknown` property), or (b) rewrite PROP-MA-18 to use per-test method override syntax and document that pattern explicitly.

> F-03 (Medium): PROP-MA-20 is not testable without a fake change. Either add a PLAN task for a shared call-sequence array on `FakeDiscordClient`, or downgrade PROP-MA-20 to a documented gap with disposition "pending infrastructure" and add the ordering assertion as a note within PROP-MA-01/PROP-MA-03 (since sequential awaits already provide the guarantee structurally).

> F-04 (Medium): Correct "Branch A" to "Branch B" in PROP-MA-30's description.

> F-06 (Low): Update the deferred-promise flush count in PROP-MA-19 to account for `queryWorkflowState` and `phaseDetector.detect` awaits that precede `startFeatureWorkflow`. Recommend a minimum of 4 flushes or explicit documentation of the expected microtask queue depth.
