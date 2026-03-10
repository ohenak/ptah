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

// Task 10: FILE_MANIFEST
describe("FILE_MANIFEST", () => {
  it("contains exactly 17 entries (14 content + 3 .gitkeep)", () => {
    expect(Object.keys(FILE_MANIFEST)).toHaveLength(17);
  });

  it("contains all 14 content files", () => {
    const contentFiles = [
      "docs/overview.md",
      "docs/initial_project/requirements.md",
      "docs/initial_project/specifications.md",
      "docs/initial_project/plans.md",
      "docs/initial_project/properties.md",
      "docs/agent-logs/pm-agent.md",
      "docs/agent-logs/dev-agent.md",
      "docs/agent-logs/test-agent.md",
      "docs/open-questions/pending.md",
      "docs/open-questions/resolved.md",
      "ptah/skills/pm-agent.md",
      "ptah/skills/dev-agent.md",
      "ptah/skills/test-agent.md",
      "ptah.config.json",
    ];
    for (const file of contentFiles) {
      expect(FILE_MANIFEST).toHaveProperty(file);
    }
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

  it("agent log files contain correct headers", () => {
    expect(FILE_MANIFEST["docs/agent-logs/pm-agent.md"]).toContain("# PM Agent Log");
    expect(FILE_MANIFEST["docs/agent-logs/dev-agent.md"]).toContain("# Dev Agent Log");
    expect(FILE_MANIFEST["docs/agent-logs/test-agent.md"]).toContain("# Test Agent Log");
  });

  it("open-questions files contain correct headers and stubs", () => {
    const pending = FILE_MANIFEST["docs/open-questions/pending.md"];
    expect(pending).toContain("# Pending Questions");
    expect(pending).toContain("_Questions from agents will be appended here by the Orchestrator._");

    const resolved = FILE_MANIFEST["docs/open-questions/resolved.md"];
    expect(resolved).toContain("# Resolved Questions");
    expect(resolved).toContain("_Answered questions are moved here from pending.md by the Orchestrator._");
  });

  it("skill placeholder files contain correct content", () => {
    expect(FILE_MANIFEST["ptah/skills/pm-agent.md"]).toContain("# PM Agent Skill");
    expect(FILE_MANIFEST["ptah/skills/dev-agent.md"]).toContain("# Dev Agent Skill");
    expect(FILE_MANIFEST["ptah/skills/test-agent.md"]).toContain("# Test Agent Skill");
  });

  it("ptah.config.json is a function (built via buildConfig)", () => {
    // FILE_MANIFEST entry for ptah.config.json should be the CONFIG_PLACEHOLDER
    // that gets replaced by buildConfig() during execution
    expect(FILE_MANIFEST["ptah.config.json"]).toBeDefined();
  });
});

// Task 11: buildConfig
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

  it("contains all required default fields", () => {
    const config = buildConfig("test-project");
    const parsed = JSON.parse(config);

    expect(parsed.agents.model).toBe("claude-sonnet-4-6");
    expect(parsed.agents.active).toEqual(["pm-agent", "dev-agent", "test-agent"]);
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
