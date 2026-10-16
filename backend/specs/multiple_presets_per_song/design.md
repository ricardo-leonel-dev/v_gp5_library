# Design — multiple_presets_per_song

This design follows the layering in `docs/architecture.md`. Route wiring stays in `src/index.ts`.
Business logic and SQL go in `src/songs/song-service.ts`. Multipart shaping goes in
`src/songs/parse-multipart.ts`. Schema changes are plain `.sql` files under `src/db/migrations/`. Naming,
English-only error strings, colocated `bun:test` tests and the soft-delete filter come from
`docs/conventions.md`. No new dependency is added.

## Files to touch

| File | Change |
|---|---|
| `src/db/migrations/0004_multiple_presets_per_song.sql` | **New.** Drops `songs.pedal_preset_name`, adds `song_files.pedal_preset_name`, swaps the preset unique index, adds a CHECK (R1–R6). |
| `src/songs/prst-name.ts` | **New.** `readPresetName(bytes: Uint8Array): string \| null` (R7–R11). Pure, no I/O. |
| `src/songs/prst-name.test.ts` | **New.** Unit tests on the real samples plus synthesized byte arrays. |
| `src/songs/fixtures/02-TLDLXAMP.prst`, `36-TLAC3CL1.prst`, `55-TLPLXSLO.prst` | **New.** Byte-for-byte copies of the samples in `../external_docs/` (repo root `external_docs/`). Copying them is the implementer's job (T1). |
| `src/songs/parse-multipart.ts` | Stop reading `pedal_preset_name` (R18). |
| `src/songs/song-service.ts` | Input type, validation, preset rows, DTOs, `listSongs`, `getSongById` (R12–R25). `getSongFile` needs **no logic change**. |
| `src/db/migrate.test.ts`, `src/songs/song-service.test.ts`, `src/index.test.ts` | Rewrite invalidated tests (see "Invalidated requirements and tests"), add new ones. |
| `src/index.ts` | **No change expected.** `POST /songs` already uses `parseBody({ all: true })`; `GET /songs/:id/files/:kind` already forwards `sort_order`. |

## Migration `0004_multiple_presets_per_song.sql`

Must be re-runnable (R3); tests re-execute it with `db.unsafe(await readFile(...))`. Postgres has no
`ADD CONSTRAINT IF NOT EXISTS`, so the CHECK is dropped and re-added.

```sql
ALTER TABLE songs DROP COLUMN IF EXISTS pedal_preset_name;

ALTER TABLE song_files ADD COLUMN IF NOT EXISTS pedal_preset_name VARCHAR(255);

DROP INDEX IF EXISTS idx_song_files_one_preset_per_song;
CREATE UNIQUE INDEX IF NOT EXISTS idx_song_files_preset_sort_order
  ON song_files(song_id, sort_order) WHERE kind = 'preset' AND deleted_at IS NULL;

ALTER TABLE song_files DROP CONSTRAINT IF EXISTS song_files_pedal_preset_name_preset_only;
ALTER TABLE song_files ADD CONSTRAINT song_files_pedal_preset_name_preset_only
  CHECK (kind = 'preset' OR pedal_preset_name IS NULL);
```

Notes:
- No backfill (decided: no stored production data). The header comment should say this migration
  supersedes the "exactly one preset per song" rule of 0001/0003 and the song-level name column. Applied
  migrations are never edited, so `0001_init.sql`'s comment simply becomes stale.
- The column is `VARCHAR(255)` even though the parser caps names at 16 chars: the 16-char cap is an
  unverified assumption (below), and widening a column later costs a migration while a wide column costs
  nothing. The parser, not the column, is the real bound.
- "Every preset row has a name" is enforced in the service (R15, R17), **not** by a
  `CHECK ((kind = 'preset') = (pedal_preset_name IS NOT NULL))`. See discarded alternative 3.
- Local dev/test databases may hold nameless preset rows left by earlier test runs (tests never reset
  the DB). They are harmless: tests create fresh users, so no test reads them. A nameless legacy row would
  surface as `name: null` at runtime; no production data exists, so this is accepted.
- The existing `idx_song_files_song_id_kind_sort_order (song_id, kind, sort_order)` index already serves
  the ordered `presets` read and a per-song `COUNT(*) ... WHERE kind = 'preset'` (feature 14).

## Preset name parsing (`src/songs/prst-name.ts`)

Format, verified with `xxd` on all three samples in `external_docs/` (`02-TLDLXAMP.prst`,
`36-TLAC3CL1.prst`, `55-TLPLXSLO.prst`):

| Offset | Content in all 3 samples |
|---|---|
| total size | 507 bytes |
| `0x00..0x03` | ASCII `GP-5` (`47 50 2D 35`) |
| `0x15..0x18` | `FF FF FF FF` |
| `0x19..0x28` (16 bytes) | preset name, ASCII, NUL-padded: `TL DLX AMP`, `TL AC3 CL1`, `TL PLX SLO` |
| `0x29` | `FF` |

```ts
export const PRST_MAGIC = "GP-5";
export const PRST_NAME_OFFSET = 0x19;
export const PRST_NAME_MAX_LENGTH = 16;

export function readPresetName(bytes: Uint8Array): string | null;
```

Algorithm:
1. `bytes.length < 0x29` → `null` (R8).
2. First 4 bytes ≠ `GP-5` → `null` (R9).
3. Take bytes `0x19 .. 0x29` (exclusive), stop at the first `0x00` (R7).
4. Any byte outside `0x20..0x7E` → `null` (R11).
5. Empty, or only spaces → `null` (R10).
6. Return the bytes decoded as ASCII, **untrimmed** (reference-only metadata, stored as read).

Deliberately **not** checked: total size 507, byte `0x29 == 0xFF`, file extension, MIME type. Each would
reject files that might be valid (other firmware, a 16-char name layout we have not seen) without making
the name extraction any safer. The magic plus the printable-ASCII rule is what makes "readable" mean
something.

**Known assumption — 16-char max.** The field width (`0x19..0x28`, 16 bytes) is inferred from layout
only: all three samples have 10-char names followed by NUL padding up to the `0xFF` at `0x29`. No
long-name sample exists (the human cannot rename on the device right now). If the device allows names
longer than 16 chars, or a 16-char name is not laid out as 16 bytes with no NUL, R7 will truncate or
misread it. A later sample with a 16-char name must be checked against this; the 16-char unit test
(T3) uses a synthesized buffer, not a device file.

## Multipart parsing

`CreateSongInput` loses `pedalPresetName`. `parseCreateSongMultipart` stops reading
`body.pedal_preset_name`. The multipart parser already ignores every field it does not know, so a client
still sending `pedal_preset_name` gets exactly the behaviour of any other unknown field (R18).

**Decision: ignore, not 400.** Ignoring is consistent with how every other unknown multipart field is
treated today and needs no special code path. A 400 would be the only field-specific rejection of an
unknown field in the API, and there is no deployed client that would benefit from the error (the
frontend does not call `POST /songs` yet).

## `createSong` changes (`song-service.ts`)

Validation order. All checks run before any `storage.put` and before the transaction, so a rejected
request leaves no rows and no stored objects:

1. `name` required (unchanged).
2. `input.preset.length === 0` → `SongError("at least one preset file is required", 400)` (R16).
   Replaces `"exactly one preset file is required"`.
3. Cover count, `extra_config` size and JSON (unchanged).
4. `presetNames = input.preset.map((p) => readPresetName(p.bytes))`. First `null` at index `i` →
   `SongError(\`preset file at position ${i} has no readable GP-5 preset name\`, 400)` (R17).
5. User lookup and plan-limit check, unchanged; still counts `songs` only (R30).

Step 4 sits after step 3 on purpose: existing `extra_config` 400 tests send fake preset bytes and must
keep failing on `extra_config`, not on the preset name.

`filesToCreate` maps **every** `input.preset[i]` to
`{ kind: "preset", sortOrder: i, pedalPresetName: presetNames[i], storageKey: songs/<songId>/<uuid> }`
(R12–R15). Other kinds get `pedalPresetName: null`. The `INSERT INTO song_files` adds the
`pedal_preset_name` column and returns it. The `INSERT INTO songs` drops `pedal_preset_name`.

## DTOs

```ts
export interface SongPresetDto {
  id: string;
  sortOrder: number;
  name: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface SongDto {
  id: string;
  name: string;
  artist: string | null;
  extraConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  presets: SongPresetDto[]; // R19–R22; pedalPresetName removed (R25)
}

export interface SongWithFilesDto extends SongDto {
  files: SongFileDto[]; // ir/nam/cover only (R23, R24)
}
```

`SongFileDto` is unchanged. `toSongDto(row, presets)` takes the already-ordered preset list; add
`toSongPresetDto(row)`. Remove `pedal_preset_name` from every `SELECT ... FROM songs`.

- `createSong`: split the inserted rows: presets → `presets` (sorted by `sort_order`), the rest →
  `files`.
- `getSongById`: one query for presets
  (`WHERE song_id = $1 AND kind = 'preset' AND deleted_at IS NULL ORDER BY sort_order ASC`) and the
  existing `files` query gains `AND kind <> 'preset'`. Fetching all rows once and splitting in
  TypeScript is equally acceptable; the implementer may choose.
- `listSongs`: **one** extra query for all of the caller's songs, not one per song:

  ```sql
  SELECT sf.song_id, sf.id, sf.sort_order, sf.pedal_preset_name, sf.original_filename,
         sf.mime_type, sf.byte_size, sf.created_at
  FROM song_files sf JOIN songs s ON s.id = sf.song_id
  WHERE s.user_id = $userId AND s.deleted_at IS NULL
    AND sf.kind = 'preset' AND sf.deleted_at IS NULL
  ORDER BY sf.song_id, sf.sort_order ASC
  ```

  Grouped into a `Map<songId, SongPresetDto[]>` in TypeScript. Multi-tenancy via `s.user_id`
  (architecture principle 5).

## Export (`GET /songs/:id/files/preset`)

`getSongFile` already does what R26–R28 need: it resolves `sort_order` (default `0`), filters `kind`,
`sort_order` and `deleted_at IS NULL`, and returns 404 when no row matches; malformed `sort_order` is
already 404 (feature-4 R9). This feature adds tests only. Defaulting to preset 0 when `sort_order` is
omitted (R27) keeps the existing feature-4 behaviour.

## No mutation (R29)

No new route is registered. `PUT`/`PATCH /songs/:id` and `POST`/`PUT`/`PATCH`/`DELETE
/songs/:id/files/preset` hit known paths with unregistered methods: they pass the unknown-route guard
(the path exists under another method), pass `requireAuth`, and land in the JSON `notFound` handler with
404 (`docs/architecture.md`, "Data Flow"). The R29 test also asserts the song's preset rows are
unchanged afterwards.

## Plan limits (R30) and feature 14

`PLAN_SONG_LIMITS` and the `COUNT(*) FROM songs` check are untouched. Feature 14 will add per-song
preset limits; this design keeps that easy:
- The request's preset count is `input.preset.length`, known before any I/O, so a 402 check can sit next
  to the existing song-count check.
- A stored song's preset count is `presets.length` in every DTO, or
  `SELECT COUNT(*) FROM song_files WHERE song_id = $1 AND kind = 'preset' AND deleted_at IS NULL`,
  which is index-backed.

## Error paths

All are `SongError`, mapped by the existing handlers to `{error}`:

| Condition | Status | Message |
|---|---|---|
| zero preset parts | 400 | `at least one preset file is required` |
| a preset with no readable name | 400 | `preset file at position <i> has no readable GP-5 preset name` |
| export `sort_order` with no matching preset | 404 | `song file not found` (existing) |

A unique-index violation (R5) or CHECK violation (R6) can only come from a code bug (sort orders are
generated `0..N-1`, names only set on presets). They are not caught and propagate (principle 3).

## Invalidated requirements and tests

Older done specs this feature supersedes. The implementer rewrites the listed tests; spec authors and
implementers do not edit other features' spec files (the leader may add/extend "superseded" notes):

| Older requirement | Status after this feature | Tests to rewrite |
|---|---|---|
| `songs_schema_migrations` R10, R11 (one active preset per song) | Superseded: active preset `sort_order` unique per song (R4, R5). Note already present. | `migrate.test.ts` "a second active preset song_files row for the same song is rejected (R10, R11)" → R4/R5 tests. Keep the R8 soft-delete replacement test. |
| `song_crud_api` R1 (exactly one preset; response "song and its files") | Superseded in part: 1..N presets; presets now in `presets`, not `files`. Note present. | Every `createSong`/`POST /songs` success test asserting `files` contains the preset. |
| `song_crud_api` R3 (400 unless exactly one preset) | Superseded in part: 400 only for zero presets. Note present. | `song-service.test.ts` "two preset files -> SongError(400) (R3)" → success; "zero preset files" message expectation. |
| `song_crud_api` R11 (stores `pedal_preset_name` on the song) | **Fully superseded for `pedal_preset_name`**: field ignored, column dropped; name comes from bytes. Existing note says "per-preset field aligned by position", which is now wrong and should be updated by the leader. `artist` part unchanged. | `song-service.test.ts` "valid preset + artist + pedalPresetName + extraConfig ... (R1, R6, R8, R11, R13)". |
| `song_crud_api` R12 (omitted `pedal_preset_name` → NULL) | **Superseded for `pedal_preset_name`** (no note yet). `artist` part unchanged. | `song-service.test.ts` "omitting artist / pedalPresetName / extraConfig stores null / null / {} (R10, R12)" (selects the dropped column). |
| `song_crud_api` R16 (`GET /songs/:id` returns all `song_files` rows) | **Superseded in part** (no note yet): preset rows move to `presets`. | `song-service.test.ts` test asserting `files.map(kind)` equals `["cover","ir","nam","nam","preset"]` → `["cover","ir","nam","nam"]`. |
| `0001_init.sql` comment "exactly one per song" | Stale; not edited (applied migration). | — |

Also: every **success-path** test that creates a song through `createSong` or `POST /songs` currently
sends fake preset bytes (`[1,2,3,4,5]`, `[42,43,44,45]`, `[4,5,6]`, ...) and will now get a 400. The
`presetFile()` helper in `song-service.test.ts` and the inline `preset` parts in `src/index.test.ts`
must use the real fixtures. Tests that expect a 400 for a different reason before step 4 (name,
`extra_config`, cover count) keep working with fake bytes. `song-pedal-config-service.test.ts` inserts
songs via SQL without `pedal_preset_name`, so it is unaffected.

## Discarded alternatives

1. **Client sends the name** (repeatable `pedal_preset_name` text field aligned by position — the
   previous draft of this spec). Rejected by the human: the name already lives in the file, so a
   client-supplied copy can only disagree with it.
2. **Keep `songs.pedal_preset_name` as a mirror of preset 0.** Rejected: no stored data needs it, and
   it duplicates per-preset data, which the API shape decision forbids.
3. **Biconditional CHECK `(kind = 'preset') = (pedal_preset_name IS NOT NULL)`.** Rejected: local
   dev/test databases already contain nameless preset rows from earlier test runs (tests never reset the
   DB), so adding the constraint fails the migration. `NOT VALID` avoids that, but Postgres still checks
   it on any UPDATE of those rows, so soft-deleting an old song would start failing. The service
   guarantees names on insert instead (R15, R17).
4. **New `song_presets` table.** Rejected: `song_files` already has `kind`, `sort_order`,
   `storage_key`, soft delete, the `(song_id, kind, sort_order)` index and the export route keyed on
   `kind` + `sort_order`. A separate table would duplicate all of that for one extra column.
5. **Reject `pedal_preset_name` with 400.** Rejected; see "Multipart parsing".
6. **Validate size == 507 and `0x29 == 0xFF`.** Rejected; see "Preset name parsing".

## Open questions (for the human approver)

- **Q1 — non-ASCII names.** R11 rejects any byte outside printable ASCII. If the GP-5 lets users type
  characters outside that range (accents, symbols), such presets would be rejected with 400. All three
  samples are plain ASCII; no evidence either way. Accept the strict rule for now?
- **Q2 — superseded notes.** `song_crud_api` R11's existing note ("per-preset field aligned by
  position") is now inaccurate, and R12/R16 have no note yet. The leader should update those notes;
  confirm that is wanted.

## Visual direction

Not applicable. This is a backend-only feature with no user-facing UI.
