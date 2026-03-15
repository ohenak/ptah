# Cross-Review: Backend Engineer Review of REQ-012

| Field | Detail |
|-------|--------|
| **Document** | [012-REQ-skill-simplification.md](012-REQ-skill-simplification.md) |
| **Reviewer** | Backend Engineer (`eng`) |
| **Date** | March 15, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: REQ-RT-02 must NOT remove `<routing>` tag syntax from SKILL.md — agents still need it (High)

REQ-RT-02 says: "routing tag JSON examples... are removed." However, the orchestrator's `DefaultRoutingEngine.parseSignal()` in `router.ts` (line 29) uses `/<routing>([\s\S]*?)<\/routing>/g` to extract routing signals from the agent's response text. Agents must still emit `<routing>{"type":"LGTM"}</routing>` in their response for the orchestrator to detect task completion.

What should be removed is the **PDLC workflow routing** — instructions about which agent to route to next (e.g., "route to eng for TSPEC creation", "route to qa for review"). But the **signal mechanism itself** (`<routing>{"type":"LGTM"}</routing>`, `<routing>{"type":"ROUTE_TO_USER","question":"..."}</routing>`) must be preserved because the orchestrator parses it.

**Impact:** If `<routing>` tag syntax is removed from SKILL.md, agents will stop emitting routing signals. The orchestrator will throw `RoutingParseError("missing routing signal")` for every agent invocation, breaking the entire system.

**Recommendation:** Rewrite REQ-RT-02 to distinguish between:
- **Remove:** PDLC workflow routing instructions (which agent to route to, routing lookup tables, `ROUTE_TO_AGENT` with specific agent_ids for workflow)
- **Preserve:** Signal emission syntax — agents must still include a `<routing>` tag with `LGTM`, `ROUTE_TO_USER`, or `TASK_COMPLETE` type in their response. This is part of the response contract (REQ-RC-01/02) and should be documented there.

---

### F-02: Response contract (REQ-RC-02) should include `<routing>` tag format examples (Medium)

REQ-RC-02 defines the three routing signals (LGTM, ROUTE_TO_USER, TASK_COMPLETE) but doesn't specify the exact format agents must use to emit them. The orchestrator expects:

```
<routing>{"type":"LGTM"}</routing>
<routing>{"type":"ROUTE_TO_USER","question":"What should X do?"}</routing>
<routing>{"type":"TASK_COMPLETE"}</routing>
```

Without these examples in the response contract, agents won't know how to format the signal.

**Impact:** Medium — agents familiar with the old SKILL.md will still emit correct signals from memory, but new or confused agents may not.

**Recommendation:** Add explicit `<routing>` tag format examples to REQ-RC-02's acceptance criteria. The response contract becomes the single source of truth for signal format.

---

### F-03: R-01 mitigation is technically incorrect (Low)

R-01 states: "The old routing logic in SKILL.md was never executed by the orchestrator — it only existed in the agent's prompt." This is misleading. The old routing logic WAS executed by agents — agents emitted `<routing>{"type":"ROUTE_TO_AGENT","agent_id":"eng"}</routing>` tags based on SKILL.md instructions, and the orchestrator's `parseSignal()` + `decide()` chain processed them. The routing logic in SKILL.md directly influenced orchestrator behavior.

What's correct is that **for managed features** (Feature 011), the orchestrator now overrides ROUTE_TO_AGENT signals and uses the PDLC state machine instead. For **unmanaged features**, the old routing path through `RoutingEngine.decide()` still processes ROUTE_TO_AGENT signals — but these come from the agent's own decision-making based on SKILL.md, and the orchestrator doesn't need the SKILL.md to contain the routing logic for this to work.

**Impact:** Low — the risk assessment conclusion is still correct (unmanaged features continue working), but the reasoning is wrong.

**Recommendation:** Rewrite R-01 mitigation to: "For unmanaged features, the orchestrator processes whatever routing signal the agent emits via `RoutingEngine.decide()`. The agent may emit ROUTE_TO_AGENT from cached knowledge, but the orchestrator's behavior does not depend on the SKILL.md containing routing instructions — it depends on the signal in the response."

---

## Clarification Questions

### Q-01: Should ROUTE_TO_AGENT be removed from agents' vocabulary entirely?

Currently agents can emit `ROUTE_TO_AGENT` for ad-hoc coordination (e.g., asking another agent a quick question). Feature 011's FSPEC-AI-01 step 4 says this is treated as a side-channel with a warning logged. Should SKILL.md still mention ROUTE_TO_AGENT as an option, or should it be omitted (simplifying the agent's decision space to just LGTM/ROUTE_TO_USER/TASK_COMPLETE)?

---

## Positive Observations

- **P-01:** The per-skill change summary (Section 8) is excellent — it provides a clear, actionable checklist for each SKILL.md showing exactly what to remove, preserve, and add. This makes implementation straightforward.

- **P-02:** C-01 correctly identifies this as a text-only change with no code impact. Since the orchestrator code is unchanged, there's no regression risk to the test suite.

- **P-03:** The distinction between removing workflow logic and preserving domain content (REQ-DT-01) is the right boundary. Domain expertise (TDD, DI patterns, review scope, quality checklists) is valuable context that should stay in SKILL.md.

- **P-04:** REQ-DT-03 correctly preserves the PM's Phase 0 bootstrap — this is a domain task, not PDLC workflow.

- **P-05:** REQ-NF-01 (simultaneous update) correctly identifies the atomicity constraint. Partial updates would be worse than no update.

---

## Summary

This is a well-structured REQ that correctly identifies what to remove and what to preserve. The main technical concern is **F-01** — the `<routing>` tag syntax must be preserved because the orchestrator's signal parser depends on it. REQ-RT-02 currently says to remove routing tag examples, but this would break signal emission.

The fix is to move the signal format documentation from the routing section into the response contract (REQ-RC-01/RC-02), making the response contract the single source of truth for how agents communicate completion.

**Recommendation: Approved with minor changes** — address F-01 (preserve `<routing>` tag syntax) and F-02 (add signal format examples to response contract).
