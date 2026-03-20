# Cross-Review: Backend Engineer — FSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 2 (re-review of v1.2) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All five findings (F-01–F-05) and both clarification questions (Q-01, Q-02) from the round 1 review of v1.1 have been resolved — the FSPEC is substantially better. Three new Medium findings were discovered during the re-review. Two are genuine spec gaps introduced or exposed by the v1.2 revisions; one is a pre-existing contradiction between §2.4.1 and §2.5.1 that was not previously caught. No structural changes are required; all three are narrow, targeted fixes.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (v1.1) — MEDIUM | Dependency syntax forms underspecified ("any recognizable form") | ✅ Resolved — §2.1.2 step 4 enumerates three explicit forms |
| F-02 (v1.1) — MEDIUM | Same-batch move not rejected in modification loop | ✅ Resolved — §2.4.2 step 2b now covers same-batch rejection; AT-TL-01-06 added |
| F-03 (v1.1) — MEDIUM | Sub-batch failure cascade behavior not specified | ✅ Resolved — sub-batch failure cascade note added to §2.6.1; AT-BD-02-04 added |
| F-04 (v1.1) — LOW | REQ-PD-06 missing from §4 traceability table | ✅ Resolved — added to FSPEC-PD-01 linked requirements and §4 |
| F-05 (v1.1) — LOW | ArtifactCommitter Check 2 verification mechanism unspecified | ✅ Resolved — §2.5.2 now specifies behavioral pass condition |
| Q-01 (v1.1) | Parse-time fallback → confirmation → skip pre-flight ordering | ✅ Resolved — §2.5.1 adds explicit ordering statement |
| Q-02 (v1.1) | Downstream Done phases warning when re-running a completed phase | ✅ Resolved — §2.8.3 adds the downstream Done phases warning |

---

## New Findings

### F-01 — MEDIUM: "Re-run Phase" not listed as a valid modification type in FSPEC-TL-01 §2.4.2

**Location:** §2.4.2 step 2 "Valid modification types"; §2.8.3

**Issue:** FSPEC-TL-01 §2.4.2 enumerates three valid modification types the developer may request during the modification loop:
- (a) Change skill assignment
- (b) Move a phase to a different batch
- (c) Split a batch

FSPEC-BD-03 §2.8.3 instructs the developer to use **the modify option in FSPEC-TL-01** to request "Re-run Phase B." However, "re-run Phase" does not appear as a valid modification type anywhere in §2.4.2.

An implementer writing the modification loop handler from §2.4.2 alone would produce code with three recognized modification verbs (skill change, phase move, batch split). When the developer types "re-run Phase B," the handler has no specification for this input — it would either return an "unrecognized modification" error or silently ignore it, neither of which is specified behavior.

This is not a cross-reference documentation gap; it is a functional gap in the modification loop spec. The modification loop in §2.4.2 is the authoritative place to enumerate what the tech lead understands as valid modification requests. Without "re-run Phase" in that list, the loop is underspecified.

**Required fix:** Add a fourth valid modification type to §2.4.2 step 2:
> (d) Force a phase to re-run regardless of Done status (e.g., "re-run Phase B"). See §2.8.3 for the behavior when this is requested.

---

### F-02 — MEDIUM: §2.4.1 shows pre-flight Pass/Fail results in the pre-approval confirmation, but §2.5.1 explicitly states pre-flight runs *after* user approval

**Location:** §2.4.1 item 2; §2.5.1; §2.5.3 step 3

**Issue:** §2.4.1 specifies the content of the Batch Execution Plan presented to the user before they type "approve":

> "2. Pre-flight status — Pass/Fail for each infrastructure check (feature branch presence, ArtifactCommitter availability) — only shown when parallel mode is active."

The phrasing "Pass/Fail" indicates actual check results are shown in the confirmation. However, §2.5.1 states unambiguously:

> "Pre-flight runs **after** the user approves the batch execution plan (FSPEC-TL-01) and **before** any agents are dispatched."

This is a direct contradiction: the confirmation (§2.4.1) shows pre-flight results, but pre-flight hasn't run yet at the point the confirmation is displayed (§2.5.1).

§2.5.3 step 3 reinforces §2.5.1's model by saying "The user **already** approved the intent" when describing the fallback triggered by pre-flight failure — confirming that user approval precedes pre-flight. Under this model, the user approves without seeing pre-flight results, and if pre-flight fails, the plan silently degrades to sequential without re-asking the user. The user has no opportunity to cancel based on pre-flight failure.

An implementer resolving this contradiction must choose one of two incompatible designs:
1. Pre-flight runs before the confirmation (user sees results, can cancel if both checks fail) — §2.4.1 model.
2. Pre-flight runs after approval (user approves blind; fallback is applied silently) — §2.5.1 model.

These are meaningfully different UX behaviors. The FSPEC must resolve this; it cannot be deferred to TSPEC.

**Required fix:** Choose one model and make §2.4.1, §2.5.1, and §2.5.3 consistent. The most user-friendly resolution is that pre-flight runs **before** the confirmation, and:
- §2.4.1 item 2 shows actual Pass/Fail results (as written)
- §2.5.1 is updated to: "Pre-flight runs **before** the pre-execution confirmation is displayed and **before** any agents are dispatched. In sequential fallback mode, pre-flight is skipped entirely."
- §2.5.3 is updated accordingly (user sees the fallback in the confirmation before approving, rather than after)

Alternatively, if the intent is truly post-approval pre-flight (§2.5.1 model), then §2.4.1 item 2 must be removed or replaced with a description of what will be checked (not actual Pass/Fail results), since those results are not yet available when the confirmation is shown.

---

### F-03 — MEDIUM: Merge conflict handling leaves the feature branch in a partial-merge state that the resume logic will re-run incorrectly, and §2.6.2 note misstates what re-running will do

**Location:** §2.6.2; §2.8.1; §2.8.3

**Issue:** §2.6.2 specifies that when a merge conflict occurs at phase X in step 7:
- Phases already merged (before X) have their changes on the feature branch.
- Phase X's merge is aborted; remaining (not-yet-merged) phases' worktrees are cleaned up without merging.
- The plan status is **not** updated for any phase in the batch.

The FSPEC notes: *"the developer resolves the conflict and resumes from this batch number, **which will re-implement any phases whose merges were aborted.**"*

However, the resume logic in FSPEC-BD-03 §2.8.1 works purely from plan Done-status. Because the plan was not updated (§2.6.2 step 4), **all** phases in the batch will appear as Not Done — including those whose merges already succeeded (their code is already on the feature branch). The auto-detection will include them all in the next batch computation, and they will all be re-implemented and re-merged.

The FSPEC note's claim that "only phases whose merges were aborted" will be re-implemented is inaccurate. Every phase in the batch will be re-run. This creates two risks:
1. The re-implemented worktree for a phase already merged attempts to merge over code that already exists on the feature branch. If the implementation is deterministic, the merge may succeed as a no-op. If not, it will produce a new conflict in a phase that succeeded the first time.
2. The developer is given a false expectation by the note — they expect only aborted phases to re-run, but all batch phases (including previously-successful ones) re-run.

This is qualitatively different from phase failure (FSPEC-BD-02), where the no-partial-merge invariant guarantees the feature branch is unchanged before resume. Merge conflict handling does not guarantee a clean state.

The FSPEC says "This partial state is expected and acceptable" — but does not give the developer or implementer guidance on whether to make already-merged phases idempotent, or whether to manually mark already-merged phases as Done before resuming (which contradicts the ordering invariant in §2.6.1 step 9).

**Required fix:** One of the following resolutions (PM's choice of design):

**Option A (clean state — consistent with failure handling):** Amend §2.6.2 to roll back already-successful merges before halting, using `git revert` or equivalent. The feature branch is restored to its pre-batch state. Resume will correctly re-run all Batch N phases from a clean baseline. Update the note accordingly.

**Option B (accept partial state — fix the note and add developer guidance):** Amend the note in §2.6.2 to accurately state that ALL phases in the batch will be re-implemented on resume (not just aborted ones), explain the risk of duplicate merges for already-merged phases, and add a developer guidance note: "Before resuming, verify that re-implementing already-merged phases is idempotent, or manually mark those phases as Done in the plan document prior to re-invoking the tech lead." Add a corresponding AT-BD-01 acceptance test covering the partial-merge resume scenario.

---

## Clarification Questions

None. All round 1 questions have been answered clearly in v1.2.

---

## Positive Observations

- **All three Medium findings from round 1 are cleanly resolved.** The dependency syntax enumeration (§2.1.2 step 4) is now precise and implementable. The same-batch rejection rule (§2.4.2 step 2b) covers the parallel-execution constraint correctly. The sub-batch failure cascade (§2.6.1 sub-batch note + AT-BD-02-04) is explicit and testable.
- **Q-01 and Q-02 are both answered well.** The parse-time fallback ordering in §2.5.1 is now unambiguous. The downstream Done phases warning in §2.8.3 addresses the stale-status scenario that Q-02 raised.
- **AT-PD-01-01 is now accurate.** The 6-node DAG count and the canonical fan-out syntax fix both landed cleanly.
- **FSPEC-BD-03 resume logic remains one of the strongest sections.** The auto-detection algorithm (re-running batch computation = stateless resume) is elegant and the downstream Done phases warning (§2.8.3) is a thoughtful addition that will prevent silent stale-state bugs.
- **§4 traceability table is now complete.** REQ-PD-06 is correctly linked.

---

## Recommendation

**Needs revision.**

Three new Medium findings (F-01, F-02, F-03) must be resolved before TSPEC authoring can begin:
- F-01 is a spec completeness gap (modification loop handler is missing one valid input type).
- F-02 is a direct contradiction between two sections that forces the TSPEC author to make an undocumented product decision about pre-flight timing.
- F-03 is a behavioral inaccuracy in the merge conflict resume description that will mislead both developers and implementers.

All three fixes are narrow and targeted — no restructuring is required. Please resolve and route the updated FSPEC back for re-review.

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 — "Re-run Phase" missing from FSPEC-TL-01 §2.4.2 valid modification types | MEDIUM | ⬚ Open |
| F-02 — Pre-flight timing contradicts between §2.4.1 (pre-approval) and §2.5.1 (post-approval) | MEDIUM | ⬚ Open |
| F-03 — §2.6.2 merge conflict resume misstates what phases are re-run; partial-merge state unmanaged | MEDIUM | ⬚ Open |
