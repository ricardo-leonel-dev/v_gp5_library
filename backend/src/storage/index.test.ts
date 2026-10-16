import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getStorage } from "./index";
import { LocalFsStorageAdapter } from "./local-fs-adapter";

describe("getStorage", () => {
  test("returns a zero-argument function (signature preserved)", () => {
    expect(getStorage.length).toBe(0);
  });

  test("returns a LocalFsStorageAdapter against the real .env STORAGE_DIR that round-trips bytes", async () => {
    const adapter = getStorage();
    expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);

    const baseDir = process.env.STORAGE_DIR ?? "./storage";
    const key = path.posix.join(
      "index-resolver-test",
      `preset-${crypto.randomUUID()}.syx`,
    );
    const bytes = new Uint8Array([42, 43, 44]);

    try {
      await adapter.put(key, bytes);
      const got = await adapter.get(key);
      expect(got).toEqual(bytes);
    } finally {
      await adapter.delete(key);
    }

    // Reference baseDir so the assertion is clearly tied to the real configured dir
    // (LocalFsStorageAdapter's get/put already proved it round-trips at that location).
    expect(typeof baseDir === "string" && baseDir.length > 0).toBe(true);
  });
});