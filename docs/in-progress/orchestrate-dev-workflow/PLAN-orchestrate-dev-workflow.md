# Execution Plan

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | PLAN-021 |
| **Parent Document** | TSPEC-021 (v1.2) |
| **Version** | 1.1 |
| **Date** | April 22, 2026 |
| **Author** | Senior Software Engineer |
| **Status** | Draft |

---

## 1. Summary

This plan breaks the orchestrate-dev workflow alignment into five independently-implementable phases. The phases are ordered by dependency, but within each phase all tasks can be executed in parallel. The implementation follows strict TDD: each task begins with failing tests (Red), then minimum passing implementation (Green), then refactoring.

**What is being built:**

- **Phase 1 — Cross-Review Parser Updates:** Extended `SKILL_TO_AGENT`/`AGENT_TO_SKILL` mapping, new `VALUE_MATCHERS` entries, `crossReviewPath()` versioning, and `parseRecommendation()` refactor with extracted heading logic.
- **Phase 2 — Temporal Types Updates:** New fields on `ReviewState`, `SkillActivityInput`, `ReadCrossReviewInput`, `FeatureWorkflowState`, and `ContinueAsNewPayload`; extended `FakeTemporalClient` in test fixtures.
- **Phase 3 — Workflow Engine Updates:** `SkipCondition` discriminated union, `checkArtifactExists` Activity, `evaluateSkipCondition()` third parameter, `runReviewCycle()` revision threading, `isCompletionReady()` refactor, `buildContinueAsNewPayload()` extension, `deriveDocumentType()` special-case, `mapRecommendationToStatus()` removal, workflow validator updates.
- **Phase 4 — ptah init Updates:** Updated `FILE_MANIFEST` with 8 skill stubs, updated `buildConfig()` with 8 agents, new default `ptah.workflow.yaml` template.
- **Phase 5 — ptah run CLI Command:** New `RunCommand` class, `LenientConfigLoader`, `resolveStartPhase()`, `pollUntilTerminal()`, `emitProgressLines()`, `handleQuestion()`, `countFindingsInCrossReviewFile()`, `ptah.ts` CLI entry point wiring, and `checkArtifactExists` worker registration.

---

## 2. Status Key

| Symbol | Meaning |
|--------|---------|
| ⬚ | Not Started |
| 🔴 | Red (tests written, failing) |
| 🟢 | Green (implementation passing) |
| 🔵 | Refactored |
| ✅ | Done |

---

## 3. Phase Dependencies

```
Phase 1 (Cross-Review Parser)
  └─► Phase 2 (Temporal Types)
        └─► Phase 3 (Workflow Engine)
              ├─► Phase 4 (ptah init) ← independent of Phase 3; depends on Phase 2 for type co-changes
              └─► Phase 5 (ptah run CLI) ← depends on Phase 2 and Phase 3
```

- **Phase 1** has no dependencies. Start here.
- **Phase 2** depends on Phase 1 completing (the refactored `parseRecommendation()` signature affects `cross-review-activity.ts` test updates which are Phase 2 tasks).
- **Phase 3** depends on Phase 2 (types must be defined before workflow engine functions reference them).
- **Phases 4 and 5** can proceed in parallel once Phase 3 is complete. Phase 4 has only a light dependency on Phase 2 (`buildConfig()` type changes), so it can begin after Phase 2 if Phase 3 is blocked.
- Within each phase, all tasks are independent and can be executed in parallel.

---

## 4. Phase 1 — Cross-Review Parser Updates

**Source file:** `ptah/src/orchestrator/pdlc/cross-review-parser.ts`
**Test file:** `ptah/tests/unit/orchestrator/cross-review-parser.test.ts`
**Dependent test file (updated):** `ptah/tests/unit/temporal/cross-review-activity.test.ts`

No dependencies on other phases. All four tasks can be worked in parallel.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1.1 | Add `VALUE_MATCHERS` entries: `"approved with minor issues"` → `approved`; `"need attention"` → `revision_requested`. Refactor `parseRecommendation()` to accept extracted field value (`recommendationFieldValue: string`) instead of full file content. Extract heading-scan logic into private `extractRecommendationValue(fileContent: string): string \| null`. | `cross-review-parser.test.ts` | `cross-review-parser.ts` | ✅ |
| 1.2 | Add new `SKILL_TO_AGENT` entries: `"product-manager" → "pm-review"`, `"test-engineer" → "te-review"`, `"software-engineer" → "se-review"`. Build `AGENT_TO_SKILL` as reversal of `SKILL_TO_AGENT` merged with `LEGACY_AGENT_TO_SKILL` (backward-compat entries for `pm`, `qa`, `eng`, `fe`). Verify all 7 `agentIdToSkillName()` ACs. | `cross-review-parser.test.ts` | `cross-review-parser.ts` | ✅ |
| 1.3 | Extend `crossReviewPath()` with optional `revisionCount?: number` parameter. Clamp `revisionCount ≤ 0` to 1. Append `-v{N}` suffix for `N ≥ 2`; no suffix for `N = 1` or absent. | `cross-review-parser.test.ts` | `cross-review-parser.ts` | ✅ |
| 1.4 | Update `readCrossReviewRecommendation` activity to use the two-step call pattern: `extractRecommendationValue(content)` then `parseRecommendation(rawValue)`. Update `cross-review-activity.test.ts` to reflect new two-step pattern and pass `revisionCount` to `crossReviewPath()`. | `cross-review-activity.test.ts` | `cross-review-activity.ts` | ✅ |
| 1.5 | Add explicit regression tests for `extractRecommendationValue()` extraction path in isolation: (a) heading-scan with `HEADING_PATTERN` match extracts the correct field value; (b) bold-wrapped value (`**Approved**`) is extracted correctly; (c) code-fence block containing `Recommendation:` is skipped and the real heading line is used; (d) `extractRecommendationValue()` returns `null` when no `Recommendation:` heading exists; (e) multi-line look-ahead returns the next non-blank line when the heading line has no inline value. These tests verify the extraction logic produces the same extracted string as the old monolithic `parseRecommendation()` did on equivalent inputs. | `cross-review-parser.test.ts` | `cross-review-parser.ts` | ✅ |

---

## 5. Phase 2 — Temporal Types Updates

**Primary source file:** `ptah/src/temporal/types.ts`
**Fixture file (updated):** `ptah/tests/fixtures/factories.ts`
**Test file:** `ptah/tests/unit/temporal/types.test.ts`

Depends on Phase 1 (the `ReadCrossReviewInput.revisionCount` field is consumed by the updated `readCrossReviewRecommendation` from Phase 1.4). All five tasks can be worked in parallel.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 2.1 | Add `writtenVersions: Record<string, number>` to `ReviewState` interface. Add `CheckArtifactExistsInput` interface with `slug`, `docType`, `featurePath` fields. | `types.test.ts` | `types.ts` | ✅ |
| 2.2 | Add `revisionCount?: number` to `SkillActivityInput`. Verify existing callers of `SkillActivityInput` still compile (optional field — no breaking change). | `types.test.ts` | `types.ts` | ✅ |
| 2.3 | Add `revisionCount?: number` to `ReadCrossReviewInput`. | `types.test.ts` | `types.ts` | ✅ |
| 2.4 | Add `artifactExists: Record<string, boolean>`, `activeAgentIds: string[]`, and `completedPhaseResults: Record<string, "passed" \| "revision-bound-reached">` fields to `FeatureWorkflowState`. | `types.test.ts` | `types.ts` | ✅ |
| 2.5 | Update `FakeTemporalClient` in `tests/fixtures/factories.ts`: add `signalHumanAnswer()` method (records to `humanAnswerSignals` array); extend `listWorkflowsByPrefix()` with optional `options?: { statusFilter?: ("Running" \| "ContinuedAsNew")[] }` parameter that filters the in-memory workflow list by status; add `workflowStatuses: Map<string, string>` field. `factories.test.ts` must assert all three behavioral properties in isolation: (a) `signalHumanAnswer(workflowId, answer)` records the call and the recorded entry equals `{ workflowId, answer }`; (b) `listWorkflowsByPrefix(prefix, { statusFilter: ["Running"] })` returns only workflow IDs whose status in `workflowStatuses` is `"Running"` — verified by pre-populating `workflowStatuses` with one `Running` and one `Completed` entry, asserting only the running ID is returned; (c) `listWorkflowsByPrefix(prefix)` with no `statusFilter` returns all IDs unchanged (backward-compat). | `tests/unit/fixtures/factories.test.ts` | `tests/fixtures/factories.ts` | ✅ |

---

## 6. Phase 3 — Workflow Engine Updates

**Primary source file:** `ptah/src/temporal/workflows/feature-lifecycle.ts`
**Supporting source files:** `ptah/src/config/workflow-config.ts`, `ptah/src/config/workflow-validator.ts`, `ptah/src/temporal/activities/artifact-activity.ts` (new), `ptah/src/temporal/client.ts`
**Test files:** `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts`, `ptah/tests/unit/temporal/activities/artifact-activity.test.ts` (new), `ptah/tests/unit/config/workflow-validator.test.ts`, `ptah/tests/unit/temporal/client.test.ts`

Depends on Phase 2. Tasks 3.1 and 3.2a/3.2b are prerequisites for 3.3–3.7. Tasks 3.3 through 3.8 are independent of each other and can be worked in parallel once 3.1 and 3.2b are complete.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 3.1 | Replace `SkipCondition` type in `workflow-config.ts` with discriminated union: `{ field: \`config.$\{string\}\`; equals: boolean } \| { field: "artifact.exists"; artifact: string }`. Update `workflow-validator.ts` — add `validateSkipIfBlock()` enforcing branch-specific required/forbidden fields. Add `revision_bound` required-field validation for `type: "review"` phases. | `workflow-validator.test.ts` | `workflow-config.ts`, `workflow-validator.ts` | ⬚ |
| 3.2a | **Red:** Write failing tests for `checkArtifactExists` in `artifact-activity.test.ts` (new file). Tests must cover: (a) file exists and is non-empty → returns `true`; (b) file exists but is empty/whitespace-only → returns `false`; (c) file does not exist (read error) → returns `false`; (d) `createArtifactActivities()` factory returns an object with a `checkArtifactExists` function. All tests must fail because `artifact-activity.ts` does not yet exist. This task is complete when tests are written and failing. | `artifact-activity.test.ts` (new) | — (source not yet written) | ⬚ |
| 3.2b | **Green:** Create `ptah/src/temporal/activities/artifact-activity.ts`: `createArtifactActivities()` factory returning `checkArtifactExists(input: CheckArtifactExistsInput): Promise<boolean>` — reads `${featurePath}${docType}-${slug}.md`, returns `content.trim().length > 0`, catches read errors and returns `false`. All tests from 3.2a must pass. | `artifact-activity.test.ts` (from 3.2a) | `artifact-activity.ts` (new) | ⬚ |
| 3.3 | Update `evaluateSkipCondition()` signature to `(condition: SkipCondition, featureConfig: FeatureConfig, artifactExists?: Record<string, boolean>): boolean`. Add `artifact.exists` branch: throws if `artifactExists` is `undefined`; returns `artifactExists[condition.artifact] ?? false`. Update all three call sites in `feature-lifecycle.ts` to pass `state.artifactExists`. | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.4 | Add pre-loop `checkArtifactExists` Activity scan in `featureLifecycleWorkflow`: collect unique `docType` values from all phases with `skip_if.field === "artifact.exists"` (scan full config, not just phases at/after `startAtPhase`); invoke `checkArtifactExists` Activity for each; store results in `state.artifactExists`. Register `checkArtifactExists` activity proxy with `startToCloseTimeout: "30 seconds"`, `retry: { maximumAttempts: 2 }`. Update `buildInitialWorkflowState()` to initialize `artifactExists: {}`, `activeAgentIds: []`, `completedPhaseResults: {}`. | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.5 | Update `runReviewCycle()`: compute `currentRevision = reviewState.revisionCount + 1`; pass `revisionCount: currentRevision` to `invokeSkill` (via `buildInvokeSkillInput()`); update `reviewState.writtenVersions[reviewerId] = currentRevision` after each reviewer dispatch; pass `revisionCount: currentRevision` to `readCrossReviewRecommendation`. Initialize `writtenVersions: {}` in `ReviewState` construction. Track `state.activeAgentIds` — add agentId on dispatch, remove on completion (both reviewers and optimizer). Set `state.completedPhaseResults[phaseId]` on phase exit (passed or revision-bound-reached). | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.6 | Update optimizer context assembly in `runReviewCycle()`: remove `.filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")`. Replace with full version history enumeration using `reviewState.writtenVersions[agentId]` to enumerate v1…vN paths per reviewer via `crossReviewPath()`; silently skip missing files (pass all paths to context assembler which skips unreadable refs). | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.7 | Update `isCompletionReady()` signature to `(signOffs: Record<string, boolean>, workflowConfig: WorkflowConfig): boolean`. Derive required agents from `implementation-review` phase reviewers via `computeReviewerList()`. Preserve legacy fallback (`signOffs.qa && signOffs.pm`) when no `implementation-review` phase exists. Update both call sites to pass `workflowConfig`. | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.8 | Add `DOCUMENT_TYPE_OVERRIDES` lookup to `deriveDocumentType()`: `"properties-tests" → "PROPERTIES"` applied before regex strip. Remove `mapRecommendationToStatus()` from `feature-lifecycle.ts` and migrate all callers to `parseRecommendation()`. Extend `buildContinueAsNewPayload()` parameter type to include `reviewStates`; serialize with deep copy preserving `writtenVersions`. Update the `ContinueAsNewPayload` interface to add `reviewStates: Record<string, ReviewState>`. Add static-scan test asserting `feature-lifecycle.ts` source does not contain `"mapRecommendationToStatus"`. | `feature-lifecycle.test.ts` | `feature-lifecycle.ts` | ⬚ |
| 3.9 | Extend `TemporalClientWrapper` interface and `TemporalClientWrapperImpl` in `client.ts`: add `signalHumanAnswer(workflowId: string, answer: string): Promise<void>` sending `"humanAnswerSignal"` signal; extend `listWorkflowsByPrefix()` with optional `options?: { statusFilter?: ("Running" \| "ContinuedAsNew")[] }` appending `AND ExecutionStatus IN (...)` to the visibility query. Register `checkArtifactExists` activity in worker via `bin/ptah.ts` activities block. Add a static-structure test in `client.test.ts` that reads the source of `bin/ptah.ts` as a string and asserts it contains the token `"checkArtifactExists"` to verify the activity is included in the worker activities registration block — worker mis-registration is a silent runtime failure that the type system cannot catch. | `client.test.ts` | `client.ts`, `bin/ptah.ts` | ⬚ |

---

## 7. Phase 4 — ptah init Updates

**Primary source file:** `ptah/src/config/defaults.ts`
**Test files:** `ptah/tests/unit/commands/init.test.ts`, `ptah/tests/unit/config/defaults.test.ts`

Depends on Phase 2 (type changes). Independent of Phase 3. All three tasks can be worked in parallel.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 4.1 | Update `FILE_MANIFEST` in `defaults.ts`: remove 3 old skill stubs (`pm-agent.md`, `dev-agent.md`, `test-agent.md`) and 3 old agent-log stubs from `docs/agent-logs/`. Add 8 new skill stubs under `ptah/skills/`: `pm-author.md`, `pm-review.md`, `se-author.md`, `se-review.md`, `te-author.md`, `te-review.md`, `tech-lead.md`, `se-implement.md`. Update `init.test.ts` assertion to `expect(Object.keys(FILE_MANIFEST).length).toBe(20)`. Assert all 8 skill files created by `ptah init`. | `init.test.ts` | `defaults.ts` | ⬚ |
| 4.2 | Update `buildConfig()` in `defaults.ts` to produce 8 agents in `agents.active` and 8 corresponding skill paths in `agents.skills`. | `defaults.test.ts` | `defaults.ts` | ⬚ |
| 4.3 | Replace the `ptah.workflow.yaml` template in `FILE_MANIFEST` with the full 8-role YAML: 19 phases (`req-creation` through `done`), 8-role reviewer matrix, `revision_bound: 5` on all review phases, `properties-tests` phase between `implementation` and `implementation-review`, `skip_if: { field: artifact.exists, artifact: REQ }` on `req-creation`. Reviewers specified as `default:` discipline key. | `defaults.test.ts` | `defaults.ts` | ⬚ |

---

## 8. Phase 5 — ptah run CLI Command

**New source files:** `ptah/src/commands/run.ts`
**New test files:** `ptah/tests/unit/commands/run.test.ts`
**Modified files:** `ptah/bin/ptah.ts`

Depends on Phases 2 and 3. Tasks 5.1, 5.2, 5.3a/5.3b, 5.4a/5.4b, and 5.5 are independent of each other (all address different concerns within `run.ts`). Task 5.6 depends on all prior tasks (wires everything together). Task 5.7 (integration) depends on 5.6.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 5.1 | Implement `LenientConfigLoader` in `run.ts`: reads `ptah.config.json`, applies Temporal defaults, returns `RunConfig` without requiring `discord` section. Throws only on missing file or invalid JSON. | `run.test.ts` | `run.ts` | ⬚ |
| 5.2 | Implement `resolveStartPhase()`: Tier 1 (`--from-phase` flag) validates phase ID in config, returns error with full phase list if invalid. Tier 2 auto-detection scans feature folder for contiguous PDLC artifact prefix (REQ → FSPEC → TSPEC → PLAN → PROPERTIES), derives `startAtPhase`, validates against config, returns error if derived phase absent. `run.test.ts` must contain all 7 of the following named test cases, each as a distinct test: (T1) `--from-phase valid` — resolves to the specified phase; (T2) `--from-phase invalid` — returns error listing all phase IDs; (T3) auto-detect: REQ only, no gap — resolves to `req-review`, no log message; (T4) auto-detect: REQ present, FSPEC absent, TSPEC present (gap after REQ) — resolves to `fspec-creation` with log message; (T5) auto-detect: REQ + FSPEC, TSPEC absent — resolves to `tspec-creation`; (T6) auto-detect: REQ + FSPEC + TSPEC + PLAN + PROPERTIES all present — resolves to `implementation`; (T7) auto-detect: derived phase not in workflow config — returns config-mismatch error. These correspond to AT-CLI-02-A through AT-CLI-02-F plus the gap case from FSPEC-CLI-02. | `run.test.ts` | `run.ts` | ⬚ |
| 5.3a | **Red — `pollUntilTerminal()` terminal state handling:** Write failing tests covering: (a) `completed` state → emits `Workflow completed ✅` and returns exit code 0; (b) `failed` state → emits `Workflow failed ❌` and returns exit code 1; (c) `revision-bound-reached` state → returns exit code 1; (d) `cancelled` state → returns exit code 1. Tests fail because `pollUntilTerminal()` does not yet exist. | `run.test.ts` | — | ⬚ |
| 5.3b | **Green — `pollUntilTerminal()` terminal state + deduplication + error handling:** Implement `pollUntilTerminal()` so 5.3a tests pass. Extend with: `lastEmittedState` deduplication (same phase/iteration/reviewer state → skip tick), transient `queryWorkflowState()` error handling (log and continue polling), per-phase transition detection using `completedPhaseResults` map emitting `Passed ✅` or `Revision Bound Reached ⚠️` when a phase exits, `ROUTE_TO_USER` delegation to `handleQuestion()`. Add tests for each behavior: (e) two polls returning identical state emit only one set of lines; (f) `queryWorkflowState()` throws transiently — loop continues and emits on next successful poll; (g) `completedPhaseResults["req-review"] = "passed"` detected on state change → emits `[Phase R — REQ Review] Passed ✅`; (h) `ROUTE_TO_USER` state → `handleQuestion()` is called. | `run.test.ts` | `run.ts` | ⬚ |
| 5.4a | **Red — `countFindingsInCrossReviewFile()`:** Write failing tests covering: (a) file with a `## Findings` table containing 4 data rows → returns `4`; (b) table with header and separator rows only (0 data rows) → returns `0`; (c) file not readable (read error) → returns `"?"`; (d) `writtenVersions[agentId]` used to resolve the versioned path (e.g., `writtenVersions["te-review"] = 2` → reads `-v2` path). Tests fail because function does not yet exist. | `run.test.ts` | — | ⬚ |
| 5.4b | **Green — `emitProgressLines()` and `countFindingsInCrossReviewFile()`:** Implement both functions so 5.4a tests pass. `emitProgressLines()` uses `PHASE_LABELS` static map with all 7 entries from FSPEC-CLI-03 Phase Label Map (`req-review` → `R`, `fspec-review` → `F`, `tspec-review` → `T`, `plan-review` → `P`, `properties-review` → `PT`, `properties-tests` → `PTT`, `implementation-review` → `IR`); falls back to raw `phaseId` for unknown phases; emits iteration header, per-reviewer status lines (`Approved ✅` or `Need Attention (N findings)`), and optimizer addressing-feedback line when `allReviewersDone && activeAgentIds.length > 0`. Add tests for: (e) unknown phase ID falls back to raw ID as label; (f) optimizer dispatch line emitted when all reviewers done and `activeAgentIds.length > 0`; (g) cross-review file unreadable → `Need Attention (? findings)`. | `run.test.ts` | `run.ts` | ⬚ |
| 5.5 | Implement `handleQuestion()`: Discord-present path returns immediately (existing behavior). No-Discord path: write `[Question] {text}\n` to stdout, write `Answer: ` (no newline) via `process.stdout.write` callback, read one line from stdin via `readline.createInterface`, call `signalHumanAnswer(workflowId, answer)` or send empty string on EOF with stderr warning. Test must assert `process.stdout.write` is called with `"Answer: "` (no newline) before the mocked stdin reader is invoked, verifying the flush-before-read contract (FSPEC-CLI-04 BR-CLI-20). | `run.test.ts` | `run.ts` | ⬚ |
| 5.6 | Implement `RunCommand.execute()`: sequential pre-flight checks (REQ file validation, slug derivation, workflow config load, `resolveStartPhase`, duplicate-workflow check via `listWorkflowsByPrefix` with `statusFilter`), workflow start, progress polling. Wire `ptah.ts` `case "run"`: parse `--from-phase` flag, construct `RunCommand` with Node.js stdio, call `execute()`, set `process.exitCode`. Update `printHelp()` to document `run` command. | `run.test.ts` | `run.ts`, `bin/ptah.ts` | ⬚ |
| 5.7 | **Integration test — `RunCommand.execute()` end-to-end:** Write at least one integration test in `run.test.ts` (or a separate `run.integration.test.ts`) using real module interactions: real `resolveStartPhase()`, real `LenientConfigLoader`, `FakeTemporalClient` (with populated `workflowStatuses`), and `FakeFileSystem`. Happy path: REQ file exists, no duplicate workflow running, `FakeTemporalClient` returns a `completed` state on first poll after start → `execute()` returns exit code 0. Must verify cross-module error propagation: `listWorkflowsByPrefix` returning a running workflow ID causes `execute()` to return exit code 1 with the correct error message, proving the error surfaces correctly through the `RunCommand.execute()` boundary (not just in unit tests of individual helpers). | `run.test.ts` | `run.ts`, `bin/ptah.ts` | ⬚ |

---

## 9. Integration Points

| Component | Consumer | Contract |
|-----------|----------|---------|
| `crossReviewPath(…, revisionCount?)` | `runReviewCycle()`, `readCrossReviewRecommendation`, `countFindingsInCrossReviewFile()` | Produces versioned path; existing callers passing no `revisionCount` get unversioned behavior unchanged |
| `parseRecommendation(fieldValue)` | `readCrossReviewRecommendation` (after `extractRecommendationValue`), `mapRecommendationToStatus` callers (migrated) | Accepts extracted field value; heading extraction is caller responsibility |
| `SkipCondition` discriminated union | `workflow-validator.ts`, `evaluateSkipCondition()`, all YAML configs | Three co-changes required together (see TSPEC Section 4.1) |
| `checkArtifactExists` Activity | `featureLifecycleWorkflow` pre-loop, Temporal worker registration | Activity must be registered in worker before workflow uses it |
| `FeatureWorkflowState.activeAgentIds` + `completedPhaseResults` | `pollUntilTerminal()`, `emitProgressLines()` | Workflow sets these; CLI reads via `queryWorkflowState()` |
| `FakeTemporalClient` (updated) | All test files using `FakeTemporalClient` | Must implement updated `TemporalClientWrapper` interface; TypeScript compile errors if `signalHumanAnswer()` or updated `listWorkflowsByPrefix()` are missing |
| `buildContinueAsNewPayload()` (extended) | `featureLifecycleWorkflow` ContinueAsNew path | Must include `reviewStates`; test fixture must be updated to include `reviewStates` field |
| `LenientConfigLoader` | `RunCommand`, `ptah.ts case "run"` | Distinct from `NodeConfigLoader`; must not throw on missing `discord` section |

---

## 10. Definition of Done

- [ ] All new unit tests pass (`npm test` from `ptah/` directory)
- [ ] All existing unit tests continue to pass (no regressions)
- [ ] TypeScript compilation succeeds with no errors (`npm run build`)
- [ ] `FakeTemporalClient` implements the full updated `TemporalClientWrapper` interface — no TypeScript compilation errors in any test file
- [ ] All tests in `artifact-activity.test.ts` pass (task 3.2a/3.2b)
- [ ] `mapRecommendationToStatus()` is absent from `feature-lifecycle.ts` (verified by static-scan test)
- [ ] All 7 `agentIdToSkillName()` acceptance criteria pass: `se-review` → `software-engineer`, `pm-review` → `product-manager`, `te-review` → `test-engineer`, `eng` → `engineer`, `qa` → `test-engineer`, `pm` → `product-manager`, `fe` → `frontend-engineer`
- [ ] `deriveDocumentType("properties-tests")` returns `"PROPERTIES"`
- [ ] `FILE_MANIFEST` count assertion is `20` and all 8 skill stubs are present
- [ ] `buildConfig()` produces 8 agents in `agents.active` with correct skill paths
- [ ] Default `ptah.workflow.yaml` template contains all 19 phases, `revision_bound: 5` on all review phases, and `skip_if` on `req-creation`
- [ ] `ptah run --help` (or `ptah` with no args) documents the `run` subcommand
- [ ] `RunCommand` handles all terminal states with correct exit codes (0 for `completed`, 1 for `failed`, `revision-bound-reached`, `cancelled`)
- [ ] `resolveStartPhase()` covers all 7 auto-detection scenarios from the phase map table, each as a named test case
- [ ] `buildContinueAsNewPayload()` serializes `writtenVersions` — test asserts value is non-zero after round 2
- [ ] Pre-loop `checkArtifactExists` scan is exhaustive over full config regardless of `startAtPhase`
- [ ] `evaluateSkipCondition()` throws with exact error message when called with `artifact.exists` condition before pre-loop completes
- [ ] `bin/ptah.ts` contains `checkArtifactExists` token in worker activities block (verified by static-structure test in task 3.9)
- [ ] `RunCommand.execute()` integration test passes: happy path and duplicate-workflow error path both verified end-to-end (task 5.7)

---

## 11. Risk Notes

| Risk | Mitigation |
|------|-----------|
| `SkipCondition` type change is a co-change across three files — partial update leaves TypeScript happy but semantics wrong | Complete tasks 3.1 and 3.3 together in one commit; the compiler will flag call-site mismatches once the type is updated |
| `buildContinueAsNewPayload()` fixture shape change may break existing `feature-lifecycle.test.ts` tests | Update the fixture type first (task 3.8), then update all test fixtures that use it in the same task |
| `FakeTemporalClient` interface drift causes compilation failures across many test files | Task 2.5 updates the fake; complete before any Phase 3–5 tasks that add new test files importing it |
| `parseRecommendation()` signature change is breaking — callers must pass extracted value | Phase 1 task 1.4 updates the only caller (`readCrossReviewRecommendation`); verify no other callers exist before completing Phase 1 |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Senior Software Engineer | Initial execution plan. 5 phases, 25 tasks, derived from TSPEC-021 v1.2. |
| 1.1 | April 22, 2026 | Senior Software Engineer | Addressed cross-review feedback (te-review 4 High, 4 Medium; pm-review all Low). High: (H1) Split task 3.2 into 3.2a Red (write failing tests for `checkArtifactExists`) and 3.2b Green (implement activity) to enforce TDD order. (H2) Split tasks 5.3 and 5.4 into Red/Green pairs: 5.3a/5.3b for `pollUntilTerminal()` (terminal state handling, deduplication, transient errors, per-phase transitions, ROUTE_TO_USER delegation — each as a distinct test behavior), and 5.4a/5.4b for `countFindingsInCrossReviewFile()` and `emitProgressLines()` (finding count, versioned path, unreadable file, phase labels, optimizer dispatch line). (H3) Added task 5.7 integration test for `RunCommand.execute()` end-to-end using real `resolveStartPhase()`, `FakeTemporalClient`, and `FakeFileSystem` — covers happy path and duplicate-workflow error propagation. (H4) Added `artifact-activity.test.ts` DoD entry. Medium: (M1) Task 2.5 annotated with three required behavioral assertions for `FakeTemporalClient` in `factories.test.ts` (signalHumanAnswer recording, statusFilter filtering, no-filter backward compat). (M2) Task 3.9 extended with static-structure test asserting `checkArtifactExists` token present in `bin/ptah.ts` worker registration block; DoD entry added. (M3) Added task 1.5 — explicit regression tests for `extractRecommendationValue()` extraction path in isolation (heading scan, bold-wrapped value, code-fence skip, null on missing heading, multi-line look-ahead). (M4) Task 5.2 now names all 7 auto-detection scenarios (T1–T7) as distinct named test cases with explicit correspondence to FSPEC-CLI-02 acceptance tests; DoD updated to require all 7 named. Also added flush-before-read test assertion to task 5.5. Phase 5 preamble updated to reflect new task numbering (5.3a/b, 5.4a/b, 5.7). Total tasks: 32 (up from 25). |

---

*End of Document*
