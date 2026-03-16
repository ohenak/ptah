# Cross-Review: Test Engineer — TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) (v1.0, Draft) |
| **Requirements Referenced** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.2, Approved) |
| **FSPEC Referenced** | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (v1.2, Approved) |
| **Date** | 2026-03-15 |
| **Recommendation** | **Needs revision** |

---

## Summary

The TSPEC is technically detailed and demonstrates a thorough understanding of the codebase. The algorithm descriptions for `countPriorAgentTurns`, `parseKeywords`, and `evaluateAgeGuard` are precise enough to write tests directly from the spec. The race-condition analysis and the `effectivelyManaged` flag pattern are sound. However, there are several testing-specific concerns that must be addressed before implementation proceeds:

1. **F-01 (High):** The `Logger` interface gap causes REQ-BC-02's log-level assertability to be degraded to `info`, violating the requirement's acceptance criteria. This is the same issue raised by the PM reviewer (PM-F-01), but from a testability perspective the impact is worse: the acceptance test for AT-BC-03 requires asserting `m.level === "debug"`, and the TSPEC as written makes that assertion impossible. The test suite would be forced to assert on message content only, losing the log-level signal.

2. **F-02 (High):** The `evaluateAgeGuard` fail-open error scenario (§4.4.4) is specified but lacks a corresponding test case. The §7.3 table lists UT-AG-01 through UT-AG-05, but none maps to the malformed-history error path, and no integration test covers it either. This leaves the fail-open behavior untested.

3. **F-03 (Medium):** The `FakePdlcDispatcher` additions in §7.2 are insufficient for testing the AT-PI-04 (idempotency / concurrent init) scenario. The fake's `autoRegisterOnInit` flag updates `managedSlugs` synchronously after init, but the race scenario requires both instances to see `isManaged === false` before either completes init. The current fake design cannot simulate this.

4. **F-04 (Medium):** The §7.3 test table has no explicit test for the unresolvable-slug branch that logs nothing and falls through to the legacy path silently (§6, first two rows). UT-ORC-SLUG-01 is listed as covering "Falsy slug → no auto-init, no age guard" but no test body or key test case is provided. This path also needs to verify that the legacy `routingEngine.decide()` IS called (not just that `initializeFeature()` is NOT called).

5. **F-05 (Low):** The `parseKeywords` signature in §4.4.2 declares `text: string | null | undefined`, but the test helper in §7.2 only provides `createBotMessageWithRouting` and `createBotMessageNoRouting`. There is no `createUserMessage` helper, yet the key test case UT-ORC-AI-01 uses `createThreadMessage({ isBot: false, content: ... })`. The naming inconsistency between the helper list and the actual test case will cause confusion during implementation.

6. **F-06 (Low):** The idempotency unit test UT-IDP-01 asserts `expect(second).toBe(first)` (same object reference). This is too strict for a real `StateStore` implementation where each call might deserialize from disk, returning a structurally equal but referentially distinct object. The assertion should use `toEqual` with a deep-equality check and separately assert `saveCount === 1`.

---

## Findings

### F-01 — High: REQ-BC-02 log-level assertability is lost; test suite cannot verify requirement as written

**Location:** TSPEC §4.3, §4.4.3, §7.2 (FakeLogger assertions), §8 (REQ-BC-02 row), OQ-01

**Issue:**
REQ-BC-02's acceptance criteria state:
> *"The log level must be `debug` (not `info` or `warn`) and must be assertable via the test logger spy."*

The TSPEC resolves this by emitting the "skipped auto-init" message at `info` level, with the rationale that the `Logger` interface has no `debug` method. The §7.2 FakeLogger assertion example confirms the test will assert on `m.level === "info"`. This means the acceptance test for AT-BC-03 and AT-BC-04 cannot distinguish a skipped-init `info` log from any other `info`-level event — the only discriminator becomes message content.

From a testability standpoint, this is unacceptable: when the log level is a documented behavioral requirement, the test must assert that level precisely. Using `info` silently satisfies the content check while failing the level check, giving false confidence.

**Impact on test suite:**
The FakeLogger pattern in §7.2 would need to be written as:
```typescript
expect(logger.messages.some(m =>
  m.level === "info" &&   // <-- wrong: requirement says "debug"
  m.message.includes("[ptah] Skipping PDLC auto-init")
)).toBe(true);
```
Any future engineer reading this test will either believe `info` is correct (masking the gap) or will have to violate the test spec to write a passing test.

**Required resolution:**
Add `debug` to the `Logger` interface in this feature, as the PM reviewer (PM-F-01) also recommends. The scope is small: add the method to the interface, implement it in all concrete loggers (typically `ConsoleLogger`, `FakeLogger`, and any test stubs), and update the affected assertions in §7.2 and §8 to use `m.level === "debug"`. OQ-01 should be closed, not deferred.

---

### F-02 — High: No test case for `evaluateAgeGuard` fail-open error path

**Location:** TSPEC §4.4.4 (evaluateAgeGuard error handling), §7.3 (UT-AG test category), §7.4 (key test cases)

**Issue:**
Section 4.4.4 specifies:
> *"If `history` is malformed or an exception is thrown during counting, the guard returns `{ eligible: true }` (fail-open, per FSPEC-BC-01 error scenario). A warning is logged."*

This is an important safety behavior — it ensures a bug or unexpected input in history does not permanently block new features from being initialized. However, the §7.3 test table lists UT-AG-01 through UT-AG-05 as covering "0 turns, 1 turn (boundary), 2 turns (boundary), 5 turns, empty history". None of these maps to the error/malformed-history case. The FSPEC equivalent (AT-BC-05) is mapped in §7.3 to "UT-ORC-BC-01 to UT-ORC-BC-05 — AT-BC-01 through AT-BC-05 from FSPEC" at the orchestrator level, but the unit-level test for `evaluateAgeGuard` itself does not include an error-input case.

There is also no integration test that verifies the warning log is emitted (as required by the spec), or that routing still proceeds to the legacy path after the fail-open.

**Required addition:**
Add a test case to the UT-AG series, e.g.:

```
UT-AG-06: evaluateAgeGuard — malformed history (countPriorAgentTurns throws) → returns { eligible: true }, warning logged
```

And verify AT-BC-05 is covered at the orchestrator integration level with an assertion that:
1. `evaluateAgeGuard` returns `{ eligible: true }` (fail-open)
2. A `warn`-level log is emitted
3. `initializeFeature()` is still called (routing proceeds)

---

### F-03 — Medium: `FakePdlcDispatcher` cannot simulate the cross-thread concurrent idempotency scenario (AT-PI-04)

**Location:** TSPEC §7.2 (FakePdlcDispatcher additions), §7.3 (IT-01 to IT-05), §9.3

**Issue:**
AT-PI-04 requires testing the scenario where two routing loop calls for the same slug both see `isManaged === false` and both call `initializeFeature()`. The TSPEC's `FakePdlcDispatcher` design uses a synchronous `managedSlugs` set and an `autoRegisterOnInit` flag. With `autoRegisterOnInit = true`, the first call to `initializeFeature()` adds the slug to `managedSlugs`, so the second call would see `isManaged() === true` before ever calling `initializeFeature()`. This correctly simulates steady-state behavior but does NOT simulate the race condition where both calls have already passed the `isManaged` check and both proceed to `initializeFeature()`.

To simulate the race, the fake needs to support a mode where `isManaged()` always returns `false` (even after init) for a configurable number of calls, and `initializeFeature()` itself enforces idempotency internally. This means:
1. The idempotency test for AT-PI-04 should target `DefaultPdlcDispatcher.initializeFeature()` directly (UT-IDP-01/02) rather than the orchestrator routing loop.
2. The integration test IT-* should verify that `initializeFeature()` is called twice when `isManaged()` returns false twice, and that the second call returns the existing record without overwriting.

**Required addition:**
Either:
- Add a `managedAfterNthInit: number` control to `FakePdlcDispatcher` so that `isManaged()` returns `false` for the first N calls and `true` thereafter; or
- Explicitly document in §7.3 that AT-PI-04 is exercised at the unit level via `DefaultPdlcDispatcher.initializeFeature()` (UT-IDP-01/02) and the integration test only verifies the orchestrator-level observable (single record created, no overwrite).

---

### F-04 — Medium: UT-ORC-SLUG-01 lacks a test body and is missing a positive assertion for legacy path invocation

**Location:** TSPEC §7.3 (test table row for "Orchestrator unresolvable slug"), §6 (error handling table, first two rows)

**Issue:**
The §7.3 table includes:

| Orchestrator unresolvable slug | orchestrator.test.ts | UT-ORC-SLUG-01 | Falsy slug → no auto-init, no age guard |

No test body or key test case is provided for this scenario in §7.4. The negative assertions ("initializeFeature NOT called", "age guard NOT evaluated") are implied, but the critical positive assertion is missing: when the slug is unresolvable, the legacy path (`routingEngine.decide()`) MUST still be invoked so the message is not silently dropped.

Looking at the §4.4.3 implementation, an unresolvable slug (empty string) causes an early `continue` or `return`. The test must distinguish between:
- The orchestrator correctly falling through to the legacy path (expected behavior)
- The orchestrator silently dropping the message with no routing at all (a bug)

**Required addition:**
Provide a test body for UT-ORC-SLUG-01 in §7.4, including:
```typescript
expect(routingEngine.decideCalls).toHaveLength(1);   // legacy path was invoked
expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(0);  // auto-init not attempted
```

Note: The §4.4.3 implementation shows `continue` for unresolvable slug (staying in the routing loop, eventually hitting the legacy path), but it must be verified that `routingEngine.decide()` is actually reached — the test body must assert this explicitly.

---

### F-05 — Low: Thread message factory helpers are inconsistently named relative to test case usage

**Location:** TSPEC §7.2 (thread message factory helper), §7.4 (UT-ORC-AI-01 test body)

**Issue:**
Section 7.2 defines two helpers:
- `createBotMessageWithRouting()`
- `createBotMessageNoRouting()`

But the key test case UT-ORC-AI-01 in §7.4 uses `createThreadMessage({ isBot: false, content: ... })` — a different factory that is not defined in this section. A reader implementing tests from the TSPEC will be uncertain whether `createThreadMessage` already exists in `factories.ts`, whether it needs to be added, and what its relationship is to the two new helpers.

**Required clarification:**
Document `createThreadMessage` (or its equivalent) as an existing factory in `factories.ts`, and clarify whether `createBotMessageWithRouting` and `createBotMessageNoRouting` are aliases or wrappers around it. The test-double section should be the single source of truth for all factories needed by this feature's tests.

---

### F-06 — Low: UT-IDP-01 uses `toBe` (reference equality) where `toEqual` (deep equality) is appropriate

**Location:** TSPEC §7.4 (UT-IDP-01 test body)

**Issue:**
The UT-IDP-01 test asserts:
```typescript
expect(second).toBe(first);  // same object reference
```

In a real `DefaultPdlcDispatcher` backed by a file-based `StateStore`, the second call to `initializeFeature()` reads from `this.state!.features[slug]` — which is the same in-memory object reference that was stored in the first call. So `toBe` is technically correct for the unit test with a fake store. However:

1. The comment `// same object reference` is load-bearing for correctness — if `initializeFeature()` were ever refactored to clone the returned state (a reasonable defensive practice), this test would break spuriously.
2. The more durable and intention-revealing assertion is deep equality on the config fields plus save count:
```typescript
expect(second.config.discipline).toBe("backend-only");  // not overwritten
expect(second.config.skipFspec).toBe(false);            // not overwritten
expect(store.saveCount).toBe(1);                        // only saved once
```

**Suggested resolution:** Replace `toBe(first)` with field-level assertions. The `saveCount === 1` assertion is already present and is the most important invariant; the reference equality check is redundant and fragile.

---

## Missing Test Coverage

The following test cases should be added to the spec:

| Gap | Proposed Test ID | Rationale |
|-----|-----------------|-----------|
| `evaluateAgeGuard` — malformed/throwing history input | UT-AG-06 | Fail-open behavior is specified in §4.4.4 but has no test |
| `parseKeywords` — `[skip-fspec]` appears twice | UT-KW-10 | Idempotent `skipFspec = true`; the FSPEC edge-case table lists it but the test table does not |
| Unresolvable slug — legacy path IS invoked (positive assert) | UT-ORC-SLUG-01 (body needed) | Current spec only has negative assertions; must confirm message is not silently dropped |
| Age guard ineligible + `routingEngine.decide()` is called | Covered by UT-ORC-BC series, but body should be provided | Ensures ineligible branch correctly falls through to legacy path, not just "does not init" |
| `postToDebugChannel` failure — warn logged, routing proceeds | UT-ORC-AI-05 / IT-* | §6 specifies this behavior; it is mapped but no test body provided |

---

## Clarification Questions

### Q-01: How does `parseKeywords` handle `[skip-fspec]` appearing in the thread name vs. initial message?

The TSPEC says keyword parsing is applied to the `initialMessage?.content`, and the FSPEC (BR-DC-06) constrains parsing to the first user message. However, the FSPEC open question OQ-02 notes that keyword parsing from the thread name is deferred. The TSPEC should explicitly state that thread-name keyword parsing is out of scope and add a comment to `parseKeywords` noting this, so an implementing engineer does not inadvertently add thread-name scanning.

### Q-02: Is `UT-ORC-AI-01` to `UT-ORC-AI-06` the complete coverage of AT-PI-01 through AT-PI-06, or are some ATs exercised only at the integration test level?

The §7.3 table maps `UT-ORC-AI-01 to UT-ORC-AI-06` to `AT-PI-01 through AT-PI-06 from FSPEC`, but AT-PI-04 (concurrent init) is structurally different from the others (it requires two concurrent calls). The spec should clarify whether AT-PI-04 is fully covered by UT-IDP-01/02 at the unit level and simply referenced as covered in the orchestrator test, or if there is a distinct orchestrator-level AT-PI-04 test body.

### Q-03: Does the §9.2 integration point guarantee that `FakeStateStore` tracks save calls?

UT-IDP-01 asserts `store.saveCount === 1`. The spec references `FakeStateStore` but does not define it or confirm it has a `saveCount` field. If `FakeStateStore` comes from the Feature 011 test suite and already has this spy capability, the TSPEC should cite that. If not, it needs to be added to the §7.2 test doubles section.

---

## Positive Observations

- **Algorithm precision:** The `countPriorAgentTurns` and `parseKeywords` descriptions are deterministic and leave no implementation ambiguity. An engineer can write the implementation directly from §4.4.1 and §4.4.2 without consulting the FSPEC.
- **`effectivelyManaged` flag pattern:** The preferred implementation pattern in §4.4.3 correctly avoids a second `isManaged()` call and clearly maps `initializeFeature()` success to the managed path. This is the right design.
- **Race condition analysis (§5.2):** The Node.js single-threaded event loop reasoning is correct and the two-call sequence is explained clearly. This gives an implementer confidence in the in-memory guard without needing a mutex.
- **Error handling table (§6):** All the scenarios from the FSPEC and REQ are represented. The "silent" treatment of unresolvable slugs (no log, fall through) is correctly distinct from the age-guard skip (which does log).
- **Requirement traceability (§8):** Complete — every REQ-PI, REQ-BC, REQ-DC, and REQ-NF entry is mapped to a component and location. No gaps.
- **`threadHistory` reuse note:** The explicit callout in §4.4.3 and §9.1 that the existing `threadHistory` variable must be reused (no second `readThreadHistory()` call) is exactly the kind of constraint that prevents a subtle performance bug.
- **`parseKeywords` null/undefined guard:** Accepting `string | null | undefined` and returning default config for falsy input correctly matches the FSPEC edge case and prevents the calling code from needing null checks before invoking the function.
- **Test-first ordering in §7.1:** The specified order (pure helpers → `evaluateAgeGuard` → idempotency → orchestrator integration) is the correct dependency-driven order for test-driven development. An engineer can follow this sequence directly.

---

## Recommendation

**Needs revision.**

F-01 and F-02 are blockers from a testability standpoint:

- F-01: The `Logger` interface gap must be resolved before implementation. Emitting the skip log at `info` level produces a test suite that cannot assert the requirement as written (REQ-BC-02). The fix is small — add `debug` to the `Logger` interface — and should be done in this feature.
- F-02: The fail-open `evaluateAgeGuard` error path is a correctness guarantee that must have a test. It is specified behavior with no corresponding test ID, which means it will not be verified at implementation time.

F-03 and F-04 require TSPEC updates (additional test bodies or `FakePdlcDispatcher` design clarification) but do not block the Logger interface decision. F-05, F-06, and the missing coverage items are low-severity and can be resolved in the same revision pass.

Suggested revision scope for TSPEC v1.1:
1. Resolve OQ-01 by adding `debug` to the `Logger` interface and updating all affected sections (§4.3, §4.4.3, §4.4.5, §7.2, §8).
2. Add UT-AG-06 (fail-open malformed history) to the test category table and §7.4.
3. Clarify the AT-PI-04 fake design gap in §7.2 and §9.3.
4. Provide a test body for UT-ORC-SLUG-01 with positive legacy-path assertion in §7.4.
5. Remove the dual code block ambiguity in §4.4.3 (as PM-F-02 also recommends).
6. Address F-05 and F-06 as minor cleanup in the same pass.
