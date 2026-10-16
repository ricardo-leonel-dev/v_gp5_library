import { describe, expect, test } from 'vitest';
import { TONELAB_TLDLXAMP_PRST_HEX, tonelabPrstBytes } from './gp5-tonelab-prst.fixture';

describe('gp5-tonelab-prst.fixture (R20)', () => {
  test('decodes to 507 bytes, GP-5 magic at 0x00..0x03, 0x01 at 0x12', () => {
    const bytes = tonelabPrstBytes();
    expect(bytes).toHaveLength(507);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x47, 0x50, 0x2d, 0x35]); // "GP-5"
    expect(bytes[0x12]).toBe(0x01);
  });

  test('tonelabPrstBytes yields a distinct buffer on every call', () => {
    const a = tonelabPrstBytes();
    const b = tonelabPrstBytes();
    expect(a).not.toBe(b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test('hex constant matches the bytes the file contains', () => {
    expect(TONELAB_TLDLXAMP_PRST_HEX).toHaveLength(507 * 2);
    const bytes = tonelabPrstBytes();
    for (let i = 0; i < bytes.length; i++) {
      const pair = TONELAB_TLDLXAMP_PRST_HEX.slice(i * 2, i * 2 + 2);
      expect(pair).toBe(bytes[i].toString(16).padStart(2, '0'));
    }
  });
});