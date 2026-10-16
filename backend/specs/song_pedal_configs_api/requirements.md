# Requirements — song_pedal_configs_api

Scope note: this feature adds `POST /songs/:id/pedals`, `GET /songs/:id/pedals`, and `DELETE
/songs/:id/pedals/:configId` on top of the `song_pedal_configs` table `songs_schema_migrations`
(feature 2, `done`) already created and the `songs` (`song_crud_api`, feature 3, `done`) / `pedal_catalog`
(`pedal_catalog_api`, feature 5, `done`) tables those routes reference — all three are `depends_on` and
`done`. This feature adds no migration; it is API-only, on top of already-landed schema (`id`, `song_id`,
`user_id`, `pedal_catalog_id`, `label`, `config`, `created_at`, `updated_at`, `deleted_at` — see
`0001_init.sql`/`0002_audit_columns.sql`).

Scope note on ownership: a `song_pedal_configs` row records **one user's own** knob/button configuration
of a shared `pedal_catalog` entry, for **one specific song** — private to the owning user+song even
though `pedal_catalog_id` points at a row every logged-in user can see (`pedal_catalog_api`'s own
requirements.md documents `pedal_catalog` as the deliberate exception to `docs/architecture.md`
principle 5's per-user filtering; `song_pedal_configs` is explicitly back in that list). Every route this
feature adds is scoped by both the `:id` song (which itself has exactly one owner) and, redundantly, by
`user_id = c.get('userId')` in the query itself — the second filter is defense in depth per principle 5,
not strictly implied by the first alone.

Scope note on `pedal_catalog_id` validation: `POST /songs/:id/pedals` accepts `pedal_catalog_id` as a
request body field, not a path parameter. An invalid or non-existent value is therefore treated as
malformed input (HTTP 400), the same category as a missing/empty `label` — not as a "resource not found"
(HTTP 404), which this feature reserves for the `:id`/`:configId` path parameters identifying the
route's own primary resources. See `design.md`'s "Discarded alternatives" for the rejected 404
alternative.

`song_pedal_configs` carries a `deleted_at` column (per `docs/conventions.md`'s soft-delete convention).
`DELETE /songs/:id/pedals/:configId` sets it rather than issuing a hard `DELETE`; every `SELECT`-style
query this feature adds filters `deleted_at IS NULL`.

Updating an existing `song_pedal_configs` row's `label`/`config` (a `PATCH` route) is not named by this
feature's acceptance criteria and is out of scope; the existing row must be deleted and a new one created
to change one.

## R1
WHEN an authenticated `POST /songs/:id/pedals` request is made for a song identified by `:id` that
exists, is not soft-deleted, and is owned by the requester, with a `label` field and a `pedal_catalog_id`
field referencing an existing, non-soft-deleted `pedal_catalog` row, the system SHALL create a
`song_pedal_configs` row with `song_id = :id`, `user_id = c.get('userId')`, the given `pedal_catalog_id`
and `label`, and SHALL respond with HTTP 201 containing the created row.

## R2
IF the `:id` path parameter of any route this feature adds, or the `:configId` path parameter of `DELETE
/songs/:id/pedals/:configId`, is not a syntactically valid UUID THEN the system SHALL respond with HTTP
404.

## R3
IF `POST /songs/:id/pedals` is requested for a song that does not exist, is soft-deleted, or is owned by
a different user THEN the system SHALL respond with HTTP 404 and SHALL NOT create any
`song_pedal_configs` row.

## R4
IF a `POST /songs/:id/pedals` request omits the `label` field or the field is an empty string THEN the
system SHALL respond with HTTP 400 and SHALL NOT create any `song_pedal_configs` row.

## R5
IF a `POST /songs/:id/pedals` request omits the `pedal_catalog_id` field, or the field does not reference
an existing, non-soft-deleted `pedal_catalog` row, THEN the system SHALL respond with HTTP 400 and SHALL
NOT create any `song_pedal_configs` row.

## R6
WHERE a `POST /songs/:id/pedals` request's `config` field is present and is a JSON object, the system
SHALL store it as the created row's `config`.

## R7
IF a `POST /songs/:id/pedals` request's `config` field is present and is not a JSON object (a string,
number, boolean, array, or `null`) THEN the system SHALL respond with HTTP 400 and SHALL NOT create any
`song_pedal_configs` row.

## R8
WHEN a `POST /songs/:id/pedals` request omits the `config` field, the system SHALL store an empty JSON
object (`{}`) as the created row's `config`.

## R9
The system SHALL require a valid, non-expired bearer token, via the existing `requireAuth` middleware on
the `protectedRouter`, for every route this feature adds.

## R10
WHEN `GET /songs/:id/pedals` is requested for a song identified by `:id` that exists, is not
soft-deleted, and is owned by the requester, the system SHALL respond with HTTP 200 with a JSON array of
that song's `song_pedal_configs` rows where `user_id = c.get('userId')` and `deleted_at IS NULL`.

## R11
IF `GET /songs/:id/pedals` is requested for a song that does not exist, is soft-deleted, or is owned by a
different user THEN the system SHALL respond with HTTP 404.

## R12
WHEN `DELETE /songs/:id/pedals/:configId` is requested for a `song_pedal_configs` row identified by
`:configId` that exists, is not soft-deleted, belongs to the song identified by `:id`, and is owned by
the requester, the system SHALL set `deleted_at` on that row and SHALL respond with HTTP 204.

## R13
IF `DELETE /songs/:id/pedals/:configId` is requested and the song identified by `:id` does not exist, is
soft-deleted, or is owned by a different user, or the `song_pedal_configs` row identified by `:configId`
does not exist, is already soft-deleted, does not belong to that song, or is owned by a different user,
THEN the system SHALL respond with HTTP 404 and SHALL NOT modify any row.
