# Requirements — F33 `song_detail_files_and_extra_config`

Show, read-only, the IR/NAM files and the extra details (`extraConfig`) saved with a song on the song detail page
(`/songs/:id`). F26 left both out of scope (`specs/library_first_startup/requirements.md`, out-of-scope list); the
gap was found during F27 manual testing.

## Data contract (verified against the code, 2026-10-18)

- `GET /songs/:id` → `SongWithFilesDto` (`../backend/src/songs/song-service.ts`): the song DTO plus
  `files: SongFileDto[]`. Each file has `id`, `kind` (`'ir' | 'nam' | 'cover'`; presets are never in `files`),
  `originalFilename`, `mimeType`, `byteSize` (integer, **bytes**), `sortOrder`, `createdAt`. The backend orders
  `files` by `kind ASC, sort_order ASC`.
- `sortOrder` of an IR/NAM file is its position among the files of that kind in the original upload (0, 1, ...).
  The GP-5 user slot the file was attached to in the save dialog is **not** stored, so the page cannot show it.
- `extraConfig: Record<string, unknown>` — always a JSON object (the backend falls back to `{}`). The save dialog
  only writes string values (`serializeExtraConfig`), but the API accepts any JSON object, so a value can be a
  number, boolean, `null`, array or nested object. Postgres `jsonb` does not keep the key order the user typed.
- The frontend types already exist: `SongDetail`, `SongFile`, `Song.extraConfig?` in `src/app/songs/song.ts`.
  `SongsApi.getSong(id)` already returns them. No new HTTP call is needed.

## Assumptions (all confirmed by the human in spec review, 2026-10-18)

- **A1 (read-only). Confirmed by the human.** No download, edit, delete or replace of IR/NAM files or extra
  details. The backend has a download route (`GET /songs/:id/files/:kind?sort_order=N`), but downloading is left
  for a later feature.
- **A2 (two sections, two empty states). Confirmed by the human.** "User files" and "Extra details" are separate
  sections; each shows its own empty message when it has nothing to list. Both sections are always rendered when
  the song is loaded. A blank value shows `(empty)` / `(vacío)`.
- **A3 (size unit). Changed and confirmed by the human.** Every size is shown in MB, small files included; there
  are no B or KB steps. 1 MB = 1024 × 1024 = 1048576 bytes. The value always has exactly two decimals, rounded half
  away from zero, with the active language's decimal separator and no grouping separator (`0,03 MB` in `es`,
  `0.03 MB` in `en`). A 0-byte file shows `0,00 MB` / `0.00 MB`. A file from 1 to 5242 bytes (below 0.005 MB, so it
  would round to `0.00`) shows `< 0,01 MB` / `< 0.01 MB`, so a non-empty file never looks empty.
- **A4 (extra details order). Confirmed by the human.** Pairs are shown in the order the response object yields
  them (`Object.keys`), with no client-side sort.
- **A5 (non-string values). Confirmed by the human.** Numbers and booleans show as their plain text; `null`, arrays
  and objects show as compact JSON text.
- **A6 (no pedal slot). Confirmed by the human.** The page does not show which GP-5 user slot a file belongs to; the
  backend does not store it and the human does not need it.

Terms: **user file** = an element of `files` whose `kind` is `'ir'` or `'nam'`. **Loaded state** = the detail
page's `state()` is `'loaded'`.

# User files

## R1
WHILE the detail page is in the loaded state, the system SHALL render a "User files" section
(`data-testid="song-detail-files"`) whose heading text is `songDetail.files_heading`.

## R2
WHILE the detail page is in the loaded state, the system SHALL render exactly one row
(`data-testid="song-file-row"`) per user file in the song's `files`.

## R3
IF the song's `files` contains an element with `kind === 'cover'` THEN the system SHALL NOT render a user-file
row for that element.

## R4
The system SHALL order user-file rows with every `'ir'` file before every `'nam'` file and, within the same kind,
by `sortOrder` ascending, regardless of the order of `files` in the response.

## R5
The system SHALL show each user file's `originalFilename` in its row (`data-testid="song-file-name"`).

## R6
The system SHALL set the `title` attribute of each row's filename element to the file's full
`originalFilename`.

## R7
The system SHALL show in each user-file row a kind label whose text is `songDetail.file_kind_ir` for `'ir'` files
and `songDetail.file_kind_nam` for `'nam'` files (`data-testid="song-file-kind"`).

## R8
The system SHALL show in each user-file row the file's `byteSize` formatted by `formatByteSize`
(`data-testid="song-file-size"`).

## R9
WHEN `formatByteSize` receives a byte count of 5243 or more, the system SHALL return the key `songDetail.size_mb`
with the value of the byte count divided by 1048576, formatted with exactly two decimals, rounded half away from
zero and without grouping separators (`31457` → `0.03`, `131072` → `0.13`, `1073741824` → `1024.00` in `en`).

## R10
WHEN `formatByteSize` receives a byte count of 0, the system SHALL return the key `songDetail.size_mb` with the
value `0.00` in `en` and `0,00` in `es`.

## R11
WHEN `formatByteSize` receives a byte count from 1 to 5242, the system SHALL return the key
`songDetail.size_mb_below_min` with the value `0.01` in `en` and `0,01` in `es` (rendered `< 0.01 MB` /
`< 0,01 MB`).

## R12
The system SHALL format the size value with the decimal separator of the active Transloco language (`es` →
`0,03`, `en` → `0.03`).

## R13
IF the song's `files` contains no user file THEN the system SHALL render the text `songDetail.files_empty`
(`data-testid="song-detail-files-empty"`) in the "User files" section instead of any row.

# Extra details

## R14
WHILE the detail page is in the loaded state, the system SHALL render an "Extra details" section
(`data-testid="song-detail-extra"`) whose heading text is `songDetail.extra_heading`.

## R15
The system SHALL render one key/value pair (`data-testid="song-extra-row"`) per own key of the song's
`extraConfig`, in the order `Object.keys(extraConfig)` returns.

## R16
The system SHALL show a string value exactly as received, keeping its line breaks.

## R17
The system SHALL show a number or boolean value as `String(value)`.

## R18
The system SHALL show a `null`, array or object value as `JSON.stringify(value)`.

## R19
IF a string value is empty or contains only whitespace THEN the system SHALL show the text
`songDetail.extra_value_empty` in place of the value.

## R20
IF `extraConfig` is missing, is not a plain object, or has no keys THEN the system SHALL render the text
`songDetail.extra_empty` (`data-testid="song-detail-extra-empty"`) in the "Extra details" section instead of any
pair.

# Scope, states, language and layout

## R21
WHILE the detail page renders the user files and extra details, the system SHALL NOT send any HTTP request other
than the existing `GET /songs/:id` and the existing cover request (F26 R35).

## R22
WHILE the detail page is in the loading, not found, error or session expired state, the system SHALL NOT render
the "User files" or the "Extra details" section.

## R23
WHEN the active Transloco language changes on a loaded detail page, the system SHALL re-render the section
headings, kind labels, size values and empty texts in the new language without a new `GET /songs/:id` request.

## R24
The system SHALL have every new key under `songDetail` in both `public/i18n/es.json` and `public/i18n/en.json`,
each with a non-empty string value.

## R25
WHILE the viewport is 375px wide, the system SHALL render the two sections stacked in a single column without
horizontal page overflow.

## R26
WHILE the viewport is 1280px wide, the system SHALL render the "User files" and "Extra details" sections side by
side in two columns.
