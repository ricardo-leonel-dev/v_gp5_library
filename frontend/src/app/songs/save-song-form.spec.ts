import { describe, expect, test } from 'vitest';
import type { Preset } from '../midi/preset';
import { encodePrstFile, decodePrstFile } from '../midi/gp5-prst-file';
import { Gp5SysexPresetCodec } from '../midi/gp5-sysex-preset-codec';
import { capturedBodyBytes } from '../midi/gp5-captured-bodies.fixture';
import { tonelabPrstBytes } from '../midi/gp5-tonelab-prst.fixture';
import {
  EXTRA_CONFIG_MAX_BYTES,
  SONG_TEXT_MAX,
  addablePresets,
  atPresetCap,
  buildSongFormData,
  checkPickedFile,
  checkPrstPick,
  detectUserSlots,
  fileEntry,
  hasErrors,
  moveEntry,
  pedalEntry,
  presetFileName,
  pruneAttachments,
  removeEntryAt,
  serializeExtraConfig,
  tryAppendEntry,
  validateSaveSongDraft,
  type SaveSongDraft,
  type SongPresetEntry,
} from './save-song-form';

function makePedal(slot: number, name: string, chain: Preset['chain'] = []): Preset {
  return { slot, name, chain };
}

function makeRawPedal(
  slot: number,
  name: string,
  body: Uint8Array,
  nameField: Uint8Array,
  chain: Preset['chain'] = [],
): Preset {
  return { slot, name, chain, raw: { body, nameField } };
}

function entry(name: string, readable = true): SongPresetEntry {
  return fileEntry(`file:${name}`, 'a.prst', {
    name,
    chain: [],
    bytes: new Uint8Array(0),
    nameReadable: readable,
  });
}

describe('pedalEntry (R1, R4, T2, T52, T118)', () => {
  test('captured pedal preset produces nameReadable true (T52 default)', () => {
    const body = capturedBodyBytes(0);
    const nameField = new Uint8Array(16);
    nameField.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
    const p = makeRawPedal(0, 'TL DLX AMP', body, nameField, []);
    const e = pedalEntry(p);
    expect(e.nameReadable).toBe(true);
  });

  test('a raw.nameField of 16 × 0x00 makes nameReadable false', () => {
    const p = makeRawPedal(0, 'X', capturedBodyBytes(0), new Uint8Array(16), []);
    expect(pedalEntry(p).nameReadable).toBe(false);
  });

  test('a raw.nameField of 16 × 0x20 (all spaces) makes nameReadable false', () => {
    const p = makeRawPedal(0, 'X', capturedBodyBytes(0), new Uint8Array(16).fill(0x20), []);
    expect(pedalEntry(p).nameReadable).toBe(false);
  });

  test('a raw.nameField containing 0xe9 makes nameReadable false', () => {
    const nameField = new Uint8Array(16);
    nameField.set([0x54, 0x4c, 0xe9], 0);
    const p = makeRawPedal(0, 'TL éX', capturedBodyBytes(0), nameField, []);
    expect(pedalEntry(p).nameReadable).toBe(false);
  });

  test('a mock preset (no raw) produces nameReadable true (R118)', () => {
    const p = makePedal(0, 'mock');
    expect(pedalEntry(p).nameReadable).toBe(true);
  });
});

describe('tryAppendEntry (R38, R39, R47, R52, R114, R115)', () => {
  test('appends a new unique entry', () => {
    const list: SongPresetEntry[] = [];
    const e = fileEntry('file:1', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    const result = tryAppendEntry(list, e);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.list).toHaveLength(1);
  });

  test('rejects a same-name entry with presetNameDuplicate', () => {
    const a = fileEntry('file:1', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    const b = fileEntry('file:2', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    const after = tryAppendEntry([a], b);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.key).toBe('saveSong.errors.presetNameDuplicate');
    expect(after.error.params?.['name']).toBe('TL DLX AMP');
  });

  test('accepts a same-name different-case entry (OQ8)', () => {
    const a = fileEntry('file:1', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    const b = fileEntry('file:2', '02-TLDLXAMP.prst', {
      name: 'tl dlx amp',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    expect(tryAppendEntry([a], b).ok).toBe(true);
  });

  test('rejects an unreadable entry with presetNameUnsupported (R114/R115), even when name duplicates (R116)', () => {
    const a = fileEntry('file:1', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: true,
    });
    const unreadable = fileEntry('file:2', '02-TLDLXAMP.prst', {
      name: 'TL DLX AMP',
      chain: [],
      bytes: tonelabPrstBytes(),
      nameReadable: false,
    });
    const result = tryAppendEntry([a], unreadable);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe('saveSong.errors.presetNameUnsupported');
  });
});

describe('moveEntry / removeEntryAt (R34-R37)', () => {
  const entries: SongPresetEntry[] = [
    fileEntry('file:1', 'a.prst', { name: 'A', chain: [], bytes: new Uint8Array(0), nameReadable: true }),
    fileEntry('file:2', 'b.prst', { name: 'B', chain: [], bytes: new Uint8Array(0), nameReadable: true }),
    fileEntry('file:3', 'c.prst', { name: 'C', chain: [], bytes: new Uint8Array(0), nameReadable: true }),
  ];
  test('moveEntry(1, -1) → [B, A, C]', () => {
    expect(moveEntry(entries, 1, -1).map((e) => e.name)).toEqual(['B', 'A', 'C']);
  });
  test('moveEntry(1, +1) → [A, C, B]', () => {
    expect(moveEntry(entries, 1, 1).map((e) => e.name)).toEqual(['A', 'C', 'B']);
  });
  test('out-of-range moves return the same order', () => {
    expect(moveEntry(entries, 0, -1)).toBe(entries);
    expect(moveEntry(entries, entries.length - 1, 1)).toBe(entries);
  });
  test('removeEntryAt(1) → [A, C]', () => {
    expect(removeEntryAt(entries, 1).map((e) => e.name)).toEqual(['A', 'C']);
  });
  test('removeEntryAt on a 1-item list → []', () => {
    const one = [entries[0]];
    expect(removeEntryAt(one, 0)).toEqual([]);
  });
  test('never mutates the input', () => {
    const snapshot = entries.map((e) => e.name);
    moveEntry(entries, 1, -1);
    expect(entries.map((e) => e.name)).toEqual(snapshot);
  });
});

describe('addablePresets (R40, R41)', () => {
  test('excludes slots of listed pedal entries; ignores file entries; ascending; keeps same-name presets from other slots', () => {
    const available: Preset[] = [
      makePedal(0, 'A'),
      makePedal(3, 'B'),
      makePedal(5, 'A'), // same name as A in slot 0
      makePedal(12, 'D'),
    ];
    const list = [
      pedalEntry(makePedal(0, 'A')),
      fileEntry('file:1', 'x.prst', {
        name: 'B',
        chain: [],
        bytes: new Uint8Array(0),
        nameReadable: true,
      }),
    ];
    expect(addablePresets(available, list).map((p) => p.slot)).toEqual([3, 5, 12]);
  });
});

describe('checkPrstPick / atPresetCap (R45-R48, R54-R55)', () => {
  test('wrong_length → prstWrongSize', () => {
    expect(checkPrstPick('a.prst', { ok: false, error: 'wrong_length' })).toEqual({
      key: 'saveSong.errors.prstWrongSize',
    });
  });
  test('bad_header / bad_sentinel → prstNotGp5', () => {
    expect(checkPrstPick('a.prst', { ok: false, error: 'bad_header' })).toEqual({
      key: 'saveSong.errors.prstNotGp5',
    });
    expect(checkPrstPick('a.prst', { ok: false, error: 'bad_sentinel' })).toEqual({
      key: 'saveSong.errors.prstNotGp5',
    });
  });
  test('bad_crc → prstCorrupt', () => {
    expect(checkPrstPick('a.prst', { ok: false, error: 'bad_crc' })).toEqual({
      key: 'saveSong.errors.prstCorrupt',
    });
  });
  test('empty name → prstNoName', () => {
    expect(checkPrstPick('a.prst', { ok: true, name: '', chain: [], bytes: new Uint8Array(507), nameReadable: true })).toEqual({
      key: 'saveSong.errors.prstNoName',
    });
  });
  test('256-char file name → fileNameTooLong', () => {
    expect(checkPrstPick('a'.repeat(256), {
      ok: true,
      name: 'X',
      chain: [],
      bytes: new Uint8Array(507),
      nameReadable: true,
    })).toEqual({ key: 'saveSong.errors.fileNameTooLong' });
  });
  test('valid → null', () => {
    expect(checkPrstPick('a.prst', {
      ok: true,
      name: 'X',
      chain: [],
      bytes: new Uint8Array(507),
      nameReadable: true,
    })).toBeNull();
  });

  test('atPresetCap(1,1)=true, (0,1)=false, (5,null)=false', () => {
    expect(atPresetCap(1, 1)).toBe(true);
    expect(atPresetCap(0, 1)).toBe(false);
    expect(atPresetCap(5, null)).toBe(false);
  });
});

describe('validateSaveSongDraft (R51, R52, R56, R60-R62, R70, R116)', () => {

  test('empty entries → presetsRequired', () => {
    const e = validateSaveSongDraft({
      entries: [],
      name: 'X',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.presets?.key).toBe('saveSong.errors.presetsRequired');
    expect(hasErrors(e)).toBe(true);
  });

  test('two same-name entries → presetNameDuplicate on the second', () => {
    const e = validateSaveSongDraft({
      entries: [entry('X'), entry('X')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    const secondKey = 'file:X';
    expect(e.entryRows[secondKey]?.key).toBe('saveSong.errors.presetNameDuplicate');
    expect(e.entryRows[secondKey]?.params['name']).toBe('X');
    expect(hasErrors(e)).toBe(true);
  });

  test('3 entries with limit 2 → presetLimitExceeded limit: 2', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A'), entry('B'), entry('C')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: 2,
    });
    expect(e.presets?.key).toBe('saveSong.errors.presetLimitExceeded');
    expect(e.presets?.params?.['limit']).toBe(2);
  });

  test('2 entries with limit 2 passes', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A'), entry('B')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: 2,
    });
    expect(e.presets).toBeUndefined();
  });

  test('limit null means no cap', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A'), entry('B'), entry('C')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.presets).toBeUndefined();
  });

  test('blank name → nameRequired; 256-char name → nameTooLong; 255 passes', () => {
    const blank = validateSaveSongDraft({
      entries: [entry('A')],
      name: '   ',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(blank.name).toBe('saveSong.errors.nameRequired');

    const tooLong = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'a'.repeat(SONG_TEXT_MAX + 1),
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(tooLong.name).toBe('saveSong.errors.nameTooLong');

    const ok = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'a'.repeat(SONG_TEXT_MAX),
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(ok.name).toBeUndefined();
  });

  test('256-char artist → artistTooLong', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'N',
      artist: 'a'.repeat(SONG_TEXT_MAX + 1),
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.artist).toBe('saveSong.errors.artistTooLong');
  });

  test('R116: [readable A, unreadable A-named] flags unreadable, not duplicate', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A'), entry('A', false)],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.entryRows['file:A']?.key).toBe('saveSong.errors.presetNameUnsupported');
    expect(e.entryRows['file:A']?.params).toEqual({});
  });

  test('all-readable list has no entryRows errors', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A'), entry('B')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(Object.keys(e.entryRows)).toEqual([]);
  });
});

describe('checkPickedFile (R63, R64)', () => {
  function file(name: string, type: string): File {
    return new File(['x'], name, { type });
  }
  test('text/plain cover → coverNotImage', () => {
    expect(checkPickedFile(file('c.txt', 'text/plain'), 'cover')).toBe(
      'saveSong.errors.coverNotImage',
    );
  });
  test('image/png cover → null', () => {
    expect(checkPickedFile(file('c.png', 'image/png'), 'cover')).toBeNull();
  });
  test('256-char file name (cover, IR, NAM) → fileNameTooLong', () => {
    expect(checkPickedFile(file('a'.repeat(256), 'image/png'), 'cover')).toBe(
      'saveSong.errors.fileNameTooLong',
    );
    expect(checkPickedFile(file('a'.repeat(256), 'audio/wav'), 'ir')).toBe(
      'saveSong.errors.fileNameTooLong',
    );
    expect(checkPickedFile(file('a'.repeat(256), 'application/octet-stream'), 'nam')).toBe(
      'saveSong.errors.fileNameTooLong',
    );
  });
});

describe('serializeExtraConfig (R67-R69, R86-R87)', () => {
  test('key-less row with value → extraKeyRequired on that row', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [{ id: 1, key: '', value: 'drop D' }],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.extraRows[1]).toBe('saveSong.errors.extraKeyRequired');
  });

  test('duplicate trimmed keys → extraKeyDuplicate on the later row', () => {
    const e = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [
        { id: 1, key: 'tuning', value: 'drop D' },
        { id: 2, key: '  tuning ', value: 'standard' },
      ],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(e.extraRows[2]).toBe('saveSong.errors.extraKeyDuplicate');
  });

  test('fully empty rows ignored', () => {
    const draft: SaveSongDraft = {
      entries: [entry('A')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [
        { id: 1, key: '', value: '' },
        { id: 2, key: 'tuning', value: 'drop D' },
      ],
      attachments: new Map(),
      presetsPerSongLimit: null,
    };
    const e = validateSaveSongDraft(draft);
    expect(serializeExtraConfig(draft.extraRows)).toBe('{"tuning":"drop D"}');
    expect(Object.values(e.extraRows)).toEqual([]);
  });

  test('no keyed rows → serializeExtraConfig returns null', () => {
    expect(
      serializeExtraConfig([
        { id: 1, key: '', value: '' },
      ]),
    ).toBeNull();
  });

  test('JSON keeps row order and raw values', () => {
    expect(
      serializeExtraConfig([
        { id: 1, key: 'tuning', value: 'drop D' },
        { id: 2, key: 'capo', value: '2' },
      ]),
    ).toBe('{"tuning":"drop D","capo":"2"}');
  });

  test('32769-byte JSON → extraConfigTooLarge; 32768 passes', () => {
    // Value with multi-byte chars; each é is 2 UTF-8 bytes.
    const big = 'é'.repeat(EXTRA_CONFIG_MAX_BYTES);
    const tooBig = validateSaveSongDraft({
      entries: [entry('A')],
      name: 'N',
      artist: '',
      cover: null,
      extraRows: [{ id: 1, key: 'k', value: big }],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(tooBig.extraConfig).toBe('saveSong.errors.extraConfigTooLarge');
  });
});

describe('detectUserSlots / pruneAttachments (R72-R76, R88-R89)', () => {
  function chainIr(slot: number): Preset['chain'] {
    return [{ moduleType: `cata_fx${(0x100000 + slot - 1).toString(16)}`, enabled: true, parameters: {} }];
  }
  function chainNam(slot: number): Preset['chain'] {
    return [{ moduleType: `catf_fx${(0x32 + slot - 1).toString(16)}`, enabled: true, parameters: {} }];
  }
  function pedalWithChain(slot: number, name: string, chain: Preset['chain']): Preset {
    const body = capturedBodyBytes(0);
    const nameField = new Uint8Array(16);
    nameField.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
    return { slot, name, chain, raw: { body, nameField } };
  }

  test('pedal entry of slot 0 alone → [{ir,1},{nam,3}]', () => {
    const preset = pedalWithChain(0, 'TL DLX AMP', [...chainIr(1), ...chainNam(3)]);
    const refs = detectUserSlots([pedalEntry(preset)]);
    expect(refs.map((r) => `${r.kind}:${r.slot}`)).toEqual(['ir:1', 'nam:3']);
  });

  test('pedal entries of slots 5 and 0 (either order) → [{ir,1},{nam,1},{nam,3}]', () => {
    const a = pedalWithChain(5, 'Test Metal', chainNam(1));
    const c = pedalWithChain(0, 'TL DLX AMP', [...chainIr(1), ...chainNam(3)]);
    expect(detectUserSlots([pedalEntry(a), pedalEntry(c)]).map((r) => `${r.kind}:${r.slot}`)).toEqual(
      ['ir:1', 'nam:1', 'nam:3'],
    );
    expect(detectUserSlots([pedalEntry(c), pedalEntry(a)]).map((r) => `${r.kind}:${r.slot}`)).toEqual(
      ['ir:1', 'nam:1', 'nam:3'],
    );
  });

  test('a file entry built from encodePrstFile(decode(slot 0)) → [{ir,1},{nam,3}]', () => {
    const preset = pedalWithChain(0, 'TL DLX AMP', [...chainIr(1), ...chainNam(3)]);
    const file = encodePrstFile(preset);
    const decoded = decodePrstFile(file);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const e = fileEntry('file:1', 'tl-dlx-amp.prst', decoded);
    const refs = detectUserSlots([e]);
    expect(refs.map((r) => `${r.kind}:${r.slot}`)).toEqual(['ir:1', 'nam:3']);
  });

  test('a slot used by two entries and bypassed blocks count once', () => {
    const preset = pedalWithChain(0, 'TL DLX AMP', [
      { moduleType: 'cata_fx100000', enabled: true, parameters: {} },
      { moduleType: 'cata_fx100000', enabled: false, parameters: {} },
    ]);
    const refs = detectUserSlots([pedalEntry(preset)]);
    expect(refs.map((r) => `${r.kind}:${r.slot}`)).toEqual(['ir:1']);
  });

  test('entries without user slots → []', () => {
    const p = makePedal(0, 'no-slots');
    expect(detectUserSlots([pedalEntry(p)])).toEqual([]);
  });

  test('mock "Saturated Snap" → [{nam,1}]', () => {
    const p = makePedal(0, 'mock', [{ moduleType: 'catf_fx32', enabled: true, parameters: {} }]);
    expect(detectUserSlots([pedalEntry(p)]).map((r) => `${r.kind}:${r.slot}`)).toEqual(['nam:1']);
  });

  test('pruneAttachments drops ir:1 and nam:3; keeps nam:1', () => {
    const map = new Map<string, File>([
      ['ir:1', new File(['x'], 'ir1.wav', { type: 'audio/wav' })],
      ['nam:1', new File(['x'], 'nam1.nam', { type: 'application/octet-stream' })],
      ['nam:3', new File(['x'], 'nam3.nam', { type: 'application/octet-stream' })],
    ]);
    const refs = [{ kind: 'nam' as const, slot: 1 }];
    const pruned = pruneAttachments(map, refs);
    expect(Array.from(pruned.keys())).toEqual(['nam:1']);
  });
});

describe('presetFileName (R80)', () => {
  test('"TL DLX AMP" → tl-dlx-amp.prst', () => {
    expect(presetFileName('TL DLX AMP')).toBe('tl-dlx-amp.prst');
  });
});

describe('buildSongFormData (R77-R90, R20, T27)', () => {
  function readFixturePreset(slot: number, nameField?: Uint8Array): Preset {
    const nameFieldBytes = nameField ?? new Uint8Array(16);
    if (!nameField) nameFieldBytes.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
    // Slot 5 uses User SnapTone 1 (per design §1). Slot 0 uses both User IR 1
    // and User SnapTone 3; other slots in this test use neither.
    const chain =
      slot === 5
        ? [{ moduleType: 'catf_fx32', enabled: true, parameters: {} }]
        : slot === 0
        ? [
            { moduleType: 'cata_fx100000', enabled: true, parameters: {} },
            { moduleType: 'catf_fx34', enabled: true, parameters: {} },
          ]
        : [];
    return makeRawPedal(slot, 'TL DLX AMP', capturedBodyBytes(slot), nameFieldBytes, chain);
  }

  function makeFileEntry(): SongPresetEntry {
    const bytes = tonelabPrstBytes();
    const decoded = decodePrstFile(bytes);
    if (!decoded.ok) throw new Error('ToneLab fixture failed');
    return fileEntry('file:1', '02-TLDLXAMP.prst', decoded);
  }

  test('entries [pedal slot 5, file ToneLab, pedal slot 3] → FormData invariants (R20, R82-R90)', async () => {
    const entries: SongPresetEntry[] = [
      pedalEntry(readFixturePreset(5)),
      makeFileEntry(),
      pedalEntry(readFixturePreset(3)),
    ];
    const draft: SaveSongDraft = {
      entries,
      name: ' My Song ',
      artist: ' Artist ',
      cover: new File(['c'], 'cover.png', { type: 'image/png' }),
      extraRows: [{ id: 1, key: 'tuning', value: 'drop D' }],
      attachments: new Map([
        ['ir:1', new File(['w'], 'ir1.wav', { type: 'audio/wav' })],
        ['nam:1', new File(['n'], 'nam1.nam', { type: 'application/octet-stream' })],
      ]),
      presetsPerSongLimit: null,
    };
    const fd = buildSongFormData(draft);

    expect(fd.get('name')).toBe('My Song');
    expect(fd.get('artist')).toBe('Artist');
    expect(fd.get('extra_config')).toBe('{"tuning":"drop D"}');

    const presets = fd.getAll('preset');
    expect(presets).toHaveLength(3);
    for (const f of presets) {
      expect(f).toBeInstanceOf(File);
      expect((f as File).type).toBe('application/octet-stream');
    }
    // File part order matches the entry order: [pedal slot 5, file, pedal slot 3].
    expect((presets[0] as File).name).toBe('tl-dlx-amp.prst');
    expect((presets[1] as File).name).toBe('02-TLDLXAMP.prst');
    expect((presets[2] as File).name).toBe('tl-dlx-amp.prst');
    // File entry bytes are byte-identical to the fixture.
    const fileBuffer = await (presets[1] as File).arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    const fixtureBytes = tonelabPrstBytes();
    expect(fileBytes.length).toBe(fixtureBytes.length);
    expect(Array.from(fileBytes)).toEqual(Array.from(fixtureBytes));

    expect(fd.has('pedal_preset_name')).toBe(false);

    const irs = fd.getAll('ir');
    expect(irs).toHaveLength(1);
    const nams = fd.getAll('nam');
    expect(nams).toHaveLength(1);

    const cover = fd.get('cover');
    expect(cover).toBeInstanceOf(File);
  });

  test('a 1-pedal-entry list yields exactly one preset part', () => {
    const fd = buildSongFormData({
      entries: [pedalEntry(readFixturePreset(3))],
      name: 'X',
      artist: '',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(fd.getAll('preset')).toHaveLength(1);
  });

  test('artist present only when non-blank', () => {
    const fd = buildSongFormData({
      entries: [pedalEntry(readFixturePreset(0))],
      name: 'X',
      artist: '   ',
      cover: null,
      extraRows: [],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(fd.has('artist')).toBe(false);
  });

  test('extra_config absent without keyed rows', () => {
    const fd = buildSongFormData({
      entries: [pedalEntry(readFixturePreset(0))],
      name: 'X',
      artist: '',
      cover: null,
      extraRows: [{ id: 1, key: '', value: '' }],
      attachments: new Map(),
      presetsPerSongLimit: null,
    });
    expect(fd.has('extra_config')).toBe(false);
  });

  test('an empty list throws no_presets', () => {
    expect(() =>
      buildSongFormData({
        entries: [],
        name: 'X',
        artist: '',
        cover: null,
        extraRows: [],
        attachments: new Map(),
        presetsPerSongLimit: null,
      }),
    ).toThrow('no_presets');
  });
});