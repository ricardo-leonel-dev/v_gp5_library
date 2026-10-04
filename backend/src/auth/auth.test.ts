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

describe("email normalization (email_lowercase_normalization)", () => {
  test("register stores and returns the trimmed lowercase email (R2, R3)", async () => {
    const id = crypto.randomUUID();
    const res = await postJson("/auth/register", {
      email: `  Foo-${id}@Example.COM\t`,
      password: "pw-123456",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe(`foo-${id}@example.com`);
    const [row] = await getDb()<{ email: string }[]>`SELECT email FROM users WHERE id = ${body.user.id}`;
    expect(row!.email).toBe(`foo-${id}@example.com`);
  });

  test("login with a different casing and padding -> 200, sub is the user id, email lowercase (R8, R9)", async () => {
    const id = crypto.randomUUID();
    const reg = await postJson("/auth/register", { email: `Foo-${id}@Example.com`, password: "pw-123456" });
    const { user } = (await reg.json()) as { user: { id: string } };

    const res = await postJson("/auth/login", { email: ` FOO-${id}@EXAMPLE.COM `, password: "pw-123456" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { id: string; email: string } };
    expect(decodeJwt(body.token).sub).toBe(user.id);
    expect(body.user.email).toBe(`foo-${id}@example.com`);
  });

  test("register with a case variant of a live or soft-deleted row -> 409 (R4)", async () => {
    const liveId = crypto.randomUUID();
    await postJson("/auth/register", { email: `dup-${liveId}@example.com`, password: "pw-123456" });
    const live = await postJson("/auth/register", { email: `DUP-${liveId}@Example.COM`, password: "pw-123456" });
    expect(live.status).toBe(409);
    expect(await live.json()).toEqual({ error: "Email is already registered" });

    const deletedId = crypto.randomUUID();
    await getDb()`
      INSERT INTO users (email, password_hash, deleted_at)
      VALUES (${`gone-${deletedId}@example.com`}, 'x', NOW())
    `;
    const deleted = await postJson("/auth/register", {
      email: `Gone-${deletedId}@EXAMPLE.com`,
      password: "pw-123456",
    });
    expect(deleted.status).toBe(409);
    expect(await deleted.json()).toEqual({ error: "Email is already registered" });
  });

  test("whitespace-only email -> 400 on register (no row inserted) and on login (R7, R10)", async () => {
    const countUsers = async () => {
      const [r] = await getDb()<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users`;
      return r!.n;
    };
    const before = await countUsers();
    const reg = await postJson("/auth/register", { email: "   ", password: "pw-123456" });
    expect(reg.status).toBe(400);
    expect(await reg.json()).toEqual({ error: "email and password are required" });
    expect(await countUsers()).toBe(before);

    const login = await postJson("/auth/login", { email: " \t ", password: "pw-123456" });
    expect(login.status).toBe(400);
    expect(await login.json()).toEqual({ error: "email and password are required" });
  });

  test("concurrent case-variant registers -> one 201, one 409, exactly one row (R5, R6)", async () => {
    for (let i = 0; i < 10; i++) {
      const id = crypto.randomUUID();
      const responses = await Promise.all([
        postJson("/auth/register", { email: `Race-${id}@Example.com`, password: "pw-123456" }),
        postJson("/auth/register", { email: `race-${id}@example.com`, password: "pw-123456" }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = responses.find((r) => r.status === 409)!;
      expect(await loser.json()).toEqual({ error: "Email is already registered" });
      const [row] = await getDb()<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM users WHERE lower(email) = ${`race-${id}@example.com`}
      `;
      expect(row!.n).toBe(1);
    }
  });
});
