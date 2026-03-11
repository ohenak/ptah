// src/orchestrator/question-store.ts
import type { PendingQuestion } from "../types.js";

export interface QuestionStore {
  /**
   * Atomically assign a Q-NNNN ID, write the entry to pending.md, and commit.
   * Scans both pending.md and resolved.md inside a single MergeLock acquisition to prevent duplicate IDs.
   * Returns the complete PendingQuestion with id populated.
   * Commit message: "[ptah] System: add question {id} from {agentId}"
   */
  appendQuestion(question: Omit<PendingQuestion, "id">): Promise<PendingQuestion>;

  /**
   * Write the Discord message ID into the matching question block in pending.md.
   * No-op if questionId not found.
   * Commit message: "[ptah] System: update {questionId} notification"
   */
  updateDiscordMessageId(questionId: string, messageId: string): Promise<void>;

  /**
   * Read and parse all question entries from pending.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   */
  readPendingQuestions(): Promise<PendingQuestion[]>;

  /**
   * Read and parse all question entries from resolved.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   * Used on startup to seed the discordMessageIdMap.
   */
  readResolvedQuestions(): Promise<PendingQuestion[]>;

  /**
   * Find a single question in pending.md by ID.
   * Returns null if not found.
   */
  getQuestion(questionId: string): Promise<PendingQuestion | null>;

  /**
   * Write the user's answer into the Answer section of the question entry in pending.md.
   * Commit message: "[ptah] System: answer {questionId} via Discord"
   */
  setAnswer(questionId: string, answer: string): Promise<void>;

  /**
   * Remove the question from pending.md and append it (with Answered timestamp) to resolved.md.
   * Both files written in a single merge-locked git commit.
   * Commit message: "[ptah] System: resolve {questionId}"
   * Creates resolved.md with standard header if absent.
   */
  archiveQuestion(questionId: string, resolvedAt: Date): Promise<void>;
}
