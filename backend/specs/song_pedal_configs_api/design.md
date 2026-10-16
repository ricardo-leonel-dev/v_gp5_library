# Design — song_pedal_configs_api

## No schema change

`song_pedal_configs` (`id`, `song_id`, `user_id`, `pedal_catalog_id`, `label`, `config`, `created_at`,
`updated_at`, `deleted_at`) already exists from `songs_schema_migrations` (feature 2, `done`) — see
requirements.md's scope note. This feature adds no `src/db/migrations/*.sql` file.

## No storage/transaction involvement

Unlike `createSong`/`createPedal`, nothing in this feature touches `StorageAdapter` — `song_pedal_configs`
has no file-backed column. `createSongPedalConfig` is a single `INSERT` statement (after two guard
`SELECT`s), so it needs no `db.begin` transaction, matching `createPedal`'s reasoning (a single statement
is already atomic) rather than `createSong`'s multi-row transaction (which exists only because that
function writes several `song_files` rows atomically).

## Files to touch

### New: `src/song-pedal-configs/song-pedal-config-service.ts`
Business logic + DB queries, per `docs/architecture.md` principle 1's `*-service.ts` shape. A new,
separate domain folder from `src/songs/` and `src/pedals/` — see "Discarded alternatives" for why this
isn't folded into `song-service.ts`.

```ts
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
  config?: unknown; // already-parsed JSON value from the request body, undefined if omitted
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

export async function createSongPedalConfig(
  userId: string,
  songId: string,
  input: CreateSongPedalConfigInput,
): Promise<SongPedalConfigDto> { ... }

export async function listSongPedalConfigs(
  userId: string,
  songId: string,
): Promise<SongPedalConfigDto[]> { ... }

export async function deleteSongPedalConfig(
  userId: string,
  songId: string,
  configId: string,
): Promise<void> { ... }
```

`createSongPedalConfig` body, in order:
1. `isUuid(songId)` guard — no match, throw `SongPedalConfigError("song not found", 404)` (R2).
2. `SELECT id FROM songs WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL` — no row,
   throw `SongPedalConfigError("song not found", 404)` (R3).
3. Validate `input.label` truthy (R4) — throw `SongPedalConfigError("label is required", 400)` otherwise.
4. Validate `input.pedalCatalogId`: must be `isUuid(...)` (falls through to the same "not found" message
   for a malformed value, so a syntactically-invalid UUID never reaches Postgres as a query parameter —
   same reasoning `getSongById`/`deleteSong` already apply to `:id`) and must match `SELECT id FROM
   pedal_catalog WHERE id = ${input.pedalCatalogId} AND deleted_at IS NULL` — no match, throw
   `SongPedalConfigError("pedal_catalog_id does not reference an existing pedal", 400)` (R5).
5. Validate `input.config`: `undefined` -> `{}` (R8); a non-null, non-array `object` -> stored as-is (R6);
   anything else (`string`/`number`/`boolean`/array/`null`) -> throw `SongPedalConfigError("config must be
   a JSON object", 400)` (R7). Unlike `song_crud_api`'s `extraConfig`/`song_pedal_configs_api`'s own
   `config` never arrives as a raw JSON *string* needing `JSON.parse` — this route's request body is
   `application/json` end to end (`c.req.json()` in `index.ts`), so `input.config` is already a parsed JS
   value by the time it reaches the service, only its *shape* needs checking.
6. `INSERT INTO song_pedal_configs (id, song_id, user_id, pedal_catalog_id, label, config) VALUES
   (${crypto.randomUUID()}, ${songId}, ${userId}, ${input.pedalCatalogId}, ${input.label},
   ${JSON.stringify(config)}::jsonb) RETURNING id, song_id, pedal_catalog_id, label, config, created_at,
   updated_at` (R1).
7. Return the `SongPedalConfigDto` built from the row just inserted.

`listSongPedalConfigs` body:
1. `isUuid(songId)` guard -> 404 (R2).
2. `SELECT id FROM songs WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL` — no row,
   throw 404 (R11).
3. `SELECT id, song_id, pedal_catalog_id, label, config, created_at, updated_at FROM song_pedal_configs
   WHERE song_id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL ORDER BY created_at DESC`
   (R10) — the `user_id` filter here is redundant given step 2 already proved `:id`'s song has exactly one
   owner (this route's own caller, once step 2 passes), but is kept per `docs/architecture.md` principle
   5's "every query touching `song_pedal_configs` filters by `user_id`" rule, applied literally rather
   than relying on the join being airtight elsewhere. Ordering isn't specified by any `R<n>`, `created_at
   DESC` is a reasonable default matching `listSongs`/`listPedals`, not independently tested.

`deleteSongPedalConfig` body:
1. `isUuid(songId) && isUuid(configId)` guard -> 404 if either fails (R2).
2. `SELECT id FROM songs WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL` — no row,
   throw 404 (R13's song-side conditions).
3. `UPDATE song_pedal_configs SET deleted_at = NOW() WHERE id = ${configId} AND song_id = ${songId} AND
   user_id = ${userId} AND deleted_at IS NULL RETURNING id` — zero rows affected, throw
   `SongPedalConfigError("song pedal config not found", 404)` (R13's config-side conditions); this single
   filtered `UPDATE ... RETURNING` is enough to make "find, then modify" atomic without a separate
   `db.begin`/`FOR UPDATE` transaction, unlike `deleteSong` (which needs a transaction because it modifies
   *two* tables — `songs` and `song_files` — and must not leave one updated without the other).
4. On success (a row was returned), resolve with no value (R12) — the route handler maps this to 204.

**No dependency-injected `storage` parameter anywhere in this file** — none of its three functions touch
`StorageAdapter`, unlike `createSong`/`createPedal`.

**Reusing `isUuid` from `../songs/song-service`** rather than duplicating the regex — see "Discarded
alternatives" for why this is different from `pedal_catalog_api`'s rejected shared-`parse-multipart.ts`
precedent.

### `src/index.ts`
```ts
import {
  createSongPedalConfig,
  listSongPedalConfigs,
  deleteSongPedalConfig,
  SongPedalConfigError,
} from "./song-pedal-configs/song-pedal-config-service";

protectedRouter.post("/songs/:id/pedals", async (c) => {
  const body = await c.req.json<{ pedal_catalog_id?: string; label?: string; config?: unknown }>();
  try {
    const config = await createSongPedalConfig(c.get("userId"), c.req.param("id"), {
      pedalCatalogId: body.pedal_catalog_id,
      label: body.label,
      config: body.config,
    });
    return c.json(config, 201);
  } catch (err) {
    if (err instanceof SongPedalConfigError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/songs/:id/pedals", async (c) => {
  try {
    return c.json(await listSongPedalConfigs(c.get("userId"), c.req.param("id")));
  } catch (err) {
    if (err instanceof SongPedalConfigError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.delete("/songs/:id/pedals/:configId", async (c) => {
  try {
    await deleteSongPedalConfig(c.get("userId"), c.req.param("id"), c.req.param("configId"));
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof SongPedalConfigError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
```
All three routes register on `protectedRouter` (R9), never on the base `app`, matching every existing
`/songs`/`/pedals` route. `SongPedalConfigError` -> `c.json({error}, status)` mirrors the existing
`SongError`/`PedalError`/`AuthError` handling verbatim. A syntactically invalid top-level JSON body on
`POST /songs/:id/pedals` (`c.req.json()` itself throwing) is out of scope for this feature to guard
against — `/auth/register` and `/auth/login` already call `c.req.json()` unguarded with no requirement
covering that case either; introducing handling for it here alone, without a project-wide `app.onError`
decision, would be an inconsistent one-off fix for a pre-existing gap that belongs to a future
cross-cutting feature, not this one.

### New: `src/song-pedal-configs/song-pedal-config-service.test.ts`
Colocated per `docs/conventions.md`. Hits the real local Postgres (no DB reset between test files, uses
`crypto.randomUUID()`-based emails for any `users` rows it inserts, same as `song-service.test.ts`/
`pedal-service.test.ts`); no filesystem/`mkdtemp()` fixture needed since this feature never touches
`StorageAdapter`. Covers R2-R8, R10-R13 (see `tasks.md` for the exact per-test mapping).

### `src/index.test.ts`
Extended with: (a) a real end-to-end `POST /songs/:id/pedals` JSON request through `app.request()`,
proving the full route -> service -> DB wiring and the 201 response shape (R1); (b) one request per route
with no `Authorization` header, each asserting 401 (R9) — this is the only place R9 can be tested, since
`song-pedal-config-service.ts` never sees a token, only an already-resolved `userId`; (c) `POST
/songs/:id/pedals` as user B against a song owned by user A returns 404 — the acceptance criterion's own
explicit example (R3); (d) `GET /songs/:id/pedals` proving two users' configs referencing the same shared
`pedal_catalog_id`, on their own respective songs, never leak into each other's list (R10); (e) an
end-to-end `POST` then `DELETE` then `GET` proving a deleted config no longer appears (R12).

## Error handling
`SongPedalConfigError` (400 | 404) is the only new typed error class, matching `SongError`'s shape
exactly. Every other failure (an unexpected Postgres error) propagates uncaught out of the route handler,
same as everywhere else in this codebase, per `docs/architecture.md` principle 3.

## Discarded alternatives

**Respond `404` (not `400`) when `pedal_catalog_id` is missing or doesn't reference an existing,
non-soft-deleted `pedal_catalog` row** — treating it like "the referenced resource wasn't found", the same
status `getSongById`/`getSongFile` use for a missing `songs`/`song_files` row. Rejected: this project's
existing convention (`song_crud_api`'s R2/R3/R7/R9, `pedal_catalog_api`'s R2/R3) reserves `404` for a
route's own path-identified resource (here, the `:id` song and `:configId` config) and uses `400` for
anything wrong with the *request body*, including a body field that references something that doesn't
exist — the exact same category as a missing/empty `name`/`label`. `pedal_catalog_id` arrives as a body
field, not a path parameter, so it follows the body-validation convention, not the path-resource one.

**Hard-`DELETE` the `song_pedal_configs` row on `DELETE /songs/:id/pedals/:configId`**, matching the
route's HTTP verb literally. Rejected: `docs/conventions.md`'s soft-delete convention states application
code never issues a hard `DELETE` against a table with a `deleted_at` column, and `song_pedal_configs` has
one (added in `0002_audit_columns.sql` specifically so every feature touching it would follow this from
the start, per `song_crud_api`'s own design.md precedent for `DELETE /songs/:id`). Setting `deleted_at`
satisfies "the row becomes permanently invisible to every future `GET`/`DELETE`" without violating that
convention.

**Fold `createSongPedalConfig`/`listSongPedalConfigs`/`deleteSongPedalConfig` into `src/songs/
song-service.ts`, since every route this feature adds is nested under `/songs/:id`.** Rejected:
`docs/architecture.md` principle 1 scopes each domain area (songs, song files, pedal catalog) to its own
`*-service.ts`; `song_pedal_configs` is its own table with its own lifecycle (its own soft-delete, its own
ownership semantics distinct from `songs`' single-owner model since it also references the shared
`pedal_catalog`), and `song-service.ts` is already the largest service file in the codebase — adding a
fourth concern (after songs, song_files, song file streaming) to it would work against
`docs/conventions.md`'s "extreme homogeneity" goal of every domain looking like a small, self-contained
unit, the same reasoning that already gave `pedal_catalog` its own `src/pedals/` folder despite also being
reachable only through authenticated routes.

**Duplicate the `isUuid` regex into `song-pedal-config-service.ts` instead of importing it from
`../songs/song-service`**, matching `pedal_catalog_api`'s design.md's rejection of a shared
`parse-multipart.ts`. Rejected: that precedent's reasoning was that the two domains' *field shapes*
(`preset`/`ir`/`nam`/`cover` vs. `name`/`image`) are unrelated and would diverge independently as each
grows — `isUuid` is the opposite case, a single, generic, already-exported, zero-domain-knowledge utility
(a regex test on a string) with nothing to diverge; importing the one canonical implementation avoids two
copies silently drifting if the format check ever needs to change, at the cost of one import between two
already-related domains (this feature's own routes live under `/songs/:id`).

**Add a bulk `DELETE /songs/:id/pedals` (no `:configId`, removing every config for a song at once).**
Rejected: not named by this feature's acceptance criteria or title (`POST/GET/DELETE /songs/:id/pedals` —
`DELETE` sharing that path prefix does not imply it takes no further segment, any more than
`song_crud_api`'s `DELETE /songs/:id` deletes every song). `song_pedal_configs` rows are independently
addressable by `id`; a single-resource `DELETE /songs/:id/pedals/:configId`, symmetric with `DELETE
/songs/:id`, is the natural shape for "remove one pedal config from a song." A future bulk-delete need, if
it ever arises, is a distinct, explicit feature, not an ambiguous overload of this route.

**Have `input.config`'s validation accept a raw JSON *string* field and `JSON.parse` it, mirroring
`song_crud_api`'s `extraConfig` handling exactly.** Rejected: `extraConfig` arrives as one field among a
`multipart/form-data` body (every field value is necessarily a string or `File`), so `song_crud_api` has
no choice but to parse a string. `POST /songs/:id/pedals`'s entire request body is JSON
(`application/json`, parsed once via `c.req.json()`), so `config` is already a structured JS value by the
time `parse-multipart`-style code would run — treating it as a string to re-`JSON.parse` would only work
by accident (e.g. reject a legitimately-nested object) and adds a needless double-encoding step no other
JSON-body route in this codebase (`/auth/register`, `/auth/login`) performs.
