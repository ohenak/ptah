# 016 Messaging Abstraction

Ptah v4 is hardcoded to Discord — the config loader requires Discord fields, agent mention IDs must be Discord snowflakes, and the response poster constructs Discord-specific embeds. This milestone abstracts messaging into a provider interface so Ptah can operate with Discord, Slack, webhooks, or in CLI-only mode without code changes.

After completion, Ptah can run without a Discord server — enabling CI/CD integration, local development workflows, and adoption by teams using different messaging platforms.
