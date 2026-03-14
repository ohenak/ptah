import type {
  ContextBundle,
  ThreadMessage,
  PtahConfig,
  ResumePattern,
  TokenBudgetConfig,
} from "../types.js";
import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";
import type { TokenCounter } from "./token-counter.js";

export interface ContextAssembler {
  assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
    worktreePath?: string;  // Phase 4: read Layer 2 from worktree when provided
  }): Promise<ContextBundle>;
}

const TWO_ITERATION_RULE =
  "You have a maximum of 2 iterations to complete your task. Make each iteration count.";

const ROUTING_INSTRUCTION =
  "When you need to hand off work to another agent, include a <routing> tag in your response specifying the target agent and reason.";

const DEFAULT_TOKEN_BUDGET: TokenBudgetConfig = {
  layer1_pct: 25,
  layer2_pct: 35,
  layer3_pct: 30,
  thread_pct: 5,
  headroom_pct: 5,
};

export class DefaultContextAssembler implements ContextAssembler {
  private readonly fs: FileSystem;
  private readonly tokenCounter: TokenCounter;
  private readonly logger: Logger;

  constructor(fs: FileSystem, tokenCounter: TokenCounter, logger: Logger) {
    this.fs = fs;
    this.tokenCounter = tokenCounter;
    this.logger = logger;
  }

  async assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
    worktreePath?: string;
  }): Promise<ContextBundle> {
    const { agentId, threadId, threadName, threadHistory, triggerMessage, config, worktreePath } = params;

    const featureName = this.extractFeatureName(threadName);
    const resumePattern = this.detectResumePattern(agentId, threadHistory);

    // Determine the base path for Layer 1/2 file reads
    // Phase 4: when worktreePath is provided, read from worktree; otherwise main repo
    // config.docs.root is relative to ptah/ (e.g. "../docs"), but worktreePath is the
    // repo root, so strip leading "../" segments to get the repo-relative path.
    const docsRoot = worktreePath
      ? this.fs.joinPath(worktreePath, config.docs.root.replace(/^(?:\.\.\/)+/, ""))
      : config.docs.root;

    // Read role prompt (fatal if missing) — always from main repo
    const rolePrompt = await this.readRolePrompt(agentId, config);

    // Read overview.md for Layer 1 (from worktree if available)
    const overviewContent = await this.readOverviewFromBase(featureName, docsRoot);

    // Build Layer 1: system prompt
    const layer1 = this.buildLayer1(rolePrompt, overviewContent);

    // Build Layer 3: user message
    const layer3 = this.buildLayer3(
      resumePattern,
      agentId,
      triggerMessage,
      threadHistory,
      config,
    );

    // Read Layer 2: feature folder files (excluding overview.md)
    let layer2Files = await this.readFeatureFilesFromBase(featureName, docsRoot);

    // Token budget enforcement
    const budget = config.orchestrator.token_budget ?? DEFAULT_TOKEN_BUDGET;
    const maxTokens = config.agents.max_tokens;

    const layer1Tokens = this.safeCount(layer1);
    const layer3Tokens = this.safeCount(layer3);

    // Check if L1+L3 exceed 85% budget — omit Layer 2 entirely
    const l1l3Combined = layer1Tokens + layer3Tokens;
    const budgetThreshold = maxTokens * 0.85;

    let layer2Content = "";
    let layer2Tokens = 0;

    if (l1l3Combined > budgetThreshold) {
      this.logger.warn(
        "Layer 1 + Layer 3 exceed 85% of token budget; omitting Layer 2 entirely",
      );
    } else {
      // Calculate available budget for Layer 2
      const layer2Budget = Math.floor(maxTokens * (budget.layer2_pct / 100));
      layer2Content = this.assembleLayer2(layer2Files, layer2Budget);
      layer2Tokens = this.safeCount(layer2Content);
    }

    // Build final system prompt with Layer 2 included
    const systemPrompt = layer2Content
      ? `${layer1}\n\n## Feature Files\n\n${layer2Content}`
      : layer1;

    const turnNumber = this.countTurns(agentId, threadHistory, resumePattern);

    return {
      systemPrompt,
      userMessage: layer3,
      agentId,
      threadId,
      featureName,
      resumePattern,
      turnNumber,
      tokenCounts: {
        layer1: layer1Tokens,
        layer2: layer2Tokens,
        layer3: layer3Tokens,
        total: layer1Tokens + layer2Tokens + layer3Tokens,
      },
    };
  }

  extractFeatureName(threadName: string): string {
    const emDashIndex = threadName.indexOf(" \u2014 ");
    if (emDashIndex !== -1) {
      return threadName.substring(0, emDashIndex);
    }
    return threadName;
  }

  detectResumePattern(
    agentId: string,
    threadHistory: ThreadMessage[],
  ): ResumePattern {
    // Find prior agent turns (bot messages with embeds, i.e., bot-posted messages)
    const agentTurns = threadHistory.filter((m) => m.isBot);

    if (agentTurns.length === 0) {
      return "fresh";
    }

    // Check Pattern A: most recent routing signal targets a different agent
    // We detect this by checking if the most recent bot message was from a different agent
    // Pattern A: the most recent bot message's authorId !== agentId (hand-off from another agent)
    const lastBotMessage = agentTurns[agentTurns.length - 1];
    if (lastBotMessage.authorId !== agentId) {
      return "pattern_a";
    }

    // Default: Pattern C (review loop)
    return "pattern_c";
  }

  private async readRolePrompt(agentId: string, config: PtahConfig): Promise<string> {
    const skillPath = config.agents.skills[agentId];
    if (!skillPath) {
      throw new Error(`No skill path configured for agent: ${agentId}`);
    }

    try {
      return await this.fs.readFile(skillPath);
    } catch (err) {
      throw new Error(`Missing role prompt for agent ${agentId}: ${skillPath}`);
    }
  }

  private async readOverview(featureName: string, config: PtahConfig): Promise<string | null> {
    return this.readOverviewFromBase(featureName, config.docs.root);
  }

  private async readOverviewFromBase(featureName: string, docsRoot: string): Promise<string | null> {
    const overviewPath = this.fs.joinPath(docsRoot, featureName, "overview.md");
    try {
      const content = await this.fs.readFile(overviewPath);
      return content;
    } catch {
      this.logger.warn(`overview.md not found for feature: ${featureName}`);
      return null;
    }
  }

  private buildLayer1(rolePrompt: string, overviewContent: string | null): string {
    const parts = [rolePrompt];

    if (overviewContent) {
      parts.push(`## Overview\n\n${overviewContent}`);
    }

    parts.push(TWO_ITERATION_RULE);
    parts.push(ROUTING_INSTRUCTION);

    return parts.join("\n\n");
  }

  private buildLayer3(
    pattern: ResumePattern,
    agentId: string,
    triggerMessage: ThreadMessage,
    threadHistory: ThreadMessage[],
    config: PtahConfig,
  ): string {
    if (pattern === "fresh") {
      return triggerMessage.content;
    }

    if (pattern === "pattern_a") {
      return this.buildPatternALayer3(agentId, triggerMessage, threadHistory);
    }

    return this.buildPatternCLayer3(agentId, threadHistory, config);
  }

  private buildPatternALayer3(
    agentId: string,
    triggerMessage: ThreadMessage,
    threadHistory: ThreadMessage[],
  ): string {
    // Find the task reminder: look for routing metadata in thread history
    // Fall back to thread's first message if not determinable
    const taskReminder = threadHistory.length > 0
      ? threadHistory[0].content
      : triggerMessage.content;

    // Find the question: consecutive messages from the asking agent (the bot that isn't us)
    // The asking agent is the one whose routing signal targets us
    const botMessages = threadHistory.filter((m) => m.isBot);
    const lastBotMessage = botMessages[botMessages.length - 1];
    const askingAgentId = lastBotMessage.authorId;

    // Find consecutive messages from the asking agent at the end of bot messages
    const questionParts: string[] = [];
    for (let i = botMessages.length - 1; i >= 0; i--) {
      if (botMessages[i].authorId === askingAgentId) {
        questionParts.unshift(botMessages[i].content);
      } else {
        break;
      }
    }
    const question = questionParts.join("\n\n");

    // The answer is the trigger message (the response to the question)
    const answer = triggerMessage.content;

    const parts: string[] = [];

    // Extract ACTION directive from the routing message and promote it to the top
    const actionDirective = this.extractActionDirective(question);
    if (actionDirective) {
      parts.push(
        `## Task Directive\n\n` +
        `**⚠ The previous agent has assigned you a specific task. Perform this task — do NOT review or re-examine the input documents.**\n\n` +
        `**${actionDirective}**`,
      );
    }

    parts.push(`## Task Reminder\n\n${taskReminder}`);
    parts.push(`## Question\n\n${question}`);
    parts.push(`## Answer\n\n${answer}`);

    return parts.join("\n\n");
  }

  /**
   * Extracts an ACTION directive (e.g., "ACTION: Create TSPEC") from the routing message.
   * Returns the full ACTION line, or null if no directive is found.
   */
  extractActionDirective(routingMessage: string): string | null {
    const match = routingMessage.match(/^(ACTION:\s*.+)$/m);
    return match ? match[1].trim() : null;
  }

  private buildPatternCLayer3(
    agentId: string,
    threadHistory: ThreadMessage[],
    config: PtahConfig,
  ): string {
    // Collect all messages for context, counting only agent-posted embeds (bot messages)
    // Human messages are included but don't affect turn count
    const botTurns = threadHistory.filter((m) => m.isBot && m.authorId === agentId);
    const turnNumber = botTurns.length + 1; // Current turn

    // Collect prior turns and human context messages in order
    const contextParts: string[] = [];
    let currentTurnNumber = 0;

    for (const msg of threadHistory) {
      if (msg.isBot && msg.authorId === agentId) {
        currentTurnNumber++;
        contextParts.push(`## Turn ${currentTurnNumber}\n\n${msg.content}`);
      } else if (!msg.isBot) {
        contextParts.push(`## Human Feedback\n\n${msg.content}`);
      }
    }

    // Determine if final-review instruction should be injected
    // Inject at turn 3 only (not turn 4+)
    const maxTurns = config.orchestrator.max_turns_per_thread;
    const injectFinalReview = turnNumber === 3;

    const parts = [...contextParts];

    if (injectFinalReview) {
      parts.push(
        "## Final Review Instruction\n\nThis is your final review iteration. Ensure all feedback has been addressed and provide your final assessment.",
      );
    }

    return parts.join("\n\n");
  }

  private countTurns(
    agentId: string,
    threadHistory: ThreadMessage[],
    pattern: ResumePattern,
  ): number {
    if (pattern === "fresh") {
      return 1;
    }

    const botTurns = threadHistory.filter((m) => m.isBot && m.authorId === agentId);
    return botTurns.length + 1; // +1 for current turn
  }

  private async readFeatureFiles(
    featureName: string,
    config: PtahConfig,
  ): Promise<Array<{ name: string; content: string }>> {
    return this.readFeatureFilesFromBase(featureName, config.docs.root);
  }

  private async readFeatureFilesFromBase(
    featureName: string,
    docsRoot: string,
  ): Promise<Array<{ name: string; content: string }>> {
    const featureDir = this.fs.joinPath(docsRoot, featureName);

    try {
      const dirExists = await this.fs.exists(featureDir);
      if (!dirExists) {
        this.logger.warn(`Feature folder not found: ${featureDir}`);
        return [];
      }
    } catch {
      this.logger.warn(`Feature folder not found: ${featureDir}`);
      return [];
    }

    try {
      const entries = await this.fs.readDir(featureDir);
      const files: Array<{ name: string; content: string }> = [];

      for (const entry of entries) {
        // Skip overview.md — it's already in Layer 1
        if (entry === "overview.md") continue;

        const filePath = this.fs.joinPath(featureDir, entry);
        try {
          const content = await this.fs.readFile(filePath);
          files.push({ name: entry, content });
        } catch {
          // Skip unreadable files
        }
      }

      return files;
    } catch {
      this.logger.warn(`Failed to read feature folder: ${featureDir}`);
      return [];
    }
  }

  private assembleLayer2(
    files: Array<{ name: string; content: string }>,
    budget: number,
  ): string {
    if (files.length === 0) return "";

    // Sort by relevance (for now, sort alphabetically — least relevant last)
    // When truncating, remove from the end (least relevant)
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

    const parts: string[] = [];
    let totalTokens = 0;

    for (const file of sorted) {
      const fileContent = `### ${file.name}\n\n${file.content}`;
      const fileTokens = this.safeCount(fileContent);

      if (totalTokens + fileTokens > budget) {
        // Truncate from least-relevant files: stop adding
        break;
      }

      parts.push(fileContent);
      totalTokens += fileTokens;
    }

    return parts.join("\n\n");
  }

  private safeCount(text: string): number {
    try {
      return this.tokenCounter.count(text);
    } catch {
      this.logger.warn("TokenCounter.count() threw; falling back to char-based estimation");
      return Math.ceil(text.length / 4);
    }
  }
}
