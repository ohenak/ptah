/**
 * Unit tests for the readCrossReviewRecommendation Activity.
 *
 * Tests cover all three result paths:
 *   C1: approved
 *   C2: revision_requested
 *   C3: parse_error (file not found, unknown agent, unrecognized value, empty file)
 *
 * @see TSPEC Section 5.3, Section 7.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { ReadCrossReviewInput } from "../../../src/temporal/types.js";
import type { CrossReviewActivityDeps } from "../../../src/temporal/activities/cross-review-activity.js";
import { createCrossReviewActivities } from "../../../src/temporal/activities/cross-review-activity.js";
import { FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<ReadCrossReviewInput>): ReadCrossReviewInput {
  return {
    featurePath: "docs/in-progress/auth/",
    agentId: "eng",
    documentType: "REQ",
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<CrossReviewActivityDeps>): CrossReviewActivityDeps {
  return {
    fs: new FakeFileSystem(),
    logger: new FakeLogger(),
    ...overrides,
  };
}

// ===========================================================================
// C1: Approved path
// ===========================================================================

describe("readCrossReviewRecommendation — approved path", () => {
  it("returns approved when file contains '## Recommendation: Approved'", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "## Recommendation: Approved\n\nLooks good overall.",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "approved" });
  });

  it("returns approved when file contains 'Approved with minor changes'", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "## Recommendation\n\nApproved with minor changes",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "approved" });
  });

  it("returns approved when file contains LGTM", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "**Recommendation:** LGTM",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "approved" });
  });

  it("maps agentId 'qa' to skill name 'test-engineer'", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-test-engineer-TSPEC.md",
      "## Recommendation\nApproved",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(
      makeInput({ agentId: "qa", documentType: "TSPEC" }),
    );

    expect(result).toEqual({ status: "approved" });
  });

  it("maps agentId 'pm' to skill name 'product-manager'", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-product-manager-FSPEC.md",
      "## Recommendation\nApproved",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(
      makeInput({ agentId: "pm", documentType: "FSPEC" }),
    );

    expect(result).toEqual({ status: "approved" });
  });
});

// ===========================================================================
// C2: Revision requested path
// ===========================================================================

describe("readCrossReviewRecommendation — revision_requested path", () => {
  it("returns revision_requested when file contains 'Needs Revision'", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "## Recommendation\n\nNeeds Revision",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "revision_requested" });
  });

  it("returns revision_requested from bold format", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "**Recommendation:** Needs Revision\n\nPlease address the following...",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "revision_requested" });
  });

  it("returns revision_requested from table format", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "| Recommendation | Needs Revision |",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({ status: "revision_requested" });
  });
});

// ===========================================================================
// C3: Parse error paths
// ===========================================================================

describe("readCrossReviewRecommendation — parse_error paths", () => {
  it("returns parse_error when cross-review file does not exist", async () => {
    const fs = new FakeFileSystem();
    // No file added — readFile will throw
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({
      status: "parse_error",
      reason: "Cross-review file not found",
    });
  });

  it("returns parse_error with reason when agentId is unknown", async () => {
    const fs = new FakeFileSystem();
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(
      makeInput({ agentId: "unknown-agent" }),
    );

    expect(result).toEqual({
      status: "parse_error",
      reason: "Unknown agent ID: unknown-agent",
    });
  });

  it("returns parse_error with rawValue when recommendation value is unrecognized", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "## Recommendation\n\nMaybe later",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({
      status: "parse_error",
      reason: "Unrecognized recommendation",
      rawValue: "Maybe later",
    });
  });

  it("returns parse_error when file is empty", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({
      status: "parse_error",
      reason: "No Recommendation heading found",
    });
  });

  it("returns parse_error when file has no recommendation heading", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "# Cross Review\n\nThis document looks fine.\n\n## Summary\nAll good.",
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger: new FakeLogger(),
    });

    const result = await readCrossReviewRecommendation(makeInput());

    expect(result).toEqual({
      status: "parse_error",
      reason: "No Recommendation heading found",
    });
  });

  it("logs a warning when cross-review file is not found", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs,
      logger,
    });

    await readCrossReviewRecommendation(makeInput());

    const warnMessages = logger.messages.filter((m) => m.level === "warn");
    expect(warnMessages).toHaveLength(1);
    expect(warnMessages[0].message).toContain("Cross-review file not found");
    expect(warnMessages[0].message).toContain("CROSS-REVIEW-engineer-REQ.md");
  });
});
