import { describe, it, expect } from "vitest";
import {
  extractFeatureName,
  featureNameToSlug,
  featureBranchName,
  agentSubBranchName,
} from "../../../src/orchestrator/feature-branch.js";

describe("extractFeatureName", () => {
  it("extracts text before em-dash separator", () => {
    expect(extractFeatureName("010-parallel-feature-development \u2014 implement sub-branches")).toBe(
      "010-parallel-feature-development",
    );
  });

  it("returns full string when no em-dash is present", () => {
    expect(extractFeatureName("simple-thread-name")).toBe("simple-thread-name");
  });

  it("returns empty string before em-dash when em-dash is at start", () => {
    expect(extractFeatureName(" \u2014 description only")).toBe("");
  });

  it("extracts correctly from real-world thread name format", () => {
    expect(extractFeatureName("auth \u2014 define requirements")).toBe("auth");
  });

  it("handles multiple em-dashes by returning text before first", () => {
    expect(extractFeatureName("feat \u2014 part1 \u2014 part2")).toBe("feat");
  });
});

describe("featureNameToSlug", () => {
  it("lowercases the input", () => {
    expect(featureNameToSlug("MyFeature")).toBe("myfeature");
  });

  it("handles already-lowercase slug with hyphens", () => {
    expect(featureNameToSlug("010-parallel-feature-development")).toBe(
      "010-parallel-feature-development",
    );
  });

  it("replaces spaces and special chars with hyphens", () => {
    expect(featureNameToSlug("My Feature #2")).toBe("my-feature-2");
  });

  it("strips leading and trailing hyphens", () => {
    expect(featureNameToSlug("---")).toBe("unnamed");
  });

  it("returns unnamed for empty string", () => {
    expect(featureNameToSlug("")).toBe("unnamed");
  });

  it("returns unnamed for all non-alphanumeric input", () => {
    expect(featureNameToSlug("#@!")).toBe("unnamed");
  });

  it("collapses multiple non-alphanumeric sequences to a single hyphen", () => {
    expect(featureNameToSlug("hello   world")).toBe("hello-world");
  });
});

describe("featureBranchName", () => {
  it("returns feat-{slug} format", () => {
    expect(featureBranchName("010-parallel-feature-development")).toBe(
      "feat-010-parallel-feature-development",
    );
  });

  it("converts feature name to slug before prefixing", () => {
    expect(featureBranchName("My Feature #2")).toBe("feat-my-feature-2");
  });

  it("handles unnamed case", () => {
    expect(featureBranchName("")).toBe("feat-unnamed");
  });
});

describe("agentSubBranchName", () => {
  it("returns ptah/{slug}/{agentId}/{invocationId} format", () => {
    expect(agentSubBranchName("parallel-feature", "eng", "a1b2c3d4")).toBe(
      "ptah/parallel-feature/eng/a1b2c3d4",
    );
  });

  it("slugifies the feature name", () => {
    expect(agentSubBranchName("My Feature #2", "dev-agent", "deadbeef")).toBe(
      "ptah/my-feature-2/dev-agent/deadbeef",
    );
  });

  it("handles feature name with already valid slug chars", () => {
    expect(agentSubBranchName("010-parallel-feature-development", "eng", "abc123")).toBe(
      "ptah/010-parallel-feature-development/eng/abc123",
    );
  });
});
