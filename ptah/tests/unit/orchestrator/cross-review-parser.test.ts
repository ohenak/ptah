/**
 * Unit tests for the cross-review-parser module.
 *
 * E3: crossReviewPath now accepts featurePath instead of featureSlug.
 */

import { describe, it, expect } from "vitest";
import { crossReviewPath, parseRecommendation, agentIdToSkillName, skillNameToAgentId } from "../../../src/orchestrator/pdlc/cross-review-parser.js";

// ---------------------------------------------------------------------------
// E3: crossReviewPath — accepts featurePath instead of featureSlug
// ---------------------------------------------------------------------------

describe("crossReviewPath", () => {
  it("constructs cross-review path using featurePath for in-progress feature", () => {
    const result = crossReviewPath(
      "docs/in-progress/my-feature/",
      "engineer",
      "REQ",
    );
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ.md");
  });

  it("constructs cross-review path using featurePath for backlog feature", () => {
    const result = crossReviewPath(
      "docs/backlog/my-feature/",
      "product-manager",
      "FSPEC",
    );
    expect(result).toBe("docs/backlog/my-feature/CROSS-REVIEW-product-manager-FSPEC.md");
  });

  it("constructs cross-review path using featurePath for completed feature", () => {
    const result = crossReviewPath(
      "docs/completed/015-my-feature/",
      "test-engineer",
      "TSPEC",
    );
    expect(result).toBe("docs/completed/015-my-feature/CROSS-REVIEW-test-engineer-TSPEC.md");
  });

  it("handles different document types", () => {
    const result = crossReviewPath(
      "docs/in-progress/my-feature/",
      "engineer",
      "PROPERTIES",
    );
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-PROPERTIES.md");
  });
});

// ---------------------------------------------------------------------------
// parseRecommendation — LGTM support
// ---------------------------------------------------------------------------

describe("parseRecommendation", () => {
  it("parses 'LGTM' as approved from a heading", () => {
    const content = "## Recommendation\nLGTM";
    expect(parseRecommendation(content)).toEqual({ status: "approved" });
  });

  it("parses 'LGTM' as approved from bold format", () => {
    const content = "**Recommendation:** LGTM";
    expect(parseRecommendation(content)).toEqual({ status: "approved" });
  });

  it("parses 'lgtm' (lowercase) as approved", () => {
    const content = "## Recommendation: lgtm";
    expect(parseRecommendation(content)).toEqual({ status: "approved" });
  });
});

// ---------------------------------------------------------------------------
// A3: SKILL_TO_AGENT mapping fix — "engineer" key instead of "backend-engineer"
// ---------------------------------------------------------------------------

describe("skillNameToAgentId", () => {
  it("maps 'engineer' to 'eng'", () => {
    expect(skillNameToAgentId("engineer")).toBe("eng");
  });

  it("maps 'product-manager' to 'pm'", () => {
    expect(skillNameToAgentId("product-manager")).toBe("pm");
  });

  it("maps 'test-engineer' to 'qa'", () => {
    expect(skillNameToAgentId("test-engineer")).toBe("qa");
  });

  it("maps 'frontend-engineer' to 'fe'", () => {
    expect(skillNameToAgentId("frontend-engineer")).toBe("fe");
  });

  it("returns null for unknown skill names", () => {
    expect(skillNameToAgentId("unknown-skill")).toBeNull();
  });

  it("returns null for the old 'backend-engineer' key (removed)", () => {
    expect(skillNameToAgentId("backend-engineer")).toBeNull();
  });
});

describe("agentIdToSkillName", () => {
  it("maps 'eng' to 'engineer'", () => {
    expect(agentIdToSkillName("eng")).toBe("engineer");
  });

  it("maps 'pm' to 'product-manager'", () => {
    expect(agentIdToSkillName("pm")).toBe("product-manager");
  });

  it("maps 'qa' to 'test-engineer'", () => {
    expect(agentIdToSkillName("qa")).toBe("test-engineer");
  });

  it("maps 'fe' to 'frontend-engineer'", () => {
    expect(agentIdToSkillName("fe")).toBe("frontend-engineer");
  });

  it("returns null for unknown agent IDs", () => {
    expect(agentIdToSkillName("unknown")).toBeNull();
  });
});
