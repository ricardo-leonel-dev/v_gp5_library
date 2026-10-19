# Requirements — F31 `song_preset_draft_save`

Save the F27 draft (a duplicated and edited copy of a song preset) into the song, and gate saving on the plan's
presets-per-song limit. Split from F27 `song_preset_duplicate_edit_export` on 2026-10-16 (human decision) because
it needs a backend endpoint that F27 does not. Each requirement notes the F27 id it came from; the text is
unchanged except where noted ("Revision 1" below).

Terms (draft, patched body, song names) are as defined in `specs/song_preset_duplicate_edit_export/requirements.md`.

**Revision 1 (2026-10-18, spec review before claim).** Reconciled against the shipped F27/F32/F33 code and the
shipped backend endpoint (backend feature 21). Rule names added to every heading (docs/specs.md format); R1 and R4
gained case tables; R4 gained case b (reload failure); R7 gained the non-HTTP-error case; P1 added; D2 updated
(dependency satisfied). Ids R1–R11 are unchanged so the F27 cross-references stay valid.

**Revision 2 (2026-10-18, human decision on R4 b).** R4 b no longer appends the 201 preset locally: the previous
list stays untouched and a non-blocking warning with a retry action is shown beside the saved confirmation (R4
c/d added for the retry). R11 names the two new keys.

# Dependencies

- **D1 (local).** F27 `song_preset_duplicate_edit_export` must be `done` — satisfied (`done`). This feature adds a
  Save action and a limit gate to F27's draft panel.
- **D2 (backend) — satisfied.** `POST /songs/:id/presets` shipped as backend feature 21
  `add_replace_and_delete_a_preset_in_an_existing_song` (`done`, spec approved;
  `/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend/specs/add_replace_and_delete_a_preset_in_an_existing_song/`,
  route in `src/index.ts`). No block is needed. The shipped contract matches F27 design §5 for every field and
  status this feature reads; `design.md` "Backend contract (as shipped)" lists the exact contract and the two
  precedence rules §5 did not state. R3/R4 can be checked end to end (T6).

# Assumptions

- **A1 (save position)** — former F27 A7. A saved draft is appended at the end of the song's running order (the
  backend assigns `max(sort_order) + 1`, backend R10).
- **A2 (limit gates Save, not Duplicate) — decided by the human 2026-10-16.** F27 rev 1 disabled **Duplicate** at
  the plan limit; that would stop a free-plan user (1 preset per song) from editing and exporting a copy, which
  never touches the song. The limit therefore disables only **Save to song** (R1); Duplicate, Export and Send to
  pedal stay available.
- **A3 (preset count)** — new in Revision 1. "The song's preset count" is `song().presets.length` from the last
  `GET /songs/:id`, the same rows the backend counts for its 402 (non-deleted preset rows).

# Plan limit

## R1 — Plan limit gates Save to song only
(was F27 R14, changed per A2) WHILE the user's plan has a non-null `presetsPerSongLimit` and the song's preset
count is greater than or equal to that limit, the system SHALL disable the draft's "Save to song" button and show
the plan-limit hint `songPresetDraft.limit_reached` with the limit, and SHALL NOT disable any other control
because of the limit.

| Case | Plan limit / preset count | Expected |
|---|---|---|
| a | limit 1, 1 preset, draft open | Save to song disabled; hint shown with `limit` = 1 |
| b | limit 1, 1 preset, draft open | Export .prst and Send to pedal enabled (given a valid name) |
| c | limit 1, 1 preset, no draft | every row's Duplicate button enabled |
| d | limit 2, 1 preset, draft open | Save to song enabled; no hint |
| e | limit `null` (unlimited), 5 presets, draft open | Save to song enabled; no hint |

## R2 — Unknown plan does not block saving
(was F27 R15) IF `GET /me/plan` fails or returns a body `parsePlanLimits` rejects THEN the system SHALL keep
"Save to song" enabled (subject to R8/R9), show no plan-limit hint, and rely on the backend's limit response (R5).

# Save to song

## R3 — Save request
(was F27 R31) WHEN the user activates "Save to song", the system SHALL send exactly one `POST /songs/:id/presets`
request whose multipart body has a single `preset` file part holding the 507-byte `.prst` built from the patched
body and the draft name field (`draftToPrst`), with filename `exportFileName(draft name)`.

## R4 — Successful save
(was F27 R32, case b new in Revision 1, reworked with c–d in Revision 2) WHEN the save request succeeds (HTTP 201), the system SHALL remove the
draft panel, show the confirmation `songPresetDraft.saved` with the saved name, move focus to that confirmation,
and refresh the list from the server so the saved preset appears as the last row.

| Case | Follow-up `GET /songs/:id` | Expected |
|---|---|---|
| a | succeeds | the list from the reloaded song (saved preset last); the page never shows its loading state |
| b | fails | draft panel removed, confirmation shown and focused as above; the previous list is left untouched (the 201 preset is NOT appended); a non-blocking warning `songPresetDraft.refresh_failed` with a retry button `songPresetDraft.refresh_retry` is shown beside the confirmation; no page error state |
| c | after b, the user activates retry and the `GET /songs/:id` succeeds | the warning disappears and the list is the reloaded song (saved preset last) |
| d | after b, the user activates retry and the `GET /songs/:id` fails again | the warning stays, the previous list stays, no page error state |

## R5 — Save refused by the plan limit
(was F27 R33) IF the save request fails with status 402 THEN the system SHALL keep the draft unchanged and show
`songPresetDraft.errors.limit_reached_save`.

## R6 — Save refused for a taken name
(was F27 R34) IF the save request fails with status 409 THEN the system SHALL keep the draft unchanged and show
`songPresetDraft.errors.name_taken`.

## R7 — Other save failures
(was F27 R35, case f new in Revision 1) IF the save request fails with any status not covered by R5/R6 THEN the
system SHALL keep the draft unchanged and show the `songPresetDraft.errors.*` key mapped for that failure.

| Case | Failure | Key |
|---|---|---|
| a | status 0 (network) | `unreachable` |
| b | status 401 | `session_expired` |
| c | status 404 | `song_not_found` |
| d | status 400 | `rejected` |
| e | any other status (e.g. 500, 503) | `save_failed` |
| f | an error with no numeric `status` | `unreachable` |

## R8 — Saving state
(was F27 R36) WHILE a save request is in flight, the system SHALL disable Save to song, Discard and the name
input, show the label `songPresetDraft.saving` on the Save to song button, and set `aria-busy="true"` on the draft
card.

## R9 — Invalid name blocks saving
(extends F27 R28) WHILE the draft name has any error from F27 R25-R27, the system SHALL disable Save to song.

## R10 — No leave prompt after saving
(extends F27 R55) WHEN a save succeeds, the system SHALL allow the next navigation away from the song detail page
without showing the leave-confirmation dialog.

## R11 — Translations
Every new UI string SHALL exist in both `public/i18n/es.json` and `public/i18n/en.json` under the same keys, with
a non-empty value — including `songPresetDraft.refresh_failed` and `songPresetDraft.refresh_retry` (R4 b) — and the
`songPresetDraft` namespace SHALL be covered by `src/app/songs/i18n-parity.spec.ts`.

# Preservation

## P1 — Duplicate still sends no modifying request
F27 R10: clicking Duplicate still sends only `GET` requests (the preset bytes, and — new with this feature — at
most one `GET /me/plan` per page load) and never a `POST`/`PUT`/`DELETE` (existing behavior, test only).
