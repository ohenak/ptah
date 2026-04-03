# 012 Skill Simplification

Remove PDLC workflow logic from all four SKILL.md files (backend-engineer, frontend-engineer, product-manager, test-engineer) now that the orchestrator-driven PDLC state machine (Feature 011) handles phase ordering, review routing, and document status management deterministically in code. Agents should focus purely on their domain tasks — the orchestrator tells them what to do via explicit task directives.
