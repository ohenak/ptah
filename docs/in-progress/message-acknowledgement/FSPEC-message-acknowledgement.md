# Functional Specification

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-message-acknowledgement |
| **Linked Requirements** | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05, REQ-MA-06, REQ-NF-17-01, REQ-NF-17-02, REQ-NF-17-03 |
| **Parent REQ** | [REQ-message-acknowledgement v1.1](./REQ-message-acknowledgement.md) |
| **Version** | 1.1 |
| **Date** | April 21, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview and Purpose

`TemporalOrchestrator.handleMessage()` receives Discord thread messages and dispatches one of two Temporal operations: starting a new workflow, or routing a `user-answer` signal to an existing workflow. Currently it returns to the caller with no Discord-visible feedback. Users cannot tell whether their message was received, acted upon, or silently failed.

This FSPEC defines the precise behavioral contract for per-message acknowledgement: which signals to send (emoji reactions and plain-text replies), when to send them (after the Temporal operation resolves), what content they carry, and how failures in the acknowledgement itself must be handled.

### Design Approach

Acknowledgement uses a two-tier mechanism:

| Tier | Mechanism | API call | When used |
|------|-----------|----------|-----------|
| 1 | Emoji reaction on triggering message | `addReaction(channelId, messageId, emoji)` | All in-scope outcomes |
| 2 | Plain-text reply on triggering message | `replyToMessage(channelId, messageId, content)` | Workflow started, and all failures |

The reaction is always the first tier. A plain-text reply is added only where a reaction alone is insufficient to communicate what the user needs to know.

### Implementation Note: Private Method Boundaries

`handleMessage()` delegates to two private methods:

- **`startNewWorkflow(slug, message)`** — handles Branch A (start a new workflow). This method calls `startWorkflowForFeature()` internally and is responsible for detecting success vs. failure. Acknowledgement for Branch A outcomes must be inserted **inside `startNewWorkflow()`**, after `startWorkflowForFeature()` resolves or throws.
- **`handleStateDependentRouting(state, message)`** — handles Branch B (route an answer to an existing workflow). This method calls `routeUserAnswer()` internally. Acknowledgement for Branch B outcomes must be inserted **inside `handleStateDependentRouting()`**, after `routeUserAnswer()` resolves or throws.

`handleMessage()` itself calls these private methods via `await` and cannot detect success vs. failure by return value (both methods return `void`). Engineers must not insert acknowledgement calls at the `handleMessage()` level — doing so would fire acknowledgement before the private method's internal result is known, producing a false ✅ when `startNewWorkflow()` encounters an internally-swallowed error.

The `channelId` parameter in all acknowledgement calls is sourced from `message.threadId`. The `messageId` parameter is sourced from `message.id`. Engineers must not use `message.parentChannelId` as the `channelId`.

---

## 2. Scope

### 2.1 In Scope

| Scenario | Private method | Reaction | Reply |
|----------|---------------|----------|-------|
| Workflow started successfully | `startNewWorkflow()` — `startWorkflowForFeature()` resolves | ✅ | `Workflow started: {workflowId}` |
| Signal routed successfully | `handleStateDependentRouting()` — `routeUserAnswer()` resolves | ✅ | None |
| `startWorkflowForFeature()` throws (non-`WorkflowExecutionAlreadyStartedError`) | `startNewWorkflow()` | ❌ | `Failed to start workflow: {error message}` |
| `routeUserAnswer()` throws | `handleStateDependentRouting()` | ❌ | `Failed to route answer: {error message}` |
| Acknowledgement call itself fails | `addReaction()` or `replyToMessage()` throws | — | WARN log only; no retry |

### 2.2 Out of Scope

The following paths do **not** receive any acknowledgement and are explicitly excluded:

1. **Temporal query failure early-exit** — When `queryWorkflowState()` throws a non-`WorkflowNotFoundError`, `handleMessage()` exits early via a silent WARN log before any Temporal operation is attempted. This is a pre-routing guard, not a Temporal operation outcome. No reaction or reply is posted. The `Failed to query workflows: ...` error reply format does **not** exist; the operation label `query workflows` is not a valid `{operation}` value.
2. **Empty-slug guard** — Silent early-exit; no acknowledgement.
3. **No-agent-mention guard** — Silent early-exit; no acknowledgement.
4. **Messages in non-feature threads** — Pattern did not match; no acknowledgement.
5. **Bot's own messages** — Filtered before `handleMessage()` is called.
6. **Rich embeds or formatted cards** — Plain text only.
7. **Editing or deleting prior acknowledgement messages** — Not supported.
8. **Per-phase status updates during workflow execution** — Separate feature.
9. **`retry-or-cancel` and `resume-or-cancel` signals** — Out of scope for this feature.
10. **Rate-limit retry logic** — Acknowledgement failures are swallowed; no retry.
11. **`WorkflowExecutionAlreadyStartedError` path** — When `startNewWorkflow()` catches `WorkflowExecutionAlreadyStartedError`, it posts a bespoke message via the existing `postPlainMessage("Workflow already running for {slug}")` call. This path does not receive a new emoji reaction or a `replyToMessage` call from this feature. The existing `postPlainMessage` output is the complete user-facing feedback for this case. No changes to this path are in scope.
12. **Phase detection failure path** — When `phaseDetector.detect()` throws inside `startNewWorkflow()`, the method logs the error and posts a plain message via the existing error handling. This is a pre-`startWorkflowForFeature()` guard inside Branch A; it is not a Temporal operation outcome. No reaction or `replyToMessage` call is added for this path. Existing behavior is unchanged.
13. **Ad-hoc directive path** — When an ad-hoc directive is detected inside Branch A, `handleAdHocDirective()` is called. This path has its own existing acknowledgement via `postPlainMessage`. No new emoji reaction or `replyToMessage` call is added.
14. **Workflow running but not waiting for user input (silent drop)** — When a workflow is in a `phaseStatus` state other than `waiting-for-user`, `failed`, or `revision-bound-reached`, `handleStateDependentRouting()` performs a silent drop. No acknowledgement is added for this path.

---

## 3. Behavioral Flows

### 3.1 US-33: Workflow Started Successfully

**Preconditions:**
- Message posted in a feature thread (e.g. `017-message-acknowledgement`)
- No existing workflow found for this thread (`queryWorkflowState()` returns `null` or `WorkflowNotFoundError`)
- `startNewWorkflow()` is called; inside it, `startWorkflowForFeature()` resolves with a `workflowId`

```
handleMessage(message)
  │
  ├─ [guard checks pass — slug non-empty, agent mentioned]
  │
  ├─ queryWorkflowState(threadSlug)
  │   ├─ throws WorkflowNotFoundError → Branch A (start workflow)
  │   └─ returns null              → Branch A (start workflow)
  │
  └─ await startNewWorkflow(slug, message)
       │
       ├─ phaseDetector.detect(slug)
       │   └─ RESOLVES with phase
       │
       ├─ startWorkflowForFeature(...)
       │   └─ RESOLVES with { workflowId }
       │
       ├─ [startWorkflowForFeature() resolved — acknowledgement phase begins]
       │
       ├─ addReaction(message.threadId, message.id, "✅")
       │   ├─ success → continue
       │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
       │
       ├─ replyToMessage(message.threadId, message.id, "Workflow started: {workflowId}")
       │   ├─ success → continue
       │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
       │
       └─ return
```

**Key behaviors:**
- Acknowledgement is inserted inside `startNewWorkflow()`, after `startWorkflowForFeature()` resolves.
- `addReaction` and `replyToMessage` are both called after `startWorkflowForFeature()` resolves.
- Both calls are issued in this invocation (neither is conditional on the other succeeding).
- `{workflowId}` is the value returned by `startWorkflowForFeature()`, which follows the `ptah-{slug}` format.
- `channelId` is `message.threadId`; `messageId` is `message.id`.

---

### 3.2 US-34: Signal Routed Successfully

**Preconditions:**
- Message posted in a feature thread with an active workflow
- `queryWorkflowState()` returns state indicating workflow is paused for user input (`phaseStatus === "waiting-for-user"`)
- `handleStateDependentRouting()` is called; inside it, `routeUserAnswer()` resolves

```
handleMessage(message)
  │
  ├─ [guard checks pass]
  │
  ├─ queryWorkflowState(threadSlug)
  │   └─ returns state (workflow paused) → Branch B
  │
  └─ await handleStateDependentRouting(state, message)
       │
       ├─ routeUserAnswer(...)
       │   └─ RESOLVES
       │
       ├─ [routeUserAnswer() resolved — acknowledgement phase begins]
       │
       ├─ addReaction(message.threadId, message.id, "✅")
       │   ├─ success → continue
       │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
       │
       └─ return
  [No replyToMessage call for this path]
```

**Key behaviors:**
- Acknowledgement is inserted inside `handleStateDependentRouting()`, after `routeUserAnswer()` resolves.
- Only `addReaction` is called. `replyToMessage` is **not** called on this path.
- Absence of a reply is intentional and required — the reaction alone is sufficient for routine answer delivery.
- `channelId` is `message.threadId`; `messageId` is `message.id`.

---

### 3.3 US-35: Temporal Operation Fails

**Preconditions:**
- Message posted in a feature thread
- Either `startWorkflowForFeature()` (inside `startNewWorkflow()`) or `routeUserAnswer()` (inside `handleStateDependentRouting()`) throws an error

```
handleMessage(message)
  │
  ├─ [guard checks pass]
  │
  ├─ queryWorkflowState(threadSlug)
  │   ├─ returns null/WNF error → Branch A
  │   └─ returns state          → Branch B
  │
  ├─ [Branch A] await startNewWorkflow(slug, message)
  │       │
  │       ├─ phaseDetector.detect(slug)
  │       │   └─ RESOLVES (phase detected)
  │       │
  │       ├─ startWorkflowForFeature(...)
  │       │   └─ THROWS error (not WorkflowExecutionAlreadyStartedError)
  │       │
  │       ├─ [Error caught inside startNewWorkflow()]
  │       │
  │       ├─ operation label → "start workflow"
  │       ├─ addReaction(message.threadId, message.id, "❌")
  │       │   ├─ success → continue
  │       │   └─ throws  → log WARN; continue
  │       ├─ replyToMessage(message.threadId, message.id, "Failed to start workflow: {msg}")
  │       │   ├─ success → continue
  │       │   └─ throws  → log WARN; continue
  │       └─ return
  │
  └─ [Branch B] await handleStateDependentRouting(state, message)
          │
          ├─ routeUserAnswer(...)
          │   └─ THROWS error
          │
          ├─ [Error caught inside handleStateDependentRouting()]
          │
          ├─ operation label → "route answer"
          ├─ addReaction(message.threadId, message.id, "❌")
          │   ├─ success → continue
          │   └─ throws  → log WARN; continue
          ├─ replyToMessage(message.threadId, message.id, "Failed to route answer: {msg}")
          │   ├─ success → continue
          │   └─ throws  → log WARN; continue
          └─ return
```

**Key behaviors:**
- Both `addReaction` and `replyToMessage` are called on all failure paths that reach this handler.
- `{operation}` is exactly one of: `start workflow`, `route answer`. No other values are valid.
- The original Temporal error is not re-thrown after acknowledgement.
- Each acknowledgement call is wrapped independently — `addReaction` failing does not suppress `replyToMessage`.
- `channelId` is `message.threadId`; `messageId` is `message.id`.

---

### 3.4 Acknowledgement Failure (All Paths)

When either `addReaction()` or `replyToMessage()` throws:

```
try {
  await addReaction(channelId, messageId, emoji)
} catch (ackErr) {
  const msg = ackErr instanceof Error ? ackErr.message : String(ackErr)
  logger.warn(`Acknowledgement failed: ${msg}`)
  // continue — do not rethrow
}
```

- The WARN log message format is: `Acknowledgement failed: {err.message}` where `{err.message}` is the `.message` property of the caught Error, or `String(err)` if the thrown value is not an Error instance.
- `handleMessage()` returns normally after logging.
- The orchestrator process and Discord bot connection are unaffected.
- No retry is attempted.

---

## 4. Functional Behaviors

### FSPEC-MA-01: Reaction on Workflow Started

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-01 |
| **Trigger** | `startWorkflowForFeature()` resolves successfully inside `startNewWorkflow()` |
| **channelId source** | `message.threadId` (NOT `message.parentChannelId`) |
| **Input** | `channelId` (= `message.threadId`), `messageId` (= `message.id`), emoji `"✅"` |
| **Output** | `addReaction(channelId, messageId, "✅")` is called exactly once for this invocation |
| **Side effects** | ✅ emoji appears on the triggering message in Discord |
| **Constraints** | Called after `startWorkflowForFeature()` resolves inside `startNewWorkflow()`; not before; not at `handleMessage()` level |
| **At-most-once** | `addReaction` is called at most once per `(messageId, "✅")` pair per `handleMessage()` invocation |

---

### FSPEC-MA-02: Reply on Workflow Started

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-02 |
| **Trigger** | `startWorkflowForFeature()` resolves successfully inside `startNewWorkflow()` |
| **channelId source** | `message.threadId` (NOT `message.parentChannelId`) |
| **Input** | `channelId` (= `message.threadId`), `messageId` (= `message.id`), content string |
| **Content format** | `Workflow started: {workflowId}` |
| **workflowId value** | The exact string returned by `startWorkflowForFeature()` — follows `ptah-{slug}` format |
| **Output** | `replyToMessage(channelId, messageId, "Workflow started: {workflowId}")` called once |
| **Side effects** | Plain-text bot reply appears on triggering message in thread |
| **Constraints** | Called after `startWorkflowForFeature()` resolves; called regardless of whether `addReaction` succeeded |

---

### FSPEC-MA-03: Reaction on Signal Routed

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-03 |
| **Trigger** | `routeUserAnswer()` resolves successfully inside `handleStateDependentRouting()` |
| **channelId source** | `message.threadId` (NOT `message.parentChannelId`) |
| **Input** | `channelId` (= `message.threadId`), `messageId` (= `message.id`), emoji `"✅"` |
| **Output** | `addReaction(channelId, messageId, "✅")` called once |
| **Side effects** | ✅ emoji appears on the triggering message |
| **No-reply constraint** | `replyToMessage` is NOT called on this path. This is a required behavior, not an omission. |
| **At-most-once** | `addReaction` called at most once per `(messageId, "✅")` pair per invocation |

---

### FSPEC-MA-04: Reaction on Temporal Failure

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-04 |
| **Trigger** | `startWorkflowForFeature()` throws a non-`WorkflowExecutionAlreadyStartedError`, OR `routeUserAnswer()` throws |
| **channelId source** | `message.threadId` (NOT `message.parentChannelId`) |
| **Input** | `channelId` (= `message.threadId`), `messageId` (= `message.id`), emoji `"❌"` |
| **Output** | `addReaction(channelId, messageId, "❌")` called once |
| **Side effects** | ❌ emoji appears on the triggering message |
| **Excluded triggers** | `queryWorkflowState()` throwing a non-`WorkflowNotFoundError` does NOT trigger this behavior — that path exits silently before reaching the acknowledgement logic. `WorkflowExecutionAlreadyStartedError` does NOT trigger this behavior — that path is handled by the existing `postPlainMessage` call and is out of scope. `phaseDetector.detect()` throwing does NOT trigger this behavior — that is a pre-`startWorkflowForFeature()` guard and is out of scope. |

---

### FSPEC-MA-05: Error Reply on Temporal Failure

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-05 |
| **Trigger** | `startWorkflowForFeature()` throws a non-`WorkflowExecutionAlreadyStartedError`, OR `routeUserAnswer()` throws |
| **channelId source** | `message.threadId` (NOT `message.parentChannelId`) |
| **Content format** | `Failed to {operation}: {error message}` |
| **Operation label** | Exactly one of: `start workflow` (Branch A), `route answer` (Branch B) |
| **Invalid operation labels** | `query workflows` is NOT a valid operation label. The query failure path is out of scope and never reaches this code. |
| **Error message source** | `err.message` if `err instanceof Error`; `String(err)` otherwise |
| **Truncation** | Error message (the `{error message}` portion, before formatting into the reply string) is truncated to 200 characters if longer. A 200-character message is NOT truncated. A 201-character message is truncated to exactly 200 characters. The `"Failed to {operation}: "` prefix is not subject to truncation and is not counted against the 200-character limit. |
| **Truncation and multi-byte characters** | Truncation is applied to the string as a sequence of characters (not bytes). UTF-8 multi-byte sequences are not split. |
| **Stack traces** | Must NOT appear in the reply content |
| **Output** | `replyToMessage(channelId, messageId, "Failed to {operation}: {error message}")` called once |
| **Independence** | Called regardless of whether `addReaction` succeeded or threw |

---

### FSPEC-MA-06: Swallow Acknowledgement Failures

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-06 |
| **Trigger** | `addReaction()` or `replyToMessage()` throws |
| **Log level** | WARN |
| **Log message format** | `Acknowledgement failed: {err.message}` where `{err.message}` is `err.message` if `err instanceof Error`, else `String(err)` |
| **Propagation** | Error must NOT be re-thrown or propagated |
| **Process impact** | `handleMessage()` returns normally; orchestrator and bot connection unaffected |
| **Retry** | None |
| **Independence** | Each acknowledgement call is wrapped independently. `addReaction` failing does NOT suppress a subsequent `replyToMessage` call, and vice versa. |

---

## 5. Business Rules

| ID | Rule |
|----|------|
| BR-01 | Acknowledgement calls (both `addReaction` and `replyToMessage`) are issued only after the Temporal operation (`startWorkflowForFeature()` or `routeUserAnswer()`) has fully resolved — either successfully or with an error. They are inserted inside the private methods `startNewWorkflow()` and `handleStateDependentRouting()`, not at the `handleMessage()` level. |
| BR-02 | `addReaction` is called at most once per `(messageId, emoji)` pair per `handleMessage()` invocation. Multiple success paths or retry logic must not produce duplicate reactions. |
| BR-03 | A ✅ reaction and a ❌ reaction are mutually exclusive for a given invocation. Exactly one emoji value is used per call to `handleMessage()`. |
| BR-04 | The `{operation}` placeholder in error replies accepts exactly two values: `start workflow` and `route answer`. The value `query workflows` is not used. |
| BR-05 | Error message content in replies must not include stack traces, file paths, or raw exception class names — only the `.message` string (or `String(err)` for non-Error thrown values). |
| BR-06 | The `{error message}` portion of the error reply (i.e., the value derived from `err.message` or `String(err)`, before being formatted into the reply string) is truncated to 200 characters. The truncation boundary is a character boundary, not a byte boundary. The `"Failed to {operation}: "` prefix is not counted against this limit. |
| BR-07 | For the signal-routed success path, no `replyToMessage` call is made. Absence of a reply is a required behavior. |
| BR-08 | Acknowledgement failures (Discord errors) do not alter the outcome of `handleMessage()` — the function returns normally regardless of whether acknowledgement succeeded. |
| BR-09 | The workflow ID in the `Workflow started: {workflowId}` reply is the exact string returned by `startWorkflowForFeature()`. It must not be inferred, reformatted, or fabricated. |
| BR-10 | `channelId` in all acknowledgement calls is sourced from `message.threadId`. `message.parentChannelId` must not be used as the channel ID for acknowledgement. |
| BR-11 | `WorkflowExecutionAlreadyStartedError` does not trigger any new acknowledgement. The existing `postPlainMessage` call in that catch block is the complete user-facing response for that case. |

---

## 6. Error Handling Behaviors

### 6.1 Temporal Operation Errors (REQ-MA-04, REQ-MA-05)

| Condition | Reaction | Reply | Log |
|-----------|----------|-------|-----|
| `startWorkflowForFeature()` throws non-`WorkflowExecutionAlreadyStartedError` | ❌ | `Failed to start workflow: {msg}` | Pre-existing error logging (not part of this feature) |
| `routeUserAnswer()` throws any error | ❌ | `Failed to route answer: {msg}` | Pre-existing error logging (not part of this feature) |
| `queryWorkflowState()` throws non-`WorkflowNotFoundError` | None (out of scope) | None (out of scope) | Pre-existing WARN log at early-exit path |
| `WorkflowExecutionAlreadyStartedError` thrown inside `startNewWorkflow()` | None (out of scope) | None (existing `postPlainMessage` only) | Pre-existing handling unchanged |
| `phaseDetector.detect()` throws inside `startNewWorkflow()` | None (out of scope) | None (existing handling unchanged) | Pre-existing error logging |

### 6.2 Acknowledgement Errors (REQ-MA-06)

| Condition | Action | Log Message |
|-----------|--------|-------------|
| `addReaction()` throws | Catch, log WARN, continue to next acknowledgement call | `Acknowledgement failed: {err.message or String(err)}` |
| `replyToMessage()` throws | Catch, log WARN, return normally | `Acknowledgement failed: {err.message or String(err)}` |
| Both `addReaction()` and `replyToMessage()` throw | Each caught independently; two WARN log entries; return normally | Same format for each |

### 6.3 Partial Success Scenarios

| Scenario | Behavior |
|----------|----------|
| `addReaction` succeeds, `replyToMessage` fails | Reaction visible in Discord; reply absent; WARN logged |
| `addReaction` fails, `replyToMessage` succeeds | No reaction visible; reply posted; WARN logged |
| Both fail | No visible feedback in Discord; two WARN logs; orchestrator unaffected |

---

## 7. Out-of-Scope Behaviors (Explicit Exclusions)

The following behaviors are explicitly NOT implemented by this feature. Engineers must not implement them, and test authors must not write tests asserting them:

| Exclusion | Rationale |
|-----------|-----------|
| Acknowledgement when `queryWorkflowState()` throws non-`WorkflowNotFoundError` | This is a pre-routing guard. `handleMessage()` exits silently before any Temporal operation completes. Existing WARN log is sufficient. |
| `Failed to query workflows: ...` reply format | There is no reachable code path that would post this message. The operation label `query workflows` does not exist. |
| Acknowledgement for empty-slug early-exit | Pre-routing guard; not a Temporal operation outcome. |
| Acknowledgement for no-agent-mention early-exit | Pre-routing guard; not a Temporal operation outcome. |
| Acknowledgement for bot messages | Filtered before `handleMessage()` is reached. |
| Acknowledgement for `retry-or-cancel` or `resume-or-cancel` signals | Out of scope for this feature iteration. |
| Retrying failed acknowledgement calls | Acknowledgement is best-effort; swallow and move on. |
| Editing or deleting previously posted acknowledgement messages | Not supported. |
| Rich embeds or formatted cards | Plain text only. |
| New acknowledgement for `WorkflowExecutionAlreadyStartedError` | The existing `postPlainMessage("Workflow already running for {slug}")` call is the complete user-facing response. No emoji reaction or `replyToMessage` call is added. |
| Acknowledgement for phase detection failure (`phaseDetector.detect()` throws) | Pre-`startWorkflowForFeature()` guard inside `startNewWorkflow()`. Existing error handling is unchanged. No reaction or `replyToMessage` added. |
| Acknowledgement for ad-hoc directive path | `handleAdHocDirective()` has its own existing `postPlainMessage` acknowledgement. No new reaction or `replyToMessage` added. |
| Acknowledgement for "workflow running, not waiting for user" silent drop | `handleStateDependentRouting()` drops silently when `phaseStatus` is not `waiting-for-user`, `failed`, or `revision-bound-reached`. No acknowledgement added. |

---

## 8. Acceptance Tests

### AT-MA-01: Workflow started — ✅ reaction posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-01 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `handleMessage()` is invoked with a valid `ThreadMessage` where `featureSlug` is `"test-feature"`; `FakeTemporalClient.startWorkflow` derives the workflow ID as `ptah-test-feature` (from `featureSlug` internally — no override needed) |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with `{ channelId: message.threadId, messageId: message.id, emoji: "✅" }` |

---

### AT-MA-02: Workflow started — reply with workflow ID posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-02 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | Same as AT-MA-01 — `featureSlug` is `"test-feature"`; `FakeTemporalClient.startWorkflow` derives `workflowId` as `"ptah-test-feature"` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains exactly one entry where `content === "Workflow started: ptah-test-feature"`, with matching `channelId: message.threadId` and `messageId: message.id` |

---

### AT-MA-03: Signal routed — ✅ reaction posted, no reply

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-03 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `handleMessage()` is invoked; `queryWorkflowState()` returns an active workflow state with `phaseStatus: "waiting-for-user"`; `routeUserAnswer()` resolves |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with emoji `"✅"` AND both `FakeDiscordClient.replyToMessageCalls.filter(c => c.messageId === message.id)` is empty AND `FakeDiscordClient.postPlainMessageCalls.filter(c => c.channelId === message.threadId)` is empty for this invocation |

---

### AT-MA-04: `startWorkflowForFeature()` throws — ❌ reaction posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-04 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` is configured to throw `new Error("connection timeout")` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with emoji `"❌"` |

---

### AT-MA-05: `routeUserAnswer()` throws — ❌ reaction posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-04 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `routeUserAnswer()` is configured to throw `new Error("signal delivery failed")` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with emoji `"❌"` |

---

### AT-MA-06: Error reply — `start workflow` operation label and truncation

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `featureSlug` is `"test-feature"`; `startWorkflowForFeature()` throws `new Error("connection timeout")` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains exactly one entry where `content === "Failed to start workflow: connection timeout"` |

---

### AT-MA-07: Error reply — `route answer` operation label

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `routeUserAnswer()` throws `new Error("signal delivery failed")` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains exactly one entry where `content === "Failed to route answer: signal delivery failed"` |

---

### AT-MA-08: Error reply — 200-character error message not truncated

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` throws an Error whose `.message` is exactly 200 characters |
| **When** | `handleMessage()` completes |
| **Then** | The `content` field in `replyToMessageCalls` ends with the full 200-character error string, not truncated (i.e. `content.endsWith(errorMsg)` and `content.slice("Failed to start workflow: ".length).length === 200`) |

---

### AT-MA-09: Error reply — 201-character error message truncated to 200

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` throws an Error whose `.message` is exactly 201 characters |
| **When** | `handleMessage()` completes |
| **Then** | The error string portion in `content` (after the `"Failed to start workflow: "` prefix) is exactly 200 characters; the 201st character is absent |

---

### AT-MA-10: Error reply — non-Error thrown value uses `String(err)`

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` throws the string `"temporal unreachable"` (not an Error instance) |
| **When** | `handleMessage()` completes |
| **Then** | `replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"` |

---

### AT-MA-11: Acknowledgement failure — WARN logged, orchestrator unaffected

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-06 |
| **Who** | Orchestrator (via FakeDiscordClient with error injection) |
| **Given** | `startWorkflowForFeature()` resolves; `FakeDiscordClient.addReactionError` is set to throw `new Error("rate limited")` |
| **When** | `handleMessage()` completes |
| **Then** | A WARN log entry containing `"Acknowledgement failed: rate limited"` is recorded AND `handleMessage()` returned without throwing |

---

### AT-MA-12: Acknowledgement failure — `addReaction` failure does not suppress `replyToMessage`

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-06 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` resolves; `FakeDiscordClient.addReactionError` is set to throw; `FakeDiscordClient.replyToMessageError` is not set |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains the `Workflow started: ...` reply (i.e. `replyToMessage` was still called despite `addReaction` failing) |

---

### AT-MA-13: Acknowledgement calls follow Temporal operation resolution

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-NF-17-01 |
| **Who** | Orchestrator (via FakeDiscordClient and FakeTemporalClient) |
| **Given** | `handleMessage()` is invoked for a workflow-start scenario; `startWorkflowForFeature()` is configured to resolve only after a short controlled async delay (e.g. deferred promise in the fake) |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` and `FakeDiscordClient.replyToMessageCalls` are both empty before the deferred Temporal promise resolves, and both are populated after it resolves — verified by checking call counts at the suspension point (before resolve) vs. after. Implementation note: this can be achieved in two sequential assertions within a single test by resolving the deferred promise between the two check points, without requiring a cross-fake global sequence counter. |

---

### AT-MA-14: No double-acknowledgement per invocation

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-NF-17-03 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startWorkflowForFeature()` resolves normally |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls.filter(c => c.messageId === message.id && c.emoji === "✅").length === 1` — exactly one ✅ reaction call for this message ID |

---

### AT-MA-15: No acknowledgement on query failure early-exit (out-of-scope guard)

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ (Section 3.2 — out of scope) |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `queryWorkflowState()` is configured to throw a non-`WorkflowNotFoundError` (e.g. `new Error("Temporal server unreachable")`) |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` is empty AND `FakeDiscordClient.replyToMessageCalls` is empty — confirming the early-exit path produces no Discord acknowledgement |

---

### AT-MA-16: Dual acknowledgement failure — both `addReaction` and `replyToMessage` throw

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-06 |
| **Who** | Orchestrator (via FakeDiscordClient with dual error injection) |
| **Given** | `startWorkflowForFeature()` resolves; `FakeDiscordClient.addReactionError` is set to throw `new Error("reaction rate limited")`; `FakeDiscordClient.replyToMessageError` is set to throw `new Error("reply rate limited")` |
| **When** | `handleMessage()` completes |
| **Then** | Two WARN log entries are recorded — one containing `"Acknowledgement failed: reaction rate limited"` and one containing `"Acknowledgement failed: reply rate limited"` — AND `handleMessage()` returned without throwing AND the orchestrator remains unaffected |

---

## 9. Open Questions

None. All ambiguities from the SE and TE cross-reviews have been resolved and incorporated into this FSPEC v1.1.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | Product Manager | Initial FSPEC. Incorporates all SE and TE cross-review findings: `query workflows` operation label excluded from error replies (SE-F2, TE-F1); REQ-NF-17-01 allows concurrent acknowledgement calls (SE-F3); `replyToMessage` named throughout; WARN log uses `err.message` with `String(err)` fallback; independent per-call error wrapping (TE-F4); negative no-reply constraint anchored in AT-MA-03 (TE-F2); truncation boundary cases addressed in AT-MA-08/AT-MA-09 (TE-F3); partial success ordering addressed in FSPEC-MA-06 and AT-MA-12 (TE-F4). |
| 1.1 | 2026-04-21 | Product Manager | Address SE and TE cross-review findings (iteration 2). SE-F01: updated all behavioral flow diagrams to reflect private method boundaries (`startNewWorkflow()`, `handleStateDependentRouting()`); added Implementation Note in Section 1 warning against `handleMessage()`-level acknowledgement. SE-F02: `WorkflowExecutionAlreadyStartedError` classified as out of scope (Section 2.2 item 11, Section 7, FSPEC-MA-04 exclusions, Section 6.1 table); existing `postPlainMessage` handling unchanged. SE-F03: phase detection failure (`phaseDetector.detect()` throws) classified as out of scope (Section 2.2 item 12, Section 7, Section 6.1 table). SE-F04: ad-hoc directive path and "workflow running but not waiting for user" silent drop added explicitly to out-of-scope (Section 2.2 items 13–14, Section 7). TE-F01: AT-MA-01/02/06 Given clauses corrected to describe slug-based workflow ID derivation (`featureSlug: "test-feature"` → `ptah-test-feature`); removed incorrect "configured return value" framing. TE-F02: added AT-MA-16 covering dual-failure scenario (both `addReaction` and `replyToMessage` throw). TE-F03: AT-MA-13 replaced cross-fake sequence-counter approach with deferred-promise ordering verification (no new fake infrastructure required). TE-F04: AT-MA-03 Then clause extended to assert both `replyToMessageCalls` and `postPlainMessageCalls` empty (per-message filtered). TE-F05: added explicit `channelId = message.threadId` mapping in FSPEC-MA-01 through FSPEC-MA-05 Input rows and Section 1 Implementation Note; added BR-10. Also clarified BR-06 and FSPEC-MA-05 truncation scope (applies to `{error message}` portion only, not full reply string). |

---

*End of Document*
