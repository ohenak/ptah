# Cross-Review: product-manager — TSPEC

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/TSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Prior Findings Resolution

Reviewing resolution of all 10 findings from iteration 1:

| Prior ID | Severity | Resolution Status | Notes |
|----------|----------|-------------------|-------|
| F-01 (High) | `isCompletionReady()` sign-off type | Resolved | Section 5.2 corrects type to `Record<string, boolean>` and uses `=== true` checks throughout. Legacy fallback also uses `=== true`. New finding F-01 raised: `ContinueAsNewPayload` still declares `signOffs: Record<string, string>`. |
| F-02 (High) | SKILL_TO_AGENT / AGENT_TO_SKILL approach | Resolved | Section 7 documents the constraint conflict, justifies `LEGACY_AGENT_TO_SKILL` supplement, recommends a REQ amendment. All 7 ACs from REQ-CR-01 are satisfied and verified. |
| F-03 (Medium) | Duplicate algorithm versions in resolveStartPhase | Resolved | Single authoritative algorithm with clear case enumeration published. New finding F-02 raised on test table description mismatch. |
| F-04 (Medium) | countFindingsInCrossReviewFile versioned path | Resolved | Section 6.6 now resolves the versioned path via `reviewState.writtenVersions[agentId]`. New finding F-03 raised on type signature mismatch in function. |
| F-05 (Medium) | "addressing feedback" detection mechanism | Resolved | `activeAgentIds: string[]` added to `FeatureWorkflowState` (Section 4.3) with full lifecycle semantics. Detection logic in `emitProgressLines()` documented. New finding F-04 raised on per-phase `Passed ✅` / `Revision Bound Reached ⚠️` emission. |
| F-06 (Medium) | YAML template skip_if omissions | Resolved | Section 8.3 note explicitly states FSPEC/TSPEC/PLAN/PROPERTIES creation phases intentionally have no `skip_if` conditions, with rationale. |
| F-07 (Medium) | lastContiguousIndex === -1 impossibility | Resolved | Algorithm states this is an impossible state at runtime (Step 1 guarantees REQ exists); branch retained for defensive completeness and test isolation. |
| F-08 (Low) | computeReviewerList stub FeatureConfig | Resolved | Section 5.2 explicitly documents the stub approach and its rationale. |
| F-09 (Low) | Terminal-state message format | Partially resolved | Workflow-level `revision-bound-reached` terminal text is now explicit. Per-phase `Revision Bound Reached ⚠️` emission path remains underspecified (see F-04). |
| F-10 (Low) | FILE_MANIFEST 6 removed entries unnamed | Resolved | Section 8.1 names all 6 removed entries: 3 old skill stubs (`pm-agent.md`, `dev-agent.md`, `test-agent.md`) and 3 old agent-log stubs (same names in `docs/agent-logs/`). Total 20 confirmed. |

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Medium | **`ContinueAsNewPayload` type still declares `signOffs: Record<string, string>` (stale type).** Section 4.6 defines `ContinueAsNewPayload` with `signOffs: Record<string, string>`. However, Section 5.2 explicitly updates the `signOffs` type to `Record<string, boolean>` throughout the codebase — including the `buildContinueAsNewPayload()` parameter type at line 367 which uses `Pick<FeatureWorkflowState, "featurePath" | "signOffs" | "adHocQueue" | "reviewStates">`. `FeatureWorkflowState.signOffs` will be `Record<string, boolean>` after Section 5.2's changes, making the `ContinueAsNewPayload.signOffs: Record<string, string>` declaration in Section 4.6 a stale type that will cause a TypeScript compilation error at the `signOffs: { ...state.signOffs }` assignment in `buildContinueAsNewPayload()`. The `ContinueAsNewPayload` interface in Section 4.6 must be updated to `signOffs: Record<string, boolean>`. | REQ-WF-06, FSPEC-WF-02 |
| F-02 | Medium | **Test table entry for "gap at position 2" describes the wrong derived phase.** Section 13.2 includes the test case: `Auto-detection — gap at position 2 (TSPEC absent, PLAN present) → Derives fspec-creation (FSPEC is the first missing artifact)`. However, per the `resolveStartPhase()` algorithm in Section 6.4, if FSPEC is present (index 1 found) and TSPEC is absent (index 2, breaking contiguity) with PLAN present beyond the gap, then `lastContiguousIndex = 1` (FSPEC is the last contiguous). The `lastContiguousIndex > 0` branch executes: `nextEntry = DETECTION_SEQUENCE[2]` which has `nextPhase: "tspec-creation"`, so `derivedPhase = "tspec-creation"` — not `fspec-creation`. The test description says "FSPEC is the first missing artifact" but FSPEC is found; TSPEC is the first missing artifact. The test row incorrectly states the derived phase as `fspec-creation` and will produce a failing test if implemented as written. Either the scenario description is wrong (should say "FSPEC absent, TSPEC present" meaning `lastContiguousIndex = 0` with gap) or the expected result is wrong (should be `tspec-creation`). | REQ-CLI-05, FSPEC-CLI-02 |
| F-03 | Medium | **`countFindingsInCrossReviewFile()` function signature uses `phase: PhaseDefinition` but the call site passes `phaseId: string`.** The function signature in Section 6.6 declares the third parameter as `phase: PhaseDefinition`, and the pseudocode body uses `phase.id` to call `deriveDocumentType()`. However, in `emitProgressLines()` at line 1025, the call is `countFindingsInCrossReviewFile(featureFolder, agentId, phaseId, reviewState, slug)` where `phaseId` is a `string` (the third parameter of `emitProgressLines()`). This mismatch will cause a TypeScript compilation error. The `countFindingsInCrossReviewFile()` signature must be changed to accept `phaseId: string` (not `phase: PhaseDefinition`) and the body must call `deriveDocumentType(phaseId)` directly — consistent with the call site. | REQ-CLI-03, FSPEC-CLI-03 |
| F-04 | Medium | **Per-phase `Passed ✅` and per-phase `Revision Bound Reached ⚠️` emission lines have no code path in the polling loop.** The FSPEC (FSPEC-CLI-03, example output and AT-CLI-03-D) explicitly requires `[Phase R — REQ Review] Passed ✅` when all reviewers approve and the phase transitions. Section 6.6 mentions these at the end (`Phase completed/revision-bound-reached signals: These are detected from phaseStatus transitions`) but provides no algorithm, no state field, and no code path in `pollUntilTerminal()` (Section 6.5) that produces these lines. The polling loop only handles workflow-level terminal states — it does not detect the per-phase completion or revision-bound event that would trigger the per-phase format lines. The TSPEC must either: (a) add a per-phase status field to `FeatureWorkflowState` that `pollUntilTerminal()` reads to detect and emit phase-level `Passed ✅` / `Revision Bound Reached ⚠️` lines; or (b) explicitly define the mapping between workflow-state transitions and these per-phase emissions within the `emitProgressLines()` or deduplication logic. The test table in Section 13.2 has no test case for AT-CLI-03-D (`[Phase R — REQ Review] Passed ✅`). | REQ-CLI-03, FSPEC-CLI-03 |
| F-05 | Low | **Section 7 recommends a REQ amendment to REQ-CR-01 but does not flag it as a blocking action.** The TSPEC identifies a genuine constraint conflict in REQ-CR-01 (the "derived exclusively by reversal" wording is irreconcilable with backward-compat many-to-one requirements) and justifies the `LEGACY_AGENT_TO_SKILL` supplement. All acceptance criteria in REQ-CR-01 are satisfied. However, the REQ amendment is recommended but not formally requested — it remains open. Product confirms this is the correct implementation; a REQ amendment should be raised as a follow-up to align the documented constraint with the accepted implementation. This is a documentation housekeeping item, not a blocking finding. | REQ-CR-01, REQ-NF-01 |
| F-06 | Low | **`countFindingsInCrossReviewFile()` uses `fs.readFileSync` (synchronous) but `RunCommand` injects an async `FileSystem` interface.** The algorithm in Section 6.6 calls `fs.readFileSync(filePath, "utf-8")` which is the native Node.js synchronous call. However, `RunCommand`'s dependencies (Section 6.1) inject a `FileSystem` interface (`deps: RunCommandDeps`) that provides only async `readFile()`. This means `countFindingsInCrossReviewFile()` either needs to use the injected `FileSystem.readFile()` (making it async, which requires `pollUntilTerminal()` and `emitProgressLines()` to become async), or it must receive the native `fs` module directly. As specified, the function is synchronous but relies on a method that doesn't exist on the injected interface — this is a testability gap that may force direct `fs` access in production code. REQ-CLI-03's acceptance criteria are still met (finding counts are correctly read), but the design inconsistency needs resolution for clean implementation. | REQ-CLI-03 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | F-02: Is the "gap at position 2" test scenario intended to represent (a) FSPEC absent, TSPEC present — making `lastContiguousIndex = 0` with a gap, deriving `fspec-creation`; or (b) FSPEC present, TSPEC absent, PLAN present — making `lastContiguousIndex = 1`, deriving `tspec-creation`? The test description says "TSPEC absent, PLAN present" which matches scenario (b), but the expected result `fspec-creation` matches scenario (a). |
| Q-02 | F-04: Does the workflow engine expose a per-phase status transition (e.g., a phase completing its review gate) as a separate `phaseStatus` value or through a different `queryWorkflowState` field? If not, how should the CLI detect that a phase has just passed to emit `[Phase R — REQ Review] Passed ✅`? The TSPEC's current `FeatureWorkflowState` shape does not show a per-phase completion event that the poller can observe. |
| Q-03 | F-01 + general: The `ContinueAsNewPayload` interface (Section 4.6) should be updated to `Record<string, boolean>` for consistency — is there any reason to preserve the `string` type in the serialized payload (e.g., Temporal serialization constraints)? |

---

## Positive Observations

- **F-01 (High) fully resolved:** `isCompletionReady()` now uses `=== true` boolean checks throughout — both the new path and the legacy fallback. The type is correctly declared as `Record<string, boolean>` at the function boundary and the sign-off pipeline (parseRecommendation → approved → true) is clearly traced.
- **F-03 (Medium) fully resolved:** `resolveStartPhase()` now has a single authoritative algorithm with all cases cleanly enumerated (`-1`, `=== 0` with/without gap, `> 0`, `=== length-1`). The phase-map summary table maps every scenario to its derived phase and log message. The `Step 1 guarantees impossibility of -1` note is correctly documented.
- **F-04 (Medium) fully resolved:** `countFindingsInCrossReviewFile()` now resolves the versioned path via `reviewState.writtenVersions[agentId]`, addressing the round-1 stale file concern. The algorithm is fully specified.
- **F-05 (Medium) well addressed:** `activeAgentIds` field added to `FeatureWorkflowState` with clear lifecycle semantics (added on dispatch, removed on completion). The optimizer detection heuristic in `emitProgressLines()` is pragmatic and correctly scoped.
- **F-06 (Medium) fully resolved:** The YAML template note explicitly states and justifies the intentional absence of `skip_if` on FSPEC/TSPEC/PLAN/PROPERTIES phases. This prevents implementer confusion.
- **F-10 (Low) fully resolved:** All 6 removed `FILE_MANIFEST` entries are named. The net count arithmetic (18 − 6 + 8 = 20) is transparent and verifiable.
- The `AGENT_TO_SKILL` constraint conflict (F-02 / High) is resolved with intellectual honesty: the conflict is stated, the implementation choice is justified, and a REQ amendment path is recommended. All 7 acceptance criteria from REQ-CR-01 are verified against the implementation.
- The `properties-tests` YAML phase correctly positions between `implementation` and `implementation-review`, uses `type: creation`, `agent: se-implement`, and the `deriveDocumentType("properties-tests") → "PROPERTIES"` special-case is specified — all per REQ-WF-03.
- Requirements traceability table (Section 15) maps all 25 requirements to specific technical components. No requirement is missing from the traceability matrix.

---

## Recommendation

**Need Attention**

> Three Medium findings must be resolved before implementation proceeds.
>
> **Must change before implementation:**
>
> 1. **F-01 (Medium):** Update `ContinueAsNewPayload.signOffs` type in Section 4.6 from `Record<string, string>` to `Record<string, boolean>` to match the updated type used throughout Section 5.2 and `buildContinueAsNewPayload()`.
>
> 2. **F-02 (Medium):** Correct the "gap at position 2" test table entry in Section 13.2. Either change the scenario description to "FSPEC absent, TSPEC present" (which derives `fspec-creation`), or change the expected result to `tspec-creation` (for the "FSPEC present, TSPEC absent, PLAN present" scenario). The current description and expected result are mutually inconsistent and will produce a failing test.
>
> 3. **F-03 (Medium):** Align `countFindingsInCrossReviewFile()` signature with its call site: change the third parameter from `phase: PhaseDefinition` to `phaseId: string` and update the body to call `deriveDocumentType(phaseId)` directly.
>
> 4. **F-04 (Medium):** Specify the code path for emitting per-phase `[Phase {label} — {title}] Passed ✅` and `[Phase {label} — {title}] Revision Bound Reached ⚠️` lines. Add a corresponding test case to Section 13.2. This is an explicit FSPEC acceptance test (AT-CLI-03-D) that currently has no implementation path in the TSPEC.
