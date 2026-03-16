# Cross-Review: Backend Engineer — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Document reviewed** | [013-PROPERTIES-pdlc-auto-init](013-PROPERTIES-pdlc-auto-init.md) v1.0 |
| **Reviewer** | Backend Engineer |
| **Date** | 2026-03-15 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Findings

### F-01 — Medium: PROP-NF-02 latency benchmark uses fakes, cannot falsify the 100ms I/O budget

**Property:** PROP-NF-02 — auto-init block must complete within 100ms p95 across 100 runs.

**Issue:** PLAN F-2 explicitly specifies the benchmark uses `FakeStateStore`, `FakeLogger`, and `FakePdlcDispatcher` ("no real I/O"). REQ-NF-01 is specifically concerned with the atomic `StateStore.save()` file write — the budget rationale even states: *"The `initializeFeature()` call involves one state file write (atomic), which is already benchmarked in Feature 011 tests."*

A benchmark that substitutes a fake state store (which does nothing but increment a counter) will always pass p95 < 100ms regardless of actual file system behavior. The latency test is therefore measuring orchestration overhead only, not the I/O operation the requirement is worried about. It can never fail even if the real `FileStateStore.save()` degrades to 500ms on a slow CI disk.

**Options:**
- **Option A (preferred):** Run the benchmark with a real `FileStateStore` pointed at a temp directory. This is the only way to actually validate REQ-NF-01 as written.
- **Option B:** Update PROP-NF-02 to explicitly scope the measurement as "orchestration overhead only (excluding StateStore I/O)" and document that Feature 011's existing benchmark covers StateStore I/O. Lower the threshold accordingly (orchestration overhead should be well under 5ms, not 100ms).

The PLAN's F-2 description needs to match whichever option is chosen, and the property must be unambiguous about what is and is not in scope.

---

### F-02 — Low: No property for explicit `[backend-only]` keyword recognition

**Missing property:** REQ-DC-01 lists `[backend-only]` as a recognized keyword alongside `[fullstack]` and `[frontend-only]`. PROP-DC-02 covers `[fullstack]` and PROP-DC-03 covers `[frontend-only]`, but there is no corresponding `PROP-DC-X` for `[backend-only]`.

PROP-DC-01 only covers the **no-keyword** default case, not the **explicit keyword** case. The behaviors are outcome-identical (both yield `discipline: "backend-only"`), but they test different code paths:
- PROP-DC-01: no recognized tokens found → apply default
- Missing PROP: `[backend-only]` token found → set discipline from keyword (not from default)

If the implementation incorrectly treats `[backend-only]` as an unknown token (like `[some-random-tag]`), PROP-DC-01 cannot catch it because PROP-DC-01 does not exercise the keyword-recognition branch. PLAN B-3 includes `UT-KW-01` for `[backend-only]`, but there is no PROP ID backing it — the coverage matrix for REQ-DC-01 will have a gap.

**Suggested addition:**

```
| PROP-DC-X | `parseKeywords` must set `discipline: "backend-only"` when the message contains the exact token `[backend-only]` — the keyword must be recognized (not treated as an unknown token), even though the outcome is identical to the default | [REQ-DC-01], [FSPEC-DC-01] | Unit | P1 |
```

---

### F-03 — Low: PROP-PI-08 does not specify observable assertions — test authors may under-specify the behavior

**Property:** PROP-PI-08 — "must swallow any error thrown by `logger.info()`... and proceed with routing to the managed PDLC path normally."

The property states what must happen (swallow + proceed) but does not enumerate the observable assertions a test author should make. REQ-PI-03 AC says "the error is swallowed; the feature remains initialized and routing continues uninterrupted" — but a minimally conforming test could just assert "no exception thrown from `executeRoutingLoop()`" and miss the follow-on routing assertion.

The two required observable artifacts are:
1. No exception propagates from `executeRoutingLoop()` (the swallow)
2. The managed PDLC path (`pdlcDispatcher.decide()` or equivalent) **is** invoked after the swallow (routing proceeds)

Without (2) being explicit in the property, a test that catches the error but then silently drops routing would still satisfy the property as written.

**Recommendation:** Add a parenthetical to PROP-PI-08 that specifies both assertions: *(verifiable by (1) asserting no exception propagates from `executeRoutingLoop()`, and (2) asserting the managed PDLC path is invoked — `FakePdlcDispatcher.decideCalls.length === 1`).*

---

## 2. Clarification Questions

### Q-01: PROP-PI-21 — "concurrent" vs "sequential" invocations in integration test

PROP-PI-21 describes "two **concurrent** routing loop invocations for the same new feature slug." PLAN IT-05 implements this as two sequential invocations with `isManaged → false` — not as `Promise.all([...])` parallel execution.

In Node.js's single-threaded async model, sequential invocations are sufficient to exercise the check-before-write idempotency guard (by the time the second call runs, the first has already saved the state record). True parallel execution is not meaningfully different here.

**Question:** Is "concurrent" intended to mean "two invocations before the state machine would set `isManaged → true`" (i.e., sequential with the same precondition), or does it mean true interleaved async execution? If the former, the property and test are correct as implemented but the word "concurrent" is misleading for future test authors. Recommend changing the property's language to "two sequential invocations" and adding a parenthetical that explains Node.js's single-threaded model makes this equivalent to true concurrency for this operation.

---

### Q-02: PROP-NF-02 relationship to Feature 011 StateStore benchmarks

PLAN F-2 notes the benchmark "can be skipped in standard CI runs via a `PERF_TEST=true` environment flag." REQ-NF-01 specifies "measured ... in the CI test environment."

If the property can be skipped in CI, it is not continuously enforced. **Question:** Is there a CI gate (e.g., a weekly performance run, a required `PERF_TEST=true` step in the PR check) that enforces PROP-NF-02? If the property is only run manually, the requirement coverage for REQ-NF-01 is nominal. This is a process question, not a document defect — but the PROPERTIES document's Definition of Done should note whether this test runs in every CI build or on a schedule.

---

## 3. Positive Observations

1. **Gap analysis in §7 is production-quality.** Gaps 1 and 2 (initial message sourcing and log ordering) identify exactly the class of behavioral invariants that fall through TDD iteration cycles. The fact that both are already addressed in the PLAN (E-1 assertions) before the review is a sign of thorough up-front analysis.

2. **Idempotency properties are precisely decomposed.** Separating PROP-PI-11 (return value unchanged), PROP-PI-12 (no throw), PROP-PI-13 (saveCount === 1), and PROP-PI-14 (config not overwritten) into four distinct properties is the right granularity for TDD. Each is independently falsifiable and maps to a different implementation failure mode.

3. **Negative properties in §4 are comprehensive and correctly mirror the positive properties.** PROP-PI-N02 and PROP-PI-N03 (neither managed nor legacy path when `initializeFeature()` throws) are exactly the right guard against "fail-partially" regressions that would be very hard to catch in integration tests.

4. **Observability properties specify exact log formats.** Exact format strings in PROP-PI-15, PROP-PI-17, PROP-BC-09, and PROP-PI-18 make tests deterministic and unambiguous. This is the correct approach for a logging-heavy feature where subtle format variations could silently break downstream log parsers or debug tooling.

5. **PROP-BC-07 + PROP-BC-N02 correctly exclude bot messages without `<routing>` tags.** This is the subtle half of the age guard requirement (progress embeds, completion embeds, debug notifications all have `isBot === true`) and the property captures it precisely. Many reviewers would miss this when writing the age guard tests.

6. **Coverage matrix (§5) is complete and cross-referenced.** All 13 requirements map to one or more properties with "Full" coverage, and the reverse mapping (spec section → properties) in §5.2 is a useful navigation aid for the PLAN author.

---

## 4. Summary

The PROPERTIES document is thorough, precise, and well-structured. All 13 requirements have full property coverage; all 8 FSPEC/TSPEC sections are mapped; all critical failure modes have negative properties.

**Required before approval:**
- **F-01** — Resolve the latency measurement scope (Option A: real I/O, or Option B: explicitly scope to orchestration overhead). The current state allows PROP-NF-02 to be permanently green even if real I/O violates the 100ms budget.

**Recommended improvements:**
- **F-02** — Add `PROP-DC-X` for explicit `[backend-only]` keyword recognition to complete the REQ-DC-01 coverage.
- **F-03** — Strengthen PROP-PI-08 with explicit observable assertions (no exception + managed path IS invoked).
- **Q-01** — Clarify "concurrent" vs "sequential" in PROP-PI-21 to prevent test authors from over-engineering a Promise.all harness.

**Recommendation: Approved with minor changes** (F-01 is the only blocker; F-02, F-03, and Q-01 are low-risk improvements that can be addressed with a quick edit pass).
