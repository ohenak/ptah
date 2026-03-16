# Cross-Review: Product Manager — TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (`pm`) |
| **Document Reviewed** | [013-TSPEC-pdlc-auto-init](013-TSPEC-pdlc-auto-init.md) (v1.0, Draft) |
| **Requirements Referenced** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.2, Approved) |
| **FSPEC Referenced** | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (v1.2, Approved) |
| **Date** | 2026-03-15 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The TSPEC is thorough, well-structured, and faithfully reflects the intent of the requirements and functional specification across nearly all areas. The algorithm descriptions, race condition analysis, error handling table, and test strategy are accurate and implementable. There is one product-level deviation (F-01) that requires explicit product approval before implementation begins — specifically, the TSPEC's resolution for the `debug` log level in REQ-BC-02. Two additional low-severity observations are noted below.

---

## Findings

### F-01 — High: REQ-BC-02 log level deviation requires product sign-off before implementation

**Location:** TSPEC §4.3, §4.4.3, §8 (REQ-BC-02 row), OQ-01

**Issue:**
REQ-BC-02's acceptance criteria explicitly state:
> *"The log level must be `debug` (not `info` or `warn`) and must be assertable via the test logger spy."*

The TSPEC acknowledges that the `Logger` interface lacks a `debug` method and resolves this (OQ-01) by emitting the "skipped auto-init" message at `info` level with a distinguishing prefix, deferring the Logger interface fix to a future feature. Section 8 maps REQ-BC-02 to `logger.info(...)`.

This is a product-level change: the accepted behavior is an observable output (log level) that developers and operators use to filter noise in production. Using `info` for a routine, high-frequency skip path would pollute info-level log streams — the reason the requirement specified `debug` in the first place.

**Resolution required (choose one):**
1. **Preferred:** Add a `debug` method to the `Logger` interface in this feature. The TSPEC correctly notes this is "architecturally correct" — it is also small in scope (add the method stub, implement in all concrete loggers, done). This resolves OQ-01 without a requirement change and keeps REQ-BC-02 as written.
2. **Alternative:** Raise a product change request to REQ-BC-02 to accept `info` level with a distinguishing prefix. I will update the REQ AC accordingly. This must be approved before implementation proceeds — the TSPEC may not unilaterally downgrade the log level.

The same issue applies to the idempotency log in §4.4.5 (the `this.logger.debug ? ... : logger.info(...)` runtime check), which is a symptom of the same root cause.

**Action:** Do not proceed with `info` as the final resolution unless Option 2 is explicitly approved. Preferred path is Option 1.

---

### F-02 — Low: Dual code blocks in §4.4.3 create implementation ambiguity

**Location:** TSPEC §4.4.3

**Issue:**
Section 4.4.3 presents two code blocks for the auto-init implementation in `executeRoutingLoop()`: an "illustrative" version (the double `isManaged()` re-check pattern) followed by a separate "cleaner production implementation" using `effectivelyManaged`. The TSPEC notes the second is preferred, but having both in the spec creates a risk that an engineer implements the first.

**Suggested resolution:** Remove the first (illustrative) block entirely, or move it to a comment in the second block. The spec should commit to exactly one implementation shape.

---

### F-03 — Low: `debug?` runtime check in §4.4.5 is a code smell that should not be normative

**Location:** TSPEC §4.4.5 (`initializeFeature()` idempotency guard)

**Issue:**
The proposed idempotency guard uses `this.logger.debug ? this.logger.debug(...) : this.logger.info(...)` — a runtime duck-type check for a method that should exist on the interface. This pattern should never appear in production TypeScript against a typed interface; it is only needed because the interface is incomplete.

This is a downstream symptom of F-01. Resolving F-01 (Option 1: add `debug` to `Logger`) eliminates this check entirely.

**Suggested resolution:** Resolve via F-01 Option 1. Remove the conditional duck-type check from the spec once the interface is updated.

---

## Clarification Questions

None. All behavioral questions from prior review cycles have been resolved.

---

## Positive Observations

- **Complete requirement traceability:** The §8 mapping table covers all requirements (REQ-PI-01 through REQ-NF-03) with no gaps. Every functional requirement has a named component and implementation location.
- **Race condition analysis is accurate:** §5.2 correctly identifies the cross-thread concurrency scenario, explains the Node.js single-threaded event loop guarantee, and shows why the in-memory read-before-write guard in `initializeFeature()` is sufficient. This matches AT-PI-04's v1.2 rewrite exactly.
- **`evaluateAgeGuard` fail-open is correctly implemented:** The error handling in §4.4.4 (return `{ eligible: true }` on malformed history) matches FSPEC-BC-01's error scenario and fail-open rationale.
- **`threadHistory` reuse:** §4.4.3 explicitly cites FSPEC-PI-01's constraint against issuing a second `readThreadHistory()` call, and the implementation correctly reuses the variable already in scope. Cross-reference to BE cross-review F-03 is a nice trace.
- **No scope creep:** All changes remain within the two files permitted by C-01. No Feature 011 modules are modified.
- **Test strategy maps to FSPEC ATs:** The UT/IT IDs in §7.3 trace back to the FSPEC acceptance tests (AT-PI-01 through AT-DC-09) with no gaps.
- **`parseKeywords` null/undefined guard:** The function signature accepts `string | null | undefined` and returns default config for falsy input, correctly implementing FSPEC-DC-01's error scenario.

---

## Recommendation

**Approved with minor changes.**

F-01 is the only blocker. The preferred resolution is to add `debug` to the `Logger` interface in this feature (small scope, architecturally correct). Once that is confirmed, the TSPEC can move to Approved and implementation can proceed. F-02 and F-03 are low-severity and can be addressed in the same TSPEC revision.
