# Tasks — gp5_preset_chain_visual_board

Pure data and logic first, then components, then page wiring, then i18n. Each test task names the `R<n>` it
proves. The implementer documents the final R → test mapping in `progress/impl_gp5_preset_chain_visual_board.md`.

## Parameter catalog

- [x] T1 (R1, R2, R3, R4) Create `src/app/midi/gp5-fx-catalog.ts` with `Gp5FxCatalogEntry` and
  `GP5_FX_CATALOG`. Transcribe every row of design.md's "Parameter-name table", checking each against
  external_docs/gp-5-manual.pdf pp.20-36, and set `descriptionKey` to `gp5Fx.c<c>.f<i>`.
- [x] T2 (R11, R12) Add the file header comment (HYPOTHESIS points 1-4 from design.md, the transcription
  notes, and the MOD-tremolo omission) and the `GP5_FX_PARAMETER_MAPPING_STATUS` constant. Mirror the
  header convention of `gp5-module-vocabulary.ts`.
- [x] T3 (R6, R7, R8) Implement `describeParameters` using feature 10's `parseModuleType` and
  `describeModuleType`. Do not copy the vocabulary.
- [x] T4 (R1) Test: `GP5_FX_CATALOG` has 10 arrays, and `GP5_FX_CATALOG[c].length ===
  GP5_MODULE_FX_TITLES[c].length` for every `c`.
- [x] T5 (R2) Test: spot-check exact `parameterNames` for at least one FX per category, including the edge
  rows UK 50JP, Ring Echo, EV 51, Mess EQ, and Detune. Also test that every list has 1 to 8 entries.
- [x] T6 (R3) Test: spot-check `manualPage` (Gate → 20, AC Pre2 → 30, AMPG 4x10 → 31, Sweet Space → 36).
  Also test that every page is within 20-36.
- [x] T7 (R4) Test: every entry's `descriptionKey` equals `gp5Fx.c<c>.f<i>`.
- [x] T8 (R6) Test: `describeParameters('cat4_fx1', {p0: 1, …, p7: 8})` returns 6 labelled entries
  (`Gain`=1 … `Treble`=6).
- [x] T9 (R7) Test: a resolved FX with missing `p<k>` keys returns `value: null` for those entries.
- [x] T10 (R8) Test: `'empty'` and `'cat99_fx0'` return raw entries sorted `p0, p1, …, p10` numerically,
  not lexically.
- [x] T11 (R11, R12) Test: `GP5_FX_PARAMETER_MAPPING_STATUS` contains `HYPOTHESIS` and `gp-5-manual.pdf`.

## Block view helpers

- [x] T12 (R9, R10, R13, R14, R16, R19) Create `src/app/pedals/chain-block-view.ts` with:
  - `toChainBlockView`, `categoryStyle`, and `NEUTRAL_BLOCK_STYLE`, using the literal class strings from
    design.md's palette;
  - `DIMMED_CLASS`, `formatParameterValue`, and `displayCategoryCode`.
- [x] T13 (R9) Test: `formatParameterValue` gives `3`→`"3"`, `0.5`→`"0.5"`, `1.23456`→`"1.23"`,
  `-0.004`→`"0"`.
- [x] T14 (R10) Test: `formatParameterValue` returns `"—"` for `null`, `NaN`, `Infinity`, and `-Infinity`.
- [x] T15 (R13) Test: the 10 category `bg-*` classes are pairwise distinct and distinct from the neutral
  one, and `categoryStyle(42)` returns `NEUTRAL_BLOCK_STYLE`.
- [x] T16 (R14) Test: every category style and `NEUTRAL_BLOCK_STYLE` contains a `dark:` class.
- [x] T17 (R16, R19) Test: `toChainBlockView` resolves `cat1_fx0` to PRE/COMP with category index 1 and FX
  index 0, and maps `'empty'` to `kind: 'unknown'` with the neutral style.

## Components

- [x] T18 (R15, R16, R17, R18, R19, R39) Create `src/app/pedals/chain-strip/` (`ts` + `html`) per
  design.md "UI structure → Strip".
- [x] T19 (R16, R17, R18, R19, R22, R24, R38) Create `src/app/pedals/chain-board/` (`ts` + `html`). It
  emits `blockSelected(position)` and reflects `aria-pressed`.
- [x] T20 (R26, R27, R28, R29, R30, R31, R32, R33, R34, R35) Create `src/app/pedals/block-detail/`
  (`ts` + `html`), including the FX browser. The browse state resets when the `slot` input changes.
- [x] T21 (R15, R16, R39) Test `chain-strip.spec.ts`: one block per chain entry in order, the category code
  is shown, the category class is applied, and the container and blocks carry `flex`/`w-full` and
  `flex-1`/`min-w-0`.
- [x] T22 (R17, R18) Test: a bypassed entry's strip block and board block have `opacity-40`, and an enabled
  entry's blocks do not.
- [x] T23 (R19) Test: a chain mixing resolved entries and `'empty'`/`cat99_fx0` renders neutral blocks at
  the right positions, and the block count equals `chain.length`.
- [x] T24 (R22, R38) Test `chain-board.spec.ts`: one `<button>` per chain entry in order, and the grid
  carries `grid-cols-5` and `sm:grid-cols-10`.
- [x] T25 (R24) Test: clicking board block `k` emits `k`.
- [x] T26 (R26, R27, R28) Test `block-detail.spec.ts`: for a resolved enabled entry and a resolved bypassed
  entry, the translated category name, FX title, and on/off label are shown.
- [x] T27 (R29) Test: the parameter rows match `describeParameters` labels and formatted values in order.
- [x] T28 (R30) Test: the hypothesis notice is rendered.
- [x] T29 (R31, R32) Test: an unresolved entry shows the unknown-module message and no browse control.
- [x] T30 (R33, R34) Test: browsing an AMP block renders 32 entries in order. Entry 0 shows `Tweedy`, its
  translated description, and `Gain, Tone, VOL`.
- [x] T31 (R35) Test: only the entry at the block's FX index has `aria-current="true"` and the active badge.

## Page wiring

- [x] T32 (R15, R20, R21, R22, R23, R24, R25) Update `preset-browser-page.ts` and `.html`:
  - replace `chainSummary()` with `<app-chain-strip>`;
  - add the board and detail section driven by `SelectedPresetStore.selectedPreset()` and
    `selectedBlockIndex`;
  - make `selectPreset` reset `selectedBlockIndex`;
  - switch the responsive row layout to `flex-col sm:flex-row`.
- [x] T33 (R15, R21) Update `preset-browser-page.spec.ts`:
  - replace the old `preset_browser_ui` R9 test ("renders only enabled moduleTypes, comma-separated") with
    a test that each row renders a strip with one block per chain entry;
  - narrow the R10 test to `chain: []`.
- [x] T34 (R20) Test: after loading presets that contain `cat1_fx0`, `cat99_fx0`, and `'empty'` entries,
  selecting one, and opening every block's detail, the page's `textContent` does not match
  `/cat[0-9a-f]+_fx[0-9a-f]+/i`. Also assert that the `'empty'` entry's strip block and board block show
  the unknown label (R19), not the string `empty`.
- [x] T35 (R22, R23) Test: no board before selection. After clicking Select on a row, the board shows that
  preset's blocks.
- [x] T36 (R24, R25) Test: clicking a board block opens the detail. Selecting another preset closes it.
- [x] T37 (R36, R37) Read-only tests per design.md "Read-only guarantee". With `writePreset`/`readPresets`
  spies, and separately with a stubbed `MIDIOutput.send` spy, go through every board block, the browse
  toggle, and close. Assert `writePreset` is never called, `readPresets` is called exactly once, and the
  `send` count is unchanged after the initial load.

## i18n

- [x] T38 (R5, R40) Add the `chainBoard` namespace and all 108 `gp5Fx.c<c>.f<i>` descriptions to
  `public/i18n/en.json` (manual text, pp.20-36) and `public/i18n/es.json` (Spanish translation), per
  design.md "i18n keys".
- [x] T39 (R5) Test in `gp5-fx-catalog.spec.ts`: every `descriptionKey` resolves to a non-empty string in
  both JSON files.
- [x] T40 (R40) Test `src/app/pedals/i18n-parity.spec.ts`: the key paths under `chainBoard` and `gp5Fx` are
  identical in `en` and `es`, and every value is non-empty.

## Verification

- [x] T41 (R38, R39, R14) Manual Level 2 check (`bun run start`). This backs up the class-based tests
  T16, T21, and T24:
  - at 375px and ≥1024px widths, in light and dark mode, confirm there is no horizontal overflow on rows,
    the board, or the detail;
  - confirm the colors are legible in both themes;
  - confirm the bypassed dimming is visible.

  Use the real pedal if available, otherwise a stubbed `readPresets`. Record the result in
  `progress/impl_gp5_preset_chain_visual_board.md`. Check the result against design.md's "Visual
  direction" section (palette, LED, lifted selected block, cable at `sm`+, scroll-on-select) and record
  the palette and block patterns in `docs/architecture.md` §2b. Note: the `sm:` breakpoint is **640px**
  in Tailwind v4, not 1024px — the previous "≥1024px (the sm: breakpoint)" wording in the prior impl
  doc was incorrect and is corrected here.

  **Status:** performed manually with Ricardo (the user) and confirmed on 2026-09-29, during feature 16
  (`gp5_preset_chain_visual_board_review_fixes`). At 375px and ≥1024px, in light and dark mode: no
  horizontal overflow on rows, the board, or the detail; colors legible in both themes; bypassed dimming
  visible. Palette and block patterns are recorded in `docs/architecture.md` §2b. Out of scope here, by
  the user's decision: the pedal-style visual redesign is feature 17's scope (with its own visual check),
  and the AMP FX title mismatch is feature 19's scope (vocabulary).
- [x] T42 Run `./init.sh`. It must pass, including `bun run test` and `bun run build`.
- [ ] T43 (R11 follow-up, hardware verification; **not** executable by an implementer or reviewer
  session) Ricardo sets known knob values on the real GP-5 for a sample of FX (at least one AMP, one DLY,
  one EQ, and one PRE with a switch control). He reads them through this screen and compares the labelled
  values and scales with the pedal. Leave this **unchecked** when the feature is otherwise closed. This is
  the documented justification per `docs/specs.md`, the same as feature 10's T17. Once it is done, update
  `GP5_FX_PARAMETER_MAPPING_STATUS` and T11's test in a separate follow-up change citing what was checked.
