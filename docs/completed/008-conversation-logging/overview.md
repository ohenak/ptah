# Conversation Logging (Phase 8)

Full conversation logging for agent skill invocations. Each time the orchestrator invokes a skill, the complete system prompt, user message, and agent response are written to a local log file for later troubleshooting and auditing.

## Problem

The existing `AgentLogWriter` (`src/orchestrator/agent-log-writer.ts`) only records a one-line summary row per invocation (date, thread, status, commit SHA, summary) to `docs/agent-logs/{agent-id}.md`. When a skill produces unexpected output or fails mid-conversation, there is no way to inspect what prompt was sent or what the agent actually said.

## Goal

After each skill invocation (success or failure), write a Markdown log file containing:

1. **Metadata** — timestamp, agent ID, thread name, thread ID, duration, worktree path
2. **System prompt** — the full assembled `bundle.systemPrompt`
3. **User message** — the full assembled `bundle.userMessage`
4. **Agent response** — the full `result.textResponse`
5. **Artifact changes** — list of files changed (`result.artifactChanges`)
6. **Routing signal** — the raw routing signal extracted from the response

## Where the data lives

All data is already available in `orchestrator.ts` at the invocation site (~line 306):

- `bundle: ContextBundle` has `systemPrompt`, `userMessage`, `agentId`, `threadId`, `featureName`, `turnNumber`
- `result: InvocationResult` has `textResponse`, `routingSignalRaw`, `artifactChanges`, `durationMs`
- `triggerMessage: ThreadMessage` has `threadName`
- `worktreePath: string` is the git worktree path

## Proposed design

- **Log directory:** `ptah/docs/agent-logs/conversations/` (gitignored — these are local-only debug artifacts, not committed)
- **File naming:** `{threadName}_{agentId}_{ISO-timestamp}.md` (slugified thread name, e.g. `guardrails_pm_2026-03-13T10-30-00.md`)
- **Write location:** In the orchestrator's `executeRoutingLoop()`, after `skillInvoker.invoke()` returns (for success) or in the catch block (for errors — log what was sent even if the response failed)
- **Interface:** New `ConversationLogger` protocol with a single `log(entry)` method, injected into the orchestrator alongside the existing `AgentLogWriter`
- **Error handling:** Best-effort write (try/catch, warn on failure) — must not block the pipeline
- **Filesystem:** Use the existing `FileSystem` protocol, write to the main repo (not the worktree) since worktrees are cleaned up after merge

## Integration points

| File | Change |
|------|--------|
| `src/types.ts` | Add `ConversationLogEntry` interface |
| `src/orchestrator/conversation-logger.ts` | New file: `ConversationLogger` protocol + `DefaultConversationLogger` implementation |
| `src/orchestrator/orchestrator.ts` | Inject `ConversationLogger`, call `log()` after skill invocation (success path and error path) |
| `bin/ptah.ts` | Wire up `DefaultConversationLogger` in composition root |
| `tests/fixtures/factories.ts` | Add `FakeConversationLogger` |
| `.gitignore` | Add `docs/agent-logs/conversations/` |

## Existing patterns to follow

- `AgentLogWriter` interface + `DefaultAgentLogWriter` implementation pattern
- Best-effort writes with `MergeLock` for concurrent access
- `formatAgentName()` utility in `agent-log-writer.ts` for display names
- `FileSystem.mkdir()` + `FileSystem.writeFile()` for file creation
