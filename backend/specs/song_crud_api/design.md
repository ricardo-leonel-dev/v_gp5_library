# Design — song_crud_api

## Guiding principle for create ordering

`createSong` touches two systems that can't share a transaction: Postgres and `StorageAdapter`. The
rule, stated once here so it isn't re-derived per operation: **never leave a live, queryable DB row
pointing at bytes that don't exist.** An orphaned, unreferenced file under `storage/` is harmless (inert
disk usage, never surfaced to any user); a `song_files` row with a `storage_key` that can't be read
would break `song_file_export_import` (feature 4) the next time anyone tries to download it. This is why
creation writes bytes *before* the DB transaction — see "Discarded alternatives" for the rejected
inverse ordering.

`deleteSong`, by contrast, is DB-only: it soft-deletes (sets `deleted_at` on) the `songs` row and its
`song_files` rows and never touches `StorageAdapter` at all. Storage bytes are intentionally retained —
the entire point of soft-delete is recoverability, and physically purging the bytes at the same moment
would make a soft-deleted song impossible to actually restore. Reclaiming that disk space is deferred to
a future purge/hard-delete feature, not this one (see the requirements.md scope note and "Discarded
alternatives" below).

## Files to touch

### New: `src/storage/index.ts`
```ts
import { LocalFsStorageAdapter } from "./local-fs-adapter";
import type { StorageAdapter } from "./adapter";

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  adapter ??= new LocalFsStorageAdapter(process.env.STORAGE_DIR ?? "./storage");
  return adapter;
}
```
Mirrors `getDb()` in `src/db/client.ts` exactly (module-level singleton, lazily constructed from an env
var). This is the instance every real route uses; tests never call it (see next section).

### New: `src/songs/song-service.ts`
Business logic + DB queries, per `docs/architecture.md` principle 1's `*-service.ts` shape. Framework-
agnostic: takes plain data in, returns plain DTOs out, never touches Hono/`Request`/`File`.

```ts
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
  extraConfig?: string; // raw JSON text from the multipart field, undefined if omitted
  preset: UploadedFile[]; // service validates this is exactly length 1 (R3)
  ir: UploadedFile[];
  nam: UploadedFile[];
  cover: UploadedFile[]; // service validates length <= 1 (R7)
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

export async function createSong(
  userId: string,
  input: CreateSongInput,
  storage: StorageAdapter = getStorage(),
): Promise<SongWithFilesDto> { ... }

export async function listSongs(userId: string): Promise<SongDto[]> { ... }

export async function getSongById(userId: string, songId: string): Promise<SongWithFilesDto> { ... }

export async function deleteSong(userId: string, songId: string): Promise<void> { ... }
```

`createSong` body, in order:
1. Validate: `input.name` truthy (R2), `input.preset.length === 1` (R3), `input.cover.length <= 1`
   (R7), and if `input.extraConfig !== undefined`, `JSON.parse` it and confirm the result is a
   non-null, non-array object (R9) — any failure throws `SongError(..., 400)` before any DB/storage
   call, so nothing is created (R2, R3, R7, R9 all say "SHALL NOT create any row").
2. `const songId = crypto.randomUUID()`.
3. Build the flat list of files to create: `preset` (sortOrder 0), `ir[i]` (sortOrder `i`), `nam[i]`
   (sortOrder `i`), `cover` if present (sortOrder 0) — each gets its own `crypto.randomUUID()` as
   `fileId` and a storage key of `` `songs/${songId}/${fileId}` ``.
4. `await Promise.all(files.map(f => storage.put(f.storageKey, f.bytes)))` (R13) — happens before any
   DB write, per the guiding principle above.
5. `await db.begin(async (tx) => { INSERT INTO songs (id, user_id, name, artist, pedal_preset_name,
   extra_config) VALUES (...) RETURNING ...; for each file: INSERT INTO song_files (id, song_id, kind,
   storage_key, original_filename, mime_type, byte_size, sort_order) VALUES (...); })` — one
   transaction, same `db.begin` helper `migrate.ts` already uses (see `songs_schema_migrations` design).
   `extra_config` defaults to `{}` when `input.extraConfig` was omitted (R10); `artist`/
   `pedal_preset_name` are `undefined -> NULL` via `Bun.sql`'s tagged-template parameter binding (R11,
   R12).
6. Return the `SongWithFilesDto` built from the rows just inserted (no re-`SELECT` needed).

`listSongs`: `SELECT * FROM songs WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY created_at
DESC` (R15); ordering isn't specified by any `R<n>`, `created_at DESC` is a reasonable default, not
independently tested.

`getSongById`: `isUuid(songId)` guard first (R18); then `SELECT * FROM songs WHERE id = ${songId} AND
user_id = ${userId} AND deleted_at IS NULL` — no row -> `SongError(..., 404)` (R17); otherwise `SELECT *
FROM song_files WHERE song_id = ${songId} AND deleted_at IS NULL ORDER BY kind ASC, sort_order ASC`
(R16).

`deleteSong`: `isUuid(songId)` guard first (R18). Then one `db.begin` transaction: `SELECT id FROM songs
WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL FOR UPDATE` — no row -> throw
`SongError(..., 404)` inside the callback, which `db.begin` rolls back automatically, satisfying "SHALL
NOT modify any row" (R20); otherwise `UPDATE song_files SET deleted_at = NOW() WHERE song_id =
${songId} AND deleted_at IS NULL` and `UPDATE songs SET deleted_at = NOW() WHERE id = ${songId}` (R19).
No `StorageAdapter` call at all — bytes are left exactly as they were, per the guiding principle above.

`isUuid(value: string): boolean` — a small regex-based check
(`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), exported for reuse by both
`getSongById` and `deleteSong`. Its purpose is purely to short-circuit to `SongError(..., 404)` before
building a query with a value Postgres would reject as a malformed `uuid` literal — that avoids a raw,
unmapped driver error reaching the route handler (`docs/architecture.md` principle 3).

**Dependency injection for `storage`:** `createSong` takes `storage: StorageAdapter = getStorage()`
rather than calling `getStorage()` internally (`deleteSong` has no `storage` parameter at all — it never
touches storage, see above). Production code (`index.ts`) never passes it, so it always gets the real
singleton; `song-service.test.ts` passes a `new LocalFsStorageAdapter(tmpDir)` built fresh per test. This
is the same "optional parameter as a test seam" idiom `migrate.ts` already uses for `migrationsDir` (see
`songs_schema_migrations`'s design.md) — applied here because `docs/conventions.md`'s fixture/isolation
convention requires filesystem tests to use a fresh `mkdtemp()` per test, which a shared module-level
singleton (the `getDb()` pattern, fine for Postgres since DB tests intentionally share state) would
prevent.

### New: `src/songs/parse-multipart.ts`
The one place that touches Hono's `BodyData`/Web `File` types, kept out of `song-service.ts` so the
service stays framework-agnostic and directly unit-testable with plain objects.

```ts
import type { CreateSongInput, UploadedFile } from "./song-service";

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

export async function parseCreateSongMultipart(
  body: Record<string, FormValue>,
): Promise<CreateSongInput> {
  return {
    name: toStringField(body.name),
    artist: toStringField(body.artist),
    pedalPresetName: toStringField(body.pedal_preset_name),
    extraConfig: toStringField(body.extra_config),
    preset: await toUploadedFiles(body.preset),
    ir: await toUploadedFiles(body.ir),
    nam: await toUploadedFiles(body.nam),
    cover: await toUploadedFiles(body.cover),
  };
}
```

### `src/index.ts`
```ts
import { createSong, listSongs, getSongById, deleteSong, SongError } from "./songs/song-service";
import { parseCreateSongMultipart } from "./songs/parse-multipart";

protectedRouter.post("/songs", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const input = await parseCreateSongMultipart(body);
  try {
    const song = await createSong(c.get("userId"), input);
    return c.json(song, 201);
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/songs", async (c) => {
  return c.json(await listSongs(c.get("userId")));
});

protectedRouter.get("/songs/:id", async (c) => {
  try {
    return c.json(await getSongById(c.get("userId"), c.req.param("id")));
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.delete("/songs/:id", async (c) => {
  try {
    await deleteSong(c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
```
All four routes register on `protectedRouter` (imported the same way `/auth/logout`/`/auth/me` already
do), never on the base `app` — this is the enforcement point `require_auth_middleware_on_all_routes`'s
design.md names as the reference for every future feature (R14). `SongError` -> `c.json({error},
status)` mirrors the existing `AuthError` handling verbatim.

### New: `src/songs/song-service.test.ts`
Colocated per `docs/conventions.md`. Hits the real local Postgres (no DB reset between files, uses
`crypto.randomUUID()`-based emails for any `users` row it inserts, same as `auth.test.ts`/
`migrate.test.ts`) and a fresh `mkdtemp(os.tmpdir())` directory per test for the injected
`LocalFsStorageAdapter`, cleaned up in `afterEach` — matches `local-fs-adapter.test.ts`'s existing
pattern. Covers R2-R13, R15-R20 (see `tasks.md` for the exact per-test mapping).

### `src/index.test.ts`
Extended with: (a) a real end-to-end `POST /songs` using a `FormData` body through `app.request()`,
proving the full route -> service -> DB/storage wiring and the 201 response shape (R1); (b) one request
per route (`POST /songs`, `GET /songs`, `GET /songs/:id`, `DELETE /songs/:id`) with no `Authorization`
header, each asserting 401 (R14) — this is the only place R14 can be tested, since
`song-service.ts` never sees a token, only an already-resolved `userId`.

## Error handling
`SongError` (400 | 404) is the only new typed error class, matching `AuthError`'s shape exactly. Every
other failure (an unexpected Postgres error, a `StorageAdapter.put` rejection) propagates
uncaught out of the route handler, same as everywhere else in this codebase — never a raw 500 that
silently swallows the cause, per `docs/architecture.md` principle 3.

## Discarded alternatives

**Call `getStorage()` directly inside `song-service.ts`, matching `getDb()`'s pattern exactly (no
dependency injection).** Rejected: `docs/conventions.md`'s fixture/isolation convention requires
filesystem tests to use a fresh `mkdtemp()` per test — a cached module-level singleton would force every
test in the same process to share one storage root (or require monkey-patching `process.env.STORAGE_DIR`
between tests, which doesn't work anyway since the singleton is only constructed once). An optional
`storage` parameter defaulting to `getStorage()` keeps production callers unchanged while letting tests
inject an isolated adapter — the same test-seam shape `migrate.ts`'s `migrationsDir` parameter already
established.

**Hard-`DELETE` the `songs`/`song_files` rows on `DELETE /songs/:id`, matching the feature's own
acceptance-criteria wording ("removes the DB rows") literally.** Rejected: `docs/conventions.md`'s
soft-delete convention — added specifically so `song_crud_api` would follow it from the start — states
application code never issues a hard `DELETE` against a table with a `deleted_at` column; both `songs`
and `song_files` have one. Setting `deleted_at` satisfies the acceptance criterion's actual intent (the
row becomes permanently invisible to every future `GET`/`DELETE`) without violating that convention.

**Write the `songs`/`song_files` DB rows first, then write file bytes to storage afterward, for
`createSong`.** Rejected: a `storage.put` failure after the DB transaction already committed would leave
a live, queryable `song_files` row whose `storage_key` was never actually written — every future read of
that file (`song_file_export_import`, feature 4) would silently 404/error against a row that looks
valid. Writing bytes first means a storage failure leaves zero DB rows (nothing to clean up), and a DB
failure after successful writes leaves only harmless, unreferenced bytes on disk — see the guiding
principle above.

**Have `deleteSong` also call `StorageAdapter.delete` for each file's bytes after soft-deleting the DB
rows** (the original shape of this design, before human review). Rejected: it defeats the purpose of
soft-delete. The whole reason `deleted_at` exists instead of a hard `DELETE` is recoverability — a
soft-deleted song is still physically present and could be restored (e.g. a future `POST
/songs/:id/restore`, out of scope here) by clearing `deleted_at`. Purging the underlying bytes at the
same moment would make that restoration impossible even though the DB row nominally survived, silently
turning every "soft" delete into a delayed hard delete. Freeing that disk space is a distinct, explicit
action — a future purge/hard-delete feature — not something `DELETE /songs/:id` should do implicitly.
