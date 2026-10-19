import { getDb } from "../db/client";
import type { SQL } from "bun";
import { isUuid } from "../db/uuid";
import { getStorage } from "../storage";
import type { StorageAdapter } from "../storage/adapter";
import {
  parseParameterDefinitions,
  parseStoredParameters,
  type ParameterDefinition,
} from "./pedal-parameters";

export class PedalError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
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
  hasImage: boolean;
}

export interface PedalImageDto {
  bytes: Uint8Array;
  mimeType: string;
}

const fallbackImageMimeType = "application/octet-stream";

// Shared catalog images are served to every user with this Content-Type, so only raster types
// are accepted; SVG and HTML can carry script.
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function toPedalDto(row: {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  parameters: unknown;
  has_image: boolean;
}): PedalDto {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    parameters: parseStoredParameters(row.parameters),
    hasImage: row.has_image,
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
  const imageMimeType = input.image[0]!.mimeType.toLowerCase();
  if (!allowedImageMimeTypes.has(imageMimeType)) {
    throw new PedalError("image must be a JPEG, PNG, WebP or GIF file", 400);
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

  const image = input.image[0]!;
  const pedalId = crypto.randomUUID();
  const storageKey = `pedals/${pedalId}`;

  await storage.put(storageKey, image.bytes);

  const db: SQL = getDb();
  const [row] = await db<Parameters<typeof toPedalDto>[0][]>`INSERT INTO pedal_catalog
      (id, name, reference_image_key, reference_image_mime_type, created_by, parameters)
    VALUES (${pedalId}, ${input.name}, ${storageKey}, ${imageMimeType}, ${userId},
      ${JSON.stringify(defs)}::jsonb)
    RETURNING id, name, created_by, created_at, updated_at, parameters,
      reference_image_key IS NOT NULL AS has_image`;

  return toPedalDto(row as Parameters<typeof toPedalDto>[0]);
}

export async function listPedals(): Promise<PedalDto[]> {
  const db: SQL = getDb();
  const rows = await db<Parameters<typeof toPedalDto>[0][]>`SELECT id, name, created_by, created_at, updated_at, parameters,
      reference_image_key IS NOT NULL AS has_image
    FROM pedal_catalog
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => toPedalDto(r as Parameters<typeof toPedalDto>[0]));
}

export async function getPedalImage(
  pedalId: string,
  storage: StorageAdapter = getStorage(),
): Promise<PedalImageDto> {
  if (!isUuid(pedalId)) throw new PedalError("pedal image not found", 404);

  const db: SQL = getDb();
  const [row] = await db<
    { reference_image_key: string | null; reference_image_mime_type: string | null }[]
  >`SELECT reference_image_key, reference_image_mime_type
    FROM pedal_catalog
    WHERE id = ${pedalId} AND deleted_at IS NULL`;
  if (!row || row.reference_image_key === null) {
    throw new PedalError("pedal image not found", 404);
  }

  const bytes = await storage.get(row.reference_image_key);
  if (bytes === null) {
    throw new Error(`pedal_catalog row ${pedalId} has no image bytes in storage`);
  }

  return { bytes, mimeType: row.reference_image_mime_type ?? fallbackImageMimeType };
}
