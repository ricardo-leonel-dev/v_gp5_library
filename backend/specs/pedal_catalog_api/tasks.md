# Tasks — pedal_catalog_api

- [x] T1 (R2, R3) Add `src/pedals/pedal-service.ts`: `PedalError` (mirrors `SongError`/`AuthError`,
      `status: 400`), `UploadedFile`/`CreatePedalInput`/`PedalDto` types, and the start of
      `createPedal(userId, input, storage = getStorage())` — validate `name` is present/non-empty and
      `image.length === 1`; throw `PedalError(..., 400)` on either failure before any DB/storage call.
- [x] T2 (R1, R4) Finish `createPedal`: generate `pedalId`, write the image's bytes via `storage.put`
      under key `pedals/<pedalId>`, then `INSERT INTO pedal_catalog (id, name, reference_image_key,
      created_by)`; return the built `PedalDto`.
- [x] T3 (R6) Add `listPedals()` to `pedal-service.ts`: `SELECT` every `pedal_catalog` row with
      `deleted_at IS NULL`, ordered by `created_at DESC`, mapped to `PedalDto[]` — no `userId` parameter.
- [x] T4 (R1) Add `src/pedals/parse-multipart.ts` exporting `parseCreatePedalMultipart(body)`, converting
      Hono's `parseBody({ all: true })` output into a `CreatePedalInput` (reading the `image` file's
      bytes via `arrayBuffer()`).
- [x] T5 (R1, R5) Wire `POST /pedals` onto `protectedRouter` in `src/index.ts`, calling into
      `pedal-service.ts` and mapping `PedalError` to `c.json({ error }, status)` (matching the existing
      `SongError`/`AuthError` handling), responding `201` with the created pedal on success.
- [x] T6 (R5, R6) Wire `GET /pedals` onto `protectedRouter` in `src/index.ts`, calling `listPedals()` and
      responding `200` with the JSON array.
- [x] T7 (R2, R3) Add `src/pedals/pedal-service.test.ts` (fresh `mkdtemp()` + injected
      `LocalFsStorageAdapter` per test, per `docs/conventions.md`): `createPedal` rejects with
      `PedalError(400)` for a missing/empty `name`, and for zero or multiple `image` files — asserting no
      `pedal_catalog` row was inserted in each case.
- [x] T8 (R1, R4) Add a test: a valid `createPedal` call returns a `PedalDto` with the expected `name`
      and `createdBy`, and the image's bytes round-trip via `storage.get(reference_image_key)` — querying
      the DB row directly for `reference_image_key` since `PedalDto` doesn't expose it.
- [x] T9 (R6) Add a test: `listPedals` returns pedals created by more than one distinct user (proving no
      `created_by` filtering) and excludes a pedal whose `deleted_at` was set directly via SQL (proving
      the soft-delete filter, even though no route in this feature sets it).
- [x] T10 (R5) Add tests to `src/index.test.ts`: each of `POST /pedals` and `GET /pedals` returns 401
      when requested without an `Authorization` header.
- [x] T11 (R1) Add a test to `src/index.test.ts`: a real `POST /pedals` request with a `FormData` body
      (including an `image` file) through `app.request()` with a valid bearer token returns 201 with the
      expected pedal shape, proving the route is actually wired end-to-end.
- [x] T12 (R6) Add a test to `src/index.test.ts`: `POST /pedals` as user A, then `GET /pedals` as user B
      (a second registered/logged-in user) through `app.request()` includes user A's pedal in the
      response — proving the shared-catalog behavior end-to-end through the HTTP layer, which
      `pedal-service.test.ts`'s direct-DB test (T9) alone doesn't exercise.
