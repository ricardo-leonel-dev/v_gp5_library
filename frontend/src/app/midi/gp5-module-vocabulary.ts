// GP-5 module-slot vocabulary — decodes the opaque `cat`/`fxlow` codes that
// `Gp5SysexPresetCodec.decodeBody()` surfaces on every `PresetSlot.moduleType`
// string (e.g. `"cat1_fx0"`) into human-readable `{ category, fxTitle }` pairs.
//
// HYPOTHESIS (status: see GP5_MODULE_VOCABULARY_STATUS below):
//   * GP5_MODULE_CATEGORIES (R1) — order is taken from
//     external_docs/gp-5-manual.pdf p.40, "MIDI Control Information List",
//     which names CC 48-57 in strictly that order (NR, PRE, DST, N->S, AMP,
//     CAB, EQ, MOD, DLY, RVB). This is the only piece derived from p.40.
//   * GP5_MODULE_FX_TITLES (R2, R3) — the per-category title lists are
//     transcribed top-to-bottom from external_docs/gp-5-manual.pdf pp.20-36
//     ("Effect List"). Verified against the PDF during implementation: counts
//     match the manual's per-category row count (NR=1, PRE=10, DST=10, N->S=1,
//     AMP=32, CAB=21, EQ=5, MOD=8, DLY=10, RVB=10).
//   * The mapping from `cat` (0-9) to the category code, and from `fxlow`
//     (0..count-1) to that category's FX title at the same top-to-bottom
//     index, is NOT independently verified against real GP-5 hardware yet.
//     The spec-designates the manual as the authoritative source for both
//     the category order (p.40) and the FX-title order (pp.20-36), but the
//     pedal itself has not been checked to confirm that an `fxlow` byte of
//     `N` actually indexes the `N`-th row of that category's manual section.
//     T17 in tasks.md is the human-hardware follow-up that closes this gap.
//
// Known manual-layout note (HYPOTHESIS status covers this; revisit if T17
// reveals otherwise): the manual's MOD section visually extends from p.32
// across to p.33, where 3 additional tremolo entries (O-Trem, Sine Trem,
// Bias Trem) appear before the DLY header on p.33. Per R3 this module
// exposes only the 8 entries listed on p.32 (A-Chorus, B-Chorus, Jet,
// N-Jet, O-Phase, M-Vibe, V-Roto, Vibrato); the 3 tremolo entries are
// intentionally omitted to keep `GP5_MODULE_FX_TITLES[7].length === 8`.
// Whether the pedal actually maps `fxlow=8..10` to those entries (which would
// make MOD length 11) is a hardware-verification question per R11/T17.
//
// The `User IR 1-20` CAB row is the manual's own single-row entry covering
// what is presumably 20 loadable user-IR slots. It is kept as one `fxlow`
// index (20), not expanded into 20 synthetic entries — see design.md
// "Discarded alternatives" #3 for the rationale (the manual gives no
// sub-indexing for this row, so any 20-way split would be an unfounded guess).

// --- R1: module category codes (one per `cat` byte value 0-9) -------------
// Source: external_docs/gp-5-manual.pdf p.40 (MIDI CC table, CC 48-57).
export const GP5_MODULE_CATEGORIES: readonly string[] = [
  'NR', 'PRE', 'DST', 'N->S', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB',
];

// --- R2, R3: per-category FX title lists (index = `fxlow` byte value) ------
// Source: external_docs/gp-5-manual.pdf pp.20-36, top-to-bottom within each
// section. Lengths must match R3: [1, 10, 10, 1, 32, 21, 5, 8, 10, 10].
export const GP5_MODULE_FX_TITLES: readonly (readonly string[])[] = [
  // 0: NR — p.20
  ['Gate'],
  // 1: PRE — pp.20-21
  [
    'COMP',
    'COMP4',
    'Boost',
    'Micro Boost',
    'B-Boost',
    'Toucher',
    'Crier',
    'OCTA',
    'Pitch',
    'Detune',
  ],
  // 2: DST — pp.22-23
  [
    'Green OD',
    'Yellow OD',
    'Super OD',
    'SM Dist',
    'Plustortion',
    'La Charger',
    'Darktale',
    'Sora Fuzz',
    'Red Haze',
    'Bass OD',
  ],
  // 3: N->S — p.23
  ['Empty'],
  // 4: AMP — pp.24-30
  [
    'Tweedy',
    'Bellman 59N',
    'Dark Twin',
    'Foxy 30N',
    'J-120 CL',
    'Match CL',
    'L-Star CL',
    'UK 45',
    'UK 50JP',
    'UK 800',
    'Bellman 59B',
    'Foxy 30TB',
    'SUPDual OD',
    'Solo100 OD',
    'Z38 OD',
    'Bad-KT OD',
    'Juice R100',
    'Dizz VH',
    'Dizz VH+',
    'Eagle 120',
    'EV 51',
    'Solo100 LD',
    'Mess DualV',
    'Mess DualM',
    'Power LD',
    'Flagman+',
    'Bog RedV',
    'Classic Bass',
    'Foxy Bass',
    'Mess Bass',
    'AC Pre1',
    'AC Pre2',
  ],
  // 5: CAB — pp.30-31
  [
    'TWD CP 1x8',
    'Dark VIT 1x12',
    'Foxy 1x12',
    'L-Star 1x12',
    'Dark CS 2x12',
    'Dark Twin 2x12',
    'SUP Star 2x12',
    'J-120 2x12',
    'Foxy 2x12',
    'UK GRN 2x12',
    'UK GRN 4x12',
    'Bog 4x12',
    'Dizz 4x12',
    'EV 4x12',
    'Solo 4x12',
    'Mess 4x12',
    'Eagle 4x12',
    'Juice 4x12',
    'Bellman 2x12',
    'AMPG 4x10',
    'User IR 1-20',
  ],
  // 6: EQ — p.31
  ['Guitar EQ 1', 'Guitar EQ 2', 'Bass EQ 1', 'Bass EQ 2', 'Mess EQ'],
  // 7: MOD — p.32 (R3-mandated length 8; see header note about the 3
  // tremolo entries the manual lays out on p.33)
  [
    'A-Chorus',
    'B-Chorus',
    'Jet',
    'N-Jet',
    'O-Phase',
    'M-Vibe',
    'V-Roto',
    'Vibrato',
  ],
  // 8: DLY — pp.33-34
  [
    'Pure',
    'Analog',
    'Slapback',
    'Sweet Echo',
    'Tape',
    'Tube',
    'Rev Echo',
    'Ring Echo',
    'Sweep Echo',
    'Ping Pong',
  ],
  // 9: RVB — pp.35-36
  [
    'Air',
    'Room',
    'Hall',
    'Church',
    'Plate L',
    'Plate',
    'Spring',
    'N-Star',
    'Deepsea',
    'Sweet Space',
  ],
];

// --- R4-R6: decodeModule -------------------------------------------------
// Discriminated-union result, mirroring `SysexDecodeResult` in
// `sysex-preset-codec.ts` — explicit `kind` tag lets callers distinguish
// "resolved name" from "raw code with no entry in the table" without a
// nullable return that could be confused with a legitimate empty-string
// title (cf. design.md "Discarded alternatives" #2).
export type ModuleDescription =
  | { kind: 'resolved'; category: string; fxTitle: string }
  | { kind: 'raw'; cat: number; fxlow: number };

export function decodeModule(cat: number, fxlow: number): ModuleDescription {
  const category = GP5_MODULE_CATEGORIES[cat];
  const titles = GP5_MODULE_FX_TITLES[cat];
  const fxTitle = titles?.[fxlow];
  if (category === undefined || fxTitle === undefined) {
    // R5 (cat out of table) and R6 (fxlow out of that category's range)
    // share a single fallback shape — the caller only needs the raw codes
    // back, not which one was the problem.
    return { kind: 'raw', cat, fxlow };
  }
  return { kind: 'resolved', category, fxTitle };
}

// --- R7, R8: parseModuleType ---------------------------------------------
// Matches exactly the template-literal string
// `Gp5SysexPresetCodec.decodeBody()` already produces:
//   `cat${cat.toString(16)}_fx${fxlow.toString(16)}`
// The codec's `'empty'` sentinel (unpopulated chain slots past the last
// REC_MODELS block) fails this pattern and falls through to R8's `null`
// path with no special-casing — see design.md "Functions" section.
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

// --- R9, R10: describeModuleType -----------------------------------------
// Convenience composition of `parseModuleType` + `decodeModule`. Two
// distinct `kind: 'raw'` fallback shapes are needed because:
//   * `parseModuleType` failed (e.g. `'empty'`, `'garbage'`) → we have no
//     numeric codes, so the fallback carries the original `moduleType` string
//     verbatim (the only thing we can give back).
//   * `parseModuleType` succeeded but `decodeModule` couldn't resolve (out
//     of either `GP5_MODULE_CATEGORIES` or that category's FX-title range)
//     → we have the codes, but the *resolved* result must still be a
//     `kind: 'raw'` per R10. We use the same `kind: 'raw', moduleType`
//     shape (carrying the original string) so callers only need one
//     fallback branch — see design.md "Discarded alternatives" #2.
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

// --- R11: vocabulary status ---------------------------------------------
// Mirrors `gp5-sysex-preset-codec.ts`'s CONFIRMED/CORROBORATED/UNCONFIRMED
// header convention. Update this constant (and its T16 test) once the
// hardware verification in tasks.md's final task is performed.
export const GP5_MODULE_VOCABULARY_STATUS =
  'HYPOTHESIS — cat/fxlow -> category/FX-title mapping derived from ' +
  'external_docs/gp-5-manual.pdf (MIDI CC table p.40, Effect List pp.20-36). ' +
  'NOT yet confirmed against real GP-5 hardware; see ' +
  "specs/gp5_module_vocabulary_decoding/tasks.md's final task.";