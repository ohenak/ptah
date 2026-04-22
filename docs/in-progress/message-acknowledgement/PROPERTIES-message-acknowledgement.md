# Properties Document

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-message-acknowledgement |
| **Linked REQ** | [REQ-message-acknowledgement v1.1](./REQ-message-acknowledgement.md) |
| **Linked FSPEC** | [FSPEC-message-acknowledgement v1.1](./FSPEC-message-acknowledgement.md) |
| **Linked TSPEC** | [TSPEC-message-acknowledgement v1.0](./TSPEC-message-acknowledgement.md) |
| **Linked PLAN** | [PLAN-message-acknowledgement v1.1](./PLAN-message-acknowledgement.md) |
| **Version** | 1.0 |
| **Date** | April 21, 2026 |
| **Author** | Senior Test Engineer |
| **Status** | Draft |

---

## 1. Purpose

This document defines all testable system properties for the message-acknowledgement feature. Each property is a falsifiable, observable invariant that the system must satisfy. Properties map directly to requirements and FSPEC behavioral clauses. Together they form the acceptance gate for implementation.

---

## 2. Test Infrastructure Reference

All properties are exercised through the existing unit-test infrastructure in `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` using fakes from `ptah/tests/fixtures/factories.ts`.

| Fake | Key state used |
|------|----------------|
| `FakeDiscordClient` | `addReactionCalls`, `addReactionError`, `replyToMessageCalls`, `replyToMessageError`, `postPlainMessageCalls` |
| `FakeTemporalClient` | `startWorkflowError`, `startWorkflowErrorValue`, `signalError`, `queryWorkflowStateError`, `workflowStates` |
| `FakeLogger` | `entriesAt("WARN")` |
| `createThreadMessage(options)` | `id`, `threadId`, `threadName`, `content` |

Standard message fixture (workflow-start path):
```typescript
const message = createThreadMessage({
  id: "msg-test",
  threadId: "thread-test",
  threadName: "test-feature — define requirements",
  content: "@pm define requirements",
});
```

Signal-routing fixture adds:
```typescript
temporalClient.workflowStates.set(
  "ptah-test-feature",
  defaultFeatureWorkflowState({ featureSlug: "test-feature", phaseStatus: "waiting-for-user" })
);
```

---

## 3. Properties

### Category A — Functional: Reaction on Success

---

#### PROP-MA-01

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-01 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must add a ✅ reaction to the triggering message when `startWorkflowForFeature()` resolves successfully. |
| **Source** | REQ-MA-01, FSPEC-MA-01, AT-MA-01 |
| **Testable assertion** | After `handleMessage(message)` completes with `startWorkflowError = null`: `FakeDiscordClient.addReactionCalls` contains exactly one entry where `channelId === message.threadId`, `messageId === message.id`, and `emoji === "✅"`. |
| **Pass condition** | `addReactionCalls.length === 1` AND `addReactionCalls[0]` deep-equals `{ channelId: "thread-test", messageId: "msg-test", emoji: "✅" }`. |

---

#### PROP-MA-02

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-02 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must add a ✅ reaction to the triggering message when `routeUserAnswer()` resolves successfully. |
| **Source** | REQ-MA-03, FSPEC-MA-03, AT-MA-03 |
| **Testable assertion** | After `handleMessage(message)` completes with `workflowStates` seeded to `phaseStatus: "waiting-for-user"` and `signalError = null`: `FakeDiscordClient.addReactionCalls` contains exactly one entry with `emoji === "✅"`. |
| **Pass condition** | `addReactionCalls.length === 1` AND `addReactionCalls[0].emoji === "✅"`. |

---

### Category B — Functional: Reply Content on Success

---

#### PROP-MA-03

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-03 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must post a `replyToMessage` call with content `"Workflow started: {workflowId}"` (where `workflowId` is the exact string returned by `startWorkflowForFeature()`) when `startWorkflowForFeature()` resolves successfully. |
| **Source** | REQ-MA-02, FSPEC-MA-02, BR-09, AT-MA-02 |
| **Testable assertion** | After `handleMessage(message)` completes with `featureSlug "test-feature"`: `FakeDiscordClient.replyToMessageCalls` contains exactly one entry where `channelId === message.threadId`, `messageId === message.id`, and `content === "Workflow started: ptah-test-feature"`. |
| **Pass condition** | `replyToMessageCalls.length === 1` AND `replyToMessageCalls[0].content === "Workflow started: ptah-test-feature"`. |

---

#### PROP-MA-04 (Negative)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-04 |
| **Category** | Functional — Negative |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must NOT post any `replyToMessage` or `postPlainMessage` on the triggering message when `routeUserAnswer()` resolves successfully. The reaction alone is sufficient for the signal-routed success path. |
| **Source** | REQ-MA-03, FSPEC-MA-03, BR-07, AT-MA-03 |
| **Testable assertion** | After `handleMessage(message)` completes on the signal-routing success path: `FakeDiscordClient.replyToMessageCalls.filter(c => c.messageId === message.id)` is empty AND `FakeDiscordClient.postPlainMessageCalls.filter(c => c.threadId === message.threadId)` is empty. |
| **Pass condition** | Both filtered arrays have length 0. |

---

### Category C — Functional: Reaction and Reply on Failure

---

#### PROP-MA-05

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-05 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must add a ❌ reaction to the triggering message when `startWorkflowForFeature()` throws a non-`WorkflowExecutionAlreadyStartedError`. |
| **Source** | REQ-MA-04, FSPEC-MA-04, AT-MA-04 |
| **Testable assertion** | After `handleMessage(message)` completes with `startWorkflowError = new Error("connection timeout")`: `FakeDiscordClient.addReactionCalls` contains exactly one entry with `emoji === "❌"`. |
| **Pass condition** | `addReactionCalls.length === 1` AND `addReactionCalls[0].emoji === "❌"`. |

---

#### PROP-MA-06

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-06 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must add a ❌ reaction to the triggering message when `routeUserAnswer()` throws. |
| **Source** | REQ-MA-04, FSPEC-MA-04, AT-MA-05 |
| **Testable assertion** | After `handleMessage(message)` completes with `workflowStates` seeded to `phaseStatus: "waiting-for-user"` and `signalError = new Error("signal delivery failed")`: `FakeDiscordClient.addReactionCalls` contains exactly one entry with `emoji === "❌"`. |
| **Pass condition** | `addReactionCalls.length === 1` AND `addReactionCalls[0].emoji === "❌"`. |

---

#### PROP-MA-07

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-07 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must post a `replyToMessage` call with content `"Failed to start workflow: {error message}"` when `startWorkflowForFeature()` throws. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-04, AT-MA-06 |
| **Testable assertion** | After `handleMessage(message)` completes with `startWorkflowError = new Error("connection timeout")`: `FakeDiscordClient.replyToMessageCalls[0].content === "Failed to start workflow: connection timeout"`. |
| **Pass condition** | `replyToMessageCalls.length === 1` AND `replyToMessageCalls[0].content === "Failed to start workflow: connection timeout"`. |

---

#### PROP-MA-08

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-08 |
| **Category** | Functional |
| **Test level** | Unit |
| **Description** | `TemporalOrchestrator` must post a `replyToMessage` call with content `"Failed to route answer: {error message}"` when `routeUserAnswer()` throws. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-04, AT-MA-07 |
| **Testable assertion** | After `handleMessage(message)` completes on the signal-routing failure path with `signalError = new Error("signal delivery failed")`: `FakeDiscordClient.replyToMessageCalls[0].content === "Failed to route answer: signal delivery failed"`. |
| **Pass condition** | `replyToMessageCalls.length === 1` AND `replyToMessageCalls[0].content === "Failed to route answer: signal delivery failed"`. |

---

### Category D — Data Integrity: Error Message Extraction and Truncation

---

#### PROP-MA-09

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-09 |
| **Category** | Data Integrity |
| **Test level** | Unit |
| **Description** | A 200-character error message must pass through to the error reply untruncated. The `{error message}` portion of the reply content must be exactly 200 characters long. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-06, AT-MA-08 |
| **Testable assertion** | Given `startWorkflowError = new Error("x".repeat(200))`: the `content` field in `replyToMessageCalls[0]` starts with `"Failed to start workflow: "` AND `content.slice("Failed to start workflow: ".length).length === 200` AND `content.endsWith("x".repeat(200))`. |
| **Pass condition** | All three sub-assertions hold. |

---

#### PROP-MA-10

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-10 |
| **Category** | Data Integrity |
| **Test level** | Unit |
| **Description** | A 201-character error message must be truncated to exactly 200 characters in the error reply. The 201st character must not appear in the reply content. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-06, AT-MA-09 |
| **Testable assertion** | Given `startWorkflowError = new Error("x".repeat(201))`: `replyToMessageCalls[0].content.slice("Failed to start workflow: ".length).length === 200` AND the body portion equals `"x".repeat(200)`. |
| **Pass condition** | The error portion is exactly 200 chars and the 201st `"x"` is absent. |

---

#### PROP-MA-11

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-11 |
| **Category** | Data Integrity |
| **Test level** | Unit |
| **Description** | When the Temporal operation throws a non-Error value (e.g., a plain string), the error reply must use `String(err)` — not `err.message` — as the error text. |
| **Source** | REQ-MA-05, FSPEC-MA-05, TSPEC Section 6.3, AT-MA-10 |
| **Testable assertion** | Given `startWorkflowErrorValue = "temporal unreachable"` (a string, not an Error instance): `replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"`. |
| **Pass condition** | `replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"`. |

---

#### PROP-MA-12

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-12 |
| **Category** | Data Integrity |
| **Test level** | Unit |
| **Description** | When the Temporal operation throws a non-Error object value, the error reply must use `String(err)` which produces `"[object Object]"`. |
| **Source** | REQ-MA-05, FSPEC-MA-05, TSPEC Section 6.3, TSPEC Section 7.4 Additional test |
| **Testable assertion** | Given `startWorkflowErrorValue = { code: 503 }` (a plain object): `replyToMessageCalls[0].content === "Failed to start workflow: [object Object]"`. |
| **Pass condition** | `replyToMessageCalls[0].content === "Failed to start workflow: [object Object]"`. |

---

#### PROP-MA-13

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-13 |
| **Category** | Data Integrity |
| **Test level** | Unit |
| **Description** | The `"Failed to {operation}: "` prefix must not be counted against the 200-character truncation limit. Only the `{error message}` portion (derived from `err.message` or `String(err)`) is subject to the 200-character limit. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-06 |
| **Testable assertion** | Given `startWorkflowError = new Error("x".repeat(200))`: the full reply content is `"Failed to start workflow: " + "x".repeat(200)`, making the total string length `26 + 200 = 226`. The prefix `"Failed to start workflow: "` appears in full, untruncated. |
| **Pass condition** | `replyToMessageCalls[0].content.length === 226` AND `replyToMessageCalls[0].content.startsWith("Failed to start workflow: ")`. |

---

### Category E — Error Handling: Acknowledgement Failure Swallowing

---

#### PROP-MA-14

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-14 |
| **Category** | Error Handling |
| **Test level** | Unit |
| **Description** | When `addReaction()` throws, the error must be swallowed and a WARN log entry must be recorded with the message `"Acknowledgement failed: {err.message}"`. `handleMessage()` must return normally without throwing. |
| **Source** | REQ-MA-06, FSPEC-MA-06, AT-MA-11 |
| **Testable assertion** | Given `startWorkflowError = null` and `addReactionError = new Error("rate limited")`: `handleMessage(message)` resolves without throwing AND `logger.entriesAt("WARN")` contains at least one entry whose `message` includes `"Acknowledgement failed: rate limited"`. |
| **Pass condition** | Promise resolves (does not reject) AND matching WARN entry exists. |

---

#### PROP-MA-15

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-15 |
| **Category** | Error Handling |
| **Test level** | Unit |
| **Description** | When `addReaction()` throws, `replyToMessage()` must still be called. The failure of `addReaction` must not suppress the subsequent `replyToMessage` call. |
| **Source** | REQ-MA-06, FSPEC-MA-06, FSPEC Section 6.2, AT-MA-12 |
| **Testable assertion** | Given `startWorkflowError = null`, `addReactionError = new Error("rate limited")`, `replyToMessageError = null`: `FakeDiscordClient.replyToMessageCalls` contains the `"Workflow started: ptah-test-feature"` reply. |
| **Pass condition** | `replyToMessageCalls.length === 1` AND `replyToMessageCalls[0].content === "Workflow started: ptah-test-feature"`. |

---

#### PROP-MA-16

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-16 |
| **Category** | Error Handling |
| **Test level** | Unit |
| **Description** | When `replyToMessage()` throws, the error must be swallowed and a WARN log entry must be recorded. `handleMessage()` must return normally without throwing. |
| **Source** | REQ-MA-06, FSPEC-MA-06, FSPEC Section 6.2 |
| **Testable assertion** | Given `startWorkflowError = null` and `replyToMessageError = new Error("reply failed")`: `handleMessage(message)` resolves without throwing AND `logger.entriesAt("WARN")` contains at least one entry whose `message` includes `"Acknowledgement failed: reply failed"`. |
| **Pass condition** | Promise resolves AND matching WARN entry exists. |

---

#### PROP-MA-17

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-17 |
| **Category** | Error Handling |
| **Test level** | Unit |
| **Description** | When both `addReaction()` and `replyToMessage()` throw, each failure must be caught and logged independently. Two separate WARN entries must be recorded and `handleMessage()` must return normally. |
| **Source** | REQ-MA-06, FSPEC-MA-06, FSPEC Section 6.2, AT-MA-16 |
| **Testable assertion** | Given `addReactionError = new Error("reaction rate limited")` and `replyToMessageError = new Error("reply rate limited")`: `handleMessage(message)` resolves without throwing AND `logger.entriesAt("WARN")` contains one entry with `"Acknowledgement failed: reaction rate limited"` AND another with `"Acknowledgement failed: reply rate limited"`. |
| **Pass condition** | Promise resolves AND both WARN entries are present (two distinct entries). |

---

#### PROP-MA-18

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-18 |
| **Category** | Error Handling — Negative |
| **Test level** | Unit |
| **Description** | The WARN log message for acknowledgement failures must use `String(err)` when the thrown value is not an Error instance, rather than accessing `.message` (which would be `undefined`). |
| **Source** | REQ-MA-06, FSPEC-MA-06, FSPEC Section 3.4 |
| **Testable assertion** | Inject a non-Error thrown value (e.g., the string `"rate limit exceeded"`) from `addReaction()`. The WARN entry's message must be `"Acknowledgement failed: rate limit exceeded"`, not `"Acknowledgement failed: undefined"`. |
| **Pass condition** | WARN entry message equals `"Acknowledgement failed: rate limit exceeded"`. |

---

### Category F — Ordering and Sequencing

---

#### PROP-MA-19

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-19 |
| **Category** | Functional — Ordering |
| **Test level** | Unit |
| **Description** | Both `addReaction` and `replyToMessage` calls must be issued only after the Temporal operation (`startWorkflowForFeature()` or `routeUserAnswer()`) has fully resolved. Neither acknowledgement call may precede the Temporal operation's resolution. |
| **Source** | REQ-NF-17-01, FSPEC Section 3.1, AT-MA-13 |
| **Testable assertion** | Using a deferred promise that controls when `startFeatureWorkflow` resolves: (1) before the deferred promise is resolved, `addReactionCalls.length === 0` and `replyToMessageCalls.length === 0`; (2) after the deferred promise resolves and `handleMessage` completes, `addReactionCalls.length === 1` and `replyToMessageCalls.length === 1`. |
| **Pass condition** | Both counts are 0 at checkpoint 1 and both are 1 at checkpoint 2. |

---

#### PROP-MA-20

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-20 |
| **Category** | Functional — Ordering |
| **Test level** | Unit |
| **Description** | On paths that call both `addReaction` and `replyToMessage`, `addReaction` must be called before `replyToMessage`. The calls are sequential, each awaited before the next begins. |
| **Source** | FSPEC Section 3.1, FSPEC Section 3.3, TSPEC Section 4.3 |
| **Testable assertion** | Instrument `FakeDiscordClient` to record a global call-order sequence. After `handleMessage` completes on the workflow-start success path, the index of `addReaction` in the sequence must be less than the index of `replyToMessage`. |
| **Pass condition** | `indexOf(addReaction call) < indexOf(replyToMessage call)` in the call sequence. |

---

### Category G — Idempotency: No Double-Acknowledgement

---

#### PROP-MA-21

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-21 |
| **Category** | Idempotency |
| **Test level** | Unit |
| **Description** | For a single invocation of `handleMessage()`, `addReaction` must be called at most once per `(messageId, emoji)` pair. Exactly one ✅ reaction call for the triggering message is permitted on the workflow-start success path. |
| **Source** | REQ-NF-17-03, FSPEC BR-02, FSPEC-MA-01, AT-MA-14 |
| **Testable assertion** | After `handleMessage(message)` completes on the workflow-start success path: `FakeDiscordClient.addReactionCalls.filter(c => c.messageId === message.id && c.emoji === "✅").length === 1`. |
| **Pass condition** | Filtered array length is exactly 1. |

---

#### PROP-MA-22 (Negative)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-22 |
| **Category** | Idempotency — Negative |
| **Test level** | Unit |
| **Description** | A single `handleMessage()` invocation must not produce both a ✅ and a ❌ reaction. The two emoji values are mutually exclusive for a given invocation. |
| **Source** | REQ-NF-17-03, FSPEC BR-03 |
| **Testable assertion** | After any single `handleMessage()` invocation (success or failure): the set of distinct emoji values in `addReactionCalls` has at most one element — either `{"✅"}`, `{"❌"}`, or `{}`. No invocation produces entries for both emoji values simultaneously. |
| **Pass condition** | `new Set(addReactionCalls.map(c => c.emoji)).size <= 1`. |

---

### Category H — Contract: Channel and Message ID Sourcing

---

#### PROP-MA-23

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-23 |
| **Category** | Contract |
| **Test level** | Unit |
| **Description** | The `channelId` parameter in all `addReaction` and `replyToMessage` calls must equal `message.threadId`. `message.parentChannelId` must not be used. |
| **Source** | REQ (A-17), FSPEC-MA-01 through FSPEC-MA-05, BR-10, TSPEC Section 2 |
| **Testable assertion** | Create a message where `threadId !== parentChannelId` (e.g., `threadId: "thread-test"`, `parentChannelId: "parent-channel"`). After `handleMessage(message)` completes: every entry in `addReactionCalls` has `channelId === "thread-test"` AND every entry in `replyToMessageCalls` has `channelId === "thread-test"`. |
| **Pass condition** | All `channelId` values in both call arrays equal `message.threadId`. No entry uses `message.parentChannelId`. |

---

#### PROP-MA-24

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-24 |
| **Category** | Contract |
| **Test level** | Unit |
| **Description** | The `messageId` parameter in all `addReaction` and `replyToMessage` calls must equal `message.id`. |
| **Source** | FSPEC-MA-01 through FSPEC-MA-05, TSPEC Section 2 |
| **Testable assertion** | Create a message with `id: "msg-test"`. After `handleMessage(message)` completes on the workflow-start success path: all entries in `addReactionCalls` have `messageId === "msg-test"` AND all entries in `replyToMessageCalls` have `messageId === "msg-test"`. |
| **Pass condition** | All `messageId` values equal `"msg-test"`. |

---

#### PROP-MA-25

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-25 |
| **Category** | Contract |
| **Test level** | Unit |
| **Description** | The workflow ID in the `"Workflow started: {workflowId}"` reply must be the exact string returned by `startWorkflowForFeature()`. It must not be inferred, reformatted, or fabricated by the orchestrator. |
| **Source** | REQ-MA-02, FSPEC-MA-02, BR-09 |
| **Testable assertion** | `FakeTemporalClient.startFeatureWorkflow` returns `"ptah-test-feature"` for `featureSlug "test-feature"`. The reply content must be exactly `"Workflow started: ptah-test-feature"`. |
| **Pass condition** | `replyToMessageCalls[0].content === "Workflow started: ptah-test-feature"`. |

---

#### PROP-MA-26 (Negative)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-26 |
| **Category** | Contract — Negative |
| **Test level** | Unit |
| **Description** | Error replies must not contain stack traces. Only the `.message` string (or `String(err)` for non-Error values) may appear as the error text. |
| **Source** | REQ-MA-05, FSPEC-MA-05, BR-05 |
| **Testable assertion** | Given `startWorkflowError = new Error("connection timeout")`: `replyToMessageCalls[0].content` does not contain `"at "` (stack frame pattern) and does not contain `"Error:"` as a prefix. The content is exactly `"Failed to start workflow: connection timeout"`. |
| **Pass condition** | Content matches `"Failed to start workflow: connection timeout"` exactly, with no stack-trace text. |

---

### Category I — Regression: Out-of-Scope Paths Produce No Acknowledgement

---

#### PROP-MA-27 (Negative / Regression)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-27 |
| **Category** | Functional — Negative / Regression |
| **Test level** | Unit |
| **Description** | When `queryWorkflowState()` throws a non-`WorkflowNotFoundError` (Temporal query failure early-exit), no reaction and no reply must be posted. This path exits silently before any Temporal operation completes. |
| **Source** | REQ Section 3.2, FSPEC Section 2.2 item 1, FSPEC Section 7 Exclusions, AT-MA-15 |
| **Testable assertion** | Given `queryWorkflowStateError = new Error("Temporal server unreachable")`: after `handleMessage(message)` completes, `FakeDiscordClient.addReactionCalls.length === 0` AND `FakeDiscordClient.replyToMessageCalls.length === 0`. |
| **Pass condition** | Both arrays are empty. |

---

#### PROP-MA-28 (Negative / Regression)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-28 |
| **Category** | Functional — Negative / Regression |
| **Test level** | Unit |
| **Description** | When `startWorkflowForFeature()` throws `WorkflowExecutionAlreadyStartedError`, no new emoji reaction must be added. The existing `postPlainMessage("Workflow already running for {slug}")` call is the complete user-facing response for this case. |
| **Source** | FSPEC Section 2.2 item 11, FSPEC Section 7 Exclusions, FSPEC BR-11, TSPEC Section 7.5 |
| **Testable assertion** | Configure `startWorkflowForFeature` to throw a `WorkflowExecutionAlreadyStartedError`. After `handleMessage(message)` completes: `FakeDiscordClient.addReactionCalls.length === 0` AND `FakeDiscordClient.replyToMessageCalls.length === 0`. The `postPlainMessageCalls` entry for `"Workflow already running for test-feature"` is present and unchanged. |
| **Pass condition** | `addReactionCalls.length === 0`, `replyToMessageCalls.length === 0`, and `postPlainMessageCalls` contains the existing "already running" message. |

---

#### PROP-MA-29 (Negative / Regression)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-29 |
| **Category** | Functional — Negative / Regression |
| **Test level** | Unit |
| **Description** | The operation label `"query workflows"` must never appear in any error reply. The only valid operation labels are `"start workflow"` and `"route answer"`. |
| **Source** | FSPEC Section 2.2 item 1, FSPEC-MA-05, BR-04 |
| **Testable assertion** | In all test scenarios, no entry in `FakeDiscordClient.replyToMessageCalls` has a `content` value that starts with `"Failed to query workflows:"`. |
| **Pass condition** | `replyToMessageCalls.every(c => !c.content.startsWith("Failed to query workflows:"))`. |

---

#### PROP-MA-30 (Negative / Regression)

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-30 |
| **Category** | Functional — Negative / Regression |
| **Test level** | Unit |
| **Description** | The `phaseDetector.detect()` failure path (pre-`startWorkflowForFeature()` guard inside Branch A) must not produce any emoji reaction or `replyToMessage` call. Existing error handling is unchanged. |
| **Source** | FSPEC Section 2.2 item 12, FSPEC Section 7 Exclusions, TSPEC Section 9 |
| **Testable assertion** | Configure `FakePhaseDetector.detectError = new Error("phase detection failed")`. After `handleMessage(message)` completes: `FakeDiscordClient.addReactionCalls.length === 0` AND `FakeDiscordClient.replyToMessageCalls.length === 0`. |
| **Pass condition** | Both arrays are empty. |

---

### Category J — Observability: WARN Log Format

---

#### PROP-MA-31

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-31 |
| **Category** | Observability |
| **Test level** | Unit |
| **Description** | The WARN log message when an acknowledgement call fails must follow the exact format `"Acknowledgement failed: {err.message}"` where `{err.message}` is the `.message` property of the caught Error. |
| **Source** | REQ-MA-06, FSPEC-MA-06, FSPEC Section 3.4, AT-MA-11 |
| **Testable assertion** | Given `addReactionError = new Error("rate limited")`: `logger.entriesAt("WARN")` contains exactly one entry (for this scenario) with `message === "Acknowledgement failed: rate limited"`. |
| **Pass condition** | The WARN entry message is exactly `"Acknowledgement failed: rate limited"`. No other prefix or suffix. |

---

#### PROP-MA-32

| Field | Value |
|-------|-------|
| **Property ID** | PROP-MA-32 |
| **Category** | Observability |
| **Test level** | Unit |
| **Description** | No ERROR-level log must be produced by acknowledgement failures. Acknowledgement failures log at WARN only. |
| **Source** | REQ-MA-06, FSPEC-MA-06 |
| **Testable assertion** | Given `addReactionError = new Error("rate limited")` and/or `replyToMessageError = new Error("reply failed")`: `logger.entriesAt("ERROR")` must not contain any entry related to acknowledgement. |
| **Pass condition** | `logger.entriesAt("ERROR").every(e => !e.message.includes("Acknowledgement failed"))`. |

---

## 4. Coverage Matrix

| Requirement | Properties | Coverage type |
|-------------|------------|---------------|
| REQ-MA-01 | PROP-MA-01, PROP-MA-21, PROP-MA-23, PROP-MA-24 | Unit (automated) |
| REQ-MA-02 | PROP-MA-03, PROP-MA-25, PROP-MA-13 | Unit (automated) |
| REQ-MA-03 | PROP-MA-02, PROP-MA-04 (negative) | Unit (automated) |
| REQ-MA-04 | PROP-MA-05, PROP-MA-06, PROP-MA-28 (negative) | Unit (automated) |
| REQ-MA-05 | PROP-MA-07, PROP-MA-08, PROP-MA-09, PROP-MA-10, PROP-MA-11, PROP-MA-12, PROP-MA-13, PROP-MA-26 (negative), PROP-MA-29 (negative) | Unit (automated) |
| REQ-MA-06 | PROP-MA-14, PROP-MA-15, PROP-MA-16, PROP-MA-17, PROP-MA-18, PROP-MA-31, PROP-MA-32 | Unit (automated) |
| REQ-NF-17-01 | PROP-MA-19 | Unit (automated) |
| REQ-NF-17-02 | *(Manual verification — see note below)* | Manual / E2E |
| REQ-NF-17-03 | PROP-MA-21, PROP-MA-22 | Unit (automated) |
| FSPEC BR-04 (operation labels) | PROP-MA-07, PROP-MA-08, PROP-MA-29 (negative) | Unit (automated) |
| FSPEC BR-05 (no stack traces) | PROP-MA-26 (negative) | Unit (automated) |
| FSPEC BR-06 (truncation boundary) | PROP-MA-09, PROP-MA-10, PROP-MA-13 | Unit (automated) |
| FSPEC BR-10 (channelId source) | PROP-MA-23 | Unit (automated) |
| FSPEC BR-11 (WorkflowExecutionAlreadyStartedError) | PROP-MA-28 (negative) | Unit (automated) |
| FSPEC Section 2.2 item 1 (query failure out of scope) | PROP-MA-27 (negative), PROP-MA-29 (negative) | Unit (automated) |
| FSPEC Section 2.2 item 12 (phase detection failure) | PROP-MA-30 (negative) | Unit (automated) |

**REQ-NF-17-02 note:** Acknowledgement latency under 5 seconds cannot be verified by unit tests. This requirement is covered by the manual verification step in PLAN TASK-04, step 6: post a message in a live Discord feature thread and confirm the ✅ reaction appears within 5 seconds under normal network conditions.

---

## 5. Gaps and Risk Notes

| ID | Gap / Risk | Disposition |
|----|------------|-------------|
| G-01 | `formatErrorMessage` is a private method — it cannot be unit-tested in isolation without a test accessor or exposure mechanism. | Accepted. PROP-MA-09 and PROP-MA-10 exercise the full truncation boundary through `handleMessage()`. The integrated path provides sufficient coverage for this pure helper. |
| G-02 | PROP-MA-20 (ordering of `addReaction` before `replyToMessage`) requires instrumenting the `FakeDiscordClient` call sequence. The existing fake records calls in arrays but does not provide a global interleaved sequence. | Implement via a shared sequence array in the test setup, or verify positional index (addReaction entry precedes replyToMessage entry in the order they were appended). Low implementation effort. |
| G-03 | AT-MA-10 / PROP-MA-11 requires `FakeTemporalClient.startWorkflowErrorValue?: unknown`. TSPEC Section 7.2 incorrectly states no fake changes are needed. PLAN TASK-01 is the authoritative source: `startWorkflowErrorValue` must be added before PROP-MA-11 and PROP-MA-12 can be exercised. | The PROPERTIES document depends on TASK-01 being completed as specified. Implementation is blocked on this factory change. |
| G-04 | REQ-NF-17-02 (latency < 5 seconds) has no automated coverage path. | Accepted. Manual verification per PLAN TASK-04 step 6. Not a gap in the automated test suite design. |
| G-05 | No property explicitly guards the `replyToMessage` call order independence on the failure path (i.e., that `replyToMessage` is still called even if `addReaction` fails during a ❌ path). PROP-MA-15 covers this for the success path only. | Add a supplementary test: given `startWorkflowError` throws AND `addReactionError` throws, assert `replyToMessageCalls[0].content === "Failed to start workflow: ..."`. This extends PROP-MA-15 to the failure path. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | Senior Test Engineer | Initial PROPERTIES document. 32 properties across 10 categories derived from REQ v1.1, FSPEC v1.1, TSPEC v1.0, PLAN v1.1, and both TE cross-review documents. |

---

*End of Document*
