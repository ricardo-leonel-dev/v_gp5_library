import { describe, expect, test } from "bun:test";
import { getDb } from "./client";

describe("getDb", () => {
  test("returns a zero-argument function (signature preserved)", () => {
    expect(getDb.length).toBe(0);
  });

  test("resolves a working SQL client against the real .env DATABASE_URL", async () => {
    const db = getDb();
    const rows = await db`SELECT 1 as one`;
    expect(rows.length).toBe(1);
    expect((rows[0] as { one: number }).one).toBe(1);
  });
});