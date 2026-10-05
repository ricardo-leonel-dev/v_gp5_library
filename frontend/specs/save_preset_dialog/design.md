# Design — `save_preset_dialog` (feature 4)

Layering, error-handling, state and test conventions follow `docs/architecture.md` (§1 layers, §3 Promise
services + signal `error`, §4 signals only, §5 JWT only via `AuthStore`/`authInterceptor`) and
`docs/conventions.md` (one standalone component per folder, Transloco for every string, colocated Vitest specs,
`TestBed` with `appConfig.providers` + `provideHttpClientTesting()`). This file only records choices made inside
those boundaries. No question is open: OQ1 and OQ4-OQ8 are resolved and OQ2/OQ3 were withdrawn (see the
"Decisions" section at the top of `requirements.md`).

Revision history: 2026-10-02 Rev 1 (no mock gate, test mode for mocks, `pedal_preset_name` always sent,
`pedal_slot` added). 2026-10-02 Rev 2 (a song owns an ordered set of 1..N presets, each an independent byte copy
with reference-only metadata; backend dependency 1). **2026-10-02 Rev 3** (`progress/f4_brief.md` "Revision 3",
binding): success = every uploaded `.prst` is a valid installable GP-5 file; second entry point "add `.prst`
file" with strict validation; no two presets with the same name in a song; plan-tier limits read from the backend
(dependency 2); the reference `.prst` is a commercial ToneLab preset, not something the pedal produced.
**2026-10-02 Rev 4** (`progress/f4_brief.md` "Revision 4", binding): `pedal_slot` dropped entirely (no field, no
`presetSlotLabel` helper, no slot in the dialog's copy) — a preset can be installed in any slot any number of
times, so its origin slot is not relevant data; OQ6 (`GET /me/plan` shape), OQ7 (402 codes) and OQ8 (exact,
case-sensitive name match after trim) accepted as proposed.
**2026-10-05 Rev 5** (contract alignment only; source `progress/f4_rev5_backend_contract.md`, backend main
checkout at `04eda42`): (a) `GET /me/plan` is nested `{plan, limits:{songs, presetsPerSong}, usage:{songs}}` —
OQ6/R53 text, §0, §3 (`parsePlanLimits` maps nested wire → the unchanged flat internal `PlanLimits`), T18/T19
fixtures; (b) `pedal_preset_name` dropped from the request (the backend ignores it and reads names from the
`.prst` bytes) — R85 withdrawn and replaced by "SHALL NOT contain `pedal_preset_name`", §0 alignment note, §4
`buildSongFormData` order/invariants, T1/T20/T27/T40/T49 assertions, discarded alternatives 13 and 22; (c) 400
strings — `exactly one preset file is required` → `at least one preset file is required` (R98, §5), new pattern
row `preset file at position ${i} has no readable GP-5 preset name` → new key `presetNameUnreadable` with
`position` (R108, §5, Copy, T28/T29/T41/T46), R104 excludes R108; (d) backend paths point to the main checkout,
both dependencies `done` (backend F15 is `multiple_presets_per_song`, not the predicted name), T1 shrunk to a
re-verification; (e) backend-readable names: the backend's `readPresetName` is stricter than `decodePrstFile`,
so a preset with a blank or non-printable-ASCII name passed the dialog and was rejected by the server — new
pure helper `isReadablePrstNameField` in `gp5-prst-file.ts` mirrors it exactly (R109-R113, §1),
`PrstDecodeResult` gains `nameReadable`, `SongPresetEntry` gains `nameReadable`, `tryAppendEntry` and
`validateSaveSongDraft` reject unreadable names at add/pick time and at submit (R114-R118, §4), new key
`saveSong.errors.presetNameUnsupported` (Copy), discarded alternatives 24-25, tasks T50-T56; R108 stays as the
server-side fallback. Nothing else changed.

## 0. Cross-project dependencies

Both are in project `v_gp5_library-backend`, main checkout
`/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend` (branch `dev`). **Both are `done`** as of
Revision 5 (verified at commit `04eda42`, `progress/f4_rev5_backend_contract.md`).

### Dependency 1 — multi-preset songs (`done`)

**Finished backend** (`src/songs/parse-multipart.ts`, `src/songs/song-service.ts` `createSong`) accepts 1..N
`preset` parts (order = `sort_order`; none → 400 `at least one preset file is required`). `parse-multipart.ts`
reads only `name`, `artist`, `extra_config`, `preset`, `ir`, `nam`, `cover`; each preset's name is derived from
its bytes (`readPresetName`: `GP-5` magic, printable ASCII up to the first NUL at `0x19..0x28`, non-blank) and
stored as `song_files.pedal_preset_name` — a preset without a readable name is a 400 `preset file at position
${i} has no readable GP-5 preset name` (0-based `i`). The request this feature sends (R79-R85) relies on:

- Notion: https://app.notion.com/p/Multiple-presets-per-song-with-per-preset-reference-metadata-3eddef9a37cd81ea952dccc2d5cdf68e
- Backend feature 15 **`multiple_presets_per_song`** (PR #28) — not the predicted
  `multiple_presets_per_song_with_per_preset_reference_metadata`.
- Card acceptance (summary, as written on the card; item 2 was superseded by the finished backend — see the
  Rev 5 note below):
  1. `POST /songs` accepts 1..N `preset` File parts; order sent = `sort_order`.
  2. Per-preset metadata via repeatable text fields aligned by order: `pedal_preset_name` (the card also
     defines an optional `pedal_slot`, which F4 **does not send** — Rev 4); 400 if more metadata entries than
     preset parts.
  3. Song DTO and `GET /songs`, `GET /songs/:id` return presets ordered by `sort_order` with their metadata.
  4. `GET /songs/:id/files/preset?sort_order=n` returns each preset's raw bytes.
  5. Existing single-preset songs and the song-level `pedal_preset_name` keep working.
  6. No endpoint mutates presets of an existing song.
- **Rev 5 — no metadata fields are sent.** The finished backend does not read `pedal_preset_name` (nor
  `pedal_slot`); it derives each name from the `.prst` bytes. F4 therefore sends only `preset` parts (R85 now
  forbids `pedal_preset_name`), so there is no field-alignment question at all. Nothing is lost: names in F4 are
  not user-editable, and the bytes already carry the right name at `0x19` (pedal: `raw.nameField` verbatim, R7;
  file: validated bytes unchanged, R18). The 400 strings are listed in R98/R108 and §5. The response is only
  read for `name` (R96).

### Dependency 2 — plan tiers and limits (`done`)

- Notion: https://app.notion.com/p/Plan-tiers-songs-and-presets-per-song-limits-3eddef9a37cd81c3ba06e3c04c108f6d
- Backend feature 14 `plan_tiers_songs_and_presets_per_song_limits` (PR #29), as predicted.
- Card acceptance (summary):
  1. Plans free / basic / premium: free ≤ 1 song, ≤ 1 preset/song; basic ≤ 2 songs, ≤ 2 presets/song; premium
     unlimited.
  2. `POST /songs` returns 402 with a distinct, stable machine-readable `code` per limit (e.g. `{error, code:
     'plan_song_limit' | 'plan_preset_limit', plan, limit}`) when exceeded; nothing persisted.
  3. A read endpoint (e.g. `GET /me` or `GET /me/plan`) returns the caller's plan and both limits (`null` =
     unlimited) plus the current song count.
  4. Soft-deleted songs do not count. 5. Existing data migrates; limits apply only to new writes. 6. Tests per
     tier boundary.
- Finished backend (`src/plans/plan-service.ts` `getPlanSummary`, route `GET /me/plan` in `src/index.ts`):
  `{ plan: 'free'|'basic'|'premium', limits: { songs: number|null, presetsPerSong: number|null }, usage: { songs:
  number } }` (`null` = unlimited; `usage.songs` counts live, non-soft-deleted songs); 404 `{error:'user not
  found'}`. Rev 4 had pinned a flat `{plan, songLimit, presetsPerSongLimit, songCount}`; Rev 5 adopts the
  backend's nested shape on the wire and keeps the flat shape internally (§3). 402 body and codes match OQ7
  unchanged: `{error, code: 'plan_song_limit' | 'plan_preset_limit', plan, limit}`.
- The server stays authoritative: client caps (R54-R56) are a convenience; a 402 is always mapped (R99-R101).
  The old message-regex mapping (`plan 'free' is limited to 10 songs`) is dropped — the card replaces that limit.

### Gate

Not needed: both backend features are `done` (Rev 5), so no `block` is needed. Should a later backend change regress
the contract, the leader would block with `BLOCKED_ON: path=/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend
feature=multiple_presets_per_song` (or `plan_tiers_songs_and_presets_per_song_limits`) per AGENTS.md §8. T1
re-verifies the finished backend against `progress/f4_rev5_backend_contract.md` before any code.

## Overview

```
PresetBrowserPage (pedals/)                                   src/app/midi/
  chip row ──"Save as song"──► saveDialog snapshot {initial[], available[], testMode}  (R24-R27)
                                        │
                                        ▼
  <app-save-song-dialog [initialPresets] [availablePresets] [testMode]>  (songs/)
        │ entries = signal<readonly SongPresetEntry[]>   (pedal | file)
        │   pedal ──encodePrstFile(p)──────────────────────► gp5-prst-file.ts
        │   file  ◄─decodePrstFile(bytes)  (validate, name, chain)
        │ pure helpers: save-song-form.ts (entries ops, validate, detectUserSlots, buildSongFormData)
        ▼
  PlanApi.getMyPlan() ──GET /me/plan──► backend   (caps, warning; R53-R59)
  SongsApi.createSong(FormData) ──POST /songs──► backend      errors ──► mapSaveSongError (save-song-errors.ts)
```

The pedal side and the backend side still meet only in components (`docs/architecture.md` "Data Flow"): the
dialog receives `Preset` objects and files, and calls `SongsApi` / `PlanApi`; it never touches `PedalConnection`.

## 1. `src/app/midi/` — raw bytes and the `.prst` format

### Raw bytes (reverses a prior decision)

`Preset` gains an optional, opaque `raw` field:

```ts
// src/app/midi/preset.ts
export interface PresetRaw {
  /** 466-byte GP-5 body exactly as the pedal sent it (echo stripped). Never mutated. */
  readonly body: Uint8Array;
  /** The slot's 16-byte name record from the names reply, verbatim. Never mutated. */
  readonly nameField: Uint8Array;
}
export interface Preset {
  slot: number;
  name: string;
  chain: PresetSlot[];
  raw?: PresetRaw;
}
```

Optional so every existing `Preset` literal across F2/F3/F14/F17 keeps compiling; absence is a first-class state
the UI handles (R22, R24, R25). Mock presets never get `raw`; they are handled by test mode (§2, §6).

**Recorded reversal.** `specs/sysex_preset_read_write/design.md:242-246` (discarded alternative #2) rejected
"Model `Preset` as the raw `Uint8Array` SysEx payload". **This feature partially reverses that decision**
(Ricardo, 2026-10-02, brief decision 1, reaffirmed in Revision 3):

- Why: an uploaded pedal preset is only guaranteed valid and installable if its body is exactly what the pedal
  returned. The codec's `encodeBody` is "unverified / best-effort GP-50-derived"
  (`gp5-sysex-preset-codec.ts:336-339`), so decode→encode is not byte-exact; the bytes must be kept.
- What stays true: the decoded domain object (`slot`/`name`/`chain`) remains the primary shape and **only
  `src/app/midi/` interprets bytes**. Code outside `midi/` may only (a) test `preset.raw` for presence, (b) pass a
  preset to `encodePrstFile`, (c) pass a picked file's bytes to `decodePrstFile` and carry the returned `bytes`
  opaquely to the request. No code outside `midi/` reads or builds offsets.
- T2 appends a dated note under that discarded alternative pointing here.

### Codec changes (`src/app/midi/gp5-sysex-preset-codec.ts`)

- `decodeNames(blob)` additionally returns the raw 16-byte name record per slot:
  `{ names: Map<number,string>; nameFields: Map<number, Uint8Array> }` (each field `blob.slice(i+4, i+20)`, a
  copy). Keep both maps on the instance (`namesMap`, `nameFieldsMap`) and clear both where `namesMap` is cleared.
- In `decodeIncomingMessage`, after `decodeBody(...)`:
  `preset.raw = { body: body.slice(), nameField: this.nameFieldsMap?.get(slot)?.slice() ?? new Uint8Array(16) }`.
  `.slice()` satisfies R3. A missing name record falls back to 16 zero bytes, mirroring the `slot${n}` fallback.
- Export the existing private `crc8` (`:133`) and export the existing private `decodeBody` as
  `decodeGp5Body(body, name, slot)` (thin re-export, no behavior change) so `gp5-prst-file.ts` reuses them (R19).
- `WebMidiPedalConnection.readPresets()` already passes `result.preset` through — R4 needs only a test.
- Per F19 (`gp5-module-vocabulary.ts:11-12`), a read of the active preset reflects its **unsaved** edits on the
  pedal. That is what the pedal returned, so it is what gets saved.

### `.prst` module (`src/app/midi/gp5-prst-file.ts`, new) — the only place that knows the layout

```ts
export const GP5_PRST_LEN = 507;
export const GP5_PRST_HEADER: readonly number[] = [0x47,0x50,0x2d,0x35, 0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0x01, 0x00]; // 20 bytes, 01 at 0x12 (ToneLab reference file)
export function encodePrstFile(preset: Preset): Uint8Array;        // throws Error('preset_bytes_unavailable') (R11)

export type PrstFileError = 'wrong_length' | 'bad_header' | 'bad_sentinel' | 'bad_crc';
export type PrstDecodeResult =
  | { ok: true; name: string; chain: PresetSlot[]; bytes: Uint8Array; nameReadable: boolean } // nameReadable: Rev 5
  | { ok: false; error: PrstFileError };
export function decodePrstFile(bytes: Uint8Array): PrstDecodeResult; // pure, never throws (R12-R19)

// Rev 5 — mirrors backend readPresetName (backend/src/songs/prst-name.ts) on the 16-byte name field (R109-R113)
export function isReadablePrstNameField(field: Uint8Array): boolean;
```

**`isReadablePrstNameField` (Rev 5, the single frontend copy of the backend name rule).** Pure, never throws:

```ts
if (field.length !== 16) return false;                     // R113 (pedal raw.nameField / file 0x19..0x28 are 16)
let end = 0; while (end < 16 && field[end] !== 0x00) end++; // name = bytes before the first NUL (all 16 if none)
if (end === 0) return false;                               // empty (R111)
let nonSpace = false;
for (let i = 0; i < end; i++) {
  const b = field[i];
  if (b < 0x20 || b > 0x7e) return false;                  // R110: control bytes, 0x7f, any byte >= 0x80 (é, UTF-8)
  if (b !== 0x20) nonSpace = true;
}
return nonSpace;                                            // all spaces → false (R111); bytes after the NUL never read (R112)
```

- Equivalence with the backend: `readPresetName` returns non-null iff length ≥ `0x29`, bytes `0..3` = `GP-5`, the
  bytes before the first NUL in `0x19..0x28` are all `0x20..0x7e`, and `name.trim() !== ''`. Within `0x20..0x7e`
  the only byte JS `trim()` removes is `0x20`, so "not all `0x20`" ≡ "non-blank after trim". Length and magic are
  already guaranteed for every uploaded file (R5/R8 for pedal files, R12/R13 for picked files), so the helper only
  takes the name field. The backend does **not** trim or rewrite the name; neither does the frontend — the bytes
  are uploaded unchanged (R6/R7/R18), only the decision is mirrored.
- Lives in `gp5-prst-file.ts` because it interprets `.prst` bytes (isolation rule below). Code outside `midi/`
  never calls it on bytes it sliced itself: pedal entries pass `preset.raw.nameField` (opaque, R2), file entries
  get the precomputed `nameReadable` from `decodePrstFile`.
- `decodePrstFile` sets `nameReadable = isReadablePrstNameField(input.subarray(0x19, 0x29))` on success; it is
  independent of `ok` (a file can be a valid GP-5 file with an unreadable name — the ToneLab fixture with a
  `0xe9` name byte and recomputed CRC is `ok: true, nameReadable: false`).
- If the backend rule ever changes, only this function, its spec and R109-R113 change.

Layout (OQ1, confirmed against the ToneLab reference file `02-TLDLXAMP.prst`; matches codec `PRST_LEN`/`NAME_OFF`):

| offset | len | content | encode | decode check |
|---|---|---|---|---|
| — | 507 | whole file | R5 | R12 `wrong_length` |
| `0x00` | 20 | `GP5_PRST_HEADER` | R8 | R13 `bad_header` |
| `0x14` | 1 | CRC-8/SMBUS over `0x15..0x1FA` | R10 (computed last) | R15 `bad_crc` |
| `0x15` | 4 | `ff ff ff ff` sentinel | R9 | R14 `bad_sentinel` |
| `0x19` | 16 | name field (NUL-padded) | R7 `raw.nameField` | R17 `name` |
| `0x29` | 466 | body | R6 `raw.body` | R19 `chain` via `decodeGp5Body(body, name, 0)` |

- `decodePrstFile` checks in the order of the table (R16) and returns on the first failure. On success `bytes` is
  `input.slice()` (R18) — never re-encoded, CRC never recomputed; `name` = chars up to the first NUL, trimmed,
  possibly `''` (an empty name is a **dialog** rule, R46, not a file-validity rule: a pedal slot with a blank name
  still encodes to a valid file, so R82 must hold for it). The `slot` argument to `decodeGp5Body` is irrelevant
  (only the chain is returned).
- Header strictness: R13 compares all 20 header bytes. If a second real file ever shows `0x12` (or another
  header byte) varying, only `GP5_PRST_HEADER`, this table and the R8/R13 tests change.
- **Isolation rule:** every offset, length, the header constant and the CRC range are named constants here
  (`GP5_PRST_LEN`, `GP5_PRST_HEADER`, `PRST_CRC_OFF`, `PRST_SENTINEL_OFF`, `PRST_NAME_OFF`, `PRST_BODY_OFF`);
  nothing else in `src/` hardcodes them. F5 contract: the body is `file.subarray(0x29, 0x29 + 466)`.
- Source of truth: the ToneLab reference file (copied as a test fixture, T7). The probe recipe
  `progress/gp5_webmidi_backup_all.html:115-127` is NOT to be trusted (`01` at `0x13`, CRC overwriting `0x14` of
  a 506-byte buffer).

### Test fixtures (spec-only, R20)

**Captured hardware bodies** (`src/app/midi/gp5-captured-bodies.fixture.ts`, new):

```ts
export interface Gp5CapturedBody { readonly slot: number; readonly name: string; readonly bodyHex: string }
export const GP5_CAPTURED_BODIES: readonly Gp5CapturedBody[]; // 10 entries
export function capturedBodyBytes(index: number): Uint8Array;  // fresh 466-byte copy
```

- Data: `progress/gp5_f24_capture_2026-09-30T17-50-31-876Z.json`, `.runs[2]` ("corrida 3"),
  `.slots[*].{slot,name,bodyHex}` — `jq -c '.runs[2].slots[] | {slot,name,bodyHex}' <file>`. Slot 0 "TL DLX AMP"
  uses User IR 1 (`cata_fx100000`) and User SnapTone 3 (`catf_fx34`); slot 5 "Test Metal" uses User SnapTone 1
  (`catf_fx32`); slot 3 "Power Lead" uses neither. Slots 0 + 5 give `[{ir,1},{nam,1},{nam,3}]`.

**ToneLab reference file** (`src/app/midi/gp5-tonelab-prst.fixture.ts`, new):

```ts
export const TONELAB_TLDLXAMP_PRST_HEX: string;   // xxd -p of 02-TLDLXAMP.prst, joined, 1014 hex chars
export function tonelabPrstBytes(): Uint8Array;    // fresh 507-byte copy
```

- Source: `/Users/ricardoaguilar/Documents/Development/v_gp5_library/external_docs/02-TLDLXAMP.prst`. Hex in a
  `.fixture.ts` rather than a binary asset so Vitest needs no file-system access or loader config. Its body
  differs from the 2026-09-30 capture of slot 0 in 3 bytes, so it is **not** used to prove pedal byte identity
  (R6 uses the capture) — it proves the layout (R5-R10 byte-for-byte) and drives `decodePrstFile` tests.
- Both are `.fixture.ts` (not `.spec.ts`) because several specs share them; neither is in `main.ts`'s import
  graph. R20 is checked by `grep -rlE "gp5-(captured-bodies|tonelab-prst)\.fixture" src --include='*.ts' | grep
  -v '\.spec\.ts$'` printing nothing (T9, re-run by the reviewer).

### Mock presets (`src/app/pedals/mock-presets.ts`) — unchanged

Mocks keep their hand-written chains and get **no** `raw`. They open the dialog in **test mode** (R27):
submitting shows a notice and never calls the backend (R92/R93). Mock "Saturated Snap" contains `catf_fx32`, so
the attachments section is exercisable with mock data. Adding a `.prst` file works in test mode too (validation
and listing are local), but nothing is uploaded.

## 2. Source of the presets, and test mode (page)

**Choice: snapshot the page's comparison set (the chips) into the dialog at open time.**

```ts
// preset-browser-page.ts
interface SaveDialogState { initial: readonly Preset[]; available: readonly Preset[]; testMode: boolean }
readonly saveDialog = signal<SaveDialogState | null>(null);
private readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveSongButton');
private isMock(p: Preset): boolean { return this.mockPresets.presets().includes(p); }   // identity
private isSavable(p: Preset): boolean { return this.isMock(p) || p.raw !== undefined; }
readonly displayIsMock = computed(() => { const p = this.displayPreset(); return p !== null && this.isMock(p); });
readonly canSave = computed(() => { const p = this.displayPreset(); return p !== null && this.isSavable(p); }); // R22/R23
openSaveDialog(): void {                                                                          // R24-R27
  const savable = this.presets().filter((p) => this.isSavable(p));
  const chips = new Set(this.chipSlots());
  const initial = savable.filter((p) => chips.has(p.slot)).sort((a, b) => a.slot - b.slot);
  this.saveDialog.set({ initial, available: [...savable], testMode: this.displayIsMock() });
}
closeSaveDialog(): void { this.saveDialog.set(null); queueMicrotask(() => this.saveButton()?.nativeElement.focus()); } // R32
```

- All presets on the page come from one source at a time (a real read calls `mockPresets.clear()`), so
  "displayed preset is a mock" ⇔ every preset is a mock; `testMode` derives from the displayed preset (R27).
- The initial list is not deduplicated by name or capped by plan here: two chips sharing a name are flagged at
  submit (R52) and an over-limit list is flagged by R55/R56, so the user decides which preset to drop.
- The dialog copies `initialPresets()` into its own entries signal once (R26); later page changes cannot swap
  presets or flip the mode under an open form.
- **Mock detection is by object identity** (discarded alternative 10).
- The page's support/connection gate (`preset-browser-page.html:2-10`) is **not** modified.
- Placement: the "Save as song" button sits at the end of the chip row (`ml-auto`); the no-bytes hint renders
  right after it.
- F26 will open the same dialog from the library screen with `initialPresets = []`, `availablePresets = []`; the
  dialog already supports that (R42 hides the pedal selector, R43 file add, R51 empty-list validation).

## 3. Backend clients (`src/app/songs/`)

```ts
// src/app/songs/song.ts — only what F4 reads; the multi-preset DTO belongs to feature 26
export interface CreatedSong { id: string; name: string }

// src/app/songs/songs-api.service.ts  (AuthApi pattern)
@Injectable({ providedIn: 'root' })
export class SongsApi {
  createSong(form: FormData): Promise<CreatedSong>  // firstValueFrom(http.post<CreatedSong>(`${apiBaseUrl}/songs`, form))
}

// src/app/songs/plan-limits.ts — internal shape stays flat (Rev 5); only the parser knows the wire shape
export interface PlanLimits { plan: string; songLimit: number | null; presetsPerSongLimit: number | null; songCount: number }
export function parsePlanLimits(json: unknown): PlanLimits | null; // OQ6 nested wire shape → flat; anything else → null (R59)

// src/app/songs/plan-api.service.ts
@Injectable({ providedIn: 'root' })
export class PlanApi {
  getMyPlan(): Promise<PlanLimits | null>  // GET `${apiBaseUrl}/me/plan`; parsePlanLimits(body); rejects on HTTP error
}
```

- No headers are set on `createSong` (R91): the browser adds the multipart boundary, `authInterceptor` adds the
  Bearer token and clears `AuthStore` on 401. No `withCredentials`.
- `parsePlanLimits` (Rev 5) accepts only a non-null object with: `plan` a string; `limits` a non-null object
  whose `songs` and `presetsPerSong` are each `null` or a non-negative integer; `usage` a non-null object whose
  `songs` is a non-negative integer. It maps `limits.songs` → `songLimit`, `limits.presetsPerSong` →
  `presetsPerSongLimit`, `usage.songs` → `songCount`. Extra fields (top-level or nested) are ignored; anything
  else (missing `limits`/`usage`, a missing nested field, a string/fractional/negative number, the old flat
  Rev 4 shape) → `null`. Everything downstream of the parser (§4 `SaveSongDraft.presetsPerSongLimit`, §6
  `atCap`/`songLimitReached`) is unchanged.
- `PlanApi` lives in `songs/` because F4 is its only consumer; if F26 needs the plan elsewhere it can move it to
  an `account/` folder then.

## 4. Form logic — pure, TestBed-free (`src/app/songs/save-song-form.ts`)

```ts
export const SONG_TEXT_MAX = 255;
export const EXTRA_CONFIG_MAX_BYTES = 32768;
export const FILE_NAME_MAX = 255;

export type SongPresetEntry =
  | { readonly key: string; readonly source: 'pedal'; readonly name: string; readonly chain: readonly PresetSlot[];
      readonly preset: Preset; readonly nameReadable: boolean }  // key `pedal:<slot>`, name = preset.name.trim()
  | { readonly key: string; readonly source: 'file'; readonly name: string; readonly chain: readonly PresetSlot[];
      readonly fileName: string; readonly bytes: Uint8Array; readonly nameReadable: boolean };   // key `file:<n>`, from decodePrstFile
// nameReadable (Rev 5): pedal = preset.raw ? isReadablePrstNameField(preset.raw.nameField) : true (mocks, R118);
//                       file  = decoded.nameReadable

export interface ExtraConfigRow { readonly id: number; key: string; value: string }
export interface UserSlotRef { readonly kind: 'ir' | 'nam'; readonly slot: number }
export interface SaveSongDraft {
  entries: readonly SongPresetEntry[];      // ordered
  name: string; artist: string; cover: File | null;
  extraRows: readonly ExtraConfigRow[];
  attachments: ReadonlyMap<string, File>;   // key `${kind}:${slot}`
  presetsPerSongLimit: number | null;       // from loaded PlanLimits; null when unknown/unlimited
}
export interface SaveSongErrors {
  name?: string; artist?: string; cover?: string; extraConfig?: string;
  presets?: { key: string; params?: Record<string, number> };       // presetsRequired | presetLimitExceeded (R51, R56)
  entryRows: Readonly<Record<string, { key: string; params: Record<string, string> }>>; // entry key -> presetNameDuplicate (R52)
  extraRows: Readonly<Record<number, string>>;                      // row id -> key
  attachments: Readonly<Record<string, string>>;                    // `${kind}:${slot}` -> key
}

// entries (R34-R40, R44-R47) — all return new arrays, never mutate
export function pedalEntry(p: Preset): SongPresetEntry;
export function fileEntry(key: string, fileName: string, decoded: { name: string; chain: readonly PresetSlot[]; bytes: Uint8Array; nameReadable: boolean }): SongPresetEntry;
export function moveEntry(list: readonly SongPresetEntry[], index: number, delta: -1 | 1): readonly SongPresetEntry[]; // out of range → same list
export function removeEntryAt(list: readonly SongPresetEntry[], index: number): readonly SongPresetEntry[];
export type AddResult = { ok: true; list: readonly SongPresetEntry[] } | { ok: false; error: { key: string; params?: Record<string, string> } };
export function tryAppendEntry(list: readonly SongPresetEntry[], e: SongPresetEntry): AddResult;   // !nameReadable → presetNameUnsupported (R114, R115), then duplicate name → presetNameDuplicate (R39, R47)
export function addablePresets(available: readonly Preset[], list: readonly SongPresetEntry[]): Preset[]; // slot not listed by a pedal entry, ascending (R40)
export function checkPrstPick(fileName: string, result: PrstDecodeResult): { key: string } | null; // R45, R46, R48 (name length first)
export function atPresetCap(count: number, limit: number | null): boolean;                       // limit !== null && count >= limit (R54, R55)

export function detectUserSlots(entries: readonly SongPresetEntry[]): UserSlotRef[];              // across ALL entries' chains, deduped
export function pruneAttachments(a: ReadonlyMap<string, File>, refs: readonly UserSlotRef[]): ReadonlyMap<string, File>; // R76
export function checkPickedFile(file: File, kind: 'cover' | 'ir' | 'nam'): string | null;          // R63/R64
export function serializeExtraConfig(rows: readonly ExtraConfigRow[]): string | null;            // null => omit (R86)
export function validateSaveSongDraft(d: SaveSongDraft): SaveSongErrors;                          // R51, R52, R56, R60-R62, R67-R69, R116
export function hasErrors(e: SaveSongErrors): boolean;
export function presetFileName(presetName: string): string;
export function buildSongFormData(d: SaveSongDraft): FormData;                                   // R77-R90; throws on 0 entries
```

Details:

- **Name uniqueness (OQ5, OQ8 resolved):** compare `entry.name` values (already trimmed) with `===`. `tryAppendEntry`
  rejects a clashing entry with `{ key: 'saveSong.errors.presetNameDuplicate', params: { name } }`;
  `validateSaveSongDraft` flags each later entry whose name appeared earlier (R52) — reachable only through the
  initial chip list, since adds are rejected up front.
- **Backend-readable names (Rev 5, R114-R118):** `tryAppendEntry` checks `e.nameReadable` **before** the duplicate
  check and rejects with `{ key: 'saveSong.errors.presetNameUnsupported' }` (no params — the name may not be
  printable). This one check covers both the pedal selector (R114) and file picks (R115); for files it runs after
  `checkPrstPick`, so a blank decoded name still gets `prstNoName` (R46) and a too-long file name still gets
  `fileNameTooLong` (R48) first. `validateSaveSongDraft` sets `entryRows[e.key] = { key:
  'saveSong.errors.presetNameUnsupported', params: {} }` for every entry with `nameReadable === false`, overriding
  a duplicate error on the same row (R116); `hasErrors` counts it, so submit stops (R117) — in test mode too
  (validation runs before the test-mode return). The only way an unreadable entry reaches the list is the initial
  chip snapshot, exactly like same-name chips (R52). Mock pedal entries (no `raw`) are `nameReadable: true` (R118);
  they are never uploaded (R93).
- **Pedal identity is by `slot`** (one read = one preset per slot) for `addablePresets`; a pedal preset whose
  slot is not listed but whose name is, is still offered, and picking it is rejected with the inline message (R39)
  — the user sees why rather than wondering where it went (discarded alternative 18).
- **`checkPrstPick`** order: file name > 255 → `fileNameTooLong` (R48); `!result.ok` → mapped key (R45);
  `result.name === ''` → `prstNoName` (R46); else `null`. Duplicate name is checked afterwards by
  `tryAppendEntry` (R47).
- **Preset cap:** `atPresetCap` drives the disabled add controls and the cap message (R54, R55); validation adds
  `presetLimitExceeded` only when `count > limit` (R56) — a list exactly at the limit is valid.
- **`detectUserSlots`**: for every chain entry of every listed entry (pedal and file), `parseModuleType` +
  `describeModuleType` (`gp5-module-vocabulary.ts`); keep `kind === 'resolved'` with a `slotNumber`; `cat === 0xa`
  → `'ir'`, `cat === 0xf` → `'nam'`. Bypassed blocks still count. Deduplicate by `(kind, slot)`; IR refs ascending,
  then NAM refs ascending (R72-R74, R88/R89 ordering).
- **`pruneAttachments`**: the component recomputes `userSlots` and replaces `attachments` after every list change
  (R76).
- **Lengths** use `string.length` on the trimmed value (≥ Postgres char count). Inputs also carry
  `maxlength="255"`.
- **`checkPickedFile`**: name length > 255 → `fileNameTooLong`; for `'cover'`, `!file.type.startsWith('image/')` →
  `coverNotImage`. On error the component clears the `<input type=file>` value and stores nothing (R71).
- **Extra config**: rows with empty trimmed key **and** empty value are ignored; empty key + value →
  `extraKeyRequired`; repeated trimmed key → `extraKeyDuplicate` on the later row; values stay typed strings.
  `JSON.stringify(Object.fromEntries(rows.map(r => [r.key.trim(), r.value])))`; size via
  `new TextEncoder().encode(json).length > 32768` → `extraConfigTooLarge`; `null` when no keyed row.
- **`presetFileName`** (pedal entries only): lowercase, NFKD, strip diacritics, runs of non `[a-z0-9]` → `-`, trim
  `-`, max 64 chars, fallback `preset`; append `.prst` (`"TL DLX AMP"` → `tl-dlx-amp.prst`). File entries keep the
  picked file's own name (R81).
- **`buildSongFormData`** append order (Rev 5: no per-preset metadata fields, see §0):
  1. `name` (trimmed); `artist` only if non-empty; `extra_config` only if non-null.
  2. For each entry `e`, in list order, one `preset` part = pedal: `new File([encodePrstFile(e.preset)],
     presetFileName(e.name), { type: 'application/octet-stream' })`; file: `new File([e.bytes], e.fileName,
     { type: 'application/octet-stream' })` (a `File`, not a bare `Blob`, so the backend keeps the filename).
     No `pedal_preset_name` (Rev 5) and no `pedal_slot` (Rev 4) field is ever appended — the backend derives
     each name from the part's bytes.
  3. `ir` files in `detectUserSlots` order, then `nam` files, then `cover`.
  Invariants checked by tests: `getAll('preset').length === entries.length`; `fd.has('pedal_preset_name')` is
  `false` (R85); every `preset` part's bytes pass `decodePrstFile` (R82). Throws `Error('no_presets')` for an
  empty list (unreachable via the UI, R51).

## 5. Error mapping (`src/app/songs/save-song-errors.ts`)

```ts
export type SaveSongErrorPlace = 'name' | 'extraConfig' | 'banner';
export interface MappedSaveSongError { key: string; place: SaveSongErrorPlace; params?: Record<string, number>; loginLink?: true }
export function mapSaveSongError(err: unknown): MappedSaveSongError;
```

Reads `err` as `HttpErrorResponse`; body = `typeof err.error === 'object' ? err.error : undefined` (a Hono 500 is
`text/plain`, so `err.error` is a string → no body); message = `body?.error`, code = `body?.code`.

| status | condition | key (`saveSong.errors.*`) | place |
|---|---|---|---|
| 400 | message `name is required` | `nameRequired` | name |
| 400 | message `at least one preset file is required` *(Rev 5; was `exactly one …` before backend F15)* | `presetMissing` | banner |
| 400 | message matches `/^preset file at position (\d+) has no readable GP-5 preset name$/` *(Rev 5, R108)* | `presetNameUnreadable`, `params.position` = captured number + 1 | banner |
| 400 | message `at most one cover file is allowed` | `coverTooMany` | banner |
| 400 | message `extra_config exceeds maximum size of 32768 bytes` | `extraConfigTooLarge` | extraConfig |
| 400 | message `extra_config must be valid JSON` | `extraConfigInvalid` | extraConfig |
| 400 | message `extra_config must be a JSON object` | `extraConfigInvalid` | extraConfig |
| 402 | `code === 'plan_song_limit'` and `typeof limit === 'number'` *(OQ7 resolved)* | `planSongLimit`, `params.limit` | banner |
| 402 | `code === 'plan_preset_limit'` and `typeof limit === 'number'` *(OQ7 resolved)* | `planPresetLimit`, `params.limit` | banner |
| 402 | anything else | `planLimitGeneric` | banner |
| 401 | any | `sessionExpired`, `loginLink` | banner |
| 404 | message `user not found` | `sessionExpired`, `loginLink` | banner |
| 0 | — | `network` | banner |
| anything else | — | `unexpected` | banner |

The 401 path relies on `authInterceptor` having cleared `AuthStore`; the dialog does not touch the token. Values
are kept (R97) — lost only if the user navigates to `/login`.

Rev 5 coverage check against the finished `createSong` (`song-service.ts` ~L162-215) and the `POST /songs` route:
every 400 string it can return is a row above (`name is required`, `at least one preset file is required`, `at
most one cover file is allowed`, `extra_config exceeds maximum size of 32768 bytes` (`MAX_EXTRA_CONFIG_BYTES =
32768`), `extra_config must be valid JSON`, `extra_config must be a JSON object`, the position pattern); 404
`user not found` and 402 are rows above; anything else falls to `unexpected`. The `presetNameUnreadable` case (R108) is
pre-empted on the client by R114-R118 (`isReadablePrstNameField`, §1, mirrors `readPresetName`), so it should
only appear if the two rules drift apart; it stays as the server-side fallback and names the row so the user can
remove it.

## 6. Dialog component (`src/app/songs/save-song-dialog/save-song-dialog.{ts,html}`)

```ts
@Component({ selector: 'app-save-song-dialog', imports: [TranslocoDirective, FormsModule, RouterLink, ChainStrip],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './save-song-dialog.html' })
export class SaveSongDialog {
  readonly initialPresets = input.required<readonly Preset[]>();   // R24, R33
  readonly availablePresets = input.required<readonly Preset[]>(); // R25, R40, R42
  readonly testMode = input(false);                                // R27, R92, R93
  readonly closed = output<void>();
  readonly entries = signal<readonly SongPresetEntry[]>([]);       // seeded once with initialPresets().map(pedalEntry) (R26)
  readonly addable = computed(() => addablePresets(this.availablePresets(), this.entries()));   // R40, R41
  readonly userSlots = computed(() => detectUserSlots(this.entries()));                         // R72-R74
  readonly plan = signal<PlanLimits | null>(null);                                              // R53-R59
  readonly atCap = computed(() => atPresetCap(this.entries().length, this.plan()?.presetsPerSongLimit ?? null));
  readonly songLimitReached = computed(() => { const p = this.plan(); return p !== null && p.songLimit !== null && p.songCount >= p.songLimit; });
  readonly addError = signal<{ key: string; params?: Record<string, string> } | null>(null);   // R39, R45-R49
  readonly name = signal(''); readonly artist = signal('');
  readonly cover = signal<File | null>(null);
  readonly extraRows = signal<readonly ExtraConfigRow[]>([]);
  readonly attachments = signal<ReadonlyMap<string, File>>(new Map());
  readonly fieldErrors = signal<SaveSongErrors>({ entryRows: {}, extraRows: {}, attachments: {} });
  readonly serverError = signal<MappedSaveSongError | null>(null);
  readonly submitting = signal(false);
  readonly saved = signal<CreatedSong | null>(null);
  readonly testModeNoticeShown = signal(false);
  moveUp(i: number): void; moveDown(i: number): void; removeEntry(i: number): void; // each then prunes attachments (R76)
  onAddPreset(ev: Event): void;      // <select> value (slot) → tryAppendEntry(pedalEntry) → list or addError; select.value = '' (R38, R39)
  onPrstPicked(ev: Event): Promise<void>; // see below (R43-R50)
  addRow(): void; removeRow(id: number): void; onFilePicked(kind, slot | null, ev: Event): void;
  clearFile(kind, slot | null): void; submit(): Promise<void>; requestClose(): void;
  @HostListener('document:keydown.escape') onEscape(): void;  // requestClose() unless submitting (R30/R31)
}
```

- **Plan load (R53, R59):** in the constructor, unless `testMode()`, call `planApi.getMyPlan()` once; on
  resolve set `plan` (a `null` parse result leaves it `null`); on reject leave it `null` silently — no banner, the
  server still enforces. Not re-fetched on retry. In test mode no call is made (R93).
- **Add from file (R43-R50):** a visually hidden `<input type="file" accept=".prst" data-testid="save-song-add-file-input" class="sr-only" tabindex="-1">`
  triggered by the visible `save-song-add-file` button. `onPrstPicked`: take `files[0]` (none → return); read
  bytes with `new Uint8Array(await file.arrayBuffer())` (jsdom 28 supports `Blob.arrayBuffer`; if a test env
  lacks it, use `FileReader` — implementer's choice); `const r = decodePrstFile(bytes)`;
  `checkPrstPick(file.name, r)` → error → `addError.set(...)`; else `tryAppendEntry(list, fileEntry(\`file:${++n}\`,
  file.name, r))` → error or new list + `addError.set(null)` + prune attachments; **finally** reset
  `input.value = ''` (R50).
- Preset rows: `@for (e of entries(); track e.key; let i = $index, first = $first, last = $last)`. Move up
  `[disabled]="first || submitting()"`, Move down `[disabled]="last || submitting()"`, Remove
  `[disabled]="submitting()"` (R36, R37). After a move, focus stays on the same control of the moved row when it
  is still enabled, else on the row's other move control (`afterNextRender` + `data-testid` lookup). A row's
  `entryRows[e.key]` error renders under its name.
- Empty list: the `<ol>` is replaced by the empty-state box (`saveSong.presets_empty`); a submit then shows
  `presetsRequired` (R51) under the list.
- "Add preset" is a native `<select>` rendered only `@if (availablePresets().length > 0)` (R42); first option
  `value=""` disabled-selected placeholder `saveSong.add_preset`; one option per `addable()` preset, `value` = its
  slot (internal identity only), label = its name (no slot number shown, Rev 4); `[disabled]="addable().length === 0 || atCap() || submitting()"` (R41, R54). The file button
  `[disabled]="atCap() || submitting()"` (R54).
- Focus: `afterNextRender` focuses `#songName` (R29). Element ids use a per-instance counter.
- `submit()`: clear `serverError`, `testModeNoticeShown`; validate with
  `presetsPerSongLimit: plan()?.presetsPerSongLimit ?? null`; errors → `fieldErrors`, stop (R70). **If
  `testMode()`** → `testModeNoticeShown.set(true)`, return (no `buildSongFormData`, no `encodePrstFile`, no
  request; R92, R93). Else `submitting=true`, `saved.set(await songsApi.createSong(buildSongFormData(draft)))`;
  catch → `serverError.set(mapSaveSongError(e))`, also routed into `fieldErrors` when `place` is
  `name`/`extraConfig`; finally `submitting=false`. Never rethrows. The song-limit warning never blocks (R58).
- `requestClose()`: no-op while `submitting()`; otherwise `closed.emit()`. Backdrop `(click)` + card
  `(click)="$event.stopPropagation()"` copy the picker overlay pattern.
- Test-mode notice: above the footer while `testModeNoticeShown()`; the next submit re-evaluates it.

## 7. i18n

New top-level namespace `saveSong` in `public/i18n/{es,en}.json` (copy in "Visual direction" → Copy). Slot
labels reuse `chainBoard.userIrSlot` / `chainBoard.userSnapToneSlot`. Parity test
`src/app/songs/i18n-parity.spec.ts` copies the `src/app/pedals/i18n-parity.spec.ts` helpers (R105).

## 8. Files touched

| File | Change |
|---|---|
| `src/app/midi/preset.ts` | `PresetRaw`, optional `Preset.raw` |
| `src/app/midi/gp5-sysex-preset-codec.ts` (+ spec) | name-field capture, `raw` attach, export `crc8` and `decodeGp5Body` (R1-R3) |
| `src/app/midi/web-midi-pedal-connection.spec.ts` | R4 pass-through test |
| `src/app/midi/gp5-prst-file.ts` (+ spec) | new — `encodePrstFile`, `decodePrstFile` (+ `nameReadable`), layout constants, `isReadablePrstNameField` (R5-R19, R109-R113) |
| `src/app/midi/gp5-captured-bodies.fixture.ts` (+ `.fixture.spec.ts`) | new — captured bodies, spec-only (R20) |
| `src/app/midi/gp5-tonelab-prst.fixture.ts` (+ `.fixture.spec.ts`) | new — ToneLab reference file as hex, spec-only (R20) |
| `src/app/pedals/preset-browser-page/preset-browser-page.{ts,html}` (+ spec) | button in chip row, enablement, snapshot, test mode, dialog host (R21-R27, R32); gate **unchanged** |
| `src/app/songs/song.ts` | new — `CreatedSong` |
| `src/app/songs/songs-api.service.ts` (+ spec) | new — `SongsApi.createSong` (R77, R91) |
| `src/app/songs/plan-limits.ts`, `plan-api.service.ts` (+ specs) | new — `PlanLimits`, `parsePlanLimits`, `PlanApi.getMyPlan` (R53, R59) |
| `src/app/songs/save-song-form.ts` (+ spec) | new — entries ops, validation, request builder (R34-R90 pure parts, R114-R118) |
| `src/app/songs/save-song-errors.ts` (+ spec) | new — `mapSaveSongError` (R98-R104, R108) |
| `src/app/songs/save-song-dialog/save-song-dialog.{ts,html}` (+ spec) | new — dialog (R26, R28-R76, R92-R97, R106, R107, R114-R118) |
| `src/app/songs/i18n-parity.spec.ts` | new — R105 |
| `public/i18n/es.json`, `public/i18n/en.json` | `saveSong` namespace |
| `specs/sysex_preset_read_write/design.md` | one dated note under discarded alternative #2 |

Not touched: `src/app/pedals/mock-presets.ts`, `mock-presets.store.ts`, the page's support/connection gate,
`SelectedPresetStore`, `PresetComparisonStore` (the dialog's list is a copy; reordering it never changes chips).

## 9. Error paths

- `encodePrstFile` throws `preset_bytes_unavailable` (R11) and `buildSongFormData` throws `no_presets`. The UI
  prevents both (R22/R24/R25 keep byte-less real presets out; R51 blocks an empty list; test mode returns before
  encoding). If either still throws inside `submit()`, the catch maps it to `unexpected` (R104).
- `decodePrstFile` never throws; every rejection is a translated inline add error (R45-R48). A failing
  `arrayBuffer()` read is mapped to `prstNotGp5` (treated as an unreadable file).
- `PlanApi.getMyPlan` failures are swallowed (R59); limits are advisory.
- `SongsApi.createSong` rejects with `HttpErrorResponse`; mapped per §5.
- Picked files failing `checkPickedFile` never enter state (R71); attachments for slots no longer referenced are
  pruned (R76).
- Backend contract differs from §0 (message strings, plan endpoint, 402 body): unknown 400 →
  `unexpected`, unknown 402 → `planLimitGeneric`, unparseable plan → no caps; T1 catches it before
  implementation.

## Discarded alternatives

1. **Upload the bare 466-byte body** instead of a full `.prst`. Rejected by Ricardo (brief decision 1, Rev 3):
   the stored file must be a valid installable GP-5 `.prst`; F5 can still extract the exact body at `0x29`.
2. **`PedalConnection.readPresetBytes(slot)` re-read on save.** Rejected: selecting each slot switches the user's
   active preset (~300 ms settle each, × N), needs a live connection, and may differ from what was displayed.
3. **Re-synthesize bodies with `encodeBody`.** Rejected: unverified and lossy (`gp5-sysex-preset-codec.ts:336-339`)
   — exactly what would break "valid and installable".
4. **Revive `SelectedPresetStore`.** Rejected: a second source of truth next to the chips/`displayPreset()`.
5. **A `/songs/new` route.** Rejected: the presets live in page-local state; a route would need a store.
6. **Free-form JSON textarea for `extra_config`.** Rejected by Ricardo (brief decision 3).
7. **Native `<dialog>` + `showModal()`.** Rejected: partial jsdom support makes R28-R32 harder to test.
8. **Give mock presets captured bodies so they can be saved.** Rejected by Ricardo (Rev 1).
9. **Mock gate on the preset UI.** Rejected (Rev 1); visibility/connect flow belongs to feature 26.
10. **Detect mocks by slot number or name.** Rejected: a real preset can share a mock's slot and name.
11. **One song per preset.** Rejected by Ricardo (Rev 2).
12. **Ship an interim N = 1 build against today's backend.** Rejected: contradicts Rev 2's data model and needs
    a second revision to remove.
13. **Send per-preset metadata as one JSON field.** Rejected: the backend card specifies repeatable fields.
    (Moot since Rev 5: no per-preset metadata is sent at all, see 22.)
14. **Drag-and-drop reordering.** Rejected: pointer + keyboard + touch handling, hard to test in jsdom, adds
    motion; Move up / Move down buttons are accessible and testable (R34-R36).
15. **Pre-fill the dialog with only the displayed preset.** Rejected: the chip row is the user's working set.
16. **Rebuild file-sourced presets** through `encodePrstFile` (split the file into name field + body, re-encode).
    Rejected by Ricardo (Rev 3, "the file as given"): for a valid file it yields the same bytes, so it only adds
    a path where a future layout variant (e.g. a different `0x12`) would be silently rewritten instead of rejected.
17. **Lenient file validation** (accept a bad CRC and fix it, or accept 506-byte files). Rejected by Ricardo
    (Rev 3, strict): a CRC mismatch means the file was damaged or is not a GP-5 preset; repairing it would upload
    a file the pedal may reject or misread.
18. **Hide same-name pedal presets from the "Add preset" selector** instead of rejecting the pick. Rejected:
    Rev 3 asks to reject the add with an inline message; silently missing presets would look like a read bug.
19. **Hard-block submit when the song limit is reached.** Rejected: the brief says "warn"; the server is the
    authority and the count can be stale (a song deleted in another tab), so a 402 is mapped instead (R99).
20. **Load the plan once at app start in a global store.** Rejected for F4: no other screen needs it yet (F26 owns
    the library screen) and a fresh read at dialog open is never stale by more than one dialog session.
21. **Send `pedal_slot` (`String(slot)`) for pedal presets as reference-only origin metadata** (Revs 1-3).
    Rejected by Ricardo (Rev 4): a preset can be installed in any slot, any number of times, so the origin slot
    is not relevant data; dropping it also removes the per-field alignment hazard file presets created.
22. **Keep sending `pedal_preset_name` per preset** (Revs 1-4) since the backend tolerates unknown fields.
    Rejected (Rev 5): the finished backend never reads it and derives the name from the bytes, so the field would
    be dead weight that suggests to readers (and to F26) that the client controls the stored name; the bytes are
    already the single source of the name.
23. **Mirror the backend's nested `/me/plan` shape in the internal `PlanLimits`** (`limits.songs`,
    `usage.songs`, …). Rejected (Rev 5): it would ripple through §4 (`SaveSongDraft`), §6 (`atCap`,
    `songLimitReached`) and the component tasks for no behavioral gain; mapping once in `parsePlanLimits` keeps the
    wire shape in a single function.
24. **Check name readability on the decoded name string** (`preset.name` / `decoded.name`) instead of the name
    field bytes. Rejected (Rev 5): the strings are already trimmed and cut at the first NUL by the codec / R17,
    and the pedal name comes from a different decoder (`decodeNames`) than the uploaded bytes (`raw.nameField`);
    only the bytes that are actually uploaded can mirror the backend exactly (R112's NUL boundary, `0x00` fallback
    name fields).
25. **Sanitize the name instead of rejecting** (replace non-ASCII bytes, pad a blank name). Rejected (Rev 5):
    it would rewrite the uploaded `.prst`, breaking "pedal bytes verbatim / file as given" (Rev 3, R6, R7, R18) and
    the installability criterion; the user renames on the pedal or in the app instead.

## Visual direction

Written by hand by the spec author with the `frontend-design:frontend-design` skill loaded. Constraint: the app
already has a settled language (slate neutrals, indigo action color, `rounded-lg`/`rounded-md`, dashed borders
for "optional / add", Valeton-style chain blocks); the dialog must read as part of it, not as a new look.

**The one memorable element: the song's preset running order.** The dialog opens on an ordered list — the song
as the player will use it: position number, where the preset came from ("pedal" or "file"), its name and its
`<app-chain-strip>` with mini pedal chassis. Numbering is justified because the content *is* a sequence
(`sort_order`). The two ways to grow the list sit together directly under it as dashed "add" controls, so the
list reads as one editable thing. Everything else is a plain, disciplined form. Colors beyond the app's slate +
indigo: one emerald success mark and one amber plan warning (a warning that is neither an error nor an action).

### Palette (literal class strings)

| Element | Classes |
|---|---|
| Backdrop (`data-testid="save-song-backdrop"`) | `fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4` |
| Card (`data-testid="save-song-card"`, `role="dialog"`) | `flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-white shadow-xl dark:bg-slate-800 sm:max-h-[90vh] sm:rounded-xl` |
| Header | `flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6` |
| Title `<h2>` | `text-base font-semibold text-slate-900 dark:text-slate-100` |
| Close button (icon ×, `aria-label` `saveSong.close`) | `-mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50` |
| Scroll body | `flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6` |
| Song-limit warning (`data-testid="save-song-song-limit"`, `role="status"`, first child of the scroll body) | `rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900` |
| Presets `<fieldset>` (`data-testid="save-song-presets"`) | `space-y-2`; legend `saveSong.presets_legend` with the legend class below; helper `saveSong.presets_help` with the helper class |
| Preset list `<ol>` | `divide-y divide-slate-200 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 dark:divide-slate-700 dark:bg-slate-900 dark:ring-slate-700` |
| Empty list box (`data-testid="save-song-presets-empty"`, replaces the `<ol>`) | `rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400` (text `saveSong.presets_empty`) |
| Preset row `<li>` (`data-testid="save-song-preset-row"`) | `grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-2 px-3 py-2.5` |
| Row position | `pt-0.5 text-right text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500` (text `{{ i + 1 }}`, `aria-hidden="true"`; row `aria-label` `saveSong.preset_row_aria` for pedal rows, `saveSong.preset_row_file_aria` for file rows) |
| Row title line | `flex min-w-0 items-baseline gap-2 text-sm`; source: pedal → `<span data-testid="save-song-pedal-badge" class="rounded bg-indigo-50 px-1 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">` + `saveSong.pedal_badge`; file → `<span data-testid="save-song-file-badge" class="rounded bg-slate-200 px-1 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">` + `saveSong.file_badge`; name `<span class="truncate font-medium text-slate-900 dark:text-slate-100">` |
| Row error (duplicate name, R52; `data-testid="save-song-preset-row-error"`) | `mt-1 text-xs text-red-600 dark:text-red-400` (spans column 2) |
| Row chain strip wrapper | `mt-1.5` around `<app-chain-strip [chain]="e.chain">` (spans column 2) |
| Row controls group | `flex items-center gap-0.5` |
| Row icon button (Move up `↑`, Move down `↓`, Remove `×`; `data-testid` `save-song-preset-up` / `-down` / `-remove`; `aria-label` `saveSong.move_up` / `move_down` / `remove_preset` with `{name}`) | `rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`; Remove adds `hover:text-red-600 dark:hover:text-red-400` |
| Add controls row (directly under the list) | `flex flex-col gap-2 sm:flex-row` |
| "Add preset" `<select>` (`data-testid="save-song-add-preset"`, `aria-label` `saveSong.add_preset_aria`) | `w-full rounded-md border border-dashed border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 sm:flex-1` (placeholder option text `saveSong.add_preset`) |
| "Add .prst file" button (`data-testid="save-song-add-file"`, `type="button"`) | `inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-auto` with `<span aria-hidden="true">+</span>` + `saveSong.add_file` |
| Hidden file input (`data-testid="save-song-add-file-input"`) | `sr-only`, `tabindex="-1"`, `accept=".prst"`, `aria-hidden="true"` |
| Add error (`data-testid="save-song-add-error"`, `role="alert"`) | `text-xs text-red-600 dark:text-red-400` |
| Preset cap message (`data-testid="save-song-preset-limit"`) | `text-xs text-slate-500 dark:text-slate-400` |
| Field label | `block text-sm font-medium text-slate-700 dark:text-slate-300` |
| Optional marker (inside label) | `ml-1 font-normal text-slate-500 dark:text-slate-400` |
| Text input | `mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500` |
| Text input, invalid (append; also `aria-invalid="true"` + `aria-describedby` → error id) | `border-red-500 dark:border-red-400` |
| Field error | `mt-1 text-xs text-red-600 dark:text-red-400` |
| Helper text | `mt-1 text-xs text-slate-500 dark:text-slate-400` |
| File input | `mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-400 dark:file:bg-slate-700 dark:file:text-slate-200 dark:hover:file:bg-slate-600` |
| Picked-file row | `mt-1 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400`; name `<span class="truncate">`; remove button `shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| Section `<fieldset>` | `space-y-2`; `<legend class="text-sm font-medium text-slate-700 dark:text-slate-300">` |
| Attachment slot box (`data-testid="save-song-attach-<kind>-<slot>"`) | `rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-600` |
| Extra row (`data-testid="save-song-extra-row"`) | `grid grid-cols-[1fr_1fr_auto] items-start gap-2`; key/value inputs use the text-input string **without** `mt-1` |
| Extra row remove (icon ×, `aria-label` `saveSong.remove_field`) | `rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| "Add field" (same as `browse-presets` pill) | `inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` with `<span aria-hidden="true">+</span>` |
| Banner error (`role="alert"`, `data-testid="save-song-error"`) | `rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900`; login link inside `font-medium underline` |
| Test-mode notice (`role="status"`, `data-testid="save-song-test-mode"`) | `rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-900`; first sentence in `<span class="font-medium">` (`saveSong.test_mode_title` + `saveSong.test_mode_notice`) |
| Footer | `flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:flex-row sm:justify-end sm:px-6` |
| Cancel | `w-full rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-auto` |
| Save (`type="submit"`, `data-testid="save-song-submit"`) | `w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:w-auto` |
| Success mark | `flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300` (16px check SVG, `stroke="currentColor" stroke-width="1.5"`, `aria-hidden="true"`) |
| Success heading / body | `text-base font-semibold text-slate-900 dark:text-slate-100` / `text-sm text-slate-600 dark:text-slate-400` |
| Page entry button (`#saveSongButton`, `data-testid="save-song-open"`, last item of the chip row, wrapped with the hint in `ml-auto flex items-center gap-2`) | `inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-indigo-300 dark:ring-indigo-400 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600` |
| No-bytes hint (`data-testid="save-song-no-bytes"`) | `text-xs text-slate-500 dark:text-slate-400` |

The export checkbox under the board keeps its current markup and classes.

### Type

App default sans (no new font); one scale: `text-base` title, `text-sm` fields/labels/row names, add controls and
position numbers, `text-xs` helpers, errors, cap message and the entry button, `text-[10px]` for the "pedal" / "file" source
badges. Sentence case everywhere; no uppercase eyebrows or badges; no
`→` on buttons.

### Layout per breakpoint

```
< 640px (375 target): bottom sheet          ≥ 640px (1280 target): centered card, max-w-lg
┌──────────────────────────────┐            ┌───────────── max-w-lg ─────────────┐
│ Guardar como canción      ×  │            │ Guardar como canción             × │
├──────────────────────────────┤            ├────────────────────────────────────┤
│ [! límite de canciones ...]  │ (amber,    │ [! límite de canciones ...]        │
│ Presets de la canción        │  only if)  │ Presets de la canción              │
│ ┌──────────────────────────┐ │            │ ┌────────────────────────────────┐ │
│ │1 pedal TL DLX AMP ↑ ↓ ×  │ │            │ │1 pedal TL DLX AMP        ↑ ↓ × │ │
│ │  [chain strip ▮▮▮▮▮▮▮▮]  │ │            │ │  [chain strip ▮▮▮▮▮▮▮▮▮▮]      │ │
│ │2 archivo Lead Solo ↑ ↓ × │ │            │ │2 archivo Lead Solo       ↑ ↓ × │ │
│ │  [chain strip ▮▮▮▮▮▮▮▮]  │ │            │ │  [chain strip ▮▮▮▮▮▮▮▮▮▮]      │ │
│ └──────────────────────────┘ │            │ └────────────────────────────────┘ │
│ [┄ Añadir preset del pedal▾] │            │ [┄ Añadir preset del pedal ▾][┄+ Añadir archivo .prst] │
│ [┄ + Añadir archivo .prst  ] │            │ error / cap message (xs)           │
│ error / cap message (xs)     │            │ Nombre de la canción  (same order) │
│ Nombre de la canción         │ (scrolls)  │                                    │
│ Artista (opcional)           │            │                                    │
│ Portada (opcional)           │            │                                    │
│ Archivos de usuario … ┄┄┄┄   │            │                                    │
│ Datos extra  [k][v][×] +     │            │                                    │
├──────────────────────────────┤            ├────────────────────────────────────┤
│ [      Guardar canción     ] │            │               [Cancelar] [Guardar] │
│ [         Cancelar         ] │            └────────────────────────────────────┘
└──────────────────────────────┘
```

- Below `sm`: full width, anchored bottom, top corners rounded, up to the full dynamic viewport height; header
  and footer fixed while the middle scrolls. The two add controls stack full width (selector first). Footer
  buttons stack full width, primary on top (`flex-col-reverse`).
- `sm` and up: centered, `max-w-lg`, `sm:max-h-[90vh]`, all corners rounded; the selector takes the remaining
  width (`sm:flex-1`) and the file button sits at its right (`sm:w-auto`); footer buttons right-aligned.
- When the pedal selector is not rendered (R42), the file button alone fills the add row.
- Extra rows keep 3 columns at 375px — no stacking.
- Content left-aligned; the success panel centers only its mark, heading and body
  (`flex flex-col items-center gap-3 py-6 text-center`).

### Interaction states

- Hover: as listed (ghost bg-slate-100/200/700, indigo-500 on primary, red on remove icons, darker dashed border on
  the add controls).
- Focus: every interactive element shows `focus-visible:outline-2` indigo (inputs/select use `outline-offset-0`).
  After Move up/down, focus follows the moved row (§6). After a successful file add, focus returns to the
  "Add .prst file" button; after a rejected one, it stays there and the `role="alert"` error is announced.
- Invalid: red border + `aria-invalid` + error text under the field; row-level red text for a duplicate name;
  red add-error line for rejected adds; banner for server/form-level errors.
- Disabled: first row's ↑, last row's ↓ (`disabled:opacity-30`); the add selector when nothing is left to add;
  both add controls at the plan cap (with the cap message visible, so the reason is on screen); while submitting
  every control, input and the select are disabled and Save shows `saveSong.saving`.
- Warning: the amber song-limit line is informational; nothing is disabled by it.
- Test mode: looks and behaves exactly like the real form (same list controls, file add and validation); only
  the submit outcome differs — the notice appears, nothing is disabled. No plan message ever appears.
- Selected file (cover/IR/NAM): the file input stays, a picked-file row below it shows the name + "Quitar".

### Motion

None. Reordering swaps rows instantly (the position numbers re-render, which is the visible confirmation); added
rows appear at the end instantly; the dialog appears and disappears instantly, like the picker overlay.

### Copy (es default / en)

| key | es | en |
|---|---|---|
| `saveSong.open` | Guardar como canción | Save as song |
| `saveSong.title` | Guardar como canción | Save as song |
| `saveSong.close` | Cerrar | Close |
| `saveSong.presets_legend` | Presets de la canción | Presets in this song |
| `saveSong.presets_help` | En el orden en que los usarás. Añádelos desde el pedal o desde un archivo .prst. | In the order you'll use them. Add them from the pedal or from a .prst file. |
| `saveSong.presets_empty` | Aún no hay presets. Añade uno desde el pedal o desde un archivo .prst. | No presets yet. Add one from the pedal or from a .prst file. |
| `saveSong.preset_row_aria` | Posición {{position}}: {{name}}, desde el pedal | Position {{position}}: {{name}}, from the pedal |
| `saveSong.preset_row_file_aria` | Posición {{position}}: {{name}}, desde archivo | Position {{position}}: {{name}}, from a file |
| `saveSong.pedal_badge` | pedal | pedal |
| `saveSong.file_badge` | archivo | file |
| `saveSong.move_up` | Subir {{name}} | Move {{name}} up |
| `saveSong.move_down` | Bajar {{name}} | Move {{name}} down |
| `saveSong.remove_preset` | Quitar {{name}} de la canción | Remove {{name}} from the song |
| `saveSong.add_preset` | Añadir preset del pedal… | Add preset from pedal… |
| `saveSong.add_preset_aria` | Añadir un preset leído del pedal | Add a preset read from the pedal |
| `saveSong.add_file` | Añadir archivo .prst | Add .prst file |
| `saveSong.name` | Nombre de la canción | Song name |
| `saveSong.artist` | Artista | Artist |
| `saveSong.optional` | (opcional) | (optional) |
| `saveSong.cover` | Portada | Cover image |
| `saveSong.cover_help` | PNG, JPG o WebP. | PNG, JPG or WebP. |
| `saveSong.remove_file` | Quitar | Remove |
| `saveSong.attachments_legend` | Archivos de usuario | User files |
| `saveSong.attachments_help` | Los presets de esta canción usan slots de usuario del GP-5. Adjunta los archivos que tienes cargados en ellos para guardarlos con la canción. | The presets in this song use GP-5 user slots. Attach the files loaded in them to keep them with the song. |
| `saveSong.ir_help` | Archivo .wav | .wav file |
| `saveSong.nam_help` | Archivo .nam | .nam file |
| `saveSong.extra_legend` | Datos extra | Extra details |
| `saveSong.extra_help` | Afinación, cejilla, notas o lo que quieras recordar. | Tuning, capo, notes or anything else you want to remember. |
| `saveSong.extra_key_placeholder` | Ej. afinación | e.g. tuning |
| `saveSong.extra_value_placeholder` | Ej. Drop D | e.g. Drop D |
| `saveSong.add_field` | Añadir campo | Add field |
| `saveSong.remove_field` | Quitar campo | Remove field |
| `saveSong.cancel` | Cancelar | Cancel |
| `saveSong.save` | Guardar canción | Save song |
| `saveSong.saving` | Guardando… | Saving… |
| `saveSong.success_title` | Canción guardada | Song saved |
| `saveSong.success_body` | «{{name}}» ya está en tu biblioteca. | “{{name}}” is now in your library. |
| `saveSong.done` | Cerrar | Close |
| `saveSong.no_bytes` | Este preset no tiene los datos originales del pedal. Vuelve a leerlo para guardarlo. | This preset is missing the pedal's original data. Read it again to save it. |
| `saveSong.test_mode_title` | Modo de prueba. | Test mode. |
| `saveSong.test_mode_notice` | Estos presets son de ejemplo y no se guardan en tu biblioteca. Conecta el GP-5 y lee tus presets para guardar una canción. | These are sample presets and aren't saved to your library. Connect your GP-5 and read your presets to save a song. |
| `saveSong.login_link` | Iniciar sesión | Log in |
| `saveSong.plan.presetLimitReached` | Tu plan permite hasta {{limit}} preset(s) por canción. | Your plan allows up to {{limit}} preset(s) per song. |
| `saveSong.plan.songLimitReached` | Ya llegaste al límite de {{limit}} canción(es) de tu plan. Si guardas, el servidor lo rechazará hasta que borres alguna. | You've reached your plan's limit of {{limit}} song(s). Saving will be rejected until you delete one. |
| `saveSong.errors.nameRequired` | Escribe un nombre para la canción. | Enter a name for the song. |
| `saveSong.errors.nameTooLong` | El nombre admite hasta 255 caracteres. | Names can be up to 255 characters. |
| `saveSong.errors.artistTooLong` | El artista admite hasta 255 caracteres. | Artist can be up to 255 characters. |
| `saveSong.errors.coverNotImage` | La portada debe ser una imagen. | The cover must be an image file. |
| `saveSong.errors.fileNameTooLong` | El nombre del archivo supera los 255 caracteres. Renómbralo y vuelve a elegirlo. | That file name is longer than 255 characters. Rename the file and pick it again. |
| `saveSong.errors.presetsRequired` | Añade al menos un preset. | Add at least one preset. |
| `saveSong.errors.presetNameDuplicate` | Ya hay un preset llamado «{{name}}» en esta canción. Quita uno de los dos. | This song already has a preset named “{{name}}”. Remove one of them. |
| `saveSong.errors.presetLimitExceeded` | Tu plan permite hasta {{limit}} preset(s) por canción. Quita los que sobran. | Your plan allows up to {{limit}} preset(s) per song. Remove the extra ones. |
| `saveSong.errors.prstWrongSize` | Este archivo no es un preset de GP-5: debe ocupar exactamente 507 bytes. | This isn't a GP-5 preset: the file must be exactly 507 bytes. |
| `saveSong.errors.prstNotGp5` | Este archivo no es un preset de GP-5. | This file isn't a GP-5 preset. |
| `saveSong.errors.prstCorrupt` | El archivo está dañado: su suma de control no coincide. | The file is damaged: its checksum doesn't match. |
| `saveSong.errors.prstNoName` | El preset de este archivo no tiene nombre. Ponle uno en el pedal o en la app y expórtalo de nuevo. | The preset in this file has no name. Name it on the pedal or in the app and export it again. |
| `saveSong.errors.extraKeyRequired` | Ponle nombre a este campo o borra su valor. | Name this field or clear its value. |
| `saveSong.errors.extraKeyDuplicate` | Ya hay un campo con este nombre. | Another field already uses this name. |
| `saveSong.errors.extraConfigTooLarge` | Los datos extra superan 32 KB. Acórtalos. | Extra details exceed 32 KB. Shorten them. |
| `saveSong.errors.extraConfigInvalid` | El servidor rechazó los datos extra. Revísalos y vuelve a guardar. | The server rejected the extra details. Check them and save again. |
| `saveSong.errors.presetMissing` | El servidor no recibió los presets. Vuelve a añadirlos. | The server didn't receive the presets. Add them again. |
| `saveSong.errors.presetNameUnsupported` | El nombre de este preset está vacío o usa caracteres no admitidos (solo letras sin acentos, números, espacios y símbolos básicos). Cámbialo en el pedal o en la app y vuelve a cargarlo. | This preset's name is empty or uses unsupported characters (only unaccented letters, digits, spaces and basic symbols). Rename it on the pedal or in the app and load it again. |
| `saveSong.errors.presetNameUnreadable` | El servidor no pudo leer el nombre del preset n.º {{position}}. Quítalo o ponle un nombre en el pedal y vuelve a leerlo. | The server couldn't read the name of preset #{{position}}. Remove it, or name it on the pedal and read it again. |
| `saveSong.errors.coverTooMany` | Solo se admite una portada. | Only one cover image is allowed. |
| `saveSong.errors.planSongLimit` | Tu plan admite hasta {{limit}} canción(es). Borra alguna para guardar esta. | Your plan allows up to {{limit}} song(s). Delete one to save this song. |
| `saveSong.errors.planPresetLimit` | Tu plan admite hasta {{limit}} preset(s) por canción. Quita alguno y vuelve a guardar. | Your plan allows up to {{limit}} preset(s) per song. Remove some and save again. |
| `saveSong.errors.planLimitGeneric` | Tu plan no permite guardar esta canción. | Your plan doesn't allow saving this song. |
| `saveSong.errors.sessionExpired` | Tu sesión caducó. Inicia sesión de nuevo para guardar. | Your session expired. Log in again to save. |
| `saveSong.errors.network` | No se pudo contactar con el servidor. Revisa tu conexión y vuelve a intentarlo. | Couldn't reach the server. Check your connection and try again. |
| `saveSong.errors.unexpected` | No se pudo guardar la canción. Vuelve a intentarlo. | The song couldn't be saved. Try again. |

Rev 2's `saveSong.errors.planLimit` is replaced by `planSongLimit` / `planPresetLimit` / `planLimitGeneric`. The
action keeps the same verb end to end: "Guardar como canción" → "Guardar canción" → "Guardando…" → "Canción
guardada"; both add controls use "Añadir" like "Añadir campo".
