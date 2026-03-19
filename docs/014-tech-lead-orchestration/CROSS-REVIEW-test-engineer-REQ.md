# Cross-Review: Test Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 2 (re-review of v1.1) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Approved with minor changes** |

---

## Re-Review Summary

This is a re-review of v1.1, which was revised in response to the Round 1 findings from both this reviewer and the backend engineer. All High and Medium findings from Round 1 have been resolved. One Low finding remains (requirements count discrepancy). Clarification questions Q-02 and Q-03 from Round 1 are deferred to TSPEC as implementation-level concerns.

---

## Prior Findings — Resolution Status

| Finding | Severity | Description | Status |
|---------|----------|-------------|--------|
| TE-F-01 | HIGH | Cycle detection missing | ✅ Resolved — REQ-PD-06 added with precise cycle reporting and sequential fallback |
| TE-F-02 | HIGH | Batch formula imprecise ("maximum parallelism") | ✅ Resolved — REQ-PD-02 now states exact formula: `N = (longest path length from any root) + 1`; root phases → Batch 1 |
| TE-F-03 | MEDIUM | Mixed-path phases had undefined skill assignment | ✅ Resolved — REQ-PD-03 now specifies backend-engineer default with warning and user override via REQ-TL-02 |
| TE-F-04 | MEDIUM | REQ-TL-02 modification path was untestable | ✅ Resolved — allowed modifications narrowed to skill assignment change and batch grouping override; dependency violation handling specified; reject path emits `ROUTE_TO_USER` |
| TE-F-05 | MEDIUM | Sub-batch test gate semantics undefined | ✅ Resolved — REQ-NF-14-01 specifies test gate fires once per topological batch (after all sub-batches in that layer are merged), not between sub-batches |
| TE-F-06 | LOW | All-phases-done edge case unhandled | ✅ Resolved — REQ-PD-04 now specifies "nothing to do" notification and clean exit |
| TE-F-07 | LOW | Agent timeout threshold and test failure classification unspecified | ✅ Resolved — REQ-BD-07 references `tech_lead_agent_timeout_ms` with 600,000 ms default; REQ-BD-05 now distinguishes test invocation failure from test assertion failure |
| BE-F-01 | HIGH | Plan template format couldn't express fan-out | ✅ Resolved — REQ-NF-14-04 now specifies fan-out syntax support (`A → [B, C]`) and template update as in-scope deliverable |
| BE-F-02 | HIGH | Partial-batch failure merge semantics undefined | ✅ Resolved — REQ-BD-07 now says no worktree branches are merged (neither failed nor successful sibling phases) when any phase in a batch fails |
| BE-F-03 | HIGH | Worktree mechanism unspecified for SKILL.md agent | ✅ Resolved — A-03, C-03, and REQ-BD-03 now specify the Agent tool's `isolation: "worktree"` parameter as the sole mechanism; no direct TypeScript API calls required |
| BE-F-04 | MEDIUM | pdlc-dispatcher integration path unspecified | ✅ Resolved — REQ-TL-01 now specifies `useTechLead: true` in `FeatureConfig` as the routing condition; REQ-NF-14-03 specifies backward-compatible fallback |

---

## New Findings

### F-01 — LOW: Requirements summary count is off-by-one

**Affected section:** Section 8 — Requirements Summary

The P0 row in the priority table states a count of **18** but lists **17 requirement IDs**:

> REQ-PD-01, REQ-PD-02, REQ-PD-03, REQ-PD-04, REQ-PD-06, REQ-BD-01, REQ-BD-02, REQ-BD-03, REQ-BD-04, REQ-BD-05, REQ-BD-07, REQ-TL-01, REQ-TL-02, REQ-TL-03, REQ-TL-05, REQ-NF-14-03, REQ-NF-14-04 *(17 IDs)*

The Phase 14 total count also states **28** but the sum across priority tiers is 17 + 9 + 1 = **27**.

This is likely an artifact of REQ-PD-06 being added in v1.1 without updating the summary count. No requirement is actually missing — this is a cosmetic discrepancy.

**Resolution needed:** Correct the P0 count from 18 to 17 and the total count from 28 to 27, OR verify that exactly one P0 requirement was omitted from the ID list and add it.

---

## Clarification Questions

### Q-01 (Deferred from Round 1): Agent completion detection mechanism

Round 1 Q-02 asked how the tech lead detects that a dispatched agent has completed. This does not need to be specified at REQ level — the Agent tool is synchronous (a single tool call awaits the subagent's completion), so parallel dispatch is achieved by issuing multiple Agent tool calls in a single message turn. This is an implementation detail appropriate for the TSPEC author to confirm.

**No REQ change needed.** The TSPEC should document the fork/join dispatch pattern explicitly.

### Q-02 (Deferred from Round 1): Progress reporting output target

Round 1 Q-03 asked whether "coordination thread" in REQ-PR-01 through REQ-PR-04 means a Discord thread, a log file, or stdout. Given Ptah's architecture, this almost certainly means the Discord coordination channel where the orchestrator operates. This is acceptable to leave implicit at REQ level — the TSPEC should resolve which messaging abstraction the tech-lead skill uses for progress output.

**No REQ change needed.** TSPEC should specify the output interface.

---

## Positive Observations

All prior positive observations from Round 1 remain valid. Additional observations on v1.1 improvements:

- **REQ-PD-06** is well-formed: concrete trigger condition (cycle detected via topological sort deadlock), defined output (error-level warning naming involved phases), defined behavior (sequential fallback). It follows the same pattern as the well-praised REQ-PD-05 from Round 1.
- **REQ-BD-07's** "no partial merges" rule is the correct design choice for test isolation: a failed batch leaves the feature branch in a clean state, making the expected test outcome deterministic (batch must be re-run in its entirety). This produces a clear, testable invariant.
- **REQ-NF-14-01's** clarification on test gate timing (once per topological batch, not per sub-batch) correctly preserves the topological correctness guarantee. The trade-off between regression detection speed and test run count is explicitly acknowledged, which is the right level of detail for a REQ.
- **The `useTechLead` feature flag** (REQ-TL-01, REQ-NF-14-03) is an excellent testability affordance: the flag cleanly separates the new code path from the existing dispatcher logic, making regression testing of the existing PDLC flow straightforward without any mocking of the tech-lead infrastructure.
- **REQ-BD-05's** two-failure-mode distinction (invocation failure vs. assertion failure) directly enables separate test cases with different expected outputs and recovery steps.

---

## Recommendation

**Approved with minor changes.**

All High and Medium findings from Round 1 (both test-engineer and backend-engineer reviews) have been addressed. The single remaining Low finding (F-01, requirements count off-by-one) is cosmetic and non-blocking for TSPEC authoring. The PM may correct the count in a follow-up edit without re-review.

This REQ is ready to proceed to TSPEC authoring.
