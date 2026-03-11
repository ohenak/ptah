export interface InitResult {
  created: string[];
  skipped: string[];
  committed: boolean;
}

export interface DiscordConfig {
  bot_token_env: string;
  server_id: string;
  channels: {
    updates: string;
    questions: string;
    debug: string;
  };
  mention_user_id: string;
}

// --- Phase 3: Agent config with optional colour and role mention mappings ---

export interface AgentConfig {
  active: string[];
  skills: Record<string, string>;
  model: string;
  max_tokens: number;
  colours?: Record<string, string>;
  role_mentions?: Record<string, string>;
}

// Token budget configuration (configurable per CB-R5)
export interface TokenBudgetConfig {
  layer1_pct: number;
  layer2_pct: number;
  layer3_pct: number;
  thread_pct: number;
  headroom_pct: number;
}

export interface PtahConfig {
  project: {
    name: string;
    version: string;
  };
  agents: AgentConfig;
  discord: DiscordConfig;
  orchestrator: {
    max_turns_per_thread: number;
    pending_poll_seconds: number;
    retry_attempts: number;
    invocation_timeout_ms?: number;
    token_budget?: TokenBudgetConfig;
  };
  git: {
    commit_prefix: string;
    auto_commit: boolean;
  };
  docs: {
    root: string;
    templates: string;
  };
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  threadName: string;
  parentChannelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;
  content: string;
  timestamp: Date;
}

export interface StartResult {
  cleanup: () => Promise<void>;
}

// --- Phase 3: Routing types ---

export type RoutingSignalType =
  | "ROUTE_TO_AGENT"
  | "ROUTE_TO_USER"
  | "LGTM"
  | "TASK_COMPLETE";

export type ThreadAction = "reply" | "new_thread";

export interface RoutingSignal {
  type: RoutingSignalType;
  agentId?: string;
  question?: string;
  threadAction?: ThreadAction;
}

export interface RoutingDecision {
  signal: RoutingSignal;
  targetAgentId: string | null;
  isTerminal: boolean;
  isPaused: boolean;
  createNewThread: boolean;
}

export type ResumePattern = "fresh" | "pattern_a" | "pattern_b" | "pattern_c";

// --- Phase 5: User question types ---

// In-memory representation of a pending question entry
export interface PendingQuestion {
  id: string;               // "Q-0001"
  agentId: string;          // "pm-agent"
  threadId: string;         // Discord thread snowflake ID
  threadName: string;       // "auth — define requirements"
  askedAt: Date;            // when the question was written
  questionText: string;     // verbatim question from ROUTE_TO_USER signal
  answer: string | null;    // null until answered; verbatim once written
  discordMessageId: string | null;  // null until notification posted
}

// In-memory tracking record for the poller
export interface RegisteredQuestion {
  questionId: string;   // "Q-0001"
  agentId: string;      // "pm-agent"
  threadId: string;     // Discord thread snowflake ID
}

// Message type for non-thread channel messages (Phase 5 Discord writeback)
export interface ChannelMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;
  content: string;
  replyToMessageId: string | null;
  timestamp: Date;
}

// --- Phase 3: Context types ---

export interface ContextBundle {
  systemPrompt: string;
  userMessage: string;
  agentId: string;
  threadId: string;
  featureName: string;
  resumePattern: ResumePattern;
  turnNumber: number;
  tokenCounts: {
    layer1: number;
    layer2: number;
    layer3: number;
    total: number;
  };
}

export interface PatternAContext {
  taskReminder: string;
  question: string;
  answer: string;
}

export interface PatternCContext {
  priorTurns: string[];
  currentTurn: string;
  turnNumber: number;
  injectFinalReview: boolean;
}

// --- Phase 3: Invocation types ---

export interface SkillRequest {
  systemPrompt: string;
  userMessage: string;
  worktreePath: string;
  timeoutMs: number;
  allowedTools?: string[];
}

export interface SkillResponse {
  textContent: string;
}

export interface InvocationResult {
  textResponse: string;
  routingSignalRaw: string;
  artifactChanges: string[];
  durationMs: number;
}

// --- Phase 3: Response types ---

export interface EmbedOptions {
  threadId: string;
  title: string;
  description: string;
  colour: number;
  footer?: string;
}

export interface PostResult {
  messageId: string;
  threadId: string;
  newThreadCreated: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

// --- Phase 4: Artifact commit types ---

export type MergeResult = "merged" | "conflict" | "merge-error";

export interface CommitParams {
  worktreePath: string;
  branch: string;
  artifactChanges: string[];
  agentId: string;
  threadName: string;
}

export interface CommitResult {
  commitSha: string | null;
  mergeStatus: MergeResult | "no-changes" | "commit-error" | "lock-timeout";
  branch: string;
  conflictMessage?: string;
}

export type LogStatus = "completed" | "completed (no changes)" | "conflict" | "error";

export interface LogEntry {
  agentId: string;
  threadId: string;
  threadName: string;
  status: LogStatus;
  commitSha: string | null;
  summary: string;
  timestamp: Date;
}
