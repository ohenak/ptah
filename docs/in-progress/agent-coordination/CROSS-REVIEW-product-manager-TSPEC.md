# Cross-Review: Product Manager — TSPEC Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document** | [TSPEC-agent-coordination.md](TSPEC-agent-coordination.md) |
| **Version Reviewed** | 1.0 |
| **Date** | April 6, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Positive Observations

- **Complete requirement coverage.** All 15 requirements (WB-01..05, MR-01..08, NF-01..02) are mapped to technical components in Section 9. No orphaned or missing requirements.
- **FSPEC behavioral flows faithfully translated.** The message intake pipeline (Section 6.1) mirrors FSPEC-MR-01 steps 1–9. The queue management (Section 6.2) correctly implements FSPEC-MR-02's FIFO + cascade-blocking rule. The cascade (Section 6.3) uses the positional creation-phase convention as specified in FSPEC-MR-03 BR-03/BR-08.
- **Deterministic workflow ID** (`ptah-{featureSlug}`) directly implements REQ-MR-08. The TSPEC correctly identifies that Temporal's duplicate-ID rejection enforces the single-workflow-per-feature assumption.
- **Minimal blast radius for fork-join.** The decision to keep fork-join phases on per-agent branches (Open Question #3) is a sound engineering decision that does not change product behavior — fork-join phases are out of scope for this feature.
- **Error handling table covers all FSPEC error scenarios.** Every error path from FSPEC-MR-01 and FSPEC-MR-03 has a corresponding entry in Section 7.
- **No product decisions made.** The TSPEC stays within its technical design scope. Agent ID resolution (FSPEC-MR-01 step 4) correctly defers display_name matching to this TSPEC's design space per our agreement, and the design uses `agentRegistry.getAgentById()` which is a reasonable default.

---

## Findings

### F-01 — Low: drainAdHocQueue does not pass the ad-hoc instruction text to the dispatched agent

**TSPEC:** Section 6.2

The `drainAdHocQueue()` function dispatches the agent via `dispatchSingleAgent()` with `isRevision: true`, but the `signal.instruction` text (e.g., "address feedback from CROSS-REVIEW-engineer-REQ.md") is not visible in the dispatch parameters. The `SkillActivityInput` interface (from `temporal/types.ts`) does not currently have a field for ad-hoc instruction text.

From the product perspective, the instruction is the user's intent — without it, the agent would re-run with no specific task directive (equivalent to the "empty instruction" edge case from FSPEC-MR-01). This would work but would not fulfill US-04's intent: the user expects the agent to act on a specific instruction.

This is Low severity because the existing `ContextAssembler` could thread the instruction through as part of the context document assembly or as a custom task override — but the TSPEC should document how the instruction reaches the agent. The engineer can resolve this in the PLAN.

---

## Clarification Questions

None — all design decisions are consistent with the product specifications.

---

## Recommendation

**Approved with minor changes.** One Low-severity finding (F-01) noted: the ad-hoc instruction text needs a pathway to reach the dispatched agent. This does not block TSPEC approval — it can be resolved during PLAN/implementation.
