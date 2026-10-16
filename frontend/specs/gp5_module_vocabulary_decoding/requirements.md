# Requirements — gp5_module_vocabulary_decoding

Scope: a pure, standalone lookup layer that decodes the GP-5's opaque `cat`/`fxlow` module-slot codes (today
surfaced only as `PresetSlot.moduleType` strings like `"cat1_fx0"`, produced by
`Gp5SysexPresetCodec.decodeBody()` in `src/app/midi/gp5-sysex-preset-codec.ts`) into human-readable
`{category, fxTitle}` pairs, derived from `external_docs/gp-5-manual.pdf`'s MIDI CC table (p.40) and Effect
List (pp.20-36). Out of scope: wiring the decoded names into `preset-browser-page.ts` or any other UI (that
belongs to `preset_browser_ui`, already `done`, and to later features per this feature's own description);
any change to `Gp5SysexPresetCodec`'s SysEx byte-level encode/decode logic or to `PresetSlot`'s shape
(acceptance criterion 4 — this is a display/lookup layer *on top of* the existing codec, not a protocol
change); performing the real-hardware verification itself (R11 only requires *documenting* that it hasn't
happened yet — see design.md's "Hardware verification" section and tasks.md's final task).

## R1
The system SHALL provide `GP5_MODULE_CATEGORIES`, an array of exactly 10 category codes at indices `0`-`9`,
with values `NR, PRE, DST, N->S, AMP, CAB, EQ, MOD, DLY, RVB` in that order (external_docs/gp-5-manual.pdf
p.40, MIDI CC 48-57, which assigns those codes to CC 48-57 in that same sequential order).

## R2
The system SHALL provide `GP5_MODULE_FX_TITLES`, an object keyed by each category's index (`0`-`9` from R1),
whose value is an ordered array of FX Title strings transcribed top-to-bottom from that category's table
section in external_docs/gp-5-manual.pdf (pp.20-36).

## R3
The lengths of `GP5_MODULE_FX_TITLES`'s ten arrays (keys `0`-`9`) SHALL be exactly `[1, 10, 10, 1, 32, 21, 5,
8, 10, 10]` respectively — NR=1, PRE=10, DST=10, N->S=1, AMP=32, CAB=21, EQ=5, MOD=8, DLY=10, RVB=10
(external_docs/gp-5-manual.pdf pp.20-36; see design.md's per-category tables for the exact transcribed
values and their page numbers).

> Superseded by feature 19 (`gp5_module_vocabulary_hardware_re_verification`): titles are only appended, so these lengths are now prefixes (feature 19 R19-R21).

## R4
WHEN `decodeModule(cat, fxlow)` is called with a `cat` that has an entry in `GP5_MODULE_CATEGORIES` (R1) and
an `fxlow` that is a valid index into that category's `GP5_MODULE_FX_TITLES` array (R2), the system SHALL
return a resolved result containing that category's code and the FX title at index `fxlow`.

> Superseded by feature 19 (`gp5_module_vocabulary_hardware_re_verification`): `decodeModule` resolves through the per-code `GP5_HARDWARE_MODULE_CODES` lookup, not by position (feature 19 R11, R12).

## R5
IF `decodeModule(cat, fxlow)` is called with a `cat` that has no entry in `GP5_MODULE_CATEGORIES` (R1) THEN
the system SHALL return a fallback result carrying the raw `cat`/`fxlow` values, without throwing.

## R6
IF `decodeModule(cat, fxlow)` is called with a `cat` that does have an entry in `GP5_MODULE_CATEGORIES` (R1)
but an `fxlow` outside that category's `GP5_MODULE_FX_TITLES` array's valid index range (R2) THEN the system
SHALL return a fallback result carrying the raw `cat`/`fxlow` values, without throwing.

## R7
WHEN `parseModuleType(moduleType)` is called with a string matching the `cat<hex>_fx<hex>` pattern produced
by `Gp5SysexPresetCodec.decodeBody()` (e.g. `"cat1_fx0"`), the system SHALL return the parsed `{ cat, fxlow }`
numeric pair.

## R8
IF `parseModuleType(moduleType)` is called with a string that does not match the `cat<hex>_fx<hex>` pattern
(including the codec's own `"empty"` sentinel for unpopulated slots) THEN the system SHALL return `null`,
without throwing.

## R9
WHEN `describeModuleType(moduleType)` is called with a string that `parseModuleType` (R7) parses and
`decodeModule` (R4) resolves, the system SHALL return a resolved result containing that category's code and
FX title.

## R10
IF `describeModuleType(moduleType)` is called with a string that `parseModuleType` fails to parse (R8) OR
that parses but `decodeModule` cannot resolve (R5, R6) THEN the system SHALL return a fallback result
carrying the original, unmodified `moduleType` string, without throwing.

## R11
The system SHALL export a `GP5_MODULE_VOCABULARY_STATUS` string constant from `gp5-module-vocabulary.ts`
whose value states that the `cat`/`fxlow` mapping is a hypothesis derived from
external_docs/gp-5-manual.pdf's MIDI CC table (p.40) and Effect List (pp.20-36), and that it has not yet been
confirmed against real GP-5 hardware — mirroring `gp5-sysex-preset-codec.ts`'s existing
CONFIRMED/CORROBORATED/UNCONFIRMED documentation convention for exactly this kind of claim.

> Superseded by feature 19 (`gp5_module_vocabulary_hardware_re_verification`): the status is now `HARDWARE-VERIFIED` and cites `gp5-hardware-captures` (feature 19 R17, R18).
