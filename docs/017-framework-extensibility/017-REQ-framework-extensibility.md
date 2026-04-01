# Requirements Document

## Milestone 3 — Framework Extensibility & Distribution

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-FRAMEWORK |
| **Parent Document** | [REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | April 1, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Milestone** | 3 of 3 |
| **Depends On** | Milestone 1 (Temporal Foundation), Milestone 2 (Messaging Abstraction) |

---

## 1. Purpose

Transform Ptah from a monolithic CLI into a reusable framework: a core library with programmatic API, a plugin system for custom agent types and workflow hooks, and interoperability via MCP (tool integration) and A2A (agent-to-agent communication) protocols.

**Why this is Milestone 3:** Milestones 1 and 2 make Ptah internally flexible (configurable workflows, pluggable messaging). This milestone makes Ptah externally extensible — other teams and projects can adopt it without forking, embed it into their own tooling, and have their agents participate in a broader ecosystem.

**What changes:**

| Current State | Target State |
|---------------|-------------|
| `@ohenak/ptah` is a CLI binary only — no library exports | `@ohenak/ptah-core` library + `@ohenak/ptah-cli` binary |
| Adding a new agent type requires editing config only (after M1) | Adding a new agent type also supports lifecycle hooks (on-start, on-complete, on-fail) |
| Agents communicate only via routing signals | Agents can also expose MCP tools and communicate via A2A protocol |
| No programmatic API — must use the CLI | `createOrchestrator()`, `startWorkflow()`, `sendSignal()` exported as library functions |
| Skills are Claude Code-specific | Skills can be any executable that conforms to the skill interface (LangGraph agents, CrewAI crews, plain scripts) |

---

## 2. User Stories

### US-17: Developer Extends Ptah with Custom Agent Types and Hooks

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to add a Security Agent that runs SAST scans after implementation. They create a skill definition, register it in the config, assign it to a post-implementation phase, and define a lifecycle hook that uploads scan results to their security dashboard. All without modifying Ptah's source code. |
| **Goals** | Extend Ptah with arbitrary agent types and custom logic at phase boundaries without forking. |
| **Pain points** | Even after M1 (config-driven phases), there is no mechanism for running custom logic at phase transitions — e.g., "after implementation review is approved, run a deployment pipeline" or "before each review, lint the documents." |
| **Key needs** | Lifecycle hooks (on-phase-enter, on-phase-exit, on-agent-complete, on-workflow-complete). Hook handlers as shell commands, TypeScript functions, or HTTP endpoints. |

### US-18: Developer Uses Ptah as a Library

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer is building a custom CI/CD pipeline that includes Ptah-style agent orchestration as one step. They import `@ohenak/ptah-core` and programmatically create a workflow, register agents, start the orchestrator, and listen for events — all within their own Node.js process. |
| **Goals** | Use Ptah's orchestration engine without the CLI wrapper. Programmatic control over workflow creation, signal sending, and event handling. |
| **Pain points** | Current Ptah is a black-box CLI. Embedding it into another system requires spawning a subprocess and parsing stdout — fragile and limiting. |
| **Key needs** | Exported API: `createOrchestrator(config)`, `startWorkflow(featureSlug, config)`, `sendSignal(workflowId, signal)`, `onEvent(handler)`. TypeScript types for all public interfaces. |

### US-19: Ptah Agents Interoperate via Standard Protocols

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer has existing agents built on LangGraph (Python) and wants them to participate in Ptah workflows alongside Claude Code agents. They configure Ptah to communicate with external agents via the A2A (Agent-to-Agent) protocol and expose Ptah's tools via MCP servers. |
| **Goals** | Ptah agents can invoke tools from external MCP servers. External agents can participate in Ptah workflows via A2A. Mixed-framework orchestration. |
| **Pain points** | Current Ptah only supports Claude Code as the agent runtime. Teams with existing LangGraph, CrewAI, or custom agents cannot integrate them without rewriting as Claude Code skills. |
| **Key needs** | MCP client for tool discovery and invocation. A2A server for receiving external agent requests. A2A client for dispatching to external agents. Skill adapter interface that wraps non-Claude agents. |

### US-20: Developer Runs Non-Claude Skills

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use a Python-based LangGraph agent for code review and a simple shell script for linting as "agents" in their Ptah workflow. They configure these as skills with `type: "executable"` or `type: "a2a"` instead of `type: "claude-code"`. |
| **Goals** | Any executable or network-reachable agent can participate in a Ptah workflow. |
| **Pain points** | Current `SkillClient` only supports Claude Code invocations. Using any other agent runtime requires writing a Claude Code skill wrapper that shells out — inelegant and token-wasteful. |
| **Key needs** | Skill adapter interface with multiple implementations: `claude-code`, `executable` (stdin/stdout), `a2a` (network). Common output contract (routing signal). |

---

## 3. Requirements

### Domain: FX — Framework Extensibility

#### REQ-FX-01: Library Package Separation

| Attribute | Detail |
|-----------|--------|
| **Title** | Separate Core Library from CLI |
| **Description** | Restructure Ptah into two packages: `@ohenak/ptah-core` (the orchestration engine, config loader, workflow types, and all provider interfaces) and `@ohenak/ptah-cli` (the CLI wrapper that imports core). The core package exports a programmatic API. The CLI package is a thin wrapper that parses arguments and calls core functions. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** `npm install @ohenak/ptah-core`<br>**When:** They import and call `createOrchestrator(config)`<br>**Then:** An orchestrator instance is created and ready to start workflows. No CLI process is spawned. All types are exported and available for TypeScript consumers. |
| **Priority** | P0 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-18 |
| **Dependencies** | None |

#### REQ-FX-02: Programmatic API

| Attribute | Detail |
|-----------|--------|
| **Title** | Exported Orchestrator API |
| **Description** | `@ohenak/ptah-core` exports the following public API: `createOrchestrator(config: PtahConfig): Orchestrator`, `Orchestrator.startWorkflow(featureSlug: string, featureConfig: FeatureConfig): Promise<WorkflowHandle>`, `Orchestrator.sendSignal(workflowId: string, signal: Signal): Promise<void>`, `Orchestrator.queryWorkflow(workflowId: string, query: string): Promise<unknown>`, `Orchestrator.onEvent(handler: EventHandler): void`, `Orchestrator.shutdown(): Promise<void>`. All types are exported. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A Node.js script importing `@ohenak/ptah-core`<br>**When:** They create an orchestrator, start a workflow, send a signal, and query state<br>**Then:** All operations work programmatically without CLI interaction. Events are delivered to registered handlers. |
| **Priority** | P0 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-18 |
| **Dependencies** | REQ-FX-01 |

#### REQ-FX-03: Lifecycle Hooks

| Attribute | Detail |
|-----------|--------|
| **Title** | Configurable Hooks at Workflow Lifecycle Points |
| **Description** | The workflow configuration supports lifecycle hooks at: `on_phase_enter`, `on_phase_exit`, `on_agent_complete`, `on_review_complete`, `on_workflow_complete`, and `on_workflow_fail`. Each hook is either a shell command (executed in the repo directory), a TypeScript function path (imported and called), or an HTTP endpoint (POST with event JSON). Hooks are non-blocking by default; optional `blocking: true` pauses the workflow until the hook completes. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A workflow config with `on_workflow_complete: { command: "make deploy", blocking: true }`<br>**When:** The workflow completes successfully<br>**Then:** `make deploy` is executed in the repo directory. The workflow waits for the command to complete before reporting final status. |
| **Priority** | P0 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-17 |
| **Dependencies** | REQ-CD-01 (from M1) |

#### REQ-FX-04: Skill Adapter Interface

| Attribute | Detail |
|-----------|--------|
| **Title** | Pluggable Skill Execution Adapters |
| **Description** | The `SkillClient` interface is generalized into a `SkillAdapter` interface with multiple implementations: `claude-code` (existing Claude Agent SDK integration), `executable` (invokes a shell command, passes context via stdin/env, reads routing signal from stdout), `a2a` (communicates with an external agent via the A2A protocol). Each agent in config specifies its adapter type via a `type` field. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** An agent configured with `type: "executable"` and `command: "python review_agent.py"`<br>**When:** The workflow dispatches this agent<br>**Then:** The Orchestrator invokes `python review_agent.py`, passes the context bundle via stdin (JSON), and reads the routing signal from stdout. The agent participates in the workflow like any Claude Code agent. |
| **Priority** | P0 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-20 |
| **Dependencies** | REQ-FX-01 |

#### REQ-FX-05: MCP Tool Integration

| Attribute | Detail |
|-----------|--------|
| **Title** | MCP Client for External Tool Discovery and Invocation |
| **Description** | Ptah agents can discover and invoke tools from external MCP servers. The config supports an `mcp_servers` list of MCP server endpoints. When assembling context for an agent, the Orchestrator includes available MCP tools in the agent's allowed tools list. Claude Code agents can call these tools natively; executable agents receive the tool list in their context. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A config with `mcp_servers: [{ name: "github", url: "stdio://gh-mcp-server" }]`<br>**When:** An agent is invoked<br>**Then:** The agent can discover and call tools from the GitHub MCP server (e.g., `create_pull_request`, `list_issues`). Tool results are returned to the agent within its invocation. |
| **Priority** | P1 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-19 |
| **Dependencies** | REQ-FX-04 |

#### REQ-FX-06: A2A Protocol Support

| Attribute | Detail |
|-----------|--------|
| **Title** | Agent-to-Agent Protocol for Cross-Framework Interoperability |
| **Description** | Ptah can dispatch work to external agents via the A2A protocol and receive work from external agents. Outbound: agents with `type: "a2a"` in config are dispatched via A2A client calls to the configured endpoint. Inbound: Ptah exposes an A2A server endpoint that external orchestrators can call to invoke Ptah-managed agents. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** An agent configured with `type: "a2a"` and `endpoint: "http://langgraph-agent:8080/a2a"`<br>**When:** The workflow dispatches this agent<br>**Then:** The Orchestrator sends a task to the LangGraph agent via A2A protocol. The external agent processes the task and returns a result. The routing signal is extracted and the workflow continues. |
| **Priority** | P2 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-19 |
| **Dependencies** | REQ-FX-04 |

#### REQ-FX-07: Workflow Templates and Presets

| Attribute | Detail |
|-----------|--------|
| **Title** | Shareable Workflow Configuration Templates |
| **Description** | Ptah supports importing workflow configurations from published npm packages or local files. `ptah init --template @ohenak/ptah-template-fullstack` scaffolds a project with a pre-configured workflow, agent definitions, and skill files. Teams can publish their own templates. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A published npm package `@myteam/ptah-template-microservices` containing a workflow config, agent definitions, and skill files<br>**When:** They run `ptah init --template @myteam/ptah-template-microservices`<br>**Then:** The project is scaffolded with the template's workflow, agents, and skills. The developer can customize from this starting point. |
| **Priority** | P2 |
| **Phase** | Milestone 3 |
| **Source Stories** | US-17, US-18 |
| **Dependencies** | REQ-FX-01, REQ-CD-01 (from M1) |

---

## 4. Scope Boundaries

### 4.1 In Scope

- Library/CLI package separation
- Programmatic API for orchestrator control
- Lifecycle hooks (shell, TypeScript, HTTP)
- Skill adapter interface (claude-code, executable, a2a)
- MCP client for tool integration
- A2A protocol support (outbound and inbound)
- Workflow templates and presets

### 4.2 Out of Scope

- Ptah web dashboard or visual workflow editor
- Multi-tenant Ptah (multiple teams sharing one Temporal cluster with isolation)
- Marketplace or registry for shared templates (can use npm directly)
- Custom Claude model selection per agent (deferred)
- Agent-to-agent direct communication within a single workflow (agents communicate via the orchestrator)

### 4.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-15 | The A2A protocol spec (v1.x from Google/Linux Foundation) is stable enough for production use by Milestone 3 | May need to implement a subset or use a compatibility shim |
| A-16 | MCP protocol adoption continues; the ecosystem of MCP servers grows | MCP integration value depends on available tool servers; mitigated by Claude Code's native MCP support |
| A-17 | npm package separation (`ptah-core` + `ptah-cli`) is manageable as a monorepo with workspaces | Alternatives: single package with multiple entry points (`@ohenak/ptah/core`, `@ohenak/ptah/cli`) |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-16 | A2A protocol is still early; implementations across frameworks may have interoperability issues | Med | Med | Start with Claude Code + executable adapters; A2A is P2 and can be deferred further |
| R-17 | Library packaging introduces semver/backward-compatibility burden | Med | Med | Strict public API surface; use TypeScript declaration files as contract; deprecation warnings before breaking changes |
| R-18 | Executable skill adapter is hard to debug (stdin/stdout interface, no interactive tools) | Med | Low | Provide verbose logging mode; define clear JSON contract for input/output; include example adapters for Python, Go |
| R-19 | Lifecycle hooks with `blocking: true` can stall workflows indefinitely | Low | Med | Configurable hook timeout (default 5 minutes); hook failure does not block workflow advancement by default |

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
| 1.0 | April 1, 2026 | Product Manager | Initial requirements document for Milestone 3 (Framework Extensibility & Distribution). 7 requirements in FX domain. |

---

*End of Document*
