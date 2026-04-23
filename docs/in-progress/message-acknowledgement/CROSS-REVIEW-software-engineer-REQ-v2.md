# Cross-Review: Software Engineer — REQ-message-acknowledgement (v2)

**Reviewer Role:** Senior Software Engineer
**Document Reviewed:** REQ-message-acknowledgement.md v1.1
**Review Date:** 2026-04-21
**Recommendation:** Approved with Minor Issues

---

## Summary

All five High/Medium findings from iteration 1 have been adequately addressed: the workflow ID format is corrected to `ptah-{slug}`, the Temporal query failure early-exit is explicitly scoped out in Section 3.2, `replyToMessage` is consistently specified throughout the document, REQ-MA-05 operation labels are scoped to the three in-scope Temporal operations, and REQ-NF-17-01 has been reworded as a clean call-ordering invariant. Two new low-severity issues were introduced by the edits: a residual internal inconsistency in REQ-MA-04's description that contradicts the scoping decision in Section 3.2, and a superfluous `query workflows` operation label in REQ-MA-05 that has no reachable code path after the scoping decision. Neither blocks implementation but both will cause implementer confusion.

---

## Prior Findings Resolution

| Prior ID | Severity | Status | Notes |
|----------|----------|--------|-------|
| F1 | High | Resolved | REQ-MA-02 AC and R-20-04 both corrected to `ptah-{slug}`; confirmed against `client.ts` line 81 |
| F2 | Medium | Resolved | Section 3.2 now explicitly names the query failure early-exit and explains the rationale |
| F3 | Medium | Resolved | `replyToMessage` consistently used in §3.1, A-16, A-17, REQ-MA-02, REQ-MA-05, REQ-MA-06 |
| F4 | Medium | Resolved | REQ-MA-05 enumerates exactly the three in-scope operations with `(see Section 3.2)` cross-reference |
| F5 | Medium | Resolved | REQ-NF-17-01 reworded as sequential call-ordering invariant with no latency contradiction |

---

## Findings

### Finding 1: REQ-MA-04 description still includes "workflow query fails" as an in-scope trigger, contradicting Section 3.2
- **Severity:** Low
- **Location:** REQ-MA-04 (Description column)
- **Issue:** The description for REQ-MA-04 reads "When `handleMessage()` encounters a Temporal failure (workflow query fails, workflow creation fails, or signal routing fails)". Section 3.2 explicitly scopes out the Temporal query failure path, stating that `queryWorkflowState()` throwing a non-`WorkflowNotFoundError` triggers a silent early-exit with no acknowledgement. REQ-MA-04's description therefore lists a trigger ("workflow query fails") that must never fire — the code path exits before reaching the acknowledgement logic. An implementer reading only REQ-MA-04 will believe ❌ should be added on query failures, directly contradicting Section 3.2 and the code path in `temporal-orchestrator.ts` lines 299–303.
- **Recommendation:** Remove "workflow query fails" from the REQ-MA-04 description. The corrected trigger enumeration is: "(workflow creation fails, or signal routing fails)". This aligns the description with Section 3.2 and the existing code path.

---

### Finding 2: REQ-MA-05 `query workflows` operation label has no reachable acknowledgement path
- **Severity:** Low
- **Location:** REQ-MA-05 (Description column, operation label enumeration)
- **Issue:** REQ-MA-05 enumerates `query workflows` as one of three valid `{operation}` labels, noting it applies to "workflow state query during Branch A/B detection". However, per Section 3.2, the query failure path performs a silent early-exit — it never reaches the acknowledgement code. The `query workflows` label therefore describes a `Failed to query workflows: ...` message that can never be produced by an implementation that also satisfies Section 3.2. This is a dead label that will confuse implementers and test authors (they may write a test path for `Failed to query workflows:` that can never be triggered without violating Section 3.2).
- **Recommendation:** Remove `query workflows` from the REQ-MA-05 operation label enumeration. The corrected enumeration is two values: `start workflow` and `route answer`. Update the description accordingly.

---

### Finding 3: REQ-NF-17-01 acceptance criteria over-specifies internal call ordering
- **Severity:** Low
- **Location:** REQ-NF-17-01 (Acceptance Criteria column)
- **Issue:** The AC specifies "`addReaction()` is called first, then `replyToMessage()` if applicable". This prescribes sequential internal ordering of two independent Discord API calls. It is not derived from any user-visible requirement — the user sees both within the 5-second window regardless of internal call order. Mandating sequential ordering prevents a valid `Promise.all([addReaction, replyToMessage])` implementation that would reduce total latency while still satisfying REQ-NF-17-02. The requirement as written would make a parallel implementation non-compliant.
- **Recommendation:** Relax the AC to: "Both `addReaction()` and `replyToMessage()` (if applicable) are called after the Temporal operation resolves, and neither is called before the other is attempted." This preserves the call-ordering invariant (Temporal before acknowledgement) while allowing either sequential or parallel implementation.

---

## Positive Observations

- The Section 3.2 scoping prose for the query failure path is precise and technically accurate — it correctly identifies the code path (`queryWorkflowState()` non-`WorkflowNotFoundError`), describes the existing behaviour, and gives a clear rationale for exclusion.
- REQ-MA-06 acceptance criteria is now the most precise in the document: it specifies `.message` property extraction and the `String(err)` fallback for non-Error thrown values, which directly maps to the standard TypeScript error-handling idiom in the existing codebase.
- REQ-NF-17-03 revision (application-layer at-most-once per invocation) correctly limits the invariant to what the application can guarantee without application-layer state, removing the reliance on Discord native deduplication for the core correctness claim.

---

## Recommendation

**Approved with Minor Issues**

The three Low findings should be addressed before FSPEC authoring to prevent implementer confusion, but none blocks the implementation. The most important fix is F1+F2 together: removing "workflow query fails" from REQ-MA-04 and removing `query workflows` from REQ-MA-05. These are a matched pair introduced by the v1.1 edit and will take a single sentence change each.
