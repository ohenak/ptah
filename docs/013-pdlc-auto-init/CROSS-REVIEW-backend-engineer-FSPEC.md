# Cross-Review: Backend Engineer → FSPEC

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | `013-FSPEC-pdlc-auto-init.md` (v1.0, Draft) |
| **Review Round** | 2 (re-review following REQ v1.1 / v1.2 updates) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

The REQ has been iterated to v1.2 and resolves the two blocking architectural decisions I raised in round 1 — the correct agent-turn discriminator (now in REQ-BC-01) and the idempotency ownership model (Option A, now in C-01). Both decisions are sound. However, the **FSPEC text itself has not been updated** to reflect these resolutions: FSPEC-BC-01 still defines an "agent turn" using `role = "assistant"`, which does not exist in `ThreadMessage`. A TSPEC author working from the FSPEC alone would implement the wrong turn counter. This is still a blocking gap.

Three secondary issues from round 1 also remain unaddressed in the FSPEC. The TE's five open findings (from their parallel review) should be resolved in the same pass.

---

## Status of Round-1 Findings

| Finding | Round-1 Severity | Current Status | Notes |
|---------|-----------------|---------------|-------|
| F-01: agent turn uses non-existent `role` field | High | **Still open in FSPEC** | REQ-BC-01 v1.2 fixes this at REQ level; FSPEC text has not been updated |
| F-02: idempotency conflicts with C-01 | High | **Resolved at REQ level** | C-01 relaxed in REQ v1.2 to permit Option A; FSPEC edge-case row is correct; minor return-value gap remains (see F-02 below) |
| F-03: "initial message" ambiguous definition | Medium | **Still open in FSPEC** | Inconsistency between "first message" and "first user message" remains |
| F-04: debug channel config key unspecified | Low | **Still open in FSPEC** | `this.config.discord.channels.debug` exists and should be cited |

---

## Findings

### F-01 — **High** — FSPEC-BC-01 "agent turn" definition still uses non-existent `role` field

**Location:** FSPEC-BC-01 — Definition of "Agent Turn"

The FSPEC still reads:

> *"A prior agent turn is any message in the conversation history, before the current message, where: The message role is `"assistant"`"*

The `ThreadMessage` interface (in `ptah/src/types.ts`, line 75) has no `role` field:

```typescript
export interface ThreadMessage {
  id: string;
  threadId: string;
  threadName: string;
  parentChannelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;    // ← sole bot/user discriminator
  content: string;
  timestamp: Date;
}
```

REQ-BC-01 (v1.2) has already resolved this with the correct definition:

> *"A 'prior agent turn' is any message in the thread history, posted before the current routing signal, where `isBot === true` AND the message content contains a `<routing>` tag."*

The FSPEC-BC-01 definition must be updated to match REQ-BC-01 verbatim. The `<routing>`-tag filter is also correct — it excludes orchestrator progress embeds (which are `isBot: true` but contain no routing tag) from the count, preventing false-positive non-eligibility on genuinely new threads where the orchestrator has already posted a progress embed.

**Required fix:** Replace the "Agent Turn" definition in FSPEC-BC-01 with: *"A prior agent turn is any message in the conversation history, before the current message, where `isBot === true` AND the message content contains a `<routing>` tag. Orchestrator-generated messages (progress embeds, completion embeds, debug notifications) have `isBot: true` but contain no `<routing>` tag and are therefore excluded."*

---

### F-02 — **Low** — Idempotent `initializeFeature()` return value is unspecified

**Location:** FSPEC-PI-01 — Edge Cases (race condition row)

The blocking part of round-1 F-02 is resolved: C-01 now permits the check-before-write guard in `initializeFeature()` (Option A). The FSPEC edge-case row is behaviorally correct — the second call must not overwrite.

The remaining gap (also flagged by TE F-05): the edge-case row says *"returns without modifying it"* but does not specify **what** it returns. The `initializeFeature()` signature returns `Promise<FeatureState>`. The orchestrator needs to know whether the idempotent path returns the **existing** `FeatureState` or throws. If it throws, the orchestrator must catch and treat it as a no-op. If it returns the existing `FeatureState`, no special handling is needed.

**Required fix:** Add one sentence to the edge-case row: *"The second call returns the existing `FeatureState` record without modification (it does not throw). The orchestrator treats this as a successful no-op and proceeds to the managed PDLC path with the existing state record."*

---

### F-03 — **Medium** — "Initial message" definition still inconsistent and incorrectly typed

**Location:** FSPEC-PI-01 Input section; FSPEC-DC-01 Description and BR-DC-06

Two inconsistencies remain:

1. FSPEC-PI-01 says *"the first message in the thread"*, while FSPEC-DC-01 says *"the first user message in the thread."* Neither matches the `ThreadMessage` type — there is no `role` field to distinguish user from agent messages.

2. Now that REQ-BC-01 v1.2 uses `isBot` as the discriminator throughout, the "initial message" definition should use the same field: *"the first chronological message in the conversation history where `isBot === false`."*

**Required fix:** Update both FSPEC-PI-01 Input and FSPEC-DC-01 Description/BR-DC-06 to read: *"The initial message is the first chronological message in the conversation history with `isBot === false` (i.e., the first user-authored message)."*

---

### F-04 — **Low** — Debug channel config key still unspecified

**Location:** FSPEC-PI-01 — Output, Error Scenarios; REQ-PI-04

`PtahConfig` already includes `discord.channels.debug` (confirmed in `ptah/src/types.ts`, line 10). The FSPEC and REQ both require posting to "the debug channel" without naming the config field the orchestrator will use.

**Required fix:** Add to FSPEC-PI-01 Output section: *"The debug channel is identified via `this.config.discord.channels.debug`."* This prevents a TSPEC author from using a different config field or hard-coding a channel ID.

---

## Unaddressed TE Findings (Round 1)

The following test-engineer findings from their parallel review remain open and should be addressed in the same FSPEC revision pass:

| TE Finding | Description | Action Needed |
|-----------|-------------|--------------|
| TE-F-01 | AT-BC-03 (2 prior turns → not eligible) omits the required debug log assertion | Add `AND: a debug-level log is emitted matching the exact format` to AT-BC-03's THEN clause |
| TE-F-03 | AT-DC-07 only tests one direction of keyword conflict; reverse order `[fullstack] [backend-only]` is unspecified | Add AT-DC-09: `[fullstack] [backend-only]` → `{ discipline: "backend-only", skipFspec: false }` |
| TE-F-04 | AT-PI-01 omits the resulting `FeatureConfig` from THEN clause | Append: `AND: the created state record has config { discipline: "backend-only", skipFspec: false }` |
| TE-F-05 | Race-condition edge case doesn't specify what `initializeFeature()` returns for the second caller | Addressed by F-02 above |

---

## Positive Observations

- **REQ v1.2 resolved both round-1 blocking issues cleanly.** The Option A decision (check-before-write in `initializeFeature()`) and the REQ-BC-01 agent-turn definition using `isBot + <routing>-tag` are correct architectural choices. Once the FSPEC text is updated to match, this feature has a consistent spec stack.

- **FSPEC-DC-01 remains implementation-complete.** Keyword parsing is fully specified with unambiguous business rules, edge cases, and 8 acceptance tests. This section requires no changes.

- **The `<routing>`-tag filter for agent turn counting is elegant.** It reuses the signal-parsing contract that already exists in the orchestrator, avoids the need to track the orchestrator's own Discord user ID, and is trivially testable with a string-contains check.

- **Error classification (fatal vs. non-fatal) is correct and unchanged.** Filesystem failure in `initializeFeature()` → halt; debug channel post failure → warn and continue. This is implementable with a split try/catch.

---

## Recommendation

**Needs revision.**

The only blocking item is F-01: the FSPEC-BC-01 agent-turn definition must be updated to use `isBot` + `<routing>` tag, matching REQ-BC-01 v1.2. This is a text update — the architectural decision is already made. F-03 (initial message typing) should be fixed in the same pass. F-02 (return value) and F-04 (debug channel key) are minor; the TE findings can also be folded into the same revision.

After a targeted v1.1 update to FSPEC-BC-01's agent-turn definition and the initial-message typing, the FSPEC can be approved and the TSPEC authored without further clarification.

---

*Reviewed by Backend Engineer (`eng`) · March 15, 2026*
