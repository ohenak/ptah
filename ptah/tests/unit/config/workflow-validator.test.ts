import { describe, it, expect } from "vitest";
import { DefaultWorkflowValidator } from "../../../src/config/workflow-validator.js";
import type { ValidationResult, ValidationError } from "../../../src/config/workflow-validator.js";
import type { WorkflowConfig, PhaseDefinition } from "../../../src/config/workflow-config.js";
import { FakeAgentRegistry } from "../../fixtures/factories.js";
import type { RegisteredAgent } from "../../../src/types.js";

function makePhase(overrides: Partial<PhaseDefinition> & { id: string }): PhaseDefinition {
  return {
    name: overrides.id,
    type: "creation",
    ...overrides,
  };
}

function makeConfig(phases: PhaseDefinition[]): WorkflowConfig {
  return { version: 1, phases };
}

function makeRegisteredAgent(id: string): RegisteredAgent {
  return {
    id,
    skill_path: `./.claude/skills/${id}/SKILL.md`,
    log_file: `./logs/${id}.log`,
    mention_id: "111111111111111111",
    display_name: id,
  };
}

function makeRegistry(agentIds: string[]): FakeAgentRegistry {
  return new FakeAgentRegistry(agentIds.map(makeRegisteredAgent));
}

describe("DefaultWorkflowValidator", () => {
  const validator = new DefaultWorkflowValidator();

  describe("valid configs", () => {
    it("accepts a valid minimal config", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation", agent: "pm" }),
        makePhase({ id: "req-review", type: "review", reviewers: { default: ["eng"] }, revision_bound: 3 }),
        makePhase({ id: "req-approved", type: "approved" }),
      ]);
      const registry = makeRegistry(["pm", "eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts fork/join phases with agents array", () => {
      const config = makeConfig([
        makePhase({ id: "impl", type: "implementation", agents: ["eng", "fe"] }),
      ]);
      const registry = makeRegistry(["eng", "fe"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });

    it("accepts review phases with reviewer manifests", () => {
      const config = makeConfig([
        makePhase({
          id: "req-review",
          type: "review",
          reviewers: {
            "backend-only": ["eng", "qa"],
            "frontend-only": ["fe", "qa"],
            fullstack: ["eng", "fe", "qa"],
            default: ["eng"],
          },
          revision_bound: 3,
        }),
      ]);
      const registry = makeRegistry(["eng", "fe", "qa"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });

    it("accepts explicit transitions", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", agent: "pm", transition: "req-review" }),
        makePhase({ id: "req-review", type: "review", reviewers: { default: ["eng"] }, transition: "req-approved", revision_bound: 3 }),
        makePhase({ id: "req-approved", type: "approved" }),
      ]);
      const registry = makeRegistry(["pm", "eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });

    it("allows review loops (review → creation → review)", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", agent: "pm", transition: "req-review" }),
        makePhase({ id: "req-review", type: "review", reviewers: { default: ["eng"] }, transition: "req-approved", revision_bound: 3 }),
        makePhase({ id: "req-approved", type: "approved" }),
      ]);
      const registry = makeRegistry(["pm", "eng"]);

      // Review loops are handled by the workflow engine, not transitions.
      // The validator should not flag review → creation as a cycle.
      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });
  });

  describe("unique phase IDs", () => {
    it("rejects duplicate phase IDs", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", agent: "pm" }),
        makePhase({ id: "req-creation", agent: "eng" }),
      ]);
      const registry = makeRegistry(["pm", "eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "id",
          message: expect.stringContaining("duplicate"),
        })
      );
    });
  });

  describe("valid agent refs", () => {
    it("rejects unknown agent in single-agent phase", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", agent: "unknown-agent" }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "agent",
          message: expect.stringContaining("unknown-agent"),
        })
      );
    });

    it("rejects unknown agent in fork/join agents array", () => {
      const config = makeConfig([
        makePhase({ id: "impl", type: "implementation", agents: ["eng", "unknown"] }),
      ]);
      const registry = makeRegistry(["eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "impl",
          field: "agents",
          message: expect.stringContaining("unknown"),
        })
      );
    });

    it("rejects unknown agent in reviewer manifest", () => {
      const config = makeConfig([
        makePhase({
          id: "req-review",
          type: "review",
          reviewers: { default: ["eng", "ghost"] },
        }),
      ]);
      const registry = makeRegistry(["eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-review",
          field: "reviewers",
          message: expect.stringContaining("ghost"),
        })
      );
    });
  });

  describe("valid transitions", () => {
    it("rejects transition to non-existent phase", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", agent: "pm", transition: "non-existent" }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "transition",
          message: expect.stringContaining("non-existent"),
        })
      );
    });
  });

  describe("required fields", () => {
    it("requires agent or agents for creation phases", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "agent",
          message: expect.stringContaining("must have"),
        })
      );
    });

    it("requires agent or agents for implementation phases", () => {
      const config = makeConfig([
        makePhase({ id: "impl", type: "implementation" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "impl",
          field: "agent",
        })
      );
    });

    it("requires reviewers for review phases", () => {
      const config = makeConfig([
        makePhase({ id: "req-review", type: "review" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-review",
          field: "reviewers",
          message: expect.stringContaining("must have"),
        })
      );
    });

    it("does not require agent for approved phases", () => {
      const config = makeConfig([
        makePhase({ id: "req-approved", type: "approved" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });
  });

  describe("cycle detection", () => {
    it("rejects direct self-transition cycle", () => {
      const config = makeConfig([
        makePhase({ id: "loop", agent: "pm", transition: "loop" }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "loop",
          field: "transition",
          message: expect.stringContaining("cycle"),
        })
      );
    });

    it("rejects multi-phase cycle with no review phase", () => {
      // A → B → A cycle where neither is a review phase
      const config = makeConfig([
        makePhase({ id: "phase-a", agent: "pm", transition: "phase-b" }),
        makePhase({ id: "phase-b", agent: "eng", transition: "phase-a" }),
      ]);
      const registry = makeRegistry(["pm", "eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("cycle"))).toBe(true);
    });
  });

  describe("collects all errors", () => {
    it("reports multiple errors in a single validation", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation" }),
        makePhase({ id: "req-creation", type: "review" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // PROP-WFV-01: revision_bound required for review phases
  // -------------------------------------------------------------------------

  describe("PROP-WFV-01: revision_bound missing emits warning (backward compat)", () => {
    it("review phase missing revision_bound produces a warning (not an error)", () => {
      const config = makeConfig([
        makePhase({
          id: "req-review",
          type: "review",
          reviewers: { default: ["eng"] },
          // revision_bound intentionally omitted
        }),
      ]);
      const registry = makeRegistry(["eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          phase: "req-review",
          field: "revision_bound",
          message: expect.stringContaining("revision_bound"),
        })
      );
    });

    it("accepts a review phase with revision_bound present", () => {
      const config = makeConfig([
        makePhase({
          id: "req-review",
          type: "review",
          reviewers: { default: ["eng"] },
          revision_bound: 5,
        }),
      ]);
      const registry = makeRegistry(["eng"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PROP-WFV-02: valid artifact.exists skip_if block
  // -------------------------------------------------------------------------

  describe("PROP-WFV-02: valid artifact.exists skip_if", () => {
    it("accepts a skip_if block with field: artifact.exists and a non-empty artifact", () => {
      const config = makeConfig([
        makePhase({
          id: "req-creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "artifact.exists", artifact: "REQ" },
        }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PROP-WFV-03: artifact.exists without artifact field is invalid
  // -------------------------------------------------------------------------

  describe("PROP-WFV-03: artifact.exists missing artifact field", () => {
    it("rejects a skip_if with field: artifact.exists but no artifact property", () => {
      const config = makeConfig([
        makePhase({
          id: "req-creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "artifact.exists" } as unknown as import("../../../../src/config/workflow-config.js").SkipCondition,
        }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "skip_if",
          message: expect.stringContaining("artifact"),
        })
      );
    });

    it("rejects a skip_if with field: artifact.exists and empty artifact string", () => {
      const config = makeConfig([
        makePhase({
          id: "req-creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "artifact.exists", artifact: "" },
        }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "skip_if",
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // PROP-WFV-04: malformed discriminated union is rejected
  // -------------------------------------------------------------------------

  describe("PROP-WFV-04: malformed discriminated union", () => {
    it("rejects artifact.exists skip_if that also has an equals property", () => {
      const config = makeConfig([
        makePhase({
          id: "req-creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "artifact.exists", artifact: "REQ", equals: true } as unknown as import("../../../../src/config/workflow-config.js").SkipCondition,
        }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "skip_if",
          message: expect.stringContaining("equals"),
        })
      );
    });

    it("rejects a config.* skip_if that also has an artifact property", () => {
      const config = makeConfig([
        makePhase({
          id: "req-creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "config.skipFspec", equals: true, artifact: "REQ" } as unknown as import("../../../../src/config/workflow-config.js").SkipCondition,
        }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          phase: "req-creation",
          field: "skip_if",
          message: expect.stringContaining("artifact"),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // PROP-NF-06: ValidationResult contract — invalid configs must produce
  // valid:false with descriptive errors to signal startup should halt
  // -------------------------------------------------------------------------

  describe("PROP-NF-06: ValidationResult signals startup should halt on invalid config", () => {
    it("returns valid:true for a correct config (startup should proceed)", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation", agent: "pm" }),
      ]);
      const registry = makeRegistry(["pm"]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid:false with non-empty errors array when config is invalid (startup must halt)", () => {
      // A config with unknown agent — startup should halt
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation", agent: "unknown-agent" }),
      ]);
      const registry = makeRegistry([]); // no agents registered

      const result = validator.validate(config, registry);

      // Callers must check result.valid to decide whether to halt startup
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("provides descriptive error messages with phase, field, and message for each error (PROP-NF-06)", () => {
      const config = makeConfig([
        makePhase({ id: "bad-phase", type: "creation", agent: "ghost" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      for (const error of result.errors) {
        // Each error must have phase, field, and a non-empty message
        expect(error.phase).toBeDefined();
        expect(error.phase.length).toBeGreaterThan(0);
        expect(error.field).toBeDefined();
        expect(error.field.length).toBeGreaterThan(0);
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    });

    it("returns errors describing the invalid agent when an unregistered agent is referenced", () => {
      const config = makeConfig([
        makePhase({ id: "req-creation", type: "creation", agent: "nonexistent-agent" }),
      ]);
      const registry = makeRegistry([]);

      const result = validator.validate(config, registry);

      expect(result.valid).toBe(false);
      // The error message must mention the invalid agent name
      const hasAgentError = result.errors.some(
        (e) => e.message.includes("nonexistent-agent")
      );
      expect(hasAgentError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 6 Review Fixes
// ---------------------------------------------------------------------------

describe("PROP-WFV-01 (updated): revision_bound missing emits warning, not error", () => {
  const validator = new DefaultWorkflowValidator();

  it("review phase missing revision_bound produces a warning (not an error)", () => {
    const config = makeConfig([
      makePhase({
        id: "req-review",
        type: "review",
        reviewers: { default: ["eng"] },
        // revision_bound intentionally omitted
      }),
    ]);
    const registry = makeRegistry(["eng"]);

    const result = validator.validate(config, registry);

    // valid must be true — missing revision_bound is not a hard error
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // but a warning must be present
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        phase: "req-review",
        field: "revision_bound",
        message: expect.stringContaining("revision_bound"),
      })
    );
  });

  it("review phase with revision_bound present produces no warning", () => {
    const config = makeConfig([
      makePhase({
        id: "req-review",
        type: "review",
        reviewers: { default: ["eng"] },
        revision_bound: 5,
      }),
    ]);
    const registry = makeRegistry(["eng"]);

    const result = validator.validate(config, registry);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
