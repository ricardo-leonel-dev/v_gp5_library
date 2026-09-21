import type { Context, Next } from "hono";
import { verifyToken } from "../auth/jwt";

export interface AuthVariables {
  userId: string;
  plan: string;
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Token required" }, 401);
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = await verifyToken(token);
    c.set("userId", payload.sub);
    c.set("plan", payload.plan);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
