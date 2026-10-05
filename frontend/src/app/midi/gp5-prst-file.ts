// F4 `save_preset_dialog` — the only place in `src/` that knows the `.prst`
// layout. Every offset, length, the header constant, the sentinel, the name
// field, the body, and the CRC range live here as named constants. No other
// file in `src/` reads `.prst` bytes; consumers either hand a `Preset` with
// `raw` to `encodePrstFile` or hand picked bytes to `decodePrstFile` and
// carry the returned `bytes` opaquely to the request body.
//
// Layout (OQ1, confirmed against the ToneLab reference file
// `/Users/ricardoaguilar/Documents/Development/v_gp5_library/external_docs/02-TLDLXAMP.prst`;
// matches codec `PRST_LEN` / `NAME_OFF`):
//
//   offset  len  content                                 encode  decode check
//   ------  ---  --------------------------------------  ------  ----------------
//   -       507  whole file                              R5        R12 `wrong_length`
//   0x00    20   `GP5_PRST_HEADER`                      R8        R13 `bad_header`
//   0x14     1   CRC-8/SMBUS over 0x15..0x1FA           R10      R15 `bad_crc`
//   0x15     4   `ff ff ff ff` sentinel                 R9        R14 `bad_sentinel`
//   0x19    16   name field (NUL-padded)                R7        R17 `name`, R109-R113 readability
//   0x29   466   body                                   R6        R19 `chain`

import { crc8, decodeGp5Body } from './gp5-sysex-preset-codec';
import type { Preset, PresetSlot } from './preset';

export const GP5_PRST_LEN = 507;

// `0x47 0x50 0x2d 0x35` ("GP-5") + 14 × `0x00` + `0x01` + `0x00` (the `0x01`
// at offset `0x12`, NOT `0x13` — confirmed against the ToneLab reference
// file, see OQ1 in requirements.md).
export const GP5_PRST_HEADER: readonly number[] = [
  0x47, 0x50, 0x2d, 0x35,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00,
];

const PRST_CRC_OFF = 0x14;
const PRST_CRC_LEN = 1;
const PRST_SENTINEL_OFF = 0x15;
const PRST_SENTINEL = [0xff, 0xff, 0xff, 0xff];
const PRST_NAME_OFF = 0x19;
const PRST_NAME_LEN = 16;
const PRST_BODY_OFF = 0x29;
const PRST_BODY_LEN = 466;

export type PrstFileError = 'wrong_length' | 'bad_header' | 'bad_sentinel' | 'bad_crc';

export type PrstDecodeResult =
  | {
      ok: true;
      name: string;
      chain: PresetSlot[];
      bytes: Uint8Array;
      nameReadable: boolean;
    }
  | { ok: false; error: PrstFileError };

// Rev 5 — mirrors `backend/src/songs/prst-name.ts` `readPresetName` exactly
// on the 16-byte name field (R109-R113). Pure, never throws. The bytes the
// upload carries are the same byte sequence the backend's rule inspects —
// only by mirroring it here can the dialog reject at add/pick/submit the
// presets the backend would refuse.
//
// `length !== 16` → false (R113). For a field with a `0x00`, name = bytes
// before the NUL; otherwise all 16 bytes. Every byte of the name must be
// in `0x20..0x7e` (R110); the name must contain at least one byte that is
// not `0x20` (R111). Bytes after the first `0x00` are not inspected (R112).
export function isReadablePrstNameField(field: Uint8Array): boolean {
  if (field.length !== PRST_NAME_LEN) return false;
  let end = 0;
  while (end < PRST_NAME_LEN && field[end] !== 0x00) end++;
  if (end === 0) return false;
  let nonSpace = false;
  for (let i = 0; i < end; i++) {
    const b = field[i];
    if (b < 0x20 || b > 0x7e) return false;
    if (b !== 0x20) nonSpace = true;
  }
  return nonSpace;
}

// Encode a 466-byte `Preset` as a 507-byte `.prst`. The bytes at 0x00..0x28
// are derived from the layout constants and `preset.raw`; the bytes at
// 0x29..0x1FA are `preset.raw.body` verbatim (R6). The CRC at 0x14 is
// computed last over 0x15..0x1FA (R10).
//
// Throws `Error('preset_bytes_unavailable')` when `raw` is missing or has the
// wrong length (R11) — callers (the dialog component) keep byte-less real
// presets out of the list (R22/R24) and mocks out of the network path
// (R93), so this throw is unreachable through the UI but kept as a guard.
export function encodePrstFile(preset: Preset): Uint8Array {
  if (!preset.raw) throw new Error('preset_bytes_unavailable');
  if (preset.raw.body.length !== PRST_BODY_LEN) throw new Error('preset_bytes_unavailable');
  if (preset.raw.nameField.length !== PRST_NAME_LEN) throw new Error('preset_bytes_unavailable');

  const out = new Uint8Array(GP5_PRST_LEN);
  for (let i = 0; i < GP5_PRST_HEADER.length; i++) {
    out[i] = GP5_PRST_HEADER[i];
  }
  out.set(preset.raw.nameField, PRST_NAME_OFF);
  out.set(PRST_SENTINEL, PRST_SENTINEL_OFF);
  out.set(preset.raw.body, PRST_BODY_OFF);

  // CRC covers the sentinel + name + body (0x15..end), per R10 / T10.
  const crc = crc8(out.subarray(PRST_SENTINEL_OFF));
  out[PRST_CRC_OFF] = crc;

  return out;
}

// Validate a picked `.prst` file. Pure, never throws. The returned `bytes`
// on success is a fresh `Uint8Array` slice of the input — it is not
// re-encoded, the CRC is not recomputed (R18). `name` is the characters
// before the first `0x00` at 0x19..0x28, trimmed, possibly `''` (R17); the
// dialog (not this function) treats an empty name as a user-facing error
// (R46). `nameReadable` (Rev 5) is `isReadablePrstNameField(input.subarray
// (0x19..0x29))`, independent of `ok` (an unreadable name on an otherwise
// valid file still returns `ok: true, nameReadable: false`).
//
// `decodeBody` is the codec's exported `decodeGp5Body`, renamed; the
// decoded `chain` is what the UI renders (R19).
export function decodePrstFile(input: Uint8Array): PrstDecodeResult {
  if (input.length !== GP5_PRST_LEN) {
    return { ok: false, error: 'wrong_length' };
  }
  for (let i = 0; i < GP5_PRST_HEADER.length; i++) {
    if (input[i] !== GP5_PRST_HEADER[i]) {
      return { ok: false, error: 'bad_header' };
    }
  }
  for (let i = 0; i < PRST_SENTINEL.length; i++) {
    if (input[PRST_SENTINEL_OFF + i] !== PRST_SENTINEL[i]) {
      return { ok: false, error: 'bad_sentinel' };
    }
  }
  // CRC covers the sentinel + name + body (0x15..end), per R10 / R15.
  const expectedCrc = crc8(input.subarray(PRST_SENTINEL_OFF, GP5_PRST_LEN));
  if (input[PRST_CRC_OFF] !== expectedCrc) {
    return { ok: false, error: 'bad_crc' };
  }
  // Pass — build the result.
  const bytes = input.slice();
  const nameFieldSlice = input.subarray(PRST_NAME_OFF, PRST_NAME_OFF + PRST_NAME_LEN);
  let nm = '';
  for (let j = 0; j < nameFieldSlice.length; j++) {
    if (nameFieldSlice[j] === 0) break;
    nm += String.fromCharCode(nameFieldSlice[j]);
  }
  const name = nm.trim();
  const chain = decodeGp5Body(
    input.subarray(PRST_BODY_OFF, PRST_BODY_OFF + PRST_BODY_LEN),
    name,
    0,
  ).chain;
  return { ok: true, name, chain, bytes, nameReadable: isReadablePrstNameField(nameFieldSlice) };
}