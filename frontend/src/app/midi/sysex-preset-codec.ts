import { InjectionToken } from '@angular/core';
import type { Preset } from './preset';

/**
 * Outcome of decoding one raw MIDI message via `SysexPresetCodec.decodeIncomingMessage`.
 * The three-way split is what lets `WebMidiPedalConnection` implement
 * accumulation / rejection / ignoring (R7/R8/R10/R11) without knowing anything
 * about SysEx bytes itself.
 */
export type SysexDecodeResult =
  | { kind: 'preset'; preset: Preset; isLast: boolean }
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string };

export interface SysexPresetCodec {
  encodeReadAllRequest(): Uint8Array[];
  decodeIncomingMessage(message: Uint8Array): SysexDecodeResult;
  encodeWriteRequest(preset: Preset): Uint8Array[];
  /**
   * A MIDI Program Change (0xC0, slot) selecting `slot` as the device's active
   * preset. Real GP-5 hardware requires sending this — and letting it settle —
   * before each body-read request: the body request itself carries no slot
   * number, so the device replies with whatever slot is currently active. See
   * WebMidiPedalConnection.readPresets for the settle-then-request sequencing.
   */
  encodeProgramChange(slot: number): Uint8Array;
  /**
   * True while a read-all dump started by encodeReadAllRequest() is still
   * accumulating the names reply; false once the body-read phase has started
   * (or no dump is active). WebMidiPedalConnection waits for this to go false
   * before sending the first Program Change/body request — an in-flight names
   * reply and an early body reply are otherwise indistinguishable to
   * decodeIncomingMessage's internal reassembly state and could corrupt it.
   */
  isAwaitingNames(): boolean;
}

export const SYSEX_PRESET_CODEC = new InjectionToken<SysexPresetCodec>('SYSEX_PRESET_CODEC');
