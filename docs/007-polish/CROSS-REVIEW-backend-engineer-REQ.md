# Cross-Review: Backend Engineer — REQ-PTAH-P7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer |
| **Document Reviewed** | [007-REQ-PTAH-polish.md](./007-REQ-PTAH-polish.md) v1.2 |
| **FSPEC Reviewed** | [007-FSPEC-ptah-polish.md](./007-FSPEC-ptah-polish.md) v1.0 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 (High) — REQ-NF-08 / FSPEC-EX-01: Proposed config schema is a breaking change to the existing config format

**Affected:** REQ-NF-08 + FSPEC-EX-01

The FSPEC-EX-01 proposes a new `agents` array of objects:

```json
[
  { "id": "backend-engineer", "skill_path": "...", "log_file": "...", "mention_id": "...", "display_name": "..." }
]
```

The **live** `ptah.config.json` schema uses a fundamentally different structure:

```json
{
  "agents": {
    "active": ["backend-engineer", "pm"],
    "skills": { "backend-engineer": "./skills/backend-engineer.md" },
    "colours": { "backend-engineer": "#E65100" },
    "role_mentions": { "roleId123": "backend-engineer" }
  }
}
```

These are mutually incompatible. FSPEC-EX-01's schema requires restructuring every existing agent entry in `ptah.config.json`. This is a **breaking migration** that affects:

1. `config/loader.ts` — validation logic referencing `agents.active`, `agents.skills`, `agents.colours`, `agents.role_mentions` must all be rewritten
2. Any existing `ptah.config.json` file in the wild
3. The hot-reload path that currently reads keys from the existing schema

**Action required:** The REQ should explicitly call out that Phase 7 includes a config schema migration. Engineering needs to scope the migration effort and decide whether to support both formats (backward compatibility layer) or require a hard cut-over. This decision belongs in the TSPEC but the REQ should acknowledge the scope. Without this acknowledgement, the migration work is invisible to the product planning process.

---

### F-02 (High) — Signal naming mismatch between FSPEC-DI-02 and the live routing contract is a harder blocker than the REQ implies

**Affected:** REQ-DI-06 + FSPEC-DI-02

The REQ correctly flags this in §5 Risks: "Engineering must not begin REQ-DI-06 implementation until the signal contract in FSPEC-DI-02 is reconciled with the live routing signal contract."

The concrete mismatch is:

| FSPEC-DI-02 (proposed) | Live `router.ts` |
|------------------------|------------------|
| `lgtm` | `LGTM` |
| `task_done` with `status: DONE` | `TASK_COMPLETE` |
| `task_done` with `status: BLOCKED` | `ROUTE_TO_USER` (separate signal type, no sub-status) |
| `route_to` | `ROUTE_TO_AGENT` |
| `escalate_to_user` | `ROUTE_TO_USER` |

This is not just a naming inconsistency — the FSPEC uses a sub-status field (`status: DONE / BLOCKED`) that does not exist in the live signal contract. The live contract handles "blocked" via a separate signal type (`ROUTE_TO_USER`), not a sub-field on `task_done`. Reconciling these requires either:

1. Updating the live skill definitions and routing logic to adopt the FSPEC signal schema (a cross-cutting change), or
2. Updating FSPEC-DI-02 to use the live signal names

This reconciliation cannot be deferred to TSPEC time — it is a requirement-level contract decision. **The FSPEC for FSPEC-DI-02 is currently written against a signal contract that does not match production.** Engineering cannot produce an accurate TSPEC for REQ-DI-06 until this is resolved.

**Action required:** Before Phase 7 engineering begins, the PM should decide which signal contract is canonical and update FSPEC-DI-02 accordingly. Engineering strongly recommends adopting the live contract (LGTM / TASK_COMPLETE / ROUTE_TO_USER) to avoid touching existing skill definitions.

---

### F-03 (Medium) — REQ-DI-10 acceptance criteria conflict with existing ResponsePoster behavior

**Affected:** REQ-DI-10

The acceptance criteria state: _"agent response content is not wrapped in an embed — only Orchestrator metadata messages use embeds."_

However, the existing `response-poster.ts` already wraps agent content in Discord embeds via `postAgentResponse()`. This is established, shipped behavior.

Two interpretations of REQ-DI-10:
1. **Additive** — The requirement only adds embed formatting for *new* Orchestrator system messages (routing notifications, user escalations). Existing `postAgentResponse()` embed behavior is unchanged.
2. **Corrective** — The requirement wants to change existing behavior so agent content is posted as plain text, and embeds are reserved for system messages only.

If interpretation 2 is intended, this is a significantly larger scope change that touches the existing UX and could be disruptive to users who have come to expect the embed format for agent content.

**Action required:** Clarify the intent. If interpretation 1 is correct, update the acceptance criteria to remove the ambiguous clause ("agent response content is not wrapped in an embed") and replace it with a positive statement of what new behavior is being added. This avoids future confusion during TSPEC.

---

### F-04 (Medium) — REQ-NF-09: Logger interface refactor scope is larger than the REQ implies

**Affected:** REQ-NF-09

The requirement asks for `[ptah:{component}]` prefixes. The existing `Logger` interface signature is:

```typescript
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

There is no `component` parameter. The `ConsoleLogger` today outputs `[ptah] INFO: ...` with no component distinction. Adding `{component}` to every log line requires updating the Logger interface to accept a component name (either via constructor parameter or per-call parameter), then updating every call site in:

- `orchestrator.ts` (~1,100 lines, many log calls)
- `router.ts`
- `pdlc/*.ts` (dispatcher, state machine, review tracker, etc.)
- `skill-invoker.ts`, `artifact-committer.ts`, `response-poster.ts`, and all other orchestrator submodules

This is a substantial refactor (dozens of call sites). The REQ §5 Risks section mentions "scope this as a targeted audit pass" — this is the right framing, but the risk entry undersells the scale. Engineering should produce an impact estimate (count of call sites, interface changes) before Phase 7 scope is finalized.

**Action required:** No change to the REQ text is strictly required, but the PM should be aware that REQ-NF-09 carries the highest implementation surface area of any Phase 7 requirement. Consider whether a phased approach (Logger interface change + systematic call-site migration) should be explicitly called out in scope/risks.

---

### F-05 (Low) — REQ-DI-06: Discord MCP thread-archive capability needs explicit verification before TSPEC

**Affected:** REQ-DI-06

The FSPEC-DI-02 references "the Discord MCP thread-archive operation" as a first-class API call. The REQ §6 Assumptions states: _"The Discord MCP supports rich embed creation; no alternative Discord posting mechanism is needed."_

This assumption covers embed creation but not thread archiving specifically. Discord thread archiving requires the `MANAGE_THREADS` permission and calls `Thread.setArchived(true)` on the discord.js `ThreadChannel`. While this is standard discord.js functionality, the **Discord MCP wrapper** may or may not expose this operation. If it does not, engineering would need to add it — a scope expansion.

**Action required:** Engineering will verify Discord MCP thread-archive support before writing the TSPEC for REQ-DI-06. If the capability is absent from MCP, this must be raised as a blocker before Phase 7 engineering begins.

---

## Clarification Questions

### Q-01 — REQ-NF-08: Is a config migration guide in scope for Phase 7?

The config schema change required by FSPEC-EX-01 will break existing `ptah.config.json` files. Is authoring a migration guide (or a migration script) part of the Phase 7 deliverable, or is it handled as a separate dev task outside the product spec? Engineering needs to know whether to scope migration tooling.

### Q-02 — REQ-DI-10: Are routing notification messages a new feature or a rename of existing progress embeds?

`response-poster.ts` already has `postProgressEmbed()` and `postCompletionEmbed()`. Are these the "routing notification" and "resolution notification" embeds that REQ-DI-10 describes, or are these new message types being added alongside the existing ones? Clarifying this determines whether REQ-DI-10 is a styling/content change to existing messages or net-new message types.

---

## Positive Observations

- **REQ-NF-10 (Operator Observability)** is well-specified. The acceptance criteria — "identify triggering message, invoked agent, routing signal type, post-signal actions, and any errors from log alone" — gives engineering a clear completeness checklist for log coverage. No changes needed.
- **FSPEC-DI-02 behavioral flow** (§3.3) is thorough and correctly orders the archiving step as last. BR-DI-02-03 (non-blocking archiving failure) is the right call — a failed archive should never fail a routing cycle. The error scenario table (§3.6) is complete.
- **FSPEC-EX-01 validation logic** (§4.3) handles all meaningful failure modes (missing fields, bad ID format, missing files, duplicate IDs and mention_ids) with the correct "skip and continue" semantics. The acceptance tests cover all paths.
- **REQ-RP-06 (Error Message UX)** is tightly scoped and the acceptance criteria are unambiguous. The "at least one actionable suggestion" criterion is measurable, which is exactly what engineering needs to write a test.
- The v1.2 change to REQ-NF-09 (removing the `console.log` clause) was correct — observable log format is a product requirement; code hygiene is an engineering concern.

---

## Recommendation

**Needs revision.**

Two high-severity findings must be resolved before engineering can write TSPEC:

1. **F-01** — The FSPEC-EX-01 config schema migration must be explicitly acknowledged in the REQ scope and risks. Engineering cannot produce an accurate execution plan without knowing whether config migration tooling is in scope.

2. **F-02** — The signal naming mismatch between FSPEC-DI-02 and the live routing contract must be resolved at the product/FSPEC level. Engineering recommends the PM update FSPEC-DI-02 to use live signal names (LGTM / TASK_COMPLETE) and remove the `status` sub-field pattern, which has no counterpart in the live contract.

F-03 (REQ-DI-10 scope ambiguity) and F-04 (REQ-NF-09 refactor scale) should be addressed to ensure Phase 7 is accurately sized before engineering commits to an execution plan.
