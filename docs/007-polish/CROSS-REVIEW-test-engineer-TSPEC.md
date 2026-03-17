# Cross-Review: Test Engineer — TSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.5 |
| **REQ Reference** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reference** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## v1.5 Re-Review Summary

Both findings from the v1.4 review cycle are confirmed resolved in v1.5. No new findings were discovered during this pass. The TSPEC is approved for PROPERTIES derivation.

- **F-12 ✅ Resolved** — `FakeLogger._component` and constructor parameter are now typed as `Component`; default changed from `'test'` (invalid) to `'orchestrator'` (valid `Component` member). All four `store.entries.push()` call sites now type-check correctly. `new FakeLogger()` usage in the recommended example also compiles.
- **F-13 ✅ Resolved** — `FakeFileSystem` is now fully defined in §9.2 with a clear note that it is new in Phase 7. The `existsResults: Map<string, boolean>` design provides per-path control; all remaining `FileSystem` protocol methods are stubbed. A concrete usage example for `agent-registry.test.ts` is included.

---

## Findings (v1.5)

No new findings.

---

## v1.4 Findings (Resolved in v1.5)

| ID | Severity | Status |
|----|----------|--------|
| F-12 | Medium | ✅ Resolved v1.5 — `FakeLogger._component: Component`; constructor default `'orchestrator'`; all push() sites type-check |
| F-13 | Low | ✅ Resolved v1.5 — `FakeFileSystem` fully defined in §9.2; new in Phase 7; `existsResults` map and usage example added |

---

## v1.4 Re-Review Summary (archived)

All four findings from the v1.3 review cycle are confirmed resolved in v1.4. One new Medium finding was discovered during this pass. It is a direct consequence of the F-10 fix applied in v1.4 (changing `LogEntry.component` from `string` to `Component`) not being propagated to the `FakeLogger` implementation in §9.2. The `FakeLogger._component` field and constructor remain typed as `string`, creating a compile error at every `store.entries.push(...)` call site. Re-review required after this is resolved.

---

## Findings (v1.4 — archived)

### F-12 (Medium) — `FakeLogger._component` typed as `string`; incompatible with `LogEntry.component: Component`

**Affected:** §9.2 `FakeLogger` implementation

F-10 (resolved in v1.4) correctly changed `LogEntry.component` from `string` to `Component` for compile-time safety. However the `FakeLogger` implementation in §9.2 was not updated in the same pass:

```typescript
export class FakeLogger implements Logger {
  private _component: string;                           // ← still string

  constructor(component: string = 'test', ...) {        // ← still string
    this._component = component;
  }

  info(message: string): void {
    this.store.entries.push({ component: this._component, ... });  // ← TYPE ERROR
  }
```

`LogEntry.component` is `Component` (a string literal union), but `this._component` is `string`. TypeScript will reject all four `push(...)` calls in `info`, `warn`, `error`, and `debug` — `string` is not assignable to `Component`. The test factory file will not compile.

Additionally, the default value `'test'` is not a member of the `Component` union, so `new FakeLogger()` (used in the recommended usage example on line 741 of the TSPEC) also fails type checking.

**Required fix:** Update `FakeLogger` to use `Component` for its `_component` field and constructor parameter. Choose one of the following approaches (either is acceptable — the spec should state which):

**Option A — strict typing, valid default:**
```typescript
private _component: Component;

constructor(component: Component = 'config', store?: FakeLogStore) {
  this._component = component;
  this.store = store ?? new FakeLogStore();
}
```
Change all uses of `new FakeLogger()` in test examples to `new FakeLogger('config')` or `new FakeLogger('orchestrator')` etc.

**Option B — type cast at push, preserve `'test'` default:**
```typescript
private _component: Component | string;

constructor(component: Component | string = 'config', store?: FakeLogStore) {
```
And cast at push: `{ component: this._component as Component, ... }`. This allows sentinel values but loses the compile-time guard F-10 was intended to provide.

Option A is preferred — it keeps the `Component` type guarantee end-to-end through the test infrastructure.

---

### F-13 (Low) — `FakeFileSystem` test double referenced in §9.3 but absent from §9.2

**Affected:** §9.2 Test Doubles, §9.3 AgentRegistry unit row

§9.3 lists "FakeFs integration" as a requirement for the `agent-registry.test.ts` unit tests. `buildAgentRegistry()` receives a `FileSystem` parameter and calls `fs.exists(skill_path)` and `fs.exists(log_file)`. Any unit test for this function requires an injectable fake that controls the `exists()` return value and can simulate a "file not found" path.

§9.2 Test Doubles defines FakeLogger, FakeDiscordClient, FakeAgentRegistry, and FakeResponsePoster — but does not define or mention `FakeFileSystem`.

This creates uncertainty for the implementing engineer: Is `FakeFileSystem` pre-existing from a prior phase? If so, where is it? Does it need to be extended to support `exists()`? Does it need to be created from scratch in Phase 7?

**Required action:** Add one of the following to §9.2:
- A note: *"`FakeFileSystem` is pre-existing in `tests/fixtures/factories.ts` (from Phase X). Ensure `exists(path: string): Promise<boolean>` is present. Add `existsResults: Map<string, boolean> = new Map()` for per-path control if not already supported."*
- Or, a new `FakeFileSystem` definition in §9.2 with error-injection capability, if it is new.

**Non-blocking** — does not prevent engineering handoff if FakeFs pre-exists, but the ambiguity should be resolved.

---

## v1.3 Findings (Resolved in v1.4)

| ID | Severity | Status |
|----|----------|--------|
| F-08 | Medium | ✅ Resolved v1.4 — `buildAgentRegistry()` marked `async`; return type `Promise<{...}>` in §4.2.3 and §5.4 |
| F-09 | Medium | ✅ Resolved v1.4 — `'invocation-guard'` replaces `'dispatcher'` in `Component` union; explanatory comment added |
| F-10 | Low | ✅ Resolved v1.4 — `LogEntry.component: Component` (was `string`) |
| F-11 | Low | ✅ Resolved v1.4 — 2000-char chunk boundary test cases added to §9.3 ResponsePoster row |

---

## v1.3 Re-Review Summary (archived)

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

## Positive Observations (v1.4)

1. **All four v1.3 findings resolved cleanly in a single pass.** F-08 (async/sync mismatch), F-09 (`Component` union), F-10 (`LogEntry.component` typing), and F-11 (2000-char chunk boundary test cases) are all confirmed in the v1.4 changelog and verified in the spec text. The BE did not introduce regressions while addressing these.

2. **§4.2.6 `RoutingEngine` interface addendum is well-structured.** The decision to leave the public interface signatures unchanged and only update the constructor dependency is correct — it isolates the migration to the implementation class, keeping `FakeRoutingEngine` in tests untouched. The before/after comment style in the implementation snippet makes the behavioral change immediately clear.

3. **`Component` type comment in §4.2.3 is exemplary.** The note `// Note: 'invocation-guard' corresponds to invocation-guard.ts. There is no dispatcher.ts file; 'dispatcher' has been removed from the union.` directly pre-empts the confusion identified in F-09. Engineers reading the spec for the first time will not encounter the mapping ambiguity.

4. **`postSystemMessage()` removal guidance is actionable.** The instruction to grep the codebase for stale references before removing the implementation is exactly the right level of engineering guidance — not prescriptive about tooling but unambiguous about the required step.

5. **FakeLogger shared-store design is excellent.** The `forComponent()` → shared `FakeLogStore` pattern eliminates the need for per-component fake instances and enables structured assertions across all scoped loggers from a single `rootLogger.entries`. The anti-pattern warning is the right level of guidance for engineers. Once F-12 is resolved, the implementation will also compile correctly.

---

## Recommendation

**Needs revision.**

F-12 is Medium severity — a direct compile error in the test infrastructure. The `FakeLogger._component: string` type is incompatible with `LogEntry.component: Component` after the F-10 fix. Every `store.entries.push(...)` call in `FakeLogger` will fail type checking, and `new FakeLogger()` (the recommended root-logger instantiation) uses the invalid default `'test'`.

F-13 is Low and non-blocking, but the `FakeFileSystem` ambiguity should be resolved in the same revision pass to avoid implementation uncertainty.

The author must resolve F-12 (and optionally F-13) and route the updated TSPEC back for a final re-review pass before PROPERTIES derivation proceeds.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Test Engineer | Initial review of TSPEC v1.0 — Needs revision (3 Medium findings) |
| 1.1 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.1 — Approved with minor changes (F-07 Low, non-blocking) |
| 1.2 | March 17, 2026 | Backend Engineer | F-07 addressed in TSPEC v1.2 — `fromAgentDisplayName: 'Ptah'` fallback added to §9.3 ResponsePoster description. All TE findings resolved. |
| 1.3 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.3 — Needs revision. F-07 and PM F-08 confirmed resolved. New findings: F-08 (Medium — `buildAgentRegistry()` sync/async mismatch), F-09 (Medium — `invocation-guard` absent from `Component` union), F-10 (Low — `LogEntry.component: string`), F-11 (Low — 2000-char chunk boundary test case missing). |
| 1.4 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.4 — Needs revision. F-08, F-09, F-10, F-11 all confirmed resolved. New finding: F-12 (Medium — `FakeLogger._component: string` incompatible with `LogEntry.component: Component` after F-10 fix; compile error at all push call sites). F-13 (Low — `FakeFileSystem` referenced in §9.3 but not defined or cross-referenced in §9.2). |
| 1.5 | March 17, 2026 | Test Engineer | Re-review of TSPEC v1.5 — **Approved**. F-12 and F-13 confirmed resolved. No new findings. TSPEC approved for PROPERTIES derivation. |
