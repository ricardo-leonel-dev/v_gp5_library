# Requirements — pedal_catalog_api

Scope note: `pedal_catalog` is a **shared, in-app reference catalog** of external pedal models — one row
is visible to every logged-in user regardless of who created it, in contrast to `songs`/`song_files`
(always scoped to one owner). This is confirmed by two independent sources: `docs/architecture.md`
principle 5 lists `songs`, `song_files`, and `song_pedal_configs` as the tables that must be filtered by
`user_id` in the service layer — `pedal_catalog` is deliberately **not** in that list — and
`song_pedal_configs_api`'s own feature description (feature 6, `depends_on` this one) describes a
`song_pedal_configs` row as "a user's own knob/button configuration of a shared `pedal_catalog` entry ...
private to the owning user+song even though `pedal_catalog_id` points at a shared row", which only makes
sense if `pedal_catalog` itself has no per-user ownership filter.

The `pedal_catalog` table (`id`, `name`, `reference_image_key`, `created_by`, `created_at`, `updated_at`,
`deleted_at`) already exists — it was created in `0001_init.sql` and given `updated_at`/`deleted_at` in
`0002_audit_columns.sql`, both part of `songs_schema_migrations` (feature 2, `done`). This feature adds
no migration; it is API-only, on top of that already-landed schema.

This feature's acceptance criteria name exactly two routes: `POST /pedals` and `GET /pedals`. Reading
back an uploaded reference image's bytes (a `GET /pedals/:id/image`-shaped route, analogous to how
`song_file_export_import`, feature 4, was split out from `song_crud_api` as its own feature) is out of
scope here — see `design.md`'s "Discarded alternatives" for why this isn't folded in. Likewise, updating
or removing a catalog entry (`PATCH`/`DELETE /pedals/:id`) is not named by this feature's acceptance
criteria and is out of scope; `pedal_catalog.deleted_at` exists in the schema for a future feature to use,
not this one.

`pedal_catalog` carries a `deleted_at` column (per `docs/conventions.md`'s soft-delete convention).
Nothing in this feature's scope ever sets it (no delete route exists yet), but every `SELECT`-style query
this feature adds still filters it per the convention's default-on rule, so a row soft-deleted by some
future mechanism is already excluded correctly.

## R1
WHEN an authenticated `POST /pedals` request includes a `name` field and exactly one `image` file, the
system SHALL create a `pedal_catalog` row with `created_by = c.get('userId')` and `name` set to the
provided value, and SHALL respond with HTTP 201 containing the created pedal.

## R2
IF a `POST /pedals` request omits the `name` field or the field is an empty string THEN the system SHALL
respond with HTTP 400 and SHALL NOT create any `pedal_catalog` row.

## R3
IF a `POST /pedals` request does not include exactly one `image` file (zero, or more than one) THEN the
system SHALL respond with HTTP 400 and SHALL NOT create any `pedal_catalog` row.

## R4
WHEN a `pedal_catalog` row is created for a `POST /pedals` request, the system SHALL persist the
`image` file's bytes via `StorageAdapter.put` under a storage key unique to that row, and SHALL record
that key as the row's `reference_image_key`.

## R5
The system SHALL require a valid, non-expired bearer token, via the existing `requireAuth` middleware on
the `protectedRouter`, for every route this feature adds.

## R6
WHEN `GET /pedals` is requested, the system SHALL respond with HTTP 200 and a JSON array of every
`pedal_catalog` row where `deleted_at IS NULL`, regardless of which user's `created_by` it has.
