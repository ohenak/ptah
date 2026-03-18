# Cross-Review: Backend Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.1 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-product-manager-PROPERTIES.md`, `CROSS-REVIEW-test-engineer-PROPERTIES.md` v1.2 |
| **Review Version** | v1.3 (re-review of v1.1 revision) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Status Update from v1.2

**All prior findings resolved.** The PROPERTIES document was revised from v1.0 to v1.1 addressing every Medium and Low finding from BE v1.2, PM v1.3, and TE v1.2. This v1.3 review confirms resolution of all eight prior findings and documents two Low observations surfaced during fresh review of v1.1.

---

## Prior Finding Resolution

| Finding | Severity | Status in v1.1 |
|---------|----------|----------------|
| F-01 — §2 / §6 count off-by-one (Functional 32→33, Unit 66→67, Total 69→71) | Medium | **Resolved** — §2 Functional: 33, §6 Unit: 67, §6 Total: 71 ✓ |
| F-02 — Missing PROP-EX-21 (hot-reload integration property) | Medium | **Resolved** — PROP-EX-21 added to §3.5 with Integration test level; §2 Integration: 4, §5.1/§5.2 updated ✓ |
| F-03 — Redundant PROP-EX-12..19 sub-range in §5.1/§5.2 | Low | **Resolved** — Range removed from §5.1 REQ-NF-08 row and §5.2 FSPEC-EX-01 row ✓ |
| F-04 — PROP-EX-17 failure mode ambiguous ("reject or not parse") | Low | **Resolved** — Rewritten to "silently dropped by the schema parser, not thrown as errors" ✓ |
| F-05 — Section numbering gap (3.5 → 3.7, missing 3.6) | Low | **Resolved** — §3.6 Performance Properties placeholder inserted with one-line no-tests justification ✓ |
| F-06 — PROP-EX-18 traced to REQ-NF-08 (incorrect) | Low | **Resolved** — Source corrected to `[TSPEC §5.2], [TSPEC §5.3]`; note added clarifying TSPEC-derived scope; property absent from §5.1 REQ-NF-08 coverage row ✓ |
| F-07 — Gap #1 not elevated to named negative property | Low | **Resolved** — PROP-DI-N05 added to §4: `ResponsePoster` must NOT expose `postSystemMessage()` — verified at TypeScript compile-time; Gap #1 marked RESOLVED in §7 ✓ |
| F-08 — PROP-RP-08 and PROP-RP-N01 near-duplicate scope | Low | **Resolved** — PROP-RP-08 now asserts on `buildErrorMessage()` return value directly; PROP-RP-N01 now asserts on `FakeDiscordClient.capturedEmbeds` after `postErrorReportEmbed()` — distinct assertion points ✓ |

---

## Findings

### F-01 (v1.3) — Low | §4 Negative Properties Excluded From §2 / §6 Totals Without Explicit Notation

**Location:** §2 Property Summary table; §6 Test Level Distribution.

**Issue:** Section §4 contains 10 named negative properties (PROP-DI-N01..N05, PROP-EX-N01..N02, PROP-RP-N01, PROP-LG-N01..N02). These are all Unit-level. However, §2 shows no "Negative" row and the §6 totals (Unit: 67, Total: 71) reflect only the §3 positive-property set. The true property corpus is 81 (71 + 10), not 71. The §6 pyramid annotation "67 — all protocol, functional, error handling, security, and observability" does not mention negative properties.

**Impact:** A PLAN author counting Definition of Done items from §6 will derive a gate of 71 properties, missing 10 trackable test items in §4. In practice the prior review chain accepted this convention and the PLAN is not yet authored, so the risk is contained — but the exclusion is undocumented and could cause a DoD undercount.

**Required action (Low — editorial):** Add a footnote below the §2 table or §6 table clarifying the counting convention, e.g.: *"§4 Negative Properties (10) are tracked separately and not included in this count."* This makes the convention explicit for the PLAN author.

---

### F-02 (v1.3) — Low | Gap #2 (`resolveColour()` Elimination) Still Open With No Named Property or Compile-Time Hook

**Location:** §7 Gap #2.

**Issue:** Gap #2 remains open: *"Add a gap test or compile-time check verifying `resolveColour` is unreachable."* No property was elevated to cover this, and the recommendation defers it to "covered in spirit" by PROP-DI-15. From a backend engineer standpoint, `resolveColour()` is a call-site concern — if residual references exist after Phase 7 refactoring, a TypeScript compile error via removed export is the reliable detection mechanism. PROP-DI-15 validates the embed color value is `0x5865F2`, but it does NOT verify that `resolveColour()` itself no longer exists in the codebase. These are two different things.

**Impact:** Low — if `resolveColour()` is left in scope but not called, it is dead code, not a behavioral regression. However, if a call site persists and bypasses the embed color, it would only surface as a `0x5865F2` embed color assertion failure in the PROP-DI-15 test — an indirect signal at best.

**Recommended action (Low — editorial):** Consider adding a Negative Property to §4: *"The exported symbol `resolveColour` must NOT exist in any `ResponsePoster`-related module — verified by TypeScript compile-time (removed export + no import)."* This converts Gap #2 from an open risk to a closed, trackable item. If the PLAN author is satisfied with the PROP-DI-15 indirect coverage, close Gap #2 explicitly in §7 with that rationale rather than leaving it open.

---

## Clarification Questions

None for v1.3. All prior questions are closed:
- **Q-01 (v1.2):** PROP-EX-21 test level — **Closed.** Integration confirmed correct.

---

## Positive Observations

**All prior positive observations hold and are strengthened by the v1.1 revision:**

- **PROP-EX-21 (hot-reload integration) is correctly specified.** The wiring described — NodeConfigLoader (file-watch trigger) → registry factory (rebuild) → DefaultRoutingEngine (updated registry reference) → routing decision — cannot be verified at unit level with fakes alone. Specifying this as Integration is technically sound.

- **The PROP-RP-08 / PROP-RP-N01 differentiation (F-08 resolution) is exemplary.** Two assertion points — one on the builder function's return value, one on the embed fields as seen by the Discord client fake — are now unambiguously separated. A test author has complete, non-overlapping coverage guidance.

- **PROP-DI-N05 compile-time verification** is exactly the right mechanism for protocol removal coverage. TypeScript's type checker as the test oracle for interface method absence is both reliable and zero-cost at runtime. Naming this as a property makes it a first-class DoD item in the PLAN.

- **Gap #3 (hot-reload) → PROP-EX-21** demonstrates the properties process working correctly: a gap identified pre-implementation was resolved to a named, test-level-specified property rather than deferred. This is the intended pre-PLAN gate outcome.

- **Property count verification:** §3 properties manually verified against their sub-section tables:
  - Thread Archiving (PROP-DI-01..08): 8 ✓
  - Embed Formatting (PROP-DI-09..15): 7 ✓
  - Config-Driven Extensibility (PROP-EX-01..11): 11 ✓
  - Structured Logging (PROP-LG-01..03): 3 ✓
  - Error Message UX (PROP-RP-01..04): 4 ✓
  - Contract (PROP-DI-16..17, PROP-EX-12..13, PROP-LG-04, PROP-RP-05): 6 ✓
  - Error Handling (PROP-DI-18..20, PROP-EX-14..16, PROP-RP-06..07, PROP-LG-05): 9 ✓
  - Data Integrity (PROP-EX-17..18, PROP-OB-01..02): 4 ✓
  - Integration (PROP-DI-21, PROP-EX-19, PROP-LG-06, PROP-EX-21): 4 ✓
  - Security (PROP-RP-08..10): 3 ✓
  - Idempotency (PROP-DI-22, PROP-EX-20): 2 ✓
  - Observability (PROP-OB-03..12): 10 ✓
  - **§3 total: 71 ✓**

- **§5 coverage matrix is clean.** The redundant `PROP-EX-12..19` sub-range is gone; all six requirement rows and seven FSPEC rows reference complete, non-overlapping property sets.

- **PROP-RP-09 (pure function constraint on `buildErrorMessage()`)** remains the standout security property — encoding the signature as a testable invariant prevents the entire class of accidental stack trace exposure through indirect string interpolation.

---

## Recommendation

**Approved.**

The v1.1 revision addresses all eight findings from BE v1.2, PM v1.3, and TE v1.2. The document is technically sound across all six requirement domains. Property definitions are unambiguous, test levels are correctly assigned, and the coverage matrices are accurate.

Two Low observations are noted above (§4 exclusion notation, Gap #2 elevation). Neither is blocking. Both can be addressed in the same pass as any other pre-PLAN cleanup, or deferred to a PLAN-time PLAN notes entry.

**This document is approved for PLAN authoring.**
