# Cross-Review: Engineer → REQ-agent-coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document Reviewed** | [REQ-agent-coordination](REQ-agent-coordination.md) v1.2 + [FSPEC-agent-coordination](FSPEC-agent-coordination.md) v1.1 |
| **Review Date** | April 6, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Findings

### F-01 — Low: REQ-WB-02 worktree path convention conflicts with existing codebase

**Location:** REQ-WB-02, Description paragraph and Acceptance Criteria
**Severity:** Low

The requirement specifies:
> "Worktree path convention remains `/tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}` for uniqueness."

The current `DefaultWorktreeManager.create()` implementation uses UUID-based paths: `/tmp/ptah-wt-{uuid}/`. This is an explicit design choice inherited from REQ-015 (Temporal Foundation). The acceptance criteria also reference this convention:
> "A worktree is created at `/tmp/ptah-worktrees/eng/messaging-abstraction/req-review`"

**Impact:** The TSPEC author may incorrectly conclude the path convention needs to change back to the structured format, or may be confused about the discrepancy. The idempotency logic in REQ-WB-04 is also keyed to path matching — the existing UUID pattern makes path-based idempotency checks trivially unique (no collision possible), which is actually stronger than the structured path approach.

**Recommendation:** The TSPEC should document that the UUID-based path convention (`/tmp/ptah-wt-{uuid}/`) is the authoritative pattern. The acceptance criteria examples in REQ-WB-02 and REQ-WB-04 use illustrative structured paths that do not need to be literally implemented. No change to the REQ is strictly required, but a clarifying note in REQ-WB-04's description would prevent confusion.

---

### F-02 — Low: REQ-MR-01 agent resolution scope language could mislead TSPEC design

**Location:** REQ-MR-01, Description; FSPEC-MR-01 step 4
**Severity:** Low

The REQ states:
> "Match it (case-insensitive) against the agents registered in the **feature's workflow configuration**."

The FSPEC clarifies:
> "The minimum matching requirement is against `agent.id` (e.g., `pm`, `eng`, `qa`). The system may also match against additional agent identifiers — this is a system-level concern deferred to the TSPEC per REQ Assumption #5."

In the existing codebase, `AgentRegistry` is a global registry (all agents from `workflow.yaml`), not a per-feature or per-thread registry. Since all features use the same `workflow.yaml`, this is functionally equivalent to "agents in the feature's workflow config." However, the requirement language "the feature's workflow configuration" could lead a TSPEC author to design a per-feature agent lookup or per-thread state tracking that is more complex than necessary.

**Recommendation:** The TSPEC should clarify that agent lookup is performed against the global `AgentRegistry` (all agents declared in `workflow.yaml`) rather than a per-feature subset. The REQ language is not wrong — it just permits a simpler implementation than it implies.

---

### F-03 — Low: FSPEC-MR-01 BR-04 should name the Temporal SDK error class

**Location:** FSPEC-MR-01 Business Rules, BR-04
**Severity:** Low

BR-04 states:
> "The workflow existence check in step 7 is performed **implicitly** via the signal delivery attempt, not as a separate query. If the signal delivery fails with a 'workflow not found' error, the orchestrator treats this as the inactive case."

The FSPEC doesn't name the specific Temporal SDK error class (`WorkflowNotFoundError` from `@temporalio/client`). This is fine for a product specification, but the TSPEC must explicitly identify this error class so implementors don't rely on error message string matching. The existing implementation correctly catches `error.name === "WorkflowNotFoundError"`, but documenting this in the TSPEC will prevent future regressions.

**Recommendation:** No change to REQ/FSPEC needed. The TSPEC should document the exact Temporal SDK error class used for "workflow not found" detection, and include a test that verifies the error name check is correct.

---

## 2. Clarification Questions

### Q-01: Queue drain interaction with Temporal workflow completion

**Location:** FSPEC-MR-02, Edge Cases — "Workflow terminates with non-empty queue"
**Target:** Product Manager

The FSPEC states: "If the workflow reaches its terminal state (all phases complete) while signals are still queued, the remaining signals are processed before the workflow terminates."

This implies the workflow's main loop must drain the ad-hoc queue **after** the final sequential phase completes, before returning. But standard Temporal workflows return immediately after their final `await` — they cannot "wait" for signals unless they explicitly `await condition(...)` after the phase loop.

**Question:** Is the intent that the workflow's main loop should explicitly check and drain the queue after the final sequential phase, using a `condition`-based loop that blocks until the queue is empty? Or should this edge case be treated differently (e.g., log a warning and drop remaining signals)?

This has significant TSPEC implications: if the queue-drain-at-termination is required, the workflow must `await wf.condition(() => adHocQueue.length === 0)` after the phase loop, which would cause the workflow to block indefinitely if the user keeps sending signals. A timeout or maximum-drain-count should be considered.

---

### Q-02: Is continue-as-new in scope?

**Location:** FSPEC-MR-02, Edge Cases — "Continue-as-new with non-empty queue"
**Target:** Product Manager

The FSPEC mentions: "If a Temporal continue-as-new is triggered while signals are queued, the queue state must be carried across the continue-as-new boundary."

Temporal's default event history limit is 50,000 events. For a typical feature lifecycle (PM → review → eng → review → QA → implementation), even with several ad-hoc revisions, the event count is unlikely to approach this limit. The existing `featureLifecycleWorkflow` does not appear to use continue-as-new.

**Question:** Is continue-as-new actually a mechanism this feature needs to implement, or is this a forward-looking observation documenting a known constraint for future reference? If it's required, the TSPEC needs to define the trigger threshold and the serialization contract for queue state.

---

## 3. Positive Observations

- **Cascade-blocking rule (FSPEC-MR-02 BR-02)** is exceptionally well-designed. Blocking the queue for the duration of both the ad-hoc activity AND its downstream cascade elegantly enforces REQ-NF-01 (no concurrent agent execution) without complex locking mechanisms.

- **Deterministic workflow ID pattern (REQ-MR-08)** (`ptah-{featureSlug}`) is clean, stateless, and avoids a class of bugs common to in-memory lookup tables. The implicit workflow-existence check via signal delivery (FSPEC-MR-01 BR-04) is a correct pattern that eliminates the TOCTOU race condition that would exist with a separate query-then-signal approach.

- **First-token-only rule (REQ-MR-01)** is precisely specified and the boundary case ("mid-sentence @-mention is not a directive") is correctly handled. The acceptance test AT-04 in FSPEC-MR-01 covers this case.

- **FSPEC-MR-03 BR-08** (workflow config structural constraint: review phases must immediately follow their creation phases) correctly documents a pre-existing invariant as a constraint on the cascade's positional creation-phase identification. Making this explicit prevents subtle bugs in workflow config authoring.

- **All REQ open questions (OQ-01 through OQ-05) are closed** with clear, actionable resolutions. The feature scope is well-bounded and the out-of-scope items (parallel execution, conflict resolution) are correctly deferred.

- **FSPEC direct-to-TSPEC classification** for WB domain requirements is appropriate — those requirements are genuinely simple change patterns that don't warrant behavioral flow specifications.

- **BR-03 (no queue depth limit as product decision)** is correctly framed with the Temporal event history ceiling as the practical upper bound. Deferring the soft cap to the TSPEC as an implementation decision is appropriate.

---

## 4. Recommendation

**Approved with minor changes.**

All findings are Low severity. The REQ and FSPEC are technically sound and ready for TSPEC creation. The two clarification questions (Q-01, Q-02) should be addressed in the TSPEC's Open Questions section if the PM does not respond before TSPEC work begins — the TSPEC author can make defensible implementation decisions for both (drain queue with a bounded loop for Q-01; treat continue-as-new as out-of-scope for Q-02).

No blocking issues identified. The engineer can proceed to TSPEC creation.
