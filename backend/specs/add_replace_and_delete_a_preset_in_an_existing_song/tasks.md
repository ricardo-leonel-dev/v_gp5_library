# Tasks — add_replace_and_delete_a_preset_in_an_existing_song

Execute in order. Design references are to `design.md` in this folder.

## Plumbing

- [x] T1 (R17, R18) In `src/plans/plan-service.ts`, extract `checkPresetsPerSongLimit(plan, presetCount)` from
  `checkPlanLimits` and make `checkPlanLimits` call it; add a `plan-service.test.ts` case for the boundary
  (`free`: 1 ok, 2 throws `plan_preset_limit` with `limit: 1`; `premium`: never throws). Existing plan-tier
  tests must stay green.
- [x] T2 (R2, R3, R4, R5, R27, R28, R37) In `src/songs/song-service.ts`, widen `SongError` status to
  `400 | 404 | 409`; add `MAX_SORT_ORDER` and `parseSortOrderParam` (unit test: `"0"`, `"3"` ok; `"-1"`,
  `"1.5"`, `"abc"`, `""`, `"2147483648"` → `null`).
- [x] T3 (R14, R15, R16, R27, R39, R40) Add `PRST_BYTE_SIZE = 507` to `src/songs/song-service.ts` and
  `validateSinglePreset(files)` with the four 400 messages from the error table, checked in the order count,
  size, name (size before name); add `parsePresetMultipart(body)` in `src/songs/parse-multipart.ts`. Do not
  call either from `createSong` (`POST /songs` is unchanged).
- [x] T4 (R6, R14, R31, R38) Add a test helper (song-service tests) that builds a `.prst` with an arbitrary name by copying
  fixture 0 and writing the name NUL-padded into `0x19..0x28`; add a storage spy wrapping
  `LocalFsStorageAdapter` that records `put`/`delete` calls and can throw on `delete`; add a "nothing changed"
  snapshot helper (song's `song_files` rows + `songs.updated_at` + spy calls).

## Add

- [x] T5 (R2, R9, R10, R11, R12, R17, R20, R21, R22, R23, R7) Implement `addSongPreset` per design
  ("Check order", "`addSongPreset`"): song lock `FOR UPDATE`, limit check with `count + 1`, name check,
  `max + 1`, put after checks, insert, touch `songs.updated_at`.
- [x] T6 (R1, R5, R8, R18) Register `POST /songs/:id/presets` in `src/index.ts` with the `PlanLimitError`
  → 402 mapping before `SongError`.
- [x] T7 (R9, R10, R11, R12, R13, R6, R7) Tests: add to a 2-preset song → 201, exact DTO keys, `sortOrder`
  2, name from bytes, filename/mime/size from part, export at `sort_order=2` returns the bytes, other rows
  unchanged, `songs.updated_at` advanced.
- [x] T8 (R14, R15, R16, R22, R39, R40) Tests: zero parts, a `preset` string field instead of a file, two
  parts, 507 unreadable bytes, fixture 0 cut to 506 bytes, fixture 0 extended to 508 bytes → 400 with nothing
  changed; a 506-byte buffer that also has no readable name → 400 with the size message; one of them on a
  `free` song already at its limit → still 400.
- [x] T9 (R17, R18, R19, R21) Tests: `free` user with a 1-preset song → 402, exact body keys,
  `code: "plan_preset_limit"`, `plan: "free"`, `limit: 1`, nothing changed; same with a duplicate name →
  still 402; `basic` with 2 → 402; `premium` with 3 → 201.
- [x] T10 (R20) Test: upload whose name equals an existing preset's name → 409 `{error}`, nothing changed.
- [x] T11 (R2, R5) Tests: non-UUID id, another user's song, soft-deleted song → 404 `{error}`, nothing
  changed for the other user's song.
- [x] T12 (R23) Test: two concurrent `addSongPreset` calls with different names on one `premium` song → both
  succeed with distinct `sortOrder` values; song ends with contiguous sort orders.

## Replace

- [x] T13 (R2, R3, R4, R24, R26, R28, R29, R30, R31, R32, R7) Implement `replaceSongPreset` per design: target
  lookup, name check against other rows only, no plan check, new storage key, `UPDATE ... RETURNING`, touch
  `songs.updated_at`, post-commit best-effort `storage.delete(oldKey)` with `console.warn`.
- [x] T14 (R1, R5, R8) Register `PUT /songs/:id/presets/:sortOrder` (200, `SongError` mapping).
- [x] T15 (R24, R25, R26, R6, R7, R31) Tests: replace preset at `sortOrder` 1 of a 3-preset song with a
  new-name file → 200, same `id`/`sortOrder`/`createdAt`, new name/filename/size, export returns new bytes,
  other rows unchanged, `songs.updated_at` advanced, spy saw `delete(oldKey)`.
- [x] T16 (R29, R30) Tests: re-upload with the target's own name → 200; `free` user whose song holds 3
  presets (downgraded) → replace 200.
- [x] T17 (R27, R28, R40) Tests: zero/two/unreadable/506-byte/508-byte parts → 400 nothing changed; a
  506-byte unreadable part → 400 with the size message; name of a different preset → 409 nothing changed.
- [x] T18 (R3, R4, R32) Tests: `:sortOrder` `abc`, `-1`, `2147483648` → 404; `sortOrder` 5 on a 3-preset song
  → 404; spy throwing on `delete` → still 200 and the row points at the new bytes.

## Delete

- [x] T19 (R2, R3, R4, R33, R34, R35, R36, R37, R38, R7) Implement `deleteSongPreset` per design: lock,
  only-preset 409, soft-delete, ascending one-row-at-a-time shift, touch `songs.updated_at`, no storage call.
- [x] T20 (R1, R5, R8) Register `DELETE /songs/:id/presets/:sortOrder` (`c.body(null, 204)`).
- [x] T21 (R33, R34, R35, R36, R38, R7) Tests: song with 3 presets + an `ir` and a `cover`, delete
  `sortOrder` 0 → 204 empty body; deleted row still present with `deleted_at` set; remaining presets
  `0, 1` with the former 1 and 2 ids in order; export `sort_order=0` returns the former preset 1 bytes;
  `ir`/`cover` rows unchanged; no spy `delete`; `songs.updated_at` advanced. A second case deletes the last
  position (`sortOrder` 2) and asserts lower rows unchanged.
- [x] T22 (R37, R3, R4) Tests: delete the only preset → 409 nothing changed; malformed and missing
  `:sortOrder` → 404.

## HTTP and wrap-up

- [x] T23 (R1, R8, R5) `index.test.ts`: the three endpoints without a token → 401; `GET`/`PATCH` on
  `/songs/:id/presets` and `/songs/:id/presets/0` with a token → 404 and nothing changed; one end-to-end
  round trip over `app.request` (POST 201 → PUT 200 → DELETE 204 → `GET /songs/:id` shows the expected
  `presets`) with error bodies checked for exactly `{error}`. Confirm the existing
  `multiple_presets_per_song` R29 test and the existing `POST /songs` tests still pass unchanged.
- [x] T24 (R1–R40) Run `./init.sh`; write the traceability table (every `R<n>` → test name) in
  `progress/impl_add_replace_and_delete_a_preset_in_an_existing_song.md`.
