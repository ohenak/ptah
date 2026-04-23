/**
 * Integration tests for PROP-BC-01: backward compatibility with old 3-agent config.
 *
 * Verifies that ptah run (via RunCommand) continues to operate correctly when
 * given an old-format ptah.config.json (pm, eng, qa agents) and an old-format
 * ptah.workflow.yaml (no new phases, no artifact.exists conditions, revision_bound: 3).
 *
 * Uses FakeFileSystem and FakeTemporalClient to isolate from real infrastructure
 * while exercising the full RunCommand logic path.
 */

import { describe, it, expect, vi } from "vitest";
import { FakeFileSystem, FakeTemporalClient, FakeWorkflowConfigLoader, defaultFeatureWorkflowState } from "../../fixtures/factories.js";

async function importRun() {
  const mod = await import("../../../src/commands/run.js");
  return mod;
}

function makeOutStream(): { write: ReturnType<typeof vi.fn>; lines: string[] } {
  const lines: string[] = [];
  const write = vi.fn((chunk: string, cb?: () => void) => {
    lines.push(chunk);
    if (typeof cb === "function") cb();
    return true;
  });
  return { write, lines };
}

// PROP-BC-01: Old 3-agent config backward compatibility
describe("PROP-BC-01: backward compatibility with old 3-agent config (pm, eng, qa)", () => {
  it("RunCommand.execute() succeeds with old ptah.config.json (pm/eng/qa) and old-format ptah.workflow.yaml", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();

    // Old ptah.config.json: 3 agents (pm, eng, qa), no temporal section, no discord
    const oldConfigJson = JSON.stringify({
      project: { name: "legacy-project" },
      agents: {
        active: ["pm", "eng", "qa"],
        skills: {
          pm: "./skills/pm.md",
          eng: "./skills/eng.md",
          qa: "./skills/qa.md",
        },
      },
    });

    // Old ptah.workflow.yaml: no new phases, no artifact.exists conditions, revision_bound: 3
    const oldWorkflowConfig = {
      version: 1,
      phases: [
        {
          id: "req-creation",
          name: "REQ Creation",
          type: "creation" as const,
          agent: "pm",
          transition: "req-review",
        },
        {
          id: "req-review",
          name: "REQ Review",
          type: "review" as const,
          revision_bound: 3,
          reviewers: { default: ["eng", "qa"] },
          transition: "req-approved",
        },
        {
          id: "req-approved",
          name: "REQ Approved",
          type: "approved" as const,
        },
        {
          id: "implementation",
          name: "Implementation",
          type: "implementation" as const,
          agent: "eng",
          transition: "implementation-review",
        },
        {
          id: "implementation-review",
          name: "Implementation Review",
          type: "review" as const,
          revision_bound: 3,
          reviewers: { default: ["pm", "qa"] },
        },
      ],
    };

    const fakeFs = new FakeFileSystem();
    // REQ file
    fakeFs.addExisting(
      "docs/in-progress/legacy-feature/REQ-legacy-feature.md",
      "# REQ Legacy Feature\n\nThis is the REQ document."
    );
    // ptah.config.json (old 3-agent format)
    fakeFs.addExisting("ptah.config.json", oldConfigJson);

    const temporalClient = new FakeTemporalClient();
    // Pre-set the workflow state to completed so poll loop terminates immediately
    temporalClient.workflowStates.set(
      "ptah-legacy-feature",
      defaultFeatureWorkflowState({ phaseStatus: "completed", featureSlug: "legacy-feature" })
    );

    const workflowConfigLoader = new FakeWorkflowConfigLoader(oldWorkflowConfig);
    const configLoader = new LenientConfigLoader(fakeFs);

    const stdout = makeOutStream();
    const stderr = makeOutStream();

    const command = new RunCommand({
      fs: fakeFs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    const exitCode = await command.execute({
      reqPath: "docs/in-progress/legacy-feature/REQ-legacy-feature.md",
    });

    // Must start successfully and exit 0
    expect(exitCode).toBe(0);
    // Must have started exactly one workflow
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    // Slug derived correctly from old-format feature folder
    expect(temporalClient.startedWorkflows[0]?.featureSlug).toBe("legacy-feature");
    // No error output
    const errOutput = stderr.lines.join("");
    expect(errOutput).not.toContain("Error:");
  });

  it("RunCommand.execute() correctly derives startAtPhase=req-review for old config with only REQ present", async () => {
    const { RunCommand, LenientConfigLoader } = await importRun();

    const fakeFs = new FakeFileSystem();
    fakeFs.addExisting(
      "docs/in-progress/legacy-feature/REQ-legacy-feature.md",
      "# REQ Legacy Feature\n\nContent here."
    );
    fakeFs.addExisting("ptah.config.json", JSON.stringify({
      project: { name: "legacy-project" },
      agents: { active: ["pm", "eng", "qa"], skills: {} },
    }));

    const temporalClient = new FakeTemporalClient();
    temporalClient.workflowStates.set(
      "ptah-legacy-feature",
      defaultFeatureWorkflowState({ phaseStatus: "completed", featureSlug: "legacy-feature" })
    );

    const workflowConfigLoader = new FakeWorkflowConfigLoader({
      version: 1,
      phases: [
        { id: "req-creation", name: "REQ Creation", type: "creation" as const, agent: "pm", transition: "req-review" },
        {
          id: "req-review",
          name: "REQ Review",
          type: "review" as const,
          revision_bound: 3,
          reviewers: { default: ["eng", "qa"] },
        },
      ],
    });

    const configLoader = new LenientConfigLoader(fakeFs);
    const stdout = makeOutStream();
    const stderr = makeOutStream();

    const command = new RunCommand({
      fs: fakeFs,
      temporalClient,
      workflowConfigLoader,
      configLoader,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadableStream,
    });

    await command.execute({ reqPath: "docs/in-progress/legacy-feature/REQ-legacy-feature.md" });

    // Auto-detection: only REQ present → startAtPhase = req-review (first phase after REQ)
    expect(temporalClient.startedWorkflows[0]?.startAtPhase).toBe("req-review");
  });

  it("workflow validator accepts old-format ptah.workflow.yaml with revision_bound: 3 and no artifact.exists conditions", async () => {
    // Verify that the DefaultWorkflowValidator passes the old config without errors
    const { DefaultWorkflowValidator } = await import("../../../src/config/workflow-validator.js");
    const { DefaultAgentRegistry } = await import("../../../src/orchestrator/agent-registry.js");

    const validator = new DefaultWorkflowValidator();
    const oldWorkflowConfig = {
      version: 1,
      phases: [
        { id: "req-creation", name: "REQ", type: "creation" as const, agent: "pm", transition: "req-review" },
        {
          id: "req-review",
          name: "REQ Review",
          type: "review" as const,
          revision_bound: 3,
          reviewers: { default: ["eng", "qa"] },
        },
        {
          id: "implementation-review",
          name: "IR",
          type: "review" as const,
          revision_bound: 3,
          reviewers: { default: ["pm", "qa"] },
        },
      ],
    };

    // Build a minimal agent registry with the old agents
    const agentRegistry = new DefaultAgentRegistry([
      { id: "pm", name: "PM", skillPath: "./pm.md" },
      { id: "eng", name: "Engineer", skillPath: "./eng.md" },
      { id: "qa", name: "QA", skillPath: "./qa.md" },
    ]);

    const result = validator.validate(oldWorkflowConfig as never, agentRegistry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
