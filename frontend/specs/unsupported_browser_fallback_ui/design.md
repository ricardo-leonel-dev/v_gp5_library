# Design — `unsupported_browser_fallback_ui` (feature 9)

Conventions: `docs/architecture.md` (signals, no component library, layer rule —
only `src/app/midi/` touches `navigator.requestMIDIAccess`; "What NOT to do": always
check `isSupported()` and show an explicit unsupported state) and
`docs/conventions.md` (standalone components, one folder per component, Transloco
for every user-facing string, colocated Vitest specs). This document only records
choices made inside those rules. Every statement about existing code below was
checked against the files at commit `7d29e9e`.

## Revision notes (rev 2, after human rejection of rev 1)

| Rev 1 defect | Rev 2 fix |
|---|---|
| R10/T10 asserted `/songs` never calls `isSupported()` / never injects the pedal. False: `songs-page.ts:55-56` injects `PedalPresetsStore` and `PedalConnectFlow`, and `PedalConnectFlow` reads `isSupported()` at construction (`pedal-connect-flow.service.ts:20`). | Replaced by R20/R21: list renders normally and no `connect()` / `readPresets()` / `store.read()` / `flow.start()` call. |
| `/songs` empty-state CTA (`songs-empty-connect` → `startConnect()` → `connectFlow.start()`, which returns early on `!supported`) was missing: a silent no-op on Safari. | Added to the glossary as a pedal-connection surface; R19 replaces it with the compact variant. |
| R6 claimed `/pedal/presets` lacked an unsupported branch. False: `preset-browser-page.html:2-5` already renders `<p data-testid="unsupported-message">{{ t('pedal.unsupported') }}</p>` and `ngOnInit` returns early (`preset-browser-page.ts:184`). | R14 replaces that `<p>`; R15 pins the no-read guarantee. No existing spec references `unsupported-message` (verified with grep), so no assertion needs retargeting there. |
| Planned removal of `pedal.unsupported`. Wrong: `PedalConnectFlow.mapError` returns `'unsupported'` (`pedal-connect-flow.service.ts:77-78`) and `app.html:36` renders `t('pedal.' + e)`; specs also use it. | Key kept (R25). |
| `write-to-pedal-dialog.ts` has no `supported` field. | T9 adds `readonly supported = this.pedal.isSupported();`. |
| "No .ts change needed" for template-only tasks. Wrong: standalone components must list `UnsupportedBrowserMessage` in `imports`. | Every consuming component's task states the `imports` change. |
| T1/T11 duplicated existing tests. | R1/R2/R3/R4/R16 are mapped to existing tests by file:line; no new test. |
| `FakePedal.isSupportedResult` described for specs that don't have it. | Fixture mechanism documented per spec file below. |
| Moving the header tooltip to `unsupportedBrowser.header_tooltip` (same text). | Dropped; R16 pins the existing `pedalButton.unsupported_hint` behavior. |
| R13/T13 mismatch on scanned files, wrong parity suite. | R24/T11 list the same files; the suite is `src/app/songs/i18n-parity.spec.ts` (it already scans `app.html` and `pedal-connect-button.html`; `src/app/pedals/i18n-parity.spec.ts` has no source scanner). |
| `/pedal` design said "wrap the whole content". | It already has `@if (!supported) { <p> } @else { … }`; only the `<p>` is replaced. |
| Rev 3 (human request at approval): test presets were invisible on unsupported browsers ("Known limitation" in rev 2). | R26-R28 / T13: `/pedal/presets` renders mock presets under the compact message. |
| Rev 4 (human review, 2026-10-15): the copy assumed the only cause of `isSupported() === false` is the browser. Chrome/Edge/Opera/Firefox also hide `navigator.requestMIDIAccess` on insecure origins, so opening the dev server from a phone at `http://<LAN-IP>:4200` (`npm start` binds `0.0.0.0`) would tell a Chrome user to "open the app in Chrome". | R29-R30 / T4, T5: the component reads `globalThis.isSecureContext` and swaps in HTTPS-specific copy (2 new keys). |

## Files to touch

| File | Change |
|---|---|
| `src/app/shared/unsupported-browser-message/unsupported-browser-message.{ts,html,spec.ts}` | new |
| `src/app/pedals/pedal-connection-page/pedal-connection-page.ts` | add `UnsupportedBrowserMessage` to `imports` |
| `src/app/pedals/pedal-connection-page/pedal-connection-page.html` | replace line 5 `<p>…pedal.unsupported…</p>` with `<app-unsupported-browser-message />` |
| `src/app/pedals/pedal-connection-page/pedal-connection-page.spec.ts` | retarget + extend unsupported test; add R13 test |
| `src/app/pedals/preset-browser-page/preset-browser-page.ts` | add `UnsupportedBrowserMessage` to `imports`; `hasMockPresets` computed; guard in `retryRead()` (T13) |
| `src/app/pedals/preset-browser-page/preset-browser-page.html` | replace lines 3-5 (`<p data-testid="unsupported-message">`) with the full/compact gate (T7, T13); guard `not-connected-message` with `supported` |
| `src/app/pedals/preset-browser-page/preset-browser-page.spec.ts` | new tests (T7, T13) |
| `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.ts` | add `supported` field, `imports` entry, guard in `onConnect()` |
| `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.html` | `@if (!supported) { compact } @else if (connectionState() !== 'connected') { existing block }` |
| `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.spec.ts` | fixture update (all stubs become "supported") + new tests |
| `src/app/songs/songs-page/songs-page.ts` | add `readonly supported = this.connectFlow.supported;` (the field `connectFlow` is private; the template needs a public field) and `imports` entry |
| `src/app/songs/songs-page/songs-page.html` | inside `@case ('empty')`, `@if (supported) { existing button } @else { compact }` |
| `src/app/songs/songs-page/songs-page.spec.ts` | `setupF26` gains a `supported` option; new tests; translations stub gains keys |
| `src/app/songs/i18n-parity.spec.ts` | new `describe` block for F9 |
| `public/i18n/es.json`, `public/i18n/en.json` | new `unsupportedBrowser` namespace (6 keys); nothing removed |
| `docs/architecture.md` | "What NOT to do" bullet points at the shared component |

Not touched: `WebMidiPedalConnection`, `PedalConnectFlow`, `PedalConnectButton`
(R1-R4 and R16 already hold and are pinned by existing tests), `app.html`,
`song-detail-page.*` (injects only `SongsApi`, `ActivatedRoute`, `Router` —
`song-detail-page.ts:58-60` — and renders no pedal control, so no requirement is
needed for it), the codec, auth, backend contract.

## `UnsupportedBrowserMessage`

```ts
// src/app/shared/unsupported-browser-message/unsupported-browser-message.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

export type UnsupportedBrowserVariant = 'full' | 'compact';

@Component({
  selector: 'app-unsupported-browser-message',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unsupported-browser-message.html',
})
export class UnsupportedBrowserMessage {
  readonly variant = input<UnsupportedBrowserVariant>('full');
  // Unique per instance so two messages on one screen never share an id
  // (same pattern as WriteToPedalDialog.titleId).
  readonly titleId = `unsupported-browser-title-${Math.random().toString(36).slice(2, 10)}`;
  // R29/R30: Web MIDI is only exposed in secure contexts, so on http://
  // the cause may be the connection, not the browser. Strict `=== false`:
  // an environment without the property (jsdom) counts as secure.
  readonly insecure = globalThis.isSecureContext === false;
}
```

No outputs, no injected services. The parent decides *whether* to render it (it
already holds `supported`); the component only decides *how*. Template:

```html
<ng-container *transloco="let t">
  @if (variant() === 'compact') {
    <p data-testid="unsupported-browser-message" role="status" data-variant="compact" class="…">
      <span class="…">{{ t('unsupportedBrowser.title') }}</span>
      {{ insecure ? t('unsupportedBrowser.insecure_compact') : t('unsupportedBrowser.browsers') }}
    </p>
  } @else {
    <section data-testid="unsupported-browser-message" role="status" data-variant="full"
             [attr.aria-labelledby]="titleId" class="…">
      <div class="…"><svg …/><h2 [id]="titleId">…title…</h2>
        <p>…insecure ? insecure_body : body…</p><p>…browsers…</p><p>…footnote…</p></div>
    </section>
  }
</ng-container>
```

`role="status"`, not `alert`: the browser is a standing condition, not a runtime
error. The component is not focusable and contains no controls (R9).

### Insecure context (R29, R30)

`isSupported()` keeps its single boolean meaning; the component only picks the
explanation. Reading `globalThis.isSecureContext` is not a Web MIDI call, so the
layer rule (only `src/app/midi/` touches `navigator.requestMIDIAccess`) holds.
In the full variant only the body sentence changes: the browsers line stays
because HTTPS alone is not enough on Safari/iOS. In the compact variant the
browsers line is replaced, since there is room for one sentence and on an
insecure origin "use Chrome" is wrong for most users. Known limit: Safari on
`http://` shows the HTTPS hint first; once on `https://` it shows the normal
message. Telling these apart would need user-agent sniffing (discarded #7).

## Per-surface treatment

| Surface | Today on an unsupported browser | After F9 | Variant | Req |
|---|---|---|---|---|
| `/pedal` | `<h1>` + plain `<p>` with `pedal.unsupported`; `@else` already hides controls | `<h1>` + component | full | R11, R12 |
| `/pedal/presets`, no test presets | plain `<p data-testid="unsupported-message">`; `ngOnInit` returns early | component | full | R14, R15 |
| `/pedal/presets`, test presets loaded | whole page hidden: "Cargar presets de prueba" navigates here and shows nothing usable | compact message above the normal layout (chips, picker, chain board, save as song) | compact | R26, R27, R28 |
| Header `pedal-connect-button` | disabled + `title = pedalButton.unsupported_hint` (F26 R49) | unchanged, pinned | — | R16 |
| `write-to-pedal-dialog` | `writeToPedal.not_connected` reminder + enabled "Conectar GP-5" button whose `onConnect()` rejects and swallows: user is stuck | compact message replaces the reminder block; Send stays disabled (connection state never becomes `connected`) | compact | R17, R18 |
| `/songs` empty state | "Conectar al GP-5" button calls `flow.start()`, which returns immediately: silent no-op | compact message replaces the button; title and `songs.empty_body` remain | compact | R19 |
| `/songs` list | works | unchanged; no pedal I/O | — | R20, R21 |

Why the header button keeps the disabled + tooltip treatment while the empty-state
CTA does not: the header is chrome present on every screen, so a full message there
would be noise, and the explanation is one click away on `/pedal`. The empty-state
CTA is the *primary* action of that screen; a disabled button whose reason lives
only in a `title` tooltip is invisible on iPhone/iPad (no hover), which is exactly
the platform this feature targets. Replacing it with text tells the user why and
what to do.

`onConnect()` gets `if (!this.supported) return;` even though the template hides
the button: it pins the runtime contract (R18) so a future template change can't
silently reintroduce the swallowed rejection.

## Test presets on unsupported browsers (R26-R28)

The header "Cargar presets de prueba" button (`app.html:14-24`) calls
`MockPresetsStore.load()` and navigates to `/pedal/presets`. Mock presets need no
Web MIDI, so the page splits its gate: with no mock presets it shows the full
message (R14); with mock presets it shows the compact message on top and the
normal layout below (R26). The existing constructor effect already mirrors
`mockPresets.presets()` into `presets` and sets `loadState` to `loaded` (the read
effect never fires because `ngOnInit` returns early), so no data-path change is
needed; `hasMockPresets` is a signal, so loading mocks while the page is open
switches the rendering (R27). Everything the layout offers on mock presets —
chips, picker, chain board, block detail, export marks, "Save as song"
(`testMode`) — is pure UI or backend, never Web MIDI. The only pedal-reading
affordances are guarded: `not-connected-message` is hidden on `!supported` (it
would tell the user to connect a pedal they can't connect), and `retryRead()`
returns early (R28; its button is only reachable in `loadState === 'error'`,
which can't happen without a read, but the guard pins the contract).

## Test fixtures (how each spec controls `isSupported()`)

| Spec | Mechanism today | F9 change |
|---|---|---|
| `pedal-connection-page.spec.ts` | `class FakePedal { isSupportedResult = true; … }` (line 51) | set `fake.isSupportedResult = false`; add the `unsupportedBrowser.*` keys to `esTranslations` |
| `preset-browser-page.spec.ts` | `class FakePedal { isSupportedResult = true; … }` (line 136) | same; spy on the real store with `vi.spyOn(TestBed.inject(PedalPresetsStore), 'read')` before `createComponent` |
| `write-to-pedal-dialog.spec.ts` | no `FakePedal`. The first `describe` uses the **real** `WebMidiPedalConnection` (in jsdom `'requestMIDIAccess' in navigator` is false, so it would now be *unsupported*); other tests use inline `stubPedal` objects (≈ lines 196, 228, 258, 326) and `mountStubbed` (≈ line 418) with no `isSupported` method (would throw once the dialog calls it) | add `isSupported: () => true` to every inline stub and `mountStubbed`'s `useValue`; in the first `describe`'s `beforeEach`, `vi.spyOn(WebMidiPedalConnection.prototype, 'isSupported').mockReturnValue(true)` (restored in `afterEach`). New unsupported tests use a stub with `isSupported: () => false` |
| `songs-page.spec.ts` | `setupF26` provides `pedal` with `isSupported: vi.fn(() => true)` and a `connectFlow` fake **without** `supported` (line 548). The F5 `describe` (`setupTestBed`, line 179) uses the real `PedalConnectFlow` + real pedal → unsupported in jsdom | `setupF26(opts.supported?: boolean)`; `connectFlow.supported = opts.supported ?? true` and `pedal.isSupported` returns the same value. Without this, the existing CTA test (line 736) would fail because `undefined` is falsy. F5 `describe`: add the `unsupportedBrowser.*` keys to the stub loader's translations; its empty-state test (line 399) does not assert the CTA, so it stays green |
| `pedal-connect-button.spec.ts` | `setup({ supported })` builds a flow fake (line 29-37) | none; existing test line 93 covers R16 |

## Requirement → test map (grouping per `docs/specs.md` "Coverage granularity")

| Req | Test |
|---|---|
| R1 | existing `web-midi-pedal-connection.spec.ts:279` "returns false on browsers without Web MIDI" |
| R2 | existing `web-midi-pedal-connection.spec.ts:301` "rejects without calling requestMIDIAccess when Web MIDI is unsupported" |
| R3 | existing `web-midi-pedal-connection.spec.ts:329` "…rejects with midi_access_denied when requestMIDIAccess rejects" |
| R4 | existing `pedal-connect-flow.service.spec.ts:139` "R49 — when not supported, start() is a no-op" |
| R5, R6, R7, R8, R9, R29, R30 | new `unsupported-browser-message.spec.ts` |
| R10, R23, R24, R25 | new F9 block in `src/app/songs/i18n-parity.spec.ts` |
| R11, R12 | `pedal-connection-page.spec.ts` (retargeted existing test) |
| R13 | new `pedal-connection-page.spec.ts` test |
| R14, R15 | new `preset-browser-page.spec.ts` tests (T7) |
| R26, R27, R28 | new `preset-browser-page.spec.ts` tests (T13) |
| R16 | existing `pedal-connect-button.spec.ts:93` |
| R17, R18 | new `write-to-pedal-dialog.spec.ts` tests |
| R19, R20, R21 | new `songs-page.spec.ts` tests |
| R22 | existing `pedal-connection-page.spec.ts` "renders the connect control … when Web MIDI is supported", `pedal-connect-button.spec.ts` "clicking the button calls flow.start()", `write-to-pedal-dialog.spec.ts:192`, `songs-page.spec.ts:736` — each extended with `expect(…'[data-testid="unsupported-browser-message"]').toBeNull()` |

## Error paths

| Situation | Behavior |
|---|---|
| No Web MIDI, `/pedal` | R11/R12: message, no controls |
| No Web MIDI, `/pedal/presets` | R14/R15: message, no read |
| No Web MIDI, `/pedal/presets` with test presets | R26-R28: compact message + browsable mock presets, no read |
| No Web MIDI, header button | R16: disabled + tooltip; `start()` is a no-op anyway (R4) |
| No Web MIDI, write dialog | R17/R18: compact message; Send disabled |
| No Web MIDI, `/songs` empty | R19: compact message instead of CTA |
| Web MIDI present, `requestMIDIAccess` rejects | R3/R13: `midi_access_denied` path, no unsupported message |
| Web MIDI present, not connected | R22: unchanged |
| Web MIDI browser, page served over `http://` from a LAN IP | `isSupported()` is `false` (API hidden on insecure origins): same surfaces as an unsupported browser, with HTTPS copy (R29, R30) |
| `connect()` somehow rejects `unsupported` with `supported === true` | unchanged: `mapError` → `app.html` strip renders `pedal.unsupported` (key kept, R25) |

## Discarded alternatives

1. **Global "you are on Safari" banner in `app.html`.** Rejected: the problem is
   scoped to pedal I/O; the library, detail page and settings work. A permanent
   strip on every screen overstates the issue. Per-surface placement shows the
   message exactly where a connect control would otherwise be.
2. **Keep rev 1's "no inputs" component and render a different inline string for
   the compact surfaces (dialog, empty state).** Rejected: it splits the
   explanation across two places, which is what R10 forbids, and the copy would
   drift. One optional `variant` input is the smallest change that keeps a single
   owner of the message. (Rev 1 chose "no inputs" because it only had page-level
   surfaces; the empty-state CTA and the dialog are inline, where the full card is
   too large — a dashed card nested inside the dashed `songs-empty` card, and a
   footnote about saved songs inside a dialog that is already about a saved song.)
3. **Disable the empty-state CTA with a `title` tooltip, like the header button.**
   Rejected: tooltips need hover and do not appear on iPhone/iPad, the main
   unsupported platform; the user would see a dead button with no reason.
4. **Let the component inject `WebMidiPedalConnection` and self-hide when
   supported.** Rejected: every surface already holds `supported` and must branch
   on it anyway to hide its own controls; a second check inside the component
   duplicates the decision and makes the component's tests depend on the pedal.
5. **New `BrowserSupportService`.** Rejected: `PedalConnectFlow.supported` and
   `WebMidiPedalConnection.isSupported()` already provide the boolean.
6. **Remove `pedal.unsupported`.** Rejected: still reachable via
   `mapError` → `app.html:36`.
7. **`WebMidiPedalConnection.unsupportedReason(): 'browser' | 'insecure'`, or
   user-agent sniffing to tell Safari from Chrome on `http://`.** Rejected: the
   first changes the pedal API (out of scope) for a fact that isn't a MIDI
   concern. The second is fragile, and it only improves the Safari-on-http
   case, which goes away once the user follows the HTTPS hint.

## Visual direction

Written with the `frontend-design:frontend-design` skill loaded. The brief is an
existing app with a settled language (slate neutrals, indigo for actions only,
dashed borders for empty/inability states — see `songs-empty` in
`songs-page.html:38`). That language wins over novelty: this is a no-decision
informational state, so the treatment is quiet. The one deliberate choice: copy
that names the real constraint (iPhone/iPad browsers all lack Web MIDI, so
"use Chrome" alone would be wrong advice on iOS).

### Palette and structure (literal class strings)

Full variant:

| Element | Classes |
|---|---|
| Root `<section>` | `mx-auto mt-6 max-w-2xl px-4` (`/pedal/presets`' container has no horizontal padding; on `/pedal` the extra `px-4` only narrows the card slightly) |
| Card `<div>` | `rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-600` |
| Icon `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` | `mx-auto size-10 text-slate-400 dark:text-slate-500`; paths: `M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0` and `M12 8v5 M12 16.5v.01` (info outline, same stroke weight as the `songs-empty` mark) |
| `<h2 [id]="titleId">` | `mt-4 text-base font-semibold text-slate-900 dark:text-slate-100` |
| Body `<p>` | `mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400` |
| Browsers `<p>` | `mx-auto mt-3 max-w-md text-sm text-slate-700 dark:text-slate-300` |
| Footnote `<p>` | `mx-auto mt-6 max-w-md text-xs text-slate-500 dark:text-slate-400` |

Compact variant (root is the `<p>`):

| Element | Classes |
|---|---|
| Root `<p>` | `text-sm text-slate-600 dark:text-slate-400` |
| Title `<span>` | `font-medium text-slate-900 dark:text-slate-100` |

Host wrappers for the compact variant:
- Dialog: reuse the existing reminder container classes
  `rounded-md bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:ring-slate-700`
  around the component.
- `/songs` empty state: `<div class="mx-auto mt-5 max-w-sm">` (same top margin the
  CTA button had).

No fills, shadows, or indigo: nothing here is actionable.

### Type

App default sans. `text-base` semibold heading, `text-sm` body/browsers,
`text-xs` footnote; compact uses `text-sm` with a `font-medium` title. Sentence
case, no ALL-CAPS labels, no arrows.

### Layout per breakpoint

```
< 640px (375 target)              >= 640px
┌──────────────────────────┐      ┌──────── max-w-2xl ─────────┐
│        (i)               │      │            (i)              │
│ Este navegador no puede  │      │ This browser can't connect  │
│ conectarse al GP-5       │      │ to the GP-5                 │
│ body (max-w-md)          │      │ body (max-w-md, centered)   │
│ browsers                 │      │ browsers                    │
│ footnote                 │      │ footnote                    │
└──────────────────────────┘      └─────────────────────────────┘
```

Everything stacks and is centered at all widths; `max-w-md` keeps lines under
~70 characters. No horizontal scroll at 375px. Compact variant is left-aligned in
the dialog (matches the reminder it replaces) and centered in `songs-empty`
(inherits the card's `text-center`).

### Interaction states

None: no hover, focus, selected or disabled states, because the component has no
interactive elements (R9) and is not in the tab order. The header button's existing
`disabled:cursor-not-allowed disabled:opacity-50` is unchanged.

### Motion

None. The user is not waiting for anything.

### UI copy

| Key | es | en | Status |
|---|---|---|---|
| `unsupportedBrowser.title` | Este navegador no puede conectarse al GP-5. | This browser can't connect to the GP-5. | new |
| `unsupportedBrowser.body` | Conectar el pedal y leer o escribir sus presets requiere Web MIDI. Safari y los navegadores de iPhone y iPad no lo ofrecen. | Connecting the pedal and reading or writing its presets needs Web MIDI. Safari and browsers on iPhone and iPad don't provide it. | new |
| `unsupportedBrowser.browsers` | En una computadora o un dispositivo Android, abre la app en Chrome, Edge, Opera, Samsung Internet o Firefox 108+. | On a computer or Android device, open the app in Chrome, Edge, Opera, Samsung Internet, or Firefox 108+. | new |
| `unsupportedBrowser.footnote` | Tus canciones guardadas siguen disponibles en este navegador. | Your saved songs are still available in this browser. | new |
| `unsupportedBrowser.insecure_body` | Esta página se abrió sin conexión segura (http://) y los navegadores solo activan Web MIDI en direcciones https:// o en localhost. Ábrela desde una dirección https://. | This page was opened over an insecure connection (http://), and browsers only enable Web MIDI on https:// addresses or localhost. Open it from an https:// address. | new (R29) |
| `unsupportedBrowser.insecure_compact` | Ábrela desde una dirección https:// o desde localhost. | Open it from an https:// address or from localhost. | new (R30) |
| `pedal.unsupported` | (current value) | (current value) | kept — rendered by `app.html:36` via `mapError` |
| `pedalButton.unsupported_hint` | Tu navegador no soporta Web MIDI | Your browser doesn't support Web MIDI | kept — header `title` (R16) |

The title ends with a period because the compact variant renders it inline
before the browsers sentence. No pluralization needed.
