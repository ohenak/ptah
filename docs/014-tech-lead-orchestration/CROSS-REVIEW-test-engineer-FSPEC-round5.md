# Cross-Review: Test Engineer — FSPEC (Round 5)

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.5](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 5 (re-review of v1.5) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

All three findings from the Round 4 TE review are resolved cleanly in v1.5. The blocking Medium finding (F-01, git-infeasible `feat-{feature-name}/phase-{X}` branch naming) is correctly resolved by removing the naming format from the FSPEC entirely and delegating it to the TSPEC — the preferred Option 1 from the Round 4 recommendation. Both Low findings are also resolved: AT-PD-01-07 (Form 1 linear chain) and AT-PD-01-08 (Form 3 natural language) cover the previously untested dependency syntax paths, and AT-BD-01-05 along with the §2.6.1 step 8 developer guidance note close the test gate failure resume gap.

Three new Low findings are raised in this round. None block TSPEC authoring. Two are minor editorial inconsistencies (re-prompt example omits `re-run`; step 8 halt message uses "resume from Batch {N}" phrasing that could imply an explicit batch number is required when auto-detection handles it). One identifies a latent ambiguity in §2.7.1/§2.7.2 — listing timeout as a failure condition while simultaneously stating there is no mechanism to kill running agents — that could cause confusion for a TSPEC author specifying the timeout mechanism.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (Round 4) — MEDIUM | §2.6.1 step 2b prescribes `feat-{feature-name}/phase-{X}-{timestamp}` — git-infeasible branch naming that conflicts with the existing `feat-{feature-name}` branch ref, blocking all 9 batch lifecycle ATs | ✅ Resolved — naming format removed from FSPEC; §2.6.1 step 2b now reads "The TSPEC must define a worktree branch naming convention that avoids conflicts with the persistent feature branch name (feat-{feature-name}). The specific format is a TSPEC concern." |
| F-02 (Round 4) — LOW | Form 1 (linear chain) and Form 3 (natural language) dependency syntax forms have no dedicated acceptance tests | ✅ Resolved — AT-PD-01-07 (Form 1: `A → B → C → D` produces edges A→B, B→C, C→D and batches [A], [B], [C], [D]) and AT-PD-01-08 (Form 3: multi-dependency case producing shared in-edges) added to §2.1.6 |
| F-03 (Round 4) — LOW | Test gate failure resume has no AT analogous to AT-BD-01-04; §2.6.1 step 8 missing developer guidance | ✅ Resolved — Developer guidance note added to §2.6.1 step 8 advising that all batch phases will be re-implemented on resume (including previously merged phases); AT-BD-01-05 added, at full parity with AT-BD-01-04 |

---

## New Findings

### F-01 — LOW: §2.4.2 step 1 re-prompt omits "re-run a phase" from examples, reducing discoverability of modification type (d)

**Location:** FSPEC-TL-01 §2.4.2 step 1

**Issue:** The re-prompt in step 1 reads:

> "What would you like to change? (e.g., 'change Phase D to frontend-engineer', 'move Phase E to Batch 2', 'split Batch 3')"

This lists three examples that cover modification types (a), (b), and (c), but omits modification type (d) — "re-run a phase." The unrecognized-request error message in step 2 does correctly enumerate all four types: "Valid modifications are: change skill assignment, move a phase, split a batch, re-run a phase." However, a developer who has never encountered an unrecognized-request error will never see this enumeration, and the step 1 re-prompt is the only guidance they receive during normal modification flow.

The `re-run` capability is meaningfully different from the other three types (it operates on Done-status rather than batch structure) and is the correct mechanism for addressing stale Done markers. A developer who does not know it exists may instead manually edit the plan document to remove Done markers — a clumsier path.

**Testability impact:** None — this is a UX discoverability issue, not a testability gap. AT-BD-03-03 and AT-BD-03-04 are adequate for the re-run behavior itself.

**Suggested fix (Low — non-blocking):** Extend the step 1 re-prompt example to include `re-run`:

> "What would you like to change? (e.g., 'change Phase D to frontend-engineer', 'move Phase E to Batch 2', 'split Batch 3', 're-run Phase B')"

---

### F-02 — LOW: §2.7.1 and §2.7.2 step 2 present contradictory statements about timeout enforcement that could confuse TSPEC authors

**Location:** FSPEC-BD-02 §2.7.1; §2.7.2 step 2

**Issue:** §2.7.1 lists timeout as an explicit failure condition:

> "Times out without completing (timeout threshold is a TSPEC concern)."

§2.7.2 step 2 states immediately after failure detection:

> "There is no mechanism to forcibly kill a running agent subagent — this is by design."

These two statements are in tension. If there is no mechanism to kill agents, it is unclear how a timeout failure condition can be enforced. A TSPEC author tasked with specifying the timeout mechanism will encounter this contradiction and face two interpretive paths:

1. **Agent tool path:** The timeout is enforced transparently by the Agent tool infrastructure (the `timeout_ms` parameter on Agent invocations as noted in REQ-BD-07 via `tech_lead_agent_timeout_ms`). The tech lead never kills anything; the tool infrastructure handles termination and returns a failure result. The "no kill mechanism" statement is accurate from the tech lead's perspective.

2. **Detection-only path:** The tech lead polls for completion and marks an agent as timed out after N minutes without merging the worktree. The agent subprocess continues but its result is ignored.

REQ-BD-07 provides partial guidance ("timeout configured via `tech_lead_agent_timeout_ms` in the Ptah configuration, defaulting to 600,000 ms"), which leans toward interpretation 1. However, the FSPEC does not echo this mechanism, leaving the TSPEC author without an authoritative behavioral description.

**Testability impact:** The TSPEC author needs to write integration tests for the timeout failure path (a property test asserting that an agent exceeding N ms is classified as FAILURE). Without clarity on the enforcement mechanism, the test setup is ambiguous: should the test mock the Agent tool's timeout response, or simulate a slow agent and wait for a polling threshold to expire?

**Suggested fix (Low — non-blocking):** Add a clarifying sentence to §2.7.1 after the timeout failure bullet, consistent with REQ-BD-07:

> "The timeout threshold is configured via `tech_lead_agent_timeout_ms` in the Ptah configuration (default: 600,000 ms) and is enforced by the Agent tool infrastructure — the tech lead receives a failure result when the agent exceeds this threshold. No active kill mechanism is required from the tech lead side."

---

### F-03 — LOW: §2.6.1 step 8 halt message "resume from Batch {N}" may mislead developers into thinking explicit batch-number specification is required

**Location:** FSPEC-BD-01 §2.6.1 step 8

**Issue:** The test gate failure halt message prescribes:

> "Test gate failed after Batch {N}. {K} test(s) failing: {test names/summary}. Resolve failures and resume from Batch {N}."

The phrase "resume from Batch {N}" implies the developer must take an explicit action tied to batch number N. However, FSPEC-BD-03 §2.8.1 specifies that the tech lead **automatically detects the resume point** from Done-status — no batch number is required. A developer who re-invokes the tech lead without specifying anything will automatically resume at the correct batch.

This is an inconsistency between the user-visible halt message (which implies explicit batch-number selection) and the actual resume UX (which is automatic). Developers unfamiliar with FSPEC-BD-03 may search for a `--resume-from-batch` flag or a re-invocation syntax that doesn't exist.

The parallel message in §2.6.2 (merge conflict halt) has the same pattern: "resume from Batch {N}" — so the fix applies in both locations.

AT-BD-01-05 does not reproduce this potential confusion — it specifies "The developer fixes the failing test and re-invokes the tech lead" without specifying a batch number, which correctly models the auto-detection path.

**Testability impact:** None directly, but the discrepancy between the halt message and AT behavior is worth flagging as an inconsistency that could surface as a documentation bug.

**Suggested fix (Low — non-blocking):** Revise the step 8 halt message to reflect the auto-detection UX:

> "Test gate failed after Batch {N}. {K} test(s) failing: {test names/summary}. Resolve the test failures and re-invoke the tech lead — execution will automatically resume from Batch {N}."

Apply the same phrasing fix to §2.6.2 step 3 merge conflict message:

> "Merge conflict detected when merging Phase {X} results. Conflicting files: {file1}, {file2}. Resolve the conflict and re-invoke the tech lead — execution will automatically resume from Batch {N}."

---

## Positive Observations

- **F-01 resolution (§2.6.1 step 2b) is the cleanest possible fix.** Removing the naming format entirely and delegating to TSPEC is exactly the right scope boundary decision. The FSPEC's stated exclusion of "technical implementation choices" is now consistently applied. TSPEC authors have full freedom to specify a feasible naming convention (e.g., `wt-{feature-name}-phase-{X}-{ts}`) without being constrained by an infeasible FSPEC directive.
- **AT-PD-01-07 and AT-PD-01-08 are well-constructed.** AT-PD-01-07 correctly asserts that `A → B → C → D` produces **three edges** (not one), which is the critical correctness property for Form 1. AT-PD-01-08 correctly tests that Form 3 multi-dependency produces two in-edges to Phase C, and the THEN clause asserts the resulting batch structure — not just the edge list — which makes it a complete acceptance test.
- **AT-BD-01-05 is at full parity with AT-BD-01-04.** The GIVEN/WHEN/THEN structure mirrors AT-BD-01-04 (merge conflict resume) exactly, with the test gate substituted as the failure point. The "Phase D is re-implemented over code already present" assertion is present in both, making the re-implementation behavior consistently asserted for both failure paths. A TSPEC author writing integration tests for resume scenarios has both failure modes covered symmetrically.
- **§2.6.1 step 8 developer guidance note is well-calibrated.** The note correctly describes the observable behavior ("including phases whose worktree merges succeeded before the test gate ran") and provides actionable developer guidance ("manually mark already-correct phases as Done in the plan document before re-invoking if re-implementation of those phases would produce duplicate or conflicting changes"). This is exactly the level of practical guidance that prevents data loss.
- **The overall FSPEC v1.5 is TSPEC-ready modulo the three Low findings above.** All FPSECs are fully covered by acceptance tests at appropriate granularity. Traceability to requirements in §4 is complete. The requirement coverage in §4 is well-justified, particularly the no-FSPEC explanations for REQ-TL-01, REQ-TL-03, REQ-PR-04, and REQ-NF-14-03/04.

---

## Recommendation

**Approved with minor changes.**

All findings from Rounds 1–4 are resolved. No High or Medium findings are present in v1.5. Three Low findings are raised, all of which are editorial inconsistencies or minor UX clarifications — none block TSPEC authoring or affect the testability of any acceptance test.

| Finding | Severity | Status | Blocks TSPEC? |
|---------|----------|--------|---------------|
| F-01 — §2.4.2 step 1 re-prompt omits "re-run" from examples | LOW | ⬚ Open | No |
| F-02 — §2.7.1 timeout as failure condition vs. §2.7.2 "no kill mechanism" contradiction | LOW | ⬚ Open | No |
| F-03 — §2.6.1 step 8 "resume from Batch {N}" phrasing implies explicit batch-number required; contradicts FSPEC-BD-03 auto-detection | LOW | ⬚ Open | No |

The PM may address F-01–F-03 in the same editorial pass or carry them forward to TSPEC review notes. The TSPEC author should be aware of F-02 when specifying the timeout mechanism — reading REQ-BD-07 (`tech_lead_agent_timeout_ms`) alongside §2.7.1 resolves the ambiguity.
