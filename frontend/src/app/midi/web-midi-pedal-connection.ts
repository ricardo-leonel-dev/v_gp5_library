import { Injectable, signal } from '@angular/core';
import type { PedalConnection, PedalConnectionState } from './pedal-connection';

// See specs/webmidi_gp5_connection/design.md — "Open question" section. Provisional until confirmed
// against real hardware; matches gp5 / gp-5 / gp 5 in any casing.
export const GP5_NAME_PATTERN = /gp[\s-]?5/i;

/**
 * Talks to the GP-5 over the Web MIDI API. Supported in Chrome, Edge, Opera,
 * Samsung Internet, and Firefox 108+ — never in Safari (macOS or iOS), which
 * has no roadmap to support it. Always check isSupported() before calling
 * anything else here.
 */
@Injectable({ providedIn: 'root' })
export class WebMidiPedalConnection implements PedalConnection {
  private readonly stateSignal = signal<PedalConnectionState>('not-connected');
  readonly connectionState = this.stateSignal.asReadonly();

  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('unsupported');
    }
    this.stateSignal.set('connecting');

    let access: MIDIAccess;
    try {
      access = await navigator.requestMIDIAccess({ sysex: true });
    } catch {
      this.stateSignal.set('error');
      throw new Error('midi_access_denied');
    }

    const input = this.findGp5Port(access.inputs);
    const output = this.findGp5Port(access.outputs);
    if (!input || !output) {
      this.stateSignal.set('error');
      throw new Error('gp5_not_found');
    }

    this.input = input;
    this.output = output;
    input.onstatechange = () => this.handlePortStateChange();
    output.onstatechange = () => this.handlePortStateChange();
    this.stateSignal.set('connected');
  }

  async readPresets(): Promise<unknown[]> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }

  async writePreset(_preset: unknown): Promise<void> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }

  private findGp5Port<T extends MIDIInput | MIDIOutput>(
    ports: ReadonlyMap<string, T>,
  ): T | null {
    for (const port of ports.values()) {
      if (GP5_NAME_PATTERN.test(port.name ?? '')) return port;
    }
    return null;
  }

  private handlePortStateChange(): void {
    if (this.stateSignal() !== 'connected') return;
    if (this.input?.state === 'disconnected' || this.output?.state === 'disconnected') {
      this.input = null;
      this.output = null;
      this.stateSignal.set('not-connected');
    }
  }
}
