# Cross-Review: software-engineer — PROPERTIES

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PROPERTIES-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 3

---

## Prior Feedback Resolution

All 4 Medium findings from iteration 2 (F-01 through F-04) were addressed in v1.2. Each is verified below before new findings are listed.

| Prior ID | Resolution Status | Notes |
|----------|------------------|-------|
| F-01 (Medium) | Resolved | PROP-CLI-12 rewritten to match PLAN T3 exactly: "only the REQ file is present in the feature folder (FSPEC, TSPEC, PLAN, and PROPERTIES are all absent)." Ambiguous parenthetical removed. |
| F-02 (Medium) | Resolved | PROP-CLI-18 deduplication key extended to include `activeAgentIds` (sorted comma-separated string) as the 4th component. PROP-CLI-24 explicitly states that a transition from `activeAgentIds = []` to `activeAgentIds = ["pm-author"]` changes the key and causes the optimizer-dispatch line to be emitted. |
| F-03 (Medium) | Resolved | PROP-SC-06A added: Contract/Unit property requiring `createArtifactActivities()` factory to return an object with a `checkArtifactExists` function property, addressing PLAN task 3.2a test case (d). Test file: `artifact-activity.test.ts`. |
| F-04 (Medium) | Resolved | PROP-RRC-03 corrected: Test File field added pointing to `skill-activity.test.ts`; statement updated to specify the test must be a unit test of `buildInvokeSkillInput()` in `skill-activity.ts`, not `runReviewCycle()`. Test file mapping updated accordingly. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Low | PROP-CLI-18 deduplication key now lists `completedPhaseResults` participation as: "the set of `{phaseId: result}` pairs serialized as a sorted key-value string must be identical across consecutive polls." However, the property does not specify the serialization format used to produce this string (e.g., `JSON.stringify(sortedEntries)`, custom `key=value` concatenation). Two implementers using different serialization strategies would both satisfy the stated property but produce incompatible deduplication behavior. The statement should either name a concrete serialization method (e.g., `Object.entries(completedPhaseResults).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>${k}=${v}).join(',')`) or defer to the implementation by stating the comparison must be deep-equal rather than string-based. This is a precision issue, not a correctness gap — the deduplication intent is correct but the test assertion will be ambiguous. | PROP-CLI-18 |
| F-02 | Low | PROP-CNP-05 specifies a static-structure test asserting the token `"checkArtifactExists"` appears within the worker activities registration block in `bin/ptah.ts`. The property states the test "should use a targeted regex or structural parse." The PLAN (task 3.9) says a static-structure test in `client.test.ts` "reads the source of `bin/ptah.ts` as a string and asserts it contains the token." These are two different precision levels. The PLAN-level formulation (token anywhere) was what iteration 1 F-05 identified as insufficient; PROP-CNP-05 v1.2 tightened it to require context-awareness. However, the property still says "should use a targeted regex" — prescribing the mechanism in the statement creates ambiguity when the test is implemented differently. The statement would be stronger if it described the observable contract (the token appears as an argument to the `proxyActivities()` or `createWorker({ activities: ... })` call) without prescribing the implementation mechanism. Non-blocking. | PROP-CNP-05 |
| F-03 | Low | PROP-INIT-02 still reads "Per PLAN task 4.1, the expected count after removing 3 old skill stubs and 3 old agent-log stubs and adding 8 new skill stubs is `20`" — with the acknowledgement that this must be verified against the actual codebase. The actual current `FILE_MANIFEST` in `ptah/src/config/defaults.ts` contains exactly 18 entries (verified by reading the file): 13 doc/config entries + 3 skill stubs (`pm-agent.md`, `dev-agent.md`, `test-agent.md`) + 3 agent-log stubs + the `ptah.config.json` placeholder. Removing 3 skill stubs and 3 agent-log stubs (−6) and adding 8 new skill stubs (+8) yields 18 − 6 + 8 = 20. The derivation is correct and the `20` value is accurate. The residual ambiguity from prior iterations (F-11 in v1, F-06 in v2) is therefore resolved by the actual codebase count. No change required. This is an observation, not a finding. | PROP-INIT-02 |
| F-04 | Low | Q-01 from iteration 2 remains unaddressed: PROP-CLI-15 specifies the log message as `Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)`. This message refers to "implementation artifact missing" — but the five-artifact detection chain (REQ → FSPEC → TSPEC → PLAN → PROPERTIES) has no sixth artifact for "implementation complete." The auto-detection logic stops at PROPERTIES and defaults to `implementation`. The log message is therefore technically inaccurate: there is no "implementation artifact" that is checked for absence. The PLAN task 5.2 scenario T6 states "all five present → resolves to `implementation`" without mentioning a sixth artifact. The log message should read `Auto-detected resume phase: implementation (all PDLC artifacts present)` or similar — unless an implementation artifact check is intended and was inadvertently omitted from the detection chain. The current message as specified is misleading to users reading it and misleading to implementers writing the test assertion. | PROP-CLI-15 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | PROP-ICR-07 (unchanged from iteration 2) still specifies "old single-argument signature must not exist anywhere in the codebase" as a Unit test assertion. The codebase currently has `isCompletionReady(signOffs: Record<string, string>): boolean` with a single argument. A unit test that calls the two-argument form does not prove the one-argument overload is absent. The prior cross-review recommendation to add a static source-scan test (like PROP-PR-09/PR-10) was noted as F-10 in iteration 1 and as F-07 (Low) in iteration 2 but was not addressed. Is this intentionally deferred, or should a static-scan test be added to PROP-ICR-07 in analogy with PROP-PR-09? |
| Q-02 | PROP-MAP-08 requires `AGENT_TO_SKILL` to be derived from `SKILL_TO_AGENT` reversal. The current codebase at `cross-review-parser.ts` lines 141–143 already does this (`const AGENT_TO_SKILL = Object.fromEntries(Object.entries(SKILL_TO_AGENT).map([k,v] => [v,k]))`). The new `LEGACY_AGENT_TO_SKILL` merge will add entries that cannot be expressed as a pure reversal. Q-04 from iteration 1 and Q-02 from iteration 2 asked whether PROP-MAP-08's test is structural (source-scan) or behavioral. This was never answered. Given that PROP-MAP-01 through PROP-MAP-07 cover all behavioral outputs, PROP-MAP-08 is only adding value as a structural invariant guard. A behavioral test adds no coverage beyond PROP-MAP-01–07. Should PROP-MAP-08 be amended to require a source-scan test asserting `SKILL_TO_AGENT` and `LEGACY_AGENT_TO_SKILL` are present as named constants? |

---

## Positive Observations

- All 4 Medium findings from iteration 2 are fully and precisely resolved. PROP-SC-06A is particularly well-specified: the two-part assertion (a) non-null return, (b) `typeof result.checkArtifactExists === "function"` gives the implementer an exact test body with clear rationale.
- PROP-CLI-18 and PROP-CLI-24 together now form a complete, unambiguous specification of the deduplication key with 4 components and an explicit worked example (transition from `activeAgentIds = []` to `["pm-author"]`). This level of specificity is exactly what is needed for a property that is easy to under-implement.
- The PROP-RRC-03 correction (Test File now points to `skill-activity.test.ts`) resolves the structural mismatch that would have caused an implementer to write a pass-through test instead of a prompt-content test. The clarification in the statement ("not a test of `runReviewCycle()`") is direct and unambiguous.
- PROP-CLI-05 now explicitly references FSPEC-CLI-01 BR-CLI-06, adding full traceability from the property to the FSPEC behavioral rule that defines the catch-and-reformat path. This is the right level of cross-document linkage.
- The 96-property count, 12-domain decomposition, and coverage matrix with zero gaps across all 25 requirements remain consistent and complete after the v1.2 changes.
- The Negative Properties section (Section 16) is comprehensive and each entry has precise Unit test classification. No gaps found on re-read.

---

## Recommendation

**Approved with Minor Issues**

> All High and Medium findings from prior iterations are resolved. The 4 remaining findings are all Low severity. None block implementation. The document is ready to proceed to the implementation phase.

Key observations for implementers:

- **F-04 (Low):** The log message in PROP-CLI-15 (`implementation artifact missing`) is technically inaccurate — there is no sixth artifact in the detection chain. The test assertion for PLAN T6 should use a corrected message before coding begins to avoid a misleading user-facing string.
- **F-01 (Low):** PROP-CLI-18's `completedPhaseResults` serialization format is underspecified. The implementer must choose and document a consistent serialization approach before writing the deduplication test.
- **F-03 (Observation):** The PROP-INIT-02 `FILE_MANIFEST` count of `20` is confirmed correct against the actual codebase. No change needed.
