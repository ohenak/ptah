import { describe, it, expect } from "vitest";
import { FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";
import {
  DefaultFeatureResolver,
  type FeatureResolverResult,
} from "../../../src/orchestrator/feature-resolver.js";

/**
 * Helper: create a FakeFileSystem pre-populated with a feature folder
 * in the specified lifecycle location.
 */
function setupFs(
  root: string,
  lifecycle: "in-progress" | "backlog" | "completed",
  slug: string,
  /** For completed, the full directory name including NNN- prefix */
  dirName?: string,
): FakeFileSystem {
  const fs = new FakeFileSystem(root);
  const name = dirName ?? slug;
  fs.addExistingDir(`${root}/docs/${lifecycle}/${name}`);
  return fs;
}

describe("DefaultFeatureResolver", () => {
  const ROOT = "/workspace/repo";

  // ─── B1: Feature found in in-progress/ ───────────────────────────
  describe("B1: feature found in in-progress/", () => {
    it("returns correct path and lifecycle when slug exists in in-progress", async () => {
      const fs = setupFs(ROOT, "in-progress", "my-feature");
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/in-progress/my-feature/",
        lifecycle: "in-progress",
      } satisfies FeatureResolverResult);
    });
  });

  // ─── B2: Feature found in backlog/ ───────────────────────────────
  describe("B2: feature found in backlog/", () => {
    it("returns correct path and lifecycle when slug exists in backlog", async () => {
      const fs = setupFs(ROOT, "backlog", "my-feature");
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/backlog/my-feature/",
        lifecycle: "backlog",
      } satisfies FeatureResolverResult);
    });
  });

  // ─── B3: Feature found in completed/ — strips NNN prefix ────────
  describe("B3: feature found in completed/ — strips NNN prefix", () => {
    it("matches slug when completed entry has NNN- prefix", async () => {
      const fs = setupFs(ROOT, "completed", "my-feature", "001-my-feature");
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/completed/001-my-feature/",
        lifecycle: "completed",
      } satisfies FeatureResolverResult);
    });

    it("does not match entries without NNN- prefix pattern", async () => {
      const fs = new FakeFileSystem(ROOT);
      // Entry that doesn't match /^[0-9]{3}-/ pattern
      fs.addExistingDir(`${ROOT}/docs/completed/my-feature`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({ found: false, slug: "my-feature" });
    });
  });

  // ─── B4: Feature not found in any folder ─────────────────────────
  describe("B4: feature not found in any folder", () => {
    it("returns { found: false } without throwing", async () => {
      const fs = new FakeFileSystem(ROOT);
      // Create empty docs dirs so readDir doesn't need to throw
      fs.addExistingDir(`${ROOT}/docs/in-progress`);
      fs.addExistingDir(`${ROOT}/docs/backlog`);
      fs.addExistingDir(`${ROOT}/docs/completed`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("nonexistent", ROOT);

      expect(result).toEqual({ found: false, slug: "nonexistent" });
    });
  });

  // ─── B5: Slug found in multiple folders ──────────────────────────
  describe("B5: slug found in multiple folders", () => {
    it("logs warning and returns first match per search order (in-progress wins)", async () => {
      const fs = new FakeFileSystem(ROOT);
      fs.addExistingDir(`${ROOT}/docs/in-progress/my-feature`);
      fs.addExistingDir(`${ROOT}/docs/backlog/my-feature`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/in-progress/my-feature/",
        lifecycle: "in-progress",
      });

      // Should log a warning about multiple matches
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0].message).toContain("my-feature");
      expect(warnings[0].message).toContain("multiple");
    });

    it("returns in-progress over completed when both match", async () => {
      const fs = new FakeFileSystem(ROOT);
      fs.addExistingDir(`${ROOT}/docs/in-progress/my-feature`);
      fs.addExistingDir(`${ROOT}/docs/completed/001-my-feature`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/in-progress/my-feature/",
        lifecycle: "in-progress",
      });
    });

    it("returns backlog over completed when both match", async () => {
      const fs = new FakeFileSystem(ROOT);
      fs.addExistingDir(`${ROOT}/docs/backlog/my-feature`);
      fs.addExistingDir(`${ROOT}/docs/completed/002-my-feature`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({
        found: true,
        path: "docs/backlog/my-feature/",
        lifecycle: "backlog",
      });
    });
  });

  // ─── B6: Filesystem error on a lifecycle folder ──────────────────
  describe("B6: filesystem error on a lifecycle folder", () => {
    it("logs warning, treats folder as empty, and continues to next folder", async () => {
      // Custom FS that throws on exists() for in-progress path
      const fs = new FakeFileSystem(ROOT);
      fs.addExistingDir(`${ROOT}/docs/backlog/my-feature`);
      const logger = new FakeLogger();

      // Override exists to throw for in-progress check
      const originalExists = fs.exists.bind(fs);
      let callCount = 0;
      fs.exists = async (path: string): Promise<boolean> => {
        if (path.includes("in-progress")) {
          throw new Error("Permission denied");
        }
        return originalExists(path);
      };

      const resolver = new DefaultFeatureResolver(fs, logger);
      const result = await resolver.resolve("my-feature", ROOT);

      // Should still find it in backlog despite in-progress error
      expect(result).toEqual({
        found: true,
        path: "docs/backlog/my-feature/",
        lifecycle: "backlog",
      });

      // Should have logged a warning about the error
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it("logs warning when readDir throws on completed folder and continues", async () => {
      const fs = new FakeFileSystem(ROOT);
      const logger = new FakeLogger();

      // Override readDir to throw for completed path
      const originalReadDir = fs.readDir.bind(fs);
      fs.readDir = async (path: string): Promise<string[]> => {
        if (path.includes("completed")) {
          throw new Error("Permission denied");
        }
        return originalReadDir(path);
      };

      const resolver = new DefaultFeatureResolver(fs, logger);
      const result = await resolver.resolve("nonexistent", ROOT);

      // Should return not-found (no throw)
      expect(result).toEqual({ found: false, slug: "nonexistent" });

      // Should have logged a warning
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── B7: Worktree root with trailing slash ───────────────────────
  describe("B7: worktree root with trailing slash", () => {
    it("normalizes trailing slash and resolves correctly", async () => {
      const fs = setupFs(ROOT, "in-progress", "my-feature");
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      // Pass root with trailing slash
      const result = await resolver.resolve("my-feature", ROOT + "/");

      expect(result).toEqual({
        found: true,
        path: "docs/in-progress/my-feature/",
        lifecycle: "in-progress",
      });
    });
  });

  // ─── B8: Empty completed/ folder and missing docs/ directory ─────
  describe("B8: empty completed/ folder and missing docs/ directory", () => {
    it("returns not-found when completed/ is empty", async () => {
      const fs = new FakeFileSystem(ROOT);
      // docs structure exists but completed/ has no entries
      fs.addExistingDir(`${ROOT}/docs/completed`);
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({ found: false, slug: "my-feature" });
    });

    it("returns not-found when docs/ directory does not exist", async () => {
      const fs = new FakeFileSystem(ROOT);
      // No docs directory at all
      const logger = new FakeLogger();
      const resolver = new DefaultFeatureResolver(fs, logger);

      const result = await resolver.resolve("my-feature", ROOT);

      expect(result).toEqual({ found: false, slug: "my-feature" });
    });
  });
});
