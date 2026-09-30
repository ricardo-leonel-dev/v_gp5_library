import { InjectionToken } from '@angular/core';
import type { Preset } from './preset';

/**
 * Outcome of decoding one raw MIDI message via `SysexPresetCodec.decodeIncomingMessage`.
 * The split is what lets `WebMidiPedalConnection` implement
 * accumulation / rejection / ignoring (R7/R8/R10/R11) without knowing anything
 * about SysEx bytes itself. `activePreset` is the reply to
 * `encodeActivePresetRequest()`: the codec keeps its body for
 * `slotsMatchingActivePreset()` instead of decoding it into a slot.
 */
export type SysexDecodeResult =
  | { kind: 'preset'; preset: Preset; isLast: boolean }
  | { kind: 'activePreset' }
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string };

export interface SysexPresetCodec {
  encodeReadAllRequest(): Uint8Array[];
  decodeIncomingMessage(message: Uint8Array): SysexDecodeResult;
  encodeWriteRequest(preset: Preset): Uint8Array[];
  /**
   * Makes `slot` the device's active preset. The body request carries no slot
   * number, so WebMidiPedalConnection.readPresets sends this — and lets it
   * settle — before each body request.
   */
  encodeSelectPreset(slot: number): Uint8Array;
  /**
   * A body request for whatever preset is active right now, sent once after
   * the names phase and before any slot is selected. Its reply decodes as
   * `{ kind: 'activePreset' }` and does not count as a slot.
   */
  encodeActivePresetRequest(): Uint8Array;
  /**
   * Slots of the current read-all dump whose raw body is byte-identical to the
   * active-preset body captured via `encodeActivePresetRequest()`. Empty when
   * no active body was captured.
   */
  slotsMatchingActivePreset(): number[];
  /**
   * True while a read-all dump started by encodeReadAllRequest() is still
   * accumulating the names reply; false once the body-read phase has started
   * (or no dump is active). WebMidiPedalConnection waits for this to go false
   * before sending any body request — an in-flight names reply and an early
   * body reply are otherwise indistinguishable to decodeIncomingMessage's
   * internal reassembly state and could corrupt it.
   */
  isAwaitingNames(): boolean;
}

export const SYSEX_PRESET_CODEC = new InjectionToken<SysexPresetCodec>('SYSEX_PRESET_CODEC');
