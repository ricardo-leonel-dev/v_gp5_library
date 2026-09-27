import { Injectable, inject, signal } from '@angular/core';
import type { PedalConnection, PedalConnectionState } from './pedal-connection';
import type { Preset } from './preset';
import { SYSEX_PRESET_CODEC, type SysexPresetCodec } from './sysex-preset-codec';

// See specs/webmidi_gp5_connection/design.md — "Open question" section. Provisional until confirmed
// against real hardware; matches gp5 / gp-5 / gp 5 in any casing.
export const GP5_NAME_PATTERN = /gp[\s-]?5/i;

// Default full-dump timeout. The real GP-5 needs to send a names request and
// 100 body requests back — empirical timing is unverified. Adjust once a real
// hardware run sets a number; tests use vi.useFakeTimers() rather than wait.
export const READ_TIMEOUT_MS = 5000;

type PendingRead = {
  kind: 'read';
  presets: Preset[];
  resolve: (presets: Preset[]) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type PendingWrite = {
  kind: 'write';
};

type PendingOperation = PendingRead | PendingWrite;

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

  private readonly codec = inject<SysexPresetCodec>(SYSEX_PRESET_CODEC);

  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;
  private pendingOperation: PendingOperation | null = null;

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
    input.onmidimessage = (ev) => {
      if (ev.data) this.handleMidiMessage(ev.data);
    };
    this.stateSignal.set('connected');
  }

  async readPresets(): Promise<Preset[]> {
    if (this.connectionState() !== 'connected') {
      throw new Error('not_connected');
    }
    if (this.pendingOperation) {
      throw new Error('request_in_progress');
    }
    if (!this.output) {
      throw new Error('not_connected');
    }

    return new Promise<Preset[]>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (this.pendingOperation?.kind === 'read') {
          this.pendingOperation = null;
          reject(new Error('read_timeout'));
        }
      }, READ_TIMEOUT_MS);

      this.pendingOperation = {
        kind: 'read',
        presets: [],
        resolve: (presets) => {
          clearTimeout(timeoutHandle);
          resolve(presets);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
        timeoutHandle,
      };

      try {
        for (const message of this.codec.encodeReadAllRequest()) {
          this.output!.send(message);
        }
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingOperation = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async writePreset(preset: Preset): Promise<void> {
    if (this.connectionState() !== 'connected') {
      throw new Error('not_connected');
    }
    if (this.pendingOperation) {
      throw new Error('request_in_progress');
    }
    if (!this.output) {
      throw new Error('not_connected');
    }

    this.pendingOperation = { kind: 'write' };
    try {
      for (const message of this.codec.encodeWriteRequest(preset)) {
        this.output!.send(message);
      }
      // Yield once so the operation stays observable to callers who run another
      // read/write in the same synchronous tick (R5 — "request_in_progress").
      await Promise.resolve();
    } finally {
      this.pendingOperation = null;
    }
  }

  private handleMidiMessage(data: Uint8Array): void {
    if (this.pendingOperation?.kind !== 'read') return;
    const pending = this.pendingOperation;
    const result = this.codec.decodeIncomingMessage(data);

    if (result.kind === 'ignored') return;

    if (result.kind === 'invalid') {
      this.pendingOperation = null;
      pending.reject(new Error('invalid_response'));
      return;
    }

    pending.presets.push(result.preset);
    if (result.isLast) {
      const presets = pending.presets;
      this.pendingOperation = null;
      pending.resolve(presets);
    }
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
