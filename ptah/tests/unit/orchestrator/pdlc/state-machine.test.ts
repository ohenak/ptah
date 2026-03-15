import { describe, it, expect } from "vitest";
import {
  PdlcPhase,
  InvalidTransitionError,
  UnknownFeatureError,
  type Discipline,
  type FeatureConfig,
  type PdlcEvent,
  type ReviewRecommendation,
  type ReviewerStatus,
  type ReviewPhaseState,
  type SubTaskStatus,
  type ForkJoinState,
  type FeatureState,
  type PdlcStateFile,
  type TransitionResult,
  type SideEffect,
  type TaskType,
  type DocumentType,
  type ReviewerManifestEntry,
  type ContextDocument,
  type ContextDocumentSet,
  type DispatchAction,
  type AgentDispatch,
  type ParsedRecommendation,
} from "../../../../src/orchestrator/pdlc/phases.js";

describe("PDLC types — import verification", () => {
  it("exports PdlcPhase enum with 18 phases", () => {
    const phases = Object.values(PdlcPhase);
    expect(phases).toHaveLength(18);
    expect(phases).toContain("REQ_CREATION");
    expect(phases).toContain("DONE");
  });

  it("exports InvalidTransitionError with phase, eventType, and validEvents", () => {
    const error = new InvalidTransitionError(
      PdlcPhase.REQ_CREATION,
      "all_approved",
      ["lgtm"],
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidTransitionError");
    expect(error.phase).toBe(PdlcPhase.REQ_CREATION);
    expect(error.eventType).toBe("all_approved");
    expect(error.validEvents).toEqual(["lgtm"]);
    expect(error.message).toContain("Invalid event 'all_approved'");
    expect(error.message).toContain("REQ_CREATION");
  });

  it("exports UnknownFeatureError with slug", () => {
    const error = new UnknownFeatureError("my-feature");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnknownFeatureError");
    expect(error.slug).toBe("my-feature");
    expect(error.message).toContain("my-feature");
  });

  it("PdlcPhase enum values match their keys", () => {
    for (const [key, value] of Object.entries(PdlcPhase)) {
      expect(key).toBe(value);
    }
  });
});
