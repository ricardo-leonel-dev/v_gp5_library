import type { Context, Next } from "hono";
import { verifyToken } from "../auth/jwt";
import { isUuid } from "../db/uuid";
import { getUserRole, type Role } from "../auth/user-service";

export interface AuthVariables {
  userId: string;
  plan: string;
  role: Role;
}

const INVALID = { error: "Invalid or expired token" } as const;

// Reads the role from the DB on every request (never from the JWT) so a grant
// or revoke — or a soft-delete — takes effect on the caller's next request
// with the same token. The lookup runs exactly once per protected request,
// including /admin/* (which previously paid the same lookup in requireAdmin).
// A DB error from the lookup propagates as 500 (docs/architecture.md
// principle 3); only `verifyToken` failures are turned into 401.
export function createRequireAuth(
  lookupRole: (userId: string) => Promise<Role | null> = getUserRole,
) {
  return async function requireAuth(
    c: Context<{ Variables: AuthVariables }>,
    next: Next,
  ): Promise<Response | void> {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Token required" }, 401);
    }

    let payload: Awaited<ReturnType<typeof verifyToken>>;
    try {
      payload = await verifyToken(header.slice("Bearer ".length));
    } catch {
      return c.json(INVALID, 401);
    }

    if (!isUuid(payload.sub)) return c.json(INVALID, 401);
    const role = await lookupRole(payload.sub);
    if (role === null) return c.json(INVALID, 401);

    c.set("userId", payload.sub);
    c.set("plan", payload.plan);
    c.set("role", role);
    await next();
  };
}

export const requireAuth = createRequireAuth();