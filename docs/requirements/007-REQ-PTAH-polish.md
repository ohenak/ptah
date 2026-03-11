# Requirements Document — Phase 7: Polish

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P7 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 7 — Polish |

---

## 1. Purpose

This document contains the Phase 7 requirements for Ptah v4.0 — polish and extensibility. Phase 7 delivers quality-of-life improvements: automatic thread archiving on resolution and configuration-driven extensibility for adding new agents without code changes.

**Phase 7 deliverables:** Thread archiving on resolution signal and zero-code-change agent extensibility.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 7 |
|------------|-------|-----------------------|
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | Thread archiving on resolution |
| [US-08] | New Agent is Added to the System | Configuration-driven extensibility |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI) — Phase 7

#### REQ-DI-06: Archive Resolved Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-06 |
| **Title** | Archive threads on resolution signal |
| **Description** | The Orchestrator shall archive a Discord thread via Discord MCP when a resolution signal (LGTM, task complete) is detected in a Skill response. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill response contains a resolution signal WHEN: I process the response THEN: The originating thread is archived |
| **Priority** | P1 |
| **Phase** | Phase 7 |
| **Source User Stories** | [US-02] |
| **Dependencies** | [REQ-DI-01], [REQ-SI-05] |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-08 | Extensibility | Adding a new agent requires only: a new Skill definition, a new `agent-logs/*.md` file, and a config entry | A fourth agent can be added with zero code changes to the Orchestrator | P1 | Phase 7 |

---

## 5. Risks

No phase-specific risks beyond those documented in earlier phases. Extensibility ([REQ-NF-08]) is low-risk given the configuration-driven architecture established in Phase 1 ([REQ-IN-04]).

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 2 | REQ-DI-06, REQ-NF-08 |

**Specification status:** Both requirements are pending specification (no FSPEC or TSPEC yet).

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
