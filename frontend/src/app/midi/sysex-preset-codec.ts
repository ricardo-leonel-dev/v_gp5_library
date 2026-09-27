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
}

export const SYSEX_PRESET_CODEC = new InjectionToken<SysexPresetCodec>('SYSEX_PRESET_CODEC');
