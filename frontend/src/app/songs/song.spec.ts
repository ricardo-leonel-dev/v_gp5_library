import { describe, expect, test } from 'vitest';
import {
  coverHintForListSong,
  extraConfigEntries,
  formatByteSize,
  hasCoverFile,
  isBlank,
  orderedPresets,
  userFiles,
  type Song,
  type SongFile,
  type SongPreset,
} from './song';

describe('orderedPresets (F26 R31, R80)', () => {
  test('returns a new array sorted by sortOrder ascending', () => {
    const presets: SongPreset[] = [
      { id: 'p1', sortOrder: 1, name: 'B' },
      { id: 'p0', sortOrder: 0, name: 'A' },
      { id: 'p2', sortOrder: 2, name: 'C' },
    ];
    const result = orderedPresets(presets);
    expect(result.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
  });

  test('does not mutate the input array', () => {
    const presets: SongPreset[] = [
      { id: 'p1', sortOrder: 1, name: 'B' },
      { id: 'p0', sortOrder: 0, name: 'A' },
    ];
    const beforeIds = presets.map((p) => p.id);
    orderedPresets(presets);
    expect(presets.map((p) => p.id)).toEqual(beforeIds);
  });

  test('handles empty input', () => {
    expect(orderedPresets([])).toEqual([]);
  });

  test('returns a new array instance', () => {
    const presets: SongPreset[] = [{ id: 'p0', sortOrder: 0, name: 'A' }];
    const result = orderedPresets(presets);
    expect(result).not.toBe(presets);
  });
});

describe('hasCoverFile (F26 R35, R36)', () => {
  test('true when at least one file has kind "cover"', () => {
    const files: SongFile[] = [
      {
        id: 'f1',
        kind: 'cover',
        originalFilename: 'cover.png',
        mimeType: 'image/png',
        byteSize: 100,
        sortOrder: 0,
        createdAt: '2026-10-01',
      },
      {
        id: 'f2',
        kind: 'ir',
        originalFilename: 'ir.wav',
        mimeType: 'audio/wav',
        byteSize: 200,
        sortOrder: 1,
        createdAt: '2026-10-01',
      },
    ];
    expect(hasCoverFile(files)).toBe(true);
  });

  test('false when no cover present', () => {
    const files: SongFile[] = [
      {
        id: 'f1',
        kind: 'ir',
        originalFilename: 'ir.wav',
        mimeType: 'audio/wav',
        byteSize: 200,
        sortOrder: 0,
        createdAt: '2026-10-01',
      },
    ];
    expect(hasCoverFile(files)).toBe(false);
  });

  test('false on empty array', () => {
    expect(hasCoverFile([])).toBe(false);
  });
});

describe('isBlank (F26 R7, R8, R30)', () => {
  test('null → true', () => {
    expect(isBlank(null)).toBe(true);
  });
  test('undefined → true', () => {
    expect(isBlank(undefined)).toBe(true);
  });
  test("'' → true", () => {
    expect(isBlank('')).toBe(true);
  });
  test("'  ' → true", () => {
    expect(isBlank('  ')).toBe(true);
  });
  test("'Queen' → false", () => {
    expect(isBlank('Queen')).toBe(false);
  });
  test("' A ' → false", () => {
    expect(isBlank(' A ')).toBe(false);
  });
});

describe('coverHintForListSong (F26 R13, design §4)', () => {
  test('returns undefined for any list song (backend has no has-cover yet)', () => {
    const song: Song = {
      id: 's',
      name: 'x',
      presets: [],
    };
    expect(coverHintForListSong(song)).toBeUndefined();
  });
});

function makeFile(kind: SongFile['kind'], id: string, sortOrder: number, byteSize = 0): SongFile {
  return {
    id,
    kind,
    originalFilename: `${kind}-${id}.bin`,
    mimeType: kind === 'cover' ? 'image/png' : 'application/octet-stream',
    byteSize,
    sortOrder,
    createdAt: '2026-10-01',
  };
}

describe('userFiles (F33 R3, R4)', () => {
  test('drops cover, sorts ir before nam and by sortOrder within a kind', () => {
    const ir0 = makeFile('ir', 'ir-0', 0);
    const ir1 = makeFile('ir', 'ir-1', 1);
    const nam0 = makeFile('nam', 'nam-0', 0);
    const nam1 = makeFile('nam', 'nam-1', 1);
    const cover = makeFile('cover', 'cov', 0);
    const shuffled: SongFile[] = [cover, nam1, ir0, nam0, ir1];
    const result = userFiles(shuffled);
    expect(result.map((f) => f.id)).toEqual(['ir-0', 'ir-1', 'nam-0', 'nam-1']);
  });

  test('drops cover even when it sits between non-cover entries', () => {
    const cover = makeFile('cover', 'cov', 1);
    const ir0 = makeFile('ir', 'ir-0', 0);
    const ir2 = makeFile('ir', 'ir-2', 2);
    const nam0 = makeFile('nam', 'nam-0', 0);
    const shuffled: SongFile[] = [ir2, cover, nam0, ir0];
    const result = userFiles(shuffled);
    expect(result.map((f) => f.id)).toEqual(['ir-0', 'ir-2', 'nam-0']);
  });

  test('never mutates the input array', () => {
    const cover = makeFile('cover', 'cov', 0);
    const ir1 = makeFile('ir', 'ir-1', 1);
    const ir0 = makeFile('ir', 'ir-0', 0);
    const files: SongFile[] = [cover, ir1, ir0];
    const beforeIds = files.map((f) => f.id);
    userFiles(files);
    expect(files.map((f) => f.id)).toEqual(beforeIds);
  });

  test('returns [] when only the cover is present', () => {
    const files: SongFile[] = [makeFile('cover', 'cov', 0)];
    expect(userFiles(files)).toEqual([]);
  });

  test('returns [] on empty input', () => {
    expect(userFiles([])).toEqual([]);
  });
});

describe('formatByteSize (F33 R9, R10, R11, R12)', () => {
  test('0 bytes → size_mb "0.00" in en, "0,00" in es', () => {
    expect(formatByteSize(0, 'en')).toEqual({ key: 'songDetail.size_mb', value: '0.00' });
    expect(formatByteSize(0, 'es')).toEqual({ key: 'songDetail.size_mb', value: '0,00' });
  });

  test('1..5242 bytes → size_mb_below_min "0.01" / "0,01"', () => {
    expect(formatByteSize(1, 'en')).toEqual({
      key: 'songDetail.size_mb_below_min',
      value: '0.01',
    });
    expect(formatByteSize(5242, 'es')).toEqual({
      key: 'songDetail.size_mb_below_min',
      value: '0,01',
    });
  });

  test('non-integer 0 < bytes < 5243 → size_mb_below_min (no flooring to 0)', () => {
    expect(formatByteSize(0.5, 'en')).toEqual({
      key: 'songDetail.size_mb_below_min',
      value: '0.01',
    });
    expect(formatByteSize(5242.5, 'en')).toEqual({
      key: 'songDetail.size_mb_below_min',
      value: '0.01',
    });
  });

  test('5243 bytes → size_mb "0.01" (rounds above the sub-0.005 floor)', () => {
    expect(formatByteSize(5243, 'en')).toEqual({ key: 'songDetail.size_mb', value: '0.01' });
  });

  test('31457 bytes → 0.03 / 0,03', () => {
    expect(formatByteSize(31457, 'en').value).toBe('0.03');
    expect(formatByteSize(31457, 'es').value).toBe('0,03');
  });

  test('131072 bytes (0.125 MB) → 0.13 (halfExpand away from zero)', () => {
    expect(formatByteSize(131072, 'en').value).toBe('0.13');
  });

  test('1048576 bytes (exactly 1 MB) → 1.00 / 1,00', () => {
    expect(formatByteSize(1048576, 'en').value).toBe('1.00');
    expect(formatByteSize(1048576, 'es').value).toBe('1,00');
  });

  test('1572864 bytes (1.5 MB) → 1.50 / 1,50', () => {
    expect(formatByteSize(1572864, 'en').value).toBe('1.50');
    expect(formatByteSize(1572864, 'es').value).toBe('1,50');
  });

  test('1073741824 bytes (1024 MB) → 1024.00 / 1024,00 (no grouping)', () => {
    expect(formatByteSize(1073741824, 'en').value).toBe('1024.00');
    expect(formatByteSize(1073741824, 'es').value).toBe('1024,00');
  });

  test('negative input is treated as 0', () => {
    expect(formatByteSize(-1, 'en')).toEqual({ key: 'songDetail.size_mb', value: '0.00' });
  });

  test('NaN input is treated as 0', () => {
    expect(formatByteSize(NaN, 'es')).toEqual({ key: 'songDetail.size_mb', value: '0,00' });
  });
});

describe('extraConfigEntries (F33 R15-R20)', () => {
  test('returns [] for undefined', () => {
    expect(extraConfigEntries(undefined)).toEqual([]);
  });

  test('returns [] for null', () => {
    expect(extraConfigEntries(null)).toEqual([]);
  });

  test('returns [] for an array', () => {
    expect(extraConfigEntries(['a', 'b'])).toEqual([]);
  });

  test('returns [] for {}', () => {
    expect(extraConfigEntries({})).toEqual([]);
  });

  test('string value kept verbatim, empty / whitespace → kind "empty"', () => {
    const result = extraConfigEntries({ note: 'Solo starts on bar 17', blank: '', spaces: '  ' });
    expect(result).toEqual([
      { key: 'note', value: 'Solo starts on bar 17', kind: 'text' },
      { key: 'blank', value: '', kind: 'empty' },
      { key: 'spaces', value: '', kind: 'empty' },
    ]);
  });

  test('multi-line string keeps line breaks', () => {
    const result = extraConfigEntries({
      notes: 'line 1\nline 2\nline 3',
    });
    expect(result).toEqual([
      { key: 'notes', value: 'line 1\nline 2\nline 3', kind: 'text' },
    ]);
  });

  test('number / boolean values → kind "text" via String(value)', () => {
    const result = extraConfigEntries({ tempo: 120, on: true, off: false, ratio: 0.5 });
    expect(result).toEqual([
      { key: 'tempo', value: '120', kind: 'text' },
      { key: 'on', value: 'true', kind: 'text' },
      { key: 'off', value: 'false', kind: 'text' },
      { key: 'ratio', value: '0.5', kind: 'text' },
    ]);
  });

  test('null / array / nested object → kind "json" via JSON.stringify', () => {
    const result = extraConfigEntries({
      tag: null,
      list: ['a', 1],
      nested: { foo: 'bar', baz: 2 },
    });
    expect(result).toEqual([
      { key: 'tag', value: 'null', kind: 'json' },
      { key: 'list', value: '["a",1]', kind: 'json' },
      { key: 'nested', value: '{"foo":"bar","baz":2}', kind: 'json' },
    ]);
  });

  test('preserves the response key order (Object.keys)', () => {
    const result = extraConfigEntries({
      tuning: 'Drop D',
      capo: '2',
      notes: 'Solo starts on bar 17',
    });
    expect(result.map((e) => e.key)).toEqual(['tuning', 'capo', 'notes']);
  });
});