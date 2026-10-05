# Requirements — `save_preset_dialog` (feature 4)

Create a **song** in the backend library (`POST /songs`) from an **ordered list of 1..N presets** chosen by the
user, each added either **from the pedal** (presets read over MIDI) or **from a `.prst` file** (e.g. a commercial
ToneLab preset). Each preset is uploaded as its own `.prst` file and stored as an independent byte copy; the
backend derives each preset's **reference-only** name from the uploaded bytes (Revision 5: no name field is sent;
no pedal slot is sent or stored — Revision 4: a preset can be installed in any slot, any number of times, so its
origin slot is not relevant data). The song also carries a
name, an optional artist, an optional cover image, an optional key/value extra config, and optional IR / NAM files
prompted by the User IR / User SnapTone slots its presets use. Mock presets open the same dialog in a "test mode"
that never contacts the backend.

**Success criterion (Revision 3):** every uploaded `.prst` is a valid, installable GP-5 file. For pedal presets
this is guaranteed by embedding the 466-byte body exactly as the pedal returned it (never re-encoded); for file
presets by strict validation of the file and uploading its bytes unchanged.

Ground truth: `progress/f4_brief.md`, in particular its last two sections **"Revision 4 — 2026-10-02"** (drops
`pedal_slot`, accepts OQ6-OQ8) and **"Revision 3 — 2026-10-02"** (binding; override any earlier conflicting
point), on top of "Revision 2" (song data model). Contract sources: backend
Notion cards `multiple_presets_per_song_with_per_preset_reference_metadata` and
`plan_tiers_songs_and_presets_per_song_limits` (both quoted in `design.md` §0). Evidence:
`progress/explore_f4_frontend.md`, `progress/explore_f4_backend_contract.md`.

**Revision 5 — 2026-10-05 (contract alignment with the finished backend; `progress/f4_rev5_backend_contract.md`):**
`GET /me/plan` has the nested shape `{plan, limits:{songs, presetsPerSong}, usage:{songs}}` (OQ6, R53, R59);
`pedal_preset_name` is no longer sent — the backend reads each name from the `.prst` bytes (R85 withdrawn and
replaced by a "SHALL NOT contain" requirement); the 400 string for a missing preset is now `at least one preset
file is required` (R98) and the new `preset file at position ${i} has no readable GP-5 preset name` is mapped
(R108); R104 excludes R108. Revision 5 also closes the gap between the frontend's `.prst` name decoding and the
backend's stricter `readPresetName`: R109-R113 mirror the backend rule in one pure helper and R114-R118 make the
dialog reject, at add/pick time and at submit, any preset whose name the backend would reject (R108 remains the
server-side fallback). No other requirement changed.

## Cross-project dependencies (both `done` as of Revision 5)

Backend project: `/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend` (main checkout, branch
`dev`, verified at commit `04eda42`).

1. R79 needs backend feature 15 `multiple_presets_per_song` (PR #28; the Notion card was
   `multiple_presets_per_song_with_per_preset_reference_metadata`, but the backend feature got the shorter name) —
   **`done`**.
2. R53-R59 and R99-R101 need backend feature 14 `plan_tiers_songs_and_presets_per_song_limits` (PR #29) —
   **`done`** (per-tier limits, 402 `code`s, plan read endpoint).

Both are `done`; T1 only re-verifies the contract recorded in `progress/f4_rev5_backend_contract.md`
(see `design.md` §0).

## Decisions (former open questions — all resolved, none open)

Numbering is kept stable across revisions.

- **OQ1 — `.prst` layout. RESOLVED (2026-10-02)** with a real, installable `.prst`:
  `v_gp5_library/external_docs/02-TLDLXAMP.prst` is a **commercial ToneLab preset** ("TL DLX AMP"; not produced
  by the pedal or the Valeton app) that installs and works on Ricardo's GP-5. **507 bytes**; header `0x00-0x13` =
  `47 50 2d 35` + fourteen `00` + `01` + `00` (the `01` is at **`0x12`**, not `0x13` as the probe recipe had);
  CRC at `0x14` = `0x10` = CRC-8/SMBUS (poly `0x07`, init `0`) over `0x15..0x1FA` (verified); sentinel
  `ff ff ff ff` at `0x15-0x18`; name `0x19-0x28` (NUL-padded); body `0x29-0x1FA` (466). The probe recipe
  (`progress/gp5_webmidi_backup_all.html:116-127`) is wrong twice: `01` one byte late, and the CRC overwrites the
  first sentinel byte (yielding 506). Codec constants `PRST_LEN = 507` / `NAME_OFF = 0x19` are correct. Only one
  file has been seen, so whether `0x12` is always `01` is unconfirmed; the layout stays isolated in
  `src/app/midi/gp5-prst-file.ts` (design §1), which also enforces it on files the user adds (R13).
- **OQ2 / OQ3 — removed (Revision 4):** both were about `pedal_slot`, which is no longer sent.
- **OQ4 — maximum presets per song. RESOLVED (Revision 3):** per plan tier — free 1 song × 1 preset/song;
  basic 2 songs × 2 presets/song; premium unlimited — read from the backend (R53-R59); the server stays
  authoritative (R99-R101).
- **OQ5 — the same preset twice in one song. RESOLVED (Revision 3):** not allowed; two presets with the same
  trimmed name may not coexist in one song, for both sources (R39, R47, R52).
- **OQ6 — plan read endpoint. RESOLVED (Revision 4; shape corrected in Revision 5 to the finished backend):**
  `GET ${apiBaseUrl}/me/plan` → `{ "plan": string, "limits": { "songs": number|null, "presetsPerSong":
  number|null }, "usage": { "songs": number } }` (camelCase; `null` = unlimited; `usage.songs` = live,
  non-soft-deleted songs). A response that does not match this shape is treated as "limits unknown" (R59). Used by
  R53, R59. (Revision 4 had pinned a flat `{plan, songLimit, presetsPerSongLimit, songCount}`, which the backend
  did not adopt.)
- **OQ7 — 402 body. RESOLVED (Revision 4):** `{ error, code: 'plan_song_limit' | 'plan_preset_limit', plan,
  limit }`, `limit` a number. Used by R99-R101.
- **OQ8 — name comparison for uniqueness. RESOLVED (Revision 4):** exact, case-sensitive equality after trimming
  (`"TL DLX AMP"` ≠ `"tl dlx amp"`). Used by R39, R47, R52.

## Preset raw bytes (`src/app/midi/`)

## R1
WHEN the codec reassembles a complete 466-byte body reply for a slot, the system SHALL attach to the decoded
`Preset` a `raw.body` `Uint8Array` of length 466 that is byte-identical to the reassembled body with its 2-byte
`[CATSEL, BODY_SEL]` echo removed.

## R2
WHEN the codec decodes a slot's body, the system SHALL attach to that `Preset` a `raw.nameField` `Uint8Array`
of length 16 equal to that slot's 16 name bytes from the names reply, verbatim (no trimming, no NUL handling).

## R3
The system SHALL store `raw.body` and `raw.nameField` in buffers that are not shared with the codec's
reassembly state, so that decoding a later slot leaves every earlier preset's `raw` bytes unchanged.

## R4
WHEN `WebMidiPedalConnection.readPresets()` resolves, each returned `Preset` SHALL carry the `raw` value the
codec produced for it, unchanged.

## `.prst` file encoding (layout confirmed by the ToneLab reference file, OQ1)

## R5
WHEN `encodePrstFile(preset)` is called with a preset whose `raw` is present, the system SHALL return a
`Uint8Array` of exactly 507 bytes.

## R6
WHEN `encodePrstFile(preset)` returns, bytes `0x29..0x1FA` (466 bytes) of the result SHALL be byte-identical to
`preset.raw.body`, verified by a unit test that decodes a captured hardware body (test fixture, R20) through the
real codec and compares the encoded file against the captured bytes.

## R7
WHEN `encodePrstFile(preset)` returns, bytes `0x19..0x28` of the result SHALL equal `preset.raw.nameField`.

## R8
WHEN `encodePrstFile(preset)` returns, bytes `0x00..0x13` of the result SHALL equal the GP-5 header constant
`47 50 2d 35` followed by fourteen `00` bytes, `01`, `00` (i.e. `01` at offset `0x12`), as in the ToneLab
reference file (OQ1).

## R9
WHEN `encodePrstFile(preset)` returns, bytes `0x15..0x18` of the result SHALL each equal `0xff`.

## R10
WHEN `encodePrstFile(preset)` returns, byte `0x14` of the result SHALL equal the CRC-8/SMBUS (poly `0x07`,
init `0`) of bytes `0x15..0x1FA` of the same result.

## R11
IF `encodePrstFile` receives a preset whose `raw` is absent, whose `raw.body` length is not 466, or whose
`raw.nameField` length is not 16 THEN the system SHALL throw `Error('preset_bytes_unavailable')`.

## `.prst` file validation and decoding (`decodePrstFile`, same module)

## R12
IF `decodePrstFile(bytes)` receives a buffer whose length is not 507 THEN the system SHALL return
`{ ok: false, error: 'wrong_length' }`.

## R13
IF `decodePrstFile(bytes)` receives a buffer whose bytes `0x00..0x13` differ from the GP-5 header constant of R8
THEN the system SHALL return `{ ok: false, error: 'bad_header' }`.

## R14
IF `decodePrstFile(bytes)` receives a buffer in which any of bytes `0x15..0x18` is not `0xff` THEN the system
SHALL return `{ ok: false, error: 'bad_sentinel' }`.

## R15
IF `decodePrstFile(bytes)` receives a buffer whose byte `0x14` differs from the CRC-8/SMBUS of its bytes
`0x15..0x1FA` THEN the system SHALL return `{ ok: false, error: 'bad_crc' }`.

## R16
WHEN a buffer fails more than one of R12-R15, `decodePrstFile` SHALL return only the error of the first failing
check in the order length, header, sentinel, CRC.

## R17
WHEN `decodePrstFile(bytes)` passes R12-R15, the system SHALL return `ok: true` with a `name` equal to the
characters of bytes `0x19..0x28` up to (excluding) the first `0x00`, one character per byte code, trimmed
(possibly the empty string).

## R18
WHEN `decodePrstFile(bytes)` passes R12-R15, the returned `bytes` SHALL be a new 507-byte `Uint8Array`
byte-identical to the input buffer (no byte rewritten, no CRC recomputed).

## R19
WHEN `decodePrstFile(bytes)` passes R12-R15, the returned `chain` SHALL equal the chain the codec's body decoder
produces for bytes `0x29..0x1FA` of the input.

## Test fixtures (test-only)

## R20
The system SHALL import the captured hardware bodies module (`src/app/midi/gp5-captured-bodies.fixture.ts`) and
the ToneLab reference file module (`src/app/midi/gp5-tonelab-prst.fixture.ts`) only from `*.spec.ts` files, so
that no fixture bytes reach mock presets or the production bundle.

## Entry point (preset browser page)

## R21
WHILE the main area displays a preset, the page SHALL render a "Save as song" button
(`data-testid="save-song-open"`) at the end of the chip row.

## R22
IF the displayed preset is not an element of `MockPresetsStore.presets()` and has no `raw` bytes THEN the page
SHALL render the "Save as song" button disabled, accompanied by the `saveSong.no_bytes` hint
(`data-testid="save-song-no-bytes"`).

## R23
WHILE the displayed preset is an element of `MockPresetsStore.presets()`, the page SHALL render the "Save as
song" button enabled.

## R24
WHEN the user activates the "Save as song" button, the page SHALL open the save-song dialog with an initial
preset list made of the page's presets whose slots are in the comparison set, in ascending slot order, leaving
out every preset that is not a mock and has no `raw`.

## R25
WHEN the user activates the "Save as song" button, the page SHALL pass the dialog, as its available pedal
presets, a snapshot of the page's presets at that moment, leaving out every preset that is not a mock and has no
`raw`.

## R26
WHILE the save-song dialog is open, the dialog SHALL keep using the preset objects it was opened with (initial
list and available presets) even if the page's presets, comparison set or displayed preset change afterwards.

## R27
WHEN the user opens the save-song dialog while the displayed preset is an element of
`MockPresetsStore.presets()`, the page SHALL open the dialog in test mode (`testMode` input `true`) for as long
as it stays open.

## Dialog behavior

## R28
The dialog card SHALL carry `role="dialog"`, `aria-modal="true"` and an `aria-labelledby` that points to the
dialog title element.

## R29
WHEN the dialog opens, the system SHALL move keyboard focus to the song-name input.

## R30
WHEN the user presses Escape, clicks the backdrop, or activates Cancel or the close button while no save
request is in flight, the system SHALL close the dialog without sending a save request.

## R31
WHILE a save request is in flight, the system SHALL ignore Escape and backdrop clicks (the dialog stays open).

## R32
WHEN the dialog closes, the system SHALL return keyboard focus to the "Save as song" button.

## Song preset list (ordered)

## R33
WHEN the dialog renders its preset list, it SHALL render one row (`data-testid="save-song-preset-row"`) per
listed preset, in list order, each showing its 1-based position, its source badge (`saveSong.pedal_badge`,
`data-testid="save-song-pedal-badge"`, for a pedal preset; `saveSong.file_badge`, `data-testid="save-song-file-badge"`,
for a file preset) and its name.

## R34
WHEN the user activates the "Move up" control of the row at position i > 1, the system SHALL swap that preset
with the one at position i - 1 and keep every other row in place.

## R35
WHEN the user activates the "Move down" control of the row at position i < N, the system SHALL swap that preset
with the one at position i + 1 and keep every other row in place.

## R36
The dialog SHALL render the "Move up" control of the first row and the "Move down" control of the last row
disabled.

## R37
WHEN the user activates the "Remove" control of a row, the system SHALL remove exactly that preset and keep the
others in their order.

## Add from pedal

## R38
WHEN the user picks a pedal preset in the "Add preset" selector (`data-testid="save-song-add-preset"`) whose
trimmed name equals no listed preset's name, the system SHALL append that preset at the end of the list and
reset the selector to its placeholder option.

## R39
IF the user picks a pedal preset whose trimmed name equals a listed preset's name THEN the system SHALL leave the
list unchanged, show `saveSong.errors.presetNameDuplicate` (with that name) in the add-error slot
(`data-testid="save-song-add-error"`), and reset the selector to its placeholder option. *(OQ5, OQ8)*

## R40
The "Add preset" selector SHALL offer exactly the available pedal presets whose slot belongs to no listed pedal
preset, in ascending slot order. Each option's label SHALL show the preset's slot number exactly as the preset browser
displays it, followed by the preset's name (e.g. `12 · TL DLX AMP`), so presets with the same name in different
slots can be told apart. The slot number is display-only: it SHALL NOT be stored, sent to the backend, or shown in
the song preset list rows (R33).

## R41
WHILE the "Add preset" selector offers no preset, the dialog SHALL render it disabled.

## R42
WHILE the dialog's available pedal presets are empty, the dialog SHALL NOT render the "Add preset" selector.

## Add from `.prst` file

## R43
The dialog SHALL render an "Add .prst file" button (`data-testid="save-song-add-file"`) that opens a file chooser
for a single file with `accept=".prst"`.

## R44
WHEN the user picks a file that `decodePrstFile` accepts, whose decoded name is non-empty and equals no listed
preset's name, and whose file name is at most 255 characters, the system SHALL append a file preset at the end
of the list, named with the decoded name.

## R45
IF `decodePrstFile` rejects the picked file THEN the system SHALL leave the list unchanged and show, in the
add-error slot, the key mapped from the error: `wrong_length` → `saveSong.errors.prstWrongSize`; `bad_header`
and `bad_sentinel` → `saveSong.errors.prstNotGp5`; `bad_crc` → `saveSong.errors.prstCorrupt`.

## R46
IF the picked file is accepted by `decodePrstFile` but its decoded name is empty THEN the system SHALL leave the
list unchanged and show `saveSong.errors.prstNoName` in the add-error slot.

## R47
IF the picked file's decoded name equals a listed preset's name THEN the system SHALL leave the list unchanged
and show `saveSong.errors.presetNameDuplicate` (with that name) in the add-error slot. *(OQ5, OQ8)*

## R48
IF the picked `.prst` file's name is longer than 255 characters THEN the system SHALL leave the list unchanged
and show `saveSong.errors.fileNameTooLong` in the add-error slot.

## R49
WHEN a preset is appended to the list by R38 or R44, the system SHALL clear the add-error slot.

## R50
WHEN the user picks a file through the "Add .prst file" chooser, the system SHALL reset the chooser's value after
handling it, so that picking the same file again is handled again.

## Preset list validation (submit time)

## R51
IF the user submits while the list holds no preset THEN the system SHALL show `saveSong.errors.presetsRequired`
under the preset list.

## R52
IF the user submits while two listed presets have the same trimmed name THEN the system SHALL show
`saveSong.errors.presetNameDuplicate` on the later of the two rows. *(OQ5, OQ8)*

## Plan limits (OQ4, OQ6)

## R53
WHEN the dialog opens while not in test mode, the system SHALL send exactly one `GET`
`${environment.apiBaseUrl}/me/plan` request. *(OQ6; response `{plan, limits:{songs, presetsPerSong},
usage:{songs}}` per Revision 5 — R54-R57 read the presets-per-song limit from `limits.presetsPerSong`, the song
limit from `limits.songs` and the song count from `usage.songs`)*

## R54
WHILE the plan limits are loaded with a non-null presets-per-song limit L and the list holds L or more presets,
the dialog SHALL render the "Add preset" selector and the "Add .prst file" button disabled.

## R55
WHILE the plan limits are loaded with a non-null presets-per-song limit L and the list holds L or more presets,
the dialog SHALL show `saveSong.plan.presetLimitReached` with `limit` = L
(`data-testid="save-song-preset-limit"`) next to the add controls.

## R56
IF the user submits while the plan limits are loaded with a non-null presets-per-song limit L and the list holds
more than L presets THEN the system SHALL show `saveSong.errors.presetLimitExceeded` with `limit` = L under the
preset list.

## R57
WHILE the plan limits are loaded with a non-null song limit S and a song count of S or more, the dialog SHALL
show the warning `saveSong.plan.songLimitReached` with `limit` = S (`data-testid="save-song-song-limit"`,
`role="status"`).

## R58
WHILE the song-limit warning of R57 is shown, the dialog SHALL keep the submit button enabled (the server
decides).

## R59
WHILE the plan limits are not loaded (request pending or failed, response not matching OQ6's shape, or dialog in
test mode), the dialog SHALL neither disable an add control nor show a plan message on account of plan limits.

## Form validation (client side)

## R60
IF the user submits with a song name that is empty after trimming THEN the system SHALL show
`saveSong.errors.nameRequired` under the name field.

## R61
IF the user submits with a trimmed song name longer than 255 UTF-16 code units THEN the system SHALL show
`saveSong.errors.nameTooLong` under the name field.

## R62
IF the user submits with a trimmed artist longer than 255 UTF-16 code units THEN the system SHALL show
`saveSong.errors.artistTooLong` under the artist field.

## R63
IF the user picks a cover file whose MIME type does not start with `image/` THEN the system SHALL show
`saveSong.errors.coverNotImage` under the cover input.

## R64
IF the user picks a cover, IR or NAM file whose name is longer than 255 characters THEN the system SHALL show
`saveSong.errors.fileNameTooLong` under that input.

## Extra config (key/value rows)

## R65
WHEN the user activates "Add field", the system SHALL append one empty key/value row to the extra-config list.

## R66
WHEN the user activates a row's remove control, the system SHALL remove exactly that row and keep the others in
their order.

## R67
IF the user submits with an extra-config row whose trimmed key is empty and whose value is non-empty THEN the
system SHALL show `saveSong.errors.extraKeyRequired` on that row.

## R68
IF the user submits with two extra-config rows whose trimmed keys are equal THEN the system SHALL show
`saveSong.errors.extraKeyDuplicate` on the later row.

## R69
IF the serialized extra config is longer than 32768 UTF-8 bytes THEN the system SHALL show
`saveSong.errors.extraConfigTooLarge` under the extra-config section.

## R70
IF any client-side validation error from R51, R52, R56, R60-R62 or R67-R69 is present at submit time THEN the
system SHALL NOT send a save request.

## R71
IF a picked file triggers R63 or R64 THEN the system SHALL leave that input with no file kept, so the file is
never part of a save request.

## IR / NAM attachments (optional, guided, across all listed presets)

## R72
WHILE one or more listed presets (pedal or file) contain a CAB module that resolves to a User IR slot, the dialog
SHALL render exactly one optional `.wav` file input per distinct User IR slot number across all listed presets,
labelled with `chainBoard.userIrSlot` for that slot number.

## R73
WHILE one or more listed presets (pedal or file) contain an N->S module that resolves to a User SnapTone slot,
the dialog SHALL render exactly one optional `.nam` file input per distinct User SnapTone slot number across all
listed presets, labelled with `chainBoard.userSnapToneSlot` for that slot number.

## R74
IF no listed preset contains a User IR or User SnapTone module THEN the dialog SHALL NOT render the attachments
section.

## R75
The system SHALL allow submitting the form with any or all attachment inputs left empty.

## R76
WHEN a change to the preset list leaves a User IR or User SnapTone slot referenced by no listed preset, the
system SHALL discard the file attached for that slot, so it is never part of a save request.

## Save request

## R77
WHEN the user submits a form with no client-side validation error (R70) while the dialog is not in test mode,
the system SHALL send exactly one `POST` `${environment.apiBaseUrl}/songs` whose body is a `FormData`.

## R78
WHEN the save request is built, the `FormData` SHALL contain a single `name` field equal to the trimmed song
name.

## R79
WHEN the save request is built, the `FormData` SHALL contain one `preset` part per listed preset, in list order,
each a `File` of type `application/octet-stream`.

## R80
WHEN the save request is built, the `preset` part of a pedal preset SHALL be named `presetFileName(name)`
(ending in `.prst`) and its bytes SHALL equal `encodePrstFile(preset)`.

## R81
WHEN the save request is built, the `preset` part of a file preset SHALL carry the picked file's original name
and bytes byte-identical to the picked file (validated, never rebuilt).

## R82
WHEN the save request is built, every `preset` part's bytes SHALL be accepted by `decodePrstFile` (R12-R15), so
that every uploaded `.prst` is a structurally valid GP-5 file.

## R83
WHERE the trimmed artist is non-empty, the `FormData` SHALL contain a single `artist` field equal to the trimmed
artist.

## R84
IF the trimmed artist is empty THEN the `FormData` SHALL NOT contain an `artist` field.

## R85
*(Revision 5: the former R85 — one `pedal_preset_name` text field per listed preset — is withdrawn; the backend
ignores that field and derives each preset's name from the uploaded `.prst` bytes at `0x19`. Replaced by:)*
WHEN the save request is built, the `FormData` SHALL NOT contain a `pedal_preset_name` field.

## R86
IF no extra-config row has a non-empty trimmed key THEN the `FormData` SHALL NOT contain an `extra_config`
field.

## R87
WHERE at least one extra-config row has a non-empty trimmed key, the `FormData` SHALL contain a single
`extra_config` field equal to `JSON.stringify` of an object mapping each trimmed key to its value as typed, in
row order, skipping rows whose key and value are both empty.

## R88
WHERE one or more IR files are attached, the `FormData` SHALL contain one `ir` part per attached file, appended
in ascending User IR slot order.

## R89
WHERE one or more NAM files are attached, the `FormData` SHALL contain one `nam` part per attached file,
appended in ascending User SnapTone slot order.

## R90
WHERE a cover file is kept, the `FormData` SHALL contain exactly one `cover` part with that file.

## R91
The save request SHALL NOT carry a manually set `Content-Type` header.

## Test mode (mock presets)

## R92
WHEN the user submits a form with no client-side validation error while the dialog is in test mode, the dialog
SHALL show the `saveSong.test_mode_notice` message (`data-testid="save-song-test-mode"`, `role="status"`) and
keep every form value and the preset list.

## R93
WHILE the dialog is in test mode, the system SHALL NOT send any HTTP request (neither the plan request nor a
save request).

## Outcome

## R94
WHILE a save request is in flight, the submit button SHALL be disabled.

## R95
WHILE a save request is in flight, the submit button SHALL show the `saveSong.saving` label instead of
`saveSong.save`.

## R96
WHEN the backend answers `201`, the dialog SHALL replace the form with a success panel
(`data-testid="save-song-success"`) that shows `saveSong.success_body` with the `name` of the response body.

## R97
IF the save request fails THEN the dialog SHALL keep every form value (preset list and its order, name, artist,
cover, attachments, extra-config rows) so the user can retry.

## R98
IF the save request fails with HTTP 400 and an `error` message listed below THEN the dialog SHALL show the
mapped Transloco key, in the mapped place (strings verified against the finished backend in Revision 5,
`progress/f4_rev5_backend_contract.md`; re-checked in T1):

| `error` message (exact) | key | shown |
|---|---|---|
| `name is required` | `saveSong.errors.nameRequired` | under name |
| `at least one preset file is required` | `saveSong.errors.presetMissing` | form banner |
| `at most one cover file is allowed` | `saveSong.errors.coverTooMany` | form banner |
| `extra_config exceeds maximum size of 32768 bytes` | `saveSong.errors.extraConfigTooLarge` | under extra config |
| `extra_config must be valid JSON` | `saveSong.errors.extraConfigInvalid` | under extra config |
| `extra_config must be a JSON object` | `saveSong.errors.extraConfigInvalid` | under extra config |

## R99
IF the save request fails with HTTP 402 whose JSON body has `code` equal to `plan_song_limit` and a numeric
`limit` THEN the dialog SHALL show `saveSong.errors.planSongLimit` in the form banner with `limit` set to that
number. *(OQ7)*

## R100
IF the save request fails with HTTP 402 whose JSON body has `code` equal to `plan_preset_limit` and a numeric
`limit` THEN the dialog SHALL show `saveSong.errors.planPresetLimit` in the form banner with `limit` set to that
number. *(OQ7)*

## R101
IF the save request fails with HTTP 402 not covered by R99 or R100 THEN the dialog SHALL show
`saveSong.errors.planLimitGeneric` in the form banner.

## R102
IF the save request fails with HTTP 401, or with HTTP 404 and `error` equal to `user not found`, THEN the
dialog SHALL show `saveSong.errors.sessionExpired` in the form banner together with a link to `/login`.

## R103
IF the save request fails with HTTP status 0 THEN the dialog SHALL show `saveSong.errors.network` in the form
banner.

## R104
IF the save request fails in any way not covered by R98-R103 or R108 (including a `text/plain` 500 or an
unlisted 400 message) THEN the dialog SHALL show `saveSong.errors.unexpected` in the form banner.

## R108
IF the save request fails with HTTP 400 and an `error` message matching
`/^preset file at position (\d+) has no readable GP-5 preset name$/` THEN the dialog SHALL show
`saveSong.errors.presetNameUnreadable` in the form banner with `position` set to the captured number plus 1
(the backend's position is 0-based; the dialog's row numbers are 1-based). *(Revision 5)*

## i18n, layout, theme

## R105
The system SHALL keep the set of key paths under the `saveSong` namespace identical between
`public/i18n/en.json` and `public/i18n/es.json`, each with a non-empty string value.

## R106
The dialog backdrop and card SHALL carry the layout class strings given in `design.md` → "Visual direction"
(bottom sheet below 640px, centered `max-w-lg` card at 640px and above, internal scroll), verified by class
assertions in a component test and by a manual check at 375px and 1280px with no overlap or cut-off.

## R107
Every color class on the dialog's surfaces, text, inputs, buttons, preset rows, add controls, plan messages and
test-mode notice SHALL have the `dark:` counterpart given in `design.md` → "Visual direction", verified by class
assertions on the card, inputs, buttons, preset rows, add controls, song-limit warning and notice and by a manual
dark-mode check.

## Backend-readable preset names (Revision 5)

The backend derives each preset's name with `readPresetName` (`backend/src/songs/prst-name.ts`) and rejects the
whole request with a 400 (R108) when it returns `null`. Its rule on the 16-byte name field `0x19..0x28`: the
name is the bytes before the first `0x00` (all 16 if there is none); every one of those bytes must be in
`0x20..0x7e`; the name must not be empty or all spaces (`trim() === ''`); bytes after the first `0x00` are not
inspected; the name is not trimmed or otherwise rewritten. The `GP-5` magic and the minimum length that
`readPresetName` also checks are already guaranteed for every uploaded file by R5/R8 and R12/R13. R109-R113 mirror
that rule in one pure helper; R114-R118 apply it in the dialog so a request the backend would reject for a name is
never sent. R108 stays as the server-side fallback.

## R109
WHEN `isReadablePrstNameField(field)` receives a 16-byte field whose bytes before the first `0x00` (all 16 bytes
if no `0x00` is present) are all in `0x20..0x7e` and include at least one byte other than `0x20`, the system
SHALL return `true`.

## R110
IF `isReadablePrstNameField(field)` receives a 16-byte field in which any byte before the first `0x00` (or any
byte, if no `0x00` is present) is outside `0x20..0x7e` THEN the system SHALL return `false`.

## R111
IF `isReadablePrstNameField(field)` receives a 16-byte field whose first byte is `0x00`, or whose bytes before the
first `0x00` (all 16 if none) are all `0x20`, THEN the system SHALL return `false`.

## R112
WHEN `isReadablePrstNameField(field)` receives a field that contains a `0x00`, the system SHALL return the same
result regardless of the values of the bytes after the first `0x00`.

## R113
IF `isReadablePrstNameField(field)` receives a field whose length is not 16 THEN the system SHALL return `false`.

## R114
IF the user picks, in the "Add preset" selector, a pedal preset that has `raw` bytes and whose `raw.nameField`
fails `isReadablePrstNameField` THEN the system SHALL leave the list unchanged, show
`saveSong.errors.presetNameUnsupported` in the add-error slot (`data-testid="save-song-add-error"`), and reset the
selector to its placeholder option.

## R115
IF the user picks a `.prst` file that `decodePrstFile` accepts, whose decoded name is non-empty and whose file
name is at most 255 characters, but whose name field (`0x19..0x28`) fails `isReadablePrstNameField` THEN the
system SHALL leave the list unchanged and show `saveSong.errors.presetNameUnsupported` in the add-error slot.

## R116
IF the user submits while a listed preset that has bytes (a pedal preset with `raw`, or a file preset) has a
name field that fails `isReadablePrstNameField` THEN the system SHALL show `saveSong.errors.presetNameUnsupported`
on that preset's row (`data-testid="save-song-preset-row-error"`), taking precedence over a
`presetNameDuplicate` error on the same row.

## R117
IF an R116 error is present at submit time THEN the system SHALL NOT send a save request.

## R118
IF a listed or picked pedal preset has no `raw` bytes (a mock preset, test mode only) THEN the system SHALL NOT
show `saveSong.errors.presetNameUnsupported` for it.

## Out of scope

- **Feature 26 `library_first_startup`**: the song library screen, loading the library at startup, keeping
  "Connect to GP-5" always visible, and **opening this dialog without a pedal** (F4 delivers a dialog that works
  with an empty initial list and no pedal presets — R42, R43, R51 — but its only entry point in F4 is the preset
  browser page). Feature 25 `library_first_pedal_sync` is superseded.
- **Feature 27 `song_preset_duplicate_edit_export`**: duplicating a preset under a new name, editing it, exporting.
- **Any comparison or update of saved songs.** The stored per-preset name (backend `song_files.pedal_preset_name`,
  derived by the backend from the uploaded bytes) is reference-only metadata, never a link to the pedal, never
  used to detect changes; F4 neither sends it (Revision 5) nor reads it back.
- **Any pedal-slot metadata** (Revision 4): no `pedal_slot` field is sent, and the slot number appears only as a
  display aid in the "Add preset" selector's option labels (R40). Otherwise the slot stays only as the page's
  internal identity of a read preset (R24, R40); it is never stored or sent.
- **Writing presets to the pedal** (F5).
- Any change to when the preset UI is visible: F4 does **not** touch the page's support/connection gate
  (`preset-browser-page.html:2-10`).
- Raw bytes for mock presets: mocks stay byte-less and are never uploaded (R93).
- Renaming a preset inside the dialog (a name clash is resolved by removing one of the presets).
- Reading IR/NAM file contents from the pedal (the GP-5 body only carries slot numbers), a client-side file
  size limit, showing the plan name, upgrading the plan.
