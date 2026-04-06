/**
 * Represents a parsed ad-hoc directive from a user message.
 * The first token must start with `@` to be recognized as a directive.
 */
export interface AdHocDirective {
  /** The agent identifier after `@`, lowercased. */
  agentIdentifier: string;
  /** The remainder of the message after the `@token`, trimmed. */
  instruction: string;
}

/**
 * Parses a message for an ad-hoc agent directive.
 *
 * Strips leading whitespace, extracts the first whitespace-delimited token,
 * and checks if it starts with `@`. If so, returns the agent identifier
 * (lowercased, without the `@`) and the trimmed remainder as the instruction.
 * Otherwise returns null.
 *
 * @param messageContent - The raw message content from the user.
 * @returns An AdHocDirective if the first token is an @-mention, or null.
 */
export function parseAdHocDirective(
  messageContent: string,
): AdHocDirective | null {
  const trimmed = messageContent.trimStart();
  if (trimmed.length === 0) {
    return null;
  }

  const spaceIndex = trimmed.indexOf(" ");
  const firstToken = spaceIndex === -1 ? trimmed : trimmed.substring(0, spaceIndex);
  const remainder = spaceIndex === -1 ? "" : trimmed.substring(spaceIndex + 1).trim();

  if (!firstToken.startsWith("@")) {
    return null;
  }

  return {
    agentIdentifier: firstToken.substring(1).toLowerCase(),
    instruction: remainder,
  };
}
