# Cross-Review: software-engineer — FSPEC-message-acknowledgement

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/FSPEC-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 2

---

## Prior Findings Resolution

| Prior ID | Severity | Status | Notes |
|----------|----------|--------|-------|
| F-01 | High | Resolved | All three behavioral flow diagrams updated to show private method boundaries (`startNewWorkflow`, `handleStateDependentRouting`); Implementation Note added warning against `handleMessage()`-level acknowledgement and the false ✅ risk |
| F-02 | High | Resolved | `WorkflowExecutionAlreadyStartedError` explicitly classified as out of scope in Section 2.2 item 11, Section 6.1 table, Section 7 exclusions table, and FSPEC-MA-04 excluded triggers; existing `postPlainMessage` behavior unchanged |
| F-03 | Medium | Resolved | Phase detection failure (`phaseDetector.detect()` throws) classified as out of scope in Section 2.2 item 12, Section 6.1 table, Section 7 exclusions table |
| F-04 | Medium | Resolved | Ad-hoc directive path (Section 2.2 item 13) and "workflow running but not waiting for user" silent drop (Section 2.2 item 14) both added to out-of-scope; Section 7 exclusions updated to match |
| F-05 | Low | Resolved | AT-MA-03 Then clause rewritten using `filter(c => c.messageId === message.id)` — assertion is now per-message and self-contained |
| F-06 | Low | Resolved | REQ-MA-02 AC now reads `Workflow started: ptah-{slug}`; confirmed aligned with FSPEC-MA-02 and `client.ts` line 81 |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Low | `handleStateDependentRouting` signature in Implementation Note and flow diagrams does not match actual implementation | Section 1 Implementation Note; Sections 3.2 and 3.3 flow diagrams |
| F-02 | Low | Flow diagram labels `queryWorkflowState()` argument as `threadSlug` but the actual call uses `workflowId` | Sections 3.1, 3.2, 3.3 flow diagrams |

---

## Finding Detail

### F-01 — Low: `handleStateDependentRouting` signature misrepresented

**Section ref:** Section 1 Implementation Note; flow diagrams in Sections 3.2 and 3.3

**Issue:** The Implementation Note describes the private method as `handleStateDependentRouting(state, message)`. The flow diagrams in Sections 3.2 (line `└─ await handleStateDependentRouting(state, message)`) and 3.3 (`└─ [Branch B] await handleStateDependentRouting(state, message)`) repeat this signature. The actual implementation signature in `temporal-orchestrator.ts` line 485–489 is:

```ts
private async handleStateDependentRouting(
  message: ThreadMessage,
  workflowId: string,
  state: FeatureWorkflowState,
): Promise<void>
```

The actual signature has three parameters (`message`, `workflowId`, `state`) in a different order from the FSPEC description, and the `workflowId` parameter is omitted entirely from the FSPEC. An implementer editing the method to insert acknowledgement calls will find `message` as the first parameter, not the second, and will need `workflowId` to source the `channelId`/`messageId` — though they will correctly source those from `message.threadId` and `message.id` per the FSPEC's stated contract. The core guidance (insert acknowledgement inside `handleStateDependentRouting()` after `routeUserAnswer()` resolves) is correct and unaffected by the signature mismatch; the risk is confusion when an implementer compares the FSPEC to the actual method header.

**Recommendation:** Correct the Implementation Note and flow diagrams to reflect the actual signature: `handleStateDependentRouting(message, workflowId, state)`. Alternatively, omit the parameter list and reference only the method name, since the Implementation Note's guidance is about *where* to insert acknowledgement, not about parameter plumbing.

---

### F-02 — Low: Flow diagram uses `threadSlug` where implementation passes `workflowId`

**Section ref:** `queryWorkflowState(threadSlug)` in flow diagrams of Sections 3.1, 3.2, and 3.3

**Issue:** All three behavioral flow diagrams show `queryWorkflowState(threadSlug)` as the query call. The actual call site in `temporal-orchestrator.ts` line 290 is `this.temporalClient.queryWorkflowState(workflowId)` where `workflowId = ptah-${slug}` (line 283). The argument is the full workflow ID (`ptah-{slug}`) not the raw slug. This is a documentation inaccuracy: the FSPEC implies the query accepts a slug, but it accepts the prefixed workflow ID. An implementer writing integration tests or verifying fake setup against the flow diagram will encounter a discrepancy.

**Recommendation:** Update the flow diagram call to `queryWorkflowState(workflowId)` (or `queryWorkflowState("ptah-{slug}")`) in all three sections (3.1, 3.2, 3.3). This is a cosmetic correction with no behavioral impact.

---

## Questions

None. The v1.1 changes are technically sound and the changelog entry in Section 9 correctly confirms all prior open questions were resolved.

---

## Positive Observations

- The Implementation Note in Section 1 is well-placed and precise. The warning about false ✅ risk when inserting acknowledgement at the `handleMessage()` level (rather than inside the private methods) directly addresses F-01 from iteration 1. The explanation of *why* the insertion point matters (void return from private methods, internally swallowed errors) will prevent the correctness bug in practice.
- The explicit `WorkflowExecutionAlreadyStartedError` exclusion (Section 2.2 item 11, BR-11) is thorough — it appears in four separate locations (out-of-scope table, business rules, FSPEC-MA-04 excluded triggers, Section 6.1 error table). No implementer can misread this as in-scope.
- BR-10 (`channelId` sourced from `message.threadId`, not `message.parentChannelId`) is a clean addition that anchors the TE finding F-05 from iteration 1. Appearing as a business rule makes it enforceable in code review.
- AT-MA-16 (dual acknowledgement failure) closes the TE-identified gap in Section 6.3 coverage. The Given/Then structure matches the existing `FakeDiscordClient.addReactionError`/`replyToMessageError` injection pattern and is implementable without new fake infrastructure.
- AT-MA-13's replacement of the cross-fake sequence-counter approach with a deferred-promise ordering verification is the right call. The approach (check call counts at suspension point before resolve, then after) is testable with the existing fakes and does not require shared global state between `FakeTemporalClient` and `FakeDiscordClient`.
- FSPEC-MA-05 truncation boundary specification (200-character limit applies to `{error message}` portion, not the full reply string; character boundary not byte boundary) is unambiguous and maps directly to AT-MA-08/AT-MA-09. The clarification that the prefix is excluded from the 200-character count eliminates the ambiguity flagged in TE-F06 from iteration 1.

---

## Recommendation

**Approved with Minor Issues**

Both findings are Low severity: cosmetic signature and argument-label inaccuracies in the flow diagrams that do not affect behavioral correctness, insertion-point guidance, or testability. The core contract (which private methods receive acknowledgement logic, which error paths are in scope, exact message formats, error handling pattern, and acceptance tests) is complete and implementable. The two Low findings can be corrected in a minor editorial pass before TSPEC authoring; neither blocks TSPEC or implementation.
