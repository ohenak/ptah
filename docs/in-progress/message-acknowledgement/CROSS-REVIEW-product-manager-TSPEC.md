# Cross-Review: Product Manager — TSPEC-message-acknowledgement

**Reviewer Role:** Product Manager
**Document Reviewed:** TSPEC-message-acknowledgement.md
**Review Date:** 2026-04-21
**Recommendation:** Approved with Minor Issues

---

## Summary

The TSPEC faithfully covers all 9 requirements (REQ-MA-01 through REQ-MA-06, REQ-NF-17-01 through REQ-NF-17-03) with a complete traceability table and a test catalogue that maps 1:1 to every FSPEC v1.1 acceptance test. Scope is fully respected: all out-of-scope paths from the REQ and FSPEC are explicitly preserved unchanged, and no new product behavior is introduced. Two low-severity findings are noted: one field-name inconsistency between the TSPEC and FSPEC test assertions that could produce a test bug, and a P1 latency requirement that is acknowledged but given no operational guidance.

---

## Findings

### Finding 1: AT-MA-03 filter field name inconsistency (TSPEC vs. FSPEC)

- **Severity:** Low
- **Location:** TSPEC Section 7.4, AT-MA-03 ("Then" clause); FSPEC Section 8 AT-MA-03 ("Then" clause)
- **Issue:** The TSPEC AT-MA-03 assertion reads `postPlainMessageCalls.filter(c => c.threadId === message.threadId)` and adds a note that this field is `c.threadId` (not `c.channelId`). The FSPEC AT-MA-03 assertion reads `postPlainMessageCalls.filter(c => c.channelId === message.threadId)`. The two documents disagree on which field name to use for the `postPlainMessageCalls` filter. Only one of them can be correct at implementation time, and whichever is wrong will silently pass even when the assertion is doing nothing useful.
- **Recommendation:** Confirm the actual field name on `FakeDiscordClient.postPlainMessageCalls` entries (whether it is `threadId` or `channelId`) and align the TSPEC test catalogue to use the same field name as the FSPEC. If the TSPEC is correct that the field is `threadId`, raise a correction against the FSPEC before implementation begins.

---

### Finding 2: REQ-NF-17-02 latency requirement has no implementation path

- **Severity:** Low
- **Location:** TSPEC Section 8 (Requirements Traceability), REQ-NF-17-02
- **Issue:** REQ-NF-17-02 (P1) requires that the emoji reaction appears within 5 seconds of the Temporal operation resolving under normal network conditions. The REQ success metrics table specifies this as a measurable target (baseline: no reaction; target: reaction present within 5s, 100%). The TSPEC traceability entry for REQ-NF-17-02 states "No implementation requirement — latency is an operational concern" with no further guidance. The requirement is P1 and has a defined success metric; dismissing it entirely with no measurement approach, logging hook, or manual test guidance leaves the acceptance criterion unverifiable at the product level.
- **Recommendation:** Add at minimum a brief note in the TSPEC on how REQ-NF-17-02 will be validated — for example, confirming the manual test procedure from the REQ success metrics table (post a message, observe reaction timing). If latency monitoring is genuinely not part of the implementation, say so explicitly and confirm the PM accepts this as manual-only validation.

---

## Recommendation

**Approved with Minor Issues**

Both findings are Low severity. Neither blocks implementation. Finding 1 is the higher-priority fix because an incorrect field name in a test assertion could silently produce a passing test that asserts nothing. Finding 2 is informational and can be resolved with a one-line addition to the traceability table.
