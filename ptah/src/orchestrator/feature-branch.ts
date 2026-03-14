/**
 * Extracts the feature name from a Discord thread name.
 * Thread names follow the convention "{feature-name} — {task description}".
 * If no em-dash separator is present, the full thread name is returned.
 */
export function extractFeatureName(threadName: string): string {
  const emDashIndex = threadName.indexOf(" \u2014 ");
  if (emDashIndex !== -1) {
    return threadName.substring(0, emDashIndex);
  }
  return threadName;
}

/**
 * Converts a feature name to a URL-safe branch slug.
 * Algorithm:
 *   1. Lowercase the input
 *   2. Replace sequences of non-alphanumeric characters with a single hyphen
 *   3. Strip leading and trailing hyphens
 * If result is empty, return "unnamed".
 */
export function featureNameToSlug(featureName: string): string {
  const slug = featureName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unnamed";
}

/**
 * Returns the persistent feature branch name for a given feature.
 * Format: "feat-{slug}"
 */
export function featureBranchName(featureName: string): string {
  return `feat-${featureNameToSlug(featureName)}`;
}

/**
 * Returns the agent sub-branch name for a specific agent invocation on a feature.
 * Format: "ptah/{slug}/{agentId}/{invocationId}"
 */
export function agentSubBranchName(
  featureName: string,
  agentId: string,
  invocationId: string,
): string {
  return `ptah/${featureNameToSlug(featureName)}/${agentId}/${invocationId}`;
}
