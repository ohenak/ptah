# Engineer Cross-Review: REQ-fix-req-overwrite-on-start (v2.0)

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document Reviewed** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v2.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Needs revision** |

---

## Summary

Version 2.0 is substantially better than v1.0. The decision table, the explicit "file, size > 0" existence definition, the 9-scenario test matrix, and the deprecation of the latency NFR are all improvements. However, two Medium-severity implementation ambiguities remain that will likely cause the TSPEC to drift from the REQ's intent if not resolved beforehand. Both are grounded in concrete code observations against the current codebase.

---

## Findings

### F-01 — `FileSystem.exists()` cannot satisfy the "regular file, size > 0" definition without interface extension (Medium)

**Severity:** Medium

REQ-PD-01 and REQ-PD-02 define file existence as:

> "A REQ is considered to exist when `REQ-<slug>.md` is a regular file (not a directory or symlink to a non-file) with a size greater than zero bytes."

The current `FileSystem` interface ([filesystem.ts](../../../ptah/src/services/filesystem.ts)) exposes:

```typescript
exists(path: string): Promise<boolean>;
```

`NodeFileSystem.exists()` is implemented as `fs.access()` ([filesystem.ts:36-43](../../../ptah/src/services/filesystem.ts#L36-L43)), which:
- Returns `true` for **directories** (so `docs/in-progress/<slug>/REQ-<slug>.md/` — a directory at that path — would be misdetected as a REQ)
- Does **not** check file size (an empty file would be misdetected as a REQ)

Implementing the REQ-PD-01/02 definition correctly requires one of:

- **Option A:** Add a new method to `FileSystem` (e.g., `statFile(path): Promise<{ isFile: boolean; size: number } | null>`) — requires interface + implementation changes, and may affect existing tests via C-04.
- **Option B:** Treat the "regular file, size > 0" language as aspirational/behavioral intent, and accept that `FileSystem.exists()` is sufficient for the practical case (a directory named `REQ-<slug>.md` is pathological and the size-0 edge case is negligible). Document this as an explicit accepted trade-off.
- **Option C:** Leave resolution to the TSPEC author, who will decide based on risk tolerance.

The REQ should explicitly choose one option so the TSPEC author does not independently add a `FileSystem` interface extension (scope) or silently use `exists()` while the REQ appears to demand something stricter.

**Recommended resolution:** State explicitly in REQ-PD-01 and REQ-PD-02 that "the detection mechanism used by the TSPEC author may rely on `FileSystem.exists()` for the practical case; the 'regular file, size > 0' definition states the ideal semantics and the TSPEC may choose the implementation method." This removes ambiguity without mandating scope.

---

### F-02 — C-05 ("reuse FeatureResolver") conflicts with the REQ-PD-03 decision table's resolution logic (Medium)

**Severity:** Medium

C-05 states:

> "The fix must reuse the existing `FeatureResolver` abstraction for slug-to-folder resolution."

`DefaultFeatureResolver.resolve()` ([feature-resolver.ts:49-131](../../../ptah/src/orchestrator/feature-resolver.ts#L49-L131)) returns the **first matching directory** across in-progress → backlog → completed. The return type is:

```typescript
{ found: true; path: string; lifecycle: "backlog" | "in-progress" | "completed" }
```

This is a single-folder result. It does NOT search both folders independently or check for REQ file presence inside the resolved folder.

The REQ-PD-03 general resolution rule requires:

> "The resolved folder is the first folder (in-progress → backlog order) that contains a REQ."

This requires checking **whether `REQ-<slug>.md` exists inside each candidate folder independently** — which `FeatureResolver.resolve()` does not do. For example, Case B (overview in in-progress, REQ in backlog) requires returning `backlog`, but `FeatureResolver.resolve()` would return `in-progress` because the `in-progress/<slug>/` directory exists first.

As a result, the TSPEC author faces a fork:

- **Interpretation A (narrower):** "Reuse `FeatureResolver` for directory-existence checks only." Create a new `PhaseDetector` class that calls `FeatureResolver.resolve()` or directly uses `FileSystem.exists()` on each folder path, then performs independent REQ/overview stat checks inside each candidate folder. This satisfies C-05's spirit (DI pattern, no new filesystem singleton) without requiring `FeatureResolver.resolve()` to change.
- **Interpretation B (broader):** "Extend `FeatureResolver` to also check for REQ presence." Add a new method or subtype. This changes the interface and likely requires test updates (C-04 risk).

Without guidance, the TSPEC author may pick Interpretation B and land a breaking change to `FeatureResolver` that wasn't in scope.

**Recommended resolution:** Add a clarifying note to C-05, e.g.: _"C-05 means the new detection component must accept `FileSystem` (and optionally `FeatureResolver`) via constructor injection and must not instantiate either directly. `FeatureResolver.resolve()` may be used for directory-existence checks, but REQ-file-presence checks must be made independently on each lifecycle folder. `FeatureResolver`'s interface and `DefaultFeatureResolver`'s implementation must not be modified as part of this fix."_

This resolves the ambiguity, keeps `FeatureResolver` closed for modification, and prevents unintended interface churn.

---

### F-03 — REQ-WS-06 testability claim is phase-config-dependent, not code-verifiable (Low)

**Severity:** Low

REQ-WS-06 states:

> "The `featureLifecycleWorkflow` state machine definition must not include any transition from `req-review` or any later phase back to `req-creation`. This invariant is verifiable by static inspection of the workflow definition or a targeted unit test of the state machine."

In practice, `featureLifecycleWorkflow` is **phase-config-agnostic** — it processes whatever phases appear in `WorkflowConfig`. There is no hard-coded `req-creation` or `req-review` in the workflow code. Whether backward transitions are possible is entirely a property of the YAML config file, not the TypeScript code.

`resolveNextPhase()` ([feature-lifecycle.ts](../../../ptah/src/temporal/workflows/feature-lifecycle.ts)) is a pure function that:
- Follows `transition` links (explicit jump)
- Otherwise advances to the next phase by array index

A "no backward transition" invariant could be written as a unit test of `resolveNextPhase()` given a test WorkflowConfig — but it would test the algorithm, not the production config. The production config test would need to load `ptah.workflow.yaml` and verify that no phase in the `req-review`-onward sequence has a `transition` pointing to `req-creation`.

**Recommended clarification:** Split REQ-WS-06 into two distinct acceptance tests: (a) a unit test of `resolveNextPhase()` confirming no backward transitions when given a config with sequential phases; (b) a config-integrity test confirming that the production workflow config has no `transition` back to `req-creation` from any phase at index ≥ the index of `req-review`. This avoids an underspecified "static inspection" claim.

---

### F-04 — `TemporalOrchestratorDeps` wiring gap should be acknowledged (Low)

**Severity:** Low

The fix must inject phase detection into `startNewWorkflow` ([temporal-orchestrator.ts:399-428](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L399-L428)). `TemporalOrchestrator` currently accepts dependencies via `TemporalOrchestratorDeps` ([temporal-orchestrator.ts:68-78](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L68-L78)):

```typescript
export interface TemporalOrchestratorDeps {
  temporalClient: TemporalClientWrapper;
  worker: Worker;
  discordClient: DiscordClient;
  gitClient: GitClient;
  logger: Logger;
  config: PtahConfig;
  workflowConfig: WorkflowConfig;
  agentRegistry: AgentRegistry;
  skillInvoker: SkillInvoker;
}
```

There is no `FileSystem` and no `FeatureResolver`. Adding phase detection requires adding at least one new dependency to `TemporalOrchestratorDeps`. The TSPEC author should know this is expected and not scope creep. Without an explicit acknowledgment in the REQ, the TSPEC author might choose a workaround (static import, module singleton) that violates the project's DI contract.

**Recommended addition:** Add to Section 3.1 or the Scope Boundaries: _"The fix will require adding a new dependency to `TemporalOrchestratorDeps` (either a `FileSystem` instance or a new `PhaseDetector` abstraction that wraps filesystem access). This is expected and not scope creep."_

---

## Clarification Questions

### Q-01 — Does the TSPEC author have latitude to use `FileSystem.exists()` for REQ detection?

See F-01. If the "regular file, size > 0" language is aspirational (intent-description) rather than an interface requirement, the TSPEC author can use `exists()` without further changes. If it is a hard requirement, `FileSystem` needs a new method, which is a scope increase. Which is the PM's intent?

### Q-02 — Is `FeatureResolver.resolve()` allowed to change as part of this fix?

See F-02. If the answer is yes, the TSPEC author can extend `FeatureResolver` with a new method that checks REQ presence. If the answer is no, the TSPEC author must implement REQ-file-presence checks independently in a new component without modifying `FeatureResolver`. This choice significantly affects the TSPEC's architecture section.

---

## Positive Observations

- **A-01 is now code-verified.** `buildInitialWorkflowState` at [feature-lifecycle.ts:271-282](../../../ptah/src/temporal/workflows/feature-lifecycle.ts#L271-L282) validates `startAtPhase` against the config and sets it as `currentPhaseId`. The workflow will correctly start at `req-review` when instructed.
- **Deprecating REQ-NF-01 was the right call.** `NodeFileSystem.exists()` on a warm OS disk cache is effectively instantaneous; a 50 ms assertion would be structurally fragile in CI.
- **REQ-PD-03 decision table is exhaustive and correct.** The 8-case table covers every observable combination of artifacts across the two lifecycle folders. The general resolution rule is a clean algorithmic statement of the table.
- **REQ-WS-03 + REQ-WS-06 split is correct.** Separating the orchestrator-level invariant (testable with fakes) from the workflow-definition invariant (testable via config inspection) is the right architectural distinction.
- **9-scenario test matrix in REQ-NF-02 is directly implementable.** Each scenario maps to a specific test case with concrete preconditions and observable outputs.
- **The `startNewWorkflow` injection point is confirmed correct.** All new-workflow starts go through `startNewWorkflow` ([temporal-orchestrator.ts:399-428](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L399-L428)); the ad-hoc directive path and state-dependent routing are entirely separate.
- **REQ-ER-03's "invoking thread, not parent channel" is already correct by default.** The existing `startNewWorkflow` error handling posts to `message.threadId`, which is the thread ID — matching REQ-ER-03's requirement.

---

## Recommendation

**Needs revision.**

F-01 and F-02 are Medium severity. Without resolution, the TSPEC author will be forced to make implementation choices (FileSystem interface extension, FeatureResolver modification) that may introduce unintended scope — or will pick an interpretation that diverges from the PM's intent. F-03 and F-04 are Low severity and should be fixed for completeness.

**Suggested minimal revision scope:**

1. Add a PM decision to REQ-PD-01/02: is "regular file, size > 0" a hard interface requirement (implying `FileSystem` extension) or a behavioral description that `FileSystem.exists()` may approximate? (resolves F-01)
2. Add a clarifying sentence to C-05 stating that `FeatureResolver`'s interface must not be modified, and that REQ-file-presence checks are made independently via `FileSystem` inside a new detection component. (resolves F-02)
3. Refine REQ-WS-06's acceptance criteria to distinguish the `resolveNextPhase()` unit test from the production-config integrity test. (resolves F-03)
4. Add a note to Scope Boundaries or Assumptions acknowledging that `TemporalOrchestratorDeps` will receive a new dependency. (resolves F-04)

With those four targeted changes, the REQ is ready for TSPEC.
