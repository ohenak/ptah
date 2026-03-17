# Cross-Review: Product Manager — TSPEC (007-TSPEC-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) |
| **Date** | March 17, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

1 finding, 2 open questions answered. The TSPEC is solid overall — full REQ traceability, correct migration rationale, `buildErrorMessage()` purity rule is exactly right. One Medium finding blocks approval.

---

## Findings

### F-01 — [MEDIUM] `postResolutionNotificationEmbed()` has no documented call site

**Affected:** Archiving algorithm (TSPEC §6)

The resolution notification embed required by REQ-DI-10 would never be posted to the thread. The archiving algorithm must show where `postResolutionNotificationEmbed()` is invoked before the thread is archived.

**Required action:** Update the archiving algorithm in §6 to include the explicit call site for `postResolutionNotificationEmbed()` prior to thread archival.

---

### F-02 — [LOW] Chunk size 4096 to 2000 acknowledged and accepted

Plain message compatibility justifies the chunk size reduction from 4096 to 2000. OQ-TSPEC-03 closed.

**No action required.**

---

## Open Questions Resolved

### OQ-TSPEC-01 — Hot-reload semantics (Closed)

Rebuild registry on hot-reload. In-flight invocations complete with their snapshot. De-registration for in-flight is out of Phase 7 scope.

### OQ-TSPEC-04 — `postProgressEmbed` fallback (Closed)

`fromAgentDisplayName: 'Ptah'` approved for system-initiated notifications without a source agent.

---

## Positive Observations

- Full REQ traceability throughout the document.
- Correct migration rationale for the AgentConfig schema change.
- `buildErrorMessage()` purity rule is exactly right — keeps error message construction testable and side-effect-free.

---

## Recommendation

**Needs revision.**

One Medium finding (F-01) blocks approval. Route the updated TSPEC back to PM once F-01 is addressed.

---

*End of Review*
