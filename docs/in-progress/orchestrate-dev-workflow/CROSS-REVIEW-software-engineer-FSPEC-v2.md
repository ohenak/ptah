# Cross-Review: software-engineer — FSPEC

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/FSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Resolution Verification (v1 Findings)

| v1 ID | Status | Notes |
|-------|--------|-------|
| F-01 (High) | Resolved | `deriveDocumentType("properties-tests")` special-case lookup added to FSPEC-WF-01 with full spec and AT-WF-01-F. |
| F-02 (High) | Resolved | Full TypeScript discriminated union for `SkipCondition` added to FSPEC-WF-01, including validator rules table for both branches. |
| F-03 (High) | Resolved | `"humanAnswerSignal"` vs `"user-answer"` conflict resolved: two distinct coexisting signals specified, `signalHumanAnswer()` method contract added, architectural decision documented in FSPEC-CLI-04. |
| F-04 (High) | Resolved | `buildContinueAsNewPayload()` explicitly required to serialize full `reviewStates` including `writtenVersions`; unit test mechanism added to AT-CR-01-F. |
| F-05 (Medium) | Resolved | Filter removal at `feature-lifecycle.ts` line 1319 is explicitly called out in FSPEC-CR-01 BR-CR-06. |
| F-06 (Medium) | Resolved | `"default"` discipline key specified for new default YAML in FSPEC-WF-01; `ReviewerManifest` canonical form documented. |
| F-07 (Medium) | Resolved | `WorkflowConfigError` catch-and-reformat specified in BR-CLI-06, error message added to error table, AT-CLI-01-H added. |
| F-08 (Medium) | Resolved | `approved_with_minor_issues` collapse to `"approved"` `ReviewerStatusValue` explicitly specified in BR-CLI-18; no sub-variant needed. |
| F-09 (Medium) | Resolved | Cross-review file path scoped to feature folder (REQ parent dir), BR-CLI-19 added, remote deployment limitation noted. |
| F-10 (Medium) | Resolved | Architectural note added to FSPEC-CLI-02 distinguishing CLI-side `stat` from Temporal Activity. |
| F-11 (Low) | Resolved | FSPEC-CR-01 BR-CR-04 now references `SkillActivityInput.revisionCount` type change per REQ-NF-03. |
| F-12 (Low) | Resolved | BR-WF-10 now explicitly notes zero-reviewer consistency with `computeReviewerList()`. |
| F-13 (Low) | Resolved | FSPEC-CLI-04 BR-CLI-25 now specifies lenient config loader requirement for `ptah run`. |
| F-14 (Low) | Resolved | AT-CLI-02-F corrected to use REQ+FSPEC present → derives `tspec-creation` → absent from custom config. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | `parseRecommendation()` function contract conflict: FSPEC-CR-02 specifies the function signature as `parseRecommendation(recommendationFieldValue: string)` and states it takes "the normalized value of the `Recommendation:` field only — not the full file text." However, the existing implementation in `cross-review-parser.ts` takes the full file content (`fileContent: string`) and performs its own heading extraction, code-fence skipping, and multi-line look-ahead. The FSPEC instructs callers to "extract the `Recommendation:` field value from the file before calling `parseRecommendation()`." This creates an incompatibility: the current `readCrossReviewRecommendation` activity calls `parseRecommendation(content)` passing full file content — it does not pre-extract the field. The FSPEC must specify whether (a) the existing function signature and call convention is preserved (full file content), requiring only VALUE_MATCHERS additions, or (b) the function is refactored to accept only the extracted field value, requiring `readCrossReviewRecommendation` to also be updated to pre-extract the field before calling the parser. As written, a strict reading of the FSPEC leads to a breaking change in the call site of an existing activity without that break being identified as such. | FSPEC-CR-02 / BR-CR-10 |
| F-02 | Medium | `SkipCondition` discriminated union: the FSPEC specifies a new TypeScript type in FSPEC-WF-01, but the existing `PhaseDefinition.skip_if?: SkipCondition` field in `workflow-config.ts` uses the old type `{ field: string; equals: boolean }`. The FSPEC correctly specifies the new union but does not call out that `evaluateSkipCondition()` in `feature-lifecycle.ts` is currently typed with the old signature `(condition: { field: string; equals: boolean }, featureConfig: FeatureConfig): boolean`. The function's call sites also pass `nextPhase.skip_if` typed as the old `SkipCondition`. Changing the type requires updating all three: (1) the `SkipCondition` type in `workflow-config.ts`, (2) the `evaluateSkipCondition()` signature in `feature-lifecycle.ts`, and (3) the `resolveNextPhase()` call site which passes `nextPhase.skip_if` typed as `SkipCondition` to `evaluateSkipCondition()`. The FSPEC covers (2) and (3) via REQ-WF-05, but does not call out (1) — the `workflow-config.ts` type definition — as a required change. An implementer reading only the FSPEC might miss updating the source-of-truth type in `workflow-config.ts`. | FSPEC-WF-01 / REQ-WF-05 |
| F-03 | Medium | `TemporalClientWrapper` interface extension for `signalHumanAnswer`: FSPEC-CLI-04 BR-CLI-26 specifies that `TemporalClientWrapper` exposes a new method `signalHumanAnswer(workflowId: string, answer: string): Promise<void>`. However, `TemporalClientWrapper` is an interface (in `client.ts`), and `TemporalClientWrapperImpl` is its concrete implementation. Adding `signalHumanAnswer` to the interface also requires updating the `FakeTemporalClient` used in tests (defined in `factories.ts` per the import pattern in the codebase). The FSPEC does not mention that `FakeTemporalClient` must also implement the new method — failing to do so causes TypeScript compilation errors in all test files that use `FakeTemporalClient`. This is a required co-change that should be explicit. | FSPEC-CLI-04 / BR-CLI-26 |
| F-04 | Medium | `listWorkflowsByPrefix` statusFilter enhancement: FSPEC-CLI-01 Step 5 and BR-CLI-04 describe filtering by `["Running", "ContinuedAsNew"]` status. Open question OQ-04 asks whether this is a breaking change or a new overload. The current `TemporalClientWrapper` interface declares `listWorkflowsByPrefix(prefix: string): Promise<string[]>` with no status filter. The FSPEC leaves this unresolved ("Open — engineering to decide"), but this is a blocking implementation decision: if the method signature changes, the interface definition changes, `TemporalClientWrapperImpl` changes, and `FakeTemporalClient` changes. If it is a new overload, the interface needs both signatures. The FSPEC should not leave an interface-contract question open — this directly affects what code gets written and whether existing callers of `listWorkflowsByPrefix` (e.g., in `start.ts` or `migrate.ts`) continue to compile. Engineering should decide before implementation, not during. | FSPEC-CLI-01 Step 5 / OQ-04 |
| F-05 | Low | `ContinueAsNewPayload` type vs `reviewStates` inclusion: FSPEC-CR-01 BR-CR-03 states "`buildContinueAsNewPayload()` must be extended to serialize the full `reviewStates` map (including `writtenVersions` within each `ReviewState`) into the `ContinueAsNewPayload` type." The existing `ContinueAsNewPayload` interface (in `feature-lifecycle.ts` lines 354–360) only carries `featurePath`, `worktreeRoot`, `signOffs`, and `adHocQueue`. The FSPEC correctly mandates extending this type but does not specify what `StartWorkflowParams` — the type used to restart the workflow on `ContinueAsNew` — must do with the recovered `reviewStates`. `featureLifecycleWorkflow` currently accepts `initialReviewState?: Record<string, ReviewPhaseState>` in `StartWorkflowParams`. The `buildContinueAsNewPayload` result must flow back into `featureLifecycleWorkflow` via `ContinueAsNew`. The FSPEC should confirm that `ContinueAsNewPayload` is passed as args to the next run and that `initialReviewState` in `StartWorkflowParams` is populated from it — this is the integration path. It is implicit but not stated. | FSPEC-CR-01 / BR-CR-03 |
| F-06 | Low | FSPEC-CLI-03 Phase Label Map omission: the map covers `req-review`, `fspec-review`, `tspec-review`, `plan-review`, `properties-review`, `properties-tests`, and `implementation-review`. It does not include creation phases (`req-creation`, `fspec-creation`, `tspec-creation`, `plan-creation`, `properties-creation`, `implementation`). The FSPEC states creation phases "emit no phase-header or reviewer-result progress lines" and only emit an optimizer-dispatch line. The dispatch line format uses `{phase-label}` (e.g., `[Phase {phase-label} — {phase-title}]`). If creation phases do emit optimizer-dispatch lines (per the behavioral flow), labels for them are not defined. The FSPEC should either (a) confirm creation phase dispatch lines use the phase ID verbatim instead of a label, or (b) extend the Phase Label Map to include creation phase labels. | FSPEC-CLI-03 / Phase Label Map |
| F-07 | Low | `resolveNextPhase()` currently calls `evaluateSkipCondition(nextPhase.skip_if, featureConfig)` at line 217 with only two arguments (the existing signature). FSPEC-WF-01 AT-WF-01-E specifies that `resolveNextPhase()` must propagate the throw from `evaluateSkipCondition()` when called with an `artifact.exists` condition before pre-loop activity. However, after the signature change, `resolveNextPhase()` must also be updated to accept and pass through the `artifactExists` map as a third argument. The FSPEC specifies the propagation behavior but does not state that `resolveNextPhase()` itself needs a signature change to accept and forward `artifactExists`. All call sites of `resolveNextPhase()` in the main loop (lines 1517, 1529, 1568, 1595, 1621, 1630) must also be updated. This is a cascade of required changes not enumerated in the FSPEC. | FSPEC-WF-01 / AT-WF-01-E / REQ-WF-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | OQ-03 remains open: when PROPERTIES file is absent during `properties-tests` phase, what does `se-implement` include in its output? The FSPEC defers this to the agent. Since `ptah run` progress reporting reads reviewer statuses and dispatches the optimizer based on them, if `se-implement` returns `TASK_COMPLETE` without failing, the workflow advances. Is there any workflow-level behavior change when the PROPERTIES context document is missing, or is this purely the agent's concern? |
| Q-02 | OQ-04 remains open on `listWorkflowsByPrefix` method signature. This should be resolved before TSPEC authoring because the interface shape affects both the implementation and every test that uses `FakeTemporalClient`. Should the method accept an optional second argument (`statusFilter?`) or should a new method be added? |
| Q-03 | FSPEC-CR-02 specifies `parseRecommendation()` takes the extracted field value. Does this mean the current heading-extraction logic (HEADING_PATTERN, BOLD_PATTERN, TABLE_PATTERN, code-fence handling) moves to the caller (`readCrossReviewRecommendation`) and out of `parseRecommendation()`? Or does `parseRecommendation()` retain its current full-file-content behavior and the FSPEC description simply means the field extraction is an internal first step? This needs to be explicit before implementation. |

---

## Positive Observations

- All 4 High and 6 Medium findings from v1 are addressed with precision. The v1 feedback loop produced specific, implementable specifications for every item.
- The discriminated union definition for `SkipCondition` with the validator rules table is exactly what an implementer needs — no ambiguity on what `validateStructure()` must enforce.
- FSPEC-CLI-04's two-signal coexistence model (`"user-answer"` preserved, `"humanAnswerSignal"` added) cleanly avoids a breaking change to `ptah start` while enabling the new headless path.
- AT-CR-01-F's unit test mechanism for `buildContinueAsNewPayload()` is a correct and testable specification — calling the function with a known state and asserting the serialized payload contains the expected `writtenVersions` directly.
- BR-CR-06 explicitly calling out the line 1319 filter removal prevents a subtle bug where optimizer context would be silently incomplete.
- The contiguity gap rule in FSPEC-CLI-02 (gap after REQ derives `fspec-creation`, no-artifacts-beyond-REQ derives `req-review`) is now correctly specified and consistent across the behavioral flow, business rules, phase map, and acceptance tests.

---

## Recommendation

**Need Attention**

> F-01 through F-04 are Medium severity and must be resolved before implementation begins:
>
> - **F-01**: Clarify whether `parseRecommendation()` is refactored to accept extracted field value only (breaking change to `readCrossReviewRecommendation` call site) or retains full-file-content input (only VALUE_MATCHERS additions needed). The current FSPEC implies a refactor that is not identified as a breaking change.
> - **F-02**: Add an explicit callout that the `SkipCondition` type definition in `workflow-config.ts` must be replaced with the new discriminated union (not only the `evaluateSkipCondition()` signature in `feature-lifecycle.ts`).
> - **F-03**: Note that `FakeTemporalClient` (test double implementing `TemporalClientWrapper`) must also implement `signalHumanAnswer()` alongside `TemporalClientWrapperImpl`.
> - **F-04**: Resolve OQ-04 — decide whether `listWorkflowsByPrefix` gets an optional `statusFilter` parameter or a new method, and update the FSPEC accordingly. This is a blocking interface-contract decision.
>
> F-05 through F-07 are Low severity and may be addressed in TSPEC if the PM chooses to defer, but documenting the `ContinueAsNew` integration path and the `resolveNextPhase()` signature cascade reduces TSPEC authoring risk.
