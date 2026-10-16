# Design — add_replace_and_delete_a_preset_in_an_existing_song

Follows `docs/architecture.md`: route wiring in `src/index.ts`, business logic and SQL in
`src/songs/song-service.ts`, multipart shaping in `src/songs/parse-multipart.ts`, multi-tenancy by `userId`
from the JWT (principle 5), typed domain errors (principle 3). Naming, English error strings, colocated
`bun:test` tests and the soft-delete rule come from `docs/conventions.md`. **No migration and no new
dependency.**

## Files to touch

| File | Change |
|---|---|
| `src/songs/song-service.ts` | Widen `SongError` status to `400 \| 404 \| 409`. Add `PRST_BYTE_SIZE`, `parseSortOrderParam`, `validateSinglePreset`, `addSongPreset`, `replaceSongPreset`, `deleteSongPreset` (R2–R40). |
| `src/songs/parse-multipart.ts` | Add `parsePresetMultipart(body)` returning the `preset` file parts only. |
| `src/plans/plan-service.ts` | Extract `checkPresetsPerSongLimit(plan, presetCount)` from `checkPlanLimits`; `checkPlanLimits` calls it (no behavior change for `POST /songs`). |
| `src/index.ts` | Register `POST /songs/:id/presets`, `PUT /songs/:id/presets/:sortOrder`, `DELETE /songs/:id/presets/:sortOrder` on `protectedRouter`. |
| `src/songs/song-service.test.ts` | Service-level tests (storage spies, DB state, concurrency). |
| `src/index.test.ts` | HTTP-level tests (status codes, bodies, auth, unregistered methods). |
| `src/plans/plan-service.test.ts` | One test for `checkPresetsPerSongLimit` boundaries. |

`getSongFile`, `createSong`, `listSongs`, `getSongById`, `deleteSong` keep their behavior. Existing
`multiple_presets_per_song` R29 test (`POST/PUT/PATCH/DELETE /songs/:id/files/preset` → 404) must still pass:
the new routes live under `/presets`, not `/files/preset`.

## Signatures

```ts
// song-service.ts
export class SongError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409) { super(message); }
}

export const MAX_SORT_ORDER = 2147483647;

// GP-5 .prst file size (R39, R40). No such constant exists in src/ today (checked: only tests use the literal
// 507), so it is defined here, next to the only code that enforces it. Not used by createSong.
export const PRST_BYTE_SIZE = 507;

// null when the segment is not a well-formed sortOrder (R3)
export function parseSortOrderParam(raw: string): number | null;

export async function addSongPreset(
  userId: string,
  songId: string,
  files: UploadedFile[],
  storage: StorageAdapter = getStorage(),
): Promise<SongPresetDto>;

export async function replaceSongPreset(
  userId: string,
  songId: string,
  sortOrderParam: string,
  files: UploadedFile[],
  storage: StorageAdapter = getStorage(),
): Promise<SongPresetDto>;

export async function deleteSongPreset(
  userId: string,
  songId: string,
  sortOrderParam: string,
  storage: StorageAdapter = getStorage(),
): Promise<void>;

// parse-multipart.ts
export async function parsePresetMultipart(
  body: Record<string, FormValue>,
): Promise<UploadedFile[]>; // = toUploadedFiles(body.preset); other parts ignored

// plan-service.ts
export function checkPresetsPerSongLimit(plan: Plan, presetCount: number): void; // throws PlanLimitError
```

`deleteSongPreset` takes `storage` only so the R38 test can pass a spy; it never calls it.
`checkPresetsPerSongLimit` throws when `limits.presetsPerSong !== null && presetCount > limit` — the same
predicate `checkPlanLimits` uses today. Add calls it with `presetCount = currentCount + 1`, so "already holds
`limit` or more" (R17) is rejected and an over-limit song (after a downgrade, feature 14 D3) also gets 402.

`SongPresetDto` and `toSongPresetDto` are reused as-is for the R9/R24 body.

## Check order (all three endpoints)

Deterministic so tests can pin R21/R22:

1. **Path shape, no DB:** `isUuid(songId)` else 404 `song not found` (R2); for PUT/DELETE,
   `parseSortOrderParam` else 404 `preset not found` (R3).
2. **Body validation, no DB (POST/PUT):** `validateSinglePreset(files)` (R14–R16, R27, R39, R40), in this
   order:
   - `files.length === 0` → 400 `a preset file is required`
   - `files.length > 1` → 400 `exactly one preset file is allowed`
   - `files[0].bytes.byteLength !== PRST_BYTE_SIZE` → 400 `preset file must be exactly 507 bytes` (R39)
   - `readPresetName(files[0].bytes) === null` → 400 `preset file has no readable GP-5 preset name` (R16)
   Returns `{ file, name }`. A valid `.prst` here is "exactly 507 bytes AND has a readable name".
   **Size is checked before the name** (R40): it is the cheaper, structural check, and a wrong-size file is
   not a GP-5 preset at all, so "wrong size" is the more accurate message when both fail. The order only
   changes the message; the status is 400 either way.
   This is stricter than `POST /songs`, which keeps feature 15's rule (readable name only, no size check,
   feature 15 design "Deliberately not checked"). `createSong` does not call `validateSinglePreset` and is
   not changed by this feature.
3. **POST only:** `getUserPlan(db, userId)`; `null` → 404 `user not found` (same as `createSong`).
4. **Transaction** (`db.begin`), starting with the song lock:
   ```sql
   SELECT id FROM songs
   WHERE id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
   FOR UPDATE
   ```
   No row → 404 `song not found` (R2). The lock serializes every add/replace/delete on the same song, which
   is what makes R10's `max + 1`, R20/R28's name checks and R35's shift race-free (R23). `deleteSong` already
   uses the same lock, so a concurrent song delete is also serialized.
5. Endpoint-specific checks inside the transaction (below), then writes.

400 therefore wins over 404-not-owned, 402 and 409 (R22); 402 wins over 409 (R21).

## `addSongPreset`

Inside the transaction, after the lock:

1. `SELECT sort_order, pedal_preset_name FROM song_files WHERE song_id = ${songId} AND kind = 'preset' AND
   deleted_at IS NULL`.
2. `checkPresetsPerSongLimit(plan, rows.length + 1)` → `PlanLimitError` (R17, R18). Throwing inside
   `db.begin` rolls back; nothing has been written.
3. `rows.some((r) => r.pedal_preset_name === name)` → 409
   `a preset named '<name>' already exists in this song` (R20).
4. `sortOrder = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.sort_order)) + 1` (R10).
5. `storageKey = songs/<songId>/<randomUUID>`; `await storage.put(storageKey, file.bytes)`. The put happens
   only after every check, so a rejected request never calls `put` ("nothing changed").
6. `INSERT INTO song_files (id, song_id, kind, storage_key, original_filename, mime_type, byte_size,
   sort_order, pedal_preset_name) VALUES (..., 'preset', ...) RETURNING id, sort_order, pedal_preset_name,
   original_filename, mime_type, byte_size, created_at` (R11, R12). `mimeType` defaults are already applied by
   `toUploadedFiles`.
7. `UPDATE songs SET updated_at = NOW() WHERE id = ${songId}` (R7). `NOW()` is the transaction start time,
   which is later than the previous `updated_at` written by an earlier transaction.
8. Return `toSongPresetDto(row)`.

If the `INSERT` fails after the `put` (only a code bug or DB outage), the object is orphaned. Accepted: the
same window exists in `createSong`.

## `replaceSongPreset`

Inside the transaction, after the lock:

1. `SELECT id, storage_key, pedal_preset_name FROM song_files WHERE song_id = ${songId} AND kind = 'preset'
   AND sort_order = ${sortOrder} AND deleted_at IS NULL` → none → 404 `preset not found` (R4).
2. `SELECT 1 FROM song_files WHERE song_id = ${songId} AND kind = 'preset' AND deleted_at IS NULL
   AND id <> ${target.id} AND pedal_preset_name = ${name}` → any row → 409
   `a preset named '<name>' already exists in this song` (R28). Comparing against other rows only is what
   allows re-saving under the row's own name (R29).
3. No plan check at all (R30): replace never changes the preset count.
4. New key `songs/<songId>/<randomUUID>`, `await storage.put(newKey, bytes)`.
5. ```sql
   UPDATE song_files SET storage_key = ${newKey}, original_filename = ..., mime_type = ...,
     byte_size = ..., pedal_preset_name = ${name}, updated_at = NOW()
   WHERE id = ${target.id}
   RETURNING id, sort_order, pedal_preset_name, original_filename, mime_type, byte_size, created_at
   ```
   `id`, `sort_order`, `created_at` are untouched (R24).
6. Touch `songs.updated_at` (R7).

After the transaction resolves: `await storage.delete(oldKey)` inside `try/catch`; on error,
`console.warn("failed to delete replaced preset object", oldKey, err)` and still return the DTO (R31, R32).
This is the one place an error is caught and not rethrown: the row already points at the new bytes, so the
request succeeded; the old object is an unreferenced orphan, and the warning keeps it visible in logs
(principle 3 forbids *silent* swallowing). A new key (instead of overwriting the old key) keeps the old bytes
valid if the transaction rolls back after the put.

## `deleteSongPreset`

Inside the transaction, after the lock:

1. `SELECT id, sort_order FROM song_files WHERE song_id = ${songId} AND kind = 'preset' AND deleted_at IS
   NULL ORDER BY sort_order ASC`.
2. Target = row with `sort_order === sortOrder`; none → 404 `preset not found` (R4).
3. `rows.length === 1` → 409 `a song must keep at least one preset` (R37).
4. `UPDATE song_files SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${target.id}` (R34). Soft delete,
   per `docs/conventions.md`.
5. Shift, **one row at a time in ascending `sort_order`** (R35):
   ```ts
   for (const row of rows.filter((r) => r.sort_order > sortOrder)) {
     await tx`UPDATE song_files SET sort_order = ${row.sort_order - 1}, updated_at = NOW()
              WHERE id = ${row.id}`;
   }
   ```
   Why not one `UPDATE ... SET sort_order = sort_order - 1 WHERE sort_order > n`: the partial unique index
   `idx_song_files_preset_sort_order (song_id, sort_order) WHERE kind = 'preset' AND deleted_at IS NULL`
   (migration 0004) is non-deferrable and checked per row, and Postgres does not guarantee row order in a
   multi-row `UPDATE`, so a bulk shift can transiently collide. In ascending order each target slot is
   already free (step 4 removed the deleted row from the index's predicate). Songs hold few presets, so the
   loop is cheap. All rows filter `kind = 'preset'`, so `ir`/`nam`/`cover` rows are never touched (R36).
6. Touch `songs.updated_at` (R7).
7. No storage call (R38): soft-deleted rows keep their bytes, as `deleteSong` already does.

## Routes (`src/index.ts`)

```ts
protectedRouter.post("/songs/:id/presets", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const files = await parsePresetMultipart(body as Record<string, FormValue>);
  try {
    return c.json(await addSongPreset(c.get("userId"), c.req.param("id"), files), 201);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code, plan: err.plan, limit: err.limit }, 402);
    }
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
// PUT /songs/:id/presets/:sortOrder → replaceSongPreset, 200, catches SongError only
// DELETE /songs/:id/presets/:sortOrder → deleteSongPreset, c.body(null, 204), catches SongError only
```

`FormValue` is the type local to `parse-multipart.ts`; export it (or inline the same
`string | File | (string | File)[] | undefined` cast `POST /songs` uses). A non-multipart body (e.g. JSON or empty)
makes `parseBody` return `{}`, which is zero preset parts → 400 (R14).

`GET`/`PATCH` on the new paths (R8) are not registered: the unknown-route guard sees the path exists under
another method, `requireAuth` runs, and the JSON `notFound` handler returns 404 (`docs/architecture.md`,
"Data Flow"). `/songs/:id/presets` (GET, PUT, DELETE) and `/songs/:id/presets/:sortOrder` (GET, POST, PATCH)
all behave this way.

## Error paths

| Condition | Status | Body |
|---|---|---|
| no/invalid Bearer token | 401 | `requireAuth` (unchanged) |
| `:id` not UUID / song not owned, missing or soft-deleted | 404 | `{error: "song not found"}` |
| `:sortOrder` malformed or > 2147483647 | 404 | `{error: "preset not found"}` |
| no live preset at `:sortOrder` | 404 | `{error: "preset not found"}` |
| zero `preset` parts | 400 | `{error: "a preset file is required"}` |
| more than one `preset` part | 400 | `{error: "exactly one preset file is allowed"}` |
| preset part not exactly 507 bytes (checked before the name) | 400 | `{error: "preset file must be exactly 507 bytes"}` |
| unreadable preset name | 400 | `{error: "preset file has no readable GP-5 preset name"}` |
| POST at/over presetsPerSong | 402 | `{error, code: "plan_preset_limit", plan, limit}` |
| POST name already in song | 409 | `{error: "a preset named '<name>' already exists in this song"}` |
| PUT name of a different preset | 409 | same message |
| DELETE of the only preset | 409 | `{error: "a song must keep at least one preset"}` |
| caller has no `users` row on POST | 404 | `{error: "user not found"}` (unreachable through `requireAuth`) |
| storage delete fails after replace | — | 200, `console.warn` |
| unique-index violation during insert/shift | 500 | propagates (code bug only, principle 3) |

## Tests and evidence grouping

- Service tests (`song-service.test.ts`) use the existing `makeUser` (default `premium`), real fixtures and a
  temp-dir `LocalFsStorageAdapter`, wrapped by a small spy that records `put`/`delete` calls and can be told
  to throw on `delete` (R31, R32, R38, "nothing changed").
- All 3 fixtures are exactly 507 bytes. Size tests (R39, R40) use fixture 0 truncated to 506 bytes and extended
  to 508 bytes; the R40 test uses a 506-byte buffer with the magic broken (`bytes[0] = 0`). Name tests (R16)
  must keep the 507-byte length (e.g. `new Uint8Array(507).fill(0x41)`, as feature 15's tests do) so they
  reach the name check.
- Only 3 fixtures with distinct names exist (`TL DLX AMP`, `TL AC3 CL1`, `TL PLX SLO`). Tests that need a
  4th distinct name build one in the test file: copy fixture 0 and overwrite bytes `0x19..0x28` with an ASCII
  name NUL-padded to 16 bytes (the layout from feature 15's design). This is a test helper, not a new fixture
  file.
- R2 (not owned) uses a second user's song; R2 (soft-deleted) uses `deleteSong` first.
- Limit tests downgrade a user with `UPDATE users SET plan = 'free'|'basic'` after seeding as `premium`.
- R23: `Promise.all` of two `addSongPreset` calls with different names on a `premium` song.
- One test may cover several requirements when it asserts each (`docs/specs.md`, "Coverage granularity"),
  e.g. one success test for R9–R13 and R7, one "nothing changed" helper reused by R14–R17, R20, R27, R28, R39,
  R37. The traceability table must still list every `R<n>`.

## Superseded or affected notes in other specs

Spec authors do not edit other features' specs; the leader may add notes:
- `plan_tiers_songs_and_presets_per_song_limits` D2 ("Only `POST /songs` enforces limits") and D3 ("no
  endpoint edits an existing song's presets") are no longer true: `POST /songs/:id/presets` now enforces the
  presetsPerSong limit.
- `multiple_presets_per_song` scope note ("out of scope: any endpoint that adds, replaces ... or removes
  presets of an existing song") is now covered by this feature. Its R29 still holds unchanged.

## Discarded alternatives

1. **Database partial unique index on `(song_id, pedal_preset_name) WHERE kind = 'preset' AND deleted_at IS
   NULL`.** Rejected: `POST /songs` does not enforce name uniqueness (feature 15 R14 even tests two presets
   with identical bytes, hence identical names), so local DBs already hold duplicate-name songs and the index
   creation would fail; it would also change `POST /songs` behavior, which is out of scope. The song-row lock
   makes the service check race-free.
2. **Leave gaps on delete instead of compacting.** Rejected (frontend design §5): the frontend addresses
   presets by `sortOrder` and `GET /songs/:id/files/preset?sort_order=` must keep matching list positions.
3. **Replace as soft-delete + insert of a new row.** Rejected: the contract requires the same `id`, and a new
   row would break the "keep `id`" guarantee that later frontend features rely on.
4. **Overwrite the old storage key in place on replace.** Rejected: if the transaction rolls back after the
   write (e.g. 409 race, DB error), the row would point at the new bytes while keeping the old metadata.
   A new key keeps the old bytes valid until commit.
5. **Single bulk `UPDATE ... sort_order - 1` with a deferrable constraint.** Rejected: needs a migration
   replacing the partial unique index with an exclusion constraint (partial unique constraints cannot be
   `DEFERRABLE`), for a loop of at most a few rows.
6. **Optimistic insert and retry on unique violation instead of `FOR UPDATE`.** Rejected: more code and does
   not protect the name check, which has no DB constraint.
7. **Reuse `checkPlanLimits(plan, 0, count + 1)`.** Rejected: passing a fake song count to skip the song
   limit is a trap for the next reader; a named `checkPresetsPerSongLimit` states the intent.
8. **Name check before size check.** Rejected: a wrong-size file can still carry a readable name at
   `0x19..0x28` (e.g. a truncated real preset), so the name-first order would report the less accurate error
   and do more work on a file already known to be invalid.
9. **Add the 507-byte check to `POST /songs` too.** Rejected: out of scope by human decision; `POST /songs`
   behavior (feature 15) stays as it is.

## Visual direction

Not applicable. Backend-only feature with no user-facing UI.
