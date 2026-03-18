# Cross-Review: Backend Engineer — PROPERTIES (007-PROPERTIES-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer |
| **Document Reviewed** | `docs/007-polish/007-PROPERTIES-polish.md` v1.0 |
| **Review Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium | Property Count Discrepancy — §2 and §6 Under-Count by One

**Location:** §2 Property Summary table (Functional row); §6 Test Level Distribution table (Unit row and Total).

**Issue:** The §2 summary reports 32 Functional properties and a total of 69. Counting the properties as enumerated in §3.1 yields 33:

| Sub-category | Properties | Count |
|---|---|---|
| Thread Archiving | PROP-DI-01..08 | 8 |
| Embed Formatting | PROP-DI-09..15 | 7 |
| Config-Driven Extensibility | PROP-EX-01..11 | 11 |
| Structured Logging | PROP-LG-01..03 | 3 |
| Error Message UX | PROP-RP-01..04 | 4 |
| **Sub-total** | | **33** |

The grand total across all categories is therefore **70**, not 69:

| Category | Reported | Actual |
|---|---|---|
| Functional | 32 | **33** |
| Contract | 6 | 6 |
| Error Handling | 9 | 9 |
| Data Integrity | 4 | 4 |
| Integration | 3 | 3 |
| Security | 3 | 3 |
| Idempotency | 2 | 2 |
| Observability | 10 | 10 |
| **Total** | **69** | **70** |

This propagates to §6: the Unit test count should be **67** (not 66) and the total should be **70** (not 69). A test engineer using the §2 total as a Definition of Done completeness gate would stop at 69 and miss one property.

**Required action:** Identify the missing or mis-classified property and correct §2 Functional count to 33, §2 Total to 70, §6 Unit count to 67, §6 Total to 70.

---

### F-02 — Low | Coverage Matrix §5.1 REQ-NF-08 Row — Redundant Range and Missing Entries

**Location:** §5.1 Requirement Coverage, REQ-NF-08 row.

**Issue:** The Properties column reads `PROP-EX-01..20, PROP-EX-12..19, PROP-LG-06, PROP-DI-21`. The range `PROP-EX-12..19` is already fully subsumed within `PROP-EX-01..20` — it is a redundant sub-range that was likely left over from an incremental edit. The correct, non-redundant form should be:

> `PROP-EX-01..20, PROP-LG-06, PROP-DI-21`

This is an editorial error but could confuse the person verifying coverage at Plan completion.

**Required action:** Remove the redundant `PROP-EX-12..19` range from the REQ-NF-08 row. (No property changes needed — just the matrix notation.)

---

### F-03 — Low | PROP-EX-17 — "Reject (or not parse)" Is Ambiguous for Test Authoring

**Location:** §3.4, PROP-EX-17.

**Issue:** The property reads: "Config loader must parse the new `agents[]` array schema and reject (or not parse) the old flat `AgentConfig` object schema."

"Reject (or not parse)" is a disjunction between two fundamentally different behaviors:
- **Throw / return an error** — testable as `expect(fn).rejects.toThrow(...)` or `expect(result.error).toBeDefined()`
- **Silently ignore** — testable as `expect(result.value.agents).toBeUndefined()` or similar shape check

These require different test implementations. The TSPEC §5.1 and §5.3 describe the hard cut-over approach (no backward-compatibility shim), which implies the old schema is simply not parsed (keys are unknown / ignored by the new schema parser), not that it throws. However, the property as written leaves this ambiguous.

**Required action (Low — editorial):** Clarify the failure mode. If the old schema keys are silently dropped (correct for a hard cut-over with a strict schema parser like Zod), rewrite as:

> "Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object."

If the loader throws on encountering the old schema, rewrite accordingly.

---

## Clarification Questions

### Q-01: PROP-EX-21 Blocking Dependency — Confirm Test Level

The PM cross-review (F-01) correctly identifies PROP-EX-21 (hot-reload registry rebuild) as the blocking gap. I have confirmed from a technical standpoint that **TSPEC OQ-TSPEC-01 is fully resolved** — the composition root rebuilds the registry and updates the Orchestrator's registry reference on hot-reload, mirroring Phase 1 behavior. The proposed PROP-EX-21 is technically feasible and implementable.

One clarification: PROP-EX-21 should be classified as **Integration** test level (not Unit), since it requires:
1. A config hot-reload trigger (NodeConfigLoader file watcher)
2. Registry rebuild at the composition root
3. A subsequent routing decision against the new registry state
4. An ERR-RP-02 embed post to the thread

This cannot be tested in isolation with fakes alone — it requires wiring the `NodeConfigLoader`, registry factory, and `DefaultRoutingEngine` together. Please confirm Integration is the intended test level before adding the property.

---

## Positive Observations

- **PROP-LG-06 (shared FakeLogStore) is the standout test double design property.** Asserting that `FakeLogger.forComponent()` shares a root store rather than creating isolated instances is a subtle but critical cross-cutting concern. Without this property, the integration observability test (PROP-DI-21) would silently produce per-component log isolation and the full EVT-OB-01..10 trace would be invisible from a single assertion point.

- **PROP-RP-09 (pure function constraint on `buildErrorMessage()`)** is an excellent pre-emptive guardrail. Encoding it as a property that governs the function signature — not just the output — prevents the common mistake of passing raw `Error` objects and accidentally surfacing stack traces through indirect string interpolation.

- **PROP-EX-21 (proposed) is technically sound.** Now that TSPEC OQ-TSPEC-01 is resolved, the architecture supports the hot-reload registry rebuild. The PM's proposed property wording is accurate and aligns with the TSPEC decision (in-flight invocations complete with the pre-reload snapshot; de-registration for in-flight is out of scope).

- **Negative Properties (§4) are precisely targeted.** PROP-DI-N04 (embed colors not configurable per-agent) and PROP-LG-N02 (Component type not redefined in logger.ts) operationalize architectural invariants that TypeScript's type system enforces at compile time but that should still be explicitly named in properties for test coverage traceability.

- **PROP-OB-12 "error-originating component" is intentionally open.** The TSPEC §9 explicitly uses "n" (per-component) for EVT-OB-10, meaning each module that can fail must emit the error event. The property wording correctly reflects this design choice — no change needed.

---

## Recommendation

**Needs revision.**

The document is well-structured and technically sound across all six requirement domains. The single blocking finding is F-01: the property count in §2 and §6 is off by one (69 reported vs. 70 actual), which will cause a completeness gap in the Plan's Definition of Done gate. This must be resolved before the document is approved, as the PLAN's DoD checklist will be derived from the PROPERTIES total.

F-02 and F-03 are editorial and can be addressed in the same pass.

**Required before approval:**
- [ ] Fix §2 Functional count (32 → 33) and Total (69 → 70)
- [ ] Fix §6 Unit count (66 → 67) and Total (69 → 70)
- [ ] Correct REQ-NF-08 coverage matrix row (remove redundant `PROP-EX-12..19` range) [F-02]
- [ ] Also address PM cross-review F-01 (add PROP-EX-21, update coverage matrix) per PM review — confirm Integration test level per Q-01

**Optional (Low severity):**
- [ ] Clarify PROP-EX-17 failure mode wording [F-03]
- [ ] Fix §3.6 numbering gap per PM cross-review F-02
