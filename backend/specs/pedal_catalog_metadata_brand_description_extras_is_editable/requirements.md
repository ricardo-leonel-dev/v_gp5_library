# Requirements — pedal_catalog_metadata_brand_description_extras_is_editable

## Request (verbatim)
Requested by the frontend (pedal catalog create split). Add four fields to the pedal catalog: brand (required string up to 255 characters, trimmed, not blank), description (optional string up to 2000 characters), extras (free-form JSON object, defaults to an empty object, contents not validated yet and not shown in the create form), is_editable (boolean, always true for new pedals). Existing rows need a brand backfill, to be decided in the spec. The pedal create endpoint accepts brand and description. The pedal list returns brand, description, extras, isEditable, and a computed canEdit that is true only when is_editable is true and the pedal is not attached to any song.

Acceptance (from the card):
- Creating a pedal stores brand and description; a missing or blank brand is rejected with 400
- The pedal list returns brand, description, extras, isEditable and canEdit for every pedal
- New pedals start with is_editable true and an empty extras object

## Assumptions
- S1: Existing `pedal_catalog` rows are backfilled with brand `Valeton` (the request says "Existing rows need a brand backfill, to be decided in the spec"; the catalog describes Valeton GP-5 hardware and no seed or migration inserts pedals of another brand). A wrong brand can be corrected later through the follow-up edit endpoint.
- S2: Existing rows also get `is_editable = true`, `extras = {}` and `description = NULL` (the request only says "always true for new pedals" and "defaults to an empty object").
- S3: `POST /pedals` stays multipart; `brand` and `description` are two more text parts next to `name`, `image` and `parameters` (the request says "The pedal create endpoint accepts brand and description"; feature 24 made the endpoint multipart only).
- S4: Description is trimmed too, and an absent, empty or whitespace-only description is stored as `NULL` (the request says "optional string up to 2000 characters" and only says "trimmed" for brand).
- S5: Lengths are counted in characters (Unicode code points, like Postgres `VARCHAR(n)`), after trimming (the request says "up to 255 characters" / "up to 2000 characters").
- S6: `extras` and `is_editable` sent by the client on create are ignored, not rejected (the request says extras is "not shown in the create form" and is_editable is "always true for new pedals").
- S7: `extras` must be a JSON object at the database level (a `CHECK`), but its keys and values are not validated (the request says "free-form JSON object ... contents not validated yet").
- S8: "Attached to any song" means at least one live `song_pedal_configs` row (`deleted_at IS NULL`) for that pedal whose song is also live, from any user (the request says "not attached to any song"; deleting a song soft-deletes the song but not its pedal configs, so a config on a deleted song must not lock the pedal forever; the catalog is shared, so another user's attachment counts).
- S9: The `POST /pedals` 201 response returns the same five new fields as the list (the request only names the list; returning one pedal shape from both endpoints keeps the frontend DTO single).
- S10: The follow-up edit endpoint (`PATCH /pedals/:id`, 409 when locked/attached) and the admin lock endpoint are out of scope; this spec only makes the "attached" check reusable for them (design.md).

## R1 — New catalog columns
The system SHALL store four new columns on `pedal_catalog` with these types and constraints.

| Case | Column | Expected |
|---|---|---|
| a | `brand` | `character varying(255)`, NOT NULL, no default |
| b | `description` | `character varying(2000)`, nullable, no default |
| c | `extras` | `jsonb`, NOT NULL, default `'{}'::jsonb`; a raw insert with `extras = '[]'` or `'"x"'` is rejected (CHECK) |
| d | `is_editable` | `boolean`, NOT NULL, default `true` |
| e | raw insert with only `name` and `brand` | row reads `description NULL`, `extras {}`, `is_editable true` |
| f | raw insert without `brand` | rejected (not-null violation) |

## R2 — Brand backfill for existing rows
WHEN migration `0010` runs on a database with `pedal_catalog` rows that predate it, the system SHALL set every such row's `brand` to `Valeton`, `is_editable` to `true`, `extras` to `{}`, and leave `description` `NULL`, and re-running the migration SHALL NOT fail or change any row.

| Case | Situation | Expected |
|---|---|---|
| a | live row created before `0010` | `brand = 'Valeton'`, `is_editable = true`, `extras = {}`, `description NULL` |
| b | soft-deleted row created before `0010` | same as a (the column is NOT NULL for every row) |
| c | `0010` SQL executed again on a migrated database | no error; a row with brand `Boss` keeps `Boss` |

## R3 — Valid brand on create
WHEN an authenticated `POST /pedals` request is received, the system SHALL require a `brand` text part, trim it, store the trimmed value, and IF it is invalid THEN respond 400 `{ error }` without creating a `pedal_catalog` row and without writing the image to storage.

| Case | `brand` part | Expected |
|---|---|---|
| a | absent | 400 `brand is required` |
| b | `""` | 400 `brand is required` |
| c | `"   "` | 400 `brand is required` |
| d | sent twice, or sent as a file | 400 `brand is required` |
| e | 256 characters after trim | 400 `brand must be at most 255 characters` |
| f | `"  Boss  "` | 201, stored and returned `"Boss"` |
| g | 255 characters, including non-ASCII (e.g. `"é"` x 255) | 201, stored unchanged |

## R4 — Optional description on create
WHEN an authenticated `POST /pedals` request is received, the system SHALL accept an optional `description` text part, trim it, store `NULL` when it is absent or blank, and IF it exceeds 2000 characters after trim THEN respond 400 `{ error }` without creating a row and without writing the image to storage.

| Case | `description` part | Expected |
|---|---|---|
| a | absent | 201, `description: null` |
| b | `""` or `"   "` | 201, `description: null` |
| c | `"  Classic overdrive  "` | 201, `description: "Classic overdrive"` |
| d | 2000 characters after trim | 201, stored unchanged |
| e | 2001 characters after trim | 400 `description must be at most 2000 characters` |
| f | sent twice, or sent as a file | 400 `description must be a single text field` |

## R5 — New pedal defaults
WHEN a pedal is created through `POST /pedals`, the system SHALL store `is_editable = true` and `extras = {}`, ignoring any `is_editable`, `isEditable` or `extras` part the client sends.

| Case | Extra parts sent | Stored / returned |
|---|---|---|
| a | none | `isEditable: true`, `extras: {}` |
| b | `is_editable=false`, `isEditable=false`, `extras={"a":1}` | `isEditable: true`, `extras: {}` (201, not 400) |

## R6 — Pedal response shape
The system SHALL include `brand` (string), `description` (string or `null`), `extras` (object), `isEditable` (boolean) and `canEdit` (boolean) on every pedal returned by `POST /pedals` (201) and `GET /pedals`, alongside the existing fields, and SHALL NOT expose snake_case keys for them.

| Case | Endpoint | Expected |
|---|---|---|
| a | `POST /pedals` 201 | the five fields present with the stored values; `canEdit: true` |
| b | `GET /pedals`, a pedal created through the API | the five fields present with the stored values |
| c | `GET /pedals`, a backfilled legacy row | `brand: "Valeton"`, `description: null`, `extras: {}`, `isEditable: true` |
| d | either endpoint | no `is_editable`, `can_edit` or `reference_image_key` key |

## R7 — canEdit
The system SHALL compute each pedal's `canEdit` as `true` only WHILE its `is_editable` is `true` and it is not attached to any song (a live `song_pedal_configs` row on a live song, from any user), within the same database query that lists the pedals (no extra query per pedal).

| Case | Pedal state | `canEdit` |
|---|---|---|
| a | `is_editable = true`, no `song_pedal_configs` row | `true` |
| b | `is_editable = true`, one live config on a live song of the caller | `false` |
| c | `is_editable = true`, one live config on a live song of another user | `false` |
| d | `is_editable = true`, only soft-deleted configs | `true` |
| e | `is_editable = true`, live config only on a soft-deleted song | `true` |
| f | `is_editable = false` (set with raw SQL), no configs | `false` |
| g | `is_editable = false`, attached | `false` |

## P1 — Existing create validation and list behavior unchanged
`POST /pedals` keeps its existing name, image type and `parameters` checks and status codes, and `GET /pedals` keeps excluding soft-deleted pedals and ordering by `created_at DESC` (existing tests in `src/pedals/pedal-service.test.ts` and `src/index.test.ts` keep passing; test only).

## P2 — Attaching a pedal to a song unchanged
`POST /songs/:id/pedals` still attaches any live catalog pedal, whatever its `is_editable` or `canEdit` (existing tests in `src/song-pedal-configs/song-pedal-config-service.test.ts` keep passing; test only).
