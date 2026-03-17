# Cross-Review: Test Engineer — TSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.3 |
| **REQ Reference** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reference** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## v1.3 Re-Review Summary

TSPEC v1.2 resolved F-07 from the previous review cycle. TSPEC v1.3 applied PM F-08 (2000-char chunk size in §4.2.4). Both changes are confirmed:

- **F-07 (Low, prior cycle):** `fromAgentDisplayName: 'Ptah'` fallback test case now explicitly listed in §9.3 ResponsePoster row ✅
- **PM F-08 (prior cycle):** §4.2.4 `postAgentResponse()` behavior change now specifies 2000-char chunk size ✅

Two new Medium findings were identified during this pass that were not surfaced in the v1.0–v1.2 review cycles. Both would cause TypeScript compile errors or create undocumented ambiguity that blocks engineering implementation. Re-review required after these are resolved.

---

## Findings (v1.3)

### F-08 (Medium) — `buildAgentRegistry()` function signature is synchronous; algorithm uses `await`

**Affected:** §4.2.3 (`buildAgentRegistry()` TypeScript signature), §5.4 (`buildAgentRegistry()` algorithm)

The TypeScript signature in §4.2.3 declares a synchronous function:

```typescript
export function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): { registry: AgentRegistry; errors: AgentValidationError[] }
```

However, §5.4 specifies the algorithm using `await`:

> `d. Validate skill_path (file must exist): await fs.exists(skill_path)`
> `e. Validate log_file (file must exist): await fs.exists(log_file)`

The `FileSystem.exists()` method performs I/O and must be awaited — a synchronous function body cannot contain `await`. As written, this spec won't compile. An engineer implementing this will immediately diverge from the spec to add `async`, then discover the return type must also be wrapped in `Promise<>`, cascading to all call sites (composition root, config loader, integration tests).

The §5.4 algorithm Input/Output section also states the return type as `{ registry: DefaultAgentRegistry, errors: AgentValidationError[] }` without `Promise<>`.

**Required fix:** Change the signature to:

```typescript
export async function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): Promise<{ registry: AgentRegistry; errors: AgentValidationError[] }>
```

Update §5.4 Output to `Promise<{ registry: AgentRegistry; errors: AgentValidationError[] }>`.

---

### F-09 (Medium) — `'invocation-guard'` absent from `Component` type; `'dispatcher'` has no corresponding module

**Affected:** §4.2.1 (`Component` type union, line 222–224), §3 (project structure), §1 (summary)

The `Component` union type (§4.2.1) enumerates 8 values:

```typescript
export type Component =
  | 'orchestrator' | 'router' | 'dispatcher' | 'skill-invoker'
  | 'artifact-committer' | 'response-poster' | 'config' | 'discord';
```

§3 lists `invocation-guard.ts` as **UPDATED — component logger, error message integration**. §1 states: "All eight Orchestrator modules construct component-scoped loggers at initialization."

The problem: `'invocation-guard'` is not in the `Component` union. If `invocation-guard.ts` calls `deps.logger.forComponent('invocation-guard')`, TypeScript raises an error at that call site. Conversely, `'dispatcher'` appears in the union but no `dispatcher.ts` file appears anywhere in the §3 project structure.

Two interpretations exist, but neither is stated:

1. `invocation-guard.ts` is the dispatcher — it calls `forComponent('dispatcher')`, and logs appear as `[ptah:dispatcher]`. This mapping is undocumented.
2. `'dispatcher'` belongs to a different module and `'invocation-guard'` was forgotten from the union.

Either way, an engineer cannot implement this without guessing. If interpretation (1) is correct, add a prose note to §4.2.1: *"invocation-guard.ts uses `'dispatcher'` as its component name."* If interpretation (2) is correct, add `'invocation-guard'` to the `Component` union and remove or rename `'dispatcher'`.

---

### F-10 (Low) — `LogEntry.component` typed as `string`; loses compile-time verification in tests

**Affected:** §4.2.3 `LogEntry` interface

```typescript
export interface LogEntry {
  component: string;   // ← should be Component
  level: LogLevel;
  message: string;
}
```

`level` is typed as the `LogLevel` union; `component` is typed as `string`. This inconsistency means test assertions against `entry.component` lose autocomplete and compile-time checking. A typo like `component: 'skill_invoker'` (underscore instead of hyphen) passes the type checker silently.

Recommend `component: Component` for consistency with `level: LogLevel` and to give engineers autocomplete on `expect(entry).toMatchObject({ component: 'skill-invoker', ... })`.

**Non-blocking** — does not prevent engineering handoff.

---

### F-11 (Low) — `postAgentResponse()` 2000-char chunk boundary not enumerated in §9.3

**Affected:** §9.3 ResponsePoster unit test category row

Following the v1.3 fix (PM F-08), `postAgentResponse()` now chunks at 2000 chars (was 4096). The §9.3 ResponsePoster row reads:

> "4 embed type schemas (color, title, footer), plain-text agent response, embed fallback to plain, truncation, `fromAgentDisplayName: 'Ptah'` fallback renders correctly in Routing Notification embed"

The "truncation" entry covers embed field truncation (`…`), which was addressed for EVT-OB-01/OB-08 in F-06. The 2000-char chunking behavior of `postAgentResponse()` is distinct — it chunks content into multiple `postPlainMessage()` calls, not truncation with `…`. The boundary test cases (text of exactly 2000 chars → 1 message; text of 2001 chars → 2 messages) should be explicitly listed alongside "plain-text agent response".

**Non-blocking** — does not prevent engineering handoff.

---

## v1.1 Findings (Resolved in v1.2)

All findings from the v1.0 and v1.1 review cycles are confirmed resolved:

| ID | Severity | Status |
|----|----------|--------|
| F-01 | Medium | ✅ Resolved v1.1 — test files added to §3 |
| F-02 | Medium | ✅ Resolved v1.1 — `AgentValidationError` defined in §4.2.3 |
| F-03 | Medium | ✅ Resolved v1.1 — OQ-TSPEC-04 resolved; `fromAgentDisplayName: 'Ptah'` fallback documented |
| F-04 | Low | ✅ Resolved v1.1 — `FakeLogger.forComponent()` uses `Component` type |
| F-05 | Low | ✅ Resolved v1.1 — `EmbedType` removed from §3 |
| F-06 | Low | ✅ Resolved v1.1 — truncation boundary test cases in §9.3 |
| F-07 | Low | ✅ Resolved v1.2 — `fromAgentDisplayName: 'Ptah'` fallback in §9.3 ResponsePoster row |

---

## Positive Observations (v1.3)

1. **OQ-TSPEC-03 resolved cleanly.** The 2000-char chunk size is now specified in §4.2.4 normative text ("chunk size is reduced from 4096 to 2000 chars for plain-message compatibility") and the resolution note in §12 is clear. No ambiguity for engineers about the expected behavior.

2. **`buildAgentRegistry()` algorithm is implementation-ready in all other respects.** The 7-step validation sequence, duplicate detection, and structured error shape are precise and complete. Once the `async`/`Promise<>` signature is fixed (F-08), this algorithm maps directly to test cases with no further interpretation needed.

3. **FakeLogger shared-store design is excellent.** The `forComponent()` → shared `FakeLogStore` pattern eliminates the need for per-component fake instances and enables structured assertions across all scoped loggers from a single `rootLogger.entries`. The Option B usage example with the explicit anti-pattern warning is the right level of guidance for engineers.

4. **Thread archiving algorithm ordering is unambiguous.** Step 3b (post resolution notification) explicitly precedes step 4 (archive thread), with a fallback path to `postPlainMessage()` and the `(REQ-DI-10)` annotation. Engineers will not accidentally swap the order.

---

## Recommendation

**Needs revision.**

F-08 and F-09 are Medium severity. F-08 is a compile error — the function signature contradicts the algorithm's use of `await`. F-09 is an unresolvable ambiguity — `invocation-guard.ts` cannot implement component logging without knowing which `Component` value to use.

F-10 and F-11 are Low and non-blocking, but should be addressed in the same revision pass.

The author must resolve F-08 and F-09 and route the updated TSPEC back for a final re-review pass before PROPERTIES derivation proceeds.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Test Engineer | Initial review of TSPEC v1.0 — Needs revision (3 Medium findings) |
| 1.1 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.1 — Approved with minor changes (F-07 Low, non-blocking) |
| 1.2 | March 17, 2026 | Backend Engineer | F-07 addressed in TSPEC v1.2 — `fromAgentDisplayName: 'Ptah'` fallback added to §9.3 ResponsePoster description. All TE findings resolved. |
| 1.3 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.3 — Needs revision. F-07 and PM F-08 confirmed resolved. New findings: F-08 (Medium — `buildAgentRegistry()` sync/async mismatch), F-09 (Medium — `invocation-guard` absent from `Component` union), F-10 (Low — `LogEntry.component: string`), F-11 (Low — 2000-char chunk boundary test case missing). |
