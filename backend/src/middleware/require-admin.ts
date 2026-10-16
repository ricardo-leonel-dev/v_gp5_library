import type { Context, Next } from "hono";
import type { AuthVariables } from "./require-auth";

// The role is read from the DB on every request by requireAuth (never from
// the JWT), so a grant or revoke — or a soft-delete — takes effect on the
// caller's next request with the same token. If requireAuth did not run,
// `role` is unset and this fails closed (403).
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
): Promise<Response | void> {
  if (c.get("role") !== "admin") {
    return c.json({ error: "admin role required" }, 403);
  }
  await next();
}