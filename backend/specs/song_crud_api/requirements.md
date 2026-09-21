# Requirements — song_crud_api

Scope note: this feature adds `POST /songs`, `GET /songs`, `GET /songs/:id`, and `DELETE /songs/:id` on
top of the schema `songs_schema_migrations` (feature 2) already landed and the `protectedRouter`
`require_auth_middleware_on_all_routes` (feature 1) already built — both are `depends_on` and `done`.
Deep validation of the `name`/`extra_config` fields beyond "present and well-formed" (a size cap on
`extra_config`, for example) is out of scope here and belongs to `song_metadata_and_extra_config`
(feature 7), which `depends_on` this feature. Streaming a file's bytes back out belongs to
`song_file_export_import` (feature 4); this feature only accepts and stores them.

`songs` and `song_files` both carry a `deleted_at` column (added in `0002_audit_columns.sql`), which
`docs/conventions.md`'s soft-delete convention — established specifically so this feature would follow
it from the start — requires: application code never issues a hard `DELETE` against them. Every
requirement below that talks about a song or file being "removed" means its `deleted_at` is set, not a
SQL `DELETE`.

Permanently freeing the disk space a soft-deleted song's files occupy (physically removing their bytes
from `StorageAdapter`) is out of scope for this feature, for the same reason a soft-delete exists at
all: recoverability. `DELETE /songs/:id` here only sets `deleted_at` — the underlying bytes are left
untouched so a soft-deleted song could still be restored. A future purge/hard-delete feature, not this
one, would be the place to actually reclaim that space.

## R1
WHEN an authenticated `POST /songs` request includes a `name` field and exactly one `preset` file, the
system SHALL create a `songs` row owned by `c.get('userId')`, a `song_files` row of `kind = 'preset'`
referencing it, and SHALL respond with HTTP 201 containing the created song and its files.

## R2
IF a `POST /songs` request omits the `name` field or the field is an empty string THEN the system SHALL
respond with HTTP 400 and SHALL NOT create any `songs` or `song_files` row.

## R3
IF a `POST /songs` request does not include exactly one `preset` file THEN the system SHALL respond
with HTTP 400 and SHALL NOT create any `songs` or `song_files` row.

## R4
WHERE a `POST /songs` request includes one or more `ir` files, the system SHALL create one `song_files`
row of `kind = 'ir'` per file, each with a `sort_order` equal to its zero-based position among the `ir`
files in the request.

## R5
WHERE a `POST /songs` request includes one or more `nam` files, the system SHALL create one `song_files`
row of `kind = 'nam'` per file, each with a `sort_order` equal to its zero-based position among the
`nam` files in the request.

## R6
WHERE a `POST /songs` request includes exactly one `cover` file, the system SHALL create one
`song_files` row of `kind = 'cover'` referencing it.

## R7
IF a `POST /songs` request includes more than one `cover` file THEN the system SHALL respond with HTTP
400 and SHALL NOT create any `songs` or `song_files` row.

## R8
WHERE a `POST /songs` request includes an `extra_config` field, the system SHALL parse it as JSON and
store the resulting object as the created song's `extra_config`.

## R9
IF a `POST /songs` request's `extra_config` field is present but is not valid JSON, or does not parse
to a JSON object, THEN the system SHALL respond with HTTP 400 and SHALL NOT create any `songs` or
`song_files` row.

## R10
WHEN a `POST /songs` request omits the `extra_config` field, the system SHALL store an empty JSON
object (`{}`) as the created song's `extra_config`.

## R11
WHERE a `POST /songs` request includes an `artist` and/or `pedal_preset_name` field, the system SHALL
store each provided value on the corresponding column of the created song.

## R12
WHEN a `POST /songs` request omits the `artist` and/or `pedal_preset_name` field, the system SHALL
store NULL for each omitted column.

## R13
WHEN a `song_files` row is created for a `POST /songs` request, the system SHALL persist that file's
bytes via `StorageAdapter.put` under a storage key unique to that row, and SHALL record that key as the
row's `storage_key`.

## R14
The system SHALL require a valid, non-expired bearer token, via the existing `requireAuth` middleware
on the `protectedRouter`, for every route this feature adds.

## R15
WHEN `GET /songs` is requested, the system SHALL respond with HTTP 200 and a JSON array of only the
`songs` rows where `user_id = c.get('userId')` and `deleted_at IS NULL`.

## R16
WHEN `GET /songs/:id` is requested for an existing, non-soft-deleted song owned by the requester, the
system SHALL respond with HTTP 200 with that song's fields and its non-soft-deleted `song_files` rows
ordered by `kind` then `sort_order`.

## R17
IF `GET /songs/:id` is requested for a song that does not exist, is soft-deleted, or is owned by a
different user THEN the system SHALL respond with HTTP 404.

## R18
IF the `:id` path parameter of `GET /songs/:id` or `DELETE /songs/:id` is not a syntactically valid
UUID THEN the system SHALL respond with HTTP 404.

## R19
WHEN `DELETE /songs/:id` is requested for an existing, non-soft-deleted song owned by the requester, the
system SHALL set `deleted_at` on that song's `songs` row and on each of its non-soft-deleted
`song_files` rows, SHALL NOT modify or remove any of those files' underlying bytes in `StorageAdapter`,
and SHALL respond with HTTP 204.

## R20
IF `DELETE /songs/:id` is requested for a song that does not exist, is already soft-deleted, or is
owned by a different user THEN the system SHALL respond with HTTP 404 and SHALL NOT modify any row.
