# Tasks — songs_schema_migrations

- [x] T1 (R1, R2, R4, R5) Update `src/db/migrate.ts`: create `schema_migrations` (`filename TEXT
      PRIMARY KEY`, `applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`) if missing, read already-applied
      filenames from it, skip any migration file already recorded, wrap each remaining file's SQL + its
      `schema_migrations` insert in a single `db.begin(...)` transaction, and add an optional
      `migrationsDir` parameter (defaulting to the existing `MIGRATIONS_DIR` constant) as a test seam.
- [x] T2 (R6, R7) Add `src/db/migrations/0002_audit_columns.sql`: `ALTER TABLE ... ADD COLUMN IF NOT
      EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` on `song_files`, `pedal_catalog`, and
      `song_pedal_configs`; and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ` on
      all five tables (`users`, `songs`, `song_files`, `pedal_catalog`, `song_pedal_configs`).
- [x] T3 (R8, R9, R10, R12, R13) Add `src/db/migrations/0003_song_files_ordering.sql` (must run after
      T2, since its unique index predicate references `deleted_at`): `ALTER TABLE song_files ADD
      COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`, a unique partial index on
      `song_files(song_id) WHERE kind = 'preset' AND deleted_at IS NULL`, and a composite index on
      `song_files(song_id, kind, sort_order)` replacing the old single-column `song_id` index.
- [x] T4 (R14) Add a subsection to `docs/architecture.md` documenting the decision not to enforce a
      database-level cap on `ir`/`nam` `song_files` rows per song, distinguishing it from the pedal's
      hardware slot capacity.
- [x] T5 (R2, R3, R4) Add `src/db/migrate.test.ts` test: `migrate()` applied against the real local
      Postgres records `0001_init.sql`, `0002_audit_columns.sql`, and `0003_song_files_ordering.sql` in
      `schema_migrations`, and a second `migrate()` call is a no-op (no thrown error, no
      duplicate/changed rows).
- [x] T6 (R6) Add a test to `src/db/migrate.test.ts`: `information_schema.columns` shows `updated_at`
      as `NOT NULL` defaulting to `now()` on `song_files`, `pedal_catalog`, and `song_pedal_configs`.
- [x] T7 (R7) Add a test to `src/db/migrate.test.ts`: `information_schema.columns` shows `deleted_at`
      as nullable with no default on all five tables (`users`, `songs`, `song_files`, `pedal_catalog`,
      `song_pedal_configs`).
- [x] T8 (R9) Add a test to `src/db/migrate.test.ts`: `information_schema.columns` shows `song_files
      .sort_order` as `NOT NULL` with a default of `0`.
- [x] T9 (R10, R11) Add a test to `src/db/migrate.test.ts`: inserting a second non-soft-deleted `kind =
      'preset'` `song_files` row for the same `song_id` (while the first is still active) rejects with
      a constraint-violation error.
- [x] T10 (R8) Add a test to `src/db/migrate.test.ts`: insert a `preset` `song_files` row, set its
      `deleted_at` to `NOW()`, then insert a second `preset` row for the same `song_id` and assert it
      succeeds (no throw); assert a `deleted_at IS NULL` query for that `song_id`/`kind` returns only
      the new row.
- [x] T11 (R12, R13) Add a test to `src/db/migrate.test.ts`: two `kind = 'ir'` `song_files` rows for
      the same `song_id` with different `sort_order` both insert successfully, an ordered query returns
      them in `sort_order` order, and `pg_indexes` shows `idx_song_files_song_id_kind_sort_order`
      exists.
- [x] T12 (R5) Add a test to `src/db/migrate.test.ts`: write a deliberately-invalid SQL file to a
      `mkdtemp(os.tmpdir())` temp directory, call `migrate(tmpDir)`, assert it rejects, and assert
      `schema_migrations` has no row for that file's filename.

Note (not a numbered task — done directly by the spec author at the human reviewer's request, outside
the implementer's `R<n>`/`T<n>` scope): `docs/conventions.md` gets a new "Soft Delete" subsection
establishing the project-wide convention that any table with a `deleted_at` column is soft-deleted
(never hard-`DELETE`d by application code) and that SELECT-style queries against it must filter
`deleted_at IS NULL` by default. This is a repository-wide convention update, not testable code
produced by this feature, so it deliberately has no `R<n>`/`T<n>`.
