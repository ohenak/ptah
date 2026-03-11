// src/orchestrator/question-poller.ts
import type { RegisteredQuestion } from "../types.js";

export interface QuestionPoller {
  /**
   * Add a question to the active poll set.
   * Auto-starts the polling interval if not already running.
   */
  registerQuestion(question: RegisteredQuestion): void;

  /**
   * Stop the polling interval and await any in-progress poll tick.
   * Must be called during Orchestrator shutdown.
   */
  stop(): Promise<void>;
}
