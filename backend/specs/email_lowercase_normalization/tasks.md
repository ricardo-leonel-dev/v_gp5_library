# Tasks — email_lowercase_normalization

- [x] T1 (R1) Create `src/auth/email.ts` with `normalizeEmail(email)` = `email.trim().toLowerCase()`.
- [x] T2 (R1) Add `src/auth/email.test.ts`, covering mixed case, surrounding whitespace (space, tab,
  newline), an already-normalized value, and whitespace-only → `""`.
- [x] T3 (R2, R3, R4, R7) In `register`, normalize first; throw `AuthError(400, "email and password are
  required")` when the result is `""`; check existence with `lower(email) = ${normalized}` (no
  `deleted_at` filter); insert the normalized value. Do not touch the `type UserRow` line.
- [x] T4 (R5, R6) Add the private `isUniqueViolation(err)` helper (SQLSTATE `23505`; confirm Bun.sql's
  property name first) and map that error from the `INSERT` in `register` to `AuthError(409, "Email is
  already registered")`. Re-throw anything else.
- [x] T5 (R8, R9, R10) In `login`, normalize, add the blank → 400 check, and query
  `lower(email) = ${normalized}` (keep today's lack of a `deleted_at` filter, D14).
- [x] T6 (R11, R12) In `findUserByEmail`, query `lower(email) = ${normalizeEmail(email)} AND deleted_at
  IS NULL`.
- [x] T7 (R13, R14) In `src/admin/set-role.ts`, make `setUserRoleByEmail` use the same predicate and
  make `runSetRole`'s success message print `user.email` (the stored email). Leave the failure message
  unchanged.
- [x] T8 (R15, R16, R17, R18, R19, R20, R21, R22) Add `src/db/migrations/0007_email_lowercase.sql` as in
  design.md: header comment with the collision recovery runbook (D6, verbatim from the design.md
  sketch), collision `DO` block whose HINT points to this migration file, normalizing `UPDATE`
  restricted to rows that change, `DROP
  CONSTRAINT IF EXISTS users_email_key`, `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON
  users (lower(email))`. Confirm the real name of the old constraint first.
- [x] T9 (R22) In `src/db/migrate.test.ts`, add `0007_email_lowercase.sql` to the expected
  `schema_migrations` list in `"running migrate twice is a no-op..."`.
- [x] T10 (R15, R16, R17) Migrate test: normalization and the `updated_at` bump, run inside a
  rolled-back transaction.
- [x] T11 (R18, R19) Migrate test: collision abort (live + soft-deleted), error message content, and
  rows unchanged, in a rolled-back transaction with a savepoint.
- [x] T12 (R20, R21) Migrate tests: a case-variant `INSERT`/`UPDATE` is rejected with `23505` (also
  against a soft-deleted row); `users_email_key` is absent and `users_email_lower_key` is unique, on
  `lower(email)`, and not partial.
- [x] T13 (R22) Migrate test: running the 0007 SQL twice does not throw.
- [x] T14 (R2, R3, R4, R7, R8, R9, R10) `src/auth/auth.test.ts`: register with a mixed-case,
  whitespace-padded email stores and returns lowercase. Login with a different casing and padding
  returns 200, `sub` is the user id, and `user.email` is lowercase. A duplicate by case of a live row
  → 409, and of a soft-deleted row → 409. A whitespace-only email → 400 on register (row count
  unchanged) and on login.
- [x] T15 (R5, R6) `src/auth/auth.test.ts`: concurrent case-variant registers, 10 iterations. Statuses
  `[201, 409]`, the 409 body, and exactly one row.
- [x] T16 (R11, R12) `src/index.test.ts`: a case-insensitive, padded admin lookup → 200 with the stored
  body; an upper-cased lookup of a soft-deleted row → 404. In the existing
  `"unknown, upper-cased and soft-deleted emails -> 404 (R36)"` test, remove the `email.toUpperCase()`
  candidate and rename the test accordingly.
- [x] T17 (R13, R14) `src/admin/set-role.test.ts`: `runSetRole([email.toUpperCase(), "admin"])` → exit 0,
  role admin, log `role of <lowercase email> set to admin`.
- [x] T18 (R11, R13, R18) Update `docs/architecture.md` (not version-controlled; agent-helper only):
  case-insensitive admin lookup, the bootstrap SQL fallback predicate, and a new "Email normalization"
  subsection with a short pointer to the collision recovery runbook in the header comment of
  `src/db/migrations/0007_email_lowercase.sql` (the runbook's source of truth, written in T8; do not
  copy it here) (design.md, "Documentation").
- [x] T19 (R15, R21) Run `bun run migrate` against the dev DB (expects no collision: 0 known) and then
  `./init.sh`. Before migrating, record in the session log the count from `SELECT COUNT(*) FROM users WHERE
  email <> lower(btrim(email))` (≈4260 expected). After migrating, record that the same query returns
  0, or record the collision error if one appears.
