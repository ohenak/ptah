import { describe, it, expect } from "vitest";
import { CharTokenCounter } from "../../../src/orchestrator/token-counter.js";

describe("CharTokenCounter", () => {
  describe("count()", () => {
    // Task 29: returns Math.ceil(text.length / 4) for typical text
    it("returns Math.ceil(text.length / 4) for typical text", () => {
      const counter = new CharTokenCounter();

      // 13 chars → ceil(13/4) = 4
      expect(counter.count("Hello, world!")).toBe(4);

      // 26 chars → ceil(26/4) = 7
      expect(counter.count("abcdefghijklmnopqrstuvwxyz")).toBe(7);

      // 5 chars → ceil(5/4) = 2
      expect(counter.count("short")).toBe(2);
    });

    // Task 30: edge cases
    it("returns 0 for empty string", () => {
      const counter = new CharTokenCounter();
      expect(counter.count("")).toBe(0);
    });

    it("returns 1 for single character", () => {
      const counter = new CharTokenCounter();
      expect(counter.count("a")).toBe(1);
    });

    it("returns correct value at exact multiples of 4", () => {
      const counter = new CharTokenCounter();

      // 4 chars → ceil(4/4) = 1
      expect(counter.count("abcd")).toBe(1);

      // 8 chars → ceil(8/4) = 2
      expect(counter.count("abcdefgh")).toBe(2);

      // 12 chars → ceil(12/4) = 3
      expect(counter.count("abcdefghijkl")).toBe(3);
    });
  });
});
