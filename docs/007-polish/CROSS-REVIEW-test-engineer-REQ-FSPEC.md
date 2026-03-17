# Cross-Review: Test Engineer — REQ-PTAH-P7 + FSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **REQ Reviewed** | [007-REQ-polish.md](./007-REQ-polish.md) v1.2 |
| **FSPEC Reviewed** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v1.0 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

Two prior reviews (Product Manager, Backend Engineer) have already surfaced the high-severity issues in these documents. This review focuses exclusively on **testability** — whether the requirements and spec provide enough precision for an engineer to write tests without further clarification. Two blocking issues from a testing perspective overlap with BE findings (signal naming, pending FSPECs); three new medium findings identify gaps in the FSPEC's own acceptance test coverage.

---

## Findings

### F-01 (High) — FSPEC-DI-02 acceptance tests are written against a non-existent signal contract

**Affected:** FSPEC-DI-02 §3.2, §3.3, §3.8 (AT-DI-02-01 through AT-DI-02-06)

Every acceptance test in FSPEC-DI-02 uses signal type names (`lgtm`, `task_done`, `status: DONE`, `status: BLOCKED`) that do not exist in the live `RoutingSignal` contract (confirmed by BE review F-02: live contract uses `LGTM`, `TASK_COMPLETE`, `ROUTE_TO_USER` — no sub-status field). This is not merely a naming cosmetic — the sub-status pattern (`task_done` with `status: BLOCKED`) maps to a different top-level signal type in production (`ROUTE_TO_USER`), so the test logic itself differs, not just the string literals.

Tests written against this FSPEC will require complete rewriting once the contract is reconciled. Any test that currently gates on `signal.type === 'task_done' && signal.status === 'BLOCKED'` will pass for the wrong reason against a mock and silently fail against production.

**Blocking:** Test cases cannot be correctly defined until signal type names and structure are resolved. This must be fixed in the FSPEC before TSPEC/test authoring begins.

**Action required:** Update FSPEC-DI-02 §3.2 signal table and §3.3 behavioral flow to use live signal names. Remove the `status` sub-field pattern; the BLOCKED case becomes `signal.type === 'ROUTE_TO_USER'` (or whichever live type maps to that intent).

---

### F-02 (High) — Four requirements have no FSPEC: acceptance criteria too vague for test derivation

**Affected:** REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10

The REQ correctly marks these four as "Pending FSPEC" (§7). From a testing perspective, the REQ acceptance criteria for these are insufficient to write any concrete test — even a placeholder:

| Requirement | Testability Blocker |
|-------------|---------------------|
| **REQ-DI-10** | AC says "title, color, and body fields appropriate to the message type" — but doesn't enumerate message types, colors, or field names. No test can verify "appropriate" without an explicit schema. |
| **REQ-RP-06** | AC says "at least one actionable suggestion" and "plain language" — but enumerates no error scenarios, no message templates, and no definition of what constitutes a non-recoverable error. Tests need exact input conditions and expected output copy. |
| **REQ-NF-09** | AC says every log line begins with `[ptah:{component}]` — but doesn't define valid component values. A test asserting `[ptah:orchestrator]` exists is easy; asserting that ALL components use the correct prefix requires knowing what components exist. |
| **REQ-NF-10** | "I can identify: triggering message, invoked agent, routing signal type, post-signal actions, and errors" — this is a human-review criterion, not an automated test. The log events and their formats are undefined. Automated testing requires a specific log schema. |

**Blocking for their respective TSPECs.** This is expected at this stage; documenting here so FSPEC authors are aware that the test engineer will need explicit schemas in the FSPECs before TSPEC acceptance tests can be drafted.

**Action required:** When FSPECs for these four requirements are authored, each must include:
- REQ-DI-10 FSPEC: embed type enumeration, per-type field schema (title string, color hex/int, body field names), and which Orchestrator events trigger each type
- REQ-RP-06 FSPEC: error scenario enumeration, exact message templates (or template patterns), and the definition of "actionable suggestion" per error type
- REQ-NF-09 FSPEC: full enumeration of valid `{component}` values and a complete compliant log line example
- REQ-NF-10 FSPEC: minimum required log event set with field definitions per event type

---

### F-03 (Medium) — FSPEC-DI-02 acceptance tests are missing three property-critical scenarios

**Affected:** FSPEC-DI-02 §3.8

The six acceptance tests (AT-DI-02-01 through AT-DI-02-06) cover the main happy path and the most obvious failure modes, but three properties with direct test implications are not covered:

**Missing AT: Idempotency — second resolution signal for an already-archived thread**

Business rule BR-DI-02-04 states: "Once a thread is marked archived in the registry, any subsequent resolution signal targeting the same thread ID is a no-op." This is a correctness invariant — a second call to the Discord MCP archive endpoint for the same thread must NOT occur. There is no acceptance test verifying:
- The registry is checked before the MCP call
- Zero MCP calls are made on the second signal
- No error is logged for the duplicate signal

**Missing AT: Config-absent defaults to true**

§3.6 error scenarios specify: "Config key `archive_on_resolution` is absent → Default to `true`. Proceed with archiving." This is a behavioral invariant with a specific outcome (archive happens) but there is no acceptance test verifying the default behavior. The test should confirm archiving occurs when the key is entirely absent from config (not just when it is `true`).

**Missing AT: Non-boolean config value defaults to true with warning**

§3.6 specifies: "Config key `archive_on_resolution` is present but not a boolean → log warning and default to true." No acceptance test for this scenario. The warning log message format is also specified, making this precisely testable.

**Action required:** Add three acceptance tests to FSPEC-DI-02 §3.8:
- AT-DI-02-07: Idempotency — second DONE signal for archived thread produces zero MCP calls and no error
- AT-DI-02-08: Config key absent → archiving proceeds (same outcome as `true`)
- AT-DI-02-09: Config key is non-boolean string → warning logged, archiving proceeds

---

### F-04 (Medium) — AT-DI-02-05 (archiving failure) is missing the registry state assertion

**Affected:** FSPEC-DI-02 §3.8 AT-DI-02-05

AT-DI-02-05 currently verifies:
1. A warning is logged
2. The Orchestrator continues processing other threads

It does NOT verify that the **thread is NOT marked as archived in the registry** after MCP failure. This omission is significant because the registry state determines future behavior: if the thread is incorrectly marked archived after a failed archive call, then any subsequent resolution signal for that thread (e.g., a retry from the user) would be silently dropped by the no-re-archiving check (BR-DI-02-04), with no user feedback and no second archive attempt.

The correct post-failure state is that the registry remains unchanged (thread is "open"), so the archiving can be retried if the user retriggers the flow. This must be an explicit test assertion.

**Action required:** Add a third THEN clause to AT-DI-02-05:
```
AND the thread registry is NOT updated (thread remains in "open" state)
```

---

### F-05 (Medium) — FSPEC-EX-01 acceptance tests missing coverage for three specified behaviors

**Affected:** FSPEC-EX-01 §4.10

The five acceptance tests (AT-EX-01-01 through AT-EX-01-05) cover the primary registration and validation paths. Three specified behaviors in the FSPEC have no acceptance test:

**Missing AT: Duplicate `mention_id` (BR-EX-01-04)**

BR-EX-01-04 specifies that duplicate `mention_id` entries cause the second entry to be skipped with a warning. The FSPEC includes the exact log message format for this case (§4.8). There is an AT for duplicate `id` (AT-EX-01-05) but no equivalent for duplicate `mention_id`. Ambiguous @mention routing is a correctness-critical failure mode — it must have an acceptance test.

**Missing AT: `display_name` defaults to `id`**

BR-EX-01-01 is implicit about this and §4.2 specifies "Defaults to `id` if absent." No acceptance test verifies that an agent registered without `display_name` uses the `id` value in log output and Discord embeds. This is a simple unit test but without an AT it could be silently dropped from implementation.

**Missing AT: Hot-reload de-registration (§4.9 edge case)**

§4.9 specifies: "Config is hot-reloaded and an existing agent entry is removed → Agent is de-registered from the live registry. Future routing signals targeting that agent ID are treated as unknown-agent errors." This is a runtime behavioral change (previously valid routing target becomes invalid mid-session) with user-visible consequences (error posted to thread). It needs an acceptance test.

**Action required:** Add to FSPEC-EX-01 §4.10:
- AT-EX-01-06: Duplicate `mention_id` — second entry skipped with warning; first entry remains registered and responds to @mentions
- AT-EX-01-07: `display_name` absent — agent logs and embeds use `id` as display name
- AT-EX-01-08: Hot-reload removes agent — subsequent `route_to: {removed-id}` signals produce an unknown-agent error (logged + thread error message)

---

### F-06 (Low) — Neither FSPEC defines test doubles for Discord MCP or filesystem dependencies

**Affected:** FSPEC-DI-02 (Discord MCP archive call), FSPEC-EX-01 (filesystem access for skill/log files)

FSPEC-DI-02 requires calling the Discord MCP archive operation and FSPEC-EX-01 requires reading files from the filesystem — both are external I/O boundaries. Neither FSPEC identifies the test double (fake/stub) needed to test error paths in isolation.

Without a defined fake Discord MCP interface, error scenario tests (AT-DI-02-05: MCP failure; §3.6 error table) must be E2E tests that actually invoke Discord. This pushes coverage that should be at the unit/integration level up to E2E, making these tests slow, brittle, and dependent on Discord API availability.

Similarly for FSPEC-EX-01: verifying that a missing skill file causes the agent to be skipped (AT-EX-01-03) needs a fake filesystem or temp directory, otherwise the test modifies real files on disk.

This is not blocking FSPEC approval, but the TSPEC must define protocol-based fakes for both boundaries before test scripts can be written.

**Action required (for TSPEC):** TSPEC for FSPEC-DI-02 must define a `DiscordMcpClient` protocol/interface with at least an `archiveThread(threadId: string)` method and a corresponding `FakeDiscordMcpClient` that supports success, "already archived", "not found", "missing permissions", and error responses. TSPEC for FSPEC-EX-01 must define a `FileSystem` protocol with `exists(path)` and `readFile(path)` methods and a fake for injecting missing/unreadable file scenarios.

---

### F-07 (Low) — REQ-NF-10: observability criterion is a human-review test, not an automated one

**Affected:** REQ-NF-10 acceptance criteria

The THEN clause — "I can identify: the triggering message, the invoked agent, the routing signal type, post-signal actions, and errors" — describes a human reading a log file. This is a valid acceptance criterion for a product requirement (log readability is real UX), but it does not map to an automated test. Automated tests for REQ-NF-10 would require:

1. A defined set of log events with exact message patterns
2. A test fixture that runs a routing cycle and captures log output
3. Assertions that each required event appears with the required fields

Without a structured log event schema in the FSPEC (blocked by F-02), this requirement can only be manually validated. This is acceptable for a P1 requirement but should be explicitly acknowledged in the FSPEC so engineering doesn't attempt to write automated tests against an under-defined spec.

**Action required:** No REQ change needed. When the FSPEC for REQ-NF-10 is authored, include a minimum required log event table (event name, component, required fields, example log line) to enable automated testing.

---

## Clarification Questions

### Q-01 — FSPEC-DI-02: After MCP failure, can the user retry archiving?

AT-DI-02-05 specifies the thread is left open after archive failure. Is there a user-facing mechanism to retry archiving (e.g., posting a new resolution-signal-bearing message to the thread), or is the thread permanently left open after a failure? The test for this scenario depends on whether the failure state is recoverable. If retryable, the registry must NOT be updated on failure (already captured in F-04) and a subsequent resolution signal must trigger a new archive attempt — which needs its own test.

### Q-02 — REQ-DI-10 / FSPEC pending: Will embed specs include exact color values?

Discord embed colors are integers (hex). Tests asserting embed content need deterministic expected values. When the FSPEC for REQ-DI-10 is authored, will it specify exact color integers per embed type (e.g., routing = 0x5865F2, error = 0xED4245), or leave color to engineering discretion? If the latter, there is no testable color assertion — only field presence tests. Clarifying this shapes whether color is a testable property or an implementation detail.

---

## Positive Observations

- **FSPEC-DI-02 §3.6 (Error Scenarios)** is the strongest section in both documents from a testability standpoint. Each scenario maps 1:1 to a unit test: input condition (error type), expected log message (with format specified), expected system behavior (no crash, thread left open). This level of precision is exactly what test authoring needs.
- **BR-DI-02-03 (non-blocking) and BR-DI-02-04 (no re-archiving)** are stated as explicit named rules with clear semantics — each becomes a testable property (`archiving failure must not affect routing cycle completion` and `second resolution signal for same thread must produce zero MCP calls`).
- **AT-DI-02-06 (ordering guarantee)** is an excellent acceptance test to include — it captures a temporal ordering invariant (`content posted BEFORE archive call`, `commits complete BEFORE archive call`) that is easy to violate in async implementations and hard to discover in code review.
- **REQ-RP-06's negative criterion** — "does not expose raw exception messages, stack traces, or internal IDs" — is a well-formed negative property that maps cleanly to a unit test: inject an error with a stack trace, assert the posted Discord message does NOT contain the stack trace string.
- **FSPEC-EX-01 §4.3 (Orchestrator Startup Behavior)** validation steps are enumerated independently (missing field, invalid id format, missing skill file, missing log file, invalid mention_id) — each step is a discrete unit test with a clear input and expected skip-with-log output. This is exactly the right level of specificity for test authoring.
- **REQ-NF-08 acceptance criteria (v1.2)** use the full WHO/GIVEN/WHEN/THEN format with specific verifiable outcomes ("routing signals with route_to targeting the new agent ID resolve correctly") — these are testable without further clarification.

---

## Recommendation

**Needs revision.**

Two blocking findings must be resolved before TSPEC/test authoring can begin:

1. **F-01** — FSPEC-DI-02 acceptance tests and behavioral flow must be rewritten to use the live signal names (`LGTM`, `TASK_COMPLETE`) and remove the `status` sub-field pattern. Tests written against the current FSPEC are incorrect by construction.

2. **F-02** — FSPECs for REQ-DI-10, REQ-RP-06, REQ-NF-09, and REQ-NF-10 must be authored with explicit schemas (embed types, error templates, component enumeration, log event set) before any test cases can be derived for those requirements.

Medium findings F-03, F-04, and F-05 are straightforward FSPEC additions (missing acceptance tests) that should be incorporated when the FSPEC is revised for F-01. F-06 is a TSPEC-level concern; the TSPEC author should define protocol-based fakes for Discord MCP and filesystem before writing test scripts. F-07 is informational — no document change needed, but the pending FSPEC should address it proactively.

Once F-01 and F-02 are resolved, route the updated FSPEC back to `qa` for re-review before TSPEC authoring begins.
