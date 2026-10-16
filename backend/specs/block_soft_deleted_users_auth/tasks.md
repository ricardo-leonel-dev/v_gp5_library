# Tasks — block_soft_deleted_users_auth

- [x] T1 (R1) In `login` (`src/auth/user-service.ts`), add `AND deleted_at IS NULL` to the lookup query.
  Keep the `"Invalid credentials"` 401 for no row. Do not change the password-verify path (D6).
- [x] T2 (R14) In `getMe`, add `AND deleted_at IS NULL`. Keep the message/status (`"User not found"`,
  401).
- [x] T3 (R3, R16) In `src/middleware/require-auth.ts`, add `role: Role` to `AuthVariables` (import
  `Role` from `user-service.ts`). Do not add a new lookup function: `getUserRole` is reused unchanged.
- [x] T4 (R3, R4, R5, R6, R7, R8, R9) Rewrite `requireAuth` as in design.md: add the
  `createRequireAuth(lookupRole = getUserRole)` factory and `export const requireAuth =
  createRequireAuth()`. Only `verifyToken` goes inside the `try`. Then the `isUuid` check (401, lookup
  not called), then one `lookupRole` call (401 on `null`), then `c.set("userId")`, `c.set("plan")`,
  `c.set("role")`. Lookup errors are not caught. `protected-router.ts` stays unchanged.
- [x] T5 (R16, R17, R18) Rewrite `requireAdmin` (`src/middleware/require-admin.ts`) to read
  `c.get("role")` and return 403 `{"error":"admin role required"}` unless it is `"admin"`. Remove the
  `getUserRole` import and any DB access; no DB fallback when `role` is unset. Update its header comment
  (role read from the DB on every request by `requireAuth`).
- [x] T6 (R3) In `protected-router.test.ts`, switch the feature-1 R1/R6 tests to a real inserted user
  row. Then switch `cors.test.ts` R18 and `unknown-route-guard.test.ts` R8 the same way. Confirm they
  pass.
- [x] T7 (R3, R4, R5, R6, R7, R8, R9) Add middleware tests in `protected-router.test.ts`. Live user →
  handler sees `userId` and `role` equal to the row's (user and admin rows). Soft-deleted user → 401
  exact body. Random UUID → 401 exact body. Non-UUID `sub` → 401 with an injected lookup that records it
  was never called. The handler is not invoked in those three cases. An injected counting lookup is
  called exactly once for a valid token, on a plain route and on `/admin/*` with `requireAdmin` mounted.
  An injected throwing lookup → 500.
- [x] T8 (R16, R17, R18) In `require-admin.test.ts`, add stub-context unit tests (no `requireAuth`):
  `role: "admin"` + `userId` with no DB row → 200; `role: "user"` + `userId` of a real admin row → 403
  exact body; `role` unset → 403 exact body. Keep the grant/revoke tests through
  `createProtectedRouter()` and cite R18.
- [x] T9 (R1, R2) In `auth.test.ts`, add the login tests: soft-deleted user with the correct password,
  with a wrong password, and with an upper-cased/padded email → each 401 `{"error":"Invalid
  credentials"}`. Live user → 200 with `sub` = id.
- [x] T10 (R12, R13, R14) In `auth.test.ts`, add the `/auth/me` tests: token issued, then user
  soft-deleted → 401 exact body. Token for a random UUID → 401 exact body. `getMe(softDeletedId)` throws
  `AuthError` with status 401.
- [x] T11 (R15) In `auth.test.ts`, add or extend an explicit test: register with the upper-cased email
  of a soft-deleted row → 409 `{"error":"Email is already registered"}`.
- [x] T12 (R10, R11) In `index.test.ts`, add: live token `GET /songs` 200 → soft-delete → same token →
  401 exact body. Soft-deleted admin → `GET /admin/users?email=…` → 401 exact body.
- [x] T13 (R5, R6, R11) Update the existing tests that D3/D4 supersede. `require-admin.test.ts`:
  soft-deleted admin / missing UUID / non-UUID `sub` now expect 401 `{"error":"Invalid or expired
  token"}`, citing this feature. `index.test.ts`: `/me/plan` "no users row" now expects 401 (D4).
- [x] T14 (R3, R4, R16, R17) Update `docs/architecture.md`: the Data Flow `requireAuth` line (loads the
  live user's role, 401 if none, attaches `userId` and `role`) and the Admin section (soft-deleted/
  missing callers 403 → 401 via `requireAuth`; `requireAdmin` reads the role from context). Not
  version-controlled.
- [x] T15 (R1–R18) Run `./init.sh` (`bun test`) green and write the R→test traceability in
  `progress/impl_block_soft_deleted_users_auth.md`.
