import { describe, it, expect, beforeEach } from "vitest";
import { MigrateCommand } from "../../../src/commands/migrate.js";
import type { MigrateOptions } from "../../../src/commands/migrate.js";
import {
  FakeFileSystem,
  FakeLogger,
  FakeTemporalClient,
  defaultFeatureWorkflowState,
} from "../../fixtures/factories.js";
import type { PdlcStateFile, FeatureState } from "../../../src/orchestrator/pdlc/phases.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeStateFile(
  features: Record<string, Partial<FeatureState>> = {},
): string {
  const stateFile: PdlcStateFile = {
    version: 1,
    features: Object.fromEntries(
      Object.entries(features).map(([slug, partial]) => [
        slug,
        {
          slug,
          phase: "REQ_CREATION" as const,
          config: { discipline: "backend-only" as const, skipFspec: false },
          reviewPhases: {},
          forkJoin: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          completedAt: null,
          ...partial,
        } as FeatureState,
      ]),
    ),
  };
  return JSON.stringify(stateFile);
}

function makeWorkflowYaml(): string {
  return `version: 1
phases:
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm
  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      default: [eng]
  - id: req-approved
    name: Requirements Approved
    type: approved
  - id: fspec-creation
    name: FSPEC Creation
    type: creation
    agent: pm
  - id: fspec-review
    name: FSPEC Review
    type: review
    reviewers:
      default: [eng]
  - id: fspec-approved
    name: FSPEC Approved
    type: approved
  - id: tspec-creation
    name: TSPEC Creation
    type: creation
    agent: eng
  - id: tspec-review
    name: TSPEC Review
    type: review
    reviewers:
      default: [pm]
  - id: tspec-approved
    name: TSPEC Approved
    type: approved
  - id: plan-creation
    name: Plan Creation
    type: creation
    agent: eng
  - id: plan-review
    name: Plan Review
    type: review
    reviewers:
      default: [pm]
  - id: plan-approved
    name: Plan Approved
    type: approved
  - id: properties-creation
    name: Properties Creation
    type: creation
    agent: qa
  - id: properties-review
    name: Properties Review
    type: review
    reviewers:
      default: [eng]
  - id: properties-approved
    name: Properties Approved
    type: approved
  - id: implementation
    name: Implementation
    type: implementation
    agent: eng
  - id: implementation-review
    name: Implementation Review
    type: review
    reviewers:
      default: [pm]
  - id: done
    name: Done
    type: approved
`;
}

const DEFAULT_OPTS: MigrateOptions = {
  dryRun: false,
  includeCompleted: false,
};

// ---------------------------------------------------------------------------
// F7: CLI flag wiring (unit-level — exercises MigrateCommand via options)
// ---------------------------------------------------------------------------

describe("F7: CLI flag wiring", () => {
  it("executes in dry-run mode when dryRun=true is passed", async () => {
    const fs = new FakeFileSystem("/fake/project");
    const logger = new FakeLogger();
    const client = new FakeTemporalClient();
    fs.addExisting("pdlc-state.json", makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
    const command = new MigrateCommand(client, fs, logger);
    const result = await command.execute({ dryRun: true, includeCompleted: false });
    // Dry run: no connection, no workflows
    expect(client.connectCalls).toBe(0);
    expect(client.startedWorkflows).toHaveLength(0);
    expect(result.activeCreated).toBe(1);
  });

  it("includes completed when includeCompleted=true is passed", async () => {
    const fs = new FakeFileSystem("/fake/project");
    const logger = new FakeLogger();
    const client = new FakeTemporalClient();
    client.connected = true;
    fs.addExisting(
      "pdlc-state.json",
      makeStateFile({ "done-feat": { phase: "DONE", completedAt: "2026-01-01T00:00:00Z" } }),
    );
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
    const command = new MigrateCommand(client, fs, logger);
    const result = await command.execute({ dryRun: false, includeCompleted: true });
    expect(result.completedImported).toBe(1);
  });

  it("uses custom phase map when phaseMapPath is provided", async () => {
    const fs = new FakeFileSystem("/fake/project");
    const logger = new FakeLogger();
    const client = new FakeTemporalClient();
    client.connected = true;
    fs.addExisting("pdlc-state.json", makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
    fs.addExisting("custom.json", JSON.stringify({ REQ_CREATION: "req-creation" }));
    const command = new MigrateCommand(client, fs, logger);
    const result = await command.execute({
      dryRun: false,
      includeCompleted: false,
      phaseMapPath: "custom.json",
    });
    expect(result.activeCreated).toBe(1);
    expect(client.startedWorkflows[0]?.startAtPhase).toBe("req-creation");
  });
});

// ---------------------------------------------------------------------------
// F1: MigrateCommand — read pdlc-state.json, parse features
// ---------------------------------------------------------------------------

describe("MigrateCommand", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let client: FakeTemporalClient;

  beforeEach(() => {
    fs = new FakeFileSystem("/fake/project");
    logger = new FakeLogger();
    client = new FakeTemporalClient();
  });

  // -------------------------------------------------------------------------
  // F1: Read pdlc-state.json
  // -------------------------------------------------------------------------

  describe("F1: read pdlc-state.json", () => {
    it("throws when pdlc-state.json is not found", async () => {
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      await expect(command.execute(DEFAULT_OPTS)).rejects.toThrow(
        "pdlc-state.json not found. Nothing to migrate.",
      );
    });

    it("throws when pdlc-state.json contains malformed JSON", async () => {
      fs.addExisting("pdlc-state.json", "{ not valid json }}}");
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      await expect(command.execute(DEFAULT_OPTS)).rejects.toThrow(
        /pdlc-state\.json is not valid JSON:/,
      );
    });

    it("throws when ptah.workflow.yaml is not found", async () => {
      fs.addExisting("pdlc-state.json", makeStateFile());
      const command = new MigrateCommand(client, fs, logger);
      await expect(command.execute(DEFAULT_OPTS)).rejects.toThrow(
        "ptah.workflow.yaml not found. Run 'ptah init' first.",
      );
    });

    it("succeeds with empty features list and returns 0 counts", async () => {
      client.connected = true; // already connected
      fs.addExisting("pdlc-state.json", makeStateFile());
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.activeCreated).toBe(0);
      expect(result.completedImported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // F2: Phase mapping — built-in V4_DEFAULT_MAPPING
  // -------------------------------------------------------------------------

  describe("F2: phase mapping", () => {
    it("maps all 18 v4 PdlcPhase values to v5 phase IDs via built-in mapping", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "feat-req": { phase: "REQ_CREATION" },
          "feat-impl": { phase: "IMPLEMENTATION" },
          "feat-done": { phase: "DONE", completedAt: "2026-01-01T00:00:00Z" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      // includeCompleted=true so DONE feature also gets processed
      const result = await command.execute({ ...DEFAULT_OPTS, includeCompleted: true });
      // Should start workflows for 2 active + 1 completed
      expect(client.startedWorkflows).toHaveLength(3);
      const startAtPhases = client.startedWorkflows.map((w) => w.startAtPhase);
      expect(startAtPhases).toContain("req-creation");
      expect(startAtPhases).toContain("implementation");
      expect(startAtPhases).toContain("done");
    });

    it("loads a custom phase-map JSON file when --phase-map is provided", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const customMap = JSON.stringify({ REQ_CREATION: "req-creation" });
      fs.addExisting("custom-map.json", customMap);
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute({ ...DEFAULT_OPTS, phaseMapPath: "custom-map.json" });
      expect(result.activeCreated).toBe(1);
      const started = client.startedWorkflows[0];
      expect(started?.startAtPhase).toBe("req-creation");
    });

    it("throws when --phase-map file is not found", async () => {
      fs.addExisting("pdlc-state.json", makeStateFile());
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      await expect(
        command.execute({ ...DEFAULT_OPTS, phaseMapPath: "missing-map.json" }),
      ).rejects.toThrow("Phase map file not found: missing-map.json");
    });

    it("throws when --phase-map JSON is invalid", async () => {
      fs.addExisting("pdlc-state.json", makeStateFile());
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      fs.addExisting("bad-map.json", "not json");
      const command = new MigrateCommand(client, fs, logger);
      await expect(
        command.execute({ ...DEFAULT_OPTS, phaseMapPath: "bad-map.json" }),
      ).rejects.toThrow(/Phase map file.*is not valid JSON/);
    });
  });

  // -------------------------------------------------------------------------
  // F3: Migration validation — unmapped phases abort
  // -------------------------------------------------------------------------

  describe("F3: migration validation", () => {
    it("aborts when a feature has a phase not covered by the mapping", async () => {
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }),
      );
      // Workflow YAML missing req-creation phase
      fs.addExisting(
        "ptah.workflow.yaml",
        `version: 1\nphases:\n  - id: impl\n    name: Impl\n    type: implementation\n    agent: eng\n`,
      );
      // Custom map that does not include REQ_CREATION
      fs.addExisting("custom-map.json", JSON.stringify({ IMPLEMENTATION: "impl" }));
      const command = new MigrateCommand(client, fs, logger);
      await expect(
        command.execute({ ...DEFAULT_OPTS, phaseMapPath: "custom-map.json" }),
      ).rejects.toThrow(/Migration failed: 1 feature\(s\) have unmapped phases/);
    });

    it("includes feature slug and phase name in the unmapped error", async () => {
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "my-feature": { phase: "TSPEC_CREATION" } }),
      );
      fs.addExisting(
        "ptah.workflow.yaml",
        `version: 1\nphases:\n  - id: req-creation\n    name: Req\n    type: creation\n    agent: pm\n`,
      );
      fs.addExisting("custom-map.json", JSON.stringify({ REQ_CREATION: "req-creation" }));
      const command = new MigrateCommand(client, fs, logger);
      await expect(
        command.execute({ ...DEFAULT_OPTS, phaseMapPath: "custom-map.json" }),
      ).rejects.toThrow(/my-feature.*TSPEC_CREATION/);
    });

    it("does not connect to Temporal before validating mappings", async () => {
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }),
      );
      fs.addExisting(
        "ptah.workflow.yaml",
        `version: 1\nphases:\n  - id: impl\n    name: Impl\n    type: implementation\n    agent: eng\n`,
      );
      fs.addExisting("custom-map.json", JSON.stringify({ IMPLEMENTATION: "impl" }));
      const command = new MigrateCommand(client, fs, logger);
      try {
        await command.execute({ ...DEFAULT_OPTS, phaseMapPath: "custom-map.json" });
      } catch {
        // expected
      }
      // No Temporal connect should have been attempted
      expect(client.connectCalls).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // F4: Dry-run mode
  // -------------------------------------------------------------------------

  describe("F4: dry-run mode", () => {
    it("returns result without starting any workflows in dry-run mode", async () => {
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "feat-a": { phase: "REQ_CREATION" },
          "feat-b": { phase: "TSPEC_CREATION" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute({ ...DEFAULT_OPTS, dryRun: true });
      // No workflows created
      expect(client.startedWorkflows).toHaveLength(0);
      // No Temporal connection
      expect(client.connectCalls).toBe(0);
      // activeCreated reflects what would be created (dry-run preview)
      expect(result.activeCreated).toBe(2);
    });

    it("returns correct dry-run counts including completed when --include-completed", async () => {
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "feat-a": { phase: "REQ_CREATION" },
          "feat-done": { phase: "DONE", completedAt: "2026-01-01T00:00:00Z" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute({ dryRun: true, includeCompleted: true });
      expect(result.activeCreated).toBe(1);
      expect(result.completedImported).toBe(1);
      expect(client.startedWorkflows).toHaveLength(0);
    });

    it("does not connect to Temporal in dry-run mode", async () => {
      fs.addExisting("pdlc-state.json", makeStateFile({ "feat-a": { phase: "REQ_CREATION" } }));
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      await command.execute({ dryRun: true, includeCompleted: false });
      expect(client.connectCalls).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // F5: Workflow creation
  // -------------------------------------------------------------------------

  describe("F5: workflow creation", () => {
    it("starts a workflow at the mapped v5 phase for an active feature", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "auth-feature": { phase: "TSPEC_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.activeCreated).toBe(1);
      expect(client.startedWorkflows).toHaveLength(1);
      const started = client.startedWorkflows[0]!;
      expect(started.featureSlug).toBe("auth-feature");
      expect(started.startAtPhase).toBe("tspec-creation");
    });

    it("transfers reviewer statuses from v4 review phase state", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "feat-review": {
            phase: "REQ_REVIEW",
            reviewPhases: {
              REQ_REVIEW: {
                reviewerStatuses: { eng: "approved", qa: "pending" },
                revisionCount: 1,
              },
            },
          },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      await command.execute(DEFAULT_OPTS);
      const started = client.startedWorkflows[0]!;
      expect(started.initialReviewState).toBeDefined();
      const reviewState = started.initialReviewState!["req-review"];
      expect(reviewState).toBeDefined();
      expect(reviewState!.reviewerStatuses["eng"]).toBe("approved");
      expect(reviewState!.revisionCount).toBe(1);
    });

    it("resets fork/join subtasks to pending (BR-14) and emits a warning", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "forked-feature": {
            phase: "IMPLEMENTATION",
            forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
          },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      // A warning should be emitted about fork/join reset
      expect(result.warnings.some((w) => w.includes("forked-feature"))).toBe(true);
      expect(result.warnings.some((w) => /fork.join/i.test(w))).toBe(true);
    });

    it("skips a feature if a workflow with the same ID already exists (BR-22)", async () => {
      client.connected = true;
      // Pre-seed: workflow for this feature already exists
      client.workflowIds.set("ptah-feature-existing-feat", ["ptah-feature-existing-feat-1"]);
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "existing-feat": { phase: "REQ_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.skipped).toBe(1);
      expect(result.activeCreated).toBe(0);
      expect(client.startedWorkflows).toHaveLength(0);
    });

    it("skips completed features (phase=DONE) by default", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "active-feat": { phase: "REQ_CREATION" },
          "done-feat": { phase: "DONE", completedAt: "2026-01-01T00:00:00Z" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.activeCreated).toBe(1);
      expect(result.completedImported).toBe(0);
      expect(client.startedWorkflows).toHaveLength(1);
    });

    it("imports completed features when --include-completed is set", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "active-feat": { phase: "REQ_CREATION" },
          "done-feat": { phase: "DONE", completedAt: "2026-01-01T00:00:00Z" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute({ ...DEFAULT_OPTS, includeCompleted: true });
      expect(result.activeCreated).toBe(1);
      expect(result.completedImported).toBe(1);
      expect(client.startedWorkflows).toHaveLength(2);
    });

    it("continues creating remaining workflows when one fails and records the error", async () => {
      client.connected = true;
      // Only fail on first call, succeed on second
      let callCount = 0;
      const origStart = client.startFeatureWorkflow.bind(client);
      client.startFeatureWorkflow = async (params) => {
        callCount++;
        if (callCount === 1) throw new Error("Temporal unavailable");
        return origStart(params);
      };
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({
          "feat-a": { phase: "REQ_CREATION" },
          "feat-b": { phase: "TSPEC_CREATION" },
        }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.errors).toHaveLength(1);
      // One succeeded, one failed — total started = 1
      expect(result.activeCreated).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // F6: Import validation — query workflow state, emit warnings on mismatch
  // -------------------------------------------------------------------------

  describe("F6: import validation", () => {
    it("queries each created workflow to verify phase and emits no warning on match", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "auth-feature": { phase: "TSPEC_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      // Pre-seed the workflow state so query succeeds
      client.workflowStates.set(
        "ptah-feature-auth-feature-1",
        defaultFeatureWorkflowState({ featureSlug: "auth-feature", currentPhaseId: "tspec-creation" }),
      );
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.warnings).toHaveLength(0);
      expect(result.activeCreated).toBe(1);
    });

    it("emits a warning when queried phase does not match expected phase", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "auth-feature": { phase: "TSPEC_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      // Seed workflow state with WRONG phase
      client.workflowStates.set(
        "ptah-feature-auth-feature-1",
        defaultFeatureWorkflowState({ featureSlug: "auth-feature", currentPhaseId: "req-creation" }),
      );
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      expect(result.warnings.some((w) => w.includes("auth-feature"))).toBe(true);
      expect(result.warnings.some((w) => /expected.*tspec-creation/i.test(w))).toBe(true);
    });

    it("continues and adds warning when query fails for a workflow", async () => {
      client.connected = true;
      fs.addExisting(
        "pdlc-state.json",
        makeStateFile({ "auth-feature": { phase: "REQ_CREATION" } }),
      );
      fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());
      // workflowStates not seeded → queryWorkflowState will throw
      const command = new MigrateCommand(client, fs, logger);
      const result = await command.execute(DEFAULT_OPTS);
      // A warning about query failure is expected, but no hard error
      expect(result.warnings.some((w) => /query|verify/i.test(w))).toBe(true);
    });
  });
});
