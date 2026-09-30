import { Injectable, inject, signal } from '@angular/core';
import type { PedalConnection, PedalConnectionState } from './pedal-connection';
import type { Preset } from './preset';
import {
  SYSEX_PRESET_CODEC,
  type SysexDecodeResult,
  type SysexPresetCodec,
} from './sysex-preset-codec';

// See specs/webmidi_gp5_connection/design.md — "Open question" section. Provisional until confirmed
// against real hardware; matches gp5 / gp-5 / gp 5 in any casing.
export const GP5_NAME_PATTERN = /gp[\s-]?5/i;

// Settle after selecting a slot before requesting its body.
export const READ_SETTLE_MS = 300;

// Deadline for ONE read step (the names phase completing, or one body
// arriving) — NOT one flat deadline for the whole 100-slot read. It resets
// every time a chunk of progress is observed (see waitForStep below), so a
// slow-but-still-responding pedal is never penalized for the cumulative time
// a full 100-slot dump takes.
export const READ_STEP_TIMEOUT_MS = 5000;

/**
 * Why readPresets could not put the pedal back on the preset that was active
 * before the read: no slot's body matches it (e.g. it had unsaved edits), or
 * several do (duplicate presets). The pedal then stays on the last slot read.
 */
export type PresetRestoreWarning = 'restore_no_match' | 'restore_ambiguous';

type PendingRead = {
  kind: 'read';
  // Set per read-step by waitForStep; handleMidiMessage forwards every
  // decoded message to it while a read is in flight.
  onMessage: ((result: SysexDecodeResult) => void) | null;
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
  private readonly restoreWarningSignal = signal<PresetRestoreWarning | null>(null);
  // Outcome of the last readPresets() call's restore step; null when the
  // pre-read preset was restored (or no read has completed yet).
  readonly restoreWarning = this.restoreWarningSignal.asReadonly();

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

    const pending: PendingRead = { kind: 'read', onMessage: null };
    this.pendingOperation = pending;
    this.restoreWarningSignal.set(null);

    try {
      const [namesRequest, ...bodyRequests] = this.codec.encodeReadAllRequest();

      this.output.send(namesRequest);
      await this.waitForStep(pending, () => (this.codec.isAwaitingNames() ? undefined : true));

      // Reading slots switches the pedal's active preset, so capture the
      // active one first (no selection) to restore it afterwards.
      this.output!.send(this.codec.encodeActivePresetRequest());
      await this.waitForStep(pending, (result) => (result.kind === 'activePreset' ? true : undefined));

      // The body request carries no slot number — the pedal replies with
      // its active preset — so each slot is selected first and given
      // READ_SETTLE_MS to settle before its body is requested.
      const presets: Preset[] = [];
      for (let slot = 0; slot < bodyRequests.length; slot++) {
        this.output!.send(this.codec.encodeSelectPreset(slot));
        await this.delay(READ_SETTLE_MS);
        this.output!.send(bodyRequests[slot]);
        presets.push(
          await this.waitForStep(pending, (result) =>
            result.kind === 'preset' ? result.preset : undefined,
          ),
        );
      }

      // Restore only on an unambiguous match; otherwise the pedal stays on
      // the last slot read and the caller is told why.
      const matches = this.codec.slotsMatchingActivePreset();
      if (matches.length === 1) {
        this.output!.send(this.codec.encodeSelectPreset(matches[0]));
      } else {
        this.restoreWarningSignal.set(matches.length === 0 ? 'restore_no_match' : 'restore_ambiguous');
      }
      return presets;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      this.pendingOperation = null;
    }
  }

  // Resolves with the first non-undefined value `complete` returns for a
  // decoded message. The per-step deadline resets on every message
  // processed, so a reply spread across many chunks doesn't trip a timeout
  // meant for stalls, not total duration.
  private waitForStep<T>(
    pending: PendingRead,
    complete: (result: SysexDecodeResult) => T | undefined,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout>;
      const armTimeout = () => {
        clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          pending.onMessage = null;
          reject(new Error('read_timeout'));
        }, READ_STEP_TIMEOUT_MS);
      };
      pending.onMessage = (result) => {
        if (result.kind === 'invalid') {
          clearTimeout(timeoutHandle);
          pending.onMessage = null;
          reject(new Error('invalid_response'));
          return;
        }
        const value = complete(result);
        if (value !== undefined) {
          clearTimeout(timeoutHandle);
          pending.onMessage = null;
          resolve(value);
          return;
        }
        armTimeout();
      };
      armTimeout();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    const result = this.codec.decodeIncomingMessage(data);
    this.pendingOperation.onMessage?.(result);
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
