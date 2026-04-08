# Cross-Review: Test Engineer Review of REQ-temporal-integration-completion

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document** | REQ-temporal-integration-completion.md |
| **Date** | 2026-04-07 |

---

## Findings

### F-01: REQ-RC-01 acceptance criteria missing negative/error paths (Medium)

The acceptance criteria for REQ-RC-01 only cover the happy path (reviewer writes file → parsed correctly). The requirement's own constraints say "parse errors must still trigger the failure flow," but there are no acceptance criteria for:

- Cross-review file exists but contains no valid recommendation heading (malformed content)
- Cross-review file contains an unrecognized recommendation value (neither "Approved" nor "Needs revision")
- `agentIdToSkillName()` receives an unknown agent ID

Without these, an engineer may not write tests for error paths, and properties derived from this requirement will lack traceability. Each error scenario should have its own Given/When/Then criterion.

### F-02: REQ-DR-01 acceptance criteria lack idempotency test case (Medium)

The requirement states "Must be idempotent: if a workflow is already running for the feature, do not start a duplicate." The second acceptance criterion covers the case where a workflow exists and a message is treated as ad-hoc, but it doesn't cover:

- What happens if the workflow start is attempted concurrently (two messages arrive in rapid succession before the first workflow is registered)?
- What observable confirmation does the user get when a duplicate is prevented — silence, an error message, or a "workflow already running" notice?

The idempotency constraint needs its own explicit acceptance criterion with expected observable behavior, otherwise it's untestable.

### F-03: REQ-DR-02 missing negative acceptance criteria for non-waiting states (Medium)

The acceptance criteria only cover the happy path (workflow is waiting → answer is routed). Missing:

- User posts a message while the workflow is NOT in `waiting-for-user` state — what happens? Is the message silently ignored, logged as a warning, or does the user get feedback?
- Bot posts a message in the thread — the requirement says "do not route bot messages" but there's no Given/When/Then for this.

These negative paths are essential for property derivation. Without them, the test engineer cannot determine whether "message ignored" is the correct behavior or if user feedback is expected.

### F-04: REQ-DR-03 missing acceptance criteria for unrecognized intent (Medium)

The requirement says user messages containing "retry" or "cancel" intent are routed, but:

- What happens when the message doesn't match any recognized intent (e.g., user posts "what happened?" in a failed thread)?
- Is intent matching case-sensitive? Does "Retry" or "RETRY" work?
- What about partial matches — "can you retry that?" vs just "retry"?

An acceptance criterion for the unrecognized-intent path is necessary for complete test coverage.

### F-05: REQ-FJ-01 acceptance criteria don't specify observable difference (Low)

The acceptance criterion says the agent is "invoked exactly once." While the fix is to remove redundant code, the test needs a measurable assertion:

- Is "invoked exactly once" measured by counting `invokeSkill` activity executions?
- Should the test verify that the result from `handleQuestionFlow()` is used (not discarded)?
- Should there be a property verifying no duplicate side effects (e.g., duplicate commits, duplicate Discord messages)?

This is Low because the implementation is clear (remove code), but the testability improves if the criterion specifies HOW to observe the single-invocation invariant.

### F-06: REQ-NF-01 acceptance criteria are too vague for test planning (Low)

The acceptance criterion says "tests verify that review cycles parse cross-review files, context documents are resolved and passed, and Discord messages trigger the correct Temporal signals." This is a checklist, not a testable criterion. Each integration path should be its own acceptance criterion with specific Given/When/Then so they can be individually traced to test scripts.

However, since REQ-NF-01 is P1 Phase 2 and the properties document will break this down anyway, this is Low severity.

---

## Clarification Questions

### Q-01: REQ-RC-02 — What is the retry policy for the new activity?

The activity reads a file from disk. If the file doesn't exist, it returns `parse_error`. But the risk assessment mentions a race condition with git push timing. Should the activity:
- Return `parse_error` immediately (fail-fast), or
- Retry internally with a short delay before returning `parse_error`?

This affects whether we need to test retry behavior and timing properties.

### Q-02: REQ-DR-01 — How is feature slug extracted from thread name?

The requirement says "parse the thread name to extract the feature slug" but doesn't specify the parsing convention. Is there a known format (e.g., `[feature-slug] description`)? Without this, test cases for slug extraction cannot be defined — we don't know what valid vs. invalid thread names look like.

### Q-03: REQ-SC-01 — Should the prefix stripping be generic or hardcoded?

The fix is `condition.field.slice(7)` to strip `"config."`. Should the test cover:
- Only the `config.` prefix (hardcoded)?
- Nested prefixes (e.g., `config.nested.field`) — is this possible in the YAML schema?
- Fields without the prefix (backward compatibility)?

This determines boundary conditions for the unit tests.

---

## Positive Observations

1. **Exceptional traceability.** Every requirement links to a user story, has explicit priority, phase, and dependencies. This makes property derivation straightforward — every REQ can be directly mapped to PROP entries.

2. **Specific line-number references.** The current-behavior descriptions point to exact source locations (`feature-lifecycle.ts:1206`, `skill-activity.ts:103`). This is ideal for test targeting — we know exactly which functions to unit test.

3. **Reuse-first constraints.** Requirements explicitly name existing functions (`parseRecommendation`, `resolveContextDocuments`, `crossReviewPath`) which already have known contracts. This means properties can be derived from their existing behavior without ambiguity.

4. **Clean domain separation.** The RC/CD/DR/SC/FJ domains map naturally to property categories. Each domain's requirements are self-contained, enabling independent property groups with clear test boundaries.

5. **Phase 1 is testable without external dependencies.** All Phase 1 requirements involve pure functions or Temporal activities that can be tested with protocol-based fakes. No Discord mocking needed until Phase 2.

6. **Dependency graph enables parallel test development.** Independent requirements (REQ-SC-01, REQ-FJ-01, REQ-CD-01, REQ-RC-02) can have their properties and tests developed in parallel.

---

## Recommendation

**Needs revision**

Four Medium-severity findings (F-01 through F-04) identify missing negative/error acceptance criteria across the RC and DR domains. Without these:

1. **F-01:** Error-path properties for cross-review parsing cannot be traced to requirements (malformed content, unknown agent ID).
2. **F-02:** Idempotency property for workflow start has no testable criterion — no defined observable behavior for duplicate prevention.
3. **F-03:** Negative paths for user-answer routing (non-waiting state, bot messages) have no defined expected behavior.
4. **F-04:** Unrecognized-intent handling in retry/cancel routing is unspecified.

The author should add explicit Given/When/Then acceptance criteria for all error and negative paths identified above, then route the updated REQ back for re-review.
