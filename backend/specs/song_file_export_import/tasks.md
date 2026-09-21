# Tasks — song_file_export_import

- [x] T1 (R5, R7, R9) Add `SONG_FILE_KINDS`/`isSongFileKind` and the start of `getSongFile(userId,
      songId, kind, sortOrderParam, storage = getStorage())` to `src/songs/song-service.ts`: `isUuid`
      guard on `songId`, `isSongFileKind` guard on `kind`, and a `sortOrderParam` guard that only accepts
      an omitted value or a string matching `/^\d+$/` — each failure throws `SongError(..., 404)`.
- [x] T2 (R1, R2, R6, R8) Finish `getSongFile`: run the single `JOIN` query (`song_files` joined to
      `songs`, filtered by `songId`, `userId`, both tables' `deleted_at IS NULL`, `kind`, and
      `sort_order = ` the effective sort order) and throw `SongError("song file not found", 404)` when no
      row is returned.
- [x] T3 (R11) In `getSongFile`, after a matching row is found, call `storage.get(row.storage_key)`;
      throw a plain (non-`SongError`) `Error` if it returns `null`, letting it propagate uncaught rather
      than mapping it to 404; otherwise return the `SongFileContentDto` (`bytes`, `mimeType`,
      `originalFilename`).
- [x] T4 (R1, R2, R3, R4, R10) Wire `GET /songs/:id/files/:kind` onto `protectedRouter` in
      `src/index.ts`, calling `getSongFile` with `c.req.query("sort_order")`, responding via
      `c.body(bytes, 200, { "Content-Type": mimeType, "Content-Disposition": ... })` on success, and
      mapping `SongError` to `c.json({ error }, status)` on failure (any other thrown error propagates
      uncaught, per R11).
- [x] T5 (R1, R3, R4) Add a `getSongFile` test: seeding a song with a `preset` file, `getSongFile` with
      no `sort_order` returns bytes identical to the uploaded file, its stored `mimeType`, and its stored
      `originalFilename`.
- [x] T6 (R2) Add a `getSongFile` test: seeding a song with multiple `ir` files, `getSongFile` with
      `sort_order="1"` (and separately `"0"`) returns the bytes of the correct file among the several
      `ir` rows.
- [x] T7 (R5) Add a `getSongFile` test: a syntactically invalid `songId` (e.g. `"not-a-uuid"`) throws
      `SongError(404)`.
- [x] T8 (R6) Add `getSongFile` tests: a nonexistent song id, a soft-deleted song, and a song owned by a
      different user each throw `SongError(404)`.
- [x] T9 (R7) Add a `getSongFile` test: an unknown `:kind` string (e.g. `"midi"`) throws `SongError(404)`.
- [x] T10 (R8) Add a `getSongFile` test: a valid `:kind` with no matching `song_files` row for the song
      (e.g. requesting `cover` when none was uploaded, or `sort_order="5"` when only `0`/`1` exist)
      throws `SongError(404)`.
- [x] T11 (R9) Add a `getSongFile` test: a `sort_order` query value that isn't a non-negative integer
      (e.g. `"abc"`, `"-1"`) throws `SongError(404)`.
- [x] T12 (R11) Add a `getSongFile` test: a `song_files` row whose `storage_key` points at bytes that
      were removed from the injected `LocalFsStorageAdapter`'s directory after creation causes
      `getSongFile` to throw a non-`SongError` error (propagates, is not swallowed into a 404).
- [x] T13 (R1, R2, R3, R4) Add a real end-to-end test to `src/index.test.ts`: `POST /songs` (with
      `preset` and two `ir` files) through `app.request()`, then `GET /songs/:id/files/preset` and `GET
      /songs/:id/files/ir?sort_order=1`, asserting HTTP 200, byte-identical bodies, the `Content-Type`
      header, and the `Content-Disposition` header on each.
- [x] T14 (R10) Add a test to `src/index.test.ts`: `GET /songs/:id/files/:kind` without an
      `Authorization` header returns 401.
