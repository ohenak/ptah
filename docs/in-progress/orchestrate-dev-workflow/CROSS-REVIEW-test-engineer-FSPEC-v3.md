# Cross-Review: test-engineer — FSPEC

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/FSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Resolution Verification

All 7 findings from iteration 2 are checked against v1.2.

- **F-01** (stdout flush contract — Medium): Resolved. BR-CLI-20 now specifies the `process.stdout.write` callback pattern explicitly, including the CI/non-TTY note and the unit test assertion pattern. AT-CLI-04-A updated accordingly.
- **F-02** (pre-loop scan exhaustive over full config — Medium): Resolved. AT-WF-01-H added with a 3-phase config where `startAtPhase = "fspec-creation"` and asserts `checkArtifactExists` is called for both `"REQ"` and `"FSPEC"` pre-loop regardless of `startAtPhase`.
- **F-03** (buildContinueAsNewPayload test fixture type extension — Medium): Resolved. AT-CR-01-F now includes an explicit "Test fixture note" calling out that the existing fixture shape lacks `reviewStates` and must be extended as a required co-change alongside the function body update.
- **F-04** (AT-CR-02-E test mechanism unspecified — Medium): Resolved. AT-CR-02-E now specifies the static source-scan test mechanism: `fs.readFileSync` in `feature-lifecycle.test.ts`, asserting the `"mapRecommendationToStatus"` token is absent — same pattern as existing determinism tests.
- **F-05** (AT-CLI-02-D Given does not specify non-empty TSPEC — Low): Not addressed in v1.2. Carried forward below as F-01.
- **F-06** (AT-CLI-02-D third variant needs explicit non-empty state clarity — Low): Not addressed. Folded into F-01 below.
- **F-07** (signOffs type ambiguity — timestamp vs boolean — Low): Not addressed in v1.2. Carried forward as F-02 below.

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | Low | AT-CLI-02-D (gap case: FSPEC absent, TSPEC present) does not specify whether the beyond-gap TSPEC file is non-empty. BR-CLI-07 states that a zero-byte or whitespace-only file is treated as absent for auto-detection purposes. If the TSPEC in AT-CLI-02-D is actually whitespace-only, then the gap-case rule does not apply: there is no file beyond the gap, and the derived phase should be `req-review` (no message), not `fspec-creation`. The acceptance test Given must explicitly state that `TSPEC-my-feature.md` is non-empty (contains non-whitespace content) to make the test deterministic. Without this qualifier, an implementation correctly implementing BR-CLI-07 could derive `req-review` and still technically satisfy the underspecified Given — but would fail the Then. Same gap applies to AT-CLI-02-E: it states "only `REQ-my-feature.md` exists, FSPEC is absent, no gap beyond it" but does not specify that the REQ file itself is non-empty (a whitespace-only REQ would be treated as absent by BR-CLI-07, causing Tier 3 to apply instead of the "only REQ" case). | FSPEC-CLI-02, AT-CLI-02-D, AT-CLI-02-E, BR-CLI-07 |
| F-02 | Low | FSPEC-WF-02 AT-WF-02-A through AT-WF-02-E use `signOffs` values of `true` (boolean). The existing `isCompletionReady()` implementation and its tests in `feature-lifecycle.test.ts` use timestamp strings (e.g., `"2026-04-02T10:00:00Z"`) as sign-off values — truthiness is checked, not strict boolean equality. The new dynamic path in FSPEC-WF-02 explicitly checks `signOffs[agentId] !== true` (strict boolean `true`). This is an implicit breaking type change: existing call sites that populate `signOffs` with timestamp strings will fail the `!== true` strict check even though the timestamps are truthy. The FSPEC does not state that `signOffs` values must now be `boolean` (not timestamp strings), nor does it specify whether the legacy sign-off path is affected. Without this clarification, the TSPEC engineer cannot determine whether existing `signOffs`-populating code must be migrated. | FSPEC-WF-02, BR-WF-09, AT-WF-02-A |
| F-03 | Low | FSPEC-CR-02 specifies `parseRecommendation()` takes the extracted recommendation field value and the heading-extraction logic moves to `readCrossReviewRecommendation`. The VALUE_MATCHERS table shows the full matcher list, but there is no acceptance test for the **unrecognized-value default** path (BR-CR-09: "any unrecognized value → `revision_requested`"). AT-CR-02-A through AT-CR-02-E cover the positive recognized values and the static-deletion check, but no test asserts that `parseRecommendation("completely unrecognized phrase")` returns `{ status: "revision_requested" }`. This default is the safety net for future recommendation phrases not in the matcher list; it should have an explicit test. | FSPEC-CR-02, BR-CR-09, VALUE_MATCHERS table |
| F-04 | Low | FSPEC-WF-01 specifies `validateStructure()` must reject a `skip_if` block with `field === "artifact.exists"` AND an `equals` property present ("malformed discriminated union"). There is no acceptance test for this negative validator case. AT-WF-01-A through AT-WF-01-H cover runtime behavior of `evaluateSkipCondition` and the pre-loop scan, but none covers `validateStructure()` rejecting a malformed `artifact.exists` block. The validator rules table defines the exact violation conditions, making this directly testable at the unit level. | FSPEC-WF-01, SkipCondition validator rules table |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | FSPEC-CLI-02 Tier 3 states "No artifacts in sequence found at all → `req-review`." This applies when the REQ itself is absent (the detection sequence starts at REQ). But FSPEC-CLI-01 Step 1 validates that the REQ file exists and is non-empty before reaching phase resolution. Can Tier 3 ever be reached in practice, or is it logically unreachable because CLI-01 Step 1 would have exited 1 first? If unreachable, there should be no test for it. If reachable (e.g., the REQ passed Step 1 validation but the feature folder has no REQ artifact matching the canonical filename pattern), this needs a test. |
| Q-02 | FSPEC-CLI-03 BR-CLI-19 specifies cross-review file paths are resolved relative to the feature folder (REQ parent dir). BR-CLI-15 says "if the cross-review file cannot be read, N is reported as `?`." Does "cannot be read" cover only file-not-found, or does it also cover permission errors and corrupt file content (e.g., a findings table with no separator row)? The finding-count parser's error boundary needs to be specified for the TSPEC to write precise unit tests. |

---

## Positive Observations

- The four Medium findings from iteration 2 are all fully and precisely resolved. BR-CLI-20's `process.stdout.write` callback contract is directly implementable and directly testable as specified. The AT-WF-01-H exhaustive-scan test is well-constructed.
- AT-CR-01-F's "Test fixture note" is exemplary — it names the exact type extension required (`reviewStates: Record<string, ReviewPhaseState>`), identifies the existing fixture gap, and calls the type extension a required co-change. This prevents the implementation engineer from writing the test against the wrong fixture shape.
- AT-CR-02-E's `fs.readFileSync`-based static scan pattern is consistent with the existing determinism test pattern in `feature-lifecycle.test.ts`, making it straightforward to implement without introducing a new testing pattern.
- FSPEC-CR-02's breaking-change call-out (heading-extraction logic moves from parser to caller) is correctly scoped: it identifies `cross-review-activity.test.ts` as the only file requiring migration, which is a precise and verifiable claim.
- The new BR-CLI-27 (FakeTemporalClient must implement `signalHumanAnswer()` with call-recording body) is a strong defensive specification: it names the exact field (`humanAnswerSignals: Array<{ workflowId: string; answer: string }>`) and explains the TypeScript compilation failure mode if omitted. This prevents a common test-double implementation gap.
- BR-CLI-28's specification of `FakeTemporalClient` respecting `statusFilter` when filtering its in-memory workflow list is exactly the right level of precision — it ensures filter behavior is asserted in tests, not just that the method exists.

---

## Recommendation

**Approved with Minor Issues**

> No High or Medium findings remain. All four findings (F-01 through F-04) are Low severity. F-01 (non-empty qualifier missing from AT-CLI-02-D and AT-CLI-02-E) and F-02 (signOffs type change implicit) should be addressed in the TSPEC's test fixture design if not resolved in the FSPEC. F-03 (unrecognized-value default test) and F-04 (malformed discriminated union validator test) are straightforward additions. The FSPEC is ready for TSPEC authoring; the TSPEC author should close F-01 and F-02 by specifying fixture types explicitly, and add F-03 and F-04 as unit tests in the TSPEC test plan.
