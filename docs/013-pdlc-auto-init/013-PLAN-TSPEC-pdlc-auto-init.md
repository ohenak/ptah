# Execution Plan: PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Technical Specification** | [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) |
| **Requirements** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) |
| **Date** | 2026-03-15 |
| **Status** | Approved (v1.1 — addressed PM F-01/F-02 and TE Properties gaps 1–5) |

---

## 1. Summary

Wire `initializeFeature()` into the orchestrator's routing loop so that new features are automatically registered in the PDLC state machine on first encounter. The implementation spans two source files (`orchestrator.ts` and `pdlc-dispatcher.ts`) plus the `Logger` interface and its implementations, introducing three new pure helper functions (`countPriorAgentTurns`, `parseKeywords`, `evaluateAgeGuard`) and an idempotency guard in `DefaultPdlcDispatcher.initializeFeature()`.

---

## 2. Task List

### Phase A: Logger interface — add `debug()` method

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A-1 | Add `debug(message: string): void` to `Logger` interface and `ConsoleLogger` implementation | `tests/unit/orchestrator/orchestrator.test.ts` (compile-time verification only; FakeLogger usage in existing tests causes type errors until FakeLogger is updated) | `ptah/src/services/logger.ts` | ⬚ Not Started |
| A-2 | Update `FakeLogger` in `factories.ts` to implement `debug()` — captures `{ level: "debug", message }` into `this.messages` using the same pattern as other levels | `tests/unit/orchestrator/orchestrator.test.ts` (existing tests must continue to compile and pass) | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |

**Dependency note:** A-1 must precede A-2. A-2 unblocks all subsequent phases that use `FakeLogger` as a typed test double.

---

### Phase B: Pure helper functions

These are module-level private helpers in `orchestrator.ts`. They are tested via a dedicated unit test file that imports them. Since they are not exported from the module, we can either (a) export them temporarily for testing or (b) extract them into a co-located `auto-init-helpers.ts` file. **Per the TSPEC, the helpers are defined in `orchestrator.ts`** — for testability, the helpers will be exported with a `/* @internal */` JSDoc annotation so the unit test can import them.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B-1 | Write failing unit tests for `countPriorAgentTurns` (UT-CAT-01 through UT-CAT-06): empty array, user-only messages, bot+routing message counted, bot-without-routing excluded, mixed history, multiple routing messages | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` [NEW] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| B-2 | Implement `countPriorAgentTurns(history: ThreadMessage[]): number` — filter for `isBot === true AND content.includes("<routing>")`, return count | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| B-3 | Write failing unit tests for `parseKeywords` (UT-KW-01 through UT-KW-10): null/undefined/empty → defaults; `[backend-only]`, `[frontend-only]`, `[fullstack]`, `[skip-fspec]` recognized; `[FULLSTACK]` and `[ fullstack ]` ignored (case/space sensitivity); last discipline wins; unknown token ignored; duplicate `[skip-fspec]` idempotent | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| B-4 | Implement `parseKeywords(text: string \| null \| undefined): FeatureConfig` — extract `\[([^\s\[\]]+)\]` tokens, process left-to-right, last discipline wins, default `{ discipline: "backend-only", skipFspec: false }` | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| B-5 | Write failing unit tests for `evaluateAgeGuard` (UT-AG-01 through UT-AG-06): 0 turns → eligible; 1 turn → eligible (boundary); 2 turns → ineligible (boundary); 5 turns → ineligible; empty array → eligible; **UT-AG-06** malformed history (countPriorAgentTurns throws) → fail-open: return value must be `{ eligible: true }` AND `logger.warn` must have been called with the malformed-history message (assert both, per PROP-BC-08 and gap recommendation #3) | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| B-6 | Implement `evaluateAgeGuard(history: ThreadMessage[], logger: Logger): AgeGuardResult` — calls `countPriorAgentTurns`, returns `{ eligible: true }` if count ≤ 1, `{ eligible: false, turnCount }` otherwise; catch block: `logger.warn(...)` + return `{ eligible: true }` (fail-open); define `const AGE_GUARD_THRESHOLD = 1` as module-level constant; define `type AgeGuardResult` inline. **Note (TE F-07):** The call site in `executeRoutingLoop()` (§4.4.3 of TSPEC) must pass `this.logger` as the second argument — the illustrative TSPEC code block omits it; the implementation must include it or the call will not type-check | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

**Dependency note:** B-1/B-2 before B-5/B-6 (evaluateAgeGuard wraps countPriorAgentTurns). B-3/B-4 is independent of B-5/B-6. All of Phase B depends on A-2 (FakeLogger typed correctly).

---

### Phase C: Factory test double updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C-1 | Add `createBotMessageWithRouting` and `createBotMessageNoRouting` factory helpers to `factories.ts` — wrappers around existing `createThreadMessage` with `isBot: true` and appropriate default content | `ptah/tests/unit/orchestrator/pdlc/auto-init.test.ts` (used in B-5 age guard tests) | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| C-2 | Update `FakePdlcDispatcher` in `factories.ts`: add `initializeFeatureCalls: Array<{ slug: string; config: FeatureConfig }>`, `initError: Error \| null`, `autoRegisterOnInit: boolean`, and implement `initializeFeature()` method per TSPEC §7.2 | `ptah/tests/unit/orchestrator/orchestrator.test.ts` (UT-ORC-AI-* tests depend on this) | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| C-3 | Confirm or add `saveCount: number` to `FakeStateStore` in `factories.ts` — incremented in `save()` per TSPEC §7.2 | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` (UT-IDP-01 asserts saveCount === 1) | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |

**Dependency note:** C-1 can proceed in parallel with C-2 and C-3 once A-2 is done. C-2 depends on FakePdlcDispatcher protocol compatibility confirmed. C-3 is a read-then-conditionally-add task.

---

### Phase D: `DefaultPdlcDispatcher.initializeFeature()` idempotency guard

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D-1 | Write failing unit tests for idempotency guard (UT-IDP-01, UT-IDP-02): first call for new slug creates state and saves once (`saveCount === 1`); second call for same slug returns existing record unchanged, does not overwrite config, `saveCount` remains 1; second call with different config returns first record (config not overwritten) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` [UPDATED] | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| D-2 | Implement check-before-write idempotency guard in `DefaultPdlcDispatcher.initializeFeature()`: read `this.state!.features[slug]`; if existing, `this.logger.debug("...already initialized (concurrent request)")` and return existing; else proceed with create+save | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |

**Dependency note:** D-1 depends on A-2 (FakeLogger with debug support), C-3 (FakeStateStore with saveCount). D-2 depends on A-1 (Logger interface has debug method).

---

### Phase E: Orchestrator auto-init wiring (unit tests + implementation)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E-1 | Write failing orchestrator unit tests for happy-path auto-init (**UT-ORC-AI-01 and UT-ORC-AI-02** only): new feature with 0 prior turns → `initializeFeature()` called once, config matches keyword parsing, managed path invoked, info log emitted (verify `m.level === "info"` filter per TE F-08); `[fullstack]` keyword → discipline fullstack. **Additional assertions in UT-ORC-AI-01** (per PROP-PI-10 gap #1): verify `parseKeywords` receives the content of the first `isBot === false` message — not the thread name, not a bot message; (per PROP-PI-16 gap #2): verify the info log entry appears in `FakeLogger.messages` **before** the debug channel post appears in `FakeDiscordClient.postedMessages` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` [UPDATED] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| E-2 | Write failing orchestrator unit tests for error and edge cases (**UT-ORC-AI-03 through UT-ORC-AI-06**): UT-ORC-AI-03 `[skip-fspec]` → skipFspec true; UT-ORC-AI-04 `[backend-only] [fullstack]` → discipline fullstack (last wins); UT-ORC-AI-05 `initializeFeature()` throws → error logged, neither managed nor legacy path called; UT-ORC-AI-06 logger.info throws during success log → error swallowed, routing proceeds; also cover: `postToDebugChannel` fails → warn logged, routing proceeds; already-managed feature → auto-init not re-triggered. **Note (PM F-02):** UT-ORC-AI-03/04 are happy-path keyword tests, UT-ORC-AI-05/06 are error cases — all four IDs live in this task (E-2), none overlap with E-1 | `ptah/tests/unit/orchestrator/orchestrator.test.ts` [UPDATED] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| E-3 | Write failing orchestrator unit tests for age guard + backward compat (UT-ORC-BC-01 to UT-ORC-BC-05): thread with 2 prior agent turns → no auto-init, debug skip log emitted, `routingEngine.decide()` IS called; thread with 1 prior turn → auto-init eligible; thread with 0 prior turns (empty history) → auto-init eligible; orchestrator progress messages (bot but no `<routing>` tag) excluded from count | `ptah/tests/unit/orchestrator/orchestrator.test.ts` [UPDATED] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| E-4 | Write failing orchestrator unit tests for discipline keyword parsing (UT-ORC-DC-01 to UT-ORC-DC-09): each valid keyword sets correct discipline; `[FULLSTACK]` ignored → default; `[ fullstack ]` ignored → default; unknown token ignored → default; no keywords → default `{ discipline: "backend-only", skipFspec: false }` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` [UPDATED] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| E-5 | Write failing orchestrator unit test for unresolvable slug (UT-ORC-SLUG-01): thread name that produces falsy slug → no auto-init attempted, age guard not evaluated, `routingEngine.decide()` IS called (no silent drop) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` [UPDATED] | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| E-6 | Implement the auto-init block in `executeRoutingLoop()` per TSPEC §4.4.3 and §5.1: wrap slug resolution in try/catch → falsy slug falls through to legacy path; `let effectivelyManaged = isManaged`; if `!isManaged` → call `evaluateAgeGuard`; if eligible → `parseKeywords(initialMessage?.content)` → `initializeFeature(slug, config)` → set `effectivelyManaged = true`, log info (with swallow), post debug channel; if ineligible → `logger.debug(skip message)`; route via `effectivelyManaged` flag | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

**Dependency note:** E-1 through E-5 (all test-writing tasks) depend on C-2 (FakePdlcDispatcher updated). They can be written in parallel once C-2 is complete. E-6 (implementation) depends on all Phase B helpers existing, D-2 (idempotency guard), and A-1 (Logger.debug). Run all unit tests after E-6 to verify Red→Green across the full test suite.

---

### Phase F: Integration tests

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F-1 | Write and implement integration tests IT-01 through IT-05: IT-01 new feature (0 prior turns) auto-inits and enters managed path; IT-02 old feature (3 prior turns) routes legacy; IT-03 keyword parsing end-to-end (`[fullstack]` → correct discipline in state); IT-04 `initializeFeature()` failure halts routing loop — **extended per gap #4 (PROP-PI-22):** after asserting the first invocation halts, clear the fake error and invoke the routing loop a second time; assert it succeeds, calls `initializeFeature()` again, and enters the managed path (verifies no permanent blockage after transient failure); IT-05 two routing loop invocations for same slug both with `isManaged → false` → `initializeFeature` called twice, single state record, no config overwrite (AT-PI-04 observable) | `ptah/tests/integration/orchestrator/pdlc-auto-init.test.ts` [NEW] | (no new source files — exercises existing orchestrator with all fakes) | ⬚ Not Started |
| F-2 | Write and implement latency benchmark smoke test for REQ-NF-01: invoke the auto-init block 100 times via the integration harness (with FakeStateStore, FakeLogger, FakePdlcDispatcher — no real I/O); measure wall-clock time per invocation; assert p95 < 100ms. Can be appended to `pdlc-auto-init.test.ts` as a separate `describe` block and skipped in standard CI runs via a `PERF_TEST=true` environment flag. Addresses PM F-01 Option B and PROP-NF-02 | `ptah/tests/integration/orchestrator/pdlc-auto-init.test.ts` | (no new source files) | ⬚ Not Started |

**Dependency note:** F-1 and F-2 depend on all of Phases A–E being complete. Integration tests use the full orchestrator setup with all fakes wired together.

---

## 3. Task Dependency Notes

```
A-1 (Logger.debug interface)
  └─→ A-2 (FakeLogger.debug)
        ├─→ B-1/B-2/B-3/B-4/B-5/B-6 (pure helpers — need typed FakeLogger for AG tests)
        ├─→ C-2 (FakePdlcDispatcher — needs typed FakeLogger in orchestrator tests)
        └─→ D-1 (pdlc-dispatcher idempotency tests — need FakeLogger.debug)

C-1 (factory helpers)
  └─→ B-5 (evaluateAgeGuard tests use createBotMessageWithRouting)

C-3 (FakeStateStore.saveCount)
  └─→ D-1 (idempotency tests assert saveCount === 1)

A-1 + B-2 + B-4 + B-6 (helpers in orchestrator.ts)
  └─→ D-2 (idempotency guard in pdlc-dispatcher uses Logger.debug)

C-2 (FakePdlcDispatcher updated)
  └─→ E-1/E-2/E-3/E-4/E-5 (orchestrator unit tests — need initializeFeatureCalls etc.)

B-2 + B-4 + B-6 + D-2 + A-1 (all helpers + idempotency guard)
  └─→ E-6 (orchestrator auto-init implementation)

All of A–E
  └─→ F-1 (integration tests)
  └─→ F-2 (latency benchmark, same file, depends on F-1 harness)
```

**Parallelism opportunities:**
- C-1, C-3 can run in parallel with B-1/B-3/B-5 once A-2 is done.
- B-1/B-2, B-3/B-4, B-5/B-6 are independent red/green pairs within Phase B.
- E-1 through E-5 (test-writing) can be written in parallel once C-2 is done.

---

## 4. Integration Points

### Existing code affected

| Module | File | Change |
|--------|------|--------|
| Logger interface + ConsoleLogger | `ptah/src/services/logger.ts` | Add `debug()` method — non-breaking change (all existing callers are unaffected; all concrete implementations must implement the new method) |
| `DefaultPdlcDispatcher.initializeFeature()` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | Add check-before-write idempotency guard at top of method — existing behavior unchanged for all non-duplicate calls |
| `executeRoutingLoop()` | `ptah/src/orchestrator/orchestrator.ts` | Replace single-line slug resolution + `const isManaged` with expanded auto-init block using `effectivelyManaged` flag — the downstream `if (isManaged)` branch and legacy path remain structurally intact; only the pre-gate logic changes |
| `FakeLogger` | `ptah/tests/fixtures/factories.ts` | Add `debug()` method — required for TypeScript compliance once `Logger` interface gains `debug` |
| `FakePdlcDispatcher` | `ptah/tests/fixtures/factories.ts` | Extend with `initializeFeatureCalls`, `initError`, `autoRegisterOnInit` — additive, no existing tests broken |
| `FakeStateStore` | `ptah/tests/fixtures/factories.ts` | Confirm or add `saveCount` — if already present (Feature 011), no change |

### Feature 011 modules NOT touched

`state-machine.ts`, `state-store.ts`, `review-tracker.ts`, `phases.ts`, `context-matrix.ts`, `cross-review-parser.ts`, `migrations.ts` — per constraint C-01.

### Test files NOT touched (Feature 011 suite)

All existing Feature 011 unit and integration tests must continue to pass without modification. If a test file imports `Logger` or `FakeLogger` and TypeScript begins failing because `debug()` is missing, that test file must be updated to add the stub method (per §4.3: "Any test stubs that implement `Logger` must also add the stub method").

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (REQ-PI-01–05, REQ-BC-01–02, REQ-DC-01–03, REQ-NF-01, REQ-NF-02–03)
- [ ] REQ-NF-01 latency — covered by F-2 benchmark; assert p95 < 100ms across 100 runs with fakes (run with `PERF_TEST=true npx vitest run`)
- [ ] Implementation matches TSPEC: `countPriorAgentTurns`, `parseKeywords`, `evaluateAgeGuard` behave per §4.4; auto-init block in `executeRoutingLoop()` matches §4.4.3; idempotency guard in `initializeFeature()` matches §4.4.5
- [ ] Feature 011 test suite continues to pass — 1068 existing tests unmodified (REQ-NF-03)
- [ ] No changes to `state-machine.ts`, `state-store.ts`, `review-tracker.ts`, `phases.ts`, `context-matrix.ts`, `cross-review-parser.ts`, `migrations.ts` (C-01)
- [ ] State file schema unchanged — existing state files load without migration (REQ-NF-02)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
