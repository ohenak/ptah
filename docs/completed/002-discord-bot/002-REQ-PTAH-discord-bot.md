# Requirements Document — Phase 2: Discord Bot

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P2 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 2 — Discord Bot |

---

## 1. Purpose

This document contains the Phase 2 requirements for Ptah v4.0 — the Discord bot connection layer. Phase 2 delivers the foundational Discord I/O capabilities that the Orchestrator needs: exclusive MCP ownership, thread watching, and thread history reading. These are the prerequisite capabilities for Skill routing in Phase 3.

**Phase 2 deliverables:** The `ptah start` command connects to Discord, watches `#agent-updates` threads, and can read full thread history — but does not yet route to Skills or post responses.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 2 |
|------------|-------|-----------------------|
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | Requires Discord I/O ownership and thread watching |
| [US-04] | Orchestrator Assembles Context for Stateless Skill Invocation | Requires thread history reading for context assembly |
| [US-05] | Developer Launches and Monitors the Orchestrator | `ptah start` launches the Discord bot process |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI)

#### REQ-DI-01: Exclusive Discord MCP Ownership

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-01 |
| **Title** | Orchestrator owns all Discord I/O |
| **Description** | The Orchestrator shall use Discord MCP exclusively for all Discord reads and writes. Skills shall make no Discord MCP calls. This is a non-negotiable architectural constraint to prevent context window exhaustion and cold restart costs. |
| **Acceptance Criteria** | WHO: As a system architect GIVEN: A Skill is invoked by the Orchestrator WHEN: The Skill executes THEN: The Skill makes zero Discord MCP calls; all Discord I/O is performed by the Orchestrator before and after Skill invocation |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | — |

#### REQ-DI-02: Listen to Agent-Updates Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-02 |
| **Title** | Watch #agent-updates threads for new messages |
| **Description** | The Orchestrator shall listen for new messages in all threads under the `#agent-updates` channel via Discord MCP gateway. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am connected to the Discord server WHEN: A new message is posted in any thread under `#agent-updates` THEN: I detect the message and begin processing within 5 seconds |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-05] |
| **Dependencies** | [REQ-DI-01] |

#### REQ-DI-03: Read Thread History

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-03 |
| **Title** | Read full thread history before context assembly |
| **Description** | The Orchestrator shall read the full thread history via Discord MCP before assembling each Context Bundle. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A new message triggers Skill invocation WHEN: I assemble the Context Bundle THEN: I have read the complete thread history and can determine turn count, resume pattern, and target agent |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | [REQ-DI-01] |

---

## 4. Non-Functional Requirements

No non-functional requirements are assigned to Phase 2. The architectural constraint of exclusive Discord MCP ownership ([REQ-DI-01]) is captured as a functional requirement.

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Discord API rate limiting under heavy agent activity | Med | High | Implement rate-limit-aware queuing in the Orchestrator; backoff on 429 responses | [REQ-DI-01] |
| R-04 | Discord outage blocks all agent coordination | Low | High | Agent-produced artifacts are in Git; work can be manually resumed when Discord recovers | [REQ-DI-02] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 3 | REQ-DI-01, REQ-DI-02, REQ-DI-03 |
| P1 | 0 | — |

**Specification status:** All 3 requirements are specified in [TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md).

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
