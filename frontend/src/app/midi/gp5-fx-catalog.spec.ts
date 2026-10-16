import { describe, expect, it } from 'vitest';
// The project doesn't ship @types/node, so the Node built-ins used to read
// the i18n JSON files are runtime-available (Vitest's Node environment) but
// need @ts-expect-error to silence TypeScript.
// @ts-expect-error - node types not in tsconfig
import { readFileSync } from 'fs';
// @ts-expect-error - node types not in tsconfig
import { join } from 'path';
import {
  describeParameters,
  GP5_FX_CATALOG,
  GP5_FX_PARAMETER_MAPPING_STATUS,
} from './gp5-fx-catalog';
import {
  GP5_HARDWARE_MODULE_CODES,
  GP5_MODULE_CATEGORIES,
  GP5_MODULE_FX_TITLES,
} from './gp5-module-vocabulary';

// Plain Vitest (no TestBed) — this module is pure logic with no DI, same
// category as `gp5-module-vocabulary.ts` per `docs/conventions.md`.

function loadTranslations(lang: 'en' | 'es'): Record<string, unknown> {
  // Vitest's Node environment exposes `process` at runtime, but the project
  // doesn't ship @types/node, so reference it through the same loose import.
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
  const path = join(cwd, 'public', 'i18n', `${lang}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('GP5_FX_CATALOG shape (R1, R2, R3, R4)', () => {
  it('R1: has exactly 10 category arrays', () => {
    expect(GP5_FX_CATALOG).toHaveLength(10);
  });

  it('R1: GP5_FX_CATALOG[c].length === GP5_MODULE_FX_TITLES[c].length for every c', () => {
    expect(GP5_MODULE_CATEGORIES).toHaveLength(10);
    for (let c = 0; c < 10; c++) {
      expect(GP5_FX_CATALOG[c].length).toBe(GP5_MODULE_FX_TITLES[c].length);
    }
  });

  it('R2: every entry has 1 to 8 parameterNames', () => {
    for (const category of GP5_FX_CATALOG) {
      for (const entry of category) {
        expect(entry.parameterNames.length).toBeGreaterThanOrEqual(1);
        expect(entry.parameterNames.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('R2: spot-check one FX per category', () => {
    expect(GP5_FX_CATALOG[0][0].parameterNames).toEqual(['THRE']);
    expect(GP5_FX_CATALOG[1][0].parameterNames).toEqual(['Sustain', 'VOL']);
    expect(GP5_FX_CATALOG[2][0].parameterNames).toEqual(['Gain', 'Tone', 'VOL']);
    expect(GP5_FX_CATALOG[3][0].parameterNames).toEqual(['Gain', 'VOL', 'Bass', 'Middle', 'Treble']);
    expect(GP5_FX_CATALOG[4][0].parameterNames).toEqual(['Gain', 'Tone', 'VOL']);
    expect(GP5_FX_CATALOG[5][0].parameterNames).toEqual(['VOL']);
    expect(GP5_FX_CATALOG[6][0].parameterNames).toEqual(['125Hz', '400Hz', '800Hz', '1.6kHz', '4kHz', 'VOL']);
    expect(GP5_FX_CATALOG[7][0].parameterNames).toEqual(['Depth', 'Rate', 'Tone']);
    expect(GP5_FX_CATALOG[8][0].parameterNames).toEqual(['Mix', 'Time', 'F.Back', 'Trail']);
    expect(GP5_FX_CATALOG[9][0].parameterNames).toEqual(['Mix', 'Decay', 'Damp', 'Trail']);
  });

  it('R2: UK 50JP expands Gain 1/2 to Gain 1, Gain 2', () => {
    expect(GP5_FX_CATALOG[4][8].parameterNames).toEqual([
      'Gain 1', 'Gain 2', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble',
    ]);
  });

  it('R2: Ring Echo has the longest list (7 entries)', () => {
    expect(GP5_FX_CATALOG[8][7].parameterNames).toEqual([
      'Mix', 'Time', 'F.Back', 'R-Mix', 'Freq', 'Tone', 'Trail',
    ]);
  });

  it('R2: EV 51 lists PRES last', () => {
    expect(GP5_FX_CATALOG[4][20].parameterNames).toEqual([
      'Gain', 'VOL', 'Bass', 'Middle', 'Treble', 'PRES',
    ]);
  });

  it('R2: Mess EQ has 5 frequency bands and no VOL', () => {
    expect(GP5_FX_CATALOG[6][4].parameterNames).toEqual([
      '80Hz', '240Hz', '750Hz', '2.2kHz', '6.6kHz',
    ]);
  });

  it('R2: Detune expands Dry/Wet to Dry, Wet', () => {
    expect(GP5_FX_CATALOG[1][9].parameterNames).toEqual(['Detune', 'Dry', 'Wet']);
  });

  it('R3: every manualPage is within 20-36', () => {
    for (const category of GP5_FX_CATALOG) {
      for (const entry of category) {
        expect(entry.manualPage).toBeGreaterThanOrEqual(20);
        expect(entry.manualPage).toBeLessThanOrEqual(36);
      }
    }
  });

  it('R3: spot-check manualPage for Gate, AC Pre2, AMPG 4x10, Sweet Space', () => {
    expect(GP5_FX_CATALOG[0][0].manualPage).toBe(20);
    expect(GP5_FX_CATALOG[4][31].manualPage).toBe(30);
    expect(GP5_FX_CATALOG[5][19].manualPage).toBe(31);
    expect(GP5_FX_CATALOG[9][9].manualPage).toBe(36);
  });

  it('R4: every descriptionKey equals gp5Fx.c<c>.f<i>', () => {
    for (let c = 0; c < GP5_FX_CATALOG.length; c++) {
      for (let i = 0; i < GP5_FX_CATALOG[c].length; i++) {
        expect(GP5_FX_CATALOG[c][i].descriptionKey).toBe(`gp5Fx.c${c}.f${i}`);
      }
    }
  });
});

describe('catalog entries for appended titles (R23)', () => {
  it('R23: MOD tremolos have their p.33 controls', () => {
    expect(GP5_FX_CATALOG[7].slice(8).map((e) => [e.parameterNames, e.manualPage])).toEqual([
      [['Depth', 'Rate'], 33],
      [['Depth', 'Rate', 'VOL'], 33],
      [['Depth', 'Rate', 'VOL', 'Bias'], 33],
    ]);
  });

  it('R23: every SnapTone (factory and User SnapTone) uses the p.23 N->S controls', () => {
    const snapTones = GP5_FX_CATALOG[3].slice(1);
    expect(snapTones).toHaveLength(GP5_MODULE_FX_TITLES[3].length - 1);
    for (const entry of snapTones) {
      expect(entry.parameterNames).toEqual(['Gain', 'VOL', 'Bass', 'Middle', 'Treble']);
      expect(entry.manualPage).toBe(23);
    }
  });
});

describe('describeParameters (R6, R7, R8)', () => {
  it('R6: a resolved FX returns one labelled entry per name with values from p<k>', () => {
    // cat7_fx3 = AMP / Bellman 59N (captured) -> Gain, PRES, VOL, Bass, Middle, Treble
    const result = describeParameters('cat7_fx3', {
      p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6, p6: 7, p7: 8,
    });
    expect(result).toEqual([
      { label: 'Gain', value: 1 },
      { label: 'PRES', value: 2 },
      { label: 'VOL', value: 3 },
      { label: 'Bass', value: 4 },
      { label: 'Middle', value: 5 },
      { label: 'Treble', value: 6 },
    ]);
  });

  it('R7: missing p<k> keys map to value: null', () => {
    // cat7_fx2f = AMP / UK 50JP (captured) -> Gain 1, Gain 2, PRES, VOL, Bass, Middle, Treble
    // Pass only p0..p3
    const result = describeParameters('cat7_fx2f', {
      p0: 10, p1: 20, p2: 30, p3: 40,
    });
    expect(result).toEqual([
      { label: 'Gain 1', value: 10 },
      { label: 'Gain 2', value: 20 },
      { label: 'PRES', value: 30 },
      { label: 'VOL', value: 40 },
      { label: 'Bass', value: null },
      { label: 'Middle', value: null },
      { label: 'Treble', value: null },
    ]);
  });

  it('R8: \'empty\' returns raw entries sorted numerically, not lexically', () => {
    const result = describeParameters('empty', {
      p0: 1, p1: 2, p10: 10, p2: 3,
    });
    expect(result.map((r) => r.label)).toEqual(['p0', 'p1', 'p2', 'p10']);
    expect(result).toEqual([
      { label: 'p0', value: 1 },
      { label: 'p1', value: 2 },
      { label: 'p2', value: 3 },
      { label: 'p10', value: 10 },
    ]);
  });

  it('R8: cat99_fx0 (parseable but unresolved) returns raw entries', () => {
    const result = describeParameters('cat99_fx0', {
      p5: 50, p0: 1, p2: 2,
    });
    expect(result.map((r) => r.label)).toEqual(['p0', 'p2', 'p5']);
  });

  it('every hardware code in the table gets its canonical entry\'s labels', () => {
    for (const [moduleType, { categoryIndex, fxIndex }] of GP5_HARDWARE_MODULE_CODES) {
      const result = describeParameters(moduleType, { p0: 1, p1: 2 });
      const names = GP5_FX_CATALOG[categoryIndex][fxIndex].parameterNames;
      expect(result.map((r) => r.label), moduleType).toEqual(names);
      expect(result[0].value).toBe(1);
    }
  });
});

describe('describeParameters by hardware code (R15, R16)', () => {
  it('R15: cat7_fx4 (AMP / Dark Twin) is labelled with Dark Twin\'s names, not a positional entry', () => {
    const result = describeParameters('cat7_fx4', { p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6 });
    expect(result.map((r) => r.label)).toEqual(GP5_FX_CATALOG[4][2].parameterNames);
    expect(result.map((r) => r.label)).toEqual(['Gain', 'VOL', 'Bass', 'Middle', 'Treble', 'Bright']);
    expect(result[5]).toEqual({ label: 'Bright', value: 6 });
  });

  it('R15: a factory SnapTone code gets the N->S controls', () => {
    const result = describeParameters('catf_fx0', { p0: 1 });
    expect(result.map((r) => r.label)).toEqual(['Gain', 'VOL', 'Bass', 'Middle', 'Treble']);
  });

  it('R16: a code absent from the table returns raw entries, even if it was a valid positional pair', () => {
    const result = describeParameters('cat1_fx0', { p1: 2, p0: 1 });
    expect(result).toEqual([
      { label: 'p0', value: 1 },
      { label: 'p1', value: 2 },
    ]);
  });
});

describe('GP5_FX_PARAMETER_MAPPING_STATUS (R11, R12)', () => {
  it('is a non-empty string', () => {
    expect(typeof GP5_FX_PARAMETER_MAPPING_STATUS).toBe('string');
    expect(GP5_FX_PARAMETER_MAPPING_STATUS.length).toBeGreaterThan(0);
  });

  it('contains "HYPOTHESIS"', () => {
    expect(GP5_FX_PARAMETER_MAPPING_STATUS).toContain('HYPOTHESIS');
  });

  it('contains "gp-5-manual.pdf"', () => {
    expect(GP5_FX_PARAMETER_MAPPING_STATUS).toContain('gp-5-manual.pdf');
  });
});

describe('i18n descriptionKey coverage (R5)', () => {
  const en = loadTranslations('en') as Record<string, unknown>;
  const es = loadTranslations('es') as Record<string, unknown>;

  it('R24: every appended title (N->S 1-51, MOD 8-10) has an es and an en description', () => {
    const appended = [
      ...GP5_FX_CATALOG[3].slice(1),
      ...GP5_FX_CATALOG[7].slice(8),
    ];
    expect(appended).toHaveLength(54);
    for (const { descriptionKey } of appended) {
      for (const lang of [en, es]) {
        const value = getNested(lang, descriptionKey);
        expect(typeof value, descriptionKey).toBe('string');
        expect((value as string).length, descriptionKey).toBeGreaterThan(0);
      }
    }
    expect(getNested(en, 'gp5Fx.c3.f51')).toBe('SnapTone file imported by the user.');
    expect(getNested(es, 'gp5Fx.c3.f51')).toBe('Archivo SnapTone importado por el usuario.');
    expect(getNested(en, 'gp5Fx.c3.f1')).toContain('NATAS');
  });

  it('every descriptionKey resolves to a non-empty string in both JSON files', () => {
    for (let c = 0; c < GP5_FX_CATALOG.length; c++) {
      for (let i = 0; i < GP5_FX_CATALOG[c].length; i++) {
        const key = GP5_FX_CATALOG[c][i].descriptionKey;
        const enVal = getNested(en, key);
        const esVal = getNested(es, key);
        expect(typeof enVal).toBe('string');
        expect((enVal as string).length).toBeGreaterThan(0);
        expect(typeof esVal).toBe('string');
        expect((esVal as string).length).toBeGreaterThan(0);
      }
    }
  });
});

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}