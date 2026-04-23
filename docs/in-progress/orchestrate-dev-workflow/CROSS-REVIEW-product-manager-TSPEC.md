# Cross-Review: product-manager — TSPEC

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/TSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 1

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | High | The `isCompletionReady()` algorithm (Section 5.2) uses `signOffs[agentId] === undefined` as the "not signed off" check. The REQ and FSPEC specify that completion requires `signOffs[agentId] === true` (a boolean, not merely presence). The current TSPEC legacy fallback also checks `signOffs.qa !== undefined && signOffs.pm !== undefined` rather than `=== true`. If sign-offs are stored as timestamp strings (as noted in the TSPEC's own edge-case note), a present-but-non-`true` value would incorrectly pass the check. The REQ AC explicitly requires `signOffs[agentId] === true`, and FSPEC-WF-02 BR-WF-09 clarifies that `"revision_requested"` maps to `false`. The TSPEC implementation must be consistent with the requirement. | REQ-WF-06, FSPEC-WF-02 |
| F-02 | High | Section 7 (AGENT_TO_SKILL Mapping) exposes an unresolved key-collision in `SKILL_TO_AGENT`: both old entries `"product-manager" → "pm"` and `"test-engineer" → "qa"` are proposed to be overwritten with `"product-manager" → "pm-review"` and `"test-engineer" → "te-review"`. The final proposed implementation removes the old `"product-manager"` and `"test-engineer"` entries from `SKILL_TO_AGENT` and relies on `LEGACY_AGENT_TO_SKILL` for backward compat. However, REQ-NF-01 states the old entries must be preserved in `SKILL_TO_AGENT` (not just in a side table), and REQ-CR-01 says `AGENT_TO_SKILL` must be derived by reversing `SKILL_TO_AGENT`. The TSPEC's chosen approach (LEGACY_AGENT_TO_SKILL bypass) deviates from the REQ's explicit constraint that `AGENT_TO_SKILL` is sourced exclusively from `SKILL_TO_AGENT` reversal. This is a scope deviation that either requires a REQ amendment or must be resolved to match the REQ-specified approach. | REQ-CR-01, REQ-NF-01 |
| F-03 | Medium | The `resolveStartPhase()` algorithm (Section 6.4) contains an in-document correction mid-spec ("Wait — this logic needs a correction") and presents two different versions of the algorithm. This leaves ambiguity about which version is authoritative. The first version has a logical bug (gap detection for the REQ-only case is incorrectly structured); the second corrected version omits the `elif lastContiguousIndex > 0` branch coverage for all other contiguous positions. A finalized, single authoritative algorithm is required. The ambiguity risks an incorrect implementation of REQ-CLI-05's acceptance criteria, particularly the gap case (FSPEC absent, TSPEC present). | REQ-CLI-05, FSPEC-CLI-02 |
| F-04 | Medium | The `countFindingsInCrossReviewFile()` description (Section 6.6) says the function reads from the "current revision, unversioned path for display." However, REQ-CLI-03 specifies that `N` is read from the cross-review file that the reviewer wrote in the current round — which for iteration 2+ would be a versioned file (e.g., `-v2.md`). Using the unversioned path for finding counts after round 1 would always read the stale round-1 file, producing incorrect `N` values in progress output for subsequent iterations. The TSPEC must specify that `countFindingsInCrossReviewFile()` resolves the versioned path using `revisionCount` from `reviewState.writtenVersions[agentId]`. | REQ-CLI-03, FSPEC-CLI-03 |
| F-05 | Medium | The `pollUntilTerminal()` loop (Section 6.5) checks for the "addressing feedback" optimizer dispatch line but `emitProgressLines()` (Section 6.6) has no code path for emitting it. The FSPEC (FSPEC-CLI-03) explicitly requires a line `[Phase {label} — {title}] {agent-id} addressing feedback...` when the optimizer is dispatched. The polling loop references `state.activeAgentIds` to detect the author agent, but `FeatureWorkflowState` is not shown to include an `activeAgentIds` field anywhere in the TSPEC's type definitions. The field must be documented or the detection mechanism must be specified. | REQ-CLI-03, FSPEC-CLI-03 |
| F-06 | Medium | The TSPEC's `ptah.workflow.yaml` template (Section 8.3) does not include `skip_if` conditions for FSPEC, TSPEC, PLAN, or PROPERTIES creation phases — only `req-creation` has a `skip_if`. However, the in-scope list in REQ §3.1 says the `SkipCondition` discriminated union applies wherever the workflow engine needs to skip phases based on artifact existence, and the auto-detection mechanism (REQ-CLI-05) implicitly assumes those artifacts may already exist when resuming mid-pipeline. While REQ-WF-01 explicitly calls out only the REQ skip condition, the REQ's Purpose statement describes "optional req-creation when a REQ file already exists." The TSPEC covers only REQ but does not explicitly acknowledge that FSPEC/TSPEC/PLAN/PROPERTIES phases will NOT have skip conditions — which could be intentional or an omission. This needs clarification to confirm the YAML template is complete as specified. | REQ-WF-01, REQ-WF-05 |
| F-07 | Medium | The `DETECTION_SEQUENCE` in `resolveStartPhase()` (Section 6.4) maps `"FSPEC"` with `nextPhase: "fspec-creation"` — but this entry is used when REQ is the last contiguous artifact, meaning the NEXT step is to run `fspec-creation`. When FSPEC is found and TSPEC is not, `nextEntry` points to TSPEC's entry which has `nextPhase: "tspec-creation"`. This is internally correct. However, the corrected algorithm at the bottom of Section 6.4 does not address the case where `lastContiguousIndex === -1` (no artifacts found at all, including the REQ itself). The REQ requires that if no artifacts exist beyond REQ, the phase is `req-review`. But if REQ itself is absent (`lastContiguousIndex === -1`), the user likely ran `ptah run` without the REQ file existing — this should have been caught by Step 1 (REQ file validation). The TSPEC should clarify that Step 1 guarantees REQ exists before auto-detection runs, making `lastContiguousIndex === -1` an impossible state in practice. | REQ-CLI-05, REQ-CLI-02 |
| F-08 | Low | Section 5.2 notes that `computeReviewerList` needs "only the phase, not featureConfig" and passes a stub `{ discipline: "default" } as FeatureConfig`. This is a workaround that leaks a technical implementation detail that could produce unexpected behavior if `computeReviewerList()` ever uses other `FeatureConfig` fields. The REQ acceptance criteria just require that the function reads reviewers from `implementation-review.reviewers`; the mechanism used to call `computeReviewerList()` is not specified. However the workaround's reliance on implementation internals of `computeReviewerList()` is fragile and should be flagged for the engineer to consider a cleaner approach (e.g., a helper that extracts the reviewer list from a `ReviewerManifest` directly). | REQ-WF-06 |
| F-09 | Low | The progress output terminal-state messages in Section 6.5 include `"Workflow Revision Bound Reached ⚠️\n"` (capitalized "Revision Bound Reached"). The FSPEC terminal state messages (FSPEC-CLI-03 emission logic) show `[Phase {label} — {title}] Revision Bound Reached ⚠️` for per-phase signals, but the workflow-level terminal message is not explicitly spelled out in the FSPEC. REQ-CLI-01 specifies the exit code for `revision-bound-reached` but does not specify the exact stdout text. The capitalization and format of the terminal-state message should be made explicit to avoid ambiguity at implementation time. | REQ-CLI-01, FSPEC-CLI-03 |
| F-10 | Low | Section 8.1 specifies that the new `FILE_MANIFEST` total is 20 entries (18 − 6 old entries + 8 new entries). REQ-AG-01 explicitly states the exact count "must be confirmed by counting the full manifest." The TSPEC provides a calculation but does not list which 6 entries are removed (only describes them as "3 old skill stubs and 3 old agent-log stubs"). Without naming the 6 removed entries, an implementer may remove different entries and arrive at an incorrect manifest count. | REQ-AG-01 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Section 5.2 (`isCompletionReady()`): The TSPEC says sign-offs are stored as "timestamp strings" in its edge-case note, but the REQ acceptance criteria require `signOffs[agentId] === true` (boolean). Which is the correct stored type? The TSPEC and REQ appear to be inconsistent on the sign-off value type. |
| Q-02 | Section 6.4 (`resolveStartPhase()`): The corrected algorithm at the bottom of the section only handles `lastContiguousIndex === 0` and `lastContiguousIndex > 0`. Does `lastContiguousIndex === -1` (REQ itself not found) need a code path here, or is it guaranteed impossible by Step 1 of `RunCommand.execute()`? |
| Q-03 | Section 6.6 (`countFindingsInCrossReviewFile()`): Is it intentional to always read the unversioned cross-review file for finding counts (round 1 file), or should it read the versioned file corresponding to the current iteration? The FSPEC does not explicitly specify the path for this display operation. |
| Q-04 | Section 7: The `LEGACY_AGENT_TO_SKILL` approach bypasses the REQ constraint that `AGENT_TO_SKILL` is derived exclusively from `SKILL_TO_AGENT` reversal. Has this deviation been discussed with the product team, or should a REQ amendment be raised? |
| Q-05 | OQ-03 (FSPEC open question about PROPERTIES file absence during `properties-tests` phase) remains open. Does the TSPEC have a position on whether `ptah run` should surface a warning when the PROPERTIES context document is absent, or is it exclusively the `se-implement` agent's responsibility to note the absence in its output? |

---

## Positive Observations

- Requirements traceability table (Section 15) is thorough and maps all 25 requirements to specific technical components. Every requirement from the REQ has a corresponding entry.
- The TSPEC correctly identifies the breaking change in `parseRecommendation()` signature and specifies both the helper `extractRecommendationValue()` function and its migration path, which directly addresses the product concern in FSPEC-CR-02 about the two-step call pattern.
- The `FakeTemporalClient` co-changes (Section 5.11) are fully specified including the `statusFilter` filtering behavior, which ensures tests can assert the correct behavior per FSPEC-CLI-01 BR-CLI-28.
- The `ptah.workflow.yaml` template (Section 8.3) correctly includes all 8 phases from the Reviewer Assignment Matrix in REQ-WF-02, uses `revision_bound: 5` on all review phases, and positions `properties-tests` between `implementation` and `implementation-review`.
- The TSPEC correctly specifies the `checkArtifactExists` Activity as running pre-loop across the full workflow config regardless of `startAtPhase`, matching BR-WF-07 from the FSPEC.
- The `LenientConfigLoader` design correctly handles the no-Discord case required by REQ-NF-02, and the signal coexistence pattern (`"user-answer"` + `"humanAnswerSignal"`) matches FSPEC-CLI-04.

---

## Recommendation

**Need Attention**

> Two High and four Medium findings require resolution before implementation proceeds.
>
> **Must change before implementation:**
>
> 1. **F-01 (High):** Correct `isCompletionReady()` to use `=== true` checks per REQ-WF-06 AC and FSPEC-WF-02 BR-WF-09, not presence-only checks. Resolve the sign-off value type inconsistency.
>
> 2. **F-02 (High):** Resolve the `SKILL_TO_AGENT` / `AGENT_TO_SKILL` approach to comply with REQ-CR-01's constraint that `AGENT_TO_SKILL` is derived exclusively from `SKILL_TO_AGENT` reversal. Either align the implementation or raise a REQ amendment.
>
> 3. **F-03 (Medium):** Remove the in-document algorithm duplication in Section 6.4. Publish a single finalized, tested version of `resolveStartPhase()` that covers all acceptance criteria cases from REQ-CLI-05 and FSPEC-CLI-02.
>
> 4. **F-04 (Medium):** Update `countFindingsInCrossReviewFile()` to resolve the versioned cross-review file path using `reviewState.writtenVersions[agentId]` rather than always using the unversioned path.
>
> 5. **F-05 (Medium):** Specify the detection mechanism for the "addressing feedback" optimizer dispatch progress line, including what workflow state field is queried and where `activeAgentIds` or equivalent is defined on `FeatureWorkflowState`.
>
> 6. **F-06 (Medium):** Explicitly state whether the YAML template intentionally omits `skip_if` for FSPEC/TSPEC/PLAN/PROPERTIES creation phases, or whether additional skip conditions are required per the scope intent.
