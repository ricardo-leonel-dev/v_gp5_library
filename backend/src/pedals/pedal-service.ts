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
  brand?: string | null;
  description?: string | null;
  image: UploadedFile[];
  parameters?: string | null;
}

export interface PedalDto {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  extras: Record<string, unknown>;
  isEditable: boolean;
  canEdit: boolean;
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

const maxBrandLength = 255;
const maxDescriptionLength = 2000;

// Shared catalog images are served to every user with this Content-Type, so only raster types
// are accepted; SVG and HTML can carry script.
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function charLength(value: string): number {
  return [...value].length;
}

function toPedalDto(row: {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  extras: unknown;
  is_editable: boolean;
  can_edit: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  parameters: unknown;
  has_image: boolean;
}): PedalDto {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    description: row.description,
    extras: parseStoredExtras(row.extras),
    isEditable: row.is_editable,
    canEdit: row.can_edit,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    parameters: parseStoredParameters(row.parameters),
    hasImage: row.has_image,
  };
}

function parseStoredExtras(raw: unknown): Record<string, unknown> {
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

export async function createPedal(
  userId: string,
  input: CreatePedalInput,
  storage: StorageAdapter = getStorage(),
): Promise<PedalDto> {
  if (!input.name || input.name.trim() === "") {
    throw new PedalError("name is required", 400);
  }

  if (input.brand === null || input.brand === undefined || input.brand.trim() === "") {
    throw new PedalError("brand is required", 400);
  }
  const trimmedBrand = input.brand.trim();
  if (charLength(trimmedBrand) > maxBrandLength) {
    throw new PedalError(`brand must be at most ${maxBrandLength} characters`, 400);
  }

  let trimmedDescription: string | null = null;
  if (input.description === null) {
    throw new PedalError("description must be a single text field", 400);
  }
  if (input.description !== undefined) {
    const trimmed = input.description.trim();
    if (trimmed !== "") {
      if (charLength(trimmed) > maxDescriptionLength) {
        throw new PedalError(`description must be at most ${maxDescriptionLength} characters`, 400);
      }
      trimmedDescription = trimmed;
    }
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
      (id, name, brand, description, reference_image_key, reference_image_mime_type, created_by, parameters)
    VALUES (${pedalId}, ${input.name}, ${trimmedBrand}, ${trimmedDescription}, ${storageKey}, ${imageMimeType}, ${userId},
      ${JSON.stringify(defs)}::jsonb)
    RETURNING id, name, brand, description, extras, is_editable,
      (is_editable AND NOT pedal_is_attached(id)) AS can_edit,
      created_by, created_at, updated_at, parameters,
      reference_image_key IS NOT NULL AS has_image`;

  return toPedalDto(row as Parameters<typeof toPedalDto>[0]);
}

export async function listPedals(): Promise<PedalDto[]> {
  const db: SQL = getDb();
  const rows = await db<Parameters<typeof toPedalDto>[0][]>`SELECT id, name, brand, description, extras, is_editable,
      (is_editable AND NOT pedal_is_attached(id)) AS can_edit,
      created_by, created_at, updated_at, parameters,
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
