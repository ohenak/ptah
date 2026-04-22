# Cross-Review: product-manager — Implementation

**Reviewer:** product-manager
**Document reviewed:** `ptah/src/orchestrator/temporal-orchestrator.ts` + `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts`
**Date:** 2026-04-21
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| — | — | No findings. All P0 acceptance criteria are satisfied. | — |

---

## Questions

| ID | Question |
|----|---------|
| — | No open questions. |

---

## Positive Observations

- **REQ-MA-01 — ✅ reaction on workflow started:** `startNewWorkflow()` calls `ackWithWarnOnError(() => this.discord.addReaction(message.threadId, message.id, "✅"))` only after `startWorkflowForFeature()` resolves successfully. AT-MA-01 and PROP-MA-20 both assert this. The channelId is sourced from `message.threadId` per assumption A-17, consistent with PROP-MA-23.

- **REQ-MA-02 — Reply format `Workflow started: {workflowId}`:** The exact string `Workflow started: ${workflowId}` is constructed in `startNewWorkflow()` and passed to `replyToMessage`. The workflowId is the value returned directly by `startWorkflowForFeature()`, not re-derived. AT-MA-02, PROP-MA-25, and the G3 confirmation test all assert this. The format matches the REQ exactly, including the `ptah-{slug}` workflow ID convention.

- **REQ-MA-03 — ✅ reaction on signal routed, no plain reply:** `handleStateDependentRouting()` adds the ✅ reaction after `routeUserAnswer()` resolves and posts no `replyToMessage` or `postPlainMessage` on the success path. AT-MA-03 explicitly asserts `replyToMessageCalls` and `postPlainMessageCalls` are each empty for that message ID/thread ID.

- **REQ-MA-04 — ❌ reaction on Temporal failure:** Both failure paths (workflow start failure in `startNewWorkflow()` and signal routing failure in `handleStateDependentRouting()`) issue `addReaction(..., "❌")` inside `ackWithWarnOnError`. Tested in AT-MA-04 (workflow start) and AT-MA-05 (signal routing). PROP-MA-22 guards against ✅ and ❌ coexisting in a single invocation.

- **REQ-MA-05 — Error reply format and operation labels:** The two in-scope operation labels, `start workflow` and `route answer`, are used precisely:
  - Workflow start failure: `Failed to start workflow: ${errMsg}` (line 488)
  - Signal routing failure: `Failed to route answer: ${errMsg}` (line 528)
  Both match the REQ v1.2 enumeration. The 200-character truncation is implemented in `formatErrorMessage()` via `.slice(0, 200)` applied to `err.message` (or `String(err)` for non-Error values). The prefix is concatenated after truncation, so total message length can reach 226 characters — consistent with PROP-MA-13. Stack traces are absent — PROP-MA-26 asserts this. AT-MA-06 through AT-MA-10 cover all sub-cases.

- **REQ-MA-06 — Swallow acknowledgement failures:** The `ackWithWarnOnError` helper wraps every `addReaction` and `replyToMessage` call in a `try/catch`. On failure it logs `Acknowledgement failed: ${msg}` where `msg` is `err.message` for Error instances and `String(err)` for all other thrown values. No re-throw occurs. `handleMessage()` returns normally. PROP-MA-31 asserts the exact WARN message format. PROP-MA-18 guards against `undefined` appearing instead of `String(err)`. PROP-MA-32 confirms no ERROR-level log is produced. AT-MA-11, AT-MA-12, AT-MA-16, PROP-MA-16, PROP-MA-33 cover the spectrum of ack failure scenarios.

- **REQ-NF-17-01 — Ack calls follow Temporal operation resolution:** Both `startNewWorkflow()` and `handleStateDependentRouting()` follow the sequential model: `await <TemporalOp>`, then `await ackWithWarnOnError(addReaction)`, then `await ackWithWarnOnError(replyToMessage)` where applicable. AT-MA-13 uses a deferred-promise pattern to empirically verify that no ack call precedes Temporal resolution.

- **Scope boundary respected — `WorkflowExecutionAlreadyStartedError`:** This path retains the pre-existing `postPlainMessage("Workflow already running for {slug}")` behaviour and receives no new emoji reaction or `replyToMessage` call, consistent with the FSPEC BR-11 out-of-scope ruling. PROP-MA-28 guards this regression.

- **Scope boundary respected — Temporal query failure early-exit:** The `queryWorkflowState()` non-`WorkflowNotFoundError` path exits with a WARN log and no acknowledgement, consistent with Section 3.2. AT-MA-15 asserts `addReactionCalls.length === 0` and `replyToMessageCalls.length === 0` for this path.

- **Scope boundary respected — phase detection failure:** `phaseDetector.detect()` failure exits with a `postPlainMessage` (pre-existing error path) and no new acknowledgement calls. PROP-MA-30 asserts zero reactions and zero `replyToMessage` calls.

- **User scenario fidelity:** US-33 (developer sees workflow ID without leaving Discord) is fully delivered: ✅ reaction + `Workflow started: ptah-{slug}` reply. US-34 (developer knows answer was delivered) is delivered with ✅ reaction only — no noise from a verbose reply, exactly as designed. US-35 (developer knows Ptah failed and why) is delivered with ❌ reaction + truncated plain-text error message — no stack trace, actionable context.

- **Test coverage depth:** The MA test suite (lines 1264–1748) is comprehensive. It covers nominal paths, all failure combinations, edge cases (200-char boundary, non-Error thrown values, dual ack failure), ordering invariants, no-double-acknowledgement, channel/message ID sourcing, and negative scope-boundary cases. Every P0 acceptance criterion maps to at least one AT-MA test.

---

## Recommendation

**Approved**

All seven P0 requirements (REQ-MA-01 through REQ-MA-06, REQ-NF-17-01) are implemented as specified. Message formats match the REQ exactly. Scope boundaries are respected without exception. The user experience described in US-33, US-34, and US-35 is faithfully delivered. No out-of-scope behaviour was introduced. The implementation is ready to ship.
