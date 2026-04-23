# Cross-Review: test-engineer — REQ

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/REQ-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|-------------|
| F-01 | High | REQ-CLI-01 acceptance criterion does not define what "terminal state" means. A test cannot assert on process exit without knowing the full set of terminal states (completed, failed, revision-bound-reached, cancelled). "Exits when the workflow reaches a terminal state" is untestable without an enumeration. | REQ-CLI-01 |
| F-02 | High | REQ-CLI-05 acceptance criterion says `ptah run` auto-detects from "existing document artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES)" but does not specify the canonical detection order or the exact artifact filename pattern used (e.g. `TSPEC-{slug}.md`). Two test cases use the same description ("TSPEC found, PLAN missing") but the detection algorithm for intermediate states — what if FSPEC is missing but TSPEC is present — is undefined. A test for an out-of-order artifact set cannot be written. | REQ-CLI-05 |
| F-03 | High | REQ-WF-05 introduces `{ field: "artifact.exists", artifact: "<DOC_TYPE>" }` as a new `skip_if` field type, but the existing `evaluateSkipCondition` tests (and the function signature in `feature-lifecycle.ts`) only accept `{ field: string, equals: boolean }`. There is no acceptance criterion for what `evaluateSkipCondition` returns when `revisionCount` is not yet available at `evaluateSkipCondition` call time (workflow start vs. mid-run). This gap means the test boundary for the new field type cannot be determined without spec clarification. | REQ-WF-05 |
| F-04 | High | REQ-CR-04 requires `runReviewCycle()` to pass `reviewState.revisionCount + 1` to both `invokeSkill` and `readCrossReviewRecommendation`. The current `SkillActivityInput` type (in `temporal/types.ts`) has no `revisionCount` field. REQ-NF-03 addresses the type addition, but REQ-CR-04 is listed as P0 and REQ-NF-03 as P0 — yet there is no explicit dependency from REQ-CR-04 → REQ-NF-03. If REQ-NF-03 is not implemented first, any test for REQ-CR-04 will fail at the type level, not the behavior level. Missing explicit ordering dependency. | REQ-CR-04, REQ-NF-03 |
| F-05 | High | REQ-CR-07 requires the optimizer context to include ALL prior iteration cross-review files. The acceptance criterion describes round 2 with two reviewers, but does not specify behavior when a prior iteration file does not exist on disk (e.g. v1 was never written because the agent failed). Is a missing prior-iteration file a hard error, silently skipped, or causes parse_error status? This missing error scenario makes the test for context assembly incomplete. | REQ-CR-07 |
| F-06 | Medium | REQ-CLI-02 specifies the error message for a missing file (`Error: REQ file not found: ...`) but does not specify the error message or exit code for a file that exists but is empty. The description says both conditions fail, but only one error message is given. A test for the empty-file case cannot assert on the error text. | REQ-CLI-02 |
| F-07 | Medium | REQ-CLI-03 acceptance criterion specifies a partial stdout format (`[Phase R — REQ Review] Iteration 1`, `  se-review:  Approved ✅`, `  te-review:  Need Attention (N findings)`). "N findings" is not defined — is N the count of High+Medium findings, all findings, or the count of rows in the Findings table? A test must know the exact derivation to assert on the output string. | REQ-CLI-03 |
| F-08 | Medium | REQ-CLI-04 acceptance criterion for the invalid phase ID case specifies `Error: phase "nonexistent" not found. Valid phases: [req-creation, req-review, ...]`. The `...` is literal in the spec. If the implementation lists all phases, a test cannot assert on the exact message without knowing the full phase list (which is user-configurable). The AC should either mandate the format precisely or allow any valid-phase listing. | REQ-CLI-04 |
| F-09 | Medium | REQ-WF-01 uses the phrase "when the REQ document already exists on disk" but the REQ filename pattern is `REQ-{slug}.md`. The AC does not specify what happens when a file named `REQ-my-feature.md` exists but the slug cannot be derived from the workflow path (i.e. the slug is derived differently by `ptah run` vs. the `skip_if` evaluator). This ambiguity creates an untestable path for slug mismatch. | REQ-WF-01 |
| F-10 | Medium | REQ-NF-01 backward compatibility acceptance criterion states "cross-review files written by old agents (`engineer`, `test-engineer`) continue to be parsed correctly." However, `agentIdToSkillName("eng")` currently returns `"engineer"` and `agentIdToSkillName("qa")` returns `"test-engineer"`. REQ-CR-01 adds new entries (`pm-review`, `se-review`, `te-review`). There is no AC verifying the old entries (`eng`, `qa`, `pm`, `fe`) still resolve correctly post-change — only implied by "continue to work." A regression test case is missing from REQ-NF-01. | REQ-NF-01, REQ-CR-01 |
| F-11 | Medium | REQ-CR-02 specifies `crossReviewPath()` accepts an optional `revisionCount` parameter, but the existing function signature takes exactly `(featurePath, skillName, documentType)`. There is no AC for what happens when `revisionCount` is 0 (below the 1-indexed minimum), or negative. The test boundary for invalid values is undefined. | REQ-CR-02 |
| F-12 | Medium | REQ-NF-02 acceptance criterion says "No Discord-related error is thrown" but does not specify the observable behavior of the Discord config-absent path for the human-in-the-loop question routing. The AC says "questions still route to Discord only when `discord` config is present" — so when Discord config is absent and a question arises, what does `ptah run` do? Silently drop the question? Print to stdout and pause? This is an unspecified negative path that is critical for integration testing. | REQ-NF-02 |
| F-13 | Low | REQ-WF-04 acceptance criterion says "every review phase entry in `ptah.workflow.yaml` contains `revision_bound: 5`." It does not specify whether a missing `revision_bound` field on a review phase defaults to 5 or is an error. The test for a partially-defined YAML cannot be written without this. | REQ-WF-04 |
| F-14 | Low | REQ-WF-02 references the "Reviewer Assignment Matrix in `orchestrate-dev/SKILL.md`" by reference rather than embedding the matrix. If the SKILL.md changes independently, this AC becomes stale without any REQ update. For testability, the reviewer assignment table should be reproduced here. | REQ-WF-02 |
| F-15 | Low | REQ-WF-03 acceptance criterion says the `properties-tests` phase uses `context_documents: [{feature}/REQ, {feature}/TSPEC, {feature}/PLAN, {feature}/PROPERTIES]`. The PLAN and PROPERTIES documents are produced in earlier phases, but there is no explicit AC stating what happens if PROPERTIES does not yet exist when the phase runs (e.g. the properties-creation phase was skipped). | REQ-WF-03 |
| F-16 | Low | REQ-AG-01 acceptance criterion says "all 8 skill stub files exist under `ptah/skills/`." The current `init.test.ts` asserts on exactly 18 files in `FILE_MANIFEST`. Adding 8 stub files would raise the count to at least 26, but the test hardcodes `toHaveLength(18)`. The acceptance criterion needs to state the new expected total file count so the existing test can be updated with confidence. | REQ-AG-01 |
| F-17 | Low | R-04 in the Risks section states "`ptah run` checks for an existing running workflow before starting; exits with error if one is found." This behavior is not captured in any requirement or acceptance criterion. If implemented, it is untestable because no REQ defines the error message, exit code, or the Temporal query used to detect the duplicate. | Section 5, Risks |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-CLI-01: What are the full set of terminal states for the `featureLifecycleWorkflow`? Does `revision-bound-reached` count as terminal for `ptah run` (exit 1) or does it pause and wait? |
| Q-02 | REQ-CLI-05: When artifacts exist out of canonical order (e.g. TSPEC present but FSPEC absent), does auto-detection use the last artifact present, the first gap, or the last contiguous artifact? |
| Q-03 | REQ-WF-05: Is `evaluateSkipCondition` called once at workflow start and the result stored in workflow state (to preserve determinism), or re-evaluated at each `resolveNextPhase` call? The answer determines the test level (unit vs. workflow integration). |
| Q-04 | REQ-CR-07: If a prior-iteration cross-review file (e.g. v1) is missing from disk when building optimizer context for round 2, is that a hard error, a warning, or silently skipped? |
| Q-05 | REQ-NF-02: When Discord config is absent and the workflow reaches a `ROUTE_TO_USER` state during `ptah run`, what is the expected behavior — stdout pause, error, or workflow termination? |
| Q-06 | REQ-CLI-03: Is the finding count in `Need Attention (N findings)` derived from the Findings table row count in the cross-review file, or from a different field? |

---

## Positive Observations

- The domain decomposition into CLI, WF, AG, CR, NF is clean and maps directly to testable module boundaries. Each domain can be independently unit-tested.
- REQ-CR-05 and REQ-CR-06 are precise and immediately testable as unit tests against `parseRecommendation()` — no ambiguity.
- REQ-CR-02 provides concrete examples for revision counts 1 and 3, making boundary tests straightforward to write.
- REQ-CR-01 acceptance criterion lists exact input/output pairs for all three new agent mappings — sufficient to write three parameterized unit tests.
- The Risk section's R-02 mitigation ("make `revisionCount` optional with default 1") proactively addresses the backward-compatibility regression for `crossReviewPath()` callers — this is the right design for testability.
- REQ-CLI-02 includes the exact error message string, which is the minimum bar for a testable CLI acceptance criterion.
- The `startAtPhase` support already exists in `buildInitialWorkflowState` (confirmed in `feature-lifecycle.test.ts`), so REQ-CLI-04's underlying workflow contract is already tested — the new work is CLI-layer validation only.

---

## Recommendation

**Need Attention**

> High findings F-01 through F-05 must be resolved before a TSPEC can be written. Each blocks a different test boundary: F-01 blocks CLI exit-code tests, F-02 blocks the auto-detection algorithm tests, F-03 blocks the new `skip_if` field-type unit tests, F-04 blocks the cross-phase revision count integration tests, and F-05 blocks the optimizer context assembly tests. The medium findings (F-06 through F-12) each leave at least one negative or error scenario untestable.
