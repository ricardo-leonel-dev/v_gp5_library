# Requirements — typed_parameter_definitions_for_pedal_catalog

Scope note: requested by the frontend sibling project (`pedal_catalog_create`: "a list of typed
parameter definitions (knob with min/max range, on/off switch, selector with fixed options)";
`pedal_catalog_attach`: attach a catalog pedal to a song with a private `config`). This feature
extends `pedal_catalog_api` (feature 5) and `song_pedal_configs_api` (feature 6), both `done`. It adds
one migration (a `parameters` column on `pedal_catalog`) and changes no route path or status code
that already exists.

Scope note on legacy data: every `pedal_catalog` row created before this feature has no parameter
definitions. They are backfilled to an empty list (R4). A pedal with an empty list is a **legacy
pedal**: attaching it keeps feature 6's free-form `config` behavior (R6), so no existing client flow
breaks. Existing `song_pedal_configs` rows are never re-validated.

Out of scope: editing a pedal's definitions after creation (no `PATCH /pedals/:id` exists), default
config values per parameter, a knob `step` (removed by human decision: a knob value is an integer
position), and the reference-image route the frontend proposed separately.

Terms used below:
- **definition**: one element of a pedal's `parameters` list —
  `{ key, label, type: "knob", min?, max? }`, `{ key, label, type: "switch" }`, or
  `{ key, label, type: "selector", options }`. Knob `min`/`max` default to `0`/`10`; a stored or
  returned knob always has both filled in.
- **typed pedal**: a pedal whose `parameters` list has at least one definition.

## R1 — Parameter definitions are stored on create
WHEN an authenticated `POST /pedals` multipart request passes feature 5's existing name/image
checks and carries a valid `parameters` field, the system SHALL store the definitions on the created
`pedal_catalog` row, in the order given, keeping only the fields listed for each type and filling a
knob's missing `min`/`max` with `0`/`10`.

| Case | `parameters` field | Stored `parameters` |
|---|---|---|
| a | JSON array with one knob, one switch, one selector | the same 3 definitions, same order |
| b | a definition carrying an extra field (e.g. `"color": "red"`) | the definition without the extra field |
| c | omitted | `[]` |
| d | `"[]"` | `[]` |
| e | knob `{ key: "level", label: "Level", type: "knob" }` | knob with `min: 0, max: 10` |
| f | knob with `min: -12, max: 12` | `min: -12, max: 12` unchanged |
| g | knob with only `min: 2` / only `max: 20` | `min: 2, max: 10` / `min: 0, max: 20` |
| h | knob carrying a `step` field | definition without `step` (same as case b) |

## R2 — Malformed parameter definitions are rejected
IF a `POST /pedals` request's `parameters` field is malformed THEN the system SHALL respond with
HTTP 400 `{ error }`, SHALL NOT create any `pedal_catalog` row, and SHALL NOT write the image to
storage.

| Case | Input | Expected |
|---|---|---|
| a | not valid JSON | 400 |
| b | valid JSON but not an array (object, string, number, `null`) | 400 |
| c | sent twice (two multipart parts named `parameters`), or sent as a file | 400 |
| d | an element is not an object | 400 |
| e | `key` missing, not a string, or blank after trim | 400 |
| f | two definitions with the same `key` (exact match after trim) | 400 |
| g | `label` missing, not a string, or blank after trim | 400 |
| h | `type` missing or not one of `knob`, `switch`, `selector` | 400 |
| i | knob: `min` or `max` present but not an integer (`1.5`, `"3"`, `null`, `NaN`) | 400 |
| j | knob: `min >= max` after defaults (e.g. `min: 10` alone, `min: 5, max: 5`, `max: -1` alone) | 400 |
| k | selector: `options` missing, not an array, or empty | 400 |
| l | selector: an option is not a string, is blank after trim, or repeats another option | 400 |

## R3 — Pedal responses expose parameters
The system SHALL include a `parameters` array in every `PedalDto` returned by `POST /pedals` (201)
and `GET /pedals` (200), equal to the definitions stored for that pedal (`[]` for a legacy pedal).

| Case | Pedal | `parameters` in response |
|---|---|---|
| a | created with case R1-a, read via the `POST /pedals` 201 body | the 3 definitions, same order |
| b | the same pedal read via `GET /pedals` | identical to case a |
| c | a legacy pedal (row with `parameters = '[]'`) via `GET /pedals` | `[]` |

## R4 — Existing pedals are backfilled
WHEN migration `0008_pedal_parameters.sql` runs, the system SHALL add a `pedal_catalog.parameters`
`JSONB NOT NULL DEFAULT '[]'` column, so every pre-existing row reads `[]`, and re-running the file
on an already-migrated database SHALL NOT fail.

| Case | Situation | Expected |
|---|---|---|
| a | column after migrate | `jsonb`, `NOT NULL`, default `'[]'::jsonb` |
| b | row inserted without `parameters` | reads `[]` |
| c | 0008 SQL executed a second time | no error, column unchanged |

## R5 — Config must match the pedal's definitions
WHEN `POST /songs/:id/pedals` targets a typed pedal, the system SHALL accept the `config` object only
if every entry matches a definition of that pedal, and IF any entry does not match THEN the system
SHALL respond with HTTP 400 `{ error }` and SHALL NOT create any `song_pedal_configs` row. Keys may
be omitted (a partial config, including `{}` or no `config` field, is valid).

| Case | Definition | Config entry | Expected |
|---|---|---|---|
| a | knob `min 0, max 10` | `"gain": 0`, `"gain": 5`, `"gain": 10` | 201, stored as sent |
| b | knob `min 0, max 10` | `"gain": -1` or `"gain": 11` | 400 |
| c | knob | `"gain": 7.5` (not an integer), `"5"`, `true`, `null` | 400 |
| d | switch | `"boost": true` / `"boost": false` | 201 |
| e | switch | `"boost": "on"`, `1`, `null` | 400 |
| f | selector `["A","B"]` | `"mode": "A"` | 201 |
| g | selector `["A","B"]` | `"mode": "C"`, `"a"`, `0`, `null` | 400 |
| h | (none) | `"unknown": 1` (key not defined on the pedal) | 400 |
| i | any | config `{}` or `config` omitted | 201, stored `{}` |
| j | any | one valid entry plus one invalid entry | 400, nothing stored |

## R6 — Legacy pedals keep free-form config
WHILE the target pedal of `POST /songs/:id/pedals` has an empty `parameters` list, the system SHALL
apply only feature 6's existing `config` rules (JSON object stored as-is, omitted stored `{}`,
non-object rejected with 400), with no key or value check.

| Case | Config | Expected |
|---|---|---|
| a | `{ "anything": "goes", "n": 42 }` | 201, stored as sent |
| b | `"text"` (not an object) | 400 (feature 6 R7, unchanged) |

## P1 — Feature 5 create/list rules are unchanged
`POST /pedals` still returns 400 for a missing/blank `name` or not exactly one `image`, still returns
201 without `reference_image_key`, and `GET /pedals` still lists every live pedal of every user
(existing tests in `src/pedals/pedal-service.test.ts` and `src/index.test.ts` keep passing; the one
response-shape test is extended for `parameters`, never weakened).

## P2 — Feature 6 ownership and error order are unchanged
For a typed pedal, `POST /songs/:id/pedals` still answers 404 for a malformed, missing, soft-deleted
or foreign song, and 400 for a missing label or unknown `pedal_catalog_id`, **before** any config
check: a request that fails both an ownership check and a config check gets the ownership status.

## P3 — Stored configs are never re-validated
`GET /songs/:id/pedals` returns existing `song_pedal_configs` rows exactly as stored, even when the
row's `config` would fail R5 against its pedal's current definitions.
