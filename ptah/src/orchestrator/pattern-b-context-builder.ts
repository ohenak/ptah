// src/orchestrator/pattern-b-context-builder.ts

import type { PendingQuestion, PtahConfig, ContextBundle, ThreadMessage } from "../types.js";
import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";
import type { TokenCounter } from "./token-counter.js";

export interface PatternBContextBuilder {
  /**
   * Assemble a Pattern B ContextBundle.
   * Layer 1: agent role prompt + overview.md (from worktree)
   * Layer 2: feature docs read FRESH from worktree (mandatory re-read per RPB-R3)
   * Layer 3: pause summary + question verbatim + user answer verbatim (no thread history)
   * Returns a ContextBundle with resumePattern: "pattern_b"
   */
  build(params: {
    question: PendingQuestion;
    worktreePath: string;
    config: PtahConfig;
    threadHistory: ThreadMessage[];  // used only for pause summary derivation
  }): Promise<ContextBundle>;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants (shared with DefaultContextAssembler)
// ────────────────────────────────────────────────────────────────────────────

const TWO_ITERATION_RULE =
  "You have a maximum of 2 iterations to complete your task. Make each iteration count.";

const ROUTING_INSTRUCTION =
  "When you need to hand off work to another agent, include a <routing> tag in your response specifying the target agent and reason.";

// ────────────────────────────────────────────────────────────────────────────
// DefaultPatternBContextBuilder
// ────────────────────────────────────────────────────────────────────────────

export class DefaultPatternBContextBuilder implements PatternBContextBuilder {
  constructor(
    private readonly fs: FileSystem,
    private readonly tokenCounter: TokenCounter,
    private readonly logger: Logger,
  ) {}

  async build(params: {
    question: PendingQuestion;
    worktreePath: string;
    config: PtahConfig;
    threadHistory: ThreadMessage[];
  }): Promise<ContextBundle> {
    const { question, worktreePath, config, threadHistory } = params;

    // 1. Extract feature name from thread name
    const featureName = this.extractFeatureName(question.threadName);

    // 2. Resolve docsRoot in the worktree
    // config.docs.root is relative to ptah/ (e.g. "../docs"), but worktreePath is the
    // repo root, so strip leading "../" segments to get the repo-relative path.
    const docsRoot = this.fs.joinPath(worktreePath, config.docs.root.replace(/^(?:\.\.\/)+/, ""));

    // 3. Build Layer 1: role prompt + overview.md + constants
    const layer1 = await this.buildLayer1(question.agentId, featureName, docsRoot, config);

    // 4. Build Layer 3 BEFORE Layer 2 (needed for token budget calculation)
    const layer3 = this.buildLayer3(question, threadHistory);

    // 5. Calculate token counts for Layer 1 and Layer 3
    const layer1Tokens = this.safeCount(layer1);
    const layer3Tokens = this.safeCount(layer3);

    // 6. Token budget check: if L1+L3 > 85% of max_tokens, omit Layer 2
    const maxTokens = config.agents.max_tokens;
    const budgetThreshold = maxTokens * 0.85;

    let layer2Content = "";
    let layer2Tokens = 0;

    if (layer1Tokens + layer3Tokens > budgetThreshold) {
      this.logger.warn(
        "Layer 1 + Layer 3 exceed 85% of token budget; omitting Layer 2 entirely",
      );
    } else {
      // 5b. Build Layer 2: feature files from worktree (exclude overview.md)
      const featureFiles = await this.readFeatureFiles(featureName, docsRoot);
      if (featureFiles.length > 0) {
        // Apply layer2 token budget
        const layer2Budget = config.orchestrator.token_budget
          ? Math.floor(maxTokens * (config.orchestrator.token_budget.layer2_pct / 100))
          : Math.floor(maxTokens * 0.35);
        layer2Content = this.assembleLayer2(featureFiles, layer2Budget);
        layer2Tokens = this.safeCount(layer2Content);
      }
    }

    // 7. Assemble systemPrompt = Layer 1 + (optional Layer 2)
    const systemPrompt = layer2Content
      ? `${layer1}\n\n## Feature Files\n\n${layer2Content}`
      : layer1;

    return {
      systemPrompt,
      userMessage: layer3,
      agentId: question.agentId,
      threadId: question.threadId,
      featureName,
      resumePattern: "pattern_b",
      turnNumber: 1,
      tokenCounts: {
        layer1: layer1Tokens,
        layer2: layer2Tokens,
        layer3: layer3Tokens,
        total: layer1Tokens + layer2Tokens + layer3Tokens,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private extractFeatureName(threadName: string): string {
    const emDashIndex = threadName.indexOf(" \u2014 ");
    if (emDashIndex !== -1) {
      return threadName.substring(0, emDashIndex);
    }
    return threadName;
  }

  private async buildLayer1(
    agentId: string,
    featureName: string,
    docsRoot: string,
    config: PtahConfig,
  ): Promise<string> {
    // Read role prompt (throws if not configured or not readable)
    const skillPath = config.agents.skills[agentId];
    if (!skillPath) {
      throw new Error(`No skill path configured for agent: ${agentId}`);
    }
    let rolePrompt: string;
    try {
      rolePrompt = await this.fs.readFile(skillPath);
    } catch {
      throw new Error(`Missing role prompt for agent ${agentId}: ${skillPath}`);
    }

    // Read overview.md — warn and continue if absent
    const overviewPath = this.fs.joinPath(docsRoot, featureName, "overview.md");
    let overviewContent: string | null = null;
    try {
      overviewContent = await this.fs.readFile(overviewPath);
    } catch {
      this.logger.warn(`overview.md not found for feature: ${featureName}`);
    }

    // Assemble Layer 1
    const parts: string[] = [rolePrompt];
    if (overviewContent) {
      parts.push(`## Overview\n\n${overviewContent}`);
    }
    parts.push(TWO_ITERATION_RULE);
    parts.push(ROUTING_INSTRUCTION);

    return parts.join("\n\n");
  }

  private buildLayer3(question: PendingQuestion, threadHistory: ThreadMessage[]): string {
    // Derive pause summary from last bot message in thread history
    const botMessages = threadHistory
      .filter((m) => m.isBot)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const lastBotMessage = botMessages.length > 0 ? botMessages[botMessages.length - 1] : null;

    const pauseSummary = lastBotMessage
      ? `You were working on: ${lastBotMessage.content}. You asked the user a question and paused.`
      : `You were working on: ${question.threadName}. You asked the user a question and paused.`;

    return [
      `## Pause Summary\n\n${pauseSummary}`,
      `## Question\n\n${question.questionText}`,
      `## User Answer\n\n${question.answer}`,
    ].join("\n\n");
  }

  private async readFeatureFiles(
    featureName: string,
    docsRoot: string,
  ): Promise<Array<{ name: string; content: string }>> {
    const featureDir = this.fs.joinPath(docsRoot, featureName);

    const dirExists = await this.fs.exists(featureDir);
    if (!dirExists) {
      this.logger.warn(`Feature folder not found: ${featureDir}`);
      return [];
    }

    try {
      const entries = await this.fs.readDir(featureDir);
      const files: Array<{ name: string; content: string }> = [];

      for (const entry of entries) {
        // Skip overview.md — already in Layer 1
        if (entry === "overview.md") continue;

        const filePath = this.fs.joinPath(featureDir, entry);
        try {
          const content = await this.fs.readFile(filePath);
          files.push({ name: entry, content });
        } catch {
          // Skip unreadable files silently
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

    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    const parts: string[] = [];
    let totalTokens = 0;

    for (const file of sorted) {
      const fileContent = `### ${file.name}\n\n${file.content}`;
      const fileTokens = this.safeCount(fileContent);

      if (totalTokens + fileTokens > budget) {
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
