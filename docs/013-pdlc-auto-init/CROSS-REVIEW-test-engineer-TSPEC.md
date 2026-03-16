# Cross-Review: Test Engineer — TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) (v1.1, Draft) |
| **Requirements Referenced** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.2, Approved) |
| **FSPEC Referenced** | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (v1.2, Approved) |
| **Date** | 2026-03-15 |
| **Round** | 2 (reviewing v1.1 — revision in response to v1.0 findings) |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

TSPEC v1.1 correctly addresses all six findings and three clarification questions from the round-1 review. The `debug` method is now on the `Logger` interface (resolving F-01), UT-AG-06 is fully specified with a test body (resolving F-02), the AT-PI-04 unit-vs-integration split is clearly documented in §5.2, §7.2, §7.3, and §9.3 (resolving F-03), UT-ORC-SLUG-01 now includes the positive legacy-path assertion (resolving F-04), `createThreadMessage` is documented as an existing factory (resolving F-05), and UT-IDP-01 uses field-level assertions instead of reference equality (resolving F-06).

Two minor issues remain:

1. **F-07 (Low):** The code block in §4.4.3 calls `evaluateAgeGuard(threadHistory)` with one argument, but the function signature defined in §4.4.4 requires two: `evaluateAgeGuard(history: ThreadMessage[], logger: Logger)`. This is a documentation inconsistency — the call site is missing `this.logger` as the second argument. An engineer implementing from §4.4.3 alone will produce a TypeScript compile error.

2. **F-08 (Low):** The UT-ORC-AI-01 assertion on the auto-initialization info log (`expect(logger.messages.some(m => m.message.includes("Auto-initialized PDLC state"))).toBe(true)`) does not assert `m.level === "info"`. The info-level requirement is captured in REQ-PI-03 and §8, but the test body as written would pass even if the message were emitted at `warn` or `error` level. This is low severity because the level is specified elsewhere, but the test body should be consistent with the level-assertable pattern established for the debug log in UT-ORC-BC-01.

Both are one-line fixes and do not block implementation. The TSPEC is approved to proceed to implementation with these two corrections applied.

---

## Round-1 Finding Resolution Status

| Finding | Severity | Status | Evidence in v1.1 |
|---------|----------|--------|-----------------|
| F-01 — Logger `debug` interface gap | High | Resolved | §4.3 adds `debug` to `Logger` interface; `FakeLogger` updated in §7.2; `OQ-01` closed in §10; assertions in §7.2 and §7.4 use `m.level === "debug"` |
| F-02 — No test for `evaluateAgeGuard` fail-open path | High | Resolved | §7.3 table updated to UT-AG-01 through UT-AG-06; UT-AG-06 test body provided in §7.4 |
| F-03 — `FakePdlcDispatcher` cannot simulate AT-PI-04 race | Medium | Resolved | §7.2 documents the limitation explicitly; §5.2 explains the Node.js single-thread safety; AT-PI-04 split across UT-IDP-01/02 (unit) and IT-05 (integration) is clarified in §7.3 and §9.3 |
| F-04 — UT-ORC-SLUG-01 missing test body and positive assertion | Medium | Resolved | §7.4 provides full UT-ORC-SLUG-01 test body including `expect(routingEngine.decideCalls).toHaveLength(1)` |
| F-05 — `createThreadMessage` factory not documented | Low | Resolved | §7.2 documents `createThreadMessage` as existing factory; helpers are declared as wrappers |
| F-06 — UT-IDP-01 `toBe(first)` reference equality | Low | Resolved | UT-IDP-01 in §7.4 now asserts `second.config.discipline`, `second.config.skipFspec`, and `store.saveCount === 1` |
| Q-01 — Thread-name keyword parsing scope | Question | Resolved | §4.4.2 includes explicit scope constraint comment: thread-name parsing is out of scope; OQ-02 deferred |
| Q-02 — AT-PI-04 unit vs integration coverage | Question | Resolved | §5.2 and §7.3 AT-PI-04 coverage clarification note |
| Q-03 — `FakeStateStore.saveCount` existence | Question | Resolved | §7.2 documents `FakeStateStore` with `saveCount` field, including conditional note if already exists |

---

## Findings

### F-07 — Low: `evaluateAgeGuard` call in §4.4.3 is missing the `logger` argument

**Location:** TSPEC §4.4.3 (auto-init block code listing, line: `const guardResult = evaluateAgeGuard(threadHistory);`)

**Issue:**
Section 4.4.4 defines the function signature as:

```typescript
function evaluateAgeGuard(history: ThreadMessage[], logger: Logger): AgeGuardResult
```

The `logger` parameter is required because `evaluateAgeGuard` emits a `warn`-level log in its catch block and cannot access `this` as a module-level function. However, the call site in §4.4.3 reads:

```typescript
const guardResult = evaluateAgeGuard(threadHistory);
```

This is missing `this.logger` as the second argument. An engineer implementing the spec from §4.4.3 will write code that does not compile. The §5.1 behavioral flow diagram also omits the `logger` argument in the `evaluateAgeGuard()` call node, perpetuating the inconsistency.

**Required correction:**
Change the call in §4.4.3 to:
```typescript
const guardResult = evaluateAgeGuard(threadHistory, this.logger);
```
And update the §5.1 diagram node accordingly.

---

### F-08 — Low: UT-ORC-AI-01 log assertion does not verify log level

**Location:** TSPEC §7.4 (UT-ORC-AI-01 test body, final `expect`)

**Issue:**
The test assertion for the auto-initialization info log is:

```typescript
expect(logger.messages.some(m => m.message.includes("Auto-initialized PDLC state"))).toBe(true);
```

This asserts on message content only, not on `m.level`. REQ-PI-03 specifies that the auto-init log must be at `info` level. The analogous assertion in UT-ORC-BC-01 (age guard skip) correctly asserts both `m.level === "debug"` and message content. For consistency and to actually verify the requirement, the assertion should be:

```typescript
expect(logger.messages.some(m =>
  m.level === "info" &&
  m.message.includes("Auto-initialized PDLC state")
)).toBe(true);
```

Without the level check, a future refactoring that inadvertently emits this message at `warn` or `debug` level will not be caught by this test.

---

## Clarification Questions

None. All round-1 questions are resolved. No new questions arise from the v1.1 revision.

---

## Positive Observations

All observations from round 1 remain valid and are strengthened by the v1.1 additions:

- **All six findings addressed in a single revision pass.** The changelog entry in §1 (Change Log) is precise and maps each change back to its finding ID, making the review-response traceable.
- **UT-AG-06 test body is well-constructed.** Passing `null as unknown as ThreadMessage[]` to force the internal throw is a pragmatic approach that tests the catch block without requiring a separate injection seam. The comment explaining the mechanism is appropriately detailed.
- **AT-PI-04 split is now clearly documented in four places** (§5.2, §7.2, §7.3, §9.3). An implementer cannot miss the rationale for why the race scenario is exercised at the unit level rather than the integration level.
- **UT-IDP-01 field-level assertions are more durable.** The replacement of `toBe(first)` with discrete config field checks and `saveCount === 1` tests the actual invariants (no overwrite, single persist) rather than an implementation artifact (object identity). This is the correct design.
- **§4.4.2 scope constraint is now explicit.** The note ruling out thread-name keyword parsing with a forward reference to OQ-02 is exactly the kind of defensive documentation that prevents scope creep during implementation.
- **Error handling table (§6)** is now complete and the log-level column is consistent with the updated implementation: `debug` for skip and idempotency, `warn` for fail-open and debug-channel failure, `error` for filesystem write failure.

---

## Recommendation

**Approved with minor changes.**

F-07 and F-08 are both single-line corrections that can be made during the implementation pass without a formal document revision cycle:

- F-07: Add `this.logger` as the second argument to the `evaluateAgeGuard` call in §4.4.3, and update the §5.1 diagram.
- F-08: Add `m.level === "info" &&` to the UT-ORC-AI-01 log assertion in §7.4.

Neither finding affects the architectural decisions, test strategy, or any acceptance criteria. The TSPEC is sound and sufficiently detailed for an engineer to implement and test the feature directly from the document.
