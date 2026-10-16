# Requirements — block_soft_deleted_users_auth

A soft-deleted user (`users.deleted_at IS NOT NULL`) can still use the API today, in two ways:

1. `login` (`src/auth/user-service.ts`) looks the user up with `WHERE lower(email) = ...` and no
   `deleted_at` filter. A soft-deleted user with the right password gets a fresh token. Feature 18
   found this gap (its D14) and left it out of scope.
2. `requireAuth` (`src/middleware/require-auth.ts`) only checks the JWT signature and expiry. It never
   checks that `sub` still names a live `users` row. A token issued before the soft delete (or for a
   row that no longer exists) keeps working on every protected route until it expires
   (`JWT_EXPIRES_IN`, default `7d`).

Only `requireAdmin` (feature 16) re-reads the user on each request today (`getUserRole`). It answers
403, not 401, and only on `/admin/*`.

## Open questions / decisions for the human reviewer

Each item is a choice this spec makes. Approving the spec approves all of them. Say so if any should
change.

- **D1 — Revocation uses one per-request DB lookup in `requireAuth`, which also loads the role.**
  After the JWT verifies, `requireAuth` runs one primary-key query, `SELECT role FROM users WHERE id =
  $sub AND deleted_at IS NULL` (the existing `getUserRole` in `src/auth/user-service.ts`). No row means
  401. A row means the role is stored in the Hono context (`c.set("role", ...)`). Cost: **exactly one**
  indexed PK lookup (one DB round trip) per protected request, on every protected route, `/admin/*`
  included. That is well under 1 ms on the local Docker Postgres and about one network round trip
  (roughly 1–5 ms) on a hosted Supabase pooler. Today `/admin/*` already pays one lookup and other
  protected routes pay none; after this feature every protected route pays one. The alternatives
  (token version column, denylist, short TTL + refresh, cache) and why they were rejected are in
  `design.md`, under "Options for revoking live tokens".
- **D2 — Same 401 body as any other bad token.** A token for a soft-deleted user, a missing user or a
  non-UUID `sub` gets `401 {"error":"Invalid or expired token"}`, the same body as an expired or
  tampered token. The client cannot tell "your account was deleted" from "your token is bad". The
  frontend already handles this 401 by sending the user back to login.
- **D3 — `/admin/*` with a soft-deleted or missing caller is now 401, not 403.** (Confirmed by Ricardo.)
  `requireAuth` runs before `requireAdmin`, so it rejects these callers first. This **supersedes feature
  16 R6 for those cases only** (soft-deleted, missing UUID, non-UUID `sub`). A live caller with role
  `user` still gets 403 `admin role required`.
- **D4 — `GET /me/plan` for a token whose user has no row is now 401, not 404.** `requireAuth` rejects
  it first. This **supersedes feature 14 R26**. `getPlanSummary`'s own 404 branch is still there but
  can no longer be reached over HTTP.
- **D5 — Login treats a soft-deleted user exactly like an unknown email.** The query gets `AND
  deleted_at IS NULL`, so a soft-deleted row is never found. The response is `401 {"error":"Invalid
  credentials"}`, the same as for a wrong password or unknown email, whether or not the password is
  right.
- **D6 — Timing on login: unchanged.** Today an unknown email returns *before* the argon2 verify
  (fast), and a known email with a wrong password returns *after* it (slow). So response time already
  shows whether a **live** account exists. This codebase has no timing-safety measures anywhere. With
  D5, a soft-deleted email takes the fast "unknown" path, so it looks like a non-existent account.
  This feature adds no new leak and closes none. Closing the existing leak (for example, verifying
  against a dummy hash when no row matches) is **out of scope**, and no follow-up feature is planned
  (confirmed by Ricardo): `POST /auth/register` already reveals whether an email exists through its
  409, so a login-timing fix alone would not stop account enumeration.
- **D7 — Register is unchanged.** A soft-deleted account still owns its email (feature 18 D5). Register
  with that email (any casing) still gets `409 {"error":"Email is already registered"}`.
- **D8 — `getMe` also filters `deleted_at IS NULL`.** This is defense in depth: `/auth/me` is already
  covered by `requireAuth`, but `getMe` is the one service function whose whole job is "return the
  current user", so it should not return a deleted one if it is ever called without the middleware.
  Other services (`getUserPlan`, `createSong`'s plan read, …) are not changed. After `requireAuth` they
  can no longer be reached by a deleted caller.
- **D9 — The JWT `plan` claim is left alone.** `c.set("plan", payload.plan)` stays, even though nothing
  reads `c.get("plan")` (plan limits read `users.plan` from the DB). The lookup selects only `role`; it
  does not load or switch `plan` to the DB value. Cleaning that up is out of scope.
- **D10 — A DB error during the lookup is a 500, not a 401.** Per `docs/architecture.md` principle 3,
  an unexpected error propagates. It must not be turned into "Invalid or expired token". Otherwise a DB
  outage would look like every user being logged out.
- **D11 — `/auth/logout` with a deleted user's token is 401.** It is on the protected router, so it
  follows R4/R5. The client throws the token away either way.
- **D12 — `requireAdmin` no longer queries the DB; it reads the role from context.** (Decided by
  Ricardo; replaces the earlier draft's "keep both queries".) `requireAdmin` checks `c.get("role") ===
  "admin"` and answers 403 `admin role required` otherwise. The role is still read from the DB on every
  request (by `requireAuth`), never from the JWT, so feature 16's design intent holds: a grant or revoke
  takes effect on the caller's next request with the same token (feature 16 R8/R9). If `requireAdmin`
  is ever mounted without `requireAuth` before it, the role is absent and it fails closed with 403
  (R17). Today it is mounted in exactly two places, both after `requireAuth`: `src/index.ts`
  (`protectedRouter.use("/admin/*", requireAdmin)`) and `src/middleware/require-admin.test.ts` (on a
  `createProtectedRouter()` router). No other mount exists.

## Login

## R1
IF `POST /auth/login` is called with an email (any casing/padding) whose only matching `users` row is
soft-deleted, THEN the system SHALL respond with HTTP 401 and a JSON body exactly equal to
`{"error":"Invalid credentials"}`, whether the supplied password is correct or not.

## R2
WHEN `POST /auth/login` is called with the correct email and password of a live user, the system SHALL
respond with HTTP 200 and a body containing a `token` whose `sub` is that user's id.

## Protected routes (`requireAuth`)

## R3
WHEN a request carrying a valid, non-expired JWT whose `sub` is the id of a live `users` row reaches a
route on the protected router, the system SHALL invoke the route handler with `c.get("userId")` equal
to that `sub` and `c.get("role")` equal to that row's `role` column value.

## R4
IF a request to a route on the protected router carries a valid, non-expired JWT whose `sub` is the id
of a soft-deleted `users` row, THEN the system SHALL respond with HTTP 401 and a JSON body exactly
equal to `{"error":"Invalid or expired token"}`.

## R5
IF a request to a route on the protected router carries a valid, non-expired JWT whose `sub` is a UUID
with no `users` row, THEN the system SHALL respond with HTTP 401 and a JSON body exactly equal to
`{"error":"Invalid or expired token"}`.

## R6
IF a request to a route on the protected router carries a valid, non-expired JWT whose `sub` is not a
UUID, THEN the system SHALL respond with HTTP 401 and a JSON body exactly equal to
`{"error":"Invalid or expired token"}` without querying the database.

## R7
IF `requireAuth` rejects a request under R4, R5 or R6, THEN the system SHALL NOT invoke the route
handler.

## R8
WHEN a request with a valid, non-expired JWT whose `sub` is a UUID passes the signature/expiry check,
the system SHALL call the live-user role lookup exactly once for that request, including requests to
`/admin/*` routes.

## R9
IF the live-user role lookup in `requireAuth` throws, THEN the system SHALL let the error propagate, so the
response is HTTP 500, not HTTP 401.

## R10
WHEN `GET /songs` is called with a valid, non-expired JWT whose user was soft-deleted after the token
was issued, the system SHALL respond with HTTP 401 and a JSON body exactly equal to
`{"error":"Invalid or expired token"}`.

## R11
WHEN `/admin/*` is called with a valid, non-expired JWT whose user is a soft-deleted admin, the system
SHALL respond with HTTP 401 and a JSON body exactly equal to `{"error":"Invalid or expired token"}`.

## `/auth/me`

## R12
WHEN `GET /auth/me` is called with a valid, non-expired JWT whose user is soft-deleted, the system SHALL
respond with HTTP 401 and a JSON body exactly equal to `{"error":"Invalid or expired token"}`.

## R13
WHEN `GET /auth/me` is called with a valid, non-expired JWT whose `sub` is a UUID with no `users` row,
the system SHALL respond with HTTP 401 and a JSON body exactly equal to
`{"error":"Invalid or expired token"}`.

## R14
IF `getMe(userId)` is called with the id of a soft-deleted user, THEN the system SHALL throw an
`AuthError` with status 401.

## Register

## R15
IF `POST /auth/register` is called with an email whose case-insensitive match is a soft-deleted `users`
row, THEN the system SHALL respond with HTTP 409 and a JSON body exactly equal to
`{"error":"Email is already registered"}`.

## Admin routes (`requireAdmin`)

## R16
WHEN `requireAdmin` runs with `c.get("role")` equal to `"admin"`, the system SHALL invoke the next
handler without querying the database, even if `c.get("userId")` has no `users` row.

## R17
IF `requireAdmin` runs with `c.get("role")` not equal to `"admin"` (including when `role` was never
set), THEN the system SHALL respond with HTTP 403 and a JSON body exactly equal to
`{"error":"admin role required"}`.

## R18
WHEN a live user's `role` is changed in the database between two `/admin/*` requests carrying the same
JWT, the system SHALL apply the new role to the second request (`user` → `admin` reaches the handler;
`admin` → `user` gets HTTP 403).

## Test impact

These existing tests issue tokens for users that have no row, or depend on `requireAdmin` querying the
DB itself. They must change as described in
`design.md` → "Existing tests that change". None of them is deleted without a replacement.

- `src/middleware/protected-router.test.ts` (feature 1 R1, R6): uses the fixed fake id `1111…`.
- `src/middleware/cors.test.ts` (feature 11 R18): uses the fake id `2222…`.
- `src/middleware/unknown-route-guard.test.ts` (feature 12 R8, and R2/R5): uses the fake id `3333…`.
- `src/middleware/require-admin.test.ts` (feature 16 R6): soft-deleted admin, missing UUID and non-UUID
  `sub` now expect 401 (D3). The tests that go through `createProtectedRouter()` keep working, because
  `requireAuth` now puts `role` in context. New unit tests drive `requireAdmin` with a stub middleware
  that sets `role` directly (R16, R17).
- `src/index.test.ts` "valid token for a user with no users row -> 404 (R26)": now expects 401 (D4).
