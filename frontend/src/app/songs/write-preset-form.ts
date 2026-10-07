// F5 `import_preset_to_pedal` — pure form logic. No Angular DI, no I/O, no
// `TestBed`. Every helper returns new arrays/strings/objects; never aliases
// inputs. The dialog component owns the dialog state; this file owns the
// invariants of the write request (R5, R13, R17, R21, R28-R33) and the
// error-key mapping (R9-R12, R34, R37, R39).
//
// Byte layout reminder: the `.prst` file the backend returns is 507 bytes.
// The body is bytes 0x29..0x1FA (466 bytes), the name field is 0x19..0x28
// (16 bytes). The dialog uses `decodePrstFile` to validate and re-slice
// those offsets into a `Preset` (R7, R13). Other than the slicing in
// `decodeSongPreset` (the only `.prst` reader outside `src/app/midi/`),
// every helper here treats the bytes as opaque.

import { HttpErrorResponse } from '@angular/common/http';
import { GP5_BODY_LEN, NAME_LEN } from '../midi/gp5-sysex-preset-codec';
import { decodePrstFile, type PrstFileError } from '../midi/gp5-prst-file';
import type { Preset } from '../midi/preset';

// ---------- Domain shape (R5) ----------

// Reference to a single preset inside a song, ordered by `sortOrder`
// (0-based, F26 R31). The dialog stores one of these per row.
export interface WriteablePresetRef {
  readonly songId: string;
  readonly sortOrder: number;
  readonly presetId: string;
  readonly name: string;
  readonly position: number; // 1-based, for the UI row number
}

// A user's request: send the song's presets (all of them in order) to
// consecutive slots starting at `startSlot`, either one preset (R28) or
// every preset in `sortOrder` order (R29).
export interface WriteRequest {
  readonly entries: readonly WriteablePresetRef[];
  readonly startSlot: number;
  readonly writeAll: boolean;
}

// The plan is the resolved, per-item list of `(ref, targetSlot)` plus a
// derived range for the summary line (R22, R38).
export interface WritePlan {
  readonly items: readonly { ref: WriteablePresetRef; targetSlot: number }[];
  readonly fromSlot: number;
  readonly toSlot: number;
}

// ---------- Planning (R5, R13, R15-R19, R20-R24, R28-R33) ----------

// Error keys from `planWrites` (R17, R21, R33).
export type PlanError = 'out_of_range' | 'not_enough_room' | 'empty';

export function targetSlotsFor(
  writeAll: boolean,
  n: number,
  m: number,
): number[] {
  if (n === 0) return [];
  if (!writeAll) return [m];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(m + i);
  return out;
}

// `planWrites` is the single gate for R21/R33. It throws `Error(name)`
// for impossible requests, returns a `WritePlan` otherwise. The dialog's
// `plan` computed signal wraps this in a try/catch and returns `null`,
// so the disabled-state (R16, R17, R21) comes from the catch.
export function planWrites(req: WriteRequest): WritePlan {
  if (req.entries.length === 0) throw new Error('empty');
  const m = req.startSlot;
  if (!Number.isInteger(m) || m < 0 || m > 99) throw new Error('out_of_range');
  if (req.writeAll) {
    const n = req.entries.length;
    if (m + n - 1 > 99) {
      throw new Error('not_enough_room');
    }
  }
  const slots = targetSlotsFor(req.writeAll, req.entries.length, m);
  const items = req.entries.map((ref, i) => ({ ref, targetSlot: slots[i]! }));
  return {
    items,
    fromSlot: slots[0]!,
    toSlot: slots[slots.length - 1]!,
  };
}

// ---------- Bytes → Preset (R7, R8, R13) ----------

// Result of `decodeSongPreset` for the dialog's failure banner (R8).
export type DecodeSongPresetError = PrstFileError;

export type DecodeSongPresetResult =
  | {
      ok: true;
      preset: Preset;
      body: Uint8Array; // 466-byte fresh copy
      nameField: Uint8Array; // 16-byte fresh copy
    }
  | { ok: false; error: DecodeSongPresetError };

// Pure, never throws. Slices the body and name field out of the bytes
// `SongsApi.getSongPreset` returned. `decodePrstFile` already enforces the
// 507-byte length, header, sentinel and CRC, so once it accepts the bytes
// both slices below are guaranteed to be full length.
export function decodeSongPreset(bytes: Uint8Array): DecodeSongPresetResult {
  const decoded = decodePrstFile(bytes);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error };
  }
  const body = decoded.bytes.subarray(0x29, 0x29 + GP5_BODY_LEN).slice();
  const nameField = decoded.bytes.subarray(0x19, 0x19 + NAME_LEN).slice();
  const preset: Preset = {
    slot: 0, // placeholder; the dialog sets the real slot per write (R13)
    name: decoded.name,
    chain: decoded.chain, // R13
    raw: { body, nameField },
  };
  return { ok: true, preset, body, nameField };
}

// ---------- Error mapping (R9-R12, R34, R37, R39) ----------

// Translation keys consumed by the dialog template. Each one resolves
// through the i18n namespaces the design defined (`writeToPedal.errors.*`).
export type WriteErrorKey =
  | 'writeToPedal.errors.pedalDisconnected'
  | 'writeToPedal.errors.busy'
  | 'writeToPedal.errors.timeout'
  | 'writeToPedal.errors.writeNotConfirmed'
  | 'writeToPedal.errors.writeRejected'
  | 'writeToPedal.errors.connectionLost'
  | 'writeToPedal.errors.unexpected'
  | 'writeToPedal.errors.songNotFound'
  | 'writeToPedal.errors.sessionExpired'
  | 'writeToPedal.errors.network'
  | 'writeToPedal.errors.corruptFile';

export function mapFetchError(err: unknown): WriteErrorKey {
  if (!(err instanceof HttpErrorResponse)) {
    return 'writeToPedal.errors.unexpected';
  }
  switch (err.status) {
    case 404:
      return 'writeToPedal.errors.songNotFound';
    case 401:
      return 'writeToPedal.errors.sessionExpired';
    case 0:
      return 'writeToPedal.errors.network';
    default:
      return 'writeToPedal.errors.unexpected';
  }
}

// `WebMidiPedalConnection.writePreset` rejects with one of these string
// messages (see `WebMidiPedalConnection.writePreset` / `sendWithStopAndWait`
// and the existing preset-browser page translations in `presetBrowser.*`).
export function mapPedalWriteError(err: unknown): WriteErrorKey {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  switch (message) {
    case 'not_connected':
      return 'writeToPedal.errors.pedalDisconnected';
    case 'request_in_progress':
      return 'writeToPedal.errors.busy';
    case 'read_timeout':
      return 'writeToPedal.errors.timeout';
    case 'write_timeout':
      return 'writeToPedal.errors.writeNotConfirmed';
    case 'write_rejected':
      return 'writeToPedal.errors.writeRejected';
    default:
      return 'writeToPedal.errors.unexpected';
  }
}
