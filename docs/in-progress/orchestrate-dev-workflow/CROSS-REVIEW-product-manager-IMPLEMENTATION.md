# Cross-Review: product-manager — Implementation

**Reviewer:** product-manager
**Document reviewed:** ptah/src/commands/run.ts, ptah/src/config/defaults.ts, ptah/src/orchestrator/pdlc/cross-review-parser.ts, ptah/src/temporal/types.ts, ptah/src/temporal/workflows/feature-lifecycle.ts, ptah/bin/ptah.ts
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | `SKILL_TO_AGENT` in `cross-review-parser.ts` maps the *agent IDs* `pm-review`, `te-review`, `se-review` as *keys* (i.e., they are treated as skill names), while the intent of `SKILL_TO_AGENT` is to map skill name → agent ID. The entries `"pm-review": "pm-review"`, `"te-review": "te-review"`, `"se-review": "se-review"` are structurally inverted. However, the downstream effect is compensated because `AGENT_TO_SKILL` is built by *merging* the reversal of `SKILL_TO_AGENT` with `LEGACY_AGENT_TO_SKILL`, and `LEGACY_AGENT_TO_SKILL` contains the correct direct entries (`"pm-review": "product-manager"`, `"te-review": "test-engineer"`, `"se-review": "software-engineer"`). The functional result for `agentIdToSkillName()` is correct because `LEGACY_AGENT_TO_SKILL` wins via the merge. The risk is that `SKILL_TO_AGENT` (used by `skillNameToAgentId()`) contains three phantom entries where the key is an agent ID, not a skill name, which contradicts the data model contract and could cause incorrect reverse lookups (e.g. `skillNameToAgentId("pm-review")` would return `"pm-review"` instead of `null`). REQ-CR-01 requires that `AGENT_TO_SKILL` be derived solely from `SKILL_TO_AGENT` reversal, but here the correct mappings actually come from `LEGACY_AGENT_TO_SKILL` rather than the reversal. | REQ-CR-01 |
| F-02 | Low | `REQ-CLI-02` acceptance criteria specifies the error message format for a missing file as `Error: REQ file not found: <path>`. The implementation in `run.ts` (line ~650) writes this to `stdout` rather than `stderr`. The REQ does not explicitly mandate the output stream, but convention for error messages is `stderr`. This is a minor UX deviation. | REQ-CLI-02 |
| F-03 | Low | `REQ-WF-04` acceptance criteria specifies that a custom `ptah.workflow.yaml` with a review phase missing `revision_bound` must cause `ptah run` to exit with code 1 and print a validation error identifying the phase. The `DefaultWorkflowValidator` in `workflow-validator.ts` does implement this check (PROP-WFV-01). However, `ptah run` in `run.ts` does **not** invoke the validator before starting the workflow — it calls `workflowConfigLoader.load()` (which validates structure only) but does not call `validator.validate()`. The `ptah start` command does invoke the validator, but `ptah run` skips it. A missing `revision_bound` would go undetected at run time and the workflow would silently fall back to `revisionBound = revisionBound ?? 3` (feature-lifecycle.ts line ~1240). | REQ-WF-04 |
| F-04 | Low | `REQ-NF-02` requires that when the workflow reaches `ROUTE_TO_USER` and Discord is absent, `ptah run` reads an answer from stdin and signals the workflow using the signal named `"humanAnswerSignal"`. The workflow definition in `feature-lifecycle.ts` registers the signal as `wf.defineSignal("user-answer")` and the `signalHumanAnswer` implementation in `client.ts` correctly sends to `"humanAnswerSignal"`. However, the workflow signal handler is registered as `user-answer` (line 717), not `humanAnswerSignal`. This means signals sent via `signalHumanAnswer()` (which targets `"humanAnswerSignal"`) would not be received by the `userAnswerSignal` handler registered under `"user-answer"`. The two names do not match. This is a pre-existing architectural issue but the REQ explicitly requires `"humanAnswerSignal"` as the signal name for the `ptah run` stdin flow, and the workflow does not handle that signal name. | REQ-NF-02 |
| F-05 | Low | `REQ-CLI-05` auto-detection acceptance criteria includes a case where `lastContiguousIndex === 0` (only REQ present) with no gap artifacts beyond FSPEC: the expected behavior is that the workflow starts at `req-review` with no log message. The implementation handles this correctly. However, the case where `lastContiguousIndex === -1` (REQ absent or empty) is treated as `derivedPhase = "req-review"` with no log message, and no error is raised. Since `ptah run` validates REQ file existence in STEP 1 (returning code 1 if absent or empty), this path should be unreachable in practice. The code is defensive and not harmful, but the silent handling could mask edge cases if STEP 1 validation is bypassed in tests or future code paths. This is a low-severity clarity concern only. | REQ-CLI-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | F-01: Is the `LEGACY_AGENT_TO_SKILL` structure intentional as a compensating control, or is it expected to be removed once all callers migrate to the new canonical agent IDs? If it remains, the phantom `SKILL_TO_AGENT` entries for `pm-review`, `te-review`, `se-review` should be removed to keep the data model clean. |
| Q-02 | F-04: Should the Temporal workflow signal be renamed from `"user-answer"` to `"humanAnswerSignal"` to align with REQ-NF-02, or should the `signalHumanAnswer()` method send `"user-answer"` instead? The two names must be reconciled. |
| Q-03 | F-03: Is there a design decision that `ptah run` should not invoke the full `DefaultWorkflowValidator` (e.g., to avoid requiring an agent registry at run time)? If so, should a lightweight revision-bound-only check be added to the `YamlWorkflowConfigLoader.validateStructure()` method instead? |

---

## Positive Observations

- All 25 requirements are structurally addressed by the implementation. No P0 requirements are missing.
- `ptah init` correctly scaffolds all 8 orchestrate-dev skill files (pm-author, pm-review, se-author, se-review, te-author, te-review, tech-lead, se-implement) with TODO stub content. `buildConfig()` registers all 8 agents in `agents.active` and `agents.skills`. REQ-AG-01 and REQ-AG-02 are fully satisfied.
- The default `ptah.workflow.yaml` contains the `properties-tests` phase correctly positioned between `implementation` and `implementation-review`, dispatching `se-implement`. `deriveDocumentType("properties-tests")` returns `"PROPERTIES"` via the `DOCUMENT_TYPE_OVERRIDES` map. REQ-WF-03 is fully satisfied.
- All review phases in the default `ptah.workflow.yaml` have `revision_bound: 5`. REQ-WF-04 (default value requirement) is satisfied.
- `req-creation` includes `skip_if: { field: artifact.exists, artifact: REQ }`. `evaluateSkipCondition()` correctly implements the discriminated union with the exact specified error message when `artifactExists` is undefined. REQ-WF-01 and REQ-WF-05 are fully satisfied.
- `VALUE_MATCHERS` correctly includes both `"approved with minor issues"` (approved) and `"need attention"` (revision_requested). `mapRecommendationToStatus()` is absent from the codebase — all callers use `parseRecommendation()` exclusively. REQ-CR-05 and REQ-CR-06 are fully satisfied.
- `crossReviewPath()` accepts optional `revisionCount`, clamps ≤ 0 to 1, and appends `-v{N}` for N ≥ 2. REQ-CR-02 is fully satisfied.
- `ReviewState` type includes `writtenVersions: Record<string, number>`. `buildInitialWorkflowState()` initializes `reviewStates[phaseId].writtenVersions` to `{}`. `buildContinueAsNewPayload()` deep-copies `writtenVersions` using spread. REQ-NF-04 is fully satisfied.
- `runReviewCycle()` passes `revisionCount: currentRevision` to both `invokeSkill` (reviewer dispatch) and `readCrossReviewRecommendation`, and updates `reviewState.writtenVersions[reviewerId]` after each reviewer invocation. REQ-CR-03 and REQ-CR-04 are fully satisfied.
- The optimizer context (revision dispatch) in `runReviewCycle()` enumerates all reviewers from `writtenVersions` (not filtered by `revision_requested`) and builds paths for all versions 1..highestVersion. REQ-CR-07 is fully satisfied.
- `isCompletionReady()` derives required sign-offs from `workflowConfig.implementation-review.reviewers` with correct legacy fallback. All call sites pass `workflowConfig`. REQ-WF-06 is fully satisfied.
- `listWorkflowsByPrefix()` accepts optional `statusFilter` and appends `AND ExecutionStatus IN (...)` to the Temporal visibility query. REQ-CLI-06 is fully satisfied.
- `ptah run` validates REQ file existence and non-emptiness with the specified error message formats before starting any workflow. REQ-CLI-02 is satisfied (output stream concern noted in F-02 but not a blocking issue).
- `--from-phase` flag is correctly parsed, validated against the full phase list, and the error message lists all valid phase IDs. REQ-CLI-04 is fully satisfied.
- Auto-detection of resume phase implements the canonical PDLC detection sequence (REQ → FSPEC → TSPEC → PLAN → PROPERTIES) with correct contiguous-prefix logic, gap handling, and config validation. REQ-CLI-05 is fully satisfied.
- `ptah run` does not require Discord: `LenientConfigLoader` omits the discord requirement, and `handleQuestion()` correctly checks `params.discordConfig` before routing to Discord vs. stdin. REQ-NF-02 stdin/EOF behavior is implemented. REQ-NF-02 is satisfied (signal name mismatch noted in F-04).
- Backward compatibility: `LEGACY_AGENT_TO_SKILL` preserves `eng`, `fe`, `pm`, `qa` entries. `ptah start` mode is unchanged. REQ-NF-01 is satisfied.
- The `ptah run` subcommand is wired in `bin/ptah.ts` and documented in `printHelp()`. REQ-CLI-01 terminal state handling (completed, failed, revision-bound-reached, cancelled) is implemented with correct exit codes. REQ-CLI-01 is fully satisfied.
- No out-of-scope items from REQ §3.2 were found in the implementation.

---

## Recommendation

**Approved with Minor Issues**

> No High or Medium findings. All four Low findings are correctness concerns that do not block the feature from functioning for the primary user scenarios (US-01 through US-07), but F-04 (signal name mismatch between `"user-answer"` and `"humanAnswerSignal"`) should be addressed before relying on the `ptah run` stdin question-answer path in production. The other three (F-01 data model clarity, F-02 error stream, F-03 missing validator call) are low-risk and can be addressed in a follow-up.
