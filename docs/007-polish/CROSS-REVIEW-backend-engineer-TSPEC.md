# Cross-Review: Backend Engineer — TSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.4 |
| **REQ Reference** | [007-REQ-polish.md](./007-REQ-polish.md) |
| **FSPEC Reference** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Summary

TSPEC v1.4 resolves all four findings from this review (F-01 through F-04) and the four TE v1.3 findings (F-08 through F-11). The document is now technically sound and ready for PLAN authoring and PROPERTIES derivation.

**v1.3 finding resolutions confirmed:**
- **F-01 (Medium):** `Component` removed from `§4.2.1 logger.ts` code block; imports from `types.ts` with canonical-location rationale note. ✅
- **F-02 (Medium):** `buildAgentRegistry()` marked `async`; return type is `Promise<{...}>` in both §4.2.3 and §5.4 Output. ✅
- **F-03 (Low):** `postSystemMessage()` explicitly marked for **removal** in §4.2.2 with grep guidance. ✅
- **F-04 (Low):** §4.2.6 added with updated `RoutingEngine` interface — signatures unchanged, constructor gains `agentRegistry`, internal implementation changes documented. ✅

Prior art:
- PM cross-review: **Approved** (v1.3, F-08 self-certified)
- TE cross-review: **Needs revision** (v1.3, F-08/F-09 Medium — all resolved in v1.4)
- BE FSPEC review: **Approved** (v2.1, all findings resolved)

---

## Findings

### F-01 (Medium) — `Component` type defined in two source files

**Affected:** §4.2.1 `src/services/logger.ts` code block; §4.2.3 `src/types.ts` code block

**§4.2.1 defines `Component` in `src/services/logger.ts`:**
```typescript
export type Component =
  | 'orchestrator'
  | 'router'
  | 'dispatcher'
  | 'skill-invoker'
  | 'artifact-committer'
  | 'response-poster'
  | 'config'
  | 'discord';
```

**§4.2.3 also defines `Component` in `src/types.ts`:**
```typescript
export type Component =
  | 'orchestrator' | 'router' | 'dispatcher' | 'skill-invoker'
  | 'artifact-committer' | 'response-poster' | 'config' | 'discord';
```

These are identical definitions in two different source files per the TSPEC. This creates:
1. **Import ambiguity** — `FakeLogger.forComponent(component: Component)` in §9.2 uses `Component` without specifying which module to import from. Existing project convention uses `src/types.ts` as the shared-type hub; engineers will likely import from there, but `logger.ts` also defines it.
2. **Type drift risk** — adding a new component value requires updating both files. One will be missed.
3. **Violation of single-source-of-truth** — TypeScript allows structurally identical types in different modules, but they are distinct types. A `Component` imported from `logger.ts` is not assignable to a `Component` from `types.ts` if they ever diverge.

**Required action:** Designate a single canonical location. The natural choice is `src/types.ts` (already the shared-type hub for `LogLevel`, `LogEntry`, `UserFacingErrorType`, etc.). Remove `Component` from the `src/services/logger.ts` code block in §4.2.1 and add an import line instead:
```typescript
import type { Component } from '../types.js';
```

Alternatively, if `Component` is considered a Logger-layer concern, it may live in `logger.ts` and be re-exported from `types.ts`. Either decision is acceptable — the TSPEC must make it explicit.

**Severity rationale:** Medium — the ambiguity will surface at the first import in any test file. Engineers need a definitive answer before writing a single line of implementation code.

---

### F-02 (Medium) — `buildAgentRegistry()` missing `async` / `Promise<>` return type

**Affected:** §4.2.3 `buildAgentRegistry()` signature; §5.4 algorithm

**§4.2.3 signature (synchronous):**
```typescript
export function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): { registry: AgentRegistry; errors: AgentValidationError[] }
```

**§5.4 algorithm uses `await`:**
> "2d. `await fs.exists(skill_path)` — if false → log ERROR..."
> "2e. `await fs.exists(log_file)` — if false → log ERROR..."

A synchronous TypeScript function cannot contain `await`. An engineer implementing `buildAgentRegistry()` from the §4.2.3 signature would encounter a compile error (`error TS1308: 'await' expression is only allowed within an async function`) the moment they add the first `fs.exists()` call.

**Required action:** Update the §4.2.3 signature to:
```typescript
export async function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): Promise<{ registry: AgentRegistry; errors: AgentValidationError[] }>
```

The call site in the composition root (`bin/ptah.ts`) and in unit tests (`buildAgentRegistry()` call in `routing-loop.test.ts`) must also be awaited. The §9.3 integration test note — "buildAgentRegistry() called with real in-memory AgentEntry[]" — already implies awaiting the result; the async signature makes this explicit.

**Severity rationale:** Medium — the specification text actively leads the engineer toward a function signature that will fail to compile. The fix is one-line, but the risk of an engineer implementing the sync version and wrapping the awaits in `.then()` chains (producing correct but non-idiomatic code) is real.

---

### F-03 (Low) — `postSystemMessage()` disposition not specified

**Affected:** §4.2.2 DiscordClient protocol changes

The current `DiscordClient` interface (confirmed in live `src/services/discord.ts`) includes:
```typescript
postSystemMessage(threadId: string, content: string): Promise<void>;
```

After Phase 7:
- Agent response text uses `postPlainMessage()` (new method, §4.2.2)
- Orchestrator metadata uses the four typed embed methods (§4.2.4)
- `postSystemMessage()` is not listed in the §4.2.2 "Added" section, nor is it mentioned anywhere in the TSPEC

This was flagged as a TSPEC awareness item in CROSS-REVIEW-backend-engineer-FSPEC.md (F-01 Low): "The TSPEC should explicitly state the disposition of `postSystemMessage()` (deprecate/remove/repurpose)."

Without an explicit disposition, the engineer implementing Phase 7 must independently decide whether to keep `postSystemMessage()` in the `DiscordClient` interface and `DiscordJsClient` implementation, or remove it. If kept, it becomes dead code with no known call sites. If removed, any surviving call sites will produce compile errors that weren't anticipated in the TSPEC's integration impact table.

**Action required (non-blocking):** Add a disposition note to §4.2.2 — e.g.: "`postSystemMessage()` is **removed** from the `DiscordClient` interface. No call sites remain after Phase 7 (`postPlainMessage()` covers the plain-message use case; embed types cover all metadata messages)." Or if it should be retained for backward compatibility, state that explicitly.

---

### F-04 (Low) — Updated `RoutingEngine` interface signature not shown in §4

**Affected:** §4.2 Updated Protocols; §11 Integration Points

§11 correctly notes: "`RoutingEngine` interface gains an `agentRegistry` constructor dependency." The current live interface:
```typescript
interface RoutingEngine {
  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null;
  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision;
}
```

After Phase 7, `resolveHumanMessage()` replaces `config.agents.role_mentions` with `agentRegistry.getAgentByMentionId()`, and `decide()` replaces `config.agents.active` validation with `agentRegistry.getAgentById()`. It is unclear from the TSPEC whether:

1. The `RoutingEngine` *interface* method signatures change (removing `config: PtahConfig` parameter), or
2. Only the *implementation* changes (the interface keeps `config` for other uses, e.g., `config.orchestrator` settings), with `agentRegistry` added as a constructor dep only.

The §5.3 Consumer Updates table shows `config.agents.*` access patterns being replaced by `agentRegistry.*` calls, but doesn't indicate whether `config` is fully removed from the `RoutingEngine` method signatures or just partially replaced.

**Action required (non-blocking):** Add the updated `RoutingEngine` interface to §4.2 (showing whether `config: PtahConfig` is kept, reduced, or removed from `resolveHumanMessage()` and `decide()`). This prevents the engineer from guessing and potentially producing an interface signature that breaks existing call sites.

---

## Positive Observations

- **`FakeLogger` shared-store design (§9.2) is the right architecture.** The `FakeLogStore` shared via constructor injection, combined with the Option B usage pattern and the explicit anti-pattern warning against Option A, is thorough and immediately usable. The `entriesAt(level)` convenience method is a good addition that will reduce test boilerplate.

- **`buildErrorMessage()` purity rule (§4.2.5) is correct.** Keeping error message construction as a pure function — no `Error` objects, no stack traces, caller-extracted context only — makes it trivially testable and prevents accidental PII/internal state leakage into user-facing messages. This is the right call.

- **Thread archiving algorithm (§6) is well-ordered.** The `postResolutionNotificationEmbed()` → `archiveThread()` → `threadStateManager.markClosed()` sequence with a WARN fallback to `postPlainMessage()` on embed failure matches REQ-DI-10 exactly. The idempotency check at step 3 (skip if `status === 'closed'`) prevents double-archive MCP calls.

- **Error handling table (§8) assigns component ownership for every failure scenario.** Knowing *which component* owns each error (vs. just the behavior) is valuable for test organization — each unit test file can assert exactly the EVT-OB-10 ERROR log it's responsible for.

- **Config migration before/after (§5.2) is implementation-ready.** The before/after JSON is explicit, the consumer update table (§5.3) covers all `config.agents.*` access patterns, and the hard-cut-over rationale is sound for a dev-tool with a single deployment. Zero ambiguity for the engineer.

- **`AgentValidationError` shape (§4.2.3) maps directly to algorithm output.** The `{ index, agentId?, field, reason }` shape pairs exactly with the 7 validation rules in §5.4 — each rule produces a predictable error shape. Test assertions will be exact rather than partial-match.

- **Embed color constants table (§4.2.4) replaces all old constants.** The explicit COMPLETION_COLOUR/ERROR_COLOUR/PROGRESS_COLOUR/DEFAULT_COLOUR → 4 new typed constants mapping eliminates any risk of stale constants surviving.

---

## Codebase Verification Notes

Confirmed against live `ptah/src/`:
- `postSystemMessage()` is present in `src/services/discord.ts` (Phase 3) with no mention in TSPEC disposition — confirms F-03.
- `RoutingEngine.resolveHumanMessage()` currently takes `config: PtahConfig` — confirms F-04 ambiguity.
- `Logger` protocol has no `forComponent()` method, `ConsoleLogger` uses `[ptah]` prefix inline — confirms migration surface is exactly as described.
- `AgentConfig` flat schema confirmed in `src/types.ts` — confirms §5.2 before-state is accurate.
- `PostResult` is defined in `src/types.ts` (not a new type) — consistent with §4.2.4 `postAgentResponse()` return.

---

## Recommendation

**Approved.**

All four findings (F-01 Medium, F-02 Medium, F-03 Low, F-04 Low) are resolved in v1.4. Combined with TE findings F-08 through F-11 also addressed, the TSPEC is clear and implementation-ready. Proceed to PLAN authoring. TE re-review of F-08/F-09 is still outstanding — route v1.4 to Test Engineer for sign-off before marking the document Approved.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Backend Engineer | Initial review of TSPEC v1.3 — Needs revision (F-01 Medium: Component type duplication; F-02 Medium: buildAgentRegistry() missing async) |
| 1.1 | March 17, 2026 | Backend Engineer | Re-review of TSPEC v1.4 — Approved. All findings (F-01..F-04) resolved. TE F-08..F-11 also resolved in v1.4 by same edit pass. |

---

*End of Review*
