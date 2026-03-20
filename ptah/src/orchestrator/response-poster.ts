import type { EmbedOptions, PostResult, PtahConfig, UserFacingErrorType, UserFacingErrorContext } from "../types.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";

export interface ResponsePoster {
  /** Posts agent-authored response text as plain Discord messages (not embeds). */
  postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult>;

  /** Routing Notification embed — color 0x5865F2 (Discord blurple). */
  postRoutingNotificationEmbed(params: {
    threadId: string;
    fromAgentDisplayName: string;
    toAgentDisplayName: string;
  }): Promise<void>;

  /** Resolution Notification embed — color 0x57F287 (green). */
  postResolutionNotificationEmbed(params: {
    threadId: string;
    signalType: 'LGTM' | 'TASK_COMPLETE';
    agentDisplayName: string;
  }): Promise<void>;

  /** Error Report embed — color 0xED4245 (red). */
  postErrorReportEmbed(params: {
    threadId: string;
    errorType: UserFacingErrorType;
    context: UserFacingErrorContext;
  }): Promise<void>;

  /** User Escalation embed — color 0xFEE75C (yellow). */
  postUserEscalationEmbed(params: {
    threadId: string;
    agentDisplayName: string;
    question: string;
  }): Promise<void>;

  /** Creates a new coordination thread using Routing Notification embed. */
  createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string>;
}

const ROUTING_NOTIFICATION_COLOUR    = 0x5865F2; // Discord blurple
const RESOLUTION_NOTIFICATION_COLOUR = 0x57F287; // green
const ERROR_REPORT_COLOUR            = 0xED4245; // red
const USER_ESCALATION_COLOUR         = 0xFEE75C; // yellow
const EMBED_FOOTER                   = 'Ptah Orchestrator';
const MAX_PLAIN_MESSAGE_LENGTH       = 2000;

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

  async postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult> {
    const { threadId, agentId, text } = params;
    const content = text === "" ? "No response text" : text;

    const chunks = splitText(content, MAX_PLAIN_MESSAGE_LENGTH);
    let lastMessageId = "";

    for (const chunk of chunks) {
      try {
        await this.discord.postPlainMessage(threadId, chunk);
        lastMessageId = `plain-msg-${Date.now()}`;
      } catch (error) {
        this.logger.warn(
          `Plain message post failed for ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { messageId: lastMessageId, threadId, newThreadCreated: false };
  }

  async postRoutingNotificationEmbed(params: {
    threadId: string;
    fromAgentDisplayName: string;
    toAgentDisplayName: string;
  }): Promise<void> {
    const { threadId, fromAgentDisplayName, toAgentDisplayName } = params;
    const embedOptions: EmbedOptions = {
      threadId,
      title: `↗ Routing to ${toAgentDisplayName}`,
      description: `From **${fromAgentDisplayName}** → **${toAgentDisplayName}**`,
      colour: ROUTING_NOTIFICATION_COLOUR,
      footer: EMBED_FOOTER,
    };

    try {
      await this.discord.postEmbed(embedOptions);
    } catch (error) {
      this.logger.warn(
        `Routing notification embed failed, falling back to plain message: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.discord.postPlainMessage(
        threadId,
        `↗ Routing to ${toAgentDisplayName} (from ${fromAgentDisplayName})`,
      ).catch(() => {});
    }
  }

  async postResolutionNotificationEmbed(params: {
    threadId: string;
    signalType: 'LGTM' | 'TASK_COMPLETE';
    agentDisplayName: string;
  }): Promise<void> {
    const { threadId, signalType, agentDisplayName } = params;
    const title = signalType === 'LGTM' ? '✅ LGTM' : '✅ Task Complete';
    const description = signalType === 'LGTM'
      ? `**${agentDisplayName}** has approved this work.`
      : `**${agentDisplayName}** has completed the task.`;

    const embedOptions: EmbedOptions = {
      threadId,
      title,
      description,
      colour: RESOLUTION_NOTIFICATION_COLOUR,
      footer: EMBED_FOOTER,
    };

    try {
      await this.discord.postEmbed(embedOptions);
    } catch (error) {
      this.logger.warn(
        `Resolution notification embed failed, falling back to plain message: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.discord.postPlainMessage(
        threadId,
        `${title}: ${agentDisplayName}`,
      ).catch(() => {});
    }
  }

  async postErrorReportEmbed(params: {
    threadId: string;
    errorType: UserFacingErrorType;
    context: UserFacingErrorContext;
  }): Promise<void> {
    const { threadId, errorType, context } = params;
    const description = `Error type: ${errorType}${context.agentDisplayName ? ` — ${context.agentDisplayName}` : ''}`;

    const embedOptions: EmbedOptions = {
      threadId,
      title: `⚠ Error — ${errorType}`,
      description,
      colour: ERROR_REPORT_COLOUR,
      footer: EMBED_FOOTER,
    };

    try {
      await this.discord.postEmbed(embedOptions);
    } catch (error) {
      this.logger.warn(
        `Error report embed failed, falling back to plain message: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.discord.postPlainMessage(
        threadId,
        `⚠ Error: ${errorType}`,
      ).catch(() => {});
    }
  }

  async postUserEscalationEmbed(params: {
    threadId: string;
    agentDisplayName: string;
    question: string;
  }): Promise<void> {
    const { threadId, agentDisplayName, question } = params;
    const embedOptions: EmbedOptions = {
      threadId,
      title: `❓ Question from ${agentDisplayName}`,
      description: question,
      colour: USER_ESCALATION_COLOUR,
      footer: EMBED_FOOTER,
    };

    try {
      await this.discord.postEmbed(embedOptions);
    } catch (error) {
      this.logger.warn(
        `User escalation embed failed, falling back to plain message: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.discord.postPlainMessage(
        threadId,
        `❓ Question from ${agentDisplayName}: ${question}`,
      ).catch(() => {});
    }
  }

  async createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string> {
    const { channelId, featureName, description, agentId, initialText } = params;
    const agentName = agentNameFromId(agentId);
    const threadName = `${featureName} — ${description}`;

    const initialEmbed: EmbedOptions = {
      threadId: "", // will be set by createThread
      title: `↗ Routing to ${agentName}`,
      description: initialText,
      colour: ROUTING_NOTIFICATION_COLOUR,
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
          title: `↗ Routing to ${agentName} (${threadName})`,
          description: initialText,
          colour: ROUTING_NOTIFICATION_COLOUR,
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
