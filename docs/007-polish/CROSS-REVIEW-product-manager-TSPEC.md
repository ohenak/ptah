# Cross-Review: Product Manager — TSPEC (007-TSPEC-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.2 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Summary

1 finding, 2 open questions answered. The TSPEC is solid overall — full REQ traceability, correct migration rationale, `buildErrorMessage()` purity rule is exactly right. One Medium finding was raised; it was already addressed in TSPEC v1.1. OQ resolutions incorporated into TSPEC v1.2.

---

## Findings

### F-01 — [MEDIUM] `postResolutionNotificationEmbed()` has no documented call site

**Affected:** Archiving algorithm (TSPEC §6)

The resolution notification embed required by REQ-DI-10 would never be posted to the thread. The archiving algorithm must show where `postResolutionNotificationEmbed()` is invoked before the thread is archived.

**Status: Resolved in TSPEC v1.1.** The archiving algorithm in §6 now includes `postResolutionNotificationEmbed()` at step 3b, before `archiveThread()`, with a WARN fallback path to `postPlainMessage()`.

---

### F-02 — [LOW] Chunk size 4096 to 2000 acknowledged and accepted

Plain message compatibility justifies the chunk size reduction from 4096 to 2000. OQ-TSPEC-03 closed.

**No action required.**

---

## Open Questions Resolved

### OQ-TSPEC-01 — Hot-reload semantics (Closed)

Rebuild registry on hot-reload. In-flight invocations complete with their snapshot. De-registration for in-flight is out of Phase 7 scope. Incorporated into TSPEC v1.2 OQ-TSPEC-01 resolution.

### OQ-TSPEC-04 — `postProgressEmbed` fallback (Closed)

`fromAgentDisplayName: 'Ptah'` approved for system-initiated notifications without a source agent. Incorporated into TSPEC v1.1 OQ-TSPEC-04 resolution.

---

## Positive Observations

- Full REQ traceability throughout the document.
- Correct migration rationale for the AgentConfig schema change.
- `buildErrorMessage()` purity rule is exactly right — keeps error message construction testable and side-effect-free.

---

## Recommendation

**Approved.**

All findings resolved. F-01 was addressed in TSPEC v1.1. OQ confirmations incorporated into TSPEC v1.2. The TSPEC is cleared for PROPERTIES derivation and PLAN authoring.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Product Manager | Initial review — Needs revision (F-01 Medium) |
| 1.1 | March 17, 2026 | Backend Engineer | Updated to reflect F-01 resolution in TSPEC v1.1, OQ confirmations in TSPEC v1.2. Recommendation upgraded to Approved. |

---

*End of Review*
