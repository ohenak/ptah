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
import type { MergeLock, MergeLockRelease } from "../../src/orchestrator/merge-lock.js";
import { MergeLockTimeoutError } from "../../src/orchestrator/merge-lock.js";
import type { ArtifactCommitter } from "../../src/orchestrator/artifact-committer.js";
import type { AgentLogWriter } from "../../src/orchestrator/agent-log-writer.js";
import type { MessageDeduplicator } from "../../src/orchestrator/message-deduplicator.js";
import type { PhaseDetector, PhaseDetectionResult } from "../../src/orchestrator/phase-detector.js";
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
  MergeResult,
  CommitParams,
  CommitResult,
  ArtifactLogEntry,
  PendingQuestion,
  ChannelMessage,
  LogEntry,
  Component,
  LogLevel,
  AgentEntry,
  RegisteredAgent,
  UserFacingErrorType,
  UserFacingErrorContext,
  MergeBranchParams,
  BranchMergeResult,
  FeatureConfig,
  ContextDocumentSet,
  TaskType,
  CommitAndPushParams,
  CommitAndPushResult,
} from "../../src/types.js";
import type { WorktreeRegistry, ActiveWorktree } from "../../src/orchestrator/worktree-registry.js";
import type { FeatureResolver, FeatureResolverResult } from "../../src/orchestrator/feature-resolver.js";
import type { WorktreeManager, WorktreeHandle } from "../../src/orchestrator/worktree-manager.js";
import type { AgentRegistry } from "../../src/orchestrator/agent-registry.js";
import type { Message } from "discord.js";
import * as nodePath from "node:path";

export class FakeFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();
  private _cwd: string;
  writeFileError: Error | null = null;
  appendFileError: Error | null = null;
  appendFileCalls: Array<{ path: string; content: string }> = [];
  renameError: Error | null = null;
  /**
   * Per-path exists() override. Paths not present default to the normal
   * files/dirs check. Used by buildAgentRegistry() tests.
   */
  existsResults: Map<string, boolean> = new Map();

  /** When set, exists() throws this error on every call. */
  existsError: Error | null = null;

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
    if (this.existsError) throw this.existsError;
    if (this.existsResults.has(path)) return this.existsResults.get(path)!;
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
    const entries = new Set<string>();
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        if (!rest.includes("/")) {
          entries.add(rest);
        }
      }
    }
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(prefix)) {
        const rest = dirPath.slice(prefix.length);
        if (rest && !rest.includes("/")) {
          entries.add(rest);
        }
      }
    }
    return [...entries];
  }

  joinPath(...segments: string[]): string {
    return nodePath.join(...segments);
  }

  async appendFile(path: string, content: string): Promise<void> {
    this.appendFileCalls.push({ path, content });
    if (this.appendFileError) throw this.appendFileError;
    const existing = this.files.get(path) ?? "";
    this.files.set(path, existing + content);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.renameError) throw this.renameError;
    const content = this.files.get(oldPath);
    if (content === undefined) {
      const error = new Error(`ENOENT: no such file: ${oldPath}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    this.files.set(newPath, content);
    this.files.delete(oldPath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const content = this.files.get(src);
    if (content === undefined) {
      const error = new Error(`ENOENT: no such file: ${src}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    this.files.set(dest, content);
  }

  async readDirMatching(dirPath: string, pattern: RegExp): Promise<string[]> {
    const entries = await this.readDir(dirPath);
    return entries.filter((entry) => pattern.test(entry));
  }

  async listDirs(dirPath: string): Promise<string[]> {
    // Return only entries that are registered as directories
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    const result: string[] = [];
    for (const dir of this.dirs) {
      if (dir.startsWith(prefix)) {
        const rest = dir.slice(prefix.length);
        if (rest && !rest.includes("/")) {
          result.push(rest);
        }
      }
    }
    return result;
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
  createdWorktrees: WorktreeInfo[] = [];
  createWorktreeError: Error | null = null;
  removeWorktreeError: Error | null = null;
  deleteBranchError: Error | null = null;
  diffResult: string[] = [];
  removedWorktrees: string[] = [];
  deletedBranches: string[] = [];
  prunedPrefixes: string[] = [];

  // Phase 4 state
  addInWorktreeError: Error | null = null;
  addInWorktreeCalls: Array<{ worktreePath: string; files: string[] }> = [];

  commitInWorktreeResult: string = "abc1234";
  commitInWorktreeError: Error | null = null;
  commitInWorktreeCalls: Array<{ worktreePath: string; message: string }> = [];

  mergeResult: MergeResult = "merged";
  mergeError: Error | null = null;
  mergeCalls: string[] = [];

  abortMergeError: Error | null = null;
  abortMergeCalls: number = 0;

  getShortShaResult: string = "abc1234";
  getShortShaError: Error | null = null;
  getShortShaCalls: string[] = [];

  hasUnmergedCommitsResult: boolean = false;
  hasUnmergedCommitsCalls: string[] = [];

  diffWorktreeIncludingUntrackedResult: string[] = [];
  diffWorktreeIncludingUntrackedCalls: string[] = [];

  branchExistsResult: boolean = false;
  branchExistsCalls: string[] = [];

  // Phase 6 state
  hasUncommittedChangesResult = false;
  resetHardCalls: string[] = [];
  cleanCalls: string[] = [];
  addAllCalls: string[] = [];
  commitCalls: Array<{ path: string; message: string }> = [];

  // Phase 10 state
  createWorktreeFromBranchCalls: Array<{newBranch: string; path: string; baseBranch: string}> = [];
  createWorktreeFromBranchError: Error | null = null;

  checkoutBranchInWorktreeCalls: Array<{branch: string; path: string}> = [];
  checkoutBranchInWorktreeError: Error | null = null;

  createBranchFromRefCalls: Array<{branch: string; ref: string}> = [];
  createBranchFromRefError: Error | null = null;

  pullInWorktreeCalls: Array<{worktreePath: string; remote: string; branch: string}> = [];
  pullInWorktreeError: Error | null = null;

  mergeInWorktreeResult: MergeResult = "merged";
  mergeInWorktreeCalls: Array<{worktreePath: string; branch: string}> = [];
  mergeInWorktreeError: Error | null = null;

  abortMergeInWorktreeCalls: string[] = [];
  abortMergeInWorktreeError: Error | null = null;

  getConflictedFilesResult: string[] = [];
  getConflictedFilesCalls: string[] = [];

  pushInWorktreeCalls: Array<{worktreePath: string; remote: string; branch: string}> = [];
  pushInWorktreeError: Error | null = null;

  // Agent Coordination state
  worktreesOnBranch: Array<{ path: string; branch: string }> = [];
  addWorktreeOnBranchError: Error | null = null;
  ensuredBranches: string[] = [];
  ensureBranchExistsError: Error | null = null;

  async hasUncommittedChanges(_worktreePath: string): Promise<boolean> {
    return this.hasUncommittedChangesResult;
  }
  async resetHardInWorktree(worktreePath: string): Promise<void> {
    this.resetHardCalls.push(worktreePath);
  }
  async cleanInWorktree(worktreePath: string): Promise<void> {
    this.cleanCalls.push(worktreePath);
  }
  async addAllInWorktree(worktreePath: string): Promise<void> {
    this.addAllCalls.push(worktreePath);
  }

  // Phase 10 methods

  async createWorktreeFromBranch(newBranch: string, path: string, baseBranch: string): Promise<void> {
    this.createWorktreeFromBranchCalls.push({ newBranch, path, baseBranch });
    if (this.createWorktreeFromBranchError) throw this.createWorktreeFromBranchError;
    const wt = { path, branch: newBranch };
    this.worktrees.push(wt);
    this.createdWorktrees.push(wt);
  }

  async checkoutBranchInWorktree(branch: string, path: string): Promise<void> {
    this.checkoutBranchInWorktreeCalls.push({ branch, path });
    if (this.checkoutBranchInWorktreeError) throw this.checkoutBranchInWorktreeError;
    this.worktrees.push({ path, branch });
  }

  async createBranchFromRef(branch: string, ref: string): Promise<void> {
    this.createBranchFromRefCalls.push({ branch, ref });
    if (this.createBranchFromRefError) throw this.createBranchFromRefError;
  }

  async pullInWorktree(worktreePath: string, remote: string, branch: string): Promise<void> {
    this.pullInWorktreeCalls.push({ worktreePath, remote, branch });
    if (this.pullInWorktreeError) throw this.pullInWorktreeError;
  }

  async mergeInWorktree(worktreePath: string, branch: string): Promise<MergeResult> {
    this.mergeInWorktreeCalls.push({ worktreePath, branch });
    if (this.mergeInWorktreeError) throw this.mergeInWorktreeError;
    return this.mergeInWorktreeResult;
  }

  async abortMergeInWorktree(worktreePath: string): Promise<void> {
    this.abortMergeInWorktreeCalls.push(worktreePath);
    if (this.abortMergeInWorktreeError) throw this.abortMergeInWorktreeError;
  }

  async getConflictedFiles(worktreePath: string): Promise<string[]> {
    this.getConflictedFilesCalls.push(worktreePath);
    return this.getConflictedFilesResult;
  }

  async pushInWorktree(worktreePath: string, remote: string, branch: string): Promise<void> {
    this.pushInWorktreeCalls.push({ worktreePath, remote, branch });
    if (this.pushInWorktreeError) throw this.pushInWorktreeError;
  }

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
    const wt = { path, branch };
    this.worktrees.push(wt);
    this.createdWorktrees.push(wt);
  }

  async removeWorktree(path: string): Promise<void> {
    if (this.removeWorktreeError) throw this.removeWorktreeError;
    this.removedWorktrees.push(path);
    this.worktrees = this.worktrees.filter((wt) => wt.path !== path);
  }

  async deleteBranch(branch: string): Promise<void> {
    if (this.deleteBranchError) throw this.deleteBranchError;
    this.deletedBranches.push(branch);
  }

  listWorktreesError: Error | null = null;

  async listWorktrees(): Promise<WorktreeInfo[]> {
    if (this.listWorktreesError) throw this.listWorktreesError;
    return this.worktrees;
  }

  async pruneWorktrees(branchPrefix: string): Promise<void> {
    this.prunedPrefixes.push(branchPrefix);
    const toRemove = this.worktrees.filter((wt) => wt.branch.startsWith(branchPrefix));
    for (const wt of toRemove) {
      await this.removeWorktree(wt.path);
      await this.deleteBranch(wt.branch);
    }
  }

  async diffWorktree(_worktreePath: string): Promise<string[]> {
    return this.diffResult;
  }

  // Phase 4 methods

  async addInWorktree(worktreePath: string, paths: string[]): Promise<void> {
    this.addInWorktreeCalls.push({ worktreePath, files: paths });
    if (this.addInWorktreeError) throw this.addInWorktreeError;
  }

  async commitInWorktree(worktreePath: string, message: string): Promise<string> {
    this.commitInWorktreeCalls.push({ worktreePath, message });
    this.commitCalls.push({ path: worktreePath, message });
    if (this.commitInWorktreeError) throw this.commitInWorktreeError;
    return this.commitInWorktreeResult;
  }

  async merge(branch: string): Promise<MergeResult> {
    this.mergeCalls.push(branch);
    if (this.mergeError) throw this.mergeError;
    return this.mergeResult;
  }

  async abortMerge(): Promise<void> {
    this.abortMergeCalls++;
    if (this.abortMergeError) throw this.abortMergeError;
  }

  async getShortSha(worktreePath: string): Promise<string> {
    this.getShortShaCalls.push(worktreePath);
    if (this.getShortShaError) throw this.getShortShaError;
    return this.getShortShaResult;
  }

  async hasUnmergedCommits(branch: string): Promise<boolean> {
    this.hasUnmergedCommitsCalls.push(branch);
    return this.hasUnmergedCommitsResult;
  }

  async diffWorktreeIncludingUntracked(worktreePath: string): Promise<string[]> {
    this.diffWorktreeIncludingUntrackedCalls.push(worktreePath);
    return this.diffWorktreeIncludingUntrackedResult;
  }

  async branchExists(branch: string): Promise<boolean> {
    this.branchExistsCalls.push(branch);
    return this.branchExistsResult;
  }

  // Feature Lifecycle Folders
  gitMvInWorktreeCalls: Array<{ worktreePath: string; source: string; destination: string }> = [];
  gitMvInWorktreeError: Error | null = null;
  listDirInWorktreeResult: string[] = [];
  listDirInWorktreeCalls: Array<{ worktreePath: string; dirPath: string }> = [];
  listDirInWorktreeError: Error | null = null;

  async gitMvInWorktree(worktreePath: string, source: string, destination: string): Promise<void> {
    this.gitMvInWorktreeCalls.push({ worktreePath, source, destination });
    if (this.gitMvInWorktreeError) throw this.gitMvInWorktreeError;
  }

  async listDirInWorktree(worktreePath: string, dirPath: string): Promise<string[]> {
    this.listDirInWorktreeCalls.push({ worktreePath, dirPath });
    if (this.listDirInWorktreeError) throw this.listDirInWorktreeError;
    return this.listDirInWorktreeResult;
  }

  // Agent Coordination methods

  async addWorktreeOnBranch(path: string, branch: string): Promise<void> {
    if (this.addWorktreeOnBranchError) throw this.addWorktreeOnBranchError;
    this.worktreesOnBranch.push({ path, branch });
    this.worktrees.push({ path, branch });
  }

  async ensureBranchExists(branch: string, _baseBranch?: string): Promise<void> {
    if (this.ensureBranchExistsError) throw this.ensureBranchExistsError;
    this.ensuredBranches.push(branch);
  }

  // --- Cross-review file reading ---
  showFileFromBranchFiles: Map<string, string> = new Map();
  showFileFromBranchError: Error | null = null;
  showFileFromBranchCalls: Array<{ branch: string; filePath: string }> = [];

  async showFileFromBranch(branch: string, filePath: string): Promise<string> {
    this.showFileFromBranchCalls.push({ branch, filePath });
    if (this.showFileFromBranchError) throw this.showFileFromBranchError;
    const key = `${branch}:${filePath}`;
    const content = this.showFileFromBranchFiles.get(key);
    if (content === undefined) {
      throw new Error(`git show: ${branch}:${filePath} does not exist`);
    }
    return content;
  }

  // --- Review-branch helpers ---
  createOrResetBranchCalls: Array<{ branch: string; fromRef: string }> = [];
  createOrResetBranchError: Error | null = null;

  async createOrResetBranch(branch: string, fromRef: string): Promise<void> {
    this.createOrResetBranchCalls.push({ branch, fromRef });
    if (this.createOrResetBranchError) throw this.createOrResetBranchError;
  }

  fetchBranchInWorktreeCalls: Array<{ worktreePath: string; remote: string; branch: string }> = [];
  fetchBranchInWorktreeError: Error | null = null;

  async fetchBranchInWorktree(worktreePath: string, remote: string, branch: string): Promise<void> {
    this.fetchBranchInWorktreeCalls.push({ worktreePath, remote, branch });
    if (this.fetchBranchInWorktreeError) throw this.fetchBranchInWorktreeError;
  }

  rebaseOntoInWorktreeCalls: Array<{ worktreePath: string; onto: string }> = [];
  rebaseOntoInWorktreeError: Error | null = null;

  async rebaseOntoInWorktree(worktreePath: string, onto: string): Promise<void> {
    this.rebaseOntoInWorktreeCalls.push({ worktreePath, onto });
    if (this.rebaseOntoInWorktreeError) throw this.rebaseOntoInWorktreeError;
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
  postEmbedError: Error | null = null;
  createThreadError: Error | null = null;
  postEmbedFailOnCall: number | null = null;
  createThreadFailOnCall: number | null = null;
  private nextThreadId = 1;
  private nextMessageId = 1;
  private postEmbedCallCount = 0;
  private createThreadCallCount = 0;

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
    this.postEmbedCallCount++;
    if (this.postEmbedFailOnCall !== null) {
      if (this.postEmbedCallCount === this.postEmbedFailOnCall) {
        this.postEmbedFailOnCall = null; // only fail once
        const err = this.postEmbedError;
        this.postEmbedError = null; // clear so subsequent calls succeed
        if (err) throw err;
      }
      // If failOnCall is set but this isn't the target call, proceed normally
    } else if (this.postEmbedError) {
      throw this.postEmbedError;
    }
    this.postedEmbeds.push(options);
    return `embed-msg-${this.nextMessageId++}`;
  }

  async createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string> {
    this.createThreadCallCount++;
    if (this.createThreadFailOnCall !== null) {
      if (this.createThreadCallCount === this.createThreadFailOnCall) {
        this.createThreadFailOnCall = null; // only fail once
        const err = this.createThreadError;
        this.createThreadError = null; // clear so subsequent calls succeed
        if (err) throw err;
      }
    } else if (this.createThreadError) {
      throw this.createThreadError;
    }
    this.createdThreads.push({ channelId, name, initialMessage });
    const threadId = `fake-thread-${this.nextThreadId++}`;
    await this.postEmbed({ ...initialMessage, threadId });
    return threadId;
  }

  // --- Phase 5 additions ---
  postChannelMessageCalls: { channelId: string; content: string }[] = [];
  postChannelMessageResponse = "msg-001";
  postChannelMessageError: Error | null = null;
  addReactionCalls: { channelId: string; messageId: string; emoji: string }[] = [];
  addReactionError: Error | null = null;
  addReactionErrorValue?: unknown; // for throwing non-Error values (PROP-MA-18)
  replyToMessageCalls: { channelId: string; messageId: string; content: string }[] = [];
  replyToMessageError: Error | null = null;
  private channelMessageHandlers = new Map<string, (msg: ChannelMessage) => Promise<void>>();

  // --- Phase 6 additions ---
  debugChannelMessages: string[] = [];

  // --- Phase 7 additions ---
  calls: Array<
    | { method: "archiveThread"; threadId: string }
    | { method: "postPlainMessage"; threadId: string; content: string }
  > = [];
  archiveThreadCalls: string[] = [];
  archiveThreadError: Error | null = null;
  postPlainMessageCalls: Array<{ threadId: string; content: string }> = [];
  postPlainMessageError: Error | null = null;

  async postChannelMessage(channelId: string, content: string): Promise<string> {
    this.postChannelMessageCalls.push({ channelId, content });
    this.debugChannelMessages.push(content);
    if (this.postChannelMessageError) throw this.postChannelMessageError;
    return this.postChannelMessageResponse;
  }

  onChannelMessage(channelId: string, handler: (msg: ChannelMessage) => Promise<void>): void {
    this.channelMessageHandlers.set(channelId, handler);
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    this.addReactionCalls.push({ channelId, messageId, emoji });
    if (this.addReactionErrorValue !== undefined) throw this.addReactionErrorValue;
    if (this.addReactionError) throw this.addReactionError;
  }

  async replyToMessage(channelId: string, messageId: string, content: string): Promise<void> {
    this.replyToMessageCalls.push({ channelId, messageId, content });
    if (this.replyToMessageError) throw this.replyToMessageError;
  }

  async simulateChannelMessage(channelId: string, msg: ChannelMessage): Promise<void> {
    const handler = this.channelMessageHandlers.get(channelId);
    if (handler) await handler(msg);
  }

  async archiveThread(threadId: string): Promise<void> {
    this.calls.push({ method: "archiveThread", threadId });
    if (this.archiveThreadError) throw this.archiveThreadError;
    this.archiveThreadCalls.push(threadId);
  }

  async postPlainMessage(threadId: string, content: string): Promise<void> {
    this.calls.push({ method: "postPlainMessage", threadId, content });
    if (this.postPlainMessageError) throw this.postPlainMessageError;
    this.postPlainMessageCalls.push({ threadId, content });
  }
}

export function defaultTestConfig(): PtahConfig {
  return {
    project: {
      name: "test-project",
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
    agentEntries: [],
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
      invocation_timeout_ms: 90_000,
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

class FakeLogStore {
  entries: LogEntry[] = [];
}

export class FakeLogger implements Logger {
  private store: FakeLogStore;
  private _component: Component;

  constructor(component: Component = 'orchestrator', store?: FakeLogStore) {
    this._component = component;
    this.store = store ?? new FakeLogStore();
  }

  get entries(): LogEntry[] { return this.store.entries; }
  get messages(): Array<{ level: string; message: string }> {
    return this.store.entries.map(e => ({
      level: e.level.toLowerCase(),
      message: e.message,
    }));
  }

  log(entry: LogEntry): void {
    this.store.entries.push(entry);
  }

  info(message: string): void {
    this.store.entries.push({ component: this._component, level: "INFO", message });
  }
  warn(message: string): void {
    this.store.entries.push({ component: this._component, level: "WARN", message });
  }
  error(message: string): void {
    this.store.entries.push({ component: this._component, level: "ERROR", message });
  }
  debug(message: string): void {
    this.store.entries.push({ component: this._component, level: "DEBUG", message });
  }

  forComponent(component: Component): FakeLogger {
    return new FakeLogger(component, this.store);
  }

  /** Convenience: get all entries at a given level */
  entriesAt(level: LogLevel): LogEntry[] {
    return this.store.entries.filter(e => e.level === level);
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
  invokeDelay = 0;
  private callIndex = 0;

  async invoke(request: SkillRequest): Promise<SkillResponse> {
    this.invocations.push(request);
    if (this.invokeDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.invokeDelay));
    }
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

// Task 20: FakeContextAssembler (updated for Phase 4 — worktreePath support)
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
    worktreePath?: string;
    contextDocuments?: ContextDocumentSet;
    taskType?: TaskType;
    documentType?: string;
    contextDocumentRefs?: string[];
  }> = [];

  async assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
    worktreePath?: string;
    contextDocuments?: ContextDocumentSet;
    taskType?: TaskType;
    documentType?: string;
    contextDocumentRefs?: string[];
  }): Promise<ContextBundle> {
    this.assembleCalls.push(params);
    if (this.assembleError) throw this.assembleError;
    return this.result;
  }
}

// Task 21: FakeSkillInvoker (updated for Phase 4 — worktreePath parameter)
export class FakeSkillInvoker implements SkillInvoker {
  result: InvocationResult = {
    textResponse: "fake response",
    routingSignalRaw: '<routing>{"type":"TASK_COMPLETE"}</routing>',
    artifactChanges: [],
    durationMs: 1000,
  };
  invokeError: Error | null = null;
  invokeCalls: Array<{ bundle: ContextBundle; config: PtahConfig; worktreePath?: string }> = [];
  pruned = false;

  async invoke(bundle: ContextBundle, config: PtahConfig, worktreePath?: string): Promise<InvocationResult> {
    this.invokeCalls.push({ bundle, config, worktreePath });
    if (this.invokeError) throw this.invokeError;
    return this.result;
  }

  async pruneOrphanedWorktrees(): Promise<void> {
    this.pruned = true;
  }
}

// Task 22: FakeResponsePoster
export class FakeResponsePoster implements ResponsePoster {
  // postAgentResponse tracking
  agentResponseCalls: Array<{
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }> = [];
  agentResponseResult: PostResult = { messageId: "msg1", threadId: "t1", newThreadCreated: false };
  agentResponseError: Error | null = null;

  // New typed embed tracking (D4)
  routingNotificationCalls: Array<{ threadId: string; fromAgentDisplayName: string; toAgentDisplayName: string }> = [];
  resolutionNotificationCalls: Array<{ threadId: string; signalType: 'LGTM' | 'TASK_COMPLETE'; agentDisplayName: string }> = [];
  errorReportCalls: Array<{ threadId: string; errorType: UserFacingErrorType; context: UserFacingErrorContext }> = [];
  userEscalationCalls: Array<{ threadId: string; agentDisplayName: string; question: string }> = [];

  // Error injection for typed embeds
  routingNotificationError: Error | null = null;
  resolutionNotificationError: Error | null = null;
  errorReportError: Error | null = null;
  userEscalationError: Error | null = null;

  // createCoordinationThread tracking
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
    this.agentResponseCalls.push(params);
    if (this.agentResponseError) throw this.agentResponseError;
    return {
      messageId: `resp-msg-${this.nextMessageId++}`,
      threadId: params.threadId,
      newThreadCreated: false,
    };
  }

  async postRoutingNotificationEmbed(params: {
    threadId: string;
    fromAgentDisplayName: string;
    toAgentDisplayName: string;
  }): Promise<void> {
    this.routingNotificationCalls.push(params);
    if (this.routingNotificationError) throw this.routingNotificationError;
  }

  async postResolutionNotificationEmbed(params: {
    threadId: string;
    signalType: 'LGTM' | 'TASK_COMPLETE';
    agentDisplayName: string;
  }): Promise<void> {
    this.resolutionNotificationCalls.push(params);
    if (this.resolutionNotificationError) throw this.resolutionNotificationError;
  }

  async postErrorReportEmbed(params: {
    threadId: string;
    errorType: UserFacingErrorType;
    context: UserFacingErrorContext;
  }): Promise<void> {
    this.errorReportCalls.push(params);
    if (this.errorReportError) throw this.errorReportError;
  }

  async postUserEscalationEmbed(params: {
    threadId: string;
    agentDisplayName: string;
    question: string;
  }): Promise<void> {
    this.userEscalationCalls.push(params);
    if (this.userEscalationError) throw this.userEscalationError;
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
  shouldThrow = false;

  count(text: string): number {
    if (this.shouldThrow) throw new Error("TokenCounter unavailable");
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

// --- Phase 13: Auto-init factory helpers ---

export function createBotMessageWithRouting(content = '<routing>{}</routing>'): ThreadMessage {
  return createThreadMessage({ isBot: true, content });
}

export function createBotMessageNoRouting(content = "Progress update"): ThreadMessage {
  return createThreadMessage({ isBot: true, content });
}

// --- Phase 6: New fakes ---

export class FakeWorktreeRegistry implements WorktreeRegistry {
  worktrees: ActiveWorktree[] = [];
  register(entry: ActiveWorktree): void {
    // Remove existing entry with same path (overwrite behavior)
    this.worktrees = this.worktrees.filter(w => w.worktreePath !== entry.worktreePath);
    this.worktrees.push(entry);
  }
  deregister(worktreePath: string): void {
    this.worktrees = this.worktrees.filter(w => w.worktreePath !== worktreePath);
  }
  getAll(): ReadonlyArray<ActiveWorktree> { return this.worktrees; }
  findByActivity(activityId: string): ActiveWorktree | undefined {
    return this.worktrees.find(w => w.activityId === activityId);
  }
  size(): number { return this.worktrees.length; }
}


// --- Phase 4: New fakes ---

// Task 11: FakeMergeLock
export class FakeMergeLock implements MergeLock {
  acquireCalls: number[] = [];
  releaseCalls: number = 0;
  acquireError: Error | null = null;

  async acquire(timeoutMs?: number): Promise<MergeLockRelease> {
    this.acquireCalls.push(timeoutMs ?? 10_000);
    if (this.acquireError) throw this.acquireError;
    return () => {
      this.releaseCalls++;
    };
  }
}

// Phase 14: FakeMergeLockWithTimeout — simulates a lock timeout
export class FakeMergeLockWithTimeout implements MergeLock {
  async acquire(_timeoutMs?: number): Promise<MergeLockRelease> {
    throw new MergeLockTimeoutError(30_000);
  }
}

// Task 12: FakeArtifactCommitter
export class FakeArtifactCommitter implements ArtifactCommitter {
  results: CommitResult[] = [defaultCommitResult()];
  callIndex: number = 0;
  commitAndMergeCalls: CommitParams[] = [];
  mergeBranchError: Error | null = null;
  mergeBranchResult: BranchMergeResult = {
    status: "merged",
    commitSha: "abc123",
    conflictingFiles: [],
    errorMessage: null,
  };
  mergeBranchCalls: MergeBranchParams[] = [];

  // Agent Coordination state
  commitAndPushCalls: CommitAndPushParams[] = [];
  commitAndPushResult: CommitAndPushResult = {
    commitSha: "abc1234",
    pushStatus: "pushed",
    featureBranch: "feat-test",
  };
  commitAndPushError: Error | null = null;

  async commitAndMerge(params: CommitParams): Promise<CommitResult> {
    this.commitAndMergeCalls.push(params);
    if (this.callIndex >= this.results.length) {
      // Return the last configured result for any overflow calls
      return this.results[this.results.length - 1]!;
    }
    return this.results[this.callIndex++];
  }

  async mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult> {
    this.mergeBranchCalls.push(params);
    if (this.mergeBranchError) throw this.mergeBranchError;
    return this.mergeBranchResult;
  }

  async commitAndPush(params: CommitAndPushParams): Promise<CommitAndPushResult> {
    this.commitAndPushCalls.push(params);
    if (this.commitAndPushError) throw this.commitAndPushError;
    return this.commitAndPushResult;
  }
}

// Task 13: FakeAgentLogWriter
export class FakeAgentLogWriter implements AgentLogWriter {
  entries: ArtifactLogEntry[] = [];
  appendError: Error | null = null;

  async append(entry: ArtifactLogEntry): Promise<void> {
    if (this.appendError) throw this.appendError;
    this.entries.push(entry);
  }
}

// Task 14: FakeMessageDeduplicator
export class FakeMessageDeduplicator implements MessageDeduplicator {
  seenIds: Set<string> = new Set();
  duplicateIds: Set<string> = new Set();

  isDuplicate(messageId: string): boolean {
    if (this.duplicateIds.has(messageId) || this.seenIds.has(messageId)) {
      this.seenIds.add(messageId);
      return true;
    }
    this.seenIds.add(messageId);
    return false;
  }
}

// --- Phase 4: Factory functions ---

export function defaultCommitResult(): CommitResult {
  return {
    commitSha: "abc1234",
    mergeStatus: "merged",
    branch: "ptah/test-feature/dev-agent/fakeid",
  };
}

// --- Phase 5: New fakes and factories ---

// Task 11: createPendingQuestion factory
export function createPendingQuestion(overrides: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    id: "Q-0001",
    agentId: "pm-agent",
    threadId: "thread-123",
    threadName: "auth — define requirements",
    askedAt: new Date("2026-01-01T10:00:00Z"),
    questionText: "What is the expected response format?",
    answer: null,
    discordMessageId: null,
    ...overrides,
  };
}

// Task 12: createChannelMessage factory
export function createChannelMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: "msg-001",
    channelId: "channel-open-questions",
    authorId: "user-456",
    authorName: "kane",
    isBot: false,
    content: "The response format should be JSON.",
    replyToMessageId: null,
    timestamp: new Date("2026-01-01T10:05:00Z"),
    ...overrides,
  };
}

// --- Phase 7: Agent factory functions ---

export function makeAgentEntry(overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    id: "test-agent",
    skill_path: "./ptah/skills/test-agent.md",
    log_file: "./ptah/logs/test-agent.log",
    mention_id: "111111111111111111",
    display_name: "Test Agent",
    ...overrides,
  };
}

export function makeRegisteredAgent(overrides: Partial<RegisteredAgent> = {}): RegisteredAgent {
  return {
    id: "test-agent",
    skill_path: "./ptah/skills/test-agent.md",
    log_file: "./ptah/logs/test-agent.log",
    mention_id: "111111111111111111",
    display_name: "Test Agent",
    ...overrides,
  };
}

export class FakeAgentRegistry implements AgentRegistry {
  private agents: RegisteredAgent[];

  constructor(agents: RegisteredAgent[] = []) {
    this.agents = agents;
  }

  getAgentById(id: string): RegisteredAgent | null {
    return this.agents.find((a) => a.id === id) ?? null;
  }

  getAgentByMentionId(mentionId: string): RegisteredAgent | null {
    return this.agents.find((a) => a.mention_id === mentionId) ?? null;
  }

  getAllAgents(): RegisteredAgent[] {
    return [...this.agents];
  }
}

/** Stub FeatureConfig with useTechLead=true */
export function makeTechLeadConfig(overrides?: Partial<FeatureConfig>): FeatureConfig {
  return {
    discipline: "backend-only",
    skipFspec: false,
    useTechLead: true,
    ...overrides,
  };
}

// --- Phase 14: mergeBranchIntoFeature factory helpers ---

import { DefaultArtifactCommitter } from "../../src/orchestrator/artifact-committer.js";

/** Factory: create a DefaultArtifactCommitter with a FakeGitClient and default FakeMergeLock */
export function makeCommitter(git: GitClient): DefaultArtifactCommitter {
  return new DefaultArtifactCommitter(git, new FakeMergeLock(), new FakeLogger());
}

/** Factory: create a DefaultArtifactCommitter with a specific lock implementation */
export function makeCommitterWithLock(git: GitClient, lock: MergeLock): DefaultArtifactCommitter {
  return new DefaultArtifactCommitter(git, lock, new FakeLogger());
}

/** Factory: default MergeBranchParams for tests */
export function makeMergeBranchParams(overrides?: Partial<MergeBranchParams>): MergeBranchParams {
  return {
    sourceBranch: "worktree/phase-a",
    featureBranch: "feat-014-tech-lead-orchestration",
    featureBranchWorktreePath: "/tmp/worktree-feature",
    agentId: "eng",
    ...overrides,
  };
}

// --- Phase 15: Temporal Foundation fakes ---

import type { WorkflowConfigLoader, WorkflowConfig, PhaseDefinition } from "../../src/config/workflow-config.js";
import type {
  AdHocRevisionSignal,
  FeatureWorkflowState,
  StartWorkflowParams,
  UserAnswerSignal,
  SkillActivityInput,
  SkillActivityResult,
  NotificationInput,
} from "../../src/temporal/types.js";

export type { TemporalClientWrapper } from "../../src/temporal/client.js";

/**
 * FakeWorkflowConfigLoader — returns a pre-configured WorkflowConfig.
 */
export class FakeWorkflowConfigLoader implements WorkflowConfigLoader {
  config: WorkflowConfig;
  loadError: Error | null = null;

  constructor(config?: Partial<WorkflowConfig>) {
    this.config = {
      version: 1,
      phases: [
        {
          id: "req-creation",
          name: "Requirements Creation",
          type: "creation",
          agent: "pm",
          context_documents: ["{feature}/overview"],
          transition: "req-review",
        },
        {
          id: "req-review",
          name: "Requirements Review",
          type: "review",
          reviewers: { default: ["eng"] },
          context_documents: ["{feature}/REQ"],
          transition: "req-approved",
          revision_bound: 3,
        },
        {
          id: "req-approved",
          name: "Requirements Approved",
          type: "approved",
        },
      ],
      ...config,
    };
  }

  async load(_path?: string): Promise<WorkflowConfig> {
    if (this.loadError) throw this.loadError;
    return this.config;
  }
}

/**
 * FakeTemporalClient — records all calls for assertion.
 */
export class FakeTemporalClient implements TemporalClientWrapper {
  startedWorkflows: StartWorkflowParams[] = [];
  sentSignals: { workflowId: string; signal: string; payload: unknown }[] = [];
  workflowStates: Map<string, FeatureWorkflowState> = new Map();
  workflowIds: Map<string, string[]> = new Map(); // prefix → workflow IDs
  connectionError: Error | null = null;
  disconnectError: Error | null = null;
  startWorkflowError: Error | null = null;
  signalError: Error | null = null;
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;

  // Global error injection for queryWorkflowState (simulates Temporal outage)
  queryWorkflowStateError: Error | null = null;


  // Agent Coordination state
  adHocSignals: Array<{ workflowId: string; signal: AdHocRevisionSignal }> = [];
  signalAdHocRevisionError: Error | null = null;

  async connect(): Promise<void> {
    this.connectCalls++;
    if (this.connectionError) throw this.connectionError;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls++;
    if (this.disconnectError) throw this.disconnectError;
    this.connected = false;
  }

  async startFeatureWorkflow(params: StartWorkflowParams): Promise<string> {
    if (this.startWorkflowError) throw this.startWorkflowError;
    this.startedWorkflows.push(params);
    return `ptah-${params.featureSlug}`;
  }

  async signalUserAnswer(workflowId: string, answer: UserAnswerSignal): Promise<void> {
    if (this.signalError) throw this.signalError;
    this.sentSignals.push({ workflowId, signal: "user-answer", payload: answer });
  }

  async signalRetryOrCancel(workflowId: string, action: "retry" | "cancel"): Promise<void> {
    if (this.signalError) throw this.signalError;
    this.sentSignals.push({ workflowId, signal: "retry-or-cancel", payload: action });
  }

  async signalResumeOrCancel(workflowId: string, action: "resume" | "cancel"): Promise<void> {
    if (this.signalError) throw this.signalError;
    this.sentSignals.push({ workflowId, signal: "resume-or-cancel", payload: action });
  }

  async queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState> {
    // Global error injection takes priority (simulates Temporal server outage)
    if (this.queryWorkflowStateError) throw this.queryWorkflowStateError;

    const state = this.workflowStates.get(workflowId);
    if (!state) {
      const err = new Error(`Workflow ${workflowId} not found`);
      err.name = "WorkflowNotFoundError";
      throw err;
    }
    return state;
  }

  async signalAdHocRevision(workflowId: string, signal: AdHocRevisionSignal): Promise<void> {
    if (this.signalAdHocRevisionError) throw this.signalAdHocRevisionError;
    this.adHocSignals.push({ workflowId, signal });
    this.sentSignals.push({ workflowId, signal: "ad-hoc-revision", payload: signal });
  }

  async listWorkflowsByPrefix(prefix: string): Promise<string[]> {
    return this.workflowIds.get(prefix) ?? [];
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Minimal fake for the Temporal Worker (from @temporalio/worker) */
export class FakeTemporalWorker {
  running = false;
  shutdownCalled = false;
  shutdownError: Error | null = null;
  runError: Error | null = null;
  private runResolve: (() => void) | null = null;

  async run(): Promise<void> {
    if (this.runError) throw this.runError;
    this.running = true;
    await new Promise<void>((resolve) => {
      this.runResolve = resolve;
    });
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
    if (this.shutdownError) throw this.shutdownError;
    this.running = false;
    this.runResolve?.();
  }
}

/**
 * Factory: default WorkflowConfig for tests (minimal 3-phase pipeline).
 */
export function defaultTestWorkflowConfig(overrides?: Partial<WorkflowConfig>): WorkflowConfig {
  return new FakeWorkflowConfigLoader(overrides).config;
}

/**
 * Factory: default FeatureWorkflowState for tests.
 */
export function defaultFeatureWorkflowState(
  overrides?: Partial<FeatureWorkflowState>,
): FeatureWorkflowState {
  return {
    featureSlug: "test-feature",
    featureConfig: { discipline: "backend-only", skipFspec: false },
    workflowConfig: defaultTestWorkflowConfig(),
    currentPhaseId: "req-creation",
    completedPhaseIds: [],
    activeAgentIds: ["pm"],
    phaseStatus: "running",
    reviewStates: {},
    forkJoinState: null,
    pendingQuestion: null,
    failureInfo: null,
    startedAt: "2026-04-02T00:00:00Z",
    updatedAt: "2026-04-02T00:00:00Z",
    featurePath: null,
    worktreeRoot: null,
    signOffs: {},
    adHocQueue: [],
    adHocInProgress: false,
    ...overrides,
  };
}

// --- Feature Lifecycle Folders: New fakes ---

export class FakeFeatureResolver implements FeatureResolver {
  private results = new Map<string, FeatureResolverResult>();
  resolveCalls: Array<{ slug: string; worktreeRoot: string }> = [];

  /** Pre-configure a result for a given slug */
  setResult(slug: string, result: FeatureResolverResult): void {
    this.results.set(slug, result);
  }

  async resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult> {
    this.resolveCalls.push({ slug, worktreeRoot });
    const result = this.results.get(slug);
    if (result) return result;
    return { found: false, slug };
  }
}

export class FakeWorktreeManager implements WorktreeManager {
  createCalls: Array<{ featureBranch: string; workflowId: string; runId: string; activityId: string }> = [];
  destroyCalls: string[] = [];
  cleanupCalls: Set<string>[] = [];
  worktreeCounter = 0;

  async create(featureBranch: string, workflowId: string, runId: string, activityId: string): Promise<WorktreeHandle> {
    this.createCalls.push({ featureBranch, workflowId, runId, activityId });
    this.worktreeCounter++;
    return { path: `/tmp/ptah-wt-fake-${this.worktreeCounter}/`, branch: `ptah-wt-fake-${this.worktreeCounter}` };
  }

  async destroy(worktreePath: string): Promise<void> {
    this.destroyCalls.push(worktreePath);
  }

  async cleanupDangling(activeExecutions: Set<string>): Promise<void> {
    this.cleanupCalls.push(activeExecutions);
  }
}

export class FakePhaseDetector implements PhaseDetector {
  /** Default result returned by detect(). Override per test. */
  result: PhaseDetectionResult = {
    startAtPhase: "req-creation",
    resolvedLifecycle: "in-progress",
    reqPresent: false,
    overviewPresent: false,
  };

  /** When set, detect() throws this error instead of returning result. */
  detectError: Error | null = null;

  /** Records all slugs passed to detect(). */
  detectedSlugs: string[] = [];

  async detect(slug: string): Promise<PhaseDetectionResult> {
    this.detectedSlugs.push(slug);
    if (this.detectError) throw this.detectError;
    return this.result;
  }
}
