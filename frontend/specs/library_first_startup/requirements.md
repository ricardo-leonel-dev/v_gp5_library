# Requirements — `library_first_startup` (feature 26)

The library is a library of **songs**, each owning an ordered list of presets — not a library of presets. On app
start the authenticated user sees their saved songs (name, artist, cover) loaded from the backend, **without
connecting the pedal**. Opening a song shows its presets in order with their reference metadata. A "Connect to
GP-5" button sits in the app header on every screen; reading the pedal only makes presets available to add to a
new song through the F4 dialog — it **never** compares against, flags, or modifies saved songs.

## Backend contract status: READY

The cross-project dependency named in the feature (`multiple_presets_per_song_with_per_preset_reference_metadata`)
is backend feature **15 `multiple_presets_per_song`**, status **`done`** (same mapping F4 recorded). Full findings
with file:line references: `progress/f26_backend_contract.md`. Facts this spec relies on:

- `GET /songs` → `200` bare array of `SongDto` (`id`, `name`, `artist|null`, `extraConfig`, `createdAt`,
  `updatedAt`, `presets[]`), newest first, no pagination.
- `GET /songs/:id` → `200` `SongDto` + `files[]` (`ir`/`nam`/`cover` only); `404` when not found/not owned.
- Each `presets[]` element: `id`, `sortOrder`, `name`, `originalFilename`, `mimeType`, `byteSize`, `createdAt`.
- Cover bytes only via authenticated `GET /songs/:id/files/cover` (`404` when the song has no cover). The list DTO
  carries **no** cover indicator.
- All routes require `Authorization: Bearer`; failures answer `401`.

**Covers — shipped behavior and planned follow-up (Ricardo, 2026-10-05):** F26 ships the per-song
`GET /songs/:id/files/cover` request with `404` meaning "no cover" (R13-R17). A separate backend card is being
proposed to add a has-cover indicator to the `GET /songs` list DTO. **F26 does not depend on it**; design §4 keeps the
switch to that field a one-function change.

**Correction applied (leader note, 2026-10-02):** `pedal_slot` was dropped. The acceptance item "pedal preset name
and origin slot" is satisfied by the preset name alone; no slot is stored, sent, or shown (R33).

Revision 2 (2026-10-05, Ricardo's decisions on the 5 open questions): the header button stays authenticated-only
(R44/R45); "New song" works with and without the pedal and mixes pedal + `.prst` presets (R60, R68-R74); the cover
approach stays, with the list-DTO indicator as a non-blocking follow-up; the header button always triggers a fresh
pedal read when connected, including on `/pedal/presets` (R63-R67); the detail page scope is unchanged. Requirement
ids are stable; new ones are R63-R74.

Glossary:
- **Library page**: the `/songs` route component (`SongsPage`).
- **Detail page**: the new `/songs/:id` route component (`SongDetailPage`).
- **Connect button**: the new header control (`data-testid="pedal-connect"`).
- **Blank**: `null`, empty, or only whitespace.
- **Network failure**: an `HttpErrorResponse` with `status === 0`.
- **Read presets**: `PedalPresetsStore.presets()`, the presets returned by the last successful real `readPresets()`
  (never mock presets).

Out of scope: editing, deleting, reordering, duplicating, exporting or downloading songs or presets (feature 27
and later); showing a saved preset's chain (would need the preset bytes); showing IR/NAM files or `extraConfig`
on the detail page; pagination/search/sort; any comparison between saved songs and the pedal; changes to the
existing `/pedal` page; writing presets to the pedal (F5).

## Startup and library list

## R1
WHEN an authenticated user navigates to `/`, the system SHALL display the library page at `/songs`.

## R2
WHEN the library page initializes, the system SHALL send exactly one `GET {apiBaseUrl}/songs` request.

## R3
WHEN the application starts and the library page initializes, the system SHALL NOT call
`navigator.requestMIDIAccess`.

## R4
WHILE the library page's `GET /songs` request is pending, the library page SHALL render the loading state
(`data-testid="songs-loading"`).

## R5
WHEN `GET /songs` responds `200` with a non-empty array, the library page SHALL render exactly one song card
(`data-testid="song-card"`) per array element, in the order of the response.

## R6
The library page SHALL show each song's `name` on its song card.

## R7
WHERE a song's `artist` is not blank, the library page SHALL show the artist on that song's card
(`data-testid="song-card-artist"`).

## R8
IF a song's `artist` is blank THEN the library page SHALL NOT render the `song-card-artist` element on that card.

## R9
The library page SHALL show on each song card the number of elements in that song's `presets` array, using
`songs.preset_count_one` when it is 1 and `songs.preset_count_other` with a `count` parameter otherwise.

## R10
The library page SHALL lay out song cards in a container with the classes
`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4` (`data-testid="songs-grid"`).

## R11
WHEN `GET /songs` responds `200` with an empty array, the library page SHALL render the empty state
(`data-testid="songs-empty"`) showing `songs.empty_title` and `songs.empty_body`.

## R12
WHILE the library page shows the empty state, it SHALL render a button (`data-testid="songs-empty-connect"`) that
starts the same connect flow as the connect button (R50-R54).

## Covers (library)

## R13
WHEN the library page renders a song card, the system SHALL send one `GET {apiBaseUrl}/songs/<id>/files/cover`
request with `responseType: 'blob'` for that song.

## R14
WHILE a song card's cover request is pending, the card SHALL render its cover area with
`data-cover-state="loading"`.

## R15
WHEN a cover request responds `200`, the system SHALL render an `<img>` in that cover area whose `src` is an object
URL created from the response blob and whose `alt` is `songs.cover_alt` with the song name.

## R16
IF a cover request responds `404` THEN the system SHALL render the cover placeholder with
`data-cover-state="none"`.

## R17
IF a cover request fails with any status other than `404` THEN the system SHALL render the cover placeholder with
`data-cover-state="error"`.

## R18
IF a cover request fails THEN the library page SHALL keep rendering every song card it rendered before the
failure.

## R19
WHEN the library page or the detail page is destroyed, the system SHALL call `URL.revokeObjectURL` once for every
object URL that page created.

## Library load errors and session

## R20
IF the library page's `GET /songs` request ends in a network failure THEN the library page SHALL render the error
state (`data-testid="songs-error"`) showing `songs.errors.unreachable`.

## R21
IF the library page's `GET /songs` request fails with a status other than `0` and `401` THEN the library page SHALL
render the error state (`data-testid="songs-error"`) showing `songs.errors.load_failed`.

## R22
WHILE the library page shows the `songs-error` state, it SHALL render a retry button
(`data-testid="songs-retry"`).

## R23
WHEN the user activates `songs-retry`, the system SHALL send a new `GET {apiBaseUrl}/songs` request.

## R24
IF the library page's `GET /songs` request fails with status `401` THEN the library page SHALL render the
session-expired state (`data-testid="songs-session-expired"`) showing `songs.errors.session_expired` and a link to
`/login`.

## Song detail

## R25
WHEN the user activates a song card, the system SHALL navigate to `/songs/<id>` for that song.

## R26
IF an unauthenticated user navigates to `/songs/<id>` THEN the system SHALL redirect to `/login`.

## R27
WHEN the detail page initializes, the system SHALL send exactly one `GET {apiBaseUrl}/songs/<id>` request for the
`id` in the route.

## R28
WHILE the detail page's `GET /songs/<id>` request is pending, the detail page SHALL render the loading state
(`data-testid="song-detail-loading"`).

## R29
WHEN `GET /songs/<id>` responds `200`, the detail page SHALL render the song `name` in its `<h1>`.

## R30
WHERE the loaded song's `artist` is not blank, the detail page SHALL show the artist
(`data-testid="song-detail-artist"`).

## R31
WHEN `GET /songs/<id>` responds `200`, the detail page SHALL render exactly one row
(`data-testid="song-preset-row"`) per element of `presets`, ordered by `sortOrder` ascending regardless of the
order of the response array.

## R32
The detail page SHALL show on each preset row its 1-based position in the R31 order and the preset's `name`.

## R33
The detail page SHALL NOT render any pedal slot number for a saved preset.

## R34
WHILE the detail page shows a loaded song, it SHALL render the reference note (`data-testid="song-reference-note"`)
showing `songDetail.reference_note`.

## R35
WHERE the loaded song's `files` contains an element with `kind === 'cover'`, the detail page SHALL send one
`GET {apiBaseUrl}/songs/<id>/files/cover` request with `responseType: 'blob'` and render its result with the same
states as R14-R17.

## R36
IF the loaded song's `files` contains no element with `kind === 'cover'` THEN the detail page SHALL render the cover
placeholder with `data-cover-state="none"` without sending a cover request.

## R37
IF `GET /songs/<id>` responds `404` THEN the detail page SHALL render the not-found state
(`data-testid="song-detail-not-found"`) showing `songDetail.not_found`.

## R38
IF the detail page's `GET /songs/<id>` request ends in a network failure THEN the detail page SHALL render the error
state (`data-testid="song-detail-error"`) showing `songs.errors.unreachable`.

## R39
IF the detail page's `GET /songs/<id>` request fails with a status other than `0`, `401` and `404` THEN the detail
page SHALL render the error state (`data-testid="song-detail-error"`) showing `songs.errors.load_failed`.

## R40
WHEN the user activates the detail page's retry button (`data-testid="song-detail-retry"`, rendered inside
`song-detail-error`), the system SHALL send a new `GET {apiBaseUrl}/songs/<id>` request.

## R41
IF the detail page's `GET /songs/<id>` request fails with status `401` THEN the detail page SHALL render the
session-expired state (`data-testid="song-detail-session-expired"`) showing `songs.errors.session_expired` and a link
to `/login`.

## R42
The detail page SHALL render a back link (`data-testid="song-detail-back"`) to `/songs` labelled `songs.title`.

## Header: navigation and "Connect to GP-5"

## R43
WHILE the user is authenticated, the app header SHALL render a link to `/songs` (`data-testid="nav-songs"`)
labelled `songs.title`.

## R44
WHILE the user is authenticated, the app header SHALL render the connect button on every route.

## R45
WHILE the user is not authenticated, the app header SHALL NOT render the connect button.

## R46
WHILE the pedal `connectionState` is `not-connected` or `error`, the connect button SHALL show `pedalButton.connect`.

## R47
WHILE the pedal `connectionState` is `connecting`, the connect button SHALL be disabled.

## R48
WHILE the pedal `connectionState` is `connected`, the connect button SHALL show `pedalButton.read`.

## R49
IF Web MIDI is not supported (`isSupported()` is `false`) THEN the connect button SHALL be disabled.

## R50
WHEN the connect button is activated while `connectionState` is not `connected`, the system SHALL call the pedal's
`connect()` exactly once.

## R51
WHEN `connect()` resolves after an R50 activation, the system SHALL navigate to `/pedal/presets`.

## R52
WHEN the connect button is activated while `connectionState` is `connected`, the system SHALL navigate to
`/pedal/presets` without calling `connect()`.

## R53
IF `connect()` rejects after an R50 activation THEN the app SHALL render the connect error
(`data-testid="pedal-connect-error"`, `role="alert"`) showing `pedal.<message>` for messages `midi_access_denied`,
`gp5_not_found` and `unsupported`, and `pedal.unknown` for any other message.

## R54
WHEN the user activates the connect error's dismiss button (`data-testid="pedal-connect-error-dismiss"`) or
activates the connect button again, the system SHALL stop rendering the connect error.

## R55
WHEN `/pedal/presets` initializes while `connectionState` is `connected`, the system SHALL call `readPresets()`
exactly once.

## R63
WHEN the connect button is activated while `connectionState` is `connected` and the current URL is not
`/pedal/presets`, the system SHALL call `readPresets()` exactly once in total as a result of that activation and the
resulting page initialization.

## R64
WHEN the connect button is activated while `connectionState` is `connected` and the current URL is already
`/pedal/presets`, the system SHALL call `readPresets()` exactly once.

## R65
WHEN `connect()` resolves after an R50 activation, the system SHALL call `readPresets()` exactly once in total as a
result of that activation and the resulting page initialization.

## R66
WHEN a `readPresets()` call started by R64 resolves, the `/pedal/presets` page SHALL display the presets that call
returned.

## R67
WHILE a pedal read started through `PedalPresetsStore` is in progress, the connect button SHALL be disabled.

## Pedal never touches saved songs

## R56
WHEN a pedal `connect()` or `readPresets()` call started by this feature's flows completes, the system SHALL NOT send
any HTTP request as a consequence.

## R57
The library page SHALL render the same set of song cards (names and order) for a given `GET /songs` response
regardless of the pedal `connectionState` and of the contents of `MockPresetsStore`.

## Mock data link

## R58
WHEN the "Cargar presets de prueba" header link (`data-testid="load-mock-presets"`) is activated while the current
URL is not `/pedal/presets`, the system SHALL navigate to `/pedal/presets`.

## New song from the library (with or without the pedal)

The library reuses the F4 dialog unchanged. F4 already mixes sources in one song: pedal presets come from its
`availablePresets` input through the "Add preset" selector (F4 R38-R42) and files through "Add .prst file" (F4
R43-R50); submit uploads every listed preset in list order. "Read presets" below means the last successful real
pedal read held in `PedalPresetsStore` (design §8b).

## R59
WHILE the library page shows the loaded list or the empty state, it SHALL render a "New song" button
(`data-testid="songs-new"`).

## R60
WHEN the user activates `songs-new` while `connectionState` is not `connected`, the system SHALL open
`app-save-song-dialog` with `initialPresets` `[]`, `availablePresets` `[]` and `testMode` `false`.

## R68
WHEN the user activates `songs-new` while `connectionState` is `connected`, the system SHALL open
`app-save-song-dialog` with `initialPresets` `[]`, `testMode` `false`, and `availablePresets` set to a new array
holding the read presets that have `raw` bytes, in ascending slot order.

## R69
The library page SHALL NOT pass any element of `MockPresetsStore.presets()` to the dialog.

## R70
WHEN the user submits, from a dialog opened by R68, a song listing one preset added from the pedal and one preset
added from a `.prst` file, the system SHALL send one `POST /songs` request whose `preset` parts are those two
presets' bytes in list order.

## R71
WHILE a dialog opened by R60 or R68 is open, the library page SHALL keep passing it the same `initialPresets` and
`availablePresets` array instances it was opened with, even if `connectionState` or the read presets change.

## R72
IF the pedal disconnects while a dialog opened by R68 is open THEN the system SHALL keep the dialog open with its
listed presets unchanged.

## R73
WHEN the user submits a dialog after the pedal disconnected while it was open, the system SHALL include in the
`POST /songs` request the bytes of every listed pedal preset.

## R74
WHEN the user activates `songs-new` after a previous dialog was closed, the system SHALL choose between R60 and R68
using the `connectionState` and the read presets at the moment of that activation.

## R61
WHEN the dialog opened by R60 or R68 emits `closed`, the system SHALL remove the dialog and send a new
`GET {apiBaseUrl}/songs` request.

## Translations

## R62
The system SHALL define every translation key introduced by this feature in both `public/i18n/es.json` and
`public/i18n/en.json`.
