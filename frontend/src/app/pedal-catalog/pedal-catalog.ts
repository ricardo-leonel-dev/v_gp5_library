// F36 `pedal_catalog_attach` — backend DTOs for the catalog and the
// per-song pedal configs, plus the attach request body. Backend shapes
// are described in `specs/pedal_catalog_attach/requirements.md` and
// match the verified backend services
// (`../backend/src/pedals/pedal-service.ts`,
// `../backend/src/song-pedal-configs/song-pedal-config-service.ts`).
//
// Naming uses camelCase to match Angular's `HttpClient` JSON convention
// and the rest of this codebase (`songs.ts`, `auth.ts`).

export interface CatalogPedal {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SongPedal {
  id: string;
  songId: string;
  pedalCatalogId: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AttachPedalBody {
  pedal_catalog_id: string;
  label: string;
  config: Record<string, never>;
}