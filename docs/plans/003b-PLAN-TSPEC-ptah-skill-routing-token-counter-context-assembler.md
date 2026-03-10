# Execution Plan: Phase 3 — Skill Routing — Track 2: Token Counter + Context Assembler

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the Token Counter (Phase C) and Context Assembler (Phase F) — the three-layer context assembly system with resume pattern detection and token budget enforcement. Phase C is a prerequisite for Phase F within this track; they run sequentially. This track can run in parallel with the Routing Engine, Thread Queue, Response Poster, Skill Invoker, and Service Implementations tracks.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `TokenCounter` protocol, `ContextAssembler` protocol, `ContextBundle`/`PatternAContext`/`PatternCContext`/`ResumePattern` types, `FakeFileSystem` (extended), `FakeTokenCounter`, `FakeLogger`.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `CharTokenCounter` implementation | Convergence track (Orchestrator composition) |
| `DefaultContextAssembler` implementation | Convergence track (Orchestrator, Integration tests) |

---

## 4. Task List

### Phase C: Token Counter (TDD)

Simple module with no dependencies — foundation for ContextAssembler.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 29 | `CharTokenCounter.count()` returns `Math.ceil(text.length / 4)` for typical text | `ptah/tests/unit/orchestrator/token-counter.test.ts` | `ptah/src/orchestrator/token-counter.ts` | ⬚ Not Started |
| 30 | `CharTokenCounter.count()` returns 0 for empty string, 1 for single character, correct value at exact multiples of 4 | `ptah/tests/unit/orchestrator/token-counter.test.ts` | `ptah/src/orchestrator/token-counter.ts` | ⬚ Not Started |

### Phase F: Context Assembler (TDD)

Three-layer context assembly with resume pattern detection and token budget enforcement. Uses `FakeFileSystem`, `FakeTokenCounter`, `FakeLogger`.

**Fresh Invocation:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 55 | Fresh invocation — Layer 1 contains role prompt + overview.md + two-iteration rule + routing instruction. Layer 2 contains fresh reads of feature folder files. Layer 3 contains trigger message verbatim. (AT-CB-01) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 56 | Feature name extraction — text before " — " (em dash); full name if no em dash (AT-CB-07, AT-CB-08) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 57 | overview.md deduplication — appears in Layer 1 only, excluded from Layer 2 (CB-R4, AT-CB-06) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Resume Pattern Detection:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 58 | Zero prior agent turns → `"fresh"` pattern | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 59 | Pattern A detection — most recent routing signal targets a different agent than the poster → `"pattern_a"` | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 60 | Pattern C detection — default when prior agent turns exist and Pattern A doesn't apply → `"pattern_c"` | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Pattern A — Agent-to-Agent Q&A:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 61 | Pattern A Layer 3: task reminder + question verbatim + answer verbatim (AT-RPA-01). Includes dedicated edge case: when task reminder cannot be determined from routing metadata, falls back to thread's first message (AT-RPA-03) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 62 | Multi-message question concatenation — consecutive messages from asking agent joined (AT-RPA-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 63 | No summarization — question and answer included verbatim regardless of length (AT-RPA-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Pattern C — Review Loop:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 64 | Turn counting — counts agent-posted embeds only, excludes human and system messages (AT-RPC-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 65 | Turn 1 Layer 3 — artifact to review verbatim, no prior turns, no final-review instruction (AT-RPC-05) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 66 | Turn 2 Layer 3 — Turn 1 + Turn 2 verbatim, no final-review instruction (AT-RPC-06) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 67 | Turn 3 Layer 3 — all prior turns + final-review instruction injected (AT-RPC-01, AT-RPC-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 68 | Turn 4 Layer 3 — all prior turns (max 3) + current turn, NO final-review instruction (AT-RPC-07) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 69 | Human messages between turns included as context but do not affect turn count (AT-RPC-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Token Budget Enforcement:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 70 | Layer 1 and Layer 3 never truncated — regardless of budget pressure (CB-R1, AT-CB-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 71 | Layer 2 truncated from least-relevant files first when over budget (AT-CB-12) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 72 | Layer 2 omitted entirely when Layer 1 + Layer 3 exceed 85% budget — log warning (AT-CB-09) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 73 | `test.skip` — REQ-CB-06 task splitting on budget overflow (AT-CB-05, P1 deferred). Placeholder test with reference to requirement and deferral rationale. Will be implemented when Phase 4 artifact persistence is available. | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | — | ⬚ Not Started |
| 74 | Token budget uses configurable percentages from `config.orchestrator.token_budget` (CB-R5) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Edge Cases:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 75 | Missing feature folder — Layer 2 empty, log warning, invocation proceeds (AT-CB-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 76 | Missing overview.md — Layer 1 contains only role prompt, log warning (AT-CB edge case) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 77 | Missing role prompt — throws error (fatal for this invocation) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 78 | Ambiguous thread name — exact match preferred, then longest prefix match, then Layer 2 empty (AT-CB-10) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 79 | Fresh artifact reads — Layer 2 reads from filesystem at invocation time, not cached (AT-CB-03) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 80 | Token counting fallback — when `TokenCounter.count()` throws, falls back to char-based estimation (`Math.ceil(text.length / 4)`), logs warning, proceeds normally (AT-CB-11) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 28 tasks (Tasks 29–30, 55–80) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests (except deferred REQ-CB-06 task splitting — P1, tracked)
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Thread Queue, Routing Engine, Response Poster, Skill Invoker, Service Implementations.*
