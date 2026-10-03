import type { Context, Next } from "hono";
import { getUserRole } from "../auth/user-service";
import type { AuthVariables } from "./require-auth";

// Reads the role from the DB on every request (never from the JWT) so a grant
// or revoke takes effect on the caller's next request with the same token.
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
): Promise<Response | void> {
  if ((await getUserRole(c.get("userId"))) !== "admin") {
    return c.json({ error: "admin role required" }, 403);
  }
  await next();
}
