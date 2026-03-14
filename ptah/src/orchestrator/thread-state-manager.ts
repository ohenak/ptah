import type { ThreadStatus, ThreadMessage, ThreadStateEntry } from "../types.js";

export interface ThreadStateManager {
  checkAndIncrementTurn(threadId: string, maxTurns: number): "allowed" | "limit-reached";
  closeThread(threadId: string): void;
  registerReviewThread(threadId: string, parentThreadId: string): void;
  isReviewThread(threadId: string): boolean;
  checkAndIncrementReviewTurn(threadId: string): "allowed" | "stalled";
  stallReviewThread(threadId: string): void;
  getParentThreadId(threadId: string): string | undefined;
  getStatus(threadId: string): ThreadStatus;
  openThreadIds(): string[];
  reconstructTurnCount(threadId: string, messages: ThreadMessage[], isReview: boolean): void;
}

// Fixed review thread turn limit
const REVIEW_TURN_LIMIT = 4;

// Emoji prefixes that indicate system messages (not user turns)
// NOTE: This heuristic checks for specific Unicode emoji prefixes (⏸, 🔒, 🚨, ⛔).
// This is a deliberate design decision: rather than storing turn counts in the DB,
// we reconstruct them from message history on restart. The limitation is that
// legitimate human messages starting with these emojis will be undercounted.
// This is acceptable because such edge cases are extremely rare in practice.
const SYSTEM_EMOJI_PREFIXES = ["\u23F8", "\uD83D\uDD12", "\uD83D\uDEA8", "\u26D4"];

function isSystemMessage(content: string): boolean {
  return SYSTEM_EMOJI_PREFIXES.some(prefix => content.startsWith(prefix));
}

export class InMemoryThreadStateManager implements ThreadStateManager {
  private threads = new Map<string, ThreadStateEntry>();

  private getOrCreate(threadId: string): ThreadStateEntry {
    if (!this.threads.has(threadId)) {
      this.threads.set(threadId, {
        status: "open",
        turnCount: 0,
        isReviewThread: false,
        reviewTurnCount: 0,
      });
    }
    return this.threads.get(threadId)!;
  }

  checkAndIncrementTurn(threadId: string, maxTurns: number): "allowed" | "limit-reached" {
    const entry = this.getOrCreate(threadId);
    if (entry.status === "closed" || entry.status === "stalled") {
      return "limit-reached";
    }
    if (entry.turnCount >= maxTurns) {
      return "limit-reached";
    }
    entry.turnCount++;
    return "allowed";
  }

  closeThread(threadId: string): void {
    const entry = this.getOrCreate(threadId);
    entry.status = "closed";
  }

  registerReviewThread(threadId: string, parentThreadId: string): void {
    const entry = this.getOrCreate(threadId);
    entry.isReviewThread = true;
    entry.parentThreadId = parentThreadId;
  }

  isReviewThread(threadId: string): boolean {
    const entry = this.threads.get(threadId);
    return entry?.isReviewThread ?? false;
  }

  checkAndIncrementReviewTurn(threadId: string): "allowed" | "stalled" {
    const entry = this.getOrCreate(threadId);
    if (entry.status === "stalled") {
      return "stalled";
    }
    if (entry.reviewTurnCount >= REVIEW_TURN_LIMIT) {
      return "stalled";
    }
    entry.reviewTurnCount++;
    return "allowed";
  }

  stallReviewThread(threadId: string): void {
    const entry = this.getOrCreate(threadId);
    entry.status = "stalled";
  }

  getParentThreadId(threadId: string): string | undefined {
    return this.threads.get(threadId)?.parentThreadId;
  }

  getStatus(threadId: string): ThreadStatus {
    return this.threads.get(threadId)?.status ?? "open";
  }

  openThreadIds(): string[] {
    const result: string[] = [];
    for (const [id, entry] of this.threads) {
      if (entry.status === "open") {
        result.push(id);
      }
    }
    return result;
  }

  reconstructTurnCount(threadId: string, messages: ThreadMessage[], isReview: boolean): void {
    const entry = this.getOrCreate(threadId);
    const count = messages.filter(m => !m.isBot && !isSystemMessage(m.content)).length;
    if (isReview) {
      entry.reviewTurnCount = count;
    } else {
      entry.turnCount = count;
    }
  }
}
