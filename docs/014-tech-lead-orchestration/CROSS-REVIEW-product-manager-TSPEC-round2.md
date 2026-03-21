# Cross-Review: Product Manager → TSPEC (Round 2)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | 014-TSPEC-tech-lead-orchestration (Draft, revised 2026-03-21) |
| **Cross-Referenced Against** | 014-REQ-tech-lead-orchestration v1.4, 014-FSPEC-tech-lead-orchestration v1.6 |
| **Previous Review** | CROSS-REVIEW-product-manager-TSPEC.md (2026-03-20) |
| **Date** | 2026-03-21 |

---

## Prior Findings — Resolution Status

### F-01 (was High) — Exit signal contradiction: **RESOLVED**

§6 error handling table now correctly specifies `ROUTE_TO_USER` for all four failure scenarios (phase agent failure, merge conflict, test gate assertion failure, test gate runner failure). §12 response contract is consistent: `LGTM` for clean exits, `ROUTE_TO_USER` for blocking failures. No contradiction remains.

### F-02 (was Medium) — OQ-01 blocking concern: **RESOLVED**

OQ-01 is now marked "Resolved — option (a)." The `mentionable?: boolean` field is added to `AgentEntry`, the "tl" config entry includes `mentionable: false`, and the TSPEC explicitly requires the PLAN to schedule this task before the `ptah.config.json` update. Test coverage added in §7.3/§7.4 (config loader tests + integration agent registry test).

### Q-01 — Test gate runner failure exit signal: **RESOLVED**

Runner failure now uses `ROUTE_TO_USER` (§6, line 537), consistent with assertion failure treatment per FSPEC-BD-01 §2.6.1 step 8.

---

## New Findings

None.

---

## Positive Observations

1. **All prior findings fully addressed.** The contradiction in §6 vs §12 is resolved, and OQ-01 has a concrete implementation with test coverage.

2. **Defensive mitigations for remaining open questions.** OQ-02 (AskUserQuestion timeout) and OQ-03 (failed agent worktree branch name) are mitigated with fallback logic in §5.10 and §5.7 respectively — both are sensible engineering choices that do not change product intent.

3. **New §7.5 acceptance test scenarios.** 22 structured acceptance tests (AT-PD-01 through AT-BD-03-08) provide comprehensive validation criteria for the prompt-based SKILL.md. These align with the FSPEC acceptance tests and cover all critical paths: dependency parsing (3 syntax forms + cycle + missing section), sub-batch splitting, skill assignment (4 variants), pre-flight checks, confirmation loop (7 scenarios), batch execution lifecycle (success, failure, merge conflict, test gate failures), resume detection, plan status update, and sub-batch test gate timing.

4. **Lock release verification in tests.** The `mergeBranchIntoFeature` tests now assert lock release in all paths (success, conflict, already-up-to-date, git error) — a correctness improvement that ensures resource cleanup.

---

## Recommendation

**Approved** — All High and Medium findings from Round 1 are resolved. No new product-level concerns. The TSPEC accurately reflects the requirements and FSPEC behavioral specifications.

---

*End of Review*
