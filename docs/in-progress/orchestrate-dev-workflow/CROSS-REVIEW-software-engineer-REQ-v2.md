# Cross-Review: software-engineer — REQ

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | `evaluateSkipCondition()` in `feature-lifecycle.ts` (line 153) has the signature `(condition: { field: string; equals: boolean }, featureConfig: FeatureConfig): boolean`. REQ-WF-05 specifies a discriminated union `{ field: "config.*"; equals: boolean } | { field: "artifact.exists"; artifact: string }` but the existing parameter type annotation is a plain object, not a union. The REQ correctly specifies that `evaluateSkipCondition()` reads `state.artifactExists[condition.artifact]` for the new branch, but `evaluateSkipCondition()` today only receives `featureConfig` — not `FeatureWorkflowState`. Adding the `artifact.exists` branch requires either (a) adding a second parameter `artifactExists: Record<string, boolean>` to the function signature, or (b) restructuring callers to pass the full state. Neither option is specified; all three call sites in `feature-lifecycle.ts` (lines 216, 1450, 1514) only pass `featureConfig`. The AC for REQ-WF-05 says nothing about the function signature change required at these call sites. This is the residual gap from F-01 in v1 — the state field and Activity were specified, but the evaluator function signature was not. | REQ-WF-05 |
| F-02 | Medium | REQ-CR-04 states that `runReviewCycle()` must update `reviewState.writtenVersions[agentId]` after each reviewer invocation, but `ReviewState` in `temporal/types.ts` (lines 29–32) still only has `{ reviewerStatuses: Record<string, ReviewerStatusValue>; revisionCount: number }`. The REQ adds `writtenVersions` as an in-scope item (Section 3.1) and references it in REQ-CR-04 and REQ-CR-07, but never formally defines it as a type change requirement. There is no REQ-ID that says "add `writtenVersions: Record<string, number>` to the `ReviewState` type in `temporal/types.ts`." Without this, TSPEC authors may miss the type change, since the change is buried in prose across multiple requirements rather than specified as an explicit data-model requirement. | REQ-CR-04, REQ-CR-07, Section 3.1 |
| F-03 | Medium | REQ-CLI-06 requires `ptah run` to call `listWorkflowsByPrefix("ptah-")` filtered by feature slug to detect running workflows. The existing `listWorkflowsByPrefix` in `TemporalClientWrapper` (client.ts lines 128–138) returns all workflow IDs with the given prefix, with no status filter — it uses a Temporal list visibility query `WorkflowId STARTS_WITH 'ptah-'` with no `ExecutionStatus = 'Running'` clause. The REQ states the check must filter to `Running` or `ContinuedAsNew` status; this requires either (a) a more specific Temporal visibility query with a status filter added to `TemporalClientWrapper.listWorkflowsByPrefix`, or (b) post-filtering the returned IDs by querying each workflow's status. The REQ does not specify which approach is required, nor does it acknowledge that the existing `listWorkflowsByPrefix` method would need enhancement. This is a concrete integration gap that implementation will discover. | REQ-CLI-06 |
| F-04 | Low | REQ-WF-04 states that a review phase with a missing `revision_bound` field is a configuration error that causes `ptah run` to exit with code 1. However, `YamlWorkflowConfigLoader.validateStructure` (workflow-config.ts lines 126–167) does not validate `revision_bound` presence on review phases, and `DefaultWorkflowValidator.validateRequiredFields` (workflow-validator.ts lines 68–89) also does not check for it. The REQ correctly says the validator must be updated, but does not specify which validator is responsible — `YamlWorkflowConfigLoader.validateStructure` (structural YAML validation) or `DefaultWorkflowValidator.validateRequiredFields` (semantic validation). Both are in separate files with different responsibilities. Leaving the assignment ambiguous means both might implement it (duplicate errors) or neither might (missed). | REQ-WF-04 |
| F-05 | Low | REQ-CR-02 specifies that a `revisionCount` of 0 or negative "is treated as 1 (no suffix, no error)." The existing `crossReviewPath()` (cross-review-parser.ts lines 157–163) takes no `revisionCount` parameter. The parameter is optional per the REQ, but the clamping rule (`revisionCount ≤ 0 → 1`) and the range check (`revisionCount ≥ 2 → append -v{N}`) are not written as a single coherent conditional. The REQ describes the behavior in two separate sentences in the description and in the AC, but never as a single rule table. This increases the risk of off-by-one implementation errors (e.g., treating `revisionCount = 1` as needing a `-v1` suffix). A single explicit rule table would eliminate ambiguity. | REQ-CR-02 |
| F-06 | Low | `buildRevisionInput()` in `feature-lifecycle.ts` (line 539) sets `documentType: creationPhase.id` rather than `deriveDocumentType(creationPhase.id)`. This is a pre-existing code defect (not introduced by this REQ), but REQ-CR-05 requires the removal of `mapRecommendationToStatus()` and consolidation to `parseRecommendation()` — it would be prudent for the same requirement set that touches `feature-lifecycle.ts` to also flag this inconsistency, since the TSPEC author working from this REQ will be editing `buildRevisionInput()` to pass `revisionCount`. The REQ is silent on this adjacent defect. | REQ-CR-05, REQ-CR-04 |

---

## Prior High Findings — Resolution Status

| v1 ID | v1 Severity | Resolution |
|-------|-------------|-----------|
| F-01 | High | Partially addressed. REQ-WF-05 now specifies the discriminated union, the `checkArtifactExists` Activity, and the `FeatureWorkflowState.artifactExists` field. The residual gap — `evaluateSkipCondition()` function signature — is captured above as F-01 (Medium). |
| F-02 | High | Resolved. REQ-NF-03 now correctly targets both `ReadCrossReviewInput` (for `readCrossReviewRecommendation`) and `SkillActivityInput` (for context injection into the skill prompt). |
| F-03 | High | Partially addressed. `ReviewState.writtenVersions` is specified in REQ-CR-04 and Section 3.1. The residual gap — it is not a formal typed requirement against `temporal/types.ts` — is captured above as F-02 (Medium). |
| F-04 | High | Resolved. A-05 and REQ-CLI-05 explicitly define the architectural boundary: CLI computes `startAtPhase`, workflow `skip_if` acts as a safety net with explicit `startAtPhase` taking precedence. |

---

## Prior Medium Findings — Resolution Status

| v1 ID | v1 Severity | Resolution |
|-------|-------------|-----------|
| F-05 | Medium | Resolved. REQ-WF-06 added to fix `isCompletionReady()` derivation from workflow config. |
| F-06 | Medium | Resolved. REQ-CLI-03 now specifies 2-second polling interval, deduplication rule, and finding-count derivation from the Findings table row count. |
| F-07 | Medium | Resolved. REQ-CLI-06 formalizes the duplicate-workflow check with exact error message, exit code, and closed-workflow behavior. The integration gap in the existing API is captured as F-03 (Medium) above. |
| F-08 | Medium | Resolved. REQ-NF-03 specifies the context injection contract: the skill prompt must include `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md`. |
| F-09 | Medium | Resolved. REQ-CR-05 now explicitly requires removal of `mapRecommendationToStatus()` and consolidation to `parseRecommendation()` as the single parser. |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-WF-05 specifies that `evaluateSkipCondition()` reads `state.artifactExists[condition.artifact]`, but the current signature only accepts `featureConfig`. Should the function signature be changed to `(condition: SkipCondition, featureConfig: FeatureConfig, artifactExists?: Record<string, boolean>): boolean`, or should the `artifact.exists` branch be handled in a separate function entirely? The TSPEC author will need this settled before implementing. |
| Q-02 | REQ-CLI-06 requires filtering by `Running` or `ContinuedAsNew` status. Should `listWorkflowsByPrefix()` on `TemporalClientWrapper` be enhanced to accept an optional status filter, or should the CLI layer add a post-filter step after receiving all workflow IDs? The current API returns IDs only (not status), so the caller cannot post-filter without additional queries. |

---

## Positive Observations

- All four High findings from v1 have been addressed — three fully, one partially with a clear residual gap captured. This is a strong v1 → v2 improvement rate.
- The discriminated union specification for `SkipCondition` in REQ-WF-05 is now precise and correct, with the `checkArtifactExists` Activity contract, the pre-loop call timing, and the runtime error for premature evaluation all specified.
- A-05 cleanly resolves the CLI-vs-workflow boundary ambiguity. The "CLI takes precedence; workflow check is a safety net" model is clear and implementable.
- REQ-CR-07's missing-file silent-skip behavior is now specified, which prevents the optimizer context assembly from becoming a hard-error surface.
- REQ-WF-06 correctly specifies a backward-compatibility fallback path for the legacy `signOffs.qa && signOffs.pm` check.
- The Change Log in Section 7 is thorough and directly maps each change to its v1 finding ID, making review of this document significantly faster.

---

## Recommendation

**Approved with Minor Issues**

> The four High findings from v1 are resolved (F-01 through F-04). The remaining findings are Medium (F-01 and F-02 above) and Low (F-03 through F-06 above). The document is implementable as written, but the TSPEC author should resolve the two Medium findings before finalizing the TSPEC:
>
> 1. **F-01:** Specify the `evaluateSkipCondition()` function signature change explicitly — which additional parameter carries `artifactExists`, and what all call sites pass to it.
> 2. **F-02:** Promote the `ReviewState.writtenVersions` field addition to a formal requirement with a REQ-ID that targets `temporal/types.ts` explicitly.
>
> The two Medium findings do not block TSPEC authoring if the TSPEC author is aware of them and resolves them during spec writing. Low findings (F-03 through F-06) can be addressed in the TSPEC or implementation phase without risk to correctness.
