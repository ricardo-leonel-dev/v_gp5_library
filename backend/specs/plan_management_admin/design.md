# Design — plan_management_admin

Follows `docs/architecture.md` (routes in `src/index.ts`, logic + SQL in services, plain `.sql`
migrations, typed domain errors mapped to `{error}`) and `docs/conventions.md` (English strings,
kebab-case files, colocated `bun:test` tests, soft-delete filter). No new dependency. Decision ids
(`D<n>`) refer to the top of `requirements.md`.

## Files to touch

| File | Change |
|---|---|
| `src/db/migrations/0006_user_roles_and_plan_changes.sql` | **New.** `users.role` + CHECK, `plan_changes` table (R1–R4). |
| `src/db/uuid.ts` | **New.** `UUID_RE` and `isUuid` moved here from `song-service.ts` (D6). |
| `src/songs/song-service.ts` | Import `UUID_RE`/`isUuid` from `../db/uuid` and re-export them (`export { UUID_RE, isUuid } from "../db/uuid";`) so `song-pedal-config-service.ts` and tests keep working unchanged. |
| `src/auth/user-service.ts` | `Role` type; `PublicUser` gains `role`; export `toPublicUser`; every `SELECT`/`RETURNING` that builds a `PublicUser` also selects `role`; new `getUserRole`, `findUserByEmail` (R10, R31–R37). |
| `src/middleware/require-admin.ts` | **New.** `requireAdmin` middleware (R5–R9). |
| `src/plans/plan-service.ts` | `isPlan`, `PlanChangeResult`, `setUserPlan`; widen `PlanError` status to `400 \| 404` (R11–R27). |
| `src/admin/set-role.ts` | **New.** CLI: `parseSetRoleArgs`, `setUserRoleByEmail`, `runSetRole` (R38–R41, D13). |
| `package.json` | Add script `"set-role": "bun run src/admin/set-role.ts"`. |
| `src/index.ts` | `protectedRouter.use("/admin/*", requireAdmin)`, `PATCH /admin/users/:id/plan`, `GET /admin/users` — all before `app.route("/", protectedRouter)` (R5, R11–R22, R28, R35–R37). |
| `docs/architecture.md` | Layers: add `src/admin/` and `require-admin.ts`; Data Flow: add the `requireAdmin` step for `/admin/*`; new section "Admin role and plan changes" with the bootstrap procedure (below). |
| Tests | `src/db/migrate.test.ts`, `src/plans/plan-service.test.ts`, `src/auth/auth.test.ts`, `src/index.test.ts`, new `src/middleware/require-admin.test.ts`, new `src/admin/set-role.test.ts`. |

## Migration `0006_user_roles_and_plan_changes.sql`

Re-runnable (R4), same style as 0005:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_valid;
ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin'));

CREATE TABLE IF NOT EXISTS plan_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_plan   VARCHAR(50) NOT NULL,
  new_plan   VARCHAR(50) NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_changes_user_id_created_at
  ON plan_changes(user_id, created_at);
```

Header comment must say: existing users become `'user'` via the default; `plan_changes` is an
append-only audit log, so it has no `updated_at`/`deleted_at` (exception to the soft-delete
convention); `changed_by` NULL = non-human actor (D5); FK actions per D11. `old_plan`/`new_plan` have no
CHECK on purpose: an audit row must survive a later change to the tier list.

## `src/db/uuid.ts`

```ts
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean;
```

Needed because `plan-service.ts` must not import from `src/songs/` (feature 14 keeps that import graph
acyclic: `song-service.ts` already imports `plan-service.ts`).

## `src/auth/user-service.ts`

```ts
export type Role = "user" | "admin";

export interface PublicUser {
  id: string;
  email: string;
  plan: string;
  role: Role;
}

export function toPublicUser(row: { id: string; email: string; plan: string; role: string }): PublicUser;
export async function getUserRole(userId: string): Promise<Role | null>;
export async function findUserByEmail(email: string): Promise<PublicUser | null>;
```

- `register`: `RETURNING id, email, plan, role`. The INSERT column list stays `(email, password_hash)`,
  so a `role` key in the request body can never reach the DB (R31). The route already reads only
  `email`/`password` from the body.
- `login`: `SELECT id, email, plan, role, password_hash`. `getMe`: `SELECT id, email, plan, role` (R32).
  `issueToken(user.id, user.plan)` is unchanged: no role claim (R10, D2).
- `getUserRole`: returns `null` when `!isUuid(userId)` (no query), otherwise
  `SELECT role FROM users WHERE id = ${userId} AND deleted_at IS NULL`; `null` when no row (D9).
- `findUserByEmail`: `SELECT id, email, plan, role FROM users WHERE email = ${email} AND deleted_at IS
  NULL`; `null` when no row. Exact match (D15).

## `src/middleware/require-admin.ts`

```ts
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
): Promise<Response | void> {
  if ((await getUserRole(c.get("userId"))) !== "admin") {
    return c.json({ error: "admin role required" }, 403);
  }
  await next();
}
```

Only ever mounted behind `requireAuth` (via `protectedRouter`), so `userId` is always set. DB errors
propagate (architecture principle 3). It does not cache the role anywhere (R8, R9).

## `src/plans/plan-service.ts` additions

```ts
export function isPlan(value: string): value is Plan {
  return Object.hasOwn(PLAN_LIMITS, value);
}

export interface PlanChangeResult {
  user: PublicUser;
  changed: boolean;
}

export class PlanError extends Error {
  constructor(message: string, public readonly status: 400 | 404) { super(message); }
}

export async function setUserPlan(
  userId: string,
  plan: string,
  changedBy: string | null,
): Promise<PlanChangeResult>;
```

`isPlan` derives the valid set from `PLAN_LIMITS` (R26, D4); `Object.hasOwn` makes `"toString"` /
`"__proto__"` invalid. `plan` is typed `string` so every caller (HTTP body, later billing metadata) is
validated in one place.

`setUserPlan` steps, in order:
1. `!isPlan(plan)` → `PlanError("invalid plan", 400)` (R18, D7).
2. `!isUuid(userId)` → `PlanError("user not found", 404)` (R20, D6).
3. `getDb().begin(async (tx) => { ... })` (D12):
   - `SELECT id, email, plan, role FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE`;
     no row → `PlanError("user not found", 404)` (R21, D9).
   - `row.plan === plan` → return `{ user: toPublicUser(row), changed: false }`; no write (R15, D8).
   - `UPDATE users SET plan = ${plan}, updated_at = NOW() WHERE id = ${userId} RETURNING id, email,
     plan, role` (R11).
   - `INSERT INTO plan_changes (user_id, old_plan, new_plan, changed_by) VALUES (${userId},
     ${row.plan}, ${plan}, ${changedBy})` (R13, R14, R25). `created_at` comes from the column default.
   - return `{ user: toPublicUser(updated), changed: true }`.

A throw inside `begin` rolls back the transaction, so an audit insert failure (e.g. `changedBy` not a
`users.id` → FK violation) leaves `users.plan` unchanged and propagates (R27). `changed` is not used by
the route; it is there for feature 17 (idempotent webhook handling).

`plan-service.ts` imports `PublicUser`/`toPublicUser` from `../auth/user-service` and `isUuid` from
`../db/uuid`. `user-service.ts` does not import `plan-service.ts`, so there is no cycle.

This is the only code that writes `users.plan` (D4). Tests may still set plans with raw SQL as fixtures.

## Routes (`src/index.ts`)

Registered on `protectedRouter`, **before** `app.route("/", protectedRouter)` (Hono copies routes at
`route()` time) and with `use` before the handlers (Hono runs handlers in registration order):

```ts
protectedRouter.use("/admin/*", requireAdmin);

protectedRouter.patch("/admin/users/:id/plan", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const plan = (body as Record<string, unknown>).plan;
  if (typeof plan !== "string") return c.json({ error: "plan is required" }, 400);
  try {
    const { user } = await setUserPlan(c.req.param("id"), plan, c.get("userId"));
    return c.json(user);
  } catch (err) {
    if (err instanceof PlanError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/admin/users", async (c) => {
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email is required" }, 400);
  const user = await findUserByEmail(email);
  if (!user) return c.json({ error: "user not found" }, 404);
  return c.json(user);
});
```

The `use("/admin/*")` entry has method `ALL`, so the unknown-route guard ignores it: an unregistered
admin path such as `/admin/users/:id/role` is still a 404 before auth (R30). A known admin path with
the wrong method (e.g. `GET /admin/users/:id/plan`) goes 401 → 403 → JSON 404, same as feature 12's
method-mismatch rule, with the admin check inserted. Any other key in the PATCH body (including
`role`) is ignored (R29, D10).

## Error paths

| Condition | Status | Body |
|---|---|---|
| unregistered `/admin/...` path, any token | 404 | `{error: "Not found"}` (feature 12 guard) |
| admin route, no/invalid token | 401 | `requireAuth` body |
| admin route, caller not a live admin | 403 | `{error: "admin role required"}` |
| PATCH body not JSON / not an object | 400 | `{error: "invalid JSON body"}` |
| PATCH `plan` missing / not a string | 400 | `{error: "plan is required"}` |
| PATCH `plan` not a tier | 400 | `{error: "invalid plan"}` |
| PATCH `:id` not a UUID / no live user | 404 | `{error: "user not found"}` |
| PATCH same plan | 200 | user body, no audit row |
| GET `/admin/users` without/empty `email` | 400 | `{error: "email is required"}` |
| GET `/admin/users` unknown email | 404 | `{error: "user not found"}` |
| DB failure in `setUserPlan` | 500 | propagates; transaction rolled back |

## `src/admin/set-role.ts` (bootstrap, D13)

```ts
export function parseSetRoleArgs(argv: string[]): { email: string; role: Role } | null;
export async function setUserRoleByEmail(email: string, role: Role): Promise<PublicUser | null>;
export async function runSetRole(
  argv: string[],
  out: Pick<Console, "log" | "error"> = console,
): Promise<number>;

if (import.meta.main) {
  process.exit(await runSetRole(Bun.argv.slice(2)));
}
```

- `parseSetRoleArgs`: exactly 2 args, non-empty email, role `user` or `admin`; otherwise `null`.
- `setUserRoleByEmail`: `UPDATE users SET role = ${role}, updated_at = NOW() WHERE email = ${email} AND
  deleted_at IS NULL RETURNING id, email, plan, role`; `null` when no row.
- `runSetRole`: bad args → `out.error("usage: bun run set-role <email> <user|admin>")`, return 1 (R41);
  no row → `out.error("no live user with email <email>")`, return 1 (R40); otherwise
  `out.log("role of <email> set to <role>")`, return 0 (R38, R39).

This module is the only code that writes `users.role`. `src/index.ts` must not import it.

### Documented procedure (to add to `docs/architecture.md`)

1. The person registers normally (`POST /auth/register`).
2. With the target stage's env set (`APP_STAGE`, `DATABASE_URL`), run
   `bun run set-role <email> admin`. Revoke with `bun run set-role <email> user`. Both take effect on
   the user's next request; no re-login.
3. Fallback when only a SQL console is available:
   ```sql
   UPDATE users SET role = 'admin', updated_at = NOW()
   WHERE email = '<email>' AND deleted_at IS NULL
   RETURNING id, email, role;
   ```
   Confirm exactly one row is returned.

## Test impact (important for the implementer)

- `src/db/migrate.test.ts`: add `0006_user_roles_and_plan_changes.sql` to the expected
  `schema_migrations` list.
- `PublicUser` gains `role`: register, login and `/auth/me` bodies get one more key. No existing test
  asserts the exact object shape (they read `email`/`token`), so none should break. The frontend's user
  type gains an optional field; no frontend change is required by this feature.
- Existing helpers (`makeUserToken`, `makeUser`) are unaffected: the default `role` is `'user'`. Add a
  `makeAdminToken` helper in `src/index.test.ts` that inserts with `role = 'admin'`.
- The test DB is shared and not reset: count `plan_changes` rows **per `user_id`**, never globally.
- `src/songs/song-service.ts` re-exports `isUuid`/`UUID_RE`, so existing imports keep compiling.
- Nothing hard-deletes `users` in the test suite today, so the new FKs do not affect cleanup.

## Discarded alternatives

1. **Role in the JWT.** Rejected (D2): a revoked admin would keep access until the token expires
   (7 days by default). One indexed primary-key `SELECT` per admin request is cheap.
2. **A `roles` table or `is_admin BOOLEAN`.** A table is overkill for two values. A boolean cannot grow
   to a third role without a migration that changes its type; `VARCHAR` + CHECK can.
3. **SQL snippet as the primary bootstrap.** Rejected (D13): a typo in the email silently updates 0
   rows, it needs a hand-typed connection string per stage, and it cannot be tested. Kept only as a
   documented fallback.
4. **An env var like `ADMIN_EMAILS` checked at login.** Rejected: puts role data in deploy config, and
   revoking needs a redeploy. Role would also stop being a DB fact.
5. **A separate `adminRouter` sub-app mounted with `protectedRouter.route("/admin", ...)`.** Works, but
   `use("/admin/*")` on the existing router is one line and keeps every protected route in one place.
6. **400 for a malformed UUID.** Rejected (D6): the song routes already answer 404, and a client cannot
   act differently on the two cases.
7. **Write an audit row for same-plan requests.** Rejected (D8): the table would record non-events;
   the acceptance asks for a row per plan *change*.
8. **`setUserPlan` takes `plan: Plan`.** Rejected: pushes validation to every caller (route, billing);
   taking `string` keeps the single validation point inside the single write path.

## Visual direction

Not applicable. Backend-only feature; a frontend admin UI is a separate feature.
