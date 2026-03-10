export const DIRECTORY_MANIFEST: string[] = [
  "docs",
  "docs/initial_project",
  "docs/architecture",
  "docs/architecture/decisions",
  "docs/architecture/diagrams",
  "docs/open-questions",
  "docs/agent-logs",
  "ptah/skills",
  "ptah/templates",
];

export const FILE_MANIFEST: Record<string, string> = {
  "docs/overview.md": `# Project Overview

## Project Goals

_Describe what this project aims to achieve._

## Stakeholders

_List who is involved and their roles._

## Scope

_Define what is in scope and out of scope._

## Technical Context

_Key technical decisions, constraints, or dependencies._
`,

  "docs/initial_project/requirements.md": `# Requirements

_This file will be populated by the PM Agent._
`,

  "docs/initial_project/specifications.md": `# Specifications

_This file will be populated by the PM Agent._
`,

  "docs/initial_project/plans.md": `# Plans

_This file will be populated by the Dev Agent._
`,

  "docs/initial_project/properties.md": `# Properties

_This file will be populated by the Test Agent._
`,

  "docs/agent-logs/pm-agent.md": `# PM Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
`,

  "docs/agent-logs/dev-agent.md": `# Dev Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
`,

  "docs/agent-logs/test-agent.md": `# Test Agent Log

_Entries appended by the Orchestrator after each Skill invocation._
`,

  "docs/open-questions/pending.md": `# Pending Questions

_Questions from agents will be appended here by the Orchestrator._
`,

  "docs/open-questions/resolved.md": `# Resolved Questions

_Answered questions are moved here from pending.md by the Orchestrator._
`,

  "ptah/skills/pm-agent.md": `# PM Agent Skill

<!-- TODO: Define the PM Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the PM Agent's role prompt. -->
`,

  "ptah/skills/dev-agent.md": `# Dev Agent Skill

<!-- TODO: Define the Dev Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the Dev Agent's role prompt. -->
`,

  "ptah/skills/test-agent.md": `# Test Agent Skill

<!-- TODO: Define the Test Agent system prompt during Phase 2. -->
<!-- This file is loaded by the Orchestrator as the Test Agent's role prompt. -->
`,

  "docs/architecture/decisions/.gitkeep": "",
  "docs/architecture/diagrams/.gitkeep": "",
  "ptah/templates/.gitkeep": "",

  "ptah.config.json": "CONFIG_PLACEHOLDER",
};

export function buildConfig(projectName: string): string {
  const name = projectName === "" ? "my-app" : projectName;

  const config = {
    project: {
      name,
      version: "1.0.0",
    },
    agents: {
      active: ["pm-agent", "dev-agent", "test-agent"],
      skills: {
        "pm-agent": "./ptah/skills/pm-agent.md",
        "dev-agent": "./ptah/skills/dev-agent.md",
        "test-agent": "./ptah/skills/test-agent.md",
      },
      colours: {
        "pm-agent": "#1F4E79",
        "dev-agent": "#E65100",
        "frontend-agent": "#6A1B9A",
        "test-agent": "#1B5E20",
      },
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
    },
    discord: {
      bot_token_env: "DISCORD_BOT_TOKEN",
      server_id: "YOUR_SERVER_ID",
      channels: {
        updates: "agent-updates",
        questions: "open-questions",
        debug: "agent-debug",
      },
      mention_user_id: "YOUR_USER_ID",
    },
    orchestrator: {
      max_turns_per_thread: 10,
      pending_poll_seconds: 30,
      retry_attempts: 3,
    },
    git: {
      commit_prefix: "[ptah]",
      auto_commit: true,
    },
    docs: {
      root: "docs",
      templates: "./ptah/templates",
    },
  };

  return JSON.stringify(config, null, 2) + "\n";
}
