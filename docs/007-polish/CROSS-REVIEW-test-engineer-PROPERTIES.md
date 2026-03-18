# Cross-Review: Test Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-product-manager-PROPERTIES.md` v1.2, `CROSS-REVIEW-backend-engineer-PROPERTIES.md` |
| **Review Version** | v1.2 (re-review — all prior findings unresolved except F-03 branch issue) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Status Update from v1.1

**F-03 (wrong branch) — RESOLVED.** The PROPERTIES document was committed to `feat-007-polish` at commit `79f2f7f`. This was the blocking administrative finding from the initial review. It is now closed.

All other Medium findings from v1.1 remain outstanding. The document was committed at v1.0 without addressing any review feedback. This v1.2 review reflects the current document state, consolidates findings across all three reviewer perspectives (PM v1.2, BE, TE v1.1), and adds one new Low finding (F-09).

---

## Findings

### F-01 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One

**Status:** Unresolved from v1.1 F-01. Confirmed independently by PM F-02 and BE F-01.

**Location:** §2 Property Summary table (Functional row, Total); §6 Test Level Distribution table.

**Issue:** Counting §3.1 sub-sections directly yields **33 Functional properties**, not 32 as reported in §2:

| Sub-category | Properties | Count |
|---|---|---|
| Thread Archiving | PROP-DI-01..08 | 8 |
| Embed Formatting | PROP-DI-09..15 | 7 |
| Config-Driven Extensibility | PROP-EX-01..11 | **11** |
| Structured Logging | PROP-LG-01..03 | 3 |
| Error Message UX | PROP-RP-01..04 | 4 |
| **Sub-total** | | **33** |

The off-by-one is in the Config-Driven Extensibility sub-group: PROP-EX-01 through PROP-EX-11 = 11 properties, likely miscounted as 10 during drafting. Grand total without PROP-EX-21 is **70** (not 69). After adding PROP-EX-21 (see F-02), grand total becomes **71**.

**Required action:** Fix §2 Functional count (32 → 33). Do this in a single pass with F-02 — final corrected grand total is **71**. Fix §6 Unit count (66 → 67), §6 Total (69 → 71 after both F-01 and F-02 applied).

---

### F-02 — Medium | Missing PROP-EX-21 — Hot-Reload Registry Rebuild Path Not Covered

**Status:** Unresolved from v1.1 F-02. Confirmed by PM F-01. BE Q-01 has confirmed TSPEC OQ-TSPEC-01 is resolved (architecture supports registry rebuild on hot-reload). TE Q-01 confirmed Integration is the correct test level.

**Location:** §7 Gap #3; REQ-NF-08 acceptance criteria (`"registered at next startup (or on config hot-reload)"`).

**Issue:** REQ-NF-08's acceptance criterion AT-EX-01-08 explicitly covers config hot-reload as a first-class requirement. The document self-identifies this as a Medium-risk gap in §7 but promotes no property to cover it. Without a named property, the PLAN has no trackable Definition of Done item for AT-EX-01-08.

TSPEC OQ-TSPEC-01 is resolved: the composition root rebuilds the registry and updates the Orchestrator's registry reference on hot-reload. The property is technically feasible. Integration is the correct test level because this requires wiring `NodeConfigLoader` (file-watch trigger), the registry factory (rebuild), and `DefaultRoutingEngine` (subsequent routing decision) together — unit-level fakes alone cannot verify the registry handoff.

**Required action:** Add the following property to §3.5 Integration Properties:

> **PROP-EX-21:** After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; **Test Level: Integration**; Priority: P1

After adding PROP-EX-21: update §2 Integration count (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 Integration count and pyramid. Grand total after F-01 + F-02 corrections = **71**.

---

### F-03 — Low | Section Numbering Gap — §3.6 Missing

**Status:** Unresolved from v1.1 F-04. Confirmed by PM F-03.

**Location:** §3 Properties, section headers.

**Issue:** The document jumps from `3.5 Integration Properties` to `3.7 Security Properties`, skipping §3.6. The properties template defines Performance at position 3.6. Phase 7 has no performance properties, but the section was omitted without adjusting subsequent numbers, creating a broken navigation anchor.

**Required action:** Either renumber `3.7 → 3.6`, `3.8 → 3.7`, `3.9 → 3.8` and update all cross-references; or insert a `3.6 Performance Properties — None` placeholder with a one-line note explaining why performance testing is not warranted for Phase 7.

---

### F-04 — Low | Redundant Sub-Range in §5.1 REQ-NF-08 Row

**Status:** Unresolved from v1.1 F-05. Confirmed by PM F-06 and BE F-02.

**Location:** §5.1 Requirement Coverage, REQ-NF-08 row; §5.2 FSPEC-EX-01 row.

**Issue:** The cell reads `PROP-EX-01..20, PROP-EX-12..19, PROP-LG-06, PROP-DI-21`. The range `PROP-EX-12..19` is fully subsumed by `PROP-EX-01..20`. The same redundant range appears in §5.2 FSPEC-EX-01 row.

**Required action:** Remove the redundant `PROP-EX-12..19` from both §5.1 and §5.2.

---

### F-05 — Low | PROP-EX-17 Failure Mode Is Ambiguous for Test Authoring

**Status:** Unresolved from v1.1 F-06. Confirmed by PM F-05 and BE F-03.

**Location:** §3.4, PROP-EX-17.

**Issue:** `"reject (or not parse)"` is a disjunction between two fundamentally different test implementations:
- **Throw on invalid schema** → `expect(fn).rejects.toThrow(...)`
- **Silently omit unknown keys** → `expect(result.value).not.toHaveProperty('active')`

Per TSPEC §5.1/5.3, the correct behavior is silent key omission (Zod strict schema drops unknown keys — no throw). An engineer reading this property as written would not know which assertion to write.

**Required action (Low — editorial):** Rewrite to be unambiguous:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser, not thrown."

---

### F-06 — Low | PROP-EX-18 Traceability to REQ-NF-08 Is Misleading

**Status:** Unresolved from v1.1 F-07. Confirmed by PM F-04.

**Location:** §3.4, PROP-EX-18; §5.1 REQ-NF-08 row.

**Issue:** PROP-EX-18 asserts `llm.model` and `llm.max_tokens` parsing. REQ-NF-08 covers the `agents[]` schema only — LLM config is a co-migrated schema concern but is not in any REQ-NF-08 acceptance criterion. Tracing PROP-EX-18 to REQ-NF-08 overstates the requirement scope.

**Required action (Low — editorial):** Change PROP-EX-18 source to `[TSPEC §5.2], [TSPEC §5.3]` with a note that this is a TSPEC-derived data integrity constraint for the schema migration, not a direct REQ-NF-08 acceptance criterion.

---

### F-07 — Low | Gap #1 Should Be Elevated to a Named Negative Property

**Status:** Unresolved from v1.1 F-08. Confirmed by PM F-07.

**Location:** §7 Gap #1; §4 Negative Properties.

**Issue:** Gap #1 (`postSystemMessage()` removal) is correctly identified as a risk in §7. Without a named property, the PLAN has no trackable DoD item for verifying the method is removed from the `ResponsePoster` protocol. The §7 suggestion of a "grep test" is fragile — it requires manual coordination with the test script author and produces no compile-time signal.

**Recommended action (Low — editorial):** Add:

> **PROP-DI-N05:** `ResponsePoster` protocol must NOT expose `postSystemMessage()` — the method must be absent from the interface definition and all implementing classes.
> — Sources: [TSPEC §4.2.2]; Test Level: Unit (TypeScript compile-time); Priority: P1

This converts Gap #1 from an open risk to a closed, trackable item.

---

### F-08 — Low | PROP-RP-08 and PROP-RP-N01 Are Near-Duplicates (New)

**Location:** §3.7 PROP-RP-08 (Security); §4 PROP-RP-N01 (Negative Properties).

**Issue:** Both properties assert that Discord-facing/posted error messages must not contain stack trace lines, exception class names, or raw API error payloads:

- **PROP-RP-08:** "Discord-facing error messages must NEVER contain stack trace lines..., exception class names..., or raw API response bodies"
- **PROP-RP-N01:** "Discord-posted error messages must NOT contain stack trace lines, exception class names, or raw API error payloads in any message field"

These are functionally equivalent assertions with nearly identical scope. The dual categorization (Security + Negative Properties) is a common pattern, but as written, PROP-RP-08 and PROP-RP-N01 are indistinguishable to a test author and will map to the same test case. This inflates the property count by one and could cause double-counting in the coverage matrix.

**Recommended action (Low — editorial):** Either:
1. Differentiate the scopes clearly — e.g., PROP-RP-08 asserts the function output object shape, PROP-RP-N01 asserts the final Discord-posted message field values (two distinct assert points in the test), with explicit wording to that effect; or
2. Remove PROP-RP-N01 from §4 and add a note in §3.7 that this security property doubles as the corresponding negative assertion.

If option 1 is chosen, no count change is needed. If option 2 is chosen, update the §2 Security count and total accordingly.

---

## Clarification Questions

### Q-01: PROP-EX-21 Test Level — Confirmed Integration (TE Position)

This is a closed question: from a test engineering standpoint, **Integration is the correct test level** for PROP-EX-21. The hot-reload path requires at least three collaborators wired together: (1) a FakeNodeConfigLoader that can trigger a reload event, (2) the composition root registry factory, and (3) DefaultRoutingEngine accepting the rebuilt registry. Unit-level isolation with individual fakes cannot verify the registry handoff. The BE has confirmed the same in Q-01. Integration is confirmed; no further discussion needed.

### Q-02: F-08 Deduplication Decision

The resolution of F-08 (PROP-RP-08 / PROP-RP-N01 near-duplicate) is editorial and does not block approval. However, the test author should receive explicit guidance on whether these map to one test case or two distinct assert points. Please clarify intent before the PLAN is drafted so the test script table doesn't list duplicate test entries for the same behavior.

---

## Positive Observations

- **F-03 (branch issue) resolved promptly.** The document landing on `feat-007-polish` means the full traceability chain is intact: REQ → FSPEC → TSPEC → PROPERTIES all on the same branch, readable by downstream agents in a single checkout.

- **Negative properties section (§4) is comprehensive and precise.** Nine negative properties across four domains — particularly PROP-LG-N01 (no manual prefix at call sites) and PROP-LG-N02 (no Component type redefinition) — encode the exact class of accidental refactoring regressions that unit tests without explicit hooks cannot catch.

- **PROP-LG-06 (shared FakeLogStore) is the right foundational design.** Making the shared store a named property forces the PLAN author to implement FakeLogger correctly before any observability test can pass. Without this property, per-component log isolation would silently render PROP-DI-21's EVT-OB-01..10 lifecycle trace invisible from a single assertion point.

- **Security cluster PROP-RP-08/09/10 provides three-layer defense.** The output shape constraint (RP-08), function signature constraint (RP-09), and name-sourcing rule (RP-10) together prevent stack trace leakage even under accidental caller misuse — well-designed protection that covers both the function contract and its call sites.

- **Zero E2E tests is well-justified.** §6's rationale is precise: all observable Phase 7 behaviors are verifiable through the rich TSPEC §9.2 fake infrastructure. PROP-DI-21 provides the single integration test that covers full lifecycle assembly without real I/O. The pyramid reasoning is sound and the E2E justification is explicit, not just absent.

- **§7 gaps are self-identified at exactly the right time.** Surfacing the hot-reload gap, the postSystemMessage() removal gap, and the 2000-char chunking edge cases before the PLAN is written means no surprise test gaps at implementation review. This is exactly when these should appear.

---

## Recommendation

**Needs revision.**

Two Medium findings must be resolved before this document is approved:

- **F-01** — Fix property count: §2 Functional (32 → 33), §6 Unit count and total. Coordinate with F-02 in a single pass — final grand total after both fixes = **71**.
- **F-02** — Add PROP-EX-21 (hot-reload integration property); update §2 Integration (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 pyramid.

Low-severity findings (F-03 through F-08) should be addressed in the same revision pass.

**Previously blocking F-03 (wrong branch) is RESOLVED** — the document is on `feat-007-polish`.

Once F-01 and F-02 are resolved, this document can be approved without further TE review — the structure, coverage, property derivation, and test pyramid rationale are all sound.

**Required before approval:**
- [ ] Add PROP-EX-21 (Integration, P1); update §2 Integration (3 → 4), §5.1, §5.2, §6 [F-02]
- [ ] Fix §2 Functional count (32 → 33); fix §6 Unit (66 → 67) and grand total (69 → 71 after both fixes) [F-01]

**Recommended (Low severity — same pass):**
- [ ] Fix section numbering §3.7→§3.6, §3.8→§3.7, §3.9→§3.8 (or add §3.6 placeholder) [F-03]
- [ ] Remove redundant `PROP-EX-12..19` range from §5.1 and §5.2 [F-04]
- [ ] Clarify PROP-EX-17 to specify silent schema drop, not throw [F-05]
- [ ] Retrace PROP-EX-18 source to TSPEC §5.2/5.3, not REQ-NF-08 [F-06]
- [ ] Elevate Gap #1 to named negative property PROP-DI-N05 [F-07]
- [ ] Clarify or deduplicate PROP-RP-08 vs PROP-RP-N01 [F-08]
