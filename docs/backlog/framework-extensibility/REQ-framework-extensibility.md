# Requirements Document

## Framework Extensibility & Distribution

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-017 |
| **Parent Document** | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 1.0 |
| **Date** | April 1, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Transform Ptah from a monolithic CLI into a reusable framework: a core library with programmatic API, a plugin system for custom agent types and workflow hooks, and interoperability via MCP (tool integration) and A2A (agent-to-agent communication) protocols.

Today, Ptah has three extensibility limitations:

1. **No library exports.** `@ohenak/ptah` is a CLI binary only. Embedding Ptah into another application requires spawning a subprocess — fragile and limiting. There is no programmatic API for creating workflows, sending signals, or handling events.

2. **No lifecycle hooks.** After features 015 (config-driven phases) and messaging-abstraction, adding new agents and phases is config-driven. But there is no mechanism for running custom logic at phase boundaries — e.g., "after implementation review is approved, run a deployment pipeline" or "before each review, lint the documents."

3. **Claude Code only.** The `SkillClient` only supports Claude Code invocations. Using a Python-based LangGraph agent, a shell script for linting, or an agent on another framework requires writing a Claude Code skill wrapper — inelegant and token-wasteful. The industry is converging on MCP for tool integration (97M+ monthly SDK downloads) and A2A for agent-to-agent communication (50+ partners in the Linux Foundation project).

**Depends on:** Feature 015 (Temporal Foundation), Feature 016 (Messaging Abstraction).

---

## 2. User Scenarios

### US-33: Developer Extends Ptah with Custom Agent Types and Hooks

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to add a Security Agent that runs SAST scans after implementation. They create a skill definition, register it in config, assign it to a post-implementation phase, and define a lifecycle hook that uploads scan results to their security dashboard. All without modifying Ptah's source code. |
| **Goals** | Extend Ptah with arbitrary agent types and custom logic at phase boundaries without forking. |
| **Pain points** | Even after features 015/016, there is no mechanism for running custom logic at phase transitions — "after implementation review is approved, run a deployment pipeline" or "before each review, lint the documents." |
| **Key needs** | Lifecycle hooks (on-phase-enter, on-phase-exit, on-agent-complete, on-workflow-complete). Hook handlers as shell commands, TypeScript functions, or HTTP endpoints. |

### US-34: Developer Uses Ptah as a Library

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer is building a custom CI/CD pipeline that includes Ptah-style agent orchestration as one step. They import `@ohenak/ptah-core` and programmatically create a workflow, register agents, start the orchestrator, and listen for events — all within their own Node.js process. |
| **Goals** | Use Ptah's orchestration engine without the CLI wrapper. Programmatic control over workflow creation, signal sending, and event handling. |
| **Pain points** | Current Ptah is a black-box CLI. Embedding it into another system requires spawning a subprocess and parsing stdout — fragile and limiting. |
| **Key needs** | Exported API: `createOrchestrator(config)`, `startWorkflow(slug, config)`, `sendSignal(workflowId, signal)`, `onEvent(handler)`. TypeScript types for all public interfaces. |

### US-35: Ptah Agents Interoperate via Standard Protocols

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer has existing agents built on LangGraph (Python) and wants them to participate in Ptah workflows alongside Claude Code agents. They configure Ptah to communicate with external agents via A2A and expose Ptah's tools via MCP servers. |
| **Goals** | Mixed-framework orchestration. MCP for tools, A2A for agent communication. |
| **Pain points** | Current Ptah only supports Claude Code as the agent runtime. Teams with existing LangGraph, CrewAI, or custom agents cannot integrate them without rewriting as Claude Code skills. |
| **Key needs** | MCP client for tool discovery. A2A server/client for cross-framework agents. Skill adapter interface wrapping non-Claude agents. |

### US-36: Developer Runs Non-Claude Skills

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use a Python-based LangGraph agent for code review and a simple shell script for linting as "agents" in their Ptah workflow. They configure these as skills with `type: "executable"` or `type: "a2a"`. |
| **Goals** | Any executable or network-reachable agent can participate in a Ptah workflow. |
| **Pain points** | Current `SkillClient` only supports Claude Code. Using any other agent runtime requires a Claude Code wrapper that shells out — inelegant and token-wasteful. |
| **Key needs** | Skill adapter interface with multiple implementations: `claude-code`, `executable` (stdin/stdout), `a2a` (network). Common output contract (routing signal). |

---

## 3. Scope Boundaries

### 3.1 In Scope

- Library/CLI package separation (`@ohenak/ptah-core` + `@ohenak/ptah-cli`)
- Programmatic API for orchestrator control
- Lifecycle hooks (shell, TypeScript, HTTP)
- Skill adapter interface (claude-code, executable, a2a)
- MCP client for tool integration
- A2A protocol support (outbound and inbound)
- Workflow templates and presets

### 3.2 Out of Scope

- Ptah web dashboard or visual workflow editor
- Multi-tenant Ptah (multiple teams sharing one Temporal cluster with isolation)
- Marketplace or registry for shared templates (use npm directly)
- Custom Claude model selection per agent (deferred)
- Agent-to-agent direct communication within a single workflow (agents communicate via the orchestrator)

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-15 | The A2A protocol spec (v1.x, Google/Linux Foundation) is stable enough for production use | May need to implement a subset or use a compatibility shim |
| A-16 | MCP protocol adoption continues; the ecosystem of MCP servers grows | MCP integration value depends on available tool servers; mitigated by Claude Code's native MCP support |
| A-17 | npm package separation (`ptah-core` + `ptah-cli`) is manageable as a monorepo with workspaces | Alternative: single package with multiple entry points |

---

## 4. Requirements

### Domain: FX — Framework Extensibility

#### REQ-FX-01: Library Package Separation

| Attribute | Detail |
|-----------|--------|
| **Description** | Restructure Ptah into two packages: `@ohenak/ptah-core` (orchestration engine, config loader, workflow types, provider interfaces) and `@ohenak/ptah-cli` (CLI wrapper that imports core). The core package exports a programmatic API. The CLI is a thin wrapper that parses arguments and calls core functions. |
| **Acceptance Criteria** | **Who:** Developer **Given:** `npm install @ohenak/ptah-core` **When:** They import and call `createOrchestrator(config)` **Then:** An orchestrator instance is created. No CLI process is spawned. All types are exported for TypeScript consumers. |
| **Priority** | P0 |
| **Source Stories** | US-34 |
| **Dependencies** | None |

#### REQ-FX-02: Programmatic API

| Attribute | Detail |
|-----------|--------|
| **Description** | `@ohenak/ptah-core` exports: `createOrchestrator(config): Orchestrator`, `Orchestrator.startWorkflow(slug, featureConfig): WorkflowHandle`, `Orchestrator.sendSignal(workflowId, signal): void`, `Orchestrator.queryWorkflow(workflowId, query): unknown`, `Orchestrator.onEvent(handler): void`, `Orchestrator.shutdown(): void`. All types are exported. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A Node.js script importing `@ohenak/ptah-core` **When:** They create an orchestrator, start a workflow, send a signal, and query state **Then:** All operations work programmatically. Events are delivered to registered handlers. |
| **Priority** | P0 |
| **Source Stories** | US-34 |
| **Dependencies** | REQ-FX-01 |

#### REQ-FX-03: Lifecycle Hooks

| Attribute | Detail |
|-----------|--------|
| **Description** | Workflow configuration supports lifecycle hooks at: `on_phase_enter`, `on_phase_exit`, `on_agent_complete`, `on_review_complete`, `on_workflow_complete`, `on_workflow_fail`. Each hook is a shell command (executed in repo directory), TypeScript function path (imported and called), or HTTP endpoint (POST with event JSON). Hooks are non-blocking by default; `blocking: true` pauses the workflow until hook completes. Hook timeout is configurable (default 5 minutes). |
| **Acceptance Criteria** | **Who:** Developer **Given:** A workflow config with `on_workflow_complete: { command: "make deploy", blocking: true }` **When:** The workflow completes successfully **Then:** `make deploy` is executed in the repo directory. The workflow waits for completion before reporting final status. If the hook exceeds the timeout, it is killed and the workflow continues with a warning. |
| **Priority** | P0 |
| **Source Stories** | US-33 |
| **Dependencies** | REQ-CD-01 (from feature 015) |

#### REQ-FX-04: Skill Adapter Interface

| Attribute | Detail |
|-----------|--------|
| **Description** | The `SkillClient` is generalized into a `SkillAdapter` interface with multiple implementations: `claude-code` (existing Claude Agent SDK), `executable` (invokes a shell command, passes context via stdin/env, reads routing signal from stdout), `a2a` (communicates with an external agent via A2A protocol). Each agent in config specifies its adapter type via a `type` field. |
| **Acceptance Criteria** | **Who:** Developer **Given:** An agent configured with `type: "executable"` and `command: "python review_agent.py"` **When:** The workflow dispatches this agent **Then:** The Orchestrator invokes `python review_agent.py`, passes context via stdin (JSON), reads routing signal from stdout. The agent participates like any Claude Code agent. |
| **Priority** | P0 |
| **Source Stories** | US-36 |
| **Dependencies** | REQ-FX-01 |

#### REQ-FX-05: MCP Tool Integration

| Attribute | Detail |
|-----------|--------|
| **Description** | Ptah agents can discover and invoke tools from external MCP servers. Config supports an `mcp_servers` list. When assembling context, the Orchestrator includes available MCP tools in the agent's allowed tools list. Claude Code agents call these natively; executable agents receive the tool list in context. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A config with `mcp_servers: [{ name: "github", url: "stdio://gh-mcp-server" }]` **When:** An agent is invoked **Then:** The agent can discover and call tools from the GitHub MCP server (e.g., `create_pull_request`, `list_issues`). |
| **Priority** | P1 |
| **Source Stories** | US-35 |
| **Dependencies** | REQ-FX-04 |

#### REQ-FX-06: A2A Protocol Support

| Attribute | Detail |
|-----------|--------|
| **Description** | Outbound: agents with `type: "a2a"` are dispatched via A2A client calls to the configured endpoint. Inbound: Ptah exposes an A2A server endpoint that external orchestrators can call to invoke Ptah-managed agents. |
| **Acceptance Criteria** | **Who:** Developer **Given:** An agent configured with `type: "a2a"` and `endpoint: "http://langgraph-agent:8080/a2a"` **When:** The workflow dispatches this agent **Then:** The Orchestrator sends a task via A2A. The external agent processes it and returns a result. The routing signal is extracted and the workflow continues. |
| **Priority** | P2 |
| **Source Stories** | US-35 |
| **Dependencies** | REQ-FX-04 |

#### REQ-FX-07: Workflow Templates and Presets

| Attribute | Detail |
|-----------|--------|
| **Description** | Ptah supports importing workflow configs from npm packages or local files. `ptah init --template @ohenak/ptah-template-fullstack` scaffolds a project with pre-configured workflow, agents, and skills. Teams can publish their own templates. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A published package `@myteam/ptah-template-microservices` **When:** They run `ptah init --template @myteam/ptah-template-microservices` **Then:** The project is scaffolded with the template's workflow, agents, and skills. |
| **Priority** | P2 |
| **Source Stories** | US-33, US-34 |
| **Dependencies** | REQ-FX-01, REQ-CD-01 (from feature 015) |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-16 | A2A protocol is still early; implementations across frameworks may have interoperability issues | Med | Med | Start with claude-code + executable adapters; A2A is P2 and can be deferred |
| R-17 | Library packaging introduces semver/backward-compatibility burden | Med | Med | Strict public API surface; TypeScript declaration files as contract; deprecation warnings |
| R-18 | Executable skill adapter is hard to debug (stdin/stdout, no interactive tools) | Med | Low | Verbose logging mode; clear JSON contract; example adapters for Python, Go |
| R-19 | Lifecycle hooks with `blocking: true` can stall workflows indefinitely | Low | Med | Configurable hook timeout (default 5 minutes); hook failure does not block workflow by default |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 4 | REQ-FX-01, REQ-FX-02, REQ-FX-03, REQ-FX-04 |
| P1 | 1 | REQ-FX-05 |
| P2 | 2 | REQ-FX-06, REQ-FX-07 |

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| FX — Framework Extensibility | 7 | REQ-FX-01 through REQ-FX-07 |

**Total: 7 requirements (4 P0, 1 P1, 2 P2)**

---

## 7. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 1, 2026 | Product Manager | Initial requirements document. 7 requirements in FX domain. |

---

*End of Document*
