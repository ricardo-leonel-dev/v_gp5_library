# Tasks — F31 `song_preset_draft_save`

Prerequisites (not implementer tasks, both satisfied 2026-10-18): F27 `done` (D1); backend feature 21
`POST /songs/:id/presets` `done` (D2, no block needed). Former F27 task ids are noted in parentheses. Run only the
named spec files with `scripts/harness.sh test <file...>` while iterating.

- [x] T1 (R5, R6, R7) (was F27 T6) In `src/app/songs/preset-draft.spec.ts` add an `it.each` table for the
  existing `mapSaveDraftError` over 402/409/0/401/404/400/500/503 and `new Error('x')` (R7 f). Change
  `preset-draft.ts` only if a row fails.
- [x] T2 (R3) (was F27 T7) In `src/app/songs/songs-api.service.spec.ts` add the request-shape test (POST, URL,
  single `preset` `File` of 507 bytes with the given filename, resolves with the flushed `SongPreset`), then add
  `SongsApi.addSongPreset` to `songs-api.service.ts`.
- [x] T3 (R1, R2, P1) (plan-limit part of F27 T11) In `song-detail-page.spec.ts` add the R1 a–e table and the R2
  tests, and update the F27 R10 Duplicate test to flush one `GET /me/plan` (P1); then inject `PlanApi`, add
  `plan`/`ensurePlan` (called from `onDuplicate` via `Promise.all`), `atPresetLimit`, and the limit hint.
- [x] T4 (R4, R5, R6, R7, R8, R9, R10) (was F27 T13) In `song-detail-page.spec.ts` add the save tests (R4 a–d incl. the refresh-failure warning and retry,
  one page-level 402 test for R5-R7, R8 in-flight state, R9 invalid name, R10 no leave prompt); then add
  `saveState`/`saveErrorKey`/`savedName`/`refreshFailed`/`refreshing`/`canSave`, `onDraftSave`, `refreshSong`,
  `onRefreshRetry`, the Save button, error banner, saved confirmation (focus on success) and the refresh warning
  with its retry button per design.md.
- [x] T5 (R11) Add `songPresetDraft` to the namespace parity checks in `src/app/songs/i18n-parity.spec.ts`, then add
  the 13 keys from design.md "UI copy" to `public/i18n/en.json` and `public/i18n/es.json`.
- [x] T6 (R3, R4) (was F27 T22) Manual end-to-end against the real backend: duplicate, edit, rename, Save to song;
  the copy is listed last with its new name without a spinner; reload the browser and it is still last. On a free
  plan song with 1 preset, Save to song is disabled with the hint while Export still works.
- [x] T7 (R1-R11, P1) Write `progress/impl_31.md` with the R/P → test table and run `./init.sh`.
