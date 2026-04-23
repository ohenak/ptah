# Cross-Review: software-engineer — PROPERTIES

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Prior Feedback Resolution

All 8 High/Medium findings from iteration 1 (F-01 through F-08) were addressed in v1.1. Each is verified below before new findings are listed.

| Prior ID | Resolution Status | Notes |
|----------|------------------|-------|
| F-01 (High) | Resolved | PROP-RRC-05 rewritten: workflow builds path list unconditionally; silent-skip responsibility attributed to `DefaultContextAssembler`. PROP-RWV-07 updated consistently. |
| F-02 (High) | Resolved | PROP-CLI-01 reclassified Unit; explicit note that `FakeTemporalClient` drives the test; removed Integration classification conflict. |
| F-03 (High) | Resolved | PROP-SC-09 added: negative property requiring pre-loop scan still fires for phases before `startAtPhase`. |
| F-04 (Medium) | Resolved | PROP-CLI-06 now explicitly requires two independent test cases — one for `Running` status and one for `ContinuedAsNew`. |
| F-05 (Medium) | Resolved | PROP-CNP-05 updated to require token appear within activities registration block context, not anywhere in file. |
| F-06 (Medium) | Resolved | PROP-PR-10 added: complementary import/call assertion verifying `parseRecommendation` is imported and called in `feature-lifecycle.ts`. |
| F-07 (Medium) | Resolved | PROP-CLI-18 deduplication key updated to include `completedPhaseResults` alongside phase, iteration, and reviewer statuses. |
| F-08 (Medium) | Resolved | PROP-RWV-07 rewritten: distinguishes `runReviewCycle()` responsibility (pass all paths to assembler) from assembler responsibility (skip unreadable refs); unit test verifies path enumeration only. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | PROP-CLI-12 auto-detection statement contains a condition that does not match REQ-CLI-05 or PLAN task 5.2. The statement reads: "only the REQ file exists in the feature folder and no gap artifacts (TSPEC, PLAN, PROPERTIES) are present beyond the absent FSPEC." The REQ says: "no artifacts beyond the REQ" → resolves to `req-review` (no log). But PROP-CLI-12 introduces a parenthetical condition — "no gap artifacts beyond the absent FSPEC" — that is not part of the REQ or PLAN definition. REQ-CLI-05 treats a gap at FSPEC the same as "no FSPEC" and resolves to `fspec-creation` (PROP-CLI-13 covers this). The "only REQ exists, no gap artifacts" phrasing in PROP-CLI-12 implies a different scenario than the simpler "no FSPEC and no later artifacts" scenario. The statement is ambiguous: an implementer can reasonably read it as covering a case where TSPEC or PLAN are present without FSPEC (which should trigger PROP-CLI-13, not PROP-CLI-12). The PLAN T3 scenario definition ("REQ only, no gap — resolves to `req-review`") is unambiguous; PROP-CLI-12 should mirror it exactly: only the REQ file is present. | PROP-CLI-12 |
| F-02 | Medium | PROP-CLI-18 and PROP-CLI-24 together specify the deduplication key as including `completedPhaseResults`, but there is no property explicitly testing the scenario where `activeAgentIds` changes (optimizer dispatch begins) while phase, iteration, reviewer statuses, and `completedPhaseResults` are all unchanged. TSPEC Section 4.3 specifies `activeAgentIds` as a field in `FeatureWorkflowState` and PLAN task 5.3b calls for an `activeAgentIds.length > 0` check to emit the optimizer dispatch line. PROP-CLI-24 requires the optimizer-dispatch line when "all reviewers for a phase are done AND `activeAgentIds` contains at least one agent ID." If `activeAgentIds` changes from `[]` to `["pm-author"]` but reviewer statuses and `completedPhaseResults` are unchanged, the current deduplication key (phase + iteration + reviewer statuses + `completedPhaseResults`) does not change — so the dispatch line is suppressed. This is a correctness gap: the optimizer dispatch line would never be emitted when reviewers were already `approved` before the optimizer started. The deduplication key must include `activeAgentIds` or the dispatch detection must bypass deduplication entirely. | PROP-CLI-18, PROP-CLI-24 |
| F-03 | Medium | PROP-SC-06 is covered only by `artifact-activity.test.ts`, but the PLAN task 3.2a/3.2b produces a `createArtifactActivities()` factory. Q-01 from the prior cross-review (iteration 1) asked whether a contract test is needed for the factory's return shape against the `WorkflowActivities` interface. This question was not resolved in v1.1 — the Property Index and Test File Mapping list only PROP-SC-06 under `artifact-activity.test.ts`, but PLAN task 3.2a explicitly adds `createArtifactActivities()` factory assertion (d) as a required test: "createArtifactActivities() factory returns an object with a `checkArtifactExists` function." That factory-shape test is described in the PLAN but has no corresponding property in the PROPERTIES document. If the factory returns the wrong shape (e.g., returns `undefined` for `checkArtifactExists`) the workflow will fail at Temporal registration time — a silent runtime failure. A property covering the factory return-shape contract is missing. | PROP-SC-06, Section 18 |
| F-04 | Medium | PROP-RRC-03 is mapped to `feature-lifecycle.test.ts` (Section 18) but the property asserts that the agent context prompt injected via `SkillActivityInput.revisionCount` contains the line `Cross-review output file: CROSS-REVIEW-{skillName}-{docType}[-v{N}].md`. Per TSPEC Section 5.4 and PLAN task 5.3b, the prompt injection happens in `buildInvokeSkillInput()` inside `skill-activity.ts` — not in `feature-lifecycle.ts`. A unit test of `runReviewCycle()` in `feature-lifecycle.test.ts` can only verify that `revisionCount` is passed through the `SkillActivityInput` struct; it cannot verify the prompt assembly logic in `skill-activity.ts`. Q-03 from iteration 1 was left open and is still not resolved. The test file mapping is wrong for this property: it should be `ptah/tests/unit/temporal/skill-activity.test.ts`, not `feature-lifecycle.test.ts`. If the implementer follows the test-file mapping, they will write a test that verifies the wrong thing — passing `revisionCount` as a number through a struct is not the same as verifying the prompt string contains the correct output file name. | PROP-RRC-03, Section 18 |
| F-05 | Low | PROP-CLI-20 specifies the `PHASE_LABELS` map with 7 entries, but the map entry for `properties-tests` uses the label `PTT / Properties Tests`. PLAN task 5.4b references FSPEC-CLI-03 for the Phase Label Map and explicitly says `properties-tests` → `PTT`. REQ-CLI-03 describes Phase PT for Properties Tests and Phase PTT is not mentioned in the REQ at all. The label `PTT` is inconsistent with the REQ's `PT` notation. If the FSPEC and PLAN use `PTT`, there is a silent discrepancy between the REQ and the downstream documents that should be flagged — but this is a traceability note for the PM, not a blocking implementability issue. For properties correctness: the property should reference the source (FSPEC-CLI-03) for the label table, as it currently does via the PLAN, and the label value `PTT` should be verified against the FSPEC before hardcoding. | PROP-CLI-20 |
| F-06 | Low | PROP-INIT-02 was updated in v1.1 to replace the hardcoded `20` with a derivation rule. However, the statement still includes: "Per PLAN task 4.1, the expected count after removing 3 old skill stubs and 3 old agent-log stubs and adding 8 new skill stubs is `20`." The PLAN hardcodes `20` in task 4.1, but neither the PLAN nor PROP-INIT-02 identifies what the actual current `FILE_MANIFEST` count is. The derivation formula is: `(prior count) − 6 + 8 = prior + 2`. If `prior count = 18` then the result is `20`. But the statement says "previously 18" without citing the source. REQ-AG-01 also says "previously 18" without verification. The implementer must count the actual manifest before coding — this is a residual ambiguity from iteration 1 (F-11) that was acknowledged but not resolved. No blocking issue, but the prior-count citation should trace to the actual file (e.g., `defaults.ts` line N). | PROP-INIT-02 |
| F-07 | Low | PROP-ICR-07 still uses "Unit test (feature-lifecycle.test.ts)" as the enforcement mechanism for the old single-argument `isCompletionReady()` signature being absent. The prior cross-review F-10 recommended a static source-scan test (like PROP-PR-09) as more reliable, because a unit test that calls the new two-argument form passes even if the old one-argument overload still exists via TypeScript optional parameters. This was not addressed in v1.1. The finding is still valid — a static source-scan test or TypeScript type-narrowing test would be more reliable for detecting an overload. Non-blocking for correctness (the behavior test PROP-ICR-01 through PROP-ICR-06 covers the functional output), but the signature-removal guarantee is weak as specified. | PROP-ICR-07 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-CLI-15 states auto-detection must resolve to `implementation` when all five PDLC artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) are present. However PLAN task 5.2 scenario T6 also requires "all five present → resolves to `implementation`" with a specific log message `Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)`. PROP-CLI-15 specifies this log message inline. Is there a PLAN task or REQ AC that defines what the "implementation artifact" is (i.e., how the CLI detects whether `implementation` itself has completed)? The five-artifact scan stops at PROPERTIES — there is no sixth artifact for "implementation complete." The log message refers to a missing "implementation artifact" which is never defined in the detection chain. Is this message correct as specified? |
| Q-02 | PROP-MAP-08 requires `AGENT_TO_SKILL` to be "derived primarily by reversing `SKILL_TO_AGENT`, with a supplemental `LEGACY_AGENT_TO_SKILL` merge." Q-04 from iteration 1 asked whether the test verifies structural derivation or only observable outputs. This was not addressed in v1.1. Given that PROP-MAP-01 through PROP-MAP-07 cover all observable outputs, PROP-MAP-08 is only adding value if it tests the structural source-code organization. Should PROP-MAP-08 be a source-scan test (like PROP-PR-09/PROP-PR-10) asserting `SKILL_TO_AGENT` and `LEGACY_AGENT_TO_SKILL` are declared, or is the behavioral coverage from MAP-01 through MAP-07 sufficient? |
| Q-03 | The `PROP-CNP-05` static-structure test is mapped to `ptah/tests/unit/temporal/client.test.ts`. TSPEC Section 3.9 explains this is placed there because task 3.9 adds a static-structure test in `client.test.ts`. But the property asserts something about `bin/ptah.ts` (worker registration). Is there a reason this test cannot be in a dedicated structural test file or `run.test.ts`? The current placement in `client.test.ts` is conceptually misaligned — a client test file verifying worker registration in `bin/ptah.ts` will be surprising to maintainers. This is a maintainability concern rather than a correctness issue. |

---

## Positive Observations

- Resolution of F-01 (PROP-RRC-05 / PROP-RWV-07 boundary) is architecturally precise: the workflow's responsibility is path enumeration, the assembler's is file-skip behavior. The separation is now testable at the correct layer in both properties.
- PROP-SC-09 (added for F-03) is a well-formed negative property. The explicit test setup — configure `startAtPhase = "implementation"`, assert `checkArtifactExists` called for `"REQ"` artifact — gives the implementer no ambiguity about what the test must assert.
- PROP-CLI-06 split into two independent test cases (Running status and ContinuedAsNew status) removes the partial-stub risk identified in F-04. Both Temporal execution status values are now first-class test cases.
- PROP-PR-10 (added for F-06) is a strong guard against the rename-and-dead-code scenario. Requiring both an import and a call site in the source scan makes it genuinely complementary to PROP-PR-09's absence check.
- The deduplication key extension in PROP-CLI-18 to include `completedPhaseResults` is correct for the phase-transition emission use case (PROP-CLI-23, PROP-CLI-24). The logic is consistent across the three progress-line properties.
- Coverage matrix is complete and all 25 requirements trace to at least one property. No gaps found.
- Negative Properties section (Section 16) is comprehensive and covers every critical "must NOT" behavior with unit test classification.

---

## Recommendation

**Need Attention**

Two Medium findings require changes before implementation begins:

- **F-02 (Medium):** PROP-CLI-18 / PROP-CLI-24 deduplication key does not include `activeAgentIds`. When the optimizer is dispatched and only `activeAgentIds` changes (reviewer statuses and `completedPhaseResults` are unchanged), the dispatch line is suppressed by the current deduplication logic. Either add `activeAgentIds` to the deduplication key in PROP-CLI-18, or explicitly state that the optimizer dispatch detection in PROP-CLI-24 bypasses the key entirely.

- **F-03 (Medium):** No property covers the `createArtifactActivities()` factory return-shape contract (PLAN task 3.2a test case (d)). The factory shape is a Temporal worker registration contract — if the factory returns the wrong shape, the activity is silently unregistered. Add a property for this test case, or explicitly note that it is covered by PROP-SC-06 if the test already exercises the factory.

- **F-04 (Medium):** PROP-RRC-03 test file is mapped to `feature-lifecycle.test.ts` but the prompt assembly logic lives in `skill-activity.ts`. A feature-lifecycle unit test can only verify struct passthrough, not the prompt string content. Update the test file mapping to `ptah/tests/unit/temporal/skill-activity.test.ts` and clarify what the test must assert.

- **F-01 (Medium):** PROP-CLI-12 statement contains an ambiguous parenthetical condition inconsistent with REQ-CLI-05 and PLAN T3. Rewrite to match PLAN T3 exactly: "only the REQ file is present in the feature folder."
