import { getDb } from "../db/client";
import type { SQL } from "bun";
import { getStorage } from "../storage";
import type { StorageAdapter } from "../storage/adapter";
import {
  parseParameterDefinitions,
  parseStoredParameters,
  type ParameterDefinition,
} from "./pedal-parameters";

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
  parameters?: string | null;
}

export interface PedalDto {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  parameters: ParameterDefinition[];
}

function toPedalDto(row: {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  parameters: unknown;
}): PedalDto {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    parameters: parseStoredParameters(row.parameters),
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

  let defs: ParameterDefinition[] = [];
  if (input.parameters === null) {
    throw new PedalError("parameters must be a single JSON field", 400);
  }
  if (input.parameters !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.parameters);
    } catch {
      throw new PedalError("parameters must be valid JSON", 400);
    }
    const defsResult = parseParameterDefinitions(parsed);
    if (!defsResult.ok) {
      throw new PedalError(defsResult.error, 400);
    }
    defs = defsResult.value;
  }

  const pedalId = crypto.randomUUID();
  const storageKey = `pedals/${pedalId}`;

  await storage.put(storageKey, input.image[0].bytes);

  const db: SQL = getDb();
  const [row] = await db<Parameters<typeof toPedalDto>[0][]>`INSERT INTO pedal_catalog (id, name, reference_image_key, created_by, parameters)
    VALUES (${pedalId}, ${input.name}, ${storageKey}, ${userId}, ${JSON.stringify(defs)}::jsonb)
    RETURNING id, name, created_by, created_at, updated_at, parameters`;

  return toPedalDto(row as Parameters<typeof toPedalDto>[0]);
}

export async function listPedals(): Promise<PedalDto[]> {
  const db: SQL = getDb();
  const rows = await db<Parameters<typeof toPedalDto>[0][]>`SELECT id, name, created_by, created_at, updated_at, parameters
    FROM pedal_catalog
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => toPedalDto(r as Parameters<typeof toPedalDto>[0]));
}
