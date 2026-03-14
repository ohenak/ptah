# Cross-Review: Product Manager → Execution Plan (PLAN)

| Field | Detail |
|-------|--------|
| **Document Reviewed** | `006-PLAN-TSPEC-ptah-guardrails.md` |
| **Reference Documents** | `006-REQ-PTAH-guardrails.md` v1.0, `006-FSPEC-ptah-guardrails.md` v1.3, `006-TSPEC-ptah-guardrails.md`, `CROSS-REVIEW-product-manager-TSPEC-v2.md` |
| **Reviewer** | Product Manager |
| **Date** | March 13, 2026 |
| **Recommendation** | **Approved — all product requirements and FSPEC behaviors are correctly reflected in the execution plan. Implementation may proceed.** |

---

## 1. Review Scope

The PM reviews the PLAN from the **product perspective only**: requirements traceability, behavioral fidelity, acceptance test coverage, business rule implementation, and scope boundaries. Technical implementation choices (module structure, TypeScript interfaces, testing strategy) are outside this review's scope.

---

## 2. Requirements Traceability Check

All 6 Phase 6 requirements must be traceable to one or more PLAN tasks and to a Phase H acceptance test.

| Requirement | Title | PLAN Tasks | AT Coverage |
|-------------|-------|------------|-------------|
| REQ-SI-07 | Retry with Exponential Backoff | D-1, D-2, D-3 | AT-GR-01, AT-GR-03 (H-1, H-3) |
| REQ-SI-08 | Graceful Failure Handling | D-4, D-5, D-6, D-7, E-3, E-6 | AT-GR-02, AT-GR-04, AT-GR-05, AT-GR-17 (H-2, H-4, H-5, H-17) |
| REQ-NF-02 | Reliability | D-1–D-8, B-1–B-4, F-1–F-5 | AT-GR-01 through AT-GR-17 (all H tasks) |
| REQ-DI-08 | Post system message at max-turns limit | B-1, B-2, B-4, E-4, E-5 | AT-GR-06, AT-GR-07, AT-GR-10 (H-6, H-7, H-10) |
| REQ-RP-05 | Block fifth turn in review threads | B-1, B-3, B-4, E-4, E-5 | AT-GR-08, AT-GR-09, AT-GR-10 (H-8, H-9, H-10) |
| REQ-SI-10 | Wait for in-flight invocations on shutdown | C-1, C-2, F-1, F-2, F-3, F-4, F-5, G-1 | AT-GR-11, AT-GR-12, AT-GR-13, AT-GR-14, AT-GR-15, AT-GR-16 (H-11–H-16) |

**Verdict: All 6 requirements are fully traceable to PLAN tasks and acceptance tests. ✓**

---

## 3. FSPEC Behavioral Rule Verification

### 3.1 FSPEC-GR-01 Business Rules

| Rule | PLAN Task(s) | Assessment |
|------|-------------|------------|
| GR-R1 — no re-throw; catch at invocation level | D-4 (return status, not throw); E-3 (handle all GuardResult statuses) | ✓ Correct — orchestrator never propagates Skill failures to top-level process |
| GR-R2 — no jitter in backoff formula | D-3 (formula: `min(base * 2^(retry_count-1), max)`, no jitter mentioned) | ✓ Correct |
| GR-R3 — retry reuses existing worktree; reset before retry | D-3 explicitly: "worktree reset (`git reset --hard HEAD && git clean -fd`) before each retry" | ✓ Correct |
| GR-R4 — short error in thread embed; full stacktrace in #agent-debug | D-4: "log full error + stacktrace to `#agent-debug`"; error embed posted separately | ✓ Correct |
| GR-R5 — no retry on Discord error when posting error embed | D-4: "handle Discord unavailability gracefully (log to console, do NOT retry embed — GR-R5)" | ✓ Correct |
| GR-R6 — two-strike rule for malformed signals | D-6: first occurrence → transient retry; second consecutive → unrecoverable | ✓ Correct |
| GR-R7 — retry counter resets per invocation | D-6: "malformedSignalCount is scoped per invocation (reset to 0 each invokeWithRetry() call)" | ✓ Correct |
| GR-R8 — log every retry to #agent-debug | D-3 covers retry logging; D-4 covers exhaustion logging | ✓ Correct |
| GR-R9 — post-commit embed failure path | E-6: explicitly handles this path with commit SHA logged to #agent-debug | ✓ Correct |

### 3.2 FSPEC-GR-02 Business Rules

| Rule | PLAN Task(s) | Assessment |
|------|-------------|------------|
| GR-R11 — CLOSED thread: silent drop | B-2: "CLOSED threads return `'limit-reached'` on subsequent calls (GR-R11 silent drop)"; E-4: "check if already CLOSED (GR-R11 silent drop)" | ✓ Correct |
| GR-R12 — review thread check takes priority over general limit | E-4: "(1) if review thread → checkAndIncrementReviewTurn()... (GR-R12 takes priority)" | ✓ Correct |
| Turn reconstruction on restart | B-4, E-5: reconstruct from Discord history on first message post-restart | ✓ Correct — covers AT-GR-10 |

### 3.3 FSPEC-GR-03 Business Rules

| Rule | PLAN Task(s) | Assessment |
|------|-------------|------------|
| Abort backoff delays on shutdown (GR-R17 equivalent) | D-8: shutdownSignal fires during backoff → post embed, return `{status: "shutdown"}`; F-2: abort() called in Step 2 | ✓ Correct |
| AbortSignal NOT passed to SkillInvoker.invoke() — in-flight runs to completion | D-8: explicitly noted "AbortSignal is NOT passed to SkillInvoker.invoke() (active invocations run to completion — GR-R17)" | ✓ Correct — critical product behavior preserved |
| Double-SIGINT → immediate process.exit(1) | F-1: "double-SIGINT guard (AT-GR-14 — `shuttingDown` boolean → `process.exit(1)` on second signal)" | ✓ Correct |
| Commit pending worktree changes at shutdown | F-4: iterates WorktreeRegistry, checks uncommitted changes, commits each | ✓ Correct |

---

## 4. Acceptance Test Coverage

All 17 FSPEC acceptance tests must be mapped to Phase H tasks.

| AT | Description | H Task | Assessment |
|----|-------------|--------|------------|
| AT-GR-01 | Retry succeeds on 2nd attempt | H-1 | ✓ |
| AT-GR-02 | All retries exhausted — error embed, Orchestrator continues | H-2 | ✓ |
| AT-GR-03 | Exponential backoff timing | H-3 | ✓ |
| AT-GR-04 | Auth error → unrecoverable, 0 retries | H-4 | ✓ |
| AT-GR-05 | Two consecutive malformed signals | H-5 | ✓ |
| AT-GR-06 | General turn limit fires | H-6 | ✓ |
| AT-GR-07 | Silent drop for CLOSED thread | H-7 | ✓ |
| AT-GR-08 | Review thread stalled at 5th turn | H-8 | ✓ |
| AT-GR-09 | ROUTE_TO_DONE on Turn 4 → no stall | H-9 | ✓ |
| AT-GR-10 | Restart → turn counts reconstructed lazily | H-10 | ✓ |
| AT-GR-11 | Clean shutdown, no in-flight | H-11 | ✓ |
| AT-GR-12 | Shutdown waits for in-flight invocation | H-12 | ✓ |
| AT-GR-13 | Shutdown timeout exceeded → exit(1) | H-13 | ✓ |
| AT-GR-14 | Double SIGINT → immediate exit(1) | H-14 | ✓ |
| AT-GR-15 | Pending Git changes committed at shutdown | H-15 | ✓ |
| AT-GR-16 | Shutdown cancels backoff delay | H-16 | ✓ |
| AT-GR-17 | Post-commit embed fails — partial-commit error embed | H-17 | ✓ |

**Verdict: All 17 acceptance tests are covered. ✓**

---

## 5. Findings

### F-01 — Minor: GR-R11 label applied to STALLED path in B-3 [Low]

**Location:** Phase B, task B-3 description.

**Observation:** B-3 says "GR-R11 silent drop for STALLED". GR-R11 in the FSPEC applies to CLOSED threads (general turn limit). STALLED threads (review threads that hit Turn 5) are covered by a distinct FSPEC rule (the equivalent of GR-R13 in the FSPEC §4.3). The behavior specified in B-3 is **correct** (STALLED → silent drop), but the rule citation may cause confusion when an engineer reads B-3 alongside the FSPEC.

**Impact:** No behavioral change — the implementation instruction is correct. This is a documentation labeling issue only.

**Recommendation:** Engineering should cite the correct FSPEC rule for the STALLED silent drop in the code comment, not GR-R11. This does not require a PLAN revision — it is noted here so the engineer is aware when implementing B-3. If needed, verify the correct rule ID against FSPEC §4.3.

---

## 6. Clarification Questions

*None. The PLAN is sufficiently detailed for the PM to verify product intent. No engineering clarifications are needed.*

---

## 7. Positive Observations

- **Complete AT traceability.** All 17 acceptance tests map 1:1 to Phase H tasks. This is the correct structure for ensuring product behavior is verified before the gate closes.
- **GR-R17 (active invocations run to completion) is explicitly called out** in D-8 with a rationale comment. This is a critical product decision — interrupting an in-flight Claude API call would leave the worktree in an unknown state. Calling this out prevents the engineer from accidentally threading the AbortSignal through the wrong layer.
- **E-6 correctly handles the GR-R9 edge case.** The distinction between "total invocation failure" (D-4) and "post-commit embed failure" (E-6) is correctly preserved. Both are separate paths with separate embed bodies as required by FSPEC §3.3 GR-R9 and §3.4.
- **Dependency ordering in §3 (Task Dependency Notes)** correctly sequences `factories.ts` modifications before Phase E to avoid merge conflicts. This is good engineering hygiene that the PLAN explicitly captures.
- **Definition of Done in §5** correctly cross-references all 6 REQ acceptance criteria, all 17 ATs, and the three deferred BE findings. No product requirements are missing from the DoD.
- **Phase A is correctly identified as the mandatory foundation.** Establishing types before writing behavior-dependent modules prevents late-stage interface drift.

---

## 8. Recommendation

**Approved.**

The PLAN accurately reflects all 6 Phase 6 requirements and all 17 FSPEC acceptance tests. All FSPEC business rules (GR-R1 through GR-R9, GR-R11, GR-R12, and the shutdown rules) are correctly implemented in the task descriptions. The single finding (F-01) is a minor labeling issue that does not affect product behavior and does not require a PLAN revision.

**Implementation may begin once the test-engineer's review gate is also satisfied.**

---

*End of Review*
