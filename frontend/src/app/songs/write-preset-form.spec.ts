import { describe, expect, test } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import {
  decodeSongPreset,
  mapFetchError,
  mapPedalWriteError,
  planWrites,
  targetSlotsFor,
  type WriteablePresetRef,
} from './write-preset-form';
import { GP5_CAPTURED_BODIES, capturedBodyBytes } from '../midi/gp5-captured-bodies.fixture';
import { encodePrstFile } from '../midi/gp5-prst-file';
import {
  GP5_BODY_LEN,
  NAME_LEN,
  decodeGp5Body,
} from '../midi/gp5-sysex-preset-codec';
import type { Preset } from '../midi/preset';

// F5 `import_preset_to_pedal` — R5, R7, R8, R13, R17, R21, R28-R33, R9-R12, R37.

// Build a 507-byte `.prst` fixture from any preset (with `raw`) so we can
// round-trip it through `decodeSongPreset`. Uses the real `encodePrstFile`
// from F4 so the fixture has the correct header, sentinel, CRC and layout.
function buildPrstBytes(body: Uint8Array, nameField: Uint8Array): Uint8Array {
  const chain = decodeGp5Body(body, 'name', 0).chain;
  const preset: Preset = { slot: 0, name: 'name', chain, raw: { body, nameField } };
  return encodePrstFile(preset);
}

// 16-byte name field builder (NUL-padded).
function buildNameField(name: string): Uint8Array {
  const f = new Uint8Array(NAME_LEN);
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < NAME_LEN; i++) f[i] = i < enc.length ? enc[i] : 0;
  return f;
}

describe('write-preset-form.decodeSongPreset (R7, R8, R13)', () => {
  test('returns ok with a 466-byte body and 16-byte nameField for a valid 507-byte .prst', () => {
    const body = capturedBodyBytes(0);
    const nameField = buildNameField('TL DLX AMP');
    const bytes = buildPrstBytes(body, nameField);

    const result = decodeSongPreset(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toEqual(body);
    expect(result.body.length).toBe(GP5_BODY_LEN);
    expect(result.nameField).toEqual(nameField);
    expect(result.nameField.length).toBe(NAME_LEN);
    expect(result.preset.raw).toBeDefined();
    expect(result.preset.raw!.body).toEqual(body);
    expect(result.preset.raw!.nameField).toEqual(nameField);
  });

  test('returns ok=false with bad_sentinel when the sentinel byte is corrupted (R8)', () => {
    const body = capturedBodyBytes(0);
    const nameField = buildNameField('TL DLX AMP');
    const fullPrst = buildPrstBytes(body, nameField);
    expect(fullPrst.length).toBe(507);
    const bad = new Uint8Array(fullPrst);
    // Corrupt one of the 0xff sentinel bytes at 0x15 to force bad_sentinel.
    bad[0x15] = 0x00;
    const r = decodeSongPreset(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('bad_sentinel');
  });

  test('returns a tagged error for a 506-byte buffer (R8)', () => {
    const body = capturedBodyBytes(0);
    const nameField = buildNameField('TL DLX AMP');
    const fullPrst = buildPrstBytes(body, nameField);
    const tooShort = fullPrst.subarray(0, 506);
    const r = decodeSongPreset(tooShort);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('wrong_length');
  });

  test('returns a tagged error for a 508-byte buffer (defense in depth)', () => {
    const body = capturedBodyBytes(0);
    const nameField = buildNameField('TL DLX AMP');
    const fullPrst = buildPrstBytes(body, nameField);
    const tooLong = new Uint8Array(fullPrst.length + 1);
    tooLong.set(fullPrst);
    const r = decodeSongPreset(tooLong);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('wrong_length');
  });

  test('returns a tagged error when the CRC is wrong (R8)', () => {
    const body = capturedBodyBytes(0);
    const nameField = buildNameField('TL DLX AMP');
    const fullPrst = buildPrstBytes(body, nameField);
    const corrupted = new Uint8Array(fullPrst);
    corrupted[0x14] ^= 0x01;
    const r = decodeSongPreset(corrupted);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('bad_crc');
  });
});

function makeRef(sortOrder: number, name = `preset${sortOrder}`): WriteablePresetRef {
  return { songId: 's1', sortOrder, presetId: `p${sortOrder}`, name, position: sortOrder + 1 };
}

describe('write-preset-form.targetSlotsFor (R28, R29)', () => {
  test('single mode returns [m]', () => {
    expect(targetSlotsFor(false, 5, 7)).toEqual([7]);
  });
  test('multi mode returns M, M+1, ..., M+N-1', () => {
    expect(targetSlotsFor(true, 3, 50)).toEqual([50, 51, 52]);
  });
  test('multi mode with N=1 returns [m]', () => {
    expect(targetSlotsFor(true, 1, 7)).toEqual([7]);
  });
  test('N=0 returns an empty list', () => {
    expect(targetSlotsFor(true, 0, 0)).toEqual([]);
    expect(targetSlotsFor(false, 0, 0)).toEqual([]);
  });
});

describe('write-preset-form.planWrites (R17, R21, R33)', () => {
  test('single mode (R23) returns one item at M with fromSlot=toSlot=M (the dialog passes a one-entry list when a single preset is picked)', () => {
    // The dialog is responsible for selecting which preset to send in
    // single mode — it passes that single entry to planWrites. planWrites
    // does not look at `entries.length` to choose single vs multi; that
    // signal is the `writeAll` flag.
    const entries = [makeRef(0, 'first')];
    const plan = planWrites({ entries, startSlot: 42, writeAll: false });
    expect(plan.items).toEqual([{ ref: entries[0], targetSlot: 42 }]);
    expect(plan.fromSlot).toBe(42);
    expect(plan.toSlot).toBe(42);
  });

  test('multi mode (R20) returns N items in sortOrder at M, M+1, ..., M+N-1', () => {
    const entries = [makeRef(0, 'a'), makeRef(1, 'b'), makeRef(2, 'c')];
    const plan = planWrites({ entries, startSlot: 50, writeAll: true });
    expect(plan.items).toEqual([
      { ref: entries[0], targetSlot: 50 },
      { ref: entries[1], targetSlot: 51 },
      { ref: entries[2], targetSlot: 52 },
    ]);
    expect(plan.fromSlot).toBe(50);
    expect(plan.toSlot).toBe(52);
  });

  test('throws out_of_range for slot 100 (R17)', () => {
    expect(() =>
      planWrites({ entries: [makeRef(0)], startSlot: 100, writeAll: false }),
    ).toThrowError('out_of_range');
  });

  test('throws out_of_range for negative slot (R17)', () => {
    expect(() =>
      planWrites({ entries: [makeRef(0)], startSlot: -1, writeAll: false }),
    ).toThrowError('out_of_range');
  });

  test('throws out_of_range for non-integer slot', () => {
    expect(() =>
      planWrites({ entries: [makeRef(0)], startSlot: 1.5, writeAll: false }),
    ).toThrowError('out_of_range');
  });

  test('throws not_enough_room for writeAll with N=5 at M=96 (only 4 slots free: 96..99, R21)', () => {
    const entries = [makeRef(0), makeRef(1), makeRef(2), makeRef(3), makeRef(4)];
    expect(() =>
      planWrites({ entries, startSlot: 96, writeAll: true }),
    ).toThrowError('not_enough_room');
  });

  test('accepts writeAll at the exact boundary M=95, N=5 (slots 95..99, R21)', () => {
    const entries = [makeRef(0), makeRef(1), makeRef(2), makeRef(3), makeRef(4)];
    const plan = planWrites({ entries, startSlot: 95, writeAll: true });
    expect(plan.toSlot).toBe(99);
  });

  test('accepts single at M=99 (R18)', () => {
    const plan = planWrites({
      entries: [makeRef(0)],
      startSlot: 99,
      writeAll: false,
    });
    expect(plan.fromSlot).toBe(99);
    expect(plan.toSlot).toBe(99);
  });

  test('throws empty when the song has no entries (R51 defensive, unreachable via UI)', () => {
    expect(() =>
      planWrites({ entries: [], startSlot: 0, writeAll: false }),
    ).toThrowError('empty');
  });
});

describe('write-preset-form.mapFetchError (R9-R12)', () => {
  test('404 → songNotFound (R9)', () => {
    const err = new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
    expect(mapFetchError(err)).toBe('writeToPedal.errors.songNotFound');
  });
  test('401 → sessionExpired (R10)', () => {
    const err = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
    expect(mapFetchError(err)).toBe('writeToPedal.errors.sessionExpired');
  });
  test('0 (network) → network (R11)', () => {
    const err = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
    expect(mapFetchError(err)).toBe('writeToPedal.errors.network');
  });
  test('500 → unexpected (R12)', () => {
    const err = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
    expect(mapFetchError(err)).toBe('writeToPedal.errors.unexpected');
  });
  test('non-HttpErrorResponse → unexpected', () => {
    expect(mapFetchError(new Error('boom'))).toBe('writeToPedal.errors.unexpected');
  });
});

describe('write-preset-form.mapPedalWriteError (R37, R34)', () => {
  test('not_connected → pedalDisconnected', () => {
    expect(mapPedalWriteError(new Error('not_connected'))).toBe(
      'writeToPedal.errors.pedalDisconnected',
    );
  });
  test('request_in_progress → busy', () => {
    expect(mapPedalWriteError(new Error('request_in_progress'))).toBe(
      'writeToPedal.errors.busy',
    );
  });
  test('read_timeout → timeout', () => {
    expect(mapPedalWriteError(new Error('read_timeout'))).toBe(
      'writeToPedal.errors.timeout',
    );
  });
  test('write_timeout → writeNotConfirmed (feature 28)', () => {
    expect(mapPedalWriteError(new Error('write_timeout'))).toBe(
      'writeToPedal.errors.writeNotConfirmed',
    );
  });
  test('write_rejected → writeRejected (feature 28)', () => {
    expect(mapPedalWriteError(new Error('write_rejected'))).toBe(
      'writeToPedal.errors.writeRejected',
    );
  });
  test('anything else → unexpected', () => {
    expect(mapPedalWriteError(new Error('something_else'))).toBe(
      'writeToPedal.errors.unexpected',
    );
    expect(mapPedalWriteError('plain string')).toBe('writeToPedal.errors.unexpected');
    expect(mapPedalWriteError(null)).toBe('writeToPedal.errors.unexpected');
  });
});
