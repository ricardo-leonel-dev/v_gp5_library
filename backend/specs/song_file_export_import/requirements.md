# Requirements — song_file_export_import

Scope note: this feature adds exactly one route, `GET /songs/:id/files/:kind`, on top of
`song_crud_api` (feature 3, `depends_on`, `done`), which already accepts and stores file bytes via
`StorageAdapter` but never streams them back out. "Import" (re-creating a song from a previously
exported file) is not a separate endpoint in this feature — the existing `POST /songs` multipart
upload (`song_crud_api`) already *is* the import path; a client "imports" a song by re-uploading the
bytes this feature exports. This feature is the read/export half only.

A song can have more than one non-soft-deleted `song_files` row of kind `ir` or `nam` (`0001_init.sql`'s
own comment: up to 20 IR / 80 NAM captures per the GP-5 hardware; see also `docs/architecture.md`'s
"Open question... multiplicity of `ir`/`nam` rows"), so `:kind` alone cannot always identify a single
row. Every requirement below that talks about "the matching `song_files` row" resolves it as: the
non-soft-deleted `song_files` row of the requested song and `:kind` whose `sort_order` column equals
the **effective sort order** — the integer value of a `sort_order` query parameter if one is present and
parses as a non-negative integer, otherwise `0`. This covers `preset`/`cover` (always `sort_order = 0`,
per `song_crud_api`'s R1/R6) with no query parameter needed, and lets a caller reach any `ir`/`nam` row
by its own `sort_order` (see `design.md`'s "Discarded alternatives" for why this was chosen over a
file-id-based route).

`songs` and `song_files` both carry a `deleted_at` column; per `docs/conventions.md`'s soft-delete
convention, every requirement below that says a song or file "exists" means its `deleted_at IS NULL`.

## R1
WHEN an authenticated `GET /songs/:id/files/:kind` request (no `sort_order` query parameter) targets an
existing song owned by `c.get('userId')`, `:kind` is one of `preset`, `ir`, `nam`, `cover`, and that song
has a matching `song_files` row with `sort_order = 0`, the system SHALL respond with HTTP 200 whose body
is byte-for-byte identical to that row's originally stored bytes.

## R2
WHERE a `GET /songs/:id/files/:kind` request includes a `sort_order` query parameter that parses as a
non-negative integer, the system SHALL respond with HTTP 200 whose body is byte-for-byte identical to
the originally stored bytes of the matching `song_files` row whose `sort_order` column equals that
integer, instead of the default `0`.

## R3
The system SHALL set the `Content-Type` header of every HTTP 200 response from `GET
/songs/:id/files/:kind` to the served `song_files` row's stored `mime_type`.

## R4
The system SHALL set the `Content-Disposition` header of every HTTP 200 response from `GET
/songs/:id/files/:kind` to `attachment; filename="<original_filename>"`, using the served `song_files`
row's stored `original_filename`.

## R5
IF the `:id` path parameter of `GET /songs/:id/files/:kind` is not a syntactically valid UUID THEN the
system SHALL respond with HTTP 404.

## R6
IF `GET /songs/:id/files/:kind` is requested for a song that does not exist, is soft-deleted, or is
owned by a different user THEN the system SHALL respond with HTTP 404.

## R7
IF the `:kind` path parameter of `GET /songs/:id/files/:kind` is not one of `preset`, `ir`, `nam`,
`cover` THEN the system SHALL respond with HTTP 404.

## R8
IF the requested song has no matching `song_files` row (as defined by the effective sort order in the
scope note above) for the requested `:kind` THEN the system SHALL respond with HTTP 404.

## R9
IF a `GET /songs/:id/files/:kind` request's `sort_order` query parameter is present but is not a valid
non-negative integer THEN the system SHALL respond with HTTP 404.

## R10
The system SHALL require a valid, non-expired bearer token, via the existing `requireAuth` middleware on
the `protectedRouter`, for `GET /songs/:id/files/:kind`.

## R11
IF a matched `song_files` row's bytes cannot be read back from `StorageAdapter` (i.e. `storage.get`
returns `null`) THEN the system SHALL let the resulting error propagate uncaught rather than respond
with HTTP 404.
