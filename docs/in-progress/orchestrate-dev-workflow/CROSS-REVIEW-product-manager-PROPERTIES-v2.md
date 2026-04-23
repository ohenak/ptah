# Cross-Review: product-manager — PROPERTIES

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Resolution of Prior Findings (v1 → v1.1)

Before listing new findings, this section verifies that each High and Medium finding from the v1 review was resolved.

| Prior ID | Severity | Resolution Status | Notes |
|----------|----------|-------------------|-------|
| F-01 | High | Resolved | PROP-WFV-01 added: validator throws WorkflowConfigError for review phase missing `revision_bound`; `ptah run` exits 1 with named-phase error message. |
| F-02 | High | Resolved | PROP-WFV-02, PROP-WFV-03, PROP-WFV-04 added: YAML validator acceptance of valid `artifact.exists` SkipCondition and rejection of malformed variants (missing `artifact` field; spurious `equals` field with `artifact.exists`). |
| F-03 | High | Resolved | PROP-CLI-23 (Passed ✅ phase transition) and PROP-CLI-24 (Revision Bound Reached ⚠️ + optimizer-dispatch line) added. |
| F-04 | Medium | Resolved with caveat | PROP-INIT-02 revised: hardcoded `20` replaced with derivation rule and verification caveat; `20` retained as PLAN-stated expected value with a note that it must be confirmed against the actual manifest. Caveat is preserved inline. |
| F-05 | Medium | Resolved | PROP-BC-01 added: new Backward Compatibility domain; integration property verifying `ptah start` continues to operate with old 3-agent config post-upgrade. |
| F-06 | Medium | Resolved | PROP-CNP-02 (deep-copy requirement) removed; PROP-CNP-03 and PROP-CNP-04 renumbered accordingly; PROP-CNP-02 number retired. |
| F-07 | Medium | Not addressed | PROP-CLI-05 still traces only to REQ-CLI-01. The v1.1 change log does not mention this finding. As noted in v1, this is a traceability hygiene issue rather than a coverage gap — the behavior is correctly stated. Carrying as a Low finding below. |

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Medium | **PROP-CLI-18 deduplication key update is incomplete with respect to `completedPhaseResults`.** The v1.1 statement says the deduplication key now includes `completedPhaseResults` alongside phase name, iteration number, and reviewer statuses. However, the property does not specify *how* `completedPhaseResults` participates in the key — specifically: (a) is the full map serialized, (b) is it the count of entries, or (c) is it whether a specific phase's entry changed? Without a clear key definition, two implementations could have different deduplication behavior and both could claim to satisfy the property. The FSPEC-CLI-03 BR-CLI-14 deduplication rule mentions only "(phase name, iteration number, any reviewer's status)" — the `completedPhaseResults` extension is not reflected in the FSPEC. The property should state the exact predicate: for example, "the set of phase IDs present in `completedPhaseResults` plus their values is identical across consecutive polls". Without this, a test asserting the key is "changed when `completedPhaseResults` changes" cannot be written unambiguously. | REQ-CLI-03 |
| F-02 | Medium | **PROP-CLI-05 traces exclusively to REQ-CLI-01 (happy-path startup), obscuring the `ptah.workflow.yaml` validation branch.** This was raised as F-07 (Medium) in v1 and was not addressed in v1.1. FSPEC-CLI-01 defines the `ptah.workflow.yaml` missing case as a distinct behavioral rule (BR-CLI-06) separate from the general startup flow, and the error message table names it explicitly with its own exit-code row. Tracing this property only to REQ-CLI-01 continues to misrepresent the validation branch as a happy-path concern. Adding a note citing BR-CLI-06 or FSPEC-CLI-01 as the source of this behavioral contract would complete the traceability chain. This is a documentation hygiene issue — the property statement is correct — but it is a repeat unresolved finding from v1. | REQ-CLI-01, FSPEC-CLI-01 (BR-CLI-06) |
| F-03 | Low | **PROP-CLI-20 — `properties-tests` label in PHASE_LABELS map is not scoped to prevent over-emission of iteration/reviewer lines.** The Q-03 question from v1 asked whether the `PTT` label for `properties-tests` is intended for the optimizer-dispatch line only (since `properties-tests` is a creation-type phase with no reviewer output, per FSPEC-CLI-03). The v1.1 document does not address this question or clarify the property. FSPEC-CLI-03 explicitly states: "Creation phases (req-creation, fspec-creation, ...) emit no phase-header or reviewer-result progress lines." If the progress reporter uses `PHASE_LABELS` to determine which phases emit `[Phase PTT — Properties Tests] Iteration N` headers, it would incorrectly treat `properties-tests` as a review phase. The property statement should either: (a) clarify that the label is for agent-dispatch line only, or (b) confirm that the PHASE_LABELS map is strictly for display formatting and does not control which phases emit iteration headers (that gate being controlled separately by phase type). | REQ-CLI-03 |
| F-04 | Low | **PROP-ICR-07 is classified as `Integration` test level, while adjacent static-analysis properties (PROP-PR-09, PROP-MAP-08) are classified as `Unit`.** Q-04 from v1 raised this inconsistency: PROP-ICR-07 asserts that the old single-argument signature must not exist in the codebase after the change — this is a static source-scan check identical in nature to PROP-PR-09 and PROP-MAP-08. All three are implemented via source file string searches in unit test files. The v1.1 document did not address this question. If `Integration` is intentional (e.g., because this check requires loading the compiled TypeScript), that rationale should be stated in the property; otherwise the classification should be corrected to `Unit` for consistency. | REQ-WF-06 |
| F-05 | Low | **No property covers the `listWorkflowsByPrefix` `statusFilter` interface contract and `FakeTemporalClient` filter behavior.** This was raised as F-09 (Low) in v1 and remains unaddressed in v1.1. REQ-CLI-06 and FSPEC-CLI-01 BR-CLI-28 specify that: (a) `listWorkflowsByPrefix` gains an optional `statusFilter` parameter that appends an `AND ExecutionStatus IN (...)` clause to the visibility query, and (b) `FakeTemporalClient` must respect the filter when set. PROP-CLI-06 covers the behavioral outcome (duplicate-workflow check fires for Running/ContinuedAsNew) but does not include a property verifying the interface contract or that the fake correctly applies the filter. Without this property, an implementation could mock the method without applying the filter in the fake, and PROP-CLI-06's outcome-based test would still pass (because the test drives behavior via the stub return value, not via the filter). | REQ-CLI-06 |
| F-06 | Low | **PROP-INIT-08 does not explicitly verify creation phase agent assignments, leaving an incomplete check of REQ-WF-02's Reviewer Assignment Matrix.** This was raised as F-10 (Low) in v1 and remains unaddressed in v1.1. The Reviewer Assignment Matrix in REQ-WF-02 includes phases beyond the review phases PROP-INIT-08 lists — specifically all creation phases (`req-creation` through `properties-creation`) each with their respective agents. While the matrix rows for review phases are explicitly enumerated in PROP-INIT-08, creation phase agent assignments are absent. An implementation could omit or misconfigure creation phase agent assignments in the default YAML without triggering a PROP-INIT-08 failure. | REQ-WF-02 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-CLI-18 mentions that `completedPhaseResults` changing causes the deduplication key to be treated as changed. Is the full `completedPhaseResults` map included in the key, or only the set of phase IDs that have appeared? The property should state the exact predicate to enable unambiguous test authoring. |
| Q-02 | Was the v1 Q-01 (FILE_MANIFEST count of 20 sourced from) answered? The PROP-INIT-02 change acknowledges it may differ and instructs the implementer to verify — but if the TE has already verified the count, stating the verified baseline directly would remove uncertainty for the implementer. |

---

## Positive Observations

- All three High findings from v1 (F-01 through F-03) are resolved with precise, testable properties. PROP-WFV-01 through PROP-WFV-04 cover both the acceptance and rejection sides of the YAML validator; PROP-CLI-23 and PROP-CLI-24 explicitly pin the phase transition output lines that were missing from v1.
- The PROP-BC-01 integration property (Backward Compatibility domain) is appropriately defined at the integration test level and correctly identifies `ptah start` as the headline behavior to protect — matching the P0 acceptance criterion of REQ-NF-01.
- The removal of PROP-CNP-02 (deep-copy requirement) correctly eliminates a property that was not derivable from any product requirement; this avoids burdening the implementer with a technical constraint the product did not specify.
- PROP-CLI-24 correctly distinguishes the two output lines (Revision Bound Reached ⚠️ and the optimizer-dispatch line) and ties both to the shared deduplication key from PROP-CLI-18, providing clear and consistent behavior expectations.
- The change log in Section 19 is thorough and precisely maps each finding from both the PM and SE v1 reviews to the corresponding PROPERTIES change, providing excellent traceability for reviewers of this iteration.
- The coverage matrix in Section 15 is fully updated: all 25 requirements continue to show "None" in the Gap column, and new properties (PROP-WFV-01 through PROP-WFV-04, PROP-BC-01, PROP-CLI-23, PROP-CLI-24) are correctly included.
- The negative properties section (Section 16) has been updated to include PROP-WFV-01, PROP-WFV-03, and PROP-WFV-04, giving the implementation guard rails for the three new validator rejection cases.

---

## Recommendation

**Approved with Minor Issues**

> No High findings remain from v1. The two Medium findings (F-01 and F-02) are documentation and traceability concerns — F-01 requires a more precise definition of the `completedPhaseResults` deduplication key to enable unambiguous test authoring, and F-02 is a repeat from v1 (PROP-CLI-05 traceability) that was left unresolved. The four Low findings are low-risk carry-forwards that do not block implementation but should be addressed in a future revision.
>
> If the TE addresses F-01 (clarify the `completedPhaseResults` key predicate in PROP-CLI-18) before handoff to implementation, this document can be considered fully approved.
