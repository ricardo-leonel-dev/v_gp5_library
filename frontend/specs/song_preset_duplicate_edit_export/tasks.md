# Tasks — F27 `song_preset_duplicate_edit_export`

Revision 2 (2026-10-16): F27 no longer depends on the backend. T6, T7, T13 and T22 (save to song) and the
plan-limit parts of T11 moved to F31 `song_preset_draft_save`; their ids stay here as "Moved to F31" so numbering
is stable.

- [ ] T1 (R1, R2, R3, R4, R5, R6, R7) Add `patchGp5Body` to `src/app/midi/gp5-sysex-preset-codec.ts` (design §2), with
  tests in `gp5-sysex-preset-codec.spec.ts`: identity over every `GP5_CAPTURED_BODIES` entry and the ToneLab body
  (R1), exact differing-offset sets for bypass/param/module edits (R2-R4), decode round-trip (R5), the three throw
  cases (R6), input left unmodified (R7).
- [ ] T2 (R8) Add `encodePrstNameField` to `src/app/midi/gp5-prst-file.ts` + tests in `gp5-prst-file.spec.ts`.
- [ ] T3 (R21) Add `swappableEffects` to `src/app/midi/gp5-module-vocabulary.ts` + tests (same category only,
  user-slot titles excluded, ordered by `fxIndex`).
- [ ] T4 (R11, R20, R25, R26, R27, R37) Create `src/app/songs/preset-draft.ts` (design §3): `suggestCopyName`,
  `createDraft`, `validateDraftName`, `parseParamInput`, `exportFileName`, `draftToPrst`, `draftToPreset`, plus
  plain Vitest tests in `preset-draft.spec.ts` (including 16-char truncation and `draftToPrst` decoding `ok`).
- [ ] T5 (R17, R19, R22) Add `setBlockEnabled`, `setBlockParameter`, `setBlockModule`, `renameDraft` to
  `preset-draft.ts` (new object each call, `edited` set to `true`) + tests.
- [ ] T6 Moved to F31.
- [ ] T7 Moved to F31.
- [ ] T8 (R37, R38) Create `src/app/songs/download-bytes.ts` (`downloadBytes`) + test with stubbed
  `URL.createObjectURL`/`revokeObjectURL`.
- [ ] T9 (R16, R17, R19, R20, R21, R22, R23, R24) Extend `BlockDetail` with `editable` input and the three outputs
  (design §6), following the Visual direction; tests in `block-detail.spec.ts` for each output, the inline param
  error, the hidden picker for unknown modules, and the unchanged read-only default.
- [ ] T10 (R39, R40, R41, R42) Add the `localPreset` input to `WriteToPedalDialog` (design §7); tests: no
  "Write all" pill, no backend fetch, exactly one `writePreset` call with the draft bytes and chosen slot, Send
  disabled while not connected, nothing written before Send.
- [ ] T11 (R9, R10, R12, R13) Page: Duplicate button in the expanded row panel,
  `canDuplicate` (`draft() === null`), draft creation from a fresh `getSongPreset` fetch (+ `duplicate_failed` path);
  tests in `song-detail-page.spec.ts`, including "no modifying request is sent" (R10).
- [ ] T12 (R12, R16, R18, R24, R25, R26, R27, R28, R29, R30) Page: draft panel (name input + errors, editable chain
  board + block detail, unsaved chip, disabled actions on name error); tests including the dimmed class after
  a bypass toggle and that source rows stay read-only; assert no non-GET request during edits (R30).
- [ ] T13 Moved to F31.
- [ ] T14 (R37, R38, R39, R43) Page: Export, Send to pedal (opens dialog in draft mode) and Discard + tests.
- [ ] T15 (R44) Add every key from the design's UI copy table, except the save/plan-limit keys moved to F31 (design.md
  "Revision 2"), to `public/i18n/es.json` and `en.json`; confirm
  `src/app/songs/i18n-parity.spec.ts` (and `pedals/i18n-parity.spec.ts` if any key lands there) pass.
- [ ] T16 (R46, R47) Layout test in `song-detail-page.spec.ts` asserting the draft action bar's `flex-wrap`, the
  editor row's `lg:flex-row`, and `min-w-0` on both editor children.
- [ ] T17 (R49, R50, R51) Create `src/app/songs/leave-draft-dialog/` (design §5b, Visual direction) + tests in
  `leave-draft-dialog.spec.ts`: `leave`/`stay` outputs, Escape and backdrop emit `stay`, initial focus on
  "Keep editing".
- [ ] T18 (R48, R49, R50, R53, R55) Add `hasUnsavedDraft`, `leavePrompt` and `confirmLeave()` to `SongDetailPage`,
  create `leave-draft.guard.ts` and register it as `canDeactivate` on `songs/:id` in `app.routes.ts`; tests with
  `RouterTestingHarness`: dialog shown and navigation held with an edited draft, completed on leave (draft
  cleared), cancelled on stay, no dialog with no draft / unedited draft / after discard; plus
  `leave-draft.guard.spec.ts` and the route assertion in `app.routes.spec.ts`.
- [ ] T19 (R52, R54) Add the `window:beforeunload` listener to `SongDetailPage`; tests dispatch a cancelable
  `beforeunload` event and assert `defaultPrevented` is `true` only with an edited draft.
- [ ] T20 (R46, R47) Manual check at 375px and 1280px in light and dark mode: no horizontal overflow, board and
  detail side by side at 1280px; note the result in `progress/impl_song_preset_duplicate_edit_export.md`.
- [ ] T21 (R1-R13, R16-R30, R37-R55) Write `progress/impl_song_preset_duplicate_edit_export.md` with the R→test traceability table
  (grouping per design §9) and run `./init.sh`.
- [ ] T22 Moved to F31.
- [ ] T23 (R45) Manual hardware check with Ricardo: export an edited draft (one bypass flip, one param change, one
  effect swap), install it on the GP-5 in two different user slots, and confirm the pedal shows and plays the
  edits; also write the same draft via Send to pedal and read it back on `/pedal` to confirm the chain matches.
  Record the result in the impl progress file.
