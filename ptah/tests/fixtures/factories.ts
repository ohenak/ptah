import type { FileSystem } from "../../src/services/filesystem.js";
import type { GitClient } from "../../src/services/git.js";
import type { DiscordClient } from "../../src/services/discord.js";
import type { ConfigLoader } from "../../src/config/loader.js";
import type { Logger } from "../../src/services/logger.js";
import type { PtahConfig, ThreadMessage, EmbedOptions } from "../../src/types.js";
import type { Message } from "discord.js";
import * as nodePath from "node:path";

export class FakeFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();
  private _cwd: string;
  writeFileError: Error | null = null;

  constructor(cwd: string = "/fake/project") {
    this._cwd = cwd;
  }

  addExisting(path: string, content: string = ""): void {
    this.files.set(path, content);
  }

  addExistingDir(path: string): void {
    this.dirs.add(path);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  hasDir(path: string): boolean {
    return this.dirs.has(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.writeFileError) throw this.writeFileError;
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      const error = new Error(`ENOENT: no such file: ${path}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return content;
  }

  cwd(): string {
    return this._cwd;
  }

  basename(path: string): string {
    return nodePath.basename(path);
  }
}

export class FakeGitClient implements GitClient {
  isRepoReturn = true;
  hasStagedReturn = false;
  addedPaths: string[][] = [];
  commits: string[] = [];
  addError: Error | null = null;
  commitError: Error | null = null;
  isRepoError: Error | null = null;

  async isRepo(): Promise<boolean> {
    if (this.isRepoError) throw this.isRepoError;
    return this.isRepoReturn;
  }

  async hasStagedChanges(): Promise<boolean> {
    return this.hasStagedReturn;
  }

  async add(paths: string[]): Promise<void> {
    if (this.addError) throw this.addError;
    this.addedPaths.push(paths);
  }

  async commit(message: string): Promise<void> {
    if (this.commitError) throw this.commitError;
    this.commits.push(message);
  }
}

export class FakeDiscordClient implements DiscordClient {
  connected = false;
  disconnected = false;
  loginToken: string | null = null;
  connectError: Error | null = null;
  postEmbedError: Error | null = null;
  createThreadError: Error | null = null;
  registeredHandlers: Array<{
    parentChannelId: string;
    handler: (message: ThreadMessage) => Promise<void>;
  }> = [];
  threadHistory: Map<string, ThreadMessage[]> = new Map();
  channels: Map<string, string> = new Map();
  postedEmbeds: EmbedOptions[] = [];
  createdThreads: Array<{ channelId: string; name: string; initialMessage: EmbedOptions }> = [];
  systemMessages: Array<{ threadId: string; content: string }> = [];
  private nextMessageId = 1;
  private nextThreadId = 1;
  private postEmbedCallCount = 0;
  private createThreadCallCount = 0;

  /** Set to make postEmbed fail only on the Nth call (1-indexed). Resets after that call. */
  postEmbedFailOnCall: number | null = null;
  /** Set to make createThread fail only on the Nth call (1-indexed). Resets after that call. */
  createThreadFailOnCall: number | null = null;

  async connect(token: string): Promise<void> {
    if (this.connectError) throw this.connectError;
    this.loginToken = token;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
    this.connected = false;
  }

  async findChannelByName(guildId: string, name: string): Promise<string | null> {
    return this.channels.get(name) ?? null;
  }

  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void {
    this.registeredHandlers.push({ parentChannelId, handler });
  }

  async readThreadHistory(threadId: string): Promise<ThreadMessage[]> {
    return this.threadHistory.get(threadId) ?? [];
  }

  async postEmbed(options: EmbedOptions): Promise<string> {
    this.postEmbedCallCount++;
    if (this.postEmbedFailOnCall !== null && this.postEmbedCallCount === this.postEmbedFailOnCall) {
      const err = this.postEmbedError ?? new Error("postEmbed failed");
      this.postEmbedFailOnCall = null;
      this.postEmbedError = null;
      throw err;
    }
    if (this.postEmbedError) throw this.postEmbedError;
    this.postedEmbeds.push(options);
    return `embed-msg-${this.nextMessageId++}`;
  }

  async createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string> {
    this.createThreadCallCount++;
    if (this.createThreadFailOnCall !== null && this.createThreadCallCount === this.createThreadFailOnCall) {
      const err = this.createThreadError ?? new Error("createThread failed");
      this.createThreadFailOnCall = null;
      this.createThreadError = null;
      throw err;
    }
    if (this.createThreadError) throw this.createThreadError;
    this.createdThreads.push({ channelId, name, initialMessage });
    const threadId = `fake-thread-${this.nextThreadId++}`;
    return threadId;
  }

  async postSystemMessage(threadId: string, content: string): Promise<void> {
    this.systemMessages.push({ threadId, content });
  }

  async simulateMessage(message: ThreadMessage): Promise<void> {
    for (const { parentChannelId, handler } of this.registeredHandlers) {
      if (message.parentChannelId === parentChannelId) {
        await handler(message);
      }
    }
  }
}

export function defaultTestConfig(): PtahConfig {
  return {
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
      colours: {
        "pm-agent": "#1F4E79",
        "dev-agent": "#E65100",
        "frontend-agent": "#6A1B9A",
        "test-agent": "#1B5E20",
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
}

export class FakeConfigLoader implements ConfigLoader {
  config: PtahConfig;
  loadError: Error | null = null;

  constructor(config?: Partial<PtahConfig>) {
    this.config = { ...defaultTestConfig(), ...config };
  }

  async load(): Promise<PtahConfig> {
    if (this.loadError) throw this.loadError;
    return this.config;
  }
}

export class FakeLogger implements Logger {
  messages: { level: string; message: string }[] = [];

  info(message: string): void {
    this.messages.push({ level: "info", message });
  }

  warn(message: string): void {
    this.messages.push({ level: "warn", message });
  }

  error(message: string): void {
    this.messages.push({ level: "error", message });
  }
}

export interface StubMessageOptions {
  id?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  authorBot?: boolean;
  channelId?: string;
  channelName?: string;
  parentId?: string | null;
  isThread?: boolean;
  createdAt?: Date;
}

export function createStubMessage(options: StubMessageOptions = {}): Message {
  return {
    id: options.id ?? "msg-1",
    content: options.content ?? "test message",
    channelId: options.channelId ?? "thread-1",
    createdAt: options.createdAt ?? new Date("2026-03-09T12:00:00Z"),
    author: {
      id: options.authorId ?? "user-1",
      displayName: options.authorName ?? "TestUser",
      username: options.authorName ?? "testuser",
      bot: options.authorBot ?? false,
    },
    channel: {
      id: options.channelId ?? "thread-1",
      name: options.channelName ?? "test-thread",
      parentId: options.parentId !== undefined ? options.parentId : "parent-1",
      isThread: () => options.isThread ?? true,
    },
  } as unknown as Message;
}
