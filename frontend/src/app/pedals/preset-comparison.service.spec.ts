import { describe, expect, it } from 'vitest';
import { PresetComparisonStore } from './preset-comparison.service';

describe('PresetComparisonStore', () => {
  it('starts with an empty selectedSlots set (R18)', () => {
    const store = new PresetComparisonStore();
    expect(store.selectedSlots().size).toBe(0);
  });

  it('add() puts a slot in the set and yields a new Set instance', () => {
    const store = new PresetComparisonStore();
    const initial = store.selectedSlots();
    store.add(3);
    const after = store.selectedSlots();
    expect(after.has(3)).toBe(true);
    expect(after.size).toBe(1);
    expect(after).not.toBe(initial);
  });

  it('add() is idempotent (re-adding the same slot does not change the size)', () => {
    const store = new PresetComparisonStore();
    store.add(3);
    store.add(3);
    expect(store.selectedSlots().size).toBe(1);
  });

  it('toggle adds when missing, removes when present (R18)', () => {
    const store = new PresetComparisonStore();
    store.toggle(3);
    expect(store.selectedSlots().has(3)).toBe(true);
    store.toggle(3);
    expect(store.selectedSlots().has(3)).toBe(false);
  });

  it('remove() takes a slot out of the set', () => {
    const store = new PresetComparisonStore();
    store.add(3);
    store.add(5);
    store.remove(3);
    const set = store.selectedSlots();
    expect(set.has(3)).toBe(false);
    expect(set.has(5)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('remove() of a slot not in the set is a no-op', () => {
    const store = new PresetComparisonStore();
    store.remove(3);
    expect(store.selectedSlots().size).toBe(0);
  });

  it('clear() empties the set (R18)', () => {
    const store = new PresetComparisonStore();
    store.add(3);
    store.add(5);
    store.clear();
    expect(store.selectedSlots().size).toBe(0);
  });

  it('every change yields a new Set instance (signal notification contract)', () => {
    const store = new PresetComparisonStore();
    const a = store.selectedSlots();
    store.add(3);
    const b = store.selectedSlots();
    store.add(5);
    const c = store.selectedSlots();
    store.remove(3);
    const d = store.selectedSlots();
    store.toggle(7);
    const e = store.selectedSlots();
    store.clear();
    const f = store.selectedSlots();
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(c).not.toBe(d);
    expect(d).not.toBe(e);
    expect(e).not.toBe(f);
  });
});