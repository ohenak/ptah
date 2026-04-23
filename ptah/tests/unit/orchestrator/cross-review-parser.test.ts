/**
 * Unit tests for the cross-review-parser module.
 *
 * E3: crossReviewPath now accepts featurePath instead of featureSlug.
 * Phase 1: VALUE_MATCHERS additions, AGENT_TO_SKILL updates, crossReviewPath versioning,
 *          extractRecommendationValue extraction, parseRecommendation refactor.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crossReviewPath,
  parseRecommendation,
  extractRecommendationValue,
  agentIdToSkillName,
  skillNameToAgentId,
} from "../../../src/orchestrator/pdlc/cross-review-parser.js";

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
// parseRecommendation — accepts extracted field value (not full file content)
// ---------------------------------------------------------------------------

describe("parseRecommendation", () => {
  it("parses 'LGTM' extracted value as approved", () => {
    expect(parseRecommendation("LGTM")).toEqual({ status: "approved" });
  });

  it("parses 'lgtm' (lowercase) extracted value as approved", () => {
    expect(parseRecommendation("lgtm")).toEqual({ status: "approved" });
  });

  it("parses 'Approved' extracted value as approved", () => {
    expect(parseRecommendation("Approved")).toEqual({ status: "approved" });
  });

  it("parses 'approved with minor changes' as approved", () => {
    expect(parseRecommendation("approved with minor changes")).toEqual({ status: "approved" });
  });

  // Task 1.1: New VALUE_MATCHERS entries
  it("parses 'approved with minor issues' as approved", () => {
    expect(parseRecommendation("approved with minor issues")).toEqual({ status: "approved" });
  });

  it("parses 'Approved with minor issues' (mixed case) as approved", () => {
    expect(parseRecommendation("Approved with minor issues")).toEqual({ status: "approved" });
  });

  it("parses 'Needs Revision' as revision_requested", () => {
    expect(parseRecommendation("Needs Revision")).toEqual({ status: "revision_requested" });
  });

  it("parses 'revision requested' as revision_requested", () => {
    expect(parseRecommendation("revision requested")).toEqual({ status: "revision_requested" });
  });

  // Task 1.1: New VALUE_MATCHERS entry
  it("parses 'need attention' as revision_requested", () => {
    expect(parseRecommendation("need attention")).toEqual({ status: "revision_requested" });
  });

  it("parses 'Need Attention' (mixed case) as revision_requested", () => {
    expect(parseRecommendation("Need Attention")).toEqual({ status: "revision_requested" });
  });

  it("returns parse_error for unrecognized extracted value", () => {
    const result = parseRecommendation("Maybe later");
    expect(result).toEqual({
      status: "parse_error",
      reason: "Unrecognized recommendation",
      rawValue: "Maybe later",
    });
  });

  it("returns parse_error for empty extracted value (after trim)", () => {
    const result = parseRecommendation("   ");
    expect(result.status).toBe("parse_error");
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

// Task 1.2: New SKILL_TO_AGENT entries (new skill names → new agent IDs)
describe("skillNameToAgentId — new role entries", () => {
  it("maps 'pm-review' to 'pm-review' agent", () => {
    expect(skillNameToAgentId("pm-review")).toBe("pm-review");
  });

  it("maps 'te-review' to 'te-review' agent", () => {
    expect(skillNameToAgentId("te-review")).toBe("te-review");
  });

  it("maps 'se-review' to 'se-review' agent", () => {
    expect(skillNameToAgentId("se-review")).toBe("se-review");
  });
});

describe("agentIdToSkillName", () => {
  // Existing legacy entries (backward-compat)
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

  // Task 1.2: New canonical agent IDs from TSPEC DoD (7 ACs)
  it("maps 'se-review' to 'software-engineer'", () => {
    expect(agentIdToSkillName("se-review")).toBe("software-engineer");
  });

  it("maps 'pm-review' to 'product-manager'", () => {
    expect(agentIdToSkillName("pm-review")).toBe("product-manager");
  });

  it("maps 'te-review' to 'test-engineer'", () => {
    expect(agentIdToSkillName("te-review")).toBe("test-engineer");
  });
});

// ---------------------------------------------------------------------------
// Task 1.3: crossReviewPath — optional revisionCount parameter
// ---------------------------------------------------------------------------

describe("crossReviewPath — revision versioning", () => {
  it("produces unversioned path when revisionCount is absent", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "engineer", "REQ");
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ.md");
  });

  it("produces unversioned path when revisionCount is 1", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "engineer", "REQ", 1);
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ.md");
  });

  it("produces versioned path with -v2 suffix for revisionCount 2", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "engineer", "REQ", 2);
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ-v2.md");
  });

  it("produces versioned path with -v5 suffix for revisionCount 5", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "test-engineer", "TSPEC", 5);
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-test-engineer-TSPEC-v5.md");
  });

  it("clamps revisionCount 0 to 1 (unversioned)", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "engineer", "REQ", 0);
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ.md");
  });

  it("clamps negative revisionCount to 1 (unversioned)", () => {
    const result = crossReviewPath("docs/in-progress/my-feature/", "engineer", "REQ", -3);
    expect(result).toBe("docs/in-progress/my-feature/CROSS-REVIEW-engineer-REQ.md");
  });
});

// ---------------------------------------------------------------------------
// Task 1.5: extractRecommendationValue — extraction logic in isolation
// ---------------------------------------------------------------------------

describe("extractRecommendationValue", () => {
  // (a) heading-scan with HEADING_PATTERN match extracts the correct field value
  it("(a) extracts inline value from markdown heading", () => {
    const content = "## Recommendation: Approved\n\nLooks good.";
    expect(extractRecommendationValue(content)).toBe("Approved");
  });

  it("(a) extracts next-line value when heading has no inline value", () => {
    const content = "## Recommendation\n\nApproved with minor changes";
    expect(extractRecommendationValue(content)).toBe("Approved with minor changes");
  });

  // (b) bold-wrapped value is extracted correctly
  it("(b) extracts value from bold-wrapped recommendation line", () => {
    const content = "**Recommendation:** **Approved**\n\nSome commentary.";
    expect(extractRecommendationValue(content)).toBe("**Approved**");
  });

  it("(b) extracts plain value from bold heading format", () => {
    const content = "**Recommendation:** LGTM";
    expect(extractRecommendationValue(content)).toBe("LGTM");
  });

  // (c) code-fence block containing 'Recommendation:' is skipped
  it("(c) skips Recommendation heading inside code fence, uses real heading", () => {
    const content = [
      "```",
      "## Recommendation: do not use this",
      "```",
      "## Recommendation: Approved",
    ].join("\n");
    expect(extractRecommendationValue(content)).toBe("Approved");
  });

  // (d) returns null when no Recommendation heading exists
  it("(d) returns null when no Recommendation heading found", () => {
    const content = "# Cross Review\n\nThis document looks fine.\n\n## Summary\nAll good.";
    expect(extractRecommendationValue(content)).toBeNull();
  });

  it("(d) returns null for empty file content", () => {
    expect(extractRecommendationValue("")).toBeNull();
  });

  // (e) multi-line look-ahead returns the next non-blank line
  it("(e) multi-line look-ahead skips blank lines and returns next non-blank line", () => {
    const content = "## Recommendation\n\n\nNeeds Revision\n\nSome extra text.";
    expect(extractRecommendationValue(content)).toBe("Needs Revision");
  });

  it("(e) uses last Recommendation heading when multiple exist", () => {
    // The parser uses last match — cross-review files may have table headers
    const content = "| Recommendation | |\n## Recommendation\nApproved";
    expect(extractRecommendationValue(content)).toBe("Approved");
  });
});

// ---------------------------------------------------------------------------
// PROP-MAP-08: AGENT_TO_SKILL is derived by reversing SKILL_TO_AGENT (static scan)
// ---------------------------------------------------------------------------

describe("PROP-MAP-08: AGENT_TO_SKILL derived from SKILL_TO_AGENT reversal (static scan)", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const parserSrcPath = path.resolve(
    currentDir,
    "../../../src/orchestrator/pdlc/cross-review-parser.ts"
  );

  it("source defines SKILL_TO_AGENT before AGENT_TO_SKILL", () => {
    const source = fs.readFileSync(parserSrcPath, "utf-8");
    expect(source).toContain("SKILL_TO_AGENT");
    expect(source).toContain("AGENT_TO_SKILL");
    const skillToAgentIdx = source.indexOf("SKILL_TO_AGENT");
    const agentToSkillIdx = source.indexOf("AGENT_TO_SKILL");
    expect(skillToAgentIdx).toBeLessThan(agentToSkillIdx);
  });

  it("AGENT_TO_SKILL is built using Object.fromEntries and Object.entries(SKILL_TO_AGENT) — derived, not hand-maintained", () => {
    const source = fs.readFileSync(parserSrcPath, "utf-8");
    // The build site must contain the reversal pattern:
    // Object.fromEntries(Object.entries(SKILL_TO_AGENT).map(...))
    expect(source).toMatch(/Object\.fromEntries\s*\(\s*Object\.entries\s*\(\s*SKILL_TO_AGENT\s*\)/);
  });

  it("AGENT_TO_SKILL merges LEGACY_AGENT_TO_SKILL for backward-compat entries", () => {
    const source = fs.readFileSync(parserSrcPath, "utf-8");
    expect(source).toContain("LEGACY_AGENT_TO_SKILL");
    // AGENT_TO_SKILL build block must spread LEGACY_AGENT_TO_SKILL
    expect(source).toMatch(/AGENT_TO_SKILL[\s\S]*?LEGACY_AGENT_TO_SKILL/);
  });
});
