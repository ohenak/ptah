# Cross-Review: software-engineer — REQ

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | REQ-WF-06 specifies the new `isCompletionReady()` signature as `(signOffs: Record<string, boolean>, workflowConfig: WorkflowConfig): boolean` and the AC states `signOffs[agentId] === true`. However, `FeatureWorkflowState.signOffs` is typed as `Record<string, string>` (keyed by agent ID, value is an ISO 8601 timestamp string), not `Record<string, boolean>`. The AC's `signOffs[agentId] === true` will never evaluate to true against a string timestamp. The correct check against the existing type is `signOffs[agentId] !== undefined`. The REQ must either (a) specify that the `signOffs` type in `FeatureWorkflowState` is changed from `Record<string, string>` to `Record<string, boolean>`, or (b) correct the AC to use `signOffs[agentId] !== undefined`. If (a), the impact propagates to `recordSignOff()` and all call sites. | REQ-WF-06, `temporal/types.ts` |
| F-02 | Medium | REQ-NF-04 requires `buildContinueAsNewPayload()` to include `writtenVersions` so it survives `ContinueAsNew` transitions. The current `ContinueAsNewPayload` interface and `buildContinueAsNewPayload()` carry `{ featurePath, worktreeRoot, signOffs, adHocQueue }` — `reviewStates` is not in the payload at all. The resumed workflow re-initializes `reviewStates` from `initialReviewState` in `StartWorkflowParams`. `writtenVersions` lives inside `ReviewState` (per REQ-NF-04), so preserving it across CAN requires `reviewStates` (or at minimum a mapping of per-phase `writtenVersions`) to be added to both `ContinueAsNewPayload` and `StartWorkflowParams.initialReviewState`. The REQ specifies adding `writtenVersions` to `buildContinueAsNewPayload()` but does not specify how this value reaches the resumed workflow's `ReviewState`. Without specifying the full round-trip (payload field → `StartWorkflowParams` field → `buildInitialWorkflowState()` initialization), the AC for CAN preservation cannot be implemented correctly. | REQ-NF-04, REQ-CR-04 |
| F-03 | Low | REQ-WF-04 requires a validation error when a review phase is missing `revision_bound`. The REQ states the validator must be updated, but still does not specify whether the check belongs in `YamlWorkflowConfigLoader.validateStructure` (structural YAML validation in `workflow-config.ts`) or `DefaultWorkflowValidator.validateRequiredFields` (semantic validation in `workflow-validator.ts`). These are in separate files with separate call-site owners. Ambiguity here risks either duplicate errors or the check being omitted entirely. The REQ should assign the check to exactly one of the two validators and state why. | REQ-WF-04 |
| F-04 | Low | REQ-CR-02 still describes the `revisionCount` clamping rule across two separate sentences rather than as a single unified conditional. The current description says "When `revisionCount` is 1 or absent … no suffix" and "When `revisionCount ≥ 2` … append `-v{N}`" and "A `revisionCount` of 0 or negative is treated as 1". An implementer reading these in order risks treating `revisionCount = 1` as a special case distinct from `revisionCount ≤ 0` clamped to 1 (both produce the same output, but the path through the code may differ). A single truth table (`≤ 0 → unversioned; 1 → unversioned; ≥ 2 → -v{N}`) would eliminate this ambiguity. | REQ-CR-02 |
| F-05 | Low | `buildRevisionInput()` in `feature-lifecycle.ts` (line 539) sets `documentType: creationPhase.id` instead of `deriveDocumentType(creationPhase.id)`. This pre-existing defect means revision inputs pass the raw phase ID (e.g., `"req-creation"`) as the document type instead of the derived abbreviation (e.g., `"REQ"`). REQ-CR-04 and REQ-CR-05 both require edits to `feature-lifecycle.ts` and `buildRevisionInput()` to inject `revisionCount`. The TSPEC author working from these requirements will be editing `buildRevisionInput()` — the REQ is silent on this adjacent defect, increasing the risk it survives the revision. This finding is carried forward from v2 F-06 unchanged. | REQ-CR-04, REQ-CR-05 |

---

## Prior Findings — Resolution Status

### v2 Medium Findings

| v2 ID | v2 Severity | Resolution |
|-------|-------------|-----------|
| F-01 | Medium | Resolved. REQ-WF-05 now explicitly specifies the `evaluateSkipCondition()` function signature as `(condition: SkipCondition, featureConfig: FeatureConfig, artifactExists?: Record<string, boolean>): boolean`, lists all three call sites to update, and specifies the exact thrown `Error` message when called before the pre-loop activity. Fully implementable. |
| F-02 | Medium | Resolved. REQ-NF-04 is now a formal typed requirement specifying the `writtenVersions: Record<string, number>` field addition to `ReviewState` in `temporal/types.ts`, initialization in `buildInitialWorkflowState()`, and the CAN preservation requirement. The residual gap in how the payload round-trip works is captured as F-02 above. |
| F-03 | Medium | Resolved. REQ-CLI-06 now specifies that `listWorkflowsByPrefix()` must be enhanced to accept an optional `statusFilter?: ("Running" \| "ContinuedAsNew")[]` parameter that appends an `AND ExecutionStatus IN (...)` clause, and specifies error behavior when the Temporal query itself throws. |

### v2 Low Findings

| v2 ID | v2 Severity | Resolution |
|-------|-------------|-----------|
| F-04 | Low | Partially addressed. REQ-WF-04 now states the validator "must be updated" but does not assign the check to a specific validator class. Carried forward as F-03 above. |
| F-05 | Low | Not addressed. REQ-CR-02 still uses separate sentences rather than a unified rule table. Carried forward as F-04 above. |
| F-06 | Low | Not addressed. `buildRevisionInput()` document type defect still not called out in any requirement. Carried forward as F-05 above. |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-WF-06 AC uses `signOffs[agentId] === true` but `FeatureWorkflowState.signOffs` stores timestamps (`Record<string, string>`). Should the AC be corrected to `signOffs[agentId] !== undefined`, or is the intent to change the `signOffs` type to boolean presence? Resolving this before TSPEC authoring is critical since it affects `recordSignOff()`, `isCompletionReady()`, and the completion promotion call site. |
| Q-02 | REQ-NF-04 requires `writtenVersions` to survive `ContinueAsNew`. Since `writtenVersions` lives inside `ReviewState` which is not currently in `ContinueAsNewPayload`, what is the intended mechanism for the round-trip? Is the intent to add `reviewStates` to `ContinueAsNewPayload` and `StartWorkflowParams.initialReviewState` (which already exists), or to add a separate `writtenVersions: Record<string, Record<string, number>>` field (phase → agent → version) to the payload? |

---

## Positive Observations

- All three Medium findings from v2 are fully resolved. The v1.3 document has addressed 10 of the 13 original High/Medium findings across three iterations, a strong resolution rate.
- REQ-WF-05 is now a complete, implementable specification: discriminated union type, Activity signature, state field, pre-loop call timing, all three call site updates, and the runtime error guard are all explicit. No further ambiguity.
- REQ-CLI-06 is now concrete and testable: the `statusFilter` parameter enhancement, the exact Temporal visibility query clause, the error messages, and the closed-workflow non-blocking behavior are all specified.
- REQ-NF-04 elevating `writtenVersions` to a formal requirement with a REQ-ID is the correct fix; the type change, initialization, and CAN semantics are now traceable.
- The Change Log in Section 7 continues to map each v1.3 change to its driving v2 finding ID, which significantly accelerates this iteration's review.

---

## Recommendation

**Approved with Minor Issues**

> Both remaining Medium findings (F-01 and F-02) are resolvable within the TSPEC without requiring another PM revision cycle, provided the TSPEC author resolves them explicitly:
>
> 1. **F-01:** The TSPEC must choose between correcting the `isCompletionReady()` AC to use `!== undefined` against the existing `Record<string, string>` type, or specify changing `FeatureWorkflowState.signOffs` to `Record<string, boolean>`. Either choice is acceptable; the TSPEC must be explicit.
> 2. **F-02:** The TSPEC must specify the full `writtenVersions` CAN round-trip — which field in `ContinueAsNewPayload` carries it, and how `buildInitialWorkflowState()` restores it from `StartWorkflowParams`.
>
> The three Low findings (F-03 through F-05) can be resolved during implementation without risk to correctness. The document is otherwise implementable as written.
