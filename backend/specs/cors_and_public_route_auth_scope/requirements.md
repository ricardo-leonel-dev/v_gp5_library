# Requirements — cors_and_public_route_auth_scope

Scope note (root cause, confirmed against current code): `src/index.ts` has no CORS middleware at all.
`src/middleware/protected-router.ts` builds `new Hono().use("*", requireAuth)`, and `src/index.ts` mounts
it with `app.route("/", protectedRouter)`. Because that `use("*")` matches every method on every path
under `/`, a browser preflight (`OPTIONS`, which never carries `Authorization`) to *any* path — including
the public `/auth/register` and `/auth/login` — falls through to `requireAuth` and gets
`401 {"error":"Token required"}`. The frontend (`frontend/src/environments/environment.ts`,
`apiBaseUrl: 'http://localhost:3000'`) calls the backend directly from `http://localhost:4200`, so every
cross-origin call from the browser currently fails.

Scope note on "auth scope": this feature fixes the scope problem for **preflight** requests only, by
answering every `OPTIONS` request in a CORS middleware registered before any route or router mount, so
preflight never reaches `requireAuth`. It does **not** change which non-`OPTIONS` routes are protected,
does not modify `requireAuth` or `createProtectedRouter`, and does not change the pre-existing behavior
that an unknown path returns `401` instead of `404` (a side effect of mounting `protectedRouter` at `/`,
unrelated to CORS; out of scope here).

Scope note on terminology: "allowed origin" below means a value present in the active stage's resolved
allowed-origins list (R2-R5). "Protected route" means any route registered on `protectedRouter` (e.g.
`GET /songs`, `GET /auth/me`). "Public route" means a route registered directly on `app`
(`/health`, `POST /auth/register`, `POST /auth/login`).

## R1
The system SHALL declare, for each of the three stages (`dev`, `staging`, `main`) in
`src/config/stages.json`, a `cors` section whose `allowedOriginsEnv` field is `"CORS_ALLOWED_ORIGINS"`.

## R2
WHEN the environment variable named by the active stage's `cors.allowedOriginsEnv` is set to a non-empty
string, the system SHALL use as the allowed-origins list the comma-separated entries of that value, each
trimmed of surrounding whitespace, with empty entries discarded.

## R3
WHILE the active stage is `dev` and the `cors.allowedOriginsEnv` environment variable is unset or empty,
the system SHALL use `dev.cors.defaultOrigins` from `src/config/stages.json`, whose value is
`["http://localhost:4200"]`, as the allowed-origins list.

## R4
IF the active stage's `cors` section declares no `defaultOrigins` and the `cors.allowedOriginsEnv`
environment variable is unset or empty THEN the system SHALL throw a `StageConfigError` whose message
contains the stage name and the environment variable name.

## R5
IF the resolved allowed-origins list contains the entry `"*"` THEN the system SHALL throw a
`StageConfigError` whose message contains `"*"`.

## R6
WHEN an `OPTIONS` request with an `Origin` header equal to an allowed origin is received on any path,
public or protected, the system SHALL respond with HTTP status `204`.

## R7
WHEN an `OPTIONS` request with an `Origin` header equal to an allowed origin is received, the system
SHALL include an `Access-Control-Allow-Origin` response header whose value equals the request's `Origin`
header exactly.

## R8
WHEN an `OPTIONS` request with an `Origin` header equal to an allowed origin is received, the system
SHALL include an `Access-Control-Allow-Methods` response header listing `GET`, `POST`, `PUT`, `PATCH`,
and `DELETE`.

## R9
WHEN an `OPTIONS` request with an `Origin` header equal to an allowed origin is received, the system
SHALL include an `Access-Control-Allow-Headers` response header listing `Authorization` and
`Content-Type`.

## R10
IF an `OPTIONS` request without an `Authorization` header is received on a protected route's path THEN
the system SHALL respond with a status other than `401`, regardless of the request's `Origin` header.

## R11
WHEN a non-`OPTIONS` request with an `Origin` header equal to an allowed origin is received on a public
route (`POST /auth/register`, `POST /auth/login`), the system SHALL include an
`Access-Control-Allow-Origin` response header whose value equals the request's `Origin` header exactly.

## R12
WHEN a non-`OPTIONS` request with an `Origin` header equal to an allowed origin is received on a
protected route and is rejected by `requireAuth` with `401`, the system SHALL include an
`Access-Control-Allow-Origin` response header whose value equals the request's `Origin` header exactly.

## R13
IF a request's `Origin` header is not an allowed origin THEN the system SHALL omit the
`Access-Control-Allow-Origin` header from the response.

## R14
WHEN a non-`OPTIONS` request with an `Origin` header equal to an allowed origin is received, the system
SHALL include an `Access-Control-Expose-Headers` response header listing `Content-Disposition`.

## R15
The system SHALL omit the `Access-Control-Allow-Credentials` header from every response.

## R16
WHEN a non-`OPTIONS` request to a protected route carries an allowed `Origin` header but no
`Authorization` header, the system SHALL respond with `401` and body `{"error":"Token required"}`.

## R17
WHEN a non-`OPTIONS` request to a protected route carries an allowed `Origin` header and an
`Authorization: Bearer <token>` header whose token fails verification, the system SHALL respond with
`401` and body `{"error":"Invalid or expired token"}`.

## R18
WHEN a non-`OPTIONS` request to a protected route carries an allowed `Origin` header and a valid Bearer
token, the system SHALL respond with the same status the route returns for that request without an
`Origin` header.
