import type { FileSystem } from '../services/filesystem.js';
import type { Logger } from '../services/logger.js';
import type { AgentEntry, RegisteredAgent, AgentValidationError } from '../types.js';

export interface AgentRegistry {
  getAgentById(id: string): RegisteredAgent | null;
  getAgentByMentionId(mentionId: string): RegisteredAgent | null;
  getAllAgents(): RegisteredAgent[];
}

export class DefaultAgentRegistry implements AgentRegistry {
  private readonly byId: Map<string, RegisteredAgent>;
  private readonly byMentionId: Map<string, RegisteredAgent>;

  constructor(agents: RegisteredAgent[]) {
    this.byId = new Map(agents.map(a => [a.id, a]));
    this.byMentionId = new Map(agents.map(a => [a.mention_id, a]));
  }

  getAgentById(id: string): RegisteredAgent | null {
    return this.byId.get(id) ?? null;
  }

  getAgentByMentionId(mentionId: string): RegisteredAgent | null {
    return this.byMentionId.get(mentionId) ?? null;
  }

  getAllAgents(): RegisteredAgent[] {
    return Array.from(this.byId.values());
  }
}

const ID_REGEX = /^[a-z0-9-]+$/;
const MENTION_ID_REGEX = /^\d+$/;

/**
 * Validates AgentEntry[] from config and builds a DefaultAgentRegistry.
 * Invalid or duplicate entries are skipped and logged; startup is not aborted.
 * Returns the registry and the list of validation errors for testing.
 *
 * The logger parameter should already be a component-scoped logger for 'config'.
 */
export async function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): Promise<{ registry: AgentRegistry; errors: AgentValidationError[] }> {
  const errors: AgentValidationError[] = [];
  const registered: RegisteredAgent[] = [];
  const seenIds = new Set<string>();
  const seenMentionIds = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // --- 2a: Validate required fields ---
    if (!entry.id) {
      errors.push({ index: i, field: 'id', reason: 'missing required field' });
      logger.error(`agent entry at index ${i} is missing required field 'id'. Skipping.`);
      continue;
    }

    if (!entry.skill_path) {
      errors.push({ index: i, agentId: entry.id, field: 'skill_path', reason: 'missing required field' });
      logger.error(`agent entry at index ${i} is missing required field 'skill_path'. Skipping.`);
      continue;
    }

    if (!entry.log_file) {
      errors.push({ index: i, agentId: entry.id, field: 'log_file', reason: 'missing required field' });
      logger.error(`agent entry at index ${i} is missing required field 'log_file'. Skipping.`);
      continue;
    }

    if (!entry.mention_id) {
      errors.push({ index: i, agentId: entry.id, field: 'mention_id', reason: 'missing required field' });
      logger.error(`agent entry at index ${i} is missing required field 'mention_id'. Skipping.`);
      continue;
    }

    // --- 2b: Validate id format ---
    if (!ID_REGEX.test(entry.id)) {
      errors.push({ index: i, agentId: entry.id, field: 'id', reason: `invalid format: id must match /^[a-z0-9-]+$/` });
      logger.error(`agent entry at index ${i} has invalid id '${entry.id}': must match /^[a-z0-9-]+$/. Skipping.`);
      continue;
    }

    // --- 2c: Check duplicate id ---
    if (seenIds.has(entry.id)) {
      errors.push({ index: i, agentId: entry.id, field: 'id', reason: `duplicate id '${entry.id}'` });
      logger.warn(`duplicate agent id '${entry.id}' at index ${i}. First registration wins; skipping duplicate.`);
      continue;
    }

    // --- 2d: Validate skill_path file existence ---
    const skillExists = await fs.exists(entry.skill_path);
    if (!skillExists) {
      errors.push({ index: i, agentId: entry.id, field: 'skill_path', reason: `skill file not found: ${entry.skill_path}` });
      logger.error(`skill file not found for agent '${entry.id}': ${entry.skill_path}. Skipping agent.`);
      continue;
    }

    // --- 2e: Validate log_file existence ---
    const logExists = await fs.exists(entry.log_file);
    if (!logExists) {
      errors.push({ index: i, agentId: entry.id, field: 'log_file', reason: `log file not found: ${entry.log_file}` });
      logger.error(`log file not found for agent '${entry.id}': ${entry.log_file}. Skipping agent.`);
      continue;
    }

    // --- 2f: Validate mention_id format ---
    if (!MENTION_ID_REGEX.test(entry.mention_id)) {
      errors.push({ index: i, agentId: entry.id, field: 'mention_id', reason: `invalid format: mention_id must match /^\\d+$/` });
      logger.error(`agent entry at index ${i} has invalid mention_id '${entry.mention_id}': must be numeric digits. Skipping.`);
      continue;
    }

    // --- 2g: Check duplicate mention_id ---
    if (seenMentionIds.has(entry.mention_id)) {
      errors.push({ index: i, agentId: entry.id, field: 'mention_id', reason: `duplicate mention_id '${entry.mention_id}'` });
      logger.warn(`duplicate mention_id '${entry.mention_id}' for agent '${entry.id}' at index ${i}. First registration wins; skipping duplicate.`);
      continue;
    }

    // --- 2h: Register agent ---
    registered.push({
      id: entry.id,
      skill_path: entry.skill_path,
      log_file: entry.log_file,
      mention_id: entry.mention_id,
      display_name: entry.display_name ?? entry.id,
    });
    seenIds.add(entry.id);
    seenMentionIds.add(entry.mention_id);
  }

  // --- 3: Log result ---
  if (registered.length > 0) {
    const ids = registered.map(a => a.id).join(', ');
    logger.info(`${registered.length} agent(s) registered: ${ids}`);
  } else {
    logger.warn('no agents registered. Orchestrator will start but cannot route messages.');
  }

  return { registry: new DefaultAgentRegistry(registered), errors };
}
