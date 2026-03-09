import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  cwd(): string;
  basename(path: string): string;
}

export class NodeFileSystem implements FileSystem {
  private _cwd: string;

  constructor(cwd?: string) {
    this._cwd = cwd ?? process.cwd();
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.resolve(this._cwd, filePath));
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(path.resolve(this._cwd, dirPath), { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(path.resolve(this._cwd, filePath), content, "utf-8");
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(path.resolve(this._cwd, filePath), "utf-8");
  }

  cwd(): string {
    return this._cwd;
  }

  basename(p: string): string {
    return path.basename(p);
  }
}
