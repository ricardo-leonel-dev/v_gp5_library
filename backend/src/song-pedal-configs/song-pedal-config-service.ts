import { getDb } from "../db/client";
import type { SQL } from "bun";
import { isUuid } from "../songs/song-service";
import {
  findMissingParameterKeys,
  parseStoredParameters,
  validateConfigAgainstParameters,
  type ParameterDefinition,
} from "../pedals/pedal-parameters";

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

export interface UpdateSongPedalConfigInput {
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

function requireConfigObject(config: unknown): Record<string, unknown> {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new SongPedalConfigError("config must be a JSON object", 400);
  }
  return config as Record<string, unknown>;
}

/**
 * `sent` carries the caller's keys and gets the per-key value checks; `result` is what the row would
 * hold once they are merged into it and must hold every key the pedal defines.
 */
function assertConfigFitsPedal(
  sent: Record<string, unknown>,
  result: Record<string, unknown>,
  defs: ParameterDefinition[],
): void {
  if (defs.length === 0) return;

  const validation = validateConfigAgainstParameters(sent, defs);
  if (!validation.ok) {
    throw new SongPedalConfigError(validation.error, 400);
  }

  const missing = findMissingParameterKeys(result, defs);
  if (missing.length > 0) {
    throw new SongPedalConfigError(
      `config is missing parameters: ${missing.map((key) => `"${key}"`).join(", ")}`,
      400,
    );
  }
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
  const pedalRows = await db<{ id: string; parameters: unknown }[]>`
    SELECT id, parameters FROM pedal_catalog
    WHERE id = ${input.pedalCatalogId} AND deleted_at IS NULL
  `;
  if (pedalRows.length === 0) {
    throw new SongPedalConfigError("pedal_catalog_id does not reference an existing pedal", 400);
  }
  const pedalParameters = parseStoredParameters(pedalRows[0]!.parameters);

  const config = input.config === undefined ? {} : requireConfigObject(input.config);

  assertConfigFitsPedal(config, config, pedalParameters);

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

export async function updateSongPedalConfig(
  userId: string,
  songId: string,
  configId: string,
  input: UpdateSongPedalConfigInput,
): Promise<SongPedalConfigDto> {
  if (!isUuid(songId) || !isUuid(configId)) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }

  const db: SQL = getDb();

  // No `pc.is_editable` / `pc.can_edit` in this query: the catalog pedal's lock never blocks an update.
  const rows = await db<{ config: unknown; parameters: unknown }[]>`
    SELECT spc.config, pc.parameters
    FROM song_pedal_configs spc
    JOIN songs s ON s.id = spc.song_id
    JOIN pedal_catalog pc ON pc.id = spc.pedal_catalog_id
    WHERE spc.id = ${configId} AND spc.song_id = ${songId}
      AND spc.user_id = ${userId} AND spc.deleted_at IS NULL
      AND s.user_id = ${userId} AND s.deleted_at IS NULL
  `;
  if (rows.length === 0) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }
  const row = rows[0]!;

  const sent = requireConfigObject(input.config);
  const merged = { ...parseConfig(row.config), ...sent };
  assertConfigFitsPedal(sent, merged, parseStoredParameters(row.parameters));

  // jsonb `||` merges the sent keys in atomically, so concurrent patches on different keys both land.
  // `::text::jsonb` (not `::jsonb`) is required because Bun.sql binds a JS string as a jsonb *string*,
  // and `config #>> '{}'` unwraps rows written the same way before merging into them.
  const updated = await db<Parameters<typeof toSongPedalConfigDto>[0][]>`
    UPDATE song_pedal_configs
    SET config = (CASE WHEN jsonb_typeof(config) = 'string' THEN (config #>> '{}')::jsonb ELSE config END)
                    || ${JSON.stringify(sent)}::text::jsonb,
        updated_at = NOW()
    WHERE id = ${configId} AND song_id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
    RETURNING id, song_id, pedal_catalog_id, label, config, created_at, updated_at
  `;
  if (updated.length === 0) {
    throw new SongPedalConfigError("song pedal config not found", 404);
  }

  return toSongPedalConfigDto(updated[0] as Parameters<typeof toSongPedalConfigDto>[0]);
}
