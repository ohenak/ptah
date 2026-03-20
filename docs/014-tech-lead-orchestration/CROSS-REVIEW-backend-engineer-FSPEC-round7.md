# Cross-Review: Backend Engineer — FSPEC (Round 7)

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.6](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 7 (re-review following Round 6 — FSPEC updated to v1.6) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

FSPEC v1.6 resolves all remaining findings from Round 6, including the F-03 (LOW) developer advisory note that was partially addressed in v1.5. The document is production-quality. Four new LOW-severity editorial items are noted below — none block TSPEC authoring.

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 — AT-TL-01-03 GIVEN clause describes topologically impossible initial state | LOW | New |
| F-02 — Step 9 "this batch" ambiguous when deferred to final sub-batch | LOW | New |
| F-03 — Fan-out syntax with single bracketed target (`A → [B]`) behavior unspecified | LOW | New |
| F-04 — Sub-batch cascade note covers only agent failure, not merge conflict in non-final sub-batch | LOW | New |

---

## Round 6 Findings — Resolution Status

### F-03 (LOW) — RESOLVED ✅

The developer advisory note has been added to §2.6.1 step 8:

> *"After a test gate failure, all phases in the batch have already been merged to the feature branch (step 7). On resume, all batch phases are re-implemented over existing code — including phases whose worktree merges succeeded before the test gate ran. If re-implementation would be unsafe, manually mark the at-risk phases as Done in the plan document before re-invoking. The resume algorithm (FSPEC-BD-03 §2.8.1) will then exclude those phases and re-run only the phases that remain Not Done."*

This is structurally equivalent to the §2.6.2 developer guidance (partial-merge resume) and closes the asymmetry that was identified in Round 6. The note is also consistent with AT-BD-01-05 which was added in v1.5. Fully resolved.

The v1.6 changes to halt message phrasing ("re-invoke the tech lead — execution will automatically resume from Batch {N}") across §2.6.1 step 8, §2.6.2 step 3, and §2.7.2 step 4 are correct and consistent. They eliminate the misleading implication of explicit batch-number selection.

---

## New Findings

### F-01 (LOW) — AT-TL-01-03 GIVEN clause describes a topologically impossible initial state

**Location:** §2.4.4 AT-TL-01-03

**Issue:** The GIVEN clause states:

> *"GIVEN: Phase E depends on Phase D; both are in Batch 3"*

This initial condition cannot be produced by the topological layering algorithm defined in FSPEC-PD-02 §2.2.1. If Phase E has a direct dependency on Phase D, topological layering assigns them to consecutive batches (D in Batch N, E in Batch N+1 at minimum). Two phases sharing a dependency edge can never be placed in the same batch by the algorithm.

AT-TL-01-06 correctly represents the analogous scenario (D in Batch 3, E in Batch 4; user tries to move E into Batch 3). AT-TL-01-03's GIVEN appears to be a copy-editing artifact where "both are in Batch 3" was intended to establish that "Phase D is in Batch 3" (making Batch 2 an invalid target for Phase E).

**Impact:** An implementer reading only AT-TL-01-03 may be confused about whether this represents a post-modification state (which should also be impossible given the modification validation rules) or a direct-from-algorithm output. The THEN clause is unambiguous and the test's behavioral intent is clear, but the GIVEN introduces unnecessary confusion.

**Suggested fix:** Change the GIVEN to:

> *"GIVEN: Phase E depends on Phase D; Phase D is in Batch 3, Phase E is in Batch 4"*

This makes the initial state topologically consistent and removes the confusion.

---

### F-02 (LOW) — Step 9 "this batch" is ambiguous when deferred to final sub-batch

**Location:** §2.6.1 step 9

**Issue:** Step 9 reads:

> *"Mark all tasks in all phases of this batch as Done."*

The sub-batch note at the top of §2.6.1 states that step 9 is deferred to the final sub-batch only (sub-batch N.last). When step 9 executes in the context of sub-batch N.last, the phrase "this batch" is ambiguous: does it mean:

(a) All phases across **all sub-batches in topological batch N** (the intended interpretation — mark every phase that was dispatched across N.1, N.2, …, N.last as Done), or
(b) Only phases in the **final sub-batch N.last**?

The commit message template `"chore: mark Batch {N} phases as Done in plan"` uses the topological batch number (N, not N.last), which hints at interpretation (a), but the step text doesn't state this explicitly.

**Impact:** An implementer who reads step 9 in isolation — without carefully connecting the sub-batch note's deferral logic to step 9's "this batch" phrasing — could write logic that only marks the final sub-batch's phases as Done, leaving the phases from earlier sub-batches (N.1 through N.(last-1)) with stale "Not Done" statuses. This would cause incorrect resume behavior on subsequent invocations.

**Suggested fix:** Amend step 9 to read:

> *"Mark all tasks in all phases of **topological batch N** (all sub-batches N.1 through N.last) as Done."*

---

### F-03 (LOW) — Fan-out syntax with a single bracketed target is unspecified

**Location:** §2.1.2 step 4, Form 2 definition

**Issue:** The Form 2 (fan-out) syntax is defined as:

> *"Form 2 — Fan-out: `A → [B, C]` (B and C each depend on A; brackets required around multiple targets)"*

The phrase "brackets required around multiple targets" specifies the syntax for two or more targets but leaves the behavior of `A → [B]` (single target inside brackets) undefined. An implementer has three reasonable interpretations:

1. Valid — treat `A → [B]` as equivalent to `A → B` (Form 1 linear chain step); parse succeeds, edge A→B is created.
2. Rejected — "brackets required around **multiple** targets" means single-target bracket form is not a valid Form 2 declaration; the line is ignored (with a debug log entry per the "skipped line" rule in step 4).
3. Ambiguous — falls through to the Form 3 natural language check, which also fails, resulting in the line being ignored.

The difference matters if a plan author writes `A → [B]` intending it to be a valid dependency. Under interpretation 1, it works. Under interpretations 2 and 3, the edge A→B is silently dropped (with only a debug log), which could cause Phase B to be batched before Phase A — a correctness issue.

**Impact:** Low in practice (well-formed plans are unlikely to use this exact syntax), but could cause a correctness surprise for a plan author who learns fan-out syntax and writes `A → [B]` for a single dependency. Worth a one-sentence clarification.

**Suggested fix:** Add a parenthetical to the Form 2 definition:

> *"Form 2 — Fan-out: `A → [B, C]` (B and C each depend on A; brackets required around multiple targets; the single-target form `A → [B]` is treated as valid and equivalent to Form 1)"*

---

### F-04 (LOW) — Sub-batch failure cascade note covers only agent failure, not merge conflict in non-final sub-batch

**Location:** §2.6.1, sub-batch note (second paragraph)

**Issue:** The sub-batch cascade note states:

> *"Sub-batch failure cascade: If FSPEC-BD-02 is triggered for sub-batch N.M (due to any phase failure), all remaining sub-batches N.(M+1) and beyond are immediately cancelled."*

FSPEC-BD-02 covers agent-level phase failure. But §2.6.1 step 7 also includes MERGE CONFLICT HANDLING (§2.6.2), which independently halts execution. If a merge conflict occurs during step 7 of a **non-final** sub-batch (e.g., N.1 of a 2-sub-batch topological batch), §2.6.2 halts execution — but the sub-batch cascade note doesn't explicitly state that remaining sub-batches (N.2 in this example) are cancelled.

An implementer who reads the cascade note carefully before reading §2.6.2 might not realize that the §2.6.2 halt also prevents remaining sub-batches from executing. The halt is implicitly total (nothing continues after §2.6.2 triggers), but the cascade note's narrow framing ("FSPEC-BD-02 is triggered") could mislead.

**Impact:** The correct behavior (remaining sub-batches are cancelled on any halt, including merge conflict) is achievable from the overall flow, so this is unlikely to cause implementation bugs for a careful reader. But it creates a documentation gap that may produce a question during TSPEC authoring.

**Suggested fix:** Extend the cascade note:

> *"Sub-batch failure cascade: If FSPEC-BD-02 is triggered for sub-batch N.M **or if a merge conflict (§2.6.2) is encountered during step 7 of sub-batch N.M**, all remaining sub-batches N.(M+1) and beyond are immediately cancelled."*

---

## Positive Observations

- **v1.6 developer note in §2.6.1 step 8 is well-crafted.** It mirrors §2.6.2 closely, provides actionable guidance (mark phases as Done before re-invoking), and cross-references the resume algorithm. This is a meaningful improvement over v1.5 which only addressed the behavior via acceptance test.
- **Revised halt message phrasing is consistent and accurate.** All three halt sites (§2.6.1 step 8, §2.6.2 step 3, §2.7.2 step 4) now use "re-invoke the tech lead — execution will automatically resume from Batch {N}," which correctly describes the auto-detection resume behavior from FSPEC-BD-03 §2.8.1.
- **The FSPEC-TL-01 §2.4.2 step 1 re-prompt** now includes `'re-run Phase B'` in the example list, making modification type (d) discoverable in the happy-path flow rather than only in the error path. This is a good UX improvement.
- **Full traceability coverage.** Every requirement is either backed by an FSPEC with behavioral flow and acceptance tests, or explicitly listed in §4 with a justification for why no FSPEC is needed. The traceability table is complete.
- **The FSPEC's scope boundary (§1) is cleanly maintained.** Throughout 7 rounds of review, the document has consistently avoided specifying implementation details (data structures, algorithm library selection, worktree branch naming format) and deferred them to TSPEC. This discipline makes the document easy to review and implement against.

---

## Recommendation

**Approved with minor changes.**

All prior High and Medium findings are resolved. The four new findings are LOW severity editorial items. They do not block TSPEC authoring — the behavioral contracts, acceptance tests, and FSPEC → REQ traceability are complete and consistent.

The PM may address the four LOW findings in a future editorial pass or defer them; none affect the TSPEC author's ability to proceed with confidence.
