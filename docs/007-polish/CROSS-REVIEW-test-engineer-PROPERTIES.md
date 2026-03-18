# Cross-Review: Test Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.1 |
| **Prior Review** | `CROSS-REVIEW-test-engineer-PROPERTIES.md` v1.2 — "Needs revision" (F-01, F-02 Medium; F-03..F-08 Low) |
| **Review Version** | v1.3 (re-review of v1.1 revision) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Status Update from v1.2

All two Medium findings and all six Low findings from the v1.2 review have been addressed in the v1.1 revision. One new Low finding is identified below.

| Prior Finding | Prior Severity | Resolution in v1.1 |
|---|---|---|
| F-01 — Property count discrepancy (§2 / §6) | Medium | **RESOLVED** — §2 Functional=33, Integration=4, Total=71; §6 Unit=67, Integration=4, Total=71 ✓ |
| F-02 — Missing PROP-EX-21 (hot-reload integration) | Medium | **RESOLVED** — PROP-EX-21 added to §3.5; §2 Integration (3→4); §5.1 and §5.2 updated ✓ |
| F-03 — Section numbering gap (§3.6 missing) | Low | **RESOLVED** — §3.6 Performance Properties placeholder added with rationale ✓ |
| F-04 — Redundant PROP-EX-12..19 sub-range in §5.1/§5.2 | Low | **RESOLVED** — REQ-NF-08 row now reads `PROP-EX-01..17, PROP-EX-19..21`; FSPEC-EX-01 row is clean ✓ |
| F-05 — PROP-EX-17 ambiguous (throw vs silent drop) | Low | **RESOLVED** — rewritten to specify "silently dropped by the schema parser, not thrown as errors" ✓ |
| F-06 — PROP-EX-18 mis-traced to REQ-NF-08 | Low | **RESOLVED** — source changed to `[TSPEC §5.2], [TSPEC §5.3]` with explanatory note; PROP-EX-18 absent from REQ-NF-08 row in §5.1 ✓ |
| F-07 — Gap #1 not elevated to named negative property | Low | **RESOLVED** — PROP-DI-N05 added to §4; Gap #1 marked "RESOLVED" in §7 ✓ |
| F-08 — PROP-RP-08 / PROP-RP-N01 near-duplicates | Low | **RESOLVED** — scope differentiated: PROP-RP-08 asserts function return value; PROP-RP-N01 asserts final Discord embed fields via `FakeDiscordClient.capturedEmbeds`; scopes are now distinct ✓ |

---

## Findings

### F-01 — Low | §5.1 REQ-NF-08 Row Missing PROP-EX-N01 and PROP-EX-N02

**Location:** §5.1 Requirement Coverage, REQ-NF-08 row.

**Issue:** PROP-EX-N01 and PROP-EX-N02 (§4 Negative Properties) both explicitly trace to `[REQ-NF-08]` in their Source columns, but they are absent from the REQ-NF-08 row in the §5.1 coverage matrix. By contrast, every other REQ row that has corresponding negative properties includes them:

| REQ Row | Negative Props Included? |
|---|---|
| REQ-DI-06 | ✓ PROP-DI-N01, PROP-DI-N02 listed |
| REQ-DI-10 | ✓ PROP-DI-N03, PROP-DI-N04, PROP-DI-N05 listed |
| REQ-RP-06 | ✓ PROP-RP-N01 listed |
| REQ-NF-09 | ✓ PROP-LG-N01, PROP-LG-N02 listed |
| **REQ-NF-08** | ✗ PROP-EX-N01, PROP-EX-N02 **absent** |

This is a matrix inconsistency, not a coverage gap — the properties exist and are well-formed. However, the §5.1 "Full" coverage claim for REQ-NF-08 is not quite accurate without including the negative properties that trace back to it.

Note: §5.2 FSPEC-EX-01 row correctly lists `PROP-EX-N01, PROP-EX-N02` — the gap is only in §5.1.

**Required action (Low — editorial):** Append `, PROP-EX-N01, PROP-EX-N02` to the REQ-NF-08 row in §5.1. No count, pyramid, or property changes required.

---

## Clarification Questions

None. All prior questions (Q-01, Q-02) have been resolved through the document revisions.

---

## Positive Observations

- **All Medium findings resolved cleanly and completely.** PROP-EX-21 is correctly placed in §3.5 with Integration test level, correct source tracing ([REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]), and all count/matrix updates are accurate.

- **Property counts are now verified correct.** §2 Functional=33, Integration=4, Total=71; §6 Unit=67, Integration=4, Total=71 all reconcile cleanly against a manual enumeration of §3 and §4 entries.

- **PROP-EX-17 and PROP-EX-18 disambiguation is well-executed.** The parenthetical note on PROP-EX-18 — `*(TSPEC-derived schema migration constraint; not a direct REQ-NF-08 acceptance criterion)*` — is exactly the right approach: it preserves traceability without overstating the requirement scope, and it signals to the PLAN author why this property exists without an AT reference.

- **PROP-RP-08 / PROP-RP-N01 differentiation is precise and test-author-friendly.** The phrases "verified by asserting on the function return value directly" (PROP-RP-08) and "verified by asserting on the embed fields as seen by the Discord client" (PROP-RP-N01) leave no ambiguity about which assertion point each property maps to. A test author can implement both without further clarification.

- **§7 gap management is transparent and complete.** Closing Gaps #1 and #3 with named, tracked properties (PROP-DI-N05 and PROP-EX-21) while leaving Gaps #2 and #4 as open low-risk items with specific recommendations is exactly the right triage posture. The open gaps are actionable at PLAN time without blocking approval.

- **Zero E2E tests remains well-justified.** The rationale in §6 is tight: all Phase 7 observables (embed field values, log entries, thread registry state, error message content) are verifiable through the TSPEC §9.2 fake infrastructure. PROP-DI-21 provides the single integration-level lifecycle assembly test. The pyramid reasoning holds.

---

## Recommendation

**Approved with minor changes.**

One Low-severity finding (F-01) should be addressed before this document is used to drive the PLAN:

- [ ] Append `PROP-EX-N01, PROP-EX-N02` to the §5.1 REQ-NF-08 coverage row to match the pattern used by all other requirement rows with negative properties. No count, pyramid, or property changes are required — this is a coverage matrix editorial fix only.

This finding is non-blocking. The document's property derivation, traceability, test level distribution, and coverage rationale are all sound. The PLAN author may proceed against this PROPERTIES document — just apply the §5.1 fix in the same pass as any PLAN-related edits.
