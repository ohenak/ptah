/**
 * Architectural fitness tests — PROP-SK-16
 *
 * These tests enforce structural invariants across the codebase using
 * grep-style assertions. They detect violations that unit tests cannot
 * catch because they concern absence of behavior across many files.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../../../src");

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// PROP-SK-16: No module other than FeatureResolver may independently
// construct lifecycle-based feature paths (docs/backlog/..., etc.)
// ---------------------------------------------------------------------------

describe("PROP-SK-16: lifecycle path construction is exclusive to FeatureResolver", () => {
  // Pattern matches string templates or literals that construct lifecycle paths.
  // Allowed exceptions: feature-resolver.ts itself, promotion-activity.ts (which
  // receives paths from the resolver and constructs move destinations), and
  // migrate-lifecycle.ts (which is a one-time migration script).
  const LIFECYCLE_PATH_PATTERN =
    /docs\/(backlog|in-progress|completed)\/\$\{|docs\/(backlog|in-progress|completed)\/[a-z]/;

  const ALLOWED_FILES = new Set([
    "feature-resolver.ts",
    "promotion-activity.ts",
    "migrate-lifecycle.ts",
  ]);

  it("no source file outside the allowed set constructs docs/{lifecycle}/ paths", () => {
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of collectTsFiles(SRC_DIR)) {
      const basename = path.basename(filePath);
      if (ALLOWED_FILES.has(basename)) continue;

      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // Skip comments (single-line, JSDoc, block) and imports
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**")) continue;
        if (trimmed.startsWith("import ")) continue;

        if (LIFECYCLE_PATH_PATTERN.test(line)) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.content}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} lifecycle path construction(s) outside FeatureResolver:\n${msg}`,
      );
    }
  });
});
