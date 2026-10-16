import type { MiddlewareHandler } from "hono";
import type { RouterRoute } from "hono/types";
import { METHOD_NAME_ALL } from "hono/router";
import { SmartRouter } from "hono/router/smart-router";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { TrieRouter } from "hono/router/trie-router";

/**
 * Builds a method-independent "is this path registered under any method?" predicate
 * from the router's own registration list. Uses the same SmartRouter+RegExpRouter+TrieRouter
 * composition the app uses, so pattern semantics (`:param`, trailing slash, wildcards)
 * match the app's own routing exactly.
 *
 * Limitation: `app.all("/x", h)` cannot be distinguished from `app.use("/x/*", ...)`
 * (both stored with method `ALL`), so any method-`ALL` entry is excluded — the index
 * only reflects real per-method routes. If a real `app.all("/x", h)` is ever added,
 * `/x` would be treated as unknown and answered 404 before `h` runs. No such route
 * exists today.
 */
export function buildPathIndex(routes: readonly RouterRoute[]): (path: string) => boolean {
  const router = new SmartRouter<true>({ routers: [new RegExpRouter(), new TrieRouter()] });
  for (const route of routes) {
    if (route.method === METHOD_NAME_ALL) continue;
    router.add(METHOD_NAME_ALL, route.path, true);
  }
  return (path: string) => router.match("GET", path)[0].length > 0;
}

/**
 * Returns middleware that responds via `c.notFound()` when `c.req.path` is not
 * registered under any method, and calls `next()` otherwise. `getRoutes` is read
 * once, on the first request, and memoized — building the index before any route
 * exists (e.g. at module init) would index an empty list.
 */
export function createUnknownRouteGuard(
  getRoutes: () => readonly RouterRoute[],
): MiddlewareHandler {
  let exists: ((path: string) => boolean) | undefined;
  return async (c, next) => {
    exists ??= buildPathIndex(getRoutes());
    if (!exists(c.req.path)) {
      return c.notFound();
    }
    await next();
  };
}
