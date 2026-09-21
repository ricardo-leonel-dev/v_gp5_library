# Tasks — song_pedal_configs_api

- [x] T1 (R4) Add `src/song-pedal-configs/song-pedal-config-service.ts`: `SongPedalConfigError` (mirrors
      `SongError`/`PedalError`, `status: 400 | 404`), `CreateSongPedalConfigInput`/`SongPedalConfigDto`
      types, import `isUuid` from `../songs/song-service`; start `createSongPedalConfig(userId, songId,
      input)` — validate `input.label` is present/non-empty, throwing `SongPedalConfigError(..., 400)`
      otherwise.
- [x] T2 (R2, R3) In `createSongPedalConfig`: guard `isUuid(songId)` (else 404); `SELECT` the song by
      `id`/`user_id`/`deleted_at IS NULL` (else 404) — both before any write.
- [x] T3 (R5) In `createSongPedalConfig`: validate `input.pedalCatalogId` is a syntactically valid UUID
      and matches an existing, non-soft-deleted `pedal_catalog` row (else `SongPedalConfigError(..., 400)`).
- [x] T4 (R6, R7, R8) In `createSongPedalConfig`: validate `input.config` — `undefined` -> `{}`;
      non-null/non-array object -> stored as-is; anything else -> `SongPedalConfigError(..., 400)`.
- [x] T5 (R1) Finish `createSongPedalConfig`: `INSERT INTO song_pedal_configs (id, song_id, user_id,
      pedal_catalog_id, label, config) ... RETURNING ...`; map the row to `SongPedalConfigDto`.
- [x] T6 (R10, R11) Add `listSongPedalConfigs(userId, songId)`: `isUuid` + song-ownership guard (404 if
      either fails); `SELECT` rows filtered by `song_id`, `user_id`, `deleted_at IS NULL`, ordered by
      `created_at DESC`, mapped to `SongPedalConfigDto[]`.
- [x] T7 (R2, R12, R13) Add `deleteSongPedalConfig(userId, songId, configId)`: `isUuid` guard on both ids
      (else 404); song-ownership `SELECT` guard (else 404); filtered `UPDATE ... SET deleted_at = NOW()
      ... RETURNING id` (zero rows -> 404; a row -> resolve).
- [x] T8 (R1, R9) Wire `POST /songs/:id/pedals` onto `protectedRouter` in `src/index.ts`: `c.req.json()`,
      call `createSongPedalConfig`, map `SongPedalConfigError` to `c.json({ error }, status)`, respond
      `201` with the created row on success.
- [x] T9 (R9, R10, R11) Wire `GET /songs/:id/pedals` onto `protectedRouter` in `src/index.ts`, calling
      `listSongPedalConfigs` and responding `200` with the JSON array (mapping `SongPedalConfigError` the
      same way).
- [x] T10 (R9, R12, R13) Wire `DELETE /songs/:id/pedals/:configId` onto `protectedRouter` in
      `src/index.ts`, calling `deleteSongPedalConfig` and responding `204` on success (mapping
      `SongPedalConfigError` the same way).
- [x] T11 (R4) Add `src/song-pedal-configs/song-pedal-config-service.test.ts`: `createSongPedalConfig`
      rejects `SongPedalConfigError(400)` for a missing/empty `label`, asserting no row was inserted.
- [x] T12 (R5) Add a test: `createSongPedalConfig` rejects `400` for a missing, syntactically invalid,
      nonexistent, or soft-deleted `pedal_catalog_id`, asserting no row was inserted.
- [x] T13 (R6, R7, R8) Add tests: a valid `config` object is stored as given; a non-object `config`
      (string/number/array/`null`) is rejected with `400`; an omitted `config` defaults to `{}`.
- [x] T14 (R1) Add a test: a valid `createSongPedalConfig` call returns a `SongPedalConfigDto` with the
      expected `label`/`pedalCatalogId`/`config`, and the inserted row's `user_id` equals the caller.
- [x] T15 (R3) Add a test: `createSongPedalConfig` rejects `404` for a song that doesn't exist, is
      soft-deleted, or is owned by a different user.
- [x] T16 (R10, R11) Add tests: `listSongPedalConfigs` returns only the caller's own non-soft-deleted rows
      for the given song — excluding a different user's row (on a different song, referencing the same
      `pedal_catalog_id`) and excluding a row whose `deleted_at` was set directly via SQL; rejects `404`
      for a song not owned by the caller.
- [x] T17 (R12, R13) Add tests: `deleteSongPedalConfig` sets `deleted_at` on a row it owns (a subsequent
      `listSongPedalConfigs` call excludes it); rejects `404` without modifying any row for a config that
      doesn't exist, is already soft-deleted, belongs to a different song, or is owned by a different
      user.
- [x] T18 (R2) Add tests: `createSongPedalConfig`/`listSongPedalConfigs`/`deleteSongPedalConfig` each
      reject `404` for a syntactically invalid `songId` (and `deleteSongPedalConfig` for an invalid
      `configId`).
- [x] T19 (R9) Add tests to `src/index.test.ts`: each of `POST /songs/:id/pedals`, `GET
      /songs/:id/pedals`, and `DELETE /songs/:id/pedals/:configId` returns `401` when requested without an
      `Authorization` header.
- [x] T20 (R1) Add a test to `src/index.test.ts`: a real `POST /songs/:id/pedals` JSON request through
      `app.request()` with a valid bearer token, against a song and pedal the caller owns, returns `201`
      with the expected shape — proving the route is wired end-to-end.
- [x] T21 (R3) Add a test to `src/index.test.ts`: `POST /songs/:id/pedals` as user B against a song owned
      by user A returns `404` — the acceptance criterion's own explicit example, proven end-to-end.
- [x] T22 (R10) Add a test to `src/index.test.ts`: user A and user B each create a `song_pedal_configs`
      row on their own song referencing the same shared `pedal_catalog_id`; `GET /songs/:id/pedals` for
      user A's song, as user A, includes only user A's row — proving the "never another user's for the
      same `pedal_catalog_id`" acceptance criterion end-to-end.
- [x] T23 (R12) Add a test to `src/index.test.ts`: an end-to-end `POST` then `DELETE
      /songs/:id/pedals/:configId` returns `204`, and a subsequent `GET /songs/:id/pedals` no longer
      includes the deleted row.
