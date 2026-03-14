# Cross-Review: Backend Engineer — FSPEC-PTAH-PHASE6 (v1.3)

| Field | Detail |
|-------|--------|
| **Document Reviewed** | [006-FSPEC-ptah-guardrails.md](./006-FSPEC-ptah-guardrails.md) (v1.3) |
| **Reference Documents** | [006-REQ-PTAH-guardrails.md](./006-REQ-PTAH-guardrails.md) (v1.0), [006-TSPEC-ptah-guardrails.md](./006-TSPEC-ptah-guardrails.md) (v1.1) |
| **Reviewer** | Backend Engineer |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved** — FSPEC is technically feasible and implementable. One low-severity observation documented (F-01) requiring a TSPEC note; no FSPEC changes needed. |

---

## Summary

FSPEC v1.3 is technically implementable as written. All three behavioral clusters (retry with backoff, turn limit enforcement, graceful shutdown) map directly to implementable Node.js patterns using built-in APIs. The 23 business rules are unambiguous and internally consistent. The acceptance tests (AT-GR-01 through AT-GR-17) are fully verifiable with Vitest fake timers and injectable fakes.

One low-severity gap is noted: the FSPEC §5.2 Step 4 refers to checking "the main working directory" for uncommitted changes during shutdown, but the TSPEC's `WorktreeRegistry`-based implementation only covers active worktrees. This is documented as a TSPEC-level note (not an FSPEC defect) since GR-R23 makes the registry authoritative and the main working directory is not a valid artifact location in the Orchestrator's workflow.

---

## Findings

### F-01 (Low) — FSPEC §5.2 Step 4a mentions "main working directory" — TSPEC correctly narrows scope to worktree registry

**Location:** §5.2 Step 4a (FSPEC-GR-03 Graceful Shutdown behavioral flow)

**Description:**
FSPEC §5.2 Step 4a states the shutdown commit step checks for uncommitted changes in:
- "The main working directory"
- "Any active worktrees (if an invocation completed but the worktree was not yet merged/cleaned up)"

The TSPEC §5.3 Step 4 correctly implements the worktree enumeration via `worktreeRegistry.getAll()`, consistent with GR-R23: "The shutdown commit step discovers active worktrees from the Orchestrator's in-memory worktree registry... It does NOT scan the filesystem." However, the TSPEC omits any check of the "main working directory."

This is not a defect in the FSPEC — the FSPEC is consistent with itself: GR-R23 is the authoritative business rule and narrows the scope to the registry. The phrase "main working directory" in §5.2 Step 4a predates GR-R23 and refers to the same concept as "any active worktrees." In practice, the Orchestrator's main working directory does not accumulate uncommitted agent artifacts (those always go into worktrees), so checking it during shutdown adds no value.

**Impact:** None — the TSPEC's registry-based approach is correct per GR-R23. No regression risk.

**Resolution:** No FSPEC change required. TSPEC implementor should add a comment in `createShutdownHandler` clarifying that the main working directory is deliberately excluded per GR-R23.

---

## Clarification Questions

### Q-01 (Informational) — AT-GR-10 says "the Orchestrator initializes on startup" — does lazy reconstruction change this?

**Location:** FSPEC §4.7 AT-GR-10, TSPEC §5.2 (lazy reconstruction algorithm)

**Description:**
AT-GR-10 states: "GIVEN: The Orchestrator restarts — WHEN: I initialize on startup — THEN: I read the thread's Discord message history and set turn_count = 5."

The TSPEC implements lazy reconstruction: turn counts are reconstructed on the *first message* arriving from each thread after restart, not during startup initialization. This means AT-GR-10's "When: I initialize on startup" is not literally accurate — the reconstruction happens on first message arrival.

**Not blocking.** The TSPEC Q-01 resolution correctly explains this (lazy reconstruction matches AT-GR-10 semantics: "the count is correct before the next routing event, which is all that matters"). This informational note is raised for completeness — a test engineer implementing AT-GR-10 as a literal startup test would find the reconstruction triggers on first message, not on `startup()`.

---

## Technical Feasibility Assessment

### FSPEC-GR-01: Retry with Exponential Backoff

| Technical Concern | Assessment |
|-------------------|------------|
| `AbortSignal` cancellation of `setTimeout`-based backoff | Implementable using `Promise.race([delay, abortSignal.aborted])`. No external library needed. |
| Backoff formula `min(base * 2^(retryCount-1), max)` | Correct. Verified against AT-GR-03: Retry 1=2000ms, Retry 2=4000ms, Retry 3=8000ms with base=2000, max=30000. ✓ |
| Worktree rollback before retry (GR-R3) | `git reset --hard HEAD && git clean -fd` — standard Git operations, always available. ✓ |
| `malformedSignalCount` scoped per invocation (GR-R7) | Implementable as a local variable inside `invokeWithRetry()`. No shared state needed. ✓ |
| Error embed posted even during shutdown abort (AT-GR-16) | Requires `shutdownSignal` integration with `invokeWithRetry()` — handled by TSPEC §5.1. ✓ |
| `CommitResult` returned (not thrown) for transient commit failures | Confirmed via codebase inspection (TSPEC Q-03). Requires explicit branch in §5.1 Step 3. ✓ |

### FSPEC-GR-02: Turn Limit Enforcement

| Technical Concern | Assessment |
|-------------------|------------|
| Atomic check-and-increment (`checkAndIncrementTurn`) | `InMemoryThreadStateManager` is single-threaded (Node.js event loop); no race conditions possible. Atomicity is structural. ✓ |
| Review limit fixed at 4 (GR-R15) | Hardcoded constant in `InMemoryThreadStateManager`. Not configurable by design. ✓ |
| `isSystemMessage` heuristic for emoji-prefix detection | Belt-and-suspenders filter. Primary `isBot === false` filter handles 99%+ of cases. Heuristic limitation documented in TSPEC (Q-01). ✓ |
| Lazy reconstruction on first message post-restart | Requires a "seen threads" set in the orchestrator to detect first-message-after-restart. Implementable with a `Set<string>` initialized empty on startup. ✓ |
| General limit checked after review limit (GR-R12) | Sequential `if` checks in `processMessage()`. Review limit branch returns early, preventing general limit check from firing. ✓ |

### FSPEC-GR-03: Graceful Shutdown

| Technical Concern | Assessment |
|-------------------|------------|
| SIGINT/SIGTERM handlers registered with `process.on()` | Standard Node.js. Must guard against re-registration if called multiple times. ✓ |
| Double-SIGINT guard (GR-R21) | `shuttingDown` boolean flag checked at handler entry. Second signal triggers `process.exit(1)`. ✓ |
| `threadQueue.activeCount()` polling loop | 500ms poll interval in `shutdown.ts`. Terminates when count reaches 0 or timeout exceeded. ✓ |
| Shutdown commit discovers worktrees from registry (GR-R23) | `worktreeRegistry.getAll()` returns `ReadonlyArray<ActiveWorktree>`. No filesystem scanning. ✓ |
| Discord disconnect with 5-second timeout | `Promise.race([discord.disconnect(), delay(5000)])` pattern. ✓ |
| `abortController.abort()` cancels retry backoff delays (AT-GR-16) | Single `AbortController` at composition root, signal threaded to `InvocationGuardParams`. ✓ |

---

## Business Rule Verification

All 23 business rules (GR-R1 through GR-R23) were checked for technical implementability:

| Rules | Verdict |
|-------|---------|
| GR-R1 through GR-R9 (retry/failure) | All implementable ✓ |
| GR-R10 through GR-R15 (turn limits) | All implementable ✓ |
| GR-R16 through GR-R23 (shutdown) | All implementable ✓ |

No rule requires external dependencies beyond Node.js built-ins and the existing Phase 1–5 stack.

---

## Acceptance Test Verifiability

| Test | Verifiability |
|------|--------------|
| AT-GR-01 (retry success) | `FakeInvocationGuard.results[]` returns error then success. `vi.useFakeTimers()` controls backoff. ✓ |
| AT-GR-02 (all retries exhausted) | `DefaultInvocationGuard` exhaustion path with `FakeSkillInvoker` always-failing. ✓ |
| AT-GR-03 (backoff timing) | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` verifies exact delay values. ✓ |
| AT-GR-04 (auth error unrecoverable) | `FakeSkillInvoker` throws error with "401" in message. Assert 0 retries. ✓ |
| AT-GR-05 (two malformed signals) | `FakeSkillInvoker` returns empty routing signal twice. Assert exhaustion on 2nd attempt. ✓ |
| AT-GR-06 (max-turns limit fires on 11th) | `InMemoryThreadStateManager` with `turnCount = 10`. Assert close embed on next message. ✓ |
| AT-GR-07 (silent drop after CLOSED) | Thread status = CLOSED. Assert no embed, no invocation on subsequent message. ✓ |
| AT-GR-08 (review thread stalls at Turn 5) | `InMemoryThreadStateManager` with `reviewTurnCount = 4`. Assert stall embed. ✓ |
| AT-GR-09 (ROUTE_TO_DONE on Turn 4) | Normal routing; assert no stall embed when ROUTE_TO_DONE received on Turn 4. ✓ |
| AT-GR-10 (restart reconstruction) | `reconstructTurnCount()` with synthetic `ThreadMessage[]` containing mix of bot and non-bot messages. ✓ |
| AT-GR-11 (clean shutdown, no in-flight) | `FakeThreadQueue.activeCount() = 0`. Assert shutdown completes without waiting. ✓ |
| AT-GR-12 (shutdown waits for in-flight) | `FakeThreadQueue.activeCount()` returns 1 then 0. Assert exit code 0. ✓ |
| AT-GR-13 (shutdown timeout → exit 1) | `FakeThreadQueue.activeCount()` never returns 0. `vi.advanceTimersByTime(shutdownTimeoutMs)`. Assert exit 1. ✓ |
| AT-GR-14 (double SIGINT) | Call shutdown handler twice. Assert immediate `process.exit(1)` on second call. ✓ |
| AT-GR-15 (pending git changes committed) | `FakeGitClient.hasUncommittedChangesResult = true`. Assert commit call in `FakeGitClient.commitCalls`. ✓ |
| AT-GR-16 (shutdown cancels backoff) | `AbortController.abort()` during delay. Assert error embed posted, `{ status: "shutdown" }` returned. ✓ |
| AT-GR-17 (post-commit embed fails) | `FakeDiscordClient` throws on embed post after commit. Assert partial-commit embed posted. ✓ |

All 17 acceptance tests are verifiable with existing or planned test infrastructure.

---

## Positive Observations

1. **GR-R23 resolves a real implementation pitfall.** Discovering worktrees via `git worktree list` parsing would be brittle and environment-dependent. The registry-based approach (GR-R23) is testable, deterministic, and avoids parsing Git CLI output. The FSPEC made the right call to mandate this approach explicitly.

2. **The fixed review-thread limit (GR-R15) is the correct product choice.** A configurable limit would decouple the limit from the Pattern C protocol structure (4 roles: requester → reviewer → requester → reviewer). Making it fixed prevents misconfigurations that would allow the protocol to run indefinitely.

3. **GR-R9 specifies the error embed body verbatim.** Post-commit partial-failure embeds require a precise message to distinguish "total failure" from "committed but not posted." The FSPEC specifying this body text exactly eliminates ambiguity for both the implementer and the end developer reading the Discord thread.

4. **AT-GR-16 correctly specifies "error embed IS posted" during shutdown-interrupted backoff.** The alternative (no embed, silent cleanup) would leave users in a thread with no indication of what happened. Requiring the error embed even in the shutdown case is the right UX decision — it is also technically implementable since Discord is still connected when the abort fires.

5. **All behavioral flows terminate.** No flow has an implicit infinite loop. FSPEC-GR-01 terminates at `retry_count >= retry_attempts`. FSPEC-GR-02 terminates at `turn_count >= maxTurnsPerThread`. FSPEC-GR-03 terminates at `shutdownTimeoutMs`. All three have explicit force-exit conditions.

---

## Requirement Coverage (Confirmed)

| Requirement | FSPEC | Technical Feasibility |
|-------------|-------|-----------------------|
| REQ-SI-07 | FSPEC-GR-01 (retry + backoff) | ✓ — `AbortController` + `setTimeout`, no new deps |
| REQ-SI-08 | FSPEC-GR-01 (error embed + continue) | ✓ — `try/catch` at orchestrator loop level |
| REQ-NF-02 | FSPEC-GR-01 GR-R1 (failure isolation) | ✓ — per-invocation catch; orchestrator never re-throws |
| REQ-DI-08 | FSPEC-GR-02 (general turn limit) | ✓ — `InMemoryThreadStateManager.checkAndIncrementTurn()` |
| REQ-RP-05 | FSPEC-GR-02 (review-thread limit) | ✓ — `InMemoryThreadStateManager.checkAndIncrementReviewTurn()` |
| REQ-SI-10 | FSPEC-GR-03 (graceful shutdown) | ✓ — `process.on('SIGINT')`, `AbortController`, polling loop |

---

## Recommendation

**Approved.** The FSPEC is technically feasible and implementable without additional libraries or architectural changes. No FSPEC modifications are needed.

**TSPEC action items (not blocking FSPEC approval):**
- F-01: Add a comment in `createShutdownHandler` clarifying that main working directory is excluded per GR-R23 (low priority; informational)
- The two medium-severity TSPEC gaps (BE F-01: `shutdownSignal` in `OrchestratorDeps`; BE F-02: `getParentThreadId()` in `ThreadStateManager`) must be resolved in TSPEC v1.2 before planning begins — this is tracked in the existing BE TSPEC cross-review and PM TSPEC cross-review.
