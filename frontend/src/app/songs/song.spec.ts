import { describe, expect, test } from 'vitest';
import {
  coverHintForListSong,
  hasCoverFile,
  isBlank,
  orderedPresets,
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