# Discord Bot (Phase 2)

Discord.js client that connects to the configured server, listens for thread messages in `#ptah-updates`, and routes them to the orchestrator. Handles bot lifecycle (connect, reconnect, graceful shutdown) and message filtering (ignores bot messages, requires @role mentions).
