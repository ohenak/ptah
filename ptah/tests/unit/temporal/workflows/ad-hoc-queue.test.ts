/**
 * Unit tests for ad-hoc queue pure helper functions.
 *
 * Tests the `findAgentPhase` helper exported from feature-lifecycle.ts.
 *
 * @see TSPEC-agent-coordination Section 6.4 (Helper: Find Agent's Phase)
 * @see PLAN-agent-coordination Tasks 40-41
 */

import { describe, it, expect } from "vitest";
import type { PhaseDefinition, WorkflowConfig } from "../../../../src/config/workflow-config.js";
import { findAgentPhase } from "../../../../src/temporal/workflows/feature-lifecycle.js";

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
// Task 40-41: findAgentPhase
// ---------------------------------------------------------------------------

describe("findAgentPhase", () => {
  it("returns first phase where phase.agent === agentId", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
      makePhase({ id: "review-tspec", agent: "qa", type: "review" }),
    ]);

    const result = findAgentPhase("eng", config);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tspec");
    expect(result!.agent).toBe("eng");
  });

  it("returns the first matching phase when agent appears in multiple phases", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
      makePhase({ id: "impl", agent: "eng", type: "implementation" }),
    ]);

    const result = findAgentPhase("eng", config);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tspec");
  });

  it("returns null when agent not in any phase", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
    ]);

    const result = findAgentPhase("qa", config);

    expect(result).toBeNull();
  });

  it("returns null for empty phases array", () => {
    // WorkflowConfig validation requires non-empty phases,
    // but the function should handle it gracefully
    const config = makeConfig([]);

    const result = findAgentPhase("pm", config);

    expect(result).toBeNull();
  });
});
