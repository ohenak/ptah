# Cross-Review: test-engineer — FSPEC

**Reviewer:** test-engineer
**Document reviewed:** docs/in-progress/message-acknowledgement/FSPEC-message-acknowledgement.md
**Date:** 2026-04-21
**Iteration:** 2

---

## Prior Findings — Resolution Status

| Prior ID | Severity | Status | Notes |
|----------|----------|--------|-------|
| F-01 | High | Resolved | AT-MA-01/02/06 Given clauses now describe slug-based ID derivation (`featureSlug: "test-feature"` → `ptah-test-feature`). No fake injection property required. |
| F-02 | High | Resolved | AT-MA-16 added covering dual-failure scenario (both `addReaction` and `replyToMessage` throw). Two independent WARN log assertions plus non-throw return. |
| F-03 | Medium | Resolved | AT-MA-13 now uses deferred-promise approach — assertions at suspension point before resolve vs. after. No cross-fake sequence counter required. |
| F-04 | Medium | Resolved (with new issue) | AT-MA-03 Then clause extended to assert both `replyToMessageCalls` and `postPlainMessageCalls` empty (per-message filtered). However, the `postPlainMessageCalls` filter expression contains a field name error — see F-01 below. |
| F-05 | Medium | Resolved | `channelId = message.threadId` mapping documented in FSPEC-MA-01 through FSPEC-MA-05, BR-10, and Section 1 Implementation Note. |
| F-07 | Low | Carried | No AT for non-Error, non-string thrown values (number, null, undefined). Unchanged from v1. |
| F-09 | Low | Carried | Sequential vs. concurrent ordering of `addReaction`/`replyToMessage` not explicitly stated in FSPEC body. Unchanged from v1. |

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | Medium | AT-MA-03 `postPlainMessageCalls` filter references wrong field name. The Then clause reads `FakeDiscordClient.postPlainMessageCalls.filter(c => c.channelId === message.threadId)`. The `postPlainMessageCalls` array has entry type `{ threadId: string; content: string }` (factories.ts line 640). There is no `channelId` property. The expression `c.channelId` evaluates to `undefined` for every entry, so the filter always returns an empty array — the assertion passes regardless of actual behavior, providing no coverage. The correct field is `c.threadId`. | AT-MA-03, Section 8 |
| F-02 | Low | AT-MA-06 title misleadingly references truncation. The title reads "Error reply — `start workflow` operation label and truncation", but the test exercises a 17-character error message (`"connection timeout"`) which is far below the 200-character threshold. No truncation behavior is exercised. Truncation is properly covered by AT-MA-08 and AT-MA-09. The title should be "Error reply — `start workflow` operation label" to avoid implying this test validates truncation. | AT-MA-06 |
| F-03 | Low | Sequential vs. concurrent ordering of acknowledgement calls not stated. The FSPEC changelog notes "REQ-NF-17-01 allows concurrent acknowledgement calls" (v1.0 entry), but no section of the FSPEC body states whether `addReaction` and `replyToMessage` must be issued sequentially (await-then-await) or may be issued concurrently (e.g. `Promise.all`). The flow diagrams in Sections 3.1–3.3 show sequential calls, but this is diagram convention, not a stated requirement. An implementer using `Promise.all` would still pass all ATs (AT-MA-12's independence guarantee holds either way), meaning the implementation could silently diverge from the design intent without any test catching it. FSPEC-MA-06 Independence row addresses error isolation but not call ordering. | FSPEC-MA-01, FSPEC-MA-02, FSPEC-MA-06, Section 3 |
| F-04 | Low | No AT for non-Error, non-string thrown values in `String(err)` branch. AT-MA-10 exercises a thrown string literal. FSPEC-MA-05 and BR-05 specify `String(err)` for any non-Error thrown value, which includes numbers, plain objects, `null`, and `undefined`. `String(null)` evaluates to `"null"`; `String(undefined)` evaluates to `"undefined"`; `String({})` evaluates to `"[object Object]"`. Each is a distinct behavior that could hide a bug (e.g. accessing `.message` on `null` would throw instead of using `String(null)`). One additional AT covering a non-string, non-Error thrown value (e.g. a plain object `{ code: 503 }`) would close this gap. | AT-MA-10, FSPEC-MA-05, BR-05 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | AT-MA-06 title references truncation but the test does not exercise it. Was this intentional (combined label for the overall error-reply format group) or a title carried over from a prior draft? Recommend retitling for clarity. |
| Q-02 | Should `addReaction` and `replyToMessage` be sequential (each awaited before the next is called) or may they be concurrent (`Promise.all`)? The FSPEC changelog permits concurrent calls but the body never states a requirement either way. If the design intent is sequential, a brief statement in FSPEC-MA-01 or FSPEC-MA-06 would close the ambiguity; if concurrent is acceptable, the flow diagrams could note that ordering is not required. |

---

## Positive Observations

- F-01 through F-05 from the v1 review are addressed substantively, not superficially. The deferred-promise approach in AT-MA-13 is a clean, low-infrastructure solution that accurately models the ordering guarantee without coupling the two fakes.
- AT-MA-16 is well-formed: independent WARN log assertions for each ack failure plus an explicit non-throw return assertion. The Given clause correctly sets both `addReactionError` and `replyToMessageError` on separate properties, confirming that each call is wrapped independently.
- The Implementation Note in Section 1 is directly actionable. Naming `handleMessage()`-level acknowledgement as the specific anti-pattern to avoid — and explaining why it produces a false ✅ — is exactly the level of guidance that prevents misimplementation.
- The explicit `channelId = message.threadId` annotation in FSPEC-MA-01 through FSPEC-MA-05 (and BR-10) closes the implementation ambiguity identified in the prior F-05. Listing the excluded alternative (`NOT message.parentChannelId`) is the right precision.
- The out-of-scope section (Section 2.2 items 11–14 and Section 7) now covers all four previously unaddressed code paths (`WorkflowExecutionAlreadyStartedError`, `phaseDetector.detect()` failure, ad-hoc directive, silent drop). Each entry names the existing behavior to be preserved, which is directly useful for test authors who need to write no-regression tests.
- BR-06 and FSPEC-MA-05 truncation scope clarification (applies to `{error message}` portion only, not the full reply string) resolves the prior F-06 ambiguity. The boundary-condition tests AT-MA-08 and AT-MA-09 remain the authoritative truncation coverage.

---

## Recommendation

**Approved with Minor Issues**

> F-01 (Medium): The `postPlainMessageCalls` filter in AT-MA-03 uses `c.channelId` which does not exist on that type — the assertion is a no-op that will always pass. Fix the filter to `c.threadId === message.threadId` before implementation begins, otherwise the no-reply guarantee for the `postPlainMessage` path is untested.
>
> F-02 and F-03 (Low): Title and concurrency-ordering clarifications are recommended but do not block TSPEC authoring.
>
> F-04 (Low): A single additional AT for a non-string, non-Error thrown value is recommended for completeness but is not blocking.
>
> All High and Medium findings from v1 are resolved. The document is ready to proceed to TSPEC authoring once F-01 is corrected.
