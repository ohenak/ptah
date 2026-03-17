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
import { extractFeatureName as extractFeatureNameFromModule } from "./feature-branch.js";
import type { ContextDocumentSet, TaskType } from "./pdlc/phases.js";

export interface ContextAssembler {
  assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
    worktreePath?: string;  // Phase 4: read Layer 2 from worktree when provided
    routingMessage?: string; // The previous agent's response text when routing between agents
    contextDocuments?: ContextDocumentSet; // Phase 11: PDLC phase-aware document set
    taskType?: TaskType; // Issue #30: PDLC dispatch task type (Revise, Resubmit, etc.)
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
    routingMessage?: string;
    contextDocuments?: ContextDocumentSet;
    taskType?: TaskType;
  }): Promise<ContextBundle> {
    const { agentId, threadId, threadName, threadHistory, triggerMessage, config, worktreePath, routingMessage, contextDocuments, taskType } = params;

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
    let layer1 = this.buildLayer1(rolePrompt, overviewContent);

    // Issue #30: inject task type directive into Layer 1
    if (taskType === "Revise") {
      layer1 += `\n\n## REVISION TASK\n\n` +
        `**You are revising a document based on cross-review feedback.**\n\n` +
        `Your CROSS-REVIEW files are included in the feature files below. ` +
        `Read each finding carefully and address every HIGH and MEDIUM severity issue. ` +
        `Do NOT write a new cross-review. Do NOT review the document. ` +
        `Update the existing document to resolve the feedback, then commit your changes.`;
    } else if (taskType === "Resubmit") {
      layer1 += `\n\n## RESUBMIT TASK\n\n` +
        `**Your document was approved but a co-author's document was rejected, triggering a new review cycle.**\n\n` +
        `Re-read your document and confirm it is still correct. If no changes are needed, ` +
        `commit an empty update (touch the file) so the review cycle can proceed.`;
    }

    // Layer 3: use the routing message (previous agent's response) when available,
    // otherwise fall back to the trigger message. Never include thread history.
    // When routing between agents, the orchestrator passes the previous agent's
    // response text directly — this avoids relying on Discord embed parsing.
    const latestMessage = routingMessage ?? triggerMessage.content;
    let layer3: string;

    // Check for ACTION directive in the latest message
    const actionDirective = this.extractActionDirective(latestMessage);

    if (actionDirective) {
      // Inject into system prompt (Layer 1) — highest priority
      layer1 += `\n\n## ACTIVE TASK DIRECTIVE\n\n` +
        `**⚠ YOU HAVE BEEN ASSIGNED A SPECIFIC TASK. THIS OVERRIDES ALL OTHER CONSIDERATIONS.**\n\n` +
        `**${actionDirective}**\n\n` +
        `You MUST perform this task. Do NOT review documents. Do NOT summarize prior work. ` +
        `Do NOT write a CROSS-REVIEW file. Read the referenced input documents and CREATE the requested output.`;

      // Layer 3 = the routing message content (strip routing tags)
      layer3 = latestMessage.replace(/<routing>[\s\S]*?<\/routing>/g, "").trim();
      this.logger.info(`ACTION directive detected: "${actionDirective}" — using action-only context`);
    } else {
      // No ACTION directive — use the latest message as-is
      layer3 = latestMessage;
    }

    // Read Layer 2: feature folder files (excluding overview.md)
    // Phase 11: when contextDocuments is provided, read only specified documents
    let layer2Files: Array<{ name: string; content: string }>;
    if (contextDocuments) {
      layer2Files = await this.readContextDocuments(contextDocuments, docsRoot);
    } else {
      layer2Files = await this.readFeatureFilesFromBase(featureName, docsRoot);
    }

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
    return extractFeatureNameFromModule(threadName);
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

  /**
   * Extracts an ACTION directive (e.g., "ACTION: Create TSPEC") from the routing message.
   * Returns the full ACTION line, or null if no directive is found.
   */
  extractActionDirective(routingMessage: string): string | null {
    const match = routingMessage.match(/^(ACTION:\s*.+)$/m);
    return match ? match[1].trim() : null;
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

  private async readContextDocuments(
    contextDocs: ContextDocumentSet,
    docsRoot: string,
  ): Promise<Array<{ name: string; content: string }>> {
    const files: Array<{ name: string; content: string }> = [];
    for (const doc of contextDocs.documents) {
      // Skip overview — already in Layer 1
      if (doc.type === "overview") continue;
      // Skip glob patterns for cross-review (read all matching)
      if (doc.relativePath.includes("*")) continue;

      const filePath = this.fs.joinPath(docsRoot, doc.relativePath);
      try {
        const content = await this.fs.readFile(filePath);
        files.push({ name: this.fs.basename(filePath), content });
      } catch {
        if (doc.required) {
          this.logger.warn(`Required context document not found: ${filePath}`);
        }
      }
    }
    return files;
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
