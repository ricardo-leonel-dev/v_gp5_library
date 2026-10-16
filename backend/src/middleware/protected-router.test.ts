import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createProtectedRouter } from "./protected-router";
import { createRequireAuth, type AuthVariables } from "./require-auth";
import { requireAdmin } from "./require-admin";
import { issueToken } from "../auth/jwt";
import { getDb } from "../db/client";

const INVALID = { error: "Invalid or expired token" } as const;

async function makeLiveUser(role: "user" | "admin" = "user"): Promise<{ id: string; token: string }> {
  const [user] = await getDb()<{ id: string }[]>`
    INSERT INTO users (email, password_hash, role)
    VALUES (${`prtrt-${crypto.randomUUID()}@example.com`}, 'x', ${role}) RETURNING id
  `;
  return { id: user!.id, token: await issueToken(user!.id, "free") };
}

function buildTestApp() {
  const router = createProtectedRouter();
  router.get("/__test", (c) =>
    c.json({ userId: c.get("userId"), plan: c.get("plan"), role: c.get("role") }),
  );
  return router;
}

describe("protectedRouter", () => {
  test("applies requireAuth to every registered route without a per-route argument (R1)", async () => {
    const app = buildTestApp();
    const { id, token } = await makeLiveUser();

    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(id);
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
    const expired = await issueToken(crypto.randomUUID(), "free", "-10s");

    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });

  test("tampered bearer token signature -> 401 (R5)", async () => {
    const app = buildTestApp();

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const valid = await issueToken(crypto.randomUUID(), "free");
    const last = valid.slice(-1);
    const flippedVal = alphabet.indexOf(last) ^ 0x10;
    const tampered = valid.slice(0, -1) + alphabet[flippedVal];

    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status).toBe(401);
  });

  test("valid bearer token -> 200 with userId, plan, role attached from the live row (R6)", async () => {
    const app = buildTestApp();
    const { id, token } = await makeLiveUser("user");

    const res = await app.request("/__test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; plan: string; role: string };
    expect(body.userId).toBe(id);
    expect(body.plan).toBe("free");
    expect(body.role).toBe("user");
  });
});

describe("requireAuth — live-user role lookup (block_soft_deleted_users_auth)", () => {
  test("live user row -> handler sees userId and role from the DB (R3)", async () => {
    const app = new Hono<{ Variables: AuthVariables }>().use("*", createRequireAuth());
    app.get("/who", (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));

    const { id, token } = await makeLiveUser("user");
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; role: string };
    expect(body.userId).toBe(id);
    expect(body.role).toBe("user");
  });

  test("live admin row -> handler sees role 'admin' (R3)", async () => {
    const app = new Hono<{ Variables: AuthVariables }>().use("*", createRequireAuth());
    app.get("/who", (c) => c.json({ role: c.get("role") }));

    const { token } = await makeLiveUser("admin");
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe("admin");
  });

  test("soft-deleted user -> 401 Invalid or expired token, handler not called (R4, R7)", async () => {
    const app = new Hono<{ Variables: AuthVariables }>().use("*", createRequireAuth());
    let handlerCalled = false;
    app.get("/who", () => {
      handlerCalled = true;
      return new Response();
    });

    const { id, token } = await makeLiveUser();
    await getDb()`UPDATE users SET deleted_at = NOW() WHERE id = ${id}`;

    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(INVALID);
    expect(handlerCalled).toBe(false);
  });

  test("token whose sub is a UUID with no users row -> 401 Invalid or expired token, handler not called (R5, R7)", async () => {
    const app = new Hono<{ Variables: AuthVariables }>().use("*", createRequireAuth());
    let handlerCalled = false;
    app.get("/who", () => {
      handlerCalled = true;
      return new Response();
    });

    const token = await issueToken(crypto.randomUUID(), "free");
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(INVALID);
    expect(handlerCalled).toBe(false);
  });

  test("token whose sub is not a UUID -> 401 Invalid or expired token, handler not called, lookup not invoked (R6, R7)", async () => {
    let lookupCalls = 0;
    const app = new Hono<{ Variables: AuthVariables }>().use(
      "*",
      createRequireAuth(async () => {
        lookupCalls++;
        return "user";
      }),
    );
    let handlerCalled = false;
    app.get("/who", () => {
      handlerCalled = true;
      return new Response();
    });

    const token = await issueToken("not-a-uuid", "free");
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(INVALID);
    expect(handlerCalled).toBe(false);
    expect(lookupCalls).toBe(0);
  });

  test("valid token on a plain route -> lookup called exactly once (R8)", async () => {
    let lookupCalls = 0;
    const app = new Hono<{ Variables: AuthVariables }>().use(
      "*",
      createRequireAuth(async () => {
        lookupCalls++;
        return "user";
      }),
    );
    app.get("/who", (c) => c.json({ ok: true, role: c.get("role") }));

    const { token } = await makeLiveUser();
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(lookupCalls).toBe(1);
  });

  test("valid token on /admin/* with requireAdmin mounted -> lookup called exactly once, 200 (R8, R16)", async () => {
    let lookupCalls = 0;
    const app = new Hono<{ Variables: AuthVariables }>().use(
      "*",
      createRequireAuth(async () => {
        lookupCalls++;
        return "admin";
      }),
    );
    app.use("/admin/*", requireAdmin);
    app.get("/admin/ping", (c) => c.json({ ok: true }));

    const token = await issueToken(crypto.randomUUID(), "free");
    const res = await app.request("/admin/ping", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(lookupCalls).toBe(1);
  });

  test("valid token whose lookup throws -> 500 (R9, D10)", async () => {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
      // Mirror Hono's default: an uncaught throw surfaces as 500.
      // This handler keeps bun:test from bubbling the throw up as a
      // test failure while still letting us assert the status.
      return c.json({ error: err.message }, 500);
    });
    app.use(
      "*",
      createRequireAuth(async () => {
        throw new Error("simulated DB error");
      }),
    );
    app.get("/who", () => new Response());

    const token = await issueToken(crypto.randomUUID(), "free");
    const res = await app.request("/who", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(500);
  });
});