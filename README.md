# Ptah

An AI-powered multi-agent orchestrator that coordinates specialized engineering skills through Discord and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), with durable workflow execution powered by [Temporal](https://temporal.io).

Ptah connects a team of AI agents — product manager, backend engineer, frontend engineer, test engineer, and tech lead — to collaborate on feature development inside Discord threads, with crash-resilient workflow replay, automatic git commits, human-in-the-loop question escalation, and configurable lifecycle phases.

## Project Structure

```
ptah/                       — Ptah CLI (TypeScript, ESM, Vitest)
  bin/ptah.ts               — CLI entry point and composition root
  src/
    commands/               — CLI commands (init, start, migrate, migrate-lifecycle)
    config/                 — Config loader, defaults, workflow YAML parser
    orchestrator/           — Core orchestration engine
      pdlc/                 — Legacy PDLC types and v4→v5 migration helpers
    services/               — Discord, Git, Claude Code, filesystem adapters
    temporal/               — Temporal integration
      activities/           — Temporal activity functions (skill, notification, promotion)
      workflows/            — Temporal workflow definitions (feature-lifecycle)
      client.ts             — Temporal client wrapper
      worker.ts             — Temporal worker setup
      types.ts              — Shared Temporal types (signals, queries, state)
    shutdown.ts             — Graceful shutdown
    types.ts                — Shared type definitions
  ptah.config.json          — Orchestrator configuration
ptah.workflow.yaml          — PDLC workflow phase definitions (YAML)
.claude/skills/             — Claude Code skill definitions:
  product-manager           — Discovery, requirements, and product planning
  frontend-engineer         — Frontend features with TDD and spec-driven development
  backend-engineer          — Backend features with TDD and spec-driven development
  test-engineer             — Test strategy, property documentation, and test plans
  tech-lead                 — Plan analysis, parallel batch orchestration, and agent dispatch
docs/                       — Feature lifecycle folders:
  backlog/                  — Features not yet started
  in-progress/              — Features currently being worked on
  completed/                — Completed features (NNN-prefixed)
  templates/                — Markdown templates for specs, plans, and traceability
  requirements/             — Master requirements and traceability matrix
```

## CLI Commands

### `ptah init`

Scaffolds the Ptah documentation structure into a Git repository — creates directories, template files, `ptah.config.json`, `ptah.workflow.yaml`, and auto-commits.

### `ptah start`

Starts the orchestrator as a Discord bot. Connects to Discord, starts the Temporal worker, connects the Temporal client, and begins routing agent tasks through durable workflows.

### `ptah migrate`

Migrates v4 `pdlc-state.json` to Temporal Workflows. Reads the v4 state file, maps each feature's phase to the v5 workflow phase ID, and starts a Temporal Workflow for each feature at the corresponding phase. Supports `--dry-run`, `--include-completed`, and `--phase-map` flags.

### `ptah migrate-lifecycle`

One-time migration from the flat `docs/{slug}/` structure to lifecycle folders (`docs/backlog/`, `docs/in-progress/`, `docs/completed/`). NNN-prefixed folders are moved to `docs/completed/`, remaining feature folders to `docs/in-progress/`.

## Configuration

### `ptah.config.json`

Main orchestrator configuration.

#### `project`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Project name |

#### `discord`

| Key | Type | Description |
|-----|------|-------------|
| `server_id` | string | Discord server (guild) ID |
| `bot_token_env` | string | Environment variable name holding the Discord bot token (default: `DISCORD_BOT_TOKEN`) |
| `channels.updates` | string | Channel name for creating task threads (default: `agent-updates`) |
| `channels.questions` | string | Channel name for human-in-the-loop question escalation (default: `open-questions`) |
| `channels.debug` | string | Channel name for diagnostic output (default: `agent-debug`) |
| `mention_user_id` | string | Discord user ID to mention when escalating questions |

#### `agents`

Array of agent entries. Each agent has:

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | Agent identifier (e.g., `"pm"`, `"eng"`, `"fe"`, `"qa"`, `"tl"`) |
| `skill_path` | string | Relative path to the agent's `SKILL.md` file |
| `log_file` | string | Relative path to the agent's log file |
| `mention_id` | string | Discord role snowflake ID for @mention routing |
| `mentionable` | boolean? | Whether this agent is Discord-mentionable (default: `true`). Set to `false` for internal orchestration agents like the tech lead. |
| `display_name` | string | Human-readable agent name |

#### `orchestrator`

| Key | Type | Description |
|-----|------|-------------|
| `max_turns_per_thread` | number | Maximum agent turns per thread (default: `10`) |
| `pending_poll_seconds` | number | Interval in seconds to poll for pending question answers (default: `30`) |
| `retry_attempts` | number | Retry attempts on transient failures (default: `3`) |
| `invocation_timeout_ms` | number | Timeout per agent invocation in ms (default: `1800000` / 30 min) |
| `tech_lead_agent_timeout_ms` | number | Timeout for tech-lead-dispatched agents in ms (default: `600000` / 10 min) |
| `retain_failed_worktrees` | boolean | Retain failed agent worktrees for debugging (default: `false`) |
| `archive_on_resolution` | boolean | Archive Discord thread after LGTM/TASK_COMPLETE (default: `true`) |

#### `temporal`

| Key | Type | Description |
|-----|------|-------------|
| `address` | string | Temporal server address (default: `localhost:7233`) |
| `namespace` | string | Temporal namespace (default: `default`) |
| `taskQueue` | string | Temporal task queue name (default: `ptah-main`) |
| `tls.clientCertPath` | string? | Path to TLS client certificate |
| `tls.clientKeyPath` | string? | Path to TLS client key |
| `worker.maxConcurrentWorkflowTasks` | number | Max concurrent workflow tasks (default: `10`) |
| `worker.maxConcurrentActivities` | number | Max concurrent activities (default: `3`) |
| `retry.maxAttempts` | number | Activity retry max attempts (default: `3`) |
| `retry.initialIntervalSeconds` | number | Initial retry interval (default: `30`) |
| `retry.backoffCoefficient` | number | Retry backoff coefficient (default: `2.0`) |
| `retry.maxIntervalSeconds` | number | Max retry interval (default: `600`) |
| `heartbeat.intervalSeconds` | number | Activity heartbeat interval (default: `30`) |
| `heartbeat.timeoutSeconds` | number | Activity heartbeat timeout (default: `120`) |

#### `git`

| Key | Type | Description |
|-----|------|-------------|
| `commit_prefix` | string | Prefix for auto-committed messages (default: `[ptah]`) |
| `auto_commit` | boolean | Whether to auto-commit artifact changes (default: `true`) |

#### `docs`

| Key | Type | Description |
|-----|------|-------------|
| `root` | string | Relative path to the docs directory (default: `docs`) |
| `templates` | string | Relative path to the templates directory (default: `./ptah/templates`) |

### `ptah.workflow.yaml`

Defines the PDLC workflow phases as configuration rather than hardcoded TypeScript. Each phase specifies its type, owning agent, reviewers, context documents, and transition target. The workflow is loaded at startup and validated against the agent registry. See the generated file from `ptah init` for the full default configuration.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token (referenced by `discord.bot_token_env`) |

## How It Works

### Architecture

Ptah v5 replaces the custom orchestration infrastructure (state machine, thread queue, invocation guard, question polling) with **Temporal durable workflows**. The PDLC phases, agent-to-phase mappings, reviewer manifests, and transition rules are **configuration-driven** via `ptah.workflow.yaml`.

```
┌──────────────────────────────────────────────────────────┐
│                    Ptah Process                          │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Discord     │  │  Temporal    │  │  Temporal      │  │
│  │  Client      │  │  Client     │  │  Worker        │  │
│  │  (listener)  │  │  (signals,  │  │  (activities,  │  │
│  │             │  │   queries)  │  │   workflows)   │  │
│  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘  │
│         │                │                  │            │
│         └────────────────┼──────────────────┘            │
│                          │                               │
│              ┌───────────▼──────────┐                    │
│              │ Temporal Orchestrator │                    │
│              │ (message routing,     │                    │
│              │  workflow start,      │                    │
│              │  signal delivery)     │                    │
│              └──────────────────────┘                    │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │  Temporal Server  │
                 │  (localhost:7233) │
                 └───────────────────┘
```

### Feature Lifecycle Workflow

Each feature runs as a **durable Temporal Workflow** (`featureLifecycleWorkflow`) that progresses through phases defined in `ptah.workflow.yaml`:

```
REQ_CREATION (PM) → REQ_REVIEW → REQ_APPROVED →
FSPEC_CREATION (PM) → FSPEC_REVIEW → FSPEC_APPROVED →
TSPEC_CREATION (Eng) → TSPEC_REVIEW → TSPEC_APPROVED →
PLAN_CREATION (Eng) → PLAN_REVIEW → PLAN_APPROVED →
PROPERTIES_CREATION (QA) → PROPERTIES_REVIEW → PROPERTIES_APPROVED →
IMPLEMENTATION (Eng or Tech Lead) → IMPLEMENTATION_REVIEW → DONE
```

The workflow is deterministic — all I/O happens through Temporal **Activities**:

| Activity | Purpose |
|----------|---------|
| `invokeSkill` | Run a Claude Agent SDK skill in an isolated worktree |
| `sendNotification` | Post messages/questions to Discord |
| `mergeWorktree` | Merge agent worktree into the feature branch |
| `resolveFeaturePath` | Resolve a feature slug to its lifecycle folder |
| `promoteBacklogToInProgress` | Move feature from `docs/backlog/` to `docs/in-progress/` |
| `promoteInProgressToCompleted` | Move feature to `docs/completed/{NNN}-{slug}/` with file renaming |

### Temporal Signals and Queries

The workflow responds to **Signals** from Discord:

| Signal | Purpose |
|--------|---------|
| `user-answer` | Deliver a human's answer to a pending question |
| `retry-or-cancel` | Retry a failed phase or cancel the workflow |
| `resume-or-cancel` | Resume after a pause or cancel |
| `ad-hoc-revision` | Request an ad-hoc revision from a specific agent |

The workflow exposes a **Query**:

| Query | Returns |
|-------|---------|
| `workflow-state` | Full `FeatureWorkflowState` (current phase, completed phases, review states, pending questions, failure info) |

### Feature Lifecycle Folders

Features live in lifecycle folders that reflect their status:

| Folder | Purpose |
|--------|---------|
| `docs/backlog/` | Features defined but not yet started |
| `docs/in-progress/` | Features actively being worked on |
| `docs/completed/` | Completed features, prefixed with sequence number (e.g., `016-feature-name/`) |

The workflow automatically promotes features between folders as they progress. The **Feature Resolver** locates features by slug across all lifecycle folders (search order: `in-progress` → `backlog` → `completed`).

### Orchestration Flow

1. **Thread created** — A user creates a thread in `#agent-updates` named `{feature-name} — {description}`
2. **@mention** — The user mentions an agent role (e.g., `@PM define requirements for auth`)
3. **Workflow started** — The `TemporalOrchestrator` starts a `featureLifecycleWorkflow` for the feature
4. **Phase execution** — The workflow invokes the appropriate agent via the `invokeSkill` activity in an isolated git worktree
5. **Artifact commit** — Changes are committed and merged into the feature branch
6. **Phase transition** — The workflow advances to the next phase per `ptah.workflow.yaml`
7. **Review gates** — Review phases dispatch multiple reviewers; all must approve before advancing
8. **Question escalation** — When an agent emits `ROUTE_TO_USER`, the workflow pauses and sends a notification to `#open-questions`, waiting for a `user-answer` signal
9. **Completion** — The workflow reaches `done` and optionally promotes the feature to `docs/completed/`

### Crash Recovery

Because the workflow runs on Temporal, it survives process restarts automatically:
- Workflow state is persisted in the Temporal server
- On restart, the worker replays the workflow history to restore state
- In-flight activities are retried per the configured retry policy
- No manual state file management required (replaces the old `pdlc-state.json`)

### Cross-Skill Reviews

When a document enters a review phase, the workflow computes the required reviewers based on the feature's discipline and dispatches them:

| Review Phase | Reviewers |
|-------------|-----------|
| REQ | eng + qa (or fe + qa, or eng + fe + qa for fullstack) |
| FSPEC | eng + qa (or fe + qa, or eng + fe + qa for fullstack) |
| TSPEC | pm + qa |
| PLAN | pm + qa |
| PROPERTIES | pm + eng (or pm + fe, or pm + eng + fe for fullstack) |
| IMPLEMENTATION | qa |

Reviewers write a `CROSS-REVIEW-{skill}-{docType}.md` file with a recommendation: **Approved**, **Approved with minor changes**, or **Needs revision**. If any reviewer requests revision, the original author is re-dispatched (up to the configured `revision_bound`, default 3).

### Tech-Lead Orchestration

When a feature's `FeatureConfig` has `useTechLead: true`, the IMPLEMENTATION phase is handled by the tech-lead agent. The tech lead analyzes the plan's dependency graph, computes parallel execution batches via Kahn's algorithm, and dispatches multiple engineer subagents concurrently.

**Batch execution:**
- Batches execute **sequentially** — Batch N waits for Batch N-1 to complete and pass the test gate
- Phases within a batch execute **in parallel** — each in an isolated git worktree
- Concurrency cap of **5 agents** per batch
- Test gate fires once per topological batch

**Failure handling:**
- **Phase failure:** No worktrees are merged (no-partial-merge invariant)
- **Merge conflict:** Conflicting merge aborted, remaining merges skipped
- **Test gate failure:** Failures reported, plan status not updated

### Question Escalation

When an agent emits `ROUTE_TO_USER`:

1. **Pause** — The workflow enters `waiting-for-user` status and sends a notification to `#open-questions` via the `sendNotification` activity
2. **Answer** — The user replies in Discord; the `TemporalOrchestrator` delivers the answer as a `user-answer` signal
3. **Resume** — The workflow resumes the agent with the question and answer as additional context

### Discord Channels

| Channel | Purpose |
|---------|---------|
| `#agent-updates` | Main channel for creating task threads |
| `#open-questions` | Where agents escalate questions to humans |
| `#agent-debug` | Debug/diagnostic output |

### Agents

| Agent | Skill | Description |
|-------|-------|-------------|
| `pm` | Product Manager | Discovery, requirements, functional specs |
| `eng` | Backend Engineer | Backend features, APIs, TDD |
| `fe` | Frontend Engineer | Frontend features, UI components, TDD |
| `qa` | Test Engineer | Test strategy, properties, test plans |
| `tl` | Tech Lead | Plan analysis, parallel batch orchestration (internal — not Discord-mentionable) |

## Key Capabilities

- **Temporal durable workflows** — crash-resilient feature lifecycle execution with deterministic replay, automatic retry, and persistent state
- **Configuration-driven PDLC** — workflow phases, transitions, reviewers, and context documents defined in `ptah.workflow.yaml` rather than hardcoded
- **Multi-agent orchestration** — coordinates 5 specialized agents with automatic inter-agent routing
- **Tech-lead orchestration** — analyzes plan dependencies, computes parallel batches via topological layering, and dispatches engineer subagents concurrently
- **Feature lifecycle folders** — automatic promotion between `backlog/`, `in-progress/`, and `completed/` with numbered prefixes
- **Cross-skill review gates** — multiple reviewers per document with revision cycles
- **Token budget management** — layered token allocation across context assembly
- **Git workflow** — isolated worktrees per invocation, auto-commits, merge-lock serialization
- **Question escalation** — pause/answer/resume cycle via Temporal signals and Discord
- **Ad-hoc revisions** — signal-based ad-hoc agent dispatch during an active workflow
- **v4 migration** — `ptah migrate` converts legacy `pdlc-state.json` to Temporal workflows
- **Graceful shutdown** — drain in-flight work, shut down Temporal worker, disconnect

## Development

### Prerequisites

- **Node.js 20 LTS**
- **Temporal Server** — for local development, use the Temporal CLI dev server (no Docker required)

### Setup

```bash
# Install Temporal CLI
# macOS: brew install temporal
# Other: https://docs.temporal.io/cli#install

# Start the Temporal dev server (runs on localhost:7233, UI on localhost:8233)
temporal server start-dev

# Install dependencies (from ptah/ directory)
cd ptah
npm install

# Build
npm run build

# Run tests
npm test

# Development mode (tsx, no build needed)
npm run dev
```

## Usage

Clone this repo and open it with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use the skills and templates in your workflow.
