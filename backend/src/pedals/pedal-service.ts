import { getDb } from "../db/client";
import type { SQL } from "bun";
import { getStorage } from "../storage";
import type { StorageAdapter } from "../storage/adapter";

export class PedalError extends Error {
  constructor(message: string, public readonly status: 400) {
    super(message);
  }
}

export interface UploadedFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CreatePedalInput {
  name?: string;
  image: UploadedFile[];
}

export interface PedalDto {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toPedalDto(row: {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}): PedalDto {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createPedal(
  userId: string,
  input: CreatePedalInput,
  storage: StorageAdapter = getStorage(),
): Promise<PedalDto> {
  if (!input.name || input.name.trim() === "") {
    throw new PedalError("name is required", 400);
  }
  if (input.image.length !== 1) {
    throw new PedalError("exactly one image file is required", 400);
  }

  const pedalId = crypto.randomUUID();
  const storageKey = `pedals/${pedalId}`;

  await storage.put(storageKey, input.image[0].bytes);

  const db: SQL = getDb();
  const [row] = await db<Parameters<typeof toPedalDto>[0][]>`INSERT INTO pedal_catalog (id, name, reference_image_key, created_by)
    VALUES (${pedalId}, ${input.name}, ${storageKey}, ${userId})
    RETURNING id, name, created_by, created_at, updated_at`;

  return toPedalDto(row as Parameters<typeof toPedalDto>[0]);
}

export async function listPedals(): Promise<PedalDto[]> {
  const db: SQL = getDb();
  const rows = await db<Parameters<typeof toPedalDto>[0][]>`SELECT id, name, created_by, created_at, updated_at
    FROM pedal_catalog
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => toPedalDto(r as Parameters<typeof toPedalDto>[0]));
}
