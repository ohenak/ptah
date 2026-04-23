# Cross-Review: product-manager — TSPEC

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/TSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Prior Findings Resolution

Reviewing resolution of all 6 findings from iteration 2:

| Prior ID | Severity | Resolution Status | Notes |
|----------|----------|-------------------|-------|
| F-01 (Medium) | `ContinueAsNewPayload.signOffs` stale type | Resolved | Section 4.6 now declares `signOffs: Record<string, boolean>`. Type is consistent with Section 5.2 and `buildContinueAsNewPayload()`. |
| F-02 (Medium) | "gap at position 2" test description mismatch | Resolved | Test table description corrected to "gap (FSPEC absent, TSPEC present)"; duplicate row removed. Expected result `fspec-creation` is now consistent with the scenario description and REQ-CLI-05 AC. |
| F-03 (Medium) | `countFindingsInCrossReviewFile()` parameter type mismatch | Resolved | Third parameter changed to `phaseId: string`; body calls `deriveDocumentType(phaseId)` directly; call site in `emitProgressLines()` is aligned. |
| F-04 (Medium) | Per-phase `Passed ✅` / `Revision Bound Reached ⚠️` emission — no code path | Resolved | `completedPhaseResults: Record<string, "passed" | "revision-bound-reached">` added to `FeatureWorkflowState` (Section 4.3); lifecycle semantics documented; `pollUntilTerminal()` transition-detection block reads `completedPhaseResults[exitedPhaseId]` and emits the appropriate line; `lastTrackedPhaseId` prevents re-triggering; three test cases added to Section 13.2. AT-CLI-03-D is now traceable to an implementation path. |
| F-05 (Low) | REQ amendment to REQ-CR-01 recommended but not formally requested | Acknowledged | Section 7.1 documents the conflict and recommends the amendment. No blocking action required before implementation. |
| F-06 (Low) | `countFindingsInCrossReviewFile()` sync/async inconsistency | Resolved | Function is now `async` with `Promise<number \| "?">` return type; accepts injected `FileSystem`; `emitProgressLines()` is also `async` and `await`s the call; `fs: FileSystem` threaded through `PollParams`. Testability gap closed. |

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | **`FSPEC-CLI-03` creation-phase progress scope note is not reflected in the test table.** FSPEC-CLI-03 explicitly states creation phases (req-creation, fspec-creation, etc.) emit only the optimizer-dispatch line `[Phase {label} — {title}] {agent-id} running...` when the agent is dispatched, and emit no phase-header or reviewer-result lines. The `PHASE_LABELS` static map in Section 6.6 does not include any creation phase IDs (`req-creation`, `fspec-creation`, `tspec-creation`, `plan-creation`, `properties-creation`, `implementation`). The `pollUntilTerminal()` loop explicitly emits progress lines only for phases that appear in `PHASE_LABELS`. This means creation phases receive no progress output at all — including no dispatch line — which is slightly narrower than the FSPEC scope note: the FSPEC says creation phases emit "no phase-header or reviewer-result progress lines" but do emit an optimizer-dispatch line. The TSPEC effectively makes the optimizer-dispatch line for creation phases out of scope too, and the YAML template note in Section 8.3 notes this is intentional per REQ §3.1. However, the discrepancy between what the FSPEC says a creation phase emits and what `PHASE_LABELS` produces (nothing) is not explicitly acknowledged in the TSPEC. This risks an implementer interpreting the FSPEC literally and adding creation phase dispatch logic. The TSPEC should add a single clarifying note to Section 6.6 stating that the creation-phase optimizer-dispatch line is deferred/out of scope per REQ §3.1, consistent with the existing YAML template note. | REQ-CLI-03, FSPEC-CLI-03 |
| F-02 | Low | **`activeAgentIds` initialization in `buildInitialWorkflowState()` — Section 5.6 is internally inconsistent with Section 4.3.** Section 4.3 specifies that `activeAgentIds` must be initialized to `[]` in `buildInitialWorkflowState()`. Section 5.6 shows the `buildInitialWorkflowState()` return object but does not include `activeAgentIds` in the listed fields — it only shows `artifactExists: {}` and `completedPhaseResults: {}` as the new fields (the comment reads "existing fields" for everything else). An implementer reading Section 5.6 in isolation may omit `activeAgentIds` from the initial state, causing a runtime crash when `pollUntilTerminal()` reads `state.activeAgentIds ?? []` on the first tick with an undefined field. The test table in Section 13.2 includes a test for `activeAgentIds: []` initialization, which would catch this — but the omission in Section 5.6 is still a documentation inconsistency that could cause confusion. The three new fields (`artifactExists`, `activeAgentIds`, `completedPhaseResults`) should all be explicitly listed in Section 5.6's return object. | REQ-CLI-03 |
| F-03 | Low | **`resolveStartPhase()` gap-detection logic uses `DETECTION_SEQUENCE.slice(2)` but the comment is slightly misleading.** The gap detection at `lastContiguousIndex === 0` checks `DETECTION_SEQUENCE.slice(2).some(e => e.found)` — i.e., any of TSPEC, PLAN, PROPERTIES. The inline comment says `// DETECTION_SEQUENCE.slice(2) = [TSPEC, PLAN, PROPERTIES]` which is correct. However, the gap determination per FSPEC-CLI-02 BR-CLI-08 is: "if FSPEC is absent but TSPEC is present, the sequence breaks after REQ." The TSPEC's implementation correctly detects this (TSPEC at index 2 is "beyond the FSPEC gap"), but also returns `fspec-creation` if PLAN or PROPERTIES is present beyond the gap without FSPEC — even if TSPEC is also absent. This is actually the correct behavior per BR-CLI-08 ("gap breaks contiguity; the gap artifact's creation phase is derived"), and the FSPEC-CLI-02 phase map only lists the gap case as "FSPEC absent, TSPEC present." The current check captures all gap cases correctly, but the comment doesn't explain why PLAN and PROPERTIES (not just TSPEC) are also checked. This is a minor clarity issue — the comment should read "any artifact beyond index 1 (FSPEC) is present — indicates a gap at FSPEC" rather than just listing the slice contents. No behavior change required; documentation clarification only. | REQ-CLI-05, FSPEC-CLI-02 |
| F-04 | Low | **`OQ-03` from the FSPEC remains open and the TSPEC does not address it.** FSPEC open question OQ-03 asks: "When PROPERTIES file is absent during `properties-tests` phase, what specific text does `se-implement` include in its output to indicate the absence? Should `ptah run` surface this as a warning?" The TSPEC does not mention OQ-03 at any point. REQ-WF-03 specifies that the missing PROPERTIES context document is a "soft warning" and the agent is "responsible for noting the absence in its output," but does not specify what `ptah run` does. The FSPEC leaves this open. From a product standpoint, no `ptah run` behavior change is required — the TSPEC correctly follows REQ-WF-03 by treating the missing PROPERTIES as a soft warning. However, the TSPEC should explicitly acknowledge that OQ-03 is out of scope for this implementation (the CLI does not surface a warning; the agent handles it). Without this acknowledgment, implementers might look for PROPERTIES-absence handling in `ptah run` code and add it speculatively. | REQ-WF-03 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | F-01: Is the creation-phase optimizer-dispatch line (`[Phase {label} — {title}] {agent-id} running...`) intentionally deferred indefinitely, or is it planned for a future iteration? The FSPEC scope note mentions it applies when "the orchestrator emits a creation phase dispatch signal" — is that signal expected to exist in the current implementation or not? Confirming this as out-of-scope for this TSPEC would close the discrepancy. |
| Q-02 | Section 5.9 (`runReviewCycle()` — full version history enumeration): The comment on the `crossReviewRefs` construction reads "Note: missing-file silent-skip is handled inside `invokeSkill` context assembly (contextDocumentRefs that don't resolve to readable files are skipped by `DefaultContextAssembler`)." This defers the FSPEC-CR-03 / BR-CR-13 missing-file behavior to `DefaultContextAssembler`. Is it confirmed that `DefaultContextAssembler` already implements this silent-skip behavior, or is that an assumption? If `DefaultContextAssembler` does not already skip unreadable refs, the TSPEC does not specify where to add that logic. |

---

## Positive Observations

- **F-01 through F-04 (all iteration 2 Medium findings) are fully resolved** with clean, precise specifications. No regression was introduced.
- The `completedPhaseResults` lifecycle design (Section 4.3) is elegant — additive-only entries accumulate as a permanent phase-outcome record, enabling the poller to detect both `Passed ✅` and `Revision Bound Reached ⚠️` by comparing `lastTrackedPhaseId` to `state.currentPhaseId`. This correctly implements AT-CLI-03-D and mirrors the FSPEC-CLI-03 behavioral flow exactly.
- The `lastTrackedPhaseId` guard in `pollUntilTerminal()` (Section 6.5) correctly prevents the transition-detection block from re-triggering across multiple ticks when the new phase is not in `PHASE_LABELS`. This is a subtle correctness issue that has been thought through.
- The `ContinueAsNewPayload.signOffs: Record<string, boolean>` fix (F-01) eliminates the last TypeScript type inconsistency in the sign-off pipeline. The type now flows consistently from `FeatureWorkflowState.signOffs` → `buildContinueAsNewPayload()` → `ContinueAsNewPayload` → resumed workflow.
- The `countFindingsInCrossReviewFile()` async refactor (F-06 resolution) is the correct design: using the injected `FileSystem.readFile()` keeps the function fully testable via `FakeFileSystem` and consistent with `RunCommand`'s dependency injection pattern.
- The test table in Section 13.2 now includes coverage for all three per-phase transition outcomes (Passed, Revision Bound Reached, and non-review-phase no-output), which satisfies AT-CLI-03-D and makes the product-critical progress line traceable to a test case.
- Requirements traceability table (Section 15) remains complete — all 25 requirements are mapped. No requirement has lost its traceability entry across the revision history.
- The YAML template note (Section 8.3) correctly and explicitly justifies why FSPEC/TSPEC/PLAN/PROPERTIES creation phases have no `skip_if` conditions — this closes a persistent source of implementer confusion.

---

## Recommendation

**Approved with Minor Issues**

> All High and Medium findings from iterations 1 and 2 are fully resolved. Four Low findings remain — all are documentation clarity issues with no behavior impact. None require a revision cycle before implementation begins.
>
> **Recommended (but not blocking) before implementation:**
>
> 1. **F-01 (Low):** Add a sentence to Section 6.6 explicitly stating that the creation-phase optimizer-dispatch line is deferred/out of scope for this implementation, per REQ §3.1. Prevents implementers from speculatively adding creation-phase progress logic.
>
> 2. **F-02 (Low):** Add `activeAgentIds: []` explicitly to the return object shown in Section 5.6 `buildInitialWorkflowState()`, alongside `artifactExists: {}` and `completedPhaseResults: {}`, so all three new `FeatureWorkflowState` fields are visibly initialized in the same code block.
>
> 3. **F-03 (Low):** Clarify the inline comment for `DETECTION_SEQUENCE.slice(2)` gap detection to explain why PLAN and PROPERTIES (not just TSPEC) are checked — e.g., "any artifact beyond the FSPEC position (index 1) indicates a gap at FSPEC."
>
> 4. **F-04 (Low):** Add a note in Section 11 or Section 12 explicitly acknowledging OQ-03 is out of scope — `ptah run` does not surface a warning for missing PROPERTIES during `properties-tests`; the agent handles it per REQ-WF-03.
