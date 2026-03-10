import {
  Client,
  GatewayIntentBits,
  ChannelType,
  type ClientOptions,
  type Message,
  type ThreadChannel,
} from "discord.js";
import type { ThreadMessage, EmbedOptions } from "../types.js";
import type { Logger } from "./logger.js";

export interface DiscordClient {
  connect(token: string): Promise<void>;
  disconnect(): Promise<void>;
  findChannelByName(guildId: string, channelName: string): Promise<string | null>;
  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void;
  readThreadHistory(threadId: string): Promise<ThreadMessage[]>;

  // --- Phase 3 ---
  postEmbed(options: EmbedOptions): Promise<string>;
  createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string>;
  postSystemMessage(threadId: string, content: string): Promise<void>;
}

function toThreadMessage(message: Message): ThreadMessage {
  return {
    id: message.id,
    threadId: message.channelId,
    threadName: (message.channel as ThreadChannel).name,
    parentChannelId: (message.channel as ThreadChannel).parentId!,
    authorId: message.author.id,
    authorName: message.author.displayName,
    isBot: message.author.bot,
    content: message.content,
    timestamp: message.createdAt,
  };
}

export class DiscordJsClient implements DiscordClient {
  private client: Client;
  private logger: Logger;
  private destroyed = false;

  constructor(
    logger: Logger,
    clientFactory: (options: ClientOptions) => Client = (opts) => new Client(opts),
  ) {
    this.logger = logger;
    this.client = clientFactory({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Task 33: Register internal warn/error listeners
    this.client.on("warn", (msg) => this.logger.warn(msg));
    this.client.on("error", (err) => this.logger.error(err.message));
  }

  // Task 26: connect()
  async connect(token: string): Promise<void> {
    if (this.destroyed) {
      throw new Error("Cannot connect: client has been destroyed. Create a new DiscordJsClient instance.");
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("connection timed out after 30 seconds"));
      }, 30_000);

      this.client.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.login(token).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Task 27: disconnect()
  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.client.destroy();
  }

  // Task 28: findChannelByName()
  async findChannelByName(guildId: string, channelName: string): Promise<string | null> {
    const guild = await this.client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    for (const [, channel] of channels) {
      if (channel && channel.name === channelName && channel.type === ChannelType.GuildText) {
        return channel.id;
      }
    }
    return null;
  }

  // Task 29-30: onThreadMessage()
  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void {
    this.client.on("messageCreate", async (message: Message) => {
      // Filter 1: ignore bot messages
      if (message.author.bot) return;

      // Filter 2: ignore non-thread messages
      if (!message.channel.isThread()) return;

      // Filter 3: ignore wrong parent channel
      if ((message.channel as ThreadChannel).parentId !== parentChannelId) return;

      // Convert and invoke handler with error boundary (Task 30)
      try {
        const threadMessage = toThreadMessage(message);
        await handler(threadMessage);
      } catch (err) {
        this.logger.error(
          `Message handler error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  // Task 32: readThreadHistory()
  async readThreadHistory(threadId: string): Promise<ThreadMessage[]> {
    const channel = await this.client.channels.fetch(threadId) as ThreadChannel;
    const allMessages: Message[] = [];

    // First batch
    const batch1 = await channel.messages.fetch({ limit: 100 });
    for (const [, msg] of batch1) {
      allMessages.push(msg);
    }

    // If first batch is full, fetch second batch
    if (batch1.size === 100) {
      // Find the oldest message in batch1 to paginate
      let oldestId: string | undefined;
      let oldestTime = Infinity;
      for (const [, msg] of batch1) {
        if (msg.createdAt.getTime() < oldestTime) {
          oldestTime = msg.createdAt.getTime();
          oldestId = msg.id;
        }
      }

      if (oldestId) {
        const batch2 = await channel.messages.fetch({ limit: 100, before: oldestId });
        for (const [, msg] of batch2) {
          allMessages.push(msg);
        }

        // If second batch is also full, there are >200 messages
        if (batch2.size === 100) {
          this.logger.warn(
            `Thread ${channel.name} has >200 messages, history truncated`,
          );
        }
      }
    }

    // Sort oldest-first
    allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Convert to ThreadMessage[]
    return allMessages.map((msg) => toThreadMessage(msg));
  }

  // --- Phase 3 methods (full implementations in service track) ---

  async postEmbed(options: EmbedOptions): Promise<string> {
    const channel = await this.client.channels.fetch(options.threadId) as ThreadChannel;
    const message = await channel.send({
      embeds: [{
        title: options.title,
        description: options.description,
        color: options.colour,
        footer: options.footer ? { text: options.footer } : undefined,
      }],
    });
    return message.id;
  }

  async createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string> {
    const channel = await this.client.channels.fetch(channelId) as ThreadChannel;
    const parent = channel.isThread() ? channel.parent! : channel;
    const thread = await (parent as unknown as { threads: { create: (opts: unknown) => Promise<ThreadChannel> } }).threads.create({
      name,
      type: ChannelType.PublicThread,
    });
    await this.postEmbed({ ...initialMessage, threadId: thread.id });
    return thread.id;
  }

  async postSystemMessage(threadId: string, content: string): Promise<void> {
    await this.postEmbed({
      threadId,
      title: "System",
      description: content,
      colour: 0x9E9E9E,
    });
  }
}
