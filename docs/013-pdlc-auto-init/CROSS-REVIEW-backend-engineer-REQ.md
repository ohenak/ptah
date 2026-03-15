# Cross-Review: Backend Engineer → REQ

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | `013-REQ-pdlc-auto-init.md` (v1.1, Draft) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

REQ v1.1 has resolved all high-severity issues identified in the prior cross-review rounds. The idempotency contract (REQ-PI-05) now specifies the exact observable outcome. The agent-turn definition in REQ-BC-01 uses `isBot === true` plus `<routing>`-tag content detection — which correctly maps to the actual `ThreadMessage` interface. Constraint C-01 is appropriately relaxed. Three low-to-medium-severity concerns remain that a TSPEC author would likely stumble on without guidance, but none are blocking.

---

## Findings

### F-01 — **Medium** — C-01 wording creates a potential contradiction for TSPEC authors

**Location:** Section 3.2 — Constraint C-01

C-01 currently reads:

> *"Changes are limited to `orchestrator.ts` (routing loop) and a targeted, minimal modification to `initializeFeature()` in `pdlc-dispatcher.ts` to add check-before-write idempotency... No other changes to Feature 011 modules (state machine, state store, review tracker)."*

The phrase "No other changes to Feature 011 modules" is technically true (only the state machine, state store, and review tracker are called out as frozen), but the three listed items are also all Feature 011 modules. A TSPEC author reading bottom-to-top could interpret the blanket statement as covering `pdlc-dispatcher.ts` too, and only notice the exception by rereading the first sentence carefully.

This is especially likely because `pdlc-dispatcher.ts` lives at `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` alongside `state-machine.ts`, `state-store.ts`, and `review-tracker.ts` — the exact three named in the prohibition.

**Recommendation:** Reorder the sentence to make the exception structurally unambiguous: *"Changes are limited to `orchestrator.ts` (routing loop) and a targeted, minimal modification to `initializeFeature()` in `pdlc-dispatcher.ts` (check-before-write idempotency guard). No changes to any other Feature 011 modules (`state-machine.ts`, `state-store.ts`, `review-tracker.ts`)."* Listing the frozen modules by filename removes the interpretive ambiguity.

---

### F-02 — **Low** — REQ-PI-01 "any routing signal" is now correct but ROUTE_TO_USER on a brand-new feature warrants a note

**Location:** Section 4.1 — REQ-PI-01

REQ-PI-01 v1.1 correctly specifies that auto-init triggers on any routing signal, not just LGTM. This matches the actual orchestrator code: the `isManaged()` check at line 496 of `orchestrator.ts` is reached regardless of signal type (all signal branches follow it).

However, the first signal from a brand-new feature is almost always LGTM (PM completes REQ_CREATION). The case where a brand-new feature's *first* signal is `ROUTE_TO_USER` is theoretically possible (PM immediately asks a clarifying question on the very first invocation). After auto-init with phase `REQ_CREATION`, the PDLC-managed path handles `ROUTE_TO_USER` at line 522–527 of orchestrator.ts with "PDLC phase unchanged." For a feature initialized at `REQ_CREATION`, this is correct — the question is routed to the user and the phase stays at `REQ_CREATION`. This is a valid, expected outcome.

No change required. Documenting this for TSPEC authors so they include a `ROUTE_TO_USER`-trigger test in the auto-init test suite alongside the LGTM-trigger test.

---

### F-03 — **Low** — `threadHistory` availability at the auto-init point should be noted

**Location:** Section 4.2 — REQ-BC-01 and Section 4.3 — REQ-DC-01

Both the age guard (REQ-BC-01) and keyword parsing (REQ-DC-01) require reading thread history. In the current `orchestrator.ts` implementation, `readThreadHistory()` is called at line 378 — before the agent invocation — and the result is stored in the local `threadHistory` variable. The auto-init decision point is at line 496, after signal parsing. At that point, `threadHistory` is already in scope: no additional Discord API call is needed.

This is a performance and architecture note for the TSPEC author. The TSPEC should explicitly instruct the implementation to reuse the already-fetched `threadHistory` rather than issuing a second `readThreadHistory()` call. Issuing a second call would be wasteful (one extra Discord API round-trip per routing loop iteration for every new-feature first signal) and could introduce a subtle inconsistency (the history snapshot changes between the two calls if messages arrive in the gap).

The REQ does not need to change, but the TSPEC's "Integration Points" section should call this out.

---

## Clarification Questions

### Q-01 — Should auto-init also guard against an empty/malformed featureSlug?

**Location:** Section 4.1 — REQ-PI-01

REQ-PI-01 specifies: *"If the feature slug cannot be resolved from thread context, auto-initialization must NOT be attempted."* In the existing orchestrator code, `featureNameToSlug(extractFeatureName(triggerMessage.threadName))` is called unconditionally at line 495. If `threadName` is an unparseable string (e.g., a DM, a channel with no feature prefix), this either returns an empty string or throws.

The REQ correctly prohibits auto-init for unresolvable slugs, but the acceptance criterion describes the slug as "cannot be resolved" without specifying what constitutes an unresolvable slug: empty string? `null`? a thrown exception? The TSPEC author needs to know which guard conditions to test (and the age guard should not be evaluated if the slug itself is invalid).

**Recommendation:** A one-line clarification in REQ-PI-01's AC or in Assumption A-04 would suffice: *"An unresolvable feature slug is treated as any value that is falsy (empty string, null, or undefined) after calling `featureNameToSlug(extractFeatureName(threadName))`."*

---

## Positive Observations

- **Agent-turn definition in REQ-BC-01 is now correct and implementation-ready.** `isBot === true` + `<routing>` tag content detection maps directly to the `ThreadMessage` interface. The content-based exclusion of orchestrator progress embeds is the right approach — and aligns with existing signal-parsing logic that already looks for `<routing>` tags in message content.

- **REQ-PI-05 idempotency contract is now fully testable.** The added THEN clause ("the second call to `initializeFeature()` resolves without throwing; the orchestrator treats it as a no-op and proceeds to the managed PDLC path with the existing state record intact") gives a test engineer exactly what they need to write an integration test for the race condition scenario. The choice of Option A (check-before-write in `initializeFeature()`) is architecturally correct — state mutation responsibility belongs inside the class that owns the state.

- **Debug channel notification is already wired.** REQ-PI-04 requires posting to the debug channel after auto-init. In the existing codebase, `this.debugChannelId` is already resolved during orchestrator startup (line 149 of `orchestrator.ts`) and `postToDebugChannel()` / `this.discord.postChannelMessage(this.debugChannelId, ...)` patterns already exist. No new infrastructure is needed — the TSPEC can reference these existing patterns directly.

- **REQ-NF-01 measurement protocol is now precise.** The updated measurement definition (wall-clock from eligibility check entry to `initializeFeature()` return, p95 over 100 runs in CI) eliminates the ambiguity flagged in the prior TE review. This is an implementable benchmark.

- **Scope boundaries are cleanly defined.** The explicit "Out of Scope" list (no state schema changes, no GUI/CLI, no discipline-after-init mutation) prevents scope creep and gives the TSPEC author clear fences. The alignment with Feature 011's schema versioning approach (C-03) is correct.

---

## Recommendation

**Approved with minor changes.**

The REQ v1.1 is technically sound and ready for TSPEC authoring once F-01 is addressed. The C-01 wording ambiguity (F-01) is the only item that could actively mislead a TSPEC author — recommend a one-line rewrite before TSPEC work begins. F-02 and F-03 are informational notes for TSPEC authors rather than REQ-level defects; they can be addressed in a TSPEC annotation rather than a REQ revision if the PM prefers not to issue a v1.2.

Q-01 is a minor clarification that would prevent a TSPEC author from having to make a product-level decision about what "unresolvable" means.

Suggested revision order:
1. Fix F-01: reorder C-01 sentence, enumerate frozen modules by filename
2. Address Q-01: add a one-line definition of "unresolvable featureSlug" to REQ-PI-01 or Assumptions

After these changes, the REQ is approved for TSPEC authoring.

---

*Reviewed by Backend Engineer (`eng`) · March 15, 2026*
