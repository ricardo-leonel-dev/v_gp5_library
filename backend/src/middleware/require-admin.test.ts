import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { issueToken } from "../auth/jwt";
import { getDb } from "../db/client";
import { createProtectedRouter } from "./protected-router";
import { requireAdmin } from "./require-admin";
import type { AuthVariables } from "./require-auth";

function buildTestApp() {
  const router = createProtectedRouter();
  router.use("/admin/*", requireAdmin);
  router.get("/admin/ping", (c) => c.json({ ok: true }));
  return router;
}

async function makeUser(role: "user" | "admin"): Promise<{ id: string; token: string }> {
  const [user] = await getDb()<{ id: string }[]>`
    INSERT INTO users (email, password_hash, role)
    VALUES (${`admin-mw-${crypto.randomUUID()}@example.com`}, 'x', ${role}) RETURNING id
  `;
  return { id: user!.id, token: await issueToken(user!.id, "free") };
}

async function ping(token?: string): Promise<Response> {
  return buildTestApp().request("/admin/ping", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("requireAdmin (via createProtectedRouter)", () => {
  test("admin caller reaches the handler (R5)", async () => {
    const { token } = await makeUser("admin");
    const res = await ping(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("role 'user' -> 403 admin role required (R6)", async () => {
    const { token } = await makeUser("user");
    const res = await ping(token);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "admin role required" });
  });

  test("soft-deleted admin -> 401 Invalid or expired token (D3, R11)", async () => {
    const { id, token } = await makeUser("admin");
    await getDb()`UPDATE users SET deleted_at = NOW() WHERE id = ${id}`;
    const res = await ping(token);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
  });

  test("valid token for a UUID with no users row -> 401 Invalid or expired token (D3, R5)", async () => {
    const res = await ping(await issueToken(crypto.randomUUID(), "free"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
  });

  test("valid token whose sub is not a UUID -> 401 Invalid or expired token (D3, R6)", async () => {
    const res = await ping(await issueToken("not-a-uuid", "free"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
  });

  test("no token -> 401 (R7)", async () => {
    const res = await ping();
    expect(res.status).toBe(401);
  });

  test("garbage token -> 401 (R7)", async () => {
    const res = await ping("not-a-real-token");
    expect(res.status).toBe(401);
  });

  test("revoking admin in the DB -> same token gets 403 on the next request (R8, R18)", async () => {
    const { id, token } = await makeUser("admin");
    expect((await ping(token)).status).toBe(200);
    await getDb()`UPDATE users SET role = 'user' WHERE id = ${id}`;
    expect((await ping(token)).status).toBe(403);
  });

  test("granting admin in the DB -> same token passes on the next request (R9, R18)", async () => {
    const { id, token } = await makeUser("user");
    expect((await ping(token)).status).toBe(403);
    await getDb()`UPDATE users SET role = 'admin' WHERE id = ${id}`;
    expect((await ping(token)).status).toBe(200);
  });
});

describe("requireAdmin — stub-context unit tests (R16, R17)", () => {
  function buildStubApp(prefill: Partial<AuthVariables> & { userId?: string; role?: AuthVariables["role"] }) {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use("/admin/*", async (c, next) => {
      if (prefill.userId !== undefined) c.set("userId", prefill.userId);
      if (prefill.role !== undefined) c.set("role", prefill.role);
      await next();
    });
    app.use("/admin/*", requireAdmin);
    app.get("/admin/ping", (c) => c.json({ ok: true }));
    return app;
  }

  test("role 'admin' + userId with no DB row -> 200 (R16)", async () => {
    const app = buildStubApp({ userId: crypto.randomUUID(), role: "admin" });
    const res = await app.request("/admin/ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("role 'user' + userId of a real admin row -> 403 exact body (R17)", async () => {
    const { id } = await makeUser("admin");
    const app = buildStubApp({ userId: id, role: "user" });
    const res = await app.request("/admin/ping");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "admin role required" });
  });

  test("role unset (only userId set) -> 403 exact body, fail closed (R17)", async () => {
    const { id } = await makeUser("admin");
    const app = buildStubApp({ userId: id });
    const res = await app.request("/admin/ping");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "admin role required" });
  });
});