# Requirements — gp5_module_vocabulary_hardware_re_verification

Scope: replace feature 10's *positional* hypothesis with an **evidence-backed, exhaustive lookup**. Feature 10
assumed the `cat` byte is an index into the manual's p.40 category order, and `fxlow` is a row index inside that
category's manual table. This feature instead maps each literal hardware code the codec emits
(`PresetSlot.moduleType`, e.g. `"cat7_fx4"`) to a canonical `(category, FX title)` pair. Every entry must be
supported by a real GP-5 capture recorded in a git-tracked fixture. Every effect the pedal offers must be
captured (user decision Q1, 2026-09-28). SnapTones in the N->S slot are in scope (user decision Q7). Factory
SnapTone names go in the table. User-imported SnapTones are user data, named after the imported file, so they
resolve to one generic `User SnapTone` title (design.md "SnapTones"). Decoding must not depend on a block's
position in the chain, because the chain can be reordered on the pedal (user answer, 2026-09-28).
Feature 15 (`gp5_mod_tremolo_vocabulary`) is closed as absorbed by this spec's R20.

Why a lookup table and not an in-place reorder of `GP5_MODULE_FX_TITLES`: the 2026-09-28 preset-0 capture shows
the `cat` byte does not identify the category. `cat0_fx0` is PRE/COMP, `cat7_fx4` is AMP/Dark Twin, and
`cata_fx100000` is CAB/User IR. Reordering titles *inside* a category cannot fix a wrong category. See design.md
"In plain terms" and "Discarded alternatives" #1.

In scope:
- a git-tracked capture fixture (the ground-truth record),
- a complete hardware-code lookup table derived from it,
- appending pedal-observed titles that are missing from the canonical tables: the MOD tremolos, the factory
  SnapTone names, and one generic `User SnapTone` entry,
  together with their catalog entries and i18n descriptions,
- rewiring `decodeModule`/`describeModuleType` and `gp5-fx-catalog.ts`'s `describeParameters` to use the table,
- an updated `GP5_MODULE_VOCABULARY_STATUS`,
- updates to existing specs whose hard-coded `moduleType` literals depended on the old positional mapping.

Out of scope:
- any change to `Gp5SysexPresetCodec` logic,
- changing the order of `GP5_MODULE_CATEGORIES` or the index of any existing `GP5_MODULE_FX_TITLES` entry,
- new UI,
- doing the hardware captures. Only Ricardo can do those (tasks.md T1).

Terminology:
- **capture row**: one entry in `GP5_HARDWARE_CAPTURES` (R1).
- **hardware code**: a `moduleType` string in the codec's `cat<hex>_fx<hex>` form.
- **canonical pair**: `(categoryIndex, fxIndex)` indexing `GP5_MODULE_CATEGORIES`/`GP5_MODULE_FX_TITLES`, after
  this feature's appends (R20, R21).

## R1
The system SHALL export `GP5_HARDWARE_CAPTURES` from `src/app/midi/gp5-hardware-captures.ts`: a readonly array of
capture rows. Each row has these fields:
- `source`: capture date, preset slot, and preset name, e.g. `'2026-09-28 preset 0 TL DLX AMP'`
- `blockIndex`: `0`-`9`, the REC_MODELS record index
- `chainPosition`: `0`-`9`, the position after REC_ORDER is applied, which is the order the pedal displays
- `rawBytes`: the 4 REC_MODELS record bytes, as a 4-element number tuple
- `moduleType`
- `pedalCategory`: the category code the GP-5 shows for that block. The GP-5 screen or Valeton Suite are both
  valid sources, because they show the same name (user answer Q4).
- `pedalFxTitle`: the canonical FX title for that block. This is the title the GP-5 shows, except for a
  user-imported SnapTone, where it is `User SnapTone`.
- `pedalDisplayName` (optional): the literal name the GP-5 showed, when it differs from `pedalFxTitle`. For a
  user-imported SnapTone this is the imported file's name.

## R2
For every capture row, `moduleType` SHALL equal
`` `cat${rawBytes[3].toString(16)}_fx${(rawBytes[0] | rawBytes[1] << 8 | rawBytes[2] << 16).toString(16)}` ``
(the codec's `decodeBody` formula, pinned by feature 18).

## R3
For every capture row, the pair (`pedalCategory`, `pedalFxTitle`) SHALL name an existing canonical pair:
`pedalCategory` is an element of `GP5_MODULE_CATEGORIES`, and `pedalFxTitle` is an element of
`GP5_MODULE_FX_TITLES` at that category's index.

## R4
`GP5_HARDWARE_CAPTURES` SHALL contain the three preset-0 rows captured on 2026-09-28: `cat0_fx0` → PRE/`COMP`,
`cat7_fx4` → AMP/`Dark Twin`, and `cata_fx100000` → CAB/`User IR 1-20`.

## R5
For every canonical pair in `GP5_MODULE_FX_TITLES`, the system SHALL have either at least one
`GP5_HARDWARE_MODULE_CODES` entry that resolves to it, or an entry in `GP5_UNCAPTURABLE_FX`. This is the
exhaustive-coverage rule.

## R6
The system SHALL export `GP5_UNCAPTURABLE_FX` from `gp5-module-vocabulary.ts`: a readonly array of
`{ categoryIndex, fxIndex, reason }`. Each entry names a valid canonical pair and has a non-empty `reason`
recorded from T1, for example "not offered in the pedal's FX list".

## R7
The system SHALL export `GP5_HARDWARE_MODULE_CODES` from `src/app/midi/gp5-module-vocabulary.ts`: a readonly map
from a hardware code (lower-case hex, the codec's exact format) to a canonical pair
`{ categoryIndex, fxIndex }`.

## R8
For every entry in `GP5_HARDWARE_MODULE_CODES`, `GP5_HARDWARE_CAPTURES` SHALL contain at least one row that
supports it. A supporting row has the same `moduleType` as the entry's key, and its `pedalCategory`/
`pedalFxTitle` equal `GP5_MODULE_CATEGORIES[categoryIndex]`/`GP5_MODULE_FX_TITLES[categoryIndex][fxIndex]`.

## R9
IF two capture rows share a `moduleType` but disagree on `pedalCategory` or `pedalFxTitle` THEN the fixture test
SHALL fail and name the conflicting `moduleType`.

## R10
WHEN `describeModuleType(moduleType)` is called with any capture row's `moduleType`, the system SHALL return
`{ kind: 'resolved', category: pedalCategory, fxTitle: pedalFxTitle }` for that row.

## R11
WHEN `decodeModule(cat, fxlow)` is called and the hardware code built from `cat`/`fxlow` is a key of
`GP5_HARDWARE_MODULE_CODES`, the system SHALL return `{ kind: 'resolved' }` with the category and FX title that
entry's canonical pair indexes.

## R12
IF `decodeModule(cat, fxlow)` is called and the hardware code built from `cat`/`fxlow` is not a key of
`GP5_HARDWARE_MODULE_CODES` THEN the system SHALL return `{ kind: 'raw', cat, fxlow }`, without throwing. This
applies even when the pair would be valid positional indices under feature 10's old mapping.

## R13
WHEN `resolveModuleIndices(moduleType)` (a new export of `gp5-module-vocabulary.ts`) is called with a hardware code
that is a key of `GP5_HARDWARE_MODULE_CODES`, the system SHALL return that entry's canonical pair
`{ categoryIndex, fxIndex }`.

## R14
IF `resolveModuleIndices(moduleType)` is called with any other string, including `'empty'`, an unparseable string,
or a parseable code that has no entry, THEN the system SHALL return `null`, without throwing.

## R15
WHEN `describeParameters(moduleType, parameters)` in `gp5-fx-catalog.ts` is called with a hardware code that is a
key of `GP5_HARDWARE_MODULE_CODES`, the system SHALL label the parameters with
`GP5_FX_CATALOG[categoryIndex][fxIndex].parameterNames` for that entry's canonical pair. It SHALL NOT index
`GP5_FX_CATALOG` by the raw `cat`/`fxlow`.

## R16
IF `describeParameters(moduleType, parameters)` is called with a hardware code that is not a key of
`GP5_HARDWARE_MODULE_CODES` THEN the system SHALL return the raw `p<k>` entries.

## R17
`GP5_MODULE_VOCABULARY_STATUS` SHALL contain the token `HARDWARE-VERIFIED` and the string
`gp5-hardware-captures`.

## R18
`GP5_MODULE_VOCABULARY_STATUS` SHALL NOT contain the substring `NOT yet confirmed against real GP-5 hardware`.

## R19
`GP5_MODULE_CATEGORIES` SHALL keep its current values in its current order (`NR, PRE, DST, N->S, AMP, CAB, EQ,
MOD, DLY, RVB`). Every title in `GP5_MODULE_FX_TITLES` before this feature SHALL keep its index, which means
feature 10's arrays remain prefixes of the new ones.

## R20
WHERE T1 shows the pedal offering an FX title in a non-N->S category that is missing from `GP5_MODULE_FX_TITLES`,
the system SHALL append that title to the end of its category array, spelled as the pedal displays it. For
example, the p.33 MOD tremolos.

## R21
The system SHALL append to `GP5_MODULE_FX_TITLES[3]` (N->S), after the existing `'Empty'` at index 0, every
**factory** SnapTone name the pedal lists for the N->S module in T1. The names are spelled as the pedal displays
them, in the pedal's list order. A final entry `'User SnapTone'` follows them.

## R22
IF a capture row's block holds a user-imported SnapTone THEN that row's `pedalFxTitle` SHALL be
`'User SnapTone'`, and its `pedalDisplayName` SHALL hold the name shown on the pedal. As a result, every hardware
code captured for a user-imported SnapTone resolves to N->S / `User SnapTone` (R10).

## R23
The system SHALL give every title appended under R20 or R21 a `GP5_FX_CATALOG` entry at the same canonical index.
A SnapTone entry, whether factory or `User SnapTone`, uses the N->S row's parameter names from manual p.23
(`Gain, VOL, Bass, Middle, Treble`) and `manualPage` 23.

## R24
The system SHALL add an `es` and an `en` description for every `descriptionKey` (`gp5Fx.c<c>.f<i>`) that R23
creates, in `public/i18n/{es,en}.json`.
- A factory SnapTone's description paraphrases its manual pp.37-39 row.
- `User SnapTone` gets a description saying it is a SnapTone file the user imported.
- Any other appended title gets a neutral description stating only its type.

## R25
WHEN `Gp5SysexPresetCodec` decodes a preset body whose REC_ORDER record is a non-identity permutation, the system
SHALL resolve each resulting chain slot's `moduleType` to the same `(category, fxTitle)` that the referenced
block's REC_MODELS record resolves to. Decoding depends only on the hardware code, never on `blockIndex` or
`chainPosition`.

## R26
`GP5_HARDWARE_CAPTURES` SHALL contain at least one pair of reads of the same preset, taken before and after a
reorder on the pedal (T1 step 1e), in which at least one hardware code appears at two different
`chainPosition` values.
