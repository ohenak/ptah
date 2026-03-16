# Cross-Review: Test Engineer — PLAN (013-PLAN-TSPEC-pdlc-auto-init)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Deliverable** | 013-PLAN-TSPEC-pdlc-auto-init.md |
| **Review Date** | 2026-03-15 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Summary

The execution plan is well-structured and demonstrates a strong red-green discipline throughout. The phase sequencing (Logger interface → pure helpers → fake factories → idempotency guard → orchestrator wiring → integration) is correct and minimizes broken-build windows. All three source files named in the TSPEC have corresponding tasks. The PROPERTIES document (43 properties across 8 categories, all mapped to unit or integration tests) is comprehensive, and the plan's task list covers the great majority of those properties.

Four findings are noted below — one high, one medium, two low. The high finding (F-01) concerns missing test coverage for a P0 property and must be addressed before the definition of done is declared. The medium finding (F-02) concerns a performance benchmark gap already identified in both the PM cross-review and the PROPERTIES doc. The two low findings are naming/clarity issues that create downstream traceability risk.

---

## 2. Findings

### F-01 — PROP-PI-10 Has No Explicit Assertion in Any Test Task
**Severity:** High

**Location:** Phase E tasks (E-1 through E-4), PROPERTIES §3.4 (PROP-PI-10)

**Issue:** PROP-PI-10 states that `executeRoutingLoop` must pass the content of the **first user-authored message** (`isBot === false`) to `parseKeywords` — not the thread name, not any bot message, not the triggering signal's content. This is a P0 data-integrity property whose violation would cause keyword detection to silently fail on valid feature initializations.

No task in Phase E explicitly asserts which message's content is passed to `parseKeywords`. Tasks E-1 through E-4 verify that keyword parsing *results* are reflected in `initializeFeatureCalls[0].config`, but they do not verify the *source* of the input. For example, a buggy implementation that passes `triggerMessage.content` or `threadHistory[0].content` (which could be a bot message) to `parseKeywords` would still pass all existing E-1 through E-4 tests if the same keyword appears in multiple messages in the test fixture — or would silently use defaults if no keyword is in the triggering signal.

The PROPERTIES gap analysis (§7, Gap #1) identifies this and recommends adding an explicit assertion: "Add an assertion in UT-ORC-AI-01 that `parseKeywords` receives the first `isBot === false` message content, not the thread name."

**Request:** Add a dedicated test case — either as a new task E-4.5 or as a required sub-assertion in E-1 — with the following scenario: the test fixture has (a) a bot message as `threadHistory[0]` and (b) a user message as `threadHistory[1]` containing a discipline keyword. The assertion verifies that `initializeFeatureCalls[0].config.discipline` matches the keyword from the user message, not the default. Also add a complementary scenario: user message has no keyword but thread name contains `[fullstack]` — assert default discipline (`backend-only`) is used.

---

### F-02 — REQ-NF-01 (Latency ≤ 100ms p95) Has No Test Task and No DoD Disposition
**Severity:** Medium

**Location:** Section 5 (Definition of Done), PROPERTIES §3.6 (PROP-NF-02), PM cross-review F-01

**Issue:** REQ-NF-01 is a P1 non-functional requirement specifying that the auto-init block must complete within 100ms at p95 across 100 runs in the CI test environment. PROP-NF-02 covers this property and assigns it to the integration test level — but no PLAN task implements or defers it. The DoD checklist explicitly references `REQ-NF-02–03` but silently omits `REQ-NF-01`. This was also raised as a medium finding (F-01) in the PM cross-review and the recommendation to either defer or cover it was made clearly.

The PROPERTIES doc (§7, Gap #5) recommends adding a performance smoke test to IT-05 or as a stand-alone Phase F-2 task.

**Request:** Add one of the following before declaring DoD met:

- **Option A (cover):** Add a Phase F-2 task: "Write a performance smoke test that calls `initializeFeature()` 100 times through the integration harness and asserts p95 wall-clock time < 100ms. Attach to `pdlc-auto-init.test.ts`."
- **Option B (defer):** Add an explicit DoD line: "REQ-NF-01 latency benchmark — deferred to follow-on performance validation task; not measured in this iteration." Mark it as ⬚ deferred with a rationale note.

Either option resolves the silent omission. The current state creates a false impression that all requirements are addressed.

---

### F-03 — Test ID Overlap Between Tasks E-1 and E-2 Creates Traceability Ambiguity
**Severity:** Low

**Location:** Phase E, tasks E-1 and E-2

**Issue:** Task E-1 claims IDs "UT-ORC-AI-01 to UT-ORC-AI-06" for happy-path tests. Task E-2 also references "UT-ORC-AI-03, UT-ORC-AI-04, UT-ORC-AI-05, UT-ORC-AI-06" for error and edge-case tests. The same six IDs are partitioned across two task rows with an overlapping range. This was also raised by the PM cross-review (F-02).

From a testing perspective this has a concrete operational consequence: during CI failure triage, if test `UT-ORC-AI-04` is red, it is ambiguous whether the failure is in the happy-path scenario written in E-1 or the error-path scenario in E-2. Bug reports and PR comments will reference the ID without the context of which task authored it.

**Request:** Separate the ID ranges cleanly:
- E-1: UT-ORC-AI-01, UT-ORC-AI-02 (happy-path cases)
- E-2: UT-ORC-AI-03 through UT-ORC-AI-08 (error and edge cases — enough room for the six variants listed in E-2)

Alternatively, introduce a sub-prefix: E-1 uses `UT-ORC-AI-HP-01` through `UT-ORC-AI-HP-06`; E-2 uses `UT-ORC-AI-ERR-01` through `UT-ORC-AI-ERR-04`. Either scheme eliminates the overlap.

---

### F-04 — PROP-PI-22 Integration Retry Path Is Only Half-Covered in IT-04
**Severity:** Low

**Location:** Phase F-1, integration test IT-04, PROPERTIES §3.5 (PROP-PI-22)

**Issue:** PROP-PI-22 states that after an `initializeFeature()` failure halts routing for a message, "the next message to the same thread must be retried from scratch and succeed if the underlying failure is transient." The PLAN's IT-04 description covers only the failure path: "`initializeFeature()` failure halts routing loop." The second half of the invariant — that a subsequent routing loop invocation with a fixed fake succeeds — is not described in any task.

The PROPERTIES gap analysis (§7, Gap #4) identifies this and recommends extending IT-04 to include a second routing loop invocation after the fake error is cleared, asserting successful initialization and managed-path entry.

Without the retry half, a regression where the orchestrator permanently blocks a feature after one transient init failure would not be caught by the integration suite. For example, if a stale `effectivelyManaged = false` flag were incorrectly cached, the retry would fail even after the fake is cleared.

**Request:** Extend the IT-04 task description to include: "Second invocation: clear `FakePdlcDispatcher.initError`, re-invoke the routing loop for the same thread. Assert `initializeFeatureCalls.length === 1` (first succeeded), `effectivelyManaged` path entered, no error logged." This is a two-assertion addition to an existing test and does not require a new task.

---

## 3. Questions

### Q-01 — Is `evaluateAgeGuard` Exported for Unit-Testing, and How Is This Documented?

**Location:** Phase B, task B-6; TSPEC §4.4 note on `/* @internal */` JSDoc

The PLAN states that pure helpers will be exported with a `/* @internal */` JSDoc annotation. Tasks B-1/B-2 and B-5/B-6 write and implement `countPriorAgentTurns` and `evaluateAgeGuard` respectively, and they are tested in `auto-init.test.ts` via direct import. But the PLAN does not specify which exact import path or export form the test file will use — is it a named export from `orchestrator.ts` with a re-export barrel, or a direct named export from the module?

This matters for test isolation: if the helpers are only exported via `/* @internal */` on the `orchestrator.ts` module, any tree-shaking or bundler change could strip the export. Clarify the export strategy in task B-1 (the first test-writing task) so the implementation and test are written consistently.

### Q-02 — Does Phase C-3 Confirm or Add `saveCount` to `FakeStateStore`?

**Location:** Phase C, task C-3

Task C-3 reads: "Confirm or add `saveCount: number` to `FakeStateStore`." This conditional phrasing implies the field may already exist (from Feature 011 work). If it already exists, C-3 is a no-op read task. If it does not, it is a write task with a different implementation effort.

The ambiguity is mild but creates a risk: if an engineer assumes C-3 is a no-op and skips it, and `saveCount` does not exist, the D-1 assertion `saveCount === 1` will fail to compile. Recommend that C-3 be split into a clear check-then-act: "Read `factories.ts` → if `saveCount` absent, add it; update task status to ✅ either way." This ensures the task is never silently skipped.

### Q-03 — Where Does `postToDebugChannel` Failure Test Live?

**Location:** Phase E, task E-2; PROPERTIES PROP-PI-09

PROP-PI-09 ("`postToDebugChannel` fails → warn logged, routing proceeds") is listed in E-2's task description as one of the error cases: "`postToDebugChannel` fails → warn logged, routing proceeds." However, E-2's test file is `orchestrator.test.ts` and the existing `FakePdlcDispatcher` does not expose a `postToDebugChannel` fake directly — the `postToDebugChannel` method likely delegates to `this.discord.postChannelMessage()`.

Clarify: does the test assert on `FakeDiscordClient.postedMessages` being empty (i.e., `postChannelMessage` throws, which is caught), or is there a `FakeDiscordClient.shouldFailPost` flag? The test setup for this case should be explicit in the E-2 task description so the test and implementation are written consistently.

---

## 4. Positive Observations

- **Red-green discipline is explicit throughout.** Every implementation task (B-2, B-4, B-6, D-2, E-6) is preceded by a test-writing task (B-1, B-3, B-5, D-1, E-1 through E-5). The plan does not conflate test authoring with implementation. This is the correct approach for a TDD-forward plan.

- **Dependency graph is detailed and accurate.** The dependency tree in Section 3 explicitly lists all blocking relationships. The parallelism opportunities (C-1/C-3 in parallel with B-1/B-3/B-5; E-1 through E-5 in parallel once C-2 is done) are correctly identified and will enable efficient parallel execution.

- **PROPERTIES coverage is reflected in the test suite.** The integration between the PROPERTIES doc (43 properties) and the PLAN's test task descriptions is strong: B-1 through B-6 cover all `countPriorAgentTurns` and `evaluateAgeGuard` properties; E-1 through E-5 cover `executeRoutingLoop` orchestration properties; D-1 covers all idempotency properties.

- **Fail-open semantics are explicitly tested.** Task B-5/B-6 includes UT-AG-06 (age guard fail-open when `countPriorAgentTurns` throws), and E-2 covers `initializeFeature()` throw halting routing, `logger.info` throw being swallowed, and `postToDebugChannel` failure being warn-logged. All PROPERTIES error-handling properties have corresponding test tasks.

- **Integration tests are scoped correctly.** The single integration test file (`pdlc-auto-init.test.ts`) containing IT-01 through IT-05 exercises the full orchestrator routing loop with all fakes wired together. IT-05 specifically covers the concurrent-request scenario (AT-PI-04) — the hardest acceptance test in the requirements — at the integration level, which is the correct level for cross-module interaction.

- **Feature 011 freeze is enforced in the DoD.** The DoD explicitly lists the seven frozen Feature 011 modules by filename and includes a "No changes to [those files] (C-01)" checkpoint. This gives reviewers and CI a specific, mechanical check to perform against the diff.

- **`@internal` export pattern avoids helper extraction.** Exporting helpers with `/* @internal */` annotation rather than extracting them into a separate file keeps the module boundary clean (helpers remain in `orchestrator.ts` per TSPEC) while making them testable. This is a pragmatic and architecturally sound choice.

- **Observability assertions are tied to exact log format strings.** Tasks E-1, E-2, E-3, and D-1 reference exact log message formats (e.g., `"[ptah] Auto-initialized PDLC state for feature \"{featureSlug}\" with discipline \"{discipline}\""`) rather than partial string matches. This ensures that format regressions are caught by the test suite and that PROP-PI-15, PROP-BC-09, and PROP-PI-18 are precisely asserted.

---

## 5. Properties Coverage Assessment

### All P0 Properties Have Corresponding Plan Tasks

| Property | PLAN Task(s) | Status |
|----------|-------------|--------|
| PROP-PI-01 (auto-init when eligible) | E-1, E-6 | Covered |
| PROP-PI-02 (managed path after init) | E-1, E-6 | Covered |
| PROP-PI-03 (REQ_CREATION phase only) | E-1, E-6 | Covered (implicit in initializeFeature call) |
| PROP-BC-01/02/03 (age guard boundaries) | B-5, B-6 (UT-AG-01 through UT-AG-06) | Covered |
| PROP-BC-04 (legacy path when ineligible) | E-3, E-6 | Covered |
| PROP-BC-05/06/07 (countPriorAgentTurns semantics) | B-1, B-2 (UT-CAT-01 through UT-CAT-06) | Covered |
| PROP-DC-01 (default config) | E-4, E-6 | Covered |
| PROP-PI-04 (Logger.debug declared) | A-1 | Covered |
| PROP-PI-05 (all Logger impls updated) | A-1, A-2 | Covered |
| PROP-PI-06 (initializeFeature throw halts routing) | E-2, E-6 | Covered |
| PROP-PI-07 (falsy slug falls through) | E-5, E-6 | Covered |
| PROP-PI-08 (logger.info throw swallowed) | E-2, E-6 | Covered |
| PROP-PI-10 (first user message as input) | **No explicit task** | **Gap — see F-01** |
| PROP-NF-01 (no schema change) | Implicit in DoD | Covered |
| PROP-PI-11/12/13/14 (idempotency) | D-1, D-2 | Covered |
| PROP-PI-19 (error log on init failure) | E-2, E-6 | Covered |
| PROP-PI-N01 through PROP-PI-N05 (negative properties) | E-1, E-2, D-1 | Covered |
| PROP-BC-N01/N02 (negative BC properties) | E-3, B-1 | Covered |

### P1 Properties

All P1 properties (PROP-DC-02 through PROP-DC-09, PROP-PI-15 through PROP-PI-18, PROP-BC-09, PROP-PI-09) have corresponding tasks in Phases B, D, and E. PROP-NF-02 (performance, P1) has no task — see F-02.

---

## 6. Test Sequence Assessment

The test sequencing is correct and follows the unit-before-integration principle:

1. **Phase A** — Logger interface unit tests (compile-time verification): correct entry point; all subsequent tests depend on `FakeLogger.debug()` being typed correctly.
2. **Phase B** — Pure helper unit tests: isolated from orchestrator concerns; each helper tested before it is used as a dependency.
3. **Phase C** — Factory test double updates: fakes extended before the orchestrator integration tests that depend on them.
4. **Phase D** — `pdlc-dispatcher.ts` unit tests: dispatcher tested in isolation before it is composed with the orchestrator in Phase E.
5. **Phase E** — Orchestrator unit tests: full `executeRoutingLoop()` behavior tested with all fakes wired in the unit tier.
6. **Phase F** — Integration tests: full routing loop with all real dependencies (excluding external services) exercised last.

The only sequencing note is that the dependency graph correctly identifies C-1 (factory helpers for age guard tests) as a prerequisite for B-5, not just a parallel task. The dependency tree in Section 3 captures this correctly.

---

## 7. Recommendation

**Approved with minor changes.**

- **F-01 (High)** must be resolved before declaring DoD met: add an explicit test task or sub-assertion covering PROP-PI-10 (first user-authored message sourcing for `parseKeywords`). The absence of this assertion is a P0 gap.
- **F-02 (Medium)** must be resolved by adding either a latency benchmark task (Phase F-2) or an explicit "deferred" disposition in the DoD. Silent omission of REQ-NF-01 creates a false impression of complete requirement coverage.
- **F-03 (Low)** is a suggestion to clean up the E-1/E-2 test ID overlap before implementation begins, to avoid CI triage confusion later.
- **F-04 (Low)** is a suggestion to extend IT-04 with a retry invocation to fully cover PROP-PI-22.

All other requirement domains (PI initialization, BC age guard, DC keyword parsing, idempotency, observability) have strong, specific test coverage. The plan is ready to proceed to implementation once F-01 and F-02 are addressed.
