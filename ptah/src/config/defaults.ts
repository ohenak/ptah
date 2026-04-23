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

  "docs/open-questions/pending.md": `# Pending Questions

_Questions from agents will be appended here by the Orchestrator._
`,

  "docs/open-questions/resolved.md": `# Resolved Questions

_Answered questions are moved here from pending.md by the Orchestrator._
`,

  "ptah/skills/pm-author.md": `# PM Author Skill

<!-- TODO: Populate this skill prompt with the pm-author role definition. -->
<!-- This file is loaded by Ptah as the pm-author agent's role prompt. -->
`,

  "ptah/skills/pm-review.md": `# PM Review Skill

<!-- TODO: Populate this skill prompt with the pm-review role definition. -->
<!-- This file is loaded by Ptah as the pm-review agent's role prompt. -->
`,

  "ptah/skills/se-author.md": `# SE Author Skill

<!-- TODO: Populate this skill prompt with the se-author role definition. -->
<!-- This file is loaded by Ptah as the se-author agent's role prompt. -->
`,

  "ptah/skills/se-review.md": `# SE Review Skill

<!-- TODO: Populate this skill prompt with the se-review role definition. -->
<!-- This file is loaded by Ptah as the se-review agent's role prompt. -->
`,

  "ptah/skills/te-author.md": `# TE Author Skill

<!-- TODO: Populate this skill prompt with the te-author role definition. -->
<!-- This file is loaded by Ptah as the te-author agent's role prompt. -->
`,

  "ptah/skills/te-review.md": `# TE Review Skill

<!-- TODO: Populate this skill prompt with the te-review role definition. -->
<!-- This file is loaded by Ptah as the te-review agent's role prompt. -->
`,

  "ptah/skills/tech-lead.md": `# Tech Lead Skill

<!-- TODO: Populate this skill prompt with the tech-lead role definition. -->
<!-- This file is loaded by Ptah as the tech-lead agent's role prompt. -->
`,

  "ptah/skills/se-implement.md": `# SE Implement Skill

<!-- TODO: Populate this skill prompt with the se-implement role definition. -->
<!-- This file is loaded by Ptah as the se-implement agent's role prompt. -->
`,

  "docs/architecture/decisions/.gitkeep": "",
  "docs/architecture/diagrams/.gitkeep": "",
  "ptah/templates/.gitkeep": "",

  "ptah.config.json": "CONFIG_PLACEHOLDER",

  "ptah.workflow.yaml": `version: 1
phases:
  # --- Requirements ---
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm-author
    context_documents:
      - "{feature}/overview"
    transition: req-review
    skip_if:
      field: artifact.exists
      artifact: REQ

  - id: req-review
    name: REQ Review
    type: review
    agent: pm-author
    reviewers:
      default: [se-review, te-review]
    context_documents:
      - "{feature}/REQ"
    transition: req-approved
    revision_bound: 5

  - id: req-approved
    name: Requirements Approved
    type: approved
    transition: fspec-creation

  # --- Functional Specification ---
  - id: fspec-creation
    name: FSPEC Creation
    type: creation
    agent: pm-author
    context_documents:
      - "{feature}/REQ"
    transition: fspec-review

  - id: fspec-review
    name: FSPEC Review
    type: review
    agent: pm-author
    reviewers:
      default: [se-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: fspec-approved
    revision_bound: 5

  - id: fspec-approved
    name: FSPEC Approved
    type: approved
    transition: tspec-creation

  # --- Technical Specification ---
  - id: tspec-creation
    name: TSPEC Creation
    type: creation
    agent: se-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: tspec-review

  - id: tspec-review
    name: TSPEC Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: tspec-approved
    revision_bound: 5

  - id: tspec-approved
    name: TSPEC Approved
    type: approved
    transition: plan-creation

  # --- Execution Plan ---
  - id: plan-creation
    name: PLAN Creation
    type: creation
    agent: se-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: plan-review

  - id: plan-review
    name: PLAN Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: plan-approved
    revision_bound: 5

  - id: plan-approved
    name: PLAN Approved
    type: approved
    transition: properties-creation

  # --- Test Properties ---
  - id: properties-creation
    name: PROPERTIES Creation
    type: creation
    agent: te-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: properties-review

  - id: properties-review
    name: PROPERTIES Review
    type: review
    agent: te-author
    reviewers:
      default: [pm-review, se-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: properties-approved
    revision_bound: 5

  - id: properties-approved
    name: PROPERTIES Approved
    type: approved
    transition: implementation

  # --- Implementation ---
  - id: implementation
    name: Implementation
    type: implementation
    agent: tech-lead
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: properties-tests

  # --- Properties Tests ---
  - id: properties-tests
    name: Properties Tests
    type: creation
    agent: se-implement
    context_documents:
      - "{feature}/REQ"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: implementation-review

  # --- Final Review ---
  - id: implementation-review
    name: Implementation Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: done
    revision_bound: 5

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
      active: [
        "pm-author", "pm-review",
        "se-author", "se-review",
        "te-author", "te-review",
        "tech-lead", "se-implement",
      ],
      skills: {
        "pm-author": "./ptah/skills/pm-author.md",
        "pm-review": "./ptah/skills/pm-review.md",
        "se-author": "./ptah/skills/se-author.md",
        "se-review": "./ptah/skills/se-review.md",
        "te-author": "./ptah/skills/te-author.md",
        "te-review": "./ptah/skills/te-review.md",
        "tech-lead": "./ptah/skills/tech-lead.md",
        "se-implement": "./ptah/skills/se-implement.md",
      },
      colours: {
        "pm-author": "#1F4E79",
        "pm-review": "#1F4E79",
        "se-author": "#E65100",
        "se-review": "#E65100",
        "te-author": "#1B5E20",
        "te-review": "#1B5E20",
        "tech-lead": "#6A1B9A",
        "se-implement": "#37474F",
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
