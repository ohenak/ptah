import type { FileSystem } from "../services/filesystem.js";
import type { GitClient } from "../services/git.js";
import type { InitResult } from "../types.js";
import { DIRECTORY_MANIFEST, FILE_MANIFEST, buildConfig } from "../config/defaults.js";

const COMMIT_MESSAGE = "[ptah] init: scaffolded docs structure";

export class InitCommand {
  constructor(
    private fs: FileSystem,
    private git: GitClient,
  ) {}

  async execute(): Promise<InitResult> {
    // Step 1: Check Git is initialized
    const isRepo = await this.git.isRepo();
    if (!isRepo) {
      throw new Error("Not a Git repository. Run 'git init' first.");
    }

    // Step 2: Check for pre-existing staged changes
    const hasStaged = await this.git.hasStagedChanges();
    if (hasStaged) {
      throw new Error(
        "Staged changes detected. Please commit or stash them before running 'ptah init'."
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];

    // Step 3 & 4a: Create directories
    for (const dir of DIRECTORY_MANIFEST) {
      const exists = await this.fs.exists(dir);
      if (!exists) {
        await this.fs.mkdir(dir);
      }
      // Directories are NOT added to skipped[] — silently continue
    }

    // Step 4b: Create files
    const projectName = this.fs.basename(this.fs.cwd());
    const configContent = buildConfig(projectName);

    for (const [filePath, content] of Object.entries(FILE_MANIFEST)) {
      const exists = await this.fs.exists(filePath);
      if (exists) {
        skipped.push(filePath);
      } else {
        const fileContent = filePath === "ptah.config.json" ? configContent : content;
        await this.fs.writeFile(filePath, fileContent);
        created.push(filePath);
      }
    }

    // Step 6: No-op if nothing created
    if (created.length === 0) {
      return { created, skipped, committed: false };
    }

    // Step 7: Git add and commit
    await this.git.add(created);
    await this.git.commit(COMMIT_MESSAGE);

    return { created, skipped, committed: true };
  }
}
