import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { NodeConfigLoader } from "../../../src/config/loader.js";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import type { PtahConfig } from "../../../src/types.js";

// Task 40: Config loader pipeline integration test
// Tests NodeConfigLoader + NodeFileSystem end-to-end with real filesystem
describe("NodeConfigLoader integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(
      nodePath.join(os.tmpdir(), "ptah-config-int-"),
    );
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads and parses a valid ptah.config.json from the filesystem", async () => {
    const expected: PtahConfig = {
      project: {
        name: "test-project",
        version: "1.0.0",
      },
      agents: {
        active: ["pm-agent", "dev-agent", "test-agent"],
        skills: {
          "pm-agent": "./ptah/skills/pm-agent.md",
          "dev-agent": "./ptah/skills/dev-agent.md",
          "test-agent": "./ptah/skills/test-agent.md",
        },
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
      },
      discord: {
        bot_token_env: "DISCORD_BOT_TOKEN",
        server_id: "test-server-123",
        channels: {
          updates: "agent-updates",
          questions: "open-questions",
          debug: "agent-debug",
        },
        mention_user_id: "test-user-456",
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

    await nodeFs.writeFile(
      nodePath.join(tempDir, "ptah.config.json"),
      JSON.stringify(expected, null, 2),
    );

    const fs = new NodeFileSystem(tempDir);
    const loader = new NodeConfigLoader(fs);
    const result = await loader.load();

    expect(result).toEqual(expected);
    expect(result.project.name).toBe("test-project");
    expect(result.discord.server_id).toBe("test-server-123");
    expect(result.discord.channels.updates).toBe("agent-updates");
    expect(result.discord.mention_user_id).toBe("test-user-456");
  });

  it("throws ENOENT-based error when ptah.config.json does not exist", async () => {
    const fs = new NodeFileSystem(tempDir);
    const loader = new NodeConfigLoader(fs);

    await expect(loader.load()).rejects.toThrow(
      "ptah.config.json not found. Run 'ptah init' first.",
    );
  });
});
