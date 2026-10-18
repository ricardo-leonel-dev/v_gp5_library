# Design — F33 `song_detail_files_and_extra_config`

Conventions come from `docs/architecture.md` (layers, signals, bespoke Tailwind, design system §2b) and
`docs/conventions.md` (Transloco for every string, colocated Vitest specs, pure logic without TestBed). This file
only records the choices made inside those rules.

## 1. Starting point

- `src/app/songs/song.ts`: `SongFile` (`kind: 'ir' | 'nam' | 'cover'`, `byteSize`, `sortOrder`,
  `originalFilename`), `SongDetail extends Song { files }`, `Song.extraConfig?: Record<string, unknown>`.
  Pure helpers `orderedPresets`, `hasCoverFile` already follow the "pure, never mutates input" rule.
- `src/app/songs/songs-api.service.ts`: `getSong(id)` already returns `SongDetail`. **Not modified.**
- `src/app/songs/song-detail-page/song-detail-page.{ts,html}`: `song` signal, `state` signal, `@switch (state())`.
  The loaded branch ends with `<p data-testid="song-reference-note">`.
- Backend shape verified in `../backend/src/songs/song-service.ts` (`SongFileDto`, `parseExtraConfig`,
  `getSongWithFiles` → `ORDER BY kind ASC, sort_order ASC`). See requirements "Data contract".

## 2. Pure helpers (`src/app/songs/song.ts`)

```ts
// R2-R4. Filters out 'cover' and returns a new array: 'ir' first, then 'nam', each by sortOrder ascending.
export function userFiles(files: readonly SongFile[]): SongFile[];

// R9-R12. `lang` is the active Transloco language ('es' | 'en'; anything else falls back to Intl's default).
export interface FormattedByteSize {
  readonly key: 'songDetail.size_mb' | 'songDetail.size_mb_below_min';
  readonly value: string; // already locale-formatted: '0,00', '0.03', '1024,00'
}
export function formatByteSize(bytes: number, lang: string): FormattedByteSize;

// R15-R20.
export type ExtraConfigValueKind = 'text' | 'json' | 'empty';
export interface ExtraConfigEntry {
  readonly key: string;
  readonly value: string;          // display text; '' when kind === 'empty'
  readonly kind: ExtraConfigValueKind;
}
export function extraConfigEntries(extraConfig: unknown): ExtraConfigEntry[];
```

`formatByteSize` (A3, MB only, 1 MB = 1048576 bytes):
- One formatter: `new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2,
  useGrouping: false, roundingMode: 'halfExpand' })`. `halfExpand` (half away from zero) is already Intl's default;
  it is passed explicitly so the rule is visible. `useGrouping: false` keeps `1024,00` / `1024.00` instead of a
  language-dependent thousands separator.
- `bytes === 0` → `{ key: size_mb, value: fmt(0) }` → `0,00` / `0.00` (R10).
- `1 <= bytes <= 5242` → `{ key: size_mb_below_min, value: fmt(0.01) }` → rendered `< 0,01 MB` (R11). 5242 is the
  largest integer with `bytes / 1048576 < 0.005` (0.005 MB = 5242.88 bytes), i.e. every size that would otherwise
  print `0.00` while the file is not empty.
- `bytes >= 5243` → `{ key: size_mb, value: fmt(bytes / 1048576) }` (R9). Dividing an integer by a power of two is
  exact in IEEE-754 doubles, so the half-way cases (e.g. `131072` = 0.125 MB → `0.13`) round as stated, with no
  float noise.
- Negative or non-finite input is not produced by the backend (`byte_size` is a non-negative int); the function
  treats it as `0` (R10 path) rather than throwing, so a bad row can never break the page. A non-integer positive
  input below 5243 follows the `1..5242` branch (any `0 < bytes < 5243`).

`extraConfigEntries`:
- Not a plain object (`null`, array, primitive, `undefined`) → `[]` (R20).
- For each `key` of `Object.keys(obj)` (R15, A4): string → `trim() === ''` ? `{ kind: 'empty', value: '' }` (R19)
  : `{ kind: 'text', value }` (R16); number/boolean → `{ kind: 'text', value: String(v) }` (R17);
  `null`/array/object → `{ kind: 'json', value: JSON.stringify(v) }` (R18). Any other type (cannot come from JSON)
  → `json` of `String(v)`.

## 3. Component (`song-detail-page.ts`)

Two new `computed` signals, no new injected service:

```ts
readonly userFiles = computed(() => userFiles(this.song()?.files ?? []));           // R2-R4, R13
readonly extraEntries = computed(() => extraConfigEntries(this.song()?.extraConfig)); // R15-R20
fileSize(bytes: number, lang: string): FormattedByteSize { return formatByteSize(bytes, lang); } // R8, R12
```

The language comes from the template: the root container changes from `*transloco="let t"` to
`*transloco="let t; currentLang as lang"`. The Transloco structural directive already exposes `currentLang` in its
view context and refreshes it on every language change (`@jsverse/transloco` `TranslocoDirective`), so R23 needs
no extra subscription and no extra request.

## 4. Template (`song-detail-page.html`)

Inserted inside `@case ('loaded') { @if (song(); as s) { ... } }`, **after** `song-reference-note` (that note
belongs to the preset list). Structure:

```html
<div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="song-detail-extras-grid">
  <section aria-labelledby="song-detail-files-heading" data-testid="song-detail-files"> h2 + <ul> | empty </section>
  <section aria-labelledby="song-detail-extra-heading" data-testid="song-detail-extra"> h2 + <dl> | empty </section>
</div>
```

- Files list is a `<ul>` (no running order to announce, unlike the presets `<ol>`). Track by `f.id`.
- Extra details is a `<dl>`; each pair is a `<div data-testid="song-extra-row">` wrapping `<dt>` + `<dd>`.
- Because the sections live inside the `loaded` case, R22 holds by construction.

## 5. Error paths

None new: the data arrives with the existing `GET /songs/:id`, whose loading/not-found/error/session-expired
states are F26's. Malformed values degrade to safe text (§2) instead of throwing.

## 6. Discarded alternatives

1. **Show the GP-5 user slot each file belongs to ("User IR 3").** Rejected: the backend does not store the slot
   (`sortOrder` is the upload index per kind, not the slot number), so the label would be a guess.
2. **A download button per file using the existing `GET /songs/:id/files/:kind?sort_order=N` + `downloadBytes`.**
   Rejected for this feature: it adds a request, loading and error states per row, and the feature asks for a
   read-only listing (A1). It is a small follow-up if wanted.
3. **Format sizes with Angular's `DecimalPipe`.** Rejected: it needs the locale data registered for `es`
   (`registerLocaleData`), which the app does not do today; `Intl.NumberFormat` works with the language code
   directly and keeps the logic in a pure, TestBed-free function.
4. **1024-based B / KB / MB steps with one decimal (the first draft of A3).** Rejected by the human in spec review:
   one unit for every file makes sizes comparable at a glance, and two decimals keep small IRs readable
   (`0,03 MB`).
5. **Show sub-0.005 MB files as `0,00 MB`.** Rejected: a non-empty file would read as empty; `< 0,01 MB` keeps the
   single unit and stays truthful. Only a real 0-byte file shows `0,00 MB`.
6. **Sort extra details alphabetically.** Rejected (A4): it would invent an order neither the user nor the
   backend chose; keep the response order and let the human decide if this should change.

## 7. Files to touch

| File | Change |
|---|---|
| `src/app/songs/song.ts` | + `userFiles`, `formatByteSize`, `FormattedByteSize`, `extraConfigEntries`, `ExtraConfigEntry`, `ExtraConfigValueKind` |
| `src/app/songs/song.spec.ts` | + pure tests (R3, R4, R9-R12, R15-R20) |
| `src/app/songs/song-detail-page/song-detail-page.ts` | + `userFiles`, `extraEntries` computeds, `fileSize` method, imports |
| `src/app/songs/song-detail-page/song-detail-page.html` | `currentLang as lang`; the two sections (§4, Visual direction) |
| `src/app/songs/song-detail-page/song-detail-page.spec.ts` | + component tests (R1-R8, R13, R14, R19-R26) |
| `public/i18n/en.json`, `public/i18n/es.json` | + 9 keys under `songDetail` (copy table below) |

`songs-api.service.ts` and the backend are not modified.

## 8. Test mapping (grouped, see `docs/specs.md` "Coverage granularity")

| Test (file) | Requirements |
|---|---|
| `userFiles` drops cover, orders ir→nam by sortOrder (`song.spec.ts`) | R3, R4 |
| `formatByteSize` at 0, 1, 5242, 5243, 31457, 131072, 1048576, 1572864, 1073741824, plus -1 and `NaN`, in `en` and `es` (`song.spec.ts`) | R9, R10, R11, R12 |
| `extraConfigEntries` with string, multi-line string, `''`, `'  '`, number, boolean, null, array, object, non-object inputs (`song.spec.ts`) | R15, R16, R17, R18, R19, R20 |
| Loaded song with 2 IR + 1 NAM + 1 cover in shuffled order: section, heading, 3 rows in order, name, `title`, kind label, size text (`song-detail-page.spec.ts`) | R1, R2, R3, R4, R5, R6, R7, R8 |
| Loaded song with only a cover and `extraConfig: {}` → both empty texts, no rows (`song-detail-page.spec.ts`) | R13, R20 |
| Loaded song with mixed `extraConfig` → section, heading, pairs in order, empty-value text, `whitespace-pre-wrap` on text values (`song-detail-page.spec.ts`) | R14, R15, R16, R19 |
| `httpMock.expectNone(/\/files\/(ir|nam)/)` + `httpMock.verify()` after load (`song-detail-page.spec.ts`) | R21 |
| Loading / 404 / 500 / 401 states → neither section present (`song-detail-page.spec.ts`) | R22 |
| Switch active lang `es`→`en` on a loaded page → heading and size text change, no second `GET /songs/:id` (`song-detail-page.spec.ts`) | R12, R23 |
| i18n keys exist in es and en, non-empty (`song-detail-page.spec.ts`, same style as F30's R7 test) | R24 |
| Layout classes: grid `grid-cols-1 lg:grid-cols-2`, rows `min-w-0`, filename `truncate`, size `shrink-0` (`song-detail-page.spec.ts`, same style as F30's R8 test) | R25, R26 |

R25/R26 are also checked manually at 375px and 1280px in the browser (jsdom has no layout), matching F27 R46/R47.

## Visual direction

Written with the `frontend-design:frontend-design` skill loaded. The page palette (slate surfaces, indigo focus,
category colors on the chain board) is fixed by `docs/architecture.md` §2b, so the one distinctive element is the
**kind tag**: each file's IR/NAM tag uses the same category color as the chain block that loads that file —
IR files go into the CAB block, NAM files into the Snap Tone (N→S) block. A player who just looked at the chain
board above recognizes the file's role by color, without a legend. Everything else stays quiet and reuses the
classes already on this page.

### Palette (literal classes)

- Grid wrapper: `mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2`.
- Section heading (same as the presets heading): `text-sm font-medium text-slate-700 dark:text-slate-300`.
- List / definition container (same surface as the presets list):
  `mt-2 divide-y divide-slate-200 rounded-lg bg-white ring-1 ring-inset ring-slate-200 dark:divide-slate-700
  dark:bg-slate-800 dark:ring-slate-700`.
- File row: `flex min-w-0 items-center gap-3 px-3 py-2.5`.
- Kind tag base: `inline-flex w-12 shrink-0 justify-center rounded px-1.5 py-0.5 text-xs font-semibold`
  - IR (CAB palette): `bg-stone-600 text-stone-50 dark:bg-stone-500`
  - NAM (N→S palette): `bg-rose-600 text-white dark:bg-rose-500`
- Filename: `min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100` + `[title]`.
- Size: `shrink-0 text-sm tabular-nums text-slate-500 dark:text-slate-400`.
- Extra pair wrapper: `grid grid-cols-1 gap-x-4 gap-y-0.5 px-3 py-2.5 sm:grid-cols-[minmax(0,10rem)_1fr]`.
- `<dt>`: `min-w-0 break-words text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm`.
- `<dd>` text: `min-w-0 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-100`.
- `<dd>` json: `min-w-0 break-all font-mono text-xs text-slate-700 dark:text-slate-300` (marks it as raw data).
- `<dd>` empty: `text-sm italic text-slate-400 dark:text-slate-500`.
- Empty state (both sections, same as F26's not-found box, smaller):
  `mt-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500
  dark:border-slate-600 dark:text-slate-400`.

### Type

The app's existing sans stack; no new font. Headings `text-sm font-medium`, rows `text-sm`, tags `text-xs
font-semibold`. Sentence case everywhere; tags are the literal abbreviations "IR" and "NAM" (not an all-caps
style applied to words).

### Layout per breakpoint

- **375px:** one column. Files section first, then Extra details. File row: tag | filename (truncates) | size.
  Extra pair: key on its own line above the value (`grid-cols-1`). No horizontal scroll (R25).
- **≥640px (`sm`):** extra pairs become two columns: key (max 10rem) | value.
- **≥1024px (`lg`), checked at 1280px:** the two sections sit side by side in two equal columns inside the existing
  `max-w-5xl` page column (R26).

```
375px                         1280px
User files                    User files                 Extra details
[IR ] Room 412.wav    0.05 MB [IR ] Room 412.wav  0.05 MB  Tuning      Drop D
[NAM] Plexi crunch…    1.30 MB [NAM] Plexi crunch   1.30 MB  Capo        2
Extra details                                              Notes       Solo starts…
Tuning
Drop D
```

### Interaction states

Display only: no hover, focus or selected states, nothing is clickable. Truncated filenames reveal the full name
through the native `title` tooltip. The sections are not focusable.

### Motion

None.

### Accessibility

Each `<section>` has `aria-labelledby` pointing at its `h2` id (`song-detail-files-heading`,
`song-detail-extra-heading`). Kind tags are real text (no `aria-hidden`), so screen readers read "IR" / "NAM"
before the name. Contrast: the tag pairs are the chain board's, already in production.

### UI copy (new keys under `songDetail`)

| Key | en | es |
|---|---|---|
| `files_heading` | User files | Archivos de usuario |
| `files_empty` | No IR or NAM files were saved with this song. | Esta canción no tiene archivos IR ni NAM guardados. |
| `file_kind_ir` | IR | IR |
| `file_kind_nam` | NAM | NAM |
| `size_mb` | {{value}} MB | {{value}} MB |
| `size_mb_below_min` | < {{value}} MB | < {{value}} MB |
| `extra_heading` | Extra details | Datos extra |
| `extra_empty` | No extra details were saved with this song. | Esta canción no tiene datos extra guardados. |
| `extra_value_empty` | (empty) | (vacío) |

"User files" / "Extra details" reuse the save dialog's `saveSong.attachments_legend` / `saveSong.extra_legend`
wording so the same thing keeps the same name from save to detail.
