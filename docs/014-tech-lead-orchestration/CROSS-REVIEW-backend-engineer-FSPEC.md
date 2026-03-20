# Cross-Review: Backend Engineer — FSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 3 (re-review of v1.3) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All three Medium findings from round 2 (BE F-01–F-03, reviewing v1.2) are cleanly resolved in v1.3 — the pre-flight timing contradiction is gone, the re-run Phase modification type is properly enumerated in §2.4.2, and the merge conflict resume note now accurately describes behavior. One new Medium finding was discovered during this re-review. One new Low finding and one cosmetic note are also raised.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| F-01 (v1.2) — MEDIUM | "Re-run Phase" missing from §2.4.2 valid modification types | ✅ Resolved — type (d) added to §2.4.2 step 2; cross-reference to §2.8.3 is correct |
| F-02 (v1.2) — MEDIUM | Pre-flight timing contradiction between §2.4.1 (pre-approval) and §2.5.1 (post-approval) | ✅ Resolved — §2.5.1 now states pre-flight runs **before** the confirmation; §2.5.3 fallback flow updated; AT-TL-01-01, AT-TL-02-01, AT-TL-02-02 all consistent |
| F-03 (v1.2) — MEDIUM | §2.6.2 merge conflict resume misstated what phases are re-run | ✅ Resolved — note corrected (all batch phases re-run, not just aborted ones); developer guidance added; AT-BD-01-04 added and is accurate |

---

## New Findings

### F-01 — MEDIUM: Recognized-but-rejected dependency moves — not specified whether they count toward the 5-iteration modification limit

**Location:** §2.4.2 step 2(b) and §2.4.3

**Issue:** §2.4.3 terminates the modification loop after "5 cycles without an approve or cancel." §2.4.2 explicitly states that unrecognized inputs do NOT count toward this limit. However, §2.4.2 step 2(b) also has a short-circuit path for *recognized-but-rejected* requests (dependency-violating moves and same-batch moves): the tech lead "reject[s] the move with an explanation and re-prompt[s]." This re-prompt sends the user back to step 1 ("What would you like to change?") rather than step 4 ("Type approve / modify / cancel").

The 5-iteration counter is not defined in terms of a specific step in the loop. Two reasonable implementers would disagree on whether a rejected valid move consumes one cycle:

- **Interpretation A (reject doesn't count):** A "cycle" completes only when step 4 is reached (the user is given the approve/modify/cancel choice). A rejected move short-circuits at step 2, so step 4 is never reached, so no cycle is consumed. Under this interpretation, a user can make arbitrarily many rejected moves before hitting the limit — only successful plan modifications count.
- **Interpretation B (reject counts):** A "cycle" is any time the user issues a modification request, regardless of outcome. A rejected move is one attempt, so the counter advances. Under this interpretation, 5 rejected dependency violations locks the user out of the modification loop.

The spec explicitly addresses the analogous case for unrecognized inputs (exempted from the count) but is silent on recognized-but-rejected inputs. Since these two cases produce meaningfully different user-facing termination behaviors, an implementer cannot resolve this gap from the spec alone.

**Required fix:** Add a clarifying sentence to §2.4.3 (or to §2.4.2 step 2(b)) that states whether a recognized-but-rejected modification (dependency-violating move, same-batch move) counts toward the 5-iteration limit. For consistency with the unrecognized-input rule, the expected intent is that rejected moves do NOT count — but this must be stated explicitly.

---

### F-02 — LOW: §2.4.1 item 2 "only shown when parallel mode is active" is technically inconsistent with §2.5.3's instruction to show failed pre-flight results in the sequential fallback confirmation

**Location:** §2.4.1 item 2; §2.5.3 step 3

**Issue:** §2.4.1 item 2 states that the pre-flight status section (Pass/Fail for each infrastructure check) is "only shown when parallel mode is active." After a pre-flight failure, §2.5.3 recomputes the plan in sequential mode — but then instructs: "The §2.4.1 pre-flight status line in the confirmation shows the failed check result (Fail) so the developer understands why the mode has degraded."

At the time the §2.5.3 fallback confirmation is displayed, the plan is in sequential mode. Taken literally, §2.4.1 item 2 tells an implementer: "mode is sequential → do not show pre-flight status." Then §2.5.3 overrides: "show it anyway (to explain the fallback)." An implementer reading §2.4.1 before §2.5.3 may implement the suppression logic first, then need to undo it when reading the fallback spec.

The intent is clear from §2.5.3 — the pre-flight failure result is always shown when pre-flight ran and failed, regardless of the resulting mode. However, the §2.4.1 qualifier creates unnecessary confusion. This is editorial, not a functional gap: §2.5.3 is the more specific section and its instruction is unambiguous in context.

**Suggested fix (Low — non-blocking):** Amend §2.4.1 item 2's qualifier to: "only shown when parallel mode is active, or when pre-flight ran and failed (to explain mode degradation)."

---

### Cosmetic Note — Missing closing code fence in §2.4.2

**Location:** §2.4.2 Modification Loop code block

**Issue:** The behavioral flow in §2.4.2 is wrapped in a code fence (`` ``` ``) that opens before step 1. The code fence is not closed before the §2.4.3 section header. This is a Markdown formatting error — the rendered document will include §2.4.3 and subsequent content inside the code block, making it appear as literal monospace text rather than formatted prose. This does not affect the spec's meaning but may cause rendering issues in GitHub or documentation viewers.

**Suggested fix (Cosmetic — non-blocking):** Add `` ``` `` on the blank line between step 4's re-prompt and the `#### 2.4.3 Modification Loop Termination Rules` header.

---

## Positive Observations

- **All three Medium findings from round 2 are cleanly and precisely resolved.** The pre-flight timing correction (§2.5.1 + AT-TL-01-01 + AT-TL-02-01/02) is the most impactful fix — the ordering is now unambiguous and all acceptance tests are mutually consistent.
- **AT-BD-01-04 is an excellent addition.** The partial-merge resume scenario is now fully testable: it explicitly states that Phase D is re-implemented over already-present code. An implementer can write a regression test directly from this AT.
- **The modification type (d) addition is tight.** The cross-reference to §2.8.3 and the "not writing to the plan document" clarification are exactly what an implementer needs to distinguish the in-memory batch plan from the persisted plan document.
- **The unrecognized modification request error handler (§2.4.2) is a good addition from the test-engineer review.** The exhaustive error message listing all four valid types will help developers understand what's available without reading the full spec.
- **§2.8.3 downstream transitive closure warning is well-specified.** AT-BD-03-04 now covers a two-hop dependency (B → D → E) which makes the "full transitive closure" rule testable without ambiguity.
- **§2.6.1 sub-batch failure cascade is unambiguous.** "All remaining sub-batches N.(M+1) and beyond are immediately cancelled" is precise and AT-BD-02-04 covers it directly.

---

## Recommendation

**Needs revision.**

One new Medium finding must be resolved before TSPEC authoring begins:

- F-01 is a behavioral gap in the modification loop termination rule — an implementer must make a product decision about whether recognized-but-rejected modifications count toward the 5-cycle limit. This decision produces meaningfully different user-facing behaviors and belongs in the FSPEC.

The Low finding (F-02) and cosmetic note are non-blocking and can be addressed alongside F-01 or deferred to a documentation pass. All round 2 findings are fully resolved.

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 — Recognized-but-rejected moves: do they count toward the 5-iteration modification limit? | MEDIUM | ⬚ Open |
| F-02 — §2.4.1 item 2 "only shown when parallel mode" inconsistent with §2.5.3 pre-flight-fail display | LOW | ⬚ Open |
| Cosmetic — Missing closing code fence in §2.4.2 | COSMETIC | ⬚ Open |
