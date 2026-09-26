import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createProtectedRouter } from "./protected-router";
import { createCorsMiddleware } from "./cors";
import { issueToken } from "../auth/jwt";

const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
const ALLOWED_ORIGIN = "http://allowed.test";
const OTHER_ORIGIN = "http://evil.test";

function buildFixtureApp() {
  const app = new Hono();
  app.use("*", createCorsMiddleware([ALLOWED_ORIGIN]));
  app.post("/public", (c) => c.json({ ok: true }));
  const protectedRouter = createProtectedRouter();
  protectedRouter.get("/private", (c) => c.json({ userId: c.get("userId") }));
  app.route("/", protectedRouter);
  return app;
}

describe("createCorsMiddleware preflight (R6, R7, R8, R9)", () => {
  test("OPTIONS /public from allowed origin returns 204 with Allow-Origin, Allow-Methods, Allow-Headers", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/public", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    const allowMethods = res.headers.get("Access-Control-Allow-Methods") ?? "";
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(allowMethods).toContain(m);
    }
    const allowHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(allowHeaders).toContain("Authorization");
    expect(allowHeaders).toContain("Content-Type");
  });
});

describe("createCorsMiddleware preflight on protected path (R6, R7, R10)", () => {
  test("OPTIONS /private from allowed origin with no Authorization header returns 204 (not 401) with Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });
});

describe("createCorsMiddleware preflight from disallowed origins (R10, R13)", () => {
  test("OPTIONS /private from a non-allowed origin returns a non-401 status with no Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", {
      method: "OPTIONS",
      headers: {
        Origin: OTHER_ORIGIN,
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.status).not.toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("OPTIONS /private with no Origin header returns a non-401 status with no Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.status).not.toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("createCorsMiddleware real request on a public route (R11, R14)", () => {
  test("POST /public from allowed origin returns the handler body with Allow-Origin and Content-Disposition in Expose-Headers", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/public", {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    const exposeHeaders = res.headers.get("Access-Control-Expose-Headers") ?? "";
    expect(exposeHeaders).toContain("Content-Disposition");
  });
});

describe("createCorsMiddleware real request on a public route from a disallowed origin (R13)", () => {
  test("POST /public from a non-allowed origin returns the handler body with no Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/public", {
      method: "POST",
      headers: { Origin: OTHER_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("createCorsMiddleware real request on a protected route (R12, R16)", () => {
  test("GET /private from allowed origin with no Authorization header returns 401 {error:'Token required'} with Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token required" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });
});

describe("createCorsMiddleware real request on a protected route with bad tokens (R17)", () => {
  test("expired bearer token returns 401 {error:'Invalid or expired token'} with Allow-Origin", async () => {
    const app = buildFixtureApp();
    const expired = await issueToken(TEST_USER_ID, "free", "-10s");
    const res = await app.request("/private", {
      headers: { Origin: ALLOWED_ORIGIN, Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired token" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });

  test("non-Bearer Authorization header returns 401 {error:'Token required'} with Allow-Origin", async () => {
    const app = buildFixtureApp();
    const res = await app.request("/private", {
      headers: { Origin: ALLOWED_ORIGIN, Authorization: "Basic xyz" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token required" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });
});

describe("createCorsMiddleware real request on a protected route with a valid token (R18)", () => {
  test("GET /private with a valid bearer token returns the same status/body with an allowed Origin header as without one", async () => {
    const app = buildFixtureApp();
    const token = await issueToken(TEST_USER_ID, "free");

    const withoutOrigin = await app.request("/private", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(withoutOrigin.status).toBe(200);
    const withoutBody = await withoutOrigin.json();

    const withOrigin = await app.request("/private", {
      headers: { Origin: ALLOWED_ORIGIN, Authorization: `Bearer ${token}` },
    });
    expect(withOrigin.status).toBe(200);
    expect(await withOrigin.json()).toEqual(withoutBody);
  });
});

describe("createCorsMiddleware never emits Allow-Credentials (R15)", () => {
  test("no Access-Control-Allow-Credentials on preflight or real response", async () => {
    const app = buildFixtureApp();

    const preflight = await app.request("/public", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull();

    const real = await app.request("/public", {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(real.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});