import type { PtahConfig } from "../types.js";
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

    // Validate agents section
    if (typeof cfg.agents !== "object" || cfg.agents === null) {
      throw new Error('ptah.config.json is missing the "agents" section.');
    }

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
    const agents = config.agents as Record<string, unknown>;

    // Default agents.colours to empty object
    if (agents.colours === undefined) {
      agents.colours = {};
    }

    // Default agents.role_mentions to empty object
    if (agents.role_mentions === undefined) {
      agents.role_mentions = {};
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
