# Requirements — plan_management_admin

## Open questions / decisions for the human reviewer

Each item is a choice this spec makes. The items marked "agreed" restate the design agreed with the
human before drafting; the rest are new choices. Approving the spec approves all of them; say so if any
should change.

- **D1 (agreed) — `users.role` column.** `VARCHAR(20) NOT NULL DEFAULT 'user'` with a CHECK allowing
  only `'user'` and `'admin'`. Existing rows get `'user'` from the default.
- **D2 (agreed) — Role is read from the database on every admin request.** `requireAdmin` runs a
  `SELECT role FROM users` per request. The JWT never carries a role claim, so granting or revoking
  admin takes effect on the caller's next request with the same token, without re-login.
- **D3 (agreed) — `requireAdmin` sits behind `requireAuth`.** It is registered on the existing
  `protectedRouter` for `/admin/*`, so the order is: unknown-route guard (404) → `requireAuth` (401) →
  `requireAdmin` (403) → handler.
- **D4 (agreed) — Single plan write path.** `setUserPlan(userId, plan, changedBy)` in
  `src/plans/plan-service.ts` is the only code that writes `users.plan`. It validates `plan` against
  feature 14's `PLAN_LIMITS` keys (no second list of tiers). The future billing feature (17) calls the
  same function.
- **D5 — `changed_by` is nullable.** `changed_by` is a `users.id` for an admin change and `NULL` for a
  non-human actor (billing webhooks in feature 17). Feature 17 may add a `source` column if it needs to
  tell actors apart; this spec does not add one.
- **D6 — Invalid UUID in `:id` → 404**, not 400. Same rule the song routes already use (`isUuid` →
  404): a malformed id names no user. To share the check without an import cycle, `UUID_RE`/`isUuid`
  move to `src/db/uuid.ts` and `song-service.ts` re-exports them (no other importer changes).
- **D7 — Body is validated before the user lookup.** A request with a bad body and an unknown id gets
  400, not 404.
- **D8 — Same-plan request is a 200 no-op.** If the target already has the requested plan, the response
  is 200 with the user, `users.plan`/`updated_at` are not written and **no** `plan_changes` row is
  inserted (the audit log records changes, not requests).
- **D9 — Soft-deleted users are "unknown".** A target with `deleted_at IS NOT NULL` → 404. A caller
  whose own row is soft-deleted or missing is not an admin → 403.
- **D10 — Extra body keys are ignored**, including `role`. This matches how other routes ignore unknown
  fields. A test proves `role` in the body changes nothing.
- **D11 — `plan_changes.user_id` is `ON DELETE CASCADE`, `changed_by` is `ON DELETE SET NULL`.** The
  app never hard-deletes users (soft delete only), so this only matters for a future erasure flow:
  erasing a user drops their own audit trail but keeps the rows they authored as an admin. The table is
  append-only: no `updated_at`/`deleted_at` (a documented exception to the soft-delete convention).
- **D12 — Plan change and audit row are one transaction.** The current plan is read with
  `SELECT ... FOR UPDATE`, so `old_plan` is exact under concurrent changes and a failed audit insert
  rolls the plan back.
- **D13 — Bootstrap the first admin with a bun script, not a raw SQL snippet.**
  `bun run set-role <email> <user|admin>` (`src/admin/set-role.ts`). Reasons: it uses the same
  stage-aware `getDb()` as `bun run migrate` (works for dev/staging/main without hand-typing a
  connection string), it fails loudly with a non-zero exit when the email matches no live user (a raw
  `UPDATE` silently updates 0 rows on a typo), it validates the role value before touching the DB, it
  also revokes (`user`), and it is unit-testable. The equivalent SQL is documented as a fallback for
  environments where only a SQL console is available (e.g. Supabase dashboard). The script is a CLI
  entry point, never imported by `src/index.ts`, so it is not an endpoint.
- **D14 — `GET /auth/me` exposes `role`.** `PublicUser` becomes `{id, email, plan, role}`, so register,
  login and `/auth/me` all return it. A future admin UI can show/hide admin controls from `/auth/me`.
  The UI must still treat it as a hint: the server enforces with `requireAdmin` on every request.
- **D15 — Admin lookup by email: `GET /admin/users?email=<email>`.** Without it an admin needs SQL
  access to find the `:id` for the PATCH, which defeats the endpoint. Exact, case-sensitive match
  (registration stores email as given), live users only, returns one user or 404. No listing or
  search. This is the only scope addition beyond the feature's acceptance; drop R35–R37 and T13/T14 if
  you do not want it.
- **D16 — The JWT `plan` claim stays as is (stale after a change).** Nothing reads it for enforcement
  (feature 14 R19 reads the DB), so it is left untouched; removing it is out of scope.
- **D17 — Error strings.** 400: `"invalid JSON body"`, `"plan is required"`, `"invalid plan"`,
  `"email is required"`; 403: `"admin role required"`; 404: `"user not found"`.

## Scope note

Terms used below:
- **Migration 0006**: the new file `src/db/migrations/0006_user_roles_and_plan_changes.sql`.
- **Live user**: a `users` row with `deleted_at IS NULL`.
- **Admin caller**: a request with a valid Bearer token whose `sub` is a live user with
  `role = 'admin'` at the time of the request.
- **Non-admin caller**: a request with a valid Bearer token whose `sub` is not an admin caller (role
  `'user'`, soft-deleted, or no `users` row).
- **Admin route**: a registered route whose path starts with `/admin/`.
- **Plan PATCH**: `PATCH /admin/users/:id/plan` with a JSON body.
- **Valid plan**: a string that is a key of feature 14's `PLAN_LIMITS` (`free`, `basic`, `premium`).
- **User body**: a JSON object with exactly the keys `id`, `email`, `plan`, `role`.
- **Audit row**: a row in `plan_changes`.
- **`set-role`**: the `runSetRole(argv)` function in `src/admin/set-role.ts`, run by
  `bun run set-role <email> <role>`; its return value is the process exit code.

Out of scope: any HTTP endpoint that creates, grants, changes or revokes roles; listing/searching users;
billing (feature 17); a frontend admin UI; removing the JWT `plan` claim.

## Schema and migration

## R1
WHEN migration 0006 has been applied and a `users` row is inserted without a `role` value, the system
SHALL store `role = 'user'` for that row.

## R2
WHEN migration 0006 has been applied, the system SHALL reject an INSERT or UPDATE that sets
`users.role` to a value other than `user` or `admin` with a database error.

## R3
WHEN migration 0006 has been applied, the system SHALL have a `plan_changes` table with the columns
`id`, `user_id`, `old_plan`, `new_plan`, `changed_by` and `created_at`.

## R4
WHEN the SQL of migration 0006 is executed again against a database where it has already been applied,
the system SHALL complete without error.

## Admin authorization

## R5
WHEN an admin caller sends a request to an admin route, the system SHALL pass the request to that
route's handler.

## R6
IF a non-admin caller sends a request to an admin route THEN the system SHALL respond with HTTP 403 and
the JSON body `{"error":"admin role required"}`.

## R7
IF a request to an admin route has no valid Bearer token THEN the system SHALL respond with HTTP 401.

## R8
WHEN a live user's `role` is changed from `admin` to `user` in the database, the system SHALL respond
with HTTP 403 to that user's next admin-route request made with a token issued before the change.

## R9
WHEN a live user's `role` is changed from `user` to `admin` in the database, the system SHALL pass that
user's next admin-route request made with a token issued before the change to the route's handler.

## R10
The system SHALL issue JWTs whose payload contains no `role` claim.

## Plan change endpoint

## R11
WHEN an admin caller sends a plan PATCH whose `plan` is a valid plan different from the target live
user's current plan, the system SHALL set that user's `users.plan` to the requested plan.

## R12
WHEN an admin caller sends a plan PATCH for a live target user with a valid plan, the system SHALL
respond with HTTP 200 and a user body holding the target user's values after the request.

## R13
WHEN a plan PATCH changes a user's plan, the system SHALL insert exactly one audit row with `user_id` =
the target id, `old_plan` = the plan before the request, `new_plan` = the requested plan and
`changed_by` = the admin caller's user id.

## R14
WHEN a plan PATCH changes a user's plan, the system SHALL set the audit row's `created_at` to a time
not earlier than the start of the request and not later than its response.

## R15
WHEN an admin caller sends a plan PATCH whose `plan` equals the target user's current plan, the system
SHALL insert no audit row.

## R16
IF the plan PATCH body is not valid JSON or is not a JSON object THEN the system SHALL respond with
HTTP 400.

## R17
IF the plan PATCH body has no `plan` key or its `plan` value is not a string THEN the system SHALL
respond with HTTP 400.

## R18
IF the plan PATCH body's `plan` is a string that is not a valid plan THEN the system SHALL respond with
HTTP 400.

## R19
IF a plan PATCH is answered with HTTP 400, 403 or 404 THEN the system SHALL leave both every `users.plan`
value and the number of audit rows unchanged.

## R20
IF the plan PATCH `:id` is not a UUID THEN the system SHALL respond with HTTP 404.

## R21
IF the plan PATCH `:id` is a UUID that matches no live user THEN the system SHALL respond with HTTP 404.

## R22
IF a plan PATCH has an invalid body and an `:id` that matches no live user THEN the system SHALL
respond with HTTP 400.

## Plan change takes effect immediately

## R23
WHEN a plan PATCH has changed a user's plan, the system SHALL return the new plan from that user's next
`GET /me/plan` made with a token issued before the change.

## R24
WHEN a plan PATCH has changed a user's plan from `free` to `basic`, the system SHALL apply the `basic`
limits to that user's next `POST /songs` made with a token issued before the change.

## `setUserPlan` service

## R25
WHEN `setUserPlan` is called with `changedBy = null` and changes a plan, the system SHALL insert an
audit row whose `changed_by` is `NULL`.

## R26
The system SHALL accept in `setUserPlan` exactly the plan values that are keys of `PLAN_LIMITS`.

## R27
IF the audit row insert inside `setUserPlan` fails THEN the system SHALL leave the target user's
`users.plan` unchanged.

## No role-changing endpoint

## R28
The system SHALL register exactly two admin routes: `GET /admin/users` and
`PATCH /admin/users/:id/plan`.

## R29
WHEN an admin caller sends a plan PATCH whose body contains a `role` key, the system SHALL leave the
target user's `users.role` unchanged.

## R30
IF a request to `/admin/users/:id/role` is received with any method THEN the system SHALL respond with
HTTP 404.

## R31
WHEN `POST /auth/register` receives a body that contains `"role":"admin"`, the system SHALL create the
user with `role = 'user'`.

## Role exposure

## R32
WHEN an authenticated caller sends `GET /auth/me`, the system SHALL respond with a user body whose
`role` is the caller's `users.role` read during that request.

## R33
WHEN `POST /auth/register` succeeds, the system SHALL return a `user` field that is a user body.

## R34
WHEN `POST /auth/login` succeeds, the system SHALL return a `user` field that is a user body.

## Admin lookup by email

## R35
WHEN an admin caller sends `GET /admin/users?email=<email>` and a live user has exactly that email,
the system SHALL respond with HTTP 200 and that user's user body.

## R36
IF an admin caller sends `GET /admin/users?email=<email>` and no live user has exactly that email THEN
the system SHALL respond with HTTP 404.

## R37
IF an admin caller sends `GET /admin/users` without an `email` query parameter or with an empty one
THEN the system SHALL respond with HTTP 400.

## Admin bootstrap (`set-role`)

## R38
WHEN `set-role` runs with the email of a live user and the role `admin`, the system SHALL set that
user's `users.role` to `admin` and return exit code 0.

## R39
WHEN `set-role` runs with the email of a live user and the role `user`, the system SHALL set that
user's `users.role` to `user` and return exit code 0.

## R40
IF `set-role` runs with an email that matches no live user THEN the system SHALL return exit code 1
and change no `users` row.

## R41
IF `set-role` runs with a role other than `user` or `admin`, or with a number of arguments other than
2, THEN the system SHALL return exit code 1 and change no `users` row.
