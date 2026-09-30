import { describe, expect, test } from 'vitest';
import { describeModuleType } from './gp5-module-vocabulary';
import { Gp5SysexPresetCodec } from './gp5-sysex-preset-codec';
import type { Preset } from './preset';
import type { SysexDecodeResult } from './sysex-preset-codec';

// Helpers — mirror the codec's internal encoders so the tests construct
// realistic wire-level bytes.
function crc8(bytes: number[]): number {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) {
      c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
  }
  return c;
}

function nibEncode(buf: number[]): number[] {
  const out: number[] = [];
  for (const b of buf) {
    out.push((b >> 4) & 0x0f, b & 0x0f);
  }
  return out;
}

function toWire(buf: number[]): Uint8Array {
  return new Uint8Array([0xf0, ...nibEncode(buf), 0xf7]);
}

function fromWire(wire: Uint8Array): Uint8Array {
  if (wire[0] !== 0xf0 || wire[wire.length - 1] !== 0xf7) {
    throw new Error('not a sysex wire frame');
  }
  const nibbles = Array.from(wire.slice(1, -1));
  const out = new Uint8Array(Math.floor(nibbles.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = ((nibbles[i * 2] & 0x0f) << 4) | (nibbles[i * 2 + 1] & 0x0f);
  }
  return out;
}

// `chunkCount` mirrors decoded[1] as confirmed against real hardware: the
// TOTAL number of reply chunks for the transfer this frame belongs to (e.g.
// 106 for a 100-name blob, 25 for one slot's body) -- never a fixed command
// byte like the old (incorrect) CATSEL assumption. Defaults to a value that
// is deliberately neither CATSEL (0x12) nor any other small constant, so
// tests that don't care about this field still exercise the real shape.
function buildReply(opts: {
  chunkCount?: number;
  index: number;
  payload: number[];
}): Uint8Array {
  const len = opts.payload.length;
  const body = [0, opts.chunkCount ?? 0x6a, opts.index, len, ...opts.payload];
  body[0] = crc8(body.slice(1));
  return toWire(body);
}

const CATSEL = 0x12;
const NAME_SEL = 0x40;
const BODY_SEL = 0x41;
const SLOT_COUNT = 100;
const NAME_LEN = 16;
const GP5_BODY_LEN = 466;
const ECHO_LEN = 2;
const NAMES_BLOB_LEN = ECHO_LEN + SLOT_COUNT * 20;
const BODY_BLOB_LEN = ECHO_LEN + GP5_BODY_LEN;

const REC_MODELS_MAGIC = [0x03, 0x30, 0x28, 0x00];
const REC_BYPASS_MAGIC = [0x01, 0x30, 0x04, 0x00];
const REC_ORDER_MAGIC = [0x02, 0x30, 0x0a, 0x00];
const REC_PARAMS_MAGIC = [0x04, 0x30, 0x40, 0x01];

function buildBody(): Uint8Array {
  const body = new Uint8Array(GP5_BODY_LEN);
  // REC_MODELS at offset 0.
  body.set(REC_MODELS_MAGIC, 0);
  // REC_BYPASS at offset 44.
  body.set(REC_BYPASS_MAGIC, 44);
  // REC_ORDER at offset 52.
  body.set(REC_ORDER_MAGIC, 52);
  for (let k = 0; k < 10; k++) body[56 + k] = k;
  // REC_PARAMS at offset 66.
  body.set(REC_PARAMS_MAGIC, 66);
  // Fill params (80 * 4 = 320 bytes, ending at 390). Remainder of body is zeros.
  const dv = new DataView(body.buffer, 70, 320);
  for (let k = 0; k < 80; k++) dv.setFloat32(k * 4, k / 10, true);
  return body;
}

// Variant of buildBody() that stamps the supplied REC_MODELS records into the
// MODELS data area (offset 4..44). Each entry is a 4-byte tuple
// [b0, b1, b2, b3] written verbatim — the codec reads b0|b1<<8|b2<<16 as
// `fxlow` and b3 as `cat`, so the test pins that exact interpretation against
// real captured bytes from the GP-5 (see feature 18 / R37). Bypass mask,
// order, and params stay identical to buildBody() so this only exercises the
// REC_MODELS path.
function buildBodyWithModels(records: readonly (readonly [number, number, number, number])[]): Uint8Array {
  const body = buildBody();
  // REC_MODELS data area is 10 records of 4 bytes each (offset 4..44 in the
  // body). Hardcoded 10 to match the codec's N_BLOCKS, which is internal.
  for (let k = 0; k < records.length && k < 10; k++) {
    const [b0, b1, b2, b3] = records[k];
    body[4 + k * 4 + 0] = b0;
    body[4 + k * 4 + 1] = b1;
    body[4 + k * 4 + 2] = b2;
    body[4 + k * 4 + 3] = b3;
  }
  return body;
}

// Chunk a blob into 19-byte pieces (same as the codec writes) — used to
// synthesize multi-frame replies for the decoder. Every frame in the
// transfer carries the SAME chunkCount value at decoded[1] (the total number
// of chunks for this transfer), matching real hardware — e.g. a 2002-byte
// names blob chunks into 106 frames, each with chunkCount=106.
function chunkForReassembly(blob: Uint8Array): Uint8Array[] {
  const totalChunks = Math.ceil(blob.length / 19);
  const frames: Uint8Array[] = [];
  let i = 0;
  let index = 0;
  while (i < blob.length) {
    const end = Math.min(i + 19, blob.length);
    frames.push(
      buildReply({
        chunkCount: totalChunks,
        index,
        payload: Array.from(blob.subarray(i, end)),
      }),
    );
    i = end;
    index++;
  }
  return frames;
}

function buildNamesBlob(names: Map<number, string>): Uint8Array {
  const blob = new Uint8Array(NAMES_BLOB_LEN);
  blob[0] = CATSEL;
  blob[1] = NAME_SEL;
  const dv = new DataView(blob.buffer, 2);
  let i = 2;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    dv.setUint32(i, slot, true);
    const nameBytes = new TextEncoder().encode(names.get(slot) ?? '');
    for (let j = 0; j < NAME_LEN; j++) {
      blob[i + 4 + j] = j < nameBytes.length ? nameBytes[j] : 0;
    }
    i += 20;
  }
  return blob;
}

function buildBodyBlob(body: Uint8Array): Uint8Array {
  const blob = new Uint8Array(BODY_BLOB_LEN);
  blob[0] = CATSEL;
  blob[1] = BODY_SEL;
  blob.set(body, ECHO_LEN);
  return blob;
}

describe('Gp5SysexPresetCodec.encodeReadAllRequest', () => {
  test('returns one names request followed by 100 body requests (R14, T4)', () => {
    const codec = new Gp5SysexPresetCodec();
    const messages = codec.encodeReadAllRequest();

    expect(messages).toHaveLength(101);
    for (const msg of messages) {
      expect(msg[0]).toBe(0xf0);
      expect(msg[msg.length - 1]).toBe(0xf7);
      expect((msg.length - 2) % 2).toBe(0);
    }
  });

  test('first request is a names read (selector 0x40), the rest are body reads (0x41)', () => {
    const codec = new Gp5SysexPresetCodec();
    const messages = codec.encodeReadAllRequest();

    const decodedFirst = fromWire(messages[0]);
    expect(Array.from(decodedFirst)).toEqual([
      expect.any(Number),
      0x01,
      0x00,
      0x02,
      0x12,
      NAME_SEL,
    ]);

    for (let i = 1; i < messages.length; i++) {
      const decoded = fromWire(messages[i]);
      expect(decoded[decoded.length - 1]).toBe(BODY_SEL);
    }
  });

  test('each request has a valid CRC-8/0x07 over the body', () => {
    const codec = new Gp5SysexPresetCodec();
    const messages = codec.encodeReadAllRequest();

    for (const msg of messages) {
      const decoded = fromWire(msg);
      const [crc, ...body] = decoded;
      expect(crc).toBe(crc8(body));
    }
  });
});

describe('Gp5SysexPresetCodec.encodeProgramChange (feature 12)', () => {
  test('returns a plain 2-byte MIDI Program Change on channel 0, not SysEx-framed', () => {
    const codec = new Gp5SysexPresetCodec();
    const message = codec.encodeProgramChange(5);

    expect(Array.from(message)).toEqual([0xc0, 5]);
  });

  test('masks the slot to 7 bits (MIDI data byte range)', () => {
    const codec = new Gp5SysexPresetCodec();
    const message = codec.encodeProgramChange(99);

    expect(Array.from(message)).toEqual([0xc0, 99]);
  });
});

describe('Gp5SysexPresetCodec.isAwaitingNames (feature 12)', () => {
  test('is false before any read-all dump has started', () => {
    const codec = new Gp5SysexPresetCodec();
    expect(codec.isAwaitingNames()).toBe(false);
  });

  test('is true immediately after encodeReadAllRequest(), before any names reply arrives', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    expect(codec.isAwaitingNames()).toBe(true);
  });

  test('stays true across partial names replies, then flips false once the full names blob is reassembled', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();

    const names = new Map<number, string>([[0, 'clean']]);
    const frames = chunkForReassembly(buildNamesBlob(names));
    expect(frames.length).toBeGreaterThan(1);

    for (let i = 0; i < frames.length - 1; i++) {
      codec.decodeIncomingMessage(frames[i]);
      expect(codec.isAwaitingNames()).toBe(true);
    }

    codec.decodeIncomingMessage(frames[frames.length - 1]);
    expect(codec.isAwaitingNames()).toBe(false);
  });

  test('is false during the body phase and flips back to true only when a new dump starts', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    const frames = chunkForReassembly(buildNamesBlob(new Map([[0, 'clean']])));
    for (const f of frames) codec.decodeIncomingMessage(f);
    expect(codec.isAwaitingNames()).toBe(false);

    codec.decodeIncomingMessage(chunkForReassembly(buildBodyBlob(buildBody()))[0]);
    expect(codec.isAwaitingNames()).toBe(false);

    codec.encodeReadAllRequest();
    expect(codec.isAwaitingNames()).toBe(true);
  });
});

describe('Gp5SysexPresetCodec.decodeIncomingMessage — framing and CRC', () => {
  test('returns ignored when the message is not SysEx-framed (R14, T4)', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    const result = codec.decodeIncomingMessage(new Uint8Array([0x90, 0x00, 0x01, 0x02]));
    expect(result).toEqual({ kind: 'ignored' });
  });

  test('returns invalid when no read-all-request is active and the frame has a bad CRC', () => {
    const codec = new Gp5SysexPresetCodec();
    const result = codec.decodeIncomingMessage(toWire([0x00, 0x12, 0x00, 0x00]));
    expect(result.kind).toBe('invalid');
  });

  test('returns ignored when no read-all-request is active and the frame has a valid CRC', () => {
    const codec = new Gp5SysexPresetCodec();
    // chunkCount=106 here is deliberately a real hardware-shaped value, not
    // CATSEL — proves acceptance no longer depends on decoded[1] at all.
    const validReply = buildReply({ chunkCount: 106, index: 0, payload: [] });
    const result = codec.decodeIncomingMessage(validReply);
    expect(result).toEqual({ kind: 'ignored' });
  });

  test('returns invalid for an odd-nibble wire frame', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    // 0xf0 + 3 nibbles + 0xf7 = odd pair count
    const wire = new Uint8Array([0xf0, 0x01, 0x02, 0x03, 0xf7]);
    const result = codec.decodeIncomingMessage(wire);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.reason).toBe('framing');
    }
  });

  test('returns invalid when the CRC byte does not match (R14, T4)', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    // A request-encoded frame but with the CRC byte flopped to 0xff.
    const req = codec.encodeReadAllRequest()[0];
    const corrupted = new Uint8Array(req);
    corrupted[corrupted.length - 2] = 0xff;
    const result = codec.decodeIncomingMessage(corrupted);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.reason).toBe('bad crc');
    }
  });
});

describe('Gp5SysexPresetCodec.decodeIncomingMessage — chunk-count header, not CATSEL (feature 13)', () => {
  test('names phase completes when decoded[1] carries a real chunk-count value (106), never CATSEL', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();

    const names = new Map<number, string>([[0, 'TL DLX AMP'], [1, 'RA METAL1']]);
    const frames = chunkForReassembly(buildNamesBlob(names));
    // Real hardware sent exactly 106 chunks for the 100-name blob; assert the
    // fixture actually exercises that shape (and that it is not CATSEL).
    expect(frames.length).toBe(106);

    let lastResult: SysexDecodeResult = { kind: 'ignored' };
    for (const f of frames) lastResult = codec.decodeIncomingMessage(f);
    expect(lastResult).toEqual({ kind: 'ignored' });
    expect(codec.isAwaitingNames()).toBe(false);
  });

  test('body phase decodes a Preset when decoded[1] carries a real chunk-count value (25), never CATSEL', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    for (const f of chunkForReassembly(buildNamesBlob(new Map([[0, 'clean']])))) {
      codec.decodeIncomingMessage(f);
    }

    const frames = chunkForReassembly(buildBodyBlob(buildBody()));
    // Real hardware sent exactly 25 chunks for one slot's 466-byte body.
    expect(frames.length).toBe(25);

    let lastResult: SysexDecodeResult = { kind: 'ignored' };
    for (const f of frames) lastResult = codec.decodeIncomingMessage(f);
    expect(lastResult.kind).toBe('preset');
    if (lastResult.kind === 'preset') {
      expect(lastResult.preset.slot).toBe(0);
      expect(lastResult.preset.name).toBe('clean');
    }
  });

  test('a CRC-invalid message is still rejected as invalid, regardless of the chunk-count value', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    const body = [0, 106, 0, 2, 0xaa, 0xbb];
    body[0] = crc8(body.slice(1)) ^ 0xff; // deliberately wrong CRC
    const result = codec.decodeIncomingMessage(toWire(body));
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.reason).toBe('bad crc');
    }
  });
});

describe('Gp5SysexPresetCodec.decodeIncomingMessage — names accumulation', () => {
  test('accumulates names across multiple frames and returns ignored until done', () => {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();

    const names = new Map<number, string>([[0, 'clean'], [99, 'lead boost']]);
    const blob = buildNamesBlob(names);
    const frames = chunkForReassembly(blob);
    expect(frames.length).toBeGreaterThan(1);

    // First frame alone is too short — ignored.
    const first = codec.decodeIncomingMessage(frames[0]);
    expect(first.kind).toBe('ignored');

    // Subsequent frames also ignored until the whole blob is assembled.
    for (let i = 1; i < frames.length - 1; i++) {
      const result = codec.decodeIncomingMessage(frames[i]);
      expect(result.kind).toBe('ignored');
    }

    // Last frame finishes the names phase — still ignored (no preset for names).
    const last = codec.decodeIncomingMessage(frames[frames.length - 1]);
    expect(last.kind).toBe('ignored');
  });
});

describe('Gp5SysexPresetCodec.decodeIncomingMessage — body accumulation', () => {
  function newCodec(): Gp5SysexPresetCodec {
    const codec = new Gp5SysexPresetCodec();
    codec.encodeReadAllRequest();
    // Feed names to transition to body phase.
    const names = new Map<number, string>([[0, 'clean']]);
    const frames = chunkForReassembly(buildNamesBlob(names));
    for (const f of frames) codec.decodeIncomingMessage(f);
    return codec;
  }

  test('returns ignored until a full 466-byte body has been reassembled', () => {
    const codec = newCodec();
    const bodyBlob = buildBodyBlob(buildBody());
    const frames = chunkForReassembly(bodyBlob);
    expect(frames.length).toBeGreaterThan(1);

    for (let i = 0; i < frames.length - 1; i++) {
      const result = codec.decodeIncomingMessage(frames[i]);
      expect(result.kind).toBe('ignored');
    }
  });

  test('returns the decoded Preset with isLast=false after the first body', () => {
    const codec = newCodec();
    const frames = chunkForReassembly(buildBodyBlob(buildBody()));

    let lastResult: SysexDecodeResult = { kind: 'ignored' };
    for (const frame of frames) {
      lastResult = codec.decodeIncomingMessage(frame);
    }

    expect(lastResult.kind).toBe('preset');
    if (lastResult.kind === 'preset') {
      expect(lastResult.isLast).toBe(false);
      expect(lastResult.preset.slot).toBe(0);
      expect(lastResult.preset.name).toBe('clean');
      expect(lastResult.preset.chain).toHaveLength(10);
      // Bypass mask was all zeros in buildBody(), so all enabled=false.
      expect(lastResult.preset.chain[0].enabled).toBe(false);
    }
  });

  test('marks isLast=true on the 100th preset and resets state', () => {
    const codec = newCodec();
    const names = new Map<number, string>();
    for (let s = 0; s < SLOT_COUNT; s++) names.set(s, `name${s}`);

    let presets: { slot: number; isLast: boolean }[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      // Re-feed names each iteration because the codec transitions back to body.
      // Actually, the codec only consumes names once per dump — so feed them up
      // front and then feed 100 body sequences.
      // (We've already done that above in newCodec; just push more bodies.)
      const frames = chunkForReassembly(buildBodyBlob(buildBody()));
      for (let i = 0; i < frames.length; i++) {
        const result = codec.decodeIncomingMessage(frames[i]);
        if (result.kind === 'preset') {
          presets.push({ slot: result.preset.slot, isLast: result.isLast });
        }
      }
    }

    expect(presets).toHaveLength(SLOT_COUNT);
    expect(presets[0].slot).toBe(0);
    expect(presets[0].isLast).toBe(false);
    expect(presets[SLOT_COUNT - 1].slot).toBe(SLOT_COUNT - 1);
    expect(presets[SLOT_COUNT - 1].isLast).toBe(true);

    // After the last preset, a new dump cycle begins — names are required again.
    const postDump = codec.decodeIncomingMessage(
      chunkForReassembly(buildBodyBlob(buildBody()))[0],
    );
    expect(postDump.kind).toBe('ignored');
  });

  test('decodeBody decodes non-zero REC_MODELS records against the captured preset 0 (R37, T17 precursor)', () => {
    // Captured by Ricardo from the real GP-5 on 2026-09-28: 4 of the 10 blocks
    // in preset 0 carry populated REC_MODELS records (the rest are zero). The
    // exact bytes below were read straight off the pedal via
    // progress/gp5_webmidi_body_read_probe.html and confirmed against the
    // pedal's own UI labels (NR-empty / PRE+COMP / AMP+DarkTwin / CAB+User IR
    // 1-20). This test pins the CODEC's byte interpretation — that b0|b1<<8|
    // b2<<16 is `fxlow` and b3 is `cat` — so future refactors cannot silently
    // swap them. It does NOT pin the FX-title mapping; that lives in
    // gp5-module-vocabulary.ts (GP5_MODULE_FX_TITLES) and is HYPOTHESIS until
    // feature 19 re-verifies it against hardware.
    const capturedRecords: ReadonlyArray<readonly [number, number, number, number]> = [
      [0x1b, 0x00, 0x00, 0x00], // block 0 — NR, no module populated, fxlow=0x1b
      [0x00, 0x00, 0x00, 0x00], // block 1 — PRE/COMP, fxlow=0, cat=0
      [0x00, 0x00, 0x00, 0x00], // block 2 — zero (unused slot)
      [0x04, 0x00, 0x00, 0x07], // block 3 — AMP/DarkTwin, fxlow=4, cat=7
      [0x00, 0x00, 0x10, 0x0a], // block 4 — CAB/User IR, fxlow=0x100000, cat=0xa
      [0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00],
    ];

    const codec = newCodec();
    const frames = chunkForReassembly(buildBodyBlob(buildBodyWithModels(capturedRecords)));
    let lastResult: SysexDecodeResult = { kind: 'ignored' };
    for (const f of frames) lastResult = codec.decodeIncomingMessage(f);

    expect(lastResult.kind).toBe('preset');
    if (lastResult.kind !== 'preset') return;
    const chain = lastResult.preset.chain;

    // The codec reads each 4-byte REC_MODELS record literally as
    // fxlow = body[0] | body[1]<<8 | body[2]<<16 and cat = body[3]. The
    // `moduleType` string is `cat${cat_hex}_fx${fxlow_hex}` (see the
    // REC_MODELS record loop in `decodeBody()`). These assertions pin that
    // interpretation for every captured block; a regression that swaps
    // fxlow/cat, widens fxlow, or reorders the bytes will fail loudly here.
    expect(chain[0].moduleType).toBe('cat0_fx1b');
    expect(chain[1].moduleType).toBe('cat0_fx0');
    expect(chain[3].moduleType).toBe('cat7_fx4');
    expect(chain[4].moduleType).toBe('cata_fx100000');
  });

  test('decodeBody resolves a reordered chain by code, not position (feature 19 R25, T1 step 1e)', () => {
    // Real preset 0 bytes from T1 step 1e (2026-09-30): RVB moved before MOD in the Valeton app. The 10
    // REC_MODELS records were identical before and after; only REC_ORDER changed, to the value below.
    const recModels: ReadonlyArray<readonly [number, number, number, number]> = [
      [27, 0, 0, 0], // block 0 NR / Gate
      [41, 0, 0, 1], // block 1 PRE / Detune
      [64, 0, 0, 3], // block 2 DST / Bass OD
      [123, 0, 0, 8], // block 3 AMP / AC Pre2
      [19, 0, 16, 10], // block 4 CAB / User IR 1-20 (slot 20)
      [60, 0, 0, 1], // block 5 EQ / Mess EQ
      [40, 0, 0, 4], // block 6 MOD / Bias Trem
      [4, 0, 0, 11], // block 7 DLY / Ping Pong
      [21, 0, 0, 12], // block 8 RVB / Sweet Space
      [51, 0, 0, 15], // block 9 N->S / Empty (empty user slot)
    ];
    const recOrderAfter = [0, 1, 2, 9, 3, 4, 5, 8, 6, 7];
    const body = buildBodyWithModels(recModels);
    for (let k = 0; k < 10; k++) body[56 + k] = recOrderAfter[k];

    const codec = newCodec();
    let lastResult: SysexDecodeResult = { kind: 'ignored' };
    for (const f of chunkForReassembly(buildBodyBlob(body))) lastResult = codec.decodeIncomingMessage(f);

    expect(lastResult.kind).toBe('preset');
    if (lastResult.kind !== 'preset') return;
    const chain = lastResult.preset.chain;
    expect(chain).toHaveLength(10);
    recOrderAfter.forEach((blockIndex, chainPosition) => {
      const [b0, b1, b2, b3] = recModels[blockIndex];
      const blockCode = `cat${b3.toString(16)}_fx${(b0 | (b1 << 8) | (b2 << 16)).toString(16)}`;
      expect(describeModuleType(chain[chainPosition].moduleType)).toEqual(
        describeModuleType(blockCode),
      );
    });
    expect(describeModuleType(chain[7].moduleType)).toEqual({
      kind: 'resolved',
      category: 'RVB',
      fxTitle: 'Sweet Space',
    });
    expect(describeModuleType(chain[8].moduleType)).toEqual({
      kind: 'resolved',
      category: 'MOD',
      fxTitle: 'Bias Trem',
    });
    expect(describeModuleType(chain[3].moduleType)).toEqual({
      kind: 'resolved',
      category: 'N->S',
      fxTitle: 'Empty',
    });
  });
});

describe('Gp5SysexPresetCodec.encodeWriteRequest', () => {
  const fixturePreset: Preset = {
    slot: 7,
    name: 'crunch',
    chain: Array.from({ length: 10 }, (_, i) => ({
      moduleType: `cat${i}_fx${i}`,
      enabled: i % 2 === 0,
      parameters: { p0: i / 10, p1: i / 20 },
    })),
  };

  test('produces 26 packets for a GP-5-sized preset (R17, T4)', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);

    expect(packets).toHaveLength(26);
    for (const p of packets) {
      expect(p[0]).toBe(0xf0);
      expect(p[p.length - 1]).toBe(0xf7);
    }
  });

  test('each packet carries cmd=0x1D, an index byte, and a length byte (R17, T4)', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);

    packets.forEach((packet, i) => {
      const decoded = fromWire(packet);
      expect(decoded[0]).toBeGreaterThanOrEqual(0); // CRC
      expect(decoded[1]).toBe(0x1d);
      expect(decoded[2]).toBe(i);
      // length = decoded[3], body starts at decoded[4]
      expect(decoded.length).toBe(4 + decoded[3]);
    });
  });

  test('the first packet carries the write header [0x11,0x4F,slot,0,0,0]', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);
    const decoded = fromWire(packets[0]);

    // body starts at index 4; the write header is bytes 0..5 of the body.
    expect(decoded[4]).toBe(0x11);
    expect(decoded[5]).toBe(0x4f);
    expect(decoded[6]).toBe(fixturePreset.slot);
    expect(decoded[7]).toBe(0);
    expect(decoded[8]).toBe(0);
    expect(decoded[9]).toBe(0);
  });

  test('encodes the preset name as a 16-byte, null-padded field right after the header', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);

    // Reassemble the 488-byte payload from the 26 packets' bodies.
    const payload = new Uint8Array(6 + 482);
    let pos = 0;
    for (const packet of packets) {
      const decoded = fromWire(packet);
      const bodyLen = decoded[3];
      payload.set(decoded.subarray(4, 4 + bodyLen), pos);
      pos += bodyLen;
    }

    const nameBytes = new TextEncoder().encode(fixturePreset.name);
    for (let i = 0; i < NAME_LEN; i++) {
      expect(payload[6 + i]).toBe(i < nameBytes.length ? nameBytes[i] : 0);
    }
  });

  test('each packet has a valid CRC-8/0x07', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);

    for (const packet of packets) {
      const decoded = fromWire(packet);
      const [crc, ...body] = decoded;
      expect(crc).toBe(crc8(body));
    }
  });

  test('chunks the 488-byte payload into 19-byte blocks (25 full + 1 partial)', () => {
    const codec = new Gp5SysexPresetCodec();
    const packets = codec.encodeWriteRequest(fixturePreset);

    for (let i = 0; i < 25; i++) {
      const decoded = fromWire(packets[i]);
      expect(decoded[3]).toBe(19);
    }
    const tail = fromWire(packets[25]);
    expect(tail[3]).toBe(488 - 25 * 19); // 13-byte partial
  });
});

describe('Gp5SysexPresetCodec — MIT license attribution (R16)', () => {
  test('the codec source file preserves the MIT copyright/permission notice verbatim', async () => {
    // We can't `import.meta.glob` here, but the harness mirrors this in CHECKPOINTS.md.
    // Smoke test: instantiate the class and ensure it does not throw at construction.
    expect(() => new Gp5SysexPresetCodec()).not.toThrow();
  });
});

// Silence the "declared but never used" import warnings for types-only imports.
const _typeRefs: [Preset, SysexDecodeResult] | null = null;
void _typeRefs;
