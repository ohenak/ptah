# Execution Plan

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | PLAN-message-acknowledgement |
| **Linked TSPEC** | [TSPEC-message-acknowledgement v1.0](./TSPEC-message-acknowledgement.md) |
| **Linked FSPEC** | [FSPEC-message-acknowledgement v1.1](./FSPEC-message-acknowledgement.md) |
| **Linked REQ** | [REQ-message-acknowledgement v1.0](./REQ-message-acknowledgement.md) |
| **Version** | 1.0 |
| **Date** | 2026-04-21 |
| **Author** | Senior Software Engineer |
| **Status** | Draft |

---

## 1. Summary

This plan implements per-message acknowledgement in `TemporalOrchestrator`. When a Discord thread message triggers a Temporal operation, the user now receives:

- A ✅ or ❌ emoji reaction on their message (all outcomes)
- A plain-text reply for workflow-started (`Workflow started: {workflowId}`) and all failure cases (`Failed to {operation}: {error message}`)
- No reply for the signal-routed success case (reaction only)

All changes are confined to a single source file (`ptah/src/orchestrator/temporal-orchestrator.ts`) and a single test file (`ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts`). No new files, interfaces, or fakes are required.

The implementation also requires adding `startWorkflowErrorValue?: unknown` to `FakeTemporalClient` to enable AT-MA-10 (non-Error thrown value test).

---

## 2. Dependency Graph

```
BATCH 1 (parallel)
  ├── TASK-01: Add startWorkflowErrorValue to FakeTemporalClient  [factories.ts only]
  └── TASK-02: Write failing tests — Group MA (AT-MA-01 through AT-MA-16) + regression updates
              [temporal-orchestrator.test.ts only]
              depends on: none (write tests first; TASK-01 is needed for AT-MA-10 but
              the test file can be written and run Red before TASK-01 merges — or TASK-01
              can be completed first within the same agent)

BATCH 2 (single task — depends on BATCH 1 being Red)
  └── TASK-03: Implement helpers and modify startNewWorkflow + handleStateDependentRouting
              [temporal-orchestrator.ts only]
              depends on: TASK-01 (FakeTemporalClient extended), TASK-02 (tests Red)

BATCH 3 (single task — depends on TASK-03 turning tests Green)
  └── TASK-04: Refactor — extract, tidy, verify no lint/type errors, confirm all tests pass
              [temporal-orchestrator.ts, temporal-orchestrator.test.ts]
              depends on: TASK-03 (Green)
```

**Parallelization note:** TASK-01 and TASK-02 touch different files (`factories.ts` vs. `temporal-orchestrator.test.ts`) and can be dispatched to two agents simultaneously. TASK-03 and TASK-04 are sequential and single-agent.

---

## 3. Task Table

| Task ID | Description | Test File | Source File | Dependencies | Status |
|---------|-------------|-----------|-------------|--------------|--------|
| TASK-01 | Extend `FakeTemporalClient` with `startWorkflowErrorValue?: unknown` override to enable throwing non-Error values in AT-MA-10 and the `{ code: 503 }` Additional test | `ptah/tests/fixtures/factories.ts` | `ptah/tests/fixtures/factories.ts` | none | ⬜ |
| TASK-02 | Write failing tests: new `describe("handleMessage — message acknowledgement (MA)")` block (AT-MA-01 through AT-MA-16 + Additional non-Error object test) and update five existing regression tests in G3 and G4 | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | — | none | ⬜ |
| TASK-03 | Implement `ackWithWarnOnError`, `formatErrorMessage`, and modify `startNewWorkflow` (success + error paths) and `handleStateDependentRouting` (`waiting-for-user` branch only) | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | TASK-01, TASK-02 | ⬜ |
| TASK-04 | Refactor: verify no dead code, no lint errors, no TypeScript errors; confirm full test suite passes (`npm test` from `ptah/`) | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | TASK-03 | ⬜ |

**Status key:** ⬜ Not Started | 🔴 Red | 🟢 Green | 🔵 Refactored | ✅ Done

---

## 4. Detailed Task Specifications

### TASK-01 — Extend FakeTemporalClient

**File:** `ptah/tests/fixtures/factories.ts`

**Change:** Add `startWorkflowErrorValue?: unknown` property to `FakeTemporalClient`. In `startFeatureWorkflow()`, check this property first (before `startWorkflowError`) and throw the value directly if set.

**Before:**
```typescript
startWorkflowError: Error | null = null;

async startFeatureWorkflow(params: StartWorkflowParams): Promise<string> {
  if (this.startWorkflowError) throw this.startWorkflowError;
  this.startedWorkflows.push(params);
  return `ptah-${params.featureSlug}`;
}
```

**After:**
```typescript
startWorkflowError: Error | null = null;
startWorkflowErrorValue?: unknown; // for throwing non-Error values (AT-MA-10)

async startFeatureWorkflow(params: StartWorkflowParams): Promise<string> {
  if (this.startWorkflowErrorValue !== undefined) throw this.startWorkflowErrorValue;
  if (this.startWorkflowError) throw this.startWorkflowError;
  this.startedWorkflows.push(params);
  return `ptah-${params.featureSlug}`;
}
```

**Why this approach (not method override):** Using a property on the fake is consistent with the existing `startWorkflowError`, `signalError`, and `queryWorkflowStateError` patterns in `FakeTemporalClient`. It keeps test setup uniform and avoids per-test method reassignment, which can leak state between tests if not carefully cleaned up.

**Verification:** `npm test` from `ptah/` — existing tests must still pass.

---

### TASK-02 — Write Failing Tests (Red Phase)

**File:** `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts`

#### 2a. New describe block

Add at the end of the file a new describe group:

```typescript
describe("handleMessage — message acknowledgement (MA)", () => {
  // ... tests AT-MA-01 through AT-MA-16 + Additional
});
```

Use the same `beforeEach` scaffolding pattern as G3/G4: `FakeDiscordClient`, `FakeTemporalClient`, `FakeLogger`, `FakeAgentRegistry([pmAgent])`, `TemporalOrchestrator(makeDeps(...))`.

Standard message fixture for workflow-start tests:

```typescript
const message = createThreadMessage({
  id: "msg-test",
  threadId: "thread-test",
  threadName: "test-feature — define requirements",
  content: "@pm define requirements",
});
```

For signal-routing tests, set `workflowStates.set("ptah-test-feature", defaultFeatureWorkflowState({ featureSlug: "test-feature", phaseStatus: "waiting-for-user" }))` and use:

```typescript
const message = createThreadMessage({
  id: "msg-test",
  threadId: "thread-test",
  threadName: "test-feature — define requirements",
  content: "yes, proceed",
});
```

#### 2b. Test catalogue

Write one `it()` per AT. Key implementation notes per test:

**AT-MA-01** — Assert `discord.addReactionCalls` has one entry `{ channelId: "thread-test", messageId: "msg-test", emoji: "✅" }`.

**AT-MA-02** — Assert `discord.replyToMessageCalls` has one entry with `content: "Workflow started: ptah-test-feature"`, `channelId: "thread-test"`, `messageId: "msg-test"`.

**AT-MA-03** — Use signal-routing fixture. Assert `addReactionCalls` has one entry with `emoji: "✅"`. Assert `replyToMessageCalls.filter(c => c.messageId === message.id)` is empty. Assert `postPlainMessageCalls.filter(c => c.threadId === message.threadId)` is empty. Note: `postPlainMessageCalls` entries have `{ threadId, content }` — filter on `c.threadId`.

**AT-MA-04** — Set `temporalClient.startWorkflowError = new Error("connection timeout")`. Assert `addReactionCalls` has one entry with `emoji: "❌"`.

**AT-MA-05** — Use signal-routing fixture + `temporalClient.signalError = new Error("signal delivery failed")`. Assert `addReactionCalls` has one entry with `emoji: "❌"`.

**AT-MA-06** — Set `temporalClient.startWorkflowError = new Error("connection timeout")`. Assert `replyToMessageCalls[0].content === "Failed to start workflow: connection timeout"`.

**AT-MA-07** — Use signal-routing fixture + `temporalClient.signalError = new Error("signal delivery failed")`. Assert `replyToMessageCalls[0].content === "Failed to route answer: signal delivery failed"`.

**AT-MA-08** — Set `temporalClient.startWorkflowError = new Error("x".repeat(200))`. Assert `replyToMessageCalls[0].content.slice("Failed to start workflow: ".length).length === 200` and `content.endsWith("x".repeat(200))`.

**AT-MA-09** — Set `temporalClient.startWorkflowError = new Error("x".repeat(201))`. Assert the body portion is exactly 200 chars and equals `"x".repeat(200)`.

**AT-MA-10** — Set `temporalClient.startWorkflowErrorValue = "temporal unreachable"`. Assert `replyToMessageCalls[0].content === "Failed to start workflow: temporal unreachable"`.

**Additional (non-Error object)** — Set `temporalClient.startWorkflowErrorValue = { code: 503 }`. Assert `replyToMessageCalls[0].content === "Failed to start workflow: [object Object]"`.

**AT-MA-11** — Set `discord.addReactionError = new Error("rate limited")`. `await expect(orchestrator.handleMessage(message)).resolves.toBeUndefined()`. Assert `logger.entriesAt("WARN")` contains an entry with message including `"Acknowledgement failed: rate limited"`.

**AT-MA-12** — Set `discord.addReactionError = new Error("rate limited")`, `replyToMessageError = null`. Assert `replyToMessageCalls` contains the `"Workflow started: ptah-test-feature"` reply.

**AT-MA-13** — Deferred-promise ordering test. Pattern:

```typescript
it("acknowledgement calls follow Temporal operation resolution", async () => {
  let resolveWorkflow!: (workflowId: string) => void;
  const deferred = new Promise<string>((resolve) => {
    resolveWorkflow = resolve;
  });
  temporalClient.startFeatureWorkflow = async (_params) => deferred;

  const handlePromise = orchestrator.handleMessage(message);

  // Flush microtasks to let handleMessage reach the await point
  await Promise.resolve();
  await Promise.resolve();

  expect(discord.addReactionCalls).toHaveLength(0);
  expect(discord.replyToMessageCalls).toHaveLength(0);

  resolveWorkflow("ptah-test-feature");
  await handlePromise;

  expect(discord.addReactionCalls).toHaveLength(1);
  expect(discord.replyToMessageCalls).toHaveLength(1);
});
```

Note: Two `await Promise.resolve()` flushes are sufficient for the microtask queue to advance past the `await` inside `startNewWorkflow()`. If the test is flaky, add a third flush.

**AT-MA-14** — Assert `addReactionCalls.filter(c => c.messageId === message.id && c.emoji === "✅").length === 1`.

**AT-MA-15** — Set `temporalClient.queryWorkflowStateError = new Error("Temporal server unreachable")`. Assert `addReactionCalls.length === 0` and `replyToMessageCalls.length === 0`.

**AT-MA-16** — Set `addReactionError = new Error("reaction rate limited")`, `replyToMessageError = new Error("reply rate limited")`. Assert `handleMessage` resolves without throwing. Assert WARN entries include both `"Acknowledgement failed: reaction rate limited"` and `"Acknowledgement failed: reply rate limited"`.

#### 2c. Regression updates — G3 tests

**`"starts workflow with default featureConfig and posts confirmation"`**

Remove: `expect(discord.postPlainMessageCalls).toHaveLength(1)` and content assertion.

Add:
```typescript
expect(discord.addReactionCalls).toHaveLength(1);
expect(discord.addReactionCalls[0].emoji).toBe("✅");
expect(discord.replyToMessageCalls).toHaveLength(1);
expect(discord.replyToMessageCalls[0].content).toBe("Workflow started: ptah-auth");
```

**`"posts error when workflow start fails with unexpected error"`**

Remove: `expect(discord.postPlainMessageCalls).toHaveLength(1)` and old content assertion `"Failed to start workflow for auth. Please try again."`.

Add:
```typescript
expect(discord.addReactionCalls).toHaveLength(1);
expect(discord.addReactionCalls[0].emoji).toBe("❌");
expect(discord.replyToMessageCalls).toHaveLength(1);
expect(discord.replyToMessageCalls[0].content).toBe("Failed to start workflow: Temporal unreachable");
```

**`"posts notice when workflow already running (WorkflowExecutionAlreadyStartedError)"`**

Unchanged — `postPlainMessage("Workflow already running for auth")` still fires. Add a complementary negative assertion to guard against accidental reaction injection:

```typescript
expect(discord.addReactionCalls).toHaveLength(0);
```

#### 2d. Regression updates — G4 tests

**`"does not post confirmation after delivering answer (BR-DR-08)"`**

Existing assertion `expect(discord.postPlainMessageCalls).toHaveLength(0)` remains valid. Add:
```typescript
expect(discord.replyToMessageCalls).toHaveLength(0);
```

Also add the ✅ reaction assertion (this path now produces a reaction):
```typescript
expect(discord.addReactionCalls).toHaveLength(1);
expect(discord.addReactionCalls[0].emoji).toBe("✅");
```

**`"posts error when user-answer signal delivery fails"`**

Remove: `expect(discord.postPlainMessageCalls).toHaveLength(1)` and content assertion `"Failed to deliver answer. Please try again."`.

Add:
```typescript
expect(discord.addReactionCalls).toHaveLength(1);
expect(discord.addReactionCalls[0].emoji).toBe("❌");
expect(discord.replyToMessageCalls).toHaveLength(1);
expect(discord.replyToMessageCalls[0].content).toBe("Failed to route answer: signal failed");
```

**Verification:** Run `npm test` from `ptah/`. All new MA tests must be Red (failing). The five updated regression tests must also be Red. No other test should change status.

---

### TASK-03 — Implement (Green Phase)

**File:** `ptah/src/orchestrator/temporal-orchestrator.ts`

This task turns all Red tests Green. Make the minimum changes required.

#### 3a. Add `formatErrorMessage` private helper

Location: add as a private method on `TemporalOrchestrator` (near end of class, before closing brace).

```typescript
private formatErrorMessage(err: unknown): string {
  const rawMsg = err instanceof Error ? err.message : String(err);
  return rawMsg.slice(0, 200);
}
```

#### 3b. Add `ackWithWarnOnError` private helper

```typescript
private async ackWithWarnOnError(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (ackErr) {
    const msg = ackErr instanceof Error ? ackErr.message : String(ackErr);
    this.logger.warn(`Acknowledgement failed: ${msg}`);
  }
}
```

#### 3c. Modify `startNewWorkflow` — success path

Find the existing success path inside `startNewWorkflow()` where the old `postPlainMessage("Started workflow ...")` call lives. Remove it and replace with:

```typescript
await this.ackWithWarnOnError(() =>
  this.discord.addReaction(message.threadId, message.id, "✅"),
);
await this.ackWithWarnOnError(() =>
  this.discord.replyToMessage(
    message.threadId,
    message.id,
    `Workflow started: ${workflowId}`,
  ),
);
```

#### 3d. Modify `startNewWorkflow` — error path (non-`WorkflowExecutionAlreadyStartedError`)

Find the `else` branch (the non-`WorkflowExecutionAlreadyStartedError` catch). Remove the old `postPlainMessage("Failed to start workflow for ...")` call and replace with:

```typescript
const errMsg = this.formatErrorMessage(err);
await this.ackWithWarnOnError(() =>
  this.discord.addReaction(message.threadId, message.id, "❌"),
);
await this.ackWithWarnOnError(() =>
  this.discord.replyToMessage(
    message.threadId,
    message.id,
    `Failed to start workflow: ${errMsg}`,
  ),
);
```

The `WorkflowExecutionAlreadyStartedError` branch is **unchanged**.

#### 3e. Modify `handleStateDependentRouting` — `waiting-for-user` success path

After `await this.routeUserAnswer(...)` resolves (inside the `try` block), add:

```typescript
await this.ackWithWarnOnError(() =>
  this.discord.addReaction(message.threadId, message.id, "✅"),
);
```

No `replyToMessage` call on this path.

#### 3f. Modify `handleStateDependentRouting` — `waiting-for-user` error path

Find the `catch` block in the `waiting-for-user` branch. Remove the old `postPlainMessage("Failed to deliver answer. Please try again.")` call and replace with:

```typescript
const errMsg = this.formatErrorMessage(err);
await this.ackWithWarnOnError(() =>
  this.discord.addReaction(message.threadId, message.id, "❌"),
);
await this.ackWithWarnOnError(() =>
  this.discord.replyToMessage(
    message.threadId,
    message.id,
    `Failed to route answer: ${errMsg}`,
  ),
);
```

#### Invariants to preserve

- `WorkflowExecutionAlreadyStartedError` catch branch: `postPlainMessage("Workflow already running for ${slug}")` — **do not touch**.
- `phaseDetector.detect()` error path inside `startNewWorkflow()` — **do not touch**.
- `handleAdHocDirective()` — **do not touch**.
- `handleMessage()` query-failure early-exit — **do not touch**.
- `handleIntentRouting()` — **do not touch**.
- All other `handleStateDependentRouting()` branches (`failed`, `revision-bound-reached`, silent drop) — **do not touch**.

**Verification:** Run `npm test` from `ptah/`. All 16 new MA tests and all 5 updated regression tests must now be Green. No previously-passing tests should turn Red.

---

### TASK-04 — Refactor and Final Verification

**Files:** `ptah/src/orchestrator/temporal-orchestrator.ts`, `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts`

1. Check for any dead code left by the removal of the old `postPlainMessage` calls (e.g. unused variables, unreachable branches).
2. Verify `formatErrorMessage` and `ackWithWarnOnError` have JSDoc comments or inline comments explaining their contracts, consistent with surrounding code style.
3. Run `npm run build` from `ptah/` — zero TypeScript errors.
4. Run `npm test` from `ptah/` — full suite passes (zero failures, zero skips introduced by this feature).
5. Confirm test count delta: +16 new MA tests + "Additional" test = +17 new `it()` blocks; 5 updated regression tests are modified in-place (count unchanged for those).

---

## 5. Integration Points

| Method | File | Change type |
|--------|------|-------------|
| `TemporalOrchestrator.startNewWorkflow()` | `ptah/src/orchestrator/temporal-orchestrator.ts` | Modified — success path and non-`WorkflowExecutionAlreadyStartedError` error path |
| `TemporalOrchestrator.handleStateDependentRouting()` | `ptah/src/orchestrator/temporal-orchestrator.ts` | Modified — `waiting-for-user` success and error paths only |
| `TemporalOrchestrator.ackWithWarnOnError()` | `ptah/src/orchestrator/temporal-orchestrator.ts` | New private method |
| `TemporalOrchestrator.formatErrorMessage()` | `ptah/src/orchestrator/temporal-orchestrator.ts` | New private method |
| `FakeTemporalClient.startFeatureWorkflow()` | `ptah/tests/fixtures/factories.ts` | Extended with `startWorkflowErrorValue?: unknown` |
| `temporal-orchestrator.test.ts` — G3 group | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | 2 tests updated, 1 test gets negative guard |
| `temporal-orchestrator.test.ts` — G4 group | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | 2 tests updated |
| `temporal-orchestrator.test.ts` — new MA group | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | 17 new tests added |

---

## 6. Out-of-Scope Paths — No-Touch List

The following are explicitly unchanged by this feature. Agents must not modify these paths under any circumstances:

| Path | Location |
|------|----------|
| `WorkflowExecutionAlreadyStartedError` catch | `startNewWorkflow()` |
| `phaseDetector.detect()` error path | `startNewWorkflow()` inner try/catch |
| Ad-hoc directive path | `handleAdHocDirective()` |
| Temporal query failure early-exit | `handleMessage()` lines ~299–303 |
| `failed` / `revision-bound-reached` sub-branch | `handleStateDependentRouting()` |
| Silent drop (non-actionable `phaseStatus`) | `handleStateDependentRouting()` |
| `handleIntentRouting()` | All retry/cancel/resume paths |
| Empty-slug guard | `handleMessage()` |
| No-agent-mention guard | `handleMessage()` |
| Bot message filter | `handleMessage()` |

---

## 7. Definition of Done

- [ ] `FakeTemporalClient.startWorkflowErrorValue` property added and `startFeatureWorkflow` updated to use it (TASK-01)
- [ ] All 17 new tests in the MA describe group are written and Red before implementation (TASK-02)
- [ ] All 5 regression tests in G3/G4 are updated and Red before implementation (TASK-02)
- [ ] `ackWithWarnOnError` private helper implemented (TASK-03)
- [ ] `formatErrorMessage` private helper implemented (TASK-03)
- [ ] `startNewWorkflow` success path uses `addReaction("✅")` + `replyToMessage("Workflow started: ...")` (TASK-03)
- [ ] `startNewWorkflow` error path uses `addReaction("❌")` + `replyToMessage("Failed to start workflow: ...")` (TASK-03)
- [ ] `handleStateDependentRouting` `waiting-for-user` success path uses `addReaction("✅")` only (TASK-03)
- [ ] `handleStateDependentRouting` `waiting-for-user` error path uses `addReaction("❌")` + `replyToMessage("Failed to route answer: ...")` (TASK-03)
- [ ] Old `postPlainMessage` calls in the two modified paths are removed (TASK-03)
- [ ] All 17 new MA tests pass Green (TASK-03)
- [ ] All 5 updated regression tests pass Green (TASK-03)
- [ ] No previously-passing tests are broken (TASK-03)
- [ ] `npm run build` passes with zero TypeScript errors (TASK-04)
- [ ] `npm test` passes with full suite (TASK-04)
- [ ] No dead code or lint errors introduced (TASK-04)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | Senior Software Engineer | Initial PLAN. Incorporates TSPEC v1.0, FSPEC v1.1, and both cross-review findings. Key decisions from TSPEC: `ackWithWarnOnError` + `formatErrorMessage` helpers; insertion in private methods not `handleMessage()`; `startWorkflowErrorValue` override for AT-MA-10; deferred-promise pattern for AT-MA-13; `postPlainMessageCalls` filter uses `c.threadId`; `WorkflowExecutionAlreadyStartedError` path unchanged. |

---

*End of Document*
