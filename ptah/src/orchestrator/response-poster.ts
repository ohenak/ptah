import type { EmbedOptions, PostResult, PtahConfig } from "../types.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";

export interface ResponsePoster {
  postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult>;

  postCompletionEmbed(threadId: string, agentId: string, config: PtahConfig): Promise<void>;
  postErrorEmbed(threadId: string, errorMessage: string): Promise<void>;

  createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string>;
}

const DEFAULT_COLOUR = 0x757575;
const ERROR_COLOUR = 0x9E9E9E;
const COMPLETION_COLOUR = 0x1B5E20;
const MAX_EMBED_LENGTH = 4096;

function parseHexColour(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function agentNameFromId(agentId: string): string {
  return agentId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  return chunks;
}

interface RateLimitError extends Error {
  retry_after?: number;
}

function isRateLimitError(err: unknown): err is RateLimitError {
  return err instanceof Error && typeof (err as RateLimitError).retry_after === "number";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DefaultResponsePoster implements ResponsePoster {
  private discord: DiscordClient;
  private logger: Logger;

  constructor(discord: DiscordClient, logger: Logger) {
    this.discord = discord;
    this.logger = logger;
  }

  private resolveColour(agentId: string, config: PtahConfig): number {
    const hex = config.agents.colours[agentId];
    if (!hex) {
      this.logger.warn(`Unknown agent colour for "${agentId}", using default gray`);
      return DEFAULT_COLOUR;
    }
    return parseHexColour(hex);
  }

  async postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult> {
    const { threadId, agentId, text, config, footer } = params;
    const colour = this.resolveColour(agentId, config);
    const agentName = agentNameFromId(agentId);
    const description = text === "" ? "No response text" : text;

    if (description.length <= MAX_EMBED_LENGTH) {
      const embedOptions: EmbedOptions = {
        threadId,
        title: agentName,
        description,
        colour,
        footer,
      };

      const messageId = await this.postEmbedWithRetry(embedOptions);
      return { messageId, threadId, newThreadCreated: false };
    }

    // Split into chunks
    const chunks = splitText(description, MAX_EMBED_LENGTH);
    let lastMessageId = "";

    for (let i = 0; i < chunks.length; i++) {
      const embedOptions: EmbedOptions = {
        threadId,
        title: `${agentName} (${i + 1}/${chunks.length})`,
        description: chunks[i],
        colour,
        footer: i === chunks.length - 1 ? footer : undefined,
      };

      lastMessageId = await this.postEmbedWithRetry(embedOptions);
    }

    return { messageId: lastMessageId, threadId, newThreadCreated: false };
  }

  async postErrorEmbed(threadId: string, errorMessage: string): Promise<void> {
    const embedOptions: EmbedOptions = {
      threadId,
      title: "Error",
      description: errorMessage,
      colour: ERROR_COLOUR,
    };

    await this.postEmbedWithRetry(embedOptions);
  }

  async postCompletionEmbed(threadId: string, agentId: string, config: PtahConfig): Promise<void> {
    const agentName = agentNameFromId(agentId);
    const embedOptions: EmbedOptions = {
      threadId,
      title: "Task Complete",
      description: `${agentName} has completed the task.`,
      colour: COMPLETION_COLOUR,
    };

    await this.postEmbedWithRetry(embedOptions);
  }

  async createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string> {
    const { channelId, featureName, description, agentId, initialText, config } = params;
    const colour = this.resolveColour(agentId, config);
    const agentName = agentNameFromId(agentId);
    const threadName = `${featureName} — ${description}`;

    const initialEmbed: EmbedOptions = {
      threadId: "", // will be set by createThread
      title: agentName,
      description: initialText,
      colour,
    };

    try {
      const threadId = await this.discord.createThread(channelId, threadName, initialEmbed);
      return threadId;
    } catch (firstError) {
      this.logger.warn(
        `Thread creation failed, retrying: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
      );

      try {
        const threadId = await this.discord.createThread(channelId, threadName, initialEmbed);
        return threadId;
      } catch (secondError) {
        this.logger.error(
          `Thread creation retry failed, posting in parent channel: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
        );

        // Fallback: post in parent channel
        const fallbackEmbed: EmbedOptions = {
          threadId: channelId,
          title: `${agentName} (${threadName})`,
          description: initialText,
          colour,
        };

        await this.discord.postEmbed(fallbackEmbed);
        return channelId;
      }
    }
  }

  private async postEmbedWithRetry(options: EmbedOptions): Promise<string> {
    try {
      return await this.discord.postEmbed(options);
    } catch (firstError) {
      // Check for rate limit
      if (isRateLimitError(firstError) && firstError.retry_after !== undefined) {
        this.logger.warn(
          `Rate limited, retrying after ${firstError.retry_after}ms`,
        );
        await delay(firstError.retry_after);
      } else {
        this.logger.warn(
          `Embed post failed, retrying: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
        );
      }

      try {
        return await this.discord.postEmbed(options);
      } catch (secondError) {
        this.logger.warn(
          `Embed post retry failed, skipping: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
        );
        return "";
      }
    }
  }
}
