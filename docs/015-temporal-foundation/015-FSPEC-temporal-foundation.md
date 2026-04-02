# Functional Specification

## Temporal Foundation + Config-Driven Workflow

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-015 |
| **Parent Document** | [REQ-015](015-REQ-temporal-foundation.md) |
| **Version** | 1.0 |
| **Date** | April 2, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Overview

This document specifies the behavioral flows for the 6 requirements in REQ-015 that have branching logic, multi-step flows, or business rules the engineer should not be deciding alone. The remaining 14 requirements (REQ-TF-01, REQ-TF-04, REQ-TF-07, REQ-CD-01..07, REQ-MG-02, REQ-NF-15-01..03) are direct-to-TSPEC — their behavior is sufficiently defined in the REQ.

### FSPEC Coverage

| FSPEC ID | Title | Linked Requirements |
|----------|-------|---------------------|
| FSPEC-TF-01 | Activity Lifecycle and Heartbeat | REQ-TF-02 |
| FSPEC-TF-02 | Human-in-the-Loop Signal Flow | REQ-TF-03 |
| FSPEC-TF-03 | Activity Failure Classification and Retry | REQ-TF-05 |
| FSPEC-TF-04 | Fork/Join Orchestration | REQ-TF-06 |
| FSPEC-TF-05 | Review Cycle Loop | REQ-TF-08 |
| FSPEC-MG-01 | State Migration Flow | REQ-MG-01 |

---

## FSPEC-TF-01: Activity Lifecycle and Heartbeat

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-TF-01 |
| **Title** | Activity Lifecycle and Heartbeat |
| **Linked Requirements** | [REQ-TF-02] |
| **Dependencies** | None |

### Description

Specifies the complete lifecycle of a skill invocation Activity — from dispatch to completion or failure — including heartbeat emission, timeout detection, and idempotency checks.

### Behavioral Flow

1. **Workflow dispatches Activity** with parameters: agent ID, feature slug, phase ID, context documents, feature config.
2. **Activity begins — idempotency check:**
   a. Check if a git worktree for this agent + feature + phase already exists with committed changes.
   b. If yes → skip invocation, read the existing routing signal from the commit, return result. Log: `Idempotent skip: worktree already committed for {agent}/{feature}/{phase}`.
   c. If no → continue to step 3.
3. **Create git worktree** for the agent on the feature branch.
4. **Assemble context bundle** using the config-driven context document matrix (REQ-CD-07).
5. **Invoke skill** via `SkillInvoker.invoke()` (Claude Agent SDK subprocess).
6. **Heartbeat loop** (concurrent with step 5):
   a. Every `heartbeatInterval` (default 30 seconds), check subprocess liveness (`process.alive`).
   b. If alive → call `context.heartbeat()` with current elapsed time.
   c. If not alive → stop heartbeat loop. Step 5 will resolve with success or error.
   d. If Temporal sends cancellation request (checked at heartbeat boundary) → kill subprocess, clean up worktree, throw `CancellationError`.
7. **Skill completes** — parse routing signal from response.
8. **If routing signal is `ROUTE_TO_USER`:**
   a. Do NOT merge worktree (agent's work may be incomplete).
   b. Return routing signal to the Workflow. The Workflow handles the pause (FSPEC-TF-02).
9. **If routing signal is `LGTM` or `TASK_COMPLETE`:**
   a. Detect artifact changes in worktree (including untracked files).
   b. Commit changes in worktree.
   c. Merge worktree to feature branch (`git merge --no-ff`).
   d. Clean up worktree.
   e. Return routing signal + artifact list to the Workflow.
10. **If skill invocation throws an error:**
    a. Clean up worktree (finally block).
    b. Throw error. Temporal's retry policy handles re-execution (FSPEC-TF-03).

### Business Rules

- **BR-01:** Heartbeat interval and timeout are read from `ptah.config.json` at Activity start, not from workflow config.
- **BR-02:** Idempotency check (step 2) uses worktree existence + commit status, not Temporal's built-in idempotency tokens. This is because the Claude Agent SDK subprocess is not deterministic — re-running the same prompt may produce different output.
- **BR-03:** `ROUTE_TO_USER` is NOT an error. The Activity returns normally; the Workflow decides what to do.
- **BR-04:** Worktree cleanup happens in a finally block — even if the process crashes, the next startup prunes orphans.

### Edge Cases

- **Subprocess hangs (no output, no crash):** Heartbeats continue (process is alive). The `startToCloseTimeout` (default 30 min) eventually expires, causing Temporal to cancel the Activity.
- **Temporal Worker crashes mid-Activity:** The worktree remains on disk. On next startup, orphan pruning removes it. Temporal reschedules the Activity on a new Worker (or same Worker after restart). The idempotency check at step 2 prevents duplicate work if the worktree was already committed.
- **Git merge conflict during step 9c:** The Activity throws a non-retryable error (merge conflicts require human intervention). The Workflow enters a failed state.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Subprocess exits with non-zero code | Activity throws error. Retry policy applies. |
| Heartbeat timeout (120s without heartbeat) | Temporal considers Activity failed. Retry policy applies. |
| `startToCloseTimeout` exceeded | Temporal cancels Activity. No retry (timeout is non-retryable by default; configurable). |
| Git merge conflict | Non-retryable error. Workflow enters failed state, notifies user. |
| Routing signal parse failure | Non-retryable error. Workflow enters failed state. |

### Acceptance Tests

**AT-01:** Activity succeeds normally.
**Who:** Orchestrator **Given:** A workflow at `tspec-creation` phase with agent `eng` **When:** The Activity dispatches, the skill runs for 2 minutes, and returns `LGTM` **Then:** Heartbeats are emitted every 30s (at least 3 heartbeats). The worktree is merged. The Activity returns `LGTM` + artifact list.

**AT-02:** Activity skips via idempotency.
**Who:** Orchestrator **Given:** A worktree for `eng/my-feature/tspec-creation` already exists with committed changes **When:** The Activity is dispatched **Then:** The skill is NOT invoked. The Activity returns the existing routing signal from the committed worktree.

**AT-03:** ROUTE_TO_USER pauses without merge.
**Who:** Orchestrator **Given:** An agent returns `ROUTE_TO_USER` **When:** The Activity completes **Then:** No worktree merge occurs. The Activity returns `ROUTE_TO_USER` normally.

---

## FSPEC-TF-02: Human-in-the-Loop Signal Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-TF-02 |
| **Title** | Human-in-the-Loop Signal Flow |
| **Linked Requirements** | [REQ-TF-03] |
| **Dependencies** | FSPEC-TF-01 |

### Description

Specifies the behavioral flow when an agent requests human input (`ROUTE_TO_USER`) — from question emission through user answer to workflow resumption.

### Behavioral Flow

1. **Activity returns `ROUTE_TO_USER`** with a `question` string.
2. **Workflow records the question** in its state (queryable via REQ-TF-04).
3. **Workflow emits notification** to the messaging layer:
   - Includes: question text, feature slug, agent ID, phase ID, workflow ID.
   - The messaging layer is responsible for formatting and delivering to the user (Discord embed, Slack message, CLI prompt, webhook).
4. **Workflow enters `waitForSignal("user-answer")`.**
   - The workflow is now suspended. No resources consumed. Can wait indefinitely.
   - The workflow state is queryable: current phase = `{phase-id}:waiting-for-user`, pending question visible.
5. **User responds** via messaging platform.
6. **Messaging layer sends Temporal Signal:**
   - Signal name: `user-answer`
   - Payload: `{ answer: string, answeredBy: string, answeredAt: string }`
   - The messaging layer should retry Signal delivery on failure (at-least-once semantics).
7. **Workflow resumes from signal.**
8. **Workflow re-invokes the same agent** for the same phase:
   - The context bundle includes the original question and the user's answer (Pattern B context).
   - The agent's prior worktree is preserved (not cleaned up at step 8 of FSPEC-TF-01 because the routing signal was `ROUTE_TO_USER`).
9. **Agent completes** with `LGTM`, `TASK_COMPLETE`, or another `ROUTE_TO_USER`:
   - `LGTM`/`TASK_COMPLETE` → normal Activity completion (merge worktree, advance).
   - `ROUTE_TO_USER` → repeat from step 1 (nested question).

### Business Rules

- **BR-05:** The same agent is re-invoked after the user answers — not a different agent. The agent needs its prior context.
- **BR-06:** Nested questions are supported (agent asks again after receiving first answer). There is no limit on nested questions, but each question round requires a full Activity invocation.
- **BR-07:** Temporal buffers Signals. If the user answers before the workflow reaches `waitForSignal`, the Signal is buffered and picked up immediately when the workflow reaches the wait point.
- **BR-08:** If multiple `user-answer` Signals arrive (e.g., messaging layer retry), the first one resumes the workflow. Subsequent Signals are buffered and ignored (the workflow is no longer waiting).

### Edge Cases

- **Orchestrator crashes while waiting for Signal:** Temporal preserves the wait state. On restart, the workflow is still waiting. When the Signal arrives, it resumes normally.
- **User never answers:** The workflow waits indefinitely. It is visible in the Temporal UI as a running workflow in "waiting-for-user" state. No resources are consumed.
- **Messaging layer crashes after receiving answer, before sending Signal:** The answer is lost. The user must re-submit. The messaging layer should log delivery failures and prompt for re-entry.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Signal payload missing `answer` field | Workflow logs warning, re-enters wait state, posts "Invalid answer received" notification. |
| Agent fails after resuming with user answer | Normal Activity failure handling (FSPEC-TF-03). |

### Acceptance Tests

**AT-04:** Full question-answer round trip.
**Who:** Orchestrator **Given:** An agent at `req-creation` returns `ROUTE_TO_USER` with question "Should auth use Google or GitHub?" **When:** The user replies "Google" via Discord **Then:** The messaging layer sends a `user-answer` Signal. The workflow resumes and re-invokes the same agent with the question + answer in context. The agent completes with `LGTM`.

**AT-05:** Workflow survives crash while waiting.
**Who:** Orchestrator **Given:** A workflow is waiting for a `user-answer` Signal **When:** The Orchestrator process is killed and restarted **Then:** The workflow is still waiting after restart. Sending the Signal resumes it normally.

---

## FSPEC-TF-03: Activity Failure Classification and Retry

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-TF-03 |
| **Title** | Activity Failure Classification and Retry |
| **Linked Requirements** | [REQ-TF-05] |
| **Dependencies** | FSPEC-TF-01 |

### Description

Specifies how the system classifies Activity errors as retryable or non-retryable, and the behavior of each category.

### Behavioral Flow

1. **Activity throws an error.**
2. **Classify the error:**

| Error Type | Retryable? | Examples |
|-----------|:----------:|---------|
| API rate limit (429) | Yes | Claude API rate limit, Discord rate limit |
| API timeout | Yes | Claude API timeout, network timeout |
| Subprocess crash (non-zero exit) | Yes | OOM, segfault, unexpected exit |
| Heartbeat timeout | Yes | Subprocess hung, Worker overloaded |
| Routing signal parse failure | **No** | Agent returned malformed output |
| Git merge conflict | **No** | Overlapping file changes |
| `ROUTE_TO_USER` | **Not an error** | Handled in FSPEC-TF-02 |
| Revision bound exceeded | **No** | Review loop hit max iterations |
| Config validation failure | **No** | Invalid phase reference, missing agent |

3. **If retryable:** Temporal retries according to the retry policy:
   - `initialInterval`: 30 seconds (default)
   - `backoffCoefficient`: 2.0 (default)
   - `maximumInterval`: 10 minutes (default)
   - `maximumAttempts`: 3 (default)
   - All values configurable in `ptah.config.json` under `temporal.retry`.
4. **If retry succeeds:** Workflow continues from where it left off.
5. **If all retries exhausted (retryable) or non-retryable error:**
   a. Workflow transitions to `failed` state for the current phase.
   b. Workflow posts failure notification to messaging layer: error type, error message, phase, agent, retry count.
   c. Workflow enters a `waitForSignal("retry-or-cancel")` state.
   d. User can signal `retry` (re-dispatch the Activity from scratch) or `cancel` (terminate the workflow).

### Business Rules

- **BR-09:** Non-retryable errors are marked with `ApplicationFailure.nonRetryable()` in the Temporal SDK. This prevents Temporal from retrying.
- **BR-10:** The retry policy is per-Activity, not per-Workflow. Different phases can have different retry configurations if specified in `ptah.workflow.yaml`.
- **BR-11:** Worktree cleanup happens regardless of retryability — the retry creates a fresh worktree.

### Edge Cases

- **First attempt is non-retryable, second Activity in fork/join is still running:** The non-retryable failure is recorded. The fork/join policy (FSPEC-TF-04) determines whether to cancel or wait for the other Activity.
- **Rate limit with specific retry-after header:** The retry interval should respect the API's `Retry-After` header if present, overriding the backoff coefficient for that single retry.

### Acceptance Tests

**AT-06:** Transient error retried successfully.
**Who:** Orchestrator **Given:** An Activity fails with a 429 rate limit error **When:** Temporal retries after 30 seconds **Then:** The second attempt succeeds. The workflow continues normally. The retry is visible in the Temporal UI.

**AT-07:** Non-retryable error stops immediately.
**Who:** Orchestrator **Given:** An Activity fails with a git merge conflict **When:** The error is thrown **Then:** Temporal does NOT retry. The workflow enters failed state and notifies the user.

**AT-08:** All retries exhausted.
**Who:** Orchestrator **Given:** An Activity fails with API timeouts 3 times in a row **When:** The third retry fails **Then:** The workflow enters failed state, notifies the user, and waits for `retry-or-cancel` Signal.

---

## FSPEC-TF-04: Fork/Join Orchestration

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-TF-04 |
| **Title** | Fork/Join Orchestration |
| **Linked Requirements** | [REQ-TF-06] |
| **Dependencies** | FSPEC-TF-01, FSPEC-TF-03 |

### Description

Specifies the parallel dispatch, completion tracking, failure policy, and merge behavior for fork/join phases.

### Behavioral Flow

#### Happy Path (all agents succeed)

1. **Workflow reaches a fork/join phase** with `agents: ["eng", "fe"]`.
2. **Workflow dispatches Activities concurrently** — one per agent. Both run in isolated git worktrees.
3. **Workflow waits for all Activities** to complete (using `Promise.all` or Temporal's equivalent).
4. **Both return `LGTM`.**
5. **Merge worktrees sequentially** in config-defined order (document order by default):
   a. Merge `eng` worktree → feature branch.
   b. Merge `fe` worktree → feature branch.
   c. If merge conflict at step 5b → FSPEC-TF-04-CONFLICT below.
6. **Clean up worktrees.**
7. **Advance to next phase.**

#### Failure Path — wait_for_all (default)

1. Activity `fe` fails after retries are exhausted.
2. Activity `eng` is still running.
3. **Workflow waits for `eng` to complete** (do not cancel it).
4. `eng` completes with `LGTM`.
5. **No worktrees are merged** (no-partial-merge invariant).
6. **Clean up all worktrees** (both eng and fe).
7. **Workflow records failure:** `{ eng: "success", fe: "failed", merged: false }`.
8. **Notify user** with per-agent results.
9. **Enter `waitForSignal("retry-or-cancel")`.**
10. On `retry` → re-dispatch **both** agents (clean slate, step 1).

#### Failure Path — fail_fast

1. Activity `fe` fails after retries are exhausted.
2. Activity `eng` is still running.
3. **Workflow requests cancellation of `eng`** via Temporal.
4. `eng` Activity checks for cancellation at next heartbeat boundary (within 30s).
5. `eng` Activity throws `CancellationError`, cleans up worktree.
6. **No worktrees are merged.**
7. **Workflow records failure** and **notifies user**.
8. **Enter `waitForSignal("retry-or-cancel")`.**

#### ROUTE_TO_USER in Fork/Join

1. Activity `eng` returns `ROUTE_TO_USER`.
2. Activity `fe` is still running.
3. **Workflow waits for `fe` to complete** (do not cancel).
4. Once all Activities have either completed or returned `ROUTE_TO_USER`:
   - If any returned `ROUTE_TO_USER`: enter question flow (FSPEC-TF-02) for each, sequentially.
   - After all questions are answered, re-invoke only the agents that returned `ROUTE_TO_USER`.

#### Merge Conflict (FSPEC-TF-04-CONFLICT)

1. Merge of second worktree conflicts with the first.
2. **Abort merge** (`git merge --abort`).
3. **Revert first merge** to restore feature branch to pre-batch state.
4. **Clean up all worktrees.**
5. **Notify user** with conflicting file list.
6. **Enter failed state.** This is non-retryable (requires manual conflict resolution).

### Business Rules

- **BR-12:** No partial merges. Either all agents succeed and all worktrees merge cleanly, or none merge.
- **BR-13:** Merge order is the order agents appear in the config (`agents: ["eng", "fe"]` means eng merges first).
- **BR-14:** On retry after failure, ALL agents are re-dispatched, even ones that succeeded. This avoids stale worktree state.
- **BR-15:** `fail_fast` cancellation is cooperative — the Activity must check for cancellation at heartbeat boundaries. If the Activity doesn't heartbeat (e.g., subprocess hangs), cancellation won't take effect until `startToCloseTimeout` expires.
- **BR-16:** Fork/join failure policy is per-phase, configured in `ptah.workflow.yaml` under the phase's `failure_policy` field. Default: `wait_for_all`.

### Edge Cases

- **Both agents fail:** Both failures are collected and reported. Same behavior as single failure.
- **One agent succeeds, one returns ROUTE_TO_USER:** Not a failure. The succeeded agent's worktree is held (not merged yet). After the question is answered and the agent re-completes, both worktrees merge.
- **Fork/join with >2 agents:** Same behavior — dispatch all, wait for all, merge in config order.

### Acceptance Tests

**AT-09:** Happy path fork/join.
**Who:** Orchestrator **Given:** A fork/join phase with `[eng, fe]` **When:** Both agents succeed **Then:** Worktrees merge in order (eng then fe). Workflow advances.

**AT-10:** Failure with wait_for_all.
**Who:** Orchestrator **Given:** `wait_for_all` policy, `fe` fails **When:** `eng` completes successfully **Then:** No worktrees merge. User notified with both results. On retry, both re-dispatch.

**AT-11:** Failure with fail_fast.
**Who:** Orchestrator **Given:** `fail_fast` policy, `fe` fails **When:** Cancellation requested for `eng` **Then:** `eng` cancels at next heartbeat. No worktrees merge.

**AT-12:** Merge conflict on second worktree.
**Who:** Orchestrator **Given:** Both agents succeed but worktrees conflict **When:** Second merge fails **Then:** First merge reverted. Feature branch at pre-batch state. User notified with conflict details.

---

## FSPEC-TF-05: Review Cycle Loop

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-TF-05 |
| **Title** | Review Cycle Loop |
| **Linked Requirements** | [REQ-TF-08] |
| **Dependencies** | FSPEC-TF-01, FSPEC-TF-03, FSPEC-TF-04 |

### Description

Specifies the behavioral flow for review phases — from reviewer dispatch through recommendation collection to advancement or revision loop.

### Behavioral Flow

1. **Workflow enters a review phase** (e.g., `req-review`).
2. **Compute reviewer manifest** from `ptah.workflow.yaml` based on the feature's discipline:
   - Read the `reviewers` field for this phase.
   - Select the manifest matching the feature's discipline (`backend-only`, `frontend-only`, `fullstack`).
   - If no discipline-specific manifest exists, use `default`.
3. **Initialize review state** in workflow memory:
   - `reviewerStatuses: { "eng": "pending", "qa": "pending", ... }`
   - `revisionCount` (preserved from prior loops, starts at 0 for first review).
4. **Dispatch reviewer Activities in parallel** — one per reviewer. Each reviewer gets:
   - The document to review (resolved from phase config's `context_documents`).
   - The task type: `Review`.
   - Prior cross-review files (if this is a re-review after revision).
5. **Collect results** as each reviewer Activity completes:
   a. Read the cross-review file produced by the reviewer.
   b. Parse the recommendation: `Approved`, `Approved with minor changes`, or `Needs revision`.
   c. Map to status: `approved` or `revision_requested`.
   d. Update `reviewerStatuses[reviewerKey] = status`.
6. **Evaluate outcome** once ALL reviewers have submitted:

| Condition | Outcome |
|-----------|---------|
| All statuses are `approved` | → **Advance** to next phase (approved phase, then auto-transition) |
| Any status is `revision_requested` AND some are still `pending` | → **Wait** for remaining reviewers |
| Any status is `revision_requested` AND none are `pending` | → **Revision loop** |

7. **If advancing:** Transition to the approved phase (e.g., `req-approved`). The approved phase auto-transitions to the next creation phase.

8. **If revision loop:**
   a. Increment `revisionCount`.
   b. Check revision bound (configurable, default 3).
   c. If bound exceeded → pause workflow, notify user: `Feature '{slug}' has exceeded the maximum of {bound} revision cycles in phase {phase}.` Enter `waitForSignal("resume-or-cancel")`.
   d. If within bound → transition back to creation phase (e.g., `req-review` → `req-creation`).
   e. Re-dispatch the author agent with task type `Revise` and cross-review files in context.
   f. When the author completes (`LGTM`) → re-enter the review phase (step 1). All reviewer statuses reset to `pending`.

### Business Rules

- **BR-17:** "Approved with minor changes" is treated as `approved` for state machine purposes. The minor changes are informational.
- **BR-18:** On revision, ALL reviewers must re-review — not just the ones who requested revision. This prevents approved reviewers from missing changes introduced during revision.
- **BR-19:** The revision count is per-review-phase, not global. `req-review` and `tspec-review` have independent counters.
- **BR-20:** Reviewer Activities use the same retry/failure handling as creation Activities (FSPEC-TF-03). A reviewer Activity failure is retried, not treated as a rejection.
- **BR-21:** If a reviewer returns `ROUTE_TO_USER` instead of a cross-review file, it is handled via FSPEC-TF-02 (question flow). After the question is answered, the reviewer is re-invoked to complete the review.

### Edge Cases

- **Reviewer produces cross-review file with no Recommendation heading:** The Activity is retried (the reviewer agent should be re-invoked). If retries exhaust, the workflow enters failed state.
- **Reviewer produces unrecognized recommendation (e.g., "Conditional Approval"):** Treated as a parse error. Activity is retried.
- **All reviewers approve except one who fails (Activity crash, not rejection):** The failed reviewer is retried per FSPEC-TF-03. If retries exhaust, the workflow enters failed state — not treated as approval.

### Acceptance Tests

**AT-13:** All reviewers approve.
**Who:** Orchestrator **Given:** 3 reviewers for `req-review` **When:** All 3 submit "Approved" **Then:** Workflow advances to `req-approved`, then auto-transitions to `fspec-creation`.

**AT-14:** One reviewer requests revision.
**Who:** Orchestrator **Given:** 3 reviewers **When:** 2 approve, 1 requests revision **Then:** Workflow waits for all 3. After all submit: workflow transitions back to `req-creation` with task type `Revise`. Revision count = 1.

**AT-15:** Revision bound exceeded.
**Who:** Orchestrator **Given:** Revision count is 3 (bound = 3) **When:** Another revision is requested **Then:** Workflow pauses and notifies user. Does not loop again.

---

## FSPEC-MG-01: State Migration Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MG-01 |
| **Title** | State Migration Flow |
| **Linked Requirements** | [REQ-MG-01] |
| **Dependencies** | None |

### Description

Specifies the behavioral flow for the `ptah migrate` CLI command that migrates v4 `pdlc-state.json` to Temporal Workflows.

### Behavioral Flow

1. **Read `pdlc-state.json`.**
   - If file not found → error: `pdlc-state.json not found. Nothing to migrate.`
   - If file is malformed JSON → error: `pdlc-state.json is not valid JSON: {parse error}.`
2. **Read `ptah.workflow.yaml`.**
   - If file not found → error: `ptah.workflow.yaml not found. Run 'ptah init' first.`
3. **Build phase mapping.**
   a. If `--phase-map <path>` is provided:
      - Read the JSON mapping file.
      - Validate: all keys are valid v4 `PdlcPhase` enum values; all values are phase IDs in `ptah.workflow.yaml`.
      - If validation fails → error listing invalid entries.
   b. If no `--phase-map`:
      - Use built-in mapping (v4 enum → default PDLC preset phase IDs).
      - Example: `TSPEC_CREATION` → `tspec-creation`, `REQ_REVIEW` → `req-review`.
4. **Validate all features are mappable.**
   - For each feature in the state file, check that its current v4 phase has a mapping.
   - Collect all unmappable features.
   - If any unmappable → abort: `Migration failed: {N} feature(s) have unmapped phases: {list}. Use --phase-map to provide a custom mapping.`
5. **If `--dry-run`:**
   - Print a table: `| Feature | v4 Phase | v5 Phase | Workflow ID | Status |`
   - Exit without creating workflows.
6. **Connect to Temporal.**
   - Read connection config from `ptah.config.json`.
   - If connection fails → error: `Cannot connect to Temporal at {address}. Ensure the server is running.`
7. **Create workflows** for each feature:
   - **In-progress features** (phase != DONE):
     a. Compute workflow ID: `ptah-feature-{slug}-1`.
     b. Start a Temporal Workflow with the feature's config, positioned at the mapped v5 phase.
     c. If review phase: transfer reviewer statuses and revision count from v4 state.
     d. If fork/join phase with partial completion: transfer subtask statuses.
   - **Completed features** (phase == DONE, `--include-completed` flag):
     a. Create a workflow that immediately transitions to DONE.
     b. Preserves history for observability.
8. **Validate imports.**
   - Query each created workflow to verify its phase matches the expected v5 phase.
   - If any mismatch → warning: `Workflow {id} expected phase {expected} but reports {actual}.`
9. **Print summary report:**
   ```
   Migration complete.
   - Active workflows created: {N}
   - Completed workflows imported: {M}
   - Skipped (already migrated): {K}
   - Warnings: {W}
   ```

### Business Rules

- **BR-22:** Migration is idempotent. If a workflow with the same ID already exists, skip it and count as "already migrated."
- **BR-23:** Review phase state (reviewer statuses, revision count) must be faithfully transferred. A feature mid-review should resume with the same pending/approved/rejected reviewer statuses.
- **BR-24:** The built-in phase mapping covers all 15 v4 `PdlcPhase` values. It is hardcoded, not configurable (it maps to the default preset which replicates v4 exactly).
- **BR-25:** `--include-completed` is opt-in because importing completed workflows is only useful for observability history. Default: skip completed features.

### Edge Cases

- **Empty state file (no features):** Success with summary showing 0 created.
- **Feature with `forkJoin` state partially completed:** Transfer the subtask statuses. On Temporal resume, the workflow checks which subtasks are already complete and only dispatches pending ones.
- **Feature paused on a question (ROUTE_TO_USER):** The migration creates the workflow in the appropriate phase. The pending question is NOT automatically transferred (questions are in `pending.md`, not `pdlc-state.json`). The user must re-submit the question. A warning is emitted: `Feature '{slug}' was paused on a question. The pending question was not migrated — the agent will re-ask when resumed.`

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Temporal connection fails | Abort before creating any workflows. |
| Workflow creation fails for one feature | Log error, continue with remaining features. Summary includes the failure. |
| `--phase-map` file not found | Error: `Phase map file not found: {path}` |
| `--phase-map` has unmapped v4 phases | Error listing which v4 phases in the state file are not covered by the map. |

### Acceptance Tests

**AT-16:** Successful migration with default preset.
**Who:** Developer **Given:** `pdlc-state.json` with 2 active features and the default `ptah.workflow.yaml` **When:** `ptah migrate` **Then:** 2 Temporal Workflows created at correct phases. Summary confirms 2 active, 0 completed.

**AT-17:** Migration with custom phase map.
**Who:** Developer **Given:** A custom `ptah.workflow.yaml` and a phase map file **When:** `ptah migrate --phase-map custom-map.json` **Then:** Features mapped using custom file. All workflows at correct phases.

**AT-18:** Unmapped phase aborts migration.
**Who:** Developer **Given:** A custom workflow missing `fspec-creation` and a feature at `FSPEC_CREATION` **When:** `ptah migrate` **Then:** Abort with error listing the unmapped phase. No workflows created.

**AT-19:** Dry-run reports without creating workflows.
**Who:** Developer **Given:** `pdlc-state.json` with 3 features **When:** `ptah migrate --dry-run` **Then:** Table printed. No Temporal connection attempted. No workflows created.

---

## 2. Requirements Not Requiring FSPEC (Direct-to-TSPEC)

The following requirements have sufficient behavioral detail in the REQ or are purely data-driven (config schema, query definitions, NFRs):

| Requirement | Reason for Direct-to-TSPEC |
|-------------|---------------------------|
| REQ-TF-01 | Workflow creation — straightforward Temporal API usage |
| REQ-TF-04 | Query definitions — data contract, no branching logic |
| REQ-TF-07 | Worktree lifecycle — well-understood from v4; no new behavioral flows |
| REQ-CD-01 | Config parsing — schema definition, no behavioral branching |
| REQ-CD-02 | Agent mapping — config lookup, no multi-step flow |
| REQ-CD-03 | Reviewer manifests — config lookup with discipline selection |
| REQ-CD-04 | Transition rules — graph walker; rules enumerated in REQ |
| REQ-CD-05 | Validation — rules fully enumerated in REQ acceptance criteria |
| REQ-CD-06 | Default preset — data definition (replicating v4) |
| REQ-CD-07 | Context matrix — config-to-file-path resolution |
| REQ-MG-02 | Dry-run — subset of MG-01 (FSPEC-MG-01 step 5) |
| REQ-NF-15-01 | Deployment config — connection parameters |
| REQ-NF-15-02 | Observability — attribute definitions |
| REQ-NF-15-03 | Worker config — parameter definitions |

---

## 3. Open Questions

None. All behavioral ambiguities from the REQ (heartbeat mechanism, fork/join failure policy, migration mapping, Signal reliability, workflow versioning, Worker topology, Workflow ID collision) were resolved in REQ v1.2 based on the engineer cross-review.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 2, 2026 | Product Manager | Initial FSPEC. 6 specifications: FSPEC-TF-01..05, FSPEC-MG-01. 19 acceptance tests. 25 business rules. |

---

*End of Document*
