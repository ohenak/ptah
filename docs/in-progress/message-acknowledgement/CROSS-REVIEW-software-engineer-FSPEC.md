# Cross-Review: Software Engineer — FSPEC-message-acknowledgement

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/FSPEC-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | High | Acknowledgement insertion point is misspecified — `handleMessage` does not directly call `startFeatureWorkflow()` or `routeUserAnswer()`; it delegates to private methods | Section 3 Behavioral Flows |
| F-02 | High | `WorkflowExecutionAlreadyStartedError` path has no specified acknowledgement behaviour | Section 3.1, FSPEC-MA-01, FSPEC-MA-04 |
| F-03 | Medium | Phase detection failure path in `startNewWorkflow` is an uncovered error scenario | Section 3.1, Section 6.1 |
| F-04 | Medium | Behavioral flows for Branch A success paths (ad-hoc directive, non-waiting-for-user states) are missing from scope discussion | Section 2.2 Out of Scope, Section 3 |
| F-05 | Low | AT-MA-03 assertion "replyToMessageCalls is empty for this invocation" is untestable without per-invocation isolation on the fake | Section 8, AT-MA-03 |
| F-06 | Low | FSPEC-MA-02 `workflowId` format description (`ptah-{slug}`) contradicts REQ-MA-02 AC (`ptah-feature-{slug}-{n}`) — FSPEC is correct but cross-document inconsistency will cause test confusion | FSPEC-MA-02, REQ-MA-02 |

---

## Finding Detail

### F-01 — High: Acknowledgement insertion point misspecified

**Section ref:** Section 3 Behavioral Flows (all three diagrams), FSPEC-MA-01, FSPEC-MA-03, FSPEC-MA-04

**Issue:** The behavioral flow diagrams in Sections 3.1, 3.2, and 3.3 show `handleMessage()` calling `startFeatureWorkflow()` and `routeUserAnswer()` directly, as if these are inline call sites within a single method body. The actual implementation delegates to private methods: `startNewWorkflow()` (line 433) and `handleStateDependentRouting()` (line 485) — both of which are called via `await` and `return` from `handleMessage()`. The acknowledgement calls (`addReaction`, `replyToMessage`) must be inserted inside these private methods, not appended to the end of `handleMessage()`. If an implementer follows the flow diagrams literally and adds acknowledgement at the `handleMessage` level after `await this.startNewWorkflow(slug, message)`, the acknowledgement will fire even when `startNewWorkflow` swallows the error internally and returns without the workflow ID — producing a false ✅.

**Recommendation:** Update Sections 3.1 and 3.3 diagrams to reflect the private method boundary. Specify explicitly that acknowledgement logic is placed inside `startNewWorkflow()` (after the `startWorkflowForFeature()` call resolves) and inside `handleStateDependentRouting()` (after the `routeUserAnswer()` call resolves). Alternatively, restructure `handleMessage` to bring acknowledgement to the top level by having the private methods return a result discriminant, but this is an implementation decision — the FSPEC must at minimum state which call site is the insertion point.

---

### F-02 — High: `WorkflowExecutionAlreadyStartedError` has no specified acknowledgement

**Section ref:** Section 3.1, Section 6.1 Error Handling, FSPEC-MA-04

**Issue:** `startNewWorkflow()` (line 467) catches `WorkflowExecutionAlreadyStartedError` separately from all other errors and posts a bespoke message: `"Workflow already running for {slug}"`. This is neither a success case (the new workflow was not started) nor covered by the generic failure path (which uses `"Failed to start workflow: ..."` format). The FSPEC Section 3.1 shows `startFeatureWorkflow()` resolving or throwing, with no branch for this specific exception. The current code posts a plain-text message via `postPlainMessage` (not `replyToMessage`) and does not add any reaction. The FSPEC provides no guidance: should `WorkflowExecutionAlreadyStartedError` result in a ✅ (idempotent — workflow is effectively running), a ❌ (the user's start intent failed), or no reaction at all? The implementation choices made at each insertion point will diverge without explicit direction.

**Recommendation:** Add a branch to the Section 3.1 flow diagram for `WorkflowExecutionAlreadyStartedError`. Specify the emoji (✅ or ❌) and the reply text. If the decision is "no acknowledgement via the new mechanism — the existing `postPlainMessage` call is sufficient," that must be explicitly stated in Section 2.2 Out of Scope.

---

### F-03 — Medium: Phase detection failure path is an uncovered error scenario

**Section ref:** Section 6.1 Error Handling, Section 3.1

**Issue:** `startNewWorkflow()` lines 436–448 run `this.phaseDetector.detect(slug)` before calling `startFeatureWorkflow()`. If phase detection throws, the method logs the error and calls `postPlainMessage` with a transient-error message, then returns without calling `startFeatureWorkflow()` at all. The FSPEC Section 3.1 preconditions do not account for this path, and Section 6.1 only enumerates Temporal operation errors. Under the current code, a phase detection failure on Branch B will post a plain message but add no reaction. The FSPEC does not say whether this path should receive a ❌ reaction and an error reply, or be treated as an out-of-scope guard (like empty-slug and no-agent-mention).

**Recommendation:** Explicitly classify the phase detection failure path in Section 2.2 Out of Scope (if treated as a pre-routing guard with no acknowledgement) or add it to Section 6.1 (if it should emit a ❌ reaction). Either decision is defensible; the omission is not.

---

### F-04 — Medium: Branch A non-routing paths not addressed in scope

**Section ref:** Section 2.2 Out of Scope, Section 3

**Issue:** When `queryWorkflowState()` returns a running workflow, `handleMessage` enters Branch A. Branch A has multiple sub-paths: (a) ad-hoc directive detected → `handleAdHocDirective()`; (b) `phaseStatus === "waiting-for-user"` → `routeUserAnswer()`; (c) `phaseStatus === "failed"` or `"revision-bound-reached"` → intent routing (`retry`/`cancel`/`resume`); (d) any other `phaseStatus` → silent drop. The FSPEC Section 3.2 lists `retry-or-cancel` and `resume-or-cancel` signals as out of scope, and the ad-hoc directive path is not mentioned. For path (d), a silent drop with no acknowledgement is reasonable but not stated. An implementer integrating the acknowledgement feature into Branch A needs to know: does the ad-hoc directive path get any acknowledgement changes? Does the "workflow running but not waiting for user" silent drop path get a reaction? Without explicit out-of-scope statements for these paths, an implementer may inadvertently add reactions to paths the PM did not intend.

**Recommendation:** Extend Section 2.2 Out of Scope with two explicit entries: (1) "Ad-hoc directive path — no new acknowledgement behaviour; existing `postPlainMessage` ack is unchanged"; (2) "Workflow running but not waiting for user input — silent drop; no acknowledgement added." This closes the ambiguity without requiring behavioral changes.

---

### F-05 — Low: AT-MA-03 "empty for this invocation" is not self-contained

**Section ref:** Section 8, AT-MA-03

**Issue:** AT-MA-03 specifies `FakeDiscordClient.replyToMessageCalls` is "empty for this invocation". If the `FakeDiscordClient` is a shared instance across test cases (as is typical with `beforeEach` reset), this assertion works. But if the fake accumulates calls across multiple `handleMessage` invocations in a single test (e.g. a test that makes two sequential calls to verify no double-acknowledgement), the phrase "for this invocation" is ambiguous — it is not expressed as a filter on the call log but as an emptiness check. The acceptance test as written cannot distinguish "no reply posted in this invocation" from "no reply posted in any prior invocation in this test."

**Recommendation:** Rewrite the Then clause as: "`FakeDiscordClient.replyToMessageCalls.filter(c => c.messageId === message.id)` is empty." This makes the assertion self-contained and per-message, eliminating dependency on call-log isolation.

---

### F-06 — Low: Workflow ID format cross-document inconsistency

**Section ref:** FSPEC-MA-02 (`workflowId value` row), REQ-MA-02 acceptance criteria

**Issue:** FSPEC-MA-02 states the workflowId follows `ptah-{slug}` format, which is correct and verified against `temporal-orchestrator.ts` line 283 and `client.ts` line 81. However, REQ-MA-02's acceptance criteria still reads `ptah-feature-{slug}-{n}` (the stale format from before the REQ-v1 SE review). The FSPEC is correct; the REQ AC is stale. Test authors reading the REQ to derive test fixtures will use the wrong workflow ID format.

**Recommendation:** Update REQ-MA-02 acceptance criteria to use `ptah-{slug}` format, matching the FSPEC and the implementation. This was flagged as F1 in the REQ v1 SE review and resolved in the REQ v2 review, but the residual inconsistency suggests the fix was not fully propagated to the REQ AC column.

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Should `WorkflowExecutionAlreadyStartedError` be treated as a success (workflow is running — ✅) or a failure (start intent was rejected — ❌)? The existing `postPlainMessage("Workflow already running for {slug}")` call suggests it is a distinct case, not a generic error. |
| Q-02 | The FSPEC changelog notes "REQ-NF-17-01 allows concurrent acknowledgement calls" — does this mean `addReaction` and `replyToMessage` may be issued with `Promise.all`? Section 3.1/3.3 flow diagrams show sequential calls but do not prohibit concurrency. Confirming intent would prevent implementer guessing. |

---

## Positive Observations

- The explicit exclusion of `query workflows` as a valid operation label (Section 2.2 item 1, BR-04, FSPEC-MA-05) is correct and directly addresses the REQ v2 SE findings F1+F2. The precision here is good — it names the non-existent code path explicitly rather than just omitting it.
- Sections 6.2 and 6.3 (partial success scenarios) are thorough and directly implementable. Having a table for "addReaction succeeds, replyToMessage fails" and "both fail" eliminates guessing.
- The acknowledgement failure pseudo-code in Section 3.4 is the right level of specificity — it shows the exact catch/log/continue pattern and handles both `Error` and non-`Error` thrown values. An implementer can translate this directly to TypeScript without any further guidance.
- FSPEC-MA-05 truncation boundary cases (200 chars not truncated, 201 chars truncated to 200, character boundary not byte boundary) are unambiguous and map directly to AT-MA-08/AT-MA-09.
- BR-09 (workflowId must be the exact string returned by `startFeatureWorkflow()`) closes an important correctness hole — it prevents implementations that reconstruct the workflow ID from the slug instead of using the returned value.

---

## Recommendation

**Need Attention**

Two High findings must be resolved before implementation begins. F-01 (acknowledgement insertion point misspecified) will cause a correctness bug — a false ✅ can fire if the implementer follows the flow diagrams literally on the `handleMessage` level. F-02 (`WorkflowExecutionAlreadyStartedError` unspecified) leaves an in-scope code path with undefined acknowledgement behaviour. Both require PM clarification and FSPEC revision before the TSPEC can be authored.

The two Medium findings (F-03, F-04) are lower urgency but will produce scope creep or missed coverage during test authoring if left unaddressed. Recommend resolving all four before TSPEC.
