# Requirements — gp5_preset_chain_pedal_style_icons (v6)

Scope: feature 14's T41 review (done with Ricardo during feature 16) found the flat color chips too
plain. v5 (drawer + multi-select comparison) was reviewed with Ricardo and rejected as visually
"horrible". v6 supersedes v1+v2+v3+v4+v5 after Ricardo picked winners from the
`/playground` sandbox: **product-photo-realism chassis**, **mini-chassis strip**,
**muted-footnote block detail**, **ghost-link chrome**, **selected-only chips** preset navigation.

This feature:

- redraws every chain block, in both the per-row **chain strip** and the **chain board**, with the
  v6 visual language chosen from the playground;
- keeps the **multi-select comparison set** (`PresetComparisonStore`) from v5 but reorients it onto
  a **chip-based navigation** at the top of the page (R18-R23) instead of the v5 sticky toolbar or
  inline-row expansion;
- renders the **block detail panel** next to the chain board in the main area (R24);
- removes the **drawer**, **compact list**, **sticky toolbar** and **no-selection fallback** entirely
  (v5 R36-R40 are deleted);
- replaces the v5 mock-data indigo button with a **ghost link with download icon** in the page
  header (R25);
- replaces the v5 **yellow callout** and the v6-draft **quiet pill** in the block-detail panel with
  a **single line of muted footnote text** at the bottom of the card (R29-R31).

Carried forward unchanged: feature 14 (`specs/gp5_preset_chain_visual_board/`) R15, R16, R17,
R18, R19, R22, R38, R39, R40, and every other feature 14 requirement not named below. The category
palette (`categoryStyle`, `NEUTRAL_BLOCK_STYLE`), the dimmed class `opacity-40`, the LED classes, the
lifted-selected ring, and the 5×2 grid layout are kept verbatim.

Out of scope (deferred to F25+): real photos of amp/cab/effect types (Fender Twin, Marshall
cabinet, Big Muff pedal, etc.); persisting export marks or comparison sets across reloads;
changing `gp5-module-vocabulary.ts`, the codec, or the palette colors; any MIDI traffic.

Terminology:
- *resolved* / *unresolved module*, *category index*, *dimmed class* — as defined in feature 14's
  requirements.md.
- *pedal glyph* — the `<svg>` element carrying a `data-glyph` attribute inside a block.
- *chassis silhouette* — the colored block body drawn inside a board block (kind ∈ `stompbox`,
  `amp`, `cabinet`, `eq`); distinct from the small pedal glyph that overlays it.
- *comparison set* — the set of preset slots currently in `PresetComparisonStore.selectedSlots()`.
- *selected-only chips* — the row of compact pills across the top of the page that shows every
  preset currently in the comparison set; only selected presets appear, never the full list.
- *picker* — the search-style overlay that opens when the user clicks "Browse presets", exposing
  every preset as a selectable row.
- *active preset* — the preset whose board card is rendered in the main area below the chips.

## Pedal glyph data (pure, `src/app/pedals/pedal-glyphs.ts`)

## R1
The system SHALL provide `PEDAL_GLYPHS`, an array of exactly 10 entries where entry `c` describes
category index `c` (same indexing as `GP5_MODULE_CATEGORIES`).

## R2
Every `PEDAL_GLYPHS` entry SHALL have a `path` string that differs from the `path` of every other
entry.

## R3
Every `PEDAL_GLYPHS` entry SHALL have a `path` equal to the literal given for its category index in
design.md's "Glyph table".

## R4
Every `PEDAL_GLYPHS` entry SHALL have `knobs`, `sliders`, and `kind` values equal to the
corresponding literals given for its category index in design.md's "Glyph table". `kind` is one of
`stompbox`, `amp`, `cabinet`, `eq`; `sliders` is non-zero only for `kind === 'eq'`.

## Pedal glyph rendering (`app-pedal-glyph`)

## R5
WHEN `app-pedal-glyph` is rendered with category index `c` (0-9), the system SHALL render exactly
one `<svg>` with `data-glyph="c<c>"` containing exactly one `<path>` whose `d` attribute equals
`PEDAL_GLYPHS[c].path`.

## R6
Every pedal glyph `<svg>` SHALL carry `aria-hidden="true"`.

## R7
Every pedal glyph `<svg>` SHALL carry `stroke="currentColor"` and `fill="none"`.

## Chain strip (every preset row)

## R8
WHEN rendering a strip block for a resolved module, the system SHALL render the corresponding
mini-chassis silhouette (per design.md "Mini-chassis strip") inside that block — a 1/4-scale
rendering of the same chassis used in the board (stompbox / amp / cabinet / eq). Each block fills
its share of the strip horizontally (`flex-1 min-w-0`).

## R9
IF a strip block is for an unresolved module THEN the system SHALL render no chassis SVG inside that
block — only an empty `<span>` (the strip cell stays its size but shows nothing).

## R10
Every strip block SHALL carry the classes `h-8` and
`shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]`.

## Chain board (the main area below the chip row)

## R11
WHEN rendering a board block for a resolved module, the system SHALL render the chassis silhouette
(per design.md "Chassis — product photo realism"): the stompbox kind renders the same pedal-glyph +
top-jacks + knob row + footswitch from v5 (carried forward); the amp kind renders a dark tolex body
+ brushed aluminum faceplate + gold piping + a horizontal mesh grille + four gold corner screws +
top carrying handle + LED; the cabinet kind renders a dark tolex body + baffle inset + big speaker
cone (with dust cap and highlight) + four gold corner screws + brand plate; the eq kind renders a
dark brushed faceplate with four vertical sliders (each with a track, a tick mark and a white
cap) + bypass LED; the rvb kind (which uses the stompbox template per v5) renders four black
2×2 knobs (each with a highlight, an indicator line and a center pip) + two top jacks.

## R12
WHEN rendering a board for a resolved module with category index `c`, the system SHALL render
exactly `PEDAL_GLYPHS[c].knobs` elements carrying `data-knob` AND `PEDAL_GLYPHS[c].sliders` elements
carrying `data-slider` inside that block.

## R13
WHEN rendering a board for a resolved module, the system SHALL render exactly one footswitch inside
that block.

## R14
IF a board block is for an unresolved module THEN the system SHALL render zero elements matching
`[data-glyph], [data-knob], [data-footswitch]` inside that block.

## R15
The chain board's cable element SHALL carry the class `z-0`. The cable SHALL be drawn as a
serpentine path that crosses behind the top row of blocks left-to-right, wraps around the right
edge of the grid, and crosses behind the bottom row left-to-right, so the signal enters at the left
of the top row and exits at the right of the bottom row.

## R16
The chain board's block grid container SHALL carry the classes `relative` and `z-10`. The grid
SHALL use `grid-cols-5` at every breakpoint — there is no `sm:` (or larger) variant that changes
the column count; blocks are always arranged in two rows of five.

## R17
Every board block `<button>` SHALL be the only element child of a grid cell element that carries
the classes `rounded-lg`, `bg-slate-50` and `dark:bg-slate-900`.

## Comparison multi-select (chip-set selection)

## R18
The system SHALL provide a root-provided `PresetComparisonStore` whose `selectedSlots` signal is
an empty set when the store is first created. The store SHALL expose `toggle(slot)`, `add(slot)`,
`remove(slot)`, and `clear()` methods; every mutation SHALL replace `selectedSlots()` with a new
`Set` instance (never mutate in place) so consumers notify correctly.

## R19
WHEN the user activates a tile for a preset whose slot is not in the comparison set (from inside
the picker, R20-R22), the system SHALL call `PresetComparisonStore.add(slot)` with that slot.

## R20
WHEN the user removes a chip from the selected-presets chip row (R22), the system SHALL call
`PresetComparisonStore.remove(slot)` with that chip's slot.

## R21
WHEN the user clicks a chip in the selected-presets chip row (R22), the system SHALL set
`activePreset` to that chip's preset so the main area renders that preset's chain board.

## R22
The system SHALL render the **selected-only chips row** along the top of the page. Every preset
whose slot is in `comparison.selectedSlots()` SHALL appear as exactly one chip
(`data-testid="preset-chip-<slot>"`) showing the slot number, the preset name, and a small "×"
control. A single "Browse presets" pill (`data-testid="browse-presets"`) SHALL sit at the end of
the row, after the last chip. WHEN the user clicks the "×" inside a chip, the system SHALL call
`PresetComparisonStore.remove(slot)` (R20). WHEN the user clicks anywhere else on a chip, the
system SHALL set `activePreset` to that chip's preset (R21).

## R23
WHEN the comparison set is empty, the page SHALL render a single "Browse presets" pill
(`data-testid="browse-presets"`) along the top of the main area and SHALL NOT render any chip
elements.

## Active preset and main area

## R24
The system SHALL track the active preset in a single `activePreset` signal (preset, default
`null`). WHEN `activePreset` is non-null, the main area SHALL render that preset's chain board.
WHEN `activePreset` is null and the comparison set is non-empty, the active preset SHALL default
to the lowest slot in the comparison set. WHEN `activePreset` is null and the comparison set is
empty, the main area SHALL render the picker trigger (R28). WHEN the user clicks a block in the
active preset's chain board, the system SHALL render the block detail panel next to the chassis
(on viewports wide enough to accommodate both; on narrow viewports the detail stacks below the
chassis).

## Picker (search-style preset selector)

## R25
WHEN the user clicks the "Browse presets" pill (`data-testid="browse-presets"`), the system SHALL
open the picker overlay. The picker SHALL list every loaded preset as a row
(`data-testid="picker-row-<slot>"`) showing the slot number and preset name. Pressing Escape, or
clicking outside the picker, SHALL close it.

## R26
WHEN the user activates a row in the picker, the system SHALL call
`PresetComparisonStore.add(slot)` (R19) and SHALL close the picker. The activated preset SHALL
become `activePreset` so the main area renders its chain board.

## R27
WHEN the comparison set contains a slot whose preset is no longer loaded, the chip for that slot
SHALL still render with its slot number and the chip name placeholder ("—") so the user can still
remove it.

## Mock data ghost link

## R28
The page SHALL render a "Load test presets" ghost link (`presetBrowser.load_test_presets`,
translated) in the page header, with a download-arrow icon next to the text. The link uses a
ghost-text treatment (no fill, only the icon + a muted label). Activating it SHALL populate the
page with mock preset data covering all 10 categories (at least one preset with a non-empty chain
and one with an empty chain, plus presets exercising AMP/CAB/EQ/RVB and the 1/3/5 knob counts).
The mock data SHALL flow through the same store path as the real pedal's data so all derived
signals react identically.

## Page layout (chip row + main area)

## R29
The page SHALL render, top to bottom, the chip row (R22 / R23) and the main area (R24). WHEN the
comparison set is non-empty, the chip row SHALL appear above the main area. WHEN the comparison
set is empty, the chip row is replaced by a single "Browse presets" pill above the main area.
The page SHALL NOT render the v5 drawer, the v5 sticky toolbar, the v5 compact list, the v5
floating tab, the v5 no-selection fallback, or the v5 indigo "Load test presets" filled button.

## Block detail — muted footnote (replaces yellow callout and quiet pill)

## R30
The block-detail panel SHALL render exactly one muted footnote paragraph at the bottom of the
card. The footnote SHALL be `data-testid="detail-footnote"`, SHALL contain the translated
`presetBrowser.footnote_unverified` text, SHALL be one line of small muted text (`text-[11px]
text-slate-400 dark:text-slate-500`), and SHALL have no border, no icon, and no colour treatment.

## R31
The system SHALL NOT render the v5 yellow callout (`data-testid="mapping-hypothesis"`) or the
v6-draft quiet pill (`data-testid="detail-unverified-pill"`) inside the block-detail panel.

## Block detail content (carried forward)

The block-detail panel's FX title, category label, on/off state, parameters grid, browse toggle,
and close button remain unchanged from feature 14 / v5.

## Export marks (foundation, `src/app/pedals/preset-export-selection.service.ts`)

## R32
The system SHALL provide a root-provided `PresetExportSelection` store whose `markedSlots` signal
is an empty set when the store is first created.

## R33
WHEN `PresetExportSelection.toggle(slot)` is called with a slot not in `markedSlots()`, the system
SHALL return a `markedSlots()` set that contains that slot and every previously marked slot.

## R34
WHEN `PresetExportSelection.toggle(slot)` is called with a slot in `markedSlots()`, the system
SHALL return a `markedSlots()` set that no longer contains that slot and still contains every other
previously marked slot.

## R35
WHEN `PresetExportSelection.clear()` is called, the system SHALL set `markedSlots()` to an empty
set.

## R36
WHEN rendering the active preset's row in the main area, the system SHALL render exactly one
`<input type="checkbox">` with `data-testid="export-mark-<slot>"` whose `checked` state equals
`markedSlots().has(<slot>)`.

## R37
WHEN the user toggles the active preset's export checkbox, the system SHALL call
`PresetExportSelection.toggle` with that slot.

## R38
IF the user toggles an export checkbox THEN the system SHALL NOT call any method on
`PresetComparisonStore` and SHALL NOT change the comparison set or the active preset.

## R39
Every export checkbox SHALL have an `aria-label` equal to the translation of
`presetBrowser.mark_for_export` with `name` set to that row's preset name.

## Read-only guarantee (extends feature 14 R36/R37)

## R40
IF the user adds or removes a chip, opens or activates a picker row, toggles an export checkbox,
or clicks a board block THEN the system SHALL NOT send any MIDI message (no `writePreset` call,
no additional `MIDIOutput.send` call, and no additional `readPresets` call beyond those made by
`preset_browser_ui` R5).

## i18n and documentation

## R41
`public/i18n/en.json` and `public/i18n/es.json` SHALL each contain a non-empty string at every
`presetBrowser.*` key listed in design.md's "Copy" table.

## R42
`docs/architecture.md` §2b SHALL contain a "Pedal icons" paragraph that names the icon source and
its license (the literal word `in-house` for the recommended option, or the set name plus its SPDX
id `CC0-1.0`, `MIT` or `Apache-2.0` if the human picks a third-party set).