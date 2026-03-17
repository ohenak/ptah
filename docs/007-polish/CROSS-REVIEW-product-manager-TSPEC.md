# Cross-Review: Product Manager — TSPEC (007-TSPEC-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.3 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Summary

Re-review of TSPEC v1.2 (continuing review pass). One new Medium finding identified: §4.2.4 specifies "Content chunking logic (4096-char split) is preserved" while §12 OQ-TSPEC-03 resolves the chunk size to **2000 chars**. These two sections directly contradict each other. A 4096-char plain message exceeds Discord's 2000-char limit and will throw at runtime — this is not just a documentation inconsistency but a functional defect in the spec.

All previously resolved findings (F-01 through F-07) remain resolved.

---

## Findings

### F-01 — [MEDIUM] `postResolutionNotificationEmbed()` has no documented call site

**Affected:** Archiving algorithm (TSPEC §6)

**Status: Resolved in TSPEC v1.1.** The archiving algorithm in §6 now includes `postResolutionNotificationEmbed()` at step 3b, before `archiveThread()`, with a WARN fallback path to `postPlainMessage()`.

---

### F-02 — [LOW] Chunk size 4096 to 2000 acknowledged and accepted

Plain message compatibility justifies the chunk size reduction from 4096 to 2000. OQ-TSPEC-03 closed.

**Status: Partially resolved.** OQ-TSPEC-03 in §12 correctly records the decision to reduce chunk size to 2000. However, the normative specification text in §4.2.4 was not updated — see F-08 below.

---

### F-03 — [LOW] `fromAgentDisplayName: 'Ptah'` fallback test case confirmed in §9.3

**Status: Resolved in TSPEC v1.2.** ResponsePoster unit test description in §9.3 now includes "`fromAgentDisplayName: 'Ptah'` fallback renders correctly in Routing Notification embed."

---

## New Finding (v1.2 re-review)

### F-08 — [MEDIUM] §4.2.4 contradicts OQ-TSPEC-03: chunk size is simultaneously 4096 and 2000 — **Resolved in TSPEC v1.3**

**Affected:** §4.2.4 `postAgentResponse()` behavior change; §12 OQ-TSPEC-03 resolution

**§4.2.4 states (line 372):**
> "Content chunking logic (4096-char split) is preserved but uses plain messages."

**§12 OQ-TSPEC-03 resolution states:**
> "Decision: reduce chunk size to 2000 chars for plain message compatibility."

These two statements directly contradict each other. An engineer implementing `postAgentResponse()` following §4.2.4 (the normative specification section) would use 4096-char chunks — which will fail at runtime because Discord's plain message character limit is 2000. The correct value is 2000 (per OQ-TSPEC-03), and §4.2.4 must be updated to reflect this.

**Impact:** If the engineer follows §4.2.4 and uses 4096-char chunks, Discord will reject any message chunk between 2001–4096 characters with a 400 error, breaking agent response posting for longer responses.

**Required action:** Update the §4.2.4 `postAgentResponse()` behavior change text to read:
> "Content chunking logic is preserved but the chunk size is reduced from 4096 to 2000 chars for plain-message compatibility, and each chunk is posted via `discordClient.postPlainMessage()`."

This is a single-line correction in §4.2.4. The OQ-TSPEC-03 resolution in §12 is correct and does not need to change.

**Severity rationale:** Medium — the normative specification text actively misleads the engineer toward a value that will throw a Discord API error at runtime. The fix is trivial (one line) but the risk of missing it during implementation is real.

---

## Open Questions Resolved (v1.0 / v1.1)

### OQ-TSPEC-01 — Hot-reload semantics (Closed)

Rebuild registry on hot-reload. In-flight invocations complete with their snapshot. De-registration for in-flight is out of Phase 7 scope. Incorporated into TSPEC v1.2 OQ-TSPEC-01 resolution.

### OQ-TSPEC-04 — `postProgressEmbed` fallback (Closed)

`fromAgentDisplayName: 'Ptah'` approved for system-initiated notifications without a source agent. Incorporated into TSPEC v1.1 OQ-TSPEC-04 resolution.

---

## Positive Observations

- Full REQ traceability throughout the document — every requirement in REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10 is addressed.
- Correct migration rationale for the AgentConfig schema change. Hard cut-over is the right call for a dev-tool with a single deployment.
- `buildErrorMessage()` purity rule is exactly right — keeps error message construction testable and side-effect-free.
- §6 archiving algorithm places `postResolutionNotificationEmbed()` before `archiveThread()` — ensures the user sees the resolution notification before the thread disappears from active threads.
- WARN fallback in the archiving algorithm (step 3b fallback to `postPlainMessage()`) is the correct defensive pattern.
- §9.2 `FakeLogger` shared-store design enables end-to-end log assertions across component boundaries. Usage example (Option B) is clear and the Option A anti-pattern warning prevents a common test authoring mistake.

---

## Recommendation

**Approved.**

All findings resolved. F-08 (the sole remaining Medium finding) was self-certified by Backend Engineer in TSPEC v1.3: §4.2.4 now reads "chunk size is reduced from 4096 to 2000 chars for plain-message compatibility", aligning with OQ-TSPEC-03. No re-review required per PM authorization in v1.2 recommendation. TSPEC is cleared for PLAN authoring.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Product Manager | Initial review — Needs revision (F-01 Medium) |
| 1.1 | March 17, 2026 | Backend Engineer | Updated to reflect F-01 resolution in TSPEC v1.1, OQ confirmations in TSPEC v1.2. Recommendation upgraded to Approved. |
| 1.2 | March 17, 2026 | Product Manager | Re-review of TSPEC v1.2 — New F-08 Medium finding: §4.2.4 contradicts OQ-TSPEC-03 on chunk size (4096 vs 2000). Recommendation downgraded to Needs revision. One-line fix required; self-certification permitted. |
| 1.3 | March 17, 2026 | Backend Engineer | Self-certified F-08 resolution: §4.2.4 updated in TSPEC v1.3 to specify 2000-char chunk size. Recommendation updated to Approved. |

---

*End of Review*
