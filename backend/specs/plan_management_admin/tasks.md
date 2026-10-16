# Tasks — plan_management_admin

- [x] T1 (R1, R2, R3, R4) Create `src/db/migrations/0006_user_roles_and_plan_changes.sql` with the
  design.md SQL and header comment. Run `bun run migrate`.
- [x] T2 (R1, R2, R3, R4) In `src/db/migrate.test.ts`, add `0006_user_roles_and_plan_changes.sql` to the
  expected list. Add tests: a fresh user inserted without `role` has `role = 'user'` (R1); `UPDATE ...
  SET role = 'owner'` is rejected, `admin`/`user` are accepted (R2); `information_schema.columns` for
  `plan_changes` lists exactly `id, user_id, old_plan, new_plan, changed_by, created_at` (R3);
  re-executing the 0006 SQL via `db.unsafe(await readFile(...))` does not throw (R4).
- [x] T3 (R20, R21) Create `src/db/uuid.ts` with `UUID_RE`/`isUuid` moved from `song-service.ts`; make
  `song-service.ts` import and re-export them. Run the existing suite: no import breaks.
- [x] T4 (R10, R31, R32, R33, R34, R35, R36) In `src/auth/user-service.ts`: add `Role`, `role` on
  `PublicUser`, export `toPublicUser`, select `role` in `register`/`login`/`getMe`, add `getUserRole`
  and `findUserByEmail` per design.md. Leave `issueToken` calls unchanged.
- [x] T5 (R10, R31, R32, R33, R34) In `src/auth/auth.test.ts`: register → `user` has exactly
  `id, email, plan, role` with `role = "user"` (R33); register with body `role: "admin"` → DB row
  `role = 'user'` (R31); login → `user` is a user body (R34); `/auth/me` returns `role`, and after
  `UPDATE users SET role = 'admin'` the same token's `/auth/me` returns `"admin"` (R32); decode the
  token payload from register/login (`jose` `decodeJwt`) and assert it has no `role` key (R10).
- [x] T6 (R5, R6, R8, R9) Create `src/middleware/require-admin.ts` per design.md.
- [x] T7 (R5, R6, R7, R8, R9) Create `src/middleware/require-admin.test.ts` using a small Hono app
  (`createProtectedRouter()` + `use("/admin/*", requireAdmin)` + one `GET /admin/ping` handler):
  admin → 200 (R5); role `user` → 403 `{"error":"admin role required"}` (R6); soft-deleted admin → 403
  and token for a random UUID with no row → 403 (R6); no token → 401 (R7); admin token, then
  `UPDATE role = 'user'` → same token 403 (R8); user token, then `UPDATE role = 'admin'` → same token
  200 (R9).
- [x] T8 (R11, R13, R14, R15, R18, R20, R21, R25, R26, R27) In `src/plans/plan-service.ts`: add
  `isPlan`, `PlanChangeResult`, widen `PlanError` to `400 | 404`, add `setUserPlan` per design.md
  (validate plan → validate UUID → transaction with `FOR UPDATE` → no-op or update + audit insert).
- [x] T9 (R11, R13, R15, R18, R20, R21, R25, R26, R27) In `src/plans/plan-service.test.ts`:
  `isPlan` is true for every key of `PLAN_LIMITS` and false for `"gold"`, `"Premium"`, `""`,
  `"toString"` (R26); `setUserPlan` free→basic with `changedBy = null` → `changed: true`, DB plan
  `basic`, one audit row for the user with `changed_by IS NULL` (R11, R13, R25); same plan →
  `changed: false`, zero audit rows (R15); `"gold"` → `PlanError` 400 (R18); `"not-a-uuid"` →
  `PlanError` 404 (R20); random UUID and soft-deleted user → `PlanError` 404 (R21); `changedBy` = a
  random UUID not in `users` → throws, user's plan unchanged, zero audit rows (R27).
- [x] T10 (R5, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R28, R29) In
  `src/index.ts`, add `protectedRouter.use("/admin/*", requireAdmin)` and the
  `PATCH /admin/users/:id/plan` handler per design.md, before `app.route("/", protectedRouter)`.
- [x] T11 (R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R29) Add `makeAdminToken` to
  `src/index.test.ts` and HTTP tests for the PATCH:
  - admin changes a `free` user to `premium` → 200, body keys exactly `id, email, plan, role`,
    `plan = "premium"` (R11, R12); one audit row with `old_plan = "free"`, `new_plan = "premium"`,
    `changed_by = <admin id>` (R13) and `created_at` between timestamps taken before and after the
    request (R14).
  - same plan → 200 user body, zero audit rows for the target (R12, R15).
  - malformed JSON, `[]`, `"basic"` body → 400 (R16); `{}` and `{"plan": 1}` → 400 (R17);
    `{"plan": "gold"}` → 400 (R18).
  - `:id = "abc"` → 404 (R20); random UUID → 404, soft-deleted user → 404 (R21).
  - `{"plan": "gold"}` on a random UUID → 400 (R22).
  - for each 400/403/404 case above, target plan unchanged and audit count for the target unchanged
    (R19); the 403 case uses a non-admin token on a real target.
  - body `{"plan": "basic", "role": "admin"}` → 200, target `role` still `user` (R29).
- [x] T12 (R23, R24) In `src/index.test.ts`: `free` user with token T and 1 live song; admin PATCHes
  it to `basic`; `GET /me/plan` with T returns `plan: "basic"` (R23); `POST /songs` with T and 1
  preset → 201 (R24).
- [x] T13 (R35, R36, R37) In `src/index.ts`, add `GET /admin/users` per design.md, after the `use` and
  before `app.route("/", protectedRouter)`; add `findUserByEmail` usage.
- [x] T14 (R35, R36, R37) In `src/index.test.ts`: admin `GET /admin/users?email=<existing>` → 200 user
  body (R35); unknown email, upper-cased variant of an existing email, and a soft-deleted user's email
  → 404 (R36); no `email` and `email=` → 400 (R37); non-admin → 403 (R6).
- [x] T15 (R28, R30) In `src/index.test.ts`: the set of `app.routes` entries with `method !== "ALL"`
  and path starting `/admin/` is exactly `GET /admin/users` and `PATCH /admin/users/:id/plan` (R28);
  `PATCH`, `PUT` and `POST` to `/admin/users/<uuid>/role` with an admin token → 404 (R30).
- [x] T16 (R38, R39, R40, R41) Create `src/admin/set-role.ts` (`parseSetRoleArgs`,
  `setUserRoleByEmail`, `runSetRole`, `import.meta.main` entry) per design.md; add
  `"set-role": "bun run src/admin/set-role.ts"` to `package.json`. Do not import it from `src/index.ts`.
- [x] T17 (R38, R39, R40, R41) Create `src/admin/set-role.test.ts` calling `runSetRole` with a silent
  `out`: `[email, "admin"]` → 0 and DB role `admin` (R38); `[email, "user"]` → 0 and DB role `user`
  (R39); unknown email and soft-deleted user's email → 1, no row changed (R40); `[email, "owner"]`,
  `[email]`, `[email, "admin", "x"]` → 1, role unchanged (R41).
- [x] T18 (R1, R5, R38) Update `docs/architecture.md`: add `src/admin/` and `require-admin.ts` to
  Layers, add the `requireAdmin` step for `/admin/*` to Data Flow, add an "Admin role and plan changes"
  section with the bootstrap procedure and SQL fallback from design.md.
- [x] T19 (R1–R41) Run `./init.sh`; all green. Write the R→test traceability map in
  `progress/impl_plan_management_admin.md`.
