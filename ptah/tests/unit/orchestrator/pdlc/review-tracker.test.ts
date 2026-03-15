import { describe, it, expect } from "vitest";
import {
  computeReviewerManifest,
  reviewerKey,
  initializeReviewPhaseState,
  evaluateReviewOutcome,
} from "../../../../src/orchestrator/pdlc/review-tracker.js";
import { PdlcPhase } from "../../../../src/orchestrator/pdlc/phases.js";
import type {
  Discipline,
  ReviewerManifestEntry,
  ReviewPhaseState,
} from "../../../../src/orchestrator/pdlc/phases.js";

// --- Helper to extract agentId:scope keys from manifest ---
function manifestKeys(entries: ReviewerManifestEntry[]): string[] {
  return entries.map((e) => reviewerKey(e));
}

// ============================================================
// Task 16: computeReviewerManifest()
// ============================================================

describe("computeReviewerManifest", () => {
  // --- REQ_REVIEW ---

  describe("REQ_REVIEW", () => {
    it("backend-only returns [eng, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.REQ_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["eng", "qa"]);
    });

    it("frontend-only returns [fe, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.REQ_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["fe", "qa"]);
    });

    it("fullstack returns [eng, fe, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.REQ_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual(["eng", "fe", "qa"]);
    });
  });

  // --- FSPEC_REVIEW ---

  describe("FSPEC_REVIEW", () => {
    it("backend-only returns [eng, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.FSPEC_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["eng", "qa"]);
    });

    it("frontend-only returns [fe, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.FSPEC_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["fe", "qa"]);
    });

    it("fullstack returns [eng, fe, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.FSPEC_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual(["eng", "fe", "qa"]);
    });
  });

  // --- TSPEC_REVIEW ---

  describe("TSPEC_REVIEW", () => {
    it("backend-only returns [pm, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.TSPEC_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["pm", "qa"]);
    });

    it("frontend-only returns [pm, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.TSPEC_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["pm", "qa"]);
    });

    it("fullstack returns 6 entries with scoped keys", () => {
      const result = computeReviewerManifest(PdlcPhase.TSPEC_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual([
        "pm",
        "pm:fe_tspec",
        "qa",
        "qa:fe_tspec",
        "fe:be_tspec",
        "eng:fe_tspec",
      ]);
    });

    it("fullstack entries have correct agentId and scope fields", () => {
      const result = computeReviewerManifest(PdlcPhase.TSPEC_REVIEW, "fullstack");
      expect(result).toEqual([
        { agentId: "pm" },
        { agentId: "pm", scope: "fe_tspec" },
        { agentId: "qa" },
        { agentId: "qa", scope: "fe_tspec" },
        { agentId: "fe", scope: "be_tspec" },
        { agentId: "eng", scope: "fe_tspec" },
      ]);
    });
  });

  // --- PLAN_REVIEW ---

  describe("PLAN_REVIEW", () => {
    it("backend-only returns [pm, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.PLAN_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["pm", "qa"]);
    });

    it("frontend-only returns [pm, qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.PLAN_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["pm", "qa"]);
    });

    it("fullstack returns 6 entries with scoped keys", () => {
      const result = computeReviewerManifest(PdlcPhase.PLAN_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual([
        "pm",
        "pm:fe_plan",
        "qa",
        "qa:fe_plan",
        "fe:be_plan",
        "eng:fe_plan",
      ]);
    });

    it("fullstack entries have correct agentId and scope fields", () => {
      const result = computeReviewerManifest(PdlcPhase.PLAN_REVIEW, "fullstack");
      expect(result).toEqual([
        { agentId: "pm" },
        { agentId: "pm", scope: "fe_plan" },
        { agentId: "qa" },
        { agentId: "qa", scope: "fe_plan" },
        { agentId: "fe", scope: "be_plan" },
        { agentId: "eng", scope: "fe_plan" },
      ]);
    });
  });

  // --- PROPERTIES_REVIEW ---

  describe("PROPERTIES_REVIEW", () => {
    it("backend-only returns [pm, eng]", () => {
      const result = computeReviewerManifest(PdlcPhase.PROPERTIES_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["pm", "eng"]);
    });

    it("frontend-only returns [pm, fe]", () => {
      const result = computeReviewerManifest(PdlcPhase.PROPERTIES_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["pm", "fe"]);
    });

    it("fullstack returns [pm, eng, fe]", () => {
      const result = computeReviewerManifest(PdlcPhase.PROPERTIES_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual(["pm", "eng", "fe"]);
    });
  });

  // --- IMPLEMENTATION_REVIEW ---

  describe("IMPLEMENTATION_REVIEW", () => {
    it("backend-only returns [qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.IMPLEMENTATION_REVIEW, "backend-only");
      expect(manifestKeys(result)).toEqual(["qa"]);
    });

    it("frontend-only returns [qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.IMPLEMENTATION_REVIEW, "frontend-only");
      expect(manifestKeys(result)).toEqual(["qa"]);
    });

    it("fullstack returns [qa]", () => {
      const result = computeReviewerManifest(PdlcPhase.IMPLEMENTATION_REVIEW, "fullstack");
      expect(manifestKeys(result)).toEqual(["qa"]);
    });
  });

  // --- Structural assertions ---

  describe("manifest entry structure", () => {
    it("non-scoped entries have no scope property", () => {
      const result = computeReviewerManifest(PdlcPhase.REQ_REVIEW, "backend-only");
      for (const entry of result) {
        expect(entry.scope).toBeUndefined();
      }
    });

    it("fullstack TSPEC_REVIEW scoped entries have scope defined", () => {
      const result = computeReviewerManifest(PdlcPhase.TSPEC_REVIEW, "fullstack");
      const scoped = result.filter((e) => e.scope !== undefined);
      expect(scoped.length).toBe(4);
    });

    it("fullstack PLAN_REVIEW scoped entries have scope defined", () => {
      const result = computeReviewerManifest(PdlcPhase.PLAN_REVIEW, "fullstack");
      const scoped = result.filter((e) => e.scope !== undefined);
      expect(scoped.length).toBe(4);
    });
  });
});

// ============================================================
// Task 17: reviewerKey()
// ============================================================

describe("reviewerKey", () => {
  it("returns agentId when scope is undefined", () => {
    expect(reviewerKey({ agentId: "eng" })).toBe("eng");
  });

  it("returns agentId:scope when scope is defined", () => {
    expect(reviewerKey({ agentId: "pm", scope: "fe_tspec" })).toBe("pm:fe_tspec");
  });

  it("returns agentId:scope for peer review entries", () => {
    expect(reviewerKey({ agentId: "fe", scope: "be_tspec" })).toBe("fe:be_tspec");
  });

  it("returns agentId:scope for plan scopes", () => {
    expect(reviewerKey({ agentId: "qa", scope: "fe_plan" })).toBe("qa:fe_plan");
  });

  it("handles empty string scope as defined", () => {
    expect(reviewerKey({ agentId: "eng", scope: "" })).toBe("eng:");
  });
});

// ============================================================
// Task 17: initializeReviewPhaseState()
// ============================================================

describe("initializeReviewPhaseState", () => {
  it("creates reviewerStatuses with all entries set to pending", () => {
    const manifest: ReviewerManifestEntry[] = [
      { agentId: "eng" },
      { agentId: "qa" },
    ];
    const state = initializeReviewPhaseState(manifest);
    expect(state.reviewerStatuses).toEqual({
      eng: "pending",
      qa: "pending",
    });
  });

  it("sets revisionCount to 0", () => {
    const manifest: ReviewerManifestEntry[] = [{ agentId: "eng" }];
    const state = initializeReviewPhaseState(manifest);
    expect(state.revisionCount).toBe(0);
  });

  it("handles scoped entries correctly", () => {
    const manifest: ReviewerManifestEntry[] = [
      { agentId: "pm" },
      { agentId: "pm", scope: "fe_tspec" },
      { agentId: "qa" },
      { agentId: "qa", scope: "fe_tspec" },
      { agentId: "fe", scope: "be_tspec" },
      { agentId: "eng", scope: "fe_tspec" },
    ];
    const state = initializeReviewPhaseState(manifest);
    expect(state.reviewerStatuses).toEqual({
      pm: "pending",
      "pm:fe_tspec": "pending",
      qa: "pending",
      "qa:fe_tspec": "pending",
      "fe:be_tspec": "pending",
      "eng:fe_tspec": "pending",
    });
  });

  it("handles empty manifest", () => {
    const state = initializeReviewPhaseState([]);
    expect(state.reviewerStatuses).toEqual({});
    expect(state.revisionCount).toBe(0);
  });

  it("handles single entry manifest", () => {
    const manifest: ReviewerManifestEntry[] = [{ agentId: "qa" }];
    const state = initializeReviewPhaseState(manifest);
    expect(state.reviewerStatuses).toEqual({ qa: "pending" });
  });
});

// ============================================================
// Task 17: evaluateReviewOutcome()
// ============================================================

describe("evaluateReviewOutcome", () => {
  it("returns all_approved when every status is approved", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "approved",
        qa: "approved",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("all_approved");
  });

  it("returns pending when some reviewers are still pending", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "approved",
        qa: "pending",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("pending");
  });

  it("returns pending when all reviewers are pending", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "pending",
        qa: "pending",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("pending");
  });

  it("returns has_revision_requested when at least one revision_requested and none pending", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "approved",
        qa: "revision_requested",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("has_revision_requested");
  });

  it("returns pending when revision_requested exists alongside pending", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "revision_requested",
        qa: "pending",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("pending");
  });

  it("returns has_revision_requested when all are revision_requested", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "revision_requested",
        qa: "revision_requested",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("has_revision_requested");
  });

  it("returns all_approved for single approved reviewer", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        qa: "approved",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("all_approved");
  });

  it("returns all_approved for empty reviewerStatuses", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {},
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("all_approved");
  });

  it("handles fullstack TSPEC_REVIEW with mixed statuses (some pending)", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        pm: "approved",
        "pm:fe_tspec": "approved",
        qa: "pending",
        "qa:fe_tspec": "approved",
        "fe:be_tspec": "approved",
        "eng:fe_tspec": "pending",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("pending");
  });

  it("handles fullstack TSPEC_REVIEW all approved", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        pm: "approved",
        "pm:fe_tspec": "approved",
        qa: "approved",
        "qa:fe_tspec": "approved",
        "fe:be_tspec": "approved",
        "eng:fe_tspec": "approved",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("all_approved");
  });

  it("handles fullstack TSPEC_REVIEW with revision requested and no pending", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        pm: "approved",
        "pm:fe_tspec": "revision_requested",
        qa: "approved",
        "qa:fe_tspec": "approved",
        "fe:be_tspec": "approved",
        "eng:fe_tspec": "approved",
      },
      revisionCount: 0,
    };
    expect(evaluateReviewOutcome(state)).toBe("has_revision_requested");
  });

  it("ignores revisionCount in evaluation logic", () => {
    const state: ReviewPhaseState = {
      reviewerStatuses: {
        eng: "approved",
        qa: "approved",
      },
      revisionCount: 3,
    };
    expect(evaluateReviewOutcome(state)).toBe("all_approved");
  });
});

// ============================================================
// Task 18: Error cases
// ============================================================

describe("error cases", () => {
  describe("non-review phases throw", () => {
    const nonReviewPhases = [
      PdlcPhase.REQ_CREATION,
      PdlcPhase.REQ_APPROVED,
      PdlcPhase.FSPEC_CREATION,
      PdlcPhase.FSPEC_APPROVED,
      PdlcPhase.TSPEC_CREATION,
      PdlcPhase.TSPEC_APPROVED,
      PdlcPhase.PLAN_CREATION,
      PdlcPhase.PLAN_APPROVED,
      PdlcPhase.PROPERTIES_CREATION,
      PdlcPhase.PROPERTIES_APPROVED,
      PdlcPhase.IMPLEMENTATION,
      PdlcPhase.DONE,
    ];

    for (const phase of nonReviewPhases) {
      it(`throws for ${phase}`, () => {
        expect(() => computeReviewerManifest(phase, "backend-only")).toThrow(
          `Phase ${phase} is not a review phase`,
        );
      });
    }
  });

  describe("unknown discipline throws", () => {
    it("throws for unknown discipline value", () => {
      expect(() =>
        computeReviewerManifest(PdlcPhase.REQ_REVIEW, "mobile" as Discipline),
      ).toThrow("Unknown discipline: mobile");
    });

    it("throws for empty string discipline", () => {
      expect(() =>
        computeReviewerManifest(PdlcPhase.REQ_REVIEW, "" as Discipline),
      ).toThrow("Unknown discipline: ");
    });
  });

  describe("non-review phase error message format", () => {
    it("includes the phase name in the error", () => {
      expect(() =>
        computeReviewerManifest(PdlcPhase.REQ_CREATION, "backend-only"),
      ).toThrow("Phase REQ_CREATION is not a review phase");
    });

    it("includes the phase name for IMPLEMENTATION", () => {
      expect(() =>
        computeReviewerManifest(PdlcPhase.IMPLEMENTATION, "fullstack"),
      ).toThrow("Phase IMPLEMENTATION is not a review phase");
    });

    it("includes the phase name for DONE", () => {
      expect(() =>
        computeReviewerManifest(PdlcPhase.DONE, "frontend-only"),
      ).toThrow("Phase DONE is not a review phase");
    });
  });
});

// ============================================================
// Integration: computeReviewerManifest → initializeReviewPhaseState
// ============================================================

describe("integration: manifest → initialize → evaluate", () => {
  const disciplines: Discipline[] = ["backend-only", "frontend-only", "fullstack"];
  const reviewPhases = [
    PdlcPhase.REQ_REVIEW,
    PdlcPhase.FSPEC_REVIEW,
    PdlcPhase.TSPEC_REVIEW,
    PdlcPhase.PLAN_REVIEW,
    PdlcPhase.PROPERTIES_REVIEW,
    PdlcPhase.IMPLEMENTATION_REVIEW,
  ];

  for (const phase of reviewPhases) {
    for (const discipline of disciplines) {
      it(`${phase} + ${discipline}: initialized state evaluates to pending`, () => {
        const manifest = computeReviewerManifest(phase, discipline);
        const state = initializeReviewPhaseState(manifest);
        expect(evaluateReviewOutcome(state)).toBe("pending");
      });

      it(`${phase} + ${discipline}: all approved evaluates to all_approved`, () => {
        const manifest = computeReviewerManifest(phase, discipline);
        const state = initializeReviewPhaseState(manifest);
        // Set all to approved
        for (const key of Object.keys(state.reviewerStatuses)) {
          state.reviewerStatuses[key] = "approved";
        }
        expect(evaluateReviewOutcome(state)).toBe("all_approved");
      });
    }
  }
});
