# Functional Specification: Phase 3 — Skill Routing

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE3 |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.3 |
| **Date** | March 9, 2026 |
| **Author** | Product Manager |
| **Status** | Approved (Rev 1) |
| **Approval Date** | March 9, 2026 |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 3 (Skill Routing) of Ptah v4.0. Phase 3 is the core orchestration phase — it builds on the Discord connection layer (Phase 2) and adds context assembly, routing decisions, skill invocation, and response posting.

Phase 3 contains 21 requirements across 6 domains with complex multi-step orchestration, branching decision trees, and layered context assembly rules that the engineer should not derive alone. This FSPEC documents the expected system behavior, business rules, and edge cases so that engineers can design the technical solution with full product clarity.

**What Phase 3 delivers:** When a message arrives in a Discord thread, the Orchestrator can now determine *which agent* to invoke, assemble the *right context*, invoke the agent's Skill *statelessly*, and post the *response* back — completing the full message → response loop for the first time.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-DI-04] | Post colour-coded embeds | [FSPEC-DI-01] |
| [REQ-DI-05] | Create one thread per coordination task | [FSPEC-DI-01] |
| [REQ-DI-09] | Route by routing signal only | [FSPEC-RP-01] |
| [REQ-CB-01] | Three-layer context model | [FSPEC-CB-01] |
| [REQ-CB-02] | Layer 1 and Layer 3 never truncated | [FSPEC-CB-01] |
| [REQ-CB-03] | Fresh artifact reads | [FSPEC-CB-01] |
| [REQ-CB-04] | Scope Layer 2 to current feature | [FSPEC-CB-01] |
| [REQ-CB-05] | Token budget enforcement | [FSPEC-CB-01] |
| [REQ-CB-06] | Task splitting on budget overflow | [FSPEC-CB-01] |
| [REQ-RP-01] | Pattern A — Agent-to-agent answer | [FSPEC-RP-02] |
| [REQ-RP-03] | Pattern C — Review loop | [FSPEC-RP-03] |
| [REQ-RP-04] | Final review instruction at Turn 3 | [FSPEC-RP-03] |
| [REQ-SI-01] | Stateless Skill invocation | [FSPEC-SI-01] |
| [REQ-SI-02] | Skill output format | [FSPEC-SI-01] |
| [REQ-SI-03] | Two-iteration rule in Skill prompts | [FSPEC-SI-01] |
| [REQ-SI-04] | Structured routing signal | [FSPEC-RP-01] |
| [REQ-SI-11] | Concurrent Skill invocations | [FSPEC-SI-01] |
| [REQ-SI-12] | Per-agent worktree isolation | [FSPEC-SI-01] |
| [REQ-NF-01] | Response latency | [FSPEC-SI-01] |
| [REQ-NF-04] | Token efficiency | [FSPEC-CB-01] |
| [REQ-NF-07] | Portability | [FSPEC-DI-01] |

### 2.2 Requirements NOT Requiring FSPECs

None — all 21 Phase 3 requirements have behavioral complexity warranting functional specification.

---

## 3. FSPEC-CB-01: Context Assembly

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CB-01 |
| **Title** | Context Bundle Assembly — Three-Layer Model |
| **Linked Requirements** | [REQ-CB-01], [REQ-CB-02], [REQ-CB-03], [REQ-CB-04], [REQ-CB-05], [REQ-CB-06], [REQ-NF-04] |

### 3.1 Description

Before every Skill invocation, the Orchestrator assembles a Context Bundle — the sole input to the stateless Skill. The bundle uses a three-layer model designed to balance completeness with token efficiency.

### 3.2 Behavioral Flow

```
1. TRIGGER: A message arrives that requires Skill invocation
   (determined by FSPEC-RP-01 routing decision)

2. DETERMINE RESUME PATTERN
   a. Read full thread history (already available from Phase 2)
   b. Classify the thread:
      - Is this a new task (first message)? → Fresh invocation
      - Is this an agent-to-agent answer? → Pattern A (FSPEC-RP-02)
      - Is this a review thread? → Pattern C (FSPEC-RP-03)
   c. The resume pattern determines what goes into Layer 3

3. ASSEMBLE LAYER 1 — Stable Reference (never truncated)
   a. Load the target agent's role prompt from `ptah/skills/{agent}.md`
   b. Load `docs/overview.md` (project-wide context)
   c. Concatenate: role prompt + overview
   d. This layer is FIXED — identical for every invocation of the same agent

4. ASSEMBLE LAYER 2 — Current Artifact State (subject to truncation)
   a. Identify the current feature from the thread name
      - Thread naming convention: `{feature} — {description}`
      - Extract the feature name before the em dash
   b. Read files from `docs/{feature}/` directory — FRESH from filesystem
      - NEVER use cached content
      - NEVER reconstruct from thread history
      - Read at invocation time, not at message detection time
   c. Include cross-cutting docs if referenced (e.g., `docs/overview.md`
      is already in Layer 1; do not duplicate)
   d. Exclude files from other feature folders

5. ASSEMBLE LAYER 3 — Immediate Trigger (never truncated)
   a. Content varies by resume pattern:
      - Fresh invocation: The triggering message verbatim
      - Pattern A: Task reminder + question + answer verbatim
      - Pattern C: All prior turns (max 3) + current turn verbatim
   b. See FSPEC-RP-02 and FSPEC-RP-03 for detailed Layer 3 content

6. ENFORCE TOKEN BUDGET
   a. Calculate token counts for each layer
   b. Token allocation (configurable, defaults below):
      - Layer 1 (role + overview): ~15% fixed overhead
      - Layer 3 (trigger): ~10%
      - Thread context: ~15%
      - Layer 2 (feature docs): ~45%
      - Response headroom: ~15%
   c. If total fits within budget → proceed to Skill invocation
   d. If Layer 2 exceeds its allocation → TRUNCATE (Step 7)
   e. If truncation is insufficient → SPLIT (Step 8)

7. TRUNCATE LAYER 2 (when over budget)
   a. Layer 1 and Layer 3 are NEVER truncated — this is inviolable
   b. Rank Layer 2 files by relevance to the current task:
      - Most relevant: The specific file being worked on
        (e.g., `requirements.md` if the task is "review requirements")
      - Medium relevant: Related files in the same feature folder
        (e.g., `specifications.md` for context during requirements review)
      - Least relevant: Supporting files (e.g., `plans.md`, `properties.md`)
   c. Truncate from least-relevant files first
   d. Within a file, truncate from the end (preserve headers and
      early sections which typically contain the most important context)

8. SPLIT TASK (when truncation is insufficient) — P1
   a. If the token budget cannot be met even after maximum truncation:
      - Create a focused sub-task covering only the sections needed
        for the immediate turn
      - The sub-task gets its own thread with a reference to the parent
      - The parent task continues in subsequent invocations once the
        sub-task completes
   b. Post a system message to the original thread indicating the
      task was split and why

9. OUTPUT: Context Bundle ready for Skill invocation (FSPEC-SI-01)
```

### 3.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| CB-R1 | Layer 1 and Layer 3 are never truncated, regardless of budget pressure | The agent needs its role definition and the triggering context to produce correct output. Without these, output quality degrades catastrophically. |
| CB-R2 | Layer 2 files are always read fresh from the filesystem at invocation time | Between message detection and invocation, another agent may have committed changes. Stale reads cause agents to work on outdated artifacts. |
| CB-R3 | Layer 2 includes only the current feature's `/docs/{feature}/` files | Including all features would waste tokens on irrelevant context and degrade output quality. |
| CB-R4 | `docs/overview.md` appears in Layer 1 only — never duplicated in Layer 2 | Duplication wastes tokens. |
| CB-R5 | Token budget percentages are defaults — configurable via `ptah.config.json` | Different projects may have different context sizes; allow tuning. |
| CB-R6 | Feature name is extracted from thread name (text before ` — `) | Consistent naming convention enables automatic feature folder mapping. |
| CB-R7 | In Phase 3, Layer 2 is read from the main working tree before worktree creation. This introduces a theoretical TOCTOU window where a concurrent change (e.g., human push) could cause Layer 2 content to diverge from the worktree's filesystem state. This is accepted as a known trade-off in Phase 3 because no Skill commits to the main tree (Phase 4 adds auto-commit). | Low risk in Phase 3. Phase 4 should re-evaluate whether Layer 2 reads should occur from the worktree after creation to eliminate this window. |

### 3.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Feature folder does not exist in `/docs` | Layer 2 is empty. Skill invocation proceeds with Layer 1 + Layer 3 only. Log a warning. |
| Feature folder exists but is empty | Layer 2 is empty. Skill invocation proceeds normally. |
| `docs/overview.md` does not exist | Layer 1 contains only the role prompt. Log a warning. |
| Thread name does not follow `{feature} — {description}` convention | Treat the entire thread name as the feature name. If no matching folder, Layer 2 is empty. Log a warning. |
| Role prompt file (`ptah/skills/{agent}.md`) does not exist | This is a fatal error for this invocation. Post an error embed to the thread. Do not invoke the Skill. |
| Token budget is exceeded by Layer 1 + Layer 3 alone (before Layer 2) | Layer 2 is omitted entirely. Log a warning. Skill invocation proceeds — the agent can still produce output with role + trigger alone, though quality may be reduced. |
| Multiple feature folders could match (ambiguous thread name) | Use exact match. If no exact match, use the longest prefix match. If no prefix match, Layer 2 is empty. |

### 3.5 Error Scenarios

| Error | Behavior |
|-------|----------|
| Filesystem read failure for Layer 2 files | Post error embed to thread. Do not invoke Skill. Log to `#agent-debug`. |
| Filesystem read failure for Layer 1 files (role prompt) | Post error embed to thread. Do not invoke Skill. Log to `#agent-debug`. |
| Token counting service unavailable or throws | Fall back to character-based estimation (1 token ≈ 4 characters). Log a warning. Proceed with invocation. |

### 3.6 Acceptance Tests

**AT-CB-01: Three-layer assembly for fresh invocation**

```
WHO:   As the Orchestrator
GIVEN: A new message arrives in thread "auth — review requirements"
       and `docs/auth/` contains `requirements.md` and `specifications.md`
       and `ptah/skills/dev-agent.md` exists
       and `docs/overview.md` exists
WHEN:  I assemble the Context Bundle
THEN:  Layer 1 contains dev-agent role prompt + overview.md content
       Layer 2 contains fresh reads of `docs/auth/requirements.md` and
       `docs/auth/specifications.md`
       Layer 3 contains the triggering message verbatim
       No files from other feature folders are included
```

**AT-CB-02: Layer 2 truncation under budget pressure**

```
WHO:   As the Orchestrator
GIVEN: Layer 1 + Layer 3 consume 30% of the token budget
       and Layer 2 files total 60% of the budget (exceeding the 45% allocation)
WHEN:  I enforce the token budget
THEN:  Layer 1 and Layer 3 remain verbatim and complete
       Layer 2 is truncated from least-relevant files first
       The total Context Bundle fits within the token budget
```

**AT-CB-03: Fresh artifact reads**

```
WHO:   As the Orchestrator
GIVEN: `docs/auth/requirements.md` was modified by another agent
       after the triggering message was detected but before invocation
WHEN:  I assemble Layer 2
THEN:  Layer 2 contains the latest version of `requirements.md`
       (the post-modification version), not the version at message detection time
```

**AT-CB-04: Missing feature folder**

```
WHO:   As the Orchestrator
GIVEN: Thread name is "payments — review specs"
       and `docs/payments/` does not exist
WHEN:  I assemble the Context Bundle
THEN:  Layer 2 is empty
       A warning is logged
       Skill invocation proceeds with Layer 1 + Layer 3 only
```

**AT-CB-05: Task splitting on budget overflow (P1)**

```
WHO:   As the Orchestrator
GIVEN: Layer 2 files cannot fit within budget even after maximum truncation
WHEN:  I attempt to assemble the Context Bundle
THEN:  The task is split into a focused sub-task with reduced scope
       A system message is posted to the original thread
       The sub-task gets its own thread
```

**AT-CB-06: No duplication of overview.md across layers**

```
WHO:   As the Orchestrator
GIVEN: `docs/overview.md` exists
       and `docs/auth/` contains files including a reference to overview.md
WHEN:  I assemble the Context Bundle
THEN:  `docs/overview.md` appears in Layer 1 only
       Layer 2 does not include `docs/overview.md`
       No content is duplicated across layers
```

**AT-CB-07: Feature name extraction from thread name**

```
WHO:   As the Orchestrator
GIVEN: Thread name is "auth — review requirements"
WHEN:  I extract the feature name for Layer 2 assembly
THEN:  The feature name is "auth"
       Layer 2 reads files from `docs/auth/` only
```

**AT-CB-08: Thread name without em dash convention**

```
WHO:   As the Orchestrator
GIVEN: Thread name is "fix login bug" (no em dash separator)
WHEN:  I extract the feature name
THEN:  The entire thread name "fix login bug" is treated as the feature name
       If no matching folder exists, Layer 2 is empty
       A warning is logged
```

**AT-CB-09: Token budget exceeded by Layer 1 + Layer 3 alone**

```
WHO:   As the Orchestrator
GIVEN: Layer 1 (role prompt + overview) and Layer 3 (trigger message)
       together exceed 85% of the token budget
WHEN:  I enforce the token budget
THEN:  Layer 2 is omitted entirely
       Layer 1 and Layer 3 remain verbatim and complete
       A warning is logged
       Skill invocation proceeds without Layer 2
```

**AT-CB-10: Ambiguous thread name with multiple folder matches**

```
WHO:   As the Orchestrator
GIVEN: Thread name is "auth" (no em dash)
       and `docs/auth/` and `docs/auth-v2/` both exist
WHEN:  I resolve the feature folder
THEN:  `docs/auth/` is used (exact match preferred)
       If no exact match exists, the longest prefix match is used
       If no prefix match exists, Layer 2 is empty
```

**AT-CB-11: Token counting fallback on service failure**

```
WHO:   As the Orchestrator
GIVEN: The token counting service throws an error
WHEN:  I calculate token counts for budget enforcement
THEN:  I fall back to character-based estimation (1 token ≈ 4 characters)
       A warning is logged
       Context assembly proceeds normally with the estimated counts
```

**AT-CB-12: Layer 2 truncation preserves file relevance ranking**

```
WHO:   As the Orchestrator
GIVEN: The current task is "review requirements"
       and Layer 2 contains `requirements.md` (10K tokens),
       `specifications.md` (8K tokens), and `plans.md` (6K tokens)
       and the Layer 2 budget is 15K tokens
WHEN:  I truncate Layer 2
THEN:  `plans.md` (least relevant) is truncated or removed first
       `specifications.md` (medium relevant) is truncated next if needed
       `requirements.md` (most relevant — the file being worked on) is
       preserved as fully as possible
       Within any truncated file, content is removed from the end first
       (headers and early sections are preserved)
```

### 3.7 Dependencies

- Depends on Phase 2: [REQ-DI-03] (thread history reading)
- Consumed by: [FSPEC-SI-01] (Skill Invocation Lifecycle)

---

## 4. FSPEC-RP-01: Routing Decision Tree

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RP-01 |
| **Title** | Routing Decision Tree — Determining the Next Agent |
| **Linked Requirements** | [REQ-DI-09], [REQ-SI-04] |

### 4.1 Description

The Orchestrator must determine which agent to invoke next after every Skill response and for every new message in a thread. The **sole mechanism** for this determination is the structured routing signal embedded in each Skill response. No fallback to @mention parsing, thread ownership, or last-sender heuristics exists.

### 4.2 Behavioral Flow

```
1. TRIGGER: A message arrives in a thread under #agent-updates

2. CLASSIFY MESSAGE SOURCE
   a. Is this a bot-posted embed (our own response)? → IGNORE (do not re-process)
   b. Is this a system message (our own system post)? → IGNORE
   c. Is this a human message? → Treat as initial task request (Step 3a)
   d. Is this a Skill response posted as an embed? → Parse routing signal (Step 3b)

3a. HUMAN MESSAGE (initial task request)
    a. The human message must indicate a target agent via Discord @mention
       of the agent's server role (e.g., @PM Agent, @Dev Agent)
       - Each agent is represented by a **mentionable server role** in
         Discord — NOT a separate bot user. Ptah runs as a single bot
         process; the 4 agent roles (@PM Agent, @Dev Agent,
         @Frontend Agent, @Test Agent) are Discord server roles that
         the bot watches for. The bot maps role mentions to agent IDs
         in `ptah.config.json`.
       - Detection is structural (@mention parsing of role IDs), NOT
         natural language interpretation — consistent with the
         "no heuristics" philosophy of [REQ-DI-09]
       - If no @mention is detected → post a system message asking the
         user to specify the target agent via @mention
       - The Orchestrator does NOT attempt to infer agent from message
         content, thread ownership, or keyword matching
    b. Proceed to Context Assembly (FSPEC-CB-01) with identified agent

3b. PARSE ROUTING SIGNAL from Skill response
    a. Every Skill response MUST include a routing signal
    b. Valid routing signal types:
       - ROUTE_TO_AGENT: {agent_id}
         → Invoke the specified agent next (e.g., "dev-agent", "test-agent")
       - ROUTE_TO_USER: {question}
         → Pause thread, write question to pending.md (Phase 5)
       - LGTM
         → Approval signal. If this is a review thread, the review is complete.
            Post a completion embed. No further routing.
       - TASK_COMPLETE
         → The task is finished. Post a completion embed. No further routing.
    c. If routing signal is missing → ERROR (Step 4)
    d. If routing signal is malformed → ERROR (Step 4)
    e. If routing signal references unknown agent_id → ERROR (Step 4)

4. ERROR HANDLING for invalid/missing routing signals
   a. Post an error embed to the thread:
      "Routing error: [specific reason — missing signal / malformed /
       unknown agent]. This Skill response cannot be routed."
   b. Log to #agent-debug with full details
   c. Do NOT invoke any agent
   d. Do NOT retry — this is a Skill output error, not a transient failure

5. VALID ROUTE → Proceed to Context Assembly (FSPEC-CB-01) with target agent
```

### 4.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| RP-R1 | Routing signal is the sole routing mechanism. No fallback heuristics. | Deterministic routing prevents ambiguity. Heuristics (thread ownership, last sender) are unreliable and produce incorrect routing in edge cases. |
| RP-R2 | Every Skill response must contain exactly one routing signal. | The Orchestrator must always know what to do next. Ambiguity (zero or multiple signals) is an error. |
| RP-R3 | Invalid routing signals are treated as errors, not retried. | A malformed signal indicates a Skill prompt or output problem, not a transient failure. Retrying would produce the same error. |
| RP-R4 | ROUTE_TO_USER pauses the thread — it is not routed to another agent. | User questions require human input. The thread resumes only when the user answers (Phase 5, Pattern B). |
| RP-R5 | LGTM and TASK_COMPLETE are terminal signals — no further routing. | These indicate the conversation in this thread is done. |
| RP-R6 | The bot ignores its own messages (embeds and system posts). | Prevents infinite loops where the bot re-processes its own output. |
| RP-R7 | Same-thread message queue is in-memory. Queued messages are lost on process crash. On reconnect, the Orchestrator re-reads thread history (Phase 2's `readThreadHistory`) and re-processes any unhandled messages. The queue's purpose is ordering, not durability. | In-memory queuing is acceptable for Phase 3's single-process architecture. Discord thread history provides the durability guarantee — no message is permanently lost. |

### 4.4 Routing Signal Format

The routing signal must be parseable by the Orchestrator. The exact format is a technical decision for the engineer, but it must support these semantics:

| Signal Type | Semantics | Example Intent |
|-------------|-----------|----------------|
| ROUTE_TO_AGENT | Invoke the specified agent with the current thread context | "Send this to the dev-agent for review" |
| ROUTE_TO_USER | Pause and escalate a question to the human user | "I need the user to decide between OAuth providers" |
| LGTM | Approve the current artifact — review is complete | "The requirements look good, approved" |
| TASK_COMPLETE | The assigned task is finished — no further action needed | "Specification document has been written" |

**Thread Action Field:** The `ROUTE_TO_AGENT` signal includes a `thread_action` field that determines whether the next agent is invoked in the current thread or a new one:

| thread_action | Behavior | When to Use |
|---------------|----------|-------------|
| `reply` (default) | Post response in current thread; invoke next agent in same thread | Normal replies, review feedback, Q&A within a task |
| `new_thread` | Post response in current thread; create a new thread for the next agent | Initiating a new coordination task (e.g., "now review the spec" after writing requirements) |

If `thread_action` is omitted, the default is `reply`. The `ROUTE_TO_USER`, `LGTM`, and `TASK_COMPLETE` signals always operate in the current thread — no `thread_action` field is needed for them.

**Constraint:** The engineer defines the exact serialization format (e.g., JSON block, structured tag, special prefix). The PM does not prescribe this. However, the format must be:
- Unambiguous — one and only one signal per response
- Machine-parseable — no natural language interpretation required
- Documented in each Skill's system prompt so Skills know how to produce it
- Must support the `thread_action` field for `ROUTE_TO_AGENT` signals

### 4.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill response contains multiple routing signals | Treat as malformed. Post error embed. Use the first signal encountered and log a warning about the duplicate. |
| Skill response is empty (no text, no signal) | Treat as missing signal. Post error embed. |
| ROUTE_TO_AGENT targets the same agent that just responded | Valid — an agent may route to itself (e.g., PM Agent routes to PM Agent for a different task). Proceed normally. |
| ROUTE_TO_AGENT targets an agent not in `ptah.config.json` | Treat as unknown agent. Post error embed. |
| Human posts a follow-up message in an active thread | If a Skill invocation is in-flight for this thread, queue the message. Process after the current invocation completes. |
| Two messages arrive in the same thread simultaneously | Process them sequentially. The first message triggers invocation; the second waits. |
| Process crashes while a message is queued for same-thread processing | The queued message is lost from memory. On reconnect, the Orchestrator re-reads thread history via `readThreadHistory` and re-discovers the unprocessed message. No message is permanently lost. |

### 4.6 Error Scenarios

| Error | Behavior |
|-------|----------|
| Routing signal parse failure | Post error embed with parse details. Log to `#agent-debug`. Thread is stalled until a human intervenes. |
| Referenced agent's Skill file does not exist | Post error embed. Log to `#agent-debug`. Do not invoke. |

### 4.7 Acceptance Tests

**AT-RP-01: Valid ROUTE_TO_AGENT signal**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent has responded with a ROUTE_TO_AGENT signal
       targeting "dev-agent"
WHEN:  I parse the routing signal
THEN:  I identify "dev-agent" as the next agent
       I proceed to context assembly for dev-agent
       I do not use any fallback heuristic
```

**AT-RP-02: Missing routing signal**

```
WHO:   As the Orchestrator
GIVEN: A Skill has returned a response with no routing signal
WHEN:  I attempt to parse the routing signal
THEN:  I post an error embed to the thread stating "missing routing signal"
       I log to #agent-debug
       I do not invoke any agent
```

**AT-RP-03: LGTM terminal signal**

```
WHO:   As the Orchestrator
GIVEN: The Dev Agent responds with an LGTM signal in a review thread
WHEN:  I parse the routing signal
THEN:  I post a completion embed to the thread
       I do not invoke any further agents in this thread
```

**AT-RP-04: ROUTE_TO_USER signal**

```
WHO:   As the Orchestrator
GIVEN: A Skill responds with ROUTE_TO_USER and a question
WHEN:  I parse the routing signal
THEN:  I pause the thread (no further agent invocations)
       The question is queued for user question handling (Phase 5)
```

**AT-RP-05: Unknown agent in routing signal**

```
WHO:   As the Orchestrator
GIVEN: A Skill responds with ROUTE_TO_AGENT targeting "security-agent"
       and "security-agent" is not in ptah.config.json
WHEN:  I parse the routing signal
THEN:  I post an error embed stating "unknown agent: security-agent"
       I log to #agent-debug
       I do not invoke any agent
```

**AT-RP-06: TASK_COMPLETE terminal signal**

```
WHO:   As the Orchestrator
GIVEN: A Skill responds with TASK_COMPLETE after writing a specification
WHEN:  I parse the routing signal
THEN:  I post a completion embed to the thread
       I do not invoke any further agents in this thread
       The thread is treated identically to an LGTM resolution
```

**AT-RP-07: Bot ignores its own messages**

```
WHO:   As the Orchestrator
GIVEN: I have posted an embed (agent response) or system message to a thread
WHEN:  The message event fires for my own post
THEN:  I do not process the message
       I do not trigger routing or context assembly
       No infinite loop occurs
```

**AT-RP-08: Human message with identifiable target agent**

```
WHO:   As the Orchestrator
GIVEN: A human posts a message containing a Discord @mention of the
       Dev Agent role (e.g., "<@dev-agent-role-id> please review the
       requirements") in a thread
WHEN:  I classify the message source
THEN:  I detect the @mention structurally (Discord mention parsing)
       I identify "dev-agent" as the target agent
       I proceed to context assembly for dev-agent
       I do not use natural language interpretation or keyword matching
       I do not parse a routing signal (human messages have no signal)
```

**AT-RP-09: Human message with no identifiable target agent**

```
WHO:   As the Orchestrator
GIVEN: A human posts "can someone review this?" in a thread
       with no Discord @mention of any agent role
WHEN:  I classify the message source
THEN:  I post a system message asking the user to specify the target
       agent via @mention
       I do not attempt to infer the agent from message content
       I do not invoke any agent
```

**AT-RP-10: Multiple routing signals in a single response**

```
WHO:   As the Orchestrator
GIVEN: A Skill response contains both ROUTE_TO_AGENT: dev-agent
       and TASK_COMPLETE
WHEN:  I parse the routing signal
THEN:  I treat the response as malformed
       I use the first signal encountered (ROUTE_TO_AGENT: dev-agent)
       I log a warning about the duplicate signal
       I post an error embed to the thread
```

**AT-RP-11: Empty Skill response (no text, no signal)**

```
WHO:   As the Orchestrator
GIVEN: A Skill returns a completely empty response (no text, no routing signal)
WHEN:  I attempt to parse the routing signal
THEN:  I treat it as a missing routing signal
       I post an error embed stating "missing routing signal"
       I log to #agent-debug
       I do not invoke any agent
```

**AT-RP-12: Human follow-up message during in-flight Skill invocation**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation is currently in-flight for thread "auth — review"
       and a human posts a follow-up message in the same thread
WHEN:  I detect the follow-up message
THEN:  The follow-up message is queued
       It is processed after the current invocation completes
       The in-flight invocation is not interrupted
```

**AT-RP-13: Sequential processing of simultaneous same-thread messages**

```
WHO:   As the Orchestrator
GIVEN: Two messages arrive simultaneously in thread "auth — review"
WHEN:  I process them
THEN:  The first message triggers a Skill invocation
       The second message waits until the first invocation completes
       They are processed sequentially, not concurrently
```

**AT-RP-14: Malformed routing signal (parseable but invalid structure)**

```
WHO:   As the Orchestrator
GIVEN: A Skill response contains a routing signal that is partially
       parseable but structurally invalid (e.g., ROUTE_TO_AGENT with
       no agent_id specified)
WHEN:  I attempt to parse the routing signal
THEN:  I treat it as a malformed signal
       I post an error embed with parse details
       I log to #agent-debug
       I do not invoke any agent
       I do not retry
```

### 4.8 Dependencies

- Depends on Phase 2: [REQ-DI-02] (message detection), [REQ-DI-03] (thread history)
- Consumed by: [FSPEC-CB-01] (determines which agent to assemble context for)

---

## 5. FSPEC-RP-02: Resume Pattern A — Agent-to-Agent Answer

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RP-02 |
| **Title** | Resume Pattern A — Agent-to-Agent Question/Answer |
| **Linked Requirements** | [REQ-RP-01] |

### 5.1 Description

Pattern A is used when one agent has asked another agent a question, and the answering agent has responded. The Orchestrator re-invokes the original (asking) agent with a focused Context Bundle containing only the question and answer — not the full thread history.

### 5.2 Behavioral Flow

```
1. TRIGGER: Agent B posts a response to Agent A's question in a thread
   (detected via routing signal: ROUTE_TO_AGENT targeting Agent A)

2. IDENTIFY PATTERN A CONTEXT
   a. From the thread history, identify:
      - The original task that Agent A was working on (task reminder)
      - The question Agent A asked (the message that triggered Agent B)
      - Agent B's answer (the current message / latest response)
   b. These three elements form Layer 3 for Pattern A

3. ASSEMBLE CONTEXT BUNDLE
   a. Layer 1: Agent A's role prompt + docs/overview.md (standard)
   b. Layer 2: Fresh read of docs/{feature}/ files (standard)
   c. Layer 3 (Pattern A specific):
      - Task reminder: "You were working on: {original task description}"
      - Question: "{Agent A's question, verbatim}"
      - Answer: "{Agent B's answer, verbatim}"
   d. NO full thread history is included beyond these three elements

4. INVOKE Agent A with this Context Bundle (→ FSPEC-SI-01)
```

### 5.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| RPA-R1 | Layer 3 contains only task reminder + question + answer — no full thread history | The agent is stateless. The question/answer pair is sufficient context. Including full history wastes tokens and may confuse the agent with irrelevant earlier turns. |
| RPA-R2 | The question and answer are included verbatim — no summarization | Summarization risks losing critical detail. The Q/A pair is typically short enough to include in full. |
| RPA-R3 | Layer 2 is re-read fresh even if the answering agent didn't modify any files | The answering agent may have committed changes to artifact files as part of its response. Fresh reads ensure the asking agent sees the latest state. |

### 5.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| The question spans multiple messages from Agent A | Concatenate all consecutive Agent A messages as the question. |
| Agent B's answer includes artifact changes (committed to `/docs`) | Layer 2 picks up these changes automatically via fresh reads. |
| The original task reminder cannot be determined from thread history | Use the thread's first message as the task reminder. |

### 5.5 Acceptance Tests

**AT-RPA-01: Standard Pattern A resume**

```
WHO:   As the Orchestrator
GIVEN: PM Agent asked Dev Agent "Should we use REST or GraphQL?"
       and Dev Agent responded "REST — simpler for this use case"
       and Dev Agent's routing signal is ROUTE_TO_AGENT: pm-agent
WHEN:  I re-invoke PM Agent
THEN:  The Context Bundle Layer 3 contains:
       - Task reminder from the original PM task
       - Question: "Should we use REST or GraphQL?" (verbatim)
       - Answer: "REST — simpler for this use case" (verbatim)
       Layer 2 is read fresh from docs/{feature}/
       No full thread history is included
```

**AT-RPA-02: Multi-message question concatenation**

```
WHO:   As the Orchestrator
GIVEN: PM Agent posted two consecutive messages to Dev Agent:
       Message 1: "I'm evaluating API design options."
       Message 2: "Should we use REST or GraphQL for the user service?"
       and Dev Agent responded with a single answer
WHEN:  I assemble the Pattern A Context Bundle for PM Agent
THEN:  Layer 3 question contains both messages concatenated:
       "I'm evaluating API design options. Should we use REST or
       GraphQL for the user service?"
       The answer is included verbatim as a single block
```

**AT-RPA-03: Task reminder fallback to first message**

```
WHO:   As the Orchestrator
GIVEN: A Pattern A resume is triggered
       and the original task reminder cannot be determined from
       the thread's routing signals or task metadata
WHEN:  I assemble Layer 3
THEN:  The thread's first message is used as the task reminder
       The question and answer are still included verbatim
```

**AT-RPA-04: Verbatim inclusion — no summarization**

```
WHO:   As the Orchestrator
GIVEN: Dev Agent's answer is 500 words of detailed technical analysis
WHEN:  I assemble the Pattern A Context Bundle for PM Agent
THEN:  The answer is included in Layer 3 exactly as written
       No summarization, truncation, or transformation is applied
       to the question or answer
```

### 5.6 Dependencies

- Consumed by: [FSPEC-CB-01] (Layer 3 assembly for Pattern A)

---

## 6. FSPEC-RP-03: Resume Pattern C — Review Loop

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RP-03 |
| **Title** | Resume Pattern C — Review Loop with Turn Cap |
| **Linked Requirements** | [REQ-RP-03], [REQ-RP-04] |

### 6.1 Description

Pattern C governs review threads — structured loops where one agent reviews another agent's artifact. The Context Bundle includes all prior turns verbatim (no summarization needed due to the 4-turn cap). At Turn 3, a final-review instruction is injected forcing the reviewer to either approve or escalate.

### 6.2 Behavioral Flow

```
1. TRIGGER: A message arrives in a review thread
   (identified by routing signal: ROUTE_TO_AGENT in a thread
    with existing review turns)

2. COUNT TURNS in the thread
   a. A "turn" is one agent response (one Skill invocation result)
   b. Human messages and system messages do not count as turns
   c. Count only agent-posted embeds

3. DETERMINE TURN ACTION based on turn count:

   Turn 1 (Reviewer's first review):
   → Standard review. Layer 3 = the artifact to review (verbatim)

   Turn 2 (Author's revision):
   → Author addresses feedback. Layer 3 = Turn 1 review feedback +
     author's current response (verbatim)

   Turn 3 (Reviewer's FINAL review):
   → INJECT FINAL-REVIEW INSTRUCTION into the Context Bundle:
     "This is your second and final review pass. You MUST either:
      (a) Approve with LGTM if the concerns are addressed, or
      (b) Escalate unresolved concerns to the user.
      You may NOT request a third review pass."
   → Layer 3 = All prior turns (1-2) verbatim + current turn +
     final-review instruction

   Turn 4 (Author's final response):
   → Standard response. Layer 3 = All prior turns (1-3) verbatim +
     current turn. The author responds to the final review.

   Turn 5+ (BLOCKED):
   → This is handled by Phase 6 [REQ-RP-05], not Phase 3.
      Phase 3 implementation should be aware that a future guardrail
      will block Turn 5+. Phase 3 does not need to enforce this.

4. ASSEMBLE CONTEXT BUNDLE
   a. Layer 1: Target agent's role prompt + docs/overview.md (standard)
   b. Layer 2: Fresh read of docs/{feature}/ files
   c. Layer 3 (Pattern C):
      - All prior agent turns in the thread, verbatim (max 3)
      - The current triggering turn, verbatim
      - If Turn 3: the final-review instruction (injected by Orchestrator)
   d. No progressive summarization — the 4-turn cap ensures the
      window never grows large enough to need it

5. INVOKE target agent with this Context Bundle (→ FSPEC-SI-01)
```

### 6.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| RPC-R1 | All prior turns are included verbatim — no summarization | The 4-turn cap (max 3 prior turns) keeps the total small enough. Summarization risks losing review feedback detail. |
| RPC-R2 | The final-review instruction is injected at Turn 3 ONLY | Turn 3 is the reviewer's second (and final) review. The instruction forces a decision — LGTM or escalate — preventing unbounded loops. |
| RPC-R3 | The final-review instruction is a system-level injection by the Orchestrator, not part of the Skill response | This ensures the instruction is always present at Turn 3 regardless of what the previous Skill output said. |
| RPC-R4 | Turn counting counts agent-posted embeds only, not human or system messages | Human comments and system messages are not "turns" in the review loop. They provide context but do not count toward the cap. |
| RPC-R5 | Layer 2 is re-read fresh at every turn | Between turns, the author agent may have committed artifact changes. The reviewer must see the latest version. |

### 6.4 Review Loop Lifecycle (Visual)

```
Thread: "auth — review requirements"

Turn 1: PM Agent posts requirements.md      → Routing: ROUTE_TO_AGENT: dev-agent
Turn 2: Dev Agent reviews, provides feedback → Routing: ROUTE_TO_AGENT: pm-agent
Turn 3: PM Agent revises, addresses feedback → Routing: ROUTE_TO_AGENT: dev-agent
         [Orchestrator injects final-review instruction]
Turn 4: Dev Agent either:
         - LGTM → Thread complete
         - ROUTE_TO_USER → Escalate unresolved concerns
         - ROUTE_TO_AGENT → [Phase 6 blocks this at Turn 5]
```

### 6.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Reviewer LGTMs at Turn 2 (first review) | Valid. Thread is complete. No Turn 3 needed. |
| Reviewer escalates to user at Turn 2 | Valid. Thread pauses for user input (Phase 5). |
| Author's revision at Turn 2 routes to a different agent than the original reviewer | Valid — routing follows the signal. The new agent becomes the reviewer for Turn 3+. |
| A review thread has mixed human messages between agent turns | Human messages are included in Layer 3 as context but do not count toward the turn limit. |
| Reviewer at Turn 3 ignores the final-review instruction and requests another review | The routing signal will be ROUTE_TO_AGENT. This is valid in Phase 3 (Turn 4 proceeds). Phase 6 [REQ-RP-05] will block Turn 5. |

### 6.6 Acceptance Tests

**AT-RPC-01: Standard review loop with LGTM**

```
WHO:   As the Orchestrator
GIVEN: A review thread has Turn 1 (author) and Turn 2 (reviewer feedback)
       and the author has posted Turn 3 with revisions
       routing signal targets the reviewer agent
WHEN:  I assemble the Context Bundle for Turn 3
THEN:  Layer 3 contains Turns 1 and 2 verbatim + Turn 3 content
       A final-review instruction is injected
       Layer 2 contains fresh reads of the feature docs
```

**AT-RPC-02: Final-review instruction injection**

```
WHO:   As the Orchestrator
GIVEN: A review thread is at Turn 3 (reviewer's second review)
WHEN:  I assemble the Context Bundle
THEN:  The Context Bundle contains a system instruction stating:
       "This is your second and final review pass. You MUST either
        approve with LGTM or escalate unresolved concerns to the user."
```

**AT-RPC-03: Early LGTM at Turn 2**

```
WHO:   As the Orchestrator
GIVEN: A review thread is at Turn 2
       and the reviewer's routing signal is LGTM
WHEN:  I process the routing signal
THEN:  The thread is marked complete
       A completion embed is posted
       No Turn 3 invocation occurs
```

**AT-RPC-04: Turn counting excludes human messages**

```
WHO:   As the Orchestrator
GIVEN: A review thread has: Turn 1 (agent), human comment, Turn 2 (agent)
WHEN:  I count turns to determine the turn number
THEN:  The count is 2 (not 3)
       The human comment is included in Layer 3 as context
       but does not affect turn numbering
```

**AT-RPC-05: Turn 1 — reviewer's first review Layer 3 content**

```
WHO:   As the Orchestrator
GIVEN: A new review thread has been created
       and the author has posted the initial artifact (Turn 1)
       with routing signal ROUTE_TO_AGENT targeting the reviewer
WHEN:  I assemble the Context Bundle for the reviewer (Turn 1)
THEN:  Layer 3 contains the artifact to review (Turn 1 content) verbatim
       No final-review instruction is injected
       No prior turns exist to include
```

**AT-RPC-06: Turn 2 — author's revision Layer 3 content**

```
WHO:   As the Orchestrator
GIVEN: A review thread has Turn 1 (author's artifact)
       and the reviewer has posted Turn 2 with feedback
       with routing signal ROUTE_TO_AGENT targeting the author
WHEN:  I assemble the Context Bundle for the author
THEN:  Layer 3 contains Turn 1 verbatim + Turn 2 feedback verbatim
       No final-review instruction is injected
       Layer 2 is read fresh from docs/{feature}/
```

**AT-RPC-07: Turn 4 — author's final response includes all prior turns**

```
WHO:   As the Orchestrator
GIVEN: A review thread has Turns 1-3 completed
       and the reviewer has posted Turn 3 with final review feedback
       with routing signal ROUTE_TO_AGENT targeting the author
WHEN:  I assemble the Context Bundle for the author (Turn 4)
THEN:  Layer 3 contains Turns 1, 2, and 3 verbatim + Turn 4 content
       No final-review instruction is injected (injection is Turn 3 only)
```

**AT-RPC-08: Reviewer escalates to user at Turn 2**

```
WHO:   As the Orchestrator
GIVEN: A review thread is at Turn 2 (reviewer's first review)
       and the reviewer's routing signal is ROUTE_TO_USER with a question
WHEN:  I process the routing signal
THEN:  The thread pauses for user input
       The question is queued for user question handling (Phase 5)
       No Turn 3 invocation occurs
```

**AT-RPC-09: Author routes to different reviewer at Turn 2**

```
WHO:   As the Orchestrator
GIVEN: A review thread started with PM Agent (author) and Dev Agent (reviewer)
       and at Turn 2, Dev Agent's routing signal targets test-agent
       instead of pm-agent
WHEN:  I process the routing signal
THEN:  I route to test-agent as indicated by the signal
       Test Agent becomes the reviewer for Turn 3+
       Routing follows the signal, not thread history assumptions
```

### 6.7 Dependencies

- Consumed by: [FSPEC-CB-01] (Layer 3 assembly for Pattern C)
- Future dependency: Phase 6 [REQ-RP-05] builds on turn counting to block Turn 5+

---

## 7. FSPEC-SI-01: Skill Invocation Lifecycle

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-SI-01 |
| **Title** | Skill Invocation Lifecycle — Stateless Execution with Concurrency |
| **Linked Requirements** | [REQ-SI-01], [REQ-SI-02], [REQ-SI-03], [REQ-SI-04], [REQ-SI-11], [REQ-SI-12], [REQ-NF-01] |

### 7.1 Description

This FSPEC defines the end-to-end lifecycle of a Skill invocation — from Context Bundle handoff to response capture. Skills are stateless: they receive only the Context Bundle, produce text output and/or artifact updates, and include a routing signal. The Orchestrator manages concurrency via per-invocation Git worktrees.

### 7.2 Invocation Mechanism

Each Skill invocation is a **stateless Anthropic API call** (Claude API request). The "Skill" is the combination of system prompt + Context Bundle sent as a single API call:

- **System prompt** = Layer 1 (agent's role prompt + `docs/overview.md`) + two-iteration rule
- **User message** = Layer 2 (feature docs) + Layer 3 (trigger/resume context)
- **Tools enabled** = Filesystem read/write, scoped to the invocation's worktree path

The Skill is NOT a subprocess or in-process function. Concurrency means concurrent API calls. Worktree isolation means each API call's tool use is scoped to its own worktree directory path.

### 7.3 Behavioral Flow

```
1. RECEIVE Context Bundle from FSPEC-CB-01

2. PREPARE INVOCATION ENVIRONMENT
   a. Check for concurrent invocations:
      - If another Skill invocation is in-flight for ANY thread →
        This invocation runs concurrently (not blocked)
      - Each concurrent invocation gets its own Git worktree
   b. Create Git worktree for this invocation:
      - Create a new branch: `ptah/{agent-id}/{thread-id}/{invocation-id}`
        where {invocation-id} is a short unique identifier (engineer
        decides exact format — e.g., timestamp or UUID)
      - Create worktree at a temporary path based on this branch
      - The Skill reads/writes /docs files in its worktree copy
      - The main working tree is untouched during invocation
   c. If this is the ONLY in-flight invocation, a worktree is still
      created for isolation consistency

3. INVOKE SKILL (via Anthropic API call — see §7.2)
   a. The Skill is a stateless API call that receives:
      - The Context Bundle (Layer 1 + Layer 2 + Layer 3)
      - Tool access scoped to its worktree directory
   b. The Skill system prompt includes:
      - The agent's role definition (from Layer 1)
      - The two-iteration rule: "On your second review of any artifact
        you must either approve (LGTM) or escalate unresolved concerns
        to the user. You may not request a third review pass."
   c. The Skill executes and produces output
   d. The entire invocation must complete within 90 seconds [REQ-NF-01]

4. CAPTURE SKILL OUTPUT
   a. The Skill output consists of:
      - A text response (for posting to Discord)
      - Zero or more artifact file changes (in the worktree)
      - A routing signal (mandatory — parsed by FSPEC-RP-01)
   b. If the Skill produces no text response and no artifact changes
      (but includes a routing signal), this is valid — the agent
      may simply route to the next agent
   c. If the Skill produces no routing signal → ERROR (FSPEC-RP-01)

5. POST-INVOCATION PROCESSING
   a. Artifact changes in the worktree are detected but NOT committed
      yet — Phase 4 [REQ-SI-05] handles commits. In Phase 3, artifact
      changes are DISCARDED after detection (see §7.9 Worktree Lifecycle)
   b. The text response is passed to FSPEC-DI-01 for Discord posting
   c. The routing signal is passed to FSPEC-RP-01 for next-agent
      determination
   d. Phase 3 worktree cleanup: see §7.9 Worktree Lifecycle

6. CONCURRENCY MODEL
   a. Independent threads process concurrently — no serialization
   b. Same-thread messages process sequentially — FIFO order
   c. There is no concurrency limit in Phase 3 (Phase 6 may add one).
      Phase 3 is designed for small-team usage with an expected
      operational ceiling of ~5 concurrent invocations. Engineers
      should optimize for 3–5 concurrent worktrees, not 30+.
   d. Each concurrent invocation has its own worktree — no file conflicts
```

### 7.4 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| SI-R1 | Skills are completely stateless — no session, no memory between calls | Statelessness enables worktree isolation, concurrent execution, and crash recovery. The Context Bundle is the single source of truth. |
| SI-R2 | Skills never access Discord directly — no MCP calls | The Orchestrator owns all Discord I/O. If Skills accessed Discord, their context windows would bloat with raw API payloads and cold restarts would be expensive. |
| SI-R3 | Every Skill system prompt must include the two-iteration rule verbatim | This is a defense-in-depth measure alongside the Orchestrator's Turn 3 injection (FSPEC-RP-03). Even if the Orchestrator's injection fails, the Skill itself knows the rule. |
| SI-R4 | Each invocation gets its own Git worktree, even if it's the only one running | Consistency simplifies the code path — no special case for "am I the only invocation." |
| SI-R5 | Invocations must complete within 90 seconds | Prevents hung Skills from blocking thread processing. This is the end-to-end time from invocation start to output capture. |
| SI-R6 | Concurrent invocations are for independent threads only; same-thread messages are sequential | Two agents cannot work on the same thread simultaneously — their outputs would conflict. |
| SI-R7 | Worktree branch naming convention: `ptah/{agent-id}/{thread-id}/{invocation-id}` where `{invocation-id}` is a short unique identifier (engineer decides format — e.g., timestamp or UUID) | Enables easy identification of which agent, thread, and invocation a worktree belongs to. The invocation ID prevents branch collisions when the same agent is re-invoked on the same thread (e.g., during Pattern C review loops). |
| SI-R8 | In Phase 3, worktrees are cleaned up (directory removed, branch deleted) after every invocation — on success, timeout, and error. Artifact changes are discarded. Phase 4 [REQ-SI-13] adds commit-before-cleanup. | Prevents worktree accumulation. Phase 3 proves the routing loop works; artifact persistence comes in Phase 4. |
| SI-R9 | On startup, the Orchestrator prunes any orphaned worktrees matching the `ptah/` branch prefix. This is best-effort cleanup for crash recovery, not a state-recovery mechanism. | Crashes during Phase 3 may leave dangling worktrees. Pruning on startup prevents disk accumulation and branch pollution across restarts. |

### 7.5 Skill Output Format

A Skill invocation produces:

| Output Component | Required? | Description |
|-----------------|-----------|-------------|
| Text response | No (but typical) | Plain text to be posted to Discord as an embed |
| Artifact changes | No | Modified files in the worktree's `/docs/{feature}/` |
| Routing signal | **Yes (mandatory)** | One of: ROUTE_TO_AGENT, ROUTE_TO_USER, LGTM, TASK_COMPLETE |

At minimum, a Skill must produce a routing signal. A response with only a routing signal (no text, no artifacts) is valid.

### 7.6 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill invocation exceeds 90 seconds | Terminate the invocation. Post a timeout error embed to the thread. Log to `#agent-debug`. The thread is stalled. |
| Skill produces artifact changes outside `/docs` | Ignore non-`/docs` changes. Only `/docs` artifact changes are tracked. Log a warning. |
| Two concurrent invocations for the same agent (e.g., dev-agent in two different threads) | Valid. Each gets its own worktree. Agent ID is reused but thread IDs differ, so branches are unique. |
| Worktree creation fails (e.g., disk space, Git error) | Post error embed to thread. Do not invoke Skill. Log to `#agent-debug`. |
| Skill modifies files in Layer 1 (e.g., `docs/overview.md`, `ptah/skills/*.md`) | These changes are captured in the worktree. The Orchestrator should flag this as unusual — Layer 1 files are generally stable. Log a warning but allow the change. |
| Skill response text exceeds Discord's message length limit (2000 chars) | Split into multiple embeds. Post sequentially. Routing signal is attached to the final embed. |

### 7.7 Error Scenarios

| Error | Behavior |
|-------|----------|
| Skill process crashes / throws unhandled error | Capture the error. Post error embed to thread. Log to `#agent-debug`. In Phase 3, no retry (Phase 6 adds retry). |
| Worktree creation fails | Post error embed. Log to `#agent-debug`. Do not invoke Skill. |
| Skill invocation timeout (>90s) | Terminate. Post timeout error embed. Log to `#agent-debug`. |
| Anthropic API rate limit / quota error | Post error embed with "API rate limited" detail. Log. In Phase 3, no retry (Phase 6 adds retry with backoff). |

### 7.8 Acceptance Tests

**AT-SI-01: Standard stateless invocation**

```
WHO:   As the Orchestrator
GIVEN: A Context Bundle is assembled for dev-agent
       and a Git worktree is created at a temporary path
WHEN:  I invoke the dev-agent Skill
THEN:  The Skill receives only the Context Bundle
       The Skill reads/writes files in its worktree
       The Skill makes no Discord MCP calls
       The Skill output contains a text response and a routing signal
```

**AT-SI-02: Concurrent invocations for independent threads**

```
WHO:   As the Orchestrator
GIVEN: Thread A ("auth — review") triggers dev-agent invocation
       and Thread B ("payments — review") triggers test-agent invocation
       simultaneously
WHEN:  I process both messages
THEN:  Both Skills are invoked concurrently
       Each gets its own Git worktree
       Neither blocks the other
       Worktree branches follow `ptah/{agent-id}/{thread-id}/{invocation-id}`
       convention (e.g., `ptah/dev-agent/{threadA-id}/{uuid}` and
       `ptah/test-agent/{threadB-id}/{uuid}`)
```

**AT-SI-03: Sequential processing within same thread**

```
WHO:   As the Orchestrator
GIVEN: Two messages arrive in the same thread
WHEN:  I process them
THEN:  The first message is processed to completion
       before the second message is processed
       They are NOT invoked concurrently
```

**AT-SI-04: Invocation timeout**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation has been running for over 90 seconds
WHEN:  The timeout is reached
THEN:  The invocation is terminated
       An error embed is posted to the thread
       The event is logged to #agent-debug
```

**AT-SI-05: Two-iteration rule in Skill prompt**

```
WHO:   As a Skill author
GIVEN: I am defining the system prompt for any reviewing agent
WHEN:  The prompt is loaded for invocation
THEN:  It contains the verbatim instruction: "On your second review
       of any artifact you must either approve (LGTM) or escalate
       unresolved concerns to the user. You may not request a third
       review pass."
```

**AT-SI-06: Worktree creation failure**

```
WHO:   As the Orchestrator
GIVEN: A Context Bundle is assembled for dev-agent
       and Git worktree creation fails (e.g., disk space, Git error)
WHEN:  I attempt to prepare the invocation environment
THEN:  I do not invoke the Skill
       I post an error embed to the thread
       I log to #agent-debug with the worktree creation error details
```

**AT-SI-07: Skill process crash with unhandled error**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation is in progress
       and the Skill process throws an unhandled error
WHEN:  The error is caught
THEN:  The error is captured
       An error embed is posted to the thread with error details
       The event is logged to #agent-debug
       No retry is attempted (Phase 3 — Phase 6 adds retry)
       The thread is stalled until human intervention
```

**AT-SI-08: Worktree branch naming convention**

```
WHO:   As the Orchestrator
GIVEN: dev-agent is invoked for thread with ID "abc123"
WHEN:  I create the Git worktree
THEN:  The worktree branch is named `ptah/dev-agent/abc123/{invocation-id}`
       following the convention `ptah/{agent-id}/{thread-id}/{invocation-id}`
       where {invocation-id} is a unique identifier for this invocation
```

**AT-SI-09: Skill artifact changes outside /docs are ignored**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes
       and the Skill has modified files both in `/docs/auth/` and
       in `/src/utils/helper.ts` within its worktree
WHEN:  I capture the Skill output
THEN:  Only `/docs/auth/` changes are tracked as artifact changes
       Changes to `/src/utils/helper.ts` are ignored
       A warning is logged about non-/docs changes
```

**AT-SI-10: Valid output with routing signal only (no text, no artifacts)**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes
       and the Skill produced no text response and no artifact changes
       but includes a valid ROUTE_TO_AGENT routing signal
WHEN:  I capture the Skill output
THEN:  The output is treated as valid
       The routing signal is processed normally
       A minimal embed is posted to Discord (via FSPEC-DI-01)
```

**AT-SI-11: Anthropic API rate limit error**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation fails due to Anthropic API rate limiting
WHEN:  I capture the error
THEN:  An error embed is posted to the thread with "API rate limited" detail
       The event is logged to #agent-debug
       No retry is attempted in Phase 3 (Phase 6 adds retry with backoff)
```

**AT-SI-12: Skill modifies Layer 1 files (warning but allowed)**

```
WHO:   As the Orchestrator
GIVEN: A Skill invocation completes
       and the Skill has modified `docs/overview.md` (a Layer 1 file)
       in its worktree
WHEN:  I capture the Skill output
THEN:  The change is captured in the worktree
       A warning is logged flagging this as unusual (Layer 1 files are
       generally stable)
       The change is allowed — not rejected
```

### 7.9 Worktree Lifecycle in Phase 3

Phase 3 creates worktrees for isolation but does NOT commit or merge artifact changes (that is Phase 4's responsibility per [REQ-SI-05] and [REQ-SI-13]). This section defines what happens to worktrees in Phase 3 across all completion paths.

| Completion Path | Worktree Behavior |
|----------------|-------------------|
| **(a) Successful invocation** | Artifact changes are detected and logged but **discarded**. Worktree directory is removed. Branch is deleted. Phase 3 proves the routing loop works; artifact persistence comes in Phase 4. |
| **(b) Timeout (>90s)** | Invocation is terminated. Worktree directory is removed. Branch is deleted. Error embed posted to thread. |
| **(c) Skill crash / unhandled error** | Error is captured. Worktree directory is removed. Branch is deleted. Error embed posted to thread. No partial artifacts are preserved. |
| **(d) Process crash** | Worktree and branch are orphaned on disk. On next startup, the Orchestrator prunes all worktrees matching the `ptah/` branch prefix (SI-R9). This is best-effort — not a state-recovery mechanism. |
| **(e) Process restart (graceful)** | Same as (d). The startup pruning routine runs before the Orchestrator begins accepting new messages. |

**Key design decision:** In Phase 3, artifact changes are intentionally discarded. The Skill's text response (posted to Discord) and routing signal are the only durable outputs. This is acceptable because Phase 3's purpose is to prove the end-to-end routing loop. Phase 4 adds `commit → merge → cleanup` to make artifact changes persistent.

### 7.10 Dependencies

- Depends on: [FSPEC-CB-01] (receives Context Bundle)
- Depends on: [FSPEC-RP-01] (routing signal parsed from output)
- Feeds into: [FSPEC-DI-01] (text response posted to Discord)
- Future: Phase 4 [REQ-SI-05], [REQ-SI-13] handle commit + worktree merge

---

## 8. FSPEC-DI-01: Discord Response Posting

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-DI-01 |
| **Title** | Discord Response Posting — Embeds and Thread Creation |
| **Linked Requirements** | [REQ-DI-04], [REQ-DI-05], [REQ-NF-07] |

### 8.1 Description

After a Skill invocation completes, the Orchestrator posts the response to Discord as a colour-coded embed and optionally creates new threads for follow-on coordination tasks. All Discord content is platform-agnostic — no Discord IDs or thread links appear in repository files.

### 8.2 Behavoral Flow

```
1. RECEIVE Skill output (text response + routing signal) from FSPEC-SI-01

2. POST RESPONSE AS COLOUR-CODED EMBED
   a. Determine the embed colour based on the responding agent:
      - PM Agent:       Blue   (#1F4E79)
      - Dev Agent:      Amber  (#E65100)
      - Frontend Agent: Purple (#6A1B9A)
      - Test Agent:     Green  (#1B5E20)
      - System:         Gray   (#9E9E9E)
   b. Format the embed:
      - Title / Author: Agent name (e.g., "Dev Agent")
      - Body: The Skill's text response
      - Colour: As determined above
      - Footer: Optional metadata (e.g., turn number, token usage)
   c. Post the embed to the originating Discord thread

3. HANDLE LONG RESPONSES
   a. If the text response exceeds Discord's embed character limit:
      - Split into multiple sequential embeds
      - Maintain the same colour and agent label across all parts
      - Number the parts (e.g., "Dev Agent (1/3)", "Dev Agent (2/3)")
   b. The routing signal is associated with the final embed

4. CREATE NEW THREAD (if routing signal indicates a new coordination task)
   a. When a Skill response contains a ROUTE_TO_AGENT signal AND
      the response indicates a new coordination task (not a reply
      in the current thread):
      - Create a new thread in #agent-updates
      - Thread name: `{feature} — {brief description}`
      - Post the initial message in the new thread
   b. When the routing signal indicates a reply in the current thread:
      - Do NOT create a new thread
      - Post the response in the existing thread

5. PORTABILITY RULE
   a. NEVER write Discord message IDs, thread IDs, or Discord links
      into any /docs file or Git-tracked content
   b. Discord-specific identifiers exist only in memory and logs
   c. This ensures /docs content is portable to other platforms
```

### 8.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| DI-R1 | Each agent has a unique, fixed embed colour | Visual differentiation in Discord threads. Users can instantly identify which agent posted. |
| DI-R2 | System messages use Gray (#9E9E9E) | Distinguish system posts (errors, turn limits, splits) from agent responses. |
| DI-R3 | Thread naming follows `{feature} — {description}` convention | Enables automatic feature folder mapping in context assembly (FSPEC-CB-01). |
| DI-R4 | No Discord-specific identifiers in `/docs` files | Portability requirement. If the project migrates away from Discord, repo content is unaffected. |
| DI-R5 | New threads are created only when the Skill response initiates a new coordination task | Replies to existing conversations stay in the current thread. New tasks (e.g., "now review the spec") get their own thread for clean separation. |

### 8.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill response is empty text but has a valid routing signal | Post a minimal embed with "No response text" and the routing signal. Process the signal normally. |
| Embed post fails (Discord API error) | Log error. Retry once. If retry fails, log to `#agent-debug`. The routing signal is still processed — Discord posting failure should not block the pipeline. |
| Thread creation fails (Discord API error) | Log error. Retry once. If retry fails, post the response in the parent channel as a fallback. Log to `#agent-debug`. |
| Agent colour is not defined (e.g., new agent added via extensibility) | Use a default colour (e.g., Medium Gray #757575). Log a warning suggesting the admin configure a colour. |

### 8.5 Error Scenarios

| Error | Behavior |
|-------|----------|
| Discord API rate limit on embed post | Queue the post. Retry after the rate limit window. Log a warning. |
| Discord API error (non-rate-limit) | Retry once. If persistent, log to `#agent-debug`. The routing signal still processes. |
| Thread creation rate limited | Queue and retry. Log a warning. |

### 8.6 Acceptance Tests

**AT-DI-01: Colour-coded embed posting**

```
WHO:   As a developer reading Discord
GIVEN: The Dev Agent has produced a text response
WHEN:  The Orchestrator posts it to the thread
THEN:  The embed uses Amber colour (#E65100)
       The embed author/title shows "Dev Agent"
       The embed body contains the response text
```

**AT-DI-02: New thread creation for coordination task**

```
WHO:   As the Orchestrator
GIVEN: The PM Agent's response contains a ROUTE_TO_AGENT signal
       targeting dev-agent with a new review task
       and the current feature is "auth"
WHEN:  I process the response
THEN:  A new thread is created in #agent-updates
       The thread name follows "{feature} — {description}" convention
       The initial message is posted in the new thread
```

**AT-DI-03: Portability — no Discord IDs in /docs**

```
WHO:   As a system architect
GIVEN: The Orchestrator has been running and processing messages
WHEN:  I grep all /docs files for Discord-specific identifiers
       (message IDs, thread IDs, Discord URLs)
THEN:  Zero matches are found
```

**AT-DI-04: Long response splitting**

```
WHO:   As the Orchestrator
GIVEN: A Skill response exceeds Discord's embed character limit
WHEN:  I post the response
THEN:  The response is split into multiple numbered embeds
       All embeds use the same agent colour
       The routing signal is associated with the final embed
```

**AT-DI-05: Empty text response with valid routing signal**

```
WHO:   As the Orchestrator
GIVEN: A Skill response has no text but includes a valid routing signal
WHEN:  I post the response to Discord
THEN:  A minimal embed is posted with "No response text" as the body
       The embed uses the correct agent colour
       The routing signal is processed normally
```

**AT-DI-06: Embed post failure with retry**

```
WHO:   As the Orchestrator
GIVEN: The Discord API returns an error when posting an embed
WHEN:  The first post attempt fails
THEN:  I retry once
       If the retry succeeds, processing continues normally
       If the retry fails, I log to #agent-debug
       The routing signal is still processed — Discord posting failure
       does not block the routing pipeline
```

**AT-DI-07: Thread creation failure with fallback**

```
WHO:   As the Orchestrator
GIVEN: A new coordination task requires a new thread
       and the Discord API returns an error on thread creation
WHEN:  I attempt to create the thread
THEN:  I retry once
       If the retry fails, I post the response in the parent channel
       as a fallback
       I log to #agent-debug
```

**AT-DI-08: System messages use Gray colour**

```
WHO:   As a developer reading Discord
GIVEN: The Orchestrator posts a system message (e.g., error embed,
       turn limit warning, task split notification)
WHEN:  The message appears in the thread
THEN:  The embed uses Gray colour (#9E9E9E)
       The embed is visually distinct from agent responses
```

**AT-DI-09: Undefined agent colour uses default**

```
WHO:   As the Orchestrator
GIVEN: A new agent "security-agent" has been added to ptah.config.json
       but no embed colour is configured for it
WHEN:  I post the agent's response as an embed
THEN:  The embed uses a default colour (Medium Gray #757575)
       A warning is logged suggesting the admin configure a colour
```

**AT-DI-10: Discord API rate limit on embed post**

```
WHO:   As the Orchestrator
GIVEN: The Discord API returns a rate limit response when posting an embed
WHEN:  I encounter the rate limit
THEN:  I queue the post
       I retry after the rate limit window expires
       A warning is logged
       The routing pipeline is not blocked
```

### 8.7 Dependencies

- Depends on: [FSPEC-SI-01] (receives Skill output)
- Depends on: Phase 2 Discord connection (posting infrastructure)

---

## 9. End-to-End Flow Summary

The complete Phase 3 message processing flow:

```
Message arrives in #agent-updates thread
  │
  ├─ Is it our own message? → IGNORE
  │
  ├─ Human message → Identify target agent
  │                    │
  │                    ▼
  │            ┌─────────────────┐
  │            │ FSPEC-RP-01     │
  │            │ Routing Decision│
  │            └────────┬────────┘
  │                     │
  ├─ Skill response ────┘
  │   Parse routing signal
  │     │
  │     ├─ ROUTE_TO_AGENT ─────┐
  │     ├─ ROUTE_TO_USER ──────┤ (Phase 5)
  │     ├─ LGTM ──────────────┤ → Post completion embed
  │     ├─ TASK_COMPLETE ──────┤ → Post completion embed
  │     └─ ERROR ──────────────┤ → Post error embed
  │                            │
  │     ROUTE_TO_AGENT:        │
  │     Identify target agent  │
  │            │               │
  │            ▼               │
  │   ┌─────────────────┐     │
  │   │ FSPEC-CB-01      │     │
  │   │ Context Assembly │     │
  │   │                  │     │
  │   │ Determine pattern│     │
  │   │ ├─ Fresh → std   │     │
  │   │ ├─ Pattern A     │     │
  │   │ └─ Pattern C     │     │
  │   │                  │     │
  │   │ Assemble L1+L2+L3│     │
  │   │ Enforce budget   │     │
  │   └────────┬─────────┘     │
  │            │               │
  │            ▼               │
  │   ┌─────────────────┐     │
  │   │ FSPEC-SI-01      │     │
  │   │ Skill Invocation │     │
  │   │                  │     │
  │   │ Create worktree  │     │
  │   │ Invoke Skill     │     │
  │   │ Capture output   │     │
  │   └────────┬─────────┘     │
  │            │               │
  │            ▼               │
  │   ┌─────────────────┐     │
  │   │ FSPEC-DI-01      │     │
  │   │ Discord Posting  │     │
  │   │                  │     │
  │   │ Post embed       │     │
  │   │ Create thread    │     │
  │   │ (if needed)      │     │
  │   └────────┬─────────┘     │
  │            │               │
  │            ▼               │
  │   Loop back to routing ────┘
  │   (next response triggers
  │    another cycle)
  │
  └─ End
```

### 9.1 End-to-End Acceptance Test

**AT-E2E-01: Complete message → response loop**

```
WHO:   As the Orchestrator
GIVEN: A human posts a message with @Dev Agent mention and
       "review the requirements" in thread "auth — review requirements"
       and `ptah/skills/dev-agent.md` exists
       and `docs/overview.md` exists
       and `docs/auth/requirements.md` exists
WHEN:  I process the complete pipeline
THEN:  1. The message is detected and classified as a human message (FSPEC-RP-01)
       2. "dev-agent" is identified as the target agent
       3. The Context Bundle is assembled (FSPEC-CB-01):
          - Layer 1: dev-agent role prompt + overview.md
          - Layer 2: fresh read of docs/auth/requirements.md
          - Layer 3: the human message verbatim
       4. A Git worktree is created at ptah/dev-agent/{thread-id}/{invocation-id} (FSPEC-SI-01)
       5. The Skill is invoked with the Context Bundle
       6. The Skill response (text + routing signal) is captured
       7. The response is posted as an Amber (#E65100) embed (FSPEC-DI-01)
       8. The routing signal is parsed for the next cycle
       The entire flow completes within 90 seconds
```

---

## 10. Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| ~~OQ-FSPEC-01~~ | ~~What colour should the Frontend Agent's embed be?~~ | **Resolved (v1.3):** Option A adopted. Frontend Agent embed colour is **Purple (#6A1B9A)** for maximum visual distinction from existing colours (Blue, Amber, Green, Gray). Updated in §8.2 Behavioral Flow. | Resolved — no longer open. |
| ~~OQ-FSPEC-02~~ | ~~How does the Orchestrator distinguish "new coordination task" from "reply in current thread"?~~ | **Resolved (v1.1):** Option B adopted. The `ROUTE_TO_AGENT` signal includes a `thread_action` field (`"reply"` or `"new_thread"`, default `"reply"`). See §4.4 Routing Signal Format. | Resolved — no longer open. |

---

## 11. Traceability Summary

| FSPEC | Linked Requirements | Domain |
|-------|--------------------|--------|
| FSPEC-CB-01 | REQ-CB-01, REQ-CB-02, REQ-CB-03, REQ-CB-04, REQ-CB-05, REQ-CB-06, REQ-NF-04 | Context Bundle |
| FSPEC-RP-01 | REQ-DI-09, REQ-SI-04 | Routing |
| FSPEC-RP-02 | REQ-RP-01 | Resume Pattern A |
| FSPEC-RP-03 | REQ-RP-03, REQ-RP-04 | Resume Pattern C |
| FSPEC-SI-01 | REQ-SI-01, REQ-SI-02, REQ-SI-03, REQ-SI-11, REQ-SI-12, REQ-NF-01 | Skill Invocation |
| FSPEC-DI-01 | REQ-DI-04, REQ-DI-05, REQ-NF-07 | Discord I/O |

---

## 12. Quality Checklist

### 12.1 Functional Specification Completeness

- [x] Every FSPEC has a unique ID following `FSPEC-{DOMAIN}-{NUMBER}` — 6 FSPECs: CB-01, RP-01, RP-02, RP-03, SI-01, DI-01
- [x] Every FSPEC links to at least one requirement (`REQ-XX-XX`) — 21 requirements mapped across 6 FSPECs (§2.1)
- [x] Behavioral flows cover all decision branches — routing decision tree (§4), context assembly (§3), review loop (§6), skill invocation (§7), response posting (§8)
- [x] Business rules are explicit and testable — 39 business rules across all FSPECs (CB-R1–R7, RP-R1–R7, SI-R1–R9, DI-R1–R6, plus review loop rules)
- [x] Edge cases and error scenarios are documented — API failures, token overflow, orphaned worktrees, malformed signals, concurrent invocations
- [x] Acceptance tests are in Who/Given/When/Then format — 62 acceptance tests across all 6 FSPECs
- [x] No technical implementation details are prescribed — engineers have freedom to design the technical solution
- [x] Open questions are flagged clearly for user review — OQ-FSPEC-01 resolved (Purple #6A1B9A, v1.3), OQ-FSPEC-02 resolved (v1.1)

### 12.2 Cross-Skill Reviews

- [x] Cross-skill review: backend-engineer review completed and feedback addressed (v1.1) — F-01 through F-07, Q-01 through Q-03 resolved; added §7.2, §7.9, SI-R7/R8/R9, RP-R7, CB-R7, thread_action field
- [x] Cross-skill review: test-engineer review completed (v1.2) — 38 acceptance tests added, total 62 ATs
- [x] Cross-skill review: product-manager review of v1.2 completed — approved with minor changes
- [x] AT-RP-08 GIVEN clause updated (v1.2.1) — now uses Discord @mention syntax to align with FSPEC-RP-01 Step 3a @mention-only detection. Also updated AT-RP-09 and AT-E2E-01 for consistency.

### 12.3 Traceability

- [x] Traceability matrix updated with REQ → FSPEC mappings for all 21 Phase 3 requirements (v1.4)
- [x] No orphaned requirements — all 21 Phase 3 REQs map to at least one FSPEC
- [x] No orphaned FSPECs — all 6 FSPECs map to at least one REQ

### 12.4 Approval

- [x] OQ-FSPEC-01 resolved (Frontend Agent embed colour = Purple #6A1B9A, v1.3)
- [x] Final user approval — Approved March 9, 2026

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 9, 2026 | Product Manager | Initial functional specification for Phase 3 (Skill Routing). 6 FSPECs covering all 21 Phase 3 requirements. |
| 1.1 | March 9, 2026 | Product Manager | Addressed backend-engineer cross-skill review (F-01 through F-07, Q-01 through Q-03). Added: §7.2 Invocation Mechanism (Q-01), §7.9 Worktree Lifecycle (F-01), SI-R7 invocation-id branch naming (F-03), SI-R8/SI-R9 Phase 3 cleanup and startup pruning (F-01), RP-R7 in-memory queue semantics (F-02), CB-R7 TOCTOU trade-off acknowledgement (F-05), operational ceiling note (F-04), @mention detection clarification (Q-02), `thread_action` routing signal field (Q-03/OQ-FSPEC-02 resolved). |
| 1.2 | March 9, 2026 | Test Engineer | Added 38 acceptance tests across all 6 FSPECs to cover edge cases, error scenarios, business rules, and 1 end-to-end integration test. Total ATs: 24 → 62. |
| 1.3 | March 9, 2026 | Product Manager | Resolved OQ-FSPEC-01: Frontend Agent embed colour = Purple (#6A1B9A). Clarified server role model in §4.2 Step 3a: agents use mentionable Discord server roles (not separate bot users); single bot maps role mentions to agent IDs via `ptah.config.json`. Updated AT-RP-08 and AT-E2E-01 to use @mention syntax. Updated quality checklist (§12). |

---

*End of Document*
