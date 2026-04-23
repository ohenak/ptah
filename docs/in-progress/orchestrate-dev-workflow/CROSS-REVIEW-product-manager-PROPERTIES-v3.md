# Cross-Review: product-manager — PROPERTIES

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Resolution of Prior Findings (v2 → v1.2)

Before listing new findings, this section verifies that each High and Medium finding from the v2 review was resolved.

| Prior ID | Severity | Resolution Status | Notes |
|----------|----------|-------------------|-------|
| F-01 | Medium | Resolved | PROP-CLI-18 now states the exact `completedPhaseResults` predicate: the set of `{phaseId: result}` pairs serialized as a sorted key-value string must be identical across consecutive polls. PROP-CLI-24 is also updated to explicitly state that a transition from `activeAgentIds = []` to `activeAgentIds = ["pm-author"]` — with `completedPhaseResults` otherwise unchanged — changes the deduplication key and triggers emission. The predicate is unambiguous. |
| F-02 | Medium | Resolved | PROP-CLI-05 Requirements field now includes `FSPEC-CLI-01 (BR-CLI-06)`, completing the traceability chain to the `WorkflowConfigError` catch-and-reformat behavioral rule. This was a repeat from v1 and is now closed. |
| F-03 | Low | Not addressed | PROP-CLI-20 still defines a `PTT / Properties Tests` label for `properties-tests` in the PHASE_LABELS map without clarifying whether the label governs only the optimizer-dispatch line or also iteration/reviewer lines. FSPEC-CLI-03 explicitly states creation phases emit no phase-header or reviewer-result lines. This ambiguity carries forward as a Low finding (see F-02 below). |
| F-04 | Low | Not addressed | PROP-ICR-07 is still classified as `Integration` while identical static source-scan checks (PROP-PR-09, PROP-MAP-08) are classified as `Unit`. No rationale for the discrepancy is stated in the property. Carries forward as a Low finding (see F-03 below). |
| F-05 | Low | Not addressed | No property covers the `listWorkflowsByPrefix` optional `statusFilter` interface contract and `FakeTemporalClient` filter behavior, as specified in REQ-CLI-06 and FSPEC-CLI-01 BR-CLI-28. Carries forward as a Low finding (see F-04 below). |
| F-06 | Low | Not addressed | PROP-INIT-08 still does not explicitly verify creation phase agent assignments from the REQ-WF-02 Reviewer Assignment Matrix. Carries forward as a Low finding (see F-05 below). |

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | **PROP-CLI-18 `activeAgentIds` deduplication key — `completedPhaseResults` predicate is now precise, but the property does not explicitly state that `activeAgentIds` must also be included as a sorted comma-separated string in the deduplication key tuple when `completedPhaseResults` changes.** The property statement says the deduplication key is the 4-tuple `(phase name, iteration number, all reviewer statuses as a sorted key-value string, activeAgentIds as a sorted comma-separated string)` and then adds that changes to `completedPhaseResults` also invalidate the key. However, the phrasing groups `completedPhaseResults` as a separate predicate addendum rather than naming it as a fifth component of the tuple. The v1.2 property statement in PROP-CLI-18 mentions `completedPhaseResults` change "invalidates the key and causes new lines to be emitted even if the 4-tuple is otherwise unchanged" — this is technically correct but implies the key is a 4-tuple extended by a side-condition rather than a 5-component key. PROP-CLI-24 then says "the same deduplication key (see PROP-CLI-18)" and lists a 5-element enumeration including `completedPhaseResults`. This creates a terminology inconsistency between the two properties (one says "4-tuple + side condition", the other says "5-element enumeration"). This is a documentation clarity issue, not a coverage gap — both properties specify the correct behavior. The discrepancy could confuse an implementer reading PROP-CLI-18 and PROP-CLI-24 independently. | REQ-CLI-03 |
| F-02 | Low | **PROP-CLI-20 `properties-tests` label scope remains unresolved.** FSPEC-CLI-03 explicitly scopes progress reporting to review phases only: "Creation phases (req-creation, fspec-creation, ...) emit no phase-header or reviewer-result progress lines." The phase `properties-tests` is a creation-type phase (`type: creation`) per REQ-WF-03 and PROP-INIT-05. Yet PROP-CLI-20 includes a `PTT / Properties Tests` label for `properties-tests` in the PHASE_LABELS static map alongside only review phases. The property does not clarify whether this label entry applies only to the optimizer-dispatch line (which creation phases may still emit, per FSPEC-CLI-03 scope note: "When a creation phase dispatches its agent, the only output is the optimizer-dispatch line") or whether an implementer might incorrectly read it as enabling iteration/reviewer lines for `properties-tests`. This was raised in Q-03 (v1) and as F-03 (v2) and remains unaddressed in v1.2. | REQ-CLI-03 |
| F-03 | Low | **PROP-ICR-07 is classified as `Integration` while structurally identical static source-scan checks are classified as `Unit`.** PROP-ICR-07 asserts that "the old single-argument signature must not exist anywhere in the codebase after the change." This is a string-search check on source code — functionally identical to PROP-PR-09 (`mapRecommendationToStatus` absent from `feature-lifecycle.ts`) and PROP-MAP-08 (`AGENT_TO_SKILL` not a fully independent table), both of which are classified as `Unit`. No rationale for the `Integration` classification is stated in PROP-ICR-07. This inconsistency was raised in Q-04 (v1) and as F-04 (v2) and remains unaddressed in v1.2. If `Integration` is intentional (e.g., requires a compiled TypeScript step to verify), the property statement should say so; otherwise it should be corrected to `Unit`. | REQ-WF-06 |
| F-04 | Low | **No property covers the `listWorkflowsByPrefix` optional `statusFilter` interface contract and `FakeTemporalClient` filter behavior.** REQ-CLI-06 explicitly requires that `TemporalClientWrapper.listWorkflowsByPrefix()` be enhanced with an optional `statusFilter?: ("Running" \| "ContinuedAsNew")[]` parameter. FSPEC-CLI-01 BR-CLI-28 specifies that `FakeTemporalClient` must respect the `statusFilter` when filtering its in-memory workflow list so tests can assert the filter is applied. PROP-CLI-06 covers the behavioral outcome (error emitted when a running workflow is found) but does not include a property that: (a) verifies the `statusFilter` parameter is accepted and wired to the Temporal visibility query, and (b) verifies `FakeTemporalClient` applies the filter. Without this property, an implementation could ignore the filter in the fake — PROP-CLI-06's outcome test would still pass because the stub return value, not the filter, drives the result. This was raised as F-09 (v1) and F-05 (v2) and remains unaddressed in v1.2. | REQ-CLI-06 |
| F-05 | Low | **PROP-INIT-08 does not verify creation phase agent assignments from the REQ-WF-02 Reviewer Assignment Matrix.** The REQ-WF-02 matrix covers review phases only (the 8 entries in the Reviewer Assignment Matrix table are all review or creation-phase-like entries — `req-review`, `fspec-review`, `tspec-review`, `plan-review`, `properties-review`, `implementation`, `properties-tests`, `implementation-review`). On closer inspection, the matrix in REQ-WF-02 does not itself include separate `req-creation` / `fspec-creation` / etc. rows — the creation phases are not in the Reviewer Assignment Matrix. However, creation phase agents are defined in the default workflow YAML that `ptah init` generates. There is no property that verifies creation phases (e.g., `req-creation` → `pm-author`, `fspec-creation` → `pm-author`, `tspec-creation` → `se-author`, `plan-creation` → `se-author`, `properties-creation` → `te-author`) in the scaffold. PROP-INIT-07 verifies only the `skip_if` condition on `req-creation`, not its agent assignment. This gap means a misconfigured creation phase agent would not be caught by any property test. This was raised as F-10 (v1) and F-06 (v2) and remains unaddressed in v1.2. Note: the coverage matrix marks REQ-WF-02 gap as "None" because PROP-INIT-08 covers the review phases in the matrix — the creation phase agent assignments are not part of the REQ-WF-02 matrix and are not explicitly required by any listed requirement. This finding is about product completeness of the scaffold, not a strict requirements gap. | REQ-WF-02 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-CLI-18 says the deduplication key is a "4-tuple" and then adds `completedPhaseResults` as a side-condition that also invalidates the key. PROP-CLI-24 says "the same deduplication key (see PROP-CLI-18)" but enumerates 5 components including `completedPhaseResults`. Should PROP-CLI-18 be updated to name the key as a 5-tuple (adding `completedPhaseResults` as an explicit fifth component) for consistency with PROP-CLI-24? |
| Q-02 | For PROP-CLI-20, is the intent that `properties-tests` appears in the PHASE_LABELS map solely to format the optimizer-dispatch line (`[Phase PTT — Properties Tests] se-implement running...`) — with no iteration header or reviewer-result lines ever emitted for that phase? Clarifying this would close the ambiguity that has been open since v1 Q-03. |

---

## Positive Observations

- The v1.2 resolution of the two Medium findings from v2 is precise and complete. PROP-CLI-18's deduplication key predicate now unambiguously specifies the `completedPhaseResults` participation condition, which directly enables unambiguous test authoring. PROP-CLI-05's traceability to FSPEC-CLI-01 BR-CLI-06 is now explicit.
- PROP-CLI-24 correctly connects the optimizer-dispatch line emission to the `activeAgentIds` transition — the specific example (`activeAgentIds = []` → `["pm-author"]`) makes the behavior unambiguous for the implementer.
- PROP-SC-06A (added in v1.2) is a well-targeted contract test that guards against a silent Temporal worker registration failure — a class of runtime bug that would be invisible to type-level checks. The rationale in the property statement is clear and the test file is explicitly specified.
- PROP-RRC-03 correction (pointing to `skill-activity.test.ts` and specifying `buildInvokeSkillInput()` as the unit under test) properly narrows the test scope to the component responsible for prompt assembly, avoiding the over-broad test placement in `feature-lifecycle.test.ts` that would have tested pass-through rather than construction.
- The change log in Section 19 is meticulous: each v1.2 change is cross-referenced to both the SE v2 and PM v2 finding IDs that prompted it, making traceability bidirectional and clear for any reviewer of this iteration.
- All 25 requirements continue to show "None" in the coverage matrix Gap column. The coverage matrix is up to date with the 96 total properties.
- The negative properties section (Section 16) and E2E properties section (Section 17) are both well-maintained and unchanged from v1.1 — appropriate, since no structural gaps were introduced that would require new negative or E2E properties.

---

## Recommendation

**Approved with Minor Issues**

> No High or Medium findings remain. All five remaining findings are Low-severity carry-forwards that have been present since v1 or v2 without blocking implementation. Specifically:
>
> - F-01 (Low): PROP-CLI-18 and PROP-CLI-24 use inconsistent terminology for the deduplication key (4-tuple vs 5-element enumeration). Recommend aligning both properties to call it a 5-tuple by naming `completedPhaseResults` as an explicit fifth component.
> - F-02 (Low): PROP-CLI-20 does not clarify that the `properties-tests` PHASE_LABELS entry is scoped to the optimizer-dispatch line only (not iteration/reviewer lines), per FSPEC-CLI-03. Recommend adding one sentence to the property statement confirming the restriction.
> - F-03 (Low): PROP-ICR-07 classification as `Integration` is inconsistent with peer static-scan properties classified as `Unit`. Recommend correcting to `Unit` or adding an explicit rationale for the `Integration` classification.
> - F-04 (Low): The `listWorkflowsByPrefix` `statusFilter` interface contract and `FakeTemporalClient` filter behavior have no property. This leaves the filter wiring untested at the property level. Recommend adding a property (or expanding PROP-CLI-06) to cover this interface contract.
> - F-05 (Low): Creation phase agent assignments in the `ptah init` scaffold have no property. The reviewer-assignment matrix in PROP-INIT-08 covers only review phases. Recommend adding a property or extending PROP-INIT-08 to assert that creation phases in the default YAML carry the correct agent IDs.
>
> None of these Low findings block implementation handoff. The document is approved for implementation with the understanding that the above items are addressable as minor amendments either before or during implementation.
