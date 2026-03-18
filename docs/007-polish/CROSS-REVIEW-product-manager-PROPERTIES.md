# Cross-Review: Product Manager — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Upstream Reviews Considered** | `CROSS-REVIEW-backend-engineer-PROPERTIES.md`, `CROSS-REVIEW-test-engineer-PROPERTIES.md` |
| **Review Version** | v1.1 (updated after BE and TE cross-reviews) |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium | Gap #3 (Hot-Reload) is Self-Identified but Unresolved — REQ-NF-08 Acceptance Criterion Not Fully Covered

**Location:** §7 Gaps, item #3; REQ-NF-08 acceptance criteria.

**Issue:** The REQ-NF-08 acceptance criterion explicitly states the agent must be registered **"at next startup (or on config hot-reload)"** — hot-reload is a first-class, stated product requirement, not an implementation detail. The PROPERTIES document itself acknowledges in §7 that no property covers this path and rates it Medium risk.

Without a property asserting that `DefaultRoutingEngine` treats a hot-reload-removed agent as unknown (and posts ERR-RP-02), the REQ-NF-08 acceptance criterion cannot be verified by the test suite. This is a gap against an explicit product requirement.

The BE and TE cross-reviews confirm this is now unblocked: TSPEC OQ-TSPEC-01 is resolved, and the test level should be **Integration** (requires wiring `NodeConfigLoader`, registry factory, and `DefaultRoutingEngine` together — TE Q-01 answered this definitively).

**Required action:** Add the following property before this document is approved:

> **PROP-EX-21:** After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; **Test Level: Integration**; Priority: P1

Once added: update §2 Integration count (3 → 4) and Total accordingly; update §5.1 REQ-NF-08 row and §5.2 FSPEC-EX-01 row; update §6 pyramid.

---

### F-02 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One

**Location:** §2 Property Summary table (Functional row, Total); §6 Test Level Distribution table.

**Issue:** *(Confirmed by BE F-01 and TE F-01.)* Counting §3.1 sub-sections directly yields **33 Functional properties** (Thread Archiving: 8, Embed Formatting: 7, Config-Driven Extensibility: 11, Structured Logging: 3, Error Message UX: 4), not 32 as reported in §2. The grand total is therefore **70**, not 69. This propagates to §6: Unit count should be **67** (not 66) and Total should be **70** (not 69).

The PLAN's Definition of Done gate will be derived from the §2 total. A gate set at 69 means one property will be permanently untracked in the completion check — a DoD correctness failure.

**Required action:** Identify the miscounted property (likely in Config-Driven Extensibility, where PROP-EX-01..11 = 11 entries, not 10), correct §2 Functional count to 33 and Total to 70, correct §6 Unit count to 67 and Total to 70.

> **Note:** After F-01 (PROP-EX-21) is also added, the corrected totals become: Integration count 3 → 4, grand total 70 → 71. Address both corrections in a single pass.

---

### F-03 — Medium | Document Lives on Wrong Branch — `feat-polish` vs `feat-007-polish`

**Location:** Git history.

**Issue:** *(Escalated from PM v1.0 Q-01; confirmed as blocking by TE F-03.)* The PROPERTIES document was committed to `feat-polish`/`main`, while the REQ, FSPEC, TSPEC, and PLAN all live on `feat-007-polish`. This is a blocking pipeline issue, not merely an editorial concern:

- All downstream agents read from `feat-007-polish`. The PROPERTIES file is invisible to them on the diverged branch.
- The PLAN test scripts will be drafted without the PROPERTIES document as live context.
- The orchestrator's PDLC state machine tracks phase transitions on `feat-007-polish` — a PROPERTIES document on a diverged branch breaks the state machine's ability to detect the Approve step.

**Required action:** Cherry-pick or copy the PROPERTIES document (with all revisions from this review pass applied) to `feat-007-polish` and push. All future revisions must target `feat-007-polish`. `feat-polish` can be left as-is or abandoned.

---

### F-04 — Low | Section Numbering Gap: §3.6 is Missing

**Location:** §3 Properties, section headers.

**Issue:** *(Confirmed by TE F-04.)* The section sequence jumps from `3.5 Integration Properties` directly to `3.7 Security Properties`, skipping `3.6`. The template defines a Performance section at position 3.6; Phase 7 has no performance properties, but the numbers were not adjusted when the section was omitted.

**Required action:** Either renumber `3.7 Security → 3.6`, `3.8 Idempotency → 3.7`, `3.9 Observability → 3.8`; or insert a `3.6 Performance Properties` placeholder with a one-line note explaining why no performance tests are warranted for Phase 7.

---

### F-05 — Low | PROP-EX-18 Traceability Gap: LLM Config Parsing is Not in REQ-NF-08 Acceptance Criteria

**Location:** §3.4 PROP-EX-18; §5.1 Coverage Matrix REQ-NF-08 row.

**Issue:** *(Confirmed by TE F-07.)* PROP-EX-18 asserts that the config loader parses `llm.model` and `llm.max_tokens`. REQ-NF-08 focuses exclusively on the `agents[]` array schema — LLM configuration is a co-migrated schema change but is not mentioned in the REQ-NF-08 acceptance criteria. Tracing PROP-EX-18 to REQ-NF-08 overstates the requirement scope.

**Required action (Low — editorial):** Retrace PROP-EX-18 source to `[TSPEC §5.2], [TSPEC §5.3]` as a companion schema migration data-integrity constraint, with a note that this is a TSPEC-derived constraint rather than a direct REQ-NF-08 acceptance criterion.

---

### F-06 — Low | PROP-EX-17 Failure Mode Is Ambiguous for Test Authoring

**Location:** §3.4 PROP-EX-17.

**Issue:** *(Confirmed by BE F-03 and TE F-06.)* "Reject (or not parse)" is a disjunction between two fundamentally different test implementations: `expect(fn).rejects.toThrow(...)` (hard rejection) vs. `expect(result.value).not.toHaveProperty('active')` (silent omission). Per TSPEC §5.1/5.3, the correct behavior is silent key omission by the Zod schema parser — not a thrown error.

**Required action (Low — editorial):** Rewrite to be unambiguous:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser."

---

### F-07 — Low | Redundant Sub-Range in §5.1 REQ-NF-08 Coverage Row

**Location:** §5.1 Requirement Coverage, REQ-NF-08 Properties column; §5.2 FSPEC-EX-01 row.

**Issue:** *(Confirmed by BE F-02 and TE F-05.)* The cell reads `PROP-EX-01..20, PROP-EX-12..19, PROP-LG-06, PROP-DI-21`. The sub-range `PROP-EX-12..19` is fully subsumed by `PROP-EX-01..20`. The same redundant range appears in §5.2.

**Required action:** Remove the redundant `PROP-EX-12..19` sub-range from both §5.1 and §5.2.

---

## Clarification Questions

*None — all questions from the v1.0 review have been answered by the BE and TE cross-reviews.*

- **Q-01 (branch discrepancy):** Escalated to F-03. The canonical branch is `feat-007-polish`. `feat-polish` should be considered abandoned.
- **PROP-EX-21 test level:** Integration is confirmed (BE Q-01, TE Q-01 both answer: yes, Integration).

---

## Positive Observations

- **Comprehensive property coverage.** 69 properties (70 after count correction) across 6 domains covering all 6 P1 requirements. The 1:1 mapping from FSPEC-OB-01's 10 lifecycle events (EVT-OB-01 through EVT-OB-10) to PROP-OB-03 through PROP-OB-12 is exactly what operator observability verification requires.

- **Negative properties section is a standout.** §4 explicitly encodes what the system must NOT do — no archiving on non-terminal signals (PROP-DI-N01), no embeds for agent responses (PROP-DI-N03), no manual component prefix injection (PROP-LG-N01), no stack traces in user-facing output (PROP-RP-N01). These are precisely the classes of accidental regressions that are hardest to catch without explicit properties.

- **Security properties operationalize the requirement well.** PROP-RP-08, PROP-RP-09, PROP-RP-10 translate the REQ-RP-06 intent ("no stack traces or raw API payloads in Discord output") into three complementary invariants — output shape, function input signature constraint, and display name sourcing. This three-pronged approach ensures the intent can't be defeated by a partial implementation.

- **Self-identified gaps in §7 demonstrate maturity.** The document correctly names three gaps before the PLAN is written. All three cross-reviewers validate those assessments — this approach is working as intended.

- **Integration property PROP-LG-06 (shared FakeLogStore)** is the right foundational design for the full lifecycle observability test. Without this property, per-component log isolation would silently make the EVT-OB-01..10 trace invisible from a single assertion point.

---

## Recommendation

**Needs revision.**

Three Medium findings must be resolved before this document can be approved:

1. **F-01** — Add PROP-EX-21 (hot-reload Integration property); update §2, §5.1, §5.2, §6.
2. **F-02** — Fix property count discrepancy: §2 Functional (32 → 33), §2 Total and §6 totals corrected. Address F-01 and F-02 count updates in a single pass — the final corrected total is **71** (70 after count fix, +1 for PROP-EX-21).
3. **F-03** — Move the PROPERTIES document to `feat-007-polish` (with all revisions applied) before downstream agents begin PLAN execution.

Low-severity findings (F-04 through F-07) should be addressed in the same revision pass.

Once F-01 through F-03 are resolved and the document is on the canonical branch, this document can be approved without further PM review. The structure, coverage rationale, and test pyramid reasoning are sound.

**Required before approval:**
- [ ] Add PROP-EX-21 (Integration, P1); update §2 Integration (3 → 4), §5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row, §6 pyramid
- [ ] Fix §2 Functional count (32 → 33) and correct all totals (grand total → 71 after both fixes)
- [ ] Fix §6 Unit count (66 → 67) and grand total (69 → 71)
- [ ] Move / cherry-pick document to `feat-007-polish` and push

**Recommended (Low severity — same pass):**
- [ ] Fix section numbering §3.7→§3.6, §3.8→§3.7, §3.9→§3.8 [F-04]
- [ ] Clarify PROP-EX-18 source — TSPEC §5.2/5.3, not REQ-NF-08 [F-05]
- [ ] Clarify PROP-EX-17 to specify silent schema drop, not throw [F-06]
- [ ] Remove redundant `PROP-EX-12..19` range from §5.1 and §5.2 [F-07]
