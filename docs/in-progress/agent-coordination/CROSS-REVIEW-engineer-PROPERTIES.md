# Cross-Review: Engineer → PROPERTIES-agent-coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document Reviewed** | [PROPERTIES-agent-coordination](PROPERTIES-agent-coordination.md) v1.0 |
| **Date** | April 6, 2026 |
| **Recommendation** | **Needs revision** (1 Medium finding) |

---

## Findings

### F-01: PROP-NEG-03 contradicts FSPEC-MR-01 BR-04 (implicit workflow check via signal attempt) — **Medium**

PROP-NEG-03 states:
> `handleMessage` must NOT attempt to signal Temporal when no active workflow exists (no signal sent)

This contradicts the specified behavior. FSPEC-MR-01 BR-04 explicitly states:

> The workflow existence check in step 7 is performed **implicitly** via the signal delivery attempt, not as a separate query. If the signal delivery fails with a "workflow not found" error, the orchestrator treats this as the inactive case.

The orchestrator **does** call `signalAdHocRevision()` — the method throws `WorkflowNotFoundError`, which is caught. The correct behavior is already captured by:
- **PROP-MR-27** — `handleMessage` must post error reply when `signalAdHocRevision` throws `WorkflowNotFoundError`
- **PROP-MR-30** — `signalAdHocRevision` must throw `WorkflowNotFoundError` when the target workflow does not exist

If an engineer writes a test asserting "signal method is NOT called" for the no-workflow case, the test would be **incorrect** — the method IS called; it just throws. This could lead to a wrong implementation (e.g., a pre-check query to Temporal, which FSPEC BR-04 explicitly avoids to prevent race conditions).

**Recommended fix:** Reword PROP-NEG-03 to:
> `handleMessage` must NOT deliver a successful ad-hoc signal when no active workflow exists — signal attempt must result in error reply, not silent success

Or remove PROP-NEG-03 entirely, since PROP-MR-27 and PROP-MR-30 already fully cover the expected behavior for the no-workflow case.

### F-02: PROP-WB-19 uses wrong domain prefix — **Low**

PROP-WB-19 ("Same-agent queued twice must process both sequentially") is about ad-hoc queue behavior from FSPEC-MR-02 and REQ-MR-06. It should use the `MR` domain prefix, not `WB`. It's currently in the Idempotency section, which is reasonable (it tests that the queue does NOT deduplicate), but the ID should be `PROP-MR-XX`.

### F-03: PROP-MR-31 and PROP-MR-43 overlap — **Low**

Both properties describe the same observable behavior (logging a warning when the revised agent is not found in workflow phases):
- PROP-MR-31 (Error Handling): "must skip cascade **and** log a warning"
- PROP-MR-43 (Observability): "must log a warning"

PROP-MR-43 is a strict subset of PROP-MR-31. Consider merging them into PROP-MR-31 (which is the more complete statement) and removing PROP-MR-43, or keeping both but noting the intentional overlap — one tests the error path (skip cascade), the other tests the observability guarantee (log output).

---

## Clarification Questions

_None — the document is clear and well-structured._

---

## Positive Observations

1. **Excellent requirement traceability.** Every property links to a specific REQ, FSPEC section, or TSPEC section. The coverage matrix in §5 shows 14/15 requirements fully covered, with REQ-NF-02 correctly identified as documentation-only.

2. **Strong negative property section.** The 12 negative properties (§4) capture critical "must NOT" invariants — especially PROP-NEG-06 (cascade-blocking), PROP-NEG-10 (state preservation during cascade), and PROP-NEG-12 (no short-circuit to original ad-hoc agent). These will catch subtle bugs.

3. **Test pyramid is sound.** 90.8% unit / 9.2% integration / 0% E2E is the right distribution. The justification for zero E2E tests is correct — pure helpers for queue and cascade logic eliminate the need for a live Temporal server.

4. **Gap analysis is actionable.** All 5 identified gaps have concrete recommendations mapped to specific plan tasks. Gaps #2 (CAN queue preservation) and #3 (signal during ROUTE_TO_USER) are the highest-risk items and correctly flagged as Medium.

5. **Contract properties align with TSPEC types.** PROP-MR-22 through PROP-MR-25 mirror the exact type definitions from TSPEC §4.3, ensuring type conformance is explicitly tested.

6. **Codebase-aligned.** The properties reference the correct existing functions (`invokeSkill`, `commitAndMerge` → `commitAndPush`, `dispatchSingleAgent`) and patterns (protocol-based fakes, `FakeGitClient`, `FakeTemporalClient`). The existing `FakeAgentRegistry.getAgentById()` pattern is compatible with PROP-MR-26 (unknown agent error).

---

## Recommendation

**Needs revision** — F-01 is Medium severity. PROP-NEG-03 as currently written would lead engineers to test the wrong behavior (asserting signal method is NOT called, when the spec says it IS called and the error is caught). The other two findings are Low and non-blocking.

The author must address F-01 and route the updated document back for re-review.

---

*End of Review*
