import { describe, it, expect, beforeEach } from "vitest";
import { NodeConfigLoader, isNodeError } from "../../../src/config/loader.js";
import { FakeFileSystem, defaultTestConfig, makeAgentEntry } from "../../fixtures/factories.js";

describe("NodeConfigLoader", () => {
  let fs: FakeFileSystem;
  let loader: NodeConfigLoader;

  beforeEach(() => {
    fs = new FakeFileSystem();
    loader = new NodeConfigLoader(fs);
  });

  // Task 12: File not found + non-ENOENT error + isNodeError utility
  describe("file read errors", () => {
    it("throws 'ptah.config.json not found' when readFile throws ENOENT", async () => {
      // FakeFileSystem throws ENOENT by default for missing files
      await expect(loader.load()).rejects.toThrow(
        "ptah.config.json not found. Run 'ptah init' first."
      );
    });

    it("throws 'Failed to read ptah.config.json' for non-ENOENT errors", async () => {
      // Create a FakeFileSystem that throws a non-ENOENT error
      const permError = new Error("Permission denied") as NodeJS.ErrnoException;
      permError.code = "EACCES";

      const errorFs = new FakeFileSystem();
      // Override readFile to throw a non-ENOENT error
      errorFs.readFile = async () => {
        throw permError;
      };

      const errorLoader = new NodeConfigLoader(errorFs);
      await expect(errorLoader.load()).rejects.toThrow(
        "Failed to read ptah.config.json: Permission denied"
      );
    });

    it("throws 'Failed to read' with String(error) for non-Error objects", async () => {
      const errorFs = new FakeFileSystem();
      errorFs.readFile = async () => {
        throw "raw string error";
      };

      const errorLoader = new NodeConfigLoader(errorFs);
      await expect(errorLoader.load()).rejects.toThrow(
        "Failed to read ptah.config.json: raw string error"
      );
    });
  });

  // Task 12: isNodeError utility
  describe("isNodeError", () => {
    it("returns true for Error with code property", () => {
      const error = new Error("test") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      expect(isNodeError(error)).toBe(true);
    });

    it("returns false for plain Error without code", () => {
      expect(isNodeError(new Error("test"))).toBe(false);
    });

    it("returns false for non-Error objects", () => {
      expect(isNodeError("not an error")).toBe(false);
      expect(isNodeError(null)).toBe(false);
      expect(isNodeError(undefined)).toBe(false);
      expect(isNodeError(42)).toBe(false);
    });
  });

  // Task 13: Invalid JSON
  describe("invalid JSON", () => {
    it("throws 'ptah.config.json contains invalid JSON' for malformed JSON", async () => {
      fs.addExisting("ptah.config.json", "{ not valid json }");

      await expect(loader.load()).rejects.toThrow(
        /ptah\.config\.json contains invalid JSON:/
      );
    });
  });

  // Task 14: Structural validation
  describe("structural validation", () => {
    it('throws when discord section is missing', async () => {
      const config = { project: { name: "test", version: "1.0.0" } };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing the "discord" section.'
      );
    });

    it('throws when discord.channels is missing', async () => {
      const config = {
        discord: {
          server_id: "123",
          bot_token_env: "TOKEN",
          mention_user_id: "456",
        },
      };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing "discord.channels".'
      );
    });

    it('throws when discord.server_id is missing', async () => {
      const config = {
        discord: {
          bot_token_env: "TOKEN",
          channels: { updates: "updates" },
          mention_user_id: "456",
        },
      };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing "discord.server_id".'
      );
    });

    it('throws when discord.bot_token_env is missing', async () => {
      const config = {
        discord: {
          server_id: "123",
          channels: { updates: "updates" },
          mention_user_id: "456",
        },
      };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing "discord.bot_token_env".'
      );
    });

    it('throws when discord.channels.updates is missing', async () => {
      const config = {
        discord: {
          server_id: "123",
          bot_token_env: "TOKEN",
          channels: { questions: "q", debug: "d" },
          mention_user_id: "456",
        },
      };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing "discord.channels.updates".'
      );
    });

    it('throws when discord.mention_user_id is missing', async () => {
      const config = {
        discord: {
          server_id: "123",
          bot_token_env: "TOKEN",
          channels: { updates: "updates" },
        },
      };
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing "discord.mention_user_id".'
      );
    });
  });

  // Task 15: Value validation
  describe("value validation", () => {
    it('throws when server_id is placeholder "YOUR_SERVER_ID"', async () => {
      const config = defaultTestConfig();
      config.discord.server_id = "YOUR_SERVER_ID";
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'discord.server_id is still set to placeholder value "YOUR_SERVER_ID". Edit ptah.config.json with your Discord server ID.'
      );
    });

    it('throws when mention_user_id is placeholder "YOUR_USER_ID"', async () => {
      const config = defaultTestConfig();
      config.discord.mention_user_id = "YOUR_USER_ID";
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        'discord.mention_user_id is still set to placeholder value "YOUR_USER_ID". Edit ptah.config.json with your Discord user ID.'
      );
    });

    it("throws when channels.updates is empty string", async () => {
      const config = defaultTestConfig();
      config.discord.channels.updates = "";
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        "discord.channels.updates is empty. Edit ptah.config.json with your channel name."
      );
    });

    it("throws when bot_token_env is empty string", async () => {
      const config = defaultTestConfig();
      config.discord.bot_token_env = "";
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      await expect(loader.load()).rejects.toThrow(
        "discord.bot_token_env is empty."
      );
    });
  });

  // Task 133: agents.active and agents.skills validation
  describe("agents validation", () => {
    it('throws when agents.active is missing', async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agents.active;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json "agents.active" must be a non-empty array.',
      );
    });

    it('throws when agents.active is empty array', async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agents.active = [];
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json "agents.active" must be a non-empty array.',
      );
    });

    it('throws when agents.skills is missing', async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agents.skills;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json "agents.skills" must be a non-empty object.',
      );
    });

    it('throws when agents.skills is empty object', async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agents.skills = {};
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json "agents.skills" must be a non-empty object.',
      );
    });

    it('throws when agents section is missing entirely', async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agents;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      await expect(loader.load()).rejects.toThrow(
        'ptah.config.json is missing the "agents" section.',
      );
    });
  });

  // Task 134: applies defaults for new optional fields
  describe("default application", () => {
    it("applies default agents.colours when missing", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agents.colours;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agents.colours).toEqual({});
    });

    it("applies default agents.role_mentions when missing", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agents.role_mentions;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agents.role_mentions).toEqual({});
    });

    it("applies default orchestrator.token_budget when missing", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.orchestrator.token_budget;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.orchestrator.token_budget).toEqual({
        layer1_pct: 0.15,
        layer2_pct: 0.45,
        layer3_pct: 0.10,
        thread_pct: 0.15,
        headroom_pct: 0.15,
      });
    });

    it("preserves existing agents.colours when provided", async () => {
      const config = defaultTestConfig();
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      const result = await loader.load();
      expect(result.agents.colours).toEqual(config.agents.colours);
    });

    it("preserves existing orchestrator.token_budget when provided", async () => {
      const config = defaultTestConfig();
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      const result = await loader.load();
      expect(result.orchestrator.token_budget).toEqual(config.orchestrator.token_budget);
    });
  });

  // Task 16: Happy path
  describe("happy path", () => {
    it("returns typed PtahConfig with all fields correctly parsed", async () => {
      const expected = defaultTestConfig();
      fs.addExisting("ptah.config.json", JSON.stringify(expected));

      const result = await loader.load();

      expect(result).toEqual(expected);
      // Verify specific fields to confirm typing
      expect(result.project.name).toBe("test-project");
      expect(result.project.version).toBe("1.0.0");
      expect(result.discord.bot_token_env).toBe("DISCORD_BOT_TOKEN");
      expect(result.discord.server_id).toBe("test-server-123");
      expect(result.discord.channels.updates).toBe("agent-updates");
      expect(result.discord.channels.questions).toBe("open-questions");
      expect(result.discord.channels.debug).toBe("agent-debug");
      expect(result.discord.mention_user_id).toBe("test-user-456");
      expect(result.agents.active).toEqual(["pm-agent", "dev-agent", "test-agent"]);
      expect(result.agents.model).toBe("claude-sonnet-4-6");
      expect(result.agents.max_tokens).toBe(8192);
      expect(result.orchestrator.max_turns_per_thread).toBe(10);
      expect(result.orchestrator.pending_poll_seconds).toBe(30);
      expect(result.orchestrator.retry_attempts).toBe(3);
      expect(result.git.commit_prefix).toBe("[ptah]");
      expect(result.git.auto_commit).toBe(true);
      expect(result.docs.root).toBe("docs");
      expect(result.docs.templates).toBe("./ptah/templates");
    });
  });

  // Phase H1: agentEntries field — optional AgentEntry[] with default []
  describe("agentEntries field", () => {
    it("defaults agentEntries to [] when not present in config", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      delete raw.agentEntries;
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agentEntries).toEqual([]);
    });

    it("parses a valid agentEntries array when present", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agentEntries = [
        {
          id: "pm-agent",
          skill_path: "./ptah/skills/pm-agent.md",
          log_file: "./ptah/logs/pm-agent.log",
          mention_id: "123456789012345678",
          display_name: "PM Agent",
        },
      ];
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agentEntries).toHaveLength(1);
      expect(result.agentEntries[0].id).toBe("pm-agent");
      expect(result.agentEntries[0].skill_path).toBe("./ptah/skills/pm-agent.md");
      expect(result.agentEntries[0].log_file).toBe("./ptah/logs/pm-agent.log");
      expect(result.agentEntries[0].mention_id).toBe("123456789012345678");
      expect(result.agentEntries[0].display_name).toBe("PM Agent");
    });

    it("parses multiple agent entries", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agentEntries = [
        makeAgentEntry({ id: "pm-agent", mention_id: "111111111111111111" }),
        makeAgentEntry({ id: "dev-agent", mention_id: "222222222222222222" }),
      ];
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agentEntries).toHaveLength(2);
      expect(result.agentEntries[0].id).toBe("pm-agent");
      expect(result.agentEntries[1].id).toBe("dev-agent");
    });

    it("preserves optional display_name when provided", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agentEntries = [
        makeAgentEntry({ id: "pm-agent", display_name: "Product Manager" }),
      ];
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agentEntries[0].display_name).toBe("Product Manager");
    });

    it("accepts agentEntries as empty array explicitly", async () => {
      const config = defaultTestConfig();
      const raw = JSON.parse(JSON.stringify(config));
      raw.agentEntries = [];
      fs.addExisting("ptah.config.json", JSON.stringify(raw));

      const result = await loader.load();
      expect(result.agentEntries).toEqual([]);
    });

    it("parsed config always has agentEntries field even when not in JSON", async () => {
      const config = defaultTestConfig();
      fs.addExisting("ptah.config.json", JSON.stringify(config));

      const result = await loader.load();
      expect("agentEntries" in result).toBe(true);
      expect(Array.isArray(result.agentEntries)).toBe(true);
    });
  });
});
