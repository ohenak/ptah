# Cross-Review: Backend Engineer → FSPEC

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | `013-FSPEC-pdlc-auto-init.md` (v1.0, Draft) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

The FSPEC is well-reasoned and the three behavioral areas (auto-init decision flow, age guard, keyword parsing) are cleanly decomposed. Keyword parsing (FSPEC-DC-01) is fully implementation-ready as specified. However, two high-severity gaps would cause the TSPEC author to hit unresolvable contradictions during implementation: the age guard's `role` field assumption does not match the actual `ThreadMessage` type in the codebase, and the idempotency contract for `initializeFeature()` directly conflicts with constraint C-01. Both must be resolved at the FSPEC level before the TSPEC is authored.

---

## Findings

### F-01 — **High** — `ThreadMessage` has no `role` field; age guard definition is wrong

**Location:** FSPEC-BC-01 — Definition of "Agent Turn"

The age guard defines a prior agent turn as *"any message ... where the message role is `'assistant'`."* However, the `ThreadMessage` interface (defined in `ptah/src/types.ts`) has no `role` field at all:

```typescript
export interface ThreadMessage {
  id: string;
  threadId: string;
  threadName: string;
  parentChannelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;   // ← this is the only agent/human discriminator
  content: string;
  timestamp: Date;
}
```

There is no `role` property on `ThreadMessage`. The only field that distinguishes agent messages from user messages is `isBot: boolean`. If the TSPEC author implements the age guard against this definition verbatim, the count will always return 0 (no messages have `role === "assistant"`) and every thread will be treated as a new feature — including old unmanaged ones — breaking backward compatibility.

**Additionally**, the `isBot` field conflates *agent messages* with *orchestrator messages*. The orchestrator itself posts progress embeds to feature threads (e.g., "Routing to @eng…", completion embeds). These appear in the thread history with `isBot: true` but are not agent turns. A new feature thread with one user message and two orchestrator progress embeds would have `isBot: true` count = 2, causing the age guard to return not-eligible and preventing auto-initialization of a genuinely new feature.

**Required fix:** Replace the `role = "assistant"` definition in FSPEC-BC-01 with a definition that:
1. Uses `isBot === true` as the discriminator for bot messages, AND
2. Explicitly excludes orchestrator-generated messages (progress embeds, completion embeds, debug notifications) from the agent turn count.

The simplest behavioral specification is: *"A prior agent turn is any message in the conversation history, before the current message, where `isBot === true` AND the message content contains a `<routing>` tag."* This precisely identifies agent completion messages without counting orchestrator plumbing posts. If this definition is too strict, an alternative is: *"Any message where `isBot === true` and the message was not posted by the orchestrator itself"* — with the TSPEC defining how to distinguish orchestrator-authored messages from agent-authored messages.

---

### F-02 — **High** — `initializeFeature()` is not idempotent; FSPEC's race condition contract conflicts with C-01

**Location:** FSPEC-PI-01 — Edge Cases (race condition row); Constraint C-01 in REQ-013

The FSPEC edge case states: *"`initializeFeature()` must not overwrite the existing record. It detects the record and returns without modifying it."*

The actual implementation in `pdlc-dispatcher.ts` (lines 165–172) does **not** check for an existing record before writing:

```typescript
async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
  this.ensureLoaded();
  const now = new Date().toISOString();
  const featureState = createFeatureState(slug, config, now);
  this.state!.features[slug] = featureState;  // ← unconditional overwrite
  await this.stateStore.save(this.state!);
  return featureState;
}
```

If a second concurrent call reaches this line after the first has written, it will silently overwrite the state created by the first — corrupting the feature record.

The FSPEC's proposed fix (add check-before-write to `initializeFeature()`) requires modifying `pdlc-dispatcher.ts`, which is a Feature 011 module. REQ-013 constraint C-01 explicitly prohibits this: *"Changes are limited to `orchestrator.ts`... No changes to the state machine, state store, or review tracker modules."*

This is a direct contradiction. The FSPEC must choose one of two resolution paths:

**Option A — Relax C-01 to permit a targeted change to `initializeFeature()`:** Add a check-before-write guard directly to `PdlcDispatcher.initializeFeature()`. The method returns the existing `FeatureState` if a record already exists rather than overwriting it. This is the cleanest contract (callers need not handle this case specially) and is the minimal change to Feature 011 (one conditional plus removal of unconditional write).

**Option B — Place idempotency responsibility in the orchestrator, not `initializeFeature()`:** The orchestrator acquires an async mutex or re-checks `isManaged()` in a tight scope before calling `initializeFeature()`. This keeps Feature 011 unchanged but requires careful async coordination in `orchestrator.ts`. In Node.js's single-threaded event loop, two `await` chains can interleave on disk I/O, so a simple TOCTOU guard is not sufficient without a lock or a re-check-after-write pattern.

The FSPEC must specify which option is intended and update the edge case row and C-01 accordingly. The TSPEC cannot make this architectural decision without FSPEC direction.

---

### F-03 — **Medium** — "Initial message" is ambiguous given the `ThreadMessage` type

**Location:** FSPEC-PI-01 Input section; FSPEC-DC-01 Description and BR-DC-06

The test engineer (F-02 in their review) already flagged the "first user message" vs "first message" inconsistency. From the engineering side, the fix must reference the actual type. Since `ThreadMessage` has no `role` field, "first user message" must be expressed as "first message where `isBot === false`."

Furthermore, the orchestrator currently reads thread history with `this.discord.readThreadHistory(triggerMessage.threadId)` (called once per routing loop iteration at line 378). The `triggerMessage` itself is also a `ThreadMessage`. The FSPEC should clarify whether `triggerMessage` (the message that triggered the current routing loop) is included in the history array or is separate from it — this determines whether the "initial message" search should start at index 0 of history or needs to account for the trigger message being excluded.

**Required fix:** Update both locations to say *"the first message in the conversation history with `isBot === false`"* and confirm whether the history array includes or excludes the trigger message.

---

### F-04 — **Low** — Debug channel identification mechanism is unspecified

**Location:** FSPEC-PI-01 — Output and Error Scenarios

REQ-PI-04 and the FSPEC both require posting a notification to the "debug channel." The orchestrator already has access to `this.config` (a `PtahConfig` object), and `PtahConfig` contains channel IDs. However, the FSPEC does not specify which config field names the debug channel ID — leaving the TSPEC to discover this independently.

If the debug channel ID is already present in `PtahConfig` (as a field like `channels.debug` or similar), a reference to the config key prevents the TSPEC author from using a different field or hardcoding a channel ID. If it is not yet present in `PtahConfig`, the FSPEC should note that a new config field is needed.

**Recommendation:** Add a sentence to FSPEC-PI-01's Output section or REQ-PI-04: *"The debug channel is identified via the existing `[config field name]` configuration value."* If the config field does not yet exist, note it as a required addition.

---

## Clarification Questions

### Q-01 — Does the orchestrator post messages directly to feature threads, and if so, can they be reliably excluded from the agent turn count?

**Location:** FSPEC-BC-01 — Definition of "Agent Turn"

The orchestrator currently posts progress embed messages to feature threads (e.g., "Routing to @eng…") as part of the routing loop. These appear in `readThreadHistory()` results as `isBot: true` messages. If the age guard counts them, a brand-new feature thread could accumulate 2+ "turns" before a single agent has responded — failing the age guard and preventing auto-initialization.

This is the same concern the test engineer raised in their Q-01, but from the implementation side it is blocking: the decision about *how* to exclude orchestrator messages directly determines the implementation of the turn-counting function. The two viable options are:

1. **Content-based exclusion:** Only count bot messages that contain a `<routing>` tag (which is present in all agent completion messages and absent from orchestrator plumbing posts).
2. **Author-ID exclusion:** Record the orchestrator's Discord bot user ID and exclude messages authored by it. This requires the orchestrator to know its own author ID.

Option 1 is simpler, aligns with existing signal parsing, and avoids storing orchestrator identity. Option 2 is more general but requires additional state. The FSPEC should specify which approach is intended.

---

### Q-02 — Should `initializeFeature()` become the canonical idempotency boundary (Option A), or should the orchestrator guard it externally (Option B)?

**Location:** FSPEC-PI-01 — Edge Cases (race condition); C-01

This follows directly from F-02 above. The answer determines whether the TSPEC modifies `pdlc-dispatcher.ts` or adds locking logic to `orchestrator.ts`. Neither option is obviously wrong, but the FSPEC must make the call.

My technical recommendation is **Option A**: add check-before-write to `initializeFeature()`. The method already encapsulates all state mutations, so placing idempotency there is architecturally coherent. The change is one `if`-guard on a single line. Placing idempotency in the orchestrator would require async coordination logic that duplicates what the state store should own.

---

## Positive Observations

- **FSPEC-DC-01 is implementation-complete as written.** Keyword parsing is a pure function over a string input with no side effects. BR-DC-01 through BR-DC-06, the edge case table, and the 8 acceptance tests provide full coverage. This section can be handed to a TSPEC author and implemented in one TDD cycle without clarification.

- **The three-way routing decision maps cleanly to the existing code.** The `isManaged()` check at orchestrator.ts line 496 is exactly where the FSPEC's decision tree would be inserted. The unmanaged branch at line 553 is the legacy path. The integration point is precise and low-risk.

- **Error classification is correct.** Distinguishing fatal (`initializeFeature()` filesystem failure → halt) from non-fatal (debug channel post failure → warn and continue) matches the severity of each operation and is implementable with a simple try/catch split.

- **The age guard's fail-open default for malformed history is the right call.** Fail-open prevents new features from being blocked; fail-closed would silently route new features to the legacy path. The explicit justification in the FSPEC makes this a deliberate product decision, not an engineering shortcut.

- **BR-BC-02 hard-codes the threshold in source.** This is correct. A configurable threshold would create a test surface problem and is unnecessary complexity for a binary new/old distinction.

---

## Recommendation

**Needs revision.**

F-01 and F-02 are high-severity and blocking. The TSPEC author cannot implement the age guard or the idempotency contract without resolving them, because both hit contradictions in the actual codebase. F-03 (initial message type clarification) should be fixed alongside F-01 since they affect the same implementation scope. F-04 is low-severity but prevents the TSPEC from fully specifying the debug channel notification without revisiting the FSPEC.

Suggested revision order:
1. Fix F-01: redefine "agent turn" using `isBot` + content-based orchestrator exclusion (pending answer to Q-01)
2. Fix F-02: choose Option A or B for idempotency ownership and update C-01 accordingly
3. Fix F-03: update "initial message" definition to reference `isBot === false`
4. Fix F-04: add debug channel config key reference

The test engineer's findings (F-01: log in AT-BC-03, F-02: initial message clarification, F-03: reverse AT-DC-09, F-04: FeatureConfig in AT-PI-01, F-05: race condition return contract) remain valid and should also be addressed in the same revision pass.

---

*Reviewed by Backend Engineer (`eng`) · March 15, 2026*
