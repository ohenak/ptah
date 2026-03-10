# Execution Plan: Phase 3 — Skill Routing — Track 4: Routing Engine

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the Routing Engine (Phase E) — signal parsing, human message resolution, and routing decision logic. This is pure logic with no external dependencies beyond types. It parses `<routing>` tags from agent responses, resolves Discord @mentions to agent IDs, and produces routing decisions that drive the orchestration loop.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `RoutingEngine` protocol, `RoutingSignalType`, `ThreadAction`, `RoutingSignal`, `RoutingDecision` types, `FakeLogger`.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `DefaultRoutingEngine` implementation | Convergence track (Orchestrator, Integration tests) |
| `RoutingParseError` error class | Convergence track (Orchestrator error handling) |
| `RoutingError` error class | Convergence track (Orchestrator error handling) |

---

## 4. Task List

### Phase E: Routing Engine (TDD)

Signal parsing, human message resolution, and routing decision logic. Uses no fakes — pure logic.

**Signal Parsing:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 37 | Parse valid `ROUTE_TO_AGENT` signal from `<routing>` tags — returns `RoutingSignal` with correct type, agentId, threadAction | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 38 | Parse valid `ROUTE_TO_USER` signal — returns signal with question field | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 39 | Parse valid `LGTM` and `TASK_COMPLETE` signals — returns terminal signals | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 40 | Missing routing signal — throws `RoutingParseError("missing routing signal")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 41 | Malformed JSON inside `<routing>` tags — throws `RoutingParseError` with parse details | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 42 | Multiple routing signals — uses first, logs warning (AT-RP-10). Requires Logger injection. | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 43 | Empty response (no text) — throws `RoutingParseError("missing routing signal")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 44 | Validation: `ROUTE_TO_AGENT` without `agent_id` throws; `ROUTE_TO_USER` without `question` throws | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 45 | `ROUTE_TO_AGENT` with missing `thread_action` defaults to `"reply"` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

**Human Message Resolution:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 46 | `resolveHumanMessage()` detects Discord role @mention and maps to agent ID via `config.discord.role_mentions` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 47 | No @mention detected — returns `null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 48 | Unknown role ID (not in config) — returns `null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

**Routing Decision:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 49 | `decide()` for `ROUTE_TO_AGENT` with `reply` — returns decision with `targetAgentId`, `isTerminal: false`, `createNewThread: false` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 50 | `decide()` for `ROUTE_TO_AGENT` with `new_thread` — returns `createNewThread: true` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 51 | `decide()` for `ROUTE_TO_USER` — returns `isPaused: true`, `isTerminal: false`, `targetAgentId: null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 52 | `decide()` for `LGTM` / `TASK_COMPLETE` — returns `isTerminal: true`, `targetAgentId: null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 53 | `decide()` for unknown agent — throws `RoutingError("unknown agent '{id}'")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 54 | `decide()` allows self-routing (agent routes to itself) — valid, returns normally | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 18 tasks (Tasks 37–54) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Token Counter + Context Assembler, Thread Queue, Response Poster, Skill Invoker, Service Implementations.*
