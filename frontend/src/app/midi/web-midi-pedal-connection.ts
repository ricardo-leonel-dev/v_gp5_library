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

// Post-Program-Change settle before requesting a slot's body. Matches the
// hardware-verified progress/gp5_webmidi_body_read_probe.html ("POST_PC
// settle, matches scan_bank.py/select_patch.py").
export const READ_SETTLE_MS = 300;

// Deadline for ONE read step (the names phase completing, or one slot's body
// arriving) — NOT one flat deadline for the whole 100-slot read. It resets
// every time a chunk of progress is observed (see waitForNamesComplete /
// waitForSlotPreset below), so a slow-but-still-responding pedal is never
// penalized for the cumulative time a full 100-slot dump takes.
export const READ_STEP_TIMEOUT_MS = 5000;

type PendingRead = {
  kind: 'read';
  // Set per read-step by whichever of waitForNamesComplete/waitForSlotPreset
  // is currently awaiting; handleMidiMessage forwards every decoded message
  // to it while a read is in flight.
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

    try {
      const [namesRequest, ...bodyRequests] = this.codec.encodeReadAllRequest();

      this.output.send(namesRequest);
      await this.waitForNamesComplete(pending);

      // The body request is byte-identical for every slot — it does NOT
      // carry a slot byte. The slot travels only on the MIDI Program
      // Change fired below; the PC + READ_SETTLE_MS handshake is the
      // load-bearing protocol piece that the GP-5 hardware requires to
      // reply at all. F23 (2026-09-30) established this as the protocol:
      // F20's hypothesis that the body request needed a slot byte at
      // payload position 2 was disproven by Ricardo's hardware test of
      // F20 (and F22's restoration of the PC + settle on top of the
      // slot byte — both timed out: "La lectura de presets ha
      // expirado"). F23 reverts F20's slot byte and re-establishes
      // PC + settle alone as sufficient.
      //
      // Ground truth: `progress/gp5_webmidi_body_read_probe.html` —
      // lines 115-119 are the `buildRequest(selector)` helper used for
      // the body read (byte 2 = 0x00, no slot byte on the wire);
      // lines 340-345 are the per-slot sequence
      // (`output.send([0xc0, slot & 0x7f])` + `setTimeout(300)` +
      // `buildRequest(BODY_SEL)`). The slot is carried on the MIDI
      // Program Change only, never on the SysEx.
      const presets: Preset[] = [];
      for (let slot = 0; slot < bodyRequests.length; slot++) {
        this.output!.send(this.codec.encodeProgramChange(slot));
        await this.delay(READ_SETTLE_MS);
        this.output!.send(bodyRequests[slot]);
        presets.push(await this.waitForSlotPreset(pending));
      }

      // The last iteration's Program Change (slot = 99 for a full dump)
      // leaves the pedal on the last slot read. This is the feature-12
      // UX side effect, restored in F22 along with the per-slot PC +
      // settle handshake and re-established as the load-bearing protocol
      // piece in F23 after F23 reverted the F20 slot-byte hypothesis.
      // Callers that want to capture and restore the preset active
      // before the read need to track it themselves — there is no
      // protocol-level query for the current slot.
      return presets;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      this.pendingOperation = null;
    }
  }

  // Waits for the names-read phase (started by the first message from
  // encodeReadAllRequest) to finish. The per-step deadline resets on every
  // message processed, so a names reply spread across many chunks doesn't
  // trip a timeout meant for stalls, not total duration.
  private waitForNamesComplete(pending: PendingRead): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
        if (!this.codec.isAwaitingNames()) {
          clearTimeout(timeoutHandle);
          pending.onMessage = null;
          resolve();
          return;
        }
        armTimeout();
      };
      armTimeout();
    });
  }

  // Waits for the body reply for the slot just requested to fully decode into
  // a Preset. Same reset-on-progress deadline as waitForNamesComplete.
  private waitForSlotPreset(pending: PendingRead): Promise<Preset> {
    return new Promise<Preset>((resolve, reject) => {
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
        if (result.kind === 'preset') {
          clearTimeout(timeoutHandle);
          pending.onMessage = null;
          resolve(result.preset);
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
