import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalFsStorageAdapter } from "./local-fs-adapter";

describe("LocalFsStorageAdapter", () => {
  let dir: string;
  let adapter: LocalFsStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "gp5-storage-"));
    adapter = new LocalFsStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("put/get round-trips bytes under a nested key", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await adapter.put("songs/song-1/preset.syx", bytes);

    const result = await adapter.get("songs/song-1/preset.syx");

    expect(result).toEqual(bytes);
  });

  test("get returns null for a missing key", async () => {
    const result = await adapter.get("songs/does-not-exist.syx");
    expect(result).toBeNull();
  });

  test("delete removes a stored file", async () => {
    await adapter.put("songs/song-2/preset.syx", new Uint8Array([9]));
    await adapter.delete("songs/song-2/preset.syx");

    const result = await adapter.get("songs/song-2/preset.syx");

    expect(result).toBeNull();
  });

  test("rejects a key that escapes the storage root", async () => {
    await expect(adapter.put("../escape.txt", new Uint8Array([1]))).rejects.toThrow();
  });
});
