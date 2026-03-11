# Requirements Document — Phase 6: Guardrails

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P6 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 6 — Guardrails |

---

## 1. Purpose

This document contains the Phase 6 requirements for Ptah v4.0 — system guardrails and resilience. Phase 6 delivers the safety nets that keep the Orchestrator running reliably: retry with exponential backoff, graceful failure handling, max-turns enforcement, review thread blocking, and graceful shutdown.

**Phase 6 deliverables:** Retry logic, unrecoverable failure handling (error embeds without crashing), max-turns system messages, review thread fifth-turn blocking, graceful SIGINT/SIGTERM shutdown, and reliability NFR.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 6 |
|------------|-------|-----------------------|
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | Max-turns limit, review thread blocking |
| [US-05] | Developer Launches and Monitors the Orchestrator | Graceful shutdown on SIGINT/SIGTERM |
| [US-07] | System Handles Failures Gracefully | Primary user story — retry, failure handling, reliability |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI) — Phase 6

#### REQ-DI-08: Max-Turns System Message

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-08 |
| **Title** | Post system message at max-turns limit |
| **Description** | The Orchestrator shall post a system message to the thread and log to `#agent-debug` when the `max_turns_per_thread` limit (default: 10) is reached. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A thread has reached `max_turns_per_thread` messages WHEN: A new message arrives in the thread THEN: I post a system message to the thread, log to `#agent-debug`, and refuse further routing |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-02], [US-07] |
| **Dependencies** | [REQ-DI-01] |

### 3.2 Resume Patterns (RP) — Phase 6

#### REQ-RP-05: Block Fifth Turn in Review Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-05 |
| **Title** | Refuse to route a fifth turn in any review thread |
| **Description** | The Orchestrator shall refuse to route a fifth turn in any review thread. It shall mark the thread stalled, post a system message, and log to `#agent-debug`. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A review thread already has 4 turns WHEN: An additional message arrives THEN: I refuse to route it, post a system message indicating the thread is stalled, and log the event to `#agent-debug` |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-02], [US-07] |
| **Dependencies** | [REQ-RP-03] |

### 3.3 Skill Invocation (SI) — Phase 6

#### REQ-SI-07: Retry with Exponential Backoff

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-07 |
| **Title** | Retry failed Skill invocations |
| **Description** | The Orchestrator shall retry failed Skill invocations up to `retry_attempts` times (default: 3) with exponential backoff. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has failed WHEN: I handle the failure THEN: I retry up to the configured number of attempts with exponential backoff between attempts |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-07] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-08: Graceful Failure Handling

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-08 |
| **Title** | Handle unrecoverable failures without crashing |
| **Description** | Unrecoverable Skill failures (after retry exhaustion) shall post an error embed to the thread and log to `#agent-debug`. They shall not crash the Orchestrator. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has failed and all retries are exhausted WHEN: I handle the unrecoverable failure THEN: I post an error embed to the thread, log to `#agent-debug`, and continue running for other threads |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-07] |
| **Dependencies** | [REQ-SI-07] |

#### REQ-SI-10: Graceful Shutdown

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-10 |
| **Title** | Wait for in-flight invocations on shutdown |
| **Description** | On SIGINT/SIGTERM, the Orchestrator shall wait for any in-flight Skill invocation to complete before exiting. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: The Orchestrator is processing a Skill invocation WHEN: I send SIGINT or SIGTERM THEN: The Orchestrator waits for the in-flight invocation to complete, commits any pending changes, and then exits cleanly |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-05], [US-07] |
| **Dependencies** | — |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-02 | Reliability | Failed Skill invocations retry up to 3 times; failures do not crash the Orchestrator | Orchestrator continues running after any individual Skill failure | P0 | Phase 6 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Discord API rate limiting under heavy agent activity | Med | High | Implement rate-limit-aware queuing in the Orchestrator; backoff on 429 responses | [REQ-SI-07] |
| R-03 | Two-iteration review limit is insufficient for complex requirements | Med | Med | Escalation to user when agents cannot agree; monitor escalation rate | [REQ-RP-05] |
| R-07 | Skill output exceeds expected format, breaking routing signal parsing | Med | Med | Validate routing signals with strict schema; fall back to error embed on parse failure | [REQ-SI-08] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 6 | REQ-DI-08, REQ-RP-05, REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02 |
| P1 | 0 | — |

**Specification status:** All 6 requirements are pending specification (no FSPEC or TSPEC yet).

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
