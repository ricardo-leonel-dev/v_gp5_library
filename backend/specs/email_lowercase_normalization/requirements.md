# Requirements — email_lowercase_normalization

Emails are stored and compared in a normalized form (trimmed, lowercase), so `Foo@X.com` and
`foo@x.com` are the same account. Today `register`/`login`/`findUserByEmail`/`setUserRoleByEmail`
query with the raw string and `users.email` has a case-sensitive `UNIQUE`. Dev DB snapshot: 4260 users
with mixed-case emails (mostly test users), 0 case-insensitive collisions.

## Open questions / decisions for the human reviewer

Each item is a choice this spec makes. Approving the spec approves all of them. Say so if any should
change.

- **D1 — Normalization is `trim()` then `toLowerCase()`.** It lives in one helper,
  `normalizeEmail(email)`, in a **new file** `src/auth/email.ts`. All four call sites use it: `register`,
  `login`, `findUserByEmail` and `setUserRoleByEmail`. It is a new file so it does not touch the
  `UserRow` export line that feature 19 (unmerged) changes in `user-service.ts`.
  `toLowerCase()` does not depend on locale. No other email validation is added, such as format or
  length checks.
- **D2 — Normalization happens in the service layer, not the routes.** The routes keep their
  `!email` → 400 check unchanged. `register`/`login` also reject an email that is empty after trimming
  (`"   "`) with the same 400 message, `"email and password are required"`. For the admin lookup,
  `?email=%20%20` normalizes to `""`, which matches no user, so it gets 404. F16 R37 (missing/empty →
  400) is unchanged.
- **D3 — The normalized value is what gets stored and returned.** `register`'s response, `login`'s
  response and `/auth/me` return the lowercase email, not the casing the user typed. After the
  migration, users who used to have mixed case see their email in lowercase. The frontend displays
  whatever the backend returns, so this is a visible change but not a breaking one.
- **D4 — Queries compare `lower(email) = ${normalizeEmail(input)}`, not `email = ...`.** This uses
  the new expression index (D8). It also still matches a row that escaped normalization, for example
  one inserted by raw SQL.
- **D5 — Soft-deleted users count for uniqueness.** This matches today's behavior: the `UNIQUE(email)`
  covers every row, and `register`'s existence check has no `deleted_at` filter. A soft-deleted
  `foo@x.com` therefore blocks registering `Foo@X.com` (409). The new unique index is **not** partial,
  and the migration's collision check covers soft-deleted rows too. Lookups by admin and `set-role`
  still match **live** users only (F16 D9/R36/R40 unchanged).
- **D6 — The migration fails loudly on a collision; it never merges or skips rows.** If two or more
  rows (live or soft-deleted) normalize to the same email, `0007` raises an exception. The message
  contains `case-insensitive email collision` and lists every colliding normalized email with its row
  ids. `migrate` already runs each file in a transaction and records it only on success (feature 2
  R5), so nothing is changed or recorded and the operator can re-run after fixing the data. The
  recovery runbook lives in a header comment at the top of the migration file itself
  (`src/db/migrations/0007_email_lowercase.sql`, git-tracked), and the exception's HINT points to that
  file. It does not live only in `docs/architecture.md`, because `docs/` is not version-controlled in
  this repo (agent-helper only); `docs/architecture.md` gets at most a short pointer (see design.md).
  Rejected alternative: leave the rows,
  report, and continue. Then the unique index (D8) could not be created, and login for those accounts
  would become ambiguous.
- **D7 — The migration normalizes exactly like the app: `lower(btrim(email, <whitespace>))`.** Without
  the trim, an existing user stored with stray whitespace could not log in once `login` trims the
  input. The whitespace set is space, `\t`, `\n`, `\r`, `\v` and `\f`. JS `trim()` also strips Unicode
  spaces such as NBSP. That gap is accepted (see D15).
- **D8 — New unique index `users_email_lower_key ON users (lower(email))`; the old `users_email_key`
  (`UNIQUE(email)` from 0001) is dropped.** The old constraint is redundant: case-insensitive
  uniqueness implies exact uniqueness. With D4, no query needs the old index. Keeping both would mean
  two indexes to maintain and a misleading second "source of truth".
- **D9 — No `CHECK (email = lower(email))`.** The unique index enforces the real invariant (no case
  duplicates). Normalized storage is enforced by the single helper, and D4 makes reads tolerant of
  rows that are not normalized. A CHECK would turn any edge case where JS `toLowerCase()` and Postgres
  `lower()` disagree into a 500 on register. It would also break any raw-SQL fixture that inserts
  mixed case. Flip this if you want the database to reject non-normalized writes.
- **D10 — Concurrent duplicate registers return 409, not 500.** Two requests can both pass the
  existence check. The second `INSERT` then hits a unique violation (SQLSTATE `23505`) on
  `users_email_lower_key`. `register` maps that error to the same `AuthError(409)`. Any other DB error
  still propagates.
- **D11 — The migration bumps `updated_at` only on rows whose email actually changes.** Rows that are
  already normalized keep their `updated_at`.
- **D12 — JWTs and sessions are unaffected.** Tokens carry `sub = users.id` (plus a `plan` claim),
  never the email. Every authenticated lookup is by id. Tokens issued before the migration stay valid,
  and nobody has to log in again.
- **D13 — `set-role` success message prints the stored (normalized) email.** It prints
  `role of foo@x.com set to admin` even when invoked with `Foo@X.com`, so the operator sees which
  account was changed. The failure message still echoes the input as typed
  (`no live user with email Foo@X.com`).
- **D14 — Out-of-scope finding: `login` does not filter `deleted_at`.** A soft-deleted user can still
  log in today. This spec keeps that behavior (it only changes how the email is matched). Open a
  separate feature if it should change.
- **D15 — Accepted risk: Unicode.** JS `toLowerCase()` and Postgres `lower()` can disagree on rare
  non-ASCII characters, and so can JS `trim()` and the `btrim` set. Real emails here are ASCII. No
  Unicode normalization (NFC/NFKC) and no IDNA handling is done.
- **D16 — Migration number `0007_email_lowercase.sql`.** If another feature (e.g. 17) lands a `0007`
  first, renumber this one to the next free number and update the migrate test's file list.

## Test impact

- Tests that register a mixed-case email and later log in with the same string keep passing, because
  both sides are normalized. All current `auth.test.ts` emails are lowercase (`crypto.randomUUID()`
  produces lowercase hex), so their `me.email`/`body.user.email` equality checks are unaffected.
- `src/index.test.ts`, test `"unknown, upper-cased and soft-deleted emails -> 404 (R36)"`: the
  `email.toUpperCase()` candidate **must now return 200** (R12 below supersedes F16 R35's
  "exactly that email"). That candidate moves into a new case-insensitive test. The unknown and
  soft-deleted candidates stay 404.
- `src/db/migrate.test.ts`, `"running migrate twice is a no-op..."`: the expected filename list gains
  `0007_email_lowercase.sql`.
- Any future test that asserts a response `email` equals mixed-case input will instead see the
  lowercase form.
- Raw-SQL fixtures that insert lowercase `crypto.randomUUID()` emails are unaffected. A raw insert
  that differs from an existing row only by case now fails with a unique violation (R20).

## Normalization helper

## R1
WHEN `normalizeEmail` is called with a string, the system SHALL return that string with leading and
trailing whitespace removed and every character converted with `String.prototype.toLowerCase()`.

## Register

## R2
WHEN `POST /auth/register` succeeds, the system SHALL store `users.email` as the normalized form of
the submitted email.

## R3
WHEN `POST /auth/register` succeeds, the system SHALL return a `user.email` equal to the normalized
form of the submitted email.

## R4
IF `POST /auth/register` is sent with an email whose normalized form equals the lowercased email of
an existing `users` row, whether that row is live or soft-deleted, THEN the system SHALL respond with
HTTP 409 and `{"error": "Email is already registered"}`.

## R5
IF two `POST /auth/register` requests run concurrently with emails whose normalized forms are equal
THEN the system SHALL create exactly one `users` row for that normalized email.

## R6
IF two `POST /auth/register` requests run concurrently with emails whose normalized forms are equal
THEN the system SHALL respond with HTTP 409 and `{"error": "Email is already registered"}` to the
request that did not create the row.

## R7
IF `POST /auth/register` is sent with an email that is empty after trimming THEN the system SHALL
respond with HTTP 400 and `{"error": "email and password are required"}` without inserting a row.

## Login

## R8
WHEN `POST /auth/login` is sent with an email whose normalized form equals a stored user's lowercased
email, together with that user's correct password, the system SHALL respond with HTTP 200 and a token
whose `sub` is that user's id.

## R9
WHEN `POST /auth/login` succeeds, the system SHALL return a `user.email` equal to the stored email.

## R10
IF `POST /auth/login` is sent with an email that is empty after trimming THEN the system SHALL
respond with HTTP 400 and `{"error": "email and password are required"}`.

## Admin lookup

## R11
WHEN an admin caller sends `GET /admin/users?email=<email>` and a live user's lowercased email equals
the normalized form of `<email>`, the system SHALL respond with HTTP 200 and that user's user body.

## R12
IF an admin caller sends `GET /admin/users?email=<email>` and the only user whose lowercased email
equals the normalized form of `<email>` is soft-deleted THEN the system SHALL respond with HTTP 404.

## set-role

## R13
WHEN `set-role` runs with an email whose normalized form equals a live user's lowercased email and a
valid role, the system SHALL set that user's `users.role` to the role and return exit code 0.

## R14
WHEN `set-role` succeeds, the system SHALL log `role of <stored email> set to <role>`, where
`<stored email>` is the matched row's `users.email`.

## Migration 0007

## R15
WHEN migration `0007` runs and no two `users` rows share the same `lower(btrim(email))`, the system
SHALL set every `users.email` to `lower(btrim(email))`.

## R16
WHEN migration `0007` changes a row's `users.email`, the system SHALL set that row's `updated_at` to
the migration time.

## R17
WHEN migration `0007` runs, the system SHALL leave `updated_at` unchanged on every row whose
`users.email` already equals `lower(btrim(email))`.

## R18
IF two or more `users` rows, live or soft-deleted, share the same `lower(btrim(email))` when migration
`0007` runs THEN the system SHALL fail the migration with an error whose message contains
`case-insensitive email collision` and every colliding normalized email.

## R19
IF migration `0007` fails because of a collision THEN the system SHALL leave every `users.email`
value as it was before the migration ran.

## R20
WHILE migration `0007` is applied, the system SHALL reject, with a unique violation, any `INSERT` or
`UPDATE` that would give a `users` row a `lower(email)` equal to another row's `lower(email)`,
whether that other row is live or soft-deleted.

## R21
WHILE migration `0007` is applied, the system SHALL have no unique constraint or unique index on
`users.email` alone, so `users_email_key` is absent.

## R22
WHEN the SQL of migration `0007` is executed again on a database where it has already been applied,
the system SHALL complete without error.
