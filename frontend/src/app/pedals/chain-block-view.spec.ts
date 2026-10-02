import { describe, expect, it } from 'vitest';
import {
  categoryStyle,
  DIMMED_CLASS,
  displayCategoryCode,
  formatParameterValue,
  NEUTRAL_BLOCK_STYLE,
  toChainBlockView,
} from './chain-block-view';

// Plain Vitest (no TestBed) — this module is pure logic / data.

describe('formatParameterValue (R9, R10)', () => {
  it('R9: rounds to at most 2 decimals without trailing zeros', () => {
    expect(formatParameterValue(3)).toBe('3');
    expect(formatParameterValue(0.5)).toBe('0.5');
    expect(formatParameterValue(1.23456)).toBe('1.23');
    expect(formatParameterValue(-0.004)).toBe('0');
  });

  it('R10: returns "—" for null, NaN, +Infinity, -Infinity', () => {
    expect(formatParameterValue(null)).toBe('—');
    expect(formatParameterValue(Number.NaN)).toBe('—');
    expect(formatParameterValue(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatParameterValue(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});

describe('categoryStyle (R13, R14)', () => {
  // Verbatim from design.md "Visual direction -> Category palette". Pinned to
  // categoryStyle() so this test catches any drift between the two.
  const expected = [
    'bg-cyan-700 text-white dark:bg-cyan-600',
    'bg-yellow-400 text-yellow-950 dark:bg-yellow-300',
    'bg-green-700 text-white dark:bg-green-600',
    'bg-rose-600 text-white dark:bg-rose-500',
    'bg-amber-500 text-amber-950 dark:bg-amber-400',
    'bg-stone-600 text-stone-50 dark:bg-stone-500',
    'bg-zinc-300 text-zinc-900 dark:bg-zinc-400',
    'bg-violet-600 text-white dark:bg-violet-500',
    'bg-sky-500 text-sky-950 dark:bg-sky-400',
    'bg-blue-800 text-white dark:bg-blue-700',
  ];

  // Drive every assertion off the actual categoryStyle() output, so the
  // test fails when the function diverges from the design.md palette.
  const actual = Array.from({ length: 10 }, (_, i) => categoryStyle(i));

  it('R13: 10 distinct bg-* classes', () => {
    const bgClasses = actual.map((s) => s.match(/bg-[a-z]+-\d+/)?.[0] ?? '');
    expect(new Set(bgClasses).size).toBe(10);
  });

  it('R13: every category bg differs from the neutral block\'s bg', () => {
    const neutralBg = NEUTRAL_BLOCK_STYLE.match(/bg-[a-z]+-\d+/)?.[0] ?? null;
    expect(neutralBg).toBeNull(); // neutral uses bg-transparent, not a color
    for (const s of actual) {
      expect(s).not.toBe(NEUTRAL_BLOCK_STYLE);
    }
  });

  it('R13: an out-of-range index returns the neutral style', () => {
    expect(categoryStyle(42)).toBe(NEUTRAL_BLOCK_STYLE);
    expect(categoryStyle(-1)).toBe(NEUTRAL_BLOCK_STYLE);
  });

  it('R14: every category style contains a dark: class', () => {
    for (const s of actual) {
      expect(s).toMatch(/dark:/);
    }
    expect(NEUTRAL_BLOCK_STYLE).toMatch(/dark:/);
  });

  it('palette is pinned to design.md "Visual direction"', () => {
    expect(actual).toEqual(expected);
  });
});

describe('DIMMED_CLASS', () => {
  it('is the literal Tailwind class opacity-40', () => {
    expect(DIMMED_CLASS).toBe('opacity-40');
  });
});

describe('displayCategoryCode', () => {
  it('rewrites N->S to N→S', () => {
    expect(displayCategoryCode('N->S')).toBe('N→S');
  });

  it('returns every other code unchanged', () => {
    for (const code of ['NR', 'PRE', 'DST', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB']) {
      expect(displayCategoryCode(code)).toBe(code);
    }
  });
});

describe('toChainBlockView (R16, R19)', () => {
  it('R16: resolves cat0_fx0 (PRE COMP) to a resolved view with category index 1 and FX index 0', () => {
    const view = toChainBlockView(
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      0,
    );
    expect(view.kind).toBe('resolved');
    if (view.kind !== 'resolved') return;
    expect(view.categoryIndex).toBe(1);
    expect(view.fxIndex).toBe(0);
    expect(view.categoryCode).toBe('PRE');
    expect(view.fxTitle).toBe('COMP');
    expect(view.style).toBe(categoryStyle(1));
    expect(view.enabled).toBe(true);
  });

  it('R19: maps "empty" to an unknown view with the neutral style', () => {
    const view = toChainBlockView(
      { moduleType: 'empty', enabled: false, parameters: {} },
      2,
    );
    expect(view.kind).toBe('unknown');
    if (view.kind !== 'unknown') return;
    expect(view.style).toBe(NEUTRAL_BLOCK_STYLE);
    expect(view.position).toBe(2);
    expect(view.enabled).toBe(false);
  });

  it('R19: maps an out-of-table cat/fxlow pair to an unknown view with the neutral style', () => {
    const view = toChainBlockView(
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
      3,
    );
    expect(view.kind).toBe('unknown');
    if (view.kind !== 'unknown') return;
    expect(view.style).toBe(NEUTRAL_BLOCK_STYLE);
    expect(view.enabled).toBe(true);
  });
});

describe('toChainBlockView slot number (feature 21)', () => {
  it('propagates slotNumber for a CAB user-IR slot (cata_fx100005 = slot 6)', () => {
    const view = toChainBlockView(
      { moduleType: 'cata_fx100005', enabled: true, parameters: {} },
      0,
    );
    expect(view.kind).toBe('resolved');
    if (view.kind !== 'resolved') return;
    expect(view.fxTitle).toBe('User IR 1-20');
    expect(view.slotNumber).toBe(6);
  });

  it('propagates slotNumber for the captured N->S user-SnapTone slot (catf_fx32 = slot 1)', () => {
    const view = toChainBlockView(
      { moduleType: 'catf_fx32', enabled: true, parameters: {} },
      0,
    );
    expect(view.kind).toBe('resolved');
    if (view.kind !== 'resolved') return;
    expect(view.fxTitle).toBe('User SnapTone');
    expect(view.slotNumber).toBe(1);
  });

  it('propagates slotNumber for an uncaptured N->S user-SnapTone slot (catf_fx35 = slot 4)', () => {
    const view = toChainBlockView(
      { moduleType: 'catf_fx35', enabled: true, parameters: {} },
      0,
    );
    expect(view.kind).toBe('resolved');
    if (view.kind !== 'resolved') return;
    expect(view.fxTitle).toBe('User SnapTone');
    expect(view.slotNumber).toBe(4);
  });

  it('leaves slotNumber absent for non-user-slot resolved entries', () => {
    const view = toChainBlockView(
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      0,
    );
    expect(view.kind).toBe('resolved');
    if (view.kind !== 'resolved') return;
    expect(view.slotNumber).toBeUndefined();
    expect(view.fxTitle).toBe('COMP');
  });
});