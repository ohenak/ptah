# Orchestrator Discord Commands

## Problem

Today, new features can only be bootstrapped into the Ptah PDLC by editing the repository directly — a human must create the feature folder, write `overview.md`, commit, and push before any Discord-triggered workflow can do anything useful. There is no way for a user to say "I have an idea, please create a backlog entry for it" from Discord and have the orchestrator seed the feature folder on their behalf.

Additionally, the project currently has no Discord mention identity for the orchestrator itself. All mentions today are agent mentions (`@pm`, `@eng`, `@qa`), and they all start or continue a feature-lifecycle workflow. There is no mention that targets the orchestrator directly to issue non-workflow commands.

## Goal

Introduce a configurable Discord mention identity for the Ptah orchestrator and a small set of orchestrator-level commands that are dispatched when that mention is used. The first command is `create backlog`, which seeds a new feature folder in `docs/backlog/` from a natural-language description supplied by the user. A `help` command is included for discoverability.

The orchestrator mention must be fully configurable per deployment — the name and snowflake ID are never hardcoded and never defaulted to any specific handle. Every deployment supplies its own mention in `ptah.config.json`. The handle `@ptah` is used throughout this document only as an illustration.

This feature **does not** fix the existing REQ-overwrite bug or add a `start review REQ` command. That fix is tracked separately in `fix-req-overwrite-on-start` and must land first (or in parallel) so that the backlog entries this feature creates can then be driven through the lifecycle safely.

## Scope

### In scope

- A new configuration field in `ptah.config.json` that identifies the Discord mention (user or role snowflake) dispatched as "the orchestrator".
- Mention-based dispatch that is strictly disambiguated from agent mentions.
- A case-insensitive command parser that tolerates surrounding text and quoted arguments.
- `create backlog "<description>"` — creates `docs/backlog/<slug>/overview.md` on a chore branch, commits, pushes, and replies in the invoking Discord channel or thread with the slug and a link.
- Optional inline `--slug=<slug>` override for auto-derived slugs.
- `help` — lists supported commands and their syntax.
- An authorization allowlist so only approved users can issue orchestrator commands.
- Specific, actionable error messages for unknown commands, missing arguments, duplicate slugs, and infrastructure failures.

### Out of scope

- Any `start review REQ` command or any other workflow-start command.
- Any fix to the existing `startNewWorkflow` REQ-overwrite bug (see `fix-req-overwrite-on-start`).
- Any change to the semantics of agent mentions (`@pm`, `@eng`, `@qa`), which continue to trigger the existing ad-hoc directive routing unchanged.
- Promotion of backlog entries into `in-progress/` — that happens later in the lifecycle when the workflow is started.
