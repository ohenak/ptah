# Cross-Review: Product Manager → PROPERTIES

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | 014-PROPERTIES-tech-lead-orchestration v1.0 (Draft, 2026-03-21) |
| **Cross-Referenced Against** | 014-REQ-tech-lead-orchestration v1.4, 014-FSPEC-tech-lead-orchestration v1.6, 014-TSPEC-tech-lead-orchestration (revised 2026-03-21) |
| **Date** | 2026-03-21 |

---

## Findings

### F-01 — Missing property for ROUTE_TO_USER exit signal on failure scenarios (Medium)

**Location:** §3.3 Error Handling Properties, §4 Negative Properties

**Issue:** The PROPERTIES document specifies exit signals for clean-exit scenarios — PROP-PD-13 explicitly states "exit LGTM" for plan-not-found, and PROP-TL-11 states "exit LGTM" for confirmation timeout. However, there is no property covering the `ROUTE_TO_USER` exit signal for the three critical failure scenarios:

1. Phase agent failure (TSPEC §6: `ROUTE_TO_USER`)
2. Merge conflict (TSPEC §6: `ROUTE_TO_USER`)
3. Test gate failure — assertion or runner (TSPEC §6: `ROUTE_TO_USER`)

This matters because the exit signal determines whether the PDLC state machine stays in IMPLEMENTATION (allowing the developer to fix and re-invoke) or advances to the next phase. This was the subject of the **High-severity finding (F-01) in the PM TSPEC review** — the TSPEC originally had an internal contradiction specifying `LGTM` for these failures, which would have caused the orchestrator to advance past IMPLEMENTATION on failure. The contradiction was fixed in the TSPEC revision, but the PROPERTIES document does not capture this invariant.

The TSPEC §7.5 acceptance tests (AT-BD-03-02 through AT-BD-03-05) do specify "Exit with ROUTE_TO_USER" in their expected outcomes, so the behavior is tested. But it is not expressed as a standalone, regression-guarding property.

**Recommendation:** Add a property (e.g., in §3.3 or §4) such as:

> PROP-BD-XX: SKILL.md must exit with `ROUTE_TO_USER` (failure described in question field) when a blocking failure occurs during batch execution — phase agent failure, merge conflict, test gate assertion failure, or test gate runner failure. Clean-exit scenarios (plan not found, all phases done, user cancel, timeout) must exit with `LGTM`.

This captures both halves of the exit signal contract in one testable property.

---

## Positive Observations

1. **Complete requirement coverage.** All 28 requirements are mapped to properties in §5.1, all marked "Full." No orphaned or uncovered requirements.

2. **Well-structured property taxonomy.** The seven categories (Functional, Contract, Error Handling, Data Integrity, Integration, Performance, Idempotency) plus the separate Negative Properties section provide clear organization. Each property has a unique ID, source traceability, test level, and priority.

3. **Negative properties are a strong addition.** The 10 negative properties (PROP-*-N0x) explicitly define what the system must NOT do — no partial merges, no plan update on test failure, no auto-approval, no exceeding concurrency cap. These are high-value regression guards.

4. **Honest gap analysis.** §7 correctly identifies that confirmation loop modification types and progress reporting message formats lack explicit properties, and provides reasonable justification for why these are low-impact gaps.

5. **Test pyramid rationale is sound.** The 65% acceptance / 31% unit / 4% integration split reflects the architectural reality that the SKILL.md is prompt-based and cannot be unit-tested. The explanatory note in §6 makes this clear.

6. **Lock release invariant captured.** PROP-BD-N04 explicitly tests that the merge lock is released in all five outcomes — a subtle correctness property that aligns with the TSPEC §4.4 `finally` block design.

---

## Recommendation

**Needs revision** — F-01 (Medium) should be addressed. The `ROUTE_TO_USER` exit signal for failure scenarios is a critical product invariant that was the subject of a High-severity TSPEC finding. It warrants an explicit property to prevent regression.

---

*End of Review*
