# Cross-Review: Product Manager — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-backend-engineer-PROPERTIES.md`, `CROSS-REVIEW-test-engineer-PROPERTIES.md` |
| **Review Version** | v1.3 (re-review — document remains at v1.0; no revisions committed since v1.2 review) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Status Update from v1.2

**Document not revised.** The PROPERTIES document was committed once at `79f2f7f` (v1.0) and has not been updated. All Medium findings from v1.2 remain outstanding. This v1.3 review confirms the current document state is unchanged and all prior findings are still open.

---

## Findings

### F-01 — Medium | Missing PROP-EX-21 — Hot-Reload Registry Rebuild Path Not Covered

**Status:** Unresolved (carried from v1.1 F-01 → v1.2 F-01 → v1.3).

**Location:** §7 Gap #3; REQ-NF-08 acceptance criterion AT-EX-01-08.

**Issue:** The REQ-NF-08 acceptance criterion explicitly states the agent must be registered **"at next startup (or on config hot-reload)"** — hot-reload is a first-class product requirement. The document self-identifies this as Medium risk in §7 but promotes no property to cover it.

Without PROP-EX-21, the PLAN has no trackable Definition of Done item for this acceptance test. The BE confirmed TSPEC OQ-TSPEC-01 is resolved (the composition root supports registry rebuild on hot-reload). The TE confirmed the correct test level is **Integration** (requires wiring `NodeConfigLoader`, registry factory, and `DefaultRoutingEngine` together — fakes alone are insufficient).

**Required action:** Add the following property to §3.5 Integration Properties:

> **PROP-EX-21:** After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; **Test Level: Integration**; Priority: P1

After adding PROP-EX-21: update §2 Integration count (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 Integration count and pyramid. Grand total after all count corrections = **71**.

---

### F-02 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One

**Status:** Unresolved (carried from v1.1 F-02 → v1.2 F-02 → v1.3).

**Location:** §2 Property Summary table (Functional row, Total); §6 Test Level Distribution table.

**Issue:** Counting §3.1 sub-sections directly yields **33 Functional properties**:

| Sub-category | Properties | Count |
|---|---|---|
| Thread Archiving | PROP-DI-01..08 | 8 |
| Embed Formatting | PROP-DI-09..15 | 7 |
| Config-Driven Extensibility | PROP-EX-01..11 | 11 |
| Structured Logging | PROP-LG-01..03 | 3 |
| Error Message UX | PROP-RP-01..04 | 4 |
| **Sub-total** | | **33** |

§2 reports 32 Functional and a total of 69. The grand total is **70** (before adding PROP-EX-21), **71** after. This propagates to §6: Unit count should be 67 (not 66), total should be 70/71 depending on whether PROP-EX-21 is included.

The PLAN's Definition of Done gate will be derived from the §2 total. A gate set at 69 means one property will never be checked at completion — a DoD correctness failure.

**Required action:** Identify the off-by-one property (likely Config-Driven Extensibility: PROP-EX-01..11 = 11 entries, likely miscounted as 10). Correct §2 Functional to 33, correct §2 Total and §6 totals in a single pass incorporating F-01 — final grand total is **71**.

---

### F-03 — Low | Section Numbering Gap: §3.6 Missing

**Status:** Unresolved (carried from v1.1 F-04 → v1.2 F-03 → v1.3).

**Location:** §3 Properties, section headers.

**Issue:** Document jumps from `3.5 Integration Properties` to `3.7 Security Properties`, skipping §3.6. The template defines a Performance section at position 3.6; Phase 7 has no performance properties but the numbering was not adjusted.

**Required action:** Either renumber `3.7 → 3.6`, `3.8 → 3.7`, `3.9 → 3.8` and update all cross-references; or insert a `3.6 Performance Properties` placeholder with a one-line note explaining why no performance properties are warranted for Phase 7.

---

### F-04 — Low | PROP-EX-18 Traceability — LLM Config Parsing Not in REQ-NF-08 Acceptance Criteria

**Status:** Unresolved (carried from v1.1 F-05 → v1.2 F-04 → v1.3).

**Location:** §3.4 PROP-EX-18; §5.1 Coverage Matrix REQ-NF-08 row.

**Issue:** PROP-EX-18 asserts that the config loader parses `llm.model` and `llm.max_tokens`. REQ-NF-08 focuses exclusively on the `agents[]` array schema. Tracing PROP-EX-18 to REQ-NF-08 overstates the requirement scope — LLM config is a co-migrated schema concern but is not an REQ-NF-08 acceptance criterion.

**Required action (Low — editorial):** Retrace PROP-EX-18 source to `[TSPEC §5.2], [TSPEC §5.3]` as a companion schema migration data-integrity constraint. Add a note that this is a TSPEC-derived constraint rather than a direct REQ-NF-08 acceptance criterion.

---

### F-05 — Low | PROP-EX-17 Failure Mode Is Ambiguous for Test Authoring

**Status:** Unresolved (carried from v1.1 F-06 → v1.2 F-05 → v1.3).

**Location:** §3.4, PROP-EX-17.

**Issue:** "Reject (or not parse)" is a disjunction between two fundamentally different test implementations: `expect(fn).rejects.toThrow(...)` (hard rejection) vs. `expect(result.value).not.toHaveProperty('active')` (silent omission). Per TSPEC §5.1/5.3, the correct behavior is silent key omission by the Zod schema parser.

**Required action (Low — editorial):** Rewrite to be unambiguous:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser, not thrown."

---

### F-06 — Low | Redundant Sub-Range in §5.1 REQ-NF-08 Coverage Row

**Status:** Unresolved (carried from v1.1 F-07 → v1.2 F-06 → v1.3).

**Location:** §5.1 Requirement Coverage, REQ-NF-08 row; §5.2 FSPEC-EX-01 row.

**Issue:** `PROP-EX-01..20, PROP-EX-12..19` — the range `PROP-EX-12..19` is fully subsumed by `PROP-EX-01..20`. Same redundant notation in §5.2.

**Required action:** Remove `PROP-EX-12..19` from both §5.1 and §5.2.

---

### F-07 — Low | Gap #1 Should Be Elevated to a Named Negative Property

**Status:** Unresolved (carried from v1.2 F-07 → v1.3; originally TE F-08).

**Location:** §7 Gap #1; §4 Negative Properties.

**Issue:** Gap #1 (`postSystemMessage()` removal) is correctly identified as a risk in §7. Without a named negative property, the PLAN has no trackable DoD item verifying that this method is removed from the `ResponsePoster` protocol. A grep check in the PLAN is fragile — it requires manual coordination with the test script author. A named property forces the PLAN author to explicitly verify the interface change.

**Recommended action (Low — editorial):** Add:

> **PROP-DI-N05:** `ResponsePoster` protocol must NOT expose `postSystemMessage()` — the method must be absent from the interface definition and all implementing classes.
> — Sources: [TSPEC §4.2.2]; Test Level: Unit (TypeScript compile-time); Priority: P1

This converts Gap #1 from an open risk to a closed, trackable item.

---

## Clarification Questions

*None — all questions are resolved.*

---

## Positive Observations

- **Comprehensive property coverage.** All 6 P1 requirements are fully covered. The 1:1 mapping from FSPEC-OB-01's 10 lifecycle events to PROP-OB-03 through PROP-OB-12 is precisely what operator observability verification requires.

- **Negative properties section (§4) is a standout.** Nine negative properties across four domains — including subtle invariants like no manual component prefix injection (PROP-LG-N01) and no type redefinition in logger.ts (PROP-LG-N02) — encode the classes of accidental regressions hardest to catch without explicit test hooks.

- **Security properties operationalize the requirement well.** PROP-RP-08/09/10 form a three-layer defense — output shape, function signature constraint, and name-sourcing rules — ensuring the REQ-RP-06 intent cannot be defeated by a partial implementation.

- **Integration property PROP-LG-06 (shared FakeLogStore)** is the right foundational design for observability tests. Without this property, per-component log isolation would silently make the PROP-DI-21 EVT-OB-01..10 trace invisible from a single assertion point.

- **Self-identified gaps in §7 demonstrate strong discipline.** All three reviewers validated the assessments. The process worked as intended; the remaining step is incorporating those gaps before the PLAN is written.

---

## Recommendation

**Needs revision.**

The PROPERTIES document has not been revised since its initial commit (v1.0). Two Medium findings must be resolved before this document can be approved:

1. **F-01** — Add PROP-EX-21 (hot-reload Integration property); update §2 Integration count (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 pyramid.
2. **F-02** — Fix property count discrepancy: §2 Functional (32 → 33), Total corrected. Address F-01 and F-02 in a single pass — final corrected grand total is **71** (70 after count fix +1 for PROP-EX-21).

Low-severity findings (F-03 through F-07) should be addressed in the same revision pass.

**Required before approval:**
- [ ] Add PROP-EX-21 (Integration, P1); update §2 Integration (3 → 4), §5.1, §5.2, §6
- [ ] Fix §2 Functional count (32 → 33) and correct all totals (grand total → 71 after both fixes)
- [ ] Fix §6 Unit count (66 → 67) and grand total (69 → 71)

**Recommended (Low severity — same pass):**
- [ ] Fix section numbering §3.7→§3.6, §3.8→§3.7, §3.9→§3.8 [F-03]
- [ ] Retrace PROP-EX-18 source to TSPEC §5.2/5.3, not REQ-NF-08 [F-04]
- [ ] Clarify PROP-EX-17 to specify silent schema drop, not throw [F-05]
- [ ] Remove redundant `PROP-EX-12..19` range from §5.1 and §5.2 [F-06]
- [ ] Elevate Gap #1 to named negative property PROP-DI-N05 [F-07]
