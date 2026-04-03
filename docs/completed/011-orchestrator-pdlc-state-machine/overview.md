# 011 Orchestrator PDLC State Machine

Currently, PDLC (Product Development Lifecycle) state management is embedded in individual SKILL.md files for each agent (product-manager, backend-engineer, frontend-engineer, test-engineer). Each agent's SKILL.md contains its own understanding of PDLC phases, document status transitions (Draft → In Review → Approved), and routing logic. This is non-deterministic because agents interpret these instructions via LLM, leading to potential inconsistencies in state transitions.

The goal is to centralize PDLC state management into the Ptah orchestrator so that the orchestrator owns the state machine, enforces valid transitions, determines which agent to invoke at each phase, tracks review approvals deterministically, and persists state to survive restarts. Agents should focus purely on their domain task (create document, review document, implement code) without needing to know the full workflow or manage routing themselves.
