# Tasks — plan_limits_enforcement

- [x] T1 (R6, R7) In `src/songs/song-service.ts`, move the existing `const db = getDb();` earlier in
  `createSong` and add the `SELECT plan FROM users WHERE id = ${userId}` lookup; throw
  `SongError("user not found", 404)` when no row is found.
- [x] T2 (R1, R2, R3, R4, R5) Add the exported `PLAN_SONG_LIMITS` constant and the live-song-count
  check (querying `songs` with `deleted_at IS NULL`), throwing
  `SongError(\`plan '${plan}' is limited to ${limit} songs\`, 402)` when the caller's plan has a
  numeric limit and their live count has reached it. Insert this before `songId`/`filesToCreate`/any
  `storage.put` call, per `design.md`.
- [x] T3 (R2, R7) Widen `SongError`'s `status` field type from `400 | 404` to `400 | 402 | 404`.
- [x] T4 (R1) Add a `song-service.test.ts` test: a free-plan user with 9 existing songs successfully
  creates a 10th.
- [x] T5 (R2, R3) Add a `song-service.test.ts` test: a free-plan user with 10 existing songs has an
  11th `createSong` call throw `SongError` with `status === 402` and a message containing `"free"` and
  `"10"`; assert no new `songs`/`song_files` row was created.
- [x] T6 (R4) Add a `song-service.test.ts` test: a user with `plan = 'paid'` can create 11+ songs
  without rejection.
- [x] T7 (R5) Add a `song-service.test.ts` test: a free-plan user with 10 songs, one soft-deleted, can
  create an 11th song successfully.
- [x] T8 (R7) Add a `song-service.test.ts` test: `createSong` called with a `userId` that has no
  matching `users` row throws `SongError` with `status === 404`.
- [x] T9 (R2, R3) Add an `index.test.ts` test: a free-plan user's 11th real `POST /songs` multipart
  request (after 10 successful ones) returns HTTP 402 with an `error` field naming the limit.
- [x] T10 (R6) Add an `index.test.ts` test: a token issued via `issueToken(userId, "paid")` for a user
  whose actual `users.plan` row is `free` is still capped at 10 songs through the real route, proving
  the DB value governs over the token's embedded claim.
