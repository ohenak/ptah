# Execution Plan: Phase 3 — Skill Routing — Track 3: Thread Queue

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the in-memory per-thread queue (Phase D). The `InMemoryThreadQueue` ensures same-thread messages are processed sequentially while allowing cross-thread concurrency. The production implementation is also used directly in tests (RP-R7 — no fake needed). This is a small, self-contained track with no dependencies beyond the foundation.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `ThreadQueue` protocol definition.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `InMemoryThreadQueue` implementation | Convergence track (Orchestrator uses real implementation, not a fake) |

---

## 4. Task List

### Phase D: Thread Queue (TDD)

In-memory per-thread queue. Production implementation also used in tests (RP-R7).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 31 | `InMemoryThreadQueue.enqueue()` runs task immediately when no other task is processing for the thread | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 32 | Same-thread tasks run sequentially — second task waits for first to complete | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 33 | Different-thread tasks run concurrently — tasks for thread A and thread B overlap in execution | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 34 | Error isolation — a failing task does not block the next queued task for the same thread | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 35 | `isProcessing()` returns true when a task is in-flight or queued, false otherwise | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |

Dedicated implementation test (non-trivial async logic):

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 36 | `InMemoryThreadQueue` dedicated test — verify sequential ordering with async resolution and error isolation | `ptah/tests/unit/orchestrator/thread-queue-impl.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 6 tasks (Tasks 31–36) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Token Counter + Context Assembler, Routing Engine, Response Poster, Skill Invoker, Service Implementations.*
