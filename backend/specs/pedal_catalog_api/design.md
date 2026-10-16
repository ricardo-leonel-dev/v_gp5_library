# Design — pedal_catalog_api

## Guiding principle for create ordering

`createPedal` touches two systems that can't share a transaction: Postgres and `StorageAdapter` — the
exact same situation `song_crud_api`'s design.md already documented for `createSong`, and the same rule
applies here unchanged: **never leave a live, queryable DB row pointing at bytes that don't exist.**
`createPedal` therefore writes the image's bytes via `storage.put` *before* the `INSERT INTO
pedal_catalog`, so a `storage.put` failure leaves zero DB rows (nothing to clean up) and a DB failure
after a successful write leaves only harmless, unreferenced bytes on disk.

## No schema change

`pedal_catalog` (`id`, `name`, `reference_image_key`, `created_by`, `created_at`, `updated_at`,
`deleted_at`) already exists from `songs_schema_migrations` (feature 2, `done`) — see requirements.md's
scope note. This feature adds no `src/db/migrations/*.sql` file.

## Files to touch

### New: `src/pedals/pedal-service.ts`
Business logic + DB queries, per `docs/architecture.md` principle 1's `*-service.ts` shape.
Framework-agnostic: takes plain data in, returns plain DTOs out, never touches Hono/`Request`/`File`.

```ts
import { getDb } from "../db/client";
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
  image: UploadedFile[]; // service validates this is exactly length 1 (R3)
}

export interface PedalDto {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createPedal(
  userId: string,
  input: CreatePedalInput,
  storage: StorageAdapter = getStorage(),
): Promise<PedalDto> { ... }

export async function listPedals(): Promise<PedalDto[]> { ... }
```

`createPedal` body, in order:
1. Validate: `input.name` truthy (R2) and `input.image.length === 1` (R3) — either failure throws
   `PedalError(..., 400)` before any DB/storage call, so nothing is created.
2. `const pedalId = crypto.randomUUID()`.
3. `const storageKey = \`pedals/${pedalId}\`` — one file per pedal, so `pedalId` alone already makes the
   key unique; no separate per-file id is needed (contrast `song_crud_api`, where several `song_files`
   rows can share one `songId`, hence its `songs/<songId>/<fileId>` shape).
4. `await storage.put(storageKey, input.image[0].bytes)` (R4) — before any DB write, per the guiding
   principle above.
5. `INSERT INTO pedal_catalog (id, name, reference_image_key, created_by) VALUES (${pedalId},
   ${input.name}, ${storageKey}, ${userId}) RETURNING *` (R1, R4) — no transaction needed (a single
   statement), unlike `createSong`'s multi-row insert.
6. Return the `PedalDto` built from the row just inserted.

`listPedals`: `SELECT * FROM pedal_catalog WHERE deleted_at IS NULL ORDER BY created_at DESC` (R6) — no
`userId` parameter at all, deliberately: unlike `listSongs`, this is the one query in the codebase that
*must not* filter by `user_id`, since `pedal_catalog` is the shared exception `docs/architecture.md`
principle 5 already carves out (see requirements.md's scope note). Ordering isn't specified by any
`R<n>`, `created_at DESC` is a reasonable default, not independently tested — same convention
`song_crud_api`'s `listSongs` already established.

`PedalDto` never exposes `reference_image_key` (the raw storage key) — same reasoning `song_crud_api`'s
`SongFileDto` already applies to `storage_key`: it's an internal storage-adapter detail, not something a
client can act on directly, and no download route exists in this feature's scope to make it actionable
(see requirements.md's scope note on `GET /pedals/:id/image` being out of scope).

**Dependency injection for `storage`:** `createPedal` takes `storage: StorageAdapter = getStorage()`
rather than calling `getStorage()` internally — same test-seam idiom `song_crud_api`'s `createSong`
already established (`docs/conventions.md`'s fixture/isolation convention requires filesystem tests to
use a fresh `mkdtemp()` per test, which a shared module-level singleton would prevent). `listPedals` takes
no `storage` parameter at all — it never touches storage, only Postgres.

### New: `src/pedals/parse-multipart.ts`
The one place that touches Hono's `BodyData`/Web `File` types, mirroring
`src/songs/parse-multipart.ts` exactly (same `FormValue` shape, same `toUploadedFiles`/`toStringField`
helpers, duplicated rather than shared — see "Discarded alternatives").

```ts
import type { CreatePedalInput, UploadedFile } from "./pedal-service";

type FormValue = string | File | (string | File)[] | undefined;

async function toUploadedFiles(value: FormValue): Promise<UploadedFile[]> {
  const entries = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const files = entries.filter((e): e is File => e instanceof File);
  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      mimeType: f.type || "application/octet-stream",
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

function toStringField(value: FormValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function parseCreatePedalMultipart(
  body: Record<string, FormValue>,
): Promise<CreatePedalInput> {
  return {
    name: toStringField(body.name),
    image: await toUploadedFiles(body.image),
  };
}
```

### `src/index.ts`
```ts
import { createPedal, listPedals, PedalError } from "./pedals/pedal-service";
import { parseCreatePedalMultipart } from "./pedals/parse-multipart";

protectedRouter.post("/pedals", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const input = await parseCreatePedalMultipart(
    body as Record<string, string | File | (string | File)[] | undefined>,
  );
  try {
    const pedal = await createPedal(c.get("userId"), input);
    return c.json(pedal, 201);
  } catch (err) {
    if (err instanceof PedalError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/pedals", async (c) => {
  return c.json(await listPedals());
});
```
Both routes register on `protectedRouter` (R5), never on the base `app`, matching every existing
`/songs` route and the enforcement point `require_auth_middleware_on_all_routes`'s design.md names as
the reference. `PedalError` -> `c.json({error}, status)` mirrors the existing `SongError`/`AuthError`
handling verbatim. `listPedals` takes no argument from the request — it deliberately ignores
`c.get("userId")` entirely (R6).

### New: `src/pedals/pedal-service.test.ts`
Colocated per `docs/conventions.md`. Hits the real local Postgres (no DB reset between test files, uses
`crypto.randomUUID()`-based emails for any `users` row it inserts, same as `song-service.test.ts`) and a
fresh `mkdtemp(os.tmpdir())` directory per test for the injected `LocalFsStorageAdapter`, cleaned up in
`afterEach` — matches `song-service.test.ts`'s existing pattern. Covers R2-R4, R6.

### `src/index.test.ts`
Extended with: (a) a real end-to-end `POST /pedals` using a `FormData` body through `app.request()`,
proving the full route -> service -> DB/storage wiring and the 201 response shape (R1); (b) one request
per route (`POST /pedals`, `GET /pedals`) with no `Authorization` header, each asserting 401 (R5) — this
is the only place R5 can be tested, since `pedal-service.ts` never sees a token, only an already-resolved
`userId`; (c) a request proving `GET /pedals` (as user B) returns a pedal created by user A (R6's
"regardless of `created_by`" clause), which `pedal-service.test.ts` alone can't exercise end-to-end
through the HTTP layer.

## Error handling
`PedalError` (`400` only, no `404` variant — this feature has no `:id` route) is the only new typed
error class, matching `SongError`/`AuthError`'s shape. Every other failure (an unexpected Postgres error,
a `StorageAdapter.put` rejection) propagates uncaught out of the route handler, same as everywhere else
in this codebase, per `docs/architecture.md` principle 3.

## Discarded alternatives

**Have `GET /pedals` filter by `created_by = c.get('userId')`, matching every other authenticated list
route (`listSongs`) in this codebase.** Rejected: the feature's own description and acceptance criteria
are explicit — "visible to every logged-in user regardless of who added it" / "lists every catalog entry
regardless of who created it" — and `docs/architecture.md` principle 5 deliberately excludes
`pedal_catalog` from the tables that must be filtered by `user_id`. Filtering here would silently hide
every other user's pedals, defeating the entire point of a *shared* catalog.

**Add a `GET /pedals/:id/image` (or embed the image bytes/a data URL directly in the `GET /pedals`
response) in this same feature**, so an uploaded reference image is actually viewable. Rejected: neither
route is named by this feature's acceptance criteria, and the precedent already set by
`song_crud_api`/`song_file_export_import` is to split "accept and store bytes" from "stream bytes back
out" into two separate features. Embedding raw bytes in the list response would also make `GET /pedals`
scale badly as the catalog grows. If reading the image back becomes a real need, it belongs to a future
feature analogous to `song_file_export_import`, not a silent scope expansion here.

**Make the `image` file optional on `POST /pedals`, matching `pedal_catalog.reference_image_key`'s
nullable column type at the schema level.** Rejected: the column is nullable for schema flexibility (and
because a future data-entry path might not go through this API), but this feature's own acceptance
criteria describe creation as "creates a catalog entry with an uploaded reference image" — an image is
part of the happy path this feature is building, not an optional extra. Every row created through this
API always has one (R1, R3, R4).

**Reuse `SongError` for `pedal-service.ts` instead of defining a new `PedalError`.** Rejected:
`docs/architecture.md` principle 3 and `docs/conventions.md`'s Error Handling section establish one typed
error class per domain (`AuthError`, `SongError`) — reusing `SongError` for a route that has nothing to
do with songs would conflate two unrelated domains' error semantics the first time either one needs a
status `SongError` doesn't have (e.g. a future pedal-specific `404`).

**Extract a shared `parse-multipart.ts` helper reused by both `songs/` and `pedals/`, instead of
duplicating `toUploadedFiles`/`toStringField` in `src/pedals/parse-multipart.ts`.** Rejected: the two
files' actual field shapes (`preset`/`ir`/`nam`/`cover` vs. `name`/`image`) are unrelated and would grow
independently as each domain evolves (e.g. `song_metadata_and_extra_config`, feature 7, will likely add
fields only `songs/parse-multipart.ts` needs) — `docs/architecture.md` principle 1 already scopes each
domain area to its own files, and the shared logic here is a handful of lines, not enough duplication to
justify a cross-domain dependency between two otherwise-independent feature areas.
