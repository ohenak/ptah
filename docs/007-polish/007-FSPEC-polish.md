# Functional Specification: Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE7 |
| **Parent Document** | [007-REQ-polish](./007-REQ-polish.md) |
| **Version** | 1.0 |
| **Date** | March 15, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 7 (Polish) of Ptah v4.0. Phase 7 delivers two quality-of-life improvements that clean up after completed work and make the system extensible without code changes.

**What Phase 7 delivers:**

1. **Thread Archiving on Resolution** — When a Skill response carries a resolution signal indicating the work in a thread is fully complete, the Orchestrator archives the Discord thread. Archived threads remain readable but are hidden from the active channel view, reducing noise.

2. **Configuration-Driven Agent Extensibility** — A developer can add a fourth (or fifth, etc.) agent to Ptah by writing a new Skill definition, creating a log file, and adding a config entry. No Orchestrator code changes are required.

**Relationship to earlier phases:** Phase 3 defined the routing signal contract ([REQ-SI-04], FSPEC-SI-01) including the `task_done` and `lgtm` signal types. Phase 7 consumes those signals as resolution triggers for archiving. Phase 1 established configuration-driven architecture ([REQ-IN-04]); Phase 7 extends that pattern to cover full agent registration.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-DI-06] | Archive threads on resolution signal | [FSPEC-DI-02] |
| [REQ-NF-08] | Configuration-driven agent extensibility | [FSPEC-EX-01] |

### 2.2 Requirements NOT Requiring FSPECs

Both Phase 7 requirements have sufficient behavioral complexity to warrant functional specification. There are no Phase 7 requirements with trivially obvious behavior.

### 2.3 Phase 3 Behaviors Extended by Phase 7

| Phase 3 Reference | Phase 3 Behavior | Phase 7 Extension |
|-------------------|------------------|-------------------|
| FSPEC-SI-01 — Routing signal parsing | Orchestrator reads the routing signal to determine the next agent to invoke. LGTM and task_done are recognized signal types. Does not specify post-routing archiving. | Phase 7 adds a post-routing step: when the signal type is a resolution signal, the Orchestrator archives the originating thread after all routing actions are complete. |
| Phase 1 config architecture ([REQ-IN-04]) | `ptah.config.json` is the single source of configuration truth. Agent-specific parameters are read from config. Does not define a config schema for agent *registration*. | Phase 7 defines the config schema for registering agents, enabling the Orchestrator to discover and route to new agents without code changes. |

### 2.4 Configuration Keys Used by Phase 7

| Key | Type | Used By |
|-----|------|---------|
| `agents[].id` | string | FSPEC-EX-01 — agent identity |
| `agents[].skill_path` | string | FSPEC-EX-01 — Skill definition file path |
| `agents[].log_file` | string | FSPEC-EX-01 — agent log markdown file path |
| `agents[].mention_id` | string | FSPEC-EX-01 — Discord role or user ID for @mention detection |
| `orchestrator.archive_on_resolution` | boolean | FSPEC-DI-02 — enable/disable thread archiving (default: `true`) |

---

## 3. FSPEC-DI-02: Thread Archiving on Resolution

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-DI-02 |
| **Title** | Thread Archiving on Resolution Signal |
| **Linked Requirements** | [REQ-DI-06] |

### 3.1 Description

When the Orchestrator processes a Skill response that carries a **resolution signal**, it archives the originating Discord thread via Discord MCP. Archiving is the final post-routing action: it happens after the Skill response content has been posted to the thread and after any Git operations (artifact commits) are complete. An archived thread remains readable in Discord but is hidden from the active channel thread list.

Thread archiving is opt-out: it is enabled by default and can be disabled per-deployment via the `orchestrator.archive_on_resolution` config key.

### 3.2 Resolution Signal Definition

A **resolution signal** is a routing signal (as defined in [REQ-SI-04]) whose type indicates that no further agent action is needed in the thread. The following signal types are resolution signals:

| Signal Type | Meaning | Archive? |
|-------------|---------|----------|
| `lgtm` | A reviewer has approved a deliverable without requesting changes. The review loop is complete. | Yes |
| `task_done` with `status: DONE` | A Skill has completed its assigned task and signals no further routing is needed. The PDLC cycle for this thread is complete. | Yes |
| `task_done` with `status: BLOCKED` | A Skill cannot proceed and needs user input. Work is not complete; the thread must stay active. | **No** |
| `route_to` (any target agent) | More work is needed from another agent. | **No** |
| `escalate_to_user` | A question or decision requires user input. | **No** |

**Only `lgtm` and `task_done` with `status: DONE` trigger archiving.** All other signal types leave the thread open.

### 3.3 Behavioral Flow

```
1. Skill response is received by the Orchestrator.
   a. Parse the routing signal from the response.
   b. Post the Skill's response content to the Discord thread (existing behavior).
   c. Execute any artifact commit pipeline steps (Phase 4 behavior — unchanged).

2. Evaluate the routing signal type.
   a. If type is NOT a resolution signal (see §3.2) → proceed with normal routing; stop here.
   b. If type IS a resolution signal → continue to Step 3.

3. Check the archive configuration.
   a. Read `orchestrator.archive_on_resolution` from `ptah.config.json`.
   b. If value is `false` → log "[ptah:orchestrator] Archiving disabled by config — thread {thread_id} left open." and stop.
   c. If value is `true` (or key is absent, defaulting to true) → continue to Step 4.

4. Archive the thread via Discord MCP.
   a. Call the Discord MCP thread-archive operation for the originating thread ID.
   b. If the call succeeds → log "[ptah:orchestrator] Thread {thread_id} archived after resolution signal '{signal_type}'."
   c. If the thread is already archived → log at DEBUG level; treat as success; do not error.
   d. If the call fails (network error, permissions error, API error) → see §3.6 (Error Scenarios).

5. Update in-memory thread state.
   a. Mark the thread as archived in the Orchestrator's active-thread registry.
   b. Future routing events targeting this thread ID are silently dropped (the thread is closed).
```

### 3.4 Business Rules

| Rule | Details |
|------|---------|
| **BR-DI-02-01: Post-content archiving** | Archiving always happens *after* the Skill response content is posted to Discord. The user sees the final message before the thread disappears from the active list. |
| **BR-DI-02-02: Post-commit archiving** | Archiving always happens *after* any artifact commit pipeline has completed. No archiving occurs mid-commit. |
| **BR-DI-02-03: Archiving is non-blocking** | A failure to archive does not fail the routing cycle. The Orchestrator logs the error and continues. The thread is left open rather than in an inconsistent state. |
| **BR-DI-02-04: No re-archiving** | Once a thread is marked archived in the registry, any subsequent resolution signal targeting the same thread ID is a no-op. |
| **BR-DI-02-05: Opt-out is deployment-wide** | `archive_on_resolution: false` disables archiving for all threads, not selectively. Per-thread opt-out is out of scope for Phase 7. |
| **BR-DI-02-06: BLOCKED does not archive** | A `task_done` signal with `status: BLOCKED` explicitly means work is not done. Archiving on BLOCKED would hide a thread that still needs human attention. |

### 3.5 Inputs and Outputs

| | Details |
|-|---------|
| **Input** | Skill response containing a parsed routing signal (signal type + status where applicable) |
| **Input** | Originating thread ID (already tracked by the Orchestrator per existing behavior) |
| **Input** | `ptah.config.json` — `orchestrator.archive_on_resolution` boolean |
| **Output** | Discord thread archived (via Discord MCP) |
| **Output** | Thread registry updated: thread marked archived |
| **Output** | Log entry confirming archiving or skip reason |

### 3.6 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Discord MCP archive call fails with network/API error | Log `[ptah:orchestrator] Warning: failed to archive thread {thread_id} — {error_message}. Thread left open.` Post no error message to the thread. Continue normal operation. |
| Discord MCP returns "Missing Permissions" | Log `[ptah:orchestrator] Warning: insufficient permissions to archive thread {thread_id}. Check bot permissions. Thread left open.` Do not retry. |
| Discord MCP returns "Thread not found" | Log at WARN level. Treat as success (thread is already gone). Update registry. |
| Thread already archived (Discord returns archived state) | Log at DEBUG level. Treat as success. Update registry. |
| Config key `archive_on_resolution` is absent | Default to `true`. Proceed with archiving. |
| Config key `archive_on_resolution` is present but not a boolean | Log `[ptah:orchestrator] Warning: archive_on_resolution config value is not boolean — defaulting to true.` Proceed with archiving. |

### 3.7 Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| A `task_done DONE` signal arrives for a thread that has already been archived | No-op. Registry check (BR-DI-02-04) prevents a second archive call. |
| Multiple concurrent Skill completions both resolve as `DONE` for different threads simultaneously | Each thread's archiving is handled independently. No cross-thread interference. |
| `archive_on_resolution` is `false` and a resolution signal arrives | Thread is left open. No error. Log at DEBUG. |
| A `lgtm` signal arrives in a non-review thread (e.g., a task thread where the Skill approved its own work) | Archive normally — the signal type is the sole trigger, not the thread type. |

### 3.8 Acceptance Tests

**AT-DI-02-01: Basic archiving on `task_done DONE`**
```
WHO:   As the Orchestrator
GIVEN: A thread is active and a Skill response contains a task_done signal with status: DONE
       AND archive_on_resolution is true (default)
WHEN:  I process the Skill response
THEN:  The Skill response content is posted to the thread
       AND the artifact commit pipeline completes
       AND the Discord thread is archived via Discord MCP
       AND the thread is marked archived in the registry
       AND a log entry confirms archiving
```

**AT-DI-02-02: Archiving on `lgtm`**
```
WHO:   As the Orchestrator
GIVEN: A review thread is active and a Skill response contains an lgtm routing signal
       AND archive_on_resolution is true (default)
WHEN:  I process the Skill response
THEN:  The thread is archived after the response content is posted
```

**AT-DI-02-03: No archiving on `task_done BLOCKED`**
```
WHO:   As the Orchestrator
GIVEN: A thread is active and a Skill response contains a task_done signal with status: BLOCKED
WHEN:  I process the Skill response
THEN:  The thread is NOT archived
       AND routing continues normally (escalation to user per existing behavior)
```

**AT-DI-02-04: No archiving when disabled**
```
WHO:   As the Orchestrator
GIVEN: archive_on_resolution is false in ptah.config.json
       AND a Skill response contains a task_done signal with status: DONE
WHEN:  I process the Skill response
THEN:  No Discord MCP archive call is made
       AND a log entry notes that archiving is disabled
```

**AT-DI-02-05: Archiving failure is non-fatal**
```
WHO:   As the Orchestrator
GIVEN: A resolution signal is received for thread {T}
       AND the Discord MCP archive call returns an error
WHEN:  I process the error
THEN:  A warning is logged
       AND the thread is left open (not marked archived)
       AND the Orchestrator continues processing other threads normally
```

**AT-DI-02-06: Ordering — archiving is last**
```
WHO:   As the Orchestrator
GIVEN: A resolution signal is received for thread {T}
WHEN:  I execute the full post-resolution sequence
THEN:  Response content is posted to Discord BEFORE the archive call
       AND any artifact commits complete BEFORE the archive call
```

---

## 4. FSPEC-EX-01: Configuration-Driven Agent Extensibility

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-EX-01 |
| **Title** | Configuration-Driven Agent Extensibility |
| **Linked Requirements** | [REQ-NF-08] |

### 4.1 Description

The Orchestrator discovers agents entirely from `ptah.config.json` at startup. Adding a new agent requires three steps — all outside the Orchestrator's codebase — and zero code changes:

1. **Write a Skill definition** — a markdown file in the `skills/` directory that the Orchestrator passes as a system prompt when invoking the agent.
2. **Create a log file** — an empty or stub markdown file in `agent-logs/` that the Orchestrator appends responses to.
3. **Add a config entry** — one new object in the `agents` array in `ptah.config.json`.

The Orchestrator reads the `agents` array at startup, validates each entry, and makes each registered agent available for @mention routing and routing-signal-based invocation. No restart is needed if the config is reloaded (Phase 1 established hot-reload for config; this FSPEC does not change that behavior).

### 4.2 Agent Config Schema

Each entry in the `agents` array in `ptah.config.json` must contain the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique machine-readable identifier for the agent (e.g., `"backend-engineer"`, `"security-agent"`). Used in routing signal `route_to` values and log output. Must be lowercase alphanumeric with hyphens. No spaces. |
| `skill_path` | string | Yes | Relative path from the project root to the Skill definition markdown file (e.g., `"skills/backend-engineer.md"`). |
| `log_file` | string | Yes | Relative path from the project root to the agent's log markdown file (e.g., `"agent-logs/backend-engineer.md"`). |
| `mention_id` | string | Yes | Discord role ID or user ID used to detect @mentions targeting this agent in incoming messages (e.g., `"1234567890123456789"`). |
| `display_name` | string | No | Human-readable name shown in log messages and Discord embeds (e.g., `"Backend Engineer"`). Defaults to `id` if absent. |

**Example config entry:**
```json
{
  "id": "security-agent",
  "skill_path": "skills/security-agent.md",
  "log_file": "agent-logs/security-agent.md",
  "mention_id": "9876543210987654321",
  "display_name": "Security Agent"
}
```

### 4.3 Orchestrator Startup Behavior

```
1. Read ptah.config.json.
   a. Parse the agents array.
   b. If agents array is absent or empty → log a warning and continue (the Orchestrator
      can run without agents, though it will not route any messages).

2. For each agent entry in the agents array:
   a. Validate required fields (id, skill_path, log_file, mention_id).
      - If any required field is missing → log validation error (see §4.6) and SKIP this agent.
        Do not halt startup; continue with remaining agents.
   b. Validate id format: lowercase alphanumeric + hyphens, no spaces, non-empty.
      - If invalid → log validation error and skip this agent.
   c. Validate skill_path: file must exist and be readable.
      - If file does not exist → log error and skip this agent.
   d. Validate log_file: file must exist (may be empty).
      - If file does not exist → log error and skip this agent.
   e. Validate mention_id: must be a non-empty string of digits (Discord snowflake format).
      - If invalid → log error and skip this agent.
   f. Register the agent in the Orchestrator's in-memory agent registry:
      { id, skill_path, log_file, mention_id, display_name (or id if absent) }

3. After processing all entries:
   a. Log the count of successfully registered agents:
      "[ptah:orchestrator] {N} agent(s) registered: {id1}, {id2}, ..."
   b. If zero agents were registered (all skipped due to errors) → log a warning.
      The Orchestrator starts but will not route messages to any agent.
```

### 4.4 Runtime Routing Behavior

The agent registry built at startup drives all routing at runtime. No hardcoded agent IDs exist in the Orchestrator:

| Routing Event | Behavior |
|---------------|----------|
| Incoming Discord message with @mention matching a registered agent's `mention_id` | Invoke the matched agent's Skill using its `skill_path`. |
| Routing signal `route_to: {agent_id}` where `agent_id` matches a registered agent | Invoke that agent's Skill. |
| Routing signal `route_to: {agent_id}` where `agent_id` does NOT match any registered agent | Log `[ptah:orchestrator] Error: routing signal targets unknown agent '{agent_id}'. No registered agent with that ID. Thread {thread_id} left waiting.` Post a system error message to the thread. Do not crash. |
| @mention matching no registered agent's `mention_id` | Ignore (existing behavior — not all @mentions target Ptah agents). |

### 4.5 Adding a New Agent: Complete Checklist

This is the canonical developer checklist for adding a new agent. It requires **zero Orchestrator code changes**.

1. **Create the Skill definition file:** `skills/{new-agent-id}.md`
   - Follow the Skill definition format established by existing agents.
   - Must include a system prompt that defines the agent's role, capabilities, and response contract.

2. **Create the log file:** `agent-logs/{new-agent-id}.md`
   - Can be empty or contain a stub header.
   - The Orchestrator appends responses here during operation.

3. **Add a config entry** to the `agents` array in `ptah.config.json`:
   ```json
   {
     "id": "{new-agent-id}",
     "skill_path": "skills/{new-agent-id}.md",
     "log_file": "agent-logs/{new-agent-id}.md",
     "mention_id": "{discord-role-or-user-id}",
     "display_name": "{Human Readable Name}"
   }
   ```

4. **Register the Discord role or user** if using a role-based @mention (done in the Discord server settings, not in code).

5. **Restart Ptah** (or wait for config hot-reload) to pick up the new agent.

### 4.6 Business Rules

| Rule | Details |
|------|---------|
| **BR-EX-01-01: Config is sole source of truth** | Agent identity, skill location, and log file location are determined entirely from `ptah.config.json`. No agent data is hardcoded in the Orchestrator. |
| **BR-EX-01-02: Invalid entries are skipped, not fatal** | A malformed agent entry does not prevent the Orchestrator from starting. It is logged and skipped. Other agents in the config are unaffected. |
| **BR-EX-01-03: IDs must be unique** | If two entries in the `agents` array share the same `id`, the first one wins and the second is logged as a duplicate and skipped. |
| **BR-EX-01-04: mention_ids must be unique** | If two entries share the same `mention_id`, the first wins and the second is skipped with a log warning. Duplicate mention_ids would cause ambiguous @mention routing. |
| **BR-EX-01-05: Skill file is loaded at invocation time** | The Orchestrator reads the Skill definition file contents at the time of invocation (not at startup), so edits to a Skill file take effect on the next invocation without restarting. |
| **BR-EX-01-06: Log file is not read at startup** | The log file path is validated to exist at startup (to catch config errors early), but its contents are not read at startup. It is appended to at runtime. |

### 4.7 Inputs and Outputs

| | Details |
|-|---------|
| **Input** | `ptah.config.json` — `agents` array |
| **Input** | Skill definition files at the paths specified in config |
| **Input** | Log files at the paths specified in config |
| **Output** | In-memory agent registry available to the routing engine |
| **Output** | Startup log confirming registered agents |
| **Output** | Validation error logs for skipped entries |

### 4.8 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `agents` key missing from config | Log `[ptah:orchestrator] Warning: no 'agents' array found in config. Orchestrator will start but cannot route to any agent.` Start normally. |
| Required field missing from an agent entry | Log `[ptah:orchestrator] Error: agent entry at index {i} is missing required field '{field}'. Skipping.` |
| Skill file not found at `skill_path` | Log `[ptah:orchestrator] Error: skill file not found for agent '{id}': {path}. Skipping agent.` |
| Log file not found at `log_file` | Log `[ptah:orchestrator] Error: log file not found for agent '{id}': {path}. Skipping agent.` |
| Duplicate `id` in agents array | Log `[ptah:orchestrator] Warning: duplicate agent id '{id}' at index {i}. First registration wins; skipping duplicate.` |
| Duplicate `mention_id` in agents array | Log `[ptah:orchestrator] Warning: duplicate mention_id '{mention_id}' for agent '{id}' at index {i}. First registration wins; skipping duplicate.` |
| `route_to` signal targets an unregistered agent ID | Log error. Post system error message to thread. Do not crash. (See §4.4.) |

### 4.9 Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| `agents` array is present but empty (`[]`) | Zero agents registered. Orchestrator starts. Warning logged. |
| `display_name` field is absent | `display_name` defaults to `id`. No error. |
| Config is hot-reloaded and a new agent entry is added | New agent is registered in the live registry. Immediately available for routing. (Hot-reload behavior is Phase 1 scope — this FSPEC does not change it.) |
| Config is hot-reloaded and an existing agent entry is removed | Agent is de-registered from the live registry. Any in-flight invocation for that agent completes normally; future routing signals targeting that agent ID are treated as unknown-agent errors. |
| An existing agent's `skill_path` is changed in config and config is hot-reloaded | Next invocation of that agent reads the new Skill file. In-flight invocations are unaffected. |

### 4.10 Acceptance Tests

**AT-EX-01-01: Registering a new agent with zero code changes**
```
WHO:   As a developer
GIVEN: ptah.config.json does not contain an entry for "security-agent"
       AND I create skills/security-agent.md with a valid Skill definition
       AND I create agent-logs/security-agent.md (empty)
       AND I add a valid config entry for "security-agent" to ptah.config.json
WHEN:  Ptah restarts (or hot-reloads the config)
THEN:  The Orchestrator logs "security-agent registered"
       AND routing signals with route_to: security-agent are resolved correctly
       AND @mentions matching the configured mention_id are routed to the new agent
       AND no Orchestrator source code was modified
```

**AT-EX-01-02: Startup validation — missing field**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains an agent entry missing the "log_file" field
WHEN:  The Orchestrator starts
THEN:  The invalid entry is skipped with a log error
       AND all other valid agent entries are registered normally
       AND the Orchestrator starts without crashing
```

**AT-EX-01-03: Startup validation — skill file not found**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains an agent entry where skill_path points to a non-existent file
WHEN:  The Orchestrator starts
THEN:  That agent entry is skipped with a log error naming the missing file
       AND other valid agents are registered
       AND the Orchestrator starts normally
```

**AT-EX-01-04: Unknown agent routing signal**
```
WHO:   As the Orchestrator
GIVEN: A Skill response contains route_to: "unknown-agent"
       AND no agent with id "unknown-agent" is registered
WHEN:  I process the routing signal
THEN:  An error is logged
       AND a system error message is posted to the originating thread
       AND the Orchestrator does not crash
```

**AT-EX-01-05: Duplicate agent ID**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains two agent entries with the same id "backend-engineer"
WHEN:  The Orchestrator starts
THEN:  The first entry is registered
       AND the second entry is skipped with a duplicate-ID warning
       AND the registered agent behaves as configured by the first entry
```

---

## 5. Open Questions

| # | Question | Impact | Resolution |
|---|----------|--------|------------|
| OQ-07-01 | Should `lgtm` archiving apply only to review threads (where the PDLC review loop was active) or to any thread where an `lgtm` signal appears? | If a Skill emits `lgtm` in a non-review context, it would archive that thread. May or may not be desired. | **Assumed: `lgtm` archives any thread regardless of thread type.** The signal semantics in REQ-SI-04 define `lgtm` as "the review loop is complete" — which universally means the thread is done. If per-thread-type filtering is needed, flag for Phase 8. |
| OQ-07-02 | Should config hot-reload de-register agents whose entries are removed, or only add new ones? | Removing an agent mid-run could affect in-flight invocations. | **Assumed: hot-reload does both adds and removes.** In-flight invocations for a de-registered agent complete normally. This is consistent with Phase 1 config hot-reload behavior for other keys. Confirm with engineering. |

---

## 6. Dependencies

| Dependency | Type | Details |
|------------|------|---------|
| [FSPEC-SI-01] (Phase 3 — Skill Routing) | Behavioral dependency | Defines routing signal types and the `task_done`/`lgtm` contract that FSPEC-DI-02 consumes. |
| [REQ-DI-01] | Architectural constraint | All Discord I/O (including thread archiving) is performed by the Orchestrator via Discord MCP. Skills do not call Discord MCP directly. |
| [REQ-IN-04] (Phase 1 — Config Architecture) | Foundational dependency | The configuration-driven architecture that FSPEC-EX-01 extends. `ptah.config.json` as the single source of truth is established here. |

---

## 7. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 15, 2026 | Product Manager | Initial draft |

---

*End of Document*
