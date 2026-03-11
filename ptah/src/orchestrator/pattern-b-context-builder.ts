// src/orchestrator/pattern-b-context-builder.ts
import type { PendingQuestion, PtahConfig, ContextBundle, ThreadMessage } from "../types.js";

export interface PatternBContextBuilder {
  /**
   * Assemble a Pattern B ContextBundle.
   * Layer 1: agent role prompt + overview.md (from worktree)
   * Layer 2: feature docs read FRESH from worktree (mandatory re-read)
   * Layer 3: pause summary + question verbatim + user answer verbatim (no thread history)
   * Returns a ContextBundle with resumePattern: "pattern_b"
   */
  build(params: {
    question: PendingQuestion;
    worktreePath: string;
    config: PtahConfig;
    threadHistory: ThreadMessage[];
  }): Promise<ContextBundle>;
}
