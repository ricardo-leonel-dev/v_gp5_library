# Design — pedal_catalog_metadata_brand_description_extras_is_editable

Layering, error handling and soft-delete rules follow `docs/architecture.md` (principles 1 and 3) and
`docs/conventions.md` ("Soft Delete", "Tests"). This design only covers the choices made inside them.
No UI is added, so there is no visual direction section.

## Files to touch

| File | Change |
|---|---|
| `src/db/migrations/0010_pedal_catalog_metadata.sql` | new: columns, backfill, CHECK, index, `pedal_is_attached` function |
| `src/pedals/pedal-service.ts` | `CreatePedalInput`, `PedalDto`, `toPedalDto`, `createPedal` validation + insert, `listPedals` select |
| `src/pedals/parse-multipart.ts` | map `brand` and `description` parts |
| `src/index.ts` | no change expected (the route already passes the parsed input through and maps `PedalError`) |
| `src/db/migrate.test.ts` | R1, R2 tests; add `0010_pedal_catalog_metadata.sql` to the applied-files list |
| `src/pedals/pedal-service.test.ts` | R3, R4, R5, R6, R7 tests; existing raw inserts gain `brand` |
| `src/index.test.ts` | R6 end-to-end test; existing raw inserts gain `brand` |
| `src/song-pedal-configs/song-pedal-config-service.test.ts` | existing raw inserts gain `brand` (P2 keeps passing) |

Raw `INSERT INTO pedal_catalog` fixtures that must gain a `brand` value (the column has no default on
purpose, R1-a): `src/index.test.ts` (2), `src/song-pedal-configs/song-pedal-config-service.test.ts`
(2), `src/pedals/pedal-service.test.ts` (3), `src/db/migrate.test.ts` (1). Use `'Test Brand'`.

## Migration `0010_pedal_catalog_metadata.sql`

Re-runnable, like `0008`/`0009`. Applied by `bun run migrate` inside one transaction
(`src/db/migrate.ts`).

```sql
-- 0010_pedal_catalog_metadata.sql — brand, description, extras, is_editable on the shared catalog.
-- Rows that predate this file are Valeton GP-5 entries: brand backfilled to 'Valeton'. Re-runnable.
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
UPDATE pedal_catalog SET brand = 'Valeton' WHERE brand IS NULL;
ALTER TABLE pedal_catalog ALTER COLUMN brand SET NOT NULL;

ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS description VARCHAR(2000);
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS is_editable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE pedal_catalog DROP CONSTRAINT IF EXISTS pedal_catalog_extras_is_object;
ALTER TABLE pedal_catalog ADD CONSTRAINT pedal_catalog_extras_is_object
  CHECK (jsonb_typeof(extras) = 'object');

CREATE INDEX IF NOT EXISTS idx_song_pedal_configs_pedal_catalog_id
  ON song_pedal_configs(pedal_catalog_id);

CREATE OR REPLACE FUNCTION pedal_is_attached(p_pedal_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM song_pedal_configs spc
    JOIN songs s ON s.id = spc.song_id
    WHERE spc.pedal_catalog_id = p_pedal_id
      AND spc.deleted_at IS NULL
      AND s.deleted_at IS NULL
  );
$$;
```

- `brand` has no default: every insert must name a brand, so a code path that forgets it fails loudly
  (R1-f) instead of silently writing `Valeton`.
- The `UPDATE ... WHERE brand IS NULL` only touches rows without a brand, so a re-run never rewrites a
  real brand (R2-c). It includes soft-deleted rows because `NOT NULL` applies to them too (R2-b).
- `extras`/`is_editable` defaults fill existing rows on `ADD COLUMN` (R2-a); no explicit update needed.
- `idx_song_pedal_configs_pedal_catalog_id`: the foreign key has no index today (only `song_id` and
  `user_id` do); `pedal_is_attached` probes by `pedal_catalog_id` once per listed pedal, so this keeps
  each probe an index lookup.

### Runbook

There is no manual step. Deploy the code, run `bun run migrate` (the same command as every earlier
migration); `0010` backfills in the same transaction that adds the column. To relabel a legacy pedal
with another brand before the edit endpoint exists, an operator runs
`UPDATE pedal_catalog SET brand = '<brand>', updated_at = NOW() WHERE id = '<id>';`. Rollback, if
ever needed: `DROP FUNCTION pedal_is_attached(UUID); DROP INDEX idx_song_pedal_configs_pedal_catalog_id;
ALTER TABLE pedal_catalog DROP CONSTRAINT pedal_catalog_extras_is_object, DROP COLUMN brand,
DROP COLUMN description, DROP COLUMN extras, DROP COLUMN is_editable;` and delete the
`0010_pedal_catalog_metadata.sql` row from `schema_migrations`.

## canEdit (R7)

`canEdit` is defined once, in SQL: `is_editable AND NOT pedal_is_attached(id)`. `listPedals` selects it
as a column in its single `SELECT`, so listing N pedals is still one round trip (no N+1). `createPedal`
selects the same expression in its `RETURNING` clause (it evaluates to `true` for a new row, R6-a), so
both endpoints compute it the same way rather than hard-coding `true`.

Reuse by the follow-up feature: `PATCH /pedals/:id` and the admin lock endpoint call the same
`pedal_is_attached(id)` / `is_editable AND NOT pedal_is_attached(id)` inside their own statement (for
example `UPDATE ... WHERE id = $1 AND is_editable AND NOT pedal_is_attached(id) RETURNING ...`, 409 when
no row comes back). This feature only adds the function; it adds no endpoint.

Multi-tenancy note (`docs/architecture.md` principle 5): `pedal_is_attached` reads
`song_pedal_configs` across all users. That is intentional — the catalog is shared, so another user's
attachment locks the pedal for everyone (R7-c) — and it returns one boolean, exposing no song, user or
config data.

## Service changes (`src/pedals/pedal-service.ts`)

```ts
export interface CreatePedalInput {
  name?: string;
  brand?: string | null;        // null = sent twice or as a file
  description?: string | null;  // null = sent twice or as a file
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
```

- `toPedalDto`'s row type gains `brand`, `description`, `extras`, `is_editable`, `can_edit`.
- Character counting: a module helper `charLength(value: string): number` returning
  `[...value].length` (code points, matching Postgres `VARCHAR(n)`; S5). `String.length` counts UTF-16
  units and would reject 255 emoji that Postgres accepts.
- Limits as module constants: `maxBrandLength = 255`, `maxDescriptionLength = 2000`.
- Validation order in `createPedal`, all before `storage.put` and the insert (so a rejected request
  leaves no row and no file): name (existing) -> brand -> description -> image (existing) ->
  parameters (existing).
  - brand: `null`, `undefined` or blank after trim -> `PedalError("brand is required", 400)`;
    `charLength(trimmed) > 255` -> `PedalError("brand must be at most 255 characters", 400)`.
  - description: `null` -> `PedalError("description must be a single text field", 400)`;
    `undefined` or blank after trim -> stored `NULL`; `charLength(trimmed) > 2000` ->
    `PedalError("description must be at most 2000 characters", 400)`.
- The `INSERT` writes `brand` and `description` (trimmed). It does not write `extras` or `is_editable`;
  the column defaults apply (R5). Its `RETURNING` and `listPedals`' `SELECT` both add
  `brand, description, extras, is_editable, (is_editable AND NOT pedal_is_attached(id)) AS can_edit`.
- `listPedals` keeps `WHERE deleted_at IS NULL ORDER BY created_at DESC` (P1).

## Multipart parsing (`src/pedals/parse-multipart.ts`)

`parseCreatePedalMultipart` maps `brand: toSingleStringOrRawField(body.brand)` and
`description: toSingleStringOrRawField(body.description)` (absent -> `undefined`, one string -> the
string, repeated or file -> `null`). It does not read `extras`, `is_editable` or `isEditable`, so those
parts are ignored (R5-b).

## Error paths

| Condition | Status | Body |
|---|---|---|
| brand absent / blank / repeated / file | 400 | `{ "error": "brand is required" }` |
| brand over 255 characters | 400 | `{ "error": "brand must be at most 255 characters" }` |
| description repeated / file | 400 | `{ "error": "description must be a single text field" }` |
| description over 2000 characters | 400 | `{ "error": "description must be at most 2000 characters" }` |
| `extras` not a JSON object at insert (only reachable by raw SQL) | DB error 23514, not caught | — |

`src/index.ts` already maps every `PedalError` to `{ error }` with its status; no route change.

## Discarded alternatives

1. **Count attachments in TypeScript per pedal** (`listPedals` then one `SELECT COUNT(*)` per row):
   rejected, it is the N+1 the request forbids.
2. **A stored `attached_count`/`is_attached` column maintained on attach and detach**: rejected, it
   denormalizes state that must also follow song soft-deletion (S8); a missed update path would leave a
   pedal wrongly locked or unlocked, and nothing would detect the drift.
3. **A Bun `sql` fragment in TypeScript holding the EXISTS subquery**: rejected in favor of the
   Postgres function; the fragment would depend on a table alias at every call site, and a function
   is callable the same way from a `SELECT`, a `RETURNING` and the follow-up `UPDATE ... WHERE`.
4. **`brand` with `DEFAULT 'Valeton'`** (one statement, no backfill `UPDATE`): rejected, a default
   makes the API's "required" brand optional at the database level and lets a buggy insert silently
   claim Valeton.
5. **Reject `extras`/`is_editable` parts on create with 400**: rejected, the frontend form never sends
   them and the request only says new pedals are always editable with empty extras; ignoring them
   keeps the endpoint tolerant without letting the client override either value.

## Test evidence grouping

- R1 cases a–f: one `migrate.test.ts` test over `information_schema.columns` plus raw inserts.
- R2 cases a–c: one `migrate.test.ts` test using the `0005` pattern (drop `NOT NULL` on `brand`,
  insert a live and a soft-deleted row with `brand NULL`, run `0010`, assert; `finally` re-runs `0010`),
  plus the re-run assertion with a `Boss` row.
- R3 + R4: one `test.each` each in `pedal-service.test.ts` (400 rows also assert no new row and an
  empty storage dir); R3-d and R4-f go through `createPedal` with `brand: null` / `description: null`.
- R5, R6-a/b/c/d: `pedal-service.test.ts` plus one `index.test.ts` end-to-end `POST` then `GET /pedals`.
- R7 cases a–g: one `test.each` in `pedal-service.test.ts` building each state with raw SQL and reading
  `canEdit` from `listPedals()`.
