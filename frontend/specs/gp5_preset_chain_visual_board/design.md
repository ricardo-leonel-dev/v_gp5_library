# Design — gp5_preset_chain_visual_board

Conventions (layers, standalone components, signals, Transloco, colocated Vitest specs, no component
library) are exactly those of `docs/architecture.md` and `docs/conventions.md`; this document only records
choices made within them.

Design skill: `docs/architecture.md` §2b asks to use the "frontend-design" skill. It ships as a Claude Code
plugin (`frontend-design:frontend-design`), not under `~/.claude/skills`, and implementer/reviewer
subagents cannot load skills. It was therefore applied by the orchestrating session after spec approval,
and its output is the **"Visual direction"** section below. Implementers follow that section as written;
they do not need the skill. At close, copy the category palette and block patterns into
`docs/architecture.md` §2b as that section requests.

## Grounding

- **Chain order.** `Gp5SysexPresetCodec.decodeBody()` already applies the body's `REC_ORDER` record
  (`chain = chainOrder.map(blockIdx => blocks[blockIdx])`), so `Preset.chain` is *already* in real chain
  order. This feature renders `chain` in array order and never re-sorts it (R15, R22).
- **Enabled/bypassed.** `PresetSlot.enabled` comes from the `REC_BYPASS` mask (codec). Used as-is.
- **Parameters.** The codec reads 80 little-endian float32s and assigns 8 per block as `p0`..`p7`
  (`PARAMS_PER_BLOCK = 8`), keyed by *block index*, then permutes blocks into chain order — so each chain
  entry carries its own block's `p0`..`p7`. What each `p<k>` means is **not** known from the protocol.
- **Vocabulary.** Category and FX title come only from feature 10's `describeModuleType` /
  `parseModuleType` / `GP5_MODULE_CATEGORIES` / `GP5_MODULE_FX_TITLES`. The new catalog is index-aligned to
  `GP5_MODULE_FX_TITLES` (R1) and deliberately carries no title strings of its own.
- **Manual.** external_docs/gp-5-manual.pdf pp.20-36, "Parameter Description" column, one row per FX, in the
  same top-to-bottom order feature 10 used for titles. p.37 lists Factory SnapTone *files* (e.g. "14 DST",
  "Foxy 30") — tone files loadable into N→S, not FX parameters — so it is not used.

## HYPOTHESIS: p0..p7 → parameter name, and value scale

Stated in `GP5_FX_PARAMETER_MAPPING_STATUS` (R11/R12), in the file header, and as a visible notice in the
detail panel (R30):

1. **Index order.** `p<k>` is assumed to be the `k`-th control listed in that FX's "Parameter Description"
   cell, reading top to bottom, with combined labels expanded left to right (`Bass/Middle/Treble` → `Bass`,
   `Middle`, `Treble`; `Gain 1/2` → `Gain 1`, `Gain 2`; `High/Low` → `High`, `Low`; `H/L-VOL` → `H-VOL`,
   `L-VOL`). Nothing in the manual states this correspondence; it is the simplest guess.
2. **Scale.** Values are shown exactly as decoded (float32, rounded for display by R9) — no unit, no
   0-100 rescale, no dB/ms conversion, no enum names for switch-like controls (`+3dB`, `Bright`, `Mode`,
   `Char`, `MidFreq`, `Trail`).
3. **Trail.** Every DLY/RVB FX lists `Trail` last. It may be a global setting stored elsewhere rather than
   a per-block `p<k>`. Listed per the manual for now.
4. **Unmapped slots.** For a resolved FX with `n < 8` names, slots `p<n>`..`p7` are not shown (R6). This
   hides data if hypothesis 1 is wrong; see "Open questions".

Nothing in this feature can confirm the hypothesis. It needs Ricardo to read a patch with known knob
positions from the real GP-5 and compare (tasks.md final task, left unchecked by design — same pattern as
feature 10's T17).

## Parameter-name table (R2, R3)

Source: external_docs/gp-5-manual.pdf. `c` = category index, `i` = FX index (= `GP5_MODULE_FX_TITLES[c]`
index). The implementer must check each row against the PDF while transcribing.

| c | cat | i | FX title (from feature 10) | p. | parameterNames |
|---|---|---|---|---|---|
| 0 | NR | 0 | Gate | 20 | THRE |
| 1 | PRE | 0 | COMP | 20 | Sustain, VOL |
| 1 | PRE | 1 | COMP4 | 20 | Sustain, Attack, Volume, Clipping |
| 1 | PRE | 2 | Boost | 20 | Gain, +3dB, Bright |
| 1 | PRE | 3 | Micro Boost | 20 | Gain |
| 1 | PRE | 4 | B-Boost | 21 | Gain, VOL, Bass, Treble |
| 1 | PRE | 5 | Toucher | 21 | Sense, Range, Q, Mix, Mode |
| 1 | PRE | 6 | Crier | 21 | Depth, Rate, Volume, Low, Q, High |
| 1 | PRE | 7 | OCTA | 21 | Low, High, Dry |
| 1 | PRE | 8 | Pitch | 21 | High, Low, Dry, H-VOL, L-VOL |
| 1 | PRE | 9 | Detune | 21 | Detune, Dry, Wet |
| 2 | DST | 0 | Green OD | 22 | Gain, Tone, VOL |
| 2 | DST | 1 | Yellow OD | 22 | Gain, Tone, VOL |
| 2 | DST | 2 | Super OD | 22 | Gain, Tone, VOL |
| 2 | DST | 3 | SM Dist | 22 | Gain, Tone, VOL |
| 2 | DST | 4 | Plustortion | 22 | Gain, VOL |
| 2 | DST | 5 | La Charger | 23 | Gain, Tone, VOL |
| 2 | DST | 6 | Darktale | 23 | Gain, Filter, VOL |
| 2 | DST | 7 | Sora Fuzz | 23 | Fuzz, VOL |
| 2 | DST | 8 | Red Haze | 23 | Fuzz, VOL |
| 2 | DST | 9 | Bass OD | 23 | Gain, Blend, VOL, Bass, Treble |
| 3 | N->S | 0 | Empty | 23 | Gain, VOL, Bass, Middle, Treble |
| 4 | AMP | 0 | Tweedy | 24 | Gain, Tone, VOL |
| 4 | AMP | 1 | Bellman 59N | 24 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 2 | Dark Twin | 24 | Gain, VOL, Bass, Middle, Treble, Bright |
| 4 | AMP | 3 | Foxy 30N | 24 | Gain, Tone cut, VOL, Bright |
| 4 | AMP | 4 | J-120 CL | 24 | VOL, Bass, Middle, Treble, Bright |
| 4 | AMP | 5 | Match CL | 25 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 6 | L-Star CL | 25 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 7 | UK 45 | 25 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 8 | UK 50JP | 25 | Gain 1, Gain 2, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 9 | UK 800 | 25 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 10 | Bellman 59B | 26 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 11 | Foxy 30TB | 26 | Gain, Tone cut, VOL, Bass, Treble, Char |
| 4 | AMP | 12 | SUPDual OD | 26 | Gain 1, Gain 2, Tone 1, Tone 2, VOL |
| 4 | AMP | 13 | Solo100 OD | 26 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 14 | Z38 OD | 26 | Gain, Tone cut, VOL, Bass, Middle, Treble |
| 4 | AMP | 15 | Bad-KT OD | 27 | Gain, PRES, VOL, Bass, Treble, Edge |
| 4 | AMP | 16 | Juice R100 | 27 | Gain, VOL, Bass, Middle, Treble |
| 4 | AMP | 17 | Dizz VH | 27 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 18 | Dizz VH+ | 27 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 19 | Eagle 120 | 27 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 20 | EV 51 | 28 | Gain, VOL, Bass, Middle, Treble, PRES |
| 4 | AMP | 21 | Solo100 LD | 28 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 22 | Mess DualV | 28 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 23 | Mess DualM | 28 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 24 | Power LD | 28 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 25 | Flagman+ | 28 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 26 | Bog RedV | 29 | Gain, PRES, VOL, Bass, Middle, Treble |
| 4 | AMP | 27 | Classic Bass | 29 | Gain, Bass, Middle, Treble, MidFreq, VOL |
| 4 | AMP | 28 | Foxy Bass | 29 | VOL, Bass, Treble |
| 4 | AMP | 29 | Mess Bass | 29 | Gain, VOL, Bass, Middle, Treble |
| 4 | AMP | 30 | AC Pre1 | 29 | VOL, Tone, Balance, EQ Freq, EQ Q, EQ Gain |
| 4 | AMP | 31 | AC Pre2 | 30 | VOL, Tone, Balance, EQ Freq, EQ Q, EQ Gain |
| 5 | CAB | 0-18 | TWD CP 1x8 … Bellman 2x12 | 30 | VOL |
| 5 | CAB | 19 | AMPG 4x10 | 31 | VOL |
| 5 | CAB | 20 | User IR 1-20 | 31 | VOL |
| 6 | EQ | 0 | Guitar EQ 1 | 31 | 125Hz, 400Hz, 800Hz, 1.6kHz, 4kHz, VOL |
| 6 | EQ | 1 | Guitar EQ 2 | 31 | 100Hz, 500Hz, 1kHz, 3kHz, 6kHz, VOL |
| 6 | EQ | 2 | Bass EQ 1 | 31 | 33Hz, 150Hz, 600Hz, 2kHz, 8kHz, VOL |
| 6 | EQ | 3 | Bass EQ 2 | 31 | 50Hz, 120Hz, 400Hz, 800Hz, 4.5kHz, VOL |
| 6 | EQ | 4 | Mess EQ | 31 | 80Hz, 240Hz, 750Hz, 2.2kHz, 6.6kHz |
| 7 | MOD | 0 | A-Chorus | 32 | Depth, Rate, Tone |
| 7 | MOD | 1 | B-Chorus | 32 | Depth, Rate, VOL |
| 7 | MOD | 2 | Jet | 32 | Depth, Rate, P.Delay, F.Back |
| 7 | MOD | 3 | N-Jet | 32 | Depth, Rate, P.Delay, F.Back |
| 7 | MOD | 4 | O-Phase | 32 | Rate |
| 7 | MOD | 5 | M-Vibe | 32 | Depth, Rate |
| 7 | MOD | 6 | V-Roto | 32 | Depth, Rate |
| 7 | MOD | 7 | Vibrato | 32 | Depth, Rate, VOL |
| 8 | DLY | 0 | Pure | 33 | Mix, Time, F.Back, Trail |
| 8 | DLY | 1 | Analog | 33 | Mix, Time, F.Back, Trail |
| 8 | DLY | 2 | Slapback | 33 | Mix, Time, F.Back, Trail |
| 8 | DLY | 3 | Sweet Echo | 33 | Mix, Time, F.Back, Trail |
| 8 | DLY | 4 | Tape | 34 | Mix, Time, F.Back, Trail |
| 8 | DLY | 5 | Tube | 34 | Mix, Time, F.Back, Trail |
| 8 | DLY | 6 | Rev Echo | 34 | Mix, Time, F.Back, Trail |
| 8 | DLY | 7 | Ring Echo | 34 | Mix, Time, F.Back, R-Mix, Freq, Tone, Trail |
| 8 | DLY | 8 | Sweep Echo | 34 | Mix, Time, F.Back, S-Depth, S-Rate, Trail |
| 8 | DLY | 9 | Ping Pong | 34 | Mix, Time, F.Back, Trail |
| 9 | RVB | 0 | Air | 35 | Mix, Decay, Damp, Trail |
| 9 | RVB | 1 | Room | 35 | Mix, Decay, Trail |
| 9 | RVB | 2 | Hall | 35 | Mix, Decay, Trail |
| 9 | RVB | 3 | Church | 35 | Mix, Decay, Trail |
| 9 | RVB | 4 | Plate L | 35 | Mix, Decay, Trail |
| 9 | RVB | 5 | Plate | 35 | Mix, Decay, Damp, Trail |
| 9 | RVB | 6 | Spring | 35 | Mix, Decay, Trail |
| 9 | RVB | 7 | N-Star | 35 | Mix, Decay, Trail |
| 9 | RVB | 8 | Deepsea | 36 | Mix, Decay, Trail |
| 9 | RVB | 9 | Sweet Space | 36 | Mix, Decay, Damp, Mod, Trail |

Transcription notes (keep as comments in `gp5-fx-catalog.ts`):
- Longest list is Ring Echo (7), so every list fits in `p0`..`p7`.
- EQ rows: the manual writes `Band 1: 125Hz` … and "use the five bands above". The label is the frequency
  alone (`125Hz`), which is what the pedal's knobs are known by.
- Detune (p.21): the manual writes `Dry/Wet: Controls the dry/wet signal level`. Read here as two controls
  (`Dry`, `Wet`), matching how `Bass/Treble` and `High/Low` expand. It could also be a single mix control;
  this is covered by the HYPOTHESIS.
- EV 51 (p.28) lists `PRES` last, unlike other amps. Transcribed as printed.
- MOD: the manual continues MOD onto p.33 with O-Trem, Sine Trem, Bias Trem. Feature 10 kept MOD at 8
  entries (see the `gp5-module-vocabulary.ts` header). R1 aligns the catalog to feature 10, so these three
  are **not** in the catalog or the FX browser. See "Open questions".

Parameter names are **not** translated. They are the pedal's own control labels, the same kind of device
identifier as the FX titles feature 10 stores as plain TS strings. They live in `gp5-fx-catalog.ts`, not in
`public/i18n`. FX *descriptions* are prose and go through i18n (R4, R5).

## Files to touch

New:
- `src/app/midi/gp5-fx-catalog.ts`: `GP5_FX_CATALOG`, `Gp5FxCatalogEntry`, `describeParameters`,
  `DescribedParameter`, `GP5_FX_PARAMETER_MAPPING_STATUS` (R1-R8, R11, R12). Pure data plus functions. It
  sits beside `gp5-module-vocabulary.ts` because it is the same kind of manual-derived pedal knowledge. It
  does no MIDI I/O.
- `src/app/midi/gp5-fx-catalog.spec.ts`: plain Vitest, no TestBed. It imports `public/i18n/*.json` for R5.
- `src/app/pedals/chain-block-view.ts`: `toChainBlockView`, `ChainBlockView`, `categoryStyle`,
  `NEUTRAL_BLOCK_STYLE`, `DIMMED_CLASS`, `formatParameterValue`, `displayCategoryCode` (R9, R10, R13, R14,
  plus the view model the components share).
- `src/app/pedals/chain-block-view.spec.ts`: plain Vitest.
- `src/app/pedals/chain-strip/chain-strip.ts` + `.html`: compact strip, `input.required<PresetSlot[]>()`,
  no outputs (R15-R19, R21, R39).
- `src/app/pedals/chain-board/chain-board.ts` + `.html`: button grid,
  `input.required<PresetSlot[]>()`, `input<number | null>()` selectedIndex, `output<number>()`
  blockSelected (R16-R19, R22, R38).
- `src/app/pedals/block-detail/block-detail.ts` + `.html`: detail panel plus FX browser,
  `input.required<PresetSlot>()`, local `browsing = signal(false)` that resets when the input changes
  (R26-R35).
- Colocated `*.spec.ts` for the three components (TestBed, `appConfig.providers`, inline translations the
  way `preset-browser-page.spec.ts` already does).
- `src/app/pedals/i18n-parity.spec.ts`: plain Vitest (R40). It only compares the two JSON files. If the
  implementer finds a better home, it just needs to stay colocated under `src/app`.

Modified:
- `src/app/pedals/preset-browser-page/preset-browser-page.ts` + `.html`:
  - replace the `chainSummary` text with `<app-chain-strip>`;
  - expose `selectedPreset` from `SelectedPresetStore`;
  - add `selectedBlockIndex = signal<number | null>(null)`;
  - render `<app-chain-board>` plus `<app-block-detail>` above the list while a preset is selected;
  - `selectPreset()` also resets `selectedBlockIndex` (R25);
  - remove `chainSummary()`.
- `src/app/pedals/preset-browser-page/preset-browser-page.spec.ts`:
  - replace the R9 test ("renders only enabled moduleTypes, comma-separated") with strip tests;
  - keep the R10 test only for `chain: []` (R21);
  - add the board/detail/read-only tests (R20, R22-R25, R36, R37).
- `public/i18n/en.json`, `public/i18n/es.json`: new `chainBoard` namespace and new `gp5Fx` namespace
  (R5, R40).

Not touched: `gp5-module-vocabulary.ts`, `gp5-sysex-preset-codec.ts`, `preset.ts`,
`web-midi-pedal-connection.ts`, `selected-preset.service.ts`, routes.

## Signatures

```ts
// src/app/midi/gp5-fx-catalog.ts
export interface Gp5FxCatalogEntry {
  readonly parameterNames: readonly string[]; // R2, max 8
  readonly manualPage: number;                // R3
  readonly descriptionKey: string;            // R4: `gp5Fx.c${c}.f${i}`
}
export const GP5_FX_CATALOG: readonly (readonly Gp5FxCatalogEntry[])[]; // R1

export interface DescribedParameter {
  readonly label: string;
  readonly value: number | null;
}
export function describeParameters(
  moduleType: string,
  parameters: Readonly<Record<string, number>>,
): DescribedParameter[]; // R6-R8

export const GP5_FX_PARAMETER_MAPPING_STATUS: string; // R11, R12
```

`describeParameters` uses `parseModuleType` and `describeModuleType` from feature 10. It is labelled only
when `describeModuleType(...).kind === 'resolved'` **and** `GP5_FX_CATALOG[cat]?.[fxlow]` exists; given R1
the second check always passes, but it is kept as a guard. Otherwise it takes the raw path (R8): keys
matching `/^p(\d+)$/` are sorted numerically, and any other keys are appended after them in insertion
order.

```ts
// src/app/pedals/chain-block-view.ts
export type ChainBlockView =
  | { kind: 'resolved'; position: number; categoryIndex: number; categoryCode: string;
      fxIndex: number; fxTitle: string; enabled: boolean; style: string }
  | { kind: 'unknown'; position: number; enabled: boolean; style: string };

export function toChainBlockView(slot: PresetSlot, position: number): ChainBlockView;
export function categoryStyle(categoryIndex: number): string; // R13, R14; unknown index -> NEUTRAL_BLOCK_STYLE
export const NEUTRAL_BLOCK_STYLE: string;
export const DIMMED_CLASS = 'opacity-40';                     // R17, R18
export function formatParameterValue(value: number | null): string; // R9, R10
export function displayCategoryCode(code: string): string;    // 'N->S' -> 'N→S', others unchanged
```

`formatParameterValue`: `value === null || !Number.isFinite(value)` gives `'—'`. Otherwise
`String(Math.round(value * 100) / 100)`, which has no trailing zeros by construction. Negative zero
normalizes to `"0"`.

Category palette: see "Visual direction" below. It is final; do not re-tune it.

The full class strings must appear literally in the TS source so Tailwind's content scan picks them up. Do
not build them by string interpolation.

## UI structure

- **Strip** (per row, R15-R21, R39):
  - `<div class="flex w-full gap-0.5">` containing one `<span>` per chain entry, each
    `flex-1 min-w-0 h-5 rounded-sm text-[10px] leading-5 text-center truncate` plus style plus
    `DIMMED_CLASS` when bypassed;
  - text is `displayCategoryCode(code)`, or the translated `chainBoard.unknown_short` (`?`) for unknown
    blocks;
  - each chip has a translated `aria-label` (`chainBoard.block_aria`, params `{ category, fx, state }`);
  - `data-testid="strip-block-<slot>-<position>"` and `data-enabled`.

  The preset row layout becomes `flex-col` below `sm` (name, strip, select button stacked) and `sm:flex-row`
  above. The strip is display-only; selection stays on the existing Select button (`preset_browser_ui` R15).
- **Board** (selected preset, R22-R24, R38):
  - a section above the list headed with the translated `chainBoard.title` and the preset name;
  - `<div class="grid grid-cols-5 sm:grid-cols-10 gap-2">`;
  - each block is a `<button type="button">` about 56px tall. It shows the category code on top and the FX
    title below (truncated), plus the translated `chainBoard.unknown` for unknown blocks;
  - `aria-pressed` is true for the selected block;
  - `data-testid="board-block-<position>"`, `data-enabled`.

  At 375px, 5 columns × 2 rows of about 60px each fits in the `px-4` content width (343px).
- **Detail** (below the board, inline, not a modal, R26-R32):
  - category code and translated `chainBoard.categories.c<idx>`;
  - FX title;
  - on/off pill (`chainBoard.state_on` / `chainBoard.state_off`);
  - `<dl>` of parameter rows (`data-testid="param-row-<k>"`);
  - the hypothesis notice (`chainBoard.mapping_hypothesis`);
  - a close button (`chainBoard.close`), which sets `selectedBlockIndex` to `null`;
  - the browse toggle (`chainBoard.browse`, with `{ category }`), hidden for unknown blocks.
- **FX browser** (inside the detail, R33-R35):
  - `<ul>` of `GP5_MODULE_FX_TITLES[c]`;
  - each `<li>` shows the title, `t(descriptionKey)`, the parameter names comma-joined, and the manual page
    (`chainBoard.manual_page`, `{ page }`);
  - the active entry gets `aria-current="true"`, a ring, and the `chainBoard.active` badge;
  - `data-testid="fx-entry-<i>"`.

  CAB has 21 entries and AMP has 32, so the list is `max-h-96 overflow-y-auto`.

The page reads `selectedPreset` from the existing `SelectedPresetStore` instead of adding its own
selection state. That keeps one source of truth, and `save_preset_dialog` will read it later anyway.

## Visual direction (frontend-design pass, added after approval)

This section is the output of the `frontend-design` skill. It sets visual choices only: it adds no
requirement, changes no R/T, and every class named here keeps R13, R14, R17, R18, R38 and R39 true. Where it
gives more detail than "UI structure" above, this section wins.

**Subject.** The screen is a guitarist's view of a multi-effects pedal. The reference is a physical
pedalboard: colored stompboxes in a row, connected by a cable, each with an LED showing whether it is on.
The board is the one memorable element of the screen. The rest of the page (header, list, detail text)
stays in the app's existing quiet slate + indigo look, so the color comes from the chain alone.

**Category palette.** Each color is taken from the archetypal pedal for that category (green overdrive,
amber tube glow, wood-brown cabinet, blue delay). Text colors are chosen for at least 4.5:1 contrast on
the block color. Use these strings verbatim in `categoryStyle` / `NEUTRAL_BLOCK_STYLE`:

| idx | code | class string |
|---|---|---|
| 0 | NR | `bg-cyan-700 text-white dark:bg-cyan-600` |
| 1 | PRE | `bg-yellow-400 text-yellow-950 dark:bg-yellow-300` |
| 2 | DST | `bg-green-700 text-white dark:bg-green-600` |
| 3 | N→S | `bg-rose-600 text-white dark:bg-rose-500` |
| 4 | AMP | `bg-amber-500 text-amber-950 dark:bg-amber-400` |
| 5 | CAB | `bg-stone-600 text-stone-50 dark:bg-stone-500` |
| 6 | EQ | `bg-zinc-300 text-zinc-900 dark:bg-zinc-400` |
| 7 | MOD | `bg-violet-600 text-white dark:bg-violet-500` |
| 8 | DLY | `bg-sky-500 text-sky-950 dark:bg-sky-400` |
| 9 | RVB | `bg-blue-800 text-white dark:bg-blue-700` |
| — | neutral | `bg-transparent border border-dashed border-slate-400 text-slate-500 dark:border-slate-500 dark:text-slate-400` |

The neutral block is an empty dashed outline rather than a grey fill. It reads as "a slot with something we
couldn't identify", and it can't be mistaken for EQ's silver.

**Type.** Keep the app's existing sans. Category codes (`AMP`, `DLY`) are the pedal's own labels, so they
are the only uppercase text: `font-bold tracking-tight`. All other labels and copy are sentence case.
Parameter values use `tabular-nums` so the digits line up in columns. Do not use a monospace face.

**Strip (each row).**
- Chips follow "UI structure" above, with `font-semibold` code text and `rounded-sm`, and no LED (too
  small). Bypassed chips get only `opacity-40`.
- The row of the currently selected preset gets `bg-slate-100 dark:bg-slate-800/60` and `rounded-md`, so the
  list shows which preset the board belongs to.

**Board (selected preset). This is the signature element.**
- Section header:
  - text `chainBoard.title` ("Signal chain" / "Cadena de señal") in `text-xs text-slate-500`;
  - the preset name below it as the section heading, `text-lg font-semibold`.
- Cable: the grid sits inside a `relative` wrapper. At `sm` and up, a 2px line runs behind the blocks at
  their vertical centre: `absolute inset-x-0 top-1/2 h-0.5 bg-slate-300 dark:bg-slate-600 hidden sm:block`,
  `aria-hidden="true"`. That shows the signal flowing left to right. At 375px (two rows of 5) there is no
  line; the reading order is enough.
- Each block `<button>`:
  - `relative h-16 rounded-lg px-1.5 py-2 text-left shadow-sm` plus the category style;
  - code on top (`text-sm font-bold tracking-tight`), then the FX title (`text-[11px] leading-tight
    line-clamp-2`).
- LED: a 6px dot at the block's top-right corner, `absolute right-1.5 top-1.5 size-1.5 rounded-full`,
  `aria-hidden="true"`:
  - enabled: `bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.7)]` (a lit pedal LED);
  - bypassed: `bg-black/30`, and the whole block is `opacity-40` (R17).
  The LED is decoration. The on/off state is still exposed in text through the `aria-label` (R28 wording).
- Hover: `hover:brightness-110`. No other hover motion.
- Keyboard focus: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900
  dark:focus-visible:outline-white`.
- Selected block (`aria-pressed="true"`): `-translate-y-1 ring-2 ring-slate-900 ring-offset-2
  ring-offset-slate-50 dark:ring-white dark:ring-offset-slate-900`, with `transition-transform
  motion-reduce:transition-none`. It lifts like a pressed-and-held footswitch. This is the only animation
  on the screen.
- Unknown block: neutral style, `?` as the code, `chainBoard.unknown` as the title, no LED.

**Scroll on select.** The list can hold 100 presets and the board sits above it. After `selectPreset()`, call
`scrollIntoView({ block: 'start', behavior })` on the board section, where `behavior` is `'smooth'` unless
`matchMedia('(prefers-reduced-motion: reduce)')` matches, in which case it is `'auto'`. Guard the call
(`el?.scrollIntoView?.(...)`), because jsdom does not implement it. This is UX only and makes no MIDI call,
so R37 is unaffected.

**Detail panel.**
- Container: `mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800`.
  It sits directly under the board with no modal and no animation.
- Header row:
  - a small copy of the block (`size-10 rounded-md` plus the category style, showing the code) as the
    visual link to the board;
  - next to it, the FX title (`text-base font-semibold`) with the translated category name under it
    (`text-sm text-slate-500`);
  - the close button at the far right: a text button `chainBoard.close`, `text-sm`.
- On/off: the LED dot plus text, e.g. "● Activo" / "● Bypass", `text-sm`. Not a coloured pill.
- Parameters:
  - a `<dl>` laid out as `grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3`;
  - each item puts the `<dt>` name (`text-xs text-slate-500`) over the `<dd>` value (`text-xl
    font-semibold tabular-nums`), like reading the pedal's display.
- Hypothesis notice: `mt-4 border-l-2 border-amber-400 pl-3 text-xs text-slate-600 dark:text-slate-400`. It is
  a plain sentence, not an alert box.
- Browse toggle: a text button with `aria-expanded`, `text-sm font-medium text-indigo-600
  dark:text-indigo-400`.

**FX browser.**
- `<ul class="mt-3 max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">`.
- Each `<li class="py-3">`:
  - the title (`text-sm font-medium`);
  - the description (`text-sm text-slate-600 dark:text-slate-300`, capped at `max-w-prose`);
  - then one `text-xs text-slate-500` line holding the parameter names comma-joined and the manual page.
- Active entry (`aria-current="true"`): `rounded-md bg-slate-100 px-2 dark:bg-slate-700/60`, plus the badge
  `chainBoard.active` as `text-xs font-medium text-slate-900 dark:text-slate-100` next to the title. No
  extra ring, since the board already carries the strong selection style.

**Copy (suggested values for the `chainBoard` keys).** Sentence case, plain verbs, no apologies:

| key | en | es |
|---|---|---|
| `title` | Signal chain | Cadena de señal |
| `close` | Close | Cerrar |
| `browse` | See all {{category}} effects | Ver todos los efectos de {{category}} |
| `active` | In this preset | En este preset |
| `state_on` | On | Activo |
| `state_off` | Bypassed | Bypass |
| `unknown` | Unrecognized | No reconocido |
| `unknown_short` | ? | ? |
| `unknown_module` | This module couldn't be identified. Its raw values are shown below. | No se pudo identificar este módulo. Abajo están sus valores sin procesar. |
| `mapping_hypothesis` | Parameter names come from the manual and haven't been checked on the pedal yet, so they may not match its knobs. | Los nombres de los parámetros vienen del manual y aún no se han comprobado en el pedal, así que podrían no coincidir con sus perillas. |
| `manual_page` | Manual p. {{page}} | Manual p. {{page}} |
| `parameters` | Parameters | Parámetros |
| `block_aria` | {{category}}: {{fx}}, {{state}} | {{category}}: {{fx}}, {{state}} |
| `no_parameters` | This block has no stored parameters. | Este bloque no tiene parámetros guardados. |

## i18n keys (both `en` and `es`, R40)

`chainBoard`:
- `title`, `close`, `browse`, `active`, `state_on`, `state_off`, `unknown`, `unknown_short`,
  `unknown_module`, `mapping_hypothesis`, `manual_page`, `parameters`, `block_aria`, `no_parameters`;
- `categories.c0`..`categories.c9`: Noise reduction / Reducción de ruido, Pre-effects / Pre-efectos,
  Distortion / Distorsión, SnapTone (N→S), Amplifier / Amplificador, Cabinet / Gabinete, Equalizer /
  Ecualizador, Modulation / Modulación, Delay, Reverb.

`gp5Fx.c<c>.f<i>.`: 108 FX descriptions.
- `en` is the manual's own description column text for that row (pp.20-36). The implementer may condense it
  to at most 2 sentences and fix obvious typos ("legenary", "Produciing", "feedbadk"). Trademark names stay
  as printed.
- `es` is a faithful Spanish translation of the `en` text.

`presetBrowser.empty_chain` is kept (R21). No existing key is removed.

## Read-only guarantee (R36, R37)

- `ChainStrip`, `ChainBoard`, and `BlockDetail` do not `inject()` anything from `src/app/midi/` except the
  pure `gp5-module-vocabulary`/`gp5-fx-catalog` imports. Only `PresetBrowserPage` holds
  `WebMidiPedalConnection`, and it keeps calling only `readPresets()` in `ngOnInit`, exactly as today.
- Test: stub the connection with `vi.spyOn` on `writePreset`/`readPresets`. Load presets, select a preset,
  click every board block, open and close the browser, then click close. Assert that `writePreset` was never
  called and `readPresets` was called exactly once. A second test stubs `navigator.requestMIDIAccess` with a
  fake output whose `send` is a spy, as `web-midi-pedal-connection.spec.ts` does, and asserts that the
  `send` call count is unchanged across the interactions.

## Error paths

- An unresolved module (`'empty'`, an out-of-table cat or fxlow, or garbage) takes the neutral block path in
  the strip and board (R19). The detail shows the unknown message and raw `p<k>` rows (R8, R29, R31) with no
  browser (R32). It never throws, because `describeModuleType`/`parseModuleType` never throw.
- A missing `p<k>` shows `—` (R7, R10). NaN or ±Infinity floats from garbage bytes also show `—` (R10).
- If a preset has no parameters at all, the detail shows the translated `chainBoard.no_parameters` instead
  of an empty `<dl>`.
- A `selectedPreset` left over from an earlier visit is still rendered; it is a plain `Preset` value, and
  nothing is re-read from the pedal.

## Hardware verification (out of automated scope)

The p0..p7 hypothesis can only be checked by Ricardo on his real GP-5:
1. Set a patch's knobs to distinctive values on the pedal (e.g. an AMP with Gain=10, Bass=90).
2. Read it through this screen.
3. Compare the labelled values.

No subagent can do or simulate this. tasks.md's last task stays unchecked until he does. When it is done,
`GP5_FX_PARAMETER_MAPPING_STATUS` and its test get updated in a follow-up change.

## Discarded alternatives

1. **Put parameter names inside `gp5-module-vocabulary.ts` / make `GP5_MODULE_FX_TITLES` entries
   objects.** Rejected: that file and its spec belong to feature 10, which is already `done` and approved,
   and its tests pin `GP5_MODULE_FX_TITLES` to `string[]`. An index-aligned side table (R1) adds data
   without changing feature 10's shape, and R1's length test catches drift.
2. **Translate parameter names through i18n.** Rejected: the names are the pedal's printed control labels
   (`VOL`, `PRES`, `F.Back`, `125Hz`). Translating them would make the screen disagree with the hardware,
   and it would double the translation surface (about 400 labels) for no user benefit. This follows the
   same reasoning under which feature 10 keeps FX titles as untranslated TS strings.
3. **Modal dialog for block detail.** Rejected: at 375px a modal covers the board, and the user loses the
   chain context while comparing blocks. It would also need focus-trap code the project doesn't have (no
   component library, per `docs/architecture.md`). An inline panel under the board is simpler and keeps
   the board visible.
4. **Make each strip chip clickable, so any row opens a detail directly.** Rejected: 100 rows × 10 chips
   gives 1000 tiny tap targets of about 30px at 375px, below comfortable touch size, and it conflicts with
   the existing Select button semantics. Clicking stays on the larger board for the selected preset, as
   the acceptance criteria describe.
5. **Show all p0..p7 for every block, labelling only the known ones.** Rejected for now: it adds noise
   (e.g. CAB would show 1 named and 7 raw rows) based on an unverified assumption that the unnamed slots
   are meaningful. Raised as an open question instead of being decided silently.

## Open questions for the human reviewer

1. **MOD tremolos (p.33).** O-Trem, Sine Trem, and Bias Trem are absent from feature 10's vocabulary, so
   they are absent here too. Should a follow-up extend feature 10 (MOD to 11 entries) once hardware shows
   what `fxlow` 8-10 map to?
2. **Unmapped p-slots.** Should the detail also show `p<n>`..`p7` raw under a "raw values" disclosure for
   resolved FX (alternative 5), as a debugging aid until the hypothesis is verified?
3. **Detune `Dry/Wet`**: two controls or one? Currently two (see transcription notes).
4. **Spanish descriptions.** There are 108 of them. Is a machine-quality translation acceptable, or do you
   want to review `es.json`'s `gp5Fx` block specifically?
5. **N→S title "Empty".** The manual (p.23) and feature 10 name the only N→S FX "Empty", meaning a SnapTone
   slot. The board will literally show "Empty" for it. Should it get a friendlier display label, which
   would be a feature 10 vocabulary change and so is out of scope here?
6. **Superseding `preset_browser_ui` R9.** This feature rewrites that already-approved requirement's test.
   Confirm that is intended; the feature description says raw codes must no longer be shown, which implies
   it.
