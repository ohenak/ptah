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

export interface PtahConfig {
  project: {
    name: string;
    version: string;
  };
  agents: {
    active: string[];
    skills: Record<string, string>;
    model: string;
    max_tokens: number;
  };
  discord: DiscordConfig;
  orchestrator: {
    max_turns_per_thread: number;
    pending_poll_seconds: number;
    retry_attempts: number;
    invocation_timeout_ms: number;
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

export type ResumePattern = "new" | "continue" | "revise";

export interface ContextBundle {
  systemPrompt: string;
  userMessage: string;
  agentId: string;
  threadId: string;
  featureName: string;
  resumePattern: ResumePattern;
  turnNumber: number;
  tokenCounts: { layer1: number; layer2: number; layer3: number; total: number };
}

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
  worktreePath: string;
  branch: string;
  durationMs: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}
