import { describe, expect, test } from "bun:test";
import { issueToken } from "../auth/jwt";
import { getDb } from "../db/client";
import { createProtectedRouter } from "./protected-router";
import { requireAdmin } from "./require-admin";

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

describe("requireAdmin", () => {
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

  test("soft-deleted admin -> 403 (R6)", async () => {
    const { id, token } = await makeUser("admin");
    await getDb()`UPDATE users SET deleted_at = NOW() WHERE id = ${id}`;
    const res = await ping(token);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "admin role required" });
  });

  test("valid token for a UUID with no users row -> 403 (R6)", async () => {
    const res = await ping(await issueToken(crypto.randomUUID(), "free"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "admin role required" });
  });

  test("valid token whose sub is not a UUID -> 403 (R6)", async () => {
    const res = await ping(await issueToken("not-a-uuid", "free"));
    expect(res.status).toBe(403);
  });

  test("no token -> 401 (R7)", async () => {
    const res = await ping();
    expect(res.status).toBe(401);
  });

  test("garbage token -> 401 (R7)", async () => {
    const res = await ping("not-a-real-token");
    expect(res.status).toBe(401);
  });

  test("revoking admin in the DB -> same token gets 403 on the next request (R8)", async () => {
    const { id, token } = await makeUser("admin");
    expect((await ping(token)).status).toBe(200);
    await getDb()`UPDATE users SET role = 'user' WHERE id = ${id}`;
    expect((await ping(token)).status).toBe(403);
  });

  test("granting admin in the DB -> same token passes on the next request (R9)", async () => {
    const { id, token } = await makeUser("user");
    expect((await ping(token)).status).toBe(403);
    await getDb()`UPDATE users SET role = 'admin' WHERE id = ${id}`;
    expect((await ping(token)).status).toBe(200);
  });
});
