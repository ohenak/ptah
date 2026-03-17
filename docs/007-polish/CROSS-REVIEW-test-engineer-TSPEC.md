# Cross-Review: Test Engineer — TSPEC-PTAH-PHASE7 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.0 |
| **REQ Reference** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reference** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.1 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

The TSPEC is well-structured and covers the six Phase 7 deliverables with appropriate technical depth. The test double designs (`FakeLogger`, `FakeDiscordClient`, `FakeAgentRegistry`, `FakeResponsePoster`) are all protocol-based and testable in isolation — exactly the right pattern. The `FakeLogger` shared-store design with structured `{ component, level, message }` capture is particularly good.

However, three medium-severity issues prevent approval:

1. Three test files in §9.3 are absent from the §3 project structure — the implementation scope is incomplete
2. `AgentValidationError` is referenced in the `buildAgentRegistry()` signature but never defined — engineers cannot implement or test this function without it
3. OQ-TSPEC-04 is left as "Needs audit" — unresolved routing context question must be settled before `postRoutingNotificationEmbed()` callers can be correctly implemented and tested

All three are fixable with targeted amendments. No structural changes to the TSPEC are needed.

---

## Findings

### F-01 (Medium) — Three test files missing from §3 project structure

**Affected:** §3 Project Structure vs. §9.3 Test Categories

The project structure lists four unit test files under `tests/unit/`:

```
├── agent-registry.test.ts        NEW
├── error-messages.test.ts        NEW
├── response-poster.test.ts       UPDATED
└── orchestrator.test.ts          UPDATED
```

However, §9.3 Test Categories specifies tests in three additional files that are **not listed in §3**:

| File | §9.3 Reference | Status in §3 |
|------|---------------|--------------|
| `tests/unit/logger.test.ts` | "Logger unit — `forComponent()` returns scoped logger; FakeLogger shared-store behavior; ComponentLogger format string" | ❌ Absent |
| `tests/unit/config-loader.test.ts` | "Config migration unit — New schema parsed; old schema rejected; validation errors; `llm` section" | ❌ Absent |
| `tests/integration/routing-loop.test.ts` | "Integration — Full lifecycle: message received → archived; multi-agent routing traceable via logs" | ❌ Absent; also `tests/integration/` directory not listed |

The `logger.test.ts` gap is particularly significant: the Logger refactor (`forComponent()`, `ComponentLogger` format) is the second-largest engineering surface in Phase 7. Without an explicit test file in the project structure, this surface could be under-tested or completely missed during implementation.

**Action required:** Add all three missing test files to §3, including the `tests/integration/` directory. Update `factories.ts` status if `FakeLogger` is NEW (not just UPDATED) to reflect that `forComponent()` and structured capture are new behaviors.

---

### F-02 (Medium) — `AgentValidationError` type undefined

**Affected:** §5.4 `buildAgentRegistry()` Algorithm, §4.2.3

The `buildAgentRegistry()` function signature in §4.2.3 references an `AgentValidationError` type:

```typescript
export function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): { registry: AgentRegistry; errors: AgentValidationError[] }
```

`AgentValidationError` is never defined anywhere in the TSPEC. It is not present in the types listed for `src/types.ts` in §4.2.3, nor in §3.

**Testing impact:** Without a type definition, engineers cannot:
- Know the shape of error records returned from `buildAgentRegistry()`
- Write `agent-registry.test.ts` assertions against the errors array (e.g., `expect(errors[0].field).toBe('id')`, `expect(errors[0].index).toBe(0)`)
- Distinguish validation error categories (missing field, invalid format, duplicate, file not found)

At minimum, the type needs: the triggering entry index, the field or validation rule that failed, and the error kind (so tests can assert the right error was produced for each invalid input).

**Action required:** Define `AgentValidationError` in §4.2.3 (or §3 types.ts additions). Suggested minimum shape:

```typescript
export interface AgentValidationError {
  index: number;          // position in the agents[] array
  agentId?: string;       // set if id was parseable; undefined if id itself was missing/invalid
  field: string;          // which field failed (e.g., 'id', 'skill_path', 'mention_id')
  reason: string;         // human-readable description (e.g., 'missing required field', 'duplicate id')
}
```

---

### F-03 (Medium) — OQ-TSPEC-04 is unresolved: `postProgressEmbed()` callers may lack routing context

**Affected:** §12 Open Questions (OQ-TSPEC-04), §4.2.4 ResponsePoster Protocol

OQ-TSPEC-04 states:

> "Are there callers of `postProgressEmbed()` that don't have from/to agent context? **Needs audit:** All `postProgressEmbed()` call sites must be reviewed during implementation."

The question is left open. From a test design perspective, this is a blocking gap:

`postRoutingNotificationEmbed()` takes structured `{ fromAgentDisplayName, toAgentDisplayName }` params. If some existing callers had only a free-form message string, those callers now have two possible implementations:
1. Refactored to provide agent context → testable under the `postRoutingNotificationEmbed()` contract
2. Fall back to `fromAgentDisplayName: 'Ptah'` → requires an additional test case asserting the fallback display name is used

Without resolving this before TSPEC is approved, properties derivation (PROPERTIES document) cannot enumerate all `postRoutingNotificationEmbed()` properties, and the `response-poster.test.ts` test script list will be incomplete.

**Action required:** Resolve OQ-TSPEC-04 with a definitive answer:
- If all call sites have agent context: close the question with "Confirmed: all call sites have from/to agent context" and no further action
- If any call site lacks context: document the fallback behavior explicitly (e.g., "fallback `fromAgentDisplayName` is `'Ptah'`") and add it as a testable property in §9.3 `response-poster.test.ts` test cases

A code grep of the existing implementation during TSPEC revision (before implementation begins) would resolve this in minutes.

---

### F-04 (Low) — `FakeLogger.forComponent()` uses `string` instead of `Component` type

**Affected:** §9.2 FakeLogger

The `FakeLogger` definition shows:

```typescript
forComponent(component: string): FakeLogger {
  return new FakeLogger(component, this.store); // shares store
}
```

The `Logger` protocol (§4.2.1) defines `forComponent(component: Component): Logger` where `Component` is a strict union type (`'orchestrator' | 'router' | ...`).

The fake's `forComponent` accepts any `string`, while the protocol requires a `Component` value. This means tests using `fakeLogger.forComponent('invalid-component')` will compile without error when the production code would reject the call (assuming TypeScript enforces the `Component` type).

This is Low because: (a) tests are test code, not production paths, and (b) the structured `{ component, level, message }` capture still works correctly. However, using `Component` type in the fake would give compile-time checking that tests use valid component names — a meaningful guard when writing observability assertions.

**Action required (optional):** Change `forComponent(component: string)` to `forComponent(component: Component)` in the `FakeLogger` definition to match the protocol type. This is non-breaking — all valid component names are valid `string` values.

---

### F-05 (Low) — `EmbedType` listed in §3 but never defined

**Affected:** §3 Project Structure, `src/types.ts` update list

The `types.ts` update comment in §3 includes `EmbedType` as a new type:

```
└── types.ts  UPDATED — AgentEntry, RegisteredAgent, Component, LogLevel,
                        LogEntry, EmbedType, UserFacingErrorType
```

`EmbedType` is never defined in §4 (the protocol specifications) and is not used in the `ResponsePoster` interface (§4.2.4), which uses distinct methods per embed type rather than a type parameter. There is no test or protocol referencing `EmbedType`.

**Testing impact:** Low — if `EmbedType` does not exist, no tests are affected. But if it is intended as an export (e.g., for `response-poster.test.ts` assertions), its shape must be defined.

**Action required:** Either define `EmbedType` in §4.2.4 (e.g., `export type EmbedType = 'routing' | 'resolution' | 'error' | 'escalation'`) with its intended usage, or remove it from the §3 types update list if it was included by mistake.

---

### F-06 (Low) — No test case specified for log message truncation boundary (EVT-OB-01, EVT-OB-08)

**Affected:** §7 Observability Log Events (EVT-OB-01, EVT-OB-08), §9.3 Test Categories

Two log event templates truncate content at 100 characters:
- EVT-OB-01: `Content: "{first100chars}…"`
- EVT-OB-08: `Question: "{first100chars}…"`

The `…` ellipsis is appended. But there is no test case specified for the boundary condition: when content is ≤ 100 characters, no ellipsis should be appended. `§9.3` mentions observability tests in `orchestrator.test.ts` but does not explicitly list this boundary as one of the checked behaviors.

**Action required (optional):** Add an explicit mention in §9.3 that EVT-OB-01 and EVT-OB-08 observability tests include: (a) content > 100 chars → truncated with `…`, and (b) content ≤ 100 chars → no truncation or ellipsis.

---

## Clarification Questions

### Q-01 — `FakeLogger` constructor signature vs. `Logger` protocol

The `FakeLogger` constructor takes `(component: string = 'test', store?: FakeLogStore)`. The `Logger` protocol has no constructor — it is created via `forComponent()` on a root logger.

At the composition root, the `ConsoleLogger` (implementing `Logger`) is passed to each module as a dependency. Modules call `this.log = deps.logger.forComponent('component-name')` in their constructors.

In tests, does the engineer pass a `new FakeLogger('component-name')` directly (bypassing `forComponent()`), or always construct `new FakeLogger()` and call `.forComponent('component-name')` on it?

If the former (direct construction), the shared-store benefit is lost unless the test also uses the returned scoped logger. Clarify the expected usage pattern in a short example, e.g.:

```typescript
// Option A — direct (loses shared-store for modules that call forComponent internally)
const fakeLogger = new FakeLogger('skill-invoker');
const deps = { logger: fakeLogger, ... };

// Option B — root + forComponent (correct shared-store pattern)
const rootLogger = new FakeLogger();
const deps = { logger: rootLogger, ... }; // module will call forComponent() internally
// then assert: rootLogger.entries for all captured entries
```

This is not blocking — but a usage example in §9.2 would prevent common test setup mistakes.

---

### Q-02 — Integration test scope for `routing-loop.test.ts`

§9.3 specifies: "Full lifecycle: message received → archived; multi-agent routing traceable via logs."

The integration test description is deliberately brief. For PROPERTIES derivation, two questions:
1. Does `routing-loop.test.ts` use real file I/O (e.g., writing to a temp directory), or are all external boundaries faked via the same test doubles defined in §9.2?
2. Does the integration test wire up `buildAgentRegistry()` directly (testing the real config parser end-to-end), or inject a `FakeAgentRegistry`?

The answer determines which integration properties are covered by this test vs. unit tests. If all boundaries are faked, the "integration" test is really a cross-module unit test. If real I/O is used (e.g., a temp `ptah.config.json`), it should be mentioned so the test can be properly classified in the PROPERTIES coverage matrix.

---

## Positive Observations

1. **Test doubles are comprehensively designed.** All four fakes (`FakeLogger`, `FakeDiscordClient`, `FakeAgentRegistry`, `FakeResponsePoster`) are protocol-based with constructor injection, call recording, and error injection. This is the right pattern. The `FakeLogger` shared-store design is especially good — it allows asserting across all scoped loggers from a single `rootLogger.entries` array.

2. **`buildErrorMessage()` is a pure function.** The explicit design rule — "never receives `Error` objects, stack traces, or raw exception messages" — is the most important testability decision in the TSPEC. A pure function over controlled input → structured output is trivially unit-testable. The 5-row template table maps directly to 5 test cases with no edge cases about error propagation or async behavior.

3. **`buildAgentRegistry()` returns errors as data.** Returning `{ registry, errors }` rather than throwing on validation failures is the correct design for testability. Tests can assert both the registry contents and the error array without needing to catch exceptions. This also ensures partial-valid input (some valid entries, some invalid) is fully testable.

4. **Error handling table (§8) is complete and precise.** Every failure mode has: component, behavior, log level, and whether a Discord message is produced. This table directly drives property derivation — each row is a testable property at the unit level.

5. **10 observability events with exact log message templates.** The message templates in §7 have enough precision (component, level, required field substitutions) to write deterministic string-matching assertions. `FakeLogger.entries` can be filtered by component + level, then matched against the template pattern. This turns observability requirements into first-class testable properties.

6. **Config migration strategy is explicit.** Hard cut-over with no compatibility shim, documented consumer update table (§5.3). Each row in the consumer update table is a refactoring task with a before/after access pattern — unambiguous for engineers and straightforward to verify during code review.

7. **Thread archiving is idempotent by design.** The registry check before `archiveThread()` (§6, step 3) prevents redundant Discord API calls on duplicate resolution signals. This is the right pattern — idempotency is enforced at the application layer, not by relying on Discord API behavior.

---

## Recommendation

**Needs revision.**

Three medium-severity findings (F-01, F-02, F-03) require targeted amendments before the TSPEC is ready for PROPERTIES derivation and engineering handoff:

1. **F-01:** Add the three missing test files (`logger.test.ts`, `config-loader.test.ts`, `tests/integration/routing-loop.test.ts`) to §3 project structure.
2. **F-02:** Define `AgentValidationError` type (minimum shape: `{ index, agentId?, field, reason }`).
3. **F-03:** Resolve OQ-TSPEC-04 with a definitive answer about `postProgressEmbed()` call sites.

All three amendments are small (additions, not restructuring) and do not require a full re-review. Once addressed, please confirm the updates in a reply and the test engineer will approve the TSPEC for PROPERTIES derivation.

The four low-severity findings (F-04 through F-07) are non-blocking. They can be addressed at TSPEC revision time or deferred to the PROPERTIES/PLAN stage.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Test Engineer | Initial review |
