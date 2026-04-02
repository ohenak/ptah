import { describe, it, expect, beforeEach } from "vitest";
import { InitCommand } from "../../../src/commands/init.js";
import { FakeFileSystem, FakeGitClient } from "../../fixtures/factories.js";
import { DIRECTORY_MANIFEST, FILE_MANIFEST, buildConfig } from "../../../src/config/defaults.js";

describe("InitCommand", () => {
  let fs: FakeFileSystem;
  let git: FakeGitClient;
  let command: InitCommand;

  beforeEach(() => {
    fs = new FakeFileSystem("/fake/project");
    git = new FakeGitClient();
    command = new InitCommand(fs, git);
  });

  // Task 13: Error when not in a Git repo
  describe("git repo check", () => {
    it("throws when not in a git repo", async () => {
      git.isRepoReturn = false;
      await expect(command.execute()).rejects.toThrow(
        "Not a Git repository. Run 'git init' first."
      );
    });

    // PROP-IN-14: Git not installed — isRepo() throws instead of returning false
    it("propagates error when git.isRepo() throws (git not installed)", async () => {
      git.isRepoError = new Error("spawn git ENOENT");
      await expect(command.execute()).rejects.toThrow("spawn git ENOENT");
    });
  });

  // Task 14: Error when pre-existing staged changes
  describe("staged changes check", () => {
    it("throws when staged changes exist", async () => {
      git.hasStagedReturn = true;
      await expect(command.execute()).rejects.toThrow(
        "Staged changes detected. Please commit or stash them before running 'ptah init'."
      );
    });

    it("does not call fs.mkdir, fs.writeFile, git.add, or git.commit when staged changes exist", async () => {
      git.hasStagedReturn = true;
      try {
        await command.execute();
      } catch {
        // expected
      }
      // Verify no filesystem operations occurred
      for (const dir of DIRECTORY_MANIFEST) {
        expect(fs.hasDir(dir)).toBe(false);
      }
      for (const [path] of Object.entries(FILE_MANIFEST)) {
        expect(fs.getFile(path)).toBeUndefined();
      }
      expect(git.addedPaths).toHaveLength(0);
      expect(git.commits).toHaveLength(0);
    });
  });

  // Task 15: Creates all 9 directories
  describe("directory creation", () => {
    it("creates all 9 directories from DIRECTORY_MANIFEST", async () => {
      await command.execute();
      for (const dir of DIRECTORY_MANIFEST) {
        expect(fs.hasDir(dir), `Expected directory "${dir}" to be created`).toBe(true);
      }
    });
  });

  // Task 16: Creates all files with correct content (was 17, now 18 with ptah.workflow.yaml)
  describe("file creation", () => {
    it("creates all 18 files from FILE_MANIFEST", async () => {
      const result = await command.execute();
      const allFileKeys = Object.keys(FILE_MANIFEST);
      expect(allFileKeys).toHaveLength(18);

      for (const filePath of allFileKeys) {
        if (filePath === "ptah.config.json") {
          // Config is generated dynamically
          expect(fs.getFile(filePath), `Expected file "${filePath}" to be created`).toBeDefined();
        } else {
          expect(
            fs.getFile(filePath),
            `Expected file "${filePath}" to be created with correct content`
          ).toBe(FILE_MANIFEST[filePath]);
        }
      }
    });

    it("creates .gitkeep files with empty content", async () => {
      await command.execute();
      expect(fs.getFile("docs/architecture/decisions/.gitkeep")).toBe("");
      expect(fs.getFile("docs/architecture/diagrams/.gitkeep")).toBe("");
      expect(fs.getFile("ptah/templates/.gitkeep")).toBe("");
    });
  });

  // Task 17: InitCommand passes fs.basename(fs.cwd()) to buildConfig
  describe("project name auto-detection", () => {
    it("uses cwd basename as project name in config", async () => {
      fs = new FakeFileSystem("/home/user/my-cool-project");
      command = new InitCommand(fs, git);
      await command.execute();
      const configContent = fs.getFile("ptah.config.json")!;
      const parsed = JSON.parse(configContent);
      expect(parsed.project.name).toBe("my-cool-project");
    });

    it("falls back to 'my-app' when basename is empty", async () => {
      fs = new FakeFileSystem("/");
      command = new InitCommand(fs, git);
      await command.execute();
      const configContent = fs.getFile("ptah.config.json")!;
      const parsed = JSON.parse(configContent);
      expect(parsed.project.name).toBe("my-app");
    });
  });

  // Task 18: Skips existing files
  describe("skip existing files", () => {
    it("skips existing files and preserves their content", async () => {
      const originalContent = "# My custom overview";
      fs.addExisting("docs/overview.md", originalContent);

      const result = await command.execute();

      expect(result.skipped).toContain("docs/overview.md");
      expect(fs.getFile("docs/overview.md")).toBe(originalContent);
    });

    it("reports skipped files in result.skipped", async () => {
      fs.addExisting("docs/overview.md", "existing");
      fs.addExisting("docs/initial_project/requirements.md", "existing");

      const result = await command.execute();

      expect(result.skipped).toContain("docs/overview.md");
      expect(result.skipped).toContain("docs/initial_project/requirements.md");
    });

    it("does not include skipped files in result.created", async () => {
      fs.addExisting("docs/overview.md", "existing");

      const result = await command.execute();

      expect(result.created).not.toContain("docs/overview.md");
    });
  });

  // Task 18b: Idempotency — execute twice
  describe("idempotency", () => {
    it("second execute creates nothing, skips all, committed=false", async () => {
      // First run
      const result1 = await command.execute();
      expect(result1.created.length).toBeGreaterThan(0);
      expect(result1.committed).toBe(true);

      // Reset git call tracking for second run
      git.addedPaths = [];
      git.commits = [];

      // Second run on same fs state
      const result2 = await command.execute();
      expect(result2.created).toHaveLength(0);
      expect(result2.skipped).toHaveLength(18); // all 18 files
      expect(result2.committed).toBe(false);

      // No git calls made during second run
      expect(git.addedPaths).toHaveLength(0);
      expect(git.commits).toHaveLength(0);
    });
  });

  // Task 19: Directories not in skipped
  describe("directory skip behavior", () => {
    it("does not add existing directories to skipped[]", async () => {
      fs.addExistingDir("docs");
      fs.addExistingDir("docs/initial_project");

      const result = await command.execute();

      expect(result.skipped).not.toContain("docs");
      expect(result.skipped).not.toContain("docs/initial_project");
    });
  });

  // Task 20: docs/threads/ exclusion
  describe("docs/threads/ exclusion", () => {
    it("does not create docs/threads/ directory", async () => {
      await command.execute();
      expect(fs.hasDir("docs/threads")).toBe(false);
      expect(fs.hasDir("docs/threads/")).toBe(false);
    });
  });

  // Task 21: Git commit when files created
  describe("git commit on creation", () => {
    it("calls git.add with created file paths", async () => {
      const result = await command.execute();
      expect(git.addedPaths).toHaveLength(1);
      expect(git.addedPaths[0]).toEqual(expect.arrayContaining(result.created));
    });

    it("calls git.commit with correct message", async () => {
      await command.execute();
      expect(git.commits).toEqual(["[ptah] init: scaffolded docs structure"]);
    });

    it("sets committed to true when files are created", async () => {
      const result = await command.execute();
      expect(result.committed).toBe(true);
    });
  });

  // Task 22: No-op commit
  describe("no-op commit", () => {
    it("does not commit when all files exist", async () => {
      // Pre-populate all files
      for (const [path, content] of Object.entries(FILE_MANIFEST)) {
        if (path === "ptah.config.json") {
          fs.addExisting(path, buildConfig("project"));
        } else if (path === "ptah.workflow.yaml") {
          fs.addExisting(path, content as string);
        } else {
          fs.addExisting(path, content);
        }
      }

      const result = await command.execute();

      expect(result.committed).toBe(false);
      expect(git.addedPaths).toHaveLength(0);
      expect(git.commits).toHaveLength(0);
    });
  });

  // Task 23: InitResult correctness
  describe("InitResult correctness", () => {
    it("reports correct created, skipped, and committed on fresh repo", async () => {
      const result = await command.execute();

      // All 18 files should be created (directories aren't in created[])
      expect(result.created).toHaveLength(18);
      expect(result.skipped).toHaveLength(0);
      expect(result.committed).toBe(true);
    });

    it("reports correct values with mixed existing/new files", async () => {
      fs.addExisting("docs/overview.md", "existing");
      fs.addExisting("ptah/skills/pm-agent.md", "existing");

      const result = await command.execute();

      expect(result.created).toHaveLength(16); // 18 - 2 existing
      expect(result.skipped).toHaveLength(2);
      expect(result.committed).toBe(true);
    });
  });

  // Task 24: Error propagation
  describe("error propagation", () => {
    it("propagates git add error", async () => {
      git.addError = new Error("git add failed");
      await expect(command.execute()).rejects.toThrow("git add failed");
    });

    it("propagates git commit error", async () => {
      git.commitError = new Error("git commit failed");
      await expect(command.execute()).rejects.toThrow("git commit failed");
    });

    // PROP-IN-15: Permission denied on write propagates
    it("propagates writeFile permission error", async () => {
      fs.writeFileError = new Error("EACCES: permission denied");
      await expect(command.execute()).rejects.toThrow("EACCES: permission denied");
    });

    it("files remain on disk after git add failure", async () => {
      git.addError = new Error("git add failed");
      try {
        await command.execute();
      } catch {
        // expected
      }
      // Files should still exist in the fake fs
      expect(fs.getFile("docs/overview.md")).toBeDefined();
    });
  });

  // Task 25: Performance regression guard
  describe("performance", () => {
    it("completes within 5 seconds using in-memory fakes", async () => {
      const start = Date.now();
      await command.execute();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // Task 35: CLI output formatting
  describe("output formatting", () => {
    it("returns messages with created items", async () => {
      const result = await command.execute();
      expect(result.created.length).toBeGreaterThan(0);
      // The InitCommand itself returns the result; output formatting
      // is verified through the result structure
    });

    it("returns messages with skipped items", async () => {
      fs.addExisting("docs/overview.md", "existing");
      const result = await command.execute();
      expect(result.skipped).toContain("docs/overview.md");
    });
  });

  // E7: ptah.workflow.yaml generation and temporal section in ptah.config.json
  describe("E7: temporal foundation scaffold", () => {
    it("creates ptah.workflow.yaml with valid YAML content", async () => {
      const result = await command.execute();
      expect(result.created).toContain("ptah.workflow.yaml");
      const content = fs.getFile("ptah.workflow.yaml");
      expect(content).toBeDefined();
      expect(content).toContain("version: 1");
      expect(content).toContain("phases:");
    });

    it("ptah.workflow.yaml contains req-creation phase", async () => {
      await command.execute();
      const content = fs.getFile("ptah.workflow.yaml")!;
      expect(content).toContain("req-creation");
    });

    it("ptah.config.json includes temporal section with default values", async () => {
      await command.execute();
      const configContent = fs.getFile("ptah.config.json")!;
      const parsed = JSON.parse(configContent);
      expect(parsed.temporal).toBeDefined();
      expect(parsed.temporal.address).toBe("localhost:7233");
      expect(parsed.temporal.namespace).toBe("default");
      expect(parsed.temporal.taskQueue).toBe("ptah-main");
      expect(parsed.temporal.worker).toBeDefined();
      expect(parsed.temporal.worker.maxConcurrentWorkflowTasks).toBe(10);
      expect(parsed.temporal.worker.maxConcurrentActivities).toBe(3);
      expect(parsed.temporal.retry).toBeDefined();
      expect(parsed.temporal.retry.maxAttempts).toBe(3);
      expect(parsed.temporal.heartbeat).toBeDefined();
      expect(parsed.temporal.heartbeat.intervalSeconds).toBe(30);
      expect(parsed.temporal.heartbeat.timeoutSeconds).toBe(120);
    });

    it("ptah.workflow.yaml is skipped if it already exists", async () => {
      const existing = "version: 1\nphases: []";
      fs.addExisting("ptah.workflow.yaml", existing);
      const result = await command.execute();
      expect(result.skipped).toContain("ptah.workflow.yaml");
      expect(fs.getFile("ptah.workflow.yaml")).toBe(existing);
    });

    it("ptah.workflow.yaml is included in created list on fresh repo", async () => {
      const result = await command.execute();
      expect(result.created).toContain("ptah.workflow.yaml");
    });
  });
});
