import type { UserFacingErrorType, UserFacingErrorContext } from '../types.js';

export interface ErrorMessage {
  title: string;         // "⚠ Error — {short_description}"
  whatHappened: string;  // plain language
  whatToDo: string;      // actionable guidance
}

export function buildErrorMessage(
  type: UserFacingErrorType,
  context: UserFacingErrorContext = {},
): ErrorMessage {
  const agentDisplayName = context.agentDisplayName ?? 'the agent';
  const agentId = context.agentId ?? 'unknown';
  const maxRetries = context.maxRetries ?? 3;

  switch (type) {
    case 'ERR-RP-01':
      return {
        title: '⚠ Error — Skill Invocation Failed',
        whatHappened: `${agentDisplayName} could not be reached after ${maxRetries} attempts.`,
        whatToDo: `Try again by @mentioning ${agentDisplayName} in this thread. If the problem persists, check the Ptah console log for details.`,
      };

    case 'ERR-RP-02':
      return {
        title: '⚠ Error — Unknown Agent',
        whatHappened: `A routing signal referenced an agent that is not registered: '${agentId}'.`,
        whatToDo: `Check that '${agentId}' is correctly configured in ptah.config.json and that Ptah has been restarted or hot-reloaded since the config change.`,
      };

    case 'ERR-RP-03':
      return {
        title: '⚠ Error — Discord Error',
        whatHappened: `Ptah could not complete a Discord operation for this thread.`,
        whatToDo: `Check the Ptah console log for details. If the problem persists, verify the bot's Discord permissions.`,
      };

    case 'ERR-RP-04':
      return {
        title: '⚠ Error — Invalid Skill Response',
        whatHappened: `${agentDisplayName} returned a response that Ptah could not process.`,
        whatToDo: `Try re-triggering the workflow. If this happens repeatedly for the same agent, check the Skill definition file for issues.`,
      };

    case 'ERR-RP-05':
      return {
        title: '⚠ Error — Skill File Missing',
        whatHappened: `The Skill definition for ${agentDisplayName} could not be found.`,
        whatToDo: `Verify the skill file exists at the configured path and that Ptah has read access. Check the console log for the expected path.`,
      };
  }
}
