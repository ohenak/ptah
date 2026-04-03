# Requirements Document

## Milestone 2 — Messaging Abstraction

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-MESSAGING |
| **Parent Document** | [REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | April 1, 2026 |
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

### US-14: Developer Uses Ptah Without Discord (CLI-Only Mode)

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use Ptah in a CI/CD pipeline or local development environment without setting up a Discord server. They run `ptah start --provider cli` and interact via terminal. Agent outputs are printed to stdout. Human-in-the-loop questions are prompted via stdin (interactive mode) or pre-answered via a config file (headless mode). |
| **Goals** | Zero external service dependencies for local development. CI/CD integration without messaging platform setup. Headless mode for automated pipelines. |
| **Pain points** | Current Ptah requires a Discord server, bot token, and configured channels before any work can begin. This is excessive friction for solo developers, CI pipelines, and evaluation/demo scenarios. |
| **Key needs** | CLI messaging provider. Stdout for agent output. Stdin or config-file for human input. Headless mode that pre-populates answers or auto-approves. |

### US-15: Developer Integrates Ptah with Slack

| Attribute | Detail |
|-----------|--------|
| **Description** | A team uses Slack as their primary communication tool. They configure Ptah with `messaging.provider: "slack"` and provide a Slack bot token. Ptah creates Slack threads for features, posts formatted messages with Block Kit, and receives human input via Slack replies. |
| **Goals** | Same orchestration experience on Slack as on Discord. Thread-based feature tracking. @mentions for agent roles. Formatted messages. |
| **Pain points** | Teams using Slack cannot adopt Ptah without switching to Discord — a non-starter for most organizations. |
| **Key needs** | Slack messaging provider. Thread creation and management. Block Kit message formatting. Slack event subscription for replies. Mention resolution. |

### US-16: Developer Receives Notifications via Webhooks

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
| **Description** | Define a `MessagingProvider` interface that abstracts all messaging operations. The interface covers: thread creation, message posting (plain text and formatted), thread history reading, mention resolution, and event subscription (for human replies). All existing Discord-specific code in the Orchestrator uses this interface rather than the Discord client directly. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** The Orchestrator codebase<br>**When:** Searching for direct `DiscordClient` usage outside the Discord provider implementation<br>**Then:** No direct Discord usage exists in the orchestrator layer. All messaging goes through `MessagingProvider`. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-14, US-15, US-16 |
| **Dependencies** | None |

#### REQ-MA-02: Discord Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Discord Implementation of Messaging Provider |
| **Description** | The existing Discord integration is refactored into a `DiscordMessagingProvider` that implements the `MessagingProvider` interface. Behavior is identical to current v4/v5 — threads, embeds, @mentions, `#open-questions` channel, `#agent-debug` channel. This is the default provider for backward compatibility. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "discord"` (or no provider specified, defaulting to Discord)<br>**When:** The Orchestrator starts<br>**Then:** Behavior is identical to the pre-abstraction implementation. All existing Discord integration tests pass without modification. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-14 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-03: CLI Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | CLI-Only Messaging Provider |
| **Description** | A `CliMessagingProvider` that operates entirely via stdout/stdin. Agent outputs are printed as formatted terminal text (with optional color). Threads are simulated as labeled output sections. Human-in-the-loop questions prompt via stdin in interactive mode, or are pre-answered via a `answers` config section in headless mode. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** `ptah start --provider cli`<br>**When:** An agent completes a phase and the workflow needs human input<br>**Then:** The question is printed to stdout with a prompt. In interactive mode, the user types an answer. In headless mode (`--headless`), the answer is read from config. The workflow resumes in both cases. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-14 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-04: Webhook Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Webhook Notification Provider |
| **Description** | A `WebhookMessagingProvider` sends HTTP POST requests with JSON payloads for all messaging events. Event types: `phase_transition`, `agent_started`, `agent_completed`, `question_asked`, `question_answered`, `feature_completed`, `error`. The webhook URL is configured in `messaging.webhook.url`. Optional HMAC-SHA256 signing via a shared secret. Human-in-the-loop is handled via a callback endpoint that sends a Temporal Signal. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "webhook"` and `messaging.webhook.url: "https://hooks.example.com/ptah"`<br>**When:** An agent completes a phase<br>**Then:** A POST request is sent to the URL with a JSON payload: `{ "event": "agent_completed", "feature": "my-feature", "phase": "tspec-creation", "agent": "eng", "timestamp": "..." }`. If the URL is unreachable, the delivery is retried 3 times with exponential backoff. |
| **Priority** | P1 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-16 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-05: Slack Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Title** | Slack Implementation of Messaging Provider |
| **Description** | A `SlackMessagingProvider` that uses the Slack Web API and Events API. Creates Slack threads for features, posts formatted messages using Block Kit, receives human replies via Slack events, and resolves @mentions via Slack user/usergroup IDs. Configured via `messaging.slack.bot_token`, `messaging.slack.channel_id`, and optional `messaging.slack.questions_channel_id`. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "slack"` and valid Slack credentials<br>**When:** A new feature is initiated<br>**Then:** A Slack thread is created in the configured channel. Agent outputs are posted as Block Kit messages. Human questions appear in the questions channel (or the same thread). User replies resume the workflow. |
| **Priority** | P1 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-15 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-06: Provider-Agnostic Configuration

| Attribute | Detail |
|-----------|--------|
| **Title** | Messaging Configuration Independent of Provider |
| **Description** | The `ptah.config.json` `messaging` section has a `provider` field and provider-specific sub-sections. The config loader validates only the fields relevant to the selected provider. Agent `mention_id` becomes optional — only required for providers that support @mentions (Discord, Slack). CLI and webhook providers do not require it. |
| **Acceptance Criteria** | **Who:** Developer<br>**Given:** A `ptah.config.json` with `messaging.provider: "cli"` and no `discord` or `mention_id` fields<br>**When:** The Orchestrator starts<br>**Then:** Config validation passes. No Discord-related fields are required. Agents function without mention IDs. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-14, US-15, US-16 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-07: Response Formatting Abstraction

| Attribute | Detail |
|-----------|--------|
| **Title** | Provider-Specific Message Formatting |
| **Description** | The `ResponsePoster` is replaced by a `ResponseFormatter` interface that each provider implements. Discord uses embeds with color coding. Slack uses Block Kit. CLI uses formatted terminal output (with optional ANSI colors). Webhook sends raw JSON. The Orchestrator provides a structured event object; the formatter converts it to the provider's native format. |
| **Acceptance Criteria** | **Who:** Orchestrator<br>**Given:** An agent completion event with agent ID, phase, result summary, and artifact list<br>**When:** The event is passed to the active `ResponseFormatter`<br>**Then:** Discord produces an embed. Slack produces a Block Kit message. CLI produces a formatted terminal block. Webhook produces a JSON payload. All contain the same semantic information. |
| **Priority** | P0 |
| **Phase** | Milestone 2 |
| **Source Stories** | US-14, US-15 |
| **Dependencies** | REQ-MA-01 |

---

## 4. Scope Boundaries

### 4.1 In Scope

- `MessagingProvider` interface definition
- Discord provider (refactored from existing code)
- CLI provider (stdout/stdin with headless mode)
- Webhook provider (JSON over HTTP with signing)
- Slack provider
- Provider-agnostic configuration
- Response formatting abstraction
- Removal of Discord hard-dependency from config loader and agent registry

### 4.2 Out of Scope

- Microsoft Teams provider — can be added later using the same interface
- Matrix/IRC providers
- Email notifications
- Custom UI (web dashboard)
- Multi-provider (using Discord AND Slack simultaneously)

### 4.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-12 | Slack's threading model is sufficiently similar to Discord's for a common `MessagingProvider` interface | May need provider-specific thread management strategies |
| A-13 | Temporal Signals provide a clean mechanism for webhook-based human-in-the-loop (external HTTP → Signal) | May need a small HTTP server embedded in the Orchestrator for webhook callbacks |
| A-14 | CLI headless mode (pre-answered questions) covers CI/CD use cases adequately | CI/CD may need more sophisticated automation; can be extended later |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-13 | Slack API differences from Discord may force interface compromises (e.g., no equivalent of Discord embeds with sidebar color) | Med | Low | Use Block Kit's visual flexibility; accept minor formatting differences between providers |
| R-14 | CLI provider in headless mode may not handle all question types (e.g., multi-choice, file upload) | Low | Med | Define question schema with typed fields; headless config supports all question types |
| R-15 | Webhook delivery failures in unreliable networks may cause missed notifications | Med | Med | Retry with exponential backoff; log all delivery failures; events are also visible in Temporal UI |

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

---

*End of Document*
