import type { ParsedRecommendation } from "./v4-types.js";

// --- Skill-to-Agent mapping ---

const SKILL_TO_AGENT: Record<string, string> = {
  "engineer": "eng",
  "frontend-engineer": "fe",
  "product-manager": "pm",
  "test-engineer": "qa",
  // New canonical skill → agent entries
  "pm-review": "pm-review",
  "te-review": "te-review",
  "se-review": "se-review",
  "software-engineer": "se-review",
};

// Legacy agent ID → skill name entries (backward-compat) and new canonical IDs
const LEGACY_AGENT_TO_SKILL: Record<string, string> = {
  "eng": "engineer",
  "fe": "frontend-engineer",
  "pm": "product-manager",
  "qa": "test-engineer",
  // New canonical agent IDs → skill names (from TSPEC DoD)
  "pm-review": "product-manager",
  "te-review": "test-engineer",
  "se-review": "software-engineer",
  // Author/implementation agent IDs → self-named skill identifiers (REQ-CR-01, PROP-MAP-01-09)
  // These agents don't write cross-review files but AGENT_TO_SKILL must cover all 8 role IDs.
  "pm-author": "pm-author",
  "se-author": "se-author",
  "te-author": "te-author",
  "tech-lead": "tech-lead",
  "se-implement": "se-implement",
};

// --- Recommendation heading patterns (outside code blocks) ---

const HEADING_PATTERN = /^#{1,6}\s+.*recommendation/i;
const BOLD_PATTERN = /\*\*Recommendation[:\*]/i;
const TABLE_PATTERN = /\|\s*\*?\*?Recommendation\*?\*?\s*\|/i;

// --- Recommendation value matchers (order matters: longer match first) ---

const VALUE_MATCHERS: Array<{ pattern: string; status: "approved" | "revision_requested" }> = [
  { pattern: "approved with minor changes", status: "approved" },
  { pattern: "approved with minor issues",  status: "approved" },
  { pattern: "approved",                    status: "approved" },
  { pattern: "lgtm",                        status: "approved" },
  { pattern: "need attention",              status: "revision_requested" },
  { pattern: "needs revision",              status: "revision_requested" },
  { pattern: "revision requested",          status: "revision_requested" },
];

function parseError(reason: string, rawValue?: string): ParsedRecommendation {
  if (rawValue !== undefined) {
    return { status: "parse_error", reason, rawValue };
  }
  return { status: "parse_error", reason };
}

function isCodeFenceToggle(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

function matchesRecommendationHeading(line: string): boolean {
  return HEADING_PATTERN.test(line) || BOLD_PATTERN.test(line) || TABLE_PATTERN.test(line);
}

/**
 * Extract the recommendation value from the heading line itself.
 * For markdown headings: text after "Recommendation" (possibly after a colon)
 * For bold text: text after "Recommendation:" or "Recommendation**"
 * For table rows: text in the next cell
 */
function extractValueFromLine(line: string): string {
  // Table row: | Recommendation | value |
  const tableMatch = line.match(/\|\s*\*?\*?Recommendation\*?\*?\s*\|\s*(.*?)\s*\|/i);
  if (tableMatch) {
    return tableMatch[1].trim();
  }

  // Bold: **Recommendation:** value  or  **Recommendation**: value  or  **Recommendation** value
  // The pattern `**Recommendation:**` has closing `**` immediately after `:`.
  // Consume the closing `**` and colon/space separators before the value.
  const boldMatch = line.match(/\*\*Recommendation\*?\*?:?\*?\*?\s+(.*)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Heading: ## Recommendation: value  or  ## Recommendation\n
  const headingMatch = line.match(/^#{1,6}\s+.*?Recommendation[:\s]*(.*)/i);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return "";
}

/**
 * Extract the recommendation field value from full file content.
 * Encapsulates the heading-scan logic (code-fence skipping, last-match semantics,
 * multi-line look-ahead). Returns null when no Recommendation heading is found
 * or the value cannot be determined.
 */
export function extractRecommendationValue(fileContent: string): string | null {
  const lines = fileContent.split("\n");
  let insideCodeBlock = false;
  let matchLineIndex: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isCodeFenceToggle(line)) {
      insideCodeBlock = !insideCodeBlock;
      continue;
    }

    if (insideCodeBlock) {
      continue;
    }

    if (matchesRecommendationHeading(line)) {
      // Use last match — cross-review files may contain inline
      // "Recommendation for FSPEC update" lines and table header rows
      // before the actual verdict heading.
      matchLineIndex = i;
    }
  }

  if (matchLineIndex === null) {
    return null;
  }

  // Extract value from the matched line
  let rawValue = extractValueFromLine(lines[matchLineIndex]);

  // If nothing useful on the same line, use next non-empty line
  if (!rawValue) {
    for (let j = matchLineIndex + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed) {
        rawValue = trimmed;
        break;
      }
    }
  }

  if (!rawValue) {
    return null;
  }

  return rawValue;
}

/**
 * Parse the recommendation from an extracted field value string.
 * Accepts the output of extractRecommendationValue(), not full file content.
 */
export function parseRecommendation(recommendationFieldValue: string): ParsedRecommendation {
  const normalized = recommendationFieldValue.trim().toLowerCase();

  if (!normalized) {
    return parseError("No Recommendation heading found");
  }

  // Match in order (longer match first)
  for (const matcher of VALUE_MATCHERS) {
    if (normalized.includes(matcher.pattern)) {
      return { status: matcher.status };
    }
  }

  return parseError("Unrecognized recommendation", recommendationFieldValue.trim());
}

/**
 * Map skill name from filename to agent ID.
 */
export function skillNameToAgentId(skillName: string): string | null {
  return SKILL_TO_AGENT[skillName] ?? null;
}

// Build AGENT_TO_SKILL as reversal of SKILL_TO_AGENT merged with LEGACY_AGENT_TO_SKILL
const AGENT_TO_SKILL: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(SKILL_TO_AGENT).map(([k, v]) => [v, k]),
  ),
  ...LEGACY_AGENT_TO_SKILL,
};

/**
 * Map agent ID to skill name (reverse lookup).
 */
export function agentIdToSkillName(agentId: string): string | null {
  return AGENT_TO_SKILL[agentId] ?? null;
}

/**
 * Derive expected cross-review file path.
 *
 * @param featurePath Resolved feature folder path, e.g. "docs/in-progress/my-feature/"
 * @param revisionCount Optional 1-indexed revision count. Values <= 0 are clamped to 1.
 *   No suffix for revision 1; -v{N} suffix for revision N >= 2.
 */
export function crossReviewPath(
  featurePath: string,
  skillName: string,
  documentType: string,
  revisionCount?: number,
): string {
  const effectiveRevision = Math.max(1, revisionCount ?? 1);
  const base = `${featurePath}CROSS-REVIEW-${skillName}-${documentType}`;
  if (effectiveRevision >= 2) {
    return `${base}-v${effectiveRevision}.md`;
  }
  return `${base}.md`;
}
