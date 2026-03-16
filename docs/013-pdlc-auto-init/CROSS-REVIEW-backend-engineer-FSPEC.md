# Cross-Review: Backend Engineer → FSPEC

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | `013-FSPEC-pdlc-auto-init.md` (v1.1, Draft) |
| **Review Round** | 3 (re-review following FSPEC v1.1 update) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

FSPEC v1.1 resolves all four blocking and secondary findings from round 2, plus all five open TE findings folded into the same revision pass. The agent-turn definition now correctly uses `isBot === true AND content contains <routing> tag`; the "initial message" is consistently typed as the first chronological message with `isBot === false`; the debug channel config key is cited in the Output section; AT-BC-03 includes the debug log assertion; AT-DC-09 covers the reverse keyword conflict; and AT-PI-01 asserts the resulting `FeatureConfig`. The core behavioral logic is sound and implementation-ready.

Two issues require attention before the TSPEC is authored. The higher-severity issue is a gap between the FSPEC's idempotency specification and the actual `initializeFeature()` implementation in the codebase. The lower-severity issue is a missing note about reusing the already-fetched `threadHistory` — an implementation detail that the TSPEC must capture to avoid an unnecessary second Discord API call.

---

## Status of Round-2 Findings

| Finding | Round-2 Severity | Current Status | Notes |
|---------|-----------------|---------------|-------|
| F-01: FSPEC-BC-01 agent-turn definition used non-existent `role` field | High | **Resolved** | v1.1 updated to `isBot === true AND content contains <routing> tag` |
| F-02: idempotent `initializeFeature()` return value unspecified | Low | **Partially resolved** | v1.1 text correctly specifies "returns existing FeatureState without modification (it does not throw)"; however the actual code in `pdlc-dispatcher.ts` does not implement this guard (see F-01 below) |
| F-03: "initial message" definition inconsistent and incorrectly typed | Medium | **Resolved** | v1.1 consistently uses `isBot === false` throughout PI-01, DC-01 Description, and BR-DC-06 |
| F-04: debug channel config key unspecified | Low | **Resolved** | v1.1 Output section cites `this.config.discord.channels.debug` |

---

## Findings

### F-01 — **High** — `initializeFeature()` idempotency guard is specified but not implemented

**Location:** FSPEC-PI-01 — Edge Cases (race condition row); REQ-PI-05

The FSPEC v1.1 edge case row correctly states:

> *"The second call detects the record and returns the existing `FeatureState` without modification (it does not throw). The orchestrator treats this as a successful no-op and proceeds to the managed PDLC path with the existing state record."*

However, the actual `DefaultPdlcDispatcher.initializeFeature()` implementation in `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` (lines 165–172) has no check-before-write guard:

```typescript
async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
  this.ensureLoaded();
  const now = new Date().toISOString();
  const featureState = createFeatureState(slug, config, now);
  this.state!.features[slug] = featureState;   // ← unconditional overwrite
  await this.stateStore.save(this.state!);
  return featureState;
}
```

A second concurrent call would overwrite the first-written state record, violating REQ-PI-05 and the FSPEC edge case contract. The FSPEC specifies the correct guard behavior, but it is not yet in the code. This is not a FSPEC defect per se — it is a pre-existing implementation gap that the TSPEC must explicitly call out as a required modification to `initializeFeature()`, consistent with C-01 (which already permits a "targeted, minimal modification to `initializeFeature()` in `pdlc-dispatcher.ts`").

**Required action:** The FSPEC is already correct. The TSPEC must explicitly instruct the implementer to add the check-before-write guard to `initializeFeature()` in `pdlc-dispatcher.ts`. Suggested guard: before the `createFeatureState()` call, check `if (this.state!.features[slug]) { return this.state!.features[slug]; }`. The TSPEC should reference this FSPEC edge case and C-01 as the authority.

**No FSPEC change required**, but flagged here so the TSPEC author does not miss the implementation gap.

---

### F-02 — **Medium** — Per-thread queue does not cover cross-thread slug collisions; race condition scope is wider than AT-PI-04 implies

**Location:** FSPEC-PI-01 — AT-PI-04; REQ-PI-05

AT-PI-04 states: *"two concurrent messages arrive for the same new feature, both triggering auto-init ... exactly one state record is created."* This is correct as stated, but the framing is ambiguous about what "concurrent" means in this system.

The orchestrator uses `this.threadQueue.enqueue(message.threadId, ...)` (orchestrator.ts line 122), which serializes message processing **per thread ID**. Two messages arriving on the **same Discord thread** are therefore never truly concurrent — the queue guarantees sequential processing within a thread. AT-PI-04's scenario as written (same feature, same thread) is thus prevented by the queue before the idempotency guard in `initializeFeature()` is even reached.

However, the genuinely risky race is two messages on **different Discord threads** (different `threadId`) that both resolve to the same feature slug (e.g., if the naming convention produces the same slug from two thread names, or if a thread is duplicated). These would enter separate queue lanes and could call `isManaged()` concurrently, both see `false`, and both proceed to `initializeFeature()`. This is the case that actually requires the check-before-write guard.

The FSPEC does not need to add per-thread-queue implementation details (that is TSPEC territory), but the TSPEC author needs to know that:
1. Same-thread concurrency is already handled by the queue.
2. Cross-thread, same-slug concurrency is the actual residual risk requiring the `initializeFeature()` guard.

**Recommendation:** Add a clarifying note to AT-PI-04: *"Note: in the production deployment, per-thread message queuing prevents two messages on the same thread from reaching `initializeFeature()` concurrently. The scenario AT-PI-04 tests is the cross-thread case — two threads whose names resolve to the same feature slug."* This prevents a TSPEC author from relying solely on the queue for idempotency and omitting the `initializeFeature()` guard.

---

### F-03 — **Low** — FSPEC does not mention that `threadHistory` is already available at the auto-init decision point

**Location:** FSPEC-PI-01 — Input section; FSPEC-BC-01 — Input section

Both FSPEC-BC-01 (age guard) and FSPEC-DC-01 (keyword parsing) require access to conversation history. The FSPEC correctly specifies "Conversation history (ordered list of `ThreadMessage` objects)" as an input, but does not note that this data is already in scope at the auto-init decision point in the orchestrator.

In the current `orchestrator.ts`, `readThreadHistory()` is called at line 379 — before the agent invocation — and the result is stored in the local `threadHistory` variable. The `isManaged()` check at line 498 is reached after the routing signal is parsed, by which point `threadHistory` is already available. No additional Discord API call is required for the age guard or keyword parsing.

A TSPEC author who does not read the orchestrator source could reasonably implement the age guard by calling `readThreadHistory()` again, adding an unnecessary Discord API round-trip per routing loop invocation and introducing a subtle state inconsistency (the history snapshot between the two calls can diverge if a message arrives in the gap).

**Recommendation:** Add a note to FSPEC-PI-01's Input section: *"The conversation history required by the age guard (FSPEC-BC-01) and keyword parsing (FSPEC-DC-01) is already fetched by the orchestrator before the agent invocation and must be reused at the auto-init decision point. A second `readThreadHistory()` call must not be issued."*

---

## Positive Observations

- **FSPEC v1.1 addressed all round-2 and TE round-1 findings in a single pass.** The change log enumerates each resolved item precisely, which makes re-review fast and auditable.

- **FSPEC-BC-01 agent-turn definition is now implementation-complete.** The `isBot === true AND content contains <routing> tag` discriminator maps directly to the `ThreadMessage` interface and reuses the existing signal-parsing contract. The `<routing>`-tag filter correctly excludes orchestrator progress embeds (which have `isBot: true` but no routing tag) — confirmed by checking the orchestrator's embed-posting code, which never includes routing tags.

- **FSPEC-DC-01 remains implementation-complete and unchanged.** The keyword specification, business rules, and 9 acceptance tests (including the new AT-DC-09) are fully sufficient for a TSPEC author and a test engineer to implement and verify the feature without ambiguity.

- **Error classification (fatal vs. non-fatal) is correct and verified against the codebase.** Filesystem failure in `initializeFeature()` → halt routing loop; debug channel post failure → warn and continue. The `postToDebugChannel()` / `this.discord.postChannelMessage(this.debugChannelId, ...)` patterns already exist in `orchestrator.ts` (e.g., line 476–478), so no new infrastructure is required for the non-fatal notification path.

- **`this.config.discord.channels.debug` citation is confirmed correct.** `PtahConfig` in `ptah/src/types.ts` (lines 7–16) confirms the field exists as `discord.channels.debug`, and `orchestrator.ts` lines 148–152 show it is already resolved at startup via `findChannelByName`. The FSPEC's Output section reference is accurate.

- **AT-PI-01 is now end-to-end across FSPEC-PI-01 and REQ-PI-02.** The added FeatureConfig assertion (`{ discipline: "backend-only", skipFspec: false }`) closes the gap identified by TE F-04 and confirms the integration between keyword parsing and `initializeFeature()` in the default-config path.

---

## Recommendation

**Approved with minor changes.**

The FSPEC v1.1 is sound and may proceed to TSPEC authoring. The only change recommended before the TSPEC is authored is to add the AT-PI-04 clarifying note (F-02) distinguishing same-thread from cross-thread concurrency. F-01 is flagged for the TSPEC author, not the FSPEC — the FSPEC text is already correct, and the implementation gap in `pdlc-dispatcher.ts` is an artifact of Feature 011 predating this requirement. F-03 (threadHistory reuse) is a TSPEC-level note; it does not require a FSPEC change.

Suggested revision order for the optional FSPEC v1.2:
1. Add AT-PI-04 concurrency scope note (F-02) — **recommended before TSPEC authoring**
2. Add threadHistory reuse note to FSPEC-PI-01 Input (F-03) — can alternatively be captured in TSPEC Integration Points

F-01 (idempotency implementation gap) must be captured as a required code change in the TSPEC for `pdlc-dispatcher.ts`, referencing C-01.

---

*Reviewed by Backend Engineer (`eng`) · March 15, 2026*
