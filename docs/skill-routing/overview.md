# Skill Routing (Phase 3)

Core orchestration loop. Assembles 3-layer context (role prompt, feature docs, thread history), invokes Claude Code skills in isolated git worktrees, and parses `<routing>` tags from responses to determine next actions: hand off to another agent, escalate to a human, or complete the task.
