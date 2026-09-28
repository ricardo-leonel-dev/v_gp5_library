# Design — gp5_module_vocabulary_decoding

## Grounding: what the manual actually says

- **external_docs/gp-5-manual.pdf p.40 ("MIDI Control Information List")**: CC 48-57 are named, in strictly
  sequential order, `NR Module On/Off` (48), `PRE` (49), `DST` (50), `N→S` (51), `AMP` (52), `CAB` (53), `EQ`
  (54), `MOD` (55), `DLY` (56), `RVB` (57). This is the confirmed source for `GP5_MODULE_CATEGORIES`'s order
  (R1) — it directly names 10 module categories in the exact order `Gp5SysexPresetCodec`'s `cat` byte is
  hypothesized to index (see `src/app/midi/gp5-sysex-preset-codec.ts`'s `REC_MODELS` decoding: each of the 10
  `N_BLOCKS` records stores a `cat` byte and a 3-byte little-endian `fxlow`).
- **external_docs/gp-5-manual.pdf pp.20-36 ("Effect List")**: one table section per category (in the same
  NR→RVB order as p.40), each row giving an `FX Title` (plus `Type`/`Description`/`Parameter Description`,
  irrelevant here). Reading top-to-bottom within each section gives the ordered `fxlow`-indexed title list
  below. p.37 ("Factory SnapTone Files") is a *different* section (pre-made tone-file presets, not part of
  the Effect List) and is explicitly **not** part of this feature's data.

## Files to touch

- `src/app/midi/gp5-module-vocabulary.ts` (new) — everything: `GP5_MODULE_CATEGORIES`,
  `GP5_MODULE_FX_TITLES`, `decodeModule`, `parseModuleType`, `describeModuleType`,
  `GP5_MODULE_VOCABULARY_STATUS` (R1-R11).
- `src/app/midi/gp5-module-vocabulary.spec.ts` (new) — plain Vitest, no Angular `TestBed` (this is pure
  logic with no DI, same category as `WebMidiPedalConnection.isSupported` per `docs/conventions.md`'s
  Tests section).

No other file is touched. In particular, `src/app/midi/preset.ts`, `src/app/midi/gp5-sysex-preset-codec.ts`,
and `src/app/pedals/preset-browser-page/preset-browser-page.ts` are all left exactly as they are — see
"Discarded alternatives" below for why, and "Scope note for the reviewer" for how that reconciles with
acceptance criterion 3's wording.

## Data tables (transcribed from the manual, cited by page)

```ts
export const GP5_MODULE_CATEGORIES: readonly string[] = [
  'NR', 'PRE', 'DST', 'N->S', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB',
]; // p.40
```

`GP5_MODULE_FX_TITLES`, one entry per category index, transcribed top-to-bottom exactly as the manual lists
them (verify byte-for-byte against the PDF while implementing — the lists below are this design's own
transcription and should be double-checked, not blindly retyped):

| cat | category | p. | count | titles (fxlow index order) |
|---|---|---|---|---|
| 0 | NR | 20 | 1 | Gate |
| 1 | PRE | 20-21 | 10 | COMP, COMP4, Boost, Micro Boost, B-Boost, Toucher, Crier, OCTA, Pitch, Detune |
| 2 | DST | 22-23 | 10 | Green OD, Yellow OD, Super OD, SM Dist, Plustortion, La Charger, Darktale, Sora Fuzz, Red Haze, Bass OD |
| 3 | N->S | 23 | 1 | Empty |
| 4 | AMP | 24-30 | 32 | Tweedy, Bellman 59N, Dark Twin, Foxy 30N, J-120 CL, Match CL, L-Star CL, UK 45, UK 50JP, UK 800, Bellman 59B, Foxy 30TB, SUPDual OD, Solo100 OD, Z38 OD, Bad-KT OD, Juice R100, Dizz VH, Dizz VH+, Eagle 120, EV 51, Solo100 LD, Mess DualV, Mess DualM, Power LD, Flagman+, Bog RedV, Classic Bass, Foxy Bass, Mess Bass, AC Pre1, AC Pre2 |
| 5 | CAB | 30-31 | 21 | TWD CP 1x8, Dark VIT 1x12, Foxy 1x12, L-Star 1x12, Dark CS 2x12, Dark Twin 2x12, SUP Star 2x12, J-120 2x12, Foxy 2x12, UK GRN 2x12, UK GRN 4x12, Bog 4x12, Dizz 4x12, EV 4x12, Solo 4x12, Mess 4x12, Eagle 4x12, Juice 4x12, Bellman 2x12, AMPG 4x10, User IR 1-20 |
| 6 | EQ | 31 | 5 | Guitar EQ 1, Guitar EQ 2, Bass EQ 1, Bass EQ 2, Mess EQ |
| 7 | MOD | 32 | 8 | A-Chorus, B-Chorus, Jet, N-Jet, O-Phase, M-Vibe, V-Roto, Vibrato |
| 8 | DLY | 33-34 | 10 | Pure, Analog, Slapback, Sweet Echo, Tape, Tube, Rev Echo, Ring Echo, Sweep Echo, Ping Pong |
| 9 | RVB | 35-36 | 10 | Air, Room, Hall, Church, Plate L, Plate, Spring, N-Star, Deepsea, Sweet Space |

Total: 108 FX titles across 10 categories. Row 5 (CAB)'s `"User IR 1-20"` is the manual's own single table
row for what is presumably 20 loadable user-IR slots — the manual does not break it into 20 separate rows,
so this design keeps it as one `fxlow` index (20) rather than guessing an expansion. Note it explicitly as a
known simplification in the header comment; revisit only if hardware verification (R11's follow-up) shows
the real device indexes it differently.

## Functions

```ts
// src/app/midi/gp5-module-vocabulary.ts
export type ModuleDescription =
  | { kind: 'resolved'; category: string; fxTitle: string }
  | { kind: 'raw'; cat: number; fxlow: number };

export function decodeModule(cat: number, fxlow: number): ModuleDescription {
  const category = GP5_MODULE_CATEGORIES[cat];
  const titles = GP5_MODULE_FX_TITLES[cat];
  const fxTitle = titles?.[fxlow];
  if (category === undefined || fxTitle === undefined) {
    return { kind: 'raw', cat, fxlow };
  }
  return { kind: 'resolved', category, fxTitle };
}

export interface ParsedModuleType {
  cat: number;
  fxlow: number;
}

const MODULE_TYPE_PATTERN = /^cat([0-9a-f]+)_fx([0-9a-f]+)$/i;

export function parseModuleType(moduleType: string): ParsedModuleType | null {
  const match = MODULE_TYPE_PATTERN.exec(moduleType);
  if (!match) return null;
  return { cat: parseInt(match[1], 16), fxlow: parseInt(match[2], 16) };
}

export type DescribedModuleType =
  | { kind: 'resolved'; category: string; fxTitle: string }
  | { kind: 'raw'; moduleType: string };

export function describeModuleType(moduleType: string): DescribedModuleType {
  const parsed = parseModuleType(moduleType);
  if (!parsed) return { kind: 'raw', moduleType };
  const decoded = decodeModule(parsed.cat, parsed.fxlow);
  if (decoded.kind === 'raw') return { kind: 'raw', moduleType };
  return decoded;
}

export const GP5_MODULE_VOCABULARY_STATUS =
  'HYPOTHESIS — cat/fxlow -> category/FX-title mapping derived from external_docs/gp-5-manual.pdf ' +
  "(MIDI CC table p.40, Effect List pp.20-36). NOT yet confirmed against real GP-5 hardware; see " +
  'specs/gp5_module_vocabulary_decoding/tasks.md\'s final task.';
```

`MODULE_TYPE_PATTERN` matching `cat<hex>_fx<hex>` mirrors exactly the string
`Gp5SysexPresetCodec.decodeBody()` already produces (`` `cat${cat.toString(16)}_fx${fxlow.toString(16)}` ``)
— no change needed there. The codec's other sentinel, `'empty'` (used for a chain padded past
`REC_MODELS`'s block count), simply fails `MODULE_TYPE_PATTERN` and falls through to R8/R10's `null`/`raw`
path with no special-casing required.

Discriminated-union return shapes (`ModuleDescription`/`DescribedModuleType`) mirror `SysexDecodeResult` in
`src/app/midi/sysex-preset-codec.ts` — same "explicit `kind` tag over a nullable/throwing return" convention
already established in this codebase for exactly this kind of "resolved vs. fallback" result.

## Scope note for the reviewer

Acceptance criterion 3 says *"moduleType (or a new decoded field alongside it) exposes the resolved
category/FX name... falling back gracefully"*. This design reads "exposes" as *"a caller can obtain it"* —
satisfied by `describeModuleType` being an exported, tested function any preset-displaying code can call —
not as *"the already-shipped `preset-browser-page.ts` renders it today"*. That reading follows directly from
the feature's own description ("to be consumed by preset-displaying UI (`preset_browser_ui` and later
features)... This feature builds and verifies a lookup table") — wiring it into the UI is explicitly deferred
to that already-`done`, already-approved feature or a later one, not this one. If the human reviewing this
spec disagrees and wants `preset-browser-page.ts` updated in the same feature, that should come back as spec
feedback before approval, since it would add a UI file (and i18n keys, per `docs/conventions.md`) to this
feature's touched-files list.

## Hardware verification (explicitly out of automated scope)

Acceptance criterion 2 requires *"at least one round-trip verification against real GP-5 hardware confirming
the mapping is correct for a sample of real patches (not just internal consistency)"*. This cannot be
performed by an `implementer`/`reviewer` subagent session: it requires Ricardo to physically connect his real
GP-5, read a known factory patch (e.g. via the already-`done` `sysex_preset_read_write`/`preset_browser_ui`
features), and compare the resolved `category`/`fxTitle` names this feature produces against what the
pedal's own screen shows for that same patch's modules. Nothing in this repository can substitute for that —
an implementer session simulating or asserting this "worked" without a human doing it would be fabricating
verification. `GP5_MODULE_VOCABULARY_STATUS` (R11) exists precisely so this gap stays visible in the code
itself (not just in a spec file) until it's closed: tasks.md's final task is deliberately left for a human to
complete later, and is not something the implementer/reviewer can check off.

## Discarded alternatives

1. **Decode `cat`/`fxlow` eagerly inside `Gp5SysexPresetCodec.decodeBody()`, replacing or augmenting
   `PresetSlot.moduleType` at read time.** Rejected: `PresetSlot`/`Gp5SysexPresetCodec` belong to the
   already-`done`, already-approved `sysex_preset_read_write` feature; changing their shape here would
   require touching and re-testing files and behavior outside this feature's own spec, and
   `sysex_preset_read_write/design.md`'s "Open question" explicitly deferred exactly this vocabulary mapping
   to a future feature rather than baking it into the codec. Acceptance criterion 4 ("No change to the raw
   SysEx encode/decode byte layout") reinforces keeping this feature additive-only. A standalone pure-function
   module any caller can invoke achieves the same end result (a resolved name reachable from decoded data)
   without that coupling.
2. **Return `null` (or throw) from `decodeModule`/`describeModule` on an unresolved code, instead of a
   discriminated `{ kind: 'raw', ... }` result.** Rejected: `null` forces every caller to remember a separate
   fallback branch with no compiler help distinguishing "no result" from "a legitimate empty title" (a
   category could, in principle, have an empty-string title), and a throw contradicts R5/R6/R10's explicit
   "without throwing" requirement plus `docs/architecture.md` principle 3's "callers must catch and surface a
   user-facing message" being reserved for actual error conditions — an unresolved lookup code from real
   hardware data is an expected, not exceptional, case (identical reasoning to `SysexDecodeResult`'s existing
   three-way discriminated result in this same directory).
3. **Expand `GP5_MODULE_FX_TITLES`'s `"User IR 1-20"` CAB row into 20 separate synthetic entries
   (`"User IR 1"` … `"User IR 20"`).** Rejected: the manual gives no `fxlow` sub-indexing for this row, so
   any 20-way split would be an unfounded guess, not a transcription — worse than leaving it as the manual's
   own single row and revisiting only once hardware verification (still pending, see above) reveals the real
   indexing.

## Testing approach

`gp5-module-vocabulary.spec.ts`, plain Vitest (no `TestBed`):
- R1: `GP5_MODULE_CATEGORIES` has length 10 and the exact `['NR', 'PRE', ..., 'RVB']` values.
- R2/R3: `GP5_MODULE_FX_TITLES`'s ten arrays have lengths `[1, 10, 10, 1, 32, 21, 5, 8, 10, 10]`; spot-check
  known entries at both ends of a couple of categories (e.g. `GP5_MODULE_FX_TITLES[1][0] === 'COMP'`,
  `GP5_MODULE_FX_TITLES[1][9] === 'Detune'`, `GP5_MODULE_FX_TITLES[9][9] === 'Sweet Space'`).
- R4: `decodeModule(1, 0)` resolves to `{ kind: 'resolved', category: 'PRE', fxTitle: 'COMP' }`;
  `decodeModule(9, 9)` resolves to `{ kind: 'resolved', category: 'RVB', fxTitle: 'Sweet Space' }`.
- R5: `decodeModule(99, 0)` returns `{ kind: 'raw', cat: 99, fxlow: 0 }`.
- R6: `decodeModule(1, 999)` returns `{ kind: 'raw', cat: 1, fxlow: 999 }`.
- R7: `parseModuleType('cat1_fx0')` returns `{ cat: 1, fxlow: 0 }`; a multi-hex-digit case (e.g.
  `'cata_fx1b'`) parses both fields correctly.
- R8: `parseModuleType('empty')` and `parseModuleType('garbage')` both return `null`.
- R9: `describeModuleType('cat1_fx0')` returns `{ kind: 'resolved', category: 'PRE', fxTitle: 'COMP' }`.
- R10: `describeModuleType('empty')` (unparseable) and `describeModuleType('cat99_fx0')` (parseable but
  unresolved) both return `{ kind: 'raw', moduleType: <the original string> }`.
- R11: `GP5_MODULE_VOCABULARY_STATUS` is a non-empty string containing `'HYPOTHESIS'` and
  `'gp-5-manual.pdf'`.
