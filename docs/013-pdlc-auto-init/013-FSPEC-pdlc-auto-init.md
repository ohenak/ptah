# Functional Specification

## PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-013 |
| **Parent Document** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.0, Draft) |
| **Version** | 1.2 |
| **Date** | March 15, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This functional specification defines the behavioral logic for three areas of the PDLC auto-initialization feature that carry sufficient branching complexity to require product-level definition before engineering can make implementation decisions:

1. **Auto-initialization decision flow** — the routing loop branch that decides whether to auto-initialize, pass-through to managed, or pass-through to legacy.
2. **Age guard evaluation** — how "prior agent turns" are counted and how the threshold is applied.
3. **Feature configuration keyword parsing** — how discipline and skip-FSPEC keywords are extracted from the initial message.

Requirements that are straightforward (default values, log message text, idempotency via check-before-write) are left to the TSPEC.

---

## 2. FSPEC Index

| ID | Title | Linked Requirements |
|----|-------|---------------------|
| FSPEC-PI-01 | Auto-Initialization Decision Flow | [REQ-PI-01], [REQ-PI-02], [REQ-PI-03], [REQ-PI-04], [REQ-PI-05] |
| FSPEC-BC-01 | Age Guard Evaluation | [REQ-BC-01], [REQ-BC-02] |
| FSPEC-DC-01 | Feature Configuration Keyword Parsing | [REQ-DC-01], [REQ-DC-02], [REQ-DC-03] |

---

## 3. Functional Specifications

---

### FSPEC-PI-01: Auto-Initialization Decision Flow

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-PI-01 |
| **Title** | Auto-Initialization Decision Flow |
| **Linked Requirements** | [REQ-PI-01], [REQ-PI-02], [REQ-PI-03], [REQ-PI-04], [REQ-PI-05] |

#### Description

When the routing loop receives an agent signal for a given feature slug, it must decide whether to route through the managed PDLC path, the unmanaged legacy path, or auto-initialize a new feature before routing managed. This FSPEC defines that three-way decision and the auto-initialization sub-flow.

#### Behavioral Flow

```
ROUTING LOOP ENTRY
│
├─ 1. Resolve feature slug from incoming thread context
│
├─ 2. Check: isManaged(featureSlug)?
│     │
│     ├─ YES → Route through managed PDLC path (no change from Feature 011)
│     │
│     └─ NO → Enter auto-init eligibility check (FSPEC-BC-01)
│               │
│               ├─ NOT ELIGIBLE (old/unmanaged thread)
│               │    └─ Log debug: skipped (per REQ-BC-02)
│               │    └─ Route through legacy path (RoutingEngine.decide())
│               │
│               └─ ELIGIBLE (new thread)
│                    └─ Parse configuration keywords from initial message (FSPEC-DC-01)
│                    └─ Build FeatureConfig { discipline, skipFspec }
│                    └─ Call initializeFeature(featureSlug, config)
│                    └─ Emit info log (per REQ-PI-03)
│                    └─ Post debug channel notification (per REQ-PI-04)
│                    └─ Route through managed PDLC path (feature is now managed)
```

#### Decision Point — isManaged check

The `isManaged(featureSlug)` call returns `true` if and only if a state record exists on disk for the given slug. It is a pure read with no side effects.

**On `true`:** Proceed directly to managed path. No initialization, no age guard, no keyword parsing. This is the steady-state path for all features after their first turn.

**On `false`:** Two sub-cases exist — the feature is genuinely new (first encounter), or it is an old feature that existed before the PDLC state machine was deployed. These cases are distinguished by the age guard (FSPEC-BC-01).

#### Decision Point — After initializeFeature

After `initializeFeature()` completes:

- The state record for the feature now exists on disk.
- `isManaged(featureSlug)` will return `true` for all future routing loop invocations.
- The current routing signal (LGTM, ROUTE_TO_USER, etc.) must be processed through the managed PDLC path — not discarded. The managed path handles the signal exactly as it would for any other managed feature in `REQ_CREATION`.

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-PI-01 | Auto-initialization happens at most once per feature slug. After the first successful initialization, `isManaged()` returns `true` and this flow is never entered again for that slug. |
| BR-PI-02 | The routing signal that triggered auto-initialization is not discarded. It is processed through the managed path immediately after initialization. |
| BR-PI-03 | If `initializeFeature()` throws an error (e.g., filesystem failure), the orchestrator must not proceed with the managed path. It must surface the error and halt the routing loop for this message. The feature remains unmanaged. |
| BR-PI-04 | Auto-initialization always sets the initial phase to `REQ_CREATION`. There is no mechanism to initialize at any other phase. |

#### Input/Output

**Input:**
- Feature slug (string, derived from thread name)
- Routing signal (from agent)
- Full conversation history (to supply to age guard and keyword parsing)
- Initial message text (the first chronological message in the conversation history with `isBot === false`, i.e., the first user-authored message; used for keyword parsing)

> **Note on conversation history availability:** The conversation history required by the age guard ([FSPEC-BC-01]) and keyword parsing ([FSPEC-DC-01]) is already fetched by the orchestrator before the agent invocation and must be reused at the auto-init decision point. A second `readThreadHistory()` call must not be issued — issuing one would add an unnecessary Discord API round-trip per routing loop invocation and introduce a potential state inconsistency if a message arrives between the two calls.

**Output:**
- Feature state record created on disk (via `initializeFeature()`)
- Info-level log message emitted
- Debug channel notification posted (the debug channel is identified via `this.config.discord.channels.debug`)
- Routing signal forwarded to managed PDLC path

#### Edge Cases

| Case | Behavior |
|------|----------|
| `initializeFeature()` is called but a state record already exists (race condition) | `initializeFeature()` must not overwrite the existing record. It detects the record and returns the existing `FeatureState` without modification (it does not throw). The orchestrator treats this as a successful no-op and proceeds to the managed PDLC path with the existing state record. The orchestrator emits a debug-level log message `[ptah] PDLC auto-init skipped: "{featureSlug}" already initialized (concurrent request)` to provide an observable artifact for tests without requiring filesystem inspection. |
| Feature slug cannot be resolved from thread context | Orchestrator falls through to existing error handling. Auto-init is not attempted. |
| Initial message is unavailable (conversation history is empty) | Default configuration is used — no keyword parsing attempted. Feature is initialized with `{ discipline: "backend-only", skipFspec: false }`. |

#### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `initializeFeature()` throws — filesystem write fails | Log error with feature slug and error details. Do NOT route managed or legacy. Return without processing the signal. The next message to the thread will retry. |
| Debug channel notification fails to post | Log warning but do NOT block initialization. The feature is still initialized. Routing proceeds normally. |

#### Acceptance Tests

| # | Test |
|---|------|
| AT-PI-01 | WHO: As the orchestrator GIVEN: a feature slug with no state record and 0 prior agent turns WHEN: an agent returns LGTM THEN: `initializeFeature()` is called, a state record is created at `REQ_CREATION`, the created state record has config `{ discipline: "backend-only", skipFspec: false }`, and the LGTM signal is processed through the managed PDLC path |
| AT-PI-02 | WHO: As the orchestrator GIVEN: a feature slug that already has a state record WHEN: an agent returns LGTM THEN: `initializeFeature()` is NOT called; the signal is processed directly through the managed PDLC path |
| AT-PI-03 | WHO: As the orchestrator GIVEN: `initializeFeature()` throws a filesystem error WHEN: the routing loop processes the signal THEN: the error is logged, neither managed nor legacy path is invoked, and the feature slug remains unmanaged |
| AT-PI-04 | WHO: As the orchestrator GIVEN: two messages arrive on **different Discord threads** whose names resolve to the same feature slug (cross-thread concurrency — each thread enters its own queue lane and calls `isManaged()` concurrently, both seeing `false`) WHEN: both signals are processed THEN: exactly one state record is created; the second `initializeFeature()` call detects the existing record and skips initialization; the orchestrator emits a debug log `[ptah] PDLC auto-init skipped: "{featureSlug}" already initialized (concurrent request)`. **Note:** same-thread concurrency is already prevented by the per-thread message queue and is not the target scenario for this test. |
| AT-PI-05 | WHO: As the orchestrator GIVEN: a feature is eligible for auto-initialization AND the logger throws when emitting the info-level log WHEN: the routing loop processes the signal THEN: the logger error is swallowed; `initializeFeature()` has already been called and the state record exists on disk; routing proceeds through the managed PDLC path |
| AT-PI-06 | WHO: As the orchestrator GIVEN: a feature is eligible for auto-initialization AND the conversation history is empty (no messages) WHEN: the routing loop processes the signal THEN: keyword parsing is not attempted; `initializeFeature()` is called with `{ discipline: "backend-only", skipFspec: false }`; routing proceeds through the managed PDLC path |

#### Dependencies

- [FSPEC-BC-01] — age guard must pass before initialization occurs
- [FSPEC-DC-01] — keyword parsing supplies the `FeatureConfig` used at initialization
- `PdlcDispatcher.initializeFeature()` from Feature 011 — called as specified

---

### FSPEC-BC-01: Age Guard Evaluation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-BC-01 |
| **Title** | Age Guard Evaluation |
| **Linked Requirements** | [REQ-BC-01], [REQ-BC-02] |

#### Description

Not every unmanaged feature should be auto-initialized. Features that were created before Feature 011 are already progressing through the legacy routing path and should not be interrupted. The age guard evaluates the conversation history to distinguish genuinely new features (first or second agent turn) from existing mid-progress features (third turn or beyond).

#### Behavioral Flow

```
AGE GUARD ENTRY
│
├─ 1. Count prior agent turns in conversation history
│     (definition: messages where isBot === true AND content contains a <routing> tag,
│      excluding the current incoming message)
│
├─ 2. Compare count against threshold (threshold = 1)
│     │
│     ├─ count ≤ 1 → ELIGIBLE for auto-initialization
│     │               Return: { eligible: true }
│     │
│     └─ count > 1  → NOT ELIGIBLE — treat as existing unmanaged feature
│                      Return: { eligible: false, turnCount: count }
```

#### Definition of "Agent Turn"

A **prior agent turn** is any message in the conversation history, before the current message, where:
- `isBot === true` **AND** the message content contains a `<routing>` tag

Orchestrator-generated messages (progress embeds, completion embeds, debug notifications) have `isBot: true` but contain no `<routing>` tag and are therefore **excluded** from the count. This filter is intentional: it prevents false-positive non-eligibility on genuinely new threads where the orchestrator has already posted a progress or status embed.

The current incoming message (the one that triggered this routing loop invocation) is also **excluded** from the count. The count is over *prior* turns only.

#### Threshold: Why 1

The threshold is set at 1 prior agent turn because:

- **0 prior turns:** The user just created the thread and has not yet received any agent response. This is clearly a new feature. ✅ Eligible.
- **1 prior turn:** The user has sent one message and received one agent response. The feature is in its very first interaction. This could be the PM responding to "@pm create REQ", then the user sends a second message. Still a new feature. ✅ Eligible.
- **2 or more prior turns:** The feature has had at least two agent interactions. Features at this stage in the legacy path have already received substantive work and should not be retroactively enrolled. ❌ Not eligible.

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-BC-01 | The turn count is computed from the conversation history supplied to the routing loop. It does not make any external calls to count turns. |
| BR-BC-02 | The threshold of 1 is a constant, not a configuration value. Changing the threshold requires a code change and a new feature. |
| BR-BC-03 | The age guard result is deterministic for a given conversation history. Replaying the same history always yields the same result. |
| BR-BC-04 | When not eligible, the orchestrator logs a debug-level message before routing to the legacy path (per [REQ-BC-02]). |

#### Input/Output

**Input:**
- Conversation history (ordered list of `ThreadMessage` objects, each with `isBot: boolean` and `content: string`)
- Current message (excluded from count)

**Output:**
- `{ eligible: true }` if count ≤ 1
- `{ eligible: false, turnCount: number }` if count > 1

#### Edge Cases

| Case | Behavior |
|------|----------|
| Conversation history is empty or contains only the current message | Turn count = 0 → eligible |
| Conversation history contains only user messages (no agent turns yet) | Turn count = 0 → eligible |
| Thread has exactly 1 prior agent turn | Turn count = 1 → eligible (threshold is inclusive) |
| Thread has exactly 2 prior agent turns | Turn count = 2 → not eligible |
| Feature has been DONE in one lifecycle and a new thread is started | `isManaged()` returns `true` → age guard is never reached |

#### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Conversation history is malformed or unavailable | Treat turn count as 0 → eligible. Log warning. This is fail-open: it is better to auto-initialize incorrectly and have a feature start at REQ_CREATION than to block a new feature from entering the managed path. |

#### Acceptance Tests

| # | Test |
|---|------|
| AT-BC-01 | WHO: As the orchestrator GIVEN: a thread with 0 prior agent turns (first message from user) WHEN: the age guard is evaluated THEN: result is eligible |
| AT-BC-02 | WHO: As the orchestrator GIVEN: a thread with exactly 1 prior agent turn WHEN: the age guard is evaluated THEN: result is eligible |
| AT-BC-03 | WHO: As the orchestrator GIVEN: a thread with 2 prior agent turns WHEN: the age guard is evaluated THEN: result is not eligible; turnCount = 2; AND a debug-level log message is emitted matching `[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has 2 prior turns (threshold: 1)` |
| AT-BC-04 | WHO: As the orchestrator GIVEN: a thread with 5 prior agent turns (existing unmanaged feature) WHEN: the age guard is evaluated THEN: result is not eligible; the orchestrator logs `[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has 5 prior turns (threshold: 1)` and routes to the legacy path |
| AT-BC-05 | WHO: As the orchestrator GIVEN: a malformed conversation history WHEN: the age guard is evaluated THEN: result is eligible (fail-open) with a warning logged |

#### Dependencies

- Called from [FSPEC-PI-01] auto-initialization decision flow
- Requires conversation history to be passed to the routing loop by the orchestrator caller

---

### FSPEC-DC-01: Feature Configuration Keyword Parsing

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-DC-01 |
| **Title** | Feature Configuration Keyword Parsing |
| **Linked Requirements** | [REQ-DC-01], [REQ-DC-02], [REQ-DC-03] |

#### Description

When a feature is eligible for auto-initialization, the orchestrator may find configuration keywords in the initial message text. The **initial message** is the first chronological message in the conversation history with `isBot === false` (i.e., the first user-authored message). These keywords allow the developer to specify the feature's discipline and whether to skip the FSPEC phase. If no keywords are found, default values are used.

#### Behavioral Flow

```
KEYWORD PARSING ENTRY
│
├─ Input: initial message text (first chronological message with isBot === false)
│
├─ 1. Extract all square-bracketed tokens from the message
│     Pattern: all occurrences of [token] where token is one or more
│     non-whitespace characters inside the brackets
│
├─ 2. For each extracted token:
│     │
│     ├─ "backend-only"  → set discipline = "backend-only"
│     ├─ "frontend-only" → set discipline = "frontend-only"
│     ├─ "fullstack"     → set discipline = "fullstack"
│     ├─ "skip-fspec"    → set skipFspec = true
│     └─ anything else   → ignore (no error)
│
├─ 3. Apply defaults for any value not set by a keyword:
│     │
│     ├─ discipline not set → discipline = "backend-only"
│     └─ skipFspec not set  → skipFspec = false
│
└─ Output: FeatureConfig { discipline, skipFspec }
```

#### Keyword Specification

| Keyword | Effect | Notes |
|---------|--------|-------|
| `[backend-only]` | Sets `discipline = "backend-only"` | This is also the default if omitted |
| `[frontend-only]` | Sets `discipline = "frontend-only"` | — |
| `[fullstack]` | Sets `discipline = "fullstack"` | — |
| `[skip-fspec]` | Sets `skipFspec = true` | — |

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-DC-01 | Keyword matching is **case-sensitive and exact**. `[Backend-Only]`, `[FULLSTACK]`, `[ fullstack ]` (with spaces), and `[frontend_only]` (with underscore) are all unrecognized and ignored. |
| BR-DC-02 | If the message contains multiple discipline keywords (e.g., `[backend-only] [fullstack]`), the **last** discipline keyword in the message wins. This avoids silent conflicts and follows a simple, predictable rule. |
| BR-DC-03 | The `[skip-fspec]` keyword is not a discipline keyword. It is orthogonal and can appear alongside any discipline keyword. |
| BR-DC-04 | If the initial message is empty or contains no text, default configuration is returned without error. |
| BR-DC-05 | Unrecognized square-bracketed tokens are silently ignored. No warning or error is emitted. This prevents tag-like syntax used for other purposes (e.g., Markdown references, Discord formatting) from causing unexpected behavior. |
| BR-DC-06 | Keyword parsing only applies to the **initial message** — the first chronological message in the conversation history with `isBot === false` (i.e., the first user-authored message). Subsequent messages are not scanned for keywords. |

#### Input/Output

**Input:**
- Initial message text (string, may be empty)

**Output:**
- `FeatureConfig` object:
  - `discipline`: `"backend-only"` | `"frontend-only"` | `"fullstack"`
  - `skipFspec`: `boolean`

#### Edge Cases

| Case | Behavior |
|------|----------|
| Message contains `[backend-only]` and `[fullstack]` | Last keyword wins: `discipline = "fullstack"` |
| Message contains `[skip-fspec]` only, no discipline keyword | `{ discipline: "backend-only", skipFspec: true }` |
| Message contains `[FULLSTACK]` (wrong case) | Unrecognized — ignored. Default discipline (`"backend-only"`) applies. |
| Message contains `[ fullstack ]` (with spaces inside brackets) | Unrecognized — ignored. Exact match is required. |
| Message is `"@pm create REQ [some-random-tag]"` | `[some-random-tag]` is unrecognized — ignored. Default configuration applies. |
| Initial message is empty string | Default configuration: `{ discipline: "backend-only", skipFspec: false }` |
| Message contains `[skip-fspec]` twice | Idempotent: `skipFspec = true` either way. |

#### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Initial message is null or undefined | Treat as empty string. Return default configuration. No error thrown. |

#### Acceptance Tests

| # | Test |
|---|------|
| AT-DC-01 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ"` (no keywords) WHEN: keyword parsing runs THEN: result is `{ discipline: "backend-only", skipFspec: false }` |
| AT-DC-02 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [fullstack]"` WHEN: keyword parsing runs THEN: result is `{ discipline: "fullstack", skipFspec: false }` |
| AT-DC-03 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [frontend-only]"` WHEN: keyword parsing runs THEN: result is `{ discipline: "frontend-only", skipFspec: false }` |
| AT-DC-04 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [skip-fspec]"` WHEN: keyword parsing runs THEN: result is `{ discipline: "backend-only", skipFspec: true }` |
| AT-DC-05 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [fullstack] [skip-fspec]"` WHEN: keyword parsing runs THEN: result is `{ discipline: "fullstack", skipFspec: true }` |
| AT-DC-06 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [FULLSTACK]"` (wrong case) WHEN: keyword parsing runs THEN: keyword is ignored; result is `{ discipline: "backend-only", skipFspec: false }` |
| AT-DC-07 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [backend-only] [fullstack]"` (conflict) WHEN: keyword parsing runs THEN: last discipline wins; result is `{ discipline: "fullstack", skipFspec: false }` |
| AT-DC-08 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [some-random-tag]"` WHEN: keyword parsing runs THEN: unknown keyword is silently ignored; result is `{ discipline: "backend-only", skipFspec: false }` |
| AT-DC-09 | WHO: As the orchestrator GIVEN: initial message `"@pm create REQ [fullstack] [backend-only]"` (reverse conflict) WHEN: keyword parsing runs THEN: last discipline wins; result is `{ discipline: "backend-only", skipFspec: false }` |

#### Dependencies

- Called from [FSPEC-PI-01] after age guard passes
- Output is passed directly to `initializeFeature(featureSlug, config)` as the `FeatureConfig`
- `FeatureConfig` type is defined in Feature 011 and is not modified by this feature

---

## 4. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-01 | Should keyword matching become case-insensitive in the future? BR-DC-01 specifies exact case-sensitive matching for simplicity. If developer feedback shows frequent mistakes with casing, this can be relaxed in a follow-on feature. | Deferred |
| OQ-02 | Should there be a developer-facing document (in SKILL.md or a README) explaining the supported keywords and their syntax? This is out of scope for this feature but should be tracked. | Deferred |
| OQ-03 (TE-Q-01) | Does the orchestrator ever post messages directly to the feature thread that could be miscounted as agent turns? **Resolved:** The `isBot + <routing>-tag` discriminator in FSPEC-BC-01 already handles this. Orchestrator-generated messages (progress embeds, status notifications) have `isBot: true` but contain no `<routing>` tag and are therefore excluded from the count. No additional business rule is needed. | Resolved |
| OQ-04 (TE-Q-02) | Does Feature 013 need to verify that the `skipFspec: true` flag actually causes phase skipping at runtime? **Resolved:** No. Feature 013 only defines how the flag is parsed from the initial message and written into `FeatureConfig`. The runtime phase-skip behavior is owned by Feature 011's state machine. Testing the end-to-end phase-skip flow is out of scope for Feature 013. | Resolved — Out of scope |

---

## 5. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Backend Engineer | — | — | Pending |
| Test Engineer | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 15, 2026 | Product Manager | Initial FSPEC — 3 specifications (FSPEC-PI-01, FSPEC-BC-01, FSPEC-DC-01) covering auto-initialization decision flow, age guard evaluation, and keyword parsing |
| 1.1 | March 15, 2026 | Product Manager | Address BE round-2 cross-review (F-01 through F-04) and TE cross-review (F-01, F-03 through F-05, Q-01, Q-02): (1) FSPEC-BC-01 agent-turn definition updated to use `isBot === true AND content contains <routing> tag`, replacing non-existent `role` field; behavioral flow and Input section aligned; (2) Race-condition edge case in FSPEC-PI-01 now specifies that `initializeFeature()` returns existing `FeatureState` without throwing; (3) "Initial message" consistently defined as first chronological message with `isBot === false` across FSPEC-PI-01, FSPEC-DC-01 Description, and BR-DC-06; (4) Debug channel config key `this.config.discord.channels.debug` cited in FSPEC-PI-01 Output; (5) AT-BC-03 THEN clause includes debug log assertion; (6) AT-DC-09 added for reverse keyword-order conflict; (7) AT-PI-01 THEN clause includes FeatureConfig assertion; (8) OQ-03 and OQ-04 added to resolve TE-Q-01 (orchestrator message exclusion) and TE-Q-02 (skipFspec scope) |
| 1.2 | March 15, 2026 | Product Manager | Address BE round-3 cross-review (F-02, F-03) and TE round-2 cross-review (F-01, F-02, F-03, Q-01): (1) AT-PI-04 rewritten to specify cross-thread concurrency (two different `threadId` values resolving to same slug) as the target scenario — distinguishing it from same-thread concurrency which is already prevented by the per-thread message queue; (2) AT-PI-05 added — negative test for logger-throws fault path (REQ-PI-03 requirement that logger failures are swallowed and routing proceeds); (3) AT-PI-06 added — end-to-end test for empty-history → default-config path (no keyword parsing attempted, defaults applied directly); (4) Race-condition edge case row updated with observable debug log `[ptah] PDLC auto-init skipped: "{featureSlug}" already initialized (concurrent request)` enabling deterministic test assertions without filesystem inspection (TE Q-01); (5) FSPEC-PI-01 Input section augmented with note that conversation history is already fetched before the agent invocation and must be reused — a second `readThreadHistory()` call must not be issued (BE F-03) |

---

*End of Document*
