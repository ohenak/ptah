# Migration Guide: v4 Agent Configuration Schema

## Overview

Phase 7 introduces a new `agents: AgentEntry[]` array format in `ptah.config.json` that replaces the old flat `AgentConfig` object format. The new format supports dynamic agent extensibility — operators can add or remove agents without restarting or modifying source code.

**Ptah must be restarted after any config changes.**

---

## Old Schema (pre-Phase 7)

```json
{
  "agents": {
    "active": ["pm", "eng", "fe", "qa"],
    "skills": {
      "pm": "../.claude/skills/product-manager/SKILL.md",
      "eng": "../.claude/skills/backend-engineer/SKILL.md",
      "fe": "../.claude/skills/frontend-engineer/SKILL.md",
      "qa": "../.claude/skills/test-engineer/SKILL.md"
    },
    "model": "claude-sonnet-4-6",
    "max_tokens": 8192,
    "role_mentions": {
      "1481763846741037167": "pm",
      "1481763904982876260": "eng",
      "1481763973715070976": "fe",
      "1481764002169356431": "qa"
    },
    "colours": {
      "pm": "#5865F2",
      "eng": "#57F287",
      "fe": "#FEE75C",
      "qa": "#EB459E"
    }
  }
}
```

---

## New Schema (Phase 7+)

```json
{
  "agents": [
    {
      "id": "pm",
      "skill_path": "../.claude/skills/product-manager/SKILL.md",
      "log_file": "../docs/agent-logs/pm.md",
      "mention_id": "1481763846741037167",
      "display_name": "Product Manager"
    },
    {
      "id": "eng",
      "skill_path": "../.claude/skills/backend-engineer/SKILL.md",
      "log_file": "../docs/agent-logs/eng.md",
      "mention_id": "1481763904982876260",
      "display_name": "Backend Engineer"
    },
    {
      "id": "fe",
      "skill_path": "../.claude/skills/frontend-engineer/SKILL.md",
      "log_file": "../docs/agent-logs/fe.md",
      "mention_id": "1481763973715070976",
      "display_name": "Frontend Engineer"
    },
    {
      "id": "qa",
      "skill_path": "../.claude/skills/test-engineer/SKILL.md",
      "log_file": "../docs/agent-logs/qa.md",
      "mention_id": "1481764002169356431",
      "display_name": "QA Engineer"
    }
  ],
  "llm": {
    "model": "claude-sonnet-4-6",
    "max_tokens": 8192
  }
}
```

---

## Migration Steps

1. **Open `ptah.config.json`** in the root of your project.

2. **Replace the `agents` object** with an `agents` array. For each agent previously listed in `agents.active`:
   - Set `id` to the agent's short identifier (e.g. `"pm"`)
   - Set `skill_path` to the path previously in `agents.skills.<id>`
   - Set `log_file` to the agent's log file path (new field — create `docs/agent-logs/` if it doesn't exist)
   - Set `mention_id` to the Discord role snowflake ID previously in `agents.role_mentions` (the value was the agent id, the key was the mention_id)
   - Set `display_name` to a human-readable name (optional; defaults to `id` if absent)

3. **Move `model` and `max_tokens`** from `agents.model` / `agents.max_tokens` into a top-level `llm` section:
   ```json
   "llm": {
     "model": "claude-sonnet-4-6",
     "max_tokens": 8192
   }
   ```

4. **Remove the old fields**: `agents.active`, `agents.skills`, `agents.model`, `agents.max_tokens`, `agents.role_mentions`, `agents.colours` are no longer used. Colours are no longer configurable in config (embed colours are now hard-coded by signal type).

5. **Restart Ptah** for the new configuration to take effect.

---

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique agent identifier. Must match `/^[a-z0-9-]+$/`. |
| `skill_path` | string | ✅ | Relative path from project root to the agent's skill Markdown file. |
| `log_file` | string | ✅ | Relative path from project root to the agent's log file. |
| `mention_id` | string | ✅ | Discord role snowflake ID. Must match `/^\d+$/`. Used to route `<@&ID>` mentions to agents. |
| `display_name` | string | _(optional)_ | Human-readable name shown in embeds and logs. Defaults to `id` if absent. |

---

## Validation Errors

If `ptah.config.json` contains invalid entries, Ptah will log validation errors at startup via `buildAgentRegistry()`. The orchestrator starts with only the valid agents — invalid entries are skipped.

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `agents[N].id is missing or empty` | `id` field is absent or `""` | Add a non-empty `id` |
| `agents[N].id "X" is invalid. Must match /^[a-z0-9-]+$/` | `id` contains uppercase, spaces, or special chars | Use only lowercase letters, digits, and hyphens |
| `agents[N].skill_path is missing or empty` | `skill_path` field is absent or `""` | Add a valid path to the skill file |
| `agents[N].log_file is missing or empty` | `log_file` field is absent or `""` | Add a valid path to the log file |
| `agents[N].mention_id is missing or empty` | `mention_id` field is absent or `""` | Add the Discord role snowflake ID |
| `agents[N].mention_id "X" is invalid. Must match /^\d+$/` | `mention_id` contains non-digit characters | Use the raw numeric Discord role ID |
| `Duplicate agent id "X" at index N (first seen at index M)` | Two entries share the same `id` | Assign unique IDs to each agent |
| `Duplicate mention_id "X" at index N (first seen at index M)` | Two entries share the same Discord role ID | Each agent must have a unique Discord role mention |
| `skill file not found: X` | The `skill_path` does not point to an existing file | Check path is correct relative to the project root |

---

## Notes

- **Backward compatibility**: The old `AgentConfig` object format is still accepted by the config loader for existing deployments. However, support for the old format may be removed in a future version. Migrating to the array format is recommended.
- **Config reload**: Ptah does not hot-reload configuration. After any change to `ptah.config.json`, you must restart the `ptah start` process.
- **Log files**: The `log_file` paths will be created automatically on first write. Parent directories must exist.
