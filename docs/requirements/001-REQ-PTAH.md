# Requirements Document

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH |
| **Parent Document** | [PTAH_PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 1.4 |
| **Date** | March 9, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This requirements document formalizes the Ptah v4.0 — a deployable framework that installs into any Git repository and coordinates four specialized Claude agents (PM Agent, Dev Agent, Frontend Agent, Test Agent) to collaboratively build software engineering projects.

Ptah v4.0 replaces the file-based thread protocol from v3.0 with Discord threads as the coordination layer. The repository reverts to its natural role as a versioned artifact store. The Orchestrator is the Discord bot itself — one process, one deployment, started via `ptah start`.

**Core principle:** Discord threads provide state, turn attribution, append-only history, and human participation for free. The repo provides durability, version control, and auditability of outputs. Each layer does what it is best at.

---

## 2. User Stories

Each user story describes a real-world situation that the product must support. Requirements in Section 6 trace back to these user stories.

### US-01: Developer Bootstraps Ptah in an Existing Repository

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to add the Ptah framework to an existing Git repository so that agents can begin collaborating on the project. They run `ptah init` from the repo root. |
| **Goals** | Scaffold the `/docs` folder structure, seed markdown templates, create `ptah.config.json`, and make an initial Git commit — all in under 30 seconds. |
| **Pain points** | Manually creating folder structures and config files is error-prone and tedious. Without a standard structure, agents have no convention to follow. |
| **Key needs** | One-command setup that is safe to run on existing repos (no overwrites), produces a valid config, and commits the scaffolding. |

### US-02: Orchestrator Coordinates Agent-to-Agent Review

| Attribute | Detail |
|-----------|--------|
| **Description** | The PM Agent has written `requirements.md` for a feature and requests the Dev Agent to review it. The Orchestrator manages the review loop in a Discord thread, enforcing a two-iteration (4-turn) cap. |
| **Goals** | Enable structured, bounded review loops between agents with full auditability, without requiring human intervention for routine reviews. |
| **Pain points** | Unbounded review loops waste tokens and time. Without a coordinator, agents cannot exchange feedback. Without a cap, loops can run indefinitely. |
| **Key needs** | Thread-based review with turn tracking, automatic context assembly, two-iteration hard limit, and escalation to user when agents cannot agree. |

### US-03: Agent Asks User a Blocking Question

| Attribute | Detail |
|-----------|--------|
| **Description** | During work, an agent encounters an ambiguity that requires human input (e.g., "Should OAuth use Google or GitHub as the provider?"). The agent raises a question, the Orchestrator writes it to `pending.md`, notifies the user via Discord, and pauses the thread until the user replies. |
| **Goals** | Unblock the agent pipeline by routing questions to the user and resuming work automatically when the user answers. |
| **Pain points** | Without a question-routing mechanism, agents either guess (producing incorrect output) or halt entirely with no notification to the user. |
| **Key needs** | Structured question routing via `pending.md`, Discord notification with @mention, polling for answers, automatic pipeline resumption with Pattern B context assembly. |

### US-04: Orchestrator Assembles Context for Stateless Skill Invocation

| Attribute | Detail |
|-----------|--------|
| **Description** | Before every Skill invocation, the Orchestrator must assemble the right context — enough for the Skill to act correctly, no more than necessary. The Skill is stateless; the Context Bundle is its only input. |
| **Goals** | Deliver a lean, correctly-scoped Context Bundle that fits within token budget and enables the Skill to produce accurate output without Discord access. |
| **Pain points** | Overloading context wastes tokens and degrades output quality. Underloading context causes agents to produce incomplete or incorrect work. Reading raw Discord payloads bloats context 3-4x. |
| **Key needs** | Three-layer context model (stable reference, current artifacts, immediate trigger), token budget enforcement, fresh artifact reads from repo, and three distinct resume patterns. |

### US-05: Developer Launches and Monitors the Orchestrator

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer runs `ptah start` to launch the Orchestrator as a long-running Discord bot process. They monitor its console output to observe agent activity, message routing, and artifact commits. |
| **Goals** | Start the Orchestrator with one command, see real-time activity logs, and shut down gracefully without losing in-flight work. |
| **Pain points** | Complex deployment setups with multiple processes or services. No visibility into what agents are doing. Ungraceful shutdowns corrupting state. |
| **Key needs** | Single-command startup, real-time console output, graceful SIGINT/SIGTERM handling, connection status feedback. |

### US-06: Agent Produces and Commits Artifacts

| Attribute | Detail |
|-----------|--------|
| **Description** | A Skill invocation produces or updates a `/docs` artifact file (e.g., `requirements.md`, `specifications.md`). The Orchestrator commits the change to Git with full attribution and appends an entry to the agent's log. |
| **Goals** | Every artifact change is version-controlled, attributed to the correct agent, and logged for auditability. Zero artifact changes without a corresponding Git commit. |
| **Pain points** | Manual commits are forgotten. Without attribution, it is unclear which agent changed what. Without logs, debugging agent behavior requires reading Git history. |
| **Key needs** | Automatic Git commit with `[ptah]` prefix and agent attribution, append-only agent logs, idempotent message processing. |

### US-07: System Handles Failures Gracefully

| Attribute | Detail |
|-----------|--------|
| **Description** | A Skill invocation fails (e.g., API timeout, model error). The Orchestrator retries with exponential backoff. If retries are exhausted, it posts an error embed to the thread and logs to `#agent-debug` without crashing. |
| **Goals** | Maintain system uptime despite transient failures. Provide visibility into errors without requiring manual log inspection. |
| **Pain points** | Single failures crashing the entire Orchestrator. Silent failures with no notification. No retry mechanism forcing manual re-invocation. |
| **Key needs** | Configurable retry with exponential backoff, error embeds in Discord, debug logging, crash-resistant Orchestrator. |

### US-08: New Agent is Added to the System

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to extend Ptah with a fourth agent (e.g., a Security Agent). They create a new Skill definition, add a log file, and update `ptah.config.json`. |
| **Goals** | Add a new agent to the system with minimal configuration changes and no code modifications to the Orchestrator. |
| **Pain points** | Tightly coupled architectures require code changes to add new agents. Without a standard extension pattern, each addition is ad-hoc. |
| **Key needs** | Configuration-driven agent registration, standardized Skill interface, automatic log file creation. |

---

## 3. Scope Boundaries

### 3.1 In Scope

- CLI commands: `ptah init` (scaffolding) and `ptah start` (Orchestrator)
- Discord-based coordination: threads, embeds, @mentions via Discord MCP
- Four agent Skills: PM Agent, Dev Agent, Frontend Agent, Test Agent — all stateless
- Context Bundle assembly with three-layer model and token budget enforcement
- Three resume patterns (A: agent-to-agent, B: user answer, C: review loop)
- User question routing via `pending.md` with Discord reply writeback
- Git artifact commits with agent attribution and append-only agent logs
- Retry with exponential backoff and graceful failure handling
- Concurrent Skill invocations with per-agent Git worktree isolation
- Configuration-driven agent registration for extensibility

### 3.2 Out of Scope

- Multi-platform messaging (Slack, Teams, etc.) — Discord only in v4.0
- Autonomous production deployments without human approval
- Multi-repo support — one Orchestrator instance per repository
- Web dashboard or GUI — CLI and Discord only
- Progressive summarisation of thread history — the 4-turn cap makes it unnecessary
- Database or external state store — Discord threads and Git provide all state
- Custom model selection per Skill — single default model for all invocations
- `docs/threads/` directory — fully replaced by Discord threads in v4.0

### 3.3 Assumptions

See Section 4.1 for detailed assumptions with impact analysis.

---

## 4. Assumptions and Constraints

### 4.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | A Discord server with the required channels exists before `ptah start` is run | The Orchestrator will fail to connect; `ptah init` does not create the Discord server |
| A-02 | `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` are set as environment variables | The Orchestrator will not start; secrets are never stored in config files |
| A-03 | The repository has Git initialized before `ptah init` is run | Initial commit will fail if Git is not initialized |
| A-04 | Discord thread history is sufficient for coordination state — no database is required | If Discord has outages or rate limits, coordination is blocked |
| A-05 | Four turns (two iterations) are sufficient for any review loop between agents | If agents consistently need more rounds, the escalation-to-user path becomes the norm rather than the exception |
| A-06 | The four existing Claude Skills (PM, Dev, Frontend, Test) serve as the baseline agent definitions | New Skills must conform to the same stateless, Context Bundle-only interface |
| A-07 | `claude-sonnet-4-20250514` is the default model for all Skill invocations | Model availability or pricing changes may require config updates |

### 4.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | Skills must be stateless — no session state between invocations | Architecture (Section 4.2 of PRD) |
| C-02 | Skills must not use Discord MCP — all Discord I/O is owned by the Orchestrator | Architecture (Section 4.2 of PRD); prevents context bloat and cold restart costs |
| C-03 | Discord only — no multi-platform messaging support in v4.0 | Non-goal (Section 3.2 of PRD) |
| C-04 | Two CLI commands only (`ptah init`, `ptah start`) — all other commands deferred | Non-goal (Section 3.2 of PRD) |
| C-05 | No autonomous production deployments without human approval | Non-goal (Section 3.2 of PRD) |
| C-06 | Single-repo support only — one Orchestrator instance per repository | Non-goal (Section 3.2 of PRD) |
| C-07 | No `/docs/threads/` directory — Discord threads fully replace the file-based protocol | v4.0 migration (Section 7 of PRD) |
| C-08 | No Discord message IDs or thread links in any `/docs` file — repo content must be platform-agnostic | NFR: Portability (Section 10 of PRD) |
| C-09 | One Discord server per project — each Ptah Orchestrator instance connects to exactly one Discord server for one repository | OQ-001 resolution |

---

## 5. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| `ptah init` | Time from command to committed doc structure | CLI timer from invocation to commit confirmation | TBD | < 30 seconds |
| Orchestrator response | Time from Discord message to Skill response posted in thread | Timestamp delta between incoming message and posted embed | TBD | < 90 seconds |
| Review loop efficiency | Threads exceeding max-turns guardrail | Count of threads hitting turn limit vs. total threads | TBD | < 5% of threads |
| Skill reliability | Skill invocation failures not recovered by retry | Failed invocations / total invocations | TBD | < 1% of invocations |
| Artifact integrity | Agent artifact changes with no corresponding Git commit | Audit of `/docs` changes vs. Git log | TBD | 0% (zero tolerance) |
| User question flow | User questions answered and pipeline resumed within one Discord reply | Count of single-reply resolutions vs. total questions | TBD | > 80% |
| Auditability | Developer satisfaction with agent decision auditability | Developer survey (1-5 scale) | TBD | > 4.0 / 5.0 |

---

## 6. Functional Requirements

Requirements are grouped by functional domain. Each domain uses a unique prefix for its requirement IDs.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| IN | Init — CLI scaffolding |
| DI | Discord I/O — Orchestrator Discord operations |
| CB | Context Bundle — Assembly and token management |
| RP | Resume Patterns — Context strategies for re-invocation |
| PQ | Pending Questions — User question routing and polling |
| SI | Skill Invocation — Skill execution, commits, and guardrails |

### 6.1 Init (IN)

#### REQ-IN-01: Create /docs Folder Structure

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-01 |
| **Title** | Create /docs folder structure |
| **Description** | `ptah init` shall create the `/docs` folder structure as defined in PRD Section 7: `docs/initial_project/`, `docs/architecture/` (with `decisions/` and `diagrams/` subdirs), `docs/open-questions/`, `docs/agent-logs/`, and `docs/overview.md`. The `/docs/threads/` directory is explicitly excluded. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have a Git repository without Ptah scaffolding WHEN: I run `ptah init` THEN: The `/docs` folder structure is created with all required subdirectories and no `docs/threads/` directory exists |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-02: Seed Markdown Templates

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-02 |
| **Title** | Seed feature folders with blank markdown templates |
| **Description** | `ptah init` shall populate each feature folder (starting with `initial_project/`) with 4 blank markdown templates: `requirements.md`, `specifications.md`, `plans.md`, and `properties.md`. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I inspect `docs/initial_project/` THEN: Four blank template files exist: `requirements.md`, `specifications.md`, `plans.md`, `properties.md` |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

#### REQ-IN-03: Create docs/overview.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-03 |
| **Title** | Create project overview template |
| **Description** | `ptah init` shall create `docs/overview.md` with a blank project overview template that serves as cold-start context for all agent invocations. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I open `docs/overview.md` THEN: A blank project overview template exists with sections for project goals, stakeholders, scope, and technical context |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

#### REQ-IN-04: Create ptah.config.json

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-04 |
| **Title** | Generate configuration file with defaults |
| **Description** | `ptah init` shall create `ptah.config.json` at the repo root with all defaults populated: project name/version, active agents, Skill paths, Discord server settings (requiring user edit), Orchestrator settings (max turns, poll interval, retry attempts), Git commit settings, and docs paths. The config file is committed to the repo (OQ-004 resolved: yes). It contains no secrets — `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` are env-only. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I open `ptah.config.json` THEN: A valid JSON config file exists with all default fields populated as defined in PRD Section 8.1 |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-05: Skip Existing Content

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-05 |
| **Title** | Detect and skip existing files |
| **Description** | `ptah init` shall detect existing `/docs` content and `ptah.config.json`. If files already exist, init shall report them and skip — not overwrite — any files already present. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have an existing `/docs` folder or `ptah.config.json` in my repo WHEN: I run `ptah init` THEN: Existing files are reported as skipped and their contents are preserved unchanged |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | — |

#### REQ-IN-06: Initial Git Commit

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-06 |
| **Title** | Commit scaffolded structure |
| **Description** | `ptah init` shall create an initial Git commit with the message: `[ptah] init: scaffolded docs structure`. If no new files were created (all files already exist and were skipped per [REQ-IN-05]), the commit shall be skipped — no empty commits. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` and new files were created WHEN: I check `git log` THEN: The most recent commit has the message `[ptah] init: scaffolded docs structure` and contains all scaffolded files. If no new files were created (all skipped), no commit is made. |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01], [REQ-IN-02], [REQ-IN-03], [REQ-IN-04] |

#### REQ-IN-07: Scaffold Skills from Existing .claude/skills/

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-07 |
| **Title** | Copy existing Claude Code skills as agent Skill definitions |
| **Description** | `ptah init` shall leverage the existing `.claude/skills/` directory as the source for agent Skill definitions. Instead of creating placeholder files under `ptah/skills/`, init shall copy the existing Claude Code skill markdown files into the scaffolded `ptah/skills/` directory, mapping them to Ptah agent roles: `.claude/skills/product-manager/SKILL.md` → `ptah/skills/pm-agent.md`, `.claude/skills/backend-engineer/SKILL.md` → `ptah/skills/dev-agent.md`, `.claude/skills/frontend-engineer/SKILL.md` → `ptah/skills/frontend-agent.md`, `.claude/skills/test-engineer/SKILL.md` → `ptah/skills/test-agent.md`. Init shall also create an empty `ptah/templates/` directory. These paths are referenced by `ptah.config.json` (`agents.skills` and `docs.templates`). If a source skill file does not exist under `.claude/skills/`, init shall fall back to creating a placeholder file with a header and TODO note for that agent. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have `.claude/skills/product-manager/SKILL.md`, `.claude/skills/backend-engineer/SKILL.md`, `.claude/skills/frontend-engineer/SKILL.md`, and `.claude/skills/test-engineer/SKILL.md` in my repo WHEN: I run `ptah init` THEN: `ptah/skills/pm-agent.md`, `ptah/skills/dev-agent.md`, `ptah/skills/frontend-agent.md`, `ptah/skills/test-agent.md` contain the content copied from their respective `.claude/skills/` sources, `ptah/templates/` exists as an empty directory, and all paths referenced in `ptah.config.json` are valid |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-04] |

#### REQ-IN-08: Pre-create Operational Files

| Field | Detail |
|-------|--------|
| **ID** | REQ-IN-08 |
| **Title** | Pre-create agent log files and open-questions files |
| **Description** | `ptah init` shall pre-create the following operational files with header stubs: (1) `docs/agent-logs/pm-agent.md`, `docs/agent-logs/dev-agent.md`, `docs/agent-logs/frontend-agent.md`, `docs/agent-logs/test-agent.md` — one per active agent, matching agent IDs in `ptah.config.json`. (2) `docs/open-questions/pending.md` and `docs/open-questions/resolved.md` — used by the Orchestrator in Phase 5 for user question routing. File names for agent logs must match the agent IDs in the config. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: I have run `ptah init` WHEN: I inspect `docs/agent-logs/` and `docs/open-questions/` THEN: Four agent log files exist (`pm-agent.md`, `dev-agent.md`, `frontend-agent.md`, `test-agent.md`) and two open-questions files exist (`pending.md`, `resolved.md`), each with a header stub |
| **Priority** | P0 |
| **Phase** | Phase 1 |
| **Source User Stories** | [US-01] |
| **Dependencies** | [REQ-IN-01] |

### 6.2 Discord I/O (DI)

#### REQ-DI-01: Exclusive Discord MCP Ownership

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-01 |
| **Title** | Orchestrator owns all Discord I/O |
| **Description** | The Orchestrator shall use Discord MCP exclusively for all Discord reads and writes. Skills shall make no Discord MCP calls. This is a non-negotiable architectural constraint to prevent context window exhaustion and cold restart costs. |
| **Acceptance Criteria** | WHO: As a system architect GIVEN: A Skill is invoked by the Orchestrator WHEN: The Skill executes THEN: The Skill makes zero Discord MCP calls; all Discord I/O is performed by the Orchestrator before and after Skill invocation |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | — |

#### REQ-DI-02: Listen to Agent-Updates Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-02 |
| **Title** | Watch #agent-updates threads for new messages |
| **Description** | The Orchestrator shall listen for new messages in all threads under the `#agent-updates` channel via Discord MCP gateway. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am connected to the Discord server WHEN: A new message is posted in any thread under `#agent-updates` THEN: I detect the message and begin processing within 5 seconds |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-05] |
| **Dependencies** | [REQ-DI-01] |

#### REQ-DI-03: Read Thread History

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-03 |
| **Title** | Read full thread history before context assembly |
| **Description** | The Orchestrator shall read the full thread history via Discord MCP before assembling each Context Bundle. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A new message triggers Skill invocation WHEN: I assemble the Context Bundle THEN: I have read the complete thread history and can determine turn count, resume pattern, and target agent |
| **Priority** | P0 |
| **Phase** | Phase 2 |
| **Source User Stories** | [US-02], [US-04] |
| **Dependencies** | [REQ-DI-01] |

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

#### REQ-DI-06: Archive Resolved Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-06 |
| **Title** | Archive threads on resolution signal |
| **Description** | The Orchestrator shall archive a Discord thread via Discord MCP when a resolution signal (LGTM, task complete) is detected in a Skill response. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill response contains a resolution signal WHEN: I process the response THEN: The originating thread is archived |
| **Priority** | P1 |
| **Phase** | Phase 7 |
| **Source User Stories** | [US-02] |
| **Dependencies** | [REQ-DI-01], [REQ-SI-05] |

#### REQ-DI-07: Notify User on Questions

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-07 |
| **Title** | @mention user in #open-questions |
| **Description** | The Orchestrator shall @mention the configured user in `#open-questions` via Discord MCP when an agent raises a user-targeted question. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: An agent has raised a question requiring my input WHEN: The Orchestrator processes the question THEN: I receive an @mention notification in `#open-questions` with the question content |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-DI-01], [REQ-PQ-01] |

#### REQ-DI-08: Max-Turns System Message

| Field | Detail |
|-------|--------|
| **ID** | REQ-DI-08 |
| **Title** | Post system message at max-turns limit |
| **Description** | The Orchestrator shall post a system message to the thread and log to `#agent-debug` when the `max_turns_per_thread` limit (default: 10) is reached. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A thread has reached `max_turns_per_thread` messages WHEN: A new message arrives in the thread THEN: I post a system message to the thread, log to `#agent-debug`, and refuse further routing |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-02], [US-07] |
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

### 6.3 Context Bundle (CB)

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

### 6.4 Resume Patterns (RP)

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

#### REQ-RP-02: Pattern B — User Answer Resume

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-02 |
| **Title** | Use Pattern B for user answer resume |
| **Description** | The Orchestrator shall use Pattern B when a user has answered a question in `pending.md`. The Context Bundle contains: pause summary, user answer verbatim, and feature docs read fresh from repo (critical: re-read even if unchanged, as other agents may have modified them while paused). |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user has written an answer in `pending.md` WHEN: I re-invoke the originating Skill THEN: The Context Bundle contains Layer 1, Layer 2 docs re-read fresh (mandatory), and Layer 3 with pause summary + user answer verbatim |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03], [US-04] |
| **Dependencies** | [REQ-CB-01], [REQ-PQ-02] |

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

#### REQ-RP-05: Block Fifth Turn in Review Threads

| Field | Detail |
|-------|--------|
| **ID** | REQ-RP-05 |
| **Title** | Refuse to route a fifth turn in any review thread |
| **Description** | The Orchestrator shall refuse to route a fifth turn in any review thread. It shall mark the thread stalled, post a system message, and log to `#agent-debug`. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A review thread already has 4 turns WHEN: An additional message arrives THEN: I refuse to route it, post a system message indicating the thread is stalled, and log the event to `#agent-debug` |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-02], [US-07] |
| **Dependencies** | [REQ-RP-03] |

### 6.5 Pending Questions (PQ)

#### REQ-PQ-01: Write to pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-01 |
| **Title** | Write agent-to-user questions to pending.md |
| **Description** | The Orchestrator shall append user-targeted questions to `open-questions/pending.md` when a Skill response contains a question routing signal targeting the user. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill response contains a user-targeted question WHEN: I process the response THEN: The question is appended to `open-questions/pending.md` with agent attribution and timestamp |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-SI-05] |

#### REQ-PQ-02: Poll pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-02 |
| **Title** | Poll pending.md at configured interval |
| **Description** | The Orchestrator shall poll `open-questions/pending.md` at the configured interval (default: 30 seconds) to detect when a user has written an answer to a pending question. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I am running and `pending.md` contains unanswered questions WHEN: The poll interval elapses THEN: I check `pending.md` for new user answers |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-01] |

#### REQ-PQ-03: Resume on User Answer

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-03 |
| **Title** | Invoke originating Skill with Pattern B on user answer |
| **Description** | When a user answer is detected in `pending.md`, the Orchestrator shall invoke the originating Skill using Pattern B with the user's answer as the immediate trigger, and post the resumed response to the original Discord thread. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user has written an answer to a pending question WHEN: I detect the answer during polling THEN: I invoke the originating Skill with Pattern B, post the response to the paused thread, and the pipeline resumes |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-02], [REQ-RP-02] |

#### REQ-PQ-04: Archive to resolved.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-04 |
| **Title** | Move answered questions to resolved.md |
| **Description** | After processing a user answer, the Orchestrator shall move the answered entry from `pending.md` to `resolved.md` and commit both file changes. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A user question has been answered and the pipeline has resumed WHEN: Processing is complete THEN: The question/answer pair is removed from `pending.md`, appended to `resolved.md`, and both changes are committed to Git |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-PQ-03] |

#### REQ-PQ-05: Discord Reply Writeback to pending.md

| Field | Detail |
|-------|--------|
| **ID** | REQ-PQ-05 |
| **Title** | Write Discord #open-questions replies to pending.md automatically |
| **Description** | The Orchestrator shall listen for user replies in the `#open-questions` channel. When a user replies to an agent question in Discord, the Orchestrator shall write the user's answer to `pending.md` automatically, triggering the normal Pattern B resume flow. The user never needs to edit `pending.md` directly. (OQ-003 resolved: Option B — Discord reply writes to pending.md.) |
| **Acceptance Criteria** | WHO: As a developer GIVEN: An agent question is posted in `#open-questions` with my @mention WHEN: I reply to the question in Discord THEN: The Orchestrator writes my answer to `pending.md` automatically, and the normal polling/resume flow ([REQ-PQ-02], [REQ-PQ-03]) processes it |
| **Priority** | P0 |
| **Phase** | Phase 5 |
| **Source User Stories** | [US-03] |
| **Dependencies** | [REQ-DI-01], [REQ-PQ-01], [REQ-PQ-02] |

### 6.6 Skill Invocation (SI)

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

#### REQ-SI-05: Commit Artifact Changes

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-05 |
| **Title** | Commit /docs changes with agent attribution |
| **Description** | The Orchestrator shall commit any `/docs` file changes produced by a Skill with the format: `[ptah] {Agent}: {description}`. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill has updated a `/docs` artifact file WHEN: I process the Skill output THEN: I commit the changes with a message following the `[ptah] {Agent}: {description}` format |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-02] |

#### REQ-SI-06: Append Agent Logs

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-06 |
| **Title** | Write timestamped agent log entries |
| **Description** | The Orchestrator shall append a timestamped entry to `agent-logs/{agent}.md` after every Skill invocation. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has completed WHEN: I finalize the invocation THEN: A timestamped log entry is appended to the appropriate `agent-logs/{agent}.md` file |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-07: Retry with Exponential Backoff

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-07 |
| **Title** | Retry failed Skill invocations |
| **Description** | The Orchestrator shall retry failed Skill invocations up to `retry_attempts` times (default: 3) with exponential backoff. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has failed WHEN: I handle the failure THEN: I retry up to the configured number of attempts with exponential backoff between attempts |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-07] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-08: Graceful Failure Handling

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-08 |
| **Title** | Handle unrecoverable failures without crashing |
| **Description** | Unrecoverable Skill failures (after retry exhaustion) shall post an error embed to the thread and log to `#agent-debug`. They shall not crash the Orchestrator. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has failed and all retries are exhausted WHEN: I handle the unrecoverable failure THEN: I post an error embed to the thread, log to `#agent-debug`, and continue running for other threads |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-07] |
| **Dependencies** | [REQ-SI-07] |

#### REQ-SI-09: Idempotent Message Processing

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-09 |
| **Title** | Do not re-process already-handled messages |
| **Description** | The Orchestrator shall not re-invoke a Skill for a Discord message it has already processed, tracked by message ID. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I have already processed a Discord message WHEN: I encounter the same message ID again THEN: I skip processing and do not invoke a Skill |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06], [US-07] |
| **Dependencies** | [REQ-DI-02] |

#### REQ-SI-10: Graceful Shutdown

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-10 |
| **Title** | Wait for in-flight invocations on shutdown |
| **Description** | On SIGINT/SIGTERM, the Orchestrator shall wait for any in-flight Skill invocation to complete before exiting. |
| **Acceptance Criteria** | WHO: As a developer GIVEN: The Orchestrator is processing a Skill invocation WHEN: I send SIGINT or SIGTERM THEN: The Orchestrator waits for the in-flight invocation to complete, commits any pending changes, and then exits cleanly |
| **Priority** | P0 |
| **Phase** | Phase 6 |
| **Source User Stories** | [US-05], [US-07] |
| **Dependencies** | — |

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

#### REQ-SI-13: Worktree Merge and Cleanup

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-13 |
| **Title** | Merge worktree changes back to main branch and clean up |
| **Description** | After a Skill invocation completes in a worktree, the Orchestrator shall merge the worktree's changes back to the main branch. If the merge succeeds, the worktree is removed. If a merge conflict occurs, the Orchestrator shall post an error embed to the thread, log the conflict to `#agent-debug`, and retain the worktree for manual resolution. Merges are serialized (one at a time) to prevent race conditions. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has completed in a worktree and produced artifact changes WHEN: I merge the changes back THEN: Changes are committed on the worktree branch and merged to main; on success the worktree is removed; on conflict an error embed is posted and the worktree is retained for manual resolution |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-05], [REQ-SI-12] |

---

## 7. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Response latency | Each Skill invocation and Discord post shall complete within 90 seconds | End-to-end time from message detection to response post < 90s | P0 | Phase 3 |
| REQ-NF-02 | Reliability | Failed Skill invocations retry up to 3 times; failures do not crash the Orchestrator | Orchestrator continues running after any individual Skill failure | P0 | Phase 6 |
| REQ-NF-03 | Idempotency | The Orchestrator shall not re-invoke a Skill for a Discord message it has already processed (tracked by message ID) | Duplicate message IDs produce zero additional Skill invocations | P0 | Phase 4 |
| REQ-NF-04 | Token efficiency | Each Skill invocation loads only the relevant feature folder docs — never the entire /docs tree | Context Bundle Layer 2 contains only current-feature files | P0 | Phase 3 |
| REQ-NF-05 | Auditability | Every artifact change produces a Git commit; agent-logs record every Skill invocation | Zero artifact changes without a corresponding commit; agent-logs contain entry for every invocation | P0 | Phase 4 |
| REQ-NF-06 | Security | `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` are loaded from environment only — never in config files or /docs | No secrets appear in `ptah.config.json`, any `/docs` file, or Git history | P0 | Phase 1 |
| REQ-NF-07 | Portability | /docs content is platform-agnostic — no Discord message IDs or thread links in repo files | Grep of `/docs` for Discord-specific identifiers returns zero matches | P0 | Phase 3 |
| REQ-NF-08 | Extensibility | Adding a new agent requires only: a new Skill definition, a new `agent-logs/*.md` file, and a config entry | A fourth agent can be added with zero code changes to the Orchestrator | P1 | Phase 7 |

---

## 8. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Discord API rate limiting under heavy agent activity | Med | High | Implement rate-limit-aware queuing in the Orchestrator; backoff on 429 responses | [REQ-DI-01], [REQ-SI-07] |
| R-02 | Context window exhaustion for complex features with large artifact files | Med | High | Token budget enforcement with truncation and task splitting | [REQ-CB-05], [REQ-CB-06] |
| R-03 | Two-iteration review limit is insufficient for complex requirements | Med | Med | Escalation to user when agents cannot agree; monitor escalation rate | [REQ-RP-04], [REQ-RP-05] |
| R-04 | Discord outage blocks all agent coordination | Low | High | Agent-produced artifacts are in Git; work can be manually resumed when Discord recovers | [REQ-DI-02], [REQ-PQ-02] |
| R-05 | `pending.md` polling misses user answers due to file format inconsistency | Med | Med | Define strict answer format in `pending.md`; validate on write and read | [REQ-PQ-02], [REQ-PQ-03] |
| R-06 | Concurrent Orchestrator instances processing the same messages | Low | High | Lock file or process mutex on startup; message-ID deduplication | [REQ-SI-09] |
| R-07 | Skill output exceeds expected format, breaking routing signal parsing | Med | Med | Validate routing signals with strict schema; fall back to error embed on parse failure | [REQ-SI-04], [REQ-SI-08] |
| R-08 | Merge conflicts when concurrent worktrees modify overlapping `/docs` files | Med | Med | Agents typically work on different feature folders; serialize merges; retain conflicted worktrees for manual resolution | [REQ-SI-12], [REQ-SI-13] |

---

## 9. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 51 | REQ-IN-01 through REQ-IN-08, REQ-DI-01 through REQ-DI-05, REQ-DI-07, REQ-DI-08, REQ-DI-09, REQ-CB-01 through REQ-CB-05, REQ-RP-01 through REQ-RP-05, REQ-PQ-01 through REQ-PQ-05, REQ-SI-01 through REQ-SI-13, REQ-NF-01 through REQ-NF-07 |
| P1 | 3 | REQ-DI-06, REQ-CB-06, REQ-NF-08 |
| P2 | 0 | — |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 — Init | 9 | REQ-IN-01, REQ-IN-02, REQ-IN-03, REQ-IN-04, REQ-IN-05, REQ-IN-06, REQ-IN-07, REQ-IN-08, REQ-NF-06 |
| Phase 2 — Discord Bot | 3 | REQ-DI-01, REQ-DI-02, REQ-DI-03 |
| Phase 3 — Skill Routing | 21 | REQ-DI-04, REQ-DI-05, REQ-DI-09, REQ-CB-01, REQ-CB-02, REQ-CB-03, REQ-CB-04, REQ-CB-05, REQ-CB-06, REQ-RP-01, REQ-RP-03, REQ-RP-04, REQ-SI-01, REQ-SI-02, REQ-SI-03, REQ-SI-04, REQ-SI-11, REQ-SI-12, REQ-NF-01, REQ-NF-04, REQ-NF-07 |
| Phase 4 — Artifact Commits | 6 | REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05 |
| Phase 5 — User Questions | 7 | REQ-DI-07, REQ-PQ-01, REQ-PQ-02, REQ-PQ-03, REQ-PQ-04, REQ-PQ-05, REQ-RP-02 |
| Phase 6 — Guardrails | 6 | REQ-DI-08, REQ-RP-05, REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02 |
| Phase 7 — Polish | 2 | REQ-DI-06, REQ-NF-08 |

---

## 10. Open Questions (from PRD)

All open questions have been resolved. Decisions are recorded below and reflected in the requirements.

| ID | Question | Decision | Status | New/Updated Requirements |
|----|----------|----------|--------|--------------------------|
| OQ-001 | Should the Orchestrator support one Discord server per project or one server with channels per project? | **One Discord server per project.** Clean isolation per project; simplifies permissions and routing. | Resolved | [C-09] added |
| OQ-002 | How should the Orchestrator identify which agent to invoke when there is no @mention in a thread message — by thread ownership or last-sender logic? | **Routing signal (Option C).** Every Skill response must include a structured routing signal ([REQ-SI-04]). The Orchestrator uses this as the sole mechanism for determining the next agent. No fallback to thread ownership or last-sender logic. | Resolved | [REQ-DI-09] added, [REQ-SI-04] updated |
| OQ-003 | Should the user's Discord reply in #open-questions also be written back to pending.md automatically, or does pending.md remain the canonical record? | **Discord reply writes to pending.md (Option B).** The Orchestrator listens for user replies in `#open-questions` and writes the answer to `pending.md` automatically. Better UX — user never has to edit a file. | Resolved | [REQ-PQ-05] added |
| OQ-004 | Should ptah.config.json be committed to the repo? | **Yes, commit it.** The config contains no secrets (bot token is env-only). Committing ensures reproducible setup for any team member who clones the repo. | Resolved | [REQ-IN-04] confirmed, [REQ-IN-06] confirmed |
| OQ-005 | Should the Orchestrator support concurrent Skill invocations for independent threads, or strictly sequential? | **Concurrent, with per-agent worktrees.** Each agent gets its own local copy (Git worktree) of the repository so they can edit `/docs` files in parallel without conflicts. The Orchestrator merges worktree changes back to the main branch after each Skill invocation completes. | Resolved | [REQ-SI-11], [REQ-SI-12], [REQ-SI-13] added; [R-08] added |

---

## 11. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 8, 2026 | Product Manager | Initial requirements document derived from PTAH_PRD v4.0 |
| 1.1 | March 8, 2026 | Product Manager | Resolved all 5 open questions (OQ-001 through OQ-005). Added REQ-DI-09, REQ-PQ-05, REQ-SI-11, REQ-SI-12, REQ-SI-13. Added constraint C-09. Added risk R-08. Updated REQ-SI-04 and REQ-IN-04 with OQ decision details. |
| 1.2 | March 8, 2026 | Product Manager | Added Section 3 (Scope Boundaries) with explicit In Scope, Out of Scope, and Assumptions. Fixed P0 count from 38 to 49. Fixed Phase 3 count from 20 to 21. Renumbered sections 3-10 to 4-11 to accommodate new scope section. |
| 1.3 | March 8, 2026 | Product Manager | Added REQ-IN-07 (scaffold ptah/ runtime directory with placeholder Skills) and REQ-IN-08 (pre-create agent log files and open-questions files). Updated REQ-IN-06 to clarify no-op commit behavior when all files are skipped. P0 count updated from 49 to 51. Phase 1 count updated from 7 to 9. |
| 1.4 | March 9, 2026 | Product Manager | Updated REQ-IN-07: `ptah init` now copies existing `.claude/skills/` Claude Code skill files as the scaffolded agent Skill definitions instead of creating placeholder files. Mapping: `product-manager` → `pm-agent`, `backend-engineer` → `dev-agent`, `frontend-engineer` → `frontend-agent`, `test-engineer` → `test-agent`. Falls back to placeholder if source skill not found. Added Frontend Agent as fourth active agent — updated Purpose (Section 1), Scope (Section 3.1), Assumption A-06, REQ-IN-07, and REQ-IN-08. |

---

*End of Document*
