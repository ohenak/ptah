# Cross-Review: Product Manager → TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | 014-TSPEC-tech-lead-orchestration (Draft, 2026-03-20) |
| **Cross-Referenced Against** | 014-REQ-tech-lead-orchestration v1.4, 014-FSPEC-tech-lead-orchestration v1.6 |
| **Date** | 2026-03-20 |

---

## Findings

### F-01 — Internal contradiction on exit signals for failure scenarios (High)

**Location:** §6 Error Handling table vs §12 Tech-Lead SKILL.md Implementation Summary

**Issue:** The error handling table (§6) specifies `LGTM` as the exit signal for three critical failure scenarios:

| Scenario | §6 Exit Signal |
|----------|---------------|
| Phase agent failure | LGTM |
| Merge conflict | LGTM |
| Test gate — assertion failure | LGTM |

However, §12 explicitly states the opposite:

> "It emits `ROUTE_TO_USER` only if a blocking failure occurs that requires human decision (phase failure, merge conflict, test gate failure)"

These are contradictory. The resolution has direct product impact: in the current Ptah architecture, `LGTM` signals the orchestrator that the skill's work is complete and the PDLC state machine may advance to the next phase. If failures emit `LGTM`, the orchestrator could advance past IMPLEMENTATION without successful completion — the developer would not be prompted to fix and re-invoke. `ROUTE_TO_USER` keeps the PDLC in IMPLEMENTATION and surfaces the failure to the developer, which is the intended product behavior per REQ-BD-05, REQ-BD-07, and REQ-TL-04 (all require halt-and-report semantics).

**Recommendation:** Resolve the contradiction. The exit signals in §6 should align with §12 — use `ROUTE_TO_USER` (with the failure description in the `question` field) for phase failure, merge conflict, and test gate failure scenarios. Reserve `LGTM` for clean-exit outcomes (nothing to do, user cancel, timeout, successful completion).

---

### F-02 — OQ-01 blocking concern needs resolution path before implementation (Medium)

**Location:** §13 Open Questions, OQ-01

**Issue:** OQ-01 identifies that adding the "tl" agent to `ptah.config.json` will crash the config loader because `config/loader.ts` validates `mention_id` as a non-empty snowflake string (lines 140–150), and the tech-lead agent has no Discord role mention. The TSPEC correctly flags this as blocking, but the execution plan (PLAN) must include a task to resolve it before the "tl" agent can be registered.

From a product perspective, this is the gating dependency for the entire feature: without the "tl" agent in the config, REQ-TL-01 (invoke tech lead for implementation) cannot function. The TSPEC's proposed solution (adding `mentionable?: boolean` to `AgentEntry`) is sound — it correctly models the intent that some agents are internal orchestration agents, not user-mentionable Discord roles.

**Recommendation:** Ensure the PLAN includes an explicit task for OQ-01 resolution (add `mentionable` field to `AgentEntry`, update `loader.ts` validation) and that this task is scheduled before the `ptah.config.json` update task.

---

## Clarification Questions

### Q-01 — Test gate failure: runner failure exit signal

§6 specifies `LGTM` for "Test gate — runner failure" (Vitest fails to start). Assuming F-01 is resolved by adopting `ROUTE_TO_USER` for assertion failures, should runner failures also use `ROUTE_TO_USER`? A runner failure (compilation error, missing config) is equally blocking and requires developer intervention before implementation can proceed. The FSPEC treats both test failure modes identically (FSPEC-BD-01 §2.6.1 step 8: "halt" in both cases).

---

## Positive Observations

1. **Complete requirement coverage.** The §8 mapping table covers all 28 requirements from the REQ, and every requirement maps to a concrete technical component. No orphaned requirements.

2. **Clean architectural separation.** The decision to implement the core orchestration logic as a prompt-based SKILL.md with only minimal TypeScript changes (dispatcher routing, `mergeBranchIntoFeature`, config types) is well-aligned with the product intent: the tech lead is an orchestration layer, not a code-generation agent.

3. **Backward compatibility design.** The optional `useTechLead?: boolean` field on `FeatureConfig` with absent-means-false semantics preserves all existing behavior without migration — exactly what REQ-NF-14-03 requires.

4. **Pre-flight implementation is pragmatic.** Using `Grep` to check for `mergeBranchIntoFeature` in the source file is a lightweight, deterministic mechanism that satisfies the FSPEC-TL-02 "definitive pass/fail" requirement without over-engineering.

5. **Thorough test coverage for TypeScript changes.** The dispatcher routing and `mergeBranchIntoFeature` test cases cover all branches identified in the FSPEC, including the backward-compatibility path and edge cases (lock timeout, already-up-to-date).

6. **FSPEC behavioral flows faithfully translated.** The batch execution lifecycle (§5.5), failure handling (§5.7), merge conflict handling (§5.8), and plan status update (§5.9) algorithms all follow the FSPEC step-by-step without reinterpretation or narrowing.

---

## Recommendation

**Needs revision** — F-01 (High) must be resolved before implementation. The exit signal contradiction could cause the PDLC state machine to advance past IMPLEMENTATION on failure, breaking the halt-and-resume contract that REQ-BD-05, REQ-BD-07, and REQ-TL-04 depend on.

---

*End of Review*
