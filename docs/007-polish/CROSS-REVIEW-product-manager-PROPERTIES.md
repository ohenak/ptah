# Cross-Review: Product Manager — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.1 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-backend-engineer-PROPERTIES.md`, `CROSS-REVIEW-test-engineer-PROPERTIES.md` |
| **Review Version** | v1.4 (re-review after revision addressing PM v1.3, BE v1.2, TE v1.2 findings) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Resolution Status: All Prior Findings Closed

v1.1 was authored in response to PM v1.3, BE v1.2, and TE v1.2 cross-reviews. This review confirms all seven findings from PM v1.3 are resolved correctly in v1.1.

| Finding | Severity | Resolution |
|---------|----------|------------|
| F-01 — PROP-EX-21 missing (hot-reload integration property) | Medium | ✅ PROP-EX-21 added to §3.5 with correct sources [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08], test level Integration, priority P1 |
| F-02 — Count discrepancy in §2 and §6 | Medium | ✅ §2 Functional corrected to 33, Integration to 4, Total to 71; §6 Unit corrected to 67, Integration to 4, Total to 71 — all counts independently verified |
| F-03 — §3.6 Performance section missing | Low | ✅ §3.6 Performance Properties placeholder added with a one-line justification explaining why no performance properties are warranted for Phase 7 |
| F-04 — PROP-EX-18 traced to REQ-NF-08 incorrectly | Low | ✅ Source retraced to `[TSPEC §5.2], [TSPEC §5.3]` with an explicit parenthetical note marking it as a TSPEC-derived schema migration constraint, not a direct REQ-NF-08 acceptance criterion |
| F-05 — PROP-EX-17 failure mode ambiguous | Low | ✅ Rewritten to specify "silently dropped by the schema parser, not thrown as errors" — unambiguous test contract |
| F-06 — Redundant `PROP-EX-12..19` sub-range in §5.1/§5.2 | Low | ✅ Removed from both REQ-NF-08 row in §5.1 and FSPEC-EX-01 row in §5.2 |
| F-07 — Gap #1 not elevated to named negative property | Low | ✅ PROP-DI-N05 added to §4 Negative Properties: `ResponsePoster` must NOT expose `postSystemMessage()`, verified at TypeScript compile-time |

---

## Count Verification (Independent Audit)

Positive properties (§3):

| Section | IDs | Count |
|---------|-----|-------|
| §3.1 Thread Archiving | PROP-DI-01..08 | 8 |
| §3.1 Embed Formatting | PROP-DI-09..15 | 7 |
| §3.1 Config-Driven Extensibility | PROP-EX-01..11 | 11 |
| §3.1 Structured Logging | PROP-LG-01..03 | 3 |
| §3.1 Error Message UX | PROP-RP-01..04 | 4 |
| **§3.1 Functional subtotal** | | **33** ✓ |
| §3.2 Contract | PROP-DI-16..17, PROP-EX-12..13, PROP-LG-04, PROP-RP-05 | 6 ✓ |
| §3.3 Error Handling | PROP-DI-18..20, PROP-EX-14..16, PROP-RP-06..07, PROP-LG-05 | 9 ✓ |
| §3.4 Data Integrity | PROP-EX-17..18, PROP-OB-01..02 | 4 ✓ |
| §3.5 Integration | PROP-DI-21, PROP-EX-19, PROP-LG-06, PROP-EX-21 | 4 ✓ |
| §3.6 Performance | — | 0 ✓ |
| §3.7 Security | PROP-RP-08..10 | 3 ✓ |
| §3.8 Idempotency | PROP-DI-22, PROP-EX-20 | 2 ✓ |
| §3.9 Observability | PROP-OB-03..12 | 10 ✓ |
| **Grand total (§3)** | | **71** ✓ |

§6 distribution: 67 Unit (71 − 4 Integration) + 4 Integration = 71. ✓

---

## Findings

*No new findings.*

The v1.1 document is clean. All seven prior findings are resolved. The coverage matrix (§5.1, §5.2) is correct with no redundant sub-ranges. The PROP-EX-21 property language matches exactly what was specified in PM v1.3 F-01. PROP-DI-N05 is correctly sourced to [TSPEC §4.2.2]. All requirement rows in §5.3 show Full coverage at P1 with no gaps.

---

## Clarification Questions

*None.*

---

## Positive Observations

- **Thorough revision in a single pass.** All seven PM v1.3 findings — two Medium, five Low — were resolved correctly and completely in one revision. No partial fixes, no regressions introduced.

- **PROP-EX-21 language is precise.** "At next routing decision" correctly scopes the test to the observable behavior (DefaultRoutingEngine's response to the next ROUTE_TO_AGENT signal) rather than the internal hot-reload mechanism — which is unobservable from the test boundary.

- **PROP-EX-17 disambiguation removes test ambiguity.** The "silently dropped, not thrown" language is the correct testable statement. Engineers authoring tests can now write `expect(result).not.toHaveProperty('active')` with confidence, rather than choosing between rejection and omission assertions.

- **§3.6 Performance placeholder is well-justified.** The one-sentence explanation ("all Phase 7 changes are purely behavioral") gives future reviewers context and prevents the section from appearing as an oversight.

---

## Recommendation

**Approved.**

The PROPERTIES document v1.1 fully addresses all prior cross-review findings. All 71 positive properties and 10 negative properties are correctly specified, counted, and traced. The document is ready for PLAN authoring.
