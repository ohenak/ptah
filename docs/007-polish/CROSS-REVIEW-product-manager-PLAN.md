# Cross-Review: Product Manager — PLAN Review

## Phase 7 — Polish Execution Plan

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (pm) |
| **Document Reviewed** | [007-PLAN-polish.md](./007-PLAN-polish.md) |
| **Review Date** | 2026-03-17 |
| **References** | [007-REQ-polish.md](./007-REQ-polish.md), [007-FSPEC-polish.md](./007-FSPEC-polish.md), [CROSS-REVIEW-test-engineer-PLAN.md](./CROSS-REVIEW-test-engineer-PLAN.md) |

---

## Recommendation

**❌ Needs Revision**

Two Medium findings (F-01, F-02) indicate that the PLAN does not fully cover approved requirements. Both map directly to acceptance criteria in REQ-NF-08 and REQ-NF-10. The engineer must address F-01 and F-02 and re-route the updated PLAN for re-review.

---

## Findings

### F-01 — MEDIUM: Hot-reload routing invalidation is an approved requirement with no owning task

**Affected requirement:** REQ-NF-08, FSPEC-EX-01 §4.8, AT-EX-01-08

REQ-NF-08 acceptance criteria explicitly include `"(or on config hot-reload)"` as a delivery path for agent registration. This is not aspirational — it is in the approved, FSPEC-backed requirement. FSPEC-EX-01 §4.8 specifies the behavioral flow for hot-reload: config watcher triggers registry rebuild, RoutingEngine re-fetches from the new registry, and any removed agent's ID becomes unknown (returning ERR-RP-02).

The PLAN contains no task for the hot-reload path. Task E4 (RoutingEngine + AgentRegistry injection) wires the registry into routing but tests only the initial startup case. Task G4 (integration test) covers "full lifecycle with archiving, all EVT events verified" — there is no mention of the hot-reload → routing invalidation scenario anywhere in the task list.

This is echoed as F-03 in the TE cross-review (Medium), which identified the same gap from a test-coverage angle. From a product angle, this is a requirement that will be silently missed if the PLAN ships as-is.

**Required action:** The engineer must choose one of:

1. Add a task (or extend E4/G4) to implement and test the hot-reload → registry rebuild → routing invalidation path per FSPEC-EX-01 §4.8 and AT-EX-01-08.
2. Escalate to the PM with a clear scope-reduction request. If hot-reload is deferred, REQ-NF-08 acceptance criteria must be updated and the FSPEC open questions section updated before the PLAN is finalized. This requires explicit product sign-off.

Leaving an approved requirement untasked is not an acceptable resolution.

---

### F-02 — MEDIUM: REQ-NF-10 (operator observability) is incomplete — EVT-OB-05 has no owning task

**Affected requirement:** REQ-NF-10, FSPEC-OB-01 §8.2, PROP-OB-07

REQ-NF-10 acceptance criteria require that an operator can reconstruct "the triggering message, the invoked agent, the routing signal type, post-signal actions (commit, archive, escalate), and any errors" from the console log stream alone. EVT-OB-05 (`[ptah:response-poster] INFO: agent response posted — thread_id, agent_id, message count`) is the event that covers the "response posted" step of this lifecycle reconstruction.

Phase E (E1–E4) assigns component loggers and observability events to SkillInvoker, ArtifactCommitter, InvocationGuard, and RoutingEngine. Task D3 refactors ResponsePoster. Neither task assigns EVT-OB-05 to ResponsePoster. If this is not corrected, REQ-NF-10's acceptance criteria cannot be met — an operator reviewing logs will have a gap between agent dispatch and artifact commit with no visibility into whether the response was actually posted.

This is echoed as F-02 in the TE cross-review (Medium). From a product perspective, this is a requirement coverage gap, not merely a test gap.

**Required action:** Either extend D3 to include: "Add component-scoped logger to `DefaultResponsePoster`; emit EVT-OB-05 after each `postAgentResponse()` call with `thread_id`, `agent_id`, and chunk count" — or add a new task E5 for this. The fix must align with the pattern established by E1–E4.

---

### F-03 — LOW: No requirement traceability in the task list

**Affected section:** §2 Task List (all phases)

Each task in the PLAN references a test file and a source file but does not reference the requirement IDs or FSPEC IDs it satisfies. This makes it difficult to perform a systematic coverage check during implementation and review. For example:

- Task C1 clearly maps to REQ-RP-06 + FSPEC-RP-01, but this is not stated.
- Task F2 clearly maps to REQ-DI-06 + FSPEC-DI-02, but the link is absent.
- Tasks A1–A3 collectively support REQ-NF-09 and REQ-NF-08, but neither is cited.

The Definition of Done (§5) includes "Code reviewed against requirement acceptance criteria" — but without the traceability column, this check is manual and error-prone.

**Required action:** Add a `Requirements` column to each task table listing the `REQ-XX-XX` and `FSPEC-XX-XX` IDs covered by that task. This is a documentation improvement and is non-blocking, but strongly recommended before implementation begins.

---

## Positive Observations

- **All six Phase 7 requirements have at least one owning task.** REQ-DI-06 → F2, REQ-DI-10 → D3, REQ-RP-06 → C1 + E3, REQ-NF-08 → B1+B3+G2+G3, REQ-NF-09 → A2+E1–E4+F1, REQ-NF-10 → E1–E4+F1+G4. The coverage is structurally sound, except for the EVT-OB-05 and hot-reload gaps above.

- **G3 (migration guide) is explicitly tasked.** REQ-NF-08 risk note in §5 of the REQ called out the migration guide as a Phase 7 deliverable. G3 correctly includes it.

- **The `archive_on_resolution?: boolean` flag in F3 matches product intent.** REQ §6 Scope Boundaries specifies "deployment-wide opt-out via config is sufficient for Phase 7" — the optional boolean in `OrchestratorConfig` is the correct implementation of this scope decision.

- **Agent response text moved to `postPlainMessage()` in D3.** This directly implements the second half of REQ-DI-10 ("agent-authored response content changes to plain text after Phase 7"). The task description correctly captures both the embed method changes and the `postAgentResponse()` → plain message transition.

- **Phase dependency ordering is clean.** The A→B/C/D→E→F→G chain correctly defers Orchestrator-level changes (F) until the lower-level pieces (embed methods in D, component loggers in E) are in place.

---

## Summary of Findings

| ID | Severity | Description |
|----|----------|-------------|
| F-01 | **Medium** | Hot-reload routing invalidation is an approved requirement (REQ-NF-08, FSPEC-EX-01 §4.8) with no owning task |
| F-02 | **Medium** | EVT-OB-05 (ResponsePoster observability) required by REQ-NF-10 has no owning task |
| F-03 | Low | No requirement traceability column in task tables |

**Required before approval:** F-01 and F-02 must be resolved. Updated PLAN must be re-routed to the Test Engineer and Product Manager for re-review.
