# Design — song_file_export_import

## Guiding decision: selecting among same-`kind` rows

`:kind` alone identifies at most one row for `preset` (exactly one per song, enforced by
`idx_song_files_one_preset_per_song`) and `cover` (0..1, `song_crud_api` R7), but `ir`/`nam` can have
many rows per song. The route's shape (`GET /songs/:id/files/:kind`) is fixed by this feature's own
title/acceptance criteria, so the resolution has to fit inside that two-segment path — this feature adds
an **optional `sort_order` query parameter** (defaulting to `0`) rather than changing the path shape.
`sort_order` (not an opaque file id) was chosen because:
- `0001_init.sql`'s migration for `song_crud_api` already created
  `idx_song_files_song_id_kind_sort_order` on exactly `(song_id, kind, sort_order)` — the schema was
  already shaped for "look up by song + kind + sort_order" as the natural access pattern, not by a
  standalone file id.
- `sort_order` is caller-predictable: a client that just uploaded 3 `ir` files via `POST /songs` already
  knows they landed at `sort_order` 0, 1, 2 (`song_crud_api` R4/R5) without needing to read back file ids
  from the create response first.

See "Discarded alternatives" below for the rejected file-id-based route.

## Files to touch

### `src/songs/song-service.ts` (extend, no new file)
Add alongside the existing `SongError`/`createSong`/`listSongs`/`getSongById`/`deleteSong`:

```ts
const SONG_FILE_KINDS = ["preset", "ir", "nam", "cover"] as const;
type SongFileKind = (typeof SONG_FILE_KINDS)[number];

function isSongFileKind(value: string): value is SongFileKind {
  return (SONG_FILE_KINDS as readonly string[]).includes(value);
}

export interface SongFileContentDto {
  bytes: Uint8Array;
  mimeType: string;
  originalFilename: string;
}

export async function getSongFile(
  userId: string,
  songId: string,
  kind: string,
  sortOrderParam: string | undefined,
  storage: StorageAdapter = getStorage(),
): Promise<SongFileContentDto> {
  if (!isUuid(songId)) throw new SongError("song not found", 404); // R5
  if (!isSongFileKind(kind)) throw new SongError("song file not found", 404); // R7

  let sortOrder = 0;
  if (sortOrderParam !== undefined) {
    if (!/^\d+$/.test(sortOrderParam)) throw new SongError("song file not found", 404); // R9
    sortOrder = Number(sortOrderParam);
  }

  const db: SQL = getDb();
  const [row] = await db<
    { storage_key: string; mime_type: string; original_filename: string }[]
  >`
    SELECT sf.storage_key, sf.mime_type, sf.original_filename
    FROM song_files sf
    JOIN songs s ON s.id = sf.song_id
    WHERE s.id = ${songId}
      AND s.user_id = ${userId}
      AND s.deleted_at IS NULL
      AND sf.kind = ${kind}
      AND sf.sort_order = ${sortOrder}
      AND sf.deleted_at IS NULL
  `;
  if (!row) throw new SongError("song file not found", 404); // R6, R8

  const bytes = await storage.get(row.storage_key);
  if (bytes === null) {
    // Invariant violation: song_crud_api's design.md guarantees bytes are written before the DB
    // row is committed, so a live row with unreadable bytes means storage was tampered with or
    // corrupted outside the app. Per docs/architecture.md principle 3, this must not be silently
    // mapped to 404 (which would look like "file was never uploaded" and hide the corruption) —
    // let it propagate uncaught (R11).
    throw new Error(`song_files row ${row.storage_key} has no bytes in storage`);
  }

  return { bytes, mimeType: row.mime_type, originalFilename: row.original_filename };
}
```

Single JOIN query (rather than `getSongById`'s two-step song-then-files shape) because this lookup only
ever needs one row and one round trip; R6 ("song not found/deleted/foreign-owned") and R8 ("no matching
file row") collapse into the same generic 404, exactly like `getSongById`'s single "song not found"
message already does for the analogous song-level cases.

### `src/index.ts` (extend)
```ts
import { /* existing */, getSongFile } from "./songs/song-service";

protectedRouter.get("/songs/:id/files/:kind", async (c) => {
  try {
    const file = await getSongFile(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("kind"),
      c.req.query("sort_order"),
    );
    return c.body(file.bytes, 200, {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.originalFilename}"`,
    });
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
```
Registered on `protectedRouter`, same as every other `/songs` route (R10), mirroring the existing
`SongError` -> `c.json({error}, status)` mapping verbatim.

### `src/songs/song-service.test.ts` (extend)
New `describe("getSongFile")` block, same fixture pattern as the rest of the file (fresh `mkdtemp()` +
injected `LocalFsStorageAdapter` per test via `beforeEach`/`afterEach`, `seedSong` helper reused/extended
to accept `ir`/`nam`/`cover` overrides). Covers R1-R2, R5-R9, R11.

### `src/index.test.ts` (extend)
One real end-to-end round trip through `app.request()`: `POST /songs` with a `preset` (and a couple of
`ir`) files, then `GET /songs/:id/files/preset` and `GET /songs/:id/files/ir?sort_order=1` against the
running app, asserting the response body bytes match what was uploaded and the headers are set (R1-R4).
Plus a 401-without-`Authorization`-header case (R10), matching the existing pattern for the other `/songs`
routes.

## Error handling
No new error class — `SongError` (400 | 404, already defined in `song-service.ts`) is reused as-is;
`getSongFile` never throws the `400` variant (every failure path here is a 404 per the requirements).
The one exception is R11's storage-invariant case, which is a plain, uncaught `Error` — consistent with
`docs/architecture.md` principle 3 ("never let an unexpected exception surface as a raw 500 ... but also
never swallow one silently").

## Discarded alternatives

**A file-id-based route, `GET /songs/:id/files/:fileId`, instead of `:kind` + `sort_order`.** Rejected:
this feature's own title/acceptance criteria (`scripts/harness.sh status`) specify the route literally as
`GET /songs/:id/files/:kind`, and a file-id route would require every caller to first read a
`song_files.id` out of a prior `GET /songs/:id` response before it could download anything, whereas
`sort_order` is already predictable from the `POST /songs` response order (`song_crud_api` R4/R5) and
matches the index Postgres already has on `(song_id, kind, sort_order)`.

**Returning all `ir`/`nam` files of a kind concatenated (e.g. a zip or multi-part response) when more
than one exists, instead of requiring `sort_order` to pick one.** Rejected: this feature's acceptance
criteria require the response to be byte-for-byte identical to a single originally-uploaded file — an
"exactly what was uploaded" contract that concatenation or archiving would break, and it would need a
new content type (`application/zip`) not implied by anything in this feature's scope.

**Mapping a `storage.get` miss (R11) to HTTP 404, the same status as "file doesn't exist" (R6/R8).**
Rejected: a `song_files` row that exists in Postgres but has no readable bytes is not the same situation
as a row that was never created — the former means the write-before-commit invariant
`song_crud_api`'s design.md establishes was violated (storage corruption/external tampering), and masking
that behind an ordinary "not found" would make it invisible instead of surfacing as a loud failure.

**Silently treating a malformed `sort_order` query parameter (e.g. `?sort_order=abc`) as the default
`0`.** Rejected: that would make `?sort_order=abc` behave identically to omitting the parameter,
silently discarding a caller's mistake instead of reporting it; treating it as "no such file" (404, R9)
is consistent with how `isUuid`'s guard already short-circuits a malformed `:id` to 404 rather than
letting a bad value reach — and potentially error unpredictably against — the database driver.
