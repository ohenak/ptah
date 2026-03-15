# Cross-Review: Product Manager Review of PROPERTIES-011

| Field | Detail |
|-------|--------|
| **Document** | [011-PROPERTIES-orchestrator-pdlc-state-machine.md](011-PROPERTIES-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Product Manager (`pm`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved |

---

## Findings

### F-01: Analysis summary counts 44 requirements but REQ v1.2 has 45 (Low)

Section 1.2 states "Requirements analyzed: 44" and Section 5.3 states "P0: 38". REQ v1.2 has 45 total requirements (38 P0 + 6 P1 + 1 added in v1.2 = REQ-RT-09). The coverage matrix in Section 5.1 correctly lists REQ-RT-09 and maps it to PROP-SM-18 and PROP-NEG-05, so the actual coverage is correct — only the summary count is off by 1.

**Impact:** Cosmetic — the properties themselves cover all 45 requirements. Only the header count is wrong.

**Recommendation:** Update Section 1.2 to "Requirements analyzed: 45 (38 P0, 6 P1)" and Section 5.3 P0 row to "38" with "32 fully covered" (which it already says). No substantive change needed.

---

### F-02: Gap #4 flags `processResumeFromBound()` as having no dedicated properties (Low)

Gap #4 states this method "has no dedicated properties" and is "covered implicitly by PROP-SM-18 and PROP-INT-08." From a product perspective, the revision bound resume behavior is a key product decision (FSPEC-RT-02: reset count + re-enter review, force-advance NOT supported). PROP-SM-18 covers the bound being hit, but no property explicitly verifies that the resume resets the count and re-enters review.

**Impact:** Low — the integration test (PROP-INT-08) would likely exercise this path during a full lifecycle test. But the specific product guarantee ("force-advance is NOT supported") is not asserted anywhere.

**Recommendation:** Consider adding a property like: "`processResumeFromBound()` must reset revisionCount to 0, reset all reviewer statuses to pending, and return a dispatch action for reviewers — it must NOT advance the phase past review." This is a product-level invariant worth having an explicit assertion for.

---

## Clarification Questions

None.

---

## Positive Observations

- **P-01:** The coverage matrix (Section 5) is thorough — every requirement from REQ-SM-01 through REQ-SM-NF-05 is listed with its covering properties, and the coverage assessment ("Full", "Out of scope") is accurate against the REQ. REQ-SA-01–06 and REQ-RT-08 are correctly marked as out of scope with appropriate justification.

- **P-02:** The negative properties (Section 4) are excellent from a product perspective. PROP-NEG-03 (collect-all-then-evaluate: must NOT transition while reviewers are pending) directly enforces the product decision from FSPEC-RT-02 BR-RL-03. PROP-NEG-04 (must NOT advance with revision_requested) enforces US-14's core guarantee. These are the properties that would catch a regression if someone accidentally reverted to the early-exit model.

- **P-03:** PROP-SM-19 (Revise vs. Resubmit directives for fullstack partial rejection) covers the product UX decision from FSPEC-RT-02 AT-RL-08. This was a nuanced product choice — ensuring the approved sub-task author isn't confused by a "Revise" directive — and having it as an explicit testable property is valuable.

- **P-04:** The test pyramid distribution (91% unit, 9% integration, 0% E2E) is well-justified. The pure-function architecture means the state machine, reviewer computation, parsing, and context matrix are all testable at the unit level without any mocking. The E2E justification ("no E2E needed because integration tests cover cross-module boundaries") is sound.

- **P-05:** PROP-AD-06 (Recommendation inside fenced code blocks is ignored) covers the parsing rule clarified during FSPEC review (F-04 from test-engineer's own REQ review). The property ensures the code block exclusion logic is tested.

- **P-06:** PROP-CA-06 (fullstack PLAN_CREATION scope filtering) covers the product decision clarified in FSPEC-CA-01 BR-CA-04 (Q-02 from backend-engineer's FSPEC review) — each engineer receives only their own discipline's TSPEC.

- **P-07:** The idempotency properties (PROP-ID-01 through PROP-ID-03) are a smart category. Pure functions must be deterministic — testing this explicitly catches subtle bugs like accidentally incorporating non-deterministic timestamps or random values.

- **P-08:** PROP-CT-03 correctly lists 8 methods for the `PdlcDispatcher` protocol, including `processResumeFromBound` which was flagged as missing from the TSPEC interface. This shows the properties document is forward-looking — it specifies the expected interface even where the TSPEC has a gap.

---

## Summary

This is a comprehensive and well-structured properties document. 86 properties across 8 categories provide thorough coverage of the 45 requirements (minus 6 out-of-scope SKILL.md documentation requirements). The coverage matrix demonstrates full traceability from requirements to testable properties.

The negative properties section (Section 4) is particularly strong — it captures the critical "must NOT" behaviors that protect the core product guarantees (deterministic phase ordering, collect-all-then-evaluate, revision bound enforcement, no force-advance past unapproved reviews).

Both findings are low severity. F-01 is a count typo. F-02 is a suggestion to add an explicit property for the revision bound resume behavior.

**Recommendation: Approved** — proceed to implementation. The properties document provides a solid test foundation for the PDLC state machine.
