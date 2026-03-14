# Ptah

An AI-powered multi-agent orchestrator that coordinates specialized engineering skills through Discord and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

Ptah connects a team of AI agents — product manager, backend engineer, frontend engineer, and test engineer — to collaborate on feature development inside Discord threads, with automatic git commits, human-in-the-loop question escalation, and graceful lifecycle management.

## Project Structure

```
ptah/                       — Ptah CLI (TypeScript, ESM, Vitest)
  bin/ptah.ts               — CLI entry point
  src/
    commands/               — CLI commands (init, start)
    config/                 — Config loader and defaults
    orchestrator/           — Core orchestration engine
    services/               — Discord, Git, Claude Code, filesystem adapters
    shutdown.ts             — 7-step graceful shutdown
    types.ts                — Shared type definitions
  ptah.config.json          — Example configuration
.claude/skills/             — Claude Code skill definitions:
  product-manager           — Discovery, requirements, and product planning
  frontend-engineer         — Frontend features with TDD and spec-driven development
  backend-engineer          — Backend features with TDD and spec-driven development
  test-engineer             — Test strategy, property documentation, and test plans
docs/                       — Feature-based documentation (each folder maps to a feature):
  001-init/                 — Project scaffolding and `ptah init`
  002-discord-bot/          — Discord.js client and message handling
  003-skill-routing/        — Orchestration loop and context assembly
  004-artifact-commits/     — Automatic git commits from skill output
  005-user-questions/       — Human-in-the-loop question escalation
  006-guardrails/           — Safety and resource controls
  007-polish/               — Logging, observability, and UX refinements
  requirements/             — Master requirements and traceability matrix
  templates/                — Markdown templates for specs, plans, and traceability
```

## CLI Commands

### `ptah init`

Scaffolds the Ptah documentation structure into a Git repository — creates directories, template files, and auto-commits.

### `ptah start`

Starts the orchestrator as a Discord bot. Connects to Discord, listens for messages, and routes agent tasks through the orchestration loop.

## How It Works

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

| Agent | Skill | Description |
|-------|-------|-------------|
| `pm` | Product Manager | Discovery, requirements, functional specs |
| `eng` | Backend Engineer | Backend features, APIs, TDD |
| `fe` | Frontend Engineer | Frontend features, UI components, TDD |
| `qa` | Test Engineer | Test strategy, properties, test plans |

### 3. What happens next

The orchestrator picks up the message and:

1. **Assembles context** — agent skill prompt + `docs/{feature}/` files + thread history (with token budget management)
2. **Invokes the skill** — runs via Claude Agent SDK in an isolated git worktree, with retry/backoff via InvocationGuard
3. **Commits artifacts** — any file changes in `docs/` are auto-committed and merged to main
4. **Routes based on the response** — the skill's `<routing>` tag determines the next step:
   - **`ROUTE_TO_AGENT`** — hands off to another agent in the same thread
   - **`ROUTE_TO_USER`** — posts a question to `#open-questions` for a human to answer
   - **`TASK_COMPLETE`** / **`LGTM`** — done

### Discord Channels

| Channel | Purpose |
|---------|---------|
| `#ptah-updates` | Main channel for creating task threads |
| `#open-questions` | Where agents escalate questions to humans |
| `#debug` | Debug/diagnostic output |

## Key Capabilities

- **Multi-agent orchestration** — coordinates 4 specialized agents with automatic inter-agent routing
- **Token budget management** — layered token allocation across context assembly
- **Git workflow** — feature branches, worktrees, auto-commits, merge-lock serialization
- **Question escalation** — persistent question store with polling for human answers
- **Graceful shutdown** — 7-step sequence: signal handling, drain in-flight work, commit pending changes, disconnect
- **Resilient invocation** — exponential backoff retries with transient/unrecoverable failure classification
- **Message deduplication** — prevents duplicate processing of Discord messages
- **Turn limits** — configurable max turns per thread to bound agent loops

## Development

All commands run from the `ptah/` directory:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm run build    # Compile TypeScript
npm test         # Run tests (vitest)
npm run dev      # Development mode (tsx)
```

## Usage

Clone this repo and open it with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use the skills and templates in your workflow.
