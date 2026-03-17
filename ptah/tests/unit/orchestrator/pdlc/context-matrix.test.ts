import { describe, it, expect } from "vitest";
import { getContextDocuments } from "../../../../src/orchestrator/pdlc/context-matrix.js";
import { PdlcPhase } from "../../../../src/orchestrator/pdlc/phases.js";
import type { FeatureConfig, ContextDocument } from "../../../../src/orchestrator/pdlc/phases.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SLUG = "011-orchestrator-pdlc-state-machine";
const PREFIX = "011";
const FEATURE = "orchestrator-pdlc-state-machine";
const DOC_DIR = `docs/${SLUG}`;

const defaultConfig: FeatureConfig = {
  discipline: "backend-only",
  skipFspec: false,
};

const skipFspecConfig: FeatureConfig = {
  discipline: "backend-only",
  skipFspec: true,
};

const fullstackConfig: FeatureConfig = {
  discipline: "fullstack",
  skipFspec: false,
};

function docTypes(docs: ContextDocument[]): string[] {
  return docs.map((d) => d.type);
}

function docPaths(docs: ContextDocument[]): string[] {
  return docs.map((d) => d.relativePath);
}

// ---------------------------------------------------------------------------
// Task 22: Creation phase matrix
// ---------------------------------------------------------------------------

describe("context-matrix", () => {
  describe("Creation phases", () => {
    it("REQ_CREATION returns overview.md only", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toEqual({
        type: "overview",
        relativePath: `${DOC_DIR}/overview.md`,
        required: true,
      });
    });

    it("FSPEC_CREATION returns overview.md and REQ", () => {
      const result = getContextDocuments(PdlcPhase.FSPEC_CREATION, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["overview", "req"]);
      expect(result.documents[0]!.relativePath).toBe(`${DOC_DIR}/overview.md`);
      expect(result.documents[1]!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-REQ-${FEATURE}.md`,
      );
    });

    it("TSPEC_CREATION returns overview, REQ, and FSPEC when skipFspec=false", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_CREATION, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["overview", "req", "fspec"]);
      expect(result.documents[2]!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-FSPEC-${FEATURE}.md`,
      );
    });

    it("TSPEC_CREATION excludes FSPEC when skipFspec=true", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_CREATION, SLUG, skipFspecConfig);
      expect(docTypes(result.documents)).toEqual(["overview", "req"]);
    });

    it("PLAN_CREATION returns overview and TSPEC", () => {
      const result = getContextDocuments(PdlcPhase.PLAN_CREATION, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["overview", "tspec"]);
      expect(result.documents[1]!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-TSPEC-${FEATURE}.md`,
      );
    });

    it("PROPERTIES_CREATION returns overview, REQ, FSPEC, TSPEC, PLAN", () => {
      const result = getContextDocuments(
        PdlcPhase.PROPERTIES_CREATION,
        SLUG,
        defaultConfig,
      );
      expect(docTypes(result.documents)).toEqual([
        "overview",
        "req",
        "fspec",
        "tspec",
        "plan",
      ]);
    });

    it("PROPERTIES_CREATION excludes FSPEC when skipFspec=true", () => {
      const result = getContextDocuments(
        PdlcPhase.PROPERTIES_CREATION,
        SLUG,
        skipFspecConfig,
      );
      expect(docTypes(result.documents)).toEqual([
        "overview",
        "req",
        "tspec",
        "plan",
      ]);
    });

    it("IMPLEMENTATION returns TSPEC, PLAN, PROPERTIES", () => {
      const result = getContextDocuments(PdlcPhase.IMPLEMENTATION, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["tspec", "plan", "properties"]);
    });

    it("IMPLEMENTATION_REVIEW returns TSPEC, PLAN, PROPERTIES", () => {
      const result = getContextDocuments(
        PdlcPhase.IMPLEMENTATION_REVIEW,
        SLUG,
        defaultConfig,
      );
      expect(docTypes(result.documents)).toEqual(["tspec", "plan", "properties"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 22: Path resolution
  // ---------------------------------------------------------------------------

  describe("Path resolution", () => {
    it("generates correct REQ path", () => {
      const result = getContextDocuments(PdlcPhase.FSPEC_CREATION, SLUG, defaultConfig);
      const reqDoc = result.documents.find((d) => d.type === "req");
      expect(reqDoc!.relativePath).toBe(
        `docs/011-orchestrator-pdlc-state-machine/011-REQ-orchestrator-pdlc-state-machine.md`,
      );
    });

    it("generates correct PLAN path (PLAN pattern)", () => {
      const result = getContextDocuments(PdlcPhase.PLAN_CREATION, SLUG, defaultConfig);
      const planDoc = result.documents.find((d) => d.type === "tspec");
      // The TSPEC is the context for PLAN_CREATION
      expect(planDoc!.relativePath).toBe(
        `docs/011-orchestrator-pdlc-state-machine/011-TSPEC-orchestrator-pdlc-state-machine.md`,
      );
    });

    it("generates correct PLAN document path", () => {
      const result = getContextDocuments(PdlcPhase.PLAN_REVIEW, SLUG, defaultConfig);
      const plan = result.documents.find((d) => d.type === "plan");
      expect(plan!.relativePath).toBe(
        `docs/011-orchestrator-pdlc-state-machine/011-PLAN-orchestrator-pdlc-state-machine.md`,
      );
    });

    it("extracts NNN prefix correctly from different slugs", () => {
      const slug = "042-my-feature";
      const result = getContextDocuments(PdlcPhase.FSPEC_CREATION, slug, defaultConfig);
      const reqDoc = result.documents.find((d) => d.type === "req");
      expect(reqDoc!.relativePath).toBe("docs/042-my-feature/042-REQ-my-feature.md");
    });

    it("handles slug with no hyphens gracefully", () => {
      const slug = "feature";
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, slug, defaultConfig);
      expect(result.documents[0]!.relativePath).toBe("docs/feature/overview.md");
    });
  });

  // ---------------------------------------------------------------------------
  // Task 23: Review phase matrix
  // ---------------------------------------------------------------------------

  describe("Review phases", () => {
    it("REQ_REVIEW returns REQ and overview", () => {
      const result = getContextDocuments(PdlcPhase.REQ_REVIEW, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["req", "overview"]);
    });

    it("FSPEC_REVIEW returns FSPEC (required) and REQ", () => {
      const result = getContextDocuments(PdlcPhase.FSPEC_REVIEW, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["fspec", "req"]);
      // The FSPEC under review should be required
      const fspec = result.documents.find((d) => d.type === "fspec");
      expect(fspec!.required).toBe(true);
    });

    it("TSPEC_REVIEW returns TSPEC, REQ, and FSPEC when not skipped", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_REVIEW, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["tspec", "req", "fspec"]);
    });

    it("TSPEC_REVIEW excludes FSPEC when skipFspec=true", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_REVIEW, SLUG, skipFspecConfig);
      expect(docTypes(result.documents)).toEqual(["tspec", "req"]);
    });

    it("PLAN_REVIEW returns PLAN and TSPEC", () => {
      const result = getContextDocuments(PdlcPhase.PLAN_REVIEW, SLUG, defaultConfig);
      expect(docTypes(result.documents)).toEqual(["plan", "tspec"]);
    });

    it("PROPERTIES_REVIEW returns PROPERTIES, REQ, TSPEC, PLAN", () => {
      const result = getContextDocuments(
        PdlcPhase.PROPERTIES_REVIEW,
        SLUG,
        defaultConfig,
      );
      expect(docTypes(result.documents)).toEqual([
        "properties",
        "req",
        "tspec",
        "plan",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 23: Revision context augmentation
  // ---------------------------------------------------------------------------

  describe("Revision context augmentation", () => {
    it("adds cross-review documents when isRevision=true for REQ_CREATION", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig, {
        isRevision: true,
      });
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(1);
      expect(crossReviews[0]!.relativePath).toBe(
        `${DOC_DIR}/CROSS-REVIEW-*-REQ.md`,
      );
      expect(crossReviews[0]!.required).toBe(false);
    });

    it("adds cross-review for FSPEC_CREATION revision", () => {
      const result = getContextDocuments(
        PdlcPhase.FSPEC_CREATION,
        SLUG,
        defaultConfig,
        { isRevision: true },
      );
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(1);
      expect(crossReviews[0]!.relativePath).toBe(
        `${DOC_DIR}/CROSS-REVIEW-*-FSPEC.md`,
      );
    });

    it("adds cross-review for TSPEC_CREATION revision", () => {
      const result = getContextDocuments(
        PdlcPhase.TSPEC_CREATION,
        SLUG,
        defaultConfig,
        { isRevision: true },
      );
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(1);
      expect(crossReviews[0]!.relativePath).toContain("CROSS-REVIEW-*-TSPEC.md");
    });

    it("adds cross-review for PLAN_CREATION revision", () => {
      const result = getContextDocuments(
        PdlcPhase.PLAN_CREATION,
        SLUG,
        defaultConfig,
        { isRevision: true },
      );
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(1);
      expect(crossReviews[0]!.relativePath).toContain("CROSS-REVIEW-*-PLAN.md");
    });

    it("adds cross-review for PROPERTIES_CREATION revision", () => {
      const result = getContextDocuments(
        PdlcPhase.PROPERTIES_CREATION,
        SLUG,
        defaultConfig,
        { isRevision: true },
      );
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(1);
      expect(crossReviews[0]!.relativePath).toContain("CROSS-REVIEW-*-PROPERTIES.md");
    });

    it("does NOT add cross-review when isRevision=false", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig, {
        isRevision: false,
      });
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(0);
    });

    it("does NOT add cross-review for review phases even when isRevision=true", () => {
      const result = getContextDocuments(PdlcPhase.REQ_REVIEW, SLUG, defaultConfig, {
        isRevision: true,
      });
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(0);
    });

    it("does NOT add cross-review for IMPLEMENTATION (no review doc type)", () => {
      const result = getContextDocuments(PdlcPhase.IMPLEMENTATION, SLUG, defaultConfig, {
        isRevision: true,
      });
      const crossReviews = result.documents.filter((d) => d.type === "cross_review");
      expect(crossReviews).toHaveLength(0);
    });

    it("includes standard creation docs alongside cross-review in revision", () => {
      const result = getContextDocuments(
        PdlcPhase.FSPEC_CREATION,
        SLUG,
        defaultConfig,
        { isRevision: true },
      );
      // Should have overview, req, plus cross_review
      expect(docTypes(result.documents)).toEqual([
        "overview",
        "req",
        "cross_review",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 24: Fullstack scope filtering
  // ---------------------------------------------------------------------------

  describe("Fullstack scope filtering", () => {
    it("PLAN_CREATION with agentScope='be' uses backend TSPEC path", () => {
      const result = getContextDocuments(
        PdlcPhase.PLAN_CREATION,
        SLUG,
        fullstackConfig,
        { agentScope: "be" },
      );
      const tspec = result.documents.find((d) => d.type === "tspec");
      expect(tspec!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-TSPEC-be-${FEATURE}.md`,
      );
    });

    it("PLAN_CREATION with agentScope='fe' uses frontend TSPEC path", () => {
      const result = getContextDocuments(
        PdlcPhase.PLAN_CREATION,
        SLUG,
        fullstackConfig,
        { agentScope: "fe" },
      );
      const tspec = result.documents.find((d) => d.type === "tspec");
      expect(tspec!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-TSPEC-fe-${FEATURE}.md`,
      );
    });

    it("PLAN_CREATION without agentScope uses standard TSPEC path", () => {
      const result = getContextDocuments(
        PdlcPhase.PLAN_CREATION,
        SLUG,
        fullstackConfig,
      );
      const tspec = result.documents.find((d) => d.type === "tspec");
      expect(tspec!.relativePath).toBe(
        `${DOC_DIR}/${PREFIX}-TSPEC-${FEATURE}.md`,
      );
    });

    it("agentScope is ignored for non-PLAN phases", () => {
      const result = getContextDocuments(
        PdlcPhase.REQ_CREATION,
        SLUG,
        fullstackConfig,
        { agentScope: "be" },
      );
      // REQ_CREATION only has overview, agentScope doesn't affect it
      expect(docTypes(result.documents)).toEqual(["overview"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 24: skipFspec handling across phases
  // ---------------------------------------------------------------------------

  describe("skipFspec handling", () => {
    it("FSPEC documents have required=false in TSPEC_CREATION context", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_CREATION, SLUG, defaultConfig);
      const fspec = result.documents.find((d) => d.type === "fspec");
      expect(fspec).toBeDefined();
      expect(fspec!.required).toBe(false);
    });

    it("FSPEC documents have required=false in PROPERTIES_CREATION context", () => {
      const result = getContextDocuments(
        PdlcPhase.PROPERTIES_CREATION,
        SLUG,
        defaultConfig,
      );
      const fspec = result.documents.find((d) => d.type === "fspec");
      expect(fspec).toBeDefined();
      expect(fspec!.required).toBe(false);
    });

    it("FSPEC documents have required=false in TSPEC_REVIEW context", () => {
      const result = getContextDocuments(PdlcPhase.TSPEC_REVIEW, SLUG, defaultConfig);
      const fspec = result.documents.find((d) => d.type === "fspec");
      expect(fspec).toBeDefined();
      expect(fspec!.required).toBe(false);
    });

    it("skipFspec=true removes FSPEC from all phases that include it", () => {
      const phasesToCheck = [
        PdlcPhase.TSPEC_CREATION,
        PdlcPhase.TSPEC_REVIEW,
        PdlcPhase.PROPERTIES_CREATION,
      ];
      for (const phase of phasesToCheck) {
        const result = getContextDocuments(phase, SLUG, skipFspecConfig);
        const fspec = result.documents.find((d) => d.type === "fspec");
        expect(fspec).toBeUndefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Task 24: Approved / terminal phases return empty
  // ---------------------------------------------------------------------------

  describe("Approved and terminal phases", () => {
    const approvedPhases = [
      PdlcPhase.REQ_APPROVED,
      PdlcPhase.FSPEC_APPROVED,
      PdlcPhase.TSPEC_APPROVED,
      PdlcPhase.PLAN_APPROVED,
      PdlcPhase.PROPERTIES_APPROVED,
    ];

    for (const phase of approvedPhases) {
      it(`${phase} returns empty documents`, () => {
        const result = getContextDocuments(phase, SLUG, defaultConfig);
        expect(result.documents).toEqual([]);
      });
    }

    it("DONE returns empty documents", () => {
      const result = getContextDocuments(PdlcPhase.DONE, SLUG, defaultConfig);
      expect(result.documents).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // All documents have required field set
  // ---------------------------------------------------------------------------

  describe("Document required field", () => {
    it("overview documents are required", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig);
      expect(result.documents[0]!.required).toBe(true);
    });

    it("REQ documents are required", () => {
      const result = getContextDocuments(PdlcPhase.FSPEC_CREATION, SLUG, defaultConfig);
      const req = result.documents.find((d) => d.type === "req");
      expect(req!.required).toBe(true);
    });

    it("FSPEC under review (FSPEC_REVIEW) is required", () => {
      const result = getContextDocuments(PdlcPhase.FSPEC_REVIEW, SLUG, defaultConfig);
      const fspec = result.documents.find((d) => d.type === "fspec");
      expect(fspec!.required).toBe(true);
    });

    it("cross_review documents are never required", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig, {
        isRevision: true,
      });
      const crossReview = result.documents.find((d) => d.type === "cross_review");
      expect(crossReview!.required).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("Edge cases", () => {
    it("calling with no options works (defaults)", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig);
      expect(result.documents).toHaveLength(1);
    });

    it("calling with empty options object works", () => {
      const result = getContextDocuments(PdlcPhase.REQ_CREATION, SLUG, defaultConfig, {});
      expect(result.documents).toHaveLength(1);
    });

    it("returns ContextDocumentSet structure consistently", () => {
      for (const phase of Object.values(PdlcPhase)) {
        const result = getContextDocuments(phase, SLUG, defaultConfig);
        expect(result).toHaveProperty("documents");
        expect(Array.isArray(result.documents)).toBe(true);
      }
    });

    it("every document has type, relativePath, and required fields", () => {
      for (const phase of Object.values(PdlcPhase)) {
        const result = getContextDocuments(phase, SLUG, defaultConfig);
        for (const doc of result.documents) {
          expect(doc).toHaveProperty("type");
          expect(doc).toHaveProperty("relativePath");
          expect(doc).toHaveProperty("required");
          expect(typeof doc.relativePath).toBe("string");
          expect(typeof doc.required).toBe("boolean");
        }
      }
    });
  });
});
