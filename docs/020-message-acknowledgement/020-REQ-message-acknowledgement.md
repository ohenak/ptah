# Requirements Document

## Message Acknowledgement

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-020 |
| **Parent Document** | [REQ-019 — Discord-to-Temporal Integration](../019-discord-temporal-integration/019-REQ-discord-temporal-integration.md) |
| **Version** | 1.0 |
| **Date** | April 3, 2026 |
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
| **Description** | A developer posts the first message in a thread named `020-message-acknowledgement`. They want to know immediately that Ptah detected the message and started a workflow — without having to open the Temporal Web UI to check. |
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
- Plain-text reply in the thread for: workflow started (includes workflow ID) and operation failed (includes brief error description)
- No plain-text reply for signal routed — reaction alone is sufficient for routine answer delivery
- Acknowledgement sent after the Temporal operation completes (success or failure), not before
- Failure of the acknowledgement itself (e.g. Discord rate limit on reaction) must be logged and swallowed — must not crash the orchestrator or retry indefinitely

### 3.2 Out of Scope

- Rich embeds or formatted cards for acknowledgement messages (plain text only)
- Acknowledgement for messages that were silently ignored (pattern did not match, bot message) — no feedback for non-feature threads
- Editing or deleting prior acknowledgement messages
- Per-phase status updates during workflow execution (separate feature)
- Acknowledgement for `retry-or-cancel` and `resume-or-cancel` signals (out of scope for this feature)
- Rate-limit handling or retry logic for failed acknowledgement delivery

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-16 | `addReaction(channelId, messageId, emoji)` and `postPlainMessage(threadId, content)` on `DiscordClient` are already implemented and available for use from `handleMessage()`. | If either method is a stub, the acknowledgement will fail silently — must verify implementation before shipping. |
| A-17 | `ThreadMessage` carries sufficient information (`id` for the message ID, `threadId` for the thread/channel ID) to call both `addReaction` and `postPlainMessage`. | If `ThreadMessage` is missing fields, the type must be extended before acknowledgement can be implemented. |
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
| REQ-MA-01 | React with ✅ on workflow started | When `handleMessage()` successfully creates a new Temporal workflow, it must add a ✅ emoji reaction to the triggering message using `addReaction(channelId, messageId, "✅")`. | WHO: Developer GIVEN: A message is posted in a thread named `020-message-acknowledgement` with no existing workflow WHEN: `startWorkflowForFeature()` returns successfully THEN: The ✅ emoji appears on the developer's message in Discord within 5 seconds. | P0 | 1 | US-33 | — |
| REQ-MA-02 | Reply with workflow ID on workflow started | When `handleMessage()` successfully creates a new Temporal workflow, it must post a plain-text reply in the thread containing the workflow ID. The reply format is: `Workflow started: {workflowId}`. | WHO: Developer GIVEN: A new workflow has been created WHEN: The ✅ reaction has been added THEN: A plain-text bot message appears in the thread reading `Workflow started: ptah-feature-{slug}-{n}`. The workflow ID matches what was returned by `startFeatureWorkflow()`. | P0 | 1 | US-33 | REQ-MA-01 |
| REQ-MA-03 | React with ✅ on signal routed | When `handleMessage()` successfully routes a `user-answer` signal to an existing workflow, it must add a ✅ emoji reaction to the triggering message. No plain-text reply is posted — the reaction alone is sufficient. | WHO: Developer GIVEN: A workflow is paused waiting for a `user-answer` signal AND the developer posts their answer in the thread WHEN: `routeUserAnswer()` returns successfully THEN: The ✅ emoji appears on the developer's answer message. No additional bot reply is posted in the thread. | P0 | 1 | US-34 | — |
| REQ-MA-04 | React with ❌ on Temporal operation failure | When `handleMessage()` encounters a Temporal failure (workflow query fails, workflow creation fails, or signal routing fails), it must add a ❌ emoji reaction to the triggering message. | WHO: Developer GIVEN: Ptah receives a message in a feature thread but the Temporal operation fails WHEN: The caught error is handled inside `handleMessage()` THEN: The ❌ emoji appears on the developer's message in Discord. | P0 | 1 | US-35 | — |
| REQ-MA-05 | Reply with error description on failure | When `handleMessage()` encounters a Temporal failure, it must post a plain-text reply in the thread containing a brief, human-readable description of the error. The reply format is: `Failed to {operation}: {error message}`. The `{operation}` is one of: `query workflows`, `start workflow`, or `route answer`. The `{error message}` is the `.message` property of the caught error, truncated to 200 characters if longer. Raw stack traces must not be included. | WHO: Developer GIVEN: A ❌ reaction has been added to their message WHEN: The error reply is posted THEN: A plain-text bot message appears in the thread reading `Failed to {operation}: {truncated error message}`. The message is human-readable and does not contain a stack trace. | P0 | 1 | US-35 | REQ-MA-04 |
| REQ-MA-06 | Swallow acknowledgement failures | If `addReaction()` or `postPlainMessage()` throws (e.g. Discord rate limit, network error, missing permissions), the error must be caught, logged at WARN level, and discarded. It must not propagate as an unhandled exception, must not crash the orchestrator, and must not be retried. | WHO: Orchestrator GIVEN: A Temporal operation succeeded or failed AND the acknowledgement call to Discord throws an error WHEN: `addReaction()` or `postPlainMessage()` rejects THEN: The error is logged at WARN level with the message "Acknowledgement failed: {error message}". `handleMessage()` returns normally. The orchestrator and Discord bot connection are unaffected. | P0 | 1 | US-35 | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05 |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-20-01 | Acknowledgement must not block Temporal operations | The `addReaction()` and `postPlainMessage()` calls must be awaited after the Temporal operation completes. They must not be called before the Temporal result is known, and their latency must not be added to the Temporal operation path. | WHO: Orchestrator GIVEN: A Temporal operation (workflow start or signal) is in progress WHEN: The Temporal call resolves THEN: The acknowledgement is sent after resolution. The Temporal operation is not delayed by the acknowledgement. | P0 | 1 |
| REQ-NF-20-02 | Acknowledgement latency under 5 seconds | From the moment the Temporal operation resolves, the emoji reaction must appear in Discord within 5 seconds under normal network conditions. | WHO: Developer GIVEN: A message was processed successfully WHEN: The Temporal operation completes THEN: The ✅ or ❌ reaction is visible within 5 seconds. | P1 | 1 |
| REQ-NF-20-03 | No double-acknowledgement | Each triggering message must receive at most one ✅ or ❌ reaction from Ptah. If `handleMessage()` is called more than once for the same message (due to retry or bug), the second call must not add a duplicate reaction. | WHO: Orchestrator GIVEN: `addReaction()` has already been called for a given message ID WHEN: A second `addReaction()` call is made for the same message and emoji THEN: Discord deduplicates the reaction (Discord's native behaviour). No application-layer deduplication is required. | P1 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-20-01 | `addReaction()` stub not implemented | Med | High | Verify `DiscordJsClient.addReaction()` is fully implemented before engineering begins; it exists in the interface and has a concrete implementation in the service. | [REQ-MA-01], [REQ-MA-03], [REQ-MA-04] |
| R-20-02 | Discord rate limits acknowledgement calls | Low | Low | Acknowledgement failures are swallowed per [REQ-MA-06] — rate limiting causes a WARN log but no user-visible crash. Acceptable for the current usage volume. | [REQ-MA-06] |
| R-20-03 | ❌ reaction and error reply create alarm fatigue if Temporal is frequently unavailable | Low | Med | Root-cause Temporal connectivity before shipping. Frequent ❌ reactions indicate an infrastructure problem, not an acknowledgement design problem. | [REQ-MA-04], [REQ-MA-05] |
| R-20-04 | Workflow ID in reply message is unfamiliar to non-technical users | Low | Low | Workflow IDs follow the `ptah-feature-{slug}-{n}` convention which is readable. If the audience broadens, consider a friendlier message format in a future iteration. | [REQ-MA-02] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 7 | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-04, REQ-MA-05, REQ-MA-06, REQ-NF-20-01 |
| P1 | 2 | REQ-NF-20-02, REQ-NF-20-03 |
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
| 1.0 | 2026-04-03 | Product Manager | Initial requirements document |

---

*End of Document*
