# Requirements — gp5_preset_chain_visual_board

Scope: replace the preset browser's raw `cat{N}_fx{M}` chain text (`preset_browser_ui` R9) with a graphical,
strictly read-only view of each preset's signal chain:

- a compact, category-colored **chain strip** on every preset row;
- a larger, clickable **chain board** for the currently selected preset (`SelectedPresetStore.selectedPreset`);
- a **block detail** panel (category, FX title, on/off, labelled parameter values);
- an **FX browser** listing every FX of the block's category with its manual description and parameter names.

Everything is built on top of feature 10's `describeModuleType`/`parseModuleType`/`GP5_MODULE_CATEGORIES`/
`GP5_MODULE_FX_TITLES` (`src/app/midi/gp5-module-vocabulary.ts`) — no second copy of the category/FX-title
vocabulary is introduced. Parameter names are transcribed from external_docs/gp-5-manual.pdf pp.20-36
("Effect List", "Parameter Description" column); p.37 ("Factory SnapTone Files") is a list of downloadable
tone files, not FX parameters, and is out of scope.

Out of scope: editing any parameter or on/off state; writing anything to the pedal (feature
`import_preset_to_pedal`); re-reading presets; changing `Gp5SysexPresetCodec`, `PresetSlot`/`Preset`, or
`gp5-module-vocabulary.ts`; performing the real-hardware check of the p0..p7 mapping (R12 only requires
*documenting* that it is a hypothesis — see design.md "Hardware verification" and tasks.md's final task).

Supersedes: `preset_browser_ui` R9 (comma-separated `moduleType` summary) is replaced by R15-R21 below;
`preset_browser_ui` R10 (empty-chain placeholder) is narrowed to R21 below. Every other `preset_browser_ui`
requirement (R1-R8, R11-R15) stays in force unchanged.

Terminology used below:
- *resolved module* — a chain entry whose `moduleType` makes `describeModuleType` (feature 10) return
  `kind: 'resolved'`; *unresolved module* — one for which it returns `kind: 'raw'` (includes the codec's
  `'empty'` sentinel).
- *category index* — `GP5_MODULE_CATEGORIES.indexOf(category)` for a resolved module (0-9).
- *FX index* — the `fxlow` value `parseModuleType` returns for a resolved module.
- *dimmed class* — the Tailwind class `opacity-40`.

## Parameter catalog (pure data, `src/app/midi/gp5-fx-catalog.ts`)

## R1
The system SHALL provide `GP5_FX_CATALOG`, an array of exactly 10 arrays (indices `0`-`9`, same indexing as
`GP5_MODULE_CATEGORIES`), where for every category index `c` the length of `GP5_FX_CATALOG[c]` equals the
length of `GP5_MODULE_FX_TITLES[c]`.

## R2
Every `GP5_FX_CATALOG` entry SHALL carry a `parameterNames` array equal to the ordered parameter-name list
given for that category index and FX index in design.md's "Parameter-name table" (transcribed from
external_docs/gp-5-manual.pdf pp.20-36, combined labels such as `Bass/Middle/Treble` expanded into one name
per control).

## R3
Every `GP5_FX_CATALOG` entry SHALL carry a `manualPage` number equal to the page given for that FX in
design.md's "Parameter-name table".

## R4
Every `GP5_FX_CATALOG` entry SHALL carry a `descriptionKey` string of the exact form `gp5Fx.c<c>.f<i>`,
where `<c>` is its category index and `<i>` is its FX index.

## R5
For every `descriptionKey` in `GP5_FX_CATALOG`, both `public/i18n/en.json` and `public/i18n/es.json` SHALL
contain a non-empty string at that key path.

## R6
WHEN `describeParameters(moduleType, parameters)` is called with a `moduleType` that is a resolved module,
the system SHALL return exactly one entry per name in that FX's `parameterNames`, in order, where entry `k`
has `label` equal to `parameterNames[k]` and `value` equal to `parameters['p' + k]`.

## R7
IF `describeParameters(moduleType, parameters)` is called with a resolved module's `moduleType` and
`parameters` has no `p<k>` key for some named index `k` THEN the system SHALL return that entry with
`value` `null`, without throwing.

## R8
IF `describeParameters(moduleType, parameters)` is called with an unresolved module's `moduleType` THEN the
system SHALL return exactly one entry per key of `parameters`, ordered by the key's numeric suffix
ascending, with `label` equal to the key itself (e.g. `p0`), without throwing.

## R9
WHEN `formatParameterValue(value)` is called with a finite number, the system SHALL return that number
rounded to at most 2 decimal places, as a string without trailing zeros (e.g. `3` → `"3"`, `0.5` →
`"0.5"`, `1.23456` → `"1.23"`).

## R10
IF `formatParameterValue(value)` is called with `null`, `NaN`, or an infinite number THEN the system SHALL
return the string `"—"`.

## R11
The system SHALL provide `GP5_FX_PARAMETER_MAPPING_STATUS`, an exported string constant in
`gp5-fx-catalog.ts` stating that the `p0..p7` → parameter-name mapping and the value scale are a
HYPOTHESIS derived from external_docs/gp-5-manual.pdf pp.20-36 and not yet confirmed against real GP-5
hardware.

## R12
The `GP5_FX_PARAMETER_MAPPING_STATUS` value SHALL contain both the substring `HYPOTHESIS` and the substring
`gp-5-manual.pdf`.

## Category styling (pure, `src/app/pedals/chain-block-view.ts`)

## R13
The system SHALL provide `categoryStyle(categoryIndex)` returning, for each category index `0`-`9`, a class
string whose background-color class (`bg-*`, not `dark:bg-*`) differs from that of every other category
index and from `NEUTRAL_BLOCK_STYLE`.

## R14
Every class string returned by `categoryStyle` for category indices `0`-`9`, and `NEUTRAL_BLOCK_STYLE`, SHALL
contain at least one class prefixed with `dark:`.

## Chain strip (every preset row)

## R15
WHEN rendering a preset row whose `chain` is non-empty, the system SHALL render exactly one strip block per
element of that preset's `chain`, in the same order as `chain`.

## R16
WHEN rendering a strip block or board block for a resolved module, the system SHALL display that module's
category code and apply `categoryStyle(<its category index>)` to the block.

## R17
WHILE a chain entry's `enabled` is `false`, the system SHALL render that entry's strip block and board block
with the dimmed class.

## R18
WHILE a chain entry's `enabled` is `true`, the system SHALL render that entry's strip block and board block
without the dimmed class.

## R19
IF a chain entry is an unresolved module THEN the system SHALL render its strip block and board block at
that entry's position with `NEUTRAL_BLOCK_STYLE` and the translated unknown-module label, keeping the
number of rendered blocks equal to `chain.length`.

## R20
The system SHALL NOT render any text matching `/cat[0-9a-f]+_fx[0-9a-f]+/i` anywhere in the preset browser
page's rendered output. (The codec's `'empty'` sentinel is covered by R19's unknown-module label; the word
"Empty" can still legitimately appear as the manual's own FX title for N->S, `GP5_MODULE_FX_TITLES[3][0]`.)

## R21
WHERE a preset's `chain` is an empty array, the system SHALL render that row's translated empty-chain
placeholder instead of a strip.

## Chain board (selected preset)

## R22
WHILE the preset list is loaded and `SelectedPresetStore.selectedPreset()` is non-null, the system SHALL
render a chain board containing exactly one `<button>` block per element of the selected preset's `chain`,
in chain order.

## R23
WHILE `SelectedPresetStore.selectedPreset()` is `null`, the system SHALL NOT render the chain board.

## R24
WHEN the user activates a board block, the system SHALL render the block detail panel for that block's
chain entry.

## R25
WHEN the user activates a preset row's select control, the system SHALL close any open block detail panel.

## Block detail

## R26
WHILE the block detail panel is open for a resolved module, the system SHALL display the translated name of
that module's category.

## R27
WHILE the block detail panel is open for a resolved module, the system SHALL display the `fxTitle` that
`describeModuleType` returns for it.

## R28
WHILE the block detail panel is open, the system SHALL display the translated on-state label when the
entry's `enabled` is `true` and the translated off-state label when it is `false`.

## R29
WHILE the block detail panel is open, the system SHALL display one parameter row per entry returned by
`describeParameters(entry.moduleType, entry.parameters)`, in that order, each showing the entry's `label`
and `formatParameterValue(value)`.

## R30
WHILE the block detail panel is open, the system SHALL display the translated parameter-mapping hypothesis
notice.

## R31
IF the block detail panel is open for an unresolved module THEN the system SHALL display the translated
unknown-module message in place of the category name and FX title.

## R32
IF the block detail panel is open for an unresolved module THEN the system SHALL NOT render the FX browser
control.

## FX browser

## R33
WHEN the user activates the FX browser control in a block detail panel for a resolved module in category
index `c`, the system SHALL render exactly one browser entry per element of `GP5_MODULE_FX_TITLES[c]`, in
index order.

## R34
WHEN rendering FX browser entry `i` of category index `c`, the system SHALL display
`GP5_MODULE_FX_TITLES[c][i]`, the translation of `GP5_FX_CATALOG[c][i].descriptionKey`, and every name in
`GP5_FX_CATALOG[c][i].parameterNames`.

## R35
WHEN rendering the FX browser, the system SHALL mark exactly the entry whose index equals the block's FX
index with `aria-current="true"` and the translated active-FX badge, and no other entry.

## Read-only guarantee

## R36
The system SHALL NOT call `writePreset` on the pedal connection from the preset browser page or any
component it renders.

## R37
IF the user activates any board block, detail-panel control, or FX-browser control THEN the system SHALL
NOT send any MIDI message (no additional `MIDIOutput.send` call and no additional `readPresets` call beyond
those made by `preset_browser_ui` R5).

## Layout, theme, i18n

## R38
The chain board's block container SHALL carry the classes `grid-cols-5` and `sm:grid-cols-10`.

## R39
Every strip block SHALL carry the classes `flex-1` and `min-w-0`, inside a strip container that carries
`flex` and `w-full`.

## R40
`public/i18n/en.json` and `public/i18n/es.json` SHALL contain the identical set of key paths under the
`chainBoard` and `gp5Fx` namespaces, each with a non-empty string value.
