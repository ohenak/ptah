import { describe, it, expect } from "vitest";
import { countPriorAgentTurns, parseKeywords, evaluateAgeGuard } from "../../../../src/orchestrator/orchestrator.js";
import type { ThreadMessage } from "../../../../src/types.js";
import { createThreadMessage, createBotMessageWithRouting, FakeLogger } from "../../../fixtures/factories.js";

describe("countPriorAgentTurns", () => {
  it("UT-CAT-01: returns 0 for empty history", () => {
    expect(countPriorAgentTurns([])).toBe(0);
  });

  it("UT-CAT-02: returns 0 for user-only messages", () => {
    const history = [
      createThreadMessage({ isBot: false, content: "@pm create REQ" }),
      createThreadMessage({ isBot: false, content: "another user msg" }),
    ];
    expect(countPriorAgentTurns(history)).toBe(0);
  });

  it("UT-CAT-03: counts bot message with <routing> tag", () => {
    const history = [
      createThreadMessage({ isBot: true, content: 'Response text\n<routing>{"type":"LGTM"}</routing>' }),
    ];
    expect(countPriorAgentTurns(history)).toBe(1);
  });

  it("UT-CAT-04: excludes bot messages that lack <routing> tag", () => {
    const history = [
      createThreadMessage({ isBot: true, content: "Progress: assembling context..." }),
      createThreadMessage({ isBot: false, content: "@pm create REQ" }),
    ];
    expect(countPriorAgentTurns(history)).toBe(0);
  });

  it("UT-CAT-05: mixed history — counts only bot messages with routing", () => {
    const history = [
      createThreadMessage({ isBot: false, content: "@pm create REQ" }),
      createThreadMessage({ isBot: true, content: 'Response\n<routing>{"type":"LGTM"}</routing>' }),
      createThreadMessage({ isBot: true, content: "Progress update" }),
      createThreadMessage({ isBot: false, content: "user reply" }),
      createThreadMessage({ isBot: true, content: '<routing>{"type":"ROUTE_TO_AGENT","agent_id":"eng"}</routing>' }),
    ];
    expect(countPriorAgentTurns(history)).toBe(2);
  });

  it("UT-CAT-06: multiple routing messages all counted", () => {
    const history = [
      createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
      createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
      createThreadMessage({ isBot: true, content: '<routing>{"type":"LGTM"}</routing>' }),
    ];
    expect(countPriorAgentTurns(history)).toBe(3);
  });
});

describe("parseKeywords", () => {
  it("UT-KW-01: returns defaults for null", () => {
    expect(parseKeywords(null)).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-02: returns defaults for undefined", () => {
    expect(parseKeywords(undefined)).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-03: returns defaults for empty string", () => {
    expect(parseKeywords("")).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-04: recognizes [backend-only]", () => {
    expect(parseKeywords("[backend-only]")).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-05: recognizes [frontend-only]", () => {
    expect(parseKeywords("[frontend-only]")).toEqual({ discipline: "frontend-only", skipFspec: false });
  });

  it("UT-KW-06: recognizes [fullstack]", () => {
    expect(parseKeywords("[fullstack]")).toEqual({ discipline: "fullstack", skipFspec: false });
  });

  it("UT-KW-07: recognizes [skip-fspec]", () => {
    expect(parseKeywords("[skip-fspec]")).toEqual({ discipline: "backend-only", skipFspec: true });
  });

  it("UT-KW-08: ignores [FULLSTACK] — case-sensitive", () => {
    expect(parseKeywords("[FULLSTACK]")).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-09: ignores [ fullstack ] — spaces inside brackets", () => {
    expect(parseKeywords("[ fullstack ]")).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-10: last discipline keyword wins", () => {
    expect(parseKeywords("@pm create REQ [backend-only] [fullstack]"))
      .toEqual({ discipline: "fullstack", skipFspec: false });
  });

  it("UT-KW-11: ignores unknown token", () => {
    expect(parseKeywords("[foobar]")).toEqual({ discipline: "backend-only", skipFspec: false });
  });

  it("UT-KW-12: duplicate [skip-fspec] is idempotent", () => {
    expect(parseKeywords("[backend-only] [skip-fspec] [skip-fspec]"))
      .toEqual({ discipline: "backend-only", skipFspec: true });
  });
});

describe("evaluateAgeGuard", () => {
  it("UT-AG-01: 0 turns → eligible", () => {
    const logger = new FakeLogger();
    expect(evaluateAgeGuard([], logger)).toEqual({ eligible: true });
  });

  it("UT-AG-02: 1 turn (boundary) → eligible", () => {
    const logger = new FakeLogger();
    const history = [createBotMessageWithRouting()];
    expect(evaluateAgeGuard(history, logger)).toEqual({ eligible: true });
  });

  it("UT-AG-03: 2 turns (boundary) → not eligible", () => {
    const logger = new FakeLogger();
    const history = [createBotMessageWithRouting(), createBotMessageWithRouting()];
    expect(evaluateAgeGuard(history, logger)).toEqual({ eligible: false, turnCount: 2 });
  });

  it("UT-AG-04: 5 turns → not eligible", () => {
    const logger = new FakeLogger();
    const history = Array.from({ length: 5 }, () => createBotMessageWithRouting());
    expect(evaluateAgeGuard(history, logger)).toEqual({ eligible: false, turnCount: 5 });
  });

  it("UT-AG-05: empty array → eligible", () => {
    const logger = new FakeLogger();
    expect(evaluateAgeGuard([], logger)).toEqual({ eligible: true });
  });

  it("UT-AG-06: malformed history — fail-open and warn", () => {
    const logger = new FakeLogger();
    const result = evaluateAgeGuard(null as unknown as ThreadMessage[], logger);
    expect(result).toEqual({ eligible: true });
    expect(logger.messages.some(m => m.level === "warn" && m.message.includes("failing open"))).toBe(true);
  });
});
