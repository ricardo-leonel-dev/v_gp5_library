import { describe, expect, it } from 'vitest';
import { SelectedPresetStore } from './selected-preset.service';
import type { Preset } from '../midi/preset';

describe('SelectedPresetStore', () => {
  it('starts with a null selected preset (R1)', () => {
    const store = new SelectedPresetStore();
    expect(store.selectedPreset()).toBeNull();
  });

  it('sets the selected preset when select() is called (R2)', () => {
    const store = new SelectedPresetStore();
    const preset: Preset = {
      slot: 1,
      name: 'Crunch',
      chain: [{ moduleType: 'amp', enabled: true, parameters: {} }],
    };

    store.select(preset);

    expect(store.selectedPreset()).toBe(preset);
  });

  it('replaces the previous selected preset on a second select() call (R2)', () => {
    const store = new SelectedPresetStore();
    const first: Preset = { slot: 1, name: 'Crunch', chain: [] };
    const second: Preset = { slot: 2, name: 'Clean', chain: [] };

    store.select(first);
    store.select(second);

    expect(store.selectedPreset()).toBe(second);
  });

  it('clear() resets the selected preset to null (R20)', () => {
    const store = new SelectedPresetStore();
    const preset: Preset = { slot: 1, name: 'Crunch', chain: [] };

    store.select(preset);
    expect(store.selectedPreset()).toBe(preset);

    store.clear();
    expect(store.selectedPreset()).toBeNull();
  });
});
