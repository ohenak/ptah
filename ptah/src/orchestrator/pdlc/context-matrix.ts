/**
 * Context Matrix - Phase-aware document selection (FSPEC-CA-01)
 *
 * Pure function module that determines which documents should be provided
 * as context for each PDLC phase.
 */

import type {
  ContextDocument,
  ContextDocumentSet,
  FeatureConfig,
} from "./phases.js";
import { PdlcPhase } from "./phases.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the NNN prefix from a feature slug.
 * e.g., "011-orchestrator-pdlc-state-machine" -> "011"
 */
function extractPrefix(slug: string): string {
  const idx = slug.indexOf("-");
  return idx === -1 ? slug : slug.substring(0, idx);
}

/**
 * Extract the feature name (everything after the NNN- prefix) from a slug.
 * e.g., "011-orchestrator-pdlc-state-machine" -> "orchestrator-pdlc-state-machine"
 */
function extractFeatureName(slug: string): string {
  const idx = slug.indexOf("-");
  return idx === -1 ? slug : slug.substring(idx + 1);
}

/**
 * Build a relative path for a document within the feature docs folder.
 */
function featureDocPath(slug: string, filename: string): string {
  return `docs/${slug}/${filename}`;
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

function overviewDoc(slug: string): ContextDocument {
  return {
    type: "overview",
    relativePath: featureDocPath(slug, "overview.md"),
    required: true,
  };
}

function reqDoc(slug: string): ContextDocument {
  const prefix = extractPrefix(slug);
  const feature = extractFeatureName(slug);
  return {
    type: "req",
    relativePath: featureDocPath(slug, `${prefix}-REQ-${feature}.md`),
    required: true,
  };
}

function fspecDoc(slug: string, required: boolean): ContextDocument {
  const prefix = extractPrefix(slug);
  const feature = extractFeatureName(slug);
  return {
    type: "fspec",
    relativePath: featureDocPath(slug, `${prefix}-FSPEC-${feature}.md`),
    required,
  };
}

function tspecDoc(slug: string, agentScope?: string): ContextDocument {
  const prefix = extractPrefix(slug);
  const feature = extractFeatureName(slug);
  const filename = agentScope
    ? `${prefix}-TSPEC-${agentScope}-${feature}.md`
    : `${prefix}-TSPEC-${feature}.md`;
  return {
    type: "tspec",
    relativePath: featureDocPath(slug, filename),
    required: true,
  };
}

function planDoc(slug: string): ContextDocument {
  const prefix = extractPrefix(slug);
  const feature = extractFeatureName(slug);
  return {
    type: "plan",
    relativePath: featureDocPath(slug, `${prefix}-PLAN-TSPEC-${feature}.md`),
    required: true,
  };
}

function propertiesDoc(slug: string): ContextDocument {
  const prefix = extractPrefix(slug);
  const feature = extractFeatureName(slug);
  return {
    type: "properties",
    relativePath: featureDocPath(slug, `${prefix}-PROPERTIES-${feature}.md`),
    required: true,
  };
}

/**
 * Build a cross-review glob-pattern document entry.
 * Since we cannot glob in a pure function, we return a single entry with
 * a wildcard pattern in the relativePath.
 */
function crossReviewDoc(slug: string, docType: string): ContextDocument {
  return {
    type: "cross_review",
    relativePath: featureDocPath(slug, `CROSS-REVIEW-*-${docType}.md`),
    required: false,
  };
}

// ---------------------------------------------------------------------------
// Phase document matrices
// ---------------------------------------------------------------------------

function getCreationDocs(
  phase: PdlcPhase,
  slug: string,
  config: FeatureConfig,
  agentScope?: string,
): ContextDocument[] {
  switch (phase) {
    case PdlcPhase.REQ_CREATION:
      return [overviewDoc(slug)];

    case PdlcPhase.FSPEC_CREATION:
      return [overviewDoc(slug), reqDoc(slug)];

    case PdlcPhase.TSPEC_CREATION: {
      const docs: ContextDocument[] = [overviewDoc(slug), reqDoc(slug)];
      if (!config.skipFspec) {
        docs.push(fspecDoc(slug, false));
      }
      return docs;
    }

    case PdlcPhase.PLAN_CREATION: {
      const docs: ContextDocument[] = [overviewDoc(slug)];
      docs.push(tspecDoc(slug, agentScope));
      return docs;
    }

    case PdlcPhase.PROPERTIES_CREATION: {
      const docs: ContextDocument[] = [
        overviewDoc(slug),
        reqDoc(slug),
      ];
      if (!config.skipFspec) {
        docs.push(fspecDoc(slug, false));
      }
      docs.push(tspecDoc(slug));
      docs.push(planDoc(slug));
      return docs;
    }

    case PdlcPhase.IMPLEMENTATION:
      return [tspecDoc(slug), planDoc(slug), propertiesDoc(slug)];

    case PdlcPhase.IMPLEMENTATION_REVIEW:
      return [tspecDoc(slug), planDoc(slug), propertiesDoc(slug)];

    default:
      return [];
  }
}

function getReviewDocs(
  phase: PdlcPhase,
  slug: string,
  config: FeatureConfig,
): ContextDocument[] {
  switch (phase) {
    case PdlcPhase.REQ_REVIEW:
      return [reqDoc(slug), overviewDoc(slug)];

    case PdlcPhase.FSPEC_REVIEW:
      return [fspecDoc(slug, true), reqDoc(slug)];

    case PdlcPhase.TSPEC_REVIEW: {
      const docs: ContextDocument[] = [tspecDoc(slug), reqDoc(slug)];
      if (!config.skipFspec) {
        docs.push(fspecDoc(slug, false));
      }
      return docs;
    }

    case PdlcPhase.PLAN_REVIEW:
      return [planDoc(slug), tspecDoc(slug)];

    case PdlcPhase.PROPERTIES_REVIEW:
      return [propertiesDoc(slug), reqDoc(slug), tspecDoc(slug), planDoc(slug)];

    default:
      return [];
  }
}

/**
 * Map review phases to their document type for cross-review file patterns.
 */
function getDocTypeForReviewPhase(phase: PdlcPhase): string | null {
  switch (phase) {
    case PdlcPhase.REQ_CREATION:
      return "REQ";
    case PdlcPhase.FSPEC_CREATION:
      return "FSPEC";
    case PdlcPhase.TSPEC_CREATION:
      return "TSPEC";
    case PdlcPhase.PLAN_CREATION:
      return "PLAN";
    case PdlcPhase.PROPERTIES_CREATION:
      return "PROPERTIES";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Transient / terminal phases
// ---------------------------------------------------------------------------

const EMPTY_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_APPROVED,
  PdlcPhase.FSPEC_APPROVED,
  PdlcPhase.TSPEC_APPROVED,
  PdlcPhase.PLAN_APPROVED,
  PdlcPhase.PROPERTIES_APPROVED,
  PdlcPhase.DONE,
]);

const REVIEW_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_REVIEW,
  PdlcPhase.FSPEC_REVIEW,
  PdlcPhase.TSPEC_REVIEW,
  PdlcPhase.PLAN_REVIEW,
  PdlcPhase.PROPERTIES_REVIEW,
]);

const CREATION_PHASES = new Set<PdlcPhase>([
  PdlcPhase.REQ_CREATION,
  PdlcPhase.FSPEC_CREATION,
  PdlcPhase.TSPEC_CREATION,
  PdlcPhase.PLAN_CREATION,
  PdlcPhase.PROPERTIES_CREATION,
  PdlcPhase.IMPLEMENTATION,
  PdlcPhase.IMPLEMENTATION_REVIEW,
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the context documents for a given phase, feature, and configuration.
 *
 * Returns a ContextDocumentSet describing which documents should be loaded
 * as context for agents working in the specified phase.
 */
export function getContextDocuments(
  phase: PdlcPhase,
  featureSlug: string,
  config: FeatureConfig,
  options?: { isRevision?: boolean; agentScope?: string },
): ContextDocumentSet {
  // Transient / terminal phases return empty documents
  if (EMPTY_PHASES.has(phase)) {
    return { documents: [] };
  }

  const agentScope = options?.agentScope;
  const isRevision = options?.isRevision ?? false;

  let documents: ContextDocument[];

  if (REVIEW_PHASES.has(phase)) {
    documents = getReviewDocs(phase, featureSlug, config);
  } else if (CREATION_PHASES.has(phase)) {
    documents = getCreationDocs(phase, featureSlug, config, agentScope);
  } else {
    documents = [];
  }

  // Revision context augmentation (BR-CA-03):
  // When revising, add cross-review files as additional context
  if (isRevision && CREATION_PHASES.has(phase)) {
    const docType = getDocTypeForReviewPhase(phase);
    if (docType) {
      documents.push(crossReviewDoc(featureSlug, docType));
    }
  }

  return { documents };
}
