# Design — require_auth_middleware_on_all_routes

## Files to touch

### New: `src/middleware/protected-router.ts`
```ts
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "./require-auth";

export function createProtectedRouter(): Hono<{ Variables: AuthVariables }> {
  return new Hono<{ Variables: AuthVariables }>().use("*", requireAuth);
}

export const protectedRouter = createProtectedRouter();
```
- `createProtectedRouter()` is a factory, not just the shared singleton, so
  `protected-router.test.ts` can build an isolated instance, register a throwaway route on it, and
  assert the middleware applies — without touching the real app's route table or needing any
  song/pedal route to exist yet (R1).
- `protectedRouter` is the shared instance every real authenticated route (present and future)
  registers on.

### `src/index.ts`
- Import `protectedRouter` from `./middleware/protected-router`.
- Mount it once: `app.route("/", protectedRouter)`.
- Move the `/auth/logout` and `/auth/me` registrations from `app.post(...)`/`app.get(...)` (which
  currently pass `requireAuth` inline) onto `protectedRouter.post(...)`/`protectedRouter.get(...)`
  — drop the inline `requireAuth` argument, since the router's own `.use("*", requireAuth)` already
  covers it (R8).
- `/health`, `/auth/register`, `/auth/login` stay registered on `app` directly, unchanged (R9).
- Every future feature (`song_crud_api`, `pedal_catalog_api`, `song_pedal_configs_api`,
  `song_file_export_import`) registers its routes on the same imported `protectedRouter`, not on
  `app`. This is the enforcement point for those specs' own auth requirements — this feature's
  `design.md` is the reference those specs should point back to.

### `src/auth/jwt.ts`
- Change `issueToken(userId: string, plan: string): Promise<string>` to
  `issueToken(userId: string, plan: string, expiresIn?: string): Promise<string>`, using
  `expiresIn ?? process.env.JWT_EXPIRES_IN ?? "7d"` when calling `.setExpirationTime(...)` (R7).
  `jose`'s `setExpirationTime` already accepts relative strings like `"-10s"` / `"10 seconds ago"`
  to produce an already-expired token deterministically — this is what lets R4's test avoid
  real-clock sleeps.
  **Safeguard:** `expiresIn` is for internal/test use only (e.g. producing a deterministically
  expired token in `protected-router.test.ts`/`auth.test.ts`). No route handler may ever derive its
  value from request input (body, query string, or headers) — doing so would let a client mint an
  arbitrarily long-lived token, violating `docs/architecture.md` principle 5's rule that
  security-relevant values are never trusted from the client. Every future spec that touches token
  issuance must treat this as a hard constraint, not a convention to remember.
- No change to `verifyToken` — an expired token already throws inside `jwtVerify`, which
  `requireAuth`'s existing `catch` maps to 401.

### New: `src/middleware/protected-router.test.ts`
Builds a fresh `createProtectedRouter()` instance, registers one throwaway
`GET /__test -> c.json({ userId: c.get("userId") })` route on it, and exercises it directly via
`.request(...)` (same `app.request()` pattern already used in `index.test.ts`/`auth.test.ts`):
- no `Authorization` header → 401 (R2)
- `Authorization: Basic xyz` (no `Bearer ` prefix) → 401 (R3)
- `Authorization: Bearer <token issued with expiresIn: "-10s">` → 401 (R4)
- `Authorization: Bearer <valid token with the last character of the signature flipped>` → 401 (R5)
- `Authorization: Bearer <valid token>` → 200, and the JSON body's `userId` equals the token's
  subject (R1, R6)

### `src/auth/auth.test.ts`
Two additions to the existing `describe("auth round-trip", ...)` block:
- expired-token and tampered-token requests to the real `/auth/me` → 401 (R4, R5) — this is the
  regression proof that the migration in `src/index.ts` didn't just move the route but kept it
  behind `requireAuth`.
- a valid token for user A hitting `GET /auth/me?userId=<some-other-uuid>` → 200 with `email`
  matching user A, not the spoofed id (R10).

## Error handling
No new error paths. `requireAuth` already returns `c.json({ error: "..." }, 401)` for every failure
mode (missing header, bad prefix, verification failure) per `docs/architecture.md` principle 3 —
this feature only changes *which routes* run through it and *how deterministically* tests can reach
each failure mode, not the error shape itself.

## Discarded alternative
**Global `app.use("*", requireAuth)` with a path-exemption allowlist** (`/health`, `/auth/register`,
`/auth/login`) instead of a separate protected router. Rejected: the exemption list is exactly the
same kind of manually-maintained list this feature exists to eliminate — someone can just as easily
forget to *add* a new public route to the allowlist as they can forget to add `requireAuth` to a
new protected one, so it doesn't remove the human-memory failure mode, it just moves it to the
opposite side. A dedicated router where *mounting onto it* is the only way to become reachable at
all is structurally self-enforcing (R1) and matches `docs/architecture.md` principle 5's preference
for enforcing multi-tenancy/auth mechanically in the service/routing layer rather than trusting a
convention to be followed.
