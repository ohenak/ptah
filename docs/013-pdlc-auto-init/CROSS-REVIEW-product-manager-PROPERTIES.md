# Cross-Review: Product Manager — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Document reviewed** | [013-PROPERTIES-pdlc-auto-init](013-PROPERTIES-pdlc-auto-init.md) v1.0 |
| **Reviewer** | Product Manager |
| **Date** | 2026-03-15 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Findings

### F-01 — Medium: §5.3 Coverage by Priority table has inverted P0/P1 counts

**Location:** §5.3 Coverage by Priority table.

**Issue:** The table shows 6 P0 requirements and 7 P1 requirements. The REQ document (v1.2, Approved) defines the opposite split:

| Priority | Correct count | Requirements |
|----------|--------------|--------------|
| P0 | **7** | REQ-PI-01, REQ-PI-02, REQ-PI-03, REQ-PI-05, REQ-BC-01, REQ-NF-02, REQ-NF-03 |
| P1 | **6** | REQ-PI-04, REQ-BC-02, REQ-DC-01, REQ-DC-02, REQ-DC-03, REQ-NF-01 |

The table as written understates P0 coverage by one and overstates P1 coverage by one. This is a data accuracy issue — stakeholders using the coverage table to assess release readiness may draw the wrong conclusions about how much of the critical path is verified. The P0/P1 split is the primary axis on which "blocking for release" decisions are made.

**Required fix:** Update §5.3 to show P0 = 7 and P1 = 6.

---

### F-02 — Low: REQ-DC-01 coverage is incomplete — no property for explicit `[backend-only]` keyword recognition

**Location:** §3.1 Functional Properties; §5.1 Requirement Coverage row for REQ-DC-01.

**Issue:** REQ-DC-01 and FSPEC-DC-01 both explicitly list `[backend-only]` as a recognized discipline keyword alongside `[fullstack]` and `[frontend-only]`. PROP-DC-02 covers `[fullstack]` and PROP-DC-03 covers `[frontend-only]`, but no property covers the explicit `[backend-only]` token.

PROP-DC-01 tests the *no-keyword* default path — the two behaviors have the same outcome (`discipline: "backend-only"`) but exercise different code paths:
- **PROP-DC-01:** no recognized token found → apply default
- **Missing PROP:** `[backend-only]` recognized → set discipline from keyword

If the implementation incorrectly treats `[backend-only]` as an unknown token (silently ignored per FSPEC-DC-01 BR-DC-05), PROP-DC-01 cannot catch the regression because PROP-DC-01 does not enter the keyword-recognition branch. The §5.1 claim of "Full" coverage for REQ-DC-01 is therefore inaccurate as written.

This is a product-level concern: FSPEC-DC-01 BR-DC-01 defines exact, case-sensitive keyword matching — recognizing the explicit keyword is what confirms the implementation follows the keyword-recognition path rather than the default-application path.

**Suggested addition:**

```
| PROP-DC-10 | `parseKeywords` must set `discipline: "backend-only"` when the message contains the exact token `[backend-only]` — the keyword must be explicitly recognized (distinct from the default path where no keyword is present) | [REQ-DC-01], [FSPEC-DC-01] | Unit | P1 |
```

---

### F-03 — Low: PROP-PI-08 does not enumerate observable assertions — product intent on "routing continues" may be under-specified

**Location:** §3.3 Error Handling Properties, PROP-PI-08.

**Issue:** PROP-PI-08 states the logger error is swallowed and routing proceeds to the managed path "normally." REQ-PI-03's acceptance criteria specifies two outcomes: "(1) the error is swallowed; (2) the feature remains initialized and routing continues uninterrupted." The property captures only (1) — the swallow — but does not make (2) independently assertable.

A minimally conforming test could assert "no exception propagates from `executeRoutingLoop()`" and satisfy PROP-PI-08 as written, while missing the critical follow-on routing behavior. If the managed path is never invoked after the logger error is caught, the feature is silently dead-ended — the kind of failure that would produce no exception but would cause the PM agent's LGTM to be dropped with no PDLC reviews dispatched.

From a product perspective, the recovery behavior (routing continues) is at least as important as the fault-tolerance behavior (no exception), because a dropped routing signal means the entire PDLC review chain never fires.

**Recommendation:** Clarify PROP-PI-08 with explicit observable assertions in line with the BE's F-03 suggestion: *(verifiable by (1) asserting no exception propagates, and (2) asserting the managed PDLC path IS invoked — e.g., `FakePdlcDispatcher.decideCalls.length === 1`)*. This ensures tests validate the recovery, not just the fault tolerance.

---

## 2. Clarification Questions

### Q-01: Latency benchmark scope — does PROP-NF-02 satisfy REQ-NF-01 as written?

This is a product question that builds on BE F-01. REQ-NF-01 states: *"The `initializeFeature()` call involves one state file write (atomic), which is already benchmarked in Feature 011 tests."* The REQ's own rationale ties the 100ms budget to the I/O operation, not orchestration overhead.

If PROP-NF-02 is measured with `FakeStateStore` (as PLAN F-2 specifies), no I/O actually occurs and the benchmark will trivially pass regardless of filesystem behavior. This means the PROPERTIES document marks REQ-NF-01 as "Full" coverage when the test cannot actually falsify the requirement's I/O concern.

From a product perspective, marking a requirement as "fully covered" when the test design cannot detect violations of the core constraint is misleading in the coverage matrix. The BE document raised this as F-01. I'm flagging it here as a product accuracy concern — the §5.1 coverage row for REQ-NF-01 should either note the measurement scope limitation, or the test should be updated to use a real `FileStateStore` in a temp directory (as BE Option A recommends).

---

## 3. Positive Observations

1. **All 13 requirements are mapped by name to specific property IDs in §5.1.** The requirement coverage table is the most directly useful artifact in this document for a product review — it makes it immediately verifiable that no requirement was left to engineering discretion.

2. **Negative properties in §4 comprehensively mirror the positive properties.** PROP-PI-N02 and PROP-PI-N03 together rule out "fail-partially" regressions (managed path invoked without legacy, or legacy path invoked without managed, when `initializeFeature()` throws). These are exactly the failure modes that would silently corrupt the PDLC state without raising an exception, and they are tested at the right level.

3. **Exact log format strings in §3.8 observability properties match the REQ/FSPEC specifications precisely.** PROP-PI-15, PROP-PI-17, PROP-BC-09, and PROP-PI-18 quote the exact format strings from REQ-PI-03, REQ-PI-04, REQ-BC-02, and FSPEC-PI-01 respectively. This prevents silent format drift and ensures test assertions are unambiguous.

4. **Age guard properties (§3.1) correctly capture the `<routing>`-tag discriminator.** PROP-BC-05 and PROP-BC-07 isolate the subtle edge: bot messages without a `<routing>` tag (orchestrator progress embeds, completion embeds, debug notifications) are excluded from the count. Many test suites would miss this and only test the `isBot` flag, allowing false-positive non-eligibility regressions.

5. **Idempotency properties (§3.7) are decomposed into four independently falsifiable behaviors.** Separating PROP-PI-11 (return value unchanged), PROP-PI-12 (no throw), PROP-PI-13 (saveCount === 1), and PROP-PI-14 (config not overwritten) maps each to a distinct implementation failure mode. This is the correct level of granularity for a check-before-write guard.

6. **§7 Gaps and Recommendations is proactive and action-oriented.** All five gap entries link to specific property IDs and specific PLAN tasks, and four of five include a concrete resolution recommendation. This is well above the typical quality of test strategy gap sections.

---

## 4. Summary

The PROPERTIES document accurately reflects the approved requirements and FSPECs. No product decisions are being made by the test engineer that should have been resolved in REQ or FSPEC. No scope creep is evident.

**Required before approval:**
- **F-01** — Fix §5.3 priority counts (P0 = 7, P1 = 6). The inverted counts misrepresent the release-critical surface area.

**Recommended improvements:**
- **F-02** — Add `PROP-DC-10` for explicit `[backend-only]` keyword recognition to close the gap in REQ-DC-01 coverage.
- **F-03** — Strengthen PROP-PI-08 with explicit observable assertions (no exception + managed path IS invoked) to prevent under-specified test implementations.
- **Q-01** — Clarify REQ-NF-01 coverage scope in §5.1 or update the benchmark to use real I/O, so the "Full" coverage claim is accurate.

**Recommendation: Approved with minor changes** (F-01 is the only blocker; F-02, F-03, and Q-01 are low-risk improvements).
