import { describe, expect, test, vi, afterEach } from 'vitest';
import { WebMidiPedalConnection } from './web-midi-pedal-connection';

describe('WebMidiPedalConnection.isSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('returns true when the browser exposes navigator.requestMIDIAccess', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() });

    const connection = new WebMidiPedalConnection();

    expect(connection.isSupported()).toBe(true);
  });

  test('returns false on browsers without Web MIDI (e.g. Safari)', () => {
    vi.stubGlobal('navigator', {});

    const connection = new WebMidiPedalConnection();

    expect(connection.isSupported()).toBe(false);
  });
});
