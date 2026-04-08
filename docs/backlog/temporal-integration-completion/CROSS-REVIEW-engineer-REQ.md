# Cross-Review: Engineer Review of REQ-temporal-integration-completion

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document** | REQ-temporal-integration-completion.md |
| **Date** | 2026-04-07 |

---

## Findings

### F-01: Missing taskType/documentType pass-through in REQ-CD-02 (Medium)

REQ-CD-02 correctly identifies that `contextDocumentRefs` is not passed to `contextAssembler.assemble()`, but the same call site (`skill-activity.ts:195-213`) also fails to pass `taskType` and `documentType`. These fields are destructured from input at lines 107-108 but never forwarded. The assembler uses these to inject PDLC task directives into Layer 1 (see `context-assembler.ts:118-141`) and to select the correct document set (line 170-171 `contextDocuments` path). Without them, agents receive no `ACTION:` directive when invoked from Temporal, which degrades task-specific behavior (e.g., Review agents won't get the "MUST write a CROSS-REVIEW file" instruction).

REQ-CD-02 should be expanded to also require passing `taskType` and `documentType` through to the assembler, or a separate requirement should be added.

### F-02: REQ-CD-01 doesn't specify WHERE resolveContextDocuments() should be called (Medium)

The requirement says `resolveContextDocuments()` should be called "in the dispatch path (`buildInvokeSkillInput` or the dispatch functions that call it)." However, `buildInvokeSkillInput()` does not have access to `state.featurePath` — its `BuildInvokeSkillInputParams` interface only has `featureSlug`, not `featurePath`. The resolution function requires both `featureSlug` and `featurePath` (via `ContextResolutionContext`).

This means the call CANNOT go inside `buildInvokeSkillInput()` without changing its interface. The requirement should specify that:
1. `BuildInvokeSkillInputParams` must be extended to include `featurePath`, OR
2. Resolution must happen at the call sites in `dispatchSingleAgent()`, `dispatchForkJoin()`, and `runReviewCycle()` — all of which have access to `state.featurePath`.

Option 2 is cleaner (avoids changing the pure function's contract), but the REQ should be explicit so the TSPEC can make the right call.

### F-03: REQ-RC-01 cross-review file read timing / worktree lifecycle gap (Medium)

The requirement states that after each reviewer activity completes, a new activity reads the cross-review file. However, the `invokeSkill` activity commits the reviewer's work to the feature branch (via merge) and then cleans up the worktree. The `readCrossReviewRecommendation` activity then needs to read the file from the feature branch.

The requirement doesn't specify WHERE the file is read from:
- The worktree (already destroyed by the time the read activity runs)?
- The main repo working directory (may not have the latest feature branch merged)?
- A fresh `git checkout` of the feature branch?

The `invokeSkill` activity for single-agent (`forkJoin: false`) merges and pushes to the feature branch, so a `git pull` or direct read from the merged branch should work. But for fork/join reviews (`forkJoin: true`), the worktree is NOT merged yet — only committed locally. The read activity would need to read from the unmerged worktree path.

The risk assessment mentions this race condition but the requirement itself should specify the read source. Recommendation: the activity should receive a `worktreePath` parameter when the reviewer's worktree still exists, falling back to reading from the feature branch after merge.

### F-04: REQ-DR-01 lacks specification for FeatureConfig sourcing (Low)

The requirement mentions "Must extract feature config (discipline, skipFspec)" under design considerations but doesn't specify WHERE the config comes from. In the current system, FeatureConfig is a runtime parameter — there's no file or database storing it per feature. The REQ should clarify whether:
- It defaults to `{ discipline: "fullstack", skipFspec: false }` unless overridden
- It's parsed from the thread message content (e.g., "discipline: backend-only")
- It's read from a config file in the feature folder (e.g., `overview.md` frontmatter or a `feature.json`)

This impacts the TSPEC design. Without this, the engineer will have to make a product decision.

### F-05: REQ-DR-02 workflow-state query adds latency to every user message (Low)

The requirement says to query workflow state before routing user answers ("Only route when the workflow is in `waiting-for-user` state"). This means every user message in a thread triggers a Temporal query to check state. For active threads with frequent messages, this could add latency and Temporal server load.

An alternative is to track workflow states locally (via a signal/callback when the workflow enters `waiting-for-user`) to avoid querying on every message. This is a performance consideration, not a correctness issue, but worth flagging for the TSPEC.

---

## Clarification Questions

### Q-01: REQ-RC-02 — Should the activity read from worktree or merged branch?

The `readCrossReviewRecommendation` activity input includes `featurePath` but not `worktreePath`. After `invokeSkill` completes for a reviewer:
- **Single agent (non-fork/join):** worktree is merged and destroyed → file is on feature branch
- **Fork/join reviewer:** worktree is committed but NOT merged → file is only in worktree

Should the activity receive an optional `worktreePath` to handle both cases? Or should the workflow always merge before reading?

### Q-02: REQ-CD-01 — Are paths repo-relative or worktree-relative?

`resolveContextDocuments()` produces paths like `docs/in-progress/auth/REQ-auth.md`. These are repo-root-relative. The `readContextDocumentRefs()` method in the assembler reads them directly via `this.fs.readFile(ref)`. When running in a worktree, the CWD is the worktree root, so the paths should resolve correctly. But when `worktreePath` is explicitly provided to `assemble()`, the assembler computes `docsRoot` differently (line 82-84). Should the resolved refs be used AS-IS (repo-relative), or should they be rebased to the worktree path?

---

## Positive Observations

1. **Excellent problem diagnosis.** The REQ accurately pinpoints each integration gap with specific line numbers, current behavior, and required behavior. This level of precision will accelerate TSPEC and implementation.

2. **Clean phasing.** Phase 1 (workflow fixes) and Phase 2 (Discord routing) are correctly separated. Phase 1 can be tested programmatically without Discord, which enables faster TDD cycles.

3. **Dependency graph is correct.** The graph accurately reflects the implementation order. REQ-SC-01 and REQ-FJ-01 are truly independent. REQ-CD-01 → REQ-CD-02 and REQ-RC-02 → REQ-RC-01 chains are accurate.

4. **Scope boundaries are well-defined.** The "Out of Scope" section correctly excludes architectural changes, parser logic changes, and assembler changes — the fix is purely wiring.

5. **Risk assessment identifies the right risks.** The cross-review file timing, routing conflict, and null featurePath risks are the actual engineering challenges.

6. **Reuse-first approach.** Every requirement explicitly calls out existing functions to reuse (`resolveContextDocuments`, `parseRecommendation`, `crossReviewPath`, `agentIdToSkillName`, assembler's `contextDocumentRefs` support). This minimizes new code and risk.

---

## Recommendation

**Needs revision**

Three Medium-severity findings (F-01, F-02, F-03) require clarification before the TSPEC can be written without making product decisions:

1. **F-01:** REQ-CD-02 must also require passing `taskType` and `documentType` to the assembler (same call site, same root cause).
2. **F-02:** REQ-CD-01 must specify where `resolveContextDocuments()` is called, given that `buildInvokeSkillInput` lacks `featurePath`.
3. **F-03:** REQ-RC-01/RC-02 must specify whether the cross-review file is read from the worktree or the merged branch, especially for fork/join review dispatches.

The author should address all Medium findings and route the updated REQ back for re-review.
