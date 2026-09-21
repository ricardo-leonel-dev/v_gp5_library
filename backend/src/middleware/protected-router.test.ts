import { describe, expect, test } from "bun:test";
import { createProtectedRouter } from "./protected-router";
import { issueToken } from "../auth/jwt";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

function buildTestApp() {
  const router = createProtectedRouter();
  router.get("/__test", (c) => c.json({ userId: c.get("userId") }));
  return router;
}

describe("protectedRouter", () => {
  test("applies requireAuth to every registered route without a per-route argument (R1)", async () => {
    const app = buildTestApp();

    const validToken = await issueToken(TEST_USER_ID, "free");
    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(TEST_USER_ID);
  });

  test("missing Authorization header -> 401 (R2)", async () => {
    const app = buildTestApp();

    const res = await app.request("/__test");
    expect(res.status).toBe(401);
  });

  test("Authorization header without Bearer prefix -> 401 (R3)", async () => {
    const app = buildTestApp();

    const res = await app.request("/__test", {
      headers: { Authorization: "Basic xyz" },
    });
    expect(res.status).toBe(401);
  });

  test("expired bearer token -> 401 (R4)", async () => {
    const app = buildTestApp();

    const expiredToken = await issueToken(TEST_USER_ID, "free", "-10s");
    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });

  test("tampered bearer token signature -> 401 (R5)", async () => {
    const app = buildTestApp();

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const validToken = await issueToken(TEST_USER_ID, "free");
    const lastChar = validToken.slice(-1);
    const flippedVal = alphabet.indexOf(lastChar) ^ 0x10;
    const tamperedToken = validToken.slice(0, -1) + alphabet[flippedVal];

    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    expect(res.status).toBe(401);
  });

  test("valid bearer token -> 200 with c.get('userId') set to the token subject (R6)", async () => {
    const app = buildTestApp();

    const token = await issueToken(TEST_USER_ID, "free");
    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(TEST_USER_ID);
  });
});
