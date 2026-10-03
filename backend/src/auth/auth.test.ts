import { describe, expect, test } from "bun:test";
import { decodeJwt } from "jose";
import { getDb } from "../db/client";
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

async function postJson(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("role exposure (plan_management_admin)", () => {
  test("register returns a user body with role 'user' and a token without a role claim (R33, R10)", async () => {
    const email = randomEmail();
    const res = await postJson("/auth/register", { email, password: "pw-123456" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(["email", "id", "plan", "role"]);
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("user");
    expect(decodeJwt(body.token)).not.toHaveProperty("role");
  });

  test("register with role 'admin' in the body still creates a 'user' (R31)", async () => {
    const email = randomEmail();
    const res = await postJson("/auth/register", { email, password: "pw-123456", role: "admin" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { role: string } };
    expect(body.user.role).toBe("user");
    const [row] = await getDb()<{ role: string }[]>`SELECT role FROM users WHERE email = ${email}`;
    expect(row!.role).toBe("user");
  });

  test("login returns a user body and a token without a role claim (R34, R10)", async () => {
    const email = randomEmail();
    await postJson("/auth/register", { email, password: "pw-123456" });
    await getDb()`UPDATE users SET role = 'admin' WHERE email = ${email}`;

    const res = await postJson("/auth/login", { email, password: "pw-123456" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(["email", "id", "plan", "role"]);
    expect(body.user.role).toBe("admin");
    expect(decodeJwt(body.token)).not.toHaveProperty("role");
  });

  test("/auth/me returns the role read from the DB on each request (R32)", async () => {
    const email = randomEmail();
    const reg = await postJson("/auth/register", { email, password: "pw-123456" });
    const { token } = (await reg.json()) as { token: string };
    const headers = { Authorization: `Bearer ${token}` };

    const before = await app.request("/auth/me", { headers });
    const beforeBody = (await before.json()) as Record<string, unknown>;
    expect(Object.keys(beforeBody).sort()).toEqual(["email", "id", "plan", "role"]);
    expect(beforeBody.role).toBe("user");

    await getDb()`UPDATE users SET role = 'admin' WHERE email = ${email}`;
    const after = await app.request("/auth/me", { headers });
    expect(((await after.json()) as { role: string }).role).toBe("admin");
  });
});
