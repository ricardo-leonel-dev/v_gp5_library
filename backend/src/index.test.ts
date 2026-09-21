import { describe, expect, test } from "bun:test";
import app from "./index";

describe("GET /health", () => {
  test("reports ok when the DB is reachable", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
