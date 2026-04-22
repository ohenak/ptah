# Cross-Review: product-manager — PROPERTIES

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/message-acknowledgement/PROPERTIES-message-acknowledgement.md
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Medium | REQ-MA-05 v1.1 still lists `"query workflows"` as a valid `{operation}` label ("The `{operation}` labels the three in-scope Temporal operations that can throw: `query workflows`…"). PROP-MA-29 (negative) correctly asserts that `"Failed to query workflows:"` must never appear in any reply — aligning with FSPEC v1.1 — but this creates a direct contradiction with the literal REQ-MA-05 text. The PROPERTIES document covers the right behavior, but the requirement it references is internally inconsistent. The REQ must be updated to remove `"query workflows"` from REQ-MA-05's description so the traceability chain is clean. | REQ-MA-05, FSPEC Section 2.2 item 1, PROP-MA-29 |
| F-02 | Medium | G-05 (self-identified gap) documents that no property asserts `replyToMessage` is still called when `addReaction` fails on the **failure path** (❌ path). PROP-MA-15 covers this independence only for the success path (workflow-start). REQ-MA-06 requires each acknowledgement call to be independently wrapped on all paths. Without a property guarding the ❌ path, an implementation that suppresses `replyToMessage` after a failed `addReaction` on the failure path would pass all existing properties. This is an untested gap for a P0 requirement. | REQ-MA-06, FSPEC-MA-06, FSPEC Section 6.2 |
| F-03 | Low | PROP-MA-03 and PROP-MA-16 reference `replyToMessage` as the Discord API call, correctly aligned with REQ v1.1. However, PROP-MA-03's testable assertion checks `FakeDiscordClient.replyToMessageCalls` for the workflow-started reply, while PROP-MA-04 (negative) also checks `postPlainMessageCalls` are empty on the signal-routed path. The test infrastructure section (Section 2) lists `replyToMessageCalls` but does not list `postPlainMessageCalls` in the key-state table for `FakeDiscordClient` — yet multiple properties rely on inspecting it. This omission in the infrastructure reference table is a documentation gap that may cause implementer confusion. | REQ-MA-02, REQ-MA-03, FSPEC-MA-02, FSPEC-MA-03 |
| F-04 | Low | PROP-MA-12 tests a non-Error object (`{ code: 503 }`) and expects `"[object Object]"` via `String(err)`. REQ-MA-05 and REQ-MA-06 specify `String(err)` as the fallback for non-Error thrown values — a correct and necessary behavior. However, the PROPERTIES coverage matrix (Section 4) does not include PROP-MA-12 explicitly in the REQ-MA-05 row. The coverage table lists PROP-MA-11 (non-Error string) but omits PROP-MA-12 (non-Error object) from the REQ-MA-05 coverage row. This creates a traceability gap in the matrix even though the property itself exists. | REQ-MA-05 |
| F-05 | Low | REQ-NF-17-02 (acknowledgement latency under 5 seconds) is explicitly not covered by any automated property. The PROPERTIES document acknowledges this (G-04) and defers to manual verification in PLAN TASK-04. This is an accepted gap, but from a product acceptance standpoint, there is no formal property capturing the 5-second success metric from Section 4 of the REQ. This is product-approved as long as the PLAN manual step is treated as a mandatory acceptance gate, not optional. | REQ-NF-17-02 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-MA-05 v1.1 still contains `"query workflows"` as a named operation label in the requirement description. The FSPEC v1.1 and PROPERTIES both correctly exclude it. Will REQ-MA-05 be updated to remove `"query workflows"` from the valid operation label list before implementation begins, or is this discrepancy intentionally deferred? |
| Q-02 | G-05 proposes adding a supplementary property for the `addReaction`-fails-during-failure-path scenario. Will the TE author add this as PROP-MA-33 in a PROPERTIES v1.1, or is this addressed in the test implementation directly without a formal property? Given that REQ-MA-06 is P0, the former is preferred. |
| Q-03 | The test infrastructure table in Section 2 lists `replyToMessageCalls` as a key state for `FakeDiscordClient` but omits `postPlainMessageCalls`. PROP-MA-04 and PROP-MA-28 both rely on `postPlainMessageCalls`. Should `postPlainMessageCalls` be added to the infrastructure reference table? |

---

## Positive Observations

- All 9 requirements (REQ-MA-01 through REQ-MA-06 and REQ-NF-17-01 through REQ-NF-17-03) map to at least one property. Requirements traceability is complete.
- The 32 properties comprehensively span 10 behavioral categories — functional success paths, failure paths, data integrity (truncation boundary cases), error handling independence, ordering, idempotency, contract validation, regression guards, and observability. This is thorough coverage for a P0 feature.
- PROP-MA-29 correctly scopes out `"Failed to query workflows:"` as an invalid operation label, aligning with FSPEC v1.1 even though REQ-MA-05 text still mentions `"query workflows"`. The PROPERTIES has the right product intent here.
- The self-identified gaps table (Section 5) is honest and actionable. G-01 through G-05 demonstrate good test engineering judgment, and G-05's recommended remediation (PROP-MA-33 for the failure-path reply-independence case) is the right call.
- Negative and regression properties (PROP-MA-27 through PROP-MA-30) explicitly guard out-of-scope paths — preventing scope creep from appearing silently in the implementation. This is well-aligned with product intent.
- REQ-NF-17-02 (latency) is honestly marked as manual-verification-only with a clear citation of where the manual gate lives (PLAN TASK-04 step 6). The gap is acknowledged, not hidden.
- No properties introduce out-of-scope behaviors. The boundaries match Section 3.2 of the REQ and the exclusions in FSPEC Section 7.

---

## Recommendation

**Need Attention**

> Two Medium findings require resolution before implementation proceeds:
>
> 1. **F-01** — REQ-MA-05 must be updated to remove `"query workflows"` from the valid operation label list. The PROPERTIES correctly captures the right behavior (PROP-MA-29), but the contradiction in the REQ text creates a traceability defect that must be closed.
>
> 2. **F-02** — PROP-MA-15's call-independence coverage must be extended to the failure path (❌ path). Add a property (e.g. PROP-MA-33) asserting that when `addReaction` throws during the failure path, `replyToMessage` is still called with the `"Failed to {operation}: ..."` content. This closes the only untested gap in the P0 REQ-MA-06 contract.
>
> Low findings (F-03, F-04, F-05) may be resolved in a PROPERTIES v1.1 update or during implementation without blocking progress.
