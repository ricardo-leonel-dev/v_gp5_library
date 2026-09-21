import { getDb } from "../db/client";
import type { SQL } from "bun";
import { isUuid } from "../songs/song-service";

export class SongPedalConfigError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
  }
}

export interface CreateSongPedalConfigInput {
  pedalCatalogId?: string;
  label?: string;
  config?: unknown;
}

export interface SongPedalConfigDto {
  id: string;
  songId: string;
  pedalCatalogId: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function parseConfig(raw: unknown): Record<string, unknown> {
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

function toSongPedalConfigDto(row: {
  id: string;
  song_id: string;
  pedal_catalog_id: string;
  label: string;
  config: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}): SongPedalConfigDto {
  return {
    id: row.id,
    songId: row.song_id,
    pedalCatalogId: row.pedal_catalog_id,
    label: row.label,
    config: parseConfig(row.config),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createSongPedalConfig(
  userId: string,
  songId: string,
  input: CreateSongPedalConfigInput,
): Promise<SongPedalConfigDto> {
  if (!isUuid(songId)) {
    throw new SongPedalConfigError("song not found", 404);
  }

  const db: SQL = getDb();

  const songRows = await db<{ id: string }[]>`
    SELECT id FROM songs
    WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
  `;
  if (songRows.length === 0) {
    throw new SongPedalConfigError("song not found", 404);
  }

  if (!input.label || input.label.trim() === "") {
    throw new SongPedalConfigError("label is required", 400);
  }

  if (!input.pedalCatalogId || !isUuid(input.pedalCatalogId)) {
    throw new SongPedalConfigError("pedal_catalog_id does not reference an existing pedal", 400);
  }
  const pedalRows = await db<{ id: string }[]>`
    SELECT id FROM pedal_catalog
    WHERE id = ${input.pedalCatalogId} AND deleted_at IS NULL
  `;
  if (pedalRows.length === 0) {
    throw new SongPedalConfigError("pedal_catalog_id does not reference an existing pedal", 400);
  }

  let config: Record<string, unknown>;
  if (input.config === undefined) {
    config = {};
  } else if (input.config !== null && typeof input.config === "object" && !Array.isArray(input.config)) {
    config = input.config as Record<string, unknown>;
  } else {
    throw new SongPedalConfigError("config must be a JSON object", 400);
  }

  const [row] = await db<Parameters<typeof toSongPedalConfigDto>[0][]>`INSERT INTO song_pedal_configs (id, song_id, user_id, pedal_catalog_id, label, config)
    VALUES (${crypto.randomUUID()}, ${songId}, ${userId}, ${input.pedalCatalogId}, ${input.label}, ${JSON.stringify(config)}::jsonb)
    RETURNING id, song_id, pedal_catalog_id, label, config, created_at, updated_at`;

  return toSongPedalConfigDto(row as Parameters<typeof toSongPedalConfigDto>[0]);
}

export async function listSongPedalConfigs(
  userId: string,
  songId: string,
): Promise<SongPedalConfigDto[]> {
  if (!isUuid(songId)) {
    throw new SongPedalConfigError("song not found", 404);
  }

  const db: SQL = getDb();

  const songRows = await db<{ id: string }[]>`
    SELECT id FROM songs
    WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
  `;
  if (songRows.length === 0) {
    throw new SongPedalConfigError("song not found", 404);
  }

  const rows = await db<Parameters<typeof toSongPedalConfigDto>[0][]>`SELECT id, song_id, pedal_catalog_id, label, config, created_at, updated_at
    FROM song_pedal_configs
    WHERE song_id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => toSongPedalConfigDto(r as Parameters<typeof toSongPedalConfigDto>[0]));
}

export async function deleteSongPedalConfig(
  userId: string,
  songId: string,
  configId: string,
): Promise<void> {
  if (!isUuid(songId) || !isUuid(configId)) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }

  const db: SQL = getDb();

  const songRows = await db<{ id: string }[]>`
    SELECT id FROM songs
    WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
  `;
  if (songRows.length === 0) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }

  const updated = await db<{ id: string }[]>`
    UPDATE song_pedal_configs SET deleted_at = NOW()
    WHERE id = ${configId} AND song_id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
    RETURNING id
  `;
  if (updated.length === 0) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }
}