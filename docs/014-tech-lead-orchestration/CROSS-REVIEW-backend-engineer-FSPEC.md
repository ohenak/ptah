# Cross-Review: Backend Engineer — FSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 1 (initial review of v1.1) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

Three Medium findings, two Low findings. All three Medium findings introduce implementability gaps or behavioral ambiguities that would force the TSPEC author to make undocumented product decisions. The FSPEC is otherwise thorough and well-structured — the happy-path flows, acceptance tests, and edge-case tables are clear and implementable. Revisions are targeted and should not require restructuring the document.

---

## Findings

### F-01 — MEDIUM: Dependency syntax forms underspecified in FSPEC-PD-01 §2.1.2

**Location:** §2.1.2 step 4

**Issue:** The FSPEC says: *"Expected format: one or more lines of the form: 'Phase X depends on: Phase A, Phase B' or the equivalent shorthand used in the plan template (e.g., 'X → A, B'). Any recognizable form stating phase relationships is acceptable."*

The phrase "any recognizable form" is not implementable. It leaves the set of supported syntax forms open-ended, which means a parser author can legitimately decide what is or isn't "recognizable" — and could write a parser that supports only the natural-language form (`Phase X depends on: Phase A, Phase B`) but not the arrow shorthand, or vice versa, and still claim FSPEC compliance.

The problem is compounded by a mismatch with the REQ. REQ-PD-01 mandates support for two specific syntaxes:
- **Linear chain:** `A → B → C`
- **Fan-out:** `A → [B, C]` (brackets around multiple targets)

The FSPEC's example `X → A, B` is neither of these exactly — it's a comma-separated fan-out *without brackets*, which the REQ does not list as a required form. An implementer reading only the FSPEC would have no basis for writing a test that asserts `A → [B, C]` is parsed correctly.

**Required fix:** Replace the "any recognizable form" clause with an explicit enumeration of the two required syntax forms from REQ-PD-01 (`A → B → C` and `A → [B, C]`), and state that additional variant forms (e.g., the natural-language `Phase X depends on: Phase A, Phase B`) are also accepted. Update AT-PD-01-01's example to use one of the specified syntaxes.

---

### F-02 — MEDIUM: Modification loop in FSPEC-TL-01 §2.4.2 does not reject "move to same batch as dependency"

**Location:** §2.4.2 step 2b; AT-TL-01-03

**Issue:** The modification loop correctly rejects a move that places a phase *before* its dependency (batch number < dependency's batch number). However, it does not address the case where a user moves a phase *into the same batch* as one of its dependencies.

Consider: Phase D is in Batch 3, and Phase E (which depends on Phase D) is in Batch 4. The user requests "move Phase E to Batch 3." Phase E now shares a batch with Phase D. Since phases within a batch run in parallel (REQ-BD-02), Phase E and Phase D could execute simultaneously — Phase E might start before Phase D finishes, violating the dependency. This is semantically identical to placing Phase E before Phase D; it must be rejected.

The FSPEC says: *"If the requested move would place a phase before one of its dependencies, reject the move."* A strict reading of "before" means batch number strictly less than the dependency's batch number (not equal). This gap allows a compliant implementation to permit the same-batch move and silently introduce a dependency violation.

AT-TL-01-03 demonstrates only the "before" case — it does not cover the "same batch" scenario.

**Required fix:** Amend §2.4.2 step 2b to state that a phase may not be moved to the same batch as any of its dependencies (not just to a batch before them). Add an acceptance test covering the same-batch rejection case (e.g., "Phase E depends on Phase D, both would be in Batch 3 — reject").

---

### F-03 — MEDIUM: Sub-batch failure cascade behavior not explicitly specified

**Location:** §2.6.1 (sub-batch note + step 6); FSPEC-BD-02

**Issue:** The sub-batch note in §2.6.1 describes the happy-path flow for sub-batches: *"Sub-batches N.1 through N.(last-1) skip steps 8–10 and proceed directly from step 7 (merge) to the next sub-batch at step 1."* Step 6 says: *"If ANY phase failed: Enter BATCH FAILURE HANDLING (FSPEC-BD-02). Stop here."*

The "Stop here" in step 6 implies halting the entire topological batch, including any remaining sub-batches. However, this is only an inference — the sub-batch note only describes what to do when all phases succeed (the happy path). It does not explicitly state that a failure in sub-batch N.1 prevents sub-batch N.2 from executing.

An implementer following the sub-batch note to the letter could read "proceed to the next sub-batch at step 1" as the default transition and interpret step 6's "Stop here" as only halting work within the current sub-batch — not as cancelling remaining sub-batches. This would result in N.2 being dispatched even when N.1 failed, which violates the no-partial-merge invariant (FSPEC-BD-02 §2.7.3) since N.2's merges would be on top of a feature branch that hasn't received N.1's work.

**Required fix:** Add an explicit statement to the sub-batch note (or to FSPEC-BD-02) stating: "If FSPEC-BD-02 is triggered for sub-batch N.M (due to phase failure), all remaining sub-batches N.(M+1)+ are cancelled. The failure handling and halt described in FSPEC-BD-02 apply to the entire topological batch — no further sub-batches execute." Add an acceptance test covering sub-batch N.1 failure preventing N.2 from starting.

---

### F-04 — LOW: REQ-PD-06 missing from traceability table in §4

**Location:** §4 FSPEC → Requirement Traceability

**Issue:** REQ-PD-06 (Detect and report cyclic dependencies) is a P0 requirement that is behaviorally covered by FSPEC-PD-01 §2.1.2 step 6a and §2.1.5. However, it is absent from the traceability table in §4. FSPEC-PD-01 is linked only to REQ-PD-01 and REQ-PD-05.

This means the traceability table claims REQ-PD-06 has no FSPEC coverage — which is incorrect — and any downstream tooling or audit that relies on §4 to identify "requirements not covered by an FSPEC" would incorrectly flag REQ-PD-06 as unspecified.

**Required fix:** Add REQ-PD-06 to the FSPEC-PD-01 row in the §4 traceability table.

---

### F-05 — LOW: FSPEC-TL-02 Check 2 verification mechanism is unspecified

**Location:** §2.5.2 Check 2

**Issue:** Check 1 (feature branch on remote) is verifiable via a standard git remote query (`git ls-remote`). Check 2 — *"Verify that the `ArtifactCommitter` service supports the two-tier branch merge operation"* — has no analogous verification mechanism specified or even suggested.

An implementer designing the TSPEC needs to know: Is this a runtime capability flag, a version check, a module existence check, or something else? Without at least a hint, the TSPEC author must invent a verification mechanism that may be incompatible with the actual Phase 010 implementation.

This is deferrable to TSPEC, but the FSPEC should at minimum describe the *type* of check expected (e.g., "verify by checking whether the `ArtifactCommitter` module exports a `mergeBranchIntoFeature` method" or "check a capability flag in the Ptah configuration").

**Required fix:** Add a sentence to Check 2 describing what constitutes a pass at a behavioral level — even if the specific implementation (import check, config flag, etc.) is left to TSPEC.

---

## Clarification Questions

**Q-01:** In FSPEC-PD-01 §2.1.5, Sequential Fallback Mode step 4 says: *"Do not run the pre-flight infrastructure check (FSPEC-TL-02) — sequential execution does not require the Phase 010 branch infrastructure."* However, FSPEC-TL-02 §2.5.1 says pre-flight is *skipped entirely in sequential fallback mode*. These two statements are consistent, but sequential fallback can be triggered in §2.1.5 (before the pre-execution confirmation), while FSPEC-TL-02 §2.5.1 says pre-flight runs *after* user approval. Is the ordering correct? When fallback is triggered at parse time (§2.1.5), does the user still see the pre-execution confirmation (FSPEC-TL-01) with the "Sequential fallback" label, and pre-flight is simply never invoked? Please confirm this ordering is intentional.

**Q-02:** FSPEC-BD-03 §2.8.3 says: when the user requests "Re-run Phase B," the tech lead adds Phase B back to the in-memory batch plan "without writing to the plan document." If Phase B's dependents (e.g., Phase D which depends on Phase B) are also marked Done, Phase D remains marked Done and will not re-run. Is this the intended behavior? If Phase B's re-run changes its outputs, Phase D's Done status would be stale. Should the tech lead warn the developer when a re-run phase has downstream phases that are also marked Done?

---

## Positive Observations

- **The no-partial-merge invariant (FSPEC-BD-02 §2.7.3) is clearly reasoned.** The explanation of the trade-off (re-doing successful sibling phases vs. clean branch state) will make TSPEC decisions easier to justify and test cases easier to write.
- **FSPEC-BD-03 resume logic is elegant.** Auto-detection by re-running the same batch-computation algorithm (rather than storing resume metadata) eliminates an entire class of resume-state synchronization bugs. This design should be explicitly called out as an invariant in the TSPEC.
- **The modification loop termination rules in §2.4.3 are complete and testable.** Four distinct exit conditions (approve, cancel, timeout, 5-iteration cap) are specified with distinct outputs, making them straightforward to write acceptance tests for.
- **The change log accurately tracks what items were resolved from prior REQ reviews.** The deferred items (TE-F-03, TE-F-04) are properly re-resolved in this FSPEC rather than silently dropped.
- **Sub-batch labeling convention (`N.1`, `N.2`) and the "test gate fires once per topological batch" rule (REQ-NF-14-01) are now consistently applied** across FSPEC-PD-02 §2.2.1, §2.2.4, the sub-batch note in FSPEC-BD-01 §2.6.1, and AT-PD-02-03. The v1.1 changelog corrections addressed the pre-commit bugs cleanly.

---

## Recommendation

**Needs revision.**

Three Medium findings (F-01, F-02, F-03) must be resolved before TSPEC authoring can begin. Each introduces an implementability gap or behavioral ambiguity that would force undocumented product decisions into the TSPEC. The revisions are narrow and targeted — no structural changes to the FSPEC are required.

Please address all Medium findings and route the updated FSPEC back for re-review.

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 — Dependency syntax underspecified ("any recognizable form") | MEDIUM | ⬚ Open |
| F-02 — Same-batch dependency violation not addressed in modification loop | MEDIUM | ⬚ Open |
| F-03 — Sub-batch failure cascade behavior not explicitly specified | MEDIUM | ⬚ Open |
| F-04 — REQ-PD-06 missing from §4 traceability table | LOW | ⬚ Open |
| F-05 — ArtifactCommitter Check 2 verification mechanism unspecified | LOW | ⬚ Open |
