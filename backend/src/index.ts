import { Hono } from "hono";
import { getDb } from "./db/client";
import { type AuthVariables } from "./middleware/require-auth";
import { protectedRouter } from "./middleware/protected-router";
import { register, login, getMe, AuthError } from "./auth/user-service";

const app = new Hono<{ Variables: AuthVariables }>();

app.get("/health", async (c) => {
  try {
    await getDb()`SELECT 1`;
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 500);
  }
});

app.post("/auth/register", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return c.json({ error: "email and password are required" }, 400);

  try {
    const result = await register(email, password);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return c.json({ error: "email and password are required" }, 400);

  try {
    const result = await login(email, password);
    return c.json(result);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.post("/auth/logout", (c) => {
  // Stateless JWT: nothing to invalidate server-side, the client just
  // discards the token.
  return c.json({ message: "Logged out" });
});

protectedRouter.get("/auth/me", async (c) => {
  try {
    const user = await getMe(c.get("userId"));
    return c.json(user);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

app.route("/", protectedRouter);

export default app;
