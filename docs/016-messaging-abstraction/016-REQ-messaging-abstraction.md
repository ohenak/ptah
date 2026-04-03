# Requirements Document

## Milestone 2 — Messaging Abstraction

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-MESSAGING |
| **Parent Document** | [REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.2 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Milestone** | 2 of 3 |
| **Depends On** | Milestone 1 (Temporal Foundation) |

---

## 1. Purpose

Abstract Ptah's messaging layer from a Discord-only implementation into a provider interface that supports Discord, Slack, webhooks, and CLI-only mode. After this milestone, Ptah can run without any external messaging platform — enabling CI/CD integration, local development workflows, and adoption by teams on different platforms.

**Why this is Milestone 2:** Milestone 1 (Temporal) removes the infrastructure coupling. This milestone removes the communication coupling. Together, they make Ptah a genuinely portable framework. The ordering matters — Temporal Signals (from M1) already decouple the workflow from the message source, making messaging abstraction a clean layer on top.

**What changes:**

| Current State | Target State |
|---------------|-------------|
| `DiscordClient` interface is the only messaging implementation | `MessagingProvider` interface with multiple implementations |
| Config loader requires `discord` section | Config loader requires `messaging` section with `provider` field |
| Agent `mention_id` validated as numeric (Discord snowflake) | Agent `mention_id` format varies by provider (or is optional) |
| `ResponsePoster` constructs Discord embeds | `ResponseFormatter` formats messages per provider |
| Human-in-the-loop requires Discord `#open-questions` channel | Human-in-the-loop uses provider-specific mechanism (channel, DM, CLI prompt, webhook) |
| Thread model is Discord threads | Thread model is provider-specific (Discord threads, Slack threads, CLI session IDs, webhook correlation IDs) |

---

## 2. User Stories

### US-26: Developer Uses Ptah Without Discord (CLI-Only Mode)

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use Ptah in a CI/CD pipeline or local development environment without setting up a Discord server. They run `ptah start --provider cli` and interact via terminal. Agent outputs are printed to stdout. Human-in-the-loop questions are prompted via stdin (interactive mode) or pre-answered via a config file (headless mode). |
| **Goals** | Zero external service dependencies for local development. CI/CD integration without messaging platform setup. Headless mode for automated pipelines. |
| **Pain points** | Current Ptah requires a Discord server, bot token, and configured channels before any work can begin. This is excessive friction for solo developers, CI pipelines, and evaluation/demo scenarios. |
| **Key needs** | CLI messaging provider. Stdout for agent output. Stdin or config-file for human input. Headless mode that pre-populates answers or auto-approves. |

### US-27: Developer Integrates Ptah with Slack

| Attribute | Detail |
|-----------|--------|
| **Description** | A team uses Slack as their primary communication tool. They configure Ptah with `messaging.provider: "slack"` and provide a Slack bot token. Ptah creates Slack threads for features, posts formatted messages with Block Kit, and receives human input via Slack replies. |
| **Goals** | Same orchestration experience on Slack as on Discord. Thread-based feature tracking. @mentions for agent roles. Formatted messages. |
| **Pain points** | Teams using Slack cannot adopt Ptah without switching to Discord — a non-starter for most organizations. |
| **Key needs** | Slack messaging provider. Thread creation and management. Block Kit message formatting. Slack event subscription for replies. Mention resolution. |

### US-28: Developer Receives Notifications via Webhooks

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to integrate Ptah notifications into their existing monitoring stack (PagerDuty, Datadog, custom dashboards). They configure a webhook provider that sends JSON payloads for workflow events: phase transitions, agent completions, questions needing human input, errors, and feature completion. |
| **Goals** | Integration with any external system via standard HTTP webhooks. Structured JSON payloads for programmatic consumption. |
| **Pain points** | Current implementation only supports Discord for notifications. Teams with custom tooling cannot receive Ptah events without building a Discord bot integration. |
| **Key needs** | Webhook messaging provider. Configurable endpoint URL. Structured JSON event payloads. Retry on delivery failure. Optional HMAC signing for payload verification. |

---

## 3. Requirements

### Domain: MA — Messaging Abstraction

#### REQ-MA-01: Messaging Provider Interface

| Attribute | Detail |
|-----------|--------|
| **Title** | Define Messaging Provider Interface |
| **Description** | Define a `MessagingProvider` interface that abstracts all messaging operations. The interface covers: thread creation, message posting (plain text and formatted), thread history reading, mention resolution, and event subscription (for human replies). All existing Discord-specific code in the Orchestrator uses this interface rather than the Discord client directly. Thread identifiers are **opaque handles** — when the provider creates a thread it returns a `ThreadHandle` value; the orchestrator stores and passes this handle back to the provider for subsequent operations without inspecting its contents. The provider owns creation and interpretation of thread identifiers; the orchestrator never constructs or parses them. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** The Orchestrator codebase<br>**When:** Searching for direct `DiscordClient` usage outside the Discord provider implementation<br>**Then:** No direct Discord usage exists in the orchestrator layer. All messaging goes through `MessagingProvider`. Thread creation operations return an opaque `ThreadHandle`; the orchestrator never constructs or parses a thread identifier string directly. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-26, US-27, US-28 |
| **Dependencies** | None |

#### REQ-MA-02: Discord Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Discord Implementation of Messaging Provider |
| **Description** | The existing Discord integration is refactored into a `DiscordMessagingProvider` that implements the `MessagingProvider` interface. Behavior is identical to current v4/v5 — threads, embeds, @mentions, `#open-questions` channel, `#agent-debug` channel. This is the default provider for backward compatibility. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "discord"` (or no provider specified, defaulting to Discord)<br>**When:** The Orchestrator starts<br>**Then:** All Discord behaviors are functionally identical to the pre-abstraction implementation. All existing Discord behaviors are covered by passing tests. (Note: test wiring may change structurally — e.g., `FakeDiscordClient` injected into `DiscordMessagingProvider` rather than directly into the orchestrator — but behavior coverage must be complete.) |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-26 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-03: CLI Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | CLI-Only Messaging Provider |
| **Description** | A `CliMessagingProvider` that operates entirely via stdout/stdin. Agent outputs are printed as formatted terminal text (with optional color). Threads are simulated as labeled output sections. Human-in-the-loop questions prompt via stdin in interactive mode, or are pre-answered via an `answers` config section in headless mode. **CLI interactive mode requires Ptah to run as a foreground process with stdin attached** (not as a background Temporal worker daemon). In this mode, the Temporal worker runs in-process alongside the prompt loop. This is the natural behavior when running `ptah start --provider cli` in a terminal. Headless mode (`--headless`) is the correct mode for CI/CD pipelines where stdin is not available. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** `ptah start --provider cli` run in a foreground terminal with stdin attached<br>**When:** An agent completes a phase and the workflow needs human input<br>**Then:** The question is printed to stdout with a prompt. In interactive mode, the user types an answer. In headless mode (`--headless`), the answer is read from config. The workflow resumes in both cases. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-26 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-04: Webhook Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Webhook Notification Provider |
| **Description** | A `WebhookMessagingProvider` sends HTTP POST requests with JSON payloads for all messaging events. Event types: `phase_transition`, `agent_started`, `agent_completed`, `question_asked`, `question_answered`, `feature_completed`, `error`. The webhook URL is configured in `messaging.webhook.url`. Optional HMAC-SHA256 signing via a shared secret (`messaging.webhook.secret`). Human-in-the-loop is handled via an **embedded HTTP callback server** that Ptah starts alongside the Temporal worker when the webhook provider is active. The callback server listens on a configurable port (`messaging.webhook.callback_port`, default `8765`). Each outgoing webhook payload includes a `callback_url` field: `{base_url}/webhook/answer/{workflowId}`. The base URL is configurable via `messaging.webhook.callback_base_url` (defaults to `http://localhost:{callback_port}`). When an external system POSTs `{ "answer": "..." }` to the callback URL, Ptah sends a `user-answer` Temporal Signal to resume the workflow. TLS termination is not provided by Ptah; operators must use a reverse proxy if HTTPS is required. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "webhook"` and `messaging.webhook.url: "https://hooks.example.com/ptah"`<br>**When:** An agent completes a phase<br>**Then:** A POST request is sent to the URL with a JSON payload: `{ "event": "agent_completed", "feature": "my-feature", "phase": "tspec-creation", "agent": "eng", "timestamp": "...", "callback_url": "http://localhost:8765/webhook/answer/ptah-feature-my-feature-1" }`. If the URL is unreachable, the delivery is retried 3 times with exponential backoff.<br>**And when:** An external system POSTs `{ "answer": "approved" }` to the `callback_url`<br>**Then:** The workflow receives a `user-answer` Temporal Signal and resumes. |
| **Priority** | P1 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-28 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-05: Slack Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Slack Implementation of Messaging Provider |
| **Description** | A `SlackMessagingProvider` using the Slack Web API for posting and **Socket Mode** for receiving events. Socket Mode uses a persistent outbound WebSocket connection — no inbound HTTP endpoint is required, making it suitable for local, CI, and on-premise deployments without public URL exposure. Creates Slack threads for features, posts formatted messages with Block Kit, receives human replies via Socket Mode events, and resolves @mentions via Slack user/usergroup IDs (alphanumeric format, e.g. `U01234ABC`). Configured via `messaging.slack.bot_token` (OAuth bot token, `xoxb-` prefix), `messaging.slack.app_token` (app-level token for Socket Mode, `xapp-` prefix), `messaging.slack.channel_id`, and optional `messaging.slack.questions_channel_id`. Slack HTTP Events API is **out of scope** for this feature — Socket Mode is the only supported connection mode. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "slack"`, a valid `bot_token`, and a valid `app_token`<br>**When:** A new feature is initiated<br>**Then:** A Slack thread is created in the configured channel. Agent outputs are posted as Block Kit messages. Human questions appear in the questions channel (or the feature thread if no questions channel is configured). User replies resume the workflow via Temporal Signal. **No public HTTPS URL or inbound firewall rule is required.** |
| **Priority** | P1 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-27 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-06: Provider-Agnostic Configuration

| Attribute | Detail |
|-----------|--------|
| **Title** | Messaging Configuration Independent of Provider |
| **Description** | The `ptah.config.json` `messaging` section has a `provider` field and provider-specific sub-sections. The config loader validates only the fields relevant to the selected provider. Agent `mention_id` is used for mention-based routing on Discord and Slack only; it is not required for CLI or webhook providers. Mention ID format is provider-specific: Discord accepts numeric snowflakes only; Slack accepts alphanumeric user/usergroup IDs (e.g. `U01234ABC`, `S01234ABC`); the `/^\d+$/` snowflake-only validation is removed and replaced by provider-level format validation at startup. For CLI and webhook providers, agent routing is determined entirely by the Temporal Signal payload (`agent_id` field) — no mention parsing occurs. The config loader accepts the **legacy top-level `discord` section** (pre-016 format) as an alias for `messaging.provider: "discord"` and logs a deprecation warning directing operators to migrate to the `messaging` section format. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "cli"` and no `discord` or `mention_id` fields<br>**When:** The Orchestrator starts<br>**Then:** Config validation passes. No Discord-related fields are required. Agents function without mention IDs.<br>**And given:** A `ptah.config.json` with only a legacy top-level `discord` section (no `messaging` section)<br>**When:** The Orchestrator starts<br>**Then:** The config is accepted and Discord provider is activated. A deprecation warning is logged: `Legacy 'discord' config format detected. Migrate to 'messaging.provider: "discord"' — see docs/016-messaging-abstraction.` |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-26, US-27, US-28 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-07: Response Formatting Abstraction

| Attribute | Detail |
|-----------|--------|
| **Title** | Provider-Specific Message Formatting |
| **Description** | The `ResponsePoster` is replaced by the `MessagingProvider` interface. Response formatting is an **internal concern of each provider implementation** — the orchestrator does not know or care how a provider formats its output. The orchestrator constructs a structured event object (agent ID, phase, result summary, artifact list, routing outcome) and passes it to the active provider. Each provider handles format conversion internally: Discord produces an embed, Slack produces a Block Kit message, CLI produces a formatted terminal block, Webhook produces JSON. No separate `ResponseFormatter` interface is exposed at the orchestrator boundary; formatting lives inside each provider. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** An agent completion event with agent ID, phase, result summary, and artifact list<br>**When:** The event is passed to the active `MessagingProvider`<br>**Then:** Discord produces an embed. Slack produces a Block Kit message. CLI produces a formatted terminal block. Webhook produces a JSON payload. All contain the same semantic information. The orchestrator source code contains no format-specific logic (no embed construction, no Block Kit building, no per-provider conditionals). |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-26, US-27 |
| **Dependencies** | REQ-MA-01 |

---

## 4. Scope Boundaries

### 4.1 In Scope

- `MessagingProvider` interface definition (with opaque `ThreadHandle` type)
- Discord provider (refactored from existing code — no behavior change)
- CLI provider (stdout/stdin with headless mode; interactive mode requires foreground process)
- Webhook provider (JSON over HTTP with signing and embedded HTTP callback server for human-in-the-loop)
- Slack provider (Socket Mode connection; no Events API / public URL required)
- Provider-agnostic configuration (`messaging` section; legacy `discord` section accepted with deprecation warning)
- Response formatting as internal concern of each provider (no separate formatter interface at orchestrator boundary)
- Removal of Discord snowflake-only validation from agent registry; provider-specific mention routing

### 4.2 Out of Scope

- Microsoft Teams provider — can be added later using the same interface
- Matrix/IRC providers
- Email notifications
- Custom UI (web dashboard)
- Multi-provider (using Discord AND Slack simultaneously)
- Slack HTTP Events API support — Socket Mode is the only connection mode in this feature
- TLS termination for the webhook callback server — operators use a reverse proxy
- Slack Marketplace submission (incompatible with Socket Mode)

### 4.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-12 | Slack's threading model is sufficiently similar to Discord's for a common `MessagingProvider` interface | May need provider-specific thread management strategies |
| A-13 | Ptah embeds a lightweight HTTP callback server (default port 8765) when the webhook provider is active; this server receives human-in-the-loop answers and converts them to Temporal Signals | If embedding is infeasible, callers must invoke the Temporal API directly — documented as out of scope for v1 |
| A-14 | CLI headless mode (pre-answered questions) covers CI/CD use cases adequately | CI/CD may need more sophisticated automation; can be extended later |
| A-15 | Slack Socket Mode (WebSocket-based, no public URL required) is suitable for Ptah's single-instance deployment model; the 10-concurrent-connection limit per app is not a concern for a single Ptah process | If Socket Mode reconnect instability affects production reliability, HTTP Events API can be added in a future iteration |
| A-16 | CLI interactive mode runs as a foreground process with stdin attached; the Temporal worker runs in-process in this mode | If headless CI pipelines need interactive fallback, a named-pipe mechanism must be defined separately |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-13 | Slack API differences from Discord may force interface compromises (e.g., no equivalent of Discord embeds with sidebar color) | Med | Low | Use Block Kit's visual flexibility; accept minor formatting differences between providers |
| R-14 | CLI provider in headless mode may not handle all question types (e.g., multi-choice, file upload) | Low | Med | Define question schema with typed fields; headless config supports all question types |
| R-15 | Webhook delivery failures in unreliable networks may cause missed notifications | Med | Med | Retry with exponential backoff; log all delivery failures; events are also visible in Temporal UI |
| R-16 | Slack Socket Mode WebSocket disconnects in long-running Ptah sessions may cause missed events | Med | Med | Implement reconnect-with-backoff; Slack's Socket Mode SDK handles reconnection automatically |
| R-17 | Webhook callback server port conflicts in shared CI environments (port 8765 already in use) | Low | Med | Port is configurable via `messaging.webhook.callback_port`; document clearly in setup guide |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 5 | REQ-MA-01, REQ-MA-02, REQ-MA-03, REQ-MA-06, REQ-MA-07 |
| P1 | 2 | REQ-MA-04, REQ-MA-05 |

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| MA — Messaging Abstraction | 7 | REQ-MA-01 through REQ-MA-07 |

**Total: 7 requirements (5 P0, 2 P1)**

---

## 7. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 1, 2026 | Product Manager | Initial requirements document for Milestone 2 (Messaging Abstraction). 7 requirements in MA domain. |
| 1.1 | April 3, 2026 | Product Manager | Addressed engineer cross-review (F-01–F-08). REQ-MA-01: added opaque `ThreadHandle` contract. REQ-MA-02: removed "without modification" test constraint. REQ-MA-03: added foreground/stdin requirement for interactive mode. REQ-MA-04: specified embedded HTTP callback server (`callback_port`, `callback_url` in payload). REQ-MA-05: mandated Slack Socket Mode; added `app_token` requirement; Events API out of scope. REQ-MA-06: clarified per-provider mention routing (Discord snowflake / Slack alphanumeric / CLI+webhook via Signal); added legacy `discord` config deprecation warning. REQ-MA-07: clarified formatting is internal to each provider — no separate formatter interface at orchestrator boundary. Assumptions A-13–A-16 updated/added. Risks R-16, R-17 added. |
| 1.2 | April 3, 2026 | Product Manager | Renumbered user stories to avoid collision with Phase 11 IDs already registered in the master traceability matrix: US-14→US-26, US-15→US-27, US-16→US-28. No requirement changes. |

---

*End of Document*
