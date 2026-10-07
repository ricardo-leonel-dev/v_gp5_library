# Design — `import_preset_to_pedal` (feature 5)

Layering, error-handling, state and test conventions follow `docs/architecture.md` (§1 layers, §3 Promise
services + signal `error`, §4 signals only, §5 JWT only via `AuthStore`/`authInterceptor`) and
`docs/conventions.md` (standalone components, one folder per component, Transloco for every string, colocated
Vitest specs, `TestBed` with `appConfig.providers` + `provideHttpClientTesting()`). No third-party dialog
library; the dialog reuses the F4 pattern (`fixed inset-0 z-50` backdrop + `role="dialog"` card).

No OD1-NO OD5 are open — see requirements.md "Decisions" and the cross-project dependency below.

## 0. Cross-project dependencies

**Dependency 1 — multi-preset songs** (`done`, F4 §0 dependency 1, backend PR #28, backend F15
`multiple_presets_per_song`). The route `GET /songs/:id/files/preset?sort_order=N` returns the full 507-byte
`.prst` file (`backend/src/index.ts:126-150`, `backend/src/songs/song-service.ts: getSongFile` — confirmed in
`backend/src/index.test.ts:664-722` and `backend/src/songs/song-service.test.ts:546+`). F5 consumes it via the
new `SongsApi.getSongPreset(songId, sortOrder)` (R6, §3).

**No other cross-project dependencies.** F5 does not change `POST /songs`, the read protocol, or the hardware
spec. F26 (`spec_ready`, F26 R25, R31) provides the song-card host and the existing song list on `/songs`.

## Overview

```
/songs  SongsPage (F26)  ── song card → "Send to pedal" button (R3, R53) ──┐
        │                                                                  │
        │                                                       openWriteDialog(song, presets)
        ▼                                                                  ▼
        <app-write-to-pedal-dialog [song] [presets]>                  src/app/songs/
              │ entries (read-only snapshot, R4)
              │   target slot picker (R15-R19)
              │   mode: single | all-in-order (R20-R24)
              │ pure helpers: write-preset-form.ts
              │   buildWritePresetRequest (R6, R13, R28-R30)
              │   mapWriteError (R37, R9-R12)
              ▼
        PedalConnection.writePreset(preset)  (R14, R42-R46)         src/app/midi/
              └─ codec fix: use preset.raw.body verbatim when present (R42)
        SongsApi.getSongPreset(songId, sortOrder)                   src/app/songs/
              └─ GET /songs/:id/files/preset?sort_order=N (R6) → blob → decodePrstFile (R7, R8)
```

The backend client and the pedal connection are two separate concerns (architecture §1) that meet only inside
the dialog (and inside the implementer's test, R47/R48/R49).

## 1. Codec — make `writePreset` byte-exact for `raw` presets (OD5)

Today `encodeWriteRequest(preset)` in `gp5-sysex-preset-codec.ts:543-573` builds the body via
`encodeBody(preset.chain, …)` (`encodeBody` at `:344-394`), which lays down the MODELS record with
`[k, 0, 0, 0]` per block, the BYPASS mask from `chain[k].enabled`, the identity ORDER, and **all-zero PARAMS**
(`gp5-sysex-preset-codec.ts:387-388` — the comment in the file even points at "the write caveat"). Module
identity, parameter values, and every byte of padding between records are lost. That is incompatible with the
acceptance "byte-identical to what was originally saved" because the saved bytes carry real `(fxlow, cat)`
tuples and real `float32` parameters — and F4 design §1's discarded-alternative note explicitly says "F5 can
still extract the exact body at 0x29", which is only meaningful if F5 uses those bytes verbatim.

The fix is one branch in `encodeWriteRequest` (R42 / R43):

```ts
encodeWriteRequest(preset: Preset): Uint8Array[] {
  const payload = new Uint8Array(WRITE_PAYLOAD_LEN);
  payload.set(WRITE_HDR.subarray(0, 4), 0);          // unchanged
  payload[0] = WRITE_HDR[0]; payload[1] = WRITE_HDR[1];
  payload[2] = preset.slot & 0xff; payload[3] = 0; payload[4] = 0; payload[5] = 0;

  const nameOff = WRITE_HDR.length;                 // 6
  const bodyOff = WRITE_HDR.length + NAME_LEN;       // 22

  // R44 — verbatim name field when raw is present, else today's NUL-pad from preset.name.
  if (preset.raw?.nameField.length === NAME_LEN) {
    payload.set(preset.raw.nameField, nameOff);
  } else {
    const nameBytes = new TextEncoder().encode(preset.name);
    for (let i = 0; i < NAME_LEN; i++) payload[nameOff + i] = i < nameBytes.length ? nameBytes[i] : 0;
  }

  // R42 — verbatim body when raw is present, else fall back to encodeBody (R43).
  if (preset.raw?.body.length === GP5_BODY_LEN) {
    payload.set(preset.raw.body, bodyOff);
  } else if (preset.raw) {
    throw new Error('preset_bytes_unavailable');     // R46
  } else {
    encodeBody(preset.chain, payload.subarray(bodyOff));
  }

  // R45 — header, opcode (0x1D), chunking (WRITE_BLOCK_SIZE bytes), CRC, toWire
  // … unchanged from today.
}
```

The header (`WRITE_HDR = [0x11, 0x4F, slot, 0, 0, 0]`), the patch-write opcode (`PATCH_WRITE_CMD = 0x1D`),
the chunk size (`WRITE_BLOCK_SIZE = 19`), the chunk count (`WRITE_BLOCK_COUNT = 26`), the CRC-8/SMBUS per
packet, and the `toWire` framing stay exactly as today. F5 changes only the body / name copy paths inside
`encodeWriteRequest`. The pending-operation guard in `WebMidiPedalConnection.writePreset`
(`web-midi-pedal-connection.ts:198-220`) already serializes concurrent writes, so the dialog can issue
sequential calls (R29-R30) without that layer changing.

**Verification (R47-R49):** the codec spec gets two new test cases — R47 (round-trip with `raw`) and R48
(fallback without `raw`, unchanged bytes). R49 is the manual hardware test on a real GP-5: capture body →
save song → fetch bytes → write to slot → read back → byte-identical. The script is
`progress/gp5_webmidi_backup_all.html` (already used by F4 / F19). If the read-back does not match, **stop and
report** for a spec revision rather than relaxing the acceptance.

**Discarded alternative #2 (revised).** `specs/sysex_preset_read_write/design.md:242-246` (rejected
"Model `Preset` as the raw `Uint8Array` SysEx payload") was partially reversed by F4 (which added
`Preset.raw`); this feature completes the reversal by ensuring the write path consumes those bytes.
Implementer (F5 T1) appends a dated note (2026-10-05) under that discarded alternative saying F5
completes the reversal.

## 2. Saved song → write — domain shape

Pure helpers in `src/app/songs/write-preset-form.ts` (TestBed-free), mirroring `save-song-form.ts`:

```ts
export interface WriteablePresetRef {
  readonly songId: string;
  readonly sortOrder: number;            // 0-based
  readonly presetId: string;             // for the partial-progress list (R39)
  readonly name: string;                 // displayed in the picker + success message
  readonly position: number;             // 1-based, for the UI
}

export interface WriteRequest {
  readonly entries: readonly WriteablePresetRef[];   // ordered, R5
  readonly startSlot: number;                         // M, R15 / R21
  readonly writeAll: boolean;                         // R20
}

export interface WritePlan {
  readonly items: readonly { ref: WriteablePresetRef; targetSlot: number }[];   // R28, R29
  readonly fromSlot: number;
  readonly toSlot: number;
}

export function planWrites(req: WriteRequest): WritePlan;                         // R28-R33: empty + over-range + not-enough-room → throws named errors
export function targetSlotsFor(writeAll: boolean, n: number, m: number): number[]; // returns one slot, or M..M+N-1

// Returns the failure key for a writePreset rejection (R37) or a fetch rejection (R9-R12).
export type WriteErrorKey =
  | 'writeToPedal.errors.pedalDisconnected'
  | 'writeToPedal.errors.busy'
  | 'writeToPedal.errors.timeout'
  | 'writeToPedal.errors.connectionLost'
  | 'writeToPedal.errors.unexpected'
  | 'writeToPedal.errors.songNotFound'
  | 'writeToPedal.errors.sessionExpired'
  | 'writeToPedal.errors.network'
  | 'writeToPedal.errors.corruptFile';
export function mapPedalWriteError(err: unknown): WriteErrorKey;     // for R37, R34
export function mapFetchError(err: unknown): WriteErrorKey;          // for R9-R12
```

`planWrites` is the gate for R21 / R33: throws `Error('not_enough_room')` with `{M, N, available}` when
`writeAll && M + N > 100`, throws `Error('out_of_range')` when `M < 0 || M > 99` (R17), throws
`Error('empty')` when `entries.length === 0` (R51 / R24 defaults to at least one preset; songs cannot have zero
presets per F4 R79). The dialog catches these as the inline messages (R17 / R21) and never lets the user
activate the broken state.

## 3. Backend client — `src/app/songs/songs-api.service.ts`

`SongsApi` (F4, `done`) gains one method:

```ts
getSongPreset(songId: string, sortOrder: number): Promise<Uint8Array> {
  return firstValueFrom(
    this.http.get(`${environment.apiBaseUrl}/songs/${songId}/files/preset?sort_order=${sortOrder}`,
                  { responseType: 'blob' })
  ).then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
}
```

The blob is `arrayBuffer()`'d into a fresh `Uint8Array` (R13's `.slice()` later returns from a subview of
that buffer — fine, we never share it). Errors throw `HttpErrorResponse` and the dialog maps them (R9-R12).
The Bearer token is attached by `authInterceptor`; on 401 the interceptor clears `AuthStore` and a 401 path
maps to `sessionExpired` (R10).

A new helper `decodeSongPreset(bytes: Uint8Array): Preset` lives in the same module (or in
`write-preset-form.ts`) and is the only place outside `src/app/midi/` that knows the body/name offsets —
matching F4's "no other file in `src/` hardcodes them" rule. It calls `decodePrstFile`, slices body/name
freshly, and returns `{ slot: 0, name, chain, raw: { body, nameField } }`. `slot: 0` is a placeholder; the
real `slot` is set per write (R13).

## 4. Dialog component — `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.{ts,html}`

```ts
@Component({ selector: 'app-write-to-pedal-dialog', imports: [TranslocoDirective, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './write-to-pedal-dialog.html' })
export class WriteToPedalDialog {
  readonly song = input.required<Song>();                                     // R3
  readonly presets = input.required<readonly WriteablePresetRef[]>();         // R3, R4
  readonly closed = output<void>();
  readonly selectedSortOrder = signal<number>(0);                             // default first preset
  readonly slotInput = signal<string>('0');                                   // R18
  readonly writeAll = signal<boolean>(false);                                 // R24
  readonly connectionState = inject(WebMidiPedalConnection).connectionState;  // R25
  readonly submitting = signal<boolean>(false);                               // R31
  readonly failure = signal<WriteErrorKey | null>(null);                      // R8-R12, R34, R37, R39
  readonly partialProgress = signal<readonly number[]>([]);                   // R39
  readonly success = signal<WritePlan | null>(null);                          // R36, R38
  readonly parsedSlot = computed<number | null>(() => {                       // R15-R17, R21
    const s = this.slotInput().trim();
    if (!/^[0-9]+$/.test(s)) return null;
    const n = Number(s);
    if (n < 0 || n > 99) return null;
    return n;
  });
  readonly plan = computed<WritePlan | null>(() => {
    const m = this.parsedSlot();
    if (m === null) return null;
    try {
      return planWrites({
        entries: this.presets(),
        startSlot: m,
        writeAll: this.writeAll(),
      });
    } catch { return null; }
  });
  readonly canSend = computed(() => this.parsedSlot() !== null && this.plan() !== null && !this.submitting() && this.connectionState() === 'connected');
  onSlotInput(ev: Event): void; onWriteAllChange(ev: Event): void;
  async submit(): Promise<void>;       // R28-R30, R34, R36-R41
  onClose(): void;                      // R36 (success), R30 (submitting blocks it)
  @HostListener('document:keydown.escape') onEscape(): void;  // ignored while submitting (R32)
}
```

The submit handler (R28-R41) implements the sequential pipeline:

1. **Plan** from the current picker value; if null, return (the button is disabled anyway, R16/R17/R21).
2. Set `submitting=true` and `failure=null`.
3. For each `item` in `plan.items` (R29):
   - `bytes = await songsApi.getSongPreset(song.id, item.ref.sortOrder)` (R6).
   - `decoded = decodeSongPreset(bytes)` — on decode reject, set `failure = 'writeToPedal.errors.corruptFile'`,
     abort (R8).
   - On `connectionState` changing to `not-connected` / `error`, set
     `failure = 'writeToPedal.errors.connectionLost'`, abort (R34).
   - `await pedal.writePreset({ ...decoded, slot: item.targetSlot })` (R13-R14).
   - On reject: `failure = mapPedalWriteError(err)`, set `partialProgress` to the slots already written
     (R39), abort.
   - Push `item.targetSlot` onto `partialProgress`.
4. On full success: `success = plan` (R36 or R38 based on `plan.items.length`).
5. `submitting = false`; if the user is still on the form (failure / partial), `canSend` flips back to true
   on the next render (R41).

`submit()` never throws. The catch wraps every step (R37 / R39).

The "Connect to GP-5" reminder (R25) is a single line of muted text + the connect button (`PedalConnectFlow`
exists for the app header in F26 — reuse the same component / service). The dialog never initiates a connect
(R26); the user does that from the header.

Focus: `afterNextRender` focuses the picker on open; on success / close, focus returns to the "Send to pedal"
button that opened the dialog (the page-side pattern F4 already does with `queueMicrotask`). The escape /
backdrop ignore-while-submitting rule (R32) reuses the F4 dialog component's exact pattern.

`role="dialog"`, `aria-modal="true"`, `aria-labelledby` → the title, the picker has `aria-describedby` →
`writeToSlot.help` (R19), and the failure / partial-progress region is `role="alert"`. Errors are
translated via Transloco (`*transloco="let t"` + `t('writeToPedal.errors.x')`) — every new key lives in both
`public/i18n/{es,en}.json` (R50, parity test
`src/app/songs/i18n-parity.spec.ts` copies F4's helper).

## 5. Library page integration — song card action

`SongsPage` (F26) hosts the dialog. Each `data-testid="song-card"` gets a "Send to pedal" button
(`data-testid="song-card-send-to-pedal"`, type="button") right of the title row, styled as the
"select/deselect" pill pattern from F4 (indigo ring on white background in light mode,
slate-900-on-indigo-400 in dark mode — already in the app, see F4 R174-R176). The button's click handler
opens the dialog with:

```ts
this.writeDialog.set({ song, presets: orderedPresets(song.presets).map(toWriteablePresetRef) });
```

— `orderedPresets` is F26's pure helper; `toWriteablePresetRef` lives in `write-preset-form.ts` and maps
each `SongPreset` to `{ songId, sortOrder, presetId, name, position }` (R5). The button uses
`click.stopPropagation()` (R53) so the card's R25 navigation does not fire.

`SongsPage` renders one `<app-write-to-pedal-dialog [song] [presets]>` when the dialog state is non-null.
The dialog emits `closed` → page clears the state → focus returns to the originating button
(`viewChild` + `queueMicrotask`, F4 R32 idiom).

While the library page is in `songs-loading` / `songs-error` / `songs-session-expired` (R54) the song cards
do not render and so the button is not shown — there is nothing to write from.

## 6. Files touched

| File | Change |
|---|---|
| `src/app/midi/gp5-sysex-preset-codec.ts` (+ spec) | `encodeWriteRequest`: copy `preset.raw.body` verbatim when present (R42); copy `preset.raw.nameField` verbatim when present (R44); throw `preset_bytes_unavailable` for `raw.body.length !== 466` with `raw` set (R46); keep encodeBody fallback (R43). No header / chunking / CRC change (R45). |
| `src/app/midi/gp5-sysex-preset-codec.spec.ts` | R47 (verbatim body + name), R48 (fallback unchanged). |
| `src/app/songs/song.ts` | re-export `WriteablePresetRef`? No — keep it in `write-preset-form.ts`. (No change.) |
| `src/app/songs/songs-api.service.ts` (+ spec) | `getSongPreset(songId, sortOrder): Promise<Uint8Array>` (R6). |
| `src/app/songs/write-preset-form.ts` (+ spec) | new — `WriteablePresetRef`, `WriteRequest`, `WritePlan`, `planWrites`, `targetSlotsFor`, `mapPedalWriteError`, `mapFetchError`, `decodeSongPreset` (R13). |
| `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.{ts,html}` (+ spec) | new — dialog (R3-R41). |
| `src/app/songs/songs-page/songs-page.{ts,html}` | "Send to pedal" button on each song card, dialog host, R25 navigation `stopPropagation` (R3, R53, R54). |
| `src/app/songs/i18n-parity.spec.ts` | extend with `writeToPedal` + `writeToSlot` namespaces (R50). |
| `public/i18n/es.json`, `public/i18n/en.json` | `writeToPedal`, `writeToSlot` namespaces (R50, copy in §Visual direction). |
| `specs/sysex_preset_read_write/design.md` | one dated (2026-10-05) note under discarded alternative #2 — F5 completes the partial reversal F4 began (see §1). |
| `progress/impl_import_preset_to_pedal.md` | R49 SHA-256 evidence (three hashes: captured, saved, read-back). |

Not touched: `WebMidiPedalConnection.writePreset` (the pending-operation guard already serializes), F4's
dialog, the read path, the F26 detail page, the F4 plan / POST /songs, anything in `src/app/pedals/`.

## 7. Error paths

- `decodePrstFile` rejects the fetched bytes → `corruptFile` (R8); the bytes never enter the write path.
- `writePreset` rejects with `not_connected` → `pedalDisconnected` (R37) — the dialog re-renders the form so
  the user can retry after reconnecting.
- `writePreset` rejects with `request_in_progress` → `busy` (R37); transient — the existing single-write
  serialization in `WebMidiPedalConnection` makes this near-impossible in normal flow, but the dialog
  surfaces it.
- `connectionState` flips to `not-connected` mid-sequence → `connectionLost` (R34); the partial progress is
  shown, no rollback (R40).
- Backend fetch fails (404 / 401 / 0 / other) → mapped per R9-R12; the bytes never enter the write path.
- An unreachable `songId` from the page (deleted while the dialog is open — unlikely with R4, but the API
  may 404) → R9.
- An empty entry list (impossible through the UI — songs always have ≥1 preset per F4 R79) → defensive
  `Error('empty')` from `planWrites`; the dialog never enables the "Send" button.

## Discarded alternatives

1. **Send a `.prst` File via a host-OS MIDI utility from a `<a download>` link instead of using
   `writePreset`.** Rejected: the spec's protocol is `PedalConnection.writePreset()` (the project's interface
   for talking to the pedal); the user opens the GP-5's MIDI utility externally only as a fallback.
2. **Edit the F4 `Preset.raw` shape to store an extra `targetSlotHint`.** Rejected: the CORRECTION note
   (2026-10-02) is explicit — no origin slot is stored, the user picks freely; the UI picker is the only
   source of the target slot.
3. **Re-synthesize the body from `preset.chain` (today's `encodeBody`).** Rejected: the acceptance is
   "byte-identical to what was originally saved"; the synthesized body loses module identity, parameter
   values, and per-record padding (R42).
5. **Re-read the saved body from the pedal before writing** (`readPresets` then `writePreset`). Rejected:
   needs a live pedal read, switches the active preset ~300 ms × N, and may differ from what the user saved
   (unsaved pedal edits). The backend's stored bytes are the single source of truth.
6. **Detail-page entry point on `/songs/:id`.** Rejected (OD4): F26 is `spec_ready` but its detail page is
   not yet built; putting the action on the song card on the library page makes F5 independent of F26
   landing and gives the user a discoverable one-click action on every saved song. F26 may add the same
   button to the detail page later without coordination.
7. **Write to non-consecutive slots in multi mode (one slot per preset, freely).** Rejected (OD2): the
   "consecutive" rule keeps the UI to a single slot picker; the user who wants non-consecutive targets can
   repeat the single-preset mode N times. Open follow-up for F27+ if needed.
8. **Bundle every preset into one `writePreset` call (extend the protocol).** Rejected: the GP-5 protocol is
   one preset per `cmd 0x1D` exchange; the implementer just sequences the existing calls (R29-R30).
9. **Run a manual hardware test only at code-review time.** Rejected: byte identity is the acceptance
   criterion (OD5, F49); the test must run before `mark-spec-ready` so any divergence surfaces as a spec
   revision, not a regression in production.

## Visual direction

Written by hand by the spec author (frontend-design skill loaded; this dialog is small enough to reuse the
app's established language rather than invent a new look). The app already has a settled language — slate
neutrals, indigo action color, `rounded-lg` / `rounded-md`, dashed borders for "optional / add". The dialog
reads as one more card in the same family as F4's save-song dialog (centered `max-w-md`, no bottom sheet —
this dialog is small and has no scroll body).

**The one memorable element: the chain of presets.** The dialog opens on the song's ordered preset list, one
row per preset showing its 1-based position and name, with the picker and mode toggle directly below it. The
list is read-only here (ordering is fixed by the song) but it visually re-states the song's structure so the
user can confirm "I'm about to send presets 1, 2, 3 to slots 0, 1, 2" before pressing Send. One emerald
success mark and one red failure banner — both taken from the app's existing palette.

### Palette (literal class strings)

| Element | Classes |
|---|---|
| Backdrop (`data-testid="write-to-pedal-backdrop"`) | `fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4` |
| Card (`data-testid="write-to-pedal-card"`, `role="dialog"`) | `flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800` |
| Header | `flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5` |
| Title `<h2>` | `text-base font-semibold text-slate-900 dark:text-slate-100` |
| Close button (icon ×, `aria-label` `writeToPedal.close`) | `-mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| Body | `flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5` |
| Song name heading | `text-sm font-medium text-slate-900 dark:text-slate-100` (`t('writeToPedal.song_heading', {name})`) |
| Preset list `<ol>` (`data-testid="write-to-pedal-presets")`) | `divide-y divide-slate-200 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 dark:divide-slate-700 dark:bg-slate-900 dark:ring-slate-700` |
| Preset list row `<li>` (`data-testid="write-to-pedal-preset-row"`) | `grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-2 px-3 py-2`; position `pt-px text-right text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500` (`aria-hidden="true"`); name `truncate text-sm text-slate-900 dark:text-slate-100`; selected mark (R36) — right-most cell, `data-` size="4" rounded-full, `bg-indigo-600 text-white dark:bg-indigo-400 dark:text-slate-900` with a 12px check SVG |
| Preset-row selected (single-mode active, R36) | `bg-indigo-50 dark:bg-indigo-950/30` (`aria-current="true"`); checkbox via `[aria-pressed]` is replaced by the click-to-select pattern: tapping a row selects it (single mode only) and the page-side store re-emits `selectedSortOrder` |
| Preset picker label | `block text-sm font-medium text-slate-700 dark:text-slate-300` (`t('writeToPedal.target_slot')`) |
| Slot input (`data-testid="write-to-pedal-slot-input"`, `inputmode="numeric"`, `pattern="[0-9]*"`, `aria-describedby="write-to-pedal-slot-help"`) | `mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100`; invalid append `border-red-500 dark:border-red-400 aria-invalid:true` |
| Slot help (`id="write-to-pedal-slot-help"`) | `mt-1 text-xs text-slate-500 dark:text-slate-400` (`t('writeToSlot.help')`) |
| Slot inline error | `mt-1 text-xs text-red-600 dark:text-red-400` (`t('writeToSlot.errors.outOfRange' \| 'notEnoughRoom', {N, available})`) |
| Mode toggle row | `flex items-center gap-2` |
| Mode toggle button (`data-testid="write-to-pedal-write-all"`, `type="button"`, `aria-pressed="…"`) | not active `rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`; active `rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300`; both carry a `<span aria-hidden="true">+</span>` for the active state and `aria-pressed` for screen readers |
| Mode summary (`data-testid="write-to-pedal-range"`, only when mode active, R22) | `rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700` (`t('writeToSlot.summary_range', {from, to})`) |
| Not-connected reminder (`data-testid="write-to-pedal-not-connected"`, `role="status"`, R25) | `rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700` with the connect button reused from the app header |
| Failure banner (`role="alert"`, `data-testid="write-to-pedal-failure"`, R37/R39) | `rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900`; partial progress line (`data-testid="write-to-pedal-partial"`) `mt-1 text-xs text-red-700/80 dark:text-red-300/80` (`t('writeToPedal.partialProgress', {slots})`) |
| Footer | `flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:flex-row sm:justify-end sm:px-5` |
| Cancel | `w-full rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-auto` |
| Send (`data-testid="write-to-pedal-submit"`) | `w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:w-auto`; while submitting the label switches to `writeToPedal.writing` (`data-testid="write-to-pedal-submitting"`) |
| Success panel (`data-testid="write-to-pedal-success"`) | `flex flex-col items-center gap-3 px-4 py-8 text-center` |
| Success mark | `flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300` with a 16px check SVG (`aria-hidden="true"`) |
| Success heading | `text-base font-semibold text-slate-900 dark:text-slate-100` (`t('writeToPedal.success_title')`) |
| Success body | `text-sm text-slate-600 dark:text-slate-400` (`t('writeToPedal.success_single', {toSlot, presetName})` or `'success_multi', {from, to, count, songName}`) |
| Close (success) | `rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600` (`data-testid="write-to-pedal-close"`, label `writeToPedal.done`) |
| Song-card "Send to pedal" button (`data-testid="song-card-send-to-pedal"`, `type="button"`, R3 / R53) | `inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-slate-900 dark:text-indigo-300 dark:ring-indigo-400 dark:hover:bg-slate-800` (same shape as F4's select toggle) |

### Type

App default sans (no new font). One scale: `text-base` title, `text-sm` field labels + names + buttons, `text-xs`
helpers and partial-progress line. Sentence case throughout; no `→` on buttons; no uppercase eyebrows; the
song name appears as a regular heading (`text-sm font-medium`), not as a tracked-out label.

### Layout per breakpoint

The dialog is small (no scroll body expected on a normal song), so the same `max-w-md` centered card works at
every breakpoint. There is **no bottom sheet** — F4's full-screen `items-end` is for a long form; F5's form
fits comfortably centered at 375px and 1280px.

```
≥ 375px and ≥ 1280px (single layout — `max-w-md` centered card)
┌──────────────────── max-w-md ─────────────────────┐
│ Enviar al pedal                          ×     │
├──────────────────────────────────────────────────┤
│ Canción: «Lead Tones»                            │
│ Presets                                           │
│ ┌──────────────────────────────────────────────┐ │
│ │ 1  TL DLX AMP                              ✓ │ │ ← selectedSortOrder mark
│ │ 2  Lead Solo                                │ │
│ │ 3  Crunchy Clean                            │ │
│ └──────────────────────────────────────────────┘ │
│ Slot de destino                                   │
│ [0    ] (0..99)                                  │
│ (Escribir todos en orden →) +                    │  ← mode toggle (R20-R24)
│ Slots 0..2 — 3 presets                           │  ← summary (only when active, R22)
│ (o recordatorio "Conecta el GP-5")               │  ← R25 reminder
│ ┌──────────────────────────────────────────────┐ │
│ │ Error: el pedal no responde…                 │ │  ← failure banner (R37/R39)
│ │ Ya escribiste los slots 0, 1                 │ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│                                  [Cancelar][Enviar] │
└──────────────────────────────────────────────────┘
```

The selected preset row gets a faint indigo tint (`bg-indigo-50 dark:bg-indigo-950/30`) and a small
filled check at the right edge; in single mode (R23, default) tapping another row moves the check. In
multi mode (R20) the check is hidden and the slot picker + summary carry the per-row write mapping.

### Interaction states

- **Hover**: indigo-500 on Send, slate-100/700 on Cancel, slate-200/700 on close ×, indigo-50 on the song-card
  action button. No hover on the preset rows (they are not buttons).
- **Focus**: every interactive element shows `focus-visible:outline-2` indigo (the picker uses
  `outline-offset-0`). After Send, focus stays on Send until the success panel renders; then focus moves to
  the "Close" button (R36).
- **Invalid**: red border + `aria-invalid` + red inline text under the picker (R17, R21). The Send button is
  disabled.
- **Disabled**: Send is disabled for invalid slot (R16/R17/R21), not connected (R25), or while submitting
  (R31). Cancel is disabled only while submitting (so the dialog stays open, R32).
- **Submitting**: Send label switches to `writeToPedal.writing` and the spinner (or just the new label, if
  no spinner is desired); the form is locked; Escape / backdrop are ignored (R32); on success the panel
  replaces the form; on failure the form comes back with the failure banner (R37, R41).

### Motion

None. The dialog appears and disappears instantly (like F4's picker overlay and save-song dialog). The
success / failure panels are instant swaps — the user pressed the button, they expect an answer.

### Copy (es default / en)

| key | es | en |
|---|---|---|
| `writeToPedal.open` | Enviar al pedal | Send to pedal |
| `writeToPedal.title` | Enviar al pedal | Send to pedal |
| `writeToPedal.close` | Cerrar | Close |
| `writeToPedal.song_heading` | Canción: «{{name}}» | Song: “{{name}}” |
| `writeToPedal.presets_legend` | Presets de la canción | Presets in this song |
| `writeToPedal.preset_row_aria` | Posición {{position}}: {{name}} | Position {{position}}: {{name}} |
| `writeToPedal.preset_selected_aria` | Seleccionado | Selected |
| `writeToPedal.target_slot` | Slot de destino | Target slot |
| `writeToSlot.help` | 0..99 (entero entre 0 y 99) | 0..99 (integer between 0 and 99) |
| `writeToSlot.errors.outOfRange` | El slot debe estar entre 0 y 99. | The slot must be between 0 and 99. |
| `writeToSlot.errors.notEnoughRoom` | «{{N}}» presets no caben desde el slot {{M}} (quedan {{available}} slots). | {{N}} presets do not fit starting at slot {{M}} (only {{available}} slots left). |
| `writeToSlot.summary_range` | Slots {{from}}..{{to}} — {{count}} presets | Slots {{from}}..{{to}} — {{count}} presets |
| `writeToPedal.write_all` | Escribir todos en orden | Write all in order |
| `writeToPedal.write_all_help` | Envía los presets de la canción a slots consecutivos empezando por el de destino. | Sends the song's presets to consecutive slots starting at the target slot. |
| `writeToPedal.not_connected` | Conecta el GP-5 desde el encabezado para poder escribir. | Connect your GP-5 from the header to write to the pedal. |
| `writeToPedal.cancel` | Cancelar | Cancel |
| `writeToPedal.send` | Enviar | Send |
| `writeToPedal.writing` | Enviando… | Sending… |
| `writeToPedal.success_title` | Listo | Done |
| `writeToPedal.success_single` | «{{presetName}}» ya está en el slot {{toSlot}} del pedal. | “{{presetName}}” is now on slot {{toSlot}} of the pedal. |
| `writeToPedal.success_multi` | {{count}} presets de «{{songName}}» ya están en los slots {{from}}..{{to}}. | {{count}} presets of “{{songName}}” are now on slots {{from}}..{{to}}. |
| `writeToPedal.partialProgress` | Ya escribimos los slots: {{slots}}. | Already wrote slots: {{slots}}. |
| `writeToPedal.done` | Cerrar | Close |
| `writeToPedal.errors.pedalDisconnected` | El pedal se desconectó. Vuelve a conectarlo y reintenta. | The pedal disconnected. Reconnect it and try again. |
| `writeToPedal.errors.busy` | El pedal está ocupado. Espera un momento y reintenta. | The pedal is busy. Wait a moment and try again. |
| `writeToPedal.errors.timeout` | El pedal no respondió a tiempo. Reintenta. | The pedal didn't respond in time. Try again. |
| `writeToPedal.errors.connectionLost` | El pedal se desconectó mientras escribíamos. Ya guardamos algunos presets; revisa el pedal antes de reintentar. | The pedal disconnected mid-write. Some presets were already saved; check the pedal before retrying. |
| `writeToPedal.errors.unexpected` | No se pudo escribir en el pedal. Vuelve a intentarlo. | Couldn't write to the pedal. Try again. |
| `writeToPedal.errors.corruptFile` | El servidor devolvió un preset dañado. Vuelve a leerlo. | The server returned a damaged preset. Re-read it. |
| `writeToPedal.errors.songNotFound` | Esta canción ya no está en tu biblioteca. | This song is no longer in your library. |
| `writeToPedal.errors.sessionExpired` | Tu sesión caducó. Inicia sesión de nuevo. | Your session expired. Please log in again. |
| `writeToPedal.errors.network` | No se pudo contactar con el servidor. Revisa tu conexión y vuelve a intentarlo. | Couldn't reach the server. Check your connection and try again. |
| `writeToPedal.login_link` | Iniciar sesión | Log in |

The `songs.card.send_to_pedal` button label is reused on the song card (added to the `songs` namespace as a
single key, since F26 owns `songs.*`):

| key | es | en |
|---|---|---|
| `songs.card.send_to_pedal` | Enviar al pedal | Send to pedal |
| `songs.card.send_to_pedal_aria` | Enviar al pedal la canción «{{name}}» | Send song “{{name}}” to the pedal |