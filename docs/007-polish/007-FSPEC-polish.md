# Functional Specification: Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE7 |
| **Parent Document** | [007-REQ-polish](./007-REQ-polish.md) |
| **Version** | 2.2 |
| **Date** | March 17, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 7 (Polish) of Ptah v4.0. Phase 7 delivers quality-of-life improvements across six areas: automatic thread archiving on resolution, configuration-driven agent extensibility, Discord embed formatting for Orchestrator messages, error message UX, structured logging, and operator observability.

**What Phase 7 delivers:**

1. **Thread Archiving on Resolution** — When a Skill response carries a resolution signal indicating the work in a thread is fully complete, the Orchestrator archives the Discord thread. Archived threads remain readable but are hidden from the active channel view, reducing noise.

2. **Configuration-Driven Agent Extensibility** — A developer can add a fourth (or fifth, etc.) agent to Ptah by writing a new Skill definition, creating a log file, and adding a config entry. No Orchestrator code changes are required.

3. **Discord Embed Formatting** — Orchestrator-generated system messages (routing notifications, resolution notifications, error reports, user escalations) are posted as rich Discord embeds. Agent-authored response text moves to plain messages.

4. **Error Message UX** — User-facing error messages in Discord are human-readable and include actionable guidance. No stack traces or internal IDs in Discord output.

5. **Structured Log Output** — All Orchestrator log lines use a consistent `[ptah:{component}]` prefix and an explicit log level.

6. **Operator Observability** — The console log stream provides enough structured information to reconstruct the full routing lifecycle for any thread.

**Relationship to earlier phases:** Phase 3 defined the routing signal contract ([REQ-SI-04], FSPEC-SI-01) including `LGTM` and `TASK_COMPLETE` signal types. Phase 7 consumes those signals as resolution triggers for archiving. Phase 1 established configuration-driven architecture ([REQ-IN-04]); Phase 7 extends that pattern to cover full agent registration.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-DI-06] | Archive threads on resolution signal | [FSPEC-DI-02] |
| [REQ-NF-08] | Configuration-driven agent extensibility | [FSPEC-EX-01] |
| [REQ-DI-10] | Discord embed formatting for Orchestrator messages | [FSPEC-DI-03] |
| [REQ-RP-06] | Error message UX | [FSPEC-RP-01] |
| [REQ-NF-09] | Structured log output | [FSPEC-LG-01] |
| [REQ-NF-10] | Operator observability | [FSPEC-OB-01] |

### 2.2 Phase 3 Behaviors Extended by Phase 7

| Phase 3 Reference | Phase 3 Behavior | Phase 7 Extension |
|-------------------|------------------|-------------------|
| FSPEC-SI-01 — Routing signal parsing | Orchestrator reads the routing signal to determine the next agent to invoke. `LGTM` and `TASK_COMPLETE` are recognized signal types. Does not specify post-routing archiving. | Phase 7 adds a post-routing step: when the signal type is a resolution signal, the Orchestrator archives the originating thread after all routing actions are complete. |
| Phase 1 config architecture ([REQ-IN-04]) | `ptah.config.json` is the single source of configuration truth. Agent-specific parameters are read from config. Does not define a config schema for agent *registration*. | Phase 7 defines the config schema for registering agents, enabling the Orchestrator to discover and route to new agents without code changes. |

### 2.3 Configuration Keys Used by Phase 7

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
| `LGTM` | A reviewer has approved a deliverable without requesting changes. The review loop is complete. | Yes |
| `TASK_COMPLETE` | A Skill has completed its assigned task and signals no further routing is needed. The PDLC cycle for this thread is complete. | Yes |
| `ROUTE_TO_USER` | A Skill cannot proceed and needs user input. Work is not complete; the thread must stay active. | **No** |
| `ROUTE_TO_AGENT` (any target agent) | More work is needed from another agent. | **No** |

**Only `LGTM` and `TASK_COMPLETE` trigger archiving.** All other signal types leave the thread open.

### 3.3 Behavioral Flow

```
1. Skill response is received by the Orchestrator.
   a. Parse the routing signal from the response.
   b. Post the Skill's response content to the Discord thread (existing behavior).
   c. Execute any artifact commit pipeline steps (Phase 4 behavior — unchanged).

2. Evaluate the routing signal type.
   a. If type is NOT a resolution signal (see §3.2) → proceed with normal routing; stop here.
   b. If type IS a resolution signal (LGTM or TASK_COMPLETE) → continue to Step 3.

3. Check the archive configuration.
   a. Read `orchestrator.archive_on_resolution` from `ptah.config.json`.
   b. If value is `false` → log "[ptah:orchestrator] Archiving disabled by config — thread {thread_id} left open." and stop.
   c. If value is `true` (or key is absent, defaulting to true) → continue to Step 4.
   d. If value is present but not a boolean → log warning and default to true (see §3.6).

4. Check the thread registry.
   a. Look up the thread ID in the active-thread registry.
   b. If thread is already marked archived in the registry → log at DEBUG level; treat as no-op; stop.
      (BR-DI-02-04: no re-archiving. Zero MCP calls are made.)
   c. If thread is not yet archived → continue to Step 5.

5. Archive the thread via Discord MCP.
   a. Call the Discord MCP thread-archive operation for the originating thread ID.
   b. If the call succeeds → log "[ptah:orchestrator] Thread {thread_id} archived after resolution signal '{signal_type}'."
   c. If the thread is already archived in Discord → log at DEBUG level; treat as success; do not error.
   d. If the call fails (network error, permissions error, API error) → see §3.6 (Error Scenarios).
      IMPORTANT: on failure, do NOT update the thread registry. Leave the thread as "open" in the registry
      so that a subsequent resolution signal can trigger another archive attempt.

6. Update in-memory thread state (on success only).
   a. Mark the thread as archived in the Orchestrator's active-thread registry.
   b. Future routing events targeting this thread ID are silently dropped (the thread is closed).
```

### 3.4 Business Rules

| Rule | Details |
|------|---------|
| **BR-DI-02-01: Post-content archiving** | Archiving always happens *after* the Skill response content is posted to Discord. The user sees the final message before the thread disappears from the active list. |
| **BR-DI-02-02: Post-commit archiving** | Archiving always happens *after* any artifact commit pipeline has completed. No archiving occurs mid-commit. |
| **BR-DI-02-03: Archiving is non-blocking** | A failure to archive does not fail the routing cycle. The Orchestrator logs the error and continues. The thread is left open rather than in an inconsistent state. The thread registry is NOT updated on failure. |
| **BR-DI-02-04: No re-archiving** | Once a thread is marked archived in the registry, any subsequent resolution signal targeting the same thread ID is a no-op — the registry is checked before any MCP call is made. Zero MCP calls are made on duplicate signals. |
| **BR-DI-02-05: Opt-out is deployment-wide** | `archive_on_resolution: false` disables archiving for all threads, not selectively. Per-thread opt-out is out of scope for Phase 7. |
| **BR-DI-02-06: ROUTE_TO_USER does not archive** | A `ROUTE_TO_USER` signal explicitly means work is not done. Archiving on a `ROUTE_TO_USER` would hide a thread that still needs human attention. |
| **BR-DI-02-07: Archive failures are retryable** | Because the thread registry is not updated on archive failure (BR-DI-02-03), a subsequent resolution signal for the same thread will trigger a new archive attempt. There is no built-in automatic retry — retry is user-initiated by re-triggering the relevant workflow. |

### 3.5 Inputs and Outputs

| | Details |
|-|---------|
| **Input** | Skill response containing a parsed routing signal (signal type) |
| **Input** | Originating thread ID (already tracked by the Orchestrator per existing behavior) |
| **Input** | `ptah.config.json` — `orchestrator.archive_on_resolution` boolean |
| **Output** | Discord thread archived (via Discord MCP) |
| **Output** | Thread registry updated: thread marked archived (on success only) |
| **Output** | Log entry confirming archiving or skip reason |

> **Phase 7 protocol deliverable — `DiscordClient.archiveThread`:** The live `DiscordClient` interface has no thread-archive operation. `archiveThread(threadId: string): Promise<void>` must be added to the `DiscordClient` protocol and implemented in `DiscordJsClient` as a Phase 7 deliverable. The underlying discord.js `ThreadChannel` type exposes `.setArchived(true)`, confirming the capability is available. Engineering must add this method in TSPEC; it is not optional. The `FakeDiscordClient` in tests must implement this method (recording calls and supporting error injection) to enable unit-testing of AT-DI-02-01 through AT-DI-02-09.

### 3.6 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Discord MCP archive call fails with network/API error | Log `[ptah:orchestrator] Warning: failed to archive thread {thread_id} — {error_message}. Thread left open.` Post no error message to the thread. Do NOT update thread registry. Continue normal operation. |
| Discord MCP returns "Missing Permissions" | Log `[ptah:orchestrator] Warning: insufficient permissions to archive thread {thread_id}. Check bot permissions. Thread left open.` Do not retry automatically. Do NOT update thread registry. |
| Discord MCP returns "Thread not found" | Log at WARN level. Treat as success (thread is already gone). Update registry. |
| Thread already archived (Discord returns archived state) | Log at DEBUG level. Treat as success. Update registry. |
| Config key `archive_on_resolution` is absent | Default to `true`. Proceed with archiving. |
| Config key `archive_on_resolution` is present but not a boolean | Log `[ptah:orchestrator] Warning: archive_on_resolution config value is not boolean — defaulting to true.` Proceed with archiving. |

### 3.7 Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| A `TASK_COMPLETE` signal arrives for a thread already archived | No-op. Registry check (BR-DI-02-04) prevents a second archive call. Zero MCP calls made. |
| Multiple concurrent Skill completions both resolve as `TASK_COMPLETE` for different threads simultaneously | Each thread's archiving is handled independently. No cross-thread interference. |
| `archive_on_resolution` is `false` and a resolution signal arrives | Thread is left open. No error. Log at DEBUG. |
| A `LGTM` signal arrives in a non-review thread (e.g., a task thread where the Skill approved its own work) | Archive normally — the signal type is the sole trigger, not the thread type. |
| Discord MCP archive call fails; user retriggers the workflow producing a new resolution signal | The new resolution signal triggers a fresh archive attempt (thread registry was not updated on prior failure — BR-DI-02-07). |

### 3.8 Acceptance Tests

**AT-DI-02-01: Basic archiving on `TASK_COMPLETE`**
```
WHO:   As the Orchestrator
GIVEN: A thread is active and a Skill response contains a TASK_COMPLETE signal
       AND archive_on_resolution is true (default)
WHEN:  I process the Skill response
THEN:  The Skill response content is posted to the thread
       AND the artifact commit pipeline completes
       AND the Discord thread is archived via Discord MCP
       AND the thread is marked archived in the registry
       AND a log entry confirms archiving
```

**AT-DI-02-02: Archiving on `LGTM`**
```
WHO:   As the Orchestrator
GIVEN: A review thread is active and a Skill response contains an LGTM routing signal
       AND archive_on_resolution is true (default)
WHEN:  I process the Skill response
THEN:  The thread is archived after the response content is posted
       AND the thread is marked archived in the registry
```

**AT-DI-02-03: No archiving on `ROUTE_TO_USER`**
```
WHO:   As the Orchestrator
GIVEN: A thread is active and a Skill response contains a ROUTE_TO_USER signal
WHEN:  I process the Skill response
THEN:  The thread is NOT archived
       AND routing continues normally (escalation to user per existing behavior)
```

**AT-DI-02-04: No archiving when disabled**
```
WHO:   As the Orchestrator
GIVEN: archive_on_resolution is false in ptah.config.json
       AND a Skill response contains a TASK_COMPLETE signal
WHEN:  I process the Skill response
THEN:  No Discord MCP archive call is made
       AND a log entry notes that archiving is disabled
```

**AT-DI-02-05: Archiving failure is non-fatal; registry not updated**
```
WHO:   As the Orchestrator
GIVEN: A resolution signal is received for thread {T}
       AND the Discord MCP archive call returns an error
WHEN:  I process the error
THEN:  A warning is logged
       AND the thread is NOT marked archived in the registry (thread remains in "open" state)
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

**AT-DI-02-07: Idempotency — second resolution signal for already-archived thread**
```
WHO:   As the Orchestrator
GIVEN: Thread {T} has already been archived and is marked as such in the registry
WHEN:  A second TASK_COMPLETE (or LGTM) signal arrives targeting thread {T}
THEN:  Zero Discord MCP archive calls are made
       AND no error is logged
       AND the Orchestrator continues normally
```

**AT-DI-02-08: Config key absent — archiving defaults to true**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json does NOT contain the archive_on_resolution key
       AND a Skill response contains a TASK_COMPLETE signal for thread {T}
WHEN:  I process the Skill response
THEN:  Thread {T} is archived via Discord MCP (same outcome as archive_on_resolution: true)
```

**AT-DI-02-09: Config key is non-boolean — warns and defaults to true**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains archive_on_resolution: "yes" (a non-boolean string)
       AND a Skill response contains a TASK_COMPLETE signal for thread {T}
WHEN:  I process the Skill response
THEN:  A warning is logged: "[ptah:orchestrator] Warning: archive_on_resolution config value is not boolean — defaulting to true."
       AND thread {T} is archived (archiving proceeds as if value were true)
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

> **Migration note:** The live `AgentConfig` interface (in `src/types.ts`) uses a flat structure with `active`, `skills`, `colours`, and `role_mentions` keys. The `agents` array schema defined here replaces that structure. Engineering must perform a config schema migration during Phase 7 TSPEC. See REQ-NF-08 §5 risk entry and the engineering TSPEC for migration scope.

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
      - If any required field is missing → log validation error (see §4.8) and SKIP this agent.
        Do not halt startup; continue with remaining agents.
   b. Validate id format: lowercase alphanumeric + hyphens, no spaces, non-empty.
      - If invalid → log validation error and skip this agent.
   c. Validate skill_path: file must exist and be readable.
      - If file does not exist → log error and skip this agent.
   d. Validate log_file: file must exist (may be empty).
      - If file does not exist → log error and skip this agent.
   e. Validate mention_id: must be a non-empty string of digits (Discord snowflake format).
      - If invalid → log error and skip this agent.
   f. Check for duplicate id (BR-EX-01-03):
      - If id already registered → log warning and skip.
   g. Check for duplicate mention_id (BR-EX-01-04):
      - If mention_id already registered → log warning and skip.
   h. Register the agent in the Orchestrator's in-memory agent registry:
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
| Routing signal `ROUTE_TO_AGENT: {agent_id}` where `agent_id` matches a registered agent | Invoke that agent's Skill. |
| Routing signal `ROUTE_TO_AGENT: {agent_id}` where `agent_id` does NOT match any registered agent | Log `[ptah:orchestrator] Error: routing signal targets unknown agent '{agent_id}'. No registered agent with that ID. Thread {thread_id} left waiting.` Post a system error message to the thread. Do not crash. |
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
| **BR-EX-01-07: display_name defaults to id** | If `display_name` is absent from an agent entry, the agent's `id` value is used as the display name in all log messages and Discord embed output. |

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
| `display_name` field is absent | `display_name` defaults to `id`. Log messages and Discord embeds use the `id` value as the display name. No error. |
| Config is hot-reloaded and a new agent entry is added | New agent is registered in the live registry. Immediately available for routing. (Hot-reload behavior is Phase 1 scope — this FSPEC does not change it.) |
| Config is hot-reloaded and an existing agent entry is removed | Agent is de-registered from the live registry. Any in-flight invocation for that agent completes normally. Future routing signals targeting that agent ID are treated as unknown-agent errors: error logged and system error message posted to the thread. |
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
GIVEN: A Skill response contains ROUTE_TO_AGENT: "unknown-agent"
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

**AT-EX-01-06: Duplicate mention_id — first entry wins**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains two agent entries with the same mention_id "1234567890"
       (e.g., "agent-a" and "agent-b")
WHEN:  The Orchestrator starts
THEN:  The first entry ("agent-a") is registered with that mention_id
       AND the second entry ("agent-b") is skipped with a duplicate-mention_id warning
       AND @mentions matching "1234567890" are routed to "agent-a"
```

**AT-EX-01-07: display_name absent — id used as display name**
```
WHO:   As the Orchestrator
GIVEN: ptah.config.json contains a valid agent entry for "backend-engineer" with no display_name field
WHEN:  The Orchestrator registers the agent and subsequently logs a routing action for it
THEN:  Log output and Discord embed messages refer to the agent as "backend-engineer" (the id value)
       AND no error or warning is logged for the missing display_name
```

**AT-EX-01-08: Hot-reload removes agent — subsequent routing to that agent fails gracefully**
```
WHO:   As the Orchestrator
GIVEN: The Orchestrator is running with "backend-engineer" registered
       AND the config is hot-reloaded with "backend-engineer" removed from the agents array
WHEN:  A subsequent ROUTE_TO_AGENT: "backend-engineer" signal is received
THEN:  An unknown-agent error is logged
       AND a system error message is posted to the originating thread
       AND the Orchestrator does not crash
```

---

## 5. FSPEC-DI-03: Discord Embed Formatting for Orchestrator Messages

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-DI-03 |
| **Title** | Discord Embed Formatting for Orchestrator-Generated Messages |
| **Linked Requirements** | [REQ-DI-10] |

### 5.1 Description

Phase 7 standardizes how the Orchestrator posts messages to Discord. After Phase 7, there are two distinct message categories with different rendering:

1. **Orchestrator metadata messages** — system-generated messages about Orchestrator state (routing, completion, errors, escalations). These are posted as **Discord rich embeds** with defined schemas per message type.

2. **Agent response text** — the Skill's own authored text output. This moves from the current embed-wrapped format (via `postAgentResponse()`) to **plain Discord messages**. Embeds are reserved for Orchestrator metadata only.

Three existing embed methods (`postCompletionEmbed`, `postErrorEmbed`, `postProgressEmbed`) are the partial foundation for this requirement. Phase 7 formalizes their schemas, adds two new embed types (routing notification, user escalation), and removes agent response content from embed rendering.

### 5.2 Embed Type Enumeration

Phase 7 defines **four** Orchestrator embed types:

| Embed Type | Trigger Event | Color (hex int) | Description |
|------------|---------------|-----------------|-------------|
| **Routing Notification** | Orchestrator processes a `ROUTE_TO_AGENT` signal | `0x5865F2` (Discord blurple) | Notifies the thread that work is being dispatched to another agent. |
| **Resolution Notification** | Orchestrator processes a `LGTM` or `TASK_COMPLETE` signal | `0x57F287` (green) | Notifies the thread that work is complete and the thread is resolving. |
| **Error Report** | Non-recoverable Orchestrator error affecting a thread | `0xED4245` (red) | Reports a failure that requires user action. |
| **User Escalation** | Orchestrator processes a `ROUTE_TO_USER` signal | `0xFEE75C` (yellow) | Presents a blocking question or decision to the user. |

### 5.3 Embed Field Schemas

#### 5.3.1 Routing Notification Embed

| Field | Value |
|-------|-------|
| **Title** | `↗ Routing to {display_name}` |
| **Color** | `0x5865F2` |
| **Body field: From** | `{source_agent_display_name}` |
| **Body field: To** | `{target_agent_display_name}` |
| **Body field: Reason** | Omitted (optional — included only if the routing signal carries a reason string) |
| **Footer** | `Ptah Orchestrator` |

#### 5.3.2 Resolution Notification Embed

| Field | Value |
|-------|-------|
| **Title** | `✅ Thread Resolved` |
| **Color** | `0x57F287` |
| **Body field: Signal** | `{signal_type}` (e.g., `LGTM`, `TASK_COMPLETE`) |
| **Body field: Resolved by** | `{agent_display_name}` |
| **Footer** | `Ptah Orchestrator` |

#### 5.3.3 Error Report Embed

| Field | Value |
|-------|-------|
| **Title** | `⚠ Error — {short_error_description}` |
| **Color** | `0xED4245` |
| **Body field: What happened** | Plain-language explanation of the error (see FSPEC-RP-01 for error message templates) |
| **Body field: What to do** | Actionable guidance for the user (see FSPEC-RP-01) |
| **Footer** | `Ptah Orchestrator` |

#### 5.3.4 User Escalation Embed

| Field | Value |
|-------|-------|
| **Title** | `❓ Input Needed` |
| **Color** | `0xFEE75C` |
| **Body field: Agent** | `{agent_display_name}` |
| **Body field: Question** | The question or decision text extracted from the `ROUTE_TO_USER` signal |
| **Footer** | `Ptah Orchestrator` |

### 5.4 Agent Response Text (Plain Messages)

After Phase 7, agent-authored response text is posted as a **plain Discord message**, not an embed. The `postAgentResponse()` method is updated to remove embed wrapping.

**What changes:** `postAgentResponse()` no longer wraps content in a Discord embed. The chunk size is reduced from 4096 to 2000 characters to match Discord's plain message character limit. (Previously, embed field content used a 4096-char limit; plain messages are capped at 2000 chars. This was accepted in OQ-TSPEC-03 during engineering review.)

**What does not change:** The chunking logic itself — long responses are still split into multiple sequential `postPlainMessage()` calls. Message ordering is preserved. Agent-specific color is removed (it was part of the embed wrapper that is eliminated).

> **Phase 7 protocol deliverable — `DiscordClient.postPlainMessage`:** The live `DiscordClient` interface has no plain-message posting method. `postPlainMessage(threadId: string, content: string): Promise<void>` must be added to the `DiscordClient` protocol and implemented in `DiscordJsClient` as a Phase 7 deliverable. The existing `postEmbed()` and `postSystemMessage()` are both embed-based (`channel.send({ embeds: [...] })`); plain text requires a separate call (`channel.send({ content })`). `postAgentResponse()` must be updated to call `postPlainMessage` instead of the current embed path. The `FakeDiscordClient` in tests must implement this method (recording calls and supporting failure injection) to enable unit-testing of AT-DI-03-04.

> **`createCoordinationThread()` disposition:** The live `createCoordinationThread()` method posts the initial message for a new coordination thread using a per-agent colour embed (via `resolveColour(agentId, config)`). After Phase 7, the `colour` field is removed from the agent config schema (FSPEC-EX-01 §4.2) and per-agent colours are eliminated. **The initial coordination thread message must be updated to use the Routing Notification embed type** (§5.2, color `0x5865F2`) instead of the per-agent colour embed. Creating a coordination thread is an Orchestrator-initiated action announcing that work is being dispatched to an agent — semantically equivalent to a routing event. Engineering must update `createCoordinationThread()` to post a Routing Notification embed in TSPEC. `resolveColour()` is eliminated entirely as a Phase 7 deliverable.

### 5.5 Behavioral Rules

| Rule | Details |
|------|---------|
| **BR-DI-03-01: Embeds for metadata only** | Only the four Orchestrator embed types (§5.2) use Discord embeds. Agent response text uses plain messages. |
| **BR-DI-03-02: Color is fixed per type** | Each embed type has an exact color integer as defined in §5.2. Color is not configurable per-agent or per-thread. |
| **BR-DI-03-03: Existing embed methods form the foundation** | `postCompletionEmbed` → maps to Resolution Notification. `postErrorEmbed` → maps to Error Report. `postProgressEmbed` → maps to Routing Notification. User Escalation is a new embed type. Engineering determines whether to refactor existing methods or replace them. |
| **BR-DI-03-04: Footer is always "Ptah Orchestrator"** | All four embed types include a footer text of "Ptah Orchestrator" to distinguish Orchestrator metadata from agent content in the thread. |

### 5.6 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Discord MCP embed creation fails | Log the error. Fall back to posting a plain text equivalent of the metadata message via `postPlainMessage` (do not silently skip). |
| Embed field value exceeds Discord character limits | Truncate the field value with an ellipsis (`…`) to fit within Discord embed limits. Do not crash or skip the message. |

**Embed fallback plain-text formats (per embed type):**

| Embed Type | Plain-text fallback content |
|------------|----------------------------|
| Routing Notification | `↗ Routing to {display_name} (from {source_agent_display_name})` |
| Resolution Notification | `✅ Thread resolved. Signal: {signal_type}. Resolved by: {agent_display_name}` |
| Error Report | `⚠ Error — {short_error_description}. {what_to_do}` |
| User Escalation | `❓ Input needed from {agent_display_name}: {question_text}` |

These fallback strings ensure the thread receives a human-readable notification even if embed creation fails. An automated test verifying the fallback path can assert that at least one message was posted to the thread containing the relevant agent name or signal type.

### 5.7 Acceptance Tests

**AT-DI-03-01: Routing notification embed posted on ROUTE_TO_AGENT**
```
WHO:   As a developer monitoring an active Ptah session
GIVEN: A Skill response contains a ROUTE_TO_AGENT: "test-engineer" signal
WHEN:  The Orchestrator processes the signal
THEN:  A Discord embed is posted to the thread with:
       - Color 0x5865F2
       - Title "↗ Routing to Test Engineer" (or the registered display_name)
       - Footer "Ptah Orchestrator"
```

**AT-DI-03-02: Resolution notification embed posted on TASK_COMPLETE**
```
WHO:   As a developer monitoring an active Ptah session
GIVEN: A Skill response contains a TASK_COMPLETE signal
WHEN:  The Orchestrator processes the signal
THEN:  A Discord embed is posted to the thread with:
       - Color 0x57F287
       - Title "✅ Thread Resolved"
       - Body field "Signal": "TASK_COMPLETE"
       - Footer "Ptah Orchestrator"
```

**AT-DI-03-03: User escalation embed posted on ROUTE_TO_USER**
```
WHO:   As a developer whose thread has been escalated
GIVEN: A Skill response contains a ROUTE_TO_USER signal with question text "Should I proceed with option A?"
WHEN:  The Orchestrator processes the signal
THEN:  A Discord embed is posted to the thread with:
       - Color 0xFEE75C
       - Title "❓ Input Needed"
       - Body field "Question": "Should I proceed with option A?"
       - Footer "Ptah Orchestrator"
```

**AT-DI-03-04: Agent response text posted as plain message (not embed)**
```
WHO:   As a developer reviewing agent output
GIVEN: A Skill has produced a text response
WHEN:  The Orchestrator posts the agent response
THEN:  The message is a plain Discord message (not a Discord embed)
       AND the content is the Skill's authored text
```

**AT-DI-03-05: Error report embed posted on non-recoverable error**
```
WHO:   As a developer whose thread has encountered an error
GIVEN: The Orchestrator encounters retry exhaustion for a thread
WHEN:  The error message is posted to the thread
THEN:  A Discord embed is posted with:
       - Color 0xED4245
       - Title beginning with "⚠ Error"
       - Body field "What to do" containing at least one actionable suggestion
       - Footer "Ptah Orchestrator"
       - NO stack trace or internal exception text in any field
```

---

## 6. FSPEC-RP-01: Error Message UX

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RP-01 |
| **Title** | Human-Readable, Actionable Error Messages in Discord |
| **Linked Requirements** | [REQ-RP-06] |

### 6.1 Description

When the Orchestrator encounters a non-recoverable error that affects a Discord thread, it posts a human-readable message to that thread explaining what went wrong and what the user can do next. Technical error details (stack traces, internal IDs, raw API error messages) are written to the debug log only — never to Discord.

### 6.2 Error Scenario Enumeration

The following error types produce user-facing Discord messages. Each maps to an Error Report embed (FSPEC-DI-03 §5.3.3).

#### ERR-RP-01: Retry Exhaustion

**Trigger:** The Orchestrator has retried Skill invocation for a thread the maximum number of times and all attempts failed.

| Field | Value |
|-------|-------|
| **Short description (embed title suffix)** | `Skill Invocation Failed` |
| **What happened** | `{agent_display_name} could not be reached after {max_retries} attempts.` |
| **What to do** | `Try again by @mentioning {agent_display_name} in this thread. If the problem persists, check the Ptah console log for details.` |

#### ERR-RP-02: Unknown Agent

**Trigger:** A routing signal contains a `ROUTE_TO_AGENT` value targeting an agent ID not in the registry.

| Field | Value |
|-------|-------|
| **Short description (embed title suffix)** | `Unknown Agent` |
| **What happened** | `A routing signal referenced an agent that is not registered: '{agent_id}'.` |
| **What to do** | `Check that '{agent_id}' is correctly configured in ptah.config.json and that Ptah has been restarted or hot-reloaded since the config change.` |

#### ERR-RP-03: Discord MCP Failure (Non-Archive)

**Trigger:** A Discord MCP operation (other than thread archiving, which is non-blocking) fails in a way that prevents normal thread operation.

| Field | Value |
|-------|-------|
| **Short description (embed title suffix)** | `Discord Error` |
| **What happened** | `Ptah could not complete a Discord operation for this thread.` |
| **What to do** | `Check the Ptah console log for details. If the problem persists, verify the bot's Discord permissions.` |

#### ERR-RP-04: Routing Signal Parse Failure

**Trigger:** The Orchestrator cannot parse a valid routing signal from a Skill's response after all retries.

| Field | Value |
|-------|-------|
| **Short description (embed title suffix)** | `Invalid Skill Response` |
| **What happened** | `{agent_display_name} returned a response that Ptah could not process.` |
| **What to do** | `Try re-triggering the workflow. If this happens repeatedly for the same agent, check the Skill definition file for issues.` |

#### ERR-RP-05: Skill File Not Found at Invocation

**Trigger:** The Skill definition file for the target agent cannot be read at invocation time (e.g., file was deleted after startup).

| Field | Value |
|-------|-------|
| **Short description (embed title suffix)** | `Skill File Missing` |
| **What happened** | `The Skill definition for {agent_display_name} could not be found.` |
| **What to do** | `Verify the skill file exists at the configured path and that Ptah has read access. Check the console log for the expected path.` |

### 6.3 Message Formatting Rules

| Rule | Details |
|------|---------|
| **BR-RP-01-01: No technical internals in Discord** | Stack traces, exception class names, raw API error payloads, internal UUIDs, and database IDs must not appear in any Discord-facing error message field. These go to the debug log only. |
| **BR-RP-01-02: At least one actionable suggestion** | Every error message must include at least one concrete action the user can take — "try again", "check config", "verify permissions", etc. "Contact support" is not sufficient on its own. |
| **BR-RP-01-03: Plain language** | Error messages are written for developers and operators, not engineers. Avoid jargon. "Ptah could not reach the agent" not "SkillInvokerException: transport timeout". |
| **BR-RP-01-04: Error Report embed format** | All user-facing error messages use the Error Report embed schema from FSPEC-DI-03 §5.3.3. The embed color is `0xED4245` (red). |

### 6.4 Inputs and Outputs

| | Details |
|-|---------|
| **Input** | Internal error type (maps to ERR-RP-01 through ERR-RP-05) |
| **Input** | Contextual values (agent_display_name, agent_id, max_retries, etc.) |
| **Output** | Error Report embed posted to the originating Discord thread |
| **Output** | Full technical error details written to the debug log |

### 6.5 Acceptance Tests

**AT-RP-01-01: Retry exhaustion produces actionable Discord message**
```
WHO:   As a developer whose thread has encountered a retry failure
GIVEN: The Orchestrator has exhausted retries for "backend-engineer" in thread {T}
WHEN:  The error message is posted to thread {T}
THEN:  The Discord message (Error Report embed) contains:
       - The agent name ("backend-engineer" or its display name)
       - The retry count
       - A suggestion to retry by @mentioning the agent
       AND the message does NOT contain a stack trace or exception class name
```

**AT-RP-01-02: Unknown agent error includes agent ID and config guidance**
```
WHO:   As a developer
GIVEN: A routing signal contains ROUTE_TO_AGENT: "phantom-agent"
       AND "phantom-agent" is not in the registry
WHEN:  The error message is posted to the thread
THEN:  The Discord message names "phantom-agent" explicitly
       AND includes a suggestion to check ptah.config.json
```

**AT-RP-01-03: Stack traces do not appear in Discord messages**
```
WHO:   As a developer
GIVEN: The Orchestrator catches an exception with a stack trace
       AND the error type is any of ERR-RP-01 through ERR-RP-05
WHEN:  The error message is posted to Discord
THEN:  The posted Discord message does NOT contain:
       - Any line with "at " followed by a file path (stack frame pattern)
       - Any exception class name (e.g., "Error:", "TypeError:")
       - Any raw API response body
```

---

## 7. FSPEC-LG-01: Structured Log Output

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-LG-01 |
| **Title** | Structured Log Output with Component Prefix and Level |
| **Linked Requirements** | [REQ-NF-09] |

### 7.1 Description

All Orchestrator log lines use a consistent format: `[ptah:{component}] {LEVEL}: {message}`. This makes log output filterable, scannable, and useful for both human operators and log aggregation tools.

### 7.2 Log Line Format

```
[ptah:{component}] {LEVEL}: {message}
```

**Examples:**
```
[ptah:orchestrator] INFO: Thread 123456789 received from backend-engineer. Signal: TASK_COMPLETE.
[ptah:router] WARN: Routing signal targets unknown agent 'phantom-agent'. Thread 987654321 left waiting.
[ptah:skill-invoker] ERROR: Skill invocation failed for backend-engineer (attempt 3/3): timeout.
[ptah:config] DEBUG: archive_on_resolution not found in config — defaulting to true.
```

### 7.3 Component Enumeration

Every log line must use one of the following `{component}` values. No other values are valid.

| Component | Scope |
|-----------|-------|
| `orchestrator` | Main Orchestrator event loop and top-level coordination |
| `router` | Routing signal parsing, routing decision logic |
| `dispatcher` | PDLC phase dispatch and state machine |
| `skill-invoker` | Skill definition loading, Claude API invocation, retry logic |
| `artifact-committer` | Git operations (stage, commit, push) |
| `response-poster` | Posting messages to Discord (agent responses and embed messages) |
| `config` | Config loading, validation, and hot-reload |
| `discord` | Discord MCP client operations (thread management, message operations) |

**Fallback rule for unlisted modules:** Orchestrator submodules not named in the table above (e.g., `question-poller`, `question-store`, `agent-log-writer`, `context-assembler`, `pattern-b-context-builder`, `pdlc/state-store`) must use the `orchestrator` component value. These are internal orchestration concerns owned by the top-level coordination scope. If a future submodule warrants its own named component, it must be added to this table via a FSPEC amendment before use.

### 7.4 Log Level Enumeration

| Level | Meaning |
|-------|---------|
| `DEBUG` | Verbose detail for development and debugging. Not shown in production unless debug mode is enabled. |
| `INFO` | Normal operational events. Routing decisions, agent registration, phase transitions. |
| `WARN` | Unexpected but non-fatal conditions. Config defaults applied, duplicate entries skipped, archive failure. |
| `ERROR` | Failures that affect thread processing. Skill invocation failure, unknown agent, Discord MCP failure. |

### 7.5 Business Rules

| Rule | Details |
|------|---------|
| **BR-LG-01-01: Every log line has a component** | No log line may omit the `[ptah:{component}]` prefix. The component must be one of the eight values in §7.3 (or `orchestrator` per the fallback rule). |
| **BR-LG-01-02: Every log line has a level** | The level follows the component prefix and must be one of DEBUG, INFO, WARN, ERROR. |
| **BR-LG-01-03: One component per call site** | Each call site in the codebase uses the component that owns that code. A call site in `skill-invoker.ts` uses `[ptah:skill-invoker]`. |
| **BR-LG-01-04: Messages are self-contained** | A log message should be understandable without surrounding context. Include the thread_id, agent_id, or other relevant identifiers inline. |
| **BR-LG-01-05: Component prefix is a Logger-level concern** | The `[ptah:{component}]` prefix must be emitted by the Logger itself — it is NOT a per-call-site string concatenation. Call sites must not manually prepend `"[ptah:router]"` to their message strings. The Logger protocol must support component-scoped instances so that the component is a structured field, not an embedded string in the message body. The recommended approach is a factory method (e.g., `logger.forComponent('router'): Logger`) that returns a scoped logger instance constructed at module initialization time. This design enables `FakeLogger` implementations to capture log entries as structured data (`{ component, level, message }`) for deterministic test assertions — the component set assertion in AT-LG-01-01 becomes `expect(VALID_COMPONENTS).toContain(entry.component)` rather than a fragile regex match. Engineering must design the `Logger` protocol interface in TSPEC to enforce this contract. |

### 7.6 Acceptance Tests

**AT-LG-01-01: Every log line has correct prefix format**
```
WHO:   As a developer monitoring Ptah's console output
GIVEN: Ptah is running and processing routing events
WHEN:  I observe the console log stream
THEN:  Every log line matches the pattern: [ptah:{component}] {LEVEL}: {message}
       AND {component} is one of the eight valid component values
       AND {LEVEL} is one of DEBUG, INFO, WARN, ERROR
```

**AT-LG-01-02: Component matches code ownership**
```
WHO:   As a developer
GIVEN: The Orchestrator logs a routing decision
WHEN:  I read that log line
THEN:  The component prefix is [ptah:router] (not [ptah:orchestrator] or any other component)
```

**AT-LG-01-03: Log message includes relevant identifiers**
```
WHO:   As a developer diagnosing a routing issue
GIVEN: A routing event occurs for thread 123456789 involving agent "backend-engineer"
WHEN:  I read the log line for that event
THEN:  The log message includes the thread ID and agent ID inline
       (e.g., "Thread 123456789 ... backend-engineer ...")
```

---

## 8. FSPEC-OB-01: Operator Observability

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-OB-01 |
| **Title** | Operator Observability — Routing Lifecycle Log Events |
| **Linked Requirements** | [REQ-NF-10] |

### 8.1 Description

The console log stream is the primary observability mechanism for Ptah operators. FSPEC-OB-01 defines the minimum set of log events that must be emitted to allow an operator to reconstruct the complete routing lifecycle for any thread from the log file alone — without consulting Discord or Git history.

All events in this FSPEC use the structured log format defined in FSPEC-LG-01.

### 8.2 Required Log Event Set

The following events must be logged. Together they provide full lifecycle coverage for every routing cycle.

#### EVT-OB-01: Message Received

**Trigger:** An incoming Discord message is received that matches a registered agent's `mention_id`.

| Field | Details |
|-------|---------|
| **Component** | `orchestrator` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `mention_id`, first 100 characters of message text (truncated with `…`) |
| **Example** | `[ptah:orchestrator] INFO: Message received in thread 987654 — mention: 1234567890. Content: "Please review the TSPEC for feature 007…"` |

#### EVT-OB-02: Agent Matched

**Trigger:** A registered agent is matched to the incoming mention.

| Field | Details |
|-------|---------|
| **Component** | `orchestrator` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, matched `agent_id`, matched `agent_display_name` |
| **Example** | `[ptah:orchestrator] INFO: Thread 987654 — matched mention to agent 'backend-engineer' (Backend Engineer).` |

#### EVT-OB-03: Skill Invoked

**Trigger:** The Orchestrator calls the Claude API with the Skill definition for the matched agent.

| Field | Details |
|-------|---------|
| **Component** | `skill-invoker` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `agent_id`, `attempt_number`, `max_attempts` |
| **Example** | `[ptah:skill-invoker] INFO: Invoking skill for 'backend-engineer' on thread 987654 (attempt 1/3).` |

#### EVT-OB-04: Skill Response Received

**Trigger:** The Orchestrator receives and parses a response from the Skill.

| Field | Details |
|-------|---------|
| **Component** | `skill-invoker` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `agent_id`, parsed `signal_type` |
| **Example** | `[ptah:skill-invoker] INFO: Skill response received from 'backend-engineer' on thread 987654. Signal: TASK_COMPLETE.` |

#### EVT-OB-05: Response Posted to Discord

**Trigger:** The Orchestrator posts the Skill's response content to the Discord thread.

| Field | Details |
|-------|---------|
| **Component** | `response-poster` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `agent_id`, number of messages posted (1 or more for chunked responses) |
| **Example** | `[ptah:response-poster] INFO: Posted response for 'backend-engineer' to thread 987654 (2 message(s)).` |

#### EVT-OB-06: Artifacts Committed

**Trigger:** The artifact commit pipeline completes for a thread.

| Field | Details |
|-------|---------|
| **Component** | `artifact-committer` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `agent_id`, git `commit_sha` (short, 7 chars), number of files committed |
| **Example** | `[ptah:artifact-committer] INFO: Committed artifacts for thread 987654 ('backend-engineer'). Commit: a1b2c3d. Files: 2.` |

#### EVT-OB-07: Thread Archived

**Trigger:** The Orchestrator successfully archives a Discord thread after a resolution signal.

| Field | Details |
|-------|---------|
| **Component** | `orchestrator` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `signal_type` that triggered archiving |
| **Example** | `[ptah:orchestrator] INFO: Thread 987654 archived after resolution signal 'TASK_COMPLETE'.` |

#### EVT-OB-08: User Escalation

**Trigger:** The Orchestrator processes a `ROUTE_TO_USER` signal and posts a user escalation embed.

| Field | Details |
|-------|---------|
| **Component** | `orchestrator` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `agent_id`, first 100 characters of the question text |
| **Example** | `[ptah:orchestrator] INFO: Thread 987654 escalated to user by 'backend-engineer'. Question: "Should I proceed with the breaking change…"` |

#### EVT-OB-09: Routing to Another Agent

**Trigger:** The Orchestrator processes a `ROUTE_TO_AGENT` signal and dispatches to the target agent.

| Field | Details |
|-------|---------|
| **Component** | `router` |
| **Level** | `INFO` |
| **Required fields** | `thread_id`, `source_agent_id`, `target_agent_id` |
| **Example** | `[ptah:router] INFO: Thread 987654 — routing from 'backend-engineer' to 'test-engineer'.` |

#### EVT-OB-10: Error Event

**Trigger:** Any ERROR-level condition affecting thread processing (skill failure, unknown agent, Discord failure, etc.).

| Field | Details |
|-------|---------|
| **Component** | (component where error originated — see FSPEC-LG-01 §7.3) |
| **Level** | `ERROR` |
| **Required fields** | `thread_id`, `error_type` (one of ERR-RP-01 through ERR-RP-05), human-readable description |
| **Example** | `[ptah:skill-invoker] ERROR: Skill invocation failed for 'backend-engineer' on thread 987654 after 3 attempts. Error type: ERR-RP-01 (retry exhaustion).` |

### 8.3 Lifecycle Completeness Requirement

For any given thread, an operator must be able to identify the following from the log file alone:

| Observable | Log Events That Provide It |
|------------|---------------------------|
| Which message triggered the cycle | EVT-OB-01 |
| Which agent was invoked | EVT-OB-02, EVT-OB-03 |
| What signal the agent returned | EVT-OB-04 |
| Whether the response was posted | EVT-OB-05 |
| Whether artifacts were committed | EVT-OB-06 (present only if commit occurred) |
| What post-signal action was taken | EVT-OB-07 (archived), EVT-OB-08 (escalated), EVT-OB-09 (routed) |
| Whether any errors occurred | EVT-OB-10 |

### 8.4 Acceptance Tests

**AT-OB-01-01: Full routing cycle produces a complete log trail**
```
WHO:   As a developer diagnosing a routing issue
GIVEN: A routing cycle completes for thread 987654 (message received → agent invoked → TASK_COMPLETE → archived)
WHEN:  I read the console log file for that session
THEN:  I can find log entries for:
       - EVT-OB-01 (message received, including thread 987654)
       - EVT-OB-02 (agent matched)
       - EVT-OB-03 (skill invoked)
       - EVT-OB-04 (skill response received, signal: TASK_COMPLETE)
       - EVT-OB-05 (response posted)
       - EVT-OB-07 (thread archived)
       AND each entry includes the thread ID 987654
       AND no entry requires consulting Discord or Git to understand
```

**AT-OB-01-02: Error cycle produces identifiable error event**
```
WHO:   As a developer diagnosing a failed routing attempt
GIVEN: Skill invocation for 'backend-engineer' on thread 987654 fails after 3 attempts
WHEN:  I read the console log for that cycle
THEN:  I can find EVT-OB-10 with:
       - thread_id: 987654
       - error_type: ERR-RP-01
       - agent: backend-engineer
       AND I can determine that the failure was retry exhaustion without opening Discord
```

**AT-OB-01-03: Multi-agent routing cycle is fully traceable**
```
WHO:   As a developer
GIVEN: A routing cycle involves backend-engineer routing to test-engineer (ROUTE_TO_AGENT)
WHEN:  I read the console log
THEN:  EVT-OB-09 is present naming both source ('backend-engineer') and target ('test-engineer')
       AND both agents' EVT-OB-03 and EVT-OB-04 events are present with correct thread IDs
```

---

## 9. Open Questions

| # | Question | Impact | Resolution |
|---|----------|--------|------------|
| OQ-07-01 | Should `LGTM` archiving apply only to review threads (where the PDLC review loop was active) or to any thread where a `LGTM` signal appears? | If a Skill emits `LGTM` in a non-review context, it would archive that thread. May or may not be desired. | **Assumed: `LGTM` archives any thread regardless of thread type.** The signal semantics in REQ-SI-04 define `LGTM` as "the review loop is complete" — which universally means the thread is done. If per-thread-type filtering is needed, flag for Phase 8. |
| OQ-07-02 | Should config hot-reload de-register agents whose entries are removed, or only add new ones? | Removing an agent mid-run could affect in-flight invocations. | **Assumed: hot-reload does both adds and removes.** In-flight invocations for a de-registered agent complete normally. This is consistent with Phase 1 config hot-reload behavior for other keys. Confirm with engineering. |

---

## 10. Dependencies

| Dependency | Type | Details |
|------------|------|---------|
| [FSPEC-SI-01] (Phase 3 — Skill Routing) | Behavioral dependency | Defines routing signal types (`LGTM`, `TASK_COMPLETE`, `ROUTE_TO_USER`, `ROUTE_TO_AGENT`) that FSPEC-DI-02 and FSPEC-DI-03 consume. |
| [REQ-DI-01] | Architectural constraint | All Discord I/O (including thread archiving and embed posting) is performed by the Orchestrator via Discord MCP. Skills do not call Discord MCP directly. |
| [REQ-IN-04] (Phase 1 — Config Architecture) | Foundational dependency | The configuration-driven architecture that FSPEC-EX-01 extends. `ptah.config.json` as the single source of truth is established here. |
| [FSPEC-LG-01] | Internal dependency | FSPEC-OB-01 requires the log format and component vocabulary defined in FSPEC-LG-01. |
| [FSPEC-DI-03] | Internal dependency | FSPEC-RP-01 requires the Error Report embed schema defined in FSPEC-DI-03. |

---

## 11. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 15, 2026 | Product Manager | Initial draft — FSPEC-DI-02 (thread archiving) and FSPEC-EX-01 (agent extensibility). |
| 2.1 | March 16, 2026 | Product Manager | Applied BE + TE cross-review feedback (second pass). (1) **FSPEC-DI-02 §3.5**: Added protocol scope note for `DiscordClient.archiveThread(threadId, string): Promise<void>` as a Phase 7 deliverable (BE-F-02, TE BE-F-02). (2) **FSPEC-DI-03 §5.4**: Added protocol scope note for `DiscordClient.postPlainMessage(threadId: string, content: string): Promise<void>` as a Phase 7 deliverable (BE-F-04, TE BE-F-04). Added `createCoordinationThread()` disposition: uses Routing Notification embed type after Phase 7; `resolveColour()` eliminated (BE-REQ-F-01). (3) **FSPEC-DI-03 §5.6**: Added per-embed-type plain-text fallback format strings (TE-F-08). (4) **FSPEC-LG-01 §7.3**: Added fallback rule for unlisted modules — use `orchestrator` component (BE-REQ-F-02). (5) **FSPEC-LG-01 §7.5**: Added BR-LG-01-05 specifying that the component prefix is a Logger-level concern, not per-call-site concatenation; Logger protocol must support `forComponent()` factory or equivalent (BE-F-03, TE BE-F-03). |
| 2.0 | March 16, 2026 | Product Manager | Applied cross-review feedback (BE + TE). (1) Fixed all signal naming throughout: `lgtm` → `LGTM`, `task_done`+status → `TASK_COMPLETE`/`ROUTE_TO_USER`, `route_to` → `ROUTE_TO_AGENT`, `escalate_to_user` → `ROUTE_TO_USER`. (2) Updated FSPEC-DI-02 §3.3 behavioral flow to add registry pre-check before MCP call (BE F-02, TE F-01). (3) Added BR-DI-02-07 (archive failures are retryable — registry not updated on failure). (4) Updated AT-DI-02-01 through AT-DI-02-03 to use live signal names. (5) Fixed AT-DI-02-05 to add explicit registry state assertion (TE F-04). (6) Added AT-DI-02-07 (idempotency), AT-DI-02-08 (config absent defaults to true), AT-DI-02-09 (non-boolean config) (TE F-03). (7) Added BR-EX-01-07 (display_name defaults to id). (8) Added AT-EX-01-06 (duplicate mention_id), AT-EX-01-07 (display_name defaults), AT-EX-01-08 (hot-reload de-registration) (TE F-05). (9) Added migration note to FSPEC-EX-01 §4.1 (BE F-01). (10) Added FSPEC-DI-03 (embed formatting), FSPEC-RP-01 (error message UX), FSPEC-LG-01 (structured logging), FSPEC-OB-01 (operator observability) to fulfil pending FSPECs for REQ-DI-10, REQ-RP-06, REQ-NF-09, REQ-NF-10 (BE F-05, TE F-02). |

---

*End of Document*
