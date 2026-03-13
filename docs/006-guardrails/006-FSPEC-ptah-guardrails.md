# Functional Specification: Phase 6 — Guardrails

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE6 |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.2 |
| **Date** | March 13, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 6 (Guardrails) of Ptah v4.0. Phase 6 adds the safety nets that prevent runaway agent loops, protect the Orchestrator from cascading failures, and ensure it shuts down cleanly.

Phase 6 contains 6 requirements across 4 domains (DI, RP, SI, NF) organized into three behavioral clusters: (1) retry and failure handling, (2) turn limit enforcement, and (3) graceful shutdown. These behaviors share a common theme — the Orchestrator must degrade gracefully when things go wrong, continue serving healthy threads while isolating failing ones, and never exit with uncommitted state.

**What Phase 6 delivers:** When a Skill invocation fails, the Orchestrator retries with exponential backoff. When retries are exhausted, it posts an error embed and continues running. When a thread reaches its turn limit, it is silently locked against further routing. When a review thread hits four turns without resolution, it is marked stalled. When SIGINT or SIGTERM arrives, the Orchestrator waits for any in-flight invocation to complete before committing any pending Git state and disconnecting cleanly.

**Relationship to Phase 3:** Phase 3's FSPEC-RP-03 defines the review loop pattern (Pattern C) and the Turn 3 final-review instruction (FSPEC-RP-04). Phase 6 extends that pattern by adding the Turn 4/5 boundary: at Turn 4, the Turn-3 instruction becomes the final-review instruction; at Turn 5, the thread is stalled outright. Phase 3's behaviors are unchanged — Phase 6 adds a boundary condition that activates *after* Phase 3's logic has run its course.

**Relationship to Phase 4:** Phase 4's artifact commit pipeline (FSPEC-AC-01, FSPEC-AC-03) runs inside each Skill invocation. Phase 6's retry logic wraps the entire invocation — including Phase 4's commit pipeline. If the artifact commit step fails, the retry fires. If all retries fail, the error embed is posted and the worktree is cleaned up.

**Relationship to Phase 5:** The graceful shutdown (FSPEC-GR-03) must stop Phase 5's polling loop before disconnecting from Discord. This dependency is flagged explicitly in §6.3.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-SI-07] | Retry failed Skill invocations | [FSPEC-GR-01] |
| [REQ-SI-08] | Handle unrecoverable failures without crashing | [FSPEC-GR-01] |
| [REQ-NF-02] | Reliability | [FSPEC-GR-01] |
| [REQ-DI-08] | Post system message at max-turns limit | [FSPEC-GR-02] |
| [REQ-RP-05] | Block fifth turn in review threads | [FSPEC-GR-02] |
| [REQ-SI-10] | Wait for in-flight invocations on shutdown | [FSPEC-GR-03] |

### 2.2 Requirements NOT Requiring FSPECs

None — all 6 Phase 6 requirements have behavioral complexity warranting functional specification.

### 2.3 Phase 3 Behaviors Extended by Phase 6

| Phase 3 Reference | Phase 3 Behavior | Phase 6 Extension |
|-------------------|------------------|-------------------|
| FSPEC-RP-03 §5.2 — Pattern C review loop | Defines Turn 1–4 flow, Turn 3 final-review instruction. Does not specify what happens after Turn 4. | Phase 6 defines the Turn 4/5 boundary: if the reviewer posts a fourth turn without a `ROUTE_TO_DONE` signal, the thread is stalled on Turn 5 arrival. |
| FSPEC-SI-01 §6.2 — Skill invocation | Defines stateless invocation, output format, worktree isolation. Does not define retry or failure handling. | Phase 6 wraps the existing invocation flow with retry-on-failure and error-embed-on-exhaustion logic. |

### 2.4 Configuration Keys Used by Phase 6

All Phase 6 behavioral parameters are read from `ptah.config.json`. The engineer must document these keys in the configuration schema:

| Key | Type | Default | Used By |
|-----|------|---------|---------|
| `orchestrator.max_turns_per_thread` | integer | 10 | FSPEC-GR-02 (general turn limit) |
| `orchestrator.retry_attempts` | integer | 3 | FSPEC-GR-01 (max retries per invocation) |
| `orchestrator.retry_base_delay_ms` | integer | 2000 | FSPEC-GR-01 (backoff base delay in milliseconds) |
| `orchestrator.retry_max_delay_ms` | integer | 30000 | FSPEC-GR-01 (backoff cap in milliseconds) |
| `orchestrator.shutdown_timeout_ms` | integer | 60000 | FSPEC-GR-03 (force-exit timeout on shutdown) |

The review-thread turn limit (4 turns) is **not configurable** — it is a fixed product rule tied to the Pattern C review loop structure defined in FSPEC-RP-03. The review loop has a known structure: Request (Turn 1), Review (Turn 2), Revision (Turn 3), Final Review (Turn 4). A fifth turn means the loop failed to converge and must be escalated to the user.

---

## 3. FSPEC-GR-01: Retry with Exponential Backoff and Failure Handling

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-GR-01 |
| **Title** | Retry with Exponential Backoff and Failure Handling |
| **Linked Requirements** | [REQ-SI-07], [REQ-SI-08], [REQ-NF-02] |

### 3.1 Description

When a Skill invocation fails (for any reason — API error, timeout, unexpected output, or artifact commit failure), the Orchestrator retries the invocation using exponential backoff. If all retry attempts are exhausted without success, the Orchestrator posts an error embed to the originating thread, logs the failure to `#agent-debug`, releases the thread's resources, and continues running for other threads. The Orchestrator never crashes due to a single Skill failure.

### 3.2 Behavioral Flow

```
1. TRIGGER: A Skill invocation raises an exception or returns an error
   (from FSPEC-SI-01 §6.2, any failure point)

2. CLASSIFY FAILURE
   a. Transient failure — retry eligible:
      - API rate limit (HTTP 429) responses from the Claude API
      - Network timeout or transient connection error
      - Claude API 5xx server error
      - Invocation produced output but the routing signal was missing or
        malformed (parse error) — treated as transient, retried once
   b. Unrecoverable failure — do NOT retry:
      - API authentication error (HTTP 401, 403)
      - Malformed Skill implementation (missing required export)
      - Worktree merge conflict that cannot be auto-resolved
        (flagged as unrecoverable by FSPEC-AC-01)
      If the failure is unrecoverable → skip to Step 6 immediately
      with retry_count = retry_attempts (exhausted)

3. ATTEMPT RETRY (if failure is transient)
   a. Increment retry_count (starts at 0 before first retry)
   b. If retry_count >= retry_attempts → go to Step 6 (exhausted)
   c. Calculate backoff delay:
      delay = min(retryBaseDelayMs * 2^(retry_count - 1), retryMaxDelayMs)
      With default config (base=2000ms, max=30000ms):
        Retry 1 → 2 seconds
        Retry 2 → 4 seconds
        Retry 3 → 8 seconds (≤ retryAttempts=3, so this is the last)
   d. Log to #agent-debug:
      "[ptah] Retry {retry_count}/{retry_attempts} for {agentId}
       in thread {threadName} — retrying in {delay}ms. Error: {message}"
   e. Wait for the calculated delay
   f. Re-invoke the Skill (return to FSPEC-SI-01 §6.2 from the top)
      NOTE: The worktree is still active from the failed attempt.
      The retry re-uses the same worktree — it does NOT create a new one.
      The engineer must ensure the worktree is in a clean state
      (no partially committed changes) before the retry invocation runs.

4. ON RETRY SUCCESS (Skill returns valid output with routing signal)
   a. Continue with normal post-invocation flow:
      - Artifact commit pipeline (Phase 4) if applicable
      - Routing signal processing (FSPEC-RP-01)
      - Response posting to Discord thread
   b. Log to #agent-debug:
      "[ptah] Retry {retry_count}/{retry_attempts} succeeded for
       {agentId} in thread {threadName}"
   c. Reset retry_count = 0 for this thread

5. ON RETRY FAILURE (another error during retry attempt)
   a. Increment retry_count
   b. Return to Step 3

6. ON RETRY EXHAUSTION (retry_count >= retry_attempts OR unrecoverable)
   a. Log full error details to #agent-debug:
      "[ptah] ERROR: All {retry_attempts} retries exhausted for
       {agentId} in thread {threadName}. Giving up. Final error: {message}
       Stacktrace: {stacktrace}"
   b. Post error embed to the originating Discord thread:
      - Color: Red (#FF0000)
      - Title: "⛔ Agent Error"
      - Body: "{agentId} encountered an unrecoverable error and could
               not complete its task. A developer should investigate.
               Error: {short error description}
               See #agent-debug for details."
   c. Clean up the worktree (FSPEC-AC-01 cleanup step — discard changes,
      delete worktree)
   d. Release the thread from the ThreadQueue (the thread is no longer
      locked for this invocation)
   e. The Orchestrator continues running — other threads are unaffected
```

### 3.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| GR-R1 | The Orchestrator never re-throws or propagates a Skill invocation failure to the top-level process. All failures are caught at the per-invocation level, handled per this FSPEC, and then discarded. | A single failing Skill must not crash the Orchestrator and disrupt all other running threads. |
| GR-R2 | The retry delay is calculated as `min(retryBaseDelayMs * 2^(retry_count - 1), retryMaxDelayMs)`. No jitter is applied. | Jitter is a scaling concern for multi-process deployments. Phase 1 targets a single-process Orchestrator; jitter adds implementation complexity without benefit. |
| GR-R3 | Retry re-uses the existing worktree rather than creating a new one. The engineer must ensure the worktree is rolled back to a clean state (no partial commits from the failed attempt) before retrying. | Creating a new worktree per retry is expensive. Rollback-and-retry is simpler and faster for the single-process case. |
| GR-R4 | The error embed body includes a short, user-facing description of the failure but NOT the full stacktrace. The full stacktrace is posted to `#agent-debug` only. | The Discord thread is for humans following the agent task — a raw stacktrace is noise. `#agent-debug` is for developer investigation. |
| GR-R5 | If a Discord API error occurs while posting the error embed itself (Step 6b), log the Discord error to console but do NOT retry. Proceed to Step 6c (cleanup) regardless. | The error embed is a courtesy notification. If Discord is unavailable, the failure is still logged to #agent-debug. Do not let a secondary Discord failure mask the original Skill failure. |
| GR-R6 | A malformed routing signal (missing or unparseable `ROUTE_TO_*` tag in Skill output) counts as a transient failure and is retried once. If the second attempt also returns a malformed signal, it is treated as unrecoverable. | A single malformed output may be a fluke. Two consecutive malformed outputs indicate a systematic Skill problem that retrying cannot fix. |
| GR-R7 | The retry counter resets to 0 after a successful invocation. Each Skill invocation for a thread starts with a fresh retry budget. | Retry budgets are per-invocation, not per-thread. A thread that succeeds after 2 retries on one turn gets a fresh 3-retry budget on the next turn. |
| GR-R8 | The Orchestrator logs every retry attempt and exhaustion event to `#agent-debug`. The thread count and retry counts are logged so the developer can identify systemic failures. | Observability is critical for diagnosing whether failures are isolated or systemic. |
| GR-R9 | If the Phase 4 artifact commit succeeded but posting the response embed subsequently fails (the post-commit error path in §3.4 last row), the Orchestrator posts an error embed with the body: "⛔ Agent Error — {agentId} completed its task and committed artifacts to Git, but failed to post its response. Artifacts may be in a partially committed state. A developer should inspect the Git log. Error: {short error description}. See #agent-debug for details." The full error and the Git commit SHA are logged to #agent-debug. | The error embed body must distinguish the "artifacts committed, response not posted" case from a total invocation failure so the developer knows to check Git rather than assume no work was done. The commit SHA in the debug log enables the developer to find and inspect the partial state. |

### 3.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill times out mid-invocation (Claude API hangs) | Treat as transient failure. The invocation is cancelled (if the SDK supports cancellation) and the retry fires after the backoff delay. If the SDK does not support cancellation, the retry fires after the API eventually returns an error. |
| All 3 retries fail due to rate limiting (HTTP 429) | The error embed is posted. The rate-limit backoff served double duty as the retry delay. A developer must investigate whether the retry budget should be increased for rate-limited workloads. |
| Failure occurs during the artifact commit step (Phase 4 pipeline) | The commit failure is caught at the Skill invocation level and treated as a transient failure. The retry re-runs the full invocation including the artifact commit step. If Phase 4 flagged the worktree state as unrecoverable (e.g., merge conflict), it is treated as unrecoverable per Step 2b. |
| Multiple threads fail simultaneously | Each thread has an independent retry state. Retry delays and exhaustion events are per-thread and do not affect one another. |
| Skill output is empty (no content at all) | Treat as transient failure (same as malformed routing signal). Apply GR-R6. |
| Error occurs after a successful Phase 4 artifact commit but before the response embed is posted | The artifact changes are already committed to Git (cannot undo). The Orchestrator posts the error embed instead of a normal response embed, noting that artifacts may have been partially committed. The developer must inspect the Git log. This edge case is flagged for the TSPEC to handle gracefully. |

### 3.5 Acceptance Tests

**AT-GR-01: Successful retry after transient failure**

```
WHO:   As the Orchestrator
GIVEN: PM Agent's Skill invocation fails on the first attempt with a
       network timeout
       and retry_attempts = 3, retryBaseDelayMs = 2000
WHEN:  I handle the failure
THEN:  1. I log "Retry 1/3 for pm-agent ... retrying in 2000ms" to #agent-debug
       2. I wait 2 seconds
       3. I re-invoke PM Agent
       4. PM Agent succeeds on the second attempt
       5. I post PM Agent's response to the Discord thread
       6. I log "Retry 1/3 succeeded for pm-agent" to #agent-debug
       7. The retry_count resets to 0
```

**AT-GR-02: All retries exhausted — error embed posted, Orchestrator continues**

```
WHO:   As the Orchestrator
GIVEN: Dev Agent's Skill invocation fails on every attempt (3 retries)
       and another thread is actively processing a PM Agent invocation
WHEN:  The third retry is exhausted
THEN:  1. I log the full error and stacktrace to #agent-debug
       2. I post a red "⛔ Agent Error" embed to Dev Agent's thread
       3. I clean up the Dev Agent worktree (discard changes)
       4. I release Dev Agent's thread from the ThreadQueue
       5. PM Agent's thread is completely unaffected — it continues running
       6. The Orchestrator process is still running
```

**AT-GR-03: Exponential backoff delays are correct**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation fails 3 consecutive times
       and retryBaseDelayMs = 2000, retryMaxDelayMs = 30000
WHEN:  I execute the retry sequence
THEN:  Retry 1 fires after 2000ms delay
       Retry 2 fires after 4000ms delay
       Retry 3 fires after 8000ms delay
       After retry 3 fails, the error embed is posted (no retry 4)
```

**AT-GR-04: Unrecoverable failure — no retry**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation fails with HTTP 401 (authentication error)
WHEN:  I handle the failure
THEN:  I skip all retry attempts immediately
       I log the unrecoverable failure to #agent-debug
       I post the error embed to the thread
       The Orchestrator continues running
```

**AT-GR-05: Two consecutive malformed routing signals — unrecoverable**

```
WHO:   As the Orchestrator
GIVEN: PM Agent returns output with no ROUTE_TO_* tag on attempt 1
WHEN:  I handle the malformed output
THEN:  1. I retry once (GR-R6 — first malformed output is transient)
       2. PM Agent returns output with no ROUTE_TO_* tag on attempt 2
       3. I treat attempt 2's malformed output as unrecoverable
       4. I post the error embed and do not retry further
```

**AT-GR-17: Phase 4 artifact committed but response embed post fails — partial-commit error embed**

```
WHO:   As the Orchestrator
GIVEN: Dev Agent's Skill invocation completed successfully
       and the Phase 4 artifact commit pipeline ran and produced a commit
       with SHA "abc1234"
       and the subsequent attempt to post Dev Agent's response embed to Discord
       fails with a Discord API error
WHEN:  I handle the response-posting failure
THEN:  1. I do NOT retry the response post (the artifact is already committed —
          retrying the invocation would duplicate the commit)
       2. I post an error embed to Dev Agent's thread with body:
          "⛔ Agent Error — dev-agent completed its task and committed
           artifacts to Git, but failed to post its response. Artifacts
           may be in a partially committed state. A developer should inspect
           the Git log. Error: [short Discord error description].
           See #agent-debug for details."
       3. I log to #agent-debug:
          "[ptah] ERROR: Post-commit response embed failed for dev-agent
           in thread {threadName}. Artifact commit SHA: abc1234.
           Error: {full Discord error}. Developer action required."
       4. I clean up the worktree
       5. I release the thread from the ThreadQueue
       6. The Orchestrator continues running
```

### 3.6 Dependencies

- Depends on: [FSPEC-SI-01] (the Skill invocation flow being wrapped by this FSPEC)
- Depends on: [FSPEC-AC-01] (artifact commit pipeline that runs inside the invocation)
- Consumed by: [FSPEC-GR-03] (shutdown must drain in-flight retries before exiting)

---

## 4. FSPEC-GR-02: Turn Limit Enforcement

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-GR-02 |
| **Title** | Turn Limit Enforcement — General and Review-Thread Limits |
| **Linked Requirements** | [REQ-DI-08], [REQ-RP-05] |

### 4.1 Description

The Orchestrator enforces two independent turn limits:

1. **General limit** (`maxTurnsPerThread`, default: 10): Applies to every thread. When a thread reaches this limit, the Orchestrator posts a system message, logs to `#agent-debug`, and refuses further routing. The thread is effectively closed.

2. **Review-thread limit** (fixed at 4 turns): Applies only to threads identified as Pattern C review threads. If the review loop reaches a fifth turn without a `ROUTE_TO_DONE` signal, the thread is marked stalled, a system message is posted, and the event is logged to `#agent-debug`.

Both limits prevent runaway loops. The general limit is a safety backstop for any thread type. The review-thread limit enforces the intended Pattern C contract — a review loop that does not converge in 4 turns has failed and requires user intervention.

### 4.2 Turn Counting

**What counts as a turn:**

A turn is any message routed through the Orchestrator's routing engine that triggers a Skill invocation. Specifically:

- A human-authored message in the thread that triggers a Skill invocation = 1 turn
- A Skill response posted by the bot that prompts the next agent = 1 turn (for review loops)
- System messages posted by the Orchestrator (pause embeds, error embeds, system announcements) = **NOT a turn** (they do not trigger Skill invocations)

For **review threads** (Pattern C), the turn count tracks the number of agent invocations within the review sub-thread, not the total messages in the parent thread. Review threads are created by the Orchestrator and have a known structure:
- Turn 1: Requesting agent posts the artifact for review
- Turn 2: Reviewing agent posts feedback
- Turn 3: Requesting agent posts the revision (with final-review instruction from REQ-RP-04)
- Turn 4: Reviewing agent posts final acceptance or final rejection

A fifth turn means neither agent issued `ROUTE_TO_DONE` — the loop is stalled.

### 4.3 Behavioral Flow — General Turn Limit

```
1. TRIGGER: A new human message arrives in a thread

2. CHECK GENERAL TURN LIMIT
   a. Read the turn count for this thread from the Orchestrator's
      in-memory thread state (initialized to 0 on thread creation/first message)
   b. If turn_count >= maxTurnsPerThread:
      → Post max-turns system message (Step 3)
      → Refuse routing (do not invoke any Skill)
      → return
   c. If turn_count < maxTurnsPerThread:
      → Increment turn_count by 1
      → Proceed with normal routing (FSPEC-RP-01)

3. POST MAX-TURNS SYSTEM MESSAGE
   a. Post a system embed to the thread:
      - Color: Orange (#FFA500)
      - Title: "🔒 Thread Closed — Maximum Turns Reached"
      - Body: "This thread has reached the {maxTurnsPerThread}-turn limit
               and has been closed. No further agent activity will occur.
               Please start a new thread to continue this task."
   b. Log to #agent-debug:
      "[ptah] Thread {threadName} ({threadId}) closed — max turns
       ({maxTurnsPerThread}) reached. No further routing."
   c. Mark the thread as CLOSED in the Orchestrator's thread state.
      Any future messages in this thread are silently dropped
      (no embed, no log — the system message already explains the state).
```

### 4.4 Behavioral Flow — Review-Thread Fifth-Turn Blocking

```
1. TRIGGER: A new message arrives in a review thread
   (a thread created by the Orchestrator via FSPEC-DI-01 §3.2 for Pattern C)

2. CHECK REVIEW TURN COUNT
   a. Read the review_turn_count for this review thread from the
      Orchestrator's in-memory state (initialized to 0 when the thread
      was created, incremented per FSPEC-RP-03 as each turn completes)
   b. If review_turn_count >= 4 (meaning a fifth turn is attempting):
      → Post stalled system message (Step 3)
      → Refuse routing (do not invoke any Skill)
      → return
   c. If review_turn_count < 4:
      → Proceed with Pattern C routing (FSPEC-RP-03)
      → Increment review_turn_count after the invocation completes

3. POST STALLED SYSTEM MESSAGE
   a. Post a system embed to the review thread:
      - Color: Red (#FF0000)
      - Title: "🚨 Review Thread Stalled"
      - Body: "This review thread has reached 4 turns without resolution.
               The review loop has been stopped. Please check the thread,
               resolve any outstanding disagreements manually, and post
               a routing signal to continue:
               ROUTE_TO_DONE — to close the review
               ROUTE_TO_AGENT: {agentId} — to continue with a specific agent"
   b. Log to #agent-debug:
      "[ptah] Review thread {threadName} ({threadId}) STALLED after
       4 turns — no ROUTE_TO_DONE received. Thread halted.
       Parent thread: {parentThreadId}"
   c. Mark the review thread as STALLED in the Orchestrator's thread state.
      Any future messages in this stalled thread are silently dropped.

4. PARENT THREAD STATE
   The parent thread (from which the review thread was spawned) remains
   active. The stall only closes the review sub-thread. The user can
   manually post a routing signal in the parent thread to continue
   the work with a fresh agent invocation.
```

### 4.5 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| GR-R10 | Turn counts are maintained in-memory and reconstructed from thread history on Orchestrator restart. The Orchestrator must count the number of routing-engine invocations from the thread's message history on startup to restore the turn count correctly. | The turn count is not persisted to disk. On restart, the Orchestrator re-derives it from the existing Discord thread messages to avoid restarting the count at 0. |
| GR-R11 | A CLOSED or STALLED thread silently drops all further incoming messages. No additional system embeds are posted after the initial close/stall message. | Repeated "this thread is closed" embeds are noisy. The initial message is sufficient. |
| GR-R12 | The general turn limit and the review-thread turn limit are independent. A review thread's 4-turn limit is checked first, before the general 10-turn limit. In practice, a review thread should never reach 10 turns if the 4-turn limit is working correctly. | Defence in depth — the general limit is a backstop in case the review-thread limit logic has a bug. |
| GR-R13 | The review-thread stall does NOT propagate to the parent thread. The parent thread remains open and operational. | The parent thread may have other work to do. Stalling the review sub-thread is a localized failure, not a global one. |
| GR-R14 | A `ROUTE_TO_DONE` signal received on Turn 4 of a review thread is valid. The stall only triggers when a fifth message arrives without `ROUTE_TO_DONE` having been received on any of Turns 1–4. | Turn 4 is the intended final turn. `ROUTE_TO_DONE` on Turn 4 is the happy path. |
| GR-R15 | The review-thread turn limit is not configurable. It is fixed at 4. The Pattern C review loop is a structured protocol with a fixed number of roles (requester → reviewer → requester → reviewer). Allowing configuration would decouple the limit from the protocol. | Business rule, not a configuration parameter. |

### 4.6 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Thread reaches turn 10 exactly when a Skill returns `ROUTE_TO_DONE` | `ROUTE_TO_DONE` is processed normally (the thread closes successfully). The max-turns limit fires only when a new routing event *arrives*, not when a Skill response is being processed. |
| Orchestrator restarts and cannot reconstruct turn count from thread history (e.g., messages were deleted from Discord) | Default to turn_count = 0 for the affected thread. Log a warning to #agent-debug. The thread operates as if fresh. This is a rare edge case with no good recovery option. |
| A review thread receives a human message (not a bot routing signal) after stalling | The message is silently dropped (GR-R11). The thread is already stalled. |
| The parent thread posts a `ROUTE_TO_AGENT` signal to re-enter the stalled review thread directly | `ROUTE_TO_AGENT` routes to the agent in the parent thread, not in the stalled review sub-thread. A new review sub-thread would be created if Pattern C restarts. The stalled sub-thread remains closed. |
| `maxTurnsPerThread` is configured to a value lower than 4 | This would close all threads before the review-thread limit applies. This is a misconfiguration. The Orchestrator should log a startup warning if `maxTurnsPerThread` < 5. |

### 4.7 Acceptance Tests

**AT-GR-06: General max-turns limit fires after the 10th invocation**

```
WHO:   As the Orchestrator
GIVEN: Thread "auth — define requirements" has processed 10 turns
       (turn_count = 10, maxTurnsPerThread = 10)
WHEN:  An 11th message arrives in the thread
THEN:  1. I check: turn_count (10) >= maxTurnsPerThread (10) — limit reached
       2. I post an orange "🔒 Thread Closed — Maximum Turns Reached" embed
       3. I log the closure to #agent-debug
       4. I do NOT invoke any Skill
       5. The thread is marked CLOSED
```

Note: `maxTurnsPerThread = 10` means **10 Skill invocations are permitted** (turns 1–10 proceed normally). The limit fires when the 11th routing event arrives. The behavioral flow in §4.3 is authoritative: the check `turn_count >= maxTurnsPerThread` runs *before* incrementing, so an already-incremented count of 10 triggers the block.

**AT-GR-07: Subsequent messages after CLOSED are silently dropped**

```
WHO:   As the Orchestrator
GIVEN: Thread "auth — define requirements" is marked CLOSED
       (the 11th message triggered the limit and the close embed was posted)
WHEN:  A 12th message arrives in the thread
THEN:  The message is silently dropped
       No embed is posted
       No Skill is invoked
       No log entry (beyond debug-level)
```

**AT-GR-08: Review thread stalls at fifth turn**

```
WHO:   As the Orchestrator
GIVEN: A review thread has completed 4 turns (review_turn_count = 4)
       and no ROUTE_TO_DONE has been received
WHEN:  A fifth message arrives in the review thread
THEN:  1. I check: review_turn_count (4) >= 4 — fifth turn blocked
       2. I post a red "🚨 Review Thread Stalled" embed to the review thread
       3. I log the stall to #agent-debug with the parent thread reference
       4. I do NOT invoke any Skill
       5. The review thread is marked STALLED
       6. The parent thread remains ACTIVE and unaffected
```

**AT-GR-09: ROUTE_TO_DONE on Turn 4 — normal resolution**

```
WHO:   As the Orchestrator
GIVEN: A review thread has completed 3 turns (review_turn_count = 3)
WHEN:  The reviewing agent on Turn 4 returns ROUTE_TO_DONE
THEN:  ROUTE_TO_DONE is processed normally
       The review thread is marked complete (not stalled)
       The parent thread resumes with the completed artifact
       No stall message is posted
```

**AT-GR-10: Orchestrator restart — turn counts reconstructed**

```
WHO:   As the Orchestrator
GIVEN: Thread "auth — define requirements" has 7 messages in Discord history
       (5 routing invocations, 2 system messages)
       and the Orchestrator restarts
WHEN:  I initialize on startup
THEN:  I read the thread's Discord message history
       I count 5 routing invocations (ignoring system messages)
       I set turn_count = 5 for this thread
       The thread continues normally with 5 remaining turns
```

### 4.8 Dependencies

- Depends on: [FSPEC-RP-01] (routing signal parsing — checked after turn count allows routing)
- Depends on: [FSPEC-RP-03] (Pattern C review loop — review_turn_count tracks Pattern C invocations)
- Depends on: [FSPEC-DI-01] (embed posting for system messages)

---

## 5. FSPEC-GR-03: Graceful Shutdown

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-GR-03 |
| **Title** | Graceful Shutdown — SIGINT/SIGTERM Handling |
| **Linked Requirements** | [REQ-SI-10] |

### 5.1 Description

When the Orchestrator process receives a SIGINT (Ctrl+C) or SIGTERM signal, it executes a structured shutdown sequence: it stops accepting new messages, waits for any in-flight Skill invocations to complete, commits any pending Git changes, stops Phase 5's polling loop, disconnects from Discord, and exits cleanly. If an in-flight invocation does not complete within `shutdownTimeoutMs` (default: 60 seconds), the Orchestrator force-exits to prevent hanging indefinitely.

The goal is to exit without losing work. Commits that were in progress are allowed to finish. Pending Git changes are not left uncommitted. The Discord connection is closed gracefully to avoid zombie bot presence.

### 5.2 Behavioral Flow

```
1. TRIGGER: The process receives SIGINT or SIGTERM

2. ENTER SHUTDOWN MODE
   a. Set a global "shutting down" flag in the Orchestrator
   b. The Discord message listener stops accepting new messages.
      Any message that arrives after this flag is set is silently ignored
      (no Skill invocation, no embed, no log)
   c. Log to console (stdout):
      "[ptah] Shutdown signal received. Waiting for in-flight
       invocations to complete..."
   d. Post a system embed to #agent-debug:
      "[ptah] System shutting down. Active threads will complete
       their current invocation. No new messages will be processed."
      NOTE: If posting this embed fails (e.g., Discord is already down),
      proceed — it is a courtesy notification only.

3. WAIT FOR IN-FLIGHT INVOCATIONS
   a. Check if any Skill invocations are currently running
      (tracked by the ThreadQueue's active-invocation set)
   b. If no invocations are active → skip to Step 4 immediately
   c. If invocations are active:
      - Wait up to shutdownTimeoutMs for all active invocations to complete
      - Log to console every 5 seconds:
        "[ptah] Waiting for {count} in-flight invocation(s) to complete..."
      - If an invocation completes during the wait → proceed with its
        normal post-invocation flow (commit, response posting, routing)
        so that no work is lost
      - If shutdownTimeoutMs is exceeded → log to console:
        "[ptah] Shutdown timeout reached ({shutdownTimeoutMs}ms).
         Force-exiting. {count} invocation(s) may be incomplete."
        → Skip to Step 5 (skip Steps 4a-4c, proceed directly to disconnect)

4. COMMIT PENDING GIT CHANGES
   a. Check for any uncommitted Git changes (staged or unstaged) in:
      - The main working directory
      - Any active worktrees (if an invocation completed but the worktree
        was not yet merged/cleaned up)
   b. If uncommitted changes are found:
      - Stage all changes: git add -A
      - Commit with message: "[ptah] System: shutdown commit — uncommitted
        changes preserved"
      - Log to console: "[ptah] Committed pending Git changes before exit."
   c. If no uncommitted changes → skip this step

5. STOP POLLING LOOP (Phase 5)
   a. Signal the pending-questions polling loop to stop (FSPEC-PQ-01 §3.3)
   b. Wait for any in-progress poll tick to complete (it will complete
      quickly — it is a file read, not a long operation)
   c. Phase 5's polling state is durable in pending.md — it survives restart

6. DISCONNECT FROM DISCORD
   a. Call the Discord client's disconnect/destroy method
   b. Wait for the connection to close cleanly (up to 5 seconds)
   c. If the connection does not close within 5 seconds → force-close

7. EXIT
   a. Exit the process with code 0 (clean exit)
   b. If the shutdown was force-exited at Step 3 → exit with code 1
      (indicates incomplete shutdown for monitoring tools)
```

### 5.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| GR-R16 | The "shutting down" flag is set synchronously as the first action in Step 2. No new message processing begins after this flag is set, even if messages arrive concurrently. | Prevents a race condition where a new message starts being processed after shutdown begins, potentially leaving work in a partially started state. |
| GR-R17 | In-flight invocations are allowed to complete normally — including Phase 4 artifact commits and response posting. The shutdown does not cancel in-flight invocations. | Cancelling a mid-commit artifact pipeline could leave the repository in an inconsistent state. Completing the invocation ensures the Git log is coherent. |
| GR-R18 | The shutdown commit (Step 4) uses the message `"[ptah] System: shutdown commit — uncommitted changes preserved"`. It is a fallback for edge cases. In normal operation, Phase 4's artifact commit pipeline handles all commits. If Step 4 commits anything, it should be investigated. | The commit message signals to developers that this was a system-managed cleanup commit, not a normal artifact commit. |
| GR-R19 | If `shutdown_timeout_ms` is exceeded, the Orchestrator exits with code 1. The incomplete invocations are logged to console. The worktrees from those invocations are left on disk and must be manually cleaned up by a developer. | The Orchestrator must not hang indefinitely. Force-exiting with a non-zero exit code allows process managers (systemd, Docker) to detect the abnormal exit. |
| GR-R20 | SIGINT and SIGTERM both trigger the same shutdown sequence. There is no "fast" vs "slow" shutdown — the sequence is always the same. | Simplicity. Two code paths for shutdown would be harder to test and maintain. |
| GR-R21 | A second SIGINT or SIGTERM received during shutdown (e.g., the developer presses Ctrl+C twice) force-exits immediately (Step 7 with code 1) without waiting. | Respect the developer's intent. If they send the signal twice, they want out now. |
| GR-R22 | The Discord `#agent-debug` embed posted in Step 2d is best-effort only. If Discord is unavailable, the Orchestrator still proceeds with the shutdown sequence. | Shutdown must succeed even if Discord is the reason the Orchestrator is being shut down. |
| GR-R23 | The shutdown commit step (§5.2 Step 4a) discovers active worktrees from the Orchestrator's in-memory worktree registry — the same registry maintained by FSPEC-AC-01 when worktrees are created and destroyed. It does NOT scan the filesystem or invoke `git worktree list`. Worktrees not in the registry (e.g., leftover from a previous crashed run) are not touched. | The registry is the canonical source of truth for active worktrees. Filesystem scanning risks touching worktrees that are already in a clean or committed state from prior runs. Registry-based enumeration is deterministic and testable. |

### 5.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| No invocations are in-flight when SIGINT arrives | The shutdown completes in < 1 second. Step 3 is skipped. Normal clean exit. |
| An invocation is retrying (FSPEC-GR-01) during shutdown | The current retry attempt is allowed to complete. If the retry succeeds, the result is committed and posted. If the retry fails and all retries are exhausted, the error embed is posted. The Orchestrator does not start new retries after entering shutdown mode — if a retry is in the backoff wait period, it is cancelled, and the Orchestrator treats the current attempt as the final result. |
| A Phase 5 question is pending when shutdown occurs | The question survives in `pending.md` (it was already committed per FSPEC-PQ-01 Step 2c). On the next restart, the Orchestrator reconstructs it via PQ-R9. No data is lost. |
| Shutdown occurs while Phase 4 is committing artifacts (mid-commit) | The in-flight invocation is allowed to complete (GR-R17), including the Phase 4 commit. If the Git commit command itself is mid-execution and cannot be cleanly stopped, the shutdown waits. |
| The Git repository is in a locked state (`.git/index.lock` exists) | This is an existing filesystem issue, not a shutdown-specific one. Log to console and proceed. The shutdown commit step may fail; that is acceptable. |
| `shutdownTimeoutMs` = 0 (configured to force-exit immediately) | Step 3 is effectively skipped. The Orchestrator exits immediately after setting the shutdown flag, without waiting for in-flight invocations. This is a valid but destructive configuration — document it as such. |

### 5.5 Acceptance Tests

**AT-GR-11: Clean shutdown with no in-flight invocations**

```
WHO:   As a developer
GIVEN: The Orchestrator is running with no active Skill invocations
WHEN:  I send SIGINT (Ctrl+C)
THEN:  1. The Discord message listener stops accepting new messages
       2. A courtesy embed is posted to #agent-debug
       3. Git is checked for uncommitted changes (none in this case)
       4. The Phase 5 polling loop is stopped
       5. The Discord connection is closed
       6. The process exits with code 0
       Total time: < 2 seconds
```

**AT-GR-12: Shutdown waits for in-flight invocation to complete**

```
WHO:   As a developer
GIVEN: The Orchestrator is processing a Dev Agent Skill invocation
       that has 10 seconds remaining
WHEN:  I send SIGTERM
THEN:  1. The shutdown flag is set immediately
       2. No new Discord messages are accepted
       3. The Dev Agent invocation is allowed to finish
       4. Dev Agent's response is posted to Discord
       5. Phase 4 artifact commits are completed
       6. Git is checked — no uncommitted changes remain
       7. The process exits with code 0
       Total time: ~10 seconds (the remaining invocation time)
```

**AT-GR-13: Shutdown timeout — force exit**

```
WHO:   As a developer
GIVEN: The Orchestrator is processing a Skill invocation that is hung
       (60 seconds have passed, it has not completed)
       and shutdownTimeoutMs = 60000
WHEN:  shutdownTimeoutMs is exceeded
THEN:  1. A message is logged to console: "Shutdown timeout reached...
          Force-exiting. 1 invocation(s) may be incomplete."
       2. The process exits with code 1
       3. The worktree from the hung invocation is left on disk
          (developer must manually clean up)
```

**AT-GR-14: Second SIGINT during shutdown — immediate force exit**

```
WHO:   As a developer
GIVEN: The Orchestrator is in shutdown mode, waiting for an in-flight invocation
WHEN:  I send a second SIGINT
THEN:  The process force-exits immediately with code 1
       No further waiting occurs
```

**AT-GR-15: Pending Git changes committed on shutdown**

```
WHO:   As a developer
GIVEN: A Skill invocation completed during shutdown (in-flight when signal arrived)
       and it left staged-but-uncommitted changes in a worktree
       (edge case: invocation completed but Phase 4 commit did not run)
WHEN:  The shutdown commit step (Step 4) runs
THEN:  git add -A is run across all worktrees and the main working directory
       A commit is created: "[ptah] System: shutdown commit — uncommitted
       changes preserved"
       The Git repository is in a clean state before disconnect
```

**AT-GR-16: SIGINT cancels backoff wait — retry not started — error embed posted**

```
WHO:   As a developer
GIVEN: A Skill invocation failed on attempt 1 and the Orchestrator is waiting
       4 seconds before retry 2 (retryBaseDelayMs = 2000 → Retry 2 delay = 4000ms)
       and 2 seconds of the 4-second backoff have elapsed
WHEN:  I send SIGINT
THEN:  1. The shutdown flag is set immediately
       2. The remaining 2 seconds of backoff wait are cancelled — not waited out
       3. Retry 2 is NOT attempted (no new invocation starts)
       4. A red "⛔ Agent Error" embed IS posted to the thread
          (the first attempt's failure is treated as the final result)
       5. The worktree is cleaned up
       6. The shutdown sequence continues from Step 3 onward (§5.2)
       7. The Orchestrator exits with code 0 (no other in-flight invocations)
```

### 5.6 Dependencies

- Depends on: [FSPEC-SI-01] (ThreadQueue active-invocation tracking — shutdown checks this)
- Depends on: [FSPEC-AC-01] (Phase 4 commit pipeline — allowed to complete during shutdown)
- Depends on: [FSPEC-PQ-01] (Phase 5 polling loop — stopped in Step 5)
- Consumed by: Engineering TSPEC (shutdown sequence must be implemented as a registered signal handler)

---

## 6. Traceability Summary

| FSPEC | Requirements | Domain |
|-------|-------------|--------|
| FSPEC-GR-01 | REQ-SI-07, REQ-SI-08, REQ-NF-02 | Retry and Failure Handling |
| FSPEC-GR-02 | REQ-DI-08, REQ-RP-05 | Turn Limit Enforcement |
| FSPEC-GR-03 | REQ-SI-10 | Graceful Shutdown |

**Coverage:** All 6 Phase 6 requirements are covered by 3 FSPECs. No requirements are left unspecified.

---

## 7. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| — | None | — | All product decisions resolved. Test Engineer cross-review feedback addressed in v1.1. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Product Manager | Initial functional specification for Phase 6 — 3 FSPECs covering all 6 requirements |
| 1.1 | March 13, 2026 | Product Manager | Addressed Test Engineer cross-review feedback: (F-01) Fixed AT-GR-06/07 to be consistent with §4.3 behavioral flow — `max_turns_per_thread = 10` means 10 invocations proceed, blocked on the 11th; (F-02) Added AT-GR-16 for retry-in-backoff-period-at-shutdown edge case; (F-03) Added GR-R9 (partial-commit embed body) and AT-GR-17 covering the post-commit response-posting failure; (Q-02) Added GR-R22 clarifying worktree registry as the authoritative source for shutdown commit step |
| 1.2 | March 13, 2026 | Product Manager | PM TSPEC cross-review corrections: (F-01) Resolved GR-R9 numbering conflict — §3.3 partial-commit rule retains GR-R9; §4.5 turn-limit rules renumbered GR-R10–GR-R15; §5.3 shutdown rules renumbered GR-R16–GR-R23; (F-03) Config key table updated to snake_case to match actual `ptah.config.json` schema convention |

---

*Gate: User reviews and approves this functional specification before handoff to engineering.*
