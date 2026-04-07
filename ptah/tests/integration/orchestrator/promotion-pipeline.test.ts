/**
 * Integration tests for the promotion pipeline (Phase I).
 *
 * I1: backlog→in-progress promotion with real FS + git
 * I2: in-progress→completed promotion with real FS + git;
 *     verifies git log --follow preserves rename history (REQ-NF-01)
 *
 * Test setup:
 *   - A working repo with a local bare "origin" for push
 *   - Feature branch with initial lifecycle folder structure
 *   - DefaultWorktreeManager + DefaultFeatureResolver wired to real git
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createPromotionActivities } from "../../../src/orchestrator/promotion-activity.js";
import { DefaultWorktreeManager } from "../../../src/orchestrator/worktree-manager.js";
import { InMemoryWorktreeRegistry } from "../../../src/orchestrator/worktree-registry.js";
import { NodeGitClient } from "../../../src/services/git.js";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import { ConsoleLogger } from "../../../src/services/logger.js";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

interface TestRepos {
  workDir: string;
  bareDir: string;
  featureBranch: string;
  cleanup: () => Promise<void>;
}

/**
 * Set up a working repo + local bare remote.
 * Creates:
 *   - bareDir/ (bare repo = origin)
 *   - workDir/ with initial commit on main, feature branch pushed to origin
 *   - docs/backlog/{featureSlug}/ with REQ.md and overview.md
 *   - docs/in-progress/ and docs/completed/ as empty dirs with .gitkeep
 */
async function setupTestRepo(featureSlug: string): Promise<TestRepos> {
  const baseDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-promo-int-"));
  const workDir = nodePath.join(baseDir, "work");
  const bareDir = nodePath.join(baseDir, "bare.git");

  // Init bare repo (the "origin")
  await nodeFs.mkdir(bareDir, { recursive: true });
  await git(bareDir, "init", "--bare", "-b", "main");

  // Init working repo
  await nodeFs.mkdir(workDir, { recursive: true });
  await git(workDir, "init", "-b", "main");
  await git(workDir, "config", "user.email", "test@test.com");
  await git(workDir, "config", "user.name", "Test");
  await git(workDir, "remote", "add", "origin", bareDir);

  // Create initial commit on main
  await nodeFs.writeFile(nodePath.join(workDir, "README.md"), "# Test");
  await git(workDir, "add", "README.md");
  await git(workDir, "commit", "-m", "chore: initial commit");
  await git(workDir, "push", "origin", "main");

  // Create feature branch
  const featureBranch = `feat-${featureSlug}`;
  await git(workDir, "checkout", "-b", featureBranch);

  // Set up lifecycle folder structure
  const docsBacklog = nodePath.join(workDir, "docs", "backlog", featureSlug);
  const docsInProgress = nodePath.join(workDir, "docs", "in-progress");
  const docsCompleted = nodePath.join(workDir, "docs", "completed");

  await nodeFs.mkdir(docsBacklog, { recursive: true });
  await nodeFs.mkdir(docsInProgress, { recursive: true });
  await nodeFs.mkdir(docsCompleted, { recursive: true });

  await nodeFs.writeFile(
    nodePath.join(docsBacklog, "overview.md"),
    `# ${featureSlug}\n\nFeature overview.`,
  );
  await nodeFs.writeFile(
    nodePath.join(docsBacklog, `REQ-${featureSlug}.md`),
    `# Requirements\n\nSee [overview](./overview.md).`,
  );
  await nodeFs.writeFile(nodePath.join(docsInProgress, ".gitkeep"), "");
  await nodeFs.writeFile(nodePath.join(docsCompleted, ".gitkeep"), "");

  await git(workDir, "add", "-A");
  await git(workDir, "commit", "-m", `chore: scaffold ${featureSlug} in backlog`);
  await git(workDir, "push", "origin", featureBranch);

  // Switch back to main so the feature branch is free for worktree checkout.
  // addWorktreeOnBranch checks out the existing branch, which fails if it's
  // already checked out in the working directory.
  await git(workDir, "checkout", "main");

  return {
    workDir,
    bareDir,
    featureBranch,
    cleanup: async () => {
      await nodeFs.rm(baseDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// I1: backlog→in-progress promotion
// ---------------------------------------------------------------------------

describe("Promotion pipeline (I1): backlog → in-progress", () => {
  let repos: TestRepos;

  beforeEach(async () => {
    repos = await setupTestRepo("my-feature");
  });

  afterEach(async () => {
    await repos.cleanup();
  });

  it("moves the feature folder from backlog/ to in-progress/ in a worktree", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteBacklogToInProgress } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    const result = await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-001",
      runId: "test-run-001",
    });

    expect(result.promoted).toBe(true);
    expect(result.featurePath).toBe("docs/in-progress/my-feature/");
  });

  it("the feature folder is accessible in in-progress/ after push", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteBacklogToInProgress } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-001",
      runId: "test-run-001",
    });

    // Pull the pushed changes into the working copy
    await git(workDir, "pull", "origin", featureBranch);

    // Verify in-progress path exists
    const inProgressPath = nodePath.join(workDir, "docs", "in-progress", "my-feature", "overview.md");
    const stat = await nodeFs.stat(inProgressPath);
    expect(stat.isFile()).toBe(true);

    // Verify backlog path is gone
    const backlogPath = nodePath.join(workDir, "docs", "backlog", "my-feature");
    await expect(nodeFs.access(backlogPath)).rejects.toThrow();
  });

  it("is idempotent: returns promoted: false if already in in-progress", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteBacklogToInProgress } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    // First promotion
    await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-001",
      runId: "test-run-001",
    });

    // Pull changes
    await git(workDir, "pull", "origin", featureBranch);

    // Second promotion (idempotent)
    const result2 = await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-001",
      runId: "test-run-002",
    });

    expect(result2.promoted).toBe(false);
    expect(result2.featurePath).toBe("docs/in-progress/my-feature/");
  });
}, { timeout: 30000 });

// ---------------------------------------------------------------------------
// I2: in-progress→completed promotion + git log --follow
// ---------------------------------------------------------------------------

describe("Promotion pipeline (I2): in-progress → completed (REQ-NF-01)", () => {
  let repos: TestRepos;

  beforeEach(async () => {
    repos = await setupTestRepo("my-feature");

    // Pre-promote to in-progress so we can test the in-progress→completed path
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteBacklogToInProgress } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "setup-wf",
      runId: "setup-run",
    });

    // Pull the promotion commit into working copy
    await git(workDir, "pull", "origin", featureBranch);
  });

  afterEach(async () => {
    await repos.cleanup();
  });

  it("moves the feature folder from in-progress/ to completed/{NNN}/ in a worktree", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteInProgressToCompleted } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    const result = await promoteInProgressToCompleted({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-002",
      runId: "test-run-002",
    });

    expect(result.promoted).toBe(true);
    expect(result.featurePath).toMatch(/^docs\/completed\/001-my-feature\/$/);
  });

  it("renames files with NNN prefix in completed folder", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteInProgressToCompleted } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    await promoteInProgressToCompleted({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-002",
      runId: "test-run-002",
    });

    // Pull changes
    await git(workDir, "pull", "origin", featureBranch);

    // Verify NNN-prefixed files exist
    const completedDir = nodePath.join(workDir, "docs", "completed", "001-my-feature");
    const files = await nodeFs.readdir(completedDir);
    expect(files).toContain("001-overview.md");
    expect(files).toContain("001-REQ-my-feature.md");
  });

  it("preserves git history: git log --follow traces renamed file back to original (REQ-NF-01)", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteInProgressToCompleted } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    await promoteInProgressToCompleted({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "test-wf-002",
      runId: "test-run-002",
    });

    // Pull all changes
    await git(workDir, "pull", "origin", featureBranch);

    // git log --follow on the final file path should show history from
    // the original backlog commit (REQ-NF-01: git history preservation)
    const completedFilePath = "docs/completed/001-my-feature/001-REQ-my-feature.md";
    const log = await git(workDir, "log", "--follow", "--oneline", completedFilePath);

    // Should have at least 2 commits: initial creation + at least one rename/move
    const commits = log.split("\n").filter((l) => l.trim().length > 0);
    expect(commits.length).toBeGreaterThanOrEqual(2);

    // The oldest commit message should reference the original scaffold
    const oldestCommit = commits[commits.length - 1]!;
    expect(oldestCommit).toContain("scaffold my-feature in backlog");
  });
}, { timeout: 60000 });

// ---------------------------------------------------------------------------
// PROP-NF-05: retry after partial Phase 1 + Phase 2 failure
// ---------------------------------------------------------------------------

describe("Promotion pipeline (PROP-NF-05): idempotent retry after partial completion", () => {
  let repos: TestRepos;

  beforeEach(async () => {
    repos = await setupTestRepo("my-feature");

    // Pre-promote to in-progress
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteBacklogToInProgress } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    await promoteBacklogToInProgress({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "setup-wf",
      runId: "setup-run",
    });

    // Switch to the feature branch to pull the promotion commit and simulate
    // a partial Phase 1, then switch back to main so the feature branch is
    // free for worktree checkout in the test body.
    await git(workDir, "checkout", featureBranch);
    await git(workDir, "pull", "origin", featureBranch);

    // Simulate partial Phase 1: manually move folder to completed/ and commit,
    // but don't do Phase 2 (file rename) or Phase 3 (ref update).
    // This mimics a crash after Phase 1 folder move succeeded.
    await git(workDir, "mv", "docs/in-progress/my-feature", "docs/completed/001-my-feature");
    await git(workDir, "commit", "-m", "chore: partial Phase 1 move (simulated crash)");
    await git(workDir, "push", "origin", featureBranch);

    await git(workDir, "checkout", "main");
  });

  afterEach(async () => {
    await repos.cleanup();
  });

  it("produces identical final state when retried after partial Phase 1 completion", async () => {
    const { workDir, featureBranch } = repos;
    const logger = new ConsoleLogger();
    const gitClient = new NodeGitClient(workDir);
    const fs = new NodeFileSystem(workDir);
    const registry = new InMemoryWorktreeRegistry();
    const worktreeManager = new DefaultWorktreeManager(gitClient, registry, logger);

    const { promoteInProgressToCompleted } = createPromotionActivities({
      worktreeManager,
      gitClient,
      fs,
      logger,
    });

    // This should detect that 001-my-feature already exists in completed/,
    // skip Phase 1 (idempotent), and proceed with Phase 2 (file rename)
    // and Phase 3 (ref update).
    const result = await promoteInProgressToCompleted({
      featureSlug: "my-feature",
      featureBranch,
      workflowId: "retry-wf",
      runId: "retry-run",
    });

    expect(result.promoted).toBe(true);
    expect(result.featurePath).toBe("docs/completed/001-my-feature/");

    // Pull and verify files are NNN-prefixed
    await git(workDir, "pull", "origin", featureBranch);

    const completedDir = nodePath.join(workDir, "docs", "completed", "001-my-feature");
    const files = await nodeFs.readdir(completedDir);
    expect(files).toContain("001-overview.md");
    expect(files).toContain("001-REQ-my-feature.md");

    // Verify no unnumbered files remain
    expect(files).not.toContain("overview.md");
    expect(files).not.toContain("REQ-my-feature.md");
  });
}, { timeout: 60000 });
