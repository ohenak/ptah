import { describe, it, expect } from "vitest";
import {
  DIRECTORY_MANIFEST,
  FILE_MANIFEST,
  buildConfig,
} from "../../../src/config/defaults.js";

// Task 9: DIRECTORY_MANIFEST
describe("DIRECTORY_MANIFEST", () => {
  const expectedDirs = [
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

  it("contains exactly 9 directories", () => {
    expect(DIRECTORY_MANIFEST).toHaveLength(9);
  });

  it("contains all required directories in correct order", () => {
    expect(DIRECTORY_MANIFEST).toEqual(expectedDirs);
  });

  it("does not contain docs/threads/", () => {
    expect(DIRECTORY_MANIFEST).not.toContain("docs/threads");
    expect(DIRECTORY_MANIFEST).not.toContain("docs/threads/");
  });
});

// Task 10 / Phase 4 Task 4.1: FILE_MANIFEST
describe("FILE_MANIFEST", () => {
  it("contains exactly 20 entries (removed 6 old stubs, added 8 new skill stubs)", () => {
    expect(Object.keys(FILE_MANIFEST)).toHaveLength(20);
  });

  it("contains ptah.workflow.yaml with workflow configuration", () => {
    expect(FILE_MANIFEST).toHaveProperty("ptah.workflow.yaml");
    expect(FILE_MANIFEST["ptah.workflow.yaml"]).toContain("version: 1");
    expect(FILE_MANIFEST["ptah.workflow.yaml"]).toContain("phases:");
    expect(FILE_MANIFEST["ptah.workflow.yaml"]).toContain("req-creation");
  });

  it("contains all base content files (excluding old agent stubs)", () => {
    const contentFiles = [
      "docs/overview.md",
      "docs/initial_project/requirements.md",
      "docs/initial_project/specifications.md",
      "docs/initial_project/plans.md",
      "docs/initial_project/properties.md",
      "docs/open-questions/pending.md",
      "docs/open-questions/resolved.md",
      "ptah.config.json",
    ];
    for (const file of contentFiles) {
      expect(FILE_MANIFEST).toHaveProperty(file);
    }
  });

  it("contains all 8 new skill stub files", () => {
    const newSkillFiles = [
      "ptah/skills/pm-author.md",
      "ptah/skills/pm-review.md",
      "ptah/skills/se-author.md",
      "ptah/skills/se-review.md",
      "ptah/skills/te-author.md",
      "ptah/skills/te-review.md",
      "ptah/skills/tech-lead.md",
      "ptah/skills/se-implement.md",
    ];
    for (const file of newSkillFiles) {
      expect(FILE_MANIFEST).toHaveProperty(file);
    }
  });

  it("does NOT contain old skill stub files (pm-agent.md, dev-agent.md, test-agent.md)", () => {
    expect(FILE_MANIFEST).not.toHaveProperty("ptah/skills/pm-agent.md");
    expect(FILE_MANIFEST).not.toHaveProperty("ptah/skills/dev-agent.md");
    expect(FILE_MANIFEST).not.toHaveProperty("ptah/skills/test-agent.md");
  });

  it("does NOT contain old agent-log stubs", () => {
    expect(FILE_MANIFEST).not.toHaveProperty("docs/agent-logs/pm-agent.md");
    expect(FILE_MANIFEST).not.toHaveProperty("docs/agent-logs/dev-agent.md");
    expect(FILE_MANIFEST).not.toHaveProperty("docs/agent-logs/test-agent.md");
  });

  it("contains 3 .gitkeep files with empty content", () => {
    const gitkeepFiles = [
      "docs/architecture/decisions/.gitkeep",
      "docs/architecture/diagrams/.gitkeep",
      "ptah/templates/.gitkeep",
    ];
    for (const file of gitkeepFiles) {
      expect(FILE_MANIFEST).toHaveProperty(file);
      expect(FILE_MANIFEST[file]).toBe("");
    }
  });

  it("docs/overview.md contains project goals, stakeholders, scope, and technical context sections", () => {
    const content = FILE_MANIFEST["docs/overview.md"];
    expect(content).toContain("# Project Overview");
    expect(content).toContain("## Project Goals");
    expect(content).toContain("## Stakeholders");
    expect(content).toContain("## Scope");
    expect(content).toContain("## Technical Context");
  });

  it("docs/initial_project/ contains 4 template files with correct headers", () => {
    expect(FILE_MANIFEST["docs/initial_project/requirements.md"]).toContain("# Requirements");
    expect(FILE_MANIFEST["docs/initial_project/specifications.md"]).toContain("# Specifications");
    expect(FILE_MANIFEST["docs/initial_project/plans.md"]).toContain("# Plans");
    expect(FILE_MANIFEST["docs/initial_project/properties.md"]).toContain("# Properties");
  });

  it("open-questions files contain correct headers and stubs", () => {
    const pending = FILE_MANIFEST["docs/open-questions/pending.md"];
    expect(pending).toContain("# Pending Questions");
    expect(pending).toContain("_Questions from agents will be appended here by the Orchestrator._");

    const resolved = FILE_MANIFEST["docs/open-questions/resolved.md"];
    expect(resolved).toContain("# Resolved Questions");
    expect(resolved).toContain("_Answered questions are moved here from pending.md by the Orchestrator._");
  });

  it("new skill stub files contain correct header and role names", () => {
    expect(FILE_MANIFEST["ptah/skills/pm-author.md"]).toContain("# PM Author Skill");
    expect(FILE_MANIFEST["ptah/skills/pm-review.md"]).toContain("# PM Review Skill");
    expect(FILE_MANIFEST["ptah/skills/se-author.md"]).toContain("# SE Author Skill");
    expect(FILE_MANIFEST["ptah/skills/se-review.md"]).toContain("# SE Review Skill");
    expect(FILE_MANIFEST["ptah/skills/te-author.md"]).toContain("# TE Author Skill");
    expect(FILE_MANIFEST["ptah/skills/te-review.md"]).toContain("# TE Review Skill");
    expect(FILE_MANIFEST["ptah/skills/tech-lead.md"]).toContain("# Tech Lead Skill");
    expect(FILE_MANIFEST["ptah/skills/se-implement.md"]).toContain("# SE Implement Skill");
  });

  it("ptah.config.json is a function (built via buildConfig)", () => {
    // FILE_MANIFEST entry for ptah.config.json should be the CONFIG_PLACEHOLDER
    // that gets replaced by buildConfig() during execution
    expect(FILE_MANIFEST["ptah.config.json"]).toBeDefined();
  });

  // Phase 4 Task 4.3: ptah.workflow.yaml template contains all 19 phases
  it("ptah.workflow.yaml template contains all 19 phases", () => {
    const yaml = FILE_MANIFEST["ptah.workflow.yaml"];
    const expectedPhaseIds = [
      "req-creation", "req-review", "req-approved",
      "fspec-creation", "fspec-review", "fspec-approved",
      "tspec-creation", "tspec-review", "tspec-approved",
      "plan-creation", "plan-review", "plan-approved",
      "properties-creation", "properties-review", "properties-approved",
      "implementation",
      "properties-tests",
      "implementation-review",
      "done",
    ];
    for (const phaseId of expectedPhaseIds) {
      expect(yaml, `Expected phase "${phaseId}" in ptah.workflow.yaml`).toContain(phaseId);
    }
  });

  it("ptah.workflow.yaml uses revision_bound: 5 on all 6 review phases", () => {
    const yaml = FILE_MANIFEST["ptah.workflow.yaml"];
    const matches = yaml.match(/revision_bound:\s*5/g);
    // 6 review phases: req-review, fspec-review, tspec-review, plan-review, properties-review, implementation-review
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(6);
  });

  it("ptah.workflow.yaml has skip_if artifact.exists on req-creation", () => {
    const yaml = FILE_MANIFEST["ptah.workflow.yaml"];
    expect(yaml).toContain("field: artifact.exists");
    expect(yaml).toContain("artifact: REQ");
  });

  it("ptah.workflow.yaml uses default: discipline key for reviewers (no backend-only/frontend-only/fullstack)", () => {
    const yaml = FILE_MANIFEST["ptah.workflow.yaml"];
    expect(yaml).toContain("default:");
    expect(yaml).not.toContain("backend-only:");
    expect(yaml).not.toContain("frontend-only:");
    expect(yaml).not.toContain("fullstack:");
  });

  it("ptah.workflow.yaml has properties-tests phase between implementation and implementation-review", () => {
    const yaml = FILE_MANIFEST["ptah.workflow.yaml"];
    const implIdx = yaml.indexOf("id: implementation\n");
    const propTestsIdx = yaml.indexOf("id: properties-tests");
    const implReviewIdx = yaml.indexOf("id: implementation-review");
    expect(implIdx).toBeGreaterThan(-1);
    expect(propTestsIdx).toBeGreaterThan(-1);
    expect(implReviewIdx).toBeGreaterThan(-1);
    expect(implIdx).toBeLessThan(propTestsIdx);
    expect(propTestsIdx).toBeLessThan(implReviewIdx);
  });
});

// Task 11 / Phase 4 Task 4.2: buildConfig
describe("buildConfig", () => {
  it("uses provided project name", () => {
    const config = buildConfig("my-project");
    const parsed = JSON.parse(config);
    expect(parsed.project.name).toBe("my-project");
  });

  it("falls back to 'my-app' when project name is empty string", () => {
    const config = buildConfig("");
    const parsed = JSON.parse(config);
    expect(parsed.project.name).toBe("my-app");
  });

  // Phase 4 Task 4.2: 8 agents in agents.active
  it("produces 8 agents in agents.active", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);
    expect(parsed.agents.active).toHaveLength(8);
    expect(parsed.agents.active).toEqual([
      "pm-author", "pm-review",
      "se-author", "se-review",
      "te-author", "te-review",
      "tech-lead", "se-implement",
    ]);
  });

  // Phase 4 Task 4.2: 8 corresponding skill paths in agents.skills
  it("produces 8 skill paths in agents.skills", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);
    expect(Object.keys(parsed.agents.skills)).toHaveLength(8);
    expect(parsed.agents.skills["pm-author"]).toBe("./ptah/skills/pm-author.md");
    expect(parsed.agents.skills["pm-review"]).toBe("./ptah/skills/pm-review.md");
    expect(parsed.agents.skills["se-author"]).toBe("./ptah/skills/se-author.md");
    expect(parsed.agents.skills["se-review"]).toBe("./ptah/skills/se-review.md");
    expect(parsed.agents.skills["te-author"]).toBe("./ptah/skills/te-author.md");
    expect(parsed.agents.skills["te-review"]).toBe("./ptah/skills/te-review.md");
    expect(parsed.agents.skills["tech-lead"]).toBe("./ptah/skills/tech-lead.md");
    expect(parsed.agents.skills["se-implement"]).toBe("./ptah/skills/se-implement.md");
  });

  it("contains all required default fields", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);

    expect(parsed.agents.model).toBe("claude-sonnet-4-6");
    expect(parsed.orchestrator.max_turns_per_thread).toBe(10);
    expect(parsed.orchestrator.retry_attempts).toBe(3);
    expect(parsed.git.commit_prefix).toBe("[ptah]");
    expect(parsed.git.auto_commit).toBe(true);
  });

  // Task 135: buildConfig includes agents.colours, agents.role_mentions, orchestrator.token_budget
  it("includes agents.colours in generated config", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);
    expect(parsed.agents.colours).toBeDefined();
    expect(typeof parsed.agents.colours).toBe("object");
  });

  it("includes agents.role_mentions placeholder in generated config", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);
    expect(parsed.agents.role_mentions).toBeDefined();
    expect(typeof parsed.agents.role_mentions).toBe("object");
  });

  it("includes orchestrator.token_budget in generated config", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);
    expect(parsed.orchestrator.token_budget).toBeDefined();
    expect(parsed.orchestrator.token_budget.layer1_pct).toBe(0.15);
    expect(parsed.orchestrator.token_budget.layer2_pct).toBe(0.45);
  });

  it("contains discord section with env var name for bot token", () => {
    const config = buildConfig("test");
    const parsed = JSON.parse(config);
    expect(parsed.discord.bot_token_env).toBe("DISCORD_BOT_TOKEN");
  });

  it("produces valid JSON", () => {
    const config = buildConfig("test");
    expect(() => JSON.parse(config)).not.toThrow();
  });
});

// Task 12: No secrets in config
describe("buildConfig security", () => {
  it("does not contain ANTHROPIC_API_KEY in any form", () => {
    const config = buildConfig("test");
    expect(config).not.toContain("ANTHROPIC_API_KEY");
  });

  it("references DISCORD_BOT_TOKEN only as env var name, not a value", () => {
    const config = buildConfig("test");
    const parsed = JSON.parse(config);
    // bot_token_env is the env var name field — it should exist
    expect(parsed.discord.bot_token_env).toBe("DISCORD_BOT_TOKEN");
    // There should be no field called bot_token with an actual value
    expect(parsed.discord.bot_token).toBeUndefined();
  });

  it("does not contain any string that looks like a secret token", () => {
    const config = buildConfig("test");
    // Check there are no long alphanumeric strings that could be tokens
    expect(config).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(config).not.toMatch(/xoxb-[a-zA-Z0-9-]+/);
  });
});

// Task 12b: Config agents.skills paths match FILE_MANIFEST
describe("config-skills path consistency", () => {
  it("every agents.skills path corresponds to a FILE_MANIFEST entry", () => {
    const config = buildConfig("test");
    const parsed = JSON.parse(config);
    const skillPaths = Object.values(parsed.agents.skills) as string[];

    for (const skillPath of skillPaths) {
      // Normalize: remove leading "./" to match FILE_MANIFEST keys
      const normalizedPath = skillPath.replace(/^\.\//, "");
      expect(
        FILE_MANIFEST,
        `Expected FILE_MANIFEST to contain "${normalizedPath}" (from agents.skills path "${skillPath}")`
      ).toHaveProperty(normalizedPath);
    }
  });
});
