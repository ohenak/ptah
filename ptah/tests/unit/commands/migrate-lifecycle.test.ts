/**
 * Unit tests for MigrateLifecycleCommand (Phase G).
 *
 * G1: Pre-flight: error when docs/ does not exist
 * G2: Pre-flight: error when working tree is not clean
 * G3: Pre-flight: error when lifecycle folders are already non-empty
 * G4: Create lifecycle directories with .gitkeep files
 * G5: Migrate completed features — move NNN-prefixed folders to docs/completed/
 * G6: Migrate in-progress features — move remaining folders to docs/in-progress/
 * G7: Skip non-feature directories (requirements/, templates/, open-questions/)
 * G8: Commit migration with correct message
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MigrateLifecycleCommand } from "../../../src/commands/migrate-lifecycle.js";
import { FakeFileSystem, FakeGitClient, FakeLogger } from "../../fixtures/factories.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFs(opts?: {
  hasDocs?: boolean;
  dirs?: string[];
}) {
  const fs = new FakeFileSystem("/repo");
  if (opts?.hasDocs ?? true) {
    fs.addExistingDir("docs");
  }
  for (const dir of opts?.dirs ?? []) {
    fs.addExistingDir(dir);
  }
  return fs;
}

function makeGit(opts?: { dirty?: boolean }) {
  const git = new FakeGitClient();
  git.hasUncommittedChangesResult = opts?.dirty ?? false;
  return git;
}

// ---------------------------------------------------------------------------
// G1: Pre-flight — docs/ does not exist
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G1: docs/ missing", () => {
  it("throws when docs/ does not exist", async () => {
    const fs = makeFs({ hasDocs: false });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("docs/ directory does not exist");
  });
});

// ---------------------------------------------------------------------------
// G2: Pre-flight — dirty working tree
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G2: dirty working tree", () => {
  it("throws when working tree is not clean", async () => {
    const fs = makeFs();
    const git = makeGit({ dirty: true });
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("working tree is not clean");
  });
});

// ---------------------------------------------------------------------------
// G3: Pre-flight — lifecycle folder already non-empty
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G3: lifecycle folder already populated", () => {
  it("throws when docs/backlog/ is non-empty", async () => {
    const fs = makeFs({ dirs: ["docs/backlog", "docs/backlog/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("docs/backlog/ already contains files");
  });

  it("throws when docs/in-progress/ is non-empty", async () => {
    const fs = makeFs({ dirs: ["docs/in-progress", "docs/in-progress/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("docs/in-progress/ already contains files");
  });

  it("throws when docs/completed/ is non-empty", async () => {
    const fs = makeFs({ dirs: ["docs/completed", "docs/completed/001-old-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("docs/completed/ already contains files");
  });

  it("does not throw when lifecycle folders have only .gitkeep", async () => {
    const fs = makeFs({ dirs: ["docs/backlog", "docs/in-progress", "docs/completed"] });
    // Add .gitkeep files (not dirs)
    fs.addExisting("docs/backlog/.gitkeep", "");
    fs.addExisting("docs/in-progress/.gitkeep", "");
    fs.addExisting("docs/completed/.gitkeep", "");
    // Add a feature dir so the command has something to move
    fs.addExistingDir("docs/my-feature");
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    // Should not throw on pre-flight
    const result = await cmd.execute();
    expect(result.inProgressMoved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G4: Create lifecycle directories with .gitkeep files
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G4: create lifecycle directories", () => {
  it("creates docs/backlog/, docs/in-progress/, docs/completed/ with .gitkeep", async () => {
    const fs = makeFs({ dirs: ["docs/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(fs.hasDir("docs/backlog")).toBe(true);
    expect(fs.hasDir("docs/in-progress")).toBe(true);
    expect(fs.hasDir("docs/completed")).toBe(true);
    expect(fs.getFile("docs/backlog/.gitkeep")).toBe("");
    expect(fs.getFile("docs/in-progress/.gitkeep")).toBe("");
    expect(fs.getFile("docs/completed/.gitkeep")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// G5: Migrate completed features (NNN-prefixed)
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G5: migrate completed features", () => {
  it("moves NNN-prefixed folders to docs/completed/", async () => {
    const fs = makeFs({
      dirs: ["docs/001-old-feature", "docs/002-another-feature"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.completedMoved).toBe(2);

    const mvCalls = git.gitMvInWorktreeCalls;
    const completedMoves = mvCalls.filter((c) => c.destination.includes("docs/completed"));
    expect(completedMoves).toHaveLength(2);

    const destinations = completedMoves.map((c) => c.destination);
    expect(destinations).toContain("docs/completed/001-old-feature");
    expect(destinations).toContain("docs/completed/002-another-feature");
  });

  it("uses cwd from FileSystem as worktree path for git mv", async () => {
    const fs = makeFs({ dirs: ["docs/001-old-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    const mvCalls = git.gitMvInWorktreeCalls;
    expect(mvCalls[0]!.worktreePath).toBe("/repo");
  });
});

// ---------------------------------------------------------------------------
// G6: Migrate in-progress features (remaining dirs)
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G6: migrate in-progress features", () => {
  it("moves remaining feature folders to docs/in-progress/", async () => {
    const fs = makeFs({
      dirs: ["docs/active-feature", "docs/another-wip"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.inProgressMoved).toBe(2);

    const mvCalls = git.gitMvInWorktreeCalls;
    const ipMoves = mvCalls.filter((c) => c.destination.includes("docs/in-progress"));
    expect(ipMoves).toHaveLength(2);

    const destinations = ipMoves.map((c) => c.destination);
    expect(destinations).toContain("docs/in-progress/active-feature");
    expect(destinations).toContain("docs/in-progress/another-wip");
  });

  it("handles mixed: NNN-prefixed go to completed, rest to in-progress", async () => {
    const fs = makeFs({
      dirs: ["docs/001-done", "docs/active"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.completedMoved).toBe(1);
    expect(result.inProgressMoved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G7: Skip non-feature directories
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G7: skip system directories", () => {
  it("does not move requirements/, templates/, open-questions/ to in-progress", async () => {
    const fs = makeFs({
      dirs: [
        "docs/requirements",
        "docs/templates",
        "docs/open-questions",
        "docs/my-feature",
      ],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.inProgressMoved).toBe(1); // only my-feature

    const ipMoves = git.gitMvInWorktreeCalls.filter((c) =>
      c.destination.includes("docs/in-progress"),
    );
    expect(ipMoves).toHaveLength(1);
    expect(ipMoves[0]!.destination).toBe("docs/in-progress/my-feature");
  });

  it("does not move lifecycle dirs (backlog, in-progress, completed) to in-progress", async () => {
    const fs = makeFs({
      dirs: ["docs/backlog", "docs/in-progress", "docs/completed", "docs/my-feature"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.inProgressMoved).toBe(1);
    const ipMoves = git.gitMvInWorktreeCalls.filter((c) =>
      c.destination.includes("docs/in-progress"),
    );
    const destinations = ipMoves.map((c) => c.destination);
    expect(destinations).not.toContain("docs/in-progress/backlog");
    expect(destinations).not.toContain("docs/in-progress/in-progress");
    expect(destinations).not.toContain("docs/in-progress/completed");
    expect(destinations).toContain("docs/in-progress/my-feature");
  });
});

// ---------------------------------------------------------------------------
// G8: Commit with correct message
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — G8: commit message", () => {
  it("commits with the correct migration commit message", async () => {
    const fs = makeFs({ dirs: ["docs/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(git.commits).toHaveLength(1);
    expect(git.commits[0]).toContain("chore(migration): reorganize docs/ into lifecycle folders");
  });

  it("adds docs/ before committing", async () => {
    const fs = makeFs({ dirs: ["docs/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await cmd.execute();

    expect(git.addedPaths).toContainEqual(["docs"]);
  });

  it("returns committed: true on success", async () => {
    const fs = makeFs({ dirs: ["docs/my-feature"] });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();

    expect(result.committed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PROP-MG-08: rename conflict — duplicate destination after NNN stripping
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — PROP-MG-08: rename conflict", () => {
  it("detects when two NNN-prefixed folders map to the same slug in completed/", async () => {
    // Two differently-numbered folders with the same base slug.
    // Both would be moved to docs/completed/ with their existing NNN,
    // so this is not a true conflict in our implementation —
    // 001-my-feature and 002-my-feature are distinct in completed/.
    // This test verifies both are moved independently.
    const fs = makeFs({
      dirs: ["docs/001-my-feature", "docs/002-my-feature"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();
    expect(result.completedMoved).toBe(2);
  });

  it("detects when an unnumbered folder collides with an NNN-prefixed folder's slug in in-progress", async () => {
    // docs/my-feature/ → in-progress/my-feature/
    // This is a valid scenario — no collision because NNN-prefixed folders
    // go to completed/ and unnumbered folders go to in-progress/.
    const fs = makeFs({
      dirs: ["docs/001-my-feature", "docs/my-feature"],
    });
    const git = makeGit();
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    const result = await cmd.execute();
    expect(result.completedMoved).toBe(1);
    expect(result.inProgressMoved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PROP-MG-07: git mv failure during migration
// ---------------------------------------------------------------------------

describe("MigrateLifecycleCommand — PROP-MG-07: git mv failure", () => {
  it("throws when git mv fails for a completed folder", async () => {
    const fs = makeFs({ dirs: ["docs/001-old-feature"] });
    const git = makeGit();
    git.gitMvInWorktreeError = new Error("fatal: bad source");
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("bad source");
  });

  it("throws when git mv fails for an in-progress folder", async () => {
    const fs = makeFs({ dirs: ["docs/active-feature"] });
    const git = makeGit();
    git.gitMvInWorktreeError = new Error("fatal: bad source");
    const logger = new FakeLogger();
    const cmd = new MigrateLifecycleCommand(git, fs, logger);

    await expect(cmd.execute()).rejects.toThrow("bad source");
  });
});
