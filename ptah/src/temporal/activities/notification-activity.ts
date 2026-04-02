/**
 * Temporal Activity for sending notifications via the messaging layer.
 *
 * Supports question, failure, status, and revision-bound notification types.
 * Currently sends via Discord; Feature 016 will abstract via MessagingProvider.
 *
 * @see TSPEC-015 Section 4.2 (SkillActivityDeps)
 */

import type { DiscordClient } from "../../services/discord.js";
import type { Logger } from "../../services/logger.js";
import type { PtahConfig } from "../../types.js";
import type { NotificationInput } from "../types.js";

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface NotificationActivityDeps {
  discordClient: DiscordClient;
  logger: Logger;
  config: PtahConfig;
}

// ---------------------------------------------------------------------------
// Notification type labels
// ---------------------------------------------------------------------------

const NOTIFICATION_LABELS: Record<string, string> = {
  question: "Question from agent",
  failure: "Activity Failure",
  status: "Status Update",
  "revision-bound": "Revision Bound Exceeded",
};

// ---------------------------------------------------------------------------
// Activity factory
// ---------------------------------------------------------------------------

export function createNotificationActivities(deps: NotificationActivityDeps) {
  const { discordClient, logger, config } = deps;

  async function sendNotification(input: NotificationInput): Promise<void> {
    const { type, featureSlug, phaseId, agentId, message, workflowId } = input;

    const label = NOTIFICATION_LABELS[type] ?? "Notification";

    // Determine target channel based on notification type
    const channelId = resolveChannelId(type, config);

    const formattedMessage = formatNotification({
      label,
      featureSlug,
      phaseId,
      agentId,
      message,
      workflowId,
      type,
    });

    logger.info(
      `Sending ${type} notification for ${featureSlug}/${phaseId} (agent: ${agentId}, workflow: ${workflowId})`,
    );

    await discordClient.postChannelMessage(channelId, formattedMessage);
  }

  return { sendNotification };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveChannelId(type: string, config: PtahConfig): string {
  // Route to appropriate Discord channel based on notification type
  switch (type) {
    case "question":
      return config.discord.channels.questions;
    case "failure":
      return config.discord.channels.updates;
    case "status":
      return config.discord.channels.updates;
    case "revision-bound":
      return config.discord.channels.updates;
    default:
      return config.discord.channels.updates;
  }
}

function formatNotification(params: {
  label: string;
  featureSlug: string;
  phaseId: string;
  agentId: string;
  message: string;
  workflowId: string;
  type: string;
}): string {
  const { label, featureSlug, phaseId, agentId, message, workflowId } = params;

  return [
    `**${label}**`,
    `Feature: \`${featureSlug}\` | Phase: \`${phaseId}\` | Agent: \`${agentId}\``,
    `Workflow: \`${workflowId}\``,
    "",
    message,
  ].join("\n");
}
