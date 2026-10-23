# Requirements — update_a_song_pedal_s_parameter_values

## Request (verbatim)
PATCH /songs/:id/pedals/:configId {config} lets the song owner replace the parameter values of an attached pedal at any time (independent of the catalog pedal's lock). config is validated against the catalog pedal's parameter definitions (knob integer within min..max, switch boolean, selector one of options), same rules as POST /songs/:id/pedals.

Acceptance (from the card):
- The song owner can update config of an attached pedal
- Invalid values return 400; non-owners are refused per existing song rules
- Works even when the catalog pedal is locked

### Follow-up decisions by the user during spec review (2026-10-22, translated from Spanish; original words quoted)
- D1: `PATCH` is a merge, not a full replace. Only the keys sent change; the others keep their stored values. Each sent key is validated with the existing rules (`validateConfigAgainstParameters`). Original: "si el tono esta en 5 y el volumen esta en 8, y yo cambio el tono de 5 a 3, entonces solo ese se cambia y el volumen sigue en 8".
- D2: A song pedal config must always hold every parameter defined by its catalog pedal (parameters are pedal-specific, defined by whoever registered the pedal). `POST /songs/:id/pedals` must refuse (400) a config that lacks any defined key. Definitions have no defaults, so nothing is auto-filled; a pedal with zero parameters accepts `{}`. Original: "en la cancion donde la estoy usando debo tener esos mismos parametros (sin quitar uno u otro)".
- D3: A missing or non-object `config` on `PATCH` stays a 400.
- D4: A catalog pedal cannot be deleted while attached to any song; that rule is feature 29 (`delete_pedal_catalog_entry_blocked_when_in_use`), not this feature.

## Assumptions
- S1: No `PATCH /songs/:id/pedals/:configId` route exists today (only `POST`/`GET /songs/:id/pedals` and `DELETE /songs/:id/pedals/:configId`); this feature adds it. Today a `PATCH` on that path answers 404 after auth.
- S2: Merge semantics (D1): the stored `config` becomes the stored object with the sent keys overwritten or added; keys not sent keep their stored values. The merge is shallow (top-level keys only). There is no way to remove a key through this route; a `null` value is just a value (invalid on a typed pedal under R2, stored as `null` on a zero-parameter pedal).
- S3: `config` is required in the body. A missing `config`, or one that is not a JSON object (array, string, number, `null`), is a 400 `config must be a JSON object` (D3).
- S4: **For review.** An empty `{ "config": {} }` on `PATCH` is a valid no-op: 200 with the current config, `updated_at` set to now. It is not a 400, because the body is well formed and the merged result is unchanged; on a row that is incomplete (S11) it is a 400 like any other `PATCH`.
- S5: Only `config` is changed. `label`, `pedal_catalog_id` and any other body field are ignored, not rejected (the request names only `{config}`).
- S6: "Same rules as POST" means feature 22's R5/R6 value rules, applied to the **sent keys only**: every sent key must be a defined parameter and every sent value must match its definition; on a zero-parameter pedal any JSON object is accepted. Error messages are the ones `validateConfigAgainstParameters` already returns. Stored keys that are not sent are not re-validated (see S11).
- S7: Validation uses the catalog pedal's definitions as stored at the time of the request, not at attach time.
- S8: "The catalog pedal's lock" is feature 25's `is_editable = false` and its computed `canEdit = false` (pedal attached to a song); feature 27 adds the admin endpoint that toggles `is_editable`. This feature never reads `is_editable`, `canEdit` or any other lock state, and does not depend on feature 27 (the request says "independent of the catalog pedal's lock").
- S9: Deleting a catalog pedal that is attached to a song is feature 29's concern (D4). This feature does not handle a deleted catalog pedal in any special way and adds no requirement for it.
- S10: "Non-owners are refused per existing song rules" means feature 6 R13's 404 rules for `DELETE /songs/:id/pedals/:configId`, with the same message `song pedal config not found`, and ownership is checked before any config check (feature 22 P2's order). A body that is not valid JSON, or is not a JSON object, is rejected with 400 `invalid JSON body` before ownership, as `PATCH /admin/users/:id/plan` does; that 400 reveals nothing about the resource.
- S11: **For review.** Rows stored before this feature may hold a partial config (allowed until now on `POST`). On `PATCH`, the merged result must be complete: if any defined key is still missing after the merge, the system answers 400 naming the missing keys and changes nothing. The client fixes it by sending the missing keys in the same `PATCH`. Chosen as the safer option: a row never leaves a successful `PATCH` incomplete. The alternative (allow the patch and leave the row partial) was rejected for that reason. Stored keys that are no longer defined, or stored values that no longer match, are left as they are unless the client overwrites them, because the merge cannot remove keys (S2) and re-validating them would leave such a row impossible to update.
- S12: Completeness (D2) is checked after the per-key value checks, so an unknown key or a bad value reports its existing message first. The missing-keys message is `config is missing parameters: "<k1>", "<k2>"`, keys in definition order. On `POST`, an omitted `config` is still treated as `{}` (feature 6 R8), so on a typed pedal it is now a 400 listing every defined key; on a zero-parameter pedal it is still stored as `{}`.
- S13: D2 changes `POST /songs/:id/pedals` for typed pedals only: a client that today attaches a typed pedal with a partial config (or none) gets a 400 after this feature. Existing stored rows are not migrated, and `GET /songs/:id/pedals` keeps returning them as stored (P2).
- S14: A successful `PATCH` answers 200 with the updated `SongPedalConfigDto` (same shape `POST` returns) and sets `updated_at` to the current time.

## R1 — Owner updates an attached pedal's config by merge
WHEN an authenticated owner sends `PATCH /songs/:id/pedals/:configId` with a valid `config` for a live `song_pedal_configs` row of a live song they own, the system SHALL set that row's `config` to the stored object with the sent keys overwritten or added, keep every key not sent at its stored value, set `updated_at` to the current time, and respond 200 with the updated `SongPedalConfigDto`.

Typed pedal definitions used: knob `gain` `min 0, max 10`; switch `boost`; selector `mode` `["A","B"]`.

| Case | Stored config before | Body | Expected |
|---|---|---|---|
| a | `{ "gain": 5, "boost": true, "mode": "A" }` | `{ "config": { "gain": 3 } }` | 200; response and row `config` = `{ "gain": 3, "boost": true, "mode": "A" }` |
| b | same as a | `{ "config": { "gain": 8, "boost": false, "mode": "B" } }` | 200; stored `{ "gain": 8, "boost": false, "mode": "B" }` |
| c | same as a | `{ "config": {} }` | 200; stored config unchanged (S4) |
| d | label `Lead`, pedal P | `{ "config": { "gain": 1 }, "label": "X", "pedal_catalog_id": "<other pedal>" }` | 200; `label` stays `Lead`, `pedalCatalogId` stays P |
| e | row with `updated_at` in the past | any valid body | response `updatedAt` later than before; `createdAt` and `id` unchanged |
| f | (after case a) | `GET /songs/:id/pedals` | lists the row with the merged `config` |
| g | any | any valid body | `song_pedal_configs` row count unchanged |
| h | zero-parameter pedal, stored `{ "a": 1, "b": 2 }` | `{ "config": { "b": 3, "c": null } }` | 200; stored `{ "a": 1, "b": 3, "c": null }` |

## R2 — Sent values must match the pedal's definitions
WHEN the target row's catalog pedal has one or more parameter definitions, the system SHALL accept the `PATCH` only if every sent key is a defined parameter and every sent value matches its definition, and IF any sent entry does not match THEN the system SHALL respond 400 `{ error }` and SHALL NOT change the row.

Stored config before every case: `{ "gain": 5, "boost": true, "mode": "A" }`; definitions as in R1.

| Case | Config sent | Expected |
|---|---|---|
| a | `{ "gain": 0 }`, `{ "gain": 10 }`, `{ "boost": false }`, `{ "mode": "B" }` | 200 |
| b | `{ "gain": -1 }`, `{ "gain": 11 }` | 400 `config value for "gain" does not match its parameter definition` |
| c | `{ "gain": 7.5 }`, `{ "gain": "5" }`, `{ "gain": true }`, `{ "gain": null }` | 400, same message |
| d | `{ "boost": "on" }`, `{ "boost": 1 }`, `{ "boost": null }` | 400 `config value for "boost" does not match its parameter definition` |
| e | `{ "mode": "C" }`, `{ "mode": "a" }`, `{ "mode": 0 }`, `{ "mode": null }` | 400 `config value for "mode" does not match its parameter definition` |
| f | `{ "unknown": 1 }` | 400 `config key "unknown" is not a parameter of this pedal` |
| g | `{ "gain": 3, "unknown": 1 }` | 400; stored config unchanged (not partially applied) |
| h | any 400 case above | row `config` and `updated_at` unchanged |

## R3 — Request body shape
The system SHALL require a JSON object body carrying a `config` that is a JSON object, and WHILE the catalog pedal has an empty `parameters` list SHALL accept any JSON object as `config` with no key or value check.

| Case | Body / pedal | Expected |
|---|---|---|
| a | body is not valid JSON | 400 `invalid JSON body` |
| b | body is valid JSON but not an object (`[]`, `"x"`, `null`, `3`) | 400 `invalid JSON body` |
| c | `{}` (no `config`) | 400 `config must be a JSON object`; row unchanged |
| d | `config` is `[]`, `"text"`, `5` or `null` | 400 `config must be a JSON object`; row unchanged |
| e | zero-parameter pedal, `{ "config": { "anything": "goes", "n": 42 } }` | 200; sent keys merged into the stored config |

## R4 — Only the owner can update, through the right song
IF the song identified by `:id` or the row identified by `:configId` is not a live resource of the requester, or the row does not belong to that song, THEN the system SHALL respond 404 `{ "error": "song pedal config not found" }` and SHALL NOT change any row; without a valid bearer token it SHALL respond 401.

| Case | Situation | Expected |
|---|---|---|
| a | no `Authorization` header | 401 |
| b | `:id` not a UUID / `:configId` not a UUID | 404 |
| c | song does not exist | 404 |
| d | song is soft-deleted | 404 |
| e | song owned by another user (with that user's live config id) | 404; other user's row unchanged |
| f | config id does not exist | 404 |
| g | config row is soft-deleted | 404 |
| h | config row belongs to another song of the same requester | 404; that row unchanged |
| i | case e or h with an invalid config (`{ "gain": 99 }`) | 404 (ownership is checked before the config) |

## R5 — The catalog pedal's lock never blocks the update
WHILE the target row's catalog pedal is locked or otherwise not editable, the system SHALL still apply R1–R3 and R6 exactly as for an editable pedal, and SHALL NOT change the catalog pedal row.

| Case | Catalog pedal state | Expected |
|---|---|---|
| a | `is_editable = false` | 200 with a valid config; 400 with an invalid one (R2 still applies) |
| b | `is_editable = true` but attached to songs of two users (`canEdit = false`) | 200 |
| c | after cases a–b | `pedal_catalog` row (`is_editable`, `parameters`, `updated_at`) unchanged |

## R6 — A song pedal config holds every defined parameter
WHEN a song pedal config is created with `POST /songs/:id/pedals` or updated with `PATCH /songs/:id/pedals/:configId`, IF the resulting config (the sent config on `POST`, the merged config on `PATCH`) lacks any key defined by the catalog pedal THEN the system SHALL respond 400 `{ "error": "config is missing parameters: \"<k1>\", ..." }` listing every missing key in definition order, and SHALL NOT insert or change any row.

Definitions as in R1 unless stated.

| Case | Route / stored before | Config sent | Expected |
|---|---|---|---|
| a | `POST` | `{ "gain": 5, "boost": true, "mode": "A" }` | 201; stored as sent |
| b | `POST` | `{ "gain": 5 }` | 400 `config is missing parameters: "boost", "mode"`; no row inserted |
| c | `POST` | `{}` or `config` omitted | 400 `config is missing parameters: "gain", "boost", "mode"`; no row inserted |
| d | `POST` | `{ "gain": 11 }` | 400 `config value for "gain" does not match its parameter definition` (value check first, S12) |
| e | `POST`, zero-parameter pedal | `{}` or omitted | 201; stored `{}` |
| f | `PATCH`, stored `{ "gain": 5 }` (legacy partial row) | `{ "config": { "gain": 3 } }` | 400 `config is missing parameters: "boost", "mode"`; row unchanged (S11) |
| g | `PATCH`, stored `{ "gain": 5 }` | `{ "config": { "boost": true, "mode": "B" } }` | 200; stored `{ "gain": 5, "boost": true, "mode": "B" }` |
| h | `PATCH`, stored `{}` (legacy) | `{ "config": {} }` | 400 `config is missing parameters: "gain", "boost", "mode"`; row unchanged |

## P1 — Existing song pedal routes keep their other behavior
Apart from R6 on `POST`, `POST`/`GET /songs/:id/pedals` and `DELETE /songs/:id/pedals/:configId` keep their current statuses and messages: song/label/pedal-reference errors, the non-object `config` 400, zero-parameter pedals accepting any JSON object, the omitted-`config` default on zero-parameter pedals, and feature 22 P2's order (ownership and label errors win over a config mismatch). Existing tests in `src/song-pedal-configs/song-pedal-config-service.test.ts` and `src/index.test.ts` keep passing unmodified, except the two typed-pedal `POST` tests that tasks.md T2 rewrites because R6 changes their expected outcome.

## P2 — Stored configs are not re-validated on list
`GET /songs/:id/pedals` keeps returning every stored config as stored, including partial or out-of-range ones (feature 22 P3); the existing test stays unmodified.
