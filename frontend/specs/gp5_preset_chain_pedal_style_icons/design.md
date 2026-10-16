# Design — gp5_preset_chain_pedal_style_icons (v6)

Builds on feature 14 (`specs/gp5_preset_chain_visual_board/design.md`, "Visual direction") and the
conventions already recorded in `docs/architecture.md` §2b. Layering, naming, test placement and
i18n rules follow `docs/architecture.md` and `docs/conventions.md` unchanged; this file only records
the choices made inside those boundaries.

## v6 layout — selected-only chips + main area

After v2 (side-by-side drawer), v3 (mutually exclusive drawer/board), v4 (voltforge-style
accordion on a separate board area), v5 (drawer IS the page, multi-select comparison, sticky
toolbar on the LEFT edge), the final v6 model is:

- **Selected-only chips row** along the top of the page. Only presets in the comparison set
  render as compact chips. A "Browse presets" pill sits at the end of the row (always visible).
- **Main area** below the chip row. Renders the active preset's chain board + (when a block is
  active) the right-side detail panel. The board fills the main area; no drawer, no compact list,
  no sticky toolbar, no floating tab.
- **Block detail on the right** of the chassis grid within the main area (stacks below on narrow
  viewports).
- **Picker overlay** opens when "Browse presets" is clicked. Lists every loaded preset; activating
  a row adds it to the comparison set and closes the picker.
- **Mock data ghost link** in the page header (download-icon + text link, no fill). Replaces v5's
  indigo "Load test presets" filled button.
- **Muted footnote block detail.** Replaces v5's yellow callout AND the v6-draft quiet pill with
  a single line of muted text at the bottom of the card.

The per-kind chassis silhouettes (AMP / CAB / EQ / RVB), the 5×2 grid, the cable serpentine, the
export mark checkbox, and the toggle behaviour for export-mark are all kept verbatim.

The 5 visual variants Ricardo picked from the `/playground` sandbox are the source of truth for the
new treatments. SVG primitives from the playground live in `src/app/playground/surfaces/.../*.ts` —
the implementer MUST copy them verbatim into production; do not redraw, do not paraphrase, do not
"simplify" them.

## Grounding (current code)

- `src/app/pedals/chain-block-view.ts` — `toChainBlockView`, `categoryStyle`, `NEUTRAL_BLOCK_STYLE`,
  `DIMMED_CLASS`, `displayCategoryCode`. Palette stays as-is.
- `src/app/pedals/chain-strip/chain-strip.{ts,html}` — strip block class is built in `blocks`
  computed.
- `src/app/pedals/chain-board/chain-board.{ts,html}` — cable SVG `data-testid="chain-cable"` is the
  first child of `<section class="relative">`, the grid follows; blocks are `relative h-28 …`
  buttons directly inside the grid.
- `src/app/pedals/preset-browser-page/preset-browser-page.{ts,html}` — the page wraps everything;
  in v6 this becomes `<header chip-row> + <main main-area>` structure, with an `activePreset`
  signal driven by chip selection.
- `src/app/app.html` — page background `bg-slate-50 dark:bg-slate-900`. Header carries
  `app-language-switcher` and `app-dark-mode-toggle` on the right; v6 adds the ghost-link mock-data
  control on the right of the header too.
- Page background is `bg-slate-50 dark:bg-slate-900` (`src/app/app.html`).

### Cable root cause (carried forward from v3)

The cable was painted before the blocks in DOM order; bypassed blocks carry `opacity-40` and
unknown blocks use `bg-transparent`, so a 2px line across the middle of the row was visible
through them. The fix is explicit z-order (R15, R16) plus an opaque page-colored cell behind each
button (R17).

## Icon source (R4, R42)

Options unchanged from v5. The recommendation and the existing `PEDAL_GLYPHS` table stay verbatim.

## Glyph table (R1-R4)

Unchanged from v5. The 10 `path` strings, slider counts and `kind` values in
`src/app/pedals/pedal-glyphs.ts` are the source of truth for the small pedal glyph (R5-R7).
Product-photo-realism chassis is a SEPARATE concern (the big chassis silhouette inside the board
block, R11); it does not change the pedal-glyph data.

## Files to touch

New (v6):
- None — the v5 files are reused and edited.

Changed:
- `src/app/pedals/chain-strip/chain-strip.html` — strip block renders the v6 mini-chassis
  silhouette (R8, R10). The exact SVG primitives come from
  `src/app/playground/surfaces/chain-strip/chain-strip-variant-a.component.ts` (variant A winner).
- `src/app/pedals/chain-board/chain-board.html` — chassis block renders the v6 product-photo-realism
  silhouettes for amp, cabinet, eq, rvb (R11). The exact SVG primitives come from
  `src/app/playground/surfaces/chassis/chassis-variant-a.component.ts` (variant A winner).
- `src/app/pedals/block-detail/block-detail.html` — replaces the v5 yellow callout AND the
  v6-draft quiet pill with a single muted footnote line at the bottom of the card (R30, R31). The
  exact markup comes from `src/app/playground/surfaces/block-detail/block-detail-variant-c.component.ts`
  (variant C winner).
- `src/app/app.html` — adds the v6 ghost-link mock-data control next to the language switcher.
  Exact markup from `src/app/playground/surfaces/chrome/chrome-variant-a.component.ts` (variant A
  winner), adapted to the existing header structure (right-aligned, no separate row).
- `src/app/pedals/preset-browser-page/preset-browser-page.{ts,html}` — full rewrite for the v6
  selected-only chips + main area model. Drops `drawerOpen`, `drawerHandleTestId`,
  `expandedInCompact`, `toggleDrawer`, `toggleCompactExpand`, `isCompactExpanded`, `activePreset`
  from the sticky-toolbar draft. Adds `activePreset` signal driven by chip selection (R21, R24)
  and the picker overlay (R25-R27). Exact markup from
  `src/app/playground/surfaces/nav/nav-variant-a.component.ts` (variant A winner), adapted to
  page-level chrome (chips replace the variant's chip row; the main area replaces the variant's
  mini-board; the picker overlay is the variant's "Browse…" picker).
- `public/i18n/en.json`, `public/i18n/es.json` — REMOVES the v5 keys `drawer_label`,
  `drawer_toggle_open`, `drawer_toggle_close`, `compact_list_label`, `board_header_aria`,
  `board_toggle_expand`, `board_toggle_collapse`, `toolbar_label`, `popup_heading`, `popup_empty`,
  `unverified_pill`, `unverified_tooltip`, `no_selection`, `no_comparison`. ADDS v6 keys per
  design.md "Copy".
- `src/app/pedals/i18n-parity.spec.ts` — extended parity loop covers the new keys; removed-key
  check is not required (i18n-parity tests present-keys, not absent-keys).
- `docs/architecture.md` §2b — updates the block-pattern paragraph to describe the v6 chassis
  silhouettes (mini-chassis in the strip, product-photo-realism chassis in the board) and the
  chip-based page navigation.

Not touched: `chain-block-view.ts` (palette, `DIMMED_CLASS`), `gp5-module-vocabulary.ts`,
`gp5-fx-catalog.ts`, `gp5-sysex-preset-codec.ts`, anything under `src/app/midi/`. The
`pedal-glyph` component stays as-is (R1-R7 unchanged).

Deleted (no longer referenced):
- v5 test cases that asserted on `drawerOpen`, `drawerHandleTestId`, `compact-list`,
  `expandedInCompact` are replaced by v6 tests asserting on chips and the picker (see tasks.md).
- v6-draft (sticky-toolbar) test cases that asserted on `preset-toolbar`, `preset-tile-<slot>`,
  `preset-card-popup`, `popup-heading`, `popup-empty` are replaced by chip tests.
- v6-draft `detail-unverified-pill` / `detail-unverified-tooltip` test cases are replaced by
  `detail-footnote` tests.
- v5 / v6-draft i18n keys listed above are removed from `public/i18n/{en,es}.json`. Existing
  translations (`export_label`, `mark_for_export`, `load_test_presets`) are reused.

#### Signatures

```ts
// src/app/pedals/preset-browser-page/preset-browser-page.ts (v6)
class PresetBrowserPage {
  readonly comparison = inject(PresetComparisonStore);
  readonly exportSelection = inject(PresetExportSelection);

  // v6: single-active signal driven by chip selection (R21, R24).
  readonly activePreset = signal<Preset | null>(null);

  // v6: picker open/close signal (R25).
  readonly pickerOpen = signal(false);

  // Derived: when activePreset is null but the comparison set is non-empty,
  // fall back to the lowest slot in the comparison set.
  readonly displayPreset = computed<Preset | null>(() => { ... });

  // Chip events (R20, R21).
  onChipClick(preset: Preset): void { ... }
  onChipRemove(slot: number): void { ... }

  // Picker events (R25, R26).
  openPicker(): void { ... }
  closePicker(): void { ... }
  onPickerRow(preset: Preset): void { ... }

  onBlockClicked(presetSlot: number, click: ChainBlockClicked): void { ... }
  onExportMarkChange(slot: number): void { ... }
}
```

`displayPreset` is the actual preset rendered in the main area: it is `activePreset()` if set,
otherwise the lowest-slot preset in `comparison.selectedSlots()`, otherwise `null`.

#### Visual direction

Subject: a guitarist inspecting presets on their phone or laptop with the GP-5 connected. The
selected-only chips are the navigation; the chassis drawings (AMP/CAB/EQ/RVB in particular)
ARE the memorable thing; everything else (chip chrome, page chrome, header chrome, block detail)
stays quiet slate + the subject's existing palette.

**Palette.** Unchanged: chassis color = `categoryStyle(c)` / `NEUTRAL_BLOCK_STYLE` from
`chain-block-view.ts`. All drawn parts (glyph, knob indicator, footswitch) use `currentColor` or
black/white alpha, so they inherit the palette's text color, which already has ≥4.5:1 contrast
on its chassis in both themes. No new hues.

**Type.** Unchanged family. Category codes stay the only uppercase text (`font-bold
tracking-tight`).

**Chrome.** The page header carries (left to right): `app-language-switcher`,
`app-dark-mode-toggle`, the ghost-link mock-data control. The ghost link is right-aligned, sits
between the dark-mode toggle and the right edge, and renders as a transparent button with a
download-arrow SVG + the translated `presetBrowser.load_test_presets` text label.

### Chip row (top of the page)

The chip row sits above the main area. Each chip is a small pill showing the slot number
(monospace), the preset name (truncated), and an "×" control on the right.

```
<header data-testid="chip-row">
  <p class="...">{{ t('presetBrowser.presets_selected_count', { count: chipSlots().length }) }}</p>
  <div class="flex flex-wrap gap-1.5">
    @for (slot of chipSlots(); track slot) {
      <button type="button"
              class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
              [attr.data-testid]="'preset-chip-' + slot"
              (click)="onChipClick(slot)">
        <span class="font-mono text-[10px] opacity-70">{{ slot }}</span>
        <span class="font-medium truncate max-w-[10rem]">{{ nameFor(slot) }}</span>
        <span role="button" aria-label="Remove"
              class="ml-1 opacity-60 hover:opacity-100"
              (click)="onChipRemove(slot, $event)">×</span>
      </button>
    }
    <button type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:text-slate-900 dark:border-slate-600 dark:text-slate-400"
            data-testid="browse-presets"
            (click)="openPicker()">
      <span aria-hidden="true">+</span>
      <span>{{ t('presetBrowser.browse_presets') }}</span>
    </button>
  </div>
</header>
```

WHEN the comparison set is empty the chip row is replaced by a single "Browse presets" pill above
the main area (R23).

### Main area (below the chip row)

```
<main class="min-w-0 flex-1 p-4" data-testid="main-area">
  @if (displayPreset(); as p) {
    <p class="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100"
       data-testid="main-heading">
      {{ p.slot }} — {{ p.name }}
    </p>
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div class="lg:flex-[3] min-w-0">
        <app-chain-board [chain]="p.chain" [presetName]="p.name"
                         (blockClicked)="onBlockClicked(p.slot, $event)">
        </app-chain-board>
      </div>
      @if (selectedBlockFor(p.slot); as block) {
        @if (block.slot) {
          <div class="lg:flex-[1] min-w-0" data-testid="block-detail">
            <app-block-detail [slot]="block.slot"
                              (closed)="onBlockClicked(p.slot, block)">
            </app-block-detail>
          </div>
        }
      }
    </div>
    <label class="mt-3 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <input type="checkbox" data-testid="export-mark-{{p.slot}}" ...>
      {{ t('presetBrowser.export_label') }}
    </label>
  } @else {
    <p class="text-sm text-slate-500 dark:text-slate-400"
       data-testid="main-empty">
      {{ t('presetBrowser.browse_presets') }}
    </p>
  }
</main>
```

The main area is `flex-1` (fills the rest of the page). The chain board is `w-full` inside the
main area; the block detail panel stacks below on `sm`/`md` and floats to the right on `lg+`.

### Picker overlay (R25-R27)

WHEN the user clicks "Browse presets", the picker overlay opens over the page. Render as a
centered card with a backdrop (no animation, no portal). List every loaded preset as a row
(`data-testid="picker-row-<slot>"`); pressing Escape or clicking the backdrop closes it.

```
@if (pickerOpen()) {
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
       data-testid="picker-backdrop"
       (click)="closePicker()">
    <div class="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-slate-800"
         data-testid="picker-card"
         (click)="$event.stopPropagation()">
      <ul class="divide-y divide-slate-200 dark:divide-slate-700">
        @for (preset of presets(); track preset.slot) {
          <li>
            <button type="button"
                    class="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    [attr.data-testid]="'picker-row-' + preset.slot"
                    (click)="onPickerRow(preset)">
              <span class="font-mono text-xs opacity-70">{{ preset.slot }}</span>
              <span class="font-medium">{{ preset.name }}</span>
            </button>
          </li>
        }
      </ul>
    </div>
  </div>
}
```

### Page layout and section order

`bg-slate-50 dark:bg-slate-900`, header at the top, then a `<div class="flex flex-col">` containing
the chip row (R22, R23) and the main area (R24). No sticky toolbar, no drawer, no compact list,
no floating tab.

### Block detail — muted footnote (replaces yellow callout and quiet pill)

The v5 yellow callout (`data-testid="mapping-hypothesis"` with `border-l-2 border-amber-400`) AND
the v6-draft quiet pill (`data-testid="detail-unverified-pill"`) are both removed. The block-detail
panel ends with a single muted footnote paragraph:

```
<p class="mt-3 text-[11px] text-slate-400 dark:text-slate-500"
   data-testid="detail-footnote">
  {{ t('presetBrowser.footnote_unverified') }}
</p>
```

No border, no icon, no colour treatment; reads as a single line of small muted text at the bottom
of the card. The rest of the block-detail content (FX title, category label, on/off state,
parameters grid, browse toggle, close button) stays unchanged from feature 14 / v5.

### Mini-chassis strip (replaces v5 glyph + 3-letter code as the visual)

Each strip block is a 1/4-scale rendering of the same chassis used in the board block:
stompbox / amp / cabinet / eq. RVB uses the stompbox template per v5. The block fills its share
of the strip horizontally (`flex-1 min-w-0`). Each block has `h-8` and the inset bottom shadow
class (R10). Unknown blocks render an empty `<span>` — the cell stays its size but shows
nothing (R9). The exact SVG primitives come from `chain-strip-variant-a` in the playground.
The v5 pedal-glyph + 3-letter code overlay stays on top of the mini-chassis so the v5 R8 and
category-code regression tests still pass.

### Board chassis — product photo realism

The four "special" categories (AMP, CAB, EQ, RVB) get the v6 chassis drawings (R11). The
stompbox template (NR, PRE, DST, N→S, MOD, DLY) stays the v5 implementation (R12 still pins
the knob count). The exact SVG primitives come from `chassis-variant-a` in the playground.
`data-chassis-tolex`, `data-chassis-faceplate`, `data-chassis-screw`, `data-chassis-grille`,
`data-chassis-cone`, `data-chassis-dustcap`, `data-chassis-handle`, `data-chassis-vent`,
`data-chassis-slider` are the pin attributes for the new chassis primitives; F14 R15-R19 / R22 /
R38-R40 regression tests still pass.

### Mock data ghost link (replaces v5 indigo filled button)

Sits in the page header, right-aligned, between the dark-mode toggle and the right edge.
Renders as a transparent `<button>` with a download-arrow SVG and the translated
`presetBrowser.load_test_presets` text label. Same `data-testid="load-mock-presets"` as v5 (so
the existing test infra keeps working).

## Copy

| key | en | es |
|---|---|---|
| `presetBrowser.browse_presets` | Browse presets | Explorar presets |
| `presetBrowser.browse_presets_aria` | Browse presets | Explorar presets |
| `presetBrowser.presets_selected_count` | Comparing {{count}} preset(s) | Comparando {{count}} preset(s) |
| `presetBrowser.footnote_unverified` | Page numbers reflect an assumption from observed firmware behavior, not a vendor mapping. | Los números de página reflejan una suposición basada en el comportamiento observado del firmware, no un mapeo del fabricante. |
| `presetBrowser.export_label` | Export | Exportar |
| `presetBrowser.mark_for_export` | Mark {{name}} for export | Marcar {{name}} para exportar |
| `presetBrowser.load_test_presets` | Load test presets | Cargar presets de prueba |

The accessible name contains the visible label word (Export/exportar, Browse/Explorar), per WCAG
label-in-name.

## Verification notes

- Automated: every R has a unit/component test (see tasks.md). Class and attribute assertions
  stand in for visuals, the same approach feature 14 used.
- Manual (T26 redo, hard gate with Ricardo): 375px and ≥1024px, light and dark:
  - Chip row reachable from any state; chips show every selected preset with slot + name + ×.
  - "Browse presets" pill always visible; clicking opens the picker.
  - Picker lists every loaded preset; activating a row adds the chip and closes the picker.
  - Activating a chip populates the main area; main area renders the chain board + cable.
  - Clicking a chip "×" removes the chip and updates the main area if the removed preset was active.
  - Stacked chassis silhouettes legible, cable serpentine reads as one continuous cable.
  - Block detail panel appears to the right of the chassis on `lg`+, stacks below on `sm`/`md`.
    The muted footnote is visible at the bottom of the card.
  - Mock data ghost link in the header populates the page with the test fixtures.
  - Export mark checkbox is independent of the chip selection (R38).
  - No horizontal overflow at 375px.

## Open questions

1. **Mock data content**: the implementer picks the names and chains. The only contract is:
   cover all 10 categories, exercise the AMP/CAB/EQ/RVB variants, include at least one
   empty-chain preset.
2. **Active-preset defaulting**: when the comparison set is non-empty but no chip has been
   activated, the main area falls back to the lowest-slot preset in the comparison set.
3. **Detail panel on narrow viewports**: stacks below the chassis. The implementer may choose to
   also collapse the detail panel into an accordion on narrow viewports — TBD if needed.
4. **Block-detail panel content** is unchanged from feature 14. F25+ may add real photos of the
   amp/cab the block represents.