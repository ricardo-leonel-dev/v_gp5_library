# Tasks — `import_preset_to_pedal` (feature 5)

Execute in order. Each task names the `R<n>` it covers; tests are their own tasks so traceability in
`progress/impl_import_preset_to_pedal.md` can point at concrete test names. Do not start until the spec is
approved **and** the backend feature `multiple_presets_per_song` (backend F15) is `done` (it is — F4 §0
dependency 1, verified in `progress/f4_rev5_backend_contract.md`, backend main checkout at `04eda42` on
`dev`).

OD1-OD5 are resolved by the F4 Rev 4/5 backend contract (see requirements.md "Decisions"); no question is
unanswered. The notable precondition is OD5 — today's `encodeBody` does not satisfy byte-identity, and F5
**fixes** `encodeWriteRequest` as T1-T3.

## 0. Precondition

- [x] T1 (OD5, R47, R48) `gp5-sysex-preset-codec.ts`: in `encodeWriteRequest`, branch on `preset.raw?.body`:
  when `length === GP5_BODY_LEN` (466), `payload.set(preset.raw.body, WRITE_HDR.length + NAME_LEN)` and
  skip `encodeBody` (R42); when absent or wrong length with `raw` set, throw `Error('preset_bytes_unavailable')`
  (R46); else fall through to today's path (R43). In both branches, prefer `preset.raw.nameField` over the
  `TextEncoder`-from-name path when `preset.raw?.nameField.length === NAME_LEN` (R44). Header bytes, chunk
  size, CRC-8 and `toWire` framing stay untouched (R45). Append a dated note (2026-10-05) under discarded
  alternative #2 of `specs/sysex_preset_read_write/design.md` saying F5 completes the partial reversal F4
  began.
- [x] T2 (R47) `gp5-sysex-preset-codec.spec.ts`: with a captured 466-byte body and a 16-byte name field,
  build a `Preset` whose `raw` is set; call `encodeWriteRequest(preset)`; assert the 26 wire packets, after
  `fromWire` (or equivalent decode in the test helper), yield bytes whose `payload[22..22+466)` equal `body`
  byte-for-byte and `payload[6..22)` equal `nameField`. If the layout proves different, **stop and report**
  for a spec revision.
- [x] T3 (R48) `gp5-sysex-preset-codec.spec.ts`: with a `Preset` whose `raw` is absent, call
  `encodeWriteRequest`; assert the produced payload is byte-identical to today's implementation
  (snapshot a known fixture). This is the fallback branch of R43 and must not regress.
- [x] T4 (R49, manual) Run the hardware round-trip on a real GP-5: capture body of slot X via the read path,
  save it as a song via the F4 dialog, fetch the bytes back, write them to slot Y, read slot Y back via
  `progress/gp5_webmidi_backup_all.html`, assert the read-back 466 bytes are byte-identical to the saved
  ones. Record the three SHA-256 hashes (captured, saved, read-back) in
  `progress/impl_import_preset_to_pedal.md` and stop if the round-trip is not byte-identical.
  > 2026-10-07: PASSED — three byte-identical hashes in `progress/impl_import_preset_to_pedal.md` ("T4 evidence"); read-back via `progress/gp5_t4_roundtrip.html` (see Deviations there).

## A. Models — `src/app/songs/write-preset-form.ts`

- [x] T5 (R5, R13) New `src/app/songs/write-preset-form.ts` exporting `WriteablePresetRef` (with
  `songId`, `sortOrder`, `presetId`, `name`, `position`), `WriteRequest`, `WritePlan`, `planWrites`,
  `targetSlotsFor`, `mapPedalWriteError`, `mapFetchError`, `decodeSongPreset` (the only place outside
  `src/app/midi/` that knows the `.prst` body / name offsets — R13's slice calls live here).
- [x] T6 (R13, R8) `write-preset-form.spec.ts`: `decodeSongPreset` with a 507-byte fixture passes body /
  nameField slices of the right lengths; a non-507-byte input returns a tagged error.
- [x] T7 (R17, R21, R33) `write-preset-form.spec.ts`: `planWrites` throws `out_of_range` for slot 100 / -1;
  throws `not_enough_room` with `{M, N, available}` for `writeAll=true, N=5, M=96`; returns the right item
  list for both single and multi modes.
- [x] T8 (R9-R12, R37) `write-preset-form.spec.ts`: `mapFetchError` maps 0 / 401 / 404 / other to the right
  keys; `mapPedalWriteError` maps `not_connected`, `request_in_progress`, `read_timeout`, anything else.

## B. Backend client — `src/app/songs/songs-api.service.ts`

- [x] T9 (R6) `songs-api.service.ts`: add `getSongPreset(songId: string, sortOrder: number): Promise<Uint8Array>`
  that does `firstValueFrom(http.get<Blob>(url, { responseType: 'blob' }))` and `new Uint8Array(await blob.arrayBuffer())`.
  No Bearer header set — `authInterceptor` does it (F4 R91-equivalent for the GET).
- [x] T10 (R6, R9-R12) `songs-api.service.spec.ts`: with `provideHttpClientTesting()`, a 200 + 507-byte
  blob resolves a `Uint8Array` of length 507; a 404 rejects with `HttpErrorResponse({ status: 404 })`; a 401
  rejects with status 401; status 0 rejects with the network error shape; a 500 rejects with the unexpected
  shape.

## C. Dialog — `src/app/songs/write-to-pedal-dialog/`

- [x] T11 (R3, R4, R15-R19, R20-R24, R25, R31, R32) Create the dialog component
  (`write-to-pedal-dialog.{ts,html}`) per design §4 with the inputs/outputs and signals listed there; one
  initial render focused on the picker; Escape / backdrop ignored while submitting.
  > 2026-10-06 patch: connect button added per design §4 (R25/R26).
- [x] T12 (R28, R30, R36-R41) `submit()` pipeline (design §4): plan, fetch per item via `SongsApi.getSongPreset`,
  `decodeSongPreset` per item, `pedal.writePreset` per item, sequential; partial-progress list on mid-sequence
  reject; success / failure swap; form retained on reject.
  > 2026-10-07 review fixes: covered by the "submit pipeline" tests in `write-to-pedal-dialog.spec.ts`
  > (stubbed `SongsApi` + pedal).
- [x] T13 (R37, R34) Failure-mapping inside `submit()`: `mapFetchError` for fetch rejections, `mapPedalWriteError`
  for write rejections, `connectionLost` on `connectionState` flip mid-sequence; never throws.
  > 2026-10-07 review fixes: `connectionState` is now re-checked before each fetch and again before each
  > `writePreset`; tests for R8-R12, R34 and R37 added to `write-to-pedal-dialog.spec.ts`.
- [x] T14 (R51, R52) Component spec: assert the literal class strings from design "Visual direction" are
  present on the backdrop, card, picker, mode toggle, summary, send button, failure banner, success panel;
  assert the dark-mode counterparts on each; assert the picker has `inputmode="numeric"` and
  `pattern="[0-9]*"`.
  > 2026-10-07 review fixes: mode toggle (both states), summary, failure banner, success panel and the
  > selected row's `dark:bg-indigo-950/30` assertions added ("palette" describe block).
- [x] T15 (R31, R32, R41) Component spec: while `submitting()` is true, Send is disabled and shows
  `writeToPedal.writing`; Escape and backdrop click are no-ops; on reject the form returns and Send becomes
  enabled again; on success the form is replaced.
  > 2026-10-07 review fixes: Escape/backdrop tests (in flight and idle) and the reject→retry test added.
- [x] T16 (R53) Song card click handler: button is `type="button"`, has `(click)="$event.stopPropagation();
  openWriteDialog()"`, no other side effects on the card's R25 navigation.

## D. Library page — `src/app/songs/songs-page/`

- [x] T17 (R3, R53, R54) `songs-page.{ts,html}` (F26 implementation): add the "Send to pedal" button on
  each `data-testid="song-card"` (per design §5 styling), wired to `openWriteDialog(song)`; button is
  hidden while the page is in `songs-loading` / `songs-error` / `songs-session-expired` (R54); the page
  hosts one `<app-write-to-pedal-dialog [song] [presets]>` and clears the state on `closed`.
- [x] T18 (R4) Snapshot: `openWriteDialog` stores `{ song, presets }` once; later page changes cannot swap
  presets under an open dialog.
- [x] T19 (R32) Focus return on dialog close: `queueMicrotask(() => sendButton()?.nativeElement?.focus())`
  matches the F4 idiom.
  > 2026-10-07 review fixes: `viewChild` on a button inside `@for` always returned the first card's button.
  > Now `viewChildren` + the opening song's id; tested with 3 songs in `songs-page.spec.ts`.

## E. i18n + parity

- [x] T20 (R50) `public/i18n/{es,en}.json`: add the `writeToPedal` and `writeToSlot` namespaces from
  design "Visual direction" → Copy, plus the `songs.card.send_to_pedal` and `songs.card.send_to_pedal_aria`
  keys.
- [x] T21 (R50) `src/app/songs/i18n-parity.spec.ts`: extend the helper to assert parity under
  `writeToPedal` and `writeToSlot`.

## F. Integration / regression

- [x] T22 Run `./init.sh` (verify command per `.harness.json`) and confirm green. Run any test suites the
  project requires (`bun run test`) and confirm green.
  > 2026-10-07: `direnv exec . ./init.sh` green — 1139 tests / 34 files passed (only `[WARN]` is the best-effort mirror sync).
- [x] T23 Manual check at 375px and 1280px in light and dark: no overlap, no cut-off, focus order correct,
  the picker is numeric, the success / failure panels render correctly.
  > 2026-10-07: approved by Ricardo 2026-10-07 ("Aprobado T23") — 375px/1280px, light/dark, numeric keyboard on phone.
