import type {
  RoutingSignal,
  RoutingDecision,
  ThreadMessage,
  PtahConfig,
} from "../types.js";

export interface RoutingEngine {
  parseSignal(skillResponseText: string): RoutingSignal;
  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null;
  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision;
}
