// Glyph table for the per-category pedal icon used by `app-pedal-glyph`,
// plus the per-category chassis metadata the board block uses to render
// a Valeton-GP-5-style silhouette per category.
//
// Each path is drawn in a `0 0 16 16` viewBox; the component renders it
// with `fill="none" stroke="currentColor" stroke-width="1.5"
// stroke-linecap="round" stroke-linejoin="round"`, so the same color
// tokens the chassis uses carry over to the glyph. Paths, knob counts,
// slider counts and `kind` are pinned to design.md's "Glyph table" via
// R3/R4 and the matching tests in `pedal-glyphs.spec.ts`.

export type PedalGlyphKind = 'stompbox' | 'amp' | 'cabinet' | 'eq';

export interface PedalGlyph {
  readonly code: string;
  readonly path: string;
  readonly knobs: 0 | 1 | 2 | 3 | 4 | 5;
  readonly sliders: 0 | 4;
  readonly kind: PedalGlyphKind;
}

export const PEDAL_GLYPHS: readonly PedalGlyph[] = [
  // 0 NR — gate: wave then flat line, 1 knob, stompbox chassis
  { code: 'NR', path: 'M1 8q2-5 4 0t4 0M9 4v8M9 8h6', knobs: 1, sliders: 0, kind: 'stompbox' },
  // 1 PRE — compressor: arrows squeezing a bar, 1 knob, stompbox
  {
    code: 'PRE',
    path: 'M1 8h4M3 6l2 2-2 2M15 8h-4M13 6l-2 2 2 2M8 3v10',
    knobs: 1,
    sliders: 0,
    kind: 'stompbox',
  },
  // 2 DST — clipped square wave, 3 knobs, stompbox
  { code: 'DST', path: 'M1 11V5h4v6h4V5h4v6h2', knobs: 3, sliders: 0, kind: 'stompbox' },
  // 3 N->S — SnapTone capture: brackets round a wave, 5 knobs, stompbox
  {
    code: 'N->S',
    path: 'M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3M4 8q2-4 4 0t4 0',
    knobs: 5,
    sliders: 0,
    kind: 'stompbox',
  },
  // 4 AMP — amp head with horizontal vent slits, no knobs/sliders, amp chassis
  {
    code: 'AMP',
    path: 'M3 4h10v8H3zM5 6h6M5 8h6M5 10h6',
    knobs: 0,
    sliders: 0,
    kind: 'amp',
  },
  // 5 CAB — speaker cone, no knobs/sliders, cabinet chassis
  {
    code: 'CAB',
    path: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0-10 0M6.5 8a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    knobs: 0,
    sliders: 0,
    kind: 'cabinet',
  },
  // 6 EQ — three faders, no knobs, 4 sliders, eq chassis
  {
    code: 'EQ',
    path: 'M4 2v12M8 2v12M12 2v12M2.5 10h3M6.5 5h3M10.5 8h3',
    knobs: 0,
    sliders: 4,
    kind: 'eq',
  },
  // 7 MOD — sine wave, 3 knobs, stompbox
  { code: 'MOD', path: 'M1 8q1.75-5 3.5 0t3.5 0 3.5 0 3.5 0', knobs: 3, sliders: 0, kind: 'stompbox' },
  // 8 DLY — decaying repeats, 3 knobs, stompbox
  { code: 'DLY', path: 'M2 3v10M6 5v6M10 6.5v3M14 7.5v1', knobs: 3, sliders: 0, kind: 'stompbox' },
  // 9 RVB — concentric arcs, 4 knobs (2x2), stompbox
  {
    code: 'RVB',
    path: 'M3 13a5 5 0 0 1 10 0M1 13a7 7 0 0 1 14 0M5 13a3 3 0 0 1 6 0',
    knobs: 4,
    sliders: 0,
    kind: 'stompbox',
  },
];