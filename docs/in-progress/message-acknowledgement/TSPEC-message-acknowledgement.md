# Technical Specification

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-message-acknowledgement |
| **Linked FSPEC** | [FSPEC-message-acknowledgement v1.1](./FSPEC-message-acknowledgement.md) |
| **Linked REQ** | [REQ-message-acknowledgement v1.1](./REQ-message-acknowledgement.md) |
| **Version** | 1.0 |
| **Date** | April 21, 2026 |
| **Author** | Senior Software Engineer |
| **Status** | Draft |

---

## 1. Technical Overview

`TemporalOrchestrator.handleMessage()` delegates work to two private methods: `startNewWorkflow()` (Branch B — start a new Temporal workflow) and `handleStateDependentRouting()` (Branch A — route a signal to an existing workflow). This feature adds per-message acknowledgement to both private methods: a ✅ or ❌ emoji reaction on the triggering Discord message, plus a plain-text reply for the workflow-started and Temporal-failure cases.

### Why private methods, not `handleMessage()`

`startNewWorkflow()` swallows errors internally and returns `void`. If acknowledgement were inserted at the `handleMessage()` level, the only signal available would be that `handleMessage()` returned normally — which is always true regardless of what happened inside the private method. Inserting acknowledgement inside the private methods, after the Temporal call resolves or throws, is the only position where success vs. failure is observable.

### Architecture: no new modules

This feature adds no new files. All changes are confined to `ptah/src/orchestrator/temporal-orchestrator.ts`. The `DiscordClient` interface already exposes `addReaction()` and `replyToMessage()`. `FakeDiscordClient` already captures `addReactionCalls` and `replyToMessageCalls` with error injection via `addReactionError` and `replyToMessageError`. No changes to types, interfaces, or test infrastructure are required.

### Acknowledgement isolation principle

Each acknowledgement call (`addReaction` and `replyToMessage`) is wrapped in an independent `try/catch`. A failure in `addReaction` does not suppress `replyToMessage`, and vice versa. Both failures are logged at WARN and swallowed.

---

## 2. Data Model Changes

None. `ThreadMessage` already carries both required fields:

| Field | Type | Role in acknowledgement |
|-------|------|------------------------|
| `message.id` | `string` | `messageId` parameter to `addReaction` and `replyToMessage` |
| `message.threadId` | `string` | `channelId` parameter to `addReaction` and `replyToMessage` |

`message.parentChannelId` must NOT be used as the `channelId` for acknowledgement calls.

The `workflowId` returned by `startWorkflowForFeature()` carries the exact string used in the `Workflow started: {workflowId}` reply; no reformatting is applied.

---

## 3. Integration Points

| Method modified | Location | Change |
|----------------|----------|--------|
| `startNewWorkflow(slug, message)` | `temporal-orchestrator.ts` line 433 | Add acknowledgement in the success path (after `startWorkflowForFeature` resolves) and the error path (after catching non-`WorkflowExecutionAlreadyStartedError`) |
| `handleStateDependentRouting(message, workflowId, state)` | `temporal-orchestrator.ts` line 485 | Add acknowledgement in the success path (after `routeUserAnswer` resolves) and the error path (after catching `routeUserAnswer` throw) |

All other methods (`handleMessage`, `handleAdHocDirective`, `handleIntentRouting`) are unchanged.

---

## 4. Method-Level Changes

### 4.1 Helper: `ackWithWarnOnError`

A private helper is extracted to DRY the try/catch/warn pattern used around every acknowledgement call.

```typescript
private async ackWithWarnOnError(
  fn: () => Promise<void>,
): Promise<void>
```

**Pseudocode:**

```
try
  await fn()
catch ackErr
  const msg = ackErr instanceof Error ? ackErr.message : String(ackErr)
  this.logger.warn(`Acknowledgement failed: ${msg}`)
  // swallow — do not rethrow
```

**Notes:**
- Used exclusively for `addReaction` and `replyToMessage` acknowledgement calls.
- Not used for Temporal operation calls — their errors are caught by existing handlers.

---

### 4.2 Helper: `formatErrorMessage`

A private pure helper for the error reply string.

```typescript
private formatErrorMessage(err: unknown): string
```

**Pseudocode:**

```
rawMsg = err instanceof Error ? err.message : String(err)
return rawMsg.slice(0, 200)
```

**Notes:**
- Truncation boundary is a character boundary (`String.slice`), not a byte boundary. `.slice(0, 200)` on a JavaScript string operates on code units, which handles multi-byte Unicode correctly as long as characters do not straddle surrogate pairs at position 200. For the scope of error messages returned by Temporal, this is safe.
- A 200-character message passes through untruncated. A 201-character message is truncated to exactly 200 characters.
- The `"Failed to {operation}: "` prefix is NOT counted against the 200-character limit. It is concatenated after truncation.
- Stack traces, file paths, and raw exception class names must NOT appear in the output. The `err.message` property of a well-formed Error contains only the message string; using `String(err)` for non-Error values collapses the full value to a string without a stack trace.

---

### 4.3 Modified: `startNewWorkflow`

**Current signature** (unchanged):

```typescript
private async startNewWorkflow(slug: string, message: ThreadMessage): Promise<void>
```

**Current structure (simplified):**

```
phase detection (may early-exit)
try
  workflowId = await this.startWorkflowForFeature(...)
  await this.discord.postPlainMessage(...)
catch err
  if WorkflowExecutionAlreadyStartedError → postPlainMessage("already running")
  else → postPlainMessage("Failed to start...")
```

**New structure after modification:**

```
phase detection (unchanged — no acknowledgement added here)
try
  workflowId = await this.startWorkflowForFeature(...)
  // SUCCESS PATH: replace old postPlainMessage with structured acknowledgement
  await this.ackWithWarnOnError(() =>
    this.discord.addReaction(message.threadId, message.id, "✅")
  )
  await this.ackWithWarnOnError(() =>
    this.discord.replyToMessage(
      message.threadId,
      message.id,
      `Workflow started: ${workflowId}`,
    )
  )
catch err
  if WorkflowExecutionAlreadyStartedError
    // UNCHANGED: existing postPlainMessage — no new ack
    await this.discord.postPlainMessage(message.threadId, `Workflow already running for ${slug}`)
  else
    // FAILURE PATH: replace old postPlainMessage with structured acknowledgement
    const errMsg = this.formatErrorMessage(err)
    await this.ackWithWarnOnError(() =>
      this.discord.addReaction(message.threadId, message.id, "❌")
    )
    await this.ackWithWarnOnError(() =>
      this.discord.replyToMessage(
        message.threadId,
        message.id,
        `Failed to start workflow: ${errMsg}`,
      )
    )
```

**Key invariants:**
- The old `await this.discord.postPlainMessage(message.threadId, `Started workflow ${workflowId} for ${slug}`)` is **removed** from the success path and replaced by `addReaction` + `replyToMessage`.
- The old `await this.discord.postPlainMessage(message.threadId, "Failed to start workflow for ${slug}. Please try again.")` is **removed** from the non-`WorkflowExecutionAlreadyStartedError` path and replaced by `addReaction` + `replyToMessage`.
- The `WorkflowExecutionAlreadyStartedError` catch branch and the `phaseDetector.detect()` error path are **unchanged**.
- `addReaction` and `replyToMessage` are called sequentially (each awaited before the next begins). The calls are independent: if `addReaction` throws, execution continues to `replyToMessage`.

---

### 4.4 Modified: `handleStateDependentRouting`

**Current signature** (unchanged):

```typescript
private async handleStateDependentRouting(
  message: ThreadMessage,
  workflowId: string,
  state: FeatureWorkflowState,
): Promise<void>
```

**Change is limited to the `waiting-for-user` branch** (the only in-scope path). The `failed` / `revision-bound-reached` branch is unchanged.

**Current `waiting-for-user` structure (simplified):**

```
try
  await this.routeUserAnswer(...)
catch err
  await this.discord.postPlainMessage(message.threadId, "Failed to deliver answer. Please try again.")
return
```

**New `waiting-for-user` structure:**

```
try
  await this.routeUserAnswer(...)
  // SUCCESS PATH: add ✅ reaction only (no reply)
  await this.ackWithWarnOnError(() =>
    this.discord.addReaction(message.threadId, message.id, "✅")
  )
catch err
  // FAILURE PATH: replace old postPlainMessage with structured acknowledgement
  const errMsg = this.formatErrorMessage(err)
  await this.ackWithWarnOnError(() =>
    this.discord.addReaction(message.threadId, message.id, "❌")
  )
  await this.ackWithWarnOnError(() =>
    this.discord.replyToMessage(
      message.threadId,
      message.id,
      `Failed to route answer: ${errMsg}`,
    )
  )
return
```

**Key invariants:**
- The old `await this.discord.postPlainMessage(message.threadId, "Failed to deliver answer. Please try again.")` is **removed** from the catch block and replaced by `addReaction("❌")` + `replyToMessage`.
- No `replyToMessage` is called on the success path. Absence of a reply is a required behavior.
- The `failed` / `revision-bound-reached` sub-branch of `handleStateDependentRouting` (delegating to `handleIntentRouting`) is **unchanged**.

---

## 5. TypeScript Type Definitions

No new exported types are introduced. The two new private helpers have internal signatures only:

```typescript
// Private helper — acknowledgement error guard
private async ackWithWarnOnError(fn: () => Promise<void>): Promise<void>

// Private helper — error message extractor and truncator
private formatErrorMessage(err: unknown): string
```

Both helpers are class members of `TemporalOrchestrator`. They are not exported and not part of the public API contract.

---

## 6. Error Handling Strategy

### 6.1 Temporal Operation Errors

Temporal errors are caught by existing try/catch blocks inside `startNewWorkflow()` and `handleStateDependentRouting()`. This feature inserts acknowledgement calls inside those same catch blocks. The behavior of the catch blocks is otherwise preserved.

| Error condition | Handler | New behaviour |
|----------------|---------|---------------|
| `startWorkflowForFeature()` throws, non-`WorkflowExecutionAlreadyStartedError` | `startNewWorkflow()` catch | Replace old `postPlainMessage` with `addReaction("❌")` + `replyToMessage("Failed to start workflow: …")` |
| `startWorkflowForFeature()` throws `WorkflowExecutionAlreadyStartedError` | `startNewWorkflow()` catch | Unchanged — `postPlainMessage("Workflow already running for …")` |
| `phaseDetector.detect()` throws inside `startNewWorkflow()` | `startNewWorkflow()` inner try/catch | Unchanged — `postPlainMessage` transient error; early return |
| `routeUserAnswer()` throws | `handleStateDependentRouting()` catch | Replace old `postPlainMessage` with `addReaction("❌")` + `replyToMessage("Failed to route answer: …")` |
| `queryWorkflowState()` throws non-`WorkflowNotFoundError` | `handleMessage()` (pre-routing guard) | Unchanged — WARN log + early return; no acknowledgement |

### 6.2 Acknowledgement Errors (Discord API failures)

Each call to `addReaction` and `replyToMessage` is wrapped independently by `ackWithWarnOnError`. If the Discord API throws (rate limit, network error, missing permissions):

1. The thrown value is caught.
2. `this.logger.warn(`Acknowledgement failed: ${msg}`)` is called where `msg = err instanceof Error ? err.message : String(err)`.
3. Execution continues to the next acknowledgement call (or returns if there is none).
4. `handleMessage()` returns normally.
5. The orchestrator process and Discord bot connection are unaffected.

### 6.3 Non-Error thrown values

The `formatErrorMessage` helper uses `err instanceof Error ? err.message : String(err)`. This correctly handles:

| Thrown value | Result |
|-------------|--------|
| `new Error("msg")` | `"msg"` |
| `"string literal"` | `"string literal"` |
| `42` | `"42"` |
| `null` | `"null"` |
| `undefined` | `"undefined"` |
| `{ code: 503 }` | `"[object Object]"` |

The same pattern is used inside `ackWithWarnOnError` for the WARN log message.

### 6.4 Partial success

| Scenario | Result |
|----------|--------|
| `addReaction` succeeds, `replyToMessage` fails | Reaction visible; reply absent; one WARN logged |
| `addReaction` fails, `replyToMessage` succeeds | No reaction; reply posted; one WARN logged |
| Both fail | No Discord feedback; two WARNs logged; orchestrator unaffected |

---

## 7. Test Strategy

### 7.1 Test file

All new tests are added to the existing file:

```
ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts
```

No new test files are created.

### 7.2 Test infrastructure

All required test infrastructure already exists in `ptah/tests/fixtures/factories.ts`:

| Fake | Relevant state | Used by |
|------|---------------|---------|
| `FakeDiscordClient` | `addReactionCalls: { channelId, messageId, emoji }[]` | Assert reaction calls |
| `FakeDiscordClient` | `addReactionError: Error \| null` | Inject reaction failures |
| `FakeDiscordClient` | `replyToMessageCalls: { channelId, messageId, content }[]` | Assert reply calls |
| `FakeDiscordClient` | `replyToMessageError: Error \| null` | Inject reply failures |
| `FakeDiscordClient` | `postPlainMessageCalls: { threadId, content }[]` | Assert no-reply invariants |
| `FakeTemporalClient` | `startWorkflowError: Error \| null` | Inject workflow start failures |
| `FakeTemporalClient` | `signalError: Error \| null` | Inject signal routing failures |
| `FakeTemporalClient` | `workflowStates: Map<string, FeatureWorkflowState>` | Control Branch A vs Branch B |
| `FakeLogger` | `entriesAt(level)` | Assert WARN log entries |
| `createThreadMessage(options)` | Sets `id`, `threadId`, `threadName` etc. | Construct triggering messages |

No changes to `FakeDiscordClient`, `FakeTemporalClient`, or any factory are required by this feature.

### 7.3 Test message construction pattern

All tests use `createThreadMessage` with explicit `id` and `threadId` to enable channel/message ID assertions:

```typescript
const message = createThreadMessage({
  id: "msg-test",
  threadId: "thread-test",
  threadName: "test-feature — define requirements",
  content: "@pm define requirements",
});
```

The FakeTemporalClient derives `workflowId` as `ptah-${featureSlug}`. For slug `"test-feature"`, the workflow ID is `"ptah-test-feature"`.

### 7.4 Unit test catalogue

The tests below map directly to the acceptance tests in FSPEC Section 8. Each group is added as a new `describe` block in `temporal-orchestrator.test.ts`.

---

#### Group MA: Message Acknowledgement

```typescript
describe("handleMessage — message acknowledgement (MA)", () => {
```

**AT-MA-01 — Workflow started: ✅ reaction posted**

```
Given: featureSlug "test-feature", FakeTemporalClient startWorkflowError null
When: handleMessage(message) completes
Then: discord.addReactionCalls contains exactly one entry
      { channelId: message.threadId, messageId: message.id, emoji: "✅" }
```

**AT-MA-02 — Workflow started: reply with workflow ID posted**

```
Given: same as AT-MA-01
When: handleMessage(message) completes
Then: discord.replyToMessageCalls contains exactly one entry
      { channelId: message.threadId, messageId: message.id,
        content: "Workflow started: ptah-test-feature" }
```

**AT-MA-03 — Signal routed: ✅ reaction posted, no reply**

```
Given: workflowStates.set("ptah-test-feature", { phaseStatus: "waiting-for-user" })
       message content is plain text (no ad-hoc directive)
When: handleMessage(message) completes
Then: discord.addReactionCalls has exactly one entry with emoji "✅"
      AND discord.replyToMessageCalls.filter(c => c.messageId === message.id) is empty
      AND discord.postPlainMessageCalls.filter(c => c.threadId === message.threadId) is empty
```

Note: `postPlainMessageCalls` filter uses `c.threadId` (not `c.channelId`).

**AT-MA-04 — `startWorkflowForFeature()` throws: ❌ reaction posted**

```
Given: temporalClient.startWorkflowError = new Error("connection timeout")
When: handleMessage(message) completes
Then: discord.addReactionCalls contains exactly one entry with emoji "❌"
```

**AT-MA-05 — `routeUserAnswer()` throws: ❌ reaction posted**

```
Given: workflowStates.set("ptah-test-feature", { phaseStatus: "waiting-for-user" })
       temporalClient.signalError = new Error("signal delivery failed")
When: handleMessage(message) completes
Then: discord.addReactionCalls contains exactly one entry with emoji "❌"
```

**AT-MA-06 — Error reply: `start workflow` operation label**

```
Given: temporalClient.startWorkflowError = new Error("connection timeout")
When: handleMessage(message) completes
Then: discord.replyToMessageCalls[0].content === "Failed to start workflow: connection timeout"
```

**AT-MA-07 — Error reply: `route answer` operation label**

```
Given: workflowStates.set("ptah-test-feature", { phaseStatus: "waiting-for-user" })
       temporalClient.signalError = new Error("signal delivery failed")
When: handleMessage(message) completes
Then: discord.replyToMessageCalls[0].content === "Failed to route answer: signal delivery failed"
```

**AT-MA-08 — Error reply: 200-character message not truncated**

```
Given: temporalClient.startWorkflowError = new Error("x".repeat(200))
When: handleMessage(message) completes
Then: const body = discord.replyToMessageCalls[0].content
      body.startsWith("Failed to start workflow: ")
      AND body.slice("Failed to start workflow: ".length).length === 200
```

**AT-MA-09 — Error reply: 201-character message truncated to 200**

```
Given: temporalClient.startWorkflowError = new Error("x".repeat(201))
When: handleMessage(message) completes
Then: const body = discord.replyToMessageCalls[0].content
      body.slice("Failed to start workflow: ".length).length === 200
      AND body.slice("Failed to start workflow: ".length) === "x".repeat(200)
```

**AT-MA-10 — Error reply: non-Error thrown string uses `String(err)`**

```
Given: configure FakeTemporalClient.startFeatureWorkflow to throw "temporal unreachable"
       (string, not Error)
When: handleMessage(message) completes
Then: discord.replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"
```

Note: `FakeTemporalClient.startWorkflowError` accepts `Error | null`. For this test, a
custom subclass or a direct override of `startFeatureWorkflow` is used to throw a non-Error
value.

**AT-MA-11 — Ack failure: WARN logged, orchestrator unaffected**

```
Given: temporalClient.startWorkflowError null (workflow starts successfully)
       discord.addReactionError = new Error("rate limited")
When: handleMessage(message) completes (must not throw)
Then: logger.entriesAt("WARN") contains entry whose message includes
      "Acknowledgement failed: rate limited"
      AND handleMessage resolved without throwing
```

**AT-MA-12 — Ack failure: `addReaction` failure does not suppress `replyToMessage`**

```
Given: workflow starts successfully
       discord.addReactionError = new Error("rate limited")
       discord.replyToMessageError null
When: handleMessage(message) completes
Then: discord.replyToMessageCalls contains the "Workflow started: ..." reply
      (replyToMessage was still called despite addReaction failing)
```

**AT-MA-13 — Ack calls follow Temporal operation resolution**

```
Given: a deferred promise replaces FakeTemporalClient.startFeatureWorkflow
       so that it resolves only when explicitly triggered
When: handleMessage(message) is called (not yet awaited to completion)
  At suspension point (before deferred resolves):
    discord.addReactionCalls.length === 0
    discord.replyToMessageCalls.length === 0
  After deferred resolves and handleMessage completes:
    discord.addReactionCalls.length === 1
    discord.replyToMessageCalls.length === 1
```

Implementation note: use a `Promise` with externally accessible `resolve` function, override
`startFeatureWorkflow` on the `FakeTemporalClient` instance for this test only, and use two
sequential assertion checkpoints between `handleMessage()` start and completion.

**AT-MA-14 — No double-acknowledgement per invocation**

```
Given: workflow starts successfully
When: handleMessage(message) completes
Then: discord.addReactionCalls
      .filter(c => c.messageId === message.id && c.emoji === "✅")
      .length === 1
```

**AT-MA-15 — No acknowledgement on query failure early-exit**

```
Given: temporalClient.queryWorkflowStateError = new Error("Temporal server unreachable")
When: handleMessage(message) completes
Then: discord.addReactionCalls.length === 0
      AND discord.replyToMessageCalls.length === 0
```

**AT-MA-16 — Dual ack failure: both `addReaction` and `replyToMessage` throw**

```
Given: workflow starts successfully
       discord.addReactionError = new Error("reaction rate limited")
       discord.replyToMessageError = new Error("reply rate limited")
When: handleMessage(message) completes (must not throw)
Then: logger.entriesAt("WARN") contains entry with "Acknowledgement failed: reaction rate limited"
      AND logger.entriesAt("WARN") contains entry with "Acknowledgement failed: reply rate limited"
      AND handleMessage resolved without throwing
```

**Additional — non-Error, non-string thrown value (FSPEC AT-MA-10 extension)**

```
Given: FakeTemporalClient.startFeatureWorkflow overridden to throw { code: 503 }
       (plain object, not an Error instance)
When: handleMessage(message) completes
Then: discord.replyToMessageCalls[0].content === "Failed to start workflow: [object Object]"
```

---

### 7.5 Regression: existing tests unaffected

The existing `G3: startNewWorkflow` describe block contains tests that assert `discord.postPlainMessageCalls` content. These tests must be updated because the implementation previously used `postPlainMessage` for the workflow-started success path and the unexpected-error failure path — both of which are now replaced by `addReaction` + `replyToMessage`.

| Existing test | Required update |
|--------------|-----------------|
| `"starts workflow with default featureConfig and posts confirmation"` | Remove assertion on `postPlainMessageCalls[0].content === "Started workflow ptah-auth for auth"`. Replace with assertions on `addReactionCalls[0].emoji === "✅"` and `replyToMessageCalls[0].content === "Workflow started: ptah-auth"`. |
| `"posts error when workflow start fails with unexpected error"` | Remove assertion on `postPlainMessageCalls[0].content`. Replace with assertions on `addReactionCalls[0].emoji === "❌"` and `replyToMessageCalls[0].content === "Failed to start workflow: Temporal unreachable"`. |
| `"posts notice when workflow already running (WorkflowExecutionAlreadyStartedError)"` | Unchanged — this path still uses `postPlainMessage`. |

The existing `G4: user-answer routing` describe block contains:

| Existing test | Required update |
|--------------|-----------------|
| `"does not post confirmation after delivering answer (BR-DR-08)"` | This test asserts `discord.postPlainMessageCalls.toHaveLength(0)`. After the change, `addReactionCalls` will have one entry (✅). The `postPlainMessageCalls` assertion remains valid. Add a complementary assertion `discord.replyToMessageCalls.toHaveLength(0)`. |
| `"posts error when user-answer signal delivery fails"` | Remove assertion on `postPlainMessageCalls[0].content === "Failed to deliver answer. Please try again."`. Replace with assertions on `addReactionCalls[0].emoji === "❌"` and `replyToMessageCalls[0].content === "Failed to route answer: signal failed"`. |

---

## 8. Requirements Traceability

| Requirement | Technical component |
|-------------|-------------------|
| REQ-MA-01 | `startNewWorkflow()` success path: `addReaction("✅")` |
| REQ-MA-02 | `startNewWorkflow()` success path: `replyToMessage("Workflow started: …")` |
| REQ-MA-03 | `handleStateDependentRouting()` success path: `addReaction("✅")`, no `replyToMessage` |
| REQ-MA-04 | `startNewWorkflow()` and `handleStateDependentRouting()` error paths: `addReaction("❌")` |
| REQ-MA-05 | Both error paths: `replyToMessage("Failed to {op}: …")`, `formatErrorMessage()` |
| REQ-MA-06 | `ackWithWarnOnError()` wraps all `addReaction` and `replyToMessage` calls |
| REQ-NF-17-01 | Ack calls placed after awaited Temporal operation in both private methods |
| REQ-NF-17-02 | No implementation requirement — latency is an operational concern |
| REQ-NF-17-03 | Single `addReaction` call per (messageId, emoji) pair per invocation — enforced by code path structure |

---

## 9. Out-of-Scope Paths (No Changes)

The following code paths in `temporal-orchestrator.ts` are explicitly unchanged by this feature:

| Path | Method | Existing behaviour preserved |
|------|--------|------------------------------|
| Temporal query failure early-exit | `handleMessage()` lines 299–303 | WARN log + early return |
| `WorkflowExecutionAlreadyStartedError` | `startNewWorkflow()` catch | `postPlainMessage("Workflow already running …")` |
| `phaseDetector.detect()` throws | `startNewWorkflow()` inner try/catch | `postPlainMessage` transient error + early return |
| Ad-hoc directive path | `handleAdHocDirective()` | Existing `postPlainMessage` ack |
| Silent drop (non-actionable `phaseStatus`) | `handleStateDependentRouting()` | Silent return |
| `handleIntentRouting()` (`retry`/`cancel`/`resume` signals) | `handleIntentRouting()` | Existing `postPlainMessage` ack and error handling |
| Empty-slug guard | `handleMessage()` | WARN log + early return |
| No-agent-mention guard | `handleMessage()` | Silent early return |
| Bot message filter | `handleMessage()` | Silent early return |

---

## 10. No Breaking Changes

| Interface / contract | Change |
|---------------------|--------|
| `DiscordClient` interface | None — `addReaction` and `replyToMessage` already exist |
| `TemporalOrchestrator` public API (`handleMessage`, `startWorkflowForFeature`, `routeUserAnswer`, `routeRetryOrCancel`, `routeResumeOrCancel`, `startup`, `shutdown`) | None |
| `TemporalOrchestratorDeps` | None |
| `ThreadMessage` type | None |
| `FakeDiscordClient` / `FakeTemporalClient` | None |
| `factories.ts` test helpers | None |

The observable breaking change for existing tests is that `postPlainMessage` is no longer called in the workflow-started success path and the unexpected-error failure path of `startNewWorkflow()`, and in the signal-routing error path of `handleStateDependentRouting()`. These were internal implementation details, not API contracts. The affected test assertions are updated as described in Section 7.5.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | Senior Software Engineer | Initial TSPEC. Covers private method insertion points, two private helpers (`ackWithWarnOnError`, `formatErrorMessage`), full test catalogue mapping to FSPEC ATs, regression update guidance, and explicit out-of-scope preservation. Incorporates all FSPEC v1.1 nuances: correct `handleStateDependentRouting` signature (3 params), correct `postPlainMessageCalls` filter field (`c.threadId`), non-Error/non-string thrown value test, sequential ack call ordering (each awaited before next begins). |

---

*End of Document*
