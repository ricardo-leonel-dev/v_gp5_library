import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./adapter";

export class LocalFsStorageAdapter implements StorageAdapter {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error(`invalid storage key: ${key}`);
    }
    return resolved;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await Bun.write(filePath, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const file = Bun.file(this.resolve(key));
    if (!(await file.exists())) return null;
    return new Uint8Array(await file.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
