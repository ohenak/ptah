# Cross-Review: Engineer — REQ-016 Messaging Abstraction

| Field | Detail |
|-------|--------|
| **Reviewer** | Senior Full-Stack Engineer (eng) |
| **Document Reviewed** | [016-REQ-messaging-abstraction.md](016-REQ-messaging-abstraction.md) |
| **Version Reviewed** | v1.2 (re-review following v1.0 findings) |
| **Date** | 2026-04-07 |
| **Recommendation** | **Approved with minor changes** |

---

## Re-Review Summary

This is a re-review of REQ v1.2 following the original engineer review of v1.0 (2026-04-03), which identified 2 High and 4 Medium and 2 Low findings (F-01 through F-08). All 8 findings from the v1.0 review have been addressed in v1.1/v1.2. One new Low-severity residual concern is noted below.

---

## Finding Resolution Status (from v1.0 Review)

| # | Original Finding | Severity | Resolution |
|---|-----------------|----------|------------|
| F-01 | Webhook callback mechanism unspecified | High | ✅ Resolved — REQ-MA-04 now specifies embedded HTTP callback server on configurable port (default 8765), `callback_url` in outgoing payload, and TLS delegated to reverse proxy |
| F-02 | Slack Events API requires public HTTPS endpoint | High | ✅ Resolved — REQ-MA-05 now mandates Slack Socket Mode (outbound WebSocket); Events API explicitly out of scope; "No public HTTPS URL required" in acceptance criteria |
| F-03 | Thread ID type safety across providers | Medium | ✅ Resolved — REQ-MA-01 now specifies opaque `ThreadHandle` strategy: "the provider owns creation and interpretation of thread identifiers; the orchestrator never constructs or parses them" |
| F-04 | Agent registry mention routing for non-Discord providers | Medium | ✅ Resolved — REQ-MA-06 now specifies per-provider mention routing: Discord uses numeric snowflakes, Slack uses alphanumeric IDs, CLI/webhook route via Temporal Signal `agent_id` field |
| F-05 | REQ-MA-02 "without modification" constraint | Medium | ✅ Resolved — REQ-MA-02 now states "test wiring may change structurally…but behavior coverage must be complete"; hard constraint removed |
| F-06 | `MessagingProvider` / `ResponseFormatter` relationship undefined | Medium | ✅ Resolved — REQ-MA-07 now specifies formatting as internal to each provider; no separate `ResponseFormatter` interface at orchestrator boundary |
| F-07 | CLI interactive mode incompatible with Temporal worker | Low | ✅ Resolved — REQ-MA-03 now specifies foreground process requirement ("Temporal worker runs in-process alongside the prompt loop") |
| F-08 | Config migration path from legacy `discord` section | Low | ✅ Resolved — REQ-MA-06 now specifies backward-compatible aliasing with deprecation warning |

---

## New Finding (v1.2)

### F-09 — LOW: CLI Headless Answer Schema Unspecified

**Requirement:** REQ-MA-03 (CLI Messaging Provider)
**Severity:** Low

REQ-MA-03 states that headless mode reads pre-configured answers from "an `answers` config section" but does not define the schema. The keying strategy for answers has a meaningful UX impact:

| Keying Approach | Tradeoff |
|----------------|---------|
| `{agentId}/{phaseId}` | Portable but requires knowing internal phase IDs at config time |
| Question text hash | Brittle — breaks if question text changes |
| Sequential index | Fragile for non-deterministic question ordering |

Without a conceptual schema in the REQ, TSPEC authors will make this decision independently. If the chosen schema is unintuitive or inconsistent with other headless CI tooling patterns, it becomes a usability issue that is expensive to change post-implementation (config file format changes are breaking changes for existing users).

**Note:** This concern was present in v1.0 but was not captured in the original engineer cross-review. It is raised here for completeness.

**Suggestion:** Add a one-line config schema example to REQ-MA-03's description — e.g., `"messaging.cli.answers": { "<agentId>/<phaseId>": "yes" }` — to guide TSPEC without over-specifying. Alternatively, explicitly delegate the schema decision to the TSPEC.

---

## Clarification Questions

**Q-01:** For the CLI headless answer schema: is the keying strategy intended to be determined by the engineer during TSPEC, or does the PM have a preference? A one-line conceptual example would eliminate ambiguity without constraining implementation.

**Q-02:** REQ-MA-04 specifies `callback_base_url` defaults to `http://localhost:{callback_port}`. In containerized or cloud-hosted deployments, the Ptah process is not reachable at `localhost` from the external system posting answers. Is it sufficient to document this as an operator concern (configure `callback_base_url` to the public endpoint), or should the requirement note this constraint explicitly?

---

## Positive Observations

All v1.0 concerns were addressed with precision:

- **ThreadHandle opaque contract (REQ-MA-01):** The language is unambiguous — "the provider owns creation and interpretation of thread identifiers; the orchestrator never constructs or parses them." This is exactly the level of specificity needed for TSPEC.
- **Webhook callback server (REQ-MA-04):** The embedded server design, configurable port, callback URL in payload, and TLS delegation are all now specified. A TSPEC author can design the implementation without guessing.
- **Socket Mode mandate (REQ-MA-05):** Choosing Socket Mode over Events API eliminates the public URL prerequisite that would have materially raised operational friction. Explicitly scoping out the Events API prevents scope creep.
- **Provider-specific mention routing (REQ-MA-06):** The three-way split (Discord snowflake / Slack alphanumeric / CLI+webhook via Signal `agent_id`) is clear and maps directly to an implementation decision tree.
- **Formatting as internal provider concern (REQ-MA-07):** Eliminating the separate `ResponseFormatter` interface simplifies the abstraction boundary. The orchestrator constructs a structured event; each provider formats it internally. Clean and testable.
- **Config backward compatibility (REQ-MA-06):** The deprecation warning pattern (`Legacy 'discord' config format detected…`) is a sensible migration UX.

---

## Recommendation

**Approved with minor changes.**

All High and Medium findings from v1.0 are resolved. F-09 is Low-severity and does not block TSPEC authoring — the TSPEC author can make the headless answer schema decision and document it there. Q-01 and Q-02 are informational; answers are welcome but not required before proceeding.

The PM may address F-09 with a one-line addition to REQ-MA-03 or explicitly note that the schema is delegated to TSPEC. Either resolution is acceptable. The document may proceed to TSPEC creation.

---

## Change Log

| Version | Date | Reviewer | Notes |
|---------|------|----------|-------|
| v1.0 review | 2026-04-03 | eng | 8 findings (F-01–F-08): 2 High, 4 Medium, 2 Low. Recommendation: Needs revision. |
| v1.2 re-review | 2026-04-07 | eng | All 8 findings resolved. 1 new Low finding (F-09: headless schema). Recommendation: Approved with minor changes. |

---

*End of Cross-Review*
