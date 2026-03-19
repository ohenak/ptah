import { describe, it, expect } from 'vitest';
import { buildErrorMessage } from '../../../src/orchestrator/error-messages.js';

describe('buildErrorMessage', () => {
  describe('ERR-RP-01 — Skill Invocation Failed', () => {
    it('returns the correct title', () => {
      const result = buildErrorMessage('ERR-RP-01', {
        agentDisplayName: 'pm',
        maxRetries: 3,
      });
      expect(result.title).toBe('⚠ Error — Skill Invocation Failed');
    });

    it('interpolates agentDisplayName and maxRetries in whatHappened', () => {
      const result = buildErrorMessage('ERR-RP-01', {
        agentDisplayName: 'pm',
        maxRetries: 5,
      });
      expect(result.whatHappened).toBe(
        'pm could not be reached after 5 attempts.',
      );
    });

    it('interpolates agentDisplayName in whatToDo', () => {
      const result = buildErrorMessage('ERR-RP-01', {
        agentDisplayName: 'eng',
        maxRetries: 3,
      });
      expect(result.whatToDo).toBe(
        'Try again by @mentioning eng in this thread. If the problem persists, check the Ptah console log for details.',
      );
    });

    it('falls back to "the agent" when agentDisplayName is absent', () => {
      const result = buildErrorMessage('ERR-RP-01', { maxRetries: 3 });
      expect(result.whatHappened).toContain('the agent');
      expect(result.whatToDo).toContain('the agent');
    });

    it('falls back to 3 when maxRetries is absent', () => {
      const result = buildErrorMessage('ERR-RP-01', {
        agentDisplayName: 'qa',
      });
      expect(result.whatHappened).toBe(
        'qa could not be reached after 3 attempts.',
      );
    });

    it('falls back when context is empty object', () => {
      const result = buildErrorMessage('ERR-RP-01', {});
      expect(result.whatHappened).toBe(
        'the agent could not be reached after 3 attempts.',
      );
    });
  });

  describe('ERR-RP-02 — Unknown Agent', () => {
    it('returns the correct title', () => {
      const result = buildErrorMessage('ERR-RP-02', { agentId: 'xyz' });
      expect(result.title).toBe('⚠ Error — Unknown Agent');
    });

    it('interpolates agentId in whatHappened', () => {
      const result = buildErrorMessage('ERR-RP-02', { agentId: 'xyz' });
      expect(result.whatHappened).toBe(
        "A routing signal referenced an agent that is not registered: 'xyz'.",
      );
    });

    it('interpolates agentId in whatToDo', () => {
      const result = buildErrorMessage('ERR-RP-02', { agentId: 'eng' });
      expect(result.whatToDo).toBe(
        "Check that 'eng' is correctly configured in ptah.config.json and that Ptah has been restarted or hot-reloaded since the config change.",
      );
    });

    it('falls back to "unknown" when agentId is absent', () => {
      const result = buildErrorMessage('ERR-RP-02', {});
      expect(result.whatHappened).toContain("'unknown'");
      expect(result.whatToDo).toContain("'unknown'");
    });
  });

  describe('ERR-RP-03 — Discord Error', () => {
    it('returns the correct title', () => {
      const result = buildErrorMessage('ERR-RP-03', {});
      expect(result.title).toBe('⚠ Error — Discord Error');
    });

    it('returns static whatHappened message', () => {
      const result = buildErrorMessage('ERR-RP-03', {});
      expect(result.whatHappened).toBe(
        'Ptah could not complete a Discord operation for this thread.',
      );
    });

    it('returns static whatToDo message', () => {
      const result = buildErrorMessage('ERR-RP-03', {});
      expect(result.whatToDo).toBe(
        "Check the Ptah console log for details. If the problem persists, verify the bot's Discord permissions.",
      );
    });

    it('ignores any context values', () => {
      const withContext = buildErrorMessage('ERR-RP-03', {
        agentDisplayName: 'pm',
        agentId: 'pm',
      });
      const withoutContext = buildErrorMessage('ERR-RP-03', {});
      expect(withContext.whatHappened).toBe(withoutContext.whatHappened);
      expect(withContext.whatToDo).toBe(withoutContext.whatToDo);
    });
  });

  describe('ERR-RP-04 — Invalid Skill Response', () => {
    it('returns the correct title', () => {
      const result = buildErrorMessage('ERR-RP-04', {
        agentDisplayName: 'fe',
      });
      expect(result.title).toBe('⚠ Error — Invalid Skill Response');
    });

    it('interpolates agentDisplayName in whatHappened', () => {
      const result = buildErrorMessage('ERR-RP-04', {
        agentDisplayName: 'fe',
      });
      expect(result.whatHappened).toBe(
        'fe returned a response that Ptah could not process.',
      );
    });

    it('returns correct whatToDo message', () => {
      const result = buildErrorMessage('ERR-RP-04', {
        agentDisplayName: 'fe',
      });
      expect(result.whatToDo).toBe(
        'Try re-triggering the workflow. If this happens repeatedly for the same agent, check the Skill definition file for issues.',
      );
    });

    it('falls back to "the agent" when agentDisplayName is absent', () => {
      const result = buildErrorMessage('ERR-RP-04', {});
      expect(result.whatHappened).toBe(
        'the agent returned a response that Ptah could not process.',
      );
    });
  });

  describe('ERR-RP-05 — Skill File Missing', () => {
    it('returns the correct title', () => {
      const result = buildErrorMessage('ERR-RP-05', {
        agentDisplayName: 'qa',
      });
      expect(result.title).toBe('⚠ Error — Skill File Missing');
    });

    it('interpolates agentDisplayName in whatHappened', () => {
      const result = buildErrorMessage('ERR-RP-05', {
        agentDisplayName: 'qa',
      });
      expect(result.whatHappened).toBe(
        'The Skill definition for qa could not be found.',
      );
    });

    it('returns correct whatToDo message', () => {
      const result = buildErrorMessage('ERR-RP-05', {
        agentDisplayName: 'qa',
      });
      expect(result.whatToDo).toBe(
        'Verify the skill file exists at the configured path and that Ptah has read access. Check the console log for the expected path.',
      );
    });

    it('falls back to "the agent" when agentDisplayName is absent', () => {
      const result = buildErrorMessage('ERR-RP-05', {});
      expect(result.whatHappened).toBe(
        'The Skill definition for the agent could not be found.',
      );
    });
  });

  describe('pure function guarantees', () => {
    it('does not include Error object text, stack traces, or internal IDs in output', () => {
      const types: Array<import('../../../src/types.js').UserFacingErrorType> = [
        'ERR-RP-01',
        'ERR-RP-02',
        'ERR-RP-03',
        'ERR-RP-04',
        'ERR-RP-05',
      ];
      for (const type of types) {
        const result = buildErrorMessage(type, {
          agentDisplayName: 'pm',
          agentId: 'pm',
          maxRetries: 3,
        });
        const allText = `${result.title} ${result.whatHappened} ${result.whatToDo}`;
        expect(allText).not.toMatch(/Error:/); // no stack trace header
        expect(allText).not.toMatch(/at \w+\s*\(/); // no stack frame
        expect(allText).not.toMatch(/undefined/i);
        expect(allText).not.toMatch(/null/);
      }
    });

    it('returns an object with title, whatHappened, and whatToDo for every type', () => {
      const types: Array<import('../../../src/types.js').UserFacingErrorType> = [
        'ERR-RP-01',
        'ERR-RP-02',
        'ERR-RP-03',
        'ERR-RP-04',
        'ERR-RP-05',
      ];
      for (const type of types) {
        const result = buildErrorMessage(type, {
          agentDisplayName: 'pm',
          agentId: 'pm',
          maxRetries: 3,
        });
        expect(typeof result.title).toBe('string');
        expect(result.title.length).toBeGreaterThan(0);
        expect(typeof result.whatHappened).toBe('string');
        expect(result.whatHappened.length).toBeGreaterThan(0);
        expect(typeof result.whatToDo).toBe('string');
        expect(result.whatToDo.length).toBeGreaterThan(0);
      }
    });
  });
});
