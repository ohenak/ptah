import type { FileSystem } from "../../src/services/filesystem.js";
import type { GitClient } from "../../src/services/git.js";
import * as nodePath from "node:path";

export class FakeFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();
  private _cwd: string;
  writeFileError: Error | null = null;

  constructor(cwd: string = "/fake/project") {
    this._cwd = cwd;
  }

  addExisting(path: string, content: string = ""): void {
    this.files.set(path, content);
  }

  addExistingDir(path: string): void {
    this.dirs.add(path);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  hasDir(path: string): boolean {
    return this.dirs.has(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.writeFileError) throw this.writeFileError;
    this.files.set(path, content);
  }

  cwd(): string {
    return this._cwd;
  }

  basename(path: string): string {
    return nodePath.basename(path);
  }
}

export class FakeGitClient implements GitClient {
  isRepoReturn = true;
  hasStagedReturn = false;
  addedPaths: string[][] = [];
  commits: string[] = [];
  addError: Error | null = null;
  commitError: Error | null = null;
  isRepoError: Error | null = null;

  async isRepo(): Promise<boolean> {
    if (this.isRepoError) throw this.isRepoError;
    return this.isRepoReturn;
  }

  async hasStagedChanges(): Promise<boolean> {
    return this.hasStagedReturn;
  }

  async add(paths: string[]): Promise<void> {
    if (this.addError) throw this.addError;
    this.addedPaths.push(paths);
  }

  async commit(message: string): Promise<void> {
    if (this.commitError) throw this.commitError;
    this.commits.push(message);
  }
}
