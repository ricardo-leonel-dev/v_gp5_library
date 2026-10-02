import { describe, expect, it } from 'vitest';
import { PresetExportSelection } from './preset-export-selection.service';

describe('PresetExportSelection', () => {
  it('starts with an empty markedSlots set (R26)', () => {
    const store = new PresetExportSelection();
    expect(store.markedSlots().size).toBe(0);
  });

  it('toggle adds a slot to the set (R27) and yields a new Set instance', () => {
    const store = new PresetExportSelection();
    const initial = store.markedSlots();
    store.toggle(3);
    const after = store.markedSlots();
    expect(after.has(3)).toBe(true);
    expect(after.size).toBe(1);
    // Signal notifies only when the value reference changes; the spec
    // documents that we replace (not mutate) the Set.
    expect(after).not.toBe(initial);
  });

  it('toggle adds multiple slots (R27)', () => {
    const store = new PresetExportSelection();
    store.toggle(3);
    store.toggle(5);
    const set = store.markedSlots();
    expect(set.has(3)).toBe(true);
    expect(set.has(5)).toBe(true);
    expect(set.size).toBe(2);
  });

  it('toggle removes a slot from the set (R28)', () => {
    const store = new PresetExportSelection();
    store.toggle(3);
    store.toggle(5);
    store.toggle(3);
    const set = store.markedSlots();
    expect(set.has(3)).toBe(false);
    expect(set.has(5)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('clear() empties the set (R29)', () => {
    const store = new PresetExportSelection();
    store.toggle(3);
    store.toggle(5);
    store.clear();
    const set = store.markedSlots();
    expect(set.size).toBe(0);
  });

  it('every change yields a new Set instance (signal notification contract)', () => {
    const store = new PresetExportSelection();
    const a = store.markedSlots();
    store.toggle(3);
    const b = store.markedSlots();
    store.toggle(5);
    const c = store.markedSlots();
    store.toggle(3);
    const d = store.markedSlots();
    store.clear();
    const e = store.markedSlots();
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(c).not.toBe(d);
    expect(d).not.toBe(e);
  });
});