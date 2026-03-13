# Execution Plan: Phase 3 — Skill Routing — Track 8: Convergence

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Convergence track that brings together all parallel tracks into the Orchestrator (Phase I), Config & Composition (Phase K), and Integration Tests (Phase L). This track CANNOT start until all 6 parallel tracks have completed, as the Orchestrator depends on every module produced by those tracks.

---

## 2. Prerequisites

**ALL of the following tracks must be complete before this track begins:**

| Prerequisite | Track | Key Outputs Needed |
|-------------|-------|-------------------|
| Phase A + B (Foundation) | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) | All types, protocols, fakes |
| Phase C + F (Token Counter + Context Assembler) | [Token Counter + Context Assembler](003b-PLAN-TSPEC-ptah-skill-routing-token-counter-context-assembler.md) | `CharTokenCounter`, `DefaultContextAssembler` |
| Phase D (Thread Queue) | [Thread Queue](003c-PLAN-TSPEC-ptah-skill-routing-thread-queue.md) | `InMemoryThreadQueue` |
| Phase E (Routing Engine) | [Routing Engine](003d-PLAN-TSPEC-ptah-skill-routing-routing-engine.md) | `DefaultRoutingEngine`, `RoutingParseError`, `RoutingError` |
| Phase G (Response Poster) | [Response Poster](003e-PLAN-TSPEC-ptah-skill-routing-response-poster.md) | `DefaultResponsePoster` |
| Phase H (Skill Invoker) | [Skill Invoker](003f-PLAN-TSPEC-ptah-skill-routing-skill-invoker.md) | `DefaultSkillInvoker`, `InvocationTimeoutError`, `InvocationError` |
| Phase J (Service Implementations) | [Service Implementations](003g-PLAN-TSPEC-ptah-skill-routing-service-implementations.md) | `ClaudeCodeClient`, extended `DiscordJsClient`, `NodeGitClient`, `NodeFileSystem` |

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `DefaultOrchestrator` implementation | Production runtime |
| Updated `StartCommand` | Production runtime |
| Updated composition root (`bin/ptah.ts`) | Production runtime |
| Integration test suite | CI/CD pipeline |

---

## 4. Task List

### Phase I: Orchestrator (TDD)

Main message processing loop. Uses all fakes: `FakeRoutingEngine`, `FakeContextAssembler`, `FakeSkillInvoker`, `FakeResponsePoster`, `FakeDiscordClient`, `FakeLogger`, plus `InMemoryThreadQueue` (real implementation).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 103 | Bot messages ignored — `message.isBot === true` → no processing (AT-RP-07) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 104 | Human message with @mention — resolves agent ID, reads history, assembles context, invokes skill, posts response (full happy path AT-E2E-01 at unit level) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 105 | Human message with no @mention — posts system message asking user to specify target agent (AT-RP-09) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 106 | ROUTE_TO_AGENT with reply — loops back to context assembly with new agentId (routing loop continuation) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 107 | ROUTE_TO_AGENT with new_thread — creates coordination thread, enqueues processing for new thread (AT-RP new thread) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 108 | ROUTE_TO_USER — posts system message with question, thread paused (AT-RP-04) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 109 | LGTM terminal signal — posts completion embed, no further routing (AT-RP-03). Also covers AT-RPC-03 (early LGTM at Turn 2 in review context) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 110 | TASK_COMPLETE terminal signal — posts completion embed, no further routing (AT-RP-06) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 111 | Routing parse error — posts error embed "Routing error: {details}", no agent invoked (AT-RP-02) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 112 | Skill invocation timeout — posts error embed "Skill invocation timed out (>90s)" | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 113 | Skill invocation API error — posts error embed "Skill invocation failed: {error}" | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 114 | Per-thread sequential processing via ThreadQueue — verifies `handleMessage` enqueues tasks (AT-RP-12, AT-RP-13) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 115 | `startup()` calls `skillInvoker.pruneOrphanedWorktrees()` and resolves debug channel. `pruneOrphanedWorktrees()` failure is best-effort — log warning, continue startup (SI-R9, Q-01 resolved) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase K: Config & Composition (TDD)

Config loader validation updates, defaults updates, StartCommand update, and composition root wiring.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 133 | `NodeConfigLoader` validates `agents.active` is non-empty array and `agents.skills` is non-empty object | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ⬚ Not Started |
| 134 | `NodeConfigLoader` applies defaults for new optional fields: `agents.colours`, `agents.role_mentions`, `orchestrator.token_budget` | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ⬚ Not Started |
| 135 | `buildConfig()` in `defaults.ts` includes `agents.colours` and `agents.role_mentions` placeholder in generated config | — | `ptah/src/config/defaults.ts` | ⬚ Not Started |
| 136 | `StartCommand` constructor accepts `Orchestrator` as 4th parameter; `execute()` calls `orchestrator.startup()` before accepting messages and `orchestrator.handleMessage()` as the thread message handler (replaces logging handler) | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ⬚ Not Started |
| 137 | `StartCommand.execute()` validates Claude Code is available (e.g., checks `@anthropic-ai/claude-code` can be imported), throws with guidance if not | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ⬚ Not Started |
| 138 | Update composition root in `bin/ptah.ts` — wire all new services: `ClaudeCodeClient`, `NodeGitClient`, `CharTokenCounter`, `InMemoryThreadQueue`, `DefaultRoutingEngine`, `DefaultContextAssembler`, `DefaultSkillInvoker`, `DefaultResponsePoster`, `DefaultOrchestrator` | — | `ptah/bin/ptah.ts` | ⬚ Not Started |

### Phase L: Integration Tests

End-to-end routing loop using real internal modules with fakes for external boundaries.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 139 | Full routing loop — human message → route → assemble context → invoke skill → post response → parse routing → handle decision. Uses `FakeSkillClient`, `FakeDiscordClient`, real `DefaultRoutingEngine`, real `DefaultContextAssembler`, real `DefaultSkillInvoker` (with `FakeGitClient`), real `DefaultResponsePoster`. Includes assertion that no Discord IDs appear in any /docs content (AT-DI-03) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 140 | Multi-turn routing loop — ROUTE_TO_AGENT reply chains through 2 agents, ending with LGTM terminal signal | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 141 | Pattern C review loop integration — 4-turn review with Turn 3 final-review injection, ending with LGTM (AT-RPC-01 through AT-RPC-07 at integration level) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 142 | Pattern A agent-to-agent Q&A integration — PM asks Dev a question (ROUTE_TO_AGENT), Dev answers (ROUTE_TO_AGENT back to PM), PM receives Pattern A context bundle with task reminder + question + answer (AT-RPA-01 through AT-RPA-04 at integration level) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |

---

## 5. Task Dependency Notes

```
Phase I (Orchestrator) — depends on all parallel track outputs
  └── Phase K (Config & Composition) — depends on I
        └── Phase L (Integration) — depends on all implementations
```

Within this track, tasks are strictly sequential: Phase I must complete before Phase K, and Phase K must complete before Phase L.

---

## 6. Definition of Done

- [ ] All 23 tasks (Tasks 103–115, 133–142) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests (except deferred REQ-CB-06 task splitting — P1, tracked)
- [ ] Code reviewed against requirement acceptance criteria (61 FSPEC acceptance tests)
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*This track begins only after ALL parallel tracks (Token Counter + Context Assembler, Thread Queue, Routing Engine, Response Poster, Skill Invoker, Service Implementations) are complete.*
