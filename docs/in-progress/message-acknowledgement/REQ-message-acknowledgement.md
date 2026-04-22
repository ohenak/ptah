# Requirements Document

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-message-acknowledgement |
| **Parent Document** | [REQ-017 — Temporal Integration Completion](../../completed/017-temporal-integration-completion/017-REQ-temporal-integration-completion.md) |
| **Version** | 1.2 |
| **Date** | April 21, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

When `TemporalOrchestrator.handleMessage()` receives a Discord thread message and acts on it — starting a workflow or routing a signal — it currently gives the user zero visible feedback in Discord. The user cannot tell whether their message was received, what Ptah did with it, or whether an error occurred. They are left guessing, refreshing the Temporal UI, or checking server logs.

This feature adds **per-message acknowledgement** directly in the Discord thread. The acknowledgement must be:

- **Immediate** — visible within a few seconds of the message being sent
- **Unambiguous** — the user knows specifically what happened (workflow started vs. answer received vs. error)
- **Low-noise** — it does not clutter the thread with verbose bot replies on every interaction

The recommendation is a **two-tier approach**:

| Tier | Mechanism | When Used |
|------|-----------|-----------|
| **Tier 1 — Reaction** | Emoji reaction on the triggering message | All success cases — instant, low-noise |
| **Tier 2 — Plain reply** | Short plain-text message in the thread | Failure cases and workflow-started (provides context a reaction alone cannot) |

Reactions are preferred over replies for success cases because they attach to the user's message (no scroll disruption), are instantly visible, and do not generate notification noise for other thread participants. A plain reply is added for failures so the user receives actionable error context, and for the workflow-started case so the user sees the workflow ID (useful for debugging and Temporal UI navigation).

---

## 2. User Scenarios

### US-33: Developer Knows Ptah Received Their Feature Thread Message

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer posts the first message in a thread named `017-message-acknowledgement`. They want to know immediately that Ptah detected the message and started a workflow — without having to open the Temporal Web UI to check. |
| **Goals** | Instant, in-Discord confirmation that the feature workflow has been initiated. Know the workflow ID without leaving Discord. |
| **Pain points** | Currently nothing happens in Discord. The developer must switch to the Temporal UI, wait for the workflow to appear, and search for it by slug — adding friction and uncertainty. |
| **Key needs** | A reaction on their message (e.g. ✅) and a brief reply confirming the workflow ID and that it has started. |

### US-34: Developer Knows Their Answer Was Delivered to the Workflow

| Attribute | Detail |
|-----------|--------|
| **Description** | An agent has asked the developer a question and the workflow is paused. The developer types their answer in the thread. They want to know the answer was received and the workflow is resuming — without having to watch the Temporal UI for the signal to appear. |
| **Goals** | Instant confirmation that the `user-answer` signal was delivered. Confidence that the workflow will resume. |
| **Pain points** | Currently nothing happens after they post their answer. They do not know if the signal was delivered, if the workflow is resuming, or if their message was silently ignored. |
| **Key needs** | A reaction on their message (e.g. ✅) confirming the answer was received. No verbose reply needed — the reaction is sufficient for this routine interaction. |

### US-35: Developer Knows When Ptah Failed to Process Their Message

| Attribute | Detail |
|-----------|--------|
| **Description** | The developer posts a message in a feature thread but the Temporal operation fails (e.g. Temporal is unreachable, workflow creation times out). Currently the error is logged server-side and the developer sees nothing. They may re-send the same message multiple times not knowing the first already failed. |
| **Goals** | Know immediately that Ptah could not process the message. Understand why (brief error context). Know they may need to retry or investigate. |
| **Pain points** | Silent failure is indistinguishable from success when there is no acknowledgement at all. The developer wastes time waiting for a workflow that will never appear. |
| **Key needs** | A reaction on their message (e.g. ❌) and a plain-text reply with a brief error description (not a raw stack trace). |

---

## 3. Scope Boundaries

### 3.1 In Scope

- Emoji reaction on the triggering message for all three outcomes: workflow started (✅), signal routed (✅), operation failed (❌)
- Plain-text `replyToMessage` on the triggering message for: workflow started (includes workflow ID) and operation failed (includes brief error description)
- No plain-text reply for signal routed — reaction alone is sufficient for routine answer delivery
- Acknowledgement sent after the Temporal operation completes (success or failure), not before
- Failure of the acknowledgement itself (e.g. Discord rate limit on reaction) must be logged and swallowed — must not crash the orchestrator or retry indefinitely

### 3.2 Out of Scope

- Rich embeds or formatted cards for acknowledgement messages (plain text only)
- Acknowledgement for messages that were silently ignored (pattern did not match, bot message) — no feedback for non-feature threads
- Acknowledgement for the **Temporal query failure path**: when `queryWorkflowState()` throws a non-`WorkflowNotFoundError` (e.g. Temporal server unreachable), `handleMessage()` performs a silent early-exit before any Temporal operation is attempted. This is a pre-routing guard, not a Temporal operation outcome, and is intentionally excluded from acknowledgement scope. The existing WARN log at that path is sufficient.
- Editing or deleting prior acknowledgement messages
- Per-phase status updates during workflow execution (separate feature)
- Acknowledgement for `retry-or-cancel` and `resume-or-cancel` signals (out of scope for this feature)
- Rate-limit handling or retry logic for failed acknowledgement delivery

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-16 | `addReaction(channelId, messageId, emoji)` and `replyToMessage(channelId, messageId, content)` on `DiscordClient` are already implemented and available for use from `handleMessage()`. | If either method is a stub, the acknowledgement will fail silently — must verify implementation before shipping. |
| A-17 | `ThreadMessage` carries sufficient information (`id` for the message ID, `threadId` for the thread/channel ID) to call both `addReaction` and `replyToMessage`. | If `ThreadMessage` is missing fields, the type must be extended before acknowledgement can be implemented. |
| A-18 | Discord bot messages are filtered at the service level before reaching `handleMessage()`, so the bot's own acknowledgement messages will not trigger a second round of acknowledgement. | If bot message filtering is removed or bypassed, the bot could enter an acknowledgement loop. |
| A-19 | Unicode emoji strings (e.g. `"✅"`, `"❌"`) are supported by `addReaction()` without additional encoding. | If only Discord custom emoji IDs are supported, the implementation must use snowflake IDs instead. |

---

## 4. Success Metrics

| Scenario | Metric | How to Measure | Baseline | Target |
|----------|--------|----------------|----------|--------|
| Workflow started | Reaction appears on triggering message within 5 seconds | Manual testing: post message, observe reaction timing | No reaction (0%) | Reaction present within 5s (100%) |
| Workflow started | Reply with workflow ID appears in thread | Manual testing: confirm reply content contains workflow ID | No reply (0%) | Reply present (100%) |
| Signal routed | Reaction appears on reply message within 5 seconds | Manual testing: post answer, observe reaction | No reaction (0%) | Reaction present within 5s (100%) |
| Temporal failure | ❌ reaction and error reply appear within 5 seconds | Inject failure (stop Temporal), post message, observe | No feedback (0%) | Both reaction and reply present (100%) |
| Ack failure | Orchestrator remains running after Discord ack fails | Force Discord API error, confirm bot stays online | Not tested | Bot remains online; error logged |

---

## 5. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| MA | Message Acknowledgement |

---

### 5.1 Message Acknowledgement (MA)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-MA-01 | React with ✅ on workflow started | When `handleMessage()` successfully creates a new Temporal workflow, it must add a ✅ emoji reaction to the triggering message using `addReaction(channelId, messageId, "✅")`. | WHO: Developer GIVEN: A message is posted in a thread named `017-message-acknowledgement` with no existing workflow WHEN: `startWorkflowForFeature()` returns successfully THEN: The ✅ emoji appears on the developer's message in Discord within 5 seconds. | P0 | 1 | US-33 | — |
| REQ-MA-02 | Reply with workflow ID on workflow started | When `handleMessage()` successfully creates a new Temporal workflow, it must reply to the triggering message with a plain-text confirmation containing the workflow ID, using `replyToMessage(channelId, messageId, content)`. The reply format is: `Workflow started: {workflowId}`. | WHO: Developer GIVEN: A new workflow has been created WHEN: The ✅ reaction has been added THEN: A plain-text bot reply is posted on the developer's triggering message reading `Workflow started: ptah-{slug}`. The workflow ID matches what was returned by `startFeatureWorkflow()`. | P0 | 1 | US-33 | REQ-MA-01 |
| REQ-MA-03 | React with ✅ on signal routed | When `handleMessage()` successfully routes a `user-answer` signal to an existing workflow, it must add a ✅ emoji reaction to the triggering message. No plain-text reply is posted — the reaction alone is sufficient. | WHO: Developer GIVEN: A workflow is paused waiting for a `user-answer` signal AND the developer posts their answer in the thread WHEN: `routeUserAnswer()` returns successfully THEN: The ✅ emoji appears on the developer's answer message. No additional bot reply is posted in the thread. | P0 | 1 | US-34 | — |
| REQ-MA-04 | React with ❌ on Temporal operation failure | When `handleMessage()` encounters a Temporal failure (workflow query fails, workflow creation fails, or signal routing fails), it must add a ❌ emoji reaction to the triggering message. | WHO: Developer GIVEN: Ptah receives a message in a feature thread but the Temporal operation fails WHEN: The caught error is handled inside `handleMessage()` THEN: The ❌ emoji appears on the developer's message in Discord. | P0 | 1 | US-35 | — |
| REQ-MA-05 | Reply with error description on failure | When `handleMessage()` encounters a Temporal failure, it must reply to the triggering message with a plain-text error description, using `replyToMessage(channelId, messageId, content)`. The reply format is: `Failed to {operation}: {error message}`. The `{operation}` is one of: `start workflow` (new workflow creation) or `route answer` (user-answer signal delivery). Error paths that fall outside these two Temporal operations — such as the Temporal query failure early-exit, the empty-slug guard, or the no-agent-mention guard — are not in scope for this requirement (see Section 3.2). The `{error message}` is the `.message` property of the caught error, truncated to 200 characters if longer. Raw stack traces must not be included. | WHO: Developer GIVEN: A ❌ reaction has been added to their message WHEN: The error reply is posted THEN: A plain-text bot reply is posted on the developer's triggering message reading `Failed to {operation}: {truncated error message}`. The message is human-readable and does not contain a stack trace. | P0 | 1 | US-35 | REQ-MA-04 |
| REQ-MA-06 | Swallow acknowledgement failures | If `addReaction()` or `replyToMessage()` throws (e.g. Discord rate limit, network error, missing permissions), the error must be caught, logged at WARN level, and discarded. It must not propagate as an unhandled exception, must not crash the orchestrator, and must not be retried. | WHO: Orchestrator GIVEN: A Temporal operation succeeded or failed AND the acknowledgement call to Discord throws an error WHEN: `addReaction()` or `replyToMessage()` rejects THEN: The error is logged at WARN level with the message `Acknowledgement failed: {err.message}` where `{err.message}` is the `.message` property of the caught Error (or `String(err)` if the thrown value is not an Error instance). `handleMessage()` returns normally. The orchestrator and Discord bot connection are unaffected. | P0 | 1 | US-35 | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05 |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-17-01 | Acknowledgement calls follow Temporal operation resolution | The `addReaction()` and `replyToMessage()` calls must be invoked only after the Temporal operation (workflow start or signal routing) has resolved — either successfully or with an error. The acknowledgement calls must not be issued before the Temporal result is known. The execution model is sequential within `handleMessage()`: Temporal operation first, acknowledgement second. | WHO: Orchestrator GIVEN: A Temporal operation (workflow start or signal) is in progress WHEN: The Temporal call resolves (success or failure) THEN: `addReaction()` is called first, then `replyToMessage()` if applicable. Neither acknowledgement call precedes the Temporal operation's resolution. | P0 | 1 |
| REQ-NF-17-02 | Acknowledgement latency under 5 seconds | From the moment the Temporal operation resolves, the emoji reaction must appear in Discord within 5 seconds under normal network conditions. | WHO: Developer GIVEN: A message was processed successfully WHEN: The Temporal operation completes THEN: The ✅ or ❌ reaction is visible within 5 seconds. | P1 | 1 |
| REQ-NF-17-03 | No double-acknowledgement | Each triggering message must receive at most one ✅ or ❌ reaction from Ptah per handling invocation. For a single call to `handleMessage()`, the application must call `addReaction()` at most once per (messageId, emoji) pair. | WHO: Orchestrator GIVEN: `handleMessage()` is invoked for a given message WHEN: The Temporal operation resolves THEN: `addReaction()` is called exactly once for that messageId and emoji within that invocation. No second `addReaction()` call is made for the same messageId and emoji in the same handling path. | P1 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-20-01 | `addReaction()` stub not implemented | Med | High | Verify `DiscordJsClient.addReaction()` is fully implemented before engineering begins; it exists in the interface and has a concrete implementation in the service. | [REQ-MA-01], [REQ-MA-03], [REQ-MA-04] |
| R-20-02 | Discord rate limits acknowledgement calls | Low | Low | Acknowledgement failures are swallowed per [REQ-MA-06] — rate limiting causes a WARN log but no user-visible crash. Acceptable for the current usage volume. | [REQ-MA-06] |
| R-20-03 | ❌ reaction and error reply create alarm fatigue if Temporal is frequently unavailable | Low | Med | Root-cause Temporal connectivity before shipping. Frequent ❌ reactions indicate an infrastructure problem, not an acknowledgement design problem. | [REQ-MA-04], [REQ-MA-05] |
| R-20-04 | Workflow ID in reply message is unfamiliar to non-technical users | Low | Low | Workflow IDs follow the `ptah-{slug}` convention which is readable. If the audience broadens, consider a friendlier message format in a future iteration. | [REQ-MA-02] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 7 | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05, REQ-MA-06, REQ-NF-17-01 |
| P1 | 2 | REQ-NF-17-02, REQ-NF-17-03 |
| P2 | 0 | — |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 9 | All requirements |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2026-04-21 | Product Manager | REQ-MA-05: removed `query workflows` from operation label enumeration; valid labels are now `start workflow` and `route answer` only, consistent with Section 3.2 out-of-scope statement, FSPEC, and PROP-MA-29 |
| 1.0 | 2026-04-03 | Product Manager | Initial requirements document |
| 1.1 | 2026-04-21 | Product Manager | Address SE and TE cross-review findings: fix workflow ID format to `ptah-{slug}` (SE-F1); scope out Temporal query failure early-exit (SE-F2); specify `replyToMessage` for all thread replies replacing `postPlainMessage` (SE-F3, TE-F-01); clarify REQ-MA-05 operation label scope (SE-F4); resolve REQ-NF-17-01 sequential-call contradiction (SE-F5, TE-F-04); add application-layer `addReaction` at-most-once invariant to REQ-NF-17-03 (TE-F-02); specify `.message` property for WARN log in REQ-MA-06 (TE-F-03). |

---

*End of Document*
