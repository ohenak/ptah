# Ptah

An AI-powered multi-agent orchestrator that coordinates specialized engineering skills through Discord and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

Ptah connects a team of AI agents — product manager, backend engineer, frontend engineer, test engineer, and tech lead — to collaborate on feature development inside Discord threads, with automatic git commits, human-in-the-loop question escalation, and graceful lifecycle management.

## Project Structure

```
ptah/                       — Ptah CLI (TypeScript, ESM, Vitest)
  bin/ptah.ts               — CLI entry point and composition root
  src/
    commands/               — CLI commands (init, start)
    config/                 — Config loader and defaults
    orchestrator/           — Core orchestration engine
      pdlc/                 — Product Development Lifecycle state machine
    services/               — Discord, Git, Claude Code, filesystem adapters
    shutdown.ts             — 7-step graceful shutdown
    types.ts                — Shared type definitions
  ptah.config.json          — Orchestrator configuration
.claude/skills/             — Claude Code skill definitions:
  product-manager           — Discovery, requirements, and product planning
  frontend-engineer         — Frontend features with TDD and spec-driven development
  backend-engineer          — Backend features with TDD and spec-driven development
  test-engineer             — Test strategy, property documentation, and test plans
  tech-lead                 — Plan analysis, parallel batch orchestration, and agent dispatch
docs/                       — Feature-based documentation (each folder maps to a feature):
  001-init/                 — Project scaffolding and `ptah init`
  002-discord-bot/          — Discord.js client and message handling
  003-skill-routing/        — Orchestration loop and context assembly
  004-artifact-commits/     — Automatic git commits from skill output
  005-user-questions/       — Human-in-the-loop question escalation
  006-guardrails/           — Safety and resource controls
  007-polish/               — Logging, observability, and UX refinements
  008-conversation-logging/ — Conversation history and logging
  009-auto-feature-bootstrap/ — Feature folder creation on first mention
  010-parallel-feature-development/ — Multi-threaded feature work with worktree isolation
  011-orchestrator-pdlc-state-machine/ — PDLC state machine for document lifecycle
  012-skill-simplification/ — Skill definition simplification
  014-tech-lead-orchestration/ — Tech-lead parallel batch execution
  requirements/             — Master requirements and traceability matrix
  templates/                — Markdown templates for specs, plans, and traceability
```

## CLI Commands

### `ptah init`

Scaffolds the Ptah documentation structure into a Git repository — creates directories, template files, and auto-commits.

### `ptah start`

Starts the orchestrator as a Discord bot. Connects to Discord, listens for messages, and routes agent tasks through the orchestration loop.

## Configuration

Ptah is configured via `ptah/ptah.config.json`. Below is a reference for each section.

### `project`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Project name |
| `version` | string | Project version (semver) |

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

Array of agent entries. Each agent has:

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | Agent identifier (e.g., `"pm"`, `"eng"`, `"fe"`, `"qa"`, `"tl"`) |
| `skill_path` | string | Relative path to the agent's `SKILL.md` file |
| `log_file` | string | Relative path to the agent's log file |
| `mention_id` | string | Discord role snowflake ID for @mention routing |
| `mentionable` | boolean? | Whether this agent is Discord-mentionable (default: `true`). Set to `false` for internal orchestration agents like the tech lead that are dispatched programmatically, not via Discord mentions. When `false`, `mention_id` can be empty. |
| `display_name` | string | Human-readable agent name |

### `orchestrator`

| Key | Type | Description |
|-----|------|-------------|
| `max_turns_per_thread` | number | Maximum agent turns per thread before stopping (default: `15`) |
| `pending_poll_seconds` | number | Interval in seconds to poll for pending question answers (default: `30`) |
| `retry_attempts` | number | Number of retry attempts on transient invocation failures (default: `3`) |
| `invocation_timeout_ms` | number | Timeout per agent invocation in milliseconds (default: `1800000` / 30 min) |
| `tech_lead_agent_timeout_ms` | number | Timeout for tech-lead-dispatched engineer agents in milliseconds (default: `600000` / 10 min) |
| `retain_failed_worktrees` | boolean | If `true`, retain failed agent worktrees for debugging instead of cleaning up (default: `false`) |

### `git`

| Key | Type | Description |
|-----|------|-------------|
| `commit_prefix` | string | Prefix for auto-committed messages (default: `[ptah]`) |
| `auto_commit` | boolean | Whether to auto-commit artifact changes after each invocation (default: `true`) |

### `docs`

| Key | Type | Description |
|-----|------|-------------|
| `root` | string | Relative path to the docs directory (default: `../docs`) |
| `templates` | string | Relative path to the templates directory (default: `../docs/templates`) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token (referenced by `discord.bot_token_env`) |

## How It Works

### Orchestration Flow

```
                         Discord Thread
                              │
                              ▼
                     ┌────────────────┐
                     │  handleMessage  │
                     └───────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Dedup?         Paused?         Bot?
          (drop)         (drop)         (drop)
              │              │              │
              └──────────────┼──────────────┘
                             │ pass
                             ▼
                   ┌───────────────────┐
                   │ Turn-limit check  │
                   │ (reconstruct if   │
                   │  first encounter) │
                   └────────┬──────────┘
                            │
                   limit? ──┤──► Close thread
                            │
                            ▼
                   ┌───────────────────┐
                   │  Resolve agent    │
                   │  from @mention    │
                   └────────┬──────────┘
                            │
                   no match ┤──► "Please @mention a role"
                            │
         ┌──────────────────▼──────────────────┐
         │          ROUTING LOOP               │
         │                                     │
         │  ┌─────────────────────────────┐    │
         │  │ 1. Create worktree          │    │
         │  │ 2. Assemble 3-layer context │    │
         │  │ 3. Invoke skill (w/ retry)  │    │
         │  │ 4. Commit & merge docs      │    │
         │  │ 5. Post response embed      │    │
         │  │ 6. Auto-init PDLC (if new)  │    │
         │  │ 7. Parse <routing> signal   │    │
         │  └─────────────┬───────────────┘    │
         │                │                    │
         │    ┌───────────┼───────────┐        │
         │    ▼           ▼           ▼        │
         │  TASK_       ROUTE_      ROUTE_     │
         │  COMPLETE    TO_AGENT    TO_USER    │
         │  / LGTM                             │
         │    │           │           │        │
         │    │           │           ▼        │
         │    │           │   ┌──────────────┐ │
         │    │           │   │ Post to      │ │
         │    │           │   │ #open-       │ │
         │    │           │   │ questions    │ │
         │    │           │   │ Pause thread │ │
         │    │           │   │ Poll for     │ │
         │    │           │   │ answer       │ │
         │    │           │   └──────┬───────┘ │
         │    │           │          │         │
         │    │           │    ┌─────▼──────┐  │
         │    │           │    │ Pattern B  │  │
         │    │           │    │ Resume     │  │
         │    │           │    │ (on answer)│  │
         │    │           │    └─────┬──────┘  │
         │    │           │          │         │
         │    │           └──► loop ◄┘         │
         │    │                                │
         │    ▼                                │
         │  ┌─────────────────────────┐        │
         │  │ PDLC-managed?           │        │
         │  │  Y: advance phase,      │        │
         │  │     dispatch next agent  │        │
         │  │  N: post completion      │        │
         │  └─────────────────────────┘        │
         └─────────────────────────────────────┘
```

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
| `tl` | Tech Lead | Plan analysis, parallel batch orchestration (internal — not Discord-mentionable) |

### 3. What happens next

The orchestrator picks up the message and runs a **routing loop**:

1. **Dedup & guard** — skips duplicate messages, checks turn limits, and drops messages for paused threads
2. **Resolve agent** — maps the Discord @role mention to an agent ID via `role_mentions` config
3. **Create worktree** — derives the feature branch (`feat-{slug}`) from the thread name, creates it from main if needed, then spins up an isolated git worktree on a per-invocation agent sub-branch (`ptah/{slug}/{agentId}/{invocationId}`) based off the feature branch. A branch-uniqueness guard regenerates the invocation ID (up to 3 attempts) if the branch already exists with unmerged commits, or deletes a leftover branch with no unmerged commits.
4. **Assemble context** — builds a 3-layer prompt within the token budget:
   - **Layer 1 (system):** agent skill prompt (`SKILL.md`) + feature `overview.md` + ACTION directives
   - **Layer 2 (feature files):** other `docs/{feature}/` files (REQ, FSPEC, TSPEC, etc.), trimmed to budget
   - **Layer 3 (user message):** the trigger message or previous agent's routing response
5. **Invoke skill** — runs via Claude Agent SDK inside the worktree, with exponential backoff retry via InvocationGuard (configurable attempts, timeout). The worktree is registered before invocation and deregistered after.
6. **Commit & merge** — two-tier merge: only `docs/` changes are staged and committed on the agent sub-branch, then merged (`--no-ff`) into the feature branch and pushed to remote. Non-docs changes are filtered out. Worktree is cleaned up after merge. A merge lock serializes concurrent merges. For tech-lead orchestration, `mergeBranchIntoFeature` handles merging full worktree branches (not just docs) into the feature branch with conflict detection and abort.
7. **Post response** — posts the agent's text response as a Discord embed in the thread. If the Discord post fails after a successful commit, a partial-commit error is posted and the SHA is logged to `#debug`.
8. **PDLC auto-initialization** — on first invocation for a feature, if the thread has at most 1 prior agent turn (age guard), the orchestrator auto-initializes a PDLC state machine for the feature. Configuration keywords can be included in the initial message using bracket syntax: `[backend-only]` (default), `[frontend-only]`, `[fullstack]`, `[skip-fspec]`. Threads with more prior turns fall through to the unmanaged path.
9. **Route** — parses the `<routing>` tag from the agent's response to determine the next step:

   **For PDLC-managed features** (state machine tracks document lifecycle):
   - **`TASK_COMPLETE` / `LGTM`** — the PDLC dispatcher advances to the next phase and dispatches the appropriate agent automatically (e.g., REQ creation → REQ review → FSPEC creation → ...). During review phases, the cross-review file is parsed and a `review_submitted` event is fired instead.
   - **`ROUTE_TO_AGENT`** — ad-hoc coordination; invokes the target agent for one turn without changing the PDLC phase
   - **`ROUTE_TO_USER`** — pauses the thread, posts a question to `#open-questions`, and polls for the human answer (Pattern B resume)

   **For unmanaged features** (backward-compatible path):
   - **`ROUTE_TO_AGENT`** — hands off to another agent in the same thread (reply) or spawns a new coordination thread (new_thread)
   - **`ROUTE_TO_USER`** — same pause/poll/resume behavior as above
   - **`TASK_COMPLETE`** / **`LGTM`** — posts a completion embed and stops

   The routing loop continues until a terminal signal is reached or the turn limit is hit.

### Startup Recovery

On startup, the orchestrator restores its state so it can survive restarts:

1. **Prune orphaned worktrees** — cleans up worktrees left behind by previous runs
2. **Resolve channels** — looks up the `#debug` and `#open-questions` channels by name and registers a reply listener on `#open-questions`
3. **Seed question map** — reads both `pending.md` and `resolved.md` to rebuild the Discord message ID → question ID map
4. **Restore paused threads** — re-adds pending questions to the paused set and re-registers them with the question poller
5. **Load PDLC state** — reads `ptah/state/pdlc-state.json` to restore feature phase tracking

### Question Escalation (Pattern B)

When an agent emits `ROUTE_TO_USER`, the orchestrator runs the full question-answer-resume cycle:

1. **Pause** — the question is appended to the question store (assigned an auto-incrementing ID like `Q-0001`), a notification mentioning the configured user is posted to `#open-questions`, and the originating thread is paused (all further messages silently dropped)
2. **Answer** — the configured user replies to the notification in `#open-questions`. The orchestrator matches the Discord reply to the original question via an in-memory message ID map, writes the answer to the question store, and reacts with a checkmark
3. **Resume** — the question poller detects the answer, unpauses the thread, and triggers a Pattern B resume: a new worktree is created, the agent is re-invoked with a context bundle that includes the original question and the human's answer, artifacts are committed and merged, and routing continues as normal. The question is archived after a successful resume.

### Discord Channels

| Channel | Purpose |
|---------|---------|
| `#ptah-updates` | Main channel for creating task threads |
| `#open-questions` | Where agents escalate questions to humans; replies from the configured user are matched back to pending questions |
| `#debug` | Debug/diagnostic output (turn limit closures, merge conflicts, retry warnings) |

## Product Development Lifecycle (PDLC)

The orchestrator owns the entire document lifecycle for each feature through a **deterministic state machine** (`ptah/src/orchestrator/pdlc/`). Agents no longer decide what to do next — the state machine advances phases, dispatches agents, and enforces review gates automatically.

### Phases

Each feature progresses through 18 phases in a fixed order. Each document goes through creation → review → approved before the next begins:

```
REQ_CREATION (PM) → REQ_REVIEW → REQ_APPROVED →
FSPEC_CREATION (PM) → FSPEC_REVIEW → FSPEC_APPROVED →
TSPEC_CREATION (Eng) → TSPEC_REVIEW → TSPEC_APPROVED →
PLAN_CREATION (Eng) → PLAN_REVIEW → PLAN_APPROVED →
PROPERTIES_CREATION (QA) → PROPERTIES_REVIEW → PROPERTIES_APPROVED →
IMPLEMENTATION (Eng or Tech Lead) → IMPLEMENTATION_REVIEW → DONE
```

FSPEC can be skipped (`skipFspec: true` in feature config) — the state machine transitions directly from `REQ_APPROVED` to `TSPEC_CREATION`.

When `useTechLead: true` is set in the feature config, IMPLEMENTATION routes to the tech-lead agent instead of directly to `eng`/`fe`. See [Tech-Lead Orchestration](#tech-lead-orchestration) below.

### Documents

| Document | Owner | Description |
|----------|-------|-------------|
| REQ | Product Manager | Requirements with user stories, acceptance criteria, and priorities |
| FSPEC | Product Manager | Functional specifications for complex behavioral flows |
| TSPEC | Backend/Frontend Engineer | Technical specification with architecture and design decisions |
| PLAN | Backend/Frontend Engineer | Step-by-step execution plan for implementation |
| PROPERTIES | Test Engineer | Testable properties, coverage analysis, and test strategy |

### Cross-Skill Reviews

When a document enters a review phase, the state machine computes the required reviewers and dispatches them automatically:

| Review Phase | Reviewers |
|-------------|-----------|
| REQ | eng + qa (or fe + qa, or eng + fe + qa for fullstack) |
| FSPEC | eng + qa (or fe + qa, or eng + fe + qa for fullstack) |
| TSPEC | pm + qa |
| PLAN | pm + qa |
| PROPERTIES | pm + eng (or pm + fe, or pm + eng + fe for fullstack) |
| IMPLEMENTATION | qa |

Reviewers write a `CROSS-REVIEW-{skill}-{docType}.md` file with a recommendation: **Approved**, **Approved with minor changes**, or **Needs revision**. The dispatcher parses these files and evaluates: if all reviewers approve, the phase advances; if any request revision, the original author is re-dispatched to revise (up to 3 revision cycles before pausing for human intervention).

### Fullstack Fork-Join

For fullstack features (`discipline: "fullstack"`), TSPEC creation, PLAN creation, and implementation phases **fork** work to both `eng` and `fe` agents in parallel. The state machine tracks each agent's completion independently and only advances to the review phase once both finish.

### Context Matrix

The state machine selects which documents to include as context for each agent invocation based on the current phase. For example, during TSPEC creation the agent receives the overview, REQ, and FSPEC (if present) — but not documents from later phases. During revision, the relevant cross-review files are added so the author can see reviewer feedback.

### State Persistence

Feature state is persisted to `ptah/state/pdlc-state.json` using atomic writes (write to `.tmp`, then rename). State is loaded on startup and survives orchestrator restarts.

## Tech-Lead Orchestration

When a feature's `FeatureConfig` has `useTechLead: true`, the IMPLEMENTATION phase is handled by the tech-lead agent instead of a single engineer. The tech lead analyzes the plan's dependency graph, computes parallel execution batches, and dispatches multiple engineer subagents concurrently.

### How It Works

```
                    Approved PLAN
                         │
                         ▼
              ┌─────────────────────┐
              │  Parse dependencies  │
              │  (3 syntax forms)    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Topological batch   │
              │  computation (Kahn's)│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Pre-flight checks   │
              │  (remote branch,     │
              │   merge capability)  │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Present plan for    │
              │  user confirmation   │
              └──────────┬──────────┘
                         │
                    approve / modify / cancel
                         │
          ┌──────────────┼──────────────┐
          │         For each batch:     │
          │                             │
          │  1. Dispatch phases in      │
          │     parallel (Agent tool    │
          │     + isolation: worktree)  │
          │  2. Collect results         │
          │  3. Merge worktrees         │
          │     (serialized, doc order) │
          │  4. Run test gate           │
          │     (npx vitest run)        │
          │  5. Update plan status      │
          │  6. Next batch              │
          └─────────────────────────────┘
```

### Dependency Syntax

The tech lead parses three dependency syntax forms from the plan's "Task Dependency Notes" section:

| Syntax | Example | Edges Produced |
|--------|---------|----------------|
| Linear chain | `Phase A → Phase B → Phase C` | (A→B), (B→C) |
| Fan-out | `Phase A → [Phase B, Phase C]` | (A→B), (A→C) |
| Natural language | `Phase C depends on: Phase A, Phase B` | (A→C), (B→C) |

### Batch Execution

- Batches execute **sequentially** — Batch N waits for Batch N-1 to complete and pass the test gate
- Phases within a batch execute **in parallel** — each in an isolated git worktree
- Concurrency cap of **5 agents** per batch — larger batches are split into sub-batches
- The test gate fires once per topological batch (after all sub-batches merge), not between sub-batches

### Failure Handling

- **Phase failure:** No worktrees are merged (no-partial-merge invariant). The feature branch is left in its pre-batch state. The developer fixes and re-invokes.
- **Merge conflict:** The conflicting merge is aborted, remaining merges are skipped, and conflicting file names are reported.
- **Test gate failure:** Assertion failures and runner failures are distinguished and reported separately. Plan status is NOT updated.

### Skill Assignment

The tech lead assigns each phase to `backend-engineer` or `frontend-engineer` based on source file prefixes in the plan's task table:

| Prefix | Skill |
|--------|-------|
| `src/`, `config/`, `tests/`, `bin/` | backend-engineer |
| `app/`, `components/`, `pages/`, `styles/`, `hooks/` | frontend-engineer |
| `docs/`, empty, unrecognized | backend-engineer (default) |
| Mixed backend + frontend | backend-engineer + warning |

### Resume

The tech lead auto-detects completed phases by reading task statuses from the plan. Phases where all tasks are marked Done (✅) are excluded from batch computation. Re-invoking the tech lead on a partially-completed plan resumes from the first incomplete batch.

### Configuration

Tech-lead orchestration is opt-in per feature via `useTechLead: true` in the feature's `FeatureConfig`. When absent or `false`, the existing sequential dispatch to `eng`/`fe` is preserved — no behavioral change for existing features.

For fullstack features, `useTechLead: true` suppresses the PDLC-level fork-join for IMPLEMENTATION. The tech lead handles its own internal parallelism instead.

## Key Capabilities

- **Multi-agent orchestration** — coordinates 5 specialized agents with automatic inter-agent routing
- **Tech-lead orchestration** — analyzes plan dependencies, computes parallel batches via topological layering, and dispatches multiple engineer subagents concurrently with inter-batch test gates
- **PDLC state machine** — enforces document lifecycle phases and cross-skill review gates
- **Token budget management** — layered token allocation across context assembly (skill prompt, feature context, thread history)
- **Git workflow** — two-tier merge (agent sub-branch → feature branch), isolated worktrees per invocation, auto-commits, merge-lock serialization
- **Worktree branch merging** — `mergeBranchIntoFeature` for serialized merging of parallel agent worktrees into the feature branch with conflict detection
- **Question escalation** — persistent question store with polling for human answers
- **Auto feature bootstrap** — automatically creates feature folders and overview files on first mention
- **Parallel feature development** — concurrent work on multiple features via isolated git worktrees
- **Graceful shutdown** — 7-step sequence: signal handling, drain in-flight work, commit pending changes, disconnect
- **Resilient invocation** — exponential backoff retries with transient/unrecoverable failure classification
- **Message deduplication** — prevents duplicate processing of Discord messages
- **Turn limits** — configurable max turns per thread to bound agent loops

## Development

Requires Node.js 20 LTS. All commands run from the `ptah/` directory:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm run build    # Compile TypeScript
npm test         # Run tests (vitest)
npm run dev      # Development mode (tsx)
```

## Usage

Clone this repo and open it with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use the skills and templates in your workflow.
