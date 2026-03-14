# Cross-Review: Product Manager — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `009-PROPERTIES-ptah-auto-feature-bootstrap.md` |
| **Review Date** | March 14, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The PROPERTIES document is thorough, well-structured, and accurately reflects the approved REQ and FSPEC. All 8 Phase 9 requirements (REQ-AF-01 through REQ-AF-07, REQ-AF-NF-01) are covered with at least one positive property each. All 8 FSPEC-AF-01 business rules are mapped. The test strategy rationale (inverted pyramid due to natural-language implementation) is sound and well-documented.

Two minor traceability omissions were found in §5.1 (coverage matrix) — specific properties that exist but are missing from their corresponding requirement rows. These are documentation-accuracy issues, not substantive coverage gaps.

**Recommendation: Approved with minor changes** — address F-01 and F-02 before closing.

---

## Findings

### F-01 (Low) — REQ-AF-07 coverage row omits PROP-AF-36 and PROP-AF-37

**Location:** §5.1 Requirement Coverage, row for `[REQ-AF-07] Idempotency — skip if folder exists`

**Current:** `PROP-AF-34, PROP-AF-35, PROP-AF-48`

**Issue:** PROP-AF-36 ("treat mkdir success-when-folder-already-exists as a successful no-op") and PROP-AF-37 ("log skip notice and preserve overview.md content on race-condition write") are both idempotency properties sourced from FSPEC-AF-01 AF-R4 and Step 6, which derive from REQ-AF-07. They appear in the Idempotency section (§3.6) and in the §5.2 FSPEC coverage rows, but are absent from the §5.1 REQ coverage row.

**Recommended fix:** Update the REQ-AF-07 row to:
```
PROP-AF-34, PROP-AF-35, PROP-AF-36, PROP-AF-37, PROP-AF-48
```

---

### F-02 (Low) — REQ-AF-03 coverage row omits PROP-AF-46

**Location:** §5.1 Requirement Coverage, row for `[REQ-AF-03] NNN auto-assignment for unnumbered threads`

**Current:** `PROP-AF-05, PROP-AF-06`

**Issue:** PROP-AF-46 ("PM skill must NOT scan remote Git history or fetch from remote to determine NNN") sources directly from AF-R3, which is the business rule implementing REQ-AF-03's auto-assignment logic. PROP-AF-46 is correctly listed under §5.2 for FSPEC-AF-01 Step 4b and AF-R3, but it is missing from the §5.1 requirement-level coverage row.

**Recommended fix:** Update the REQ-AF-03 row to:
```
PROP-AF-05, PROP-AF-06, PROP-AF-46
```

---

## Clarification Questions

None. The document is unambiguous.

---

## Positive Observations

1. **Complete requirement coverage:** Every requirement from the REQ document is present in §5.1 with "Full" coverage confirmed. No requirements are orphaned or missed.

2. **All FSPEC business rules mapped:** §5.2 covers all 15 FSPEC-AF-01 specification items, including AF-R8 (correctly documented as N/A — known limitation requiring no property).

3. **Negative properties are comprehensive and accurate:** All 6 negative properties (PROP-AF-43 through -48) faithfully capture the out-of-scope behaviors documented in REQ §4.2. In particular, PROP-AF-43 (PM must not create `docs/`), PROP-AF-44 (no auto-increment on numbered threads), and PROP-AF-48 (`overview.md` immutability) align precisely with product intent.

4. **Test strategy rationale is sound:** The inverted pyramid explanation accurately characterizes why E2E acceptance testing dominates (Phase 0 is natural language in SKILL.md with no TypeScript to unit-test). The contract test approach for `extractFeatureName()` is the correct and minimal automated test intervention.

5. **Gap analysis is honest and actionable:** All 4 identified gaps are genuine, well-described, and appropriately risk-rated. Gap 1 (AF-R8 context-assembler mismatch) correctly defers to a future phase. Gap 4 (NNN scan with non-folder entries) accurately identifies the current risk as low given the existing `docs/` contents.

6. **Priority inheritance:** All 48 properties (positive and negative) are correctly rated P0, P1, or P2, consistent with the single-user-story source (US-09) having P0 requirements throughout. No priority escalation or downgrade without justification.

---

*End of Review*
