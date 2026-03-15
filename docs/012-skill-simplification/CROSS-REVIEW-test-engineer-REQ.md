# Cross-Review: Test Engineer Review of REQ-012

| Field | Detail |
|-------|--------|
| **Document** | [012-REQ-skill-simplification.md](012-REQ-skill-simplification.md) |
| **Reviewer** | Test Engineer (`qa`) |
| **Date** | March 15, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: REQ-NF-03 "no behavior change" is not testable as written (Medium)

REQ-NF-03 states: "A managed feature can progress through the full PDLC lifecycle after SKILL.md simplification with no workflow regressions." This is a valid product goal, but the acceptance criteria describe a manual integration test rather than a testable property.

Since this feature is documentation-only (C-01: "no code changes"), the existing Feature 011 integration tests (PROP-INT-08: full PDLC lifecycle) already verify workflow correctness. The SKILL.md content is consumed by the LLM at invocation time — changes to SKILL.md are not testable via automated unit or integration tests.

**Impact:** An engineer or QA reading this requirement might attempt to write an automated test for it, which is impossible for prompt-instruction changes.

**Recommendation:** Clarify that REQ-NF-03 is validated by: (1) running the existing Feature 011 test suite (which doesn't depend on SKILL.md content), and (2) manual end-to-end validation by running a feature through the orchestrator after the SKILL.md update. Add: "Validation method: manual — run a managed feature through 2-3 PDLC phase transitions after SKILL.md update and verify the orchestrator dispatches correctly."

---

### F-02: No requirement for documenting what `ROUTE_TO_AGENT` means under the new model (Medium)

REQ-RC-02 defines three routing signals: `LGTM`, `ROUTE_TO_USER`, `TASK_COMPLETE`. However, the parent FSPEC-AI-01 (REQ-AI-04) specifies that `ROUTE_TO_AGENT` is still honored for ad-hoc coordination with a logged warning. The response contract doesn't mention `ROUTE_TO_AGENT` at all.

If an agent encounters a scenario where it needs to ask another agent a question (ad-hoc coordination), the SKILL.md should either: (a) tell agents they can still use `ROUTE_TO_AGENT` for ad-hoc purposes, or (b) tell agents to use `ROUTE_TO_USER` instead and let the orchestrator handle it.

**Impact:** Agents may lose the ability to perform ad-hoc coordination if they don't know `ROUTE_TO_AGENT` is still available.

**Recommendation:** Add `ROUTE_TO_AGENT` to REQ-RC-02 as a fourth signal with guidance: "Use only for ad-hoc coordination (e.g., asking another agent a clarifying question). The orchestrator will log a warning and invoke the target agent for one turn without changing the PDLC phase. Do NOT use for PDLC workflow routing."

---

### F-03: REQ-DT-01 acceptance criteria "no content loss" is difficult to verify (Low)

REQ-DT-01 states all domain-specific sections must be "preserved without content loss." Since SKILL.md files are ~600-700 lines and the changes involve removing interleaved PDLC logic, verifying "no content loss" requires a careful diff review. There's no automated way to verify that domain content was preserved while workflow content was removed.

**Impact:** Low — this is inherent to documentation tasks. The per-skill change summary (Section 8) helps by listing what to remove vs. preserve.

**Recommendation:** No change needed, but consider adding a verification checklist per skill file (e.g., "After editing backend-engineer/SKILL.md, verify these sections remain: TDD Principles, DI Principles, Quality Checklist, ..."). Section 8 already approximates this — it could be promoted to an explicit verification aid.

---

### F-04: Section 8 per-skill summary for test-engineer lists "Tasks 1/2/3/4" to preserve but Task 3 is also listed for removal (Low)

Section 8 says test-engineer should preserve "Tasks 1/2/3/4 (domain content only)" but also lists "Task 3 (Route if applicable)" under "Sections to Remove." For the test engineer, the current Task 3 is "Route Documents for Review and Approval" and Task 4 is "Review Other Agents' Documents." The tasks to preserve should be listed by domain function name rather than task number, since the numbers will change after the routing task is removed.

**Impact:** Low — the "(domain content only)" qualifier disambiguates, but using task numbers that overlap with the removal list is confusing.

**Recommendation:** In Section 8, list preserved tasks by domain function name rather than task number. For test-engineer: "Create Properties, Ensure Coverage, Review Other Documents" rather than "Tasks 1/2/3/4."

---

## Clarification Questions

### Q-01: Should REQ-RT-02 remove the routing tag format entirely, or leave a minimal example for the response contract?

REQ-RT-02 says "no `<routing>` tag examples for workflow routing remain." But the response contract (REQ-RC-01/RC-02) will presumably include a minimal `<routing>` tag example showing how to signal LGTM:

```
<routing>{"type":"LGTM"}</routing>
```

Should REQ-RT-02 be scoped to "no PDLC workflow routing examples" while allowing response contract signal examples? Or do signals use a different mechanism entirely?

---

## Positive Observations

- **P-01:** The parent requirement traceability is excellent. Every requirement in REQ-012 traces back to a specific REQ-SA-XX from Feature 011, making it trivial to verify completeness. All 6 parent requirements (SA-01 through SA-06) are covered.

- **P-02:** The per-skill change summary (Section 8) is an effective verification aid. Listing "Remove / Preserve / Add" per skill file gives the implementer and reviewer a concrete checklist.

- **P-03:** Constraint C-02 (cross-review file format must be preserved) and the corresponding REQ-CR-01/CR-02 correctly protect the orchestrator's approval detection parser. This is the most critical integration boundary — if the format drifts, the PDLC state machine breaks.

- **P-04:** The risk analysis (Section 6) correctly identifies that unmanaged features (R-01) are handled by the orchestrator's backward compatibility, not by SKILL.md content. This means the SKILL.md simplification doesn't affect unmanaged feature routing.

- **P-05:** The scope boundaries (Section 7) correctly exclude "Testing the SKILL.md changes" as out of scope, with the rationale "these are prompt instructions — validation is manual." This aligns with the nature of the deliverable.

- **P-06:** REQ-NF-01 (simultaneous update of all four files in a single commit) is a practical safeguard against the partial-update inconsistency risk. This constraint is testable at the git level.

---

## Summary

This is a well-structured REQ that cleanly decomposes the 6 parent requirements (REQ-SA-01 through REQ-SA-06) into 15 actionable requirements across 6 domains. The traceability to the parent feature is complete and the per-skill change summary provides a practical verification aid.

The main testability concerns are:

1. **REQ-NF-03 validation method** (F-01) — should specify manual validation since SKILL.md changes can't be automatically tested
2. **Missing `ROUTE_TO_AGENT` in response contract** (F-02) — agents may lose ad-hoc coordination ability

F-03 and F-04 are minor documentation improvements.

**Recommendation: Approved with minor changes** — address F-01 (validation method for NF-03) and F-02 (`ROUTE_TO_AGENT` in response contract), then proceed.
