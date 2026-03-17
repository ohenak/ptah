# Cross-Review: Product Manager — TSPEC (007-TSPEC-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.4 |
| **Date** | March 17, 2026 |
| **Recommendation** | **Approved** |

---

## Summary

Full re-review pass against the approved REQ (v1.5) and FSPEC (v2.1). All six requirements (REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10) are addressed with appropriate technical components. All previously resolved findings (F-01 through F-08) remain resolved.

One new documentation note was recorded (F-09 — Low): FSPEC §5.4 contained stale language ("Content chunking behavior is unchanged") that contradicted the PM-accepted chunk size reduction in OQ-TSPEC-03. The TSPEC was correct; the defect was in FSPEC text, not the TSPEC. **F-09 is now resolved**: FSPEC §5.4 updated to v2.2 in this same review pass.

**v1.5 re-review (TSPEC v1.4):** Seven changes were applied in TSPEC v1.4 to resolve BE F-01–F-04 and TE F-08–F-11. All changes reviewed from a product perspective — no new product-level findings. Recommendation remains **Approved**.

**v1.5 pass summary of TSPEC v1.4 changes (product perspective):**

| Change | Product Impact |
|--------|----------------|
| `Component` type moved to `types.ts` only; `'dispatcher'` → `'invocation-guard'` | Observable log output uses `[ptah:invocation-guard]` for `invocation-guard.ts`. Correct — `'invocation-guard'` now appears in the `Component` union and matches the actual source file. §7 EVT-OB component assignments unchanged (no EVT is directly owned by `invocation-guard`; its errors flow through EVT-OB-10 per-component). No REQ-NF-09 / REQ-NF-10 concerns. |
| `buildAgentRegistry()` marked `async` with `Promise<>` return type | Implementation detail only. No product behavior change. |
| `postSystemMessage()` removal documented in §4.2.2 | Confirms Phase 7 product intent: all Orchestrator messages now route through typed embed methods or `postPlainMessage()`. Aligns with REQ-DI-10. |
| `RoutingEngine` interface signatures documented as unchanged | Internal implementation detail. No product behavior change. |
| `LogEntry.component: Component` (was `string`) | Test infrastructure improvement. No product behavior change. |
| 2000-char chunk boundary test cases added to §9.3 | Confirms correct product behavior per OQ-TSPEC-03 decision. Aligns with REQ-DI-10. |

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

**Status: Resolved in TSPEC v1.3.** §4.2.4 now reads "chunk size is reduced from 4096 to 2000 chars for plain-message compatibility", aligning with OQ-TSPEC-03. Self-certified by Backend Engineer per PM authorization.

---

## New Finding (v1.4 re-review)

### F-09 — [LOW] FSPEC §5.4 contains stale "unchanged" language that contradicts the PM-accepted chunk size change

**Affected:** FSPEC-DI-03 §5.4 (Agent Response Text — Plain Messages); PM-owned document

**FSPEC §5.4 states:**
> "Content chunking behavior (splitting long responses across multiple messages) is unchanged — only the formatting wrapper changes."

**TSPEC §4.2.4 (v1.3, normative) states:**
> "Content chunking logic is preserved but the chunk size is reduced from 4096 to 2000 chars for plain-message compatibility."

**OQ-TSPEC-03 (resolved):**
> "Decision: reduce chunk size to 2000 chars for plain message compatibility. PM acknowledged and accepted."

The FSPEC statement "Content chunking behavior...is unchanged" is stale. The PM explicitly accepted the chunk size reduction (4096 → 2000) through the OQ-TSPEC-03 process, but FSPEC §5.4 was never updated to reflect this accepted change. The TSPEC v1.3 is correct.

**Impact:** The FSPEC and TSPEC are inconsistent on observable chunking behavior. An engineer cross-checking FSPEC against TSPEC would see a contradiction. A test engineer writing acceptance tests from the FSPEC alone would write tests against the wrong chunk boundary (4096 instead of 2000).

**Severity rationale:** Low — the TSPEC (correct implementation target) accurately reflects the PM-accepted decision. The FSPEC text is documentation debt, not a TSPEC defect. PLAN authoring is not blocked.

**Required action:** PM to update FSPEC §5.4 text to read:
> "Content chunking behavior (splitting long responses across multiple messages) is updated for Phase 7 compatibility: the chunk size is reduced from 4096 to 2000 characters to match Discord's plain message limit. The chunking logic itself (splitting and posting multiple messages for long responses) is otherwise unchanged — only the chunk boundary and the removal of the embed wrapper change."

This is a PM-owned documentation update; no TSPEC changes are required.

---

## Open Questions Resolved (v1.0 / v1.1)

### OQ-TSPEC-01 — Hot-reload semantics (Closed)

Rebuild registry on hot-reload. In-flight invocations complete with their snapshot. De-registration for in-flight is out of Phase 7 scope. Incorporated into TSPEC v1.2 OQ-TSPEC-01 resolution.

### OQ-TSPEC-04 — `postProgressEmbed` fallback (Closed)

`fromAgentDisplayName: 'Ptah'` approved for system-initiated notifications without a source agent. Incorporated into TSPEC v1.1 OQ-TSPEC-04 resolution.

---

## REQ → TSPEC Coverage Verification (v1.4 pass)

| Requirement | TSPEC Section(s) | Verdict |
|-------------|-----------------|---------|
| REQ-DI-06 — Archive Resolved Threads | §6 Archiving Algorithm, §4.2.2 `archiveThread()`, §8 Error Handling (archive scenarios) | ✅ Covered |
| REQ-DI-10 — Discord Embed Formatting | §4.2.4 ResponsePoster (4 embed types + plain agent response), §7 EVT-OB-07/08, §8 embed error handling | ✅ Covered |
| REQ-RP-06 — Error Message UX | §4.2.5 ErrorMessages module (5 ERR-RP templates, pure `buildErrorMessage()`), §8 error routing table | ✅ Covered |
| REQ-NF-08 — Agent Extensibility | §4.2.3 AgentRegistry + AgentEntry types, §5 Config Schema Migration (before/after, hard cut-over rationale), §11 integration points | ✅ Covered |
| REQ-NF-09 — Structured Log Output | §4.2.1 Logger Protocol (`forComponent()`, `ComponentLogger`, format string), §9.2 FakeLogger | ✅ Covered |
| REQ-NF-10 — Operator Observability | §7 EVT-OB-01..10 (full lifecycle coverage: receive → match → invoke → respond → post → commit → archive/escalate/error) | ✅ Covered |

---

## FSPEC → TSPEC Alignment Check (v1.4 pass)

| FSPEC | Key Behavioral Points | TSPEC Alignment |
|-------|-----------------------|-----------------|
| FSPEC-DI-02 — Thread Archiving | Resolution signals (LGTM/TASK_COMPLETE only); post-content, post-commit ordering; non-fatal on failure; idempotency via registry; WARN on failure, registry not updated | ✅ All 7 business rules (BR-DI-02-01..07) translated faithfully in §6 |
| FSPEC-EX-01 — Agent Extensibility | Validate required fields + format + file existence; skip invalid entries; duplicate ID/mention_id handling; display_name fallback | ✅ §5.4 algorithm matches FSPEC §4.3 step-for-step; minor component naming divergence noted separately |
| FSPEC-DI-03 — Embed Formatting | 4 embed types with defined colors, titles, body fields; agent response → plain message; embed fallback to plain on failure | ✅ §4.2.4 ResponsePoster matches embed schemas. Chunk size 2000 (correct per OQ-TSPEC-03). FSPEC §5.4 text stale — see F-09 |
| FSPEC-RP-01 — Error Message UX | 5 error types (ERR-RP-01..05); pure builder function; no stack traces; caller extracts safe context | ✅ §4.2.5 `buildErrorMessage()` design rule ("pure function, never receives Error objects") matches FSPEC intent |
| FSPEC-LG-01 — Structured Logging | `[ptah:{component}] LEVEL: message` format; all 8 modules get component-scoped loggers | ✅ §4.2.1 Logger Protocol + constructor pattern in §7 |
| FSPEC-OB-01 — Observability | 10 lifecycle events covering message-received through archive/error | ✅ §7 EVT-OB-01..10 maps to full PDLC lifecycle |

**Component naming note (not a finding):** FSPEC-EX-01 §4.3/§4.8 prescribes `[ptah:orchestrator]` for agent registration log lines. TSPEC §5.4/§8 assigns these to `[ptah:config]` — a more accurate technical assignment since `buildAgentRegistry()` is a config-layer concern. REQ-NF-09 specifies the format `[ptah:{component}]` but does not mandate which component handles which log lines. The TSPEC's assignment is a valid engineering refinement; no product concern.

---

## Positive Observations

- Full REQ traceability throughout the document — every requirement in REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10 is addressed.
- Correct migration rationale for the AgentConfig schema change. Hard cut-over is the right call for a dev-tool with a single deployment.
- `buildErrorMessage()` purity rule is exactly right — keeps error message construction testable and side-effect-free.
- §6 archiving algorithm places `postResolutionNotificationEmbed()` before `archiveThread()` — ensures the user sees the resolution notification before the thread disappears from active threads.
- WARN fallback in the archiving algorithm (step 3b fallback to `postPlainMessage()`) is the correct defensive pattern.
- §9.2 `FakeLogger` shared-store design enables end-to-end log assertions across component boundaries. Usage example (Option B) is clear and the Option A anti-pattern warning prevents a common test authoring mistake.
- EVT-OB-01..10 coverage is complete — an operator can reconstruct the full routing lifecycle (trigger → match → invoke → signal → post → commit → archive/escalate/error) from log output alone, satisfying REQ-NF-10.
- Error handling table in §8 correctly differentiates archive failure scenarios: "Thread not found" is treated as success (registry updated); network/permission failures leave the registry untouched (enabling user-initiated retry per BR-DI-02-07).
- `AgentValidationError` interface provides rich diagnostic context (index, agentId, field, reason) for config validation failures.

---

## Recommendation

**Approved.**

TSPEC v1.4 is correct and cleared for PLAN authoring. All High and Medium findings (F-01, F-08 across all review cycles) are resolved. The previously noted Low documentation note (F-09 — FSPEC §5.4 stale language) is now resolved: FSPEC §5.4 updated to v2.2 in this pass.

**No TSPEC changes required. No re-review required.**

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 17, 2026 | Product Manager | Initial review — Needs revision (F-01 Medium) |
| 1.1 | March 17, 2026 | Backend Engineer | Updated to reflect F-01 resolution in TSPEC v1.1, OQ confirmations in TSPEC v1.2. Recommendation upgraded to Approved. |
| 1.2 | March 17, 2026 | Product Manager | Re-review of TSPEC v1.2 — New F-08 Medium finding: §4.2.4 contradicts OQ-TSPEC-03 on chunk size (4096 vs 2000). Recommendation downgraded to Needs revision. One-line fix required; self-certification permitted. |
| 1.3 | March 17, 2026 | Backend Engineer | Self-certified F-08 resolution: §4.2.4 updated in TSPEC v1.3 to specify 2000-char chunk size. Recommendation updated to Approved. |
| 1.4 | March 17, 2026 | Product Manager | Full re-review pass of TSPEC v1.3 vs REQ v1.5 and FSPEC v2.1. Added REQ→TSPEC coverage verification table. Added FSPEC→TSPEC alignment check table. New F-09 Low finding: FSPEC §5.4 stale "unchanged" language is PM-owned documentation debt (does not affect TSPEC). Recommendation remains Approved. Component naming note added (non-finding). |
| 1.5 | March 17, 2026 | Product Manager | Re-review of TSPEC v1.4 — all seven BE/TE-driven changes verified from product perspective. No new findings. `'invocation-guard'` component name correct and consistent with §7 EVT-OB. F-09 (Low — FSPEC §5.4 stale chunking language) resolved in this pass: FSPEC §5.4 updated to v2.2. Recommendation: Approved. |

---

*End of Review*
