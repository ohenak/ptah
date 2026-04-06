# Cross-Review: Test Engineer — PLAN Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document** | [PLAN-agent-coordination.md](PLAN-agent-coordination.md) |
| **Version Reviewed** | 1.0 |
| **Date** | April 6, 2026 |
| **Recommendation** | **Needs revision** |

---

## Positive Observations

- **Phase B parser testing is exemplary.** 7 granular tasks for a pure function, each targeting a specific FSPEC-MR-01 business rule (BR-01 through BR-05). This is ideal test-pyramid adherence — comprehensive unit coverage for a critical parsing boundary.
- **Phase A correctly separates interface/type work from test logic.** Tasks 7–8 establish test doubles before any functional code, enabling TDD in subsequent phases.
- **Phase G extracts pure helpers for workflow logic.** Testing `findAgentPhase` and `collectCascadePhases` as pure functions (tasks 39–45) is the correct approach — these are the core algorithms of the cascade and should be tested at unit level without Temporal workflow infrastructure.
- **Dependency graph in Section 3 is clear and correct.** The ordering constraints are sound and the parallelization opportunities (B, C, D, G after A) are well-identified.
- **Error scenario coverage in Phase C is thorough.** `commitAndPush` has 4 tasks (19–22) covering happy path, empty changes, push failure, and commit failure — matching TSPEC Section 7's error handling table.

---

## Findings

### F-01 — Medium: No test task for `handleMessage` with Discord ack post failure

**PLAN:** Phase F (tasks 30–38)

TSPEC Section 7 specifies: _"Discord ack post fails → Log warning. Signal already sent — agent will execute."_ and FSPEC-MR-01 BR-05 states this is "not atomic" — signal delivery succeeds but ack fails. This is a distinct error path from task #37 (signal delivery failure).

No task in Phase F tests the scenario where `signalAdHocRevision` succeeds but the subsequent Discord ack post throws. This is the BR-05 path — the system must log a warning but NOT roll back the signal. The current task #34 ("posts ack after successful signal dispatch") tests the happy path only.

**Required fix:** Add a task to Phase F: _"`handleMessage` logs warning but does not throw when Discord ack post fails after successful signal dispatch"_. Test file: `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts`. This verifies the non-atomic behavior from FSPEC-MR-01 BR-05.

---

### F-02 — Medium: No integration test task for the end-to-end ad-hoc flow across orchestrator → Temporal client → workflow

**PLAN:** Section 4 (Integration Points)

The PLAN identifies 8 integration points with risk levels but defines no integration test tasks. The highest-risk integration is between the orchestrator layer (`handleMessage` → `signalAdHocRevision`) and the workflow layer (`adHocRevisionSignal` handler → `drainAdHocQueue`). These cross three module boundaries:

1. Orchestrator constructs workflow ID via `ptah-{featureSlug}` (TSPEC 5.2)
2. Temporal client sends signal with `AdHocRevisionSignal` payload
3. Workflow receives signal, enqueues, and drains

Each module is tested in isolation (Phases D, F, G/H), but there is no task verifying that the signal payload constructed by the orchestrator matches what the workflow handler expects, or that the deterministic ID constructed by `handleMessage` matches the ID used by `startFeatureWorkflow`. Contract mismatches between these layers would only surface in production.

**Required fix:** Add at least one integration test task (new Phase or appended to Phase H): _"Integration: signal sent by orchestrator with deterministic ID is receivable by workflow signal handler with matching payload shape"_. This can be a contract-level test (verify type compatibility and ID format consistency) without requiring a real Temporal server.

---

### F-03 — Low: Phase H tasks 49–51 lack test file assignments

**PLAN:** Phase H, tasks 49, 50, 51

Tasks 49 ("Insert `drainAdHocQueue()` call at each phase transition in the main loop"), 50 ("Wire `executeCascade()` into `drainAdHocQueue`"), and 51 ("Drain remaining queue signals before workflow termination") have no test file column entry (shown as `—`).

These are the most critical workflow changes — they modify the main loop behavior. While the pure helpers are tested in Phase G, the integration of `drainAdHocQueue()` into the main loop and the cascade wiring must also be tested. Given that Temporal workflow testing can be done via the `@temporalio/testing` package's `TestWorkflowEnvironment`, or by testing the extracted functions, these tasks should have test file assignments.

Not blocking — the engineer can determine the appropriate test approach during implementation (e.g., if `drainAdHocQueue` is defined as an inner function, it may be tested indirectly through workflow-level tests). But explicitly assigning test files would clarify expectations.

---

### F-04 — Low: No task for testing `adHocQueue` state in `ContinueAsNewPayload` round-trip

**PLAN:** Phase H, task 48

Task 48 states: _"Update `buildContinueAsNewPayload` to carry `adHocQueue` across CAN boundary"_. The test file is `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts`. This covers the payload builder function, but there is no task verifying the round-trip: that a workflow started with a non-empty `adHocQueue` in its `ContinueAsNewPayload` will correctly process those queued signals on the new run.

FSPEC-MR-02 edge case: _"Continue-as-new with non-empty queue: the queue state must be carried across the continue-as-new boundary. No signals are lost."_ The unit test for `buildContinueAsNewPayload` verifies the data is included, but does not verify the workflow correctly initializes from it.

Not blocking — this is an edge case that may be deferred to a future integration test.

---

## Clarification Questions

**Q-01:** For Phase G task 45 ("Cascade positional creation-phase lookup uses `phases[reviewIndex - 1]`"), will this test also cover the edge case from FSPEC-MR-03 BR-08 where `phases[reviewIndex - 1]` is another review phase (not a creation phase)? This is the config structure constraint — if the lookup yields a review phase, the cascade produces incorrect behavior. A test verifying that the lookup returns the expected phase type (or at least that it returns `phases[N-1]` regardless of type, with a warning comment) would document this known limitation.

---

## Recommendation

**Needs revision.** Two Medium-severity findings must be addressed:

- **F-01:** Add a test task for Discord ack failure after successful signal dispatch (FSPEC-MR-01 BR-05).
- **F-02:** Add an integration test task for the orchestrator → Temporal client → workflow signal contract.

The two Low findings (F-03, F-04) and the clarification question (Q-01) are non-blocking but worth addressing during implementation.

After addressing F-01 and F-02, route the updated PLAN back for re-review.
