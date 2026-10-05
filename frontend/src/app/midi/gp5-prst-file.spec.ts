import { describe, expect, test } from 'vitest';
import {
  GP5_PRST_HEADER,
  GP5_PRST_LEN,
  decodePrstFile,
  encodePrstFile,
  isReadablePrstNameField,
} from './gp5-prst-file';
import { crc8, decodeGp5Body, Gp5SysexPresetCodec } from './gp5-sysex-preset-codec';
import type { Preset, PresetRaw } from './preset';
import {
  GP5_CAPTURED_BODIES,
  capturedBodyBytes,
} from './gp5-captured-bodies.fixture';
import {
  TONELAB_TLDLXAMP_PRST_HEX,
  tonelabPrstBytes,
} from './gp5-tonelab-prst.fixture';

// Codec helpers, mirrored locally so this spec drives the real Gp5SysexPresetCodec
// end-to-end without duplicating the full wire-format harness.
const CATSEL = 0x12;
const NAME_SEL = 0x40;
const BODY_SEL = 0x41;
const SLOT_COUNT = 100;
const NAME_LEN = 16;
const GP5_BODY_LEN = 466;
const ECHO_LEN = 2;
const NAMES_BLOB_LEN = ECHO_LEN + SLOT_COUNT * 20;
const BODY_BLOB_LEN = ECHO_LEN + GP5_BODY_LEN;

function crc8Local(bytes: number[]): number {
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
  for (const b of buf) out.push((b >> 4) & 0x0f, b & 0x0f);
  return out;
}

function toWire(buf: number[]): Uint8Array {
  return new Uint8Array([0xf0, ...nibEncode(buf), 0xf7]);
}

function buildReply(opts: { chunkCount?: number; index: number; payload: number[] }): Uint8Array {
  const len = opts.payload.length;
  const body = [0, opts.chunkCount ?? 0x6a, opts.index, len, ...opts.payload];
  body[0] = crc8Local(body.slice(1));
  return toWire(body);
}

function chunkForReassembly(blob: Uint8Array): Uint8Array[] {
  const totalChunks = Math.ceil(blob.length / 19);
  const frames: Uint8Array[] = [];
  let i = 0;
  let index = 0;
  while (i < blob.length) {
    const end = Math.min(i + 19, blob.length);
    const payload = Array.from(blob.subarray(i, end));
    frames.push(buildReply({ chunkCount: totalChunks, index, payload }));
    i = end;
    index++;
  }
  return frames;
}

function buildNamesBlob(names: Map<number, string>): Uint8Array {
  const blob = new Uint8Array(NAMES_BLOB_LEN);
  blob[0] = CATSEL;
  blob[1] = NAME_SEL;
  const dv = new DataView(blob.buffer);
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

// Decodes one slot through the real Gp5SysexPresetCodec, given the body bytes
// and the name to label it with. Returns the decoded Preset.
function decodeOneSlot(body: Uint8Array, name: string): Preset {
  const codec = new Gp5SysexPresetCodec();
  codec.encodeReadAllRequest();
  const names = new Map<number, string>([[0, name]]);
  for (const f of chunkForReassembly(buildNamesBlob(names))) {
    codec.decodeIncomingMessage(f);
  }
  let last: ReturnType<Gp5SysexPresetCodec['decodeIncomingMessage']> = { kind: 'ignored' };
  for (const f of chunkForReassembly(buildBodyBlob(body))) {
    last = codec.decodeIncomingMessage(f);
  }
  if (last.kind !== 'preset') throw new Error('expected preset result');
  return last.preset;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('GP5_PRST_HEADER and constants', () => {
  test('header constant matches the layout: 0x47 0x50 0x2d 0x35 + zeros + 0x01 at 0x12', () => {
    expect(GP5_PRST_HEADER.length).toBe(20);
    expect(Array.from(GP5_PRST_HEADER.slice(0, 4))).toEqual([0x47, 0x50, 0x2d, 0x35]);
    expect(GP5_PRST_HEADER[0x12]).toBe(0x01);
    expect(GP5_PRST_LEN).toBe(507);
  });
});

describe('encodePrstFile (R5-R11)', () => {
  function presetWithRaw(nameField: Uint8Array, body: Uint8Array): Preset {
    const raw: PresetRaw = { body, nameField };
    return {
      slot: 0,
      name: 'placeholder',
      chain: [],
      raw,
    };
  }

  test('returns exactly 507 bytes (R5)', () => {
    const nameField = new Uint8Array(NAME_LEN);
    nameField.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
    const body = capturedBodyBytes(0);
    const out = encodePrstFile(presetWithRaw(nameField, body));
    expect(out).toHaveLength(GP5_PRST_LEN);
  });

  test('writes the name field verbatim at 0x19..0x28 (R7)', () => {
    const nameField = new Uint8Array(NAME_LEN);
    for (let i = 0; i < NAME_LEN; i++) nameField[i] = 0x20 + i;
    const out = encodePrstFile(presetWithRaw(nameField, capturedBodyBytes(0)));
    expect(out.subarray(0x19, 0x29)).toEqual(nameField);
  });

  test('writes the GP-5 header bytes 0x00..0x13 (R8) with 0x01 at 0x12', () => {
    const out = encodePrstFile(presetWithRaw(new Uint8Array(NAME_LEN), capturedBodyBytes(0)));
    for (let i = 0; i < 20; i++) {
      expect(out[i]).toBe(GP5_PRST_HEADER[i]);
    }
  });

  test('writes the sentinel ff ff ff ff at 0x15..0x18 (R9)', () => {
    const out = encodePrstFile(presetWithRaw(new Uint8Array(NAME_LEN), capturedBodyBytes(0)));
    expect(Array.from(out.subarray(0x15, 0x19))).toEqual([0xff, 0xff, 0xff, 0xff]);
  });

  test('writes byte 0x14 = crc8(0x15..end) (R10)', () => {
    const out = encodePrstFile(presetWithRaw(new Uint8Array(NAME_LEN), capturedBodyBytes(0)));
    const expected = crc8(out.subarray(0x15, GP5_PRST_LEN));
    expect(out[0x14]).toBe(expected);
  });

  test('throws preset_bytes_unavailable for no raw, a 465-byte body, or a 15-byte name field (R11)', () => {
    const presetNoRaw: Preset = { slot: 0, name: 'X', chain: [] };
    expect(() => encodePrstFile(presetNoRaw)).toThrow('preset_bytes_unavailable');

    const badBody = presetWithRaw(new Uint8Array(NAME_LEN), new Uint8Array(465));
    expect(() => encodePrstFile(badBody)).toThrow('preset_bytes_unavailable');

    const badName = presetWithRaw(new Uint8Array(15), capturedBodyBytes(0));
    expect(() => encodePrstFile(badName)).toThrow('preset_bytes_unavailable');
  });
});

describe('encodePrstFile — captured body round-trip (R6)', () => {
  test('decoding slot 0 through the real codec and encoding produces 0x29.. that equals the captured bytes', () => {
    const captured = capturedBodyBytes(0);
    const preset = decodeOneSlot(captured, GP5_CAPTURED_BODIES[0].name);
    expect(preset.raw).toBeDefined();
    const out = encodePrstFile(preset);
    expect(out.subarray(0x29, 0x29 + GP5_BODY_LEN)).toEqual(captured);
  });
});

describe('encodePrstFile — ToneLab reference file byte-exact reproduction (T13)', () => {
  test('slicing raw from the ToneLab fixture and encoding reproduces the file byte-for-byte', () => {
    const fixture = tonelabPrstBytes();
    const raw: PresetRaw = {
      body: fixture.subarray(0x29, 0x29 + GP5_BODY_LEN).slice(),
      nameField: fixture.subarray(0x19, 0x19 + NAME_LEN).slice(),
    };
    const preset: Preset = { slot: 0, name: 'TL DLX AMP', chain: [], raw };
    const out = encodePrstFile(preset);
    expect(out).toHaveLength(GP5_PRST_LEN);
    expect(Array.from(out)).toEqual(Array.from(fixture));
    expect(out[0x14]).toBe(0x10);
  });
});

describe('decodePrstFile (R12-R19)', () => {
  test('valid ToneLab file → ok with name TL DLX AMP, bytes byte-identical to the input, chain from decodeGp5Body (R12, R17, R18, R19)', () => {
    const input = tonelabPrstBytes();
    const result = decodePrstFile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('TL DLX AMP');
    expect(Array.from(result.bytes)).toEqual(Array.from(input));
    expect(result.bytes).not.toBe(input); // fresh buffer (R18)
    // chain deep-equals decodeGp5Body on 0x29..0x1FA
    const direct = decodeGp5Body(input.subarray(0x29, 0x29 + GP5_BODY_LEN), 'TL DLX AMP', 0).chain;
    expect(result.chain).toEqual(direct);
    expect(result.nameReadable).toBe(true); // T50/T53 boundary check
  });

  test('mutating the input after decoding leaves result.bytes unchanged (R18, defensive copy)', () => {
    const input = tonelabPrstBytes();
    const result = decodePrstFile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = Array.from(result.bytes);
    input[0x19] = 0x99;
    expect(Array.from(result.bytes)).toEqual(before);
  });

  test('506 bytes → wrong_length; 508 bytes → wrong_length (R12)', () => {
    const input = tonelabPrstBytes();
    const shorter = input.subarray(0, 506);
    const longer = new Uint8Array(GP5_PRST_LEN + 1);
    longer.set(input, 0);
    expect(decodePrstFile(shorter)).toEqual({ ok: false, error: 'wrong_length' });
    expect(decodePrstFile(longer)).toEqual({ ok: false, error: 'wrong_length' });
  });

  test('one header byte changed (0x12 → 0x00) → bad_header (R13)', () => {
    const input = tonelabPrstBytes();
    input[0x12] = 0x00;
    expect(decodePrstFile(input)).toEqual({ ok: false, error: 'bad_header' });
  });

  test('sentinel byte changed (0x16 → 0x00) → bad_sentinel (R14)', () => {
    const input = tonelabPrstBytes();
    input[0x16] = 0x00;
    expect(decodePrstFile(input)).toEqual({ ok: false, error: 'bad_sentinel' });
  });

  test('body byte flipped → bad_crc (R15)', () => {
    const input = tonelabPrstBytes();
    const idx = 0x29 + 7;
    input[idx] = input[idx] ^ 0x01;
    expect(decodePrstFile(input)).toEqual({ ok: false, error: 'bad_crc' });
  });

  test('a 506-byte buffer with a bad header still returns wrong_length (R16: order)', () => {
    const input = tonelabPrstBytes().subarray(0, 506);
    input[0x12] = 0x99; // would be bad_header if length allowed
    expect(decodePrstFile(input)).toEqual({ ok: false, error: 'wrong_length' });
  });

  test('a file whose name field is all 0x00 (CRC recomputed) decodes ok with name "" (R17)', () => {
    const input = tonelabPrstBytes();
    // Zero the name field at 0x19..0x28
    for (let i = 0x19; i < 0x29; i++) input[i] = 0x00;
    // Recompute CRC at 0x14
    input[0x14] = crc8(input.subarray(0x15, GP5_PRST_LEN));
    const result = decodePrstFile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('');
  });

  test('encodePrstFile(decodeOneSlot(captured)) round-trips to ok', () => {
    const captured = capturedBodyBytes(0);
    const preset = decodeOneSlot(captured, GP5_CAPTURED_BODIES[0].name);
    const file = encodePrstFile(preset);
    const result = decodePrstFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe(GP5_CAPTURED_BODIES[0].name);
    expect(Array.from(result.bytes)).toEqual(Array.from(file));
  });
});

describe('isReadablePrstNameField (R109-R113, T51)', () => {
  function field(...bytes: number[]): Uint8Array {
    const out = new Uint8Array(NAME_LEN);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i];
    return out;
  }

  // ascii(...): pad with zeros to 16 bytes.
  function ascii(...bytes: number[]): Uint8Array {
    return field(...bytes);
  }

  const cases: { name: string; input: Uint8Array; expected: boolean }[] = [
    // R109: valid name with all bytes in 0x20..0x7e and at least one non-space.
    { name: 'TL DLX AMP (NUL-padded)', input: ascii(0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50), expected: true },
    { name: '16 chars, no NUL, max length', input: field(0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50), expected: true },
    { name: 'untrimmed " LEAD "', input: ascii(0x20, 0x4c, 0x45, 0x41, 0x44, 0x20), expected: true },
    { name: '0x7e edge', input: ascii(0x7e), expected: true },
    { name: '0x20 boundary with a non-space', input: ascii(0x20, 0x21, 0x20), expected: true },
    // R111: blank (first byte is 0x00) or all spaces.
    { name: 'all 0x00 (blank)', input: field(0), expected: false },
    { name: '4 spaces, then 0x00 (all spaces)', input: ascii(0x20, 0x20, 0x20, 0x20, 0x00), expected: false },
    { name: '16 × 0x20 (all spaces)', input: field(0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20), expected: false },
    // R110: out-of-range byte.
    { name: '"TL" + 0x07 + "X"', input: ascii(0x54, 0x4c, 0x07, 0x58), expected: false },
    { name: '"AB" + 0x7f', input: ascii(0x41, 0x42, 0x7f), expected: false },
    { name: '"CAF" + UTF-8 é (0xc3 0xa9)', input: ascii(0x43, 0x41, 0x46, 0xc3, 0xa9), expected: false },
    { name: '"CAF" + 0xe9 (single non-ASCII byte)', input: ascii(0x43, 0x41, 0x46, 0xe9), expected: false },
    { name: '0x1f alone (control)', input: ascii(0x1f), expected: false },
    // R112: bytes after the NUL are not inspected.
    { name: '"AB" + 0x00 + 0xe9 0x07 (non-ASCII only after NUL)', input: ascii(0x41, 0x42, 0x00, 0xe9, 0x07), expected: true },
    // R113: length other than 16.
    { name: '15-byte input', input: new Uint8Array(15), expected: false },
    { name: '17-byte input', input: new Uint8Array(17), expected: false },
  ];

  for (const { name, input, expected } of cases) {
    test(name, () => {
      expect(isReadablePrstNameField(input)).toBe(expected);
    });
  }
});

describe('decodePrstFile.nameReadable (T50)', () => {
  test('ToneLab fixture decodes with nameReadable: true', () => {
    const result = decodePrstFile(tonelabPrstBytes());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nameReadable).toBe(true);
    expect(result.name).toBe('TL DLX AMP');
  });

  test('a copy of the ToneLab fixture with byte 0x19 set to 0xe9 (CRC recomputed) decodes ok:true with name non-empty and nameReadable: false', () => {
    const fixture = tonelabPrstBytes();
    fixture[0x19] = 0xe9;
    fixture[0x14] = crc8(fixture.subarray(0x15, GP5_PRST_LEN));
    const result = decodePrstFile(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).not.toBe('');
    expect(result.nameReadable).toBe(false);
  });
});