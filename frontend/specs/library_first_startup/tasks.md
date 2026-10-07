# Tasks — `library_first_startup` (feature 26)

Execute in the order listed (Revision 3 added T46-T49 inside the sections where they belong, so ids are not
sequential). Each task names the requirement(s) it covers. Tests are colocated Vitest specs
(`docs/conventions.md`); HTTP is mocked with `provideHttpClientTesting()` + `HttpTestingController`, the pedal with a
stubbed `WebMidiPedalConnection`, browser globals (`navigator.requestMIDIAccess`, `URL.createObjectURL`,
`URL.revokeObjectURL`) with `vi.stubGlobal`/`vi.spyOn`.

**F5/F28 coexistence (Revision 3).** `dev` already has F5 (`import_preset_to_pedal`) and F28. Where a task touches a
file F5 created (`songs-page.*`, `song.ts`, `songs-api.service.*`, `i18n-parity.spec.ts`, `es.json`/`en.json`,
`write-to-pedal-dialog.spec.ts`) it **extends** it: every existing F5 test stays green, and the only F5 assertions
allowed to change are the ones a task names explicitly (T19). Any new fake `SysexPresetCodec` in F26 specs (store,
flow, T28 integration) must implement `decodeWriteReply` as well (F28 added it; see the fake in
`preset-browser-page.spec.ts`). F5's `songs-page.spec.ts` uses an in-memory translation object: add every new key the
page renders to it, or its "not the key" assertions fail.

## Preconditions

- [ ] T1 (R2, R13, R27, R35) Re-verify the backend contract in `progress/f26_backend_contract.md` against
  `../backend/src/songs/song-service.ts` and `../backend/src/index.ts` (DTO fields, list has no `files`, cover route
  404). If anything differs, stop and report instead of adapting silently. Also note in that file that F5 relies on
  `GET /songs/:id/files/preset?sort_order=N` (not used by F26).

## Models, API, error classification

- [ ] T2 (R31, R35, R36, R7, R8, R30, R13, R80) Extend `src/app/songs/song.ts`: **keep F5's `SongPreset` and `Song`
  unchanged** (readonly, optional fields stay optional — design §1); add only `SongFile`, `SongDetail`,
  `orderedPresets`, `hasCoverFile`, `isBlank`, `coverHintForListSong`. New `song.spec.ts` with TestBed-free tests
  (unordered input → ascending `sortOrder`, input not mutated; cover present/absent; blank for `null`, `undefined`,
  `''`, `'  '`; `coverHintForListSong` returns `undefined` — design §4, the single switch point for the future
  list-DTO cover indicator).
- [ ] T3 (R2, R27, R13, R35) Add `getSong`, `getCover` to `SongsApi` (`listSongs` already exists — F5 — keep it);
  extend `songs-api.service.spec.ts` with the missing `listSongs` test plus `getSong`/`getCover` (method + URL,
  `responseType: 'blob'` for covers mirroring `getSongPreset`, id URL-encoded). F5's existing tests unchanged.
- [ ] T4 (R20, R21, R24, R37, R38, R39, R41) Add `src/app/songs/library-load-error.ts` `classifyLoadError` + spec
  (status 0, 401, 404, 500, non-HTTP error).

## Read presets store (needed by the connect flow and "New song")

- [ ] T5 (R55, R56, R63, R64, R65, R66, R68, R69) Create `src/app/pedals/pedal-presets.store.ts` per design §8b
  (`read()` with in-flight dedupe, error mapping moved from the page — raw message kept, so `request_in_progress`
  surfaces as `presetBrowser.request_in_progress` — and `savableSnapshot()`; presets kept across an F28 silent
  reconnect).
- [ ] T6 (R56, R63, R64, R65, R68, R69) `pedal-presets.store.spec.ts`: two overlapping `read()` calls → one
  `readPresets()`; a `read()` after the first resolves → a second `readPresets()`; error mapping (`not_connected` →
  `not_connected_error`, `request_in_progress` → `request_in_progress`); `savableSnapshot()` returns `[]` when not
  connected, presets with `raw` in slot order when connected, a new array instance per call, never mock presets; no
  HTTP request after `read()` (`verify()`).
- [ ] T7 (R55, R64, R66) Refactor `PresetBrowserPage.loadPresets()` to delegate to the store and mirror store state
  into the page signals via `effect` (design §8b; template unchanged). Run the existing
  `preset-browser-page.spec.ts` — all prior tests (including F28's) must stay green.

## Cover component

- [ ] T8 (R13, R14, R15, R16, R17, R35, R36, R19) Create `src/app/songs/song-cover/song-cover.{ts,html}` per design §4
  and Visual direction (tile/hero, placeholder pick SVG, pulse with `motion-reduce:animate-none`).
- [ ] T9 (R13, R14, R15, R16, R17) `song-cover.spec.ts`: `hasCover` undefined → one blob request; pending →
  `data-cover-state="loading"`; 200 → `<img>` with object URL and `songs.cover_alt` alt; 404 → `none`; 500 and status
  0 → `error`.
- [ ] T10 (R36, R35) Spec: `hasCover=false` → `none` and `httpMock.expectNone(.../files/cover)`; `hasCover=true` → one
  request.
- [ ] T11 (R19) Spec: destroying the fixture after a 200 calls `URL.revokeObjectURL` once with the created URL;
  destroying before the response resolves revokes the URL as soon as it is created.

## Library page (extend F5's `SongsPage`)

- [ ] T12 (R2, R4, R5, R6, R7, R8, R9, R10, R25, R75, R76, R77, R78) Extend `songs-page.{ts,html}` per design §5 and
  Visual direction — **do not rewrite**: keep F5's `'empty'` state, constructor load, `writeDialog`,
  `openWriteDialog`/`closeWriteDialog`, `#sendButton`, `data-song-id` and focus-return lookup. Card becomes
  `<li song-card>` with cover, `song-card-link` (name, `routerLink` to `/songs/<id>`), artist rule, preset count keys,
  then F5's send button (F5's inner bordered `<div>` dropped). Loading becomes the skeleton grid whose only text is the
  `sr-only` `songs.loading`. Update the file header comment.
- [ ] T13 (R11, R12, R59) Extend F5's existing `songs-empty` markup with `songs-empty-connect` calling
  `PedalConnectFlow.start()` (T26 must exist — implement T26 first if needed, the order here is for reading); render
  `songs-new` in the title row in the `'loaded'` and `'empty'` states (outside `songs-empty`).
- [ ] T14 (R20, R21, R22, R23, R24, R79) Replace `load()`'s inline error branching with `classifyLoadError` (same
  behavior); turn `songs-error` into a container with `songs-error-message` + `songs-retry` (existing `songs.retry`
  key); session-expired markup unchanged.
- [ ] T47 (R80) In `openWriteDialog`, map `orderedPresets(song.presets)` instead of `song.presets` (positions 1..N
  follow `sortOrder`).
- [ ] T15 (R60, R61, R68, R69, R71, R74) Embed `app-save-song-dialog` bound to the `newSong` snapshot (next to F5's
  `writeDialog`) from `PedalPresetsStore.savableSnapshot()` (design §5), `testMode=false`; on `closed` clear the
  snapshot and reload. The write dialog's `closed` keeps F5's behavior (no reload).
- [ ] T16 (R2, R3, R4, R5, R6, R7, R8, R9, R10) Extend F5's `songs-page.spec.ts` (keep its setup and all its tests;
  add `songs.new`, `songs.empty_connect`, `songs.preset_count_one/other`, `songs.cover_alt` to its in-memory
  translations): exactly one `GET /songs` on init; no `requestMIDIAccess` call (spy via `vi.stubGlobal`); loading
  testid while pending; N cards in response order; name; artist shown/omitted for `'Queen'`/`null`/`'  '`/absent;
  count keys for 1 and 3 presets; grid classes. New tests that call `httpMock.verify()` must flush or `match()` the
  per-card cover requests.
- [ ] T46 (R75, R76, R77, R78) Spec: each `song-card` is an `LI` with `data-song-id`; it contains one
  `song-card-link` (`A`, `href="/songs/<id>"`, text = song name) and one `song-card-send-to-pedal`;
  `songs-grid.querySelectorAll('a a, a button, button a, button button')` is empty; the send button is not inside
  the link (`link.contains(button) === false`). F5's "Send to pedal" and focus-return tests still pass unchanged.
- [ ] T17 (R11, R12, R59) Spec: empty array → `songs-empty` with both keys; CTA click calls `PedalConnectFlow.start`
  (stubbed); `songs-new` present in loaded and empty states, absent while loading/error. F5's empty-state test stays
  green (CTA label is not "Send to pedal").
- [ ] T18 (R18) Spec: two songs, one cover 500 and one 200 → both cards still rendered.
- [ ] T19 (R20, R21, R22, R23, R24, R79) Spec: status 0 → `songs.errors.unreachable` + retry; 500 → `load_failed` +
  retry; retry sends a second `GET /songs`; 401 → `songs-session-expired` with `/login` link and no retry. **Update
  these two F5 assertions** to query `[data-testid="songs-error-message"]` instead of `[data-testid="songs-error"]`
  (expected strings unchanged): "a 500 renders the translated load_failed text, not the key" and "a network error
  (status 0) renders the translated unreachable text, not the key". F5's "R54 — the error state shows songs-error…"
  test stays as is.
- [ ] T20 (R60, R61) Spec: pedal stub `not-connected` → `songs-new` opens the dialog with `[]`, `[]`, `false`, the
  dialog shows "Add .prst file" and no "Add preset" selector; emitting `closed` removes it and sends a new `GET /songs`.
- [ ] T21 (R68, R69) Spec: pedal stub `connected`, store holding two real presets with `raw` (slots 12, 3) and one
  without, plus `MockPresetsStore.load()` → dialog `availablePresets` is `[slot 3, slot 12]`, contains no mock,
  `initialPresets` `[]`, `testMode` `false`; both the "Add preset" selector and "Add .prst file" render.
- [ ] T22 (R70) Spec: from that dialog add the slot-3 pedal preset, then a valid `.prst` file (fixture from
  `gp5-tonelab-prst.fixture.ts`), fill the name, submit → exactly one `POST /songs` whose `preset` parts are the pedal
  preset's `.prst` bytes then the file's bytes, in that order.
- [ ] T23 (R71, R72, R73) Spec: open with R68 inputs, add a pedal preset, then switch the pedal stub to
  `not-connected` and change the store's presets → dialog still open, same `initialPresets`/`availablePresets`
  instances (identity check), row still listed; submit → `POST /songs` contains that preset's bytes.
- [ ] T24 (R74) Spec: open while `connected`, close, switch to `not-connected`, open again → `availablePresets` `[]`;
  and the reverse (`not-connected` → `connected` with read presets) → non-empty.
- [ ] T25 (R25, R57) Spec: clicking `song-card-link` navigates to `/songs/<id>` (router spy or `Location`); rendering
  the same response with the pedal stub `connected` and `MockPresetsStore.load()` called yields identical card
  names/order as with `not-connected` and empty mocks.
- [ ] T48 (R80) Spec: list response with a song whose presets arrive as `sortOrder` [1, 0] → clicking its send button
  opens the write dialog with presets `sortOrder` [0, 1] and `position` [1, 2]. F5's "clicking the button opens the
  dialog with the right song and preset snapshot" test stays green (its fixture is already ordered).

## Write dialog (F5) — copy and kept inline connect

- [ ] T49 (R81, R82, R83, R84) Change `writeToPedal.not_connected` in `public/i18n/es.json` and `en.json` to the R81
  strings (keep `writeToPedal.connect`/`connecting`); no change to `write-to-pedal-dialog.{ts,html}`. Tests:
  `i18n-parity.spec.ts` + one test asserting both exact R81 values; `write-to-pedal-dialog.spec.ts` + (a) with the
  pedal stub `not-connected`, `write-to-pedal-connect` is rendered inside the reminder's container (R82 — F5's existing
  "renders the Connect GP-5 button…" test already covers presence; extend or reference it), (b) with a `Router` spy /
  initial URL, clicking it leaves the URL unchanged and calls no `navigate`/`navigateByUrl` (R83), (c) after its
  `connect()` resolves, the stub's `readPresets` was not called (R84). Doc sync: update the
  `writeToPedal.not_connected` row and the "from the header" sentences in `specs/import_preset_to_pedal/design.md`.

## Connect flow and header

- [ ] T26 (R50, R51, R52, R53, R54, R63, R64, R65) Create `src/app/pedals/pedal-connect-flow.service.ts` per design §8
  (navigate, then `PedalPresetsStore.read()` in both the connected and the just-connected paths).
- [ ] T27 (R50, R51, R52, R53, R54, R56) `pedal-connect-flow.service.spec.ts`: not-connected → `connect` once then
  `navigateByUrl('/pedal/presets')`; connected → navigate, `connect` not called; rejects with `midi_access_denied`,
  `gp5_not_found`, `unsupported`, `boom` → error `midi_access_denied`, `gp5_not_found`, `unsupported`, `unknown` and no
  navigation; `start()` again and `dismissError()` clear the error; `HttpTestingController.verify()` shows no request
  after resolve or reject; connected and connect-resolves paths both call `store.read()` after navigation.
- [ ] T28 (R63, R64, R65, R66) Integration spec (router + real `PedalPresetsStore` + real `PresetBrowserPage`, stubbed
  pedal): connected on `/songs`, click header button → `readPresets` called exactly once, URL `/pedal/presets`;
  already on `/pedal/presets` and loaded, click → `readPresets` called once more and the page renders the new
  presets returned by that call; not-connected on `/songs`, click → `connect` once, then `readPresets` exactly once.
- [ ] T29 (R46, R47, R48, R49, R67) Create `src/app/pedals/pedal-connect-button/pedal-connect-button.{ts,html}` + spec:
  label per state, disabled while `connecting`, disabled with `pedalButton.reading` while the store is `loading`,
  disabled + `title` when unsupported, click calls `flow.start()`.
- [ ] T30 (R43, R44, R45, R53, R54, R58) Update `src/app/app.{ts,html}` per design §10 and Visual direction (header
  `flex-wrap`, `nav-songs`, connect button behind `isAuthenticated`, error strip with dismiss, mock link navigation
  only — what `/pedal/presets` shows afterwards is feature 29's).
- [ ] T31 (R43, R44, R45) `app.spec.ts`: authenticated → `nav-songs` (href `/songs`) and `pedal-connect` rendered;
  unauthenticated → neither rendered; connect button present after navigating to `/songs`, `/songs/<id>` and
  `/pedal/presets`.
- [ ] T32 (R53, R54) `app.spec.ts`: flow error set → `pedal-connect-error` with `role="alert"` and the translated
  `pedal.*` key; dismiss removes it.
- [ ] T33 (R58) `app.spec.ts`: mock link on `/songs` → mocks loaded and URL becomes `/pedal/presets`; on
  `/pedal/presets` → mocks loaded, no navigation call.
- [ ] T34 (R55, R56) `preset-browser-page.spec.ts` regression: init while `connected` calls `readPresets` exactly once;
  after it resolves, `HttpTestingController.verify()` shows no request. No source change to the page beyond T7.

## Detail page and routes

- [ ] T35 (R26) Add `songs/:id` route with `authGuard` to `app.routes.ts`; `app.routes.spec.ts`: route exists,
  guarded, and an unauthenticated navigation to `/songs/x` lands on `/login`.
- [ ] T36 (R1) `app.routes.spec.ts` regression: authenticated navigation to `/` lands on `/songs`.
- [ ] T37 (R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R42) Create `song-detail-page.{ts,html}` per design §6 and
  Visual direction.
- [ ] T38 (R37, R38, R39, R40, R41) Detail not-found, error + retry (`songs.retry`) and session-expired states.
- [ ] T39 (R27, R28, R29, R30, R31, R32, R33, R34, R42) `song-detail-page.spec.ts`: one `GET /songs/<id>` for the route
  id; loading testid; `<h1>` name; artist shown/omitted; presets given as `sortOrder` [2,0,1] render in order 0,1,2
  with positions 1,2,3 and names; no element shows the slot/`sortOrder` raw value beyond the 1-based position and no
  `slot` text; reference note; back link `href="/songs"`.
- [ ] T40 (R35, R36) Spec: `files` with a cover → one cover request; `files` without → `none`, `expectNone` cover.
- [ ] T41 (R37, R38, R39, R40, R41) Spec: 404 → `song-detail-not-found`; status 0 → `unreachable` + retry; 500 →
  `load_failed` + retry; retry sends a second `GET /songs/<id>`; 401 → `song-detail-session-expired` + `/login` link.
- [ ] T42 (R19) Spec: destroying the detail fixture after a loaded cover revokes its object URL once.

## i18n and finish

- [ ] T43 (R62) Add only the keys marked **new** in design "UI copy" to `public/i18n/es.json` and `en.json` (the
  **exists** ones are already there from F5 — do not duplicate; keep `songs.card.*`), remove `songs.placeholder`.
  Extend F5's `src/app/songs/i18n-parity.spec.ts`: es/en key-set parity for `songs`, `songDetail`, `pedalButton`; add
  `song-detail-page.html`, `song-cover.html`, `pedal-connect-button.html` and `src/app/app.html` to its source scanner
  and `songDetail|pedalButton` to its key regex (design §11). F5's existing parity tests stay unchanged.
- [ ] T44 (R10, R5, R31, R75, R78) Manual check with Ricardo at 375px and 1280px, light and dark: library grid (with
  covers, without covers, empty), card name link hover/focus and the "Send to pedal" button below it, write dialog
  not-connected reminder with the new copy, detail page, header wrap with the connect button, error strip. No
  horizontal overflow. Record the outcome in `progress/impl_library_first_startup.md`.
- [ ] T45 (R1-R84) Run `./init.sh` green; write the R→test traceability table in
  `progress/impl_library_first_startup.md`.
