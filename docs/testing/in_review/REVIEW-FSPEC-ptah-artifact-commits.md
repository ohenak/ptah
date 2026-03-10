# Test Engineer Review: FSPEC-PTAH-PHASE4 (Artifact Commits)

| Field | Detail |
|-------|--------|
| **Document ID** | REVIEW-FSPEC-PTAH-PHASE4 |
| **Reviewed Document** | [004-FSPEC-ptah-artifact-commits.md](../../specifications/004-FSPEC-ptah-artifact-commits.md) v1.1 |
| **Linked Requirements** | REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05 |
| **Reviewer** | Test Engineer |
| **Date** | March 10, 2026 |
| **Recommendation** | **Approved with revisions** |

---

## 1. Review Scope

This review assesses the FSPEC's **testability and edge case completeness** against six focus areas:

1. Are the 31 acceptance tests + 2 E2E tests sufficient to cover all behavioral branches?
2. Merge conflict scenarios — are there missing conflict patterns?
3. Concurrent merge ordering — is the serialization testable?
4. Restart deduplication (FSPEC-AC-03 §5.2 Step 5) — is the thread-history-based recovery testable?
5. Agent log append edge cases — any missing scenarios?
6. Are the error scenarios (§3.6, §4.6, §5.5) complete?

**Documents analyzed:** FSPEC v1.1, REQ-PTAH (6 Phase 4 requirements + REQ-SI-11/12 for worktree context), traceability matrix v1.5, Phase 3 FSPEC-SI-01 §7.9 (worktree lifecycle).

---

## 2. Findings

### F-01 (High): 9 behavioral branches in FSPEC-AC-01 lack acceptance tests

The 14 ATs for FSPEC-AC-01 cover the primary happy/sad paths but miss every §3.6 error scenario and several §3.5 edge cases. The error handling paths in Step 8a/8b determine whether changes are discarded vs. retained and whether error embeds are posted — these are critical behavioral distinctions that need AT coverage.

| # | Missing Branch | FSPEC Reference | Severity |
|---|---|---|---|
| 1 | `git add` or `git commit` failure → changes discarded, error embed posted, pipeline continues | §3.6 rows 1-2, Step 8a | High |
| 2 | Non-conflict merge failure (I/O error) → treated as conflict, worktree retained | §3.6 row 4, Step 8b | High |
| 3 | Merge lock acquisition timeout → error embed, worktree retained | §3.6 row 7 | Medium |
| 4 | Worktree removal failure → non-blocking, startup pruning handles it | §3.6 row 5 | Medium |
| 5 | Branch deletion failure → non-blocking, orphaned branch remains | §3.6 row 6 | Low |
| 6 | Worktree branch already exists with commits (orphaned from crash) → flag for review, create new branch | §3.5 row 4 | Medium |
| 7 | Worktree branch already exists without commits → delete and recreate | §3.5 row 4 | Low |
| 8 | Skill directly modifies `docs/agent-logs/` in worktree → committed with warning | §3.5 row 6 | Low |
| 9 | Merge lock released on **success** path (AC-R8 only tested for conflict in AT-AC-11) | AC-R8 | Medium |

**Recommendation:** Add at minimum:
- **AT-AC-15**: Commit failure (git add/commit error) → changes discarded, error embed posted, Discord posting and routing still proceed.
- **AT-AC-16**: Non-conflict merge failure (I/O error) → worktree retained (same as conflict handling), error embed posted.
- **AT-AC-17**: Merge lock timeout → error embed posted, worktree retained for manual resolution, no deadlock.
- **AT-AC-18**: Merge lock released on success path — after successful merge, the next queued merge can proceed.

---

### F-02 (High): Missing merge conflict patterns

AT-AC-03 only tests "same file modified by two agents." The `/docs/` artifact space is a multi-agent editing environment where several conflict patterns are likely:

| # | Conflict Pattern | Current Coverage | Risk |
|---|---|---|---|
| 1 | Agent A deletes a `/docs/` file; Agent B modifies the same file concurrently | Not specified | High |
| 2 | Two agents both create the same new file (e.g., `docs/auth/analysis.md`) with different content | Not specified | High |
| 3 | Two agents modify the same file but different non-overlapping lines (Git auto-merges) | Not specified — Git silently succeeds | Medium |
| 4 | Agent modifies a file that was deleted on main by a human push between worktree creation and merge | Partially covered by §3.5 "main diverged significantly" | Medium |

**Key question (Q-01):** Pattern #3 is the most consequential. Git's auto-merge will silently succeed when two agents modify non-overlapping lines of the same file. The merged result may be semantically inconsistent (e.g., PM Agent changes a requirement in section 1 while Dev Agent writes a specification referencing the old requirement in section 3). **Is Git auto-merge acceptable for Phase 4?** If yes, document it as an explicit design decision. If no, should all concurrent edits to the same file be flagged as conflicts?

**Key question (Q-02):** Should the delete-modify pattern (#1) have its own edge case entry in §3.5 with explicit expected behavior? Git reports this as a conflict, but the FSPEC should confirm that the standard conflict handling (Step 7 — retain worktree, post error embed) applies.

**Recommendation:** At minimum, add an edge case row for delete-modify and new-file collision to §3.5, confirming they follow standard conflict handling. Add one AT for the delete-modify pattern specifically, as it is the most likely multi-agent conflict in a documentation workspace.

---

### F-03 (Medium): Concurrent merge serialization — testable but underspecified

AT-AC-04 tests that two merges are serialized. AC-R9 (new in v1.1) addresses the merge-lock/log-lock interaction. Remaining gaps:

| # | Issue | Detail |
|---|---|---|
| 1 | **Merge lock timeout value unspecified** | §3.6 says timeout "should be rare" and merges are "<1s." But no timeout value is specified. Without a defined value, the TSPEC engineer must choose one, and the timeout AT (F-01 #3) cannot specify expected behavior precisely. |
| 2 | **Ordering guarantee undefined** | §3.2 Step 4a says "acquire the merge lock" but doesn't specify ordering (FIFO? arbitrary?). AT-AC-04 says "one merge completes first" without specifying which. For testability, the ordering doesn't need to be deterministic, but the FSPEC should state whether ordering is guaranteed or not. |
| 3 | **AC-R9 synchronization is a constraint, not a behavior** | AC-R9 correctly identifies that merge lock and log-append lock must not conflict. It delegates the mechanism to the TSPEC. This is appropriate for an FSPEC, but the interaction should have an AT verifying the constraint: a log append must not corrupt a concurrent merge, and vice versa. |

**Recommendation:**
- Specify a merge lock timeout value (or range) so the TSPEC and tests have a target.
- State explicitly whether merge ordering is FIFO or unspecified.
- Add **AT-AC-19**: Concurrent merge and log append — a log append to `docs/agent-logs/dev-agent.md` does not interfere with a concurrent merge to main (validates AC-R9 constraint).

---

### F-04 (Medium): Restart deduplication — testable but has a semantic gap

AT-ID-05 tests the restart recovery path and is well-structured. The mechanism (inspect thread history for bot responses) is testable. However:

**Semantic gap (Q-03):** ID-R5 states "re-committing the same changes produces a no-op merge." This claim assumes deterministic Skill output. Skills are LLM-based and non-deterministic — re-invoking a Skill on the same message after restart will likely produce *different* artifacts, not a replay. The re-processing is correct behavior (the original output was lost), but the "idempotent" framing is misleading. The FSPEC should clarify: **restart re-processing produces new output, not a replay. This is safe because the original invocation's output was lost (never merged or posted), so new output is the correct recovery.**

**Missing AT — partial-processing crash:** What if the process crashes after merge succeeds but before the Discord response is posted?

- On restart: message has no bot response → re-processed
- Skill produces *different* artifacts → committed and merged (new commit)
- Result: two commits for the same message, with potentially different content

This is an edge case the FSPEC should acknowledge explicitly. Is this acceptable? The alternative (checking Git history for `[ptah]` commits matching the thread) would be complex. If the current behavior is accepted, document it as a known limitation.

**Missing AT — error-embed restart interaction:** AT-ID-06 tests that a failed message stays in the in-memory processed set. But on restart, the in-memory set is empty. The thread history shows a bot error embed. Does FSPEC-RP-01's routing logic treat an error embed as a "bot response" that suppresses re-processing? This cross-FSPEC interaction needs an explicit AT or a clarifying note.

**Recommendation:**
- Reword ID-R5 to acknowledge non-deterministic re-processing.
- Add a note to §5.4 documenting the partial-crash double-commit scenario and its acceptability.
- Add **AT-ID-08**: Post-restart, a message whose original invocation failed (error embed posted) is NOT re-processed — the error embed in thread history serves as the bot response.

---

### F-05 (Medium): Agent log append — pipe character corruption and 2 missing ATs

**Data integrity issue (Q-04):** The log entry format (§4.3) uses Markdown table syntax with `|` as the column delimiter. Thread names come from Discord and can contain any character, including `|`. Example:

- Thread name: `auth | review requirements`
- Log entry: `| 2026-03-10T14:30:00Z | completed | auth | review requirements | a1b2c3d | review requirements |`
- Result: 7 columns instead of 5 — **table is corrupted**

The FSPEC should specify an escaping rule for `|` in thread names and summaries (e.g., replace `|` with `\|` or `-`).

**Missing ATs:**

| # | Missing Scenario | FSPEC Reference | Severity |
|---|---|---|---|
| 1 | Malformed log file (header missing or corrupt) → append best-effort, log warning | §4.5 row 2 | Medium |
| 2 | File locked by editor → retry once, then skip with warning | §4.5 row 4 | Medium |

**Recommendation:**
- Add an escaping rule for `|` in log entry fields to §4.3 or §4.4 as a new business rule (AL-R7).
- Add **AT-AL-09**: Malformed log file → entry appended anyway (best-effort), warning logged.
- Add **AT-AL-10**: Log file locked by another process → retry once, skip on second failure, warning logged, pipeline not blocked.

---

### F-06 (Medium): Error scenario gaps across FSPECs

#### §3.6 (Artifact Commit & Merge) — 1 gap:

| Missing Error | Why It Matters |
|---|---|
| Git index lock file exists in worktree (`index.lock`) | A common Git failure mode after a crashed `git add`/`git commit`. §3.5 mentions "locked index" as an edge case but §3.6 doesn't list it as a separate error. It should be explicitly called out as a commit failure (Step 8a) variant, or the existing §3.5 entry should cross-reference §3.6 row 1/2 to make clear it follows the same handling. |

**Note:** The v1.1 additions (force-push edge case, stale-logs-in-worktree) are good — they close gaps I would have flagged.

#### §4.6 (Agent Log) — 1 gap:

| Missing Error | Why It Matters |
|---|---|
| File locked by another process → retry fails | §4.5 row 4 describes the behavior (retry once → skip) but §4.6 doesn't list it as an error scenario. The behavior is specified in the edge case table but should also appear in the error table for completeness, since it involves a failure and a specific recovery action. |

#### §5.5 (Idempotent Message Processing) — Complete:

The single error scenario (malformed message without ID) is sufficient. Deduplication is simple Set-based logic with a minimal error surface.

---

## 3. Open Questions for Resolution

| # | Question | Options | Impact |
|---|---|---|---|
| Q-01 | Is Git auto-merge (non-overlapping changes to the same file by different agents) acceptable for Phase 4? | **Option A:** Accept auto-merge. Document as explicit design decision. Risk: semantically inconsistent merged artifacts. **Option B:** Flag all concurrent edits to the same file as conflicts, regardless of Git's merge result. Safer but more manual resolution required. | Determines whether AT-AC-03 scope is sufficient or needs a "semantic conflict" variant. |
| Q-02 | Should delete-modify conflict (Agent A deletes file, Agent B modifies it) be an explicit edge case in §3.5? | **Option A (recommended):** Add to §3.5, confirm standard conflict handling (Step 7) applies. **Option B:** Covered implicitly by "merge conflict" — no change needed. | Affects edge case completeness and TSPEC clarity. |
| Q-03 | Should ID-R5 be reworded to acknowledge non-deterministic re-processing on restart, and should the partial-crash double-commit scenario be documented? | **Option A (recommended):** Reword ID-R5 to clarify that restart re-processing produces new (potentially different) output, not a replay. Document double-commit as accepted limitation. **Option B:** Keep ID-R5 as-is. The "idempotent" claim refers to the pipeline mechanism, not Skill output. | Affects accuracy of the idempotency contract and TSPEC engineer's understanding of edge cases. |
| Q-04 | Should pipe characters (`\|`) in thread names be escaped in agent log entries? | **Option A (recommended):** Add AL-R7 requiring escaping of `\|` in all log entry fields. **Option B:** Accept table corruption as an edge case — thread names with `\|` are unusual. | Data integrity of agent-logs Markdown tables. |

---

## 4. Positive Observations

1. **Strong structure.** The three FSPECs are well-decomposed — commit/merge, logging, and deduplication have clean boundaries and clear dependencies.
2. **Business rules are explicit and testable.** The 20 rules (especially AC-R3 serialization, AC-R5 decoupled posting, AC-R8 lock release, and the new AC-R9 synchronization constraint) provide clear behavioral contracts.
3. **v1.1 improvements are substantial.** The backend-engineer review addressed real issues: worktree cleanup ownership transfer (§2.3 row 4), agent-logs path correction, AC-R7 fallback, AC-R9 lock coordination, and the force-push edge case.
4. **Phase 3 modification tracking (§2.3) is excellent.** The table clearly shows what changes and why, including the flow reorder for TOCTOU elimination.
5. **Deduplication design (FSPEC-AC-03) is clean.** The two-tier approach (in-memory set for normal operation, thread history for restart) is simple and effective.

---

## 5. Summary

| ID | Severity | Finding | Recommended Action |
|---|---|---|---|
| F-01 | **High** | 9 behavioral branches lack ATs — all §3.6 error paths untested | Add 4 ATs: commit failure, non-conflict merge failure, lock timeout, lock release on success |
| F-02 | **High** | Missing conflict patterns: delete-modify, new-file collision, auto-merge | Add edge cases to §3.5; resolve Q-01 (auto-merge acceptance); add 1 AT |
| F-03 | **Medium** | Merge lock timeout unspecified; ordering undefined; AC-R9 untested | Specify timeout value; state ordering guarantee; add 1 AT for AC-R9 |
| F-04 | **Medium** | Restart dedup: ID-R5 misleading on non-determinism; partial-crash gap | Reword ID-R5; document double-commit scenario; add 1 AT for error-embed restart |
| F-05 | **Medium** | Pipe chars corrupt log table; 2 edge case ATs missing | Add escaping rule (AL-R7); add 2 ATs for malformed/locked file |
| F-06 | **Medium** | §3.6 missing index.lock; §4.6 missing locked-file error row | Add/cross-reference error entries |

**Total new ATs recommended:** 9 (AT-AC-15 through AT-AC-19, AT-ID-08, AT-AL-09, AT-AL-10, plus 1 for delete-modify conflict)

**Recommendation:** Approved with revisions. Resolve Q-01 through Q-04 and add the recommended ATs before handoff to engineering.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Test Engineer | Initial review of FSPEC-PTAH-PHASE4 v1.1. 6 findings (2 High, 4 Medium). 4 open questions. 9 new ATs recommended. |
