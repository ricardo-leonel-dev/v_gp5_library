import { describe, expect, test } from 'vitest';
import { GP5_CAPTURED_BODIES, capturedBodyBytes } from './gp5-captured-bodies.fixture';

describe('gp5-captured-bodies.fixture (R20)', () => {
  test('exposes 10 entries with the expected slot/name pairs from corrida 3', () => {
    expect(GP5_CAPTURED_BODIES).toHaveLength(10);
    expect(GP5_CAPTURED_BODIES.map((e) => [e.slot, e.name])).toEqual([
      [0, 'TL DLX AMP'],
      [1, 'TL AC3 AMP'],
      [2, 'TL PLX AMP'],
      [3, 'Power Lead'],
      [4, 'Heavy Dist'],
      [5, 'Test Metal'],
      [6, 'Smooth LD'],
      [7, 'Blues Man'],
      [8, 'Big Jazz'],
      [9, 'RA METAL1'],
    ]);
  });

  test('every entry parses to exactly 466 bytes', () => {
    for (let i = 0; i < GP5_CAPTURED_BODIES.length; i++) {
      expect(capturedBodyBytes(i)).toHaveLength(466);
    }
  });

  test('capturedBodyBytes returns a distinct buffer on repeated reads', () => {
    const a = capturedBodyBytes(0);
    const b = capturedBodyBytes(0);
    expect(a).not.toBe(b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});