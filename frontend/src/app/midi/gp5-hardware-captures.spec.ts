import { describe, expect, it } from 'vitest';
import { GP5_HARDWARE_CAPTURES } from './gp5-hardware-captures';
import { GP5_MODULE_CATEGORIES, GP5_MODULE_FX_TITLES } from './gp5-module-vocabulary';

// Plain Vitest (no TestBed): fixture integrity checks for the feature 19 capture record.

function codecModuleType(rawBytes: readonly [number, number, number, number]): string {
  const fxlow = rawBytes[0] | (rawBytes[1] << 8) | (rawBytes[2] << 16);
  return `cat${rawBytes[3].toString(16)}_fx${fxlow.toString(16)}`;
}

function rowLabel(row: (typeof GP5_HARDWARE_CAPTURES)[number]): string {
  return `${row.source} block ${row.blockIndex}`;
}

describe('GP5_HARDWARE_CAPTURES shape (R1)', () => {
  it('is non-empty and every row has in-range block/chain indices and 4 byte values', () => {
    expect(GP5_HARDWARE_CAPTURES.length).toBeGreaterThan(0);
    for (const row of GP5_HARDWARE_CAPTURES) {
      expect(row.source, rowLabel(row)).toMatch(/^\d{4}-\d{2}-\d{2} preset \d+ .+/);
      expect(row.blockIndex, rowLabel(row)).toBeGreaterThanOrEqual(0);
      expect(row.blockIndex, rowLabel(row)).toBeLessThanOrEqual(9);
      expect(row.chainPosition, rowLabel(row)).toBeGreaterThanOrEqual(0);
      expect(row.chainPosition, rowLabel(row)).toBeLessThanOrEqual(9);
      expect(row.rawBytes, rowLabel(row)).toHaveLength(4);
      for (const b of row.rawBytes) {
        expect(Number.isInteger(b) && b >= 0 && b <= 255, rowLabel(row)).toBe(true);
      }
    }
  });

  it('never repeats a blockIndex or a chainPosition within one read', () => {
    const bySource = new Map<string, (typeof GP5_HARDWARE_CAPTURES)[number][]>();
    for (const row of GP5_HARDWARE_CAPTURES) {
      bySource.set(row.source, [...(bySource.get(row.source) ?? []), row]);
    }
    for (const [source, rows] of bySource) {
      expect(new Set(rows.map((r) => r.blockIndex)).size, source).toBe(rows.length);
      expect(new Set(rows.map((r) => r.chainPosition)).size, source).toBe(rows.length);
    }
  });
});

describe('GP5_HARDWARE_CAPTURES integrity (R2, R3)', () => {
  it('R2: every moduleType equals the codec formula applied to rawBytes', () => {
    for (const row of GP5_HARDWARE_CAPTURES) {
      expect(row.moduleType, rowLabel(row)).toBe(codecModuleType(row.rawBytes));
    }
  });

  it('R3: every (pedalCategory, pedalFxTitle) names an existing canonical pair', () => {
    for (const row of GP5_HARDWARE_CAPTURES) {
      const categoryIndex = GP5_MODULE_CATEGORIES.indexOf(row.pedalCategory);
      expect(categoryIndex, rowLabel(row)).toBeGreaterThanOrEqual(0);
      expect(GP5_MODULE_FX_TITLES[categoryIndex], rowLabel(row)).toContain(row.pedalFxTitle);
    }
  });
});

describe('GP5_HARDWARE_CAPTURES preset-0 rows from 2026-09-28 (R4)', () => {
  const rows28 = GP5_HARDWARE_CAPTURES.filter((r) => r.source.startsWith('2026-09-28 preset 0'));

  it.each([
    ['cat0_fx0', 'PRE', 'COMP'],
    ['cat7_fx4', 'AMP', 'Dark Twin'],
    ['cata_fx100000', 'CAB', 'User IR 1-20'],
  ])('contains %s -> %s / %s', (moduleType, category, fxTitle) => {
    expect(rows28).toContainEqual(
      expect.objectContaining({ moduleType, pedalCategory: category, pedalFxTitle: fxTitle }),
    );
  });
});

describe('GP5_HARDWARE_CAPTURES conflicts (R9)', () => {
  it('R9: no moduleType is recorded with two different (category, title) pairs', () => {
    const seen = new Map<string, Set<string>>();
    for (const row of GP5_HARDWARE_CAPTURES) {
      const names = seen.get(row.moduleType) ?? new Set<string>();
      names.add(`${row.pedalCategory} / ${row.pedalFxTitle}`);
      seen.set(row.moduleType, names);
    }
    const conflicts = [...seen]
      .filter(([, names]) => names.size > 1)
      .map(([moduleType, names]) => `${moduleType}: ${[...names].join(' vs ')}`);
    expect(conflicts).toEqual([]);
  });
});
