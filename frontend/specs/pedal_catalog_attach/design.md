# Design — F36 `pedal_catalog_attach`

Conventions (layers, signals, Promise-returning `*Api` services, Transloco, colocated Vitest specs) come from
`docs/architecture.md` and `docs/conventions.md`; this file only records choices made within them.

## 1. Starting point

- `/songs/:id` is `SongDetailPage` (`src/app/songs/song-detail-page/`, template 576 lines, component ~750). It
  already owns presets, the preset draft, user files and extra details. This feature adds **one** self-contained
  child component instead of growing that page.
- `src/app/pedals/` already exists and holds the GP-5 preset board (chain strip, glyphs, MIDI-facing UI). The
  backend's "pedal catalog" is a different concept (physical pedals a player owns), so the new code lives in
  **`src/app/pedal-catalog/`** to keep the two domains apart.
- Backend shapes and messages: requirements.md contract table. Two backend facts drive client checks:
  - `label` is checked non-blank but **not trimmed** and **not length-checked**; a label over 255 characters
    would fail at the `VARCHAR(255)` insert with a 500. The client trims and enforces the limit (R5).
  - `config` may be omitted (stored as `{}`); this feature sends `{}` explicitly so F38 only has to fill it.

## 2. Types — `src/app/pedal-catalog/pedal-catalog.ts`

```ts
export interface CatalogPedal {          // PedalDto
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SongPedal {             // SongPedalConfigDto
  id: string;
  songId: string;
  pedalCatalogId: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AttachPedalBody {
  pedal_catalog_id: string;
  label: string;
  config: Record<string, never>;         // always {} in F36
}
```

## 3. API service — `src/app/pedal-catalog/pedal-catalog-api.service.ts`

`@Injectable({ providedIn: 'root' }) export class PedalCatalogApi`, same shape as `SongsApi`
(`firstValueFrom`, `environment.apiBaseUrl`, `encodeURIComponent` on path ids). Exactly four public methods
(R11 b):

```ts
listPedals(): Promise<CatalogPedal[]>                                    // GET /pedals
listSongPedals(songId: string): Promise<SongPedal[]>                     // GET /songs/:id/pedals
attachPedal(songId: string, pedalId: string, label: string): Promise<SongPedal>
  // POST /songs/:id/pedals, body { pedal_catalog_id: pedalId, label, config: {} }
detachPedal(songId: string, songPedalId: string): Promise<void>          // DELETE /songs/:id/pedals/:configId
```

`attachPedal` receives an already-trimmed label; it does not validate. `authInterceptor` adds the Bearer token
and clears the session on 401, as everywhere else.

## 4. Pure logic

### 4.1 `src/app/pedal-catalog/attach-draft.ts` (R5)

```ts
export const LABEL_MAX_CODE_POINTS = 255;
export type AttachDraftError = 'pedal_required' | 'label_required' | 'label_too_long';
export type AttachDraftResult =
  | { valid: true; pedalId: string; label: string }      // label trimmed
  | { valid: false; error: AttachDraftError };

export function validateAttachDraft(pedalId: string | null, rawLabel: string): AttachDraftResult;
```

Order: `pedal_required` → `label_required` (trimmed empty) → `label_too_long`
(`[...trimmed].length > 255`). Never throws. Case a in R5 returns `pedal_required` even with a valid label;
the component still evaluates label errors independently for the field message (§5.3), by calling the
validator with a placeholder id.

### 4.2 `src/app/pedal-catalog/song-pedal-errors.ts` (R2, R4, R7, R10)

```ts
export type PedalLoadError = 'unreachable' | 'session_expired' | 'song_not_found' | 'load_failed';
export function classifyPedalLoadError(err: unknown): PedalLoadError;
// 0 → unreachable, 401 → session_expired, 404 → song_not_found, else load_failed.
// For the catalog, the component maps load_failed and song_not_found to 'catalog_failed' (GET /pedals has no 404).

export type AttachErrorKey =
  'label_required' | 'pedal_gone' | 'song_not_found' | 'session_expired' | 'unreachable' | 'attach_failed';
export function mapAttachError(err: unknown): AttachErrorKey;

export type DetachErrorKey = 'already_detached' | 'session_expired' | 'unreachable' | 'detach_failed';
export function mapDetachError(err: unknown): DetachErrorKey;
```

Same body-reading approach as `save-song-errors.ts` (`err.error` as `{ error?: unknown }`, never throws). Only
the exact backend strings `label is required` and `pedal_catalog_id does not reference an existing pedal` map
to specific keys; any other 400 → `attach_failed`. The existing `classifyLoadError` in
`src/app/songs/library-load-error.ts` is not reused because its `not_found` key name and copy are library-page
specific; the new classifier is four lines and keeps `pedal-catalog/` independent of `songs/`.

## 5. Component — `src/app/pedal-catalog/song-pedals-section/song-pedals-section.{ts,html}`

Selector `app-song-pedals-section`, input `songId = input.required<string>()`. All state is signals:

| Signal | Type | Notes |
|---|---|---|
| `listState` | `'loading' \| 'loaded' \| PedalLoadError` | R1, R2 |
| `songPedals` | `SongPedal[]` | replaced, never mutated |
| `catalogState` | `'loading' \| 'loaded' \| 'unreachable' \| 'session_expired' \| 'catalog_failed'` | R4 |
| `catalog` | `CatalogPedal[]` | |
| `catalogById` | `computed(Map<string, CatalogPedal>)` | R1 b-d |
| `panelOpen` | `boolean` | R3 |
| `selectedPedalId` | `string \| null` | |
| `label` | `string` | raw input value |
| `labelTouched` | `boolean` | set on blur; reset with the draft |
| `draft` | `computed(validateAttachDraft(...))` | R5 |
| `labelError` | `computed(...)` | `label_too_long` always; `label_required` only when `labelTouched` or from a 400 (R7 a) |
| `attaching` | `boolean` | R6 b |
| `attachError` | `AttachErrorKey \| null` | R7 |
| `confirmingId` | `string \| null` | one row at a time (R8 d) |
| `detachingId` | `string \| null` | R9 b |
| `detachError` | `DetachErrorKey \| null` | R10 |
| `announcement` | `'attached' \| 'detached' \| null` | `role="status"` live region (R6 c, R9 c) |

Lifecycle: the constructor runs no requests; an `effect` keyed on `songId()` starts `loadSongPedals()` and
`loadCatalog()` in parallel (one request each, R3 a). The page creates the section only for a loaded song (R12),
so the id never changes during the component's life in practice; the effect still keys on it to stay correct.

### 5.1 Name lookup (R1)

`pedalName(entry)`: if `catalogState() !== 'loaded'` → `null` (row shows no name, R1 d); else
`catalogById().get(entry.pedalCatalogId)?.name ?? null`, and the template shows `songPedals.pedal_unavailable`
for `null` only when the catalog is loaded (R1 c).

### 5.2 Attach (R6, R7)

`attach()` returns early if `attaching()` or `!draft().valid` (R6 b). On 201:
`songPedals.set([created, ...songPedals()])` (backend lists newest first, so prepending matches a reload),
`listState.set('loaded')`, close the panel, reset draft, `announcement.set('attached')`, clear `detachError`.
On error: `attachError.set(mapAttachError(err))`; for `label_required` also set `labelTouched` so the field
message shows; for `pedal_gone` clear `selectedPedalId` and call `loadCatalog()` (R7 b). Changing label or
selection clears `attachError` (R7 g).

### 5.3 Detach (R8-R10)

`askDetach(id)` sets `confirmingId` (replacing any other) and focuses that row's Keep button after render
(`afterNextRender` with a `viewChildren` query keyed by `data-song-pedal-id`). `cancelDetach()` clears it and
focuses that row's Detach button. Escape on the confirmation container calls `cancelDetach()`.
`confirmDetach(id)` returns early if `detachingId()` is set. On 204: remove by id, `announcement.set('detached')`,
clear `detachError`/`attachError`. On error: `mapDetachError`; for `already_detached` also remove the row.
Always clear `confirmingId` and `detachingId` in `finally`.

### 5.4 Error paths

No method lets a rejection escape: every `await` on `PedalCatalogApi` is in `try/catch` and lands in one of the
signals above. A list or catalog failure never touches the page's own state (R2 h): the section is a sibling of
the page's sections and owns its errors.

## 6. Page change — `song-detail-page.{ts,html}` (R12)

Add `SongPedalsSection` to the page's `imports`, and in the `loaded` branch, right after the closing `</div>` of
`song-detail-extras-grid`:

```html
<app-song-pedals-section class="mt-8 block" [songId]="s.id" />
```

No other page change. `song-detail-page.spec.ts` tests that end with `httpMock.verify()` and reach `loaded` now
see `GET /pedals` and `GET /songs/<id>/pedals`; add one helper `flushSongPedals(httpMock, id)` that flushes both
with `[]` and call it in those tests (P1). No assertions are changed.

## 7. Discarded alternatives

1. **Separate `/pedals` route/page** — rejected by the human (2026-10-19): attaching is a per-song action, and a
   standalone page would need its own song picker.
2. **Native `<select>` for the catalog** — rejected: F37 `pedal_reference_photo_tilt` adds a reference photo per
   catalog pedal, which an `<option>` cannot render. A radio list in a `fieldset` is equally accessible and lets
   F37 add the photo inside each option without restructuring.
3. **Re-fetching `GET /songs/:id/pedals` after attach/detach** — rejected: the 201 body is the full row and the
   204 needs no data; prepending/removing locally saves a round trip and the order already matches the backend's
   `created_at DESC`. A stale list after a concurrent change elsewhere is acceptable for a single-user library.
4. **Modal dialog for detach confirmation** (like `LeaveDraftDialog`) — rejected: detaching one row is a small,
   reversible-by-reattaching action; an inline confirmation keeps the context (which row) visible and avoids a
   second overlay on a page that already has two dialogs.
5. **Putting the code in `src/app/pedals/`** — rejected: that folder is the GP-5 preset board; mixing the
   backend catalog into it would blur two unrelated "pedal" concepts.

## 8. Files to touch

| File | Change |
|---|---|
| `src/app/pedal-catalog/pedal-catalog.ts` | new — types |
| `src/app/pedal-catalog/pedal-catalog-api.service.ts` (+ `.spec.ts`) | new — 4 calls |
| `src/app/pedal-catalog/attach-draft.ts` (+ `.spec.ts`) | new — validator |
| `src/app/pedal-catalog/song-pedal-errors.ts` (+ `.spec.ts`) | new — classifiers |
| `src/app/pedal-catalog/song-pedals-section/song-pedals-section.{ts,html,spec.ts}` | new — component |
| `src/app/pedal-catalog/i18n-parity.spec.ts` | new — R13 |
| `src/app/songs/song-detail-page/song-detail-page.{ts,html}` | mount the section |
| `src/app/songs/song-detail-page/song-detail-page.spec.ts` | R12 tests + `flushSongPedals` helper (P1) |
| `public/i18n/es.json`, `public/i18n/en.json` | `songPedals` namespace |

Estimated production code: ~380 lines (component ~170 TS + ~150 HTML, service/helpers ~60).

## 9. Test mapping (grouped, see `docs/specs.md` "Coverage granularity")

| Requirement(s) | Test file | Shape |
|---|---|---|
| R5 a-f | `attach-draft.spec.ts` | `it.each`, one row per case |
| R2 c-f, R4 c-e, R7 a-f, R10 a-d (classification) | `song-pedal-errors.spec.ts` | `it.each` per function |
| R6 a (body), R9 a (URL), R11 b | `pedal-catalog-api.service.spec.ts` | HttpTestingController |
| R1, R2, R3, R4, R5 g-i, R6, R7, R8, R9, R10, R11 a | `song-pedals-section.spec.ts` | TestBed + HttpTestingController, one `describe` per rule |
| R2 h, R12, P1 | `song-detail-page.spec.ts` | existing suite + new R12 tests |
| R13 | `src/app/pedal-catalog/i18n-parity.spec.ts` | same helpers as `src/app/songs/i18n-parity.spec.ts` |

## Visual direction

Written with the `frontend-design:frontend-design` skill loaded. The section is a working tool inside an
existing page, so it inherits the page's established language (slate surfaces, indigo actions, the F33 section
header and list treatment) rather than introducing a new one. The one distinctive element is the **footswitch
mark** at the start of each attached row: a small dark stomp-plate with the same concentric-circle footswitch
the chain board draws (`docs/architecture.md`, "Board block drawn parts"), so an attached pedal reads as a
physical pedal on the floor, not a database row. Everything else stays quiet.

### Palette (literal classes)

- Section heading: `text-sm font-medium text-slate-700 dark:text-slate-300` (same as F33).
- Header "Attach pedal" button (closed panel): `rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium
  text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50`. While the panel is open the
  button is hidden (the panel's own Cancel closes it).
- List container: `mt-2 divide-y divide-slate-200 rounded-lg bg-white ring-1 ring-inset ring-slate-200
  dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700` (same as F33 lists).
- Row: `flex min-w-0 items-center gap-3 px-3 py-2.5`.
- Footswitch mark: wrapper `flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-700
  shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)] dark:bg-slate-600`, containing
  `<svg viewBox="0 0 12 12" class="size-4 text-slate-200" aria-hidden="true">` with an outer circle
  (`cx=6 cy=6 r=5`, `fill="none" stroke="currentColor" stroke-opacity="0.6"`) and an inner circle
  (`r=2.5`, `fill="currentColor" fill-opacity="0.8"`).
- Row label: `min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100` with `[title]` = label.
- Row pedal name: `min-w-0 truncate text-xs text-slate-500 dark:text-slate-400`; unavailable variant adds
  `italic`.
- Row Detach button: `shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset
  ring-slate-300 hover:bg-slate-50 hover:text-red-700 dark:text-slate-300 dark:ring-slate-600
  dark:hover:bg-slate-700 dark:hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-indigo-600`.
- Row in confirmation: row gets `bg-red-50/60 dark:bg-red-950/30`; text `text-sm text-slate-700
  dark:text-slate-200`; Confirm `rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white
  hover:bg-red-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-red-600`; Keep uses the Detach button classes minus the red hover.
- Empty state: `mt-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm
  text-slate-500 dark:border-slate-600 dark:text-slate-400` (same as F33).
- Loading: three skeleton rows, each `h-12 animate-pulse rounded bg-slate-200 motion-reduce:animate-none
  dark:bg-slate-800`, inside `mt-2 space-y-2`.
- Error (list, catalog, attach and detach alerts): the page's error treatment, `flex flex-col items-start gap-3
  rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200 sm:flex-row sm:items-center
  sm:justify-between dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900`, `role="alert"`; retry button uses
  the page's `song-detail-retry` classes.
- Session expired: the page's amber treatment, `rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1
  ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900` with
  `<a routerLink="/login" class="ml-2 font-medium underline">`.
- Attach panel: `mt-3 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200 dark:bg-slate-900
  dark:ring-slate-700`.
- Catalog list: `<fieldset>` with a visually hidden `<legend class="sr-only">`, list `max-h-64 overflow-y-auto
  divide-y divide-slate-200 rounded-md bg-white ring-1 ring-inset ring-slate-200 dark:divide-slate-700
  dark:bg-slate-800 dark:ring-slate-700`; each option `<label class="flex cursor-pointer items-center gap-3 px-3
  py-2 text-sm text-slate-900 hover:bg-slate-50 has-[:checked]:bg-indigo-50 dark:text-slate-100
  dark:hover:bg-slate-700 dark:has-[:checked]:bg-indigo-950/40">` with `<input type="radio" name="catalog-pedal"
  class="size-4 accent-indigo-600">` and the name in `min-w-0 truncate`.
- Label input: `mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset
  ring-slate-300 placeholder:text-slate-400 focus:outline-2 focus:outline-indigo-600 aria-[invalid=true]:ring-red-500
  disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600`; field label `text-xs font-medium
  text-slate-600 dark:text-slate-400`; counter `text-xs tabular-nums text-slate-400` right-aligned showing
  `<n>/255` (code points); field error `mt-1 text-xs text-red-600 dark:text-red-400` with an `id` referenced by
  the input's `aria-describedby`.
- Panel footer: `mt-4 flex flex-wrap justify-end gap-2`; Cancel uses the Detach button classes minus the red
  hover; Attach uses the header button classes.
- Pedal hint (R5 a): `text-xs text-slate-500 dark:text-slate-400`, left of the footer buttons.

### Type

The app's existing sans stack only; no new typefaces. Scale: heading and body `text-sm`, metadata/controls
`text-xs`. Sentence case everywhere, no all-caps labels.

### Layout per breakpoint

- `< sm` (640px): header is heading + button on one row (`flex items-center justify-between gap-3`). Rows keep
  the mark, a two-line text block (label over pedal name) and the Detach button. The confirmation wraps under
  the text (`flex-wrap`), buttons right-aligned. The panel's label field and catalog stack vertically.
- `≥ sm`: same structure; the confirmation text and its two buttons sit on the row line. Panel: catalog list
  above, label field below, both full width of the section (section spans the page's `max-w-5xl`).
- No horizontal overflow at 375px: every text node in a row is `min-w-0 truncate` inside `flex-1 min-w-0`.

### Interaction states

- Hover: list rows have no hover (they are not clickable); buttons and catalog options as listed above.
- Focus: every interactive element has a visible `focus-visible:outline-2` ring (indigo, red for Confirm).
- Selected catalog option: `has-[:checked]:bg-indigo-50` / `dark:has-[:checked]:bg-indigo-950/40` plus the
  native radio check.
- Disabled: Attach `disabled:opacity-50 disabled:cursor-not-allowed`; label input disabled when the catalog is
  empty; Confirm/Keep disabled while detaching.
- Busy: Attach label switches to `songPedals.attaching`, Confirm to `songPedals.detaching`; the list region has
  `aria-busy="true"` while loading.

### Motion

One allowed motion: the skeleton `animate-pulse` while the list loads, removed under `motion-reduce`. No
entrance animation for attached/detached rows.

### Accessibility

- Section `<section aria-labelledby="song-pedals-heading" data-testid="song-pedals-section">`.
- "Attach pedal" button has `aria-expanded` and `aria-controls="song-pedals-attach-panel"`.
- A visually hidden `<p role="status" aria-live="polite" data-testid="song-pedals-status">` carries
  `songPedals.attached` / `songPedals.detached`.
- Each Detach button has `aria-label` = `songPedals.detach_aria` with the row label.

### UI copy (new namespace `songPedals`)

| Key | en | es |
|---|---|---|
| `heading` | Pedals | Pedales |
| `attach_open` | Attach pedal | Agregar pedal |
| `empty` | No pedals attached to this song yet. | Esta canción aún no tiene pedales. |
| `pedal_unavailable` | Pedal no longer in the catalog | El pedal ya no está en el catálogo |
| `catalog_legend` | Pedal catalog | Catálogo de pedales |
| `catalog_empty` | The catalog has no pedals yet. | El catálogo aún no tiene pedales. |
| `pedal_hint` | Choose a pedal from the catalog. | Elige un pedal del catálogo. |
| `label_field` | Label | Etiqueta |
| `label_placeholder` | e.g. Solo boost | p. ej. Boost del solo |
| `label_counter` | {{count}}/255 | {{count}}/255 |
| `attach` | Attach | Agregar |
| `attaching` | Attaching… | Agregando… |
| `cancel` | Cancel | Cancelar |
| `attached` | Pedal attached to the song. | Pedal agregado a la canción. |
| `detach` | Detach | Quitar |
| `detach_aria` | Detach {{label}} from this song | Quitar {{label}} de esta canción |
| `detach_confirm` | Detach "{{label}}" from this song? The pedal stays in the catalog. | ¿Quitar "{{label}}" de esta canción? El pedal sigue en el catálogo. |
| `detach_confirm_yes` | Detach | Quitar |
| `detach_keep` | Keep | Conservar |
| `detaching` | Detaching… | Quitando… |
| `detached` | Pedal detached from the song. | Pedal quitado de la canción. |
| `retry` | Try again | Reintentar |
| `login_again` | Log in | Iniciar sesión |
| `errors.unreachable` | Couldn't reach the server. Check your connection and try again. | No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo. |
| `errors.session_expired` | Your session has expired. | Tu sesión expiró. |
| `errors.song_not_found` | This song no longer exists in your library. | Esta canción ya no existe en tu biblioteca. |
| `errors.load_failed` | Couldn't load this song's pedals. | No se pudieron cargar los pedales de esta canción. |
| `errors.catalog_failed` | Couldn't load the pedal catalog. | No se pudo cargar el catálogo de pedales. |
| `errors.label_required` | Enter a label for this pedal. | Escribe una etiqueta para este pedal. |
| `errors.label_too_long` | Use 255 characters or fewer. | Usa 255 caracteres o menos. |
| `errors.pedal_gone` | That pedal was removed from the catalog. Choose another one. | Ese pedal se eliminó del catálogo. Elige otro. |
| `errors.attach_failed` | Couldn't attach the pedal. Try again. | No se pudo agregar el pedal. Inténtalo de nuevo. |
| `errors.already_detached` | That pedal was already detached from this song. | Ese pedal ya se había quitado de esta canción. |
| `errors.detach_failed` | Couldn't detach the pedal. Try again. | No se pudo quitar el pedal. Inténtalo de nuevo. |
