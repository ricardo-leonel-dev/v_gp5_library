# Tasks — gp5_preset_chain_pedal_style_icons (v6)

Execute in order. `F14-R<n>` means feature 14's requirement `R<n>`
(`specs/gp5_preset_chain_visual_board/requirements.md`); plain `R<n>` is this spec. Every class
string and path comes verbatim from design.md or from the playground's winning variant.

**v6 source-of-truth rule**: every SVG primitive copied from the playground (`*.component.ts`
under `src/app/playground/surfaces/...`) must be pasted verbatim into the production component.
Do not redraw, do not paraphrase, do not "simplify". If a primitive cannot be pasted verbatim,
report the deviation, do not silently fix it.

**Regression evidence** (must stay green throughout): feature 14's tests for R15-R19, R22,
R38-R40 and feature 17 v5's tests for R8-R17 (board). If any of those break, the implementer
stops and reports — the leader decides accept-deviation vs. revert.

## Glyph data and component (unchanged from v5)

- [x] T1 (R1, R3, R4) `src/app/pedals/pedal-glyphs.ts` exists with `PEDAL_GLYPHS` (10 entries,
  paths and knob counts from design.md "Glyph table").
- [x] T2 (R1, R2, R3, R4) `pedal-glyphs.spec.ts` passes.
- [x] T3 (R5, R6, R7) `src/app/pedals/pedal-glyph/pedal-glyph.{ts,html}` exists.
- [x] T4 (R5, R6, R7) `pedal-glyph.spec.ts` passes.

## Strip (v6 — mini-chassis)

- [x] T5 (R8, R9, R10) Rewrite `chain-strip.html` so each block renders the v6 mini-chassis
  silhouette: stompbox/amp/cabinet/eq SVG copied verbatim from
  `src/app/playground/surfaces/chain-strip/chain-strip-variant-a.component.ts`. Unknown blocks
  render an empty `<span>`. Each block keeps `flex-1 min-w-0 h-8 rounded-sm overflow-hidden`
  and `shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]`. Category palette + dimmed class stay from v5.
- [x] T6 (R8, R9, R10) Extend `chain-strip.spec.ts`: for each known category the resolved block
  carries the matching chassis SVG (one root `<svg>` per block, child paths from the playground
  variant A); unknown block has none; every block has `h-8` and the inset shadow class.
  Confirm the existing R15, R16, R17, R18, R19, R39 tests still pass unchanged (regression).

## Board (v6 — product photo realism)

- [x] T7 (R11, R12, R13, R14, R15, R16, R17) Rewrite `chain-board.html`'s chassis block so the
  amp / cabinet / eq / rvb drawings come from
  `src/app/playground/surfaces/chassis/chassis-variant-a.component.ts` (verbatim SVG primitives,
  including gradients and patterns). The stompbox template stays from v5 (R12 still pins the
  knob count). Cable `z-0`, grid `relative z-10`, one cell wrapper per block, footswitch,
  glyph, code, title, unknown-empty behaviour all stay from v5.
- [x] T8 (R11, R12, R13) Extend `chain-board.spec.ts`: for a chain covering several categories
  (at least one with 1, 2 and 3 knobs) each resolved block has one matching glyph,
  `PEDAL_GLYPHS[c].knobs` `[data-knob]` elements and one `[data-footswitch]`. Add the new pin
  attributes for the v6 chassis primitives (`[data-chassis-tolex]`, `[data-chassis-faceplate]`,
  `[data-chassis-screw]`, `[data-chassis-grille]`, `[data-chassis-cone]`, `[data-chassis-dustcap]`,
  `[data-chassis-handle]`, `[data-chassis-vent]`, `[data-chassis-slider]`) on the amp/cabinet/eq
  blocks.
- [x] T9 (R14) Test: `'empty'` and `cat99_fx0` blocks contain zero `[data-glyph], [data-knob],
  [data-footswitch]` (and still no LED, per the existing m3 test).
- [x] T10 (R15, R16, R17) Test: the cable element has `z-0`; `[data-testid="chain-board"]` has
  `relative` and `z-10`; every `board-block-*` button's `parentElement` has
  `rounded-lg bg-slate-50 dark:bg-slate-900` and exactly one element child.
- [x] T11 (R17; regression F14-R22, F14-R38) Confirm the existing R22 (one `<button>` per entry,
  chain order) and R38 (grid classes) tests still pass against the new DOM.

## Selected-only chips + main area (chip-set selection)

- [ ] T12 (R18-R23) In `preset-browser-page.ts`: drop `drawerOpen`, `drawerHandleTestId`,
  `toggleDrawer`, `expandedInCompact`, `toggleCompactExpand`, `isCompactExpanded`, the
  sticky-toolbar `activePreset` fallback, the sticky-toolbar `presetToolbarTestId`,
  `presetCardPopupTestId`. Add the new `pickerOpen = signal(false)` (R25), the chip-driven
  `activePreset = signal<Preset | null>(null)` (R21, R24), the `displayPreset` computed that
  returns `activePreset()` if set, otherwise the lowest-slot preset in
  `comparison.selectedSlots()`, otherwise `null`. Add `onChipClick(slot)`, `onChipRemove(slot)`,
  `openPicker()`, `closePicker()`, `onPickerRow(preset)` per design.md "Signatures".
- [ ] T13 (R22, R23, R25, R26, R29) In `preset-browser-page.html`: replace the sticky-toolbar +
  preset-card-popup markup with the selected-only chip row + main area + picker overlay from
  `src/app/playground/surfaces/nav/nav-variant-a.component.ts`, adapted to the page-level
  structure (see design.md "Page layout"). Chip row: `data-testid="chip-row"`,
  chips: `data-testid="preset-chip-<slot>"`, browse pill: `data-testid="browse-presets"`.
  Main area: `data-testid="main-area"`, heading `data-testid="main-heading"`, empty state
  `data-testid="main-empty"`. Picker overlay: `data-testid="picker-backdrop"`,
  `data-testid="picker-card"`, rows: `data-testid="picker-row-<slot>"`.
- [ ] T14 (R18, R19, R22, R26) Page spec: the fake `PresetComparisonStore` exposes `add`,
  `remove`, `clear`, `toggle`, `selectedSlots`. Test: activating a picker row calls `add(slot)`
  exactly once and sets `activePreset` to that preset; clicking the chip for that preset sets
  `activePreset` (no store mutation); clicking the "×" on a chip calls `remove(slot)` exactly
  once and, if the removed preset was active, falls back to the lowest-slot preset in the
  comparison set (or null if empty).
- [ ] T15 (R21, R22, R24) Page spec (real `PresetComparisonStore`): add A, then B; main area
  shows B (because B was the most recently activated); remove A; main area still shows B.
  Click a block in B's board → block-detail appears to the right of B's chassis on `lg+`,
  stacks below on `sm`. No `preset-drawer` / `drawer-handle` / `compact-list` / `compact-row-*`
  / `preset-toolbar` / `preset-tile-*` / `preset-card-popup` elements present in the DOM (v5
  markup fully replaced).
- [ ] T16 (R22, R23, R25) Page spec: chips render only for slots in the comparison set;
  clicking the "Browse presets" pill opens the picker (`pickerOpen() === true`, picker card in
  DOM); clicking a picker row adds the slot and closes the picker; pressing Escape closes the
  picker without adding a slot.

## Block detail — muted footnote (v6 — replaces yellow callout AND quiet pill)

- [ ] T17 (R30, R31) Replace the v5 yellow callout (`data-testid="mapping-hypothesis"` with
  `border-l-2 border-amber-400`) AND the v6-draft quiet pill
  (`data-testid="detail-unverified-pill"`) in `src/app/pedals/block-detail/block-detail.html`
  with the v6 muted footnote: a single small muted text paragraph at the bottom of the card
  carrying `data-testid="detail-footnote"` and the translated `presetBrowser.footnote_unverified`
  text. Markup adapted from
  `src/app/playground/surfaces/block-detail/block-detail-variant-c.component.ts` (variant C
  winner). The existing close button, parameters grid, FX title, category label, browse toggle
  stay.
- [ ] T18 (R30, R31) Extend `block-detail.spec.ts`: no element with
  `[data-testid="mapping-hypothesis"]` is rendered; no element with
  `[data-testid="detail-unverified-pill"]` is rendered; the new
  `[data-testid="detail-footnote"]` is rendered at the bottom of the card and contains the
  translated `presetBrowser.footnote_unverified` text. The existing parameters / on-off /
  category assertions stay green.

## Export marks (unchanged from v5)

- [x] T19 (R32-R35) `src/app/pedals/preset-export-selection.service.ts` exists and
  `preset-export-selection.service.spec.ts` passes (carried forward).
- [ ] T20 (R36, R37, R39) The main area renders the export checkbox for the active preset
  (R36), not for every preset. Single `data-testid="export-mark-<active-slot>"` checkbox;
  toggling it calls `PresetExportSelection.toggle` with that slot (R37); aria-label is the
  translated `mark_for_export` text containing the active preset's name (R39).
- [ ] T21 (R38) Page spec: toggling the export checkbox calls neither `add` nor `remove` on the
  fake store, and with the real store leaves `selectedSlots()` and `activePreset()` unchanged
  (both when null and when a preset is active).
- [ ] T22 (R39) Page spec: the checkbox `aria-label` equals the translated `mark_for_export`
  text containing the active preset's name.

## Read-only guarantee (unchanged from v5)

- [ ] T23 (R40) Extend the existing R36/R37 tests (fake pedal spies and the real
  `WebMidiPedalConnection` `MIDIOutput.send` spy test): chip add/remove, picker activation,
  export-mark toggle on the active preset, and clicking a board block → `writePreset` never
  called, `readPresets` called once, no additional `send` after the initial read.

## Chrome — ghost link (v6)

- [x] T24 (R28) `src/app/app.html` renders the v6 ghost-link mock-data control in the header,
  on the right of the language switcher. Markup adapted from
  `src/app/playground/surfaces/chrome/chrome-variant-a.component.ts` (variant A winner): a
  `<button>` with a download-arrow SVG and the translated
  `presetBrowser.load_test_presets` text label, transparent background, no fill, only a
  download icon + a muted label. Keeps `data-testid="load-mock-presets"` so existing test
  infra keeps working.

## i18n and docs

- [ ] T25 (R41) Update `public/i18n/en.json` and `public/i18n/es.json`:
  - REMOVE: `presetBrowser.drawer_label`, `presetBrowser.drawer_toggle_open`,
    `presetBrowser.drawer_toggle_close`, `presetBrowser.compact_list_label`,
    `presetBrowser.board_header_aria`, `presetBrowser.board_toggle_expand`,
    `presetBrowser.board_toggle_collapse`, `presetBrowser.toolbar_label`,
    `presetBrowser.popup_heading`, `presetBrowser.popup_empty`,
    `presetBrowser.unverified_pill`, `presetBrowser.unverified_tooltip`,
    `presetBrowser.no_selection`, `presetBrowser.no_comparison`.
  - ADD: `presetBrowser.browse_presets`, `presetBrowser.browse_presets_aria`,
    `presetBrowser.presets_selected_count`, `presetBrowser.footnote_unverified` (verbatim from
    design.md "Copy").
  - KEEP: `export_label`, `mark_for_export`, `load_test_presets`.
  Extend `i18n-parity.spec.ts` to assert non-empty strings at every new path (both files). The
  existing R40 parity test stays green.
- [ ] T26 (R42) Update `docs/architecture.md` §2b: refresh the block-pattern paragraph to
  describe the v6 chassis silhouettes (mini-chassis in the strip, product-photo-realism chassis
  in the board) and the chip-based page navigation. Keep the "Pedal icons" paragraph (in-house,
  original SVG paths in `src/app/pedals/pedal-glyphs.ts`).

## Verification

- [ ] T27 Manual Level 2 check — **T41 redo, hard gate**, performed with Ricardo
  (`bun run start`, real pedal or stubbed `readPresets`): at 375px and ≥1024px, light and dark:
  no horizontal overflow on chips, picker, board or detail; the chip row readable at every
  breakpoint; the v6 chassis silhouettes distinguishable on their chassis color; the cable never
  visible over a block; the muted footnote visible at the bottom of the block-detail card; the
  ghost link in the header reads as a quiet developer escape hatch (not a primary action).
  Record the result and Ricardo's approval in
  `progress/impl_gp5_preset_chain_pedal_style_icons.md`. The implementer must not `log-out`
  until Ricardo confirms.
- [ ] T28 Record the R→test traceability map in
  `progress/impl_gp5_preset_chain_pedal_style_icons.md`, including feature 14's R15-R19, R22,
  R38-R40 tests and feature 17 v5's R8-R17 (board) tests as regression evidence.
- [ ] T29 Run `./init.sh`; it must pass, including `bun run test` and `bun run build`. Capture
  4 screenshots from `ng serve` (desktop light, mobile light, desktop dark, block-detail-open)
  to `/tmp/f17v6-impl-shots/`.