import type { PedalConnection } from './pedal-connection';

/**
 * Talks to the GP-5 over the Web MIDI API. Supported in Chrome, Edge, Opera,
 * Samsung Internet, and Firefox 108+ — never in Safari (macOS or iOS), which
 * has no roadmap to support it. Always check isSupported() before calling
 * anything else here.
 */
export class WebMidiPedalConnection implements PedalConnection {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async connect(): Promise<void> {
    throw new Error('not implemented yet — see the webmidi_gp5_connection feature');
  }

  async readPresets(): Promise<unknown[]> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }

  async writePreset(_preset: unknown): Promise<void> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }
}
