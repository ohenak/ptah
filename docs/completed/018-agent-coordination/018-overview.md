# 018 Agent Coordination

Two runtime coordination gaps discovered during feature 016 execution.

First, agents create isolated per-agent branches (`ptah/{slug}/{agent}/{phase}`), so each agent works in a private worktree and cannot read artifacts committed by agents in earlier phases. This breaks the fundamental assumption that downstream agents (engineer, QA) can read upstream artifacts (PM's REQ).

Second, user messages sent to a feature's Discord thread are only routed to whichever workflow phase is currently active. A user message that explicitly addresses a specific agent (e.g. `@product-manager address feedback from CROSS-REVIEW-engineer-REQ.md`) is silently dropped or mishandled, with no mechanism to dispatch it as an ad-hoc revision request to the named agent.
