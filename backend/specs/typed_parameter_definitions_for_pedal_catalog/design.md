# Design — typed_parameter_definitions_for_pedal_catalog

Layering, error handling and naming follow `docs/architecture.md` (principles 1–3) and
`docs/conventions.md`. This document only covers choices made inside those boundaries.

## Data shape

```ts
export type ParameterDefinition =
  | { key: string; label: string; type: "knob"; min: number; max: number }
  | { key: string; label: string; type: "switch" }
  | { key: string; label: string; type: "selector"; options: string[] };
```

Flat discriminated union, the same JSON shape on the wire (multipart field, `PedalDto`) and in the
`pedal_catalog.parameters` JSONB column. `key` and `label` are stored trimmed; `options` entries are
stored trimmed. Order is the order the client sent (the frontend renders controls in that order).
On input a knob's `min`/`max` are optional (defaults `0`/`10`); the normalized, stored and returned
definition always has both, so the frontend never re-applies defaults. A knob value is an integer
position; there is no `step` (removed by human decision).

Wire example for `POST /pedals` (multipart text part `parameters`):

```json
[
  { "key": "level", "label": "Level", "type": "knob" },
  { "key": "gain", "label": "Gain", "type": "knob", "min": -12, "max": 12 },
  { "key": "boost", "label": "Boost", "type": "switch" },
  { "key": "mode", "label": "Mode", "type": "selector", "options": ["Normal", "Brown"] }
]
```

Stored/returned `level` definition: `{ "key": "level", "label": "Level", "type": "knob", "min": 0,
"max": 10 }`. Matching `config` for `POST /songs/:id/pedals`:
`{ "level": 5, "boost": true, "mode": "Brown" }` (`"gain": -3` would also be valid; `"level": 5.5`
is rejected).

## Files to touch

### New: `src/db/migrations/0008_pedal_parameters.sql` (R4)

```sql
-- 0008_pedal_parameters.sql — typed parameter definitions per catalog pedal.
-- Existing rows read '[]' (legacy pedal: free-form config). Re-runnable.
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb;
```

`ADD COLUMN ... DEFAULT` fills every existing row, so no separate `UPDATE` backfill is needed.
`song_pedal_configs` is not touched (P3). No `CHECK` on the JSON shape: validation lives in one
TypeScript function (below); a SQL `jsonb` shape check would duplicate it and could drift.

### New: `src/pedals/pedal-parameters.ts` (R1, R2, R5)

Pure functions, no DB, no Hono. Both validators return a result instead of throwing, so each caller
throws its own domain error (`PedalError` / `SongPedalConfigError`) and the module has no dependency
on either service.

```ts
export type ParameterDefinition = /* union above */;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

// raw is the already-JSON.parse'd value. Returns normalized definitions (trimmed strings, unknown
// fields dropped) or the first problem found.
export function parseParameterDefinitions(raw: unknown): ParseResult<ParameterDefinition[]>;

// config is a plain object (feature 6 already rejected non-objects). defs is non-empty.
// Returns ok with the config unchanged, or the first mismatching key.
export function validateConfigAgainstParameters(
  config: Record<string, unknown>,
  defs: ParameterDefinition[],
): ParseResult<Record<string, unknown>>;
```

Rules, in check order (each maps to an R2 case row; first failure wins):
1. `Array.isArray(raw)` (b).
2. For each element `i`: plain object (d); `key` non-blank string (e); `label` non-blank string (g);
   `type` in the three literals (h); per type: knob `min`/`max`, when present, pass
   `Number.isInteger` (i), then default to `0`/`10` and require `min < max` (j); selector `options`
   non-empty array (k) of non-blank, unique (after trim) strings (l).
3. Keys unique after trim (f).

Config rules (R5): every key of `config` must equal some `def.key` (h); then by type — knob value
`Number.isInteger(v)` (rejects strings, booleans, `null`, decimals) and `min <= v <= max` (a–c); switch value `typeof === "boolean"` (d, e);
selector value is a string that is `===` one of `options` (case-sensitive) (f, g).

Error messages (English, `{ error }` body; the frontend maps on status, not text):
- definitions: `parameters must be a JSON array`, `parameters[<i>].<field> is invalid`,
  `parameters has duplicate key "<key>"`.
- config: `config key "<key>" is not a parameter of this pedal`,
  `config value for "<key>" does not match its parameter definition`.

Tests assert status and side effects (no row, no stored bytes); message text is asserted only in
`pedal-parameters.test.ts`, where it helps pinpoint which rule fired.

### `src/pedals/parse-multipart.ts` (R1, R2-a/c)

`CreatePedalInput` gains `parameters?: string | null`:
- `undefined` — the part is absent (R1-c).
- `string` — exactly one text part; JSON parsing happens in the service.
- `null` — present but not exactly one text part (repeated, or a `File`) → service throws 400 (R2-c).

`parseCreatePedalMultipart` maps `body.parameters` with a small helper next to `toStringField`. This
file stays the only one that sees Hono/`File` types (feature 5 design).

### `src/pedals/pedal-service.ts` (R1, R2, R3)

- `PedalDto` gains `parameters: ParameterDefinition[]`; `toPedalDto` reads the `parameters` column,
  accepting either a parsed array or a JSON string (same defensive read as feature 6's `parseConfig`),
  falling back to `[]`.
- `createPedal`, after the existing name/image checks and **before** `storage.put` (R2: no stored
  bytes on failure, same ordering principle as feature 5's design):
  1. `input.parameters === null` → `PedalError("parameters must be a single JSON field", 400)`.
  2. `undefined` → `[]`; otherwise `JSON.parse` in a `try` (failure → 400), then
     `parseParameterDefinitions` (`ok: false` → 400 with its message).
  3. `INSERT ... (id, name, reference_image_key, created_by, parameters) VALUES (..., ${JSON.stringify(defs)}::jsonb)`
     and add `parameters` to `RETURNING`.
- `listPedals` adds `parameters` to its `SELECT` list. Nothing else changes (P1).

### `src/song-pedal-configs/song-pedal-config-service.ts` (R5, R6, P2)

- The existing pedal lookup becomes `SELECT id, parameters FROM pedal_catalog WHERE ...` (no extra
  query).
- After the existing `config` object check (feature 6 R6–R8, unchanged and still first), if the
  pedal's parameters list is non-empty, call `validateConfigAgainstParameters`; `ok: false` →
  `SongPedalConfigError(error, 400)`. Empty list → skip (R6).
- The order song 404 → label 400 → pedal 400 → config-shape 400 → config-vs-definitions 400 keeps
  P2's precedence without reordering existing code.
- `listSongPedalConfigs` is untouched (P3).

### `src/index.ts`

No change: `POST /pedals` already forwards `parseCreatePedalMultipart`'s result and maps
`PedalError`; `POST /songs/:id/pedals` already forwards `config` and maps `SongPedalConfigError`.

## Test files

| File | Covers |
|---|---|
| `src/pedals/pedal-parameters.test.ts` (new) | R1 b, e–h normalization, R2 b, d–l (`test.each`, pure, no DB), R5 a–h, j at the function level |
| `src/pedals/pedal-service.test.ts` | R1 a, c–f, R2 (no row + empty storage dir for a representative row), R3 c, P1 |
| `src/song-pedal-configs/song-pedal-config-service.test.ts` | R5 (no row on 400), R6 a–b, P2, P3 |
| `src/index.test.ts` | R1-a / R3 a–b end to end via multipart `FormData`, R2-c (duplicated part), R5 one 400 + one 201 over HTTP |
| `src/db/migrate.test.ts` | R4 a–c |

Grouped evidence: R3 a and b share the end-to-end test that creates the pedal and then lists it.

## Discarded alternatives

1. **Separate `pedal_parameters` table (one row per definition).** Rejected: definitions are always
   read and written as a whole list with the pedal, never queried individually, and there is no edit
   route. A table adds a join to `listPedals`, a transaction to `createPedal`, and a `sort_order`
   column, for no query the product needs. JSONB matches how `song_pedal_configs.config` is already
   stored.
2. **Reject any non-empty config for legacy pedals (strict everywhere).** Rejected: the frontend
   `pedal_catalog_attach` flow (pending) builds free-form key/value config rows, and every pedal in the
   catalog today is legacy. Strict mode would make every existing pedal un-attachable with config until
   someone recreates it. R6 keeps feature 6's behavior for them; there is no path to add definitions to
   an existing pedal, so this is the only back-compat option short of deleting the catalog.
3. **Knob `step` with fractional values (the first draft).** Removed by human decision: a knob value
   is the integer position of the control between `min` and `max`. Integer-only bounds and values also
   avoid IEEE 754 false rejections (`0.3` is not `3 * 0.1`) that a step-alignment check would cause.
   A client sending `step` has it dropped, like any unknown field (R1-h).
4. **Require every definition key in the config (complete config).** Rejected: feature 6 allows `{}`
   and an omitted `config`; requiring all keys would break that contract and force the frontend to
   send values for parameters the user never touched.
5. **A validation library (zod/valibot) for the definitions.** Rejected per `docs/architecture.md`
   principle 2 (no validation library without discussion); the rules fit in one ~100-line module.
6. **Send `parameters` as repeated multipart fields (`parameters[0][key]=...`).** Rejected: Hono's
   `parseBody` does not build nested objects, so the service would re-implement bracket parsing. A
   single JSON text part is what the frontend can produce with `JSON.stringify` and one
   `FormData.append`.

## Estimated size

~15 lines migration, ~110 `pedal-parameters.ts`, ~30 `pedal-service.ts`, ~10 `parse-multipart.ts`,
~10 `song-pedal-config-service.ts`: about 175 production lines (budget 400).
