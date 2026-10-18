// F4 `save_preset_dialog` — the only F4-side shape the dialog reads back
// from `POST /songs`. The full multi-preset song DTO belongs to feature 26
// and is not needed for saving.
export interface CreatedSong {
  id: string;
  name: string;
}

// F5 `import_preset_to_pedal` — the F26 library-side shape the dialog
// receives from the host page. The dialog uses `Song.presets[].sortOrder`
// to address a preset inside a song (R5), and the host page snapshots
// the song and its ordered preset list at open time (R4). F26 will
// expand this file with the rest of its DTOs (`SongDetail`, `SongFile`,
// `SongCover`); F5 ships only the fields it reads.
export interface SongPreset {
  readonly id: string;
  readonly sortOrder: number;
  readonly name: string;
  // F26 fields the dialog does not need; included so the F26 list DTO
  // can be passed through without re-typing. `?` because mocks or older
  // test fixtures may omit them.
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly createdAt?: string;
}

export interface Song {
  readonly id: string;
  readonly name: string;
  readonly artist?: string | null;
  // F5 doesn't read these; F26 owns them.
  readonly extraConfig?: Record<string, unknown>;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly presets: readonly SongPreset[];
}

// F26 R24. Mirrors the non-preset rows in `GET /songs/:id`'s `files`
// array (backend `SongFileDto` with `kind` filtered out to non-preset
// kinds — backend `song-service.ts:323`). `presets` are not returned
// here; they live on the inherited `Song.presets`.
export interface SongFile {
  readonly id: string;
  readonly kind: 'ir' | 'nam' | 'cover';
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

// F26 R26, R27, R35. Detail DTO — `Song` plus the `files` array that
// the list DTO omits. The list DTO has no cover indicator today
// (`backend/src/songs/song-service.ts:51-59`); `coverHintForListSong`
// returns `undefined` until a `hasCover` field is added to `SongDto`
// (proposed backend card — design §4).
export interface SongDetail extends Song {
  readonly files: readonly SongFile[];
}

// F26 R31, R80. Pure: never mutates input. Returns a new array sorted
// by `sortOrder` ascending.
export function orderedPresets(presets: readonly SongPreset[]): SongPreset[] {
  return presets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

// F26 R35, R36. The detail page uses this to decide whether to
// request `/files/cover` (R35) or render the placeholder with no
// request (R36).
export function hasCoverFile(files: readonly SongFile[]): boolean {
  return files.some((f) => f.kind === 'cover');
}

// F26 R7, R8, R30. Blank = `null`, empty, or only whitespace.
export function isBlank(value: string | null | undefined): value is undefined {
  return value === null || value === undefined || value.trim() === '';
}

// F26 R13, R35, R36. The list DTO has no cover indicator today
// (backend F15), so the library always requests the cover and treats
// 404 as "none" (R14/R17). When the backend gains a `hasCover`
// field on `SongDto`, this function returns it and the rest of the
// pipeline (none) already handles both branches. No component, template
// or API change required.
export function coverHintForListSong(_song: Song): boolean | undefined {
  return undefined;
}

// F33 R2-R4. Pure: never mutates input. Returns a new array: every
// 'ir' file before every 'nam' file, each kind sorted by `sortOrder`
// ascending. Elements with `kind === 'cover'` are dropped.
export function userFiles(files: readonly SongFile[]): SongFile[] {
  return files
    .filter((f) => f.kind !== 'cover')
    .slice()
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'ir' ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    });
}

// F33 R9-R12. Locale-aware byte-size formatter. Returns the i18n key
// the template should look up and a value already shaped for the
// active language.
export interface FormattedByteSize {
  readonly key: 'songDetail.size_mb' | 'songDetail.size_mb_below_min';
  readonly value: string;
}

// F33 R9-R12. 1 MB = 1 048 576 bytes. Rounds half away from zero (the
// `halfExpand` rule in `Intl.NumberFormat`). Negative or non-finite
// inputs are treated as 0 so a bad row can never break the page.
export function formatByteSize(bytes: number, lang: string): FormattedByteSize {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const fmt = new Intl.NumberFormat(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
    roundingMode: 'halfExpand',
  } as Intl.NumberFormatOptions);
  if (safe === 0) {
    return { key: 'songDetail.size_mb', value: fmt.format(0) };
  }
  if (safe < 5243) {
    return { key: 'songDetail.size_mb_below_min', value: fmt.format(0.01) };
  }
  return {
    key: 'songDetail.size_mb',
    value: fmt.format(safe / 1048576),
  };
}

// F33 R15-R20.
export type ExtraConfigValueKind = 'text' | 'json' | 'empty';

export interface ExtraConfigEntry {
  readonly key: string;
  readonly value: string;
  readonly kind: ExtraConfigValueKind;
}

// F33 R15-R20. Pure: never mutates input. Non-plain-object inputs
// (`undefined`, `null`, arrays, primitives) yield `[]`. Key order
// follows `Object.keys(extraConfig)` (R15, A4).
export function extraConfigEntries(extraConfig: unknown): ExtraConfigEntry[] {
  if (extraConfig === null || typeof extraConfig !== 'object' || Array.isArray(extraConfig)) {
    return [];
  }
  const obj = extraConfig as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return [];
  return keys.map((k) => {
    const v = obj[k];
    if (typeof v === 'string') {
      if (v.trim() === '') return { key: k, value: '', kind: 'empty' };
      return { key: k, value: v, kind: 'text' };
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      return { key: k, value: String(v), kind: 'text' };
    }
    if (v === null || Array.isArray(v) || typeof v === 'object') {
      return { key: k, value: JSON.stringify(v), kind: 'json' };
    }
    return { key: k, value: String(v), kind: 'json' };
  });
}
