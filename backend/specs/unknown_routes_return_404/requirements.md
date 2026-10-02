# Requirements — unknown_routes_return_404

Scope note (root cause, confirmed against current code on hono 4.13.8):
`src/middleware/protected-router.ts` builds `new Hono().use("*", requireAuth)` and `src/index.ts` mounts
it with `app.route("/", protectedRouter)`. Hono registers `use("*", ...)` as a method-`ALL` route on
`/*`, so `requireAuth` is on the match list of **every** request path, including paths no handler is
registered for. Two observable defects follow:

1. Without a valid token, an unknown route responds `401 {"error":"Token required"}` (or
   `"Invalid or expired token"`) instead of `404`.
2. With a valid token, an unknown route falls through to Hono's default not-found handler, which
   responds `404` with a `text/plain` body `404 Not Found` — not JSON, contrary to the
   `{error: message}` convention in `docs/architecture.md` §3.

Terminology used below:
- **Registered route**: a route registered with an explicit HTTP method (`app.get/post/...` or
  `protectedRouter.get/post/delete/...`), identified by that method and its path pattern (including
  `:param` segments). Middleware registered with `use()` (stored by Hono with method `ALL`) is **not** a
  registered route.
- **Known path**: a request path that matches the path pattern of at least one registered route, under
  **any** method. Matching uses Hono's default (strict) routing semantics: a trailing `/` is significant
  and a `:param` segment matches exactly one non-empty path segment.
- **Unknown-path request**: a non-`OPTIONS` request whose path is not a known path.
- **Method-mismatch request**: a non-`OPTIONS` request whose path is a known path but for which no
  registered route exists for the request's method (e.g. `PUT /songs`, where only `GET`/`POST /songs`
  are registered). Per Hono's built-in dispatch, a `HEAD` request is served by the `GET` route
  registered for the same path, so `HEAD` on a `GET` path is not a method-mismatch request.
- **Protected route**: a registered route registered on `protectedRouter`.
- **Allowed origin**: as defined in `specs/cors_and_public_route_auth_scope/requirements.md`.

Out of scope: changing which routes are protected, changing `requireAuth`'s token checks or messages,
changing CORS preflight behavior, introducing `405 Method Not Allowed` or an `Allow` header.

## Unknown paths

## R1
WHEN an unknown-path request is received without an `Authorization` header, the system SHALL respond
with HTTP status `404`.

## R2
WHEN an unknown-path request is received with an `Authorization: Bearer <token>` header whose token is
valid, the system SHALL respond with HTTP status `404`.

## R3
WHEN an unknown-path request is received with an `Authorization` header that does not start with
`Bearer `, the system SHALL respond with HTTP status `404`.

## R4
WHEN an unknown-path request is received with an `Authorization: Bearer <token>` header whose token is
expired or fails signature verification, the system SHALL respond with HTTP status `404`.

## R5
WHEN the system responds `404` to an unknown-path request or to a method-mismatch request, the system
SHALL return the JSON body `{"error":"Not found"}` with a `Content-Type` header starting with
`application/json`.

## Method mismatch on a known path

## R6
WHEN a method-mismatch request is received without an `Authorization` header, the system SHALL respond
with HTTP status `401` and body `{"error":"Token required"}`.

## R7
WHEN a method-mismatch request is received with an `Authorization: Bearer <token>` header whose token is
expired or fails signature verification, the system SHALL respond with HTTP status `401` and body
`{"error":"Invalid or expired token"}`.

## R8
WHEN a method-mismatch request is received with an `Authorization: Bearer <token>` header whose token is
valid, the system SHALL respond with HTTP status `404` (not `405`).

## Protected routes (regression)

## R9
WHEN a request to a protected route is received without an `Authorization` header, the system SHALL
respond with HTTP status `401` and body `{"error":"Token required"}`.

## R10
WHEN a request to a protected route is received with an `Authorization: Bearer <token>` header whose
token is expired or fails signature verification, the system SHALL respond with HTTP status `401` and
body `{"error":"Invalid or expired token"}`.

## R11
WHEN a request to a protected route whose path pattern contains a `:param` segment (e.g.
`GET /songs/<any-id>`) is received without an `Authorization` header, the system SHALL respond with
HTTP status `401`.

## R12
WHEN a `HEAD` request is received without an `Authorization` header on a path for which a `GET`
protected route is registered, the system SHALL respond with HTTP status `401`.

## R13
WHEN a request to a protected route is received with a valid, non-expired Bearer token, the system SHALL
invoke the route handler with `c.get("userId")` set to the token's subject claim.

## R14
WHEN a request without an `Authorization` header targets a route registered on the protected router
after the unknown-route guard was installed on the app, with no per-route auth argument and no edit to
any path list, the system SHALL respond with HTTP status `401`.

## CORS

## R15
WHEN an unknown-path request is received with an `Origin` header equal to an allowed origin, the system
SHALL include an `Access-Control-Allow-Origin` response header whose value equals the request's
`Origin` header exactly.

## R16
WHEN an `OPTIONS` request with an `Origin` header equal to an allowed origin is received on an unknown
path, the system SHALL respond with HTTP status `204`.

## Public routes (regression)

## R17
WHEN a request to a public route (`GET /health`, `POST /auth/register`, `POST /auth/login`) is received
without an `Authorization` header, the system SHALL respond with a status other than `401` and other
than `404`.

## Path-existence edge cases

## R18
WHEN a request without an `Authorization` header targets a path equal to a registered route's literal
path plus a trailing `/` (e.g. `GET /songs/`), and that trailing-slash path is not itself a known path,
the system SHALL respond with HTTP status `404`.

## R19
WHEN a request without an `Authorization` header targets a path that matches only the pattern of
middleware registered with `use()` (including the protected router's `use("*")`) and no registered
route, the system SHALL respond with HTTP status `404`.
