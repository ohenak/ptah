# Cross-Review: Backend Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-product-manager-PROPERTIES.md` v1.3, `CROSS-REVIEW-test-engineer-PROPERTIES.md` v1.2 |
| **Review Version** | v1.2 (re-review — document remains at v1.0; no revisions committed since initial commit) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Status Update from v1.1

**Document not revised.** The PROPERTIES document was committed once at `79f2f7f` (v1.0) and has not been updated. All findings from v1.1 remain unresolved. This v1.2 review consolidates all prior findings from BE v1.1, PM v1.3, and TE v1.2, adds new findings surfaced by cross-review alignment, and confirms my prior Q-01 (PROP-EX-21 test level) is closed.

---

## Findings

### F-01 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One

**Status:** Unresolved from v1.1 F-01. Independently confirmed by PM F-02 and TE F-01.

**Location:** §2 Property Summary table (Functional row, Total); §6 Test Level Distribution table.

**Issue:** Counting §3.1 directly yields **33 Functional properties**, not 32 as reported. The off-by-one is in Config-Driven Extensibility: PROP-EX-01 through PROP-EX-11 = 11 entries, likely miscounted as 10 during drafting.

| Sub-category | Properties | Count |
|---|---|---|
| Thread Archiving | PROP-DI-01..08 | 8 |
| Embed Formatting | PROP-DI-09..15 | 7 |
| Config-Driven Extensibility | PROP-EX-01..11 | **11** |
| Structured Logging | PROP-LG-01..03 | 3 |
| Error Message UX | PROP-RP-01..04 | 4 |
| **Sub-total** | | **33** |

The grand total without PROP-EX-21 is **70** (not 69). After adding PROP-EX-21 (F-02), the grand total becomes **71**. The PLAN's Definition of Done gate is derived from this total — a gate at 69 means at least two properties (one from the count and one from F-02) will never be checked at completion.

**Required action:** Fix §2 Functional count (32 → 33). Address in a single pass with F-02 — final corrected grand total is **71**. Fix §6 Unit count (66 → 67), §6 Total (69 → 71).

---

### F-02 — Medium | Missing PROP-EX-21 — Hot-Reload Registry Rebuild Path Not Covered

**Status:** Unresolved. Confirmed as Medium by PM F-01 and TE F-02. My prior Q-01 (Integration test level) is now **closed** — Integration is confirmed correct.

**Location:** §7 Gap #3; REQ-NF-08 acceptance criterion AT-EX-01-08.

**Issue:** REQ-NF-08 explicitly covers config hot-reload as a first-class acceptance criterion: *"agent must be registered at next startup (or on config hot-reload)"*. The document self-identifies this as a Medium-risk gap in §7 but promotes no property to cover it. Without a named PROP-EX-21, the PLAN has no trackable DoD item for AT-EX-01-08.

TSPEC OQ-TSPEC-01 is **resolved**: the composition root rebuilds the registry and updates the Orchestrator's registry reference on hot-reload. The property is technically feasible. Integration is the correct test level — this cannot be verified with unit fakes alone. It requires wiring:
1. `NodeConfigLoader` (file-watch trigger)
2. Registry factory (rebuild path)
3. `DefaultRoutingEngine` (subsequent routing decision using the new registry state)

**Required action:** Add the following property to §3.5 Integration Properties:

> **PROP-EX-21:** After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; **Test Level: Integration**; Priority: P1

After adding PROP-EX-21: update §2 Integration count (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 Integration count and pyramid. Grand total after F-01 + F-02 corrections = **71**.

---

### F-03 — Low | Redundant Sub-Range in §5.1 REQ-NF-08 Coverage Row

**Status:** Unresolved from v1.1 F-02. Confirmed by PM F-06 and TE F-04.

**Location:** §5.1 Requirement Coverage, REQ-NF-08 row; §5.2 FSPEC-EX-01 row.

**Issue:** The cell reads `PROP-EX-01..20, PROP-EX-12..19, PROP-LG-06, PROP-DI-21`. The range `PROP-EX-12..19` is fully subsumed by `PROP-EX-01..20` — a redundant sub-range from an incremental edit. The same redundant notation appears in §5.2 FSPEC-EX-01 row.

**Required action:** Remove the redundant `PROP-EX-12..19` from both §5.1 and §5.2.

---

### F-04 — Low | PROP-EX-17 Failure Mode Is Ambiguous for Test Authoring

**Status:** Unresolved from v1.1 F-03. Confirmed by PM F-05 and TE F-05.

**Location:** §3.4, PROP-EX-17.

**Issue:** `"reject (or not parse)"` is a disjunction between two fundamentally different test implementations:
- **Throw on invalid schema:** `expect(fn).rejects.toThrow(...)`
- **Silently omit unknown keys:** `expect(result.value).not.toHaveProperty('active')`

Per TSPEC §5.1/5.3, the correct behavior is Zod strict schema dropping unknown keys silently — no throw. A test author reading the current wording would not know which assertion to write.

**Required action (Low — editorial):** Rewrite to be unambiguous:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser, not thrown."

---

### F-05 — Low | Section Numbering Gap — §3.6 Missing

**Status:** First flagged by PM v1.1 F-04 and TE v1.1 F-04. Carried to v1.2 by both. Not in my v1.1 review.

**Location:** §3 Properties, section headers.

**Issue:** The document jumps from `3.5 Integration Properties` to `3.7 Security Properties`, skipping §3.6. The template defines Performance at position 3.6. Phase 7 has no performance properties, but the numbering was not adjusted, creating a broken navigation anchor and a confusing gap for reviewers cross-referencing section numbers.

**Required action:** Either renumber `3.7 → 3.6`, `3.8 → 3.7`, `3.9 → 3.8` and update all cross-references; or insert a `3.6 Performance Properties — None` placeholder with a one-line note explaining why no performance testing is warranted for Phase 7.

---

### F-06 — Low | PROP-EX-18 Traceability to REQ-NF-08 Is Misleading

**Status:** First flagged by PM v1.2 F-04 and TE v1.2 F-06. Not in my v1.1 review.

**Location:** §3.4, PROP-EX-18; §5.1 REQ-NF-08 row.

**Issue:** PROP-EX-18 asserts that the config loader parses `llm.model` and `llm.max_tokens`. REQ-NF-08 covers the `agents[]` array schema exclusively — LLM config is a co-migrated schema concern but does not appear in any REQ-NF-08 acceptance criterion. Tracing PROP-EX-18 to REQ-NF-08 overstates the requirement scope and could cause a verification reviewer to erroneously conclude REQ-NF-08's acceptance gate includes LLM config verification.

**Required action (Low — editorial):** Change PROP-EX-18 source to `[TSPEC §5.2], [TSPEC §5.3]` with an explicit note that this is a TSPEC-derived data integrity constraint for the schema migration, not a direct REQ-NF-08 acceptance criterion. Remove PROP-EX-18 from the REQ-NF-08 §5.1 coverage row if it is not in an acceptance criterion.

---

### F-07 — Low | Gap #1 Should Be Elevated to Named Negative Property PROP-DI-N05

**Status:** First flagged by PM v1.2 F-07 and TE v1.2 F-07. Not in my v1.1 review.

**Location:** §7 Gap #1; §4 Negative Properties.

**Issue:** Gap #1 (`postSystemMessage()` removal) is correctly identified as a risk in §7 but no named property is promoted from it. Without a named property, the PLAN has no trackable DoD item verifying that this method is removed from the `ResponsePoster` protocol. The §7 suggestion of a "grep test in the PLAN" is fragile — it requires manual coordination with the test script author at PLAN time and produces no compile-time or test-runner signal.

From an engineering standpoint: TypeScript compile-time checks ARE the correct mechanism here. If `postSystemMessage` is removed from the `ResponsePoster` interface and any call site remains, `tsc` will fail. A named property that asserts the method is absent from the interface directly triggers this compile-time guarantee and makes the PLAN's DoD unambiguous.

**Recommended action (Low — editorial):** Add:

> **PROP-DI-N05:** `ResponsePoster` protocol must NOT expose `postSystemMessage()` — the method must be absent from the interface definition and all implementing classes.
> — Sources: [TSPEC §4.2.2]; Test Level: Unit (TypeScript compile-time); Priority: P1

This converts Gap #1 from an open risk to a closed, trackable item. Update §2 total accordingly (+1 Negative to §4 count).

---

### F-08 — Low | PROP-RP-08 and PROP-RP-N01 Are Near-Duplicates

**Status:** First flagged by TE v1.2 F-08. Adding BE technical perspective here.

**Location:** §3.7 PROP-RP-08 (Security); §4 PROP-RP-N01 (Negative Properties).

**Issue:** Both properties assert that Discord-facing/posted error messages must not contain stack trace lines, exception class names, or raw API error payloads:

- **PROP-RP-08:** "Discord-facing error messages must NEVER contain stack trace lines..., exception class names..., or raw API response bodies"
- **PROP-RP-N01:** "Discord-posted error messages must NOT contain stack trace lines, exception class names, or raw API error payloads in any message field"

As written, these map to identical test assertions and inflate the property count without providing distinct coverage. A test author will write the same `expect` statements for both.

**BE technical recommendation (Low — editorial):** Differentiate the two scopes explicitly to give each a distinct assert point:

- **PROP-RP-08 (Security):** asserts that `buildErrorMessage()` _output object_ fields never contain stack trace patterns — verified by unit tests on the function return value.
- **PROP-RP-N01 (Negative):** asserts that the _final Discord-posted message_ fields (after `postErrorReportEmbed()` processes the `ErrorMessage`) never contain stack trace patterns — verified by inspecting the `FakeDiscordClient.capturedEmbeds` in a `ResponsePoster` unit test.

These are two genuinely distinct assertion points (one on the builder function output, one on the embed fields as seen by Discord). If this distinction is the intent, add explicit scope language to each; if not, consolidate them into one property.

---

## Clarification Questions

### Q-01: PROP-EX-21 Test Level — CLOSED

**Confirmed Integration.** TSPEC OQ-TSPEC-01 is resolved; the architecture supports the hot-reload registry rebuild. Integration is the correct test level — unit fakes alone cannot verify the registry handoff across the NodeConfigLoader → registry factory → DefaultRoutingEngine chain. No further discussion needed.

---

## Positive Observations

- **PROP-LG-06 (shared FakeLogStore) is the standout test double design property.** Encoding this as a named property forces the PLAN author to implement `FakeLogger.forComponent()` with a shared store before any EVT-OB-01..10 lifecycle trace can pass. Without this property, per-component log isolation would silently make the PROP-DI-21 observability integration test invisible from a single assertion point.

- **PROP-RP-09 (pure function constraint on `buildErrorMessage()`)** encodes the function signature as a testable invariant. This is the right approach: by prohibiting `Error` objects as arguments at the property level, the design prevents the common mistake of accidentally surfacing stack traces through indirect string interpolation. This is harder to express as a runtime test than a signature constraint — naming it as a property correctly elevates it to an architectural contract.

- **Security cluster PROP-RP-08/09/10 provides three-layer defense.** Output shape (RP-08), function signature constraint (RP-09), and name-sourcing rule (RP-10) together prevent stack trace leakage under accidental caller misuse — covering both the function contract and its call sites.

- **Negative Properties (§4) are precisely targeted.** PROP-DI-N04 (embed colors not configurable per-agent) and PROP-LG-N02 (Component type not redefined in logger.ts) operationalize architectural invariants that TypeScript's type system enforces at compile time but that should still be named as properties for test coverage traceability. These are exactly the kinds of regressions that survive refactoring passes unnoticed without explicit hooks.

- **Zero E2E tests is well-justified.** §6's rationale is precise: all Phase 7 observable behaviors are verifiable through the TSPEC §9.2 fake infrastructure. PROP-DI-21 provides single integration test coverage for the full lifecycle assembly without real I/O. The E2E justification is explicit, not just absent — this is the right level of test pyramid reasoning.

- **§7 self-identified gaps are surfaced at exactly the right time** — before the PLAN is written. All three reviewers validated the assessments. The process is working as intended.

---

## Recommendation

**Needs revision.**

The document is well-structured and technically sound across all six requirement domains. Two Medium findings must be resolved before approval:

1. **F-01** — Fix property count: §2 Functional (32 → 33), §6 Unit and grand total. Address in a single pass with F-02 — final corrected grand total is **71**.
2. **F-02** — Add PROP-EX-21 (hot-reload Integration property, P1); update §2 Integration (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 pyramid.

Low-severity findings (F-03 through F-08) should be addressed in the same revision pass.

**Required before approval:**
- [ ] Add PROP-EX-21 (Integration, P1); update §2 Integration (3 → 4), §5.1, §5.2, §6 [F-02]
- [ ] Fix §2 Functional count (32 → 33); fix §6 Unit (66 → 67) and grand total (69 → 71 after both fixes) [F-01]

**Recommended (Low severity — same pass):**
- [ ] Remove redundant `PROP-EX-12..19` range from §5.1 and §5.2 [F-03]
- [ ] Clarify PROP-EX-17 to specify silent schema drop, not throw [F-04]
- [ ] Fix section numbering §3.7→§3.6, §3.8→§3.7, §3.9→§3.8 (or add §3.6 placeholder) [F-05]
- [ ] Retrace PROP-EX-18 source to TSPEC §5.2/5.3, remove from REQ-NF-08 coverage row [F-06]
- [ ] Elevate Gap #1 to named negative property PROP-DI-N05 [F-07]
- [ ] Differentiate or consolidate PROP-RP-08 vs PROP-RP-N01 per F-08 guidance [F-08]
