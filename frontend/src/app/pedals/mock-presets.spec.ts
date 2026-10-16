import { describe, expect, it } from 'vitest';
import { loadMockPresets } from './mock-presets';

describe('loadMockPresets', () => {
  it('returns at least 5 presets (R35)', () => {
    const presets = loadMockPresets();
    expect(presets.length).toBeGreaterThanOrEqual(5);
  });

  it('includes at least one preset with a non-empty chain and one with an empty chain (R35)', () => {
    const presets = loadMockPresets();
    const empty = presets.filter((p) => p.chain.length === 0);
    const nonEmpty = presets.filter((p) => p.chain.length > 0);
    expect(empty.length).toBeGreaterThanOrEqual(1);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(1);
  });

  it('every entry has a unique slot', () => {
    const presets = loadMockPresets();
    const slots = presets.map((p) => p.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('every entry has a non-empty name', () => {
    const presets = loadMockPresets();
    for (const p of presets) {
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});