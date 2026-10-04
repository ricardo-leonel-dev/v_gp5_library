# Design — email_lowercase_normalization

Layers, error handling, soft delete and test conventions follow `docs/architecture.md` and
`docs/conventions.md`. Decisions D1–D16 are listed in `requirements.md`. This file covers only the
changes. No UI is added, so there is no Visual direction section.

## Files to touch

| File | Change |
| --- | --- |
| `src/auth/email.ts` (new) | `normalizeEmail` helper (R1). |
| `src/auth/email.test.ts` (new) | Unit tests for `normalizeEmail`. |
| `src/auth/user-service.ts` | `register`, `login`, `findUserByEmail` use the helper and `lower(email)`; the unique-violation mapping goes here. **Do not touch the `type UserRow` line** (feature 19 changes it). |
| `src/admin/set-role.ts` | `setUserRoleByEmail` uses the helper and `lower(email)`; the success message uses the stored email. |
| `src/db/migrations/0007_email_lowercase.sql` (new) | Header comment with the collision recovery runbook (source of truth, D6); collision check, data normalization, index swap. |
| `src/auth/auth.test.ts` | New register/login tests. |
| `src/index.test.ts` | New admin lookup tests; adjust the existing R36 test (see Test impact in requirements.md). |
| `src/admin/set-role.test.ts` | New case-insensitive tests. |
| `src/db/migrate.test.ts` | Add `0007` to the file list; add the migration tests. |
| `docs/architecture.md` | Email normalization section with a short pointer to the runbook in `0007`, case-insensitive admin lookup and SQL fallback. Not version-controlled (agent-helper only). |

`src/index.ts`, `src/auth/jwt.ts`, `src/middleware/*` and `src/plans/plan-service.ts` need **no
change**. Routes already map `AuthError` (status `400 | 401 | 409`) to JSON. Tokens key by user id
(D12). `plan-service.ts` only *selects* `email`.

## Signatures

```ts
// src/auth/email.ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

`src/auth/user-service.ts` keeps all public signatures unchanged. Internal changes:

```ts
import { normalizeEmail } from "./email";

// Bun.sql's PostgresError carries the SQLSTATE in `errno` ("23505" = unique_violation).
// Implementer: confirm the property name against the installed Bun (log a caught error once)
// before relying on it; adjust this helper only, not the call site.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { errno?: unknown }).errno === "23505";
}

export async function register(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (normalized === "") throw new AuthError("email and password are required", 400);   // R7
  const existing = await db`SELECT id FROM users WHERE lower(email) = ${normalized}`;   // R4, D5: no deleted_at filter, same as today
  if (existing.length > 0) throw new AuthError("Email is already registered", 409);
  const passwordHash = await hashPassword(password);
  let row;
  try {
    [row] = await db`INSERT INTO users (email, password_hash) VALUES (${normalized}, ${passwordHash})
                     RETURNING id, email, plan, role`;                                  // R2, R3
  } catch (err) {
    if (isUniqueViolation(err)) throw new AuthError("Email is already registered", 409); // R5, R6
    throw err;
  }
  ...
}

export async function login(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (normalized === "") throw new AuthError("email and password are required", 400);   // R10
  const [row] = await db`SELECT id, email, plan, role, password_hash FROM users
                         WHERE lower(email) = ${normalized}`;                            // R8 (no deleted_at filter: unchanged, D14)
  ...
}

export async function findUserByEmail(email: string) {
  // WHERE lower(email) = ${normalizeEmail(email)} AND deleted_at IS NULL                // R11, R12
}
```

`src/admin/set-role.ts`:

```ts
// setUserRoleByEmail: WHERE lower(email) = ${normalizeEmail(email)} AND deleted_at IS NULL   (R13)
// runSetRole success: out.log(`role of ${user.email} set to ${args.role}`)                   (R14, D13)
// runSetRole failure message unchanged: `no live user with email ${args.email}`
```

`parseSetRoleArgs` is unchanged. It does not normalize; normalization stays in the DB-facing function,
so a direct caller of `setUserRoleByEmail` is normalized too.

## Migration `0007_email_lowercase.sql`

```sql
-- 0007_email_lowercase.sql — users.email becomes trimmed + lowercase, unique
-- case-insensitively. Aborts (whole file rolled back, not recorded) if two rows,
-- live or soft-deleted, normalize to the same email — see the COLLISION RECOVERY
-- RUNBOOK below. Whitespace set mirrors JS trim()
-- for ASCII: space, \t, \n, \r, \f, \v (0x0B; Postgres E-strings have no \v).
-- users_email_key (UNIQUE(email) from 0001) is dropped: users_email_lower_key
-- implies it. Re-runnable.
--
-- COLLISION RECOVERY RUNBOOK (source of truth; docs/ is not version-controlled)
-- If this migration fails with "case-insensitive email collision":
--   1. List the groups:
--        SELECT lower(btrim(email, E' \t\n\r\f\x0B')) AS norm,
--               array_agg(id ORDER BY created_at) AS ids,
--               array_agg(email ORDER BY created_at) AS emails,
--               array_agg(deleted_at ORDER BY created_at) AS deleted
--          FROM users GROUP BY 1 HAVING COUNT(*) > 1;
--   2. For each group, a human picks the surviving account. Do not choose
--      automatically: the rows can belong to different owners of songs/plans.
--   3. Free the email on every other row in the group by moving it to a reserved,
--      unique placeholder, and soft-delete that row:
--        UPDATE users
--           SET email = 'collision+' || id || '@invalid',
--               deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
--         WHERE id = '<loser id>';
--      (.invalid is a reserved TLD, RFC 2606.) Only if a human confirms both rows
--      are the same person, move their data first:
--        UPDATE songs SET user_id = '<survivor>' WHERE user_id = '<loser>';
--      Check the survivor's plan limits afterwards.
--   4. Re-run bun run migrate.

DO $$
DECLARE
  collisions TEXT;
BEGIN
  SELECT string_agg(norm || ' (ids: ' || ids || ')', '; ' ORDER BY norm)
    INTO collisions
    FROM (
      SELECT lower(btrim(email, E' \t\n\r\f\x0B')) AS norm,
             string_agg(id::text, ', ' ORDER BY created_at, id) AS ids
        FROM users
       GROUP BY 1
      HAVING COUNT(*) > 1
    ) c;
  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION 'users.email case-insensitive email collision: %', collisions
      USING HINT = 'Resolve the duplicates (see the runbook in the header of src/db/migrations/0007_email_lowercase.sql) and re-run bun run migrate.';
  END IF;
END $$;

UPDATE users
   SET email = lower(btrim(email, E' \t\n\r\f\x0B')), updated_at = NOW()
 WHERE email <> lower(btrim(email, E' \t\n\r\f\x0B'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
```

Notes:
- The collision check scans every row, including soft-deleted ones (D5, R18). The index is not
  partial (R20).
- If the check fails, the exception aborts the transaction that `migrate` opens for each file.
  `UPDATE`/`DROP`/`CREATE` never commit and the file is not inserted into `schema_migrations`. That is
  existing behavior (feature 2 R5, test `"a failing migration file is not recorded as applied"`).
  This spec does not re-test it. R19 is tested directly (see below).
- `WHERE email <> ...` limits the `updated_at` bump to rows that change (R16, R17). On a re-run it
  matches 0 rows (R22).
- The constraint name `users_email_key` is Postgres's default for the inline `UNIQUE` in 0001.
  Implementer: confirm it once with
  `SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u'`. If it
  differs, use the real name, record it in the session log, and make R21's test assert the real name.
- `VARCHAR(255)` is unchanged. `lower`/`btrim` never lengthen an ASCII string.

## Error paths

| Situation | Result |
| --- | --- |
| Register/login email is blank after trim | `AuthError(400, "email and password are required")` → 400 (same message as the route's missing-field check). |
| Register: existing row with the same `lower(email)`, live or soft-deleted | `AuthError(409)` (existing message). |
| Register: concurrent insert loses the race | `23505` → `AuthError(409)`. Any other DB error is re-thrown unchanged (architecture principle 3). |
| Login: no row / wrong password | Unchanged: 401 `Invalid credentials`. |
| Admin lookup: no live match | Unchanged: 404 `user not found`. |
| `set-role`: no live match | Unchanged: exit 1, `no live user with email <input>`. |
| Migration collision | `RAISE EXCEPTION` → `bun run migrate` exits non-zero with the message. Nothing is applied. |

## Documentation (`docs/architecture.md`, not version-controlled)

1. In "Admin role and plan changes", change `GET /admin/users?email=<email> (exact match, live users only)`
   to "(case-insensitive after trim, live users only)". In the bootstrap SQL fallback, change the
   predicate to `WHERE lower(email) = lower(btrim('<email>')) AND deleted_at IS NULL`.
2. Add a subsection **"Email normalization"** covering: what is stored (`normalizeEmail` = trim +
   lowercase, `src/auth/email.ts`, the only normalizer); queries match `lower(email)`;
   `users_email_lower_key` is unique over every row, soft-deleted included; tokens are unaffected.
   Then add a **short pointer** (not a copy) to the collision recovery runbook: one or two sentences
   saying that a failed `0007` aborts with `case-insensitive email collision` and that the recovery
   steps live in the header comment of `src/db/migrations/0007_email_lowercase.sql`. The migration file
   is the runbook's source of truth (D6): `docs/` is not version-controlled in this repo (agent-helper
   only), so nothing in this section may be the only copy of an operational procedure.

`specs/plan_management_admin/` is an approved spec and is **not** edited. Tests reference
`email_lowercase_normalization R11 (supersedes plan_management_admin R35)` in their names instead,
the same way the migrate tests already mark superseded requirements.

## Test approach

DB tests use the real local Postgres and random lowercase `crypto.randomUUID()` emails
(conventions.md). Build mixed case explicitly (e.g. `` `Foo-${id}@Example.COM` ``).

- **R1:** `email.test.ts` checks `" Foo@X.COM\t\n"` → `"foo@x.com"`, `"a@b.c"` unchanged, and `"   "` → `""`.
- **R2/R3/R4/R7–R10:** `app.request` against `/auth/register` and `/auth/login`. For R2, read the row
  by id. For R8, compare `decodeJwt(token).sub` with the registered id. For R4, use one live and one
  soft-deleted existing row (soft-deleted inserted by raw SQL with `deleted_at = NOW()`). For R7,
  compare `SELECT COUNT(*) FROM users` before and after.
- **R5/R6:** `Promise.all` of two registers (`Race-${id}@Example.com`, `race-${id}@example.com`).
  Assert that the sorted statuses are `[201, 409]`, the 409 body, and
  `COUNT(*) WHERE lower(email) = ...` = 1. Repeat 10 times with fresh ids to exercise the
  insert-collision path, not just the pre-check. Each iteration's outcome is deterministic whichever
  path runs.
- **R11/R12:** `GET /admin/users?email=` with `` `  ${email.toUpperCase()} ` `` → 200 and the stored
  (lowercase) body. A soft-deleted lowercase row looked up in upper case → 404.
- **R13/R14:** `runSetRole([user.email.toUpperCase(), "admin"], io.out)` → 0, the role is admin, and
  the log is `role of ${user.email} set to admin`.
- **R15–R17, R19:** Run the 0007 SQL inside `db.begin(async (tx) => { ...; throw rollbackSentinel })`
  so nothing is committed (assert `rejects.toBe(rollbackSentinel)`).
  - R15–R17: inside the transaction, insert `` `  MiXed-${id}@Example.COM ` `` and a normalized row,
    both with `updated_at = '2000-01-01'`. Run `tx.unsafe(sql)`. Assert that the first row's email is
    normalized with `updated_at > '2000-01-01'`, and the second row's `updated_at` is still
    `2000-01-01`.
  - R18/R19: inside the transaction, `DROP INDEX users_email_lower_key`. Insert `col-${id}@example.com`
    (live), `COL-${id}@EXAMPLE.COM` (soft-deleted) and `` `Keep-${id}@Example.com` ``. Run the SQL
    inside `tx.savepoint(...)` and catch the error. Assert that the message contains
    `case-insensitive email collision` and `col-${id}@example.com`. Then re-select the three rows and
    assert their emails are byte-identical to what was inserted (R19). Implementer: confirm Bun.sql's
    `savepoint` API. If it is unavailable, issue `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` with
    `tx.unsafe`.
- **R20:** On the real DB, raw-insert `x-${id}@example.com`. A raw insert of `X-${id}@example.com`
  rejects with SQLSTATE `23505`, and so does an `UPDATE` of another row to `X-${id}@Example.com`.
  Repeat with the first row soft-deleted.
- **R21:** `pg_constraint` has no `users_email_key`. `pg_indexes` for `users` has
  `users_email_lower_key`, whose `indexdef` contains `UNIQUE` and `lower(` and no ` WHERE `. No
  unique index has `indexdef` ending in `(email)`.
- **R22:** `await db.unsafe(sql)` twice on the real DB, the same pattern as the 0005/0006 re-run tests.

## Discarded alternatives

- **`citext` column type.** Rejected. It needs the `citext` extension in every stage, and it changes
  the column type that Bun.sql reads. It also keeps the user's original casing in storage, which
  contradicts "stored lowercase" in the acceptance, and it still does not trim.
- **Normalize in the routes (`src/index.ts`).** Rejected. `set-role` is a CLI that never goes through
  the routes, and `findUserByEmail` is a service function that a future caller could reach without a
  route. The service layer is the one place all four call sites share.
- **Normalize in SQL at each query (`lower(btrim(${email}))`).** Rejected. It needs four copies of the
  expression, it cannot be unit-tested, and the JS value is needed anyway for the blank check (R7/R10).
- **On collision, leave the rows and report, then continue.** Rejected (D6). The unique index could not
  be created, so the guarantee this feature exists for would be missing, and login would pick an
  arbitrary row.
- **Partial unique index `WHERE deleted_at IS NULL`.** Rejected (D5). It would let a soft-deleted
  email be re-registered, a semantic change that today's `UNIQUE(email)` and `register` both forbid.
  That would be a separate feature.
- **Keep `users_email_key` next to the new index.** Rejected (D8). It is redundant, and every write
  would maintain two indexes.
- **Add the helper to `user-service.ts`.** Rejected. Feature 19 (unmerged) edits that file's
  `UserRow` export. A separate file keeps the two branches conflict-free and gives the helper its own
  unit test file.
