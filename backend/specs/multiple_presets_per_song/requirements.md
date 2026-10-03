# Requirements — multiple_presets_per_song

Scope note: today a song owns **exactly one** preset, and the preset's name is a client-supplied,
song-level `songs.pedal_preset_name` value. This feature changes both:

- A song owns an ordered set of **1..N presets**. Each preset is an independent byte copy, stored as its
  own `song_files` row of `kind = 'preset'`. Its position is the existing `song_files.sort_order`.
- Each preset's **name is read by the backend from the uploaded `.prst` bytes**. The client never sends
  it. The name is reference-only metadata: it is never used to link to the pedal or to detect changes.
- The song-level `songs.pedal_preset_name` column and the `pedal_preset_name` form field are removed.
  There is no stored production data, so there is no back-compat and no backfill.
- **No slot data is stored anywhere.**

Glossary used below:
- **N**: the number of `preset` file parts in a `POST /songs` request.
- **Preset row**: a `song_files` row with `kind = 'preset'` and `deleted_at IS NULL` (soft-delete rule
  from `docs/conventions.md`).
- **Migration 0004**: the new file `src/db/migrations/0004_multiple_presets_per_song.sql`.
- **`readPresetName`**: the new pure function that extracts the GP-5 preset name from `.prst` bytes
  (`design.md`, "Preset name parsing"). Offsets below are byte offsets from the start of the file.
- **Readable name**: the result of `readPresetName` when it is not `null`.

Out of scope: any endpoint that adds, replaces, reorders, renames, duplicates or removes presets of an
existing song (a future "duplicate/edit a preset in a song" feature may add one). Also out of scope: any
per-song preset limit, which belongs to feature 14 (`plan_tiers_songs_and_presets_per_song_limits`,
which `depends_on` this feature). This feature sets no upper bound on N.

## Schema and migration

## R1
WHEN migration 0004 has been applied, the system SHALL have no `pedal_preset_name` column on the `songs`
table.

## R2
WHEN migration 0004 has been applied, the system SHALL have a nullable `song_files.pedal_preset_name`
column of type `VARCHAR(255)` with no default.

## R3
WHEN the SQL of migration 0004 is executed again against a database where it has already been applied,
the system SHALL complete without error.

## R4
WHEN two `kind = 'preset'` `song_files` rows with `deleted_at IS NULL` are inserted for the same
`song_id` with different `sort_order` values, the system SHALL accept both inserts.

## R5
IF an INSERT adds a `kind = 'preset'` `song_files` row with `deleted_at IS NULL` whose
(`song_id`, `sort_order`) matches an existing `kind = 'preset'` row with `deleted_at IS NULL` THEN the
system SHALL reject the INSERT with a database error.

## R6
IF an INSERT or UPDATE sets a non-`NULL` `pedal_preset_name` on a `song_files` row whose `kind` is not
`'preset'` THEN the system SHALL reject the statement with a database error.

## Preset name parsing (`readPresetName`)

## R7
WHEN `readPresetName` is given bytes that are at least 41 (`0x29`) bytes long, start with the ASCII bytes
`GP-5`, and to which neither R10 nor R11 applies, the system SHALL return the ASCII string formed by the bytes from offset `0x19`
up to, but not including, the first `0x00` byte or offset `0x29`, whichever comes first.

## R8
IF `readPresetName` is given fewer than 41 bytes THEN the system SHALL return `null`.

## R9
IF the first 4 bytes given to `readPresetName` are not the ASCII bytes `GP-5` (`0x47 0x50 0x2D 0x35`)
THEN the system SHALL return `null`.

## R10
IF the name `readPresetName` would return under R7 is empty or consists only of space (`0x20`)
characters THEN the system SHALL return `null`.

## R11
IF any byte of the name `readPresetName` would return under R7 is outside the printable ASCII range
`0x20`–`0x7E` THEN the system SHALL return `null`.

## Creating a song with 1..N presets (`POST /songs`)

## R12
WHEN an authenticated `POST /songs` request is otherwise valid and includes N >= 1 `preset` file parts
that all have a readable name, the system SHALL create exactly N preset rows for the new song and respond
with HTTP 201.

## R13
WHEN `POST /songs` creates preset rows, the system SHALL set each row's `sort_order` to the zero-based
position of its file part among the request's `preset` parts, in the order the parts were sent.

## R14
WHEN `POST /songs` creates N preset rows, the system SHALL store each preset's bytes via
`StorageAdapter.put` under a storage key that no other of the new preset rows shares, including when two
presets have identical bytes.

## R15
WHEN `POST /songs` creates a preset row, the system SHALL set that row's `pedal_preset_name` to the
result of `readPresetName` on that preset's uploaded bytes.

## R16
IF a `POST /songs` request includes zero `preset` file parts THEN the system SHALL respond with HTTP 400
without creating any `songs` row, `song_files` row or `StorageAdapter` object.

## R17
IF any `preset` file part of a `POST /songs` request has no readable name (`readPresetName` returns
`null`) THEN the system SHALL respond with HTTP 400 without creating any `songs` row, `song_files` row
or `StorageAdapter` object.

## R18
WHEN a `POST /songs` request includes one or more `pedal_preset_name` parts, the system SHALL ignore
them, producing the same stored rows and response body it produces for the same request without those
parts.

## Reading songs (DTO, `GET /songs`, `GET /songs/:id`)

## R19
The system SHALL include a `presets` array in every song object returned by `POST /songs` (201),
`GET /songs` (each element) and `GET /songs/:id`, containing exactly one element per preset row of that
song.

## R20
The system SHALL order each song's `presets` array by `sortOrder` ascending.

## R21
The system SHALL give every `presets` element exactly the fields `id`, `sortOrder`, `name`,
`originalFilename`, `mimeType`, `byteSize` and `createdAt`, whose values come from the corresponding
preset row (`name` from `song_files.pedal_preset_name`).

## R22
IF a song's `kind = 'preset'` `song_files` row has a non-`NULL` `deleted_at` THEN the system SHALL omit
that row from the song's `presets` array.

## R23
The system SHALL exclude every `kind = 'preset'` row from the `files` array returned by `POST /songs`
(201) and `GET /songs/:id`.

## R24
The system SHALL include every non-soft-deleted `ir`, `nam` and `cover` row of the song in the `files`
array returned by `POST /songs` (201) and `GET /songs/:id`.

## R25
The system SHALL omit the `pedalPresetName` property from every song object returned by `POST /songs`,
`GET /songs` and `GET /songs/:id`.

## Exporting a preset (`GET /songs/:id/files/preset`)

## R26
WHEN an authenticated `GET /songs/:id/files/preset?sort_order=n` request targets an owned, live song
that has a preset row with `sort_order = n`, the system SHALL respond with HTTP 200 whose body is
byte-for-byte identical to that preset's uploaded bytes.

## R27
WHEN an authenticated `GET /songs/:id/files/preset` request omits the `sort_order` query parameter and
targets an owned, live song, the system SHALL respond with the bytes of that song's preset row with
`sort_order = 0`.

## R28
IF an authenticated `GET /songs/:id/files/preset?sort_order=n` request targets an owned, live song that
has no preset row with `sort_order = n` (for example n >= N) THEN the system SHALL respond with HTTP 404.

## No mutation of an existing song's presets

## R29
IF an authenticated request uses `PUT` or `PATCH` on `/songs/:id`, or uses `POST`, `PUT`, `PATCH` or
`DELETE` on `/songs/:id/files/preset` THEN the system SHALL respond with HTTP 404.

## Plan limits unchanged

## R30
WHEN an authenticated `free`-plan caller who owns 9 live songs sends an otherwise valid `POST /songs`
with 3 `preset` file parts, the system SHALL create the song and respond with HTTP 201.
