# Test Properties Document

## PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-013 |
| **Requirements** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.2, Approved) |
| **Specifications** | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (v1.2, Approved) · [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) (v1.2, Approved) |
| **Execution Plan** | [013-PLAN-TSPEC-pdlc-auto-init](013-PLAN-TSPEC-pdlc-auto-init.md) |
| **Version** | 1.0 |
| **Date** | 2026-03-15 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

This document catalogs the testable properties of the PDLC Auto-Initialization feature (Feature 013). The feature wires `initializeFeature()` into the orchestrator's `executeRoutingLoop()` so that new features are automatically registered in the PDLC state machine on first encounter, closing a gap left by Feature 011 where `isManaged()` always returned false and every feature fell through to the unmanaged/legacy routing path.

The implementation touches three source files: `orchestrator.ts` (auto-init decision flow), `pdlc-dispatcher.ts` (idempotency guard), and `logger.ts` (new `debug()` method). Three pure helper functions are introduced: `countPriorAgentTurns`, `parseKeywords`, and `evaluateAgeGuard`.

### 1.1 Scope

**In scope:**
- Auto-initialization decision flow in `executeRoutingLoop()` — eligibility check, age guard, keyword parsing, `initializeFeature()` call
- `countPriorAgentTurns` helper — filtering prior agent turns from conversation history
- `parseKeywords` helper — extracting discipline and skip-fspec keywords from initial message
- `evaluateAgeGuard` helper — applying the age guard threshold
- Idempotency guard in `DefaultPdlcDispatcher.initializeFeature()`
- `Logger.debug()` interface extension and all concrete implementations
- Logging and debug channel notifications for all auto-init events
- Backward compatibility — existing unmanaged features continue on the legacy path

**Out of scope:**
- Feature 011 modules (`state-machine.ts`, `state-store.ts`, `review-tracker.ts`, `phases.ts`, `context-matrix.ts`, `cross-review-parser.ts`, `migrations.ts`) — unchanged per C-01
- State file schema or `FeatureConfig`/`FeatureState` type shape — no changes
- Phase-skip runtime behavior when `skipFspec: true` — owned by Feature 011's state machine
- Thread-name keyword scanning — deferred per TSPEC OQ-02

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 13 | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (10 functional + 3 NFR across domains PI, BC, DC, NF) |
| Specifications analyzed | 4 | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (FSPEC-PI-01, FSPEC-BC-01, FSPEC-DC-01) + [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) |
| Plan tasks reviewed | 21 | [013-PLAN-TSPEC-pdlc-auto-init](013-PLAN-TSPEC-pdlc-auto-init.md) (Phases A–F) |
| Integration boundaries identified | 3 | `orchestrator.ts` → `PdlcDispatcher.initializeFeature()` · `orchestrator.ts` → `DiscordClient.postChannelMessage()` · `DefaultPdlcDispatcher` → `StateStore.save()` |
| Implementation files reviewed | 3 | `orchestrator.ts`, `pdlc-dispatcher.ts`, `logger.ts` (not yet implemented) |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 15 | REQ-PI-01, REQ-PI-02, REQ-BC-01, REQ-DC-01, REQ-DC-02 | Unit |
| Contract | 2 | REQ-NF-03, TSPEC §4.3 | Unit |
| Error Handling | 6 | REQ-PI-01, REQ-PI-03, REQ-PI-04, REQ-BC-01, REQ-DC-01 | Unit |
| Data Integrity | 4 | REQ-PI-01, REQ-DC-01, REQ-DC-03, REQ-NF-02 | Unit |
| Integration | 4 | REQ-PI-01, REQ-PI-05, REQ-BC-01 | Integration |
| Performance | 1 | REQ-NF-01 | Integration |
| Idempotency | 5 | REQ-PI-05, REQ-DC-02 | Unit |
| Observability | 6 | REQ-PI-03, REQ-PI-04, REQ-BC-02 | Unit |
| **Total** | **43** | | |

---

## 3. Properties

**ID format:** `PROP-{DOMAIN}-{NUMBER}` — domain prefix matches the source requirement domain (PI = PDLC Initialization; BC = Backward Compatibility; DC = Discipline Configuration; NF = Non-Functional).

**Priority:** Inherited from the highest-priority linked requirement.

---

### 3.1 Functional Properties

Core business logic and behavior — all verifiable at the unit test level with fakes.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-01 | `executeRoutingLoop` must call `initializeFeature()` when `isManaged()` returns false and the age guard reports eligible | [REQ-PI-01], [FSPEC-PI-01] | Unit | P0 |
| PROP-PI-02 | `executeRoutingLoop` must process the routing signal that triggered auto-initialization through the managed PDLC path (not the legacy path) immediately after successful initialization | [REQ-PI-01], [FSPEC-PI-01 BR-PI-02] | Unit | P0 |
| PROP-PI-03 | `executeRoutingLoop` must initialize new features at `REQ_CREATION` phase only — there is no mechanism to initialize at any other phase | [REQ-PI-01], [FSPEC-PI-01 BR-PI-04] | Unit | P0 |
| PROP-BC-01 | `evaluateAgeGuard` must return `{ eligible: true }` when the conversation history contains 0 prior agent turns | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-02 | `evaluateAgeGuard` must return `{ eligible: true }` when the conversation history contains exactly 1 prior agent turn (inclusive boundary — threshold is 1) | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-03 | `evaluateAgeGuard` must return `{ eligible: false, turnCount: 2 }` when the conversation history contains exactly 2 prior agent turns (exclusive boundary — 2 is the first ineligible count) | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-04 | `executeRoutingLoop` must route to the legacy path (`RoutingEngine.decide()`) when the age guard returns ineligible | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-05 | `countPriorAgentTurns` must count only messages where `isBot === true` AND `content` includes the literal string `<routing>` | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-06 | `countPriorAgentTurns` must return `0` for an empty conversation history | [FSPEC-BC-01], [TSPEC §4.4.1] | Unit | P0 |
| PROP-BC-07 | `countPriorAgentTurns` must exclude bot messages that do not contain a `<routing>` tag (orchestrator progress embeds, completion embeds, debug notifications) | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-DC-01 | `parseKeywords` must return `{ discipline: "backend-only", skipFspec: false }` when the message contains no recognized keywords | [REQ-PI-02], [REQ-DC-01], [FSPEC-DC-01] | Unit | P0 |
| PROP-DC-02 | `parseKeywords` must set `discipline: "fullstack"` when the message contains the exact token `[fullstack]` | [REQ-DC-01], [FSPEC-DC-01] | Unit | P1 |
| PROP-DC-03 | `parseKeywords` must set `discipline: "frontend-only"` when the message contains the exact token `[frontend-only]` | [REQ-DC-01], [FSPEC-DC-01] | Unit | P1 |
| PROP-DC-04 | `parseKeywords` must set `skipFspec: true` when the message contains the exact token `[skip-fspec]` | [REQ-DC-02], [FSPEC-DC-01] | Unit | P1 |
| PROP-DC-05 | `parseKeywords` must use the last discipline keyword when multiple discipline keywords appear in the same message (left-to-right, last-wins) | [REQ-DC-01], [FSPEC-DC-01 BR-DC-02] | Unit | P1 |

---

### 3.2 Contract Properties

Protocol compliance and interface shape — verifiable at unit level by inspecting the TypeScript interface.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-04 | `Logger` interface must declare `debug(message: string): void` as a required method | [TSPEC §4.3], [REQ-BC-02] | Unit | P0 |
| PROP-PI-05 | All concrete `Logger` implementations (`ConsoleLogger`, `FakeLogger`, and any test stubs) must implement `debug()` — `ConsoleLogger.debug` must delegate to `console.debug`; `FakeLogger.debug` must capture `{ level: "debug", message }` into `this.messages` | [TSPEC §4.3], [REQ-NF-03] | Unit | P0 |

---

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-06 | `executeRoutingLoop` must log an error with the feature slug and error details and halt the routing loop (neither managed nor legacy path invoked) when `initializeFeature()` throws | [REQ-PI-01], [FSPEC-PI-01 BR-PI-03], [FSPEC-PI-01 error scenarios] | Unit | P0 |
| PROP-PI-07 | `executeRoutingLoop` must fall through to the legacy path (without attempting auto-initialization or evaluating the age guard) when the feature slug is unresolvable — a falsy result or thrown exception from `featureNameToSlug(extractFeatureName(threadName))` per A-06 | [REQ-PI-01], [A-06] | Unit | P0 |
| PROP-PI-08 | `executeRoutingLoop` must swallow any error thrown by `logger.info()` during the auto-init success log emission and proceed with routing to the managed PDLC path normally | [REQ-PI-03], [FSPEC-PI-01 AT-PI-05] | Unit | P0 |
| PROP-PI-09 | `executeRoutingLoop` must log a warning and continue routing normally when the debug channel notification post fails — the feature remains initialized and the routing signal is processed | [REQ-PI-04], [FSPEC-PI-01 error scenarios] | Unit | P1 |
| PROP-BC-08 | `evaluateAgeGuard` must return `{ eligible: true }` (fail-open) and emit a warning log when `countPriorAgentTurns` throws — it is better to incorrectly auto-initialize than to block a new feature | [FSPEC-BC-01 error scenarios] | Unit | P1 |
| PROP-DC-06 | `parseKeywords` must not throw when the input is `null`, `undefined`, or the empty string — it must return the default config `{ discipline: "backend-only", skipFspec: false }` | [FSPEC-DC-01 error scenarios], [TSPEC §4.4.2] | Unit | P0 |

---

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and no data loss.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-10 | `executeRoutingLoop` must pass the content of the **first user-authored message** (`isBot === false`) from conversation history to `parseKeywords` — not the thread name, not the triggering signal's content, and not any bot message | [FSPEC-PI-01 Input], [FSPEC-DC-01 BR-DC-06] | Unit | P0 |
| PROP-NF-01 | The auto-init implementation must not modify the `FeatureConfig` or `FeatureState` type shape — existing state files created by Feature 011 must load without migration or type errors | [REQ-NF-02] | Unit | P0 |
| PROP-DC-07 | `parseKeywords` must treat `[FULLSTACK]`, `[Fullstack]`, `[Backend-Only]`, and `[ fullstack ]` (space-padded) as unrecognized tokens and apply the default discipline — matching is case-sensitive and requires no interior whitespace | [REQ-DC-01], [FSPEC-DC-01 BR-DC-01] | Unit | P1 |
| PROP-DC-08 | `parseKeywords` must silently ignore any square-bracketed token that is not a recognized keyword — no error is thrown, no warning is emitted | [REQ-DC-03], [FSPEC-DC-01 BR-DC-05] | Unit | P1 |

---

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition — verified with all fakes wired together.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-20 | The full auto-init flow must wire `evaluateAgeGuard` → `parseKeywords` → `initializeFeature()` in order: a new feature thread (0 prior turns) with initial message `"@pm create REQ [fullstack]"` must be registered with `{ discipline: "fullstack", skipFspec: false }` and routed through the managed PDLC path | [REQ-PI-01], [REQ-DC-01], [FSPEC-PI-01] | Integration | P0 |
| PROP-PI-21 | Two concurrent routing loop invocations for the same new feature slug (different Discord threads resolving to the same slug) must produce exactly one state record — the second `initializeFeature()` call must detect the existing record, emit the concurrent-request debug log, and proceed normally through the managed path | [REQ-PI-05], [FSPEC-PI-01 AT-PI-04] | Integration | P0 |
| PROP-BC-10 | An existing unmanaged feature thread with 2 or more prior agent turns must route through `RoutingEngine.decide()` (legacy path) — it must not enter the managed PDLC path after the age guard evaluation | [REQ-BC-01], [FSPEC-BC-01] | Integration | P0 |
| PROP-PI-22 | An `initializeFeature()` failure must halt routing for the current message without invoking managed or legacy path — the next message to the same thread must be retried from scratch and succeed if the underlying failure is transient | [REQ-PI-01], [FSPEC-PI-01 error scenarios] | Integration | P1 |

---

### 3.6 Performance Properties

Response times and resource limits.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-NF-02 | The auto-init block — from eligibility check entry to the return of `initializeFeature()` — must complete within 100ms at p95 measured as wall-clock time across 100 runs in the CI test environment | [REQ-NF-01] | Integration | P1 |

---

### 3.7 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-11 | `DefaultPdlcDispatcher.initializeFeature()` must return the existing `FeatureState` without modification when called a second time for the same slug | [REQ-PI-05], [FSPEC-PI-01 edge cases] | Unit | P0 |
| PROP-PI-12 | `DefaultPdlcDispatcher.initializeFeature()` must not throw when an existing record is detected — the second call resolves normally | [REQ-PI-05] | Unit | P0 |
| PROP-PI-13 | `DefaultPdlcDispatcher.initializeFeature()` must call `stateStore.save()` exactly once across two invocations for the same slug — the second call skips the save entirely | [REQ-PI-05], [TSPEC §4.4.5] | Unit | P0 |
| PROP-PI-14 | `DefaultPdlcDispatcher.initializeFeature()` must not overwrite the existing `config` when called a second time with a different `FeatureConfig` — the first config is preserved | [REQ-PI-05], [TSPEC §4.4.5] | Unit | P0 |
| PROP-DC-09 | `parseKeywords` must return `{ ..., skipFspec: true }` regardless of how many times `[skip-fspec]` appears in the message — the result is identical to a single occurrence | [FSPEC-DC-01 BR-DC-06], [TSPEC §4.4.2] | Unit | P1 |

---

### 3.8 Observability Properties

Logging and error reporting — assertable via `FakeLogger.messages`.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-15 | `executeRoutingLoop` must emit an info-level log with the exact format `[ptah] Auto-initialized PDLC state for feature "{featureSlug}" with discipline "{discipline}"` after a successful `initializeFeature()` call | [REQ-PI-03] | Unit | P0 |
| PROP-PI-16 | `executeRoutingLoop` must emit the info-level log (PROP-PI-15) **before** posting the debug channel notification (PROP-PI-17) — ordering is required by [REQ-PI-03] | [REQ-PI-03] | Unit | P0 |
| PROP-PI-17 | `executeRoutingLoop` must post a message to the debug channel with the exact format `[ptah] PDLC auto-init: feature "{featureSlug}" registered with discipline "{discipline}", starting at REQ_CREATION` after successful initialization | [REQ-PI-04], [FSPEC-PI-01 Output] | Unit | P1 |
| PROP-BC-09 | `executeRoutingLoop` must emit a debug-level log with the exact format `[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has {turnCount} prior turns (threshold: 1)` when the age guard returns ineligible — the log level must be `debug` (not `info` or `warn`), assertable via `FakeLogger.messages` | [REQ-BC-02] | Unit | P1 |
| PROP-PI-18 | `DefaultPdlcDispatcher.initializeFeature()` must emit a debug-level log with the exact format `[ptah] PDLC auto-init skipped: "{featureSlug}" already initialized (concurrent request)` when a second call detects an existing record — this provides a deterministic observable artifact for tests without requiring filesystem inspection | [FSPEC-PI-01 edge cases (race condition row)] | Unit | P1 |
| PROP-PI-19 | `executeRoutingLoop` must emit an error-level log containing the feature slug and the error message/details when `initializeFeature()` throws | [FSPEC-PI-01 error scenarios] | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PI-N01 | `executeRoutingLoop` must NOT call `initializeFeature()` when `isManaged()` returns true for the feature slug — already-managed features must proceed directly to the managed PDLC path | [REQ-PI-01], [FSPEC-PI-01 AT-PI-02] | Unit | P0 |
| PROP-PI-N02 | `executeRoutingLoop` must NOT route to the managed PDLC path when `initializeFeature()` throws — routing halts for the current message entirely | [REQ-PI-01], [FSPEC-PI-01 BR-PI-03] | Unit | P0 |
| PROP-PI-N03 | `executeRoutingLoop` must NOT route to the legacy path when `initializeFeature()` throws — neither path is invoked; routing halts | [REQ-PI-01], [FSPEC-PI-01 BR-PI-03] | Unit | P0 |
| PROP-PI-N04 | `executeRoutingLoop` must NOT attempt auto-initialization and must NOT evaluate the age guard when the feature slug is unresolvable (falsy value or thrown exception from slug resolution per A-06) | [REQ-PI-01], [A-06] | Unit | P0 |
| PROP-BC-N01 | `executeRoutingLoop` must NOT auto-initialize a feature when the thread has 2 or more prior agent turns — the feature must continue on the legacy path | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-BC-N02 | `countPriorAgentTurns` must NOT count bot messages that lack a `<routing>` tag — orchestrator progress embeds, completion embeds, and debug notifications must be excluded | [REQ-BC-01], [FSPEC-BC-01] | Unit | P0 |
| PROP-PI-N05 | `DefaultPdlcDispatcher.initializeFeature()` must NOT overwrite an existing state record's config, phase, or any other field when called a second time with a different `FeatureConfig` | [REQ-PI-05], [TSPEC §4.4.5] | Unit | P0 |
| PROP-DC-N01 | `parseKeywords` must NOT recognize case variants (`[FULLSTACK]`, `[Fullstack]`) or space-padded forms (`[ fullstack ]`) as valid discipline keywords — matching must be exact, case-sensitive, and no interior whitespace | [REQ-DC-01], [FSPEC-DC-01 BR-DC-01] | Unit | P1 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Priority | Properties | Coverage |
|-------------|----------|------------|----------|
| REQ-PI-01 — Auto-initialize on first signal | P0 | PROP-PI-01, PROP-PI-02, PROP-PI-03, PROP-PI-06, PROP-PI-07, PROP-PI-19, PROP-PI-20, PROP-PI-22, PROP-PI-N01, PROP-PI-N02, PROP-PI-N03, PROP-PI-N04 | Full |
| REQ-PI-02 — Default feature configuration | P0 | PROP-DC-01 | Full |
| REQ-PI-03 — Log auto-initialization | P0 | PROP-PI-08, PROP-PI-15, PROP-PI-16 | Full |
| REQ-PI-04 — Post debug channel notification | P1 | PROP-PI-09, PROP-PI-17 | Full |
| REQ-PI-05 — Idempotent initialization | P0 | PROP-PI-11, PROP-PI-12, PROP-PI-13, PROP-PI-14, PROP-PI-18, PROP-PI-21, PROP-PI-N05 | Full |
| REQ-BC-01 — Feature age guard | P0 | PROP-BC-01, PROP-BC-02, PROP-BC-03, PROP-BC-04, PROP-BC-05, PROP-BC-06, PROP-BC-07, PROP-BC-10, PROP-BC-N01, PROP-BC-N02 | Full |
| REQ-BC-02 — Log skipped initialization | P1 | PROP-BC-09 | Full |
| REQ-DC-01 — Discipline keyword in thread message | P1 | PROP-DC-01, PROP-DC-02, PROP-DC-03, PROP-DC-05, PROP-DC-07, PROP-DC-N01 | Full |
| REQ-DC-02 — Skip-FSPEC keyword | P1 | PROP-DC-04 | Full |
| REQ-DC-03 — Unknown keyword ignored | P1 | PROP-DC-08 | Full |
| REQ-NF-01 — Initialization latency ≤ 100ms p95 | P1 | PROP-NF-02 | Full |
| REQ-NF-02 — No state schema change | P0 | PROP-NF-01 | Full |
| REQ-NF-03 — Test coverage | P0 | All P0 properties have unit tests; all new code paths covered — this properties document, the PLAN's unit test tasks, and the integration suite satisfy this requirement | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-PI-01 — Auto-Initialization Decision Flow | PROP-PI-01 through PROP-PI-10, PROP-PI-15 through PROP-PI-22, PROP-PI-N01 through PROP-PI-N05 | Full |
| FSPEC-BC-01 — Age Guard Evaluation | PROP-BC-01 through PROP-BC-10, PROP-BC-N01, PROP-BC-N02 | Full |
| FSPEC-DC-01 — Feature Configuration Keyword Parsing | PROP-DC-01 through PROP-DC-09, PROP-DC-N01 | Full |
| TSPEC §4.3 — Logger interface (debug method) | PROP-PI-04, PROP-PI-05 | Full |
| TSPEC §4.4.1 — `countPriorAgentTurns` | PROP-BC-05, PROP-BC-06, PROP-BC-07, PROP-BC-N02 | Full |
| TSPEC §4.4.2 — `parseKeywords` | PROP-DC-01 through PROP-DC-09, PROP-DC-N01 | Full |
| TSPEC §4.4.3 — Auto-init block in `executeRoutingLoop()` | PROP-PI-01 through PROP-PI-03, PROP-PI-06 through PROP-PI-10, PROP-PI-15 through PROP-PI-19, PROP-PI-N01 through PROP-PI-N04 | Full |
| TSPEC §4.4.5 — Idempotency guard in `initializeFeature()` | PROP-PI-11 through PROP-PI-14, PROP-PI-18, PROP-PI-N05 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 6 | 6 | 0 | 0 |
| P1 | 7 | 7 | 0 | 0 |
| P2 | 0 | — | — | — |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 — no E2E tests required; all paths covered at unit/integration
       /----------\
      / Integration \      5 properties — cross-module wiring + concurrency + performance
     /----------------\
    /    Unit Tests     \  38 properties — all helpers, error paths, observability
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 38 | 88.4% |
| Integration | 5 | 11.6% |
| E2E (candidates) | 0 | 0% |
| **Total** | **43** | **100%** |

**E2E rationale:** No E2E tests are warranted. All critical paths — including the full auto-init flow, concurrency handling, backward compatibility, and error propagation — are fully coverable at the unit and integration levels using the `FakePdlcDispatcher`, `FakeLogger`, and `FakeStateStore` test doubles defined in the PLAN. The integration tests (Phase F of the PLAN) exercise the full orchestrator routing loop with all fakes wired together, which is equivalent in coverage value to an E2E test for this feature.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | PROP-PI-10 (initial message sourcing) has no explicit unit test ID in the PLAN — the PLAN's E-1 through E-4 focus on keyword parsing results but do not assert which message is passed to `parseKeywords` | If the wrong message (e.g., thread name or a bot message) is passed to `parseKeywords`, keyword detection would silently fail on valid initial messages | Medium | Add an assertion in UT-ORC-AI-01 that `parseKeywords` receives the first `isBot === false` message content, not the thread name. Consider a dedicated test `"should extract config keywords from first user message (isBot===false), not from thread name or bot messages"`. |
| 2 | PROP-PI-16 (info log ordering before debug channel post) is not explicitly asserted in any PLAN task — E-1 tests that logging occurs but not the relative ordering vs. channel post | If the channel post executes first and the logger errors out, the ordering invariant from REQ-PI-03 is violated silently | Low | Add an ordering assertion to UT-ORC-AI-01 or a dedicated test that verifies `FakeLogger.messages` contains the info log entry **before** `FakeDiscordClient.postedMessages` contains the debug notification. |
| 3 | PROP-BC-08 (age guard fail-open behavior) traces to FSPEC-BC-01 error scenarios but has no matching PLAN task ID — the age guard tests (B-5, UT-AG-01 through UT-AG-06) cover boundary conditions but UT-AG-06 description mentions `countPriorAgentTurns throws → fail-open + warn log` which covers this | Risk is low if UT-AG-06 is implemented as specified | Low | Confirm UT-AG-06 implementation explicitly asserts: (1) return value is `{ eligible: true }`, (2) `logger.warn` was called with the malformed history message. No new task needed — ensure existing task B-5/B-6 covers it. |
| 4 | PROP-PI-22 (retry semantics after init failure) is covered by the integration test IT-04 but the "retry succeeds on next message" half of the invariant requires the test to invoke the routing loop a second time with a fixed-up fake — the PLAN's IT-04 description only covers the failure path | If retry is not tested, a regression where the orchestrator permanently blocks a feature after one transient failure would go undetected | Low | Extend IT-04 to include a second routing loop invocation after the fake error is cleared. Assert the second invocation initializes successfully and enters the managed path. |
| 5 | REQ-NF-01 (latency ≤ 100ms p95) has a corresponding property (PROP-NF-02) but no PLAN task — no integration test task benchmarks the auto-init block | If `FileStateStore.save()` degrades in CI (e.g., slow disk), the latency requirement could be silently violated | Low | Add a performance smoke test (optional in CI, always in the definition-of-done checklist) that calls `initializeFeature()` 100 times via the integration harness and asserts p95 < 100ms. Can be a short addition to IT-05. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Technical Lead | — | — | Pending |
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Test Engineer | Initial properties document — 43 positive properties + 8 negative properties across 8 categories; full coverage of 13 requirements and 8 FSPEC/TSPEC sections; 5 gap recommendations |

---

*End of Document*
