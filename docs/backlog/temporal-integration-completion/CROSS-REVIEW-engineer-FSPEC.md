# Cross-Review: Engineer Review of FSPEC-temporal-integration-completion

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document** | FSPEC-temporal-integration-completion.md |
| **Date** | 2026-04-07 |

---

## Findings

### F-01: Cross-review file path derivation has two naming mismatches (Medium)

FSPEC-RC-01 step 2 says to derive the cross-review file path using `agentIdToSkillName()` and `crossReviewPath()`. However, the paths these functions produce do not match what the skill agents actually write to disk.

**Mismatch 1 — Skill name:**

`agentIdToSkillName("eng")` returns `"backend-engineer"` (via `AGENT_TO_SKILL` reverse lookup of `SKILL_TO_AGENT`). But the engineer skill writes files as `CROSS-REVIEW-engineer-{docType}.md` — using `"engineer"`, not `"backend-engineer"`.

Evidence from actual files on disk:
- `docs/backlog/temporal-integration-completion/CROSS-REVIEW-engineer-REQ.md` ← uses "engineer"
- `docs/completed/014-tech-lead-orchestration/CROSS-REVIEW-backend-engineer-PROPERTIES.md` ← uses "backend-engineer"

The convention is inconsistent across the repo, but the engineer skill definition explicitly uses `"engineer"` and that's what the current conversation's files use.

Other agents are consistent:
- `agentIdToSkillName("pm")` → `"product-manager"` ✓ matches `CROSS-REVIEW-product-manager-*`
- `agentIdToSkillName("qa")` → `"test-engineer"` ✓ matches `CROSS-REVIEW-test-engineer-*`

**Mismatch 2 — Document type:**

`buildInvokeSkillInput()` sets `documentType: phase.id` (e.g., `"req-review"`). But the skill file naming convention uses the uppercase document type abbreviation: `"REQ"`, `"TSPEC"`, `"FSPEC"`, `"PROPERTIES"`.

If `phase.id` is passed directly to `crossReviewPath()`, the path would be:
`docs/in-progress/auth/CROSS-REVIEW-backend-engineer-req-review.md`

But the actual file on disk is:
`docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md`

**Impact:** The `readCrossReviewRecommendation` activity will construct the wrong file path and return "Cross-review file not found" for every review, making the review cycle fail.

**Recommendation:** The FSPEC should specify:
1. How `agentId` maps to the file-name token (either fix `SKILL_TO_AGENT` mapping or add a separate `agentIdToFileToken()` function).
2. How `phase.id` maps to the document type abbreviation (e.g., strip `-creation`/`-review`/`-approved` suffix, then uppercase: `"req-review"` → `"REQ"`). This derivation logic must be defined, not left to the TSPEC.

### F-02: FSPEC-DR-01 workflow start trigger cannot fire for the most natural user interaction (Medium)

The FSPEC-DR-01 behavioral flow has a logical gap in the message routing precedence:

**The problem:** The most natural way for a user to start a workflow is `@pm define requirements for auth`. However:

1. Step 3: `parseAdHocDirective()` parses this as `{ agentIdentifier: "pm", instruction: "define requirements for auth" }` → returns a valid directive.
2. The flow branches to "Handle ad-hoc (EXISTING BEHAVIOR, unchanged)".
3. Existing behavior: tries to signal `ad-hoc-revision` to workflow `ptah-auth`.
4. No workflow exists → catches `WorkflowNotFoundError` → posts "No active workflow found for auth."

The user gets an error message instead of a new workflow starting.

The flow only reaches step 4+ (workflow start logic) when `parseAdHocDirective` returns `null` — i.e., when the message does NOT start with `@agent`. But then step 6a checks for "agent mention" (`@{agentId}` anywhere in the message per BR-DR-05). While this technically works for messages like "Please start working on this @pm", it's not how users naturally write Discord messages.

**Impact:** The primary user story (US-01: "I want to start a PDLC workflow from Discord by mentioning an agent in a thread") will fail for the most common message format.

**Recommendation:** The flow should be restructured. Two options:

**Option A (preferred):** Check for a running workflow BEFORE parsing ad-hoc directives. If no workflow exists AND the message contains an agent mention, start a new workflow. If a workflow exists, fall through to the existing ad-hoc/state-dependent routing.

**Option B:** When `parseAdHocDirective` returns a directive but the ad-hoc signal fails with `WorkflowNotFoundError`, catch the error and fall through to the workflow start logic.

The FSPEC should specify which approach to use, as this is a product-level routing decision, not a technical implementation choice.

---

## Clarification Questions

### Q-01: Should invalid state-action combinations produce user feedback?

FSPEC-DR-03 (BR-DR-13) says invalid combinations (e.g., "resume" when state is "failed") are silently ignored. From a UX perspective, wouldn't it be better to post a helpful message like "The workflow is in failed state. Use 'retry' or 'cancel'."? Silent ignore may leave users confused about why their command had no effect.

This is a product decision — silent vs. informative — and should be specified in the FSPEC rather than left to the engineer.

---

## Positive Observations

1. **Excellent state-dependent routing table.** The summary table at the end consolidating all DR FSPECs into a single routing matrix is exactly what the TSPEC needs. This eliminates ambiguity about which handler fires for every state+message combination.

2. **Business rules are precise and testable.** BR-RC-01 through BR-RC-06 and BR-DR-01 through BR-DR-14 are specific enough to translate directly into test assertions. No guesswork needed.

3. **Edge cases are well-considered.** The cross-review parser edge cases (empty file, partial write, multiple headings, LGTM substring matching) are grounded in actual `parseRecommendation()` behavior. The Discord edge cases (message edits, simultaneous users, signal buffering) anticipate real-world concurrency scenarios.

4. **FSPEC coverage rationale is sound.** The table at the top correctly identifies which requirements need FSPECs (behavioral complexity) and which don't (wiring, bug fixes, test requirements). This saves unnecessary specification overhead.

5. **Temporal signal buffering awareness.** FSPEC-DR-02 and DR-03 correctly note that signals are buffered by Temporal when the workflow transitions between states during the query-then-signal window. This avoids over-engineering race condition handling.

6. **Clean separation between DR-01, DR-02, and DR-03.** Each FSPEC covers one distinct routing path with clear entry conditions. The flows compose well — the summary table proves they're exhaustive and non-overlapping.

---

## Recommendation

**Needs revision**

Two Medium-severity findings require clarification before the TSPEC can be written without the engineer making product decisions:

1. **F-01:** The cross-review file path derivation produces paths that don't match actual skill output. The FSPEC must specify how `agentId` maps to the file-name token and how `phase.id` maps to the document type abbreviation.

2. **F-02:** The FSPEC-DR-01 workflow start flow cannot trigger for `@agent` messages (the primary use case) because `parseAdHocDirective()` intercepts them first. The FSPEC must restructure the routing precedence.

The author should address both Medium findings and route the updated FSPEC back for re-review.
