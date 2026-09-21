import { getDb } from "../db/client";
import type { SQL } from "bun";
import { getStorage } from "../storage";
import type { StorageAdapter } from "../storage/adapter";

export class SongError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
  }
}

export interface UploadedFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CreateSongInput {
  name?: string;
  artist?: string;
  pedalPresetName?: string;
  extraConfig?: string;
  preset: UploadedFile[];
  ir: UploadedFile[];
  nam: UploadedFile[];
  cover: UploadedFile[];
}

export interface SongFileDto {
  id: string;
  kind: "preset" | "ir" | "nam" | "cover";
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface SongDto {
  id: string;
  name: string;
  artist: string | null;
  pedalPresetName: string | null;
  extraConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SongWithFilesDto extends SongDto {
  files: SongFileDto[];
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function parseExtraConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return {};
}

function toSongDto(row: {
  id: string;
  name: string;
  artist: string | null;
  pedal_preset_name: string | null;
  extra_config: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}): SongDto {
  return {
    id: row.id,
    name: row.name,
    artist: row.artist,
    pedalPresetName: row.pedal_preset_name,
    extraConfig: parseExtraConfig(row.extra_config),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toSongFileDto(row: {
  id: string;
  kind: "preset" | "ir" | "nam" | "cover";
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sort_order: number;
  created_at: string | Date;
}): SongFileDto {
  return {
    id: row.id,
    kind: row.kind,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sortOrder: row.sort_order,
    createdAt: String(row.created_at),
  };
}

export async function createSong(
  userId: string,
  input: CreateSongInput,
  storage: StorageAdapter = getStorage(),
): Promise<SongWithFilesDto> {
  if (!input.name || input.name.trim() === "") {
    throw new SongError("name is required", 400);
  }
  if (input.preset.length !== 1) {
    throw new SongError("exactly one preset file is required", 400);
  }
  if (input.cover.length > 1) {
    throw new SongError("at most one cover file is allowed", 400);
  }

  let extraConfig: Record<string, unknown> = {};
  if (input.extraConfig !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.extraConfig);
    } catch {
      throw new SongError("extra_config must be valid JSON", 400);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SongError("extra_config must be a JSON object", 400);
    }
    extraConfig = parsed as Record<string, unknown>;
  }

  const songId = crypto.randomUUID();

  const filesToCreate: {
    fileId: string;
    storageKey: string;
    kind: "preset" | "ir" | "nam" | "cover";
    source: UploadedFile;
    sortOrder: number;
  }[] = [
    {
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "preset",
      source: input.preset[0],
      sortOrder: 0,
    },
    ...input.ir.map((f, i) => ({
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "ir" as const,
      source: f,
      sortOrder: i,
    })),
    ...input.nam.map((f, i) => ({
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "nam" as const,
      source: f,
      sortOrder: i,
    })),
    ...(input.cover[0]
      ? [
          {
            fileId: crypto.randomUUID(),
            storageKey: `songs/${songId}/${crypto.randomUUID()}`,
            kind: "cover" as const,
            source: input.cover[0],
            sortOrder: 0,
          },
        ]
      : []),
  ];

  await Promise.all(filesToCreate.map((f) => storage.put(f.storageKey, f.source.bytes)));

  const db = getDb();

  const result = await db.begin(async (tx) => {
    const [songRow] = await tx`
      INSERT INTO songs (id, user_id, name, artist, pedal_preset_name, extra_config)
      VALUES (
        ${songId},
        ${userId},
        ${input.name},
        ${input.artist ?? null},
        ${input.pedalPresetName ?? null},
        ${JSON.stringify(extraConfig)}::jsonb
      )
      RETURNING id, name, artist, pedal_preset_name, extra_config, created_at, updated_at
    `;

    const fileRows: Array<{
      id: string;
      kind: "preset" | "ir" | "nam" | "cover";
      original_filename: string;
      mime_type: string;
      byte_size: number;
      sort_order: number;
      created_at: string;
    }> = [];
    for (const f of filesToCreate) {
      const [fileRow] = await tx`
        INSERT INTO song_files (id, song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
        VALUES (
          ${f.fileId},
          ${songId},
          ${f.kind},
          ${f.storageKey},
          ${f.source.filename},
          ${f.source.mimeType},
          ${f.source.bytes.byteLength},
          ${f.sortOrder}
        )
        RETURNING id, kind, original_filename, mime_type, byte_size, sort_order, created_at
      `;
      fileRows.push(fileRow as (typeof fileRows)[number]);
    }

    return { songRow, fileRows };
  });

  const songDto = toSongDto(result.songRow as Parameters<typeof toSongDto>[0]);
  const files = (result.fileRows as Parameters<typeof toSongFileDto>[0][]).map(toSongFileDto);

  return { ...songDto, files };
}

export async function listSongs(userId: string): Promise<SongDto[]> {
  const db: SQL = getDb();
  const rows = await db<Parameters<typeof toSongDto>[0][]>`SELECT id, name, artist, pedal_preset_name, extra_config, created_at, updated_at
    FROM songs
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => toSongDto(r as Parameters<typeof toSongDto>[0]));
}

export async function getSongById(
  userId: string,
  songId: string,
): Promise<SongWithFilesDto> {
  if (!isUuid(songId)) {
    throw new SongError("song not found", 404);
  }

  const db: SQL = getDb();
  const songRows = await db<Parameters<typeof toSongDto>[0][]>`SELECT id, name, artist, pedal_preset_name, extra_config, created_at, updated_at
    FROM songs
    WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL`;

  if (songRows.length === 0) {
    throw new SongError("song not found", 404);
  }

  const fileRows = await db<Parameters<typeof toSongFileDto>[0][]>`SELECT id, kind, original_filename, mime_type, byte_size, sort_order, created_at
    FROM song_files
    WHERE song_id = ${songId} AND deleted_at IS NULL
    ORDER BY kind ASC, sort_order ASC`;

  const song = toSongDto(songRows[0] as Parameters<typeof toSongDto>[0]);
  const files = fileRows.map((r) => toSongFileDto(r as Parameters<typeof toSongFileDto>[0]));
  return { ...song, files };
}

export async function deleteSong(userId: string, songId: string): Promise<void> {
  if (!isUuid(songId)) {
    throw new SongError("song not found", 404);
  }

  const db: SQL = getDb();

  await db.begin(async (tx) => {
    const [song] = await tx`
      SELECT id FROM songs
      WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!song) {
      throw new SongError("song not found", 404);
    }

    await tx`UPDATE song_files SET deleted_at = NOW() WHERE song_id = ${songId} AND deleted_at IS NULL`;
    await tx`UPDATE songs SET deleted_at = NOW() WHERE id = ${songId}`;
  });
}
