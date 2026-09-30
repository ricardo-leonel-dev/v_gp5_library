// SysEx byte-level protocol for the Valeton GP-5.
//
// Adapted from drewmerc302/valeton-gp50 (https://github.com/drewmerc302/valeton-gp50):
// the request/reply framing (CRC-8/0x07, nibble encoding, request/reply shape),
// the GP-50 device profile's write-packet stream (PATCH_WRITE_CMD 0x1D, 19-byte
// chunking), and the GP-5 body record layout (REC_MODELS / REC_BYPASS / REC_ORDER
// / REC_PARAMS) are all ported from that project's patch/prst_format.py and
// patch/device_write.py. Verbatim MIT license notice follows.
//
// Verified against real GP-5 hardware (the user's own pedal):
//
//   * encodeReadAllRequest / decodeIncomingMessage (T5, R14) — the
//     byte-level framing/CRC/selectors of the READ path are byte-confirmed
//     against a real GP-5. See progress/gp5_webmidi_read_probe.html
//     (selector 0x40, names read, 100 names parsed) and
//     progress/gp5_webmidi_body_read_probe.html (selector 0x41, full body
//     read, 466-byte body with all four magics decoded). All confirmed
//     against the GP-5, not the GP-50.
//
//     The body request carries no slot number: it is the same
//     `[crc, 0x01, 0x00, 0x02, 0x12, 0x41]` for every slot, and the pedal
//     answers with the body of whatever preset is active. Selecting the
//     slot to read is a separate step (see WebMidiPedalConnection.readPresets).
//
//   * decodeIncomingMessage's reply header (feature 13) — a second, deeper
//     hardware capture (raw incoming SysEx bytes read straight off the real
//     GP-5, decoded with this file's own crc8/nibDecode) found that every
//     reply's decoded[1] is the TOTAL CHUNK COUNT for that transfer (106 for
//     the 100-name blob's reply, 25 for one slot's 466-byte body reply) — it
//     is never a fixed CATSEL echo, contrary to what the request/reply framing
//     above assumed by analogy with the outgoing request's layout. Gating
//     message acceptance on decoded[1] === CATSEL therefore discarded every
//     real reply unconditionally; that gate is gone. CRC (already correct)
//     plus index-based chunk reassembly (also already correct) fully decoded
//     100 real preset names and one real body (echo bytes exactly
//     [CATSEL, BODY_SEL], all four record magics at valid offsets) once the
//     bad gate was removed — see decodeIncomingMessage's inline comment.
//
//   * encodeProgramChange / isAwaitingNames (feature 12) — let
//     WebMidiPedalConnection.readPresets select a slot and let it settle
//     before each body request, and wait for the names phase to finish
//     before the first one.
//
//     The user manual's "MIDI Control Information List" (page 40) only
//     documents standard MIDI CCs — it does NOT document the SysEx preset
//     read/write protocol used here. That protocol was reverse-engineered
//     from real hardware captures (the probe HTMLs in `progress/`); treat
//     any inferred SysEx field as a hypothesis until re-verified against
//     the pedal.
//
//   * encodeWriteRequest (T21, R17) — WRITE path is corroborated, NOT byte-
//     instrumented. Web MIDI cannot observe another app's outgoing host→device
//     traffic, so the write opcode/header bytes were not directly observed
//     against this pedal. Corroboration: a real patch save via Valeton Suite
//     while progress/gp5_webmidi_write_capture.html passively listened produced
//     exactly 26 identical device ACK frames — matching the GP-5 payload's
//     predicted block count (488 bytes / 19-byte blocks = 26 blocks) to the
//     byte, and the pedal's sound/config audibly changed. That confirms the
//     payload SHAPE (cmd 0x1D, header [0x11,0x4F,slot,0,0,0], 19-byte chunking,
//     CRC-8/0x07), but the per-module vocabulary and the exact body-record
//     padding between magics are still inferred from the GP-50 reference
//     implementation rather than measured. Round-tripping a real GP-5 preset
//     back to the same slot byte-exactly is therefore NOT a property this class
//     guarantees today — it implements the best-effort GP-50 port for the
//     payload shape and the protocol mechanics, not a verified bit-perfect
//     GP-5 serializer.
//
//   * decodeBody REC_MODELS byte layout (feature 18, R37) — INDEPENDENTLY RE-
//     VERIFIED against real GP-5 hardware on 2026-09-28 from a captured preset
//     0 body dump. The REC_MODELS record read inside `decodeBody()` in this
//     file (`fxlow = body[0] | body[1]<<8 | body[2]<<16` 24-bit little-endian,
//     `cat = body[3]`) matches the valeton-gp50 reference byte-for-byte. Real
//     evidence from the capture (the 4 REC_MODELS bytes confirmed on the pedal as
//     PRE/COMP, AMP/DarkTwin, CAB/UserIR on the pedal):
//
//       block 0 (NR, no module):        [0x1b, 0x00, 0x00, 0x00]
//       block 1 (PRE/COMP):             [0x00, 0x00, 0x00, 0x00]
//       block 3 (AMP/DarkTwin):         [0x04, 0x00, 0x00, 0x07]
//       block 4 (CAB/User IR):         [0x00, 0x00, 0x10, 0x0a]
//
//     `decodeBody()` reads these literally as (fxlow, cat) pairs — (0x1b, 0x0),
//     (0x0, 0x0), (0x4, 0x7), (0x100000, 0xa) — and emits the corresponding
//     `moduleType` strings (`cat0_fx1b`, `cat0_fx0`, `cat7_fx4`, `cata_fx100000`).
//     A non-zero REC_MODELS test exercising exactly this byte sequence is
//     pinned in gp5-sysex-preset-codec.spec.ts under the
//     "decodes non-zero REC_MODELS records against the captured preset 0"
//     case.
//
//     IMPORTANT — the FX-title mismatch observed on the pedal (preset 0 AMP rendered
//     as "MOD/O-Phase" instead of "Dark Twin"; PRE as "NR/Gate" instead of
//     "COMP"; CAB as invalid instead of "User IR 1-20") was NOT a codec bug.
//     The codec faithfully produces the literal (cat, fxlow) values the pedal
//     sent. Feature 19 (`gp5_module_vocabulary_hardware_re_verification`)
//     closed the gap in src/app/midi/gp5-module-vocabulary.ts: titles are now
//     resolved through a per-code lookup table (GP5_HARDWARE_MODULE_CODES)
//     backed by real reads recorded in gp5-hardware-captures.ts, and codes not
//     in that table resolve raw. The 2026-09-30 reorder capture also confirmed
//     that moving a block only changes REC_ORDER, never REC_MODELS.
//
// MIT License, Copyright (c) 2026 Andrew Mercurio:
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in
//   all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//   THE SOFTWARE.

import { Injectable } from '@angular/core';
import type { Preset, PresetSlot } from './preset';
import type { SysexDecodeResult, SysexPresetCodec } from './sysex-preset-codec';

// CRC-8/SMBUS, poly 0x07, init 0. Used for every packet's CRC byte.
function crc8(bytes: Uint8Array): number {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) {
      c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
  }
  return c;
}

// Each byte -> [hi nibble, lo nibble].
function nibEncode(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    out[i * 2] = (buf[i] >> 4) & 0x0f;
    out[i * 2 + 1] = buf[i] & 0x0f;
  }
  return out;
}

// Inverse of nibEncode — pairs of nibbles back into bytes.
function nibDecode(arr: Uint8Array): Uint8Array {
  const len = Math.floor(arr.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = ((arr[i * 2] & 0x0f) << 4) | (arr[i * 2 + 1] & 0x0f);
  }
  return out;
}

// Build a 6-byte read request: [crc, 0x01, 0x00, 0x02, 0x12, selector]. The CRC
// is computed over the buffer with byte 0 held at 0. Used for BOTH the names
// read (selector 0x40, asks the pedal for all 100 names at once) AND every
// body read (selector 0x41, returns the active preset's body — byte 2 stays
// 0x00, there is no slot byte on the wire).
function buildRequest(selector: number): Uint8Array {
  const buf = new Uint8Array([0, 0x01, 0x00, 0x02, 0x12, selector]);
  buf[0] = crc8(buf);
  return buf;
}

// Wrap a byte buffer as a SysEx message on the wire: [f0, ...nibbles, f7].
function toWire(buf: Uint8Array): Uint8Array {
  const nibbles = nibEncode(buf);
  const out = new Uint8Array(2 + nibbles.length);
  out[0] = 0xf0;
  for (let i = 0; i < nibbles.length; i++) {
    out[i + 1] = nibbles[i];
  }
  out[out.length - 1] = 0xf7;
  return out;
}

// GP-5 device profile, from prst_format.py's GP5 profile.
const CATSEL = 0x12;
const NAME_SEL = 0x40;
const BODY_SEL = 0x41;
const SLOT_COUNT = 100;
const NAME_LEN = 16;
const PRST_LEN = 507;
const NAME_OFF = 0x19; // 25 bytes = header(21, including CRC at 0x14) + sentinel(4).
const GP5_BODY_LEN = PRST_LEN - NAME_OFF - NAME_LEN; // 466.

// Each reply frame begins with a 2-byte echo: [CATSEL, SELECTOR].
const ECHO_LEN = 2;
const NAMES_BLOB_LEN = ECHO_LEN + SLOT_COUNT * 20; // 2 + 2000 = 2002.
const BODY_BLOB_LEN = ECHO_LEN + GP5_BODY_LEN; // 2 + 466 = 468.

// Body record magic markers — [kind, 0x30, size_lo, size_hi] + size bytes of data.
const REC_MODELS_MAGIC = [0x03, 0x30, 0x28, 0x00];
const REC_BYPASS_MAGIC = [0x01, 0x30, 0x04, 0x00];
const REC_ORDER_MAGIC = [0x02, 0x30, 0x0a, 0x00];
const REC_PARAMS_MAGIC = [0x04, 0x30, 0x40, 0x01];

const N_BLOCKS = 10;
const N_PARAM_SLOTS = 80;
const PARAMS_PER_BLOCK = N_PARAM_SLOTS / N_BLOCKS; // 8

// Write protocol constants, from device_write.py.
const PATCH_WRITE_CMD = 0x1d;
const WRITE_HDR = [0x11, 0x4f, 0, 0, 0, 0];
const WRITE_BLOCK_SIZE = 19;
const WRITE_PAYLOAD_LEN = WRITE_HDR.length + (PRST_LEN - NAME_OFF); // 6 + 482 = 488.
const WRITE_BLOCK_COUNT = Math.ceil(WRITE_PAYLOAD_LEN / WRITE_BLOCK_SIZE); // 26.

function findMagic(body: Uint8Array, magic: number[]): number {
  outer: for (let i = 0; i <= body.length - magic.length; i++) {
    for (let j = 0; j < magic.length; j++) {
      if (body[i + j] !== magic[j]) continue outer;
    }
    return i + magic.length;
  }
  return -1;
}

function sumLengths(chunks: ReadonlyMap<number, Uint8Array>): number {
  let total = 0;
  for (const chunk of chunks.values()) {
    total += chunk.length;
  }
  return total;
}

// Concatenate chunks in index order until we reach at least `target` bytes.
function concatChunks(chunks: ReadonlyMap<number, Uint8Array>, target: number): Uint8Array {
  const sorted = [...chunks.entries()].sort(([a], [z]) => a - z);
  const out = new Uint8Array(target);
  let pos = 0;
  for (const [, chunk] of sorted) {
    const take = Math.min(chunk.length, target - pos);
    out.set(chunk.subarray(0, take), pos);
    pos += take;
    if (pos >= target) break;
  }
  return out;
}

function decodeNames(blob: Uint8Array): Map<number, string> {
  const names = new Map<number, string>();
  // blob starts with [CATSEL, NAME_SEL] echo, then [u32le idx][16-byte name] * 100.
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  for (let i = ECHO_LEN; i + 20 <= blob.length; i += 20) {
    const idx = dv.getUint32(i, true);
    let nm = '';
    for (let j = i + 4; j < i + 4 + NAME_LEN; j++) {
      if (blob[j] === 0) break;
      nm += String.fromCharCode(blob[j]);
    }
    names.set(idx, nm.trim());
  }
  return names;
}

function decodeBody(body: Uint8Array, name: string, slot: number): Preset {
  const modelsBase = findMagic(body, REC_MODELS_MAGIC);
  const bypassBase = findMagic(body, REC_BYPASS_MAGIC);
  const orderBase = findMagic(body, REC_ORDER_MAGIC);
  const paramsBase = findMagic(body, REC_PARAMS_MAGIC);

  // Build the per-block records first (in block index order).
  const blocks: PresetSlot[] = [];
  if (modelsBase >= 0) {
    for (let k = 0; k < N_BLOCKS; k++) {
      const recordBase = modelsBase + k * 4;
      if (recordBase + 4 > body.length) break;
      const fxlow = body[recordBase] | (body[recordBase + 1] << 8) | (body[recordBase + 2] << 16);
      const cat = body[recordBase + 3];
      blocks.push({
        moduleType: `cat${cat.toString(16)}_fx${fxlow.toString(16)}`,
        enabled: true,
        parameters: {},
      });
    }
  }
  while (blocks.length < N_BLOCKS) {
    blocks.push({ moduleType: 'empty', enabled: false, parameters: {} });
  }

  if (bypassBase >= 0 && bypassBase + 4 <= body.length) {
    const mask =
      (body[bypassBase] |
        (body[bypassBase + 1] << 8) |
        (body[bypassBase + 2] << 16) |
        (body[bypassBase + 3] << 24)) >>>
      0;
    for (let k = 0; k < blocks.length; k++) {
      blocks[k].enabled = ((mask >> k) & 1) === 1;
    }
  }

  // The ORDER record tells us the chain-position layout: order[chainPos] = blockIdx.
  let chainOrder: number[];
  if (orderBase >= 0 && orderBase + N_BLOCKS <= body.length) {
    chainOrder = Array.from(body.subarray(orderBase, orderBase + N_BLOCKS));
  } else {
    chainOrder = Array.from({ length: N_BLOCKS }, (_, i) => i);
  }

  // Read params as 80 little-endian float32s and distribute 8 per block.
  if (paramsBase >= 0 && paramsBase + N_PARAM_SLOTS * 4 <= body.length) {
    const dv = new DataView(body.buffer, body.byteOffset + paramsBase, N_PARAM_SLOTS * 4);
    for (let k = 0; k < N_PARAM_SLOTS; k++) {
      const blockIdx = Math.floor(k / PARAMS_PER_BLOCK);
      const paramIdx = k % PARAMS_PER_BLOCK;
      blocks[blockIdx].parameters[`p${paramIdx}`] = dv.getFloat32(k * 4, true);
    }
  }

  // Apply chain order. chainOrder[chainPos] = blockIdx means block at chainPos.
  const chain: PresetSlot[] = chainOrder.map((blockIdx) => blocks[blockIdx] ?? blocks[0]);

  return { slot, name, chain };
}

// Build a 466-byte body from the Preset chain. Records are laid out contiguously
// in the order [MODELS, BYPASS, ORDER, PARAMS] (so the decode's findMagic()
// locates each at a known offset). The real GP-5 body layout is unverified —
// this is a best-effort GP-50-derived encoding.
function encodeBody(chain: readonly PresetSlot[], out: Uint8Array): void {
  out.fill(0);

  // Pad/truncate chain to N_BLOCKS slots.
  const slots: PresetSlot[] = [];
  for (let i = 0; i < N_BLOCKS; i++) {
    slots.push(chain[i] ?? { moduleType: 'empty', enabled: false, parameters: {} });
  }

  let pos = 0;

  // REC_MODELS: magic + 10 * 4-byte records.
  out.set(REC_MODELS_MAGIC, pos);
  pos += 4;
  for (let k = 0; k < N_BLOCKS; k++) {
    out[pos] = k & 0xff;
    out[pos + 1] = 0;
    out[pos + 2] = 0;
    out[pos + 3] = 0;
    pos += 4;
  }

  // REC_BYPASS: magic + 4-byte mask.
  out.set(REC_BYPASS_MAGIC, pos);
  pos += 4;
  let mask = 0;
  for (let k = 0; k < N_BLOCKS; k++) {
    if (slots[k].enabled) mask |= 1 << k;
  }
  out[pos] = mask & 0xff;
  out[pos + 1] = (mask >> 8) & 0xff;
  out[pos + 2] = (mask >> 16) & 0xff;
  out[pos + 3] = (mask >>> 24) & 0xff;
  pos += 4;

  // REC_ORDER: magic + 10 bytes (identity permutation).
  out.set(REC_ORDER_MAGIC, pos);
  pos += 4;
  for (let k = 0; k < N_BLOCKS; k++) {
    out[pos + k] = k;
  }
  pos += N_BLOCKS;

  // REC_PARAMS: magic + 80 float32s (all zero — see the write caveat above).
  out.set(REC_PARAMS_MAGIC, pos);
  pos += 4;
  const dv = new DataView(out.buffer, out.byteOffset + pos, N_PARAM_SLOTS * 4);
  for (let k = 0; k < N_PARAM_SLOTS; k++) {
    dv.setFloat32(k * 4, 0, true);
  }
}

@Injectable({ providedIn: 'root' })
export class Gp5SysexPresetCodec implements SysexPresetCodec {
  // Internal state — see class header for what is byte-confirmed vs. inferred.
  private namesChunks: Map<number, Uint8Array> | null = null;
  private bodyChunks: Map<number, Uint8Array> | null = null;
  private namesMap: Map<number, string> | null = null;
  private currentSlot = 0;
  private nextIndex = 0;

  encodeReadAllRequest(): Uint8Array[] {
    // Reset the dump state.
    this.namesChunks = new Map();
    this.bodyChunks = null;
    this.namesMap = null;
    this.currentSlot = 0;
    this.nextIndex = 0;

    // One names request, then 100 byte-identical body requests; the caller
    // selects each slot before sending its body request.
    const bodyRequest = toWire(buildRequest(BODY_SEL));
    const messages: Uint8Array[] = [toWire(buildRequest(NAME_SEL))];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      messages.push(bodyRequest);
    }
    return messages;
  }

  decodeIncomingMessage(message: Uint8Array): SysexDecodeResult {
    if (message.length < 4 || message[0] !== 0xf0 || message[message.length - 1] !== 0xf7) {
      return { kind: 'ignored' };
    }
    const nibbles = message.slice(1, -1);
    if (nibbles.length % 2 !== 0 || nibbles.length < 4) {
      return { kind: 'invalid', reason: 'framing' };
    }
    const decoded = nibDecode(nibbles);
    if (decoded.length < 4) {
      return { kind: 'invalid', reason: 'too short' };
    }

    const crc = decoded[0];
    const expectedCrc = crc8(decoded.slice(1));
    if (crc !== expectedCrc) {
      return { kind: 'invalid', reason: 'bad crc' };
    }

    // decoded[1] is the total chunk count for THIS transfer (hardware-verified:
    // 106 for the 100-name blob, 25 for one slot's 466-byte body) -- it varies
    // per transfer and is NOT a fixed command/echo byte. It must never gate
    // message acceptance. (This code previously compared it to CATSEL, which
    // discarded every real reply from the pedal unconditionally, since a real
    // reply's decoded[1] is never CATSEL.) Acceptance is CRC (above) plus the
    // structural checks already done above it -- nothing else is needed.
    const index = decoded[2];
    const chunk = decoded.slice(4);

    // Phase 1: accumulate names. The names reply's first chunk carries the
    // [CATSEL, NAME_SEL] echo and starts the names blob; subsequent chunks
    // continue it. When the accumulated length reaches NAMES_BLOB_LEN we have
    // all 100 names and transition to body phase.
    if (this.bodyChunks === null) {
      if (this.namesChunks === null) {
        return { kind: 'ignored' };
      }
      this.namesChunks.set(index, chunk);
      const total = sumLengths(this.namesChunks);
      if (total < NAMES_BLOB_LEN) {
        return { kind: 'ignored' };
      }
      const blob = concatChunks(this.namesChunks, NAMES_BLOB_LEN);
      this.namesMap = decodeNames(blob);
      this.namesChunks = null;
      this.bodyChunks = new Map();
      this.nextIndex = 0;
      return { kind: 'ignored' };
    }

    // Phase 2: accumulate body for the current slot. Echo bytes ride along
    // on the first chunk and are stripped during reassembly.
    this.bodyChunks.set(index, chunk);
    const total = sumLengths(this.bodyChunks);
    if (total < BODY_BLOB_LEN) {
      return { kind: 'ignored' };
    }
    const blob = concatChunks(this.bodyChunks, BODY_BLOB_LEN);
    this.bodyChunks = new Map();
    const body = blob.subarray(ECHO_LEN);
    const name = this.namesMap?.get(this.currentSlot) ?? `slot${this.currentSlot}`;
    const preset = decodeBody(body, name, this.currentSlot);
    const isLast = this.currentSlot === SLOT_COUNT - 1;
    this.currentSlot++;
    if (isLast) {
      this.bodyChunks = null;
      this.namesMap = null;
      this.currentSlot = 0;
    }
    return { kind: 'preset', preset, isLast };
  }

  encodeProgramChange(slot: number): Uint8Array {
    // Plain 2-byte MIDI Program Change on channel 0 — NOT SysEx-framed, unlike
    // every other message this codec builds. Matches
    // progress/gp5_webmidi_body_read_probe.html's `output.send([0xc0, slot & 0x7f])`.
    return new Uint8Array([0xc0, slot & 0x7f]);
  }

  isAwaitingNames(): boolean {
    return this.namesChunks !== null;
  }

  encodeWriteRequest(preset: Preset): Uint8Array[] {
    const payload = new Uint8Array(WRITE_PAYLOAD_LEN);
    payload[0] = WRITE_HDR[0];
    payload[1] = WRITE_HDR[1];
    payload[2] = preset.slot & 0xff;
    payload[3] = 0;
    payload[4] = 0;
    payload[5] = 0;

    const nameBytes = new TextEncoder().encode(preset.name);
    for (let i = 0; i < NAME_LEN; i++) {
      payload[WRITE_HDR.length + i] = i < nameBytes.length ? nameBytes[i] : 0;
    }

    encodeBody(preset.chain, payload.subarray(WRITE_HDR.length + NAME_LEN));

    const packets: Uint8Array[] = [];
    for (let i = 0; i < WRITE_BLOCK_COUNT; i++) {
      const start = i * WRITE_BLOCK_SIZE;
      const end = Math.min(start + WRITE_BLOCK_SIZE, WRITE_PAYLOAD_LEN);
      const chunkLen = end - start;
      const packetBody = new Uint8Array(4 + chunkLen);
      packetBody[1] = PATCH_WRITE_CMD;
      packetBody[2] = i;
      packetBody[3] = chunkLen;
      payload.subarray(start, end).forEach((b, j) => (packetBody[4 + j] = b));
      packetBody[0] = crc8(packetBody.slice(1));
      packets.push(toWire(packetBody));
    }
    return packets;
  }
}
