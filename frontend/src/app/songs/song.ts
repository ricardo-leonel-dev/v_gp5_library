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
