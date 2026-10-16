import { describe, expect, it } from 'vitest';
import { GP5_HARDWARE_CAPTURES } from './gp5-hardware-captures';
import {
  decodeModule,
  describeModuleType,
  GP5_HARDWARE_MODULE_CODES,
  GP5_MODULE_CATEGORIES,
  GP5_MODULE_FX_TITLES,
  GP5_MODULE_VOCABULARY_STATUS,
  GP5_UNCAPTURABLE_FX,
  parseModuleType,
  resolveModuleIndices,
} from './gp5-module-vocabulary';

// Plain Vitest (no TestBed): pure logic, per `docs/conventions.md`'s Tests section.

const N_S = GP5_MODULE_CATEGORIES.indexOf('N->S');
const MOD = GP5_MODULE_CATEGORIES.indexOf('MOD');

// Feature 10's arrays, frozen: every one must stay a prefix of the current table (R19).
const FEATURE_10_FX_TITLES: readonly (readonly string[])[] = [
  ['Gate'],
  ['COMP', 'COMP4', 'Boost', 'Micro Boost', 'B-Boost', 'Toucher', 'Crier', 'OCTA', 'Pitch', 'Detune'],
  [
    'Green OD', 'Yellow OD', 'Super OD', 'SM Dist', 'Plustortion', 'La Charger', 'Darktale',
    'Sora Fuzz', 'Red Haze', 'Bass OD',
  ],
  ['Empty'],
  [
    'Tweedy', 'Bellman 59N', 'Dark Twin', 'Foxy 30N', 'J-120 CL', 'Match CL', 'L-Star CL', 'UK 45',
    'UK 50JP', 'UK 800', 'Bellman 59B', 'Foxy 30TB', 'SUPDual OD', 'Solo100 OD', 'Z38 OD',
    'Bad-KT OD', 'Juice R100', 'Dizz VH', 'Dizz VH+', 'Eagle 120', 'EV 51', 'Solo100 LD',
    'Mess DualV', 'Mess DualM', 'Power LD', 'Flagman+', 'Bog RedV', 'Classic Bass', 'Foxy Bass',
    'Mess Bass', 'AC Pre1', 'AC Pre2',
  ],
  [
    'TWD CP 1x8', 'Dark VIT 1x12', 'Foxy 1x12', 'L-Star 1x12', 'Dark CS 2x12', 'Dark Twin 2x12',
    'SUP Star 2x12', 'J-120 2x12', 'Foxy 2x12', 'UK GRN 2x12', 'UK GRN 4x12', 'Bog 4x12',
    'Dizz 4x12', 'EV 4x12', 'Solo 4x12', 'Mess 4x12', 'Eagle 4x12', 'Juice 4x12', 'Bellman 2x12',
    'AMPG 4x10', 'User IR 1-20',
  ],
  ['Guitar EQ 1', 'Guitar EQ 2', 'Bass EQ 1', 'Bass EQ 2', 'Mess EQ'],
  ['A-Chorus', 'B-Chorus', 'Jet', 'N-Jet', 'O-Phase', 'M-Vibe', 'V-Roto', 'Vibrato'],
  [
    'Pure', 'Analog', 'Slapback', 'Sweet Echo', 'Tape', 'Tube', 'Rev Echo', 'Ring Echo',
    'Sweep Echo', 'Ping Pong',
  ],
  [
    'Air', 'Room', 'Hall', 'Church', 'Plate L', 'Plate', 'Spring', 'N-Star', 'Deepsea',
    'Sweet Space',
  ],
];

function isValidPair(categoryIndex: number, fxIndex: number): boolean {
  return GP5_MODULE_FX_TITLES[categoryIndex]?.[fxIndex] !== undefined;
}

describe('canonical tables (R19, R20, R21)', () => {
  it('R19: GP5_MODULE_CATEGORIES keeps its values and order', () => {
    expect(GP5_MODULE_CATEGORIES).toEqual([
      'NR', 'PRE', 'DST', 'N->S', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB',
    ]);
  });

  it('R19: every feature 10 title array is a prefix of the current one (no index moved)', () => {
    expect(GP5_MODULE_FX_TITLES).toHaveLength(FEATURE_10_FX_TITLES.length);
    FEATURE_10_FX_TITLES.forEach((titles, c) => {
      expect(GP5_MODULE_FX_TITLES[c].slice(0, titles.length)).toEqual(titles);
    });
  });

  it('R20/R21: category lengths after the appends are [1, 10, 10, 52, 32, 21, 5, 11, 10, 10]', () => {
    expect(GP5_MODULE_FX_TITLES.map((titles) => titles.length)).toEqual([
      1, 10, 10, 52, 32, 21, 5, 11, 10, 10,
    ]);
  });

  it('R20: MOD ends with the three tremolos the pedal lists after Vibrato', () => {
    expect(GP5_MODULE_FX_TITLES[MOD].slice(8)).toEqual(['O-Trem', 'Sine Trem', 'Bias Trem']);
  });

  it("R21: N->S keeps 'Empty' at index 0 and ends with 'User SnapTone'", () => {
    const titles = GP5_MODULE_FX_TITLES[N_S];
    expect(titles[0]).toBe('Empty');
    expect(titles[titles.length - 1]).toBe('User SnapTone');
  });

  it('R21: every N->S capture title is in the N->S list', () => {
    for (const row of GP5_HARDWARE_CAPTURES.filter((r) => r.pedalCategory === 'N->S')) {
      expect(GP5_MODULE_FX_TITLES[N_S], `${row.source} block ${row.blockIndex}`).toContain(
        row.pedalFxTitle,
      );
    }
  });

  it("R21: factory SnapTones follow the pedal's list order (factory code [n,0,0,15] is title n + 1)", () => {
    const factory = GP5_HARDWARE_CAPTURES.filter(
      (r) =>
        r.pedalCategory === 'N->S' &&
        r.pedalFxTitle !== 'Empty' &&
        r.pedalFxTitle !== 'User SnapTone',
    );
    expect(new Set(factory.map((r) => r.pedalFxTitle)).size).toBe(50);
    for (const row of factory) {
      expect(GP5_MODULE_FX_TITLES[N_S][row.rawBytes[0] + 1], row.source).toBe(row.pedalFxTitle);
    }
  });

  it("R22: every N->S capture with a pedalDisplayName is a 'User SnapTone' row", () => {
    const named = GP5_HARDWARE_CAPTURES.filter(
      (r) => r.pedalCategory === 'N->S' && r.pedalDisplayName !== undefined,
    );
    expect(named.length).toBeGreaterThan(0);
    for (const row of named) {
      expect(row.pedalFxTitle, row.source).toBe('User SnapTone');
    }
  });
});

describe('GP5_HARDWARE_MODULE_CODES (R7, R8)', () => {
  it('R7: every key is in the codec format and every value is a valid canonical pair', () => {
    expect(GP5_HARDWARE_MODULE_CODES.size).toBeGreaterThan(0);
    for (const [moduleType, { categoryIndex, fxIndex }] of GP5_HARDWARE_MODULE_CODES) {
      expect(moduleType).toMatch(/^cat[0-9a-f]+_fx[0-9a-f]+$/);
      expect(isValidPair(categoryIndex, fxIndex), moduleType).toBe(true);
    }
  });

  it('R8: every entry is supported by at least one capture row with the same code and names', () => {
    for (const [moduleType, { categoryIndex, fxIndex }] of GP5_HARDWARE_MODULE_CODES) {
      const supported = GP5_HARDWARE_CAPTURES.some(
        (row) =>
          row.moduleType === moduleType &&
          row.pedalCategory === GP5_MODULE_CATEGORIES[categoryIndex] &&
          row.pedalFxTitle === GP5_MODULE_FX_TITLES[categoryIndex][fxIndex],
      );
      expect(supported, moduleType).toBe(true);
    }
  });

  it('every captured code has an entry', () => {
    const missing = [...new Set(GP5_HARDWARE_CAPTURES.map((r) => r.moduleType))].filter(
      (moduleType) => !GP5_HARDWARE_MODULE_CODES.has(moduleType),
    );
    expect(missing).toEqual([]);
  });
});

describe('coverage (R5, R6)', () => {
  it('R6: every GP5_UNCAPTURABLE_FX entry names a valid pair and has a reason', () => {
    for (const { categoryIndex, fxIndex, reason } of GP5_UNCAPTURABLE_FX) {
      expect(isValidPair(categoryIndex, fxIndex)).toBe(true);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('R5: every canonical pair is resolved by some hardware code or listed as uncapturable', () => {
    const covered = new Set<string>();
    for (const { categoryIndex, fxIndex } of GP5_HARDWARE_MODULE_CODES.values()) {
      covered.add(`${categoryIndex}/${fxIndex}`);
    }
    for (const { categoryIndex, fxIndex } of GP5_UNCAPTURABLE_FX) {
      covered.add(`${categoryIndex}/${fxIndex}`);
    }
    const uncovered: string[] = [];
    GP5_MODULE_FX_TITLES.forEach((titles, c) =>
      titles.forEach((title, i) => {
        if (!covered.has(`${c}/${i}`)) uncovered.push(`${GP5_MODULE_CATEGORIES[c]} / ${title}`);
      }),
    );
    expect(uncovered).toEqual([]);
  });
});

describe('describeModuleType against every capture (R10)', () => {
  it.each(GP5_HARDWARE_CAPTURES.map((row) => [`${row.source} block ${row.blockIndex}`, row] as const))(
    '%s',
    (_label, row) => {
      // `displayTitle` / `slotNumber` are set by `decodeModule` for user-slot codes (CAB and
      // N->S); for every other code they stay absent. `toMatchObject` lets the resolved case
      // carry those extra optional fields without breaking the canonical-name contract.
      expect(describeModuleType(row.moduleType)).toMatchObject({
        kind: 'resolved',
        category: row.pedalCategory,
        fxTitle: row.pedalFxTitle,
      });
    },
  );
});

describe('decodeModule (R11, R12)', () => {
  it('R11: resolves the preset-0 codes by lookup', () => {
    expect(decodeModule(0, 0)).toEqual({ kind: 'resolved', category: 'PRE', fxTitle: 'COMP' });
    expect(decodeModule(7, 4)).toEqual({ kind: 'resolved', category: 'AMP', fxTitle: 'Dark Twin' });
    expect(decodeModule(0xa, 0x100000)).toEqual({
      kind: 'resolved',
      category: 'CAB',
      fxTitle: 'User IR 1-20',
      displayTitle: 'User IR 1',
      slotNumber: 1,
    });
  });

  it('R11: resolves an appended title (MOD / Bias Trem) and a SnapTone code', () => {
    expect(decodeModule(4, 40)).toEqual({ kind: 'resolved', category: 'MOD', fxTitle: 'Bias Trem' });
    expect(decodeModule(0xf, 0)).toEqual({ kind: 'resolved', category: 'N->S', fxTitle: '14DST' });
    expect(decodeModule(0xf, 50)).toEqual({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'User SnapTone',
      displayTitle: 'User SnapTone 1',
      slotNumber: 1,
    });
  });

  it('R12: a code that was a valid positional pair under feature 10 but is not in the table is raw', () => {
    expect(GP5_HARDWARE_MODULE_CODES.has('cat1_fx0')).toBe(false);
    expect(decodeModule(1, 0)).toEqual({ kind: 'raw', cat: 1, fxlow: 0 });
    expect(decodeModule(9, 9)).toEqual({ kind: 'raw', cat: 9, fxlow: 9 });
  });

  it('R12: an N->S code outside both the table and the user-SnapTone range stays raw', () => {
    // [70, 0, 0, 15] is one past the user-SnapTone range (50..69) and has no capture. It used
    // to be the boundary case that caught the `catf_fx33` / `catf_fx34` "Empty" reads; the
    // named NAM ("B5150 3", [50, 0, 0, 15]) still resolves through `GP5_HARDWARE_MODULE_CODES`
    // and the empty slots [51, 0, 0, 15] / [52, 0, 0, 15] still resolve to N->S / Empty.
    expect(decodeModule(0xf, 70)).toEqual({ kind: 'raw', cat: 0xf, fxlow: 70 });
  });

  it('R12: out-of-table, negative and non-integer inputs are raw without throwing', () => {
    expect(decodeModule(99, 0)).toEqual({ kind: 'raw', cat: 99, fxlow: 0 });
    expect(decodeModule(1, 999)).toEqual({ kind: 'raw', cat: 1, fxlow: 999 });
    expect(decodeModule(1, -1)).toEqual({ kind: 'raw', cat: 1, fxlow: -1 });
    expect(decodeModule(7, 4.5)).toEqual({ kind: 'raw', cat: 7, fxlow: 4.5 });
  });
});

// Feature 21 — every CAB user-IR code renders the 1-based slot label and `fxTitle` keeps the
// canonical "User IR 1-20" used by `GP5_FX_CATALOG` and the FX browser (R21.x).
describe('decodeModule CAB user-IR slots (feature 21)', () => {
  it.each(
    Array.from({ length: 20 }, (_, i) => {
      const slot = i + 1;
      return [
          `cata_fx${(0x100000 + i).toString(16)} -> User IR ${slot}`,
          0xa,
          0x100000 + i,
          slot,
        ] as const;
    }),
  )('%s', (_label, cat, fxlow, slot) => {
    expect(decodeModule(cat, fxlow)).toEqual({
      kind: 'resolved',
      category: 'CAB',
      fxTitle: 'User IR 1-20',
      displayTitle: `User IR ${slot}`,
      slotNumber: slot,
    });
  });
});

// Feature 21 — every N->S user-SnapTone code renders the 1-based slot label. The captured
// slot (`catf_fx32`, fxlow 50) was the only table entry in feature 19; the other 19 codes
// resolve via `decodeUserSlot` so all 20 user slots show "User SnapTone N" instead of raw.
// `toMatchObject` lets the test tolerate the table's `catf_fx33` / `catf_fx34` "Empty"
// overrides (the pedal shows "Empty" for empty user slots, so the table maps those two to
// fxIndex 0). The slot-label contract is the `displayTitle` + `slotNumber` pair.
describe('decodeModule N->S user-SnapTone slots (feature 21)', () => {
  it.each(
    Array.from({ length: 20 }, (_, i) => {
      const slot = i + 1;
      return [
          `catf_fx${(0x32 + i).toString(16)} -> User SnapTone ${slot}`,
          0xf,
          0x32 + i,
          slot,
        ] as const;
    }),
  )('%s', (_label, cat, fxlow, slot) => {
    expect(decodeModule(cat, fxlow)).toMatchObject({
      kind: 'resolved',
      category: 'N->S',
      displayTitle: `User SnapTone ${slot}`,
      slotNumber: slot,
    });
  });

  it('captured empty user slots (catf_fx33, catf_fx34) keep the table "Empty" fxTitle', () => {
    expect(decodeModule(0xf, 0x33)).toMatchObject({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'Empty',
      displayTitle: 'User SnapTone 2',
      slotNumber: 2,
    });
    expect(decodeModule(0xf, 0x34)).toMatchObject({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'Empty',
      displayTitle: 'User SnapTone 3',
      slotNumber: 3,
    });
  });
});

describe('decodeModule user-slot field absence (R21)', () => {
  it('resolved non-user-slot entries do not carry displayTitle or slotNumber', () => {
    const result = decodeModule(0, 0);
    expect(result).toEqual({ kind: 'resolved', category: 'PRE', fxTitle: 'COMP' });
    expect(result).not.toHaveProperty('displayTitle');
    expect(result).not.toHaveProperty('slotNumber');
  });

  it('resolveModuleIndices still returns the canonical pair for user-slot codes', () => {
    // fxIndex lookup must stay stable: every CAB user-IR slot keeps fxIndex 20, the captured
    // N->S NAM (`catf_fx32`) keeps fxIndex 51.
    expect(resolveModuleIndices('cata_fx100005')).toEqual({ categoryIndex: 5, fxIndex: 20 });
    expect(resolveModuleIndices('catf_fx32')).toEqual({ categoryIndex: 3, fxIndex: 51 });
    // `catf_fx35..catf_fx45` have no entry in the table — `resolveModuleIndices` only returns
    // canonical pairs for codes with a table entry.
    expect(resolveModuleIndices('catf_fx35')).toBeNull();
  });

  it('describeModuleType propagates displayTitle for user-slot codes', () => {
    expect(describeModuleType('cata_fx100005')).toEqual({
      kind: 'resolved',
      category: 'CAB',
      fxTitle: 'User IR 1-20',
      displayTitle: 'User IR 6',
      slotNumber: 6,
    });
    // Captured NAM slot 1 keeps the canonical "User SnapTone" fxTitle.
    expect(describeModuleType('catf_fx32')).toEqual({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'User SnapTone',
      displayTitle: 'User SnapTone 1',
      slotNumber: 1,
    });
    // `catf_fx33` is in the table mapping to "Empty" (the pedal's display for an empty
    // user-slot). The user-slot range still adds `displayTitle` + `slotNumber` so the chain
    // board / detail panel render the slot label; `fxTitle` stays canonical for the FX
    // browser lookup.
    expect(describeModuleType('catf_fx33')).toEqual({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'Empty',
      displayTitle: 'User SnapTone 2',
      slotNumber: 2,
    });
    // Uncaptured N->S user-slot ranges (no table mapping) still resolve via the user-slot
    // range so the UI can show the slot number for a NAM the user might import later.
    expect(describeModuleType('catf_fx35')).toEqual({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'User SnapTone',
      displayTitle: 'User SnapTone 4',
      slotNumber: 4,
    });
  });
});

describe('resolveModuleIndices (R13, R14)', () => {
  it('R13: returns the canonical pair of a table entry', () => {
    expect(resolveModuleIndices('cat7_fx4')).toEqual({ categoryIndex: 4, fxIndex: 2 });
    expect(resolveModuleIndices('cata_fx100013')).toEqual({ categoryIndex: 5, fxIndex: 20 });
    expect(resolveModuleIndices('catf_fx33')).toEqual({ categoryIndex: 3, fxIndex: 0 });
  });

  it('R13: accepts upper-case hex the same way parseModuleType does', () => {
    expect(resolveModuleIndices('CAT7_FX4')).toEqual({ categoryIndex: 4, fxIndex: 2 });
    expect(resolveModuleIndices('cat7_fxA')).toBeNull();
    expect(resolveModuleIndices('catA_fx1')).toEqual({ categoryIndex: 5, fxIndex: 0 });
  });

  it("R14: returns null for 'empty', unparseable strings and codes with no entry", () => {
    expect(resolveModuleIndices('empty')).toBeNull();
    expect(resolveModuleIndices('garbage')).toBeNull();
    expect(resolveModuleIndices('cat1')).toBeNull();
    expect(resolveModuleIndices('cat1_fx0')).toBeNull();
    expect(resolveModuleIndices('cat99_fx0')).toBeNull();
  });
});

describe('parseModuleType (feature 10 R7, R8)', () => {
  it('parses a single-hex-digit cat/fxlow pair', () => {
    expect(parseModuleType('cat1_fx0')).toEqual({ cat: 1, fxlow: 0 });
  });

  it('parses a multi-hex-digit cat/fxlow pair', () => {
    expect(parseModuleType('cata_fx1b')).toEqual({ cat: 0xa, fxlow: 0x1b });
  });

  it('parses upper-case hex digits (regex is case-insensitive)', () => {
    expect(parseModuleType('catA_fxB')).toEqual({ cat: 0xa, fxlow: 0xb });
  });

  it('returns null for the codec\'s "empty" sentinel', () => {
    expect(parseModuleType('empty')).toBeNull();
  });

  it('returns null for an arbitrary non-matching string', () => {
    expect(parseModuleType('garbage')).toBeNull();
  });

  it('returns null for a malformed cat-only string', () => {
    expect(parseModuleType('cat1')).toBeNull();
  });
});

describe('describeModuleType raw paths (feature 10 R10, R12)', () => {
  it('falls back to { kind: "raw", moduleType } for an unparseable string', () => {
    expect(describeModuleType('empty')).toEqual({ kind: 'raw', moduleType: 'empty' });
  });

  it('falls back for a parseable code with no table entry', () => {
    expect(describeModuleType('cat99_fx0')).toEqual({ kind: 'raw', moduleType: 'cat99_fx0' });
    expect(describeModuleType('cat1_fx999')).toEqual({ kind: 'raw', moduleType: 'cat1_fx999' });
  });
});

describe('reorder evidence (R26)', () => {
  it('the 1e before/after reads put at least one code at two different chain positions', () => {
    const before = GP5_HARDWARE_CAPTURES.filter((r) => r.source.endsWith(' 1e before'));
    const after = GP5_HARDWARE_CAPTURES.filter((r) => r.source.endsWith(' 1e after'));
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(before[0].source.replace(/ 1e before$/, '')).toBe(
      after[0].source.replace(/ 1e after$/, ''),
    );
    const moved = before.filter((b) =>
      after.some((a) => a.moduleType === b.moduleType && a.chainPosition !== b.chainPosition),
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it('the 1e reorder kept every block on the same code (only REC_ORDER changed)', () => {
    const codeByBlock = (suffix: string) =>
      GP5_HARDWARE_CAPTURES.filter((r) => r.source.endsWith(suffix))
        .map((r) => [r.blockIndex, r.moduleType] as const)
        .sort((a, b) => a[0] - b[0]);
    expect(codeByBlock(' 1e after')).toEqual(codeByBlock(' 1e before'));
  });
});

describe('GP5_MODULE_VOCABULARY_STATUS (R17, R18)', () => {
  it('R17: contains HARDWARE-VERIFIED and cites gp5-hardware-captures', () => {
    expect(GP5_MODULE_VOCABULARY_STATUS).toContain('HARDWARE-VERIFIED');
    expect(GP5_MODULE_VOCABULARY_STATUS).toContain('gp5-hardware-captures');
  });

  it('R18: no longer says the mapping is unconfirmed', () => {
    expect(GP5_MODULE_VOCABULARY_STATUS).not.toContain(
      'NOT yet confirmed against real GP-5 hardware',
    );
  });
});
