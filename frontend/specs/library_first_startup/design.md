# Design — `library_first_startup` (feature 26)

Conventions: `docs/architecture.md` (layers, signals, error handling via `firstValueFrom` + signal `error` state,
`authInterceptor` clears the session on 401, no component library) and `docs/conventions.md` (standalone components,
one folder per component, Transloco for every string, colocated Vitest specs, `TestBed` with `appConfig.providers`
and `provideHttpClientTesting()` overrides). This document only records choices made inside those rules.

Backend contract: `progress/f26_backend_contract.md` (verified, dependency `done`).

## Overview

```
app.html header ── nav-songs link ─ … ─ language ─ dark mode ─ mock link ─ <app-pedal-connect-button>
        │                                                            │
        │                                              PedalConnectFlow (root service)
        │                                              connect()? → navigate('/pedal/presets') → store.read()
        │                                                            │
        │                                              PedalPresetsStore (root) ── readPresets() (deduped)
        │                                                presets / loadState / error   ▲ mirrored by PresetBrowserPage
        ▼
/songs        SongsPage (F5 page, extended) → SongsApi.listSongs() → GET /songs
  └ New song  <app-save-song-dialog> (F4, unchanged) ← snapshot of PedalPresetsStore.savableSnapshot()
  └ card ×N   <li song-card> ─ <app-song-cover> → SongsApi.getCover(id) → GET /songs/:id/files/cover (blob)
  │                         ─ <a song-card-link> name → /songs/:id
  │                         ─ <button song-card-send-to-pedal> (F5) → <app-write-to-pedal-dialog> (F5, copy change only)
/songs/:id    SongDetailPage   → SongsApi.getSong(id)  → GET /songs/:id
                                 <app-song-cover [hasCover]>
/pedal/presets PresetBrowserPage (read moves into PedalPresetsStore; page mirrors it; F4 dialog unchanged)
```

The library pages themselves never inject `WebMidiPedalConnection` or `MockPresetsStore`, and the song list/cards
never read any pedal state (R56, R57, R69). The F5 write dialog the library page hosts does inject
`WebMidiPedalConnection` and reads `connectionState` — for writing only; it never feeds the card list (R57 holds).
The only pedal-derived input on the library page is the "New song" snapshot, taken from `PedalPresetsStore` at the
moment the button is activated (R60, R68). Pedal and backend meet only inside the F4 and F5 dialogs, exactly as
`docs/architecture.md` "Data Flow" prescribes.

**Revision 3 baseline (2026-10-07).** `dev` now contains F5 (`import_preset_to_pedal`) and F28 (write pacing fix).
F5 already shipped a working `SongsPage`, `songs-page.spec.ts`, `Song`/`SongPreset`, `SongsApi.listSongs()`/
`getSongPreset()`, `withFetch()` in `app.config.ts`, and eight `songs.*` keys. Every section below says *extend*
where F5 code exists; F5's tests stay green except the assertions this design names as legitimately changing.

## 1. Models — `src/app/songs/song.ts`

Keep `CreatedSong` (F4). **Keep F5's `SongPreset` and `Song` exactly as they are** (all fields `readonly`; `artist?`,
`extraConfig?`, `createdAt?`, `updatedAt?` and the preset metadata fields optional; `presets: readonly SongPreset[]`).
Do not re-declare them and do not make the optional fields required: F5's fixtures omit them, and F26 reads only
`id`, `name`, `artist`, `presets[].sortOrder` and `presets[].name`, all of which tolerate the optionality
(`isBlank(undefined)` is `true`). Add, mirroring the backend detail DTO (contract §GET /songs/:id) in F5's style:

```ts
export interface SongFile {
  readonly id: string;
  readonly kind: 'ir' | 'nam' | 'cover';
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface SongDetail extends Song {
  readonly files: readonly SongFile[];
}
```

Pure helpers in the same file (TestBed-free tests):

```ts
export function orderedPresets(presets: readonly SongPreset[]): SongPreset[]; // copy sorted by sortOrder asc (R31, R80)
export function hasCoverFile(files: readonly SongFile[]): boolean;           // some kind === 'cover' (R35, R36)
export function isBlank(value: string | null | undefined): boolean;          // R7, R8, R30
```

## 2. API — `src/app/songs/songs-api.service.ts`

Extend the existing `SongsApi` (do not create a parallel service). `listSongs()` already exists (F5) and is kept
as-is; it only lacks a unit test, which F26 adds. New:

```ts
getSong(id: string): Promise<SongDetail>     // GET  ${apiBaseUrl}/songs/${encodeURIComponent(id)}
getCover(id: string): Promise<Blob>          // GET  ${apiBaseUrl}/songs/${encodeURIComponent(id)}/files/cover, responseType 'blob'
```

`getCover` mirrors F5's `getSongPreset` (same `responseType: 'blob'` pattern). `withFetch()` is already in
`app.config.ts` (F5) — no config change. All via `firstValueFrom`. `authInterceptor` adds the Bearer token and clears `AuthStore` on 401 — unchanged. Covers
cannot be `<img src="…/files/cover">` because an `<img>` request carries no `Authorization` header (contract §Auth).

## 3. Error classification — `src/app/songs/library-load-error.ts` (pure)

```ts
export type LibraryLoadError = 'unreachable' | 'session_expired' | 'not_found' | 'load_failed';
export function classifyLoadError(err: unknown): LibraryLoadError;
```

- `HttpErrorResponse` with `status === 0` → `unreachable` (R20, R38)
- `status === 401` → `session_expired` (R24, R41)
- `status === 404` → `not_found` (R37; the library page treats it as `load_failed`, since `GET /songs` never 404s)
- anything else, including non-HTTP errors → `load_failed` (R21, R39)

Message keys: `songs.errors.unreachable`, `songs.errors.session_expired`, `songs.errors.load_failed`,
`songDetail.not_found`.

## 4. Cover component — `src/app/songs/song-cover/song-cover.{ts,html}`

```ts
@Component({ selector: 'app-song-cover', ... })
export class SongCover {
  readonly songId = input.required<string>();
  readonly songName = input.required<string>();
  // undefined = unknown (library: list DTO has no cover info) → request and treat 404 as none.
  // false = known absent (detail) → no request (R36). true = known present (detail) → request (R35).
  readonly hasCover = input<boolean | undefined>(undefined);
  readonly size = input<'tile' | 'hero'>('tile');
  readonly state = signal<'loading' | 'loaded' | 'none' | 'error'>('loading');
  readonly url = signal<string | null>(null);
}
```

- Starts its single request from an `effect`/`ngOnInit` once inputs are set (R13, R35); exactly one request per
  instance.
- `200` → `URL.createObjectURL(blob)` → `state = 'loaded'` (R15). `404` → `'none'` (R16). Other failure → `'error'`
  (R17). The failure is contained in the component, so the card list is untouched (R18).
- `DestroyRef.onDestroy` revokes the URL it created (R19). Pages own no object URLs themselves; destroying a page
  destroys its covers, which is how R19 holds for both pages.
- If the component is destroyed before the request resolves, it revokes the URL immediately after creating it
  (guard with a `destroyed` flag) so nothing leaks.
- Root element carries `data-testid="song-cover"` and `[attr.data-cover-state]="state()"`.

**Switching to a list-DTO cover indicator later (backend card proposed separately; F26 does not depend on it).**
The only place that decides what the library passes as `[hasCover]` is one pure helper in `song.ts`:

```ts
// Today the list DTO has no cover info → undefined (request, 404 = none).
// When GET /songs gains a has-cover field, return that field here; nothing else changes.
export function coverHintForListSong(song: Song): boolean | undefined { return undefined; }
```

`SongsPage` renders `<app-song-cover [hasCover]="coverHintForListSong(song)">`. Because `SongCover` already handles
`false` (no request, placeholder) and `true` (request) for the detail page, adopting the backend field is: add the
optional field to `Song`, change this one function's body, update its unit test. No component, template or API change.

No concurrency limiter: the browser already queues per-host connections, and plan limits keep `free`/`basic` lists at
1-2 songs. See "Discarded alternatives".

## 5. Library page — `src/app/songs/songs-page/songs-page.{ts,html}` (extend F5's page)

The page is F5 code, not a placeholder. **Preserve verbatim:** the `'empty'` member of `LibraryState` (F26 uses it
for R11/R12 instead of `loaded` + empty array), the load in the constructor (R2 holds; no move to `ngOnInit`),
`writeDialog` + `openWriteDialog()` + `closeWriteDialog()`, the `#sendButton` template ref read by
`viewChildren('sendButton')`, the `data-song-id` attribute on the `<li>` and the `closest('[data-testid="song-card"]')`
lookup that returns focus to the opening card's button (F5 R32), the `<app-write-to-pedal-dialog>` host block, and
F5's `songs-loading` / `songs-session-expired` testids and translated text. Update the file's header comment so it no
longer describes itself as an F5 stub. **Add** next to them:

```ts
type LibraryState = 'loading' | 'loaded' | 'empty' | 'error' | 'session_expired';   // F5's union, unchanged
readonly errorMessage = signal<string | null>(null);   // F5's name kept (holds a full translation key)
// Snapshot taken once per open; null while closed (R60, R68, R71, R74). Sits next to F5's `writeDialog`.
readonly newSong = signal<{ initial: readonly Preset[]; available: readonly Preset[] } | null>(null);
private readonly pedalPresets = inject(PedalPresetsStore);
readonly connectFlow = inject(PedalConnectFlow);   // only for the empty-state CTA (R12)

retry(): void;          // void this.load()   (R23)
openNewSong(): void;    // newSong.set({ initial: [], available: this.pedalPresets.savableSnapshot() })
closeNewSong(): void;   // newSong.set(null); void load()   (R61)
readonly coverHint = coverHintForListSong;          // template access (§4)
readonly isBlank = isBlank;                          // template access (R7, R8)
```

- `load()`'s inline `HttpErrorResponse` branching is replaced by `classifyLoadError(err)` (§3), mapping
  `unreachable` → `songs.errors.unreachable` / `'error'`, `session_expired` → `songs.errors.session_expired` /
  `'session_expired'`, anything else (incl. `not_found`) → `songs.errors.load_failed` / `'error'`. Same observable
  behavior as F5's code.
- `'empty'` → empty state (R11, R12; F5's `songs-empty` markup is extended with the CTA, not replaced);
  `'loaded'` → grid (R5, R10). `songs-new` renders in the title row in both `'empty'` and `'loaded'` (R59), never
  inside `songs-empty` (F5's empty-state test asserts that element's text does not contain "Send to pedal").
- **Card structure (Revision 3, R25, R75-R78).** The card is not a link (Ricardo, 2026-10-07):

  ```html
  <li data-testid="song-card" [attr.data-song-id]="song.id" class="…">
    <app-song-cover [songId]="song.id" [songName]="song.name" [hasCover]="coverHint(song)" />
    <a data-testid="song-card-link" [routerLink]="['/songs', song.id]" class="…">{{ song.name }}</a>
    @if (!isBlank(song.artist)) { <p data-testid="song-card-artist">…</p> }
    <p data-testid="song-card-count">…</p>
    <button #sendButton type="button" data-testid="song-card-send-to-pedal" …>  <!-- F5, unchanged -->
  </li>
  ```

  The cover, artist and count are not interactive. F5's inner bordered `<div>` wrapper is dropped (it was F5's
  minimum stand-in; no F5 test reads it). The send button keeps F5's class string, `aria-label`, testid and
  `(click)="$event.stopPropagation(); openWriteDialog(song)"`; `stopPropagation` is now harmless rather than
  necessary (F5 R53 assumed the card navigated), and is kept so F5's code and tests stay untouched.
- **Write dialog order (R80).** `openWriteDialog(song)` maps `orderedPresets(song.presets)` instead of `song.presets`
  (one-line change) so positions 1..N follow `sortOrder` even if the backend order changes (audit #15).
- **Error state (R20-R22, R79).** `songs-error` (`role="alert"`) becomes a container holding
  `<p data-testid="songs-error-message">{{ t(errorMessage() ?? 'songs.errors.load_failed') }}</p>` and the
  `songs-retry` button. The message element's trimmed text equals the translation, which is what F5's two exact-text
  tests now target (T19).
- **Loading state (R4).** `songs-loading` becomes the skeleton grid (Visual direction) whose **only** text node is the
  `sr-only` `songs.loading` label, so F5's test `textContent.trim() === 'Loading your songs…'` stays green.
- Renders songs in response order (backend: newest first). No client re-sort (R5).
- The write dialog's `closed` does not reload the list (F5 behavior kept: writing to the pedal never changes saved
  songs, R56's spirit). Only the F4 dialog's `closed` reloads (R61).
- The F4 dialog is reused as-is, bound to the snapshot: `@if (newSong(); as n) { <app-save-song-dialog
  [initialPresets]="n.initial" [availablePresets]="n.available" [testMode]="false" (closed)="closeNewSong()"> }`.
- **Mixing sources is already F4 behavior, not new code.** Checked in `src/app/songs/save-song-dialog/save-song-dialog.ts`:
  `availablePresets` feeds the "Add preset" selector (`addable`, `onAddPreset`, F4 R38-R42 — hidden when the array is
  empty), "Add .prst file" is always rendered (F4 R43), and both push into the same ordered `entries` list that submit
  uploads in order. So:
  - pedal not connected → `savableSnapshot()` returns `[]` → files only (R60);
  - pedal connected with presets read → the selector offers the read presets with `raw`, next to the file button (R68,
    R70);
  - connected but nothing read yet → `[]`, same as not connected (the header button always reads, so this is rare).
- **Snapshot, never live (R71-R74).** The dialog's constructor `effect` re-seeds `entries` whenever `initialPresets`
  changes, so the page must never hand it a new array while open. `newSong` is set once in `openNewSong()` and only
  cleared on `closed`; the template binds those same instances. A disconnect (`connectionState` → `not-connected`
  via `handlePortStateChange`) or a later read changes `PedalPresetsStore`, not the snapshot, so the open dialog keeps
  its rows and the in-memory `raw` bytes it will upload (R72, R73). The next open recomputes (R74). While the dialog is
  open its `fixed inset-0 z-50` backdrop covers the header, so the connect button cannot start a read underneath it;
  only a USB unplug can change pedal state mid-dialog.
- `testMode` is always `false` and mocks never reach the dialog: `savableSnapshot()` reads only real reads and filters
  on `raw` (mocks have none) (R69).
- Reloading on every `closed` (cancel included) is deliberate: the dialog exposes no "saved" output, and one extra
  GET is cheaper than changing the F4 component's API.

## 5b. Write dialog (F5) — copy change only (R81-R84)

Ricardo, 2026-10-07: **keep** F5's inline `write-to-pedal-connect` button. It is the only connect path reachable
while the modal dialog is open (its `fixed inset-0 z-50` backdrop covers the header), and it connects without
navigating or reading presets — unlike the header button, which navigates to `/pedal/presets` and reads (R51, R65).
This supersedes the 2026-10-07 follow-up note asking to remove it.

- **No source change** to `write-to-pedal-dialog.{ts,html}`. `onConnect()` keeps calling `pedal.connect()` directly
  (not `PedalConnectFlow.start()`, which would navigate and read) and keeps swallowing rejections.
- **Copy change** (R81): `writeToPedal.not_connected` no longer says "from the header" / "desde el encabezado", since
  the button that connects sits right below it. `writeToPedal.connect` / `writeToPedal.connecting` are kept.
- **Tests only** (R82-R84): F5 already tests that the button renders and calls `connect()` once
  (`write-to-pedal-dialog.spec.ts`, "renders the "Connect GP-5" button inside the not-connected reminder…"); F26 adds
  two assertions with a `Router` spy: URL unchanged after the click, and `readPresets` not called after `connect()`
  resolves. F5's `i18n-parity.spec.ts` test for `writeToPedal.connect`/`connecting` stays.
- Doc sync: the F5 spec's copy table row (`specs/import_preset_to_pedal/design.md`, `writeToPedal.not_connected`) and
  its "user does that from the header" sentences are updated to the new copy / to mention the inline button.

## 6. Detail page — `src/app/songs/song-detail-page/song-detail-page.{ts,html}` (new)

```ts
type DetailState = 'loading' | 'loaded' | 'not_found' | 'error' | 'session_expired';
readonly state = signal<DetailState>('loading');
readonly song = signal<SongDetail | null>(null);
readonly presets = computed(() => orderedPresets(this.song()?.presets ?? []));   // R31
readonly hasCover = computed(() => hasCoverFile(this.song()?.files ?? []));      // R35, R36
readonly errorKey = signal<string | null>(null);
```

- Reads `id` from `ActivatedRoute.snapshot.paramMap` (route reuse between two song ids is not a flow this feature
  creates; the back link always goes to `/songs`).
- Renders `<app-song-cover>` only once loaded, with `[hasCover]="hasCover()"`, `size="hero"`.
- Preset rows show position + name only (R32, R33). No slot, no file name, no byte size.

## 7. Routes — `src/app/app.routes.ts`

Add after `songs`:

```ts
{
  path: 'songs/:id',
  canActivate: [authGuard],                        // R26
  loadComponent: () => import('./songs/song-detail-page/song-detail-page').then((m) => m.SongDetailPage),
},
```

The `'' → songs` redirect (R1) and `authGuard` already exist; R1/R26 get regression tests only.

## 8. Connect flow — `src/app/pedals/pedal-connect-flow.service.ts` (new, root)

```ts
@Injectable({ providedIn: 'root' })
export class PedalConnectFlow {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly router = inject(Router);
  private readonly presets = inject(PedalPresetsStore);
  readonly supported: boolean;                                  // pedal.isSupported()
  readonly connectionState = this.pedal.connectionState;
  readonly error = signal<string | null>(null);                 // translation key suffix under `pedal.`
  async start(): Promise<void>;                                 // R50-R54
  dismissError(): void;                                         // R54
}
```

`start()`:
1. `error.set(null)` (R54).
2. If `!supported` or `connectionState() === 'connecting'` → return (button is disabled anyway; guard keeps the
   empty-state CTA safe).
3. If `connected` → `await router.navigateByUrl('/pedal/presets')` (R52), then `void presets.read()` (R63, R64).
4. Else `await pedal.connect()` (R50); on resolve → `await navigateByUrl('/pedal/presets')` (R51), then
   `void presets.read()` (R65); on reject → map `err.message` to one of
   `midi_access_denied | gp5_not_found | unsupported`, else `unknown` → `error.set(...)` (R53). Never rethrows (no
   unhandled rejection, `docs/architecture.md` §3).

**Always a fresh read, exactly one per click (R63-R65).** Coming from another route, the navigation creates
`PresetBrowserPage`, whose `ngOnInit` calls `presets.read()` (R55); the flow's own `read()` call right after lands while
that read is in flight and is deduped by the store (it returns the same promise), so the hardware sees one read.
Already on `/pedal/presets`, the navigation is a no-op and the flow's `read()` is the fresh read (R64); the page shows
the result because it mirrors the store (R66). Deduping is required, not an optimization: `readPresets()` throws
`request_in_progress` on overlap (`web-midi-pedal-connection.ts` `readPresets`). The flow never touches `SongsApi`,
`HttpClient` or saved songs (R56).

## 8b. Read presets store — `src/app/pedals/pedal-presets.store.ts` (new, root)

```ts
@Injectable({ providedIn: 'root' })
export class PedalPresetsStore {
  private readonly pedal = inject(WebMidiPedalConnection);
  readonly presets: Signal<readonly Preset[]>;                 // last successful real read; [] initially
  readonly loadState: Signal<'idle' | 'loading' | 'loaded' | 'error'>;
  readonly error: Signal<string | null>;                       // 'not_connected_error' | raw message, as the page maps today
  read(): Promise<void>;                                       // dedupes: returns the in-flight promise while loading
  savableSnapshot(): Preset[];                                 // connected ? new array of presets with raw, slot asc : []
}
```

- `read()` moves the body of `PresetBrowserPage.loadPresets()` here (same error mapping: `not_connected` →
  `not_connected_error`). It never sets presets from mocks and never touches HTTP (R56).
- `savableSnapshot()` returns a **new** array each call (R68 "new array"; R71 relies on the page storing it).
- **Shared MIDI channel (F28, Revision 3).** Reads and F5 writes share one `pendingOperation` in
  `WebMidiPedalConnection`; a read started while a write runs rejects with `request_in_progress`. The store keeps the
  page's raw-message mapping, so this surfaces as the existing `presetBrowser.request_in_progress` key on
  `/pedal/presets` (reachable only via browser Back during a write — the modal dialog blocks everything else). No new
  key. F26 never calls `writePreset`, so F28's `write_timeout` / `write_rejected` / `decodeWriteReply` don't affect it.
- **Silent reconnect (F28).** `handlePortStateChange` restores `connected` when the ports come back, without a new
  read. The store deliberately keeps the last read in that case: same pedal, and the `raw` bytes are exactly what was
  read, so a later "New song" snapshot (R68) still offers them. R72/R73 are unaffected (they use the snapshot).
- **Public surface for feature 29.** `loadState()` / `presets()` / `error()` are what F29's sync feedback on
  `/pedal/presets` should consume. `loadState` reaches `'loaded'` only from a real read — mock loads never touch the
  store — so F29 can tell the two apart.

**`PresetBrowserPage` change (source edit, behavior-preserving):** `loadPresets()` becomes `void this.store.read()`;
an `effect` mirrors `store.loadState()` / `store.presets()` / `store.error()` into the page's existing `loadState`,
`presets`, `error` signals, and on `loaded` calls `mockPresets.clear()` exactly as the current code does after a real
read. The existing mock-data `effect`, chips, comparison, picker and F4 save button are untouched; existing page
specs must stay green. This mirroring is what makes a header-triggered read show up on the page (R66).

Why a service: both the header button and the library empty-state CTA (R12) must run the same flow and share its
error, and the service is testable without TestBed-rendering the header.

## 9. Header button — `src/app/pedals/pedal-connect-button/pedal-connect-button.{ts,html}` (new)

Selector `app-pedal-connect-button`. Injects `PedalConnectFlow`. Label key computed from `connectionState`:
`not-connected`/`error` → `pedalButton.connect` (R46); `connecting` → `pedalButton.connecting`, disabled (R47);
`connected` → `pedalButton.read` (R48), or `pedalButton.reading` and disabled while `PedalPresetsStore.loadState()` is
`loading` (R67). Disabled when `!supported` (R49), with `[attr.title]` = `pedalButton.unsupported_hint`.
`(click)="flow.start()"`.

## 10. App shell — `src/app/app.{ts,html}`

- Inject `AuthStore` (for `isAuthenticated`, R43-R45), `Router`, `PedalConnectFlow`.
- Header: brand link `nav-songs` (R43) first with `mr-auto`, then the existing language switcher, dark-mode toggle
  and mock link, then `<app-pedal-connect-button>` — the last two wrapped in `@if (auth.isAuthenticated())` for the
  button (R44, R45). The mock link stays visible as today.
- Below the header, `@if (flow.error(); as e)` renders the connect error strip (R53) with a dismiss button (R54).
- `loadMockPresets()`: `mockPresetsStore.load()` then, if `router.url` is not `/pedal/presets`,
  `router.navigateByUrl('/pedal/presets')` (R58). Without this, clicking it on `/songs` did nothing visible. That is
  the whole F26 change to the link: on `/pedal/presets` after a real read, the page's mock `effect` still ignores
  mocks (`loadState === 'loaded'`) — fixing that is feature 29's acceptance item #3, not F26's. Recommended to the
  leader: `set-depends-on pedal_page_sync_feedback_and_list library_first_startup`.

## 11. i18n — `public/i18n/{es,en}.json`

F5 already added, with the same copy as "UI copy" below: `songs.loading`, `songs.empty_title`, `songs.empty_body`,
`songs.retry`, `songs.login_again`, `songs.errors.{unreachable,load_failed,session_expired}`, plus F5's own
`songs.card.{send_to_pedal,send_to_pedal_aria}` (kept). `songs.title` predates both. **Add only the missing keys:**
`songs.new`, `songs.preset_count_one`, `songs.preset_count_other`, `songs.cover_alt`, `songs.empty_connect`, every
`songDetail.*` and every `pedalButton.*`. **Change** `writeToPedal.not_connected` (R81). **Remove**
`songs.placeholder` (unused since F5). Do not add a duplicate for any key whose meaning already exists (e.g. no
`songDetail.retry` — the detail page uses `songs.retry`; no new busy key — `presetBrowser.request_in_progress`).

Parity (R62): extend F5's `src/app/songs/i18n-parity.spec.ts` rather than adding a new file — (a) add the namespaces
`songDetail` and `pedalButton` to its es/en key-set parity check, and (b) add `song-detail-page.html`,
`song-cover.html`, `pedal-connect-button.html` and `src/app/app.html` to the existing source scanner's file list and
`songDetail|pedalButton` to its key regex, so any key used but undefined fails. F5's scanner already covers
`songs-page.{html,ts}`. Reused existing keys: `pedal.midi_access_denied`, `pedal.gp5_not_found`, `pedal.unsupported`,
`pedal.unknown`, `presetBrowser.load_test_presets`, `presetBrowser.request_in_progress`.

## 12. Files touched

| File | Change |
|---|---|
| `src/app/songs/song.ts` | keep F5's `SongPreset`, `Song`; + `SongFile`, `SongDetail`, `orderedPresets`, `hasCoverFile`, `isBlank`, `coverHintForListSong` |
| `src/app/songs/song.spec.ts` | new — pure helper tests |
| `src/app/songs/songs-api.service.ts` / `.spec.ts` | + `getSong`, `getCover`; + missing `listSongs` test (method exists, F5) |
| `src/app/songs/library-load-error.ts` / `.spec.ts` | new |
| `src/app/songs/song-cover/song-cover.{ts,html,spec.ts}` | new |
| `src/app/songs/songs-page/songs-page.{ts,html}` | extend F5's page (§5): card link, cover, artist, count, empty CTA, `songs-new`, retry, `songs-error-message`, `orderedPresets` in `openWriteDialog`, `classifyLoadError` |
| `src/app/songs/songs-page/songs-page.spec.ts` | extend F5's spec: add F26 tests; add new keys to its in-memory translations; retarget the two exact-text error assertions to `songs-error-message` (T19). All other F5 tests unchanged |
| `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.spec.ts` | + R83/R84 tests; no change to existing tests. Component files not modified |
| `src/app/songs/song-detail-page/song-detail-page.{ts,html,spec.ts}` | new |
| `src/app/pedals/pedal-connect-flow.service.ts` / `.spec.ts` | new |
| `src/app/pedals/pedal-connect-button/pedal-connect-button.{ts,html,spec.ts}` | new |
| `src/app/app.ts`, `src/app/app.html`, `src/app/app.spec.ts` | header changes, mock-link navigation |
| `src/app/app.routes.ts`, `src/app/app.routes.spec.ts` | `/songs/:id` |
| `src/app/pedals/pedal-presets.store.ts` / `.spec.ts` | new — deduped read, snapshot (§8b) |
| `src/app/pedals/preset-browser-page/preset-browser-page.ts` | `loadPresets()` delegates to the store + mirroring `effect` (§8b); template unchanged |
| `src/app/pedals/preset-browser-page/preset-browser-page.spec.ts` | + R55/R56/R64/R66 tests; existing tests stay green |
| `src/app/songs/i18n-parity.spec.ts` | extend F5's file: namespaces + scanner sources (§11); + R81 exact-copy test |
| `public/i18n/es.json`, `public/i18n/en.json` | missing keys only; `writeToPedal.not_connected` changed; `songs.placeholder` removed |
| `specs/import_preset_to_pedal/design.md` | doc sync of the `writeToPedal.not_connected` copy row and "from the header" wording (§5b) |

`preset-browser-page.html`, `src/app/songs/save-song-dialog/*`, `write-to-pedal-dialog.{ts,html}`,
`app.config.ts` and the `/pedal` page are not modified.

## 13. Error paths

| Situation | Behavior |
|---|---|
| Backend down / offline (`status 0`) on list | `songs-error` + `songs.errors.unreachable` + retry (R20, R22) |
| 5xx / other on list | `songs-error` + `songs.errors.load_failed` + retry (R21, R22) |
| 401 on list or detail | interceptor clears the token; page shows session-expired + `/login` link (R24, R41). No auto-redirect: the user keeps context and chooses. |
| No token at all | `authGuard` redirects to `/login` before the page exists (R26; existing for `/songs`) |
| Detail 404 (deleted / foreign / malformed id) | `song-detail-not-found` + back link (R37, R42) |
| Cover 404 | placeholder `none` (R16) |
| Cover other failure (incl. offline, 401) | placeholder `error`, list intact (R17, R18) |
| Web MIDI unsupported | connect button disabled with hint (R49); library unaffected |
| `connect()` rejects | header error strip, dismissible (R53, R54); no navigation |
| Header-triggered fresh read fails | store `error`; `/pedal/presets` shows its existing `preset-error` message via the mirror (R66) |
| Pedal unplugged while the library "New song" dialog is open | dialog stays open with its rows; save uploads the in-memory bytes (R72, R73) |
| Read requested while an F5 write holds the MIDI channel | `readPresets()` rejects `request_in_progress`; store `error` → `presetBrowser.request_in_progress` on `/pedal/presets` (§8b) |
| Ports come back after an unplug (F28 silent reconnect) | `connected` again, no new read; store keeps the last read (§8b) |
| Not connected inside the write dialog | F5 reminder (new copy, R81) + inline connect button; connects in place, no navigation, no read (R82-R84) |

## Discarded alternatives

1. **Inline expand (accordion) of a song inside the list instead of a `/songs/:id` route.** Rejected: a detail
   route is deep-linkable, gives the back button meaning, keeps the 375px grid simple, and lets the detail page own
   its own `GET /songs/:id` (the only call that returns `files`, needed to know whether a cover exists — R35/R36).
2. **Master–detail split view at ≥1024px.** Rejected for this feature: two layouts to test for little gain with 1-2
   songs on the free/basic plans; can be layered on later without changing the route model.
3. **`<img src="${apiBaseUrl}/songs/:id/files/cover">`.** Rejected: an `<img>` request cannot send the Bearer token
   and every cover would 401 (contract §Auth).
4. **Fetch `GET /songs/:id` for every listed song to learn whether it has a cover.** Rejected: same N extra requests
   as fetching the cover directly, but then a second request for the bytes. A backend `hasCover` flag on the list DTO
   is the clean fix; it is being proposed as a separate backend card, and F26 does not depend on it (§4).
5. **Lazy cover loading with `IntersectionObserver` / a concurrency limiter.** Rejected as premature: the browser
   already queues per-host connections and plan limits keep lists tiny; revisit if premium libraries grow large.
6. **Comparing saved presets with pedal presets after a read (feature 25).** Rejected by the user (2026-10-02):
   saved presets are independent copies; F25 was superseded by this feature.
7. **Put the connect logic directly in the header component.** Rejected: the empty-state CTA (R12) needs the same flow
   and error; a root service shares it and is testable without rendering the shell.
8. **A "read requested" counter signal that `PresetBrowserPage` watches, keeping the read inside the page.** Rejected:
   the library "New song" snapshot (R68) also needs the last read presets outside that page, so the presets must live
   in a root store anyway; once they do, the read belongs there too, with dedupe in one place.
9. **Bind the library dialog to `PedalPresetsStore.presets()` live** (so a reconnect during the dialog adds presets).
   Rejected: the F4 dialog re-seeds its rows whenever its inputs change (constructor `effect`), which would wipe the
   user's work; F4 R26 already chose the snapshot model.
10. **Whole card as an `<a>` (Revision 2's design).** Rejected in Revision 3: F5's "Send to pedal" `<button>` lives
    inside the card (F5 R53), and a button inside a link is invalid interactive nesting (unpredictable activation,
    screen readers announce a link containing a button). Ricardo chose the name as the only link (2026-10-07).
11. **"Stretched link"** (name link with an `after:absolute after:inset-0` overlay so the whole card is clickable,
    send button raised with `relative z-10`). Rejected: it makes the card behave as a link again, against Ricardo's
    decision, and puts a navigation target millimetres from the write action on a 375px screen.
12. **Remove F5's inline connect button and point users to the header** (the 2026-10-07 follow-up). Rejected by
    Ricardo the same day: the modal backdrop covers the header, and the header button navigates to `/pedal/presets`
    and reads 100 presets, so the user would lose the dialog to connect. The button stays; only its reminder copy
    changes (R81).
13. **Make F5's optional `Song` fields required.** Rejected: every F5 fixture omits them and F26 reads none of them
    besides `artist`, which `isBlank` already treats as blank when `undefined`.

## Visual direction

Written by the spec author with the `frontend-design:frontend-design` skill loaded. Constraint: the app has a settled
language (slate neutrals, indigo action color, `rounded-md`/`rounded-lg`, dashed borders for "add", F4's dialog);
this screen must belong to it, not introduce a new look. Revision 3's card changes were also written with the skill
loaded: the card stops being one big hover target and becomes a quiet stack (cover, name link, artist, count, F5's
send button), so the covers stay the memorable element.

**The one memorable element: covers.** The library reads like a crate of records — square cover art first, name and
artist under it, nothing else competing. Songs without a cover get a quiet in-house guitar-pick mark, so the grid
stays rhythmic instead of showing broken images. Everything else (header, states, detail rows) is plain and
disciplined. The detail page's numbered rows are justified: a song's presets *are* a running order (`sortOrder`).

### Palette (literal class strings)

| Element | Classes |
|---|---|
| Header (existing `<header>` in `app.html`) | `flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700` (replaces `justify-end`) |
| Brand link `nav-songs` | `mr-auto rounded-md px-1 text-sm font-semibold text-slate-900 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| Connect button (`pedal-connect`) | `inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600` |
| Connected dot (inside button, only while `connected`, `aria-hidden="true"`) | `size-1.5 rounded-full bg-emerald-300` |
| Connect error strip (`pedal-connect-error`, `role="alert"`) | `flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300` |
| Error strip dismiss (`pedal-connect-error-dismiss`, icon ×, `aria-label` `pedalButton.dismiss_error`) | `shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600` |
| Page container (library + detail) | `mx-auto max-w-5xl px-4 py-8 sm:py-10` |
| Library title row | `flex flex-wrap items-center justify-between gap-3`; `<h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">` (`songs.title`) |
| "New song" (`songs-new`) | same as F4 page entry button: `inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600 hover:bg-indigo-50 dark:bg-slate-900 dark:text-indigo-300 dark:ring-indigo-400 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600` with `<span aria-hidden="true">+</span>` |
| Grid (`songs-grid`) | `mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4` (R10) |
| Card (`song-card`, `<li>`, not interactive — Revision 3) | `flex min-w-0 flex-col` (no hover background, no focus ring: the card itself is not a control) |
| Cover tile (`song-cover`, size `tile`) | `relative aspect-square w-full overflow-hidden rounded-md bg-slate-200 ring-1 ring-inset ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10` |
| Cover hero (size `hero`) | `relative aspect-square w-32 shrink-0 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-inset ring-slate-900/5 sm:w-40 dark:bg-slate-800 dark:ring-white/10` |
| Cover image | `absolute inset-0 size-full object-cover` |
| Cover loading (append to tile/hero) | `animate-pulse motion-reduce:animate-none` |
| Cover placeholder mark (`none` and `error`, `aria-hidden="true"`) | centered SVG `absolute inset-0 m-auto size-1/3 text-slate-400 dark:text-slate-500` — a guitar-pick outline drawn in-house: `viewBox="0 0 24 24"`, path `M12 21c-1.6 0-7-6.8-7-11.6C5 5.6 8.1 3 12 3s7 2.6 7 6.4C19 14.2 13.6 21 12 21z`, `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"` |
| Card name link (`song-card-link`, `<a>`) | `mt-2 block truncate rounded-sm text-sm font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline dark:text-slate-100 dark:hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| Card artist (`song-card-artist`) | `truncate text-xs text-slate-600 dark:text-slate-400` |
| Card preset count (`song-card-count`) | `mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-500` |
| Card "Send to pedal" (`song-card-send-to-pedal`, F5) | F5's class string unchanged, plus `mt-2` (it already has `self-start`); last element of the card, below the count |
| Loading (`songs-loading`) | the grid with 4 skeleton cards: each a cover tile + `animate-pulse motion-reduce:animate-none` + two bars `mt-2 h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800` and `mt-1 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800`; container gets `aria-busy="true"` and an `sr-only` `songs.loading`. The skeleton elements carry no text, so the `sr-only` label is the container's only text (F5's loading test compares the trimmed `textContent` to the copy) |
| Empty state (`songs-empty`) | `mt-6 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-600`; pick mark `mx-auto size-10 text-slate-400 dark:text-slate-500`; title `mt-3 text-base font-semibold text-slate-900 dark:text-slate-100`; body `mx-auto mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400`; CTA `songs-empty-connect` = connect-button classes + `mt-5` |
| Error state (`songs-error`, `song-detail-error`, `role="alert"`) | `mt-6 flex flex-col items-start gap-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200 sm:flex-row sm:items-center sm:justify-between dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900`; the message is a `<p>` (`songs-error-message` on the library page, R79) with no extra classes, followed by the retry button |
| Retry (`songs-retry`, `song-detail-retry`) | `rounded-md bg-white px-3 py-1.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 dark:bg-transparent dark:text-red-300 dark:ring-red-800 dark:hover:bg-red-950/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600` |
| Session expired (`songs-session-expired`, `song-detail-session-expired`, `role="status"`) | `mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900`; link `ml-1 font-medium underline` → `/login`, text `songs.login_again` |
| Back link (`song-detail-back`) | `inline-flex items-center gap-1 rounded-md text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`; leading chevron SVG `size-4` path `M10 4 6 8l4 4`, `aria-hidden="true"` |
| Detail head | `mt-4 flex flex-col gap-4 sm:flex-row sm:items-end`; `<h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100 break-words">`; artist `mt-1 text-sm text-slate-600 dark:text-slate-400` |
| Detail loading (`song-detail-loading`) | hero tile with pulse + bars as above, `aria-busy="true"` |
| Presets heading | `mt-8 text-sm font-medium text-slate-700 dark:text-slate-300` (`songDetail.presets_heading`) |
| Preset list `<ol>` | `mt-2 divide-y divide-slate-200 rounded-lg bg-white ring-1 ring-inset ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700` (same family as F4's list) |
| Preset row (`song-preset-row`) | `grid grid-cols-[1.5rem_1fr] items-baseline gap-x-2 px-3 py-2.5`; position `text-right text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500`; name `truncate text-sm font-medium text-slate-900 dark:text-slate-100` |
| Reference note (`song-reference-note`) | `mt-2 text-xs text-slate-500 dark:text-slate-400` |
| Not found (`song-detail-not-found`) | `mt-6 rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400` |

### Type

App default sans, no new font. Scale: `text-2xl` page titles, `text-base` empty-state title, `text-sm` names, rows,
states, `text-xs` artist, counts, header controls, notes. Sentence case; no uppercase eyebrows; no `→` on buttons;
no middle-dot meta strings (artist and count are separate lines).

### Layout per breakpoint

```
< 640px (375 target)                    ≥ 640px (1280 target)
┌────────────────────────────────┐      ┌──────────────────────── max-w-5xl ─────────────────────────┐
│Mis canciones  ES 🌙 ⇩prueba     │      │ Mis canciones                ES 🌙 ⇩ Cargar presets  [Conectar al GP-5] │
│                [Conectar GP-5] │(wrap)├────────────────────────────────────────────────────────────┤
├────────────────────────────────┤      │ Mis canciones                               [+ Nueva canción] │
│ Mis canciones  [+ Nueva canción]│      │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   (lg: 4 cols, sm: 3)   │
│ ┌──────────┐ ┌──────────┐      │      │ │cover │ │cover │ │ pick │ │cover │                          │
│ │  cover   │ │  pick ◇  │      │      │ └──────┘ └──────┘ └──────┘ └──────┘                          │
│ └──────────┘ └──────────┘      │      │ Name      Name     Name     Name                             │
│ Name         Name              │      │ Artist    Artist            Artist                           │
│ Artist       2 presets         │      │ 3 presets 1 preset ...                                       │
│ 1 preset                       │      └────────────────────────────────────────────────────────────┘
└────────────────────────────────┘
Detail < 640: back link, hero cover (w-32) stacked above title/artist, then the numbered list full width.
Detail ≥ 640: hero cover (w-40) left, title/artist bottom-aligned to its right; list below, full container width.
```

Each library card ends with F5's "Send to pedal" button below the preset count (not drawn above); at 375px it fits
the two-column tile width (`text-xs`, `px-3`).

No horizontal scroll at 375px: header wraps (`flex-wrap`), names `truncate`, detail title `break-words`.

### Interaction states

- Card (Revision 3): the card has no hover or focus state of its own. The name link turns indigo and underlines on
  hover and gets the indigo focus-visible outline; the "Send to pedal" button keeps F5's hover/focus. Tab order per
  card: name link, then "Send to pedal". No selected state (navigation, not selection). The cover is not clickable.
- Connect button: hover `bg-indigo-500`; disabled (`connecting`, unsupported) `opacity-50 cursor-not-allowed`;
  connected shows the emerald dot before the label.
- Retry/dismiss/back/new: hover per palette; focus-visible outlines on every control.

### Motion

Exactly one: `animate-pulse` on loading skeletons/cover tiles, always paired with `motion-reduce:animate-none`. No
entrance animations, no hover transitions beyond color.

### UI copy

"Status" column (Revision 3): **exists** = already in `es.json`/`en.json` with this copy (F5 or earlier), do not
re-add; **new** = add; **changed** = replace the current value.

| Key | es | en | Status |
|---|---|---|---|
| `songs.title` | Mis canciones | My songs | exists |
| `songs.new` | Nueva canción | New song | new |
| `songs.loading` | Cargando tus canciones… | Loading your songs… | exists |
| `songs.preset_count_one` | 1 preset | 1 preset | new |
| `songs.preset_count_other` | {{count}} presets | {{count}} presets | new |
| `songs.cover_alt` | Portada de {{name}} | Cover of {{name}} | new |
| `songs.empty_title` | Aún no tienes canciones | No songs yet | exists |
| `songs.empty_body` | Conecta tu GP-5, elige los presets que usas en una canción y guárdalos juntos. También puedes crear una canción desde archivos .prst. | Connect your GP-5, pick the presets you use in a song and save them together. You can also create a song from .prst files. | exists |
| `songs.empty_connect` | Conectar al GP-5 | Connect to GP-5 | new |
| `songs.retry` | Reintentar | Try again | exists |
| `songs.login_again` | Iniciar sesión | Log in | exists |
| `songs.errors.unreachable` | No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo. | Couldn't reach the server. Check your connection and try again. | exists |
| `songs.errors.load_failed` | No se pudieron cargar tus canciones. | Your songs couldn't be loaded. | exists |
| `songs.errors.session_expired` | Tu sesión ha caducado. | Your session has expired. | exists |
| `songDetail.presets_heading` | Presets, en orden de uso | Presets, in running order | new |
| `songDetail.reference_note` | Cada nombre viene del propio archivo de preset y es solo una referencia: no se compara con lo que tenga ahora tu pedal. | Each name comes from the preset file itself and is for reference only: it is never compared with what your pedal holds now. | new |
| `songDetail.not_found` | Esta canción no existe o ya no está en tu librería. | This song doesn't exist or is no longer in your library. | new |
| `pedalButton.connect` | Conectar al GP-5 | Connect to GP-5 | new |
| `pedalButton.connecting` | Conectando… | Connecting… | new |
| `pedalButton.reading` | Leyendo presets… | Reading presets… | new |
| `pedalButton.read` | Leer presets del GP-5 | Read GP-5 presets | new |
| `pedalButton.unsupported_hint` | Tu navegador no soporta Web MIDI | Your browser doesn't support Web MIDI | new |
| `pedalButton.dismiss_error` | Cerrar aviso | Dismiss | new |
| `writeToPedal.not_connected` (F5 key, R81) | Conecta el GP-5 para poder escribir en el pedal. | Connect your GP-5 to write to the pedal. | changed (was "…desde el encabezado…" / "…from the header…") |

Count: Transloco has no plural support configured, so the template picks `songs.preset_count_one` when
`presets.length === 1` and `songs.preset_count_other` (with `count`) otherwise. The `songs.placeholder` key is
removed. F5's `songs.card.send_to_pedal` / `send_to_pedal_aria` and `writeToPedal.connect` / `connecting` are kept
unchanged.
