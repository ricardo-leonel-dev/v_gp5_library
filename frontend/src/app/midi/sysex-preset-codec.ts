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

/**
 * The pedal's reply to one write chunk: `ack` = accepted, send the next chunk;
 * `nak` = rejected, the pedal drops the rest of the transfer.
 */
export type WriteReply = 'ack' | 'nak';

export interface SysexPresetCodec {
  encodeReadAllRequest(): Uint8Array[];
  decodeIncomingMessage(message: Uint8Array): SysexDecodeResult;
  encodeWriteRequest(preset: Preset): Uint8Array[];
  /**
   * Classifies `message` as the pedal's reply to one write chunk (`ack` /
   * `nak`), or null for anything else (e.g. its patch-change notification).
   * WebMidiPedalConnection.writePreset sends chunk i+1 only after chunk i's
   * `ack` (stop-and-wait) and aborts on `nak`.
   */
  decodeWriteReply(message: Uint8Array): WriteReply | null;
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
