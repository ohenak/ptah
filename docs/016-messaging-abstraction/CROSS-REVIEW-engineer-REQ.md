# Cross-Review: Engineer — REQ-016 Messaging Abstraction

| Field | Detail |
|-------|--------|
| **Reviewer** | Senior Full-Stack Engineer (eng) |
| **Document Reviewed** | [016-REQ-messaging-abstraction.md](016-REQ-messaging-abstraction.md) |
| **Date** | 2026-04-03 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Webhook Human-in-the-Loop Callback Mechanism Is Unspecified (High)

**REQ-MA-04** states: *"Human-in-the-loop handled via a callback endpoint that sends a Temporal Signal."*

**Problem:** There is no specification of how this callback endpoint is exposed. Temporal Signals require an external caller to invoke the Temporal Client with a workflow ID and signal name. For the webhook provider to support human-in-the-loop, one of the following is required:

1. Ptah embeds an HTTP server that receives the callback and translates it to a Temporal Signal — adds a server dependency, port binding, and TLS concerns not present today.
2. The caller is expected to invoke the Temporal API directly — this pushes implementation burden onto downstream integrators and is undocumented.
3. A polling mechanism on the workflow side — breaks the signal-driven architecture established in feature 015.

**Assumption A-13** treats this as solved by Temporal Signals alone, but Temporal Signals are *receivers*, not *transmitters*. Something must POST to the Temporal server. This gap is a significant engineering blocker.

**Required:** Specify whether Ptah embeds an HTTP server for webhook callbacks, and if so: address port configuration, TLS strategy, and how the workflow ID is threaded through the callback URL.

---

### F-02 — Slack Events API Requires a Publicly Accessible HTTPS Endpoint (High)

**REQ-MA-05** mentions: *"receives human replies via Slack events."*

**Problem:** Slack's Events API uses an outbound webhook model — Slack POSTs events to a URL you provide. This URL **must** be publicly accessible over HTTPS and verified by Slack's challenge handshake. This is architecturally opposite to Discord, which uses a persistent WebSocket connection that works from any network.

Consequences:

- Ptah running locally or in an internal CI environment cannot receive Slack events without a tunnel (e.g., ngrok) or a publicly deployed relay.
- This requirement dramatically increases the operational burden for the Slack provider compared to Discord.
- A challenge/verification endpoint must be exposed at startup to pass Slack's URL verification.

The REQ contains no mention of this constraint, tunnel strategy, or relay architecture. Teams evaluating Ptah for Slack will hit this immediately.

**Required:** Either (a) document this constraint explicitly and specify a deployment requirement for Slack, or (b) add an alternative inbound mechanism (Slack Socket Mode uses WebSockets and avoids the public URL requirement — this should be evaluated as the default).

---

### F-03 — Thread ID Type Safety Gap Across Providers (Medium)

The current codebase uses Discord snowflake strings as thread IDs throughout (`string` typed but semantically a snowflake). Different providers use incompatible ID formats:

| Provider | Thread ID Format |
|----------|-----------------|
| Discord | Numeric snowflake: `"1234567890123456789"` |
| Slack | Channel + timestamp: `"C01234ABC/1712345678.000100"` |
| CLI | Synthesized label: `"feature-auth-phase-tspec"` |
| Webhook | UUID or slug assigned by Ptah |

The `MessagingProvider` interface referenced in REQ-MA-01 must define a provider-agnostic thread handle type (e.g., an opaque `ThreadHandle` branded type) rather than passing raw strings between layers. Without this, the orchestrator layer accumulates provider-specific string parsing logic that defeats the abstraction.

**Required:** REQ-MA-01 or REQ-MA-07 should specify that thread handles are opaque to the orchestrator — the provider owns creation and interpretation of thread identifiers.

---

### F-04 — Agent Registry `byMentionId` Lookup Unaddressed for Non-Discord Providers (Medium)

The agent registry maintains a `byMentionId: Map<string, RegisteredAgent>` keyed on Discord snowflake IDs. The routing engine uses `getAgentByMentionId(roleId)` to resolve which agent was mentioned in a message.

For Slack, mention IDs are alphanumeric (e.g., `U01234ABC`, `S01234ABC` for user groups). REQ-MA-06 correctly removes the `/^\d+$/` snowflake validation, but neither REQ-MA-01 nor REQ-MA-06 addresses how mention routing works after the abstraction:

- How does the routing engine identify which agent was mentioned in a Slack message?
- Does `mention_id` become a provider-specific field (Discord uses snowflake, Slack uses Slack user/group ID)?
- For CLI and webhook providers, is mention routing irrelevant (agents are routed by signal content, not @mention)?

**Required:** REQ-MA-01 or REQ-MA-06 should specify the mention resolution contract for each provider, or explicitly state that mention-based routing is a Discord/Slack-only concern and other providers use a different routing mechanism.

---

### F-05 — REQ-MA-02 Acceptance Criterion Creates an Unverifiable Constraint (Medium)

REQ-MA-02 states: *"All existing Discord integration tests pass without modification."*

After the refactoring, the `DiscordClient` interface used in tests will be wrapped inside `DiscordMessagingProvider`, which implements `MessagingProvider`. The `FakeDiscordClient` test double will need to be injected into `DiscordMessagingProvider`, not into the orchestrator directly. This is a structural change to the test setup.

"Without modification" is therefore not achievable in the strict sense. The tests will still validate identical behavior, but their construction will change (the DI wiring changes).

**Required:** Revise the acceptance criterion to: *"Discord provider behavior is identical to pre-abstraction — all existing behaviors are covered by passing tests."* Remove "without modification" to avoid creating false constraints that impede the refactor.

---

### F-06 — `MessagingProvider` and `ResponseFormatter` Relationship Undefined (Medium)

REQ-MA-01 defines `MessagingProvider` as the interface for all messaging operations. REQ-MA-07 introduces a separate `ResponseFormatter` interface for format conversion.

The current code has `ResponsePoster` using `DiscordClient` internally. It is unclear from the requirements:

1. Does `ResponseFormatter` live inside each `MessagingProvider` implementation (i.e., a provider both sends and formats)?
2. Is `ResponseFormatter` a separate collaborator injected into `MessagingProvider`?
3. Does the orchestrator call `formatter.format(event)` → `provider.post(formattedResult)` in sequence?

This ambiguity will result in divergent interpretations during TSPEC. The two-interface design is reasonable architecturally, but their relationship and ownership must be stated explicitly.

**Required:** Specify whether `ResponseFormatter` is a method on `MessagingProvider` (collapsed interface), or a separate interface composed with it, or purely an internal detail of each provider's implementation.

---

### F-07 — CLI Provider Interactive Mode Incompatible with Temporal Worker Context (Low)

REQ-MA-03 states that interactive CLI mode prompts via stdin. Temporal activity workers are background worker processes. Attaching stdin interactively to a Temporal worker is non-trivial and not standard practice — the worker is typically started as a daemon.

**Required:** Clarify whether CLI interactive mode requires Ptah to run in a foreground single-process mode (no Temporal worker subprocess) or specify how stdin is made available to the Temporal activity execution context.

---

### F-08 — Config Migration Path from Existing `discord` Section Not Addressed (Low)

REQ-MA-06 introduces a `messaging` top-level config section. Existing `ptah.config.json` files use a top-level `discord` section. The migration path is unspecified:

- Is the old `discord` section accepted as an alias for backward compatibility?
- Does the config loader emit a deprecation warning on old-format configs?
- What is the migration timeline?

This is especially important since REQ-MA-02 requires no behavior change for existing Discord users.

**Required:** State whether backward compatibility via config aliasing is in scope, or whether users must manually update their config files. If aliasing is in scope, note it as a requirement.

---

## Clarification Questions

**Q-01:** For the webhook provider human-in-the-loop: does Ptah embed an HTTP server to receive callbacks, or does the integration contract require the caller to invoke the Temporal gRPC/HTTP API directly? If embedded server: what is the port configuration strategy?

**Q-02:** For the Slack provider: has Slack Socket Mode been evaluated as an alternative to the Events API? Socket Mode uses an outbound WebSocket connection (same model as Discord) and eliminates the requirement for a public HTTPS endpoint. This would materially lower the operational bar for Slack adoption.

**Q-03:** Is `ResponseFormatter` intended to be a distinct interface from `MessagingProvider`, or should it be collapsed into the provider (each provider formats its own output internally)? The former gives format-reuse across providers; the latter keeps provider implementations simpler.

**Q-04:** For providers where mention-based routing is not applicable (CLI, webhook), how does the orchestrator determine which agent to route a response to? Is this handled entirely by Temporal Signal content, removing the need for mention parsing?

---

## Positive Observations

- The motivation section (Section 1) is precise and grounds the requirement in concrete current-code behavior — this is directly actionable for TSPEC. Naming specific files and validation patterns (`/^\d+$/`) gives engineering immediate context.
- The phased priority (P0 vs P1) is sensible: Discord refactor + CLI + config abstraction first, then Slack/webhook. This reduces risk by validating the interface design before adding the more complex providers.
- Assumption A-14 (CLI headless mode covers CI/CD) is appropriately scoped and explicitly flagged as extensible — this is the right level of scope control.
- Scope boundary 3.2 is well-defined. Excluding multi-provider, Teams, and email prevents scope creep while keeping the interface forward-compatible.
- The risks table correctly identifies R-14 (CLI headless question types) as Medium impact — this connects directly to the question schema that will need to be part of the `MessagingProvider` contract.

---

## Recommendation

**Needs revision.** Five findings are High or Medium severity:

- **F-01 (High):** Webhook callback mechanism must be specified before TSPEC can design the webhook provider.
- **F-02 (High):** Slack Events API public endpoint constraint is a significant operational blocker; Socket Mode should be evaluated as the default.
- **F-03 (Medium):** Thread handle type strategy must be stated in the interface contract.
- **F-04 (Medium):** Mention resolution for non-Discord providers must be addressed.
- **F-05 (Medium):** REQ-MA-02 acceptance criterion must be revised to remove the infeasible "without modification" constraint.
- **F-06 (Medium):** `MessagingProvider` / `ResponseFormatter` relationship must be specified.

The author must address F-01 through F-06 and route the updated REQ back for re-review before TSPEC authoring begins.
