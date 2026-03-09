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
}
