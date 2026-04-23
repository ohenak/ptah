# Cross-Review: test-engineer — TSPEC

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/TSPEC-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Prior Finding Resolution

| Prior ID | Severity | Status | Notes |
|----------|----------|--------|-------|
| F-01 (v2) | Medium | Resolved | "Gap at position 2" test description corrected in Section 13.2 to "gap (FSPEC absent, TSPEC present)" — matches REQ-CLI-05 AC phrasing. Duplicate test row removed. |
| F-02 (v2) | Medium | Resolved | `countFindingsInCrossReviewFile()` now uses injected async `FileSystem.readFile()` (Section 6.6); function is `async` returning `Promise<number \| "?">`. `emitProgressLines()` made `async` and `await`s the call. `fs: FileSystem` parameter threaded through `PollParams`. Q-01 from v2 fully answered. |
| F-03 (v2) | Medium | Carried — see F-01 below | `readOneLine()` two-line buffer discard test case still absent from Section 13.2. |
| F-04 (v2) | Medium | Carried — see F-02 below | No integration test between `RunCommand` and `YamlWorkflowConfigLoader` specified in Section 13.1 or 14. |
| F-05 (v2) | Medium | Resolved | `checkArtifactExists` unit tests now listed in new `artifact-activity.test.ts` entry in Section 13.2, covering non-empty → true, whitespace-only → false, read error → false, path construction, and trailing-slash case. Q-03 from v1 closed. |
| F-06 (v2) | Low | Carried — see F-03 below | `LenientConfigLoader.load()` unit tests still not listed in Section 13.1 or 13.2. |
| F-07 (v2) | Low | Resolved | `deepEqual`/`arrayEqual` usage for deduplication is context-clear in the algorithm; the initial-state-transition test is covered by the existing "Progress deduplication — Same state → no new lines" test (covering both directions). Resolved as acceptable. |
| F-08 (v2) | Low | Resolved | `hasGapBeyondFSPEC` hard-coded `"fspec-creation"` latent consistency concern noted but acceptable: `DETECTION_SEQUENCE[1].nextPhase` is `"fspec-creation"` and the structure is not expected to change; the test for the gap scenario exercises the hard-coded path. Resolved as acceptable. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | `readOneLine()` (Section 6.7) is specified to close the readline interface after resolving on the first `"line"` or `"close"` event. No test case covers the edge condition where a `Readable` stream is pre-loaded with two lines: the second line must be discarded and must NOT be consumed by a subsequent `handleQuestion()` call. Without this test, a buffering bug — where the readline interface consumes a queued second line before closure, then the next `handleQuestion()` invocation in the poll loop receives a stale answer — could go undetected. The test table (Section 13.2) covers "stdin answered" and "stdin closed (EOF)" but not the two-line-buffer discard scenario. This is a distinct, implementable unit test: create a `Readable` with two pre-loaded lines; call `readOneLine()` once; assert it returns the first line only; call a second `readOneLine()` against a fresh interface; assert it does not receive the second line from the prior interface. (Carried forward from F-07 in iteration 1, F-03 in iteration 2.) | Section 6.7, Section 13.2 |
| F-02 | Medium | No integration test is specified between `RunCommand` and `YamlWorkflowConfigLoader`. The `RunCommand` unit tests listed in Section 13.2 exclusively use `FakeWorkflowConfigLoader`. Section 14 explicitly lists this integration boundary (`ptah.ts case "run"` creates a real `YamlWorkflowConfigLoader`) but no corresponding integration test entry exists in Section 13.1 or 13.2. The critical behavior to verify: when a real `ptah.workflow.yaml` is written with a review phase that is missing `revision_bound`, `YamlWorkflowConfigLoader` must throw `WorkflowConfigError` and `RunCommand.execute()` must catch it, print the validation error, and return exit code 1. This boundary cannot be exercised by unit tests with fake loaders and is the only path that exercises the `validateRequiredFields()` revision_bound validation (Section 9.2) end-to-end. (Carried forward from F-09 in iteration 1, F-04 in iteration 2.) | Section 13.1, Section 14 |
| F-03 | Low | `LenientConfigLoader` unit behavior is fully specified in Section 6.2 (throws only on missing file or invalid JSON; does not throw for absent `discord`) but no test entry for the real `LenientConfigLoader.load()` implementation exists in Section 13.1 or 13.2. The distinguishing cases from `NodeConfigLoader` are three: (a) `ptah.config.json` missing → throws; (b) invalid JSON → throws; (c) `discord` absent → does not throw. These are the only behavioral differences and are directly implementable as unit tests using `FakeFileSystem`. The `FakeLenientConfigLoader` is listed as a test double (returning controlled `RunConfig`) but there is no test for the real production code path. (Carried forward from F-13 in iteration 1, F-06 in iteration 2.) | Section 6.2, Section 13.1 |
| F-04 | Low | Section 6.5 `pollUntilTerminal()` specifies that `queryWorkflowState()` throwing during polling causes a `continue` (transient error → keep polling). Section 12.1 documents this as "Log warning to stderr, continue polling (transient errors)". However, the poll algorithm pseudocode only shows `catch: continue` with no stderr write. Section 13.2 has no test case asserting that a `queryWorkflowState()` exception during the polling loop produces a warning on stderr before continuing. The unit test table covers "Workflow failed" and "Workflow completed" but not "transient query error during poll → warning logged, polling resumes." Without this test, the stderr-warning behavior described in Section 12.1 is undocumented at the test level and could be silently dropped during implementation. | Section 6.5, Section 12.1, Section 13.2 |
| F-05 | Low | The `resolveStartPhase()` test case "Auto-detection — empty folder (no artifacts, Step 1 bypassed via fake FS)" (Section 13.2) correctly notes that Step 1 (`RunCommand.execute()` REQ validation) prevents `lastContiguousIndex === -1` at runtime. However, the algorithm's note (Section 6.4) says this branch is included for defensive completeness "to make the function safe when called in isolation (e.g., in tests with a fake filesystem that has no files)." The described test bypasses Step 1 "via fake FS" but does not say whether this test calls `resolveStartPhase()` directly (isolation test) or calls `RunCommand.execute()` with a fake FS that returns non-empty for the REQ but empty for all other artifacts. Clarifying this is important: if the test calls `RunCommand.execute()`, Step 1 validation will fire first (REQ file is validated in Step 1, before `resolveStartPhase()` is called — if the FS returns `false` for the REQ, the test exits at Step 1 with "REQ file not found", not via `resolveStartPhase()`). The test description is ambiguous enough that a test implementor might write the wrong test — one that inadvertently tests Step 1 rejection rather than the `lastContiguousIndex === -1` branch. | Section 6.4, Section 13.2 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Section 6.5 `pollUntilTerminal()` algorithm shows `catch: continue` for transient `queryWorkflowState()` errors, but Section 12.1 says "Log warning to stderr, continue polling." Should the pseudocode be updated to include `stderr.write(...)` before `continue`, and should a test be added asserting this? The current specification is inconsistent between the algorithm (Section 6.5) and the error table (Section 12.1). |
| Q-02 | The `checkArtifactExists` path construction test (Section 13.2, `artifact-activity.test.ts`) covers "featurePath ends with `/`" but does not cover "featurePath does NOT end with `/`" as a failing or incorrect-output case. Should the test explicitly assert that a missing trailing slash produces an incorrect path (and therefore fail — documenting that callers MUST supply a trailing slash), or should `checkArtifactExists` normalize the path internally? The pre-loop algorithm in Section 5.8 uses `state.featurePath ?? "./"` which always provides a trailing slash — but the Activity itself does not enforce this. |

---

## Positive Observations

- The v1.2 TSPEC has resolved all Medium findings from iteration 2. Most notably, the `countFindingsInCrossReviewFile()` async/injectable design (TE v2 F-02) is now cleanly specified with `async`/`await` and the `FileSystem` dependency threaded through `PollParams` all the way from `RunCommandDeps`. This is the correct pattern for testability.
- The `checkArtifactExists` unit test table in the new `artifact-activity.test.ts` (Section 13.2) is complete and precisely specifies the contract — non-empty, whitespace-only, read-error, path-construction, and trailing-slash cases are all covered. This fully resolves the longest-running carried finding (from TE v1 F-10).
- The `completedPhaseResults` lifecycle in Section 4.3 is clean and unambiguous. The three new test cases for phase transition emission (Passed ✅, Revision Bound Reached ⚠️, and non-review phase no-op) make the `pollUntilTerminal()` transition detection fully verifiable.
- The `ContinueAsNewPayload.signOffs` type correction (`Record<string, boolean>` — PM v2 F-01) is now consistent throughout the document: `FeatureWorkflowState`, `buildContinueAsNewPayload()` parameter, and the payload type all use `boolean`. This prevents a sign-off type mismatch bug that could surface only on ContinueAsNew boundaries.
- The FSPEC-CLI-02 phase map summary table at the end of Section 6.4 is an excellent acceptance test matrix — all 7 scenarios map 1:1 to test cases in Section 13.2, making traceability straightforward.
- The v1.2 change log is detailed and precise, citing every prior finding ID and describing the exact technical change made. This level of documentation significantly reduces the risk of regression during implementation.

---

## Recommendation

**Approved with Minor Issues**

> No High findings remain. The two Medium findings (F-01, F-02) are both carried-forward gaps from prior iterations — neither represents a new design error introduced in v1.2.
>
> - **F-01 (Medium):** The `readOneLine()` two-line buffer discard test is a narrow but real correctness gap. It can be addressed as an implementation-time clarification note to the implementing engineer rather than requiring a v1.3 revision.
> - **F-02 (Medium):** The `RunCommand`/`YamlWorkflowConfigLoader` integration test gap is the most actionable item. A single integration test file (e.g., `tests/integration/commands/run.integration.test.ts`) writing a real YAML to a temp directory and calling `RunCommand.execute()` would close this boundary. This can be added as an explicit test task in the PLAN rather than requiring a TSPEC revision.
> - **F-03, F-04, F-05 (Low):** These are clarification gaps that an engineer can resolve inline during implementation without altering the design.
>
> The TSPEC is ready for PLAN authoring. The implementing engineer should receive F-01 and F-02 as explicit implementation notes.
