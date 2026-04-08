# Cross-Review: Test Engineer Review of TSPEC-temporal-integration-completion

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document** | TSPEC-temporal-integration-completion.md |
| **Date** | 2026-04-08 |

---

## Findings

### F-01: handleMessage conflates Temporal query failure with "no workflow exists" (Medium)

**Location:** §5.9, `handleMessage()` restructure (lines 460-469)

The TSPEC code catches ALL errors from `queryWorkflowState` and treats them as "no running workflow":

```typescript
try {
  workflowState = await this.temporalClient.queryWorkflowState(workflowId);
  workflowRunning = true;
} catch (err) {
  // WorkflowNotFoundError or query failure → no running workflow
  workflowRunning = false;
}
```

This conflates two distinct cases that FSPEC-DR-01 explicitly separates:

| Case | FSPEC-DR-01 Behavior | TSPEC Behavior |
|------|----------------------|----------------|
| `WorkflowNotFoundError` (no workflow) | Branch B: check for agent mention, may start workflow | ✓ Correct |
| Query failure (Temporal unreachable, timeout) | **Fail-silent: message falls through, no routing** | **Branch B: may start workflow** |

The FSPEC error scenario (line 301) states: "Temporal workflow-existence query fails → Fail-silent: the message falls through without routing." But the TSPEC code falls through to Branch B, which will attempt to start a new workflow if the message contains an agent mention.

**Impact on tests:** Without this distinction, the test suite cannot verify the FSPEC's fail-silent error scenario. During a Temporal outage, messages with agent mentions would trigger `startWorkflowForFeature()` calls, potentially causing `WorkflowExecutionAlreadyStartedError` spam or unexpected workflow starts.

**Recommendation:** Distinguish error types in the catch block:

```typescript
try {
  workflowState = await this.temporalClient.queryWorkflowState(workflowId);
  workflowRunning = true;
} catch (err) {
  if (err instanceof Error && err.name === "WorkflowNotFoundError") {
    workflowRunning = false; // No workflow → Branch B
  } else {
    // Temporal query failure → fail-silent (FSPEC-DR-01 error scenario)
    this.logger.warn(`Temporal query failed for ${workflowId}: ${err}`);
    return;
  }
}
```

This enables a clean test case: "when queryWorkflowState throws a non-WorkflowNotFoundError, handleMessage returns without starting a workflow or posting any message."

### F-02: FakeTemporalClient extension conflicts with existing implementation (Medium)

**Location:** §7.1, Test Doubles

The TSPEC proposes adding `queryWorkflowStateResult` and `queryWorkflowStateError` properties to `FakeTemporalClient`:

```typescript
class FakeTemporalClient implements TemporalClientWrapper {
  queryWorkflowStateResult: FeatureWorkflowState | null = null;
  queryWorkflowStateError: Error | null = null;
  async queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState> {
    if (this.queryWorkflowStateError) throw this.queryWorkflowStateError;
    if (!this.queryWorkflowStateResult) {
      const err = new Error(`Workflow ${workflowId} not found`);
      err.name = "WorkflowNotFoundError";
      throw err;
    }
    return this.queryWorkflowStateResult;
  }
}
```

However, the existing `FakeTemporalClient` in `factories.ts` (lines 1366-1435) already implements `queryWorkflowState()` using a **per-workflow-ID** `workflowStates: Map<string, FeatureWorkflowState>` pattern. The proposed single-value `queryWorkflowStateResult` approach:

1. **Conflicts with the existing implementation** — the `queryWorkflowState()` method already exists with different behavior. Replacing it with the single-value pattern would break existing tests that use the Map.
2. **Is less flexible** — the Map pattern supports testing scenarios with multiple concurrent workflows (different workflow IDs returning different states). The single-value pattern cannot.
3. **Loses the error injection granularity** — the Map pattern throws `WorkflowNotFoundError` only for unknown IDs, while the proposed pattern throws for all IDs when `queryWorkflowStateResult` is null.

**Recommendation:** Extend the existing Map-based pattern instead:

```typescript
// Add to existing FakeTemporalClient (which already has workflowStates Map):
queryWorkflowStateError: Error | null = null; // Global error injection for outage simulation

async queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState> {
  if (this.queryWorkflowStateError) throw this.queryWorkflowStateError;
  // Existing behavior: look up from workflowStates Map
  const state = this.workflowStates.get(workflowId);
  if (!state) {
    const err = new Error(`Workflow ${workflowId} not found`);
    err.name = "WorkflowNotFoundError";
    throw err;
  }
  return state;
}
```

This preserves backward compatibility, supports multi-workflow tests, and adds the `queryWorkflowStateError` property for simulating Temporal outages (which is needed to test the fail-silent path from F-01).

### F-03: parseUserIntent position-based matching not covered in test plan (Low)

**Location:** §7.2, Test Categories; §5.10, `parseUserIntent`

§5.10 has a design note: "BR-DR-12 says 'first match in the message' — this means earliest position, not first pattern tried." The implementation correctly uses `match.index` comparison. However, §7.2 only describes the test scope as "all keywords, edge cases, no-match" without explicitly listing position-based tests.

The FSPEC example "retry and then cancel if it fails again" → action = "retry" (BR-DR-12) is a critical boundary test for the position-based matching algorithm. A naïve implementation that scans patterns in order (retry first, then cancel) would pass all simple tests but fail if the scan order changed.

**Recommendation:** Add an explicit test case for position precedence: `"cancel first, then retry"` → action = `"cancel"` (first by position). This verifies that `match.index` comparison is working, not just pattern scan order.

### F-04: Ack failure (BR-DR-14) missing from error handling table (Low)

**Location:** §6, Error Handling

BR-DR-14 specifies: "If the ack message fails to post (Discord API error), the signal has already been sent. Log a warning but do not fail." The code in §5.11 correctly handles this with a nested try/catch, but §6's error handling table does not list this scenario. For test derivation, the error handling table is the primary source — an omission here means the implementer may not write a test for it.

**Recommendation:** Add a row to §6:

| Scenario | Component | Behavior | Error Type |
|----------|-----------|----------|------------|
| Ack message fails to post after successful signal | `handleIntentRouting` | Log warning, do not fail — signal already delivered | — (caught, logged) |

---

## Positive Observations

1. **Algorithm specifications are implementation-ready.** Every algorithm (§5.1–§5.14) provides current code, updated code, and rationale. The `readCrossReviewRecommendation` activity (§5.3) is specified with complete code including error handling branches — directly translatable to test cases without guesswork.

2. **`parseUserIntent` earliest-position design is well-reasoned.** The §5.10 design note explicitly addresses the ambiguity in BR-DR-12 ("first match" = earliest position, not first pattern tried). This is precisely the kind of detail that prevents subtle test-implementation misalignment.

3. **Activity retry configuration is thoughtful.** §5.4 specifies a 30-second timeout with 2 maximum attempts for `readCrossReviewRecommendation` — appropriate for a fast file read. This is distinct from the longer `invokeSkill` timeout, preventing slow file reads from blocking the workflow.

4. **Error handling table (§6) is comprehensive.** 10 scenarios are covered with clear component attribution and behavior descriptions. The table covers both activity-level errors (parse_error return values) and orchestrator-level errors (Discord posts, fail-silent). This directly maps to a test error-scenario matrix.

5. **Requirement → Technical Component mapping (§8) is complete.** All 11 requirements are mapped to specific components, enabling traceability from test properties to implementation modules.

6. **Integration points (§9) anticipate cross-module concerns.** §9.4 (pure function imports in workflow sandbox) correctly identifies a Temporal-specific constraint and provides the safety rationale. §9.5 confirms the context assembler already accepts the new parameters — no interface changes needed.

7. **Fork/join fix (§5.8) is clean and minimal.** The fix removes the redundant `invokeSkill` call and uses `questionResult` directly. The before/after comparison makes the behavioral change immediately clear for test assertion design.

8. **Test strategy (§7) reuses existing infrastructure.** FakeFileSystem, FakeDiscordClient, and the activity mock override pattern from `factories.ts` are extended rather than replaced. This minimizes test infrastructure churn.

9. **Activity test pattern (§7.3) follows existing conventions.** The `vi.mock("@temporalio/activity")` pattern matches `notification-activity.test.ts`, ensuring consistency across the test suite.

10. **`deriveDocumentType` (§5.2) as a pure function is optimal for testing.** No dependencies, deterministic output, safe for both workflow and test code. The inline examples serve as a test specification.

---

## Recommendation

**Needs revision**

Two Medium-severity findings require changes before the TSPEC is implementation-ready:

1. **F-01 (Medium):** `handleMessage` must distinguish `WorkflowNotFoundError` from other query failures. The current code conflates them, violating FSPEC-DR-01's fail-silent error scenario and making that path untestable.

2. **F-02 (Medium):** `FakeTemporalClient` extension must build on the existing `workflowStates` Map pattern, not replace it with a single-value approach. The existing pattern is more flexible and is used by other tests.

The author should address both Medium findings and route the updated TSPEC back for re-review. The two Low findings (F-03, F-04) are non-blocking suggestions for improved test coverage.
