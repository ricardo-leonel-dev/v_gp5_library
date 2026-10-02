# Design — unknown_routes_return_404

Conventions (layers, `{error: message}` JSON errors, no new dependencies, `bun:test`) follow
`docs/architecture.md` and `docs/conventions.md`; this document only covers choices made within them.

## How Hono resolves the current request (hono 4.13.8, verified in `node_modules/hono/dist`)

- `use(path, mw)` registers `mw` as a route with method `ALL` (`METHOD_NAME_ALL`, exported from
  `hono/router`) on `mergePath(path, "*")` — so every `use()` entry's path ends in `*` (e.g. `/*`).
- Every registration (`get/post/.../use`) is appended to the app's public `routes` array as a
  `RouterRoute` (`{ method, path, basePath, handler }`, type exported from `hono/types`).
  `app.route("/", sub)` copies each of `sub.routes` into the parent's `routes` (paths merged with the
  mount prefix), so the root `app.routes` lists **every** route in the app, including protected ones.
- The router returns every route that matches `(method, path)`: `ALL` entries plus the method-specific
  handler(s), composed in registration order; if none returns a response, the app's `notFound` handler
  runs. `c.notFound()` (public `Context` API) invokes that same handler from inside middleware.
- `matchedRoutes(c)` (`hono/route`) only reflects routes for the **current request method**, so it
  cannot answer "does this path exist under some other method" — that is why the previous design's
  `hasMatchedHandler` is dropped (see Discarded alternatives 6).
- A `HEAD` request is dispatched as `GET` internally.
- `createCorsMiddleware` (hono `cors`) is registered first on `app` and returns `204` for every `OPTIONS`
  request before any later middleware runs.
- The default router is `SmartRouter` over `[RegExpRouter, TrieRouter]`. It freezes its route table on
  the first `match()`; a later `add()` throws `Can not add a route since the matcher is already built`.
  So in this app, the complete route set is fixed by the time the first request is dispatched.
- `c.req.path` is the (percent-decoded) pathname — the same value Hono routes on with the default
  `strict: true` (trailing `/` significant). Verified: `/so%6Egs` routes to `/songs` and `c.req.path`
  is `/songs`; `/songs%2Fabc` matches neither.

## Chosen approach

Add an **app-level unknown-route guard**, registered on `app` right after CORS, that answers `404` for
any request whose path exists under **no** method, before the protected router's `requireAuth` can run.
Everything else falls through unchanged: a known path reaches `requireAuth` exactly as today (so a
method mismatch without a token is `401`), and a method mismatch with a valid token passes auth, finds
no handler, and lands in the new JSON `notFound` handler (`404`, not `405`).

The path index is derived from `app.routes` — the router's own registration list — not from a
hand-maintained list, so feature 1's guarantee holds: any new `protectedRouter.<method>(...)` route is
copied into `app.routes` by `app.route(...)`, becomes a known path, and gets auth automatically (R14).

`requireAuth` (`src/middleware/require-auth.ts`) and `createProtectedRouter()`
(`src/middleware/protected-router.ts`) are **unchanged**.

### 1. `src/middleware/not-found.ts` (new)

```ts
import type { NotFoundHandler } from "hono";
export const jsonNotFound: NotFoundHandler = (c) => c.json({ error: "Not found" }, 404);
```

Kept in `src/middleware/` so fixture tests can register it without importing `src/index.ts` (which
touches DB/config at import).

### 2. `src/middleware/unknown-route-guard.ts` (new)

```ts
import type { MiddlewareHandler } from "hono";
import type { RouterRoute } from "hono/types";
import { METHOD_NAME_ALL } from "hono/router";
import { SmartRouter } from "hono/router/smart-router";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { TrieRouter } from "hono/router/trie-router";

/** Builds a method-independent "is this path registered under any method?" predicate. */
export function buildPathIndex(routes: readonly RouterRoute[]): (path: string) => boolean;

/**
 * Returns middleware that responds via c.notFound() when c.req.path is not a known path,
 * and calls next() otherwise. `getRoutes` is read once, on the first request, and memoized.
 */
export function createUnknownRouteGuard(getRoutes: () => readonly RouterRoute[]): MiddlewareHandler;
```

`buildPathIndex`:
1. Create `new SmartRouter<true>({ routers: [new RegExpRouter(), new TrieRouter()] })` — the same router
   composition Hono uses by default, so pattern semantics (`:param`, regex params, optional params,
   wildcards, trailing slash) match the app's own routing.
2. For every route with `method !== METHOD_NAME_ALL`, `add(METHOD_NAME_ALL, route.path, true)` —
   re-registering each real route's path under `ALL` is what makes the lookup method-independent.
3. Return `(path) => router.match("GET", path)[0].length > 0` (the method argument is irrelevant
   because every entry is `ALL`).

`createUnknownRouteGuard`: on the first invocation, build the index from `getRoutes()` and cache it in the
closure; then `if (!exists(c.req.path)) return c.notFound(); return next();`.

**Why lazy (first request) instead of at module init:** the guard must be *registered* before the
protected router's `use("*", requireAuth)` so it runs first, i.e. before any route exists. Building on
the first dispatch is the same moment Hono's own `SmartRouter` freezes the route table (see above), so
the index is computed exactly once and cannot drift from what the app actually routes.

### 3. `src/index.ts`

```ts
app.use("*", createCorsMiddleware(resolveAllowedOrigins()));
app.use("*", createUnknownRouteGuard(() => app.routes));   // new, immediately after CORS
app.notFound(jsonNotFound);                                  // new
```

No route changes.

### 4. `docs/architecture.md`

Update the Data Flow diagram: after `cors`, add `unknown-route guard (404 JSON if the path exists under
no method)`, and note that a known path with no handler for the method reaches the JSON `notFound`
handler after `requireAuth`. (Docs are outside `src/`/`tests/`; the implementer owns this so the doc
does not drift.)

### Edge cases of the path index

| Case | Treatment | Req |
|---|---|---|
| `use()` middleware entries (`/*`, `/x/*`), method `ALL` | Excluded — never make a path known | R19 |
| `:param` pattern (`/songs/:id`) | Matches `/songs/abc`; not `/songs/abc/zzz` (one segment only) | R11, R1 |
| Trailing slash (`/songs/`) | Not known unless registered as such (strict routing, same as app) | R18 |
| Method-specific wildcard route (`app.get("/static/*", h)`) | Counts as known (it is a real handler); none exist today | — |
| `app.all(...)` / `app.on("ALL", ...)` handler | Excluded (indistinguishable from middleware by method); none exist today — see Q-A | — |
| `HEAD` | Path lookup is method-independent; auth then runs; Hono serves `HEAD` via `GET` | R12 |
| Known *public* path, wrong method (`PUT /health`) | Known path → reaches `requireAuth` → `401` without token (same as today) | R6 |
| Percent-encoding / query string | `c.req.path` is decoded and query-free, same input Hono routes on | — |
| Guard not installed (e.g. feature 1/11 fixture apps) | Today's behaviour: `401` on every path — fails closed | — |
| Route added after first request | Impossible: Hono's `SmartRouter` throws on `add()` after first match | — |

## Error paths

| Request | Before | After |
|---|---|---|
| `GET /nope`, no token | 401 `Token required` | 404 `{"error":"Not found"}` (R1, R5) |
| `GET /nope`, valid token | 404 `text/plain` "404 Not Found" | 404 `{"error":"Not found"}` (R2, R5) |
| `GET /nope`, bad/expired token | 401 | 404 (R3, R4) |
| `PUT /songs`, no token | 401 | 401 `Token required` unchanged (R6) |
| `PUT /songs`, expired token | 401 | 401 `Invalid or expired token` unchanged (R7) |
| `PUT /songs`, valid token | 404 `text/plain` | 404 `{"error":"Not found"}` (R8, R5) |
| `GET /songs`, no token | 401 | 401 unchanged (R9) |
| `GET /songs/<id>`, no token | 401 | 401 unchanged (R11) |
| `HEAD /songs`, no token | 401 | 401 unchanged (R12) |
| `GET /songs/`, no token | 401 | 404 (R18) |
| `OPTIONS /nope`, allowed origin | 204 | 204 unchanged (R16) |
| `GET /nope`, allowed origin | 401 + ACAO | 404 + ACAO (R15) |

CORS headers on the 404: hono's `cors` sets headers on `c.res` before `next()`, and Hono's `c.res`
setter carries them over when a later middleware or `notFound` replaces the response — the mechanism
that already makes feature 11's R12 (ACAO on a 401) pass. Verified in a prototype: the guard's 404 keeps
`Access-Control-Allow-Origin`. R15 pins it.

No new exception types: a 404 for an unknown route is not a domain error, so it is a `notFound` handler,
not a `*Error` class.

## Decisions (human review, 2026-09-30)

- **D1 (was Q1) — wrong method on a known path.** Changed from the draft's "404 without auth": a
  method-mismatch request runs auth — `401` without a token or with a bad token (R6, R7) — and returns the
  JSON `404 {"error":"Not found"}` with a valid token, **not** `405` (R8). Only paths that exist under no
  method get `404` without auth (R1–R4). This requires a method-independent path check, hence the
  app-level guard above instead of `matchedRoutes(c)`.
- **D2 (was Q2) — route-existence disclosure accepted.** Anonymous callers can distinguish "path exists"
  (`401`) from "path does not exist" (`404`). The route list is not secret (the frontend is public).
- **D3 (was Q3) — `OPTIONS` preflight to an unknown path stays `204`** for an allowed origin (R16),
  preserving feature 11's CORS wiring.
- **D4 (was Q4) — fixed body `{"error":"Not found"}`**; no method/path echoed (R5).
- **D5 (was Q5) — rely only on documented Hono public API, pinned by tests.** The mechanism uses
  `app.routes`, `RouterRoute` (`hono/types`), `METHOD_NAME_ALL` (`hono/router`), the router classes
  exported as `hono/router/{smart-router,reg-exp-router,trie-router}`, `c.notFound()` and `app.notFound`.
  `hono/route`'s `matchedRoutes` is no longer applicable (per-method only) and is not used. Behaviour is
  pinned by tests (R1–R19), so a Hono upgrade that changes any of it fails loudly. **Optional**: pin
  `hono` to the exact version `4.13.8` in `package.json` (task T19, marked OPTIONAL — the human may drop
  it at approval).

## Open questions (new)

- **Q-A — `app.all(...)` handlers.** The index excludes every method-`ALL` entry because Hono stores
  `use()` middleware and `all()` handlers identically. If a real `app.all("/x", h)` route is ever added,
  `/x` would be treated as unknown and answered `404` before `h` runs. No such route exists today.
  Proposal: accept, and document the limitation in the guard's doc comment (the implementer adds a test
  showing an `ALL`-only path is 404, which is R19). Alternative: also count `ALL` entries whose path
  does not end in `*` (catches `all("/x")` but still not `all("/x/*")`) — more heuristic, not
  recommended.

## Discarded alternatives

1. **Scope `requireAuth` by path prefix** (`use("/songs/*", requireAuth)`, ...). Rejected: re-introduces a
   hand-maintained list of protected paths — exactly what feature 1 removed; a new route under a new
   prefix would ship unprotected. Breaks feature 1's R1 ("without per-route argument").
2. **Pass `requireAuth` per route** or drop the `use("*")`. Rejected for the same reason as (1).
3. **Only add a JSON `app.notFound`.** Rejected: `requireAuth` returns `401` before `notFound` is reached,
   so it fixes only the valid-token case.
4. **Mount `protectedRouter` under a prefix (e.g. `/api`)**. Rejected: changes every public URL and the
   frontend's API client; far outside scope.
5. **Maintain an explicit registry of known paths.** Rejected: duplicates `app.routes` and can drift.
6. **Previous draft: gate `requireAuth` on `matchedRoutes(c)` having a non-`ALL` entry.** Rejected after
   D1: `matchedRoutes(c)` is per-method, so `PUT /songs` looks identical to `GET /nope` and would get
   `404` without auth, contradicting R6.
7. **Put the path check inside `createProtectedRouter()`'s middleware**, indexing only the sub-router's
   own `routes`. Rejected: the sub-router cannot see the root app's routes (public routes like `/health`
   would be "unknown" for `PUT /health`, changing it from `401` to `404`), and it would need a second
   call site to learn the final route set. Keeping `createProtectedRouter()` unchanged also leaves
   feature 1's tests and fixtures untouched.
8. **Probe the app's own router for each method (`GET`, `POST`, ...) per request.** Rejected: not public
   API (`app.router` matches include `ALL` middleware, so filtering needs internal handler tuples), costs
   N lookups per request, and the method list would be hand-maintained.
9. **Build the index from `PatternRouter`.** Rejected: its patterns end in `/?$`, so `/songs/` would be
   known while the app (strict routing) does not route it — the guard must use the same router composition
   as the app.
