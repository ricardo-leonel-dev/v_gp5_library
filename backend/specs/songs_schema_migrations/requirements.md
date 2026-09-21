# Requirements — songs_schema_migrations

Scope note: no real GP-5 preset/IR/NAM dumps are available yet (none exist in this repo, and the
frontend's Web MIDI layer that would produce them, `frontend/src/app/midi/`, isn't built yet either).
This feature cannot literally "confirm multiplicity against real dumps" for that reason, so — per the
feature's own acceptance criteria, which explicitly allow "a note in `docs/architecture.md` confirms
the stub already matches reality" as an alternative to a schema change — it instead resolves the two
concrete gaps `0001_init.sql`'s own comments already flag (no explicit ordering for `ir`/`nam` files
within a signal chain; no enforcement of the documented "exactly one preset per song" invariant),
hardens the migration runner itself so future migrations (0004+, once real dumps *are* available) can
land safely, and records the multiplicity-cap decision as a documented note rather than blocking on
hardware that doesn't exist yet. Following human review of the first draft, this revision also adds
`updated_at`/`deleted_at` audit columns to the tables that were missing them and establishes a
project-wide soft-delete convention (see `docs/conventions.md`), which in turn requires correcting the
preset-uniqueness index so a soft-deleted preset row no longer permanently blocks a replacement upload
(R8). Every future feature that adds a migration (`song_crud_api` and later) depends on the runner and
the soft-delete convention built here.

## R1
The system SHALL track every applied migration file's name and an `applied_at` timestamp in a
`schema_migrations` table.

## R2
WHEN `bun run migrate` runs, the system SHALL apply only the migration files in `src/db/migrations/`
whose filename is not yet recorded in `schema_migrations`, in ascending filename order.

## R3
WHEN `bun run migrate` runs against a fresh database with no application tables yet, the system SHALL
apply `0001_init.sql`, `0002_audit_columns.sql`, and `0003_song_files_ordering.sql` successfully and
SHALL record all three filenames in `schema_migrations`.

## R4
WHEN `bun run migrate` runs a second time after every migration file has already been applied, the
system SHALL complete successfully without re-executing any previously-applied migration file's SQL.

## R5
IF a single migration file's SQL fails partway through execution THEN the system SHALL NOT record
that file's filename in `schema_migrations`.

## R6
The system SHALL add an `updated_at` column (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`) to `song_files`,
`pedal_catalog`, and `song_pedal_configs` — the three tables that do not already have one (`users` and
`songs` already have `updated_at` from `0001_init.sql` and are not touched).

## R7
The system SHALL add a nullable `deleted_at` column (`TIMESTAMPTZ`, no default) to `users`, `songs`,
`song_files`, `pedal_catalog`, and `song_pedal_configs`, where a `NULL` value means the row has not
been soft-deleted.

## R8
WHEN an existing `song_files` row with `kind = 'preset'` for a given `song_id` has its `deleted_at` set
to a non-`NULL` value, the system SHALL permit inserting a new `song_files` row with `kind = 'preset'`
for that same `song_id`.

## R9
The system SHALL add a `sort_order` column (`INTEGER NOT NULL DEFAULT 0`) to `song_files`, recording a
file's position within a song's signal chain.

## R10
The system SHALL enforce, via a database constraint, that a given `song_id` has at most one
`song_files` row with `kind = 'preset'` AND `deleted_at IS NULL` — i.e. the constraint applies only to
non-soft-deleted rows, so a soft-deleted preset row never blocks inserting its replacement (R8).

## R11
IF an INSERT attempts to add a second non-soft-deleted `song_files` row with `kind = 'preset'` for a
`song_id` that already has one non-soft-deleted `kind = 'preset'` row THEN the system SHALL reject the
insert with a constraint-violation error.

## R12
The system SHALL permit zero or more `song_files` rows of `kind = 'ir'` and, independently, zero or
more of `kind = 'nam'` for the same `song_id`, each with its own `sort_order` value.

## R13
The system SHALL provide a database index on `song_files` covering `(song_id, kind, sort_order)` to
support retrieving a song's files ordered within a kind.

## R14
The system SHALL document, in a dedicated section of `docs/architecture.md`, the decision not to
enforce a maximum count of `ir`/`nam` `song_files` rows per song at the database layer, and SHALL
state that this is distinct from the pedal's own hardware slot capacity (20 IR / 80 NAM), which is a
property of the physical device, not a stored-library limit.
