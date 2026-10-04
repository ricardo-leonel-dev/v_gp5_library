# Design — block_soft_deleted_users_auth

Layers, error handling, soft delete and test conventions follow `docs/architecture.md` and
`docs/conventions.md`. Decisions D1–D12 are listed in `requirements.md`. This file covers only the
changes. No UI is added, so there is no Visual direction section.

## Options for revoking live tokens (acceptance item 2)

The problem: a JWT stays valid for up to `JWT_EXPIRES_IN` (default `7d`) after the user is
soft-deleted. Every option below needs *some* server-side state, because a stateless JWT cannot be
revoked on its own.

| Option | Per-request cost | Revocation delay | New schema / moving parts | Verdict |
| --- | --- | --- | --- | --- |
| **A. Per-request live-user role lookup in `requireAuth`** (`SELECT role FROM users WHERE id = $sub AND deleted_at IS NULL`, role stored in context for `requireAdmin`) | Exactly 1 PK index lookup = 1 DB round trip per protected request, `/admin/*` included (<1 ms local Docker, ~1–5 ms hosted Supabase pooler) | Immediate (next request) | None | **Chosen** |
| B. Token version: `users.token_version INT`, put in the JWT as a claim, compared on each request; bump on delete | Same 1 PK lookup (the version must still be read from the DB) | Immediate | Migration + new claim + every delete path must bump it | Rejected |
| C. Denylist table of revoked `jti`s / user ids, checked on each request | 1 indexed lookup on another table (same cost as A) | Immediate | New table, cleanup job for expired rows, every delete path must insert | Rejected |
| D. Short access-token TTL (e.g. 5–15 min) + refresh token | 0 on most requests; DB only on refresh | Up to the TTL | Refresh endpoint, refresh-token storage/rotation, frontend changes | Rejected |
| E. In-process cache in front of A (e.g. 30 s LRU) | ~0 on a hit | Up to the cache TTL | Shared mutable state between requests | Rejected (for now) |

**Why A.** B and C cost the same per request as A: they still read the DB on every request to stay
immediate. They also add schema and require every future "delete user" code path to remember a
second write. A gets the right answer from `deleted_at`, the column that already *is* the source of
truth. D removes the per-request cost, but it is a much larger feature (refresh flow, frontend token
rotation), and it still leaves a revocation window, so it does not meet acceptance item 2
("rejected ... on every protected route") without also doing A. E breaks `docs/architecture.md`
principle 4 (no shared mutable state between requests beyond I/O handles), and it reintroduces a
revocation window. Premature at this traffic level. Revisit only if profiling shows the lookup
matters.

**Precedent and reuse.** `requireAdmin` already does a lookup of exactly this shape (`getUserRole`:
`SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`, returning `null` without a query when
`userId` is not a UUID) on every `/admin/*` request, for the same reason: "takes effect on the next
request with the same token". A moves that same query up into `requireAuth`, so it runs on every
protected route, and stores the result in context (D12). `requireAdmin` then reads `c.get("role")`
instead of querying. Net effect: **every protected request does exactly one DB lookup**, `/admin/*`
included (today: 1 on `/admin/*`, 0 elsewhere). The role is still read from the DB on every request,
never from the JWT, so grant/revoke stays effective on the next request (feature 16 R8/R9, this
feature's R18).

**Discarded: two separate queries** (the earlier draft of this spec). `requireAuth` would run its own
`SELECT 1 ... deleted_at IS NULL` and `requireAdmin` would keep calling `getUserRole`, so `/admin/*`
would pay 2 PK lookups per request. Rejected by Ricardo: the second query reads the same row again for
no benefit, and the coupling it avoided (`requireAdmin` depending on `requireAuth` having run) already
exists — `requireAdmin` already reads `c.get("userId")`, which only `requireAuth` sets.

**Discarded: caching the role in the JWT.** Puts `role` in a claim and skips the DB in `requireAdmin`.
Rejected: revoking admin would not take effect until the token expires, which breaks feature 16's
design intent.

**Other reads.** `createSong` reads `users.plan` inside the service (`getUserPlan`), but that read
happens after routing, only on `POST /songs`. It cannot serve as the gate, and it is not merged here
(D9 keeps `plan` out of this lookup).

**Mount audit (`requireAdmin` without `requireAuth`).** `requireAdmin` is mounted in exactly two
places: `src/index.ts` (`protectedRouter.use("/admin/*", requireAdmin)`, where `protectedRouter` comes
from `createProtectedRouter()`, which applies `requireAuth` to `*` first) and
`src/middleware/require-admin.test.ts` (also on a `createProtectedRouter()` router). There is no mount
without `requireAuth` before it. As a guard against a future one, `requireAdmin` fails closed: an unset
`role` is not `"admin"`, so the caller gets 403 (R17). It does **not** fall back to querying the DB.

## Files to touch

| File | Change |
| --- | --- |
| `src/auth/user-service.ts` | `login` query adds `AND deleted_at IS NULL` (R1). `getMe` query adds `AND deleted_at IS NULL` (R14). `getUserRole` is reused unchanged as the lookup (it already filters `deleted_at` and short-circuits non-UUIDs). No new lookup function. `register` unchanged (R15). |
| `src/middleware/require-auth.ts` | `AuthVariables` gains `role: Role`. New `createRequireAuth(lookupRole)` factory; `requireAuth` becomes `createRequireAuth(getUserRole)`. Add the UUID check + role lookup after `verifyToken`, then `c.set("role", role)` (R3–R9). |
| `src/middleware/require-admin.ts` | Drop the `getUserRole` import and the DB call. Check `c.get("role") === "admin"`, else 403 (R16, R17). Update the header comment: the role is read from the DB on every request **by `requireAuth`**. |
| `src/middleware/protected-router.ts` | No change: it keeps importing `requireAuth` and `AuthVariables`. |
| `src/index.ts` | No change: `/auth/login` and `/auth/me` already map `AuthError` to `{error}` + status; `protectedRouter.use("/admin/*", requireAdmin)` stays after `requireAuth`. |
| `src/middleware/protected-router.test.ts` | Use a real user row; add R3–R9 middleware tests. |
| `src/auth/auth.test.ts` | Login, `/auth/me` and register tests for soft-deleted / missing users (R1, R2, R12–R15). |
| `src/index.test.ts` | Protected-route tests (R10, R11). Update `/me/plan` R26 (D4). |
| `src/middleware/require-admin.test.ts` | Update feature-16 R6 cases to 401 (D3); add stub-context unit tests (R16, R17); keep grant/revoke tests (R18). |
| `src/middleware/cors.test.ts`, `src/middleware/unknown-route-guard.test.ts` | Update the tests that use fake user ids (see below). |
| `docs/architecture.md` | Data Flow line for `requireAuth` ("verifies JWT, loads the live user's role (401 if none), attaches userId and role"). Admin section: "A soft-deleted or missing caller is not an admin (403)" → "is rejected by `requireAuth` (401)", and `requireAdmin` "reads the role `requireAuth` loaded from the DB this request". Not version-controlled (agent-helper only). |

No migration: `users.deleted_at` exists (0002), and `users.id` is the primary key, so the lookup is
already index-backed.

## Signatures

`src/auth/user-service.ts`:

```ts
// Unchanged (feature 16). Reused as requireAuth's single per-request lookup.
export async function getUserRole(userId: string): Promise<Role | null>;
//   non-UUID -> null with no query; otherwise
//   SELECT role FROM users WHERE id = ${userId} AND deleted_at IS NULL

export async function login(email, password) {
  // ...unchanged normalize + blank check...
  const [row] = await db`
    SELECT id, email, plan, role, password_hash FROM users
    WHERE lower(email) = ${normalized} AND deleted_at IS NULL          -- R1 (D5)
  `;
  if (!row) throw new AuthError("Invalid credentials", 401);            // same as unknown email
  // ...unchanged password verify / token issue...
}

export async function getMe(userId: string): Promise<PublicUser> {
  // SELECT id, email, plan, role FROM users WHERE id = ${userId} AND deleted_at IS NULL   -- R14
  // no row -> AuthError("User not found", 401)   (unchanged message/status)
}
```

`src/middleware/require-auth.ts`:

```ts
import { isUuid } from "../db/uuid";
import { getUserRole, type Role } from "../auth/user-service";

export interface AuthVariables {
  userId: string;
  plan: string;
  role: Role;            // new: loaded from the DB by requireAuth on every request (D12)
}

const INVALID = { error: "Invalid or expired token" } as const;

export function createRequireAuth(
  lookupRole: (userId: string) => Promise<Role | null> = getUserRole,
) {
  return async function requireAuth(
    c: Context<{ Variables: AuthVariables }>,
    next: Next,
  ): Promise<Response | void> {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) return c.json({ error: "Token required" }, 401);

    let payload: AuthTokenPayload;
    try {
      payload = await verifyToken(header.slice("Bearer ".length));
    } catch {
      return c.json(INVALID, 401);
    }

    if (!isUuid(payload.sub)) return c.json(INVALID, 401);   // R6: lookup never called
    const role = await lookupRole(payload.sub);               // R8: exactly one call
    if (role === null) return c.json(INVALID, 401);           // R4, R5
    // A throw from lookupRole is NOT caught here (R9, D10).

    c.set("userId", payload.sub);
    c.set("plan", payload.plan);   // unchanged (D9)
    c.set("role", role);           // R3, consumed by requireAdmin
    await next();
  };
}

export const requireAuth = createRequireAuth();
```

`src/middleware/require-admin.ts`:

```ts
// The role is read from the DB on every request by requireAuth (never from the JWT),
// so a grant or revoke takes effect on the caller's next request with the same token.
// If requireAuth did not run, role is unset and this fails closed (403).
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
): Promise<Response | void> {
  if (c.get("role") !== "admin") return c.json({ error: "admin role required" }, 403);  // R17
  await next();                                                                          // R16
}
```

Notes for the implementer:
- **Only `verifyToken` goes inside the `try`.** Today the `try` also wraps `await next()`. Moving
  `next()` out is deliberate: the lookup and the handler must never be turned into 401 by that catch
  (R9).
- `requireAuth` keeps its own `isUuid` check even though `getUserRole` also short-circuits non-UUIDs.
  This makes R6 ("lookup never called") testable with an injected lookup, and keeps a non-UUID `sub`
  from depending on the lookup implementation.
- The factory exists only so tests can inject a lookup that counts calls (R8), throws (R9), or must
  not be called (R6). Production code uses the default. `protected-router.ts` keeps importing
  `requireAuth`. For the injected tests, build a small Hono app with
  `new Hono<{ Variables: AuthVariables }>().use("*", createRequireAuth(fake)).get("/__test", ...)`; for
  R8 on `/admin/*`, also mount `requireAdmin` on `/admin/*` and assert the counter is 1.
- `requireAdmin` must not import `getUserRole` or `getDb` any more. Do not add a DB fallback for an
  unset role (D12, R17).
- Hono's default error handler turns an uncaught throw in middleware into HTTP 500. R9's test asserts
  `res.status === 500`. If the app ever gets an `onError`, the test still holds as long as it doesn't
  map to 401.
- `user-service.ts` does not import from `middleware/`, so importing `getUserRole`/`Role` into
  `require-auth.ts` creates no import cycle.

## Error paths

| Situation | Where | Response |
| --- | --- | --- |
| No / non-Bearer header | `requireAuth` | 401 `Token required` (unchanged) |
| Bad signature / expired / malformed payload | `requireAuth` | 401 `Invalid or expired token` (unchanged) |
| `sub` not a UUID | `requireAuth` | 401 `Invalid or expired token` (new, R6) |
| `sub` UUID, no row or soft-deleted | `requireAuth` | 401 `Invalid or expired token` (new, R4/R5) |
| DB error in lookup | propagates | 500 (R9) |
| Live caller, role `user`, on `/admin/*` | `requireAdmin` (context) | 403 `admin role required` (unchanged, R17) |
| `requireAdmin` mounted without `requireAuth` (role unset) | `requireAdmin` | 403 `admin role required` (fail closed, R17) |
| Login, soft-deleted email | `login` | 401 `Invalid credentials` (R1) |
| Register, soft-deleted email | `register` | 409 `Email is already registered` (unchanged, R15) |

## Existing tests that change

Each change keeps the original requirement covered. It only swaps a fake user id for a real live row,
or updates an expectation that D3/D4 supersede.

- `protected-router.test.ts`: `TEST_USER_ID` (fixed fake UUID) → insert a real user in the test
  (`INSERT INTO users (email, password_hash) VALUES (<random>, 'x') RETURNING id`) for the feature-1
  R1/R6 tests. The R2–R5 tests (no header, non-Bearer, expired, tampered) can keep the fake id: they
  fail before the lookup.
- `cors.test.ts` R18 and `unknown-route-guard.test.ts` R8 ("PUT /private with a valid token -> 404"):
  same swap to a real user. Those requests now go through the lookup. The unknown-*path* tests (R2/R5)
  are answered by the guard before `requireAuth`. They may keep the fake id, but switching them too is
  fine.
- `require-admin.test.ts` (feature 16 R6): "soft-deleted admin", "UUID with no users row" and "sub is
  not a UUID" change from `403 {error:"admin role required"}` to `401 {error:"Invalid or expired
  token"}`. Rename them to cite this feature's R11/R5/R6 and D3. These tests build their app with
  `createProtectedRouter()`, so `requireAuth` runs first and sets `role`; "admin → 200", "role 'user' →
  403" and the grant/revoke tests (feature 16 R8/R9, now also this feature's R18) need no change beyond
  citing R18. Add stub-context unit tests for `requireAdmin` alone (no `requireAuth`): a stub middleware
  sets `userId` and/or `role`, see "New tests".
- `index.test.ts` "valid token for a user with no users row -> 404 (R26)" → expect `401 {error:"Invalid
  or expired token"}` and cite this feature's R5 / D4.

## New tests (sketch)

- `auth.test.ts`: register → soft-delete via SQL → login with correct password → 401 exact body; same
  with wrong password; same with upper-cased email (R1). Live login still 200 with `sub` = id (R2).
  Register, then issue a token, then soft-delete, then `/auth/me` → 401 exact body (R12). Token for
  `crypto.randomUUID()` → `/auth/me` 401 (R13). `getMe` on a soft-deleted id throws `AuthError` 401
  (R14). Register with the upper-cased email of a soft-deleted row → 409 exact body (R15; feature 18 R4
  already covers it, so add or extend one explicit case).
- `protected-router.test.ts`: live user → 200 with `userId` (R3); soft-deleted → 401 (R4); random UUID
  → 401 (R5); handler-invoked flag stays `false` for R4/R5/R6 (R7); injected lookup: called once for a
  valid token (R8), not called for a non-UUID `sub` (R6), throws → 500 (R9).
- `index.test.ts`: `makeUserToken` → `GET /songs` 200 → soft-delete → same token `GET /songs` → 401
  exact body (R10). `makeAdminToken` → soft-delete → `GET /admin/users?email=x` → 401 exact body (R11).
- `protected-router.test.ts` (R3, R8): handler reads `c.get("role")` → equals the row's role (`user`
  and `admin` cases). Injected counting lookup on an app that also mounts `requireAdmin` on `/admin/*`
  → `/admin/__test` with an admin role → 200 and counter = 1.
- `require-admin.test.ts` (R16, R17), on `new Hono<{ Variables: AuthVariables }>()` with a stub
  middleware instead of `requireAuth`: stub sets `role: "admin"` and `userId: crypto.randomUUID()` (no
  DB row) → 200, which proves no DB lookup decides the outcome (R16). Stub sets `role: "user"` and the
  `userId` of a real **admin** row → 403 exact body, which proves the DB role is not consulted (R17).
  Stub sets only `userId` (no `role`) → 403 exact body (fail closed, R17).
- `require-admin.test.ts` (R18): keep the existing grant/revoke tests through `createProtectedRouter()`.
