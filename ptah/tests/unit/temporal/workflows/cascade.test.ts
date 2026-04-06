/**
 * Unit tests for cascade pure helper functions.
 *
 * Tests the `collectCascadePhases` and `lookupCreationPhase` helpers
 * exported from feature-lifecycle.ts.
 *
 * @see TSPEC-agent-coordination Section 6.3 (Downstream Cascade)
 * @see PLAN-agent-coordination Tasks 42-46
 */

import { describe, it, expect } from "vitest";
import type { PhaseDefinition, WorkflowConfig } from "../../../../src/config/workflow-config.js";
import {
  collectCascadePhases,
  lookupCreationPhase,
} from "../../../../src/temporal/workflows/feature-lifecycle.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<PhaseDefinition>): PhaseDefinition {
  return {
    id: "test-phase",
    name: "Test Phase",
    type: "creation",
    agent: "pm",
    ...overrides,
  };
}

function makeConfig(phases: PhaseDefinition[]): WorkflowConfig {
  return { version: 1, phases };
}

// ---------------------------------------------------------------------------
// Task 42: collectCascadePhases returns type:"review" phases after agent index
// ---------------------------------------------------------------------------

describe("collectCascadePhases", () => {
  it("returns type:review phases after agent index", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "review-req", agent: "qa", type: "review" }),
      makePhase({ id: "tspec", agent: "eng", type: "creation" }),
      makePhase({ id: "review-tspec", agent: "qa-2", type: "review" }),
      makePhase({ id: "impl", agent: "eng-2", type: "implementation" }),
    ]);

    const result = collectCascadePhases("pm", config);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("review-req");
    expect(result[1].id).toBe("review-tspec");
  });

  // ---------------------------------------------------------------------------
  // Task 43: excludes creation/approved/implementation phases
  // ---------------------------------------------------------------------------

  it("excludes creation, approved, and implementation phases", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "tspec", agent: "eng", type: "creation" }),
      makePhase({ id: "approved", agent: "lead", type: "approved" }),
      makePhase({ id: "impl", agent: "dev", type: "implementation" }),
      makePhase({ id: "review-impl", agent: "qa", type: "review" }),
    ]);

    const result = collectCascadePhases("pm", config);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("review-impl");
    // Verify non-review types are excluded
    const types = result.map((p) => p.type);
    expect(types).not.toContain("creation");
    expect(types).not.toContain("approved");
    expect(types).not.toContain("implementation");
  });

  // ---------------------------------------------------------------------------
  // Task 44: returns empty array when agent is last phase
  // ---------------------------------------------------------------------------

  it("returns empty array when agent is last phase", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "review-req", agent: "qa", type: "review" }),
      makePhase({ id: "impl", agent: "eng", type: "implementation" }),
    ]);

    const result = collectCascadePhases("eng", config);

    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Task 45: returns empty when no review phases after agent
  // ---------------------------------------------------------------------------

  it("returns empty when no review phases after agent", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "tspec", agent: "eng", type: "creation" }),
      makePhase({ id: "impl", agent: "dev", type: "implementation" }),
    ]);

    const result = collectCascadePhases("pm", config);

    expect(result).toEqual([]);
  });

  it("returns empty when agent not found in any phase", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "review-req", agent: "qa", type: "review" }),
    ]);

    const result = collectCascadePhases("unknown-agent", config);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 46: Cascade positional creation-phase lookup
// ---------------------------------------------------------------------------

describe("lookupCreationPhase", () => {
  it("returns phases[reviewIndex - 1] for a review phase", () => {
    const reviewPhase = makePhase({ id: "review-tspec", agent: "qa", type: "review" });
    const creationPhase = makePhase({ id: "tspec", agent: "eng", type: "creation" });

    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      creationPhase,
      reviewPhase,
    ]);

    const result = lookupCreationPhase(reviewPhase, config);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tspec");
    expect(result!.agent).toBe("eng");
  });

  it("returns phase at N-1 regardless of type (BR-08 edge case)", () => {
    // Documents the config constraint: if a non-creation phase precedes a
    // review phase, lookupCreationPhase still returns it (positional lookup)
    const approvedPhase = makePhase({ id: "approved", agent: "lead", type: "approved" });
    const reviewPhase = makePhase({ id: "review-impl", agent: "qa", type: "review" });

    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      approvedPhase,
      reviewPhase,
    ]);

    const result = lookupCreationPhase(reviewPhase, config);

    expect(result).not.toBeNull();
    // It returns the "approved" phase — it does NOT filter by type
    expect(result!.id).toBe("approved");
    expect(result!.type).toBe("approved");
  });

  it("returns null when review phase is at index 0", () => {
    const reviewPhase = makePhase({ id: "review-first", agent: "qa", type: "review" });
    const config = makeConfig([reviewPhase]);

    const result = lookupCreationPhase(reviewPhase, config);

    expect(result).toBeNull();
  });

  it("returns null when review phase is not found in config", () => {
    const reviewPhase = makePhase({ id: "nonexistent-review", agent: "qa", type: "review" });
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
    ]);

    const result = lookupCreationPhase(reviewPhase, config);

    expect(result).toBeNull();
  });
});
