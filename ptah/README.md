# Ptah

An AI-powered multi-agent orchestrator that coordinates specialized engineering agents through Discord and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

Ptah connects a team of AI agents — product manager, backend engineer, frontend engineer, test engineer, and tech lead — to collaborate on feature development inside Discord threads.

## Installation

```bash
npm install -D @ohenak/ptah
```

## Quick Start

1. **Initialize** your project:

   ```bash
   npx ptah init
   ```

   This scaffolds the docs structure and creates `ptah.config.json` with sensible defaults.

2. **Configure** `ptah.config.json` with your Discord server ID, bot token env var, channel names, and agent roles.

3. **Start** the orchestrator:

   ```bash
   npx ptah start
   ```

## Configuration

`ptah init` generates a `ptah.config.json` in your project root. Below is a reference for each section.

### `project`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Project name |

### `discord`

| Key | Type | Description |
|-----|------|-------------|
| `server_id` | string | Discord server (guild) ID |
| `bot_token_env` | string | Environment variable name holding the Discord bot token (default: `DISCORD_BOT_TOKEN`) |
| `channels.updates` | string | Channel name for creating task threads (default: `ptah-updates`) |
| `channels.questions` | string | Channel name for human-in-the-loop question escalation (default: `open-questions`) |
| `channels.debug` | string | Channel name for diagnostic output (default: `debug`) |
| `mention_user_id` | string | Discord user ID to mention when escalating questions |

### `agents`

| Key | Type | Description |
|-----|------|-------------|
| `active` | string[] | List of active agent IDs |
| `skills` | object | Map of agent ID to skill file path |
| `colours` | object | Map of agent ID to hex colour for Discord embeds |
| `role_mentions` | object | Map of Discord role snowflake ID to agent ID |
| `model` | string | Claude model to use for agent invocations |
| `max_tokens` | number | Max tokens per agent response |

### `orchestrator`

| Key | Type | Description |
|-----|------|-------------|
| `max_turns_per_thread` | number | Maximum agent turns per thread before stopping (default: `15`) |
| `pending_poll_seconds` | number | Interval in seconds to poll for pending question answers (default: `30`) |
| `retry_attempts` | number | Number of retry attempts on transient invocation failures (default: `3`) |
| `invocation_timeout_ms` | number | Timeout per agent invocation in milliseconds (default: `1800000` / 30 min) |
| `tech_lead_agent_timeout_ms` | number | Timeout for tech-lead-dispatched engineer agents (default: `600000` / 10 min) |
| `retain_failed_worktrees` | boolean | Retain failed agent worktrees for debugging (default: `false`) |

### `git`

| Key | Type | Description |
|-----|------|-------------|
| `commit_prefix` | string | Prefix for auto-committed messages (default: `[ptah]`) |
| `auto_commit` | boolean | Whether to auto-commit artifact changes after each invocation (default: `true`) |

### `docs`

| Key | Type | Description |
|-----|------|-------------|
| `root` | string | Relative path to the docs directory (default: `docs`) |
| `templates` | string | Relative path to the templates directory (default: `./ptah/templates`) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token (referenced by `discord.bot_token_env`) |

## Agents

| Agent | Role |
|-------|------|
| Product Manager | Discovery, requirements, functional specs |
| Backend Engineer | Backend features, APIs, TDD |
| Frontend Engineer | Frontend features, UI components, TDD |
| Test Engineer | Test strategy, properties, test plans |
| Tech Lead | Plan analysis, parallel batch orchestration |

## Requirements

- Node.js 20+
- A Discord bot token
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with the Claude Agent SDK

## Documentation

See the [full documentation](https://github.com/ohenak/ptah#readme) for configuration reference, orchestration flow, PDLC lifecycle, and tech-lead orchestration details.

## License

MIT
