/**
 * Unit tests for createArtifactActivities() factory and checkArtifactExists activity.
 *
 * @see PLAN-021 Tasks 3.2a (Red) and 3.2b (Green)
 * @see PROP-SC-06, PROP-SC-06A
 */

import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../../../fixtures/factories.js";
import { createArtifactActivities } from "../../../../src/temporal/activities/artifact-activity.js";

describe("createArtifactActivities", () => {
  // PROP-SC-06A: factory returns object with checkArtifactExists function
  describe("factory shape", () => {
    it("returns an object (not undefined or null)", () => {
      const fs = new FakeFileSystem();
      const activities = createArtifactActivities(fs);

      expect(activities).toBeDefined();
      expect(activities).not.toBeNull();
      expect(typeof activities).toBe("object");
    });

    it("returned object has a checkArtifactExists function property", () => {
      const fs = new FakeFileSystem();
      const activities = createArtifactActivities(fs);

      expect(typeof activities.checkArtifactExists).toBe("function");
    });
  });

  describe("checkArtifactExists", () => {
    // PROP-SC-06: non-empty file → returns true
    it("returns true when the file exists and is non-empty", async () => {
      const fs = new FakeFileSystem();
      fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ content here");

      const { checkArtifactExists } = createArtifactActivities(fs);

      const result = await checkArtifactExists({
        slug: "my-feature",
        docType: "REQ",
        featurePath: "docs/in-progress/my-feature/",
      });

      expect(result).toBe(true);
    });

    // PROP-SC-06: whitespace-only file → returns false
    it("returns false when the file exists but contains only whitespace", async () => {
      const fs = new FakeFileSystem();
      fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "   \n\t  \n");

      const { checkArtifactExists } = createArtifactActivities(fs);

      const result = await checkArtifactExists({
        slug: "my-feature",
        docType: "REQ",
        featurePath: "docs/in-progress/my-feature/",
      });

      expect(result).toBe(false);
    });

    // PROP-SC-06: read error → returns false
    it("returns false when the file does not exist (read error)", async () => {
      const fs = new FakeFileSystem();
      // file not added — readFile will throw ENOENT

      const { checkArtifactExists } = createArtifactActivities(fs);

      const result = await checkArtifactExists({
        slug: "my-feature",
        docType: "REQ",
        featurePath: "docs/in-progress/my-feature/",
      });

      expect(result).toBe(false);
    });

    it("reads from the correct path: {featurePath}{docType}-{slug}.md", async () => {
      const fs = new FakeFileSystem();
      // Add file at exact expected path
      fs.addExisting("docs/in-progress/my-feature/FSPEC-my-feature.md", "content");

      const { checkArtifactExists } = createArtifactActivities(fs);

      const result = await checkArtifactExists({
        slug: "my-feature",
        docType: "FSPEC",
        featurePath: "docs/in-progress/my-feature/",
      });

      expect(result).toBe(true);
    });
  });
});
