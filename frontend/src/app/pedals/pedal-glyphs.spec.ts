import { describe, expect, it } from 'vitest';
import { PEDAL_GLYPHS, type PedalGlyphKind } from './pedal-glyphs';

// Design.md "Glyph table" transcribed verbatim into PEDAL_GLYPHS (R3, R4).
// The test pins every path, knob count, slider count, and chassis kind the
// same way feature 14 pins the category palette, so a silent drift fails
// this test before anyone notices visually.
const EXPECTED: ReadonlyArray<{
  code: string;
  path: string;
  knobs: 0 | 1 | 2 | 3 | 4 | 5;
  sliders: 0 | 4;
  kind: PedalGlyphKind;
}> = [
  { code: 'NR', path: 'M1 8q2-5 4 0t4 0M9 4v8M9 8h6', knobs: 1, sliders: 0, kind: 'stompbox' },
  {
    code: 'PRE',
    path: 'M1 8h4M3 6l2 2-2 2M15 8h-4M13 6l-2 2 2 2M8 3v10',
    knobs: 1,
    sliders: 0,
    kind: 'stompbox',
  },
  { code: 'DST', path: 'M1 11V5h4v6h4V5h4v6h2', knobs: 3, sliders: 0, kind: 'stompbox' },
  {
    code: 'N->S',
    path: 'M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3M4 8q2-4 4 0t4 0',
    knobs: 5,
    sliders: 0,
    kind: 'stompbox',
  },
  {
    code: 'AMP',
    path: 'M3 4h10v8H3zM5 6h6M5 8h6M5 10h6',
    knobs: 0,
    sliders: 0,
    kind: 'amp',
  },
  {
    code: 'CAB',
    path: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0-10 0M6.5 8a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    knobs: 0,
    sliders: 0,
    kind: 'cabinet',
  },
  {
    code: 'EQ',
    path: 'M4 2v12M8 2v12M12 2v12M2.5 10h3M6.5 5h3M10.5 8h3',
    knobs: 0,
    sliders: 4,
    kind: 'eq',
  },
  { code: 'MOD', path: 'M1 8q1.75-5 3.5 0t3.5 0 3.5 0 3.5 0', knobs: 3, sliders: 0, kind: 'stompbox' },
  { code: 'DLY', path: 'M2 3v10M6 5v6M10 6.5v3M14 7.5v1', knobs: 3, sliders: 0, kind: 'stompbox' },
  {
    code: 'RVB',
    path: 'M3 13a5 5 0 0 1 10 0M1 13a7 7 0 0 1 14 0M5 13a3 3 0 0 1 6 0',
    knobs: 4,
    sliders: 0,
    kind: 'stompbox',
  },
];

describe('PEDAL_GLYPHS', () => {
  it('has exactly 10 entries (R1)', () => {
    expect(PEDAL_GLYPHS).toHaveLength(10);
  });

  it('every path is pairwise distinct (R2)', () => {
    const paths = PEDAL_GLYPHS.map((g) => g.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('paths match the design.md glyph table verbatim (R3)', () => {
    for (let c = 0; c < 10; c++) {
      expect(PEDAL_GLYPHS[c].path).toBe(EXPECTED[c].path);
    }
  });

  it('knob counts match the design.md glyph table verbatim (R4)', () => {
    for (let c = 0; c < 10; c++) {
      expect(PEDAL_GLYPHS[c].knobs).toBe(EXPECTED[c].knobs);
    }
  });

  it('slider counts match the design.md glyph table verbatim (R4)', () => {
    for (let c = 0; c < 10; c++) {
      expect(PEDAL_GLYPHS[c].sliders).toBe(EXPECTED[c].sliders);
    }
  });

  it('chassis kinds match the design.md glyph table verbatim (R4)', () => {
    for (let c = 0; c < 10; c++) {
      expect(PEDAL_GLYPHS[c].kind).toBe(EXPECTED[c].kind);
    }
  });

  it('codes match the design.md glyph table verbatim', () => {
    for (let c = 0; c < 10; c++) {
      expect(PEDAL_GLYPHS[c].code).toBe(EXPECTED[c].code);
    }
  });

  it('only EQ has sliders, and EQ has no circular knobs (R4 invariant)', () => {
    for (let c = 0; c < 10; c++) {
      const g = PEDAL_GLYPHS[c];
      if (g.kind === 'eq') {
        expect(g.sliders).toBe(4);
        expect(g.knobs).toBe(0);
      } else {
        expect(g.sliders).toBe(0);
      }
    }
  });
});