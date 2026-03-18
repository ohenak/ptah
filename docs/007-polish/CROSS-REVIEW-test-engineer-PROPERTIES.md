# Cross-Review: Test Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-product-manager-PROPERTIES.md`, `CROSS-REVIEW-backend-engineer-PROPERTIES.md` |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One (Confirming BE F-01)

**Location:** §2 Property Summary table (Functional row, Total); §6 Test Level Distribution table.

**Issue:** Counting §3.1 sub-sections directly yields **33 Functional properties** (Thread Archiving: 8, Embed Formatting: 7, Config-Driven Extensibility: 11, Structured Logging: 3, Error Message UX: 4), not 32 as reported in §2. Grand total is therefore **70**, not 69. This propagates to §6 (Unit count 66 → 67, Total 69 → 70).

The PLAN's Definition of Done will be derived from the §2 total. A gate set at 69 means one property will be permanently untracked in the completion check.

**Required action:** Correct §2 Functional count to 33 and Total to 70. Correct §6 Unit count to 67 and Total to 70. Identify the one property that caused the off-by-one (likely a miscounting of the Config-Driven Extensibility sub-group: PROP-EX-01 through PROP-EX-11 = 11 properties, not 10).

---

### F-02 — Medium | Missing PROP-EX-21 — Hot-Reload Registry Rebuild Path Not Covered (Confirming PM F-01)

**Location:** §7 Gap #3; REQ-NF-08 acceptance criteria (`"registered at next startup (or on config hot-reload)"`).

**Issue:** The document self-identifies this gap at Medium risk. REQ-NF-08's acceptance criterion AT-EX-01-08 explicitly covers the hot-reload path. Without a named integration property, the PLAN has no trackable DoD item for this acceptance test, and the engineer writing the test has no property ID to link back to.

The BE cross-review has confirmed (BE Q-01) that TSPEC OQ-TSPEC-01 is resolved — the architecture supports the hot-reload path — so this property is now technically feasible and unblocked.

**Required action:** Promote Gap #3 to a named property before this document is approved:

> **PROP-EX-21:** After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; **Test Level: Integration**; Priority: P1

Rationale for Integration test level: this property requires wiring `NodeConfigLoader` (file-watch trigger), the registry factory (rebuild), and `DefaultRoutingEngine` together. It cannot be verified in a single unit with fakes alone. Update §2 Integration count (3 → 4) and Total (70 → 71), update §5.1 REQ-NF-08 row and §5.2 FSPEC-EX-01 row, and update §6 Integration count and pyramid.

---

### F-03 — Medium | Document Lives on Wrong Branch — `feat-polish` vs `feat-007-polish`

**Location:** Git history — the PROPERTIES document was committed to `feat-polish`, while REQ, FSPEC, TSPEC, and PLAN all live on `feat-007-polish`.

**Issue:** All downstream agents (engineer for implementation, orchestrator for PDLC state transitions) read from `feat-007-polish`. A PROPERTIES document on a diverged branch is invisible to those agents. The PLAN test scripts will be written without the PROPERTIES file as live context, which defeats the traceability chain.

This is a blocking administrative finding — not a content issue, but it prevents the document from functioning in the pipeline.

**Required action:** Cherry-pick or copy the PROPERTIES document (with all revisions applied) to `feat-007-polish` and push. `feat-polish` can be left as-is or cleaned up separately. All future revisions to this document must target `feat-007-polish`.

---

### F-04 — Low | Section Numbering Gap — §3.6 Missing (Confirming PM F-02)

**Location:** §3 Properties, section headers.

**Issue:** The document jumps from `3.5 Integration Properties` to `3.7 Security Properties`, skipping §3.6. The properties template defines nine categories (Functional, Contract, Error Handling, Data Integrity, Integration, **Performance**, Security, Idempotency, Observability). Performance has no properties in Phase 7, so the section was omitted — but the numbers weren't adjusted. This creates a broken navigation anchor.

**Required action:** Either renumber `3.7 → 3.6`, `3.8 → 3.7`, `3.9 → 3.8` and update all section cross-references; or add a `3.6 Performance Properties — None` placeholder with a note explaining why performance testing is deferred.

---

### F-05 — Low | Redundant Sub-Range in §5.1 REQ-NF-08 Row (Confirming BE F-02)

**Location:** §5.1 Requirement Coverage, REQ-NF-08 Properties column.

**Issue:** The cell reads `PROP-EX-01..20, PROP-EX-12..19, PROP-LG-06, PROP-DI-21`. The range `PROP-EX-12..19` is fully subsumed by `PROP-EX-01..20`. The same redundant range appears in §5.2 FSPEC-EX-01 row.

**Required action:** Remove the redundant `PROP-EX-12..19` range from both §5.1 and §5.2.

---

### F-06 — Low | PROP-EX-17 Failure Mode Is Ambiguous for Test Authoring (Confirming BE F-03)

**Location:** §3.4, PROP-EX-17.

**Issue:** `"reject (or not parse)"` is a disjunction between two test implementations:
- **Throw on invalid schema** → `expect(fn).rejects.toThrow(...)`
- **Silently omit unknown keys** → `expect(result.value.agents).not.toHaveProperty('active')`

Given that TSPEC §5.1/5.3 describes a hard cut-over with no backward-compat shim, the correct behavior is silent omission (Zod strict schema drops unknown keys). An engineer reading this property as written would not know which assertion to use.

**Required action (Low — editorial):** Rewrite to be unambiguous:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser, not thrown."

---

### F-07 — Low | PROP-EX-18 Traceability to REQ-NF-08 Is Misleading (Confirming PM F-03)

**Location:** §3.4, PROP-EX-18; §5.1 REQ-NF-08 row.

**Issue:** PROP-EX-18 asserts `llm.model` and `llm.max_tokens` parsing. REQ-NF-08 covers `agents[]` schema — LLM config is a co-migrated concern, but not mentioned in the REQ-NF-08 AC. Tracing PROP-EX-18 to REQ-NF-08 overstates the requirement scope and could confuse the PLAN author verifying requirement coverage.

**Required action (Low — editorial):** Trace PROP-EX-18 source to `[TSPEC §5.2], [TSPEC §5.3]` as a companion schema migration constraint, with a note that this is a TSPEC-derived data integrity constraint rather than a direct REQ-NF-08 acceptance criterion.

---

### F-08 — Low | Gap #1 Should Be Elevated to a Named Negative Property

**Location:** §7 Gap #1; §4 Negative Properties.

**Issue:** Gap #1 (`postSystemMessage()` removal) is correctly identified as a risk, and the document recommends either a new negative property or a grep/compile check. Without a named property (e.g., `PROP-DI-N05`), the PLAN has no trackable DoD item for verifying the method is removed from the `ResponsePoster` protocol. Compile-time checks on protocol changes are only reliable if the protocol interface is updated — a runtime grep is fragile.

**Recommended action (Low — editorial):** Add:

> **PROP-DI-N05:** `ResponsePoster` protocol must NOT expose `postSystemMessage()` — the method must be absent from the interface definition and all implementing classes.
> — Sources: [TSPEC §4.2.2]; Test Level: Unit (TypeScript compile-time); Priority: P1

This converts Gap #1 from an open risk to a closed, trackable item.

---

## Clarification Questions

### Q-01: Confirm PROP-EX-21 Test Level = Integration

This is an answer, not a question: from a test engineering standpoint, **Integration is the correct test level** for the hot-reload property. It requires at minimum: (1) a FakeNodeConfigLoader that can trigger a reload event, (2) the composition root registry factory, and (3) DefaultRoutingEngine accepting the rebuilt registry. These three collaborators must be wired together — unit-level isolation with individual fakes would not verify the registry handoff. This confirms BE Q-01.

### Q-02: Canonical Branch for PROPERTIES Revisions

To avoid a repeat of the `feat-polish` divergence: all revisions to this document should target `feat-007-polish`. Is there a standing decision on whether `feat-polish` should be merged into `feat-007-polish` or abandoned?

---

## Positive Observations

- **Self-identified gaps demonstrate strong test engineering discipline.** §7 calls out three gaps (including the medium-risk hot-reload path) before the PLAN is written. This is exactly the right time to surface them — not after the test scripts are drafted.

- **Negative properties section (§4) is comprehensive and precise.** Nine negative properties across four domains — including the subtle `PROP-LG-N01` (no manual component prefix at call sites) and `PROP-LG-N02` (no type redefinition) — encode invariants that are easy to accidentally violate during refactoring and hard to catch without explicit test hooks.

- **Integration property PROP-LG-06 (shared FakeLogStore) is the right foundational design.** Making the shared store a named property means the PLAN author must implement the FakeLogger correctly before any observability test can pass. Without this property, component-log isolation would silently make PROP-DI-21's lifecycle trace invisible from a single assertion point.

- **Security properties (PROP-RP-08/09/10) form a complete three-layer defense.** Output shape, function signature constraint, and name-sourcing rules together prevent stack trace leakage even under accidental caller misuse. This is a well-designed property cluster.

- **Zero E2E tests justified well.** The §6 rationale is precise: all observable behaviors in Phase 7 are verifiable via the TSPEC §9.2 fakes, and PROP-DI-21 provides the single integration test that covers full lifecycle assembly. The pyramid reasoning is sound.

---

## Recommendation

**Needs revision.**

Three Medium findings must be resolved before this document can be approved:

- **F-01:** Fix §2 Functional count (32 → 33), Total (69 → 70), §6 Unit count (66 → 67), Total (69 → 70).
- **F-02:** Add PROP-EX-21 (hot-reload integration property) — confirm Integration as test level (answered: yes, Integration).
- **F-03:** Move the PROPERTIES document to `feat-007-polish` before downstream agents begin PLAN execution.

Low-severity findings (F-04 through F-08) should be addressed in the same revision pass for document quality. Once F-01 through F-03 are resolved and the document is on the canonical branch, this document can be approved without further QA review — the structure, coverage, and test pyramid rationale are all sound.

**Required before approval:**
- [ ] Fix §2 Functional count (32 → 33) and Total (69 → 70)
- [ ] Fix §6 Unit count (66 → 67) and Total (69 → 70)
- [ ] Add PROP-EX-21 (Integration, P1); update §2 Integration (3 → 4), §5.1, §5.2, §6
- [ ] Move / cherry-pick document to `feat-007-polish` and push

**Recommended (Low severity — same pass):**
- [ ] Fix section numbering §3.7→§3.6, §3.8→§3.7, §3.9→§3.8 (F-04)
- [ ] Remove redundant `PROP-EX-12..19` range from §5.1 and §5.2 (F-05)
- [ ] Clarify PROP-EX-17 to specify silent schema drop, not throw (F-06)
- [ ] Clarify PROP-EX-18 source — TSPEC §5.2/5.3, not REQ-NF-08 (F-07)
- [ ] Elevate Gap #1 to named negative property PROP-DI-N05 (F-08)
