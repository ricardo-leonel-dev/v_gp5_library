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

describe('describeParameters (R6, R7, R8)', () => {
  it('R6: a resolved FX returns one labelled entry per name with values from p<k>', () => {
    // cat4_fx1 = Bellman 59N -> Gain, PRES, VOL, Bass, Middle, Treble
    const result = describeParameters('cat4_fx1', {
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
    // cat4_fx8 = UK 50JP -> Gain 1, Gain 2, PRES, VOL, Bass, Middle, Treble (7 names)
    // Pass only p0..p3
    const result = describeParameters('cat4_fx8', {
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