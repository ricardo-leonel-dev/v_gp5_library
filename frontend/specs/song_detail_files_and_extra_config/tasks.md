# Tasks — F33 `song_detail_files_and_extra_config`

Execute in order. Each task lists the requirement ids it covers. Test grouping follows design.md §8.

## Pure helpers (`src/app/songs/song.ts`)

- [x] T1 (R3, R4) Add `userFiles(files)`: drop `kind === 'cover'`, return a new array with `'ir'` before `'nam'`,
  each by `sortOrder` ascending; never mutate the input.
- [x] T2 (R9, R10, R11, R12) Add `FormattedByteSize` and `formatByteSize(bytes, lang)` per design §2: MB only
  (bytes / 1048576), `Intl.NumberFormat(lang, ...)` with exactly 2 decimals, `halfExpand`, no grouping; `0` →
  `size_mb` `0.00`; `1..5242` → `size_mb_below_min` `0.01`; non-finite or negative input treated as `0`.
- [x] T3 (R15, R16, R17, R18, R19, R20) Add `ExtraConfigValueKind`, `ExtraConfigEntry` and
  `extraConfigEntries(extraConfig: unknown)` per design §2.
- [x] T4 (R3, R4) `song.spec.ts`: `userFiles` with shuffled ir/nam/cover input; asserts order, cover dropped,
  input array unchanged.
- [x] T5 (R9, R10, R11, R12) `song.spec.ts`: `formatByteSize` in `en` and `es` at 0 → `size_mb` `'0.00'`/`'0,00'`;
  1 and 5242 → `size_mb_below_min` `'0.01'`/`'0,01'`; 5243 → `size_mb` `'0.01'`; 31457 → `'0.03'`/`'0,03'`;
  131072 → `'0.13'` (half away from zero); 1048576 → `'1.00'`; 1572864 → `'1.50'`/`'1,50'`; 1073741824 →
  `'1024.00'`/`'1024,00'` (no grouping); -1 and `NaN` → same as 0.
- [x] T6 (R15, R16, R17, R18, R19, R20) `song.spec.ts`: `extraConfigEntries` for string, multi-line string, `''`,
  `'  '`, number, boolean, `null`, array, nested object, key order preserved; `undefined`, `null`, array and `{}`
  inputs → `[]`.

## i18n

- [x] T7 (R24) Add the 9 `songDetail` keys from design.md "UI copy" to `public/i18n/en.json` and
  `public/i18n/es.json`.

## Component and template

- [x] T8 (R2, R8, R12, R15, R23) `song-detail-page.ts`: add `userFiles` and `extraEntries` computeds and the
  `fileSize(bytes, lang)` method; import the helpers.
- [x] T9 (R12, R23) `song-detail-page.html`: change the root to `*transloco="let t; currentLang as lang"`.
- [x] T10 (R1, R2, R3, R4, R5, R6, R7, R8, R13, R22, R25, R26) `song-detail-page.html`: after
  `song-reference-note`, inside the loaded branch, add the grid wrapper and the "User files" section with the
  row markup, kind tags, `title` on the filename, size text and empty state, using the Visual direction classes.
- [x] T11 (R14, R15, R16, R17, R18, R19, R20, R22, R25, R26) `song-detail-page.html`: add the "Extra details"
  section as a `<dl>` with the text / json / empty value variants and the empty state, using the Visual
  direction classes.

## Component tests (`song-detail-page.spec.ts`)

- [x] T12 (R1, R2, R3, R4, R5, R6, R7, R8) Loaded song with 2 IR + 1 NAM + 1 cover in shuffled order: section and
  heading present, 3 rows in ir→nam/sortOrder order, filename text and `title`, kind label text, size text.
- [x] T13 (R13, R20) Loaded song with only a cover file and `extraConfig: {}`: both empty texts present, no rows,
  no pairs. Repeat with `extraConfig` omitted.
- [x] T14 (R14, R15, R16, R19) Loaded song with mixed `extraConfig`: section and heading present, pairs in
  response order, `(empty)` text for a blank value, `whitespace-pre-wrap` on a multi-line text value.
- [x] T15 (R21) After load, `httpMock.expectNone` for `/files/ir` and `/files/nam` and `httpMock.verify()` with
  only `GET /songs/:id` (and the cover request when the fixture has a cover) handled.
- [x] T16 (R22) Loading, 404, 500 and 401 states: neither `song-detail-files` nor `song-detail-extra` is rendered.
- [x] T17 (R12, R23) Switch the active language `es` → `en` on a loaded page: heading and size text change
  (fixture file of 1572864 bytes: `'1,50 MB'` → `'1.50 MB'`) and no second `GET /songs/:id` is sent.
- [x] T18 (R24) i18n test: each of the 9 new `songDetail` keys exists in `es` and `en` as a non-empty string
  (same style as F30's R7 test in this file).
- [x] T19 (R25, R26) Layout contract test: wrapper has `grid-cols-1` and `lg:grid-cols-2`; file row has `min-w-0`;
  filename has `truncate`; size has `shrink-0`; `<dd>` text values have `break-words`.

## Verification

- [x] T20 (R25, R26) Manual check in the browser at 375px and 1280px with a song that has IR, NAM, a long
  filename and a long multi-line extra value: no horizontal page scroll at 375px, two columns at 1280px. Record
  the result in `progress/impl_song_detail_files_and_extra_config.md`.
- [x] T21 (R1-R26) Run `./init.sh`; record the R→test traceability table in
  `progress/impl_song_detail_files_and_extra_config.md`.
