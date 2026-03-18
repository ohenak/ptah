# Cross-Review: Product Manager — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium | Gap #3 (Hot-Reload) is Self-Identified but Unresolved — REQ-NF-08 Acceptance Criterion Not Fully Covered

**Location:** §7 Gaps, item #3; REQ-NF-08 acceptance criteria.

**Issue:** The REQ-NF-08 acceptance criterion explicitly states the agent must be registered **"at next startup (or on config hot-reload)"** — hot-reload is a first-class, stated product requirement, not an implementation detail. The PROPERTIES document itself acknowledges in §7 that no property covers this path and rates it Medium risk.

Without a property asserting that `DefaultRoutingEngine` treats a hot-reload-removed agent as unknown (and posts ERR-RP-02), the REQ-NF-08 acceptance criterion cannot be verified by the test suite. This is a gap against an explicit product requirement.

**Required action:** Add the property recommended in §7 Gap #3 before this document is approved:

> **PROP-EX-21 (proposed):** After a config hot-reload that removes an agent from the `agents[]` array, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread.
> — Sources: [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08]; Test Level: Integration; Priority: P1

Once added, update the coverage matrix (§5.1 REQ-NF-08 row, §5.2 FSPEC-EX-01 row) and the property count totals.

---

### F-02 — Low | Section Numbering Gap: §3.6 is Missing

**Location:** §3 Properties, section headers.

**Issue:** The section sequence jumps from `3.5 Integration Properties` directly to `3.7 Security Properties`, skipping `3.6`. This is an editorial error that makes the document harder to navigate and reference.

**Required action:** Renumber `3.7 Security Properties → 3.6` and `3.8 Idempotency Properties → 3.7` and `3.9 Observability Properties → 3.8`, or insert a placeholder `3.6 (reserved)` note if the gap was intentional.

---

### F-03 — Low | PROP-EX-18 Traceability Gap: LLM Config Parsing is Not in REQ-NF-08 Acceptance Criteria

**Location:** §3.4 PROP-EX-18; §5.1 Coverage Matrix REQ-NF-08 row.

**Issue:** PROP-EX-18 asserts that the config loader parses `llm.model` and `llm.max_tokens` from the top-level `llm` config section. This is sourced to REQ-NF-08 and TSPEC §5.2/5.3. However, REQ-NF-08 focuses exclusively on the `agents[]` array schema — LLM configuration is a co-migrated schema change but is not mentioned in the REQ-NF-08 acceptance criteria. The property is correct behavior, but its traceability to REQ-NF-08 is misleading.

**Required action (Low — editorial):** One of:
- Add a note to PROP-EX-18 clarifying this is a companion schema migration requirement (sourced from TSPEC §5.2 as a data-integrity constraint on the config migration, not from the REQ-NF-08 AC); or
- Trace PROP-EX-18 to PROP-EX-17 (config schema migration integrity) with a footnote noting it is a TSPEC-derived constraint.

This does not require a re-review — the property itself is correct and should be retained; only the traceability label needs clarification.

---

## Clarification Questions

### Q-01: Branch Discrepancy — feat-polish vs. feat-007-polish

The PROPERTIES document was committed to `feat-polish`, while the upstream REQ, FSPEC, and TSPEC live on `feat-007-polish`. These two branches have diverged. Is `feat-polish` the intended canonical branch for this feature going forward, or should the PROPERTIES document be cherry-picked or merged into `feat-007-polish`? This may affect how the orchestrator assembles context for downstream tasks.

---

## Positive Observations

- **Comprehensive property coverage.** 69 properties across 6 domains covering all 6 P1 requirements. The 1:1 mapping from FSPEC-OB-01's 10 lifecycle events (EVT-OB-01 through EVT-OB-10) to PROP-OB-03 through PROP-OB-12 is exactly what operator observability verification requires.

- **Negative properties section is a standout.** §4 explicitly encodes what the system must NOT do — no archiving on non-terminal signals (PROP-DI-N01), no embeds for agent responses (PROP-DI-N03), no manual component prefix injection (PROP-LG-N01), no stack traces in user-facing output (PROP-RP-N01). These are precisely the classes of accidental regressions that are hardest to catch without explicit properties.

- **Security properties operationalize the requirement well.** PROP-RP-08, PROP-RP-09, PROP-RP-10 translate the REQ-RP-06 intent ("no stack traces or raw API payloads in Discord output") into three complementary invariants — output shape, function input signature constraint, and display name sourcing. This three-pronged approach ensures the intent can't be defeated by a partial implementation.

- **Self-identified gaps demonstrate maturity.** §7 naming two Low and one Medium gap before the PLAN is written reflects well on the test engineering process. This review validates those gap assessments and their recommended remediations.

- **Idempotency and data integrity properties** for REQ-NF-08 (registry immutability post-construction, PROP-EX-20) and REQ-DI-06 (double-archive prevention via registry short-circuit, PROP-DI-22) are precisely targeted and testable.

---

## Recommendation

**Needs revision.**

The document is well-structured and provides thorough coverage across all six requirement domains. The single blocking issue is the missing hot-reload property (F-01 / Gap #3), which directly corresponds to a stated product requirement acceptance criterion (REQ-NF-08). The Test Engineer has already identified this gap — it simply needs to be resolved by adding the property before the document can be approved.

Once F-01 is addressed, the section numbering corrected (F-02), and Q-01 answered, this document should be approved without further PM review. The F-03 traceability clarification can be addressed at the author's discretion.

**Required before approval:**
- [ ] Add PROP-EX-21 (hot-reload registry rebuild property) per Gap #3 recommendation
- [ ] Update coverage matrix (§5.1, §5.2) to include PROP-EX-21
- [ ] Fix section numbering (§3.6 gap)

**Optional (Low severity):**
- [ ] Clarify PROP-EX-18 traceability to REQ-NF-08
