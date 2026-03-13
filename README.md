# eng-team

Claude Code skills and documentation templates for an engineering team workflow.

## Structure

- `.claude/skills/` — Claude Code skill definitions for each role:
  - `product-manager` — Discovery, requirements, and product planning
  - `frontend-engineer` — Frontend features with TDD and spec-driven development
  - `backend-engineer` — Backend features with TDD and spec-driven development
  - `test-engineer` — Test strategy, property documentation, and test plans
- `docs/` — Feature-based documentation (each folder maps to a Discord thread feature name):
  - `init/` — Phase 1: project scaffolding and `ptah init`
  - `discord-bot/` — Phase 2: Discord.js client and message handling
  - `skill-routing/` — Phase 3: orchestration loop and context assembly
  - `artifact-commits/` — Phase 4: automatic git commits from skill output
  - `user-questions/` — Phase 5: human-in-the-loop question escalation
  - `guardrails/` — Phase 6: safety and resource controls
  - `polish/` — Phase 7: logging, observability, and UX refinements
  - `requirements/` — Master requirements and traceability matrix
  - `templates/` — Markdown templates for requirements, specifications, plans, and traceability

## Usage

Clone this repo and open it with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use the skills and templates in your workflow.

## Posting Tasks to Skills via Discord

Ptah orchestrates agent skills through Discord. To request a skill to work on a task:

### 1. Create a thread in `#ptah-updates`

Name the thread using the convention:

```
{feature-name} — {description}
```

For example: `auth — define requirements`

The feature name (before the em-dash) maps to the `docs/{feature-name}/` folder, which is loaded as context for the agent.

### 2. Mention the target agent role

Post a message in the thread with an **@mention** of the agent's Discord role:

```
@PM please define the requirements for the auth flow
```

Available agents (configured in `ptah/ptah.config.json`):

| Agent | Skill | Role ID Key |
|-------|-------|-------------|
| `pm` | Product Manager | `ROLE_ID_FOR_PM` |
| `eng` | Backend Engineer | `ROLE_ID_FOR_ENG` |
| `fe` | Frontend Engineer | `ROLE_ID_FOR_FE` |
| `qa` | Test Engineer | `ROLE_ID_FOR_QA` |

### 3. What happens next

The orchestrator picks up the message and:

1. **Assembles context** — agent skill prompt + `docs/{feature}/` files + thread history
2. **Invokes the skill** — runs via Claude Code in an isolated git worktree
3. **Routes based on the response** — the skill's `<routing>` tag determines the next step:
   - **`ROUTE_TO_AGENT`** — hands off to another agent in the same thread
   - **`ROUTE_TO_USER`** — posts a question to `#open-questions` for you to answer
   - **`TASK_COMPLETE`** / **`LGTM`** — done

### Discord Channels

| Channel | Purpose |
|---------|---------|
| `#ptah-updates` | Main channel for creating task threads |
| `#open-questions` | Where agents escalate questions to humans |
| `#debug` | Debug/diagnostic output |
