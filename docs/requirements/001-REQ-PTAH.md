# Requirements Document

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH |
| **Parent Document** | [PTAH_PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 2.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This is the **master requirements document** for Ptah v4.0 — a deployable framework that installs into any Git repository and coordinates four specialized Claude agents (PM Agent, Dev Agent, Frontend Agent, Test Agent) to collaboratively build software engineering projects.

Ptah v4.0 replaces the file-based thread protocol from v3.0 with Discord threads as the coordination layer. The repository reverts to its natural role as a versioned artifact store. The Orchestrator is the Discord bot itself — one process, one deployment, started via `ptah start`.

**Core principle:** Discord threads provide state, turn attribution, append-only history, and human participation for free. The repo provides durability, version control, and auditability of outputs. Each layer does what it is best at.

**Document structure:** This master document contains shared context (user stories, scope, assumptions, constraints, success metrics, risks, and open questions). Detailed requirements are split into per-phase documents linked in [Section 6](#6-phase-documents).

---

## 2. User Stories

Each user story describes a real-world situation that the product must support. Requirements in the phase documents trace back to these user stories.

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

## 6. Phase Documents

Detailed requirements for each phase are in their own documents. Each phase document contains the full requirement definitions, relevant NFRs, and phase-specific risks.

| Phase | Document | Requirements | Status |
|-------|----------|-------------|--------|
| **Phase 1 — Init** | [001-REQ-PTAH-init](001-REQ-PTAH-init.md) | 9 (REQ-IN-01..08, REQ-NF-06) | All specified ([TSPEC-ptah-init](../specifications/001-TSPEC-ptah-init.md)) |
| **Phase 2 — Discord Bot** | [002-REQ-PTAH-discord-bot](002-REQ-PTAH-discord-bot.md) | 3 (REQ-DI-01..03) | All specified ([TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md)) |
| **Phase 3 — Skill Routing** | [003-REQ-PTAH-skill-routing](003-REQ-PTAH-skill-routing.md) | 21 (DI, CB, RP, SI, NF domains) | All FSPEC'd ([FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md)); TSPECs pending |
| **Phase 4 — Artifact Commits** | [004-REQ-PTAH-artifact-commits](004-REQ-PTAH-artifact-commits.md) | 6 (SI, NF domains) | All FSPEC'd ([FSPEC-ptah-artifact-commits](../specifications/004-FSPEC-ptah-artifact-commits.md)); TSPECs pending |
| **Phase 5 — User Questions** | [005-REQ-PTAH-user-questions](005-REQ-PTAH-user-questions.md) | 7 (DI, RP, PQ domains) | Pending specification |
| **Phase 6 — Guardrails** | [006-REQ-PTAH-guardrails](006-REQ-PTAH-guardrails.md) | 6 (DI, RP, SI, NF domains) | Pending specification |
| **Phase 7 — Polish** | [007-REQ-PTAH-polish](007-REQ-PTAH-polish.md) | 2 (DI, NF domains) | Pending specification |

**Total:** 54 requirements across 7 phases.

### Domain Key

| Domain Code | Domain Name |
|-------------|-------------|
| IN | Init — CLI scaffolding |
| DI | Discord I/O — Orchestrator Discord operations |
| CB | Context Bundle — Assembly and token management |
| RP | Resume Patterns — Context strategies for re-invocation |
| PQ | Pending Questions — User question routing and polling |
| SI | Skill Invocation — Skill execution, commits, and guardrails |
| NF | Non-Functional |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements | Phase |
|----|------|-----------|--------|------------|---------------------|-------|
| R-01 | Discord API rate limiting under heavy agent activity | Med | High | Implement rate-limit-aware queuing in the Orchestrator; backoff on 429 responses | [REQ-DI-01], [REQ-SI-07] | 2, 3, 6 |
| R-02 | Context window exhaustion for complex features with large artifact files | Med | High | Token budget enforcement with truncation and task splitting | [REQ-CB-05], [REQ-CB-06] | 3 |
| R-03 | Two-iteration review limit is insufficient for complex requirements | Med | Med | Escalation to user when agents cannot agree; monitor escalation rate | [REQ-RP-04], [REQ-RP-05] | 3, 6 |
| R-04 | Discord outage blocks all agent coordination | Low | High | Agent-produced artifacts are in Git; work can be manually resumed when Discord recovers | [REQ-DI-02], [REQ-PQ-02] | 2, 5 |
| R-05 | `pending.md` polling misses user answers due to file format inconsistency | Med | Med | Define strict answer format in `pending.md`; validate on write and read | [REQ-PQ-02], [REQ-PQ-03] | 5 |
| R-06 | Concurrent Orchestrator instances processing the same messages | Low | High | Lock file or process mutex on startup; message-ID deduplication | [REQ-SI-09] | 4 |
| R-07 | Skill output exceeds expected format, breaking routing signal parsing | Med | Med | Validate routing signals with strict schema; fall back to error embed on parse failure | [REQ-SI-04], [REQ-SI-08] | 3, 6 |
| R-08 | Merge conflicts when concurrent worktrees modify overlapping `/docs` files | Med | Med | Agents typically work on different feature folders; serialize merges; retain conflicted worktrees for manual resolution | [REQ-SI-12], [REQ-SI-13] | 3, 4 |

---

## 8. Requirements Summary

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

## 9. Open Questions (from PRD)

All open questions have been resolved. Decisions are recorded below and reflected in the requirements.

| ID | Question | Decision | Status | New/Updated Requirements |
|----|----------|----------|--------|--------------------------|
| OQ-001 | Should the Orchestrator support one Discord server per project or one server with channels per project? | **One Discord server per project.** Clean isolation per project; simplifies permissions and routing. | Resolved | [C-09] added |
| OQ-002 | How should the Orchestrator identify which agent to invoke when there is no @mention in a thread message — by thread ownership or last-sender logic? | **Routing signal (Option C).** Every Skill response must include a structured routing signal ([REQ-SI-04]). The Orchestrator uses this as the sole mechanism for determining the next agent. No fallback to thread ownership or last-sender logic. | Resolved | [REQ-DI-09] added, [REQ-SI-04] updated |
| OQ-003 | Should the user's Discord reply in #open-questions also be written back to pending.md automatically, or does pending.md remain the canonical record? | **Discord reply writes to pending.md (Option B).** The Orchestrator listens for user replies in `#open-questions` and writes the answer to `pending.md` automatically. Better UX — user never has to edit a file. | Resolved | [REQ-PQ-05] added |
| OQ-004 | Should ptah.config.json be committed to the repo? | **Yes, commit it.** The config contains no secrets (bot token is env-only). Committing ensures reproducible setup for any team member who clones the repo. | Resolved | [REQ-IN-04] confirmed, [REQ-IN-06] confirmed |
| OQ-005 | Should the Orchestrator support concurrent Skill invocations for independent threads, or strictly sequential? | **Concurrent, with per-agent worktrees.** Each agent gets its own local copy (Git worktree) of the repository so they can edit `/docs` files in parallel without conflicts. The Orchestrator merges worktree changes back to the main branch after each Skill invocation completes. | Resolved | [REQ-SI-11], [REQ-SI-12], [REQ-SI-13] added; [R-08] added |

---

## 10. Approval

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
| 2.0 | March 10, 2026 | Product Manager | **Split into per-phase documents.** Master document now serves as index with shared context (user stories, scope, assumptions, constraints, success metrics, risks, open questions). Detailed requirements moved to 7 phase documents: 001-REQ-PTAH-init, 002-REQ-PTAH-discord-bot, 003-REQ-PTAH-skill-routing, 004-REQ-PTAH-artifact-commits, 005-REQ-PTAH-user-questions, 006-REQ-PTAH-guardrails, 007-REQ-PTAH-polish. |

---

*End of Document*
