# Cross-Review: Test Engineer — REQ-PTAH-P7 + FSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **REQ Reviewed** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reviewed** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.0 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Approved** |

---

## Summary

This is the re-review following the v1.5 REQ and v2.0 FSPEC revisions. Both blocking findings from the previous review are fully resolved. All three medium findings are addressed. Both clarification questions are answered. Two new low-severity observations are noted for TSPEC authors — neither blocks TSPEC authoring.

---

## Previous Findings — Resolution Status

| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-01: Signal naming in FSPEC-DI-02 acceptance tests | High | ✅ Resolved | FSPEC v2.0 §11 confirms all signal names corrected: `lgtm` → `LGTM`, `task_done`+status → `TASK_COMPLETE`/`ROUTE_TO_USER`. §3.2 table, §3.3 flow, and AT-DI-02-01 through AT-DI-02-03 all use live signal names. |
| F-02: Four requirements missing FSPECs | High | ✅ Resolved | FSPEC-DI-03 (§5), FSPEC-RP-01 (§6), FSPEC-LG-01 (§7), and FSPEC-OB-01 (§8) are all present in v2.0 with the explicit schemas required for test derivation. |
| F-03: Missing ATs in FSPEC-DI-02 (idempotency, config absent, non-boolean config) | Medium | ✅ Resolved | AT-DI-02-07 (idempotency), AT-DI-02-08 (config absent), AT-DI-02-09 (non-boolean config) all added. |
| F-04: AT-DI-02-05 missing registry state assertion | Medium | ✅ Resolved | AT-DI-02-05 now explicitly asserts "the thread is NOT marked archived in the registry (thread remains in 'open' state)". |
| F-05: FSPEC-EX-01 missing ATs (duplicate mention_id, display_name default, hot-reload removal) | Medium | ✅ Resolved | AT-EX-01-06 (duplicate mention_id), AT-EX-01-07 (display_name defaults to id), AT-EX-01-08 (hot-reload de-registration) all added. |
| F-06: No test doubles defined for Discord MCP or filesystem | Low | 🔵 Deferred to TSPEC | TSPEC scope item. Not a FSPEC blocker. |
| F-07: REQ-NF-10 observability criterion is human-review only | Low | ✅ Resolved | FSPEC-OB-01 defines 10 required log events with explicit field schemas, enabling automated testing. |

**Previous clarification questions:**
- **Q-01** (archive failure retry): Answered by BR-DI-02-07 — archive failures are retryable; registry is not updated on failure; retry is user-initiated by re-triggering the workflow. ✅
- **Q-02** (exact color integers): Answered by FSPEC-DI-03 §5.2 — exact hex integers defined per type: routing=`0x5865F2`, resolution=`0x57F287`, error=`0xED4245`, escalation=`0xFEE75C`. ✅

---

## New Findings

### F-08 (Low) — FSPEC-DI-03 §5.6: Embed creation fallback format is undefined

**Affected:** FSPEC-DI-03 §5.6

Error scenario: "Discord MCP embed creation fails → Fall back to posting a plain text equivalent of the metadata message (do not silently skip)."

The fallback behavior is correctly specified (post something; do not silently skip), but the "plain text equivalent" format is not defined. For a test verifying this fallback:
- We can assert that a message was posted to the thread (not silently dropped) ✅
- We cannot assert the exact content of the fallback message, as it is unspecified

In practice, the most important assertion — that the message is not silently dropped — is testable. The exact fallback format is an engineering implementation detail. This is Low and does not block TSPEC authoring.

**Action required (optional):** If precise fallback content is important for operator experience, add a note to FSPEC-DI-03 §5.6 specifying the plain-text fallback format per embed type (e.g., "Routing to {display_name}" for routing notification fallback). If exact content is not critical, a unit test asserting "at least one message was posted" is sufficient.

---

### F-09 (Low) — FSPEC-OB-01 has no log event for PDLC dispatcher actions

**Affected:** FSPEC-OB-01 §8.2

FSPEC-LG-01 §7.3 enumerates `dispatcher` as a valid component (scope: "PDLC phase dispatch and state machine"). However, FSPEC-OB-01 defines no required log event (EVT-OB-XX) for PDLC phase transitions.

The 10 defined events cover the routing lifecycle fully (trigger → match → invoke → respond → post → commit → archive/escalate/route). A PDLC phase transition (e.g., moving from Phase 5 to Phase 7 for a given thread) is not observable from the log events defined in §8.2.

For an operator debugging a PDLC state machine issue — where the wrong skill was invoked for a given PDLC phase — the log trail would show which agent was invoked (EVT-OB-03) but not why that phase/agent was selected. This is a coverage gap for the `dispatcher` component.

This is Low because: (1) PDLC dispatch failures would still surface as routing errors (EVT-OB-10), and (2) most observable symptoms are covered. But an engineer authoring TSPEC for the dispatcher component should be aware there is no required observability event for phase transitions.

**Action required (for TSPEC):** TSPEC for the `dispatcher` component should define at minimum one `[ptah:dispatcher] INFO` log event for phase transitions (e.g., "Thread {thread_id} — dispatching to PDLC phase {phase_name}. Agent: {agent_id}."). If the product manager agrees this is worth adding, a minor FSPEC-OB-01 amendment can be submitted; otherwise document the gap in the TSPEC.

---

## Positive Observations

The v2.0 FSPEC is substantially stronger than v1.0 from a testability standpoint:

- **FSPEC-DI-03 §5.2 color integers** are exact (`0x5865F2`, `0x57F287`, etc.) — every embed color is a deterministic, testable value with no engineering discretion. This directly enables property-based assertions.
- **FSPEC-LG-01 §7.3 component enumeration** (8 values, exhaustive) turns what was an untestable "every log line has a component" criterion into a concrete closed-set assertion: the test fixture can regex-match the component token against the enumerated list.
- **FSPEC-RP-01 §6.2 error scenario enumeration** (ERR-RP-01 through ERR-RP-05) gives each error type a stable ID. AT-OB-01-02 correctly references `ERR-RP-01` in the expected log entry — this is the right pattern: error type IDs travel from FSPEC to log format to test assertion.
- **FSPEC-OB-01 §8.3 lifecycle completeness table** is an excellent self-audit: it maps each "what an operator needs to know" requirement to specific log event IDs. This table doubles as a test coverage matrix.
- **AT-EX-01-08 (hot-reload de-registration)** is precisely worded — it specifies both the setup state and the triggering action, making it unambiguous to implement as an integration test.
- **AT-DI-02-06 (ordering guarantee)** and the new **AT-DI-02-07 (idempotency)** are the two hardest correctness properties to discover in code review. Their inclusion in the FSPEC guarantees they get tested.

---

## Recommendation

**Approved.**

All blocking findings from the previous "Needs revision" recommendation are resolved. The REQ v1.5 and FSPEC v2.0 are ready for TSPEC authoring. Two new low-severity observations (F-08, F-09) are noted for the TSPEC author's awareness — neither requires a FSPEC revision before TSPEC work begins.

F-06 (test doubles for Discord MCP and filesystem) remains a TSPEC-level action item: the TSPEC must define protocol-based fakes for both boundaries before test scripts can be written.

---

## Addendum: Test Engineer Response to Backend Engineer FSPEC Review

| Field | Detail |
|-------|--------|
| **Addendum Date** | March 16, 2026 |
| **Responding to** | [CROSS-REVIEW-backend-engineer-FSPEC.md](./CROSS-REVIEW-backend-engineer-FSPEC.md) |
| **BE Recommendation** | Approved with minor changes (F-02, F-03, F-04 require small FSPEC additions) |

---

### Testing Perspective on BE Findings

The Backend Engineer's FSPEC review identifies three protocol gaps that directly affect test design. Each is analyzed below.

#### BE-F-02 — `archiveThread` missing from `DiscordClient` protocol

**Test Engineer perspective: Agree — this is the single most important protocol addition for testability.**

My F-06 finding deferred Discord MCP fake design to the TSPEC. BE-F-02 now confirms the gap is concrete: `archiveThread(threadId: string): Promise<void>` must be added to the `DiscordClient` protocol. Without this method on the protocol, unit tests for the archive path (AT-DI-02-01 through AT-DI-02-09) cannot use a fake implementation — they would require a real Discord connection.

Once `archiveThread` is on the `DiscordClient` protocol, all nine FSPEC-DI-02 acceptance tests map cleanly to unit tests using a `FakeDiscordClient`. This unblocks the entire FSPEC-DI-02 test surface.

**Recommendation for FSPEC update:** Add the sentence BE requested to FSPEC-DI-02 §3.5 Inputs and Outputs: "`DiscordClient.archiveThread(threadId: string): Promise<void>` is a Phase 7 deliverable — this method does not exist in the current protocol and must be added."

**Impact on TSPEC fake design:** The `FakeDiscordClient` must:
1. Record `archiveThread` calls (to assert AT-DI-02-01 and AT-DI-02-03 — that the call was made exactly once)
2. Support a configurable error injection mode (to assert AT-DI-02-04 — archive failure leaves registry unchanged)
3. Support a "thread already archived in Discord" mode returning success (to assert AT-DI-02-03 idempotency at the Discord API level, distinct from the registry-level idempotency in AT-DI-02-07)

---

#### BE-F-03 — `Logger` interface requires protocol change, not per-call-site string concatenation

**Test Engineer perspective: Agree — and this determines whether Logger fakes are trivial or non-trivial.**

If the FSPEC-LG-01 component prefix is implemented as per-call-site string concatenation (Option A implied by misreading the spec), then:
- `Logger.info("[ptah:router] message")` is called in every router method
- A fake Logger can capture the raw string — testable, but fragile (component name is in the message body, not a structured field)
- FSPEC-OB-01 EVT-OB-XX assertions must parse the component out of the message string — regex-dependent

If implemented as a scoped factory (`Logger.forComponent(component): Logger`, BE Option B):
- `routerLogger.info("message")` where `routerLogger = logger.forComponent("router")`
- A fake Logger can capture `{ component, level, message }` as structured data — testable without regex
- FSPEC-OB-01 assertions become `expect(capturedEntry.component).toBe("router")` — clean and unambiguous
- **This is the better design for testing.** The closed-set assertion over `FSPEC-LG-01 §7.3` component values becomes `expect(VALID_COMPONENTS).toContain(entry.component)` — deterministic.

**Recommendation for FSPEC update:** Add the note BE requested to FSPEC-LG-01 §7.5 Business Rules: "The `[ptah:{component}]` prefix is a Logger-level concern, not a per-call-site string. The Logger protocol must support component-scoped instances (e.g., via a `forComponent(component: string): Logger` factory) so that the component is a structured field, not an embedded string in the message."

**Impact on TSPEC fake design:** The `FakeLogger` must:
1. Implement the factory method (if Option B is chosen by BE)
2. Capture log entries as `{ component: string, level: 'info'|'warn'|'error'|'debug', message: string }[]`
3. Expose a `entries(component?)` query method to filter by component for FSPEC-OB-01 acceptance test assertions

---

#### BE-F-04 — `DiscordClient` has no `postPlainMessage` method

**Test Engineer perspective: Agree — required for FSPEC-DI-03 agent-response plain-text tests.**

FSPEC-DI-03 §5.4 specifies that after Phase 7, agent response text is posted as plain text (not embeds). Without `postPlainMessage(threadId, content)` on the `DiscordClient` protocol, the behavior described in FSPEC-DI-03 §5.4 is not testable in isolation — there is no fake-able method to assert was called.

This also affects the embed fallback path in FSPEC-DI-03 §5.6 (my F-08 finding). The fallback assertion "at least one message was posted to the thread" requires a protocol method that `FakeDiscordClient` can record. `postPlainMessage` is that method.

**Recommendation for FSPEC update:** Add the note BE requested to FSPEC-DI-03 §5.4: "A new `postPlainMessage(threadId: string, content: string): Promise<void>` method must be added to the `DiscordClient` protocol. This is a Phase 7 deliverable."

**Impact on TSPEC fake design:** The `FakeDiscordClient` must:
1. Record `postPlainMessage` calls (to assert FSPEC-DI-03 §5.4 — agent responses use plain text)
2. Support configurable failure injection (to assert FSPEC-DI-03 §5.6 fallback — though the fallback path calls `postPlainMessage` for the fallback itself, so the fake must support both success and failure modes per call)

---

#### BE Q-01 — Discord MCP vs. discord.js: which client handles archiving?

**Test Engineer perspective: Relevant to fake scope, but does not block testability.**

From a testing standpoint, either answer results in the same fake interface requirement: `DiscordClient` (the protocol) gains `archiveThread`. Whether the concrete implementation is `DiscordJsClient` extended, or a new MCP-based client, the fake is the same. The TSPEC should resolve this question and document it so the fake implementation target is unambiguous.

#### BE Q-02 — `archive_on_resolution` key nesting

**Test Engineer perspective: Low impact on tests. Test fixtures use the full JSON key path directly.**

Both `orchestrator.archive_on_resolution` (FSPEC) and camelCase variants map to the same test fixture: `{ orchestrator: { archive_on_resolution: false } }`. The TSPEC should confirm the canonical key path and tests should use a typed config fixture (not raw strings) to avoid this ambiguity at the test level.

---

### Updated TSPEC Action Items (F-06 Addendum)

The following TSPEC-level requirements now have additional scope from the BE review:

| Item | Source | TSPEC Action |
|------|--------|-------------|
| `FakeDiscordClient.archiveThread` | BE-F-02 | Must record calls, support error injection, support "already archived" mode |
| `FakeDiscordClient.postPlainMessage` | BE-F-04 | Must record calls, support error injection |
| `FakeLogger` structured capture | BE-F-03 | Must capture `{ component, level, message }[]`; implement `forComponent()` if protocol uses factory pattern |
| Discord MCP vs. discord.js clarification | BE-Q-01 | TSPEC must document which concrete class implements the protocol and scope the fake accordingly |

---

### Updated Recommendation

**Approved — overall status unchanged. Three FSPEC additions requested by BE are also recommended from a testing perspective.**

The three additions requested by BE (to FSPEC-DI-02 §3.5, FSPEC-LG-01 §7.5, and FSPEC-DI-03 §5.4) are all testability improvements, not just architectural notes. They convert implicit protocol assumptions into explicit TSPEC scope items. These additions should be made to the FSPEC before TSPEC authoring begins.

The FSPEC v2.0 acceptance tests (AT-DI-02-01 through AT-EX-01-08, AT-OB-01-01 through AT-OB-01-03) remain correct and sufficient. No acceptance test revisions are needed. The test engineer approves proceeding to TSPEC once the three minor FSPEC additions are in place.
