// src/orchestrator/question-store.ts
import type { PendingQuestion } from "../types.js";
import type { FileSystem } from "../services/filesystem.js";
import type { GitClient } from "../services/git.js";
import type { Logger } from "../services/logger.js";
import type { MergeLock } from "./merge-lock.js";

export interface QuestionStore {
  /**
   * Atomically assign a Q-NNNN ID, write the entry to pending.md, and commit.
   * Scans both pending.md and resolved.md inside a single MergeLock acquisition to prevent duplicate IDs.
   * Returns the complete PendingQuestion with id populated.
   * Commit message: "[ptah] System: add question {id} from {agentId}"
   */
  appendQuestion(question: Omit<PendingQuestion, "id">): Promise<PendingQuestion>;

  /**
   * Write the Discord message ID into the matching question block in pending.md.
   * No-op if questionId not found.
   * Commit message: "[ptah] System: update {questionId} notification"
   */
  updateDiscordMessageId(questionId: string, messageId: string): Promise<void>;

  /**
   * Read and parse all question entries from pending.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   */
  readPendingQuestions(): Promise<PendingQuestion[]>;

  /**
   * Read and parse all question entries from resolved.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   * Used on startup to seed the discordMessageIdMap.
   */
  readResolvedQuestions(): Promise<PendingQuestion[]>;

  /**
   * Find a single question in pending.md by ID.
   * Returns null if not found.
   */
  getQuestion(questionId: string): Promise<PendingQuestion | null>;

  /**
   * Write the user's answer into the Answer section of the question entry in pending.md.
   * Commit message: "[ptah] System: answer {questionId} via Discord"
   */
  setAnswer(questionId: string, answer: string): Promise<void>;

  /**
   * Remove the question from pending.md and append it (with Answered timestamp) to resolved.md.
   * Both files written in a single merge-locked git commit.
   * Commit message: "[ptah] System: resolve {questionId}"
   * Creates resolved.md with standard header if absent.
   */
  archiveQuestion(questionId: string, resolvedAt: Date): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all Q-NNNN numbers from a file's content via comment markers. */
function extractIds(content: string): number[] {
  const ids: number[] = [];
  // Matches <!-- Q-0001 --> style markers
  const re = /<!--\s*Q-(\d{4,})\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    ids.push(parseInt(m[1], 10));
  }
  return ids;
}

/** Derive next Q-NNNN id given the contents of pending.md and resolved.md. */
function nextId(pendingContent: string, resolvedContent: string): string {
  const all = [...extractIds(pendingContent), ...extractIds(resolvedContent)];
  const maxN = all.length > 0 ? Math.max(...all) : 0;
  return `Q-${String(maxN + 1).padStart(4, "0")}`;
}

/** Format a PendingQuestion as a markdown block (without trailing separator). */
function formatQuestionBlock(q: PendingQuestion): string {
  const discordId = q.discordMessageId ?? "";
  const answer = q.answer ?? "(blank until answered)";
  return [
    `<!-- ${q.id} -->`,
    `**ID:** ${q.id}`,
    `**Agent:** ${q.agentId}`,
    `**Thread:** ${q.threadName}`,
    `**Thread ID:** ${q.threadId}`,
    `**Asked:** ${q.askedAt.toISOString()}`,
    `**Discord Message ID:** ${discordId}`,
    ``,
    `**Question:**`,
    q.questionText,
    ``,
    `**Answer:**`,
    answer,
    ``,
    `---`,
    ``,
  ].join("\n");
}

/** Format a PendingQuestion as a resolved markdown block (includes Answered line). */
function formatResolvedBlock(q: PendingQuestion, resolvedAt: Date): string {
  const discordId = q.discordMessageId ?? "";
  const answer = q.answer ?? "";
  return [
    `<!-- ${q.id} -->`,
    `**ID:** ${q.id}`,
    `**Agent:** ${q.agentId}`,
    `**Thread:** ${q.threadName}`,
    `**Thread ID:** ${q.threadId}`,
    `**Asked:** ${q.askedAt.toISOString()}`,
    `**Answered:** ${resolvedAt.toISOString()}`,
    `**Discord Message ID:** ${discordId}`,
    ``,
    `**Question:**`,
    q.questionText,
    ``,
    `**Answer:**`,
    answer,
    ``,
    `---`,
    ``,
  ].join("\n");
}

/**
 * Parse a single question block (text between --- separators).
 * Returns null if the block cannot be parsed.
 */
function parseBlock(block: string): PendingQuestion | null {
  // Must have the ID comment marker
  const idMatch = /<!--\s*(Q-\d{4,})\s*-->/.exec(block);
  if (!idMatch) return null;
  const id = idMatch[1];

  const agentMatch = /\*\*Agent:\*\*\s*(.+)/.exec(block);
  const threadMatch = /\*\*Thread:\*\*\s*(.+)/.exec(block);
  const threadIdMatch = /\*\*Thread ID:\*\*\s*(.+)/.exec(block);
  const askedMatch = /\*\*Asked:\*\*\s*(.+)/.exec(block);
  const discordMatch = /\*\*Discord Message ID:\*\* ?([^\n]*)/.exec(block);

  if (!agentMatch || !threadMatch || !threadIdMatch || !askedMatch) return null;

  const agentId = agentMatch[1].trim();
  const threadName = threadMatch[1].trim();
  const threadId = threadIdMatch[1].trim();
  const askedAt = new Date(askedMatch[1].trim());

  if (isNaN(askedAt.getTime())) return null;

  const discordRaw = discordMatch ? discordMatch[1].trim() : "";
  const discordMessageId = discordRaw.length > 0 ? discordRaw : null;

  // Extract question text: content after **Question:**\n and before **Answer:**\n
  const questionSection = /\*\*Question:\*\*\n([\s\S]*?)\n\*\*Answer:\*\*/m.exec(block);
  if (!questionSection) return null;
  const questionText = questionSection[1].trim();

  // Extract answer: content after **Answer:**\n
  const answerSection = /\*\*Answer:\*\*\n([\s\S]*)$/m.exec(block);
  const answerRaw = answerSection ? answerSection[1].trim() : "";
  const answer = answerRaw.length > 0 && answerRaw !== "(blank until answered)" ? answerRaw : null;

  return { id, agentId, threadId, threadName, askedAt, questionText, answer, discordMessageId };
}

/** Read a file, returning "" on ENOENT. Throws on other errors. */
async function readFileOrEmpty(fs: FileSystem, path: string): Promise<string> {
  try {
    return await fs.readFile(path);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") return "";
    throw err;
  }
}

/** Split file content into question blocks by --- separator, handling header prefix. */
function splitBlocks(content: string): string[] {
  // Split on --- separator
  const segments = content.split(/\n---\n/);
  const blocks: string[] = [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length === 0) continue;

    // A segment may begin with a file header line (# Pending/Resolved Questions).
    // Strip the header line if present and process the remainder.
    let body = trimmed;
    if (trimmed.startsWith("# ")) {
      // Remove the first line (header)
      const firstNewline = trimmed.indexOf("\n");
      if (firstNewline === -1) continue; // Only a header line, nothing else
      body = trimmed.slice(firstNewline).trim();
      if (body.length === 0) continue;
    }

    // body now contains what's after the header (or the whole segment if no header)
    // It may start with a question marker or be malformed content
    if (body.startsWith("<!-- Q-")) {
      blocks.push(body);
    } else {
      // Malformed content — add so parser can warn about it
      blocks.push(body);
    }
  }

  return blocks;
}

/** Parse all blocks from file content, logging warnings for unparseable ones. */
function parseBlocks(content: string, logger: Logger, filePath: string): PendingQuestion[] {
  const blocks = splitBlocks(content);
  const results: PendingQuestion[] = [];
  for (const block of blocks) {
    const q = parseBlock(block);
    if (q) {
      results.push(q);
    } else {
      logger.warn(`Unparseable question block in ${filePath}: ${block.substring(0, 80)}`);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// DefaultQuestionStore
// ---------------------------------------------------------------------------

export class DefaultQuestionStore implements QuestionStore {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly gitClient: GitClient,
    private readonly mergeLock: MergeLock,
    private readonly logger: Logger,
    private readonly pendingPath: string,
    private readonly resolvedPath: string,
  ) {}

  async appendQuestion(question: Omit<PendingQuestion, "id">): Promise<PendingQuestion> {
    const release = await this.mergeLock.acquire();
    try {
      const pendingContent = await readFileOrEmpty(this.fileSystem, this.pendingPath);
      const resolvedContent = await readFileOrEmpty(this.fileSystem, this.resolvedPath);

      const id = nextId(pendingContent, resolvedContent);
      const fullQuestion: PendingQuestion = { ...question, id };

      const block = formatQuestionBlock(fullQuestion);

      let newContent: string;
      if (pendingContent.trim().length === 0) {
        newContent = `# Pending Questions\n\n${block}`;
      } else {
        newContent = `${pendingContent}\n${block}`;
      }

      await this.fileSystem.writeFile(this.pendingPath, newContent);
      await this.gitClient.add([this.pendingPath]);
      await this.gitClient.commit(
        `[ptah] System: add question ${id} from ${question.agentId}`,
      );

      return fullQuestion;
    } finally {
      release();
    }
  }

  async updateDiscordMessageId(questionId: string, messageId: string): Promise<void> {
    const release = await this.mergeLock.acquire();
    try {
      const content = await readFileOrEmpty(this.fileSystem, this.pendingPath);
      if (content.length === 0) return;

      // Check if question exists
      if (!content.includes(`<!-- ${questionId} -->`)) return;

      // Split around the question's marker, update the Discord Message ID line within that section
      // Strategy: find the block for questionId and replace within it
      const updated = replaceDiscordMessageId(content, questionId, messageId);
      if (updated === content) return; // no change

      await this.fileSystem.writeFile(this.pendingPath, updated);
      await this.gitClient.add([this.pendingPath]);
      await this.gitClient.commit(`[ptah] System: update ${questionId} notification`);
    } finally {
      release();
    }
  }

  async readPendingQuestions(): Promise<PendingQuestion[]> {
    const content = await readFileOrEmpty(this.fileSystem, this.pendingPath);
    if (content.trim().length === 0) return [];
    return parseBlocks(content, this.logger, this.pendingPath);
  }

  async readResolvedQuestions(): Promise<PendingQuestion[]> {
    const content = await readFileOrEmpty(this.fileSystem, this.resolvedPath);
    if (content.trim().length === 0) return [];
    return parseBlocks(content, this.logger, this.resolvedPath);
  }

  async getQuestion(questionId: string): Promise<PendingQuestion | null> {
    const questions = await this.readPendingQuestions();
    return questions.find((q) => q.id === questionId) ?? null;
  }

  async setAnswer(questionId: string, answer: string): Promise<void> {
    const release = await this.mergeLock.acquire();
    try {
      const content = await readFileOrEmpty(this.fileSystem, this.pendingPath);
      if (content.length === 0) return;
      if (!content.includes(`<!-- ${questionId} -->`)) return;

      const updated = replaceAnswerInBlock(content, questionId, answer);
      if (updated === content) return;

      await this.fileSystem.writeFile(this.pendingPath, updated);
      await this.gitClient.add([this.pendingPath]);
      await this.gitClient.commit(`[ptah] System: answer ${questionId} via Discord`);
    } finally {
      release();
    }
  }

  async archiveQuestion(questionId: string, resolvedAt: Date): Promise<void> {
    const release = await this.mergeLock.acquire();
    try {
      const pendingContent = await readFileOrEmpty(this.fileSystem, this.pendingPath);
      const resolvedContent = await readFileOrEmpty(this.fileSystem, this.resolvedPath);

      // Find the question block in pending
      const questionBlock = extractQuestionBlock(pendingContent, questionId);
      if (!questionBlock) return;

      const question = parseBlock(questionBlock);
      if (!question) return;

      // Remove question block from pending.md
      const newPending = removeQuestionBlock(pendingContent, questionId);

      // Format the resolved block
      const resolvedBlock = formatResolvedBlock(question, resolvedAt);

      // Build resolved.md content
      let newResolved: string;
      if (resolvedContent.trim().length === 0) {
        newResolved = `# Resolved Questions\n\n${resolvedBlock}`;
      } else {
        newResolved = `${resolvedContent}\n${resolvedBlock}`;
      }

      // Write both files
      await this.fileSystem.writeFile(this.pendingPath, newPending);
      await this.fileSystem.writeFile(this.resolvedPath, newResolved);

      // Single commit
      await this.gitClient.add([this.pendingPath, this.resolvedPath]);
      await this.gitClient.commit(`[ptah] System: resolve ${questionId}`);
    } finally {
      release();
    }
  }
}

// ---------------------------------------------------------------------------
// Block manipulation helpers
// ---------------------------------------------------------------------------

/**
 * Replace the Discord Message ID line within the specific question's block.
 * Only replaces the line that comes after the question's `<!-- Q-NNNN -->` marker.
 */
function replaceDiscordMessageId(
  content: string,
  questionId: string,
  messageId: string,
): string {
  // We locate the question block, then replace the Discord Message ID line within it.
  // Split into segments using --- to isolate blocks, process the matching one.
  const segments = content.split("\n---\n");
  const updated = segments.map((seg) => {
    if (!seg.includes(`<!-- ${questionId} -->`)) return seg;
    // Replace the entire "**Discord Message ID:** <anything up to newline>" line
    return seg.replace(
      /\*\*Discord Message ID:\*\* ?[^\n]*/,
      `**Discord Message ID:** ${messageId}`,
    );
  });
  return updated.join("\n---\n");
}

/**
 * Replace the Answer section within the specific question's block.
 */
function replaceAnswerInBlock(
  content: string,
  questionId: string,
  answer: string,
): string {
  const segments = content.split("\n---\n");
  const updated = segments.map((seg) => {
    if (!seg.includes(`<!-- ${questionId} -->`)) return seg;
    // Replace from **Answer:** to end of block
    return seg.replace(
      /(\*\*Answer:\*\*\n)([\s\S]*)$/m,
      `$1${answer}\n`,
    );
  });
  return updated.join("\n---\n");
}

/**
 * Extract the raw text of a question block given its questionId.
 * Returns null if not found.
 */
function extractQuestionBlock(content: string, questionId: string): string | null {
  const segments = content.split("\n---\n");
  for (const seg of segments) {
    if (seg.includes(`<!-- ${questionId} -->`)) {
      return seg.trim();
    }
  }
  return null;
}

/**
 * Remove a question block (and associated --- separator) from file content.
 */
function removeQuestionBlock(content: string, questionId: string): string {
  const segments = content.split("\n---\n");
  const filtered = segments.filter((seg) => !seg.includes(`<!-- ${questionId} -->`));
  return filtered.join("\n---\n");
}
