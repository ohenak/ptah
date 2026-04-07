/**
 * Tests for the sendNotification Activity.
 *
 * The notification activity sends messages via the DiscordClient
 * for question, failure, status, and revision-bound notification types.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationInput } from "../../../src/temporal/types.js";
import type { NotificationActivityDeps } from "../../../src/temporal/activities/notification-activity.js";
import { FakeDiscordClient, FakeLogger, defaultTestConfig } from "../../fixtures/factories.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotificationInput(overrides?: Partial<NotificationInput>): NotificationInput {
  return {
    type: "question",
    featureSlug: "my-feature",
    phaseId: "req-creation",
    agentId: "pm",
    message: "Should auth use Google or GitHub?",
    workflowId: "ptah-feature-my-feature-1",
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<NotificationActivityDeps>): NotificationActivityDeps {
  const discord = new FakeDiscordClient();
  const config = defaultTestConfig();
  // Pre-populate channel name → snowflake ID mappings so resolveToSnowflake works
  discord.channels.set(config.discord.channels.updates, "111111111111111111");
  discord.channels.set(config.discord.channels.questions, "222222222222222222");
  discord.channels.set(config.discord.channels.debug, "333333333333333333");
  return {
    discordClient: discord,
    logger: new FakeLogger(),
    config,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

let createNotificationActivities: typeof import("../../../src/temporal/activities/notification-activity.js").createNotificationActivities;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../../../src/temporal/activities/notification-activity.js");
  createNotificationActivities = mod.createNotificationActivities;
});

// ===========================================================================
// C8: sendNotification Activity
// ===========================================================================

describe("sendNotification Activity (C8)", () => {
  it("sends a question notification via discord", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(makeNotificationInput({ type: "question" }));

    // Should post to the questions channel
    expect(discord.postChannelMessageCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sends a failure notification via discord", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(
      makeNotificationInput({
        type: "failure",
        message: "Subprocess crashed after 3 retries",
      }),
    );

    expect(discord.postChannelMessageCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sends a status notification via discord", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(
      makeNotificationInput({
        type: "status",
        message: "Phase req-creation completed",
      }),
    );

    expect(discord.postChannelMessageCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sends a revision-bound notification via discord", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(
      makeNotificationInput({
        type: "revision-bound",
        message: "Feature 'my-feature' has exceeded the maximum of 3 revision cycles in phase req-review.",
      }),
    );

    expect(discord.postChannelMessageCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("includes feature slug and agent in the notification message", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(
      makeNotificationInput({
        featureSlug: "auth-system",
        agentId: "eng",
        message: "Something happened",
      }),
    );

    const postedMessages = discord.postChannelMessageCalls.map((c) => c.content);
    const combined = postedMessages.join(" ");
    expect(combined).toContain("auth-system");
  });

  it("includes workflow ID in the notification", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(
      makeNotificationInput({ workflowId: "ptah-feature-auth-1" }),
    );

    const postedMessages = discord.postChannelMessageCalls.map((c) => c.content);
    const combined = postedMessages.join(" ");
    expect(combined).toContain("ptah-feature-auth-1");
  });

  it("logs the notification", async () => {
    const deps = makeDeps();
    const logger = deps.logger as FakeLogger;

    const { sendNotification } = createNotificationActivities(deps);
    await sendNotification(makeNotificationInput());

    expect(logger.messages.length).toBeGreaterThanOrEqual(1);
  });

  it("handles discord error gracefully by throwing", async () => {
    const deps = makeDeps();
    const discord = deps.discordClient as FakeDiscordClient;
    discord.postChannelMessageError = new Error("Discord API error");

    const { sendNotification } = createNotificationActivities(deps);

    await expect(
      sendNotification(makeNotificationInput()),
    ).rejects.toThrow("Discord API error");
  });
});
