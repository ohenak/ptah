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

FSPEC-EX-01 proposes a new `agents` array of objects:

```json
[
  { "id": "backend-engineer", "skill_path": "...", "log_file": "...", "mention_id": "...", "display_name": "..." }
]
```

The **live** `ptah.config.json` schema (confirmed in `ptah/src/types.ts` and `ptah/ptah.config.json`) uses a fundamentally different structure:

```typescript
// Live AgentConfig in src/types.ts
interface AgentConfig {
  active: string[];
  skills: Record<string, string>;
  model: string;
  max_tokens: number;
  colours?: Record<string, string>;
  role_mentions?: Record<string, string>;
}
```

These are mutually incompatible. FSPEC-EX-01's schema requires restructuring every existing agent entry. This is a **breaking migration** that affects:

1. `src/types.ts` — `AgentConfig` interface must be replaced or extended
2. `src/config/loader.ts` — validation logic referencing `agents.active`, `agents.skills`, `agents.colours`, `agents.role_mentions` must all be rewritten (confirmed: loader validates all four keys)
3. All consumer code that reads `config.agents.active`, `config.agents.skills[agentId]`, `config.agents.colours[agentId]`, `config.agents.role_mentions`
4. Any existing `ptah.config.json` file in deployment

The REQ does not acknowledge this migration scope. **Engineering cannot produce an accurate execution plan without knowing whether config migration tooling is in scope, whether backward compatibility is required, or whether a hard cut-over is expected.**

**Action required:** The PM should explicitly call out that Phase 7 includes a config schema migration in scope/risks. Engineering will determine during TSPEC whether to use a backward compatibility shim or require a direct migration.

---

### F-02 (High) — Signal naming mismatch between FSPEC-DI-02 and the live routing contract must be resolved before TSPEC

**Affected:** REQ-DI-06 + FSPEC-DI-02

The REQ correctly flags this risk in §5: "Engineering must not begin REQ-DI-06 implementation until the signal contract in FSPEC-DI-02 is reconciled with the live routing signal contract."

This finding confirms the mismatch exists in production code. The live signal contract (confirmed in `ptah/src/types.ts` and `ptah/src/orchestrator/router.ts`):

```typescript
type RoutingSignalType = "ROUTE_TO_AGENT" | "ROUTE_TO_USER" | "LGTM" | "TASK_COMPLETE";

interface RoutingSignal {
  type: RoutingSignalType;
  agentId?: string;
  question?: string;
  threadAction?: "reply" | "new_thread";
}
```

The FSPEC-DI-02 uses a completely different schema:

| FSPEC-DI-02 (proposed) | Live `router.ts` / `types.ts` |
|------------------------|-------------------------------|
| `lgtm` | `LGTM` |
| `task_done` with `status: DONE` | `TASK_COMPLETE` (no sub-status field) |
| `task_done` with `status: BLOCKED` | `ROUTE_TO_USER` (separate signal type, no sub-status) |
| `route_to` | `ROUTE_TO_AGENT` |
| `escalate_to_user` | `ROUTE_TO_USER` |

The sub-status pattern (`status: DONE / BLOCKED`) does not exist in the live contract at all. The live contract uses separate top-level signal types. FSPEC-DI-02's behavioral flow (§3.2, §3.3) is written around a contract that production has never implemented.

This is a **requirement-level contract decision** — it cannot be deferred to TSPEC. Engineering recommends the PM update FSPEC-DI-02 to use live signal names (`LGTM` / `TASK_COMPLETE`) and remove the `status` sub-field pattern, since `TASK_COMPLETE` already unambiguously means "done" and there is no live equivalent of `task_done BLOCKED` (that case is handled by `ROUTE_TO_USER`).

**Action required:** PM to update FSPEC-DI-02 signal type table (§3.2) and behavioral flow (§3.3) to match the live contract before Phase 7 engineering begins.

---

### F-03 (Medium) — REQ-DI-10 acceptance criteria conflict with existing ResponsePoster behavior

**Affected:** REQ-DI-10

The acceptance criteria state: _"agent response content is not wrapped in an embed — only Orchestrator metadata messages use embeds."_

The existing `response-poster.ts` (confirmed by codebase review) already wraps agent content in Discord embeds via `postAgentResponse()`. This is established, shipped behavior — `postAgentResponse()` splits content into embed chunks using agent-specific colors from config.

Additionally, the following Orchestrator system-message embed methods **already exist**:
- `postCompletionEmbed()` — green embed for completion
- `postErrorEmbed()` — gray embed for errors
- `postProgressEmbed()` — dark gray embed for progress updates

This means REQ-DI-10 may be describing work that is **largely already implemented**. Two interpretations remain:

1. **Additive** — REQ-DI-10 adds new embed message types not yet implemented (e.g., routing notification embeds, escalation embeds). The existing methods are partial coverage; the requirement fills the gaps.
2. **Corrective** — The requirement wants to change existing behavior so agent content (`postAgentResponse`) uses plain text, and embeds are reserved for system messages only.

If interpretation 2 is intended, this is a disruptive scope change affecting existing UX. If interpretation 1, the requirement should describe what *new* embed types are being added rather than making a statement ("agent content is not wrapped") that contradicts current behavior.

**Action required:** Clarify the intent. If additive, replace the clause "agent response content is not wrapped in an embed" with an enumeration of the *new* embed types being added. Also clarify whether `postCompletionEmbed` / `postProgressEmbed` / `postErrorEmbed` satisfy this requirement or whether new embed message types are needed.

---

### F-04 (Medium) — REQ-NF-09: Logger interface refactor scope is larger than the REQ implies

**Affected:** REQ-NF-09

The requirement asks for `[ptah:{component}]` prefixes. The live `Logger` interface (confirmed in `src/services/logger.ts`):

```typescript
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

class ConsoleLogger implements Logger {
  info(message: string): void { console.log(`[ptah] ${message}`); }
  warn(message: string): void { console.log(`[ptah] WARN: ${message}`); }
  error(message: string): void { console.error(`[ptah] Error: ${message}`); }
}
```

There is no `component` parameter. Adding `[ptah:{component}]` to every log line requires updating the Logger interface (constructor parameter or per-call parameter) and updating every call site across:

- `orchestrator.ts` (~1,100 lines, many log calls)
- `router.ts`, `pdlc/*.ts` (dispatcher, state machine, review tracker, etc.)
- `skill-invoker.ts`, `artifact-committer.ts`, `response-poster.ts`, and all other orchestrator submodules

The §5 Risks entry ("scope this as a targeted audit pass") is the right framing but understates the surface area. This has the highest call-site count of any Phase 7 requirement.

**Action required (informational):** No REQ text change required. The PM should be aware that REQ-NF-09 carries the largest implementation surface area in Phase 7 before committing to a fixed-scope execution plan.

---

### F-05 (Low) — REQ-DI-06: Four requirements (REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10) have no FSPEC

**Affected:** REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10

The REQ §7 Specification Status confirms: "REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10 — Pending FSPEC."

Without FSPECs for these four requirements, engineering cannot write TSPEC for them. Specifically:

- **REQ-DI-10** — Which embed types are new? What are the embed field schemas (title, color, body fields) for each type?
- **REQ-RP-06** — What are the exact error message templates? What actionable suggestions are required per error type?
- **REQ-NF-09** — What is the full enumeration of `{component}` values? What is the exact format of a compliant log line?
- **REQ-NF-10** — What log events are required to reconstruct the routing lifecycle? Minimum required event set?

These are not blocking the REQ approval itself (the REQ correctly marks them as pending FSPEC) — but TSPEC and PLAN cannot begin for these four requirements until FSPECs exist.

**Action required:** FSPECs for REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10 should be authored before engineering begins TSPEC. Blocking F-01 and F-02 above must also be resolved before any TSPEC work starts.

---

### F-06 (Low) — REQ-DI-06: Discord MCP thread-archive capability needs explicit verification

**Affected:** REQ-DI-06

The REQ §6 Assumptions covers embed creation but not thread archiving. Discord thread archiving requires `MANAGE_THREADS` permission and the Discord MCP wrapper must expose a thread-archive operation. If the MCP wrapper does not support this, engineering must add it — a scope expansion that is currently invisible.

**Action required:** Engineering will verify Discord MCP thread-archive support during TSPEC research for REQ-DI-06. If absent from MCP, this will be raised as a blocker before Phase 7 engineering begins.

---

## Clarification Questions

### Q-01 — REQ-NF-08: Is a config migration guide or script in scope for Phase 7?

The schema change required by FSPEC-EX-01 will break existing `ptah.config.json` files. Should authoring a migration guide or migration script be part of the Phase 7 deliverable? Engineering needs to know whether to scope migration tooling.

### Q-02 — REQ-DI-10: Are "routing notification" embeds new message types or renamed versions of existing `postProgressEmbed` / `postCompletionEmbed`?

If they are the same embeds as what already exists, the requirement may already be substantially implemented and the scope is styling/content only. If they are net-new, the requirement should enumerate them explicitly to define the engineering scope.

---

## Positive Observations

- **REQ-NF-10 (Operator Observability)** acceptance criteria are well-specified. The checklist — triggering message, invoked agent, signal type, post-signal actions, and errors — gives engineering a clear and testable completeness definition. No changes needed.
- **FSPEC-DI-02 behavioral flow** (§3.3) correctly orders archiving as the final post-routing step. BR-DI-02-03 (non-blocking failure) is the right engineering call — a failed archive must never fail the routing cycle. The error scenario table (§3.6) is thorough and covers all meaningful failure modes.
- **FSPEC-EX-01 validation logic** (§4.3) handles all meaningful failure modes with correct "skip and continue" semantics. BR-EX-01-03 and BR-EX-01-04 (first-wins deduplication for `id` and `mention_id`) are correctly specified and will produce deterministic behavior.
- **REQ-RP-06 (Error Message UX)** is tightly scoped and the "at least one actionable suggestion" criterion is measurable — exactly what engineering needs to write a passing test.
- **v1.2 changelog entry** (removing the `console.log` clause from REQ-NF-09) was the correct call — observable log format is a product requirement; code hygiene is an engineering concern.

---

## Recommendation

**Needs revision.**

Two high-severity findings must be resolved before engineering can write TSPEC for any Phase 7 requirement:

1. **F-01** — FSPEC-EX-01's proposed config schema is a breaking migration from the live `AgentConfig` structure. The REQ must explicitly acknowledge the config migration scope so it is visible to product planning.

2. **F-02** — FSPEC-DI-02 is written against a signal contract that does not match production (`lgtm`/`task_done`+status vs. `LGTM`/`TASK_COMPLETE`/`ROUTE_TO_USER`). The PM must update FSPEC-DI-02 to use the live signal names before engineering begins.

Medium findings F-03 and F-04 should be addressed to avoid ambiguity during TSPEC authoring. F-05 (four requirements lacking FSPECs) is expected at this stage but blocks TSPEC work for those requirements. F-06 (MCP archive capability) will be resolved during TSPEC research.
