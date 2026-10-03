import type { SQL } from "bun";
import { getDb } from "../db/client";
import { isUuid } from "../db/uuid";
import { PLAN_LIMITS, checkPlanLimits, countLiveSongs, getUserPlan } from "../plans/plan-service";
import { getStorage } from "../storage";
import type { StorageAdapter } from "../storage/adapter";
import { readPresetName } from "./prst-name";

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

export interface SongPresetDto {
  id: string;
  sortOrder: number;
  name: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface SongDto {
  id: string;
  name: string;
  artist: string | null;
  extraConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  presets: SongPresetDto[];
}

export interface SongWithFilesDto extends SongDto {
  files: SongFileDto[];
}

export { UUID_RE, isUuid } from "../db/uuid";

export const MAX_EXTRA_CONFIG_BYTES = 32768; // 32 KiB — R3

const SONG_FILE_KINDS = ["preset", "ir", "nam", "cover"] as const;
type SongFileKind = (typeof SONG_FILE_KINDS)[number];

function isSongFileKind(value: string): value is SongFileKind {
  return (SONG_FILE_KINDS as readonly string[]).includes(value);
}

export interface SongFileContentDto {
  bytes: Uint8Array;
  mimeType: string;
  originalFilename: string;
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

interface SongRow {
  id: string;
  name: string;
  artist: string | null;
  extra_config: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

interface SongPresetRow {
  id: string;
  sort_order: number;
  pedal_preset_name: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  created_at: string | Date;
}

function toSongDto(row: SongRow, presets: SongPresetDto[]): SongDto {
  return {
    id: row.id,
    name: row.name,
    artist: row.artist,
    extraConfig: parseExtraConfig(row.extra_config),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    presets,
  };
}

function toSongPresetDto(row: SongPresetRow): SongPresetDto {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    name: row.pedal_preset_name,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: String(row.created_at),
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
  if (input.preset.length === 0) {
    throw new SongError("at least one preset file is required", 400);
  }
  if (input.cover.length > 1) {
    throw new SongError("at most one cover file is allowed", 400);
  }

  if (input.extraConfig !== undefined) {
    const byteLength = new TextEncoder().encode(input.extraConfig).length;
    if (byteLength > MAX_EXTRA_CONFIG_BYTES) {
      throw new SongError(
        `extra_config exceeds maximum size of ${MAX_EXTRA_CONFIG_BYTES} bytes`,
        400,
      );
    }
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

  const namedPresets: { source: UploadedFile; name: string }[] = [];
  for (const [i, preset] of input.preset.entries()) {
    const name = readPresetName(preset.bytes);
    if (name === null) {
      throw new SongError(`preset file at position ${i} has no readable GP-5 preset name`, 400);
    }
    namedPresets.push({ source: preset, name });
  }

  const db: SQL = getDb();

  const plan = await getUserPlan(db, userId);
  if (plan === null) {
    throw new SongError("user not found", 404); // plan_limits_enforcement R7
  }
  const limits = PLAN_LIMITS[plan];
  const liveSongs = limits.songs === null ? 0 : await countLiveSongs(db, userId);
  checkPlanLimits(plan, liveSongs, input.preset.length);

  const songId = crypto.randomUUID();

  const filesToCreate: {
    fileId: string;
    storageKey: string;
    kind: "preset" | "ir" | "nam" | "cover";
    source: UploadedFile;
    sortOrder: number;
    pedalPresetName: string | null;
  }[] = [
    ...namedPresets.map((p, i) => ({
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "preset" as const,
      source: p.source,
      sortOrder: i,
      pedalPresetName: p.name,
    })),
    ...input.ir.map((f, i) => ({
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "ir" as const,
      source: f,
      sortOrder: i,
      pedalPresetName: null,
    })),
    ...input.nam.map((f, i) => ({
      fileId: crypto.randomUUID(),
      storageKey: `songs/${songId}/${crypto.randomUUID()}`,
      kind: "nam" as const,
      source: f,
      sortOrder: i,
      pedalPresetName: null,
    })),
    ...(input.cover[0]
      ? [
          {
            fileId: crypto.randomUUID(),
            storageKey: `songs/${songId}/${crypto.randomUUID()}`,
            kind: "cover" as const,
            source: input.cover[0],
            sortOrder: 0,
            pedalPresetName: null,
          },
        ]
      : []),
  ];

  await Promise.all(filesToCreate.map((f) => storage.put(f.storageKey, f.source.bytes)));

  const result = await db.begin(async (tx) => {
    const [songRow] = await tx`
      INSERT INTO songs (id, user_id, name, artist, extra_config)
      VALUES (
        ${songId},
        ${userId},
        ${input.name},
        ${input.artist ?? null},
        ${JSON.stringify(extraConfig)}::jsonb
      )
      RETURNING id, name, artist, extra_config, created_at, updated_at
    `;

    const fileRows: Array<{
      id: string;
      kind: "preset" | "ir" | "nam" | "cover";
      original_filename: string;
      mime_type: string;
      byte_size: number;
      sort_order: number;
      pedal_preset_name: string | null;
      created_at: string;
    }> = [];
    for (const f of filesToCreate) {
      const [fileRow] = await tx`
        INSERT INTO song_files (
          id, song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order,
          pedal_preset_name
        )
        VALUES (
          ${f.fileId},
          ${songId},
          ${f.kind},
          ${f.storageKey},
          ${f.source.filename},
          ${f.source.mimeType},
          ${f.source.bytes.byteLength},
          ${f.sortOrder},
          ${f.pedalPresetName}
        )
        RETURNING id, kind, original_filename, mime_type, byte_size, sort_order, pedal_preset_name,
          created_at
      `;
      fileRows.push(fileRow as (typeof fileRows)[number]);
    }

    return { songRow, fileRows };
  });

  const presets = result.fileRows
    .filter((r) => r.kind === "preset")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => toSongPresetDto(r as SongPresetRow));
  const files = result.fileRows.filter((r) => r.kind !== "preset").map(toSongFileDto);

  return { ...toSongDto(result.songRow as SongRow, presets), files };
}

export async function listSongs(userId: string): Promise<SongDto[]> {
  const db: SQL = getDb();
  const rows = await db<SongRow[]>`SELECT id, name, artist, extra_config, created_at, updated_at
    FROM songs
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC`;

  const presetRows = await db<(SongPresetRow & { song_id: string })[]>`
    SELECT sf.song_id, sf.id, sf.sort_order, sf.pedal_preset_name, sf.original_filename,
           sf.mime_type, sf.byte_size, sf.created_at
    FROM song_files sf JOIN songs s ON s.id = sf.song_id
    WHERE s.user_id = ${userId} AND s.deleted_at IS NULL
      AND sf.kind = 'preset' AND sf.deleted_at IS NULL
    ORDER BY sf.song_id, sf.sort_order ASC`;

  const presetsBySong = new Map<string, SongPresetDto[]>();
  for (const row of presetRows) {
    const list = presetsBySong.get(row.song_id) ?? [];
    list.push(toSongPresetDto(row));
    presetsBySong.set(row.song_id, list);
  }

  return rows.map((r) => toSongDto(r, presetsBySong.get(r.id) ?? []));
}

export async function getSongById(
  userId: string,
  songId: string,
): Promise<SongWithFilesDto> {
  if (!isUuid(songId)) {
    throw new SongError("song not found", 404);
  }

  const db: SQL = getDb();
  const songRows = await db<SongRow[]>`SELECT id, name, artist, extra_config, created_at, updated_at
    FROM songs
    WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL`;

  if (songRows.length === 0) {
    throw new SongError("song not found", 404);
  }

  const presetRows = await db<SongPresetRow[]>`SELECT id, sort_order, pedal_preset_name, original_filename, mime_type, byte_size, created_at
    FROM song_files
    WHERE song_id = ${songId} AND kind = 'preset' AND deleted_at IS NULL
    ORDER BY sort_order ASC`;

  const fileRows = await db<Parameters<typeof toSongFileDto>[0][]>`SELECT id, kind, original_filename, mime_type, byte_size, sort_order, created_at
    FROM song_files
    WHERE song_id = ${songId} AND kind <> 'preset' AND deleted_at IS NULL
    ORDER BY kind ASC, sort_order ASC`;

  const song = toSongDto(songRows[0] as SongRow, presetRows.map(toSongPresetDto));
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

export async function getSongFile(
  userId: string,
  songId: string,
  kind: string,
  sortOrderParam: string | undefined,
  storage: StorageAdapter = getStorage(),
): Promise<SongFileContentDto> {
  if (!isUuid(songId)) throw new SongError("song not found", 404);
  if (!isSongFileKind(kind)) throw new SongError("song file not found", 404);

  let sortOrder = 0;
  if (sortOrderParam !== undefined) {
    if (!/^\d+$/.test(sortOrderParam)) throw new SongError("song file not found", 404);
    sortOrder = Number(sortOrderParam);
  }

  const db: SQL = getDb();
  const [row] = await db<
    { storage_key: string; mime_type: string; original_filename: string }[]
  >`
    SELECT sf.storage_key, sf.mime_type, sf.original_filename
    FROM song_files sf
    JOIN songs s ON s.id = sf.song_id
    WHERE s.id = ${songId}
      AND s.user_id = ${userId}
      AND s.deleted_at IS NULL
      AND sf.kind = ${kind}
      AND sf.sort_order = ${sortOrder}
      AND sf.deleted_at IS NULL
  `;
  if (!row) throw new SongError("song file not found", 404);

  const bytes = await storage.get(row.storage_key);
  if (bytes === null) {
    throw new Error(`song_files row ${row.storage_key} has no bytes in storage`);
  }

  return { bytes, mimeType: row.mime_type, originalFilename: row.original_filename };
}
