# Requirements — add_replace_and_delete_a_preset_in_an_existing_song

## Scope note

Today a song's presets can only be set when the song is created (`POST /songs`, feature 15). This feature
adds three protected endpoints that change the presets of an **existing** song:

- `POST /songs/:id/presets` — add one preset at the end.
- `PUT /songs/:id/presets/:sortOrder` — replace the file of one preset, keeping its position and id.
- `DELETE /songs/:id/presets/:sortOrder` — remove one preset and close the gap.

The contract comes from the frontend spec `song_preset_duplicate_edit_export/design.md` §5 (frontend F27
consumes only `POST`; `PUT` and `DELETE` are built and tested here for later features).

Terms used below:
- **The three endpoints**: the three routes listed above.
- **Owned live song**: a `songs` row with `deleted_at IS NULL` whose `user_id` is the caller's id from the
  verified JWT.
- **Preset row**: a `song_files` row with `kind = 'preset'` and `deleted_at IS NULL` (feature 15 glossary).
- **Preset part**: a multipart part named `preset` whose value is a file (a `preset` part sent as a plain
  string is not a preset part).
- **Readable name**: a non-`null` result of `readPresetName` (`src/songs/prst-name.ts`, feature 15 R7–R11).
- **Valid .prst size**: a preset part whose byte length is exactly `507` (`PRST_BYTE_SIZE`, the GP-5 `.prst`
  file size).
- **Valid .prst**: a preset part that has a valid .prst size AND a readable name. On the add and replace
  endpoints the size is checked first, then the name (R40).
- **Well-formed sortOrder**: a `:sortOrder` path segment matching `^\d+$` whose numeric value is at most
  `2147483647` (the `INTEGER` maximum of `song_files.sort_order`).
- **Caller's plan / presetsPerSong limit**: `users.plan` read during the request and
  `PLAN_LIMITS[plan].presetsPerSong` from `src/plans/plan-service.ts` (feature 14); `null` is unlimited.
- **Preset-limit rejection**: HTTP 402 with a JSON body whose `code` is `"plan_preset_limit"` (feature 14).
- **Nothing changed**: no `song_files` row inserted or updated, no `songs` row updated and no
  `StorageAdapter.put` or `StorageAdapter.delete` call.

Out of scope: reordering presets, renaming a preset without a new file, adding/replacing several presets in one
request, enforcing name uniqueness in `POST /songs`, and any change to `GET /songs/:id/files/preset`.
`POST /songs` keeps its current preset validation (readable name only, no 507-byte size check, feature 15
design "Deliberately not checked"); the size check of R39 applies only to `POST /songs/:id/presets` and
`PUT /songs/:id/presets/:sortOrder`.

## Common rules (all three endpoints)

## R1
IF any of the three endpoints is requested without a valid Bearer token THEN the system SHALL respond with
HTTP 401.

## R2
IF an authenticated request to any of the three endpoints has an `:id` that is not a UUID or that does not
identify an owned live song THEN the system SHALL respond with HTTP 404 and nothing changed.

## R3
IF an authenticated `PUT` or `DELETE` request has a `:sortOrder` that is not a well-formed sortOrder THEN
the system SHALL respond with HTTP 404 and nothing changed.

## R4
IF an authenticated `PUT` or `DELETE` request targets an owned live song that has no preset row whose
`sort_order` equals the well-formed `:sortOrder` THEN the system SHALL respond with HTTP 404 and nothing
changed.

## R5
WHEN any of the three endpoints responds with HTTP 400, 404 or 409, the system SHALL return a JSON body
whose only key is `error` with a non-empty string value.

## R6
WHEN an add or a replace succeeds, the system SHALL leave every `song_files` row of that song other than
the added or replaced preset row unchanged.

## R7
WHEN an add, a replace or a delete succeeds, the system SHALL set the song's `songs.updated_at` to a value
later than its value before the request.

## R8
IF an authenticated request uses `GET` or `PATCH` on `/songs/:id/presets` or `/songs/:id/presets/:sortOrder`
THEN the system SHALL respond with HTTP 404 and nothing changed.

## Add a preset (`POST /songs/:id/presets`)

## R9
WHEN an authenticated `POST /songs/:id/presets` request targets an owned live song, contains exactly one
preset part that is a valid .prst, is within the caller's presetsPerSong limit and duplicates no preset name
of the song, the system SHALL create one preset row and respond with HTTP 201 and a JSON body with exactly
the keys `id`, `sortOrder`, `name`, `originalFilename`, `mimeType`, `byteSize` and `createdAt`.

## R10
WHEN an add succeeds, the system SHALL set the new preset row's `sort_order` to one more than the highest
`sort_order` among the song's preset rows before the request.

## R11
WHEN an add succeeds, the system SHALL set the new row's `pedal_preset_name` and the response's `name` to
the result of `readPresetName` on the uploaded bytes.

## R12
WHEN an add succeeds, the system SHALL set `originalFilename`, `mimeType` and `byteSize` (row and response)
to the preset part's filename, its content type (`application/octet-stream` when empty) and its byte length.

## R13
WHEN an add succeeds, the system SHALL serve the uploaded bytes byte-for-byte from
`GET /songs/:id/files/preset?sort_order=<new sortOrder>`.

## R14
IF a `POST /songs/:id/presets` request contains zero preset parts THEN the system SHALL respond with HTTP
400 and nothing changed.

## R15
IF a `POST /songs/:id/presets` request contains more than one preset part THEN the system SHALL respond
with HTTP 400 and nothing changed.

## R16
IF the preset part of a `POST /songs/:id/presets` request has a valid .prst size and no readable name THEN the system SHALL
respond with HTTP 400 and nothing changed.

## R17
IF the caller's presetsPerSong limit is not `null` and the song already holds that many or more preset rows
THEN the system SHALL respond to an otherwise valid `POST /songs/:id/presets` with a preset-limit rejection
and nothing changed.

## R18
WHEN `POST /songs/:id/presets` responds with a preset-limit rejection, the system SHALL return a JSON body
with exactly the keys `error` (non-empty string), `code` (`"plan_preset_limit"`), `plan` (the caller's plan)
and `limit` (the caller's presetsPerSong limit).

## R19
WHILE the caller's plan is `premium`, the system SHALL accept an otherwise valid `POST /songs/:id/presets`
on a song holding 3 preset rows with HTTP 201.

## R20
IF the readable name of the uploaded preset is equal (exact, case-sensitive string comparison) to the
`pedal_preset_name` of a preset row of the song THEN the system SHALL respond to an otherwise valid
`POST /songs/:id/presets` with HTTP 409 and nothing changed.

## R21
IF a `POST /songs/:id/presets` request would get both a preset-limit rejection and an HTTP 409 THEN the
system SHALL respond with the preset-limit rejection.

## R22
IF a `POST /songs/:id/presets` request fails R14, R15, R16 or R39 while the song is also at the caller's
presetsPerSong limit THEN the system SHALL respond with HTTP 400.

## R23
WHEN two otherwise valid `POST /songs/:id/presets` requests with different preset names run concurrently
against the same song of a `premium` caller, the system SHALL respond to both with HTTP 201 and two
different `sortOrder` values.

## Replace a preset (`PUT /songs/:id/presets/:sortOrder`)

## R24
WHEN an authenticated `PUT /songs/:id/presets/:sortOrder` request targets an existing preset row of an owned
live song, contains exactly one preset part that is a valid .prst and duplicates no other preset's name, the
system SHALL respond with HTTP 200 and the R9 body whose `id`, `sortOrder` and `createdAt` equal the
targeted row's values before the request.

## R25
WHEN a replace succeeds, the system SHALL serve the newly uploaded bytes byte-for-byte from
`GET /songs/:id/files/preset?sort_order=<sortOrder>`.

## R26
WHEN a replace succeeds, the system SHALL set the row's `pedal_preset_name`, `original_filename`,
`mime_type` and `byte_size` (and the response's `name`, `originalFilename`, `mimeType`, `byteSize`) from the
new preset part, using the R11 and R12 rules.

## R27
IF a `PUT /songs/:id/presets/:sortOrder` request matches the condition of R14, R15, R16 or R39 THEN the system
SHALL respond with HTTP 400 and nothing changed.

## R28
IF the readable name of a `PUT` upload is equal (exact, case-sensitive) to the `pedal_preset_name` of a
preset row of the song other than the targeted row THEN the system SHALL respond with HTTP 409 and nothing
changed.

## R29
WHEN the readable name of a `PUT` upload equals the targeted row's own current `pedal_preset_name`, the
system SHALL complete the replace with HTTP 200.

## R30
WHILE a song holds as many or more preset rows than the caller's presetsPerSong limit, the system SHALL
complete an otherwise valid replace on that song with HTTP 200.

## R31
WHEN a replace has been committed, the system SHALL call `StorageAdapter.delete` with the replaced row's
previous storage key.

## R32
IF the `StorageAdapter.delete` call of R31 throws THEN the system SHALL still respond with HTTP 200 and the
replaced preset.

## Delete a preset (`DELETE /songs/:id/presets/:sortOrder`)

## R33
WHEN an authenticated `DELETE /songs/:id/presets/:sortOrder` request targets an existing preset row of an
owned live song that holds two or more preset rows, the system SHALL respond with HTTP 204 and an empty
body.

## R34
WHEN a delete succeeds, the system SHALL soft-delete the targeted row, leaving it present in `song_files`
with a non-`NULL` `deleted_at`.

## R35
WHEN a delete succeeds, the system SHALL decrease by 1 the `sort_order` of every preset row of the song
whose `sort_order` was greater than the deleted row's, so the song's preset rows have `sort_order` values
exactly `0..n-1`.

## R36
WHEN a delete succeeds, the system SHALL leave unchanged every non-preset `song_files` row of the song and
every preset row whose `sort_order` was lower than the deleted row's.

## R37
IF a `DELETE /songs/:id/presets/:sortOrder` request targets the song's only preset row THEN the system
SHALL respond with HTTP 409 and nothing changed.

## R38
WHEN a delete succeeds, the system SHALL make no `StorageAdapter.delete` call.

## `.prst` size check (add and replace)

## R39
IF the preset part of a `POST /songs/:id/presets` request has a byte length other than 507 THEN the system
SHALL respond with HTTP 400 and nothing changed.

## R40
IF the single preset part of a `POST /songs/:id/presets` or `PUT /songs/:id/presets/:sortOrder` request has
a byte length other than 507 and no readable name THEN the system SHALL respond with HTTP 400 and the body
`{"error": "preset file must be exactly 507 bytes"}`.
