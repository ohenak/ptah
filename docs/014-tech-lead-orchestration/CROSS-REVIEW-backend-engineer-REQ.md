# Cross-Review: Backend Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 4 (re-review of v1.3 following BE Round 3 / TE Round 4 "Needs revision") |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved** |

---

## Re-Review Summary

This is Round 4, reviewing v1.3. The PM has revised the REQ to address all blocking Medium findings from BE Round 3 and TE Round 4. Both Medium findings (F-01 and TE-F-01 / F-02) are now resolved. No new Medium or High findings identified. All remaining open Low findings are either resolved or explicitly deferred to TSPEC.

---

## Prior Findings — Resolution Status

| Finding | Round | Severity | Description | Status |
|---------|-------|----------|-------------|--------|
| BE-F-01 (Round 3) | 3 | HIGH | Fan-out dependency syntax unspecified | ✅ Resolved (v1.1) |
| BE-F-02 (Round 3) | 3 | HIGH | Partial-batch failure merge semantics undefined | ✅ Resolved (v1.1) |
| BE-F-03 (Round 3) | 3 | HIGH | Worktree creation mechanism unspecified | ✅ Resolved (v1.1) |
| BE-F-04 (Round 3) | 3 | MEDIUM | `pdlc-dispatcher.ts` integration path unspecified | ✅ Resolved (v1.1) |
| BE-F-01 (Round 3, NEW) | 3 | MEDIUM | `isForkJoinPhase` not explicitly suppressed when `useTechLead === true` | ✅ Resolved (v1.3) — see below |
| TE-F-01 (Round 4 carry) | 3→4 | MEDIUM | REQ-NF-14-02 description contradicts acceptance criteria; default unspecified | ✅ Resolved (v1.3) — see below |
| BE-F-02 (Round 3, NEW) | 3 | LOW | `FeatureConfig` extension implied but not named | ✅ Deferred to TSPEC (acceptable) |
| TE-F-02 (Round 4 carry) | 3→4 | LOW | Plan file precondition failures unspecified | ✅ Resolved (v1.3) — added to REQ-PD-01 |
| TE-F-03 (Round 4 carry) | 3→4 | LOW | Sub-batch split order unspecified | ✅ Deferred to TSPEC (acceptable) |
| TE-F-04 (Round 4 carry) | 3→4 | LOW | REQ-TL-02 modification loop termination undocumented | ✅ Deferred to TSPEC (acceptable) |
| TE-F-03 (Round 4, NEW) | 4 | LOW | Test suite invocation timeout unspecified | ✅ Deferred to TSPEC via note in REQ-BD-05 (acceptable) |

---

## Resolved Medium Findings — Verification

### BE-F-01 / TE-F-02 — RESOLVED: `isForkJoinPhase` suppression now explicitly required

**Verification:** REQ-NF-14-03 v1.3 now reads:

> "The `FORK_JOIN_PHASES` classification for fullstack IMPLEMENTATION continues to apply when `useTechLead` is false. When `useTechLead === true`, the `FORK_JOIN_PHASES` fork-join behavior for IMPLEMENTATION is suppressed regardless of `discipline`, and a single tech-lead dispatch is issued instead."

This exactly matches the resolution requested in BE Round 3 and TE Round 4. A TSPEC author now has an unambiguous implementation target: modify `isForkJoinPhase` (or the dispatch decision logic) to return `false` when `config.useTechLead === true`. A test engineer can now write a deterministic integration test asserting that a fullstack feature with `useTechLead: true` receives exactly one tech-lead dispatch with no fork-join pair. ✅

### TE-F-01 / F-01 — RESOLVED: REQ-NF-14-02 contradiction and default value specified

**Verification:** REQ-NF-14-02 v1.3 description now reads:

> "After each agent completes successfully, its worktree must be cleaned up. After a failed agent completes, its worktree must be cleaned up unless `retain_failed_worktrees` is set to `true` in the Ptah configuration. The `retain_failed_worktrees` flag defaults to `false` when absent — cleanup is the default behavior on failure."

And the acceptance criteria now reads:

> "Worktrees are removed after successful completion; worktrees are removed after failure unless `retain_failed_worktrees: true` is set in configuration (default: `false`); when retention is enabled, failed worktrees are preserved for debugging"

The prior contradiction is fully eliminated. Description and acceptance criteria are now consistent. The default value (`false`) is explicitly stated in both the description and the acceptance criteria. A test author can now write a deterministic failure-path test for the unconfigured case (expect cleanup) and a separate test for the `retain_failed_worktrees: true` case (expect retention). ✅

### TE-F-02 (Low) — RESOLVED: Plan file precondition added to REQ-PD-01

**Verification:** REQ-PD-01 acceptance criteria v1.3 now includes: "If the plan file is missing or unreadable, the tech lead reports the error with the file path and halts." This is a clean, testable addition. ✅

### TE-F-03 (Low, Round 4) — Deferred to TSPEC: Test suite timeout

**Verification:** REQ-BD-05 v1.3 changelog confirms "deferred test suite invocation timeout to TSPEC via note in REQ-BD-05." The REQ-level acknowledgment of deferral is present. This is acceptable — the core assertion/invocation failure modes are fully specified and testable without the timeout policy. ✅

---

## New Findings

None. No new High, Medium, or Low findings identified in v1.3.

---

## Clarification Questions

None. All prior questions (Q-01 through Q-03) remain resolved.

---

## Positive Observations

All prior positive observations remain valid. Additional observations on v1.3:

- **v1.3 revision scope is minimal and targeted.** The PM correctly restricted changes to the two blocking findings and one Low (REQ-PD-01 precondition), avoiding scope creep that could introduce new issues. The changelog accurately reflects what changed.
- **REQ-NF-14-02 is now the clearest worktree lifecycle specification in the document set.** The three-sentence description (success cleanup, failure cleanup default, explicit default value) is immediately translatable into a decision table for TSPEC: two success-path rows (success, cleanup) and two failure-path rows (failure + flag false → cleanup; failure + flag true → retain).
- **REQ-NF-14-03 backward-compatibility structure** correctly handles the three cases: (a) `useTechLead` absent → existing behavior unchanged; (b) `useTechLead: false` → existing behavior unchanged; (c) `useTechLead: true` → single tech-lead dispatch, fork-join suppressed. All three cases are now deterministically testable.
- **The overall REQ set is implementation-ready.** With all Medium findings resolved, the TSPEC author has unambiguous specifications for all P0 requirements. The deferred Low items (FeatureConfig migration, sub-batch ordering, loop termination) are appropriate TSPEC concerns and do not block design.

---

## Recommendation

**Approved.**

All blocking Medium findings (BE-F-01 and TE-F-01/F-02) have been correctly resolved in v1.3. All Low findings are either resolved or appropriately deferred to TSPEC. No new findings. The REQ is ready for TSPEC authoring.

| Finding | Severity | Status |
|---------|----------|--------|
| BE-F-01 (Round 3) — `isForkJoinPhase` suppression | MEDIUM | ✅ Resolved in v1.3 |
| TE-F-01 (Round 3→4) — REQ-NF-14-02 contradiction | MEDIUM | ✅ Resolved in v1.3 |
| TE-F-02 (Round 4) — Plan file precondition | LOW | ✅ Resolved in v1.3 |
| TE-F-03 (Round 4) — Test suite timeout | LOW | ✅ Deferred to TSPEC |
| BE-F-02 (Round 3) — FeatureConfig extension | LOW | ✅ Deferred to TSPEC |
| TE-F-03 (Round 3→4) — Sub-batch split order | LOW | ✅ Deferred to TSPEC |
| TE-F-04 (Round 3→4) — Modification loop termination | LOW | ✅ Deferred to TSPEC |
