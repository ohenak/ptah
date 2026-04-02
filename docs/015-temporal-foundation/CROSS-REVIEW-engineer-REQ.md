# Cross-Review: Engineer Review of REQ-015

| Field | Detail |
|-------|--------|
| **Document** | 015-REQ-temporal-foundation.md |
| **Reviewer** | eng (Senior Full-Stack Engineer) |
| **Date** | April 2, 2026 |
| **Review Scope** | Technical feasibility, architectural impact, implementability |

---

## Findings

### F-01: Activity Timeout Model Needs Clarification (Medium)

REQ-TF-02 and REQ-TF-05 describe Activities wrapping `SkillInvoker.invoke()`, but the current skill invocations run 10-15 minutes (some longer). Temporal's default `scheduleToCloseTimeout` is 10 minutes. R-09 mentions heartbeat-based Activities, but the requirements themselves don't specify:

- Whether Activities use `startToCloseTimeout` or `scheduleToCloseTimeout`
- Heartbeat interval and what constitutes a heartbeat (stdout progress? periodic check-in?)
- Whether the Claude Agent SDK supports emitting heartbeat signals during execution

The SDK currently wraps `claude-agent-sdk` which runs as a subprocess — heartbeating requires either polling the subprocess for liveness or using the SDK's streaming output. This is feasible but the requirement should specify the heartbeat mechanism so the TSPEC can commit to a design.

**Recommendation:** Add heartbeat details to REQ-TF-02 or REQ-TF-05 — at minimum: heartbeat interval range, heartbeat source (subprocess liveness check), and timeout behavior when heartbeats stop.

---

### F-02: Fork/Join Failure Policy Not Fully Specified (Medium)

REQ-TF-06 mentions "the configured failure policy (wait-for-all or fail-fast)" but doesn't define:

- What happens to the *other* running Activity when fail-fast triggers (cancel it? let it finish?)
- Whether partial results from a failed fork/join are preserved or discarded
- How a resumed fork/join works — does it re-dispatch all agents or only the failed one?

The current `handleSubtaskComplete()` in `state-machine.ts` tracks subtask completion by agentId and waits for all. Adding fail-fast introduces cancellation semantics that interact with Temporal's Activity cancellation model (which is cooperative, not preemptive).

**Recommendation:** Specify: (1) default failure policy, (2) behavior of surviving Activities on fail-fast, (3) whether partial completion is resumable.

---

### F-03: Migration Phase Mapping Assumes 1:1 Config Compatibility (Medium)

REQ-MG-01 says `ptah migrate` reads `pdlc-state.json` and creates workflows "positioned at the correct phase." But v4 phases are a hardcoded TypeScript enum (15 values), while v5 phases are config-driven. The migration tool needs a mapping from v4 enum values to v5 config phase IDs.

- If the user has a custom `ptah.workflow.yaml` that doesn't match the default preset, the mapping is undefined
- If the default preset renames phases (e.g., `TSPEC_CREATION` → `spec-creation`), the mapping must be explicit

**Recommendation:** Specify that migration targets the default PDLC preset only, or define a mapping file/strategy for custom workflows. Add an acceptance criterion: "Migration fails with a clear error if the target workflow config doesn't contain a phase matching the feature's current v4 phase."

---

### F-04: Signal Delivery Guarantee Not Addressed (Low)

REQ-TF-03 replaces file-based polling with Temporal Signals for `ROUTE_TO_USER`. The requirement says the messaging layer sends a `user-answer` Signal, but doesn't address:

- What happens if the Signal is sent before the workflow reaches the `waitForSignal` point (Temporal buffers these, which is correct — just worth noting)
- What happens if the messaging layer crashes after receiving the answer but before sending the Signal (message loss)

Temporal Signals are buffered, so the first case is handled. The second is a messaging-layer concern and may be out of scope, but it's worth a note since the current polling approach is more resilient to this (the file persists even if the poller crashes).

**Recommendation:** Add a note to REQ-TF-03 acknowledging that Signal delivery depends on the messaging layer's reliability. Consider whether the messaging layer should retry Signal delivery.

---

### F-05: Workflow Versioning Strategy Not Addressed (Low)

As the config-driven workflow evolves (phases added/removed/reordered), in-flight Temporal Workflows may be running an older version of the workflow definition. Temporal supports workflow versioning via `patched()` and `getVersion()`, but this isn't mentioned anywhere.

**Recommendation:** Add a non-functional requirement or a note in REQ-CD-04 about how in-flight workflows handle config changes. At minimum: "Running workflows complete with their original config; config changes apply only to newly started workflows."

---

### F-06: `ptah.workflow.yaml` and `ptah.config.json` Overlap Not Fully Delineated (Low)

REQ-CD-01 says phases go in `ptah.workflow.yaml`, and REQ-NF-15-01/REQ-NF-15-03 say Temporal connection and worker config go in `ptah.config.json`. But REQ-CD-02 says agent references in workflow config must "resolve to registered agents" — this creates a cross-file validation dependency.

The current design is reasonable (workflow graph in YAML, everything else in JSON), but the requirement should explicitly state the validation contract: "At startup, all agent IDs referenced in `ptah.workflow.yaml` must exist in the `agents` array in `ptah.config.json`."

This is actually stated in REQ-CD-05's acceptance criteria. Finding retracted — this is already covered.

**Severity downgraded to informational.** No action needed.

---

## Clarification Questions

### Q-01: Temporal SDK Version Target

The requirement says "Temporal TypeScript SDK (v1.x)" in assumption A-08. The Temporal TypeScript SDK is currently at v1.11.x with significant API changes since v1.0. Should the TSPEC target the latest v1.x release, or is there a specific minimum version?

### Q-02: Worker Topology

REQ-NF-15-03 configures the Temporal Worker, but doesn't specify whether the Worker runs in-process with the Orchestrator or as a separate process. The current `orchestrator.ts` is a single process. Running the Worker in-process is simpler but means a crash takes down both the workflow starter and the worker. Running them separately adds operational complexity but better fault isolation.

**Recommendation:** Specify in-process Worker for v5.0 (matching current single-process model), with a note that separate Worker deployment is a future option.

### Q-03: Workflow ID Collision on Feature Re-initiation

REQ-TF-01 uses `ptah-feature-{slug}` as the Workflow ID. If a feature completes and a new feature with the same slug is initiated, the Workflow ID collides. Temporal prevents starting a workflow with a duplicate ID if the previous one hasn't been garbage collected.

**Options:** (1) append a sequence number, (2) use a UUID suffix, (3) rely on Temporal's retention period to expire old workflows. The requirement should specify the expected behavior.

---

## Positive Observations

1. **Excellent problem statement.** Section 1 clearly maps every current component to its Temporal replacement and documents what is kept, with rationale. This makes the migration scope unambiguous.

2. **Clean domain decomposition.** TF (foundation), CD (config-driven), MG (migration), NF (non-functional) domains are well-separated with clear dependency ordering. This maps naturally to implementation phases.

3. **The "What is kept" table is valuable.** Explicitly calling out that Discord, Claude SDK, worktree management, context assembler, router, and agent registry survive prevents scope creep.

4. **Config-driven design is architecturally sound.** The current codebase has 679 lines of state machine + 158 lines of reviewer tables that are entirely data, not logic. Moving this to config is the right call.

5. **The existing pure-functional state machine is a great starting point.** `transition()` returns `{newState, sideEffects[]}` — this maps directly to Temporal's event-sourced model. The side-effect pattern means the workflow logic is already deterministic.

6. **Assumption table with impact analysis.** A-08 through A-11 are realistic and the mitigations are practical.

7. **Risks are honest.** R-09 (Activity timeout) and R-11 (operational complexity) are the real concerns, and the mitigations address them.

---

## Recommendation

**Needs revision** — Three Medium-severity findings (F-01, F-02, F-03) need to be addressed before this document is ready for TSPEC work.

Specifically:
- **F-01:** Add heartbeat mechanism details to the Activity requirements
- **F-02:** Fully specify fork/join failure policy behavior
- **F-03:** Define migration phase-mapping strategy and failure behavior

The PM should address all Medium findings and route the updated REQ back for re-review.
