# Requirements Document

## Messaging Abstraction

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-016 |
| **Parent Document** | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 1.0 |
| **Date** | April 1, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Abstract Ptah's messaging layer from a Discord-only implementation into a provider interface that supports Discord, Slack, webhooks, and CLI-only mode.

Today, Ptah is hardcoded to Discord:

- The config loader **requires** a `discord` section with `server_id`, `bot_token_env`, and channel names — Ptah will not start without it
- Agent `mention_id` fields are validated with `/^\d+$/` — the numeric format of Discord snowflake IDs
- The `ResponsePoster` constructs Discord-specific embeds (with color sidebars, field layouts, and footer text)
- Human-in-the-loop requires an `#open-questions` Discord channel — no alternative path exists
- Thread creation, history reading, and message posting all use Discord-specific APIs directly

This creates two problems:

1. **Adoption barrier:** Teams using Slack, Teams, or no messaging platform cannot use Ptah without setting up a Discord server — a non-starter for most organizations.
2. **CI/CD exclusion:** Running Ptah in a CI pipeline or local automation requires a Discord server even when no human is watching — pure overhead.

After feature 015 (Temporal Foundation), Temporal Signals already decouple the workflow from the message source. This feature completes the decoupling by making the messaging layer a pluggable provider.

**Depends on:** Feature 015 (Temporal Foundation) — Temporal Signals provide the mechanism for provider-agnostic human-in-the-loop.

---

## 2. User Scenarios

### US-30: Developer Uses Ptah Without Discord (CLI-Only Mode)

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to use Ptah in a CI/CD pipeline or local development environment without setting up a Discord server. They run `ptah start --provider cli` and interact via terminal. Agent outputs are printed to stdout. Human-in-the-loop questions are prompted via stdin (interactive) or pre-answered via a config file (headless). |
| **Goals** | Zero external service dependencies for local development. CI/CD integration without messaging platform setup. Headless mode for automated pipelines. |
| **Pain points** | Current Ptah requires a Discord server, bot token, and configured channels before any work can begin. This is excessive friction for solo developers, CI pipelines, and evaluation/demo scenarios. |
| **Key needs** | CLI messaging provider. Stdout for agent output. Stdin or config-file for human input. Headless mode that pre-populates answers or auto-approves. |

### US-31: Developer Integrates Ptah with Slack

| Attribute | Detail |
|-----------|--------|
| **Description** | A team uses Slack as their primary communication tool. They configure Ptah with `messaging.provider: "slack"` and provide a Slack bot token. Ptah creates Slack threads for features, posts formatted messages with Block Kit, and receives human input via Slack replies. |
| **Goals** | Same orchestration experience on Slack as on Discord. Thread-based feature tracking. @mentions for agent roles. Formatted messages. |
| **Pain points** | Teams using Slack cannot adopt Ptah without switching to Discord — a non-starter for most organizations. |
| **Key needs** | Slack messaging provider. Thread creation and management. Block Kit message formatting. Slack event subscription for replies. Mention resolution. |

### US-32: Developer Receives Notifications via Webhooks

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants to integrate Ptah notifications into their existing monitoring stack (PagerDuty, Datadog, custom dashboards). They configure a webhook provider that sends JSON payloads for workflow events: phase transitions, agent completions, questions needing human input, errors, and feature completion. |
| **Goals** | Integration with any external system via standard HTTP webhooks. Structured JSON payloads for programmatic consumption. |
| **Pain points** | Current implementation only supports Discord for notifications. Teams with custom tooling cannot receive Ptah events without building a Discord bot integration. |
| **Key needs** | Webhook messaging provider. Configurable endpoint URL. Structured JSON event payloads. Retry on delivery failure. Optional HMAC signing. |

---

## 3. Scope Boundaries

### 3.1 In Scope

- `MessagingProvider` interface definition
- Discord provider (refactored from existing code — no behavior change)
- CLI provider (stdout/stdin with headless mode)
- Webhook provider (JSON over HTTP with signing)
- Slack provider
- Provider-agnostic configuration (Discord no longer mandatory)
- Response formatting abstraction
- Removal of Discord snowflake validation from agent registry

### 3.2 Out of Scope

- Microsoft Teams provider — can be added later using the same interface
- Matrix/IRC providers
- Email notifications
- Multi-provider (using Discord AND Slack simultaneously)
- Custom UI (web dashboard)

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-12 | Slack's threading model is sufficiently similar to Discord's for a common `MessagingProvider` interface | May need provider-specific thread management strategies |
| A-13 | Temporal Signals (from feature 015) provide a clean mechanism for webhook-based human-in-the-loop | May need a small HTTP server embedded in the Orchestrator for webhook callbacks |
| A-14 | CLI headless mode (pre-answered questions) covers CI/CD use cases adequately | CI/CD may need more sophisticated automation; can be extended later |

---

## 4. Requirements

### Domain: MA — Messaging Abstraction

#### REQ-MA-01: Messaging Provider Interface

| Attribute | Detail |
|-----------|--------|
| **Description** | Define a `MessagingProvider` interface that abstracts all messaging operations: thread creation, message posting (plain text and formatted), thread history reading, mention resolution, and event subscription (for human replies). All existing Discord-specific code in the Orchestrator uses this interface rather than the Discord client directly. |
| **Acceptance Criteria** | **Who:** Developer **Given:** The Orchestrator codebase **When:** Searching for direct `DiscordClient` usage outside the Discord provider implementation **Then:** No direct Discord usage exists in the orchestrator layer. All messaging goes through `MessagingProvider`. |
| **Priority** | P0 |
| **Source Stories** | US-30, US-31, US-32 |
| **Dependencies** | None |

#### REQ-MA-02: Discord Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Description** | The existing Discord integration is refactored into a `DiscordMessagingProvider` that implements `MessagingProvider`. Behavior is identical to current — threads, embeds, @mentions, `#open-questions`, `#agent-debug`. This is the default provider for backward compatibility. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A `ptah.config.json` with `messaging.provider: "discord"` (or no provider, defaulting to Discord) **When:** The Orchestrator starts **Then:** Behavior is identical to the pre-abstraction implementation. All existing Discord integration tests pass without modification. |
| **Priority** | P0 |
| **Source Stories** | US-30 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-03: CLI Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Description** | A `CliMessagingProvider` that operates entirely via stdout/stdin. Agent outputs are printed as formatted terminal text (with optional color). Threads are simulated as labeled output sections. Human-in-the-loop questions prompt via stdin in interactive mode, or are pre-answered via an `answers` config section in headless mode. |
| **Acceptance Criteria** | **Who:** Developer **Given:** `ptah start --provider cli` **When:** An agent completes a phase and the workflow needs human input **Then:** The question is printed to stdout with a prompt. In interactive mode, the user types an answer. In headless mode (`--headless`), the answer is read from config. The workflow resumes in both cases. |
| **Priority** | P0 |
| **Source Stories** | US-30 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-04: Webhook Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Description** | A `WebhookMessagingProvider` sends HTTP POST requests with JSON payloads for all messaging events. Event types: `phase_transition`, `agent_started`, `agent_completed`, `question_asked`, `question_answered`, `feature_completed`, `error`. Configured via `messaging.webhook.url`. Optional HMAC-SHA256 signing via shared secret. Human-in-the-loop handled via a callback endpoint that sends a Temporal Signal. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A `ptah.config.json` with `messaging.provider: "webhook"` and a URL **When:** An agent completes a phase **Then:** A POST request is sent with JSON payload: `{ "event": "agent_completed", "feature": "my-feature", "phase": "tspec-creation", "agent": "eng", "timestamp": "..." }`. Unreachable URLs are retried 3 times with exponential backoff. |
| **Priority** | P1 |
| **Source Stories** | US-32 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-05: Slack Messaging Provider

| Attribute | Detail |
|-----------|--------|
| **Description** | A `SlackMessagingProvider` using the Slack Web API and Events API. Creates threads for features, posts formatted messages with Block Kit, receives human replies via Slack events, resolves @mentions via Slack user/usergroup IDs. Configured via `messaging.slack.bot_token`, `messaging.slack.channel_id`, and optional `messaging.slack.questions_channel_id`. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A `ptah.config.json` with `messaging.provider: "slack"` and valid credentials **When:** A new feature is initiated **Then:** A Slack thread is created. Agent outputs are posted as Block Kit messages. Human questions appear in the questions channel. User replies resume the workflow. |
| **Priority** | P1 |
| **Source Stories** | US-31 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-06: Provider-Agnostic Configuration

| Attribute | Detail |
|-----------|--------|
| **Description** | The `ptah.config.json` `messaging` section has a `provider` field and provider-specific sub-sections. The config loader validates only the fields relevant to the selected provider. Agent `mention_id` becomes optional — required only for Discord and Slack. CLI and webhook providers do not require it. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A `ptah.config.json` with `messaging.provider: "cli"` and no `discord` or `mention_id` fields **When:** The Orchestrator starts **Then:** Config validation passes. No Discord-related fields are required. |
| **Priority** | P0 |
| **Source Stories** | US-30, US-31, US-32 |
| **Dependencies** | REQ-MA-01 |

#### REQ-MA-07: Response Formatting Abstraction

| Attribute | Detail |
|-----------|--------|
| **Description** | The `ResponsePoster` is replaced by a `ResponseFormatter` interface that each provider implements. Discord uses embeds. Slack uses Block Kit. CLI uses formatted terminal output. Webhook sends raw JSON. The Orchestrator provides a structured event object; the formatter converts it to the provider's native format. |
| **Acceptance Criteria** | **Who:** Orchestrator **Given:** An agent completion event with agent ID, phase, result summary, and artifact list **When:** The event is passed to the active `ResponseFormatter` **Then:** Discord produces an embed. Slack produces a Block Kit message. CLI produces a formatted terminal block. Webhook produces JSON. All contain the same semantic information. |
| **Priority** | P0 |
| **Source Stories** | US-30, US-31 |
| **Dependencies** | REQ-MA-01 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-13 | Slack API differences may force interface compromises (e.g., no equivalent of Discord embeds with sidebar color) | Med | Low | Use Block Kit's visual flexibility; accept minor formatting differences |
| R-14 | CLI headless mode may not handle all question types (multi-choice, file upload) | Low | Med | Define question schema with typed fields; headless config supports all types |
| R-15 | Webhook delivery failures in unreliable networks may cause missed notifications | Med | Med | Retry with backoff; events also visible in Temporal UI (feature 015) |

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
| 1.0 | April 1, 2026 | Product Manager | Initial requirements document. 7 requirements in MA domain. |

---

*End of Document*
