import { describe, it, expect } from "vitest";
import {
  parseRecommendation,
  skillNameToAgentId,
  crossReviewPath,
} from "../../../../src/orchestrator/pdlc/cross-review-parser.js";

describe("cross-review-parser", () => {
  // =========================================================================
  // Task 19: parseRecommendation() happy path
  // =========================================================================
  describe("parseRecommendation() happy path", () => {
    it("parses markdown heading with value on next line", () => {
      const content = "## Recommendation\n\nApproved";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses bold recommendation with inline value", () => {
      const content = "**Recommendation:** Approved with minor changes";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses table row recommendation", () => {
      const content = "| **Recommendation** | Needs revision |";
      expect(parseRecommendation(content)).toEqual({ status: "revision_requested" });
    });

    it("handles case insensitive values — APPROVED", () => {
      const content = "## Recommendation\n\nAPPROVED";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("handles case insensitive values — approved", () => {
      const content = "## Recommendation\n\napproved";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("handles case insensitive values — Approved with trailing space", () => {
      const content = "## Recommendation\n\nApproved ";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("handles trailing period", () => {
      const content = "## Recommendation\n\nApproved.";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("handles extra text after approved with minor changes", () => {
      const content = "**Recommendation:** Approved with minor changes — see F-01";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses needs revision from heading with colon", () => {
      const content = "### Recommendation: Needs revision";
      expect(parseRecommendation(content)).toEqual({ status: "revision_requested" });
    });

    it("parses h1 heading", () => {
      const content = "# Recommendation\n\nApproved";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses h6 heading", () => {
      const content = "###### Recommendation\n\nApproved";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses recommendation surrounded by other content", () => {
      const content = [
        "# Cross Review",
        "",
        "Some preamble text here.",
        "",
        "## Recommendation",
        "",
        "Approved",
        "",
        "## Details",
        "",
        "Everything looks good.",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses table row with non-bold Recommendation", () => {
      const content = "| Recommendation | Approved |";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("parses 'approved with minor changes' as approved (longer match first)", () => {
      const content = "## Recommendation\n\napproved with minor changes";
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });
  });

  // =========================================================================
  // Task 20: parseRecommendation() edge cases
  // =========================================================================
  describe("parseRecommendation() edge cases", () => {
    it("ignores Recommendation inside fenced code block (backticks)", () => {
      const content = [
        "```",
        "## Recommendation",
        "Approved",
        "```",
        "",
        "## Recommendation",
        "",
        "Needs revision",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({ status: "revision_requested" });
    });

    it("ignores Recommendation inside fenced code block (tildes)", () => {
      const content = [
        "~~~",
        "## Recommendation",
        "Approved",
        "~~~",
        "",
        "## Recommendation",
        "",
        "Approved",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({ status: "approved" });
    });

    it("returns parse_error for multiple Recommendation headings", () => {
      const content = [
        "## Recommendation",
        "",
        "Approved",
        "",
        "## Recommendation",
        "",
        "Needs revision",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({
        status: "parse_error",
        reason: "Multiple Recommendation headings found",
      });
    });

    it("returns parse_error for no Recommendation heading", () => {
      const content = "## Summary\n\nEverything looks good.";
      expect(parseRecommendation(content)).toEqual({
        status: "parse_error",
        reason: "No Recommendation heading found",
      });
    });

    it("returns parse_error with rawValue for unrecognized value", () => {
      const content = "## Recommendation\n\nLooks good";
      expect(parseRecommendation(content)).toEqual({
        status: "parse_error",
        reason: "Unrecognized recommendation",
        rawValue: "Looks good",
      });
    });

    it("returns parse_error for empty file", () => {
      expect(parseRecommendation("")).toEqual({
        status: "parse_error",
        reason: "No Recommendation heading found",
      });
    });

    it("returns parse_error when only code blocks contain Recommendation", () => {
      const content = [
        "# Review Notes",
        "",
        "```markdown",
        "## Recommendation",
        "Approved",
        "```",
        "",
        "That's all.",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({
        status: "parse_error",
        reason: "No Recommendation heading found",
      });
    });

    it("handles indented code fence toggle", () => {
      const content = [
        "  ```",
        "## Recommendation",
        "Approved",
        "  ```",
        "",
        "## Recommendation",
        "",
        "Needs revision",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({ status: "revision_requested" });
    });

    it("returns parse_error for Recommendation heading with no value after it", () => {
      const content = "## Recommendation";
      expect(parseRecommendation(content)).toEqual({
        status: "parse_error",
        reason: "No Recommendation heading found",
      });
    });

    it("handles nested code blocks correctly", () => {
      const content = [
        "```",
        "## Recommendation: Approved",
        "```",
        "",
        "```",
        "Some other code",
        "```",
        "",
        "## Recommendation",
        "",
        "Needs revision",
      ].join("\n");
      expect(parseRecommendation(content)).toEqual({ status: "revision_requested" });
    });
  });

  // =========================================================================
  // Task 21: skillNameToAgentId()
  // =========================================================================
  describe("skillNameToAgentId()", () => {
    it("maps backend-engineer to eng", () => {
      expect(skillNameToAgentId("backend-engineer")).toBe("eng");
    });

    it("maps frontend-engineer to fe", () => {
      expect(skillNameToAgentId("frontend-engineer")).toBe("fe");
    });

    it("maps product-manager to pm", () => {
      expect(skillNameToAgentId("product-manager")).toBe("pm");
    });

    it("maps test-engineer to qa", () => {
      expect(skillNameToAgentId("test-engineer")).toBe("qa");
    });

    it("returns null for unknown skill", () => {
      expect(skillNameToAgentId("unknown-skill")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(skillNameToAgentId("")).toBeNull();
    });
  });

  // =========================================================================
  // Task 21: crossReviewPath()
  // =========================================================================
  describe("crossReviewPath()", () => {
    it("returns correct path for typical inputs", () => {
      expect(crossReviewPath("my-feature", "backend-engineer", "FSPEC")).toBe(
        "docs/my-feature/CROSS-REVIEW-backend-engineer-FSPEC.md",
      );
    });

    it("returns correct path for different skill and document type", () => {
      expect(crossReviewPath("auth-flow", "test-engineer", "TSPEC")).toBe(
        "docs/auth-flow/CROSS-REVIEW-test-engineer-TSPEC.md",
      );
    });

    it("returns correct path for REQ document type", () => {
      expect(crossReviewPath("login", "product-manager", "REQ")).toBe(
        "docs/login/CROSS-REVIEW-product-manager-REQ.md",
      );
    });
  });
});
