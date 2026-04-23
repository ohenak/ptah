# Cross-Review: product-manager — PROPERTIES

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/message-acknowledgement/PROPERTIES-message-acknowledgement.md (v1.1)
**Date:** 2026-04-21
**Iteration:** 2

---

## Prior Findings Verification

| Prior ID | Severity | Status | Notes |
|----------|----------|--------|-------|
| PM-F01 | Medium | Resolved | REQ-MA-05 v1.2 removes `"query workflows"` from the operation label enumeration. Only `"start workflow"` and `"route answer"` are now listed. PROP-MA-29 and REQ-MA-05 are now fully consistent. |
| PM-F02 | Medium | Resolved | PROP-MA-33 added in PROPERTIES v1.1. It correctly asserts that on the failure path (❌), when `addReaction` throws, `replyToMessage` is still independently called with the `"Failed to start workflow: connection timeout"` content. G-05 in the gaps table is also updated to mark this resolved. |
| PM-F03 | Low | Resolved | Section 2 infrastructure table now lists `postPlainMessageCalls: { threadId, content }[]` as a named row for `FakeDiscordClient`. PROP-MA-04 and PROP-MA-28 can now be traced to the infrastructure reference without confusion. |
| PM-F04 | Low | Resolved | REQ-MA-05 row in Section 4 coverage matrix now explicitly lists `PROP-MA-12 (P-01 prereq)` alongside PROP-MA-11. Traceability gap is closed. |

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | PROPERTIES v1.1 header still references `[REQ-message-acknowledgement v1.1]` in the linked REQ field. REQ has since been updated to v1.2 (removing `"query workflows"` from REQ-MA-05). The linked REQ version in the PROPERTIES header is now stale and should be updated to v1.2 to keep the document chain traceable. | REQ-MA-05 |
| F-02 | Low | PROP-MA-33 is placed in Category J (Observability: WARN Log Format) in the document body even though it is logically an Error Handling property — which is Category E. The property's own metadata labels it `"Error Handling"`, but the section header says `"Category J — Observability: WARN Log Format"`. PROP-MA-33's description says it is "extending PROP-MA-15," which lives in Category E. The misplaced section placement is a documentation inconsistency that may confuse the implementer looking for all REQ-MA-06 properties in one place. | REQ-MA-06 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-MA-33 is placed under Category J (Observability) in the document section headers, but its own metadata field says `"Error Handling"` — matching Category E. Was this intentional (e.g., grouping by when the WARN log fires), or is it an oversight from appending the property at the end of the document? If oversight, should it be relocated into Category E alongside PROP-MA-14 through PROP-MA-18, or is the current placement acceptable for iteration 2? |

---

## Positive Observations

- All four prior PM findings are cleanly resolved. The PROPERTIES v1.1 change log accurately summarises each change and cites the finding that motivated it. No regressions were introduced.
- REQ-MA-05 v1.2 and PROP-MA-29 are now in full alignment. The traceability chain from requirement through FSPEC through PROPERTIES is consistent on the operation-label question.
- PROP-MA-33 is well-specified: the testable assertion is precise, the pass condition is unambiguous, and the source citations (REQ-MA-06, FSPEC-MA-06, FSPEC Section 6.2) are correct. The property closes the only untested gap in the P0 REQ-MA-06 contract.
- The coverage matrix REQ-MA-05 row now correctly includes PROP-MA-12 with its prerequisite flag. All nine requirements continue to have at least one property.
- The PREREQUISITES block and gap entries G-03 and G-06 remain accurate and actionable: P-01 is in PLAN, P-02 is flagged as a missing PLAN task. This honest documentation of implementation blockers is valuable.
- No new out-of-scope behaviors were introduced in v1.1. All 33 properties remain within the boundaries of REQ Section 3.2 and FSPEC Section 7.

---

## Recommendation

**Approved with Minor Issues**

> All prior High and Medium findings are resolved. The two remaining findings (F-01, F-02) are Low severity and do not block implementation. Specifically:
>
> - **F-01** — Update the PROPERTIES header `Linked REQ` field from `v1.1` to `v1.2` to match the current REQ version. This is a documentation housekeeping item.
> - **F-02** — PROP-MA-33 is categorised as `"Error Handling"` in its own metadata but sits under the Category J section heading. Consider relocating it into Category E or adding a cross-reference note in Category E. Either resolution is acceptable; the property itself is correct.
>
> Neither finding affects the behavioral correctness of the properties or the coverage of the requirements. Implementation may proceed against PROPERTIES v1.1 as written.
