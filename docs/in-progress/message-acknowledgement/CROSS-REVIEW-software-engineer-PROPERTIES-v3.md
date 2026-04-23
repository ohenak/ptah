# Cross-Review: software-engineer — PROPERTIES

**Reviewer:** software-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/PROPERTIES-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 3

---

## Prior Findings — Resolution Status

| Prior ID | Severity | Resolution |
|----------|----------|-----------|
| SE2-F01 | Medium | **Resolved.** PREREQUISITES P-02 now explicitly references "PLAN TASK-05 (added during PROPERTIES review to address this gap)." PLAN v1.2 includes TASK-05 with full specification, dependency graph placement (BATCH 1, parallel with TASK-01), detailed before/after code, integration points table, and Definition of Done entry. |
| SE2-F02 | Medium | **Resolved.** FSPEC v1.2 corrected Branch A/B labels throughout: Section 1 Implementation Note (swapped labels for `startNewWorkflow()` and `handleStateDependentRouting()`), Section 2.2 item 12 (corrected to Branch B), Section 2.2 item 13, and all three behavioral flow diagrams (Sections 3.1–3.3) and FSPEC-MA-05. PROP-MA-30 note acknowledges FSPEC was being updated; the update is now complete. |
| SE2-F03 | Low | **Resolved.** PROP-MA-18 pass condition now reads: "Promise resolves (does not reject) AND WARN entry message equals `'Acknowledgement failed: rate limit exceeded'`", matching the PROP-MA-14 pattern. |
| SE2-F04 | Low | **Open (unchanged).** PROP-MA-23 fixture setup still does not explicitly state that the default `parentChannelId: "parent-1"` differs from `threadId: "thread-test"`. The assertion remains implicitly correct but does not document the fixture-level distinctness that makes the test meaningful. |
| SE2-F05 | Low | **Resolved.** PROP-MA-19 now specifies "flush at least 3 `await Promise.resolve()` calls" with explicit rationale (one per awaited call: `queryWorkflowState` → `phaseDetector.detect` → `startFeatureWorkflow`). |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| SE3-F01 | Low | PLAN AT-MA-13 still specifies only two `await Promise.resolve()` flushes, while PROP-MA-19 now correctly specifies three. PROP-MA-19 was updated as a result of SE2-F05, but the corresponding PLAN task (TASK-02, AT-MA-13 implementation note) was not updated in sync. The PLAN code sample shows only two flushes with the comment "if the test is flaky, add a third flush" — this is now contradicted by the PROPERTIES which mandate a minimum of 3. An implementer who follows the PLAN's AT-MA-13 code template verbatim will write a two-flush test that may vacuously pass checkpoint 1. | PROP-MA-19, PLAN TASK-02 AT-MA-13 implementation note |
| SE3-F02 | Low | PROP-MA-30 Note contains stale language: "FSPEC is being updated separately." FSPEC v1.2 has already made the correction. The note is no longer factually accurate and could mislead a reviewer or implementer into thinking the FSPEC fix is still pending. The note should either be removed or updated to "FSPEC v1.2 corrects this label throughout." | PROP-MA-30 Note |
| SE3-F03 | Low | FSPEC v1.2 AT-MA-03 Then clause references `postPlainMessageCalls.filter(c => c.channelId === message.threadId)`. However, `FakeDiscordClient.postPlainMessageCalls` stores entries with shape `{ threadId: string; content: string }` (factories.ts line 640) — there is no `channelId` property on these entries. The correct filter field is `c.threadId`, as specified in TSPEC Section 7.4 AT-MA-03 note and PLAN AT-MA-03. While this issue lives in the FSPEC (not the PROPERTIES), PROP-MA-04 inherits its testable assertion from FSPEC AT-MA-03 and references the same filter pattern. An implementer following FSPEC AT-MA-03 verbatim will write a TypeScript test that either fails to compile or silently passes because `c.channelId` is `undefined` for all entries (making the filter always false and the empty-array assertion vacuously true). This is a latent test correctness defect. | FSPEC AT-MA-03, PROP-MA-04, TSPEC Section 7.4 |
| SE3-F04 | Low | PROP-MA-23 fixture distinctness — carried forward from SE2-F04. The property still does not document that the default `parentChannelId: "parent-1"` already differs from `threadId: "thread-test"`, which is what makes the channel-ID sourcing assertion meaningful rather than vacuously true. A one-line fixture note ("Note: `parentChannelId` defaults to `"parent-1"`, which differs from `threadId: "thread-test"` — confirming the assertion does not vacuously pass when both are equal") would close this gap. | PROP-MA-23 |
| SE3-F05 | Low | PROP-MA-13 (`content.length === 226`) is still derivable from PROP-MA-09 assertions and adds no new invariant. As noted in SE-F07 and SE2 (open carry-through), this has not been merged or scoped to a distinct invariant. No new risk is introduced, but the redundancy remains. | PROP-MA-09, PROP-MA-13 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | FSPEC AT-MA-03's `c.channelId` reference (SE3-F03) — will this be fixed in a FSPEC v1.3, or will the PLAN and TSPEC's correct `c.threadId` wording be treated as the canonical implementation guide, with FSPEC AT-MA-03 tolerated as a minor documentation error? |
| Q-02 | PLAN AT-MA-13 still uses two flushes. Should PLAN be updated to v1.3 to reflect the three-flush requirement established by PROP-MA-19 v1.2, ensuring the implementer's code template is correct out of the box? |

---

## Positive Observations

- Both SE2-F01 (Medium) and SE2-F02 (Medium) are cleanly resolved. PLAN v1.2 gives TASK-05 full parity with TASK-01 in terms of specification depth: before/after code, rationale, dependency graph placement, and DoD entry. FSPEC v1.2 consistently applies the Branch A/B correction across all sections.
- SE2-F03 (Low) resolved with minimal, targeted change: the one-line addition to PROP-MA-18 pass condition is precise and does not alter the property's core assertion.
- SE2-F05 (Low) resolved with the correct three-flush minimum and explicit per-await rationale in PROP-MA-19, which is the right level of documentation for a deferred-promise ordering test pattern.
- PROP-MA-30 Note successfully disambiguates authority for branch labels (TSPEC and PROPERTIES are authoritative over FSPEC for this point), even though the stale language should now be updated (SE3-F02).
- The overall document is internally consistent: all prerequisite fields, coverage matrix annotations, gaps section, and change log are in agreement. No new cross-document contradictions were found beyond those listed above.

---

## Recommendation

**Approved with Minor Issues**

> All High and Medium findings from prior iterations are resolved. Remaining findings are Low severity only.

> SE3-F01 (Low): Update PLAN TASK-02 AT-MA-13 implementation note to specify three `await Promise.resolve()` flushes (matching PROP-MA-19 v1.2), removing the "if flaky, add a third" guidance. This prevents an implementer from writing a two-flush test that may vacuously satisfy checkpoint 1.

> SE3-F02 (Low): Update PROP-MA-30 Note to read "FSPEC v1.2 corrects this label throughout" (removing "is being updated separately"). One-word change; no structural impact.

> SE3-F03 (Low): Fix FSPEC AT-MA-03 Then clause: replace `c.channelId` with `c.threadId` in the `postPlainMessageCalls` filter. The `FakeDiscordClient.postPlainMessageCalls` type uses `threadId`, not `channelId` (factories.ts line 640). Without this fix, a test written verbatim from FSPEC AT-MA-03 will either fail to compile or silently pass vacuously.
