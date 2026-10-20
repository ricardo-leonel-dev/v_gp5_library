# Requirements — F36 `pedal_catalog_attach`

Browse the shared pedal catalog from a song's detail page (`/songs/:id`), attach a catalog pedal to the song
with a label, and detach it again. Source: `progress/split_pedal_bank_selector_ui.md` "Part 1", with the human's
decisions of 2026-10-19:

- Config is out of scope: attach sends `config: {}`; typed parameters arrive with F38 `pedal_catalog_create`.
- Detach is in scope (`DELETE /songs/:id/pedals/:configId`) and only removes the song association.
- The UI is one inline `SongPedalsSection` mounted in `/songs/:id`, not a separate page.
- Editing an attached pedal's label is out of scope (no `PATCH` route exists).

Backend contract (verified in `../backend/src/index.ts:214-250`,
`../backend/src/song-pedal-configs/song-pedal-config-service.ts`, `../backend/src/pedals/pedal-service.ts`):

| Call | Success | Errors (`{ error: <message> }`) |
|---|---|---|
| `GET /pedals` | 200 `PedalDto[]` (`id, name, createdBy, createdAt, updatedAt`), newest first | 401 |
| `GET /songs/:id/pedals` | 200 `SongPedalConfigDto[]` (`id, songId, pedalCatalogId, label, config, createdAt, updatedAt`), newest first | 401, 404 `song not found` |
| `POST /songs/:id/pedals` body `{ pedal_catalog_id, label, config }` | 201 `SongPedalConfigDto` | 400 `label is required`, 400 `pedal_catalog_id does not reference an existing pedal`, 400 `config must be a JSON object`, 401, 404 `song not found` |
| `DELETE /songs/:id/pedals/:configId` | 204, soft-deletes only the `song_pedal_configs` row | 401, 404 `song pedal config not found` |

"Status 0" below means the request never reached the server (`HttpErrorResponse.status === 0`).

## R1 — Attached pedals list

WHEN the section is created for a song, the system SHALL request `GET /songs/<songId>/pedals` once and render
one row per returned entry, in response order, showing the entry's `label` and the name of the catalog pedal
whose `id` equals its `pedalCatalogId`.

| Case | Condition | Expected |
|---|---|---|
| a | 2 entries returned | 2 rows (`song-pedal-row`), same order as the response |
| b | entry's `pedalCatalogId` is in the loaded catalog | row shows the label and that pedal's `name` |
| c | catalog loaded, `pedalCatalogId` not in it (pedal soft-deleted) | row shows the label and `songPedals.pedal_unavailable` |
| d | catalog still loading or failed | row shows the label and no pedal name text |

## R2 — Attached list states

WHILE the attached list is not loaded, the system SHALL show its state inside the section only, and SHALL keep
the rest of the detail page rendered and usable.

| Case | Condition | Expected |
|---|---|---|
| a | request pending | `song-pedals-loading` shown with `aria-busy="true"`, no rows |
| b | 200 with `[]` | `song-pedals-empty` with `songPedals.empty` |
| c | status 0 | `song-pedals-error` with `songPedals.errors.unreachable` and a retry button |
| d | 404 | `song-pedals-error` with `songPedals.errors.song_not_found` and a retry button |
| e | 500 or any other failure | `song-pedals-error` with `songPedals.errors.load_failed` and a retry button |
| f | 401 | `songPedals.errors.session_expired` with a link to `/login`, no retry button |
| g | retry clicked after c, d or e | a new `GET /songs/<songId>/pedals`; loading shown again |
| h | any of c-f | the detail page's presets, files and extra-details sections are still rendered; the page never enters its own `error` state |

## R3 — Catalog selector

WHEN the user opens the attach panel with the "Attach pedal" button, the system SHALL show every pedal of the
loaded catalog as a selectable option, in response order, with no filtering on `createdBy` or any other field.

| Case | Condition | Expected |
|---|---|---|
| a | section created | exactly one `GET /pedals` sent (shared by R1 name lookup and the selector) |
| b | panel opened, catalog of 3 pedals with 3 different `createdBy` values (one `null`) | 3 options (`catalog-option`), response order, each showing `name` |
| c | option clicked | that option is the only one selected (`aria-checked`/`checked`) |
| d | panel's Cancel clicked | panel closes, selection and label reset, no request sent |
| e | panel closed | "Attach pedal" button has `aria-expanded="false"`; open → `"true"` |

## R4 — Catalog states

WHILE the catalog is not loaded, the system SHALL show its state inside the attach panel and SHALL keep Attach
disabled.

| Case | Condition | Expected |
|---|---|---|
| a | request pending | `catalog-loading` shown, Attach disabled |
| b | 200 with `[]` | `catalog-empty` with `songPedals.catalog_empty`, Attach disabled, label input disabled |
| c | status 0 | `catalog-error` with `songPedals.errors.unreachable` and a retry button |
| d | 401 | `catalog-error` with `songPedals.errors.session_expired` and a `/login` link, no retry |
| e | any other failure | `catalog-error` with `songPedals.errors.catalog_failed` and a retry button |
| f | retry clicked after c or e | a new `GET /pedals`; loading shown again |

## R5 — Valid attach draft

WHEN the selected pedal or the label changes, the system SHALL validate the draft and, while it is invalid,
SHALL keep Attach disabled. Length is counted in Unicode code points of the trimmed label (Postgres
`VARCHAR(255)` counts characters, not UTF-16 units).

| Case | Input | Expected |
|---|---|---|
| a | no pedal selected, label `Lead` | invalid `pedal_required`; hint `songPedals.pedal_hint` shown; no field error |
| b | pedal selected, label `''` | invalid `label_required` |
| c | pedal selected, label `'   '` | invalid `label_required` |
| d | pedal selected, label of 256 code points after trim | invalid `label_too_long` |
| e | pedal selected, label of 255 `😀` (510 UTF-16 units) | valid |
| f | pedal selected, `'  Lead boost  '` | valid, trimmed label `Lead boost` |
| g | b or c after the field was edited and blurred | `songPedals.errors.label_required` under the field, input `aria-invalid="true"` |
| h | d | `songPedals.errors.label_too_long` under the field as soon as it applies |
| i | any invalid case | Attach disabled |

## R6 — Attach write

WHEN the user clicks Attach on a valid draft, the system SHALL send exactly one
`POST /songs/<songId>/pedals` with body `{ "pedal_catalog_id": <selected id>, "label": <trimmed label>,
"config": {} }` and, on 201, SHALL insert the returned entry as the first row of the attached list.

| Case | Condition | Expected |
|---|---|---|
| a | Attach clicked | one POST with exactly the three body keys above; `config` is an empty object |
| b | request pending | Attach shows `songPedals.attaching` and is disabled; a second click sends nothing |
| c | 201 | returned entry is row 1, name resolved per R1; panel closes; draft reset; `songPedals.attached` announced in a `role="status"` region |
| d | list was in the empty state (R2 b) before the 201 | empty state replaced by the single new row |
| e | 201 | no `GET /songs/<songId>/pedals` re-fetch is sent |

## R7 — Attach errors

IF the attach request fails THEN the system SHALL keep the panel open with the draft intact (except case b),
re-enable Attach, and show the mapped message.

| Case | Response | Expected |
|---|---|---|
| a | 400 `label is required` | `songPedals.errors.label_required` under the label field |
| b | 400 `pedal_catalog_id does not reference an existing pedal` | `songPedals.errors.pedal_gone` in the panel alert; selection cleared; one new `GET /pedals` |
| c | 404 | `songPedals.errors.song_not_found` in the panel alert |
| d | 401 | `songPedals.errors.session_expired` with a `/login` link in the panel alert |
| e | status 0 | `songPedals.errors.unreachable` in the panel alert |
| f | 500, other 400 messages, non-HTTP error | `songPedals.errors.attach_failed` in the panel alert |
| g | editing the label or selection after any error | the panel alert clears |

## R8 — Detach confirmation

WHEN the user clicks a row's Detach button, the system SHALL ask for confirmation inside that row before
sending anything.

| Case | Condition | Expected |
|---|---|---|
| a | Detach clicked | row shows `songPedals.detach_confirm` (with the row's label) plus Confirm and Keep buttons; focus moves to Keep; no request sent |
| b | Keep clicked | confirmation closes, no request sent, focus returns to that row's Detach button |
| c | Escape pressed while confirming | same as b |
| d | Detach clicked on a second row while one is confirming | only the second row shows the confirmation |

## R9 — Detach write

WHEN the user confirms a detach, the system SHALL send exactly one
`DELETE /songs/<songId>/pedals/<entry id>` and, on 204, SHALL remove that row from the list.

| Case | Condition | Expected |
|---|---|---|
| a | Confirm clicked | one DELETE to that URL; no other request |
| b | request pending | Confirm and Keep disabled; Confirm shows `songPedals.detaching` |
| c | 204 | row removed; `songPedals.detached` announced in the `role="status"` region; other rows unchanged |
| d | 204 on the last row | empty state (R2 b) shown |
| e | 204 | no re-fetch of `GET /songs/<songId>/pedals` or `GET /pedals` |

## R10 — Detach errors

IF the detach request fails THEN the system SHALL show the mapped message in the section's alert and close the
confirmation.

| Case | Response | Expected |
|---|---|---|
| a | 404 | row removed (it no longer exists for this song); `songPedals.errors.already_detached` |
| b | 401 | row kept; `songPedals.errors.session_expired` with a `/login` link |
| c | status 0 | row kept; `songPedals.errors.unreachable` |
| d | 500 or any other failure | row kept; `songPedals.errors.detach_failed` |
| e | a later detach or attach succeeds | the alert clears |

## R11 — Catalog stays read-only

The system SHALL send only the four requests of the contract table above; it SHALL NOT send any `POST`,
`PATCH`, `PUT` or `DELETE` to a `/pedals` URL, nor any `PATCH`/`PUT` to `/songs/:id/pedals/...`.

| Case | Flow | Expected |
|---|---|---|
| a | load, attach (201), detach (204) | `HttpTestingController.verify()` passes with only the matched GET/GET/POST/DELETE requests |
| b | the `PedalCatalogApi` service | exposes exactly `listPedals`, `listSongPedals`, `attachPedal`, `detachPedal` |

## R12 — Placement on the song page

WHILE the song detail page is in its `loaded` state, the system SHALL render exactly one `SongPedalsSection`
for the loaded song's id, after the files/extra-details grid.

| Case | Page state | Expected |
|---|---|---|
| a | `loaded` | one `song-pedals-section`; its pedals request uses the page's song id |
| b | `loading`, `not_found`, `error`, `session_expired` | no `song-pedals-section`, no `GET /pedals`, no `GET /songs/:id/pedals` |
| c | `loaded` | section comes after `song-detail-extras-grid` in document order |

## R13 — Translations

The system SHALL take every user-visible string of the section from the `songPedals` namespace, with an identical
set of leaf keys in `public/i18n/es.json` and `public/i18n/en.json`, each a non-empty string.

| Case | Check | Expected |
|---|---|---|
| a | leaf paths under `songPedals` | `es` equals `en` |
| b | every leaf | non-empty string in both |
| c | every key listed in design.md "UI copy" | present |

## P1 — Existing detail sections unchanged

The presets list, the preset draft area, the user-files section and the extra-details section of `/songs/:id`
keep their current behavior: the existing `song-detail-page.spec.ts` suite passes unchanged, apart from adding
the two pedal requests to its `HttpTestingController` expectations where a test calls `verify()`.
