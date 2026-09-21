import { describe, expect, test } from "bun:test";
import app from "../index";
import { issueToken } from "./jwt";

function randomEmail(): string {
  return `test-${crypto.randomUUID()}@example.com`;
}

describe("auth round-trip", () => {
  test("register -> login -> protected route with the token -> 200", async () => {
    const email = randomEmail();
    const password = "correct horse battery staple";

    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(registerRes.status).toBe(201);
    const { token: registerToken } = (await registerRes.json()) as { token: string };

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(loginRes.status).toBe(200);
    const { token } = (await loginRes.json()) as { token: string };
    expect(typeof token).toBe("string");
    expect(registerToken).not.toBe("");

    const meRes = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as { email: string };
    expect(me.email).toBe(email);
  });

  test("protected route without a token -> 401", async () => {
    const res = await app.request("/auth/me");
    expect(res.status).toBe(401);
  });

  test("protected route with a garbage token -> 401", async () => {
    const res = await app.request("/auth/me", {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  test("wrong password on login -> 401", async () => {
    const email = randomEmail();
    await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "the-real-password" }),
    });

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });

    expect(res.status).toBe(401);
  });

  test("expired token to /auth/me -> 401 (R4 regression)", async () => {
    const email = randomEmail();
    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "the-real-password" }),
    });
    const { user } = (await registerRes.json()) as { user: { id: string } };

    const expiredToken = await issueToken(user.id, "free", "-10s");
    const res = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(res.status).toBe(401);
  });

  test("tampered token to /auth/me -> 401 (R5 regression)", async () => {
    const email = randomEmail();
    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "the-real-password" }),
    });
    const { token } = (await registerRes.json()) as { token: string };

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastChar = token.slice(-1);
    const flippedVal = alphabet.indexOf(lastChar) ^ 0x10;
    const flippedChar = alphabet[flippedVal];
    const tamperedToken = token.slice(0, -1) + flippedChar;

    expect(tamperedToken).not.toBe(token);

    const res = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });

    expect(res.status).toBe(401);
  });

  test("GET /auth/me?userId=<other-uuid> ignores the spoofed id and returns the token's own user (R10)", async () => {
    const email = randomEmail();
    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "the-real-password" }),
    });
    const { token } = (await registerRes.json()) as { token: string };

    const spoofedUserId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(`/auth/me?userId=${spoofedUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const me = (await res.json()) as { email: string; id: string };
    expect(me.email).toBe(email);
    expect(me.id).not.toBe(spoofedUserId);
  });
});
