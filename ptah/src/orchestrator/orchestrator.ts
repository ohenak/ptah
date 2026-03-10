import type { ThreadMessage, PtahConfig } from "../types.js";
import type { DiscordClient } from "../services/discord.js";
import type { Logger } from "../services/logger.js";
import type { RoutingEngine } from "./router.js";
import { RoutingParseError } from "./router.js";
import type { ContextAssembler } from "./context-assembler.js";
import type { SkillInvoker } from "./skill-invoker.js";
import { InvocationTimeoutError } from "./skill-invoker.js";
import type { ResponsePoster } from "./response-poster.js";
import type { ThreadQueue } from "./thread-queue.js";

export interface Orchestrator {
  handleMessage(message: ThreadMessage): Promise<void>;
  startup(): Promise<void>;
}

export interface OrchestratorDeps {
  discordClient: DiscordClient;
  routingEngine: RoutingEngine;
  contextAssembler: ContextAssembler;
  skillInvoker: SkillInvoker;
  responsePoster: ResponsePoster;
  threadQueue: ThreadQueue;
  logger: Logger;
  config: PtahConfig;
}

export class DefaultOrchestrator implements Orchestrator {
  private readonly discord: DiscordClient;
  private readonly routingEngine: RoutingEngine;
  private readonly contextAssembler: ContextAssembler;
  private readonly skillInvoker: SkillInvoker;
  private readonly responsePoster: ResponsePoster;
  private readonly threadQueue: ThreadQueue;
  private readonly logger: Logger;
  private readonly config: PtahConfig;

  constructor(deps: OrchestratorDeps) {
    this.discord = deps.discordClient;
    this.routingEngine = deps.routingEngine;
    this.contextAssembler = deps.contextAssembler;
    this.skillInvoker = deps.skillInvoker;
    this.responsePoster = deps.responsePoster;
    this.threadQueue = deps.threadQueue;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  async handleMessage(message: ThreadMessage): Promise<void> {
    this.threadQueue.enqueue(message.threadId, async () => {
      await this.processMessage(message);
    });
  }

  async startup(): Promise<void> {
    // Best-effort prune orphaned worktrees (SI-R9)
    try {
      await this.skillInvoker.pruneOrphanedWorktrees();
      this.logger.info("Pruned orphaned worktrees");
    } catch (error) {
      this.logger.warn(
        `Failed to prune orphaned worktrees: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Resolve debug channel (Q-01)
    const debugChannelId = await this.discord.findChannelByName(
      this.config.discord.server_id,
      this.config.discord.channels.debug,
    );
    if (debugChannelId) {
      this.logger.info(`Resolved debug channel: ${debugChannelId}`);
    } else {
      this.logger.warn(
        `debug channel #${this.config.discord.channels.debug} not found`,
      );
    }
  }

  private async processMessage(message: ThreadMessage): Promise<void> {
    // Step 1: Ignore bot messages
    if (message.isBot) {
      return;
    }

    // Step 2: Resolve agent from human message
    const agentId = this.routingEngine.resolveHumanMessage(message, this.config);

    // Step 3: If no agent, post system message
    if (!agentId) {
      await this.discord.postSystemMessage(
        message.threadId,
        "Please @mention a role to direct your message to a specific agent.",
      );
      return;
    }

    // Step 4+: Run the routing loop starting with the resolved agent
    await this.executeRoutingLoop(agentId, message);
  }

  private async executeRoutingLoop(
    initialAgentId: string,
    triggerMessage: ThreadMessage,
  ): Promise<void> {
    let currentAgentId = initialAgentId;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Read thread history
        const threadHistory = await this.discord.readThreadHistory(
          triggerMessage.threadId,
        );

        // Assemble context
        const bundle = await this.contextAssembler.assemble({
          agentId: currentAgentId,
          threadId: triggerMessage.threadId,
          threadName: triggerMessage.threadName,
          threadHistory,
          triggerMessage,
          config: this.config,
        });

        // Invoke skill
        const result = await this.skillInvoker.invoke(bundle, this.config);

        // Post agent response
        await this.responsePoster.postAgentResponse({
          threadId: triggerMessage.threadId,
          agentId: currentAgentId,
          text: result.textResponse,
          config: this.config,
          footer: `${result.durationMs}ms`,
        });

        // Parse routing signal
        const signal = this.routingEngine.parseSignal(result.routingSignalRaw);

        // Decide next action
        const decision = this.routingEngine.decide(signal, this.config);

        // Handle decision
        if (decision.isTerminal) {
          // LGTM or TASK_COMPLETE — post completion embed
          await this.responsePoster.postCompletionEmbed(
            triggerMessage.threadId,
            currentAgentId,
            this.config,
          );
          return;
        }

        if (decision.isPaused) {
          // ROUTE_TO_USER — post system message with question
          await this.discord.postSystemMessage(
            triggerMessage.threadId,
            decision.signal.question ?? "Awaiting user input.",
          );
          return;
        }

        if (decision.createNewThread) {
          // ROUTE_TO_AGENT with new_thread — create coordination thread
          const featureName = bundle.featureName;
          await this.responsePoster.createCoordinationThread({
            channelId: triggerMessage.parentChannelId,
            featureName,
            description: `Coordination with ${decision.targetAgentId}`,
            agentId: decision.targetAgentId!,
            initialText: result.textResponse,
            config: this.config,
          });
          return;
        }

        // ROUTE_TO_AGENT with reply — loop with new agent
        currentAgentId = decision.targetAgentId!;
        // Continue the while loop
      } catch (error) {
        if (error instanceof RoutingParseError) {
          await this.responsePoster.postErrorEmbed(
            triggerMessage.threadId,
            `Routing error: ${error.message}`,
          );
          return;
        }

        if (error instanceof InvocationTimeoutError) {
          await this.responsePoster.postErrorEmbed(
            triggerMessage.threadId,
            "Skill invocation timed out (>90s)",
          );
          return;
        }

        // Generic error (InvocationError or other)
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await this.responsePoster.postErrorEmbed(
          triggerMessage.threadId,
          `Skill invocation failed: ${errorMessage}`,
        );
        return;
      }
    }
  }
}
