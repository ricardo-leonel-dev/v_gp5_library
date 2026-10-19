# Design — F31 `song_preset_draft_save`

This feature is the save/plan-limit half of F27's original design. The base text lives in
`specs/song_preset_duplicate_edit_export/design.md` (§4 save paragraph, §5 contract, "Visual direction" items
marked `[F31]`, UI copy rows marked `(F31)`). This file records what F31 adds and, since Revision 1
(2026-10-18), every place where the shipped code or the shipped backend differs from that text.
Conventions: `docs/architecture.md`, `docs/conventions.md`.

## Starting point (verified 2026-10-18 against `main` at 51db551)

- `src/app/songs/preset-draft.ts` **already exports** `mapSaveDraftError(err: unknown): SaveDraftErrorKey` and the
  `SaveDraftErrorKey` union (`limit_reached_save | name_taken | unreachable | session_expired | song_not_found |
  rejected | save_failed`). F27 shipped it with the mapping below but **no test** and no caller. F31 adds the test
  and the caller; code changes only if a test row fails. It returns the bare key; the page prefixes
  `songPresetDraft.errors.`.
- `draftToPrst(d)` and `exportFileName(name)` exist (F27 R37) and are reused unchanged.
- `src/app/songs/plan-api.service.ts` `PlanApi.getMyPlan(): Promise<PlanLimits | null>` exists (F4): resolves
  `null` on an unparseable body, rejects on an HTTP error. `PlanLimits.presetsPerSongLimit: number | null`.
- `src/app/songs/song.ts` `SongPreset { id, sortOrder, name, originalFilename?, mimeType?, byteSize?, createdAt? }`
  already matches the 201 body; no new type.
- `SongDetailPage` (`src/app/songs/song-detail-page/song-detail-page.ts`) has, from F27: `draft`, `canDuplicate =
  draft() === null`, `songNames`, `draftNameError`, `draftActionsEnabled`, `hasUnsavedDraft`, `confirmLeave`,
  `onDraftDiscard`; from F33: `userFiles`, `extraEntries` (untouched here). It does **not** inject `PlanApi` yet
  and has no save signals. `load(id)` sets `state` to `'loading'`, which swaps the whole `@case ('loaded')` block
  out of the DOM — see "Refresh after save".
- Action bar (`data-testid="song-preset-draft-actions"`) currently holds Export .prst and Send to pedal.
- `src/app/songs/i18n-parity.spec.ts` covers `saveSong`, `writeToPedal`/`writeToSlot`/`songs.card`, `songDetail`
  and friends, `unsupportedBrowser` — **not `songPresetDraft`**. R11 adds that namespace.
- `authInterceptor` clears the session on 401 and rethrows; nothing navigates, so the page stays and shows R7 b.

## Backend contract (as shipped — backend feature 21)

```
POST /songs/:id/presets   multipart/form-data, Bearer token
  part "preset": exactly one file part, 507 bytes, readable name
  201 → { id, sortOrder, name, originalFilename, mimeType, byteSize, createdAt }   (exact key set)
        sortOrder = max(existing) + 1; name = readPresetName(bytes) (bytes up to the first NUL, not trimmed)
  400 → { error }  zero/several "preset" parts, size != 507, unreadable name
  401 → no/invalid token
  402 → { error, code: "plan_preset_limit", plan, limit }  song already holds >= presetsPerSong presets
  404 → { error }  :id not a UUID, not owned, or soft-deleted
  409 → { error }  name equals (exact, case-sensitive) an existing preset name of the song
```

Deviations from F27 design §5 — none affect this feature's mapping, but they are recorded so tests use the real
precedence:
1. **400 wins over 404, 402 and 409** (backend R22, design "400 therefore wins..."): part validation runs before
   the song lookup. A bad file on a missing song is `rejected`, not `song_not_found`.
2. **402 wins over 409** (backend R21). A taken name on a full song is `limit_reached_save`.
3. §5 said nothing about the 507-byte check; the backend now enforces it (R39/R40). `draftToPrst` always produces
   507 bytes, so 400 only signals an encoder bug or a corrupted draft.
4. 404/400/409 bodies are exactly `{ error }` (R5); the page never reads them — mapping is by status only.

## What this feature adds

### `src/app/songs/songs-api.service.ts` (R3)
```ts
addSongPreset(songId: string, prst: Uint8Array, filename: string): Promise<SongPreset>
```
`FormData` with one part: `form.append('preset', new File([prst], filename, { type: 'application/octet-stream' }))`;
`POST ${apiBaseUrl}/songs/${encodeURIComponent(songId)}/presets`. No explicit Content-Type (browser sets the
boundary, same as `createSong`).

### `src/app/songs/song-detail-page/song-detail-page.ts`
New injection: `private readonly planApi = inject(PlanApi)`.

New state:
- `readonly plan = signal<PlanLimits | null>(null)`; `private planRequested = false`.
- `readonly atPresetLimit = computed(() => { const l = this.plan()?.presetsPerSongLimit; return l != null &&
  (this.song()?.presets.length ?? 0) >= l; })` (R1, A3).
- `readonly saveState = signal<'idle' | 'saving'>('idle')`.
- `readonly saveErrorKey = signal<SaveDraftErrorKey | null>(null)`.
- `readonly savedName = signal<string | null>(null)`.
- `readonly refreshFailed = signal<boolean>(false)` — R4 b–d warning; `readonly refreshing = signal<boolean>(false)`
  disables the retry button while a refresh is in flight (prevents double requests).
- `readonly canSave = computed(() => this.draft() !== null && this.draftActionsEnabled() &&
  this.saveState() === 'idle' && !this.atPresetLimit())` (R1, R8, R9).
- `canDuplicate` stays `draft() === null` (A2: the limit never gates Duplicate).

**Plan loading (R1, R2, P1).** The plan is fetched **on the first Duplicate**, not on page init:
`private ensurePlan(): Promise<void>` calls `getMyPlan()` once per page instance (`planRequested`), stores the
result, and swallows rejections (`plan` stays `null`, R2). `onDuplicate` awaits
`Promise.all([this.api.getSongPreset(...), this.ensurePlan()])`, so the draft panel opens with the limit already
known (no enabled-then-disabled flicker). `ensurePlan` never rejects, so a plan failure cannot fail the
duplicate.

**Save (`async onDraftSave()`), R3-R10:**
1. Return if `!canSave()`. Set `saveState('saving')`, clear `saveErrorKey` and `savedName`.
2. `const created = await this.api.addSongPreset(song.id, draftToPrst(d), exportFileName(d.name))`.
3. On success: `draft.set(null)`, `draftSelectedPos.set(null)` (so `hasUnsavedDraft()` is false, R10);
   `savedName.set(created.name)`; `saveState('idle')`; focus the confirmation (R4); then
   `await this.refreshSong(song.id)`. Focus does not depend on the refresh outcome (R4 b).
4. On failure: `saveErrorKey.set(mapSaveDraftError(err))`, `saveState('idle')`; the draft is untouched (R5-R7).

**Refresh after save (R4).** New `async refreshSong(id: string): Promise<void>`: sets `refreshing(true)`, calls
`api.getSong(id)`; on success `song.set(detail)` and `refreshFailed(false)` (R4 a, c); on rejection
`refreshFailed(true)` and **`song` is left untouched** — the 201 preset is not appended (R4 b, d, Revision 2);
finally `refreshing(false)`. It never touches `state`/`errorKey`, so the list, the expanded row
(`expandedSortOrder` kept) and the confirmation stay mounted and no page error state appears. The F30 chain cache
is keyed by sortOrder; the new sortOrder was never cached, so no invalidation is needed.

`onRefreshRetry()` (R4 c, d): returns if `refreshing()`; otherwise re-runs `refreshSong(song.id)` with the route
song id. It does not move focus.

`onDraftDiscard` and `onDuplicate` also clear `saveErrorKey`, `savedName` and `refreshFailed` so a stale message never sits next
to a new draft.

### `song-detail-page.html`
- Action bar: prepend the primary Save to song button, `data-testid="song-preset-draft-save"`,
  `[disabled]="!canSave()"`, label `saving` while `saveState() === 'saving'`, else `save`. When `atPresetLimit()`,
  render the hint `data-testid="song-preset-draft-limit-hint"` right after it, and set the button's
  `aria-describedby` to the hint id `song-preset-draft-limit-hint`.
- Discard and the name input gain `[disabled]="saveState() === 'saving'"` (R8). Draft `section` gets
  `[attr.aria-busy]="saveState() === 'saving' ? 'true' : null"`.
- Save error banner `data-testid="song-preset-draft-save-error"` (`role="alert"`) inside the draft card, above the
  action bar, when `saveErrorKey()` is set.
- Saved confirmation `data-testid="song-preset-draft-saved"` (`role="status"`, `tabindex="-1"` so it can take
  focus) rendered where the draft card was (after the reference note), when `savedName()` is set and `draft()` is
  `null`.
- Refresh warning `data-testid="song-preset-draft-refresh-failed"` directly below the confirmation, when
  `refreshFailed()` and the confirmation are both shown: text `refresh_failed` plus a button
  `data-testid="song-preset-draft-refresh-retry"` (label `refresh_retry`, `[disabled]="refreshing()"`,
  `(click)="onRefreshRetry()"`). `role="status"` (non-blocking, not `alert`).

## Visual direction

Unchanged from F27 design "Visual direction" (`[F31]` items), which was written with the `frontend-design` skill
loaded; repeated here so the implementer needs no other file:
- **Save to song** (primary): `rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white
  hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-indigo-600`. First in the action bar; the bar keeps
  `flex flex-wrap items-center gap-2` and wraps at 375px.
- **Plan-limit hint**: `text-xs text-slate-500 dark:text-slate-400`, inline right after the disabled button
  (wraps under it on narrow screens).
- **Save error banner**: `rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700
  dark:border-red-900 dark:bg-red-950/40 dark:text-red-300`, `role="alert"`, `mt-3`.
- **Saved confirmation**: `mt-6 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset
  ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900`, `role="status"`
  (`mt-6` instead of F27's `mt-3` because it now takes the draft card's slot, which uses `mt-6`).
- **Refresh warning** (R4 b): `mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs
  text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900`
  (same amber family as F27's unsaved chip: "attention, not error"). Retry button as a small secondary:
  `rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300
  hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200
  dark:ring-slate-600 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-indigo-600`. At 375px the button wraps under the text. Written by hand following the F27
  palette (the frontend-design skill was not loaded for this one addition).
- **States**: hover/focus as in the classes; disabled = `disabled` + `opacity-50`; Saving = label swap +
  `aria-busy="true"` on the card; after success focus moves to the confirmation. No motion added.

UI copy (texts exactly as in F27's UI copy table; the last two rows are new in Revision 2):

| Key | en | es |
|---|---|---|
| `songPresetDraft.save` | Save to song | Guardar en la canción |
| `songPresetDraft.saving` | Saving… | Guardando… |
| `songPresetDraft.saved` | “{{name}}” was added to the song. | “{{name}}” se agregó a la canción. |
| `songPresetDraft.limit_reached` | Your plan allows up to {{limit}} presets per song, so this copy can't be saved to this song. You can still export it or send it to the pedal. | Tu plan permite hasta {{limit}} presets por canción, así que esta copia no se puede guardar en la canción. Igual puedes exportarla o enviarla al pedal. |
| `songPresetDraft.errors.limit_reached_save` | This song reached your plan's preset limit. The copy wasn't saved. | Esta canción alcanzó el límite de presets de tu plan. La copia no se guardó. |
| `songPresetDraft.errors.name_taken` | Another preset in this song uses this name. Rename the copy and save again. | Otro preset de esta canción usa este nombre. Cambia el nombre de la copia y guarda de nuevo. |
| `songPresetDraft.errors.unreachable` | Couldn't reach the server. Check your connection and save again. | No se pudo conectar con el servidor. Revisa tu conexión y guarda de nuevo. |
| `songPresetDraft.errors.session_expired` | Your session expired. Log in again, then save the copy. | Tu sesión expiró. Inicia sesión de nuevo y guarda la copia. |
| `songPresetDraft.errors.song_not_found` | This song no longer exists. Export the copy to keep it. | Esta canción ya no existe. Exporta la copia para conservarla. |
| `songPresetDraft.errors.rejected` | The server didn't accept this preset file. Export it to keep your changes. | El servidor no aceptó este archivo de preset. Expórtalo para conservar tus cambios. |
| `songPresetDraft.errors.save_failed` | The copy wasn't saved. Try again. | La copia no se guardó. Inténtalo de nuevo. |
| `songPresetDraft.refresh_failed` | The copy is saved, but the preset list couldn't be refreshed. | La copia está guardada, pero no se pudo actualizar la lista de presets. |
| `songPresetDraft.refresh_retry` | Refresh list | Actualizar lista |

Note: the shipped es file uses «» quotes in `songPresetDraft.heading`/`name_duplicate`; F27's table used “”.
Keep F27's table text for the new keys (the human approved it); harmonising quotes is out of scope.

## Discarded alternatives

- **Reload with the existing `load(id)`** (F27 §4 text). Rejected: `load` sets `state('loading')`, which unmounts
  the list, the expanded row and the confirmation, so focus-to-confirmation (R4) would land on a removed node and
  the page would flash its spinner. `refreshSong` keeps `state` as is.
- **Append the 201 body and skip the reload.** Rejected: R4 (human-approved) asks for a reload so the list
  reflects the server's view (another tab may have added presets).
- **Append the 201 body only when the reload fails** (Revision 1's R4 b). Rejected by the human (Revision 2): the
  list must only ever show server state; a warning with retry is shown instead.
- **Fetch the plan on page init.** Rejected: users who never duplicate would pay for a request, and six existing
  page tests call `httpMock.verify()` after init and would all need a `/me/plan` flush. Fetching on the first
  Duplicate touches one existing test (F27 R10, now P1).
- **Gate Duplicate at the limit** (F27 rev 1). Rejected by the human (A2).

## Test plan and grouping

- `src/app/songs/preset-draft.spec.ts`: R5, R6, R7 a–f as one `it.each` table over `mapSaveDraftError`
  (402/409/0/401/404/400/500/503/`new Error()`).
- `src/app/songs/songs-api.service.spec.ts`: R3 — method `POST`, URL, body is `FormData` with exactly one `preset`
  entry that is a `File` of 507 bytes named as passed; resolves with the flushed `SongPreset`.
- `src/app/songs/song-detail-page/song-detail-page.spec.ts`:
  - R1 a–e (one `it.each`, flush `/me/plan` with each limit) and R2 (HTTP 500 and an unparseable body).
  - R4 a–d (b: 201 then `GET /songs/:id` 500 → confirmation focused, list unchanged, warning shown, no error
    state; c: retry succeeds → warning gone, reloaded list; d: retry fails → warning stays); R10 asserts `confirmLeave()` returns `true` after a save of an edited draft.
  - Page-level R5–R7 grouping (docs/specs.md "Coverage granularity"): one test proving a 402 keeps the draft and
    renders the mapped banner text; the per-status mapping is covered by the `mapSaveDraftError` table.
  - R8 (pending request: Save/Discard/name disabled, `saving` label, `aria-busy`), R9 (invalid name → Save
    disabled).
  - P1: update the existing F27 R10 test to flush one `GET /me/plan` and still assert no non-GET request.
- `src/app/songs/i18n-parity.spec.ts`: R11 — add `songPresetDraft` to the namespace parity checks.
