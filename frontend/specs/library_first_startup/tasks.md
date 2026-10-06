# Tasks — `library_first_startup` (feature 26)

Execute in order. Each task names the requirement(s) it covers. Tests are colocated Vitest specs
(`docs/conventions.md`); HTTP is mocked with `provideHttpClientTesting()` + `HttpTestingController`, the pedal with a
stubbed `WebMidiPedalConnection`, browser globals (`navigator.requestMIDIAccess`, `URL.createObjectURL`,
`URL.revokeObjectURL`) with `vi.stubGlobal`/`vi.spyOn`.

## Preconditions

- [ ] T1 (R2, R13, R27, R35) Re-verify the backend contract in `progress/f26_backend_contract.md` against
  `../backend/src/songs/song-service.ts` and `../backend/src/index.ts` (DTO fields, list has no `files`, cover route
  404). If anything differs, stop and report instead of adapting silently.

## Models, API, error classification

- [ ] T2 (R31, R35, R36, R7, R8, R30, R13) Add `SongPreset`, `Song`, `SongFile`, `SongDetail`, `orderedPresets`,
  `hasCoverFile`, `isBlank`, `coverHintForListSong` to `src/app/songs/song.ts`; new `song.spec.ts` with TestBed-free
  tests (unordered input → ascending `sortOrder`, input not mutated; cover present/absent; blank for `null`, `''`,
  `'  '`; `coverHintForListSong` returns `undefined` — design §4, the single switch point for the future list-DTO
  cover indicator).
- [ ] T3 (R2, R27, R13, R35) Add `listSongs`, `getSong`, `getCover` to `SongsApi`; extend `songs-api.service.spec.ts`
  (method + URL, `responseType: 'blob'` for covers, id URL-encoded).
- [ ] T4 (R20, R21, R24, R37, R38, R39, R41) Add `src/app/songs/library-load-error.ts` `classifyLoadError` + spec
  (status 0, 401, 404, 500, non-HTTP error).

## Read presets store (needed by the connect flow and "New song")

- [ ] T5 (R55, R56, R63, R64, R65, R66, R68, R69) Create `src/app/pedals/pedal-presets.store.ts` per design §8b
  (`read()` with in-flight dedupe, error mapping moved from the page, `savableSnapshot()`).
- [ ] T6 (R56, R63, R64, R65, R68, R69) `pedal-presets.store.spec.ts`: two overlapping `read()` calls → one
  `readPresets()`; a `read()` after the first resolves → a second `readPresets()`; error mapping (`not_connected` →
  `not_connected_error`); `savableSnapshot()` returns `[]` when not connected, presets with `raw` in slot order when
  connected, a new array instance per call, never mock presets; no HTTP request after `read()` (`verify()`).
- [ ] T7 (R55, R64, R66) Refactor `PresetBrowserPage.loadPresets()` to delegate to the store and mirror store state
  into the page signals via `effect` (design §8b; template unchanged). Run the existing
  `preset-browser-page.spec.ts` — all prior tests must stay green.

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

## Library page

- [ ] T12 (R2, R4, R5, R6, R7, R8, R9, R10, R25) Rewrite `songs-page.{ts,html}` per design §5 and Visual direction
  (grid, cards as `routerLink` anchors, artist rule, preset count keys).
- [ ] T13 (R11, R12, R59) Empty state with `songs-empty-connect` calling `PedalConnectFlow.start()` (T26 must exist —
  implement T26 first if needed, the order here is for reading), and `songs-new` in loaded and empty states.
- [ ] T14 (R20, R21, R22, R23, R24) Error, retry and session-expired states using `classifyLoadError`.
- [ ] T15 (R60, R61, R68, R69, R71, R74) Embed `app-save-song-dialog` bound to the `newSong` snapshot from
  `PedalPresetsStore.savableSnapshot()` (design §5), `testMode=false`; on `closed` clear the snapshot and reload.
- [ ] T16 (R2, R3, R4, R5, R6, R7, R8, R9, R10) New `songs-page.spec.ts`: exactly one `GET /songs` on init; no
  `requestMIDIAccess` call (spy via `vi.stubGlobal`); loading testid while pending; N cards in response order; name;
  artist shown/omitted for `'Queen'`/`null`/`'  '`; count keys for 1 and 3 presets; grid classes.
- [ ] T17 (R11, R12, R59) Spec: empty array → `songs-empty` with both keys; CTA click calls `PedalConnectFlow.start`
  (stubbed); `songs-new` present in loaded and empty states, absent while loading/error.
- [ ] T18 (R18) Spec: two songs, one cover 500 and one 200 → both cards still rendered.
- [ ] T19 (R20, R21, R22, R23, R24) Spec: status 0 → `songs.errors.unreachable` + retry; 500 → `load_failed` + retry;
  retry sends a second `GET /songs`; 401 → `songs-session-expired` with `/login` link and no retry.
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
- [ ] T25 (R25, R57) Spec: card `href` is `/songs/<id>`; rendering the same response with the pedal stub `connected`
  and `MockPresetsStore.load()` called yields identical card names/order as with `not-connected` and empty mocks.

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
  `flex-wrap`, `nav-songs`, connect button behind `isAuthenticated`, error strip with dismiss, mock link navigation).
- [ ] T31 (R43, R44, R45) `app.spec.ts`: authenticated → `nav-songs` (href `/songs`) and `pedal-connect` rendered;
  unauthenticated → neither rendered; connect button present after navigating to `/songs`, `/songs/<id>` and
  `/pedal/presets`.
- [ ] T32 (R53, R54) `app.spec.ts`: flow error set → `pedal-connect-error` with `role="alert"` and the translated
  `pedal.*` key; dismiss removes it.
- [ ] T33 (R58) `app.spec.ts`: mock link on `/songs` → mocks loaded and URL becomes `/pedal/presets`; on
  `/pedal/presets` → mocks loaded, no navigation call.
- [ ] T34 (R55, R56) `preset-browser-page.spec.ts` regression: init while `connected` calls `readPresets` exactly once;
  after it resolves, `HttpTestingController.verify()` shows no request. No source change to the page.

## Detail page and routes

- [ ] T35 (R26) Add `songs/:id` route with `authGuard` to `app.routes.ts`; `app.routes.spec.ts`: route exists,
  guarded, and an unauthenticated navigation to `/songs/x` lands on `/login`.
- [ ] T36 (R1) `app.routes.spec.ts` regression: authenticated navigation to `/` lands on `/songs`.
- [ ] T37 (R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R42) Create `song-detail-page.{ts,html}` per design §6 and
  Visual direction.
- [ ] T38 (R37, R38, R39, R40, R41) Detail not-found, error + retry and session-expired states.
- [ ] T39 (R27, R28, R29, R30, R31, R32, R33, R34, R42) `song-detail-page.spec.ts`: one `GET /songs/<id>` for the route
  id; loading testid; `<h1>` name; artist shown/omitted; presets given as `sortOrder` [2,0,1] render in order 0,1,2
  with positions 1,2,3 and names; no element shows the slot/`sortOrder` raw value beyond the 1-based position and no
  `slot` text; reference note; back link `href="/songs"`.
- [ ] T40 (R35, R36) Spec: `files` with a cover → one cover request; `files` without → `none`, `expectNone` cover.
- [ ] T41 (R37, R38, R39, R40, R41) Spec: 404 → `song-detail-not-found`; status 0 → `unreachable` + retry; 500 →
  `load_failed` + retry; retry sends a second `GET /songs/<id>`; 401 → `song-detail-session-expired` + `/login` link.
- [ ] T42 (R19) Spec: destroying the detail fixture after a loaded cover revokes its object URL once.

## i18n and finish

- [ ] T43 (R62) Add every key from design "UI copy" to `public/i18n/es.json` and `en.json`, remove
  `songs.placeholder`; extend `src/app/songs/i18n-parity.spec.ts` to assert es/en key parity for `songs`,
  `songDetail`, `pedalButton`.
- [ ] T44 (R10, R5, R31) Manual check with Ricardo at 375px and 1280px, light and dark: library grid (with covers,
  without covers, empty), detail page, header wrap with the connect button, error strip. No horizontal overflow.
  Record the outcome in `progress/impl_library_first_startup.md`.
- [ ] T45 (R1-R74) Run `./init.sh` green; write the R→test traceability table in
  `progress/impl_library_first_startup.md`.
