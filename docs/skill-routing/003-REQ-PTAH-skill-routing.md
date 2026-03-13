# Requirements Document — Phase 3: Skill Routing

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P3 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 3 — Skill Routing |

---

## 1. Purpose

This document contains the Phase 3 requirements for Ptah v4.0 — the Skill routing core. Phase 3 is the largest phase and delivers the Orchestrator's central loop: context assembly, Skill invocation, routing signal parsing, response posting, and resume patterns. This is where the Orchestrator becomes functional — it can receive a Discord message, determine which agent to invoke, assemble the right context, call the Skill, and post the response.

**Phase 3 deliverables:** Three-layer context assembly, stateless Skill invocation, routing signal parsing, colour-coded Discord embeds, thread creation, review loop patterns (A and C), concurrent invocation with worktree isolation, and token budget enforcement.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 3 |
|------------|-------|-----------------------|
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | Review loop pattern, routing signals, turn tracking, embeds |
| [US-03] | Agent Asks User a Blocking Question | REQ-SI-04 (routing signal) supports user escalation |
| [US-04] | Orchestrator Assembles Context for Stateless Skill Invocation | Context Bundle assembly, three-layer model, token budget |
| [US-05] | Developer Launches and Monitors the Orchestrator | Colour-coded embeds for monitoring |
| [US-06] | Agent Produces and Commits Artifacts | Skill output format, concurrent worktree isolation |

---

## 3. Functional Requirements

### 3.1 Discord I/O (DI) — Phase 3

#### REQ-DI-04: Post Colour-Coded Embeds

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-04 |
| **Title** | Post Skill responses as colour-coded embeds |
| **Description** | The Orchestrator shall post Skill responses to the originating Discord thread as colour-coded embeds: PM Agent (Blue #1F4E79), Dev Agent (Amber #E65100), Test Agent (Green #1B5E20), System (Gray #9E9E9E). |
| **Acceptance Criteria** | WHO: As a developer reading Discord GIVEN: A Skill has produced a response WHEN: The Orchestrator posts it to the thread THEN: The embed uses the correct colour and label for the responding agent |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-05] |
| **Dependencies** | [REQ-DI-01] |

#### REQ-DI-05: Open Thread Per Coordination Task

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-05 |
| **Title** | Create one thread per coordination task |
| **Description** | The Orchestrator shall open a new Discord thread per coordination task via Discord MCP, using the naming convention `{feature} — {brief description of task}`. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill response contains a review request or new coordination task WHEN: I process the response THEN: A new thread is created in `#agent-updates` with the correct naming convention |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02] |
| **Dependencies** | [REQ-DI-01] |

#### REQ-DI-09: Route by Routing Signal Only

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-09 |
| **Title** | Determine target agent from routing signal only |
| **Description** | The Orchestrator shall determine which agent to invoke next exclusively from the structured routing signal in the previous Skill response ([REQ-SI-04]). No fallback to @mention parsing, thread ownership, or last-sender heuristics. If a Skill response lacks a valid routing signal, the Orchestrator shall treat it as an error, post an error embed, and log to `#agent-debug`. (OQ-002 resolved: Option C — routing signal.) |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill has returned a response WHEN: I determine the next agent to invoke THEN: I parse the routing signal from the response; if the signal is valid, I invoke the indicated agent; if the signal is missing or malformed, I post an error embed and do not invoke any agent |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | [REQ-SI-04] |

### 3.2 Context Bundle (CB)

#### REQ-CB-01: Three-Layer Context Model

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-01 |
| **Title** | Assemble Context Bundle using three-layer model |
| **Description** | The Orchestrator shall assemble a Context Bundle before every Skill invocation using three layers: Layer 1 (stable reference: role prompt + `docs/overview.md`), Layer 2 (current artifact state: relevant `/docs/{feature}/` files read fresh from repo), Layer 3 (immediate trigger: the specific message/signal that triggered invocation). |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation is triggered WHEN: I assemble the Context Bundle THEN: It contains all three layers with Layer 1 and Layer 3 included verbatim |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | — |

#### REQ-CB-02: Never Truncate Layer 1 and Layer 3

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-02 |
| **Title** | Layer 1 and Layer 3 are never truncated |
| **Description** | The Orchestrator shall always include Layer 1 (role prompt + `overview.md`) and Layer 3 (immediate trigger) verbatim in every Context Bundle — these layers are never truncated regardless of token budget pressure. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: The token budget is under pressure WHEN: I enforce budget constraints THEN: Layer 1 and Layer 3 remain verbatim and complete; only Layer 2 is subject to truncation |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | [REQ-CB-01] |

#### REQ-CB-03: Fresh Artifact Reads

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-03 |
| **Title** | Read artifact files fresh from repo at invocation time |
| **Description** | The Orchestrator shall always read Layer 2 artifact files fresh from the repo at invocation time — never reconstructed from thread history. The repo file is the state, not the thread. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation requires feature docs WHEN: I assemble Layer 2 of the Context Bundle THEN: I read the current files from the filesystem, not from cached or thread-derived content |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | [REQ-CB-01] |

#### REQ-CB-04: Scope Layer 2 to Current Feature

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-04 |
| **Title** | Include only relevant feature docs in Layer 2 |
| **Description** | The Orchestrator shall include only `/docs` files relevant to the current feature and task in Layer 2 — never the full `/docs` tree. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am assembling a Context Bundle for the "auth" feature WHEN: I populate Layer 2 THEN: Only files from `docs/auth/` (and cross-cutting docs like `overview.md`) are included; other feature folders are excluded |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | [REQ-CB-01] |

#### REQ-CB-05: Token Budget Enforcement

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-05 |
| **Title** | Enforce configurable token budget |
| **Description** | The Orchestrator shall enforce the configured token budget. Allocation: ~15% fixed overhead (Layer 1), ~10% immediate trigger (Layer 3), ~15% thread context, ~45% feature docs (Layer 2), ~15% response headroom. If Layer 2 files exceed their allocation, truncate from least-relevant sections first. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: Layer 2 files exceed their token allocation WHEN: I enforce the budget THEN: Least-relevant sections are truncated first while preserving the most critical content |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | [REQ-CB-01], [REQ-CB-02] |

#### REQ-CB-06: Task Splitting on Budget Overflow

| Field | Detail |
|-------|--------|
| **ID** | REQ-CB-06 |
| **Title** | Split task when truncation is insufficient |
| **Description** | If the token budget cannot be satisfied by truncation alone, the Orchestrator shall split the task into a focused sub-task covering only the sections needed for the current turn. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: Token budget cannot be met even after maximum truncation WHEN: I attempt to assemble the Context Bundle THEN: The task is split into a focused sub-task with reduced scope, and the original task is continued in subsequent invocations |
| **Priority** | P1 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04] |
| **Dependencies** | [REQ-CB-05] |

### 3.3 Resume Patterns (RP) — Phase 3

#### REQ-RP-01: Pattern A — Agent-to-Agent Answer

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-01 |
| **Title** | Use Pattern A for agent-to-agent question answers |
| **Description** | The Orchestrator shall use Pattern A when an agent-to-agent question has been answered. The Context Bundle contains: task reminder, question asked (verbatim), and answer received (verbatim). No full thread history is included. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: Agent B has answered Agent A's question in a Discord thread WHEN: I re-invoke Agent A THEN: The Context Bundle contains Layer 1, fresh Layer 2 docs, and Layer 3 with task reminder + question + answer verbatim only |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | [REQ-CB-01] |

#### REQ-RP-03: Pattern C — Review Loop

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-03 |
| **Title** | Use Pattern C for review threads |
| **Description** | The Orchestrator shall use Pattern C for all review threads. The Context Bundle contains all prior turns verbatim (maximum 3) plus the current turn verbatim. No progressive summarisation is needed — the 4-turn cap ensures the window never grows large enough. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A review thread is in progress WHEN: I assemble the Context Bundle for the next turn THEN: All prior turns (max 3) are included verbatim alongside the current turn, with fresh Layer 2 docs |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | [REQ-CB-01] |

#### REQ-RP-04: Final Review Instruction at Turn 3

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-04 |
| **Title** | Inject final-review instruction at Turn 3 |
| **Description** | The Orchestrator shall inject a final-review instruction into the Pattern C Context Bundle at Turn 3: the target agent is instructed that this is its second and final review pass and must either approve (LGTM) or escalate unresolved concerns to the user. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A review thread has reached Turn 3 (second review by target agent) WHEN: I assemble the Context Bundle THEN: A system instruction is injected stating this is the final review pass and the agent must LGTM or escalate |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02] |
| **Dependencies** | [REQ-RP-03] |

### 3.4 Skill Invocation (SI) — Phase 3

#### REQ-SI-01: Stateless Skill Invocation

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-01 |
| **Title** | All Skill invocations are stateless |
| **Description** | All Skill invocations shall be stateless — no session state is assumed between calls. Skills receive only the Context Bundle as input — no direct Discord access, no MCP calls, no raw API payloads. |
| **Acceptance Criteria** | WHO: As a Skill GIVEN: I am invoked by the Orchestrator WHEN: I execute THEN: I operate solely on the Context Bundle provided; I make no assumptions about prior invocations and make no external API calls |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04], [US-06] |
| **Dependencies** | [REQ-DI-01], [REQ-CB-01] |

#### REQ-SI-02: Skill Output Format

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-02 |
| **Title** | Skills produce text responses and/or artifact updates |
| **Description** | Skills shall produce one or both of: a plain-text response for the Orchestrator to post, and/or an updated `/docs` artifact file. |
| **Acceptance Criteria** | WHO: As a Skill GIVEN: I have processed the Context Bundle WHEN: I return my output THEN: My output contains either a plain-text response, an updated artifact file, or both |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-03: Two-Iteration Rule in Skill Prompts

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-03 |
| **Title** | Skill system prompts enforce two-iteration review limit |
| **Description** | Every target agent Skill system prompt shall explicitly state: "On your second review of any artifact you must either approve (LGTM) or escalate unresolved concerns to the user. You may not request a third review pass." |
| **Acceptance Criteria** | WHO: As a Skill author GIVEN: I am defining a Skill system prompt for a reviewing agent WHEN: I write the prompt THEN: It includes the verbatim two-iteration instruction ensuring the agent LGTMs or escalates on second review |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02] |
| **Dependencies** | — |

#### REQ-SI-04: Structured Routing Signal

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-04 |
| **Title** | Skills include routing signal in responses (canonical routing mechanism) |
| **Description** | Skills shall include a structured signal in their response to indicate routing intent: target agent (for review/question), user escalation, LGTM (approval), or task complete. This is the **sole mechanism** the Orchestrator uses to determine the next agent (OQ-002 resolved). No fallback to thread ownership or last-sender logic exists. Every Skill response must include a routing signal; responses without one are treated as errors. |
| **Acceptance Criteria** | WHO: As a Skill GIVEN: I have completed my work for this turn WHEN: I return my response THEN: It includes a parseable routing signal indicating the next action (target agent, escalation, LGTM, or complete) |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-03] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-11: Concurrent Skill Invocations for Independent Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-11 |
| **Title** | Support concurrent Skill invocations for independent threads |
| **Description** | The Orchestrator shall support concurrent Skill invocations when messages arrive in independent threads (i.e., threads belonging to different features or different coordination tasks). Each concurrent invocation operates on its own worktree ([REQ-SI-12]) to avoid file conflicts. (OQ-005 resolved: concurrent with per-agent worktrees.) |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: Messages arrive in two independent threads (e.g., "auth — review requirements" and "payments — review specifications") WHEN: I process both messages THEN: I invoke the target Skills concurrently, each in its own worktree, without blocking one on the other |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-02], [US-04], [US-06] |
| **Dependencies** | [REQ-SI-01], [REQ-SI-12] |

#### REQ-SI-12: Per-Agent Worktree Isolation

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-12 |
| **Title** | Each concurrent Skill invocation operates on an isolated Git worktree |
| **Description** | The Orchestrator shall create a dedicated Git worktree for each concurrent Skill invocation. The Skill reads and writes `/docs` files in its own worktree copy, preventing file-level conflicts when multiple agents edit the repo in parallel. Worktrees are created before invocation and cleaned up after merge. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am about to invoke a Skill concurrently with another in-flight invocation WHEN: I set up the invocation environment THEN: I create a new Git worktree for this invocation; the Skill reads/writes files in its worktree, not on the main working tree |
| **Priority** | P0 |
| **Phase** | Phase 3 |
| **Source User Stories** | [US-04], [US-06] |
| **Dependencies** | [REQ-SI-05] |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Response latency | Each Skill invocation and Discord post shall complete within 90 seconds | End-to-end time from message detection to response post < 90s | P0 | Phase 3 |
| REQ-NF-04 | Token efficiency | Each Skill invocation loads only the relevant feature folder docs — never the entire /docs tree | Context Bundle Layer 2 contains only current-feature files | P0 | Phase 3 |
| REQ-NF-07 | Portability | /docs content is platform-agnostic — no Discord message IDs or thread links in repo files | Grep of `/docs` for Discord-specific identifiers returns zero matches | P0 | Phase 3 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Discord API rate limiting under heavy agent activity | Med | High | Implement rate-limit-aware queuing in the Orchestrator; backoff on 429 responses | [REQ-DI-04], [REQ-DI-05] |
| R-02 | Context window exhaustion for complex features with large artifact files | Med | High | Token budget enforcement with truncation and task splitting | [REQ-CB-05], [REQ-CB-06] |
| R-03 | Two-iteration review limit is insufficient for complex requirements | Med | Med | Escalation to user when agents cannot agree; monitor escalation rate | [REQ-RP-04] |
| R-07 | Skill output exceeds expected format, breaking routing signal parsing | Med | Med | Validate routing signals with strict schema; fall back to error embed on parse failure | [REQ-SI-04], [REQ-DI-09] |
| R-08 | Merge conflicts when concurrent worktrees modify overlapping `/docs` files | Med | Med | Agents typically work on different feature folders; serialize merges; retain conflicted worktrees for manual resolution | [REQ-SI-12] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 20 | REQ-DI-04, REQ-DI-05, REQ-DI-09, REQ-CB-01, REQ-CB-02, REQ-CB-03, REQ-CB-04, REQ-CB-05, REQ-RP-01, REQ-RP-03, REQ-RP-04, REQ-SI-01, REQ-SI-02, REQ-SI-03, REQ-SI-04, REQ-SI-11, REQ-SI-12, REQ-NF-01, REQ-NF-04, REQ-NF-07 |
| P1 | 1 | REQ-CB-06 |

**Specification status:** All 21 requirements have FSPECs in [FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md). TSPECs pending.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
