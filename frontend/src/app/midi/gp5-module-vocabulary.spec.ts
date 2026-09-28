import { describe, expect, it } from 'vitest';
import {
  decodeModule,
  describeModuleType,
  GP5_MODULE_CATEGORIES,
  GP5_MODULE_FX_TITLES,
  GP5_MODULE_VOCABULARY_STATUS,
  parseModuleType,
} from './gp5-module-vocabulary';

// Plain Vitest (no TestBed) — this module is pure logic with no DI, same
// category as `WebMidiPedalConnection.isSupported` per `docs/conventions.md`'s
// Tests section.

describe('GP5_MODULE_CATEGORIES (R1)', () => {
  it('has length 10', () => {
    expect(GP5_MODULE_CATEGORIES).toHaveLength(10);
  });

  it('matches the manual p.40 NR..RVB sequence exactly', () => {
    expect(GP5_MODULE_CATEGORIES).toEqual([
      'NR',
      'PRE',
      'DST',
      'N->S',
      'AMP',
      'CAB',
      'EQ',
      'MOD',
      'DLY',
      'RVB',
    ]);
  });
});

describe('GP5_MODULE_FX_TITLES (R2, R3)', () => {
  it('has exactly 10 per-category arrays', () => {
    expect(GP5_MODULE_FX_TITLES).toHaveLength(10);
  });

  it('lengths match R3: [1, 10, 10, 1, 32, 21, 5, 8, 10, 10]', () => {
    expect(GP5_MODULE_FX_TITLES.map((arr) => arr.length)).toEqual([
      1, 10, 10, 1, 32, 21, 5, 8, 10, 10,
    ]);
  });

  it('NR has the single expected entry', () => {
    expect(GP5_MODULE_FX_TITLES[0]).toEqual(['Gate']);
  });

  it('PRE first/last entries match the manual pp.20-21', () => {
    expect(GP5_MODULE_FX_TITLES[1][0]).toBe('COMP');
    expect(GP5_MODULE_FX_TITLES[1][9]).toBe('Detune');
  });

  it('DST first/last entries match the manual pp.22-23', () => {
    expect(GP5_MODULE_FX_TITLES[2][0]).toBe('Green OD');
    expect(GP5_MODULE_FX_TITLES[2][9]).toBe('Bass OD');
  });

  it('N->S has the single expected entry', () => {
    expect(GP5_MODULE_FX_TITLES[3]).toEqual(['Empty']);
  });

  it('EQ first/last entries match the manual p.31', () => {
    expect(GP5_MODULE_FX_TITLES[6][0]).toBe('Guitar EQ 1');
    expect(GP5_MODULE_FX_TITLES[6][4]).toBe('Mess EQ');
  });

  it('RVB last entry matches the manual p.36', () => {
    expect(GP5_MODULE_FX_TITLES[9][9]).toBe('Sweet Space');
  });
});

describe('decodeModule (R4, R5, R6)', () => {
  it('R4: resolves a known (cat, fxlow) pair', () => {
    expect(decodeModule(1, 0)).toEqual({
      kind: 'resolved',
      category: 'PRE',
      fxTitle: 'COMP',
    });
  });

  it('R4: resolves the last entry of the last category', () => {
    expect(decodeModule(9, 9)).toEqual({
      kind: 'resolved',
      category: 'RVB',
      fxTitle: 'Sweet Space',
    });
  });

  it('R5: returns raw fallback for an out-of-table cat', () => {
    expect(decodeModule(99, 0)).toEqual({
      kind: 'raw',
      cat: 99,
      fxlow: 0,
    });
  });

  it('R6: returns raw fallback for an out-of-range fxlow', () => {
    expect(decodeModule(1, 999)).toEqual({
      kind: 'raw',
      cat: 1,
      fxlow: 999,
    });
  });

  it('R6: returns raw fallback for a negative fxlow (out-of-range)', () => {
    expect(decodeModule(1, -1)).toEqual({
      kind: 'raw',
      cat: 1,
      fxlow: -1,
    });
  });
});

describe('parseModuleType (R7, R8)', () => {
  it('R7: parses a single-hex-digit cat/fxlow pair', () => {
    expect(parseModuleType('cat1_fx0')).toEqual({ cat: 1, fxlow: 0 });
  });

  it('R7: parses a multi-hex-digit cat/fxlow pair', () => {
    expect(parseModuleType('cata_fx1b')).toEqual({ cat: 0xa, fxlow: 0x1b });
  });

  it('R7: parses upper-case hex digits (regex is case-insensitive)', () => {
    expect(parseModuleType('catA_fxB')).toEqual({ cat: 0xa, fxlow: 0xb });
  });

  it('R8: returns null for the codec\'s "empty" sentinel', () => {
    expect(parseModuleType('empty')).toBeNull();
  });

  it('R8: returns null for an arbitrary non-matching string', () => {
    expect(parseModuleType('garbage')).toBeNull();
  });

  it('R8: returns null for a malformed cat-only string', () => {
    expect(parseModuleType('cat1')).toBeNull();
  });
});

describe('describeModuleType (R9, R10)', () => {
  it('R9: resolves a parseable, resolvable moduleType end-to-end', () => {
    expect(describeModuleType('cat1_fx0')).toEqual({
      kind: 'resolved',
      category: 'PRE',
      fxTitle: 'COMP',
    });
  });

  it('R10: falls back to { kind: "raw" moduleType } for an unparseable string', () => {
    expect(describeModuleType('empty')).toEqual({
      kind: 'raw',
      moduleType: 'empty',
    });
  });

  it('R10: falls back to { kind: "raw" moduleType } for a parseable but unresolved (cat, fxlow) pair', () => {
    expect(describeModuleType('cat99_fx0')).toEqual({
      kind: 'raw',
      moduleType: 'cat99_fx0',
    });
  });

  it('R10: falls back when parseable but fxlow is out of range for a known cat', () => {
    expect(describeModuleType('cat1_fx999')).toEqual({
      kind: 'raw',
      moduleType: 'cat1_fx999',
    });
  });
});

describe('GP5_MODULE_VOCABULARY_STATUS (R11)', () => {
  it('is a non-empty string', () => {
    expect(typeof GP5_MODULE_VOCABULARY_STATUS).toBe('string');
    expect(GP5_MODULE_VOCABULARY_STATUS.length).toBeGreaterThan(0);
  });

  it('contains "HYPOTHESIS"', () => {
    expect(GP5_MODULE_VOCABULARY_STATUS).toContain('HYPOTHESIS');
  });

  it('contains "gp-5-manual.pdf" (the citation convention)', () => {
    expect(GP5_MODULE_VOCABULARY_STATUS).toContain('gp-5-manual.pdf');
  });
});