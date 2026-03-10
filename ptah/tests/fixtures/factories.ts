import type { FileSystem } from "../../src/services/filesystem.js";
import type { GitClient } from "../../src/services/git.js";
import type { DiscordClient } from "../../src/services/discord.js";
import type { SkillClient } from "../../src/services/claude-code.js";
import type { ConfigLoader } from "../../src/config/loader.js";
import type { Logger } from "../../src/services/logger.js";
import type { TokenCounter } from "../../src/orchestrator/token-counter.js";
import type { RoutingEngine } from "../../src/orchestrator/router.js";
import type { ContextAssembler } from "../../src/orchestrator/context-assembler.js";
import type { SkillInvoker } from "../../src/orchestrator/skill-invoker.js";
import type { ResponsePoster } from "../../src/orchestrator/response-poster.js";
import type {
  PtahConfig,
  ThreadMessage,
  SkillRequest,
  SkillResponse,
  RoutingSignal,
  RoutingDecision,
  ContextBundle,
  InvocationResult,
  PostResult,
  EmbedOptions,
  WorktreeInfo,
} from "../../src/types.js";
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

  async readDir(path: string): Promise<string[]> {
    const filenames: string[] = [];
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        if (!rest.includes("/")) {
          filenames.push(rest);
        }
      }
    }
    return filenames;
  }

  joinPath(...segments: string[]): string {
    return nodePath.join(...segments);
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

  // Phase 3 worktree state
  worktrees: WorktreeInfo[] = [];
  createWorktreeError: Error | null = null;
  diffResult: string[] = [];
  removedWorktrees: string[] = [];
  deletedBranches: string[] = [];

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

  async createWorktree(branch: string, path: string): Promise<void> {
    if (this.createWorktreeError) throw this.createWorktreeError;
    this.worktrees.push({ path, branch });
  }

  async removeWorktree(path: string): Promise<void> {
    this.removedWorktrees.push(path);
    this.worktrees = this.worktrees.filter((wt) => wt.path !== path);
  }

  async deleteBranch(branch: string): Promise<void> {
    this.deletedBranches.push(branch);
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    return this.worktrees;
  }

  async pruneWorktrees(branchPrefix: string): Promise<void> {
    const toRemove = this.worktrees.filter((wt) => wt.branch.startsWith(branchPrefix));
    for (const wt of toRemove) {
      await this.removeWorktree(wt.path);
      await this.deleteBranch(wt.branch);
    }
  }

  async diffWorktree(_worktreePath: string): Promise<string[]> {
    return this.diffResult;
  }
}

export class FakeDiscordClient implements DiscordClient {
  connected = false;
  disconnected = false;
  loginToken: string | null = null;
  connectError: Error | null = null;
  registeredHandlers: Array<{
    parentChannelId: string;
    handler: (message: ThreadMessage) => Promise<void>;
  }> = [];
  threadHistory: Map<string, ThreadMessage[]> = new Map();
  channels: Map<string, string> = new Map();

  // Phase 3 state
  postedEmbeds: EmbedOptions[] = [];
  createdThreads: Array<{ channelId: string; name: string; initialMessage: EmbedOptions }> = [];
  systemMessages: Array<{ threadId: string; content: string }> = [];
  postEmbedError: Error | null = null;
  createThreadError: Error | null = null;
  private nextThreadId = 1;
  private nextMessageId = 1;

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

  async simulateMessage(message: ThreadMessage): Promise<void> {
    for (const { parentChannelId, handler } of this.registeredHandlers) {
      if (message.parentChannelId === parentChannelId) {
        await handler(message);
      }
    }
  }

  async postEmbed(options: EmbedOptions): Promise<string> {
    if (this.postEmbedError) throw this.postEmbedError;
    this.postedEmbeds.push(options);
    return `embed-msg-${this.nextMessageId++}`;
  }

  async createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string> {
    if (this.createThreadError) throw this.createThreadError;
    this.createdThreads.push({ channelId, name, initialMessage });
    const threadId = `fake-thread-${this.nextThreadId++}`;
    await this.postEmbed({ ...initialMessage, threadId });
    return threadId;
  }

  async postSystemMessage(threadId: string, content: string): Promise<void> {
    this.systemMessages.push({ threadId, content });
    await this.postEmbed({
      threadId,
      title: "System",
      description: content,
      colour: 0x9E9E9E,
    });
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
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      colours: {
        "pm-agent": "#1F4E79",
        "dev-agent": "#E65100",
        "frontend-agent": "#6A1B9A",
        "test-agent": "#1B5E20",
      },
      role_mentions: {},
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
      token_budget: {
        layer1_pct: 0.15,
        layer2_pct: 0.45,
        layer3_pct: 0.10,
        thread_pct: 0.15,
        headroom_pct: 0.15,
      },
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
  embeds?: unknown[];
  mentions?: unknown[];
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
    embeds: options.embeds ?? [],
    mentions: options.mentions ?? { roles: new Map() },
  } as unknown as Message;
}

// --- Phase 3: New fakes ---

// Task 18: FakeSkillClient
export class FakeSkillClient implements SkillClient {
  responses: SkillResponse[] = [];
  invokeError: Error | null = null;
  invocations: SkillRequest[] = [];
  private callIndex = 0;

  async invoke(request: SkillRequest): Promise<SkillResponse> {
    this.invocations.push(request);
    if (this.invokeError) throw this.invokeError;
    if (this.callIndex >= this.responses.length) {
      throw new Error(
        `FakeSkillClient: no response configured for call index ${this.callIndex}. ` +
        `Configure responses via the .responses array.`
      );
    }
    return this.responses[this.callIndex++];
  }
}

// Task 19: FakeRoutingEngine
export class FakeRoutingEngine implements RoutingEngine {
  parseResult: RoutingSignal = { type: "TASK_COMPLETE" };
  decideResult: RoutingDecision = {
    signal: { type: "TASK_COMPLETE" },
    targetAgentId: null,
    isTerminal: true,
    isPaused: false,
    createNewThread: false,
  };
  resolveHumanResult: string | null = null;
  parseError: Error | null = null;
  parseCalls: string[] = [];
  decideCalls: Array<{ signal: RoutingSignal; config: PtahConfig }> = [];
  resolveHumanCalls: Array<{ message: ThreadMessage; config: PtahConfig }> = [];

  parseSignal(skillResponseText: string): RoutingSignal {
    this.parseCalls.push(skillResponseText);
    if (this.parseError) throw this.parseError;
    return this.parseResult;
  }

  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null {
    this.resolveHumanCalls.push({ message, config });
    return this.resolveHumanResult;
  }

  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision {
    this.decideCalls.push({ signal, config });
    return this.decideResult;
  }
}

// Task 20: FakeContextAssembler
export class FakeContextAssembler implements ContextAssembler {
  result: ContextBundle = {
    systemPrompt: "fake system prompt",
    userMessage: "fake user message",
    agentId: "dev-agent",
    threadId: "thread-1",
    featureName: "test-feature",
    resumePattern: "fresh",
    turnNumber: 0,
    tokenCounts: { layer1: 100, layer2: 200, layer3: 50, total: 350 },
  };
  assembleError: Error | null = null;
  assembleCalls: Array<{
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
  }> = [];

  async assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
  }): Promise<ContextBundle> {
    this.assembleCalls.push(params);
    if (this.assembleError) throw this.assembleError;
    return this.result;
  }
}

// Task 21: FakeSkillInvoker
export class FakeSkillInvoker implements SkillInvoker {
  result: InvocationResult = {
    textResponse: "fake response",
    routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
    artifactChanges: [],
    worktreePath: "/tmp/ptah-worktrees/fake",
    branch: "ptah/dev-agent/thread-1/fake",
    durationMs: 1000,
  };
  invokeError: Error | null = null;
  invokeCalls: Array<{ bundle: ContextBundle; config: PtahConfig }> = [];
  pruned = false;

  async invoke(bundle: ContextBundle, config: PtahConfig): Promise<InvocationResult> {
    this.invokeCalls.push({ bundle, config });
    if (this.invokeError) throw this.invokeError;
    return this.result;
  }

  async pruneOrphanedWorktrees(): Promise<void> {
    this.pruned = true;
  }
}

// Task 22: FakeResponsePoster
export class FakeResponsePoster implements ResponsePoster {
  postedEmbeds: Array<{
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }> = [];
  postedErrors: Array<{ threadId: string; errorMessage: string }> = [];
  completionEmbeds: Array<{ threadId: string; agentId: string; config: PtahConfig }> = [];
  createdThreads: Array<{
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }> = [];
  private nextMessageId = 1;

  async postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult> {
    this.postedEmbeds.push(params);
    return {
      messageId: `resp-msg-${this.nextMessageId++}`,
      threadId: params.threadId,
      newThreadCreated: false,
    };
  }

  async postCompletionEmbed(threadId: string, agentId: string, config: PtahConfig): Promise<void> {
    this.completionEmbeds.push({ threadId, agentId, config });
  }

  async postErrorEmbed(threadId: string, errorMessage: string): Promise<void> {
    this.postedErrors.push({ threadId, errorMessage });
  }

  async createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string> {
    this.createdThreads.push(params);
    return `coord-thread-${this.createdThreads.length}`;
  }
}

// Task 23: FakeTokenCounter
export class FakeTokenCounter implements TokenCounter {
  fixedCount: number | null = null;

  count(text: string): number {
    if (this.fixedCount !== null) return this.fixedCount;
    return Math.ceil(text.length / 4);
  }
}

// --- Thread message factory ---

export interface ThreadMessageOptions {
  id?: string;
  threadId?: string;
  threadName?: string;
  parentChannelId?: string;
  authorId?: string;
  authorName?: string;
  isBot?: boolean;
  content?: string;
  timestamp?: Date;
}

export function createThreadMessage(options: ThreadMessageOptions = {}): ThreadMessage {
  return {
    id: options.id ?? "msg-1",
    threadId: options.threadId ?? "thread-1",
    threadName: options.threadName ?? "test-thread",
    parentChannelId: options.parentChannelId ?? "parent-1",
    authorId: options.authorId ?? "user-1",
    authorName: options.authorName ?? "TestUser",
    isBot: options.isBot ?? false,
    content: options.content ?? "test message",
    timestamp: options.timestamp ?? new Date("2026-03-09T12:00:00Z"),
  };
}
