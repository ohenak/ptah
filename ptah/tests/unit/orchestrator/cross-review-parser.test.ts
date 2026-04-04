/**
 * Unit tests for the cross-review-parser module.
 *
 * E3: crossReviewPath now accepts featurePath instead of featureSlug.
 */

import { describe, it, expect } from "vitest";
import { crossReviewPath } from "../../../src/orchestrator/pdlc/cross-review-parser.js";

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
