import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  YamlWorkflowConfigLoader,
  WorkflowConfigError,
} from "../../../src/config/workflow-config.js";
import type {
  WorkflowConfig,
  PhaseDefinition,
  ReviewerManifest,
  SkipCondition,
} from "../../../src/config/workflow-config.js";
import { FakeFileSystem } from "../../fixtures/factories.js";

const MINIMAL_YAML = `
version: 1
phases:
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm
    context_documents:
      - "{feature}/overview"
    transition: req-review
  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      default: [eng, qa]
    context_documents:
      - "{feature}/REQ"
    transition: req-approved
  - id: req-approved
    name: Requirements Approved
    type: approved
`;

describe("YamlWorkflowConfigLoader", () => {
  let fs: FakeFileSystem;
  let loader: YamlWorkflowConfigLoader;

  beforeEach(() => {
    fs = new FakeFileSystem();
    loader = new YamlWorkflowConfigLoader(fs);
  });

  describe("successful loading", () => {
    it("parses a valid YAML workflow config", async () => {
      fs.addExisting("ptah.workflow.yaml", MINIMAL_YAML);

      const config = await loader.load();

      expect(config.version).toBe(1);
      expect(config.phases).toHaveLength(3);
      expect(config.phases[0].id).toBe("req-creation");
      expect(config.phases[0].type).toBe("creation");
      expect(config.phases[0].agent).toBe("pm");
    });

    it("parses reviewer manifests", async () => {
      fs.addExisting("ptah.workflow.yaml", MINIMAL_YAML);

      const config = await loader.load();
      const reviewPhase = config.phases[1];

      expect(reviewPhase.reviewers).toBeDefined();
      expect(reviewPhase.reviewers!.default).toEqual(["eng", "qa"]);
    });

    it("parses context_documents array", async () => {
      fs.addExisting("ptah.workflow.yaml", MINIMAL_YAML);

      const config = await loader.load();

      expect(config.phases[0].context_documents).toEqual(["{feature}/overview"]);
    });

    it("parses skip_if condition", async () => {
      const yamlWithSkip = `
version: 1
phases:
  - id: fspec-creation
    name: FSPEC Creation
    type: creation
    agent: pm
    skip_if:
      field: config.skipFspec
      equals: true
  - id: tspec-creation
    name: TSPEC Creation
    type: creation
    agent: eng
`;
      fs.addExisting("ptah.workflow.yaml", yamlWithSkip);

      const config = await loader.load();

      expect(config.phases[0].skip_if).toBeDefined();
      expect(config.phases[0].skip_if!.field).toBe("config.skipFspec");
      expect(config.phases[0].skip_if!.equals).toBe(true);
    });

    it("parses failure_policy for fork/join phases", async () => {
      const yamlWithForkJoin = `
version: 1
phases:
  - id: impl
    name: Implementation
    type: implementation
    agents: [eng, fe]
    failure_policy: fail_fast
`;
      fs.addExisting("ptah.workflow.yaml", yamlWithForkJoin);

      const config = await loader.load();

      expect(config.phases[0].agents).toEqual(["eng", "fe"]);
      expect(config.phases[0].failure_policy).toBe("fail_fast");
    });

    it("parses per-phase retry config", async () => {
      const yamlWithRetry = `
version: 1
phases:
  - id: impl
    name: Implementation
    type: implementation
    agent: eng
    retry:
      maxAttempts: 5
      initialIntervalSeconds: 60
      backoffCoefficient: 3.0
      maxIntervalSeconds: 300
`;
      fs.addExisting("ptah.workflow.yaml", yamlWithRetry);

      const config = await loader.load();

      expect(config.phases[0].retry).toBeDefined();
      expect(config.phases[0].retry!.maxAttempts).toBe(5);
      expect(config.phases[0].retry!.initialIntervalSeconds).toBe(60);
    });

    it("parses revision_bound", async () => {
      const yamlWithBound = `
version: 1
phases:
  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      default: [eng]
    revision_bound: 5
`;
      fs.addExisting("ptah.workflow.yaml", yamlWithBound);

      const config = await loader.load();

      expect(config.phases[0].revision_bound).toBe(5);
    });

    it("loads from custom path", async () => {
      fs.addExisting("custom/workflow.yaml", MINIMAL_YAML);

      const config = await loader.load("custom/workflow.yaml");

      expect(config.version).toBe(1);
      expect(config.phases).toHaveLength(3);
    });

    it("parses discipline-specific reviewer manifests", async () => {
      const yamlWithManifests = `
version: 1
phases:
  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      backend-only: [eng, qa]
      frontend-only: [fe, qa]
      fullstack: [eng, fe, qa]
      default: [eng]
`;
      fs.addExisting("ptah.workflow.yaml", yamlWithManifests);

      const config = await loader.load();
      const reviewers = config.phases[0].reviewers!;

      expect(reviewers["backend-only"]).toEqual(["eng", "qa"]);
      expect(reviewers["frontend-only"]).toEqual(["fe", "qa"]);
      expect(reviewers.fullstack).toEqual(["eng", "fe", "qa"]);
      expect(reviewers.default).toEqual(["eng"]);
    });
  });

  describe("error handling", () => {
    it("throws WorkflowConfigError when file not found", async () => {
      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow(
        "ptah.workflow.yaml not found. Run 'ptah init' first."
      );
    });

    it("throws WorkflowConfigError for invalid YAML", async () => {
      fs.addExisting("ptah.workflow.yaml", "{ invalid: yaml: content");

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow("contains invalid YAML");
    });

    it("throws WorkflowConfigError for empty file", async () => {
      fs.addExisting("ptah.workflow.yaml", "");

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow("is empty or not a valid YAML object");
    });

    it("throws WorkflowConfigError when version is missing", async () => {
      fs.addExisting("ptah.workflow.yaml", `
phases:
  - id: test
    name: Test
    type: creation
`);

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow('missing required field "version"');
    });

    it("throws WorkflowConfigError when phases is missing", async () => {
      fs.addExisting("ptah.workflow.yaml", "version: 1\n");

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow('missing required field "phases"');
    });

    it("throws WorkflowConfigError when phases is empty", async () => {
      fs.addExisting("ptah.workflow.yaml", `
version: 1
phases: []
`);

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow('"phases" array must not be empty');
    });

    it("throws WorkflowConfigError when phase id is missing", async () => {
      fs.addExisting("ptah.workflow.yaml", `
version: 1
phases:
  - name: No ID
    type: creation
`);

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow("phases[0].id is missing or empty");
    });

    it("throws WorkflowConfigError when phase name is missing", async () => {
      fs.addExisting("ptah.workflow.yaml", `
version: 1
phases:
  - id: test
    type: creation
`);

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow("phases[0].name is missing or empty");
    });

    it("throws WorkflowConfigError when phase type is invalid", async () => {
      fs.addExisting("ptah.workflow.yaml", `
version: 1
phases:
  - id: test
    name: Test
    type: invalid_type
`);

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow('phases[0].type "invalid_type" is invalid');
    });

    it("throws WorkflowConfigError for custom path not found", async () => {
      await expect(loader.load("missing/config.yaml")).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load("missing/config.yaml")).rejects.toThrow(
        "missing/config.yaml not found"
      );
    });

    it("throws WorkflowConfigError for non-ENOENT read errors", async () => {
      fs.writeFileError = new Error("Permission denied");
      // Override readFile to throw a non-ENOENT error
      const origReadFile = fs.readFile.bind(fs);
      fs.readFile = async (_path: string) => {
        throw new Error("Permission denied");
      };

      await expect(loader.load()).rejects.toThrow(WorkflowConfigError);
      await expect(loader.load()).rejects.toThrow("Failed to read ptah.workflow.yaml");
    });
  });
});

describe("Default PDLC preset", () => {
  let config: WorkflowConfig;

  beforeEach(async () => {
    const presetPath = path.resolve(__dirname, "../../../src/presets/default-pdlc.yaml");
    const yamlContent = fs.readFileSync(presetPath, "utf-8");
    const fakeFs = new FakeFileSystem();
    fakeFs.addExisting("ptah.workflow.yaml", yamlContent);
    const loader = new YamlWorkflowConfigLoader(fakeFs);
    config = await loader.load();
  });

  it("has version 1", () => {
    expect(config.version).toBe(1);
  });

  it("defines all 18 PDLC phases", () => {
    expect(config.phases).toHaveLength(18);
  });

  it("has all expected phase IDs matching v4 PdlcPhase enum", () => {
    const ids = config.phases.map(p => p.id);
    expect(ids).toEqual([
      "req-creation",
      "req-review",
      "req-approved",
      "fspec-creation",
      "fspec-review",
      "fspec-approved",
      "tspec-creation",
      "tspec-review",
      "tspec-approved",
      "plan-creation",
      "plan-review",
      "plan-approved",
      "properties-creation",
      "properties-review",
      "properties-approved",
      "implementation",
      "implementation-review",
      "done",
    ]);
  });

  it("assigns pm agent to req-creation and fspec-creation", () => {
    const reqCreation = config.phases.find(p => p.id === "req-creation")!;
    const fspecCreation = config.phases.find(p => p.id === "fspec-creation")!;

    expect(reqCreation.agent).toBe("pm");
    expect(fspecCreation.agent).toBe("pm");
  });

  it("assigns eng agent to tspec-creation and plan-creation", () => {
    const tspecCreation = config.phases.find(p => p.id === "tspec-creation")!;
    const planCreation = config.phases.find(p => p.id === "plan-creation")!;

    expect(tspecCreation.agent).toBe("eng");
    expect(planCreation.agent).toBe("eng");
  });

  it("assigns qa agent to properties-creation", () => {
    const propCreation = config.phases.find(p => p.id === "properties-creation")!;
    expect(propCreation.agent).toBe("qa");
  });

  it("has fork/join agents for tspec, plan, and implementation", () => {
    const tspec = config.phases.find(p => p.id === "tspec-creation")!;
    const plan = config.phases.find(p => p.id === "plan-creation")!;
    const impl = config.phases.find(p => p.id === "implementation")!;

    expect(tspec.agents).toEqual(["eng", "fe"]);
    expect(plan.agents).toEqual(["eng", "fe"]);
    expect(impl.agents).toEqual(["eng", "fe"]);
  });

  it("has skip_if for fspec phases", () => {
    const fspecCreation = config.phases.find(p => p.id === "fspec-creation")!;
    const fspecReview = config.phases.find(p => p.id === "fspec-review")!;
    const fspecApproved = config.phases.find(p => p.id === "fspec-approved")!;

    expect(fspecCreation.skip_if).toEqual({ field: "config.skipFspec", equals: true });
    expect(fspecReview.skip_if).toEqual({ field: "config.skipFspec", equals: true });
    expect(fspecApproved.skip_if).toEqual({ field: "config.skipFspec", equals: true });
  });

  it("has discipline-specific reviewers for req-review", () => {
    const reqReview = config.phases.find(p => p.id === "req-review")!;

    expect(reqReview.reviewers!["backend-only"]).toEqual(["eng", "qa"]);
    expect(reqReview.reviewers!["frontend-only"]).toEqual(["fe", "qa"]);
    expect(reqReview.reviewers!.fullstack).toEqual(["eng", "fe", "qa"]);
  });

  it("has reviewer manifest for implementation-review", () => {
    const implReview = config.phases.find(p => p.id === "implementation-review")!;
    expect(implReview.reviewers!.default).toEqual(["qa"]);
  });

  it("has explicit transitions forming a linear pipeline", () => {
    const reqCreation = config.phases.find(p => p.id === "req-creation")!;
    const reqReview = config.phases.find(p => p.id === "req-review")!;
    const reqApproved = config.phases.find(p => p.id === "req-approved")!;

    expect(reqCreation.transition).toBe("req-review");
    expect(reqReview.transition).toBe("req-approved");
    expect(reqApproved.transition).toBe("fspec-creation");
  });

  it("terminates at done phase with no transition", () => {
    const done = config.phases.find(p => p.id === "done")!;
    expect(done.transition).toBeUndefined();
  });

  it("has revision_bound of 3 on all review phases", () => {
    const reviewPhases = config.phases.filter(p => p.type === "review");
    for (const phase of reviewPhases) {
      expect(phase.revision_bound).toBe(3);
    }
  });

  it("has context_documents on creation and review phases", () => {
    const reqCreation = config.phases.find(p => p.id === "req-creation")!;
    expect(reqCreation.context_documents).toContain("{feature}/overview");

    const tspecCreation = config.phases.find(p => p.id === "tspec-creation")!;
    expect(tspecCreation.context_documents).toContain("{feature}/REQ");
    expect(tspecCreation.context_documents).toContain("{feature}/FSPEC");
  });
});
