import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

export function createCorsMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const origins = [...allowedOrigins];
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: ["Content-Disposition"],
  });
}