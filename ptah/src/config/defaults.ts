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

  "ptah.workflow.yaml": `# Ptah Workflow Configuration
#
# This file configures the PDLC workflow phases for this project.
# It is loaded at startup and validated against the agent registry.
# See: https://github.com/ohenak/ptah for documentation.

version: 1
phases:
  # --- Requirements ---
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm
    context_documents:
      - "{feature}/overview"
    transition: req-review

  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      backend-only: [eng, qa]
      frontend-only: [fe, qa]
      fullstack: [eng, fe, qa]
    context_documents:
      - "{feature}/REQ"
    transition: req-approved
    revision_bound: 3

  - id: req-approved
    name: Requirements Approved
    type: approved
    transition: fspec-creation

  # --- Functional Specification ---
  - id: fspec-creation
    name: Functional Specification Creation
    type: creation
    agent: pm
    skip_if:
      field: config.skipFspec
      equals: true
    context_documents:
      - "{feature}/REQ"
    transition: fspec-review

  - id: fspec-review
    name: Functional Specification Review
    type: review
    skip_if:
      field: config.skipFspec
      equals: true
    reviewers:
      backend-only: [eng, qa]
      frontend-only: [fe, qa]
      fullstack: [eng, fe, qa]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: fspec-approved
    revision_bound: 3

  - id: fspec-approved
    name: Functional Specification Approved
    type: approved
    skip_if:
      field: config.skipFspec
      equals: true
    transition: tspec-creation

  # --- Technical Specification ---
  - id: tspec-creation
    name: Technical Specification Creation
    type: creation
    agent: eng
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: tspec-review

  - id: tspec-review
    name: Technical Specification Review
    type: review
    reviewers:
      backend-only: [pm, qa]
      frontend-only: [pm, qa]
      fullstack: [pm, qa, fe, eng]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: tspec-approved
    revision_bound: 3

  - id: tspec-approved
    name: Technical Specification Approved
    type: approved
    transition: plan-creation

  # --- Execution Plan ---
  - id: plan-creation
    name: Execution Plan Creation
    type: creation
    agent: eng
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: plan-review

  - id: plan-review
    name: Execution Plan Review
    type: review
    reviewers:
      backend-only: [pm, qa]
      frontend-only: [pm, qa]
      fullstack: [pm, qa, fe, eng]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: plan-approved
    revision_bound: 3

  - id: plan-approved
    name: Execution Plan Approved
    type: approved
    transition: properties-creation

  # --- Test Properties ---
  - id: properties-creation
    name: Test Properties Creation
    type: creation
    agent: qa
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: properties-review

  - id: properties-review
    name: Test Properties Review
    type: review
    reviewers:
      backend-only: [pm, eng]
      frontend-only: [pm, fe]
      fullstack: [pm, eng, fe]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: properties-approved
    revision_bound: 3

  # --- Implementation ---
  - id: properties-approved
    name: Test Properties Approved
    type: approved
    transition: implementation

  - id: implementation
    name: Implementation
    type: implementation
    agent: eng
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: implementation-review

  - id: implementation-review
    name: Implementation Review
    type: review
    reviewers:
      default: [qa]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: done
    revision_bound: 3

  - id: done
    name: Done
    type: approved
`,
};

export function buildConfig(projectName: string): string {
  const name = projectName === "" ? "my-app" : projectName;

  const config = {
    project: {
      name,
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
      role_mentions: {},
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
      retry_base_delay_ms: 2000,
      retry_max_delay_ms: 30000,
      shutdown_timeout_ms: 60000,
      token_budget: {
        layer1_pct: 0.15,
        layer2_pct: 0.45,
        layer3_pct: 0.10,
        thread_pct: 0.15,
        headroom_pct: 0.15,
      },
    },
    git: {
      commit_prefix: "[ptah]",
      auto_commit: true,
    },
    docs: {
      root: "docs",
      templates: "./ptah/templates",
    },
    temporal: {
      address: "localhost:7233",
      namespace: "default",
      taskQueue: "ptah-main",
      worker: {
        maxConcurrentWorkflowTasks: 10,
        maxConcurrentActivities: 3,
      },
      retry: {
        maxAttempts: 3,
        initialIntervalSeconds: 30,
        backoffCoefficient: 2.0,
        maxIntervalSeconds: 600,
      },
      heartbeat: {
        intervalSeconds: 30,
        timeoutSeconds: 120,
      },
    },
  };

  return JSON.stringify(config, null, 2) + "\n";
}
