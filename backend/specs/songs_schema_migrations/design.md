# Design — songs_schema_migrations

## Files to touch

### New: `src/db/migrations/0002_audit_columns.sql`
```sql
-- 0002_audit_columns.sql — adds updated_at to the three tables that were
-- missing it, and deleted_at (soft-delete marker) to all five tables. Must
-- run before 0003_song_files_ordering.sql, whose unique partial index
-- predicate references song_files.deleted_at.

ALTER TABLE song_files         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pedal_catalog      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE song_pedal_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE songs              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE song_files         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pedal_catalog      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE song_pedal_configs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```
- `users` and `songs` already have `updated_at` (from `0001_init.sql`) — not touched here; R6 only
  names the three tables that were missing it.
- `deleted_at` has no `DEFAULT`, so every pre-existing row gets `NULL` when this `ALTER TABLE` runs,
  which is exactly "not deleted" (R7).
- `ADD COLUMN IF NOT EXISTS` keeps this file individually re-runnable in isolation, same rationale as
  `0001_init.sql`/`0003_song_files_ordering.sql` below — the actual re-run-safety guarantee for the
  runner as a whole comes from the `schema_migrations` table in `migrate.ts` (R2, R4), not from every
  file having to be hand-idempotent forever (see "Discarded alternatives").

### New: `src/db/migrations/0003_song_files_ordering.sql`
```sql
-- 0003_song_files_ordering.sql — adds explicit signal-chain ordering for
-- ir/nam song_files (flagged as an open question in 0001_init.sql), and
-- enforces the "exactly one active preset row per song" invariant that
-- 0001_init.sql's own comment already documented but never constrained.
-- Depends on 0002_audit_columns.sql having already added deleted_at.

ALTER TABLE song_files ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_song_files_one_preset_per_song
  ON song_files(song_id) WHERE kind = 'preset' AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_song_files_song_id;
CREATE INDEX IF NOT EXISTS idx_song_files_song_id_kind_sort_order
  ON song_files(song_id, kind, sort_order);
```
- The unique partial index's predicate now includes `AND deleted_at IS NULL` (R10). Without it,
  soft-deleting a song's preset row (setting `deleted_at`) would leave that row still counted by the
  index, permanently blocking any replacement preset upload for the same `song_id` — flagged in human
  review of the first draft as a correctness bug, not a style choice (R8).
- Otherwise unchanged from the first draft: `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` /
  `DROP INDEX IF EXISTS` keep this file individually re-runnable in isolation, matching the style
  `0001_init.sql` already uses. The composite `(song_id, kind, sort_order)` index replaces the old
  single-column `idx_song_files_song_id` — it still serves any query that filters on `song_id` alone
  (leftmost prefix), so keeping both would be redundant (R13). `sort_order` is `NOT NULL DEFAULT 0` for
  every kind (R9) — meaningless-but-harmless for `preset`/`cover` rows, meaningful for `ir`/`nam`. No
  `CHECK` restricting it to certain kinds; nothing in `docs/architecture.md`/the acceptance criteria
  calls for one.

### `src/db/migrate.ts`
Current `migrate()` unconditionally re-runs every `.sql` file's contents on every invocation — safe
today only because `0001_init.sql` happens to use `IF NOT EXISTS` everywhere. New behavior:

```ts
async function migrate(migrationsDir: string = MIGRATIONS_DIR): Promise<void> {
  const db = getDb();

  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`applying ${file}`);
    await db.begin(async (tx) => {
      await tx.unsafe(sql);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
  }
}
```
Nothing about the runner itself changes because of the `0002`/`0003` split — it already applies
whatever unapplied `.sql` files it finds in ascending filename order (R2), and
`0002_audit_columns.sql` / `0003_song_files_ordering.sql` sort correctly relative to each other and to
`0001_init.sql` without any code change.
- `db.begin(async (tx) => {...})` is `Bun.SQL`'s built-in transaction helper (see
  `node_modules/bun-types/sql.d.ts`): `BEGIN` before the callback, `COMMIT` on a normal return,
  automatic `ROLLBACK` if the callback throws. Wrapping each file's SQL + its `schema_migrations`
  insert in one transaction is what gives R5: a failure partway through a migration's SQL rolls back
  that file's partial DDL/DML *and* never inserts its filename, so the next `bun run migrate` retries
  the whole file rather than silently skipping it as "done".
- `migrate` gains an optional `migrationsDir` parameter (defaulting to the existing module-level
  `MIGRATIONS_DIR` constant, so the CLI entrypoint and every existing caller are unaffected) purely as
  a test seam: it's what lets `migrate.test.ts` point a real `migrate()` call at a temp directory
  containing a deliberately-broken SQL file to prove R5 against the real transaction/rollback behavior,
  instead of asserting it from documentation. `export { migrate }` and the `import.meta.main` CLI
  entrypoint are otherwise unchanged.

### New: `src/db/migrate.test.ts`
Colocated with `migrate.ts` per `docs/conventions.md`. Hits the real local Postgres from
`docker-compose.yml` directly via `getDb()` — no mocking, per `docs/verification.md`'s anti-patterns
list. Uses `crypto.randomUUID()`-based emails for any `users` row it inserts, consistent with
`auth.test.ts`, and never assumes any table starts empty.

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "./client";
import { migrate } from "./migrate";

describe("migrate", () => {
  test("running migrate twice is a no-op the second time (R2, R3, R4)", async () => {
    await migrate();
    const db = getDb();
    const before = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(before.map((r) => r.filename)).toEqual([
      "0001_init.sql",
      "0002_audit_columns.sql",
      "0003_song_files_ordering.sql",
    ]);

    await migrate(); // must not throw, must not duplicate rows
    const after = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(after).toEqual(before);
  });

  test("song_files, pedal_catalog, song_pedal_configs gain a NOT NULL updated_at defaulting to now() (R6)", async () => {
    const db = getDb();
    const rows = await db<{ table_name: string; column_default: string; is_nullable: string }[]>`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_name IN ('song_files', 'pedal_catalog', 'song_pedal_configs')
        AND column_name = 'updated_at'
    `;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.is_nullable).toBe("NO");
      expect(row.column_default).toContain("now()");
    }
  });

  test("every table gains a nullable deleted_at column with no default (R7)", async () => {
    const db = getDb();
    const rows = await db<{ table_name: string; column_default: string | null; is_nullable: string }[]>`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_name IN ('users', 'songs', 'song_files', 'pedal_catalog', 'song_pedal_configs')
        AND column_name = 'deleted_at'
    `;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.is_nullable).toBe("YES");
      expect(row.column_default).toBeNull();
    }
  });

  test("song_files has a NOT NULL sort_order column defaulting to 0 (R9)", async () => {
    const db = getDb();
    const [col] = await db<{ column_default: string; is_nullable: string }[]>`
      SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_name = 'song_files' AND column_name = 'sort_order'
    `;
    expect(col.is_nullable).toBe("NO");
    expect(col.column_default).toContain("0");
  });

  test("a second active preset song_files row for the same song is rejected (R10, R11)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k1', 'a.syx', 'application/octet-stream', 10)
    `;

    await expect(
      db`
        INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
        VALUES (${song.id}, 'preset', 'k2', 'b.syx', 'application/octet-stream', 10)
      `,
    ).rejects.toThrow();
  });

  test("soft-deleting a preset row allows inserting its replacement (R8)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    const [oldPreset] = await db<{ id: string }[]>`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k1', 'a.syx', 'application/octet-stream', 10) RETURNING id
    `;

    await db`UPDATE song_files SET deleted_at = NOW() WHERE id = ${oldPreset.id}`;

    // must NOT throw now that the only existing preset row is soft-deleted
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k2', 'b.syx', 'application/octet-stream', 10)
    `;

    const active = await db<{ storage_key: string }[]>`
      SELECT storage_key FROM song_files
      WHERE song_id = ${song.id} AND kind = 'preset' AND deleted_at IS NULL
    `;
    expect(active.map((r) => r.storage_key)).toEqual(["k2"]);
  });

  test("multiple ir/nam song_files rows with independent sort_order are allowed (R12, R13)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
      VALUES (${song.id}, 'ir', 'k1', 'a.wav', 'audio/wav', 10, 0)
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
      VALUES (${song.id}, 'ir', 'k2', 'b.wav', 'audio/wav', 10, 1)
    `;

    const rows = await db<{ storage_key: string }[]>`
      SELECT storage_key FROM song_files
      WHERE song_id = ${song.id} AND kind = 'ir'
      ORDER BY sort_order ASC
    `;
    expect(rows.map((r) => r.storage_key)).toEqual(["k1", "k2"]);

    const [idx] = await db<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'song_files' AND indexname = 'idx_song_files_song_id_kind_sort_order'
    `;
    expect(idx.indexname).toBe("idx_song_files_song_id_kind_sort_order");
  });

  test("a failing migration file is not recorded as applied (R5)", async () => {
    const db = getDb();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "migrate-test-"));
    const brokenFilename = "9999_broken.sql";
    await writeFile(path.join(tmpDir, brokenFilename), "SELECT * FROM this_table_does_not_exist;");

    await expect(migrate(tmpDir)).rejects.toThrow();

    const [row] = await db<{ filename: string }[]>`
      SELECT filename FROM schema_migrations WHERE filename = ${brokenFilename}
    `;
    expect(row).toBeUndefined();

    await rm(tmpDir, { recursive: true, force: true });
  });
});
```
Uses the same `mkdtemp(os.tmpdir())`-per-test pattern already established for filesystem tests in
`src/storage/local-fs-adapter.test.ts` (`docs/conventions.md`'s fixture/isolation convention), cleaned
up unconditionally after the assertion. Because `schema_migrations` is a real, shared table (per
`docs/conventions.md`, no DB reset between test files), asserting on `9999_broken.sql` specifically —
rather than the table's overall row count — keeps this test independent of whatever else has already
run against the same database.
- The first test's `migrate()` call is safe to run against the shared dev/test database even though
  other test files also hit it (per `docs/conventions.md`, "no DB reset between test files") — after
  the very first run anywhere, every subsequent `migrate()` call (including this test's own second
  call) is a no-op per R4, so the assertion on `schema_migrations`'s exact contents is stable across
  repeated `bun test` runs, not just the first one.
- The R6/R7 tests query `information_schema.columns` for a set of table names at once rather than one
  query per table — same idea as R9's existing single-column check, just extended to multiple tables,
  so a missing column on any one of them fails loudly with `toHaveLength`.

### `docs/architecture.md`
Add a new subsection under "What NOT to do" (or its own numbered principle — implementer's call,
consistent with the file's existing structure):

```markdown
- Don't add a database-level cap on the number of `ir`/`nam` `song_files` rows per song. The pedal's
  20 IR / 80 NAM hardware slots are a property of what's loaded on the physical device at once, not a
  limit on how many files a user's saved library can reference across all their songs — those are
  different numbers for different reasons, and conflating them would block a legitimate use case (a
  song's saved bundle referencing more IR/NAM variations than currently fit on the pedal, swapped in
  before upload). If a real per-song or per-plan cap is ever needed, it's a product decision belonging
  to `plan_limits_enforcement`, not a hardcoded schema constraint here.
```
This satisfies R14's "dedicated section" requirement and the acceptance criterion's alternative path
("a note in `docs/architecture.md` confirms the stub already matches reality") for the one open
question `0001_init.sql` didn't resolve on its own — multiplicity.

### `docs/conventions.md` (not a tasks.md item)
A new "Soft Delete" subsection, added directly by the spec author at the human reviewer's request
rather than deferred to a `T<n>`: it establishes project-wide that any table with a `deleted_at` column
is soft-deleted (never hard-`DELETE`d by application code) and that SELECT-style queries against such a
table must filter `deleted_at IS NULL` by default. This is a repository-wide convention statement, not
testable code produced by this feature, so it deliberately has no `R<n>`. This feature's own tests are
the first (and so far only) code that queries these tables; `migrate.test.ts`'s R8 test's final
assertion already follows the new convention (`... AND deleted_at IS NULL`) as a living example.
Enforcement in real application query paths starts with `song_crud_api`, the first feature to add
service-layer SELECTs against `songs`/`song_files`.

## Error handling
No new typed error class. `db.begin(...)`'s automatic `ROLLBACK` (R5) and the unique-index violation
from Postgres (R11) both already surface as a rejected Promise from `Bun.sql` — `migrate.ts`'s CLI
entrypoint lets that propagate uncaught (matches `docs/architecture.md` principle 3: never swallow an
unexpected error silently), and `migrate.test.ts`'s R10/R11 test asserts on `.rejects.toThrow()` rather
than a specific error shape, since no route/service layer wraps raw DB constraint violations at this
feature's scope — that mapping (if any) belongs to `song_crud_api`, which is the first feature to
actually call `INSERT INTO song_files` from a service function.

## Discarded alternatives

**Enforce the pedal's 20 IR / 80 NAM hardware slot counts as a database-level cap on `song_files` rows
per song** (e.g. a `BEFORE INSERT` trigger counting existing rows). Rejected: Postgres `CHECK`
constraints cannot reference other rows, so this would require a trigger — real complexity for a limit
that conflates two different things (device slot capacity vs. saved-library size) and isn't a confirmed
product requirement yet (`plan_limits_enforcement`, feature 9, is explicitly deferred as "low priority"
in `features.seed.json`). Chose to document the non-decision in `docs/architecture.md` instead (R14).

**Keep relying purely on `IF NOT EXISTS`-style idioms in every future migration file, with no
`schema_migrations` tracking table**, i.e. leave `migrate.ts` exactly as-is. Rejected: not every future
schema change is expressible idempotently that way in Postgres — a data backfill, a `DROP COLUMN`, or a
non-idempotent seed `INSERT` has no `IF NOT EXISTS` equivalent — so relying on it forever would just
defer the re-run-safety problem to whichever future migration first needs one of those, instead of
solving it once here where `docs/architecture.md` already describes `src/db/migrate.ts` as the
project's migration runner.

**Combine the audit-column additions and the `song_files` ordering/uniqueness fix into a single
`0002_song_files_ordering.sql` file** (the shape of the first draft, before human review asked for
soft-delete support). Rejected: `updated_at`/`deleted_at` touch `users`, `songs`, `pedal_catalog`, and
`song_pedal_configs` too — tables that have nothing to do with signal-chain ordering — so folding them
into a file named (and originally scoped) for `song_files` ordering would make that file's name and its
future `git blame`/diff history misleading for anyone auditing schema changes later. Splitting into
`0002_audit_columns.sql` (broad, orthogonal hardening across all five tables) and
`0003_song_files_ordering.sql` (`song_files`-specific, and dependent on `0002`'s `deleted_at` column for
its corrected unique-index predicate) keeps each file's purpose singular while the existing
ascending-filename-order runner logic (R2) composes them correctly with no code change.

**Fix the "soft-deleted preset blocks replacement" bug with a `BEFORE INSERT` trigger or an
application-layer pre-check instead of adjusting the partial unique index's predicate.** Rejected:
Postgres partial unique indexes already express "unique among non-deleted rows" exactly and
declaratively (`WHERE kind = 'preset' AND deleted_at IS NULL`), with no extra moving parts; a trigger
or an app-layer check would duplicate that logic in a second place it could silently drift out of sync
with the schema.
