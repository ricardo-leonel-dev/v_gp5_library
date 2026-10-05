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
/songs        SongsPage        → SongsApi.listSongs()  → GET /songs
  └ New song  <app-save-song-dialog> (F4, unchanged) ← snapshot of PedalPresetsStore.savableSnapshot()
  └ card ×N   <app-song-cover> → SongsApi.getCover(id) → GET /songs/:id/files/cover (blob)
/songs/:id    SongDetailPage   → SongsApi.getSong(id)  → GET /songs/:id
                                 <app-song-cover [hasCover]>
/pedal/presets PresetBrowserPage (read moves into PedalPresetsStore; page mirrors it; F4 dialog unchanged)
```

The library pages never inject `WebMidiPedalConnection` or `MockPresetsStore`, and the song list/cards never read any
pedal state (R56, R57, R69). The only pedal-derived input on the library page is the "New song" snapshot, taken from
`PedalPresetsStore` at the moment the button is activated (R60, R68). Pedal and backend meet only inside the F4
dialog, exactly as `docs/architecture.md` "Data Flow" prescribes.

## 1. Models — `src/app/songs/song.ts`

Keep `CreatedSong` (F4). Add, mirroring the backend DTOs field-for-field (contract §GET /songs, §GET /songs/:id):

```ts
export interface SongPreset {
  id: string;
  sortOrder: number;
  name: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface Song {
  id: string;
  name: string;
  artist: string | null;
  extraConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  presets: SongPreset[];
}

export interface SongFile {
  id: string;
  kind: 'ir' | 'nam' | 'cover';
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface SongDetail extends Song {
  files: SongFile[];
}
```

Pure helpers in the same file (TestBed-free tests):

```ts
export function orderedPresets(presets: readonly SongPreset[]): SongPreset[]; // copy sorted by sortOrder asc (R31)
export function hasCoverFile(files: readonly SongFile[]): boolean;           // some kind === 'cover' (R35, R36)
export function isBlank(value: string | null | undefined): boolean;          // R7, R8, R30
```

## 2. API — `src/app/songs/songs-api.service.ts`

Extend the existing `SongsApi` (do not create a parallel service):

```ts
listSongs(): Promise<Song[]>                 // GET  ${apiBaseUrl}/songs
getSong(id: string): Promise<SongDetail>     // GET  ${apiBaseUrl}/songs/${encodeURIComponent(id)}
getCover(id: string): Promise<Blob>          // GET  ${apiBaseUrl}/songs/${encodeURIComponent(id)}/files/cover, responseType 'blob'
```

All via `firstValueFrom`. `authInterceptor` adds the Bearer token and clears `AuthStore` on 401 — unchanged. Covers
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

## 5. Library page — `src/app/songs/songs-page/songs-page.{ts,html}` (rewrite of the placeholder)

```ts
type LibraryState = 'loading' | 'loaded' | 'error' | 'session_expired';
readonly state = signal<LibraryState>('loading');
readonly songs = signal<Song[]>([]);
readonly errorKey = signal<string | null>(null);
// Snapshot taken once per open; null while closed (R60, R68, R71, R74).
readonly newSong = signal<{ initial: readonly Preset[]; available: readonly Preset[] } | null>(null);
private readonly api = inject(SongsApi);
private readonly pedalPresets = inject(PedalPresetsStore);
readonly connectFlow = inject(PedalConnectFlow);   // only for the empty-state CTA (R12)

ngOnInit(): void { void this.load(); }             // R2
async load(): Promise<void>;                        // R2, R23, R61 — sets 'loading' then result
retry(): void;                                      // R23
openNewSong(): void;    // newSong.set({ initial: [], available: this.pedalPresets.savableSnapshot() })
closeNewSong(): void;   // newSong.set(null); void load()   (R61)
```

- `loaded` + empty array → empty state (R11, R12); `loaded` + items → grid (R5, R10). `songs-new` renders in both
  (R59).
- Each card is an `<a [routerLink]="['/songs', song.id]">` (R25) — native link semantics, keyboard-reachable.
- Renders songs in response order (backend: newest first). No client re-sort (R5).
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
  `router.navigateByUrl('/pedal/presets')` (R58). Without this, clicking it on `/songs` did nothing visible.

## 11. i18n — `public/i18n/{es,en}.json`

Replace `songs.placeholder` (removed) with the keys in "UI copy" below; add namespaces `songDetail` and
`pedalButton`. The existing `src/app/songs/i18n-parity.spec.ts` pattern is extended to cover `songs`, `songDetail`,
`pedalButton` (R62). Reused existing keys: `pedal.midi_access_denied`, `pedal.gp5_not_found`, `pedal.unsupported`,
`pedal.unknown`, `presetBrowser.load_test_presets`.

## 12. Files touched

| File | Change |
|---|---|
| `src/app/songs/song.ts` | + `SongPreset`, `Song`, `SongFile`, `SongDetail`, `orderedPresets`, `hasCoverFile`, `isBlank`, `coverHintForListSong` |
| `src/app/songs/song.spec.ts` | new — pure helper tests |
| `src/app/songs/songs-api.service.ts` / `.spec.ts` | + `listSongs`, `getSong`, `getCover` |
| `src/app/songs/library-load-error.ts` / `.spec.ts` | new |
| `src/app/songs/song-cover/song-cover.{ts,html,spec.ts}` | new |
| `src/app/songs/songs-page/songs-page.{ts,html}` + new `songs-page.spec.ts` | rewrite |
| `src/app/songs/song-detail-page/song-detail-page.{ts,html,spec.ts}` | new |
| `src/app/pedals/pedal-connect-flow.service.ts` / `.spec.ts` | new |
| `src/app/pedals/pedal-connect-button/pedal-connect-button.{ts,html,spec.ts}` | new |
| `src/app/app.ts`, `src/app/app.html`, `src/app/app.spec.ts` | header changes, mock-link navigation |
| `src/app/app.routes.ts`, `src/app/app.routes.spec.ts` | `/songs/:id` |
| `src/app/pedals/pedal-presets.store.ts` / `.spec.ts` | new — deduped read, snapshot (§8b) |
| `src/app/pedals/preset-browser-page/preset-browser-page.ts` | `loadPresets()` delegates to the store + mirroring `effect` (§8b); template unchanged |
| `src/app/pedals/preset-browser-page/preset-browser-page.spec.ts` | + R55/R56/R64/R66 tests; existing tests stay green |
| `src/app/songs/i18n-parity.spec.ts` | extend namespaces |
| `public/i18n/es.json`, `public/i18n/en.json` | keys |

`preset-browser-page.html`, `src/app/songs/save-song-dialog/*` and the `/pedal` page are not modified.

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

## Visual direction

Written by the spec author with the `frontend-design:frontend-design` skill loaded. Constraint: the app has a settled
language (slate neutrals, indigo action color, `rounded-md`/`rounded-lg`, dashed borders for "add", F4's dialog);
this screen must belong to it, not introduce a new look.

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
| Card (`song-card`, `<a>`) | `group block rounded-lg p-1.5 -m-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500` |
| Cover tile (`song-cover`, size `tile`) | `relative aspect-square w-full overflow-hidden rounded-md bg-slate-200 ring-1 ring-inset ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10` |
| Cover hero (size `hero`) | `relative aspect-square w-32 shrink-0 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-inset ring-slate-900/5 sm:w-40 dark:bg-slate-800 dark:ring-white/10` |
| Cover image | `absolute inset-0 size-full object-cover` |
| Cover loading (append to tile/hero) | `animate-pulse motion-reduce:animate-none` |
| Cover placeholder mark (`none` and `error`, `aria-hidden="true"`) | centered SVG `absolute inset-0 m-auto size-1/3 text-slate-400 dark:text-slate-500` — a guitar-pick outline drawn in-house: `viewBox="0 0 24 24"`, path `M12 21c-1.6 0-7-6.8-7-11.6C5 5.6 8.1 3 12 3s7 2.6 7 6.4C19 14.2 13.6 21 12 21z`, `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"` |
| Card name | `mt-2 truncate text-sm font-medium text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300` |
| Card artist (`song-card-artist`) | `truncate text-xs text-slate-600 dark:text-slate-400` |
| Card preset count | `mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-500` |
| Loading (`songs-loading`) | the grid with 4 skeleton cards: each a cover tile + `animate-pulse motion-reduce:animate-none` + two bars `mt-2 h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800` and `mt-1 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800`; container gets `aria-busy="true"` and an `sr-only` `songs.loading` |
| Empty state (`songs-empty`) | `mt-6 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-600`; pick mark `mx-auto size-10 text-slate-400 dark:text-slate-500`; title `mt-3 text-base font-semibold text-slate-900 dark:text-slate-100`; body `mx-auto mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400`; CTA `songs-empty-connect` = connect-button classes + `mt-5` |
| Error state (`songs-error`, `song-detail-error`, `role="alert"`) | `mt-6 flex flex-col items-start gap-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200 sm:flex-row sm:items-center sm:justify-between dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900` |
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

No horizontal scroll at 375px: header wraps (`flex-wrap`), names `truncate`, detail title `break-words`.

### Interaction states

- Card: hover `bg-slate-100`/`dark:bg-slate-800` behind the whole card and the name turns indigo; focus-visible
  indigo outline on the `<a>`. No selected state (navigation, not selection).
- Connect button: hover `bg-indigo-500`; disabled (`connecting`, unsupported) `opacity-50 cursor-not-allowed`;
  connected shows the emerald dot before the label.
- Retry/dismiss/back/new: hover per palette; focus-visible outlines on every control.

### Motion

Exactly one: `animate-pulse` on loading skeletons/cover tiles, always paired with `motion-reduce:animate-none`. No
entrance animations, no hover transitions beyond color.

### UI copy

| Key | es | en |
|---|---|---|
| `songs.title` | Mis canciones | My songs |
| `songs.new` | Nueva canción | New song |
| `songs.loading` | Cargando tus canciones… | Loading your songs… |
| `songs.preset_count_one` | 1 preset | 1 preset |
| `songs.preset_count_other` | {{count}} presets | {{count}} presets |
| `songs.cover_alt` | Portada de {{name}} | Cover of {{name}} |
| `songs.empty_title` | Aún no tienes canciones | No songs yet |
| `songs.empty_body` | Conecta tu GP-5, elige los presets que usas en una canción y guárdalos juntos. También puedes crear una canción desde archivos .prst. | Connect your GP-5, pick the presets you use in a song and save them together. You can also create a song from .prst files. |
| `songs.empty_connect` | Conectar al GP-5 | Connect to GP-5 |
| `songs.retry` | Reintentar | Try again |
| `songs.login_again` | Iniciar sesión | Log in |
| `songs.errors.unreachable` | No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo. | Couldn't reach the server. Check your connection and try again. |
| `songs.errors.load_failed` | No se pudieron cargar tus canciones. | Your songs couldn't be loaded. |
| `songs.errors.session_expired` | Tu sesión ha caducado. | Your session has expired. |
| `songDetail.presets_heading` | Presets, en orden de uso | Presets, in running order |
| `songDetail.reference_note` | Cada nombre viene del propio archivo de preset y es solo una referencia: no se compara con lo que tenga ahora tu pedal. | Each name comes from the preset file itself and is for reference only: it is never compared with what your pedal holds now. |
| `songDetail.not_found` | Esta canción no existe o ya no está en tu librería. | This song doesn't exist or is no longer in your library. |
| `pedalButton.connect` | Conectar al GP-5 | Connect to GP-5 |
| `pedalButton.connecting` | Conectando… | Connecting… |
| `pedalButton.reading` | Leyendo presets… | Reading presets… |
| `pedalButton.read` | Leer presets del GP-5 | Read GP-5 presets |
| `pedalButton.unsupported_hint` | Tu navegador no soporta Web MIDI | Your browser doesn't support Web MIDI |
| `pedalButton.dismiss_error` | Cerrar aviso | Dismiss |

Count: Transloco has no plural support configured, so the template picks `songs.preset_count_one` when
`presets.length === 1` and `songs.preset_count_other` (with `count`) otherwise. The `songs.placeholder` key is
removed.
