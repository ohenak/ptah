import type { ConfigLoader } from "../config/loader.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";
import type { StartResult } from "../types.js";

export class StartCommand {
  constructor(
    private configLoader: ConfigLoader,
    private discord: DiscordClient,
    private logger: Logger,
  ) {}

  async execute(): Promise<StartResult> {
    // 1. Load config
    const config = await this.configLoader.load();

    // 2. Validate env var
    const token = process.env[config.discord.bot_token_env];
    if (!token) {
      throw new Error(
        `Environment variable ${config.discord.bot_token_env} is not set.`
      );
    }

    // 3. Connect to Discord
    await this.discord.connect(token);
    this.logger.info("Connected to Discord server");

    // 4. Resolve channel
    const channelId = await this.discord.findChannelByName(
      config.discord.server_id,
      config.discord.channels.updates,
    );
    if (!channelId) {
      throw new Error(
        `Channel #${config.discord.channels.updates} not found in server.`
      );
    }
    this.logger.info(`Listening on #${config.discord.channels.updates}`);

    // 5. Register message listener
    this.discord.onThreadMessage(channelId, async (message) => {
      this.logger.info(
        `Message detected in thread: ${message.threadName} by ${message.authorName}`
      );
    });

    // 6. Return cleanup function
    return {
      cleanup: async () => {
        await this.discord.disconnect();
        this.logger.info("Disconnected from Discord.");
      },
    };
  }
}
