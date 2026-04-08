import type { ParsedRecommendation } from "./v4-types.js";

// --- Skill-to-Agent mapping ---

const SKILL_TO_AGENT: Record<string, string> = {
  "backend-engineer": "eng",
  "frontend-engineer": "fe",
  "product-manager": "pm",
  "test-engineer": "qa",
};

// --- Recommendation heading patterns (outside code blocks) ---

const HEADING_PATTERN = /^#{1,6}\s+.*recommendation/i;
const BOLD_PATTERN = /\*\*Recommendation[:\*]/i;
const TABLE_PATTERN = /\|\s*\*?\*?Recommendation\*?\*?\s*\|/i;

// --- Recommendation value matchers (order matters: longer match first) ---

const VALUE_MATCHERS: Array<{ pattern: string; status: "approved" | "revision_requested" }> = [
  { pattern: "approved with minor changes", status: "approved" },
  { pattern: "needs revision", status: "revision_requested" },
  { pattern: "approved", status: "approved" },
  { pattern: "lgtm", status: "approved" },
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

  // Bold: **Recommendation:** value  or  **Recommendation**: value
  const boldMatch = line.match(/\*\*Recommendation\*?\*?[:\s]*\s*(.*)/i);
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
 * Parse the recommendation from a cross-review file's content.
 */
export function parseRecommendation(fileContent: string): ParsedRecommendation {
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
    return parseError("No Recommendation heading found");
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
    return parseError("No Recommendation heading found");
  }

  // Normalize: trim, lowercase
  const normalized = rawValue.trim().toLowerCase();

  // Match in order (longer match first)
  for (const matcher of VALUE_MATCHERS) {
    if (normalized.includes(matcher.pattern)) {
      return { status: matcher.status };
    }
  }

  return parseError("Unrecognized recommendation", rawValue);
}

/**
 * Map skill name from filename to agent ID.
 */
export function skillNameToAgentId(skillName: string): string | null {
  return SKILL_TO_AGENT[skillName] ?? null;
}

const AGENT_TO_SKILL: Record<string, string> = Object.fromEntries(
  Object.entries(SKILL_TO_AGENT).map(([k, v]) => [v, k]),
);

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
 */
export function crossReviewPath(
  featurePath: string,
  skillName: string,
  documentType: string,
): string {
  return `${featurePath}CROSS-REVIEW-${skillName}-${documentType}.md`;
}
