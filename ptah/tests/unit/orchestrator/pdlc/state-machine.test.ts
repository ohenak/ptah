import { describe, it, expect } from "vitest";
import {
  createFeatureState,
  transition,
  validEventsForPhase,
} from "../../../../src/orchestrator/pdlc/state-machine.js";
import {
  PdlcPhase,
  InvalidTransitionError,
  type FeatureConfig,
  type FeatureState,
  type PdlcEvent,
  type ReviewPhaseState,
  type SideEffect,
  type TransitionResult,
  type ForkJoinState,
} from "../../../../src/orchestrator/pdlc/phases.js";

// ---------------------------------------------------------------------------
// Import verification (Task 1 / Phase A)
// ---------------------------------------------------------------------------

describe("phases.ts — import verification", () => {
  it("PdlcPhase enum has 18 members", () => {
    const phases = Object.values(PdlcPhase);
    expect(phases).toHaveLength(18);
  });

  it("InvalidTransitionError is constructable", () => {
    const err = new InvalidTransitionError(PdlcPhase.DONE, "lgtm", []);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("InvalidTransitionError");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = "2026-03-14T00:00:00Z";
const LATER = "2026-03-14T00:01:00Z";

function backendConfig(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
  return { discipline: "backend-only", skipFspec: false, ...overrides };
}

function frontendConfig(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
  return { discipline: "frontend-only", skipFspec: false, ...overrides };
}

function fullstackConfig(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
  return { discipline: "fullstack", skipFspec: false, ...overrides };
}

function makeState(overrides: Partial<FeatureState> = {}): FeatureState {
  return {
    slug: "test-feature",
    phase: PdlcPhase.REQ_CREATION,
    config: backendConfig(),
    reviewPhases: {},
    forkJoin: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeReviewState(
  phase: PdlcPhase,
  reviewerStatuses: Record<string, string>,
  revisionCount = 0,
  config: FeatureConfig = backendConfig(),
): FeatureState {
  return makeState({
    phase,
    config,
    reviewPhases: {
      [phase]: {
        reviewerStatuses: reviewerStatuses as Record<string, "pending" | "approved" | "revision_requested">,
        revisionCount,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Task 6: createFeatureState()
// ---------------------------------------------------------------------------

describe("createFeatureState()", () => {
  it("creates state with REQ_CREATION phase", () => {
    const state = createFeatureState("my-feature", backendConfig(), NOW);
    expect(state.phase).toBe(PdlcPhase.REQ_CREATION);
  });

  it("sets slug and config", () => {
    const config = backendConfig({ skipFspec: true });
    const state = createFeatureState("my-feature", config, NOW);
    expect(state.slug).toBe("my-feature");
    expect(state.config).toEqual(config);
  });

  it("sets createdAt and updatedAt to now", () => {
    const state = createFeatureState("my-feature", backendConfig(), NOW);
    expect(state.createdAt).toBe(NOW);
    expect(state.updatedAt).toBe(NOW);
  });

  it("sets completedAt to null", () => {
    const state = createFeatureState("my-feature", backendConfig(), NOW);
    expect(state.completedAt).toBeNull();
  });

  it("initializes empty reviewPhases", () => {
    const state = createFeatureState("my-feature", backendConfig(), NOW);
    expect(state.reviewPhases).toEqual({});
  });

  it("initializes forkJoin to null", () => {
    const state = createFeatureState("my-feature", backendConfig(), NOW);
    expect(state.forkJoin).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 7: validEventsForPhase()
// ---------------------------------------------------------------------------

describe("validEventsForPhase()", () => {
  const be = backendConfig();
  const fs = fullstackConfig();

  it("REQ_CREATION → ['lgtm']", () => {
    expect(validEventsForPhase(PdlcPhase.REQ_CREATION, be)).toEqual(["lgtm"]);
  });

  it("REQ_REVIEW → ['review_submitted']", () => {
    expect(validEventsForPhase(PdlcPhase.REQ_REVIEW, be)).toEqual(["review_submitted"]);
  });

  it("REQ_APPROVED → ['auto']", () => {
    expect(validEventsForPhase(PdlcPhase.REQ_APPROVED, be)).toEqual(["auto"]);
  });

  it("DONE → [] (no valid events)", () => {
    expect(validEventsForPhase(PdlcPhase.DONE, be)).toEqual([]);
  });

  it("TSPEC_CREATION fullstack → ['subtask_complete']", () => {
    expect(validEventsForPhase(PdlcPhase.TSPEC_CREATION, fs)).toEqual(["subtask_complete"]);
  });

  it("TSPEC_CREATION backend-only → ['lgtm']", () => {
    expect(validEventsForPhase(PdlcPhase.TSPEC_CREATION, be)).toEqual(["lgtm"]);
  });

  it("PLAN_CREATION fullstack → ['subtask_complete']", () => {
    expect(validEventsForPhase(PdlcPhase.PLAN_CREATION, fs)).toEqual(["subtask_complete"]);
  });

  it("IMPLEMENTATION fullstack → ['subtask_complete']", () => {
    expect(validEventsForPhase(PdlcPhase.IMPLEMENTATION, fs)).toEqual(["subtask_complete"]);
  });

  it("IMPLEMENTATION backend-only → ['lgtm']", () => {
    expect(validEventsForPhase(PdlcPhase.IMPLEMENTATION, be)).toEqual(["lgtm"]);
  });

  it("FSPEC_CREATION → ['lgtm'] (never fork/join)", () => {
    expect(validEventsForPhase(PdlcPhase.FSPEC_CREATION, fs)).toEqual(["lgtm"]);
  });

  it("PROPERTIES_CREATION → ['lgtm'] (never fork/join)", () => {
    expect(validEventsForPhase(PdlcPhase.PROPERTIES_CREATION, fs)).toEqual(["lgtm"]);
  });

  it("all review phases → ['review_submitted']", () => {
    const reviewPhases = [
      PdlcPhase.FSPEC_REVIEW,
      PdlcPhase.TSPEC_REVIEW,
      PdlcPhase.PLAN_REVIEW,
      PdlcPhase.PROPERTIES_REVIEW,
      PdlcPhase.IMPLEMENTATION_REVIEW,
    ];
    for (const phase of reviewPhases) {
      expect(validEventsForPhase(phase, be)).toEqual(["review_submitted"]);
    }
  });

  it("all approved phases → ['auto']", () => {
    const approvedPhases = [
      PdlcPhase.FSPEC_APPROVED,
      PdlcPhase.TSPEC_APPROVED,
      PdlcPhase.PLAN_APPROVED,
      PdlcPhase.PROPERTIES_APPROVED,
    ];
    for (const phase of approvedPhases) {
      expect(validEventsForPhase(phase, be)).toEqual(["auto"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 8: transition() — creation phases (lgtm → review)
// ---------------------------------------------------------------------------

describe("transition() — creation phases", () => {
  it("REQ_CREATION + lgtm → REQ_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
  });

  it("emits dispatch_reviewers side effect", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.sideEffects).toHaveLength(1);
    expect(result.sideEffects[0]).toMatchObject({ type: "dispatch_reviewers" });
  });

  it("initializes reviewerStatuses with all pending", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    const reviewState = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(Object.values(reviewState.reviewerStatuses).every((s) => s === "pending")).toBe(true);
  });

  it("REQ_REVIEW reviewers for backend-only: [eng, qa]", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION, config: backendConfig() });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    const effect = result.sideEffects[0] as { type: "dispatch_reviewers"; reviewerKeys: string[] };
    expect(effect.reviewerKeys).toEqual(["eng", "qa"]);
  });

  it("REQ_REVIEW reviewers for frontend-only: [fe, qa]", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION, config: frontendConfig() });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    const effect = result.sideEffects[0] as { type: "dispatch_reviewers"; reviewerKeys: string[] };
    expect(effect.reviewerKeys).toEqual(["fe", "qa"]);
  });

  it("REQ_REVIEW reviewers for fullstack: [eng, fe, qa]", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION, config: fullstackConfig() });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    const effect = result.sideEffects[0] as { type: "dispatch_reviewers"; reviewerKeys: string[] };
    expect(effect.reviewerKeys).toEqual(["eng", "fe", "qa"]);
  });

  it("FSPEC_CREATION + lgtm → FSPEC_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.FSPEC_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_REVIEW);
  });

  it("TSPEC_CREATION (backend-only) + lgtm → TSPEC_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.TSPEC_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "eng" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_REVIEW);
  });

  it("PLAN_CREATION (backend-only) + lgtm → PLAN_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.PLAN_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "eng" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.PLAN_REVIEW);
  });

  it("PROPERTIES_CREATION + lgtm → PROPERTIES_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.PROPERTIES_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "qa" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.PROPERTIES_REVIEW);
  });

  it("IMPLEMENTATION (backend-only) + lgtm → IMPLEMENTATION_REVIEW", () => {
    const state = makeState({ phase: PdlcPhase.IMPLEMENTATION });
    const result = transition(state, { type: "lgtm", agentId: "eng" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);
  });

  it("updates updatedAt timestamp", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.newState.updatedAt).toBe(LATER);
  });

  it("preserves revisionCount from existing review phase state", () => {
    const state = makeState({
      phase: PdlcPhase.REQ_CREATION,
      reviewPhases: {
        [PdlcPhase.REQ_REVIEW]: {
          reviewerStatuses: { eng: "pending", qa: "pending" },
          revisionCount: 2,
        },
      },
    });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    const reviewState = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(reviewState.revisionCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Task 9: transition() — review phases (collect-all-then-evaluate)
// ---------------------------------------------------------------------------

describe("transition() — review phases", () => {
  describe("partial completion (pending reviewers remain)", () => {
    it("updates reviewer status but does not transition", () => {
      const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "pending", qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
      const rs = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
      expect(rs.reviewerStatuses.eng).toBe("approved");
      expect(rs.reviewerStatuses.qa).toBe("pending");
    });

    it("emits no side effects when reviewers are pending", () => {
      const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "pending", qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" },
        LATER,
      );
      expect(result.sideEffects).toEqual([]);
    });

    it("waits even if one reviewer rejected but others pending", () => {
      const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "pending", qa: "pending" });
      const r1 = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng", recommendation: "revision_requested" },
        LATER,
      );
      // qa is still pending, so no transition yet
      expect(r1.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
      expect(r1.sideEffects).toEqual([]);
    });
  });

  describe("all approved", () => {
    it("transitions to *_APPROVED when all reviewers approve", () => {
      const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "approved", qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.phase).toBe(PdlcPhase.REQ_APPROVED);
    });

    it("emits auto_transition side effect", () => {
      const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "approved", qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
        LATER,
      );
      expect(result.sideEffects).toEqual([{ type: "auto_transition" }]);
    });

    it("IMPLEMENTATION_REVIEW all approved → DONE, no side effects", () => {
      const state = makeReviewState(PdlcPhase.IMPLEMENTATION_REVIEW, { qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.phase).toBe(PdlcPhase.DONE);
      expect(result.newState.completedAt).toBe(LATER);
      expect(result.sideEffects).toEqual([]);
    });

    it("FSPEC_REVIEW → FSPEC_APPROVED", () => {
      const state = makeReviewState(PdlcPhase.FSPEC_REVIEW, { eng: "approved", qa: "pending" });
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.phase).toBe(PdlcPhase.FSPEC_APPROVED);
    });
  });
});

// ---------------------------------------------------------------------------
// Task 10: Revision loop
// ---------------------------------------------------------------------------

describe("transition() — revision loop", () => {
  it("transitions to *_CREATION when any reviewer rejected (all complete)", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.REQ_CREATION);
  });

  it("increments revisionCount", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    }, 0);
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    const rs = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(rs.revisionCount).toBe(1);
  });

  it("resets ALL reviewer statuses to pending", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    const rs = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(Object.values(rs.reviewerStatuses).every((s) => s === "pending")).toBe(true);
  });

  it("emits dispatch_agent with Revise for single-discipline", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.sideEffects).toEqual([
      { type: "dispatch_agent", agentId: "pm", taskType: "Revise", documentType: "REQ" },
    ]);
  });

  it("FSPEC_REVIEW revision → FSPEC_CREATION with pm/Revise/FSPEC", () => {
    const state = makeReviewState(PdlcPhase.FSPEC_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_CREATION);
    expect(result.sideEffects).toContainEqual({
      type: "dispatch_agent",
      agentId: "pm",
      taskType: "Revise",
      documentType: "FSPEC",
    });
  });

  it("TSPEC_REVIEW revision (backend-only) → TSPEC_CREATION with eng/Revise/TSPEC", () => {
    const state = makeReviewState(PdlcPhase.TSPEC_REVIEW, {
      pm: "revision_requested",
      qa: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    expect(result.sideEffects).toContainEqual({
      type: "dispatch_agent",
      agentId: "eng",
      taskType: "Revise",
      documentType: "TSPEC",
    });
  });

  it("PROPERTIES_REVIEW revision → PROPERTIES_CREATION with qa/Revise/PROPERTIES", () => {
    const state = makeReviewState(PdlcPhase.PROPERTIES_REVIEW, {
      pm: "revision_requested",
      eng: "pending",
    });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.PROPERTIES_CREATION);
    expect(result.sideEffects).toContainEqual({
      type: "dispatch_agent",
      agentId: "qa",
      taskType: "Revise",
      documentType: "PROPERTIES",
    });
  });

  describe("fullstack multi-document revision", () => {
    it("emits Revise for rejected and Resubmit for approved sub-docs in TSPEC_REVIEW", () => {
      // Simulate: BE TSPEC rejected (non-scoped pm rejected), FE TSPEC approved
      const state = makeReviewState(
        PdlcPhase.TSPEC_REVIEW,
        {
          pm: "revision_requested",       // BE reviewer rejected
          "pm:fe_tspec": "approved",       // FE reviewer approved
          qa: "approved",
          "qa:fe_tspec": "approved",
          "fe:be_tspec": "approved",
          "eng:fe_tspec": "pending",
        },
        0,
        fullstackConfig(),
      );
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng:fe_tspec", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);

      // eng gets Revise (BE rejected), fe gets Resubmit (FE approved)
      const agentEffects = result.sideEffects.filter((e) => e.type === "dispatch_agent");
      expect(agentEffects).toContainEqual({
        type: "dispatch_agent",
        agentId: "eng",
        taskType: "Revise",
        documentType: "TSPEC",
      });
      expect(agentEffects).toContainEqual({
        type: "dispatch_agent",
        agentId: "fe",
        taskType: "Resubmit",
        documentType: "TSPEC",
      });
    });

    it("emits Revise for FE when FE-scoped reviewer rejected in TSPEC_REVIEW", () => {
      const state = makeReviewState(
        PdlcPhase.TSPEC_REVIEW,
        {
          pm: "approved",
          "pm:fe_tspec": "revision_requested",  // FE rejected
          qa: "approved",
          "qa:fe_tspec": "approved",
          "fe:be_tspec": "approved",
          "eng:fe_tspec": "pending",
        },
        0,
        fullstackConfig(),
      );
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng:fe_tspec", recommendation: "approved" },
        LATER,
      );
      const agentEffects = result.sideEffects.filter((e) => e.type === "dispatch_agent");
      expect(agentEffects).toContainEqual({
        type: "dispatch_agent",
        agentId: "eng",
        taskType: "Resubmit",
        documentType: "TSPEC",
      });
      expect(agentEffects).toContainEqual({
        type: "dispatch_agent",
        agentId: "fe",
        taskType: "Revise",
        documentType: "TSPEC",
      });
    });

    it("initializes forkJoin when returning to fullstack creation phase", () => {
      const state = makeReviewState(
        PdlcPhase.TSPEC_REVIEW,
        {
          pm: "revision_requested",
          "pm:fe_tspec": "approved",
          qa: "approved",
          "qa:fe_tspec": "approved",
          "fe:be_tspec": "approved",
          "eng:fe_tspec": "pending",
        },
        0,
        fullstackConfig(),
      );
      const result = transition(
        state,
        { type: "review_submitted", reviewerKey: "eng:fe_tspec", recommendation: "approved" },
        LATER,
      );
      expect(result.newState.forkJoin).toEqual({
        subtasks: { eng: "pending", fe: "pending" },
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Task 11: Revision bound
// ---------------------------------------------------------------------------

describe("transition() — revision bound", () => {
  it("emits pause_feature when revisionCount > 3", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    }, 3); // will be incremented to 4 (> 3)
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.sideEffects).toHaveLength(1);
    expect(result.sideEffects[0]).toMatchObject({
      type: "pause_feature",
      reason: "Revision bound exceeded",
    });
  });

  it("does not transition phase when revision bound exceeded", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    }, 3);
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    // Phase stays as REQ_REVIEW (not transitioned to creation)
    expect(result.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
  });

  it("records updated revisionCount even when paused", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    }, 3);
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    const rs = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(rs.revisionCount).toBe(4);
  });

  it("revisionCount = 3 still allows revision (boundary)", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, {
      eng: "revision_requested",
      qa: "pending",
    }, 2); // will be incremented to 3 (<= 3 so allowed)
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.REQ_CREATION);
    expect(result.sideEffects[0]).toMatchObject({ type: "dispatch_agent" });
  });
});

// ---------------------------------------------------------------------------
// Task 12: Auto-transitions
// ---------------------------------------------------------------------------

describe("transition() — auto-transitions", () => {
  it("REQ_APPROVED + auto → FSPEC_CREATION (skipFspec=false)", () => {
    const state = makeState({ phase: PdlcPhase.REQ_APPROVED, config: backendConfig() });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "pm",
      taskType: "Create",
      documentType: "FSPEC",
    });
  });

  it("REQ_APPROVED + auto → TSPEC_CREATION (skipFspec=true)", () => {
    const state = makeState({
      phase: PdlcPhase.REQ_APPROVED,
      config: backendConfig({ skipFspec: true }),
    });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "eng",
      taskType: "Create",
      documentType: "TSPEC",
    });
  });

  it("REQ_APPROVED (frontend-only, skipFspec) → TSPEC_CREATION with fe agent", () => {
    const state = makeState({
      phase: PdlcPhase.REQ_APPROVED,
      config: frontendConfig({ skipFspec: true }),
    });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "fe",
      taskType: "Create",
      documentType: "TSPEC",
    });
  });

  it("FSPEC_APPROVED + auto → TSPEC_CREATION", () => {
    const state = makeState({ phase: PdlcPhase.FSPEC_APPROVED });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "eng",
      documentType: "TSPEC",
    });
  });

  it("TSPEC_APPROVED + auto → PLAN_CREATION", () => {
    const state = makeState({ phase: PdlcPhase.TSPEC_APPROVED });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.PLAN_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "eng",
      documentType: "PLAN",
    });
  });

  it("PLAN_APPROVED + auto → PROPERTIES_CREATION with qa", () => {
    const state = makeState({ phase: PdlcPhase.PLAN_APPROVED });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.PROPERTIES_CREATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "qa",
      taskType: "Create",
      documentType: "PROPERTIES",
    });
  });

  it("PROPERTIES_APPROVED + auto → IMPLEMENTATION", () => {
    const state = makeState({ phase: PdlcPhase.PROPERTIES_APPROVED });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "eng",
      taskType: "Implement",
      documentType: "",
    });
  });

  it("PROPERTIES_APPROVED (frontend-only) → IMPLEMENTATION with fe agent", () => {
    const state = makeState({
      phase: PdlcPhase.PROPERTIES_APPROVED,
      config: frontendConfig(),
    });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.sideEffects[0]).toMatchObject({
      type: "dispatch_agent",
      agentId: "fe",
      taskType: "Implement",
    });
  });

  it("auto-transition to fullstack fork/join phase initializes forkJoin", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_APPROVED,
      config: fullstackConfig(),
    });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.PLAN_CREATION);
    expect(result.newState.forkJoin).toEqual({
      subtasks: { eng: "pending", fe: "pending" },
    });
  });

  it("auto-transition to non-fork/join phase has null forkJoin", () => {
    const state = makeState({
      phase: PdlcPhase.REQ_APPROVED,
      config: fullstackConfig(),
    });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_CREATION);
    expect(result.newState.forkJoin).toBeNull();
  });

  it("updates updatedAt timestamp", () => {
    const state = makeState({ phase: PdlcPhase.REQ_APPROVED });
    const result = transition(state, { type: "auto" }, LATER);
    expect(result.newState.updatedAt).toBe(LATER);
  });
});

// ---------------------------------------------------------------------------
// Task 13: Fork/join (fullstack)
// ---------------------------------------------------------------------------

describe("transition() — fork/join (fullstack)", () => {
  function fullstackCreationState(phase: PdlcPhase): FeatureState {
    return makeState({
      phase,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "pending", fe: "pending" } },
    });
  }

  it("subtask_complete marks subtask as complete", () => {
    const state = fullstackCreationState(PdlcPhase.TSPEC_CREATION);
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "eng" },
      LATER,
    );
    expect(result.newState.forkJoin!.subtasks.eng).toBe("complete");
    expect(result.newState.forkJoin!.subtasks.fe).toBe("pending");
  });

  it("partial completion: no transition, no side effects", () => {
    const state = fullstackCreationState(PdlcPhase.TSPEC_CREATION);
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "eng" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    expect(result.sideEffects).toEqual([]);
  });

  it("all complete: transitions to review phase", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_REVIEW);
  });

  it("all complete: clears forkJoin to null", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    expect(result.newState.forkJoin).toBeNull();
  });

  it("all complete: emits dispatch_reviewers", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    expect(result.sideEffects[0]).toMatchObject({ type: "dispatch_reviewers" });
  });

  it("PLAN_CREATION fork/join works the same", () => {
    const state = makeState({
      phase: PdlcPhase.PLAN_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.PLAN_REVIEW);
  });

  it("IMPLEMENTATION fork/join works the same", () => {
    const state = makeState({
      phase: PdlcPhase.IMPLEMENTATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);
  });

  it("fullstack TSPEC_REVIEW reviewers include composite keys", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "complete", fe: "pending" } },
    });
    const result = transition(
      state,
      { type: "subtask_complete", agentId: "fe" },
      LATER,
    );
    const effect = result.sideEffects[0] as { type: "dispatch_reviewers"; reviewerKeys: string[] };
    expect(effect.reviewerKeys).toEqual([
      "pm", "pm:fe_tspec", "qa", "qa:fe_tspec", "fe:be_tspec", "eng:fe_tspec",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Task 14: Terminal state + errors
// ---------------------------------------------------------------------------

describe("transition() — terminal state and errors", () => {
  it("DONE phase throws InvalidTransitionError for any event", () => {
    const state = makeState({ phase: PdlcPhase.DONE });
    expect(() => transition(state, { type: "lgtm", agentId: "pm" }, LATER)).toThrow(
      InvalidTransitionError,
    );
  });

  it("DONE error has empty validEvents", () => {
    const state = makeState({ phase: PdlcPhase.DONE });
    try {
      transition(state, { type: "auto" }, LATER);
      expect.fail("should throw");
    } catch (e) {
      const err = e as InvalidTransitionError;
      expect(err.validEvents).toEqual([]);
      expect(err.phase).toBe(PdlcPhase.DONE);
    }
  });

  it("review_submitted in creation phase throws InvalidTransitionError", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    expect(() =>
      transition(
        state,
        { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" },
        LATER,
      ),
    ).toThrow(InvalidTransitionError);
  });

  it("auto event in creation phase throws InvalidTransitionError", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    expect(() => transition(state, { type: "auto" }, LATER)).toThrow(InvalidTransitionError);
  });

  it("lgtm in approved phase throws InvalidTransitionError", () => {
    const state = makeState({ phase: PdlcPhase.REQ_APPROVED });
    expect(() => transition(state, { type: "lgtm", agentId: "pm" }, LATER)).toThrow(
      InvalidTransitionError,
    );
  });

  it("InvalidTransitionError message includes valid events", () => {
    const state = makeState({ phase: PdlcPhase.REQ_CREATION });
    try {
      transition(state, { type: "auto" }, LATER);
      expect.fail("should throw");
    } catch (e) {
      const err = e as InvalidTransitionError;
      expect(err.message).toContain("lgtm");
      expect(err.eventType).toBe("auto");
    }
  });
});

// ---------------------------------------------------------------------------
// Task 15: Edge cases
// ---------------------------------------------------------------------------

describe("transition() — edge cases", () => {
  it("lgtm in review phase emits log_warning, state unchanged", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "pending", qa: "pending" });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
    expect(result.sideEffects).toHaveLength(1);
    expect(result.sideEffects[0]).toMatchObject({ type: "log_warning" });
  });

  it("lgtm in review phase updates updatedAt but preserves reviewer statuses", () => {
    const state = makeReviewState(PdlcPhase.REQ_REVIEW, { eng: "pending", qa: "pending" });
    const result = transition(state, { type: "lgtm", agentId: "pm" }, LATER);
    expect(result.newState.updatedAt).toBe(LATER);
    const rs = result.newState.reviewPhases[PdlcPhase.REQ_REVIEW]!;
    expect(rs.reviewerStatuses.eng).toBe("pending");
    expect(rs.reviewerStatuses.qa).toBe("pending");
  });

  it("subtask_complete in non-fullstack feature throws InvalidTransitionError", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: backendConfig(),
    });
    expect(() =>
      transition(state, { type: "subtask_complete", agentId: "eng" }, LATER),
    ).toThrow(InvalidTransitionError);
  });

  it("subtask_complete from unknown agentId throws InvalidTransitionError", () => {
    const state = makeState({
      phase: PdlcPhase.TSPEC_CREATION,
      config: fullstackConfig(),
      forkJoin: { subtasks: { eng: "pending", fe: "pending" } },
    });
    expect(() =>
      transition(state, { type: "subtask_complete", agentId: "unknown" }, LATER),
    ).toThrow(InvalidTransitionError);
  });

  it("subtask_complete in non-fork/join creation phase (no forkJoin state) throws", () => {
    const state = makeState({
      phase: PdlcPhase.REQ_CREATION,
      config: backendConfig(),
    });
    expect(() =>
      transition(state, { type: "subtask_complete", agentId: "eng" }, LATER),
    ).toThrow(InvalidTransitionError);
  });

  it("review_submitted in IMPLEMENTATION_REVIEW properly flows to DONE", () => {
    const state = makeReviewState(PdlcPhase.IMPLEMENTATION_REVIEW, { qa: "pending" });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.DONE);
    expect(result.newState.completedAt).toBe(LATER);
  });

  it("IMPLEMENTATION_REVIEW revision → IMPLEMENTATION", () => {
    const state = makeReviewState(PdlcPhase.IMPLEMENTATION_REVIEW, { qa: "pending" });
    const result = transition(
      state,
      { type: "review_submitted", reviewerKey: "qa", recommendation: "revision_requested" },
      LATER,
    );
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION);
  });
});

// ---------------------------------------------------------------------------
// End-to-end flow tests
// ---------------------------------------------------------------------------

describe("transition() — end-to-end flow (backend-only, no skipFspec)", () => {
  it("progresses REQ_CREATION through DONE", () => {
    const config = backendConfig();
    let state = createFeatureState("e2e-feature", config, NOW);
    let t: string;

    // 1. REQ_CREATION → lgtm → REQ_REVIEW
    t = "2026-03-14T00:01:00Z";
    let result = transition(state, { type: "lgtm", agentId: "pm" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.REQ_REVIEW);
    state = result.newState;

    // 2. REQ_REVIEW → reviews → REQ_APPROVED
    t = "2026-03-14T00:02:00Z";
    result = transition(state, { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.REQ_APPROVED);
    state = result.newState;

    // 3. REQ_APPROVED → auto → FSPEC_CREATION
    t = "2026-03-14T00:03:00Z";
    result = transition(state, { type: "auto" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_CREATION);
    state = result.newState;

    // 4. FSPEC_CREATION → lgtm → FSPEC_REVIEW
    result = transition(state, { type: "lgtm", agentId: "pm" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_REVIEW);
    state = result.newState;

    // 5. FSPEC_REVIEW → all approved → FSPEC_APPROVED
    result = transition(state, { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.FSPEC_APPROVED);
    state = result.newState;

    // 6. FSPEC_APPROVED → auto → TSPEC_CREATION
    result = transition(state, { type: "auto" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_CREATION);
    state = result.newState;

    // 7. TSPEC_CREATION → lgtm → TSPEC_REVIEW → all approved → TSPEC_APPROVED
    result = transition(state, { type: "lgtm", agentId: "eng" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "pm", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.TSPEC_APPROVED);
    state = result.newState;

    // 8. TSPEC_APPROVED → auto → PLAN_CREATION
    result = transition(state, { type: "auto" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.PLAN_CREATION);
    state = result.newState;

    // 9. PLAN flow
    result = transition(state, { type: "lgtm", agentId: "eng" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "pm", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "auto" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.PROPERTIES_CREATION);
    state = result.newState;

    // 10. PROPERTIES flow
    result = transition(state, { type: "lgtm", agentId: "qa" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "pm", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "review_submitted", reviewerKey: "eng", recommendation: "approved" }, t);
    state = result.newState;
    result = transition(state, { type: "auto" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION);
    state = result.newState;

    // 11. IMPLEMENTATION → lgtm → IMPLEMENTATION_REVIEW
    result = transition(state, { type: "lgtm", agentId: "eng" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);
    state = result.newState;

    // 12. IMPLEMENTATION_REVIEW → approved → DONE
    result = transition(state, { type: "review_submitted", reviewerKey: "qa", recommendation: "approved" }, t);
    expect(result.newState.phase).toBe(PdlcPhase.DONE);
    expect(result.newState.completedAt).toBe(t);
  });
});
