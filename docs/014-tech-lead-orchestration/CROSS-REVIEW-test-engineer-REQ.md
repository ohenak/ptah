# Cross-Review: Test Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 4 (re-review of v1.2 following BE Round 3 "Needs revision") |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Re-Review Summary

This is a Round 4 re-review of v1.2. The REQ document has not been revised since Round 3 — no v1.3 exists. Both blocking Medium findings from Round 3 (TE-F-01 and BE-F-01) remain unresolved in the current document text. This review:

1. Confirms the Round 3 blocking findings remain open.
2. Concurs with the new BE Round 3 Medium finding (BE-F-01, `isForkJoinPhase` suppression).
3. Adds one new Low finding identified during the fresh pass.

---

## Prior Findings — Resolution Status

| Finding | Round | Severity | Description | Status |
|---------|-------|----------|-------------|--------|
| TE-F-01 (Round 1–3) | 1–3 | HIGH→resolved, then re-raised | Various — all prior High/Medium fully resolved by v1.1 | ✅ Resolved |
| TE-F-01 (Round 3) | 3 | MEDIUM | REQ-NF-14-02 description contradicts acceptance criteria; `retain_failed_worktrees` default unspecified | ❌ **Still open** — v1.2 text unchanged |
| TE-F-02 (Round 3) | 3 | LOW | Plan file precondition failures unspecified | ❌ Still open (recommended REQ clause not added) |
| TE-F-03 (Round 3) | 3 | LOW | Sub-batch split order unspecified | Deferred to TSPEC — still acceptable |
| TE-F-04 (Round 3) | 3 | LOW | REQ-TL-02 modification loop termination undocumented | Deferred to TSPEC — still acceptable |
| BE-F-01 (Round 3) | 3 | MEDIUM | `isForkJoinPhase` not explicitly suppressed when `useTechLead === true` | ❌ **Still open** — v1.2 text unchanged |
| BE-F-02 (Round 3) | 3 | LOW | `FeatureConfig` extension implied but not named | Deferred to TSPEC — still acceptable |

---

## Blocking Findings Carried Forward (Unresolved)

### F-01 — MEDIUM (Carried from Round 3 TE-F-01): REQ-NF-14-02 description contradicts acceptance criteria on failure-case worktree cleanup

**Affected requirement:** REQ-NF-14-02 (Worktree cleanup)

The current v1.2 text of REQ-NF-14-02 reads:

> **Description:** "After each agent completes (success or failure), its worktree must be cleaned up. Worktrees from failed agents must be retained for debugging if the `retain_failed_worktrees` config flag is set."
>
> **Acceptance Criteria:** "Worktrees are removed after successful completion; retained on failure if configured."

The description's first sentence mandates cleanup on both success and failure. The second sentence carves out retention for failure when configured. The acceptance criteria correctly reflects the intended behavior (cleanup on success; conditional on failure). These are contradictory. A test author writing a failure-path test for the case where `retain_failed_worktrees` is absent/false cannot resolve which sentence is authoritative from the description alone.

Additionally, the default value of `retain_failed_worktrees` when the key is absent from configuration remains unspecified. This prevents writing a deterministic test for the default-unconfigured case.

**Required resolution before approval:**
1. Rewrite the description: "After each agent completes successfully, its worktree must be cleaned up. After a failed agent completes, its worktree must be cleaned up unless `retain_failed_worktrees` is set to `true` in the Ptah configuration."
2. State explicitly that `retain_failed_worktrees` defaults to `false` when absent, making cleanup the default behavior on failure.

---

### F-02 — MEDIUM (Carried from Round 3 BE-F-01): `isForkJoinPhase` suppression not explicitly required when `useTechLead === true`

**Affected requirements:** REQ-TL-01, REQ-NF-14-03

**Codebase context:** In `pdlc-dispatcher.ts`, `isForkJoinPhase` returns `true` when `config.discipline === "fullstack"` and the phase is `IMPLEMENTATION`, causing the dispatcher to split dispatch across `eng` and `fe` agents. REQ-NF-14-03 states that `FORK_JOIN_PHASES` classification "continues to apply when `useTechLead` is false," implying by contrast that it should NOT apply when `useTechLead === true`. However, this suppression is never stated explicitly.

A test author writing the integration test for a fullstack feature with `useTechLead: true` cannot write a deterministic assertion without this explicit statement: does the dispatcher issue one tech-lead dispatch, or does it simultaneously issue a fork-join pair alongside the tech-lead dispatch?

Without an explicit suppression requirement, a TSPEC author could plausibly leave `isForkJoinPhase` unchanged, producing a silent dual-dispatch bug for fullstack features that would not be caught until runtime.

**Required resolution before approval:** Add one explicit sentence to REQ-NF-14-03 (or REQ-TL-01): "When `useTechLead === true`, the `FORK_JOIN_PHASES` fork-join behavior for IMPLEMENTATION is suppressed regardless of `discipline`, and a single tech-lead dispatch is issued instead."

---

## New Finding (Round 4)

### F-03 — LOW: REQ-BD-05 does not specify the timeout for the test suite invocation itself

**Affected requirement:** REQ-BD-05 (Test validation gate between batches)

REQ-BD-05 specifies two distinct failure modes for test suite execution (assertion failure vs. invocation failure) and references `tech_lead_agent_timeout_ms` via REQ-BD-07 for agent-level timeouts. However, there is no specified timeout for the test suite run itself (`npx vitest run`). In pathological cases the test runner could hang (e.g., a test with a `while(true)` loop or a hung async fixture), blocking the batch pipeline indefinitely.

This is Low severity because the absence only affects edge-case infrastructure, not the core requirement behavior. A test author can still write all primary-path tests for REQ-BD-05. However, a TSPEC author would need to invent a timeout policy without REQ-level guidance.

**Resolution needed (Low — acceptable to defer to TSPEC):** The TSPEC should define a maximum wall-clock timeout for the test suite step. A REQ-level acknowledgment that a configurable test suite timeout is out of scope (or that it defaults to some value) would eliminate the ambiguity.

---

## Clarification Questions

### Q-01 (Carried from Round 2): Agent completion detection mechanism

Deferred to TSPEC (unchanged). The Agent tool's synchronous dispatch pattern is an implementation concern.

### Q-02 (Carried from Round 2): Progress reporting output target

Deferred to TSPEC (unchanged). "Coordination thread" resolves to the Discord coordination channel in the TSPEC.

---

## Positive Observations

All positive observations from Rounds 1–3 remain valid. Additional observations on v1.2:

- **The two-Medium blocking profile is narrow and well-contained.** Both F-01 (REQ-NF-14-02 text contradiction) and F-02 (REQ-NF-14-03 `isForkJoinPhase` suppression) require only single-sentence additions or rewrites. The overall REQ structure — particularly the coverage of fallback paths, retry semantics, and isolation guarantees — remains the strongest in the 014 document set.
- **The Round 3 reviews (TE and BE) are complementary with no contradictions.** TE-F-01 and BE-F-01 address independent issues in different requirements. Resolving both in a single revision pass is straightforward.
- **REQ-BD-07 "no partial merges" invariant** continues to be the highest-value testable property in the document. It maps directly to a `git diff` assertion against the pre-batch feature branch state. This property has survived three review rounds intact and is implementation-ready.
- **REQ-PD-06 + REQ-PD-05 defensive envelope** for DAG parsing continues to be complete and testable. Both cycle detection (PD-06) and malformed input (PD-05) produce the same observable behavior (sequential fallback + warning), making them easy to cover with a shared test fixture that varies only the input.

---

## Recommendation

**Needs revision.**

Two Medium findings (F-01 and F-02) remain open from Round 3 and are blocking. Both require only targeted, minimal edits to the v1.2 text. One new Low finding (F-03) is identified and recommended for deferral to TSPEC.

| Finding | Round | Severity | Status | Blocking? |
|---------|-------|----------|--------|-----------|
| F-01 (TE-F-01 carried) | 3→4 | MEDIUM | Open — REQ-NF-14-02 description/criteria contradiction; `retain_failed_worktrees` default unspecified | Yes |
| F-02 (BE-F-01 carried) | 3→4 | MEDIUM | Open — `isForkJoinPhase` not explicitly suppressed for `useTechLead === true` | Yes |
| F-03 (NEW) | 4 | LOW | Test suite invocation timeout unspecified (defer to TSPEC) | No |
| TE-F-02 (carried) | 3→4 | LOW | Plan file precondition failures unspecified | No (defer to TSPEC acceptable) |
| TE-F-03 (carried) | 3→4 | LOW | Sub-batch split order unspecified | No (defer to TSPEC) |
| TE-F-04 (carried) | 3→4 | LOW | REQ-TL-02 modification loop termination undocumented | No (defer to TSPEC) |
| BE-F-02 (carried) | 3→4 | LOW | `FeatureConfig` extension implied but not named | No (defer to TSPEC) |

**Required before re-approval:** F-01 and F-02 must be resolved in a v1.3 revision. All Low findings are acceptable to defer to TSPEC with explicit acknowledgment.
