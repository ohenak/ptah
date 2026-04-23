# Cross-Review: test-engineer — FSPEC

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/FSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Resolution Verification

All 15 findings and 5 questions from iteration 1 have been addressed. The key resolutions are confirmed:

- **F-01** (resolveNextPhase propagation): AT-WF-01-E added — specifies `resolveNextPhase()` must not catch or swallow the error. Resolved.
- **F-02** (gap-case contradiction with REQ-CLI-05): Flow diagram, business rules, phase map, and acceptance tests all reconciled. Gap-after-REQ now derives `fspec-creation` with a log message. Resolved.
- **F-03** (finding count ambiguity): BR-CLI-15 explicitly states "data rows only" excluding header and separator rows. AT-CLI-03-A updated with 4-data-row, 6-total-row example. Resolved.
- **F-04** (parseRecommendation input contract): Function signature added, BR-CR-10 updated, input parameter renamed `recommendationFieldValue`. Resolved.
- **F-05** (missing AT-CLI-01-H): Added. Resolved.
- **F-06** (AT-CLI-02-F untestable): Corrected to REQ+FSPEC present → derives `tspec-creation` → absent from custom config. Resolved.
- **F-07** (approved_with_minor_issues gap): AT-WF-02-F added. Resolved.
- **F-08** (AT-CR-01-F mechanism underspecified): Unit test of `buildContinueAsNewPayload()` return value specified explicitly. Resolved.
- **F-09** (signalHumanAnswer interface): BR-CLI-26 and FSPEC-CLI-04 specify the separate method, coexistence with `signalUserAnswer()`, and signal name `"humanAnswerSignal"`. Resolved.
- **F-10** (creation phase progress): Out-of-scope ruling stated explicitly — creation phases emit no phase-header or reviewer-result progress lines. Resolved.
- **F-11** (AT-CR-03-B workflow state invariant): `phaseStatus` remains `"running"` and no `failureInfo` is set. Resolved.
- **F-12** (AT-CLI-01-A testability): Fake Temporal client note added. Resolved.
- **F-13** (creation phase label gap): Out-of-scope by the same ruling as F-10. Resolved.
- **F-14** (checkArtifactExists not re-called): AT-WF-01-G added. Resolved.
- **F-15** (undefined revisionCount test): AT-CR-01-A2 added. Resolved.

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | Medium | FSPEC-CLI-04 BR-CLI-20 states the `Answer: ` prompt is printed WITHOUT a trailing newline, yet the Description says the prompt acts as an "inline prompt" and AT-CLI-04-A states "followed by `Answer: ` (no newline)". Neither the behavioral flow nor the acceptance tests specify what happens if the underlying stdout stream is line-buffered (common in CI environments) and the partial-line prompt never actually appears on the terminal before `ptah run` blocks on stdin. There is no acceptance test for this buffering edge case. While this may be a platform concern, the FSPEC does not specify whether `stdout.write()` must use a synchronous or async flush, or whether the absence of a newline is only specified as a formatting rule. A test cannot assert "the prompt is visible before stdin read" without specifying the flush contract. | FSPEC-CLI-04, BR-CLI-20, AT-CLI-04-A |
| F-02 | Medium | FSPEC-WF-01 BR-WF-07 states: "Pre-loop artifact checks run for ALL phases with `artifact.exists` conditions regardless of `startAtPhase`." This is important for correctness but raises an untested interaction: if `startAtPhase` skips past `req-creation`, the workflow still calls `checkArtifactExists("my-feature", "REQ")` pre-loop and populates `state.artifactExists["REQ"] = true`. Then when the main loop runs from `req-review` onward, `evaluateSkipCondition` is never called for `req-creation` (it was already skipped). The test coverage gap is: what happens if the main loop encounters a phase with `artifact.exists` that was NOT covered by the pre-loop (e.g., a custom config adds a mid-loop `artifact.exists` condition on a phase that isn't the first phase)? BR-WF-07 says "for ALL phases with `artifact.exists` conditions" but there is no acceptance test that verifies the pre-loop collection is exhaustive over the entire config, not just the phases before `startAtPhase`. AT-WF-01-A through AT-WF-01-G only cover the `req-creation` skip scenario. A test asserting the pre-loop scans ALL phases (not just phases before `startAtPhase`) is missing. | FSPEC-WF-01, BR-WF-07, AT-WF-01-A |
| F-03 | Medium | FSPEC-CR-01 AT-CR-01-F specifies the unit test mechanism as: "`buildContinueAsNewPayload()` is called with a state where `reviewStates['req-review'].writtenVersions = { 'se-review': 2 }` and the returned payload must include that value." However, the existing `buildContinueAsNewPayload()` unit tests in `tests/unit/temporal/workflows/feature-lifecycle.test.ts` only accept a state with `{ featurePath, signOffs, adHocQueue }` — there is no `reviewStates` field in the test fixture shape. The FSPEC specifies a test that requires `buildContinueAsNewPayload()` to accept and serialize `reviewStates`, but the current test infrastructure fixture (as shown in the existing test) does not include `reviewStates` in the state shape passed to `buildContinueAsNewPayload()`. The acceptance test AT-CR-01-F is not implementable against the current test pattern without also updating the type of the state argument to `buildContinueAsNewPayload()`. The FSPEC should either note this type-extension requirement explicitly or acknowledge the test will require a fixture change. | FSPEC-CR-01, AT-CR-01-F, BR-CR-03 |
| F-04 | Medium | FSPEC-CR-02 AT-CR-02-E specifies: "No file imports or calls `mapRecommendationToStatus`. The function does not exist in `feature-lifecycle.ts`." This is a static codebase assertion, not a behavioral acceptance test. The existing test suite already has a static analysis pattern for workflow determinism (PROP-TF-89 in `feature-lifecycle.test.ts`). However, AT-CR-02-E does not specify which test file this assertion belongs in, nor does it specify whether it should be a grep/source-scan test or a TypeScript compile-time absence check. Without specifying the test level and location, this acceptance criterion cannot be implemented without guessing. The description of "Codebase" as "Who" is not a standard test actor — it implies a static analysis test but doesn't say so. | FSPEC-CR-02, AT-CR-02-E |
| F-05 | Low | FSPEC-CLI-03 AT-CLI-03-A specifies that the stdout output includes `[Phase R — REQ Review] pm-author addressing feedback...` as part of the "Then" assertion. But AT-CLI-03-A's "When" is "The next poll detects the state change" — this means the poll detects the reviewer statuses, emits the reviewer lines, AND emits the addressing-feedback line. The acceptance test asserts all three lines as a single "Then" block, but the optimizer-dispatch line (`pm-author addressing feedback...`) is triggered by a different state transition (optimizer dispatch) than the reviewer result lines (reviewer status change). These are two distinct state changes that may arrive on separate poll ticks. The acceptance test should clarify whether the "Then" block means "these lines appear in sequence across multiple poll ticks" or "these lines all appear on a single poll tick". Without this clarification, an implementation that emits them on separate ticks will appear to fail the test even if the behavior is correct. | FSPEC-CLI-03, AT-CLI-03-A |
| F-06 | Low | FSPEC-CLI-02 BR-CLI-12 distinguishes "no artifacts beyond REQ" (resolves `req-review`, no log) from "gap: FSPEC absent, TSPEC present" (resolves `fspec-creation`, log message). AT-CLI-02-E tests the former ("only REQ exists, FSPEC is absent, no gap beyond it"). However, there is no acceptance test for the third variant in the phase map table: the row "REQ only (gap: FSPEC absent, TSPEC present)" explicitly appears in the Auto-Detection Phase Map table and maps to `fspec-creation` with a log message. AT-CLI-02-D covers this case, but its Given only mentions "FSPEC is absent. TSPEC is present." — it does not specify whether REQ is non-empty, nor whether the TSPEC beyond the gap is non-empty or zero-byte. If TSPEC is zero-byte (whitespace-only), BR-CLI-07 says it is treated as absent, meaning the gap case would resolve differently. AT-CLI-02-D should clarify the non-empty state of both the present REQ and the beyond-gap TSPEC. | FSPEC-CLI-02, AT-CLI-02-D, BR-CLI-07 |
| F-07 | Low | FSPEC-WF-02 specifies the legacy fallback (no `implementation-review` phase) uses `signOffs.qa && signOffs.pm`. AT-WF-02-C and AT-WF-02-D cover this path. However, FSPEC-WF-02 does not specify what the type of `signOffs[agentId]` is for the dynamic path. BR-WF-09 says "An approved status is `true` in `signOffs`" but the existing `isCompletionReady()` tests (in `feature-lifecycle.test.ts`) pass timestamp strings (`"2026-04-02T10:00:00Z"`) as the `signOffs` values, not booleans. The new `isCompletionReady()` signature takes `signOffs: Record<string, boolean>`, but the legacy path checks `signOffs.qa && signOffs.pm` which was originally a timestamp-truthy check. The FSPEC acceptance tests for the new path (AT-WF-02-A, AT-WF-02-B) use `true` booleans. The type change from timestamp-string to boolean in `signOffs` is an implicit contract change that must be specified: is `signOffs[agentId]` now always `boolean`, or is there a mixed-type legacy path? The TSPEC will need to address this, but the FSPEC should not leave it ambiguous. | FSPEC-WF-02, BR-WF-09, AT-WF-02-A |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | FSPEC-CLI-04 BR-CLI-25 says `ptah run` uses a "lenient config loader" that treats a missing `discord` section as valid. Is this a new class/function distinct from the existing `ConfigLoader`, or is it the same `ConfigLoader` with a configuration flag that relaxes the `discord` requirement? This affects how the unit test for AT-CLI-04-A sets up its fake config. |
| Q-02 | FSPEC-WF-01 BR-WF-03 specifies `state.artifactExists` is keyed by `docType` string (e.g., `"REQ"`, `"FSPEC"`) and "lookups are case-sensitive." The YAML `artifact:` value must therefore use the same casing. Is there a validator step that enforces the casing of `artifact:` values in `ptah.workflow.yaml`? Without validation, a typo (`artifact: "req"` instead of `"REQ"`) would silently return `false` and the phase would never be skipped. This is a gap between the validator spec in FSPEC-WF-01 (which only covers structural validity) and the casing constraint in BR-WF-03. |
| Q-03 | FSPEC-CR-03 BR-CR-13 says a missing context file is "silently skipped" and "no `failureInfo` is set." However, AT-CR-03-B specifies `phaseStatus` remains `"running"`. If the workflow is in the middle of dispatching the optimizer when the file is found missing, is `phaseStatus` guaranteed to still be `"running"` at the point the context list is built? Or could it transiently be `"waiting-for-reviewers"` during the optimizer dispatch build? The test must know the exact state invariant at the moment the context file check is performed. |

---

## Positive Observations

- All 15 iteration-1 findings are fully resolved. The document version history in section 6 accurately enumerates each fix, making it straightforward to verify resolution.
- The architectural note added to FSPEC-CLI-02 (CLI-side `stat` vs. Temporal Activity dual-check) removes a significant source of implementer confusion. The note is precise: "Both layers check artifact existence independently; the explicit `startAtPhase` value passed to `featureLifecycleWorkflow` always takes precedence."
- BR-CLI-18 is precise and testable: "`approved_with_minor_issues` is not a separate `ReviewerStatusValue` variant." This single sentence prevents an entire class of implementation bugs where a reviewer might introduce a third status variant.
- The `SkipCondition` TypeScript discriminated union type definition in FSPEC-WF-01 is complete and machine-readable. The validator rules table with "required fields / forbidden fields / action on violation" is exactly the right level of precision for a unit test of `validateStructure()`.
- AT-WF-01-E specifying that `resolveNextPhase()` "must NOT catch or swallow this error" is an unusually precise negative behavioral specification that will drive a valuable regression test.
- The context assembly example table in FSPEC-CR-03 (round/reviewer/status/writtenVersions/files) is sufficiently precise to be used as a table-driven test fixture without modification.
- AT-CR-01-F now specifies a concrete unit test mechanism: `buildContinueAsNewPayload(state).reviewStates["req-review"].writtenVersions` must equal `{ "se-review": 2 }`. This is directly implementable.

---

## Recommendation

**Approved with Minor Issues**

> No High findings remain. F-01 through F-04 are Medium severity. F-01 (stdout flush contract for the inline prompt) and F-02 (pre-loop artifact scan coverage) may be deferred to the TSPEC if the engineering team considers them implementation-detail concerns. F-03 (test fixture type extension for `buildContinueAsNewPayload`) and F-04 (static-analysis test location for `mapRecommendationToStatus` deletion) are precision gaps that the TSPEC can close. The FSPEC is otherwise ready for TSPEC authoring.
