# Cross-Review: Backend Engineer — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Document reviewed** | [013-PROPERTIES-pdlc-auto-init](013-PROPERTIES-pdlc-auto-init.md) v1.1 |
| **Reviewer** | Backend Engineer |
| **Date** | 2026-03-16 |
| **Recommendation** | **Approved** |

---

## 0. Prior Review Resolution (v1.0 → v1.1)

All five items raised in the v1.0 cross-review were addressed:

| Prior Item | Resolution | Status |
|------------|-----------|--------|
| F-01 — Latency scope (real I/O vs fake) | PROP-NF-02 scoped to orchestration overhead (≤5ms, FakeStateStore); REQ-NF-01 marked Partial with cross-reference to Feature 011 benchmarks; threshold reduced 100ms → 5ms | ✅ Resolved |
| F-02 — Missing `[backend-only]` property | PROP-DC-10 added; covers the explicit keyword-recognition branch distinct from the default path | ✅ Resolved |
| F-03 — PROP-PI-08 under-specified | Property now includes parenthetical specifying both required assertions: no exception propagation AND `FakePdlcDispatcher.decideCalls.length === 1` | ✅ Resolved |
| Q-01 — "concurrent" vs "sequential" | PROP-PI-21 now reads "sequential invocations" with Node.js single-thread rationale in parenthetical | ✅ Resolved |
| Q-02 — CI gate for PROP-NF-02 | §7 Gap 5 now includes explicit CI gate guidance recommending a scheduled weekly CI job | ✅ Resolved |

---

## 1. Findings

### F-01 — Low: DC domain properties are scattered across sections, creating navigation friction

**Issue:** The `DC` domain (Discipline Configuration) is introduced in §3.1 Functional, but `DC`-prefixed property IDs appear across four different sections:

| Section | DC Properties |
|---------|---------------|
| §3.1 Functional | PROP-DC-01 through DC-05, DC-10 |
| §3.3 Error Handling | PROP-DC-06 |
| §3.4 Data Integrity | PROP-DC-07, DC-08 |
| §3.7 Idempotency | PROP-DC-09 |

A test author implementing `parseKeywords` would need to scan the entire document to find all DC properties rather than consulting a single section. This contrasts with the `PI`, `BC`, and `NF` domains where properties are more naturally grouped (domain-to-section alignment isn't perfect but is less fragmented).

**Impact:** Navigation friction during PLAN task E and F implementation. No correctness risk — all properties are well-specified.

**Recommendation:** No document restructuring required. Adding a navigational cross-reference to the §3.1 DC section note — e.g., *"See also PROP-DC-06 (§3.3), PROP-DC-07/DC-08 (§3.4), PROP-DC-09 (§3.7) for `parseKeywords` error, data integrity, and idempotency properties"* — would allow test authors to locate all DC properties without a full document scan.

---

### F-02 — Low: No positive property for the "already-managed → managed PDLC path" routing branch

**Issue:** PROP-PI-N01 covers the negative: `executeRoutingLoop` must NOT call `initializeFeature()` when `isManaged()` returns true. However, there is no corresponding positive property stating that when `isManaged()` returns true the routing loop MUST proceed to the managed PDLC path.

This matters because PROP-PI-N01 alone permits a conforming implementation that skips `initializeFeature()` but then falls through to the legacy path (or halts) instead of the managed path — and that regression would not be caught.

**Mitigating factors:**
- Feature 011's properties likely cover the already-managed routing branch since that was its core deliverable. Feature 013 is explicitly scoped to the *new feature / unmanaged* code path.
- PROP-PI-02 covers managed routing after successful auto-init, which is structurally adjacent.

**Recommendation:** Before closing this review, confirm whether Feature 011's properties include a positive property for "managed feature → managed PDLC dispatch." If yes, explicitly note in §1.1 that the already-managed positive routing assertion is owned by PROPERTIES-011 to prevent test authors from wondering if it was missed. If no such property exists, add a minimal property here or in PROPERTIES-011 as a regression guard.

---

## 2. Clarification Questions

None. All open questions from v1.0 were resolved and no new questions arise from the v1.1 changes.

---

## 3. Positive Observations

1. **Precise PROP-PI-08 strengthening.** The v1.1 parenthetical — `FakePdlcDispatcher.decideCalls.length === 1` — makes the recovery assertion unambiguous and matches the fake design in the PLAN. This is exactly the right level of specificity for a properties document used directly by test authors.

2. **PROP-PI-21 rationale is well-executed.** The addition of the Node.js single-thread explanation eliminates the risk of a test author implementing a `Promise.all` harness when sequential invocations are functionally identical. The parenthetical approach keeps the property readable while preserving the full rationale.

3. **Scoped PROP-NF-02 is correctly bounded.** Reducing the threshold to 5ms with `FakeStateStore` makes the property reliably falsifiable at the unit/integration level. The explicit cross-reference to Feature 011's `FileStateStore` benchmarks ensures REQ-NF-01's I/O budget is not orphaned.

4. **PROP-DC-10 distinguishes a real code path.** The added property is not just a restatement of PROP-DC-01 — the rationale note ("PROP-DC-01 cannot catch a regression where `[backend-only]` is silently treated as an unknown token") correctly explains why the two properties cover different failure modes. This is the right justification standard for a near-duplicate property.

5. **§7 CI gate guidance is actionable.** "Scheduled weekly CI job as a minimum gate" is a concrete recommendation that can be directly translated into a GitHub Actions cron schedule — it avoids the vagueness of "run periodically."

6. **Coverage matrix consistency.** Counts in §2 (16 Functional, 44 Total), §5.3 (P0=7, P1=6), and §6 (Unit=39, Integration=5) are all mutually consistent after the v1.1 updates. The §5.3 note explaining the P1 partial coverage for REQ-NF-01 is the right way to handle the split measurement.

---

## 4. Summary

v1.1 fully resolves all blocking and recommended changes from the v1.0 review. The two new findings (F-01, F-02) are Low severity — one is a navigation improvement, and one is a clarification request that may require no change if Feature 011 already covers the positive routing assertion.

The document is thorough, all 13 requirements have full or explicitly-noted partial coverage, all critical failure modes have both positive and negative properties, and the test level distribution (88.6% unit, 11.4% integration, 0% E2E) is well-justified.

**Recommendation: Approved.** F-01 and F-02 are optional improvements that do not block implementation start. The PLAN team may proceed with Phase A.
