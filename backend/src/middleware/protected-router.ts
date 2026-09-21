import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "./require-auth";

export function createProtectedRouter(): Hono<{ Variables: AuthVariables }> {
  return new Hono<{ Variables: AuthVariables }>().use("*", requireAuth);
}

export const protectedRouter = createProtectedRouter();
