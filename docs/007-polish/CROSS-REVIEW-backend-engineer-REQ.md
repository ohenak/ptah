# Cross-Review: Backend Engineer — REQ-PTAH-P7 v1.5 + FSPEC v2.0 (Phase 7: Polish)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer |
| **Document Reviewed** | [007-REQ-polish.md](./007-REQ-polish.md) v1.5 |
| **FSPEC Reviewed** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.0 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Prior Review Resolution

All findings from the v1.2 review (CROSS-REVIEW-backend-engineer-REQ.md, filed against v1.2) have been properly addressed in v1.5 + FSPEC v2.0:

| Prior Finding | Status | Evidence |
|---------------|--------|----------|
| F-01 (High): Config migration scope not in REQ | ✅ Resolved | REQ v1.5 §5 Risks: migration guide in scope, automated script out of scope; engineering determines shim vs. hard cut-over in TSPEC |
| F-02 (High): Signal naming mismatch in FSPEC-DI-02 | ✅ Resolved | FSPEC v2.0 §3.2 uses live contract (`LGTM`, `TASK_COMPLETE`, `ROUTE_TO_USER`, `ROUTE_TO_AGENT`) throughout; §6 Assumptions confirms fix |
| F-03 (Medium): REQ-DI-10 ambiguous about embed-to-plain-text change | ✅ Resolved | REQ-DI-10 description now explicitly frames the two-part change: (a) four embed types formalized, (b) `postAgentResponse()` moves to plain text |
| F-04 (Medium): Logger refactor scope understated | ✅ Resolved | Acknowledged in §5 Risks — call-site footprint flagged; no REQ text change needed |
| F-05 (Low): Four requirements had no FSPEC | ✅ Resolved | FSPEC v2.0 adds FSPEC-DI-03, FSPEC-RP-01, FSPEC-LG-01, FSPEC-OB-01 — all six requirements now have complete FSPECs |
| F-06 (Low): Discord MCP archive capability unverified | ✅ Deferred appropriately | Correctly assigned to TSPEC research |
| Q-01: Migration guide scope? | ✅ Answered | §5 Risks: migration guide in scope, automated script out of scope |
| Q-02: New embed types vs. existing methods? | ✅ Answered | REQ-DI-10 description names the three existing methods as partial foundation; Phase 7 adds routing notification and user escalation types |

---

## New Findings

### F-01 (Medium) — FSPEC-DI-03 does not address `createCoordinationThread()` disposition after Phase 7

**Affected:** REQ-DI-10 + REQ-NF-08 interaction

FSPEC-DI-03 §5.4 specifies that `postAgentResponse()` moves from embeds to plain text. It does not address `createCoordinationThread()`, which also uses per-agent colour embeds for the initial message posted when a new coordination thread is created.

Confirmed in `ptah/src/orchestrator/response-poster.ts`:
```typescript
// createCoordinationThread() calls resolveColour(agentId, config) which reads:
const hex = config.agents.colours?.[agentId];
```

The new agent config schema (FSPEC-EX-01 §4.2) removes the `colour` field from agent entries. After the FSPEC-NF-08 migration, `config.agents.colours` will no longer exist. Any call to `resolveColour(agentId, config)` will always fall through to the gray default — silently degrading the coordination thread UX without an error.

**Three possible resolutions (engineering cannot choose without PM direction):**

1. **`createCoordinationThread()` is Orchestrator metadata** — the initial thread message uses one of the four fixed-colour embed types from FSPEC-DI-03 (most likely Routing Notification). The per-agent colour is removed.
2. **`createCoordinationThread()` is agent content** — the initial thread message follows the same plain-text path as `postAgentResponse()`. No embed, no colour.
3. **Add a `colour` field to the new agent config schema** — the new `agents[]` entries add an optional `colour` field for use in coordination thread creation. This preserves per-agent colour without keeping the old flat-object schema.

**Action required:** PM to specify which resolution applies in FSPEC-DI-03 §5.4 (or FSPEC-EX-01 §4.2) before TSPEC authoring for REQ-DI-10. This is a blocking gap for those two requirements' interaction.

---

### F-02 (Low) — FSPEC-LG-01 §7.3 component enumeration is incomplete

**Affected:** REQ-NF-09

FSPEC-LG-01 §7.3 declares a **closed** enumeration of 8 valid component values with the constraint "No other values are valid." The live codebase (confirmed by inspection) contains additional modules that inject and call the logger but are not covered by the 8 listed components:

| Module | Current logger usage | Missing from §7.3? |
|--------|---------------------|---------------------|
| `question-poller.ts` | `this.logger.info/warn/error` | ✅ Not listed |
| `question-store.ts` | `this.logger.info/warn` | ✅ Not listed |
| `agent-log-writer.ts` | `this.logger.warn/error` | ✅ Not listed |
| `context-assembler.ts` | `this.logger.debug/info` | ✅ Not listed |
| `pattern-b-context-builder.ts` | `this.logger.debug` | ✅ Not listed |
| `pdlc/state-store.ts` | `this.logger.warn/error` | ✅ Not listed |

If REQ-NF-09 compliance means every log line uses a listed component, these modules are currently uncompliant and engineering needs PM guidance on the correct component label. The most natural resolution is either (a) adding a catch-all rule ("modules not listed above use `orchestrator`"), or (b) expanding the enumeration with entries for `question-poller`, `agent-log-writer`, and `context-assembler` as notable standalone components.

**Action required:** Add a fallback rule to FSPEC-LG-01 §7.3 (e.g., "for orchestrator submodules not listed above, use `orchestrator`") or expand the component list. This is not a blocker for TSPEC but must be resolved before engineering implements REQ-NF-09 to avoid ambiguous decisions at every unlisted call site.

---

## Positive Observations

- **FSPEC-DI-02 signal contract (§3.2)** is now exactly aligned with `RoutingSignalType` in `ptah/src/types.ts`. The table is unambiguous and directly testable against the live enum.
- **FSPEC-EX-01 §4.2 agent config schema** is well-specified. The `display_name` optional field with id-as-default fallback is a clean engineering contract. Validation rules in §4.3 and §4.8 cover all meaningful failure modes.
- **FSPEC-DI-03 §5.3 embed field schemas** provide exact color integers, field names, and footer text for all four embed types. Engineering can write acceptance tests directly against these schemas with no ambiguity.
- **FSPEC-RP-01 §6.2 error message templates** enumerate exact field values per error type. `ERR-RP-01` through `ERR-RP-05` give engineering a complete, testable surface area for REQ-RP-06 — nothing is left to interpretation.
- **FSPEC-LG-01 §7.3 component table** (for the 8 listed components) is exactly what engineering needs: named scopes map clearly to existing source modules. Zero guesswork for those modules.
- **REQ §5 Risks** continues to be unusually thorough. The logging call-site scope warning, the config migration scope acknowledgement, and the MCP capability verification flag are all items engineering would have raised in TSPEC; having them in the REQ reduces review iteration.

---

## Recommendation

**Approved with minor changes.**

Both prior high-severity blockers (F-01, F-02 from v1.2 review) are fully resolved. The v1.5 REQ and FSPEC v2.0 are ready for TSPEC authoring for **four of the six requirements** (REQ-DI-06, REQ-RP-06, REQ-NF-09, REQ-NF-10) with no further PM input needed.

Two clarifications are needed before TSPEC can begin for REQ-DI-10 and REQ-NF-08:

1. **F-01 (Medium)** — `createCoordinationThread()` disposition must be specified in FSPEC-DI-03 §5.4 or FSPEC-EX-01 §4.2. Blocks TSPEC for the REQ-DI-10 ↔ REQ-NF-08 interaction only.
2. **F-02 (Low)** — FSPEC-LG-01 §7.3 needs a fallback rule or expanded enumeration for logger-using modules not currently listed. Blocks precise REQ-NF-09 implementation but can be resolved with a one-line addendum.

Neither finding is a rewrite. Both are additive clarifications that can be resolved in a targeted FSPEC v2.1 patch.
