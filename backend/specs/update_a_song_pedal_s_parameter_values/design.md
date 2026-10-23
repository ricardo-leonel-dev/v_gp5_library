# Design — update_a_song_pedal_s_parameter_values

Follows `docs/architecture.md` (service owns business logic and DB queries, `src/index.ts` only wires
the route and maps `SongPedalConfigError`; multi-tenancy enforced in the service from `c.get("userId")`)
and `docs/conventions.md`. No migration, no new dependency.

## Files to touch

| File | Change |
|---|---|
| `src/pedals/pedal-parameters.ts` | new exported `findMissingParameterKeys` |
| `src/pedals/pedal-parameters.test.ts` | unit test for `findMissingParameterKeys` (R6) |
| `src/song-pedal-configs/song-pedal-config-service.ts` | new `updateSongPedalConfig`; extract private config helpers shared with `createSongPedalConfig`; `createSongPedalConfig` gains the completeness check (R6) |
| `src/index.ts` | new `protectedRouter.patch("/songs/:id/pedals/:configId", ...)` next to the existing `DELETE` |
| `src/song-pedal-configs/song-pedal-config-service.test.ts` | service tests for R1–R6; rewrite of two existing typed-pedal `POST` tests (tasks.md T2) |
| `src/index.test.ts` | route tests: 401 (R4 a), invalid JSON body (R3 a–b), one end-to-end 200 + `GET` read-back (R1 a, f), one `POST` 400 for a missing key (R6 b) |

## New signatures

```ts
// src/pedals/pedal-parameters.ts
/** Keys defined in `defs` that are absent from `config`, in definition order. */
export function findMissingParameterKeys(
  config: Record<string, unknown>,
  defs: ParameterDefinition[],
): string[];
```

```ts
// src/song-pedal-configs/song-pedal-config-service.ts
export interface UpdateSongPedalConfigInput {
  config?: unknown;
}

export async function updateSongPedalConfig(
  userId: string,
  songId: string,
  configId: string,
  input: UpdateSongPedalConfigInput,
): Promise<SongPedalConfigDto>;
```

Private helpers (same file, not exported), both throwing `SongPedalConfigError(400)`:

```ts
// Rejects anything that is not a plain object with `config must be a JSON object`.
function requireConfigObject(config: unknown): Record<string, unknown>;

// When defs.length > 0: first validateConfigAgainstParameters(sent, defs) and throw its error;
// then findMissingParameterKeys(result, defs) and, if non-empty, throw
// `config is missing parameters: "k1", "k2"` (keys JSON-quoted, joined with ", ").
// When defs.length === 0: no check.
function assertConfigFitsPedal(
  sent: Record<string, unknown>,
  result: Record<string, unknown>,
  defs: ParameterDefinition[],
): void;
```

`createSongPedalConfig` keeps its `undefined -> {}` default, then calls
`requireConfigObject(config)` and `assertConfigFitsPedal(config, config, pedalParameters)` where it
checks the config today. Ownership, label and pedal-reference checks stay before it (P1). The only
behavior change on `POST` is the missing-keys 400 on a typed pedal (R6 a–e).

## Service flow (`updateSongPedalConfig`)

1. If `songId` or `configId` is not a UUID (`isUuid`), throw `SongPedalConfigError("song pedal config not found", 404)`.
2. One ownership query that also loads the stored config and the pedal definitions:

   ```sql
   SELECT spc.config, pc.parameters
   FROM song_pedal_configs spc
   JOIN songs s          ON s.id = spc.song_id
   JOIN pedal_catalog pc ON pc.id = spc.pedal_catalog_id
   WHERE spc.id = ${configId} AND spc.song_id = ${songId}
     AND spc.user_id = ${userId} AND spc.deleted_at IS NULL
     AND s.user_id = ${userId} AND s.deleted_at IS NULL
   ```

   No row -> 404 `song pedal config not found` (R4 c–h). The query never reads `pc.is_editable`
   (R5, S8). It has no `pc.deleted_at` condition: deleting an attached catalog pedal is feature 29's
   concern (S9), so this feature adds nothing for it.
3. `sent = requireConfigObject(input.config)` (R3 c–d), `stored = parseConfig(row.config)`,
   `merged = { ...stored, ...sent }`, `defs = parseStoredParameters(row.parameters)`, then
   `assertConfigFitsPedal(sent, merged, defs)` (R2, R6 f–h). Only the sent keys get the value check;
   completeness is checked on `merged` (S6, S11). Ownership is resolved in step 2 first, so a foreign
   row with a bad config is 404 (R4 i).
4. Update and return, merging in SQL:

   ```sql
   UPDATE song_pedal_configs
   SET config = config || ${JSON.stringify(sent)}::jsonb, updated_at = NOW()
   WHERE id = ${configId} AND song_id = ${songId} AND user_id = ${userId} AND deleted_at IS NULL
   RETURNING id, song_id, pedal_catalog_id, label, config, created_at, updated_at
   ```

   jsonb `||` on two objects is the shallow top-level merge of S2, done atomically, so two
   concurrent `PATCH`es on different keys both land. The step-3 completeness check still holds for
   the written row: the merge only adds or overwrites keys, never removes them. `{}` leaves `config`
   as is and only moves `updated_at` (S4, R1 c). Zero rows (row soft-deleted between steps 2 and 4)
   -> 404 `song pedal config not found`. Map with the existing `toSongPedalConfigDto`.

The update touches only `config` and `updated_at`, so `label`/`pedal_catalog_id` in the body are
never read (R1 d, S5).

## Route (`src/index.ts`)

```ts
protectedRouter.patch("/songs/:id/pedals/:configId", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  try {
    const dto = await updateSongPedalConfig(c.get("userId"), c.req.param("id"), c.req.param("configId"),
      { config: (body as { config?: unknown }).config });
    return c.json(dto, 200);
  } catch (err) {
    if (err instanceof SongPedalConfigError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
```

The body-shape guard copies `PATCH /admin/users/:id/plan`. It runs before ownership (S10); it needs no
DB access and its 400 does not reveal whether the song or config exists. Registering the route makes
the unknown-route guard (`app.routes`) see `PATCH` on this path automatically; no guard change.
Auth comes from `protectedRouter` (R4 a). The `POST` route is unchanged; R6 lives in the service.

## Error paths

| Condition | Where | Status / message |
|---|---|---|
| `PATCH` body not JSON / not an object | route | 400 `invalid JSON body` |
| malformed `:id`/`:configId`, ownership query empty, update returns 0 rows | service | 404 `song pedal config not found` |
| `config` missing (`PATCH` only) or not an object | `requireConfigObject` | 400 `config must be a JSON object` |
| sent key unknown / sent value mismatched on a typed pedal | `assertConfigFitsPedal` (`validateConfigAgainstParameters`) | 400, its existing message |
| resulting config lacks a defined key | `assertConfigFitsPedal` (`findMissingParameterKeys`) | 400 `config is missing parameters: "k1", ...` |
| anything else | propagates (architecture.md "Error handling") | 500 via Hono default |

## Impact on existing tests and on feature 22's spec

Feature 22 R5 said keys may be omitted on `POST`; R6 here replaces that for typed pedals (D2). Two
existing tests in `song-pedal-config-service.test.ts`, block `config vs typed pedal definitions (R5)`,
assert the old behavior and must be rewritten (tasks.md T2):

- `"a, d, f, i: in-range values pass and are stored as sent"` sends `{ gain: 5 }`, `{ boost: true }`,
  `{ mode: "A" }`, `{}` to a three-parameter pedal; all now 400. Rewrite: complete configs pass;
  the partial ones move to the R6 test.
- `"i: config omitted on a typed pedal -> created, stored {}"` now expects 400 listing all three keys.

Verified unaffected: the `"b, c, e, g, h, j"` invalid-value test (value checks run first, still a
`SongPedalConfigError`), the P2 order tests, the zero-parameter R6/R8 tests, and the
`index.test.ts` typed `POST` test (`{ level: 11 }`, `{ level: 5.5 }` stay 400 on value; the success
case already sends both keys). `pedal-service.test.ts` inserts `song_pedal_configs` rows by SQL, not
through the service. `specs/typed_parameter_definitions_for_pedal_catalog/` is a done feature's
record and is not edited.

## Testing notes

- R1 e: seed the row through `directInsertConfig`, then `UPDATE song_pedal_configs SET updated_at = NOW() - INTERVAL '1 hour'` before patching, so "later than before" is deterministic.
- `directInsertConfig` inserts the column default `{}`; tests that need a complete stored config set it
  with `UPDATE song_pedal_configs SET config = '<json>'::jsonb` (or add an optional `config` argument to
  the helper). Legacy partial rows (R6 f–h) are seeded the same way.
- R2/R3/R6 400 cases: snapshot `config` and `updated_at` of the row before the call and compare after.
- R5: seed the catalog pedal with `is_editable = false` / attach it to a second user's song, snapshot its `pedal_catalog` row, and compare after the patch.
- Table-driven loops in the existing style of the F22 tests (one `test` per rule, an array of cases).

## Discarded alternatives

- **Full replace (the previous draft's S2).** Rejected by the user (D1): changing one knob must not
  require resending, or risk losing, the others.
- **Merge computed in TypeScript and written as a whole object (`SET config = ${merged}`).** Rejected:
  two concurrent `PATCH`es on different keys would lose one write; jsonb `||` merges atomically in the
  `UPDATE` with the same result.
- **Value-checking the whole merged config instead of only the sent keys.** Rejected: a legacy row with
  a stale key or an out-of-range stored value could never be updated, because the merge cannot remove
  keys (S11).
- **Allowing a `PATCH` that leaves a legacy row incomplete.** Rejected as the less safe option (S11):
  every successful write would otherwise not guarantee D2.
- **Auto-filling missing keys on `POST`.** Rejected: catalog definitions carry no defaults (D2).
- **RFC 7396 `null`-deletes-key semantics.** Rejected: removing keys contradicts D2, and `null` already
  has a meaning under R2 (an invalid value).
- **`PUT` instead of `PATCH`.** Rejected: the request names `PATCH`, and merge is `PATCH` semantics.
- **Reading `is_editable`/`canEdit` and explicitly ignoring them.** Rejected: the cleanest guarantee
  of S8 is that the query never selects those columns, so a later lock feature cannot leak into this
  route by accident.
- **Separate song check then config check (as `deleteSongPedalConfig` does).** Rejected: one joined
  query gives the same 404 set and loads the stored config and definitions in the same round trip.
