# Cross-Review: Test Engineer → FSPEC-PTAH-PHASE6

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document Reviewed** | `docs/006-guardrails/006-FSPEC-ptah-guardrails.md` (FSPEC-PTAH-PHASE6 v1.0) |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved with minor changes** — one High finding must be resolved before handoff to engineering |

---

## Positive Observations

1. **All 6 requirements are traced.** Every REQ has a corresponding FSPEC, and every FSPEC section maps back to requirements in the traceability table (§6). No coverage gaps.

2. **Acceptance tests use consistent WHO/GIVEN/WHEN/THEN format.** AT-GR-01 through AT-GR-15 are all precisely specified. An engineer can write test doubles and assertions directly from these — no ambiguity about expected state.

3. **Business rules are numbered with rationale.** GR-R1 through GR-R21 provide both the rule and the "why." This is invaluable for determining whether a test failure represents a bug or a spec violation.

4. **Failure classification is testable.** The transient vs. unrecoverable taxonomy (§3.2 Step 2) is exhaustive and uses concrete, observable signals (HTTP status codes, exception types, merge-conflict flags from Phase 4). Test doubles can simulate each category precisely.

5. **Configuration defaults are explicit.** The §2.4 table documents all five config keys with their types and defaults. Tests can inject specific values without needing to parse `ptah.config.json`.

6. **GR-R6 (malformed signal → retry-once rule) is precisely scoped.** The two-strike rule is unambiguous, and AT-GR-05 covers it end-to-end. This avoids the common trap of under-specifying "transient-vs-permanent" for output parsing errors.

7. **Review-thread turn counting semantics are correct and self-consistent.** §4.4 behavioral flow (increment-after-routing, block when count >= 4) aligns exactly with AT-GR-08 and AT-GR-09.

8. **Shutdown edge cases are thorough.** §5.4 covers 6 edge cases including the `shutdownTimeoutMs = 0` destruction configuration — rare but important to document.

---

## Findings

### F-01 (High) — Contradictory semantics: general turn-limit behavioral flow vs. acceptance test AT-GR-06

**Location:** §4.3 Behavioral Flow (general turn limit) vs. AT-GR-06

**The problem:**

The behavioral flow in §4.3 checks the *current* turn count before incrementing:

```
2b. If turn_count >= maxTurnsPerThread → block
2c. If turn_count < maxTurnsPerThread → Increment turn_count by 1 → Proceed
```

With `maxTurnsPerThread = 10` and `turn_count = 9` (9 turns already processed), the 10th message arrives:
- Check: `9 >= 10` → **false** → increment to 10 → **route the 10th message**
- 11th message arrives: `10 >= 10` → **true** → block

The behavioral flow therefore allows **10 invocations** (turns 1–10 proceed; turn 11 is blocked).

AT-GR-06, however, says:

```
GIVEN: Thread has processed 9 turns
WHEN:  A 10th message arrives
THEN:  I check: turn_count (9) + 1 = 10 >= maxTurnsPerThread (10) — limit reached
       I do NOT invoke any Skill
```

The acceptance test uses a **peek-increment check** (`turn_count + 1 >= maxTurnsPerThread`), which blocks the 10th message — allowing only **9 invocations**.

AT-GR-07 compounds this: it says "an 11th message arrives" is silently dropped. If the 10th was already blocked (AT-GR-06), the "11th message" in AT-GR-07 would actually be the 10th user message received after the CLOSED embed — the numbering is inconsistent.

**Severity:** High — the behavioral ambiguity directly affects the turn-limit threshold. Implementation that follows the behavioral flow will allow one more turn than implementation that follows the acceptance test. This will cause test failures.

**Resolution needed (see Q-01):** The PM must confirm which semantics are authoritative.

- **Option A:** `maxTurnsPerThread = 10` means **10 invocations proceed** (turns 1–10), blocked on turn 11. Fix: update AT-GR-06 to "Thread has processed 10 turns, an 11th message arrives" and update AT-GR-07 to "a 12th message."
- **Option B:** `maxTurnsPerThread = 10` means the **10th message triggers the limit** (only 9 invocations). Fix: update §4.3 step 2b check to `turn_count + 1 >= maxTurnsPerThread` (or equivalently `turn_count >= maxTurnsPerThread - 1`).

---

### F-02 (Medium) — No acceptance test for "retry in backoff period at shutdown"

**Location:** §5.4 Edge Cases (second row) — "An invocation is retrying (FSPEC-GR-01) during shutdown"

**The problem:**

§5.4 specifies a non-trivial interaction: if a retry is *waiting in its backoff delay* when the shutdown signal arrives, the Orchestrator cancels the backoff wait and treats the current attempt's result as final (no new retries start). This is a distinct code path from "a retry is actively running."

No acceptance test covers this. The behavior requires testing a time-sensitive interaction between the shutdown flag and the retry backoff timer — without a test, the implementation is likely to either (a) let the backoff delay run out before shutting down, or (b) cancel the in-progress attempt rather than just the pending backoff.

**Suggested AT (for PM/engineering to validate):**

```
WHO:   As a developer
GIVEN: A Skill invocation failed and the Orchestrator is waiting 4 seconds
       before retry 2 (2 seconds have elapsed of the 4-second backoff)
WHEN:  I send SIGINT
THEN:  1. The shutdown flag is set immediately
       2. The 4-second backoff wait is cancelled (not waited out)
       3. No retry 2 is attempted
       4. The error embed IS posted (treat the failed attempt as final)
       5. The shutdown sequence continues normally (Steps 3–7)
```

**Severity:** Medium — the behavior is specified in prose but untested. The interaction with timer cancellation is easy to get wrong silently.

---

### F-03 (Low) — Partial-commit edge case (§3.4) deferred to TSPEC without testable criterion

**Location:** §3.4 Edge Cases (last row) — "Error occurs after a successful Phase 4 artifact commit but before the response embed is posted"

**The problem:**

The FSPEC acknowledges this edge case and flags it for the TSPEC with: *"The Orchestrator posts the error embed instead of a normal response embed, noting that artifacts may have been partially committed."* However, no acceptance test is specified, and the exact wording of the "partial commit" error embed body is not defined.

Without a testable criterion, the TSPEC engineer must invent both the detection logic (how does the Orchestrator know Phase 4 committed but the embed failed?) and the embed content. This is product-level scope that should be pinned in the FSPEC.

**Suggested addition:** Add a business rule (GR-RX) specifying the embed body text for this case and one acceptance test (AT-GR-16) covering the happy-path detection.

**Severity:** Low — the TSPEC can resolve this, but it creates a gap between product intent and engineering implementation.

---

## Clarification Questions

### Q-01 (Blocks F-01) — General turn-limit semantics: which is authoritative?

> With `maxTurnsPerThread = 10`:
> - **Option A:** 10 invocations proceed (turns 1–10 are routed; the 11th is blocked). The behavioral flow §4.3 supports this.
> - **Option B:** 9 invocations proceed (turn 10 triggers the limit and is blocked). AT-GR-06 supports this.
>
> Which is the intended product behavior? Please update either the behavioral flow §4.3 or AT-GR-06/AT-GR-07 to be consistent.

---

### Q-02 — Shutdown commit step (§5.3 GR-R17): which worktree paths are scanned?

> §5.2 Step 4a says "check for uncommitted changes in the main working directory and any active worktrees." However, the worktree paths are ephemeral (created per Skill invocation in FSPEC-AC-01). Does the Orchestrator maintain a registry of active worktree paths, or does it scan the filesystem (e.g., `git worktree list`)? The answer affects how this step is tested — the test double must either populate a worktree registry or mock `git worktree list` output.
>
> This is likely an engineering decision for the TSPEC, but if there's a product preference (e.g., the registry is the canonical source), it should be noted here to prevent scope creep in the TSPEC.

---

## Summary

| Finding | Severity | Action Required |
|---------|----------|-----------------|
| F-01: General turn-limit behavioral flow contradicts AT-GR-06/07 | **High** | PM must resolve Q-01 and update §4.3 or AT-GR-06/07 before handoff to engineering |
| F-02: No AT for retry-in-backoff-period at shutdown | Medium | PM to add AT-GR-16 per suggested template, or explicitly delegate to TSPEC |
| F-03: Partial-commit edge case has no testable criterion | Low | PM to add business rule + AT, or explicitly flag as TSPEC scope |
| Q-02: Shutdown commit worktree path enumeration | Low | Clarify mechanism to prevent TSPEC ambiguity |

**Recommendation: Approved with minor changes.**

F-01 must be resolved before this FSPEC is handed off to engineering — the contradictory turn-limit semantics will directly produce a test failure regardless of which interpretation the engineer chooses. F-02 and F-03 may be deferred to the TSPEC if the PM prefers, but should be explicitly marked as TSPEC scope (not left implicit).

All other aspects of the FSPEC are testable, precise, and complete. The acceptance test coverage is the strongest of any Phase 6 document reviewed to date.
