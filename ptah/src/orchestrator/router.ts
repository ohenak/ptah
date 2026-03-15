import type {
  RoutingSignal,
  RoutingDecision,
  ThreadMessage,
  PtahConfig,
} from "../types.js";
import type { Logger } from "../services/logger.js";

export interface RoutingEngine {
  parseSignal(skillResponseText: string): RoutingSignal;
  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null;
  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision;
}

export class RoutingParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingParseError";
  }
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

// Match <routing> tags containing JSON objects only (starts with {).
// This avoids matching prose mentions like "I'll use the <routing> tag".
const ROUTING_TAG_REGEX = /<routing>\s*(\{[\s\S]*?\})\s*<\/routing>/g;

export class DefaultRoutingEngine implements RoutingEngine {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  parseSignal(skillResponseText: string): RoutingSignal {
    if (!skillResponseText || skillResponseText.trim() === "") {
      throw new RoutingParseError("missing routing signal");
    }

    const matches = [...skillResponseText.matchAll(ROUTING_TAG_REGEX)];

    if (matches.length === 0) {
      throw new RoutingParseError("missing routing signal");
    }

    if (matches.length > 1) {
      this.logger.warn(
        `Multiple routing signals found (${matches.length}), using first (AT-RP-10)`,
      );
    }

    const rawJson = matches[0][1].trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new RoutingParseError(`malformed routing signal JSON: ${detail}`);
    }

    const type = parsed.type as string | undefined;
    if (!type) {
      throw new RoutingParseError("missing routing signal type");
    }

    const validTypes = ["ROUTE_TO_AGENT", "ROUTE_TO_USER", "LGTM", "TASK_COMPLETE"];
    if (!validTypes.includes(type)) {
      throw new RoutingParseError(`unknown routing signal type: ${type}`);
    }

    const signal: RoutingSignal = { type: type as RoutingSignal["type"] };

    if (type === "ROUTE_TO_AGENT") {
      const agentId = parsed.agent_id as string | undefined;
      if (!agentId) {
        throw new RoutingParseError("ROUTE_TO_AGENT requires agent_id");
      }
      signal.agentId = agentId;
      signal.threadAction =
        (parsed.thread_action as RoutingSignal["threadAction"]) ?? "reply";
    }

    if (type === "ROUTE_TO_USER") {
      const question = parsed.question as string | undefined;
      if (!question) {
        throw new RoutingParseError("ROUTE_TO_USER requires question");
      }
      signal.question = question;
    }

    return signal;
  }

  resolveHumanMessage(
    message: ThreadMessage,
    config: PtahConfig,
  ): string | null {
    const roleMentions = config.agents.role_mentions;
    if (!roleMentions) {
      return null;
    }

    const mentionPattern = /<@&(\d+)>/;
    const match = message.content.match(mentionPattern);
    if (!match) {
      return null;
    }

    const roleId = match[1];
    const agentId = roleMentions[roleId];
    if (!agentId) {
      return null;
    }

    return agentId;
  }

  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision {
    if (signal.type === "LGTM" || signal.type === "TASK_COMPLETE") {
      return {
        signal,
        targetAgentId: null,
        isTerminal: true,
        isPaused: false,
        createNewThread: false,
      };
    }

    if (signal.type === "ROUTE_TO_USER") {
      return {
        signal,
        targetAgentId: null,
        isTerminal: false,
        isPaused: true,
        createNewThread: false,
      };
    }

    // ROUTE_TO_AGENT
    const targetAgentId = signal.agentId!;
    if (!config.agents.active.includes(targetAgentId)) {
      throw new RoutingError(`unknown agent '${targetAgentId}'`);
    }

    return {
      signal,
      targetAgentId,
      isTerminal: false,
      isPaused: false,
      createNewThread: signal.threadAction === "new_thread",
    };
  }
}
