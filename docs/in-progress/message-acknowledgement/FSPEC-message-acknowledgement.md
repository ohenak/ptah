# Functional Specification

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-message-acknowledgement |
| **Linked Requirements** | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05, REQ-MA-06, REQ-NF-17-01, REQ-NF-17-02, REQ-NF-17-03 |
| **Parent REQ** | [REQ-message-acknowledgement v1.1](./REQ-message-acknowledgement.md) |
| **Version** | 1.0 |
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

---

## 2. Scope

### 2.1 In Scope

| Scenario | Trigger | Reaction | Reply |
|----------|---------|----------|-------|
| Workflow started successfully | `startFeatureWorkflow()` resolves | ✅ | `Workflow started: {workflowId}` |
| Signal routed successfully | `routeUserAnswer()` resolves | ✅ | None |
| `startFeatureWorkflow()` throws | Error caught in handler | ❌ | `Failed to start workflow: {error message}` |
| `routeUserAnswer()` throws | Error caught in handler | ❌ | `Failed to route answer: {error message}` |
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

---

## 3. Behavioral Flows

### 3.1 US-33: Workflow Started Successfully

**Preconditions:**
- Message posted in a feature thread (e.g. `017-message-acknowledgement`)
- No existing workflow found for this thread (`queryWorkflowState()` returns `null` or `WorkflowNotFoundError`)
- `startFeatureWorkflow()` is called and resolves with a `workflowId`

```
handleMessage(message)
  │
  ├─ [guard checks pass — slug non-empty, agent mentioned]
  │
  ├─ queryWorkflowState(threadSlug)
  │   ├─ throws WorkflowNotFoundError → Branch A (start workflow)
  │   └─ returns null              → Branch A (start workflow)
  │
  ├─ startFeatureWorkflow(...)
  │   └─ RESOLVES with { workflowId }
  │
  ├─ [Temporal operation resolved — acknowledgement phase begins]
  │
  ├─ addReaction(channelId, messageId, "✅")
  │   ├─ success → continue
  │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
  │
  ├─ replyToMessage(channelId, messageId, "Workflow started: {workflowId}")
  │   ├─ success → continue
  │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
  │
  └─ return
```

**Key behaviors:**
- `addReaction` and `replyToMessage` are both called after `startFeatureWorkflow()` resolves.
- Both calls are issued in this invocation (neither is conditional on the other succeeding).
- `{workflowId}` is the value returned by `startFeatureWorkflow()`, which follows the `ptah-{slug}` format.

---

### 3.2 US-34: Signal Routed Successfully

**Preconditions:**
- Message posted in a feature thread with an active workflow
- `queryWorkflowState()` returns state indicating workflow is paused for user input
- `routeUserAnswer()` is called and resolves

```
handleMessage(message)
  │
  ├─ [guard checks pass]
  │
  ├─ queryWorkflowState(threadSlug)
  │   └─ returns state (workflow paused) → Branch B (route answer)
  │
  ├─ routeUserAnswer(...)
  │   └─ RESOLVES
  │
  ├─ [Temporal operation resolved — acknowledgement phase begins]
  │
  ├─ addReaction(channelId, messageId, "✅")
  │   ├─ success → continue
  │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
  │
  └─ return
  [No replyToMessage call for this path]
```

**Key behaviors:**
- Only `addReaction` is called. `replyToMessage` is **not** called on this path.
- Absence of a reply is intentional and required — the reaction alone is sufficient for routine answer delivery.

---

### 3.3 US-35: Temporal Operation Fails

**Preconditions:**
- Message posted in a feature thread
- Either `startFeatureWorkflow()` or `routeUserAnswer()` throws an error

```
handleMessage(message)
  │
  ├─ [guard checks pass]
  │
  ├─ queryWorkflowState(threadSlug)
  │   ├─ returns null/WNF error → Branch A
  │   └─ returns state          → Branch B
  │
  ├─ [Branch A] startFeatureWorkflow(...)
  │   └─ THROWS error
  │   OR
  │   [Branch B] routeUserAnswer(...)
  │       └─ THROWS error
  │
  ├─ [Error caught — acknowledgement phase begins]
  │
  ├─ Compute operation label:
  │   ├─ Branch A failure → "start workflow"
  │   └─ Branch B failure → "route answer"
  │
  ├─ Compute error message:
  │   ├─ err is Error instance → err.message (truncated to 200 chars if longer)
  │   └─ err is not Error      → String(err) (truncated to 200 chars if longer)
  │
  ├─ addReaction(channelId, messageId, "❌")
  │   ├─ success → continue
  │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
  │
  ├─ replyToMessage(channelId, messageId, "Failed to {operation}: {error message}")
  │   ├─ success → continue
  │   └─ throws  → log WARN "Acknowledgement failed: {err.message}"; continue
  │
  └─ return (original error is NOT re-thrown)
```

**Key behaviors:**
- Both `addReaction` and `replyToMessage` are called on all failure paths that reach this handler.
- `{operation}` is exactly one of: `start workflow`, `route answer`. No other values are valid.
- The original Temporal error is not re-thrown after acknowledgement.
- Each acknowledgement call is wrapped independently — `addReaction` failing does not suppress `replyToMessage`.

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
| **Trigger** | `startFeatureWorkflow()` resolves successfully |
| **Input** | `channelId` (from `message.threadId`), `messageId` (from `message.id`), emoji `"✅"` |
| **Output** | `addReaction(channelId, messageId, "✅")` is called exactly once for this invocation |
| **Side effects** | ✅ emoji appears on the triggering message in Discord |
| **Constraints** | Called after `startFeatureWorkflow()` resolves; not before |
| **At-most-once** | `addReaction` is called at most once per `(messageId, "✅")` pair per `handleMessage()` invocation |

---

### FSPEC-MA-02: Reply on Workflow Started

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-02 |
| **Trigger** | `startFeatureWorkflow()` resolves successfully |
| **Input** | `channelId`, `messageId`, content string |
| **Content format** | `Workflow started: {workflowId}` |
| **workflowId value** | The exact string returned by `startFeatureWorkflow()` — follows `ptah-{slug}` format |
| **Output** | `replyToMessage(channelId, messageId, "Workflow started: {workflowId}")` called once |
| **Side effects** | Plain-text bot reply appears on triggering message in thread |
| **Constraints** | Called after `startFeatureWorkflow()` resolves; called regardless of whether `addReaction` succeeded |

---

### FSPEC-MA-03: Reaction on Signal Routed

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-03 |
| **Trigger** | `routeUserAnswer()` resolves successfully |
| **Input** | `channelId`, `messageId`, emoji `"✅"` |
| **Output** | `addReaction(channelId, messageId, "✅")` called once |
| **Side effects** | ✅ emoji appears on the triggering message |
| **No-reply constraint** | `replyToMessage` is NOT called on this path. This is a required behavior, not an omission. |
| **At-most-once** | `addReaction` called at most once per `(messageId, "✅")` pair per invocation |

---

### FSPEC-MA-04: Reaction on Temporal Failure

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-04 |
| **Trigger** | `startFeatureWorkflow()` throws, OR `routeUserAnswer()` throws |
| **Input** | `channelId`, `messageId`, emoji `"❌"` |
| **Output** | `addReaction(channelId, messageId, "❌")` called once |
| **Side effects** | ❌ emoji appears on the triggering message |
| **Excluded triggers** | `queryWorkflowState()` throwing a non-`WorkflowNotFoundError` does NOT trigger this behavior — that path exits silently before reaching the acknowledgement logic |

---

### FSPEC-MA-05: Error Reply on Temporal Failure

| Attribute | Value |
|-----------|-------|
| **Linked requirements** | REQ-MA-05 |
| **Trigger** | `startFeatureWorkflow()` throws, OR `routeUserAnswer()` throws |
| **Content format** | `Failed to {operation}: {error message}` |
| **Operation label** | Exactly one of: `start workflow` (Branch A), `route answer` (Branch B) |
| **Invalid operation labels** | `query workflows` is NOT a valid operation label. The query failure path is out of scope and never reaches this code. |
| **Error message source** | `err.message` if `err instanceof Error`; `String(err)` otherwise |
| **Truncation** | Error message truncated to 200 characters if longer. A 200-character message is NOT truncated. A 201-character message is truncated to exactly 200 characters. |
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
| BR-01 | Acknowledgement calls (both `addReaction` and `replyToMessage`) are issued only after the Temporal operation (workflow start or signal routing) has fully resolved — either successfully or with an error. |
| BR-02 | `addReaction` is called at most once per `(messageId, emoji)` pair per `handleMessage()` invocation. Multiple success paths or retry logic must not produce duplicate reactions. |
| BR-03 | A ✅ reaction and a ❌ reaction are mutually exclusive for a given invocation. Exactly one emoji value is used per call to `handleMessage()`. |
| BR-04 | The `{operation}` placeholder in error replies accepts exactly two values: `start workflow` and `route answer`. The value `query workflows` is not used. |
| BR-05 | Error message content in replies must not include stack traces, file paths, or raw exception class names — only the `.message` string (or `String(err)` for non-Error thrown values). |
| BR-06 | The error message in the reply is truncated to 200 characters. The truncation boundary is a character boundary, not a byte boundary. |
| BR-07 | For the signal-routed success path, no `replyToMessage` call is made. Absence of a reply is a required behavior. |
| BR-08 | Acknowledgement failures (Discord errors) do not alter the outcome of `handleMessage()` — the function returns normally regardless of whether acknowledgement succeeded. |
| BR-09 | The workflow ID in the `Workflow started: {workflowId}` reply is the exact string returned by `startFeatureWorkflow()`. It must not be inferred, reformatted, or fabricated. |

---

## 6. Error Handling Behaviors

### 6.1 Temporal Operation Errors (REQ-MA-04, REQ-MA-05)

| Condition | Reaction | Reply | Log |
|-----------|----------|-------|-----|
| `startFeatureWorkflow()` throws any error | ❌ | `Failed to start workflow: {msg}` | Pre-existing error logging (not part of this feature) |
| `routeUserAnswer()` throws any error | ❌ | `Failed to route answer: {msg}` | Pre-existing error logging (not part of this feature) |
| `queryWorkflowState()` throws non-`WorkflowNotFoundError` | None (out of scope) | None (out of scope) | Pre-existing WARN log at early-exit path |

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

---

## 8. Acceptance Tests

### AT-MA-01: Workflow started — ✅ reaction posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-01 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `handleMessage()` is invoked with a valid `ThreadMessage`; `FakeTemporalClient.startWorkflow` is configured to resolve with `{ workflowId: "ptah-test-feature" }` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with `{ channelId: message.threadId, messageId: message.id, emoji: "✅" }` |

---

### AT-MA-02: Workflow started — reply with workflow ID posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-02 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | Same as AT-MA-01 — `startFeatureWorkflow()` resolves with `workflowId: "ptah-test-feature"` |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains exactly one entry where `content === "Workflow started: ptah-test-feature"`, with matching `channelId` and `messageId` |

---

### AT-MA-03: Signal routed — ✅ reaction posted, no reply

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-03 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `handleMessage()` is invoked; `queryWorkflowState()` returns an active workflow state; `routeUserAnswer()` resolves |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.addReactionCalls` contains exactly one entry with emoji `"✅"` AND `FakeDiscordClient.replyToMessageCalls` is empty for this invocation |

---

### AT-MA-04: `startFeatureWorkflow()` throws — ❌ reaction posted

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-04 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startFeatureWorkflow()` is configured to throw `new Error("connection timeout")` |
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
| **Given** | `startFeatureWorkflow()` throws `new Error("connection timeout")` |
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
| **Given** | `startFeatureWorkflow()` throws an Error whose `.message` is exactly 200 characters |
| **When** | `handleMessage()` completes |
| **Then** | The `content` field in `replyToMessageCalls` ends with the full 200-character error string, not truncated |

---

### AT-MA-09: Error reply — 201-character error message truncated to 200

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startFeatureWorkflow()` throws an Error whose `.message` is exactly 201 characters |
| **When** | `handleMessage()` completes |
| **Then** | The error string in `content` is exactly 200 characters; the 201st character is absent |

---

### AT-MA-10: Error reply — non-Error thrown value uses `String(err)`

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-05 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startFeatureWorkflow()` throws the string `"temporal unreachable"` (not an Error instance) |
| **When** | `handleMessage()` completes |
| **Then** | `replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"` |

---

### AT-MA-11: Acknowledgement failure — WARN logged, orchestrator unaffected

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-06 |
| **Who** | Orchestrator (via FakeDiscordClient with error injection) |
| **Given** | `startFeatureWorkflow()` resolves; `FakeDiscordClient.addReactionError` is set to throw `new Error("rate limited")` |
| **When** | `handleMessage()` completes |
| **Then** | A WARN log entry containing `"Acknowledgement failed: rate limited"` is recorded AND `handleMessage()` returned without throwing |

---

### AT-MA-12: Acknowledgement failure — `addReaction` failure does not suppress `replyToMessage`

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-MA-06 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startFeatureWorkflow()` resolves; `FakeDiscordClient.addReactionError` is set to throw; `FakeDiscordClient.replyToMessageError` is not set |
| **When** | `handleMessage()` completes |
| **Then** | `FakeDiscordClient.replyToMessageCalls` contains the `Workflow started: ...` reply (i.e. `replyToMessage` was still called despite `addReaction` failing) |

---

### AT-MA-13: Acknowledgement calls follow Temporal operation resolution

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-NF-17-01 |
| **Who** | Orchestrator (via FakeDiscordClient with call order tracking) |
| **Given** | Both Temporal and Discord calls are recorded with sequence numbers |
| **When** | `handleMessage()` completes |
| **Then** | All `addReaction` and `replyToMessage` call sequence numbers are greater than the sequence number of the `startFeatureWorkflow` (or `routeUserAnswer`) call — confirming neither acknowledgement call preceded the Temporal resolution |

---

### AT-MA-14: No double-acknowledgement per invocation

| Attribute | Value |
|-----------|-------|
| **Requirement** | REQ-NF-17-03 |
| **Who** | Orchestrator (via FakeDiscordClient) |
| **Given** | `startFeatureWorkflow()` resolves normally |
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

## 9. Open Questions

None. All ambiguities from the SE and TE cross-reviews have been resolved in REQ v1.1 and incorporated into this FSPEC.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | Product Manager | Initial FSPEC. Incorporates all SE and TE cross-review findings: `query workflows` operation label excluded from error replies (SE-F2, TE-F1); REQ-NF-17-01 allows concurrent acknowledgement calls (SE-F3); `replyToMessage` named throughout; WARN log uses `err.message` with `String(err)` fallback; independent per-call error wrapping (TE-F4); negative no-reply constraint anchored in AT-MA-03 (TE-F2); truncation boundary cases addressed in AT-MA-08/AT-MA-09 (TE-F3); partial success ordering addressed in FSPEC-MA-06 and AT-MA-12 (TE-F4). |

---

*End of Document*
