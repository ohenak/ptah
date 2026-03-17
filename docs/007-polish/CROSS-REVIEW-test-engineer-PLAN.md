# Cross-Review: Test Engineer — PLAN Review

## Phase 7 — Polish Execution Plan

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | [007-PLAN-polish.md](./007-PLAN-polish.md) |
| **Review Date** | March 17, 2026 |
| **References** | [007-PROPERTIES-polish.md](./007-PROPERTIES-polish.md), [007-TSPEC-polish.md](./007-TSPEC-polish.md) |

---

## Recommendation

**❌ Needs Revision**

Two Medium findings (F-02, F-03) and one High finding (F-01) must be addressed before this PLAN can serve as a reliable implementation guide. All High and Medium findings must be resolved and the PLAN re-routed to the Test Engineer for re-review.

---

## Findings

### F-01 — HIGH: No test scripts — property-to-test-name mapping is absent

**Affected tasks:** All tasks with a Test File column (A1–F3, G1, G4)

The PLAN assigns a test file to each task but provides no test scripts — no `describe`/`it` block names, no assertion descriptions, no property ID cross-references, and no setup requirements per test case. The PROPERTIES document defines 69 properties (66 unit + 3 integration) but the PLAN provides no mechanism for an engineer to confirm systematic property coverage when writing tests.

Without test scripts, coverage is accidental. An engineer implementing Task B1 (`buildAgentRegistry()`) has no list telling them they must write individual tests for PROP-EX-01 through PROP-EX-09, PROP-EX-14, PROP-EX-16, PROP-EX-N01, and PROP-EX-N02 — eleven separate behavioral invariants, each requiring its own isolated test. The same gap exists for every task.

**Required action:** Add a test script table to each task. Minimum required fields:

| # | Test Name | Asserts | Property | Level | Setup |
|---|-----------|---------|----------|-------|-------|
| 1 | `given valid agents array, registers all entries` | Registry contains all entries; no errors returned | PROP-EX-01 | Unit | FakeFileSystem with all paths returning `true` |

High-priority tasks to address first: B1 (11 properties), D3 (8 properties), F1+F2 (combined ~10 properties), E1–E4 (4 observability properties each).

---

### F-02 — MEDIUM: PROP-OB-07 (EVT-OB-05) has no owning task

**Affected property:** PROP-OB-07 — `EVT-OB-05 must be emitted by response-poster component at INFO level including thread_id, agent_id, and message count after agent response is posted to Discord`

Phase E tasks (E1–E4) add component-scoped loggers and observability events to SkillInvoker, ArtifactCommitter, InvocationGuard, and RoutingEngine. Task D3 refactors ResponsePoster's embed methods and chunking logic. Neither D3 nor any Phase E task specifies adding a component-scoped logger to ResponsePoster or emitting EVT-OB-05.

FSPEC-OB-01 §8.2 and PROP-OB-07 both require EVT-OB-05 from the `response-poster` component. If this is not assigned to a task, the event will be silently omitted from the implementation.

**Required action:** Either extend D3's description to include: "Add component-scoped logger to `DefaultResponsePoster` constructor; emit EVT-OB-05 after each `postAgentResponse()` call with `thread_id`, `agent_id`, and chunk count" — or add a new task E5 mirroring the E1–E4 pattern for ResponsePoster.

---

### F-03 — MEDIUM: PROPERTIES §7 Gap #3 (hot-reload registry rebuild) not addressed

**Reference:** PROPERTIES §7 Gap #3 (Medium risk), FSPEC-EX-01 §4.8, AT-EX-01-08

The PROPERTIES document explicitly flagged a medium-risk gap before the PLAN was written:

> _"After config hot-reload removing an agent, DefaultRoutingEngine must treat that agent's ID as unknown and post ERR-RP-02. Add as integration property before the PLAN is written."_

The PLAN does not address this gap. No task creates the missing property, and no task verifies the registry rebuild → routing invalidation path. The G4 integration test description ("full lifecycle with archiving, all EVT events verified") does not mention config hot-reload.

**Required action:** Choose one of:
- Add the missing property to PROPERTIES and add a test script to G4 (or a new task) that tests the hot-reload path with a FakeAgentRegistry rebuild
- Explicitly mark this as deferred to a follow-on phase in both the PLAN and PROPERTIES §7, with a clear risk acknowledgement

Leaving it unaddressed with a Medium risk assessment from PROPERTIES is not acceptable.

---

### F-04 — LOW: A1 test file attribution is misleading

**Affected task:** A1 (`src/types.ts` — add types; remove `AgentConfig`)

Task A1 lists `tests/unit/services/logger.test.ts` as its test file. However, A1's primary deliverables are new types: `AgentEntry`, `RegisteredAgent`, `AgentValidationError`, `UserFacingErrorType`, `UserFacingErrorContext`, `LlmConfig`, `Component`, `LogLevel`, `LogEntry`. The Logger test file validates `ComponentLogger` behavior — it does not cover `AgentEntry` shape, `PtahConfig` structural changes, or the removal of `AgentConfig`.

The actual consumer tests for A1's types live in:
- `agent-registry.test.ts` (B1) — validates `AgentEntry` fields, `AgentValidationError` shape
- `config/loader.test.ts` (B3) — validates `PtahConfig` with `agents[]` + `llm`
- `error-messages.test.ts` (C1) — validates `UserFacingErrorType` and `ErrorMessage`

**Required action:** Change A1's Test File column to `(TypeScript compile check — validated through B1, B3, C1 consumers)` or list the relevant downstream test files. This prevents engineers from expecting to write `AgentEntry` tests in `logger.test.ts`.

---

### F-05 — LOW: G4 integration test is underspecified

**Affected task:** G4 (`tests/integration/orchestrator/routing-loop.test.ts`)

Task G4 describes "full lifecycle with archiving, all EVT events verified" — but provides no detail on:

- Which of the 10 EVT events (EVT-OB-01 through EVT-OB-10) must be asserted (PROP-OB-03 through PROP-OB-12)
- That a **shared FakeLogger root store** is required (critical for PROP-LG-06 and PROP-DI-21 — all component loggers must share one store so cross-module EVT assertions work)
- That `FakeDiscordClient.archiveThreadCalls` must be inspected post-resolution (PROP-DI-01, PROP-DI-04)
- That the test must verify post-response, pre-archive sequencing (PROP-DI-02, PROP-DI-03)
- Which PROPERTIES properties G4 is the primary verifier for

An engineer writing G4 in isolation from PROPERTIES will likely miss several of these invariants.

**Required action:** Add a test script table to G4 enumerating the lifecycle scenarios and property mappings, or add a note referencing the specific PROPERTIES section with a checklist of must-verify behaviors.

---

### F-06 — LOW: Test file path inconsistency between TSPEC and PLAN

**Affected task:** B3 (config loader)

The TSPEC §3 project structure shows `tests/unit/config-loader.test.ts` (flat path, no `config/` subdirectory). Task B3 in the PLAN references `tests/unit/config/loader.test.ts` (with `config/` subdirectory). This discrepancy means either the TSPEC or PLAN has an incorrect path.

**Required action:** Confirm the intended test file path and align PLAN and TSPEC. If the `config/` subdirectory is correct per the existing repo structure, update the TSPEC project structure. If the flat path is correct, update B3.

---

## Positive Observations

- **Phase dependency graph (§3) is clear and accurate.** The A→B→C→D→E→F→G ordering correctly models the type/logger/factory layering, and the parallel opportunities (B1∥B3, C1∥B, E1-E4 in parallel after D) are correctly identified.
- **Integration points table (§4) is appropriately risk-rated.** Flagging `factories.ts` as High risk is the right call — it touches every unit test.
- **G4 integration test is explicitly planned.** The existence of a full lifecycle test covering PROP-DI-21 is correct and necessary; the gap is only in its detail level (F-05 above).
- **G5 (full suite gate) is present.** Requiring 0 failures and 0 skips as a definition-of-done criterion is good practice and prevents silent regressions during the high-churn `factories.ts` changes.
- **FakeDiscordClient and FakeResponsePoster test tasks (D2, D4) are correctly identified.** Explicitly testing fake behavior (not just using fakes) is aligned with TSPEC §9.2 and PROP-LG-06 patterns.
- **No E2E tests proposed.** Correctly aligned with the test pyramid analysis in PROPERTIES §6 — all Phase 7 behaviors are verifiable at unit/integration level.

---

## Summary of Findings

| ID | Severity | Description |
|----|----------|-------------|
| F-01 | **High** | No test scripts — property-to-test-name mapping absent across all tasks |
| F-02 | **Medium** | PROP-OB-07 (EVT-OB-05 from ResponsePoster) has no owning task |
| F-03 | **Medium** | PROPERTIES §7 Gap #3 (hot-reload registry rebuild) not addressed in PLAN |
| F-04 | Low | A1 test file attribution (logger.test.ts) is misleading for types-only task |
| F-05 | Low | G4 integration test lacks property mapping, fake setup, and EVT checklist |
| F-06 | Low | Test file path inconsistency: TSPEC §3 vs PLAN task B3 |

**Required before approval:** F-01, F-02, F-03 must be resolved and PLAN re-routed to Test Engineer for re-review.
