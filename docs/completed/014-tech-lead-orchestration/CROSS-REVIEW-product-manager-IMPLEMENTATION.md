# Cross-Review: Product Manager → IMPLEMENTATION

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Deliverable Reviewed** | Feature 014 codebase implementation (Phases A–F) |
| **Cross-Referenced Against** | 014-REQ v1.4, 014-FSPEC v1.6, 014-TSPEC (revised), 014-PLAN, 014-PROPERTIES v1.1 |
| **Date** | 2026-03-21 |
| **Test Suite** | 1252 passed, 0 failed (58 test files) |

---

## Scope

This review covers the product-perspective correctness of the implementation against the 28 requirements in the REQ. It does NOT evaluate code quality, architecture, or test strategy — only whether the delivered behavior matches the product intent.

**Files reviewed:**

| Phase | File | What It Implements |
|-------|------|--------------------|
| A | `ptah/src/types.ts` | `MergeBranchParams`, `BranchMergeResult`, `AgentEntry.mentionable`, orchestrator config fields |
| A | `ptah/src/config/loader.ts` | Snowflake validation bypass when `mentionable === false` |
| B | `ptah/src/orchestrator/pdlc/phases.ts` | `FeatureConfig.useTechLead?: boolean` |
| B | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | `phaseToAgentId` → "tl" routing; `isForkJoinPhase` suppression |
| C | `ptah/ptah.config.json` | "tl" agent entry, `tech_lead_agent_timeout_ms`, `retain_failed_worktrees` |
| C | `docs/templates/backend-plans-template.md` | Fan-out dependency syntax documentation |
| D | `ptah/src/orchestrator/artifact-committer.ts` | `mergeBranchIntoFeature` with merge lock |
| E | `ptah/tests/integration/config/agent-registry.test.ts` | End-to-end "tl" agent wiring validation |
| F | `.claude/skills/tech-lead/SKILL.md` | Full FSPEC behavioral logic (primary deliverable) |

---

## Requirement Coverage Assessment

### Plan Dependency Analysis (PD)

| Req | Title | Status | Notes |
|-----|-------|--------|-------|
| REQ-PD-01 | Parse dependency graph | PASS | All 3 syntax forms (linear chain, fan-out, natural language) implemented in SKILL.md. Phase names matched case-insensitively with whitespace trimming. |
| REQ-PD-02 | Topological batches | PASS | Kahn's layering algorithm implemented. Batch N = longest dependency chain from root + 1. |
| REQ-PD-03 | Skill assignment | PASS | Source file prefix mapping table covers all specified prefixes. Mixed-layer warning surfaced in confirmation. |
| REQ-PD-04 | Detect completed phases | PASS | Phases with all tasks ✅ excluded from batch computation. Zero-task phases treated as NOT completed. |
| REQ-PD-05 | Sequential fallback | PASS | Missing/unparseable dependency section triggers fallback with warning. |
| REQ-PD-06 | Cycle detection | PASS | Kahn's residual nodes detect cycles; cycle path logged; sequential fallback entered. |

### Batch Dispatch (BD)

| Req | Title | Status | Notes |
|-----|-------|--------|-------|
| REQ-BD-01 | Sequential batch execution | PASS | Batch N waits for N-1 completion + test gate pass. |
| REQ-BD-02 | Parallel phase dispatch | PASS | All phases in batch dispatched concurrently with `isolation: "worktree"`. |
| REQ-BD-03 | Worktree isolation | PASS | Agent tool `isolation: "worktree"` parameter used per phase. |
| REQ-BD-04 | Merge worktree results | PASS | Sequential merge in document order. `mergeBranchIntoFeature` implemented with lock serialization, conflict detection, 4-status result type. |
| REQ-BD-05 | Test validation gate | PASS | `npx vitest run` from `ptah/`. Assertion failure vs runner failure distinguished. Both halt with ROUTE_TO_USER. |
| REQ-BD-06 | Resume from batch | PASS | Auto-detected from plan Done status. Resume note in confirmation. |
| REQ-BD-07 | Phase failure handling | PASS | No-partial-merge invariant. Running agents complete naturally. Worktree cleanup per `retain_failed_worktrees` config. |
| REQ-BD-08 | Update plan status | PASS | Tasks marked ✅ after merges + test gate pass. Commit with `"chore: mark Batch {N} phases as Done in plan"`. |

### Tech Lead Orchestration (TL)

| Req | Title | Status | Notes |
|-----|-------|--------|-------|
| REQ-TL-01 | Invoke tech lead | PASS | `phaseToAgentId` returns "tl" when `useTechLead === true`. Config entry registered with `mentionable: false`. |
| REQ-TL-02 | Confirmation loop | PASS | AskUserQuestion with approve/modify/cancel. 4 modification types. 5-iteration cap. 10-min timeout with defensive null/sentinel handling. No auto-approval. |
| REQ-TL-03 | No code writing | PASS | SKILL.md explicitly constrains: "You never use Edit or Write on source code files — only on plan documents." |
| REQ-TL-04 | Merge conflict reporting | PASS | Conflict files reported. Merge aborted. Execution halts with ROUTE_TO_USER. |
| REQ-TL-05 | Delegate context | PASS | Agent dispatch includes plan path, phase letter/title, feature branch, completed deps, ACTION directive. |

### Progress Reporting (PR)

| Req | Title | Status | Notes |
|-----|-------|--------|-------|
| REQ-PR-01 | Batch start notification | PASS | Posted before dispatch with phase count and skill assignments. |
| REQ-PR-02 | Phase completion notification | PASS | Posted per phase with success/failure status. |
| REQ-PR-03 | Batch summary | PASS | Posted after test gate with phase count and test results. |
| REQ-PR-04 | Final summary | PASS | Posted after all batches with totals and elapsed time. |

### Non-Functional (NF)

| Req | Title | Status | Notes |
|-----|-------|--------|-------|
| REQ-NF-14-01 | Concurrency cap | PASS | Batches > 5 phases split into sub-batches of max 5. Test gate fires once per topological batch. |
| REQ-NF-14-02 | Worktree cleanup | PASS | Successful worktrees always cleaned. Failed worktrees cleaned unless `retain_failed_worktrees: true`. |
| REQ-NF-14-03 | Backward compatibility | PASS | `useTechLead` optional (absent = false). Fork-join suppressed only for IMPLEMENTATION when true. All existing routing preserved. |
| REQ-NF-14-04 | Plan format compatibility | PASS | Template updated with fan-out syntax docs. Linear-chain plans produce single-phase batches. |
| REQ-NF-14-05 | Pre-flight checks | PASS | Check 1: `git ls-remote` for remote branch. Check 2: Grep for `mergeBranchIntoFeature`. Sequential fallback on failure. |

### Exit Signals

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Clean exits (plan not found, all done, cancel, timeout) | LGTM | LGTM | PASS |
| Blocking failures (phase failure, merge conflict, test gate) | ROUTE_TO_USER | ROUTE_TO_USER | PASS |

---

## Test Coverage

All 18 TSPEC §7.4 unit/integration test cases are implemented and passing:

| Category | Tests | Status |
|----------|-------|--------|
| Dispatcher routing (`useTechLead`) | 6 | PASS |
| Fork-join suppression | 3 | PASS |
| `mergeBranchIntoFeature` (5 outcomes + lock release) | 5 | PASS |
| Config loader (`mentionable` validation) | 4 | PASS |
| Integration (agent registry wiring) | 1 | PASS |
| **Full suite** | **1252 tests, 58 files** | **0 failures** |

---

## Findings

None.

---

## Positive Observations

1. **Complete requirement coverage.** All 28 requirements are implemented across the TypeScript changes and SKILL.md. No requirements are missing or partially implemented.

2. **Exit signal contract correctly implemented.** The critical ROUTE_TO_USER / LGTM distinction (subject of the High-severity TSPEC finding and Medium-severity PROPERTIES finding) is correctly encoded in both the SKILL.md response contract and the TSPEC §6 error handling logic.

3. **OQ-01 resolution fully delivered.** The `mentionable` field, config loader bypass, "tl" agent entry, and integration test form a complete chain from type definition through validation to runtime wiring.

4. **Backward compatibility verified.** The optional `useTechLead` field, preserved routing for absent/false cases, and fork-join suppression only for IMPLEMENTATION when true — all confirmed by passing tests.

5. **Defensive handling for open questions.** OQ-02 (AskUserQuestion timeout) mitigated with dual null/sentinel handling. OQ-03 (failed agent branch name) mitigated with fallback and warning log.

6. **Plan template updated.** Fan-out dependency syntax is documented with examples, enabling plan authors to express parallelism opportunities.

---

## Recommendation

**Approved** — The implementation is feature-complete and matches all 28 requirements. All tests pass. No product-level concerns.

---

*End of Review*
