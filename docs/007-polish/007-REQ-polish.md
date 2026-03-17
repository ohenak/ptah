# Requirements Document — Phase 7: Polish

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P7 |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.2 |
| **Date** | March 16, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 7 — Polish |

---

## 1. Purpose

This document contains the Phase 7 requirements for Ptah v4.0 — polish and production readiness. Phase 7 delivers quality-of-life improvements across five areas: automatic thread archiving on resolution, configuration-driven agent extensibility, structured logging, operator observability, Discord embed formatting, and error message UX.

**Phase 7 deliverables:**
1. Thread archiving on resolution signal
2. Zero-code-change agent extensibility
3. Structured, consistent log output across all Orchestrator components
4. Sufficient observability for operators to diagnose agent activity without external tooling
5. Rich Discord embed formatting for key Orchestrator messages
6. Human-readable, actionable error messages for user-facing Discord output

---

## 2. Related User Stories

Full user story details are in the [master requirements document](../requirements/001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 7 |
|------------|-------|-----------------------|
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | Thread archiving on resolution; embed formatting for routing messages |
| [US-05] | Developer Launches and Monitors the Orchestrator | Structured logging; operator observability |
| [US-07] | System Handles Failures Gracefully | Error message UX; error embed formatting |
| [US-08] | New Agent is Added to the System | Configuration-driven extensibility |
| [US-03] | Agent Asks User a Blocking Question | Error message UX for blocked/escalated threads |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI) — Phase 7

#### REQ-DI-06: Archive Resolved Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-06 |
| **Title** | Archive threads on resolution signal |
| **Description** | The Orchestrator shall archive a Discord thread via Discord MCP when a resolution signal (LGTM, task complete) is detected in a Skill response. Archiving is the final post-routing step — after the Skill response is posted and any artifact commits are complete. |
| **Acceptance Criteria** | WHO: As the Orchestrator<br>GIVEN: A Skill response contains a resolution signal (LGTM or task_complete/DONE)<br>WHEN: I have posted the response content to Discord AND completed any artifact commits<br>THEN: I archive the originating thread via Discord MCP<br>AND I mark the thread as archived in the active-thread registry<br>AND I log the archiving action |
| **Priority** | P1 |
| **Phase** | Phase 7 |
| **Source User Stories** | [US-02] |
| **Specification** | [FSPEC-DI-02](./007-FSPEC-polish.md) |
| **Dependencies** | [REQ-DI-01], [REQ-SI-04], [REQ-SI-05] |

---

#### REQ-DI-10: Discord Embed Formatting for Key Orchestrator Messages

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-10 |
| **Title** | Rich embed formatting for Orchestrator-generated Discord messages |
| **Description** | The Orchestrator shall use Discord rich embeds (rather than plain text) for key system-generated messages posted to threads: routing actions, resolution notifications, error reports, and user escalations. Agent-authored response content (the Skill's own text output) is not wrapped in embeds — only Orchestrator-generated metadata messages are embedded. |
| **Acceptance Criteria** | WHO: As a developer monitoring an active Ptah session<br>GIVEN: The Orchestrator posts a system message to a Discord thread (e.g., routing notification, error report, escalation)<br>WHEN: The message appears in the thread<br>THEN: It is rendered as a Discord embed with a title, color, and body fields appropriate to the message type<br>AND agent response content is not wrapped in an embed — only Orchestrator metadata messages use embeds |
| **Priority** | P1 |
| **Phase** | Phase 7 |
| **Source User Stories** | [US-02], [US-07] |
| **Dependencies** | [REQ-DI-01] |

---

#### REQ-RP-06: Error Message UX

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-06 |
| **Title** | Human-readable, actionable error messages in Discord |
| **Description** | When the Orchestrator encounters a non-recoverable error affecting a thread (e.g., retry exhaustion, routing to unknown agent, Discord MCP failure), the message posted to the thread shall be human-readable, explain what happened in plain language, and include actionable guidance for the user where applicable. Technical stack traces, internal IDs, and raw API error messages shall not be included in user-facing Discord output — those go to the debug log only. |
| **Acceptance Criteria** | WHO: As a developer whose thread has encountered an error<br>GIVEN: The Orchestrator exhausts retries or encounters a non-recoverable routing failure<br>WHEN: The error message is posted to the thread<br>THEN: The message is written in plain language describing what went wrong<br>AND it includes at least one actionable suggestion (e.g., "retry by @mentioning the agent again")<br>AND it does not expose raw exception messages, stack traces, or internal IDs |
| **Priority** | P1 |
| **Phase** | Phase 7 |
| **Source User Stories** | [US-03], [US-07] |
| **Dependencies** | [REQ-DI-01], [REQ-RP-03] |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source User Stories |
|----|-------|-------------|---------------------|----------|-------|---------------------|
| REQ-NF-08 | Agent Extensibility | Adding a new agent requires only: a new Skill definition file, a new `agent-logs/*.md` file, and a config entry — no Orchestrator code changes | WHO: As a developer<br>GIVEN: Ptah is running with 3 existing agents configured in `ptah.config.json`<br>WHEN: I add a new Skill definition file, create an empty log file, and add a config entry — without modifying any Orchestrator source code<br>THEN: The new agent is registered at next startup (or on config hot-reload)<br>AND routing signals targeting the new agent's ID resolve correctly<br>AND @mentions matching the configured `mention_id` are routed to the new agent | P1 | Phase 7 | [US-08] |
| REQ-NF-09 | Structured Log Output | All Orchestrator log lines shall use a consistent `[ptah:{component}]` prefix and an explicit log level (DEBUG, INFO, WARN, ERROR) | WHO: As a developer monitoring Ptah's console output<br>GIVEN: Ptah is running and processing events<br>WHEN: I observe the console log stream<br>THEN: Every log line begins with `[ptah:{component}]` and includes a level indicator | P1 | Phase 7 | [US-05] |
| REQ-NF-10 | Operator Observability | The console log stream shall provide enough information for an operator to reconstruct the full routing lifecycle for any thread — which agent was invoked, what signal was returned, what actions followed — without consulting Discord or Git history | WHO: As a developer diagnosing a routing issue<br>GIVEN: An incident has occurred in a production Ptah session<br>WHEN: I review the console log file for that session<br>THEN: I can identify: the triggering message, the invoked agent, the routing signal type, post-signal actions (commit, archive, escalate), and any errors — without opening Discord or inspecting the Git log | P1 | Phase 7 | [US-05], [US-07] |

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Discord embed formatting adds Orchestrator complexity; embeds may render inconsistently across Discord clients | Restrict embeds to a small set of well-defined message types (routing, error, completion). Test against desktop and mobile Discord. |
| Logging requirements (REQ-NF-09) may require refactoring existing `console.log` usage across the Orchestrator codebase | Scope this as a targeted audit pass in Phase 7, not a rewrite. Engineering should produce an impact estimate before committing. |
| Signal naming discrepancy between the FSPEC (uses `lgtm`/`task_done` with status sub-field) and the current skill definitions (uses `LGTM`/`TASK_COMPLETE`) must be resolved before engineering builds REQ-DI-06 | Flag for FSPEC revision. Engineering must not begin REQ-DI-06 implementation until the signal contract in FSPEC-DI-02 is reconciled with the live routing signal contract. |

---

## 6. Scope Boundaries

### In Scope
- Thread archiving on resolution signal (REQ-DI-06)
- Configuration-driven agent extensibility (REQ-NF-08)
- Structured log formatting (REQ-NF-09)
- Operator observability via console log stream (REQ-NF-10)
- Discord embed formatting for Orchestrator-generated messages (REQ-DI-10)
- Error message UX for user-facing Discord output (REQ-RP-06)

### Out of Scope
- Documentation cleanup (static docs updates, README improvements) — not a product requirement; handle as a dev task alongside Phase 7 engineering work, no product spec needed
- Per-thread archiving opt-out (deployment-wide opt-out via config is sufficient for Phase 7)
- External observability integrations (Datadog, Sentry, etc.) — console logs only in v4.0
- Embed formatting for agent-authored response content (only Orchestrator metadata messages use embeds)

### Assumptions
- The Discord MCP supports rich embed creation; no alternative Discord posting mechanism is needed
- The existing logging infrastructure can be refactored without introducing a new logging library (structured prefixes and levels are sufficient)
- Signal type naming (lgtm/task_done vs LGTM/TASK_COMPLETE) will be resolved at the FSPEC level before Phase 7 engineering begins

---

## 7. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 6 | REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10 |

**Specification status:**
- REQ-DI-06 → [FSPEC-DI-02](./007-FSPEC-polish.md) — FSPEC Complete. TSPEC pending.
- REQ-NF-08 → [FSPEC-EX-01](./007-FSPEC-polish.md) — FSPEC Complete. TSPEC pending.
- REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10 — Pending FSPEC.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |
| 1.2 | March 16, 2026 | Product Manager | Applied cross-review F-01: removed implementation constraint (`console.log` clause) from REQ-NF-09 acceptance criteria — observable log format criterion is sufficient; code-hygiene constraint deferred to TSPEC/engineering guidelines. |
| 1.1 | March 16, 2026 | Product Manager | Expanded Phase 7 scope per overview.md: added REQ-DI-10 (embed formatting), REQ-RP-06 (error message UX), REQ-NF-09 (structured logging), REQ-NF-10 (observability). Added REQ-SI-04 as dependency on REQ-DI-06. Expanded REQ-NF-08 acceptance criteria to WHO/GIVEN/WHEN/THEN format. Added Specification links to REQ-DI-06 and REQ-NF-08. Updated specification status in §7. Added signal contract risk to §5. Added explicit scope boundaries. |

---

*End of Document*
