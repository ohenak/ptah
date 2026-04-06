# Functional Specification

## Agent Coordination

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-AC |
| **Parent Document** | [REQ-agent-coordination](REQ-agent-coordination.md) |
| **Version** | 1.1 |
| **Date** | April 6, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Overview

This document specifies the behavioral flows for the 3 areas of the agent-coordination feature that have branching logic, multi-step decision flows, or business rules the engineer should not be deciding alone. All 3 FSPECs are in the MR (Ad-Hoc Message Routing) domain.

The 5 WB (Worktree/Branch) domain requirements and 2 NF (Non-Functional) domain requirements are **direct-to-TSPEC** — their behavior is sufficiently defined in the REQ. They describe clear "change from X to Y" patterns without branching logic.

### FSPEC Coverage

| FSPEC ID | Title | Linked Requirements |
|----------|-------|---------------------|
| FSPEC-MR-01 | Ad-Hoc Message Routing Flow | REQ-MR-01, REQ-MR-02, REQ-MR-03, REQ-MR-04, REQ-MR-05, REQ-MR-08 |
| FSPEC-MR-02 | Ad-Hoc Revision Queue Management | REQ-MR-06 |
| FSPEC-MR-03 | Downstream Phase Cascade | REQ-MR-07 |

### Direct-to-TSPEC Requirements

| Requirement | Rationale for Skipping FSPEC |
|-------------|------------------------------|
| REQ-WB-01 | Data model change: per-agent branch → shared branch. No decision logic. |
| REQ-WB-02 | Worktree creation from existing branch instead of new branch. Single path. |
| REQ-WB-03 | Commit pathway change: merge eliminated, direct push. Single path. |
| REQ-WB-04 | Idempotency check change: branch match → path match. Single decision. |
| REQ-WB-05 | Branch creation at workflow start. Idempotent single step. |
| REQ-NF-01 | Sequential consistency constraint. Not a behavioral flow. |
| REQ-NF-02 | Future-proofing documentation requirement. Not a behavioral flow. |

---

## FSPEC-MR-01: Ad-Hoc Message Routing Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MR-01 |
| **Title** | Ad-Hoc Message Routing Flow |
| **Linked Requirements** | [REQ-MR-01], [REQ-MR-02], [REQ-MR-03], [REQ-MR-04], [REQ-MR-05], [REQ-MR-08] |
| **Dependencies** | None |

### Description

Specifies the complete end-to-end flow from a user sending a message to a feature's Discord thread through to either dispatching an ad-hoc revision signal to the Temporal workflow or posting an error reply. This is the "message intake" pipeline — it runs in the orchestrator layer (not inside the Temporal workflow) and produces either a Temporal signal or a Discord error message.

### Behavioral Flow

1. **User sends a message** to a Discord thread associated with a feature.
2. **Extract first token.** Strip leading whitespace from the message body. Extract the first whitespace-delimited token.
3. **Check for @-directive.** Determine if the first token matches the pattern `@{identifier}` (case-insensitive). If it does not start with `@`, the message is **not an ad-hoc request** — pass it through to existing message handling (unchanged behavior). Flow ends.
4. **Resolve agent ID.** Extract the identifier from `@{identifier}`. Match it (case-insensitive) against the agents registered in the feature's workflow configuration. The minimum matching requirement is against `agent.id` (e.g., `pm`, `eng`, `qa`). The system may also match against additional agent identifiers (e.g., display names) — this is a system-level concern deferred to the TSPEC per REQ Assumption #5.
   - If **no match** → go to step 5 (unknown agent).
   - If **match found** → go to step 6 (known agent).
5. **Unknown agent rejection ([REQ-MR-03]).**
   a. Post a visible error reply in the Discord thread: `"Agent @{identifier} is not part of the {feature-slug} workflow. Known agents: {comma-separated list of agent IDs}."`
   b. Do NOT send any Temporal signal.
   c. Flow ends.
6. **Resolve workflow ID ([REQ-MR-08]).** Construct the deterministic Temporal workflow ID: `ptah-{featureSlug}`.
7. **Check workflow existence ([REQ-MR-05]).** Attempt to send the signal to the constructed workflow ID. If the workflow does not exist (signal delivery returns "workflow not found"):
   a. Post a visible error reply in the Discord thread: `"No active workflow found for {feature-slug}."`
   b. Flow ends.
8. **Send ad-hoc revision signal ([REQ-MR-02]).** Deliver an `adHocRevision` signal to the Temporal workflow with payload:
   - `targetAgentId`: the resolved agent ID
   - `instruction`: the remainder of the message after the `@{identifier}` token (trimmed)
   - `requestedBy`: the Discord user who sent the message
   - `requestedAt`: timestamp of the message
9. **Post acknowledgement ([REQ-MR-04]).** Post a visible acknowledgement reply in the Discord thread: `"Dispatching @{agent-id}: {first 100 characters of instruction}..."` (truncate if instruction exceeds 100 characters; omit ellipsis if it does not).

### Business Rules

- **BR-01:** The `@{identifier}` must be the **first token** of the message. An `@{identifier}` appearing mid-sentence (e.g., "The issue is that @pm wrote conflicting docs") does NOT classify the message as an ad-hoc request.
- **BR-02:** Agent ID matching is **case-insensitive**. `@PM`, `@pm`, and `@Pm` all resolve to agent `pm`.
- **BR-03:** The instruction payload is the **full remainder** of the message after the `@{identifier}` token, with leading/trailing whitespace trimmed. If the remainder is empty (user sent only `@pm` with no instruction), the instruction is an empty string — the agent will execute with no specific task directive.
- **BR-04:** The workflow existence check in step 7 is performed **implicitly** via the signal delivery attempt, not as a separate query. If the signal delivery fails with a "workflow not found" error, the orchestrator treats this as the inactive case. This avoids a race condition where the workflow terminates between a query and a signal.
- **BR-05:** Steps 8 and 9 are **not atomic**. If the signal is sent (step 8) but the acknowledgement fails to post (step 9, e.g., Discord API error), the signal is still delivered. The user may not see the acknowledgement, but the revision will still execute. This is acceptable — a missing acknowledgement is a minor UX degradation, not a correctness issue.

### Edge Cases

- **Empty instruction:** User sends `@pm` with no trailing text. The signal is sent with an empty instruction string. The agent runs with its default task behavior for the phase.
- **Multiple @ tokens:** User sends `@pm @eng update the docs`. Only the first token (`@pm`) is parsed as the directive. The remainder (`@eng update the docs`) is the instruction text. `@eng` is treated as part of the instruction, not a second directive.
- **Bot messages:** Messages from bots (including Ptah itself) must be ignored. The orchestrator should not parse its own acknowledgement messages as ad-hoc requests.
- **Concurrent messages:** Two users send `@pm ...` and `@eng ...` simultaneously. Each message is processed independently through steps 1-9. Both signals are delivered to the workflow's queue (see FSPEC-MR-02).

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| First token is not an @-directive | Not an ad-hoc request. Pass to existing message handling. |
| Agent ID not found in workflow config | Error reply to Discord thread (step 5). No signal sent. |
| Workflow not found (completed/cancelled/not started) | Error reply to Discord thread (step 7). No signal sent. |
| Temporal signal delivery fails (network error) | Log the error. Post error reply to Discord: "Failed to dispatch to @{agent-id}. Please try again." |
| Discord acknowledgement fails | Signal was already sent (step 8). Log warning. Agent will execute; user just won't see the ack. |

### Acceptance Tests

**AT-01:** Successful dispatch and acknowledgement.
```
WHO:   As the orchestration system
GIVEN: Feature messaging-abstraction has an active workflow (ptah-messaging-abstraction)
       and agent pm is registered in the workflow config
WHEN:  User sends "@pm address feedback from CROSS-REVIEW-engineer-REQ.md"
THEN:  An adHocRevision signal is sent to workflow ptah-messaging-abstraction
       with targetAgentId="pm" and instruction="address feedback from CROSS-REVIEW-engineer-REQ.md",
       and the Discord thread receives an acknowledgement:
       "Dispatching @pm: address feedback from CROSS-REVIEW-engineer-REQ.md"
```

**AT-02:** Unknown agent is rejected.
```
WHO:   As the orchestration system
GIVEN: Feature messaging-abstraction's workflow uses agents: pm, eng, qa
WHEN:  User sends "@designer create a mockup"
THEN:  No Temporal signal is sent,
       and the Discord thread receives:
       "Agent @designer is not part of the messaging-abstraction workflow. Known agents: pm, eng, qa."
```

**AT-03:** No active workflow.
```
WHO:   As the orchestration system
GIVEN: No active workflow exists for feature messaging-abstraction
WHEN:  User sends "@pm address feedback"
THEN:  No signal is delivered (signal attempt returns "workflow not found"),
       and the Discord thread receives:
       "No active workflow found for messaging-abstraction."
```

**AT-04:** Mid-sentence @-mention is not an ad-hoc request.
```
WHO:   As the orchestration system
GIVEN: Feature messaging-abstraction has an active workflow
WHEN:  User sends "The issue is that @pm wrote conflicting docs"
THEN:  The message is NOT classified as an ad-hoc request,
       no adHocRevision signal is sent,
       and the message is passed to existing message handling
```

**AT-05:** Case-insensitive matching.
```
WHO:   As the orchestration system
GIVEN: Feature messaging-abstraction has an active workflow with agent pm
WHEN:  User sends "@PM update the REQ"
THEN:  The message is classified as an ad-hoc request for agent pm,
       and the signal is dispatched normally
```

---

## FSPEC-MR-02: Ad-Hoc Revision Queue Management

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MR-02 |
| **Title** | Ad-Hoc Revision Queue Management |
| **Linked Requirements** | [REQ-MR-06] |
| **Dependencies** | FSPEC-MR-01 |

### Description

Specifies how the Temporal workflow manages an ordered queue of `adHocRevision` signals, including when signals are enqueued, when they are dequeued for processing, and how the cascade-blocking rule prevents concurrent agent execution.

### Behavioral Flow

1. **Signal arrives.** The workflow receives an `adHocRevision` signal (from FSPEC-MR-01 step 8). The signal handler appends the signal payload to the end of the pending queue. The queue is an ordered list (FIFO).
2. **Check processing eligibility.** The workflow's main processing loop checks the queue at **phase transition points** (after each phase completes, before advancing to the next phase). The dequeue condition is:
   - The workflow is NOT currently executing an ad-hoc revision activity.
   - The workflow is NOT currently executing a downstream cascade triggered by a prior ad-hoc revision (see FSPEC-MR-03).
   - The workflow's current phase is NOT in the middle of an agent activity invocation.
3. **Dequeue and process.** When the dequeue condition is satisfied and the queue is non-empty:
   a. Remove the first signal from the queue (FIFO order).
   b. Invoke the named agent (`targetAgentId`) with the instruction text as the task. The agent receives the same worktree and context setup as a normal phase invocation — it creates a worktree from `feat-{featureSlug}`, does its work, commits, and pushes.
   c. Wait for the agent activity to complete.
   d. If the agent returns `ROUTE_TO_USER`:
      - Follow the standard question flow (same as normal phase execution): post the question to Discord, wait for user answer signal, re-invoke the agent with the answer in context.
      - After the question flow resolves, continue to step 3e.
   e. After the agent activity completes with `LGTM` or `TASK_COMPLETE`:
      - Check if a downstream cascade is needed (FSPEC-MR-03). If yes, execute the cascade to completion before dequeuing the next signal.
      - After cascade completes (or if no cascade needed), return to step 2 to check for more queued signals.
4. **Queue during normal phases.** If an `adHocRevision` signal arrives while the workflow is executing a normal sequential phase (not an ad-hoc revision), the signal is enqueued (step 1) but NOT processed until the current phase completes. The workflow's main loop checks the queue at each phase transition point.

### Business Rules

- **BR-01 (FIFO ordering):** Signals are processed in the order they were received. The queue never reorders, drops, or deduplicates signals.
- **BR-02 (Cascade-blocking):** A queued signal is NOT dequeued until both (a) the current ad-hoc agent activity and (b) all cascade phases triggered by that activity have fully completed. This prevents two agent activities from running simultaneously.
- **BR-03 (No queue depth limit — product decision):** There is no maximum queue depth enforced at the product layer. Signals accumulate until the workflow terminates. The practical upper bound is the Temporal event history limit (default 50k events). The TSPEC may implement a soft cap (e.g., 50 pending signals) as a defensive measure, but this is an implementation decision, not a product requirement.
- **BR-04 (Signal arrival during cascade):** If an `adHocRevision` signal arrives while a cascade is in progress, it is enqueued normally. The cascade runs to completion. Then the next queued signal is dequeued and processed.
- **BR-05 (Signal arrival during question flow):** If an `adHocRevision` signal arrives while the workflow is waiting for a user answer (ROUTE_TO_USER), it is enqueued. The question flow must complete before the queued signal is processed. The user answer flow takes priority over queued ad-hoc signals.
- **BR-06 (Ad-hoc during ad-hoc):** If an `adHocRevision` for agent B arrives while agent A's ad-hoc revision is running, agent B's signal is queued. After agent A finishes (including any cascade), agent B's signal is dequeued and processed.

### Edge Cases

- **Same agent queued twice:** User sends `@pm fix REQ` then `@pm also fix FSPEC` before the first completes. Both signals are queued. After the first `@pm` ad-hoc completes (including cascade), the second `@pm` ad-hoc is dequeued and processed. The agent runs twice, sequentially.
- **Queue drains during cascade:** Three signals queued: `@pm`, `@eng`, `@qa`. Processing `@pm` triggers a cascade. During the cascade, the `@eng` signal waits. After cascade completes, `@eng` is dequeued, processed (with possible cascade), then `@qa`.
- **Workflow terminates with non-empty queue:** If the workflow reaches its terminal state (all phases complete) while signals are still queued, the remaining signals are processed before the workflow terminates. The workflow does not terminate until the queue is drained.
- **Continue-as-new with non-empty queue:** If a Temporal continue-as-new is triggered while signals are queued, the queue state must be carried across the continue-as-new boundary. No signals are lost.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Queued agent activity fails (non-retryable) | Enter the standard failure flow (retry/cancel prompt to user). If cancelled, skip this queued signal and process the next one. |
| Queued agent activity fails (retryable) | Temporal retries automatically per retry policy. Queue processing resumes after retry succeeds or exhausts. |
| Cascade phase fails during queue processing | Same failure flow as normal phase failures. The cascade must resolve (retry or cancel) before the next queued signal is processed. |

### Acceptance Tests

**AT-01:** Two signals queued and processed in FIFO order.
```
WHO:   As the orchestration system
GIVEN: The workflow is processing a normal phase
WHEN:  User sends "@pm fix the REQ" followed by "@eng update the TSPEC"
       before the normal phase completes
THEN:  Both signals are queued,
       after the normal phase completes, the pm ad-hoc runs first,
       after pm completes (including any cascade), the eng ad-hoc runs second,
       and both produce Discord acknowledgements in order
```

**AT-02:** Cascade blocks next signal.
```
WHO:   As the orchestration system
GIVEN: An adHocRevision for pm is in progress,
       pm's ad-hoc triggers a downstream cascade (eng-review re-runs),
       and a queued signal for eng is waiting
WHEN:  The pm ad-hoc activity completes
THEN:  The eng-review cascade phase runs to completion BEFORE
       the queued eng ad-hoc signal is dequeued
```

**AT-03:** Signal during ROUTE_TO_USER waits.
```
WHO:   As the orchestration system
GIVEN: Agent pm is in a ROUTE_TO_USER wait state (waiting for user answer)
WHEN:  User sends "@eng update the TSPEC"
THEN:  The eng signal is queued but NOT processed,
       after the user answers pm's question and pm completes,
       the eng signal is dequeued and processed
```

---

## FSPEC-MR-03: Downstream Phase Cascade

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-MR-03 |
| **Title** | Downstream Phase Cascade |
| **Linked Requirements** | [REQ-MR-07] |
| **Dependencies** | FSPEC-MR-01, FSPEC-MR-02 |

### Description

Specifies how the workflow automatically identifies and re-runs downstream review phases after an ad-hoc revision completes. The cascade ensures that all review phases that might be affected by the revised artifacts are re-evaluated with the latest content.

### Behavioral Flow

1. **Ad-hoc revision completes.** An agent invoked via ad-hoc revision (FSPEC-MR-02 step 3) returns `LGTM` or `TASK_COMPLETE` and has pushed updated artifacts to the shared feature branch.
2. **Identify the revised agent's position.** Find the revised agent's phase in the workflow configuration's phase array. The position is the array index of the phase whose `agent` field matches the revised agent's ID.
   - If the revised agent appears in multiple phases (e.g., as a creation agent and also as a reviewer), use the **first phase** where the agent appears as the primary agent (i.e., `phase.agent === agentId`, not as a reviewer).
   - If the revised agent does not appear in any phase (edge case — agent was added to the workflow config but has no assigned phase), skip the cascade. Log a warning: `"Ad-hoc agent {agentId} not found in any workflow phase — skipping cascade."`
3. **Collect cascade phases.** Scan all phases with a strictly higher index than the revised agent's position. Collect those with `type: "review"`. Phases with types `"creation"`, `"approved"`, or `"implementation"` are NOT included in the cascade.
4. **Check for empty cascade.** If no `type: "review"` phases exist after the revised agent's position, the cascade is complete (no-op). Proceed to FSPEC-MR-02 step 2 (check queue for next signal).
5. **Execute cascade phases sequentially.** For each collected cascade phase, in order of their position in the workflow config:
   a. Invoke the cascade phase using the **same dispatch logic as normal phase execution**: create a worktree from `feat-{featureSlug}` (which now contains the revised artifacts), assemble context, dispatch the phase's agent.
   b. The cascade phase agent receives the latest artifacts from the shared branch — no special context assembly is needed beyond the normal phase context.
   c. Wait for the cascade phase to complete.
   d. **If the cascade phase returns `LGTM` or `TASK_COMPLETE`:**
      - Continue to the next cascade phase (step 5a for the next phase in the collection).
   e. **If the cascade phase returns `ROUTE_TO_USER`:**
      - Follow the standard question flow. After the question is answered and the agent completes, continue to step 5d.
   f. **If the cascade review phase determines the artifact needs revision** (i.e., the review cycle's recommendation parsing yields `revision_requested` via the existing recommendation-to-status mapping):
      - **Identify the creation phase** for this review phase using the **positional convention**: the creation phase is `workflowConfig.phases[reviewIndex - 1]`, where `reviewIndex` is the review phase's index in the **original workflow config phase array** (not the cascade collection). The creation agent is `creationPhase.agent`.
      - Enter the **standard revision loop**: invoke the creation agent to address the feedback, then re-run the review phase.
      - The revision loop follows the same logic as normal workflow revision cycles — the creation agent is re-invoked with the review feedback in context, and the review phase re-runs after the creation agent pushes updated artifacts.
      - The revision loop is bounded by the `revision_bound` configured on the phase (from `WorkflowConfig`). If the revision bound is exceeded, the cascade phase is treated as failed (enter failure flow).
      - After the revision loop resolves (reviewer approves), continue to the next cascade phase (step 5a).
6. **Cascade complete.** All cascade phases have been executed. Return control to FSPEC-MR-02 step 2 (check queue for next signal).

### Business Rules

- **BR-01 (All subsequent reviews):** The cascade re-runs ALL `type: "review"` phases after the revised agent's position, not just those whose `creationPhase` corresponds to the revised agent. This conservative approach ensures complete downstream consistency at the cost of potentially re-running reviews that were unaffected. It is simpler to implement and eliminates the risk of stale reviews persisting.
- **BR-02 (Sequential execution):** Cascade phases execute sequentially, one at a time. No parallel execution within the cascade. This maintains the sequential consistency constraint ([REQ-NF-01]).
- **BR-03 (Revision loop within cascade):** If a cascaded review phase requests a revision, the standard revision loop runs. The creation phase is identified by the **positional convention**: `workflowConfig.phases[reviewIndex - 1]` in the original config array. The creation agent is that phase's `agent` field. The cascade does not short-circuit back to the original ad-hoc revision agent — the revision targets the phase that the review is structurally positioned to review.
- **BR-08 (Workflow config structure constraint):** For the cascade's positional creation-phase identification to work correctly, workflow configs MUST place each `type: "review"` phase immediately after its corresponding `type: "creation"` phase (or after any intervening `type: "approved"` auto-transition phase). If a review phase at index N has `phases[N-1]` pointing to another review phase, the cascade's revision loop will invoke that review phase's agent as if it were the creation agent — which produces incorrect behavior. This is the same positional convention used by the main workflow loop and is not a new constraint.
- **BR-04 (Cascade uses latest artifacts):** Each cascade phase pulls the latest `feat-{featureSlug}` before starting. This means each cascade phase sees the cumulative result of all prior cascade phases and revision loops.
- **BR-05 (Cascade is blocking):** No queued `adHocRevision` signals are processed until the cascade completes (enforced by FSPEC-MR-02 BR-02). The cascade is treated as an extension of the ad-hoc revision that triggered it.
- **BR-06 (No cascade for non-review phases):** Phases with types `"creation"`, `"approved"`, or `"implementation"` are never included in the cascade, even if they appear after the revised agent's position.
- **BR-07 (Normal workflow resumes after cascade):** After the cascade completes and all queued signals are processed, the workflow resumes its normal sequential phase execution. The cascade does not alter the workflow's phase cursor (`state.currentPhaseId`) or the set of completed phases (`state.completedPhaseIds`). Specifically: ad-hoc signals are processed at phase transition points (after a phase completes, before the next phase starts). At that point, the phase cursor already points to the next unexecuted phase. After queue processing completes, the workflow advances to that phase as normal. No already-completed phase is re-executed as a result of the cascade.

### Edge Cases

- **Revised agent is the last phase:** If the ad-hoc revision targets an agent in the last phase of the workflow, there are no subsequent phases to cascade. The cascade is a no-op.
- **Revised agent is after all review phases:** If the ad-hoc revision targets an agent whose position is after all `type: "review"` phases, the cascade collects zero phases. No-op.
- **Multiple creation agents between reviews:** The workflow has phases `pm-create → eng-review → qa-review`. An ad-hoc revision of `pm` cascades both `eng-review` and `qa-review`. If `eng-review` requests a revision of the PM's REQ, the PM is re-invoked (standard revision loop), then `eng-review` re-runs, then `qa-review` runs with the updated artifacts.
- **Skip conditions during cascade:** If a cascade phase has a `skip_if` condition that is currently satisfied, the phase is skipped during the cascade (same as normal phase execution). The cascade continues with the next phase.
- **Ad-hoc revision during cascade (handled by FSPEC-MR-02):** If a new `adHocRevision` signal arrives during cascade execution, it is queued per FSPEC-MR-02 BR-04. It does not interrupt the cascade.

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Cascade review phase fails (non-retryable) | Standard failure flow: notify user, wait for retry/cancel signal. If cancelled, mark cascade as failed and proceed to next queued signal. |
| Cascade revision loop exceeds revision_bound | Phase is treated as failed. Standard failure flow applies. |
| Revised agent not found in workflow phases | Log warning. No cascade executed. Process next queued signal. |
| Git conflict during cascade phase | Non-retryable error. Failure flow applies. Cascade halts. |

### Acceptance Tests

**AT-01:** PM revision cascades to downstream reviews.
```
WHO:   As the orchestration system
GIVEN: Workflow phases: pm-create → eng-review → qa-review → implementation,
       and an adHocRevision for pm completes with updated REQ artifacts
WHEN:  The cascade is triggered
THEN:  eng-review is re-run (it pulls the latest feat-{featureSlug} with updated REQ),
       then qa-review is re-run (it pulls the latest feat-{featureSlug}),
       implementation is NOT re-run (type is "implementation", not "review"),
       and the user sees Discord notifications for each cascade phase
```

**AT-02:** Engineer revision cascades only to phases after engineer.
```
WHO:   As the orchestration system
GIVEN: Workflow phases: pm-create → eng-review → eng-tspec → qa-review,
       and an adHocRevision for eng (position: eng-tspec) completes
WHEN:  The cascade is triggered
THEN:  Only qa-review is re-run (it is the only type:"review" phase after eng-tspec),
       eng-review is NOT re-run (it is before eng-tspec in the phase array)
```

**AT-03:** Cascade review requests a revision.
```
WHO:   As the orchestration system
GIVEN: An ad-hoc revision of pm triggers a cascade,
       and eng-review returns "Needs revision" for the PM's REQ
WHEN:  The standard revision loop begins
THEN:  The pm agent is re-invoked to address eng feedback (not the ad-hoc instruction),
       eng-review re-runs after pm pushes updated artifacts,
       and after eng-review approves, qa-review is re-run as the next cascade phase
```

**AT-04:** No cascade when revised agent is last.
```
WHO:   As the orchestration system
GIVEN: Workflow phases: pm-create → eng-review → qa-review,
       and an adHocRevision for qa (position: qa-review, last review) completes
WHEN:  The cascade check runs
THEN:  No cascade phases are collected (no type:"review" phases after qa-review),
       and the workflow proceeds to check the queue for the next signal
```

**AT-05:** Skip condition respected during cascade.
```
WHO:   As the orchestration system
GIVEN: Workflow phases: pm-create → fspec-review (skip_if: config.skipFspec=true) → eng-review,
       feature config has skipFspec=true,
       and an adHocRevision for pm triggers a cascade
WHEN:  The cascade collects phases
THEN:  fspec-review is skipped (skip_if condition is satisfied),
       eng-review is re-run normally
```

---

## 2. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| — | None | — | All questions resolved in REQ (OQ-01 through OQ-05 closed) |

---

## 3. Requirement → FSPEC Mapping

| Requirement | FSPEC | Direct-to-TSPEC? |
|-------------|-------|-------------------|
| REQ-WB-01 | — | Yes |
| REQ-WB-02 | — | Yes |
| REQ-WB-03 | — | Yes |
| REQ-WB-04 | — | Yes |
| REQ-WB-05 | — | Yes |
| REQ-MR-01 | FSPEC-MR-01 | — |
| REQ-MR-02 | FSPEC-MR-01 | — |
| REQ-MR-03 | FSPEC-MR-01 | — |
| REQ-MR-04 | FSPEC-MR-01 | — |
| REQ-MR-05 | FSPEC-MR-01 | — |
| REQ-MR-06 | FSPEC-MR-02 | — |
| REQ-MR-07 | FSPEC-MR-03 | — |
| REQ-MR-08 | FSPEC-MR-01 | — |
| REQ-NF-01 | — | Yes |
| REQ-NF-02 | — | Yes |

---

*End of Document*
