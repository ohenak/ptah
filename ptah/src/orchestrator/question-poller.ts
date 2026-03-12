// src/orchestrator/question-poller.ts
import type { RegisteredQuestion, PendingQuestion } from "../types.js";
import type { QuestionStore } from "./question-store.js";
import type { Logger } from "../services/logger.js";

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

// ---------------------------------------------------------------------------
// DefaultQuestionPoller
// ---------------------------------------------------------------------------

export class DefaultQuestionPoller implements QuestionPoller {
  private registered = new Map<string, RegisteredQuestion>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private activeTick: Promise<void> | null = null;

  constructor(
    private store: QuestionStore,
    private onAnswer: (question: PendingQuestion) => Promise<void>,
    private intervalMs: number,
    private logger: Logger,
  ) {}

  registerQuestion(question: RegisteredQuestion): void {
    this.registered.set(question.questionId, question);
    if (this.intervalHandle === null) {
      this.intervalHandle = setInterval(() => this.tick(), this.intervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.activeTick !== null) {
      await this.activeTick;
    }
  }

  private tick(): void {
    const p = this.doTick().catch((err) => {
      this.logger.warn(
        `QuestionPoller: unexpected tick error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.activeTick = p;
    p.finally(() => {
      if (this.activeTick === p) this.activeTick = null;
    });
  }

  private async doTick(): Promise<void> {
    if (this.registered.size === 0) {
      // Self-stop when no questions remain
      if (this.intervalHandle !== null) {
        clearInterval(this.intervalHandle);
        this.intervalHandle = null;
      }
      return;
    }

    let questions: PendingQuestion[];
    try {
      questions = await this.store.readPendingQuestions();
    } catch (err) {
      this.logger.warn(
        `QuestionPoller: failed to read pending questions: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const answered = questions.filter(
      (q) => this.registered.has(q.id) && q.answer !== null,
    );

    for (const q of answered) {
      this.registered.delete(q.id);
      try {
        await this.onAnswer(q);
      } catch (err) {
        this.logger.warn(
          `QuestionPoller: onAnswer failed for ${q.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Self-stop if all registered questions have now been answered
    if (this.registered.size === 0 && this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // Test-visible helpers
  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  registeredCount(): number {
    return this.registered.size;
  }
}
