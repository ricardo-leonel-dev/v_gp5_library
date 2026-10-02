# Tasks — `save_preset_dialog` (feature 4)

Execute in order. Each task names the `R<n>` it covers; tests are their own tasks so traceability in
`progress/impl_save_preset_dialog.md` can point at concrete test names. Do not start until the spec is approved
**and** both backend features `multiple_presets_per_song_with_per_preset_reference_metadata` and
`plan_tiers_songs_and_presets_per_song_limits` are `done` (design §0). No question is open: OQ1 is resolved
(507 bytes, `01` at `0x12`) by the ToneLab reference file — keep the layout confined to `gp5-prst-file.ts`; OQ6-OQ8
were accepted in Revision 4, which also dropped `pedal_slot` entirely (never sent, no helper).

## 0. Precondition

- [ ] T1 (R53, R59, R77, R79, R85, R98, R99, R100, R101) Backend contract check, no frontend code
  yet. In `/Users/ricardoaguilar/Documents/Development/v_gp5_library-frontend/backend`: confirm both backend
  features are `done` (its harness status); read the final `src/songs/parse-multipart.ts`, the songs route and
  the plan read route, and record in `progress/impl_save_preset_dialog.md`: (a) repeatable `preset` parts with
  order = `sort_order`; (b) repeatable `pedal_preset_name` aligned one-per-preset by order, and that omitting the
  card's optional `pedal_slot` is accepted; (c) every 400 `error` string; (d) the plan endpoint path and response
  field names; (e) the 402 body shape and both `code` strings. If (a)/(b) contradict design §0, a preset-related
  400 string differs from R98's table, or (d)/(e) differ from the resolved OQ6/OQ7, **stop and report** for a
  spec revision — do not adapt the spec unilaterally.

## A. Raw bytes in `src/app/midi/`

- [ ] T2 (R1, R2) Add `PresetRaw` and optional `Preset.raw` to `src/app/midi/preset.ts`; append a dated note (2026-10-02) under discarded alternative #2 of
  `specs/sysex_preset_read_write/design.md` saying it is partially reversed by
  `specs/save_preset_dialog/design.md` §1.
- [ ] T3 (R1, R2, R3, R19) In `gp5-sysex-preset-codec.ts`, capture each slot's 16-byte name record in
  `decodeNames` (copied with `slice`) as `nameFieldsMap`, attach `raw = { body: body.slice(), nameField }` to
  every decoded preset; export `crc8` and `decodeGp5Body` (the existing `decodeBody`, unchanged).
- [ ] T4 (R1, R2, R3) Codec spec: `raw.body` equals the 466 body bytes fed in (echo stripped); `raw.nameField`
  equals that slot's 16 name bytes; decoding the next slot leaves the previous preset's `raw` unchanged.
- [ ] T5 (R4) `web-midi-pedal-connection.spec.ts`: with the fake codec returning a preset that has `raw`,
  `readPresets()` resolves a preset whose `raw` is the same bytes.

## B. Fixtures and the `.prst` module

- [ ] T6 (R6, R20) Create `src/app/midi/gp5-captured-bodies.fixture.ts` with the 10 entries of run "corrida 3"
  (`jq` command in design §1) and `capturedBodyBytes(index)`; `gp5-captured-bodies.fixture.spec.ts` asserts each
  entry parses to exactly 466 bytes and that two calls return distinct buffers.
- [ ] T7 (R13, R20) Create `src/app/midi/gp5-tonelab-prst.fixture.ts` from
  `/Users/ricardoaguilar/Documents/Development/v_gp5_library/external_docs/02-TLDLXAMP.prst`
  (`xxd -p <file> | tr -d '\n'`) with `TONELAB_TLDLXAMP_PRST_HEX` and `tonelabPrstBytes()`;
  `gp5-tonelab-prst.fixture.spec.ts` asserts 507 bytes, the first 4 bytes `47 50 2d 35`, byte `0x14` = `0x10`,
  and that two calls return distinct buffers.
- [ ] T8 (R5, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19) Create
  `src/app/midi/gp5-prst-file.ts` with `GP5_PRST_LEN`, `GP5_PRST_HEADER`, the offset constants, `encodePrstFile`
  and `decodePrstFile` per the design §1 layout table; no other file in `src/` hardcodes a `.prst` offset or
  length.
- [ ] T9 (R20) Run `grep -rlE "gp5-(captured-bodies|tonelab-prst)\.fixture" src --include='*.ts' | grep -v
  '\.spec\.ts$'`, confirm it prints nothing, record command and empty output in
  `progress/impl_save_preset_dialog.md`.
- [ ] T10 (R5, R7, R8, R9, R10) `gp5-prst-file.spec.ts` encode: length 507; name field at `0x19..0x28`; header
  bytes with `01` at `0x12`; sentinel `ff ff ff ff` at `0x15`; byte `0x14` equals `crc8` of `0x15..end`.
- [ ] T11 (R6) `gp5-prst-file.spec.ts`: feed captured body 0 through the real codec as reply frames, call
  `encodePrstFile` on the decoded preset, assert `subarray(0x29, 0x29 + 466)` equals the captured bytes.
- [ ] T12 (R11) `gp5-prst-file.spec.ts`: throws `preset_bytes_unavailable` for no `raw`, a 465-byte body and a
  15-byte name field.
- [ ] T13 (R5, R6, R7, R8, R9, R10) `gp5-prst-file.spec.ts` with the ToneLab fixture: build a `Preset` whose
  `raw.nameField` / `raw.body` are sliced from it (`0x19..0x28`, `0x29..0x1FA`) and assert `encodePrstFile`
  reproduces the file **byte-for-byte** (507 bytes, header, CRC `0x10`, sentinel). If it does not, stop and
  report.
- [ ] T14 (R12, R13, R14, R15, R16, R17, R18, R19) `gp5-prst-file.spec.ts` decode with the ToneLab fixture:
  valid file → `ok`, `name === 'TL DLX AMP'`, `bytes` equal to the input and a different buffer (mutating the
  input afterwards leaves `bytes` unchanged), `chain` deep-equals `decodeGp5Body` of `0x29..0x1FA`; corrupted
  copies: 506 and 508 bytes → `wrong_length`; one header byte changed (e.g. `0x12` → `0x00`) → `bad_header`;
  `0x16` → `0x00` → `bad_sentinel`; one body byte flipped → `bad_crc`; a 506-byte buffer with a bad header →
  `wrong_length` (order); a file whose name field is all `0x00` with the CRC recomputed → `ok` with `name === ''`;
  `decodePrstFile(encodePrstFile(p))` is `ok` for a decoded captured preset.
- [ ] T15 (R20) Confirm `mock-presets.ts`, `mock-presets.store.ts`, `preset-comparison.service.ts` and the page's
  support/connection gate (`preset-browser-page.html:2-10`) have no diff in this feature (`git diff dev --stat`
  plus a look at the gate lines); mocks carry no `raw`.

## C. Backend clients (`src/app/songs/`)

- [ ] T16 (R77, R91) Create `song.ts` (`CreatedSong`) and `songs-api.service.ts` (`SongsApi.createSong`).
- [ ] T17 (R77, R91) `songs-api.service.spec.ts` with `HttpTestingController`: one `POST` `${apiBaseUrl}/songs`,
  body `instanceof FormData`, no `Content-Type` header; resolves with the 201 body.
- [ ] T18 (R53, R59) Create `plan-limits.ts` (`PlanLimits`, `parsePlanLimits`) and `plan-api.service.ts`
  (`PlanApi.getMyPlan`) per design §3, using the path and fields confirmed in T1.
- [ ] T19 (R53, R59) Specs: `getMyPlan` sends one `GET ${apiBaseUrl}/me/plan` and resolves the parsed limits;
  `parsePlanLimits` accepts `{plan:'free',songLimit:1,presetsPerSongLimit:1,songCount:0}` and the premium shape
  with both limits `null`, and returns `null` for a missing field, a string limit, a negative count and a
  non-object; `getMyPlan` rejects on HTTP 500.

## D. Pure form logic (`src/app/songs/save-song-form.ts`)

- [ ] T20 (R34, R35, R37, R38, R39, R40, R44, R45, R46, R47, R48, R51, R52, R54, R55, R56, R60, R61, R62, R63,
  R64, R67, R68, R69, R70, R72, R73, R74, R76, R78, R79, R80, R81, R82, R83, R84, R85, R86, R87, R88, R89,
  R90) Create `save-song-form.ts` (`SongPresetEntry`, `pedalEntry`, `fileEntry`, `moveEntry`,
  `removeEntryAt`, `tryAppendEntry`, `addablePresets`, `checkPrstPick`, `atPresetCap`, `detectUserSlots`,
  `pruneAttachments`, `checkPickedFile`, `serializeExtraConfig`, `validateSaveSongDraft`, `hasErrors`,
  `presetFileName`, `buildSongFormData`) per design §4.
- [ ] T21 (R34, R35, R37, R38, R39, R40, R47) `save-song-form.spec.ts` entries on `[A,B,C]`: `moveEntry(1,-1)` →
  `[B,A,C]`; `moveEntry(1,+1)` → `[A,C,B]`; out-of-range moves return the same order; `removeEntryAt(1)` →
  `[A,C]`; `removeEntryAt` on a 1-item list → `[]`; `tryAppendEntry(D)` → `[A,B,C,D]`; `tryAppendEntry` of a
  pedal or file entry whose name equals a listed one (`"TL DLX AMP"`) → `presetNameDuplicate` with that name and
  no change, while `"tl dlx amp"` is accepted (OQ8); `addablePresets` excludes slots of listed pedal entries,
  ignores file entries, keeps a same-name preset from another slot, sorts ascending; inputs never mutated.
- [ ] T22 (R45, R46, R48, R54, R55) `save-song-form.spec.ts` `checkPrstPick` / `atPresetCap`: each
  `PrstFileError` maps to its key (`wrong_length` → `prstWrongSize`, `bad_header` and `bad_sentinel` →
  `prstNotGp5`, `bad_crc` → `prstCorrupt`); `ok` with `name ''` → `prstNoName`; a 256-char file name →
  `fileNameTooLong` even for a valid file; valid → `null`; `atPresetCap(1,1)` true, `(0,1)` false, `(5,null)`
  false.
- [ ] T23 (R51, R52, R56, R60, R61, R62, R70) `save-song-form.spec.ts` validation: empty entries →
  `presets.key = presetsRequired`; two entries named `X` → `presetNameDuplicate` on the second entry's key only;
  3 entries with limit 2 → `presetLimitExceeded` with `limit: 2`, 2 entries with limit 2 and any count with
  limit `null` pass; blank/whitespace name → `nameRequired`; 256-char name → `nameTooLong` and 255 passes;
  256-char artist → `artistTooLong`; `hasErrors` true for each.
- [ ] T24 (R63, R64, R71) `save-song-form.spec.ts` `checkPickedFile`: `text/plain` cover → `coverNotImage`;
  `image/png` cover → null; 256-char file name (cover, IR, NAM) → `fileNameTooLong`.
- [ ] T25 (R67, R68, R69, R86, R87) `save-song-form.spec.ts` extra config: key-less row with value →
  `extraKeyRequired` on that row; duplicate trimmed keys → `extraKeyDuplicate` on the later row; fully empty
  rows ignored; no keyed rows → `serializeExtraConfig` returns `null`; JSON keeps row order and raw values; a
  value making the JSON 32769 UTF-8 bytes (multi-byte char) → `extraConfigTooLarge`, 32768 passes.
- [ ] T26 (R72, R73, R74, R76) `save-song-form.spec.ts` `detectUserSlots` / `pruneAttachments`: pedal entry of
  fixture slot 0 alone → `[{ir,1},{nam,3}]`; pedal entries of slots 5 and 0 (either order) →
  `[{ir,1},{nam,1},{nam,3}]`; a **file** entry built with `decodePrstFile(encodePrstFile(<decoded slot 0>))` →
  `[{ir,1},{nam,3}]`; a slot used by two entries and bypassed blocks count once; entries without user slots →
  `[]`; mock "Saturated Snap" → `[{nam,1}]`; `pruneAttachments` with refs `[{nam,1}]` drops `ir:1` and `nam:3`
  and keeps `nam:1`.
- [ ] T27 (R78, R79, R80, R81, R82, R83, R84, R85, R86, R87, R88, R89, R90) `save-song-form.spec.ts`
  `buildSongFormData` with entries `[pedal slot 5, file ToneLab "TL DLX AMP" (fileName "02-TLDLXAMP.prst"),
  pedal slot 3]` (pedal ones decoded from captured bodies through the codec): `name` trimmed; `getAll('preset')`
  = 3 `File`s in list order, type `application/octet-stream`; pedal parts named `test-metal.prst` /
  `power-lead.prst` with bytes equal to `encodePrstFile`; the file part named `02-TLDLXAMP.prst` with bytes
  byte-identical to `tonelabPrstBytes()`; every part's bytes pass `decodePrstFile`; `getAll('pedal_preset_name')`
  = the three names in list order; `[...fd.keys()]` equals `name`, then
  `preset, pedal_preset_name, preset, pedal_preset_name, preset, pedal_preset_name`
  (plus optional fields at their documented places); a 1-pedal-entry list yields exactly one of each; `artist`
  present only when non-blank; `extra_config` absent without keyed rows; `ir`/`nam` parts in ascending slot
  order; at most one `cover`; an empty list throws `no_presets`.

## E. Error mapping

- [ ] T28 (R98, R99, R100, R101, R102, R103, R104) Create `save-song-errors.ts` (`mapSaveSongError`) per design
  §5, using the 400 strings and 402 codes confirmed in T1.
- [ ] T29 (R98, R99, R100, R101, R102, R103, R104) `save-song-errors.spec.ts`, table-driven over every row of
  design §5 with `HttpErrorResponse`: six 400 messages → keys/places; 402 `{code:'plan_song_limit',limit:1}` →
  `planSongLimit` `limit: 1`; 402 `{code:'plan_preset_limit',limit:2}` → `planPresetLimit` `limit: 2`; 402 with
  a known code but no numeric `limit`, an unknown code, or a `text/plain` body → `planLimitGeneric`; 401 and 404
  `user not found` → `sessionExpired` with `loginLink`; status 0 → `network`; `text/plain` 500, unlisted 400 and
  a plain `Error` → `unexpected`.

## F. Dialog component

- [ ] T30 (R26, R28, R29, R30, R31, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47,
  R48, R49, R50, R51, R52, R53, R54, R55, R56, R57, R58, R59, R65, R66, R72, R73, R74, R75, R76, R92, R93, R94,
  R95, R96, R97) Create `src/app/songs/save-song-dialog/save-song-dialog.{ts,html}` per design §6 (inputs
  `initialPresets`, `availablePresets`, `testMode`; entries seeded once; plan load unless test mode; add from
  pedal and from file; test-mode early return in `submit()`), with the exact class strings and `data-testid`s
  from "Visual direction" and every string through `saveSong.*` (user-slot labels via `chainBoard.userIrSlot` /
  `chainBoard.userSnapToneSlot`; row source via `saveSong.pedal_badge` / `saveSong.file_badge`).
- [ ] T31 (R28, R29) Dialog spec: card has `role="dialog"`, `aria-modal="true"`, `aria-labelledby` resolving to
  the title; name input is `document.activeElement` after first render.
- [ ] T32 (R30, R31) Dialog spec: Escape, backdrop click, Cancel and × each emit `closed` with no `POST`; while a
  save request is pending (unflushed) Escape and backdrop click do not emit.
- [ ] T33 (R26, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R49) Dialog spec pedal list: opened with
  `[A,B]` and available `[A,B,C,D]` where D has A's name → two rows showing `1`/`2`, `save-song-pedal-badge`
  and names in order; first ↑ and last ↓ disabled; ↓ on row 1 → order `[B,A]`; × on both rows → empty-state box; selecting C
  appends it and resets the select; selecting D leaves the list unchanged and shows `presetNameDuplicate` in
  `save-song-add-error`, and a following successful add clears it; the select offers only unlisted slots,
  ascending, each option labelled `<slot as the browser shows it> · <name>` (R40), with no slot in the rows or the FormData, and is disabled when all are listed; with `availablePresets = []` the select is absent; replacing
  the inputs after open does not change the rows.
- [ ] T34 (R43, R44, R45, R46, R47, R48, R49, R50) Dialog spec add from file (dispatch `change` on
  `save-song-add-file-input` with a `File`): the button exists and the input has `accept=".prst"`; the ToneLab
  fixture appends a row with the `save-song-file-badge` and name "TL DLX AMP" and its chain strip; a 506-byte
  file → `prstWrongSize`; a header-corrupted file → `prstNotGp5`; a CRC-corrupted file → `prstCorrupt`; an
  empty-name file → `prstNoName`; picking the ToneLab file again → `presetNameDuplicate`; a valid file with a
  256-char name → `fileNameTooLong`; in each rejected case the row count is unchanged; after every pick the
  input's `value` is `''`; works with `initialPresets = []`, `availablePresets = []`.
- [ ] T35 (R51, R52, R70) Dialog spec: submit with an empty list shows `presetsRequired` under the list and
  `expectNone` for `POST /songs`; opened with two initial presets of the same name, submit shows
  `presetNameDuplicate` on the second row (`save-song-preset-row-error`) and sends nothing; removing one row then
  submitting sends the request.
- [ ] T36 (R53, R54, R55, R56, R57, R58, R59) Dialog spec plan limits (flush `GET /me/plan`): exactly one plan
  request on open; limit 1 with one listed preset → select and file button disabled and
  `save-song-preset-limit` shows the limit; opened with 2 presets and limit 1 → submit shows
  `presetLimitExceeded` and sends nothing; removing one makes submit send; `songLimit 1, songCount 1` → amber
  `save-song-song-limit` visible and submit still enabled and still sends; premium (`null` limits) → no cap, no
  messages; plan request answered 500 or with a malformed body → no cap, no messages, no banner.
- [ ] T37 (R60, R65, R66, R67, R68, R69, R70) Dialog spec: blank name submit shows `nameRequired` and
  `expectNone`; Add field appends a row; removing the middle of three rows keeps the other two in order;
  row-level extra errors render on the right row.
- [ ] T38 (R63, R64, R71) Dialog spec: a `change` with a non-image cover shows `coverNotImage`, no picked-file
  row, and a following valid submit has no `cover` part.
- [ ] T39 (R72, R73, R74, R75, R76) Dialog spec: with fixture presets slot 0 + slot 5 →
  `save-song-attach-ir-1`, `-nam-1`, `-nam-3` render once each with translated labels; attach a file to
  `nam-3`, remove the slot-0 row → `ir-1` and `nam-3` boxes disappear and a valid submit has no `nam` part for
  that file; then adding, through the file input, `encodePrstFile(<decoded slot 0>)` as a `.prst` (same name as
  the removed row, so no duplicate) brings `ir-1`/`nam-3` back as empty inputs; with no-user-slot presets the section is absent; submit with empty attachment inputs sends the request.
- [ ] T40 (R77, R79, R80, R81, R85, R94, R95, R96) Dialog spec (not test mode): list = pedal slot 5 +
  ToneLab file, reorder so the file is first, valid submit → exactly one `POST /songs` whose `preset` parts and
  `pedal_preset_name` values follow the reordered list and whose file part bytes
  equal the fixture; while pending the submit button is disabled and shows `saveSong.saving`; flushing 201 with
  `{id, name}` shows `save-song-success` containing that name.
- [ ] T41 (R97, R98, R99, R100, R101, R102, R103, R104) Dialog spec: flushing a 402 `plan_song_limit` shows the
  `planSongLimit` banner with the limit and every value (preset rows and order including the file row, name,
  artist, extra rows, picked files) is still present; a 402 `plan_preset_limit` shows `planPresetLimit`; a 402
  without code shows `planLimitGeneric`; a 400 `name is required` shows the error under the name field; a 401
  shows the banner with a `/login` link; status 0 shows `network`; an unlisted 400 shows `unexpected`.
- [ ] T42 (R92, R93) Dialog spec with `testMode = true` and byte-less mock presets: no plan request is made;
  reorder and add the ToneLab file, then valid submit shows `save-song-test-mode` (`role="status"`) with the
  translated notice, `HttpTestingController.verify()` finds no request at all, `save-song-success` absent, every
  value and the list order kept; a blank-name submit in test mode shows `nameRequired` and no notice.
- [ ] T43 (R106, R107) Dialog spec: backdrop and card carry the layout classes (`items-end`, `sm:items-center`,
  `w-full`, `max-w-lg`, `max-h-[100dvh]`, `sm:max-h-[90vh]`, `rounded-t-xl`, `sm:rounded-xl`), the add row
  `flex-col` + `sm:flex-row`, and dark counterparts (`dark:bg-slate-800` card, `dark:bg-slate-900` list and text
  inputs, `dark:border-slate-600` inputs and add controls, `dark:text-slate-100` title and row name,
  `dark:bg-slate-700` file badge, `dark:bg-amber-950/40` song-limit warning, `dark:bg-indigo-950/40` notice).

## G. Page integration

- [ ] T44 (R21, R22, R23, R24, R25, R26, R27, R32) `preset-browser-page.ts/.html`: `#saveSongButton`
  (`save-song-open`) at the end of the chip row with the `save-song-no-bytes` hint; `isMock` / `isSavable` /
  `displayIsMock` / `canSave` (identity against `MockPresetsStore.presets()`); `openSaveDialog()` snapshot
  `{initial, available, testMode}` per design §2; host `<app-save-song-dialog>` while the snapshot is non-null;
  on `closed` clear it and refocus the button. Do not modify the support/connection gate or the export
  checkbox markup.
- [ ] T45 (R21, R22, R23, R24, R25, R26, R27, R32) Page spec: mock presets loaded → button enabled, opening
  passes `testMode = true`; real-path presets (fake `readPresets`) with `raw` and chips `{12, 3}` → dialog rows
  are slots `3, 12` and `testMode = false`, add selector offers the other read presets; a real-path displayed
  preset without `raw` → button disabled with the hint; a byte-less real preset in the chips is left out of the
  rows and the selector; changing chips/presets while open keeps the dialog's rows and mode; closing returns
  focus to `save-song-open`.

## H. i18n, verification

- [ ] T46 (R105) Add the `saveSong` namespace to `public/i18n/es.json` and `en.json` with every key in design
  "Copy" (including the nested `saveSong.plan.*`); create `src/app/songs/i18n-parity.spec.ts` for `saveSong`
  (helpers from `src/app/pedals/i18n-parity.spec.ts`).
- [ ] T47 (R77, R105, R106) `./init.sh` green (Node ≥ 22.22.3 PATH, see memory note) and `bun run build` passes.
- [ ] T48 (R43, R92, R93, R106, R107) Manual Level 2 check, UI only: load mock presets, add two to the chips,
  open the dialog at 375px and 1280px, light and dark, with no overlap or cut-off; reorder/remove/add from pedal
  work; add the ToneLab `.prst` and a renamed non-`.prst` file (error shown); submit shows the test-mode notice
  and the network tab shows no request to `/songs` or `/me/plan`. Record in `progress/impl_save_preset_dialog.md`.
- [ ] T49 (R1, R4, R6, R44, R53, R57, R77, R80, R81, R82, R85, R96, R99, R100) Manual check with the
  real GP-5 (Chrome) and the local backend (`cd ../backend && bun run dev`, logged in on a `basic` user): read
  presets, select two, add the ToneLab file, reorder, save; confirm `201`; `GET /songs/:id/files/preset?sort_order=n`
  for each n returns, in the chosen order, a 507-byte file whose `0x29..` slice equals that preset's logged body
  (pedal presets) or that is byte-identical to `02-TLDLXAMP.prst` (file preset), and the song shows each
  preset's `pedal_preset_name`. **Installability:** load one downloaded
  pedal-sourced file onto a free GP-5 slot (Valeton app, or F5 once available) and confirm it plays. On a `free`
  user: a second preset is blocked in the dialog with the cap message, and a second song shows the amber
  warning and then the `planSongLimit` banner. If no pedal is available, record that in
  `progress/impl_save_preset_dialog.md` and leave it for Ricardo.
