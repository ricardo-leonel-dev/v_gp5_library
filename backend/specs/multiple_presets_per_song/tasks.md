# Tasks — multiple_presets_per_song

- [x] T1 (R7, R15) Copy `external_docs/02-TLDLXAMP.prst`, `36-TLAC3CL1.prst` and `55-TLPLXSLO.prst`
  (repo root, one level above `backend/`) byte-for-byte into `src/songs/fixtures/`. Add a small test
  helper that loads a fixture by name relative to `import.meta.dir`, for reuse by the test files below.
- [x] T2 (R7, R8, R9, R10, R11) Create `src/songs/prst-name.ts` with `readPresetName` and the
  `PRST_*` constants, following the algorithm in design.md.
- [x] T3 (R7, R8, R9, R10, R11) Create `src/songs/prst-name.test.ts`:
  - The 3 fixtures return `"TL DLX AMP"`, `"TL AC3 CL1"`, `"TL PLX SLO"`.
  - A copy of a fixture whose 16 name bytes are all printable (no NUL) returns all 16 chars.
  - 40 bytes → `null`; 41 bytes with a valid header and name → the name.
  - A fixture with byte 0 changed → `null`.
  - Name byte `0x19` = `0x00` → `null`; name field all spaces → `null`.
  - A name containing `0x07` or `0xC3` before the NUL → `null`.
- [x] T4 (R1, R2, R3, R4, R5, R6) Create `src/db/migrations/0004_multiple_presets_per_song.sql` with the
  design.md SQL and a header comment saying what it supersedes and that there is no backfill. Run
  `bun run migrate`.
- [x] T5 (R1, R2, R3) In `src/db/migrate.test.ts`, add `0004_multiple_presets_per_song.sql` to the
  expected `schema_migrations` list. Add tests: `songs.pedal_preset_name` does not exist;
  `song_files.pedal_preset_name` is nullable, `character_maximum_length = 255`, no default; re-executing
  the 0004 SQL via `db.unsafe(await readFile(...))` does not throw.
- [x] T6 (R4, R5, R6) In `migrate.test.ts`, replace "a second active preset song_files row for the same
  song is rejected (R10, R11)" with: two active preset rows with `sort_order` 0 and 1 are accepted; a
  second active preset row with the same `sort_order` is rejected; an `ir` row with a non-`NULL`
  `pedal_preset_name` is rejected. Keep the existing R8 soft-delete replacement test.
- [x] T7 (R18) In `src/songs/parse-multipart.ts` and `CreateSongInput`, remove `pedalPresetName` /
  `pedal_preset_name`. Remove `pedalPresetName` from every `CreateSongInput` literal in tests.
- [x] T8 (R12, R13, R14, R15, R16, R17) In `createSong`, apply the design.md validation order and error
  messages, call `readPresetName` on every preset before any storage write, create one preset row per
  part with `sort_order = i`, its own storage key and its parsed `pedal_preset_name`, and stop writing
  `songs.pedal_preset_name`.
- [x] T9 (R19, R20, R21, R22, R23, R24, R25) Add `SongPresetDto` and `toSongPresetDto`; add `presets` to
  `SongDto` and remove `pedalPresetName`. Populate `presets` in `createSong`, `getSongById` and
  `listSongs` (one grouped query scoped by `s.user_id`). Exclude preset rows from `files`. Drop
  `pedal_preset_name` from every `songs` SELECT.
- [x] T10 (R12, R13, R14, R15) Switch `presetFile()` in `song-service.test.ts` and every success-path
  inline `preset` part in `src/index.test.ts` to real fixtures (design.md, "Invalidated requirements and
  tests"). Rewrite "two preset files -> SongError(400) (R3)" to assert success. Add tests:
  - 3 presets (the 3 fixtures) create 3 rows with `sort_order` 0, 1, 2 in send order, each row's
    `pedal_preset_name` equal to its fixture's name.
  - Two presets with identical bytes get distinct storage keys, and both read back.
- [x] T11 (R16, R17) In `song-service.test.ts`: zero presets → 400 with the new message (update the
  existing test). A request whose second preset is a non-GP-5 byte array → 400 naming position 1, with no
  `songs`/`song_files` rows for the user and no `storage.put` call (use a recording adapter or count
  objects in the temp storage dir).
- [x] T12 (R18) In `src/index.test.ts`, `POST /songs` with a fixture preset plus a
  `pedal_preset_name=Bogus` part → 201, `presets[0].name` is the fixture's name, and the stored row
  matches.
- [x] T13 (R19, R20, R21, R22, R23, R24, R25) In `song-service.test.ts`:
  - `createSong`, `getSongById` and `listSongs` return `presets` ordered by `sortOrder`, with exactly the
    R21 fields.
  - A preset row soft-deleted directly in the DB is omitted from `presets`.
  - `files` contains no `preset` element and still contains every ir/nam/cover row; rewrite the
    `["cover","ir","nam","nam","preset"]` assertion.
  - No song object has a `pedalPresetName` property; rewrite the two old `pedalPresetName` tests
    (song_crud_api R11/R12) to cover `artist`/`extraConfig` only.
  - `listSongs` does not include another user's presets.
- [x] T14 (R26, R27, R28) In `song-service.test.ts` and `src/index.test.ts`, create a song with the 3
  fixtures. Assert `GET /songs/:id/files/preset?sort_order=0|1|2` returns each fixture's exact bytes,
  omitting `sort_order` returns preset 0's bytes, and `sort_order=3` returns 404.
- [x] T15 (R12, R13, R19) In `src/index.test.ts`, an HTTP `POST /songs` with 3 repeated `preset` parts:
  the 201 body's `presets` order and names match the send order.
- [x] T16 (R29) In `src/index.test.ts`, send authenticated `PUT`/`PATCH /songs/:id` and
  `POST`/`PUT`/`PATCH`/`DELETE /songs/:id/files/preset` against a real song. Assert each returns 404 and
  the song's preset rows (ids, `sort_order`, names, bytes) are unchanged.
- [x] T17 (R30) In `song-service.test.ts`, give a `free` user 9 live songs, then call `createSong` with 3
  presets; assert success. The existing 10-song → 402 test must still pass (with fixture presets).
- [x] T18 (R1–R30) Run `./init.sh` until fully green. Write the R→test traceability map to
  `progress/impl_multiple_presets_per_song.md`.
