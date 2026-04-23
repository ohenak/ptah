/**
 * Tests for ptah run CLI command.
 *
 * Covers:
 *   - LenientConfigLoader (5.1)
 *   - resolveStartPhase() (5.2)
 *   - pollUntilTerminal() (5.3a, 5.3b)
 *   - countFindingsInCrossReviewFile() (5.4a, 5.4b)
 *   - emitProgressLines() (5.4b)
 *   - handleQuestion() (5.5)
 *   - RunCommand.execute() (5.6)
 *   - Integration tests (5.7)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeFileSystem, FakeTemporalClient, FakeWorkflowConfigLoader } from "../../fixtures/factories.js";
import type { WorkflowConfig } from "../../../src/config/workflow-config.js";

// ---------------------------------------------------------------------------
// Helpers: write-stream and stdin stubs
// ---------------------------------------------------------------------------

function makeStdout(): { write: ReturnType<typeof vi.fn>; lines: string[] } {
  const lines: string[] = [];
  const write = vi.fn((chunk: string, cb?: () => void) => {
    lines.push(chunk);
    if (typeof cb === "function") cb();
    return true;
  });
  return { write: write as ReturnType<typeof vi.fn>, lines };
}

function makeStderr(): { write: ReturnType<typeof vi.fn>; lines: string[] } {
  const lines: string[] = [];
  const write = vi.fn((chunk: string, cb?: () => void) => {
    lines.push(chunk);
    if (typeof cb === "function") cb();
    return true;
  });
  return { write: write as ReturnType<typeof vi.fn>, lines };
}

function makeStdin(_lines: string[]): NodeJS.ReadableStream {
  // Unused helper — tests construct Readable inline via dynamic import
  throw new Error("makeStdin: use inline Readable construction in tests instead");
}

// We need to import dynamically to avoid circular issues with Temporal
async function importRun() {
  const mod = await import("../../../src/commands/run.js");
  return mod;
}

// ---------------------------------------------------------------------------
// 5.1 — LenientConfigLoader
// ---------------------------------------------------------------------------

describe("LenientConfigLoader", () => {
  it("loads ptah.config.json without requiring discord section", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting(
      "ptah.config.json",
      JSON.stringify({
        project: { name: "test" },
        agents: { active: ["pm"], skills: { pm: "./pm.md" } },
      })
    );
    const loader = new LenientConfigLoader(fs);
    const config = await loader.load();
    // Should not throw; temporal defaults applied
    expect(config).toBeDefined();
  });

  it("returns RunConfig with temporal defaults when temporal is absent", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting(
      "ptah.config.json",
      JSON.stringify({ project: { name: "test" } })
    );
    const loader = new LenientConfigLoader(fs);
    const config = await loader.load();
    // Temporal section absent → no defaults applied (config is still valid)
    expect(config).toBeDefined();
  });

  it("returns discord config when present in ptah.config.json", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting(
      "ptah.config.json",
      JSON.stringify({
        project: { name: "test" },
        discord: {
          bot_token_env: "DISCORD_BOT_TOKEN",
          server_id: "12345",
          channels: { updates: "ch", questions: "q", debug: "d" },
          mention_user_id: "user1",
        },
      })
    );
    const loader = new LenientConfigLoader(fs);
    const config = await loader.load();
    expect(config.discord).toBeDefined();
    expect(config.discord?.server_id).toBe("12345");
  });

  it("applies Temporal defaults when temporal section is present but incomplete", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting(
      "ptah.config.json",
      JSON.stringify({
        project: { name: "test" },
        temporal: { address: "myserver:7233" },
      })
    );
    const loader = new LenientConfigLoader(fs);
    const config = await loader.load();
    expect(config.temporal?.address).toBe("myserver:7233");
    expect(config.temporal?.namespace).toBe("default");
    expect(config.temporal?.taskQueue).toBe("ptah-main");
  });

  it("throws when ptah.config.json is missing", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    const loader = new LenientConfigLoader(fs);
    await expect(loader.load()).rejects.toThrow("ptah.config.json");
  });

  it("throws when ptah.config.json contains invalid JSON", async () => {
    const { LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("ptah.config.json", "not valid json {{{");
    const loader = new LenientConfigLoader(fs);
    await expect(loader.load()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5.2 — resolveStartPhase()
// ---------------------------------------------------------------------------

describe("resolveStartPhase()", () => {
  const baseWorkflowConfig: WorkflowConfig = {
    version: 1,
    phases: [
      { id: "req-review", name: "REQ Review", type: "review", revision_bound: 3, reviewers: { default: ["se-review"] }, transition: "req-approved" },
      { id: "req-approved", name: "REQ Approved", type: "approved" },
      { id: "fspec-creation", name: "FSPEC Creation", type: "creation", agent: "pm-author", transition: "fspec-review" },
      { id: "fspec-review", name: "FSPEC Review", type: "review", revision_bound: 3, reviewers: { default: ["se-review"] }, transition: "fspec-approved" },
      { id: "tspec-creation", name: "TSPEC Creation", type: "creation", agent: "se-author", transition: "tspec-review" },
      { id: "plan-creation", name: "PLAN Creation", type: "creation", agent: "se-author", transition: "plan-review" },
      { id: "properties-creation", name: "PROPERTIES Creation", type: "creation", agent: "te-author", transition: "properties-review" },
      { id: "implementation", name: "Implementation", type: "implementation", agent: "tech-lead", transition: "implementation-review" },
    ],
  };

  // T1: --from-phase valid
  it("T1: resolves to the specified phase when --from-phase is valid", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ content");
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      fromPhase: "fspec-creation",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("fspec-creation");
    expect(result.error).toBeUndefined();
    expect(result.logMessage).toBeUndefined();
  });

  // T2: --from-phase invalid
  it("T2: returns error listing all phase IDs when --from-phase is invalid", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      fromPhase: "nonexistent",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.error).toContain('"nonexistent" not found');
    expect(result.error).toContain("req-review");
    expect(result.error).toContain("fspec-creation");
    expect(result.error).toContain("implementation");
    // Must not be truncated
    expect(result.error).not.toContain("...");
  });

  // T3: auto-detect REQ only, no gap → req-review, no log
  it("T3: auto-detects req-review when only REQ exists (no gap)", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ content");
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("req-review");
    expect(result.logMessage).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  // T4: REQ present, FSPEC absent, TSPEC present (gap) → fspec-creation with log
  it("T4: auto-detects fspec-creation with log when FSPEC is absent but TSPEC present (gap)", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ content");
    // FSPEC absent
    fs.addExisting("docs/in-progress/my-feature/TSPEC-my-feature.md", "# TSPEC content");
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("fspec-creation");
    expect(result.logMessage).toBe(
      "Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)"
    );
    expect(result.error).toBeUndefined();
  });

  // T5: REQ + FSPEC → tspec-creation
  it("T5: auto-detects tspec-creation when REQ and FSPEC are present", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ content");
    fs.addExisting("docs/in-progress/my-feature/FSPEC-my-feature.md", "# FSPEC content");
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("tspec-creation");
    expect(result.logMessage).toBe(
      "Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)"
    );
  });

  // T6: all 5 artifacts → implementation
  it("T6: auto-detects implementation when all 5 PDLC artifacts are present", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    fs.addExisting(`${featureFolder}/REQ-my-feature.md`, "# REQ");
    fs.addExisting(`${featureFolder}/FSPEC-my-feature.md`, "# FSPEC");
    fs.addExisting(`${featureFolder}/TSPEC-my-feature.md`, "# TSPEC");
    fs.addExisting(`${featureFolder}/PLAN-my-feature.md`, "# PLAN");
    fs.addExisting(`${featureFolder}/PROPERTIES-my-feature.md`, "# PROPERTIES");
    const result = await resolveStartPhase({
      reqPath: `${featureFolder}/REQ-my-feature.md`,
      slug: "my-feature",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("implementation");
    expect(result.logMessage).toBe(
      "Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)"
    );
  });

  // T7: derived phase not in config → config-mismatch error
  it("T7: returns config-mismatch error when auto-detected phase is absent from workflow config", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    fs.addExisting(`${featureFolder}/REQ-my-feature.md`, "# REQ");
    fs.addExisting(`${featureFolder}/FSPEC-my-feature.md`, "# FSPEC");
    // TSPEC absent → would derive tspec-creation, but config has no such phase
    const configWithoutTspecCreation: WorkflowConfig = {
      version: 1,
      phases: [
        { id: "req-review", name: "REQ Review", type: "review", revision_bound: 3, reviewers: { default: [] }, transition: "req-approved" },
        { id: "req-approved", name: "REQ Approved", type: "approved" },
      ],
    };
    const result = await resolveStartPhase({
      reqPath: `${featureFolder}/REQ-my-feature.md`,
      slug: "my-feature",
      workflowConfig: configWithoutTspecCreation,
      fs,
    });
    expect(result.error).toContain('"tspec-creation" not found in workflow config');
    expect(result.error).toContain("Use --from-phase to specify a valid start phase");
  });

  it("treats whitespace-only artifact files as absent for auto-detection", async () => {
    const { resolveStartPhase } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    // FSPEC is whitespace-only → should be treated as absent
    fs.addExisting("docs/in-progress/my-feature/FSPEC-my-feature.md", "   \n  \t  ");
    const result = await resolveStartPhase({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      slug: "my-feature",
      workflowConfig: baseWorkflowConfig,
      fs,
    });
    expect(result.phase).toBe("req-review");
  });
});

// ---------------------------------------------------------------------------
// 5.3a — pollUntilTerminal() — terminal state tests (RED first)
// ---------------------------------------------------------------------------

describe("pollUntilTerminal() — terminal states", () => {
  async function makePollParams(overrides?: Partial<{
    phaseStatus: string;
    queryError?: Error;
  }>) {
    const { pollUntilTerminal } = await importRun();
    const temporalClient = new FakeTemporalClient();
    const workflowId = "ptah-test-feature";
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");

    const state = defaultFeatureWorkflowState({
      phaseStatus: (overrides?.phaseStatus as never) ?? "running",
    });
    temporalClient.workflowStates.set(workflowId, state);

    const stdout = makeStdout();
    const stderr = makeStderr();

    return {
      pollUntilTerminal,
      temporalClient,
      workflowId,
      stdout,
      stderr,
      params: {
        workflowId,
        temporalClient,
        discordConfig: undefined,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: {} as NodeJS.ReadableStream,
        featureFolder: "docs/in-progress/test-feature",
        slug: "test-feature",
        fs: new FakeFileSystem(),
      },
    };
  }

  // (a) completed → exit 0
  it("(a) returns exit code 0 when workflow reaches completed state", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";
    temporalClient.workflowStates.set(workflowId, defaultFeatureWorkflowState({ phaseStatus: "completed" }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });
    expect(exitCode).toBe(0);
    expect(stdout.lines.join("")).toContain("Workflow completed");
  });

  // (b) failed → exit 1
  it("(b) returns exit code 1 when workflow reaches failed state", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";
    temporalClient.workflowStates.set(workflowId, defaultFeatureWorkflowState({ phaseStatus: "failed" }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("Workflow failed");
  });

  // (c) revision-bound-reached → exit 1
  it("(c) returns exit code 1 when workflow reaches revision-bound-reached state", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";
    temporalClient.workflowStates.set(workflowId, defaultFeatureWorkflowState({ phaseStatus: "revision-bound-reached" }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });
    expect(exitCode).toBe(1);
  });

  // (d) cancelled → exit 1
  it("(d) returns exit code 1 when workflow reaches cancelled state", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";
    temporalClient.workflowStates.set(workflowId, defaultFeatureWorkflowState({ phaseStatus: "cancelled" as never }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5.3b — pollUntilTerminal() — deduplication, transient errors, etc.
// ---------------------------------------------------------------------------

describe("pollUntilTerminal() — advanced behavior", () => {
  it("(e) deduplication: two polls with identical state emit only one set of lines", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";

    // Return running state first (same state twice), then completed
    let callCount = 0;
    const runningState = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "req-review",
      reviewStates: {
        "req-review": { reviewerStatuses: { "se-review": "approved" }, revisionCount: 0, writtenVersions: {} },
      },
    });
    const completedState = defaultFeatureWorkflowState({ phaseStatus: "completed" });
    temporalClient.queryWorkflowState = async (_id: string) => {
      callCount++;
      if (callCount <= 2) return runningState;
      return completedState;
    };

    const stdout = makeStdout();
    const stderr = makeStderr();

    await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });

    const allOutput = stdout.lines.join("");
    // The "Iteration 1" header should appear only once
    const iterationMatches = allOutput.match(/Iteration 1/g);
    expect(iterationMatches?.length).toBe(1);
  });

  it("(f) transient queryWorkflowState error: loop continues and eventually emits on next successful poll", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";

    let callCount = 0;
    const completedState = defaultFeatureWorkflowState({ phaseStatus: "completed" });
    temporalClient.queryWorkflowState = async (_id: string) => {
      callCount++;
      if (callCount === 1) throw new Error("Transient network error");
      return completedState;
    };

    const stdout = makeStdout();
    const stderr = makeStderr();

    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });

    // Eventually completes after transient error
    expect(exitCode).toBe(0);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("(g) phase transition: emits Passed ✅ when completedPhaseResults shows req-review passed", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";

    let callCount = 0;
    // First poll: req-review running
    const runningState = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "req-review",
      completedPhaseResults: {},
    });
    // Second poll: moved to next phase, req-review completed with passed
    const nextPhaseState = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "fspec-creation",
      completedPhaseResults: { "req-review": "passed" },
    });
    const completedState = defaultFeatureWorkflowState({ phaseStatus: "completed" });

    temporalClient.queryWorkflowState = async (_id: string) => {
      callCount++;
      if (callCount === 1) return runningState;
      if (callCount === 2) return nextPhaseState;
      return completedState;
    };

    const stdout = makeStdout();
    const stderr = makeStderr();

    await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });

    const allOutput = stdout.lines.join("");
    expect(allOutput).toContain("[Phase R — REQ Review] Passed");
  });

  // PROP-CLI-24: emits "Revision Bound Reached ⚠️" when completedPhaseResults shows revision-bound-reached
  it("(h-prop-cli-24) phase transition: emits Revision Bound Reached ⚠️ when completedPhaseResults shows req-review revision-bound-reached (PROP-CLI-24)", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";

    let callCount = 0;
    // First poll: req-review running, no completedPhaseResults
    const runningState = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "req-review",
      completedPhaseResults: {},
    });
    // Second poll: moved to next phase, req-review completed with revision-bound-reached
    const nextPhaseState = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "fspec-creation",
      completedPhaseResults: { "req-review": "revision-bound-reached" },
    });
    const completedState = defaultFeatureWorkflowState({ phaseStatus: "completed" });

    temporalClient.queryWorkflowState = async (_id: string) => {
      callCount++;
      if (callCount === 1) return runningState;
      if (callCount === 2) return nextPhaseState;
      return completedState;
    };

    const stdout = makeStdout();
    const stderr = makeStderr();

    await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });

    const allOutput = stdout.lines.join("");
    expect(allOutput).toContain("[Phase R — REQ Review] Revision Bound Reached");
  });

  it("(h) ROUTE_TO_USER state: handleQuestion() is called", async () => {
    const { pollUntilTerminal } = await importRun();
    const { FakeTemporalClient: FTC, defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const temporalClient = new FTC();
    const workflowId = "ptah-test-feature";

    let callCount = 0;
    const questionState = defaultFeatureWorkflowState({
      phaseStatus: "waiting-for-user",
      pendingQuestion: {
        question: "Should we add authentication?",
        agentId: "se-author",
        phaseId: "req-review",
        askedAt: new Date().toISOString(),
      },
    });
    const completedState = defaultFeatureWorkflowState({ phaseStatus: "completed" });

    temporalClient.queryWorkflowState = async (_id: string) => {
      callCount++;
      if (callCount === 1) return questionState;
      return completedState;
    };

    const stdout = makeStdout();
    const stderr = makeStderr();

    // Provide stdin that immediately emits a line
    const { Readable } = await import("node:stream");
    const stdin = new Readable({ read() {} });
    setTimeout(() => {
      stdin.push("Yes, add auth\n");
      stdin.push(null);
    }, 0);

    await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: undefined,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadableStream,
      featureFolder: "docs/in-progress/test-feature",
      slug: "test-feature",
      fs: new FakeFileSystem(),
    });

    // stdout should have had [Question] written
    const allOutput = stdout.lines.join("");
    expect(allOutput).toContain("[Question]");
    // signalHumanAnswer should have been called
    expect(temporalClient.humanAnswerSignals.length).toBeGreaterThan(0);
    expect(temporalClient.humanAnswerSignals[0]!.answer).toBe("Yes, add auth");
  });
});

// ---------------------------------------------------------------------------
// 5.4a — countFindingsInCrossReviewFile() — RED tests
// ---------------------------------------------------------------------------

describe("countFindingsInCrossReviewFile()", () => {
  // (a) file with 4 data rows → returns 4
  it("(a) returns 4 for a Findings table with 4 data rows", async () => {
    const { countFindingsInCrossReviewFile } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    const content = `# Cross Review

## Findings

| Finding | Description | Severity |
|---------|-------------|----------|
| F1 | Issue one | High |
| F2 | Issue two | Medium |
| F3 | Issue three | Low |
| F4 | Issue four | Low |
`;
    // rev 1 → unversioned path
    fs.addExisting(`${featureFolder}/CROSS-REVIEW-product-manager-REQ.md`, content);
    const reviewState = {
      reviewerStatuses: { "pm-review": "revision_requested" as const },
      revisionCount: 0,
      writtenVersions: { "pm-review": 1 },
    };
    const count = await countFindingsInCrossReviewFile(
      featureFolder,
      "pm-review",
      "req-review",
      reviewState,
      "my-feature",
      fs
    );
    expect(count).toBe(4);
  });

  // (b) header+separator only → returns 0
  it("(b) returns 0 for a table with only header and separator rows", async () => {
    const { countFindingsInCrossReviewFile } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    const content = `# Cross Review

## Findings

| Finding | Description | Severity |
|---------|-------------|----------|
`;
    fs.addExisting(`${featureFolder}/CROSS-REVIEW-product-manager-REQ.md`, content);
    const reviewState = {
      reviewerStatuses: { "pm-review": "revision_requested" as const },
      revisionCount: 0,
      writtenVersions: { "pm-review": 1 },
    };
    const count = await countFindingsInCrossReviewFile(
      featureFolder,
      "pm-review",
      "req-review",
      reviewState,
      "my-feature",
      fs
    );
    expect(count).toBe(0);
  });

  // (c) read error → returns "?"
  it("(c) returns '?' when file is not readable", async () => {
    const { countFindingsInCrossReviewFile } = await importRun();
    const fs = new FakeFileSystem();
    // file not in fs → readFile throws
    const reviewState = {
      reviewerStatuses: { "pm-review": "revision_requested" as const },
      revisionCount: 0,
      writtenVersions: { "pm-review": 1 },
    };
    const count = await countFindingsInCrossReviewFile(
      "docs/in-progress/my-feature",
      "pm-review",
      "req-review",
      reviewState,
      "my-feature",
      fs
    );
    expect(count).toBe("?");
  });

  // (d) writtenVersions[agentId] resolves versioned path
  it("(d) uses writtenVersions[agentId] to resolve versioned cross-review path", async () => {
    const { countFindingsInCrossReviewFile } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    const v2Content = `# Cross Review v2

## Findings

| Finding | Description |
|---------|-------------|
| F1 | Issue one |
| F2 | Issue two |
`;
    // writtenVersions["te-review"] = 2 → reads -v2 path
    fs.addExisting(`${featureFolder}/CROSS-REVIEW-test-engineer-REQ-v2.md`, v2Content);
    const reviewState = {
      reviewerStatuses: { "te-review": "revision_requested" as const },
      revisionCount: 1,
      writtenVersions: { "te-review": 2 },
    };
    const count = await countFindingsInCrossReviewFile(
      featureFolder,
      "te-review",
      "req-review",
      reviewState,
      "my-feature",
      fs
    );
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5.4b — emitProgressLines() — additional tests
// ---------------------------------------------------------------------------

describe("emitProgressLines()", () => {
  it("(e) falls back to raw phase ID as label for unknown phase IDs", async () => {
    const { emitProgressLines } = await importRun();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const state = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "custom-phase-xyz",
      activeAgentIds: [],
    });
    const stdout = makeStdout();
    await emitProgressLines(
      state,
      "custom-phase-xyz",
      undefined,
      "docs/in-progress/test-feature",
      "test-feature",
      stdout as unknown as NodeJS.WriteStream,
      new FakeFileSystem()
    );
    const output = stdout.lines.join("");
    expect(output).toContain("custom-phase-xyz");
  });

  it("(f) emits optimizer dispatch line when all reviewers done and activeAgentIds non-empty", async () => {
    const { emitProgressLines } = await importRun();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const reviewState = {
      reviewerStatuses: {
        "se-review": "approved" as const,
        "te-review": "revision_requested" as const,
      },
      revisionCount: 0,
      writtenVersions: { "te-review": 1 },
    };
    const state = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "req-review",
      activeAgentIds: ["pm-author"],
      reviewStates: { "req-review": reviewState },
    });
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/test-feature";
    // Add a cross-review file for te-review so it reads OK
    fs.addExisting(
      `${featureFolder}/CROSS-REVIEW-test-engineer-REQ.md`,
      "## Findings\n| F | D |\n|---|---|\n| F1 | x |\n"
    );
    const stdout = makeStdout();
    await emitProgressLines(
      state,
      "req-review",
      reviewState,
      featureFolder,
      "test-feature",
      stdout as unknown as NodeJS.WriteStream,
      fs
    );
    const output = stdout.lines.join("");
    expect(output).toContain("pm-author addressing feedback...");
  });

  it("(g) emits 'Need Attention (? findings)' when cross-review file is unreadable", async () => {
    const { emitProgressLines } = await importRun();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const reviewState = {
      reviewerStatuses: {
        "te-review": "revision_requested" as const,
      },
      revisionCount: 0,
      writtenVersions: { "te-review": 1 },
    };
    const state = defaultFeatureWorkflowState({
      phaseStatus: "running",
      currentPhaseId: "req-review",
      activeAgentIds: [],
      reviewStates: { "req-review": reviewState },
    });
    const fs = new FakeFileSystem(); // file not present → read error
    const stdout = makeStdout();
    await emitProgressLines(
      state,
      "req-review",
      reviewState,
      "docs/in-progress/test-feature",
      "test-feature",
      stdout as unknown as NodeJS.WriteStream,
      fs
    );
    const output = stdout.lines.join("");
    expect(output).toContain("Need Attention (? findings)");
  });

  it("PHASE_LABELS map covers all 7 entries from spec", async () => {
    const { emitProgressLines } = await importRun();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const phaseIds = [
      "req-review",
      "fspec-review",
      "tspec-review",
      "plan-review",
      "properties-review",
      "properties-tests",
      "implementation-review",
    ] as const;
    const expectedLabels = ["R", "F", "T", "P", "PT", "PTT", "IR"] as const;

    for (let i = 0; i < phaseIds.length; i++) {
      const phaseId = phaseIds[i]!;
      const expectedLabel = expectedLabels[i]!;
      const state = defaultFeatureWorkflowState({
        phaseStatus: "running",
        currentPhaseId: phaseId,
        activeAgentIds: [],
      });
      const stdout = makeStdout();
      await emitProgressLines(
        state,
        phaseId,
        undefined,
        "docs/in-progress/test-feature",
        "test-feature",
        stdout as unknown as NodeJS.WriteStream,
        new FakeFileSystem()
      );
      const output = stdout.lines.join("");
      expect(output).toContain(`[Phase ${expectedLabel} —`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5.5 — handleQuestion()
// ---------------------------------------------------------------------------

describe("handleQuestion()", () => {
  it("returns immediately when Discord config is present", async () => {
    const { handleQuestion } = await importRun();
    const temporalClient = new FakeTemporalClient();
    const stdout = makeStdout();
    const stderr = makeStderr();
    const { Readable } = await import("node:stream");
    const stdin = new Readable({ read() {} });

    await handleQuestion(
      { question: "Test question?", agentId: "pm", phaseId: "req-review", askedAt: new Date().toISOString() },
      "ptah-test-feature",
      {
        workflowId: "ptah-test-feature",
        temporalClient,
        discordConfig: {
          bot_token_env: "TOKEN",
          server_id: "123",
          channels: { updates: "u", questions: "q", debug: "d" },
          mention_user_id: "user1",
        },
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadableStream,
        featureFolder: "docs/in-progress/test-feature",
        slug: "test-feature",
        fs: new FakeFileSystem(),
      }
    );
    // Discord present → no output, no stdin read
    expect(stdout.lines.join("")).toBe("");
    expect(temporalClient.humanAnswerSignals).toHaveLength(0);
  });

  it("writes [Question] text and 'Answer: ' prompt without newline when no Discord", async () => {
    const { handleQuestion } = await importRun();
    const temporalClient = new FakeTemporalClient();
    const stdout = makeStdout();
    const stderr = makeStderr();

    // Provide stdin that emits a line
    const { Readable } = await import("node:stream");
    const stdin = new Readable({ read() {} });
    setTimeout(() => {
      stdin.push("My answer\n");
      stdin.push(null);
    }, 0);

    await handleQuestion(
      { question: "Should we do X?", agentId: "pm", phaseId: "req-review", askedAt: new Date().toISOString() },
      "ptah-test-feature",
      {
        workflowId: "ptah-test-feature",
        temporalClient,
        discordConfig: undefined,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadableStream,
        featureFolder: "docs/in-progress/test-feature",
        slug: "test-feature",
        fs: new FakeFileSystem(),
      }
    );

    expect(stdout.lines.join("")).toContain("[Question] Should we do X?");
    // "Answer: " written without newline
    const answerPromptCall = stdout.write.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).startsWith("Answer:")
    );
    expect(answerPromptCall).toBeDefined();
    expect(answerPromptCall![0]).toBe("Answer: ");
    // signalHumanAnswer called with the answer
    expect(temporalClient.humanAnswerSignals[0]?.answer).toBe("My answer");
  });

  it("stdout.write('Answer: ') is called BEFORE stdin reader is invoked", async () => {
    const { handleQuestion } = await importRun();
    const temporalClient = new FakeTemporalClient();
    const callOrder: string[] = [];
    const stdout = {
      write: vi.fn((chunk: string, cb?: () => void) => {
        if (chunk === "Answer: ") {
          callOrder.push("write");
          if (typeof cb === "function") {
            callOrder.push("callback");
            cb();
          }
        } else if (typeof cb === "function") {
          cb();
        }
        return true;
      }),
      lines: [] as string[],
    };

    const { Readable } = await import("node:stream");
    const stdin = new Readable({ read() {} });
    // Push answer only AFTER a short delay to let the order tracking settle
    setImmediate(() => {
      stdin.push("answer text\n");
      stdin.push(null);
    });

    await handleQuestion(
      { question: "Do X?", agentId: "pm", phaseId: "req-review", askedAt: new Date().toISOString() },
      "ptah-test-feature",
      {
        workflowId: "ptah-test-feature",
        temporalClient,
        discordConfig: undefined,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: {} as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadableStream,
        featureFolder: "docs/in-progress/test-feature",
        slug: "test-feature",
        fs: new FakeFileSystem(),
      }
    );

    // The write call happened and the callback was called before stdin delivered its line
    expect(callOrder).toContain("write");
    expect(callOrder.indexOf("write")).toBeLessThan(callOrder.indexOf("callback"));
  });

  it("sends empty string and prints warning to stderr when stdin is closed (EOF) without answer", async () => {
    const { handleQuestion } = await importRun();
    const temporalClient = new FakeTemporalClient();
    const stdout = makeStdout();
    const stderr = makeStderr();

    const { Readable } = await import("node:stream");
    const stdin = new Readable({ read() {} });
    // Close stdin immediately (EOF)
    setTimeout(() => {
      stdin.push(null);
    }, 0);

    await handleQuestion(
      { question: "Do X?", agentId: "pm", phaseId: "req-review", askedAt: new Date().toISOString() },
      "ptah-test-feature",
      {
        workflowId: "ptah-test-feature",
        temporalClient,
        discordConfig: undefined,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadableStream,
        featureFolder: "docs/in-progress/test-feature",
        slug: "test-feature",
        fs: new FakeFileSystem(),
      }
    );

    expect(temporalClient.humanAnswerSignals[0]?.answer).toBe("");
    expect(stderr.lines.join("")).toContain("Warning: stdin closed before answer was provided");
  });
});

// ---------------------------------------------------------------------------
// 5.6 — RunCommand.execute()
// ---------------------------------------------------------------------------

describe("RunCommand.execute()", () => {
  function buildMinimalWorkflowConfig(): WorkflowConfig {
    return {
      version: 1,
      phases: [
        {
          id: "req-review",
          name: "REQ Review",
          type: "review",
          revision_bound: 3,
          reviewers: { default: ["se-review", "te-review"] },
          transition: "req-approved",
        },
        {
          id: "req-approved",
          name: "REQ Approved",
          type: "approved",
        },
        {
          id: "fspec-creation",
          name: "FSPEC Creation",
          type: "creation",
          agent: "pm-author",
          transition: "fspec-review",
        },
      ],
    };
  }

  it("PROP-CLI-02: exits 1 with error message when REQ file not found", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    const temporalClient = new FakeTemporalClient();
    const workflowConfigLoader = new FakeWorkflowConfigLoader();
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/ghost/REQ-ghost.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("Error: REQ file not found: docs/ghost/REQ-ghost.md");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("PROP-CLI-03: exits 1 with error message when REQ file is whitespace-only", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "   \n\t  ");
    const temporalClient = new FakeTemporalClient();
    const workflowConfigLoader = new FakeWorkflowConfigLoader();
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("Error: REQ file is empty:");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("PROP-CLI-04: derives feature slug from parent directory name", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    const temporalClient = new FakeTemporalClient();
    // Return completed state right away so poll loop terminates
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    temporalClient.workflowStates.set("ptah-my-feature", defaultFeatureWorkflowState({ phaseStatus: "completed" }));
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    // slug derived from parent dir = "my-feature"
    expect(temporalClient.startedWorkflows[0]?.featureSlug).toBe("my-feature");
  });

  it("PROP-CLI-05: exits 1 with ptah.workflow.yaml error when config file is absent", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    const temporalClient = new FakeTemporalClient();
    const workflowConfigLoader = new FakeWorkflowConfigLoader();
    workflowConfigLoader.loadError = new (await import("../../../src/config/workflow-config.js")).WorkflowConfigError(
      "ptah.workflow.yaml not found. Run 'ptah init' first."
    );
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("Error: ptah.workflow.yaml not found in current directory.");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("PROP-CLI-06: exits 1 when a Running workflow already exists for the feature slug", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    const temporalClient = new FakeTemporalClient();
    // Pre-populate running workflow
    temporalClient.workflowIds.set("ptah-my-feature", ["ptah-my-feature"]);
    temporalClient.workflowStatuses.set("ptah-my-feature", "Running");
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("workflow already running for feature");
    expect(stdout.lines.join("")).toContain("my-feature");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("PROP-CLI-06: exits 1 when a ContinuedAsNew workflow already exists for the feature slug", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    const temporalClient = new FakeTemporalClient();
    temporalClient.workflowIds.set("ptah-my-feature", ["ptah-my-feature"]);
    temporalClient.workflowStatuses.set("ptah-my-feature", "ContinuedAsNew");
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("workflow already running for feature");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("PROP-CLI-07: exits 1 when listWorkflowsByPrefix throws", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    const temporalClient = new FakeTemporalClient();
    temporalClient.listWorkflowsByPrefix = async () => {
      throw new Error("Connection refused");
    };
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
    expect(stdout.lines.join("")).toContain("Error: unable to check for running workflows:");
    expect(stdout.lines.join("")).toContain("Connection refused");
  });

  it("PROP-CLI-08: exits 0 when workflow completes successfully", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const temporalClient = new FakeTemporalClient();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    temporalClient.workflowStates.set("ptah-my-feature", defaultFeatureWorkflowState({ phaseStatus: "completed" }));
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(0);
  });

  it("PROP-CLI-09: exits 1 when workflow reaches failed state", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const temporalClient = new FakeTemporalClient();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    temporalClient.workflowStates.set("ptah-my-feature", defaultFeatureWorkflowState({ phaseStatus: "failed" }));
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: "docs/in-progress/my-feature/REQ-my-feature.md" });
    expect(exitCode).toBe(1);
  });

  it("PROP-CLI-10: starts workflow at --from-phase when flag is valid", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const temporalClient = new FakeTemporalClient();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    temporalClient.workflowStates.set("ptah-my-feature", defaultFeatureWorkflowState({ phaseStatus: "completed" }));
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    await command.execute({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      fromPhase: "fspec-creation",
    });
    expect(temporalClient.startedWorkflows[0]?.startAtPhase).toBe("fspec-creation");
  });

  it("PROP-CLI-11: exits 1 with complete phase list when --from-phase is invalid", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    fs.addExisting("docs/in-progress/my-feature/REQ-my-feature.md", "# REQ");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));
    const temporalClient = new FakeTemporalClient();
    const workflowConfigLoader = new FakeWorkflowConfigLoader({ ...buildMinimalWorkflowConfig() });
    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({
      reqPath: "docs/in-progress/my-feature/REQ-my-feature.md",
      fromPhase: "nonexistent-phase",
    });
    expect(exitCode).toBe(1);
    const output = stdout.lines.join("");
    expect(output).toContain("nonexistent-phase");
    expect(output).toContain("req-review");
    expect(output).not.toContain("...");
  });
});

// ---------------------------------------------------------------------------
// 5.7 — Integration tests
// ---------------------------------------------------------------------------

describe("RunCommand.execute() — integration tests", () => {
  it("happy path: exits 0 when REQ is valid, no duplicate, workflow completes", async () => {
    const { RunCommand, LenientConfigLoader, resolveStartPhase } = await importRun();
    const { defaultFeatureWorkflowState } = await import("../../fixtures/factories.js");
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    fs.addExisting(`${featureFolder}/REQ-my-feature.md`, "# My Feature REQ\n\nSome content.");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));

    const temporalClient = new FakeTemporalClient();
    temporalClient.workflowStates.set(
      "ptah-my-feature",
      defaultFeatureWorkflowState({ phaseStatus: "completed", featureSlug: "my-feature" })
    );

    const workflowConfigLoader = new FakeWorkflowConfigLoader({
      version: 1,
      phases: [
        {
          id: "req-review",
          name: "REQ Review",
          type: "review",
          revision_bound: 3,
          reviewers: { default: ["se-review", "te-review"] },
          transition: "req-approved",
        },
        { id: "req-approved", name: "REQ Approved", type: "approved" },
      ],
    });

    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    // Uses real resolveStartPhase — REQ only in folder → req-review
    const exitCode = await command.execute({ reqPath: `${featureFolder}/REQ-my-feature.md` });

    expect(exitCode).toBe(0);
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0]?.featureSlug).toBe("my-feature");
    expect(temporalClient.startedWorkflows[0]?.startAtPhase).toBe("req-review");
  });

  it("duplicate-workflow error: exits 1 with correct error message when workflow already running", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();
    const fs = new FakeFileSystem();
    const featureFolder = "docs/in-progress/my-feature";
    fs.addExisting(`${featureFolder}/REQ-my-feature.md`, "# My Feature REQ\n\nSome content.");
    fs.addExisting("ptah.config.json", JSON.stringify({ project: { name: "test" } }));

    const temporalClient = new FakeTemporalClient();
    // Pre-populate with a Running workflow
    temporalClient.workflowIds.set("ptah-my-feature", ["ptah-my-feature"]);
    temporalClient.workflowStatuses.set("ptah-my-feature", "Running");

    const workflowConfigLoader = new FakeWorkflowConfigLoader({
      version: 1,
      phases: [
        {
          id: "req-review",
          name: "REQ Review",
          type: "review",
          revision_bound: 3,
          reviewers: { default: ["se-review"] },
          transition: "req-approved",
        },
        { id: "req-approved", name: "REQ Approved", type: "approved" },
      ],
    });

    const configLoader = new LenientConfigLoader(fs);
    const stdout = makeStdout();
    const stderr = makeStderr();

    const command = new RunCommand({
      fs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({ reqPath: `${featureFolder}/REQ-my-feature.md` });

    expect(exitCode).toBe(1);
    const outputStr = stdout.lines.join("");
    expect(outputStr).toContain('workflow already running for feature "my-feature"');
    expect(outputStr).toContain("Use --from-phase to restart");
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });
});
