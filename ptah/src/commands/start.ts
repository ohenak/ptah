import type { ConfigLoader } from "../config/loader.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import type { StartResult } from "../types.js";

export interface StartCommandOptions {
  orchestrator?: Orchestrator;
  checkClaudeCode?: () => Promise<void>;
}

async function defaultClaudeCodeCheck(): Promise<void> {
  try {
    // Use a variable to prevent Vite/bundler from statically analyzing the import
    const pkg = "@anthropic-ai/claude-code";
    await import(/* @vite-ignore */ pkg);
  } catch {
    throw new Error(
      "Claude Code SDK not available. Install it with: npm install @anthropic-ai/claude-code",
    );
  }
}

export class StartCommand {
  private orchestrator?: Orchestrator;
  private checkClaudeCode: () => Promise<void>;

  constructor(
    private configLoader: ConfigLoader,
    private discord: DiscordClient,
    private logger: Logger,
    options?: StartCommandOptions,
  ) {
    this.orchestrator = options?.orchestrator;
    this.checkClaudeCode = options?.checkClaudeCode ?? defaultClaudeCodeCheck;
  }

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

    // 3. Validate Claude Code availability (Task 137) — only when orchestrator is provided
    if (this.orchestrator) {
      await this.checkClaudeCode();
    }

    // 4. Connect to Discord
    await this.discord.connect(token);
    this.logger.info("Connected to Discord server");

    // 5. Resolve channel
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

    // 6. Call orchestrator.startup() if available
    if (this.orchestrator) {
      await this.orchestrator.startup();
    }

    // 7. Register message listener
    if (this.orchestrator) {
      const orchestrator = this.orchestrator;
      this.discord.onThreadMessage(channelId, async (message) => {
        await orchestrator.handleMessage(message);
      });
    } else {
      this.discord.onThreadMessage(channelId, async (message) => {
        this.logger.info(
          `Message detected in thread: ${message.threadName} by ${message.authorName}`
        );
      });
    }

    // 8. Return cleanup function
    return {
      cleanup: async () => {
        await this.discord.disconnect();
        this.logger.info("Disconnected from Discord.");
      },
    };
  }
}
