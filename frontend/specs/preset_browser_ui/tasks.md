# Tasks — preset_browser_ui

- [x] T1 (R1) Add `SelectedPresetStore` to `src/app/pedals/selected-preset.service.ts`: a
  `signal<Preset | null>(null)` and its readonly `selectedPreset` accessor.
- [x] T2 (R2) Add `SelectedPresetStore.select(preset)`, setting the signal's value to `preset`.
- [x] T3 (R1, R2) Add `selected-preset.service.spec.ts`: initial `selectedPreset()` is `null`; `select()`
  sets it; a second `select()` call replaces the previous value.
- [x] T4 (R3) Create `PresetBrowserPage` (`src/app/pedals/preset-browser-page/`) with the `supported`,
  `connectionState`, `loadState`, `presets`, `error` fields and the unsupported-browser template branch.
- [x] T5 (R4) Implement the not-connected template branch and the `ngOnInit` guard that returns before
  calling `readPresets()` in both the unsupported and not-connected cases.
- [x] T6 (R5) Implement `loadPresets()`'s call to `this.pedal.readPresets()`, invoked exactly once from
  `ngOnInit` when supported and connected.
- [x] T7 (R6) Implement the `loadState() === 'loading'` template branch.
- [x] T8 (R7, R8) Implement the resolved-preset rendering: `@for` over `presets()` in array order, each row
  showing `slot` and `name`.
- [x] T9 (R9, R10) Implement `chainSummary()` (enabled `moduleType`s, comma-joined, chain order) and the
  template's empty-chain placeholder fallback.
- [x] T10 (R11) Implement the rejection path: `loadState` set to `'error'`, `error` set from the rejection's
  `message`, and the template's error branch (no preset rows rendered in this branch).
- [x] T11 (R12) Implement the empty-array branch (`loadState() === 'loaded' && presets().length === 0`)
  rendering the translated "no presets found" message.
- [x] T12 (R15) Implement `selectPreset(preset)` calling `this.selectedPresetStore.select(preset)`, wired to
  each row's select button.
- [x] T13 (R13) Add the guarded, lazy-loaded `pedal/presets` route to `src/app/app.routes.ts`, using the
  same `canActivate` guard as the existing `pedal` route.
- [x] T14 (R13) Add `src/app/app.routes.spec.ts`: asserts the `pedal/presets` route exists, its
  `canActivate` matches the `pedal` route's, and its `loadComponent()` resolves to `PresetBrowserPage`.
- [x] T15 (R14) Add the `presets-link` anchor to `pedal-connection-page.html` (rendered only when
  `connectionState() === 'connected'`) and add `RouterLink` to `PedalConnectionPage`'s `imports`.
- [x] T16 (R14) Extend `pedal-connection-page.spec.ts`: the link is absent while not connected, present
  (pointing at `/pedal/presets`) once connected.
- [x] T17 (R3, R4, R5) Add `preset-browser-page.spec.ts` tests: unsupported message with `readPresets` never
  called; not-connected message with `readPresets` never called; connected calls `readPresets` exactly
  once.
- [x] T18 (R6) Add a test with a deferred (unresolved) `readPresets()` promise asserting the loading
  indicator renders.
- [x] T19 (R7, R8) Add a test resolving `readPresets()` with an out-of-slot-order fixture array, asserting
  rows render in that exact array order with the correct `slot`/`name` per row.
- [x] T20 (R9, R10) Add tests for the chain summary: enabled-only, comma-joined, chain-ordered output for a
  mixed enabled/disabled chain; the translated empty-chain placeholder for a chain with no enabled
  entries.
- [x] T21 (R11) Add a test rejecting `readPresets()` with a known error key, asserting the mapped message
  renders and no `preset-row-*` elements exist.
- [x] T22 (R12) Add a test resolving `readPresets()` with `[]`, asserting the "no presets found" message
  renders and no `preset-row-*` elements exist.
- [x] T23 (R15) Add a test clicking a row's select button, asserting the fake `SelectedPresetStore.select`
  is called with that exact preset object.
- [x] T24 (R3, R4, R6, R9, R10, R11, R12, R14, R15) Add the `presetBrowser.*` i18n namespace (`title`,
  `not_connected`, `loading`, `no_presets`, `empty_chain`, `select`, plus one key per possible
  `readPresets()` rejection key and `unknown`) and `pedal.view_presets`, to both `public/i18n/en.json` and
  `public/i18n/es.json`.
