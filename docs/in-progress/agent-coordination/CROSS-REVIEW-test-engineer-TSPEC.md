# Cross-Review: Test Engineer — TSPEC Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document** | [TSPEC-agent-coordination.md](TSPEC-agent-coordination.md) |
| **Version Reviewed** | 1.0 (post PM cross-review, with F-01 addressed) |
| **Date** | April 6, 2026 |
| **Recommendation** | **Needs revision** |

---

## Positive Observations

- **Complete requirement traceability.** Section 9 maps all 15 requirements to technical components with clear descriptions. Every requirement has a corresponding algorithm or protocol section.
- **Protocol-based DI throughout.** All new code (`AdHocParser`, `TemporalClientWrapper`, `ArtifactCommitter`, `GitClient`) is defined as interfaces first, enabling protocol-based fakes. This aligns perfectly with the existing test infrastructure in `factories.ts`.
- **Pure function for parsing.** `parseAdHocDirective()` is a stateless pure function with no dependencies — ideal for exhaustive unit testing without any test doubles.
- **Test doubles section (8.2) is well-structured.** The proposed `FakeTemporalClient` and `FakeGitClient` extensions follow the existing pattern in `factories.ts` (injectable errors, recorded call lists).
- **Existing test patterns reused.** The TSPEC correctly identifies that `ad-hoc-parser.test.ts` is a new test file while existing files (`artifact-committer.test.ts`, `temporal-orchestrator.test.ts`, `client.test.ts`) are extended. This builds on proven infrastructure.
- **Cascade logic extracted as pure helpers.** `findAgentPhase()`, `executeCascade()`, and `drainAdHocQueue()` are designed as testable units with clear input/output contracts.

---

## Findings

### F-01 — Medium: `ensureBranchExists` error scenarios under-specified

**TSPEC:** Section 5.1, Section 7

The `ensureBranchExists(branch, baseBranch)` method in Section 4.2 describes three sub-steps (check local, check remote, create+push), but the error handling table (Section 7) only has a single entry: "ensureBranchExists fails → Fatal." This collapses multiple distinct failure modes into one entry:

1. `git branch --list` fails (local git error)
2. `git ls-remote` fails (network/auth error)
3. `git branch {branchName} main` fails (baseBranch doesn't exist, or ref ambiguity)
4. `git push origin {branchName}` fails (remote write permission, network error)

Each of these has different implications for recoverability. Scenario 2 and 4 are transient (network) and could be retried; scenario 3 is likely a configuration error. An engineer writing tests for `ensureBranchExists` needs to know which errors are retryable vs. fatal to design the right test cases.

**Recommendation:** Expand the error handling entry for `ensureBranchExists` to distinguish at least transient (network) failures from configuration errors, and specify whether the caller should retry or abort.

---

### F-02 — Medium: No test strategy for `ROUTE_TO_USER` within ad-hoc queue processing

**TSPEC:** Section 6.2, Section 8.3

FSPEC-MR-02 step 3d explicitly describes the `ROUTE_TO_USER` flow during ad-hoc dispatch: "Follow the standard question flow — post the question to Discord, wait for user answer signal, re-invoke the agent with the answer in context." The TSPEC's `drainAdHocQueue()` pseudocode (Section 6.2) does not handle this case — it only shows `dispatchSingleAgent` returning a result and checking for `"cancelled"`.

The test category table (Section 8.3) lists "Ad-hoc queue (pure helpers)" with FIFO ordering and findAgentPhase tests, but does not mention testing the interaction between ad-hoc dispatch and the question flow. This is a non-trivial integration point: the queue must remain blocked while the question flow is active (FSPEC-MR-02 BR-05), and new signals arriving during this wait must be enqueued, not processed.

**Recommendation:** Add pseudocode in Section 6.2 showing how `ROUTE_TO_USER` is handled within `drainAdHocQueue()` (or document that `dispatchSingleAgent` already encapsulates this). Add a test case in Section 8.3 for "ad-hoc dispatch enters ROUTE_TO_USER → queue remains blocked until answer received."

---

### F-03 — Medium: Cascade positional lookup has no guard for edge case

**TSPEC:** Section 6.3

The cascade's creation-phase identification uses `config.phases[reviewIndex - 1]`. FSPEC-MR-03 BR-08 documents the constraint that review phases must follow their creation phases, but the TSPEC pseudocode has no guard for the case where `reviewIndex === 0` (a review phase at the start of the array). The code shows:

```typescript
const reviewIndex = config.phases.findIndex(p => p.id === reviewPhase.id);
const creationPhase = reviewIndex > 0 ? config.phases[reviewIndex - 1] : reviewPhase;
```

The fallback `reviewPhase` (using the review phase itself as the creation phase) would invoke the reviewer agent as if it were the creation agent during revision loops. This is silently wrong behavior. The error handling table (Section 7) doesn't cover this scenario.

**Recommendation:** Document what should happen when `reviewIndex === 0`: either (a) skip the revision loop and treat the review as non-revisable, or (b) log a warning and skip cascade for this phase. Add this as an entry in the error handling table. The engineer needs to know the expected behavior to write the right test.

---

### F-04 — Low: Test file for workflow queue tests doesn't match existing test structure

**TSPEC:** Section 3, Section 8.3

The proposed test files `tests/unit/temporal/workflows/ad-hoc-queue.test.ts` and `tests/unit/temporal/workflows/cascade.test.ts` introduce a new `workflows/` subdirectory under `tests/unit/temporal/`. The existing test structure has workflow tests directly in `tests/unit/temporal/` (e.g., `feature-lifecycle.test.ts`). While this is a minor organizational concern, introducing a new directory convention without noting the rationale may confuse the engineer.

**Recommendation:** Either (a) note explicitly that a `workflows/` subdirectory is being introduced and why, or (b) place these tests alongside `feature-lifecycle.test.ts` as `ad-hoc-queue.test.ts` and `cascade.test.ts` directly in `tests/unit/temporal/`.

---

### F-05 — Low: `adHocInstruction` threading path not fully specified in test strategy

**TSPEC:** Section 4.3, Section 6.2, Section 8.3

The PM's cross-review (F-01) identified that the ad-hoc instruction text needs a pathway to reach the dispatched agent. The TSPEC was updated to add `adHocInstruction?: string` to `SkillActivityInput` (Section 4.3) and the comment in Section 6.2 explains that `ContextAssembler` prepends the instruction to the user message. However, the test category table (Section 8.3) does not include a test case for verifying that `adHocInstruction` is threaded through from the signal to the `SkillActivityInput` and into the assembled context. This is a critical data flow — if the instruction is dropped, the agent runs without its task directive.

**Recommendation:** Add a test case under the "handleMessage flow" or "Ad-hoc queue" category that verifies the `adHocInstruction` field is populated on `SkillActivityInput` when processing an ad-hoc signal, and that `ContextAssembler` receives and includes it.

---

## Clarification Questions

### Q-01: How does `drainAdHocQueue()` interact with `continueAsNew`?

FSPEC-MR-02 edge case "Continue-as-new with non-empty queue" states that queue state must be carried across the boundary. The TSPEC adds `adHocQueue` to `ContinueAsNewPayload` (Section 4.3), but doesn't describe where in `drainAdHocQueue()` the continue-as-new check happens. Does the queue drain loop check for continue-as-new conditions? Or does the main workflow loop handle it after `drainAdHocQueue()` returns? This affects whether we need a test for "continue-as-new triggered mid-queue-drain."

### Q-02: What happens when `dispatchSingleAgent` is called for an ad-hoc revision but the agent's phase has `skip_if` satisfied?

Section 6.2 calls `findAgentPhase(signal.targetAgentId, workflowConfig)` to locate the phase, then dispatches. But if that phase has a `skip_if` condition that is currently satisfied, should the ad-hoc dispatch still proceed (since the user explicitly requested it), or should it be skipped? The cascade handles `skip_if` (Section 6.3), but the initial ad-hoc dispatch does not address this.

---

## Recommendation

**Needs revision.** Three Medium-severity findings (F-01, F-02, F-03) require clarification before the engineer can write correct tests:

- **F-01:** `ensureBranchExists` error taxonomy needs expansion for testability.
- **F-02:** `ROUTE_TO_USER` within ad-hoc queue processing is unspecified in both pseudocode and test strategy.
- **F-03:** Cascade positional lookup edge case (`reviewIndex === 0`) needs defined behavior.

The author must address all Medium findings and route the updated TSPEC back for re-review. Low findings (F-04, F-05) are non-blocking but recommended.
