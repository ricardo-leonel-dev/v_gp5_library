# Design — F27 `song_preset_duplicate_edit_export`

Conventions, layering, error-state pattern and test style follow `docs/architecture.md` and `docs/conventions.md`;
this file only records the choices made inside them.

**Revision 2 (2026-10-16): split.** The parts of this design about saving the draft to the song and the plan
limit now belong to F31 `song_preset_draft_save` (`specs/song_preset_draft_save/`), not to F27:
- §4: `plan` / `atPresetLimit` / `PlanApi`, `saveState` / `saveErrorKey` / `savedName`, the Save paragraph and
  `mapSaveDraftError`; `canDuplicate` becomes `draft() === null` in F27.
- §5 (backend contract) and `SongsApi.addSongPreset`.
- Visual direction: the primary "Save to song" button, the save error banner, the saved confirmation, the
  plan-limit hint, the "Saving" state and "after Save success, focus moves to the confirmation".
- UI copy keys `songPresetDraft.save`, `saving`, `saved`, `limit_reached`, and `errors.limit_reached_save`,
  `name_taken`, `unreachable`, `session_expired`, `song_not_found`, `rejected`, `save_failed`.
- §9 test rows for R14, R15, R31-R36.
F27's action bar order is Export .prst, Send to pedal; F31 prepends Save to song. Everything else is unchanged.

## 1. Starting point (what F26/F30/F5 already built)

- `src/app/songs/song-detail-page/song-detail-page.{ts,html}` (F26 + F30): loads `SongDetail`, renders the ordered
  preset list as an accordion. Expanding a row fetches the `.prst` via `SongsApi.getSongPreset(songId, sortOrder)`,
  decodes it with `decodePrstFile`, and shows `<app-chain-board>` + `<app-block-detail>` read-only. Per-row state
  lives in `ReadonlyMap` signals keyed by `sortOrder`.
- `src/app/midi/gp5-sysex-preset-codec.ts`: `decodeGp5Body(body, name, slot)` finds the four records by magic
  (`REC_MODELS`, `REC_BYPASS`, `REC_ORDER`, `REC_PARAMS`), builds 10 blocks in block-index order, then maps them to
  chain order via `order[chainPos] = blockIdx`. `encodeBody` (private) builds a body from scratch: identity order,
  models `k`, all-zero params. It is the "unverified" encoder the feature description warns about.
- `src/app/midi/gp5-prst-file.ts`: `encodePrstFile(preset)` wraps `raw.body` + `raw.nameField` in the 507-byte
  layout and computes the CRC; `decodePrstFile` validates; `isReadablePrstNameField` mirrors the backend's
  `readPresetName`.
- `src/app/songs/write-preset-form.ts`: `decodeSongPreset(bytes)` returns `{ preset, body, nameField }` from a
  song's `.prst`. `mapPedalWriteError` maps `writePreset` failures.
- `src/app/songs/write-to-pedal-dialog/` (F5): slot picker, single/"write all" mode, connection reminder +
  inline connect, fetches each preset from the backend before `writePreset`.
- `src/app/songs/plan-api.service.ts`: `PlanApi.getMyPlan()` → `PlanLimits | null` (`presetsPerSongLimit`,
  `null` = unlimited). Backend limits: free 1, basic 2, premium unlimited.
- `src/app/pedals/block-detail/`: renders category, FX title, on/off state, labelled params (`describeParameters`)
  and an FX browser listing every FX in the category.

## 2. Verified body encoder: patch in place (R1-R7)

New export in `src/app/midi/gp5-sysex-preset-codec.ts` (the file that owns the body layout constants):

```ts
export function patchGp5Body(body: Uint8Array, chain: readonly PresetSlot[]): Uint8Array;
```

Algorithm:
1. Validate: `body.length === GP5_BODY_LEN`, all four magics found with their data inside the body, and the 10
   order bytes are a permutation of `0..9`; otherwise `throw new Error('body_not_patchable')` (R6).
2. `out = body.slice()` (R7). `baseline = decodeGp5Body(body, '', 0).chain`.
3. For each chain position `pos` in `0..9`: `blockIdx = order[pos]`; compare `chain[pos]` with `baseline[pos]`
   and write **only fields that differ**:
   - `moduleType` differs and `parseModuleType` succeeds → write `fxlow` (24-bit LE) + `cat` into
     `models + blockIdx*4` (R4). Unparseable → leave bytes untouched.
   - `enabled` differs → set/clear bit `blockIdx` in the 32-bit LE mask (R2).
   - `parameters.p<k>` (k in 0..7) differs by `Object.is` and is finite → `setFloat32(params + (blockIdx*8+k)*4,
     value, true)` (R3).
4. Return `out`.

"Write only what differs" is what makes R1 hold even for NaN/denormal floats the decoder may round-trip
imperfectly, and it guarantees unknown bytes between and after the records are never touched. R5 follows from
the decoder reading the same offsets. The CRC lives in the `.prst` wrapper, not the body, so `encodePrstFile`
recomputes it as today. `encodeBody` stays as it is (still used by `encodeWriteRequest` for byte-less mocks) and
is not called by this feature.

New export in `src/app/midi/gp5-prst-file.ts`:

```ts
export function encodePrstNameField(name: string): Uint8Array; // 16 bytes, ASCII + 0x00 pad (R8)
```
Throws `Error('name_unsupported')` if the name fails A9; callers validate first.

New pure helper in `src/app/midi/gp5-module-vocabulary.ts`:

```ts
export interface SwappableEffect { readonly fxIndex: number; readonly fxTitle: string; readonly moduleType: string }
export function swappableEffects(categoryIndex: number): readonly SwappableEffect[]; // R21
```
Reverse lookup over `GP5_HARDWARE_MODULE_CODES`: first hardware code per `(categoryIndex, fxIndex)`, ordered by
`fxIndex`, excluding the user-slot titles `User IR 1-20` and `User SnapTone`.

## 3. Draft model (pure, `src/app/songs/preset-draft.ts`) (R10, R11, R17, R19, R20, R22, R25-R29)

No DI, no I/O, every function returns a new object.

```ts
export interface PresetDraft {
  readonly sourceSortOrder: number;
  readonly sourceName: string;
  readonly name: string;                    // as typed (untrimmed)
  readonly sourceBody: Uint8Array;          // 466 bytes, never mutated
  readonly chain: readonly PresetSlot[];    // edited chain, chain order
  readonly edited: boolean;                 // R29: true after any edit/rename
}
export type DraftNameError = 'name_required' | 'name_unsupported' | 'name_duplicate';

export function suggestCopyName(sourceName: string, songNames: readonly string[]): string;          // R11
export function createDraft(sourceSortOrder: number, bytes: Uint8Array, songNames: readonly string[]):
  { ok: true; draft: PresetDraft } | { ok: false };                                                  // via decodeSongPreset
export function validateDraftName(name: string, songNames: readonly string[]): DraftNameError | null; // R25-R27
export function setBlockEnabled(d: PresetDraft, pos: number, enabled: boolean): PresetDraft;          // R17
export function setBlockParameter(d: PresetDraft, pos: number, key: string, value: number): PresetDraft; // R19
export function setBlockModule(d: PresetDraft, pos: number, moduleType: string): PresetDraft;          // R22
export function renameDraft(d: PresetDraft, name: string): PresetDraft;
export function draftToPrst(d: PresetDraft): Uint8Array;  // encodePrstFile({ raw: { body: patchGp5Body(...), nameField: encodePrstNameField(name.trim()) } })
export function draftToPreset(d: PresetDraft, slot: number): Preset; // for writePreset (R40)
export function parseParamInput(text: string): number | null;         // R20: null for empty / non-finite
export function exportFileName(name: string): string;                 // R37
```

`validateDraftName` order: required → unsupported (length > 16 or any char outside `0x20..0x7e`, or only
spaces) → duplicate (exact match on trimmed name vs. song names). `suggestCopyName`: for `n = 2, 3, …`,
`suffix = ' ' + n`, `base = sourceName.slice(0, 16 - suffix.length).trimEnd()`, return the first `base + suffix`
not in `songNames`.

## 4. Page wiring (`song-detail-page.{ts,html}`) (R9-R13, R16, R24, R28-R30, R39, R43; save parts → F31)

New signals on `SongDetailPage`:
- `draft = signal<PresetDraft | null>(null)`, `draftSelectedPos = signal<number | null>(null)`.
- `canDuplicate = computed(() => draft() === null)` (R13). The plan limit never gates Duplicate (F31 A2).
- `draftNameError = computed(() => validateDraftName(...))`; `draftActionsEnabled` (R28).
- [F31] `plan`, `atPresetLimit`, `saveState`, `saveErrorKey`, `savedName` — see `specs/song_preset_draft_save/design.md`.
- `writeDialogOpen = signal(false)`.

The source bytes for `createDraft` are fetched once more through `SongsApi.getSongPreset` on Duplicate (the F30
cache keeps only the decoded chain, not bytes). Changing F30's cache to keep bytes is an equally valid choice;
re-fetching keeps F30's code untouched. A failed fetch shows `songPresetDraft.errors.duplicate_failed` inline in
the row panel and creates no draft.

[F31 — not part of F27] Save (F31 R3-R8): `SongsApi.addSongPreset(songId, draftToPrst(d), exportFileName(name))`, then `load(id)` again
(reuses the existing loader; collapses no rows needlessly — `expandedSortOrder` is kept), clear the draft, set
`savedName`. Error mapping in a pure `mapSaveDraftError(err): string` in `preset-draft.ts`:
`402 → limit_reached_save`, `409 → name_taken`, `0 → unreachable`, `401 → session_expired`, `404 → song_not_found`,
`400 → rejected`, else `save_failed` — all under `songPresetDraft.errors.*`.

Export (R37, R38): new `src/app/songs/download-bytes.ts` → `downloadBytes(bytes: Uint8Array, filename: string)`
(Blob + `URL.createObjectURL` + temporary `<a download>` click + `revokeObjectURL`). Tests stub
`URL.createObjectURL` with `vi.stubGlobal` and assert on the Blob bytes.

## 5. Backend contract needed (A1 — F31 only since rev 2; card created 2026-10-16)

One backend card covering three endpoints (human decision). **F27 consumes only `POST`.** `PUT` and `DELETE` are
built and tested in the backend for later features; F27 adds no frontend method, UI or test for them.

All three are protected (Bearer token), scoped to the caller's own non-deleted song, and use the existing
`SongError` JSON shape `{ error }`. `:sortOrder` is a non-negative integer path segment; anything else is `404`
(same rule as `GET /songs/:id/files/preset?sort_order=`).

```
POST /songs/:id/presets                      (multipart/form-data)   — used by F27
  part "preset": one .prst file (507 bytes)
  201 → SongPreset DTO { id, sortOrder, name, originalFilename, mimeType, byteSize, createdAt }
        sortOrder = (max existing sort_order) + 1; name = readPresetName(bytes)
  400 → missing/extra "preset" part, invalid .prst, or unreadable preset name
  402 → { error, code, plan, limit } when the song already holds presetsPerSong presets (same shape as POST /songs)
  404 → song not found / not owned
  409 → another preset in this song already has the same pedal_preset_name

PUT /songs/:id/presets/:sortOrder            (multipart/form-data)   — NOT used by F27
  part "preset": one .prst file (507 bytes); replaces the stored file and pedal_preset_name of that preset
  200 → SongPreset DTO with the SAME sortOrder (position unchanged); id unchanged
  400 → same validation as POST
  404 → song not found / not owned, or no preset at :sortOrder
  409 → the new name equals the name of a DIFFERENT preset in the song (re-saving under its own name is allowed)
  (no 402: replace never changes the preset count)

DELETE /songs/:id/presets/:sortOrder                                 — NOT used by F27
  204 → preset removed; every preset with a higher sort_order is shifted down by 1 in the same transaction,
        so sort orders stay contiguous 0..n-1 and GET /songs/:id/files/preset?sort_order= keeps matching the list
  404 → song not found / not owned, or no preset at :sortOrder
  409 → it is the song's only preset (a song always has at least one preset, as POST /songs requires)
```

Order handling chosen for `DELETE`: compact (shift down) rather than leave gaps, because the frontend addresses
presets by `sortOrder` everywhere (F5, F26, F30) and a gap would make positions and `sort_order` diverge.

New frontend method in `src/app/songs/songs-api.service.ts` (the only one F27 adds):
`addSongPreset(songId: string, prst: Uint8Array, filename: string): Promise<SongPreset>` (FormData, part
`preset`, `File([prst], filename, { type: 'application/octet-stream' })`).

Suggested backend card (for the leader to propose, `--project-path
/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend`): title "Add, replace and delete a preset in an
existing song", acceptance = the contract above. F27 implementation must block on it (AGENTS.md §8) if it is not
`done` when F27 is claimed. Spec drafting does not depend on it; unit tests mock `HttpClient`.

## 5b. Leave confirmation (R48-R55)

Existing dialog pattern: the app has no `window.confirm` use; F5's `WriteToPedalDialog` is a bespoke component
(`fixed inset-0 z-50` backdrop, card with `role="dialog" aria-modal="true"`, Escape via `@HostListener`, focus via
`afterNextRender`). The leave dialog follows it.

- New component `src/app/songs/leave-draft-dialog/leave-draft-dialog.{ts,html}` (`app-leave-draft-dialog`),
  `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`. Inputs: `draftName: string`.
  Outputs: `leave = output<void>()`, `stay = output<void>()`. Escape and backdrop click emit `stay` (R50). Focus
  moves to "Keep editing" on open (R51).
- `SongDetailPage` gains:
  - `readonly hasUnsavedDraft = computed(() => this.draft()?.edited === true)`.
  - `readonly leavePrompt = signal<{ resolve: (leave: boolean) => void } | null>(null)`; the template renders the
    dialog while non-null.
  - `confirmLeave(): boolean | Promise<boolean>` — returns `true` synchronously when `!hasUnsavedDraft()` (R53,
    R55); otherwise sets `leavePrompt` and returns a Promise resolved by the dialog: `leave` → clear draft,
    resolve `true` (R49); `stay` → resolve `false`, draft untouched (R50).
  - `@HostListener('window:beforeunload', ['$event']) onBeforeUnload(e: BeforeUnloadEvent)` — calls
    `e.preventDefault()` (and sets `e.returnValue = ''` for older engines) only when `hasUnsavedDraft()` (R52, R54).
- New functional guard `src/app/songs/song-detail-page/leave-draft.guard.ts`:
  `export const leaveDraftGuard: CanDeactivateFn<SongDetailPage> = (c) => c.confirmLeave();`, registered on the
  `songs/:id` route in `src/app/app.routes.ts` as `canDeactivate: [leaveDraftGuard]`.
- Discard (and, in F31, Save success) sets `draft` to `null`, so `hasUnsavedDraft()` is `false` and the next navigation passes
  without a prompt (R55).

"Unsaved edits" means `draft.edited === true` (A6): a fresh duplicate with no changes does not prompt.

## 6. Block detail edit mode (`src/app/pedals/block-detail/`) (R16-R24)

Extend `BlockDetail` instead of forking it:
- `readonly editable = input(false)`.
- Outputs: `enabledChange = output<boolean>()`, `parameterChange = output<{ key: string; value: number }>()`,
  `moduleChange = output<string>()`.
- When `editable()` is `false`, the template is exactly today's (R24; existing F14/F30 specs keep passing).
- When `true`: the on/off line becomes a switch; each param `<dd>` becomes a numeric text input; a `<select>` of
  `swappableEffects(categoryIndex)` appears under the title (hidden for unknown modules, R23). Param keys come
  from `describeParameters` for resolved FX (`p0..p<n-1>`), or the raw `p<k>` keys otherwise.

The page passes `[editable]="true"` only to the draft panel's block detail; `ChainBoard` needs no change (the
draft chain is a new array per edit, so `opacity-40` follows `enabled`, R18).

## 7. Write-to-pedal dialog draft mode (`write-to-pedal-dialog`) (R39-R42)

Add `readonly localPreset = input<{ name: string; toPreset: (slot: number) => Preset } | null>(null)`.
When non-null: the preset list shows one row with the draft name, the "Write all in order" pill is not rendered,
`submit()` skips `getSongPreset`/`decodeSongPreset` and calls `pedal.writePreset(localPreset.toPreset(slot))`
once. All existing guards (connection check, slot validation, error mapping, Escape/backdrop lock, success panel)
are reused. The page passes `song` and a one-element `presets` built from the draft (`sortOrder: -1`,
`presetId: 'draft'`).

## 8. Discarded alternatives

- **Fix and use `encodeBody` (build the body from scratch).** Rejected: it would need every byte of the 466-byte
  body explained, but only the four records are mapped; padding and trailing bytes are not understood. Any
  unknown byte it gets wrong silently changes the sound on the pedal. Patching the real body changes only the
  bytes we understand and is provably identity on unedited input (R1).
- **Persist the copy immediately on Duplicate, then edit and "update".** Rejected: it violates "persisted only on
  explicit save", consumes a plan slot for a copy the user may discard, and needs a replace endpoint.
- **A separate `BlockEditor` component.** Rejected: duplicates BlockDetail's resolved/unknown rendering and
  breaks the "same visual model" rule from F30; an `editable` input keeps one source of truth.
- **`window.confirm` in the `canDeactivate` guard.** Rejected: unstyled, not translatable through Transloco's
  live language switch, blocks the main thread, and breaks the app's bespoke-dialog pattern (F5). The browser
  prompt is only used for reload/close, where no in-page UI can run.
- **A new write dialog for drafts.** Rejected: would duplicate F5's slot picker, connection handling and error
  mapping. An optional `localPreset` input reuses all of it.

## 9. Test plan and grouping

- `gp5-sysex-preset-codec.spec.ts`: R1 and R5 run over every `GP5_CAPTURED_BODIES` entry plus the ToneLab body;
  R2/R3/R4 assert the exact set of differing byte offsets; R6 three throw cases; R7 snapshot before/after.
- `gp5-prst-file.spec.ts`: R8.
- `gp5-module-vocabulary.spec.ts`: R21 (`swappableEffects`).
- `preset-draft.spec.ts` (plain Vitest): R11, R20 (`parseParamInput`), R25-R27, R37 (`exportFileName` + `draftToPrst`
  decodes ok).
- `block-detail.spec.ts`: R17, R19, R20 (inline error), R22, R23, R24 (read-only default).
- `song-detail-page.spec.ts` (TestBed + `provideHttpClientTesting`): R9, R10, R12, R13, R16, R18, R28-R30, R38,
  R39, R43, R46/R47 (class assertions: `flex-wrap` action bar, `lg:flex-row` editor row, `min-w-0` on children).
- `write-to-pedal-dialog.spec.ts`: R40, R41, R42.
- `leave-draft-dialog.spec.ts`: R49-R51 at component level (outputs, Escape/backdrop → `stay`, initial focus).
- `song-detail-page.spec.ts`: R48-R50 and R53/R55 via `RouterTestingHarness` navigating away from `/songs/:id`
  (dialog shown / navigation held / completed / cancelled); R52/R54 by dispatching a cancelable `beforeunload`
  `Event` on `window` and asserting `defaultPrevented`.
- `leave-draft.guard.spec.ts`: guard delegates to `confirmLeave()`; `app.routes.spec.ts` asserts the `songs/:id`
  route lists `leaveDraftGuard` in `canDeactivate`.
- `src/app/songs/i18n-parity.spec.ts` already enforces es/en parity for the whole file: R44.
- R45 is a manual hardware check (last task), not automatable.

Grouping allowed by `docs/specs.md` "Coverage granularity": R46 and R47 may share one layout test row.

## Visual direction

Written with the `frontend-design` skill loaded. The page's established palette (slate surfaces, indigo primary,
category colors on the board) is fixed by `docs/architecture.md`, so the one distinctive element is how a draft
reads as **work in progress**: an amber rail on the left edge of the draft card, like the edit LED on a pedal,
plus an "unsaved" chip in the same amber. Everything else stays quiet and reuses existing classes.

### Palette (literal classes)
- Draft card: `relative mt-6 rounded-lg bg-white ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:ring-slate-700`
  with a rail child `absolute inset-y-0 left-0 w-1 rounded-l-lg bg-amber-400 dark:bg-amber-500` (`aria-hidden`).
  When the draft is not edited yet (`edited === false`) the rail uses `bg-slate-300 dark:bg-slate-600`.
- Unsaved chip (R29): `inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium
  text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900`
  with a dot `size-1.5 rounded-full bg-amber-500`.
- [F31] Primary button (Save to song): `rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white
  hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-indigo-600`.
- Secondary buttons (Export .prst, Send to pedal, Duplicate): `rounded-md bg-white px-3 py-1.5 text-sm font-medium
  text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50
  dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-800 focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-indigo-600`. Duplicate uses `px-2.5 py-1 text-xs`.
- Discard (text button): `rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 hover:text-red-700
  dark:text-slate-400 dark:hover:text-red-300 disabled:opacity-50 focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-red-600`.
- Inputs (name, params): `w-full rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-inset
  ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-900 dark:text-slate-100
  dark:ring-slate-600`; invalid adds `ring-red-400 dark:ring-red-700` and `aria-invalid="true"`. Param inputs add
  `tabular-nums text-right` and `inputmode="decimal"`.
- Inline field error: `mt-1 text-xs text-red-700 dark:text-red-300` linked by `aria-describedby`.
- [F31] Save error banner: reuse F30's failed-row classes (`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs
  text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300`, `role="alert"`).
- [F31] Saved confirmation: `mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset
  ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900`, `role="status"`.
- [F31] Plan-limit hint (F31 R1): `text-xs text-slate-500 dark:text-slate-400` beside the disabled Save to song
  button (F31 A2).
- Bypass switch (R17): `button role="switch" [attr.aria-checked]`; track `relative inline-flex h-5 w-9 shrink-0
  rounded-full transition-colors motion-reduce:transition-none` + on `bg-red-500` / off `bg-slate-300
  dark:bg-slate-600`; thumb `absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform
  motion-reduce:transition-none` + on `translate-x-4`. Red on = same meaning as the board's LED.

### Type
Existing system stack and scale only. Draft heading `text-sm font-semibold text-slate-900 dark:text-slate-100`;
labels `text-xs font-medium text-slate-600 dark:text-slate-400` (sentence case, no all caps); help text
`text-xs text-slate-500`; footnote `text-[11px] text-slate-400 dark:text-slate-500` (same as F30).

### Layout per breakpoint
- Draft card: `section` after the reference note, `data-testid="song-preset-draft"`, inner padding `py-4 pl-5 pr-4`.
  Header row `flex flex-wrap items-center justify-between gap-2`: heading + unsaved chip left; Discard right.
- Name field below the header: `max-w-xs`, with the help line under it.
- Editor row: `mt-4 flex flex-col gap-3 lg:flex-row lg:items-start`; board `min-w-0 lg:flex-[3]`, block detail
  `min-w-0 lg:flex-[1]` (identical proportions to F30). At 375px the detail stacks under the board; the board
  keeps its 5-column grid.
- Edit hint (`songPresetDraft.edit_hint`) under the board when no block is selected.
- Param grid in edit mode: keep `grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3`; each cell label above input.
- Action bar at the bottom: `mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3
  dark:border-slate-700/50`; order Export .prst, Send to pedal (F31 prepends Save to song). At 375px buttons wrap; no
  horizontal scroll (R46).
- Duplicate button: in the F30 expanded panel, right-aligned in a `mt-3 flex flex-wrap items-center justify-end
  gap-2` row under the board/footnote.

### Interaction states
- Hover/focus: as in the class strings above; every control has a visible `focus-visible` outline.
- Selected block on the draft board: existing ChainBoard selected ring (`[selectedIndex]` bound to
  `draftSelectedPos`).
- Disabled: Duplicate (R13), draft actions (R28) use `disabled` + `disabled:opacity-50`.
- [F31] Saving: Save label switches to `songPresetDraft.saving`, `aria-busy="true"` on the card.
- After Duplicate, focus moves to the draft name input; [F31] after Save success, focus moves to the confirmation;
  after Discard, focus returns to the source row's toggle button.

- Leave-confirmation dialog: same backdrop and card classes as F5 (`fixed inset-0 z-50 flex items-center
  justify-center bg-slate-900/40 p-4`; card `flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white
  shadow-xl dark:bg-slate-800`), body `px-4 py-4 sm:px-5`, title `text-base font-semibold text-slate-900
  dark:text-slate-100`, message `mt-2 text-sm text-slate-600 dark:text-slate-300`, footer `flex flex-wrap
  justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5`. "Keep editing" uses the
  primary button classes (it is the safe default and receives focus); "Leave and discard" uses `rounded-md
  bg-white px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50
  dark:bg-transparent dark:text-red-300 dark:ring-red-800 dark:hover:bg-red-950/60 focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-red-600`. At 375px the card fills the width minus `p-4` and
  the buttons wrap.

### Motion
One allowed motion: the bypass switch thumb slide (`transition-transform`, off under `motion-reduce`). No entrance
animation for the draft card.

### UI copy (en / es)
| key | en | es |
|---|---|---|
| `songPresetDraft.duplicate` | Duplicate | Duplicar |
| `songPresetDraft.duplicate_aria` | Duplicate preset {{name}} | Duplicar el preset {{name}} |
| `songPresetDraft.limit_reached` (F31) | Your plan allows up to {{limit}} presets per song, so this copy can't be saved to this song. You can still export it or send it to the pedal. | Tu plan permite hasta {{limit}} presets por canción, así que esta copia no se puede guardar en la canción. Igual puedes exportarla o enviarla al pedal. |
| `songPresetDraft.heading` | Copy of “{{source}}” | Copia de “{{source}}” |
| `songPresetDraft.unsaved` | Not saved to the song | Sin guardar en la canción |
| `songPresetDraft.name_label` | Preset name | Nombre del preset |
| `songPresetDraft.name_help` | Up to 16 characters, as the pedal screen shows it. | Hasta 16 caracteres, como lo muestra la pantalla del pedal. |
| `songPresetDraft.edit_hint` | Select a block to change its effect, bypass or values. | Selecciona un bloque para cambiar su efecto, bypass o valores. |
| `songPresetDraft.bypass_label` | Block on | Bloque activo |
| `songPresetDraft.effect_label` | Effect | Efecto |
| `songPresetDraft.footnote` | Value names and scale are estimated from the manual. Check the result on your pedal. | Los nombres y la escala de los valores se estiman a partir del manual. Comprueba el resultado en tu pedal. |
| `songPresetDraft.save` (F31) | Save to song | Guardar en la canción |
| `songPresetDraft.saving` (F31) | Saving… | Guardando… |
| `songPresetDraft.saved` (F31) | “{{name}}” was added to the song. | “{{name}}” se agregó a la canción. |
| `songPresetDraft.export` | Export .prst | Exportar .prst |
| `songPresetDraft.send` | Send to pedal | Enviar al pedal |
| `songPresetDraft.discard` | Discard copy | Descartar copia |
| `songPresetDraft.errors.name_required` | Give the copy a name. | Ponle un nombre a la copia. |
| `songPresetDraft.errors.name_unsupported` | Use up to 16 letters, numbers, spaces or basic symbols. | Usa hasta 16 letras, números, espacios o símbolos básicos. |
| `songPresetDraft.errors.name_duplicate` | This song already has a preset named “{{name}}”. | Esta canción ya tiene un preset llamado “{{name}}”. |
| `songPresetDraft.errors.param_invalid` | Enter a number. | Introduce un número. |
| `songPresetDraft.errors.duplicate_failed` | Couldn't copy this preset. Try again. | No se pudo copiar este preset. Inténtalo de nuevo. |
| `songPresetDraft.errors.limit_reached_save` (F31) | This song reached your plan's preset limit. The copy wasn't saved. | Esta canción alcanzó el límite de presets de tu plan. La copia no se guardó. |
| `songPresetDraft.errors.name_taken` (F31) | Another preset in this song uses this name. Rename the copy and save again. | Otro preset de esta canción usa este nombre. Cambia el nombre de la copia y guarda de nuevo. |
| `songPresetDraft.errors.unreachable` (F31) | Couldn't reach the server. Check your connection and save again. | No se pudo conectar con el servidor. Revisa tu conexión y guarda de nuevo. |
| `songPresetDraft.errors.session_expired` (F31) | Your session expired. Log in again, then save the copy. | Tu sesión expiró. Inicia sesión de nuevo y guarda la copia. |
| `songPresetDraft.errors.song_not_found` (F31) | This song no longer exists. Export the copy to keep it. | Esta canción ya no existe. Exporta la copia para conservarla. |
| `songPresetDraft.errors.rejected` (F31) | The server didn't accept this preset file. Export it to keep your changes. | El servidor no aceptó este archivo de preset. Expórtalo para conservar tus cambios. |
| `songPresetDraft.errors.save_failed` (F31) | The copy wasn't saved. Try again. | La copia no se guardó. Inténtalo de nuevo. |
| `songPresetDraft.leave_title` | Leave without saving the copy? | ¿Salir sin guardar la copia? |
| `songPresetDraft.leave_message` | Your changes to “{{name}}” aren't saved to the song and will be lost. | Tus cambios en “{{name}}” no están guardados en la canción y se perderán. |
| `songPresetDraft.leave_stay` | Keep editing | Seguir editando |
| `songPresetDraft.leave_confirm` | Leave and discard | Salir y descartar |
| `writeToPedal.draft_note` | Sends the unsaved copy “{{name}}”. | Envía la copia sin guardar “{{name}}”. |
