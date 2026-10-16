# Tasks — plan_tiers_songs_and_presets_per_song_limits

- [x] T1 (R1, R2, R3, R4, R5) Create `src/db/migrations/0005_plan_tiers.sql` with the design.md SQL and
  a header comment (legacy values → `premium`, CHECK on the three tiers, no songs/files touched). Run
  `bun run migrate`.
- [x] T2 (R1, R2, R3, R4, R5) In `src/db/migrate.test.ts`, add `0005_plan_tiers.sql` to the expected
  `schema_migrations` list. Add tests:
  - `UPDATE users SET plan = 'gold'` on a fresh user is rejected; `free`/`basic`/`premium` are accepted
    (R1).
  - Drop `users_plan_tier`, set a fresh user to `'paid'` and others to `free`/`basic`/`premium`, record
    `users`/`songs`/`song_files` counts, re-execute the 0005 SQL via `db.unsafe(await readFile(...))`:
    the `'paid'` user is `premium` (R2), the tier users are unchanged (R3), row counts are unchanged
    (R4), and the constraint exists again.
  - Re-executing the 0005 SQL on the migrated database does not throw (R5).
- [x] T3 (R6, R7, R8, R9, R10, R11, R12, R13, R18, R21, R22, R23) Create `src/plans/plan-service.ts`
  with `Plan`, `PlanLimits`, `PLAN_LIMITS`, `PlanLimitCode`, `PlanLimitError`, `PlanError`,
  `PlanSummaryDto`, `getUserPlan`, `countLiveSongs`, `checkPlanLimits`, `getPlanSummary` per design.md.
  No import from `src/songs/`.
- [x] T4 (R7, R9, R11, R12, R13, R15, R21, R22, R23) Create `src/plans/plan-service.test.ts` with pure
  tests of `checkPlanLimits` at every boundary: free (0 songs, 1 preset → ok; 1 song → song limit;
  0 songs, 2 presets → preset limit), basic (1 song, 2 presets → ok; 2 songs → song limit; 1 song,
  3 presets → preset limit), premium (100 songs, 50 presets → ok), and free with 1 song + 2 presets →
  `plan_song_limit`. Assert each thrown error's `code`, `plan`, `limit`. Assert `PLAN_LIMITS` equals the
  tier table.
- [x] T5 (R6, R7, R8, R9, R10, R11, R12, R13, R16, R17, R19) In `src/songs/song-service.ts`, replace
  the `PLAN_SONG_LIMITS` constant and inline plan/count block with the design.md `getUserPlan` /
  `countLiveSongs` / `checkPlanLimits` call, in the same position (after all 400 checks, before any
  `storage.put`). Keep the `user not found` 404. Narrow `SongError`'s status union if no other 402 use
  remains.
- [x] T6 (R14, R15) In `src/index.ts`, make `POST /songs` catch `PlanLimitError` before `SongError` and
  respond 402 with `{ error, code, plan, limit }`.
- [x] T7 (R20, R24, R25, R26) In `src/index.ts`, add `protectedRouter.get("/me/plan", ...)` calling
  `getPlanSummary`, mapping `PlanError` to `{error}` with its status.
- [x] T8 (R6, R8, R10) Update test helpers so ordinary tests do not hit the new limits:
  `song-service.test.ts` `makeUser` creates `premium` users unless given a plan; `index.test.ts`
  `makeUserToken` and every test that registers through `/auth/register` and then creates more than one
  song or a multi-preset song sets `plan = 'premium'`. Grep the test suite for `'paid'` and replace or
  remove every use (the CHECK now rejects it). Run the full suite and confirm no unexpected 402.
- [x] T9 (R6, R7, R8, R9, R10, R11, R12, R13, R16, R17, R18) Replace the feature-9 limit tests in
  `song-service.test.ts` and the F15 "R30" test with `createSong` boundary tests:
  - free: 0 live songs + 1 preset → created (R6); 1 live song → `PlanLimitError` `plan_song_limit`,
    limit 1 (R7); 0 live songs + 2 presets → `plan_preset_limit`, limit 1 (R11); 1 live song + 2
    presets → `plan_song_limit` (R13).
  - basic: 1 live song + 2 presets → created (R8); 2 live songs → `plan_song_limit`, limit 2 (R9);
    1 live song + 3 presets → `plan_preset_limit`, limit 2 (R12).
  - premium: 3 live songs + 3 presets → created (R10).
  - Every rejection: no new `songs`/`song_files` rows for the user and no stored objects (count files in
    the temp storage dir or use a recording adapter) (R16).
  - free user with 1 soft-deleted song and 0 live songs → created (R18).
  - free user with 1 live song sending an empty `name` → `SongError` 400, not 402 (R17).
- [x] T10 (R7, R11, R14, R15, R16, R19) Replace the feature-9 HTTP tests in `src/index.test.ts`:
  - free user: first `POST /songs` → 201; second → 402 with body keys exactly
    `error, code, plan, limit`, `code = "plan_song_limit"`, `plan = "free"`, `limit = 1`, and
    `GET /songs` still has 1 song (R7, R14, R15, R16).
  - free user, first `POST /songs` with 2 presets → 402, `code = "plan_preset_limit"`, `limit = 1`
    (R11, R14, R15).
  - Stale claim: token issued as `premium` for a `free` DB user is capped at 1 song (R19).
- [x] T11 (R20, R21, R22, R23, R24, R25, R26) Add `GET /me/plan` tests in `src/index.test.ts`:
  - free user with 0 songs → 200,
    `{ plan: "free", limits: { songs: 1, presetsPerSong: 1 }, usage: { songs: 0 } }` (R20, R21, R24).
  - basic user → limits `{ songs: 2, presetsPerSong: 2 }` (R22).
  - premium user with 3 live songs and 1 soft-deleted → limits `{ songs: null, presetsPerSong: null }`,
    `usage.songs = 3` (R23, R24, R18).
  - after changing `users.plan` from `free` to `basic` in the DB, the same token's `GET /me/plan`
    returns `basic` (R19).
  - no token → 401 (R25); valid token for a random UUID with no `users` row → 404 (R26).
- [x] T12 (R27, R28, R29) Add over-limit readability tests in `src/index.test.ts`: create a `premium`
  user with 3 songs, one of them with 3 presets, then `UPDATE users SET plan = 'free'`.
  `GET /songs` returns all 3 songs (R27); `GET /songs/:id` for the 3-preset song returns 3 presets
  (R28); `GET /songs/:id/files/preset?sort_order=0|1|2` each return 200 (R29).
- [x] T13 (R1–R29) Run `./init.sh`; all green. Write the R→test traceability map in
  `progress/impl_plan_tiers_songs_and_presets_per_song_limits.md`.
