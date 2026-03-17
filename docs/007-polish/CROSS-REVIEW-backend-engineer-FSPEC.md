# Cross-Review: Backend Engineer — FSPEC-PTAH-PHASE7

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Approved** |

---

## Review Pass 3: March 16, 2026 (v2.1 — Final BE Review)

FSPEC v2.1 addresses all three blocking protocol scope notes (BE-F-02, BE-F-03, BE-F-04) and both additive findings from the REQ review (createCoordinationThread disposition, logger component fallback rule). **Recommendation upgraded from "Needs revision" → "Approved."**

### Prior Items — All Resolved

| Item | Status | Evidence |
|------|--------|----------|
| **BE-F-02** (HIGH): `archiveThread` missing from DiscordClient | ✅ Resolved | §3.5 protocol scope note added. Names the exact signature (`archiveThread(threadId: string): Promise<void>`), confirms discord.js capability (`ThreadChannel.setArchived(true)`), and specifies FakeDiscordClient requirements. |
| **BE-F-03** (HIGH): Logger component prefix must be Logger-level concern | ✅ Resolved | §7.5 BR-LG-01-05 added. Specifies `forComponent()` factory pattern, structured capture for FakeLogger, and explicitly forbids per-call-site string concatenation. |
| **BE-F-04** (MEDIUM): `postPlainMessage` missing from DiscordClient | ✅ Resolved | §5.4 protocol scope note added. Names the exact signature (`postPlainMessage(threadId: string, content: string): Promise<void>`), explains the discord.js distinction (`channel.send({ content })` vs `channel.send({ embeds })`), and specifies FakeDiscordClient requirements. |
| **BE-REQ-F-01** (MEDIUM): `createCoordinationThread()` disposition | ✅ Resolved | §5.4 disposition paragraph added. Uses Routing Notification embed (0x5865F2). `resolveColour()` eliminated entirely. |
| **BE-REQ-F-02** (LOW): Logger component enumeration incomplete | ✅ Resolved | §7.3 fallback rule added. Lists all six unlisted modules by name; assigns `orchestrator` component. Future additions require FSPEC amendment. |
| **Q-01**: Discord MCP vs. discord.js | ✅ Addressed | Protocol scope notes in §3.5 and §5.4 explicitly reference `DiscordJsClient` as the implementation target. TSPEC resolves concrete wiring. |
| **Q-02**: `archive_on_resolution` key nesting | ✅ Addressed | §2.3 Configuration Keys table confirms `orchestrator.archive_on_resolution` path. §3.6 error scenarios use this path consistently. |

---

## New Findings

### F-01 (Low) — `postSystemMessage()` disposition not specified after Phase 7

**Location:** FSPEC-DI-03 §5.4, §5.5

The live `DiscordClient` interface has `postSystemMessage(threadId: string, content: string): Promise<void>`, which internally wraps content in an embed (confirmed in `DiscordJsClient`). After Phase 7:

- Agent responses use the new `postPlainMessage()` method
- Orchestrator metadata uses the four defined embed types
- `postSystemMessage()` has no clear role — it is neither a plain message nor one of the four typed embeds

The FSPEC correctly specifies what the Phase 7 behavior should be (§5.4, §5.5 BR-DI-03-01), so there is no behavioral ambiguity. The question of whether `postSystemMessage()` is deprecated, removed, or repurposed is an engineering decision that falls to TSPEC.

**No FSPEC change needed.** Flagging for TSPEC awareness: the TSPEC should explicitly state the disposition of `postSystemMessage()` (deprecate/remove/repurpose) when designing the Phase 7 DiscordClient protocol changes.

---

### F-02 (Low) — Embed color values diverge from current constants (intentional, but TSPEC should note migration)

**Location:** FSPEC-DI-03 §5.2

The FSPEC defines new color integers for Phase 7 embed types:
- Routing Notification: `0x5865F2` (blurple)
- Resolution Notification: `0x57F287` (green)
- Error Report: `0xED4245` (red)
- User Escalation: `0xFEE75C` (yellow)

The live codebase (`response-poster.ts`) uses different constants:
- `COMPLETION_COLOUR = 0x1B5E20` (dark green)
- `ERROR_COLOUR = 0x9E9E9E` (gray)
- `PROGRESS_COLOUR = 0x424242` (dark gray)
- `DEFAULT_COLOUR = 0x757575`

This is clearly intentional — Phase 7 standardizes colors. **No FSPEC change needed.** Flagging for TSPEC awareness: all four existing color constants are replaced. The TSPEC should enumerate the old → new mapping explicitly so no stale constants survive.

---

## Positive Observations

- **Protocol scope notes are precise and actionable.** Each note names the exact TypeScript signature, references the underlying library capability (discord.js `ThreadChannel.setArchived(true)`, `channel.send({ content })`), and specifies FakeDiscordClient/FakeLogger requirements for testing. This is the ideal level of detail for unblocking TSPEC — zero ambiguity, zero engineering discretion needed on protocol shape.

- **BR-LG-01-05 (Logger scoping) is thorough.** It specifies the contract (Logger-level, not per-call-site), recommends the factory pattern (`forComponent()`), explains the testing benefit (structured `{ component, level, message }` capture vs. fragile regex), and explicitly states the TSPEC must enforce this contract. This single business rule eliminates what would have been the most contentious TSPEC design decision.

- **`createCoordinationThread()` disposition (§5.4) is well-reasoned.** The semantic argument — creating a coordination thread is an Orchestrator-initiated routing event — correctly maps to the Routing Notification embed type. The decision to eliminate `resolveColour()` entirely is clean: no optional color field in the new agent schema, no fallback-to-gray behavior, no per-agent color logic anywhere.

- **Fallback rule for logger components (§7.3) is pragmatic.** Listing all six unlisted modules by name ensures no ambiguity during implementation. Requiring a FSPEC amendment for future additions prevents scope creep without over-constraining.

- **FSPEC-DI-03 §5.6 embed fallback plain-text formats** provide exact testable strings for each embed type. This eliminates the TE-F-08 concern and gives engineering a concrete fallback contract.

- **FSPEC-RP-01 error message templates (§6.2)** remain the strongest section in the document. ERR-RP-01 through ERR-RP-05 each define exact field values with named placeholders — directly implementable as template literals in code.

- **Change log (§11) is comprehensive.** Each v2.1 change traces to the specific cross-review finding it addresses (BE-F-02, TE-F-08, etc.). This makes future audits straightforward.

---

## Codebase Impact Assessment for TSPEC

Based on codebase inspection, the following modules require modification for Phase 7. This is not a finding — it is a reference list for the TSPEC author.

| Module | Changes Required | FSPEC Source |
|--------|-----------------|--------------|
| `services/discord.ts` | Add `archiveThread()` and `postPlainMessage()` to DiscordClient protocol; implement in DiscordJsClient | §3.5, §5.4 |
| `services/logger.ts` | Redesign Logger protocol with `forComponent()` factory; update ConsoleLogger | §7.5 BR-LG-01-05 |
| `orchestrator/response-poster.ts` | Replace embed constants with four typed embeds; update `postAgentResponse()` to use `postPlainMessage()`; update `createCoordinationThread()` to use Routing Notification; eliminate `resolveColour()` | §5.2, §5.4 |
| `orchestrator/router.ts` | Update `resolveHumanMessage()` to iterate `agents[]` entries instead of `config.agents.role_mentions`; update `decide()` to use registry lookup instead of `config.agents.active` | §4.4 |
| `orchestrator/orchestrator.ts` | Add post-resolution archive step after terminal signal handling; integrate with thread registry for idempotency check | §3.3 |
| `config/loader.ts` | Migrate from flat `AgentConfig` to `agents[]` array schema; update validation logic | §4.3 |
| `types.ts` | Replace `AgentConfig` interface with new `AgentEntry[]` schema; add `archive_on_resolution` to orchestrator config | §4.2, §2.3 |
| All modules with logger calls | Replace `logger.info/warn/error/debug` with scoped logger instances via `forComponent()` | §7.3, §7.5 |
| `tests/fixtures/factories.ts` | Add `FakeDiscordClient.archiveThread()`, `FakeDiscordClient.postPlainMessage()`; redesign FakeLogger with structured capture | §3.5, §5.4, §7.5 |

---

## Recommendation

**Approved.**

All prior blocking findings (BE-F-02, BE-F-03, BE-F-04) and additive findings (createCoordinationThread disposition, logger fallback rule) are fully resolved in v2.1. The two new observations (F-01, F-02) are both Low severity and require no FSPEC changes — they are TSPEC awareness items only.

The FSPEC v2.1 is behaviorally complete, technically sound, and ready for TSPEC authoring. All acceptance tests are implementable against the existing test infrastructure with the specified protocol additions.

---

*End of Review*
