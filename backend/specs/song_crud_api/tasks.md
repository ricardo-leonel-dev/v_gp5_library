# Tasks — song_crud_api

- [x] T1 (R13) Add `src/storage/index.ts` exporting `getStorage(): StorageAdapter`, a lazily-constructed
      singleton backed by `LocalFsStorageAdapter` rooted at `process.env.STORAGE_DIR ?? "./storage"`,
      mirroring `getDb()` in `src/db/client.ts`.
- [x] T2 (R2, R3, R7, R9) Add `src/songs/song-service.ts`: `SongError` (mirrors `AuthError`),
      `UploadedFile`/`CreateSongInput`/`SongFileDto`/`SongDto`/`SongWithFilesDto` types, and the start
      of `createSong(userId, input, storage = getStorage())` — validate `name` is present/non-empty,
      `preset.length === 1`, `cover.length <= 1`, and (if `extraConfig` is defined) that it parses as a
      JSON object; throw `SongError(..., 400)` on any failure before any DB/storage call.
- [x] T3 (R1, R6, R8, R10, R11, R12, R13) Finish `createSong`: generate `songId`/per-file `fileId`s,
      write every file's bytes via `storage.put` under `songs/<songId>/<fileId>` keys, then in one
      `db.begin` transaction insert the `songs` row (defaulting `extra_config` to `{}`,
      `artist`/`pedal_preset_name` to `NULL` when omitted) and one `song_files` row per file; return the
      built `SongWithFilesDto`.
- [x] T4 (R4, R5) Within `createSong`, assign `sort_order` to each `ir`/`nam` `song_files` row equal to
      its zero-based position among the files of that kind in the request.
- [x] T5 (R18) Add an exported `isUuid(value: string): boolean` helper to `song-service.ts`.
- [x] T6 (R15) Add `listSongs(userId)` to `song-service.ts`: `SELECT` only the caller's `songs` rows
      with `deleted_at IS NULL`, mapped to `SongDto[]` (no files).
- [x] T7 (R16, R17) Add `getSongById(userId, songId)` to `song-service.ts`: `isUuid` guard, then 404
      (`SongError`) unless the song exists, is non-deleted, and is owned by the caller; otherwise return
      the song plus its non-deleted `song_files` rows ordered by `kind`, `sort_order`.
- [x] T8 (R19, R20) Add `deleteSong(userId, songId)` to `song-service.ts` (no `storage` parameter — it
      never touches storage): `isUuid` guard, then in one `db.begin` transaction look up the caller's
      non-deleted song (`404` `SongError`, rolling back with no modification if missing/foreign),
      soft-delete it and its non-deleted `song_files` rows.
- [x] T9 (R1) Add `src/songs/parse-multipart.ts` exporting `parseCreateSongMultipart(body)`, converting
      Hono's `parseBody({ all: true })` output into a `CreateSongInput` (reading each `File`'s bytes via
      `arrayBuffer()`).
- [x] T10 (R1, R14) Wire `POST /songs`, `GET /songs`, `GET /songs/:id`, `DELETE /songs/:id` onto
      `protectedRouter` in `src/index.ts`, calling into `song-service.ts` and mapping `SongError` to
      `c.json({ error }, status)` (matching the existing `AuthError` handling); `DELETE` responds `204`
      with no body.
- [x] T11 (R2, R3, R7, R9) Add `src/songs/song-service.test.ts` (fresh `mkdtemp()` + injected
      `LocalFsStorageAdapter` per test, per `docs/conventions.md`): `createSong` rejects with
      `SongError(400)` for a missing/empty `name`, for zero or multiple `preset` files, for more than
      one `cover` file, and for an `extraConfig` that isn't valid-JSON-object text — asserting no
      `songs`/`song_files` row was inserted in each case.
- [x] T12 (R1, R6, R8, R10, R11, R12, R13) Add a test: a valid `createSong` call with `preset` +
      `artist` + `pedalPresetName` + `extraConfig` returns a `SongWithFilesDto` with those fields and a
      `preset` `song_files` row whose bytes round-trip via `storage.get(storageKey)`; a second call
      omitting `artist`/`pedalPresetName`/`extraConfig` stores `null`/`null`/`{}` respectively.
- [x] T13 (R4, R5) Add a test: multiple `ir` and multiple `nam` files each get sequential `sort_order`
      starting at 0 (independently per kind), and their bytes are each individually retrievable via
      `storage.get`.
- [x] T14 (R15) Add a test: `listSongs` for user A returns only user A's non-deleted songs, excluding
      both a soft-deleted song of A's and a song belonging to user B.
- [x] T15 (R16, R17) Add tests: `getSongById` returns the song + ordered files for the owning user, and
      throws `SongError(404)` for a nonexistent id, a soft-deleted song, and a song owned by another
      user.
- [x] T16 (R18) Add a test: `getSongById`/`deleteSong` with a syntactically invalid `:id` (e.g.
      `"not-a-uuid"`) throw `SongError(404)`.
- [x] T17 (R19, R20) Add tests: `deleteSong` sets `deleted_at` on the song and its files while every
      file's bytes remain retrievable via `storage.get` unchanged (storage is never touched); `deleteSong`
      on a nonexistent, already-deleted, or foreign-owned song throws `SongError(404)` and leaves the
      target row(s) unmodified.
- [x] T18 (R14) Add tests to `src/index.test.ts`: each of `POST /songs`, `GET /songs`, `GET /songs/:id`,
      `DELETE /songs/:id` returns 401 when requested without an `Authorization` header.
- [x] T19 (R1) Add a test to `src/index.test.ts`: a real `POST /songs` request with a `FormData` body
      (including a `preset` file) through `app.request()` with a valid bearer token returns 201 with the
      expected song+files shape, proving the route is actually wired end-to-end.
