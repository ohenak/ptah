// tests/unit/orchestrator/question-poller.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DefaultQuestionPoller } from "../../../src/orchestrator/question-poller.js";
import {
  FakeQuestionStore,
  FakeLogger,
  createPendingQuestion,
} from "../../fixtures/factories.js";
import type { PendingQuestion } from "../../../src/types.js";

describe("DefaultQuestionPoller", () => {
  let store: FakeQuestionStore;
  let logger: FakeLogger;

  beforeEach(() => {
    store = new FakeQuestionStore();
    logger = new FakeLogger();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Task 27 — registerQuestion auto-starts interval on first call; subsequent calls don't restart

  it("auto-starts polling interval on first registerQuestion call", async () => {
    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);

    expect(poller.isRunning()).toBe(false);
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });
    expect(poller.isRunning()).toBe(true);

    await poller.stop();
  });

  it("does not restart interval on subsequent registerQuestion calls", async () => {
    const q1 = createPendingQuestion({ id: "Q-0001", answer: null });
    const q2 = createPendingQuestion({ id: "Q-0002", answer: null });
    store.seedQuestion(q1);
    store.seedQuestion(q2);

    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);

    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });
    const handleBefore = poller.isRunning();
    poller.registerQuestion({ questionId: "Q-0002", agentId: "pm", threadId: "t-2" });
    const handleAfter = poller.isRunning();

    expect(handleBefore).toBe(true);
    expect(handleAfter).toBe(true);
    expect(poller.registeredCount()).toBe(2);

    await poller.stop();
  });

  // Task 28 — Poll tick fires onAnswer for answered questions; unanswered remain registered

  it("fires onAnswer callback for questions with non-null answer", async () => {
    const answeredQ = createPendingQuestion({ id: "Q-0001", answer: "Yes" });
    const unansweredQ = createPendingQuestion({ id: "Q-0002", answer: null });
    store.seedQuestion(answeredQ);
    store.seedQuestion(unansweredQ);

    const received: PendingQuestion[] = [];
    const poller = new DefaultQuestionPoller(
      store,
      async (q) => {
        received.push(q);
      },
      1000,
      logger,
    );
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });
    poller.registerQuestion({ questionId: "Q-0002", agentId: "pm", threadId: "t-2" });

    // Advance exactly one interval tick and flush microtasks
    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("Q-0001");
    // Q-0002 still registered
    expect(poller.registeredCount()).toBe(1);

    await poller.stop();
  });

  it("does not fire onAnswer for questions not in the registered set", async () => {
    // seed a question that IS answered, but NOT registered with the poller
    const unregisteredQ = createPendingQuestion({ id: "Q-0099", answer: "Yes" });
    store.seedQuestion(unregisteredQ);

    const received: PendingQuestion[] = [];
    const registeredQ = createPendingQuestion({ id: "Q-0001", answer: null });
    store.seedQuestion(registeredQ);

    const poller = new DefaultQuestionPoller(
      store,
      async (q) => {
        received.push(q);
      },
      1000,
      logger,
    );
    // Only register Q-0001, not Q-0099
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });

    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toHaveLength(0);

    await poller.stop();
  });

  // Task 29 — Self-stop when registered becomes empty after last onAnswer

  it("clears interval when last question is answered and registered set becomes empty", async () => {
    const q = createPendingQuestion({ id: "Q-0001", answer: "Yes" });
    store.seedQuestion(q);

    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    poller.registerQuestion({ questionId: q.id, agentId: "pm", threadId: "t-1" });

    expect(poller.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(poller.isRunning()).toBe(false);
    expect(poller.registeredCount()).toBe(0);
  });

  it("keeps interval running when some questions remain unanswered", async () => {
    const answeredQ = createPendingQuestion({ id: "Q-0001", answer: "Yes" });
    const unansweredQ = createPendingQuestion({ id: "Q-0002", answer: null });
    store.seedQuestion(answeredQ);
    store.seedQuestion(unansweredQ);

    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });
    poller.registerQuestion({ questionId: "Q-0002", agentId: "pm", threadId: "t-2" });

    await vi.advanceTimersByTimeAsync(1000);

    // Q-0001 was answered; Q-0002 remains — interval should still be running
    expect(poller.isRunning()).toBe(true);

    await poller.stop();
  });

  // Task 30 — stop() clears interval immediately; awaits in-progress tick

  it("stop() clears interval and resolves after in-progress tick completes", async () => {
    const q = createPendingQuestion({ id: "Q-0001", answer: null });
    store.seedQuestion(q);

    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });

    expect(poller.isRunning()).toBe(true);

    await poller.stop();

    expect(poller.isRunning()).toBe(false);
  });

  it("stop() is idempotent when called multiple times", async () => {
    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });

    await poller.stop();
    await poller.stop(); // should not throw

    expect(poller.isRunning()).toBe(false);
  });

  it("stop() resolves immediately when poller was never started", async () => {
    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    // No registerQuestion called — intervalHandle is null

    await expect(poller.stop()).resolves.toBeUndefined();
    expect(poller.isRunning()).toBe(false);
  });

  // Task 31 — Malformed data / store error — warns and continues polling

  it("logs warning and continues when readPendingQuestions throws", async () => {
    store.readError = new Error("disk error");

    const poller = new DefaultQuestionPoller(store, async () => {}, 1000, logger);
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });

    await vi.advanceTimersByTimeAsync(1000);

    expect(
      logger.messages.some(
        (m) => m.level === "warn" && m.message.includes("disk error"),
      ),
    ).toBe(true);
    // poller continues — interval still running because registered is not empty
    expect(poller.isRunning()).toBe(true);

    await poller.stop();
  });

  it("logs warning and continues when onAnswer callback throws", async () => {
    const q = createPendingQuestion({ id: "Q-0001", answer: "Yes" });
    store.seedQuestion(q);

    const poller = new DefaultQuestionPoller(
      store,
      async () => {
        throw new Error("callback error");
      },
      1000,
      logger,
    );
    poller.registerQuestion({ questionId: "Q-0001", agentId: "pm", threadId: "t-1" });

    await vi.advanceTimersByTimeAsync(1000);

    expect(
      logger.messages.some(
        (m) => m.level === "warn" && m.message.includes("callback error"),
      ),
    ).toBe(true);
  });
});
