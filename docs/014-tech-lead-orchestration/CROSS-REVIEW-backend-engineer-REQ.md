# Cross-Review: Backend Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 3 (re-review of v1.2 following TE Round 3 "Needs revision") |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Re-Review Summary

This is a fresh Round 3 review triggered by the test engineer's Round 3 "Needs revision" verdict on v1.2. The prior BE Round 2 approval remains valid for all findings BE-F-01 through BE-F-06. However, codebase analysis of `pdlc-dispatcher.ts` and `phases.ts` reveals one new **Medium** finding not present in prior rounds: the `isForkJoinPhase` interaction with `useTechLead` for fullstack features. I also concur with TE-F-01 from an implementation standpoint.

---

## Prior Findings — Resolution Status

| Finding | Severity | Description | Status |
|---------|----------|-------------|--------|
| BE-F-01 | HIGH | Fan-out dependency syntax unspecified | ✅ Resolved |
| BE-F-02 | HIGH | Partial-batch failure merge semantics undefined | ✅ Resolved |
| BE-F-03 | HIGH | Worktree creation mechanism unspecified | ✅ Resolved |
| BE-F-04 | MEDIUM | `pdlc-dispatcher.ts` integration path unspecified | ✅ Resolved |
| BE-F-05 | LOW | R-05 risk severity stale | ✅ Resolved |
| BE-F-06 | LOW | REQ-BD-08 concurrent write risk unaddressed | ✅ Resolved |

---

## New Findings

### F-01 — MEDIUM: `isForkJoinPhase` is not explicitly suppressed when `useTechLead === true` for fullstack features

**Affected requirements:** REQ-TL-01, REQ-NF-14-03

**Codebase context:** In `pdlc-dispatcher.ts`, the function `isForkJoinPhase` returns `true` when `config.discipline === "fullstack"` and the phase is in `FORK_JOIN_PHASES` (which includes `IMPLEMENTATION`). When `isForked === true`, the dispatcher fires the `subtask_complete` event path rather than `lgtm`, splitting IMPLEMENTATION into a fork/join over `eng` and `fe`.

REQ-TL-01 states the orchestrator must route to tech-lead when `useTechLead: true`. REQ-NF-14-03 states:

> "The `FORK_JOIN_PHASES` classification for fullstack IMPLEMENTATION continues to apply when `useTechLead` is false."

This sentence implies (by contrast) that FORK_JOIN_PHASES should **not** apply when `useTechLead === true`. However, it never explicitly states this. A TSPEC author reading only REQ-NF-14-03 could:

- (Correct) modify `isForkJoinPhase` to return `false` when `config.useTechLead === true`, suppressing fork-join and allowing the single tech-lead dispatch path to take over.
- (Incorrect) leave `isForkJoinPhase` unchanged, causing the dispatcher to simultaneously attempt a fork-join dispatch (`eng` + `fe`) and a tech-lead dispatch — producing two conflicting dispatch actions for the same IMPLEMENTATION phase.

The ambiguity is silent and would only be caught at runtime. This needs an explicit statement at the REQ level.

**Resolution needed:** Add one sentence to REQ-NF-14-03 (or REQ-TL-01): _"When `useTechLead === true`, the `FORK_JOIN_PHASES` fork-join behavior for IMPLEMENTATION is suppressed regardless of `discipline`, and a single tech-lead dispatch is issued instead."_

---

### F-02 — LOW: `FeatureConfig` interface extension is implied but not named

**Affected requirements:** REQ-TL-01, REQ-NF-14-03

REQ-TL-01 refers to "the feature's `FeatureConfig` has `useTechLead: true`" but the current `FeatureConfig` interface in `phases.ts` only defines `{ discipline: Discipline; skipFspec: boolean }`. The REQ never names the interface or states it must be extended.

This is Low — any TSPEC author will know to add `useTechLead?: boolean` to `FeatureConfig`. However, given `FeatureConfig` is also persisted in the state file (`PdlcStateFile`), the TSPEC must also address migration: existing state files without `useTechLead` must default to `undefined`/`false`. A migration note in the REQ's constraints section would reduce TSPEC guesswork.

**Resolution needed (Low — acceptable to defer to TSPEC):** The TSPEC should explicitly state: "Add `useTechLead?: boolean` to `FeatureConfig`; treat `undefined` as `false` everywhere to preserve backward compatibility with existing persisted state."

---

## Concurrence with TE Round 3 Findings

### TE-F-01 — MEDIUM: REQ-NF-14-02 contradicts itself on failure-case cleanup

I concur from an implementation standpoint. The description ("After each agent completes (success or failure), its worktree must be cleaned up") and the acceptance criteria ("Worktrees are removed after successful completion; retained on failure if configured") are genuinely contradictory for the failure path when `retain_failed_worktrees` is `false`. An implementation author using the description as the source of truth would always clean up on failure. An author using the acceptance criteria would conditionally clean up. The default value for `retain_failed_worktrees` being unspecified compounds this — when the flag is absent, the expected behavior is ambiguous. The TE's proposed resolution is correct.

### TE-F-02 through TE-F-04 — LOW

No additional technical concerns beyond the TE's write-up. F-02 (plan file precondition failures) is worth a brief REQ clause; F-03 and F-04 are cleanly deferred to TSPEC.

---

## Clarification Questions

None. All prior questions (Q-01 through Q-03) remain resolved.

---

## Positive Observations

All Round 2 positive observations remain valid. One additional observation:

- **REQ-NF-14-03's backward-compatibility structure** is well-designed as a migration pattern: the `useTechLead` flag can be incrementally adopted per feature without requiring any changes to existing feature state files. The opt-in flag avoids forced migration and makes the feature easy to test in isolation against the existing dispatcher code paths.

---

## Recommendation

**Needs revision.**

| Finding | Severity | Blocking? |
|---------|----------|-----------|
| F-01 (NEW) | MEDIUM | Yes — `isForkJoinPhase` suppression for `useTechLead === true` must be explicitly required before TSPEC authoring to avoid a silent dual-dispatch bug for fullstack features |
| F-02 (NEW) | LOW | No — acceptable to defer to TSPEC |
| TE-F-01 | MEDIUM | Yes — REQ-NF-14-02 description/criteria contradiction with undefined default must be resolved |
| TE-F-02 | LOW | No — recommended brief REQ clause |
| TE-F-03 | LOW | No — defer to TSPEC |
| TE-F-04 | LOW | No — defer to TSPEC |

**Required before re-approval:** F-01 and TE-F-01 (both Medium) must be resolved. The PM should address both in the next version, then route back for re-review.
