import type { PtahConfig, AgentEntry } from "../types.js";
import type { FileSystem } from "../services/filesystem.js";

export interface ConfigLoader {
  load(): Promise<PtahConfig>;
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export class NodeConfigLoader implements ConfigLoader {
  constructor(private fs: FileSystem) {}

  async load(): Promise<PtahConfig> {
    let raw: string;
    try {
      raw = await this.fs.readFile("ptah.config.json");
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error("ptah.config.json not found. Run 'ptah init' first.");
      }
      throw new Error(
        `Failed to read ptah.config.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error: unknown) {
      throw new Error(
        `ptah.config.json contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.validateStructure(parsed);
    this.validateValues(parsed as PtahConfig);
    this.applyDefaults(parsed as Record<string, unknown>);
    return parsed as PtahConfig;
  }

  private validateStructure(config: unknown): void {
    const cfg = config as Record<string, unknown>;

    if (typeof cfg.discord !== "object" || cfg.discord === null) {
      throw new Error('ptah.config.json is missing the "discord" section.');
    }

    const discord = cfg.discord as Record<string, unknown>;

    if (typeof discord.server_id !== "string") {
      throw new Error('ptah.config.json is missing "discord.server_id".');
    }

    if (typeof discord.bot_token_env !== "string") {
      throw new Error('ptah.config.json is missing "discord.bot_token_env".');
    }

    if (typeof discord.channels !== "object" || discord.channels === null) {
      throw new Error('ptah.config.json is missing "discord.channels".');
    }

    const channels = discord.channels as Record<string, unknown>;

    if (typeof channels.updates !== "string") {
      throw new Error('ptah.config.json is missing "discord.channels.updates".');
    }

    if (typeof discord.mention_user_id !== "string") {
      throw new Error('ptah.config.json is missing "discord.mention_user_id".');
    }

    // Validate agents section — supports both old object format and new array format
    if (cfg.agents === undefined || cfg.agents === null) {
      throw new Error('ptah.config.json is missing the "agents" section.');
    }

    if (Array.isArray(cfg.agents)) {
      // New format: agents is an AgentEntry[] array
      this.validateAgentsArray(cfg.agents as unknown[]);
    } else if (typeof cfg.agents === "object") {
      // Old format: agents is an AgentConfig object
      const agents = cfg.agents as Record<string, unknown>;

      if (!Array.isArray(agents.active) || agents.active.length === 0) {
        throw new Error(
          'ptah.config.json "agents.active" must be a non-empty array.',
        );
      }

      if (
        typeof agents.skills !== "object" ||
        agents.skills === null ||
        Object.keys(agents.skills as Record<string, unknown>).length === 0
      ) {
        throw new Error(
          'ptah.config.json "agents.skills" must be a non-empty object.',
        );
      }
    } else {
      throw new Error('ptah.config.json is missing the "agents" section.');
    }
  }

  private validateAgentsArray(agents: unknown[]): void {
    if (agents.length === 0) {
      throw new Error(
        'ptah.config.json "agents" array must be non-empty when using array format.'
      );
    }

    for (let i = 0; i < agents.length; i++) {
      const entry = agents[i] as Record<string, unknown>;

      if (typeof entry.id !== "string" || entry.id === "") {
        throw new Error(
          `ptah.config.json agents[${i}].id is missing or empty.`
        );
      }

      if (!/^[a-z0-9-]+$/.test(entry.id as string)) {
        throw new Error(
          `ptah.config.json agents[${i}].id "${entry.id}" is invalid. Must match /^[a-z0-9-]+$/.`
        );
      }

      if (typeof entry.skill_path !== "string" || entry.skill_path === "") {
        throw new Error(
          `ptah.config.json agents[${i}].skill_path is missing or empty.`
        );
      }

      if (typeof entry.log_file !== "string" || entry.log_file === "") {
        throw new Error(
          `ptah.config.json agents[${i}].log_file is missing or empty.`
        );
      }

      if (typeof entry.mention_id !== "string" || entry.mention_id === "") {
        throw new Error(
          `ptah.config.json agents[${i}].mention_id is missing or empty.`
        );
      }

      if (!/^\d+$/.test(entry.mention_id as string)) {
        throw new Error(
          `ptah.config.json agents[${i}].mention_id "${entry.mention_id}" is invalid. Must match /^\\d+$/.`
        );
      }
    }
  }

  private validateValues(config: PtahConfig): void {
    if (config.discord.server_id === "YOUR_SERVER_ID") {
      throw new Error(
        'discord.server_id is still set to placeholder value "YOUR_SERVER_ID". Edit ptah.config.json with your Discord server ID.'
      );
    }

    if (config.discord.mention_user_id === "YOUR_USER_ID") {
      throw new Error(
        'discord.mention_user_id is still set to placeholder value "YOUR_USER_ID". Edit ptah.config.json with your Discord user ID.'
      );
    }

    if (config.discord.channels.updates === "") {
      throw new Error(
        "discord.channels.updates is empty. Edit ptah.config.json with your channel name."
      );
    }

    if (config.discord.bot_token_env === "") {
      throw new Error("discord.bot_token_env is empty.");
    }
  }

  private applyDefaults(config: Record<string, unknown>): void {
    if (Array.isArray(config.agents)) {
      // New format: agents is an AgentEntry[] array — populate agentEntries from it
      config.agentEntries = (config.agents as AgentEntry[]);
      // Keep agents as-is for the new format (consumers will read agentEntries)
    } else {
      // Old format: agents is an AgentConfig object
      const agents = config.agents as Record<string, unknown>;

      // Default agents.colours to empty object
      if (agents.colours === undefined) {
        agents.colours = {};
      }

      // Default agents.role_mentions to empty object
      if (agents.role_mentions === undefined) {
        agents.role_mentions = {};
      }

      // Default agentEntries to empty array (optional in config file, always present in parsed result)
      if (!Array.isArray(config.agentEntries)) {
        config.agentEntries = [];
      }
    }

    // Parse llm section — keep when present and valid, otherwise leave as absent (optional field)
    const isValidLlmSection =
      typeof config.llm === "object" &&
      config.llm !== null &&
      !Array.isArray(config.llm);
    if (!isValidLlmSection) {
      delete config.llm;
    }

    // Default orchestrator.token_budget
    const orchestrator = config.orchestrator as Record<string, unknown> | undefined;
    if (orchestrator && orchestrator.token_budget === undefined) {
      orchestrator.token_budget = {
        layer1_pct: 0.15,
        layer2_pct: 0.45,
        layer3_pct: 0.10,
        thread_pct: 0.15,
        headroom_pct: 0.15,
      };
    }
  }
}
