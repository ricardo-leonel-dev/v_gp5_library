# Requirements — plan_limits_enforcement

Scope note: `users.plan` already exists (`0001_init.sql`, `VARCHAR(50) NOT NULL DEFAULT 'free'`) and is
already carried in the issued JWT (`src/auth/jwt.ts`'s `issueToken(userId, plan)`), but nothing in the
codebase reads it to restrict anything yet — no plan/billing feature has landed, and no route enforces
any cap. This feature adds exactly one enforcement point: a maximum number of live (non-soft-deleted)
`songs` rows a `free`-plan user may own, checked on `POST /songs` (`song_crud_api`, feature 3,
`depends_on`, `done`). Per `song_file_export_import`'s (feature 4) own scope note, there is no separate
"import" endpoint — re-creating a song from an exported bundle already goes through this same
`POST /songs` route — so this one enforcement point covers every way a `songs` row can be created today.
`song_files`, `pedal_catalog`, and `song_pedal_configs` row counts are out of scope: the feature's own
acceptance criteria only ever mention "songs".

Per `docs/conventions.md`'s soft-delete convention, every requirement below that says a user "owns" or
counts a song means a `songs` row with `deleted_at IS NULL`.

## R1
WHEN an authenticated `POST /songs` request's caller has `plan = 'free'`, owns fewer than 10 live
`songs` rows, and the request is otherwise valid, the system SHALL create the song and respond with
HTTP 201.

## R2
IF an authenticated `POST /songs` request's caller has `plan = 'free'` and already owns 10 or more live
`songs` rows THEN the system SHALL respond with HTTP 402 and SHALL NOT create any new `songs` or
`song_files` row.

## R3
WHEN the system rejects a `POST /songs` request per R2, the system SHALL respond with a JSON body whose
`error` field is a string containing both the caller's plan name and the numeral of that plan's song
limit.

## R4
WHERE an authenticated `POST /songs` request's caller has a `plan` value other than `free`, the system
SHALL NOT reject the request on song-count grounds, regardless of how many live songs that caller
already owns.

## R5
The system SHALL count only `songs` rows whose `deleted_at IS NULL` toward a caller's live-song count
when evaluating R1/R2's limit.

## R6
The system SHALL determine the caller's `plan` value used for the R1/R2/R4 checks by querying the
`users` table's current `plan` column for that request, rather than from the `plan` value embedded in
the request's JWT.

## R7
IF the `users` row referenced by an authenticated `POST /songs` request's caller does not exist THEN
the system SHALL respond with HTTP 404 and SHALL NOT create any `songs` or `song_files` row.
