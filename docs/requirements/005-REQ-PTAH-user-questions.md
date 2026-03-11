# Requirements Document — Phase 5: User Questions

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P5 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 5 — User Questions |

---

## 1. Purpose

This document contains the Phase 5 requirements for Ptah v4.0 — the user question routing pipeline. Phase 5 delivers the ability for agents to raise blocking questions to the user, have those questions routed via `pending.md` and Discord `#open-questions`, and automatically resume the agent pipeline when the user answers.

**Phase 5 deliverables:** Question writing to `pending.md`, Discord @mention notifications, polling for answers, Pattern B context resume, answer archival to `resolved.md`, and Discord reply writeback.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 5 |
|------------|-------|-----------------------|
| [US-03] | Agent Asks User a Blocking Question | Primary user story — the full question routing and resume flow |
| [US-04] | Orchestrator Assembles Context for Stateless Skill Invocation | Pattern B resume requires fresh context assembly |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI) — Phase 5

#### REQ-DI-07: Notify User on Questions

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-07 |
| **Title** | @mention user in #open-questions |
| **Description** | The Orchestrator shall @mention the configured user in `#open-questions` via Discord MCP when an agent raises a user-targeted question. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: An agent has raised a question requiring my input WHEN: The Orchestrator processes the question THEN: I receive an @mention notification in `#open-questions` with the question content |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-DI-01], [REQ-PQ-01] |

### 3.2 Resume Patterns (RP) — Phase 5

#### REQ-RP-02: Pattern B — User Answer Resume

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-02 |
| **Title** | Use Pattern B for user answer resume |
| **Description** | The Orchestrator shall use Pattern B when a user has answered a question in `pending.md`. The Context Bundle contains: pause summary, user answer verbatim, and feature docs read fresh from repo (critical: re-read even if unchanged, as other agents may have modified them while paused). |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user has written an answer in `pending.md` WHEN: I re-invoke the originating Skill THEN: The Context Bundle contains Layer 1, Layer 2 docs re-read fresh (mandatory), and Layer 3 with pause summary + user answer verbatim |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03], [US-04] |
| **Dependencies** | [REQ-CB-01], [REQ-PQ-02] |

### 3.3 Pending Questions (PQ)

#### REQ-PQ-01: Write to pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-01 |
| **Title** | Write agent-to-user questions to pending.md |
| **Description** | The Orchestrator shall append user-targeted questions to `open-questions/pending.md` when a Skill response contains a question routing signal targeting the user. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill response contains a user-targeted question WHEN: I process the response THEN: The question is appended to `open-questions/pending.md` with agent attribution and timestamp |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-SI-05] |

#### REQ-PQ-02: Poll pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-02 |
| **Title** | Poll pending.md at configured interval |
| **Description** | The Orchestrator shall poll `open-questions/pending.md` at the configured interval (default: 30 seconds) to detect when a user has written an answer to a pending question. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am running and `pending.md` contains unanswered questions WHEN: The poll interval elapses THEN: I check `pending.md` for new user answers |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-01] |

#### REQ-PQ-03: Resume on User Answer

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-03 |
| **Title** | Invoke originating Skill with Pattern B on user answer |
| **Description** | When a user answer is detected in `pending.md`, the Orchestrator shall invoke the originating Skill using Pattern B with the user's answer as the immediate trigger, and post the resumed response to the original Discord thread. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user has written an answer to a pending question WHEN: I detect the answer during polling THEN: I invoke the originating Skill with Pattern B, post the response to the paused thread, and the pipeline resumes |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-02], [REQ-RP-02] |

#### REQ-PQ-04: Archive to resolved.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-04 |
| **Title** | Move answered questions to resolved.md |
| **Description** | After processing a user answer, the Orchestrator shall move the answered entry from `pending.md` to `resolved.md` and commit both file changes. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user question has been answered and the pipeline has resumed WHEN: Processing is complete THEN: The question/answer pair is removed from `pending.md`, appended to `resolved.md`, and both changes are committed to Git |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-03] |

#### REQ-PQ-05: Discord Reply Writeback to pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-05 |
| **Title** | Write Discord #open-questions replies to pending.md automatically |
| **Description** | The Orchestrator shall listen for user replies in the `#open-questions` channel. When a user replies to an agent question in Discord, the Orchestrator shall write the user's answer to `pending.md` automatically, triggering the normal Pattern B resume flow. The user never needs to edit `pending.md` directly. (OQ-003 resolved: Option B — Discord reply writes to pending.md.) |
| **Acceptance Criteria** | WHO: As a developer GIVEN: An agent question is posted in `#open-questions` with my @mention WHEN: I reply to the question in Discord THEN: The Orchestrator writes my answer to `pending.md` automatically, and the normal polling/resume flow ([REQ-PQ-02], [REQ-PQ-03]) processes it |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-DI-01], [REQ-PQ-01], [REQ-PQ-02] |

---

## 4. Non-Functional Requirements

No non-functional requirements are assigned to Phase 5.

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-04 | Discord outage blocks all agent coordination | Low | High | Agent-produced artifacts are in Git; work can be manually resumed when Discord recovers | [REQ-DI-07], [REQ-PQ-05] |
| R-05 | `pending.md` polling misses user answers due to file format inconsistency | Med | Med | Define strict answer format in `pending.md`; validate on write and read | [REQ-PQ-02], [REQ-PQ-03] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 7 | REQ-DI-07, REQ-RP-02, REQ-PQ-01, REQ-PQ-02, REQ-PQ-03, REQ-PQ-04, REQ-PQ-05 |
| P1 | 0 | — |

**Specification status:** All 7 requirements are pending specification (no FSPEC or TSPEC yet).

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
