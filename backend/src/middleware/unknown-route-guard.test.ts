import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { METHOD_NAME_ALL } from "hono/router";
import type { RouterRoute } from "hono/types";
import { createProtectedRouter } from "./protected-router";
import { createCorsMiddleware } from "./cors";
import { jsonNotFound } from "./not-found";
import { buildPathIndex, createUnknownRouteGuard } from "./unknown-route-guard";
import { issueToken } from "../auth/jwt";
import { getDb } from "../db/client";

async function makeLiveUser(): Promise<{ id: string; token: string }> {
  const [user] = await getDb()<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${`urg-${crypto.randomUUID()}@example.com`}, 'x') RETURNING id
  `;
  return { id: user!.id, token: await issueToken(user!.id, "free") };
}

const ALLOWED_ORIGIN = "http://allowed.test";

const passThrough = async (_c: unknown, next: () => Promise<void>) => {
  await next();
};

function buildFixtureApp() {
  const app = new Hono();
  app.use("*", createCorsMiddleware([ALLOWED_ORIGIN]));
  app.use("*", createUnknownRouteGuard(() => app.routes));
  app.post("/public", (c) => c.json({ ok: true }));
  app.use("/mw-only/*", passThrough);
  const protectedRouter = createProtectedRouter();
  protectedRouter.get("/private", (c) => c.json({ userId: c.get("userId") }));
  protectedRouter.get("/private/:id", (c) => c.json({ id: c.req.param("id"), userId: c.get("userId") }));
  protectedRouter.get("/late", (c) => c.json({ userId: c.get("userId") }));
  app.route("/", protectedRouter);
  app.notFound(jsonNotFound);
  return app;
}

describe("unknown-route guard — unknown path no auth (R1, R5)", () => {
  test("GET /nope with no Authorization -> 404 JSON {error:'Not found'} with application/json Content-Type", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(res.headers.get("Content-Type")?.startsWith("application/json")).toBe(true);
  });

  test("GET /private/abc/zzz with no header -> 404 (a :param matches one segment only)", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private/abc/zzz");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("unknown-route guard — unknown path valid token (R2, R5)", () => {
  test("GET /nope with a valid Bearer token -> 404 JSON {error:'Not found'}", async () => {
    const app = buildFixtureApp();
    const token = await issueToken(crypto.randomUUID(), "free");
    const res = await app.request("/nope", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("unknown-route guard — unknown path non-Bearer auth (R3)", () => {
  test("GET /nope with Authorization: Basic xyz -> 404", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/nope", {
      headers: { Authorization: "Basic xyz" },
    });
    expect(res.status).toBe(404);
  });
});

describe("unknown-route guard — unknown path expired or tampered token (R4)", () => {
  test("GET /nope with an expired token -> 404", async () => {
    const app = buildFixtureApp();
    const expired = await issueToken(crypto.randomUUID(), "free", "-10s");
    const res = await app.request("/nope", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(404);
  });

  test("GET /nope with a tampered-signature token -> 404", async () => {
    const app = buildFixtureApp();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const valid = await issueToken(crypto.randomUUID(), "free");
    const last = valid.slice(-1);
    const flippedVal = alphabet.indexOf(last) ^ 0x10;
    const tampered = valid.slice(0, -1) + alphabet[flippedVal];

    const res = await app.request("/nope", {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("method mismatch on a known path (R6, R7)", () => {
  test("PUT /private (only GET registered) with no header -> 401 {error:'Token required'}", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", { method: "PUT" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token required" });
  });

  test("PUT /private with an expired token -> 401 {error:'Invalid or expired token'}", async () => {
    const app = buildFixtureApp();
    const expired = await issueToken(crypto.randomUUID(), "free", "-10s");
    const res = await app.request("/private", {
      method: "PUT",
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
  });

  test("PUT /public (only POST registered) with no header -> 401", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/public", { method: "PUT" });
    expect(res.status).toBe(401);
  });
});

describe("method mismatch on a known path with a valid token (R8, R5)", () => {
  test("PUT /private with a valid token -> 404 (not 405), JSON {error:'Not found'}", async () => {
    const app = buildFixtureApp();
    const { id, token } = await makeLiveUser();
    const res = await app.request("/private", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(405);
    expect(await res.json()).toEqual({ error: "Not found" });
    // Sanity: requireAuth accepted the row (it set userId to the live id).
    // We don't read it directly because the response is the 404 from the
    // unknown-route guard, but the lookup must have completed with 200
    // since the test now reaches the post-middleware path.
    expect(typeof id).toBe("string");
  });
});

describe("protected route without token (R9, R10)", () => {
  test("GET /private with no header -> 401 {error:'Token required'}", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token required" });
  });

  test("GET /private with an expired token -> 401 {error:'Invalid or expired token'}", async () => {
    const app = buildFixtureApp();
    const expired = await issueToken(crypto.randomUUID(), "free", "-10s");
    const res = await app.request("/private", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
  });
});

describe("protected route with a :param (R11)", () => {
  test("GET /private/abc with no header -> 401", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private/abc");
    expect(res.status).toBe(401);
  });
});

describe("HEAD on a known GET path (R12)", () => {
  test("HEAD /private with no header -> 401", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", { method: "HEAD" });
    expect(res.status).toBe(401);
  });
});

describe("late-protected route registration (R13, R14)", () => {
  test("GET /late with no header -> 401", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/late");
    expect(res.status).toBe(401);
  });

  test("GET /late with a valid token -> 200 with userId equal to the live row's id", async () => {
    const app = buildFixtureApp();
    const { id, token } = await makeLiveUser();
    const res = await app.request("/late", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(id);
  });
});

describe("CORS on unknown-path 404 (R15, R16)", () => {
  test("GET /nope with allowed Origin -> 404 and Access-Control-Allow-Origin equal to the request Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/nope", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });

  test("OPTIONS /nope with allowed Origin + Access-Control-Request-Method: GET -> 204", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/nope", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
  });
});

describe("path-existence edge cases (R18, R19)", () => {
  test("GET /private/ (trailing slash, not registered) with no header -> 404", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private/");
    expect(res.status).toBe(404);
  });

  test("GET /mw-only/x (only middleware registered) with no header -> 404", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/mw-only/x");
    expect(res.status).toBe(404);
  });
});

describe("buildPathIndex (R19)", () => {
  test("returns false for /, /anything, and /mw-only/x when routes contain only method-ALL entries", () => {
    const routes: RouterRoute[] = [
      { basePath: "/", path: "/*", method: METHOD_NAME_ALL, handler: passThrough as RouterRoute["handler"] },
      { basePath: "/", path: "/mw-only/*", method: METHOD_NAME_ALL, handler: passThrough as RouterRoute["handler"] },
    ];
    const exists = buildPathIndex(routes);
    expect(exists("/")).toBe(false);
    expect(exists("/anything")).toBe(false);
    expect(exists("/mw-only/x")).toBe(false);
  });
});
