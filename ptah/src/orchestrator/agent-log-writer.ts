import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";
import type { ArtifactLogEntry } from "../types.js";
import type { MergeLock } from "./merge-lock.js";
import { MergeLockTimeoutError } from "./merge-lock.js";

export interface AgentLogWriter {
  append(entry: ArtifactLogEntry): Promise<void>;
}

export function formatAgentName(agentId: string): string {
  return agentId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const LOG_DIR = "docs/agent-logs";
const HEADER_MARKER = "| Date |";

export class DefaultAgentLogWriter implements AgentLogWriter {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly mergeLock: MergeLock,
    private readonly logger: Logger,
  ) {}

  async append(entry: ArtifactLogEntry): Promise<void> {
    let release: (() => void) | undefined;
    try {
      release = await this.mergeLock.acquire(10_000);
    } catch (err) {
      if (err instanceof MergeLockTimeoutError) {
        this.logger.warn(`Log append lock timeout for ${entry.agentId}`);
        return;
      }
      this.logger.warn(`Log append lock error: ${(err as Error).message}`);
      return;
    }

    try {
      const logPath = this.fileSystem.joinPath(LOG_DIR, `${entry.agentId}.md`);

      // Check if file exists by trying to read it
      let fileExists = true;
      let fileContent = "";
      try {
        fileContent = await this.fileSystem.readFile(logPath);
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === "ENOENT") {
          fileExists = false;
        }
      }

      if (!fileExists) {
        // Create directory and write header
        await this.fileSystem.mkdir(LOG_DIR);
        const displayName = formatAgentName(entry.agentId);
        const header = `# ${displayName} Activity Log\n\n| Date | Thread | Status | Commit | Summary |\n|------|--------|--------|--------|---------|`;
        await this.fileSystem.writeFile(logPath, header + "\n");
        this.logger.warn(`Created new log file for agent: ${entry.agentId}`);
      } else if (!fileContent.includes(HEADER_MARKER)) {
        // Malformed file - append best-effort
        this.logger.warn(`Malformed log file for agent: ${entry.agentId}, appending best-effort`);
      }

      // Format row
      const escapedThreadName = escapePipe(entry.threadName);
      const escapedSummary = escapePipe(entry.summary);
      const commitDisplay = entry.commitSha ?? "\u2014";
      const row = `| ${entry.timestamp} | ${escapedThreadName} | ${entry.status} | ${commitDisplay} | ${escapedSummary} |`;

      // Append with retry
      try {
        await this.fileSystem.appendFile(logPath, row + "\n");
      } catch {
        // Retry once after 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
          await this.fileSystem.appendFile(logPath, row + "\n");
        } catch (retryErr) {
          this.logger.warn(
            `Log append failed for ${entry.agentId}: ${(retryErr as Error).message}`,
          );
          return;
        }
      }
    } finally {
      if (release) {
        release();
      }
    }
  }
}
