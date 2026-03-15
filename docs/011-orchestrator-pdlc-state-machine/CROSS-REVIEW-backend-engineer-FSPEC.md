# Cross-Review: Backend Engineer Review of FSPEC-011

| Field | Detail |
|-------|--------|
| **Document** | [011-FSPEC-orchestrator-pdlc-state-machine.md](011-FSPEC-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Backend Engineer (`eng`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: Fullstack TSPEC/PLAN review tracking requires per-reviewer-per-document status, not per-reviewer (High)

FSPEC-RT-02 tracks reviewer status as `pending | approved | revision_requested` per reviewer. But FSPEC-FC-01 defines fullstack TSPEC/PLAN reviews as reviewer-document pairs — `pm` reviews both backend and frontend TSPEC, producing 2 cross-review files. The per-reviewer status model cannot represent "pm approved backend TSPEC but hasn't reviewed frontend TSPEC yet."

BR-RC-03 explicitly states 6 cross-review files are expected for fullstack TSPEC_REVIEW, but the review lifecycle (FSPEC-RT-02) only tracks per-reviewer status, not per-reviewer-per-document status.

**Impact:** The state model is structurally insufficient for fullstack TSPEC/PLAN reviews. We'd need to either:
- (a) Track `(reviewer, document)` pairs in the review status map (e.g., `{ "pm:be_tspec": "approved", "pm:fe_tspec": "pending" }`)
- (b) Treat fullstack TSPEC_REVIEW as two separate sub-reviews with independent reviewer sets (fork/join at the review level too)

**Recommendation:** FSPEC-RT-02 must explicitly address how reviewer status is tracked when a single reviewer reviews multiple documents. Option (a) is simpler. Define the review status key as `reviewer_id` for single-discipline or `reviewer_id:document_scope` for fullstack multi-document reviews.

---

### F-02: Sequential dispatch contradicts REQ-RT-08 and creates suboptimal revision loops (Medium)

FSPEC-RT-02 step 4 says "Dispatch review requests to each reviewer sequentially." Combined with BR-RL-03 ("A single rejection from ANY reviewer triggers the revision loop"), this means:
- If reviewers are dispatched as [eng, qa] and `eng` rejects, `qa` is never invoked.
- After revision, both are dispatched again. `qa` might also reject, causing another loop.
- Sequential dispatch + early-exit = potential ping-pong where each revision fixes one reviewer's feedback but another reviewer (never seen the doc) rejects for different reasons.

REQ-RT-08 (P1) calls for concurrent review dispatch. The FSPEC should explicitly note that sequential dispatch is the P0 implementation and that concurrent dispatch is deferred.

**Impact:** Unnecessary revision cycles when multiple reviewers would have rejected independently.

**Recommendation:** Add a note to FSPEC-RT-02 stating: "Step 4 uses sequential dispatch (P0). Concurrent dispatch per REQ-RT-08 is a P1 enhancement. Sequential dispatch with early-exit on rejection is the current design." Also consider whether the early-exit behavior should be revised: dispatch all reviewers sequentially but wait for all to complete before evaluating rejection, so the author gets all feedback in one round.

---

### F-03: FSPEC-RT-01 code block exclusion adds parsing complexity (Low)

The edge case "Code blocks should be ignored during heading search" requires the parser to track fenced code block state (matching ` ``` ` delimiters). This is technically feasible but adds complexity beyond simple regex matching.

**Impact:** Minor implementation complexity. The parser needs to be a stateful scanner rather than a regex match.

**Recommendation:** This is implementable. Consider using a line-by-line scanner that toggles `insideCodeBlock` state on ` ``` ` lines before searching for Recommendation headings. Alternatively, strip code blocks first, then regex-match the remainder. I'll handle this in the TSPEC.

---

### F-04: FSPEC-SM-02 migration chain scalability (Low)

BR-PS-05 requires sequential migration (v1→v2→v3, not v1→v3). This is the standard pattern and is correct. However, the FSPEC doesn't specify whether migration functions are registered declaratively (e.g., `migrations: { 1: migrateV1ToV2, 2: migrateV2ToV3 }`) or discovered by convention.

**Impact:** Minor — this is a TSPEC concern. Mentioning it here because the migration function registration pattern affects testability.

**Recommendation:** No FSPEC change needed. The TSPEC will define the migration registry pattern.

---

### F-05: FSPEC-RT-02 revision bound resume behavior is underspecified (Medium)

The edge case "Feature is paused (ROUTE_TO_USER) due to revision bound, then developer resumes" says the resume behavior is "left to TSPEC to define the resume protocol." This is a product-level decision, not a technical one:
- (a) Reset revision count and re-enter review — means the developer acknowledges the situation and allows another 3 cycles
- (b) Force-advance the phase — means the developer overrides the rejection and advances anyway

These have different product implications. Force-advance means a document advances without reviewer approval, which conflicts with the core purpose of the state machine (US-14: "eliminate the possibility of a document advancing without all required reviews").

**Recommendation:** The FSPEC should specify the expected behavior. My recommendation: option (a) (reset count, re-enter review) as the default, since it preserves the integrity guarantee. The developer's response can include explicit override language if they want option (b).

---

### F-06: FSPEC-AI-01 ROUTE_TO_AGENT handling needs integration clarification (Low)

FSPEC-AI-01 step 4 says ROUTE_TO_AGENT triggers "Invoke target agent for one turn. Log warning." But the current orchestrator's routing loop (`orchestrator.ts`) is fundamentally built around ROUTE_TO_AGENT as the continuation mechanism. The new state machine treats it as a side-channel, which means the orchestrator needs to distinguish between:
- PDLC-managed invocations (driven by phase transitions)
- Ad-hoc ROUTE_TO_AGENT invocations (legacy/side-channel)

**Impact:** The integration between the new state-machine-driven dispatch and the existing routing loop needs careful design in the TSPEC. This is noted here for awareness but doesn't require FSPEC changes.

**Recommendation:** No FSPEC change needed. The TSPEC must clearly define how the existing `executeRoutingLoop` in `orchestrator.ts` is modified to support both PDLC-managed and ad-hoc routing modes.

---

## Clarification Questions

### Q-01: Should "Approved with minor changes" trigger any follow-up action?

FSPEC-RT-01 maps "Approved with minor changes" to `approved`, which is the same outcome as plain "Approved." But the "minor changes" imply the author should make some updates. Should the orchestrator:
- (a) Treat identically to "Approved" — no follow-up (current behavior)
- (b) Advance the phase but log the minor-changes feedback for the author's reference in a future phase

Option (a) is simpler and consistent with the FSPEC as written. Option (b) adds complexity without clear benefit since the cross-review file is already on disk. Confirming (a) is the intent.

### Q-02: FSPEC-CA-01 BR-CA-04 — what about fullstack PLAN_CREATION context?

BR-CA-04 says "each engineer receives only their own discipline's prerequisite documents." For fullstack PLAN_CREATION, the context matrix says "overview.md, approved TSPEC." Does the backend engineer receive only the backend TSPEC, and the frontend engineer only the frontend TSPEC? If so, this should be explicitly stated in the context matrix row for PLAN_CREATION (currently it just says "approved TSPEC" without specifying which one).

---

## Positive Observations

- **P-01:** Pure function design throughout. `(currentState, event) → newState`, `(phase, discipline) → reviewerSet`, phase-aware context matrix — these are all trivially testable without I/O.

- **P-02:** FSPEC-SM-02 comprehensively addresses state persistence with atomic writes, schema versioning, migration chains, and every failure mode (disk full, permission denied, corrupted file, version mismatch). This directly resolves my F-02 and F-04 findings from the REQ review.

- **P-03:** FSPEC-RT-01 failure cases with specific ROUTE_TO_USER messages are excellent. Each failure case gives the user an actionable message identifying the reviewer and file path. This resolves my F-03 from the REQ review (approval detection fragility).

- **P-04:** The revision bound (3 cycles per phase, FSPEC-RT-02) is a practical safeguard against infinite loops. The per-phase tracking (BR-RL-01, BR-RL-05) is the right granularity.

- **P-05:** FSPEC-SM-01's clear separation of events (LGTM, all_subtasks_complete, all_approved, revision_requested, auto) maps cleanly to a discriminated union type in TypeScript.

- **P-06:** Section 4 ("Requirements NOT Requiring FSPEC") is a good practice — explicitly listing what was deferred to TSPEC prevents both over-specification and gaps.

- **P-07:** FSPEC-AI-01's handling of TASK_COMPLETE during non-terminal phase (treat as LGTM) is pragmatically correct — agents may misinterpret, and this degrades gracefully.

---

## Summary

This is a thorough and well-structured FSPEC that provides clear behavioral specifications for all 7 areas of complexity. The pure-function design philosophy is consistently applied and maps cleanly to the existing codebase patterns.

The primary issue is **F-01** — the reviewer status tracking model in FSPEC-RT-02 is structurally insufficient for fullstack TSPEC/PLAN reviews where a single reviewer reviews multiple documents. This must be resolved before TSPEC creation, as it directly affects the state data model.

**F-02** (sequential vs. concurrent dispatch) and **F-05** (revision bound resume behavior) are product decisions that should be explicitly documented in the FSPEC rather than deferred to the TSPEC.

The remaining findings (F-03, F-04, F-06) are low-severity and can be addressed in the TSPEC.

**Recommendation: Approved with minor changes** — address F-01 (reviewer-document pair tracking) and F-05 (revision bound resume behavior), then proceed to TSPEC.
