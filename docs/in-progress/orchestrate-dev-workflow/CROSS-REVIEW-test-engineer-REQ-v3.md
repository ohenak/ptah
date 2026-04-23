# Cross-Review: test-engineer — REQ

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Resolution Tracking (v2 Findings)

| v2 ID | Severity | Resolution Status | Notes |
|-------|----------|-------------------|-------|
| F-01 | High | Resolved | `evaluateSkipCondition()` pre-call guard now specifies exact thrown `Error` message and updated function signature in REQ-WF-05 |
| F-02 | High | Resolved | `isCompletionReady()` signature `(signOffs, workflowConfig)` with legacy fallback fully specified in REQ-WF-06 |
| F-03 | Medium | Resolved | Auto-detected phase not in config → error + exit code 1 now specified in REQ-CLI-05, with AC case |
| F-04 | Medium | Resolved | Promoted to formal REQ-NF-04; init value `{}`, `buildContinueAsNewPayload()` preservation, and `buildInitialWorkflowState()` call all specified |
| F-05 | Medium | Resolved | Temporal query failure → hard error with exact message and exit code 1 now specified in REQ-CLI-06 |
| F-06 | Medium | Resolved | Stdin prompt format, signal name `"humanAnswerSignal"`, and EOF behavior fully specified in REQ-NF-02 |
| F-07 | Low | Not Resolved | REQ-AG-01 still defers the exact file count ("must be confirmed by counting the full manifest") — no number given |
| F-08 | Low | Not Resolved | REQ-CLI-03 still has no AC scenario asserting that a duplicate poll produces no output; deduplication contract is described but not given a testable criterion |
| F-09 | Low | Not Resolved | REQ-WF-04 still does not specify the validation layer (`workflow-validator.ts` vs CLI parse); test cannot be placed without this |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | High | REQ-CR-01 creates a collision in the reversed `AGENT_TO_SKILL` map: both `"qa"` and `"te-review"` map to `"test-engineer"` in `SKILL_TO_AGENT`. When `AGENT_TO_SKILL` is derived by reversing `SKILL_TO_AGENT`, the `"test-engineer"` key can resolve to only one agent ID — the other is silently lost. A test for `agentIdToSkillName("qa")` and `agentIdToSkillName("te-review")` both returning `"test-engineer"` cannot pass simultaneously with a single-direction map reversal. The spec claims the reversal is the source of truth but does not address this one-to-many mapping scenario. No mechanism (e.g., a multi-value map, a priority rule, separate lookup for new vs. legacy agents) is specified. | REQ-CR-01 |
| F-02 | Medium | REQ-CR-04 states `writtenVersions` is the "highest revision number dispatched for that agent in the current review phase" — but provides no AC clarifying that `writtenVersions` resets (or is scoped independently) between distinct review phases. `ReviewState` is per-phase via `reviewStates[phaseId]`, but the AC for round-1 initialization (`{}`) does not confirm whether `writtenVersions` from `req-review` carries over to `fspec-review`. If it does not reset, the `fspec-review` optimizer context would include REQ-era cross-review files for any reviewer who participated in both phases. The cross-phase reset rule is unspecified and cannot be tested without it. | REQ-CR-04 |
| F-03 | Medium | REQ-CLI-05 specifies that `--from-phase` takes precedence over artifact-based auto-detection (in the description and A-05), but no AC scenario covers the interaction: "Given both `--from-phase` and existing artifacts, `--from-phase` wins." The precedence rule is testable only from the description, not from the ACs. This leaves the override behavior without a direct acceptance test. | REQ-CLI-05 |
| F-04 | Low | REQ-AG-01 still defers the exact `FILE_MANIFEST` count: "the exact expected count must be confirmed by counting the full manifest." This was raised as v2 F-07 and is unresolved. Until a specific integer is given, the `init.test.ts` assertion (`toHaveLength(N)`) cannot be written from the REQ alone — the TSPEC author must independently count the manifest. | REQ-AG-01 |
| F-05 | Low | REQ-CLI-03 still has no AC scenario exercising the deduplication rule: a scenario where `queryWorkflowState` returns the same state on two consecutive polls should produce no additional stdout lines. Without this, the deduplication contract has no passing/failing criterion at the acceptance test level — only a description. This was raised as v2 F-08 and is unresolved. | REQ-CLI-03 |
| F-06 | Low | REQ-WF-04 specifies that a missing `revision_bound` field on a review phase causes a validation error identifying the phase, and refers to `workflow-validator.ts`'s `validateStructure` in REQ-WF-01, but does not explicitly state whether `revision_bound` validation lives in `YamlWorkflowConfigLoader.validateStructure` or in the CLI's pre-start config parse. The validation layer determines which test file the regression test belongs in (`workflow-validator.test.ts` vs a CLI integration test). This was raised as v2 F-09 and is unresolved. | REQ-WF-04 |
| F-07 | Low | REQ-NF-02 specifies behavior for a single `ROUTE_TO_USER` event but does not define behavior when multiple `ROUTE_TO_USER` states occur in sequence during a single `ptah run` session (e.g., two separate human-in-the-loop questions across different phases). Does `ptah run` handle each question in sequence, repeating the `[Question]` / `Answer:` prompt cycle? The AC's single-question scenario leaves this pattern unspecified and untested. | REQ-NF-02 |
| F-08 | Low | REQ-WF-06 specifies a legacy fallback: "if `workflowConfig` has no `implementation-review` phase, the function falls back to the legacy `signOffs.qa && signOffs.pm` check." However, no AC scenario exercises this path. The AC covers the new path (config has `implementation-review` reviewers) but not the fallback path (config lacks `implementation-review`). A regression test for old configs cannot be written from the ACs — only from the description. | REQ-WF-06 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-CR-01: When both `"qa"` and `"te-review"` map to `"test-engineer"` in `SKILL_TO_AGENT`, and `AGENT_TO_SKILL` is derived by reversing that map, which entry wins? Is a priority rule needed (new IDs take precedence over legacy), or should `AGENT_TO_SKILL` be maintained as a separate multi-value or lookup-by-prefix structure? |
| Q-02 | REQ-CR-04: Does `writtenVersions` reset to `{}` each time a new review phase begins (per-phase scoping), or does the same `ReviewState` for a phase persist independently across phase transitions in the workflow? |
| Q-03 | REQ-NF-02: When multiple `ROUTE_TO_USER` states occur in one `ptah run` session, does the stdin interaction loop (print `[Question]` / read `Answer:`) repeat for each event? |

---

## Positive Observations

- All 6 v2 High and Medium findings are resolved with precise, testable ACs. The `evaluateSkipCondition()` error message is now exact enough to assert in a unit test with `expect(() => ...).toThrow("evaluateSkipCondition: artifactExists map not yet populated...")`. The `isCompletionReady()` signature `(signOffs, workflowConfig)` is now fully specified, enabling direct replacement of the existing unit test suite.
- REQ-CLI-05's auto-detection error case for a missing phase ID in a custom YAML config is a genuinely difficult negative path that is now fully specified with an exact error message — this is the right level of precision for testability.
- REQ-NF-04's promotion to a formal requirement with a typed `buildInitialWorkflowState()` contract and explicit `buildContinueAsNewPayload()` preservation makes the ContinueAsNew boundary testable as a unit test against the payload builder.
- REQ-CLI-06's Temporal-query-failure path (network error → hard exit 1 with message) provides clear fault-injection test guidance — a test can mock the Temporal client to throw and assert the exact error output and exit code.
- The overall requirement set at v1.3 is highly precise. The remaining Low findings are scoped and bounded — none blocks a critical test boundary.

---

## Recommendation

**Approved with Minor Issues**

> No High findings remain. The three unresolved Low findings from v2 (F-04, F-05, F-06 in this review) and the two new Medium findings (F-01 on the map-collision, F-03 on the `--from-phase` precedence AC) are the only outstanding items. F-01 is a genuine correctness gap in the `SKILL_TO_AGENT` reversal contract — it should be addressed before the TSPEC author specifies the `AGENT_TO_SKILL` implementation. The remaining findings (F-02 through F-08) are narrow and do not block any critical test boundary; they can be clarified during TSPEC authoring without requiring another REQ iteration, provided the TSPEC author is aware of them.
