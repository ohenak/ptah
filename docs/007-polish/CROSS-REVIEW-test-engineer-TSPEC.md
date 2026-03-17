# Cross-Review: Test Engineer — TSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.1 |
| **REQ Reference** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reference** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

TSPEC v1.1 addresses all six findings and both clarification questions from the v1.0 review:

- **F-01 (Medium):** All three missing test files added to §3 project structure (`logger.test.ts`, `config-loader.test.ts`, `tests/integration/routing-loop.test.ts`) ✅
- **F-02 (Medium):** `AgentValidationError` fully defined in §4.2.3 with `{ index, agentId?, field, reason }` shape ✅
- **F-03 (Medium):** OQ-TSPEC-04 resolved with call-site audit — 4 of 6 `postProgressEmbed()` sites use `fromAgentDisplayName: 'Ptah'` fallback; PM-approved ✅
- **F-04 (Low):** `FakeLogger.forComponent()` now uses `Component` type ✅
- **F-05 (Low):** `EmbedType` removed from §3 types list ✅
- **F-06 (Low):** EVT-OB-01 and EVT-OB-08 truncation boundary test cases explicitly added to §9.3 ✅
- **Q-01:** FakeLogger usage example (Option B — root + forComponent) added to §9.2 ✅
- **Q-02:** Integration test scope clarified in §9.3 — all external boundaries faked via §9.2 test doubles; `buildAgentRegistry()` called with real in-memory `AgentEntry[]` ✅

One Low-severity finding remains from the v1.1 amendments. It is non-blocking — the TSPEC is **approved** for PROPERTIES derivation and engineering handoff.

---

## Findings

### F-07 (Low) — `fromAgentDisplayName: 'Ptah'` fallback test case not captured in §9.3

**Affected:** §12 OQ-TSPEC-04 resolution, §9.3 ResponsePoster unit test description

The OQ-TSPEC-04 resolution in §12 states:

> "Additional test case required in `response-poster.test.ts`: assert `fromAgentDisplayName: 'Ptah'` renders correctly in the Routing Notification embed."

However, §9.3's ResponsePoster unit test description reads:

> "4 embed type schemas (color, title, footer), plain-text agent response, embed fallback to plain, truncation"

The `fromAgentDisplayName: 'Ptah'` fallback case is not explicitly enumerated. An engineer reading only §9.3 would not know to add this test case. The requirement is documented in §12 (OQ-TSPEC-04 resolution), but §9.3 is the canonical reference for test file scope.

**Testing impact:** Low — the requirement is traceable from §12. An engineer reading the full TSPEC will find it. No behavioral specification is missing; this is a cross-section consistency gap.

**Action required (non-blocking):** Add "`fromAgentDisplayName: 'Ptah'` fallback renders correctly in Routing Notification embed" to the §9.3 ResponsePoster unit test description.

---

## Positive Observations (v1.1)

1. **OQ-TSPEC-04 resolution is thorough.** The call-site audit identified the exact number of sites (6), split (2 with full agent context / 4 system-initiated), defined a concrete fallback (`fromAgentDisplayName: 'Ptah'`), obtained PM approval, and noted the additional test case. This is the right process for resolving open questions.

2. **§6 archiving algorithm correctly places step 3b.** `postResolutionNotificationEmbed()` is called before `archiveThread()`, with a WARN fallback path to `postPlainMessage()` that ensures the thread receives a notification even if embed creation fails. The `(REQ-DI-10: resolution signal must be communicated before archive)` annotation is helpful for traceability.

3. **Integration test scope note (§9.3) is precisely worded.** "All external boundaries (Discord, FS, Claude API) faked via §9.2 test doubles. `buildAgentRegistry()` called with real in-memory `AgentEntry[]` (not `FakeAgentRegistry`). Classified as cross-module integration (not true I/O integration)." This removes all ambiguity for PROPERTIES derivation and test pyramid classification.

4. **`FakeLogger.forComponent()` uses `Component` type.** The compile-time guard against invalid component names in test code is now in place. The usage example correctly documents Option B (root + forComponent) and explicitly warns against Option A.

5. **`AgentValidationError` shape is implementation-ready.** The `{ index, agentId?, field, reason }` definition maps directly to the 7 validation rules in §5.4 algorithm — each rule produces a predictable error shape that engineers can assert on without ambiguity.

---

## Recommendation

**Approved with minor changes.**

The single remaining finding (F-07) is Low severity and non-blocking. The §9.3 ResponsePoster description can be updated in the same edit pass that addresses any other housekeeping before PLAN authoring — it does not require a re-review.

The TSPEC is cleared for:
- PROPERTIES document derivation (all properties are now fully specified)
- PLAN authoring (all test files and module boundaries are defined)
- Engineering implementation handoff

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Test Engineer | Initial review of TSPEC v1.0 — Needs revision (3 Medium findings) |
| 1.1 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.1 — Approved with minor changes (F-07 Low, non-blocking) |
