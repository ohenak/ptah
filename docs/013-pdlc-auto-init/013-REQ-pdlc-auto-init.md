# Requirements Document

## PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-013 |
| **Parent Document** | [011-REQ-orchestrator-pdlc-state-machine](../011-orchestrator-pdlc-state-machine/011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Version** | 1.2 |
| **Date** | March 15, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

Feature 011 (orchestrator PDLC state machine) implemented the full state machine infrastructure — phase enumeration, state transitions, review tracking, fork/join, persistence, and the managed/unmanaged branch in `executeRoutingLoop()`. It also implemented the `initializeFeature()` method on `PdlcDispatcher` that creates a new feature state record.

However, **`initializeFeature()` is never called in production code**. The orchestrator's routing loop checks `isManaged(featureSlug)` and, when no state record exists, falls through to the unmanaged/legacy path. This means:

1. Every new feature is treated as unmanaged — LGTM is treated as terminal, no reviews are dispatched, and the PDLC state machine is never engaged.
2. The only way to register a feature is through test code — no production path exists.

This feature closes the gap by wiring auto-initialization into the orchestrator so that new features are automatically registered in the PDLC state machine on first encounter. This fulfills the second half of [REQ-SM-02] from Feature 011, which specified that *"Feature initialization is triggered when the orchestrator first dispatches the PM agent for a new feature (detected via the thread-to-feature-slug mapping when no state record exists for that slug)."*

---

## 2. User Scenarios

### US-20: New Feature Auto-Registers in PDLC

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer creates a new Discord thread for a feature (e.g., "013-pdlc-auto-init") and mentions @pm to start requirements creation. The orchestrator resolves the feature slug, finds no existing state record, automatically initializes the feature in the PDLC state machine with default configuration, and processes the agent's completion signal through the managed path — dispatching reviews to the correct agents. |
| **Goals** | New features are automatically managed by the PDLC state machine without any manual registration step. |
| **Pain points** | Currently, `isManaged()` returns false for every new feature, so the orchestrator falls through to the unmanaged path. LGTM is treated as terminal. No reviews are dispatched. The PDLC state machine is never engaged. |
| **Key needs** | Auto-initialization when `isManaged()` returns false; default configuration applied; seamless transition into managed PDLC path. |

### US-21: Existing Unmanaged Features Are Not Disrupted

| Attribute | Detail |
|-----------|--------|
| **Description** | Features that were started before Feature 011 and have been progressing through the unmanaged/legacy routing path must continue to work. The auto-initialization must not retroactively register old features that are mid-conversation in the legacy path. |
| **Goals** | Backward compatibility — existing unmanaged feature threads continue using the legacy routing engine. |
| **Pain points** | If auto-initialization is too aggressive, it could register features mid-conversation at an incorrect phase (e.g., a feature already past TSPEC would be initialized at REQ_CREATION). |
| **Key needs** | A mechanism to distinguish genuinely new features from existing unmanaged ones. |

### US-22: Developer Specifies Feature Discipline

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer creating a new feature wants to specify the discipline (backend-only, frontend-only, or fullstack) so that the correct set of engineers and reviewers are involved. If no discipline is specified, the system defaults to `backend-only` per [REQ-FC-03]. |
| **Goals** | Feature discipline is set at initialization time, influencing all subsequent PDLC phase transitions. |
| **Pain points** | Currently there is no mechanism for the developer to pass discipline configuration when starting a feature thread. |
| **Key needs** | A way to specify discipline (or accept the default) at feature creation time. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | Feature 011 (PDLC state machine) is deployed and functional. All state machine infrastructure (`PdlcDispatcher`, `StateMachine`, `StateStore`, `ReviewTracker`) is production-ready. | If 011 is not deployed, auto-initialization will register features but subsequent phase transitions will fail. |
| A-02 | Feature 012 (skill simplification) is deployed and all agents emit `<routing>` tags that the orchestrator can parse. | If agents still emit `<task_done>` tags, routing signal parsing will fail before auto-initialization is even reached. (This was fixed in the preceding hotfix.) |
| A-03 | The `initializeFeature()` method on `PdlcDispatcher` is correct and production-ready. It was tested extensively in Feature 011's unit and integration tests. | If `initializeFeature()` has bugs, auto-init will create corrupted state records. Low risk given test coverage. |
| A-04 | All new features start at `REQ_CREATION` phase. There is no use case for initializing a feature at an arbitrary phase. | If a use case for mid-lifecycle initialization emerges (e.g., importing features from another system), a separate feature would be needed. |
| A-05 | The default discipline (`backend-only`) is acceptable for the vast majority of features. Discipline override is a P1 enhancement. | If most features are fullstack, the default would be wrong and developers would need to override frequently. |
| A-06 | An **unresolvable feature slug** is any value that is falsy (empty string, `null`, or `undefined`) after calling `featureNameToSlug(extractFeatureName(threadName))`. If the slug evaluation throws an exception, it is treated as unresolvable. The age guard must not be evaluated if the slug itself is unresolvable. | If slug resolution unexpectedly returns a non-empty but semantically invalid string (e.g., all-hyphen), the feature would be initialized with a malformed slug; this is considered an edge case outside the scope of this feature. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | Changes are limited to `orchestrator.ts` (routing loop) and a targeted, minimal modification to `initializeFeature()` in `pdlc-dispatcher.ts` (check-before-write idempotency guard, required by [REQ-PI-05]). No changes to any other Feature 011 modules (`state-machine.ts`, `state-store.ts`, `review-tracker.ts`). | The idempotency contract cannot be satisfied in `orchestrator.ts` alone without introducing async coordination complexity; placing a single check-before-write guard in `initializeFeature()` is the architecturally coherent fix (see BE cross-review F-02, Option A). |
| C-02 | Auto-initialization must not break existing unmanaged features. The backward compatibility path (`RoutingEngine.decide()`) must remain functional. | [REQ-SM-NF-03] from Feature 011. |
| C-03 | The feature must work with the current `FeatureConfig` interface: `{ discipline: Discipline; skipFspec: boolean }`. No schema changes to the state file. | Avoids triggering a state migration (Feature 011 schema versioning). |

---

## 4. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| PI | PDLC Initialization — registering new features in the PDLC state |
| DC | Discipline Configuration — setting feature discipline at init time |
| BC | Backward Compatibility — protecting existing unmanaged features |

### 4.1 PDLC Initialization (PI)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-PI-01 | Auto-initialize on first signal | When the orchestrator processes any routing signal (LGTM, ROUTE_TO_USER, TASK_COMPLETE, or ROUTE_TO_AGENT) for a feature slug that has no state record (`isManaged()` returns false), the orchestrator must call `initializeFeature()` to create a new state record before processing the signal. The feature is initialized at `REQ_CREATION` phase. If the feature slug cannot be resolved from thread context, auto-initialization must NOT be attempted and existing error handling applies without mutating state. An unresolvable slug is defined per [A-06]. | WHO: As the orchestrator GIVEN: an agent returns any routing signal for a feature slug with no state record WHEN: the orchestrator processes the routing signal THEN: a new state record is created for the feature with phase `REQ_CREATION`, and the signal is processed through the managed PDLC path (not the unmanaged legacy path). AND GIVEN: the feature slug is unresolvable (falsy value or thrown exception per [A-06]) WHEN: the orchestrator processes the signal THEN: auto-initialization is NOT attempted; the age guard is NOT evaluated; existing error handling (error path, no state mutation) applies | P0 | 1 | [US-20], [REQ-SM-02] | — |
| REQ-PI-02 | Default feature configuration | When auto-initializing a feature with no explicit discipline configuration, the orchestrator must use the default configuration: `{ discipline: "backend-only", skipFspec: false }`. | WHO: As the orchestrator GIVEN: a new feature is auto-initialized WHEN: no discipline configuration is provided THEN: the feature config is `{ discipline: "backend-only", skipFspec: false }` | P0 | 1 | [US-20], [US-22], [REQ-FC-03] | [REQ-PI-01] |
| REQ-PI-03 | Log auto-initialization | When a feature is auto-initialized, the orchestrator must emit an info-level log message: `[ptah] Auto-initialized PDLC state for feature "{featureSlug}" with discipline "{discipline}"`. The log is emitted before the debug channel notification ([REQ-PI-04]). If the logging infrastructure is unavailable or throws, the error is swallowed — the feature remains initialized and routing proceeds. | WHO: As a developer monitoring logs GIVEN: a new feature is auto-initialized WHEN: the state record is created THEN: an info-level log message is emitted with the feature slug and discipline before any debug channel notification is sent. AND GIVEN: the logger throws WHEN: the orchestrator attempts to emit the log THEN: the error is swallowed; the feature remains initialized and routing continues uninterrupted | P0 | 1 | [US-20] | [REQ-PI-01] |
| REQ-PI-04 | Post debug channel notification | When a feature is auto-initialized, the orchestrator must post a notification to the debug channel after the info log ([REQ-PI-03]): `[ptah] PDLC auto-init: feature "{featureSlug}" registered with discipline "{discipline}", starting at REQ_CREATION`. This notification is non-fatal — if the post fails, the orchestrator logs a warning and continues. | WHO: As a developer monitoring the debug channel GIVEN: a new feature is auto-initialized WHEN: the state record is created THEN: a debug channel message is posted with the feature slug, discipline, and starting phase, after the info-level log has been emitted. AND GIVEN: the debug channel post fails WHEN: the orchestrator attempts the notification THEN: a warning is logged, but the feature remains initialized and routing proceeds | P1 | 1 | [US-20] | [REQ-PI-01], [REQ-PI-03] |
| REQ-PI-05 | Idempotent initialization | If `initializeFeature()` is called for a feature slug that already has a state record (race condition), it must not overwrite the existing record. Instead, it must detect the existing record, return it without modification, and resolve normally (no throw). The orchestrator treats this return as a no-op and proceeds on the managed PDLC path using the existing state record. | WHO: As the orchestrator GIVEN: two concurrent messages arrive for the same new feature WHEN: both trigger auto-initialization THEN: only one state record is created; the second call detects the existing record and skips initialization. AND: the second call to `initializeFeature()` resolves without throwing; the orchestrator treats it as a no-op and proceeds to the managed PDLC path with the existing state record intact | P0 | 1 | [US-20] | [REQ-PI-01] |

### 4.2 Backward Compatibility (BC)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-BC-01 | Feature age guard | To prevent retroactively registering old unmanaged features that are mid-conversation, the orchestrator must only auto-initialize features from threads that have had 1 or fewer prior agent turns (the current invocation being the first or second). Features with 2 or more prior agent turns are assumed to be existing unmanaged features and must continue through the legacy path. **Definition:** A "prior agent turn" is any message in the thread history, posted before the current routing signal, where `isBot === true` AND the message content contains a `<routing>` tag. Orchestrator progress notifications (which have `isBot === true` but contain no `<routing>` tag) are excluded from the count. | WHO: As the orchestrator GIVEN: a feature slug has no state record and the thread has 3 prior agent turns WHEN: the orchestrator processes a routing signal THEN: the feature is NOT auto-initialized; it continues through the unmanaged/legacy routing path. AND GIVEN: the thread has exactly 2 prior agent turns WHEN: the orchestrator processes the routing signal THEN: the feature is NOT auto-initialized; it continues through the unmanaged/legacy path (threshold is exclusive: eligible only when prior turn count ≤ 1) | P0 | 1 | [US-21] | [REQ-PI-01] |
| REQ-BC-02 | Log skipped initialization | When a feature is not auto-initialized because it failed the age guard, the orchestrator must log a debug-level message with the exact format: `[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has {turnCount} prior turns (threshold: 1)`. The log level must be `debug` (not `info` or `warn`) and must be assertable via a test logger spy. | WHO: As a developer investigating routing behavior GIVEN: a feature fails the age guard WHEN: auto-initialization is skipped THEN: a debug-level (not info or warn) log message is emitted matching the exact format `[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has {turnCount} prior turns (threshold: 1)`; the log level must be assertable via the test logger spy | P1 | 1 | [US-21] | [REQ-BC-01] |

### 4.3 Discipline Configuration (DC)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source | Dependencies |
|----|-------|-------------|---------------------|----------|-------|--------|--------------|
| REQ-DC-01 | Discipline keyword in thread message | The orchestrator must detect a discipline keyword in the initial message that triggers auto-initialization. Supported keywords: `[backend-only]`, `[frontend-only]`, `[fullstack]`. The keyword must appear in square brackets in exact lowercase form; case variants (e.g., `[FULLSTACK]`, `[Fullstack]`) are not recognized and must be treated as unknown keywords (default discipline applies). If a valid keyword is found, it overrides the default discipline. | WHO: As a developer GIVEN: starting a new feature with message "@pm create REQ [fullstack]" WHEN: the orchestrator auto-initializes the feature THEN: the feature config has `discipline: "fullstack"` instead of the default `"backend-only"`. AND GIVEN: the message contains "[FULLSTACK]" (incorrect case) WHEN: the orchestrator auto-initializes THEN: the unrecognized keyword is ignored and default discipline ("backend-only") is applied | P1 | 1 | [US-22], [REQ-FC-02] | [REQ-PI-01] |
| REQ-DC-02 | Skip-FSPEC keyword in thread message | The orchestrator must detect a `[skip-fspec]` keyword in the initial message. If found, the feature config sets `skipFspec: true`, causing the PDLC to skip FSPEC phases. | WHO: As a developer GIVEN: starting a feature with message "@pm create REQ [skip-fspec]" WHEN: the orchestrator auto-initializes the feature THEN: the feature config has `skipFspec: true` | P1 | 1 | [US-22], [REQ-SM-04] | [REQ-PI-01] |
| REQ-DC-03 | Unknown keyword ignored | If the message contains square-bracketed text that is not a recognized keyword, the orchestrator must ignore it (no error). Only recognized keywords affect configuration. | WHO: As a developer GIVEN: starting a feature with message "@pm create REQ [some-random-tag]" WHEN: the orchestrator auto-initializes the feature THEN: the unknown keyword is ignored; default configuration is used | P1 | 1 | [US-22] | [REQ-DC-01] |

---

## 5. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Initialization latency | Auto-initialization must add no more than 100ms to the routing loop. The `initializeFeature()` call involves one state file write (atomic), which is already benchmarked in Feature 011 tests. Latency is measured as wall-clock time from the auto-init eligibility check entry to the return of `initializeFeature()`, in the CI test environment, as a p95 value across 100 runs. | Latency is measured as wall-clock time from the auto-init eligibility check entry to the return of `initializeFeature()`, in the CI test environment, as a p95 value across 100 runs. The p95 latency must be under 100ms. | P1 | 1 |
| REQ-NF-02 | No state schema change | This feature must not change the state file schema version. It uses the existing `FeatureConfig` and `FeatureState` types from Feature 011 without modification. | No migration is needed; existing state files load without changes. | P0 | 1 |
| REQ-NF-03 | Test coverage | All new code paths (auto-init, age guard, keyword parsing, idempotency) must have unit tests. The existing Feature 011 test suite must continue to pass without modification. | All new requirements have corresponding test cases. Feature 011's 1068 tests continue to pass. | P0 | 1 |

---

## 6. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-01 | Age guard threshold is wrong — features with exactly 1 prior turn might be old unmanaged features that had only one interaction. | Low | Medium | The threshold of 1 is conservative. Most unmanaged features that have progressed beyond REQ creation will have multiple turns. Monitor debug logs after deployment and adjust if needed. |
| R-02 | Race condition — two messages for the same new feature arrive simultaneously, both triggering auto-init. | Low | Low | REQ-PI-05 requires idempotent initialization. The `initializeFeature()` method should check-before-write or use the existing state record if one was just created. |
| R-03 | Keyword parsing is fragile — developers use unexpected formatting like `[ fullstack ]` or `[FULLSTACK]`. | Medium | Low | REQ-DC-01 specifies exact format. Start strict, loosen later if usage patterns show issues. Document the format in the developer guide. |

---

## 7. Scope Boundaries

### In Scope

- Auto-initialization of new features in `executeRoutingLoop()` when `isManaged()` returns false
- Default feature configuration (`backend-only`, `skipFspec: false`)
- Age guard to prevent retroactive registration of old unmanaged features
- Discipline and skip-FSPEC keyword detection from the initial message
- Logging and debug channel notifications for auto-initialization events
- Idempotent initialization (race condition protection)

### Out of Scope

- Changes to the PDLC state machine, state store, or review tracker (Feature 011 modules)
- State file schema changes or migrations
- GUI or CLI for feature management (manual registration, configuration changes)
- Changing a feature's discipline after initialization
- Auto-initialization from non-Discord triggers (API, CLI)

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Backend Engineer | — | — | Pending |
| Test Engineer | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 15, 2026 | Product Manager | Initial requirements — 10 functional requirements + 3 NFRs across 3 domains (PI, BC, DC), implementing the missing auto-initialization from REQ-SM-02 |
| 1.1 | March 15, 2026 | Product Manager | Addressed TE cross-review (F-01–F-07, Q-01–Q-03) and BE cross-review (F-02 idempotency / Option A): added observable idempotency outcome to REQ-PI-05; added boundary assertion (turnCount=2) and agent-turn definition to REQ-BC-01; added failure-case ACs to REQ-PI-03/04 and log→notify ordering; added case-sensitivity negative AC to REQ-DC-01; improved REQ-NF-01 measurement protocol; strengthened REQ-BC-02 log-level assertability; added unresolvable-slug negative AC to REQ-PI-01; clarified any-signal trigger in REQ-PI-01; relaxed C-01 to permit targeted idempotency fix in `initializeFeature()` |
| 1.2 | March 15, 2026 | Product Manager | Addressed BE cross-review v2 (F-01, Q-01): reworded C-01 to enumerate frozen Feature 011 modules by filename, eliminating structural ambiguity for TSPEC authors; added A-06 defining "unresolvable featureSlug" as any falsy value or thrown exception from `featureNameToSlug(extractFeatureName(threadName))`; updated REQ-PI-01 AC to reference A-06 and clarify that the age guard is not evaluated when the slug is unresolvable |

---

*End of Document*
