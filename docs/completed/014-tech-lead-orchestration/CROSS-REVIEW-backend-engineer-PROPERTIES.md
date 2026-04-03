# Cross-Review: Backend Engineer → PROPERTIES

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (eng) |
| **Document Reviewed** | 014-PROPERTIES-tech-lead-orchestration v1.0 |
| **Cross-Referenced Against** | 014-TSPEC (revised), 014-REQ v1.4, 014-FSPEC v1.6, implemented codebase |
| **Date** | 2026-03-21 |

---

## Findings

### F-01 — LOW: PROP-BD-17 references wrong constant name

**Location:** §3.6 Performance Properties, PROP-BD-17

**Issue:** PROP-BD-17 states: "`DEFAULT_LOCK_TIMEOUT_MS` must be 30,000 ms for serializing sequential merge operations." In the implementation, the constant for `mergeBranchIntoFeature` is named `MERGE_BRANCH_LOCK_TIMEOUT_MS` (30,000 ms), not `DEFAULT_LOCK_TIMEOUT_MS`. The existing `DEFAULT_LOCK_TIMEOUT_MS` (10,000 ms) is used by `commitAndMerge` and predates Phase 14.

**Recommendation:** Update PROP-BD-17 to reference `MERGE_BRANCH_LOCK_TIMEOUT_MS` instead of `DEFAULT_LOCK_TIMEOUT_MS`. The TSPEC §4.4 also used the name `DEFAULT_LOCK_TIMEOUT_MS` but the implementer chose a more descriptive name to avoid confusion with the existing constant — the implementation is correct.

---

### F-02 — LOW: Analysis summary shows "Implementation files reviewed: 0"

**Location:** §1.2 Analysis Summary

**Issue:** The table shows "Implementation files reviewed | 0 | N/A — not yet implemented". The code is now implemented (Phase 14 implementation is complete across all 6 plan phases). This is stale metadata — it doesn't affect any property definitions but is misleading.

**Recommendation:** Update to reflect the implemented state (6 source files, 4 test files, 1 SKILL.md).

---

## Positive Observations

1. **Complete requirement coverage.** All 28 requirements map to properties with "Full" coverage. The coverage matrix (§5.1) is thorough and correct — I cross-checked every REQ-to-PROP mapping.

2. **Negative properties are well-chosen.** The 10 negative properties (§4) capture the critical "must NOT" invariants: no partial merge on failure (PROP-BD-N01), no plan update on test failure (PROP-BD-N02), no batch advancement without test gate (PROP-BD-N03), no lock leaks (PROP-BD-N04), and no code writing by the tech lead (PROP-TL-N01). These are exactly the invariants where violations would cause the most damage.

3. **Lock release property is precise.** PROP-BD-N04 correctly specifies that the lock must be released in ALL outcomes including lock timeout. The implementation's `finally` block ensures this, and the tests assert `releaseCallCount === 1` for all non-timeout cases. The lock timeout case correctly has no release (lock was never acquired).

4. **Correct architectural acknowledgment of the SKILL.md testing challenge.** The 65% acceptance test distribution (§6) with the explanatory note is accurate and honest. The test pyramid note correctly states that all TypeScript-testable behavior is covered by unit/integration tests.

5. **Gap analysis is measured and reasonable.** Both identified gaps (§7) are Low risk with sound justifications. The confirmation loop modification types and progress reporting format decisions are correctly assessed as not needing dedicated properties.

6. **Specification coverage matrix (§5.2) is comprehensive.** Every TSPEC section with testable behavior maps to properties. The §5.2 matrix correctly covers §4.2–§5.10, §6, §7.3, and §9.

7. **Contract properties accurately reflect the implemented interfaces.** PROP-TL-05 through PROP-TL-10 correctly describe the `FeatureConfig.useTechLead`, `ArtifactCommitter.mergeBranchIntoFeature`, `BranchMergeResult` type union, `AgentEntry.mentionable`, and the config loader's conditional validation — all verified against the codebase.

---

## Recommendation

**Approved with minor changes** — only Low-severity findings (F-01 constant name, F-02 stale metadata). No technical accuracy issues with any property definition. All properties are implementable and correctly reflect the codebase behavior.

---

*End of Review*
