# Requirements Document

## SKILL.md Simplification for Orchestrator-Driven PDLC

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-012 |
| **Parent Document** | [011-REQ-orchestrator-pdlc-state-machine](../011-orchestrator-pdlc-state-machine/011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Version** | 1.1 |
| **Date** | March 15, 2026 |
| **Author** | Product Manager |
| **Status** | Approved |
| **Approval Date** | March 15, 2026 |

---

## 1. Purpose

With the orchestrator-driven PDLC state machine (Feature 011) now implemented, the orchestrator deterministically manages phase ordering, review routing, reviewer set computation, document status transitions, and task dispatch. The four SKILL.md files (backend-engineer, frontend-engineer, product-manager, test-engineer) still contain ~200-300 lines each of embedded PDLC workflow logic — task selection decision tables, routing instructions with `<routing>` tags, document status management sections, and inter-agent handoff procedures.

This redundant logic creates two problems:
1. **Conflict risk:** The orchestrator sends explicit task directives (e.g., `ACTION: Create TSPEC`), but the SKILL.md also instructs the agent to self-select tasks via a decision table. Both paths work today because agents prioritize ACTION directives, but the SKILL.md logic can still confuse agents in edge cases.
2. **Maintenance burden:** Any workflow change must be updated in five places (orchestrator code + four SKILL.md files). The state machine is the authoritative source of truth — the SKILL.md copies will inevitably drift.

This feature removes the PDLC workflow logic from all four SKILL.md files, leaving only domain-specific task instructions that agents need to do their work. It implements REQ-SA-01 through REQ-SA-06 from the parent feature.

---

## 2. User Scenarios

### US-19: Simplified Agent Skills Focus on Domain Tasks

| Attribute | Detail |
|-----------|--------|
| **Description** | A backend engineer is invoked by the orchestrator to create a TSPEC. The engineer's SKILL.md contains instructions only for how to write a good TSPEC — technical specification format, quality checklist, TDD principles. It does NOT contain PDLC workflow knowledge (what comes before/after TSPEC, who reviews it, how to route). The orchestrator provides the task directive and relevant context documents. |
| **Goals** | Reduce SKILL.md complexity; eliminate conflicting PDLC interpretations between agents; make agents more reliable by narrowing their decision scope. |
| **Pain points** | Today, each SKILL.md contains full PDLC workflow logic (task selection, routing, review management). This means four copies of partially overlapping PDLC logic that can drift from the orchestrator's implementation. |
| **Key needs** | SKILL.md files stripped of PDLC state management; agents receive explicit task directives from the orchestrator and return routing signals when done. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The PDLC state machine (Feature 011) is deployed and functional before these SKILL.md changes are applied. | If the state machine is not deployed, agents will have no workflow logic at all and features will stall. |
| A-02 | All in-progress features using the old SKILL.md-driven model have completed or are handled by the orchestrator's backward compatibility mechanism (REQ-SM-NF-03). | If old-model features are still active, they need the old SKILL.md logic. The orchestrator's `isManaged()` check handles this — unmanaged features use the existing RoutingEngine path. |
| A-03 | The orchestrator's task directives (`ACTION: Create TSPEC`, `ACTION: Review`, etc.) are sufficient for agents to determine what to do without the task selection decision table. | If task directives are ambiguous, agents may misinterpret their task. |
| A-04 | All four SKILL.md files can be updated simultaneously. Partial updates (e.g., updating backend-engineer but not product-manager) would create inconsistency. | If partial updates occur, some agents will still route while others won't, causing workflow breaks. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | Changes are text edits to `.claude/skills/*/SKILL.md` files — no code changes. | SKILL.md files are prompt instructions, not TypeScript code. |
| C-02 | The cross-review file format (`CROSS-REVIEW-{skill}-{doc-type}.md` with Recommendation field) must be preserved. The orchestrator's cross-review parser depends on this format. | REQ-RT-04 from Feature 011. |
| C-03 | The git workflow section must be preserved. Agents must still commit and push artifacts before signaling completion. | REQ-SA-05 from Feature 011. |
| C-04 | Domain-specific instructions (how to write a REQ, TSPEC, PROPERTIES, etc.) must be preserved intact. | REQ-SA-04 from Feature 011. |

---

## 4. Functional Requirements

Requirements are grouped by the section of SKILL.md being modified.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| TS | Task Selection — removing the decision table |
| RT | Routing — removing inter-agent routing logic |
| DS | Document Status — removing status management |
| RC | Response Contract — adding the agent signal contract |
| CR | Cross-Review — preserving the parseable format |
| DT | Domain Tasks — restructuring task sections |

### 4.1 Task Selection Removal (TS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-TS-01 | Remove task selection decision table | All four SKILL.md files must have their "Task Selection — MANDATORY FIRST STEP" section removed. Agents no longer self-select their task — the orchestrator provides an explicit task directive in the context. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator drives task selection via ACTION directives WHEN: SKILL.md files are updated THEN: the task selection section (priority table, keyword matching, "MANDATORY FIRST STEP" header) is removed from all four skill files | P0 | 1 | [REQ-SA-01], [US-19] | — |
| REQ-TS-02 | Remove task numbering and trigger descriptions | Individual task sections (Task 1, Task 2, etc.) must be restructured to remove trigger descriptions ("Trigger: You are asked to...") and task numbering. Each task becomes a standalone capability the agent performs when directed by the orchestrator. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator tells the agent which task to perform WHEN: SKILL.md files are updated THEN: task sections are renamed from "Task N: {Title}" to capability names (e.g., "Create Technical Specification"), and trigger descriptions are removed | P0 | 1 | [REQ-SA-01], [US-19] | [REQ-TS-01] |

### 4.2 Routing Removal (RT)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-RT-01 | Remove routing task from SKILL.md | All four SKILL.md files must have their "Route Documents for Review and Approval" task removed entirely. Agents no longer decide who to route to — they signal completion and the orchestrator handles routing. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator handles review routing WHEN: SKILL.md files are updated THEN: the routing task (Task 3 in BE/FE/PM, or equivalent in QA) is removed; no `<routing>` tag examples for workflow routing remain | P0 | 1 | [REQ-SA-02], [US-19] | — |
| REQ-RT-02 | Remove PDLC workflow routing instructions | All references to constructing `<routing>` tags for PDLC workflow purposes (which agent to route to next, handoff instructions, ROUTE_TO_AGENT with specific agent_ids for workflow) must be removed. The `<routing>` tag syntax itself must be PRESERVED because agents still emit signals (`LGTM`, `ROUTE_TO_USER`, `TASK_COMPLETE`) via `<routing>` tags that the orchestrator's `parseSignal()` parses. The signal emission format is documented in the response contract (REQ-RC-01/RC-02). | WHO: As a SKILL.md maintainer GIVEN: routing is orchestrator-managed but signal emission uses `<routing>` tags WHEN: SKILL.md files are updated THEN: the "Routing lookup" table (agent ID mapping), workflow routing examples (ROUTE_TO_AGENT with specific agent_ids), and "Route if needed" git workflow step are removed; the `<routing>` tag format for signal emission is preserved in the Response Contract section | P0 | 1 | [REQ-SA-02], [US-19] | [REQ-RT-01] |
| REQ-RT-03 | Remove agent identity routing section | The "Agent Identity" section in each SKILL.md that defines the agent's ID and the routing lookup table must be simplified. The agent ID is still useful for logging but the routing table is no longer needed. | WHO: As a SKILL.md maintainer GIVEN: agents no longer route to each other WHEN: SKILL.md files are updated THEN: the routing lookup table is removed; the agent ID is retained as a single line for identification purposes only | P1 | 1 | [REQ-SA-02], [US-19] | [REQ-RT-02] |

### 4.3 Document Status Removal (DS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-DS-01 | Remove document status management instructions | All four SKILL.md files must have their "Document Status" sections removed or simplified. Agents no longer update document status fields (Draft → In Review → Approved) — the orchestrator manages document status based on PDLC phase transitions. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator tracks document status via PDLC phase WHEN: SKILL.md files are updated THEN: instructions for agents to set or update document status fields are removed from all task descriptions | P0 | 1 | [REQ-SA-03], [US-19] | — |
| REQ-DS-02 | Remove status field from document templates | Task instructions that tell agents to "Mark the document status as Draft" or "Update document status to Approved" must be removed. The orchestrator handles this. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator sets document status WHEN: SKILL.md files are updated THEN: no task instruction references setting or updating a status field in document metadata | P0 | 1 | [REQ-SA-03], [US-19] | [REQ-DS-01] |

### 4.4 Response Contract (RC)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-RC-01 | Add response contract section | Each SKILL.md must include a "Response Contract" section that defines the agent's expected behavior after completing a task: (1) write artifact file using Write tool, (2) commit and push to feature branch, (3) return a routing signal. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator relies on routing signals WHEN: SKILL.md files are updated THEN: each skill file includes a "Response Contract" section specifying: write artifact → commit/push → return routing signal | P0 | 1 | [REQ-SA-05], [US-19] | — |
| REQ-RC-02 | Define routing signal semantics with format examples | The response contract must document four routing signals with exact `<routing>` tag format examples: (1) `LGTM` — task completed successfully: `<routing>{"type":"LGTM"}</routing>`. (2) `ROUTE_TO_USER` — agent has a blocking question: `<routing>{"type":"ROUTE_TO_USER","question":"..."}</routing>`. (3) `TASK_COMPLETE` — feature is done, terminal signal: `<routing>{"type":"TASK_COMPLETE"}</routing>`. (4) `ROUTE_TO_AGENT` — ad-hoc coordination only (e.g., asking another agent a clarifying question): `<routing>{"type":"ROUTE_TO_AGENT","agent_id":"...","thread_action":"reply"}</routing>`. The contract must clarify that ROUTE_TO_AGENT is for ad-hoc coordination only, NOT for PDLC workflow routing. The orchestrator will log a warning and invoke the target for one turn without changing the PDLC phase. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator parses `<routing>` tags from agent responses WHEN: SKILL.md files are updated THEN: the response contract section defines all four signals with exact `<routing>` tag JSON format, usage guidance, and examples; ROUTE_TO_AGENT includes explicit "ad-hoc only, not for workflow" guidance | P0 | 1 | [REQ-SA-05], [US-19] | [REQ-RC-01] |

### 4.5 Cross-Review Convention (CR)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-CR-01 | Preserve cross-review file format | The cross-review file convention must be preserved in all SKILL.md files that perform reviews. The naming pattern (`CROSS-REVIEW-{skill}-{doc-type}.md`) and required fields (Findings, Questions, Recommendation) must remain because the orchestrator's approval detection parser depends on them. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator parses cross-review files WHEN: SKILL.md files are updated THEN: the cross-review file naming convention and structured format are preserved intact in the review task instructions | P0 | 1 | [REQ-SA-06], [US-19] | — |
| REQ-CR-02 | Preserve Recommendation field format | The Recommendation field in cross-review files must continue to use the exact values: "Approved", "Approved with minor changes", or "Needs revision". These values are parsed by the orchestrator's cross-review-parser module. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator parses Recommendation values WHEN: SKILL.md files are updated THEN: the Recommendation field values and their definitions are preserved in the review instructions | P0 | 1 | [REQ-SA-06], [US-19] | [REQ-CR-01] |

### 4.6 Domain Task Restructuring (DT)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-DT-01 | Retain all domain-specific instructions | All domain-specific task content must be preserved: how to write a good REQ/FSPEC (PM), how to write a TSPEC/PLAN and follow TDD (BE/FE), how to write PROPERTIES and analyze requirements (QA). Quality checklists, TDD principles, dependency injection patterns, web search guidance, and review scope descriptions must be retained. | WHO: As a SKILL.md maintainer GIVEN: domain expertise must remain in SKILL.md WHEN: SKILL.md files are updated THEN: all domain-specific sections are preserved without content loss | P0 | 1 | [REQ-SA-04], [US-19] | — |
| REQ-DT-02 | Retain git workflow with simplified signaling | The git workflow section must be preserved (commit, push before signaling) but simplified: remove "Route if needed" step, remove references to `<routing>` tags. Replace with the response contract signal (LGTM/ROUTE_TO_USER). | WHO: As a SKILL.md maintainer GIVEN: agents still commit and push artifacts WHEN: SKILL.md files are updated THEN: the git workflow section retains commit/push instructions but replaces routing references with response contract signals | P0 | 1 | [REQ-SA-04], [REQ-SA-05], [US-19] | [REQ-RC-01] |
| REQ-DT-03 | Retain Phase 0 bootstrap in PM skill | The product-manager SKILL.md's Phase 0 (feature folder bootstrap) must be preserved. This logic creates the feature folder and overview.md — it is domain-specific, not PDLC workflow logic. | WHO: As a SKILL.md maintainer GIVEN: Phase 0 is a PM domain task WHEN: the PM SKILL.md is updated THEN: the Phase 0 bootstrap section is preserved intact | P0 | 1 | [REQ-SA-04], [US-19] | — |

---

## 5. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Simultaneous update | All four SKILL.md files must be updated in a single commit or closely coordinated commits. Partial updates create inconsistency where some agents still route while others don't. | All four SKILL.md files are updated in a single atomic commit. | P0 | 1 |
| REQ-NF-02 | Line count reduction | Each SKILL.md should be reduced by approximately 30-50% after removing PDLC workflow logic. This is a rough guide, not a strict target — the goal is complexity reduction, not line count minimization. | Each SKILL.md is shorter after the update, with the removed content being exclusively PDLC workflow logic (not domain content). | P1 | 1 |
| REQ-NF-03 | No behavior change for managed features | Features managed by the PDLC state machine must continue to work identically after SKILL.md simplification. The orchestrator's task directives and signal handling are unchanged — only the SKILL.md instructions are simplified. Validation method: (1) the existing Feature 011 automated test suite (which does not depend on SKILL.md content) must pass unchanged; (2) manual end-to-end validation by running a managed feature through 2-3 PDLC phase transitions after SKILL.md update and verifying the orchestrator dispatches correctly. | The existing Feature 011 test suite passes with zero failures. A manual smoke test of a managed feature progressing through at least REQ_CREATION → REQ_REVIEW → REQ_APPROVED confirms correct orchestrator behavior after SKILL.md update. | P0 | 1 |

---

## 6. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-01 | Unmanaged features break — features started before Feature 011 that still use the old SKILL.md-driven routing will lose their workflow instructions. | Low | High | The orchestrator's backward compatibility (REQ-SM-NF-03) handles unmanaged features via the existing `RoutingEngine.decide()` path. For unmanaged features, the orchestrator processes whatever routing signal the agent emits — the orchestrator's behavior depends on the signal in the agent's response, not on whether the SKILL.md contains routing instructions. Agents may still emit `ROUTE_TO_AGENT` from cached knowledge. The simplified SKILL.md still includes signal emission format in the Response Contract, so agents can emit the signals the orchestrator expects. |
| R-02 | Agents lose context about the PDLC — without task selection and routing context, agents may not understand where their task fits in the broader workflow. | Medium | Low | Add a brief "How the PDLC works" overview section to each SKILL.md explaining that the orchestrator manages workflow and the agent focuses on domain tasks. This provides context without embedding workflow logic. |
| R-03 | Cross-review format breaks — if the cross-review instructions are accidentally modified during simplification, the orchestrator's parser may fail. | Low | High | REQ-CR-01 and REQ-CR-02 explicitly preserve the format. The cross-review section should be treated as a protected zone during editing. |

---

## 7. Scope Boundaries

### In Scope

- Removing task selection decision tables from all four SKILL.md files
- Removing PDLC workflow routing logic (agent ID lookup tables, routing task, workflow `ROUTE_TO_AGENT` examples)
- Preserving `<routing>` tag signal emission format in the response contract
- Removing document status management instructions
- Adding response contract section (LGTM/ROUTE_TO_USER/TASK_COMPLETE/ROUTE_TO_AGENT for ad-hoc)
- Preserving cross-review file format and convention
- Preserving all domain-specific instructions
- Preserving git workflow (with simplified signaling)

### Out of Scope

- Changes to orchestrator code (Feature 011 is already deployed)
- Changes to cross-review file format (preserved as-is)
- Changes to document templates in `docs/templates/`
- New agent capabilities or task types
- Testing the SKILL.md changes (these are prompt instructions — validation is manual)

---

## 8. Per-Skill Change Summary

| Skill | Sections to Remove | Sections to Preserve | Sections to Add |
|-------|-------------------|---------------------|-----------------|
| **backend-engineer** | Task Selection table, Route Documents task, routing lookup table, Document Status section, trigger descriptions, PDLC workflow `<routing>` examples | Role & Mindset, Git Workflow (simplified), Web Search, Create TSPEC, Create Execution Plan, Review Other Documents, Implement TSPEC (TDD), Address Review Feedback, Review File Convention, TDD Principles, DI Principles, Working with Docs, Communication, Quality Checklist | Response Contract |
| **frontend-engineer** | Task Selection table, Route Documents task, routing lookup table, Document Status section, trigger descriptions, PDLC workflow `<routing>` examples | Role & Mindset, Git Workflow (simplified), Web Search, Create TSPEC, Create Execution Plan, Review Other Documents, Implement TSPEC (TDD), Address Review Feedback, Review File Convention, TDD Principles, DI Principles, Frontend Considerations, Working with Docs, Communication, Quality Checklist | Response Contract |
| **product-manager** | Task Selection table, Route Documents task, routing lookup table, Document Status section, trigger descriptions, PDLC workflow `<routing>` examples | Role & Mindset, Git Workflow (simplified), Phase 0 Bootstrap, Web Search, Create REQ, Create FSPEC, Review Other Documents, Review File Convention, Feature & Release Model, Document Formats, Working with Docs, Communication, Quality Checklist | Response Contract |
| **test-engineer** | Task Selection table, Route Documents task (if applicable), routing lookup table, Document Status section, trigger descriptions, PDLC workflow `<routing>` examples | Role & Mindset, Git Workflow (simplified), Web Search, Create Properties, Ensure Coverage, Route/Update Documents, Review Other Documents, Review File Convention, Test Pyramid Principles, Property Derivation Guidelines, Working with Docs, Communication, Quality Checklist | Response Contract |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Backend Engineer | eng | March 15, 2026 | Approved with minor changes (addressed in v1.1) |
| Test Engineer | qa | March 15, 2026 | Approved with minor changes (addressed in v1.1) |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 15, 2026 | Product Manager | Initial requirements — 15 functional requirements + 3 NFRs across 6 domains, implementing REQ-SA-01 through REQ-SA-06 from Feature 011 |
| 1.1 | March 15, 2026 | Product Manager | Addressed backend-engineer review (3 findings, 1 question) and test-engineer review (4 findings, 1 question). Changes: (BE F-01) Rewrote REQ-RT-02 to distinguish PDLC workflow routing (remove) from signal emission syntax (preserve). (BE F-02 + QA F-02 + BE Q-01 + QA Q-01) Expanded REQ-RC-02 to include all four signals with exact `<routing>` tag format examples; added `ROUTE_TO_AGENT` as fourth signal for ad-hoc coordination only. (QA F-01) Added manual validation method to REQ-NF-03. (BE F-03) Corrected R-01 mitigation reasoning. (QA F-04) Section 8 now uses domain function names instead of task numbers. Updated scope boundaries to clarify signal emission preservation. Status: Approved. |

---

*End of Document*
