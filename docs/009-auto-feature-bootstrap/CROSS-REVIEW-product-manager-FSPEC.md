# Cross-Review: Product Manager — FSPEC-PTAH-PHASE9 (v1.3)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (`pm`) |
| **Document Reviewed** | [009-FSPEC-ptah-auto-feature-bootstrap.md](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Requirements Cross-Referenced** | [009-REQ-PTAH-auto-feature-bootstrap.md](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Prior Reviews** | CROSS-REVIEW-backend-engineer-FSPEC.md (Approved), CROSS-REVIEW-test-engineer-FSPEC.md (Approved with minor changes — all findings addressed in v1.3) |
| **Date** | March 14, 2026 |
| **FSPEC Version** | 1.3 |
| **Recommendation** | Approved — ready for TSPEC handoff |

---

## Summary

FSPEC v1.3 is thorough and internally consistent. All 8 Phase 9 requirements are covered by a single well-structured FSPEC. Both engineering (eng) and test (qa) reviews are complete and have approved the document. This PM review focuses on product-perspective concerns: requirement traceability, user experience alignment, and any product decisions that were left implicit.

Two findings are raised — one low-severity documentation gap (F-PM-01, extends F-BE-01 raised by the backend engineer) and one medium-severity UX clarification needed for the TSPEC (F-PM-02). Neither blocks TSPEC creation.

Additionally, the REQ document status must be updated from **Draft** to **Approved** before the TSPEC is written — this is a housekeeping fix.

---

## Findings

### F-PM-01 (Low): AT-AF-12 should note the context-assembler mismatch as a known limitation

**Location:** FSPEC §3.7 AT-AF-12

**Finding:**
The backend engineer raised this as F-BE-01. AT-AF-12 correctly specifies PM behavior when a thread has no `" — "` separator — but does not note that the folder the PM creates (`docs/008-create-requirements-for-auth/`) will not be found by `extractFeatureName()`, which returns the raw thread name `"create requirements for auth"` (spaces preserved, no NNN prefix). This is the same class of mismatch documented in AF-R8 for special-character threads, but the no-separator + unnumbered case is arguably more likely to occur in practice.

**Fix:** Add a brief note to AT-AF-12 (after the THEN block):
> **Known limitation (per AF-R8):** For threads with no `" — "` separator that are also unnumbered, the folder created by the PM may not match the path `extractFeatureName()` resolves. Developers should follow the `{NNN}-{feature-slug} — {task}` naming convention for full context-assembler compatibility.

This is documentation-only. Does not block TSPEC creation — TSPEC author should note it as a known gap.

---

### F-PM-02 (Medium): "Halt" behavior on filesystem errors needs UX clarification for TSPEC

**Location:** Business Rules AF-R6, AF-R7; Acceptance Tests AT-AF-05, AT-AF-06, AT-AF-11

**Finding:**
AF-R6 (folder creation failure) and AF-R7 (overview.md write failure) both say the PM must "report the error clearly and halt." AT-AF-05 (missing `docs/`) says the PM reports an error and halts. None of these specify *where* the error is reported — to the skill's internal log only, or as a visible Discord message in the thread.

From a user experience standpoint, this matters. If the PM halts silently (logs only), the user sees no response in the Discord thread and will not know why the PM stopped. If the PM posts an error to Discord, the user gets actionable feedback.

**Product decision:** The PM should post a visible error message to the Discord thread when halting due to a filesystem error or missing `docs/` directory. This is consistent with how the PM reports other blocking issues to users, and with the principle that Discord is the user's primary interface. Internal-log-only errors are invisible to users who are not monitoring the skill runner.

**Required TSPEC guidance:** The TSPEC must specify that halt errors are surfaced to the Discord thread (not just to internal logs), with a human-readable error message and, where applicable, a remediation step (e.g., "run `ptah init` to scaffold the project structure").

This does not change any FSPEC behavioral steps — it is an implementation detail for the TSPEC. It does not block TSPEC creation but must be addressed within it.

---

## Clarification Questions

None.

---

## Requirement Traceability Check

| Requirement | Covered by FSPEC? | Acceptance Tests Present? |
|-------------|-------------------|--------------------------|
| REQ-AF-01 | ✅ FSPEC-AF-01 §3.1, §3.4 Step 3 | ✅ AT-AF-01, AT-AF-02 |
| REQ-AF-02 | ✅ FSPEC-AF-01 §3.4 Step 4a | ✅ AT-AF-01 |
| REQ-AF-03 | ✅ FSPEC-AF-01 §3.4 Step 4b | ✅ AT-AF-03, AT-AF-10 |
| REQ-AF-04 | ✅ FSPEC-AF-01 §3.4 Steps 1–2 | ✅ AT-AF-04, AT-AF-08 |
| REQ-AF-05 | ✅ FSPEC-AF-01 §3.4 Step 6 | ✅ AT-AF-01, AT-AF-06 |
| REQ-AF-06 | ✅ FSPEC-AF-01 §3.4 Steps 7–8 | ✅ AT-AF-01, AT-AF-11 |
| REQ-AF-07 | ✅ FSPEC-AF-01 §3.4 Step 3b, Step 8a | ✅ AT-AF-02, AT-AF-09 |
| REQ-AF-NF-01 | ✅ FSPEC-AF-01 §3.4 Step 8b, Step 9 | ✅ AT-AF-01 (implied) |

**Traceability verdict:** All 8 requirements have FSPEC coverage and acceptance tests. No orphaned requirements. ✅

---

## Scope Alignment Check

| Scope Item | FSPEC Aligned? |
|-----------|---------------|
| PM skill creates folder + overview.md as Phase 0 | ✅ |
| NNN extraction and auto-assignment | ✅ |
| Idempotency | ✅ |
| No orchestrator changes required | ✅ AF-R8 documented |
| Out of scope: modifying overview.md on subsequent invocations | ✅ AF-R4, REQ-AF-07 |
| Out of scope: creating other files during bootstrap | ✅ Not present in flow |
| Out of scope: Discord/thread operations | ✅ AF-R5 (no Discord embeds) |

---

## Positive Observations

1. **12 acceptance tests is the right level of coverage.** AT count grew from 7 (v1.0) to 12 (v1.3) in direct response to reviewer feedback — the PM responded correctly to each finding.

2. **AF-R1 (slugification alignment with `extractFeatureName()`)** is the single most important correctness property in the spec, and it is correctly stated as a synchronization requirement, not just a style preference. The TSPEC must treat this as a mandatory alignment test.

3. **The decision to halt on filesystem errors** (AF-R6, AF-R7) rather than silently degrade is the right product call. Silent failures would compound across every subsequent invocation on the same thread.

4. **Scope boundary is tight.** The PM resisted expanding Phase 9 scope to include `context-assembler.ts` changes (AF-R8), correctly limiting this phase to the PM skill SKILL.md. This keeps Phase 9 focused and low-risk.

5. **Phase 0 is invisible to users in the happy path (AF-R5).** This is the right UX decision — bootstrapping is housekeeping, not a product event.

---

## Housekeeping Required Before TSPEC

**REQ document status:** `009-REQ-PTAH-auto-feature-bootstrap.md` is marked as **Draft** (Version 1.0). It has been effectively approved (the FSPEC based on it has been reviewed and approved by both eng and qa). The REQ status must be updated to **Approved** before the TSPEC is written. This is being actioned as part of this review cycle.

---

## Recommendation

**Approved — ready for TSPEC handoff.**

Summary of TSPEC author guidance (non-blocking items to address in TSPEC):

| Item | Source | Guidance |
|------|--------|----------|
| Context-assembler mismatch for no-separator threads | F-PM-01 / F-BE-01 | Document as known limitation, extending AF-R8 |
| Halt error visibility to user | F-PM-02 | Error messages must be posted to Discord thread, not log-only |
| CWD / path resolution for `docs/` in PM tool context | Backend engineer F-03 (prior review, deferred to TSPEC) | Confirm PM skill's working directory during tool execution |
| AF-R1 integration test | QA F-TE-06 | Include cross-system test: PM output matches `extractFeatureName()` for standard thread names |
| AT-AF-12 context-assembler mismatch note | F-PM-01 | Add known-limitation note to AT-AF-12 |
