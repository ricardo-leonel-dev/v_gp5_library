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
